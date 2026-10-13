/* ============================================================================
 * Detección de altura para instrumentos monofónicos (bajo, guitarra nota a nota)
 * YIN (de Cheveigné & Kawahara 2002) sobre una señal opcionalmente diezmada.
 * ========================================================================== */

/** Diezma por `factor` con un promedio simple (alcanza como anti-alias para
 *  fundamentales graves; los armónicos altos no le importan a YIN). */
export function decimate(src: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return src;
  const n = Math.floor(src.length / factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * factor;
    for (let k = 0; k < factor; k++) s += src[o + k];
    out[i] = s / factor;
  }
  return out;
}

export function rms(buf: Float32Array, from = 0, to = buf.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

/**
 * Devuelve { hz, clarity } o null. clarity 0–1 (1 = periodicidad perfecta).
 * buf: señal (ya diezmada si corresponde) · sr: su sample rate.
 */
export function yin(buf: Float32Array, sr: number, minHz = 30, maxHz = 1200, threshold = 0.15) {
  const tauMin = Math.max(2, Math.floor(sr / maxHz));
  const tauMax = Math.min(Math.floor(sr / minHz), Math.floor(buf.length / 2));
  const W = buf.length - tauMax;
  if (W < 64 || tauMax <= tauMin) return null;

  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }
  // Diferencia normalizada acumulada
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    run += d[tau];
    cmnd[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }
  // Primer mínimo por debajo del umbral
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // Sin cruce: el mínimo global, si es razonable
    let best = tauMin;
    for (let t = tauMin; t <= tauMax; t++) if (cmnd[t] < cmnd[best]) best = t;
    if (cmnd[best] > 0.35) return null;
    tau = best;
  }
  // Interpolación parabólica
  let betterTau = tau;
  if (tau > 1 && tau < tauMax) {
    const s0 = cmnd[tau - 1], s1 = cmnd[tau], s2 = cmnd[tau + 1];
    const den = 2 * (2 * s1 - s2 - s0);
    if (den !== 0) betterTau = tau + (s2 - s0) / den;
  }
  return { hz: sr / betterTau, clarity: Math.max(0, 1 - cmnd[tau]) };
}

/** Hz → MIDI fraccionario (A4 = 69 = 440 Hz). */
export const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);

const NAMES = ["Do", "Do♯", "Re", "Re♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"];
export const midiName = (m: number) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

/** Mediana (para estabilizar la altura de una nota). */
export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
