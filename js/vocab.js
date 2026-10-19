// The vocabulary: what each sign is called and what Dilmanc says out loud.
// Sign ids are ASCII and never change once samples exist; the word and the spoken phrase can be edited.
// IMPORTANT: confirm every sign with a fluent Azerbaijani Sign Language signer before recording.

export const FON = { id: '_fon', word: 'fon', say: '', note: 'Əllər aşağı, adi hərəkətlər, heç bir işarə yoxdur' };

export const DEFAULT_SIGNS = [
  { id: 'salam', word: 'salam', say: 'Salam!' },
  { id: 'hekim', word: 'həkim', say: 'Həkim lazımdır.' },
  { id: 'agri', word: 'ağrı', say: 'Ağrım var.' },
  { id: 'bas', word: 'baş', say: 'Baş.' },
  { id: 'derman', word: 'dərman', say: 'Dərman lazımdır.' },
  { id: 'tecili', word: 'təcili', say: 'Təcilidir!' },
  { id: 'harada', word: 'harada', say: 'Harada?' },
  { id: 'tesekkur', word: 'təşəkkür', say: 'Təşəkkür edirəm!' },
];

// A run of signs that together mean more than their parts. The longest match wins.
export const DEFAULT_RULES = [
  { seq: ['bas', 'agri', 'derman'], say: 'Başım ağrıyır, dərman lazımdır.' },
  { seq: ['bas', 'agri'], say: 'Başım ağrıyır.' },
  { seq: ['tecili', 'hekim'], say: 'Təcili həkim lazımdır!' },
  { seq: ['hekim', 'harada'], say: 'Həkim haradadır?' },
  { seq: ['derman', 'harada'], say: 'Dərmanı haradan ala bilərəm?' },
  { seq: ['agri', 'tecili'], say: 'Çox ağrıyır, təcilidir!' },
];

const KEY = 'dilmanc.vocab.v1';

export function loadVocab() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && Array.isArray(v.signs) && Array.isArray(v.rules)) return v;
  } catch {}
  return { signs: structuredClone(DEFAULT_SIGNS), rules: structuredClone(DEFAULT_RULES) };
}

export function saveVocab(v) { localStorage.setItem(KEY, JSON.stringify(v)); }

export function resetVocab() { localStorage.removeItem(KEY); return loadVocab(); }

// Every class the model learns: the signs plus the background class.
export const classesOf = (vocab) => [...vocab.signs.map((s) => s.id), FON.id];

export function signById(vocab, id) { return id === FON.id ? FON : vocab.signs.find((s) => s.id === id); }

export function slug(word) {
  const map = { ə: 'e', ı: 'i', ö: 'o', ü: 'u', ğ: 'g', ş: 's', ç: 'c', Ə: 'e', I: 'i', İ: 'i', Ö: 'o', Ü: 'u', Ğ: 'g', Ş: 's', Ç: 'c' };
  return word.trim().split('').map((c) => map[c] ?? c).join('').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'isare';
}

// Turn a run of recognised sign ids into what is said: rules first (longest match), otherwise each sign's phrase.
export function compose(ids, vocab) {
  const out = [];
  const rules = [...vocab.rules].sort((a, b) => b.seq.length - a.seq.length);
  let i = 0;
  while (i < ids.length) {
    const rule = rules.find((r) => r.seq.length && r.seq.every((s, k) => ids[i + k] === s));
    if (rule) { out.push(rule.say); i += rule.seq.length; continue; }
    const s = signById(vocab, ids[i]);
    if (s && s.say) out.push(s.say);
    i += 1;
  }
  return out.join(' ');
}
