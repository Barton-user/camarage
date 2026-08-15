# CAMARAGE · PLAN MAESTRO — Migración a iPad / iOS

> Documento para arrancar la **versión iOS de CAMARAGE** en una sesión nueva.
> Creado: 20 jun 2026, tras agotar el camino Android (ver CONTEXT.md para el detalle).
> Decisión: **pivotear el dispositivo de escenario del Samsung A56 a un iPad Pro.**

---

## 1. Resumen ejecutivo — por qué pivoteamos a iPad

Después de una sesión maratónica intentando que el celular Android (Samsung A56)
funcione como puente MIDI inalámbrico entre el WIDI/MPK y la Mac (Logic + MainStage),
chocamos contra **dos bugs de plataforma que NO se arreglan desde nuestra app**:

1. **Android como periférico BLE es inestable** en el A56 (firmware Android 16 / One UI 8
   nuevo): el GATT server se cae, y el **dual-role** (central del WIDI + periférico de la
   Mac a la vez) tira la conexión con la Mac al conectar el WIDI (contención de radio).
2. **macOS no surfacea** como MIDI los *writes* que recibe de un central Android (cuando
   la Mac es periférico). Sí surfacea las **notificaciones** (notify) de un periférico.

**El hallazgo clave** (que define la arquitectura iOS): en modo periférico, cuando el
dispositivo **NOTIFICA**, macOS SÍ lo recibe como fuente MIDI — lo **probamos**: los
Start/Stop del celu aparecieron en MIDI Monitor de la Mac desde "CAMARAGE Bluetooth".
El problema nunca fue el formato (verificado spec-perfecto) ni el timestamp — fue el
**rol + la inestabilidad de Android**.

**El iPad resuelve ambos** porque:
- **iPad ↔ Mac por BLE MIDI es Apple-con-Apple**: la ruta BLE MIDI mejor soportada que
  existe. Estable, y la Mac surfacea correctamente lo que manda el iPad.
- **iOS maneja BLE MIDI nativo con CoreMIDI**, robusto y multi-conexión. El dual-role
  (periférico de la Mac + central del WIDI) lo banca mucho mejor que el Samsung.
- **iPad ↔ WIDI** anda bien (CME recomienda iOS explícitamente para WIDI).
- **Pantalla 12,9"** = ideal para letras en escenario.

---

## 2. Hardware objetivo

- **Dispositivo de escenario:** iPad Pro 12,9" **3ra generación** (2018, chip A12X Bionic).
  - Model: MTEL2TY/A · iPadOS **26.3** · 64 GB (≈17 GB libres).
  - Bluetooth: `EC:2C:E2:A5:A2:F2`.
- **Mac:** MacBook Pro de Patricio (Logic Pro X + MainStage). Address BLE vista en sesiones
  previas: `9C:3E:53:80:13:40`.
- **Instrumento:** AKAI MPK49 con **WIDI Master** en su MIDI IN+OUT (DIN). Address WIDI:
  `10:2E:AB:D6:8F:64`.
- **Posible 2º instrumento:** WIDI Jack (BLE + DIN/TRS; USB-C solo alimentación, sin datos).

---

## 3. Qué aprendimos en Android (reutilizable)

### Funciona y se conserva (es todo HTML/JS, se porta directo a iOS)
- **Toda la app**: vistas (Cantante/Bajista/Baterista), motor de sync anclado a ticks,
  parser BLE MIDI v2 (state machine spec 1.0), **soporte SPP (0xF2)**, scroll de letras
  por cues, metrónomo, editor de setlist, sync con Supabase, login.
- **UI del modal de Conexión** ya mejorada: tarjetas de estado DAW/Instrumento, panel
  "MIDI through" (validación en vivo del ruteo), acordeones colapsables.
- **Lógica de router**: `forwardToDaw` (reenvía MIDI del instrumento al DAW),
  `parseBleMidiPacket(bytes, handler)` con handler configurable, `sendMidi`, `makeBleMidiPacket`.
- **Constantes BLE MIDI** (idénticas en iOS): servicio `03b80e5a-ede8-4b33-a751-6ce34ec4c700`,
  característica `7772e5db-3868-4112-a1a9-f2669d106bf3`. Formato de paquete: `[0x80|tsHigh]
  [0x80|tsLow][MIDI...]`, timestamp 13-bit ms.

### Datos técnicos confirmados (no repetir el camino)
- Formato de paquete BLE MIDI verificado **spec-perfecto** byte a byte.
- macOS recibe pero **no surfacea writes de central Android**; **sí surfacea notify de periférico**.
- En periférico, macOS hace handshake completo (MTU 517, READ característica, CCCD subscribe,
  y la Mac hasta escribe SysEx al dispositivo).
- Latencia objetivo: BLE MIDI Apple es de pocos ms; alcanza para tocar piano en MainStage.

---

## 4. Arquitectura objetivo en iOS

**Topología elegida (la que PROBAMOS que surfacea + estable en Apple):**

```
        AKAI MPK49
          │ DIN (in+out)
       WIDI Master ──BLE──┐
                          │  (iPad = CENTRAL del WIDI, vía CoreMIDI/CABTMIDICentral)
                          ▼
                       iPad Pro  ───BLE (iPad = PERIFÉRICO, advertise)───►  Mac (CENTRAL)
                     app CAMARAGE                                            │
                     (router + sync)                                  Logic + MainStage
```

- **iPad = PERIFÉRICO BLE MIDI** (advertise). La **Mac se conecta como central** y se
  suscribe. El iPad **NOTIFICA** las notas del MPK → macOS las **surfacea como fuente
  MIDI** → MainStage/Logic las reciben. (Esta es la dirección que probamos OK.)
- **Mac escribe** clock/PC/cues al iPad → el iPad los recibe (sync de letras). En iOS esto
  llega como MIDI entrante por CoreMIDI desde el endpoint de la Mac.
- **iPad = CENTRAL del WIDI** (se conecta al WIDI). Recibe las notas del MPK por CoreMIDI.
- **App rutea**: notas del MPK (del WIDI) → NOTIFY a la Mac; clock de la Mac → motor de sync.
- **iOS administra las dos conexiones BLE de forma confiable** (lo que el A56 no podía).

> Nota: en iOS no hace falta un GATT server "a mano" como en Android. CoreMIDI + los
> controllers de CoreAudioKit manejan el transporte BLE; la app solo usa puertos CoreMIDI.

**Plan B de topología (si la #elegida diera problemas):** iPad central → Mac periférico
(la Mac hace Advertise, el iPad conecta). Apple-con-Apple debería surfacear en ambos
sentidos; probar las dos y quedarse con la estable.

---

## 5. Plan de implementación (fases)

### Fase 0 — Setup del proyecto iOS
- En la carpeta `camarage-android/` (proyecto Capacitor) o un proyecto Capacitor unificado:
  `npx cap add ios` → genera el proyecto Xcode.
- Copiar `www/` (la app HTML/JS ya está ahí). `npx cap sync ios`.
- Abrir en **Xcode** (Mac de Patricio), configurar signing (Apple ID gratis sirve para
  desarrollo en dispositivo propio), y correr en el iPad.
- Validar que la app **carga y se ve** en el iPad (UI, login, sync Supabase). Esto debería
  andar sin tocar nada (es WebView).

### Fase 1 — Plugin nativo iOS de MIDI (Swift + CoreMIDI)
Escribir un plugin Capacitor en Swift que reemplace al `MidiPeripheralPlugin.java`:
- **CoreMIDI**: crear `MIDIClient`, `MIDIInputPort`, y endpoints.
- **iPad como periférico BLE MIDI**: usar la API de BLE MIDI de iOS. Opciones:
  - `CABTMIDILocalPeripheralViewController` (CoreAudioKit) para que el iPad anuncie y la
    Mac se conecte, **o** la API programática equivalente.
  - Una vez conectado, la Mac aparece como source+destination en CoreMIDI.
- **iPad como central del WIDI**: `CABTMIDICentralViewController` (UI del sistema para
  elegir el WIDI) **o** conexión programática. El WIDI aparece como CoreMIDI source.
- **Puente a JS** (mismos eventos que el plugin Android, para reutilizar la lógica):
  - Evento `midiReceived` (con identidad de la fuente: Mac vs WIDI) → la app rutea.
  - Método `send(data)` → escribe al destino de la Mac (= notify).
  - Eventos de estado de conexión.
- **Reutilizar el parser y el router** de `index.html` tal cual.

### Fase 2 — Ruteo y sync sobre iOS
- Conectar: iPad anuncia (periférico) → Mac conecta; iPad conecta al WIDI (central).
- Notas del WIDI → `forwardToDaw` → `send()` (notify a la Mac) → MainStage/Logic.
- Clock/PC/cues de la Mac → `midiReceived` → `parseBleMidiPacket` → sync de letras.
- Verificar el **dual-role estable** en iOS (debería andar; era el cuello de botella Android).

### Fase 3 — Validación end-to-end
- MPK → suena en MainStage (canal 2), latencia tolerable para piano.
- Play en Logic → clock + cambios de canción (PC) + SPP llegan al iPad (letras se mueven).
- Estabilidad sostenida (sin flapping) con las dos conexiones activas.
- Separación por canal (MainStage ch2, Logic ch1) como en el plan original.

### Fase 4 — Pulido
- Mantener el filtro de active sensing en el forward.
- UI: las tarjetas de estado, el panel "MIDI through" y los acordeones ya están.
- Backup del proyecto Logic + Controller Assignments (como en CONTEXT.md).

---

## 6. Qué se reutiliza vs qué es nuevo

| Componente | Estado |
|---|---|
| App HTML/JS (vistas, sync, parser, SPP, router, UI) | **Se reutiliza tal cual** |
| Constantes/format BLE MIDI | **Se reutilizan** |
| Supabase / login / setlists | **Se reutilizan** |
| `MidiPeripheralPlugin.java` (Android) | Se queda en el repo; **no se usa en iOS** |
| Capa BLE→MIDI | **NUEVA**: plugin Swift + CoreMIDI |
| Setup de build | **NUEVO**: Capacitor iOS + Xcode |

---

## 7. Riesgos / unknowns a validar

1. **Topología iPad↔Mac**: confirmar que iPad-periférico→Mac-central surfacea en ambos
   sentidos (notify del iPad ✔ probado conceptualmente; recibir el clock de la Mac por
   write/CoreMIDI hay que confirmarlo). Si falla, probar iPad-central→Mac-periférico.
2. **Dual-role en iOS** (periférico Mac + central WIDI a la vez): esperado estable, validar.
3. **Web Bluetooth NO existe en iOS** (WKWebView) → toda la conexión va por el plugin nativo;
   no hay fallback web.
4. **Signing/Xcode**: con Apple ID gratis, los builds en dispositivo caducan a los 7 días
   (re-firmar). Cuenta de developer paga lo evita, pero para uso propio el gratis sirve.
5. **iPadOS 26.3**: API de CoreMIDI/CoreAudioKit estable; verificar nombres de clases por
   si Apple deprecó algo.

---

## 8. Comandos / arranque rápido para la próxima sesión

```bash
# En el proyecto Capacitor (en la Mac):
cd "/Users/patriciokeogan/Documents/Claude/Projects/CAMARAGE/CAMARAGE/camarage-android"
npm install
npx cap add ios          # agrega plataforma iOS (genera ios/App.xcworkspace)
npx cap sync ios         # copia www/ + plugins
npx cap open ios         # abre Xcode

# En Xcode: seleccionar el iPad, configurar Team (Apple ID), Run (⌘R).
```

El plugin Swift de MIDI se crea dentro de `ios/App/App/` (o como plugin Capacitor local) y
se registra en el `AppDelegate`/Capacitor. Detalle de implementación en la Fase 1.

---

## 9. Definición de "éxito"

Con el iPad en escenario, todo inalámbrico, simultáneo y estable:
- **Toco el MPK → suena en MainStage** (piano, latencia baja).
- **Play en Logic → las letras del iPad se mueven** sincronizadas (clock + PC + SPP).
- **Sin caídas** durante un ensayo/show completo.
- El Samsung queda como respaldo; el iPad es el dispositivo principal.

## Fin del plan maestro iOS
