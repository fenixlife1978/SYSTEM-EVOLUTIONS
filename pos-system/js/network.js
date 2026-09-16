/* ============================================================
   network.js — Lado renderer: cola de sync, reconexión, UI
   ------------------------------------------------------------
   Maneja la conexión con el servidor (otra caja), la cola de
   operaciones offline, y la sincronización en background.
   ============================================================ */

let netConnected = false;
let netRole = 'standalone'; // 'servidor' | 'cliente' | 'standalone'
let netServerIP = '';
let netSyncCount = 0;
let netLastSync = null;
let netReconnectTimer = null;
let netEventListeners = [];

/* ── Inicialización ─────────────────────────────────────── */
async function initNetwork() {
  if (!isDesktop()) return;

  // Escuchar eventos de red del proceso principal
  window.posdesktop.onNetEvent((evt) => {
    netEventListeners.forEach(fn => fn(evt));
    handleNetEvent(evt);
  });

  // Verificar estado actual
  try {
    const serverStatus = await window.posdesktop.netServerStatus();
    const clientStatus = await window.posdesktop.netClientStatus();
    if (serverStatus.running) {
      netRole = 'servidor';
      netConnected = true;
      netServerIP = serverStatus.ip;
    } else if (clientStatus.connected) {
      netRole = 'cliente';
      netConnected = true;
    }
  } catch (e) {}
}

function onNetEvent(fn) {
  netEventListeners.push(fn);
}

function handleNetEvent(evt) {
  if (evt.type === 'connected') {
    netConnected = true;
    netRole = 'cliente';
    console.info('[net] Conectado al servidor:', evt.server);
    toast('Conectado al servidor', 'success', 2500);
    updateNetworkStatusUI();
  } else if (evt.type === 'disconnected') {
    netConnected = false;
    console.warn('[net] Desconectado del servidor');
    toast('Desconectado del servidor. Operando offline.', 'warn', 3500);
    updateNetworkStatusUI();
    startReconnect();
  } else if (evt.type === 'sync_complete') {
    netSyncCount += evt.count || 0;
    netLastSync = new Date();
    updateNetworkStatusUI();
  } else if (evt.type === 'state_updated') {
    // El servidor envió datos actualizados
    console.info('[net] Estado actualizado desde servidor');
  } else if (evt.type === 'caja_nueva') {
    toast('Nueva caja registrada en el servidor', 'info', 2500);
  }
}

/* ── Reconexión automática ─────────────────────────────── */
function startReconnect() {
  if (netReconnectTimer) return;
  netReconnectTimer = setInterval(async () => {
    if (netConnected) { stopReconnect(); return; }
    try {
      const status = await window.posdesktop.netClientStatus();
      if (status.connected) {
        netConnected = true;
        stopReconnect();
      }
    } catch (e) {}
  }, 10000); // cada 10 segundos
}

function stopReconnect() {
  if (netReconnectTimer) { clearInterval(netReconnectTimer); netReconnectTimer = null; }
}

/* ── Acciones de red ────────────────────────────────────── */
async function startAsServer(port) {
  if (!isDesktop()) return { ok: false, error: 'Solo disponible en escritorio' };
  try {
    const result = await window.posdesktop.netStartServer(port || 3000);
    if (result.ok) {
      netRole = 'servidor';
      netConnected = true;
      netServerIP = result.ip;
      toast(`Servidor iniciado en ${result.ip}:${result.port}`, 'success', 3500);
      updateNetworkStatusUI();
    }
    return result;
  } catch (e) { return { ok: false, error: String(e) }; }
}

async function connectToServer(serverIP, port) {
  if (!isDesktop()) return { ok: false, error: 'Solo disponible en escritorio' };
  const url = `http://${serverIP}:${port || 3000}`;
  try {
    const result = await window.posdesktop.netStartClient(url, 15000);
    if (result.ok) {
      netRole = 'cliente';
      netConnected = true;
      netServerIP = serverIP;
      toast(`Conectado a ${serverIP}:${port || 3000}`, 'success', 2500);
      updateNetworkStatusUI();
    }
    return result;
  } catch (e) { return { ok: false, error: String(e) }; }
}

async function stopNetwork() {
  if (netRole === 'servidor') {
    await window.posdesktop.netStopServer();
  } else if (netRole === 'cliente') {
    await window.posdesktop.netStopClient();
  }
  netRole = 'standalone';
  netConnected = false;
  netServerIP = '';
  stopReconnect();
  toast('Desconectado de la red', 'info', 2000);
  updateNetworkStatusUI();
}

async function forceSync() {
  if (!isDesktop()) return;
  try {
    await window.posdesktop.syncForce();
    toast('Sincronización forzada', 'success', 2000);
  } catch (e) {
    toast('Error en sincronización', 'error', 2500);
  }
}

/* ── UI: indicador de estado de red ─────────────────────── */
function updateNetworkStatusUI() {
  const el = document.getElementById('netStatus');
  if (!el) return;

  const statusMap = {
    servidor: { color: '#0c8a4a', icon: 'Servidor', detail: netServerIP },
    cliente: { color: netConnected ? '#2a78d2' : '#f5b800', icon: netConnected ? 'Conectado' : 'Reconectando...', detail: netServerIP },
    standalone: { color: '#6b7280', icon: 'Sin red', detail: 'Modo local' }
  };
  const s = statusMap[netRole] || statusMap.standalone;
  el.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color};margin-right:6px"></span><span>${s.icon}</span>${s.detail ? ` <small style="color:#6b7280">(${s.detail})</small>` : ''}`;
  el.style.color = s.color;
}

/* ── Modal: configuración de red ────────────────────────── */
function openNetworkConfig() {
  const localIP = isDesktop() ? (window.posdesktop.netGetIP ? 'Obteniendo...' : 'N/A') : 'N/A';
  if (isDesktop() && window.posdesktop.netGetIP) {
    window.posdesktop.netGetIP().then(ip => {
      const el = document.getElementById('netLocalIP');
      if (el) el.textContent = ip;
    });
  }

  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <!-- Servidor -->
      <div style="border:2px solid ${netRole === 'servidor' ? '#0c8a4a' : '#e2e6ec'};border-radius:12px;padding:16px;background:${netRole === 'servidor' ? '#f0fdf4' : '#fff'}">
        <h4 style="margin:0 0 10px;color:#1f2937">Servidor (Caja Principal)</h4>
        <p style="font-size:12px;color:#6b7280;margin:0 0 10px">Esta caja actúa como servidor. Las demás cajas se conectan a esta.</p>
        <div class="field"><label>Puerto</label><input type="number" id="netPort" value="3000" ${netRole === 'servidor' ? 'disabled' : ''} /></div>
        <div class="field"><label>IP Local</label><input id="netLocalIP" value="${localIP}" disabled style="background:#f3f4f6;font-family:Consolas,monospace" /></div>
        ${netRole === 'servidor'
          ? `<button class="btn danger" id="netStopServer" style="width:100%">Detener Servidor</button>`
          : `<button class="btn primary" id="netStartServer" style="width:100%">Iniciar Servidor</button>`
        }
      </div>
      <!-- Cliente -->
      <div style="border:2px solid ${netRole === 'cliente' ? '#2a78d2' : '#e2e6ec'};border-radius:12px;padding:16px;background:${netRole === 'cliente' ? '#eff6ff' : '#fff'}">
        <h4 style="margin:0 0 10px;color:#1f2937">Cliente (Caja adicional)</h4>
        <p style="font-size:12px;color:#6b7280;margin:0 0 10px">Conectarse a otra caja que actúe como servidor.</p>
        <div class="field"><label>IP del Servidor</label><input id="netServerIP" placeholder="192.168.1.100" /></div>
        <div class="field"><label>Puerto</label><input type="number" id="netClientPort" value="3000" /></div>
        ${netRole === 'cliente'
          ? `<button class="btn danger" id="netDisconnect" style="width:100%">Desconectar</button>`
          : `<button class="btn primary" id="netConnect" style="width:100%">Conectar</button>`
        }
      </div>
    </div>
    <div style="margin-top:14px;border:1px solid #e2e6ec;border-radius:8px;padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b style="font-size:13px">Estado de sincronización</b>
        <button class="btn sm" id="netForceSync">Forzar sync</button>
      </div>
      <div style="font-size:12px;color:#6b7280;margin-top:6px">
        <div>Operaciones sincronizadas: <b id="netSyncCount">${netSyncCount}</b></div>
        <div>Última sync: <b id="netLastSync">${netLastSync ? netLastSync.toLocaleTimeString() : 'Nunca'}</b></div>
      </div>
      <div id="netStatusDetail" style="margin-top:8px"></div>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cerrar</button>`;
  openModal({ title: 'Configuración de Red — Multi-Caja', body: html, footer, size: 'modal-lg' });

  setTimeout(() => {
    if (document.getElementById('netStartServer')) {
      document.getElementById('netStartServer').addEventListener('click', async () => {
        const port = parseInt(document.getElementById('netPort').value) || 3000;
        await startAsServer(port);
        closeModal();
      });
    }
    if (document.getElementById('netStopServer')) {
      document.getElementById('netStopServer').addEventListener('click', async () => {
        await stopNetwork();
        closeModal();
      });
    }
    if (document.getElementById('netConnect')) {
      document.getElementById('netConnect').addEventListener('click', async () => {
        const ip = document.getElementById('netServerIP').value.trim();
        const port = parseInt(document.getElementById('netClientPort').value) || 3000;
        if (!ip) { toast('Ingrese la IP del servidor', 'warn'); return; }
        await connectToServer(ip, port);
        closeModal();
      });
    }
    if (document.getElementById('netDisconnect')) {
      document.getElementById('netDisconnect').addEventListener('click', async () => {
        await stopNetwork();
        closeModal();
      });
    }
    if (document.getElementById('netForceSync')) {
      document.getElementById('netForceSync').addEventListener('click', forceSync);
    }
  }, 60);
}

/* ── Resumen de estado ──────────────────────────────────── */
function getNetworkStatus() {
  return { role: netRole, connected: netConnected, serverIP: netServerIP, syncCount: netSyncCount, lastSync: netLastSync };
}
