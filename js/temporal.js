import { T, D, HAND } from './features.js';

export const WINDOW_MS = 1000;
// After hands leave, the window still holds the last sign; keep evaluating it briefly.
export const HAND_TAIL_MS = 600;
export const MIN_HAND_SHARE = 0.5;

export const handsRecent = (ts, handsSeenAt) => ts - handsSeenAt <= HAND_TAIL_MS;

// Use elapsed time, not a camera's FPS. No interpolation across long tracking stalls.
export function resampleTimed(frames, start, duration = WINDOW_MS) {
  if (frames.length < 8 || frames[0].ts > start || frames.at(-1).ts < start + duration) return null;
  let cursor = 0;
  const out = [];
  for (let t = 0; t < T; t++) {
    const ts = start + t * duration / (T - 1);
    while (cursor + 1 < frames.length - 1 && frames[cursor + 1].ts < ts) cursor++;
    const a = frames[cursor], b = frames[cursor + 1];
    if (!b || b.ts - a.ts > 250 || b.ts <= a.ts) return null;
    const k = Math.max(0, Math.min(1, (ts - a.ts) / (b.ts - a.ts)));
    const f = new Float32Array(D);
    for (let d = 0; d < D; d++) {
      const base = d >= 2 ? 2 + Math.floor((d - 2) / HAND) * HAND : -1;
      // Presence is categorical; do not synthesize half-visible hands.
      const discrete = base >= 0 && (d === base || a.f[base] !== b.f[base]);
      f[d] = discrete ? (k < 0.5 ? a.f[d] : b.f[d]) : a.f[d] * (1 - k) + b.f[d] * k;
    }
    out.push(f);
  }
  return out;
}

// A softmax score alone is insufficient. Require a stable winner and a margin.
// Repeating the same sign requires a deliberate neutral interval.
export class RecognitionGate {
  constructor({ dwell = 240, margin = 0.15, cooldown = 850, release = 280 } = {}) {
    Object.assign(this, { dwell, margin, cooldown, release });
    this.reset();
  }
  reset() {
    this.candidate = null; this.since = 0; this.count = 0; this.previousAt = null;
    this.last = null; this.lastAt = -Infinity; this.neutralSince = null;
  }
  rest(ts) {
    this.candidate = null; this.count = 0; this.previousAt = null;
    if (this.neutralSince == null) this.neutralSince = ts;
    if (ts - this.neutralSince >= this.release) this.last = null;
  }
  update({ id, score, runnerUp = 0, threshold = 0.8, ts, background = false }) {
    if (background && score >= 0.6) { this.rest(ts); return false; }
    this.neutralSince = null;
    if (!id || background || score < threshold || score - runnerUp < this.margin) {
      this.candidate = null; this.count = 0; this.previousAt = null; return false;
    }
    if (id !== this.candidate || this.previousAt == null || ts - this.previousAt > 250) {
      this.candidate = id; this.since = ts; this.count = 0;
    }
    this.count++; this.previousAt = ts;
    if (this.count < 3 || ts - this.since < this.dwell || id === this.last || ts - this.lastAt < this.cooldown) return false;
    this.last = id; this.lastAt = ts;
    return true;
  }
}
