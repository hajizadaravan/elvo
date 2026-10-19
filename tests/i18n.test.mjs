import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
};
const nav = { setAttribute(name, value) { this[name] = value; } };
const nodes = [{ dataset: { i18n: '' }, textContent: 'Canlı tərcümə' }];
globalThis.document = {
  documentElement: {},
  querySelectorAll: () => nodes,
  querySelector: () => nav,
};
const { locale, t, ui, setLanguage, applyTranslations } = await import('../js/i18n.js');

test('AZ / EN switching translates static and active messages without changing user data', () => {
  assert.equal(locale(), 'az');
  applyTranslations();
  assert.equal(nodes[0].textContent, 'Canlı tərcümə');
  const log = { dataset: {}, textContent: '' };
  nodes.push(log);
  ui(log, '“{word}” · {n} / {total} · hazırlaşın', { word: 'baş', n: 1, total: 10 });
  setLanguage('en');
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(nodes[0].textContent, 'Live translation');
  assert.equal(log.textContent, '“baş” · 1 / 10 · get ready');
  assert.equal(nav['aria-label'], 'Navigation');
  assert.equal(storage.get('dilmanc.language'), 'en');
  assert.equal(t('Sil'), 'Delete');
  assert.equal(t('unmapped'), 'unmapped');
  setLanguage('az');
  assert.equal(nodes[0].textContent, 'Canlı tərcümə');
  assert.equal(log.textContent, '“baş” · 1 / 10 · hazırlaşın');
  assert.equal(nav['aria-label'], 'Bölmələr');
});

test('all static labels and literal runtime messages have English translations', async () => {
  const main = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const keys = [
    ...[...main.matchAll(/\b(?:t|toast|log|recLog|stopRecording)\('([^']+)'/g)].map((m) => m[1]),
    ...[...html.matchAll(/data-i18n>([^<]+)</g)].map((m) => m[1].trim()),
  ];
  setLanguage('en');
  for (const key of new Set(keys)) {
    if (/[əğıöüçşƏĞİÖÜÇŞ]/.test(key)) assert.notEqual(t(key), key, `Missing English translation: ${key}`);
  }
  setLanguage('az');
});
