// One frame of MediaPipe output → one fixed-length feature vector.
// Layout (D = 134):
//   [0, 1]          nose relative to the shoulders' midpoint, in shoulder widths
//   per hand slot h (0 = right, 1 = left), base = 2 + h * 66:
//     [base]        1 if the hand is present
//     [base+1, +2]  wrist relative to the shoulders' midpoint, in shoulder widths (where the sign is made)
//     [base+3 … +65] 21 landmarks × (x, y, z) relative to the wrist, in hand sizes (the hand's shape)
export const T = 30;          // frames per sign (≈1 s at 30 fps)
export const D = 134;
export const HAND = 66;

const clip = (v) => (v > 5 ? 5 : v < -5 ? -5 : v);

export function frameFeatures(hands, poseLandmarks) {
  const f = new Float32Array(D);
  let sx = 0.5, sy = 0.62, w = 0.28, nx = 0.5, ny = 0.38;
  if (poseLandmarks) {
    const l = poseLandmarks[11], r = poseLandmarks[12], n = poseLandmarks[0];
    sx = (l.x + r.x) / 2; sy = (l.y + r.y) / 2;
    w = Math.max(Math.hypot(l.x - r.x, l.y - r.y), 0.05);
    nx = n.x; ny = n.y;
  }
  f[0] = clip((nx - sx) / w); f[1] = clip((ny - sy) / w);

  let count = 0;
  if (hands && hands.landmarks) {
    const used = [false, false];
    hands.landmarks.forEach((pts, i) => {
      const label = hands.handednesses?.[i]?.[0]?.categoryName;
      let slot = label === 'Left' ? 1 : 0;
      if (used[slot]) slot = 1 - slot;
      if (used[slot]) return;
      used[slot] = true; count += 1;
      const base = 2 + slot * HAND;
      const wr = pts[0];
      const size = Math.max(Math.hypot(pts[9].x - wr.x, pts[9].y - wr.y), 0.02);
      f[base] = 1;
      f[base + 1] = clip((wr.x - sx) / w);
      f[base + 2] = clip((wr.y - sy) / w);
      for (let k = 0; k < 21; k++) {
        const p = pts[k];
        f[base + 3 + k * 3] = clip((p.x - wr.x) / size);
        f[base + 4 + k * 3] = clip((p.y - wr.y) / size);
        f[base + 5 + k * 3] = clip((p.z - wr.z) / size);
      }
    });
  }
  return { f, hands: count };
}

// Stack T frames into one sample (Float32Array of T*D).
export function stack(frames) {
  const out = new Float32Array(T * D);
  frames.forEach((fr, t) => out.set(fr, t * D));
  return out;
}

// Training-time variety: a shorter crop stretched back to T frames, a small shift and scale of where the
// sign is made, and a little jitter on the hand's shape. Never applied to validation data.
export function augment(sample, rand = Math.random) {
  const out = new Float32Array(T * D);
  const len = T - Math.floor(rand() * 7);              // 24 … 30 frames
  const start = Math.floor(rand() * (T - len + 1));
  const scale = 1 + (rand() - 0.5) * 0.2;
  const dx = (rand() - 0.5) * 0.2, dy = (rand() - 0.5) * 0.2;
  for (let t = 0; t < T; t++) {
    const src = start + (t * (len - 1)) / (T - 1);
    const a = Math.floor(src), b = Math.min(a + 1, T - 1), k = src - a;
    for (let d = 0; d < D; d++) {
      let v = sample[a * D + d] * (1 - k) + sample[b * D + d] * k;
      const inHand = d >= 2 ? (d - 2) % HAND : -1;
      const present = d >= 2 ? sample[a * D + 2 + Math.floor((d - 2) / HAND) * HAND] > 0.5 : true;
      if (d < 2) {
        v = v * scale + (d === 0 ? dx : dy);
      } else if (inHand === 1 || inHand === 2) {
        if (present) v = v * scale + (inHand === 1 ? dx : dy);
      } else if (inHand >= 3 && present) {
        v += (rand() - 0.5) * 0.06;
      }
      out[t * D + d] = v;
    }
  }
  return out;
}
