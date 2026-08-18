import Foundation
import Capacitor
import CoreBluetooth
import CoreMIDI
import CoreAudioKit
import UIKit
import AVFoundation

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
