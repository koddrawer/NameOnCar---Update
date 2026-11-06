const A = window.api;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let cfg = {}, fontLib = [];
const TIERS = [['like', '❤️ Tim'], ['small', '🪙 1 xu'], ['big', '🪙 5 xu'], ['silver', '🥈 Bạc'], ['gold', '🥇 Vàng'], ['logo', '👑 Logo']];
const get = (o, k) => k.split('.').reduce((a, p) => a && a[p], o);
function patchFor(k, v) { const parts = k.split('.'); const o = {}; let cur = o; parts.forEach((p, i) => { if (i === parts.length - 1) cur[p] = v; else cur = cur[p] = {}; }); return o; }
let pending = {}, timer = null;
function merge(a, b) { for (const k in b) a[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? merge(a[k] || {}, b[k]) : b[k]; return a; }
function queueSave(p) { merge(pending, p); merge(cfg, JSON.parse(JSON.stringify(p))); clearTimeout(timer); timer = setTimeout(async () => { const p2 = pending; pending = {}; cfg = await A.setConfig(p2); }, 250); }

// tabs
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 't-' + b.dataset.tab));
});

// ---------- generic fields ----------
function bindFields(root = document) {
  root.querySelectorAll('[data-k]').forEach(el => {
    if (el._bound) return; el._bound = 1;
    const ev = (el.type === 'range' || el.type === 'color' || el.tagName === 'TEXTAREA' || el.type === 'text') ? 'input' : 'change';
    el.addEventListener(ev, () => {
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.dataset.list) v = el.value.split('\n').map(s => s.trim()).filter(Boolean);
      else if (el.type === 'number' || el.type === 'range' || el.dataset.num) v = Number(el.value);
      else v = el.value;
      const sv = document.querySelector(`[data-v="${el.dataset.k}"]`); if (sv) sv.textContent = v;
      queueSave(patchFor(el.dataset.k, v));
    });
  });
}
function fill() {
  document.querySelectorAll('[data-k]').forEach(el => {
    const v = get(cfg, el.dataset.k);
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.dataset.list) el.value = (v || []).join('\n');
    else if (v !== undefined) el.value = v;
    const sv = document.querySelector(`[data-v="${el.dataset.k}"]`); if (sv) sv.textContent = v;
  });
  $('user').value = cfg.tiktokUser || '';
  renderCars(); renderCams(); renderFonts(); renderMusic(); renderTpl();
}

// ---------- XE ----------
function carOptions(sel, withAll) {
  sel.innerHTML = (withAll ? '<option value="all">Cả showroom</option>' : '') + (cfg.cars || []).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
}
function renderCars() {
  const el = $('carList');
  el.innerHTML = (cfg.cars || []).map((c, i) => `
    <div class="car" data-i="${i}">
      <div class="head"><input type="checkbox" data-f="enabled" ${c.enabled !== false ? 'checked' : ''}><b>${esc(c.name)}</b>
        <input type="color" data-f="color" value="${c.color || '#888888'}" title="Màu sơn"><label><input type="checkbox" data-f="orig" ${!c.color ? 'checked' : ''}> màu gốc</label>
        ${c.path ? `<button class="sm danger" data-del="${esc(c.id)}">Xoá</button>` : ''}</div>
      <div class="grid">
        <div>X (m)<input type="number" step="0.1" data-f="x" value="${c.x || 0}"></div>
        <div>Z (m)<input type="number" step="0.1" data-f="z" value="${c.z || 0}"></div>
        <div>Xoay (°)<input type="number" step="5" data-f="rot" value="${c.rot || 0}"></div>
        <div>Dài (m)<input type="number" step="0.05" data-f="length" value="${c.length || 4.6}"></div>
        <div>Tên<input type="text" data-f="name" value="${esc(c.name)}"></div>
      </div>
      <div class="row" style="margin:6px 0 0"><small style="min-width:90px">Vật liệu sơn</small><input type="text" data-f="paint" value="${esc(c.paint || '')}" placeholder="regex tên vật liệu"><button class="sm" data-mats="${esc(c.id)}">Chọn…</button></div>
      <select data-matsel="${esc(c.id)}" style="display:none;width:100%"></select>
    </div>`).join('');
  el.querySelectorAll('.car').forEach(box => {
    const i = +box.dataset.i;
    box.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener(inp.type === 'color' || inp.type === 'text' ? 'change' : 'change', () => {
      const c = cfg.cars[i]; const f = inp.dataset.f;
      if (f === 'enabled') c.enabled = inp.checked;
      else if (f === 'orig') c.color = inp.checked ? '' : box.querySelector('[data-f=color]').value;
      else if (f === 'color') { c.color = inp.value; box.querySelector('[data-f=orig]').checked = false; }
      else if (['x', 'z', 'rot', 'length'].includes(f)) c[f] = Number(inp.value);
      else c[f] = inp.value;
      if (['enabled', 'orig', 'color'].includes(f)) A.setConfig({ cars: cfg.cars });
    }));
  });
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm('Xoá xe này khỏi showroom?')) A.removeCar(b.dataset.del); });
  el.querySelectorAll('[data-mats]').forEach(b => b.onclick = async () => {
    const id = b.dataset.mats; const sel = el.querySelector(`[data-matsel="${id}"]`); const mats = await A.carMaterials(id);
    sel.innerHTML = '<option value="">— chọn vật liệu là lớp sơn —</option>' + mats.map(m => `<option>${esc(m)}</option>`).join(''); sel.style.display = '';
    sel.onchange = () => { if (!sel.value) return; const c = cfg.cars.find(c => c.id === id); c.paint = '^' + sel.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'; A.setConfig({ cars: cfg.cars }); };
  });
  carOptions($('logoCar')); $('logoCar').value = cfg.logo?.car || 'x3';
  carOptions($('botCar'), true); $('botCar').value = cfg.bot?.car || 'all';
}
$('applyCars').onclick = () => A.setConfig({ cars: cfg.cars });
$('pickCar').onclick = () => A.pickCar();

// ---------- CAMERA ----------
function renderCams() {
  const list = cfg.bot?.presets || [];
  $('camList').innerHTML = list.length ? list.map((p, i) => `<div class="it"><span>${i === cfg.bot.preset ? '⭐ ' : ''}${esc(p.name)}</span><button class="sm" data-use="${i}">▶ Dùng</button><button class="sm" data-up="${i}">↑</button><button class="sm danger" data-rm="${i}">✕</button></div>`).join('') : '<small>Chưa có góc nào.</small>';
  $('camList').querySelectorAll('[data-use]').forEach(b => b.onclick = () => { const i = +b.dataset.use; A.setConfig({ bot: { mode: cfg.bot.mode === 'cycle' ? 'cycle' : 'preset', preset: i } }).then(c => { cfg = c; fill(); }); });
  $('camList').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const p = [...list]; p.splice(+b.dataset.rm, 1); A.setConfig({ bot: { presets: p, preset: 0 } }).then(c => { cfg = c; fill(); }); });
  $('camList').querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; if (!i) return; const p = [...list];[p[i - 1], p[i]] = [p[i], p[i - 1]]; A.setConfig({ bot: { presets: p } }).then(c => { cfg = c; fill(); }); });
}
$('saveCam').onclick = () => { A.command({ cmd: 'saveCam', name: $('camName').value.trim() }); $('camName').value = ''; };
$('botAuto').onclick = () => A.command({ cmd: 'botAuto' });

// ---------- FONT ----------
function renderFonts() {
  $('fontRows').innerHTML = TIERS.map(([t, l]) => `<div class="row"><label style="min-width:80px">${l}</label><select data-font="${t}">${fontLib.map(f => `<option ${cfg.fonts?.[t] === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select><div class="fprev" style="font-family:'${esc(cfg.fonts?.[t] || '')}'">Nguyễn Văn Ánh</div></div>`).join('');
  $('fontRows').querySelectorAll('[data-font]').forEach(s => s.onchange = () => { queueSave({ fonts: { [s.dataset.font]: s.value } }); s.nextElementSibling.style.fontFamily = `'${s.value}'`; });
  $('userFonts').innerHTML = (cfg.userFonts || []).map(f => `<div class="it"><span>${esc(f.family)}</span><button class="sm danger" data-rf="${esc(f.family)}">✕</button></div>`).join('');
  $('userFonts').querySelectorAll('[data-rf]').forEach(b => b.onclick = async () => { await A.removeFont(b.dataset.rf); await refreshFonts(); });
  // nạp font người dùng để xem trước
  for (const f of cfg.userFonts || []) if (!document.fonts.check(`16px "${f.family}"`)) new FontFace(f.family, `url("file:///${f.file.replace(/\\/g, '/')}")`).load().then(ff => document.fonts.add(ff)).catch(() => { });
}
async function refreshFonts() { fontLib = await A.getFontLib(); cfg = await A.getConfig(); renderFonts(); }
$('pickFonts').onclick = async () => { await A.pickFonts(); await refreshFonts(); };

// ---------- NHẠC ----------
function renderMusic() {
  const f = cfg.music?.files || [];
  $('musicList').innerHTML = f.length ? f.map((m, i) => `<div class="it"><span>🎵 ${esc(m.name)}</span><button class="sm danger" data-rm="${i}">✕</button></div>`).join('') : '<small>Chưa có bài nào.</small>';
  $('musicList').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const l = [...f]; l.splice(+b.dataset.rm, 1); A.setConfig({ music: { files: l } }).then(c => { cfg = c; renderMusic(); }); });
}
$('pickMusic').onclick = async () => { await A.pickMusic(); cfg = await A.getConfig(); renderMusic(); };

// ---------- GIỌNG ----------
function renderTpl() {
  for (const [box, key] of [['tplWrite', 'write'], ['tplThank', 'thank']]) {
    $(box).innerHTML = TIERS.map(([t, l]) => `<div class="tpl"><span>${l}</span><input type="text" data-k="voice.${key}.${t}"></div>`).join('');
    bindFields($(box));
    $(box).querySelectorAll('[data-k]').forEach(el => el.value = get(cfg, el.dataset.k) || '');
  }
}
$('sayBtn').onclick = () => A.command({ cmd: 'say', text: $('sayText').value });

// ---------- LIVE ----------
$('btnConn').onclick = async () => { $('btnConn').disabled = true; $('btnConn').textContent = 'Đang kết nối…'; await A.connect($('user').value); $('btnConn').disabled = false; $('btnConn').textContent = 'Kết nối'; };
$('btnDis').onclick = () => A.disconnect();
document.querySelectorAll('[data-test]').forEach(b => b.onclick = () => A.test({ type: b.dataset.test, name: $('testName').value.trim() }));
document.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => A.command({ cmd: b.dataset.cmd }));
$('prevLogo').onclick = $('prevLogo2').onclick = () => A.command({ cmd: 'previewLogo' });
$('wash').onclick = () => { if (confirm('Xoá toàn bộ tên và logo trên tất cả xe?')) A.command({ cmd: 'clear' }); };
$('openData').onclick = () => A.openData();
A.onLog(l => { const el = $('log'); el.textContent += l + '\n'; if (el.textContent.length > 20000) el.textContent = el.textContent.slice(-15000); el.scrollTop = el.scrollHeight; });
const TL = { like: 'Tim', small: '1 xu', big: '5 xu', silver: 'Bạc', gold: 'Vàng', logo: 'Logo' };
A.onStatus(s => {
  if ('connected' in s) $('dot').classList.toggle('on', s.connected);
  if ('viewers' in s) $('viewers').textContent = s.viewers;
  if ('names' in s) $('names').textContent = s.names;
  if (s.queue) $('qlen').textContent = s.queue.length;
  if (s.music !== undefined) $('nowPlaying').textContent = s.music ? '▶ ' + s.music : '';
  if ('current' in s) $('cur').textContent = s.current ? `Đang viết: ${s.current.name} (${TL[s.current.type]})` : 'Đang rảnh';
});
A.onConfigChanged(c => { const tab = document.activeElement; cfg = c; if (!tab || tab.tagName !== 'INPUT') fill(); else { renderCams(); renderCars(); } });

// ---------- CẬP NHẬT ----------
async function showVer() { const i = await A.appInfo(); $('ver').textContent = `Phiên bản ${i.version}` + (i.source === 'github' ? ' (cập nhật từ GitHub)' : ''); }
$('btnUpd').onclick = async () => {
  $('btnUpd').disabled = true; $('btnUpd').textContent = 'Đang kiểm tra…';
  const r = await A.checkUpdate();
  $('btnUpd').disabled = false; $('btnUpd').textContent = '⬇️ Kiểm tra cập nhật';
  if (r.updated) { $('ver').textContent = `Đã tải bản ${r.version}`; $('btnRestart').style.display = ''; }
};
$('btnRestart').onclick = () => A.restart();

(async () => { cfg = await A.getConfig(); fontLib = await A.getFontLib(); bindFields(); fill(); showVer(); })();
