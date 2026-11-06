// Car Sign Live 1.2 — showroom nhiều xe, màn chia đôi: trên = POV người viết, dưới = camera quay xe
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
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);

// ================= CONFIG =================
let CFG = {
  cars: [
    { id: 'x3', name: 'BMW X3 M40i', paint: '1347060001', length: 4.7, enabled: true, x: 0, z: 0, rot: -25, color: '' },
  ],
  logo: { car: 'x3', side: 1, along: 0.06, height: 0.30, size: 0.68 },
  inkColor: '#111111',
  fonts: { like: 'Dancing Script', small: 'Pacifico', big: 'Lobster', silver: 'Great Vibes', gold: 'Dancing Script', logo: 'Pacifico' },
  fontLib: [],
  title: 'KÝ TÊN LÊN XE',
  legend: [],
  sizes: { like: 0.13, small: 0.15, big: 0.19, silver: 0.21, gold: 0.24 },
  avatarScale: { like: 0, small: 1.1, big: 1.9, silver: 1.9, gold: 2.1 },
  writeSpeed: 1, holdSeconds: 1.6, maxNames: 120,
  split: 0.5,
  pov: { shake: 1, walkSpeed: 1.4, fov: 58, zoomMin: 24, idleWander: true, steps: true },
  bot: { mode: 'auto', car: 'all', speed: 1, follow: true, cycle: 8, preset: 0, presets: [] },
  sound: true,
  music: { enabled: false, files: [], volume: 0.35, shuffle: true, duck: 0.3 },
  voice: { enabled: true, volume: 1, write: {}, thank: {} },
  renderScale: 1,
  likeThreshold: 100,
  join: { enabled: false, size: 0.09, speed: 1.8, maxQueue: 8, maxNames: 40, chime: false },
  likersBox: { show: true, x: 0.025, y: 0.2, scale: 0.75, rows: 3 },
};
const TIERS = ['like', 'small', 'big', 'silver', 'gold', 'logo', 'join'];

// ================= RENDERER / SCENE =================
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setScissorTest(true);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0c10);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.85;
scene.add(new THREE.HemisphereLight(0xeef2ff, 0x2a2a30, 0.7));
const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(4, 10, 6); scene.add(key);
const fill = new THREE.DirectionalLight(0xcfe0ff, 0.6); fill.position.set(-6, 8, -5); scene.add(fill);

const camTop = new THREE.PerspectiveCamera(58, 1, 0.03, 120); camTop.layers.enable(1);
const camBot = new THREE.PerspectiveCamera(40, 1, 0.05, 200);

// ================= STATE =================
const cars = [];                 // {def, group, inner, decalGroup, paintMeshes, paintSet, allMeshes, lbPaint, lbAll, decals:[]}
const carById = id => cars.find(c => c.def.id === id);
let showroom = null, roomHalf = 13.2;
const logos = {};                 // side (1 | -1) -> decal logo; in cửa này trước rồi sang cửa kia
const logoList = () => Object.values(logos);
const queue = []; let busy = false; let current = null; let ready = false;
const raycaster = new THREE.Raycaster(); raycaster.firstHitOnly = true;

// ================= HUD =================
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderHUD() {
  $('title').textContent = CFG.title;
  $('legend').innerHTML = (CFG.legend || []).filter(Boolean).map(l => `<span>${esc(l)}</span>`).join('');
  document.documentElement.style.setProperty('--split', (CFG.split * 100) + '%');
}
const TIER_LABEL = { like: '❤️ Bơm đầy mực', small: '🪙 Avatar nhỏ', big: '🪙 Avatar to', silver: '🥈 Mực bạc', gold: '🥇 Mực ánh vàng', logo: '👑 Logo cửa xe', join: '👋 Vào xem live' };
function showBanner(job, carName) {
  const b = $('banner');
  if (!job) { b.classList.remove('show'); return; }
  b.className = 'hud show t-' + job.type;
  $('bAvatar').src = job.avatar || initialsAvatar(job.name);
  $('bName').textContent = job.name;
  $('bTier').textContent = (TIER_LABEL[job.type] || '') + (carName ? ' · ' + carName : '');
}
function updateQueueHUD() { $('queue').textContent = queue.length ? `Đang chờ: ${queue.length}` : ''; }
let lastLikers = [];
function setLikers(list) {
  lastLikers = list || [];
  const LB = CFG.likersBox || {}; const el = $('lkList'); $('likers').style.display = LB.show === false ? 'none' : '';
  $('lkHead').textContent = `❤️ ${CFG.likeThreshold} tim = ký tên lên xe`;
  el.innerHTML = lastLikers.slice(0, LB.rows || 3).map(l => {
    const pct = Math.min(100, Math.round(l.count / CFG.likeThreshold * 100));
    return `<div class="lk"><img src="${l.avatar ? esc(l.avatar) : initialsAvatar(l.name)}"><div class="lkb"><div class="lkn">${esc(l.name)}</div><div class="bar"><i style="width:${pct}%"></i></div></div><b>${pct}%</b></div>`;
  }).join('');
}
// ---- bảng tim: popup kéo thả + đổi cỡ ----
function placeLikers() {
  const LB = CFG.likersBox || {}; const el = $('likers');
  el.style.left = (LB.x ?? 0.025) * 100 + '%'; el.style.top = (LB.y ?? 0.2) * 100 + '%'; el.style.setProperty('--ls', LB.scale ?? 0.75);
}
{
  const el = $('likers'); let d = null;
  const save = () => { clearTimeout(el._t); el._t = setTimeout(() => api.setConfig && api.setConfig({ likersBox: CFG.likersBox }), 300); };
  el.addEventListener('pointerdown', e => {
    e.stopPropagation(); el.setPointerCapture(e.pointerId);
    const LB = CFG.likersBox = { ...(CFG.likersBox || {}) };
    d = { resize: e.target.id === 'lkResize', x: e.clientX, y: e.clientY, lx: LB.x ?? 0.025, ly: LB.y ?? 0.2, s: LB.scale ?? 0.75 };
  });
  el.addEventListener('pointermove', e => {
    if (!d) return; const LB = CFG.likersBox, W = window.innerWidth, H = window.innerHeight;
    if (d.resize) LB.scale = Math.min(2.5, Math.max(0.35, d.s + (e.clientX - d.x + e.clientY - d.y) / 300));
    else { LB.x = Math.min(0.95, Math.max(0, d.lx + (e.clientX - d.x) / W)); LB.y = Math.min(0.97, Math.max(0, d.ly + (e.clientY - d.y) / H)); }
    placeLikers();
  });
  el.addEventListener('pointerup', () => { if (d) save(); d = null; });
  el.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); const LB = CFG.likersBox = { ...(CFG.likersBox || {}) }; LB.scale = Math.min(2.5, Math.max(0.35, (LB.scale ?? 0.75) * (e.deltaY > 0 ? 0.93 : 1.07))); placeLikers(); save(); }, { passive: false });
}
function setCamLabel(t) { $('camLabel').textContent = t ? '📷 ' + t : ''; }

// ================= SFX =================
let actx = null, scribble = null;
function audio() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; }
function startScribble() {
  if (!CFG.sound) return;
  try {
    const a = audio(); const len = a.sampleRate * 2; const buf = a.createBuffer(1, len, a.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.8;
    const g = a.createGain(); g.gain.value = 0; src.connect(f).connect(g).connect(a.destination); src.start();
    scribble = { src, g };
  } catch (e) { }
}
function scribbleLevel(v) { if (scribble) scribble.g.gain.setTargetAtTime(v * 0.16, audio().currentTime, 0.02); }
function stopScribble() { if (scribble) { try { scribble.src.stop(); } catch (e) { } scribble = null; } }
function chime(kind) {
  if (!CFG.sound) return;
  try {
    const a = audio(); const notes = kind === 'logo' ? [523, 659, 784, 1047, 1319] : kind === 'gold' ? [659, 880, 1175] : kind === 'silver' ? [784, 1047] : [880];
    notes.forEach((fr, i) => {
      const o = a.createOscillator(); const g = a.createGain(); o.type = 'triangle'; o.frequency.value = fr;
      const t = a.currentTime + i * 0.09; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.15, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + 1);
    });
  } catch (e) { }
}
function footstep(strength) {
  if (!CFG.sound || !CFG.pov.steps) return;
  try {
    const a = audio(); const len = Math.floor(a.sampleRate * 0.08); const buf = a.createBuffer(1, len, a.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const s = a.createBufferSource(); s.buffer = buf; const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g = a.createGain(); g.gain.value = 0.25 * strength; s.connect(f).connect(g).connect(a.destination); s.start();
  } catch (e) { }
}

// ================= MUSIC =================
const music = new Audio(); music.preload = 'auto';
let musicIdx = -1, musicDuck = 1, musicWanted = false;
function musicVolume() { music.volume = Math.max(0, Math.min(1, CFG.music.volume * musicDuck)); }
function musicNext() {
  const f = CFG.music.files || []; if (!f.length) { music.pause(); return; }
  musicIdx = CFG.music.shuffle && f.length > 1 ? (musicIdx + 1 + Math.floor(Math.random() * (f.length - 1))) % f.length : (musicIdx + 1) % f.length;
  music.src = f[musicIdx].url || f[musicIdx]; musicVolume(); music.play().catch(() => { });
  api.status && api.status({ music: (f[musicIdx].name || '') });
}
music.addEventListener('ended', musicNext);
music.addEventListener('error', () => setTimeout(musicNext, 800));
function applyMusic(prevFiles) {
  musicVolume();
  const want = !!CFG.music.enabled && (CFG.music.files || []).length > 0;
  const changed = JSON.stringify(prevFiles || []) !== JSON.stringify(CFG.music.files || []);
  if (want && (!musicWanted || changed || music.paused)) { if (changed) musicIdx = -1; musicNext(); }
  if (!want) music.pause();
  musicWanted = want;
}
function duck(on) { musicDuck = on ? CFG.music.duck : 1; musicVolume(); }

// ================= VOICE =================
const voiceQ = []; let voiceBusy = false;
function fillTpl(t, job) {
  return String(t || '').replace(/\{name\}/g, cleanName(job.name)).replace(/\{coins\}/g, job.coins || '').replace(/\{gift\}/g, job.gift || 'quà').replace(/\{car\}/g, job.carName || 'xe');
}
function cleanName(n) { return String(n).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/[_.]+/g, ' ').trim() || 'bạn'; }
function say(text) { if (!CFG.voice.enabled || !text || !text.trim()) return; voiceQ.push(text); if (voiceQ.length > 6) voiceQ.splice(0, voiceQ.length - 6); pumpVoice(); }
async function pumpVoice() {
  if (voiceBusy || !voiceQ.length) return; voiceBusy = true;
  const text = voiceQ.shift();
  try {
    duck(true);
    const r = api.tts ? await api.tts(text) : { system: true };
    if (r && r.url) await new Promise(res => { const a = new Audio(r.url); a.volume = CFG.voice.volume; a.onended = a.onerror = res; a.play().catch(res); });
    else await speakSystem(text);
  } catch (e) { console.warn('tts', e); }
  duck(false); voiceBusy = false; pumpVoice();
}
function speakSystem(text) {
  return new Promise(res => {
    try {
      const u = new SpeechSynthesisUtterance(text); u.lang = 'vi-VN'; u.volume = CFG.voice.volume; u.rate = 1 + (CFG.voice.rate || 0) / 100;
      const v = speechSynthesis.getVoices().find(v => /vi/i.test(v.lang)); if (v) u.voice = v;
      u.onend = u.onerror = res; speechSynthesis.speak(u); setTimeout(res, 12000);
    } catch (e) { res(); }
  });
}

// ================= PEN =================
const pen = new THREE.Group();
{
  const black = new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.4, roughness: 0.25 });
  const goldM = new THREE.MeshStandardMaterial({ color: 0xd9a92b, metalness: 1, roughness: 0.25 });
  const tipM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
  const mk = (g, m, y) => { const o = new THREE.Mesh(g, m); o.position.y = y; return o; };
  const tip = mk(new THREE.ConeGeometry(0.035, 0.12, 24), tipM, 0.06); tip.rotation.x = Math.PI;
  const win = mk(new THREE.CylinderGeometry(0.083, 0.083, 0.3, 32, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide }), 0.5);
  const inkM = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.3, roughness: 0.3 });
  const inkGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.3, 24); inkGeo.translate(0, 0.15, 0);
  const ink = mk(inkGeo, inkM, 0.35);
  const clip = mk(new THREE.BoxGeometry(0.02, 0.28, 0.03), goldM, 0.88); clip.position.z = 0.095;
  pen.add(tip, mk(new THREE.CylinderGeometry(0.05, 0.075, 0.12, 24), goldM, 0.18), mk(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 32), black, 0.3), win, ink,
    mk(new THREE.CylinderGeometry(0.08, 0.08, 0.13, 32), black, 0.715), mk(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 32), goldM, 0.8),
    mk(new THREE.CylinderGeometry(0.085, 0.07, 0.22, 32), black, 0.93), clip);
  pen.userData = { ink, inkM, tipM };
  pen.traverse(o => o.layers.set(1));     // chỉ hiện ở màn POV
}
pen.visible = false; scene.add(pen);
function setInk(level, color, metal) {
  pen.userData.ink.scale.y = Math.max(0.001, level);
  if (color) { pen.userData.inkM.color.set(color); pen.userData.tipM.color.set(color); }
  pen.userData.inkM.metalness = metal ? 1 : 0.3; pen.userData.tipM.metalness = metal ? 0.9 : 0;
}
// đầu bút tại point, thân bút hướng về tay (góc dưới phải màn POV)
const _q = new THREE.Quaternion();
function penAxisTo(point, n) {
  const right = V3(1, 0, 0).applyQuaternion(camTop.quaternion), upv = V3(0, 1, 0).applyQuaternion(camTop.quaternion);
  const hand = camTop.position.clone().addScaledVector(right, 0.32).addScaledVector(upv, -0.42);
  const ax = hand.sub(point).normalize();
  if (n && ax.dot(n) < 0.45) ax.addScaledVector(n, 0.45 - ax.dot(n)).normalize();
  return ax;
}
function placePen(point, n, scale, lift = 0) {
  const ax = penAxisTo(point, n);
  _q.setFromUnitVectors(UP, ax); pen.quaternion.copy(_q); pen.scale.setScalar(scale);
  pen.position.copy(point); if (n) pen.position.addScaledVector(n, 0.002 + lift);
}

// ================= PARTICLES =================
function radialTex(stops, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const sparkTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,240,200,0.8)'], [1, 'rgba(255,200,80,0)']], 64);
const bursts = [];
function burst(center, n, color, count = 80, spread = 0.6) {
  const g = new THREE.BufferGeometry(); const pos = new Float32Array(count * 3); const vel = [];
  for (let i = 0; i < count; i++) {
    pos.set([center.x, center.y, center.z], i * 3);
    const v = V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(spread * (0.4 + Math.random()));
    v.addScaledVector(n, spread * 0.8); vel.push(v);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ map: sparkTex, color, size: spread * 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(p); bursts.push({ p, vel, t: 0, life: 1.6 });
}
function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.t += dt; const a = b.p.geometry.attributes.position;
    for (let k = 0; k < b.vel.length; k++) { const v = b.vel[k]; v.y -= dt * 0.5; v.multiplyScalar(0.985); a.array[k * 3] += v.x * dt; a.array[k * 3 + 1] += v.y * dt; a.array[k * 3 + 2] += v.z * dt; }
    a.needsUpdate = true; b.p.material.opacity = Math.max(0, 1 - b.t / b.life);
    if (b.t > b.life) { scene.remove(b.p); b.p.geometry.dispose(); b.p.material.dispose(); bursts.splice(i, 1); }
  }
}

// ================= LOADING =================
const loader = new GLTFLoader();
function fixMaterials(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
      if (m && m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = Math.min(m.opacity, 0.45); m.roughness = 0.05; m.depthWrite = false; }
    });
  });
}
async function loadShowroom(url) {
  if (!url) return fallbackFloor();
  try {
    const g = await loader.loadAsync(url); const root = g.scene;
    root.traverse(o => {
      if (!o.isMesh) return; const m = o.material;
      if (/light/i.test(m.name)) { m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = 1.2; m.toneMapped = true; }
      if (/^material\.006$/i.test(m.name)) { m.color.setRGB(0.035, 0.037, 0.045); m.roughness = 0.18; m.metalness = 0.55; m.envMapIntensity = 0.45; }
      if (/^wall$/i.test(m.name)) { m.color.multiplyScalar(0.55); m.envMapIntensity = 0.3; }
    });
    scene.add(root); root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(root); roomHalf = Math.min(b.max.x - b.min.x, b.max.z - b.min.z) / 2 - 1.0;
    showroom = root;
    // vài đèn điểm trên trần cho có điểm sáng
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6], [0, 0]]) { const l = new THREE.PointLight(0xfff4e6, 7, 12, 2); l.position.set(x, b.max.y - 0.4, z); scene.add(l); }
  } catch (e) { console.warn('showroom', e); fallbackFloor(); }
}
function fallbackFloor() {
  const f = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ map: radialTex([[0, '#2a2e3c'], [0.5, '#141720'], [1, '#05060a']]), roughness: 0.5 }));
  f.rotation.x = -Math.PI / 2; scene.add(f);
}
async function loadCar(def, url) {
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene; fixMaterials(root); root.updateMatrixWorld(true);
  let re; try { re = new RegExp(def.paint || '^$', 'i'); } catch (e) { re = /^$/; }
  const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o); });
  let pm = meshes.filter(o => (Array.isArray(o.material) ? o.material : [o.material]).some(m => m && re.test(m.name)));
  if (!pm.length) { console.warn('Không tìm thấy vật liệu sơn cho', def.id, '— dùng toàn bộ thân'); pm = meshes; }
  const pBox = new THREE.Box3(); pm.forEach(o => pBox.expandByObject(o));
  // ẩn vật thể lạ cách xa thân xe (biển mô tả, mặt sàn kèm model…)
  const big = pBox.clone().expandByVector(pBox.getSize(V3()).multiplyScalar(0.25));
  for (const o of meshes) { const b = new THREE.Box3().setFromObject(o); if (!big.containsPoint(b.getCenter(V3())) || b.getSize(V3()).length() > pBox.getSize(V3()).length() * 1.6) o.visible = false; }
  const size = pBox.getSize(V3());
  const inner = new THREE.Group(); inner.add(root);
  if (size.x > size.z) inner.rotation.y = Math.PI / 2;
  inner.scale.setScalar((def.length || 4.6) / Math.max(size.x, size.z));
  inner.updateMatrixWorld(true);
  const visible = meshes.filter(o => o.visible);
  const allB = new THREE.Box3(); visible.forEach(o => allB.expandByObject(o));
  const pB = new THREE.Box3(); pm.forEach(o => pB.expandByObject(o));
  const pc = pB.getCenter(V3());
  inner.position.set(-pc.x, -allB.min.y, -pc.z); inner.updateMatrixWorld(true);
  const group = new THREE.Group(); group.add(inner);
  const decalGroup = new THREE.Group(); group.add(decalGroup);
  scene.add(group); group.updateMatrixWorld(true);
  visible.forEach(o => { if (!o.geometry.boundsTree) o.geometry.computeBoundsTree(); });
  const lbPaint = new THREE.Box3(); pm.forEach(o => lbPaint.expandByObject(o));
  const lbAll = new THREE.Box3(); visible.forEach(o => lbAll.expandByObject(o));
  const car = { def, group, inner, decalGroup, paintMeshes: pm, paintSet: new Set(pm), allMeshes: visible, lbPaint, lbAll, decals: [] };
  pm.forEach(o => (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!m.userData.orig) m.userData.orig = m.color.clone(); }));
  cars.push(car); return car;
}
function applyLayout() {
  for (const c of cars) {
    const d = CFG.cars.find(x => x.id === c.def.id) || c.def; c.def = d;
    c.group.position.set(d.x || 0, 0, d.z || 0); c.group.rotation.y = THREE.MathUtils.degToRad(d.rot || 0);
    c.group.visible = d.enabled !== false; c.group.updateMatrixWorld(true);
    c.paintMeshes.forEach(o => (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.color.copy(d.color ? new THREE.Color(d.color) : m.userData.orig)));
  }
  buildGrid(); _lrKey = '';
}
const activeCars = () => cars.filter(c => c.group.visible);
const carCenterW = c => c.lbPaint.getCenter(V3()).applyMatrix4(c.group.matrixWorld);

// ================= WALK GRID + A* =================
const CELL = 0.25; let GN = 0, grid = null;
function cellOf(x, z) { return [Math.floor((x + roomHalf) / CELL), Math.floor((z + roomHalf) / CELL)]; }
function cellCenter(i, j) { return V3(-roomHalf + (i + 0.5) * CELL, 0, -roomHalf + (j + 0.5) * CELL); }
function buildGrid() {
  GN = Math.ceil(roomHalf * 2 / CELL); grid = new Uint8Array(GN * GN);
  const inv = new THREE.Matrix4(), p = V3();
  for (const c of activeCars()) {
    inv.copy(c.group.matrixWorld).invert(); const b = c.lbAll, m = 0.45;
    for (let i = 0; i < GN; i++) for (let j = 0; j < GN; j++) {
      p.copy(cellCenter(i, j)).applyMatrix4(inv);
      if (p.x > b.min.x - m && p.x < b.max.x + m && p.z > b.min.z - m && p.z < b.max.z + m) grid[j * GN + i] = 1;
    }
  }
}
function free(x, z) { const [i, j] = cellOf(x, z); return i >= 0 && j >= 0 && i < GN && j < GN && !grid[j * GN + i]; }
function nearestFree(x, z) {
  const [ci, cj] = cellOf(x, z);
  for (let r = 0; r < 40; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < GN && j < GN && !grid[j * GN + i]) return [i, j];
  }
  return [ci, cj];
}
function lineFree(a, b) {
  const d = a.distanceTo(b), n = Math.ceil(d / (CELL * 0.5));
  for (let k = 0; k <= n; k++) { const t = k / n; if (!free(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false; }
  return true;
}
function findPath(from, to) {
  const [si, sj] = nearestFree(from.x, from.z), [ti, tj] = nearestFree(to.x, to.z);
  const N = GN * GN, g = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const open = [[0, sj * GN + si]]; g[sj * GN + si] = 0; const goal = tj * GN + ti;
  const h = (k) => { const i = k % GN, j = (k / GN) | 0, dx = Math.abs(i - ti), dz = Math.abs(j - tj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  let found = false, iter = 0;
  while (open.length && iter++ < 60000) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
    const [, cur] = open.splice(bi, 1)[0]; if (closed[cur]) continue; closed[cur] = 1;
    if (cur === goal) { found = true; break; }
    const ci = cur % GN, cj = (cur / GN) | 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue; const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= GN || nj >= GN) continue;
      const nk = nj * GN + ni; if (grid[nk] || closed[nk]) continue;
      if (di && dj && (grid[cj * GN + ni] || grid[nj * GN + ci])) continue;
      const ng = g[cur] + (di && dj ? 1.414 : 1);
      if (ng < g[nk]) { g[nk] = ng; came[nk] = cur; open.push([ng + h(nk), nk]); }
    }
  }
  if (!found) return [from.clone(), to.clone()];
  const cells = []; for (let k = goal; k !== -1; k = came[k]) cells.push(k); cells.reverse();
  const pts = cells.map(k => cellCenter(k % GN, (k / GN) | 0)); pts[0] = from.clone().setY(0); pts.push(to.clone().setY(0));
  // rút gọn đường (string pulling)
  const out = [pts[0]]; let a = 0;
  while (a < pts.length - 1) { let b = pts.length - 1; while (b > a + 1 && !lineFree(pts[a], pts[b])) b--; out.push(pts[b]); a = b; }
  return out;
}

// ================= CANVAS ART =================
const imgCache = new Map();
function loadImg(src) {
  if (!src) return Promise.resolve(null);
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  imgCache.set(src, p); return p;
}
function initialsAvatar(name) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  g.fillStyle = `hsl(${h},65%,45%)`; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff'; g.font = 'bold 64px Segoe UI, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText((String(name).trim()[0] || '?').toUpperCase(), 64, 68); return c.toDataURL();
}
function fontWeight(fam) { const f = (CFG.fontLib || []).find(f => f.family === fam); return f ? f.weight || 400 : 400; }
function fontStr(px, fam) { fam = fam || 'Dancing Script'; return `${fontWeight(fam)} ${px}px "${fam}", "Segoe Script", cursive`; }
const INK = {
  silver: { stops: ['#ffffff', '#d7dce3', '#8d96a3', '#eef1f5'], stroke: '#1b1f26', metal: 0.85, rough: 0.22, pen: '#c9ced6' },
  gold: { stops: ['#fff6c4', '#ffd45a', '#b7840f', '#ffe9a0'], stroke: '#3b2600', metal: 0.85, rough: 0.25, pen: '#e5b53a' },
};
function inkFor(car) {
  if (!car || CFG.autoInk === false) return CFG.inkColor;
  const m = car.paintMeshes[0] && (Array.isArray(car.paintMeshes[0].material) ? car.paintMeshes[0].material[0] : car.paintMeshes[0].material);
  const c = m ? m.color : new THREE.Color(1, 1, 1);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // tuyến tính
  const ink = new THREE.Color(CFG.inkColor); const il = 0.2126 * ink.r + 0.7152 * ink.g + 0.0722 * ink.b;
  return Math.abs(lum - il) < 0.12 ? (lum < 0.18 ? (CFG.inkLight || '#f4f1e8') : '#111111') : CFG.inkColor;
}
let INK_NOW = '#111111';
function makeTextCanvas(name, type, fam) {
  const PX = 150; const c = document.createElement('canvas'); const g = c.getContext('2d');
  g.font = fontStr(PX, fam); const w = Math.ceil(g.measureText(name).width) + PX * 0.8;
  c.width = Math.min(4096, w); c.height = Math.round(PX * 1.8);
  g.font = fontStr(PX, fam); g.textBaseline = 'middle'; g.textAlign = 'left';
  const x = PX * 0.4, y = c.height * 0.52; const ink = INK[type];
  g.lineJoin = 'round';
  if (ink) {
    const gr = g.createLinearGradient(0, y - PX * 0.6, 0, y + PX * 0.6); ink.stops.forEach((s, i) => gr.addColorStop(i / (ink.stops.length - 1), s));
    g.lineWidth = PX * 0.12; g.strokeStyle = ink.stroke; g.strokeText(name, x, y); g.fillStyle = gr; g.fillText(name, x, y);
  } else { g.lineWidth = PX * 0.04; g.strokeStyle = INK_NOW; g.strokeText(name, x, y); g.fillStyle = INK_NOW; g.fillText(name, x, y); }
  return c;
}
function makeAvatarCanvas(img, type) {
  const S = 256; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const ink = INK[type]; const r = S / 2 - 10;
  g.save(); g.beginPath(); g.arc(S / 2, S / 2, r - 8, 0, Math.PI * 2); g.clip();
  if (img) g.drawImage(img, S / 2 - r, S / 2 - r, r * 2, r * 2); else { g.fillStyle = '#555'; g.fill(); }
  g.restore();
  g.lineWidth = 14; g.strokeStyle = ink ? ink.stroke : '#ffffff'; g.beginPath(); g.arc(S / 2, S / 2, r - 3, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 9; g.strokeStyle = ink ? ink.stops[1] : INK_NOW; g.beginPath(); g.arc(S / 2, S / 2, r - 3, 0, Math.PI * 2); g.stroke();
  return c;
}
function makeLogoCanvas(img, name, fam) {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const C = S / 2;
  const gold = g.createLinearGradient(0, 0, S, S); ['#fff3b8', '#e2ac2e', '#8a5a00', '#ffd765', '#a8740c'].forEach((s, i) => gold.addColorStop(i / 4, s));
  g.fillStyle = gold; g.beginPath(); g.arc(C, C, C - 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2b1a00'; g.beginPath(); g.arc(C, C, C - 30, 0, Math.PI * 2); g.fill();
  const inner = g.createRadialGradient(C, C * 0.8, 20, C, C, C - 36); inner.addColorStop(0, '#20263d'); inner.addColorStop(1, '#070912');
  g.fillStyle = inner; g.beginPath(); g.arc(C, C, C - 38, 0, Math.PI * 2); g.fill();
  g.fillStyle = gold; for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; g.beginPath(); g.arc(C + Math.cos(a) * (C - 58), C + Math.sin(a) * (C - 58), 7, 0, Math.PI * 2); g.fill(); }
  const arcText = (txt, rad, start, size) => {
    g.save(); g.font = `900 ${size}px "Segoe UI", Arial`; g.fillStyle = gold; g.textAlign = 'center'; g.textBaseline = 'middle';
    const total = g.measureText(txt).width; let a = start - total / rad / 2;
    for (const ch of txt) { const w = g.measureText(ch).width; a += w / rad / 2; g.save(); g.translate(C + Math.cos(a) * rad, C + Math.sin(a) * rad); g.rotate(a + Math.PI / 2); g.fillText(ch, 0, 0); g.restore(); a += w / rad / 2; }
    g.restore();
  };
  arcText('★ TOP DONOR ★', C - 120, -Math.PI / 2, 74);
  const ar = 250; g.save(); g.beginPath(); g.arc(C, C - 10, ar, 0, Math.PI * 2); g.clip();
  if (img) g.drawImage(img, C - ar, C - 10 - ar, ar * 2, ar * 2); else { g.fillStyle = '#444'; g.fill(); }
  g.restore(); g.lineWidth = 16; g.strokeStyle = gold; g.beginPath(); g.arc(C, C - 10, ar, 0, Math.PI * 2); g.stroke();
  const rw = 760, rh = 130, ry = C + 250;
  g.fillStyle = '#7a0d16'; g.beginPath(); g.moveTo(C - rw / 2 - 40, ry); g.lineTo(C - rw / 2, ry + rh / 2); g.lineTo(C - rw / 2 - 40, ry + rh); g.lineTo(C + rw / 2 + 40, ry + rh); g.lineTo(C + rw / 2, ry + rh / 2); g.lineTo(C + rw / 2 + 40, ry); g.closePath(); g.fill();
  const rib = g.createLinearGradient(0, ry, 0, ry + rh); rib.addColorStop(0, '#e23a44'); rib.addColorStop(1, '#9b1420');
  g.fillStyle = rib; g.fillRect(C - rw / 2, ry - 6, rw, rh + 12); g.strokeStyle = gold; g.lineWidth = 6; g.strokeRect(C - rw / 2, ry - 6, rw, rh + 12);
  let fs = 92; g.font = fontStr(fs, fam); while (g.measureText(name).width > rw - 60 && fs > 30) { fs -= 4; g.font = fontStr(fs, fam); }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#3b0006'; g.strokeText(name, C, ry + rh / 2 + 2);
  g.fillStyle = '#fff4cc'; g.fillText(name, C, ry + rh / 2 + 2);
  arcText('✦ ✦ ✦', C - 120, Math.PI / 2 - 0.02, 40);
  return c;
}

// ================= SURFACE / SLOTS =================
function hitPaint(car, origin, dir, maxDist = 20) {
  raycaster.set(origin, dir); raycaster.far = maxDist;
  const h = raycaster.intersectObjects(car.allMeshes, false)[0];
  if (!h || !car.paintSet.has(h.object)) return null;
  const n = h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize();
  if (n.dot(dir) > 0) n.negate();
  return { point: h.point.clone(), n, dist: h.distance };
}
function basisFor(p, n, camPos) {
  const f = p.clone().sub(camPos).normalize();
  let r = f.clone().cross(UP); if (r.lengthSq() < 1e-4) r.set(1, 0, 0); r.normalize();
  const u = r.clone().cross(f).normalize();
  const Y = u.clone().addScaledVector(n, -u.dot(n)).normalize();
  const X = Y.clone().cross(n).normalize();
  return { X, Y };
}
function topAspect() { return camTop.aspect || 1; }
// điểm đứng của người viết (POV) trước vị trí slot
function standFor(car, p, n, w, h) {
  const vf = THREE.MathUtils.degToRad(CFG.pov.fov); const hf = 2 * Math.atan(Math.tan(vf / 2) * topAspect());
  let d = Math.max(0.6, Math.max(w / 0.62 / (2 * Math.tan(hf / 2)), h * 2.6 / (2 * Math.tan(vf / 2))));
  const nh = V3(n.x, 0, n.z);
  if (nh.length() < 0.35) { nh.copy(p).sub(carCenterW(car)).setY(0); if (nh.length() < 0.2) nh.set(1, 0, 0).transformDirection(car.group.matrixWorld).setY(0); }
  nh.normalize();
  for (let k = 0; k < 6; k++, d += 0.3) {
    const s = p.clone().addScaledVector(nh, d); s.y = 0;
    if (Math.abs(s.x) < roomHalf - 0.3 && Math.abs(s.z) < roomHalf - 0.3 && free(s.x, s.z)) {
      const eye = THREE.MathUtils.clamp(p.y + 0.3 + 0.3 * d, 0.95, 1.7);
      return { feet: s, eye, cam: V3(s.x, eye, s.z) };
    }
  }
  return null;
}
function surfaceOK(car, p, n, X, Y, w, h) {
  const pts = [[-0.5, 0], [0.5, 0], [-0.25, 0], [0.25, 0], [0, 0.5], [0, -0.5], [-0.5, 0.45], [0.5, -0.45], [-0.5, -0.45], [0.5, 0.45]];
  for (const [a, b] of pts) {
    const q = p.clone().addScaledVector(X, a * w).addScaledVector(Y, b * h);
    const hit = hitPaint(car, q.clone().addScaledVector(n, 0.4), n.clone().negate(), 0.8);
    if (!hit || Math.abs(hit.dist - 0.4) > Math.max(0.06, w * 0.12) || hit.n.dot(n) < 0.72) return false;
  }
  return true;
}
function toLocal(car, v) { return car.group.worldToLocal(v.clone()); }
function overlaps(car, pW, radius) {
  const pl = toLocal(car, pW);
  for (const d of car.decals) if (d.centerL.distanceTo(pl) < (d.radius + radius) * 0.92) return true;
  if (CFG.logo.car === car.def.id) for (const lr of reservedLogo()) if (toLocal(car, lr.p).distanceTo(pl) < CFG.logo.size * 0.62 + radius) return true;
  return false;
}
function sampleOrigin(car) {
  const b = car.lbPaint, c = b.getCenter(V3()), s = b.getSize(V3()); const r = Math.random();
  let o, d;
  if (r < 0.74) { const side = Math.random() < 0.5 ? 1 : -1; o = V3(c.x + side * (s.x / 2 + 3), b.min.y + s.y * (0.12 + Math.random() * 0.5), c.z + (Math.random() - 0.5) * s.z * 0.92); d = V3(-side, 0, 0); }
  else if (r < 0.86) { const e = Math.random() < 0.5 ? 1 : -1; o = V3(c.x + (Math.random() - 0.5) * s.x * 0.6, b.max.y + 3, c.z + e * s.z * (0.25 + Math.random() * 0.22)); d = V3(0, -1, 0); }   // chỉ capo / cốp, không lên nóc
  else { const e = Math.random() < 0.5 ? 1 : -1; o = V3(c.x + (Math.random() - 0.5) * s.x * 0.7, b.min.y + s.y * (0.2 + Math.random() * 0.4), c.z + e * (s.z / 2 + 3)); d = V3(0, 0, -e); }
  return { o: o.applyMatrix4(car.group.matrixWorld), d: d.transformDirection(car.group.matrixWorld) };
}
function findSlotOnce(car, w, h, tries) {
  const radius = Math.hypot(w, h) / 2;
  for (let a = 0; a < tries; a++) {
    const { o, d } = sampleOrigin(car);
    const hit = hitPaint(car, o, d); if (!hit || Math.abs(hit.n.dot(d)) < 0.55) continue;
    if (overlaps(car, hit.point, radius)) continue;
    if (hit.n.y > 0.55 && toLocal(car, hit.point).y > car.lbPaint.min.y + car.lbPaint.getSize(V3()).y * 0.78) continue;   // nóc xe
    const st = standFor(car, hit.point, hit.n, w, h); if (!st) continue;
    if (hit.n.dot(st.cam.clone().sub(hit.point).normalize()) < 0.5) continue;           // nhìn quá xiên -> chữ khó đọc
    if (occluded(car, st.cam, hit.point)) continue;                                   // bị gương / cánh gió che
    const { X, Y } = basisFor(hit.point, hit.n, st.cam);
    if (!surfaceOK(car, hit.point, hit.n, X, Y, w, h)) continue;
    return { car, p: hit.point, n: hit.n, X, Y, stand: st };
  }
  return null;
}
function occluded(car, eye, p) {
  const dir = p.clone().sub(eye); const dist = dir.length(); dir.normalize();
  raycaster.set(eye, dir); raycaster.far = dist + 0.05;
  const h = raycaster.intersectObjects(car.allMeshes, false)[0];
  return !!h && h.distance < dist - 0.04;
}
function pickCars(near) {
  if (near) { const d = c => carCenterW(c).setY(0).distanceTo(pov.feet); return activeCars().slice().sort((a, b) => d(a) - d(b) + (Math.random() - 0.5) * 2); }   // người vào xem: viết lên xe gần nhất cho đỡ đi xa
  const list = activeCars().slice().sort((a, b) => a.decals.length - b.decals.length + (Math.random() - 0.5) * 3);
  return list;
}
function findSlot(w, h, near) {
  for (let round = 0; round < 5; round++) {
    for (const car of pickCars(near)) for (const k of [1, 0.85, 0.7]) {
      const s = findSlotOnce(car, w * k, h * k, k === 1 ? 160 : 100);
      if (s) { s.scale = k; return s; }
    }
    if (!removeOldest()) break;
  }
  return null;
}
let _lr = null, _lrKey = '';
function reservedLogo() { const k = JSON.stringify(CFG.logo) + cars.length; if (k !== _lrKey) { _lrKey = k; _lr = logoSides().map(sd => logoSlot(sd)).filter(Boolean); } return _lr; }
function logoSides() { const a = CFG.logo.side >= 0 ? 1 : -1; return [a, -a]; }
// cửa trống đầu tiên; cả 2 cửa đã có người thì thay người cũ nhất
function pickLogoSide() { const sides = logoSides(); const freeSide = sides.find(sd => !logos[sd]); return freeSide !== undefined ? freeSide : sides.reduce((a, b) => (logos[a].t <= logos[b].t ? a : b)); }
function logoSlot(sideArg) {
  const car = carById(CFG.logo.car) || cars[0]; if (!car) return null;
  const b = car.lbPaint, c = b.getCenter(V3()), s = b.getSize(V3()); const sd = sideArg !== undefined ? sideArg : (CFG.logo.side >= 0 ? 1 : -1);
  const o = V3(c.x + sd * (s.x / 2 + 3), b.min.y + s.y * CFG.logo.height, c.z + s.z * CFG.logo.along).applyMatrix4(car.group.matrixWorld);
  const d = V3(-sd, 0, 0).transformDirection(car.group.matrixWorld);
  const hit = hitPaint(car, o, d); if (!hit) return null;
  const size = CFG.logo.size; const st = standFor(car, hit.point, hit.n, size * 1.3, size * 1.3) || { cam: hit.point.clone().addScaledVector(hit.n, 1.8).setY(1.4), feet: hit.point.clone().addScaledVector(hit.n, 1.8).setY(0), eye: 1.4 };
  const { X, Y } = basisFor(hit.point, hit.n, st.cam);
  return { car, p: hit.point, n: hit.n, X, Y, stand: st };
}

// ================= DECAL =================
function decalMaterial(tex, kind) {
  const ink = INK[kind];
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, metalness: ink ? ink.metal : 0.05, roughness: ink ? ink.rough : 0.45 });
  if (kind === 'gold') { m.emissive = new THREE.Color(0xffb300); m.emissiveMap = tex; m.emissiveIntensity = 0.15; }
  if (kind === 'silver') { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = tex; m.emissiveIntensity = 0.06; }
  if (kind === 'logo') { m.metalness = 0.55; m.roughness = 0.3; m.emissive = new THREE.Color(0xffffff); m.emissiveMap = tex; m.emissiveIntensity = 0.08; }
  return m;
}
function buildDecal(car, slot, center, w, h, tex, kind) {
  const euler = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(slot.X, slot.Y, slot.n));
  const size = V3(w, h, Math.max(0.25, Math.min(w, h) * 1.2));
  const mat = decalMaterial(tex, kind); const group = new THREE.Group();
  const inv = car.group.matrixWorld.clone().invert(); const rad = Math.hypot(w, h) / 2 + 0.2;
  for (const m of car.paintMeshes) {
    if (!m.visible) continue;
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    const bs = m.geometry.boundingSphere.clone().applyMatrix4(m.matrixWorld);
    if (bs.center.distanceTo(center) > bs.radius + rad) continue;
    const g = new DecalGeometry(m, center, euler, size);
    if (g.attributes.position.count === 0) { g.dispose(); continue; }
    g.applyMatrix4(inv);
    const dm = new THREE.Mesh(g, mat); dm.renderOrder = 2; group.add(dm);
  }
  car.decalGroup.add(group); return { group, mat };
}
function canvasTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function revealer(full) {
  const c = document.createElement('canvas'); c.width = full.width; c.height = full.height; const g = c.getContext('2d'); const tex = canvasTex(c);
  return {
    tex,
    linear(t) { g.clearRect(0, 0, c.width, c.height); const w = c.width * t; if (w > 0) g.drawImage(full, 0, 0, w, c.height, 0, 0, w, c.height); tex.needsUpdate = true; },
    radial(t) { g.clearRect(0, 0, c.width, c.height); if (t > 0) { g.save(); g.beginPath(); g.moveTo(c.width / 2, c.height / 2); g.arc(c.width / 2, c.height / 2, c.width, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t); g.closePath(); g.clip(); g.drawImage(full, 0, 0); g.restore(); } tex.needsUpdate = true; },
    scan(t) { g.clearRect(0, 0, c.width, c.height); const hh = c.height * t; if (hh > 0) g.drawImage(full, 0, 0, c.width, hh, 0, 0, c.width, hh); tex.needsUpdate = true; },
    full() { g.clearRect(0, 0, c.width, c.height); g.drawImage(full, 0, 0); tex.needsUpdate = true; },
  };
}
function disposeEntry(e) {
  e.groups.forEach(g => { g.parent && g.parent.remove(g); g.traverse(o => o.geometry && o.geometry.dispose()); });
  e.mats.forEach(m => { m.map && m.map.dispose(); m.dispose(); });
}
function allDecals() { return cars.flatMap(c => c.decals); }
function removeOldest(onlyJoin) {
  const all = allDecals().filter(d => !onlyJoin || d.kind === 'join'); if (!all.length) return false;
  const e = all.reduce((a, b) => (a.t <= b.t ? a : b)); const car = e.car; car.decals.splice(car.decals.indexOf(e), 1);
  api.removeRecord && api.removeRecord(e.id);
  animate(0.8, k => e.mats.forEach(m => m.opacity = 1 - k)).then(() => disposeEntry(e));
  return true;
}
function enforceMax() {
  while (allDecals().filter(d => d.kind === 'join').length > (CFG.join.maxNames ?? 40)) if (!removeOldest(true)) break;
  while (allDecals().length > CFG.maxNames) if (!removeOldest(allDecals().some(d => d.kind === 'join')) && !removeOldest()) break;   // xoá tên người vào xem trước
}
function clearAll() { cars.forEach(c => { c.decals.splice(0).forEach(disposeEntry); }); for (const k of Object.keys(logos)) { disposeEntry(logos[k]); delete logos[k]; } }
function slotToLocal(s) { const c = s.car, m = c.group.matrixWorld.clone().invert(); return { car: c.def.id, scale: s.scale || 1, p: s.p.clone().applyMatrix4(m).toArray(), n: s.n.clone().transformDirection(m).toArray(), X: s.X.clone().transformDirection(m).toArray(), Y: s.Y.clone().transformDirection(m).toArray() }; }
function slotFromLocal(o) {
  const car = carById(o.car || 'x3'); if (!car) return null; const m = car.group.matrixWorld;
  return { car, scale: o.scale || 1, p: V3().fromArray(o.p).applyMatrix4(m), n: V3().fromArray(o.n).transformDirection(m), X: V3().fromArray(o.X).transformDirection(m), Y: V3().fromArray(o.Y).transformDirection(m) };
}

// ================= ANIM HELPERS =================
const wait = ms => new Promise(r => setTimeout(r, ms));
const tickers = new Set();
function animate(dur, fn) { return new Promise(res => tickers.add({ t: 0, dur, fn, res })); }
function runTickers(dt) { for (const tk of [...tickers]) { tk.t += dt; const k = Math.min(1, tk.t / tk.dur); tk.fn(k, dt); if (k >= 1) { tickers.delete(tk); tk.res(); } } }
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

// ================= POV (camera trên) =================
const pov = {
  feet: V3(0, 0, roomHalf * 0.7), eye: 1.62, eyeTarget: 1.62, look: V3(0, 1, 0), lookTarget: V3(0, 1, 0),
  path: [], pathI: 0, moving: 0, phase: 0, speedMul: 1, focus: null, onArrive: null, wanderWait: 2, lastCar: null, controlled: false, lastStep: 0,
};
function povGo(feet, focus, eye = 1.62) {
  return new Promise(res => {
    pov.path = findPath(pov.feet, feet); pov.pathI = 1; pov.focus = focus; pov.eyeTarget = 1.62; pov.finalEye = eye;
    pov.onArrive = res;
  });
}
function povWander() {
  const list = activeCars(); if (!list.length) return;
  let car = list[Math.floor(Math.random() * list.length)]; if (list.length > 1 && car === pov.lastCar) car = list[(list.indexOf(car) + 1) % list.length];
  pov.lastCar = car;
  const c = carCenterW(car); const L = car.lbAll.getSize(V3()); const R = Math.max(L.x, L.z) / 2 + 1.6 + Math.random() * 1.2;
  for (let k = 0; k < 12; k++) {
    const a = Math.random() * Math.PI * 2; const f = V3(c.x + Math.cos(a) * R, 0, c.z + Math.sin(a) * R);
    if (Math.abs(f.x) < roomHalf - 0.5 && Math.abs(f.z) < roomHalf - 0.5 && free(f.x, f.z)) {
      povGo(f, c.clone().setY(0.7 + Math.random() * 0.3), 1.62).then(() => { pov.wanderWait = 2.5 + Math.random() * 3; });
      return;
    }
  }
}
function updatePOV(dt, t) {
  const sh = CFG.pov.shake;
  // di chuyển theo đường
  let moving = false;
  if (pov.path.length && pov.pathI < pov.path.length) {
    const tgt = pov.path[pov.pathI]; const d = V3(tgt.x - pov.feet.x, 0, tgt.z - pov.feet.z); const dist = d.length();
    const sp = CFG.pov.walkSpeed * pov.speedMul;
    if (dist < 0.05) pov.pathI++;
    else { d.normalize(); const step = Math.min(dist, sp * dt * Math.min(1, 0.35 + pov.moving)); pov.feet.addScaledVector(d, step); moving = true; pov.travel = d; }
    const remain = pov.path.slice(pov.pathI).reduce((s, p, i, arr) => s + (i ? p.distanceTo(arr[i - 1]) : p.distanceTo(pov.feet)), 0);
    // nhìn: hướng đi -> chuyển dần sang điểm focus khi gần đến
    const ahead = pov.feet.clone().addScaledVector(pov.travel || V3(0, 0, -1), 3).setY(pov.eye - 0.25);
    const k = pov.focus ? THREE.MathUtils.clamp(1 - (remain - 0.5) / 2.5, 0, 1) : 0;
    pov.lookTarget.copy(ahead).lerp(pov.focus || ahead, k);
    if (pov.pathI >= pov.path.length) { pov.path = []; pov.eyeTarget = pov.finalEye || 1.62; }
  } else if (pov.onArrive) {
    if (pov.focus) pov.lookTarget.copy(pov.focus);
    if (Math.abs(pov.eye - pov.eyeTarget) < 0.03 && pov.look.distanceTo(pov.lookTarget) < 0.08) { const f = pov.onArrive; pov.onArrive = null; f(); }
  } else if (!pov.controlled && CFG.pov.idleWander && ready) {
    pov.wanderWait -= dt; if (pov.wanderWait <= 0) { pov.wanderWait = 999; povWander(); }
  }
  pov.moving = damp(pov.moving, moving ? 1 : 0, 6, dt);
  pov.eye = damp(pov.eye, pov.eyeTarget, 2.5, dt);
  pov.look.x = damp(pov.look.x, pov.lookTarget.x, pov.lookRate || 3.2, dt); pov.look.y = damp(pov.look.y, pov.lookTarget.y, pov.lookRate || 3.2, dt); pov.look.z = damp(pov.look.z, pov.lookTarget.z, pov.lookRate || 3.2, dt);
  // nhún bước + lắc + rung tay
  const sp = CFG.pov.walkSpeed * pov.speedMul; pov.phase += dt * pov.moving * sp / 0.72 * Math.PI;
  const prevStep = Math.floor(pov.lastPhase / Math.PI || 0); pov.lastPhase = pov.phase;
  if (Math.floor(pov.phase / Math.PI) !== prevStep && pov.moving > 0.5) footstep(pov.moving);
  const m = pov.moving * sh, write = pov.controlled && !moving ? 0.55 : 1;
  const bobY = m * 0.045 * Math.abs(Math.sin(pov.phase)) - m * 0.02;
  const side = m * 0.035 * Math.sin(pov.phase * 0.5) * 2;
  const roll = m * 0.022 * Math.sin(pov.phase * 0.5 + 0.4) + sh * write * 0.006 * Math.sin(t * 0.7);
  const breath = sh * write * 0.006 * Math.sin(t * 1.6);
  const nY = sh * write * (0.0045 * Math.sin(t * 1.1) + 0.003 * Math.sin(t * 2.7 + 1.3) + 0.0015 * Math.sin(t * 7.1));
  const nX = sh * write * (0.004 * Math.sin(t * 0.9 + 2) + 0.0025 * Math.sin(t * 3.1) + 0.0012 * Math.sin(t * 8.3 + 0.5)) + m * 0.01 * Math.sin(pov.phase * 2);
  const pos = V3(pov.feet.x, pov.eye + bobY + breath, pov.feet.z);
  camTop.position.copy(pos); camTop.lookAt(pov.look);
  const right = V3(1, 0, 0).applyQuaternion(camTop.quaternion); camTop.position.addScaledVector(right, side);
  camTop.rotateZ(roll); camTop.rotateY(nY); camTop.rotateX(nX);
  const fT = pov.fovTarget || CFG.pov.fov; if (Math.abs(camTop.fov - fT) > 0.01) { camTop.fov = damp(camTop.fov, fT, 2.2, dt); camTop.updateProjectionMatrix(); }
}

// ================= CAMERA DƯỚI =================
const bot = { target: V3(), az: 0.8, el: 0.32, dist: 12, cur: null, manual: false, cycleT: 0, cycleI: 0, label: '' };
function botDesired(dt) {
  const B = CFG.bot;
  if (current && current.slot && B.follow && !bot.manual) {
    const c = current.slot.car, ctr = carCenterW(c), n = current.slot.n;
    const az = Math.atan2(n.x, n.z) + 0.55 * Math.sin(perfT * 0.15);
    const L = c.lbAll.getSize(V3()); return { target: ctr.setY(0.6), az, el: 0.33, dist: Math.max(L.x, L.z) * 1.35, label: 'Đang ký · ' + (c.def.name || '') };
  }
  if (bot.manual) return null;
  if ((B.mode === 'preset' || B.mode === 'cycle') && (B.presets || []).length) {
    let i = B.preset || 0;
    if (B.mode === 'cycle') { bot.cycleT += dt; if (bot.cycleT > (B.cycle || 8)) { bot.cycleT = 0; bot.cycleI = (bot.cycleI + 1) % B.presets.length; } i = bot.cycleI; }
    const p = B.presets[Math.min(i, B.presets.length - 1)];
    return { target: V3().fromArray(p.target), az: p.az, el: p.el, dist: p.dist, label: p.name };
  }
  // auto xoay
  const car = B.car && B.car !== 'all' ? carById(B.car) : null;
  bot.autoAz = (bot.autoAz ?? bot.az) + dt * 0.12 * (B.speed ?? 1);
  if (car && car.group.visible) { const L = car.lbAll.getSize(V3()); return { target: carCenterW(car).setY(0.6), az: bot.autoAz, el: 0.3, dist: Math.max(L.x, L.z) * 1.45, label: 'Tự xoay · ' + car.def.name }; }
  return { target: V3(0, 0.6, 0), az: bot.autoAz, el: 0.38, dist: Math.min(roomHalf * 1.05, 14), label: 'Tự xoay · Showroom' };
}
function angDamp(a, b, l, dt) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * (1 - Math.exp(-l * dt)); }
function updateBot(dt) {
  const d = botDesired(dt);
  if (d) {
    const r = current ? 1.6 : 2.2;
    bot.target.x = damp(bot.target.x, d.target.x, r, dt); bot.target.y = damp(bot.target.y, d.target.y, r, dt); bot.target.z = damp(bot.target.z, d.target.z, r, dt);
    bot.az = angDamp(bot.az, d.az, r, dt); bot.el = damp(bot.el, d.el, r, dt); bot.dist = damp(bot.dist, d.dist, r, dt);
    if (d.label !== bot.label) { bot.label = d.label; setCamLabel(d.label); }
    if (!current) bot.autoAz = bot.az;
  }
  const off = V3(Math.sin(bot.az) * Math.cos(bot.el), Math.sin(bot.el), Math.cos(bot.az) * Math.cos(bot.el)).multiplyScalar(bot.dist);
  const p = bot.target.clone().add(off);
  p.x = THREE.MathUtils.clamp(p.x, -roomHalf + 0.3, roomHalf - 0.3); p.z = THREE.MathUtils.clamp(p.z, -roomHalf + 0.3, roomHalf - 0.3); p.y = THREE.MathUtils.clamp(p.y, 0.25, 3.0);
  camBot.position.copy(p); camBot.lookAt(bot.target);
}
// chuột ở nửa dưới: kéo trái = xoay, kéo phải = dời, lăn = zoom
let drag = null;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (e.clientY < window.innerHeight * CFG.split) return;
  drag = { x: e.clientX, y: e.clientY, b: e.button }; bot.manual = true; setCamLabel('Tay — lưu góc trong Bảng điều khiển'); bot.label = 'manual';
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (drag.b === 0) { bot.az -= dx * 0.006; bot.el = THREE.MathUtils.clamp(bot.el + dy * 0.004, 0.02, 1.45); }
  else { const r = V3(1, 0, 0).applyQuaternion(camBot.quaternion).setY(0).normalize(); const f = V3(0, 0, -1).applyQuaternion(camBot.quaternion).setY(0).normalize(); const k = bot.dist * 0.0015; bot.target.addScaledVector(r, -dx * k).addScaledVector(f, dy * k); }
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', e => { if (e.clientY < window.innerHeight * CFG.split) return; bot.manual = true; bot.dist = THREE.MathUtils.clamp(bot.dist * (e.deltaY > 0 ? 1.08 : 0.93), 1.2, 30); e.preventDefault(); }, { passive: false });
function currentCam() { return { target: bot.target.toArray().map(v => +v.toFixed(3)), az: +bot.az.toFixed(4), el: +bot.el.toFixed(4), dist: +bot.dist.toFixed(3) }; }

// ================= JOB RUNNER =================
const AVATAR_T = { small: 1, big: 1, silver: 1, gold: 1 };
function layout(job, fam) {
  const th = job.type === 'join' ? (CFG.join.size || 0.09) : (CFG.sizes[job.type] || 0.14); const textC = makeTextCanvas(job.name, job.type, fam);
  let tw = th * textC.width / textC.height; let ah = AVATAR_T[job.type] ? th * (CFG.avatarScale[job.type] || 1) : 0;
  const gap = ah ? th * 0.15 : 0; let total = ah + gap + tw;
  const maxW = 1.5; if (total > maxW) { const k = maxW / total; tw *= k; ah *= k; total = maxW; }
  return { textC, tw, th: tw * textC.height / textC.width, ah, gap, total, boxH: Math.max(ah, tw * textC.height / textC.width) };
}
async function runJob(job) {
  busy = true; current = job; updateQueueHUD(); pov.controlled = true; pov.speedMul = job.type === 'join' ? 1.6 : queue.length > 2 ? 1.7 : 1.15;
  try { if (job.type === 'logo') await runLogo(job); else await runWrite(job); } catch (e) { console.error(e); }
  pen.visible = false; stopScribble();
  pov.fovTarget = 0;
  current = null; showBanner(null); busy = false; pov.controlled = false; pov.wanderWait = 1.5; pov.lookRate = 3.2; updateQueueHUD(); report();
}
// mắt POV 'nheo lại' (zoom) cho chữ chiếm ~60% bề ngang
function zoomTo(w, p) {
  const dist = camTop.position.distanceTo(p); const hf = 2 * Math.atan((w / 0.6) / 2 / dist);
  const vf = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hf / 2) / topAspect()));
  pov.fovTarget = THREE.MathUtils.clamp(vf, CFG.pov.zoomMin || 24, CFG.pov.fov);
}
function surfacePoint(car, slot, w, h, u, v, center) {
  const q = center.clone().addScaledVector(slot.X, (u - 0.5) * w).addScaledVector(slot.Y, (v - 0.5) * h);
  const hit = hitPaint(car, q.clone().addScaledVector(slot.n, 0.3), slot.n.clone().negate(), 0.7);
  return hit ? hit.point : q;
}
async function penInFromHand(target, n, scale) {
  // bút đi từ góc dưới phải của POV vào điểm bắt đầu
  const right = V3(1, 0, 0).applyQuaternion(camTop.quaternion), upv = V3(0, 1, 0).applyQuaternion(camTop.quaternion), fwd = V3(0, 0, -1).applyQuaternion(camTop.quaternion);
  const start = camTop.position.clone().addScaledVector(fwd, 0.45).addScaledVector(right, 0.28).addScaledVector(upv, -0.3);
  pen.visible = true;
  await animate(0.55, k => { const e = ease(k); const p = start.clone().lerp(target, e); placePen(p, n, scale, (1 - e) * 0.05); });
}
async function runWrite(job, instant = false, rec = null) {
  const fam = (rec && rec.font) || CFG.fonts[job.type] || 'Dancing Script';
  try { await document.fonts.load(fontStr(80, fam), job.name); } catch (e) { }
  const img = await loadImg(job.avatar || initialsAvatar(job.name));
  INK_NOW = rec && rec.ink || CFG.inkColor;
  let L = layout(job, fam);
  let slot = rec ? slotFromLocal(rec.slot) : findSlot(L.total, L.boxH, job.type === 'join');
  if (!slot) { console.warn('Hết chỗ trên xe'); return; }
  const car = slot.car; const sc = slot.scale || 1;
  if (!rec) { INK_NOW = inkFor(car); L = layout(job, fam); }
  if (sc !== 1) for (const k of ['tw', 'th', 'ah', 'gap', 'total', 'boxH']) L[k] *= sc;
  const left = -L.total / 2;
  const avC = L.ah ? slot.p.clone().addScaledVector(slot.X, left + L.ah / 2) : null;
  const txC = slot.p.clone().addScaledVector(slot.X, left + L.ah + L.gap + L.tw / 2);
  let avR, avD; const txR = revealer(L.textC);
  if (L.ah) { avR = revealer(makeAvatarCanvas(img, job.type)); avD = buildDecal(car, slot, avC, L.ah, L.ah, avR.tex, 'avatar'); }
  const txD = buildDecal(car, slot, txC, L.tw, L.th, txR.tex, INK[job.type] ? job.type : 'ink');
  const recOut = rec || { id: job.id, type: job.type, name: job.name, avatar: job.avatar || '', font: fam, ink: INK_NOW, slot: slotToLocal(slot), t: Date.now() };
  const entry = { id: recOut.id, car, t: recOut.t, groups: [txD.group, avD && avD.group].filter(Boolean), mats: [txD.mat, avD && avD.mat].filter(Boolean), centerL: toLocal(car, slot.p), radius: Math.hypot(L.total, L.boxH) / 2, kind: job.type };
  if (instant) { avR && avR.full(); txR.full(); entry.shine = !!INK[job.type]; car.decals.push(entry); return; }
  avR && avR.radial(0); txR.linear(0);
  current.slot = slot; job.carName = car.def.name; showBanner(job, car.def.name);
  say(fillTpl(CFG.voice.write[job.type], job));
  const inkCol = INK[job.type] ? INK[job.type].pen : INK_NOW;
  setInk(job.type === 'like' ? 0 : 1, inkCol, !!INK[job.type]);
  // đi bộ tới chỗ viết
  await povGo(slot.stand.feet, slot.p.clone(), slot.stand.eye);
  pov.lookRate = 2.2;
  zoomTo(L.total, slot.p);
  const penScale = 0.16 * Math.max(1, L.th / 0.15);
  if (job.type === 'like') {   // bơm mực trước mặt
    const right = V3(1, 0, 0).applyQuaternion(camTop.quaternion), fwd = V3(0, 0, -1).applyQuaternion(camTop.quaternion), upv = V3(0, 1, 0).applyQuaternion(camTop.quaternion);
    pen.visible = true; $('pump').classList.add('show'); $('pumpName').textContent = job.name;
    await animate(1.5, (k) => {
      const base = camTop.position.clone().addScaledVector(fwd, 0.42).addScaledVector(right, 0.07).addScaledVector(upv, -0.07 + 0.02 * Math.sin(k * 20));
      const ax = upv.clone().multiplyScalar(0.9).addScaledVector(right, 0.35).addScaledVector(fwd, -0.15).normalize();
      _q.setFromUnitVectors(UP, ax); pen.quaternion.copy(_q); pen.scale.setScalar(0.16); pen.position.copy(base).addScaledVector(ax, -0.08);
      setInk(k, inkCol, false); $('pumpBar').style.width = Math.round(k * 100) + '%';
    });
    $('pump').classList.remove('show');
  }
  const sp = 1 / Math.max(0.2, CFG.writeSpeed * (job.type === 'join' ? (CFG.join.speed || 1.8) : 1));
  const first = L.ah ? surfacePoint(car, slot, L.ah, L.ah, 0.5, 0.97, avC) : surfacePoint(car, slot, L.tw, L.th, 0.06, 0.5, txC);
  await penInFromHand(first, slot.n, penScale);
  startScribble();
  if (L.ah) {
    await animate(1.3 * sp, k => {
      avR.radial(k); const a = -Math.PI / 2 + k * Math.PI * 2;
      const pt = surfacePoint(car, slot, L.ah, L.ah, 0.5 + Math.cos(a) * 0.47, 0.5 - Math.sin(a) * 0.47, avC);
      placePen(pt, slot.n, penScale); scribbleLevel(0.7); pov.lookTarget.copy(slot.p).lerp(pt, 0.3);
    });
  }
  const dur = Math.min(6, Math.max(1.4, Math.max(3, [...job.name].length) * 0.22)) * sp; let tt = 0;
  await animate(dur, (k, dt) => {
    tt += dt; const u = 0.06 + k * 0.9; txR.linear(Math.min(1, u + 0.03));
    const v = 0.5 + Math.sin(tt * 26) * 0.18 + Math.sin(tt * 11) * 0.08;
    const pt = surfacePoint(car, slot, L.tw, L.th, u, v, txC);
    placePen(pt, slot.n, penScale, Math.max(0, Math.sin(tt * 26)) * 0.004);
    setInk(Math.max(0.15, 1 - k * 0.35), null, !!INK[job.type]);
    scribbleLevel(0.5 + 0.5 * Math.abs(Math.sin(tt * 13))); pov.lookTarget.copy(slot.p).lerp(pt, 0.35);
  });
  txR.full(); stopScribble();
  const p0 = pen.position.clone();
  await animate(0.45, k => { pen.position.copy(p0).addScaledVector(slot.n, k * 0.12).addScaledVector(V3(0, -1, 0), k * 0.15); });
  pen.visible = false;
  if (job.type !== 'join' || CFG.join.chime) chime(job.type === 'join' ? 'like' : job.type);
  const bc = slot.p.clone().addScaledVector(slot.n, 0.03);
  if (INK[job.type]) burst(bc, slot.n, job.type === 'gold' ? 0xffcc44 : 0xe8eef8, job.type === 'gold' ? 140 : 90, Math.max(0.4, L.total * 0.7));
  else burst(bc, slot.n, 0xffffff, 40, Math.max(0.3, L.total * 0.5));
  entry.shine = !!INK[job.type]; car.decals.push(entry); enforceMax();
  api.saveRecord && api.saveRecord(recOut);
  say(fillTpl(CFG.voice.thank[job.type], job));
  pov.lookTarget.copy(slot.p);
  await wait((job.type === 'join' ? Math.min(0.6, CFG.holdSeconds) : CFG.holdSeconds) * 1000);
}
async function runLogo(job, instant = false, rec = null) {
  const fam = (rec && rec.font) || CFG.fonts.logo || 'Pacifico';
  try { await document.fonts.load(fontStr(80, fam), job.name); } catch (e) { }
  const img = await loadImg(job.avatar || initialsAvatar(job.name));
  const side = rec && rec.side !== undefined && !logos[rec.side] ? rec.side : pickLogoSide();
  const slot = logoSlot(side); if (!slot) { console.warn('Không tìm thấy vị trí logo'); return; }
  const car = slot.car; const R = revealer(makeLogoCanvas(img, job.name, fam)); const size = CFG.logo.size;
  const old = logos[side]; const d = buildDecal(car, slot, slot.p, size, size, R.tex, 'logo');
  const recOut = rec || { id: job.id, type: 'logo', name: job.name, avatar: job.avatar || '', font: fam, t: Date.now() };
  const entry = { id: recOut.id, car, groups: [d.group], mats: [d.mat], kind: 'logo', shine: true, side, t: recOut.t || 0, name: job.name };
  if (instant) { R.full(); if (old) { disposeEntry(old); api.removeRecord && api.removeRecord(old.id); } logos[side] = entry; return; }
  R.scan(0);
  current.slot = slot; job.carName = car.def.name; showBanner(job, car.def.name);
  say(fillTpl(CFG.voice.write.logo, job));
  await povGo(slot.stand.feet, slot.p.clone(), slot.stand.eye);
  zoomTo(size * 1.25, slot.p);
  for (const e of [...car.decals]) if (e.centerL.distanceTo(toLocal(car, slot.p)) < size * 0.62 + e.radius * 0.8) { car.decals.splice(car.decals.indexOf(e), 1); api.removeRecord && api.removeRecord(e.id); disposeEntry(e); }
  if (old) { api.removeRecord && api.removeRecord(old.id); await animate(0.6, k => old.mats.forEach(m => m.opacity = 1 - k)); disposeEntry(old); }
  const barG = new THREE.Group();
  barG.add(new THREE.Mesh(new THREE.PlaneGeometry(size * 1.08, size * 0.025), new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })),
    new THREE.Mesh(new THREE.PlaneGeometry(size * 1.2, size * 0.12), new THREE.MeshBasicMaterial({ map: radialTex([[0, 'rgba(255,220,120,0.9)'], [1, 'rgba(255,200,80,0)']]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  scene.add(barG); barG.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(slot.X, slot.Y, slot.n));
  chime('silver'); startScribble();
  await animate(3.2 / Math.max(0.3, CFG.writeSpeed), k => { R.scan(k); barG.position.copy(slot.p).addScaledVector(slot.Y, (0.5 - k) * size).addScaledVector(slot.n, 0.03); scribbleLevel(0.35 + 0.2 * Math.sin(k * 80)); });
  stopScribble(); scene.remove(barG); R.full();
  logos[side] = entry; chime('logo');
  for (let i = 0; i < 3; i++) setTimeout(() => burst(slot.p.clone().addScaledVector(slot.n, 0.05), slot.n, i % 2 ? 0xffffff : 0xffc83a, 160, size * 1.3), i * 350);
  api.saveRecord && api.saveRecord({ ...recOut, car: car.def.id, side });
  say(fillTpl(CFG.voice.thank.logo, job));
  await wait((CFG.holdSeconds + 1.5) * 1000);
}

// ================= QUEUE =================
function enqueue(job) {
  job.id = job.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  if (job.type === 'join') {                       // người vào xem: luôn xếp cuối, giữ tối đa N người mới nhất
    if (!CFG.join.enabled && !job.test) return;
    queue.push(job);
    const js = queue.filter(j => j.type === 'join'); const max = Math.max(1, CFG.join.maxQueue ?? 8);
    for (let i = 0; i < js.length - max; i++) queue.splice(queue.indexOf(js[i]), 1);
    updateQueueHUD(); report(); return;
  }
  { const i = queue.findIndex(j => j.type === 'join'); if (i >= 0 && job.type === 'like') { queue.splice(i, 0, job); updateQueueHUD(); report(); return; } }
  if (job.type !== 'like') { let i = queue.findIndex(j => j.type === 'like' || j.type === 'join'); if (i < 0) i = queue.length; queue.splice(i, 0, job); } else queue.push(job);
  updateQueueHUD(); report();
}
function report() { api.status && api.status({ queue: queue.map(j => ({ type: j.type, name: j.name })), current: current && { type: current.type, name: current.name }, names: allDecals().length, logo: logoList().map(l => l.name).join(', ') }); }

// ================= LOOP =================
let last = performance.now(), perfT = 0;
function resize() {
  renderer.setPixelRatio((window.devicePixelRatio || 1) * (CFG.renderScale || 1));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  api.status && api.status({ size: Math.round(window.innerWidth * (window.devicePixelRatio || 1)) + '×' + Math.round(window.innerHeight * (window.devicePixelRatio || 1)) });
}
window.addEventListener('resize', resize);
function frame(now) {
  const dt = Math.min(window.__DTCAP || 0.05, (now - last) / 1000); last = now; perfT += dt;
  runTickers(dt); updateBursts(dt); updatePOV(dt, perfT); updateBot(dt);
  for (const c of cars) for (const d of c.decals) if (d.shine) d.mats.forEach(m => { if (m.emissiveMap) m.emissiveIntensity = (d.kind === 'gold' ? 0.12 : 0.04) + Math.max(0, Math.sin(perfT * 2.2 + d.centerL.x * 3 + d.centerL.z)) * (d.kind === 'gold' ? 0.35 : 0.2); });
  for (const lg of logoList()) lg.mats.forEach(m => m.emissiveIntensity = 0.06 + Math.max(0, Math.sin(perfT * 1.6)) * 0.22);
  const W = window.innerWidth, H = window.innerHeight, hTop = Math.round(H * CFG.split);
  camTop.aspect = W / Math.max(1, hTop); camTop.updateProjectionMatrix();
  camBot.aspect = W / Math.max(1, H - hTop); camBot.updateProjectionMatrix();
  if (hTop > 0) { renderer.setViewport(0, H - hTop, W, hTop); renderer.setScissor(0, H - hTop, W, hTop); renderer.render(scene, camTop); }
  if (H - hTop > 0) { renderer.setViewport(0, 0, W, H - hTop); renderer.setScissor(0, 0, W, H - hTop); renderer.render(scene, camBot); }
  if (!busy && ready && queue.length) runJob(queue.shift());
  requestAnimationFrame(frame);
}

// ================= CONFIG / IPC =================
async function applyConfig(c) {
  const prevMusic = CFG.music && CFG.music.files; const prevCars = JSON.stringify(CFG.cars);
  const merged = { ...CFG, ...c };
  for (const k of ['sizes', 'avatarScale', 'logo', 'fonts', 'pov', 'bot', 'music', 'voice', 'likersBox', 'join']) merged[k] = { ...CFG[k], ...(c[k] || {}) };
  CFG = merged;
  for (const f of CFG.fontLib || []) if (f.url && !f._loaded) { try { const ff = new FontFace(f.family, `url("${f.url}")`); await ff.load(); document.fonts.add(ff); f._loaded = 1; } catch (e) { console.warn('font', f.family, e); } }
  for (const t of TIERS) try { await document.fonts.load(fontStr(64, CFG.fonts[t]), 'Ááằẫệ'); } catch (e) { }
  renderHUD(); resize(); applyMusic(prevMusic); placeLikers(); setLikers(lastLikers);
  if (cars.length && JSON.stringify(CFG.cars) !== prevCars) applyLayout();
  if (c.bot && (c.bot.mode !== undefined || c.bot.preset !== undefined || c.bot.car !== undefined)) { bot.manual = false; bot.cycleT = 0; bot.cycleI = CFG.bot.preset || 0; bot.label = ''; }
}
on('onConfig', c => applyConfig(c));
on('onJob', j => enqueue(j));
on('onLikers', l => setLikers(l));
on('onCommand', c => {
  if (c.cmd === 'clear') clearAll();
  if (c.cmd === 'removeLast') { const all = allDecals(); if (all.length) { const e = all.reduce((a, b) => (a.t >= b.t ? a : b)); e.car.decals.splice(e.car.decals.indexOf(e), 1); disposeEntry(e); api.removeRecord && api.removeRecord(e.id); } }
  if (c.cmd === 'clearQueue') { queue.length = 0; updateQueueHUD(); }
  if (c.cmd === 'previewLogo') { _lrKey = ''; const s = logoSlot(pickLogoSide()); if (s && !busy) { pov.controlled = true; povGo(s.stand.feet, s.p.clone(), s.stand.eye).then(() => setTimeout(() => { pov.controlled = false; pov.wanderWait = 1; }, 3000)); } }
  if (c.cmd === 'saveCam') api.addCamPreset && api.addCamPreset({ name: c.name || ('Góc ' + new Date().toLocaleTimeString('vi-VN')), ...currentCam() });
  if (c.cmd === 'botAuto') { bot.manual = false; bot.label = ''; }
  if (c.cmd === 'musicNext') musicNext();
  if (c.cmd === 'musicToggle') { if (music.paused) { if (!music.src) musicNext(); else music.play().catch(() => { }); } else music.pause(); }
  if (c.cmd === 'say') say(c.text);
  report();
});

// ================= START =================
on('onAssetProgress', p => { const el = $('loading'); if (el) el.textContent = p.text; });
(async function start() {
  resize(); renderHUD();
  const init = api.getInit ? await api.getInit() : { config: {}, history: [], urls: {} };
  await applyConfig(init.config || {});
  $('loading').textContent = 'Đang dựng showroom…';
  await loadShowroom(init.urls && init.urls.showroom);
  for (const def of CFG.cars) {
    const url = init.urls && init.urls[def.id]; if (!url) continue;
    $('loading').textContent = `Đang tải xe ${def.name}…`;
    try { await loadCar(def, url); } catch (e) { console.warn('car', def.id, e); }
  }
  applyLayout();
  pov.feet.set(0, 0, roomHalf * 0.6); const nf = nearestFree(0, roomHalf * 0.6); pov.feet.copy(cellCenter(nf[0], nf[1]));
  pov.look.set(0, 1, 0); pov.lookTarget.set(0, 1, 0);
  for (const r of (init.history || [])) {
    try { if (r.type === 'logo') await runLogo(r, true, r); else if (r.slot) await runWrite(r, true, r); } catch (e) { console.warn(e); }
  }
  $('loading') && $('loading').remove();
  ready = true; report();
  requestAnimationFrame(frame);
  window.__dbg = { camTop, camBot, pov, renderer, get split() { return CFG.split; } };
  if (window.__DTCAP) window.__test = { renderer, scene, camTop, camBot, enqueue, cars, queue, get busy() { return busy; }, CFG, pov, bot, findPath };
})();
