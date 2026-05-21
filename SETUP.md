# CAMARAGE · Setup completo

Tres pasos para tener todo el sistema andando: Supabase + Web admin en Vercel +
APK Android conectado.

## 1 · Aplicar el schema en Supabase

1. Abrí https://supabase.com → tu proyecto
2. **SQL Editor** (en la barra lateral) → **New query**
3. Abrí `web/supabase/schema.sql` (en este repo), copiá TODO el contenido y
   pegalo en el editor
4. Click en **Run** (Ctrl/Cmd + Enter)
5. Debería decir "Success. No rows returned" al final
6. Verificá en **Table Editor** que aparezcan las 13 tablas: `bands`,
   `band_members`, `setlists`, `setlist_songs`, `songs`, `song_sections`,
   `lyric_lines`, `chord_charts`, `drum_cues`, `midi_cues`, `performances`,
   `ble_devices`, `user_preferences`

### Configurar el email auth

7. Andá a **Authentication → Providers**
8. Asegurate de que **Email** esté ON
9. Bajá hasta "Email Templates" y opcionalmente personalizá el template del
   magic link (por default sirve OK)

### Obtener las credenciales públicas

10. Andá a **Settings → API**
11. Copiá dos cosas:
    - **Project URL**: `https://ccytqubmroxjaiwtzsfh.supabase.co`
    - **anon public**: la key larga que arranca con `eyJhbGc...`
    - (NO uses la `service_role`, esa es secreta — quedátela para vos)

Guardalas, las vas a usar en los pasos 2 y 3.

## 2 · Deployar el web admin a Vercel

### Opción A · Desde GitHub (recomendado)

1. Pusheá el repo a GitHub (instrucciones en el README principal)
2. Andá a https://vercel.com/new
3. Importá el repo `camarage`
4. **Configure Project**:
   - **Framework Preset**: Next.js (auto-detectado)
   - **Root Directory**: click en "Edit" → seleccioná `web`
   - **Build Command**: dejá el default (`next build`)
5. **Environment Variables** (importante!):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://ccytqubmroxjaiwtzsfh.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = tu anon key del paso 1
6. **Deploy** — toma ~2 min
7. Te da una URL tipo `camarage-xxxxx.vercel.app`

### Configurar el callback de auth

8. En Supabase → **Authentication → URL Configuration**:
   - **Site URL**: pegá la URL de Vercel (sin `/` al final)
   - **Redirect URLs**: agregá `https://camarage-xxxxx.vercel.app/auth/callback`
9. Probá: andá a tu URL de Vercel → entrá con tu mail → llega magic link → tocás →
   te lleva al dashboard

### Opción B · Local primero

```bash
cd web
npm install
cp .env.example .env.local
# Edita .env.local con tus credenciales
npm run dev
# http://localhost:3000
```

## 3 · Conectar la app móvil a Supabase

1. Instalá el APK más reciente (`CAMARAGE-debug.apk`) en el celu
2. Abrí la app → entrá como Cantante (o cualquier rol) → **OFFLINE · sin DAW**
3. Tocá el ⚙ en el header
4. Vas a ver un panel **"Sync · Supabase"** con dos campos:
   - **URL**: pegá `https://ccytqubmroxjaiwtzsfh.supabase.co`
   - **anon key**: pegá tu anon key
5. Tocá **Guardar** → después **↻ Sincronizar**
6. Vas a ver el status pasar por `sincronizando…` → `✓ N canciones · HH:MM`
7. El setlist debería actualizarse con lo que cargaste en la web

### Cómo funciona el sync

- **Al abrir la app con internet**: pull automático + cache local
- **Al abrir la app sin internet**: carga del cache (última versión sincronizada)
- **Botón ↻ Sincronizar**: forzar refresh manual cuando quieras
- **Banda activa**: por default toma la primera; si tenés varias, la guarda
  en localStorage

## Flujo completo de uso (después del setup)

### Pre-show (computadora, web)
1. Abrís tu URL de Vercel → login con magic link
2. Creás canciones con metadata (key, BPM, time sig, PC#)
3. Editás letras línea por línea con timestamps
4. Mapeás notas MIDI a partes de la canción (C4 → Intro @ 0s, D4 → Verse @ 6s, etc.)
5. Cargás cifrado del bajo si querés
6. Armás el setlist agregando canciones en orden

### En el escenario (celular)
1. Abrís CAMARAGE
2. Si hay WiFi → sync automático del setlist actualizado
3. Conectás BLE MIDI al Mac (Logic)
4. Apretás Play en Logic → mensaje Start arranca el transporte
5. Logic manda Notes MIDI a lo largo de la canción → la app salta a cada parte
6. Si pierdes WiFi mid-show → seguís usando el cache offline, no se afecta nada

## Troubleshooting

### "Sin bandas — creá una en la web"
Andá a la web admin, sección Bandas, creá una. Después volvé al celu y dale Sincronizar.

### Magic link no llega al mail
- Mirá spam
- En Supabase → Auth → Email Templates verificá que esté activado
- Free tier de Supabase manda emails desde su dominio (tarda 10-30s)

### Build de Vercel falla
- Asegurate de que Root Directory esté en `web` (no en la raíz del repo)
- Verificá que las env vars estén seteadas en Project Settings

### Sync dice "error: ..."
- Verificá que la anon key sea correcta (sin espacios al copiar)
- Verificá en Supabase Settings → API que la URL coincida
- Si dice "JWT expired" hace falta re-loguearte en la web admin

## Comandos rápidos

```bash
# Actualizar el repo después de cambios míos
cd "/Users/patriciokeogan/Documents/Claude/Projects/CAMARAGE/CAMARAGE"
git add -A && git commit -m "update" && git push

# Re-compilar APK localmente (si tenés Android Studio):
cd camarage-android && npm install && npx cap sync android
cd android && ./gradlew assembleDebug
# APK queda en android/app/build/outputs/apk/debug/app-debug.apk

# Correr la web localmente:
cd web && npm install && npm run dev
```
