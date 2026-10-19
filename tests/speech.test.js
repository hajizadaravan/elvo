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

class FakePlayer {
  static all = [];
  static mode = 'ok';
  constructor() { this.paused = true; this.sources = []; FakePlayer.all.push(this); }
  set src(value) { this.current = value; this.sources.push(value); }
  get src() { return this.current; }
  play() {
    if (FakePlayer.mode === 'blocked') return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    if (FakePlayer.mode === 'broken') return Promise.reject(Object.assign(new Error('decode'), { name: 'NotSupportedError' }));
    this.paused = false; return Promise.resolve();
  }
  pause() { this.paused = true; }
}
globalThis.Audio = FakePlayer;
const tick = () => new Promise((r) => setTimeout(r, 0));
const until = async (fn) => { while (!fn()) await tick(); };

test('overlapping playback reuses one player, cancels old audio and releases object URLs', async () => {
  globalThis.fetch = async () => new Response(new Blob(['mock-audio']), { headers: { 'Content-Type': 'audio/mpeg' } });
  const first = speech.speak('Salam!');
  await until(() => FakePlayer.all[0]?.sources.length === 1);
  const player = FakePlayer.all[0], firstURL = player.src;
  const second = speech.speak('Təşəkkür edirəm!');
  assert.equal(await first, false);
  assert.equal(player.paused, true);
  await until(() => player.sources.length === 2);
  assert.equal(FakePlayer.all.length, 1);
  player.onended();
  assert.equal(await second, true);
  assert.equal(player.paused, true);
  await assert.rejects(() => nativeFetch(firstURL));
});

test('a prefetched phrase plays without a second request', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; await tick(); return new Response(new Blob(['mock-audio']), { headers: { 'Content-Type': 'audio/mpeg' } }); };
  speech.prefetch('Başım ağrıyır, həkim lazımdır.');
  const playing = speech.speak('Başım ağrıyır, həkim lazımdır.');
  const player = FakePlayer.all[0];
  const before = player.sources.length;
  await until(() => player.sources.length > before);
  player.onended();
  assert.equal(await playing, true);
  assert.equal(calls, 1);
});

test('failed requests are not cached and blocked playback is reported accurately', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ error: 'Azure qurulmayıb' }), { status: 503, headers: { 'Content-Type': 'application/json' } }); };
  await assert.rejects(() => speech.speak('Yeni cümlə.'), /Azure qurulmayıb/);
  await assert.rejects(() => speech.speak('Yeni cümlə.'), /Azure qurulmayıb/);
  assert.equal(calls, 2);
  globalThis.fetch = async () => new Response(new Blob(['mock-audio']), { headers: { 'Content-Type': 'audio/mpeg' } });
  FakePlayer.mode = 'blocked';
  await assert.rejects(() => speech.speak('Bloklanan.'), /Brauzer səsi blokladı/);
  FakePlayer.mode = 'broken';
  await assert.rejects(() => speech.speak('Pozuq.'), /Audio səslənmədi/);
  FakePlayer.mode = 'ok';
});

test('warming caches phrases sequentially and stops at the first failure', async () => {
  const sent = [];
  globalThis.fetch = async (url, options) => {
    sent.push(JSON.parse(options.body).text);
    if (sent.length === 2) return new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } });
    return new Response(new Blob(['mock-audio']), { headers: { 'Content-Type': 'audio/mpeg' } });
  };
  await speech.warm(['Salam!', ' Salam! ', '', 'Su.', 'Çörək.']);
  assert.deepEqual(sent, ['Salam!', 'Su.']);
});

test('a newer warm-up or voice change stops the previous warm-up', async () => {
  const sent = [];
  globalThis.fetch = async (url, options) => { sent.push(JSON.parse(options.body)); await tick(); return new Response(new Blob(['mock-audio']), { headers: { 'Content-Type': 'audio/mpeg' } }); };
  speech.setVoice('az-AZ-BanuNeural');
  const old = speech.warm(['Bir.', 'İki.', 'Üç.']);
  await until(() => sent.length === 1);
  speech.setVoice('az-AZ-BabekNeural');
  await Promise.all([old, speech.warm(['Dörd.'])]);
  assert.deepEqual(sent.map((x) => [x.text, x.voice]), [['Bir.', 'az-AZ-BanuNeural'], ['Dörd.', 'az-AZ-BabekNeural']]);
});
