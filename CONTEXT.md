# CAMARAGE · Project Context Snapshot

> Documento para retomar el proyecto en otra conversación de Claude.
> Última actualización: 26 jun 2026 (sesión Cowork — limpieza de onboarding + keep-screen-on)

## Sesión 26 jun 2026 — cambios de UI/UX (sin compilar al APK todavía)

Cambios aplicados en `index.html` Y en `camarage-android/www/index.html` (idénticos),
más `MainActivity.java`. Falta recompilar el APK en la Mac para verlos en el celu.

1. **Pantalla de pairing BLE eliminada** (`screenPairing`, "Paso 2 de 2"). La lista
   de dispositivos era mock/hardcodeada. La conexión real con el DAW se sigue
   haciendo desde el modal de config (botón "Conectar BLE (Mac)" / `ms_reconnectBtn`),
   y `connectBleMidi()` quedó intacta.
2. **Pantalla de selección de rol eliminada** (`screenSplash`, "Screen 1"). La app
   arranca directo en la vista; el rol/vista se cambia desde la bottom nav.
   Rol por defecto: `state.role = 'singer'` → `viewSinger`. Boot vía un nuevo
   `DOMContentLoaded` que setea estado OFFLINE y llama `enterApp()`.
3. **Pantalla siempre encendida (keep-screen-on)**. Antes `setStageAwake(true)` solo
   se llamaba al conectar MIDI (y la Wake Lock API del WebView no agarraba bien en
   el A56). Fix principal: flag nativo `FLAG_KEEP_SCREEN_ON` en `MainActivity.onCreate`
   (se libera solo al minimizar). Además se llama `setStageAwake(true)` en `enterApp`
   y se re-adquiere en `visibilitychange` (cubre el build web/Chrome).

### Mejoras "modo escenario" (misma sesión 26 jun)

Agregadas en `index.html` + `www/index.html` (+ `MidiPeripheralPlugin.java` para el brillo).
Hay una **stage bar** nueva debajo del header con: A− / A+ (tamaño de letra), botón de
brillo y botón de candado.

4. **Tamaño de letra ajustable**: CSS var `--lyric-scale` (override con !important de
   `#singerLyricsTrack .line-item` y `#bassChordTrack .line-item > p`). Botones A−/A+,
   persistido en `localStorage['camarage_lyric_scale']`. Re-centra el scroll al cambiar
   (el scroll usa getBoundingClientRect dinámico, así que no se rompe la sync).
5. **Bloqueo anti-toques**: botón candado → `#lockOverlay` (fixed, transparente, z-60)
   que captura todos los toques. Para desbloquear: mantener apretado 1s (barra de
   progreso `#lockProg`). `state.locked`.
6. **Brillo máximo (modo escenario)**: nuevo `@PluginMethod setBrightness({level})` en
   `MidiPeripheralPlugin.java` (level 0..1 fijo, <0 = auto del sistema; usa
   `window.screenBrightness`, no requiere WRITE_SETTINGS). Toggle en JS llama
   `peri.setBrightness({level: 1.0 / -1})`, persistido en `localStorage['camarage_stage_bright']`.
   No-op en navegador.
7. **Auto-reconexión BLE**: path Capacitor central pasa `onDisconnect` a `connect()` y
   reintenta con backoff (hasta 12 intentos, 1→5s) re-suscribiendo notificaciones
   (`capSubscribe`). Path Web Bluetooth: `webReconnect()` en `gattserverdisconnected`.
   Path periférico: el OS ya reconecta solo porque el celu sigue advirtiendo.

**Próximo paso obligatorio:** recompilar el APK en la Mac (los cambios de
`MainActivity.java` y `MidiPeripheralPlugin.java` son nativos, sin rebuild no se ven). Comando:
`cd camarage-android && npx cap sync android && cd android && ./gradlew assembleDebug`
(requiere JDK 17 + Android SDK; en el sandbox de Cowork no se pudo compilar).

## Resumen del proyecto

App de sincronización en vivo para bandas. El celular se conecta vía **BLE MIDI**
al Mac donde corre Logic Pro. Cuando Logic manda Program Change, Note On (cues),
Clock y Start/Stop, la app del celu reacciona en tiempo real mostrando letras,
cifrado del bajo y metrónomo visual, todo sincronizado al ritmo real del DAW.

Existe también una web admin (Next.js en Vercel) para configurar setlists,
canciones, letras y cues desde una computadora. Los datos se guardan en
Supabase. El celu sincroniza al abrir + manual; funciona offline una vez
cacheado.

**Usuario:** Pato (patricio.keogan@sinis.com.ar / keogan3d@gmail.com)
**Banda:** "Ensayo" / CAMARAGE
**Hardware target:** Samsung A56 (Android) + MacBook Pro

## Estado actual end-to-end

### TODO FUNCIONA:
- ✅ APK Android compilado con login + auto-sync + hardcoded creds (3.7MB)
- ✅ Conexión BLE MIDI nativa (plugin @capacitor-community/bluetooth-le)
- ✅ Parser BLE MIDI con state machine compliant a spec 1.0
- ✅ Recepción de Clock, Start, Continue, Stop, Program Change, Note On (cues), CC
- ✅ Envío MIDI saliente (Play/Stop del celu hacia Logic)
- ✅ BPM derivado de timestamps embebidos BLE (precisión ~1 BPM)
- ✅ Posición de canción anclada a tick count desde Start (sin drift)
- ✅ Latency compensation predictivo Web Audio (default 88ms, slider 0-200ms)
- ✅ Modal de configuración: filtro canal MIDI, log mensajes en vivo, calibración
- ✅ 3 vistas + Setlist Editor + bottom nav
- ✅ Schema Supabase 13 tablas con RLS aplicado en proyecto del usuario
- ✅ Web admin Next.js 14 deployada en Vercel (https://camarage.vercel.app)
- ✅ Login email+password en web admin (con OTP fallback)
- ✅ Login email+password en APK (mismo usuario que web)
- ✅ Sync automático al abrir APK (sin configuración manual)
- ✅ Editor de letras con tiempo en mm:ss
- ✅ Insertar líneas entre existentes
- ✅ Cues MIDI inline en pantalla de letras (no hay que ir a otro tab)
- ✅ MIDI Stop = pausa (no reset) — preserva posición de cues
- ✅ Repo en GitHub https://github.com/Barton-user/camarage (Pato cuenta Barton-user)

### EN DEBUG / SIN VERIFICAR:
- ⚠️ **Bug actual abierto (NUEVO)**: en el celular aparece una letra fantasma
  "ya no creo en la casualidad" entre "Todo tiene su final" (1:57) y
  "Lo que vos ves, no es real" (2:05). En el web admin NO está esa línea a las 2:00.
  Posibles causas a investigar en próxima sesión:
  1. APK con cache vieja (anterior al fix de sort)
  2. Registro huérfano en Supabase (fila en `lyric_lines` que no se ve en editor)
  3. Usuario no instaló la última APK
  **Próximo paso**: pedirle al usuario que (a) confirme que tiene última APK,
  (b) tape "↻ Sincronizar ahora" en el modal, (c) si persiste, hacer query
  directa a Supabase para listar todas las filas de `lyric_lines` de la canción
  ordenadas por `t` y comparar con el editor web. Si hay orphan row → DELETE
  manual.
- ⚠️ Bug del lyric scroll en respuesta a cues — **FIXED** en esta sesión.
  Causa raíz: `order_index` ≠ orden cronológico. El loop de scroll usaba
  `for/break` y cortaba al encontrar primer lyric con `t > sec`, que podía
  no ser cronológicamente el siguiente.
  Fix aplicado en dos puntos de `index.html`:
  1. Sync de Supabase ahora ordena lyrics/cues/chords por `t`/`timestamp`/`bar`
     después de mapear.
  2. El subscriber de `onTick` escanea TODAS las lyrics buscando "max t <= sec"
     sin usar `break`.
- ⚠️ Convención de notas Logic vs estándar:
  - Logic Pro por default muestra MIDI 60 como **C3** (Yamaha convention).
  - Mi app y el estándar internacional usan **C4 = MIDI 60**.
  - Resultado: cuando Logic muestra "E4" en pantalla, manda MIDI 76 que mi app
    correctamente identifica como E5.
  - **Solución implementada en esta sesión**: el generator
    `generateLogicEventListText` y `generateMidiFile` ahora EMITEN en Yamaha
    convention (`Math.floor(n/12) - 2`), así el texto/archivo que ven en Logic
    matchea exactamente con el MIDI value que esperaba el celu.
  - El usuario antes había subido sus cues una octava manualmente como
    workaround — ya no es necesario con el generator nuevo.

### FEATURES NUEVAS RECIÉN AGREGADAS (web admin):
- ✅ **Auto-asignar notas MIDI a todas las letras** (botón en tab Letras):
  borra cues existentes (bulk DELETE) + espera 150ms + bulk INSERT con notas
  chromatic empezando en C3 (MIDI 48) a cada línea en orden cronológico.
  Una nota por línea. Fix de race condition con UNIQUE constraint.
- ✅ **Copiar para Logic** (botón en tab Letras): pone en el portapapeles
  el texto en formato Logic Event List exacto (con ♯ Unicode, tabs, doble
  línea por nota con Rel Vel). El usuario pega en Event List de Logic.
  **Nota**: Logic NO acepta paste de texto en Event List (formato propietario).
  Sólo el .mid drag-and-drop funciona como método principal.
- ✅ **Descargar .mid** (botón en tab Letras): genera Standard MIDI File
  (PPQ 480, format 0) con posiciones ABSOLUTAS desde bar 1. Método
  recomendado: drag-and-drop al bar donde empieza la canción en Logic.
- ✅ **Notas en Yamaha convention**: el .mid y el texto Logic emiten cada
  nota con `Math.floor(n/12) - 2` para que Logic muestre el nombre que
  matchea el MIDI que llega al celu.

### TODO POR EMPEZAR:
- ❌ **Diagnosticar lyric fantasma "ya no creo en la casualidad"** (ver arriba)
- ❌ Verificar end-to-end con APK fresca después del fix de sort
- ❌ Auto-calibración de latencia con micrófono del celu
- ❌ Soporte Song Position Pointer (0xF2) para sync mid-song
- ❌ Vista Tecladista, Guitarrista
- ❌ Modo paisaje iPad
- ❌ Gestión de miembros de banda con invite links
- ❌ Realtime sync entre miembros de banda durante el show

## Credenciales y URLs importantes

### Supabase
- **Project URL**: `https://ccytqubmroxjaiwtzsfh.supabase.co`
- **Anon (publishable) key** (HARDCODED en APK + Vercel env vars):
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjeXRxdWJtcm94amFpd3R6c2ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMjc2NjgsImV4cCI6MjA5NDkwMzY2OH0.a8cq6qpHOqV-0DCkuFyPxmHNvbuNzrItgYdaAoc1YBI`
- **Schema aplicado**: SÍ, las 13 tablas + RLS + triggers + view están creadas
- **Auth**: email+password configurado, OTP también disponible como fallback
- **Site URL**: `https://camarage.vercel.app` ✓
- **Redirect URLs**: `https://camarage.vercel.app/auth/callback` ✓
- **Email OTP length**: 6 dígitos (cambió de 8 a 6)
- **Confirm email**: DESACTIVADO (single-user, no necesita)

### Vercel
- **Project**: camarage
- **URL primary**: `https://camarage.vercel.app`
- **Framework**: Next.js (configurado correctamente después de varios intentos)
- **Root Directory**: `web` (configurado correctamente)
- **Env vars**:
  - `NEXT_PUBLIC_SUPABASE_URL` = URL Supabase
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la anon key

### GitHub
- **Repo**: https://github.com/Barton-user/camarage
- **Branch**: main
- **Auth**: pusheado desde Mac del usuario

## Estructura del repo

```
CAMARAGE/                                    # workspace folder del usuario
├── index.html                               # SPA del mobile (fuente del APK)
├── singer_view.html                         # primer prototipo solo Cantante
├── supabase_schema.sql                      # schema viejo (no usar)
├── README.md                                # readme principal
├── SETUP.md                                 # guía paso a paso
├── CONTEXT.md                               # ESTE archivo
├── CAMARAGE-debug.apk                       # último APK compilado (3.7MB)
├── camarage-android/                        # proyecto Capacitor para Android
│   ├── android/
│   ├── www/index.html                       # copia del SPA
│   ├── capacitor.config.json
│   └── package.json
└── web/                                     # web admin Next.js para Vercel
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx
    │   ├── globals.css
    │   ├── login/page.tsx                   # email+password + OTP fallback
    │   ├── auth/callback/route.ts
    │   ├── dashboard/
    │   ├── bands/
    │   ├── setlists/
    │   ├── songs/[id]/page.tsx              # EDITOR con auto-asignar + copy Logic
    │   └── settings/page.tsx                # cambiar contraseña
    ├── components/Nav.tsx
    ├── lib/
    │   ├── supabase-client.ts
    │   ├── supabase-server.ts
    │   └── types.ts
    ├── supabase/schema.sql                  # SCHEMA DEFINITIVO con midi_cues
    ├── middleware.ts
    └── ...
```

## Decisiones técnicas clave

### Mobile (APK Android)

- **Capacitor v6** wrapper sobre el HTML
- **Plugin BLE**: `@capacitor-community/bluetooth-le` v6.1.0
  - Key compuesta: `notification|deviceId|service|characteristic` (lowercase)
  - Value: HEX STRING, no base64
- **BLE MIDI Service UUID**: `03b80e5a-ede8-4b33-a751-6ce34ec4c700`
- **BLE MIDI Char UUID**: `7772e5db-3868-4112-a1a9-f2669d106bf3`
- **Parser**: state machine compliant con BLE MIDI 1.0
  - Real-time messages (0xF8-0xFF) chequeados con `expectingStatus` flag
  - TimestampLow byte siempre precede a status (excepto running status data)
  - Extrae timestamp embebido para BPM accuracy
- **BPM calc**: trimmed mean 60% central de 144 muestras con EMA smoothing 0.3/0.7
- **Position**: anclada a `midi.tickSinceStart / 24`, interpolada entre ticks
- **Audio**: Web Audio API con `playClickAt(audioTime, accent)` agendado
  predictivamente (currentTime + secUntilNextBeat - latencyOffset)
- **Latency offset**: 88ms default calibrado por análisis de WAV
- **MIDI Stop**: pausa (no reset). Solo el botón STOP de la UI hace reset
- **Sync Supabase**: load del cache localStorage al boot, pull en background.
  **IMPORTANTE (fix de esta sesión)**: lyrics/cues/chords se ordenan por
  `t`/`timestamp`/`bar` DESPUÉS del map, no por `order_index`. Esto previene
  bugs de scroll cuando el usuario edita líneas en distinto orden cronológico.
- **Lyric scroll loop (fix de esta sesión)**: escanea TODAS las lyrics
  buscando "max t <= sec" sin usar break:
  ```js
  onTick((sec) => {
    let idx = 0; let bestT = -1;
    for (let i=0; i<song.lyrics.length; i++) {
      const t = song.lyrics[i].t;
      if (t <= sec && t > bestT) { bestT = t; idx = i; }
    }
    if (idx !== singerLineIdx) { ... }
  });
  ```
- **Supabase creds**: HARDCODED como DEFAULT_SUPABASE_URL/KEY, localStorage
  override opcional
- **Auto-login**: persistSession, se restaura sesión al abrir
- **localStorage keys**:
  - `camarage_audioLatencyMs`
  - `camarage_supabase_url` (opcional override)
  - `camarage_supabase_anon_key` (opcional override)
  - `camarage_setlist_cache`
  - `camarage_active_band_id`

### Web (Next.js)

- **Next.js 14.2.15** App Router con TypeScript
- **Auth**: `@supabase/ssr` v0.5 — email+password primary, OTP fallback
- **Middleware**: protege `/dashboard`, `/songs`, `/setlists`, `/bands`, `/members`, `/settings`
- **Editor de canciones** (`/songs/[id]`):
  - Tabs: Datos / Letras (N) / Cues MIDI (N) / Cifrado (N)
  - Tiempo en formato mm:ss (acepta tanto 90 como 1:30)
  - Botón `+` por línea para insertar entre líneas
  - Inline cue editor en cada línea de letra
  - **NUEVO: Botones Auto-asignar / Copiar Logic / .mid**
- **Build artefacts en Vercel**: ARM64 SWC binary auto-instalado
- **Estilos**: Tailwind con mismas CSS vars que el mobile

### Generación de archivos MIDI (NUEVA FEATURE)

En `web/app/songs/[id]/page.tsx`:

- `generateMidiFile(cues, bpm, channel, name)`: produce Uint8Array con
  formato Standard MIDI File (PPQ 480, format 0, header + 1 track con
  tempo event + Note On/Off para cada cue + End of Track)
- `generateLogicEventListText(cues, bpm, channel, beatsPerBar)`: produce
  texto con formato EXACTO de Logic Event List:
  - Tab-separated, ♯ Unicode (no #)
  - Cada nota = 2 líneas (principal + "Rel Vel")
  - Position: Bar Beat Division Tick (4 números)
  - Status: "Note"
  - Channel, Pitch, Velocity, Length

Formato de ejemplo que Logic copia:
```
 \t  \t 1195 1 1 1 \t Note\t 1\t C4\t 80\t 5 0 1 0\t
\t\t\t Rel Vel\t\t\t 64\t\t
```

- `autoAssignNotesToLyrics()`: borra todos los cues existentes y asigna
  notas chromatic empezando en C3 (MIDI 48) a cada lyric line en orden
  cronológico. Una nota por línea, máx 80 líneas.
- `copyForLogic()`: copia el texto Logic Event List al portapapeles
- `downloadMidi()`: descarga .mid como backup

### Supabase Schema

13 tablas con RLS:
- `bands`, `band_members` (enum `band_role`)
- `setlists`, `setlist_songs`
- `songs`, `song_sections` (enum `section_type`)
- `lyric_lines`, `chord_charts`, `drum_cues` (enum `cue_type`)
- `midi_cues` (note, label, jump_to_seconds, UNIQUE(song_id, midi_note))
- `performances`, `ble_devices`, `user_preferences`

**RLS helper function**: `is_band_member(band_id)` retorna true si auth.uid()
está en band_members de esa banda activa.

**Trigger**: `add_owner_as_member` agrega automáticamente al owner como member
al crear una banda.

**View**: `vw_setlist_full` con SECURITY INVOKER on para respetar RLS.

## Problemas conocidos / Tasks pendientes

### 🔴 BUG ACTIVO — letra fantasma "ya no creo en la casualidad" a ~2:00
- En el celular aparece entre "Todo tiene su final" (1:57) y "Lo que vos ves,
  no es real" (2:05).
- En el web admin NO existe esa línea.
- Posibles causas:
  1. APK con cache vieja (anterior al fix de sort)
  2. Registro huérfano en Supabase (fila en `lyric_lines` con `t≈120` que no
     se ve en editor web por algún tema de render/order_index)
  3. Usuario no instaló la última APK

**Pasos próximos en próxima sesión**:
1. Pedirle al usuario confirmar versión de APK instalada
2. Que tape "↻ Sincronizar ahora" en el modal del celu
3. Si persiste: query directa a Supabase:
   ```sql
   SELECT id, line_index, t, text
   FROM lyric_lines
   WHERE song_id = '<UUID-de-la-canción>'
   ORDER BY t;
   ```
4. Comparar con lo que muestra el editor web. Si hay orphan → DELETE
   manual desde SQL editor de Supabase.

### ✅ RESUELTO — lyric scroll no reacciona a cues
- Fixed con sort por tiempo en sync + scan completo sin break en onTick.
- Ver detalles más abajo en "Decisiones técnicas".

### ✅ RESUELTO — Convención de notas Logic
- Logic muestra C3 como middle C (Yamaha convention)
- Mi app usa estándar C4=60
- Solución final: el generator de .mid y texto Logic emite en Yamaha
  convention (`Math.floor(n/12) - 2`), así matchea visualmente con lo que
  Logic muestra y con el MIDI que llega al celu.
- Workaround viejo (subir cues una octava manualmente) ya no es necesario.

### 🟡 Pendiente probar end-to-end completo
Una vez resuelto el bug del lyric scroll:
1. Usuario crea canción en web → escribe letras → "Auto-asignar notas" →
   "Copiar para Logic"
2. En Logic, crea pista MIDI externa → port=A56, channel=2 → Event List →
   pega
3. Las notas aparecen automáticamente en los bars correspondientes
4. Play en Logic → cada nota dispara cue en el celu → letra se mueve a esa
   parte
5. **TODO el setup queda en 3 clicks**

## Workflow esperado del usuario (Pato)

### Pre-show (en computadora, web admin)
1. Login en `camarage.vercel.app` (email + contraseña)
2. Crear nueva canción en `/songs` con BPM, key, time signature
3. Escribir letras línea por línea con timestamp (mm:ss o segundos)
4. Click **"🤖 Auto-asignar notas MIDI"** → cada línea tiene una nota única
5. Click **"📋 Copiar para Logic"** → al portapapeles formato Event List
6. Abrir Logic Pro → proyecto de la canción
7. Crear pista **External MIDI** (no Software Instrument!) con:
   - Port: A56 de Patricio
   - Channel: 2
8. Abrir **Event List** (Cmd+0) → posición bar 1 → Cmd+V para pegar
9. Las notas aparecen exactamente en los bars correspondientes

### En el escenario (celular)
1. Abrí CAMARAGE
2. Auto-login (sesión guardada) + auto-sync del setlist (si hay WiFi)
3. Elegir rol (Cantante/Bajista/Baterista)
4. Conectar BLE MIDI al Mac (Logic)
5. Play en Logic → Start (FA) llega → app arranca
6. Logic manda Notes MIDI cada vez que pasa por una nota del cue track
7. App salta a la línea correspondiente → letra principal se actualiza
8. Stop en Logic → MIDI Stop = pausa → posición se mantiene

## Setup técnico del entorno Claude (sandbox)

Para retomar la compilación de APK en otra sesión:

- ARM64 Linux con JDK 17 (instalado en `/sessions/.../jdk`)
- Android SDK con cmdline-tools (en `/sessions/.../android-sdk`)
- qemu-user-static + libc6-amd64-cross para emular binarios x86_64
- aapt2 wrapper en `/sessions/.../aapt2-wrapper/`
- Gradle 8.2.1 cacheado en `/sessions/.../.gradle/wrapper/dists/`
- env.sh: `/sessions/laughing-serene-brown/env.sh`

**Recompilar APK**:
```bash
source /sessions/laughing-serene-brown/env.sh
export QEMU_LD_PREFIX=/sessions/laughing-serene-brown/qemu-prefix/usr/x86_64-linux-gnu
cd /sessions/laughing-serene-brown/camarage-android
cp /sessions/laughing-serene-brown/mnt/CAMARAGE/index.html www/index.html
npx cap sync android
cd android && ./gradlew --no-daemon --console=plain assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk /sessions/laughing-serene-brown/mnt/CAMARAGE/CAMARAGE-debug.apk
```

NOTA: si el entorno se recrea desde cero, todo eso hay que rehacerlo.
Pero el APK ya compilado vive en el workspace en `CAMARAGE-debug.apk`.

## Comandos rápidos para retomar

```bash
# Update repo desde el workspace de Claude
cd "/Users/patriciokeogan/Documents/Claude/Projects/CAMARAGE/CAMARAGE"
rm -f .git/index.lock
git add -A
git commit -m "describe el cambio"
git push

# Correr la web localmente
cd web && npm install && cp .env.example .env.local
# editar .env.local con credenciales
npm run dev   # http://localhost:3000

# Compilar APK localmente (requiere Android Studio)
cd camarage-android && npm install && npx cap sync android
cd android && ./gradlew assembleDebug
```

## Cambios recientes en esta sesión (Cowork, 21 mayo 2026)

Resumen de lo que se hizo desde la última actualización:

1. **Auto-asignar notas + Copiar Logic + .mid** (web admin)
   - 3 botones nuevos en tab Letras de `/songs/[id]`
   - Auto-asignar usa bulk DELETE + 150ms wait + bulk INSERT (fix race
     condition de UNIQUE constraint)
   - Notas emitidas en Yamaha convention para que Logic muestre nombres
     que matchean el MIDI que recibe el celu

2. **Posiciones MIDI absolutas en el .mid**
   - El .mid pega desde bar 1, no relativo al primer cue
   - El usuario lo arrastra al bar donde empieza la canción en Logic
   - (Su canción "Lo que vos ves" arranca en bar 600)

3. **TypeScript 5.x cast pattern**
   - `bytes as unknown as BlobPart` para `Uint8Array<ArrayBufferLike>`

4. **Sort by time on sync (fix de lyric scroll)**
   - lyrics: `.sort((a, b) => a.t - b.t)`
   - cues: `.sort((a, b) => a.timestamp - b.timestamp)`
   - chords: `.sort((a, b) => a.bar - b.bar)`

5. **Scan completo sin break en onTick scroll loop** (fix de lyric scroll)

6. **APK recompilada** y copiada a `/CAMARAGE-debug.apk` (~3.7MB)

## Cambios sesión 22 mayo 2026 (continuación)

1. **Diagnóstico de letra fantasma resuelto**: el bug de "ya no creo en la
   casualidad" a las 02:00 NO era un orphan ni cache vieja — eran 3 filas
   legítimas (estribillos) con timestamps mal cargados (02:00, 02:46, 03:00
   en vez de 02:36, 02:38, 02:46). El editor web las mostraba al final por
   `order_index` desordenado. Pato corrigió los tiempos en el editor.
   La query SQL de diagnóstico (para futuras canciones) está documentada
   más abajo en "Procedimiento: Transcribir MP3".

2. **Workflow Whisper para transcribir MP3 → SQL** (ver sección dedicada
   más abajo). Permite generar `INSERT`s con timestamps por palabra +
   line splitting por puntuación. Modelo: `base` (140MB), corre en ~30s
   en ARM64.

3. **Primer test del workflow**: canción "hace mucho que no voy a la playa"
   transcripta en 57 líneas. Archivo SQL generado en
   `insert_playa_lyrics.sql` (UUID `26eb1799-6007-4df9-b578-2038e1a63b9b`,
   ya sustituido). Pato lo pegó en Supabase y va a corregir las palabras
   alucinadas (típicas: "Risha/Rixar" → "brilla", "asmeya" → "es mi",
   "chaste sal" → "huellas de sal").

4. **Segunda canción transcripta**: "El peso que cargaba" (87 BPM,
   UUID `8a263600-aa8c-4f47-b981-b6975a0878c6`). 26 líneas en
   `insert_peso_lyrics.sql`. Whisper sufrió más con esta canción (vocal
   con flanger + mezcla densa) → quedaron gaps en los coros. Pato los
   completa a mano en el editor.

## Cambios sesión 22 mayo 2026 PM (continuación)

### 🔴 FIX · Metrónomo circular del baterista se freeza al recibir cues

**Síntoma**: Cuando Logic mandaba Notes (cues) sin Clock ticks (badge "sin
clock" visible en el log MIDI del celu), la aguja del drumHand avanzaba
brevemente con el primer cue y se freezaba.

**Root cause**: Después de un Continue (0xFB) o Start (0xFA), quedaba
`state.midiClockDriven = true`. Cada `jumpToTime()` invocado por un cue
seteaba `midi.tickSinceStart = 0; midi._lastTickArrivalAt = performance.now()`.
Eso satisfacía la condición de la rama MIDI clock en `elapsedSec()`. Como
Logic no mandaba ticks, `sinceLastTick` crecía y `Math.min(sinceLastTick,
60/state.bpm)` capeaba en 1 beat después del último tick → reloj congelado.

**Fix aplicado en `elapsedSec()` (index.html línea ~956)**:

```js
const sinceLastTickMs = midi._lastTickArrivalAt
  ? (performance.now() - midi._lastTickArrivalAt)
  : Infinity;
const clockFresh = sinceLastTickMs < 500;
if (state.midiClockDriven && midi.tickSinceStart !== undefined && clockFresh){
  // ... rama MIDI clock
}
// Fallback al reloj local cuando los ticks no llegaron en >500ms
return (performance.now() - state.startedAt + state.pausedElapsed) / 1000;
```

Con esto, si MIDI Clock REALMENTE está llegando, el código sigue anclado al
tick count (sin drift). Si Logic dejó de mandar Clock (o nunca lo mandó),
fallback al reloj local que avanza correctamente desde `state.startedAt`.

### ✨ FEATURE · Avance de setlist con trigger a Logic markers

**Decisión arquitectónica (Pato)**: NO proteger colisiones de notas entre
canciones — confía en disciplina propia en Logic (cada pista de cues solo
activa en su sección del timeline). El app filtra automáticamente porque
solo busca el note recibido en `currentSong().cues` (no en todas las
canciones del setlist).

**Lo que se agregó**:

1. **`sendMidi()` extendido** para usar Web MIDI outputs además de BLE.
   Ahora si BLE no está conectado pero hay outputs Web MIDI (IAC Driver
   en Mac, USB MIDI), manda por ahí. Esto permite testear en Chrome
   desktop con IAC sin necesidad de BLE pairing.

2. **`midi.outputs[]`** trackeado en el estado MIDI. `initWebMIDI()`
   ahora itera `access.outputs.forEach(attachMidiOutput)`.

3. **Funciones `nextSong()` / `prevSong()`** que:
   - Incrementan/decrementan `setlist.currentSongIdx` (con bounds check)
   - Llaman a `loadSong(newIdx)` (que ya hace `setStop()` + render)
   - Mandan `sendMidi(0xB0 | 0, CC, 127)` con CC#102 (next) o 103 (prev)
   - Loguean en el log MIDI con el título de la nueva canción

4. **Constantes**: `CC_NEXT_MARKER = 102`, `CC_PREV_MARKER = 103`,
   `CC_NAV_CHANNEL = 0` (canal 1 user-facing).

5. **`updateSetlistNavUI()`**: refresca los labels de los botones con
   título anterior/próximo + posición (ej "3 / 8"). Llamado desde
   `loadSong()` y al boot del setlist.

6. **Botones nuevos en vista CANTANTE y BATERISTA**: `⏮ Anterior · [título]`
   y `⏭ Próxima · [título]` debajo del Play/Stop. Disabled (opacity 0.35)
   cuando estás en la primera o última canción. La vista BAJISTA NO tiene
   botones (porque su vista no tiene transporte propio); pendiente decidir
   si agregarlos como mini-control flotante.

7. **`checkAutoAdvance(sec)`** suscrito al tick loop. Vigila si
   `secondsLeft = estDuration - sec` está entre 0 y 5. Si sí, muestra
   el overlay con countdown. La duración estimada usa `song.duration` si
   existe, sino el último lyric.t + 8s buffer.

8. **Overlay `#autoAdvanceOverlay`**: full-screen con countdown grande
   (5..4..3..2..1), título de la próxima canción, y "tocá para cancelar".
   `cursor: pointer` + handler click que setea `_autoAdvanceCancelled = true`.

9. **`loadSong()` resetea** `_autoAdvanceArmedAt`, `_autoAdvanceCancelled`,
   y oculta el overlay. Sin esto, el cancel quedaba "pegado" para
   siempre y bloqueaba auto-advance en canciones siguientes.

### Setup que Pato tiene que hacer en Logic Pro (one-time)

Para que el trigger del app efectivamente avance Logic al próximo marker:

1. Cmd+K → Controller Assignments → Expert View
2. Learn Mode ON
3. Tocar el botón "⏭ Próxima" en el app desde el celu (Logic captura `CC102=127`)
4. En el panel derecho:
   - Class: **Key Command**
   - Command: **Go to Next Marker** (o "Forward by Marker")
5. Repetir tocando "⏮ Anterior" → Class Key Command → **Go to Previous Marker**

Cada canción debe estar en su propia sección de la timeline, separada por
un Marker de Logic. El primer compás de cada sección debe tener un evento
de Program Change (el `programChange` del song en el setlist del app)
para que cuando Logic salte ahí, llegue al celu y se cargue la canción
correspondiente.

### Cambios al APK

Para que estos cambios lleguen al celu, hay que rebuildear el APK. El
sandbox de Cowork tiene solo 225MB en `/sessions` (insuficiente para
Android SDK), así que se compila en el Mac de Pato:

```bash
cd "/Users/patriciokeogan/Documents/Claude/Projects/CAMARAGE/CAMARAGE/camarage-android"
npm install
npx cap sync android
cd android
# crear local.properties si no existe
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties
./gradlew assembleDebug
```

APK final en:
`camarage-android/android/app/build/outputs/apk/debug/app-debug.apk`

### Tema sin resolver · ¿Tab "Cues MIDI" del web admin es redundante?

Con los botones nuevos en Letras (Auto-asignar + Copy Logic + .mid) y el
inline cue editor por línea, el tab dedicado "Cues MIDI" en `/songs/[id]`
quedó 90% redundante. Sigue siendo útil para:
- Cues sin letra asociada (count-in, transitions, fills instrumentales)
- Vista global de todos los cues ordenados por nota (cheatsheet)
- Editar `label` independiente del texto de la letra

Opciones propuestas (Pato no eligió todavía):
1. Dejarlo como está
2. Esconderlo detrás de un toggle "mostrar avanzado"
3. Borrarlo del todo
4. Convertirlo en vista solo-lectura (cheatsheet imprimible)

## Para retomar después del reinicio de PC

El sandbox de Cowork (entorno Linux para compilar APKs) probablemente se
reinicie también, así que para retomar:

1. Abrir nueva conversación apuntando a `CAMARAGE/CONTEXT.md` (este archivo)
2. **APK ya NO se compila en sandbox** — el sandbox tiene solo 225MB en
   /sessions, insuficiente para Android SDK. Pato compila en su Mac:
   `cd camarage-android && npm install && npx cap sync android && cd android &&
   echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties && ./gradlew assembleDebug`

3. **Primer paso operativo cuando arranque la próxima sesión**:
   - Preguntar a Pato si pudo probar el APK rebuildeado con:
     (a) fix del metrónomo (clockFresh check)
     (b) botones ⏮ Anterior / ⏭ Próxima en cantante y baterista
     (c) overlay de countdown auto-advance
     (d) trigger de CC102/103 a Logic markers
   - Si algún punto falla, debuggear desde ahí.
   - Si todo anda, próximos pasos pendientes:
     · Decidir qué hacer con el tab Cues MIDI (4 opciones documentadas)
     · Agregar botones de nav al bajista (no tiene transporte propio hoy)
     · Roadmap: SPP, auto-calibración, vista Tecladista, etc.

## Archivos clave a leer al retomar

Para tener contexto completo, en una sesión nueva conviene leer:
- `CONTEXT.md` (este archivo) — overview
- `index.html` — SPA del mobile, donde está el parser BLE MIDI + UI
- `web/app/songs/[id]/page.tsx` — editor con auto-asignar + Logic export
- `web/supabase/schema.sql` — schema autoritativo
- `web/middleware.ts` — auth gating

## PROCEDIMIENTO: Transcribir MP3 → SQL de lyric_lines (Whisper)

Pato manda MP3s de canciones y quiere que Claude genere los `INSERT INTO
lyric_lines` con timestamps + texto aproximado. Las palabras alucinadas no
importan — él las corrige a mano en el editor web después. Lo importante son
los tiempos.

### Setup del sandbox (one-time por sesión)

```bash
# 1. Verificar entorno
python3 --version    # 3.10+ esperado
which ffmpeg          # debe estar en /usr/bin

# 2. Instalar faster-whisper (~1min, baja torch/ctranslate2/etc)
pip install --break-system-packages faster-whisper
```

### Gotchas críticas de disco

- `/sessions/<id>/` (~10GB filesystem) suele tener **<300MB libres**
  después del install de faster-whisper. NO bajar el modelo ahí.
- `/sessions/<id>/mnt/outputs/` (bindfs al Mac del usuario) tiene **19GB+**.
  Bajar todo ahí.
- HuggingFace por defecto baja a `~/.cache/huggingface/` (en /sessions →
  espacio insuficiente, va a fallar a mitad de descarga).
- El modelo `small` (~484MB) idealmente, pero falla bajándolo en bindfs por
  issues con file locks. **Usar `base` (~140MB)** que sí funciona y es
  suficiente para timestamps (el texto se corrige a mano igual).
- **NO usar `pkill` agresivamente** — mata también bash y el comando devuelve
  exit 137.

### Script de transcripción canónico

Escribir en `/sessions/<id>/mnt/outputs/transcribe_words.py`:

```python
import json, time, re
from faster_whisper import WhisperModel

MP3 = "/sessions/<id>/mnt/uploads/<NOMBRE_MP3>"
OUT_LINES = "/sessions/<id>/mnt/outputs/transcription_lines.json"

t0 = time.time()
print(f"[{time.time()-t0:.1f}s] Loading base...", flush=True)
model = WhisperModel("base", device="cpu", compute_type="int8")
print(f"[{time.time()-t0:.1f}s] Transcribing with word_timestamps=True...", flush=True)

segments_iter, info = model.transcribe(
    MP3, language="es", beam_size=5, vad_filter=False,
    condition_on_previous_text=True, word_timestamps=True,
    initial_prompt="<HINT_DE_VOCABULARIO_DE_LA_CANCION>",
)

# Recolectar todas las palabras con timing
all_words = []
for seg in segments_iter:
    if seg.words:
        for w in seg.words:
            all_words.append({"start": round(w.start,3), "end": round(w.end,3), "word": w.word})

# Splitting por puntuación o max 9 palabras o max 5.5s
lines, cur_words, cur_start = [], [], None
MAX_WORDS, MAX_SECONDS = 9, 5.5
def flush():
    global cur_words, cur_start
    if cur_words:
        text = "".join(w["word"] for w in cur_words).strip()
        if text: lines.append({"start": round(cur_start,3), "text": text})
        cur_words, cur_start = [], None
for w in all_words:
    if cur_start is None: cur_start = w["start"]
    cur_words.append(w)
    tok = w["word"].strip()
    span = w["end"] - cur_start
    if re.search(r"[.,;!?]$", tok) or len(cur_words) >= MAX_WORDS or span >= MAX_SECONDS:
        flush()
flush()

with open(OUT_LINES, "w", encoding="utf-8") as f:
    json.dump({"lines": lines}, f, ensure_ascii=False, indent=2)
print(f"[{time.time()-t0:.1f}s] DONE. {len(lines)} lines.", flush=True)
```

Lanzar en background y esperar ~30s (el `base` corre rápido en ARM64):

```bash
nohup python3 /sessions/<id>/mnt/outputs/transcribe_words.py \
  > /sessions/<id>/mnt/outputs/transcribe_words.log 2>&1 < /dev/null &
disown
sleep 35
tail -60 /sessions/<id>/mnt/outputs/transcribe_words.log
```

Para canciones de hasta ~5 min, los 35s alcanzan. Para más largas subir el
sleep o pollear `transcription_lines.json` para detectar que ya existe.

### Generar SQL desde transcription_lines.json

```bash
python3 <<'PY' > /sessions/<id>/mnt/CAMARAGE/insert_<slug>_lyrics.sql
import json
with open("/sessions/<id>/mnt/outputs/transcription_lines.json") as f:
    lines = json.load(f)["lines"]
print(f"-- {len(lines)} líneas. Reemplazá <SONG_UUID> con el UUID real.\n")
print("INSERT INTO lyric_lines (song_id, order_index, start_time_seconds, text) VALUES")
rows = []
for i, l in enumerate(lines):
    txt = l['text'].replace("'", "''")  # escape SQL quotes
    rows.append(f"  ('<SONG_UUID>', {i}, {l['start']:.3f}, '{txt}')")
print(",\n".join(rows) + ";")
PY
```

El archivo queda en el workspace del usuario, listo para abrir desde Finder.

### Workflow para Pato

1. Pato sube un MP3 (drag-and-drop en chat) y opcionalmente pasa el UUID
   de la canción ya creada en `camarage.vercel.app/songs`.
2. Claude corre transcript + SQL gen.
3. Si pasó UUID, Claude hace el find/replace de `<SONG_UUID>` y entrega
   el SQL final. Si no, devuelve el archivo con placeholder.
4. Pato pega en Supabase SQL Editor → Run.
5. Pato corrige texto en `/songs/[id]` del web admin (Whisper alucina
   palabras pero los tiempos son buenos).
6. Pato hace "↻ Sincronizar ahora" en el celu y prueba.

### Tunables del splitter

- `MAX_WORDS = 9` y `MAX_SECONDS = 5.5` → da ~3-6s por línea, bien para
  letras leíbles en escenario.
- Subir a 12 words / 7s para líneas más largas (estilo verso completo).
- Bajar a 5 words / 3s para letras muy rítmicas con cortes constantes.

### Pitfalls observados con el modelo `base`

- Palabras inventadas frecuentes: "Risha"/"Rixar" → "brilla", "asmeya" →
  "es mi", "chaste sal" → "huellas de sal", "rastrar" → "arrastrar".
- Pasajes instrumentales largos → Whisper sigue inventando ("Os vixar a
  pisebaro" sobre silencio). Pato los borra a mano.
- Lo bueno: los tiempos `start_time_seconds` por palabra son sorprendentemente
  precisos (±0.3s del onset real del verso).

## Cambios sesión 25 mayo 2026 · Setup AKAI MPK49 + arquitectura PC

### 🎹 AKAI MPK49 — Preset 30 "CAMARAGE" configurado vía Vyzex (Windows)

Vyzex MPK49 es 32-bit y no corre en Sequoia/M2. Pato lo corrió desde una PC
Windows con el MPK conectado por USB para evitar pelearse con los knobs
K5/K6 driftando al usar Edit Mode físico.

**Configuración del preset 30 ("CAMARAGE"), guardada en el MPK y backup
file en PC**:

| Controlador | Port | Canal | Tipo | Detalle |
|-------------|------|-------|------|---------|
| KBD (teclas) | A | 2 | Note | Va a MainStage |
| Pitch Wheel | A | 2 | Pitch | Va a MainStage |
| Mod Wheel | A | 2 | CC#1 | Va a MainStage |
| Sustain Pedal | A | 2 | CC#64 | Va a MainStage |
| Faders F1-F8 | A | COMMON (=2) | CC 20-27 | Va a MainStage |
| Switches S1-S8 | A | COMMON (=2) | CC 28-47 | Va a MainStage |
| **Pads 1-12 (Bank A)** | **B** | **1** | **Note** | Notas 35-48 — Logic |
| Pads 1-12 (Bank B) | B | 1 | Note | Continuación, mapeados también |
| **Knobs K1-K8** | **B** | **16** | **CC 3-19** | **Zona muerta — neutralizados** |
| MMC (transport) | A | n/a | SysEx | Play/Stop/<< >> |

**Decisión clave**: knobs movidos a Port B canal 16 para que ni MainStage
ni Logic los reciban → workaround del drift sin reparar hardware.

**Backup del preset**: archivo `.syx` en la PC de Pato.

### 🎚 Logic Controller Assignments — Zona "PADS"

Mapeados 20 pads (Bank A + Bank B) a `Go to Marker Number 1-20`.

- Input: **Akai MPK49 Port 2** (Port B)
- Channel: 1
- Class: Key Command
- Notas capturadas (Bank A): 35 (Pad1), 36, 42, 39, 40, 38, 44, 46, 37, 48,
  45, 43. Bank B: 49, 52, 53, 51, 68, 69, 54, 55.

**Estrategia para capturar pads sin drift de knobs**: Pato clavó K5+K6 con
la mano izquierda mientras tocaba pads con la derecha durante Learn Mode.
Funcionó perfecto, no hizo falta filtrar canal 16 en Logic Environment
(que de todas formas no existe en Logic 11).

### 🎵 15 canciones en Supabase con program_change asignado

`program_change` matchea 1-a-1 con el número de marker en Logic:

| PC | UUID | Título | Marker Logic |
|----|------|--------|--------------|
| 1 | a5634ee9-d2c8-499d-8b74-d459f6170e88 | Cuando despierte | bar 64 |
| 2 | b3208f9b-bde9-4cc8-8cf9-4cb2fb4280bc | Nos devora el tiempo | bar 220 |
| 3 | 464bd009-d531-49fc-9233-1026c0790eb5 | Velocidad | bar 383 |
| 4 | 5d2ba0dc-d3d2-4d6f-be86-5a06b50077b0 | Enfrentar el presente | bar 592 |
| 5 | 330b8fee-8fdb-4c90-814f-dbd0c9a85a88 | Espero | bar 818 |
| 6 | 8f02f359-457d-4e6e-8a64-58f3099c1a2a | Algo de tiempo | bar 922 |
| 7 | 36b0dfb6-5f67-4b07-a4f9-d99cb95640c4 | Nada es nada | bar 1091 |
| 8 | b3363e2d-b965-4870-b5b3-6dccba33bc25 | Esta vez | bar 1246 |
| 9 | 3b1de801-58bf-44b2-a8b5-373cb070bffb | Qué decir | bar 1429 |
| 10 | 5f1ec137-6a4f-44a4-a462-17406deac717 | Tardaste en despertar | bar 1702 |
| 11 | 0eba0481-4edf-45ae-8177-62ae52a89e61 | Lo que digo y lo que pienso | bar 1954 |
| 12 | 6460663e-0360-46a4-9152-8ad2db12e2d1 | Olvidar quien soy | bar 2444 |
| 13 | 8a263600-aa8c-4f47-b981-b6975a0878c6 | El peso que cargaba | bar 2744 |
| 14 | 9588d603-ee68-4d53-8fb1-29131222c251 | Absorber | bar 4483 |
| 15 | 26eb1799-6007-4df9-b578-2038e1a63b9b | Hace mucho que no voy a la playa | bar 5258 |

Las 11 nuevas se INSERTaron con BPM default (120) y sin más metadata —
hay que cargarles BPM real, key, time_signature, etc. después. Las 4
existentes solo se les hizo UPDATE del program_change.

### 🎹 Logic — Track "PC → CAMARAGE"

Creado un track **External MIDI** dedicado con:
- Port: A56 de Patricio (BLE)
- Canal: 2
- Una región MIDI que abarca todo el proyecto
- 15 eventos Program Change colocados en cada marker, con `Val = N` que
  matchea el `program_change` del song correspondiente

### ✅ Chase Program Change activado

`File → Project Settings → MIDI → Chase` → "Program Change" + "Notes"
marcado. Esto hace que cuando el playhead salta a un marker (via pad o
mouse), Logic re-envíe el último PC en o antes de esa posición.

**Funcionamiento confirmado**: tocando un pad → Logic salta al marker →
PC se dispara → llega al celu por BLE → app carga la canción correspondiente.

### 🐛 BUG ABIERTO · KBD del MPK dispara letras del celu

**Síntoma**: Al tocar las teclas del MPK49 (KBD), las letras en el celu
saltan a cualquier lado.

**Root cause**: Logic forwardea live input del Port A (KBD) al output del
track BLE seleccionado/record-enabled. Las notas del piano viajan por el
mismo canal 2 a la BLE y la app las interpreta como cues de letras.

**Opciones discutidas (Pato eligió cuál mañana)**:

1. **Quick fix**: Seleccionar una pista de audio al performar (no la "PC
   → CAMARAGE" ni cue tracks). Apagar todos los "R" (record-enable).
   Frágil pero inmediato.

2. **Fix robusto (RECOMENDADO)**: Logic Pro → Settings → MIDI → Inputs →
   deshabilitar "AKAI MPK49" (Port A). Pierde MMC desde el MPK, pero la
   app tiene botones Play/Stop que mandan MIDI a Logic igual.
   MainStage no se afecta (recibe Port A directo desde CoreMIDI).

3. **Fix surgical (si quiere mantener MMC)**: Scripter MIDI FX en cada
   pista BLE-bound que filtre live input (deja pasar solo eventos de
   región/playback). Más laburo.

4. **Fix nuclear**: MIDI Pipe entre MPK y Logic para filtrar canal 2 de
   Port A pero dejar pasar SysEx (MMC).

### ⏭ Fase pendiente · Pad → PC directo (Phase 4)

Pato eligió "ambos en paralelo" pero pospuso esta fase porque Chase solo
ya cubrió el caso de uso. Si más adelante el chase tiene latencia o
inconsistencias, agregar Scripter en una pista que convierta notas de
pads (35-48 channel 1) → Program Change al BLE.

### Próximos pasos cuando retomemos

1. **Decidir y aplicar el fix del bleed KBD → letras** (opciones 1-4 arriba).
2. **Test end-to-end completo con celu**: tocar cada pad y confirmar
   que la canción correcta se carga en el app. Verificar convención
   0-indexed vs 1-indexed del PC value (Logic mostraba "Bright Piano"
   para Val=1, lo cual sugiere raw byte = 1 = matchea DB program_change=1).
3. **Cargar BPM y metadata** de las 11 canciones nuevas en Supabase.
4. **Backup de Controller Assignments** de Logic (preferiblemente
   exportar el `.cs` file) — son globales de Logic, no parte del proyecto.
5. **Backup del proyecto Logic** (⌘S, copiar a Time Machine/Dropbox).

## Cambios sesión 18 jun 2026 · Intento de modo periférico BLE MIDI (celu como periférico)

### Objetivo de la sesión
Pato necesita 3 cosas a la vez por el Bluetooth del Mac:
1. WIDI Master (en MPK49, IN+OUT) → Logic + MainStage.
2. App CAMARAGE sincronizada con clock de Logic con precisión.
3. Un segundo dispositivo WIDI en otro canal.

Problema raíz: macOS BLE MIDI hace **un solo rol a la vez**. El Mac no puede
*anunciarse* (periférico, para que el celu se conecte como central — el modo
original que funcionaba) **mientras** está conectado como *central* a los WIDI.
Por eso se intentó invertir: que el **celu sea el periférico** y el Mac central
de todo (WIDI + celu), que CoreMIDI sí soporta (central → N periféricos).

### Qué se construyó
- **`camarage-android/.../com/camarage/live/MidiPeripheralPlugin.java`** (NUEVO):
  plugin Capacitor nativo que hostea un GATT server BLE MIDI (servicio
  `03b80e5a…`, característica `7772e5db…` con READ/WRITE/WRITE_NO_RESPONSE/NOTIFY
  + CCCD `0x2902`) y advertising. Reenvía writes entrantes a JS (`midiReceived`)
  y expone `send()` que notifica a los centrales. Eventos: `centralConnected`,
  `centralDisconnected`, `advertiseFailed`. Logging extenso para diagnóstico.
- **`MainActivity.java`**: registra el plugin (`registerPlugin`).
- **`AndroidManifest.xml`**: agrega `BLUETOOTH_ADVERTISE`.
- **`index.html`**: en `connectBleMidi()` se agregó la rama de modo periférico
  (default conmutable por `localStorage 'camarage_ble_mode'`), `sendMidi()` con
  branch `ble-peripheral`, y **soporte SPP (0xF2)** en `handleMidiBytes` para
  sync mid-song / saltos de marker (reposiciona como `jumpToTime` sin forzar
  play). También se corrigió que System Common (0xF0-0xF7) cancele el running
  status en el parser.

### Hallazgos (por qué NO funcionó el periférico con macOS)
Tras muchas iteraciones y un test limpio (caché del Mac borrada con reinicio,
device fresco "CAMARAGE" reconocido como "MIDI Input/Output", WIDI desenchufado):
- El celu **anuncia bien** y el Mac **se conecta** (status=0)…
- …pero macOS **nunca hace el handshake MIDI**: no negocia MTU, no escribe el
  CCCD (no se suscribe), no manda writes (clock). A los **30s exactos** el celu
  deshecha la conexión por inactividad. En Audio MIDI Setup el device dice
  "Connecting…" y desaparece.
- **Conclusión**: el driver BLE MIDI *central* de Apple (el que usa Audio MIDI
  Setup) no engancha un periférico BLE MIDI hosteado por Android. Límite del
  driver de Apple, no del enlace BLE (que conecta perfecto).
- **Interferencia del WIDI**: el WIDI Master tiene auto-connect y **se conecta
  solo al celu** cuando lo ve anunciar BLE MIDI, robándole el periférico y (con
  encriptación activada) disparando un pairing "vincular con WIDI Master" que
  falla (`SMP_NUMERIC_COMPAR_FAIL`). Un WIDI Master sostiene **un solo enlace
  BLE** → no puede estar con el Mac y el celu a la vez.
- **Spec BLE-MIDI**: la característica MIDI debería requerir **encriptación**
  (se aplicó `PERMISSION_*_ENCRYPTED`), lo que fuerza bonding. No alcanzó para
  que macOS enganchara.
- **Caché GATT del Mac**: una race condition (el Mac conectaba antes de que
  `addService` terminara) hacía que macOS cacheara "sin servicio MIDI". Se
  arregló el orden (advertising recién en `onServiceAdded`), pero limpiar la
  caché ya envenenada requiere **reiniciar el Mac** (togglear BT o quitar el
  device de MIDI Studio NO alcanza).

### Estado actual del código
- **Default revertido a modo CENTRAL** (el que funcionaba: Mac anuncia, celu se
  conecta). En `index.html`:
  `const preferPeripheral = localStorage.getItem('camarage_ble_mode') === 'peripheral';`
  Para experimentar con periférico: `localStorage.setItem('camarage_ble_mode','peripheral')`.
- El plugin nativo y todo el código periférico **quedan en el repo** por si se
  retoma (p. ej. con app de Mac, ver abajo).
- SPP y el fix de running status quedan activos (sirven en cualquier modo).

### Opciones a futuro (decidir con Pato)
**A. WIDI Bud Pro / uHost (~USD 50-100) — hardware.** Dongle USB al Mac que
   actúa de hub de un grupo WIDI. Conecta WIDI Master + 2º WIDI + **celu** y
   reparte el MIDI (incl. clock de Logic). Resuelve los 3 requisitos sin tocar
   el BT interno del Mac y sin el problema de Android. CME recomienda Bud Pro/
   uHost **específicamente** para meter Android en un grupo WIDI. Usa el modo
   central de la app (el que funciona).

**B. App de Mac CoreBluetooth → CoreMIDI bridge — software, sin hardware.**
   Una app nativa (Swift) que use **CoreBluetooth directo** (no el BLE MIDI de
   Audio MIDI Setup) para: escanear, conectar como central a N periféricos BLE
   MIDI (los 2 WIDI **y** el celu en modo periférico), manejar el GATT a mano
   (discovery/subscribe/write), y puentear cada uno a un **puerto MIDI virtual**
   de CoreMIDI que Logic/MainStage ven como puerto normal. El Mac SÍ soporta
   múltiples conexiones como central. Reusa el código periférico ya hecho.
   - **Test gratis previo**: instalar **midimittr** (app existente que hace
     CoreBluetooth↔CoreMIDI) y ver si engancha el periférico "CAMARAGE" y lo
     expone a Logic. Si funciona → el approach está validado.
   - Caveats: dev real (portar el parser BLE MIDI de JS a Swift); validar ancho
     de banda BLE con clock + varios dispositivos; manejar bonding.
   - Para esta ruta probablemente convenga **revertir la encriptación** del
     plugin (una app propia no necesita el requisito de la spec de Apple).

**C. Quedarse en modo central con UN dispositivo BLE por vez** (lo que hay hoy).
   Funciona para ensayar; no cumple el objetivo de 2 WIDI + celu simultáneos.

### Próximo paso sugerido cuando retomemos
1. Probar **midimittr** con el celu en modo periférico
   (`localStorage 'peripheral'`) → si engancha, ir por la **opción B**.
2. Si no, evaluar comprar el **WIDI Bud Pro** (opción A).
3. Confirmar primero que el modo central revertido sincroniza OK (Mac Advertise
   + celu CONECTAR BLE, WIDI desenchufado).

### Entorno de build (recordatorio)
APK se compila en el Mac de Pato (sandbox sin espacio para Android SDK):
```bash
cd camarage-android && npx cap sync android && cd android && \
./gradlew assembleDebug && \
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
```
Cambios solo-Java → basta `./gradlew assembleDebug`. Cambios en `index.html` →
`npx cap sync android` primero (copia `www/`). Logs: `adb logcat -s CamarageMidiPeri`.

## Cambios sesión 19 jun 2026 (madrugada) · MODO ROUTER (celu central de WIDI + Mac)

### Decisión y arquitectura
Pato NO quiere cables (problema de hub que drena batería del Mac). Tras descartar
el periférico (sección anterior), se eligió el **celu como ROUTER**: el celu es
**central** de DOS periféricos a la vez —el WIDI (en el MPK) y el Mac (Advertise)—
y reenvía el MIDI del instrumento al Mac. Usa el rol fuerte/estable del celu.

### Qué se construyó (todo en `index.html`, sin nativo nuevo)
- **`preferPeripheral` default = CENTRAL** (`localStorage 'camarage_ble_mode'==='peripheral'`
  para el modo viejo). El periférico quedó deshabilitado por default.
- **`parseBleMidiPacket(bytes, handler)`**: ahora acepta un handler. Default
  `handleMidiBytes` (sync). El instrumento usa `forwardToDaw`.
- **`forwardToDaw(midiBytes)`**: envuelve en `makeBleMidiPacket` y escribe al DAW
  (Mac, `midi.device`). Sin log por nota (alto rate).
- **`connectInstrument()`**: conecta el WIDI como central, `requestConnectionPriority
  high` (intervalo 7,5ms), startNotifications → `parseBleMidiPacket(bytes, forwardToDaw)`.
  Guarda `midi.inst`. Listener keyed-only por deviceId (sin fallback genérico, para
  no duplicar notas).
- **DAW connect**: también con `requestConnectionPriority high`; listener keyed-only.
- **UI**: botón "+ Conectar instrumento (WIDI)" en el modal; "Desconectar" corta
  ambos (DAW + inst).
- **Plugin nativo de encriptación REVERTIDO** a permisos sin encriptación
  (`PERMISSION_READ|WRITE`) — la app de Mac/central no la necesita.

### RESULTADO del test (parcial — un muro nuevo)
**LO QUE FUNCIONA:**
- El celu conecta a los dos (WIDI + Mac) **estable**, rol central.
- **Sync Logic→celu IMPECABLE**: clock (badge "clock ×N/s ≈ BPM"), Program Change
  (cambios de canción, p.ej. "PC#06 → Algo de tiempo"), SPP (beat/segundos), CC,
  Continue, Stop. El corazón de CAMARAGE anda.
- El MPK→WIDI→celu→Mac **fluye a nivel BLE**: el log muestra notificaciones del
  WIDI (`10:2E:AB:D6:8F:64`) y writes al Mac (`onWriteCharacteristic … status=0`),
  con valores MIDI válidos decodificados (ej. `91 35 72` = Note On canal 2).
- `requestConnectionPriority high` → `onConnectionUpdated interval=6` (7,5ms),
  latencia mínima conseguida.

**EL MURO (no resuelto):**
- macOS, actuando como **periférico BLE (Advertise)**, **NO expone como fuente
  CoreMIDI los WRITES que recibe del central**. Las notas del MPK llegan al
  Bluetooth del Mac (BLE status:0) pero NO aparecen como eventos MIDI en MIDI
  Monitor ni en MainStage (probadas las dos apps, fuente "CAMARAGE Bluetooth"
  tildada). La dirección inversa (Mac→celu, por NOTIFY) sí anda (el clock llega).
- O sea: macOS-periférico hace bien el NOTIFY (out) pero no surfacea los WRITES
  (in) como MIDI source. Mismo tipo de límite del driver de Apple, dirección inversa.
- El paquete reenviado es válido (no es problema de formato).

### Diagnóstico pendiente para próxima sesión (agotar vía sin hardware)
1. Confirmar si macOS-periférico surfacea los writes de **cualquier** central
   conocido-bueno: otro celu/tablet con app BLE MIDI escribiéndole al Mac (Advertise)
   → si tampoco aparece en MIDI Monitor, queda 100% confirmado que es límite de
   macOS y no de nuestro código.
2. Si se confirma el límite → no hay forma de meter el MPK al Mac vía el celu-router.

### CONCLUSIÓN / camino recomendado
- El **sync (Logic→celu)** funciona y es usable HOY en modo central (Mac Advertise
  + celu CONECTAR BLE), sin el WIDI en el Bluetooth del Mac.
- Para el **MPK→MainStage (piano) inalámbrico**, el celu-router está bloqueado por
  macOS. La salida limpia sigue siendo el **WIDI Bud Pro**: el MPK llega al Mac
  DIRECTO (WIDI→Bud Pro→USB→Mac, ~5ms, esquiva el muro) y el celu recibe el clock
  por Bluetooth (que ya anda). Pato lo compra "más adelante".
- El **WIDI Jack** (USB-C solo alimentación, sin datos) NO sirve de receptor; su
  rol es adaptador inalámbrico de un 2º instrumento DIN/TRS en el grupo del Bud Pro.

### Estado del código al cerrar
- Modo router implementado y funcional para sync; el ruteo MPK→Mac depende del muro
  de macOS. Default = central. Todo en `index.html` + plugin nativo (periférico)
  queda en el repo por si se retoma.
- Build: `cd camarage-android && npx cap sync android && cd android &&
  ./gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk`

## Cambios sesión 20 jun 2026 · Router — UX + diagnóstico fino del MPK→Mac

### UX agregada al modal de Conexión (index.html)
- **Tarjetas de estado** DAW (Mac) e Instrumento (WIDI) con ● conectado / ○ off
  y borde verde al conectar (validación visual clara).
- **Botones** cambian a "✓ Mac conectado" / "✓ Instrumento conectado" cuando lo están.
- **Panel "MIDI through · WIDI → Mac"**: contador + última nota ruteada (validación
  en vivo desde el celu). Alimentado por `forwardToDaw` (`midi.throughCount`,
  `midi.lastThrough`).
- **Acordeones**: Canal MIDI, Cues, Cuenta, Sync, Latency y el log MIDI quedan en
  `<details>` colapsados (vía atributo `data-acc` + script que los envuelve).

### DIAGNÓSTICO CLAVE del MPK→Mac (lo más importante de esta sesión)
Con `log stream --predicate 'process == "MIDIServer"'` en el Mac y tocando el MPK:
- El **MIDIServer del Mac SÍ recibe y parsea** las notas reenviadas por el celu:
  `MIDIServer (AppleMIDIBluetoothDriver) Received value of length 1` (= 1 evento;
  active sensing idle y notas dan ambos "length 1" → confirma que es nº de eventos).
- El celu manda paquetes BLE MIDI **impecables** (decodificados: `91 3c 7f` = Note On
  ch2 C4 v127; `91 43 6f` = Note On ch2 G4; etc. con timestamps monótonos).
- PERO las notas **NO se entregan** a MIDI Monitor ni a MainStage (ni con input "All",
  ni en modo Perform; las teclas no se mueven).
- **Play/Stop (realtime) SÍ funcionaban** por este mismo camino en la app deployada.

**Hipótesis principal (fuerte):** los mensajes **realtime** (0xF8/0xFA/0xFC) se
entregan al instante, pero las notas **channel-voice** macOS las **agenda según el
timestamp BLE MIDI**. Algo de nuestro timestamp (`Date.now() & 0x1FFF` en
`makeBleMidiPacket`) hace que macOS las descarte/mal-agende → recibe+parsea pero no
entrega. Es un tema fino de scheduling de CoreMIDI, NO un muro duro de Apple.

**Conclusión:** NO es que macOS no pueda (recibe y parsea). Es un bug de timing en
los paquetes que reenviamos. Fixeable pero requiere iterar el timestamp con rebuilds.

### Próximos pasos para el MPK→Mac (próxima sesión)
1. **Experimento de timestamp** en `makeBleMidiPacket`: probar variantes (p.ej.
   timestamp monótono desde `performance.now()`, o forzar entrega inmediata) y ver
   si las notas (channel-voice) aparecen en MIDI Monitor. El realtime ya pasa, así
   que tocar el timestamp no rompe Play/Stop.
2. Si el timestamp no lo resuelve: considerar ruteo nativo (forward en Kotlin sin
   el puente JS) o aceptar el **WIDI Bud Pro** (MPK directo al Mac, esquiva todo esto).

### Estado: el SYNC (Logic→celu) anda perfecto; el MPK→Mac quedó en este punto.

### ⭐ BREAKTHROUGH (20 jun, sesión tarde) — modo PERIFÉRICO con NOTIFY SÍ surfacea
Tras reiniciar el Bluetooth del Mac + los fixes acumulados, el modo **periférico**
(celu periférico → Mac central) ahora completa el handshake COMPLETO:
`MTU negociado=517` → `READ característica` → `CCCD subscribe val=0100` → y macOS
hasta NOS ESCRIBE (RX write SysEx). El muro de los 30s-sin-enganche **desapareció**.

Y lo CLAVE: en modo periférico, cuando el celu **NOTIFICA** (no write), macOS lo
**surfacea como fuente MIDI**. PROBADO: apretando Play/Stop en la app (que notifican
0xFA/0xFC), en **MIDI Monitor del Mac aparecen "Start"/"Stop" desde "CAMARAGE
Bluetooth"**. ✅ Esa es la dirección que funciona (el write del central NO surfaceaba,
el NOTIFY del periférico SÍ).

**Arquitectura ganadora (en implementación):**
- Celu = PERIFÉRICO del Mac. Mac se suscribe. Celu NOTIFICA las notas del MPK →
  macOS las surfacea como fuente → MainStage/Logic. (Las notas del MPK se reenvían
  por `forwardToDaw`, que ahora tiene rama `ble-peripheral` → `peri.send()` notify.)
- Clock/PC/cues de Logic → el Mac (central) ESCRIBE al celu → `onCharacteristicWriteRequest`
  → `midiReceived` → parseBleMidiPacket → sync. (Verificar que el clock llegue así.)
- WIDI: el celu es CENTRAL del WIDI (plugin community) Y periférico del Mac
  (plugin nativo) a la vez = dual-role. connectInstrument conecta el WIDI.

**PENDIENTE para cerrar:**
1. **Estabilidad**: la conexión periférica aguanta ~30s y se cae (flapping). Posible
   causa: macOS abre múltiples conexiones (varios "Central conectado") y al cerrar
   una, nuestro `connectedDevices` (Set por device) queda vacío y declara desconexión
   prematura + re-anuncia → churn. Revisar manejo de múltiples conexiones / el
   stop-advertising-on-connect. (O posible: macOS espera respuesta a un SysEx de
   inquiry y dropea a los 30s si no contesta.)
2. Verificar clock Logic→celu por writes en modo periférico.
3. Probar el dual-role (WIDI central + Mac periférico simultáneo) estable.

El default quedó en PERIFÉRICO (`preferPeripheral` default true) para esta ruta.

### CIERRE del MPK→Mac vía router — CONFIRMADO bloqueado por macOS
Se probaron y DESCARTARON: timestamp monótono (`performance.now()` en
`makeBleMidiPacket`), filtro de active sensing en `forwardToDaw`, caché limpia,
fuentes sin duplicados (en MIDI Monitor aparece UNA sola "A56 de Patricio
Bluetooth"). Resultado idéntico:
- El **MIDIServer del Mac recibe y parsea** las notas (`AppleMIDIBluetoothDriver
  Received value of length 1`, offset 0 = entrega inmediata).
- Pero **NO las entrega a ninguna fuente CoreMIDI**: MIDI Monitor (fuente tildada),
  Logic (pista armada) y MainStage (input All, modo Perform) → **todos vacíos**.
- Play/Stop (realtime) sí pasaban por el mismo camino → confirma que es específico
  de los mensajes **channel-voice** que macOS no surfacea cuando el Mac es periférico
  y un central Android le escribe.

**VEREDICTO FINAL:** el celu-router NO puede llevar el MPK al Mac por un límite del
BLE MIDI de macOS (Mac periférico no entrega los writes channel-voice del central a
CoreMIDI). No es arreglable desde la app del celu. 

**Lo que SÍ queda funcionando y es usable:** el SYNC Logic→celu por el router
(clock, PC/cambios de canción, SPP, CC) — el corazón de CAMARAGE.

**Para el MPK→MainStage (piano) inalámbrico → WIDI Bud Pro** (MPK directo al Mac por
USB-dongle, esquiva todo este puente). Pendiente de compra. El celu sigue con el
sync por Bluetooth en paralelo.

(Vía no agotada por si se retoma algún día: ruteo NATIVO en Kotlin en vez del puente
JS — improbable que cambie, porque el bloqueo es la entrega de macOS, no el celu.)

## Fin del snapshot
