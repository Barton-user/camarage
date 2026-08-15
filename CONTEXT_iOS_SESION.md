# CAMARAGE · iOS — Estado y handoff de sesión

> Continuación de `PLAN_iOS_iPad.md`. Resume TODO lo hecho en la sesión de port a
> iPad/iOS, qué funciona, qué falta, y cómo retomar. Última sesión: 24 jun 2026.

---

## 1. RESUMEN: ¿en qué punto estamos?

**El port a iOS funciona de punta a punta.** El iPad (iPad Pro 12,9" 3ra gen, iPadOS 26.3)
corre la app CAMARAGE compilada con Capacitor + Xcode, se conecta a la Mac por BLE MIDI,
recibe el clock/Start/Stop/Continue/SPP de Logic, sincroniza Supabase (login + 13 canciones),
y **la letra se mueve** en respuesta a Logic.

**Lo único que falta:** la posición está **desfasada** (la letra va más adelante que Logic).
Causa diagnosticada (ver sección 6). Es un detalle de mapeo de posición, no del transporte.

---

## 2. LO QUE FUNCIONA (probado en vivo)

- ✅ App compila y corre en el iPad (Xcode, Apple ID gratis).
- ✅ Plugin nativo Swift `MidiPeripheral` registrado y respondiendo (`isSupported`, `start`, etc.).
- ✅ **Plan A**: iPad periférico → la Mac conecta como central desde Audio MIDI Setup ▸ Bluetooth ▸ Connect a "CAMARAGE". El iPad muestra "Mac conectado".
- ✅ Mac → iPad: llega el **clock**, **Start (FA)**, **Stop (FC)**, **Continue (FB)**, **SPP (F2)**. Se ven en el log "MIDI IN · VIVO" y en Xcode.
- ✅ La **letra se mueve** con Play (render por clock).
- ✅ Supabase: login (email+pass) + sync de 13 canciones funciona (con el fix del lock, ver §5).
- ✅ Keep-awake (pantalla no se duerme).

## 3. LO QUE FALTA / PENDIENTE

1. **Desfase de posición (PRIORIDAD 1)** — la letra va adelantada. Diagnóstico exacto en §6.
2. **Selección de canción automática** — Logic debería cambiar la canción por Program Change; hoy hay que elegirla a mano y aún así desfasa.
3. **Estabilidad de conexión (flapping)** — el BLE Mac-central es caprichoso por el caché GATT de macOS. Reconectar a veces requiere reinicio. Ver §7.
4. **Plan B** (iPad central → Mac "Advertise") está codeado y hay un toggle, pero NO usar junto con Plan A (doble clock). Probarlo limpio si Plan A no estabiliza.
5. Detalle cosmético: la tarjeta "Mac · DAW" a veces queda en verde aunque se haya desconectado.

---

## 4. ARCHIVOS DEL PORT (todos en el repo)

Proyecto Capacitor iOS: `camarage-android/ios/` (generado con `npx cap add ios`).

| Archivo | Qué es |
|---|---|
| `camarage-android/ios-plugin/MidiPeripheralPlugin.swift` | **Fuente canónica** del plugin. Periférico (CBPeripheralManager) + central WIDI (CoreMIDI) + Plan B (output CoreMIDI) + keep-awake + `MainViewController` (registro explícito). |
| `camarage-android/ios-plugin/MidiPeripheralPlugin.m` | Macro `CAP_PLUGIN` (registro). **OJO: en Cap 6 hace falta ESTO + `CAPBridgedPlugin` en el .swift.** |
| `camarage-android/ios-plugin/RUNBOOK_iOS.md` | Pasos de build en la Mac. |
| `camarage-android/ios-plugin/setup-ios.sh` | `npm run ios:setup` automatiza cap add/sync + copia el plugin. |
| `camarage-android/ios-plugin/Info.plist-additions.md` | Claves Bluetooth + background audio. |
| `index.html` (raíz) y `camarage-android/www/index.html` | La app. Idénticos. El de `ios/App/App/public/` es la copia desplegada. |

> Las copias compiladas del plugin viven en `ios/App/MidiPeripheralPlugin.{swift,m}`
> (las referencia el target, grupo raíz del pbxproj). Hay copias duplicadas en
> `ios/App/App/` que NO se compilan (huérfanas). Siempre sincronizar las tres:
> `ios-plugin/` (canónica) → `ios/App/` (compilada) → `ios/App/App/` (por las dudas).

### Cómo recompilar (en la Mac)
```bash
cd "/Users/patriciokeogan/Documents/Claude/Projects/CAMARAGE/CAMARAGE/camarage-android"
# si tocaste el plugin Swift/.m, copialo a las ubicaciones compiladas:
cp ios-plugin/MidiPeripheralPlugin.swift ios/App/MidiPeripheralPlugin.swift
cp ios-plugin/MidiPeripheralPlugin.swift ios/App/App/MidiPeripheralPlugin.swift
cp ios-plugin/MidiPeripheralPlugin.m     ios/App/MidiPeripheralPlugin.m
cp ios-plugin/MidiPeripheralPlugin.m     ios/App/App/MidiPeripheralPlugin.m
# si tocaste index.html (raíz):
cp ../index.html www/index.html
npx cap sync ios          # copia www/ a ios/App/App/public/
# Xcode: Product ▸ Clean Build Folder (⇧⌘K) ▸ ⌘R
```
**Importante:** dejar que la app la abra **Xcode** (⌘R), no el ícono viejo, para no testear una versión vieja.

---

## 5. CAMBIOS HECHOS EN ESTA SESIÓN (código)

### Swift (`MidiPeripheralPlugin.swift`)
- Plugin completo: CBPeripheralManager (periférico ↔ Mac) + CoreMIDI (central ↔ WIDI / Plan B).
- **`CAPBridgedPlugin`** conformance (identifier/jsName/pluginMethods) — REQUERIDO en Cap 6.
- **`MainViewController: CAPBridgeViewController`** con `capacitorDidLoad()` → `bridge?.registerPluginInstance(MidiPeripheralPlugin())`. **Registro explícito**: sin esto, el autodescubrimiento de Cap 6 NO tomaba el plugin (`Capacitor.Plugins.MidiPeripheral` salía undefined). El storyboard (`ios/App/App/Base.lproj/Main.storyboard`) apunta su VC a `MainViewController` (customClass=MainViewController, customModule=App).
- `start()` **idempotente**: si el manager ya existe, no lo destruye/recrea (recrearlo en cada tap rompía el XPC del BLE → "XPC connection invalid").
- Característica BLE **sin encriptación** (`.readable/.writeable`). Probamos `.*EncryptionRequired` y daba bonding a medias (conectaba sin suscribir). Sin encriptación, la Mac se suscribe OK.
- `deinit` para limpieza (NO `handleOnDestroy` — ese es de Android, no existe en CAPPlugin iOS).
- `setKeepAwake`, `sendToMac` (Plan B), `startInstrument`, `showWidiPicker`.

### JS (`index.html`)
- `getMidiPeri()`: accede al plugin con `Capacitor.registerPlugin('MidiPeripheral')` (en este WebView `Capacitor.Plugins.MidiPeripheral` no se autopopula, y `Capacitor.registerPlugin` tampoco existía como global — termina usando el proxy del bridge nativo registrado en §MainViewController).
- `connectInstrumentIOS()` + ruteo por nombre de fuente (WIDI→forwardToDaw, otra→handleMidiBytes). Soporta Plan A y Plan B según `localStorage 'camarage_ios_topology'`.
- `forwardToDaw`: rama `coremidi-mac` (Plan B) → `sendToMac`.
- **Fix lock Supabase**: `initSupabaseClient` ahora pasa `auth.lock = (n,t,fn)=>fn()`. Sin esto, `signInWithPassword` quedaba colgado en "Entrando…" para siempre en WKWebView.
- `doLogin`: timeout 15s + ping de health (diagnóstico) para que el login no cuelgue mudo.
- **Fix render (CLAVE para que la letra se mueva):**
  - `tickSubscribers.forEach` ahora envuelve cada callback en `try/catch` — antes, si un callback tiraba, mataba el `requestAnimationFrame` y se freezaba TODO el loop.
  - El `onTick` de la vista Bajo: guard `if(!song) return` + default seguro para acordes (`chords[idx] || {root:'—',...}`). Antes crasheaba en cada tick (`TypeError: ... ch.root`) cuando la canción no tenía acordes.
- **Toggle de topología A/B** en el footer del modal de conexión (`ms_topoBtn`).
- Diagnóstico in-app en `connectBleMidi` (lista de plugins, plataforma, etc.).

---

## 6. DIAGNÓSTICO DEL DESFASE (lo que hay que arreglar primero)

El handler de **SPP (Song Position Pointer, 0xF2)** en `handleMidiBytes` (index.html, ~línea 2748):

```js
const beats16th = (data[2] << 7) | data[1];
const secs = beats16th * (60 / bpm) / 4;   // posición en segundos DENTRO de la canción
state.pausedElapsed = secs * 1000;
```

**El problema:** Logic manda la **posición GLOBAL del proyecto entero**, no la posición
dentro de la canción. Si la canción arranca, p.ej., en el compás 50 global, Logic manda
SPP ≈ compás 50, y el iPad lo aplica como "segundos dentro de ESTA canción" → salta al
estribillo/final aunque Logic esté en la intro. **No hay offset por canción.**

Por eso en el A56 "andaba perfecto" probablemente con la PRIMERA canción (arranca en
compás 1 → SPP=0 → coincide), o con un armado de Logic distinto.

### Posibles arreglos (decidir con info del A56)
- **A)** Restar un **offset por canción** = compás de inicio de cada tema en el timeline
  global de Logic. Guardarlo por canción (campo en Supabase, p.ej. `start_bar`) y hacer
  `secsEnCancion = secsGlobal - offsetCancion`.
- **B)** Usar **Program Change**: cuando Logic manda PC (cambio de canción), está en el
  inicio de ese tema → capturar el SPP de ese momento como "cero" de la canción y restarlo.
- **C)** Cambiar el **Clock Mode** de Logic (hoy "Song — SPP at Play Start"). El modo
  "Pattern" manda SPP relativo a un patrón → podría dar posición por-canción sin tocar código.
- **D)** Armar cada canción como **proyecto de Logic separado** empezando en el compás 1
  (así SPP siempre relativo). Quizás así estaba en el A56.

### ❓ PREGUNTAS PARA PATO (necesarias para elegir el arreglo)
1. En el A56, ¿cada canción era un **proyecto de Logic aparte** (todas en compás 1), o **un solo proyecto grande** ("CAMARAGE FOLDER.logicx") con las 13 en fila?
2. ¿Las canciones cambiaban **solas con Program Change** desde Logic, o las elegías a mano?
3. ¿El proyecto actual ("CAMARAGE FOLDER") es el mismo que usabas con el A56?

> Test rápido que confirma el diagnóstico (sin recompilar): tocar la **primera** canción
> del proyecto (la que empieza en compás 1) → debería sincronizar perfecto. Si sí, es 100% el offset global.

---

## 7. GOTCHAS / APRENDIDO (para no repetir)

- **Trust del perfil (Apple ID gratis):** se resetea seguido. iPad ▸ Ajustes ▸ General ▸ VPN y gestión de dispositivos ▸ tocar el perfil ▸ **Trust**. El popup con solo "Cancel" (al abrir la app) NO tiene el botón Trust — hay que entrar a la fila del perfil. Necesita **internet**. Si no aparece/no funciona: borrar app + ⌘R + reiniciar iPad.
- **Borrar la app borra el localStorage** → se pierde la sesión de Supabase y la caché de canciones. Hay que **re-loguear** y sincronizar de nuevo. (Login: `keogan3d@gmail.com`.)
- **Caché GATT de macOS:** después de cambiar la característica BLE, macOS cachea el GATT viejo y conecta "a medias" (sin suscribir). Se limpia con: Disconnect→Connect, toggle de Bluetooth de la Mac, o reinicio. Un reinicio de ambos equipos da el estado más limpio.
- **No tocar "Conectar BLE" muchas veces** (aunque ahora es idempotente). Y **NO mezclar Plan A + Plan B** (doble clock → posición al doble).
- **Logic crea una "Control Surface" Mackie para el iPad** y lo inunda de SysEx (`00 00 66`), lo que satura el BLE y **acapara el puerto** (Logic no le manda el clock al puerto reservado). **Borrar esa superficie** en Logic ▸ Control Surfaces ▸ Setup (Edit ▸ Delete) y **guardar el proyecto (⌘S)**. Si vuelve, desactivar auto-detect.
- **Logic NO transmite MIDI Clock por defecto.** Activado en File ▸ Project Settings ▸ Synchronization ▸ MIDI ▸ Clock = "All". (Ya quedó guardado en el proyecto.)
- Warnings que se ignoran: `cdn.tailwindcss.com should not be used in production`, `Web MIDI API no soportada`, `CARenderServer failed`, `UIScene lifecycle`. No frenan nada.

---

## 8. FLUJO DE CONEXIÓN (Plan A — el que usamos)

1. Mac: abrir Logic (clock ya configurado) + Audio MIDI Setup ▸ ventana Bluetooth.
2. iPad por cable → Xcode ⌘R (app abre sola). Loguear Supabase si hace falta + sincronizar.
3. Topología en **A**. Tocar **"Conectar BLE" UNA vez** (LED cyan, "Anunciando").
4. Mac: en la ventana Bluetooth, **Connect** a CAMARAGE → iPad muestra "Mac conectado".
5. Vista Cantante, cargar la canción correcta, Play en Logic.
6. **NO** tocar "Conectar instrumento" ni "Advertise" en Plan A.

### Datos del setup
- iPad BLE: `EC:2C:E2:A5:A2:F2` · Mac BLE visto: `9C:3E:53:80:13:40` · WIDI: `10:2E:AB:D6:8F:64`
- Bundle id: `com.camarage.live` · Apple ID dev: `patriciokeogan@hotmail.com`
- Supabase: `https://ccytqubmroxjaiwtzsfh.supabase.co` (anon key embebida en index.html) · login `keogan3d@gmail.com`
- Logic project: `CAMARAGE FOLDER.logicx`

---

## 9. PRÓXIMOS PASOS (al retomar)
1. Confirmar con Pato cómo estaba el multi-canción en el A56 (preguntas §6).
2. Implementar el offset por canción en el handler SPP (arreglo A o B), o ajustar Logic (C/D).
3. Verificar selección automática de canción por Program Change.
4. Estabilizar el BLE (probar Plan B limpio si Plan A flapea; evaluar si conviene bonding).
5. Pulir: filtro de SysEx Mackie entrante, fix UI tarjeta verde fantasma.
