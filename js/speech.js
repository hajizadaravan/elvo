// Speaking Azerbaijani and listening to it, with what the browser has.
// Best voices: Microsoft Edge ships "Azerbaijani (Banu / Babek) Online (Natural)". Chrome falls back to Turkish.
const VOICE_KEY = 'dilmanc.voice';

export function voices() {
  const all = speechSynthesis.getVoices();
  const rank = (v) => (v.lang.toLowerCase().startsWith('az') ? 0 : v.lang.toLowerCase().startsWith('tr') ? 1 : 2);
  return all.filter((v) => rank(v) < 2).sort((a, b) => rank(a) - rank(b) || Number(/natural|online/i.test(b.name)) - Number(/natural|online/i.test(a.name)));
}

export function currentVoice() {
  const list = voices();
  const saved = localStorage.getItem(VOICE_KEY);
  return list.find((v) => v.name === saved) || list[0] || null;
}

export function setVoice(name) { localStorage.setItem(VOICE_KEY, name); }

export function speak(text) {
  if (!text || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  const v = currentVoice();
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'az-AZ';
  u.rate = 0.95;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

export function onVoices(fn) { if ('speechSynthesis' in window) { fn(); speechSynthesis.addEventListener('voiceschanged', fn); } }

// Hearing person → text on screen, so the deaf person can read the answer.
export function listener({ onText, onEnd }) {
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
  r.onerror = () => onEnd?.();
  return r;
}
