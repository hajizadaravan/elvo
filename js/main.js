import { T, stack } from './features.js';
import { loadVocab, saveVocab, resetVocab, classesOf, signById, compose, slug, FON } from './vocab.js';
import { allSamples, putSample, putMany, deleteSample, clearSamples, newId, toJSON, fromJSON } from './store.js';
import { Vision } from './vision.js';
import * as speech from './speech.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const pct = (v) => new Intl.NumberFormat('az', { style: 'percent', maximumFractionDigits: 0 }).format(v);
const int = (v) => new Intl.NumberFormat('az').format(v);
const clock = (iso) => new Date(iso).toLocaleTimeString('az', { hour: '2-digit', minute: '2-digit' });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let M = null;                       // model.js, imported after TF.js loads
const S = {
  view: 'live', vocab: loadVocab(), samples: [], model: null, meta: null,
  selected: null, rec: null, threshold: Number(localStorage.getItem('dilmanc.threshold') || 80) / 100,
  live: { hist: [], last: null, lastAt: 0, n: 0, pending: [], said: [], timer: null },
  training: false,
};
const vision = new Vision();

/* ---------------- boot ---------------- */
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}

async function boot() {
  buildCam();
  bindNav(); bindLive(); bindRecord(); bindModel(); bindWords();
  speech.onVoices(renderVoices);
  S.samples = await allSamples();
  renderAll();
  try { await loadScript('vendor/tf.min.js'); }
  catch { await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js'); }
  M = await import('./model.js');
  const saved = await M.loadModel();
  if (saved) { S.model = saved.model; S.meta = saved.meta; }
  renderAll();
  if (!new URLSearchParams(location.search).has('nocam')) startCamera();   // ?nocam for testing without a camera
}

/* ---------------- camera ---------------- */
let cam;
function buildCam() {
  cam = document.createElement('div');
  cam.className = 'cam';
  cam.innerHTML = `<div class="cam-msg" id="camMsg"><div>Kamera açılır…</div></div>
    <div class="count" id="camCount" hidden></div>
    <span class="cam-tag" id="camTag" hidden></span>
    <div class="rec-bar" id="recBar" hidden><i></i></div>`;
  cam.prepend(vision.video, vision.canvas);
  mountCam();
}
function mountCam() { const slot = $(`[data-cam="${S.view}"]`); if (slot && cam.parentElement !== slot) slot.appendChild(cam); }

async function startCamera() {
  const msg = $('#camMsg', cam);
  msg.hidden = false; msg.innerHTML = '<div>Əl və bədən modelləri yüklənir…</div>';
  try {
    if (!vision.ready) await vision.load((t) => (msg.innerHTML = `<div>${esc(t)}</div>`));
    msg.innerHTML = '<div>Kameraya icazə verin…</div>';
    await vision.start();
    msg.hidden = true;
    $('#camDot').className = 'dot on'; $('#camStatus').textContent = vision.offline ? 'Kamera aktiv · oflayn modellər' : 'Kamera aktiv';
    vision.on(onFrame);
  } catch (e) {
    console.error(e);
    msg.hidden = false;
    msg.innerHTML = `<div>Kamera açılmadı.<br><span class="small">${esc(e.name === 'NotAllowedError' ? 'Brauzerdə kameraya icazə verin.' : e.message || e)}</span><br><button class="btn" id="camRetry">Yenidən cəhd et</button></div>`;
    $('#camRetry', cam).onclick = startCamera;
    $('#camDot').className = 'dot warn'; $('#camStatus').textContent = 'Kamera bağlıdır';
  }
}

function onFrame({ f, hands, ts }) {
  if (S.rec?.phase === 'capture') return captureFrame(f, hands);
  if (S.view === 'live') liveStep(ts);
  if (++S.live.n % 15 === 0) $('#fpsPill').textContent = `${vision.fps} kadr/s`;
}

/* ---------------- navigation ---------------- */
const NAMES = { live: 'Canlı tərcümə', record: 'Nümunə yazma', model: 'Model', words: 'Lüğət və ayarlar' };
function go(view) {
  if (S.rec) stopRecording('Yazma dayandırıldı.');
  S.view = view;
  $$('.view').forEach((v) => (v.hidden = v.dataset.view !== view));
  $$('.nav button').forEach((b) => (b.dataset.go === view ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  $('#crumb').textContent = NAMES[view];
  $('#sidebar').classList.remove('open');
  mountCam();
  renderAll();
}
function bindNav() {
  $$('.nav button').forEach((b) => (b.onclick = () => go(b.dataset.go)));
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName);
    if (e.key === 'Escape' && document.body.classList.contains('stage')) toggleStage(false);
    if (typing) return;
    if (S.view === 'record' && e.code === 'Space') { e.preventDefault(); S.rec ? stopRecording('Yazma dayandırıldı.') : startRecording(); }
    if (S.view === 'live' && e.key === 'Enter') { e.preventDefault(); speakPending(); }
    if (S.view === 'live' && e.key === 'Backspace') { e.preventDefault(); undo(); }
  });
}

function toast(text) {
  const t = $('#toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------------- derived data ---------------- */
function stats() {
  const classes = classesOf(S.vocab);
  const by = Object.fromEntries(classes.map((c) => [c, { n: 0, signers: new Set() }]));
  for (const s of S.samples) if (by[s.sign]) { by[s.sign].n += 1; by[s.sign].signers.add(s.signer); }
  const signers = [...new Set(S.samples.map((s) => s.signer))].sort();
  const total = S.samples.filter((s) => by[s.sign]).length;
  return { classes, by, signers, total };
}
const modelStale = () => S.meta && classesOf(S.vocab).some((c) => !S.meta.classes.includes(c) && stats().by[c].n > 0);
const wordOf = (id) => signById(S.vocab, id)?.word ?? id;

/* ---------------- render ---------------- */
function renderAll() {
  const st = stats();
  $('#navSamples').textContent = int(st.total);
  $('#footData').textContent = `${int(st.total)} nümunə · ${st.signers.length} imzalayan`;
  if (S.meta) {
    $('#footModel').textContent = `${S.meta.classes.length - 1} işarə · ${S.meta.accuracy != null ? pct(S.meta.accuracy) : '-'}`;
    $('#modelDot').className = modelStale() ? 'dot warn' : 'dot on';
    $('#modelStatus').textContent = modelStale() ? 'Model köhnədir' : `Model hazır · ${S.meta.classes.length - 1} işarə`;
  } else {
    $('#footModel').textContent = 'öyrədilməyib'; $('#modelDot').className = 'dot'; $('#modelStatus').textContent = 'Model yoxdur';
  }
  if (S.view === 'live') renderLive();
  if (S.view === 'record') renderRecord(st);
  if (S.view === 'model') renderModel(st);
  if (S.view === 'words') renderWords(st);
}

function holdoutText(meta) {
  return meta.holdout && meta.holdout !== 'random' ? `${esc(meta.holdout)} üzərində yoxlanıb, model onu heç görməyib` : 'nümunələrin təsadüfi 20%-i üzərində yoxlanıb';
}

/* ---------------- LIVE ---------------- */
function renderLive() {
  const f = $('#liveFinding');
  if (!S.model) f.innerHTML = 'Model hələ öyrədilməyib. Əvvəl <b>Nümunə yazma</b>, sonra <b>Model</b> bölməsinə keçin.';
  else f.innerHTML = `<b>${S.meta.classes.length - 1} işarə</b> tanıyır · dəqiqlik <b>${pct(S.meta.accuracy ?? 0)}</b>, ${holdoutText(S.meta)}.`;
  renderSentence();
}

function renderProbs(avg) {
  const classes = S.meta.classes;
  const top = avg.map((p, i) => ({ id: classes[i], p })).sort((a, b) => b.p - a.p).slice(0, 3);
  $('#probs').innerHTML = top.map((t) => `<div class="prob"><span>${esc(wordOf(t.id))}</span><span class="bar"><i style="width:${(t.p * 100).toFixed(1)}%"></i></span><span class="num">${pct(t.p)}</span></div>`).join('');
  return top[0];
}

function seen(word, sub, none = false) {
  const w = $('#seenWord'); w.textContent = word; w.classList.toggle('none', none);
  $('#seenSub').textContent = sub;
}

function liveStep(ts) {
  const L = S.live;
  if (!S.model || L.n % 2) return;
  if (ts - vision.handsSeenAt > 600) {
    if (L.hist.length || !$('#seenWord').classList.contains('none')) { L.hist = []; L.last = null; seen('-', 'Əllər görünmür. Kameranın qarşısında, sinə hündürlüyündə işarə edin.', true); $('#probs').innerHTML = ''; }
    return;
  }
  const win = vision.window(); if (!win) return;
  const p = M.predict(S.model, stack(win));
  L.hist.push(p); if (L.hist.length > 4) L.hist.shift();
  const avg = p.map((_, i) => L.hist.reduce((a, h) => a + h[i], 0) / L.hist.length);
  const top = renderProbs(avg);
  if (top.id === FON.id) {
    seen('…', 'İşarə gözlənilir', true);
    if (top.p > 0.6) L.last = null;
    return;
  }
  seen(wordOf(top.id), top.p >= S.threshold ? `Əminlik ${pct(top.p)}` : `Əmin deyil (${pct(top.p)}), hədd ${pct(S.threshold)}`, top.p < S.threshold);
  if (top.p >= S.threshold && top.id !== L.last && ts - L.lastAt > 800) commit(top.id, ts);
}

function commit(id, ts) {
  const L = S.live;
  L.last = id; L.lastAt = ts;
  L.pending.push(id);
  renderSentence();
  clearTimeout(L.timer);
  if ($('#autoSpeak').checked) L.timer = setTimeout(speakPending, 1800);
}

function speakPending() {
  const L = S.live;
  clearTimeout(L.timer);
  if (!L.pending.length) return;
  const text = compose(L.pending, S.vocab);
  speech.speak(text);
  L.said.unshift(text); L.said = L.said.slice(0, 3);
  L.pending = [];
  renderSentence();
}
function undo() { S.live.pending.pop(); S.live.last = null; renderSentence(); }

function renderSentence() {
  const L = S.live;
  const s = $('#sentence');
  const text = compose(L.pending, S.vocab);
  s.textContent = text || (L.said[0] ?? 'İşarə gözlənilir…');
  s.classList.toggle('empty', !text && !L.said.length);
  if (!text && L.said.length) s.classList.add('empty');
  $('#tokens').innerHTML = L.pending.map((id) => `<span class="pill">${esc(wordOf(id))}</span>`).join('');
  $('#said').innerHTML = L.said.slice(text ? 0 : 1).map((t) => `<span>${esc(t)}</span>`).join('');
}

function toggleStage(on = !document.body.classList.contains('stage')) {
  document.body.classList.toggle('stage', on);
  $('#stageBtn').textContent = on ? 'Səhnədən çıx' : 'Səhnə rejimi';
  if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

let rec = null;
function bindLive() {
  $('#speakBtn').onclick = speakPending;
  $('#undoBtn').onclick = undo;
  $('#clearBtn').onclick = () => { S.live.pending = []; S.live.said = []; S.live.last = null; renderSentence(); };
  $('#stageBtn').onclick = () => toggleStage();
  $('#autoSpeak').checked = localStorage.getItem('dilmanc.auto') !== '0';
  $('#autoSpeak').onchange = (e) => localStorage.setItem('dilmanc.auto', e.target.checked ? '1' : '0');
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) toggleStage(false); });
  $('#micBtn').onclick = () => {
    if (rec) { rec.stop(); return; }
    let final = '';
    rec = speech.listener({
      onText: (f, interim) => { final += f; $('#reply').innerHTML = `${esc(final)} <span class="interim">${esc(interim)}</span>`; },
      onEnd: () => { rec = null; $('#micBtn').textContent = 'Danış'; $('#micBtn').classList.remove('on'); },
    });
    if (!rec) { toast('Bu brauzer danışığı tanımır. Chrome və ya Edge istifadə edin.'); return; }
    $('#reply').innerHTML = '<span class="interim">Dinləyirəm…</span>';
    rec.start(); $('#micBtn').textContent = 'Dayandır'; $('#micBtn').classList.add('on');
  };
}

/* ---------------- RECORD ---------------- */
function renderRecord(st) {
  if (!S.selected || !st.classes.includes(S.selected)) S.selected = st.classes[0];
  const goal = 20;
  $('#signRows').innerHTML = st.classes.map((c) => {
    const b = st.by[c]; const s = signById(S.vocab, c);
    const label = c === FON.id ? `Fon <span class="muted small">(${esc(FON.note.toLowerCase())})</span>` : esc(s.word);
    return `<tr class="pick" data-sign="${c}" aria-selected="${c === S.selected}" tabindex="0">
      <td>${label}</td><td class="r num ${b.n ? '' : 'zero'}">${b.n}<span class="muted"> / ${goal}</span></td><td class="r num ${b.signers.size ? '' : 'zero'}">${b.signers.size}</td></tr>`;
  }).join('');
  $$('#signRows tr').forEach((tr) => {
    const pick = () => { S.selected = tr.dataset.sign; renderRecord(stats()); };
    tr.onclick = pick; tr.onkeydown = (e) => { if (e.key === 'Enter') pick(); };
  });
  const low = st.classes.map((c) => ({ c, n: st.by[c].n })).sort((a, b) => a.n - b.n)[0];
  const done = st.classes.filter((c) => st.by[c].n >= goal).length;
  $('#recFinding').innerHTML = `<b>${done} / ${st.classes.length}</b> işarə ${goal} nümunəyə çatıb. Ən az: <b>${esc(low.c === FON.id ? 'fon' : wordOf(low.c))}</b> (${low.n}). Hədəf: hər işarə ${goal}+ nümunə, 3+ imzalayan.`;
  if (!$('#signer').value) $('#signer').value = localStorage.getItem('dilmanc.signer') || '';
  const recent = [...S.samples].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 10);
  $('#recentNote').textContent = S.samples.length ? `${int(S.samples.length)} nümunədən sonuncu ${recent.length}` : '';
  $('#recentRows').innerHTML = recent.length ? recent.map((x) => `<tr><td>${esc(x.sign === FON.id ? 'fon' : wordOf(x.sign))}</td><td>${esc(x.signer)}</td><td class="r num">${x.handFrames ?? '-'} / ${T}</td><td class="r num">${clock(x.at)}</td><td class="r"><button class="btn ghost danger" data-del="${x.id}">Sil</button></td></tr>`).join('')
    : `<tr><td colspan="5"><div class="empty" style="margin:8px">Hələ nümunə yoxdur. Soldan işarəni seçib “Yaz” düyməsini basın.</div></td></tr>`;
  $$('[data-del]').forEach((b) => (b.onclick = async () => { await deleteSample(b.dataset.del); S.samples = S.samples.filter((x) => x.id !== b.dataset.del); renderAll(); }));
}

function bindRecord() {
  $('#recBtn').onclick = () => (S.rec ? stopRecording('Yazma dayandırıldı.') : startRecording());
  $('#signer').onchange = (e) => localStorage.setItem('dilmanc.signer', e.target.value.trim());
}

function recLog(t) { $('#recLog').textContent = t; }
function showCount(t) { const c = $('#camCount', cam); c.hidden = t == null; if (t != null) c.textContent = t; }
function recTag(t) { const g = $('#camTag', cam); g.hidden = !t; g.innerHTML = t ? `<i class="dot rec"></i>${esc(t)}` : ''; }

function startRecording() {
  if (!vision.running) return toast('Əvvəl kamera açılmalıdır.');
  const signer = $('#signer').value.trim();
  if (!signer) { $('#signer').focus(); return toast('İmzalayanın adını yazın: model kimin işarə etdiyini bilməlidir.'); }
  localStorage.setItem('dilmanc.signer', signer);
  S.rec = { sign: S.selected, signer, left: Number($('#takes').value), total: Number($('#takes').value), phase: 'count', frames: [], hands: 0, kept: 0 };
  $('#recBtn').innerHTML = 'Dayandır <kbd>Boşluq</kbd>';
  countdown(3);
}

function countdown(n) {
  const r = S.rec; if (!r) return;
  r.phase = 'count';
  showCount(n);
  recLog(`“${r.sign === FON.id ? 'fon' : wordOf(r.sign)}”, ${r.total - r.left + 1} / ${r.total}: hazırlaşın…`);
  if (n > 1) r.timer = setTimeout(() => countdown(n - 1), 600);
  else r.timer = setTimeout(beginCapture, 600);
}

function beginCapture() {
  const r = S.rec; if (!r) return;
  showCount(null);
  r.phase = 'capture'; r.frames = []; r.hands = 0;
  $('#recBar', cam).hidden = false;
  recTag(`Yazılır · ${r.total - r.left + 1} / ${r.total}`);
}

async function captureFrame(f, hands) {
  const r = S.rec;
  r.frames.push(f); if (hands) r.hands += 1;
  $('#recBar i', cam).style.width = `${(r.frames.length / T) * 100}%`;
  if (r.frames.length < T) return;
  r.phase = 'save';
  $('#recBar', cam).hidden = true; recTag(null);
  const ok = r.sign === FON.id || r.hands >= T * 0.6;
  if (ok) {
    const sample = { id: newId(), sign: r.sign, signer: r.signer, data: stack(r.frames), handFrames: r.hands, at: new Date().toISOString() };
    await putSample(sample); S.samples.push(sample); r.kept += 1;
  }
  r.left -= 1;
  renderAll();
  if (!S.rec) return;
  if (r.left <= 0) return stopRecording(`${r.kept} nümunə saxlandı${r.kept < r.total ? `, ${r.total - r.kept} nümunədə əl kifayət qədər görünmədi` : ''}.`);
  recLog(ok ? `Saxlandı. Əllərinizi aşağı salın…` : `Əl görünmədi, bu nümunə atıldı. Yenidən…`);
  r.timer = setTimeout(() => countdown(1), 700);
}

function stopRecording(msg) {
  if (!S.rec) return;
  clearTimeout(S.rec.timer);
  S.rec = null;
  showCount(null); recTag(null); $('#recBar', cam).hidden = true;
  $('#recBtn').innerHTML = 'Yaz <kbd>Boşluq</kbd>';
  recLog(msg);
  renderAll();
}

/* ---------------- MODEL ---------------- */
function renderModel(st) {
  const sel = $('#holdout'); const prev = sel.value;
  sel.innerHTML = `<option value="random">Təsadüfi 20%</option>` + st.signers.map((s) => `<option value="${esc(s)}">Görülməmiş imzalayan: ${esc(s)}</option>`).join('');
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  const m = S.meta;
  const kp = [
    { label: 'Nümunə', value: int(st.total), sub: `${st.classes.length} sinif üzrə` },
    { label: 'İşarə', value: `${st.classes.filter((c) => c !== FON.id && st.by[c].n > 0).length} / ${st.classes.length - 1}`, sub: 'nümunəsi olan' },
    { label: 'İmzalayan', value: int(st.signers.length), sub: st.signers.length ? st.signers.slice(0, 4).join(', ') + (st.signers.length > 4 ? '…' : '') : 'hələ yoxdur' },
    { label: 'Yoxlama dəqiqliyi', value: m?.accuracy != null ? pct(m.accuracy) : '-', sub: m ? (m.holdout !== 'random' ? `${m.holdout}, görülməmiş` : `təsadüfi 20%, ${m.right} / ${m.tested}`) : 'model yoxdur' },
  ];
  $('#kpis').innerHTML = kp.map((k) => `<div class="kpi"><div class="label">${k.label}</div><div class="value">${esc(k.value)}</div><div class="sub">${esc(k.sub)}</div></div>`).join('');
  $('#modelFinding').innerHTML = m
    ? `Son öyrətmə ${clock(m.trainedAt)}: <b>${pct(m.accuracy)}</b> dəqiqlik, ${holdoutText(m)}.${modelStale() ? ' <b>Lüğət dəyişib, yenidən öyrədin.</b>' : ''}`
    : 'Nümunələr yazıldıqdan sonra modeli burada öyrədin. Münsiflər üçün ən güclü rəqəm: <b>görülməmiş imzalayan</b> üzərində dəqiqlik.';
  if (m && !S.training) drawResults(m);
  $('#trainBtn').disabled = S.training || !M;
}

function drawResults(m) {
  const h = m.history;
  if (h?.acc?.length) {
    const series = [{ name: 'Öyrətmə', values: h.acc }];
    if (h.valAcc?.length && h.valAcc.every((v) => v != null)) series.push({ name: m.holdout !== 'random' ? `Görülməmiş: ${m.holdout}` : 'Yoxlama', values: h.valAcc });
    $('#curve').innerHTML = ''; $('#curveLegend').innerHTML = '';
    Charts.line($('#curve'), { labels: h.acc.map((_, i) => String(i + 1)), series, format: Charts.fmt.pct(0), yTicks: [0, 0.25, 0.5, 0.75, 1], height: 220, legend: $('#curveLegend') });
  }
  if (m.per) {
    $('#perTitle').textContent = m.holdout !== 'random' ? `Hər işarə üzrə: ${m.holdout}` : 'Hər işarə üzrə dəqiqlik';
    const rows = Object.entries(m.per).filter(([, v]) => v.total).map(([c, v]) => ({ label: `${c === FON.id ? 'fon' : wordOf(c)} (${v.right}/${v.total})`, value: v.right / v.total })).sort((a, b) => b.value - a.value);
    $('#perSign').innerHTML = '';
    rows.length ? Charts.barList($('#perSign'), rows, { format: Charts.fmt.pct(0) }) : ($('#perSign').innerHTML = '<div class="empty">Yoxlama dəstində nümunə yoxdur.</div>');
  }
}

function bindModel() { $('#trainBtn').onclick = trainNow; }

async function trainNow() {
  if (!M || S.training) return;
  const st = stats();
  const classes = st.classes.filter((c) => st.by[c].n > 0);
  const data = S.samples.filter((s) => classes.includes(s.sign));
  const thin = classes.filter((c) => st.by[c].n < 5);
  if (classes.length < 2 || !classes.includes(FON.id)) return toast('Ən azı bir işarə və “fon” üçün nümunə lazımdır.');
  if (thin.length) return toast(`Bu işarələrdə 5-dən az nümunə var: ${thin.map((c) => (c === FON.id ? 'fon' : wordOf(c))).join(', ')}`);
  const hold = $('#holdout').value;
  const epochs = Number($('#epochs').value);
  S.training = true; renderAll();
  const prog = $('#trainProg i'); const log = (t) => ($('#trainLog').textContent = t);
  const t0 = performance.now();
  try {
    let model, history, ev;
    if (hold === 'random') {
      const { train, val } = M.stratifiedSplit(data, classes);
      ({ model, history } = await M.train({ train, val, classes, epochs, onEpoch: (e, n, h) => { prog.style.width = `${(e / n) * 100}%`; log(`Epox ${e} / ${n} · yoxlama dəqiqliyi ${pct(h.valAcc.at(-1) ?? 0)}`); liveCurve(h); } }));
      ev = M.evaluate(model, val, classes);
    } else {
      const train = data.filter((s) => s.signer !== hold), val = data.filter((s) => s.signer === hold);
      if (!val.length || !train.length) throw new Error('Bu imzalayanı ayırmaq üçün başqa imzalayanların da nümunəsi lazımdır.');
      const r1 = await M.train({ train, val, classes, epochs, onEpoch: (e, n, h) => { prog.style.width = `${(e / n) * 50}%`; log(`Mərhələ 1/2 · ${hold} olmadan öyrədilir · epox ${e} / ${n} · ${hold} üzərində ${pct(h.valAcc.at(-1) ?? 0)}`); liveCurve(h); } });
      ev = M.evaluate(r1.model, val, classes); history = r1.history; r1.model.dispose();
      ({ model } = await M.train({ train: data, val: [], classes, epochs, onEpoch: (e, n) => { prog.style.width = `${50 + (e / n) * 50}%`; log(`Mərhələ 2/2 · son model bütün ${data.length} nümunə ilə öyrədilir · epox ${e} / ${n}`); } }));
    }
    const meta = { classes, trainedAt: new Date().toISOString(), accuracy: ev?.accuracy ?? null, right: ev?.right ?? 0, tested: ev?.total ?? 0, per: ev?.per ?? null, holdout: hold, history, samples: data.length };
    await M.saveModel(model, meta);
    S.model?.dispose?.();
    S.model = model; S.meta = meta; S.live.hist = [];
    log(`Hazırdır: ${((performance.now() - t0) / 1000).toFixed(0)} saniyə, ${int(data.length)} nümunə. Dəqiqlik ${pct(meta.accuracy ?? 0)}.`);
    toast(`Model hazırdır · ${pct(meta.accuracy ?? 0)}`);
  } catch (e) {
    console.error(e); log(`Xəta: ${e.message || e}`); toast('Öyrətmə alınmadı');
  } finally {
    S.training = false; prog.style.width = '0'; renderAll();
  }
}

function liveCurve(h) {
  const series = [{ name: 'Öyrətmə', values: h.acc }];
  if (h.valAcc.length && h.valAcc.every((v) => v != null)) series.push({ name: 'Yoxlama', values: h.valAcc });
  if (h.acc.length < 2) return;
  $('#curve').innerHTML = ''; $('#curveLegend').innerHTML = '';
  Charts.line($('#curve'), { labels: h.acc.map((_, i) => String(i + 1)), series, format: Charts.fmt.pct(0), yTicks: [0, 0.25, 0.5, 0.75, 1], height: 220, legend: $('#curveLegend') });
}

/* ---------------- WORDS & SETTINGS ---------------- */
function renderWords(st) {
  $('#vocabRows').innerHTML = S.vocab.signs.map((s, i) => `<tr>
    <td><input class="input" data-i="${i}" data-k="word" value="${esc(s.word)}" aria-label="Söz"></td>
    <td><input class="input" data-i="${i}" data-k="say" value="${esc(s.say)}" aria-label="Dilmanc nə deyir"></td>
    <td class="r num ${st.by[s.id].n ? '' : 'zero'}">${st.by[s.id].n}</td>
    <td class="r"><button class="btn ghost danger" data-rm="${i}">Sil</button></td></tr>`).join('');
  $$('#vocabRows input').forEach((inp) => (inp.onchange = () => { S.vocab.signs[inp.dataset.i][inp.dataset.k] = inp.value.trim(); saveVocab(S.vocab); renderAll(); }));
  $$('#vocabRows [data-rm]').forEach((b) => (b.onclick = async () => {
    const s = S.vocab.signs[b.dataset.rm]; const n = st.by[s.id].n;
    if (n && !confirm(`“${s.word}” və onun ${n} nümunəsi silinsin?`)) return;
    for (const x of S.samples.filter((x) => x.sign === s.id)) await deleteSample(x.id);
    S.samples = S.samples.filter((x) => x.sign !== s.id);
    S.vocab.signs.splice(b.dataset.rm, 1);
    S.vocab.rules = S.vocab.rules.filter((r) => !r.seq.includes(s.id));
    saveVocab(S.vocab); renderAll();
  }));
  $('#ruleRows').innerHTML = S.vocab.rules.length ? S.vocab.rules.map((r, i) => `<tr><td>${esc(r.seq.map(wordOf).join(' + '))}</td><td>${esc(r.say)}</td><td class="r"><button class="btn ghost danger" data-rr="${i}">Sil</button></td></tr>`).join('')
    : `<tr><td colspan="3" class="muted">Birləşmə yoxdur.</td></tr>`;
  $$('#ruleRows [data-rr]').forEach((b) => (b.onclick = () => { S.vocab.rules.splice(b.dataset.rr, 1); saveVocab(S.vocab); renderAll(); }));
  $('#threshold').value = Math.round(S.threshold * 100); $('#thresholdVal').textContent = pct(S.threshold);
  $('#modelDlBtn').disabled = !S.model;
}

function renderVoices() {
  const list = speech.voices(); const cur = speech.currentVoice();
  $('#voiceSel').innerHTML = list.length ? list.map((v) => `<option value="${esc(v.name)}" ${cur && v.name === cur.name ? 'selected' : ''}>${esc(v.name)} (${v.lang})</option>`).join('') : '<option>Azərbaycan və ya türk səsi tapılmadı</option>';
  $('#voiceStatus').textContent = cur ? `Səs: ${cur.lang.startsWith('az') ? 'Azərbaycan' : 'Türk (ehtiyat)'}` : 'Səs: tapılmadı';
}

function bindWords() {
  $('#addSign').onsubmit = (e) => {
    e.preventDefault();
    const word = $('#newWord').value.trim(); if (!word) return;
    let id = slug(word); while (S.vocab.signs.some((s) => s.id === id)) id += '-2';
    S.vocab.signs.push({ id, word, say: $('#newSay').value.trim() || `${word[0].toUpperCase()}${word.slice(1)}.` });
    saveVocab(S.vocab); e.target.reset(); renderAll(); toast(`“${word}” əlavə olundu. İndi onun nümunələrini yazın.`);
  };
  $('#addRule').onsubmit = (e) => {
    e.preventDefault();
    const parts = $('#ruleSeq').value.split('+').map((p) => p.trim()).filter(Boolean);
    const seq = parts.map((p) => S.vocab.signs.find((s) => s.word.toLowerCase() === p.toLowerCase() || s.id === p)?.id);
    if (seq.length < 2 || seq.some((x) => !x)) return toast('Ardıcıllıq lüğətdəki sözlərdən ibarət olmalıdır, məs. “baş + ağrı”.');
    S.vocab.rules.push({ seq, say: $('#ruleSay').value.trim() });
    saveVocab(S.vocab); e.target.reset(); renderAll();
  };
  $('#resetVocabBtn').onclick = () => { if (confirm('Lüğət standart 8 işarəyə qaytarılsın? Nümunələr silinmir.')) { S.vocab = resetVocab(); renderAll(); } };
  $('#voiceSel').onchange = (e) => { speech.setVoice(e.target.value); renderVoices(); };
  $('#voiceTest').onclick = () => speech.speak('Salam! Başım ağrıyır, həkim lazımdır.');
  $('#threshold').oninput = (e) => { S.threshold = e.target.value / 100; localStorage.setItem('dilmanc.threshold', e.target.value); $('#thresholdVal').textContent = pct(S.threshold); };
  $('#exportBtn').onclick = () => {
    const blob = new Blob([toJSON(S.samples, S.vocab)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `dilmanc-dataset-${($('#signer').value || 'komanda').trim()}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  $('#importInput').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const { vocab, samples } = fromJSON(await file.text());
      for (const s of vocab?.signs || []) if (!S.vocab.signs.some((x) => x.id === s.id)) S.vocab.signs.push(s);
      saveVocab(S.vocab);
      // same id = the same recording: the imported copy wins, so a file with corrected names fixes them
      const byId = new Map(S.samples.map((x) => [x.id, x]));
      const fresh = samples.filter((x) => !byId.has(x.id)).length;
      await putMany(samples);
      samples.forEach((x) => byId.set(x.id, x));
      S.samples = [...byId.values()];
      toast(`${fresh} yeni nümunə əlavə olundu, ${samples.length - fresh} nümunə yeniləndi`); renderAll();
    } catch (err) { toast(`İdxal alınmadı: ${err.message}`); }
    e.target.value = '';
  };
  $('#modelDlBtn').onclick = () => S.model && M.downloadModel(S.model);
  $('#wipeBtn').onclick = async () => {
    if (!confirm('Bütün nümunələr və model silinsin? Bunu geri qaytarmaq olmur. Əvvəlcə dataseti yükləyin.')) return;
    await clearSamples(); await M?.forgetModel(); S.samples = []; S.model = null; S.meta = null; renderAll();
  };
}

boot();
// for the browser console during the hackathon
window.dilmanc = { S, vision };
