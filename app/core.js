// Car Sign Live — core (được cập nhật nóng qua GitHub; bootstrap ở main.js)
const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const DATA = app.getPath('userData');
const CFG_FILE = path.join(DATA, 'config.json');
const HIST_FILE = path.join(DATA, 'history.json');
const LOG_FILE = path.join(DATA, 'gift-debug.log');

const REPO = 'koddrawer/NameOnCar---Update';
const DEFAULT_CARS = [
  { id: 'x3', name: 'BMW X3 M40i', file: 'x3.glb', paint: '1347060001', length: 4.7, enabled: true, x: 0, z: 0, rot: -25, color: '' },
  { id: 'bmw330', name: 'BMW 330i', file: 'bmw330.glb', paint: '^CarPaint$', length: 4.71, enabled: true, x: -7, z: -6, rot: 35, color: '' },
  { id: 'camaro', name: 'Chevrolet Camaro', file: 'camaro.glb', paint: '^carpaint', length: 4.7, enabled: true, x: 7, z: -6, rot: -35, color: '' },
  { id: 'porsche', name: 'Porsche 911 GT3 RS', file: 'porsche.glb', paint: '^New_Material$', length: 4.57, enabled: true, x: -7, z: 6, rot: 145, color: '' },
  { id: 'bugatti', name: 'Bugatti Divo', file: 'bugatti.glb', paint: 'Paint_Material1', length: 4.64, enabled: true, x: 7, z: 6, rot: -145, color: '' },
];
const DEFAULTS = {
  tiktokUser: '', autoConnect: false,
  conn: { mode: 'connector', eulerKey: '', signKey: '', watchdog: 180 },
  likeThreshold: 100, likeRepeat: true,
  tiers: { small: 1, big: 5, silver: 10, gold: 30, logo: 100 },
  title: 'KÝ TÊN LÊN XE',
  legend: ['❤️ 100 tim: bơm mực, ký tên', '🪙 1 xu: avatar nhỏ', '🪙 5 xu: avatar to', '🥈 10 xu: mực bạc', '🥇 30 xu: mực vàng', '👑 100 xu: logo cửa xe'],
  fonts: { like: 'Dancing Script', small: 'Pacifico', big: 'Lobster', silver: 'Great Vibes', gold: 'Dancing Script', logo: 'Pacifico', join: 'Patrick Hand' },
  gfx: { quality: 'high', reflect: 0.32, blur: 1.5 },
  join: { enabled: false, size: 0.09, speed: 1.8, maxQueue: 8, maxNames: 40, onlyIdle: true, once: true, chime: false },
  userFonts: [],
  inkColor: '#111111', autoInk: true, inkLight: '#f4f1e8',
  sizes: { like: 0.13, small: 0.15, big: 0.19, silver: 0.21, gold: 0.24 },
  avatarScale: { small: 1.1, big: 1.9, silver: 1.9, gold: 2.1 },
  writeSpeed: 1, holdSeconds: 1.6, maxNames: 120, renderScale: 1,
  cars: DEFAULT_CARS,
  logo: { car: 'x3', side: 1, along: 0.06, height: 0.30, size: 0.68 },
  split: 0.5,
  windowMode: 'free',
  likersBox: { show: true, x: 0.025, y: 0.2, scale: 0.75, rows: 3 },
  pov: { shake: 1, walkSpeed: 1.4, fov: 58, zoomMin: 24, idleWander: true, steps: true },
  bot: { mode: 'auto', car: 'all', speed: 1, follow: true, cycle: 8, preset: 0, presets: [] },
  sound: true,
  music: { enabled: true, files: [], volume: 0.35, shuffle: true, duck: 0.3 },
  voice: {
    enabled: true, engine: 'edge', edgeVoice: 'vi-VN-HoaiMyNeural', rate: 0, volume: 1,
    write: { like: '{name} đã bơm đầy mực, ký tên lên {car}', small: '{name} đang ký tên lên {car}', big: '{name} ký tên thật to lên {car}', silver: '{name} ký tên bằng mực bạc lên {car}', gold: '{name} ký tên bằng mực vàng lên {car}', logo: 'Đại gia {name} xuất hiện! In avatar lên cửa {car}!' },
    thank: { like: 'Cảm ơn {name} đã thả 100 tim!', small: 'Cảm ơn {name} đã tặng {gift}!', big: 'Cảm ơn {name} đã tặng {gift}!', silver: 'Cảm ơn {name}! Chữ ký mực bạc thật đẹp!', gold: 'Cảm ơn {name}! Chữ ký mực vàng sang chảnh quá!', logo: 'Cảm ơn đại gia {name} rất nhiều!' },
  },
};

function readJSON(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function deepMerge(a, b) { const o = { ...a }; for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') ? deepMerge(a[k], b[k]) : b[k]; return o; }
let config = deepMerge(DEFAULTS, readJSON(CFG_FILE, {}));
// chuyển cấu hình bản 1.1 (1 xe) sang nhiều xe
if (config.carColor !== undefined) { const x3 = config.cars.find(c => c.id === 'x3'); if (x3 && config.carColor) x3.color = config.carColor; delete config.carColor; }
for (const d of DEFAULT_CARS) if (!config.cars.find(c => c.id === d.id)) config.cars.push({ ...d });
for (const k of ['font', 'fontWeight', 'fontFile', 'carPath', 'paintMaterial', 'orbitSpeed', 'orbitZoom', 'bgTop', 'bgBottom']) delete config[k];
let history = readJSON(HIST_FILE, []);
const saveConfig = () => fs.writeFileSync(CFG_FILE, JSON.stringify(config, null, 2));
let histTimer = null;
const saveHistory = () => { clearTimeout(histTimer); histTimer = setTimeout(() => fs.writeFileSync(HIST_FILE, JSON.stringify(history)), 400); };

let displayWin, controlWin;
const send = (w, ch, d) => { if (w && !w.isDestroyed()) w.webContents.send(ch, d); };
function log(msg) { const line = `[${new Date().toLocaleTimeString('vi-VN')}] ${msg}`; console.log(line); send(controlWin, 'log', line); }

function createWindows() {
  displayWin = new BrowserWindow({
    width: 540, height: 960, title: 'Car Sign Live — Màn hình LIVE', backgroundColor: '#05060a', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  displayWin.setAspectRatio(9 / 16);
  displayWin.webContents.once('did-finish-load', () => applyWindowMode());
  displayWin.loadFile(path.join(__dirname, 'display.html'));
  controlWin = new BrowserWindow({
    width: 600, height: 960, title: 'Car Sign Live — Bảng điều khiển', backgroundColor: '#11131a', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  controlWin.loadFile(path.join(__dirname, 'control.html'));
  displayWin.on('closed', () => { displayWin = null; app.quit(); });
  controlWin.on('closed', () => { controlWin = null; app.quit(); });
}

// ---------------- AVATAR ----------------
const avatarCache = new Map();
async function fetchAvatar(url) {
  if (!url) return '';
  if (avatarCache.has(url)) return avatarCache.get(url);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error(r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get('content-type') || 'image/jpeg';
    const d = `data:${type};base64,${buf.toString('base64')}`;
    avatarCache.set(url, d); return d;
  } catch (e) { log('Không tải được avatar: ' + e.message); return ''; }
}

// ---------------- JOBS ----------------
function tierFor(coins) {
  const t = config.tiers;
  if (coins >= t.logo) return 'logo';
  if (coins >= t.gold) return 'gold';
  if (coins >= t.silver) return 'silver';
  if (coins >= t.big) return 'big';
  if (coins >= t.small) return 'small';
  return null;
}
async function pushJob(type, user, extra = {}) {
  const avatar = await fetchAvatar(user.avatar);
  const job = { type, name: user.name || user.id || 'Ẩn danh', uniqueId: user.id, avatar, ...extra };
  send(displayWin, 'job', job);
  log(`→ ${type.toUpperCase()}: ${job.name}${extra.coins ? ` (${extra.coins} xu)` : ''}`);
}

// ---------------- LIKES ----------------
const likes = new Map(); // id -> {name, avatar, count, done}
let likersTimer = null;
function broadcastLikers() {
  if (likersTimer) return;
  likersTimer = setTimeout(() => {
    likersTimer = null;
    const list = [...likes.values()].filter(l => l.count > 0 && !(l.done && !config.likeRepeat)).sort((a, b) => b.count - a.count).slice(0, 3);
    send(displayWin, 'likers', list.map(l => ({ name: l.name, avatar: l.avatarData || '', count: l.count })));
  }, 700);
}
async function addLikes(user, n) {
  let l = likes.get(user.id);
  if (!l) { l = { name: user.name, avatar: user.avatar, count: 0, done: false }; likes.set(user.id, l); }
  if (l.done && !config.likeRepeat) return;
  l.name = user.name || l.name; l.count += n;
  if (!l.avatarData && user.avatar) fetchAvatar(user.avatar).then(d => { l.avatarData = d; broadcastLikers(); });
  if (l.count >= config.likeThreshold) {
    l.count -= config.likeThreshold; l.done = true;
    if (!config.likeRepeat) l.count = 0;
    pushJob('like', user);
  }
  broadcastLikers();
}

// ---------------- TIKTOK ----------------
// 2 chế độ: 'connector' = thư viện tiktok-live-connector (ký qua Euler, key tuỳ chọn)
//           'euler'     = Euler Stream WebSocket (máy chủ Euler giữ kết nối TikTok, cần API key)
const requireApp = m => require('module').createRequire(path.join(app.getAppPath(), 'package.json'))(m);
function normUser(d) {
  const u = d.user || d;
  const pic = d.profilePictureUrl || u.profilePictureUrl || u.profilePicture?.url?.[0] || u.profilePicture?.urls?.[0] || u.profilePicture?.urlList?.[0] || u.avatarThumb?.urlList?.[0] || u.avatarThumb?.url?.[0] || '';
  return { id: u.uniqueId || u.displayId || d.uniqueId || String(u.userId || d.userId || ''), name: u.nickname || d.nickname || u.uniqueId || u.displayId || 'Ẩn danh', avatar: pic };
}
let debugCount = 0;
const seenMsg = new Set(), seenQ = [];
function dup(id) { if (!id) return false; if (seenMsg.has(id)) return true; seenMsg.add(id); seenQ.push(id); if (seenQ.length > 3000) seenMsg.delete(seenQ.shift()); return false; }
function onGift(d) {
  touch('gift');
  const giftType = d.giftType ?? d.giftDetails?.giftType ?? d.gift?.type ?? d.giftDetails?.type;
  const repeatEnd = !!(Number(d.repeatEnd) || d.repeatEnd === true);
  if (debugCount < 5) { debugCount++; try { fs.appendFileSync(LOG_FILE, JSON.stringify(d, (k, v) => typeof v === 'bigint' ? String(v) : v).slice(0, 4000) + '\n\n'); } catch (e) { } }
  if (Number(giftType) === 1 && !repeatEnd) return;           // quà combo: chờ kết thúc chuỗi
  const user = normUser(d);
  const msgId = d.common?.msgId || d.msgId;
  if (dup(msgId ? 'g' + msgId : `g${user.id}|${d.groupId || ''}|${d.giftId || d.giftDetails?.id || ''}|${d.repeatCount}|${repeatEnd}`)) return;   // tránh trùng sau khi kết nối lại
  const diamond = Number(d.diamondCount ?? d.giftDetails?.diamondCount ?? d.gift?.diamondCount ?? d.extendedGiftInfo?.diamond_count ?? 0);
  const repeat = Number(d.repeatCount || 1);
  const coins = diamond * repeat;
  const giftName = d.giftName || d.giftDetails?.giftName || d.extendedGiftInfo?.name || d.gift?.name || 'quà';
  log(`🎁 ${user.name} tặng ${giftName} x${repeat} = ${coins} xu`);
  const tier = tierFor(coins);
  if (tier) pushJob(tier, user, { coins, gift: giftName });
}
// người vào xem live
const joined = new Set();
function onJoin(d) {
  touch();
  if (!config.join || !config.join.enabled) return;
  const msgId = d.common?.msgId || d.msgId; if (msgId && dup('j' + msgId)) return;
  const u = normUser(d); if (!u.id && !u.name) return;
  if (config.join.once !== false) { if (joined.has(u.id || u.name)) return; joined.add(u.id || u.name); }
  send(displayWin, 'job', { type: 'join', name: u.name || u.id, uniqueId: u.id, avatar: '' });
}
function onLike(d) {
  touch('like');
  const msgId = d.common?.msgId || d.msgId; if (msgId && dup('l' + msgId)) return;
  addLikes(normUser(d), Number(d.likeCount ?? d.count ?? 1));
}
function onViewers(d) { touch(); const v = d.viewerCount ?? d.total ?? d.totalUser; if (v !== undefined) send(controlWin, 'status', { viewers: Number(v) }); }

// ---- trạng thái kết nối (để theo dõi độ ổn định) ----
const CS = { state: 'off', mode: '', user: '', since: 0, lastEvent: 0, events: 0, gifts: 0, likes: 0, reconnects: 0, lastError: '', attempt: 0, startedAt: 0 };
function setState(state, extra = {}) { Object.assign(CS, { state }, extra); if (state === 'live') CS.since = Date.now(); pushStats(); send(controlWin, 'status', { connected: state === 'live' }); }
function touch(kind) { CS.lastEvent = Date.now(); CS.events++; if (kind === 'gift') CS.gifts++; if (kind === 'like') CS.likes++; if (CS.state === 'live' && CS.attempt && Date.now() - CS.since > 60000) CS.attempt = 0; }
function pushStats() { send(controlWin, 'connStats', { ...CS, now: Date.now() }); }
setInterval(pushStats, 2000);

let conn = null, eulerWs = null, reTimer = null, watchTimer = null, pingTimer = null, wantUser = '', gen = 0;
const CLOSE_TEXT = { 1000: 'Đóng bình thường', 1006: 'Mất mạng / đứt kết nối', 1011: 'Lỗi máy chủ Euler', 4005: 'Phiên LIVE đã kết thúc', 4006: 'Lâu không có tin nhắn', 4400: 'Tham số sai', 4401: 'API key Euler không hợp lệ', 4403: 'Gói Euler không có quyền WebSocket', 4404: 'Tài khoản chưa LIVE', 4408: 'Không trả lời ping', 4429: 'Quá số kết nối cho phép của gói Euler', 4500: 'TikTok đóng kết nối', 4555: 'Hết thời lượng tối đa 1 kết nối', 4556: 'Lỗi lấy dữ liệu TikTok', 4557: 'Lỗi lấy thông tin phòng' };
function retryDelay(code) {
  if ([4400, 4401, 4403].includes(code)) return -1;            // lỗi cấu hình: không thử lại
  if (code === 4404 || code === 4005) return 20000;             // chờ lên LIVE lại
  if (code === 4429) return 60000;
  if (code === 4555) return 500;                                // hết lifetime: nối lại ngay
  CS.attempt++; return Math.min(60000, 2000 * Math.pow(2, CS.attempt - 1));
}
function scheduleReconnect(code, why) {
  clearTimeout(reTimer); if (!wantUser) return;
  const d = retryDelay(code);
  if (d < 0) { setState('error', { lastError: why }); log(`⛔ ${why} — dừng tự kết nối. Kiểm tra lại cài đặt rồi bấm Kết nối.`); return; }
  setState(code === 4404 || code === 4005 ? 'waiting' : 'reconnecting', { lastError: why });
  log(`↻ ${why} — thử lại sau ${Math.round(d / 1000)} giây`);
  reTimer = setTimeout(() => { CS.reconnects++; openConnection(wantUser, true); }, d);
}
function startWatchdog(myGen) {
  clearInterval(watchTimer);
  watchTimer = setInterval(() => {
    if (myGen !== gen || CS.state !== 'live') return;
    const limit = (config.conn.watchdog || 180) * 1000;
    if (Date.now() - CS.lastEvent > limit) { log(`⚠️ ${Math.round(limit / 1000)} giây không có sự kiện — kết nối lại cho chắc`); closeCurrent(); scheduleReconnect(0, 'Watchdog'); }
  }, 5000);
}
function closeCurrent() {
  gen++; clearInterval(pingTimer); clearInterval(watchTimer);
  if (eulerWs) { const w = eulerWs; eulerWs = null; try { w.removeAllListeners(); w.on('error', () => { }); w.close(1000); setTimeout(() => { try { w.terminate(); } catch (e) { } }, 2000); } catch (e) { } }
  if (conn) { const c = conn; conn = null; try { c.removeAllListeners && c.removeAllListeners(); c.disconnect(); } catch (e) { } }
}
function openConnection(username, isRetry) {
  closeCurrent(); const myGen = gen;
  CS.mode = config.conn.mode; CS.user = username; if (!isRetry) { CS.startedAt = Date.now(); CS.reconnects = 0; CS.events = CS.gifts = CS.likes = 0; CS.attempt = 0; }
  setState('connecting');
  return config.conn.mode === 'euler' ? openEuler(username, myGen) : openConnector(username, myGen);
}
// ---- Euler Stream WebSocket ----
function openEuler(username, myGen) {
  return new Promise(resolve => {
    const key = String(config.conn.eulerKey || '').trim();
    if (!key) { setState('error', { lastError: 'Chưa nhập API key Euler' }); log('⛔ Chưa nhập API key Euler Stream'); return resolve({ ok: false, error: 'Chưa nhập API key Euler' }); }
    const WS = requireApp('ws');
    const q = new URLSearchParams({ uniqueId: username, 'features.bundleEvents': 'true', 'features.schemaVersion': 'v2' });
    q.set(key.split('.').length === 3 ? 'jwtKey' : 'apiKey', key);
    const base = config.conn.eulerUrl || 'wss://ws.eulerstream.com';
    const ws = new WS(`${base}?${q}`, { handshakeTimeout: 15000 }); eulerWs = ws;
    let opened = false, alive = true, done = false; const finish = r => { if (!done) { done = true; resolve(r); } };
    ws.on('open', () => {
      opened = true; CS.lastEvent = Date.now();
      setState('live'); log(`✅ Euler Stream: đã kết nối @${username}`); finish({ ok: true });
      clearInterval(pingTimer);
      pingTimer = setInterval(() => { if (!alive) { log('⚠️ Euler không trả lời ping — kết nối lại'); try { ws.terminate(); } catch (e) { } return; } alive = false; try { ws.ping(); } catch (e) { } }, 20000);
      startWatchdog(myGen);
    });
    ws.on('pong', () => { alive = true; });
    ws.on('message', (raw, isBinary) => {
      if (myGen !== gen) return; alive = true;
      let j; try { j = JSON.parse(isBinary ? raw.toString('utf8') : String(raw)); } catch (e) { return; }
      const items = Array.isArray(j) ? j : Array.isArray(j.messages) ? j.messages : [j];
      for (const it of items) {
        const type = it.type || it.event || ''; const data = it.data || it;
        try {
          if (/GiftMessage$/.test(type)) onGift(data);
          else if (/LikeMessage$/.test(type)) onLike(data);
          else if (/RoomUserSeqMessage$/.test(type)) onViewers(data);
          else if (/MemberMessage$/.test(type)) onJoin(data);
          else if (type === 'room.status') { touch(); if (data.state === 'ended' || data.state === 'offline') log('ℹ️ Euler: phòng ' + data.state); else if (data.state === 'reconnecting') log(`ℹ️ Euler đang nối lại TikTok (lần ${data.attempt || '?'})`); }
          else if (type === 'tiktok.disconnect') log('ℹ️ Euler: TikTok ngắt (' + (CLOSE_TEXT[data.reason] || data.reason) + ')');
          else if (type) touch();
        } catch (e) { log('Lỗi xử lý sự kiện ' + type + ': ' + e.message); }
      }
    });
    ws.on('unexpected-response', (req, res) => { log(`❌ Euler HTTP ${res.statusCode}`); });
    ws.on('error', e => { if (myGen === gen) CS.lastError = e.message; });
    ws.on('close', (code, reason) => {
      clearInterval(pingTimer);
      if (myGen !== gen) return; eulerWs = null;
      const why = `${CLOSE_TEXT[code] || 'Đóng'} (mã ${code}${reason && String(reason) ? ': ' + String(reason).slice(0, 80) : ''})`;
      if (!opened) log('❌ Euler: ' + why);
      finish({ ok: false, error: why });
      scheduleReconnect(code, why);
    });
  });
}
// ---- thư viện tiktok-live-connector ----
async function openConnector(username, myGen) {
  try {
    const mod = await global.CSL.importTikTok();
    const Conn = mod.TikTokLiveConnection || mod.WebcastPushConnection;
    const EV = mod.WebcastEvent || {};
    const opts = { processInitialData: false, enableExtendedGiftInfo: true };
    if (config.conn.signKey) opts.signApiKey = String(config.conn.signKey).trim();
    const c = new Conn(username, opts); conn = c;
    c.on(EV.GIFT || 'gift', d => myGen === gen && onGift(d));
    c.on(EV.LIKE || 'like', d => myGen === gen && onLike(d));
    c.on(EV.ROOM_USER || 'roomUser', d => myGen === gen && onViewers(d));
    c.on(EV.MEMBER || 'member', d => myGen === gen && onJoin(d));
    for (const ev of [EV.CHAT || 'chat', EV.SOCIAL || 'social']) c.on(ev, () => myGen === gen && touch());
    c.on(EV.STREAM_END || 'streamEnd', () => { if (myGen !== gen) return; closeCurrent(); scheduleReconnect(4005, 'Phiên LIVE đã kết thúc'); });
    c.on(EV.DISCONNECTED || 'disconnected', () => { if (myGen !== gen) return; closeCurrent(); scheduleReconnect(1006, 'Mất kết nối TikTok'); });
    c.on('error', e => { if (myGen === gen) CS.lastError = String(e?.message || e?.info || e).slice(0, 200); });
    const st = await c.connect();
    if (myGen !== gen) return { ok: false };
    CS.lastEvent = Date.now(); setState('live'); startWatchdog(myGen);
    log(`✅ Đã kết nối @${username} (room ${st?.roomId || ''})${config.conn.signKey ? ' · ký bằng API key Euler' : ''}`);
    return { ok: true };
  } catch (e) {
    if (myGen !== gen) return { ok: false };
    const msg = String(e?.message || e); const offline = /offline|not live|UserOffline|isn't online|LIVE has ended/i.test(msg) || e?.name === 'UserOfflineError';
    log('❌ Kết nối thất bại: ' + msg.slice(0, 200));
    closeCurrent(); scheduleReconnect(offline ? 4404 : /rate|429|limit/i.test(msg) ? 4429 : 0, offline ? 'Tài khoản chưa LIVE' : msg.slice(0, 120));
    return { ok: false, error: msg };
  }
}
async function connectTikTok(username) {
  username = String(username || '').replace(/^https?:\/\/(www\.)?tiktok\.com\//, '').replace(/\/live.*$/, '').replace(/^@/, '').trim();
  if (!username) return { ok: false, error: 'Chưa nhập username' };
  config.tiktokUser = username; saveConfig(); wantUser = username; clearTimeout(reTimer); joined.clear();
  return openConnection(username, false);
}
async function disconnectTikTok() { wantUser = ''; clearTimeout(reTimer); closeCurrent(); setState('off'); }

// ---------------- ASSETS (model xe, showroom) ----------------
const ASSET_DIR = path.join(DATA, 'assets');
const ASSETS = readJSON(path.join(__dirname, 'assets.json'), []);
const sha256 = buf => require('crypto').createHash('sha256').update(buf).digest('hex');
let assetsReady = null;
function assetProgress(text) { send(displayWin, 'assetProgress', { text }); send(controlWin, 'log', `[tải] ${text}`); }
async function download(url, onPct) {
  const r = await fetch(url, { headers: { 'User-Agent': 'CarSignLive' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const total = Number(r.headers.get('content-length')) || 0; const chunks = []; let got = 0, lastPct = -1;
  const reader = r.body.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; const p = total ? Math.floor(got / total * 100) : 0; if (p !== lastPct && p % 5 === 0) { lastPct = p; onPct && onPct(p); } }
  return Buffer.concat(chunks.map(c => Buffer.from(c)));
}
function ensureAssets() {
  if (assetsReady) return assetsReady;
  assetsReady = (async () => {
    fs.mkdirSync(ASSET_DIR, { recursive: true });
    const idxFile = path.join(ASSET_DIR, 'index.json'); const idx = readJSON(idxFile, {});
    const out = {};
    for (let i = 0; i < ASSETS.length; i++) {
      const a = ASSETS[i]; const dst = path.join(ASSET_DIR, a.file);
      const dev = path.join(__dirname, 'assets', a.file);           // khi chạy mã nguồn
      if (fs.existsSync(dev)) { const up = dev.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'); out[a.file] = up !== dev && fs.existsSync(up) ? up : dev; continue; }   // model có sẵn trong bộ cài
      if (idx[a.file] === a.sha256 && fs.existsSync(dst) && fs.statSync(dst).size === a.size) { out[a.file] = dst; continue; }
      try {
        const label = `${i + 1}/${ASSETS.length} ${a.label || a.file} (${(a.size / 1048576).toFixed(1)} MB)`;
        assetProgress(`Đang tải lần đầu ${label}… 0%`);
        const buf = await download(`https://raw.githubusercontent.com/${REPO}/main/assets/${a.file}`, p => assetProgress(`Đang tải lần đầu ${label}… ${p}%`));
        if (sha256(buf) !== a.sha256) throw new Error('sai mã kiểm tra');
        fs.writeFileSync(dst, buf); idx[a.file] = a.sha256; fs.writeFileSync(idxFile, JSON.stringify(idx));
        out[a.file] = dst;
      } catch (e) { log(`❌ Không tải được ${a.file}: ${e.message}`); if (fs.existsSync(dst)) out[a.file] = dst; }
    }
    return out;
  })();
  assetsReady.catch(() => { assetsReady = null; });
  return assetsReady;
}
async function carUrls() {
  const files = await ensureAssets(); const urls = {};
  for (const c of config.cars) {
    let f = c.path && fs.existsSync(c.path) ? c.path : c.file && files[c.file];
    if (!f && c.id === 'x3' && global.CSL.carFile && fs.existsSync(global.CSL.carFile)) f = global.CSL.carFile;   // xe gốc trong bộ cài
    if (f) urls[c.id] = pathToFileURL(f).href;
  }
  if (files['showroom.glb']) urls.showroom = pathToFileURL(files['showroom.glb']).href;
  return urls;
}
function glbMaterials(file) {
  try {
    const fd = fs.openSync(file, 'r'); const h = Buffer.alloc(20); fs.readSync(fd, h, 0, 20, 0);
    const len = h.readUInt32LE(12); const j = Buffer.alloc(len); fs.readSync(fd, j, 0, len, 20); fs.closeSync(fd);
    return [...new Set((JSON.parse(j.toString('utf8')).materials || []).map(m => m.name).filter(Boolean))];
  } catch (e) { return []; }
}

// ---------------- FONTS / NHẠC ----------------
function fontLib() {
  const base = readJSON(path.join(__dirname, 'fonts', 'fonts.json'), []);
  return [...base, ...(config.userFonts || []).filter(f => fs.existsSync(f.file)).map(f => ({ family: f.family, weight: f.weight || 400, url: pathToFileURL(f.file).href, user: true }))];
}
function displayConfig() {
  const c = JSON.parse(JSON.stringify(config));
  c.fontLib = fontLib();
  c.music.files = (config.music.files || []).filter(f => fs.existsSync(f.path)).map(f => ({ url: pathToFileURL(f.path).href, name: f.name }));
  return c;
}
function broadcastConfig() { send(displayWin, 'config', displayConfig()); send(controlWin, 'configChanged', config); }

// ---------------- KÍCH THƯỚC CỬA SỔ LIVE ----------------
const MODES = { '1080x1920': [1080, 1920], '720x1280': [720, 1280], '540x960': [540, 960] };
function applyWindowMode() {
  if (!displayWin || displayWin.isDestroyed()) return;
  const m = MODES[config.windowMode]; if (!m) { displayWin.setResizable(true); return; }
  if (displayWin.isMaximized()) displayWin.unmaximize(); if (displayWin.isFullScreen()) displayWin.setFullScreen(false);
  const sf = screen.getDisplayMatching(displayWin.getBounds()).scaleFactor || 1;   // Windows scale 125%/150%…
  const w = Math.round(m[0] / sf), h = Math.round(m[1] / sf);
  displayWin.setAspectRatio(0); displayWin.setResizable(true);
  displayWin.setContentSize(w, h); displayWin.setAspectRatio(9 / 16); displayWin.setResizable(false);
  const wa = screen.getDisplayMatching(displayWin.getBounds()).workArea; const b = displayWin.getBounds();
  if (b.y < wa.y || b.y > wa.y + wa.height - 80) displayWin.setPosition(b.x, wa.y);
  log(`🖥 Màn hình LIVE: ${m[0]}×${m[1]} px (scale Windows ${Math.round(sf * 100)}%)` + (h > wa.height ? ' — cao hơn màn hình, phần dưới vẫn được LIVE Studio quay' : ''));
}

// ---------------- GIỌNG NÓI (TTS) ----------------
const ttsCache = new Map();
function edgeTTS(text, voice, rate) {
  return new Promise((resolve, reject) => {
    const WS = requireApp('ws');
    const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
    let ticks = BigInt(Math.floor(Date.now() / 1000) + 11644473600); ticks -= ticks % 300n; ticks *= 10000000n;
    const gec = require('crypto').createHash('sha256').update(ticks.toString() + TOKEN).digest('hex').toUpperCase();
    const id = require('crypto').randomUUID().replace(/-/g, '');
    const ver = config.voice.edgeVersion || '1-143.0.3650.75';
    const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TOKEN}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${ver}&ConnectionId=${id}`;
    const ws = new WS(url, { headers: { Pragma: 'no-cache', 'Cache-Control': 'no-cache', Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold', 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver.split('-')[1].split('.')[0]}.0.0.0 Safari/537.36 Edg/${ver.split('-')[1]}` } });
    const chunks = []; const to = setTimeout(() => { try { ws.terminate(); } catch (e) { } reject(new Error('Edge TTS quá thời gian')); }, 12000);
    const ts = () => new Date().toString();
    const xmlEsc = t => t.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
    ws.on('open', () => {
      ws.send(`X-Timestamp:${ts()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`);
      const r = (rate >= 0 ? '+' : '') + Math.round(rate) + '%';
      ws.send(`X-RequestId:${id}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts()}Z\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'><voice name='${voice}'><prosody pitch='+0Hz' rate='${r}' volume='+0%'>${xmlEsc(text)}</prosody></voice></speak>`);
    });
    ws.on('message', (data, isBinary) => {
      if (isBinary) { const hl = data.readUInt16BE(0); const head = data.slice(2, 2 + hl).toString(); if (head.includes('Path:audio')) chunks.push(data.slice(2 + hl)); }
      else if (String(data).includes('Path:turn.end')) { clearTimeout(to); ws.close(); const b = Buffer.concat(chunks); b.length ? resolve(b) : reject(new Error('Edge TTS không trả âm thanh')); }
    });
    ws.on('error', e => { clearTimeout(to); reject(e); });
    ws.on('unexpected-response', (q, res) => { clearTimeout(to); reject(new Error('Edge TTS HTTP ' + res.statusCode)); });
  });
}
async function googleTTS(text) {
  const parts = []; let cur = '';
  for (const w of text.split(/\s+/)) { if ((cur + ' ' + w).length > 180) { parts.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }
  if (cur) parts.push(cur);
  const bufs = [];
  for (const p of parts) {
    const r = await fetch(`https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(p)}&tl=vi&client=tw-ob&ttsspeed=${config.voice.rate < -20 ? 0.8 : 1}`, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://translate.google.com/' } });
    if (!r.ok) throw new Error('Google TTS HTTP ' + r.status); bufs.push(Buffer.from(await r.arrayBuffer()));
  }
  return Buffer.concat(bufs);
}
let ttsWarned = {};
ipcMain.handle('tts', async (e, text) => {
  const v = config.voice; const key = [v.engine, v.edgeVoice, v.rate, text].join('|');
  if (ttsCache.has(key)) return { url: ttsCache.get(key) };
  const order = v.engine === 'edge' ? ['edge', 'google'] : v.engine === 'google' ? ['google'] : [];
  for (const eng of order) {
    try {
      const buf = eng === 'edge' ? await edgeTTS(text, v.edgeVoice, v.rate || 0) : await googleTTS(text);
      const url = 'data:audio/mpeg;base64,' + buf.toString('base64');
      if (ttsCache.size > 200) ttsCache.clear(); ttsCache.set(key, url); return { url };
    } catch (err) { if (!ttsWarned[eng]) { ttsWarned[eng] = 1; log(`⚠️ Giọng ${eng} lỗi: ${err.message} — chuyển giọng dự phòng`); } }
  }
  return { system: true };
});

// ---------------- IPC ----------------
ipcMain.handle('getInit', async () => ({ config: displayConfig(), history, urls: await carUrls(), version: global.CSL.version }));
ipcMain.handle('getConfig', () => config);
ipcMain.handle('getFontLib', () => fontLib().map(f => ({ family: f.family, group: f.group || (f.user ? 'Font của bạn' : 'Khác') })));
ipcMain.handle('setConfig', (e, patch) => {
  const carsBefore = JSON.stringify(config.cars.map(c => [c.id, c.path, c.paint, c.length]));
  const prevMode = config.windowMode;
  config = deepMerge(config, patch); saveConfig();
  if (patch.windowMode !== undefined && patch.windowMode !== prevMode) applyWindowMode();
  if (controlWin && e.sender !== controlWin.webContents) send(controlWin, 'configChanged', config);
  const carsAfter = JSON.stringify(config.cars.map(c => [c.id, c.path, c.paint, c.length]));
  if (carsBefore !== carsAfter) displayWin && displayWin.reload(); else send(displayWin, 'config', displayConfig());
  return config;
});
ipcMain.on('addCamPreset', (e, p) => { config.bot.presets = [...(config.bot.presets || []), p]; saveConfig(); broadcastConfig(); log('📷 Đã lưu góc: ' + p.name); });
ipcMain.on('saveRecord', (e, r) => { history.push(r); saveHistory(); });
ipcMain.on('removeRecord', (e, id) => { history = history.filter(h => h.id !== id); saveHistory(); });
ipcMain.on('status', (e, s) => send(controlWin, 'status', s));
ipcMain.handle('connect', (e, u) => connectTikTok(u));
ipcMain.handle('disconnect', async () => { await disconnectTikTok(); log('Đã ngắt kết nối'); send(controlWin, 'status', { connected: false }); });
ipcMain.handle('command', (e, c) => {
  if (c.cmd === 'clear') { history = []; saveHistory(); likes.clear(); broadcastLikers(); }
  if (c.cmd === 'reload') { displayWin && displayWin.reload(); return; }
  send(displayWin, 'command', c);
});
const TEST_NAMES = ['Nguyễn Văn An', 'Linh Chi 🌸', 'Trần Bảo', 'Mai Anh', 'Hoàng Long', 'Bé Na', 'Phúc Lộc Thọ', 'Tuấn Kiệt', 'Ngọc Hân', 'Đại Gia Phố Núi'];
const TEST_GIFTS = { small: 'Hoa hồng', big: 'Kem', silver: 'Nước hoa', gold: 'Mũ', logo: 'Kính râm' };
ipcMain.handle('test', async (e, { type, name }) => {
  const n = name || TEST_NAMES[Math.floor(Math.random() * TEST_NAMES.length)];
  const id = 'test_' + n;
  if (type === 'likes') { await addLikes({ id, name: n, avatar: '' }, 25); return; }
  if (type === 'join') { send(displayWin, 'job', { type: 'join', test: true, name: name || n + ' ' + Math.floor(Math.random() * 99), uniqueId: id, avatar: '' }); log('→ JOIN (thử)'); return; }
  pushJob(type, { id, name: n, avatar: '' }, { coins: config.tiers[type] || 0, gift: TEST_GIFTS[type] || 'quà' });
});
ipcMain.handle('pickFonts', async () => {
  const r = await dialog.showOpenDialog(controlWin, { filters: [{ name: 'Font', extensions: ['ttf', 'otf', 'woff', 'woff2'] }], properties: ['openFile', 'multiSelections'] });
  if (r.canceled) return config.userFonts;
  const dir = path.join(DATA, 'fonts'); fs.mkdirSync(dir, { recursive: true });
  for (const f of r.filePaths) {
    const dst = path.join(dir, path.basename(f)); fs.copyFileSync(f, dst);
    const family = path.basename(dst).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim() || 'Font ' + Date.now();
    config.userFonts = (config.userFonts || []).filter(x => x.family !== family).concat([{ family, file: dst, weight: 400 }]);
  }
  saveConfig(); broadcastConfig(); return config.userFonts;
});
ipcMain.handle('removeFont', (e, family) => { config.userFonts = (config.userFonts || []).filter(f => f.family !== family); saveConfig(); broadcastConfig(); });
ipcMain.handle('pickMusic', async () => {
  const r = await dialog.showOpenDialog(controlWin, { filters: [{ name: 'Nhạc', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }], properties: ['openFile', 'multiSelections'] });
  if (r.canceled) return config.music.files;
  const add = r.filePaths.map(p => ({ path: p, name: path.basename(p) }));
  config.music.files = [...(config.music.files || []), ...add.filter(a => !(config.music.files || []).some(f => f.path === a.path))];
  saveConfig(); broadcastConfig(); return config.music.files;
});
ipcMain.handle('pickCar', async () => {
  const r = await dialog.showOpenDialog(controlWin, { filters: [{ name: 'Model 3D', extensions: ['glb'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = path.join(DATA, 'cars'); fs.mkdirSync(dir, { recursive: true });
  const id = 'custom_' + Date.now().toString(36); const dst = path.join(dir, id + '.glb'); fs.copyFileSync(r.filePaths[0], dst);
  const mats = glbMaterials(dst); const guess = mats.find(m => /paint|body|carpaint/i.test(m)) || '';
  config.cars.push({ id, name: path.basename(r.filePaths[0]).replace(/\.glb$/i, ''), path: dst, paint: guess ? '^' + guess.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$' : '', length: 4.6, enabled: true, x: 0, z: 10, rot: 90, color: '' });
  saveConfig(); send(controlWin, 'configChanged', config); displayWin && displayWin.reload();
  return id;
});
ipcMain.handle('removeCar', (e, id) => { config.cars = config.cars.filter(c => c.id !== id || !c.path); saveConfig(); send(controlWin, 'configChanged', config); displayWin && displayWin.reload(); });
ipcMain.handle('carMaterials', async (e, id) => {
  const c = config.cars.find(c => c.id === id); if (!c) return [];
  const files = await ensureAssets(); const f = c.path || (c.file && files[c.file]); return f ? glbMaterials(f) : [];
});
ipcMain.handle('openData', () => shell.openPath(DATA));

app.whenReady().then(() => {
  createWindows();
  if (config.tiktokUser && config.autoConnect) setTimeout(() => connectTikTok(config.tiktokUser), 2500);
});
app.on('window-all-closed', () => app.quit());

// ---------------- CẬP NHẬT ----------------
ipcMain.handle('appInfo', () => ({ version: global.CSL.version, base: global.CSL.baseVersion, source: global.CSL.source }));
ipcMain.handle('checkUpdate', async () => {
  const r = await global.CSL.checkUpdate();
  if (r.updated) log(`⬇️ Đã tải bản ${r.version}. Bấm "Khởi động lại" để dùng.`);
  else if (r.error) log('Không kiểm tra được cập nhật: ' + r.error);
  else log('Đang dùng bản mới nhất (' + global.CSL.version + ')');
  return r;
});
ipcMain.handle('restart', () => { app.relaunch(); app.exit(0); });
