// Car Sign Live — core (được cập nhật nóng qua GitHub; bootstrap ở main.js)
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const DATA = app.getPath('userData');
const CFG_FILE = path.join(DATA, 'config.json');
const HIST_FILE = path.join(DATA, 'history.json');
const LOG_FILE = path.join(DATA, 'gift-debug.log');

const DEFAULTS = {
  tiktokUser: '',
  likeThreshold: 100, likeRepeat: true,
  tiers: { small: 1, big: 5, silver: 10, gold: 30, logo: 100 },
  title: 'KÝ TÊN LÊN XE',
  legend: ['❤️ 100 tim: bơm mực, ký tên', '🪙 1 xu: avatar nhỏ', '🪙 5 xu: avatar to', '🥈 10 xu: mực bạc', '🥇 30 xu: mực vàng', '👑 100 xu: logo cửa xe'],
  font: 'Segoe Script', fontWeight: '700', fontFile: '',
  inkColor: '#111111', carColor: '',
  sizes: { like: 0.13, small: 0.15, big: 0.19, silver: 0.21, gold: 0.24 },
  avatarScale: { small: 1.1, big: 1.9, silver: 1.9, gold: 2.1 },
  writeSpeed: 1, holdSeconds: 1.6, maxNames: 80,
  orbitSpeed: 1, orbitZoom: 1, renderScale: 1,
  logo: { side: 1, along: 0.06, height: 0.30, size: 0.68 },
  sound: true,
  bgTop: '#1b1e2b', bgBottom: '#05060a',
  carPath: '', paintMaterial: 'X3MI_1347060001_015',
};

function readJSON(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function deepMerge(a, b) { const o = { ...a }; for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') ? deepMerge(a[k], b[k]) : b[k]; return o; }
let config = deepMerge(DEFAULTS, readJSON(CFG_FILE, {}));
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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false },
  });
  displayWin.setAspectRatio(9 / 16);
  displayWin.loadFile(path.join(__dirname, 'display.html'));
  controlWin = new BrowserWindow({
    width: 560, height: 940, title: 'Car Sign Live — Bảng điều khiển', backgroundColor: '#11131a', autoHideMenuBar: true,
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
let conn = null;
function normUser(d) {
  const u = d.user || d;
  const pic = d.profilePictureUrl || u.profilePictureUrl || u.profilePicture?.url?.[0] || u.profilePicture?.urls?.[0] || u.profilePicture?.urlList?.[0] || u.avatarThumb?.urlList?.[0] || u.avatarThumb?.url?.[0] || '';
  return { id: u.uniqueId || u.displayId || d.uniqueId || String(u.userId || d.userId || ''), name: u.nickname || d.nickname || u.uniqueId || u.displayId || 'Ẩn danh', avatar: pic };
}
let debugCount = 0;
function onGift(d) {
  const giftType = d.giftType ?? d.giftDetails?.giftType ?? d.gift?.type ?? d.giftDetails?.type;
  const repeatEnd = !!(d.repeatEnd);
  if (debugCount < 5) { debugCount++; try { fs.appendFileSync(LOG_FILE, JSON.stringify(d, (k, v) => typeof v === 'bigint' ? String(v) : v).slice(0, 4000) + '\n\n'); } catch (e) { } }
  if (giftType === 1 && !repeatEnd) return;           // quà combo: chờ kết thúc chuỗi
  const diamond = Number(d.diamondCount ?? d.giftDetails?.diamondCount ?? d.gift?.diamondCount ?? d.extendedGiftInfo?.diamond_count ?? 0);
  const repeat = Number(d.repeatCount || 1);
  const coins = diamond * repeat;
  const user = normUser(d);
  const giftName = d.giftName || d.giftDetails?.giftName || d.extendedGiftInfo?.name || d.gift?.name || 'quà';
  log(`🎁 ${user.name} tặng ${giftName} x${repeat} = ${coins} xu`);
  const tier = tierFor(coins);
  if (tier) pushJob(tier, user, { coins });
}
async function connectTikTok(username) {
  username = String(username || '').replace(/^@/, '').trim();
  if (!username) return { ok: false, error: 'Chưa nhập username' };
  await disconnectTikTok();
  config.tiktokUser = username; saveConfig();
  try {
    const mod = await global.CSL.importTikTok();
    const Conn = mod.TikTokLiveConnection || mod.WebcastPushConnection;
    const EV = mod.WebcastEvent || {};
    conn = new Conn(username, { processInitialData: false, enableExtendedGiftInfo: true });
    conn.on(EV.GIFT || 'gift', onGift);
    conn.on(EV.LIKE || 'like', d => { const n = Number(d.likeCount ?? d.count ?? 1); addLikes(normUser(d), n); });
    conn.on(EV.ROOM_USER || 'roomUser', d => send(controlWin, 'status', { viewers: d.viewerCount ?? d.total ?? 0 }));
    conn.on(EV.STREAM_END || 'streamEnd', () => { log('⛔ Phiên LIVE đã kết thúc'); send(controlWin, 'status', { connected: false }); });
    conn.on(EV.DISCONNECTED || 'disconnected', () => { log('Mất kết nối TikTok'); send(controlWin, 'status', { connected: false }); scheduleReconnect(username); });
    conn.on('error', e => log('Lỗi: ' + (e?.message || e?.info || e)));
    const st = await conn.connect();
    log(`✅ Đã kết nối @${username} (room ${st?.roomId || ''})`);
    send(controlWin, 'status', { connected: true });
    return { ok: true };
  } catch (e) {
    log('❌ Kết nối thất bại: ' + (e?.message || e)); send(controlWin, 'status', { connected: false });
    return { ok: false, error: String(e?.message || e) };
  }
}
let reTimer = null, manualOff = false;
function scheduleReconnect(u) { if (manualOff) return; clearTimeout(reTimer); reTimer = setTimeout(() => { log('Thử kết nối lại…'); connectTikTok(u); }, 15000); }
async function disconnectTikTok() { clearTimeout(reTimer); if (conn) { const c = conn; conn = null; manualOff = true; try { c.removeAllListeners && c.removeAllListeners(); await c.disconnect(); } catch (e) { } manualOff = false; } }

// ---------------- IPC ----------------
function displayConfig() {
  const c = { ...config };
  if (config.fontFile) c.fontFile = pathToFileURL(config.fontFile).href;
  return c;
}
ipcMain.handle('getInit', () => ({
  config: displayConfig(), history,
  carUrl: pathToFileURL(config.carPath && fs.existsSync(config.carPath) ? config.carPath : global.CSL.carFile).href,
  version: global.CSL.version,
}));
ipcMain.handle('getConfig', () => config);
ipcMain.handle('setConfig', (e, patch) => {
  const carChanged = patch.carPath !== undefined && patch.carPath !== config.carPath;
  config = deepMerge(config, patch); saveConfig();
  if (carChanged) displayWin && displayWin.reload(); else send(displayWin, 'config', displayConfig());
  return config;
});
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
ipcMain.handle('test', async (e, { type, name }) => {
  const n = name || TEST_NAMES[Math.floor(Math.random() * TEST_NAMES.length)];
  const id = 'test_' + n;
  if (type === 'likes') { await addLikes({ id, name: n, avatar: '' }, 25); return; }
  pushJob(type, { id, name: n, avatar: '' }, { coins: config.tiers[type] || 0 });
});
ipcMain.handle('pickFont', async () => {
  const r = await dialog.showOpenDialog(controlWin, { filters: [{ name: 'Font', extensions: ['ttf', 'otf', 'woff', 'woff2'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = path.join(DATA, 'fonts'); fs.mkdirSync(dir, { recursive: true });
  const dst = path.join(dir, path.basename(r.filePaths[0])); fs.copyFileSync(r.filePaths[0], dst);
  const fam = 'UserFont_' + path.basename(dst).replace(/\.[^.]+$/, '').replace(/[^\w]/g, '');
  config.fontFile = dst; config.font = fam; saveConfig(); send(displayWin, 'config', displayConfig());
  return { font: fam, file: dst };
});
ipcMain.handle('pickCar', async () => {
  const r = await dialog.showOpenDialog(controlWin, { filters: [{ name: 'Model 3D', extensions: ['glb'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const dst = path.join(DATA, 'car_custom.glb'); fs.copyFileSync(r.filePaths[0], dst);
  config.carPath = dst; history = []; saveHistory(); saveConfig(); displayWin && displayWin.reload();
  return dst;
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
