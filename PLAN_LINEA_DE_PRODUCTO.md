# Línea de producto · CAMARAGE · Starnight Keys · el módulo de guitarra

> Exploración pedida por Pato el 13 sep 2026: tres apps en el App Store
> (CAMARAGE · Starnight Keys · CAMARAGE+), con Tone3000 adentro de la grande.
> Este documento dice qué de eso se sostiene y qué no.

---

## 1 · Primer dato: Tone3000 no es un procesador

TONE3000 es una **librería** de más de 700.000 capturas de amplificadores (NAM)
e impulsos (IR), con un plugin oficial gratuito para **Mac, Windows y Linux —
no hay versión iOS** — y una **API pública**.

Lo que se integra no es Tone3000: es **Neural Amp Modeler**, el motor.
`NeuralAmpModelerCore` es **C++ y licencia MIT**, que permite uso comercial y
embeberlo. O sea: mismo lenguaje y mismas restricciones de tiempo real que el
motor de Starnight Keys. Entra como una etapa más del grafo, al lado de los
filtros y la reverb.

Tone3000 pasa a ser **de dónde salen los tonos**, por su API.

**Dos banderas:**

1. Los modelos vienen en cuatro tamaños — **nano · feather · lite · standard**.
   Para un aparato móvil se usan nano y feather; standard es para estudio.
2. Cada captura tiene **sus propios términos de uso**. No se empaquetan adentro
   de una app paga: el usuario las descarga. Es exactamente la misma lección que
   la tabla de licencias de las librerías de samples.

También conviene saber que en iOS **ya existen apps y AUv3 de NAM** (NAM XT,
NAM Live, NAM Loader Pedal). Eso importa para la sección 4.

---

## 2 · Las tres apps: Apple te rebota CAMARAGE+

Guideline **4.3(a)** de la App Store Review, textual:

> *"Don't create multiple Bundle IDs of the same app… If your app has different
> versions for specific locations, sports teams, universities, etc., consider
> submitting a single app and providing the variations using in-app purchase."*

CAMARAGE y CAMARAGE+ son el caso de manual: la misma app con más funciones. Y
más allá del rechazo, el costo diario es feo: dos revisiones, dos builds, dos
sets de capturas, dos colas de soporte, y el que compró CAMARAGE tiene que
volver a comprar para pasar a la grande.

**La forma correcta: una sola CAMARAGE, con los módulos como compra adentro.**

```
CAMARAGE  (base gratis: setlist, letras, cifrado, click, pistas, sync)
   ├── Módulo TECLAS      ·  compra
   ├── Módulo GUITARRA / BAJO  ·  compra
   └── Módulo VOZ         ·  compra
```

"CAMARAGE+" deja de ser una app y pasa a ser **CAMARAGE con los módulos
comprados**. El cantante en un Android viejo instala la misma app y no activa
nada; vos activás los tres. Y la restricción de aparato se resuelve en tiempo de
ejecución ("este módulo necesita un iPad M1 o superior"), no en la tienda.

---

## 3 · Starnight Keys sí puede quedar aparte

No es una variante de CAMARAGE: es otro producto, con otro público (un
tecladista que no toca en una banda con setlist), otra categoría y otras
búsquedas. Eso 4.3 no lo toca.

**Y acá está la jugada elegante:** en vez de duplicar el motor adentro de
CAMARAGE, **Starnight Keys publica su AUv3 y CAMARAGE lo hospeda**.

- Una sola compra, dos lugares donde usarlo.
- Cero código duplicado entre los dos binarios.
- Cero ambigüedad con 4.3: no hay dos apps con el mismo contenido.
- El AUv3 ya estaba en el roadmap del producto: no es trabajo extra, es trabajo
  adelantado.

Y generaliza: el **módulo de guitarra puede hospedar cualquier AUv3** que el
usuario ya tenga — incluidos los NAM que ya existen en iOS. Escribir el motor
NAM propio pasa a ser opcional, no un requisito para arrancar.

---

## 4 · Cuál es realmente el producto

El simulador de amplificador **no es el diferencial**. Hay decenas, y algunos
gratis. Lo que no tiene nadie es esto:

> **El setlist cambia el sonido de toda la banda.**
> Pasa la canción, y al tecladista le cambia el preset de Starnight, al
> guitarrista el amplificador y los pedales, al bajista su cadena — cada uno en
> su aparato, todos sincronizados al mismo reloj.

El mapa competitivo es claro:

| | Hospeda instrumentos | Conoce el setlist | Sincroniza a la banda |
|---|:---:|:---:|:---:|
| AUM · Loopy Pro | ✓ | ✗ | ✗ |
| BandHelper · Prime · Stage Traxx | ✗ | ✓ | parcial |
| **CAMARAGE+** | ✓ | ✓ | ✓ |

AUM y Loopy Pro hospedan plugins pero no saben en qué canción estás.
BandHelper y Prime mandan Program Change pero no tienen el instrumento adentro.

**CAMARAGE+ es un host de AUv3 que sabe en qué compás de qué canción está.**
Esa frase es el producto. Y como consecuencia práctica, te ahorra escribir cada
procesador: hospedás, no reimplementás.

---

## 5 · La pregunta de la potencia

> *"El problema sería si una sola persona es cantante, guitarrista y tecladista
> y quiere usar todo en una sola app."*

**No lo define la app: lo definen los módulos activos.** Una app con tres
módulos comprados y uno cargado cuesta lo mismo que una app de un módulo.

Y hay un hecho físico que ayuda: **no podés tocar guitarra y teclas a la vez.**
Guitarra + voz sí, teclas + voz sí, las tres no. Así que lo que importa es
cuántos módulos están **activos**, y eso ya lo sabe el setlist: cada canción
declara qué necesita y se carga o descarga **durante la cuenta previa**, que es
el hueco natural que la app ya tiene.

### El techo real no es el CPU

En orden de qué te frena primero:

1. **RAM.** Un piano multisample son 375 MB a 1 GB. Un modelo NAM son **megas**.
   El que llena la memoria es el teclado, no la guitarra. En el iPad Pro de 2018
   (4 GB) eso ya está al límite con Starnight solo.
2. **Entradas de audio.** La guitarra y la voz tienen que **entrar** al aparato.
   El Zen Quadro tiene 4 preamps y 14 canales de entrada, así que da — pero deja
   de ser "el iPad y un cable" y pasa a ser un rack.
3. **Latencia de ida y vuelta.** Un guitarrista siente el retardo arriba de unos
   7 ms. Eso obliga a buffer de 64 o 128 muestras, y ahí vuelve intacto el
   argumento del cliente único de audio: **una sola app, un solo buffer**.
4. **CPU**, último. Modelos nano/feather están pensados justo para esto.

### Y el aparato

El iPad Pro 12,9" de 2018 **no es el target de CAMARAGE+**: es tu máquina de
desarrollo. El tier grande pide un iPad con M1 o superior, y está bien decirlo.

---

## 6 · Lo de la voz: te lo desaconsejo

Procesar la voz del cantante en la app es la peor relación riesgo/beneficio de
toda la idea:

- La voz propia con retardo es **el camino más sensible que existe** — arriba de
  unos 10 ms molesta de verdad, mucho más que en la guitarra.
- Si la app se cuelga a mitad de show, te quedás **sin voz**. Con la guitarra
  perdés un instrumento; con la voz perdés la canción.
- El sonidista ya tiene compresor y reverb en la consola, y los quiere él.

**La alternativa que sí suma:** que la app **controle** los efectos de voz en vez
de procesarlos — Program Change y CC a la consola o al procesador de voz en cada
canción. Misma arquitectura que los pedales del guitarrista, que ya está pensada
en el plan de pistas. Le das al cantante el cambio automático por canción sin
meter el iPad en el camino de la señal.

---

## 7 · Android

La base de CAMARAGE es una WebView y corre en los dos lados: eso se conserva y
es lo que usa la banda. **Los módulos de audio son iOS.** Portar un motor de
tiempo real a Android es otro proyecto, no una opción de compilación. Conviene
decirlo en la tienda antes de que un cantante con Android compre algo que no va
a poder usar.

---

## 8 · La línea, en una página

| | Qué es | Dónde | Cómo se cobra |
|---|---|---|---|
| **Starnight Keys** | Instrumento: sampler, sintes, FX, grabador de multisamples. Publica su **AUv3**. | App Store · iPadOS | Pago único |
| **CAMARAGE** | Control en vivo de la banda: setlist, letras, cifrado, click, pistas, sync entre integrantes. | App Store + Google Play | Base gratis |
| **Módulo Teclas** | Hospeda el AUv3 de Starnight Keys y le ata los presets al setlist. | dentro de CAMARAGE · iOS | Compra dentro |
| **Módulo Guitarra / Bajo** | NAM + IR (o el AUv3 que ya tengas), con los tonos de TONE3000 por su API. Preset por canción. | dentro de CAMARAGE · iOS | Compra dentro |
| **Módulo Voz** | **Controla** los efectos, no los procesa. PC/CC a consola por canción. | dentro de CAMARAGE | Compra dentro |

**CAMARAGE+ no es una app: es CAMARAGE con los módulos comprados.**

---

## 9 · Qué haría primero

1. **Terminar Starnight Keys y su AUv3.** Es el producto que ya está más cerca,
   y el AUv3 es la pieza que destraba todo lo demás.
2. **Convertir CAMARAGE en host de AUv3** con un solo módulo: Teclas. Si eso
   anda —un preset por canción cambiando solo mientras corre la pista— la tesis
   del producto está probada con un módulo, no con tres.
3. **Recién ahí el módulo de guitarra**, y hospedando un AUv3 de NAM existente
   antes de escribir el tuyo.
4. El módulo de voz, como control, cuando haya un show que lo pida.

Lo que **no** haría: abrir los tres módulos a la vez, ni publicar dos CAMARAGE.

---

## 10 · El repo del plugin de TONE3000 (github.com/tone-3000/tone3000-plugin)

Pato lo pasó a mitad de la charla. Lo que hay adentro:

- **Licencia MIT**, construido sobre **JUCE**.
- **Vendorea `NeuralAmpModelerCore`** en el árbol: el modelado de amplificador
  sale de ahí.
- Usa **AudioDSPTools** (de iPlug2) para remuestreo.
- Habla con la **API de TONE3000 por OAuth 2.0 + PKCE**: el usuario se loguea,
  navega el catálogo y carga capturas sin bajar archivos a mano.
- Compila VST3, AU, CLAP, LV2 y standalone para **Mac, Windows y Linux**.
  **No compila iOS ni AUv3.** La UI es React adentro de una WebView nativa.

### Cómo conviene usarlo

**No portes el plugin. Tomá sus dos mitades por separado.**

1. **`NeuralAmpModelerCore`** entra directo en `Engine/` como una etapa más del
   grafo. Es C++ y MIT: no necesitás JUCE para nada. Tu motor sigue siendo "C++17
   sin dependencias" como dice el plan de arquitectura.
2. **El repo es la documentación viva de la API de TONE3000** — el flujo OAuth
   2.0 + PKCE, los endpoints del catálogo, cómo se piden las capturas. Eso se
   reimplementa en Swift en una tarde leyendo el código, sin arrastrar nada.

Lo de AudioDSPTools probablemente ni lo necesites: tu motor ya remuestrea (el
sampler interpola Hermite y `spinst-build` normaliza a 48 kHz).

### Dos avisos de licencia

- **JUCE tiene licenciamiento comercial propio.** Si algún día portaras el
  plugin entero en vez de tomar el core, eso entra en juego. Tomando sólo el
  core, no.
- El repo es MIT pero **sus dependencias traen términos propios**, y las
  **capturas del catálogo tienen los suyos**, una por una. Verificalo archivo
  por archivo antes de publicar algo pago — es la misma disciplina que usaste
  con las librerías de samples, y por la misma razón.

---

## 11 · Qué módulos puede tener CAMARAGE

### 11.1 · La regla que decide todo: seguir es gratis

Una app de banda con seguidor pago **está muerta**. Nadie prueba el sync si
primero tienen que pagar los cinco. El que arma el show ya quiere la app; los
otros cuatro la instalan porque se las pusiste en la mano en un ensayo.

> **Gratis: seguir. Se paga: dirigir.**

Y cada banda con la que tocás es exposición: cinco instalaciones por banda, una
compra. Ese es el motor de crecimiento, no el precio.

### 11.2 · Base gratis · "Seguir"

Unirse a una banda · ver letras, cifrado y metrónomo en la vista de tu rol ·
seguir el reloj del maestro · setlist de sólo lectura · funcionar offline.

Todo lo que un integrante necesita en el escenario. **Nada que pueda fallar a
mitad de show está detrás de un pago.** Un cantante que se queda sin letra
porque venció una suscripción es una reseña de una estrella y una banda perdida.

### 11.3 · CAMARAGE Pro · "Dirigir"

El que arma el show. Es una sola persona por banda y es la que ya lo quiere.

Editar setlist y canciones · editor de letras sobre la forma de onda · marcar
tiempos y secciones · reproducir pistas con cuenta previa · ser el maestro del
sync · MIDI saliente a pedales y luces · las skins.

### 11.4 · Módulos de instrumento (iOS)

Se compran sueltos porque cada uno sirve a una persona distinta de la banda.

| Módulo | Qué hace | Depende de |
|---|---|---|
| **Teclas** | Hospeda el AUv3 de Starnight Keys. Preset por canción, cambia solo. | Starnight Keys instalado |
| **Guitarra / Bajo** | NAM + IR con los tonos de TONE3000, o el AUv3 que ya tengas. Preset por canción. | `NeuralAmpModelerCore` |
| **Disparador** | Pads y samples por canción: intros, atmósferas, golpes. Agendados sobre el reloj de la pista. | motor de audio |

> **Corrección (13 sep).** En la primera versión de esta lista había un módulo
> **Voz**. Se cae, por dos motivos. Primero, §6 desaconseja procesar la voz en
> el iPad y eso sigue en pie. Segundo, y más importante: lo que quedaba —
> mandar Program Change y CC a la consola por canción — **es exactamente la
> misma función que el MIDI saliente a pedales**, que ya está en Pro. Venderla
> aparte con otro nombre es inflar la página de compras, no agregar valor.
>
> **Si algún día querés efectos de voz de verdad, van por envío, no por
> inserto.** La voz seca viaja a FOH sin pasar por el iPad; el iPad recibe una
> copia y devuelve sólo el retorno de reverb o delay, que el sonidista mezcla.
> Si la app se cuelga, perdés el reverb, no la voz. Así es como se hace en una
> consola, y convierte la idea riesgosa en una defendible — pero recién cuando
> haya un show que la pida.

### 11.5 · Extras

| Módulo | Qué hace | Por qué se paga aparte |
|---|---|---|
| **Pistas Pro** | Stems con faders, salidas multicanal a la interfaz, auto-avance de setlist, modo Jump por secciones, voces guía. | Es la paridad con Stage Traxx / Prime / Playback. Pide motor nativo. |
| **Partitura** | PDF por parte con mapa página/sistema → compás, y pentagrama por MusicXML. | Es la puerta al mercado de orquestas, coros y escuelas. |
| **Analizador** | Transcribir la letra desde el audio, detectar tempo y secciones, sugerir marcas. | **Tiene costo por uso real** (corre en un servidor). Va por créditos, no ilimitado. |

### 11.6 · Pago único contra suscripción — la línea honesta

**Lo que corre en el aparato se cobra una vez. Lo que consume servidor se cobra
por mes o por crédito.** Mezclarlas mal es como se juntan las reseñas malas.

- Pago único: los módulos de instrumento, Pistas Pro, Partitura, las skins.
- Suscripción o créditos: el almacenamiento de audios en la nube (el plan
  gratis de Supabase ya tiene el techo de 1 GB anotado en `PLAN_AUDIO_PISTAS.md`
  §5) y el Analizador.
- CAMARAGE Pro puede ser cualquiera de las dos, pero si incluye la nube, es
  suscripción y hay que decirlo sin vueltas.

### 11.7 · No publiques diez compras

Nadie lee una página con diez ítems, y Apple tampoco la premia. **Arrancá con
tres:** Pro, un módulo de instrumento (Teclas) y Pistas Pro. El resto se agrega
cuando haya gente pidiéndolo, que además te dice el precio.

### 11.8 · El mercado que no estás mirando

Prime, Playback y MultiTracks no viven de bandas de rock: viven de **iglesias**.
Equipos de alabanza, ensayos semanales, gente que ya paga por pistas y click, y
grupos de 8 a 15 personas donde el seguidor gratis multiplica. La misma app,
con la vista por rol y el sync que ya tenés, entra ahí sin cambiar casi nada —
y el módulo **Partitura** abre además coros, escuelas y orquestas (el modo de
~20 seguidores que ya quedó anotado en `CONTEXT.md`).

---

## 12 · ¿NAM en el iPad es viable? Sí. Pero no es lo primero.

Hay que separar tres preguntas que se mezclan.

### ¿Corre NAM en un iPad?

**Sí, y no es teoría: ya está hecho.** En el App Store hay hoy apps y AUv3 de
Neural Amp Modeler (NAM XT, NAM Live, NAM Loader Pedal). Y iOS es plataforma de
simuladores de amplificador desde hace más de una década. `NeuralAmpModelerCore`
es C++ y MIT: entra en `Engine/` como una etapa más del grafo, sin JUCE.

### ¿Corre en TU iPad?

El Pro de 2018 (A12X, 4 GB) probablemente aguante **nano o feather**; standard
es otra conversación. Pero ese iPad no es el target del módulo de todos modos —
y ojo, que ahí el problema no es el modelo (son megas) sino el piano de 700 MB
que ya está ocupando la memoria.

### ¿Conviene que lo construyas vos? No primero.

| Nivel | Qué es | Cuándo |
|---|---|---|
| **1** | **Hospedar** un AUv3 de NAM que ya existe, y que el setlist le cambie el modelo por canción. | Primero. Cero DSP escrito por vos, y prueba la tesis del producto. |
| **2** | **Embeber** el core MIT en tu motor: un solo cliente de audio, un solo buffer, control total. | Si el nivel 1 anda y la gente lo pide. |
| **3** | Escribir tu propio motor de modelado. | Nunca. |

### Lo que hay que medir antes (no se razona)

1. **Latencia de ida y vuelta con entrada.** Es lo único que decide si se puede
   tocar. Buffer en 64 o 128, medido con la Zen Quadro y una guitarra real.
2. **Térmica.** Dos horas seguidas, no cinco minutos. Un iPad caliente baja el
   reloj y ahí aparecen los cortes — justo a la mitad del show.
3. **RAM**, si en el mismo aparato hay un piano multisample cargado.
4. **Tamaño de modelo**: nano y feather para vivo; standard para estudio.

### Y la pregunta que decide si se construye

**¿El guitarrista ya tiene un modeler?** Si tiene un Helix, un HX Stomp o un
Quad Cortex, no necesita tu módulo: necesita el Program Change que ya está en
Pro. Si no tiene ninguno, lo necesita y lo paga. Ese reparto —y no la viabilidad
técnica— es lo que dice cuánta gente compraría el módulo.

---

## 13 · ¿Quién es el que compra esto? (el hardware cierra, el argumento no)

### El hardware cierra, y mejor de lo esperado

Focusrite confirma que las Scarlett bus-powered —**Solo, 2i2 y 4i4, 3.ª y 4.ª
generación**— se conectan **directo a un iPad USB-C, sin hub alimentado**. Un
cable y nada más. Es un rig mucho más simple que el de la Zen Quadro, y la 4i4
ya da cuatro salidas, que es justo lo que hace falta para las dos mezclas.

### Pero el argumento del precio es flojo

"Más barato que un Helix" no es un buen gancho. El guitarrista sin plata **no
compra un Helix**: compra un Zoom, un Mooer, un Valeton o un GT-1 usado, muy por
debajo. Aparatos hechos para eso, con pedales, que no se cuelgan y que no
comparten el procesador con una WebView. Si el discurso es "simulador más
barato", estás compitiendo contra hardware en el único terreno donde el hardware
gana siempre: la confiabilidad.

### El wedge real: el iPad ya está ahí

El guitarrista de una banda que usa CAMARAGE **ya lleva el iPad al escenario**
por la letra y el setlist. La interfaz muchas veces ya la tiene de grabar en
casa. El módulo es software sobre fierros que ya carga.

> **No es precio: es distribución.**

Y el diferencial no cambia: ningún multiefecto barato cambia de preset con la
canción, sincronizado con toda la banda. Un Helix tampoco — a menos que alguien
le mande el Program Change. Ese alguien sos vos.

### Un detalle que juega a favor

El problema clásico de un rig con tablet es que **no hay pedal**. En esta app ese
problema **desaparece**: el preset cambia con la canción, solo. No hay nada que
pisar. (Igual conviene el pedal Bluetooth del roadmap para pánico y saltos
manuales.)

### El problema honesto: ¿quién lleva el iPad?

En tu banda el del iPad sos vos. Para que el módulo de guitarra se venda, **el
guitarrista necesita su propio iPad y su propia interfaz**. Eso ya no es
"software sobre lo que tenés": es un segundo rig. Adentro de una banda, el
módulo es una venta más difícil de lo que parece.

### Dónde encaja perfecto: el solista y el dúo

Una persona, un iPad, una interfaz: guitarra que entra, voz, pistas, letra y
click. Todo en el aparato que **ya iba a llevar igual** porque necesita la letra
y las pistas. Es la única configuración donde todas las piezas del producto
encajan a la vez — y es exactamente el mismo perfil que el mercado de iglesias
de §11.8.

**La persona no es "el guitarrista sin plata": es "el que ya lleva el iPad al
escenario".** En una banda, ese es el director. Solo o en dúo, son todos.

---

## 14 · CORRECCIÓN FINAL · el diferencial ya está entregado sin módulos

Pato marcó lo que da vuelta el documento entero:

> *"Cambiar los efectos es algo que ya tengo previsto hacer en CAMARAGE,
> enviando MIDI por Bluetooth. Solo con CAMARAGE hacemos eso."*

**Es cierto, y cambia el orden de todo.** Si CAMARAGE manda MIDI, el setlist ya
cambia el sonido de toda la banda, cada uno en el aparato que ya tiene. No pide
motor de audio, no pide fusión, no pide NAM, y **corre también en Android**.
La tesis del producto está entregada por CAMARAGE Pro sola.

**Entonces los módulos no son el producto.** Son un accesorio para el que no
tiene el fierro — lo más caro de construir, para el que menos plata tiene.

### Lo único que el MIDI no puede hacer

1. **Sacar la radio del camino crítico.** `CONTEXT.md` documenta meses de
   flapping, conexiones que aguantan 30 s y caché GATT. Para un Program Change
   el jitter no importa: importa que el enlace **esté vivo** en ese compás. Un
   módulo adentro de la app no tiene radio en el medio.
2. **Llegar a pedales que no aceptan MIDI**, que son justo los baratos.
3. **Darte un sonido que no tenés**, en la misma mezcla y el mismo reloj que la
   pista y el click. Todo el rig en una mochila, para ensayar o componer.

### El orden de trabajo, corregido

| | Qué | Por qué |
|---|---|---|
| **1** | **CAMARAGE Pro con MIDI saliente** | Es la tesis entera. Ya está previsto, corre en los dos sistemas, cero motor de audio. |
| **2** | **Starnight Keys + su AUv3** | Producto propio, con su propio público. No es una pieza de CAMARAGE. |
| **3** | **Módulo Teclas** | Primero de los módulos: un tecladista sin fuente de sonido es mucho más común que un guitarrista sin pedalera, y el AUv3 ya existe. |
| **4** | **Módulo Guitarra (NAM)** | Cuando alguien lo pida. Puede que nunca. |

Esto reemplaza el orden de §9.

---

## 15 · Cuántas apps, al final

**Dos.**

| App | Dónde | Cómo se cobra | Qué trae |
|---|---|---|---|
| **CAMARAGE** | App Store + Google Play | Base gratis · **Pro** por compra dentro | Setlist, letras, cifrado, click, pistas, sync entre integrantes, MIDI saliente. Pro suma editar, dirigir y hospedar AUv3. |
| **Starnight Keys** | App Store | Pago único | La app suelta **y su AUv3**, que aparece solo adentro de CAMARAGE y de cualquier otro host. |

### Lo que parece una app y no lo es

- **El AUv3** no es una app: es una extensión adentro de Starnight Keys.
- **CAMARAGE+** no es una app: es CAMARAGE con Pro y los módulos comprados.
- **La versión Android** no es otra app: es la misma, en otra tienda.
- **CAMARAGE Stage** (el target privado fusionado) no es un producto: existe sólo
  si la medición del buffer lo obliga, y nunca sale de tu iPad.

### En números operativos

- **2 apps · 3 fichas de tienda** (CAMARAGE en las dos tiendas, Starnight en una).
- **1 fuente para la UI de CAMARAGE** (`index.html`) con dos cáscaras.
- **1 proyecto Xcode para Starnight Keys** con dos targets: la app y la extensión
  AUv3, compartiendo las librerías por un **App Group**.
