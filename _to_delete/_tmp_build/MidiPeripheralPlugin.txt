package com.camarage.live;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.content.Context;
import android.os.Build;
import android.os.ParcelUuid;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * CAMARAGE · MIDI Peripheral
 *
 * Hace que el celu actúe como periférico BLE MIDI (GATT server + advertising),
 * en vez de central. Así el Mac (Logic/MainStage) se conecta a él como central
 * desde Audio MIDI Setup, igual que a los WIDI. Esto permite tener N dispositivos
 * BLE (2x WIDI + celu) sin el conflicto "advertise vs central" del Bluetooth del Mac.
 *
 * Servicio/característica = spec BLE MIDI 1.0 (mismos UUIDs que usa el resto de la app).
 * Los writes entrantes del Mac (incl. Clock, PC, Notes) se reenvían a JS como hex,
 * y parseBleMidiPacket() los procesa igual que en modo central.
 */
@CapacitorPlugin(
    name = "MidiPeripheral",
    permissions = {
        @Permission(
            alias = "blePeripheral",
            strings = {
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT
            }
        )
    }
)
public class MidiPeripheralPlugin extends Plugin {

    private static final String TAG = "CamarageMidiPeri";

    private static final UUID SERVICE_UUID = UUID.fromString("03b80e5a-ede8-4b33-a751-6ce34ec4c700");
    private static final UUID CHAR_UUID    = UUID.fromString("7772e5db-3868-4112-a1a9-f2669d106bf3");
    private static final UUID CCCD_UUID    = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private BluetoothGattServer gattServer;
    private BluetoothGattCharacteristic midiCharacteristic;
    private BluetoothLeAdvertiser advertiser;
    private boolean advertising = false;

    private final Set<BluetoothDevice> connectedDevices =
        Collections.synchronizedSet(new HashSet<BluetoothDevice>());

    private int rxCount = 0;   // diagnóstico: writes entrantes del central (Mac)
    private PluginCall pendingStartCall;   // resuelve cuando el servicio quedó registrado

    // ---------------------------------------------------------------- API JS

    @PluginMethod
    public void isSupported(PluginCall call) {
        boolean ok = false;
        try {
            BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
            if (bm != null && bm.getAdapter() != null) {
                ok = bm.getAdapter().isMultipleAdvertisementSupported();
            }
        } catch (Exception e) {
            ok = false;
        }
        JSObject ret = new JSObject();
        ret.put("supported", ok);
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31 && getPermissionState("blePeripheral") != PermissionState.GRANTED) {
            requestPermissionForAlias("blePeripheral", call, "permsCallback");
            return;
        }
        startInternal(call);
    }

    @PermissionCallback
    private void permsCallback(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31 && getPermissionState("blePeripheral") != PermissionState.GRANTED) {
            call.reject("Permisos BLE (advertise/connect) denegados");
            return;
        }
        startInternal(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        teardown();
        call.resolve();
    }

    /**
     * Forzar el brillo de la pantalla mientras la app está abierta.
     * level: 0.0..1.0 → brillo fijo (1.0 = máximo, "modo escenario").
     * level < 0      → vuelve al brillo automático del sistema.
     * No requiere permiso WRITE_SETTINGS porque solo afecta a esta ventana.
     */
    @PluginMethod
    public void setBrightness(final PluginCall call) {
        final float level = call.getFloat("level", -1f);
        final android.app.Activity act = getActivity();
        if (act == null) { call.resolve(); return; }
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                try {
                    android.view.Window w = act.getWindow();
                    android.view.WindowManager.LayoutParams lp = w.getAttributes();
                    lp.screenBrightness = (level < 0f)
                        ? android.view.WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                        : Math.max(0.05f, Math.min(1.0f, level));
                    w.setAttributes(lp);
                } catch (Exception e) {
                    Log.w("MidiPeripheral", "setBrightness falló: " + e.getMessage());
                }
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void send(PluginCall call) {
        if (gattServer == null || midiCharacteristic == null) {
            call.reject("Periférico no iniciado");
            return;
        }
        String hex = call.getString("data", "");
        byte[] bytes = hexToBytes(hex);
        if (bytes.length == 0) { call.resolve(); return; }
        try {
            midiCharacteristic.setValue(bytes);
            synchronized (connectedDevices) {
                for (BluetoothDevice d : connectedDevices) {
                    try {
                        gattServer.notifyCharacteristicChanged(d, midiCharacteristic, false);
                    } catch (SecurityException ignore) {}
                }
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("send falló: " + e.getMessage());
        }
    }

    // ---------------------------------------------------------------- interno

    private void startInternal(PluginCall call) {
        try {
            Context ctx = getContext();
            BluetoothManager bm = (BluetoothManager) ctx.getSystemService(Context.BLUETOOTH_SERVICE);
            if (bm == null) { call.reject("BluetoothManager no disponible"); return; }
            BluetoothAdapter adapter = bm.getAdapter();
            if (adapter == null || !adapter.isEnabled()) { call.reject("Bluetooth apagado"); return; }

            advertiser = adapter.getBluetoothLeAdvertiser();
            if (advertiser == null) { call.reject("Advertising BLE no soportado en este equipo"); return; }

            String name = call.getString("name", "CAMARAGE");
            try { adapter.setName(name); } catch (SecurityException ignore) {}

            // Si ya estaba corriendo, reiniciar limpio
            teardown();

            // --- GATT server ---
            gattServer = bm.openGattServer(ctx, gattServerCallback);
            if (gattServer == null) { call.reject("No se pudo abrir el GATT server"); return; }

            BluetoothGattService service =
                new BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY);

            midiCharacteristic = new BluetoothGattCharacteristic(
                CHAR_UUID,
                BluetoothGattCharacteristic.PROPERTY_READ
                    | BluetoothGattCharacteristic.PROPERTY_WRITE
                    | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE
                    | BluetoothGattCharacteristic.PROPERTY_NOTIFY,
                // Sin encriptación: la ruta elegida es una app de Mac (CoreBluetooth)
                // como central, que NO necesita el requisito de la spec de Apple. Así
                // evitamos el bonding/pairing (que además disparaba el WIDI). Si en el
                // futuro se vuelve al driver nativo de Apple, restaurar *_ENCRYPTED.
                BluetoothGattCharacteristic.PERMISSION_READ
                    | BluetoothGattCharacteristic.PERMISSION_WRITE
            );
            BluetoothGattDescriptor cccd = new BluetoothGattDescriptor(
                CCCD_UUID,
                BluetoothGattDescriptor.PERMISSION_READ | BluetoothGattDescriptor.PERMISSION_WRITE
            );
            midiCharacteristic.addDescriptor(cccd);
            service.addCharacteristic(midiCharacteristic);

            // Guardar el call y arrancar el advertising RECIÉN en onServiceAdded, para
            // garantizar que el GATT esté registrado ANTES de anunciar (y por ende antes
            // de que el Mac conecte y haga discovery). Si se anunciaba antes, el Mac
            // descubría un GATT vacío y cacheaba "este device no tiene servicio MIDI".
            pendingStartCall = call;
            gattServer.addService(service);  // dispara onServiceAdded → ahí se anuncia
        } catch (Exception e) {
            Log.e(TAG, "startInternal error", e);
            call.reject("Error iniciando periférico: " + e.getMessage());
        }
    }

    private void startAdvertisingInternal() {
        if (advertiser == null || advertising) return;
        AdvertiseSettings settings = new AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true)
            .setTimeout(0)
            .build();

        // El UUID de servicio BLE MIDI es de 128 bits (16 bytes) → ocupa casi todo
        // el payload de 31 bytes, así que el nombre va en el scan response.
        AdvertiseData advData = new AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .addServiceUuid(new ParcelUuid(SERVICE_UUID))
            .build();
        AdvertiseData scanResponse = new AdvertiseData.Builder()
            .setIncludeDeviceName(true)
            .build();

        try {
            advertiser.startAdvertising(settings, advData, scanResponse, advertiseCallback);
            advertising = true;
        } catch (Exception e) {
            Log.e(TAG, "startAdvertisingInternal error", e);
        }
    }

    private void stopAdvertisingInternal() {
        if (advertiser == null || !advertising) return;
        try { advertiser.stopAdvertising(advertiseCallback); } catch (Exception ignore) {}
        advertising = false;
    }

    private void teardown() {
        stopAdvertisingInternal();
        try { if (gattServer != null) gattServer.close(); }
        catch (Exception ignore) {}
        gattServer = null;
        midiCharacteristic = null;
        connectedDevices.clear();
    }

    @Override
    protected void handleOnDestroy() {
        teardown();
        super.handleOnDestroy();
    }

    // ---------------------------------------------------------------- callbacks

    private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {
        @Override
        public void onStartSuccess(AdvertiseSettings settingsInEffect) {
            Log.i(TAG, "Advertising activo");
        }
        @Override
        public void onStartFailure(int errorCode) {
            Log.e(TAG, "Advertising falló, code=" + errorCode);
            JSObject ev = new JSObject();
            ev.put("errorCode", errorCode);
            notifyListeners("advertiseFailed", ev);
        }
    };

    private final BluetoothGattServerCallback gattServerCallback = new BluetoothGattServerCallback() {
        @Override
        public void onServiceAdded(int status, BluetoothGattService service) {
            Log.i(TAG, "Servicio agregado status=" + status + " uuid=" + service.getUuid());
            // Recién ahora que el GATT está listo, arrancamos el advertising.
            startAdvertisingInternal();
            if (pendingStartCall != null) { pendingStartCall.resolve(); pendingStartCall = null; }
        }

        @Override
        public void onMtuChanged(BluetoothDevice device, int mtu) {
            Log.i(TAG, "MTU negociado=" + mtu);
        }

        @Override
        public void onConnectionStateChange(BluetoothDevice device, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                connectedDevices.add(device);
                // Cortar el advertising mientras hay un central conectado: el modo
                // low-latency satura la radio y tira el enlace activo, y además el Mac
                // re-descubre el advert y reconecta en loop. Se reanuda al desconectar.
                stopAdvertisingInternal();
                Log.i(TAG, "Central conectado (status=" + status + ") — advertising OFF");
                JSObject ev = new JSObject();
                ev.put("deviceId", device.getAddress());
                try { ev.put("name", device.getName()); } catch (SecurityException ignore) {}
                notifyListeners("centralConnected", ev);
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                connectedDevices.remove(device);
                Log.i(TAG, "Central desconectado (status=" + status + ") — re-anuncio");
                // status: 0/8=timeout, 19=remote, 22=local. Lo logueamos para diagnóstico.
                if (connectedDevices.isEmpty()) startAdvertisingInternal();
                JSObject ev = new JSObject();
                ev.put("deviceId", device.getAddress());
                ev.put("status", status);
                notifyListeners("centralDisconnected", ev);
            }
        }

        @Override
        public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId,
                BluetoothGattCharacteristic characteristic, boolean preparedWrite,
                boolean responseNeeded, int offset, byte[] value) {
            if (CHAR_UUID.equals(characteristic.getUuid()) && value != null && value.length > 0) {
                rxCount++;
                if (rxCount <= 5 || rxCount % 25 == 0) {
                    Log.i(TAG, "RX write #" + rxCount + " len=" + value.length + " " + bytesToHex(value));
                }
                JSObject ev = new JSObject();
                ev.put("value", bytesToHex(value));
                notifyListeners("midiReceived", ev);
            }
            if (responseNeeded) {
                try { gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value); }
                catch (SecurityException ignore) {}
            }
        }

        @Override
        public void onCharacteristicReadRequest(BluetoothDevice device, int requestId, int offset,
                BluetoothGattCharacteristic characteristic) {
            Log.i(TAG, "READ característica (discovery) offset=" + offset);
            try { gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, new byte[0]); }
            catch (SecurityException ignore) {}
        }

        @Override
        public void onDescriptorWriteRequest(BluetoothDevice device, int requestId,
                BluetoothGattDescriptor descriptor, boolean preparedWrite, boolean responseNeeded,
                int offset, byte[] value) {
            // El central (Mac) escribe el CCCD para suscribirse a notificaciones.
            Log.i(TAG, "CCCD subscribe de " + device.getAddress() + " val=" + bytesToHex(value));
            if (responseNeeded) {
                try { gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value); }
                catch (SecurityException ignore) {}
            }
        }

        @Override
        public void onDescriptorReadRequest(BluetoothDevice device, int requestId, int offset,
                BluetoothGattDescriptor descriptor) {
            Log.i(TAG, "READ descriptor (CCCD discovery) offset=" + offset);
            byte[] reply = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE;
            try { gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, reply); }
            catch (SecurityException ignore) {}
        }
    };

    // ---------------------------------------------------------------- helpers

    private static byte[] hexToBytes(String hex) {
        if (hex == null) return new byte[0];
        String clean = hex.replaceAll("[^0-9a-fA-F]", "");
        int len = clean.length() / 2;
        byte[] out = new byte[len];
        for (int i = 0; i < len; i++) {
            out[i] = (byte) Integer.parseInt(clean.substring(i * 2, i * 2 + 2), 16);
        }
        return out;
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02x", b & 0xFF));
        return sb.toString();
    }
}
