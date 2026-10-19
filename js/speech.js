// Azerbaijani Neural TTS through the same-origin local server. No Azure key in the browser.
const VOICE_KEY = 'dilmanc.azure.voice';
const AZURE_VOICES = [
  { name: 'az-AZ-BanuNeural', label: 'Banu · qadın', lang: 'az-AZ' },
  { name: 'az-AZ-BabekNeural', label: 'Babek · kişi', lang: 'az-AZ' },
];
let activeController = null, audio = null, audioURL = null, playbackDone = null;

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
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Azure səsi alınmadı. python3 server.py ilə başladın və Azure ayarlarını yoxlayın.');
  }
  if (!response.headers.get('Content-Type')?.startsWith('audio/')) throw new Error('Server audio qaytarmadı.');
  return response.blob();
}

export function stop() {
  activeController?.abort(); activeController = null;
  if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio = null; }
  if (audioURL) { URL.revokeObjectURL(audioURL); audioURL = null; }
  playbackDone?.(); playbackDone = null;
}

export async function speak(text) {
  if (!text?.trim()) return false;
  stop();
  const controller = new AbortController(); activeController = controller;
  try {
    const blob = await prepare(text, { signal: controller.signal });
    if (activeController !== controller) return false;
    const url = URL.createObjectURL(blob), player = new Audio(url);
    audioURL = url; audio = player;
    await new Promise((resolve, reject) => {
      playbackDone = resolve;
      player.onended = resolve;
      player.onerror = () => reject(new Error('Audio səslənmədi. Səsləndir düyməsini yenidən basın.'));
      player.play().catch(() => reject(new Error('Brauzer səsi blokladı. Səsləndir və ya Sına düyməsini basın.')));
    });
    return activeController === controller;
  } catch (e) {
    if (e.name === 'AbortError') return false;
    throw e;
  } finally { if (activeController === controller) stop(); }
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
