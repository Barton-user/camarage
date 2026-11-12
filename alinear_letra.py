#!/usr/bin/env python3
"""
CAMARAGE · alinear letra con el audio (automático)
==================================================
Vos pegás la letra en un .txt (una línea por renglón de pantalla, sin tiempos).
Este script escucha el audio, encuentra cuándo se canta cada renglón y genera:
  1) <letra>_con_tiempos.txt   (el mismo texto con [mm:ss.xx] adelante)
  2) insert_<titulo>.sql        (vía letra_a_sql.py, listo para Supabase)

Instalar una sola vez (Terminal de la Mac):
    pip3 install faster-whisper librosa

Uso:
    python3 alinear_letra.py "unnatural selection con bajo.mp3" unnatural.txt \
        "Unnatural Selection" --key Gm --bpm 108 --duracion 414

Opcionales:
    --modelo small|medium|large-v3   (default small; medium es más preciso y más lento)
    --idioma en|es                   (default en)

En el .txt podés usar, si querés, lo mismo que letra_a_sql.py:
  "# tipo Etiqueta" para secciones y "*" adelante para resaltar estribillos.
Si un renglón ya tiene [mm:ss.xx] puesto a mano, se respeta.
Los renglones que no logre ubicar quedan sin tiempo y se interpolan.
"""
import argparse, difflib, os, re, subprocess, sys, unicodedata

RE_T = re.compile(r'^\[(\d+):(\d+(?:\.\d+)?)\]\s*')

def norm(w):
    w = unicodedata.normalize('NFKD', w.lower())
    w = ''.join(c for c in w if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9ñ]", '', w)

def fmt(t):
    m = int(t // 60); return f'[{m:02d}:{t - m*60:05.2f}]'

def cargar_audio(path):
    try:
        from faster_whisper import decode_audio
        return decode_audio(path, sampling_rate=16000)
    except Exception:
        import librosa
        a, _ = librosa.load(path, sr=16000, mono=True)
        return a

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('audio'); ap.add_argument('letra'); ap.add_argument('titulo')
    ap.add_argument('--key'); ap.add_argument('--bpm'); ap.add_argument('--duracion')
    ap.add_argument('--compas', default='4/4')
    ap.add_argument('--modelo', default='small'); ap.add_argument('--idioma', default='en')
    a = ap.parse_args()

    raw = open(a.letra, encoding='utf-8').read().splitlines()
    # renglones de letra (ignora vacíos y encabezados de sección)
    idx = []   # (n_linea_archivo, texto_sin_marcas, tiempo_manual)
    for i, s in enumerate(raw):
        st = s.strip()
        if not st or st.startswith('#'): continue
        m = RE_T.match(st); tman = None
        if m: tman = int(m.group(1))*60 + float(m.group(2)); st = st[m.end():]
        idx.append((i, st.lstrip('*').strip(), tman))
    if not idx: sys.exit('El .txt no tiene renglones.')

    print(f'Transcribiendo con el modelo "{a.modelo}" (puede tardar unos minutos)...')
    from faster_whisper import WhisperModel
    model = WhisperModel(a.modelo, device='cpu', compute_type='int8')
    pista = cargar_audio(a.audio)
    segs, _ = model.transcribe(pista, language=a.idioma, word_timestamps=True,
                               vad_filter=False, condition_on_previous_text=False)
    # energía por ventana de 0,5 s: whisper "inventa" palabras en el silencio
    import numpy as np
    v = 8000
    rms = [float(np.sqrt(np.mean(pista[i:i+v]**2))) for i in range(0, len(pista), v)]
    umbral = max(rms) * 0.05
    oidas = []  # (palabra_normalizada, inicio)
    for s in segs:
        for w in (s.words or []):
            n = norm(w.word)
            ventana = rms[min(int(w.start*2), len(rms)-1)]
            if n and ventana > umbral: oidas.append((n, w.start))
    print(f'  {len(oidas)} palabras detectadas en el audio')

    # secuencia de palabras de la letra, con a qué renglón pertenecen
    letra_w, owner, pos = [], [], []
    for k, (_, txt, _) in enumerate(idx):
        ws = [norm(w) for w in txt.split()]; ws = [w for w in ws if w]
        for j, w in enumerate(ws):
            letra_w.append(w); owner.append(k); pos.append(j)

    sm = difflib.SequenceMatcher(None, letra_w, [w for w, _ in oidas], autojunk=False)
    hits = {}  # renglón -> lista de (posición_en_renglón, tiempo)
    for blk in sm.get_matching_blocks():
        for d in range(blk.size):
            li = blk.a + d
            hits.setdefault(owner[li], []).append((pos[li], oidas[blk.b + d][1]))

    tiempos = []
    for k, (_, txt, tman) in enumerate(idx):
        if tman is not None: tiempos.append(tman); continue
        h = hits.get(k, [])
        nw = len(txt.split())
        if len(h) >= min(2, nw) and len(h) >= 0.5*nw:
            p, t = min(h)                     # primera palabra encontrada
            tiempos.append(max(0.0, t - 0.35*p))   # retrocede si no era la 1ª
        else:
            tiempos.append(None)

    # descartar los que rompen el orden: los tiempos manuales mandan, y entre
    # ellos se queda la secuencia creciente más larga de tiempos automáticos
    manual = [k for k, (_, _, tm) in enumerate(idx) if tm is not None]
    def techo(k):
        nxt = [m for m in manual if m > k]
        return tiempos[nxt[0]] if nxt else float('inf')
    def piso(k):
        prv = [m for m in manual if m < k]
        return tiempos[prv[-1]] if prv else -1.0
    for k in range(len(tiempos)):
        if idx[k][2] is None and tiempos[k] is not None and not (piso(k) < tiempos[k] < techo(k)):
            tiempos[k] = None
    val = [k for k, t in enumerate(tiempos) if t is not None and idx[k][2] is None]
    best, prev = {}, {}
    for k in val:
        best[k], prev[k] = 1, None
        for j in val:
            if j >= k: break
            if tiempos[j] < tiempos[k] and best[j] + 1 > best[k]:
                best[k], prev[k] = best[j] + 1, j
    keep = set(manual)
    if val:
        k = max(val, key=lambda x: best[x])
        while k is not None: keep.add(k); k = prev[k]
    for k in range(len(tiempos)):
        if k not in keep: tiempos[k] = None

    # primero y último obligatorios
    conocidos = [k for k, t in enumerate(tiempos) if t is not None]
    if not conocidos: sys.exit('No pude ubicar ningún renglón. Probá con --modelo medium.')
    if tiempos[0] is None:  tiempos[0] = tiempos[conocidos[0]]
    if tiempos[-1] is None: tiempos[-1] = tiempos[conocidos[-1]]

    out = list(raw)
    for k, (i, _, _) in enumerate(idx):
        st = RE_T.sub('', raw[i].strip())
        out[i] = (fmt(tiempos[k]) + ' ' + st) if tiempos[k] is not None else st
    base = os.path.splitext(a.letra)[0]
    txt_out = base + '_con_tiempos.txt'
    open(txt_out, 'w', encoding='utf-8').write('\n'.join(out) + '\n')

    ub = sum(1 for t in tiempos if t is not None)
    print(f'  {ub} de {len(idx)} renglones ubicados en el audio; el resto se interpola.')
    print(f'  -> {txt_out}  (revisalo y corregí a mano lo que haga falta)')
    faltan = [idx[k][0]+1 for k, t in enumerate(tiempos) if t is None]
    if faltan: print('  Renglones sin ubicar (línea del .txt):', ', '.join(map(str, faltan)))

    cmd = [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'letra_a_sql.py'),
           txt_out, a.titulo, '--compas', a.compas]
    for f in ('key', 'bpm', 'duracion'):
        if getattr(a, f): cmd += ['--' + f, str(getattr(a, f))]
    subprocess.run(cmd, check=True)

if __name__ == '__main__':
    main()
