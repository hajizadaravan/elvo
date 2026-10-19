import test from 'node:test';
import assert from 'node:assert/strict';
import * as speech from '../js/speech.js';

const settings = new Map();
const nativeFetch = globalThis.fetch;
globalThis.localStorage = { getItem: (k) => settings.get(k) ?? null, setItem: (k, v) => settings.set(k, v) };

test('only the two Azerbaijani Azure voices are offered', () => {
  assert.deepEqual(speech.voices().map((v) => v.lang), ['az-AZ', 'az-AZ']);
  assert.equal(speech.currentVoice().name, 'az-AZ-BanuNeural');
  speech.setVoice('az-AZ-BabekNeural');
  assert.equal(speech.currentVoice().name, 'az-AZ-BabekNeural');
  assert.throws(() => speech.setVoice('tr-TR-AhmetNeural'));
});

test('TTS uses the same-origin server; request includes text and chosen voice only', async () => {
  let sent;
  globalThis.fetch = async (url, options) => {
    sent = { url, options };
    return new Response(new Blob(['mock-audio']), { headers: { 'Content-Type': 'audio/mpeg' } });
  };
  await speech.prepare('Başım ağrıyır.');
  assert.equal(sent.url, '/api/speech/synthesize');
  assert.equal(sent.options.headers['X-Dilmanc-Request'], '1');
  assert.deepEqual(JSON.parse(sent.options.body), { text: 'Başım ağrıyır.', voice: 'az-AZ-BabekNeural' });
  assert.equal(Object.keys(sent.options.headers).length, 2);
});

test('server configuration and connection errors are shown without browser-voice fallback', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Azure qurulmayıb' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(() => speech.prepare('Salam!'), /Azure qurulmayıb/);
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(() => speech.prepare('Salam!'), /Səs serverinə bağlantı yoxdur/);
  assert.equal((await speech.status()).reachable, false);
});

test('overlapping playback cancels the old audio and releases object URLs', async () => {
  globalThis.fetch = async () => new Response(new Blob(['mock-audio']), { headers: { 'Content-Type': 'audio/mpeg' } });
  const players = [];
  globalThis.Audio = class {
    constructor(url) { this.url = url; this.paused = false; players.push(this); }
    play() { return Promise.resolve(); }
    pause() { this.paused = true; }
  };
  const first = speech.speak('Salam!');
  while (!players.length) await new Promise((r) => setTimeout(r, 0));
  const second = speech.speak('Təşəkkür edirəm!');
  assert.equal(await first, false);
  while (players.length < 2) await new Promise((r) => setTimeout(r, 0));
  assert.equal(players[0].paused, true);
  players[1].onended();
  assert.equal(await second, true);
  assert.equal(players[1].paused, true);
  await assert.rejects(() => nativeFetch(players[0].url));
});
