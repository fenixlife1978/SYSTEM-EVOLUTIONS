/* ============================================================
   network.js — Servidor HTTP + WebSocket (multi-caja)
   ------------------------------------------------------------
   Modo SERVIDOR: expone API REST + WebSocket para que otras
   cajas se conecten, sincronicen catálogos y envíen ventas.
   Modo CLIENTE: se conecta al servidor vía HTTP/WebSocket,
   descarga catálogos, envía operaciones y recibe actualizaciones
   en tiempo real.
   ============================================================ */
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

let serverHttp = null;
let wss = null;
let clientWs = null;
let syncInterval = null;
let onEvent = null; // callback para notificar al renderer

/* ── Utilidades ─────────────────────────────────────────── */
function getLocalIP() {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function jsonRes(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 5e6) reject(new Error('Payload too large')); });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
  });
}

/* ============================================================
   MODO SERVIDOR
   ============================================================ */
function startServer(dataStore, port) {
  if (serverHttp) return { ok: true, ip: getLocalIP(), port };

  const PORT = port || 3000;

  serverHttp = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Caja-Id');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    try {
      // ── Info del servidor ──
      if (pathname === '/api/info' && req.method === 'GET') {
        const cajas = dataStore.listarCajas();
        return jsonRes(res, 200, {
          ok: true,
          serverId: dataStore.getCajaId(),
          cajas,
          ip: getLocalIP(),
          port: PORT
        });
      }

      // ── Descarga de catálogos completos ──
      if (pathname === '/api/sync/catalogs' && req.method === 'GET') {
        const state = dataStore.loadState();
        return jsonRes(res, 200, { ok: true, state });
      }

      // ── Recibir operaciones de cajas cliente ──
      if (pathname === '/api/sync/push' && req.method === 'POST') {
        const body = await parseBody(req);
        const { cajaId: fromCaja, operaciones } = body;
        if (!operaciones || !Array.isArray(operaciones)) {
          return jsonRes(res, 400, { ok: false, error: 'operaciones requerido' });
        }
        // Aplicar cada operación al state local
        const state = dataStore.loadState() || {};
        let applied = 0;
        for (const op of operaciones) {
          try {
            applyOperation(state, op);
            applied++;
          } catch (e) {
            console.error('[sync] Error aplicando operación:', e.message);
          }
        }
        dataStore.saveState(state);
        dataStore.logSyncHistory(fromCaja, dataStore.getCajaId(), 'push', applied, 'ok');
        // Notificar a clientes conectados vía WebSocket
        broadcastToClients({ type: 'sync_update', fromCaja, count: applied, timestamp: Date.now() });
        return jsonRes(res, 200, { ok: true, applied });
      }

      // ── Pull: obtener operaciones pendientes para una caja ──
      if (pathname === '/api/sync/pull' && req.method === 'POST') {
        const body = await parseBody(req);
        const { cajaId: toCaja, since } = body;
        const state = dataStore.loadState() || {};
        // Devolver datos completos para que la caja cliente se hidrate
        return jsonRes(res, 200, { ok: true, state, timestamp: Date.now() });
      }

      // ── Registrar caja ──
      if (pathname === '/api/cajas' && req.method === 'POST') {
        const body = await parseBody(req);
        const caja = dataStore.crearCaja(body);
        broadcastToClients({ type: 'caja_nueva', caja });
        return jsonRes(res, 201, { ok: true, caja });
      }

      // ── Listar cajas ──
      if (pathname === '/api/cajas' && req.method === 'GET') {
        return jsonRes(res, 200, { ok: true, cajas: dataStore.listarCajas() });
      }

      // ── Actualizar caja ──
      if (pathname.startsWith('/api/cajas/') && req.method === 'PUT') {
        const id = pathname.split('/').pop();
        const body = await parseBody(req);
        dataStore.actualizarCaja(id, body);
        broadcastToClients({ type: 'caja_update', cajaId: id, data: body });
        return jsonRes(res, 200, { ok: true });
      }

      // ── Heartbeat ──
      if (pathname === '/api/ping' && req.method === 'GET') {
        return jsonRes(res, 200, { ok: true, serverId: dataStore.getCajaId(), time: Date.now() });
      }

      // ── Ventas consolidadas (admin) ──
      if (pathname === '/api/reports/sales' && req.method === 'GET') {
        const state = dataStore.loadState() || {};
        return jsonRes(res, 200, { ok: true, sales: state.sales || [] });
      }

      jsonRes(res, 404, { ok: false, error: 'Not found' });
    } catch (e) {
      console.error('[server] Error:', e.message);
      jsonRes(res, 500, { ok: false, error: e.message });
    }
  });

  // WebSocket server
  wss = new WebSocketServer({ server: serverHttp });
  const clients = new Set();

  wss.on('connection', (ws, req) => {
    clients.add(ws);
    const remoteIP = req.socket.remoteAddress;
    console.log('[WS] Cliente conectado:', remoteIP);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'register') {
          ws._cajaId = msg.cajaId;
          console.log('[WS] Caja registrada:', msg.cajaId);
        }
      } catch (e) {}
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log('[WS] Cliente desconectado:', ws._cajaId || 'desconocido');
    });

    ws.on('error', () => clients.delete(ws));
  });

  function broadcastToClients(msg) {
    const data = JSON.stringify(msg);
    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
  }

  return new Promise((resolve) => {
    serverHttp.listen(PORT, '0.0.0.0', () => {
      const ip = getLocalIP();
      console.log(`[Server] POSserver escuchando en ${ip}:${PORT}`);
      dataStore.logSyncHistory(dataStore.getCajaId(), '*', 'server_start', 0, 'ok');
      resolve({ ok: true, ip, port: PORT });
    });
  });
}

function stopServer() {
  if (wss) { wss.close(); wss = null; }
  if (serverHttp) { serverHttp.close(); serverHttp = null; }
}

/* ============================================================
   MODO CLIENTE
   ============================================================ */
function startClient(serverUrl, dataStore, intervalMs) {
  if (clientWs) return { ok: true, connected: true };

  const url = new URL(serverUrl);
  const httpBase = `http://${url.hostname}:${url.port || 3000}`;
  const wsUrl = `ws://${url.hostname}:${url.port || 3000}`;

  // 1) Conectar WebSocket para tiempo real
  try {
    clientWs = new WebSocket(wsUrl);
    clientWs.on('open', () => {
      console.log('[Client WS] Conectado al servidor');
      clientWs.send(JSON.stringify({ type: 'register', cajaId: dataStore.getCajaId() }));
      if (onEvent) onEvent({ type: 'connected', server: httpBase });
    });
    clientWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        console.log('[Client WS] Mensaje:', msg.type);
        if (onEvent) onEvent(msg);
      } catch (e) {}
    });
    clientWs.on('close', () => {
      console.log('[Client WS] Desconectado');
      clientWs = null;
      if (onEvent) onEvent({ type: 'disconnected' });
    });
    clientWs.on('error', (e) => {
      console.error('[Client WS] Error:', e.message);
      clientWs = null;
    });
  } catch (e) {
    console.error('[Client WS] No se pudo conectar:', e.message);
  }

  // 2) Sincronización periódica en background
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(async () => {
    await syncPush(dataStore, httpBase);
    await syncPull(dataStore, httpBase);
  }, intervalMs || 30000);

  // 3) Sincronización inicial inmediata
  (async () => {
    await syncPull(dataStore, httpBase);
    await syncPush(dataStore, httpBase);
  })();

  return { ok: true, connected: true, server: httpBase };
}

function stopClient() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
  if (clientWs) { clientWs.close(); clientWs = null; }
}

async function syncPush(dataStore, httpBase) {
  const pending = dataStore.getPendingSync();
  if (!pending.length) return;
  try {
    const res = await fetch(`${httpBase}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cajaId: dataStore.getCajaId(),
        operaciones: pending.map(p => ({ operacion: p.operacion, tabla: p.tabla, datos: JSON.parse(p.datos), id: p.id }))
      })
    });
    const data = await res.json();
    if (data.ok && data.applied > 0) {
      dataStore.markSynced(pending.map(p => p.id));
      console.log(`[Sync] ${data.applied} operaciones sincronizadas`);
      if (onEvent) onEvent({ type: 'sync_complete', count: data.applied });
    }
  } catch (e) {
    console.error('[Sync Push] Error:', e.message);
  }
}

async function syncPull(dataStore, httpBase) {
  try {
    const res = await fetch(`${httpBase}/api/sync/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cajaId: dataStore.getCajaId() })
    });
    const data = await res.json();
    if (data.ok && data.state) {
      // Hidratar estado desde servidor (catálogos compartidos)
      dataStore.saveState(data.state);
      console.log('[Sync Pull] Estado actualizado desde servidor');
      if (onEvent) onEvent({ type: 'state_updated' });
    }
  } catch (e) {
    console.error('[Sync Pull] Error:', e.message);
  }
}

async function httpClientGet(httpBase, path) {
  try {
    const res = await fetch(`${httpBase}${path}`);
    return await res.json();
  } catch (e) { return { ok: false, error: e.message }; }
}

async function httpClientPost(httpBase, path, body) {
  try {
    const res = await fetch(`${httpBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (e) { return { ok: false, error: e.message }; }
}

/* ── Aplicar operación al state ─────────────────────────── */
function applyOperation(state, op) {
  const { operacion, tabla, datos } = op;
  if (!state[tabla]) state[tabla] = [];

  if (operacion === 'insert') {
    // Evitar duplicados por id
    const idx = state[tabla].findIndex(x => x.id === datos.id);
    if (idx >= 0) state[tabla][idx] = datos;
    else state[tabla].unshift(datos);
  } else if (operacion === 'update') {
    const idx = state[tabla].findIndex(x => x.id === datos.id);
    if (idx >= 0) Object.assign(state[tabla][idx], datos);
    else state[tabla].unshift(datos);
  } else if (operacion === 'delete') {
    state[tabla] = state[tabla].filter(x => x.id !== datos.id);
  } else if (operacion === 'merge') {
    // Merge completo de un array
    if (Array.isArray(datos)) {
      datos.forEach(d => {
        const idx = state[tabla].findIndex(x => x.id === d.id);
        if (idx >= 0) state[tabla][idx] = d;
        else state[tabla].unshift(d);
      });
    }
  }
}

function setOnEvent(cb) { onEvent = cb; }
function getOnEvent() { return onEvent; }

module.exports = {
  getLocalIP,
  startServer, stopServer,
  startClient, stopClient,
  syncPush, syncPull,
  httpClientGet, httpClientPost,
  setOnEvent, getOnEvent,
  get isConnected() { return !!clientWs; },
  get isServerRunning() { return !!serverHttp; }
};
