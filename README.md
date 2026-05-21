# CAMARAGE

App móvil para sincronizar bandas en vivo con el DAW (Logic Pro / Ableton Live)
vía **BLE MIDI**. Recibe Program Change, Notes (como cues de sección), Clock y
Start/Stop, y muestra letras, cifrado de bajo y metrónomo visual sincronizados
al ritmo real del proyecto del DAW.

## Estado del proyecto

Prototipo funcional probado en Samsung A56 ↔ MacBook Pro con Logic Pro 11 vía
BLE MIDI nativo de macOS. Latency medida: **88ms** (con compensación predictiva
de Web Audio que lo deja en ±5ms del click de Logic).

## Estructura del repo

```
.
├── index.html              # SPA completa (web + Capacitor) — TODA la lógica acá
├── singer_view.html        # Maqueta original standalone solo Vista Cantante
├── supabase_schema.sql     # Schema Postgres para Supabase (12 tablas + RLS)
├── camarage-android/       # Wrapper Capacitor — produce el APK Android
│   ├── android/            # Proyecto Android Studio (ya generado)
│   ├── www/index.html      # Copia del SPA que se empaqueta dentro del APK
│   ├── capacitor.config.json
│   └── package.json
├── CAMARAGE-debug.apk      # Último APK debug compilado (~3.7MB)
└── camarage-android.zip    # Snapshot del proyecto Capacitor para compartir
```

## Features actuales

- **3 vistas por rol** (Cantante / Bajista / Baterista) con bottom nav
- **Editor de Setlist** con metadata por canción (key, BPM, time sig, PC#)
- **Letras con auto-scroll** sincronizadas a timestamps
- **Cifrado de bajo** scrolleable + tarjeta grande de root note + tuner mock
- **Metrónomo circular** del baterista + mini mixer (Click/Seqs/Banda) con
  envío MIDI CC al DAW
- **Sistema de cues MIDI**: cada nota dispara salto a una parte específica
- **Auto-load de canción** vía Program Change
- **MIDI Clock slave**: posición de canción anclada al tick count (no drift)
- **Latency compensation**: scheduling predictivo con Web Audio + offset
  configurable
- **Modal de configuración** con filtro de canal MIDI, log de mensajes en vivo,
  badge de clock rate, calibración de latencia

## Cómo correr la SPA en navegador

Abrir `index.html` en Chrome (Web MIDI + Web Bluetooth funcionan en HTTPS):

```bash
# Servir local con HTTPS auto-signed
npx http-server -S -C cert.pem -K key.pem .
```

O servir HTTP y testear MIDI sin BLE (USB MIDI funciona en `http://localhost`).

## Cómo compilar el APK

Requiere Node 18+, JDK 17, Android SDK (lo más simple es Android Studio).

```bash
cd camarage-android
npm install
npx cap sync android
cd android
./gradlew assembleDebug
# APK queda en android/app/build/outputs/apk/debug/app-debug.apk
```

O abrí `camarage-android/android/` en Android Studio y dale ▶ Run.

## Setup en Logic Pro

1. **Audio MIDI Setup** → MIDI Studio → Bluetooth → conectá el A56
2. **Properties del A56** → tildá ✓ Transmit MIDI Beat Clock
3. **Logic → File → Project Settings → Synchronization → MIDI** →
   - Destination row 1 = el A56
   - Tildá ✓ Clock y ✓ MMC en esa fila
   - Tildá ✓ "Transmit MIDI Machine Control (MMC)" abajo
4. En la pista de cues asigná **Output → el A56**
5. Poné Program Changes y Notes MIDI en la timeline a gusto

Al apretar Play en Logic:
- Llega Program Change → app carga la canción del setlist con ese PC
- Llega Start (0xFA) → app arranca el transporte
- Llegan Clock ticks (0xF8 x 24/beat) → app esclava al tempo
- Llegan Notes → cada una dispara salto a la sección configurada en el editor

## Stack

- **Frontend**: HTML + Tailwind CSS (CDN) + Vanilla JS (sin framework)
- **Wrapper móvil**: Capacitor v6 + @capacitor-community/bluetooth-le
- **Audio**: Web Audio API con scheduling predictivo
- **Backend planeado**: Supabase (Postgres + RLS + Realtime)

## Roadmap

- [ ] Auto-calibración de latencia usando el micrófono del celu
- [ ] Persistir setlist en Supabase + sync entre miembros de la banda
- [ ] Modo Continue (resumir desde la posición actual de Logic, no desde 0)
- [ ] Soporte Song Position Pointer (0xF2) para sync mid-song
- [ ] Vista Tecladista y Guitarrista
- [ ] Modo paisaje para iPad
- [ ] Exportar cues a archivo .mid para importar en Logic

## Licencia

Privado por ahora.
