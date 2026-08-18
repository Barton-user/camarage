#!/usr/bin/env bash
# =============================================================================
# CAMARAGE · build de la app web (index.html)
# -----------------------------------------------------------------------------
# Hace dos cosas que si se olvidan rompen la app de formas confusas:
#
#   1. REGENERA el CSS de Tailwind escaneando index.html y lo re-inyecta entre
#      los marcadores TW_START / TW_END. Sin esto, cualquier clase nueva que
#      agregues en el HTML simplemente NO EXISTE en el CSS y el elemento sale
#      deformado. Ya pasó: col-span-6 faltaba y el botón PLAY quedó angosto.
#
#   2. ESTAMPA la fecha y hora en APP_BUILD, que se muestra en el modal de ⚙.
#      Sirve para saber qué versión tiene cada teléfono sin consultar dumpsys.
#
# Después copia el resultado a camarage-android/www/ para que lo tome el APK.
#
# Uso:  bash build.sh
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f index.html ]; then echo "✗ no encuentro index.html"; exit 1; fi

# --- 1 · Tailwind ------------------------------------------------------------
if [ ! -f tailwind.config.js ]; then
  cat > tailwind.config.js <<'EOF'
module.exports = { content: ['./index.html'], theme: { extend: {} }, plugins: [] }
EOF
fi
if [ ! -f tw-input.css ]; then
  printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > tw-input.css
fi

echo "▸ compilando Tailwind sobre index.html…"
npx tailwindcss -c tailwind.config.js -i tw-input.css -o tw.css --minify >/dev/null 2>&1
echo "  CSS generado: $(wc -c < tw.css) bytes"

# --- 2 · Inyectar el CSS y estampar la versión -------------------------------
STAMP="$(date +%Y%m%d-%H%M)"
python3 - "$STAMP" <<'PY'
import sys, re
stamp = sys.argv[1]
html = open('index.html', encoding='utf-8').read()
css  = open('tw.css',     encoding='utf-8').read()

ini, fin = '<!--TW_START-->', '<!--TW_END-->'
if ini not in html or fin not in html:
    raise SystemExit('✗ faltan los marcadores TW_START / TW_END en index.html')
a = html.index(ini) + len(ini)
b = html.index(fin)
html = html[:a] + '\n  <style>' + css + '</style>\n  ' + html[b:]

# Sello de versión: reemplaza el placeholder o un sello anterior
html = re.sub(r"const APP_BUILD = '[^']*';",
              "const APP_BUILD = '%s';" % stamp, html, count=1)

open('index.html', 'w', encoding='utf-8').write(html)
print('  sello de versión: ' + stamp)
print('  index.html: %d KB' % (len(html)/1024))
PY

# --- 3 · Copiar a la carpeta que compila el APK ------------------------------
if [ -d camarage-android/www ]; then
  cp index.html camarage-android/www/index.html
  echo "▸ copiado a camarage-android/www/index.html"
fi

echo "✓ listo"
