const { contextBridge, ipcRenderer } = require('electron');

// Puente seguro entre la interfaz (React) y el sistema (Electron).
contextBridge.exposeInMainWorld('b2b', {
  isElectron: true,
  platform: process.platform,
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  onLibraryProgress: (cb) => {
    const fn = (_e, p) => cb(p);
    ipcRenderer.on('library:progress', fn);
    return () => ipcRenderer.removeListener('library:progress', fn);
  },
  readMarkers: (file) => ipcRenderer.invoke('track:markers', file),
  readCover: (file) => ipcRenderer.invoke('track:cover', file),
  getTrackData: () => ipcRenderer.invoke('trackdata:get'),
  setTrackData: (id, data) => ipcRenderer.invoke('trackdata:set', id, data),
  pickFolder: (title) => ipcRenderer.invoke('dialog:pickFolder', title),
  writeDiag: (data) => ipcRenderer.invoke('diag:write', data),
  versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
  mediaUrl: (file) => 'sfmedia://local' + encodeURI(file).replace(/#/g, '%23').replace(/\?/g, '%3F'),
});
