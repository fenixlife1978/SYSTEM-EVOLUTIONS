/* ============================================================
   modules.js — Vistas de los módulos administrativos
   ============================================================ */

/* ============================================================
   COMPRAS (Entradas)
   ============================================================ */
function renderPurchases() {
  const html = `
    <div class="module-head">
      <h3>Compras (Entradas de mercancía)</h3>
      <div class="actions">
        <button class="btn primary" id="newPurchase">+ Nueva compra</button>
      </div>
    </div>

    <div class="grid cols-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-info"><div class="lbl">Compras del mes</div><div class="val">${fmt.money(db.purchases.reduce((s, p) => s + p.total, 0))}</div></div><div class="kpi-ico">${ico('purchases')}</div></div>
      <div class="kpi k-blue"><div class="kpi-info"><div class="lbl">Órdenes recibidas</div><div class="val">${db.purchases.filter(p => p.status === 'received').length}</div></div><div class="kpi-ico">${ico('check')}</div></div>
      <div class="kpi k-orange"><div class="kpi-info"><div class="lbl">Pendientes</div><div class="val">${db.purchases.filter(p => p.status === 'pending').length}</div></div><div class="kpi-ico">${ico('pending')}</div></div>
      <div class="kpi k-red"><div class="kpi-info"><div class="lbl">Total proveedores</div><div class="val">${db.suppliers.length}</div></div><div class="kpi-ico">${ico('suppliers')}</div></div>
    </div>

    <div class="dt">
      <div class="dt-toolbar">
        <h3>Listado de compras</h3>
        <div class="tools">
          <input class="search" id="purSearch" placeholder="Buscar por proveedor, factura..." />
          <select id="purStatus">
            <option value="">Todos los estados</option>
            <option value="received">Recibidas</option>
            <option value="pending">Pendientes</option>
          </select>
        </div>
      </div>
      <div class="dt-wrap">
        <table class="dt">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Factura</th>
              <th class="num">Items</th>
              <th class="num">Total</th>
              <th>Pago</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="purTbody"></tbody>
        </table>
      </div>
    </div>
  `;
  $('#dashContent').innerHTML = html;
  paintPurchases();
  $('#purSearch').addEventListener('input', paintPurchases);
  $('#purStatus').addEventListener('change', paintPurchases);
  $('#newPurchase').addEventListener('click', purchaseForm);
}

function paintPurchases() {
  const q = ($('#purSearch')?.value || '').toLowerCase();
  const st = $('#purStatus')?.value || '';
  const list = db.purchases.filter(p => {
    if (st && p.status !== st) return false;
    if (q && !p.supplier.toLowerCase().includes(q) && !p.invoice.toLowerCase().includes(q)) return false;
    return true;
  });
  const tb = $('#purTbody');
  if (!tb) return;
  if (list.length === 0) { tb.innerHTML = `<tr><td colspan="8" class="empty">Sin resultados</td></tr>`; return; }
  tb.innerHTML = list.map(p => `
    <tr>
      <td>${fmt.date(p.date)}</td>
      <td>${p.supplier}</td>
      <td><code>${p.invoice}</code></td>
      <td class="num">${p.items}</td>
      <td class="num">${fmt.money(p.total)}</td>
      <td>${p.payment === 'cash' ? '<span class="pill green">Contado</span>' : '<span class="pill yellow">Crédito</span>'}</td>
      <td>${statusPill(p.status)}</td>
      <td class="actions-cell">
        <button class="btn sm" data-view="${p.id}">Ver</button>
        <button class="btn sm danger" data-del="${p.id}">Anular</button>
      </td>
    </tr>
  `).join('');
  $$('button[data-del]', tb).forEach(b => b.addEventListener('click', () => {
    if (!confirm('¿Anular esta compra?')) return;
    db.purchases = db.purchases.filter(x => x.id !== +b.dataset.del);
    DB.save(db); paintPurchases(); toast('Compra anulada', 'warn');
  }));
  $$('button[data-view]', tb).forEach(b => b.addEventListener('click', () => {
    const p = db.purchases.find(x => x.id === +b.dataset.view);
    openModal({ title: `Compra ${p.invoice}`, body: `
      <div class="grid cols-2">
        <div><b>Fecha:</b> ${fmt.date(p.date)}</div>
        <div><b>Proveedor:</b> ${p.supplier}</div>
        <div><b>Factura:</b> ${p.invoice}</div>
        <div><b>Items:</b> ${p.items}</div>
        <div><b>Total:</b> ${fmt.money(p.total)}</div>
        <div><b>Forma de pago:</b> ${p.payment === 'cash' ? 'Contado' : 'Crédito'}</div>
        <div><b>Estado:</b> ${statusPill(p.status)}</div>
      </div>
    `, footer: `<button class="btn primary" onclick="closeModal()">Cerrar</button>` });
  }));
}

function purchaseForm() {
  const buyOpts = (p) => {
    if (!p) return [];
    canonicalizeProduct(p);
    return invSaleViews(p).map(v => ({ key: v.unidad, entry: v.unidad, factor: v.equiv, precio: v.precio }));
  };
  const html = `
    <div class="form-grid">
      <div class="field"><label>Fecha</label><input type="date" id="pfDate" value="${new Date().toISOString().slice(0,10)}" /></div>
      <div class="field"><label>Proveedor</label>
        <select id="pfSupplier">${db.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select>
      </div>
      <div class="field"><label>N° Factura proveedor</label><input id="pfInvoice" placeholder="P-2025-..." /></div>
      <div class="field"><label>Forma de pago</label>
        <select id="pfPay"><option value="credit">Crédito (CxP)</option><option value="cash">Contado</option></select>
      </div>
    </div>
    <div class="card-title" style="margin-top:8px">Detalle de productos (entrada al inventario)</div>
    <table class="dt" id="pfItems">
      <thead><tr><th>Código</th><th>Descripción</th><th class="num">Cant. entrada</th><th>Unidad de entrada</th><th class="num">Entra al stock</th><th class="num">Costo/base</th><th class="num">Subtotal</th><th></th></tr></thead>
      <tbody id="pfBody"></tbody>
    </table>
    <div style="display:flex;gap:8px;align-items:center;margin-top:10px;padding:10px;border:1px dashed #cbd5e1;border-radius:8px;flex-wrap:wrap">
      <select id="pfProd" style="flex:1 1 260px">${db.products.map(p => `<option value="${p.id}">${p.code} — ${p.name}</option>`).join('')}</select>
      <select id="pfUnit" style="flex:1 1 240px"></select>
      <input id="pfQty" type="number" step="0.001" min="0" value="1" style="width:110px" title="Cantidad de entrada" />
      <input id="pfCost" type="number" step="0.0001" min="0" value="0" style="width:120px" title="Costo por unidad base (USD)" />
      <button class="btn primary" id="pfAdd">+ Agregar</button>
    </div>
    <div style="font-size:11px;color:#6b7280;margin-top:4px" id="pfHint"></div>
    <div style="display:flex;justify-content:space-between;margin-top:14px;padding:10px;background:#f0fdf4;border-radius:6px">
      <b>Total</b><b id="pfTotal" style="font-size:18px;color:var(--green)">${fmt.money(0)}</b>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="pfSave">Registrar compra</button>`;
  openModal({ title: 'Nueva compra', body: html, footer, size: 'modal-lg' });
  const state = { items: [] };
  const num = (s) => parseFloat(String(s).trim().replace(',', '.')) || 0;
  const curProd = () => db.products.find(x => x.id === +$('#pfProd').value);
  const optsOf = () => buyOpts(curProd());
  const selOpt = () => { const s = $('#pfUnit'); const o = optsOf()[s.selectedIndex]; return o || optsOf()[0]; };

  const fillUnit = () => {
    const opts = optsOf();
    const s = $('#pfUnit');
    const prev = s.value;
    s.innerHTML = opts.map((o, i) => `<option value="${i}">${o.entry}${o.factor !== 1 ? '  (1 = ' + o.factor + ' ' + invBaseUnit(curProd()) + ')' : ''}</option>`).join('');
    let idx = 0;
    if (opts.length > 1) {
      let best = 0;
      for (let i = 1; i < opts.length; i++) if (opts[i].factor > opts[best].factor) best = i;
      idx = best; // default a la presentación mayor (caja/pack)
    }
    if (prev !== '' && +prev < opts.length) idx = +prev;
    s.selectedIndex = idx;
    const p = curProd();
    $('#pfCost').value = p ? ((p.cost && p.cost > 0 ? p.cost : invUnitPrice(p) * 0.7) || 0).toFixed(4) : 0;
    hint();
  };
  const hint = () => {
    const o = selOpt();
    const q = num($('#pfQty').value);
    const p = curProd();
    const base = p ? invBaseUnit(p) : '';
    const es = (o ? q * o.factor : 0);
    $('#pfHint').textContent = (p ? (p.name + ' · ') : '') + (o ? o.entry : '') + ' × ' + q + ' = ' + fmtNum(es) + ' ' + base + ' al stock (unidad canónica) · costo/unidad $' + fmtNum($('#pfCost').value);
  };
  const fmtNum = (v) => (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  const recalc = () => { const tot = state.items.reduce((s, i) => s + (i.baseQty * i.costBase), 0); $('#pfTotal').textContent = fmt.money(tot); };
  const repaint = () => {
    const tb = $('#pfBody');
    const baseL = state.items.length ? (state.items[0].base || '') : '';
    if (state.items.length === 0) tb.innerHTML = `<tr><td colspan="8" class="empty">Sin productos</td></tr>`;
    else tb.innerHTML = state.items.map((i, idx) => `
      <tr>
        <td><code>${i.code}</code></td>
        <td>${i.name}</td>
        <td class="num">${fmtNum(i.qty)}</td>
        <td>${i.entry}</td>
        <td class="num">${fmtNum(i.baseQty)} ${i.base || ''}</td>
        <td class="num">${fmtNum(i.costBase)}</td>
        <td class="num">${fmt.money(i.baseQty * i.costBase)}</td>
        <td><button class="btn sm danger" data-rm="${idx}">${ico('close')}</button></td>
      </tr>`).join('');
    $$('button[data-rm]', tb).forEach(b => b.addEventListener('click', () => { state.items.splice(+b.dataset.rm, 1); repaint(); recalc(); }));
    recalc();
  };
  $('#pfQty').addEventListener('input', hint);
  $('#pfCost').addEventListener('input', hint);
  $('#pfProd').addEventListener('change', fillUnit);
  $('#pfUnit').addEventListener('change', hint);
  fillUnit(); repaint();
  $('#pfAdd').addEventListener('click', () => {
    const p = curProd();
    const o = selOpt();
    const q = num($('#pfQty').value);
    const cb = num($('#pfCost').value);
    if (!p || q <= 0) { toast('Indique una cantidad mayor que cero', 'warn'); return; }
    if (!o) { toast('Unidad de entrada inválida', 'warn'); return; }
    state.items.push({
      pid: p.id, code: p.code, name: p.name,
      base: invBaseUnit(p),
      entry: o.entry, factor: o.factor, qty: q, baseQty: q * o.factor, costBase: cb
    });
    repaint();
    const bName = invBaseUnit(p);
    toast(`Añadido: ${fmtNum(q)} ${o.entry} → ${fmtNum(q * o.factor)} ${bName} (unidad canónica)`, 'info');
    $('#pfQty').value = 1;
    hint();
  });
  $('#pfSave').addEventListener('click', () => {
    if (state.items.length === 0) { toast('Agregue al menos un producto', 'warn'); return; }
    const sup = db.suppliers.find(s => s.id === +$('#pfSupplier').value);
    if (!sup) { toast('Seleccione el proveedor', 'warn'); return; }
    // Sumar stock por producto (en unidad base)
    const acc = {};
    state.items.forEach(i => { acc[i.pid] = (acc[i.pid] || 0) + i.baseQty; });
    Object.keys(acc).forEach(pid => { const pr = db.products.find(x => x.id === +pid); if (pr) { canonicalizeProduct(pr); pr.stockBase = (invStock(pr) || 0) + acc[pid]; } });
    const total = state.items.reduce((s, i) => s + (i.baseQty * i.costBase), 0);
    const purchase = {
      id: db.purchases.length + 1,
      date: $('#pfDate').value,
      supplier: sup.name,
      invoice: $('#pfInvoice').value || 'P-' + Date.now(),
      items: state.items.length,
      total,
      status: 'received',
      payment: $('#pfPay').value,
      detail: state.items.map(i => ({ code: i.code, name: i.name, entry: i.entry, qty: i.qty, baseQty: i.baseQty, cost: i.costBase }))
    };
    db.purchases.unshift(purchase);
    // Egreso contable
    db.accounting.unshift({
      id: db.accounting.length + 1,
      date: purchase.date,
      type: 'egreso', category: 'Compras',
      description: `Compra a ${sup.name} (${purchase.invoice})`,
      amount: total, ref: 'COMP-' + purchase.invoice
    });
    // Si es crédito, generar CxP
    if (purchase.payment === 'credit') {
      const due = new Date(purchase.date); due.setDate(due.getDate() + 30);
      db.payables.unshift({
        id: db.payables.length + 1,
        date: purchase.date,
        supplier: sup.name,
        docType: 'FAC', docNumber: purchase.invoice,
        total, paid: 0, balance: total,
        dueDate: due.toISOString().slice(0, 10),
        status: 'pending'
      });
      sup.balance = (sup.balance || 0) + total;
    }
    DB.save(db); closeModal(); renderPurchases();
    toast(`Compra registrada: ${fmt.money(total)}`, 'success');
  });
}

/* ============================================================
   INVENTARIO
   ============================================================ */
function renderInventory() {
  const list = db.products.map(p => { canonicalizeProduct(p); return p; });
  const totalProducts = list.length;
  const totalStock = list.reduce((s, p) => s + invStock(p), 0);
  const totalValue = list.reduce((s, p) => s + invBaseWhole(p) * invDefaultPrice(p), 0);
  const lowStock = list.filter(p => invStock(p) < Math.max(1, Number(p.stockMinimo) || 0)).length;
  const cats = [...new Set(db.products.map(p => p.category))];
  const html = `
    <div class="module-head">
      <h3>Inventario</h3>
      <div class="actions">
        <button class="btn" id="invKardex">${ico('units')} Kardex</button>
        <button class="btn primary" id="newProduct">+ Nuevo producto</button>
        <button class="btn" id="exportInv">Exportar</button>
      </div>
    </div>
    <div class="grid cols-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-info"><div class="lbl">Total productos</div><div class="val">${totalProducts}</div></div><div class="kpi-ico">${ico('purchases')}</div></div>
      <div class="kpi k-blue"><div class="kpi-info"><div class="lbl">Unidades en stock</div><div class="val">${totalStock.toFixed(0)}</div></div><div class="kpi-ico">${ico('units')}</div></div>
      <div class="kpi k-orange"><div class="kpi-info"><div class="lbl">Valor del inventario</div><div class="val">${fmt.money(totalValue)}</div></div><div class="kpi-ico">${ico('value')}</div></div>
      <div class="kpi k-red"><div class="kpi-info"><div class="lbl">Stock bajo</div><div class="val">${lowStock}</div></div><div class="kpi-ico">${ico('warn')}</div></div>
    </div>

    <div class="dt">
      <div class="dt-toolbar">
        <h3>Productos</h3>
        <div class="tools">
          <input class="search" id="invSearch" placeholder="Buscar por código, nombre..." />
          <select id="invCat"><option value="">Todas las categorías</option>${cats.map(c => `<option>${c}</option>`).join('')}</select>
        </div>
      </div>
      <div class="dt-wrap">
        <table class="dt">
          <thead>
            <tr>
              <th>Código</th><th>Descripción</th><th>Categoría</th><th>U. Base</th>
              <th class="num">Stock</th><th class="num">Precio</th><th class="num">Valor</th><th></th>
            </tr>
          </thead>
          <tbody id="invTbody"></tbody>
        </table>
      </div>
    </div>
  `;
  $('#dashContent').innerHTML = html;
  paintInventory();
  $('#invSearch').addEventListener('input', paintInventory);
  $('#invCat').addEventListener('change', paintInventory);
  $('#newProduct').addEventListener('click', () => productForm());
  $('#invKardex').addEventListener('click', inventoryKardex);
  $('#exportInv').addEventListener('click', () => {
    const esc = (s) => String(s == null ? '' : s).replace(/"/g, '""');
    const csv = 'Codigo,Descripcion,Categoria,UnidadCanonica,StockCanonico,StockDescompuesto,PrecioBase,ValorBase\n' +
      list.map(p => `${p.code},"${esc(p.name)}",${p.category},${invBaseUnit(p)},${invStock(p)},"${esc(invString(p))}",${invDefaultPrice(p)},${(invBaseWhole(p) * invDefaultPrice(p)).toFixed(6)}`).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'inventario.csv'; a.click();
    toast('Inventario exportado', 'success');
  });
}

function paintInventory() {
  const q = ($('#invSearch')?.value || '').toLowerCase();
  const c = $('#invCat')?.value || '';
  const list = db.products.filter(p => {
    if (c && p.category !== c) return false;
    if (q && !p.code.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false;
    return true;
  });
  const tb = $('#invTbody');
  if (!tb) return;
  if (list.length === 0) { tb.innerHTML = `<tr><td colspan="8" class="empty">Sin resultados</td></tr>`; return; }
  tb.innerHTML = list.map(p => `
    <tr>
      <td><code>${p.code}</code></td>
      <td>${p.name}</td>
      <td>${p.category}</td>
      <td title="${invBaseUnit(p)} (unidad canónica)">${unitAbbrPlural(invBasePres(p).unidad)}${p.weighed ? ' (peso)' : ''}</td>
      <td class="num" title="${fmtNumK(invStock(p))} ${invBaseUnit(p)}">${invBreakdown(p, invStock(p))}</td>
      <td class="num" title="Precio de la presentación base (${invBasePres(p).unidad})">${fmt.moneyDyn(invDefaultPrice(p))}</td>
      <td class="num" title="Valor = ${fmtNumK(invBaseWhole(p))} ${invBasePres(p).unidad} × precio base">${fmt.money(invBaseWhole(p) * invDefaultPrice(p))}</td>
      <td class="actions-cell">
        <button class="btn sm" data-edit="${p.id}">Editar</button>
        <button class="btn sm danger" data-del="${p.id}">${ico('close')}</button>
      </td>
    </tr>
  `).join('');
  $$('button[data-edit]', tb).forEach(b => b.addEventListener('click', () => productForm(+b.dataset.edit)));
  $$('button[data-del]', tb).forEach(b => b.addEventListener('click', () => {
    if (!confirm('¿Eliminar este producto?')) return;
    db.products = db.products.filter(x => x.id !== +b.dataset.del);
    DB.save(db); paintInventory(); toast('Producto eliminado', 'warn');
  }));
}

const fmtNumK = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
const baseLblK = (b) => { const m = (BASE_UNITS.find(x => x[0] === b)) || (PRODUCT_PRESENT.find(x => x[0] === b)); return m ? m[1] : (b || ''); };

/* Búsqueda inteligente de producto para abrir su tarjeta Kardex */
function inventoryKardex() {
  const html = `
    <div class="field"><label>Buscar producto (código, nombre…)</label>
      <input id="kxSearch" placeholder="Ej: 030003, cerveza, queso..." autofocus />
    </div>
    <div id="kxResults" style="max-height:340px;overflow:auto"></div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cerrar</button>`;
  openModal({ title: 'Tarjeta Kardex — buscar producto', body: html, footer, size: 'modal-lg' });
  setTimeout(() => {
    const inp = $('#kxSearch'); inp.focus();
    const render = () => {
      const q = (inp.value || '').toLowerCase().trim();
      const list = db.products.filter(p => !q || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 60);
      $('#kxResults').innerHTML = list.length === 0
        ? '<div class="dt empty">Sin resultados</div>'
        : `<table class="dt" style="width:100%"><thead><tr><th>Código</th><th>Producto</th><th>Cat.</th><th class="num">Stock</th><th></th></tr></thead><tbody>
             ${list.map(p => { canonicalizeProduct(p); return `<tr><td><code>${p.code}</code></td><td>${p.name}</td><td>${p.category}</td><td class="num">${invBreakdown(p, invStock(p))}</td><td><button class="btn sm primary" data-kx="${p.id}">Ver Kardex</button></td></tr>`; }).join('')}
           </tbody></table>`;
      $$('#kxResults button[data-kx]').forEach(b => b.addEventListener('click', () => { closeModal(); showKardex(+b.dataset.kx); }));
    };
    inp.addEventListener('input', render);
    render();
  }, 60);
}

/* Tarjeta Kardex de un producto: entradas (compras) vs salidas (ventas) y saldo */
function showKardex(pid) {
  const p = db.products.find(x => x.id === pid);
  if (!p) { toast('Producto no encontrado', 'error'); return; }
  canonicalizeProduct(p);
  const canonU = invBaseUnit(p);
  const mov = [];
  // Entradas por compra (baseQty ya en unidad canónica)
  db.purchases.forEach(pu => {
    (Array.isArray(pu.detail) ? pu.detail : []).forEach(d => {
      if (d.code === p.code && d.baseQty > 0) mov.push({ date: pu.date, ref: 'Compra ' + (pu.invoice || pu.date), kind: 'E', qty: d.baseQty });
    });
  });
  // Salidas por venta (baseUnits ya en unidad canónica)
  db.sales.forEach(s => {
    (Array.isArray(s.lines) ? s.lines : []).forEach(l => {
      if (l.pid === p.id && (l.baseUnits || 0) > 0) mov.push({ date: s.date, ref: 'Venta ' + s.number + (s.status === 'refunded' ? ' (reemb.)' : ''), kind: 'S', qty: l.baseUnits });
    });
  });
  let sumE = 0, sumS = 0;
  mov.forEach(m => { if (m.kind === 'E') sumE += m.qty; else sumS += m.qty; });
  const opening = Math.max(0, (invStock(p) - (sumE - sumS)));
  mov.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const rows = [{ date: '', ref: 'Saldo inicial (existencia)', ent: opening, sal: 0, run: opening }];
  let run = opening;
  mov.forEach(m => { run += (m.kind === 'E' ? m.qty : -m.qty); rows.push({ date: m.date, ref: m.ref, ent: m.kind === 'E' ? m.qty : 0, sal: m.kind === 'S' ? m.qty : 0, run }); });
  const disp = (v) => invBreakdown(p, v);
  const body = rows.map((r, i) => `
    <tr style="${i === 0 ? 'background:#eef2ff;font-weight:600' : ''}">
      <td>${r.date || '—'}</td>
      <td>${r.ref}</td>
      <td class="num">${r.ent ? fmtNumK(r.ent) : ''}</td>
      <td class="num">${r.sal ? fmtNumK(r.sal) : ''}</td>
      <td class="num"><b>${disp(r.run)}</b><small style="display:block;color:#6b7280;font-weight:400">= ${fmtNumK(r.run)} ${canonU}</small></td>
    </tr>`).join('');
  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;background:#f8fafc;border:1px solid #e2e6ec;border-radius:8px;padding:10px 12px;margin-bottom:10px">
      <div>
        <div style="font-weight:800;color:#1f2937">${p.name}</div>
        <div style="font-size:12px;color:#6b7280">${p.code} · ${p.category} · <b>${canonU}</b>${p.weighed ? ' · por peso' : ''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#6b7280">Existencias actuales</div>
        <div style="font-size:18px;font-weight:800;color:#15803d;font-family:Consolas,monospace">${disp(invStock(p))}</div>
        <div style="font-size:11px;color:#6b7280">= ${fmtNumK(invStock(p))} ${canonU}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px">
      <div style="border:1px solid #e2e6ec;border-radius:8px;padding:8px;text-align:center"><div style="font-size:11px;color:#6b7280">Entradas</div><b style="color:#166534">${fmtNumK(sumE)} ${canonU}</b></div>
      <div style="border:1px solid #e2e6ec;border-radius:8px;padding:8px;text-align:center"><div style="font-size:11px;color:#6b7280">Salidas</div><b style="color:#b91c1c">${fmtNumK(sumS)} ${canonU}</b></div>
      <div style="border:1px solid #e2e6ec;border-radius:8px;padding:8px;text-align:center"><div style="font-size:11px;color:#6b7280">Costo unitario</div><b>${fmt.money(p.cost || 0)}</b></div>
      <div style="border:1px solid #e2e6ec;border-radius:8px;padding:8px;text-align:center"><div style="font-size:11px;color:#6b7280">Precio unitario</div><b>${fmt.moneyDyn(invUnitPrice(p))}</b></div>
    </div>
    <div style="max-height:320px;overflow:auto;border:1px solid #e2e6ec;border-radius:8px">
      <table class="dt" style="width:100%;margin:0">
        <thead><tr><th>Fecha</th><th>Movimiento</th><th class="num">Entrada</th><th class="num">Salida</th><th class="num">Saldo</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div style="font-size:11px;color:#6b7280;margin-top:6px">Todos los movimientos y el saldo se expresan en la <b>unidad canónica (${canonU})</b>; el saldo se descompone en presentaciones. La última fila = existencia actual.</div>
  `;
  const footer = `<button class="btn" onclick="closeModal();setTimeout(function(){inventoryKardex()},60)">Buscar otro</button>
                  <button class="btn primary" onclick="closeModal()">Listo</button>`;
  openModal({ title: 'Tarjeta Kardex — ' + p.name, body: html, footer, size: 'modal-lg' });
}

/* Presentaciones / unidades de venta del producto */
const PRODUCT_PRESENT = [
  ['UND', 'Unidad'], ['CAJA', 'Caja'], ['EMPAQUE', 'Empaque'], ['BOT', 'Botella'],
  ['LATA', 'Lata'], ['PAQ', 'Paquete'], ['BLISTER', 'Blíster'], ['DOC', 'Docena'],
  ['KG', 'Kilogramo'], ['GMS', 'Gramos'], ['ML', 'Mililitro'], ['LT', 'Litro'], ['GAL', 'Galón']
];
const PRESENT_LBL = (u) => { const m = PRODUCT_PRESENT.find(x => x[0] === u); return m ? m[1] : u; };

/* Unidades base del kardex (stock se lleva en esta unidad) */
const BASE_UNITS = [
  ['UND', 'Unidad (pieza)'], ['CAJA', 'Caja'], ['PAQ', 'Paquete'], ['EMPAQUE', 'Empaque'],
  ['KG', 'Kilogramo'], ['G', 'Gramos'], ['LT', 'Litro'], ['ML', 'Mililitro'], ['GAL', 'Galón']
];

function productFormLegacy(id) {
  const editing = typeof id === 'number' && !!db.products.find(x => x.id === id);
  const p = editing ? db.products.find(x => x.id === id)
    : { code: '', name: '', category: 'General', present: 'UND', unit: 'UND', base: 'UND', weighed: false, cost: 0, margin: 0, price: 0, stock: 0, taxed: true };
  const cats = [...new Set(db.products.map(x => x.category))];
  const isExempt = p.taxed === false;
  const pBase = BASE_UNITS.some(b => b[0] === p.base) ? p.base : (p.unit || 'UND');
  const html = `
    <div style="background:#eef6ff;border:1px solid #bcd7f5;border-radius:8px;padding:8px 12px;font-size:12px;color:#1e40af;margin-bottom:12px">
      <b>Código de barras:</b> acerque el <b>lector</b> (escribe el código y presiona Enter) o escríbalo manualmente.
    </div>
    <div class="form-grid">
      <div class="field span-2"><label>Código de barras</label>
        <input id="prCode" value="${p.code}" placeholder="Leer con escáner o escribir código" autofocus />
      </div>
      <div class="field span-2"><label>Nombre del producto</label><input id="prName" value="${p.name}" /></div>
      <div class="field"><label>Categoría</label>
        <input id="prCat" list="catList" value="${p.category}" />
        <datalist id="catList">${cats.map(c => `<option>${c}</option>`).join('')}</datalist>
      </div>
      <div class="field"><label>Presentación / venta</label>
        <select id="prPresent">${PRODUCT_PRESENT.map(([u, l]) => `<option value="${u}" ${p.unit === u ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Unidad base del stock (kardex)</label>
        <select id="prBase">${BASE_UNITS.map(([u, l]) => `<option value="${u}" ${pBase === u ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Costo en USD</label><input type="number" step="0.0001" min="0" id="prCost" value="${p.cost || 0}" /></div>
      <div class="field"><label>Margen de ganancia (%)</label><input type="number" step="0.01" min="0" id="prMargin" value="${p.margin || 0}" /></div>
      <div class="field"><label>Precio de venta USD (auto con margen)</label><input type="number" step="0.0001" min="0" id="prPrice" value="${p.price || 0}" /></div>
      <div class="field"><label>Stock</label><input type="number" step="0.001" min="0" id="prStock" value="${p.stock || 0}" /></div>
      <div class="field"><label>Régimen IVA</label>
        <select id="prTax">
          <option value="grabable" ${!isExempt ? 'selected' : ''}>Incluye IVA (gravado)</option>
          <option value="exento" ${isExempt ? 'selected' : ''}>Exento de IVA</option>
        </select>
      </div>
      <div class="field" style="justify-content:flex-end"><label>&nbsp;</label>
        <label style="font-weight:500"><input type="checkbox" id="prWeighed" ${p.weighed ? 'checked' : ''}/> Se vende por peso (balanza)</label>
      </div>
    </div>
    <div style="margin-bottom:10px;border:1px solid #e2e6ec;border-radius:8px;padding:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <b style="font-size:13px;color:#1f2937">Unidades del kardex (principal + secundarias)</b>
        <button type="button" class="btn sm" id="prAddSub">+ Añadir unidad más pequeña</button>
      </div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:6px">La primera es la <b>unidad principal</b> (ej. Caja) y cada una indica cuántas contiene de la <b>siguiente</b> (más pequeña). La última es la <b>atómica</b> (la menor, ej. Cigarrillo).</div>
      <div id="prUnitBox" style="display:flex;flex-direction:column;gap:6px"></div>
      <div style="font-size:11px;color:#6b7280;margin-top:6px" id="prUnitSummary"></div>
      <datalist id="prUList"></datalist>
    </div>
    <div style="margin-top:10px;border:1px solid #e2e6ec;border-radius:8px;padding:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <b style="font-size:13px;color:#1f2937">Presentaciones de venta — cada una elige CÓMO descuenta del kardex</b>
        <button type="button" class="btn sm" id="prAddPres">+ Agregar presentación</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 170px 70px 110px 28px;gap:6px;font-size:11px;color:#6b7280;margin-bottom:4px">
        <span>Presentación</span><span>Descontar del kardex en</span><span>Equivale a (n)</span><span>Precio USD</span><span></span>
      </div>
      <div id="prPresBox" style="display:flex;flex-direction:column;gap:6px"></div>
      <div style="font-size:11px;color:#6b7280;margin-top:6px">Cada presentación indica la <b>unidad del kardex</b> que se descuenta y a cuántas equivale. Ej. cigarrillos (base = Cigarrillo): "Cartón" → descuenta en Cartón ×1 (=200 Cigarrillos), "Cajetilla" → Cajetilla ×1 (=20). Al vender esa presentación el saldo del kardex se resta en la medida elegida.</div>
    </div>
    <p style="color:#6b7280;font-size:11px;margin-top:4px">Sugerencia de precio = Costo × (1 + Margen). El precio puede ajustarse manualmente. Si vende por peso/presentación, indique la presentación (Caja, Botella, Kg, ml, gms, etc.).</p>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="prSave">Guardar</button>`;
  openModal({ title: editing ? 'Editar producto' : 'Nuevo producto', body: html, footer, size: 'modal-lg' });
  setTimeout(() => {
    const autoPrice = () => {
      const c = parseFloat($('#prCost').value) || 0;
      const m = parseFloat($('#prMargin').value) || 0;
      $('#prPrice').value = (c * (1 + m / 100)).toFixed(4);
    };
    $('#prCost').addEventListener('input', autoPrice);
    $('#prMargin').addEventListener('input', autoPrice);
    const pres = () => { const w = $('#prPresent').value === 'KG' || $('#prPresent').value === 'GMS'; $('#prWeighed').checked = w || $('#prWeighed').checked; };
    $('#prPresent').addEventListener('change', pres);
    // Enter en el código (lector de barras) pasa a nombre
    $('#prCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#prName').focus(); } });
    // Cadena de unidades del kardex (principal → secundarias → atómica)
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    let UU = (Array.isArray(p.units) && p.units.length)
      ? p.units.map(u => ({ name: String(u.name || ''), rel: Number(u.rel) || 1 }))
      : (function () { const b = (p.base || p.unit || 'UND'); const L = (BASE_UNITS.find(x => x[0] === b)) || (PRODUCT_PRESENT.find(x => x[0] === b)); return [{ name: L ? L[1] : b, rel: 1 }]; })();
    if (!UU.length) UU = [{ name: '', rel: 1 }];
    const syncUList = () => {
      const dl = $('#prUList'); if (dl) dl.innerHTML = UU.map(u => `<option value="${esc(u.name)}"></option>`).join('');
      const s = $('#prUnitSummary'); if (s) s.textContent = 'Equivalencias → ' + UU.map((u, i) => (i < UU.length - 1 ? '1 ' + (u.name || '?') + ' = ' + u.rel + ' ' + (UU[i + 1].name || '?') : '1 ' + (u.name || '?') + ' (atómica)')).join('  ·  ');
    };
    const renderUnits = () => {
      const box = $('#prUnitBox'); if (!box) return;
      box.innerHTML = '';
      UU.forEach((u, i) => {
        const isLast = i === UU.length - 1;
        const row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:24px 1fr auto 120px auto 28px;gap:6px;align-items:center';
        row.innerHTML = isLast
          ? `<b>${i + 1}.</b><input class="uu-name" value="${esc(u.name)}" data-i="${i}" placeholder="Unidad atómica" />
             <span style="color:#15803d;font-size:11px;font-weight:600">ATÓMICA (la más pequeña)</span><span></span><span></span>
             <button class="btn sm danger uu-del" data-i="${i}" title="Quitar">&times;</button>`
          : `<b>${i + 1}.</b><input class="uu-name" value="${esc(u.name)}" data-i="${i}" placeholder="Unidad (ej. Caja)" />
             <span style="color:#6b7280;font-size:11px">contiene</span>
             <span style="display:flex;align-items:center;gap:2px">
               <button type="button" class="uu-dec" data-i="${i}">&minus;</button>
               <input class="uu-rel" type="number" min="1" step="1" value="${u.rel}" data-i="${i}" style="width:60px;text-align:center" />
               <button type="button" class="uu-inc" data-i="${i}">+</button>
             </span>
             <span style="color:#6b7280;font-size:11px">de ${esc(UU[i + 1].name || 'la siguiente')}</span>
             <button class="btn sm danger uu-del" data-i="${i}" title="Quitar">&times;</button>`;
        box.appendChild(row);
      });
      $$('#prUnitBox .uu-name').forEach(inp => inp.addEventListener('input', () => { UU[+inp.dataset.i].name = inp.value; syncUList(); }));
      $$('#prUnitBox .uu-rel').forEach(inp => inp.addEventListener('input', () => { UU[+inp.dataset.i].rel = Math.max(1, parseInt(inp.value) || 1); }));
      $$('#prUnitBox .uu-inc').forEach(b => b.addEventListener('click', () => { UU[+b.dataset.i].rel = (UU[+b.dataset.i].rel || 1) + 1; renderUnits(); syncUList(); }));
      $$('#prUnitBox .uu-dec').forEach(b => b.addEventListener('click', () => { UU[+b.dataset.i].rel = Math.max(1, (UU[+b.dataset.i].rel || 1) - 1); renderUnits(); syncUList(); }));
      $$('#prUnitBox .uu-del').forEach(b => b.addEventListener('click', () => { if (UU.length <= 1) return; UU.splice(+b.dataset.i, 1); renderUnits(); syncUList(); }));
      syncUList();
    };
    $('#prAddSub').addEventListener('click', () => { if (!UU[UU.length - 1].name) { toast('Nombre la unidad atómica actual primero', 'warn'); return; } UU.push({ name: '', rel: 1 }); renderUnits(); syncUList(); });
    const atomicN = () => UU.length ? (UU[UU.length - 1].name || 'Und') : 'Und';
    const factorU = (n) => factorOfUnitName(UU.map(u => ({ name: u.name, rel: u.rel })), n);

    // Editor de presentaciones: cada una elige la unidad del kardex en la que descuenta
    const presRows = Array.isArray(p.pres) ? p.pres : [];
    const addPresRow = (lbl, unit, qty, price) => {
      const box = $('#prPresBox');
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:1fr 170px 70px 110px 28px;gap:6px;align-items:center';
      row.innerHTML = `
        <input class="prp-lbl" placeholder="Presentación (ej. Caja x36, Cajetilla…)" />
        <input class="prp-unit" list="prUList" placeholder="Unidad del kardex" title="Descontar del kardex en" />
        <input class="prp-qty" type="number" step="0.0001" min="0" value="1" title="Equivale a (n) de esa unidad" />
        <input class="prp-price" type="number" step="0.0001" min="0" placeholder="Precio USD" />
        <button type="button" class="btn sm danger" title="Quitar">&times;</button>`;
      const lblIn = row.querySelector('.prp-lbl');
      const uIn = row.querySelector('.prp-unit');
      const qIn = row.querySelector('.prp-qty');
      const pIn = row.querySelector('.prp-price');
      lblIn.value = lbl || '';
      uIn.value = (unit && unit !== '') ? unit : atomicN();
      qIn.value = (qty != null && qty !== '') ? qty : 1;
      pIn.value = (price != null && price !== '') ? price : '';
      row.querySelector('button').addEventListener('click', () => row.remove());
      box.appendChild(row);
    };
    const initRows = presRows.length ? presRows : [{ lbl: '', unit: '', qty: 1, price: '' }];
    initRows.forEach(r => addPresRow(r.lbl, r.u || r.unit || '', (r.qty != null && r.qty !== '') ? r.qty : ((r.content != null && r.content !== undefined) ? r.content : 1), r.price));
    $('#prAddPres').addEventListener('click', () => addPresRow('', '', 1, ''));

    $('#prSave').addEventListener('click', () => {
      const unitsArr = UU.map(u => ({ name: (u.name || '').trim() || 'Und', rel: Math.max(1, Number(u.rel) || 1) }));
      const fU = (n) => factorOfUnitName(unitsArr, n);
      const prs = Array.from($$('#prPresBox .prp-lbl')).map((el) => {
        const row = el.closest('div');
        const uIn = row.querySelector('.prp-unit');
        const qIn = row.querySelector('.prp-qty');
        const pIn = row.querySelector('.prp-price');
        const unit = (uIn ? uIn.value : '').trim();
        const eq = parseFloat(qIn ? qIn.value : '') || 0;
        const content = eq * fU(unit);
        return { lbl: el.value.trim(), u: unit || 'Und', qty: eq, content, price: parseFloat(pIn ? pIn.value : '') || 0 };
      }).filter(x => x.lbl || x.price > 0);
      const base = $('#prBase').value;
      const atomicName = unitsArr.length ? unitsArr[unitsArr.length - 1].name : 'Und';
      const data = {
        code: $('#prCode').value.trim() || String(Date.now()),
        name: $('#prName').value.trim(),
        category: $('#prCat').value || 'General',
        present: PRESENT_LBL($('#prPresent').value),
        unit: $('#prPresent').value,
        base: base,
        atomic: atomicName,
        units: unitsArr,
        weighed: $('#prWeighed').checked || $('#prPresent').value === 'KG' || $('#prPresent').value === 'GMS' || base === 'KG' || base === 'G',
        cost: parseFloat($('#prCost').value) || 0,
        margin: parseFloat($('#prMargin').value) || 0,
        price: parseFloat($('#prPrice').value) || 0,
        stock: parseFloat($('#prStock').value) || 0,
        taxed: $('#prTax').value === 'grabable',
        pres: prs
      };
      if (!data.name) { toast('Ingrese el nombre del producto', 'warn'); return; }
      if (editing) { Object.assign(p, data); }
      else { db.products.push({ id: Date.now(), ...data }); }
      DB.save(db); closeModal(); renderDashboard('inventory'); toast('Producto guardado', 'success');
    });
    renderUnits();
  }, 60);
}

/* ============================================================
   PRODUCTO — formulario canónico (Fase 1)
   Fuente única de inventario: stockBase en invBaseUnit.
   ============================================================ */
function productForm(id) {
  const editing = typeof id === 'number' && !!db.products.find(x => x.id === id);
  const source = editing ? db.products.find(x => x.id === id) : null;
  const p = source ? canonicalizeProduct(JSON.parse(JSON.stringify(source))) : Object.assign(newProductShell(), { code: '', name: '', category: 'General', taxed: true });
  ensureUnitsCatalog();
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const uOpt = (sel) => unitList().map(u => `<option value="${esc(u.name)}" ${u.name === sel ? 'selected' : ''}>${esc(u.name)} (${esc(u.symbol)})</option>`).join('');
  // Entrada libre de números decimales (acepta coma o punto y se puede borrar hasta el último dígito)
  const pnum = (s) => { const t = String(s == null ? '' : s).trim().replace(/,/g, '.'); if (!t) return 0; const v = parseFloat(t); return isFinite(v) ? v : 0; };
  const fmtDec = (v) => { const x = Number(v); if (!isFinite(x)) return '0'; return String(parseFloat(x.toFixed(8))); };
  const bp = invBasePres(p);
  const canon = invBaseUnit(p);
  const isWeighed = p.weighed === true;
  const taxSel = p.taxed === false ? 'exento' : 'grabable';
  const gainVal = Math.min(99.99, Math.max(0, Number(p.margin != null ? p.margin : 30)));
  const costBaseVal = (Number(p.cost) || 0) * (Number(bp.contenido) || 1);
  const existing = (Array.isArray(p.invPres) && p.invPres.length) ? p.invPres.map((x, i) => ({ i, unidad: x.unidad, equiv: x.equiv, precio: x.precio, tipo: (x.tipo || 'MANUAL'), activa: x.activa !== false, base: !!x.base })) : [];
  const exBase = existing.find(x => x.base);
  const baseRow = { unidad: bp.unidad || 'Unidad', equiv: bp.contenido || 1, precio: Number(bp.precio) || 0, tipo: (exBase ? exBase.tipo : 'MANUAL'), activa: true, base: true };
  const others = existing.filter(x => !x.base).map(x => ({ unidad: x.unidad, equiv: x.equiv, precio: x.precio, tipo: (x.tipo || 'MANUAL'), activa: x.activa !== false, base: false }));
  let rows = [baseRow, ...others];
  const MAIN_CATS = ['Licores', 'Cervezas', 'Vinos', 'Destilados', 'Bebidas', 'Aguas', 'Tabacos', 'Snacks', 'Lácteos', 'Cárnicos', 'Limpieza', 'Bazar'];
  const catList = [...new Set(MAIN_CATS.concat(p.category || []).concat(db.products.map(x => x.category)).filter(Boolean))];

  const html = `
    <div class="form-grid">
      <div class="field span-2"><label>Código de barras</label><input id="pcCode" value="${esc(p.code)}" placeholder="Leer con escáner o escribir código" autofocus /></div>
      <div class="field span-2"><label>Nombre del producto</label><input id="pcName" value="${esc(p.name)}" /></div>
      <div class="field span-2"><label>Categoría</label>
        <div style="display:flex;gap:6px;align-items:center">
          <input id="pcCat" value="${esc(p.category)}" placeholder="Seleccione o escriba una categoría" style="flex:1" />
          <button type="button" id="pcCatTgl" class="btn sm" title="Mostrar categorías">＋</button>
        </div>
        <div id="pcCatPanel" style="display:none;margin-top:6px;flex-wrap:wrap;gap:6px">
          ${catList.map(c => `<button type="button" class="btn sm cat-opt" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
        </div>
      </div>
      <div class="field"><label>Régimen IVA</label>
        <select id="pcTax"><option value="grabable" ${taxSel === 'grabable' ? 'selected' : ''}>Incluye IVA (gravado)</option><option value="exento" ${taxSel === 'exento' ? 'selected' : ''}>Exento de IVA</option></select>
      </div>
      <div class="field" style="justify-content:flex-end"><label>&nbsp;</label>
        <label style="font-weight:500;display:flex;align-items:center;gap:6px"><input type="checkbox" id="pcWeighed" ${isWeighed ? 'checked' : ''}/> Se vende por peso variable (balanza)</label>
      </div>
    </div>
    <div style="border:1px solid #e2e6ec;border-radius:8px;padding:12px;margin-bottom:12px">
      <b style="font-size:13px;color:#1f2937">Presentación base (maestra)</b>
      <div class="form-grid" style="margin-top:10px">
        <div class="field"><label>Unidad (el "todo")</label><select id="pcBaseUnit">${uOpt(bp.unidad || 'Unidad')}</select></div>
        <div class="field"><label>Contenido</label><input type="number" step="0.001" min="0.001" id="pcBaseCont" value="${Number(bp.contenido) || 1}" /></div>
        <div class="field"><label>Unidad canónica (la contenida)</label><select id="pcCanon">${uOpt(canon)}</select></div>
      </div>
      <div id="pcEquiv" style="font-size:12px;color:#0c8a4a;font-weight:600;margin-top:4px"></div>
    </div>
    <div style="border:1px solid #e2e6ec;border-radius:8px;padding:12px;margin-bottom:12px">
      <b style="font-size:13px;color:#1f2937">Existencia y precios</b>
      <div class="form-grid" style="margin-top:10px">
        <div class="field"><label>Stock (en unidad canónica)</label><input type="number" step="0.001" min="0" id="pcStock" value="${Number(p.stockBase) || 0}" /></div>
        <div class="field"><label>Stock mínimo</label><input type="number" step="0.001" min="0" id="pcStockMin" value="${Number(p.stockMinimo) || 0}" /></div>
        <div class="field"><label>Stock máximo</label><input type="number" step="0.001" min="0" id="pcStockMax" value="${Number(p.stockMaximo) || 0}" /></div>
        <div class="field"><label>Costo por Unidad Base (USD)</label><input type="text" inputmode="decimal" id="pcCostBase" value="${fmtDec(costBaseVal)}" placeholder="0.00" /></div>
        <div class="field"><label>Costo por Unidad Canónica (USD)</label><input type="text" inputmode="decimal" id="pcCost" value="${fmtDec(Number(p.cost) || 0)}" readonly style="background:#f3f4f6" /></div>
        <div class="field"><label>% Ganancia</label><input type="number" step="0.01" min="0" max="99.99" id="pcGain" value="${gainVal}" /></div>
      </div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px">El precio <b>automático</b> de una presentación = Costo × (1 + %Ganancia/100) × equivalencia. Si es <b>manual</b>, al editar el precio se recalcula el %Ganancia (máx. 99.99%).</div>
    </div>
    <div style="border:1px solid #e2e6ec;border-radius:8px;padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <b style="font-size:13px;color:#1f2937">Presentaciones / precios de venta</b>
        <button type="button" class="btn sm primary" id="pcAdd">+ Agregar presentación</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 120px 1fr 150px 40px;gap:6px;font-size:11px;color:#6b7280;font-weight:600;margin-bottom:4px">
        <span style="display:flex;align-items:center;justify-content:center">Unidad de venta</span><span style="display:flex;align-items:center;justify-content:center">Equivalencia</span><span style="display:flex;align-items:center;justify-content:center">Precio USD</span><span style="display:flex;align-items:center;justify-content:center">Tipo de precio</span><span style="display:flex;align-items:center;justify-content:center">Activa</span><span></span>
      </div>
      <div id="pcRows" style="display:flex;flex-direction:column;gap:6px"></div>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="pcSave">Guardar</button>`;
  openModal({ title: editing ? 'Editar producto' : 'Nuevo producto', body: html, footer, size: 'modal-lg' });
  setTimeout(() => {
    const pcBaseUnit = $('#pcBaseUnit'), pcBaseCont = $('#pcBaseCont'), pcCanon = $('#pcCanon');
    const pcCost = $('#pcCost'), pcCostBase = $('#pcCostBase'), pcGain = $('#pcGain');
    const contenido = () => parseFloat(pcBaseCont.value) || 1;
    const cost = () => parseFloat(pcCost.value) || 0;
    // Al ingresar Costo por Unidad Base se deriva el costo de la unidad canónica = base ÷ contenido
    const costBase = () => parseFloat(String(pcCostBase.value).replace(',', '.')) || 0;
    const syncCanonicalCost = () => { pcCost.value = fmtDec(costBase() / contenido()); };
    const syncBaseCost = () => { pcCostBase.value = fmtDec(cost() * contenido()); };
    const gain = () => Math.min(99.99, Math.max(0, parseFloat(pcGain.value) || 0));
    const setGain = (g) => { pcGain.value = (Math.min(99.99, Math.max(0, g))).toFixed(2); };
    // Precio resuelto de la presentación base (todo)
    const baseResolved = () => rows[0].tipo === 'AUTO' ? cost() * (1 + gain() / 100) * contenido() : pnum(rows[0].precio);
    const rowAuto = (equiv) => (baseResolved() / contenido()) * equiv;

    const showEquiv = () => { $('#pcEquiv').textContent = '1 ' + (pcBaseUnit.value || '?') + ' = ' + contenido() + ' ' + (pcCanon.value || '?'); };

    const paintRows = () => {
      const box = $('#pcRows'); if (!box) return; box.innerHTML = '';
      rows.forEach((r, idx) => {
        const isBase = idx === 0;
        const auto = r.tipo === 'AUTO';
        const unVal = isBase ? (pcBaseUnit.value || 'Unidad') : r.unidad;
        const eqVal = isBase ? contenido() : pnum(r.equiv);
        const priceVal = isBase ? (auto ? baseResolved() : pnum(r.precio)) : (auto ? rowAuto(eqVal) : pnum(r.precio));
        const div = document.createElement('div');
        div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 120px 1fr 150px 40px;gap:6px;align-items:center';
        div.innerHTML = `
          <select class="pr-un" data-i="${idx}" ${isBase ? 'disabled' : ''}>${uOpt(unVal)}</select>
          <input type="text" inputmode="decimal" class="pr-eq" value="${fmtDec(eqVal)}" data-i="${idx}" placeholder="0.00" ${isBase ? 'disabled' : ''} />
          <input type="text" inputmode="decimal" class="pr-pr" value="${fmtDec(priceVal)}" data-i="${idx}" placeholder="0.000000" ${auto ? 'readonly style="background:#f3f4f6"' : ''}/>
          <select class="pr-tp" data-i="${idx}"><option value="MANUAL" ${!auto ? 'selected' : ''}>Manual</option><option value="AUTO" ${auto ? 'selected' : ''}>Automático</option></select>
          <label style="font-size:11px;color:#6b7280;display:flex;align-items:center;gap:4px${isBase ? ';opacity:.6' : ''}"><input type="checkbox" class="pr-act" data-i="${idx}" ${r.activa ? 'checked' : ''} ${isBase ? 'disabled' : ''}/> Activa</label>
          <button type="button" class="btn sm danger pr-del" data-i="${idx}" title="Quitar" ${isBase ? 'disabled style="visibility:hidden"' : ''}>&times;</button>`;
        box.appendChild(div);
      });
      box.querySelectorAll('.pr-un').forEach(el => el.addEventListener('change', () => { const r = rows[+el.dataset.i]; r.unidad = el.value; }));
      box.querySelectorAll('.pr-eq').forEach(el => el.addEventListener('input', () => { const r = rows[+el.dataset.i]; r.equiv = pnum(el.value); if (r.tipo === 'AUTO') { const pIn = el.closest('div').querySelector('.pr-pr'); pIn.value = fmtDec(rowAuto(r.equiv)); } }));
      box.querySelectorAll('.pr-pr').forEach(el => el.addEventListener('input', () => { const r = rows[+el.dataset.i]; if (r.tipo === 'AUTO') return; r.precio = pnum(el.value); }));
      box.querySelectorAll('.pr-pr').forEach(el => el.addEventListener('change', () => {
        const r = rows[+el.dataset.i]; if (r.tipo === 'AUTO') return;
        r.precio = pnum(el.value);
        // Solo la presentación base recalcula el % de Ganancia; las fraccionadas manuales son independientes
        if (r.base) {
          const c = cost(); if (c > 0) { const eqIn = el.closest('div').querySelector('.pr-eq'); const e = eqIn ? (pnum(eqIn.value) || 1) : contenido(); setGain((((r.precio / e) - c) / c) * 100); paintRows(); }
        }
      }));
      box.querySelectorAll('.pr-tp').forEach(el => el.addEventListener('change', () => {
        const r = rows[+el.dataset.i]; r.tipo = el.value;
        const rowDiv = el.closest('div'); const pIn = rowDiv.querySelector('.pr-pr'); const eq = rowDiv.querySelector('.pr-eq');
        const eqv = isBase0(el) ? contenido() : pnum(eq.value);
        if (r.tipo === 'AUTO') { pIn.readOnly = true; pIn.style.background = '#f3f4f6'; pIn.value = fmtDec(isBase0(el) ? baseResolved() : rowAuto(eqv)); }
        else { pIn.readOnly = false; pIn.style.background = ''; pIn.value = fmtDec(r.precio); }
      }));
      box.querySelectorAll('.pr-act').forEach(el => el.addEventListener('change', () => { const r = rows[+el.dataset.i]; if (!r.base) r.activa = el.checked; }));
      box.querySelectorAll('.pr-del').forEach(el => el.addEventListener('click', () => { if (rows[+el.dataset.i].base) return; rows.splice(+el.dataset.i, 1); paintRows(); }));
      // garantizar que los selects/inputs se vean a ancho completo y alineados
      box.querySelectorAll('select, input').forEach(el => { if (el.style.width !== '100%') { el.style.width = '100%'; el.style.boxSizing = 'border-box'; } });
    };
    const containedFor = () => contenido();
    const isBase0 = (el) => rows[+el.dataset.i].base;

    const repaintAll = () => { paintRows(); showEquiv(); };
    // Desplegable de categorías (+ / −)
    const catTgl = $('#pcCatTgl'), catPanel = $('#pcCatPanel');
    let catOpen = false;
    catTgl.addEventListener('click', () => { catOpen = !catOpen; catPanel.style.display = catOpen ? 'flex' : 'none'; catTgl.textContent = catOpen ? '−' : '＋'; });
    catPanel.querySelectorAll('.cat-opt').forEach(b => b.addEventListener('click', () => { $('#pcCat').value = b.dataset.cat; catOpen = false; catPanel.style.display = 'none'; catTgl.textContent = '＋'; }));
    $('#pcAdd').addEventListener('click', () => { rows.push({ unidad: pcCanon.value || 'Unidad', equiv: 1, precio: 0, tipo: 'AUTO', activa: true, base: false }); paintRows(); });
    [pcBaseUnit, pcCanon].forEach(el => el.addEventListener('change', repaintAll));
    pcBaseCont.addEventListener('input', () => { syncCanonicalCost(); repaintAll(); });
    pcCostBase.addEventListener('input', () => { syncCanonicalCost(); repaintAll(); });
    pcCost.addEventListener('input', () => { syncBaseCost(); repaintAll(); });
    pcGain.addEventListener('input', repaintAll);
    paintRows(); showEquiv();

    $('#pcSave').addEventListener('click', () => {
      const code = $('#pcCode').value.trim();
      const name = $('#pcName').value.trim();
      if (!name) { toast('Ingrese el nombre del producto', 'warn'); return; }
      const cnt = contenido();
      const unidadBase = pcBaseUnit.value || pcCanon.value || 'Unidad';
      const canonU = pcCanon.value || 'Unidad';
      const baseRes = baseResolved();
      const invPres = rows.map((r, i) => {
        const isB = i === 0;
        const eq = isB ? cnt : pnum(r.equiv);
        const unidad = isB ? unidadBase : r.unidad;
        const precio = r.tipo === 'AUTO' ? (isB ? baseRes : rowAuto(eq)) : pnum(r.precio);
        return { unidad, equiv: eq, precio, tipo: r.tipo, activa: r.activa !== false, base: isB };
      }).filter(r => r.equiv > 0 && r.unidad);
      const prod = {
        id: editing ? source.id : (Date.now()),
        code: code || ('P' + Date.now()),
        name, category: $('#pcCat').value.trim() || 'General',
        taxed: $('#pcTax').value === 'grabable',
        weighed: $('#pcWeighed').checked,
        invBasePres: { unidad: unidadBase, contenido: cnt, precio: baseRes },
        invBaseUnit: canonU,
        invPres,
        stockBase: parseFloat($('#pcStock').value) || 0,
        stockMinimo: parseFloat($('#pcStockMin').value) || 0,
        stockMaximo: parseFloat($('#pcStockMax').value) || 0,
        cost: cost(),
        margin: gain()
      };
      canonicalizeProduct(prod);
      if (editing) Object.assign(source, prod); else db.products.push(prod);
      DB.save(db); closeModal(); renderDashboard('inventory'); toast('Producto guardado', 'success');
    });
  }, 60);
}

/* ============================================================
   VENTAS
   ============================================================ */
function renderSales() {
  const total = db.sales.reduce((s, x) => s + x.total, 0);
  const html = `
    <div class="module-head">
      <h3>Historial de ventas</h3>
      <div class="actions">
        <button class="btn primary" onclick="showPOS()">+ Nueva venta</button>
      </div>
    </div>
    <div class="grid cols-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-info"><div class="lbl">Total ventas</div><div class="val">${fmt.money(total)}</div></div><div class="kpi-ico">${ico('cxc')}</div></div>
      <div class="kpi k-blue"><div class="kpi-info"><div class="lbl">Operaciones</div><div class="val">${db.sales.length}</div></div><div class="kpi-ico">${ico('sales')}</div></div>
      <div class="kpi k-green"><div class="kpi-info"><div class="lbl">Contado</div><div class="val">${db.sales.filter(s => s.status === 'paid').length}</div></div><div class="kpi-ico">${ico('check')}</div></div>
      <div class="kpi k-orange"><div class="kpi-info"><div class="lbl">A crédito</div><div class="val">${db.sales.filter(s => s.status === 'credit').length}</div></div><div class="kpi-ico">${ico('pending')}</div></div>
    </div>
    <div class="dt">
      <div class="dt-toolbar">
        <h3>Ventas registradas</h3>
        <div class="tools">
          <input class="search" id="salSearch" placeholder="Buscar por cliente o número..." />
          <select id="salStatus"><option value="">Todas</option><option value="paid">Pagadas</option><option value="credit">A crédito</option><option value="refunded">Reembolsadas</option></select>
        </div>
      </div>
      <div class="dt-wrap">
        <table class="dt">
          <thead><tr><th>Fecha</th><th>N° Recibo</th><th>Cliente</th><th class="num">Items</th><th class="num">Total</th><th>Estado</th></tr></thead>
          <tbody id="salTbody"></tbody>
        </table>
      </div>
    </div>
  `;
  $('#dashContent').innerHTML = html;
  paintSales();
  $('#salSearch').addEventListener('input', paintSales);
  $('#salStatus').addEventListener('change', paintSales);
}

function paintSales() {
  const q = ($('#salSearch')?.value || '').toLowerCase();
  const st = $('#salStatus')?.value || '';
  const list = db.sales.filter(s => {
    if (st && s.status !== st) return false;
    if (q && !s.client.toLowerCase().includes(q) && !s.number.includes(q)) return false;
    return true;
  });
  const tb = $('#salTbody');
  if (!tb) return;
  if (list.length === 0) { tb.innerHTML = `<tr><td colspan="6" class="empty">Sin ventas</td></tr>`; return; }
  tb.innerHTML = list.map(s => `
    <tr>
      <td>${s.date}</td>
      <td><code>${s.number}</code></td>
      <td>${s.client}</td>
      <td class="num">${s.items}</td>
      <td class="num">${fmt.money(s.total)}</td>
      <td>${statusPill(s.status)}</td>
    </tr>`).join('');
}

/* ============================================================
   CXC — Cuentas por Cobrar
   ============================================================ */
function renderCxC() {
  const total = db.receivables.reduce((s, r) => s + r.balance, 0);
  const pending = db.receivables.filter(r => r.status === 'pending').length;
  const partial = db.receivables.filter(r => r.status === 'partial').length;
  const overdue = db.receivables.filter(r => r.status !== 'paid' && new Date(r.dueDate) < new Date()).length;
  const html = `
    <div class="module-head">
      <h3>Cuentas por Cobrar</h3>
      <div class="actions">
        <button class="btn primary" id="newCxc">+ Nueva factura</button>
        <button class="btn" id="rcvPay">Registrar pago</button>
      </div>
    </div>
    <div class="grid cols-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-info"><div class="lbl">Por cobrar</div><div class="val">${fmt.money(total)}</div></div><div class="kpi-ico">${ico('export')}</div></div>
      <div class="kpi k-blue"><div class="kpi-info"><div class="lbl">Pendientes</div><div class="val">${pending}</div></div><div class="kpi-ico">${ico('pending')}</div></div>
      <div class="kpi k-orange"><div class="kpi-info"><div class="lbl">Pago parcial</div><div class="val">${partial}</div></div><div class="kpi-ico">${ico('partial')}</div></div>
      <div class="kpi k-red"><div class="kpi-info"><div class="lbl">Vencidas</div><div class="val">${overdue}</div></div><div class="kpi-ico">${ico('warn')}</div></div>
    </div>
    <div class="dt">
      <div class="dt-toolbar">
        <h3>Documentos por cobrar</h3>
        <div class="tools">
          <input class="search" id="cxcSearch" placeholder="Buscar cliente o documento..." />
        </div>
      </div>
      <div class="dt-wrap">
        <table class="dt">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Documento</th><th>Cliente</th><th>Vence</th><th class="num">Total</th><th class="num">Pagado</th><th class="num">Saldo</th><th>Estado</th><th></th></tr></thead>
          <tbody id="cxcTbody"></tbody>
        </table>
      </div>
    </div>
  `;
  $('#dashContent').innerHTML = html;
  paintCxC();
  $('#cxcSearch').addEventListener('input', paintCxC);
  $('#newCxc').addEventListener('click', cxcForm);
  $('#rcvPay').addEventListener('click', paymentForm);
}

function paintCxC() {
  const q = ($('#cxcSearch')?.value || '').toLowerCase();
  const list = db.receivables.filter(r => !q || r.client.toLowerCase().includes(q) || r.docNumber.toLowerCase().includes(q));
  const tb = $('#cxcTbody');
  if (!tb) return;
  if (list.length === 0) { tb.innerHTML = `<tr><td colspan="10" class="empty">Sin documentos</td></tr>`; return; }
  tb.innerHTML = list.map(r => {
    const overdue = r.status !== 'paid' && new Date(r.dueDate) < new Date();
    return `<tr>
      <td>${fmt.date(r.date)}</td>
      <td>${r.docType}</td>
      <td><code>${r.docNumber}</code></td>
      <td>${r.client}</td>
      <td>${fmt.date(r.dueDate)} ${overdue ? '<span class="pill red">vencida</span>' : ''}</td>
      <td class="num">${fmt.money(r.total)}</td>
      <td class="num">${fmt.money(r.paid)}</td>
      <td class="num"><b>${fmt.money(r.balance)}</b></td>
      <td>${statusPill(r.status)}</td>
      <td class="actions-cell">${r.status !== 'paid' ? `<button class="btn sm primary" data-pay="${r.id}">Pagar</button>` : ''}</td>
    </tr>`;
  }).join('');
  $$('button[data-pay]', tb).forEach(b => b.addEventListener('click', () => paymentForm(+b.dataset.pay)));
}

function cxcForm() {
  const html = `
    <div class="form-grid">
      <div class="field"><label>Fecha</label><input type="date" id="cxcDate" value="${new Date().toISOString().slice(0,10)}" /></div>
      <div class="field"><label>Tipo</label><select id="cxcType"><option>FAC</option><option>NCR</option><option>ND</option></select></div>
      <div class="field span-2"><label>Cliente</label><select id="cxcClient">${db.clients.map(c => `<option value="${c.id}">${c.name} (${c.code})</option>`).join('')}</select></div>
      <div class="field"><label>N° Documento</label><input id="cxcNum" value="F-2025-${String(Math.floor(Math.random()*999)).padStart(3,'0')}" /></div>
      <div class="field"><label>Total</label><input type="number" step="0.01" id="cxcTotal" value="0" /></div>
      <div class="field"><label>Vencimiento</label><input type="date" id="cxcDue" value="${(() => { const d = new Date(); d.setDate(d.getDate()+30); return d.toISOString().slice(0,10); })()}" /></div>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="cxcSave">Registrar</button>`;
  openModal({ title: 'Nueva cuenta por cobrar', body: html, footer });
  setTimeout(() => {
    $('#cxcSave').addEventListener('click', () => {
      const c = db.clients.find(x => x.id === +$('#cxcClient').value);
      const total = parseFloat($('#cxcTotal').value) || 0;
      const r = {
        id: db.receivables.length + 1,
        date: $('#cxcDate').value, docType: $('#cxcType').value,
        docNumber: $('#cxcNum').value, client: c.name,
        total, paid: 0, balance: total,
        dueDate: $('#cxcDue').value, status: 'pending'
      };
      db.receivables.unshift(r);
      c.balance = (c.balance || 0) + total;
      DB.save(db); closeModal(); renderCxC();
      toast('Cuenta por cobrar registrada', 'success');
    });
  }, 60);
}

function paymentForm(id) {
  const r = id ? db.receivables.find(x => x.id === id) : db.receivables[0];
  if (!r) { toast('Sin documentos pendientes', 'warn'); return; }
  const html = `
    <div class="field"><label>Documento</label>
      <select id="payDoc">${db.receivables.filter(x => x.status !== 'paid').map(x => `<option value="${x.id}" ${r && x.id === r.id ? 'selected' : ''}>${x.docNumber} — ${x.client} — saldo ${fmt.money(x.balance)}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Monto a pagar</label><input type="number" step="0.01" id="payAmt" value="${r ? r.balance.toFixed(2) : 0}" /></div>
    <div class="field"><label>Fecha</label><input type="date" id="payDate" value="${new Date().toISOString().slice(0,10)}" /></div>
    <div class="field"><label>Forma de pago</label>
      <select id="payForm"><option>Efectivo</option><option>Transferencia</option><option>Cheque</option><option>Tarjeta</option></select>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="paySave">Registrar pago</button>`;
  openModal({ title: 'Registrar pago (CxC)', body: html, footer });
  setTimeout(() => {
    $('#payDoc').addEventListener('change', () => {
      const d = db.receivables.find(x => x.id === +$('#payDoc').value);
      if (d) $('#payAmt').value = d.balance.toFixed(2);
    });
    $('#paySave').addEventListener('click', () => {
      const docId = +$('#payDoc').value;
      const amt = parseFloat($('#payAmt').value) || 0;
      if (amt <= 0) { toast('Monto inválido', 'error'); return; }
      const d = db.receivables.find(x => x.id === docId);
      d.paid += amt;
      d.balance = Math.max(0, d.total - d.paid);
      d.status = d.balance === 0 ? 'paid' : 'partial';
      const cli = db.clients.find(c => c.name === d.client);
      if (cli) cli.balance = Math.max(0, (cli.balance || 0) - amt);
      db.accounting.unshift({
        id: db.accounting.length + 1,
        date: $('#payDate').value,
        type: 'ingreso', category: 'Cobranza',
        description: `Cobro ${d.docNumber} — ${d.client}`,
        amount: amt, ref: 'COB-' + d.docNumber
      });
      DB.save(db); closeModal(); renderCxC();
      toast(`Pago registrado: ${fmt.money(amt)}`, 'success');
    });
  }, 60);
}

/* ============================================================
   CXP — Cuentas por Pagar
   ============================================================ */
function renderCxP() {
  const total = db.payables.reduce((s, p) => s + p.balance, 0);
  const pending = db.payables.filter(p => p.status === 'pending').length;
  const html = `
    <div class="module-head">
      <h3>Cuentas por Pagar</h3>
      <div class="actions">
        <button class="btn primary" id="newCxp">+ Nueva factura</button>
        <button class="btn" id="payProv">Registrar pago</button>
      </div>
    </div>
    <div class="grid cols-3" style="margin-bottom:14px">
      <div class="kpi k-red"><div class="kpi-info"><div class="lbl">Total por pagar</div><div class="val">${fmt.money(total)}</div></div><div class="kpi-ico">${ico('import')}</div></div>
      <div class="kpi k-orange"><div class="kpi-info"><div class="lbl">Documentos pendientes</div><div class="val">${pending}</div></div><div class="kpi-ico">${ico('pending')}</div></div>
      <div class="kpi k-blue"><div class="kpi-info"><div class="lbl">Proveedores con saldo</div><div class="val">${db.suppliers.filter(s => s.balance > 0).length}</div></div><div class="kpi-ico">${ico('suppliers')}</div></div>
    </div>
    <div class="dt">
      <div class="dt-toolbar">
        <h3>Documentos por pagar</h3>
        <div class="tools">
          <input class="search" id="cxpSearch" placeholder="Buscar proveedor o documento..." />
        </div>
      </div>
      <div class="dt-wrap">
        <table class="dt">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Documento</th><th>Proveedor</th><th>Vence</th><th class="num">Total</th><th class="num">Pagado</th><th class="num">Saldo</th><th>Estado</th><th></th></tr></thead>
          <tbody id="cxpTbody"></tbody>
        </table>
      </div>
    </div>
  `;
  $('#dashContent').innerHTML = html;
  paintCxP();
  $('#cxpSearch').addEventListener('input', paintCxP);
  $('#newCxp').addEventListener('click', cxpForm);
  $('#payProv').addEventListener('click', supplierPaymentForm);
}

function paintCxP() {
  const q = ($('#cxpSearch')?.value || '').toLowerCase();
  const list = db.payables.filter(p => !q || p.supplier.toLowerCase().includes(q) || p.docNumber.toLowerCase().includes(q));
  const tb = $('#cxpTbody');
  if (!tb) return;
  if (list.length === 0) { tb.innerHTML = `<tr><td colspan="10" class="empty">Sin documentos</td></tr>`; return; }
  tb.innerHTML = list.map(p => `<tr>
    <td>${fmt.date(p.date)}</td>
    <td>${p.docType}</td>
    <td><code>${p.docNumber}</code></td>
    <td>${p.supplier}</td>
    <td>${fmt.date(p.dueDate)}</td>
    <td class="num">${fmt.money(p.total)}</td>
    <td class="num">${fmt.money(p.paid)}</td>
    <td class="num"><b>${fmt.money(p.balance)}</b></td>
    <td>${statusPill(p.status)}</td>
    <td class="actions-cell">${p.status !== 'paid' ? `<button class="btn sm primary" data-pp="${p.id}">Pagar</button>` : ''}</td>
  </tr>`).join('');
  $$('button[data-pp]', tb).forEach(b => b.addEventListener('click', () => supplierPaymentForm(+b.dataset.pp)));
}

function cxpForm() {
  const html = `
    <div class="form-grid">
      <div class="field"><label>Fecha</label><input type="date" id="pDate" value="${new Date().toISOString().slice(0,10)}" /></div>
      <div class="field"><label>Tipo</label><select id="pType"><option>FAC</option><option>NDB</option><option>NCR</option></select></div>
      <div class="field span-2"><label>Proveedor</label><select id="pSup">${db.suppliers.map(s => `<option value="${s.id}">${s.name} (${s.code})</option>`).join('')}</select></div>
      <div class="field"><label>N° Documento</label><input id="pNum" value="P-2025-${String(Math.floor(Math.random()*999)).padStart(3,'0')}" /></div>
      <div class="field"><label>Total</label><input type="number" step="0.01" id="pTotal" value="0" /></div>
      <div class="field"><label>Vencimiento</label><input type="date" id="pDue" value="${(() => { const d = new Date(); d.setDate(d.getDate()+30); return d.toISOString().slice(0,10); })()}" /></div>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="pSave">Registrar</button>`;
  openModal({ title: 'Nueva cuenta por pagar', body: html, footer });
  setTimeout(() => {
    $('#pSave').addEventListener('click', () => {
      const s = db.suppliers.find(x => x.id === +$('#pSup').value);
      const total = parseFloat($('#pTotal').value) || 0;
      const p = {
        id: db.payables.length + 1,
        date: $('#pDate').value, docType: $('#pType').value,
        docNumber: $('#pNum').value, supplier: s.name,
        total, paid: 0, balance: total,
        dueDate: $('#pDue').value, status: 'pending'
      };
      db.payables.unshift(p);
      s.balance = (s.balance || 0) + total;
      DB.save(db); closeModal(); renderCxP();
      toast('Cuenta por pagar registrada', 'success');
    });
  }, 60);
}

function supplierPaymentForm(id) {
  const p = id ? db.payables.find(x => x.id === id) : db.payables.find(x => x.status !== 'paid');
  if (!p) { toast('Sin documentos pendientes', 'warn'); return; }
  const html = `
    <div class="field"><label>Documento</label>
      <select id="sppDoc">${db.payables.filter(x => x.status !== 'paid').map(x => `<option value="${x.id}" ${p && x.id === p.id ? 'selected' : ''}>${x.docNumber} — ${x.supplier} — saldo ${fmt.money(x.balance)}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Monto a pagar</label><input type="number" step="0.01" id="sppAmt" value="${p ? p.balance.toFixed(2) : 0}" /></div>
    <div class="field"><label>Fecha</label><input type="date" id="sppDate" value="${new Date().toISOString().slice(0,10)}" /></div>
    <div class="field"><label>Forma de pago</label>
      <select id="sppForm"><option>Transferencia</option><option>Efectivo</option><option>Cheque</option></select>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="sppSave">Registrar pago</button>`;
  openModal({ title: 'Registrar pago a proveedor', body: html, footer });
  setTimeout(() => {
    $('#sppDoc').addEventListener('change', () => {
      const d = db.payables.find(x => x.id === +$('#sppDoc').value);
      if (d) $('#sppAmt').value = d.balance.toFixed(2);
    });
    $('#sppSave').addEventListener('click', () => {
      const docId = +$('#sppDoc').value;
      const amt = parseFloat($('#sppAmt').value) || 0;
      if (amt <= 0) { toast('Monto inválido', 'error'); return; }
      const d = db.payables.find(x => x.id === docId);
      d.paid += amt;
      d.balance = Math.max(0, d.total - d.paid);
      d.status = d.balance === 0 ? 'paid' : 'partial';
      const sup = db.suppliers.find(s => s.name === d.supplier);
      if (sup) sup.balance = Math.max(0, (sup.balance || 0) - amt);
      db.accounting.unshift({
        id: db.accounting.length + 1,
        date: $('#sppDate').value,
        type: 'egreso', category: 'Proveedores',
        description: `Pago ${d.docNumber} — ${d.supplier}`,
        amount: amt, ref: 'PAG-' + d.docNumber
      });
      DB.save(db); closeModal(); renderCxP();
      toast(`Pago a proveedor: ${fmt.money(amt)}`, 'success');
    });
  }, 60);
}

/* ============================================================
   CLIENTES
   ============================================================ */
function renderClients() {
  const totalDebt = db.clients.reduce((s, c) => s + (c.balance || 0), 0);
  const html = `
    <div class="module-head">
      <h3>Clientes</h3>
      <div class="actions">
        <button class="btn primary" id="newClient">+ Nuevo cliente</button>
      </div>
    </div>
    <div class="grid cols-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-info"><div class="lbl">Total clientes</div><div class="val">${db.clients.length}</div></div><div class="kpi-ico">${ico('clients')}</div></div>
      <div class="kpi k-blue"><div class="kpi-info"><div class="lbl">Activos</div><div class="val">${db.clients.filter(c => c.status === 'active').length}</div></div><div class="kpi-ico">${ico('check')}</div></div>
      <div class="kpi k-orange"><div class="kpi-info"><div class="lbl">Deuda total</div><div class="val">${fmt.money(totalDebt)}</div></div><div class="kpi-ico">${ico('cxc')}</div></div>
      <div class="kpi k-red"><div class="kpi-info"><div class="lbl">Con crédito</div><div class="val">${db.clients.filter(c => c.creditLimit > 0).length}</div></div><div class="kpi-ico">${ico('docs')}</div></div>
    </div>
    <div class="dt">
      <div class="dt-toolbar">
        <h3>Listado de clientes</h3>
        <div class="tools">
          <input class="search" id="cliSearch" placeholder="Buscar por nombre, RIF..." />
        </div>
      </div>
      <div class="dt-wrap">
        <table class="dt">
          <thead><tr><th>Código</th><th>Nombre / Razón social</th><th>RIF/CI</th><th>Teléfono</th><th>Email</th><th class="num">Límite</th><th class="num">Saldo</th><th>Estado</th><th></th></tr></thead>
          <tbody id="cliTbody"></tbody>
        </table>
      </div>
    </div>
  `;
  $('#dashContent').innerHTML = html;
  paintClients();
  $('#cliSearch').addEventListener('input', paintClients);
  $('#newClient').addEventListener('click', () => clientForm());
}

function paintClients() {
  const q = ($('#cliSearch')?.value || '').toLowerCase();
  const list = db.clients.filter(c => !q || c.name.toLowerCase().includes(q) || c.taxId.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  const tb = $('#cliTbody');
  if (!tb) return;
  if (list.length === 0) { tb.innerHTML = `<tr><td colspan="9" class="empty">Sin clientes</td></tr>`; return; }
  tb.innerHTML = list.map(c => `<tr>
    <td><code>${c.code}</code></td>
    <td><b>${c.name}</b><br><small style="color:#6b7280">${c.address || ''}</small></td>
    <td>${c.taxId}</td>
    <td>${c.phone}</td>
    <td>${c.email}</td>
    <td class="num">${fmt.money(c.creditLimit || 0)}</td>
    <td class="num"><b>${fmt.money(c.balance || 0)}</b></td>
    <td>${statusPill(c.status)}</td>
    <td class="actions-cell">
      <button class="btn sm" data-edit="${c.id}">Editar</button>
      <button class="btn sm" data-st="${c.id}">${c.status === 'active' ? 'Desactivar' : 'Activar'}</button>
    </td>
  </tr>`).join('');
  $$('button[data-edit]', tb).forEach(b => b.addEventListener('click', () => clientForm(+b.dataset.edit)));
  $$('button[data-st]', tb).forEach(b => b.addEventListener('click', () => {
    const c = db.clients.find(x => x.id === +b.dataset.st);
    c.status = c.status === 'active' ? 'inactive' : 'active';
    DB.save(db); paintClients(); toast('Estado actualizado', 'success');
  }));
}

function clientForm(id) {
  const c = id ? db.clients.find(x => x.id === id) : { code: '', name: '', taxId: '', address: '', phone: '', email: '', creditLimit: 0, balance: 0, status: 'active' };
  const html = `
    <div class="form-grid">
      <div class="field"><label>Código</label><input id="clCode" value="${c.code}" /></div>
      <div class="field"><label>RIF / CI</label><input id="clTax" value="${c.taxId}" /></div>
      <div class="field span-2"><label>Nombre / Razón social</label><input id="clName" value="${c.name}" /></div>
      <div class="field span-2"><label>Dirección</label><input id="clAddr" value="${c.address || ''}" /></div>
      <div class="field"><label>Teléfono</label><input id="clPhone" value="${c.phone || ''}" /></div>
      <div class="field"><label>Email</label><input id="clEmail" value="${c.email || ''}" /></div>
      <div class="field"><label>Límite de crédito</label><input type="number" step="0.01" id="clLim" value="${c.creditLimit || 0}" /></div>
      <div class="field"><label>Saldo</label><input type="number" step="0.01" id="clBal" value="${c.balance || 0}" /></div>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="clSave">Guardar</button>`;
  openModal({ title: id ? 'Editar cliente' : 'Nuevo cliente', body: html, footer, size: 'modal-lg' });
  setTimeout(() => {
    $('#clSave').addEventListener('click', () => {
      const data = {
        code: $('#clCode').value, taxId: $('#clTax').value,
        name: $('#clName').value, address: $('#clAddr').value,
        phone: $('#clPhone').value, email: $('#clEmail').value,
        creditLimit: parseFloat($('#clLim').value) || 0,
        balance: parseFloat($('#clBal').value) || 0,
        status: c.status || 'active'
      };
      if (id) Object.assign(c, data);
      else db.clients.push({ id: Date.now(), createdAt: new Date().toISOString().slice(0, 10), ...data });
      DB.save(db); closeModal(); renderClients();
      toast('Cliente guardado', 'success');
    });
  }, 60);
}

/* ============================================================
   PROVEEDORES
   ============================================================ */
function renderSuppliers() {
  const totalDebt = db.suppliers.reduce((s, c) => s + (c.balance || 0), 0);
  const html = `
    <div class="module-head">
      <h3>Proveedores</h3>
      <div class="actions">
        <button class="btn primary" id="newSup">+ Nuevo proveedor</button>
      </div>
    </div>
    <div class="grid cols-3" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-info"><div class="lbl">Total proveedores</div><div class="val">${db.suppliers.length}</div></div><div class="kpi-ico">${ico('suppliers')}</div></div>
      <div class="kpi k-red"><div class="kpi-info"><div class="lbl">Deuda total</div><div class="val">${fmt.money(totalDebt)}</div></div><div class="kpi-ico">${ico('import')}</div></div>
      <div class="kpi k-blue"><div class="kpi-info"><div class="lbl">Activos</div><div class="val">${db.suppliers.filter(c => c.status === 'active').length}</div></div><div class="kpi-ico">${ico('check')}</div></div>
    </div>
    <div class="dt">
      <div class="dt-toolbar">
        <h3>Listado de proveedores</h3>
        <div class="tools">
          <input class="search" id="supSearch" placeholder="Buscar..." />
        </div>
      </div>
      <div class="dt-wrap">
        <table class="dt">
          <thead><tr><th>Código</th><th>Nombre</th><th>Contacto</th><th>Teléfono</th><th>Email</th><th>RIF</th><th class="num">Saldo</th><th>Estado</th><th></th></tr></thead>
          <tbody id="supTbody"></tbody>
        </table>
      </div>
    </div>
  `;
  $('#dashContent').innerHTML = html;
  paintSuppliers();
  $('#supSearch').addEventListener('input', paintSuppliers);
  $('#newSup').addEventListener('click', () => supplierForm());
}

function paintSuppliers() {
  const q = ($('#supSearch')?.value || '').toLowerCase();
  const list = db.suppliers.filter(c => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.taxId.toLowerCase().includes(q));
  const tb = $('#supTbody');
  if (!tb) return;
  if (list.length === 0) { tb.innerHTML = `<tr><td colspan="9" class="empty">Sin proveedores</td></tr>`; return; }
  tb.innerHTML = list.map(s => `<tr>
    <td><code>${s.code}</code></td>
    <td><b>${s.name}</b><br><small style="color:#6b7280">${s.address || ''}</small></td>
    <td>${s.contact}</td>
    <td>${s.phone}</td>
    <td>${s.email}</td>
    <td>${s.taxId}</td>
    <td class="num"><b>${fmt.money(s.balance || 0)}</b></td>
    <td>${statusPill(s.status)}</td>
    <td class="actions-cell">
      <button class="btn sm" data-edit="${s.id}">Editar</button>
      <button class="btn sm danger" data-del="${s.id}">${ico('close')}</button>
    </td>
  </tr>`).join('');
  $$('button[data-edit]', tb).forEach(b => b.addEventListener('click', () => supplierForm(+b.dataset.edit)));
  $$('button[data-del]', tb).forEach(b => b.addEventListener('click', () => {
    if (!confirm('¿Eliminar este proveedor?')) return;
    db.suppliers = db.suppliers.filter(x => x.id !== +b.dataset.del);
    DB.save(db); paintSuppliers(); toast('Proveedor eliminado', 'warn');
  }));
}

function supplierForm(id) {
  const s = id ? db.suppliers.find(x => x.id === id) : { code: '', name: '', contact: '', phone: '', email: '', address: '', taxId: '', balance: 0, status: 'active' };
  const html = `
    <div class="form-grid">
      <div class="field"><label>Código</label><input id="spCode" value="${s.code}" /></div>
      <div class="field"><label>RIF</label><input id="spTax" value="${s.taxId}" /></div>
      <div class="field span-2"><label>Razón social</label><input id="spName" value="${s.name}" /></div>
      <div class="field"><label>Persona de contacto</label><input id="spCon" value="${s.contact || ''}" /></div>
      <div class="field"><label>Teléfono</label><input id="spPh" value="${s.phone || ''}" /></div>
      <div class="field"><label>Email</label><input id="spEm" value="${s.email || ''}" /></div>
      <div class="field"><label>Saldo</label><input type="number" step="0.01" id="spBal" value="${s.balance || 0}" /></div>
      <div class="field span-2"><label>Dirección</label><input id="spAddr" value="${s.address || ''}" /></div>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="spSave">Guardar</button>`;
  openModal({ title: id ? 'Editar proveedor' : 'Nuevo proveedor', body: html, footer, size: 'modal-lg' });
  setTimeout(() => {
    $('#spSave').addEventListener('click', () => {
      const data = {
        code: $('#spCode').value, taxId: $('#spTax').value, name: $('#spName').value,
        contact: $('#spCon').value, phone: $('#spPh').value, email: $('#spEm').value,
        balance: parseFloat($('#spBal').value) || 0, address: $('#spAddr').value,
        status: s.status || 'active'
      };
      if (id) Object.assign(s, data);
      else db.suppliers.push({ id: Date.now(), ...data });
      DB.save(db); closeModal(); renderSuppliers();
      toast('Proveedor guardado', 'success');
    });
  }, 60);
}

/* ============================================================
   EMPLEADOS
   ============================================================ */
function renderEmployees() {
  const html = `
    <div class="module-head">
      <h3>Empleados</h3>
      <div class="actions">
        <button class="btn primary" id="newEmp">+ Nuevo empleado</button>
      </div>
    </div>
    <div class="dt">
      <div class="dt-toolbar">
        <h3>Listado de personal</h3>
        <div class="tools"><input class="search" id="empSearch" placeholder="Buscar..." /></div>
      </div>
      <div class="dt-wrap">
        <table class="dt">
          <thead><tr><th>Código</th><th>Nombre</th><th>Cargo</th><th>Departamento</th><th>Email</th><th>Estado</th><th></th></tr></thead>
          <tbody id="empTbody"></tbody>
        </table>
      </div>
    </div>
  `;
  $('#dashContent').innerHTML = html;
  paintEmployees();
  $('#empSearch').addEventListener('input', paintEmployees);
  $('#newEmp').addEventListener('click', () => employeeForm());
}

function paintEmployees() {
  // Generamos empleados desde los usuarios con role cashier, supervisor, etc.
  const list = db.users.map(u => ({
    code: 'EMP-' + String(u.id).padStart(3, '0'),
    name: u.name, position: u.role, dept: u.branch, email: u.email, status: u.status
  }));
  const q = ($('#empSearch')?.value || '').toLowerCase();
  const filtered = list.filter(e => !q || e.name.toLowerCase().includes(q) || e.position.toLowerCase().includes(q));
  const tb = $('#empTbody');
  if (!tb) return;
  if (filtered.length === 0) { tb.innerHTML = `<tr><td colspan="7" class="empty">Sin empleados</td></tr>`; return; }
  tb.innerHTML = filtered.map(e => `<tr>
    <td><code>${e.code}</code></td>
    <td>${e.name}</td>
    <td>${e.position}</td>
    <td>${e.dept}</td>
    <td>${e.email}</td>
    <td>${statusPill(e.status)}</td>
    <td class="actions-cell"><button class="btn sm">Ver</button></td>
  </tr>`).join('');
}

function employeeForm() {
  toast('Formulario de empleado en construcción. Use el módulo de Usuarios para gestión rápida.', 'info', 3000);
}

/* ============================================================
   CONTABILIDAD
   ============================================================ */
function renderAccounting() {
  const ingresos = db.accounting.filter(a => a.type === 'ingreso').reduce((s, a) => s + a.amount, 0);
  const egresos = db.accounting.filter(a => a.type === 'egreso').reduce((s, a) => s + a.amount, 0);
  const utilidad = ingresos - egresos;
  const html = `
    <div class="module-head">
      <h3>Contabilidad (Ingresos y Egresos)</h3>
      <div class="actions">
        <button class="btn primary" id="newMove">+ Nuevo movimiento</button>
      </div>
    </div>
    <div class="grid cols-4" style="margin-bottom:14px">
      <div class="kpi k-green"><div class="kpi-info"><div class="lbl">Ingresos totales</div><div class="val">${fmt.money(ingresos)}</div></div><div class="kpi-ico">${ico('arrowUp')}</div></div>
      <div class="kpi k-red"><div class="kpi-info"><div class="lbl">Egresos totales</div><div class="val">${fmt.money(egresos)}</div></div><div class="kpi-ico">${ico('arrowDown')}</div></div>
      <div class="kpi k-blue"><div class="kpi-info"><div class="lbl">Utilidad</div><div class="val">${fmt.money(utilidad)}</div></div><div class="kpi-ico">${ico('dashboard')}</div></div>
      <div class="kpi k-orange"><div class="kpi-info"><div class="lbl">Movimientos</div><div class="val">${db.accounting.length}</div></div><div class="kpi-ico">${ico('sales')}</div></div>
    </div>
    <div class="dt">
      <div class="dt-toolbar">
        <h3>Libro diario</h3>
        <div class="tools">
          <input class="search" id="accSearch" placeholder="Buscar..." />
          <select id="accType">
            <option value="">Todos</option>
            <option value="ingreso">Ingresos</option>
            <option value="egreso">Egresos</option>
          </select>
          <input type="month" id="accMonth" />
        </div>
      </div>
      <div class="dt-wrap">
        <table class="dt">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Descripción</th><th>Referencia</th><th class="num">Monto</th><th></th></tr></thead>
          <tbody id="accTbody"></tbody>
          <tfoot id="accFoot"></tfoot>
        </table>
      </div>
    </div>
  `;
  $('#dashContent').innerHTML = html;
  paintAccounting();
  ['accSearch', 'accType', 'accMonth'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', paintAccounting);
  });
  $('#newMove').addEventListener('click', accountingForm);
}

function paintAccounting() {
  const q = ($('#accSearch')?.value || '').toLowerCase();
  const t = $('#accType')?.value || '';
  const m = $('#accMonth')?.value || '';
  const list = db.accounting.filter(a => {
    if (t && a.type !== t) return false;
    if (m && !a.date.startsWith(m)) return false;
    if (q && !(a.description.toLowerCase().includes(q) || a.category.toLowerCase().includes(q) || a.ref.toLowerCase().includes(q))) return false;
    return true;
  });
  const tb = $('#accTbody');
  if (!tb) return;
  if (list.length === 0) { tb.innerHTML = `<tr><td colspan="7" class="empty">Sin movimientos</td></tr>`; }
  else tb.innerHTML = list.map(a => `<tr>
    <td>${fmt.date(a.date)}</td>
    <td><span class="pill ${a.type === 'ingreso' ? 'green' : 'red'}">${a.type}</span></td>
    <td>${a.category}</td>
    <td>${a.description}</td>
    <td><code>${a.ref}</code></td>
    <td class="num" style="color:${a.type === 'ingreso' ? 'var(--green)' : 'var(--red)'};font-weight:700">${a.type === 'ingreso' ? '+' : '-'}${fmt.money(a.amount)}</td>
    <td><button class="btn sm danger" data-del="${a.id}">${ico('close')}</button></td>
  </tr>`).join('');
  const totI = list.filter(a => a.type === 'ingreso').reduce((s, a) => s + a.amount, 0);
  const totE = list.filter(a => a.type === 'egreso').reduce((s, a) => s + a.amount, 0);
  $('#accFoot').innerHTML = `<tr class="row-total">
    <td colspan="5"><b>Totales</b></td>
    <td class="num"><b style="color:var(--green)">+${fmt.num(totI)}</b> &nbsp; <b style="color:var(--red)">-${fmt.num(totE)}</b></td>
    <td></td>
  </tr>`;
  $$('button[data-del]', tb).forEach(b => b.addEventListener('click', () => {
    if (!confirm('¿Eliminar este movimiento?')) return;
    db.accounting = db.accounting.filter(x => x.id !== +b.dataset.del);
    DB.save(db); paintAccounting(); toast('Movimiento eliminado', 'warn');
  }));
}

function accountingForm() {
  const catsI = ['Ventas', 'Cobranza', 'Otros ingresos', 'Servicios'];
  const catsE = ['Compras', 'Nómina', 'Servicios', 'Proveedores', 'Gastos administrativos', 'Impuestos', 'Otros egresos'];
  const html = `
    <div class="form-grid">
      <div class="field"><label>Fecha</label><input type="date" id="mvDate" value="${new Date().toISOString().slice(0,10)}" /></div>
      <div class="field"><label>Tipo</label>
        <select id="mvType"><option value="ingreso">Ingreso</option><option value="egreso">Egreso</option></select>
      </div>
      <div class="field"><label>Categoría</label>
        <select id="mvCat"></select>
      </div>
      <div class="field"><label>Monto</label><input type="number" step="0.01" id="mvAmt" value="0" /></div>
      <div class="field span-2"><label>Descripción</label><input id="mvDesc" placeholder="Detalle del movimiento" /></div>
      <div class="field"><label>Referencia</label><input id="mvRef" value="MOV-${Date.now().toString().slice(-6)}" /></div>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="mvSave">Registrar</button>`;
  openModal({ title: 'Nuevo movimiento contable', body: html, footer });
  const refreshCats = () => {
    const t = $('#mvType').value;
    const cats = t === 'ingreso' ? catsI : catsE;
    $('#mvCat').innerHTML = cats.map(c => `<option>${c}</option>`).join('');
  };
  setTimeout(() => {
    refreshCats();
    $('#mvType').addEventListener('change', refreshCats);
    $('#mvSave').addEventListener('click', () => {
      const m = {
        id: db.accounting.length + 1,
        date: $('#mvDate').value,
        type: $('#mvType').value,
        category: $('#mvCat').value,
        amount: parseFloat($('#mvAmt').value) || 0,
        description: $('#mvDesc').value,
        ref: $('#mvRef').value
      };
      if (m.amount <= 0) { toast('Monto inválido', 'error'); return; }
      db.accounting.unshift(m);
      DB.save(db); closeModal(); renderAccounting();
      toast('Movimiento registrado', 'success');
    });
  }, 60);
}

/* ============================================================
   CAJA Y BANCOS
   ============================================================ */
function renderCashbox() {
  const html = `
    <div class="module-head">
      <h3>Caja y Bancos</h3>
      <div class="actions">
        <button class="btn primary" id="newCash">+ Movimiento de caja</button>
      </div>
    </div>
    <div class="grid cols-3" style="margin-bottom:14px">
      <div class="kpi k-green"><div class="kpi-info"><div class="lbl">Caja actual</div><div class="val">${fmt.money(200 + db.cashbox.reduce((s, c) => s + c.amount, 0))}</div></div><div class="kpi-ico">${ico('cash')}</div></div>
      <div class="kpi k-blue"><div class="kpi-info"><div class="lbl">Banco</div><div class="val">${fmt.money(58420)}</div></div><div class="kpi-ico">${ico('cashbox')}</div></div>
      <div class="kpi k-orange"><div class="kpi-info"><div class="lbl">Movimientos</div><div class="val">${db.cashbox.length}</div></div><div class="kpi-ico">${ico('refresh')}</div></div>
    </div>
    <div class="dt">
      <div class="dt-toolbar"><h3>Movimientos de caja</h3></div>
      <div class="dt-wrap">
        <table class="dt">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Referencia</th><th class="num">Monto</th></tr></thead>
          <tbody id="cbTbody"></tbody>
        </table>
      </div>
    </div>
  `;
  $('#dashContent').innerHTML = html;
  $('#cbTbody').innerHTML = db.cashbox.map(c => `<tr>
    <td>${c.date}</td>
    <td><span class="pill ${c.amount >= 0 ? 'green' : 'red'}">${c.type}</span></td>
    <td>${c.description}</td>
    <td><code>${c.ref}</code></td>
    <td class="num" style="color:${c.amount >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:700">${c.amount >= 0 ? '+' : ''}${fmt.money(c.amount)}</td>
  </tr>`).join('');
  $('#newCash').addEventListener('click', cashForm);
}

function cashForm() {
  const html = `
    <div class="form-grid">
      <div class="field"><label>Fecha</label><input type="date" id="cbDate" value="${new Date().toISOString().slice(0,10)}" /></div>
      <div class="field"><label>Tipo</label>
        <select id="cbType"><option value="apertura">Apertura</option><option value="retiro">Retiro</option><option value="ingreso">Ingreso</option><option value="cierre">Cierre</option></select>
      </div>
      <div class="field span-2"><label>Descripción</label><input id="cbDesc" /></div>
      <div class="field"><label>Monto (positivo o negativo)</label><input type="number" step="0.01" id="cbAmt" value="0" /></div>
      <div class="field"><label>Referencia</label><input id="cbRef" value="CB-${Date.now().toString().slice(-6)}" /></div>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="cbSave">Registrar</button>`;
  openModal({ title: 'Movimiento de caja', body: html, footer });
  setTimeout(() => {
    $('#cbSave').addEventListener('click', () => {
      const c = {
        id: db.cashbox.length + 1,
        date: $('#cbDate').value + ' ' + new Date().toTimeString().slice(0,5),
        type: $('#cbType').value,
        description: $('#cbDesc').value,
        amount: parseFloat($('#cbAmt').value) || 0,
        ref: $('#cbRef').value
      };
      db.cashbox.unshift(c);
      DB.save(db); closeModal(); renderCashbox();
      toast('Movimiento registrado', 'success');
    });
  }, 60);
}

/* ============================================================
   REPORTES
   ============================================================ */
function renderReports() {
  const html = `
    <div class="module-head">
      <h3>Reportes</h3>
    </div>
    <div class="grid cols-3">
      <div class="card" style="cursor:pointer" onclick="reportInventory()">
        <h3 class="card-title">${ico('purchases')} Reporte de inventario</h3>
        <p style="color:#6b7280;font-size:13px">Listado completo de productos con stock, valorización y alertas.</p>
        <button class="btn primary" style="margin-top:8px">Generar</button>
      </div>
      <div class="card" style="cursor:pointer" onclick="reportSales()">
        <h3 class="card-title">${ico('cxc')} Reporte de ventas</h3>
        <p style="color:#6b7280;font-size:13px">Ventas por período, vendedor, cliente o producto.</p>
        <button class="btn primary" style="margin-top:8px">Generar</button>
      </div>
      <div class="card" style="cursor:pointer" onclick="reportCxC()">
        <h3 class="card-title">${ico('dashboard')} Estado de cuenta (CxC)</h3>
        <p style="color:#6b7280;font-size:13px">Saldos pendientes por cliente, antigüedad de deuda.</p>
        <button class="btn primary" style="margin-top:8px">Generar</button>
      </div>
      <div class="card" style="cursor:pointer" onclick="reportPL()">
        <h3 class="card-title">${ico('reports')} Estado de resultados</h3>
        <p style="color:#6b7280;font-size:13px">Ingresos vs Egresos — utilidad del período.</p>
        <button class="btn primary" style="margin-top:8px">Generar</button>
      </div>
      <div class="card" style="cursor:pointer" onclick="reportPurchases()">
        <h3 class="card-title">${ico('pos')} Compras por proveedor</h3>
        <p style="color:#6b7280;font-size:13px">Resumen de compras agrupado por proveedor.</p>
        <button class="btn primary" style="margin-top:8px">Generar</button>
      </div>
      <div class="card" style="cursor:pointer" onclick="reportTop()">
        <h3 class="card-title">${ico('trophy')} Productos más vendidos</h3>
        <p style="color:#6b7280;font-size:13px">Ranking de productos por rotación.</p>
        <button class="btn primary" style="margin-top:8px">Generar</button>
      </div>
    </div>
  `;
  $('#dashContent').innerHTML = html;
}

function reportInventory() {
  const plist = db.products.map(p => { canonicalizeProduct(p); return p; });
  const total = plist.reduce((s, p) => s + invBaseWhole(p) * invDefaultPrice(p), 0);
  const units = plist.reduce((s, p) => s + invStock(p), 0);
  const csvRows = plist.map(p => `${p.code},"${String(p.name).replace(/"/g, '""')}",${p.category},${invStock(p)},${invDefaultPrice(p)},${(invBaseWhole(p) * invDefaultPrice(p)).toFixed(6)}`).join('\n');
  openModal({ title: 'Reporte de inventario', size: 'modal-lg', body: `
    <div style="display:flex;gap:14px;margin-bottom:12px">
      <div class="kpi" style="flex:1"><div class="kpi-info"><div class="lbl">Total productos</div><div class="val">${plist.length}</div></div></div>
      <div class="kpi" style="flex:1"><div class="kpi-info"><div class="lbl">Unidades (canónicas)</div><div class="val">${units.toFixed(0)}</div></div></div>
      <div class="kpi" style="flex:1"><div class="kpi-info"><div class="lbl">Valor total</div><div class="val">${fmt.money(total)}</div></div></div>
    </div>
    <div class="dt-wrap" style="max-height:400px;overflow:auto">
      <table class="dt">
        <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th>Stock</th><th class="num">Precio (pres. base)</th><th class="num">Valor</th></tr></thead>
        <tbody>${plist.map(p => `<tr><td><code>${p.code}</code></td><td>${p.name}</td><td>${p.category}</td><td>${invBreakdown(p, invStock(p))} <small>(${invStock(p)} ${invBaseUnit(p)})</small></td><td class="num">${fmt.moneyDyn(invDefaultPrice(p))} <small>${unitAbbrPlural(invBasePres(p).unidad)}</small></td><td class="num">${fmt.money(invBaseWhole(p) * invDefaultPrice(p))}</td></tr>`).join('')}</tbody>
      </table>
    </div>
  `, footer: `<button class="btn" onclick="closeModal()">Cerrar</button>
              <button class="btn primary" onclick="exportReport('inventario',${JSON.stringify(csvRows).replace(/"/g, '&quot;')})">Exportar CSV</button>` });
}

function reportSales() {
  const total = db.sales.reduce((s, x) => s + x.total, 0);
  openModal({ title: 'Reporte de ventas', size: 'modal-lg', body: `
    <p style="color:#6b7280">Total: <b>${fmt.money(total)}</b> en ${db.sales.length} operaciones</p>
    <div class="dt-wrap" style="max-height:400px;overflow:auto">
      <table class="dt">
        <thead><tr><th>Fecha</th><th>Recibo</th><th>Cliente</th><th class="num">Items</th><th class="num">Total</th><th>Estado</th></tr></thead>
        <tbody>${db.sales.map(s => `<tr><td>${s.date}</td><td><code>${s.number}</code></td><td>${s.client}</td><td class="num">${s.items}</td><td class="num">${fmt.money(s.total)}</td><td>${statusPill(s.status)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
  `, footer: `<button class="btn" onclick="closeModal()">Cerrar</button>` });
}

function reportCxC() {
  openModal({ title: 'Estado de cuentas por cobrar', size: 'modal-lg', body: `
    <div class="dt-wrap" style="max-height:400px;overflow:auto">
      <table class="dt">
        <thead><tr><th>Cliente</th><th>Documento</th><th>Vence</th><th class="num">Total</th><th class="num">Saldo</th><th>Estado</th></tr></thead>
        <tbody>${db.receivables.map(r => `<tr><td>${r.client}</td><td><code>${r.docNumber}</code></td><td>${fmt.date(r.dueDate)}</td><td class="num">${fmt.money(r.total)}</td><td class="num"><b>${fmt.money(r.balance)}</b></td><td>${statusPill(r.status)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
  `, footer: `<button class="btn" onclick="closeModal()">Cerrar</button>` });
}

function reportPL() {
  const i = db.accounting.filter(a => a.type === 'ingreso').reduce((s, a) => s + a.amount, 0);
  const e = db.accounting.filter(a => a.type === 'egreso').reduce((s, a) => s + a.amount, 0);
  openModal({ title: 'Estado de resultados', body: `
    <table class="dt" style="width:100%">
      <tbody>
        <tr><td><b>Ingresos</b></td><td class="num" style="color:var(--green);font-weight:700">${fmt.money(i)}</td></tr>
        <tr><td><b>(Egresos)</b></td><td class="num" style="color:var(--red);font-weight:700">${fmt.money(e)}</td></tr>
        <tr class="row-total"><td><b>UTILIDAD NETA</b></td><td class="num" style="font-size:18px;color:${i-e>=0?'var(--green)':'var(--red)'}">${fmt.money(i - e)}</td></tr>
      </tbody>
    </table>
  `, footer: `<button class="btn" onclick="closeModal()">Cerrar</button>` });
}

function reportPurchases() {
  const grouped = {};
  db.purchases.forEach(p => { grouped[p.supplier] = (grouped[p.supplier] || 0) + p.total; });
  openModal({ title: 'Compras por proveedor', body: `
    <table class="dt" style="width:100%">
      <thead><tr><th>Proveedor</th><th class="num">Total comprado</th><th class="num">%</th></tr></thead>
      <tbody>${Object.entries(grouped).map(([s, t]) => `<tr><td>${s}</td><td class="num">${fmt.money(t)}</td><td class="num">${((t / Object.values(grouped).reduce((a, b) => a + b, 0)) * 100).toFixed(1)}%</td></tr>`).join('')}</tbody>
    </table>
  `, footer: `<button class="btn" onclick="closeModal()">Cerrar</button>` });
}

function reportTop() {
  const top = db.products.map(p => { canonicalizeProduct(p); return p; }).sort((a, b) => invStock(b) - invStock(a)).slice(0, 10);
  openModal({ title: 'Top 10 productos', body: `
    <table class="dt" style="width:100%">
      <thead><tr><th>#</th><th>Producto</th><th>Categoría</th><th>Stock</th><th class="num">Precio/unidad</th></tr></thead>
      <tbody>${top.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}</td><td>${p.category}</td><td>${invStock(p)} ${invBaseUnit(p)}</td><td class="num">${fmt.moneyDyn(invUnitPrice(p))}</td></tr>`).join('')}</tbody>
    </table>
  `, footer: `<button class="btn" onclick="closeModal()">Cerrar</button>` });
}

function exportReport(name, csvBody) {
  const csv = 'Codigo,Descripcion,Categoria,Stock,Precio,Valor\n' + csvBody;
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name + '.csv'; a.click();
  toast('Reporte exportado', 'success');
}

/* ============================================================
   USUARIOS
   ============================================================ */
function renderUsers() {
  const html = `
    <div class="module-head">
      <h3>Usuarios del sistema</h3>
      <div class="actions">
        <button class="btn primary" id="newUser">+ Nuevo usuario</button>
      </div>
    </div>
    <div class="dt">
      <div class="dt-toolbar">
        <h3>Listado de usuarios</h3>
        <div class="tools"><input class="search" id="usrSearch" placeholder="Buscar..." /></div>
      </div>
      <div class="dt-wrap">
        <table class="dt">
          <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Email</th><th>Sucursal</th><th>Último acceso</th><th>Estado</th><th></th></tr></thead>
          <tbody id="usrTbody"></tbody>
        </table>
      </div>
    </div>
  `;
  $('#dashContent').innerHTML = html;
  paintUsers();
  $('#usrSearch').addEventListener('input', paintUsers);
  $('#newUser').addEventListener('click', () => userForm());
}

function paintUsers() {
  const q = ($('#usrSearch')?.value || '').toLowerCase();
  const list = db.users.filter(u => !q || u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.role.toLowerCase().includes(q));
  const tb = $('#usrTbody');
  if (!tb) return;
  tb.innerHTML = list.map(u => `<tr>
    <td><code>${u.username}</code></td>
    <td><b>${u.name}</b></td>
    <td><span class="pill ${u.role === 'admin' ? 'red' : u.role === 'supervisor' ? 'blue' : 'green'}">${u.role}</span></td>
    <td>${u.email}</td>
    <td>${u.branch}</td>
    <td><small>${u.lastLogin || '—'}</small></td>
    <td>${statusPill(u.status)}</td>
    <td class="actions-cell">
      <button class="btn sm" data-edit="${u.id}">Editar</button>
      <button class="btn sm" data-st="${u.id}">${u.status === 'active' ? 'Desactivar' : 'Activar'}</button>
    </td>
  </tr>`).join('');
  $$('button[data-edit]', tb).forEach(b => b.addEventListener('click', () => userForm(+b.dataset.edit)));
  $$('button[data-st]', tb).forEach(b => b.addEventListener('click', () => {
    const u = db.users.find(x => x.id === +b.dataset.st);
    u.status = u.status === 'active' ? 'inactive' : 'active';
    DB.save(db); paintUsers(); toast('Estado actualizado', 'success');
  }));
}

function userForm(id) {
  const u = id ? db.users.find(x => x.id === id) : { username: '', name: '', role: 'cashier', email: '', branch: 'Principal', status: 'active' };
  const html = `
    <div class="form-grid">
      <div class="field"><label>Usuario (login)</label><input id="uUser" value="${u.username}" /></div>
      <div class="field"><label>Nombre completo</label><input id="uName" value="${u.name}" /></div>
      <div class="field"><label>Rol</label>
        <select id="uRole"><option ${u.role==='admin'?'selected':''}>admin</option><option ${u.role==='supervisor'?'selected':''}>supervisor</option><option ${u.role==='cashier'?'selected':''}>cashier</option><option ${u.role==='warehouse'?'selected':''}>warehouse</option></select>
      </div>
      <div class="field"><label>Sucursal</label>
        <select id="uBr">${db.settings.branches.map(b => `<option ${u.branch===b?'selected':''}>${b}</option>`).join('')}</select>
      </div>
      <div class="field span-2"><label>Email</label><input id="uEmail" value="${u.email}" /></div>
      <div class="field"><label>Contraseña</label><input type="password" id="uPass" placeholder="${id ? '(dejar vacío para no cambiar)' : ''}" /></div>
      <div class="field"><label>Estado</label>
        <select id="uSt"><option value="active" ${u.status==='active'?'selected':''}>Activo</option><option value="inactive" ${u.status==='inactive'?'selected':''}>Inactivo</option></select>
      </div>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="uSave">Guardar</button>`;
  openModal({ title: id ? 'Editar usuario' : 'Nuevo usuario', body: html, footer, size: 'modal-lg' });
  setTimeout(() => {
    $('#uSave').addEventListener('click', () => {
      const data = {
        username: $('#uUser').value, name: $('#uName').value,
        role: $('#uRole').value, branch: $('#uBr').value,
        email: $('#uEmail').value, status: $('#uSt').value
      };
      if (id) Object.assign(u, data);
      else db.users.push({ id: Date.now(), ...data, lastLogin: '—' });
      DB.save(db); closeModal(); renderUsers();
      toast('Usuario guardado', 'success');
    });
  }, 60);
}

/* ============================================================
   CONFIGURACIÓN
   ============================================================ */
function renderSettings() {
  const s = db.settings;
  const html = `
    <div class="module-head"><h3>Configuración del sistema</h3></div>
    <div class="tabs">
      <div class="tab active" data-tab="company">Empresa</div>
      <div class="tab" data-tab="tax">Impuestos</div>
      <div class="tab" data-tab="invoice">Facturación</div>
      <div class="tab" data-tab="pos">Punto de Venta</div>
      <div class="tab" data-tab="units">Unidades</div>
      <div class="tab" data-tab="data">Datos</div>
    </div>
    <div id="settingsContent"></div>
  `;
  $('#dashContent').innerHTML = html;

  const paintTab = (tab) => {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    const c = $('#settingsContent');
    if (tab === 'company') c.innerHTML = `
      <div class="card">
        <h3 class="card-title">Datos de la empresa</h3>
        <div class="form-grid">
          <div class="field span-2"><label>Razón social</label><input id="coName" value="${s.company.name}" /></div>
          <div class="field"><label>RIF</label><input id="coRif" value="${s.company.rif}" /></div>
          <div class="field"><label>Teléfono</label><input id="coPh" value="${s.company.phone}" /></div>
          <div class="field span-2"><label>Dirección</label><input id="coAddr" value="${s.company.address}" /></div>
          <div class="field"><label>Email</label><input id="coEm" value="${s.company.email}" /></div>
          <div class="field"><label>Sitio web</label><input id="coWeb" value="${s.company.website}" /></div>
        </div>
        <div style="margin-top:12px"><button class="btn primary" id="saveCo">Guardar cambios</button></div>
      </div>
    `;
    if (tab === 'tax') c.innerHTML = `
      <div class="card">
        <h3 class="card-title">Configuración de impuestos</h3>
        <div class="form-grid">
          <div class="field"><label>Nombre del impuesto</label><input id="txName" value="${s.tax.name}" /></div>
          <div class="field"><label>Tasa (%)</label><input type="number" step="0.01" id="txRate" value="${s.tax.rate}" /></div>
          <div class="field span-2"><label><input type="checkbox" id="txInc" ${s.tax.included ? 'checked' : ''}/> Los precios ya incluyen el impuesto</label></div>
        </div>
        <div style="margin-top:12px"><button class="btn primary" id="saveTx">Guardar</button></div>
      </div>
    `;
    if (tab === 'invoice') c.innerHTML = `
      <div class="card">
        <h3 class="card-title">Numeración de facturas</h3>
        <div class="form-grid">
          <div class="field"><label>Prefijo</label><input id="ivPre" value="${s.invoice.prefix}" /></div>
          <div class="field"><label>Próximo número</label><input type="number" id="ivNext" value="${s.invoice.nextNumber}" /></div>
          <div class="field"><label>Decimales</label><input type="number" min="0" max="4" id="ivDec" value="${s.invoice.decimals}" /></div>
        </div>
        <div style="margin-top:12px"><button class="btn primary" id="saveIv">Guardar</button></div>
      </div>
    `;
    if (tab === 'pos') c.innerHTML = `
      <div class="card">
        <h3 class="card-title">Comportamiento del POS</h3>
        <div class="form-grid">
          <div class="field"><label><input type="checkbox" id="poPrint" ${s.pos.printAfterSale ? 'checked' : ''}/> Imprimir recibo al cobrar</label></div>
          <div class="field"><label><input type="checkbox" id="poDrw" ${s.pos.openDrawerAfterSale ? 'checked' : ''}/> Abrir gaveta al cobrar</label></div>
          <div class="field"><label><input type="checkbox" id="poReq" ${s.pos.requireCustomer ? 'checked' : ''}/> Requerir cliente</label></div>
          <div class="field"><label><input type="checkbox" id="poNeg" ${s.pos.allowNegativeStock ? 'checked' : ''}/> Permitir stock negativo</label></div>
          <div class="field"><label>Cliente por defecto</label><input id="poCus" value="${s.pos.defaultCustomer}" /></div>
          <div class="field"><label>Tasa de cambio Bs/USD</label><input type="number" step="0.01" id="poRate" value="${s.pos.usdRate || 36}" /></div>
          <div class="field span-2"><label>Pie de recibo</label><textarea id="poFt" rows="3">${s.pos.receiptFooter}</textarea></div>
        </div>
        <div style="margin-top:12px"><button class="btn primary" id="savePo">Guardar</button></div>
      </div>
    `;
    if (tab === 'data') c.innerHTML = `
      <div class="card">
        <h3 class="card-title">Gestión de datos</h3>
        <p style="color:#6b7280">Toda la información se almacena localmente en este navegador (localStorage).</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button class="btn" id="expAll">${ico('export')} Exportar respaldo (JSON)</button>
          <button class="btn" id="impAll">${ico('import')} Importar respaldo</button>
          <button class="btn danger" id="rstAll">${ico('reset')} Restablecer datos de demo</button>
          <input type="file" id="fileImp" accept=".json" style="display:none" />
        </div>
        <div style="margin-top:16px;padding:12px;background:#fef3c7;border-radius:6px;border:1px solid #fbbf24">
          <b>${ico('dashboard')} Estadísticas de la base de datos</b>
          <ul style="margin:8px 0 0 16px;color:#78350f">
            <li>Productos: ${db.products.length}</li>
            <li>Clientes: ${db.clients.length}</li>
            <li>Proveedores: ${db.suppliers.length}</li>
            <li>Ventas: ${db.sales.length}</li>
            <li>Compras: ${db.purchases.length}</li>
            <li>Movimientos contables: ${db.accounting.length}</li>
            <li>Usuarios: ${db.users.length}</li>
          </ul>
        </div>
      </div>
    `;
    // Binds
    if (tab === 'units') {
      ensureUnitsCatalog();
      const escU = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const typesOpt = (sel) => INV_TYPES.map(t => `<option value="${t.k}" ${sel === t.k ? 'selected' : ''}>${t.lbl}</option>`).join('');
      const grid = 'display:grid;grid-template-columns:1fr 1fr 1fr 1fr 56px 70px;gap:6px;align-items:center';
      let rows = db.units.map(u => ({ id: u.id, name: u.name, symbol: u.symbol, type: u.type }));
      const removed = [];
      c.innerHTML = `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <h3 class="card-title" style="margin:0">Unidades de inventario</h3>
            <button class="btn sm primary" id="unAdd">+ Nueva unidad</button>
          </div>
          <p style="color:#6b7280;font-size:12px;margin:0 0 12px">Las presentaciones (Base y de venta) usan unidades de este catálogo. La columna "En uso" indica si un producto la referencia; esas no pueden eliminarse.</p>
          <div style="${grid};font-size:11px;color:#6b7280;font-weight:600;padding:0 2px 6px">
            <span>Nombre</span><span>Símbolo</span><span>Tipo</span><span>En uso</span><span></span><span>ID</span>
          </div>
          <div id="unRows"></div>
          <div style="margin-top:12px"><button class="btn primary" id="unSave">Guardar cambios</button></div>
        </div>`;
      const paintRows = () => {
        const box = $('#unRows'); if (!box) return;
        box.innerHTML = '';
        rows.forEach((u, i) => {
          const r = document.createElement('div');
          r.style.cssText = grid + ';margin-bottom:4px';
          const inUse = unitInUse(u.name);
          r.innerHTML = `
            <input class="un-name" value="${escU(u.name)}" data-i="${i}" placeholder="Nombre de la unidad" />
            <input class="un-sym" value="${escU(u.symbol)}" data-i="${i}" />
            <select class="un-type" data-i="${i}">${typesOpt(u.type)}</select>
            <span style="font-size:11px;color:${inUse ? '#15803d' : '#9ca3af'}">${inUse ? 'Si' : 'No'}</span>
            <button type="button" class="btn sm danger un-del" data-i="${i}" title="Eliminar">&times;</button>
            <span style="font-size:11px;color:#9ca3af">${u.id == null ? 'nuevo' : '#' + u.id}</span>`;
          box.appendChild(r);
        });
        box.querySelectorAll('.un-name').forEach(inp => inp.addEventListener('input', () => rows[+inp.dataset.i].name = inp.value));
        box.querySelectorAll('.un-sym').forEach(inp => inp.addEventListener('input', () => rows[+inp.dataset.i].symbol = inp.value));
        box.querySelectorAll('.un-type').forEach(sel => sel.addEventListener('change', () => rows[+sel.dataset.i].type = sel.value));
        box.querySelectorAll('.un-del').forEach(btn => btn.addEventListener('click', () => {
          const u = rows[+btn.dataset.i];
          if (u.id != null) removed.push(u.id);
          rows.splice(+btn.dataset.i, 1);
          paintRows();
        }));
      };
      $('#unAdd').addEventListener('click', () => { rows.push({ id: null, name: '', symbol: '', type: 'unit' }); paintRows(); });
      $('#unSave').addEventListener('click', () => {
        try {
          removed.forEach(id => unitRemove(id));
          removed.length = 0;
          rows.forEach(u => {
            if (!u.name.trim()) throw new Error('El nombre de cada unidad es obligatorio');
            if (u.id == null) unitCreate({ name: u.name, symbol: u.symbol, type: u.type });
            else unitUpdate(u.id, { name: u.name, symbol: u.symbol, type: u.type });
          });
          toast('Unidades guardadas', 'success');
        } catch (e) { toast(e.message || 'Error al guardar unidades', 'error'); }
      });
      paintRows();
    }
    if (tab === 'company') $('#saveCo')?.addEventListener('click', () => {
      s.company.name = $('#coName').value; s.company.rif = $('#coRif').value;
      s.company.phone = $('#coPh').value; s.company.address = $('#coAddr').value;
      s.company.email = $('#coEm').value; s.company.website = $('#coWeb').value;
      DB.save(db); toast('Configuración guardada', 'success');
    });
    if (tab === 'tax') $('#saveTx')?.addEventListener('click', () => {
      s.tax.name = $('#txName').value; s.tax.rate = parseFloat($('#txRate').value) || 0;
      s.tax.included = $('#txInc').checked;
      DB.save(db); toast('Impuestos actualizados', 'success');
    });
    if (tab === 'invoice') $('#saveIv')?.addEventListener('click', () => {
      s.invoice.prefix = $('#ivPre').value; s.invoice.nextNumber = parseInt($('#ivNext').value) || 1;
      s.invoice.decimals = parseInt($('#ivDec').value) || 2;
      DB.save(db); toast('Facturación actualizada', 'success');
    });
    if (tab === 'pos') $('#savePo')?.addEventListener('click', () => {
      s.pos.printAfterSale = $('#poPrint').checked;
      s.pos.openDrawerAfterSale = $('#poDrw').checked;
      s.pos.requireCustomer = $('#poReq').checked;
      s.pos.allowNegativeStock = $('#poNeg').checked;
      s.pos.defaultCustomer = $('#poCus').value;
      s.pos.usdRate = parseFloat($('#poRate').value) || 36;
      s.pos.receiptFooter = $('#poFt').value;
      DB.save(db); toast('POS configurado', 'success');
    });
    if (tab === 'data') {
      $('#expAll')?.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'possystem-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        toast('Respaldo descargado', 'success');
      });
      $('#impAll')?.addEventListener('click', () => $('#fileImp').click());
      $('#fileImp')?.addEventListener('change', (e) => {
        const f = e.target.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            if (confirm('¿Reemplazar todos los datos con los del archivo?')) {
              Object.assign(db, data);
              DB.save(db);
              toast('Datos importados. Recargando...', 'success');
              setTimeout(() => location.reload(), 1200);
            }
          } catch (err) { toast('Archivo inválido', 'error'); }
        };
        r.readAsText(f);
      });
      $('#rstAll')?.addEventListener('click', () => {
        if (!confirm('Esto borrará todos los datos y restaurará los de demo. ¿Continuar?')) return;
        DB.reset(); location.reload();
      });
    }
  };

  $$('.tab').forEach(t => t.addEventListener('click', () => paintTab(t.dataset.tab)));
  paintTab('company');
}
