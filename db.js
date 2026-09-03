/* ============================================================
   db.js — Capa de persistencia SQLite (proceso principal)
   ------------------------------------------------------------
   En esta fase (infraestructura) el SQLite actúa como state store
   para la aplicación: la UI trabaja con un documento JSON completo
   y aquí se persiste de forma fiable y transaccional.

   La Fase 1 de inventario evolucionará esto a tablas relacionales
   (unidades, presentación base, conversiones, stock canónico, etc.)
   manteniendo este módulo como único punto de acceso.
   ============================================================ */
const path = require('path');
const Database = require('better-sqlite3');

const STATE_KEY = 'app_state_v1';

let db = null;
let dbPath = '';

/* Inicializa la base de datos en el directorio de datos del usuario. */
function initDb(dir) {
  dbPath = path.join(dir, 'possystem.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return dbPath;
}

/* Guarda el documento completo de estado de la aplicación. */
function saveState(json) {
  if (!db) throw new Error('Base de datos no inicializada');
  const stmt = db.prepare(`
    INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  stmt.run(STATE_KEY, JSON.stringify(json));
  return true;
}

/* Devuelve el estado persistido o null si no existe. */
function loadState() {
  if (!db) throw new Error('Base de datos no inicializada');
  const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get(STATE_KEY);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch (e) { return null; }
}

/* Lee/escribe un valor en la tabla meta (pequeños flags). */
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

function metaInfo() {
  if (!db) return {};
  const v = metaGet('schema_version');
  return {
    dbPath,
    schemaVersion: v || '1',
    tables: db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all().map(r => r.name)
  };
}

function close() { if (db) { try { db.close(); } catch (e) {} } }

module.exports = { initDb, saveState, loadState, metaGet, metaSet, metaInfo, close, get dbPath() { return dbPath; } };
