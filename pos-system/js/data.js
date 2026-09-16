/* ============================================================
   data.js — Modelo de datos y persistencia
   ------------------------------------------------------------
   Persistencia dual:
   - Escritorio (Electron): SQLite a través de window.posdesktop (IPC).
   - Navegador (dev): localStorage como respaldo.
   Multi-caja: cada operación lleva caja_id y numeración propia.
   ============================================================ */
const DB_KEY = 'possystem_db_v1';

/* Seed mínimo / "sistema en blanco": estructura lista, sin datos demo.
   Se conservan filas de referencia necesarias para que la app no falle
   (cliente por defecto, usuarios de acceso, configuración de empresa). */
const seedData = {
  products: [],

  clients: [
    { id: 1, code: '99999999999', name: 'Consumidor Final', address: '', phone: '', email: '', taxId: '99999999999', creditLimit: 0, balance: 0, status: 'active', createdAt: new Date().toISOString().slice(0, 10) }
  ],

  suppliers: [],

  receivables: [],
  payables: [],
  purchases: [],
  sales: [],
  refunds: [],
  pendingSales: [],
  accounting: [],
  cashbox: [],

  users: [
    { id: 1, username: 'admin', name: 'Administrador', role: 'admin', email: 'admin@possystemevolution.com', branch: 'Principal', status: 'active', lastLogin: '' },
    { id: 2, username: 'cajero1', name: 'BIGWISE', role: 'cashier', email: 'bigwise@possystemevolution.com', branch: 'Principal', status: 'active', lastLogin: '' },
    { id: 3, username: 'supervisor', name: 'María Pérez', role: 'supervisor', email: 'mperez@possystemevolution.com', branch: 'Principal', status: 'active', lastLogin: '' }
  ],

  settings: {
    company: {
      name: 'Mi Empresa, C.A.',
      rif: 'J-00000000-0',
      address: 'Dirección de la empresa, Ciudad',
      phone: '0212-0000000',
      email: 'contacto@miempresa.com',
      website: 'www.miempresa.com',
      logo: 'owl'
    },
    tax: { name: 'IVA', rate: 16, included: true },
    invoice: { prefix: '0100', nextNumber: 1, decimals: 2 },
    pos: {
      printAfterSale: false,
      requireCustomer: false,
      defaultCustomer: 'Consumidor Final',
      allowNegativeStock: false,
      currencySymbol: '$',
      usdRate: 36.00,
      receiptFooter: '¡Gracias por su compra!\nVuelva pronto'
    },
    branches: ['Principal', 'Sucursal Norte', 'Sucursal Sur'],
    cajas: {}
  },

  jornada: { openedOnce: false, active: false, openedAt: null },
  jornadaZ: []
};

/* ============================================================
   Multi-caja: ID y numeración independiente
   ============================================================ */
let currentCajaId = null;
let currentCajaNombre = 'Caja Principal';

async function initCajaId() {
  if (!isDesktop()) {
    currentCajaId = localStorage.getItem('pos_caja_id') || 'CAJA-LOCAL';
    currentCajaNombre = localStorage.getItem('pos_caja_nombre') || 'Caja Local';
    return;
  }
  try {
    currentCajaId = await window.posdesktop.cajaGetId();
  } catch (e) {
    currentCajaId = 'CAJA-LOCAL';
  }
}

function getCajaId() { return currentCajaId || 'CAJA-LOCAL'; }
function getCajaNombre() { return currentCajaNombre || 'Caja Principal'; }
function setCajaInfo(id, nombre) {
  currentCajaId = id;
  currentCajaNombre = nombre || id;
  if (!isDesktop()) {
    localStorage.setItem('pos_caja_id', id);
    localStorage.setItem('pos_caja_nombre', nombre || '');
  }
}

/* Numeración de facturación independiente por caja */
function getInvoicePrefix() {
  const cajaConf = db.settings?.cajas?.[getCajaId()];
  return cajaConf?.prefijo || getCajaId()?.slice(-2) || '01';
}

function nextInvoiceNumber() {
  const cajaConf = db.settings?.cajas?.[getCajaId()];
  if (!cajaConf) {
    if (!db.settings.cajas) db.settings.cajas = {};
    db.settings.cajas[getCajaId()] = { nextNumber: 1, prefijo: getInvoicePrefix() };
  }
  const n = db.settings.cajas[getCajaId()].nextNumber || 1;
  db.settings.cajas[getCajaId()].nextNumber = n + 1;
  return n;
}

function buildInvoiceNumber() {
  const prefix = getInvoicePrefix();
  const n = nextInvoiceNumber();
  return prefix + String(n).padStart(8, '0');
}

const isDesktop = () => !!(typeof window !== 'undefined' && window.posdesktop);

/* ---------- Demo helpers ---------- */
const DEMO_MAX_PRODUCTS = 10;
const DEMO_MAX_SALES    = 20;
function isDemo() { return !!window.__DEMO__; }
function demoProductLimit() { return isDemo() && db.products.length >= DEMO_MAX_PRODUCTS; }
function demoSalesLimit()   { return isDemo() && db.sales.length >= DEMO_MAX_SALES; }
function demoBlock(msg) {
  toast(msg || 'Version Demo: limite alcanzado. Adquiera la version completa para seguir operando sin problemas.', 'error', 4500);
  return false;
}

/* ---------- Persistencia ---------- */
const DB = {
  load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) { this.save(seedData); return JSON.parse(JSON.stringify(seedData)); }
      return JSON.parse(raw);
    } catch (e) { return JSON.parse(JSON.stringify(seedData)); }
  },
  save(data) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(data)); } catch (e) {}
    if (isDesktop() && window.posdesktop.stateSave) {
      window.posdesktop.stateSave(data).catch(err => console.error('[state:save]', err));
    }
  },
  reset() {
    localStorage.removeItem(DB_KEY);
    if (isDesktop()) {
      const fresh = JSON.parse(JSON.stringify(seedData));
      this.save(fresh);
      return fresh;
    }
    return this.load();
  },
  /* Encola una operación para sync offline (multi-caja) */
  queueSync(operacion, tabla, datos) {
    if (!isDesktop() || !window.posdesktop.syncPush) return;
    window.posdesktop.syncPush(operacion, tabla, datos).catch(() => {});
  }
};

const db = DB.load();
let session = { user: null, role: null };

/* Hidrata `db` desde SQLite (escritorio) reemplazando en su lugar el contenido.
   Se invoca antes de `boot()` para que toda la UI trabaje con datos reales.
   Multi-caja: inicializa el ID de caja antes de hidratar. */
async function hydrateFromSource() {
  await initCajaId();
  if (!isDesktop() || !window.posdesktop.stateLoad) return;
  try {
    const res = await window.posdesktop.stateLoad();
    if (res && res.ok && res.state && typeof res.state === 'object') {
      Object.keys(db).forEach(k => delete db[k]);
      Object.assign(db, res.state);
      // Asegurar arrays y objetos necesarios
      if (!db.settings) db.settings = seedData.settings;
      if (!db.settings.cajas) db.settings.cajas = {};
      if (!db.jornada) db.jornada = { openedOnce: false, active: false };
      if (!db.jornadaZ) db.jornadaZ = [];
      console.info('[data] estado cargado desde SQLite · Caja:', getCajaId());
    } else {
      window.posdesktop.stateSave(db).catch(() => {});
      console.info('[data] SQLite vacío; inicializado con estado en blanco');
    }
  } catch (e) {
    console.error('[data] error al hidratar desde SQLite:', e);
  }
}

/* ---------- Util ---------- */
const fmt = {
  // Moneda principal: USD (fija, no depende de configuración)
  money(v) {
    const s = (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '$ ' + s;
  },
  num(v) { return (Number(v) || 0).toFixed(2); },
  // Redondeo de moneda sin ruido de punto flotante (devuelve número ya redondeado a d decimales).
  rnd(v, d) {
    const n = Number(v) || 0; const p = Math.pow(10, d == null ? 2 : d);
    return Math.round((n + Number.EPSILON) * p) / p;
  },
  // Moneda con hasta 6 decimales recortados (para precios por unidad muy pequeños, p. ej. ml).
  moneyDyn(v) {
    const n = Number(v) || 0;
    let s = n.toFixed(6).replace(/0+$/, '');
    if (s.charAt(s.length - 1) === '.') s = s.slice(0, -1);
    if (!s.includes('.')) s += '.00';
    else if (s.split('.')[1].length < 2) s = n.toFixed(2);
    return '$ ' + s;
  },
  // Precios de fracción en el carrito: hasta 5 decimales (sin redondear a 2).
  frac(v) {
    const n = Number(v) || 0;
    let s = n.toFixed(5).replace(/0+$/, '');
    if (s.charAt(s.length - 1) === '.') s = s.slice(0, -1);
    if (!s.includes('.')) s += '.00';
    else if (s.split('.')[1].length < 2) s = n.toFixed(2);
    return '$ ' + s;
  },
  // Formato de montos: "X.XXX.XXX,XX" (miles con punto, decimales con coma).
  esp(v) {
    const n = Number(v) || 0;
    const neg = n < 0;
    const t = Math.abs(n).toFixed(2);
    const sp = t.split('.');
    let i = sp[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + i + ',' + sp[1];
  },
  parseEsp(s) {
    s = String(s == null ? '' : s).trim().replace(/[^0-9.,-]/g, '');
    if (!s) return 0;
    let neg = false;
    if (s.charAt(0) === '-') { neg = true; s = s.slice(1); }
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(/,/g, '.');
    } else {
      const dots = (s.match(/\./g) || []).length;
      if (dots > 1) s = s.replace(/\./g, '');
    }
    const v = parseFloat(s);
    return isFinite(v) ? (neg ? -v : v) : 0;
  },
  moneyEsp(v) { return '$ ' + this.esp(v); },
  bsEsp(v) { return 'Bs. ' + this.esp(v); },
  usdRate() { return Number(db.settings?.pos?.usdRate) || 36; },
  // Equivalencia en Bolívares (moneda secundaria): USD × tasa
  bs(v) {
    const s = ((Number(v) || 0) * this.usdRate()).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return 'Bs. ' + s;
  },
  usd(v) { return this.money(v); },
  date(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('es-VE', { day:'2-digit', month:'2-digit', year:'numeric' });
  },
  dateLong(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('es-VE', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }
};

/* ---------- Tasa BCV automática desde API oficial ---------- */
let _bcvLastFetch = 0;
const BCV_API_URL = 'https://bcv.today/api/rate.json';
const BCV_CACHE_MS = 10 * 60 * 1000; // 10 minutos

async function fetchBcvRate() {
  const now = Date.now();
  if (now - _bcvLastFetch < BCV_CACHE_MS) return; // ya reciente
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(BCV_API_URL, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!resp.ok) return;
    const data = await resp.json();
    const rate = Number(data?.rate || data?.USD || data?.ventana);
    if (rate > 0) {
      db.settings.pos.usdRate = Math.round(rate * 100) / 100;
      _bcvLastFetch = now;
      console.info('[BCV] Tasa actualizada:', db.settings.pos.usdRate);
    }
  } catch (e) {
    console.warn('[BCV] No se pudo obtener tasa oficial:', e.message || e);
  }
}

/* ---------- Fecha / hora local de Venezuela (UTC-4, sin horario de verano) ---------- */
const VE_OFFSET_H = -4;
function veParts(t) {
  const d = t ? new Date(t) : new Date();
  // Correr el instante a UTC-4 y leer sus componentes UTC = hora de pared de Venezuela.
  const v = new Date(d.getTime() + VE_OFFSET_H * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return { year: String(v.getUTCFullYear()), month: p(v.getUTCMonth() + 1), day: p(v.getUTCDate()), hour: p(v.getUTCHours()), minute: p(v.getUTCMinutes()), second: p(v.getUTCSeconds()) };
}
function veDate(t) { const o = veParts(t); return o.year + '-' + o.month + '-' + o.day; }
function veTime(t) { const o = veParts(t); return o.hour + ':' + o.minute; }
function veStamp(t) { return veDate(t) + ' ' + veTime(t); }
const VE_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const VE_DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function veLong(t) {
  const o = veParts(t); const dayName = VE_DIAS[new Date(o.year, o.month - 1, o.day).getDay()];
  return `${dayName}, ${Number(o.day)} de ${VE_MESES[Number(o.month) - 1]} de ${o.year}, ${veHm12(o.hour + ':' + o.minute)}`;
}
/* Convierte "HH:MM" (o un sello "YYYY-MM-DD HH:MM") a "h:mm a. m./p. m.". */
function veHm12(stamp) {
  const m = /(\d{2}):(\d{2})/.exec(String(stamp == null ? '' : stamp));
  if (!m) return '';
  let h = +m[1]; const mm = m[2]; const ap = h >= 12 ? 'p. m.' : 'a. m.';
  h = h % 12 || 12;
  return h + ':' + mm + ' ' + ap;
}
/* Devuelve un Date con la hora de Venezuela (para cálculos de vencimiento locales). */
function veNowDate() {
  const o = veParts();
  return new Date(o.year, o.month - 1, o.day, o.hour, o.minute, o.second);
}

/* ============================================================
   Multi-caja: funciones exportadas
   ============================================================ */
function setCurrentCajaInfo(id, nombre) { setCajaInfo(id, nombre); }
function getCurrentCajaId() { return getCajaId(); }
function getCurrentCajaNombre() { return getCajaNombre(); }
function getInvoicePrefixForCaja() { return getInvoicePrefix(); }
function generateInvoiceNumber() { return buildInvoiceNumber(); }

/* Obtiene la numeración de una factura para una caja específica (sin incrementar) */
function peekInvoiceNumber(cajaId) {
  const cid = cajaId || getCajaId();
  const cajaConf = db.settings?.cajas?.[cid];
  const prefix = cajaConf?.prefijo || cid?.slice(-2) || '01';
  const n = cajaConf?.nextNumber || 1;
  return prefix + String(n).padStart(8, '0');
}

/* Registra una venta con caja_id para aislamiento de datos */
function registerSale(saleData) {
  const sale = {
    ...saleData,
    caja_id: getCajaId(),
    caja_nombre: getCajaNombre()
  };
  db.sales.unshift(sale);
  DB.queueSync('insert', 'sales', sale);
  DB.save(db);
  return sale;
}

/* Registra una compra con caja_id */
function registerPurchase(purchaseData) {
  const purchase = {
    ...purchaseData,
    caja_id: getCajaId(),
    caja_nombre: getCajaNombre()
  };
  db.purchases.unshift(purchase);
  DB.queueSync('insert', 'purchases', purchase);
  DB.save(db);
  return purchase;
}

/* Registra un movimiento de caja con caja_id */
function registerCashbox(cashData) {
  const movement = {
    ...cashData,
    caja_id: getCajaId(),
    caja_nombre: getCajaNombre()
  };
  db.cashbox.unshift(movement);
  DB.queueSync('insert', 'cashbox', movement);
  DB.save(db);
  return movement;
}

/* Registra un reembolso con caja_id */
function registerRefund(refundData) {
  const refund = {
    ...refundData,
    caja_id: getCajaId(),
    caja_nombre: getCajaNombre()
  };
  if (!db.refunds) db.refunds = [];
  db.refunds.unshift(refund);
  DB.queueSync('insert', 'refunds', refund);
  DB.save(db);
  return refund;
}

/* Filtra ventas por caja_id (o todas si es null) */
function filterSalesByCaja(cajaId) {
  if (!cajaId) return db.sales;
  return db.sales.filter(s => s.caja_id === cajaId);
}

/* Resumen de ventas por cada caja */
function salesSummaryByCaja() {
  const summary = {};
  db.sales.forEach(s => {
    const cid = s.caja_id || 'sin-caja';
    if (!summary[cid]) summary[cid] = { caja_id: cid, caja_nombre: s.caja_nombre || cid, ventas: 0, total: 0, credito: 0, contado: 0 };
    summary[cid].ventas++;
    summary[cid].total += Number(s.total) || 0;
    if (s.status === 'credit') summary[cid].credito += Number(s.total) || 0;
    else summary[cid].contado += Number(s.total) || 0;
  });
  return Object.values(summary);
}
