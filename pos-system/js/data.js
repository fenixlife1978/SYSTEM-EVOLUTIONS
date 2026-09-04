/* ============================================================
   data.js — Modelo de datos y persistencia
   ------------------------------------------------------------
   Persistencia dual:
   - Escritorio (Electron): SQLite a través de window.posdesktop (IPC).
   - Navegador (dev): localStorage como respaldo.
   El estado se hidrata desde la fuente antes de arrancar la UI.
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
      openDrawerAfterSale: false,
      requireCustomer: false,
      defaultCustomer: 'Cliente',
      allowNegativeStock: false,
      currencySymbol: '$',
      usdRate: 36.00,
      receiptFooter: '¡Gracias por su compra!\nVuelva pronto'
    },
    branches: ['Principal', 'Sucursal Norte', 'Sucursal Sur']
  },

  jornada: { openedOnce: false, active: false, openedAt: null }
};

const isDesktop = () => !!(typeof window !== 'undefined' && window.posdesktop);

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
      // Persistencia en SQLite (no bloqueante)
      window.posdesktop.stateSave(data).catch(err => console.error('[state:save]', err));
    }
  },
  reset() {
    localStorage.removeItem(DB_KEY);
    if (isDesktop()) {
      // En escritorio también se limpia la fila en SQLite guardando el seed
      const fresh = JSON.parse(JSON.stringify(seedData));
      this.save(fresh);
      return fresh;
    }
    return this.load();
  }
};

const db = DB.load();
let session = { user: null, role: null };

/* Hidrata `db` desde SQLite (escritorio) reemplazando en su lugar el contenido.
   Se invoca antes de `boot()` para que toda la UI trabaje con datos reales. */
async function hydrateFromSource() {
  if (!isDesktop() || !window.posdesktop.stateLoad) return;
  try {
    const res = await window.posdesktop.stateLoad();
    if (res && res.ok && res.state && typeof res.state === 'object') {
      Object.keys(db).forEach(k => delete db[k]);
      Object.assign(db, res.state);
      console.info('[data] estado cargado desde SQLite');
    } else {
      // Primera ejecución en escritorio: persistir el seed (en blanco)
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

/* ---------- Fecha / hora local de Venezuela (UTC-4) ---------- */
const VE_TZ = 'America/Caracas';
function veParts(t) {
  t = t || new Date();
  try {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: VE_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const o = {};
    f.formatToParts(t).forEach(x => { if (x.type !== 'literal') o[x.type] = x.value; });
    return o;
  } catch (e) {
    const d = new Date(t);
    const p = (n) => String(n).padStart(2, '0');
    return { year: String(d.getFullYear()), month: p(d.getMonth() + 1), day: p(d.getDate()), hour: p(d.getHours()), minute: p(d.getMinutes()), second: p(d.getSeconds()) };
  }
}
function veDate(t) { const o = veParts(t); return o.year + '-' + o.month + '-' + o.day; }
function veTime(t) { const o = veParts(t); return o.hour + ':' + o.minute; }
function veStamp(t) { return veDate(t) + ' ' + veTime(t); }
/* Fecha/hora legible en Venezuela (para tickets/reportes). */
function veLong(t) {
  t = t || new Date();
  try { return new Intl.DateTimeFormat('es-VE', { timeZone: VE_TZ, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(t); }
  catch (e) { return veStamp(t); }
}
/* Devuelve un Date con la hora de Venezuela (para cálculos de vencimiento locales). */
function veNowDate() {
  const o = veParts();
  return new Date(o.year, o.month - 1, o.day, o.hour, o.minute, o.second);
}
