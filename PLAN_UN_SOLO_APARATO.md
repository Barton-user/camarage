# CAMARAGE + Starnight Keys · Un solo aparato, un solo cable

> Análisis pedido por Pato el 12 sep 2026. Cruza este repo con el proyecto
> **Starnight Keys** (ex SINE PAD), el sinte/sampler nativo del iPad.
> No hay código escrito todavía: esto es el menú de caminos con su precio.

---

## 1 · La cadena de hoy

```
Samsung A56 · CAMARAGE ──USB-C (digital, estéreo)──▶ Zen Quadro   L = pista/seqs · R = click
iPad Pro    · Starnight Keys ──USB-C ▶ dongle ▶ 2 plugs (analógico)──▶ Zen Quadro   piano L/R
```

Cuatro señales, dos aparatos, dos cables — y uno de ellos **analógico**: el
piano sale por el DAC de un dongle, vuelve a entrar por los preamps del
Antelope y se vuelve a convertir. Es el eslabón flojo de toda la cadena.

## 2 · Cuál es la restricción real (no es el cable)

El cable no es el problema. El puerto USB-C principal del Zen Quadro lleva
**16 canales de reproducción y grabación a 24/192**; el secundario lleva
**2 canales** y además hace *reverse charging* del celular. Por el cable
entran cuatro señales sin despeinarse.

**El límite está del lado del iPad.** En iOS una app suelta escribe siempre en
los **canales 1 y 2** de la interfaz. Dos apps distintas no pueden quedarse
cada una con su par: el sistema las **suma** y manda la mezcla al mismo par.

O sea: *un cable* es fácil. Lo que obliga a decidir es **mantener el click en
su propio canal**, que es justamente lo que sostiene el rig de hoy.

## 3 · ¿iPad o A56?

**iPad, sin discusión** — y no por potencia bruta. En CPU el A56 (Exynos 1580,
2025) le pelea de igual a igual al A12X del iPad Pro 3ra gen, incluso le gana
en single-core. Pero:

- Starnight Keys es **Swift + C++ sobre iPadOS**. No existe versión Android:
  portarlo es rehacer el bridge y toda la UI.
- La salida USB multicanal de Android es, en la práctica, **estéreo**; pasar de
  ahí pide drivers de terceros. En iPadOS es una API del sistema.
- El proyecto **ya pivoteó a iPad** en junio por esto mismo (ver
  `PLAN_iOS_iPad.md` §1): CoreAudio y CoreMIDI contra los muros de Android.
- Pantalla de 12,9" para las letras en escenario.

El A56 queda como respaldo, que es el rol que le asignamos en junio.

---

## 4 · Las alternativas, de más barata a más cara

### A · Hoy mismo, cero código: el segundo puerto USB-C del Antelope

El Zen Quadro tiene **dos** puertos USB-C. Cambiá el cable analógico del iPad
por un USB-C al segundo puerto.

```
A56  ──USB-C──▶ puerto primario   (16 ch disponibles; usa 2)
iPad ──USB-C──▶ puerto secundario (2 ch) + el Antelope le devuelve carga
```

- Se va el dongle, se va la conversión D/A + A/D, se van los preamps del medio.
- El iPad **se carga solo** durante el show (reverse charging del puerto 2).
- Siguen siendo dos aparatos. Pero el eslabón flojo desaparece **gratis, hoy**.

**Esto conviene hacerlo igual**, gane el camino que gane: es el fallback si
algo falla en escenario.

### B · Un iPad, las dos apps, piano paneado a la izquierda

Las dos apps corriendo juntas en el iPad, un solo cable USB-C, salida estéreo:

```
L = pista/seqs + piano (mono)      R = click puro
```

Cómo: las dos apps declaran `AVAudioSession .playback` con `.mixWithOthers`
(en CAMARAGE es el fix que ya está pendiente en `PLAN_AUDIO_PISTAS.md` §5), y
en Starnight Keys se panean los slots **duro a la izquierda**. El archivo de
CAMARAGE ya pasa intacto, así que la R queda limpia de click.

- **Costo: unas horas.** Un `setCategory` en cada app y el paneo.
- **Un aparato, un cable, click separado.** Cumple el pedido literal.
- **Lo que se pierde:** el piano es **mono** y **comparte canal con las
  secuencias**. El sonidista no lo tiene en un fader propio, y se va el estéreo
  del reverb del sinte. Si eso es aceptable en tu escenario, este camino está a
  una tarde de distancia.

### C · Un iPad, **una sola app**, salida multicanal — la solución de verdad

Starnight Keys ya tiene lo caro hecho: motor C++ en tiempo real, streaming de
samples desde disco, mixer, bus de escucha fuera de los 4 slots, limitador,
agenda de eventos con precisión de muestra, CoreMIDI. **CAMARAGE es HTML/JS.**
La dirección correcta es meter CAMARAGE adentro de Starnight Keys, no al revés.

```
                         una sola app
   WKWebView (toda la UI de CAMARAGE, skins, Supabase, letras)
                              │  posición / transporte
                              ▼
   motor C++  ──▶ bus pista  ──▶ USB out 1   (secuencias)
              ──▶ bus click  ──▶ USB out 2   (click a in-ears)
              ──▶ slots 1-4  ──▶ USB out 3/4 (piano estéreo, con FX)
                                 …y quedan 6 salidas libres
```

**Lo que hay que construir:**

1. `sk::TrackPlayer` en el motor — lector de archivo estéreo con seek y
   posición publicada en un atómico, en su propio bus. Al lado del sampler que
   ya existe es poco.
2. Click generado por el motor (ya sabe agendar con precisión de muestra).
3. **Salida multicanal en el bridge**: `setPreferredOutputNumberOfChannels` +
   mapa de canales en el nodo de salida, y asignación de canal por bus en
   `FxChain`. *Esta es la parte nueva y la única con riesgo real* — hay que
   probarla contra el Zen Quadro antes de comprometerse.
4. WKWebView + puente JS↔Swift para transporte y posición.

**La costura ya existe y está documentada:** `elapsedSec()` es el único lugar
de `index.html` del que dependen letras, cifrado y metrónomo. Hoy tiene tres
ramas (audio propio / MIDI entrante / baliza remota). Se le agrega una cuarta
que lee el playhead del motor nativo y **las vistas no se tocan** — el mismo
punto de diseño que dejó entrar el reproductor de pistas sin refactor.

**Lo que se gana además de los canales:**

- **Un solo reloj.** Hoy el piano y la pista corren sobre dos cristales, en dos
  aparatos. Después: piano, pista, click, letras y MIDI a pedales sobre el
  mismo reloj de muestras.
- El MPK49 y el MIDI saliente a pedales (§5.5 de `PLAN_AUDIO_PISTAS.md`) viven
  en la misma app que la pista, sin BLE de por medio.
- Stems con faders y salidas separadas dejan de ser imposibles: el límite que
  anota el plan ("Web Audio en la WebView no puede rutear a salidas
  específicas") desaparece cuando el motor es nativo.
- Un solo ⌘R, un solo perfil que renovar cada 7 días, una sola app que abrir
  antes de tocar.

### D · Variante sin fusionar: AUv3 + AUM

Starnight Keys ya está pensado con el motor desacoplado **para AUv3 futuro**.
Si se construye ese AUv3, un host tipo **AUM** o **MiMix** lo aloja y lo rutea
a las salidas 3/4 del Antelope, mientras CAMARAGE corre suelto en 1/2.

- Llega al mismo resultado sin fusionar las apps, y el AUv3 es valor que ya
  estaba en el roadmap.
- **Pero**: son dos apps más para abrir en escenario (el host y el sinte),
  depende de que iOS deje a un host multicanal convivir con una app suelta en
  1/2 — la gente lo hace, pero hay que **probarlo**, no darlo por hecho.
- No trae el reloj común ni el MIDI unificado de la opción C.

---

## 5 · Comparación

| | A · 2º puerto | B · paneo | C · una app | D · AUv3+AUM |
|---|:---:|:---:|:---:|:---:|
| Un solo aparato | ✗ | ✓ | ✓ | ✓ |
| Un solo cable | ✗ (dos) | ✓ | ✓ | ✓ |
| Click en canal propio | ✓ | ✓ | ✓ | ✓ |
| Piano en fader propio | ✓ | ✗ | ✓ | ✓ |
| Piano estéreo | ✓ | ✗ | ✓ | ✓ |
| Reloj único | ✗ | ✗ | ✓ | ✗ |
| Apps que abrir en el escenario | 2 | 2 | **1** | 3 |
| Trabajo | **0** | horas | semanas | días |

---

## 6 · Dos cosas a resolver del hardware (valen para B, C y D)

**Alimentación.** El iPad Pro 12,9" 3ra gen tiene **un solo puerto USB-C**, y el
Zen Quadro es **bus-powered sin fuente propia** — cuatro preamps y un FPGA
colgando de la batería del iPad durante dos horas. Dos salidas:

- iPad en el **puerto secundario** del Antelope: el Antelope le devuelve carga.
  Pero ese puerto es **estéreo** → sirve para A y B, **no para C ni D**.
- iPad → **hub USB-C con PD** → puerto primario del Antelope. Alimenta a los dos
  y deja los 16 canales. **Esta es la que hace falta para C.** Hay que probarla
  con el hub real antes de contar con ella.

**Memoria.** El iPad es de **4 GB** y el presupuesto de samples de Starnight
Keys es de ~1,8 GB. Los pianos grandes solos ya lo rozan (Steinway B: 972 MB).
Sumar la WebView de CAMARAGE más la pista decodificada pide un preset de
escenario con un piano liviano, o activar el streaming desde disco que el motor
ya sabe hacer y está postergado.

---

## 7 · Lo que yo haría

1. **Esta semana, gratis:** pasá el iPad al segundo puerto USB-C del Antelope.
   Escuchá la diferencia contra el dongle. Queda como fallback para siempre.
2. **Antes de decidir C:** una prueba de 30 minutos — el iPad por hub con PD al
   puerto primario, una app mínima que escupa tonos distintos por las salidas
   1, 2, 3 y 4. Si eso suena, la opción C está despejada y se puede planificar
   en serio. Si no suena, C se cae y la discusión real es entre B y D.
3. **Pregunta de producto que decide todo:** ¿el sonidista **necesita** el piano
   en un fader aparte de las secuencias? Si la respuesta es no, la opción B te
   deja un solo aparato y un solo cable a fin de semana. Si es sí, el camino es
   C y conviene empezar por el `TrackPlayer` en el motor.

---

## Fuentes

- Especificaciones técnicas del Zen Quadro (Antelope Audio): puerto primario
  16 canales 24/192, secundario 2 canales + reverse charging.
- Reseña de Sound on Sound: class-compliant, bus-powered sin fuente, dos pares
  de salidas de línea + dos de auriculares.
- Foro de Loopy Pro sobre ruteo multicanal en iPadOS: las apps sueltas salen por
  1/2; para elegir canal hace falta que la app lo implemente (Prime lo hace) o
  un host tipo AUM/MiMix.

---

## 8 · CORRECCIÓN (12 sep, mismo día) — el ruteo real es mucho más simple

Pato marcó el error: todo lo de arriba asume que los dos canales llevan
**contenido distinto** (música estéreo por un lado, click por el otro). No es
así. En vivo se trabaja en **MONO**, y las dos salidas son **dos mezclas** que
se diferencian en **una sola cosa: el click**.

```
canal 1  → auriculares (Pato)     = secuencias + Starnight + click
canal 2  → sonidista (FOH)        = secuencias + Starnight
```

Secuencias y piano van a **los dos** canales. El click va a **uno solo**.

### Por qué esto se resuelve con las salidas 1 y 2 y nada más

Si algo está **centrado**, aparece idéntico en L y en R. Entonces:

- **Starnight Keys centrado** → suena igual en los dos canales. ✓ Sin tocar nada.
- **Las secuencias en mono, a los dos canales** → igual en los dos. ✓
- **El click paneado duro a la izquierda** → sólo en el canal 1. ✓

Y como las dos apps se suman en el mixer del sistema, el piano entra en las dos
mezclas gratis. **Cero canales extra. Cero hub. Cero fusión de apps.**

### El grafo nuevo en CAMARAGE (modo `dual-mono`)

Tus bounces de hoy ya traen música en L y click en R. Se aprovechan tal cual:

```
                 ┌─ splitter[0] (música) ─┬──▶ merger in 0  → canal 1  auriculares
  archivo ───────┤                        └──▶ merger in 1  → canal 2  sonidista
                 └─ splitter[1] (click)  ─────▶ merger in 0  → canal 1  solamente

  click propio de la app (METRO) ─────────────▶ merger in 0  → canal 1  solamente

  Starnight Keys (la otra app, centrada) ─────▶ los dos canales, por el mixer de iOS
```

Un `ChannelSplitterNode` y un `ChannelMergerNode`. Es un modo más al lado de
`split` / `baked` / `stereo` que ya existen en el módulo `TRACKS`.

### Qué hay que tocar, en total

**CAMARAGE**
1. Modo de ruteo `dual-mono` en `TRACKS` (el grafo de arriba) + su opción en ⚙.
2. El fix de `AVAudioSession` que ya estaba pendiente en
   `PLAN_AUDIO_PISTAS.md` §5, con **`.mixWithOthers`**:
   `setCategory(.playback, mode: .default, options: [.mixWithOthers])`.
   Sin `.mixWithOthers` la app que active la sesión primero **calla a la otra**.
   Y `UIBackgroundModes: audio` en el `Info.plist`.

**Starnight Keys**
3. La misma categoría con `.mixWithOthers` en el bridge.
4. Interruptor **MONO** en el master (suma L+R): garantiza que el piano llegue
   **idéntico** a los dos canales. Sin esto, el ancho del reverb y del chorus
   hace que el canal del sonidista y el de los auriculares no tengan exactamente
   el mismo piano.

**En el Antelope:** canal 1 → envío de auriculares, canal 2 → salida al
sonidista. Ruteo en la matriz, sin tocar código.

### El único riesgo real, y hay que medirlo

Cuando dos apps comparten la sesión de audio, **iOS elige un solo tamaño de
buffer** para todas. `setPreferredIOBufferDuration` es una *preferencia*, no una
orden. Starnight Keys quiere 128 muestras (2,7 ms) para que el piano se pueda
tocar; si con CAMARAGE sonando iOS lo lleva a 1024, el piano se vuelve
intocable.

**Prueba de 10 minutos, antes que nada:** las dos apps abiertas, pista sonando,
tocar el MPK y mirar la latencia reportada en Ajustes ▸ Diagnóstico de Starnight
Keys. Si se mantiene baja, la opción B cierra. Si no, el camino vuelve a ser la
opción C — **una sola app = un solo cliente de audio = el buffer lo elegís vos**
— pero ahora por latencia, no por canales.

### Lo que queda en pie de todo lo anterior

- **La opción A sigue siendo gratis y sigue conviniendo** como respaldo: si el
  iPad falla, el A56 entra por el segundo puerto USB-C sin cable analógico.
- **La opción D queda descartada**: no hacían falta canales separados.
- **La opción C queda como plan B**, y su valor real no eran los canales sino
  el reloj único y el control del buffer.

---

## 9 · La objeción de Pato a la opción C: "¿no me deja una app aparte de la de la banda?"

Planteo: el cantante, el bajista y el baterista usan CAMARAGE y **Starnight Keys
no les interesa**. Si se fusionan, la app del iPad de Pato pasa a ser una app
distinta de la que usa el resto.

Es verdad. Pero **no es un fork**, y esa es toda la diferencia.

### Por qué no se duplica el trabajo

**CAMARAGE es un solo archivo.** Toda la app —vistas, skins, motor de sync,
Supabase, setlist, TRACKS— vive en `index.html` (678 KB). El proyecto ya
convive con **dos cáscaras** alrededor del mismo archivo:

```
index.html  (fuente única)
   ├── build.sh ──▶ camarage-android/www/index.html   ──▶ APK Android
   └── cap sync ──▶ ios/App/App/public/index.html     ──▶ app iOS
```

La fusión agrega **una tercera cáscara**, no un segundo código:

```
   └── cp ────────▶ StarnightKeys/App/Resources/camarage/index.html
```

Un `cp` más en `build.sh`. Es exactamente el patrón que el proyecto ya usa para
Android contra iOS.

**La app de la banda no se toca.** Sus teléfonos siguen con la CAMARAGE de hoy,
el plan de publicar en Google Play sigue en pie, y ninguna pantalla cambia.

### Lo único que difiere es el backend de audio

En la app de la banda, las pistas las toca Web Audio (módulo `TRACKS`). En la de
Pato las tocaría el motor C++. Eso es **una rama de runtime**, no dos apps:
`elapsedSec()` ya tiene tres ramas (audio propio / MIDI entrante / baliza
remota) y `getMidiPeri()` ya hace exactamente este tipo de detección de
capacidad. Si el puente nativo está presente, se usa; si no, Web Audio.

### El camino inverso —una sola app para todos— es el que SÍ se rompe

Meter el sinte adentro de la CAMARAGE de todos y mostrarlo sólo a Pato según su
rol suena ordenado, pero: Starnight Keys es **iPadOS, A12 o superior**, así que
la app dejaría afuera al A56 y a cualquier Android de la banda; y todos
cargarían con los samples del piano (375 MB a 1 GB). **Descartado.**

### Los costos reales de la opción C (los que sí duelen)

1. **Tres destinos para recompilar** en vez de dos. El problema recurrente del
   proyecto no es compilar, es **olvidarse**: hoy mismo el CONTEXT dice "los
   tres iOS siguen con el build del 17 ago". Un destino más empeora eso.
2. **Dos backends de audio que testear.** Un bug puede aparecer en uno y no en
   el otro. Se acota si el backend nativo implementa la misma interfaz chica
   (play / pause / seek / posición) y todo lo de arriba queda idéntico.
3. **Pato queda en un binario distinto al de la banda** en los ensayos. Menor:
   hoy está en un **aparato** distinto.
4. **4 GB de RAM** compartidos entre la WebView y el sampler.

### Y ahora la pregunta incómoda: ¿qué compra la opción C?

Con el ruteo de §8 resuelto, los canales separados **ya no son un motivo**.
Queda:

- **El control del tamaño de buffer** — una sola app es un solo cliente de
  audio. Éste es el único motivo que podría *obligar* a la fusión.
- Un solo reloj de muestras para piano, pista, click y MIDI a pedales.
- Una sola app que abrir en escenario y un solo perfil de 7 días que renovar.
- Destraba a futuro los stems con faders y las salidas separadas.

### C-lite: la versión barata, que quizás alcanza

Hospedar la WebView de CAMARAGE adentro de Starnight Keys **sin tocar `TRACKS`**
— las pistas las sigue tocando Web Audio, pero ahora dentro del mismo proceso
que el motor. Una sola app, una sola sesión de audio, **cero reescritura**.

Si el problema del buffer viene de la negociación *entre dos procesos*, esto lo
arregla solo. Si viene de tener dos clientes de audio aunque compartan proceso,
no. **No lo doy por hecho: hay que medirlo.** Pero si funciona, es la opción C
al precio de un día de trabajo, y deja la puerta abierta a mover `TRACKS` al
motor nativo después, por el reloj único.

### Veredicto

La objeción de Pato es válida pero **no debería ser lo que descarte la opción
C**: la app de la banda no se entera. Lo que decide es otra cosa, y es medible:
**si con las dos apps abiertas el piano sigue tocándose con baja latencia, gana
la opción B y la fusión es un lujo de semanas.** Si no, la fusión deja de ser
una preferencia y pasa a ser la única salida — y ahí se empieza por C-lite.

**Primer paso, sin ambigüedad: medir el buffer.**

---

## 10 · Restricción nueva: Starnight Keys va al App Store, limpio de CAMARAGE

Pato: Starnight Keys es un **producto para vender** (pago único, según el plan
de arquitectura). No puede tener nada de CAMARAGE adentro.

Está bien y hay que respetarlo literalmente. Meter CAMARAGE en el binario que
se publica sería malo por cuatro motivos distintos:

1. **Datos privados de la banda en una app comercial**: la anon key de Supabase,
   los logins, las 15 canciones con sus letras. No van en algo que se descarga
   de una tienda.
2. **Riesgo en la revisión de Apple**: un revisor abre una app de piano y se
   encuentra una WebView con el setlist de una banda y un login. Eso se lee como
   "dos apps en una" y es una discusión que no querés tener.
3. **Identidad del producto**: al que compra un sinte no le podés mostrar una
   solapa CAMARAGE.
4. **Ritmos de release atados**: cada retoque de CAMARAGE quedaría pegado al
   ciclo de revisión del App Store.

### Lo primero: esto es un argumento A FAVOR de la opción B

Con el ruteo de §8, **las dos apps quedan completamente independientes**. Cero
código compartido, cero acoplamiento, Starnight Keys se publica sin enterarse
de que CAMARAGE existe. Si la medición del buffer da bien, la restricción nueva
no cuesta absolutamente nada.

### Y si el buffer obliga a fusionar, la fusión cambia de forma (no se cae)

Lo que se comparte **no es la app: es el motor**. Y el motor ya está diseñado
así — `Engine/` es C++17 sin dependencias, compila con CMake sin Xcode, y Xcode
lo toma como **librería estática** (§11 del plan de arquitectura).

```
Engine/  (C++17 · un solo código · librería estática)
   │
   ├──▶ target "Starnight Keys"   → App Store. Producto. CERO CAMARAGE.
   │
   └──▶ target "CAMARAGE Stage"   → privado, tu iPad. WebView de CAMARAGE
                                     + el motor + la UI del sinte.
```

**Dos targets del mismo proyecto Xcode**, no dos proyectos. La solapa de
CAMARAGE entra por bandera de compilación (`#if STAGE`), no por una condición en
tiempo de ejecución: en el binario que sube al App Store el código de CAMARAGE
**no está**, no está escondido. Si algún día un revisor lo mira, no hay nada
que mirar.

Y la UI del sinte se compila en los dos, así que en escenario tenés el editor
completo, no una versión recortada.

### Alternativa más elegante y más cara: el AUv3

Starnight Keys va a querer un **AUv3** igual — todo instrumento serio de iOS lo
tiene, y está anotado en el plan desde el día uno ("motor desacoplado para AUv3
futuro"). Si existe:

- Starnight Keys se publica en el App Store e **instala su AUv3**.
- La app privada de escenario **hospeda ese AUv3**.
- Un solo proceso, una sola sesión de audio, un solo buffer. Separación total.
- Y el AUv3 no es trabajo tirado: es una **feature del producto que vendés**.

El costo es escribir el AUv3 *y* el host (con `AVAudioEngine.attach` es
manejable, pero es un bloque de trabajo real). Para el problema de hoy, los dos
targets alcanzan y cuestan una fracción.

### Un beneficio colateral que conviene no perder de vista

Publicar Starnight Keys exige **cuenta de desarrollador paga**. Con esa cuenta
se termina el perfil que caduca **cada 7 días** — que es la razón de fondo por
la que "los tres iOS siguen con el build del 17 ago". La app de escenario y la
CAMARAGE de los iPhones/iPads de la banda pasan a firmarse con la misma cuenta:
un año de vigencia, o TestFlight.

### El orden no cambia

1. **Medir el buffer** con las dos apps abiertas.
2. Si aguanta → **opción B**, y las dos apps quedan para siempre separadas.
   La restricción del App Store se cumple sola.
3. Si no aguanta → **dos targets sobre el mismo motor**. Starnight Keys sigue
   subiendo al App Store limpio; lo que se fusiona es un binario privado que
   nunca sale de tu iPad.

---

## 11 · Checklist de escenario: que no suene ni interrumpa nada más

Tres problemas distintos que la gente mezcla. El primero es el grave.

### 11.1 · Lo que te CORTA el audio (lo peor)

Una app con categoría `.playback` **sin** `.mixWithOthers` que arranque a sonar
—un video de WhatsApp, Spotify, un autoplay en Safari, un mensaje de voz— **le
roba la sesión de audio a las tuyas y las calla**. No es que suene encima: las
apaga.

- **Cerrá todo del multitasking antes de empezar.** Deslizá hacia arriba y sacá
  todas las tarjetas menos las dos tuyas.
- `.mixWithOthers` en CAMARAGE y en Starnight Keys las protege **entre ellas**,
  no de una tercera app exclusiva.
- **Llamadas**: una llamada entrante interrumpe la sesión de audio. Y ojo con
  las llamadas del iPhone que repican en el iPad — Ajustes ▸ FaceTime ▸
  **Llamadas desde el iPhone → apagado**. Clásico desastre de escenario.

### 11.2 · Lo que suena ENCIMA

- **Concentración propia**: Ajustes ▸ Concentración ▸ **+** → "Escenario". Sin
  personas ni apps permitidas. Se puede programar para que se active sola.
- **⚠ La Concentración NO silencia alarmas ni temporizadores.** Abrí Reloj y
  **borrá o desactivá todas las alarmas**. Es la causa número uno de un pitido
  a mitad de tema.
- **Silencio** desde el Centro de Control (la campanita) como capa extra: calla
  timbres y alertas, no calla el audio de tus apps (categoría `.playback`).
- Ajustes ▸ **Sonidos**: volumen de timbre/alertas a cero, **"Cambiar con
  botones" apagado** (así no se sube solo), y apagá sonidos de teclado y de
  bloqueo.
- Ajustes ▸ **Notificaciones**: apagá "Permitir notificaciones" en todo lo
  ruidoso. Y "Anunciar notificaciones" apagado.

### 11.3 · Lo que te roba CPU y red

- **App Store ▸ Descargas automáticas**: apagá actualizaciones automáticas. Una
  actualización de 800 MB a mitad de show te come red y procesador.
- Ajustes ▸ General ▸ **Actualización en segundo plano**: apagala salvo lo que
  necesites.
- Ajustes ▸ Pantalla ▸ **Bloqueo automático → Nunca** (las dos apps ya tienen
  keep-awake, pero por las dudas).

### 11.4 · La opción nuclear: Modo Avión

Mata push, llamadas, FaceTime, AirDrop y actualizaciones de una. CAMARAGE
funciona **offline** una vez cacheada la pista (IndexedDB).

- **Si no usás el sync con los seguidores**: Avión y listo. Es lo más seguro.
- **Si lo usás**: activá Avión y después prendé el **Wi-Fi a mano** (se puede).
  Te quedás con la red local para las balizas y sin datos móviles ni llamadas.
  Buen punto medio.

### 11.5 · El candado: Acceso Guiado

Triple clic en el botón superior. Bloquea el iPad en una app: no se sale sin el
código, no hay gestos de multitarea ni Centro de Control. Es lo que evita el
manotazo que te saca de la app a mitad de tema.

**Con la opción B (dos apps)**, el orden importa:

1. Abrí **Starnight Keys** y cargá el preset.
2. Volvé a **CAMARAGE**.
3. Activá **Acceso Guiado** sobre CAMARAGE.

Starnight Keys sigue sonando desde segundo plano gracias a
`UIBackgroundModes: audio`, y el MPK49 lo toca igual — no necesita estar a la
vista. **Riesgo real**: con 4 GB de RAM y un piano de 700 MB en segundo plano,
iOS puede decidir matarlo si le falta memoria. Preset de escenario liviano, o
streaming desde disco. Es un argumento más para la app fusionada, donde no hay
app de fondo que perder.

Si preferís ver las dos, **Split View** funciona (Starnight Keys habilitó
multitarea en E7a) — pero con Split View **no** podés usar Acceso Guiado.

### 11.6 · Orden de encendido, para copiar y pegar

```
1. Modo Avión (+ Wi-Fi a mano si usás sync)
2. Concentración "Escenario" encendida
3. Alarmas del Reloj: todas apagadas
4. Cerrar todas las apps del multitasking
5. Abrir Starnight Keys → cargar preset de escenario
6. Abrir CAMARAGE → login/sync ya hecho, pista cargada
7. Acceso Guiado sobre CAMARAGE
8. Probar: tocá el MPK y dale PLAY a un tema, chequeá los dos canales
```
