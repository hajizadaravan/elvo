import test from 'node:test';
import assert from 'node:assert/strict';
import { T, D, stack } from '../js/features.js';
import { RecognitionGate, resampleTimed } from '../js/temporal.js';
import { fromJSON, toJSON } from '../js/store.js';
import { DEFAULT_SIGNS, DEFAULT_RULES, compose, validateVocab } from '../js/vocab.js';

const vocab = { signs: structuredClone(DEFAULT_SIGNS), rules: structuredClone(DEFAULT_RULES) };
const frame = (ts) => { const f = new Float32Array(D); f[0] = ts / 1000; f[2] = 1; f[3] = ts / 500; return { ts, f }; };
const series = (fps) => Array.from({ length: fps + 1 }, (_, i) => frame(i * 1000 / fps));

test('15 FPS and 60 FPS capture the same one-second motion', () => {
  const slow = resampleTimed(series(15), 0), fast = resampleTimed(series(60), 0);
  assert.equal(slow.length, T); assert.equal(stack(slow).length, T * D);
  slow.forEach((f, i) => f.forEach((v, d) => assert.ok(Math.abs(v - fast[i][d]) < 1e-5)));
});
test('incomplete windows and long camera stalls are rejected', () => {
  assert.equal(resampleTimed(series(30).slice(0, -1), 0), null);
  assert.equal(resampleTimed(series(30).filter((x) => x.ts < 200 || x.ts > 600), 0), null);
});
test('hand presence remains categorical during resampling', () => {
  const frames = series(15); frames.forEach((x, i) => x.f[2] = i < 8 ? 0 : 1);
  resampleTimed(frames, 0).forEach((f) => assert.ok(f[2] === 0 || f[2] === 1));
});
const observation = (ts, id = 'salam', extra = {}) => ({ id, score: 0.94, runnerUp: 0.03, threshold: 0.8, ts, ...extra });
test('a brief high-confidence spike cannot produce a word', () => {
  const g = new RecognitionGate();
  assert.equal(g.update(observation(0)), false);
  assert.equal(g.update(observation(100)), false);
  assert.equal(g.update(observation(200, null, { score: 0.2 })), false);
  assert.equal(g.update(observation(300)), false);
});
test('stable signs commit once; same-sign repeats require neutral release', () => {
  const g = new RecognitionGate();
  const commits = [0, 120, 240, 360, 900, 1100].filter((ts) => g.update(observation(ts)));
  assert.deepEqual(commits, [240]);
  g.rest(1200); g.rest(1500);
  assert.equal(g.update(observation(1600)), false);
  assert.equal(g.update(observation(1720)), false);
  assert.equal(g.update(observation(1840)), true);
});
test('ambiguous top two classes and interrupted tracking cannot commit', () => {
  const g = new RecognitionGate();
  for (let ts = 0; ts < 1000; ts += 120) assert.equal(g.update(observation(ts, 'salam', { score: 0.85, runnerUp: 0.76 })), false);
  g.reset();
  assert.equal(g.update(observation(0)), false);
  assert.equal(g.update(observation(400)), false);
  assert.equal(g.update(observation(520)), false);
  assert.equal(g.update(observation(640)), true);
});
test('dataset round trip preserves labelled feature arrays', () => {
  const s = { id: 'one', sign: 'salam', signer: 'Qasim', data: new Float32Array(T * D), at: new Date().toISOString() };
  const result = fromJSON(toJSON([s], vocab));
  assert.ok(result.samples[0].data instanceof Float32Array);
  assert.equal(result.samples[0].data.length, T * D);
  assert.equal(result.samples[0].signer, 'Qasim');
});
test('bad dimensions, nonnumeric data, unknown labels and duplicate IDs are rejected', () => {
  const s = { id: 'one', sign: 'salam', signer: 'Qasim', data: Array(T * D).fill(0) };
  const wrap = (samples) => JSON.stringify({ format: 'dilmanc-dataset', version: 1, vocab, samples });
  assert.throws(() => fromJSON(wrap([{ ...s, data: [0] }])));
  assert.throws(() => fromJSON(wrap([{ ...s, data: [...s.data.slice(0, -1), '0'] }])));
  assert.throws(() => fromJSON(wrap([{ ...s, sign: 'unknown' }])));
  assert.throws(() => fromJSON(wrap([s, s])));
  assert.throws(() => validateVocab({ ...vocab, signs: [{ id: '_fon', word: 'x', say: 'x' }] }));
});
test('phrase composition keeps the longest matching rule', () => {
  assert.equal(compose(['salam', 'bas', 'agri', 'derman'], vocab), 'Salam! Başım ağrıyır, dərman lazımdır.');
});

test('the last sign is still evaluated briefly after the hands leave', async () => {
  const { handsRecent, HAND_TAIL_MS, MIN_HAND_SHARE } = await import('../js/temporal.js');
  assert.equal(handsRecent(1000 + HAND_TAIL_MS, 1000), true);
  assert.equal(handsRecent(1001 + HAND_TAIL_MS, 1000), false);
  assert.ok(MIN_HAND_SHARE >= 0.5);
});
