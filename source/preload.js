const { contextBridge, ipcRenderer } = require('electron');
const sub = ch => cb => ipcRenderer.on(ch, (e, d) => cb(d));
contextBridge.exposeInMainWorld('api', {
  // display
  getInit: () => ipcRenderer.invoke('getInit'),
  onConfig: sub('config'), onJob: sub('job'), onLikers: sub('likers'), onCommand: sub('command'), onAssetProgress: sub('assetProgress'),
  saveRecord: r => ipcRenderer.send('saveRecord', r),
  removeRecord: id => ipcRenderer.send('removeRecord', id),
  addCamPreset: p => ipcRenderer.send('addCamPreset', p),
  status: s => ipcRenderer.send('status', s),
  tts: t => ipcRenderer.invoke('tts', t),
  // control
  getConfig: () => ipcRenderer.invoke('getConfig'),
  getFontLib: () => ipcRenderer.invoke('getFontLib'),
  setConfig: p => ipcRenderer.invoke('setConfig', p),
  connect: u => ipcRenderer.invoke('connect', u),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  command: c => ipcRenderer.invoke('command', c),
  test: t => ipcRenderer.invoke('test', t),
  pickFonts: () => ipcRenderer.invoke('pickFonts'),
  removeFont: f => ipcRenderer.invoke('removeFont', f),
  pickMusic: () => ipcRenderer.invoke('pickMusic'),
  pickCar: () => ipcRenderer.invoke('pickCar'),
  removeCar: id => ipcRenderer.invoke('removeCar', id),
  carMaterials: id => ipcRenderer.invoke('carMaterials', id),
  openData: () => ipcRenderer.invoke('openData'),
  appInfo: () => ipcRenderer.invoke('appInfo'),
  checkUpdate: () => ipcRenderer.invoke('checkUpdate'),
  restart: () => ipcRenderer.invoke('restart'),
  onLog: sub('log'), onConnStats: sub('connStats'), onStatus: sub('status'), onConfigChanged: sub('configChanged'),
});
