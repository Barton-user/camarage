/**
 * Lector de Standard MIDI File (SMF), escrito a mano.
 * ---------------------------------------------------------------------------
 * Por qué no una librería: las populares de JS modelan el archivo como "notas"
 * y pierden por el camino los Program Change, que es justamente lo que más nos
 * importa acá (los cambios de patch de los pedales). Este lector devuelve TODOS
 * los mensajes de canal con su tiempo absoluto en segundos.
 *
 * Soporta:
 *   · Formatos 0, 1 y 2
 *   · Running status
 *   · Mapa de tempo (meta 0x51), incluidos cambios de tempo a mitad del tema
 *   · División en ticks por negra y en SMPTE
 *   · Meta y SysEx: se saltean correctamente (no se emiten)
 */

export type MidiKind = "pc" | "cc" | "note_on" | "note_off";

export interface MidiEvent {
  timeSeconds: number;
  kind: MidiKind;
  channel: number;   // 0-15
  data1: number;     // programa / nº de CC / nota
  data2: number | null;
  trackName?: string;
}

export interface ParsedMidi {
  events: MidiEvent[];
  durationSeconds: number;
  trackNames: string[];
  ticksPerBeat: number;
}

class Reader {
  private p = 0;
  constructor(private v: DataView) {}
  get pos() { return this.p; }
  set pos(n: number) { this.p = n; }
  get eof() { return this.p >= this.v.byteLength; }
  u8() { return this.v.getUint8(this.p++); }
  u16() { const x = this.v.getUint16(this.p); this.p += 2; return x; }
  u32() { const x = this.v.getUint32(this.p); this.p += 4; return x; }
  str(n: number) {
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8());
    return s;
  }
  bytes(n: number) {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = this.u8();
    return out;
  }
  /** Cantidad de longitud variable: 7 bits por byte, el bit alto indica "sigue". */
  varInt() {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.u8();
      value = (value << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    return value;
  }
}

interface RawEvent { tick: number; kind: MidiKind; channel: number; data1: number; data2: number | null; track: number; }
interface TempoPoint { tick: number; usPerBeat: number; }

export function parseMidiFile(buffer: ArrayBuffer): ParsedMidi {
  const r = new Reader(new DataView(buffer));

  if (r.str(4) !== "MThd") throw new Error("No parece un archivo MIDI (falta la cabecera MThd)");
  const headerLen = r.u32();
  const format = r.u16();
  const numTracks = r.u16();
  const division = r.u16();
  // El header puede ser más largo en teoría; saltamos lo que sobre
  r.pos = 8 + headerLen;

  // División: por ticks por negra, o SMPTE (frames por segundo × ticks por frame)
  let ticksPerBeat = 480;
  let smpteTicksPerSecond = 0;
  if (division & 0x8000) {
    const fps = 256 - ((division >> 8) & 0xff);   // 24, 25, 29 o 30
    const ticksPerFrame = division & 0xff;
    smpteTicksPerSecond = fps * ticksPerFrame;
  } else {
    ticksPerBeat = division || 480;
  }

  const raw: RawEvent[] = [];
  const tempos: TempoPoint[] = [];
  const trackNames: string[] = [];
  let maxTick = 0;

  for (let t = 0; t < numTracks && !r.eof; t++) {
    const id = r.str(4);
    const len = r.u32();
    const end = r.pos + len;
    if (id !== "MTrk") { r.pos = end; continue; }   // chunk desconocido: se ignora

    let tick = 0;
    let runningStatus = 0;

    while (r.pos < end) {
      tick += r.varInt();
      let status = r.u8();

      if (status < 0x80) {           // running status: reusa el anterior y este byte es dato
        r.pos--;
        status = runningStatus;
        if (!status) break;          // archivo corrupto
      } else if (status < 0xf0) {
        runningStatus = status;
      }

      if (status === 0xff) {                       // meta
        const type = r.u8();
        const mlen = r.varInt();
        if (type === 0x51 && mlen === 3) {         // set tempo
          const b = r.bytes(3);
          tempos.push({ tick, usPerBeat: (b[0] << 16) | (b[1] << 8) | b[2] });
        } else if (type === 0x03) {                // nombre de pista
          trackNames[t] = new TextDecoder().decode(r.bytes(mlen));
        } else {
          r.pos += mlen;
        }
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {    // sysex: lo salteamos
        const slen = r.varInt();
        r.pos += slen;
        continue;
      }

      const type = status & 0xf0;
      const channel = status & 0x0f;

      if (type === 0xc0) {                         // Program Change (1 byte)
        const prog = r.u8();
        raw.push({ tick, kind: "pc", channel, data1: prog, data2: null, track: t });
      } else if (type === 0xd0) {                  // Channel Pressure (1 byte) — no nos sirve
        r.u8();
      } else {                                     // el resto son de 2 bytes
        const d1 = r.u8();
        const d2 = r.u8();
        if (type === 0xb0) {
          raw.push({ tick, kind: "cc", channel, data1: d1, data2: d2, track: t });
        } else if (type === 0x90) {
          // Note On con velocity 0 es en realidad un Note Off
          raw.push({ tick, kind: d2 === 0 ? "note_off" : "note_on", channel, data1: d1, data2: d2, track: t });
        } else if (type === 0x80) {
          raw.push({ tick, kind: "note_off", channel, data1: d1, data2: d2, track: t });
        }
        // pitch bend (0xe0) y aftertouch polifónico (0xa0) se descartan
      }
      if (tick > maxTick) maxTick = tick;
    }
    r.pos = end;   // por si el track traía basura al final
  }

  /* ---- Ticks → segundos, respetando los cambios de tempo ---- */
  tempos.sort((a, b) => a.tick - b.tick);
  if (!tempos.length) tempos.push({ tick: 0, usPerBeat: 500000 });   // 120 BPM por defecto
  if (tempos[0].tick > 0) tempos.unshift({ tick: 0, usPerBeat: 500000 });

  function tickToSeconds(target: number): number {
    if (smpteTicksPerSecond) return target / smpteTicksPerSecond;   // SMPTE: tempo no aplica
    let seconds = 0;
    for (let i = 0; i < tempos.length; i++) {
      const desde = tempos[i].tick;
      if (desde >= target) break;
      const hasta = Math.min(tempos[i + 1]?.tick ?? target, target);
      seconds += ((hasta - desde) / ticksPerBeat) * (tempos[i].usPerBeat / 1e6);
    }
    return seconds;
  }

  const events: MidiEvent[] = raw
    .map(e => ({
      timeSeconds: Math.round(tickToSeconds(e.tick) * 1000) / 1000,
      kind: e.kind,
      channel: e.channel,
      data1: e.data1,
      data2: e.data2,
      trackName: trackNames[e.track],
    }))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);

  return {
    events,
    durationSeconds: tickToSeconds(maxTick),
    trackNames: trackNames.filter(Boolean),
    ticksPerBeat,
  };
}

/** Texto corto para mostrar el evento en una lista. */
export function describeEvent(e: MidiEvent): string {
  const ch = `ch${e.channel + 1}`;
  switch (e.kind) {
    case "pc":       return `Program Change ${e.data1} · ${ch}`;
    case "cc":       return `CC${e.data1} = ${e.data2} · ${ch}`;
    case "note_on":  return `Nota ${noteName(e.data1)} on · ${ch}`;
    case "note_off": return `Nota ${noteName(e.data1)} off · ${ch}`;
  }
}

const NOTAS = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
export function noteName(n: number) { return NOTAS[n % 12] + (Math.floor(n / 12) - 1); }
