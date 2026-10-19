// Samples live in IndexedDB (a few hundred × 30 frames is too large for localStorage).
// A sample: { id, sign, signer, data: Float32Array(T*D), at: ISO time }
import { T, D } from './features.js';
import { validateVocab, classesOf } from './vocab.js';
const DB = 'dilmanc', STORE = 'samples';
let dbp = null;

function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

async function run(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
  });
}

export const allSamples = () => run('readonly', (s) => s.getAll());
export const putSample = (x) => run('readwrite', (s) => s.put(x));
export const deleteSample = (id) => run('readwrite', (s) => s.delete(id));
export const clearSamples = () => run('readwrite', (s) => s.clear());
export async function putMany(list) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, 'readwrite');
    const s = tx.objectStore(STORE);
    list.forEach((x) => s.put(x));
    tx.oncomplete = () => res(list.length);
    tx.onerror = () => rej(tx.error);
  });
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Export/import so several laptops can record and merge into one dataset.
export function toJSON(samples, vocab) {
  return JSON.stringify({
    format: 'dilmanc-dataset', version: 1, exportedAt: new Date().toISOString(), vocab,
    samples: samples.map((x) => ({ ...x, data: Array.from(x.data, (v) => Math.round(v * 1e4) / 1e4) })),
  });
}

export function fromJSON(text) {
  const j = JSON.parse(text);
  if (j.format !== 'dilmanc-dataset' || j.version !== 1 || !Array.isArray(j.samples)) throw new Error('Bu Dilmanc dataset faylı deyil');
  validateVocab(j.vocab);
  const classes = new Set(classesOf(j.vocab)), ids = new Set();
  for (const s of j.samples) {
    if (!s || typeof s.id !== 'string' || !s.id || ids.has(s.id) || !classes.has(s.sign) || typeof s.signer !== 'string' || !s.signer.trim() || !Array.isArray(s.data) || s.data.length !== T * D || !s.data.every((v) => typeof v === 'number' && Number.isFinite(v))) throw new Error('Datasetdə səhv, təkrarlanan və ya uyğun olmayan nümunə var.');
    ids.add(s.id);
  }
  return { vocab: j.vocab, samples: j.samples.map((x) => ({ ...x, data: Float32Array.from(x.data) })) };
}
