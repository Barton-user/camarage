# CAMARAGE · Project Context Snapshot

> Documento para retomar el proyecto en otra conversación de Claude.
> Última actualización: 22 mayo 2026

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
- ⚠️ **Bug actual abierto**: cuando llega un cue MIDI al celu, el toast aparece
  con la info correcta pero la letra principal NO se mueve. Logic envía Note On,
  el cue se identifica, jumpToTime se llama, pero el lyric scroll no actualiza.
  Última hipótesis: state.isPlaying queda true pero el clock loop (tickHandle)
  está muerto. Fix aplicado: jumpToTime ahora SIEMPRE llama startClock() para
  asegurar que el loop está corriendo. Pendiente: usuario probar último APK
  y confirmar.
- ⚠️ Convención de notas Logic vs estándar:
  - Logic Pro por default muestra MIDI 60 como **C3** (Yamaha convention).
  - Mi app y el estándar internacional usan **C4 = MIDI 60**.
  - Resultado: cuando Logic muestra "E4" en pantalla, manda MIDI 76 que mi app
    correctamente identifica como E5.
  - Solución elegida: el usuario subió sus cues una octava en la web admin
    (C4→C5, D4→D5, etc.) para que matcheen lo que Logic manda.
  - Alternativa pendiente: en Logic Settings buscar "Display Middle C" y
    cambiar a C4 (no encontró la opción en su versión).

### FEATURES NUEVAS RECIÉN AGREGADAS (web admin):
- ✅ **Auto-asignar notas MIDI a todas las letras** (botón en tab Letras):
  borra cues existentes y asigna C3, C#3, D3, D#3... chromatic a cada línea
  en orden cronológico. Una nota por línea.
- ✅ **Copiar para Logic** (botón en tab Letras): pone en el portapapeles
  el texto en formato Logic Event List exacto (con ♯ Unicode, tabs, doble
  línea por nota con Rel Vel). El usuario pega en Event List de Logic.
- ✅ **Descargar .mid** (botón en tab Letras): backup como archivo MIDI
  estándar para drag-and-drop en cualquier DAW.

### TODO POR EMPEZAR:
- ❌ Resolver definitivamente el bug del lyric scroll en respuesta a cues
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
- **Sync Supabase**: load del cache localStorage al boot, pull en background
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

### 🔴 BUG ACTIVO — lyric scroll no reacciona a cues
- Logic manda Note On por BLE
- APK recibe (visible en log MIDI)
- Cue se identifica (toast aparece con info correcta)
- jumpToTime se llama (último fix agregó log visible)
- Pero la letra principal sigue en la primera línea ("nunca pude imaginar")
- BAR/BEAT/tiempo del header sigue en 00:00

**Hipótesis activa**: state.isPlaying=true pero state.tickHandle=null
(loop muerto). Último fix aplicado: jumpToTime SIEMPRE llama startClock()
independiente de si estaba playing.

**Pendiente**: usuario probar APK reciente y reportar.

### 🟡 Convención de notas Logic
- Logic muestra C3 como middle C (Yamaha convention)
- Mi app usa estándar C4=60
- Workaround: subir cues una octava (C4→C5)
- Mejor solución: cambiar Logic preference. No encontró la opción en su versión 11.x

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

## Fin del snapshot
