# CAMARAGE Android — Wrapper Capacitor

App de sincronización de banda en vivo, empaquetada como APK Android con
soporte real de BLE MIDI vía plugin nativo de Capacitor.

## Cómo compilar el APK en tu Mac

### Opción A · Android Studio (más fácil, recomendado)

1. Instalá [Android Studio](https://developer.android.com/studio) (gratis,
   ~1.2 GB). Abrilo y dejá que descargue el SDK por defecto cuando te pida.
2. En esta carpeta, instalá las dependencias Node (una sola vez):
   ```bash
   npm install
   npx cap sync android
   ```
3. Abrí Android Studio → **File → Open** → seleccioná la carpeta `android/`.
4. Esperá a que Gradle termine el indexing (1–3 min la primera vez).
5. Conectá el Samsung A56 por USB con **Depuración USB activada**
   (Ajustes → Acerca del teléfono → tocá 7 veces "Número de compilación" →
   Opciones de desarrollador → USB debugging ON).
6. Apretá el botón **▶ Run** (verde, arriba). Android Studio compila el APK,
   lo firma con tu keystore debug y lo instala en el A56 directo.

### Opción B · Solo línea de comandos

Necesitás JDK 17 + Android SDK + Gradle. Si ya tenés Android Studio,
ambos vienen instalados. Desde esta carpeta:

```bash
npm install
npx cap sync android
cd android
./gradlew assembleDebug
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.
Lo instalás con `adb install` o lo mandás al celular y lo abrís.

## Cómo probar la sync con Logic Pro

1. En tu Mac, abrí **Audio MIDI Setup** → ventana **MIDI Studio** →
   **Bluetooth**. Tocá "Anunciar". El Mac queda visible vía BLE MIDI.
2. En Logic, abrí preferencias → MIDI → asegurate de que esté recibiendo
   y enviando MIDI Clock al puerto BLE MIDI.
3. En el A56, abrí la app CAMARAGE → tocá un rol → en la pantalla de
   pairing tocá un dispositivo. Te va a salir el dialog nativo de Android
   pidiendo permiso de Bluetooth — aceptá.
4. Seleccioná tu Mac de la lista. Conexión establecida.
5. En Logic, cargá un proyecto que envíe **Program Change** al iniciar
   (configurable en Track → Track Headers → MIDI). El PC# tiene que
   coincidir con el `programChange` de una canción en tu setlist.
6. Apretá Play en Logic. La app debería:
   - Cargar la canción automáticamente (PC)
   - Arrancar el transporte (Start)
   - Hacer scroll de letras y avanzar el cifrado en sync (Clock)
   - Detenerse al apretar Stop en Logic

## Cambiar el ícono o el nombre de la app

- Ícono: reemplazá los `.png` en `android/app/src/main/res/mipmap-*/`
- Nombre: `android/app/src/main/res/values/strings.xml` → `app_name`

## Actualizar el código web

Editá `www/index.html` y corré `npx cap sync android` para que se copie
a los assets del APK. Después rebuildeás.
