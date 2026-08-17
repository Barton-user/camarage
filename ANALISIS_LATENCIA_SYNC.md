# CAMARAGE · Análisis de latencia para el sync entre integrantes

> Pregunta de Pato: si los seguidores se sincronizan por Supabase, ¿alcanza la
> precisión? Sobre todo para el metrónomo visual del baterista, que
> "hipotéticamente tiene que ser latencia cero".
> 16 ago 2026.

---

## 0 · La respuesta corta

**La latencia de red NO determina la precisión del sync**, si se diseña bien. Un
sistema mal diseñado tiene el error de la red (50-300 ms, variable). Uno bien
diseñado tiene el error del *cálculo de desfase entre relojes*, que se puede
llevar a **±10-30 ms** y **no se degrada con el tiempo**.

**Pero "latencia cero" no existe, ni siquiera dentro de un mismo teléfono.** La
pantalla del dispositivo agrega sola entre 30 y 60 ms entre que la app decide
pintar el beat y que tu ojo lo ve. Ese piso ya está ahí aunque no haya red de por
medio.

Conclusión: podemos hacer que el error de red sea **más chico que la latencia de
la propia pantalla**, o sea todo lo bueno que es físicamente posible. Y aun así,
**el baterista no debería tocar mirando la pantalla** — más sobre esto en §4.

---

## 1 · Por qué el enfoque obvio falla

Lo intuitivo es que el maestro mande la posición todo el tiempo y los seguidores
la muestren:

```
maestro:   "estoy en 42.31s"  →  red  →  seguidor: muestra 42.31s
```

Con esto, **el error de cada cuadro es la latencia instantánea de la red**. Y el
problema no es la latencia promedio: es el **jitter**. Una red que promedia 40 ms
puede tener picos de 300. El metrónomo visual daría saltos hacia adelante y hacia
atrás. Inservible.

---

## 2 · El enfoque correcto: disciplina de reloj

Es lo que hace NTP para sincronizar relojes de computadoras, y funciona igual acá.

### 2.1 · Estimar el desfase entre los dos relojes

Intercambio de cuatro marcas de tiempo:

```
t0 = el seguidor manda el ping           (reloj del seguidor)
t1 = el maestro lo recibe                (reloj del maestro)
t2 = el maestro responde                 (reloj del maestro)
t3 = el seguidor recibe la respuesta     (reloj del seguidor)

desfase = ((t1 - t0) + (t2 - t3)) / 2
ida_y_vuelta = (t3 - t0) - (t2 - t1)
```

La clave es que **el desfase se calcula, no se mide directamente**, y el error de
ese cálculo depende solo de cuán *asimétrico* sea el camino de ida contra el de
vuelta — no de cuán lento sea.

**El truco que usa NTP y que vamos a usar:** tomar muchas muestras y quedarse con
la del *ida y vuelta más bajo*. La muestra más rápida es la que menos cola de
espera tuvo, o sea la menos asimétrica. Con 10 muestras, el error típico baja a
una fracción del RTT mínimo.

### 2.2 · Después, cada dispositivo corre su propio reloj

Una vez conocido el desfase, el maestro manda una baliza cada 2 segundos:

```
{ cancion: "cuando-despierte", sonando: true,
  posicion: 42.31, enMomento: T_maestro, bpm: 150 }
```

Y el seguidor calcula su posición **localmente, a 60 cuadros por segundo**:

```
posicion_ahora = 42.31 + (ahora_local - (T_maestro + desfase))
```

**Acá está el punto central: entre baliza y baliza, la red no participa.** El
seguidor no espera nada de nadie. Si la red se cae por 30 segundos, sigue
funcionando igual de bien.

### 2.3 · ¿Y la deriva de los relojes?

Un cristal de cuarzo de teléfono tiene una precisión de ±20 a 50 partes por
millón. En el peor caso, 50 ppm = 3 ms de deriva por minuto. En una canción de 5
minutos, 15 ms.

Con balizas cada 2 segundos y una corrección suave, la deriva acumulada nunca
pasa de **1 o 2 ms**. Deja de ser un problema.

---

## 3 · Números realistas

| Escenario | RTT mínimo | Error de sync esperado |
|---|---|---|
| Todos en el mismo WiFi decente | 10-30 ms | **±5 a 15 ms** |
| Cada uno con su 4G | 40-100 ms | **±20 a 50 ms** |
| WiFi de venue saturado | 100-400 ms | ±50 a 150 ms *(se detecta y se avisa)* |

Y contra esto hay que comparar el piso que ya existe en cada dispositivo:

| Fuente de latencia | Valor típico |
|---|---|
| Un cuadro a 60 Hz | 16,7 ms |
| Composición + panel de la pantalla | 20-45 ms |
| **Total del pipeline de pantalla** | **30-60 ms** |

**En WiFi, el error de red queda por debajo de la latencia de la propia pantalla.**
O sea: el seguidor no puede distinguirse de un dispositivo que estuviera
generando el metrónomo localmente. Ese es el techo físico.

---

## 4 · La parte incómoda: el metrónomo visual del baterista

Acá tengo que ser honesto aunque no sea lo que querés escuchar.

**El problema no es nuestra sincronización. Es el metrónomo visual en sí.**

La literatura de sincronización sensoriomotora es consistente en esto:
**sincronizar movimientos con destellos visuales es marcadamente peor que con
clicks auditivos** — más variabilidad, más error. El sistema auditivo humano está
mucho mejor cableado para el timing que el visual. Esto vale para *cualquier*
metrónomo visual, incluido uno corriendo en el mismo dispositivo sin red de por
medio.

Puesto en números de tu banda: a 150 BPM cada negra dura 400 ms. Un error de
sincronía de ±30 ms es el 7,5% del beat. Para *ubicarte* en la canción, es
invisible. Para *tocar contra eso*, un baterista lo siente.

**Mi recomendación, en orden:**

1. **El baterista toca contra el click en sus in-ears**, no contra la pantalla.
   Ese click sale de tu dispositivo, que es el mismo que reproduce la pista, así
   que va sample-accurate — cero latencia de red porque no hay red en el medio.
   La pantalla le sirve para saber *en qué parte de la canción está*, no para
   marcar el tiempo.

2. Si no hay sistema de in-ears, la solución es mandarle el click por cable desde
   tu salida derecha, no reproducirlo en su teléfono. Un click generado en el
   teléfono del baterista arrastra el error de sync **al audio**, donde se nota
   muchísimo más que en lo visual.

3. El metrónomo visual queda como lo que realmente es: una **referencia de
   posición** — compás, sección, cuánto falta — no una fuente de tempo.

---

## 5 · No especular: medirlo

Nada de esto tiene por qué ser teoría. Propongo que la app **muestre el número
real** en cada dispositivo:

```
Sync · ±12 ms · WiFi          ← verde, confiable
Sync · ±38 ms · 4G            ← amarillo, bien para letras
Sync · ±140 ms · red mala     ← rojo, avisa que no confíes en el metrónomo
```

Se calcula solo con el intercambio de la §2.1. Así, antes de un show, mirás la
pantalla y sabés si la red del lugar sirve o si conviene que todos se cuelguen de
tu hotspot.

---

## 6 · Arranque sincronizado: el otro truco

Cuando apretás PLAY, si el mensaje tarda 60 ms en llegar, los seguidores
arrancarían 60 ms tarde. La solución no es acelerar la red: es **agendar en el
futuro**.

```
maestro: "arrancamos en T_maestro + 300 ms"
```

Todos —incluido el maestro— empiezan en ese instante, cada uno traduciéndolo a su
propio reloj. El resultado es un arranque conjunto exacto, al costo de 300 ms de
demora en tu propio PLAY, que en escenario no se percibe. Es el mismo principio
que ya usa el click de la app: agendar por adelantado en vez de reaccionar.

---

## 7 · Los dos modos, con una sola arquitectura

La simetría que hace esto manejable: **los seguidores siempre siguen a tu
dispositivo.** Lo que cambia es de dónde saca *tu* dispositivo el tiempo.

```
MODO 1 · Logic manda
   Logic ──BLE MIDI (clock, PC, SPP)──▶ tu dispositivo ──balizas──▶ seguidores
   El audio sale de la Mac. Tu app traduce el MIDI a posición y la reparte.

MODO 2 · Vos mandás
   tu dispositivo reproduce la pista ──▶ balizas ──▶ seguidores
                                     └──▶ BLE MIDI ──▶ pedales de guitarra
   El audio sale de tu salida. La posición nace del archivo.
```

En los dos casos, el código de los seguidores es **idéntico** — reciben balizas y
corren su reloj local. No saben ni les importa quién manda.

Y `elapsedSec()` sigue siendo el único lugar donde se decide el tiempo, con tres
ramas en vez de dos: audio propio, MIDI entrante, o baliza remota.

### El MIDI a los pedales no sufre nada de esto

Importante: los envíos MIDI a tus pedales salen de **tu** dispositivo, agendados
sobre el reloj del audio, igual que el click. **No pasan por la red.** Precisión
de milisegundos, sin depender de Supabase ni de nadie.

---

## 8 · Qué construiría, en orden

1. **Selector de modo explícito** en ⚙: "Logic manda" / "Yo mando". Hoy está
   implícito en el interruptor de Modo Pistas y conviene que sea una decisión
   consciente, porque tener dos maestros a la vez es el error clásico.
2. **Canal de balizas + disciplina de reloj** sobre Supabase Realtime, con el
   indicador de calidad de §5.
3. **Rol de seguidor**: el dispositivo se une a la banda y sigue, mostrando la
   vista de su instrumento.
4. **Arranque agendado** de §6.
5. **MIDI saliente a pedales** sobre el reloj del audio.

Los pasos 1 y 2 son la base; el 3 es donde se ve el resultado.

---

## 9 · Veredicto

**Para letras y cifrado: alcanza y sobra.** Con ±10-50 ms nadie percibe nada.

**Para el metrónomo visual: va a andar tan bien como puede andar un metrónomo
visual** — que no es tan bien como querrías, pero por límites del ojo humano y de
la pantalla, no por Supabase. Con WiFi el error de red queda por debajo de la
latencia del propio display.

**Para el baterista de verdad: mandale el click a los oídos.** Es la única forma
de tener timing sólido, y no depende de red en absoluto.
