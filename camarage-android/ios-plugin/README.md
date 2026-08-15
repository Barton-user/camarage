# CAMARAGE · capa nativa MIDI para iOS

Reemplaza al `MidiPeripheralPlugin.java` de Android. Misma interfaz JS, así que
`index.html` casi no cambia.

## Archivos
| Archivo | Qué es |
|---|---|
| `MidiPeripheralPlugin.swift` | El plugin. Periférico (↔ Mac, CoreBluetooth) + central WIDI (↔ CoreMIDI). |
| `MidiPeripheralPlugin.m` | Registro del plugin en Capacitor (nombre JS `MidiPeripheral`). |
| `Info.plist-additions.md` | Claves de permisos Bluetooth + background audio. |
| `RUNBOOK_iOS.md` | Pasos exactos en la Mac: cap add ios → Xcode → correr → validar. |

## Decisión de arquitectura (importante)
- **Lado Mac = `CBPeripheralManager` (CoreBluetooth crudo)**, no el view controller
  de CoreMIDI. Motivo: es un port casi 1:1 del GATT server de Android que la Mac
  **ya supo surfacear** en las pruebas (mismos UUIDs BLE-MIDI 1.0, NOTIFY → fuente
  MIDI en macOS). Es 100% programático (anuncia siempre, sin depender de una
  pantalla abierta) y deja el JS del lado periférico idéntico. CBPeripheralManager
  es muy estable en iOS — justo lo que el Samsung no aguantaba.
- **Lado WIDI = CoreMIDI** (como elegiste): picker del sistema
  (`CABTMIDICentralViewController`) para conectar el WIDI; las notas del MPK entran
  ya des-framed por CoreMIDI y se rutean con `forwardToDaw` (mismo router).
- Como el lado Mac NO pasa por CoreMIDI, la conexión con la Mac no aparece como
  endpoint CoreMIDI → **no hay loop** entre la entrada del WIDI y la salida al Mac.

## Interfaz JS (idéntica a Android + extras para el WIDI)
- `isSupported()` → `{ supported }`
- `start({ name })` — anuncia el iPad como periférico BLE MIDI
- `stop()`
- `send({ data: hex })` — NOTIFY a la Mac (BLE framed; lo arma makeBleMidiPacket)
- `startInstrument()` — inicializa CoreMIDI (in+out) **[nuevo, iOS]**
- `showWidiPicker()` — abre el picker del sistema (WIDI y/o Mac) **[nuevo, iOS]**
- `sendToMac({ data: hex, dest? })` — Plan B: manda MIDI crudo al destino de la
  Mac por CoreMIDI **[nuevo, iOS]**
- `setKeepAwake({ on })` — pantalla siempre encendida en escenario
  (isIdleTimerDisabled) **[nuevo, iOS]**
- Eventos: `midiReceived`, `centralConnected`, `centralDisconnected`,
  `advertiseFailed`, y **[nuevos]** `instrumentMidi` (con `source`),
  `instrumentConnected`.

## Plan B (fallback, ya implementado)
`localStorage 'camarage_ios_topology' = 'B'` → el iPad es central de los dos
(WIDI + Mac, todo por CoreMIDI). El ruteo en JS es por **nombre de fuente**:
"WIDI…" → `forwardToDaw` (al Mac); cualquier otra fuente → `handleMidiBytes`
(sync). Pasos en `RUNBOOK_iOS.md`. Default = Plan A.

## Supabase
No requiere nada nativo. La app usa `@supabase/supabase-js` por HTTPS desde el
WebView (URL + anon key embebidas en `index.html`, `DEFAULT_SUPABASE_URL` /
`DEFAULT_SUPABASE_KEY`). En WKWebView (iOS) funciona igual que en el WebView de
Android: login, pull de setlists/letras y sync se portan sin cambios. Los
`insert_*_lyrics.sql` y `supabase_schema.sql` siguen siendo la misma base.

## Riesgo a validar en escenario
La topología elegida (iPad periférico → Mac central) es la que probamos que
surfacea. Falta confirmar en vivo que el **clock de la Mac** llegue bien por los
writes (recepción) y que el **dual-role** (periférico Mac + central WIDI a la vez)
aguante sostenido. Si flapea, está el **Plan B** (iPad central → Mac periférico)
en el plan. Ver checklist en `RUNBOOK_iOS.md`.
