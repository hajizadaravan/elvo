// UI language is independent of the sign vocabulary and spoken phrases.
const KEY = 'dilmanc.language';
let language = localStorage.getItem(KEY) === 'en' ? 'en' : 'az';

export const locale = () => language;

const en = {
  'Canlı tərcümə': 'Live translation',
  'Nümunə yazma': 'Record samples',
  'Model': 'Model',
  'Lüğət və ayarlar': 'Vocabulary & settings',
  'Menyu': 'Menu',
  'Bölmələr': 'Navigation',
  'Avtomatik səsləndir': 'Auto-speak',
  'Səhnə rejimi': 'Present',
  'Səhnədən çıx': 'Exit presentation',
  'İşarə': 'Sign',
  'İşarələr': 'Signs',
  'Cümlə': 'Phrase',
  'Geri al': 'Undo',
  'Təmizlə': 'Clear',
  'Səsləndir': 'Speak',
  'Cavab': 'Reply',
  'Danış': 'Start listening',
  'Dayandır': 'Stop',
  'Nümunə': 'Samples',
  'İmzalayan': 'Signer',
  'Nümunə sayı': 'Sample count',
  'Yaz': 'Record',
  'Boşluq': 'Space',
  'Son nümunələr': 'Recent samples',
  'Əl görünən kadr': 'Frames with hands',
  'Vaxt': 'Time',
  'Yoxlama üsulu': 'Validation method',
  'Epox': 'Epochs',
  'Öyrət': 'Train',
  'Dəqiqlik': 'Accuracy',
  'Hər işarə üzrə dəqiqlik': 'Accuracy by sign',
  'Standart lüğəti qaytar': 'Reset vocabulary',
  'Söz': 'Word',
  'Səsləndirilən mətn': 'Spoken text',
  'Yeni söz': 'New word',
  'Əlavə et': 'Add',
  'Birləşmələr': 'Combinations',
  'Ardıcıllıq': 'Sequence',
  'Səs və tanıma': 'Voice & recognition',
  'Səs': 'Voice',
  'Sına': 'Test',
  'Əminlik həddi': 'Confidence threshold',
  'Məlumat': 'Data',
  'Dataseti yüklə': 'Export dataset',
  'Dataset idxal et': 'Import dataset',
  'Modeli yüklə': 'Download model',
  'Hamısını sil': 'Delete all data',
  'Sil': 'Delete',
  'Fon': 'Background',
  'İşarə olmayan əl hərəkətləri': 'Non-signing hand movements',
  'İşarə gözlənilir…': 'Waiting for a sign…',
  'Əllər görünmür.': 'No hands detected.',
  'Əminlik {p}': '{p} confidence',
  'Həddən aşağı: {p} / {threshold}': 'Below threshold: {p} / {threshold}',
  'Model bölməsində modeli öyrədin.': 'Train a model in the Model tab.',
  'Lüğət dəyişib. Modeli yenidən öyrədin.': 'Vocabulary changed. Retrain the model.',
  'Modellər yüklənir…': 'Loading models…',
  'Kameraya icazə verin.': 'Allow camera access.',
  'Kamera açılmadı.': 'Could not open the camera.',
  'Kamera söndürülüb.': 'Camera disabled.',
  'Yenidən cəhd et': 'Retry',
  'Yazma dayandırıldı.': 'Recording stopped.',
  'Bu brauzer danışığı tanımır. Chrome və ya Edge istifadə edin.': 'Speech recognition is unavailable. Use Chrome or Edge.',
  'Mikrofon açılmadı.': 'Could not start the microphone.',
  'Dinləyirəm…': 'Listening…',
  '{done} / {total} sinifdə ən azı {goal} nümunə var.': '{done} / {total} classes have at least {goal} samples.',
  'Son {n} / {total} nümunə': 'Latest {n} of {total} samples',
  'Nümunə yoxdur.': 'No samples yet.',
  'Əvvəl kameranı açın.': 'Open the camera first.',
  'İmzalayanın adını yazın.': 'Enter the signer’s name.',
  '“{word}” · {n} / {total} · hazırlaşın': '“{word}” · {n} / {total} · get ready',
  'Yazılır · {n} / {total}': 'Recording · {n} / {total}',
  '{kept} saxlandı, {rejected} qəbul edilmədi.': '{kept} saved, {rejected} rejected.',
  'Saxlandı.': 'Saved.',
  'Əl görünmədi. Nümunə qəbul edilmədi.': 'No hands detected. Sample rejected.',
  'Təsadüfi 20%': 'Random 20%',
  'Ayrılmış imzalayan: {name}': 'Held-out signer: {name}',
  '{n} sinif': '{n} classes',
  'nümunəsi olan': 'with samples',
  'yoxdur': 'none',
  'Yoxlama dəqiqliyi': 'Validation accuracy',
  '{name}, ayrılmış': '{name}, held out',
  'Təsadüfi 20% · {right} / {total}': 'Random 20% · {right} / {total}',
  'Model yoxdur': 'No model',
  'Öyrətmə': 'Training',
  'Yoxlama': 'Validation',
  'Ayrılmış: {name}': 'Held out: {name}',
  'Hər işarə üzrə: {name}': 'Accuracy by sign: {name}',
  'Yoxlama nümunəsi yoxdur.': 'No validation samples.',
  'Ən azı bir işarə və fon nümunələri lazımdır.': 'Record at least one sign and background samples.',
  '5-dən az nümunə: {words}': 'Fewer than 5 samples: {words}',
  'Epox {n} / {total} · yoxlama {p}': 'Epoch {n} / {total} · validation {p}',
  'Ən azı iki imzalayanın nümunələri lazımdır.': 'Samples from at least two signers are required.',
  '1/2 · {name} ayrılıb · epox {n} / {total} · {p}': '1/2 · {name} held out · epoch {n} / {total} · {p}',
  '2/2 · {samples} nümunə · epox {n} / {total}': '2/2 · {samples} samples · epoch {n} / {total}',
  '{seconds} san · {samples} nümunə · yoxlama {p}': '{seconds}s · {samples} samples · validation {p}',
  'Model saxlandı.': 'Model saved.',
  'Xəta: {error}': 'Error: {error}',
  'Öyrətmə alınmadı.': 'Training failed.',
  '“{word}” və {n} nümunəsi silinsin?': 'Delete “{word}” and its {n} samples?',
  'Birləşmə yoxdur.': 'No combinations.',
  'Uyğun səs tapılmadı': 'No compatible voice found',
  '“{word}” əlavə olundu.': 'Added “{word}”.',
  'Ən azı iki lüğət sözünü + ilə ayırın.': 'Separate at least two vocabulary words with +.',
  'Standart lüğət qaytarılsın? Nümunələr saxlanılır.': 'Reset to the default vocabulary? Samples will be kept.',
  '{added} əlavə olundu, {updated} yeniləndi.': '{added} added, {updated} updated.',
  'İdxal alınmadı: {error}': 'Import failed: {error}',
  'Bütün nümunələr və model silinsin? Bu əməliyyatı geri qaytarmaq olmur.': 'Delete all samples and the model? This cannot be undone.',
  'Dataset faylı yanlışdır.': 'Invalid dataset file.',
};

export function t(key, params = {}) {
  const template = language === 'en' ? (en[key] ?? key) : key;
  return template.replace(/\{(\w+)\}/g, (match, name) => String(params[name] ?? match));
}

// Store keys, not translated text, so active logs and errors can switch language too.
export function ui(element, key, params = {}) {
  element.dataset.i18n = key;
  element.dataset.i18nParams = JSON.stringify(params);
  element.textContent = t(key, params);
}

export function applyTranslations() {
  document.documentElement.lang = language;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    if (!el.dataset.i18n) el.dataset.i18n = el.textContent.trim();
    el.textContent = t(el.dataset.i18n, JSON.parse(el.dataset.i18nParams || '{}'));
  });
  document.querySelector('nav').setAttribute('aria-label', t('Bölmələr'));
}

export function setLanguage(value) {
  language = value === 'en' ? 'en' : 'az';
  localStorage.setItem(KEY, language);
  applyTranslations();
}
