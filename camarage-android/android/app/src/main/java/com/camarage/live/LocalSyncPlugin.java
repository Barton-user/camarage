package com.camarage.live;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * CAMARAGE · Sync por red local (sin internet)
 * --------------------------------------------------------------------------
 * El maestro abre un servidor TCP en la red WiFi local (sirve cualquier WiFi,
 * aunque no tenga salida a internet: un router suelto o el hotspot del A56) y
 * se anuncia por Bonjour/mDNS como "_camarage._tcp". Los seguidores lo
 * encuentran solos y se conectan directo. Nada pasa por internet.
 *
 * Protocolo: una línea de texto por mensaje (JSON armado por index.html). El
 * contenido no le importa a este plugin: solo transporta líneas.
 *   maestro  → todos los seguidores conectados
 *   seguidor → maestro
 *
 * Misma interfaz JS que la versión iOS (LocalSyncPlugin en Swift):
 *   startServer({port?}) · startClient({host?, port?}) · send({data}) · stop() · info()
 *   eventos: "message" {data} · "state" {mode, listening, connected, clients, peer}
 */
@CapacitorPlugin(name = "LocalSync")
public class LocalSyncPlugin extends Plugin {

    private static final String TAG = "CamarageLocalSync";
    private static final String SERVICE_TYPE = "_camarage._tcp";
    private static final int DEFAULT_PORT = 47800;

    private class Peer {
        final Socket sock;
        final BufferedWriter out;
        final String addr;
        Peer(Socket s) throws Exception {
            sock = s;
            out = new BufferedWriter(new OutputStreamWriter(s.getOutputStream(), StandardCharsets.UTF_8));
            addr = s.getInetAddress() != null ? s.getInetAddress().getHostAddress() : "?";
        }
        synchronized void write(String line) {
            try { out.write(line); out.write('\n'); out.flush(); }
            catch (Exception e) { close(); }
        }
        void close() { try { sock.close(); } catch (Exception ignored) {} }
    }

    private volatile String mode = "off";          // off | server | client
    private volatile int port = DEFAULT_PORT;
    private ServerSocket server;
    private final List<Peer> peers = new CopyOnWriteArrayList<>();
    private volatile Peer upstream;                 // conexión al maestro (modo client)
    private volatile boolean connecting = false;
    private volatile String manualHost = null;
    private volatile String resolvedHost = null;    // encontrado por mDNS
    private volatile int resolvedPort = DEFAULT_PORT;
    private volatile boolean resolving = false;
    private volatile int gen = 0;                   // cada start invalida lo anterior

    private NsdManager nsd;
    private NsdManager.RegistrationListener regListener;
    private NsdManager.DiscoveryListener discListener;
    private WifiManager.MulticastLock mlock;
    private final ExecutorService sendExec = Executors.newSingleThreadExecutor();
    private ScheduledExecutorService sched;

    // ---------------------------------------------------------------- API JS

    @PluginMethod
    public void startServer(PluginCall call) {
        stopAll();
        final int myGen = ++gen;
        mode = "server";
        port = call.getInt("port", DEFAULT_PORT);
        try {
            server = new ServerSocket();
            server.setReuseAddress(true);
            server.bind(new InetSocketAddress(port));
        } catch (Exception e) {
            mode = "off";
            call.reject("No pude abrir el puerto " + port + ": " + e.getMessage());
            return;
        }
        final ServerSocket ss = server;
        new Thread(() -> {
            while (myGen == gen && !ss.isClosed()) {
                try {
                    Socket s = ss.accept();
                    s.setTcpNoDelay(true);
                    Peer p = new Peer(s);
                    peers.add(p);
                    notifyState();
                    leer(p, myGen, false);
                } catch (Exception e) {
                    if (myGen == gen) Log.w(TAG, "accept: " + e.getMessage());
                }
            }
        }, "camarage-sync-accept").start();
        anunciar();
        notifyState();
        JSObject r = new JSObject();
        r.put("port", port);
        r.put("ips", ips());
        call.resolve(r);
    }

    @PluginMethod
    public void startClient(PluginCall call) {
        stopAll();
        final int myGen = ++gen;
        mode = "client";
        port = call.getInt("port", DEFAULT_PORT);
        String h = call.getString("host", "");
        manualHost = (h != null && !h.trim().isEmpty()) ? h.trim() : null;
        tomarMulticast();
        buscar();
        sched = Executors.newSingleThreadScheduledExecutor();
        sched.scheduleWithFixedDelay(() -> intentarConectar(myGen), 0, 2, TimeUnit.SECONDS);
        notifyState();
        call.resolve();
    }

    @PluginMethod
    public void send(PluginCall call) {
        final String data = call.getString("data", "");
        final String m = mode;
        sendExec.execute(() -> {
            if ("server".equals(m)) {
                for (Peer p : peers) p.write(data);
            } else if ("client".equals(m)) {
                Peer u = upstream;
                if (u != null) u.write(data);
            }
        });
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopAll();
        notifyState();
        call.resolve();
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        r.put("ips", ips());
        r.put("mode", mode);
        r.put("port", port);
        call.resolve(r);
    }

    @Override
    protected void handleOnDestroy() {
        stopAll();
        super.handleOnDestroy();
    }

    // ---------------------------------------------------------------- internos

    private void leer(final Peer p, final int myGen, final boolean esUpstream) {
        new Thread(() -> {
            try (BufferedReader in = new BufferedReader(
                    new InputStreamReader(p.sock.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while (myGen == gen && (line = in.readLine()) != null) {
                    if (line.isEmpty()) continue;
                    JSObject ev = new JSObject();
                    ev.put("data", line);
                    notifyListeners("message", ev);
                }
            } catch (Exception ignored) {
            } finally {
                p.close();
                if (esUpstream) { if (upstream == p) upstream = null; }
                else peers.remove(p);
                if (myGen == gen) notifyState();
            }
        }, "camarage-sync-read").start();
    }

    private void intentarConectar(int myGen) {
        if (myGen != gen || upstream != null || connecting) return;
        connecting = true;
        try {
            List<String> candidatos = new ArrayList<>();
            if (manualHost != null) candidatos.add(manualHost);
            if (resolvedHost != null && !candidatos.contains(resolvedHost)) candidatos.add(resolvedHost);
            String gw = gateway();
            if (manualHost == null && gw != null && !candidatos.contains(gw)) candidatos.add(gw);
            for (String host : candidatos) {
                if (myGen != gen) return;
                int pt = host.equals(resolvedHost) ? resolvedPort : port;
                try {
                    Socket s = new Socket();
                    s.connect(new InetSocketAddress(host, pt), 1500);
                    s.setTcpNoDelay(true);
                    Peer p = new Peer(s);
                    if (myGen != gen) { p.close(); return; }
                    upstream = p;
                    notifyState();
                    leer(p, myGen, true);
                    return;
                } catch (Exception e) {
                    Log.d(TAG, "no conecta a " + host + ": " + e.getMessage());
                }
            }
        } finally {
            connecting = false;
        }
    }

    private void anunciar() {
        try {
            nsd = (NsdManager) getContext().getSystemService(Context.NSD_SERVICE);
            NsdServiceInfo info = new NsdServiceInfo();
            info.setServiceName("CAMARAGE " + Build.MODEL);
            info.setServiceType(SERVICE_TYPE);
            info.setPort(port);
            regListener = new NsdManager.RegistrationListener() {
                public void onServiceRegistered(NsdServiceInfo i) { Log.i(TAG, "anunciado: " + i.getServiceName()); }
                public void onRegistrationFailed(NsdServiceInfo i, int code) { Log.w(TAG, "anuncio falló " + code); }
                public void onServiceUnregistered(NsdServiceInfo i) {}
                public void onUnregistrationFailed(NsdServiceInfo i, int code) {}
            };
            nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, regListener);
        } catch (Exception e) {
            Log.w(TAG, "mDNS no disponible: " + e.getMessage());
        }
    }

    private void buscar() {
        try {
            nsd = (NsdManager) getContext().getSystemService(Context.NSD_SERVICE);
            discListener = new NsdManager.DiscoveryListener() {
                public void onDiscoveryStarted(String t) {}
                public void onDiscoveryStopped(String t) {}
                public void onStartDiscoveryFailed(String t, int c) { Log.w(TAG, "discovery falló " + c); }
                public void onStopDiscoveryFailed(String t, int c) {}
                public void onServiceLost(NsdServiceInfo i) {}
                public void onServiceFound(NsdServiceInfo i) {
                    if (resolving || resolvedHost != null) return;
                    resolving = true;
                    try {
                        nsd.resolveService(i, new NsdManager.ResolveListener() {
                            public void onResolveFailed(NsdServiceInfo x, int c) { resolving = false; }
                            public void onServiceResolved(NsdServiceInfo x) {
                                resolving = false;
                                InetAddress a = x.getHost();
                                if (a != null) {
                                    resolvedHost = a.getHostAddress();
                                    resolvedPort = x.getPort();
                                    Log.i(TAG, "maestro encontrado: " + resolvedHost + ":" + resolvedPort);
                                }
                            }
                        });
                    } catch (Exception e) { resolving = false; }
                }
            };
            nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discListener);
        } catch (Exception e) {
            Log.w(TAG, "discovery no disponible: " + e.getMessage());
        }
    }

    private void tomarMulticast() {
        try {
            WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                mlock = wm.createMulticastLock("camarage-sync");
                mlock.setReferenceCounted(false);
                mlock.acquire();
            }
        } catch (Exception ignored) {}
    }

    /** IP del router/hotspot al que está conectado este equipo (último recurso). */
    private String gateway() {
        try {
            WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm == null || wm.getDhcpInfo() == null) return null;
            int g = wm.getDhcpInfo().gateway;
            if (g == 0) return null;
            return (g & 0xff) + "." + ((g >> 8) & 0xff) + "." + ((g >> 16) & 0xff) + "." + ((g >> 24) & 0xff);
        } catch (Exception e) { return null; }
    }

    private JSArray ips() {
        JSArray arr = new JSArray();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address) arr.put(a.getHostAddress());
                }
            }
        } catch (Exception ignored) {}
        return arr;
    }

    private void notifyState() {
        JSObject st = new JSObject();
        st.put("mode", mode);
        st.put("listening", "server".equals(mode) && server != null && !server.isClosed());
        st.put("connected", "client".equals(mode) && upstream != null);
        st.put("clients", peers.size());
        Peer u = upstream;
        st.put("peer", u != null ? u.addr : "");
        notifyListeners("state", st);
    }

    private void stopAll() {
        gen++;
        mode = "off";
        if (sched != null) { sched.shutdownNow(); sched = null; }
        try { if (server != null) server.close(); } catch (Exception ignored) {}
        server = null;
        for (Peer p : peers) p.close();
        peers.clear();
        Peer u = upstream; upstream = null;
        if (u != null) u.close();
        try { if (nsd != null && regListener != null) nsd.unregisterService(regListener); } catch (Exception ignored) {}
        try { if (nsd != null && discListener != null) nsd.stopServiceDiscovery(discListener); } catch (Exception ignored) {}
        regListener = null; discListener = null;
        resolvedHost = null; resolving = false; connecting = false;
        try { if (mlock != null && mlock.isHeld()) mlock.release(); } catch (Exception ignored) {}
        mlock = null;
    }
}
