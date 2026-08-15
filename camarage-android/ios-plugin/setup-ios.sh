#!/usr/bin/env bash
# CAMARAGE · setup iOS (correr EN LA MAC)
# Automatiza: instalar deps, agregar plataforma iOS, sincronizar www, y copiar
# el plugin Swift al lugar correcto del proyecto Xcode generado.
#
# Uso:
#   cd camarage-android
#   bash ios-plugin/setup-ios.sh
# Después: abrir Xcode con `npm run ios:open` y seguir RUNBOOK_iOS.md (signing,
# Info.plist, agregar los 2 archivos al target, Run).

set -e
cd "$(dirname "$0")/.."   # → carpeta camarage-android

echo "==> 1/5  Sincronizando la app web (../index.html → www/)"
cp ../index.html www/index.html

echo "==> 2/5  Instalando dependencias npm"
npm install

echo "==> 3/5  Agregando plataforma iOS (si no existe)"
if [ ! -d "ios" ]; then
  npx cap add ios
else
  echo "    ios/ ya existe, salto cap add."
fi

echo "==> 4/5  cap sync ios"
npx cap sync ios

echo "==> 5/5  Copiando el plugin Swift al proyecto"
DEST="ios/App/App"
if [ -d "$DEST" ]; then
  cp ios-plugin/MidiPeripheralPlugin.swift "$DEST/"
  cp ios-plugin/MidiPeripheralPlugin.m     "$DEST/"
  echo "    Copiados a $DEST/"
  echo "    ⚠ IMPORTANTE: en Xcode tenés que AGREGARLOS al target App"
  echo "      (arrastrarlos al grupo App, o File ▸ Add Files), si no, no compilan."
else
  echo "    No encuentro $DEST (¿falló cap add ios?). Copialos a mano."
fi

cat <<'EOF'

------------------------------------------------------------------
Listo el setup de consola. Ahora EN XCODE (ver RUNBOOK_iOS.md):
  1. npm run ios:open
  2. Agregar MidiPeripheralPlugin.swift y .m al target App (Compile Sources).
  3. Info.plist: claves de Bluetooth (ios-plugin/Info.plist-additions.md).
  4. Signing & Capabilities: tu Apple ID + Background Modes ▸ Audio.
  5. Elegir el iPad y Run (⌘R).
------------------------------------------------------------------
EOF
