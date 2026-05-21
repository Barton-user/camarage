# CAMARAGE Web Admin

Panel de administración Next.js para configurar setlists, canciones, letras
y cues MIDI. Sincroniza con la app móvil via Supabase.

## Setup local

```bash
cd web
npm install
cp .env.example .env.local
# Edit .env.local con tus credenciales de Supabase
npm run dev
# Abrí http://localhost:3000
```

## Setup Supabase (una sola vez)

1. Abrí tu proyecto en https://supabase.com → SQL Editor
2. Pegá el contenido de `supabase/schema.sql` y dale **Run**
3. Verificá en Table Editor que aparezcan las 13 tablas (bands, songs, midi_cues, etc.)
4. En **Authentication → Providers → Email** activá "Enable Email Provider" con magic link

## Deploy a Vercel

1. Pusheá el repo a GitHub (la carpeta `web/` es el root del proyecto)
2. En Vercel → New Project → import el repo
3. **Root Directory**: `web` (importante: subdirectorio dentro del monorepo)
4. **Environment Variables**: agregá
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Deploy. Vercel te da una URL tipo `camarage-web.vercel.app`
6. En Supabase → Authentication → URL Configuration → **Site URL**: poné la URL de Vercel
   - Esto es necesario para que el magic link redirija de vuelta a tu app

## Estructura

```
web/
├── app/
│   ├── login/           # magic link auth
│   ├── auth/callback/   # callback OAuth
│   ├── dashboard/       # home con stats
│   ├── bands/           # CRUD de bandas
│   ├── setlists/        # CRUD de setlists + reorder
│   └── songs/[id]/      # editor con tabs: meta/lyrics/cues/chords
├── components/
│   └── Nav.tsx          # sidebar
├── lib/
│   ├── supabase-client.ts
│   ├── supabase-server.ts
│   └── types.ts
├── supabase/
│   └── schema.sql       # schema completo para Supabase
├── middleware.ts        # protege rutas autenticadas
└── next.config.js
```

## Auth flow

1. Usuario va a `/login`, ingresa email
2. Supabase manda mail con link mágico
3. Link va a `/auth/callback?code=...` → exchange por sesión
4. Redirect a `/dashboard`
5. Cookie de sesión válida (manejada por @supabase/ssr)
6. Middleware verifica auth en `/dashboard`, `/songs`, etc.

## Sincronización con la app móvil

La app Android lee directamente de Supabase usando la misma anon key:
- Al abrir, hace pull del setlist activo + canciones + letras + cues
- Cachea en localStorage
- Funciona offline una vez cacheado
- Botón "Sincronizar" en ⚙ del modal fuerza refresh
