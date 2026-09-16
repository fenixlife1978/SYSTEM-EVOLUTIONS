/* ============================================================
   main.js — Proceso principal de Electron
   Multi-caja: servidor/cliente con sincronización offline
   ============================================================ */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const dataStore = require('./db');
const network = require('./network');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 1024,
    minHeight: 640,
    title: 'POSsystem Evolution',
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'pos-system', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function registerIpc() {
  // ── Estado básico ──
  ipcMain.handle('meta:info', () => dataStore.metaInfo());

  ipcMain.handle('state:load', () => {
    try { return { ok: true, state: dataStore.loadState() }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  ipcMain.handle('state:save', (_evt, state) => {
    try {
      if (!state || typeof state !== 'object') return { ok: false, error: 'Estado inválido' };
      dataStore.saveState(state);
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  ipcMain.handle('state:reset', () => {
    try { return { ok: true, data: dataStore.metaSet('reset_requested', Date.now()) }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  // ── Gestión de cajas ──
  ipcMain.handle('caja:crear', (_evt, data) => {
    try { return { ok: true, caja: dataStore.crearCaja(data) }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  ipcMain.handle('caja:listar', () => {
    try { return { ok: true, cajas: dataStore.listarCajas() }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  ipcMain.handle('caja:actualizar', (_evt, id, data) => {
    try { return { ok: true, result: dataStore.actualizarCaja(id, data) }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  ipcMain.handle('caja:eliminar', (_evt, id) => {
    try { return { ok: true, result: dataStore.eliminarCaja(id) }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  ipcMain.handle('caja:getId', () => dataStore.getCajaId());

  // ── Red: servidor ──
  ipcMain.handle('net:startServer', async (_evt, port) => {
    try {
      const result = await network.startServer(dataStore, port || 3000);
      return result;
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  ipcMain.handle('net:stopServer', () => {
    network.stopServer();
    return { ok: true };
  });

  ipcMain.handle('net:serverStatus', () => {
    return { running: network.isServerRunning, ip: network.getLocalIP() };
  });

  // ── Red: cliente ──
  ipcMain.handle('net:startClient', async (_evt, serverUrl, intervalMs) => {
    try {
      const result = network.startClient(serverUrl, dataStore, intervalMs || 30000);
      return result;
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  ipcMain.handle('net:stopClient', () => {
    network.stopClient();
    return { ok: true };
  });

  ipcMain.handle('net:clientStatus', () => {
    return { connected: network.isConnected, ip: network.getLocalIP() };
  });

  // ── Sync offline ──
  ipcMain.handle('sync:push', (_evt, operacion, tabla, datos) => {
    try { return { ok: true, result: dataStore.pushSync(operacion, tabla, datos) }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  ipcMain.handle('sync:pending', () => {
    try { return { ok: true, pending: dataStore.getPendingSync() }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  ipcMain.handle('sync:forceSync', async () => {
    try {
      await network.syncPush(dataStore, '');
      await network.syncPull(dataStore, '');
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  ipcMain.handle('sync:history', (_evt, limit) => {
    try { return { ok: true, history: dataStore.getSyncHistory(limit) }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  });

  // ── IP local ──
  ipcMain.handle('net:getIP', () => network.getLocalIP());
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });

  app.whenReady().then(() => {
    const dbPath = dataStore.initDb(app.getPath('userData'), 'Caja Principal');
    console.log('[SQLite] base inicializada en:', dbPath);
    console.log('[Caja] ID:', dataStore.getCajaId());

    // Configurar eventos de red para notificar al renderer
    network.setOnEvent((evt) => {
      sendToRenderer('net:event', evt);
    });

    registerIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    network.stopServer();
    network.stopClient();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    network.stopServer();
    network.stopClient();
    dataStore.close();
  });
}
