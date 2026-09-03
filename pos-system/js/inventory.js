/* ============================================================
   inventory.js — Fase 1: Modelo de inventario y motor central
   ------------------------------------------------------------
   CONCEPTO
   Cada producto tiene UN SOLO stock, expresado en una UNIDAD BASE
   canónica (la "unidad contenida"/atómica). Todas las demás
   presentaciones son CONVERSIONES de esa unidad.

     PRODUCTO
       ├ invBasePres : presentación maestra que define el stock
       │    { unidad, contenido, precio }   (precio por `contenido` unidades base)
       ├ invBaseUnit : unidad canónica (atómica) del stock
       ├ invPres[]   : formas de venta (conversiones)
       │    { id, unidad, equiv, precio, tipo(MANUAL|AUTO), activa }
       └ stockBase   : stock SIEMPRE en unidades canónicas

   EJEMPLO  Cerveza Polar Light
     invBasePres = { unidad:'Caja', contenido:36, precio:22.99 }
     invBaseUnit = 'Botella'
     stockBase   = 1224            (34 cajas × 36)
     invPres     = Caja(eq36,$22.99 MAN) · Botella(eq1,$0.65 MAN)

     Se venden 20 botellas => stockBase 1204 => "33 Cajas + 16 Botellas"

   PRECIO AUTOMÁTICO = (invBasePres.precio / invBasePres.contenido) × equiv
     Ej. base Kg $4.30 = 1000 g  →  500 g auto = 4.30/1000×500 = $2.15
   ============================================================ */

/* ---------- Catálogo de unidades configurables ---------- */
const INV_TYPES = [
  { k: 'count',   lbl: 'Entero / unidades' },
  { k: 'weight',  lbl: 'Peso' },
  { k: 'volume',  lbl: 'Volumen' },
  { k: 'length',  lbl: 'Longitud' },
  { k: 'unit',    lbl: 'Unidad simple' }
];

/* Catálogo por defecto de unidades (gestionable por el administrador). */
const UNITS_DEFAULT = [
  { id: 1,  name: 'Unidad',       symbol: 'und',   type: 'unit' },
  { id: 2,  name: 'Caja',         symbol: 'caja',  type: 'count' },
  { id: 3,  name: 'Paquete',      symbol: 'pqte',  type: 'count' },
  { id: 4,  name: 'Bulto',        symbol: 'bulto', type: 'count' },
  { id: 5,  name: 'Saco',         symbol: 'saco',  type: 'count' },
  { id: 6,  name: 'Envase',       symbol: 'env',   type: 'count' },
  { id: 7,  name: 'Botella',      symbol: 'bot',   type: 'count' },
  { id: 8,  name: 'Lata',         symbol: 'lata',  type: 'count' },
  { id: 9,  name: 'Six Pack',     symbol: 'six',   type: 'count' },
  { id: 10, name: 'Docena',       symbol: 'doc',   type: 'count' },
  { id: 11, name: 'Cartón',       symbol: 'cart',  type: 'count' },
  { id: 12, name: 'Cajetilla',    symbol: 'cajeta',type: 'count' },
  { id: 13, name: 'Par',          symbol: 'par',   type: 'count' },
  { id: 14, name: 'Rollo',        symbol: 'rollo', type: 'count' },
  { id: 15, name: 'Kilogramo',    symbol: 'kg',    type: 'weight' },
  { id: 16, name: 'Gramo',        symbol: 'g',     type: 'weight' },
  { id: 17, name: 'Litro',        symbol: 'l',     type: 'volume' },
  { id: 18, name: 'Mililitro',    symbol: 'ml',    type: 'volume' },
  { id: 19, name: 'Metro',        symbol: 'm',     type: 'length' },
  { id: 20, name: 'Centímetro',   symbol: 'cm',    type: 'length' }
];

/* Asegura que el catálogo db.units exista en el estado. */
function ensureUnitsCatalog() {
  if (!db.units || !Array.isArray(db.units)) db.units = JSON.parse(JSON.stringify(UNITS_DEFAULT));
  return db.units;
}

/* Lista de unidades (asegurando el catálogo). */
function unitList() { return ensureUnitsCatalog(); }
function unitById(id) { return unitList().find(u => String(u.id) === String(id)) || null; }
function unitByName(name) { return unitList().find(u => u.name.toLowerCase() === String(name).toLowerCase()) || null; }
function unitTypeLabel(k) { const t = INV_TYPES.find(x => x.k === k); return t ? t.lbl : k; }

function unitCreate(data) {
  const list = unitList();
  const name = String(data.name || '').trim();
  if (!name) throw new Error('El nombre de la unidad es obligatorio');
  if (list.find(u => u.name.toLowerCase() === name.toLowerCase())) throw new Error('Ya existe una unidad con ese nombre');
  const maxId = list.reduce((m, u) => Math.max(m, Number(u.id) || 0), 0);
  const u = { id: maxId + 1, name, symbol: String(data.symbol || '').trim() || name, type: data.type || 'unit' };
  list.push(u);
  DB.save(db);
  return u;
}

function unitUpdate(id, data) {
  const list = unitList();
  const u = unitById(id);
  if (!u) throw new Error('Unidad no encontrada');
  const name = String(data.name || '').trim();
  if (!name) throw new Error('El nombre de la unidad es obligatorio');
  const clash = list.find(x => x.id !== u.id && x.name.toLowerCase() === name.toLowerCase());
  if (clash) throw new Error('Ya existe una unidad con ese nombre');
  u.name = name;
  if (data.symbol !== undefined) u.symbol = String(data.symbol || '').trim();
  if (data.type !== undefined) u.type = data.type;
  DB.save(db);
  return u;
}

/* No se puede eliminar una unidad en uso por productos o presentaciones. */
function unitInUse(name) {
  ensureUnitsCatalog();
  const n = String(name).toLowerCase();
  return (db.products || []).some(p =>
    String(p.invBaseUnit || '').toLowerCase() === n ||
    String(p.invBasePres && p.invBasePres.unidad || '').toLowerCase() === n ||
    (p.invPres || []).some(x => String(x.unidad || '').toLowerCase() === n)
  );
}

function unitRemove(id) {
  const u = unitById(id);
  if (!u) throw new Error('Unidad no encontrada');
  if (unitInUse(u.name)) throw new Error('No se puede eliminar: la unidad está en uso por productos');
  db.units = db.units.filter(x => x.id !== u.id);
  DB.save(db);
  return true;
}

/* ---------- Helpers de producto / motor de presentaciones ---------- */

/* Esqueleto de un producto nuevo bajo el modelo canónico. */
function newProductShell() {
  return {
    id: null, code: '', name: '', category: '',
    invBasePres: { unidad: 'Unidad', contenido: 1, precio: 0 },
    invBaseUnit: 'Unidad',
    invPres: [],                 // siempre incluir la venta de la unidad base
    stockBase: 0, stockMinimo: 0, stockMaximo: 0,
    taxed: true, activo: true
  };
}

/* Presentación maestra (define el stock). */
function invBasePres(p) { return (p && p.invBasePres) || { unidad: 'Unidad', contenido: 1, precio: 0 }; }

/* Unidad canónica del stock. */
function invBaseUnit(p) { return (p && p.invBaseUnit) || 'Unidad'; }

/* Stock SIEMPRE en unidades canónicas. */
function invStock(p) { return Number((p && p.stockBase) || 0); }

/* Presentaciones de venta normalizadas (garantiza activas con precio resuelto). */
function invPreset(p) {
  const base = invBasePres(p);
  const arr = [];
  if (base && Number(base.contenido || 0) > 0) {
    arr.push({ id: 0, unidad: base.unidad || 'Unidad', equiv: Number(base.contenido) || 1, precio: Number(base.precio) || 0, tipo: 'MANUAL', activa: true, base: true });
  }
  (p && Array.isArray(p.invPres) ? p.invPres : []).forEach((x, i) => {
    const eq = Number(x.equiv); if (!(eq > 0)) return;
    const isBase = String(x.unidad).toLowerCase() === String(base.unidad || '').toLowerCase();
    arr.push({ id: isBase ? 0 : (x.id || (i + 1)), unidad: x.unidad, equiv: eq, precio: Number(x.precio) || 0, tipo: (x.tipo || 'MANUAL').toUpperCase(), activa: x.activa !== false, base: !!isBase });
  });
  return arr;
}

/* Convierte cantidad de una presentación a unidades canónicas. */
function toBase(p, equiv, qty) { return (Number(qty) || 0) * (Number(equiv) || 1); }

/* Precio por presentación: manual o automático relativo a la presentación maestra. */
function resolvePrice(p, pres) {
  const base = invBasePres(p);
  if (!pres) return 0;
  if (String(pres.tipo || 'MANUAL').toUpperCase() === 'AUTO') {
    const pc = Number(base.contenido) || 1;
    const priceBase = Number(base.precio) || 0;
    return (priceBase / pc) * (Number(pres.equiv) || 0);
  }
  return Number(pres.precio) || 0;
}

/* Devuelve la presentación de venta dada por nombre (si existe). */
function invPresByName(p, name) {
  const n = String(name).toLowerCase();
  return invPreset(p).find(x => String(x.unidad || '').toLowerCase() === n) || null;
}

/* Descompone stock canónico en "N PresentaciónMaestra + resto canónico". */
function invBreakdown(p, stockBase) {
  const base = invBasePres(p);
  const can = invBaseUnit(p);
  let rem = Number(stockBase) || 0;
  const terms = [];
  const contenido = Number(base.contenido) || 1;
  if (contenido > 1) {
    const whole = Math.floor(rem / contenido);
    if (whole !== 0) terms.push(whole + ' ' + base.unidad);
    rem = rem - whole * contenido;
  }
  if (rem !== 0 || terms.length === 0) terms.push(fmtNumberStock(rem) + ' ' + can);
  return terms.join(' + ');
}
function invString(p) { return invBreakdown(p, invStock(p)); }

function fmtNumberStock(n) {
  const v = Number(n) || 0;
  if (Number.isInteger(v)) return String(v);
  return String(parseFloat(v.toFixed(3)));
}

/* Valida stock suficiente para vender qty de una presentación (canónico). */
function validateStock(p, equiv, qty) {
  const need = toBase(p, equiv, qty);
  const have = invStock(p);
  return {
    ok: need <= have + 1e-9,
    need, have,
    message: need > have + 1e-9
      ? ('Stock insuficiente. Disponible: ' + invString(p) + ' (' + fmtNumberStock(have) + ' ' + invBaseUnit(p) + '). Requerido: ' + fmtNumberStock(need) + ' ' + invBaseUnit(p))
      : ''
  };
}

/* Registrar un movimiento (+/-) en unidades canónicas sobre el stock del producto. */
function invMove(p, equiv, qty, dir) {
  const delta = toBase(p, equiv, qty) * (dir === -1 ? -1 : 1);
  p.stockBase = Math.max(0, invStock(p) + delta);
  return { delta, stock: p.stockBase };
}

/* ---------- Autocomprobación (consola) ---------- */
function invDemo() {
  console.log('===== FASE 1 · Motor de inventario =====');

  const polar = Object.assign(newProductShell(), {
    name: 'Cerveza Polar Light',
    invBasePres: { unidad: 'Caja', contenido: 36, precio: 22.99 },
    invBaseUnit: 'Botella',
    stockBase: 34 * 36,
    invPres: [
      { unidad: 'Botella', equiv: 1, precio: 0.65, tipo: 'MANUAL' },
      { unidad: 'Six Pack', equiv: 6, tipo: 'AUTO', precio: 0 }
    ]
  });
  console.log('[Polar] stock canónico:', invStock(polar), '=', invString(polar));
  // Venta de 20 botellas
  invMove(polar, 1, 20, -1);
  console.log('[Polar] -20 botellas =>', invString(polar), '| precio botella $' + resolvePrice(polar, invPresByName(polar, 'Botella')).toFixed(2));
  // Venta de 2 cajas
  invMove(polar, 36, 2, -1);
  console.log('[Polar] -2 cajas =>', invString(polar));
  // Six pack auto
  const six = invPresByName(polar, 'Six Pack');
  console.log('[Polar] Six Pack (auto) = $' + resolvePrice(polar, six).toFixed(2), '= 22.99/36×6');
  // Insuficiente
  console.log('[Polar] vender 40 cajas:', validateStock(polar, 36, 40).message);

  const queso = Object.assign(newProductShell(), {
    name: 'Queso',
    invBasePres: { unidad: 'Kilogramo', contenido: 1000, precio: 4.30 },
    invBaseUnit: 'Gramo',
    stockBase: 30000,
    invPres: [
      { unidad: 'Kilogramo', equiv: 1000, precio: 4.30, tipo: 'MANUAL' },
      { unidad: '500 g', equiv: 500, tipo: 'AUTO', precio: 0 },
      { unidad: '250 g', equiv: 250, tipo: 'AUTO', precio: 0 },
      { unidad: '100 g', equiv: 100, tipo: 'AUTO', precio: 0 }
    ]
  });
  console.log('[Queso] stock canónico:', invStock(queso), '=', invString(queso));
  invMove(queso, 2500, 1, -1); // 2.5 Kg
  console.log('[Queso] -2.5 Kg =>', invString(queso), '| 500g auto $' + resolvePrice(queso, invPresByName(queso, '500 g')).toFixed(2));
  console.log('===== FIN demo inventario =====');
}

ensureUnitsCatalog();
