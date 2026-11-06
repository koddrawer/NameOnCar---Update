// Car Sign Live — bootstrap (cố định trong file .exe).
// Tự tải bản core mới từ GitHub repo rồi chạy; lỗi thì quay về bản gốc trong gói.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const REPO = 'koddrawer/NameOnCar---Update';
const BRANCH = 'main';
const BASE_DIR = __dirname;
const BASE_VERSION = app.getVersion();
const UPD_ROOT = path.join(app.getPath('userData'), 'updates');
const CUR_FILE = path.join(UPD_ROOT, 'current.json');
const BAD_FILE = path.join(UPD_ROOT, 'bad.json');

const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; };
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };

function installed() {
  const c = readJSON(CUR_FILE, null); const bad = readJSON(BAD_FILE, {});
  if (!c || bad[c.version] || cmp(c.version, BASE_VERSION) <= 0) return null;
  const dir = path.join(UPD_ROOT, c.version);
  return fs.existsSync(path.join(dir, 'core.js')) ? { version: c.version, dir } : null;
}

async function get(url, type = 'json') {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'CarSignLive-Updater', 'Cache-Control': 'no-cache' } });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return type === 'json' ? r.json() : type === 'text' ? r.text() : Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(t); }
}

let busy = null;
function checkUpdate() { return busy || (busy = doCheck().finally(() => { busy = null; })); }
async function doCheck() {
  try {
    // lấy commit mới nhất để tránh cache của raw.githubusercontent
    let ref = BRANCH;
    try { ref = (await get(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`)).sha || BRANCH; } catch (e) { }
    const raw = p => `https://raw.githubusercontent.com/${REPO}/${ref}/${p}`;
    const man = await get(raw('version.json'));
    const have = installed()?.version || BASE_VERSION;
    if (cmp(man.version, have) <= 0) return { updated: false, version: have };
    if (man.minBase && cmp(BASE_VERSION, man.minBase) < 0) return { updated: false, error: `Bản ${man.version} cần tải lại bộ cài mới (≥ ${man.minBase})` };
    const tmp = path.join(UPD_ROOT, 'tmp-' + man.version); fs.rmSync(tmp, { recursive: true, force: true });
    for (const f of man.files) {
      const buf = await get(raw('app/' + f.path), 'buf');
      const h = crypto.createHash('sha256').update(buf).digest('hex');
      if (h !== f.sha256) throw new Error('Sai mã kiểm tra: ' + f.path);
      const dst = path.join(tmp, f.path); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, buf);
    }
    const fin = path.join(UPD_ROOT, man.version); fs.rmSync(fin, { recursive: true, force: true }); fs.renameSync(tmp, fin);
    fs.writeFileSync(CUR_FILE, JSON.stringify({ version: man.version, notes: man.notes || '', at: Date.now() }));
    // dọn bản cũ
    for (const d of fs.readdirSync(UPD_ROOT)) if (/^\d+\.\d+\.\d+$/.test(d) && d !== man.version) fs.rmSync(path.join(UPD_ROOT, d), { recursive: true, force: true });
    return { updated: true, version: man.version, notes: man.notes || '' };
  } catch (e) { return { updated: false, error: e.message }; }
}

const carFile = path.join(BASE_DIR.replace(/app\.asar$/, 'app.asar.unpacked'), 'car.glb');

app.whenReady().then(async () => {
  fs.mkdirSync(UPD_ROOT, { recursive: true });
  const safe = process.argv.includes('--csl-safe');
  if (!safe && !process.env.CSL_NOUPDATE) await Promise.race([checkUpdate(), new Promise(r => setTimeout(r, 8000))]);
  const upd = safe ? null : installed();
  const dir = upd ? upd.dir : BASE_DIR;
  global.CSL = {
    version: upd ? upd.version : BASE_VERSION, baseVersion: BASE_VERSION, source: upd ? 'github' : 'base',
    carFile: fs.existsSync(carFile) ? carFile : path.join(BASE_DIR, 'car.glb'),
    importTikTok: () => import('tiktok-live-connector'),
    checkUpdate,
  };
  try {
    require(path.join(dir, 'core.js'));
  } catch (e) {
    console.error('Core lỗi:', e);
    if (upd) {   // đánh dấu bản lỗi, chạy lại bằng bản gốc
      const bad = readJSON(BAD_FILE, {}); bad[upd.version] = String(e.message || e); fs.writeFileSync(BAD_FILE, JSON.stringify(bad));
      app.relaunch({ args: process.argv.slice(1).concat(['--csl-safe']) }); app.exit(0);
    } else throw e;
  }
});
