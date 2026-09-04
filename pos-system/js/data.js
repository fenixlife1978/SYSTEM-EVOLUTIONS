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

/* ============================================================
   Kardex — unidades jerárquicas de medida
   p.units = [ {name, rel}, ... ] de MAYOR a MENOR (atómica la última, rel=1)
   p.ej cigarrillos: [{Cartón,rel:10},{Cajetilla,rel:20},{Cigarrillo,rel:1}]
   El stock (p.stock) se lleva SIEMPRE en la unidad atómica (la menor).
   ============================================================ */
function chainUnits(p) {
  if (p && Array.isArray(p.units) && p.units.length) return p.units;
  const n = (p && (p.base || p.unit)) || 'UND';
  return [{ name: n, rel: 1 }];
}
function chainFacts(p) {
  // [{name, factor a atómico}...] mismo orden (mayor→menor)
  const u = chainUnits(p);
  const out = [];
  for (let i = 0; i < u.length; i++) {
    let f = 1;
    for (let j = i; j < u.length; j++) f *= Number(u[j].rel) || 1;
    out.push({ name: u[i].name, factor: f });
  }
  return out;
}
function atomicUnit(p) { const u = chainUnits(p); return u[u.length - 1].name; }
function factorOfUnitName(units, name) {
  if (!Array.isArray(units) || !units.length) return 1;
  for (let i = 0; i < units.length; i++) {
    if (units[i].name === name) { let f = 1; for (let j = i; j < units.length; j++) f *= Number(units[j].rel) || 1; return f; }
  }
  return 1;
}
function atomicFactorOf(p, name) {
  const f = chainFacts(p).find(x => x.name === name);
  return f ? f.factor : 1;
}
/* Descompone una cantidad atómica en unidades de la cadena (mayor→menor). */
function decomposeKardex(p, atomicQty) {
  const u = chainUnits(p);
  let rem = Number(atomicQty) || 0;
  const terms = [];
  for (let i = 0; i < u.length; i++) {
    let f = 1;
    for (let j = i; j < u.length; j++) f *= Number(u[j].rel) || 1;
    const whole = Math.floor(rem / f);
    if (whole !== 0) terms.push(whole + ' ' + u[i].name);
    rem = rem - whole * f;
  }
  return terms.length ? terms.join(' + ') : ('0 ' + atomicUnit(p));
}
