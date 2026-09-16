/* ============================================================
   db.js — Capa de persistencia SQLite (proceso principal)
   ------------------------------------------------------------
   Multi-caja: cada instancia tiene su propia DB local.
   Las tablas de catálogo (products, clients, etc.) se comparten
   vía sincronización cuando la caja es cliente de un servidor.
   Las tablas de operaciones (sales, purchases, cashbox, etc.)
   incluyen caja_id para aislar datos por estación.
   ============================================================ */
const path = require('path');
const Database = require('better-sqlite3');
const crypto = require('crypto');

const STATE_KEY = 'app_state_v1';

let db = null;
let dbPath = '';
let cajaId = null;

/* ── Identificador único de esta caja ────────────────────── */
function ensureCajaId() {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('caja_id');
  if (row && row.value) { cajaId = row.value; return cajaId; }
  cajaId = 'CAJA-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('caja_id', cajaId);
  return cajaId;
}

function getCajaId() { return cajaId; }

/* ── Inicializa la base de datos ─────────────────────────── */
function initDb(dir, nombreCaja) {
  dbPath = path.join(dir, 'possystem.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    -- Estado de la aplicación (JSON completo)
    CREATE TABLE IF NOT EXISTS app_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Metadata general
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Registro de cajas del sistema
    CREATE TABLE IF NOT EXISTS cajas (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'cliente',
      ip TEXT,
      puerto INTEGER DEFAULT 3000,
      estado TEXT NOT NULL DEFAULT 'activa',
      cajero_asignado TEXT,
      prefijo_factura TEXT NOT NULL DEFAULT '01',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Cola de sincronización offline
    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caja_id TEXT NOT NULL,
      operacion TEXT NOT NULL,
      tabla TEXT NOT NULL,
      datos TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT
    );

    -- Historial de conexiones entre cajas
    CREATE TABLE IF NOT EXISTS sync_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caja_origen TEXT NOT NULL,
      caja_destino TEXT NOT NULL,
      tipo TEXT NOT NULL,
      operaciones INTEGER DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'ok',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  ensureCajaId();

  // Registrar esta caja si no existe
  const exists = db.prepare('SELECT id FROM cajas WHERE id = ?').get(cajaId);
  if (!exists) {
    db.prepare(`
      INSERT INTO cajas (id, nombre, tipo, prefijo_factura)
      VALUES (?, ?, 'servidor', '01')
    `).run(cajaId, nombreCaja || 'Caja Principal');
  }

  return dbPath;
}

/* ── Persistencia de estado (JSON completo) ──────────────── */
function saveState(json) {
  if (!db) throw new Error('Base de datos no inicializada');
  const stmt = db.prepare(`
    INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  stmt.run(STATE_KEY, JSON.stringify(json));
  return true;
}

function loadState() {
  if (!db) throw new Error('Base de datos no inicializada');
  const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get(STATE_KEY);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch (e) { return null; }
}

/* ── Meta helpers ────────────────────────────────────────── */
function metaGet(key) {
  if (!db) return null;
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(String(key));
  return row ? row.value : null;
}
function metaSet(key, value) {
  if (!db) return false;
  db.prepare(`
    INSERT INTO meta (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(String(key), String(value));
  return true;
}

/* ── Gestión de cajas ───────────────────────────────────── */
function crearCaja(data) {
  const id = data.id || ('CAJA-' + crypto.randomBytes(4).toString('hex').toUpperCase());
  db.prepare(`
    INSERT INTO cajas (id, nombre, tipo, ip, puerto, prefijo_factura, cajero_asignado)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.nombre, data.tipo || 'cliente', data.ip || null, data.puerto || 3000, data.prefijo_factura || '01', data.cajero_asignado || null);
  return { id, ...data };
}

function listarCajas() {
  return db.prepare('SELECT * FROM cajas ORDER BY created_at').all();
}

function getCaja(id) {
  return db.prepare('SELECT * FROM cajas WHERE id = ?').get(id);
}

function actualizarCaja(id, data) {
  const fields = [];
  const values = [];
  for (const [k, v] of Object.entries(data)) {
    if (['nombre', 'tipo', 'ip', 'puerto', 'estado', 'cajero_asignado', 'prefijo_factura'].includes(k)) {
      fields.push(k + ' = ?');
      values.push(v);
    }
  }
  if (fields.length === 0) return false;
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE cajas SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return true;
}

function eliminarCaja(id) {
  if (id === cajaId) throw new Error('No se puede eliminar la caja actual');
  db.prepare('DELETE FROM cajas WHERE id = ?').run(id);
  return true;
}

/* ── Cola de sincronización offline ──────────────────────── */
function pushSync(operacion, tabla, datos) {
  if (!db) return false;
  db.prepare(`
    INSERT INTO sync_log (caja_id, operacion, tabla, datos)
    VALUES (?, ?, ?, ?)
  `).run(cajaId, operacion, tabla, JSON.stringify(datos));
  return true;
}

function getPendingSync() {
  return db.prepare('SELECT * FROM sync_log WHERE synced = 0 ORDER BY id').all();
}

function markSynced(ids) {
  if (!ids.length) return;
  const stmt = db.prepare('UPDATE sync_log SET synced = 1, synced_at = datetime(\'now\') WHERE id = ?');
  const tx = db.transaction((arr) => arr.forEach(id => stmt.run(id)));
  tx(ids);
}

function clearOldSync(days) {
  const d = days || 30;
  db.prepare(`DELETE FROM sync_log WHERE synced = 1 AND synced_at < datetime('now', '-${d} days')`).run();
}

/* ── Historial de sincronización ─────────────────────────── */
function logSyncHistory(origen, destino, tipo, operaciones, estado) {
  db.prepare(`
    INSERT INTO sync_history (caja_origen, caja_destino, tipo, operaciones, estado)
    VALUES (?, ?, ?, ?, ?)
  `).run(origen, destino, tipo, operaciones || 0, estado || 'ok');
}

function getSyncHistory(limit) {
  return db.prepare('SELECT * FROM sync_history ORDER BY id DESC LIMIT ?').all(limit || 50);
}

/* ── Info ────────────────────────────────────────────────── */
function metaInfo() {
  if (!db) return {};
  const v = metaGet('schema_version');
  return {
    dbPath,
    cajaId,
    schemaVersion: v || '2',
    tables: db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all().map(r => r.name)
  };
}

function close() { if (db) { try { db.close(); } catch (e) {} } }

module.exports = {
  initDb, saveState, loadState, metaGet, metaSet, metaInfo, close,
  getCajaId,
  crearCaja, listarCajas, getCaja, actualizarCaja, eliminarCaja,
  pushSync, getPendingSync, markSynced, clearOldSync,
  logSyncHistory, getSyncHistory,
  get db() { return db; },
  get dbPath() { return dbPath; }
};
