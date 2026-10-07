# Precios y niveles · CAMARAGE y Starnight Keys

> Definición pedida por Pato el 13 sep 2026. Los precios de referencia se
> verificaron ese día; conviene rechequearlos antes de publicar.

---

## 1 · Lo que cobran los comparables (verificado)

### Instrumentos de iPad

| App | Precio | Modelo |
|---|---|---|
| **Ravenscroft 275** (un solo piano, premium) | **US$ 35,99** | Pago único, sin compras dentro |
| **KORG Module Pro** (workstation, marca conocida) | **US$ 39,99** | Pago único **+ expansiones** de US$ 4,99 a US$ 29,99 |

### Apps de escenario

| App | Precio | Modelo |
|---|---|---|
| **Stage Traxx 4** | Gratis hasta **6 canciones** · **US$ 29,99** desbloquea todo | **Pago único**, con sync por **iCloud** y "todas las funciones nuevas de los próximos 12 meses" |
| **BandHelper** | **US$ 2,25 a 3,75 / mes** (US$ 16 a 32 / año) para solista | **Suscripción**, escala por tamaño de banda (2-5, 6-20, 21-100, 101-500) y por almacenamiento (5 / 15 / 50 GB) |

### El dato más útil de toda la búsqueda

**Stage Traxx sincroniza por iCloud, no por servidor propio.** Los audios viven
en la nube **del usuario**. Por eso pueden cobrar una sola vez: no tienen costo
recurrente por cliente. Es la jugada a copiar.

---

## 2 · Starnight Keys

### Posicionamiento

Starnight Keys es más que Ravenscroft (que es un piano) y está en la liga de
Korg Module Pro: sampler con streaming, tres motores de síntesis, 20 presets,
cadena de FX, sampler de usuario y grabador de multisamples.

**Pero sos un desarrollador sin reseñas.** Korg cobra 40 dólares porque dice
KORG en la caja. Un recién llegado entra por debajo, o no entra.

### El problema del precio de entrada

**Apple no tiene prueba gratis para apps pagas.** Si la ponés a US$ 25, nadie la
escucha antes de comprarla, y sin reseñas nadie compra a ciegas. La única forma
de dar a probar es **gratis con desbloqueo por compra dentro** — que es
exactamente lo que hace Stage Traxx.

### Propuesta

| | |
|---|---|
| **Descarga** | Gratis, con un piano de fábrica completo y los 20 sintes |
| **"Desbloquear todo"** | **US$ 14,99** · pago único · todas las librerías, sampler de usuario, grabador de multisamples, exportar presets |
| **Expansiones** (más adelante) | US$ 9,99 a US$ 19,99 cada una, al estilo Korg. Acá va **tu piano alemán grabado**, que es contenido propio y no depende de licencias de terceros |

Arrancás por debajo de Korg, das a probar de verdad, y dejás la puerta abierta a
subir el precio cuando haya reseñas. Bajar un precio se perdona; subirlo después
de vender barato, no tanto.

---

## 3 · CAMARAGE · qué es gratis

**La regla sigue siendo la de §11.1 del plan de producto: gratis seguir, se paga
dirigir.** Si el seguidor paga, nadie prueba el sync.

### Incluye

- Unirse a una banda con un código e integrar el setlist del director.
- Ver **letras, cifrado y metrónomo** en la vista de tu rol.
- **Seguir el reloj del maestro** (sync como seguidor, ilimitado).
- Setlist de sólo lectura.
- Funcionar **offline** con lo que ya se sincronizó.
- **Hasta 5 canciones propias**, para que un solista pueda probar la app entera
  sin que nadie lo invite. (Stage Traxx da 6; el número es discutible, la idea no.)

### No incluye

Crear más de 5 canciones · reproducir pistas · **ser el maestro** del sync ·
MIDI saliente · el editor de letras sobre la forma de onda · hospedar AUv3 ·
las skins.

### La línea que no se cruza

**Nada que pueda fallar a mitad de show queda detrás de un pago.** Un cantante
que se queda sin letra porque venció algo es una reseña de una estrella y una
banda perdida. Por eso el seguidor es gratis **y sin límite de tiempo**.

---

## 4 · CAMARAGE Pro · qué trae y cómo se cobra

### Trae

Canciones ilimitadas · editar setlist y canciones · editor de letras sobre la
onda · marcar tiempos y secciones · **reproducir pistas** con cuenta previa ·
**ser el maestro del sync** · **MIDI saliente** a pedales, luces y consola ·
**hospedar AUv3** · las skins.

### ¿Suscripción por la base de datos?

**No, o no toda.** Hay que separar dos cosas que se están mezclando:

| Qué | Cuánto cuesta por usuario por mes | Cómo se cobra |
|---|---|---|
| Postgres: setlists, letras, miembros, marcas de tiempo | **Centavos.** Son filas de texto. | Va en el pago único |
| Realtime: las balizas del sync | Barato, y **eliminable**: el `CONTEXT.md` ya propone el **maestro como servidor en wifi local**. | Va en el pago único |
| **Storage: los audios de las pistas** | **Acá está todo el costo.** El plan gratis de Supabase tiene 1 GB (ya anotado en `PLAN_AUDIO_PISTAS.md` §5), y el egreso se paga. | **Esto y sólo esto justifica una suscripción** |

### La decisión

> **Pro = pago único.** Y los audios, por defecto, en la nube **del usuario** —
> Archivos, iCloud, Drive— o cargados a mano, como funciona hoy.
> **"Nube CAMARAGE" = suscripción opcional**, para el que quiere que los audios
> se repartan solos a toda la banda.

Así podés decir algo que casi nadie en esta categoría puede decir: *"si no
querés nube, lo comprás una vez y no pagás nunca más"*. BandHelper no puede.

### Precios propuestos

| | Precio | Nota |
|---|---|---|
| **CAMARAGE Pro** | **US$ 29,99** pago único | Es el ancla que Stage Traxx ya instaló en la categoría; el cliente la conoce |
| **Nube CAMARAGE** | **US$ 3 a 5 / mes** o **US$ 30 / año por banda** | En el rango de BandHelper, que cobra US$ 16 a 32 al año por solista y escala por tamaño de banda |

### El truco de Stage Traxx que conviene copiar

Su licencia incluye **todas las funciones nuevas de los siguientes 12 meses**, y
después ofrecen una licencia de actualización con descuento. Es ingreso
recurrente sin alquilar la app.

**Aviso honesto:** no es gratis en percepción — hay hilos de usuarios enojados en
su propio foro por el costo acumulado. Si se copia, hay que decirlo claro **antes**
de la compra, no después.

---

## 5 · Resumen

| Producto | Precio | Modelo |
|---|---|---|
| **Starnight Keys** | Gratis · **US$ 14,99** desbloquea todo | Pago único + expansiones futuras |
| **CAMARAGE** | Gratis · seguir siempre, 5 canciones propias | — |
| **CAMARAGE Pro** | **US$ 29,99** | Pago único |
| **Nube CAMARAGE** | **US$ 3 a 5 / mes** por banda | Suscripción opcional |

Una banda entera arranca gratis. El director paga una vez. Y sólo paga por mes
si quiere que los audios viajen solos.

---

## 6 · ¿Y si TODO va a iCloud / Drive, base de datos incluida?

Los audios sí. La base de datos no — y lo bueno es que **no hace falta**.

### Los audios: sí, y ahí está resuelto el 99 % del problema

Los audios son **el 99 % de los bytes y el 100 % del costo**. Sacarlos de tu
servidor es toda la pelea. iCloud Drive en iOS, Drive o SAF en Android, o
directamente Archivos, que es como funciona hoy.

### La base de datos: tres razones por las que no

1. **iCloud es sólo Apple.** Tu banda tiene un A56 y vos vas a publicar en Google
   Play. Si la base vive en iCloud, el baterista con Android **no existe**. Y si
   la ponés en Drive, el flujo en iOS es peor. Terminás escribiendo las dos
   integraciones para no ganar nada.
2. **No hay tiempo real.** Tu sync manda una baliza cada 2 segundos con
   disciplina de reloj y llegás a ±3 ms. Ni iCloud ni Drive son un canal de
   mensajes: notifican cambios en segundos, cuando quieren. **El sync se muere.**
3. **Los conflictos y el compartir pasan a ser problema del usuario.** Dos
   personas editando el setlist, y cinco carpetas compartidas a mano, cada uno en
   una plataforma distinta.

### Y sobre todo: la base no es lo que cuesta

Trece canciones con letra y marcas de tiempo son unos cientos de kilobytes de
**texto**. Mil bandas siguen entrando en el plan más barato. **Estás pensando en
mover lo barato y dejar lo caro.**

> **La división correcta: los bytes afuera, la coordinación adentro.**

### Mejor que las dos: enlaces, no archivos

El setlist guarda una **referencia** al audio —una URL, un id de Drive o de
iCloud— y cada aparato lo baja de donde el director lo puso. Tu servidor guarda
el enlace, nunca los bytes. Cuesta lo mismo que una fila de texto y funciona en
las dos plataformas.

**Ojo con un detalle que es fácil pasar por alto:** iCloud le sirve al director
para *su* biblioteca y su respaldo, pero **no para repartirle los audios a la
banda** — los seguidores en Android no lo pueden leer. El mecanismo de reparto
tiene que ser multiplataforma sí o sí: un enlace, un paquete exportado, o la red
local.

### El as en la manga: el ensayo es un wifi

`CONTEXT.md` ya propone el **maestro como servidor en wifi local** (el router en
la valija). Eso no sólo reparte las balizas: puede repartir **los audios**.
Sin nube, sin costo, y más rápido que cualquier descarga. Para el show es además
la opción más robusta, porque no depende del wifi del lugar ni de que haya señal.


---

## Precio definitivo de Starnight Keys · 14 de septiembre de 2026

**US$ 14,99**, revisado desde los 24,99 que proponía este documento.

El criterio pasó a ser un piso neto: **que queden 10 dólares** después de la
comisión de Apple y del IVA. Apple liquida `(precio − IVA) × 85%`, con el IVA
descontado **antes** de la comisión, así que el mismo precio de lista deja
distinto en cada país. 14,99 es el escalón más bajo que cumple el piso en todos
los mercados, incluido el peor caso (Hungría, 27% de IVA, deja 10,03). En EE.UU.
deja entre 11,90 y 12,74.

El 85% supone estar en el **App Store Small Business Program**, que hay que
solicitar aparte y no es automático. Sin él la comisión es 30%.

Sigue muy por debajo de los comparables de este mismo documento, así que queda
margen para una promoción de lanzamiento. El precio de CAMARAGE Pro no se tocó.
