/* ============================================================
   preload.js — Puente seguro entre renderer y proceso principal
   Multi-caja: canales para cajas, red y sincronización
   ============================================================ */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posdesktop', {
  isDesktop: true,
  isDemo: !!process.env.PORTABLE_EXECUTABLE_FILE,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chromium: process.versions.chrome
  },

  // ── Estado básico ──
  meta: () => ipcRenderer.invoke('meta:info'),
  stateLoad: () => ipcRenderer.invoke('state:load'),
  stateSave: (state) => ipcRenderer.invoke('state:save', state),
  stateReset: () => ipcRenderer.invoke('state:reset'),

  // ── Gestión de cajas ──
  cajaCrear: (data) => ipcRenderer.invoke('caja:crear', data),
  cajaListar: () => ipcRenderer.invoke('caja:listar'),
  cajaActualizar: (id, data) => ipcRenderer.invoke('caja:actualizar', id, data),
  cajaEliminar: (id) => ipcRenderer.invoke('caja:eliminar', id),
  cajaGetId: () => ipcRenderer.invoke('caja:getId'),

  // ── Red: servidor ──
  netStartServer: (port) => ipcRenderer.invoke('net:startServer', port),
  netStopServer: () => ipcRenderer.invoke('net:stopServer'),
  netServerStatus: () => ipcRenderer.invoke('net:serverStatus'),

  // ── Red: cliente ──
  netStartClient: (serverUrl, intervalMs) => ipcRenderer.invoke('net:startClient', serverUrl, intervalMs),
  netStopClient: () => ipcRenderer.invoke('net:stopClient'),
  netClientStatus: () => ipcRenderer.invoke('net:clientStatus'),

  // ── Red: utilidades ──
  netGetIP: () => ipcRenderer.invoke('net:getIP'),

  // ── Sync offline ──
  syncPush: (operacion, tabla, datos) => ipcRenderer.invoke('sync:push', operacion, tabla, datos),
  syncPending: () => ipcRenderer.invoke('sync:pending'),
  syncForce: () => ipcRenderer.invoke('sync:forceSync'),
  syncHistory: (limit) => ipcRenderer.invoke('sync:history', limit),

  // ── Eventos de red (WebSocket) ──
  onNetEvent: (callback) => {
    ipcRenderer.on('net:event', (_event, data) => callback(data));
  }
});
