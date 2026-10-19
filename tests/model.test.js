import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { T, D } from '../js/features.js';
import { DEFAULT_SIGNS, DEFAULT_RULES } from '../js/vocab.js';
import * as M from '../js/model.js';

const require = createRequire(import.meta.url);
globalThis.tf = require('./load-tf.cjs')();
const classes = ['salam', '_fon'];
const vocab = { signs: structuredClone(DEFAULT_SIGNS), rules: structuredClone(DEFAULT_RULES) };
const sample = (sign, signer, value = 0) => ({ sign, signer, data: new Float32Array(T * D).fill(value) });

test('signer holdout refuses missing classes in either partition', () => {
  assert.throws(() => M.signerSplit([sample('salam', 'a'), sample('_fon', 'b')], classes, 'a'));
  assert.throws(() => M.signerSplit([sample('salam', 'a'), sample('salam', 'b'), sample('_fon', 'b')], classes, 'a'));
  const data = ['a', 'b'].flatMap((signer) => classes.map((c) => sample(c, signer)));
  const split = M.signerSplit(data, classes, 'a');
  assert.ok(split.train.every((s) => s.signer !== 'a'));
  assert.ok(split.val.every((s) => s.signer === 'a'));
});
test('model bundle round trip preserves class order, vocabulary and predictions', async () => {
  const model = M.build(classes.length);
  let imported;
  try {
    const x = sample('salam', 'a', 0.1).data;
    const before = M.predict(model, x);
    const text = await M.exportBundle(model, { classes, accuracy: null }, vocab);
    imported = await M.importBundle(text);
    assert.deepEqual(imported.meta.classes, classes);
    assert.deepEqual(imported.vocab, vocab);
    const after = M.predict(imported.model, x);
    after.forEach((p, i) => assert.ok(Math.abs(p - before[i]) < 1e-6));
    const bad = JSON.parse(text); bad.meta.classes.reverse(); bad.meta.classes[0] = 'unknown';
    await assert.rejects(() => M.importBundle(JSON.stringify(bad)));
    const wrong = JSON.parse(text); wrong.features.D = 1;
    await assert.rejects(() => M.importBundle(JSON.stringify(wrong)));
  } finally { model.dispose(); imported?.model.dispose(); }
});
test('evaluation does not leak label-index tensors and includes confusion counts', () => {
  const model = M.build(2);
  try {
    const data = [sample('salam', 'a', 0.1), sample('_fon', 'a')];
    const before = tf.memory().numTensors;
    const result = M.evaluate(model, data, classes);
    for (let i = 0; i < 5; i++) M.evaluate(model, data, classes);
    assert.equal(tf.memory().numTensors, before);
    assert.equal(result.confusion.flat().reduce((a, b) => a + b, 0), data.length);
    assert.ok(result.balancedAccuracy >= 0 && result.balancedAccuracy <= 1);
  } finally { model.dispose(); }
});
test('training runs a real epoch and produces valid probabilities (synthetic test data only)', async () => {
  const train = classes.flatMap((c, i) => Array.from({ length: 2 }, () => sample(c, 'a', i * 0.1)));
  const val = classes.map((c, i) => sample(c, 'b', i * 0.1));
  const r = await M.train({ train, val, classes, epochs: 1, copies: 0 });
  try {
    assert.equal(r.history.acc.length, 1);
    const p = M.predict(r.model, train[0].data);
    assert.equal(p.length, classes.length);
    assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-5);
  } finally { r.model.dispose(); }
});
test('imported model metadata is typed before rendering', async () => {
  const model = M.build(classes.length);
  let imported;
  try {
    const meta = { classes, accuracy: 0.5, right: 1, tested: 2, holdout: 'a', per: { salam: { right: 1, total: 1 }, _fon: { right: 0, total: 1 } }, confusion: [[1, 0], [1, 0]], history: { acc: [0.5], valAcc: [0.5] }, extra: '<img src=x onerror=alert(1)>' };
    const text = await M.exportBundle(model, meta, vocab);
    imported = await M.importBundle(text);
    assert.equal(imported.meta.extra, undefined);
    assert.deepEqual(imported.meta.confusion, [[1, 0], [1, 0]]);
    for (const patch of [
      { confusion: [['<img src=x onerror=alert(1)>', 0], [0, 1]] },
      { per: { salam: { right: '<b>', total: 1 } } },
      { history: { acc: ['<svg onload=alert(1)>'], valAcc: [0.5] } },
      { accuracy: '<script>' },
    ]) {
      const bad = JSON.parse(text); Object.assign(bad.meta, patch);
      await assert.rejects(() => M.importBundle(JSON.stringify(bad)));
    }
  } finally { model.dispose(); imported?.model.dispose(); }
});
