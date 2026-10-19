// Azerbaijani Neural TTS through the same-origin local server. No Azure key in the browser.
const VOICE_KEY = 'dilmanc.azure.voice';
const AZURE_VOICES = [
  { name: 'az-AZ-BanuNeural', label: 'Banu · qadın', lang: 'az-AZ' },
  { name: 'az-AZ-BabekNeural', label: 'Babek · kişi', lang: 'az-AZ' },
];
// One reused player: browsers that unlock audio per element keep it unlocked after the first gesture.
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
const MEMORY_LIMIT = 24;
const memory = new Map();
let active = null, player = null, audioURL = null, playbackDone = null, unlocked = false;

export function voices() {
  return AZURE_VOICES.map((v) => ({ ...v }));
}

export function currentVoice() {
  const list = voices();
  const saved = localStorage.getItem(VOICE_KEY);
  return list.find((v) => v.name === saved) || list[0] || null;
}

export function setVoice(name) {
  if (!AZURE_VOICES.some((v) => v.name === name)) throw new Error('Azərbaycan səsi seçin.');
  localStorage.setItem(VOICE_KEY, name);
}

export async function status() {
  try {
    const response = await fetch('/api/speech/status', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result.provider !== 'azure') throw new Error();
    return { reachable: true, ...result };
  } catch { return { reachable: false, configured: false, cached: 0 }; }
}

export async function prepare(text, { signal, voice = currentVoice().name } = {}) {
  let response;
  try {
    response = await fetch('/api/speech/synthesize', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dilmanc-Request': '1' },
      body: JSON.stringify({ text, voice }), signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('Səs serverinə bağlantı yoxdur. python3 server.py ilə başladın.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || 'Azure səsi alınmadı. python3 server.py ilə başladın və Azure ayarlarını yoxlayın.');
    if (typeof body.key === 'string') { error.key = body.key; error.params = body.params && typeof body.params === 'object' ? body.params : {}; }
    throw error;
  }
  if (!response.headers.get('Content-Type')?.startsWith('audio/')) throw new Error('Server audio qaytarmadı.');
  return response.blob();
}

function getPlayer() {
  player ??= new Audio();
  return player;
}

// Call from a user gesture so later automatic playback is allowed.
export function unlockAudio() {
  if (unlocked || audioURL) return;
  unlocked = true;
  const p = getPlayer();
  p.src = SILENT;
  p.play().then(() => { if (p.src === SILENT) p.pause(); }).catch((e) => { if (e?.name === 'NotAllowedError') unlocked = false; });
}

// Fetch once per voice and text; repeated and prefetched phrases play without another request.
function audioFor(text, voice = currentVoice().name) {
  const key = `${voice}\n${text}`;
  let pending = memory.get(key);
  if (pending) { memory.delete(key); memory.set(key, pending); return pending; }
  pending = prepare(text, { voice });
  memory.set(key, pending);
  pending.catch(() => { if (memory.get(key) === pending) memory.delete(key); });
  while (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value);
  return pending;
}

export function prefetch(text) {
  if (text?.trim()) audioFor(text.trim()).catch(() => {});
}

// Fill the server cache in the background without holding audio in memory.
// A newer warm-up, such as after a voice change, stops the previous one.
let warmRun = 0;
export async function warm(texts, voice = currentVoice().name) {
  const run = ++warmRun;
  for (const text of new Set(texts.map((x) => x?.trim()).filter(Boolean))) {
    if (run !== warmRun || voice !== currentVoice().name) return;
    try { await prepare(text, { voice }); } catch { return; }
  }
}

export function stop() {
  active = null;
  if (player) { player.onended = null; player.onerror = null; player.pause(); }
  if (audioURL) { URL.revokeObjectURL(audioURL); audioURL = null; }
  playbackDone?.(); playbackDone = null;
}

export async function speak(text) {
  if (!text?.trim()) return false;
  stop();
  const token = {}; active = token;
  try {
    const blob = await audioFor(text.trim());
    if (active !== token) return false;
    const p = getPlayer(), url = URL.createObjectURL(blob);
    audioURL = url; p.src = url;
    await new Promise((resolve, reject) => {
      playbackDone = resolve;
      p.onended = resolve;
      p.onerror = () => reject(new Error('Audio səslənmədi. Səsləndir düyməsini yenidən basın.'));
      p.play().catch((e) => reject(new Error(e?.name === 'NotAllowedError'
        ? 'Brauzer səsi blokladı. Səsləndir və ya Sına düyməsini basın.'
        : 'Audio səslənmədi. Səsləndir düyməsini yenidən basın.')));
    });
    return active === token;
  } catch (e) {
    if (active !== token) return false;
    throw e;
  } finally { if (active === token) stop(); }
}

export function onVoices(fn) { fn(); }

// Hearing person → text on screen, so the deaf person can read the answer.
export function listener({ onText, onEnd, onError }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = 'az-AZ'; r.continuous = true; r.interimResults = true;
  r.onresult = (e) => {
    let final = '', interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t; else interim += t;
    }
    onText(final, interim);
  };
  r.onend = () => onEnd?.();
  r.onerror = (e) => { onError?.(e.error); };
  return r;
}
