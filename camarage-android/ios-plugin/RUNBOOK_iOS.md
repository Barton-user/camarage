# CAMARAGE iOS — Runbook (hacer en la Mac)

Todo esto se corre **en la Mac de Patricio** (Xcode + iPad por cable la primera vez).
Los archivos del plugin Swift ya están en este repo, en `camarage-android/ios-plugin/`.

Carpeta de trabajo:
```bash
cd "/Users/patriciokeogan/Documents/Claude/Projects/CAMARAGE/CAMARAGE/camarage-android"
```

---

## Paso 0 — Requisitos
- Xcode instalado (App Store), abierto al menos una vez para instalar componentes.
- CocoaPods: `sudo gem install cocoapods` (si no está).
- Node/npm ya los tenés (el proyecto Android los usa).
- Apple ID (gratis sirve para correr en tu propio iPad; los builds caducan a los 7 días).

## Paso 1 — Setup automático (un comando)
```bash
npm run ios:setup
```
Esto instala deps, agrega la plataforma iOS, sincroniza `www/` y copia el plugin
Swift a `ios/App/App/`. (Equivale a los pasos manuales de abajo.)

<details><summary>Equivalente manual (si preferís paso a paso)</summary>

```bash
npm install                            # ya incluye @capacitor/ios ^6.2.1
npx cap add ios                        # genera ios/App/App.xcworkspace
npm run web:sync                       # ../index.html → www/index.html
npx cap sync ios                       # copia www/ + plugins
cp ios-plugin/MidiPeripheralPlugin.swift ios/App/App/
cp ios-plugin/MidiPeripheralPlugin.m     ios/App/App/
```
> Si `cap add ios` se queja de versión, alineá `@capacitor/core`, `@capacitor/cli`
> y `@capacitor/ios` (todas ^6).
</details>

## Paso 2 — Meter el plugin Swift en el proyecto
1. Abrir el proyecto:
   ```bash
   npx cap open ios
   ```
2. En Xcode, en el navegador de la izquierda, expandir **App ▸ App**.
3. `ios:setup` ya copió los dos archivos a `ios/App/App/`. Falta **agregarlos al
   target**: click derecho en el grupo **App** ▸ **Add Files to "App"…** ▸ elegí
   `MidiPeripheralPlugin.swift` y `MidiPeripheralPlugin.m` (están en `ios/App/App/`)
   ▸ ✅ target **App**. (Si los copiaste a mano, igual hay que agregarlos acá.)
4. Al agregar el `.m`, Xcode pregunta si crear un **bridging header** →
   **Create Bridging Header**. (Si no pregunta, no pasa nada: Capacitor ya
   trae uno; lo importante es que `MidiPeripheralPlugin.m` quede en
   *Build Phases ▸ Compile Sources*.)
5. Verificá que ambos archivos estén en *Target App ▸ Build Phases ▸ Compile Sources*.

## Paso 3 — Permisos (Info.plist) y Background
Seguir `ios-plugin/Info.plist-additions.md`:
- Agregar `NSBluetoothAlwaysUsageDescription` y `NSBluetoothPeripheralUsageDescription`.
- Target App ▸ **Signing & Capabilities** ▸ **+ Capability** ▸ **Background Modes**
  ▸ tildar **Audio, AirPlay, and Picture in Picture**.

## Paso 4 — Signing
- Target App ▸ **Signing & Capabilities**.
- **Team**: elegí tu Apple ID (Add Account si hace falta).
- **Bundle Identifier**: `com.camarage.live` (ya viene del capacitor.config). Si
  Apple lo rechaza por estar tomado, cambialo a algo único, p.ej.
  `com.camarage.live.pato`.

## Paso 5 — Correr en el iPad
- Conectá el iPad Pro por cable. En el iPad: confiar en la Mac si lo pregunta.
- En Xcode, arriba, elegí el iPad como destino.
- **⌘R** (Run).
- Primera vez: en el iPad, Ajustes ▸ General ▸ VPN y gestión de dispositivos ▸
  confiar en tu perfil de desarrollador.
- La app debería abrir, mostrar el login y sincronizar Supabase (es WebView, ya anda).

---

## Paso 6 — Conectar el MIDI (orden importa)

1. **iPad → Mac (periférico):**
   - En la app, modo de conexión BLE = `peripheral` (es el default).
   - Tocá **CONECTAR BLE**: el iPad empieza a anunciarse como "CAMARAGE".
   - En la **Mac**: abrir **Configuración de Audio MIDI** ▸ ventana **Estudio MIDI**
     ▸ ícono **Bluetooth** ▸ debería aparecer "CAMARAGE" ▸ **Conectar**.
   - En la app, el LED pasa a verde y dice "Mac conectado".

2. **WIDI → iPad (instrumento, CoreMIDI):**
   - Tocá **conectar instrumento**: aparece el **picker de Bluetooth MIDI del
     sistema** (CABTMIDICentralViewController).
   - Elegí el **WIDI Master** del MPK ▸ esperá a que diga conectado ▸ **Done**.
   - La app loguea "instrumento (CoreMIDI): WIDI…".

---

## Paso 7 — Validación end-to-end (Fase 3 del plan)
- [ ] Toco el MPK → suena en **MainStage** (canal 2), latencia tolerable para piano.
- [ ] **Play en Logic** → el clock + cambios de canción (PC) + SPP llegan al iPad
      → las **letras se mueven** sincronizadas.
- [ ] Separación por canal (MainStage ch2, Logic ch1) como en el plan.
- [ ] **Estabilidad sostenida**: dejar las dos conexiones activas un rato largo
      sin que se caigan (era el cuello de botella del Samsung).

### Si algo falla
- **La Mac no ve "CAMARAGE" en Bluetooth:** confirmá que tocaste CONECTAR BLE
  (el iPad tiene que estar anunciando) y que el Bluetooth de la Mac está en una
  ventana de Estudio MIDI (no en el panel general de Bluetooth del sistema).
- **Conecta y se cae enseguida:** es el caso que en Android no se podía resolver;
  en iPad esperamos que aguante. Si flapea, usar el **Plan B** (abajo).
- **El MPK no suena en MainStage:** revisá que el WIDI esté conectado (paso 6.2) y
  que MainStage escuche el canal correcto. Mirá el panel "MIDI through" de la app
  para confirmar que las notas pasan.

---

---

## Plan B — iPad central de los dos lados (fallback)
Si el Plan A (iPad periférico → Mac central) flapea, el iPad pasa a ser **central
de los dos**: conecta al WIDI **y** a la Mac, todo por CoreMIDI. Ya está
implementado; se activa con un flag y no requiere recompilar.

**Activar (una vez, en la consola del WebView o agregando la línea al arranque):**
```js
localStorage.setItem('camarage_ios_topology', 'B');
```
(Para volver al Plan A: `localStorage.setItem('camarage_ios_topology','A')` o borrar la clave.)

**En la Mac:** abrir **Configuración de Audio MIDI ▸ Estudio MIDI ▸ Bluetooth** y
poner la Mac a **anunciarse** (botón "Anunciar"/Advertise). Así la Mac queda como
periférico BLE MIDI visible.

**En la app (Plan B):**
- Tocá **conectar instrumento**: se abre el picker del sistema.
- Conectá **el WIDI** y **la Mac** (los dos aparecen ahí).
- La app rutea por nombre: la fuente "WIDI…" → notas al Mac; la otra (la Mac) →
  sync de letras. Las notas salen a la Mac por el destino CoreMIDI que NO sea WIDI.

> Nota: en Plan B NO se usa "CONECTAR BLE" (no hay advertising del iPad). Todo
> entra/sale por el picker de CoreMIDI.

---

## Re-deploy después de tocar la app (HTML/JS)
```bash
cd "/Users/patriciokeogan/Documents/Claude/Projects/CAMARAGE/CAMARAGE/camarage-android"
cp ../index.html www/index.html      # si editaste el index.html de la raíz
npx cap sync ios
# en Xcode: ⌘R
```

## Backup (como en CONTEXT.md)
- Guardar el proyecto de Logic + Controller Assignments de MainStage.
- El Samsung queda como respaldo; el iPad es el principal.
