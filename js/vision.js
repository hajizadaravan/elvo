// Camera + MediaPipe hand and pose landmarks. Uses ./vendor/ when present (offline stage), otherwise the CDN.
import { frameFeatures } from './features.js';
import { WINDOW_MS, resampleTimed } from './temporal.js';

const CDN = {
  vision: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14',
  hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
};
const LOCAL = {
  vision: new URL('../vendor/tasks-vision', import.meta.url).href,
  hand: new URL('../vendor/models/hand_landmarker.task', import.meta.url).href,
  pose: new URL('../vendor/models/pose_landmarker_lite.task', import.meta.url).href,
};

async function exists(url) { try { return (await fetch(url, { method: 'HEAD' })).ok; } catch { return false; } }

const HAND_LINKS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

export class Vision {
  constructor() {
    this.video = document.createElement('video');
    this.video.muted = true; this.video.playsInline = true; this.video.autoplay = true;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.frames = [];           // timestamped features spanning the last second
    this.handsSeenAt = 0;
    this.listeners = new Set();
    this.ready = false; this.running = false; this.fps = 0;
    this._last = -1; this._n = 0; this._pose = null; this._tick = 0;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  async load(onStatus) {
    const local = await exists(LOCAL.vision + '/vision_bundle.mjs');
    const src = local ? LOCAL : CDN;
    onStatus?.(local ? 'Modellər yüklənir (lokal)…' : 'Modellər yüklənir…');
    const { FilesetResolver, HandLandmarker, PoseLandmarker } = await import(src.vision + '/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(src.vision + '/wasm');
    const make = async (Kind, path, extra, delegate) => Kind.createFromOptions(files, { baseOptions: { modelAssetPath: path, delegate }, runningMode: 'VIDEO', ...extra });
    const handOpts = { numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 };
    try { this.hand = await make(HandLandmarker, src.hand, handOpts, 'GPU'); }
    catch { this.hand = await make(HandLandmarker, src.hand, handOpts, 'CPU'); }
    try { this.pose = await make(PoseLandmarker, src.pose, { numPoses: 1 }, 'GPU'); }
    catch { try { this.pose = await make(PoseLandmarker, src.pose, { numPoses: 1 }, 'CPU'); } catch { this.pose = null; } }
    this.offline = local;
    this.ready = true;
  }

  async start() {
    if (this.running) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
    this.video.srcObject = stream;
    await this.video.play();
    this.canvas.width = this.video.videoWidth; this.canvas.height = this.video.videoHeight;
    this.frames = []; this._last = -1;
    this.running = true;
    let fpsT = performance.now();
    const loop = () => {
      if (!this.running) return;
      if (this.video.readyState >= 2 && this.video.currentTime !== this._last) {
        this._last = this.video.currentTime;
        const ts = performance.now();
        const hands = this.hand.detectForVideo(this.video, ts);
        if (this.pose && this._tick++ % 3 === 0) {
          const p = this.pose.detectForVideo(this.video, ts);
          this._pose = p.landmarks?.[0] || null;
        }
        const { f, hands: n } = frameFeatures(hands, this._pose);
        if (n) this.handsSeenAt = ts;
        this.frames.push({ f, ts });
        while (this.frames.length > 2 && this.frames[1].ts < ts - WINDOW_MS) this.frames.shift();
        this.draw(hands);
        this._n += 1;
        if (ts - fpsT > 1000) { this.fps = Math.round((this._n * 1000) / (ts - fpsT)); this._n = 0; fpsT = ts; }
        for (const fn of this.listeners) fn({ f, hands: n, ts });
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  draw(hands) {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--chart-1').trim() || '#00799e';
    if (this._pose) {
      const l = this._pose[11], r = this._pose[12];
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(l.x * W, l.y * H); ctx.lineTo(r.x * W, r.y * H); ctx.stroke();
    }
    for (const pts of hands.landmarks || []) {
      ctx.strokeStyle = accent; ctx.lineWidth = Math.max(3, W / 240); ctx.lineCap = 'round';
      ctx.beginPath();
      for (const [a, b] of HAND_LINKS) { ctx.moveTo(pts[a].x * W, pts[a].y * H); ctx.lineTo(pts[b].x * W, pts[b].y * H); }
      ctx.stroke();
      ctx.fillStyle = '#fff';
      for (const p of pts) { ctx.beginPath(); ctx.arc(p.x * W, p.y * H, Math.max(3, W / 300), 0, Math.PI * 2); ctx.fill(); }
    }
  }

  window() {
    const end = this.frames.at(-1)?.ts;
    return end == null ? null : resampleTimed(this.frames, end - WINDOW_MS);
  }

  stop() {
    this.running = false;
    this.video.srcObject?.getTracks().forEach((track) => track.stop());
    this.video.srcObject = null; this.frames = [];
  }
}
