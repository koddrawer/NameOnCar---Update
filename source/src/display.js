// Car Sign Live — màn hình hiển thị 9:16 (Three.js)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const api = window.api || {};
const on = (n, cb) => api[n] && api[n](cb);

// ---------------- CONFIG ----------------
let CFG = {
  carFile: 'car.glb',
  paintMaterial: 'X3MI_1347060001_015',
  carColor: '',              // '' = giữ màu gốc
  inkColor: '#111111',
  font: 'Segoe Script',
  fontWeight: '700',
  title: 'KÝ TÊN LÊN XE',
  legend: ['❤️ 100 tim: bơm mực, ký tên', '🪙 1 xu: avatar nhỏ', '🪙 5 xu: avatar to', '🥈 10 xu: mực bạc', '🥇 30 xu: mực vàng', '👑 100 xu: logo cửa xe'],
  sizes: { like: 0.13, small: 0.15, big: 0.19, silver: 0.21, gold: 0.24 },   // chiều cao chữ (m)
  avatarScale: { like: 0, small: 1.1, big: 1.9, silver: 1.9, gold: 2.1 },    // avatar = chữ × hệ số
  writeSpeed: 1,             // >1 viết nhanh hơn
  holdSeconds: 1.6,
  maxNames: 80,
  orbitSpeed: 1,
  logo: { side: 1, along: 0.06, height: 0.30, size: 0.68 },
  sound: true,
  bgTop: '#1b1e2b', bgBottom: '#05060a',
  likeThreshold: 100,
};

// ---------------- RENDERER ----------------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;
const camera = new THREE.PerspectiveCamera(38, 9 / 16, 0.05, 200);

function bgTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, CFG.bgTop); gr.addColorStop(1, CFG.bgBottom);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
scene.background = bgTexture();

scene.add(new THREE.HemisphereLight(0xdde6ff, 0x202020, 0.6));
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 8, 5); scene.add(key);
const rim = new THREE.DirectionalLight(0x9fb7ff, 0.8); rim.position.set(-6, 4, -6); scene.add(rim);

// sàn + bóng
function radialTex(stops, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64),
  new THREE.MeshStandardMaterial({ map: radialTex([[0, '#2a2e3c'], [0.45, '#141720'], [1, '#05060a']]), roughness: 0.55, metalness: 0, envMapIntensity: 0.25 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const ring = new THREE.Mesh(new THREE.RingGeometry(3.55, 3.62, 128), new THREE.MeshBasicMaterial({ color: 0xffc94d, transparent: true, opacity: 0.55 }));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.003; scene.add(ring);

// ---------------- STATE ----------------
const car = new THREE.Group(); scene.add(car);
let carBox = new THREE.Box3(), carCenter = new THREE.Vector3(), carSize = new THREE.Vector3();
let paintMeshes = [], allMeshes = [], paintSet = new Set();
const decals = [];          // {id, rec, meshes:[], center, radius}
let logoDecal = null;
const queue = []; let busy = false; let current = null;
const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();

// ---------------- HUD ----------------
const $ = id => document.getElementById(id);
function renderHUD() {
  $('title').textContent = CFG.title;
  $('legend').innerHTML = CFG.legend.filter(Boolean).map(l => `<span>${esc(l)}</span>`).join('');
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const TIER_LABEL = { like: '❤️ Bơm đầy mực', small: '🪙 Avatar nhỏ', big: '🪙 Avatar to', silver: '🥈 Mực bạc', gold: '🥇 Mực ánh vàng', logo: '👑 Logo cửa xe' };
function showBanner(job) {
  const b = $('banner');
  if (!job) { b.classList.remove('show'); return; }
  b.className = 'hud show t-' + job.type;
  $('bAvatar').src = job.avatar || initialsAvatar(job.name);
  $('bName').textContent = job.name;
  $('bTier').textContent = TIER_LABEL[job.type] || '';
}
function updateQueueHUD() { $('queue').textContent = queue.length ? `Đang chờ: ${queue.length}` : ''; }
function setLikers(list) {
  $('likers').innerHTML = (list || []).slice(0, 3).map(l => {
    const pct = Math.min(100, Math.round(l.count / CFG.likeThreshold * 100));
    return `<div class="lk"><img src="${l.avatar ? esc(l.avatar) : initialsAvatar(l.name)}"><div class="lkb"><div class="lkn">${esc(l.name)}</div><div class="bar"><i style="width:${pct}%"></i></div></div><b>${pct}%</b></div>`;
  }).join('');
}

// ---------------- AUDIO ----------------
let actx = null, scribble = null;
function audio() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); return actx; }
function startScribble() {
  if (!CFG.sound) return;
  try {
    const a = audio(); const len = a.sampleRate * 2; const buf = a.createBuffer(1, len, a.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.8;
    const g = a.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(a.destination); src.start();
    scribble = { src, g, f };
  } catch (e) { }
}
function scribbleLevel(v) { if (scribble) scribble.g.gain.setTargetAtTime(v * 0.18, audio().currentTime, 0.02); }
function stopScribble() { if (scribble) { try { scribble.src.stop(); } catch (e) { } scribble = null; } }
function chime(kind) {
  if (!CFG.sound) return;
  try {
    const a = audio(); const notes = kind === 'logo' ? [523, 659, 784, 1047, 1319] : kind === 'gold' ? [659, 880, 1175] : kind === 'silver' ? [784, 1047] : [880];
    notes.forEach((fr, i) => {
      const o = a.createOscillator(); const g = a.createGain(); o.type = 'triangle'; o.frequency.value = fr;
      const t = a.currentTime + i * 0.09; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + 1);
    });
  } catch (e) { }
}

// ---------------- PEN ----------------
const pen = new THREE.Group();
const penInner = new THREE.Group(); pen.add(penInner);
const PEN_LEN = 1;  // local units, scaled later
{
  const black = new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.4, roughness: 0.25 });
  const goldM = new THREE.MeshStandardMaterial({ color: 0xd9a92b, metalness: 1, roughness: 0.25 });
  const tipM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 24), tipM); tip.position.y = 0.06; tip.rotation.x = Math.PI;
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.12, 24), goldM); nose.position.y = 0.18;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 32), black); body.position.y = 0.515;
  const win = new THREE.Mesh(new THREE.CylinderGeometry(0.083, 0.083, 0.3, 32, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0, side: THREE.DoubleSide }));
  win.position.y = 0.5;
  const inkM = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000, metalness: 0.3, roughness: 0.3 });
  const ink = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 24), inkM); ink.position.y = 0.35;
  ink.geometry.translate(0, 0.15, 0);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 32), goldM); band.position.y = 0.8;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.22, 32), black); cap.position.y = 0.93;
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.28, 0.03), goldM); clip.position.set(0, 0.88, 0.095);
  // ống giữa (body chia 2 nửa để lộ cửa sổ mực)
  body.scale.y = 1;
  const bodyLow = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 32), black); bodyLow.position.y = 0.3;
  const bodyHigh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.13, 32), black); bodyHigh.position.y = 0.715;
  penInner.add(tip, nose, bodyLow, win, ink, bodyHigh, band, cap, clip);
  pen.userData = { ink, inkM, tipM };
}
pen.visible = false; scene.add(pen);
let inkLevel = 1;
function setInk(level, color, metal) {
  inkLevel = level; pen.userData.ink.scale.y = Math.max(0.001, level);
  if (color) { pen.userData.inkM.color.set(color); pen.userData.tipM.color.set(color); }
  pen.userData.inkM.metalness = metal ? 1 : 0.3; pen.userData.inkM.roughness = metal ? 0.2 : 0.3;
  pen.userData.tipM.metalness = metal ? 0.9 : 0;
}
// đặt bút: đầu bút tại point, trục nghiêng theo pháp tuyến
const _q = new THREE.Quaternion(), _axis = new THREE.Vector3();
function placePen(point, n, X, Y, scale, lift = 0) {
  _axis.copy(n).multiplyScalar(1).addScaledVector(X, 0.35).addScaledVector(Y, 0.55).normalize();
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _axis);
  pen.quaternion.copy(_q); pen.scale.setScalar(scale);
  pen.position.copy(point).addScaledVector(n, 0.002 + lift);
}

// ---------------- PARTICLES ----------------
const sparkTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,240,200,0.8)'], [1, 'rgba(255,200,80,0)']], 64);
const bursts = [];
function burst(center, n, color, count = 80, spread = 0.6) {
  const g = new THREE.BufferGeometry(); const pos = new Float32Array(count * 3); const vel = [];
  for (let i = 0; i < count; i++) {
    pos.set([center.x, center.y, center.z], i * 3);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(spread * (0.4 + Math.random()));
    v.addScaledVector(n, spread * 0.8); vel.push(v);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ map: sparkTex, color, size: spread * 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const p = new THREE.Points(g, m); scene.add(p); bursts.push({ p, vel, t: 0, life: 1.6 });
}
function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.t += dt; const a = b.p.geometry.attributes.position;
    for (let k = 0; k < b.vel.length; k++) { const v = b.vel[k]; v.y -= dt * 0.5; v.multiplyScalar(0.985); a.array[k * 3] += v.x * dt; a.array[k * 3 + 1] += v.y * dt; a.array[k * 3 + 2] += v.z * dt; }
    a.needsUpdate = true; b.p.material.opacity = Math.max(0, 1 - b.t / b.life);
    if (b.t > b.life) { scene.remove(b.p); b.p.geometry.dispose(); b.p.material.dispose(); bursts.splice(i, 1); }
  }
}

// ---------------- CAR LOADING ----------------
async function loadCar(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  // kính: bỏ transmission (tốn 1 lượt render) -> kính trong suốt thường, nhẹ cho GPU yếu
  root.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m && m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = Math.min(m.opacity, 0.45); m.roughness = 0.05; m.depthWrite = false; } }); });
  const pm = []; root.traverse(o => { if (o.isMesh) { const mats = Array.isArray(o.material) ? o.material : [o.material]; if (mats.some(m => m && (m.name === CFG.paintMaterial || /1347060001/.test(m.name)))) pm.push(o); } });
  const box = new THREE.Box3(); (pm.length ? pm : [root]).forEach(o => box.expandByObject(o));
  const size = box.getSize(new THREE.Vector3()); const ctr = box.getCenter(new THREE.Vector3());
  const s = 4.7 / Math.max(size.x, size.z);     // quy về chiều dài ~4.7m
  root.position.set(-ctr.x * s, -box.min.y * s, -ctr.z * s); root.scale.setScalar(s);
  if (size.x > size.z) { root.rotation.y = Math.PI / 2; root.position.set(ctr.z * s, -box.min.y * s, -ctr.x * s); }
  car.add(root); car.updateMatrixWorld(true);
  allMeshes = []; paintMeshes = [];
  root.traverse(o => { if (o.isMesh) { allMeshes.push(o); if (!o.geometry.boundsTree) o.geometry.computeBoundsTree(); if (pm.includes(o)) { paintMeshes.push(o); paintSet.add(o); } } });
  // bóng mờ (sau khi chỉnh tỷ lệ, wheel chạm sàn)
  carBox.makeEmpty(); paintMeshes.forEach(o => carBox.expandByObject(o));
  carBox.getCenter(carCenter); carBox.getSize(carSize);
  // tìm điểm thấp nhất của toàn xe (bánh) để đặt chạm sàn
  const full = new THREE.Box3().setFromObject(root); car.position.y -= full.min.y; car.updateMatrixWorld(true);
  carBox.makeEmpty(); paintMeshes.forEach(o => carBox.expandByObject(o)); carBox.getCenter(carCenter); carBox.getSize(carSize);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(carSize.x * 1.5, carSize.z * 1.25), new THREE.MeshBasicMaterial({ map: radialTex([[0, 'rgba(0,0,0,0.85)'], [0.6, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.set(carCenter.x, 0.004, carCenter.z); scene.add(sh);
  applyCarColor();
}
function applyCarColor() {
  paintMeshes.forEach(o => {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(m => { if (!m.userData.orig) m.userData.orig = m.color.clone(); m.color.copy(CFG.carColor ? new THREE.Color(CFG.carColor) : m.userData.orig); });
  });
}

// ---------------- CANVAS ART ----------------
const avatarCache = new Map();
function loadImg(src) {
  if (!src) return Promise.resolve(null);
  if (avatarCache.has(src)) return avatarCache.get(src);
  const p = new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  avatarCache.set(src, p); return p;
}
function initialsAvatar(name) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  g.fillStyle = `hsl(${h},65%,45%)`; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff'; g.font = 'bold 64px Segoe UI, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText((String(name).trim()[0] || '?').toUpperCase(), 64, 68); return c.toDataURL();
}
function fontStr(px) { return `${CFG.fontWeight} ${px}px "${CFG.font}", "Segoe Script", "Brush Script MT", cursive`; }
const INK = {
  silver: { stops: ['#ffffff', '#d7dce3', '#8d96a3', '#eef1f5'], stroke: '#1b1f26', metal: 0.85, rough: 0.22, pen: '#c9ced6' },
  gold: { stops: ['#fff6c4', '#ffd45a', '#b7840f', '#ffe9a0'], stroke: '#3b2600', metal: 0.85, rough: 0.25, pen: '#e5b53a' },
};
// tạo canvas chữ (đầy đủ) — sau đó reveal dần
function makeTextCanvas(name, type) {
  const PX = 150; const c = document.createElement('canvas'); const g = c.getContext('2d');
  g.font = fontStr(PX); const w = Math.ceil(g.measureText(name).width) + PX * 0.6;
  c.width = Math.min(4096, w); c.height = Math.round(PX * 1.6);
  g.font = fontStr(PX); g.textBaseline = 'middle'; g.textAlign = 'left';
  const x = PX * 0.3, y = c.height * 0.52;
  const ink = INK[type];
  if (ink) {
    const gr = g.createLinearGradient(0, y - PX * 0.6, 0, y + PX * 0.6);
    ink.stops.forEach((s, i) => gr.addColorStop(i / (ink.stops.length - 1), s));
    g.lineJoin = 'round'; g.lineWidth = PX * 0.12; g.strokeStyle = ink.stroke; g.strokeText(name, x, y);
    g.fillStyle = gr; g.fillText(name, x, y);
  } else {
    g.lineJoin = 'round'; g.lineWidth = PX * 0.05; g.strokeStyle = CFG.inkColor; g.strokeText(name, x, y);
    g.fillStyle = CFG.inkColor; g.fillText(name, x, y);
  }
  return c;
}
function makeAvatarCanvas(img, type) {
  const S = 256; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const ink = INK[type]; const ringCol = ink ? ink.stops[1] : CFG.inkColor; const r = S / 2 - 10;
  g.save(); g.beginPath(); g.arc(S / 2, S / 2, r - 8, 0, Math.PI * 2); g.clip();
  if (img) g.drawImage(img, S / 2 - r, S / 2 - r, r * 2, r * 2); else { g.fillStyle = '#555'; g.fill(); }
  g.restore();
  g.lineWidth = 14; g.strokeStyle = ink ? ink.stroke : '#ffffff'; g.beginPath(); g.arc(S / 2, S / 2, r - 3, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 9; g.strokeStyle = ringCol; g.beginPath(); g.arc(S / 2, S / 2, r - 3, 0, Math.PI * 2); g.stroke();
  return c;
}
function makeLogoCanvas(img, name) {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const C = S / 2;
  // vòng ngoài vàng
  const gold = g.createLinearGradient(0, 0, S, S); ['#fff3b8', '#e2ac2e', '#8a5a00', '#ffd765', '#a8740c'].forEach((s, i) => gold.addColorStop(i / 4, s));
  g.fillStyle = gold; g.beginPath(); g.arc(C, C, C - 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2b1a00'; g.beginPath(); g.arc(C, C, C - 30, 0, Math.PI * 2); g.fill();
  const inner = g.createRadialGradient(C, C * 0.8, 20, C, C, C - 36); inner.addColorStop(0, '#20263d'); inner.addColorStop(1, '#070912');
  g.fillStyle = inner; g.beginPath(); g.arc(C, C, C - 38, 0, Math.PI * 2); g.fill();
  // răng cưa
  g.fillStyle = gold; for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; g.beginPath(); g.arc(C + Math.cos(a) * (C - 58), C + Math.sin(a) * (C - 58), 7, 0, Math.PI * 2); g.fill(); }
  // chữ vòng cung
  const arcText = (txt, rad, start, size) => {
    g.save(); g.font = `900 ${size}px "Segoe UI", Arial`; g.fillStyle = gold; g.textAlign = 'center'; g.textBaseline = 'middle';
    const total = g.measureText(txt).width; let a = start - total / rad / 2;
    for (const ch of txt) { const w = g.measureText(ch).width; a += w / rad / 2; g.save(); g.translate(C + Math.cos(a) * rad, C + Math.sin(a) * rad); g.rotate(a + Math.PI / 2); g.fillText(ch, 0, 0); g.restore(); a += w / rad / 2; }
    g.restore();
  };
  arcText('★ TOP DONOR ★', C - 120, -Math.PI / 2, 74);
  // avatar
  const ar = 250; g.save(); g.beginPath(); g.arc(C, C - 10, ar, 0, Math.PI * 2); g.clip();
  if (img) g.drawImage(img, C - ar, C - 10 - ar, ar * 2, ar * 2); else { g.fillStyle = '#444'; g.fill(); }
  g.restore(); g.lineWidth = 16; g.strokeStyle = gold; g.beginPath(); g.arc(C, C - 10, ar, 0, Math.PI * 2); g.stroke();
  // ruy băng tên
  const rw = 760, rh = 130, ry = C + 250;
  g.fillStyle = '#7a0d16'; g.beginPath(); g.moveTo(C - rw / 2 - 40, ry); g.lineTo(C - rw / 2, ry + rh / 2); g.lineTo(C - rw / 2 - 40, ry + rh); g.lineTo(C + rw / 2 + 40, ry + rh); g.lineTo(C + rw / 2, ry + rh / 2); g.lineTo(C + rw / 2 + 40, ry); g.closePath(); g.fill();
  const rib = g.createLinearGradient(0, ry, 0, ry + rh); rib.addColorStop(0, '#e23a44'); rib.addColorStop(1, '#9b1420');
  g.fillStyle = rib; g.fillRect(C - rw / 2, ry - 6, rw, rh + 12); g.strokeStyle = gold; g.lineWidth = 6; g.strokeRect(C - rw / 2, ry - 6, rw, rh + 12);
  let fs = 92; g.font = fontStr(fs); while (g.measureText(name).width > rw - 60 && fs > 30) { fs -= 4; g.font = fontStr(fs); }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#3b0006'; g.strokeText(name, C, ry + rh / 2 + 2);
  g.fillStyle = '#fff4cc'; g.fillText(name, C, ry + rh / 2 + 2);
  arcText('✦ ✦ ✦', C - 120, Math.PI / 2 - 0.02, 40);
  return c;
}

// ---------------- SURFACE / SLOTS ----------------
function hitPaint(origin, dir, maxDist = 20) {
  raycaster.set(origin, dir); raycaster.far = maxDist; raycaster.firstHitOnly = true;
  const h = raycaster.intersectObjects(allMeshes, false)[0];
  if (!h || !paintSet.has(h.object)) return null;
  const n = h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize();
  if (n.dot(dir) > 0) n.negate();
  return { point: h.point.clone(), n, object: h.object, dist: h.distance };
}
function basisFor(p, n, camPos) {
  const f = p.clone().sub(camPos).normalize();
  const r = f.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const u = r.clone().cross(f).normalize();
  const Y = u.clone().addScaledVector(n, -u.dot(n)).normalize();
  const X = Y.clone().cross(n).normalize();
  return { X, Y };
}
function viewFor(p, n, w, h, lift = 0.25) {
  const hf = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  const dist = Math.max(0.9, Math.max(w / 0.7, h * 2.2) / (2 * Math.tan(hf / 2)));
  const dir = n.clone();
  if (n.y > 0.55) { const out = new THREE.Vector3(p.x - carCenter.x, 0, 0).normalize(); if (!isFinite(out.x) || out.lengthSq() < 0.5) out.set(1, 0, 0); dir.multiplyScalar(0.8).addScaledVector(out, 0.9); }
  dir.y += lift; dir.normalize();
  const camPos = p.clone().addScaledVector(dir, dist); camPos.y = Math.max(camPos.y, 0.35);
  return camPos;
}
// kiểm tra vùng phẳng + toàn sơn
function surfaceOK(p, n, X, Y, w, h) {
  const pts = [[-0.5, 0], [0.5, 0], [-0.25, 0], [0.25, 0], [0, 0.5], [0, -0.5], [-0.5, 0.45], [0.5, -0.45], [-0.5, -0.45], [0.5, 0.45]];
  for (const [a, b] of pts) {
    const q = p.clone().addScaledVector(X, a * w).addScaledVector(Y, b * h);
    const o = q.clone().addScaledVector(n, 0.4);
    const hit = hitPaint(o, n.clone().negate(), 0.8);
    if (!hit) return false;
    if (Math.abs(hit.dist - 0.4) > Math.max(0.06, w * 0.12)) return false;
    if (hit.n.dot(n) < 0.72) return false;
  }
  return true;
}
function overlaps(p, radius) {
  for (const d of decals) if (d.center.distanceTo(p) < (d.radius + radius) * 0.92) return true;
  const lr = reservedLogo(); if (lr && lr.p.distanceTo(p) < (CFG.logo.size * 0.62 + radius)) return true;
  return false;
}
function findSlotOnce(w, h, tries) {
  const L = carSize.z, Wd = carSize.x, H = carSize.y;
  const radius = Math.hypot(w, h) / 2;
  for (let attempt = 0; attempt < tries; attempt++) {
    const r = Math.random(); let origin, dir;
    if (r < 0.62) {              // hai bên hông
      const side = Math.random() < 0.5 ? 1 : -1;
      origin = new THREE.Vector3(carCenter.x + side * (Wd / 2 + 3), carBox.min.y + H * (0.12 + Math.random() * 0.5), carCenter.z + (Math.random() - 0.5) * L * 0.92);
      dir = new THREE.Vector3(-side, 0, 0);
    } else if (r < 0.82) {       // nắp capo
      origin = new THREE.Vector3(carCenter.x + (Math.random() - 0.5) * Wd * 0.7, carBox.max.y + 3, carCenter.z + L * (0.22 + Math.random() * 0.25));
      dir = new THREE.Vector3(0, -1, 0);
    } else if (r < 0.92) {       // đuôi xe
      origin = new THREE.Vector3(carCenter.x + (Math.random() - 0.5) * Wd * 0.7, carBox.min.y + H * (0.25 + Math.random() * 0.35), carCenter.z - L / 2 - 3);
      dir = new THREE.Vector3(0, 0, 1);
    } else {                     // đầu xe
      origin = new THREE.Vector3(carCenter.x + (Math.random() - 0.5) * Wd * 0.7, carBox.min.y + H * (0.2 + Math.random() * 0.35), carCenter.z + L / 2 + 3);
      dir = new THREE.Vector3(0, 0, -1);
    }
    const hit = hitPaint(origin, dir); if (!hit) continue;
    if (Math.abs(hit.n.dot(dir)) < 0.55) continue;
    if (overlaps(hit.point, radius)) continue;
    const camPos = viewFor(hit.point, hit.n, w, h);
    const { X, Y } = basisFor(hit.point, hit.n, camPos);
    if (!surfaceOK(hit.point, hit.n, X, Y, w, h)) continue;
    return { p: hit.point, n: hit.n, X, Y, camPos };
  }
  return null;
}
// thử kích thước gốc, nếu không còn chỗ thì thu nhỏ dần; vẫn hết chỗ -> xoá tên cũ nhất
function findSlot(w, h) {
  for (let round = 0; round < 6; round++) {
    for (const k of [1, 0.85, 0.7]) {
      const s = findSlotOnce(w * k, h * k, k === 1 ? 300 : 200);
      if (s) { s.scale = k; s.camPos = viewFor(s.p, s.n, w * k, h * k); return s; }
    }
    if (!decals.length) break;
    removeOldest(true);
  }
  return null;
}
let _lr = null, _lrKey = '';
function reservedLogo() { const k = JSON.stringify(CFG.logo); if (k !== _lrKey) { _lrKey = k; _lr = paintMeshes.length ? logoSlot() : null; } return _lr; }
function logoSlot() {
  const L = carSize.z, Wd = carSize.x, H = carSize.y; const s = CFG.logo.side >= 0 ? 1 : -1;
  const origin = new THREE.Vector3(carCenter.x + s * (Wd / 2 + 3), carBox.min.y + H * CFG.logo.height, carCenter.z + L * CFG.logo.along);
  const dir = new THREE.Vector3(-s, 0, 0); const hit = hitPaint(origin, dir); if (!hit) return null;
  const size = CFG.logo.size;
  const camPos = viewFor(hit.point, hit.n, size * 1.25, size * 1.25, 0.06);
  const { X, Y } = basisFor(hit.point, hit.n, camPos);
  return { p: hit.point, n: hit.n, X, Y, camPos };
}

// ---------------- DECAL ----------------
function decalMaterial(tex, kind) {
  const ink = INK[kind];
  const m = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
    metalness: ink ? ink.metal : 0.05, roughness: ink ? ink.rough : 0.45,
  });
  if (kind === 'gold') { m.emissive = new THREE.Color(0xffb300); m.emissiveMap = tex; m.emissiveIntensity = 0.15; }
  if (kind === 'silver') { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = tex; m.emissiveIntensity = 0.06; }
  if (kind === 'logo') { m.metalness = 0.55; m.roughness = 0.3; m.emissive = new THREE.Color(0xffffff); m.emissiveMap = tex; m.emissiveIntensity = 0.08; }
  return m;
}
function buildDecal(slot, center, w, h, tex, kind) {
  const rot = new THREE.Matrix4().makeBasis(slot.X, slot.Y, slot.n); const euler = new THREE.Euler().setFromRotationMatrix(rot);
  const size = new THREE.Vector3(w, h, Math.max(0.25, Math.min(w, h) * 1.2));
  const mat = decalMaterial(tex, kind); const group = new THREE.Group();
  const rad = Math.hypot(w, h) / 2 + 0.2;
  for (const m of paintMeshes) {
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    const bs = m.geometry.boundingSphere.clone().applyMatrix4(m.matrixWorld);
    if (bs.center.distanceTo(center) > bs.radius + rad) continue;
    const g = new DecalGeometry(m, center, euler, size);
    if (g.attributes.position.count === 0) { g.dispose(); continue; }
    const dm = new THREE.Mesh(g, mat); dm.renderOrder = 2; group.add(dm);
  }
  scene.add(group); return { group, mat };
}
function canvasTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
// canvas hiển thị (reveal) tách khỏi canvas gốc
function revealer(full) {
  const c = document.createElement('canvas'); c.width = full.width; c.height = full.height; const g = c.getContext('2d');
  const tex = canvasTex(c);
  return {
    tex, canvas: c,
    linear(t) { g.clearRect(0, 0, c.width, c.height); const w = c.width * t; if (w > 0) g.drawImage(full, 0, 0, w, c.height, 0, 0, w, c.height); tex.needsUpdate = true; },
    radial(t) { g.clearRect(0, 0, c.width, c.height); if (t <= 0) { tex.needsUpdate = true; return; } g.save(); g.beginPath(); g.moveTo(c.width / 2, c.height / 2); g.arc(c.width / 2, c.height / 2, c.width, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t); g.closePath(); g.clip(); g.drawImage(full, 0, 0); g.restore(); tex.needsUpdate = true; },
    scan(t) { g.clearRect(0, 0, c.width, c.height); const hh = c.height * t; if (hh > 0) g.drawImage(full, 0, 0, c.width, hh, 0, 0, c.width, hh); tex.needsUpdate = true; },
    full() { g.clearRect(0, 0, c.width, c.height); g.drawImage(full, 0, 0); tex.needsUpdate = true; },
  };
}

// ---------------- CAMERA ----------------
const camState = { pos: new THREE.Vector3(), look: new THREE.Vector3(), from: null, to: null, t: 1, dur: 1, orbitA: 0.9, mode: 'orbit' };
function orbitPose(a) {
  const R = Math.max(carSize.z, 4.7) * 2.05 * (CFG.orbitZoom || 1);
  return { pos: new THREE.Vector3(carCenter.x + Math.sin(a) * R, carCenter.y + R * 0.42, carCenter.z + Math.cos(a) * R), look: carCenter.clone().add(new THREE.Vector3(0, -0.35, 0)) };
}
function flyTo(pos, look, dur = 1.3) {
  camState.from = { pos: camState.pos.clone(), look: camState.look.clone() }; camState.to = { pos: pos.clone(), look: look.clone() };
  camState.t = 0; camState.dur = dur; camState.mode = 'fly';
  return wait(dur * 1000);
}
function backToOrbit(dur = 1.4) {
  // tiếp tục orbit từ góc gần nhất với vị trí hiện tại
  camState.orbitA = Math.atan2(camState.pos.x - carCenter.x, camState.pos.z - carCenter.z);
  const p = orbitPose(camState.orbitA);
  camState.from = { pos: camState.pos.clone(), look: camState.look.clone() }; camState.to = p; camState.t = 0; camState.dur = dur; camState.mode = 'toOrbit';
}
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function updateCamera(dt) {
  if (camState.mode === 'orbit') {
    camState.orbitA += dt * 0.12 * CFG.orbitSpeed; const p = orbitPose(camState.orbitA); camState.pos.copy(p.pos); camState.look.copy(p.look);
  } else {
    camState.t = Math.min(1, camState.t + dt / camState.dur); const k = ease(camState.t);
    camState.pos.lerpVectors(camState.from.pos, camState.to.pos, k); camState.look.lerpVectors(camState.from.look, camState.to.look, k);
    if (camState.mode === 'fly' || camState.mode === 'hold') { /* giữ */ }
    if (camState.mode === 'toOrbit' && camState.t >= 1) camState.mode = 'orbit';
  }
  camera.position.copy(camState.pos); camera.lookAt(camState.look);
}

// ---------------- ANIM HELPERS ----------------
const wait = ms => new Promise(r => setTimeout(r, ms));
const tickers = new Set();
function animate(dur, fn) { return new Promise(res => { const tk = { t: 0, dur, fn, res }; tickers.add(tk); }); }
function runTickers(dt) { for (const tk of [...tickers]) { tk.t += dt; const k = Math.min(1, tk.t / tk.dur); tk.fn(k, dt); if (k >= 1) { tickers.delete(tk); tk.res(); } } }

function surfacePoint(slot, w, h, u, v, center) {
  const q = center.clone().addScaledVector(slot.X, (u - 0.5) * w).addScaledVector(slot.Y, (v - 0.5) * h);
  const hit = hitPaint(q.clone().addScaledVector(slot.n, 0.3), slot.n.clone().negate(), 0.7);
  return hit ? hit.point : q;
}

// ---------------- JOB RUNNER ----------------
const TYPES_WITH_AVATAR = { small: 1, big: 1, silver: 1, gold: 1 };
function layout(job) {
  const th = (CFG.sizes[job.type] || 0.14);
  const textC = makeTextCanvas(job.name, job.type);
  let tw = th * textC.width / textC.height;
  let ah = TYPES_WITH_AVATAR[job.type] ? th * (CFG.avatarScale[job.type] || 1) : 0;
  const gap = ah ? th * 0.15 : 0;
  let total = ah + gap + tw;
  const maxW = 1.5; if (total > maxW) { const k = maxW / total; tw *= k; ah *= k; total = maxW; }
  const textH = tw * textC.height / textC.width;
  return { textC, tw, th: textH, ah, gap, total, boxH: Math.max(ah, textH) };
}
async function runJob(job) {
  busy = true; current = job; showBanner(job); updateQueueHUD();
  try {
    if (job.type === 'logo') await runLogo(job);
    else await runWrite(job);
  } catch (e) { console.error(e); }
  current = null; showBanner(null); busy = false; updateQueueHUD();
  report();
}
async function runWrite(job, instant = false, recSlot = null) {
  const img = await loadImg(job.avatar || initialsAvatar(job.name));
  const L = layout(job);
  let slot = recSlot ? restoreSlot(recSlot) : findSlot(L.total, L.boxH);
  if (!slot) { console.warn('Hết chỗ trên xe'); return; }
  const sc = recSlot ? (recSlot.scale || 1) : (slot.scale || 1);
  if (sc !== 1) { L.tw *= sc; L.th *= sc; L.ah *= sc; L.gap *= sc; L.total *= sc; L.boxH *= sc; }
  const left = -L.total / 2;
  const avC = L.ah ? slot.p.clone().addScaledVector(slot.X, left + L.ah / 2) : null;
  const txC = slot.p.clone().addScaledVector(slot.X, left + L.ah + L.gap + L.tw / 2);
  const parts = [];
  let avR, avD, txR, txD;
  if (L.ah) { const ac = makeAvatarCanvas(img, job.type); avR = revealer(ac); avD = buildDecal(slot, avC, L.ah, L.ah, avR.tex, 'avatar'); parts.push(avD.group); }
  txR = revealer(L.textC); txD = buildDecal(slot, txC, L.tw, L.th, txR.tex, job.type in INK ? job.type : 'ink'); parts.push(txD.group);
  const rec = { id: job.id, type: job.type, name: job.name, avatar: job.avatar || '', slot: saveSlot(slot), t: Date.now() };
  const entry = { id: job.id, rec, groups: parts, mats: [txD.mat, avD && avD.mat].filter(Boolean), center: slot.p.clone(), radius: Math.hypot(L.total, L.boxH) / 2, kind: job.type };
  if (instant) { avR && avR.full(); txR.full(); decals.push(entry); return; }
  avR && avR.radial(0); txR.linear(0);

  // camera bay tới
  const look = slot.p.clone();
  const penScale = Math.max(0.12, L.th * 1.35);
  const inkCol = INK[job.type] ? INK[job.type].pen : CFG.inkColor;
  setInk(job.type === 'like' ? 0 : 1, inkCol, !!INK[job.type]);
  pen.visible = false;
  await flyTo(slot.camPos, look, 1.3);
  camState.mode = 'hold';
  // bút xuất hiện
  pen.visible = true;
  if (job.type === 'like') {     // bơm mực
    $('pump').classList.add('show'); $('pumpName').textContent = job.name;
    placePen(slot.p, slot.n, slot.X, slot.Y, penScale, penScale * 0.5);
    await animate(1.4, k => { setInk(k, inkCol, false); $('pumpBar').style.width = Math.round(k * 100) + '%'; pen.rotation.z += 0; });
    $('pump').classList.remove('show');
  }
  const sp = 1 / Math.max(0.2, CFG.writeSpeed);
  startScribble();
  // vẽ avatar
  if (L.ah) {
    const r = 0.47;
    await animate(1.3 * sp, k => {
      avR.radial(k); const a = -Math.PI / 2 + k * Math.PI * 2;
      const pt = surfacePoint(slot, L.ah, L.ah, 0.5 + Math.cos(a) * r, 0.5 - Math.sin(a) * r, avC);
      placePen(pt, slot.n, slot.X, slot.Y, penScale); scribbleLevel(0.7);
    });
  }
  // viết chữ
  const nChars = Math.max(3, [...job.name].length);
  const dur = Math.min(6, Math.max(1.4, nChars * 0.22)) * sp;
  let tt = 0;
  await animate(dur, (k, dt) => {
    tt += dt; const u = 0.06 + k * 0.9;
    txR.linear(Math.min(1, u + 0.03));
    const v = 0.5 + Math.sin(tt * 26) * 0.18 + Math.sin(tt * 11) * 0.08;
    const pt = surfacePoint(slot, L.tw, L.th, u, v, txC);
    placePen(pt, slot.n, slot.X, slot.Y, penScale, Math.max(0, Math.sin(tt * 26)) * 0.004);
    setInk(Math.max(0.15, (job.type === 'like' ? 1 : 1) - k * 0.35), null, !!INK[job.type]);
    scribbleLevel(0.5 + 0.5 * Math.abs(Math.sin(tt * 13)));
  });
  txR.full(); stopScribble();
  // nhấc bút
  const p0 = pen.position.clone();
  await animate(0.4, k => { pen.position.copy(p0).addScaledVector(slot.n, k * penScale * 0.8); });
  pen.visible = false;
  // hiệu ứng hoàn thành
  chime(job.type);
  if (INK[job.type]) burst(slot.p.clone().addScaledVector(slot.n, 0.03), slot.n, job.type === 'gold' ? 0xffcc44 : 0xe8eef8, job.type === 'gold' ? 140 : 90, Math.max(0.4, L.total * 0.7));
  else burst(slot.p.clone().addScaledVector(slot.n, 0.03), slot.n, 0xffffff, 40, Math.max(0.3, L.total * 0.5));
  if (job.type === 'gold' || job.type === 'silver') entry.shine = true;
  decals.push(entry);
  enforceMax();
  api.saveRecord && api.saveRecord(rec);
  await wait(CFG.holdSeconds * 1000);
  backToOrbit(1.4);
  await wait(500);
}
async function runLogo(job, instant = false) {
  const img = await loadImg(job.avatar || initialsAvatar(job.name));
  const slot = logoSlot(); if (!slot) { console.warn('Không tìm thấy vị trí logo'); return; }
  const lc = makeLogoCanvas(img, job.name); const R = revealer(lc); const size = CFG.logo.size;
  const old = logoDecal;
  const d = buildDecal(slot, slot.p, size, size, R.tex, 'logo');
  const rec = { id: job.id, type: 'logo', name: job.name, avatar: job.avatar || '', t: Date.now() };
  const entry = { id: job.id, rec, groups: [d.group], mats: [d.mat], center: slot.p.clone(), radius: size * 0.6, kind: 'logo' };
  if (instant) { R.full(); if (old) disposeEntry(old); logoDecal = entry; return; }
  R.scan(0);
  await flyTo(slot.camPos, slot.p, 1.6); camState.mode = 'hold';
  // xoá tên đang nằm trong vùng logo
  for (const d of [...decals]) if (d.center.distanceTo(slot.p) < size * 0.62 + d.radius * 0.8) { decals.splice(decals.indexOf(d), 1); api.removeRecord && api.removeRecord(d.id); disposeEntry(d); }
  if (old) await animate(0.6, k => old.mats.forEach(m => m.opacity = 1 - k)), disposeEntry(old);
  // thanh in quét từ trên xuống
  const barGeo = new THREE.PlaneGeometry(size * 1.08, size * 0.025);
  const bar = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.2, size * 0.12), new THREE.MeshBasicMaterial({ map: radialTex([[0, 'rgba(255,220,120,0.9)'], [1, 'rgba(255,200,80,0)']]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const barG = new THREE.Group(); barG.add(bar, glow); scene.add(barG);
  barG.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(slot.X, slot.Y, slot.n));
  chime('silver'); startScribble();
  await animate(3.2 / Math.max(0.3, CFG.writeSpeed), (k, dt) => {
    R.scan(k); barG.position.copy(slot.p).addScaledVector(slot.Y, (0.5 - k) * size).addScaledVector(slot.n, 0.03);
    scribbleLevel(0.35 + 0.2 * Math.sin(k * 80));
  });
  stopScribble(); scene.remove(barG); R.full();
  logoDecal = entry; entry.shine = true;
  chime('logo');
  for (let i = 0; i < 3; i++) setTimeout(() => burst(slot.p.clone().addScaledVector(slot.n, 0.05), slot.n, i % 2 ? 0xffffff : 0xffc83a, 160, size * 1.3), i * 350);
  api.saveRecord && api.saveRecord(rec);
  await wait((CFG.holdSeconds + 1.5) * 1000);
  backToOrbit(1.6); await wait(500);
}
function saveSlot(s) { return { scale: s.scale || 1, p: s.p.toArray(), n: s.n.toArray(), X: s.X.toArray(), Y: s.Y.toArray(), camPos: s.camPos.toArray() }; }
function restoreSlot(o) { return { scale: o.scale || 1, p: new THREE.Vector3().fromArray(o.p), n: new THREE.Vector3().fromArray(o.n), X: new THREE.Vector3().fromArray(o.X), Y: new THREE.Vector3().fromArray(o.Y), camPos: new THREE.Vector3().fromArray(o.camPos) }; }
function disposeEntry(e) {
  e.groups.forEach(g => { scene.remove(g); g.traverse(o => o.geometry && o.geometry.dispose()); });
  e.mats.forEach(m => { m.map && m.map.dispose(); m.dispose(); });
}
function removeOldest() {
  const e = decals.shift(); if (!e) return;
  api.removeRecord && api.removeRecord(e.id);
  let k = 0; const mats = e.mats; animate(0.8, kk => mats.forEach(m => m.opacity = 1 - kk)).then(() => disposeEntry(e));
}
function enforceMax() { while (decals.length > CFG.maxNames) removeOldest(); }
function clearAll() { decals.splice(0).forEach(disposeEntry); if (logoDecal) { disposeEntry(logoDecal); logoDecal = null; } }

// ---------------- QUEUE ----------------
function enqueue(job) {
  job.id = job.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  if (job.type !== 'like') { // quà ưu tiên hơn tim
    let i = queue.findIndex(j => j.type === 'like'); if (i < 0) i = queue.length; queue.splice(i, 0, job);
  } else queue.push(job);
  updateQueueHUD(); report();
}
async function pump() { if (!busy && ready && queue.length) await runJob(queue.shift()); }
function report() { api.status && api.status({ queue: queue.map(j => ({ type: j.type, name: j.name })), current: current && { type: current.type, name: current.name }, names: decals.length, logo: logoDecal && logoDecal.rec.name }); }

// ---------------- LOOP ----------------
let ready = false; let last = performance.now(); let time = 0;
function resize() {
  const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false);
  renderer.setPixelRatio(CFG.renderScale || 1);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
function frame(now) {
  const dt = Math.min(window.__DTCAP || 0.05, (now - last) / 1000); last = now; time += dt;
  runTickers(dt); updateCamera(dt); updateBursts(dt);
  ring.material.opacity = 0.35 + 0.2 * Math.sin(time * 1.5);
  for (const d of decals) if (d.shine) d.mats.forEach(m => { if (m.emissiveMap) m.emissiveIntensity = (d.kind === 'gold' ? 0.12 : 0.04) + Math.max(0, Math.sin(time * 2.2 + d.center.x * 3 + d.center.z)) * (d.kind === 'gold' ? 0.35 : 0.2); });
  if (logoDecal) logoDecal.mats.forEach(m => m.emissiveIntensity = 0.06 + Math.max(0, Math.sin(time * 1.6)) * 0.22);
  renderer.render(scene, camera);
  if (!busy) pump();
  requestAnimationFrame(frame);
}

// ---------------- CONFIG / IPC ----------------
let loadedFont = '';
async function applyConfig(c) {
  const fontChanged = c.font && c.font !== CFG.font;
  CFG = { ...CFG, ...c, sizes: { ...CFG.sizes, ...(c.sizes || {}) }, avatarScale: { ...CFG.avatarScale, ...(c.avatarScale || {}) }, logo: { ...CFG.logo, ...(c.logo || {}) } };
  if (c.fontFile && c.fontFile !== loadedFont) { loadedFont = c.fontFile; try { const ff = new FontFace(CFG.font, `url("${c.fontFile}")`); await ff.load(); document.fonts.add(ff); } catch (e) { console.warn('font', e); } }
  try { await document.fonts.load(fontStr(64), 'Ááằẫệ'); } catch (e) { }
  scene.background = bgTexture(); renderHUD(); if (paintMeshes.length) applyCarColor(); resize();
}
on('onConfig', c => applyConfig(c));
on('onJob', j => enqueue(j));
on('onLikers', l => setLikers(l));
on('onCommand', c => {
  if (c.cmd === 'clear') clearAll();
  if (c.cmd === 'removeLast') { const e = decals.pop(); if (e) { disposeEntry(e); api.removeRecord && api.removeRecord(e.id); } }
  if (c.cmd === 'clearQueue') { queue.length = 0; updateQueueHUD(); }
  if (c.cmd === 'previewLogo') { const s = logoSlot(); if (s) { flyTo(s.camPos, s.p, 1.2).then(() => { camState.mode = 'hold'; setTimeout(() => backToOrbit(), 3000); }); } }
  report();
});

// ---------------- START ----------------
(async function start() {
  resize(); renderHUD();
  const init = api.getInit ? await api.getInit() : { config: {}, history: [] };
  await applyConfig(init.config || {});
  $('loading').textContent = 'Đang tải xe…';
  await loadCar(init.carUrl || CFG.carFile);
  $('loading').remove();
  const p = orbitPose(camState.orbitA); camState.pos.copy(p.pos); camState.look.copy(p.look);
  // dựng lại tên cũ
  for (const r of (init.history || [])) {
    try { if (r.type === 'logo') await runLogo(r, true); else if (r.slot) await runWrite(r, true, r.slot); } catch (e) { console.warn(e); }
  }
  ready = true; report();
  requestAnimationFrame(frame);
  if (window.__DTCAP) window.__test = { renderer, scene, camera, enqueue, decals, queue, get busy() { return busy; }, camState, CFG };
})();
