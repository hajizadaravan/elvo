// The sign classifier: a small temporal convolution network over 30 frames of hand + body landmarks,
// trained in the browser with TensorFlow.js (global `tf`, loaded in index.html).
import { T, D, augment } from './features.js';

const MODEL_URL = 'indexeddb://dilmanc-model';
const META_KEY = 'dilmanc.model.v1';

export function build(nClasses) {
  const m = tf.sequential();
  m.add(tf.layers.conv1d({ inputShape: [T, D], filters: 64, kernelSize: 5, padding: 'same', activation: 'relu' }));
  m.add(tf.layers.dropout({ rate: 0.15 }));
  m.add(tf.layers.conv1d({ filters: 96, kernelSize: 3, padding: 'same', activation: 'relu' }));
  m.add(tf.layers.maxPooling1d({ poolSize: 2 }));
  m.add(tf.layers.conv1d({ filters: 128, kernelSize: 3, padding: 'same', activation: 'relu' }));
  m.add(tf.layers.globalAveragePooling1d());
  m.add(tf.layers.dropout({ rate: 0.3 }));
  m.add(tf.layers.dense({ units: nClasses, activation: 'softmax' }));
  m.compile({ optimizer: tf.train.adam(1e-3), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  return m;
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Hold out about a fifth of each class (at least one when a class has four or more samples).
export function stratifiedSplit(samples, classes) {
  const train = [], val = [];
  for (const c of classes) {
    const own = shuffle(samples.filter((s) => s.sign === c));
    const k = own.length >= 4 ? Math.max(1, Math.round(own.length * 0.2)) : 0;
    val.push(...own.slice(0, k)); train.push(...own.slice(k));
  }
  return { train, val };
}

function tensors(list, classes) {
  const X = new Float32Array(list.length * T * D);
  list.forEach((s, i) => X.set(s.data, i * T * D));
  const y = list.map((s) => classes.indexOf(s.sign));
  return { x: tf.tensor3d(X, [list.length, T, D]), y: tf.oneHot(tf.tensor1d(y, 'int32'), classes.length) };
}

// Train on `train`, report on `val` after every epoch. Returns the model and its history.
export async function train({ train: tr, val, classes, epochs = 35, copies = 2, onEpoch }) {
  const expanded = [];
  for (const s of tr) { expanded.push(s); for (let k = 0; k < copies; k++) expanded.push({ sign: s.sign, data: augment(s.data) }); }
  shuffle(expanded);
  const model = build(classes.length);
  const a = tensors(expanded, classes);
  const b = val.length ? tensors(val, classes) : null;
  const history = { acc: [], valAcc: [] };
  await model.fit(a.x, a.y, {
    epochs, batchSize: 32, shuffle: true,
    validationData: b ? [b.x, b.y] : undefined,
    callbacks: {
      onEpochEnd: async (epoch, logs) => {
        history.acc.push(logs.acc ?? logs.accuracy ?? 0);
        history.valAcc.push(b ? (logs.val_acc ?? logs.val_accuracy ?? 0) : null);
        onEpoch?.(epoch + 1, epochs, history);
        await tf.nextFrame();
      },
    },
  });
  tf.dispose([a.x, a.y]); if (b) tf.dispose([b.x, b.y]);
  return { model, history };
}

// Accuracy per class and overall on a labelled set.
export function evaluate(model, list, classes) {
  if (!list.length) return null;
  const { x, y } = tensors(list, classes);
  const pred = tf.tidy(() => model.predict(x).argMax(-1).dataSync());
  tf.dispose([x, y]);
  const per = Object.fromEntries(classes.map((c) => [c, { right: 0, total: 0 }]));
  let right = 0;
  list.forEach((s, i) => {
    const ok = classes[pred[i]] === s.sign;
    per[s.sign].total += 1; if (ok) { per[s.sign].right += 1; right += 1; }
  });
  return { right, total: list.length, accuracy: right / list.length, per };
}

export function predict(model, sample) {
  return tf.tidy(() => Array.from(model.predict(tf.tensor3d(sample, [1, T, D])).dataSync()));
}

export async function saveModel(model, meta) {
  await model.save(MODEL_URL);
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export async function loadModel() {
  const meta = JSON.parse(localStorage.getItem(META_KEY) || 'null');
  if (!meta) return null;
  try { return { model: await tf.loadLayersModel(MODEL_URL), meta }; } catch { return null; }
}

export async function downloadModel(model) { await model.save('downloads://dilmanc-model'); }

export async function forgetModel() {
  localStorage.removeItem(META_KEY);
  try { await tf.io.removeModel(MODEL_URL); } catch {}
}
