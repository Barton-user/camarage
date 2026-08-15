# Info.plist — claves a agregar (iOS)

Estas claves van en `ios/App/App/Info.plist` (se genera con `npx cap add ios`).
En Xcode: abrir Info.plist → click derecho → "Add Row", o pegar el XML de abajo
dentro del `<dict>` raíz.

## 1. Permisos de Bluetooth (OBLIGATORIO — sin esto la app crashea al pedir BLE)

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>CAMARAGE usa Bluetooth para conectarse al WIDI del instrumento y a la Mac (Logic/MainStage) por MIDI inalámbrico.</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>CAMARAGE anuncia el iPad como dispositivo MIDI para que la Mac (Logic/MainStage) se conecte.</string>
```

## 2. Background mode de audio (recomendado para escenario)

Mantiene CoreMIDI/BLE vivos con la pantalla bloqueada o la app en segundo plano.
En Xcode también se puede activar en: Target App → Signing & Capabilities →
"+ Capability" → Background Modes → tildar **Audio, AirPlay, and Picture in Picture**.

Equivalente en Info.plist:

```xml
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
</array>
```

## 3. (Opcional) Evitar que la pantalla se apague en escenario

No es Info.plist; se resuelve en JS o nativo. Lo más simple: en `index.html`,
al entrar en modo escenario, usar la API de wake lock cuando exista. Si hace
falta a nivel nativo, agregar en el AppDelegate:
`UIApplication.shared.isIdleTimerDisabled = true`.

---

## Notas
- `NSBluetoothAlwaysUsageDescription` es la clave moderna (iOS 13+). Incluir
  también `NSBluetoothPeripheralUsageDescription` por compatibilidad.
- No hace falta pedir permiso de ubicación (eso era cosa de Android).
