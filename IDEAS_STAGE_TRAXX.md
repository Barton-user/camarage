# CAMARAGE · Qué robarle a Stage Traxx 4

> Análisis de features y UX de Stage Traxx 4 (MWM / Peter Dikant), filtrado por
> lo que tiene sentido en CAMARAGE y ordenado por relación valor/esfuerzo.
> 16 ago 2026.

---

## Resumen en una línea

Stage Traxx es más fuerte en **mezcla de audio** (32 pistas, 16 buses, EQ) y en
**manipular la canción en vivo** (loopear un estribillo, saltear un puente).
CAMARAGE es más fuerte en **letras sincronizadas y vistas por rol** — cifrado
para el bajista y metrónomo visual para el baterista no existen en ninguna de
las apps de referencia.

Lo que hay que copiar no es la mezcla multipista (requiere motor nativo, ver §4).
Es la **manipulación de secciones en vivo**, el **MIDI embebido en la línea de
tiempo**, y un puñado de detalles de UX de escenario que son baratos y se notan
muchísimo.

---

## 1 · Barato y se nota mucho (haría esto primero)

### 1.1 Duración por canción y total del show
Stage Traxx muestra la duración al lado de cada título en el setlist. Ahora que
tenemos el audio, **la duración la sabemos sin que la cargues**: sale del archivo.

Sumadas dan la duración del show, que es información que hoy no tenés en ningún
lado y que sirve para armar la lista.

*Esfuerzo: bajo.* Ya guardamos `audio_bytes`; agregar `audio_duration_seconds` al
subir y mostrarlo.

### 1.2 Estados en el setlist: TOCADA · SONANDO · PRÓXIMA
Marcadores visuales claros de qué ya pasó, qué suena y qué viene. Hoy tenés el
número de orden y el indicador de posición, pero de un vistazo en un escenario
oscuro no se lee igual.

*Esfuerzo: bajo.*

### 1.3 Protección de doble toque en PLAY y STOP
Esto es lo mejor de la lista de Stage Traxx y cuesta veinte líneas. En escenario,
un roce con el pulgar y frenaste la canción delante de la gente. Con doble toque
obligatorio, el accidente desaparece.

Ya tenés el overlay de bloqueo, pero es todo-o-nada: bloquea la pantalla entera.
Esto protege solo el transporte y te deja seguir navegando.

*Esfuerzo: muy bajo. Impacto alto.*

### 1.4 Autoscroll de velocidad constante como respaldo
Stage Traxx tiene dos modos de scroll: por tiempos (como el nuestro) o a
**velocidad constante**, calculada con la duración de la canción.

Sirve para canciones sin letras cronometradas: en vez de no mostrar nada, la
letra baja parejo de principio a fin. Es peor que los tiempos reales, pero
infinitamente mejor que nada — y te deja meter un tema nuevo al setlist sin
transcribirlo primero.

*Esfuerzo: bajo.* Ya tenemos duración y posición.

### 1.5 Búsqueda en la biblioteca
Con 13 canciones no hace falta. Con 40, sí. Anotado para cuando crezca.

---

## 2 · El salto de calidad real: secciones en vivo

Es **la feature más fuerte de Stage Traxx** y la que más cambia cómo se toca.

Definís regiones de la canción (Intro, Estrofa, Estribillo, Puente) con colores,
y en vivo podés **loopear el estribillo** para que cante la gente, **saltear el
puente** si el show va largo, o **estirar el outro** — con un toque o por MIDI.
El salto espera al próximo compás para no cortar la música.

**Por qué nos queda cerca:** ya existe la tabla `song_sections` en el schema y las
canciones ya tienen secciones asociadas a las letras. Falta la capa de arriba:
marcar los tiempos de inicio y fin de cada región, y la lógica de salto
cuantizada al compás.

**La parte difícil** es que hoy reproducimos un archivo estéreo entero. Saltar
dentro de un archivo se hace moviendo la posición de lectura — eso sí se puede.
Lo que no se puede sin cortar el audio en pedazos es *loopear* limpio manteniendo
la cola de reverb. Para una primera versión, un salto cuantizado al compás alcanza
y se escucha bien en la mayoría de los casos.

*Esfuerzo: alto. Valor: el más alto de la lista.*

---

## 3 · MIDI embebido en la línea de tiempo (tenemos media hecha)

Stage Traxx mete comandos MIDI dentro de la letra: al llegar a esa línea dispara
Program Change, CC, notas o SysEx — para cambiar el patch de la guitarra, mover
luces, lo que sea. Con precisión de timestamp.

**Nosotros ya tenemos la estructura**: cada línea de letra puede tener un cue MIDI
asociado, con nota y tiempo. Lo que cambia es la dirección: hoy esos cues los
**recibimos** desde Logic; acá los **mandamos** nosotros.

Y el transmisor ya está escrito y probado: el plugin BLE que hace de periférico,
que es justamente la ruta que confirmamos que macOS surfacea bien.

Casos concretos para la banda: cambiar el patch del pedal de guitarra al entrar el
estribillo, mandar Program Change a MainStage si algún día vuelve el Mac, disparar
una escena de luces en el puente.

*Esfuerzo: medio.* La estructura de datos existe, el transporte existe. Falta
agendar los envíos sobre el reloj del audio (mismo mecanismo que el click) y una
UI para elegir qué manda cada cue.

---

## 4 · Lo que NO conviene copiar

**32 pistas, 16 buses de salida, EQ paramétrico, AUv3.** Todo eso necesita un
motor de audio nativo. Web Audio en la WebView no puede rutear a salidas
específicas de una interfaz USB. Replicarlo significa reescribir el motor en Swift
y perder Android. Con tu setup — cable Y, música a la consola, click a los
in-ears — no lo necesitás.

**Failover output.** Redundancia para producciones grandes con dos equipos
espejados. Sobra para una banda.

**Pantalla externa para el público.** Existe la posibilidad (el iPad puede sacar
video), pero no es tu caso hoy.

---

## 5 · Sync entre integrantes: corrijo lo que te dije antes

Yo te había propuesto hacerlo con **Supabase Realtime**, o sea por internet.
Stage Traxx lo resuelve con **Network Sessions sobre WiFi local**: un dispositivo
hace de host y los demás siguen sus letras y su estado de reproducción. En la
versión 4 los clientes además pueden controlar al host de forma remota.

**Su enfoque es mejor que el mío para un escenario**, por una razón simple: no
depende de que el venue tenga internet. Basta con que todos estén en la misma red
— incluso el hotspot del teléfono del host, sin datos.

Vale la pena notar que en su propio foro de soporte admiten que la función de red
se vuelve inestable con varias personas en la sala. O sea: no es magia, y conviene
diseñarlo con el mismo criterio que hablamos — mandar poco (posición + instante de
referencia) y que cada dispositivo corra su reloj local, en vez de transmitir la
posición continuamente.

**Propuesta corregida:** WebRTC o WebSocket sobre la red local como camino
principal, con Supabase Realtime como respaldo cuando haya internet y los
dispositivos no se vean entre sí.

---

## 6 · Detalles de UX que valen la pena

| Idea | Por qué sirve | Esfuerzo |
|---|---|---|
| Colores por sección en la letra | Ubicarte de un vistazo en un escenario oscuro | bajo |
| Markdown en las letras (negrita, cursiva) | Marcar entradas, coros, gritos | bajo |
| Transposición de acordes con un toque | Si algún tema baja de tono para la voz, el bajista lo ve al instante | medio |
| Historial de canciones tocadas | Saber qué tocaste el show pasado | bajo |
| Notas por canción visibles en escenario | Ya existe el campo, pero solo se ve en la web admin | muy bajo |
| Anotaciones sobre la letra | Recordatorios propios sin tocar el texto | medio |

---

## 7 · Dónde CAMARAGE ya les gana (no perderlo de vista)

Al comparar es fácil sentir que faltan cosas. Conviene tener presente lo que
ninguna de estas apps hace:

- **Vista de cifrado para el bajista**, alimentada por el mismo reloj.
- **Metrónomo visual para el baterista**, con subdivisiones.
- **Una vista distinta por rol** desde la misma base de datos y el mismo reloj.
- **Letras transcritas automáticamente** con tiempos (el pipeline de Whisper que
  ya usaste): en Stage Traxx los tiempos se cargan a mano o con archivos LRC.
- **Web admin propia** para editar todo desde la computadora, con teclado.

Stage Traxx es un reproductor con letras. CAMARAGE es un sistema para toda la
banda que además reproduce. Esa es la diferencia que conviene profundizar.

---

## 8 · Orden sugerido

1. Duración de canción y total del show *(rápido, útil ya)*
2. Doble toque en PLAY/STOP *(rápido, evita un desastre en vivo)*
3. Estados TOCADA/SONANDO/PRÓXIMA + auto-avance *(rápido)*
4. Offset por canción *(ya pendiente de antes)*
5. Modo "marcar tiempos" en la web *(hace usable todo lo demás)*
6. MIDI saliente en la línea de tiempo *(media hecha)*
7. Secciones con salto en vivo *(el salto de calidad)*
8. Sync entre integrantes por red local *(el más ambicioso)*
