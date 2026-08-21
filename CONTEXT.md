# CAMARAGE · Contexto del proyecto

> Documento para retomar el proyecto en otra conversación.
> **Última actualización: 21 ago 2026, cierre del día.** Sesión de UX/UI a lo
> largo de todo el día (10 commits): rediseño completo de la vista del
> baterista (disco gigante, latido de pantalla, letra de 5 renglones, fader
> único de click), transporte unificado en UNA fila en las tres vistas, STOP
> que mantiene la posición, drag-scrub sobre la letra, setlist editable y
> persistente desde la app (+ crear setlist), pantalla de Ajustes reordenada,
> y decisión de producto: publicar en Google Play (ver §4 · PRODUCTO).
> Migración de offset corrida, las dos canciones nuevas cargadas (15 en la
> base), y Gonzalo dado de alta como drummer. **Solo el Samsung A56 quedó
> actualizado con el APK nuevo** — los tres iOS siguen con el build viejo.
> [Actualización anterior: 17 ago 2026.] Sesión larguísima:
> reproductor de pistas, audios en Supabase, MIDI saliente, UX de escenario,
> offset por canción, modo marcar tiempos, selector de modo, sello de versión,
> **sync entre integrantes andando en aparatos reales**, transporte bloqueado en
> los seguidores, **los dos iPads compilados**, y dos canciones nuevas analizadas
> desde el audio (§13). Empezá por **§0**.
>
> ⚠️ **LEER ESTA PRIMERA PARTE ENTERA ANTES DE TOCAR NADA.** Todo lo que está
> después de la marca «ARCHIVO HISTÓRICO» describe la arquitectura vieja y buena
> parte ya no aplica. Sirve para no repetir caminos muertos, no como plan.

---

# 0 · DÓNDE QUEDAMOS — retomar por acá

**Estado al 17 ago 2026, cierre del día.**

## Lo que quedó andando hoy

- **Samsung A56**: APK instalado, sello `20260817-1931`.
- **iPad Pro 12,9" (Pato)**: compilado desde Xcode y andando. En el log del
  aparato real apareció `[CAMARAGE] AVAudioSession en .playback · buffer 0.005s`,
  o sea que **el fix del interruptor de silencio está confirmado en hardware**,
  no solo en el archivo. Ese era el pendiente crítico de iOS y queda cerrado.
- **iPad mini 6 ("iPad de Paloma")**: compilado e instalado también.
- **Sync entre integrantes probado con aparatos reales** (Samsung maestro, iPad
  seguidor). Pato lo vio funcionar: "parecen estar sincronizadas, bastante bien".
  Falta terminar el test formal: salto con la barra, cambio de canción y modo
  avión en el seguidor.
- **El transporte queda bloqueado en los seguidores** (ver §2).
- **Dos canciones nuevas analizadas**, con letra, tiempos, tempo, tonalidad y
  estructura en compases (ver §13). Los SQL están escritos y **sin correr**.

## Lo primero que hay que hacer al retomar

0. **Actualizar los 3 dispositivos iOS** (quedaron con el build del 17 ago;
   el A56 ya tiene el del 21 ago, sello `20260821-1807`):
   - iPad Pro 12,9" (Pato) y iPad mini 6 ("iPad de Paloma"): el `index.html`
     nuevo ya está copiado en `camarage-android/ios/App/App/public/`, así que
     NO hace falta `npx cap copy ios` — abrir `ios/App/App.xcworkspace`,
     elegir cada iPad y ⌘R (enchufados por cable, uno por vez).
   - iPhone 12 (baterista): mismo procedimiento si se justifica; si no,
     esperar la vista de seguidor por PWA (abajo) y no compilarlo más.
   - Recordar el gotcha del Apple ID gratis: el build caduca a los 7 días y
     el *trust* del perfil se resetea (Ajustes → General → VPN y gestión).

1. ✅ **`migration_offset.sql` CORRIDO** (21 ago). La verificación contra
   `information_schema.columns` devolvió 1: la columna `songs.offset_seconds`
   existe. Ya se puede guardar una canción desde la web sin que tire error.
2. ✅ **Las dos canciones nuevas CARGADAS** (21 ago): corrieron
   `insert_la_nueva_sangre.sql` y `insert_camine_sin_mirar_atras.sql`. Con eso la
   base pasa a 15 canciones. Queda pendiente, aparte: escuchar las líneas de
   letra marcadas como dudosas, poner el `program_change` de cada tema (depende
   del patch de los pedales) y bouncear las pistas de escenario.
3. **Commitear.** Hay mucho sin commitear: `index.html` (y sus copias de Android
   e iOS), `page.tsx`, `CONTEXT.md`, los tres `.swift`, más los archivos nuevos
   (`build.sh`, los dos APK, los SQL de canciones y de altas de usuario).
   Si git se queja de `index.lock`: `rm -f .git/index.lock` y de nuevo.
   Al 21 ago `git status` marca `CONTEXT.md`, `web/app/setlists/page.tsx` y
   `web/app/setlists/[id]/page.tsx` (edición en línea de setlists, conteo de
   canciones y aviso antes de borrar).
4. ✅ **`_to_delete/` ya no está** — ese punto queda cerrado.

## Alta de integrantes — cómo funciona de verdad

Esto se investigó hoy y conviene tenerlo escrito, porque la primera lectura del
código me llevó a una conclusión equivocada.

**El registro por el usuario mismo YA EXISTE.** En `camarage.vercel.app/login`
hay un segundo modo, "¿Sin contraseña? Entrar con código": manda un OTP al mail
con `shouldCreateUser: true`, así que **la cuenta se crea sola** al entrar el
código. Y en `/settings` el integrante **se pone su propia contraseña** con
`updateUser({password})`. Pato nunca ve esa contraseña.

**Lo que el integrante NO puede hacer es entrar a la banda.** La política de la
base lo prohíbe explícitamente:

```sql
create policy "band_members: insert por owner"
  on band_members for insert with check (
    exists (select 1 from bands where id = band_id and owner_id = auth.uid())
  );
```

Solo el dueño de la banda inserta miembros. Está bien que sea así: es lo que
evita que cualquiera que se cree una cuenta se autoinvite al setlist. El costo es
un paso manual de Pato por cada integrante.

**Orden correcto:** el integrante entra primero (se crea la cuenta), y DESPUÉS
Pato corre `agregar_integrante.sql`, que busca al usuario por mail. Al revés
falla, y el script avisa por qué.

**Hasta que exista la fila en `band_members`, el integrante entra y ve la app
vacía**, porque `is_band_member()` bloquea todo. Hay que avisarle de antemano o
va a pensar que se rompió algo.

Archivos que quedaron para esto:
- `agregar_integrante.sql` — el genérico, se editan tres líneas.
- `agregar_gonzalo.sql` — ya con `vecchie.gonzalo@gmail.com` puesto.
- `crear_gonzalo_directo.sql` — crea el usuario **por SQL** con contraseña,
  incluida la fila de `auth.identities` que casi siempre se olvida. Funciona pero
  toca tablas internas de auth: **no usarlo salvo que haga falta**.

Ojo con un detalle: la contraseña mínima por la API de Supabase es de **6
caracteres**. Desde el dashboard, `1234` se rechaza. Por SQL directo entra, pero
mejor no.

**✅ HECHO el 17 ago:** Gonzalo entró solo con el código al mail, y Pato corrió el
SQL de membresía. Estado verificado en la base:

| banda | email | rol | activo |
|---|---|---|---|
| Cámara Gesell | keogan3d@gmail.com | `owner` | true |
| Cámara Gesell | vecchie.gonzalo@gmail.com | `drummer` | true |

O sea que **el camino funciona de punta a punta** y ya está probado con una
persona real: el integrante se crea la cuenta solo, y el dueño corre un SQL de
cuatro líneas. Para el próximo integrante, mismo procedimiento con
`agregar_integrante.sql`.

Detalle menor: el `display_name` de Pato está en NULL. Si alguna vez la app lo
muestra, conviene ponerlo:
```sql
update band_members set display_name = 'Pato'
 where user_id = (select id from auth.users where email = 'keogan3d@gmail.com');
```

## Dos cosas que quedaron ofrecidas y sin hacer

1. **Que la app abra la vista del instrumento según el rol.** Hoy `state.role`
   está fijo en `'singer'` en el `index.html` y la vista se elige a mano desde la
   barra de abajo. Leyendo el rol de `band_members` al entrar, cada uno abre la
   suya. Y una vez que el rol viene de la base, se habilita lo otro: que los
   eventos MIDI con destino `drummer` disparen desde **su** aparato.
2. **Pantalla de Miembros en la web admin.** Hoy no existe: `app/bands` solo crea
   y borra bandas. Necesita una función `security definer` que resuelva
   mail → `user_id` y valide que quien llama es el dueño, porque el navegador no
   puede leer `auth.users` (y está bien que no pueda).

---

# 1 · Arquitectura: dos modos

La app funciona de dos formas, y la diferencia es **quién es el dueño del tiempo**.

### MODO 1 · Logic manda
```
Logic (Mac) ──BLE MIDI: clock, PC, SPP──▶ app
```
El audio sale de la Mac. La app traduce el MIDI a posición y mueve letras, cifrado
y metrónomo. Es la arquitectura original y **sigue funcionando**.

### MODO 2 · El dispositivo manda  ← el foco actual
```
celular/iPad reproduce el archivo ──▶ salida de audio (cable Y)
                                  └──▶ MIDI saliente a pedales
```
No hay Mac. El audio sale del dispositivo y **el archivo de audio es el reloj
maestro**: la posición nace de `audioCtx.currentTime`, no de una estimación.

Los dos modos conviven y **se eligen a mano** en ⚙ con el selector *Logic manda /
Yo mando*. Elegir "Yo mando" apaga el clock MIDI entrante y prende el motor de
pistas; elegir "Logic manda" hace lo inverso. Tener dos dueños del tiempo a la vez
era el error clásico y ahora es imposible por construcción. La elección queda
guardada en `localStorage` (`camarage_mode`).

---

# 2 · Lo que funciona hoy

### Reproductor de pistas
- Reproducción con transporte completo: play, pausa, stop, saltar tocando la barra.
- **Cuenta previa** configurable de 0 a 4 compases.
- **El reloj maestro es el audio.** `elapsedSec()` —la única función de la que
  dependen todas las vistas— tiene una rama que devuelve la posición del archivo.
  Las vistas no se tocaron.
- Metrónomo propio agendado sobre el reloj del audio con lookahead, sample-accurate.

### Regla fija del modo 2: el archivo pasa INTACTO
Decisión de diseño de Pato, y es importante respetarla:

> La separación de secuencias y click viene **del bounce**, no del código. Lo que
> ya está impreso en el archivo no se puede desincronizar ni se rompe por una
> configuración mal puesta. Es una decisión de seguridad contra la ley de Murphy.

La app **no** baja a mono, **no** panea, **no** toca los canales. El selector de
ruteo que existía se eliminó a propósito: era una forma de romper las cosas sin
ganar nada.

El metrónomo de la app es un **agregado opcional** (botón METRO) que suma encima
**en los dos canales**, para ensayo. En vivo va apagado y el único click es el del
archivo. El fader Click del mixer controla su nivel.

**Convención de bounce de Pato:** canal izquierdo = click + secuencias, canal
derecho = solo secuencias. Por lo tanto el cableado es:
- **Plug blanco (izq)** → in-ears
- **Plug rojo (der)** → consola / FOH

### Audios en Supabase Storage
- Bucket privado `song-audio`, rutas `<band_id>/<song_id>.<ext>`, permisos por banda.
- Solapa **Audio** en la web admin: subir, escuchar, reemplazar, borrar.
- El dispositivo **baja la pista solo** la primera vez, con barra de progreso, y la
  cachea en IndexedDB por canción. Después funciona sin internet.
- Detecta versiones nuevas comparando `audio_updated_at`; si no cambió, no rebaja.
- Los archivos cargados a mano tienen prioridad y no se pisan solos.
- Botón **⇩ Bajar todas las pistas** para dejar el teléfono listo antes del show.
- Tope de 200 MB por archivo (plan Pro), para poder subir WAV.

### Sin dependencias de CDN  ← bug grave arreglado
Tailwind y el SDK de Supabase venían de un CDN. Sin internet, **la app se quedaba
sin una sola regla de estilo** y todo aparecía apilado en una columna. Para una app
de escenario era inaceptable. Ahora los dos viajan **dentro del `index.html`**
(425 KB). Verificado con la red totalmente bloqueada.

**No regenerar el CSS a mano: correr `bash build.sh`** (§7). Si se agrega una clase
nueva en el HTML y no se recompila, la clase **no existe** en el CSS y el elemento
sale deformado sin ningún error. Ya pasó: faltaba `col-span-6` y el botón PLAY
quedó angosto.

### UX de escenario
- **Duración por canción y total del show.** Se mide sola al subir el archivo.
- **Estados en el setlist**: SONANDO / PRÓXIMA / TOCADA, más botón ↺ Show para
  limpiar las marcas.
- **Encadenado por canción** (`chain_next`): si está prendido, al terminar arranca
  la siguiente sola, sin cuenta. Para medleys. Si no, cuenta 5 s, deja la próxima
  cargada y espera el PLAY.
- **Doble toque en PAUSE y STOP.** Cortar la música de un roce delante de la gente
  era el peor accidente posible. Arrancar sigue siendo un toque solo.
  Ojo: solo confirma cuando el toque viene del músico — `loadSong()` llama
  internamente a `setStop()` y se trabaría esperando un segundo toque.

### MIDI saliente
- Tabla `midi_events`: tiempo en segundos, tipo, canal, datos, y **destino**
  (`master` o el rol de un integrante).
- **Parser propio de Standard MIDI File** en `web/lib/midi-file.ts`. Se escribió a
  mano porque las librerías populares de JS modelan el archivo como "notas" y
  **pierden los Program Change**, que son justamente los cambios de patch.
  Soporta formatos 0/1/2, running status, mapa de tempo con cambios a mitad, SMPTE.
  Validado contra archivos generados con `mido`, incluido un tema que cambia de
  120 a 60 BPM en el medio.
- Importador de `.mid` en la solapa **MIDI out** de cada canción, con vista previa
  antes de guardar.
- Disparo agendado contra el reloj del audio: **error medio 2,8 ms, peor caso 19 ms**.
  Los eventos pendientes se cancelan al pausar.

### Offset por canción
Un solo número (`offset_seconds`, décimas) que corre **todo** el contenido de la
canción contra el audio: letras, cifrado, secciones y los eventos MIDI importados.
Sirve para cuando se reemplaza un MP3 por un bounce en WAV que arranca distinto:
antes había que retocar 39 líneas a mano, ahora se toca un campo.

- Se edita en la solapa **Datos** de la web, con botones ±0,1 s.
- En la app entra por `songOffset()`, sumado dentro de `elapsedSec()`, así que
  ninguna vista tuvo que cambiar.
- Cuando hay offset distinto de cero, la vista de escenario lo muestra como
  insignia, para que nadie se pregunte por qué las letras van corridas.

### Modo "marcar tiempos" (web)
Los tiempos de las letras salieron de Whisper y varios están corridos medio
segundo. Ahora se corrigen tocando:

- Play en la web, y **ESPACIO** por cada línea que entra. Cada golpe estampa el
  tiempo de esa línea y pasa a la siguiente.
- **BACKSPACE** deshace, **P** play/pausa, **ESC** sale.
- Descuenta un **tiempo de reacción** configurable (0,15 s por defecto): uno
  siempre aprieta tarde, y sin esa corrección todas las líneas quedan atrasadas.
- Suma el offset de la canción, así que se puede marcar contra el audio real.
- Se ve la línea actual grande y las dos siguientes, para no perderse.

### Sync entre integrantes  ← el más grande de la sesión
Módulo `SYNC` en el `index.html`. Un dispositivo es **maestro** y los demás
**seguidores**; se elige en ⚙. Canal de Supabase Realtime `camarage:<band_id>`.

Cómo funciona, y por qué así:
- El maestro manda una **baliza cada 2 s**: "estoy en la posición P, y eso fue en
  el instante T de mi reloj". No manda la posición continuamente: el jitter de la
  red arruinaría todo.
- Cada seguidor corre **su propio reloj a 60 fps** a partir de esa baliza. Entre
  baliza y baliza la red no participa.
- El desfase entre relojes se mide con un ida-y-vuelta de 4 tiempos estilo NTP
  (`offset = ((t1−t0)+(t2−t3))/2`), 8 muestras, y se queda con las de **menor
  RTT** —las que menos cola de red tienen.
- Los cambios de canción, play, stop y salto mandan baliza **al instante**, sin
  esperar los 2 s.
- El seguidor entra por `elapsedSec()`, igual que todo lo demás. Sus letras,
  cifrado y metrónomo visual quedan sincronizados sin tocar ninguna vista.

Medido con dos navegadores de verdad y latencia inyectada:

| Escenario | RTT | Confianza que reporta | Desvío real medio |
|---|---|---|---|
| WiFi bueno | ~20 ms | ±3 ms | **2,7 ms** |
| 4G | ~90 ms | ±9 ms | **6,9 ms** |
| Red mala, jitter alto | ~350 ms | ±66 ms | 49,5 ms |

Y lo más importante para el escenario: **si la red se corta, el seguidor sigue
tocando bien.** Con el maestro emitiendo silencio total, a los 6 segundos el
seguidor estaba a 30-50 ms de la posición real. Además avisa: la insignia pasa a
**◈ SIN SEÑAL** en rojo y ⚙ dice "sin señal hace N s · reloj propio", en vez de
seguir mostrando "sincronizado" y mentir.

La insignia de arriba muestra `◈ MAESTRO` o `◈ ±Nms` con color: verde hasta 20 ms,
amarillo hasta 60, rojo arriba de eso.

### Bugs de escenario arreglados en esta sesión
- **La barra de pista se quedaba en "cargando…" para siempre.** Eran conexiones de
  IndexedDB que quedaban abiertas y bloqueaban el siguiente `open()`. Ahora se
  cierran siempre (`finally`), hay timeout de 6 s, un vigilante de 20 s que
  desbloquea la interfaz, y el error se muestra escrito en vez de dejar un cartel
  eterno. La descarga tiene `AbortController` con 45 s.
- **Tonalidad, compás y PC# estaban escritos a mano en la vista** (mostraba
  siempre la misma tonalidad y 4/4). Ahora salen de la canción.
- **`AVAudioSession` en el plugin Swift.** Sin esto, el interruptor de silencio del
  iPad muteaba el show entero. Categoría `.playback`, buffer de 5 ms, y manejo de
  interrupciones (llamada entrante) para volver a activar el audio al terminar.
  Aplicado en los tres `MidiPeripheralPlugin.swift` del repo, más una red de
  seguridad en `MainViewController.capacitorDidLoad()`.

### El transporte se bloquea en los seguidores
Decisión de Pato del 17 ago. Si el equipo está en rol **seguidor**, quedan grises
y sin responder **PLAY**, **STOP** y **anterior/siguiente**, en las dos vistas.
Medido: opacidad 0,35, escala de grises, sin recibir toques.

El motivo no es estético. Dejar los botones activos es una trampa: el músico toca
PLAY, no pasa nada útil, y a los 2 segundos la baliza del maestro lo devuelve a
donde estaba. En escenario eso se lee como "se colgó la app".

Tres detalles del diseño:
- **Anterior/siguiente también se bloquean**, porque la canción la elige el maestro
  y la propaga. Cambiarla en un seguidor volvía atrás sola.
- **El metrónomo NO se bloquea**: es audio local de ese equipo y no toca el tiempo
  de nadie. Sirve si el músico quiere su propio click de ensayo.
- **La barra de la pista sigue visible** pero no acepta toques: el seguidor tiene
  que poder ver por dónde va el tema, lo que no puede es saltar.

Está blindado en la lógica además del CSS: `setPlay`, `setStop`, `nextSong` y
`prevSong` verifican el rol. Ojo con uno: `loadSong()` llama internamente a
`setStop()` y eso **tiene** que seguir funcionando en el seguidor para que entre el
cambio de canción del maestro — por eso el guard de `setStop` mira solo si el toque
vino del músico (`fromUser === true`).

### Sello de versión
`APP_BUILD` se estampa con fecha y hora en cada `bash build.sh` y se muestra en ⚙.
Sirve para saber de un vistazo qué versión tiene cada teléfono sin `dumpsys`.

### Hardware resuelto
- El Samsung A56 **no saca audio analógico por USB-C**: hace falta un adaptador
  **activo con DAC**. Uno pasivo no suena.
- El cable tiene que ser **TRS a 2× TS mono** (tipo insert). Un splitter de
  auriculares (TRS a 2× TRS) duplica el estéreo y no separa nada.
- Para la consola: **DI4000** con **ground-lift levantado**, atenuación en 0 dB,
  filtro de 8 kHz apagado. Eso corta el acople por masa compartida.
- Con el USB-C ocupado por el audio no se puede cargar: para shows largos hace
  falta un hub con audio + power delivery.

---

# 3 · Estado de la base de datos

Migraciones **ya corridas** en Supabase (no repetir):

| Archivo | Qué agregó |
|---|---|
| `migration_audio.sql` | bucket `song-audio`, columnas de audio en `songs`, 4 políticas |
| `migration_pendiente.sql` | tope de 200 MB, `audio_duration_seconds`, `chain_next` |
| `migration_midi_events.sql` | tabla `midi_events` + 2 políticas |

Migración **pendiente de correr** (una sola, y sin esto el offset no se guarda):

| Archivo | Qué agrega |
|---|---|
| `migration_offset.sql` | `songs.offset_seconds numeric(6,3) not null default 0` |

**Paso a mano que puede faltar:** Dashboard → Settings → Storage →
*Upload file size limit* → 200 MB. Manda sobre el tope del bucket; si quedó en 50,
los WAV grandes van a fallar igual.

Datos de acceso: proyecto `ccytqubmroxjaiwtzsfh`, plan **Pro**.
Login de la app: `keogan3d@gmail.com`.

---

# 4 · Pendientes

### 🔴 Datos — es lo único que separa de un ensayo real
- ✅ **BPM cargados en todos los temas** (21 ago, lo hizo Pato en Supabase).
  El click ya no miente.
- **Subir los 12 audios que faltan** (uno solo está subido).
- Cargar las tonalidades faltantes (Absorber, Algo de tiempo, Lo que digo…).
- Cifrado: varias canciones tienen 0 acordes.
- **Volver a subir "Cuando despierte"**: se subió antes de que existiera la columna
  de duración, así que no la tiene.
- ✅ Los SQL de las dos canciones nuevas (§13) ya corrieron el 21 ago. Falta
  **escuchar las líneas marcadas como dudosas** y ponerles `program_change`.
- **Bouncear las pistas de escenario** de las dos canciones nuevas: los mix que
  pasó Pato no tienen click ni la separación de canales, y arrastran silencio al
  final.

### 🟣 PRODUCTO — camino a publicarla (decisión de Pato, 21 ago 2026)

Pato evaluó la competencia (Stage Traxx y las demás del análisis en
`IDEAS_STAGE_TRAXX.md`) y considera que CAMARAGE ya está mejor que lo que se
ofrece. **La intención es publicarla en Google Play como app paga.** No se
arranca todavía, pero queda como pendiente firme con el análisis hecho:

1. **Arquitectura local-first** (el paso técnico que valida todo lo demás):
   - Todo el dato vive en el celu (IndexedDB ya guarda los audios; el catálogo
     pasa de Supabase a almacenamiento local).
   - El celu maestro levanta un **servidor HTTP+WebSocket en la red wifi local**
     (plugin nativo de Capacitor): los integrantes abren el navegador y ven su
     vista de seguidor — sin cuentas, sin internet, sin builds de Xcode.
     Resuelve también el pendiente de "sync sin internet" (funciones #6).
   - La web admin servida por el mismo celu: la compu en el mismo wifi edita
     con teclado.
   - Export/import de backup (zip con JSON + audios) — imprescindible.
   - Supabase queda como opción de backup/sync en la nube (posible plan pago).
   - Escala con costo cero de servidores: cada banda es su propia isla.
2. **Multi-tenant / autoservicio**: crear banda desde la app, alta de miembros
   sin SQL manual (pantalla de Miembros), sacar credenciales y defaults
   hardcodeados del HTML, términos y política de privacidad.
3. **Trámite de Google Play**: cuenta de desarrollador (US$25 una vez), AAB
   firmado con keystore de release (NO el debug), target SDK al día, Data
   Safety, política de privacidad publicada, y **closed testing con ~12
   testers durante 14 días** (obligatorio para cuentas personales nuevas)
   antes de producción. Cobro por Google Play Billing (~15% de comisión).
   iOS aparte: Apple Developer US$99/año + App Store Review.

Primer paso sugerido cuando se retome: **prototipar el servidor local en el
APK** (maestro sirve la vista de seguidor por wifi) — le sirve a la banda ya,
con o sin Play Store.

### 🎯 Menú de mejoras propuesto (21 ago 2026) — para elegir la próxima

Ordenado por impacto, conversado con Pato al cierre de la sesión de UX:

1. **Secciones en vivo** — loopear estribillo, saltear puente, estirar outro,
   con salto cuantizado al próximo compás. `song_sections` ya existe y el
   drag-scrub de hoy es media máquina hecha. El salto de calidad más grande;
   con esto la app deja de tener comparación con Stage Traxx.
2. **Tanda de recompilación**: vista según rol (~20 líneas) + eventos MIDI que
   disparan desde el aparato del integrante. Van juntas para gastar UNA sola
   vuelta de Xcode en los dos iPads + APK.
3. **PWA de seguidor**: poner `/performer` al día + manifest + wake lock.
   Libera a los iOS del baterista de Xcode y es el primer ladrillo del camino
   a Google Play (§ PRODUCTO).
4. **Golpes baratos de escenario** (una tarde, juntos): colores por sección en
   la letra, notas por canción visibles en escenario (el campo existe, hoy
   solo en la web), sacar el tuner falso del bajista, markdown en letras.
5. **Modo ensayo** (idea nueva 21 ago): historial de tocadas, contador de
   veces por canción, y "repetir desde el último scrub" con un toque para
   ensayar la parte que salió mal.
6. **Setlist con horario de show**: hora estimada de cada tema acumulando
   duraciones, para el toque de queda del venue.
7. **La deuda de datos** (§🔴 arriba): BPM reales de las 13 viejas, 12 audios
   sin subir, bounces de escenario de las dos nuevas. Si hay ensayo cerca,
   esto va primero.

### 🟠 Funciones
1. **Vista según el rol del integrante.** Hoy `state.role` está fijo en
   `'singer'` y cada uno elige su vista a mano en la barra de abajo. Leyendo el rol
   de `band_members` al entrar, cada uno abre la suya. Es la puerta de entrada al
   punto siguiente. Son unas 20 líneas, pero **entra recién con una vuelta de
   recompilación** (los dos iPads en Xcode + APK del Samsung), así que conviene
   juntarlo con otros cambios y hacer una sola tanda. Pato lo dejó pendiente a
   propósito el 17 ago por ese motivo.
   Mientras tanto, Gonzalo abre la app y toca el ícono de batería en la barra de
   abajo — funciona igual, solo que no es automático.
2. **Que los eventos MIDI con destino de un integrante disparen desde SU
   dispositivo** (el pedal está a sus pies, no al lado del maestro). Depende del
   punto 1: hasta que el rol no venga de la base, el sistema no distingue quién es
   quién.
3. **Pantalla de Miembros en la web admin**, para no depender de correr SQL cada
   vez que entra alguien. Necesita una función `security definer` que resuelva
   mail → `user_id` validando que quien llama es el dueño de la banda.
4. **Vista de seguidor por PWA**, para que un integrante entre desde el navegador
   sin instalar nada.
5. **Arranque agendado**: el maestro dice "arrancamos en T+300 ms" en vez de
   "arrancá ahora", para que todos empiecen en el mismo instante. Hoy el que
   arranca es el maestro y los demás lo alcanzan en la primera baliza.
6. **Sync sin internet: el maestro como servidor** en la red local. Hoy las
   balizas pasan por Supabase, así que sin internet el sync no se puede
   establecer (una vez establecido, sí sobrevive a la caída). El hotspot con datos
   móviles lo tapa por ahora. **Hacerlo solo si el hotspot no alcanza**: el código
   son un par de días y hay que probarlo con aparatos en la mano, no se puede
   verificar solo. Análisis completo en la conversación del 17 ago.
7. **Secciones con salto en vivo** (loopear el estribillo, saltear el puente). La
   tabla `song_sections` ya existe. Es el salto de calidad más grande pendiente.
8. Botones de navegación para el bajista, autoscroll a velocidad constante,
   colores por sección, notas visibles en escenario, historial de tocadas,
   transposición de acordes, letras en markdown, buscador en la biblioteca,
   fuentes embebidas y layout propio para el iPad mini. Detalle en
   `IDEAS_STAGE_TRAXX.md`.

### 🔵 iOS / iPad
> Inventario completo de los equipos de la banda y qué falta en cada uno: **§12**.

- ✅ **Los dos iPads ya están compilados y andando** (17 ago). El fix de
  `AVAudioSession` está confirmado en el aparato real.
- **Averiguar si la cuenta de Apple es gratuita o paga.** Xcode → Settings →
  Accounts. Si es gratuita, la app instalada por cable **caduca a los 7 días** y
  hay que volver a enchufar cada iPad. Eso convertiría la vista de seguidor por
  navegador en la única forma sana de que la banda la use.
- **Verificar cómo se lee la letra en el mini de 8,3"** a la distancia real de la
  baterista. Si queda chica, layout propio.
- Backup del proyecto de Logic y de los Controller Assignments.

---

## Cambios sesión 21 ago 2026 · UX de escenario (probada en los 3 tamaños)

Se levantó `index.html` en Chromium a las medidas reales del iPad Pro 12,9"
(1366×1024), el iPad mini 6 (1133×744) y el Samsung A56 (412×915), con capturas
de las tres vistas. Tres arreglos, todos CSS/HTML sin JS nuevo, sello
`20260821-1605`, copiados a `camarage-android/www/` y a `ios/App/App/public/`:

1. **🔴 El disco del baterista se rompía en el iPad mini.** Era de 288px FIJOS
   (`w-72 h-72`): en pantallas bajas se desbordaba del contenedor, el número del
   beat quedaba recortado y el selector de subdivisión lo pisaba — y justo el
   mini es la pantalla de la baterista. Ahora el disco mide `height:86%` de lo
   que realmente queda (tope 30rem) y el número escala con el disco vía
   container queries (`40cqmin`, con fallback a los tamaños viejos si el
   navegador no soporta `cqmin`). De paso, en el iPad Pro el disco pasó de
   288px flotando en un lienzo enorme a ~600px.
2. **La letra del cantante y el cifrado del bajista eran de tamaño FIJO.**
   `2.25rem`/`3.75rem` con `!important`, que además mataba las clases
   responsive `sm:`/`md:` del HTML (estaban muertas). Ahora escalan con la
   pantalla: `clamp(1.75rem, 6.5vmin, 4.25rem)` la letra y
   `clamp(2.75rem, 8.5vmin, 5.5rem)` el cifrado. En los iPads la letra se lee
   de lejos de verdad; en el Samsung queda casi igual que antes. Los botones
   A−/A+ (`--lyric-scale`) siguen funcionando encima de esto.
3. **El count-in de 160px fijos** ahora es `min(160px, 38vmin)`, y en pantallas
   de menos de 850px de alto el chrome del baterista se compacta (BPM y botones
   más chicos) para devolverle altura al disco.

4. **El mini-mixer del baterista quedó reducido a un solo fader** (pedido de
   Pato, misma sesión, sello `20260821-1623`): se sacaron los sliders SEQS y
   BANDA — eran controles MIDI remotos (CC7 canal 2 y 3) hacia buses de Logic
   que nunca se configuraron; en el modo 2 no tienen a quién hablarle y en
   escenario eran controles falsos. Queda solo **Volumen del click**, grande:
   perilla de 40px, riel con relleno amarillo, valor en 2xl. El JS no se tocó
   (itera `.mixer-channel` y el CC entrante hace null-check), y el click sigue
   mandando CC7 canal 1 al DAW cuando hay conexión, útil en modo 1. Si algún
   día se configuran los buses en Logic, los sliders viejos están en el
   historial de git (commit dd8520b y anteriores).

**Pendiente que apareció en la revisión (no se tocó):**
- **El tuner del bajista es un MOCK** — la aguja se mueve sola, no mide nada.
  En un escenario una aguja falsa es peor que no tener tuner. Decidir: o se
  conecta a audio real (Web Audio puede), o se esconde detrás de un tag DEMO,
  o se saca. También tiene un detalle visual: el "+0¢" pisa el "+50¢".
- La tarjeta "Root actual" del bajista en iPad Pro es 2/3 del ancho para
  mostrar una letra — le sobra muchísimo espacio. Candidata a rediseño cuando
  se haga el layout propio de iPad.
- Los APK y los iPads siguen con el HTML del 17 ago: estos arreglos entran
  recién con la próxima tanda de recompilación (juntar con la vista por rol).

---

# 5 · Lo que quedó OBSOLETO — no perder tiempo acá

Esto era la lista de pendientes de junio y **ya no aplica**, porque al pasar el
dispositivo a reproductor el problema desapareció por diseño:

- ❌ **El desfase de SPP.** Era el bloqueante número uno. Ya no existe: la posición
  sale del archivo de audio, que siempre arranca en cero.
- ❌ **Las tres preguntas sobre cómo estaba armado Logic** (proyecto único o uno por
  canción, PC automático, etc.). Sin efecto.
- ❌ **El flapping de BLE como bloqueante.** El show ya no depende de una conexión
  Bluetooth viva.
- ❌ **MPK → Mac pasando por el celular.** Confirmado imposible en junio: macOS
  recibe los mensajes pero no los entrega a CoreMIDI cuando es periférico y un
  central Android le escribe. No se arregla desde la app. La salida es un WIDI Bud
  Pro, si alguna vez se quiere el MPK inalámbrico al MainStage.

---

# 6 · Decisiones tomadas que no conviene revisar

- **El archivo de audio pasa intacto** (§2). Es una decisión de seguridad.
- **El baterista toca contra el click en sus in-ears, no contra la pantalla.** La
  sincronización con destellos visuales es marcadamente peor que con clicks
  auditivos, y la pantalla del dispositivo agrega 30-60 ms sola. El metrónomo
  visual es referencia de posición, no fuente de tempo.
- **MP3 320 antes que WAV** para las pistas: por in-ears no se distingue y baja
  cuatro veces más rápido al teléfono. El tope de 200 MB está por si igual se
  quieren WAV.
- **El sync entre integrantes va con disciplina de reloj**, no transmitiendo la
  posición.

---

# 7 · Compilar

**Primero, siempre:**
```bash
bash build.sh
```
Recompila el CSS de Tailwind escaneando el `index.html`, lo re-inyecta entre los
marcadores `TW_START` / `TW_END`, estampa la fecha y hora en `APP_BUILD` y copia el
resultado a `camarage-android/www/`. Saltear este paso rompe el estilo de cualquier
clase nueva, sin dar ningún error.

**APK de Android** (se compiló en la nube durante esta sesión; en la Mac de Pato):
```bash
bash build.sh
cd camarage-android
npm install
npx cap copy android
cd android && echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties
./gradlew assembleDebug
```
`npx cap copy android` no es opcional: sin eso Gradle compila el HTML viejo que
quedó en `android/app/src/main/assets/public/` y el APK sale idéntico al anterior.

Instalar sin perder datos: `adb install -r CAMARAGE-sync-debug.apk`

**Web admin:** `git push` y Vercel despliega solo.

### Archivos clave
| Archivo | Qué es |
|---|---|
| `build.sh` | **Correr siempre antes de compilar.** Tailwind + sello de versión + copia a www |
| `index.html` | La app entera. `TRACKS` = motor de pistas, `SYNC` = balizas entre integrantes, `elapsedSec()` = el reloj |
| `camarage-android/www/index.html` | Copia idéntica, es la que se compila |
| `web/lib/midi-file.ts` | Parser de Standard MIDI File |
| `web/app/songs/[id]/page.tsx` | Editor de canción: Datos, Letras, Cues, Cifrado, Audio, MIDI out |
| `PLAN_AUDIO_PISTAS.md` | Diseño del reproductor + el fix de `AVAudioSession` |
| `ANALISIS_LATENCIA_SYNC.md` | Diseño del sync entre integrantes, con números |
| `IDEAS_STAGE_TRAXX.md` | Qué copiarle a Stage Traxx 4, ordenado por valor/esfuerzo |
| `agregar_integrante.sql` | Dar de alta a un integrante en la banda con su rol |
| `insert_la_nueva_sangre.sql` | Canción + secciones + letra con tiempos (§13) |
| `insert_camine_sin_mirar_atras.sql` | Ídem (§13) |

---

# 8 · Notas operativas (cosas que hicieron perder tiempo)

### El APK SÍ se puede compilar en la nube
El archivo histórico dice que no se puede por falta de espacio. **Eso quedó
desactualizado**: en la sesión del 17 ago se compiló entero en el contenedor de
Cowork. La receta, si hace falta repetirla:

```bash
# JDK 17 (Gradle 8.2 no corre sobre JDK 21)
curl -sL -o jdk17.tar.gz "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
mkdir -p /opt/jdk17 && tar xzf jdk17.tar.gz -C /opt/jdk17 --strip-components=1

# SDK de Android
curl -sL -o cmdtools.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
# descomprimir en /opt/android-sdk/cmdline-tools/latest, aceptar licencias, y:
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"

export JAVA_HOME=/opt/jdk17 ANDROID_HOME=/opt/android-sdk
# NO borrar JAVA_TOOL_OPTIONS: trae el truststore del proxy y sin eso Gradle
# no puede bajar nada (falla con "PKIX path building failed")
```

**Ojo importante:** el código nativo (`MidiPeripheralPlugin.java`, el
`MainActivity.java` con keep-screen-on) estuvo mucho tiempo **sin commitear**. Si
se compila clonando desde GitHub sin verificar, sale un APK **sin el plugin MIDI**.
Verificar siempre que esos archivos estén en el árbol antes de compilar.

### Un APK compilado en otra máquina tiene otra firma
El debug keystore es distinto por máquina, así que Android **rechaza instalar
encima**. Hay que desinstalar primero — y **eso borra el localStorage**: se pierde
la sesión de Supabase, la caché de canciones y **los audios cacheados en IndexedDB**.
Después hay que re-loguear, sincronizar y volver a bajar las pistas.

Los APK compilados en la misma máquina se instalan con `adb install -r` sin perder
nada. Conviene compilar siempre desde el mismo lugar.

### adb con el Samsung
`adb` **no está en el PATH** de Pato. Vive en
`~/Library/Android/sdk/platform-tools/adb`. Se arregla una vez:
```bash
echo 'export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"' >> ~/.zshrc
source ~/.zshrc
```
Su teléfono es el serial `R5CY34PMCRW`.

Si `adb devices` dice `unauthorized`, en orden:
1. Desbloquear el teléfono y aceptar el cartel (no aparece con la pantalla bloqueada).
2. Ajustes → Seguridad y privacidad → **Bloqueador automático** desactivado (bloquea
   las conexiones USB de datos y es la causa número uno).
3. Opciones de desarrollador → **Revocar autorizaciones de depuración USB**.
4. En la Mac: `adb kill-server && rm -f ~/.android/adbkey*` para forzar un cartel nuevo.

### El sello de versión está en UTC, no en hora argentina
`build.sh` corre en el contenedor de Cowork, que tiene el reloj en **UTC**: 3 horas
adelantado. El sello `20260817-1418` es "las 11:18 de Buenos Aires". No es un build
del futuro. Para cruzarlo con la instalación:
```bash
adb shell dumpsys package com.camarage.live | grep -E "versionName|lastUpdateTime"
```
`lastUpdateTime` sí está en hora local del teléfono. `versionName` siempre dice
`1.0` —está fijo en el `build.gradle`— así que **no sirve** para saber qué versión
hay; el dato bueno es el sello que muestra ⚙ (recuadro **VERSIÓN**, arriba del
panel).

### Gradle compila el HTML viejo si no se copia
`./gradlew assembleDebug` **no mira `www/`**: compila lo que está en
`android/app/src/main/assets/public/`. Si se edita el `index.html` y no se corre
`npx cap copy android`, el APK sale **idéntico al anterior** y sin ningún error.
Pasó en esta sesión: Gradle dijo que compiló bien y el APK tenía el HTML de la
madrugada. Verificar así:
```bash
unzip -p app/build/outputs/apk/debug/app-debug.apk assets/public/index.html | grep -o "APP_BUILD = '[^']*'"
```

### El puente de Cowork deja un `.git/index.lock` que no puede borrar
Cualquier comando de git corrido desde el sandbox de Claude sobre la carpeta montada
deja un `index.lock` huérfano —el puente no tiene permiso de borrar archivos— y eso
**bloquea los commits siguientes**. Si git se queja: `rm -f .git/index.lock`.
Conclusión práctica: **los commits los hace Pato desde su terminal**, no Claude.

### La terminal de Pato no acepta comentarios
Su zsh tiene `interactive_comments` desactivado: **cualquier bloque de comandos con
líneas que empiezan con `#` falla** con `parse error`. Pasarle comandos sin
comentarios. Se arregla de raíz con:
```bash
echo 'setopt interactive_comments' >> ~/.zshrc
```

---

# 9 · De dónde salen los tiempos de las letras (importante)

Las letras **no** se cronometraron a mano: salieron de **transcribir los MP3 con
Whisper**, y cada línea tiene el segundo exacto en que suena *dentro de ese archivo*.
Se ve en los `insert_*_lyrics.sql` del repo — por ejemplo la primera línea de
"Cuando despierte" entra a los 30,000 s porque el tema tiene 30 segundos de intro.

**La consecuencia práctica:** los tiempos están atados a esos MP3 puntuales. Si se
re-bouncean los temas y el nuevo archivo arranca en otro punto —aunque sea medio
segundo— **se desincronizan todas las letras de ese tema**.

Por eso el offset por canción (§2) importa más de lo que parece: convierte un
re-bounce corrido en un solo número a ajustar, en vez de retocar 39 líneas a mano.
Y para arreglar los tiempos que Whisper dejó corridos, está el modo **marcar
tiempos** de la web (§2): play y una tecla por línea.

**Regla al bouncear:** siempre desde el primer sonido del tema, sin silencio ni
cuenta de baqueta adelante, y siempre igual.

---

# 10 · Llevar el MIDI de efectos de Logic a la app

Procedimiento:

1. En Logic, seleccionar la región MIDI de efectos de la canción.
2. `Archivo → Exportar → Selección como archivo MIDI` (o arrastrar la región al Finder).
3. Web admin → la canción → solapa **MIDI out** → subir el `.mid`.
4. Antes de guardar muestra la lista de eventos con su tiempo: **revisar el tiempo
   del primer evento**. Si arranca cerca de 0:00, la región estaba bien puesta en el
   compás 1. Si aparece en 2:30, hay que moverla al compás 1 y exportar de nuevo.
5. Elegir el destino: `master` (lo dispara quien reproduce, precisión de ms) o el rol
   de un integrante (lo dispara su dispositivo, al equipo que tiene al lado).

Vale la misma regla del punto cero que las letras: el `.mid` tiene que estar referido
al mismo instante que el bounce de audio.

---

# 11 · Credenciales

- Supabase: proyecto `ccytqubmroxjaiwtzsfh`, plan **Pro**. La anon key está
  hardcodeada en `index.html` y en las env vars de Vercel.
- Login de la app: `keogan3d@gmail.com`. **La contraseña se cambió el 17 ago 2026.**
  No queda escrita acá a propósito. Para cambiarla de nuevo, SQL Editor de Supabase:
  ```sql
  update auth.users
  set encrypted_password = crypt('LA_NUEVA', gen_salt('bf'))
  where email = 'keogan3d@gmail.com';
  ```
  Las contraseñas se guardan hasheadas: no se pueden leer desde el dashboard ni
  desde ningún lado.
- GitHub: `https://github.com/Barton-user/camarage`, branch `main`.
- Vercel: proyecto `camarage`, root directory `web`.


---

# 12 · Dispositivos de la banda — pendiente de resolver

Inventario real y qué hace falta para cada uno.

| Dispositivo | De quién | Puerto | Rol previsto |
|---|---|---|---|
| Samsung A56 (Android) | Pato | USB-C | **Master** — funcionando hoy |
| iPad Pro 12,9" 3ra gen (2018, A12X, iPadOS 26.3) | Pato | **USB-C** | Master en escenario (pantalla grande) |
| iPhone 12 | Baterista | **Lightning** | Seguidor (solo pantalla) |
| iPad mini 6 | Baterista | **USB-C** | Seguidor (solo pantalla) |

> **Corrección de dato:** el iPad Pro figura como "2017" en conversación, pero el
> modelo anotado es `MTEL2TY/A` = **3ra generación, 2018**, y corre iPadOS 26.3, que
> el de 2017 (2da gen, Lightning) no soporta. Es **USB-C**, así que le sirve el mismo
> adaptador con DAC y el mismo cable Y ya validados con el Samsung. No comprar
> adaptadores Lightning para este equipo.

---

## 12.1 · El problema real: cómo instalar la app en los iOS de otros

Hoy la app se instala en iOS compilando con Xcode y **Apple ID gratuito**. Eso trae
dos límites que hacen esto inviable para una banda:

- El build **caduca a los 7 días** y hay que re-firmar.
- Solo instala en dispositivos **enchufados a la Mac de Pato** por cable.

Es decir: cada semana habría que juntarse con el baterista y enchufar sus dos
equipos. No es una opción.

### Salida recomendada: separar master de seguidores

**Los seguidores no necesitan la app nativa.** Un seguidor solo mira la pantalla —
letra, cifrado, metrónomo visual — y para eso alcanza el navegador:

- Reproducción de audio: **no la necesita** (el audio sale del master).
- Bluetooth MIDI: **no lo necesita** (solo el master le habla al hardware).
- Todo lo demás —letras, cifrado, sincronización, caché offline— es Web Audio,
  IndexedDB y Supabase: **funciona en Safari sin nada nativo**.

Entonces: los seguidores abren la web, la agregan a la pantalla de inicio y listo.
Sin Xcode, sin firmas, sin caducidad, sin cables.

El **master sí** necesita el build nativo, porque es el único que usa BLE MIDI para
los pedales y necesita el arreglo de `AVAudioSession`.

### Tareas concretas

1. **Servir una vista de seguidor en la web** (`camarage.vercel.app/performer` ya
   existe como página, hay que ponerla al día con la app actual).
2. **Hacerla instalable como PWA**: manifest, ícono, pantalla completa. En iOS se
   agrega desde Compartir → "Añadir a pantalla de inicio".
3. **Mantener la pantalla encendida en Safari**: la Screen Wake Lock API existe en
   Safari moderno; verificar que agarre en iOS. Si no, el recurso viejo es un video
   invisible en loop.
4. **Login por integrante**: hoy hay un solo usuario. Depende de las invitaciones
   por mail (§4).
5. **Verificar el metrónomo visual en el iPad mini 6** — 8,3" es chico; puede que
   convenga un layout más grande para el baterista.

### Si en algún momento hace falta la app nativa en los equipos del baterista
La única salida sana es el **Apple Developer Program pago (99 USD/año)**, que
habilita **TestFlight**: se distribuye por mail, sin cables, y los builds duran un
año. Solo vale la pena si el baterista necesita algo que el navegador no puede
hacer — hoy, nada.

---

## 12.2 · Pendientes por dispositivo

### iPad Pro 12,9" (Pato) — candidato a master en escenario
- [x] **`AVAudioSession` en el plugin Swift** — ya está aplicado en el código
      (categoría `.playback`, buffer de 5 ms, manejo de interrupciones).
- [ ] **Recompilar en Xcode** — es lo único que falta, y es el próximo paso de la
      sesión (§0). El `index.html` nuevo ya está copiado en
      `ios/App/App/public/`, así que no hace falta `npx cap copy ios`; solo abrir
      `ios/App/App.xcworkspace`, elegir el iPad y ⌘R. Hasta que no se compile, el
      fix de `AVAudioSession` no tiene ningún efecto en el iPad.
- [ ] Probar el circuito de audio completo: adaptador USB-C con DAC + cable Y + DI4000.
      Debería comportarse igual que el Samsung, pero hay que confirmarlo.
- [ ] Verificar la reproducción de WAV: decodificado en RAM, un tema de 5 min ocupa
      ~105 MB. Con 4 GB y una canción por vez debería andar; si la app se cierra al
      cambiar de tema, es esto.
- [ ] Decidir **quién es el master en vivo**: el Samsung (ya probado) o el iPad
      (pantalla mucho mejor para letras). Probar los dos en un ensayo.
- [ ] Recordar el gotcha del Apple ID gratis: el *trust* del perfil se resetea seguido
      (Ajustes → General → VPN y gestión de dispositivos → tocar el perfil → Trust).

### iPhone 12 (baterista) — seguidor
- [ ] Probar la vista de seguidor en Safari.
- [ ] **No necesita adaptador de audio** mientras sea solo pantalla. Si algún día
      tuviera que sacar audio, es **Lightning**, no USB-C: adaptador distinto.

### iPad mini 6 (baterista) — seguidor
- [ ] Probar la vista de seguidor en Safari.
- [ ] Evaluar el tamaño del metrónomo visual y de la letra en 8,3".
- [ ] USB-C, por si alguna vez necesita audio.

### Todos los iOS
- [ ] Ojo con la carga: en los equipos sin jack, el puerto único queda ocupado por el
      audio. Para shows largos, hub USB-C con audio + power delivery (no aplica al
      iPhone 12, que no saca audio).

---

## 12.3 · Orden sugerido

1. **Recompilar el iPad** con el código actual —ahí entra el fix de
   `AVAudioSession`, que ya está escrito— y probar el reproductor.
2. **Decidir el master** entre Samsung e iPad, con un ensayo real.
3. **Vista de seguidor como PWA**: ahora sí tiene sentido, porque el sync entre
   integrantes ya funciona (§2) y hay algo a qué seguir.


---
---

# 13 · Canciones analizadas desde el audio (17 ago 2026)

Dos temas nuevos, procesados con el mismo método: separación de voz con **Demucs**
y transcripción con **Whisper large-v3** sobre la voz aislada, con marcas por
palabra. Sobre el mix crudo la transcripción sale inservible; con la voz aislada
queda legible. El tempo NO se estimó con el detector automático de librosa —que en
una de las dos se equivocó— sino probando una rejilla de clicks contra los golpes
del instrumental y quedándose con el mejor puntaje.

| | La nueva sangre | Caminé sin mirar atrás |
|---|---|---|
| Archivo | `CARNE 2026.mp3` | `camine sin mirar atras 18 julio.mp3` |
| Tempo | **135,00** BPM | **125,00** BPM |
| Puntaje vs vecinos | 1,138 contra 0,10-0,15 | 1,388 contra 0,098-0,128 |
| Primer golpe | 0,090 s | 0,084 s |
| Compás | 4/4 (1,7778 s) | 4/4 (1,92 s) |
| Tonalidad | Sol# menor (0,788) | Sol menor (0,896) |
| Suena hasta | 3:35,7 | 4:22,4 |
| Silencio de cola | **62,4 s** | 14,3 s |
| Entra la voz | 0:24,5 | 0:46,2 (compás 25 justo) |
| Líneas / secciones | 24 / 9 | 45 / 10 |
| SQL | `insert_la_nueva_sangre.sql` | `insert_camine_sin_mirar_atras.sql` |

Tres cosas aprendidas que sirven para las próximas:

**El detector de tempo automático se equivoca.** En La nueva sangre dio 136 y el
verdadero es 135. La rejilla de clicks no deja lugar a dudas: el candidato correcto
saca diez veces el puntaje de sus vecinos.

**Cuidado con la mitad del tempo.** En Caminé, el candidato más fuerte en bruto fue
62,5 BPM, que es la mitad de 125, porque el golpe fuerte cae cada dos tiempos. El
click va al valor musical (125), no al que puntúa más alto.

**Que la rejilla cierre es la mejor validación.** En Caminé las 10 secciones encajan
sin huecos y la última termina a 0,7 s del final real del audio. Cuando eso pasa, el
tempo está bien.

**Ninguno de los dos MP3 sirve como pista de escenario**: son mix estéreo normales
(correlación L/R de 0,68 y 0,435), sin click detectable y sin la separación de
canales. Hay que bouncear la versión de escenario. Los tiempos de la letra no se
pierden: si el bounce arranca en otro punto se corrige con el offset.

Los `.md` con la letra en tabla y las líneas dudosas marcadas están en
`LA_NUEVA_SANGRE_letra.md` y `CAMINE_SIN_MIRAR_ATRAS_letra.md`.

### Receta, si hace falta repetirla

```bash
pip install --break-system-packages faster-whisper librosa demucs
pip install --break-system-packages torch --index-url https://download.pytorch.org/whl/cpu
python3 -m demucs --two-stems=vocals -n htdemucs -o sep tema.wav
```
Después Whisper large-v3 sobre `sep/htdemucs/tema/vocals.wav`, en int8, con
`vad_filter=False` (el VAD borra el canto), `condition_on_previous_text=False` y
**sin** `initial_prompt` — el prompt se filtra a la salida como si fuera letra.
Para los tramos que salen mal, transcribir ventanas cortas de a 20-30 s.

Truco para saber si un tramo tiene voz de verdad o es filtración de un
instrumento: medir *voicedness* con `librosa.pyin`. Canto real da 0,3-0,6 con
dispersión de altura de 200-300 cents; la filtración da 0,12 con 1200 cents.

---

# ══════════ ARCHIVO HISTÓRICO ══════════

> Todo lo que sigue es de junio 2026 y describe la arquitectura vieja, cuando Logic
> era el maestro y el celular un seguidor. **No es un plan de trabajo.** Se conserva
> porque documenta caminos ya agotados —sobre todo la saga del BLE en Android y el
> límite de macOS— y evita repetirlos.

---

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
