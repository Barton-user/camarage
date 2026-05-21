# CAMARAGE · Project Context Snapshot

> Documento para retomar el proyecto en otra conversación de Claude.
> Última actualización: 21 mayo 2026

## Resumen del proyecto

App de sincronización en vivo para bandas. El celular se conecta vía **BLE MIDI**
al Mac donde corre Logic Pro. Cuando Logic manda Program Change, Note On (cues),
Clock y Start/Stop, la app del celu reacciona en tiempo real mostrando letras,
cifrado del bajo y metrónomo visual, todo sincronizado al ritmo real del DAW.

Existe también una web admin (Next.js en Vercel) para configurar setlists,
canciones, letras y cues desde una computadora cómoda. Los datos se guardan en
Supabase. El celu sincroniza al abrir + manual; funciona offline una vez
cacheado.

**Usuario:** Pato (patricio.keogan@sinis.com.ar)
**Banda:** "CAMARAGE" (también el nombre del producto/repo)
**Hardware target:** Samsung A56 (Android) + MacBook Pro

## Arquitectura

```
┌─────────────────┐  BLE MIDI   ┌──────────────────┐
│  Mac + Logic    │ ◄─────────► │  Samsung A56     │
│  Pro (DAW)      │   wireless  │  APK CAMARAGE    │
└─────────────────┘             └──────────────────┘
                                         │
                                         │ sync HTTPS (al abrir + manual)
                                         ▼
                                ┌────────────────────┐
                                │  Supabase          │
                                │  Postgres + Auth   │
                                │  + RLS             │
                                └────────────────────┘
                                         ▲
                                         │
                                ┌────────────────────┐
                                │  Vercel            │
                                │  Next.js web admin │
                                │  camarage.vercel.app│
                                └────────────────────┘
```

## Estado actual end-to-end

**FUNCIONANDO:**
- ✅ APK Android compilado y firmado debug (3.7MB)
- ✅ Conexión BLE MIDI nativa (plugin @capacitor-community/bluetooth-le)
- ✅ Parser BLE MIDI con state machine compliant a spec 1.0
- ✅ Recepción de Clock, Start, Stop, Program Change, Note On (cues), CC
- ✅ Envío MIDI saliente (Play/Stop del celu hacia Logic)
- ✅ BPM derivado de timestamps embebidos BLE (precisión ~1 BPM)
- ✅ Posición de canción anclada a tick count desde Start (sin drift)
- ✅ Latency compensation predictivo Web Audio (default 88ms, slider 0-200ms)
- ✅ Modal de configuración: filtro canal MIDI, log mensajes en vivo, calibración
- ✅ 3 vistas + Setlist Editor + bottom nav
- ✅ Schema Supabase 13 tablas con RLS aplicado en proyecto del usuario
- ✅ Web admin Next.js 14 compila limpio, deployada en Vercel
- ✅ Repo en GitHub https://github.com/Barton-user/camarage
- ✅ Push exitoso (commit inicial)

**PARCIALMENTE FUNCIONANDO / EN DEBUG:**
- ⚠️ Vercel deploy: el build sí compila Next.js ahora (después de fixear
  Framework Preset a Next.js y Root Directory a `web`), pero el LOGIN MAGIC
  LINK no completa la sesión — el link expira al primer click o el mail client
  hace preview-scan consumiendo el token. Última URL vista:
  `https://camarage.vercel.app/login#error=access_denied&error_code=otp_expired`
- ⚠️ Sync app móvil ↔ Supabase: implementado pero NO testeado end-to-end
  porque depende de poder loguearse en la web admin para crear data primero.

**TODO POR EMPEZAR:**
- ❌ Auto-calibración de latencia con micrófono del celu
- ❌ Continue mode (resumir desde posición actual de Logic, no desde 0)
- ❌ Soporte Song Position Pointer (0xF2)
- ❌ Vista Tecladista, Guitarrista
- ❌ Modo paisaje iPad
- ❌ Export cues a archivo .mid
- ❌ Gestión de miembros de banda con invite links
- ❌ Realtime sync entre miembros de banda durante el show

## Credenciales y URLs importantes

### Supabase
- **Project URL**: `https://ccytqubmroxjaiwtzsfh.supabase.co`
- **Anon key**: (en localStorage del celu y en Vercel env vars) — el usuario
  la copió desde Supabase Dashboard → Settings → API → Publishable keys
- **Project ID**: `ccytqubmroxjaiwtzsfh`
- **Owner**: Pato (patricio.keogan@sinis.com.ar)
- **Schema aplicado**: SÍ, las 13 tablas + RLS + triggers + view están creadas
- **Site URL configurada**: `https://camarage.vercel.app` ✓
- **Redirect URLs**: `https://camarage.vercel.app/auth/callback` ✓
- **PENDIENTE**: verificar setting "Confirm email" en Auth → Providers → Email,
  y verificar que el flow PKCE esté usando query param `?code=` (no hash
  fragment con error_code)

### Vercel
- **Project**: camarage
- **URL primary**: `https://camarage.vercel.app` (custom alias)
- **URL deploy**: `camarage-2dxs6ja3e-pato-k-s-projects.vercel.app`
- **Framework**: Next.js (después del fix)
- **Root Directory**: `web` (después del fix)
- **Env vars**:
  - `NEXT_PUBLIC_SUPABASE_URL` = la URL de Supabase
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la publishable key

### GitHub
- **Repo**: https://github.com/Barton-user/camarage
- **Owner**: Barton-user (la cuenta GitHub del usuario)
- **Branch principal**: `main`
- **Estado**: Pusheado el commit inicial. Pendiente: hacer un segundo push con
  los cambios del SETUP.md, .vercelignore eliminado, web/ con todos los archivos.

## Estructura del repo

```
CAMARAGE/                                    # workspace folder del usuario
├── index.html                               # SPA del mobile (fuente del APK)
├── singer_view.html                         # primer prototipo solo Cantante
├── supabase_schema.sql                      # schema viejo (no usar, usar web/supabase/schema.sql)
├── README.md                                # readme principal del repo
├── SETUP.md                                 # guía paso a paso de setup completo
├── CONTEXT.md                               # ESTE archivo
├── CAMARAGE-debug.apk                       # último APK compilado (3.7MB)
├── camarage-android.zip                     # zip del proyecto Capacitor
├── camarage-android/                        # proyecto Capacitor para Android
│   ├── android/                             # proyecto Android Studio
│   ├── www/index.html                       # copia del SPA empaquetada en APK
│   ├── capacitor.config.json
│   ├── package.json
│   └── README.md
└── web/                                     # web admin Next.js para Vercel
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx                         # redirect a login o dashboard
    │   ├── globals.css                      # estilos compartidos
    │   ├── login/page.tsx                   # magic link auth
    │   ├── auth/callback/route.ts           # exchange code → session
    │   ├── dashboard/                       # home con stats
    │   ├── bands/                           # CRUD bandas
    │   ├── setlists/                        # CRUD setlists + reorder
    │   └── songs/[id]/                      # editor con tabs (meta/lyrics/cues/chords)
    ├── components/Nav.tsx                   # sidebar
    ├── lib/
    │   ├── supabase-client.ts               # browser client (PKCE)
    │   ├── supabase-server.ts               # SSR client
    │   └── types.ts                         # types matching schema
    ├── supabase/schema.sql                  # SCHEMA DEFINITIVO con tabla midi_cues
    ├── middleware.ts                        # protege rutas autenticadas
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.ts
    └── .env.example
```

## Decisiones técnicas clave

### Mobile (APK Android)

- **Capacitor v6** wrapper sobre el HTML
- **Plugin BLE**: `@capacitor-community/bluetooth-le` — usa key compuesta
  `notification|deviceId|service|characteristic` como event name
- **Plugin pasa values como HEX STRING**, no base64
- **BLE MIDI Service UUID**: `03b80e5a-ede8-4b33-a751-6ce34ec4c700`
- **BLE MIDI Char UUID**: `7772e5db-3868-4112-a1a9-f2669d106bf3`
- **Parser**: state machine compliant con BLE MIDI 1.0 spec
  - Real-time messages (0xF8-0xFF) chequeados con `expectingStatus` flag
  - TimestampLow byte siempre precede a status (excepto running status data)
  - Extrae timestamp embebido para BPM accuracy
- **BPM calc**: trimmed mean 60% central de 144 muestras con EMA smoothing 0.3/0.7
- **Position**: anclada a `midi.tickSinceStart / 24`, interpolada entre ticks con BPM actual
- **Audio**: Web Audio API con `playClickAt(audioTime, accent)` agendado
  predictivamente (currentTime + secUntilNextBeat - latencyOffset)
- **Latency offset**: 88ms default calibrado por análisis de WAV grabado por usuario
  (mediana 87.5ms, std 4.7ms en Samsung A56 ↔ MacBook Pro)
- **Sync Supabase**: load del cache localStorage al boot, pull en background si online
- **localStorage keys**:
  - `camarage_audioLatencyMs`
  - `camarage_supabase_url`
  - `camarage_supabase_anon_key`
  - `camarage_setlist_cache`
  - `camarage_active_band_id`

### Web (Next.js)

- **Next.js 14.2.15** App Router con TypeScript
- **Auth**: `@supabase/ssr` v0.5 — PKCE flow por default
- **Middleware**: protege `/dashboard`, `/songs`, `/setlists`, `/bands`, `/members`
- **Login**: magic link via `signInWithOtp` con `emailRedirectTo`
- **Build artefacts en Vercel**: ARM64 SWC binary se baja automáticamente
- **Estilos**: Tailwind con mismas CSS vars que el mobile (dark mode estricto)

### Supabase Schema

13 tablas con RLS:
- `bands`, `band_members` (enum `band_role`)
- `setlists`, `setlist_songs`
- `songs`, `song_sections` (enum `section_type`)
- `lyric_lines`, `chord_charts`, `drum_cues` (enum `cue_type`)
- `midi_cues` (note, label, jump_to_seconds) — TABLA CLAVE para sync de cues
- `performances`, `ble_devices`, `user_preferences`

**RLS helper function**: `is_band_member(band_id)` retorna true si auth.uid()
está en band_members de esa banda activa.

**Trigger**: `add_owner_as_member` agrega automáticamente al owner como member
al crear una banda.

**View**: `vw_setlist_full` con SECURITY INVOKER on para respetar RLS.

## Problemas conocidos en debug ACTIVO

### Magic link de Supabase no completa el login

**Síntoma**: usuario recibe el mail, click en el botón, vuelve al `/login`
con URL fragment:
```
https://camarage.vercel.app/login#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
```

**Diagnóstico**: el token del magic link es de un solo uso, está siendo consumido
ANTES del click real. Causas probables (en orden):
1. **Email client pre-scan**: Gmail/Outlook/Apple Mail abre el link en background
   para verificar seguridad → token gastado
2. **Click doble**: usuario clickeó dos veces
3. **Link viejo**: el mail fue generado con Site URL anterior y ahora no matchea
4. **PKCE vs Implicit flow mismatch**: el callback espera `?code=` (PKCE) pero
   Supabase está enviando hash fragment con error (implicit). Hay que confirmar
   en Supabase Auth settings cuál flow está activo.

**Fix propuesto pero NO probado todavía**:
- Right-click → copiar link → pegar en browser (evita el preview-scan)
- O cambiar el login a **OTP de 6 dígitos** en vez de magic link (más confiable)
- O verificar/cambiar el flow en Supabase a PKCE explícitamente

### Mobile sync end-to-end no testeado

Implementado, compila, pero falta:
1. Crear banda + canción + cues en la web admin (bloqueado por el magic link)
2. Configurar URL + anon key en el celu
3. Tocar "Sincronizar" y verificar que aparezcan las canciones de la web

## Sandbox / setup técnico del entorno Claude

Para retomar la sesión, el entorno Claude tendría que:
- ARM64 Linux con JDK 17 (instalado en `/sessions/.../jdk`)
- Android SDK con cmdline-tools (en `/sessions/.../android-sdk`)
- qemu-user-static + libc6-amd64-cross para emular binarios x86_64 de Android SDK
- aapt2 wrapper en `/sessions/.../aapt2-wrapper/` usado via property
  `android.aapt2FromMavenOverride=/sessions/.../aapt2-wrapper/aapt2` en
  `camarage-android/android/gradle.properties`
- Gradle 8.2.1 ya extraído en `/sessions/.../.gradle/wrapper/dists/`
- Node 22, npm
- env.sh con todo: `/sessions/laughing-serene-brown/env.sh`

**Para recompilar APK**:
```bash
source /sessions/laughing-serene-brown/env.sh
export QEMU_LD_PREFIX=/sessions/laughing-serene-brown/qemu-prefix/usr/x86_64-linux-gnu
cd /sessions/laughing-serene-brown/camarage-android
cp /sessions/laughing-serene-brown/mnt/CAMARAGE/index.html www/index.html
npx cap sync android
cd android && ./gradlew --no-daemon --console=plain assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk /sessions/laughing-serene-brown/mnt/CAMARAGE/CAMARAGE-debug.apk
```

NOTA: si el entorno se recrea desde cero, todo eso hay que rehacerlo. Pero el
APK ya compilado vive en el workspace del usuario en `CAMARAGE-debug.apk`.

## Próximos pasos prioritarios (al retomar)

1. **Resolver el magic link de Supabase**
   - Probar right-click → copiar link → pegar en browser nueva
   - Si no, cambiar a OTP de 6 dígitos (cambio de 5 min en `app/login/page.tsx`)
     - Usar `supabase.auth.signInWithOtp({ email })` sin `emailRedirectTo`
     - Agregar input para los 6 dígitos
     - `supabase.auth.verifyOtp({ email, token, type: 'email' })`
   - Verificar setting "Confirm email" en Supabase, apagarlo si está on
   - Verificar PKCE setting

2. **Testear sync end-to-end**
   - Una vez logueado, crear banda en `/bands`
   - Crear canción en `/songs` con título, BPM 120, PC# 3
   - Agregar cues MIDI (C4 → Intro, D4 → Verse, etc.)
   - Agregar letras con timestamps
   - Crear setlist y agregarle la canción
   - En el celu, modal ⚙ → Sync Supabase → Guardar URL + key → Sincronizar
   - Verificar que aparezca la canción nueva

3. **Pulir UX del web admin**
   - Selector de banda activa en sidebar (cuando hay varias)
   - Drag-and-drop real en lugar de ↑↓ para reorder
   - Auto-save indicator más visible
   - Sección de Miembros para invitar otros usuarios
   - Vista previa del setlist con timing total estimado

4. **Features mobile pendientes**
   - Auto-calibración de latencia con mic del celu
   - Continue mode (resumir desde mid-song)
   - Song Position Pointer (0xF2) para sync precisa

## Conversaciones con Claude relevantes

- Esta es la primera y única conversación. Toda la historia está en esta sesión
  (40 tareas completadas, ~30 iteraciones).

## Comandos rápidos

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

# Compilar APK localmente (requiere Android Studio + JDK 17 + Android SDK)
cd camarage-android && npm install && npx cap sync android
cd android && ./gradlew assembleDebug

# Aplicar schema en Supabase (solo si reset total)
# Copiar contenido de web/supabase/schema.sql en SQL Editor → Run
```

## Fin del snapshot
