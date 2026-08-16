# CAMARAGE · PLAN — Reproductor de pistas (backing tracks)

> Objetivo: que CAMARAGE reproduzca las pistas del show con su click, y quede a la
> altura de Stage Traxx 3 / Prime / Playback / BandHelper.
> Decisiones tomadas con Pato el 15 ago 2026.
> Estado: **Fase 1 implementada y probada** (ver §4).

---

## 1. Las cuatro decisiones que definen la arquitectura

| Decisión | Elegido |
|---|---|
| ¿Quién manda en escenario? | **iPad solo, sin Mac.** No hay Logic ni MainStage. |
| Salida de audio | **Split estéreo con cable Y.** Sin interfaz externa. |
| Formato de la pista | **L = música (mono) · R = click.** |
| Origen de los archivos | **Supabase + copia manual**, con caché offline en el iPad. |

### Lo que esto cambia respecto de todo lo anterior

Hasta hoy CAMARAGE era un **seguidor**: Logic mandaba MIDI clock por BLE y la app
obedecía. Ahora se invierte: **el iPad reproduce el audio y por lo tanto es el dueño
del tiempo.** Consecuencias directas:

- **El bug del desfase de SPP desaparece por diseño.** Ya no hay que restar un offset
  global de Logic ni adivinar en qué compás arranca cada tema: la posición sale del
  archivo de audio, que siempre empieza en cero. Las tres preguntas que estaban
  trabando la sesión anterior quedan sin efecto.
- **El flapping de BLE deja de ser crítico.** El show no depende de una conexión
  Bluetooth viva. Si el BLE se cae, la música sigue.
- **La precisión mejora un orden de magnitud.** El reloj pasa de ser MIDI clock por BLE
  (con jitter de radio) a `audioCtx.currentTime`, que corre con el mismo cristal que la
  placa de audio. Letras y click no pueden desincronizarse de la pista: son la pista.
- **Se pierde el piano en vivo de MainStage.** Es la contrapartida de sacar el Mac. Si
  más adelante querés recuperarlo, el plugin BLE que ya está escrito y probado permite
  que el iPad le mande clock y Program Change al Mac — el iPad seguiría de maestro.

---

## 2. Cómo funciona el ruteo (el corazón de la decisión de Pato)

```
                                    ┌─────────────────────────────┐
   archivo de audio ──(mono)───────▶│ merger IN 0 → canal L (izq) │──▶ consola / FOH
                                    │                             │
   click generado por la app ──────▶│ merger IN 1 → canal R (der) │──▶ tus in-ears
                                    └─────────────────────────────┘
                                          salida del iPad + cable Y
```

**El truco técnico:** los inputs de un `ChannelMergerNode` de Web Audio son **mono**.
Conectarle una fuente estéreo la baja a mono automáticamente, sin splitter ni sumador.
Una línea de código hace todo el trabajo:

```js
src.connect(merger, 0, 0);        // música → L (downmix a mono automático)
clickBus.connect(merger, 0, 1);   // click  → R (limpio, sin nada de música)
```

**Verificado con render offline**, no de palabra: con una fuente estéreo de L=1.0 y
R=0.5 más un click de 0.3, la salida medida fue **L=0.75** (el downmix correcto) y
**R=0.30** (click puro, cero sangrado de música). Ver §4.

### Tres modos de ruteo disponibles

| Modo | Qué hace | Cuándo usarlo |
|---|---|---|
| `split` *(default)* | Música mono a L, click de la app a R | **El tuyo.** Cable Y en escenario |
| `baked` | El archivo ya trae click en R; pasa intacto y la app no genera click | Si bounceás desde Logic con el click adentro |
| `stereo` | Música estéreo + click mezclado en ambos | Ensayar con auriculares comunes, sin cable Y |

---

## 3. El reloj: por qué no driftea

El click **no se toca cuando llega el beat** — se **agenda por adelantado** en el
timeline de Web Audio, con un lookahead de 200ms y un scheduler que corre cada 25ms.
Web Audio garantiza precisión de sample (~0.02ms a 44.1kHz), así que:

- Aunque el navegador se trabe renderizando la letra, **el click ya está agendado** y
  sale igual, a tiempo.
- El beat `n` de la canción cae siempre en `ctxZero + n × (60/bpm)`, donde `ctxZero` es
  el instante exacto del reloj de audio en que arrancó la pista. Es aritmética pura
  sobre el mismo reloj del audio: **no hay acumulación de error posible.**
- La cuenta previa usa beats negativos sobre la misma fórmula, así que empalma perfecto
  con el compás 1 de la pista.

`elapsedSec()` — la única función de la que dependen letras, cifrado y metrónomo — ahora
tiene una rama nueva al principio: si el modo pistas está reproduciendo, devuelve la
posición del audio. **Las vistas no se tocaron.** Ese fue el punto de diseño que hizo
que todo esto entrara sin refactor.

---

## 4. Fase 1 — LO QUE YA ESTÁ HECHO Y PROBADO

Todo en `index.html`, módulo `TRACKS` (~380 líneas). Sin dependencias nuevas, sin
plugins nativos nuevos.

### Funcionalidad

- Carga de audio desde archivo (WAV, MP3, M4A, AAC — todo lo que decodifique el sistema).
- **Persistencia en IndexedDB por canción**: cargás una vez y queda en el iPad. El show
  entero funciona en modo avión.
- Transporte: play / pausa / stop / seek tocando la barra de posición.
- **Cuenta previa** de 0 a 4 compases, con badge visual en la barra.
- Click propio agendado sobre el reloj del audio, ruteado al canal que corresponda.
- Volumen de pista independiente.
- Track bar en escenario: estado, nombre, posición / duración, barra de progreso.
- Panel de configuración completo en el modal ⚙ (toggle, ruteo, volumen, cuenta,
  cargar / borrar pista).
- Convive con el modo MIDI viejo: si apagás Modo Pistas, la app vuelve a seguir a Logic
  exactamente como antes. **Nada de lo que funcionaba se rompió.**

### Verificación ejecutada (Chromium real, no revisión a ojo)

| Prueba | Resultado |
|---|---|
| Sintaxis del script inline | ✅ sin errores |
| Ruteo `split` medido en render offline | ✅ L=0.75 (downmix), R=0.30 (click puro) |
| Carga y decodificación de WAV de 12s | ✅ duración y nombre correctos |
| `elapsedSec()` sigue al audio | ✅ pos y elapsed idénticos en todo momento |
| Seek a 8s | ✅ audio y letras saltan juntos |
| Pausa | ✅ congela la posición (no sigue corriendo) |
| Persistencia tras recargar | ✅ la pista vuelve sola desde IndexedDB |
| Cuenta previa de 1 compás a 112 bpm | ✅ 2.14s de cuenta, después arranca la pista |
| Errores de JS en consola | ✅ ninguno |

---

## 5. Lo que falta — por orden de prioridad

### 🔴 Bloqueante para usarlo en un show (nativo iOS, 15 minutos de trabajo)

**El interruptor de silencio del iPad va a mutear el show.** Por defecto una WKWebView
usa la categoría de sesión de audio `ambient`, que se calla con el switch físico y al
bloquear la pantalla. Hay que agregar esto al plugin Swift que ya existe
(`MidiPeripheralPlugin.swift`), en el `init` o en un método `configureAudio`:

```swift
import AVFoundation

let s = AVAudioSession.sharedInstance()
try? s.setCategory(.playback, mode: .default, options: [.mixWithOthers])
try? s.setPreferredIOBufferDuration(0.005)   // ~5ms, baja latencia
try? s.setActive(true)
```

Y en `Info.plist`, `UIBackgroundModes` con `audio` (ya está documentado en
`ios-plugin/Info.plist-additions.md`).

### 🟠 Siguiente tanda

1. **Campo de audio en Supabase** — subir el archivo desde la web admin y que el iPad lo
   descargue solo. Hoy la carga es manual por canción. Ojo con el límite de 1GB del plan
   gratis de Supabase Storage: 13 canciones en MP3 320kbps entran cómodas; en WAV no.
2. **Auto-avance de setlist** — al terminar la pista, cargar la próxima canción y quedar
   armado (o encadenar automático, configurable).
3. **Voces guía** ("estrofa en tres, dos, uno") — es lo que hace Prime. Se puede generar
   con síntesis de voz o con samples cortos, agendado sobre el mismo reloj.
4. **Marcadores de sección** sobre la barra de posición, saltando por secciones en vez de
   por tiempo. Las secciones ya están en los datos de cada canción.

### 🟡 Más adelante

5. **MIDI out mientras corre la pista** — mandar Program Change y CC a pedales o luces en
   momentos marcados de la canción. El plugin BLE ya está escrito y probado; falta
   engancharle los eventos al timeline.
6. **Modo "Jump"** estilo Playback — repetir la última estrofa esperando al inicio del
   próximo compás. Requiere que la pista esté cortada por secciones.
7. **Stems con faders.** Acá hay un límite duro: **Web Audio en la WebView no puede rutear
   a salidas específicas de una interfaz USB multicanal.** Si algún día querés mandar
   guitarras y teclas por canales separados al sonidista, hay que escribir un motor
   nativo en Swift con `AVAudioEngine`. Con stems en estéreo mezclados dentro del iPad
   (faders sí, salidas separadas no) alcanza Web Audio y es mucho menos trabajo.

---

## 6. Paridad con las apps de referencia

| Capacidad | Stage Traxx 3 | Prime | Playback | BandHelper | **CAMARAGE hoy** |
|---|:---:|:---:|:---:|:---:|:---:|
| Reproducción de pistas | ✅ | ✅ | ✅ | ✅ | ✅ |
| Click separado a in-ears | ✅ | ✅ | ✅ | ✅ | ✅ *(split L/R)* |
| Cuenta previa | ✅ | ✅ | ✅ | ✅ | ✅ |
| Letras sincronizadas | ✅ | ✅ | ✅ | ✅ | ✅ *(ya era el fuerte)* |
| Cifrado para el bajista | ➖ | ➖ | ➖ | ➖ | ✅ *(nadie más lo tiene)* |
| Metrónomo visual del baterista | ➖ | ➖ | ➖ | ➖ | ✅ |
| Funciona offline | ✅ | ✅ | ✅ | ✅ | ✅ |
| Setlist | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auto-avance de setlist | ✅ | ✅ | ✅ | ✅ | ⏳ §5.2 |
| Voces guía | ➖ | ✅ | ✅ | ➖ | ⏳ §5.3 |
| Secciones y modo Jump | ➖ | ➖ | ✅ | ➖ | ⏳ §5.6 |
| MIDI out a pedales y luces | ✅ | ✅ | ✅ | ✅ | ⏳ §5.5 *(plugin ya listo)* |
| Stems con faders | ✅ | ✅ | ✅ | ➖ | ⏳ §5.7 |
| Salidas multicanal por USB | ✅ | ✅ | ✅ | ➖ | ❌ *(requiere motor nativo)* |
| Pedal Bluetooth manos libres | ✅ | ✅ | ✅ | ✅ | ❌ |
| Precio | pago | suscripción | suscripción | suscripción | **propia** |

Con la Fase 1 terminada, CAMARAGE ya cubre el uso central de las cuatro apps, y suma dos
cosas que ninguna tiene: la vista de cifrado del bajista y el metrónomo visual del
baterista, alimentados por el mismo reloj de la pista.

---

## 7. Cómo probarlo

### En la Mac, antes de compilar nada
Abrí `index.html` en Chrome. Menú ⚙ → **Pistas de audio** → encendelo → **Cargar archivo**.
Elegí un bounce cualquiera y dale Play. Con auriculares vas a escuchar la música de un
lado y el click del otro (activá el metrónomo con el botón METRO).

Para probar el modo escenario de verdad hace falta el cable Y, pero el ruteo se escucha
igual con cualquier auricular.

### En el iPad
```bash
cd "/Users/patriciokeogan/Documents/Claude/Projects/CAMARAGE/CAMARAGE/camarage-android"
npm run ios:sync
npx cap open ios
```
Xcode → ⌘R. **Antes de un show real, aplicar el fix de `AVAudioSession` de §5**, o el
switch de silencio te deja sin música.

---

## 8. Archivos tocados

| Archivo | Cambio |
|---|---|
| `index.html` | Módulo `TRACKS`, track bar, panel de config, rama nueva en `elapsedSec()`, hooks en `setPlay` / `setStop` / `loadSong`, supresión del click doble |
| `camarage-android/www/index.html` | Copia idéntica (es la que se compila) |
| `PLAN_AUDIO_PISTAS.md` | Este documento |

Nada de lo anterior se borró: el modo MIDI sigue entero y se activa apagando Modo Pistas.
