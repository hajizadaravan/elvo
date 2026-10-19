// The sign classifier: a small temporal convolution network over 30 frames of hand + body landmarks,
// trained in the browser with TensorFlow.js (global `tf`, loaded in index.html).
import { T, D, augment } from './features.js';
import { validateVocab, classesOf, FON } from './vocab.js';

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
  return tf.tidy(() => ({ x: tf.tensor3d(X, [list.length, T, D]), y: tf.oneHot(tf.tensor1d(y, 'int32'), classes.length) }));
}

export function signerSplit(samples, classes, signer) {
  const train = samples.filter((s) => s.signer !== signer), val = samples.filter((s) => s.signer === signer);
  const missingTrain = classes.filter((c) => !train.some((s) => s.sign === c));
  const missingVal = classes.filter((c) => !val.some((s) => s.sign === c));
  if (missingTrain.length || missingVal.length) {
    const key = 'Hər sinif həm öyrətmə, həm yoxlama dəstində olmalıdır. Öyrətmədə çatmır: {train}; yoxlamada çatmır: {val}.';
    const params = { train: missingTrain.join(', ') || '-', val: missingVal.join(', ') || '-' };
    const error = new Error(key.replace(/\{(\w+)\}/g, (_, name) => params[name]));
    Object.assign(error, { key, params });
    throw error;
  }
  return { train, val };
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
  try { await model.fit(a.x, a.y, {
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
  }); } catch (e) { model.dispose(); throw e; }
  finally { tf.dispose([a.x, a.y]); if (b) tf.dispose([b.x, b.y]); }
  return { model, history };
}

// Accuracy per class and overall on a labelled set.
export function evaluate(model, list, classes) {
  if (!list.length) return null;
  const { x, y } = tensors(list, classes);
  const pred = tf.tidy(() => model.predict(x).argMax(-1).dataSync());
  tf.dispose([x, y]);
  const per = Object.fromEntries(classes.map((c) => [c, { right: 0, total: 0 }]));
  const confusion = classes.map(() => classes.map(() => 0));
  let right = 0;
  list.forEach((s, i) => {
    const ok = classes[pred[i]] === s.sign;
    confusion[classes.indexOf(s.sign)][pred[i]]++;
    per[s.sign].total += 1; if (ok) { per[s.sign].right += 1; right += 1; }
  });
  const recall = classes.map((c) => per[c].total ? per[c].right / per[c].total : null).filter((v) => v != null);
  return { right, total: list.length, accuracy: right / list.length, balancedAccuracy: recall.reduce((a, b) => a + b, 0) / recall.length, per, confusion };
}

export function predict(model, sample) {
  return tf.tidy(() => Array.from(model.predict(tf.tensor3d(sample, [1, T, D])).dataSync()));
}

export async function saveModel(model, meta) {
  await model.save(MODEL_URL);
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export async function loadModel() {
  try {
    const meta = JSON.parse(localStorage.getItem(META_KEY) || 'null');
    if (!meta) return null;
    const model = await tf.loadLayersModel(MODEL_URL);
    try { validateShape(model, meta); } catch (e) { model.dispose(); throw e; }
    return { model, meta };
  } catch { return null; }
}

function validateShape(model, meta) {
  const input = model.inputs?.[0]?.shape, output = model.outputs?.[0]?.shape;
  if (!Array.isArray(meta?.classes) || meta.classes.length < 2 || new Set(meta.classes).size !== meta.classes.length || !meta.classes.includes(FON.id) || !meta.classes.every((c) => typeof c === 'string') || input?.length !== 3 || input[1] !== T || input[2] !== D || output?.length !== 2 || output[1] !== meta.classes.length) throw new Error('Modelin ölçüləri və ya sinifləri Dilmanc ilə uyğun deyil.');
}

const count = (v) => Number.isInteger(v) && v >= 0 && v <= 1e6;
const ratio = (v) => v == null || (typeof v === 'number' && v >= 0 && v <= 1);

// Imported bundles are untrusted: keep only typed evaluation fields that the UI renders.
function cleanMeta(meta) {
  const classes = [...meta.classes], n = classes.length;
  const bad = () => { throw new Error('Model paketindəki nəticə məlumatı düzgün deyil.'); };
  if (!ratio(meta.accuracy) || !ratio(meta.balancedAccuracy) || (meta.right != null && !count(meta.right)) || (meta.tested != null && !count(meta.tested)) || (meta.samples != null && !count(meta.samples))) bad();
  const holdout = meta.holdout ?? 'random';
  if (typeof holdout !== 'string' || holdout.length > 120) bad();
  let per = null;
  if (meta.per != null) {
    if (typeof meta.per !== 'object' || Array.isArray(meta.per)) bad();
    per = {};
    for (const c of classes) {
      const v = meta.per[c] ?? { right: 0, total: 0 };
      if (!count(v.right) || !count(v.total) || v.right > v.total) bad();
      per[c] = { right: v.right, total: v.total };
    }
  }
  let confusion = null;
  if (meta.confusion != null) {
    if (!Array.isArray(meta.confusion) || meta.confusion.length !== n || !meta.confusion.every((row) => Array.isArray(row) && row.length === n && row.every(count))) bad();
    confusion = meta.confusion.map((row) => [...row]);
  }
  let history = null;
  if (meta.history != null) {
    const { acc, valAcc } = meta.history;
    if (!Array.isArray(acc) || acc.length > 500 || !acc.every((v) => typeof v === 'number' && v >= 0 && v <= 1) || (valAcc != null && (!Array.isArray(valAcc) || valAcc.length !== acc.length || !valAcc.every(ratio)))) bad();
    history = { acc: [...acc], valAcc: valAcc ? [...valAcc] : [] };
  }
  const trainedAt = typeof meta.trainedAt === 'string' && !Number.isNaN(Date.parse(meta.trainedAt)) ? meta.trainedAt : null;
  return { classes, trainedAt, accuracy: meta.accuracy ?? null, balancedAccuracy: meta.balancedAccuracy ?? null, right: meta.right ?? 0, tested: meta.tested ?? 0, per, confusion, holdout, history, samples: meta.samples ?? null, windowMs: 1000 };
}

// One portable file, including the class order and vocabulary (plain TF downloads omit them).
export async function exportBundle(model, meta, vocab) {
  validateShape(model, meta); validateVocab(vocab);
  let artifacts;
  await model.save(tf.io.withSaveHandler(async (a) => {
    artifacts = a;
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
  }));
  const bytes = new Uint8Array(artifacts.weightData);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return JSON.stringify({ format: 'dilmanc-bundle', version: 1, features: { T, D, windowMs: 1000 }, exportedAt: new Date().toISOString(), meta, vocab, model: { modelTopology: artifacts.modelTopology, weightSpecs: artifacts.weightSpecs, weightData: btoa(binary) } });
}

export async function importBundle(text) {
  const j = JSON.parse(text);
  if (j.format !== 'dilmanc-bundle' || j.version !== 1 || j.features?.T !== T || j.features?.D !== D || j.features?.windowMs !== 1000 || !j.model?.modelTopology || !Array.isArray(j.model?.weightSpecs) || typeof j.model.weightData !== 'string') throw new Error('Bu uyğun Dilmanc hazır model paketi deyil.');
  validateVocab(j.vocab);
  const known = new Set(classesOf(j.vocab));
  if (!Array.isArray(j.meta?.classes) || !j.meta.classes.every((c) => known.has(c))) throw new Error('Model sinifləri lüğətlə uyğun deyil.');
  const bytes = Uint8Array.from(atob(j.model.weightData), (c) => c.charCodeAt(0));
  const model = await tf.loadLayersModel(tf.io.fromMemory({ modelTopology: j.model.modelTopology, weightSpecs: j.model.weightSpecs, weightData: bytes.buffer }));
  let meta;
  try { validateShape(model, j.meta); meta = cleanMeta(j.meta); }
  catch (e) { model.dispose(); throw e; }
  return { model, meta, vocab: j.vocab };
}

export async function forgetModel() {
  localStorage.removeItem(META_KEY);
  try { await tf.io.removeModel(MODEL_URL); } catch {}
}
