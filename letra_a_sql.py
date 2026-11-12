#!/usr/bin/env python3
"""
CAMARAGE · letra (.txt / .lrc) -> .sql para Supabase
=====================================================
Uso:
    python3 letra_a_sql.py <archivo_letra.txt> "<Título>" [--key Gm] [--bpm 108]
                           [--duracion 414] [--compas 4/4] [-o salida.sql]

Formato del archivo de letra (UTF-8, una línea por renglón de pantalla):

    # verse Verso 1                 <- encabezado de sección: "# <tipo> <etiqueta>"
    [00:35.20] primer renglón       <- tiempo opcional al principio, estilo LRC
    segundo renglón                 <- sin tiempo: se interpola entre vecinos
    * renglón resaltado             <- "*" adelante = is_chorus_emphasis
    [01:02.00] ...

    Tipos de sección válidos: intro verse pre_chorus chorus bridge solo
    breakdown interlude outro silence other
    Las líneas vacías se ignoran.

Reglas de tiempos:
  - El PRIMER y el ÚLTIMO renglón tienen que tener tiempo.
  - Los renglones sin tiempo se reparten parejo entre el anterior y el
    siguiente que sí tengan. Cuantos más tiempos pongas, más preciso queda.
  - Una sección arranca en el tiempo de su primer renglón. Si una sección no
    tiene renglones (ej. "# solo Solo"), ponele tiempo en el mismo encabezado:
        # solo Solo @ 02:28.50
  - start_bar se calcula con el BPM y el compás (si pasás --bpm).

Tiempos en segundos desde el inicio del ARCHIVO DE AUDIO que vayas a usar.
Ojo: "unnatural selection con bajo.mp3" tiene 34,9 s de silencio al principio.

El .sql que genera es idempotente, igual que los insert_*.sql anteriores.
"""
import argparse, re, sys

TIPOS = {'intro','verse','pre_chorus','chorus','bridge','solo','breakdown',
         'interlude','outro','silence','other'}
RE_T = re.compile(r'^\[(\d+):(\d+(?:\.\d+)?)\]\s*')
RE_SEC = re.compile(r'^#\s*(\w+)\s*(.*?)\s*(?:@\s*(\d+):(\d+(?:\.\d+)?))?\s*$')

def q(s):  # escapar para SQL
    return "'" + s.replace("'", "''") + "'"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('letra'); ap.add_argument('titulo')
    ap.add_argument('--key'); ap.add_argument('--bpm', type=float)
    ap.add_argument('--duracion', type=int); ap.add_argument('--compas', default='4/4')
    ap.add_argument('-o', '--out')
    a = ap.parse_args()

    lines, secs = [], []
    for n, raw in enumerate(open(a.letra, encoding='utf-8'), 1):
        s = raw.strip()
        if not s: continue
        m = RE_SEC.match(s)
        if s.startswith('#') and m:
            tipo = m.group(1).lower()
            if tipo not in TIPOS:
                sys.exit(f'Línea {n}: tipo de sección "{tipo}" no válido. Usá: {" ".join(sorted(TIPOS))}')
            t = int(m.group(3))*60 + float(m.group(4)) if m.group(3) else None
            secs.append({'tipo': tipo, 'label': m.group(2) or tipo.capitalize(),
                         't': t, 'first_line': len(lines)})
            continue
        t = None
        m = RE_T.match(s)
        if m:
            t = int(m.group(1))*60 + float(m.group(2)); s = s[m.end():]
        emph = s.startswith('*')
        if emph: s = s[1:].strip()
        if not s: sys.exit(f'Línea {n}: renglón vacío después del tiempo/asterisco.')
        lines.append({'t': t, 'text': s, 'emph': emph, 'n': n})

    if not lines: sys.exit('El archivo no tiene renglones.')
    if lines[0]['t'] is None or lines[-1]['t'] is None:
        sys.exit('El primer y el último renglón necesitan tiempo [mm:ss.xx].')

    # interpolar
    known = [i for i, l in enumerate(lines) if l['t'] is not None]
    for a_i, b_i in zip(known, known[1:]):
        ta, tb = lines[a_i]['t'], lines[b_i]['t']
        if tb < ta: sys.exit(f'Tiempos fuera de orden en líneas {lines[a_i]["n"]} y {lines[b_i]["n"]}.')
        for k in range(a_i+1, b_i):
            lines[k]['t'] = ta + (tb-ta)*(k-a_i)/(b_i-a_i)
            lines[k]['interp'] = True

    # tiempos y compases de secciones
    beat = 60/a.bpm if a.bpm else None
    num = int(a.compas.split('/')[0])
    for i, s in enumerate(secs):
        if s['t'] is None:
            if s['first_line'] >= len(lines):
                sys.exit(f'La sección "{s["label"]}" no tiene renglones: ponele "@ mm:ss.xx".')
            s['t'] = lines[s['first_line']]['t']
    end = a.duracion
    for i, s in enumerate(secs):
        nxt = secs[i+1]['t'] if i+1 < len(secs) else (end or s['t'])
        if beat:
            bar = beat*num
            s['bar'] = int(round(s['t']/bar)) + 1
            s['count'] = max(1, int(round((nxt - s['t'])/bar)))
        else:
            s['bar'], s['count'] = 0, 4
    # a qué sección pertenece cada renglón (por orden de aparición)
    for i, s in enumerate(secs):
        hasta = secs[i+1]['first_line'] if i+1 < len(secs) else len(lines)
        for l in lines[s['first_line']:hasta]: l['sec'] = i

    T = a.titulo
    o = []
    o.append(f"""-- =============================================================================
-- CAMARAGE · "{T}"
-- Generado con letra_a_sql.py a partir de {a.letra}
-- {len(lines)} renglones ({sum(1 for l in lines if l.get('interp'))} con tiempo interpolado) · {len(secs)} secciones
-- Idempotente: se puede correr las veces que haga falta.
-- =============================================================================

do $$
declare
  v_band uuid;
  v_song uuid;
  v_sec  uuid[] := '{{}}';
  v_id   uuid;
begin
  select band_id into v_band from songs order by created_at limit 1;
  if v_band is null then
    raise exception 'No encontré ninguna banda. Cargá al menos una canción antes.';
  end if;

  select id into v_song from songs
   where band_id = v_band and lower(title) = lower({q(T)}) limit 1;

  if v_song is null then
    insert into songs (band_id, title, key, bpm, time_signature, duration_seconds)
    values (v_band, {q(T)}, {q(a.key) if a.key else 'null'}, {a.bpm if a.bpm else 'null'},
            {q(a.compas)}, {a.duracion if a.duracion else 'null'})
    returning id into v_song;
    raise notice 'Canción creada: %', v_song;
  else
    update songs set key = coalesce({q(a.key) if a.key else 'null'}, key),
                     bpm = coalesce({a.bpm if a.bpm else 'null'}, bpm),
                     time_signature = {q(a.compas)},
                     duration_seconds = coalesce({a.duracion if a.duracion else 'null'}, duration_seconds),
                     updated_at = now()
     where id = v_song;
    raise notice 'Canción ya existía, actualizada: %', v_song;
  end if;

  delete from lyric_lines   where song_id = v_song;
  delete from song_sections where song_id = v_song;
""")
    for i, s in enumerate(secs):
        o.append(f"""  insert into song_sections (song_id, section_type, label, order_index, start_bar, bar_count, start_time_seconds)
  values (v_song, {q(s['tipo'])}, {q(s['label'])}, {i}, {s['bar']}, {s['count']}, {s['t']:.3f}) returning id into v_id;
  v_sec := v_sec || v_id;""")
    o.append("\n  insert into lyric_lines (song_id, section_id, order_index, start_time_seconds, text, is_chorus_emphasis) values")
    rows = []
    for i, l in enumerate(lines):
        sec = f"v_sec[{l['sec']+1}]" if 'sec' in l else 'null'
        rows.append(f"    (v_song, {sec}, {i:3d}, {l['t']:8.3f}, {q(l['text'])}, {'true' if l['emph'] else 'false'})")
    o.append(',\n'.join(rows) + ';')
    o.append(f"""
  raise notice 'Listo: {len(lines)} líneas y {len(secs)} secciones para "%"', {q(T)};
end $$;

-- Verificación
select s.title, s.bpm, s.key, s.duration_seconds,
       (select count(*) from lyric_lines   l where l.song_id = s.id) as lineas,
       (select count(*) from song_sections x where x.song_id = s.id) as secciones
  from songs s where lower(s.title) = lower({q(T)});
""")
    out = a.out or 'insert_' + re.sub(r'\W+', '_', T.lower()).strip('_') + '.sql'
    open(out, 'w', encoding='utf-8').write('\n'.join(o))
    print(f'OK -> {out}  ({len(lines)} renglones, {len(secs)} secciones)')

if __name__ == '__main__':
    main()
