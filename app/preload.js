const { contextBridge, ipcRenderer } = require('electron');
const sub = ch => cb => ipcRenderer.on(ch, (e, d) => cb(d));
contextBridge.exposeInMainWorld('api', {
  // display
  getInit: () => ipcRenderer.invoke('getInit'),
  onConfig: sub('config'), onJob: sub('job'), onLikers: sub('likers'), onCommand: sub('command'),
  saveRecord: r => ipcRenderer.send('saveRecord', r),
  removeRecord: id => ipcRenderer.send('removeRecord', id),
  status: s => ipcRenderer.send('status', s),
  // control
  getConfig: () => ipcRenderer.invoke('getConfig'),
  setConfig: p => ipcRenderer.invoke('setConfig', p),
  connect: u => ipcRenderer.invoke('connect', u),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  command: c => ipcRenderer.invoke('command', c),
  test: t => ipcRenderer.invoke('test', t),
  pickFont: () => ipcRenderer.invoke('pickFont'),
  pickCar: () => ipcRenderer.invoke('pickCar'),
  openData: () => ipcRenderer.invoke('openData'),
  appInfo: () => ipcRenderer.invoke('appInfo'),
  checkUpdate: () => ipcRenderer.invoke('checkUpdate'),
  restart: () => ipcRenderer.invoke('restart'),
  onLog: sub('log'), onStatus: sub('status'),
});
