const A = window.api;
const $ = id => document.getElementById(id);
let cfg = {};
const get = (o, k) => k.split('.').reduce((a, p) => a && a[p], o);
function patchFor(k, v) { const parts = k.split('.'); const o = {}; let cur = o; parts.forEach((p, i) => { if (i === parts.length - 1) cur[p] = v; else cur = cur[p] = {}; }); return o; }
let pending = {}, timer = null;
function queueSave(p) {
  const merge = (a, b) => { for (const k in b) a[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? merge(a[k] || {}, b[k]) : b[k]; return a; };
  merge(pending, p); clearTimeout(timer);
  timer = setTimeout(async () => { const p2 = pending; pending = {}; cfg = await A.setConfig(p2); }, 250);
}
function fill() {
  document.querySelectorAll('[data-k]').forEach(el => {
    const v = get(cfg, el.dataset.k);
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.dataset.list) el.value = (v || []).join('\n');
    else el.value = v ?? '';
    const sv = document.querySelector(`[data-v="${el.dataset.k}"]`); if (sv) sv.textContent = v;
  });
  $('user').value = cfg.tiktokUser || '';
  $('carOrig').checked = !cfg.carColor; $('carColor').value = cfg.carColor || '#ff5a1f';
}
document.querySelectorAll('[data-k]').forEach(el => {
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
$('carColor').addEventListener('input', () => { $('carOrig').checked = false; queueSave({ carColor: $('carColor').value }); });
$('carOrig').addEventListener('change', () => queueSave({ carColor: $('carOrig').checked ? '' : $('carColor').value }));
$('btnConn').onclick = async () => { $('btnConn').disabled = true; $('btnConn').textContent = 'Đang kết nối…'; await A.connect($('user').value); $('btnConn').disabled = false; $('btnConn').textContent = 'Kết nối'; };
$('btnDis').onclick = () => A.disconnect();
document.querySelectorAll('[data-test]').forEach(b => b.onclick = () => A.test({ type: b.dataset.test, name: $('testName').value.trim() }));
document.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => A.command({ cmd: b.dataset.cmd }));
$('prevLogo').onclick = () => A.command({ cmd: 'previewLogo' });
$('wash').onclick = () => { if (confirm('Xoá toàn bộ tên và logo trên xe?')) A.command({ cmd: 'clear' }); };
$('pickFont').onclick = async () => { const r = await A.pickFont(); if (r) { cfg.font = r.font; fill(); } };
$('pickCar').onclick = () => A.pickCar();
$('openData').onclick = () => A.openData();
A.onLog(l => { const el = $('log'); el.textContent += l + '\n'; if (el.textContent.length > 20000) el.textContent = el.textContent.slice(-15000); el.scrollTop = el.scrollHeight; });
const TL = { like: 'Tim', small: '1 xu', big: '5 xu', silver: 'Bạc', gold: 'Vàng', logo: 'Logo' };
A.onStatus(s => {
  if ('connected' in s) $('dot').classList.toggle('on', s.connected);
  if ('viewers' in s) $('viewers').textContent = s.viewers;
  if ('names' in s) $('names').textContent = s.names;
  if (s.queue) $('qlen').textContent = s.queue.length;
  if ('current' in s) $('cur').textContent = s.current ? `Đang viết: ${s.current.name} (${TL[s.current.type]})` : 'Đang rảnh' + (s.logo ? ` · Logo cửa: ${s.logo}` : '');
});
(async () => { cfg = await A.getConfig(); fill(); })();

async function showVer() { const i = await A.appInfo(); $('ver').textContent = `Phiên bản ${i.version}` + (i.source === 'github' ? ' (cập nhật từ GitHub)' : ''); }
showVer();
$('btnUpd').onclick = async () => {
  $('btnUpd').disabled = true; $('btnUpd').textContent = 'Đang kiểm tra…';
  const r = await A.checkUpdate();
  $('btnUpd').disabled = false; $('btnUpd').textContent = '⬇️ Kiểm tra cập nhật';
  if (r.updated) { $('ver').textContent = `Đã tải bản ${r.version}`; $('btnRestart').style.display = ''; }
};
$('btnRestart').onclick = () => A.restart();
