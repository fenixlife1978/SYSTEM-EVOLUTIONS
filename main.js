/* ============================================================
   main.js — Proceso principal de Electron
   ============================================================ */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const dataStore = require('./db');

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

  // Pantalla completa para el POS cuando lo pida el usuario (tecla/acción de UI)
  mainWindow.loadFile(path.join(__dirname, 'pos-system', 'index.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Abrir enlaces externos en el navegador del sistema, no dentro de Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function registerIpc() {
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
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });

  app.whenReady().then(() => {
    const dbPath = dataStore.initDb(app.getPath('userData'));
    console.log('[SQLite] base inicializada en:', dbPath);
    registerIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => dataStore.close());
}
