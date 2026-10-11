import Foundation
import Capacitor
import CoreBluetooth
import CoreMIDI
import CoreAudioKit
import UIKit
import AVFoundation
import Network

/**
 * CAMARAGE · MIDI Peripheral (iOS / iPadOS)
 * --------------------------------------------------------------------------
 * Puerto del plugin Android `MidiPeripheralPlugin.java` a iOS. MISMA interfaz
 * JS (isSupported/start/stop/send + eventos midiReceived/centralConnected/
 * centralDisconnected/advertiseFailed) para que `index.html` ande SIN cambios
 * en el lado periférico (↔ Mac).
 *
 * Arquitectura (ver PLAN_iOS_iPad.md):
 *
 *   AKAI MPK49 ──DIN──> WIDI Master ──BLE──> [iPad CENTRAL]  (CoreMIDI)
 *                                                  │
 *                                            app CAMARAGE
 *                                                  │
 *                       [iPad PERIFÉRICO] ──BLE──> Mac CENTRAL (Logic/MainStage)
 *                          (CBPeripheralManager, NOTIFY)
 *
 *  LADO MAC (periférico): CBPeripheralManager crudo. Reproduce EXACTO el
 *    contrato GATT BLE-MIDI 1.0 que la Mac ya supo consumir en las pruebas con
 *    Android (mismos UUIDs, NOTIFY → la Mac lo surfacea como fuente MIDI; los
 *    writes de la Mac llegan como midiReceived). Sin encriptación (igual que
 *    Android: evita el pairing que disparaba problemas).
 *
 *  LADO WIDI (central): CoreMIDI. El usuario elige el WIDI con el picker del
 *    sistema (CABTMIDICentralViewController). CoreMIDI crea el endpoint fuente;
 *    conectamos un MIDIInputPort y reenviamos las notas del MPK a JS por el
 *    evento `instrumentMidi` (MIDI crudo, ya des-framed por CoreMIDI). El shim
 *    JS de iOS las pasa a forwardToDaw() → NOTIFY a la Mac.
 *
 *  Nota: el lado Mac NO pasa por CoreMIDI, así que la conexión con la Mac NO
 *  aparece como endpoint CoreMIDI → no hay loop entre WIDI-in y Mac-out.
 */
@objc(MidiPeripheralPlugin)
public class MidiPeripheralPlugin: CAPPlugin, CAPBridgedPlugin, CBPeripheralManagerDelegate {

    // --- Registro Capacitor 6 ---
    // En Capacitor 6 los plugins iOS se descubren porque la clase conforma
    // CAPBridgedPlugin y declara identifier/jsName/pluginMethods. Esto REEMPLAZA
    // al viejo archivo .m con CAP_PLUGIN (que en Cap 6 ya no registra solo).
    public let identifier = "MidiPeripheralPlugin"
    public let jsName = "MidiPeripheral"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startInstrument", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showWidiPicker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendToMac", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setKeepAwake", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureAudio", returnType: CAPPluginReturnPromise)
    ]
    // =========================================================================
    // SESIÓN DE AUDIO · CRÍTICO PARA ESCENARIO
    // -------------------------------------------------------------------------
    // Por defecto una WKWebView usa la categoría `ambient`, que se CALLA con el
    // interruptor de silencio del iPad y al bloquear la pantalla. En un show eso
    // significa quedarse sin música en el peor momento posible.
    //
    // `playback` hace que el audio suene igual con el switch en silencio, y con
    // el modo background `audio` en Info.plist sigue sonando con la pantalla
    // apagada. `mixWithOthers` permite que convivan otras fuentes de audio.
    //
    // Además re-activamos la sesión cuando el sistema nos la interrumpe (una
    // llamada entrante, otra app tomando el audio): sin esto, después de una
    // interrupción la app queda muda hasta reiniciarla.
    // =========================================================================

    override public func load() {
        configureAudioSession()
        // Registrar el plugin de sync por red local desde acá: este plugin SÍ se
        // carga en todos los iPads, y el registro desde MainViewController no
        // estaba corriendo ("Error loading plugin LocalSync"). Asíncrono para no
        // tocar la lista de plugins del bridge mientras la está recorriendo.
        DispatchQueue.main.async { [weak self] in
            guard let br = self?.bridge else { NSLog("[CAMARAGE] LocalSync: sin bridge"); return }
            if br.plugin(withName: "LocalSync") == nil {
                br.registerPluginInstance(LocalSyncPlugin())
            }
            NSLog("[CAMARAGE] LocalSync registrado: \(br.plugin(withName: "LocalSync") != nil)")
        }
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAudioInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            // ~5 ms de buffer: baja latencia para el click y el MIDI agendado
            try session.setPreferredIOBufferDuration(0.005)
            try session.setActive(true)
            NSLog("[CAMARAGE] AVAudioSession en .playback · buffer \(session.ioBufferDuration)s")
        } catch {
            NSLog("[CAMARAGE] no pude configurar AVAudioSession: \(error.localizedDescription)")
        }
    }

    @objc private func handleAudioInterruption(_ note: Notification) {
        guard let info = note.userInfo,
              let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let tipo = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        if tipo == .ended {
            // Volver a tomar la sesión: si no, la app queda muda tras la interrupción
            configureAudioSession()
            notifyListeners("audioSessionRestored", data: [:])
            NSLog("[CAMARAGE] interrupción de audio terminada · sesión reactivada")
        } else {
            NSLog("[CAMARAGE] audio interrumpido por el sistema")
        }
    }

    /// Permite re-asegurar la sesión desde JS (por ejemplo al tocar PLAY).
    @objc func configureAudio(_ call: CAPPluginCall) {
        configureAudioSession()
        call.resolve(["ok": true])
    }


    // BLE MIDI 1.0 spec UUIDs (idénticos a Android y al resto de la app)
    private let serviceUUID = CBUUID(string: "03B80E5A-EDE8-4B33-A751-6CE34EC4C700")
    private let charUUID    = CBUUID(string: "7772E5DB-3868-4112-A1A9-F2669D106BF3")

    // ---- Periférico (↔ Mac) ----
    private var peripheralManager: CBPeripheralManager?
    private var midiCharacteristic: CBMutableCharacteristic?
    private var subscribedCentrals: [CBCentral] = []
    private var serviceAdded = false
    private var advertising = false
    private var advertiseName = "CAMARAGE"
    private var pendingStartCall: CAPPluginCall?
    // Cola de notificaciones si el transmit buffer de BLE está lleno.
    private var notifyQueue: [Data] = []

    // ---- Central / CoreMIDI (↔ WIDI, y ↔ Mac en Plan B) ----
    private var midiClient = MIDIClientRef()
    private var inputPort = MIDIPortRef()
    private var outputPort = MIDIPortRef()   // Plan B: enviar al destino de la Mac
    private var midiStarted = false
    private var connectedSources = Set<MIDIEndpointRef>()

    // ====================================================================
    // MARK: - API JS (idéntica al plugin Android)
    // ====================================================================

    /// ¿Soporta el equipo actuar como periférico BLE MIDI? En iOS, sí (todo
    /// iPhone/iPad moderno puede hacer advertising). Devolvemos true salvo que
    /// el hardware BLE no exista.
    @objc func isSupported(_ call: CAPPluginCall) {
        // CBPeripheralManager existe en todo iOS; el estado real (encendido) se
        // valida en start(). Acá sólo confirmamos capacidad.
        call.resolve(["supported": true])
    }

    /// Arranca el periférico: abre el GATT (service + char), y al quedar
    /// registrado empieza a anunciar como `name`. Resuelve cuando el servicio
    /// quedó agregado (igual que onServiceAdded en Android).
    @objc func start(_ call: CAPPluginCall) {
        self.advertiseName = call.getString("name") ?? "CAMARAGE"
        DispatchQueue.main.async {
            // IDEMPOTENTE: si ya hay un manager vivo, NO lo destruimos ni recreamos
            // (hacerlo en cada tap rompía el XPC del BLE → "XPC connection invalid").
            if self.peripheralManager != nil {
                if self.serviceAdded && self.subscribedCentrals.isEmpty {
                    self.startAdvertisingInternal()   // re-anunciar si nadie está conectado
                }
                call.resolve()
                return
            }
            // Guardamos la call para resolverla async en didAdd (la retiene self →
            // no se libera). Resolvemos una sola vez, no hace falta keepAlive.
            self.pendingStartCall = call
            // Crear el manager dispara peripheralManagerDidUpdateState → ahí
            // agregamos el servicio y arrancamos el advertising.
            self.peripheralManager = CBPeripheralManager(delegate: self, queue: nil)
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.teardownPeripheral()
            call.resolve()
        }
    }

    /// Notifica bytes (BLE-MIDI framed, hex) a los centrales suscritos (la Mac).
    /// Igual contrato que Android: el JS ya arma el paquete con makeBleMidiPacket.
    @objc func send(_ call: CAPPluginCall) {
        guard let pm = peripheralManager, let chr = midiCharacteristic else {
            call.reject("Periférico no iniciado"); return
        }
        let hex = call.getString("data") ?? ""
        let bytes = MidiPeripheralPlugin.hexToBytes(hex)
        if bytes.isEmpty { call.resolve(); return }
        let data = Data(bytes)
        // updateValue devuelve false si el buffer está lleno → encolar y reintentar
        // en peripheralManagerIsReady(toUpdateSubscribers:).
        let ok = pm.updateValue(data, for: chr, onSubscribedCentrals: nil)
        if !ok { notifyQueue.append(data) }
        call.resolve()
    }

    // ====================================================================
    // MARK: - API JS extra para el WIDI (CoreMIDI central)
    // ====================================================================

    /// Inicializa CoreMIDI (cliente + puerto de entrada) y conecta a las fuentes
    /// MIDI ya presentes. Llamar una vez antes de presentar el picker del WIDI.
    @objc func startInstrument(_ call: CAPPluginCall) {
        if midiStarted { call.resolve(["started": true]); return }
        let clientName = "CAMARAGE" as CFString

        // Bloque de notificaciones: cuando aparece/desaparece un endpoint MIDI
        // (p.ej. al conectar el WIDI por el picker), conectamos/desconectamos.
        let status = MIDIClientCreateWithBlock(clientName, &midiClient) { [weak self] notificationPtr in
            self?.handleMIDINotification(notificationPtr)
        }
        if status != noErr {
            call.reject("MIDIClientCreate falló (\(status))"); return
        }

        let portName = "CAMARAGE In" as CFString
        // srcConnRefCon lleva el endpoint de la fuente → en el bloque sabemos de
        // QUIÉN vino el MIDI (WIDI vs Mac en Plan B) y ruteamos por nombre en JS.
        let portStatus = MIDIInputPortCreateWithBlock(midiClient, portName, &inputPort) { [weak self] packetListPtr, srcRefCon in
            self?.handlePacketList(packetListPtr, srcRefCon: srcRefCon)
        }
        if portStatus != noErr {
            call.reject("MIDIInputPortCreate falló (\(portStatus))"); return
        }

        // Puerto de salida (Plan B): para mandarle notas a la Mac por CoreMIDI.
        let outName = "CAMARAGE Out" as CFString
        MIDIOutputPortCreate(midiClient, outName, &outputPort)

        connectAllSources()
        midiStarted = true
        call.resolve(["started": true])
    }

    /// Presenta el picker del sistema para conectar el WIDI (BLE MIDI central).
    /// Una vez conectado, CoreMIDI crea la fuente y el bloque de notificaciones
    /// la enchufa al input port automáticamente.
    @objc func showWidiPicker(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let host = self.bridge?.viewController else {
                call.reject("Sin view controller"); return
            }
            let vc = CABTMIDICentralViewController()
            let nav = UINavigationController(rootViewController: vc)
            vc.navigationItem.rightBarButtonItem = UIBarButtonItem(
                barButtonSystemItem: .done, target: self, action: #selector(self.dismissPicker))
            nav.modalPresentationStyle = .formSheet
            host.present(nav, animated: true) { call.resolve() }
        }
    }

    @objc private func dismissPicker() {
        bridge?.viewController?.dismiss(animated: true)
    }

    /// Escenario: evita que la pantalla se apague / el equipo se duerma.
    @objc func setKeepAwake(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? true
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = on
            call.resolve(["keepAwake": on])
        }
    }

    // ====================================================================
    // MARK: - Periférico: setup / teardown
    // ====================================================================

    public func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        switch peripheral.state {
        case .poweredOn:
            addServiceIfNeeded()
        case .poweredOff:
            rejectPendingStart("Bluetooth apagado")
        case .unauthorized:
            rejectPendingStart("Permiso de Bluetooth denegado")
        case .unsupported:
            rejectPendingStart("BLE no soportado en este equipo")
        default:
            break
        }
    }

    private func addServiceIfNeeded() {
        guard let pm = peripheralManager, !serviceAdded else { return }

        let chr = CBMutableCharacteristic(
            type: charUUID,
            properties: [.read, .write, .writeWithoutResponse, .notify],
            value: nil,                       // dinámico (requisito para .notify)
            // Sin encriptación: la Mac se SUSCRIBE bien y el MIDI fluye (probado).
            // El flapping anterior era por el flood de Mackie (control surface en
            // Logic), no por falta de encriptación. Con encriptación, el bonding
            // quedaba a medias y la Mac no se suscribía. Si más adelante hay que
            // bondear, restaurar *_EncryptionRequired y limpiar pairings viejos.
            permissions: [.readable, .writeable]
        )
        let service = CBMutableService(type: serviceUUID, primary: true)
        service.characteristics = [chr]
        self.midiCharacteristic = chr

        // Al terminar de agregar (didAdd) arrancamos el advertising, para que la
        // Mac descubra el GATT ya completo (no uno vacío).
        pm.add(service)
    }

    public func peripheralManager(_ peripheral: CBPeripheralManager,
                                  didAdd service: CBService, error: Error?) {
        if let error = error {
            rejectPendingStart("No se pudo agregar el servicio: \(error.localizedDescription)")
            return
        }
        serviceAdded = true
        startAdvertisingInternal()
        // Resolver el start() recién ahora (GATT listo) — espejo de Android.
        if let call = pendingStartCall {
            call.resolve()
            pendingStartCall = nil
        }
    }

    private func startAdvertisingInternal() {
        guard let pm = peripheralManager, !advertising else { return }
        let adv: [String: Any] = [
            CBAdvertisementDataServiceUUIDsKey: [serviceUUID],
            CBAdvertisementDataLocalNameKey: advertiseName
        ]
        pm.startAdvertising(adv)
        advertising = true
    }

    private func stopAdvertisingInternal() {
        guard let pm = peripheralManager, advertising else { return }
        pm.stopAdvertising()
        advertising = false
    }

    private func teardownPeripheral() {
        stopAdvertisingInternal()
        if let pm = peripheralManager { pm.removeAllServices() }
        peripheralManager = nil
        midiCharacteristic = nil
        subscribedCentrals.removeAll()
        notifyQueue.removeAll()
        serviceAdded = false
    }

    private func rejectPendingStart(_ msg: String) {
        if let call = pendingStartCall {
            call.reject(msg)
            pendingStartCall = nil
        }
    }

    // ====================================================================
    // MARK: - Periférico: conexión / IO
    // ====================================================================

    public func peripheralManager(_ peripheral: CBPeripheralManager,
                                  central: CBCentral,
                                  didSubscribeTo characteristic: CBCharacteristic) {
        if !subscribedCentrals.contains(where: { $0.identifier == central.identifier }) {
            subscribedCentrals.append(central)
        }
        // La Mac ya está suscrita (es un central MIDI activo). Cortamos el
        // advertising para liberar radio (igual criterio que Android: el modo
        // low-latency saturaba la radio y tiraba el enlace). Se reanuda al salir.
        stopAdvertisingInternal()
        notifyListeners("centralConnected", data: [
            "deviceId": central.identifier.uuidString,
            "name": "Mac"
        ])
    }

    public func peripheralManager(_ peripheral: CBPeripheralManager,
                                  central: CBCentral,
                                  didUnsubscribeFrom characteristic: CBCharacteristic) {
        subscribedCentrals.removeAll { $0.identifier == central.identifier }
        if subscribedCentrals.isEmpty {
            startAdvertisingInternal()  // re-anunciar para reconectar
        }
        notifyListeners("centralDisconnected", data: [
            "deviceId": central.identifier.uuidString
        ])
    }

    /// Writes de la Mac (clock / PC / SPP / cues) → JS como hex (BLE framed).
    public func peripheralManager(_ peripheral: CBPeripheralManager,
                                  didReceiveWrite requests: [CBATTRequest]) {
        for req in requests {
            if let value = req.value, !value.isEmpty, req.characteristic.uuid == charUUID {
                notifyListeners("midiReceived", data: [
                    "value": MidiPeripheralPlugin.bytesToHex([UInt8](value))
                ])
            }
        }
        // Responder al primer request (write con respuesta).
        if let first = requests.first {
            peripheral.respond(to: first, withResult: .success)
        }
    }

    /// READ de discovery → respondemos vacío (igual que Android).
    public func peripheralManager(_ peripheral: CBPeripheralManager,
                                  didReceiveRead request: CBATTRequest) {
        request.value = Data()
        peripheral.respond(to: request, withResult: .success)
    }

    /// El buffer de transmisión se liberó → vaciar la cola de notificaciones.
    public func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
        guard let chr = midiCharacteristic else { return }
        while !notifyQueue.isEmpty {
            let data = notifyQueue[0]
            let ok = peripheral.updateValue(data, for: chr, onSubscribedCentrals: nil)
            if ok { notifyQueue.removeFirst() } else { break }
        }
    }

    // ====================================================================
    // MARK: - CoreMIDI (WIDI central)
    // ====================================================================

    private func handleMIDINotification(_ notificationPtr: UnsafePointer<MIDINotification>) {
        let notification = notificationPtr.pointee
        guard notification.messageID == .msgObjectAdded ||
              notification.messageID == .msgObjectRemoved else { return }

        notificationPtr.withMemoryRebound(to: MIDIObjectAddRemoveNotification.self, capacity: 1) { ptr in
            let n = ptr.pointee
            guard n.childType == .source else { return }
            let src = n.child
            if notification.messageID == .msgObjectAdded {
                connectSource(src)
            } else {
                MIDIPortDisconnectSource(inputPort, src)
                connectedSources.remove(src)
            }
        }
    }

    private func connectAllSources() {
        let count = MIDIGetNumberOfSources()
        for i in 0..<count {
            connectSource(MIDIGetSource(i))
        }
    }

    private func connectSource(_ src: MIDIEndpointRef) {
        guard src != 0, !connectedSources.contains(src) else { return }
        // Pasamos el endpoint como refCon para identificar la fuente en el bloque.
        let refCon = UnsafeMutableRawPointer(bitPattern: UInt(src))
        let status = MIDIPortConnectSource(inputPort, src, refCon)
        if status == noErr {
            connectedSources.insert(src)
            notifyListeners("instrumentConnected", data: [
                "name": MidiPeripheralPlugin.endpointName(src)
            ])
        }
    }

    /// Busca un destino CoreMIDI. Si `match` viene, por substring de nombre
    /// (case-insensitive); si no, el primer destino que NO sea un WIDI (para no
    /// devolverle las notas al MPK por el DIN del WIDI).
    private func findDestination(matching match: String?) -> MIDIEndpointRef {
        let count = MIDIGetNumberOfDestinations()
        var fallback: MIDIEndpointRef = 0
        for i in 0..<count {
            let dest = MIDIGetDestination(i)
            if dest == 0 { continue }
            let name = MidiPeripheralPlugin.endpointName(dest)
            if let m = match, !m.isEmpty {
                if name.range(of: m, options: .caseInsensitive) != nil { return dest }
            } else if name.range(of: "WIDI", options: .caseInsensitive) == nil {
                if fallback == 0 { fallback = dest }
            }
        }
        return fallback
    }

    /// Recibe MIDIPacketList del WIDI. Cada paquete puede traer >1 mensaje MIDI;
    /// emitimos los bytes crudos y el shim JS los parte en mensajes. CoreMIDI ya
    /// quitó el framing BLE, así que esto es MIDI 1.0 puro (status + data).
    private func handlePacketList(_ packetListPtr: UnsafePointer<MIDIPacketList>,
                                  srcRefCon: UnsafeMutableRawPointer?) {
        // Recuperar la fuente desde el refCon → nombre (WIDI vs Mac).
        var sourceName = "MIDI"
        if let refCon = srcRefCon {
            let endpoint = MIDIEndpointRef(truncatingIfNeeded: UInt(bitPattern: refCon))
            sourceName = MidiPeripheralPlugin.endpointName(endpoint)
        }
        let packetList = packetListPtr.pointee
        var packet = packetList.packet
        for _ in 0..<packetList.numPackets {
            let length = Int(packet.length)
            if length > 0 {
                // packet.data es una tupla C de 256 bytes; copiamos `length`.
                let bytes: [UInt8] = withUnsafeBytes(of: packet.data) { raw in
                    Array(raw.prefix(length))
                }
                notifyListeners("instrumentMidi", data: [
                    "value": MidiPeripheralPlugin.bytesToHex(bytes),
                    "source": sourceName
                ])
            }
            packet = MIDIPacketNext(&packet).pointee
        }
    }

    /// Plan B: envía MIDI crudo (sin framing BLE) a un destino CoreMIDI (la Mac).
    @objc func sendToMac(_ call: CAPPluginCall) {
        guard outputPort != 0 else { call.reject("CoreMIDI no iniciado"); return }
        let bytes = MidiPeripheralPlugin.hexToBytes(call.getString("data") ?? "")
        if bytes.isEmpty { call.resolve(); return }
        let dest = findDestination(matching: call.getString("dest"))
        guard dest != 0 else { call.reject("Sin destino MIDI para la Mac"); return }

        var packetList = MIDIPacketList()
        let curPacket = MIDIPacketListInit(&packetList)
        _ = MIDIPacketListAdd(&packetList, 1024, curPacket, 0, bytes.count, bytes)
        let status = MIDISend(outputPort, dest, &packetList)
        if status == noErr { call.resolve() } else { call.reject("MIDISend falló (\(status))") }
    }

    // ====================================================================
    // MARK: - Lifecycle
    // ====================================================================

    // En iOS, CAPPlugin no expone un hook tipo handleOnDestroy (eso es de Android).
    // Limpiamos en deinit (no lleva override ni public).
    deinit {
        teardownPeripheral()
        if inputPort != 0 { MIDIPortDispose(inputPort); inputPort = 0 }
        if outputPort != 0 { MIDIPortDispose(outputPort); outputPort = 0 }
        if midiClient != 0 { MIDIClientDispose(midiClient); midiClient = 0 }
        midiStarted = false
    }

    // ====================================================================
    // MARK: - Helpers
    // ====================================================================

    private static func hexToBytes(_ hex: String) -> [UInt8] {
        let clean = hex.unicodeScalars.filter {
            ("0"..."9").contains($0) || ("a"..."f").contains($0) || ("A"..."F").contains($0)
        }
        let chars = Array(String(String.UnicodeScalarView(clean)))
        var out: [UInt8] = []
        out.reserveCapacity(chars.count / 2)
        var i = 0
        while i + 1 < chars.count {
            if let b = UInt8(String(chars[i...i+1]), radix: 16) { out.append(b) }
            i += 2
        }
        return out
    }

    private static func bytesToHex(_ bytes: [UInt8]) -> String {
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    private static func endpointName(_ endpoint: MIDIEndpointRef) -> String {
        var cf: Unmanaged<CFString>?
        let status = MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &cf)
        if status == noErr, let cf = cf {
            return cf.takeRetainedValue() as String
        }
        return "MIDI"
    }
}

/**
 * View controller del bridge de Capacitor con registro EXPLÍCITO del plugin.
 *
 * El autodescubrimiento de Capacitor 6 no estaba tomando el plugin local
 * (Capacitor.Plugins.MidiPeripheral salía undefined). Registrarlo a mano en
 * capacitorDidLoad() es el método oficial y a prueba de balas. El storyboard
 * (Main.storyboard) apunta su viewController a esta clase (customClass=MainViewController).
 */
@objc(MainViewController)
public class MainViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        bridge?.registerPluginInstance(MidiPeripheralPlugin())
        // Sync por red local (sin internet). Sin esta línea iOS no lo carga y el
        // seguidor se queda "buscando maestro" para siempre.
        bridge?.registerPluginInstance(LocalSyncPlugin())
        NSLog("[CAMARAGE] LocalSync registrado: \(bridge?.plugin(withName: "LocalSync") != nil)")
        // Red de seguridad: dejamos la sesión de audio en .playback lo antes
        // posible, sin depender de que el plugin haya corrido su load().
        do {
            let s = AVAudioSession.sharedInstance()
            try s.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try s.setActive(true)
        } catch {
            NSLog("[CAMARAGE] AVAudioSession desde MainViewController falló: \(error)")
        }
    }
}


// ============================================================================
// CAMARAGE · Sync por red local (sin internet) — versión iOS
// ----------------------------------------------------------------------------
// Va en este mismo archivo a propósito: así queda dentro del target de Xcode
// sin tener que tocar el project.pbxproj.
//
// El maestro abre un servidor TCP (NWListener) en la red WiFi local y se anuncia
// por Bonjour como "_camarage._tcp". Los seguidores lo encuentran (NWBrowser) y
// se conectan directo. Sirve cualquier WiFi aunque no tenga internet.
// Una línea de texto por mensaje; el JSON lo arma index.html.
//
// Misma interfaz que Android (LocalSyncPlugin.java):
//   startServer({port?}) · startClient({host?, port?}) · send({data}) · stop() · info()
//   eventos: "message" {data} · "state" {mode, listening, connected, clients, peer}
// ============================================================================

final class LSConn {
    let conn: NWConnection
    let addr: String
    private var buffer = Data()
    var onLine: ((String) -> Void)?
    var onClose: (() -> Void)?
    private var closed = false

    init(_ c: NWConnection) {
        conn = c
        switch c.endpoint {
        case .hostPort(let host, _): addr = "\(host)"
        case .service(let name, _, _, _): addr = name
        default: addr = "?"
        }
    }

    func receive() {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            guard let self = self else { return }
            if let data = data, !data.isEmpty {
                self.buffer.append(data)
                while let idx = self.buffer.firstIndex(of: 0x0A) {
                    let lineData = self.buffer.subdata(in: self.buffer.startIndex..<idx)
                    self.buffer.removeSubrange(self.buffer.startIndex...idx)
                    if let line = String(data: lineData, encoding: .utf8), !line.isEmpty {
                        self.onLine?(line)
                    }
                }
            }
            if isComplete || error != nil { self.close(); return }
            self.receive()
        }
    }

    func send(_ line: String) {
        guard !closed, let d = (line + "\n").data(using: .utf8) else { return }
        conn.send(content: d, completion: .contentProcessed { [weak self] err in
            if err != nil { self?.close() }
        })
    }

    func close() {
        if closed { return }
        closed = true
        conn.cancel()
        onClose?()
    }
}

@objc(LocalSyncPlugin)
public class LocalSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LocalSyncPlugin"
    public let jsName = "LocalSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startServer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startClient", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise)
    ]

    private static let serviceType = "_camarage._tcp"
    private let q = DispatchQueue(label: "camarage.localsync")
    private var mode = "off"                 // off | server | client
    private var port: UInt16 = 47800
    private var gen = 0
    private var listener: NWListener?
    private var peers: [LSConn] = []
    private var upstream: LSConn?
    private var pendiente: LSConn?           // retiene la conexión mientras se establece
    private var connecting = false
    private var browser: NWBrowser?
    private var bonjourEndpoint: NWEndpoint?
    private var manualHost: String?
    private var timer: DispatchSourceTimer?
    private var candidatoIdx = 0

    private func params() -> NWParameters {
        let tcp = NWProtocolTCP.Options()
        tcp.noDelay = true
        tcp.connectionTimeout = 2
        let p = NWParameters(tls: nil, tcp: tcp)
        p.includePeerToPeer = true
        return p
    }

    // ------------------------------------------------------------ API JS

    @objc func startServer(_ call: CAPPluginCall) {
        let pt = UInt16(call.getInt("port") ?? 47800)
        q.async {
            self.stopAll()
            self.gen += 1
            let myGen = self.gen
            self.mode = "server"
            self.port = pt
            do {
                guard let nwPort = NWEndpoint.Port(rawValue: pt) else { throw NSError(domain: "LocalSync", code: 1) }
                let l = try NWListener(using: self.params(), on: nwPort)
                l.service = NWListener.Service(name: "CAMARAGE " + self.nombreEquipo(), type: LocalSyncPlugin.serviceType)
                l.newConnectionHandler = { [weak self] c in
                    guard let self = self, myGen == self.gen else { c.cancel(); return }
                    let p = LSConn(c)
                    p.onLine = { [weak self] line in self?.notifyListeners("message", data: ["data": line]) }
                    p.onClose = { [weak self, weak p] in
                        guard let self = self else { return }
                        self.q.async {
                            self.peers.removeAll { $0 === p }
                            if myGen == self.gen { self.notifyState() }
                        }
                    }
                    c.stateUpdateHandler = { [weak self, weak p] st in
                        guard let self = self else { return }
                        switch st {
                        case .ready: self.q.async { self.notifyState() }
                        case .failed(_), .cancelled: p?.close()
                        default: break
                        }
                    }
                    self.peers.append(p)
                    c.start(queue: self.q)
                    p.receive()
                }
                l.stateUpdateHandler = { [weak self] st in
                    guard let self = self else { return }
                    if case .failed(let err) = st { NSLog("[CAMARAGE] LocalSync listener falló: \(err)") }
                    self.q.async { self.notifyState() }
                }
                self.listener = l
                l.start(queue: self.q)
                self.notifyState()
                call.resolve(["port": Int(pt), "ips": self.ips()])
            } catch {
                self.mode = "off"
                call.reject("No pude abrir el puerto \(pt): \(error.localizedDescription)")
            }
        }
    }

    @objc func startClient(_ call: CAPPluginCall) {
        let pt = UInt16(call.getInt("port") ?? 47800)
        let h = (call.getString("host") ?? "").trimmingCharacters(in: .whitespaces)
        q.async {
            self.stopAll()
            self.gen += 1
            let myGen = self.gen
            self.mode = "client"
            self.port = pt
            self.manualHost = h.isEmpty ? nil : h
            // Buscar al maestro por Bonjour
            let b = NWBrowser(for: .bonjour(type: LocalSyncPlugin.serviceType, domain: nil), using: self.params())
            b.browseResultsChangedHandler = { [weak self] results, _ in
                guard let self = self, myGen == self.gen else { return }
                if let r = results.first { self.bonjourEndpoint = r.endpoint }
                self.intentarConectar(myGen)
            }
            b.start(queue: self.q)
            self.browser = b
            // Reintento cada 2 s mientras no haya conexión
            let t = DispatchSource.makeTimerSource(queue: self.q)
            t.schedule(deadline: .now(), repeating: 2.0)
            t.setEventHandler { [weak self] in self?.intentarConectar(myGen) }
            t.resume()
            self.timer = t
            self.notifyState()
            call.resolve()
        }
    }

    @objc func send(_ call: CAPPluginCall) {
        let data = call.getString("data") ?? ""
        q.async {
            if self.mode == "server" { self.peers.forEach { $0.send(data) } }
            else if self.mode == "client" { self.upstream?.send(data) }
        }
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        q.async {
            self.stopAll()
            self.notifyState()
            call.resolve()
        }
    }

    @objc func info(_ call: CAPPluginCall) {
        q.async { call.resolve(["ips": self.ips(), "mode": self.mode, "port": Int(self.port)]) }
    }

    // ------------------------------------------------------------ internos

    private func candidatos() -> [NWEndpoint] {
        var out: [NWEndpoint] = []
        guard let nwPort = NWEndpoint.Port(rawValue: port) else { return out }
        if let h = manualHost { out.append(.hostPort(host: NWEndpoint.Host(h), port: nwPort)); return out }
        if let e = bonjourEndpoint { out.append(e) }
        // Último recurso: el router/hotspot suele ser la .1 de la red
        if let ip = ips().first {
            var parts = ip.split(separator: ".").map(String.init)
            if parts.count == 4 { parts[3] = "1"; out.append(.hostPort(host: NWEndpoint.Host(parts.joined(separator: ".")), port: nwPort)) }
        }
        return out
    }

    private func intentarConectar(_ myGen: Int) {
        guard myGen == gen, mode == "client", upstream == nil, !connecting else { return }
        let lista = candidatos()
        guard !lista.isEmpty else { return }
        let ep = lista[candidatoIdx % lista.count]
        candidatoIdx += 1
        connecting = true
        let c = NWConnection(to: ep, using: params())
        let p = LSConn(c)
        pendiente = p
        p.onLine = { [weak self] line in self?.notifyListeners("message", data: ["data": line]) }
        p.onClose = { [weak self, weak p] in
            guard let self = self else { return }
            self.q.async {
                if self.upstream === p { self.upstream = nil }
                if self.pendiente === p { self.pendiente = nil }
                self.connecting = false
                if myGen == self.gen { self.notifyState() }
            }
        }
        c.stateUpdateHandler = { [weak self, weak p] st in
            guard let self = self, let p = p else { return }
            switch st {
            case .ready:
                self.q.async {
                    guard myGen == self.gen else { p.close(); return }
                    self.connecting = false
                    self.upstream = p
                    self.pendiente = nil
                    self.candidatoIdx = 0
                    self.notifyState()
                }
            case .waiting(_), .failed(_):
                p.close()
            case .cancelled:
                self.q.async { self.connecting = false }
            default: break
            }
        }
        c.start(queue: q)
        p.receive()
        // Si en 2,5 s no quedó lista, abortar y probar el próximo candidato
        q.asyncAfter(deadline: .now() + 2.5) { [weak self, weak p] in
            guard let self = self, let p = p else { return }
            if self.upstream !== p { p.close() }
        }
    }

    private func notifyState() {
        let listening = mode == "server" && listener?.state == .ready
        notifyListeners("state", data: [
            "mode": mode,
            "listening": listening,
            "connected": mode == "client" && upstream != nil,
            "clients": peers.count,
            "peer": upstream?.addr ?? ""
        ])
    }

    private func stopAll() {
        gen += 1
        mode = "off"
        timer?.cancel(); timer = nil
        browser?.cancel(); browser = nil
        listener?.cancel(); listener = nil
        let ps = peers; peers = []
        ps.forEach { $0.close() }
        let u = upstream; upstream = nil
        u?.close()
        let pe = pendiente; pendiente = nil
        pe?.close()
        bonjourEndpoint = nil
        connecting = false
        candidatoIdx = 0
    }

    private func nombreEquipo() -> String {
        var name = ""
        DispatchQueue.main.sync { name = UIDevice.current.name }
        return name
    }

    private func ips() -> [String] {
        var out: [String] = []
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return out }
        defer { freeifaddrs(ifaddr) }
        var ptr: UnsafeMutablePointer<ifaddrs>? = first
        while let p = ptr {
            let flags = Int32(p.pointee.ifa_flags)
            if let addr = p.pointee.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET),
               (flags & IFF_UP) != 0, (flags & IFF_LOOPBACK) == 0 {
                let name = String(cString: p.pointee.ifa_name)
                if name.hasPrefix("en") || name.hasPrefix("bridge") {
                    var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                    if getnameinfo(addr, socklen_t(addr.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                        out.append(String(cString: host))
                    }
                }
            }
            ptr = p.pointee.ifa_next
        }
        return out
    }
}
