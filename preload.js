/* ============================================================
   preload.js — Puente seguro entre renderer y proceso principal
   ============================================================ */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posdesktop', {
  isDesktop: true,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chromium: process.versions.chrome
  },
  meta: () => ipcRenderer.invoke('meta:info'),
  stateLoad: () => ipcRenderer.invoke('state:load'),
  stateSave: (state) => ipcRenderer.invoke('state:save', state),
  stateReset: () => ipcRenderer.invoke('state:reset')
});
