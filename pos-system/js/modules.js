/* ============================================================
   modules.js — Vistas de los módulos administrativos
   ============================================================ */

/* ============================================================
   COMPRAS (Entradas)
   ============================================================ */
/* Forma de pago de una compra: Contado / Crédito / Mixto (admite legado 'cash'). */
const purPayLabel = (v) => v === 'cash' || v === 'contado' ? 'Contado' : v === 'mixto' ? 'Mixto' : 'Crédito';
const purPayPill = (v) => {
  if (v === 'cash' || v === 'contado') return '<span class="pill green">Contado</span>';
  if (v === 'mixto') return '<span class="pill blue">Mixto</span>';
  return '<span class="pill yellow">Crédito</span>';
};

function renderPurchases() {
  const html = `
    <div class="module-head">
      <h3>Historial de Compras</h3>
      <div class="actions">
        <button class="btn primary" id="newPurchase">+ Nueva compra</button>
      </div>
    </div>

    <div class="grid cols-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-info"><div class="lbl">Total comprado (USD)</div><div class="val">${fmt.money(db.purchases.reduce((s, p) => s + p.total, 0))}</div></div><div class="kpi-ico">${ico('purchases')}</div></div>
      <div class="kpi k-blue"><div class="kpi-info"><div class="lbl">Compras registradas</div><div class="val">${db.purchases.length}</div></div><div class="kpi-ico">${ico('docs')}</div></div>
      <div class="kpi k-green"><div class="kpi-info"><div class="lbl">Contado</div><div class="val">${db.purchases.filter(p => p.payment === 'contado' || p.payment === 'cash').length}</div></div><div class="kpi-ico">${ico('check')}</div></div>
      <div class="kpi k-red"><div class="kpi-info"><div class="lbl">Crédito / Mixto</div><div class="val">${db.purchases.filter(p => p.payment === 'credit' || p.payment === 'mixto').length}</div></div><div class="kpi-ico">${ico('cxp')}</div></div>
    </div>

    <div class="dt">
      <div class="dt-toolbar">
        <h3>Historial de compras</h3>
        <div class="tools">
          <input class="search" id="purSearch" placeholder="Buscar por proveedor, factura..." />
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
  $('#newPurchase').addEventListener('click', () => { if (isDemo()) { demoBlock('Version Demo: no se permiten nuevas compras. Adquiera la version completa.'); return; } purchaseForm(); });
}

function paintPurchases() {
  const q = ($('#purSearch')?.value || '').toLowerCase();
  const list = db.purchases.filter(p => {
    if (q && !p.supplier.toLowerCase().includes(q) && !p.invoice.toLowerCase().includes(q)) return false;
    return true;
  });
  const tb = $('#purTbody');
  if (!tb) return;
  if (list.length === 0) { tb.innerHTML = `<tr><td colspan="7" class="empty">Sin resultados</td></tr>`; return; }
  tb.innerHTML = list.map(p => `
    <tr>
      <td>${fmt.date(p.date)}</td>
      <td>${p.supplier}</td>
      <td><code>${p.invoice}</code></td>
      <td class="num">${p.items}</td>
      <td class="num">${fmt.money(p.total)}</td>
      <td>${purPayPill(p.payment)}</td>
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
  $$('button[data-view]', tb).forEach(b => b.addEventListener('click', () => viewPurchase(+b.dataset.view)));
}

/* Modal con el detalle completo de una compra (items, cantidades, costos, totales y pago). */
function viewPurchase(id) {
  const p = db.purchases.find(x => x.id === id);
  if (!p) return;
  const rate = Number(p.rate) || fmt.usdRate();
  const det = Array.isArray(p.detail) ? p.detail : [];
  const baseOf = (d) => d.base || (() => { const pr = db.products.find(pr => String(pr.code) === String(d.code)); return pr ? invBaseUnit(pr) : 'und'; })();
  const itemsRows = det.length === 0
    ? '<tr><td colspan="8" class="empty">Sin detalle de productos</td></tr>'
    : det.map((d, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td><code>${d.code || ''}</code></td>
        <td>${d.name}</td>
        <td class="num">${fmtNumK(d.qty)} ${d.entry || ''}</td>
        <td class="num">${fmtNumK(d.baseQty)} ${baseOf(d)}</td>
        <td class="num">${fmt.moneyDyn(d.cost)}</td>
        <td class="num">${fmt.money(d.baseQty * d.cost)}</td>
      </tr>`).join('');

  const payBlock = `
    <div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span>Forma de pago</span><b>${purPayLabel(p.payment)}${p.days ? ' · ' + p.days + ' días' : ''}</b></div>
    ${p.payment === 'mixto' ? `
      <div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span>Contado en Bs.</span><b>Bs. ${fmt.esp(p.paidBs || 0)}</b></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span>Contado en USD (equiv.)</span><b>${fmt.money(p.paidUsd || 0)}</b></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span>Saldo a crédito (CxP)</span><b>${fmt.money(p.creditUSD || 0)}</b></div>` : ''}
  `;

  openModal({ title: 'Compra ' + p.invoice, body: `
    <div class="form-grid" style="margin-bottom:12px">
      <div class="field"><label>Fecha</label><input value="${fmt.date(p.date)}" disabled style="background:#f3f4f6" /></div>
      <div class="field"><label>Proveedor</label><input value="${p.supplier}" disabled style="background:#f3f4f6" /></div>
      <div class="field"><label>Factura proveedor</label><input value="${p.invoice}" disabled style="background:#f3f4f6;font-family:Consolas,monospace" /></div>
      <div class="field"><label>N° de productos</label><input value="${p.items} (${det.length} líneas)" disabled style="background:#f3f4f6" /></div>
      <div class="field"><label>Tasa BCV</label><input value="${fmt.num(rate)} Bs/USD" disabled style="background:#f3f4f6;font-family:Consolas,monospace" /></div>
    </div>
    <b style="font-size:12px;color:#1f2937">Productos / líneas (${det.length})</b>
    <div class="dt-wrap" style="max-height:260px;overflow:auto;margin:6px 0 12px;border:1px solid #e2e6ec;border-radius:8px">
      <table class="dt">
        <thead><tr><th>#</th><th>Código</th><th>Descripción</th><th class="num">Cant. entrada</th><th class="num">Entra al stock</th><th class="num">Costo/base</th><th class="num">Subtotal</th></tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start">
      <div>${payBlock}</div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px">
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span>Total factura (USD)</span><b>${fmt.money(p.total)}</b></div>
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span>Total factura (Bs.)</span><b>Bs. ${fmt.esp((p.total || 0) * rate)}</b></div>
        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:800;padding:4px 0 0;border-top:1px dashed #bbf7d0;color:#15803d"><span>Total</span><b>${fmt.money(p.total)}</b></div>
      </div>
    </div>
  `, footer: `<button class="btn" onclick="viewPurchasePrint(${p.id})">${ico('print')} Imprimir</button>
              <button class="btn primary" onclick="closeModal()">Cerrar</button>`, size: 'modal-lg' });
}

/* Imprime un comprobante 80mm de la compra usando la plantilla térmica compartida. */
function viewPurchasePrint(id) {
  const p = db.purchases.find(x => x.id === id);
  if (!p) return;
  const c = db.settings.company;
  const rate = Number(p.rate) || fmt.usdRate();
  const det = Array.isArray(p.detail) ? p.detail : [];
  const baseOf = (d) => d.base || 'und';
  const lns = [];
  const push = (t) => lns.push(t);
  push(recPadC(c.name));
  if (c.rif) push(recPadC('RIF: ' + c.rif));
  push('');
  push(recPadC('COMPRA / ENTRADA'));
  push('');
  push(recPadLR('Factura:', p.invoice));
  push(recPadLR('Fecha:', fmt.date(p.date)));
  push(recPadLR('Proveedor:', String(p.supplier).slice(0, 20)));
  push(recPadLR('Pago:', purPayLabel(p.payment) + (p.days ? ' (' + p.days + ' d)' : '')));
  push(recSep());
  det.forEach(d => {
    push((String(d.name || '') + '  ' + (d.code || '')).slice(0, REC.chars));
    const cont = '   ' + fmtNumK(d.qty) + ' ' + (d.entry || '') + ' x $' + fmt.num(d.cost);
    push(recPadLR(cont.slice(0, REC.chars), fmt.num(d.baseQty * d.cost)));
  });
  push(recSep());
  push(recPadLR('TOTAL USD', fmt.money(p.total)));
  push(recPadLR('TOTAL Bs.', 'Bs. ' + fmt.esp((p.total || 0) * rate)));
  push(recSep());
  if (p.payment === 'mixto') {
    push(recPadLR('Contado', fmt.money(p.paidUsd || 0)));
    push(recPadLR('Saldo crédito', fmt.money(p.creditUSD || 0)));
    push(recSep());
  }
  printHtml(thermalShell('Compra ' + p.invoice, lns));
}

function purchaseForm() {
  const buyOpts = (p) => {
    if (!p) return [];
    canonicalizeProduct(p);
    return invSaleViews(p).map(v => ({ key: v.unidad, entry: v.unidad, factor: v.equiv, precio: v.precio }));
  };
  const sysRate = fmt.usdRate();
  const html = `
    <div class="form-grid">
      <div class="field"><label>Fecha</label><input type="date" id="pfDate" value="${veDate()}" /></div>
      <div class="field"><label>Proveedor</label>
        <select id="pfSupplier">${db.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select>
      </div>
      <div class="field"><label>N° Factura proveedor</label><input id="pfInvoice" placeholder="P-2025-..." /></div>
      <div class="field"><label>Forma de pago</label>
        <select id="pfPay">
          <option value="contado">Contado</option>
          <option value="credit" selected>Crédito</option>
          <option value="mixto">Mixto</option>
        </select>
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

    <div class="card-title" style="margin-top:14px">Condiciones de pago</div>
    <div id="pfPaySummary" style="margin-top:6px;padding:10px 12px;background:#f8fafc;border:1px solid #e0e7ef;border-radius:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span id="pfPayLabel" style="font-weight:600">Crédito · 30 días · Tasa ${fmt.num(sysRate)} Bs/USD</span>
        <button class="btn sm" id="pfPayConfig">${ico('cashbox')} Configurar pago</button>
      </div>
      <div id="pfPayDetail" style="font-size:12px;color:#6b7280;margin-top:4px"></div>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="pfSave">Registrar compra</button>`;
  openModal({ title: 'Nueva compra', body: html, footer, size: 'modal-lg' });
  const state = { items: [], rate: sysRate, days: 30, cashBs: 0, cashUsd: 0 };
  const num = (s) => parseFloat(String(s == null ? '' : s).replace(',', '.')) || 0;
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
  const itemTotal = () => state.items.reduce((s, i) => s + (i.baseQty * i.costBase), 0);
  const mode = () => $('#pfPay').value;
  const curRate = () => state.rate;
  const dec2 = (v) => String(Math.round((Number(v) || 0) * 100) / 100);

  // Abre el modal dedicado para configurar crédito / mixto
  const openPaymentModal = () => {
    const total = itemTotal();
    const m = mode();
    const isCredOrMix = m === 'credit' || m === 'mixto';
    if (!isCredOrMix) { recalcPaySummary(); return; }
    const title = m === 'mixto' ? 'Configurar pago mixto' : 'Configurar crédito';
    const showMixto = m === 'mixto';
    const html = `
      <div class="form-grid">
        <div class="field"><label>Tasa BCV (Bs/USD)</label>
          <input id="pmRate" type="number" step="0.01" min="0" value="${fmt.num(state.rate)}" title="Editable — usa la tasa BCV oficial por defecto" />
          <div style="font-size:11px;color:#6b7280;margin-top:2px">Fuente: BCV oficial · Actualización automática cada 10 min</div>
        </div>
        <div class="field"><label>Días de crédito</label>
          <input id="pmDays" type="number" min="1" value="${state.days}" />
        </div>
      </div>
      ${showMixto ? `
        <div style="margin-top:10px;padding:10px;border:1px solid #e0e7ef;background:#f8fafc;border-radius:8px">
          <b style="font-size:12px;color:#374151">Pago de contado (se descuenta del total)</b>
          <div class="form-grid" style="margin-top:6px">
            <div class="field"><label>Monto en Bs.</label><input id="pmPayBs" inputmode="decimal" value="${fmt.num(state.cashBs)}" /></div>
            <div class="field"><label>Monto en USD</label><input id="pmPayUsd" inputmode="decimal" value="${fmt.num(state.cashUsd)}" /></div>
          </div>
          <div style="font-size:11px;color:#6b7280;margin-top:4px">Escriba en uno y se calcula automáticamente el otro según la tasa BCV.</div>
        </div>
      ` : ''}
      <div id="pmSum" style="margin-top:10px;padding:10px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px"></div>
    `;
    const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                    <button class="btn primary" id="pmSave">Aceptar</button>`;
    openModal({ title, body: html, footer });

    const pmRecalc = () => {
      const r = fmt.parseEsp($('#pmRate').value);
      if (r > 0) state.rate = r;
      state.days = Math.max(1, Math.round(fmt.parseEsp($('#pmDays').value) || 30));
      let cashBs = 0, cashUsd = 0, cashUSD = 0, credit = total;
      if (showMixto) {
        cashBs = fmt.parseEsp($('#pmPayBs').value);
        cashUsd = fmt.parseEsp($('#pmPayUsd').value);
        cashUSD = cashUsd + (state.rate > 0 ? cashBs / state.rate : 0);
        cashUSD = Math.min(cashUSD, total);
      }
      credit = Math.max(0, total - cashUSD);
      state.cashBs = cashBs; state.cashUsd = cashUsd;
      state.cashUSD = cashUSD; state.creditUSD = credit;
      const bf = (t) => 'Bs. ' + fmt.esp(t * state.rate);
      $('#pmSum').innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span>Total factura</span><b>${fmt.money(total)} (${bf(total)})</b></div>
        ${showMixto ? `
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0"><span>Pago contado</span><b>${fmt.money(cashUSD)} (${bf(cashUSD)})</b></div>
        ` : ''}
        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:800;padding:4px 0 0;border-top:1px dashed #bbf7d0;color:${credit > 0.004 ? '#15803d' : '#6b7280'}">
          <span>${credit > 0.004 ? 'Saldo crédito (CxP)' : 'Total cubierto'}</span>
          <b>${fmt.money(credit)} (${bf(credit)})</b>
        </div>`;
    };
    $('#pmRate').addEventListener('input', pmRecalc);
    $('#pmDays').addEventListener('input', pmRecalc);
    if (showMixto) {
      $('#pmPayBs').addEventListener('input', () => { const r = fmt.parseEsp($('#pmRate').value); if (r > 0) $('#pmPayUsd').value = dec2(fmt.parseEsp($('#pmPayBs').value) / r); pmRecalc(); });
      $('#pmPayUsd').addEventListener('input', () => { const r = fmt.parseEsp($('#pmRate').value); $('#pmPayBs').value = dec2(fmt.parseEsp($('#pmPayUsd').value) * r); pmRecalc(); });
    }
    pmRecalc();
    $('#pmSave').addEventListener('click', () => {
      state.rate = fmt.parseEsp($('#pmRate').value); if (!(state.rate > 0)) state.rate = sysRate;
      state.days = Math.max(1, Math.round(fmt.parseEsp($('#pmDays').value) || 30));
      if (showMixto) {
        state.cashBs = fmt.parseEsp($('#pmPayBs').value);
        state.cashUsd = fmt.parseEsp($('#pmPayUsd').value);
        state.cashUSD = state.cashUsd + (state.rate > 0 ? state.cashBs / state.rate : 0);
        state.cashUSD = Math.min(state.cashUSD, total);
      } else {
        state.cashBs = 0; state.cashUsd = 0; state.cashUSD = 0;
      }
      state.creditUSD = Math.max(0, total - state.cashUSD);
      closeModal();
      recalcPaySummary();
    });
  };

  const recalcPaySummary = () => {
    const total = itemTotal();
    const m = mode();
    const r = state.rate;
    const lbl = $('#pfPayLabel');
    const det = $('#pfPayDetail');
    if (m === 'contado') {
      lbl.textContent = 'Contado — Pago total';
      det.innerHTML = `Total: <b>${fmt.money(total)}</b> (${fmt.bs(total)}) · Tasa: ${fmt.num(r)} Bs/USD`;
    } else if (m === 'credit') {
      lbl.textContent = `Crédito · ${state.days} días · Tasa ${fmt.num(r)} Bs/USD`;
      det.innerHTML = `Saldo por pagar (CxP): <b>${fmt.money(total)}</b> (${fmt.bs(total)})`;
    } else {
      const cb = state.cashBs > 0 ? `Bs. ${fmt.esp(state.cashBs)}` : '';
      const cu = state.cashUsd > 0 ? `${fmt.money(state.cashUsd)}` : [];
      const pago = [cb, cu].filter(Boolean).join(' + ') || '$0.00';
      lbl.textContent = `Mixto · ${state.days} días · Tasa ${fmt.num(r)} Bs/USD`;
      det.innerHTML = `Contado: <b>${pago}</b> → ${fmt.money(state.cashUSD)} · Crédito (CxP): <b>${fmt.money(state.creditUSD)}</b> (${fmt.bs(state.creditUSD)})`;
    }
  };

  const recalc = () => { recalcPaySummary(); };
  const repaint = () => {
    const tb = $('#pfBody');
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
    $$('button[data-rm]', tb).forEach(b => b.addEventListener('click', () => { state.items.splice(+b.dataset.rm, 1); repaint(); }));
    recalc();
  };
  $('#pfQty').addEventListener('input', hint);
  $('#pfCost').addEventListener('input', hint);
  $('#pfProd').addEventListener('change', fillUnit);
  $('#pfUnit').addEventListener('change', hint);
  $('#pfPay').addEventListener('change', () => {
    const m = mode();
    if (m === 'credit' || m === 'mixto') {
      openPaymentModal();
    } else {
      state.cashBs = 0; state.cashUsd = 0; state.cashUSD = 0; state.creditUSD = 0;
      recalcPaySummary();
    }
  });
  $('#pfPayConfig').addEventListener('click', openPaymentModal);
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
    const m = mode();
    const total = itemTotal();
    // Recalcular desde state (configurado vía modal)
    let cashUSD = m === 'contado' ? total : (m === 'credit' ? 0 : state.cashUSD);
    cashUSD = Math.min(cashUSD, total);
    let credit = Math.max(0, total - cashUSD);
    if (m === 'mixto') {
      if (cashUSD <= 0) { toast('En pago Mixto indique un pago de contado (Bs. o USD)', 'warn'); return; }
      if (total - cashUSD <= 0.004) { toast('El pago de contado cubre el total; seleccione Contado', 'warn'); return; }
    }
    if ((m === 'credit' || m === 'mixto') && !(state.days > 0)) { toast('Indique los días de crédito', 'warn'); return; }
    // Sumar stock por producto (en unidad base)
    const acc = {};
    state.items.forEach(i => { acc[i.pid] = (acc[i.pid] || 0) + i.baseQty; });
    Object.keys(acc).forEach(pid => { const pr = db.products.find(x => x.id === +pid); if (pr) { canonicalizeProduct(pr); pr.stockBase = (invStock(pr) || 0) + acc[pid]; } });
    const purchase = {
      id: db.purchases.length + 1,
      date: $('#pfDate').value,
      supplier: sup.name,
      invoice: $('#pfInvoice').value || 'P-' + Date.now(),
      items: state.items.length,
      total,
      payment: m,
      rate: state.rate, days: m === 'credit' || m === 'mixto' ? state.days : 0,
      paidBs: m === 'mixto' ? state.cashBs : 0,
      paidUsd: cashUSD,
      creditUSD: credit,
      detail: state.items.map(i => ({ code: i.code, name: i.name, entry: i.entry, base: invBaseUnit(db.products.find(pr => pr.id === i.pid) || i), qty: i.qty, baseQty: i.baseQty, cost: i.costBase }))
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
    // Generar CxP por el saldo pendiente (crédito): contado = 0, crédito = total, mixto = total − contado.
    if (credit > 0.004) {
      const due = new Date(purchase.date + 'T00:00:00'); due.setDate(due.getDate() + days);
      db.payables.unshift({
        id: db.payables.length + 1,
        date: purchase.date,
        supplier: sup.name,
        docType: 'FAC', docNumber: purchase.invoice,
        total: credit, paid: 0, balance: credit,
        dueDate: due.toISOString().slice(0, 10),
        status: 'pending'
      });
      sup.balance = (sup.balance || 0) + credit;
    }
    DB.save(db); closeModal(); renderPurchases();
    toast(`Compra registrada: ${fmt.money(total)} · Contado ${fmt.money(cashUSD)} · Crédito ${fmt.money(credit)}`, 'success', 3800);
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
  $('#newProduct').addEventListener('click', () => {
    if (demoProductLimit()) { demoBlock('Version Demo: ha alcanzado el limite de ' + DEMO_MAX_PRODUCTS + ' productos. Adquiera la version completa para seguir creando productos.'); return; }
    productForm();
  });
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
  }).map(p => { canonicalizeProduct(p); return p; });
  const tb = $('#invTbody');
  if (!tb) return;
  if (list.length === 0) { tb.innerHTML = `<tr><td colspan="8" class="empty">Sin resultados</td></tr>`; return; }
  tb.innerHTML = list.map(p => `
    <tr>
      <td><code>${p.code}</code></td>
      <td>${p.name}${p.variantGroup ? ' <span class="pill blue">variante</span>' : ''}</td>
      <td>${p.category}</td>
      <td title="${invBaseUnit(p)} (unidad canónica)">${unitAbbrPlural(invBasePres(p).unidad)}${p.weighed ? ' (peso)' : ''}</td>
      <td class="num" title="${fmtNumK(invStock(p))} ${invBaseUnit(p)}">${invBreakdown(p, invStock(p))}</td>
      <td class="num" title="Precio de la presentación base (${invBasePres(p).unidad})">${fmt.moneyDyn(invDefaultPrice(p))}</td>
      <td class="num" title="Valor = ${fmtNumK(invBaseWhole(p))} ${invBasePres(p).unidad} × precio base">${fmt.money(invBaseWhole(p) * invDefaultPrice(p))}</td>
      <td class="actions-cell">
        <button class="btn sm" data-edit="${p.id}">Editar</button>
        <button class="btn sm" data-var="${p.id}" title="Crear variante independiente">＋ Var</button>
        <button class="btn sm danger" data-del="${p.id}">${ico('close')}</button>
      </td>
    </tr>
  `).join('');
  $$('button[data-edit]', tb).forEach(b => b.addEventListener('click', () => productForm(+b.dataset.edit)));
  $$('button[data-var]', tb).forEach(b => b.addEventListener('click', () => openProductVariant(+b.dataset.var)));
  $$('button[data-del]', tb).forEach(b => b.addEventListener('click', () => {
    if (!confirm('¿Eliminar este producto?')) return;
    db.products = db.products.filter(x => x.id !== +b.dataset.del);
    DB.save(db); paintInventory(); toast('Producto eliminado', 'warn');
  }));
}

const fmtNumK = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });

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

/* ============================================================
   PRODUCTO — formulario canónico (Fase 1)
   Fuente única de inventario: stockBase en invBaseUnit.
   ============================================================ */
/* Abre un formulario en blanco para crear una VARIANTE INDEPENDIENTE basada en un producto,
   conservando su configuración base pero con inventario, código y datos editables por separado. */
function openProductVariant(srcId) { productForm(null, srcId); }

function productForm(id, cloneSourceId) {
  const editing = typeof id === 'number' && !!db.products.find(x => x.id === id);
  const source = editing ? db.products.find(x => x.id === id) : null;
  let p;
  if (editing) {
    p = canonicalizeProduct(JSON.parse(JSON.stringify(source)));
  } else if (cloneSourceId != null && db.products.find(x => x.id === cloneSourceId)) {
    const t = canonicalizeProduct(JSON.parse(JSON.stringify(db.products.find(x => x.id === cloneSourceId))));
    p = JSON.parse(JSON.stringify(t));
    p.id = null; p.code = ''; p.stockBase = 0; p.stockMinimo = 0; p.stockMaximo = 0;
    p.variantGroup = (p.variantGroup || ('G' + cloneSourceId));
    p.name = t.name + ' · NUEVA VARIANTE';
  } else {
    p = Object.assign(newProductShell(), { code: '', name: '', category: 'General', taxed: true });
  }
  ensureUnitsCatalog();
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const uOpt = (sel) => unitList().map(u => `<option value="${esc(u.name)}" ${u.name === sel ? 'selected' : ''}>${esc(u.name)} (${esc(u.symbol)})</option>`).join('');
  const pnum = (s) => { const t = String(s == null ? '' : s).trim().replace(/,/g, '.'); if (!t) return 0; const v = parseFloat(t); return isFinite(v) ? v : 0; };
  const fmtDec = (v) => { const x = Number(v); if (!isFinite(x)) return '0'; return String(parseFloat(x.toFixed(8))); };
  const bp = invBasePres(p);
  const canon = invBaseUnit(p);
  const sysRate = fmt.usdRate();
  const MAIN_CATS = ['Licores', 'Cervezas', 'Vinos', 'Destilados', 'Bebidas', 'Aguas', 'Tabacos', 'Snacks', 'Lácteos', 'Cárnicos', 'Limpieza', 'Bazar'];
  const catList = [...new Set(MAIN_CATS.concat(p.category || []).concat(db.products.map(x => x.category)).filter(Boolean))];

  // State
  const st = {
    tab: 'general',
    code: p.code || '', name: p.name || '', category: p.category || 'General',
    unit: bp.unidad || 'Unidad', description: p.description || '',
    image: p.image || '',
    costUSD: Number(p.cost) || 0, addExpensesPct: Number(p.additionalExpensesPct) || 0,
    lastCostUSD: Number(p.cost) || 0,
    pricingMethod: p.pricingMethod || 'markup', marginPct: Number(p.margin != null ? p.margin : 30),
    gapPct: Number(p.gapPct) || 10, manualPriceUSD: Number(p.manualPriceUSD) || 0,
    ivaRate: p.ivaRate != null ? p.ivaRate : (p.taxed === false ? 0 : 0),
    matrix: p.priceListMatrix || { publico: { marginPct: 30, active: true }, mayorista: { marginPct: 18, active: true }, distribuidor: { marginPct: 12, active: true }, especial: { marginPct: 22, active: true } },
    stock: Number(p.stockBase) || 0, stockMin: Number(p.stockMinimo) || 0, stockMax: Number(p.stockMaximo) || 0,
    reorderPoint: Number(p.reorderPoint) || 0, warehouse: p.warehouse || 'Principal', location: p.location || '',
    mainPres: bp.unidad || 'Unidad', contentQty: Number(bp.contenido) || 1, baseUnit: canon || 'Unidad',
    allowedModes: p.allowedModes || { originalPresentation: true, unit: true, fractional: false, shots: false, contentControl: false },
    isWeighable: !!p.weighed, pricePerKg: Number(p.pricePerKg) || 0,
    presentations: Array.isArray(p.presentations) ? JSON.parse(JSON.stringify(p.presentations)) : [],
    suppliersInfo: Array.isArray(p.suppliersInfo) ? JSON.parse(JSON.stringify(p.suppliersInfo)) : [],
    isComposite: !!p.isComposite, compositeComponents: Array.isArray(p.compositeComponents) ? JSON.parse(JSON.stringify(p.compositeComponents)) : []
  };

  // Pricing calculations
  const calcRealCost = () => st.costUSD * (1 + st.addExpensesPct / 100);
  const calcBasePrice = () => {
    const rc = calcRealCost();
    if (rc <= 0) return 0;
    switch (st.pricingMethod) {
      case 'markup': return rc * (1 + st.marginPct / 100);
      case 'margin_on_sale': return st.marginPct >= 100 ? rc * 2 : rc / (1 - st.marginPct / 100);
      case 'gap_system': return rc * (1 + st.marginPct / 100) * (1 + st.gapPct / 100);
      case 'manual': return st.manualPriceUSD;
      default: return rc * (1 + st.marginPct / 100);
    }
  };
  const calcFinalPrice = () => { const bp = calcBasePrice(); return bp * (1 + st.ivaRate / 100); };
  const calcMatrixPrice = (marginPct) => {
    const rc = calcRealCost();
    let base = 0;
    switch (st.pricingMethod) {
      case 'margin_on_sale': base = marginPct < 100 ? rc / (1 - marginPct / 100) : rc * (1 + marginPct / 100); break;
      case 'gap_system': base = rc * (1 + marginPct / 100) * (1 + st.gapPct / 100); break;
      default: base = rc * (1 + marginPct / 100); break;
    }
    return base * (1 + st.ivaRate / 100);
  };

  const html = `
    <div style="display:flex;gap:0;border-bottom:2px solid #e5e7eb;margin-bottom:12px;overflow-x:auto" id="pfTabs">
      ${['general','pricing','inventory','presentations','suppliers','composite'].map((t,i) => {
        const labels = ['Info General','Costos & Precios','Inventario','Presentaciones','Proveedores','Combo/Kit'];
        const icons = ['📦','💰','📦','📦','📦','📦'];
        return `<button type="button" class="pf-tab" data-tab="${t}" style="flex:none;padding:8px 14px;font-size:12px;font-weight:600;border-bottom:2px solid transparent;cursor:pointer;background:none;border-top:none;border-left:none;border-right:none;color:#6b7280;white-space:nowrap">${labels[i]}</button>`;
      }).join('')}
    </div>
    <div id="pfTabContent"></div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="pcSave">Guardar</button>`;
  openModal({ title: editing ? 'Editar producto' : 'Nuevo producto', body: html, footer, size: 'modal-lg' });

  setTimeout(() => {
    // Tab switching
    const switchTab = (tab) => {
      st.tab = tab;
      document.querySelectorAll('.pf-tab').forEach(b => {
        b.style.borderBottomColor = b.dataset.tab === tab ? '#4f46e5' : 'transparent';
        b.style.color = b.dataset.tab === tab ? '#4f46e5' : '#6b7280';
      });
      renderTabContent();
    };
    document.querySelectorAll('.pf-tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    const renderTabContent = () => {
      const box = $('#pfTabContent');
      if (!box) return;
      if (st.tab === 'general') renderTabGeneral(box);
      else if (st.tab === 'pricing') renderTabPricing(box);
      else if (st.tab === 'inventory') renderTabInventory(box);
      else if (st.tab === 'presentations') renderTabPresentations(box);
      else if (st.tab === 'suppliers') renderTabSuppliers(box);
      else if (st.tab === 'composite') renderTabComposite(box);
    };

    // === TAB 1: GENERAL ===
    const renderTabGeneral = (box) => {
      box.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 200px;gap:14px">
          <div>
            <div class="form-grid">
              <div class="field span-2"><label>Código / SKU / Barra *</label><input id="pcCode" value="${esc(st.code)}" placeholder="SKU-100234" /></div>
              <div class="field span-2"><label>Nombre Comercial *</label><input id="pcName" value="${esc(st.name)}" /></div>
              <div class="field"><label>Categoría *</label>
                <div style="display:flex;gap:6px;align-items:center">
                  <input id="pcCat" value="${esc(st.category)}" style="flex:1" />
                  <button type="button" id="pcCatTgl" class="btn sm">＋</button>
                </div>
                <div id="pcCatPanel" style="display:none;margin-top:6px;flex-wrap:wrap;gap:6px">
                  ${catList.map(c => `<button type="button" class="btn sm cat-opt" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
                </div>
              </div>
              <div class="field"><label>Unidad de Medida Base *</label><select id="pcUnit">${uOpt(st.unit)}</select></div>
            </div>
            <div style="margin-top:8px"><label style="font-size:12px;font-weight:600;color:#374151">Descripción / Ficha Técnica</label>
              <textarea id="pcDesc" rows="3" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-size:12px" placeholder="Detalles, presentación, fabricante...">${esc(st.description)}</textarea>
            </div>
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px">
            <label style="font-size:12px;font-weight:700;display:block;margin-bottom:8px">📷 Imagen</label>
            <div id="pcImgPreview" style="aspect-ratio:4/3;border-radius:8px;overflow:hidden;background:#fff;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;margin-bottom:8px">
              ${st.image ? `<img src="${esc(st.image)}" style="width:100%;height:100%;object-fit:cover"/>` : '<span style="color:#9ca3af;font-size:11px">Sin imagen</span>'}
            </div>
            <input type="file" id="pcFile" accept="image/*" style="display:none" />
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
              <button type="button" class="btn sm" id="pcUploadBtn">📎 Archivo</button>
              <button type="button" class="btn sm" id="pcCameraBtn" style="background:#eef2ff;color:#4f46e5">📷 Cámara</button>
            </div>
            <video id="pcCamVideo" style="display:none;width:100%;border-radius:8px" autoplay playsinline></video>
            <div id="pcCamControls" style="display:none;margin-top:6px">
              <button type="button" class="btn sm primary" id="pcCaptureBtn" style="width:100%">📸 Capturar</button>
            </div>
            <canvas id="pcCamCanvas" style="display:none"></canvas>
            <input type="url" id="pcImgUrl" value="${esc(st.image)}" placeholder="URL imagen https://..." style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:10px;font-family:monospace;margin-top:6px" />
          </div>
        </div>`;
      // Events
      const catTgl = $('#pcCatTgl'), catPanel = $('#pcCatPanel');
      let catOpen = false;
      catTgl.addEventListener('click', () => { catOpen = !catOpen; catPanel.style.display = catOpen ? 'flex' : 'none'; catTgl.textContent = catOpen ? '−' : '＋'; });
      catPanel.querySelectorAll('.cat-opt').forEach(b => b.addEventListener('click', () => { $('#pcCat').value = b.dataset.cat; catOpen = false; catPanel.style.display = 'none'; catTgl.textContent = '＋'; }));
      $('#pcUploadBtn').addEventListener('click', () => $('#pcFile').click());
      $('#pcFile').addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => { st.image = ev.target.result; $('#pcImgPreview').innerHTML = `<img src="${st.image}" style="width:100%;height:100%;object-fit:cover"/>`; };
        reader.readAsDataURL(file);
      });
      let camStream = null;
      $('#pcCameraBtn').addEventListener('click', async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
          camStream = stream;
          const vid = $('#pcCamVideo'); vid.srcObject = stream; vid.style.display = 'block';
          $('#pcCamControls').style.display = 'block';
        } catch (e) { toast('No se pudo acceder a la cámara: ' + e.message, 'warn'); }
      });
      $('#pcCaptureBtn')?.addEventListener('click', () => {
        const vid = $('#pcCamVideo'), canvas = $('#pcCamCanvas');
        canvas.width = vid.videoWidth || 640; canvas.height = vid.videoHeight || 480;
        canvas.getContext('2d').drawImage(vid, 0, 0);
        st.image = canvas.toDataURL('image/jpeg', 0.85);
        $('#pcImgPreview').innerHTML = `<img src="${st.image}" style="width:100%;height:100%;object-fit:cover"/>`;
        if (camStream) camStream.getTracks().forEach(t => t.stop());
        vid.style.display = 'none'; $('#pcCamControls').style.display = 'none';
      });
      $('#pcImgUrl').addEventListener('change', (e) => { st.image = e.target.value; $('#pcImgPreview').innerHTML = st.image ? `<img src="${esc(st.image)}" style="width:100%;height:100%;object-fit:cover"/>` : '<span style="color:#9ca3af">Sin imagen</span>'; });
    };

    // === TAB 2: COSTS & PRICING ===
    const renderTabPricing = (box) => {
      const rc = calcRealCost(), bp = calcBasePrice(), fp = calcFinalPrice();
      const grossProfit = Math.max(0, bp - rc);
      const effProfit = rc > 0 ? ((bp - rc) / rc * 100) : 0;
      box.innerHTML = `
        <div style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:12px">
          <b style="font-size:12px">1. Estructura de Costos</b>
          <div style="font-size:10px;color:#6b7280;margin-bottom:6px">Fórmula: Costo Real = Costo × (1 + Gastos%)</div>
          <div class="form-grid">
            <div class="field"><label>Costo de Compra (USD) *</label><input id="pcCost" type="text" inputmode="decimal" value="${fmtDec(st.costUSD)}" /></div>
            <div class="field"><label>Gastos Adicionales (%)</label><input id="pcAddExp" type="text" inputmode="decimal" value="${fmtDec(st.addExpensesPct)}" /></div>
            <div class="field" style="background:#eef2ff;border-radius:8px;padding:8px"><label style="color:#4f46e5">Costo Real Calculado</label><div style="font-size:16px;font-weight:800;color:#312e81">$${fmtDec(rc)}</div></div>
            <div class="field"><label>Último Costo (Auditoría)</label><input id="pcLastCost" type="text" inputmode="decimal" value="${fmtDec(st.lastCostUSD)}" /></div>
          </div>
        </div>
        <div style="padding:10px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:12px">
          <b style="font-size:12px">2. Método de Formación de Precio</b>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0">
            ${[
              { id:'markup', title:'Markup', formula:'Costo × (1+Margen%)' },
              { id:'margin_on_sale', title:'Margen Venta', formula:'Costo / (1-Margen%)' },
              { id:'gap_system', title:'Brecha', formula:'Costo × (1+Margen%) × (1+Brecha%)' },
              { id:'manual', title:'Manual', formula:'Precio fijo directo' }
            ].map(m => `<button type="button" class="btn sm pm-btn ${st.pricingMethod===m.id?'primary':''}" data-pm="${m.id}" style="text-align:left;padding:8px;font-size:11px"><b>${m.title}</b><br/><span style="font-size:10px;color:#6b7280;font-family:monospace">${m.formula}</span></button>`).join('')}
          </div>
          <div class="form-grid" style="margin-top:6px">
            ${st.pricingMethod !== 'manual' ? `<div class="field"><label>Margen de Ganancia (%)</label><input id="pcMargin" type="text" inputmode="decimal" value="${fmtDec(st.marginPct)}" /></div>` : ''}
            ${st.pricingMethod === 'gap_system' ? `<div class="field"><label>Brecha (%)</label><input id="pcGap" type="text" inputmode="decimal" value="${fmtDec(st.gapPct)}" /></div>` : ''}
            ${st.pricingMethod === 'manual' ? `<div class="field"><label>Precio Base Manual (USD)</label><input id="pcManualPrice" type="text" inputmode="decimal" value="${fmtDec(st.manualPriceUSD)}" /></div>` : ''}
            <div class="field" style="background:#f0fdf4;border-radius:8px;padding:8px"><label style="color:#15803d">Base Sin IVA</label><div style="font-size:14px;font-weight:800;color:#14532d">$${fmtDec(bp)}</div></div>
          </div>
        </div>
        <div style="padding:10px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;margin-bottom:12px">
          <b style="font-size:12px">3. Parámetro Fiscal (IVA)</b>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">
            ${[{rate:16,label:'16% General'},{rate:8,label:'8% Reducida'},{rate:0,label:'0% Exento'}].map(t => `<button type="button" class="btn sm iva-btn ${st.ivaRate===t.rate?'primary':''}" data-iva="${t.rate}">${t.label}</button>`).join('')}
          </div>
        </div>
        <div style="padding:10px;background:linear-gradient(135deg,#1e1b4b,#312e81);border-radius:12px;color:#fff;margin-bottom:12px">
          <b style="font-size:12px">Panel de Resultados en Vivo</b>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:8px">
            <div style="background:rgba(255,255,255,0.1);padding:8px;border-radius:8px"><span style="font-size:10px;color:#c7d2fe">Costo Real</span><div style="font-weight:800">$${fmtDec(rc)}</div><div style="font-size:10px;color:#a5b4fc">Bs. ${fmt.esp(rc * sysRate)}</div></div>
            <div style="background:rgba(255,255,255,0.1);padding:8px;border-radius:8px"><span style="font-size:10px;color:#86efac">Ganancia (${fmtDec(effProfit)}%)</span><div style="font-weight:800;color:#4ade80">+$${fmtDec(grossProfit)}</div><div style="font-size:10px;color:#86efac">Bs. ${fmt.esp(grossProfit * sysRate)}</div></div>
            <div style="background:rgba(255,255,255,0.1);padding:8px;border-radius:8px"><span style="font-size:10px;color:#c7d2fe">Base Sin IVA</span><div style="font-weight:800">$${fmtDec(bp)}</div></div>
            <div style="background:rgba(74,222,128,0.2);padding:8px;border-radius:8px;border:1px solid rgba(74,222,128,0.4)"><span style="font-size:10px;color:#86efac;font-weight:700">PVP Final USD</span><div style="font-weight:800;font-size:16px;color:#4ade80">$${fmtDec(fp)}</div><div style="font-size:10px;color:#86efac">${st.ivaRate>0?'IVA '+st.ivaRate+'%':'Exento'}</div></div>
            <div style="background:rgba(251,191,36,0.2);padding:8px;border-radius:8px;border:1px solid rgba(251,191,36,0.4)"><span style="font-size:10px;color:#fcd34d;font-weight:700">PVP Final Bs.</span><div style="font-weight:800;font-size:16px;color:#fcd34d">Bs. ${fmt.esp(fp * sysRate)}</div><div style="font-size:10px;color:#fcd34d">Tasa ${fmt.num(sysRate)}</div></div>
          </div>
        </div>
        <div style="padding:10px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px">
          <b style="font-size:12px">4. Matriz de Listas de Precios</b>
          <table class="dt" style="margin-top:6px">
            <thead><tr><th>Lista</th><th>Margen %</th><th style="text-align:right">Precio USD</th><th style="text-align:right">Precio Bs.</th><th>Activa</th></tr></thead>
            <tbody>
              ${['publico','mayorista','distribuidor','especial'].map(k => {
                const labels = {publico:'Público / Detal',mayorista:'Mayorista',distribuidor:'Distribuidor',especial:'Especial / VIP'};
                const colors = {publico:'#10b981',mayorista:'#3b82f6',distribuidor:'#a855f7',especial:'#f59e0b'};
                const mPct = st.matrix[k]?.marginPct || 0;
                const mPrice = calcMatrixPrice(mPct);
                const active = st.matrix[k]?.active !== false;
                return `<tr><td><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${colors[k]}"></span><b>${labels[k]}</b></span></td>
                  <td><input type="text" inputmode="decimal" class="matrix-margin" data-mk="${k}" value="${fmtDec(mPct)}" style="width:70px;padding:4px;border:1px solid #d1d5db;border-radius:4px;font-size:11px;font-family:monospace" />%</td>
                  <td style="text-align:right;font-weight:700;color:${colors[k]}">$${fmtDec(mPrice)}</td>
                  <td style="text-align:right;font-weight:600">Bs. ${fmt.esp(mPrice * sysRate)}</td>
                  <td><input type="checkbox" class="matrix-active" data-mk="${k}" ${active?'checked':''} /></td></tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
      // Events
      box.querySelectorAll('.pm-btn').forEach(b => b.addEventListener('click', () => { st.pricingMethod = b.dataset.pm; renderTabPricing(box); }));
      box.querySelectorAll('.iva-btn').forEach(b => b.addEventListener('click', () => { st.ivaRate = Number(b.dataset.iva); renderTabPricing(box); }));
      const bind = (id, key, num) => { const el = box.querySelector(id); if (el) el.addEventListener('input', (e) => { st[key] = num ? pnum(e.target.value) : e.target.value; }); };
      bind('#pcCost','costUSD',true); bind('#pcAddExp','addExpensesPct',true); bind('#pcLastCost','lastCostUSD',true);
      bind('#pcMargin','marginPct',true); bind('#pcGap','gapPct',true); bind('#pcManualPrice','manualPriceUSD',true);
      box.querySelectorAll('.matrix-margin').forEach(el => el.addEventListener('input', (e) => { const k = el.dataset.mk; if (!st.matrix[k]) st.matrix[k] = {}; st.matrix[k].marginPct = pnum(e.target.value); renderTabPricing(box); }));
      box.querySelectorAll('.matrix-active').forEach(el => el.addEventListener('change', (e) => { const k = el.dataset.mk; if (!st.matrix[k]) st.matrix[k] = {}; st.matrix[k].active = e.target.checked; }));
    };

    // === TAB 3: INVENTORY ===
    const renderTabInventory = (box) => {
      box.innerHTML = `
        <div style="padding:10px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;margin-bottom:12px;font-size:12px;color:#312e81">
          <b>Control Físico y Parámetros de Almacenamiento</b>
          <div style="font-size:11px;color:#4338ca;margin-top:2px">Niveles de seguridad, puntos de reorden y ubicación en estantería.</div>
        </div>
        <div class="form-grid" style="margin-bottom:12px">
          <div class="field"><label>Stock Inicial</label><input id="pcStockInit" type="number" step="0.001" min="0" value="${st.stock}" /></div>
          <div class="field"><label>Stock Actual Disponible *</label><input id="pcStock" type="number" step="0.001" min="0" value="${st.stock}" /></div>
          <div class="field"><label>Stock Mínimo (Alerta)</label><input id="pcStockMin" type="number" step="0.001" min="0" value="${st.stockMin}" /></div>
          <div class="field"><label>Stock Máximo (Tope)</label><input id="pcStockMax" type="number" step="0.001" min="0" value="${st.stockMax}" /></div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Punto de Reorden</label><input id="pcReorder" type="number" step="1" min="0" value="${st.reorderPoint}" /></div>
          <div class="field"><label>Almacén Asignado</label>
            <select id="pcWarehouse">
              ${['Principal','Secundario','Depósito','Piso de Venta'].map(w => `<option value="${w}" ${st.warehouse===w?'selected':''}>${w}</option>`).join('')}
            </select>
          </div>
          <div class="field span-2"><label>Ubicación Física (Pasillo/Estante)</label><input id="pcLocation" value="${esc(st.location)}" placeholder="Pasillo 3 - Estante B" /></div>
        </div>`;
      const bind = (id, key) => { const el = box.querySelector(id); if (el) el.addEventListener('input', (e) => { st[key] = e.target.type === 'number' ? pnum(e.target.value) : e.target.value; }); };
      bind('#pcStockInit','stock'); bind('#pcStock','stock'); bind('#pcStockMin','stockMin'); bind('#pcStockMax','stockMax');
      bind('#pcReorder','reorderPoint'); bind('#pcLocation','location');
      const wh = box.querySelector('#pcWarehouse'); if (wh) wh.addEventListener('change', (e) => { st.warehouse = e.target.value; });
    };

    // === TAB 4: PRESENTATIONS ===
    const renderTabPresentations = (box) => {
      box.innerHTML = `
        <div style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:12px">
          <b style="font-size:12px">Presentación Principal y Conversión</b>
          <div class="form-grid" style="margin-top:6px">
            <div class="field"><label>Presentación Principal</label>
              <select id="pcMainPres">${['Unidad','Caja','Paquete','Botella','Litro','Kg','Metro','Bulto','Display'].map(u => `<option value="${u}" ${st.mainPres===u?'selected':''}>${u}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Contenido Unitario</label><input id="pcContentQty" type="number" step="0.001" min="0.001" value="${st.contentQty}" /></div>
            <div class="field"><label>Unidad Base</label><input id="pcBaseUnit" value="${esc(st.baseUnit)}" /></div>
          </div>
          <div style="font-size:11px;color:#059669;font-weight:600;margin-top:4px" id="pcEquiv">1 ${st.mainPres} = ${st.contentQty} ${st.baseUnit}</div>
        </div>
        <div style="padding:10px;background:#fef3c7;border:1px solid #fde68a;border-radius:12px;margin-bottom:12px">
          <b style="font-size:12px">Modalidades de Venta Permitidas</b>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">
            ${[
              {key:'originalPresentation',label:'Presentación Original',desc:'Empaque cerrado completo'},
              {key:'unit',label:'Venta por Unidad',desc:'Unidades sueltas'},
              {key:'fractional',label:'Fraccionada (Bs)',desc:'Monto libre en Bs.'},
              {key:'shots',label:'Tragos / Shots',desc:'Licorería, copas'},
              {key:'contentControl',label:'Balanza / Peso',desc:'Control por Kg'}
            ].map(m => `<label style="padding:8px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;font-size:11px;display:flex;align-items:start;gap:6px">
              <input type="checkbox" class="mode-check" data-mode="${m.key}" ${st.allowedModes[m.key]?'checked':''} style="margin-top:2px" />
              <div><b>${m.label}</b><div style="font-size:10px;color:#6b7280">${m.desc}</div></div>
            </label>`).join('')}
          </div>
        </div>
        <div style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <b style="font-size:12px">Presentaciones Adicionales (${st.presentations.length})</b>
          </div>
          <div class="form-grid" style="margin-bottom:8px">
            <div class="field"><label>Nombre</label><input id="pcPresName" placeholder="Caja x 12" /></div>
            <div class="field"><label>Factor (unidades)</label><input id="pcPresFactor" type="number" min="1" value="12" /></div>
            <div class="field"><label>Precio (USD)</label><input id="pcPresPrice" type="text" inputmode="decimal" placeholder="Auto" /></div>
            <div class="field"><label>Código Barras</label><input id="pcPresBarcode" placeholder="759..." /></div>
          </div>
          <button type="button" class="btn sm primary" id="pcAddPres">+ Agregar</button>
          <div id="pcPresList" style="margin-top:8px"></div>
        </div>`;
      // Paint presentations list
      const paintPres = () => {
        const list = $('#pcPresList'); if (!list) return;
        if (st.presentations.length === 0) { list.innerHTML = '<div style="font-size:11px;color:#9ca3af;text-align:center;padding:12px">Sin presentaciones adicionales</div>'; return; }
        list.innerHTML = st.presentations.map((pr, i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:4px;font-size:11px">
          <div><b>${esc(pr.name)}</b> · ${pr.factor} unid. · <span style="color:#059669;font-weight:700">$${fmtDec(pr.priceUSD)}</span>${pr.barcode ? ' · <span style="font-family:monospace;color:#9ca3af">'+esc(pr.barcode)+'</span>' : ''}</div>
          <button type="button" class="btn sm danger" data-rmpres="${i}">&times;</button>
        </div>`).join('');
        list.querySelectorAll('[data-rmpres]').forEach(b => b.addEventListener('click', () => { st.presentations.splice(+b.dataset.rmpres, 1); paintPres(); }));
      };
      paintPres();
      // Events
      box.querySelectorAll('.mode-check').forEach(el => el.addEventListener('change', (e) => { st.allowedModes[el.dataset.mode] = e.target.checked; }));
      const bind = (id, key, num) => { const el = box.querySelector(id); if (el) el.addEventListener('input', (e) => { st[key] = num ? pnum(e.target.value) : e.target.value; }); };
      bind('#pcMainPres','mainPres'); bind('#pcContentQty','contentQty',true); bind('#pcBaseUnit','baseUnit');
      box.querySelector('#pcContentQty')?.addEventListener('input', () => { const el = $('#pcEquiv'); if (el) el.textContent = `1 ${st.mainPres} = ${st.contentQty} ${st.baseUnit}`; });
      $('#pcAddPres').addEventListener('click', () => {
        const name = $('#pcPresName').value.trim();
        const factor = Math.max(1, parseInt($('#pcPresFactor').value) || 1);
        const price = pnum($('#pcPresPrice').value) || (calcFinalPrice() * factor * 0.95);
        if (!name) { toast('Ingrese nombre de la presentación', 'warn'); return; }
        st.presentations.push({ id: 'pres-' + Date.now(), name, factor, priceUSD: price, barcode: $('#pcPresBarcode').value.trim() || undefined });
        $('#pcPresName').value = ''; $('#pcPresPrice').value = ''; $('#pcPresBarcode').value = '';
        paintPres();
      });
    };

    // === TAB 5: SUPPLIERS ===
    const renderTabSuppliers = (box) => {
      const highestCost = st.suppliersInfo.length > 0 ? Math.max(...st.suppliersInfo.map(s => s.costUSD)) : null;
      box.innerHTML = `
        <div style="padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;margin-bottom:12px;font-size:12px;color:#1e3a5f">
          <b>Proveedores del Producto y Regla del Costo Más Alto</b>
          <div style="font-size:11px;margin-top:2px">El sistema tomará automáticamente el costo más alto entre proveedores.</div>
        </div>
        <div class="form-grid" style="margin-bottom:12px">
          <div class="field span-2"><label>Proveedor</label>
            <select id="pcSupSelect">${db.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Costo Proveedor (USD)</label><input id="pcSupCost" type="text" inputmode="decimal" value="${fmtDec(highestCost || st.costUSD)}" /></div>
          <div class="field"><label>Código Barras Proveedor</label><input id="pcSupBarcode" placeholder="759..." /></div>
        </div>
        <button type="button" class="btn sm primary" id="pcAddSup">+ Asociar Proveedor</button>
        <div id="pcSupList" style="margin-top:10px"></div>`;
      const paintSup = () => {
        const list = $('#pcSupList'); if (!list) return;
        if (st.suppliersInfo.length === 0) { list.innerHTML = '<div style="font-size:11px;color:#9ca3af;text-align:center;padding:16px;border:2px dashed #e5e7eb;border-radius:8px">Sin proveedores vinculados</div>'; return; }
        const maxC = Math.max(...st.suppliersInfo.map(s => s.costUSD));
        list.innerHTML = `<table class="dt"><thead><tr><th>Proveedor</th><th>Cód. Barras</th><th style="text-align:right">Costo USD</th><th>Estado</th><th></th></tr></thead><tbody>
          ${st.suppliersInfo.map((s, i) => `<tr style="${s.costUSD===maxC?'background:#eff6ff':''}">
            <td><b>${esc(s.supplierName)}</b></td>
            <td style="font-family:monospace;font-size:11px">${esc(s.barcode||'')}</td>
            <td style="text-align:right;font-weight:700">$${fmtDec(s.costUSD)}</td>
            <td>${s.costUSD===maxC?'<span class="pill blue">Costo Máximo</span>':'<span style="font-size:10px;color:#9ca3af">Menor</span>'}</td>
            <td><button type="button" class="btn sm danger" data-rmsup="${i}">&times;</button></td>
          </tr>`).join('')}
        </tbody></table>`;
        list.querySelectorAll('[data-rmsup]').forEach(b => b.addEventListener('click', () => { st.suppliersInfo.splice(+b.dataset.rmsup, 1); paintSup(); }));
      };
      paintSup();
      $('#pcAddSup').addEventListener('click', () => {
        const supId = $('#pcSupSelect').value;
        const sup = db.suppliers.find(s => s.id === +supId);
        if (!sup) { toast('Seleccione un proveedor', 'warn'); return; }
        const cost = pnum($('#pcSupCost').value);
        if (cost <= 0) { toast('Ingrese un costo válido', 'warn'); return; }
        if (st.suppliersInfo.some(s => s.supplierId === sup.id)) { toast('Este proveedor ya está vinculado', 'warn'); return; }
        st.suppliersInfo.push({ id: 'ps-' + Date.now(), supplierId: sup.id, supplierName: sup.name, costUSD: cost, barcode: $('#pcSupBarcode').value.trim() || st.code });
        paintSup();
      });
    };

    // === TAB 6: COMPOSITE ===
    const renderTabComposite = (box) => {
      const totalCost = st.compositeComponents.reduce((s, c) => s + c.costUSD * c.quantity, 0);
      box.innerHTML = `
        <div style="padding:10px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;margin-bottom:12px">
          <label style="font-size:12px;font-weight:700;display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="pcIsComposite" ${st.isComposite?'checked':''} />
            Producto Compuesto (Kit / Combo)
          </label>
          <div style="font-size:11px;color:#6b7280;margin-top:4px">Combina productos existentes en un paquete. El stock se calcula virtualmente.</div>
        </div>
        <div id="pcCompositeSection" style="${st.isComposite?'':'display:none'}">
          <div class="form-grid" style="margin-bottom:8px">
            <div class="field span-2"><label>Producto componente</label>
              <select id="pcCompProd">${db.products.filter(x => !editing || x.id !== id).map(x => `<option value="${x.id}">${esc(x.code)} — ${esc(x.name)}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Cantidad</label><input id="pcCompQty" type="number" min="1" value="1" /></div>
          </div>
          <button type="button" class="btn sm primary" id="pcAddComp">+ Agregar Componente</button>
          <div id="pcCompList" style="margin-top:10px"></div>
          <div style="margin-top:8px;padding:8px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;font-size:12px">
            <b>Costo Total Kit:</b> $${fmtDec(totalCost)} · <b>Stock Virtual:</b> ${st.compositeComponents.length > 0 ? Math.min(...st.compositeComponents.map(c => { const pr = db.products.find(x => x.id === +c.productId); return pr ? Math.floor((pr.stockBase||0) / c.quantity) : 0; })) : 0} combos
          </div>
        </div>`;
      const paintComp = () => {
        const list = $('#pcCompList'); if (!list) return;
        if (st.compositeComponents.length === 0) { list.innerHTML = '<div style="font-size:11px;color:#9ca3af;text-align:center;padding:12px">Sin componentes</div>'; return; }
        list.innerHTML = st.compositeComponents.map((c, i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:4px;font-size:11px">
          <div><b>${esc(c.productName)}</b> × ${c.quantity} · <span style="color:#7c3aed;font-weight:700">$${fmtDec(c.costUSD * c.quantity)}</span></div>
          <button type="button" class="btn sm danger" data-rmcomp="${i}">&times;</button>
        </div>`).join('');
        list.querySelectorAll('[data-rmcomp]').forEach(b => b.addEventListener('click', () => { st.compositeComponents.splice(+b.dataset.rmcomp, 1); paintComp(); }));
      };
      paintComp();
      $('#pcIsComposite').addEventListener('change', (e) => { st.isComposite = e.target.checked; $('#pcCompositeSection').style.display = e.target.checked ? '' : 'none'; });
      $('#pcAddComp').addEventListener('click', () => {
        const prodId = $('#pcCompProd').value;
        const prod = db.products.find(x => x.id === +prodId);
        if (!prod) return;
        if (st.compositeComponents.some(c => c.productId === prod.id)) { toast('Este componente ya está incluido', 'warn'); return; }
        const qty = Math.max(1, parseInt($('#pcCompQty').value) || 1);
        st.compositeComponents.push({ productId: prod.id, productName: prod.name, quantity: qty, costUSD: Number(prod.cost) || 0 });
        paintComp();
      });
    };

    // Initial render
    switchTab('general');

    // Save handler
    $('#pcSave').addEventListener('click', () => {
      if (!st.name.trim()) { toast('Ingrese el nombre del producto', 'warn'); return; }
      if (demoProductLimit()) { demoBlock('Límite de productos alcanzado'); return; }
      const rc = calcRealCost(), finalPrice = calcFinalPrice();
      const prod = {
        id: editing ? source.id : Date.now(),
        code: st.code.trim() || ('P' + Date.now()),
        name: st.name.trim(),
        category: st.category.trim() || 'General',
        description: st.description.trim(),
        unit: st.unit,
        image: st.image,
        taxed: st.ivaRate > 0,
        weighed: st.allowedModes.contentControl,
        invBasePres: { unidad: st.mainPres, contenido: st.contentQty, precio: finalPrice },
        invBaseUnit: st.baseUnit,
        invPres: st.presentations.map(pr => ({ unidad: pr.name, equiv: pr.factor, precio: pr.priceUSD, tipo: 'MANUAL', activa: true, base: false })).concat([{ unidad: st.mainPres, equiv: st.contentQty, precio: finalPrice, tipo: 'MANUAL', activa: true, base: true }]),
        stockBase: st.stock,
        stockMinimo: st.stockMin,
        stockMaximo: st.stockMax,
        cost: rc,
        margin: st.marginPct,
        pricingMethod: st.pricingMethod,
        gapPct: st.gapPct,
        manualPriceUSD: st.manualPriceUSD,
        ivaRate: st.ivaRate,
        additionalExpensesPct: st.addExpensesPct,
        lastCostUSD: st.lastCostUSD,
        priceListMatrix: st.matrix,
        reorderPoint: st.reorderPoint,
        warehouse: st.warehouse,
        location: st.location,
        allowedModes: st.allowedModes,
        pricePerKg: st.isWeighable ? st.pricePerKg : 0,
        presentations: st.presentations,
        suppliersInfo: st.suppliersInfo,
        highestSupplierCost: st.suppliersInfo.length > 0 ? Math.max(...st.suppliersInfo.map(s => s.costUSD)) : undefined,
        isComposite: st.isComposite,
        compositeComponents: st.isComposite ? st.compositeComponents : undefined,
        variantGroup: p.variantGroup
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
  const cajas = [...new Set(db.sales.map(s => s.caja_id).filter(Boolean))];
  const html = `
    <div class="module-head">
      <h3>Historial de ventas</h3>
    </div>
    <div class="grid cols-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-info"><div class="lbl">Total ventas</div><div class="val">${fmt.money(total)}</div></div><div class="kpi-ico">${ico('cxc')}</div></div>
      <div class="kpi k-blue"><div class="kpi-info"><div class="lbl">Operaciones</div><div class="val">${db.sales.length}</div></div><div class="kpi-ico">${ico('sales')}</div></div>
      <div class="kpi k-green"><div class="kpi-info"><div class="lbl">Contado</div><div class="val">${db.sales.filter(s => s.status === 'paid').length}</div></div><div class="kpi-ico">${ico('check')}</div></div>
      <div class="kpi k-orange"><div class="kpi-info"><div class="lbl">A crédito</div><div class="val">${db.sales.filter(s => s.status === 'credit').length}</div></div><div class="kpi-ico">${ico('pending')}</div></div>
    </div>
    ${cajas.length > 1 ? `<div class="grid cols-${Math.min(cajas.length, 4)}" style="margin-bottom:14px">
      ${cajas.map(cid => {
        const ss = db.sales.filter(s => s.caja_id === cid);
        return `<div class="kpi k-blue"><div class="kpi-info"><div class="lbl">${cid}</div><div class="val">${fmt.money(ss.reduce((s,x)=>s+x.total,0))}</div><div class="delta">${ss.length} ventas</div></div><div class="kpi-ico">${ico('cashbox')}</div></div>`;
      }).join('')}
    </div>` : ''}
    <div class="dt">
      <div class="dt-toolbar">
        <h3>Ventas registradas</h3>
        <div class="tools">
          <input class="search" id="salSearch" placeholder="Buscar por cliente o número..." />
          <select id="salStatus"><option value="">Todas</option><option value="paid">Pagadas</option><option value="credit">A crédito</option><option value="refunded">Reembolsadas</option></select>
          ${cajas.length > 1 ? `<select id="salCaja"><option value="">Todas las cajas</option>${cajas.map(c => `<option value="${c}">${c}</option>`).join('')}</select>` : ''}
        </div>
      </div>
      <div class="dt-wrap">
        <table class="dt">
          <thead><tr><th>Fecha</th><th>N° Recibo</th><th>Caja</th><th>Cliente</th><th class="num">Items</th><th class="num">Total</th><th>Estado</th></tr></thead>
          <tbody id="salTbody"></tbody>
        </table>
      </div>
    </div>
  `;
  $('#dashContent').innerHTML = html;
  paintSales();
  $('#salSearch').addEventListener('input', paintSales);
  $('#salStatus').addEventListener('change', paintSales);
  $('#salCaja')?.addEventListener('change', paintSales);
}

function paintSales() {
  const q = ($('#salSearch')?.value || '').toLowerCase();
  const st = $('#salStatus')?.value || '';
  const cid = $('#salCaja')?.value || '';
  const list = db.sales.filter(s => {
    if (st && s.status !== st) return false;
    if (cid && s.caja_id !== cid) return false;
    if (q && !s.client.toLowerCase().includes(q) && !s.number.includes(q)) return false;
    return true;
  });
  const tb = $('#salTbody');
  if (!tb) return;
  if (list.length === 0) { tb.innerHTML = `<tr><td colspan="7" class="empty">Sin ventas</td></tr>`; return; }
  tb.innerHTML = list.map(s => `
    <tr>
      <td>${s.date}</td>
      <td><code>${s.number}</code></td>
      <td><small>${s.caja_id || '—'}</small></td>
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
      <div class="field"><label>Fecha</label><input type="date" id="cxcDate" value="${veDate()}" /></div>
      <div class="field"><label>Tipo</label><select id="cxcType"><option>FAC</option><option>NCR</option><option>ND</option></select></div>
      <div class="field span-2"><label>Cliente</label><select id="cxcClient">${db.clients.map(c => `<option value="${c.id}">${c.name} (${c.code})</option>`).join('')}</select></div>
      <div class="field"><label>N° Documento</label><input id="cxcNum" value="F-2025-${String(Math.floor(Math.random()*999)).padStart(3,'0')}" /></div>
      <div class="field"><label>Total</label><input type="number" step="0.01" id="cxcTotal" value="0" /></div>
      <div class="field"><label>Vencimiento</label><input type="date" id="cxcDue" value="${(() => { const d = new Date(); d.setDate(d.getDate()+30); return d.toISOString().slice(0,10); })()}" /></div>
      <div class="field span-2"><label>Motivo</label><input id="cxcMotivo" type="text" placeholder="Describa el motivo de la factura (texto libre)..." /></div>
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
        dueDate: $('#cxcDue').value, status: 'pending',
        motivo: $('#cxcMotivo').value.trim()
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
    <div class="field"><label>Fecha</label><input type="date" id="payDate" value="${veDate()}" /></div>
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
      <div class="field"><label>Fecha</label><input type="date" id="pDate" value="${veDate()}" /></div>
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
    <div class="field"><label>Fecha</label><input type="date" id="sppDate" value="${veDate()}" /></div>
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

/* Código correlativo con prefijo: CLI-0000001, PROV-0000001, … */
function nextCorrelative(prefix, list) {
  let n = 0;
  (Array.isArray(list) ? list : []).forEach(x => {
    const m = /^([A-Za-z]+)-(\d+)$/.exec(String(x.code || ''));
    if (m && m[1].toUpperCase() === prefix.toUpperCase()) { const v = parseInt(m[2], 10); if (v > n) n = v; }
  });
  return prefix.toUpperCase() + '-' + String(n + 1).padStart(7, '0');
}

function clientForm(id) {
  const c = id ? db.clients.find(x => x.id === id) : { code: '', name: '', taxId: '', address: '', phone: '', email: '', creditLimit: 0, balance: 0, status: 'active' };
  if (!id) c.code = nextCorrelative('CLI', db.clients);
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
      if (!id && isDemo()) { demoBlock('Version Demo: no se permiten nuevas altas de clientes. Adquiera la version completa.'); return; }
      if (id) Object.assign(c, data);
      else db.clients.push({ id: Date.now(), createdAt: veDate(), ...data });
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
  if (!id) s.code = nextCorrelative('PROV', db.suppliers);
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
      if (!id && isDemo()) { demoBlock('Version Demo: no se permiten nuevas altas de proveedores. Adquiera la version completa.'); return; }
      if (id) Object.assign(s, data);
      else db.suppliers.push({ id: Date.now(), ...data });
      DB.save(db); closeModal(); renderSuppliers();
      toast('Proveedor guardado', 'success');
    });
  }, 60);
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
  $('#newMove').addEventListener('click', () => { if (isDemo()) { demoBlock('Version Demo: no se permiten nuevos movimientos contables. Adquiera la version completa.'); return; } accountingForm(); });
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
      <div class="field"><label>Fecha</label><input type="date" id="mvDate" value="${veDate()}" /></div>
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
        <button class="btn" id="zHist">${ico('reports')} Cierres Z</button>
        <button class="btn primary" id="newCash">+ Movimiento de caja</button>
      </div>
    </div>
    <div class="grid cols-3" style="margin-bottom:14px">
      <div class="kpi k-green"><div class="kpi-info"><div class="lbl">Caja neto (USD)</div><div class="val">${fmt.money(db.cashbox.reduce((s, c) => s + (Number(c.amount) || 0), 0))}</div></div><div class="kpi-ico">${ico('cash')}</div></div>
      <div class="kpi k-blue"><div class="kpi-info"><div class="lbl">Aperturas</div><div class="val">${db.cashbox.filter(c => c.type === 'apertura').length}</div></div><div class="kpi-ico">${ico('cashbox')}</div></div>
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
  const zh = $('#zHist'); if (zh) zh.addEventListener('click', () => posZHistory());
}

function posZHistory() {
  const list = Array.isArray(db.jornadaZ) ? db.jornadaZ : [];
  const body = list.length === 0
    ? '<div class="dt empty">Aún no hay cierres de jornada (Reportes Z) registrados.</div>'
    : `<table class="dt" style="width:100%"><thead><tr><th>Fecha</th><th>Cerró</th><th>Ventas</th><th>N°</th><th class="num">Total</th><th>Efec. Bs</th><th>Efec. USD</th><th></th></tr></thead><tbody>
        ${list.map(z => `
          <tr>
            <td>${String(z.date || z.closedAt || '').slice(0, 10)}</td>
            <td>${z.cajero || '—'}</td>
            <td>${z.nVentas ?? '—'}</td>
            <td>${z.nArt ?? '—'}</td>
            <td class="num"><b>${fmt.money(z.total || 0)}</b></td>
            <td class="num">Bs. ${fmt.esp(z.totalEfecBs || 0)}</td>
            <td class="num">${fmt.money(z.totalEfecUsd || 0)}</td>
            <td class="actions-cell"><button class="btn sm" data-zv="${z.id}">Ver</button></td>
          </tr>`).join('')}
      </tbody></table>`;
  const footer = `<button class="btn" onclick="closeModal()">Cerrar</button>`;
  openModal({ title: 'Historial de cierres (Reporte Z)', body, footer, size: 'modal-lg' });
  setTimeout(() => {
    $$('button[data-zv]').forEach(b => b.addEventListener('click', () => posZHistoryDetail(+b.dataset.zv)));
  }, 60);
}

function posZHistoryDetail(id) {
  const z = (Array.isArray(db.jornadaZ) ? db.jornadaZ : []).find(x => x.id === id);
  if (!z) return;
  const padM = (l, v) => String(l).padEnd(18) + String(v).padStart(14);
  const lns = [];
  const push = (s) => lns.push(s);
  push('     POSsystem Evolution       ');
  push('   Reporte Z (histórico)       ');
  push(' ');
  push('Fecha  : ' + String(z.closedAt || z.date || ''));
  push('Cajero : ' + (z.cajero || '—'));
  push('==================================');
  push('Ventas del día : ' + (z.nVentas ?? 0));
  push('Artículos      : ' + (z.nArt ?? 0));
  push('----------------------------------');
  push(padM('Base', fmt.money(z.base || 0)));
  push(padM('IVA', fmt.money(z.iva || 0)));
  push(padM('TOTAL VENTAS', fmt.money(z.total || 0)));
  push('----------------------------------');
  push(padM('Contado', fmt.money(z.contado || 0)));
  push(padM('Crédito (CxC)', fmt.money(z.credito || 0)));
  push(padM('Reembolsos', fmt.money(z.reemb || 0)));
  push('==================================');
  push(padM('Fondo inicial Bs.', 'Bs. ' + fmt.esp(z.fondosBs || 0)));
  push(padM('TOTAL Efec. Bs.', 'Bs. ' + fmt.esp(z.totalEfecBs || 0)));
  push('----------------------------------');
  push(padM('Fondo inicial USD', fmt.money(z.fondosUsd || 0)));
  push(padM('TOTAL Efec. USD', fmt.money(z.totalEfecUsd || 0)));
  push('==================================');
  if (Array.isArray(z.methods) && z.methods.length) {
    push('VENTAS POR METODO DE PAGO');
    z.methods.forEach(m => { const lbl = METHOD_LBL ? METHOD_LBL(m.k) : m.k; push('  ' + String(lbl).padEnd(16) + fmt.esp(m.usd).padStart(12)); });
    push('==================================');
  }
  const esc = lns.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const footer = `<button class="btn" onclick="closeModal()">Volver</button>
                  <button class="btn primary" id="zvPrint">${ico('print')} Imprimir</button>`;
  openModal({ title: 'Reporte Z — ' + (z.date || ''), body: `<div class="z-report-preview"><span style="white-space:pre">${esc}</span></div>`, footer });
  setTimeout(() => {
    $('#zvPrint').addEventListener('click', () => {
      printHtml(thermalShell('Reporte Z ' + (z.date || ''), lns));
      toast('Imprimiendo Reporte Z', 'success');
    });
  }, 60);
}

function cashForm() {
  const html = `
    <div class="form-grid">
      <div class="field"><label>Fecha</label><input type="date" id="cbDate" value="${veDate()}" /></div>
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
        date: $('#cbDate').value + ' ' + veTime(),
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
              <button class="btn primary" onclick="reportInventoryPDF()">Descargar PDF</button>
              <button class="btn" onclick="exportReport('inventario',${JSON.stringify(csvRows).replace(/"/g, '&quot;')})">Exportar CSV</button>` });
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
  `, footer: `<button class="btn" onclick="closeModal()">Cerrar</button>
              <button class="btn primary" onclick="reportSalesPDF()">Descargar PDF</button>
              <button class="btn" onclick="reportSalesCSV()">${ico('export')} Exportar CSV</button>` });
}
function reportSalesCSV() {
  const rows = db.sales.map(s => [s.date, s.number, s.client, s.items, s.total.toFixed(2), s.status]);
  exportReport('reporte_ventas', rows.map(r => r.map(escCSV).join(',')).join('\n'), 'Fecha,Recibo,Cliente,Items,Total,Estado');
}

function reportCxC() {
  openModal({ title: 'Estado de cuentas por cobrar', size: 'modal-lg', body: `
    <div class="dt-wrap" style="max-height:400px;overflow:auto">
      <table class="dt">
        <thead><tr><th>Cliente</th><th>Documento</th><th>Vence</th><th class="num">Total</th><th class="num">Saldo</th><th>Estado</th></tr></thead>
        <tbody>${db.receivables.map(r => `<tr><td>${r.client}</td><td><code>${r.docNumber}</code></td><td>${fmt.date(r.dueDate)}</td><td class="num">${fmt.money(r.total)}</td><td class="num"><b>${fmt.money(r.balance)}</b></td><td>${statusPill(r.status)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
  `, footer: `<button class="btn" onclick="closeModal()">Cerrar</button>
              <button class="btn primary" onclick="reportCXCPDF()">Descargar PDF</button>
              <button class="btn" onclick="reportCXCCSV()">${ico('export')} Exportar CSV</button>` });
}
function reportCXCCSV() {
  const rows = db.receivables.map(r => [r.client, r.docNumber, r.dueDate, r.total.toFixed(2), r.balance.toFixed(2), r.status]);
  exportReport('estado_cxc', rows.map(r => r.map(escCSV).join(',')).join('\n'), 'Cliente,Documento,Vence,Total,Saldo,Estado');
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
  `, footer: `<button class="btn" onclick="closeModal()">Cerrar</button>
              <button class="btn primary" onclick="reportPLPDF()">Descargar PDF</button>
              <button class="btn" onclick="reportPLCSV()">${ico('export')} Exportar CSV</button>` });
}
function reportPLCSV() {
  const i = db.accounting.filter(a => a.type === 'ingreso').reduce((s, a) => s + a.amount, 0);
  const e = db.accounting.filter(a => a.type === 'egreso').reduce((s, a) => s + a.amount, 0);
  const u = i - e;
  exportReport('estado_resultados', [['Ingresos', i], ['Egresos', e], ['Utilidad neta', u]].map(r => r.map(escCSV).join(',')).join('\n'), 'Concepto,Monto');
}

function reportPurchases() {
  const grouped = {};
  db.purchases.forEach(p => { grouped[p.supplier] = (grouped[p.supplier] || 0) + p.total; });
  openModal({ title: 'Compras por proveedor', body: `
    <table class="dt" style="width:100%">
      <thead><tr><th>Proveedor</th><th class="num">Total comprado</th><th class="num">%</th></tr></thead>
      <tbody>${Object.entries(grouped).map(([s, t]) => `<tr><td>${s}</td><td class="num">${fmt.money(t)}</td><td class="num">${((t / Object.values(grouped).reduce((a, b) => a + b, 0)) * 100).toFixed(1)}%</td></tr>`).join('')}</tbody>
    </table>
  `, footer: `<button class="btn" onclick="closeModal()">Cerrar</button>
              <button class="btn primary" onclick="reportPurchasesPDF()">Descargar PDF</button>
              <button class="btn" onclick="reportPurchasesCSV()">${ico('export')} Exportar CSV</button>` });
}
function reportPurchasesCSV() {
  const grouped = {};
  db.purchases.forEach(p => { grouped[p.supplier] = (grouped[p.supplier] || 0) + p.total; });
  const tot = Object.values(grouped).reduce((a, b) => a + b, 0) || 1;
  const rows = Object.entries(grouped).map(([s, t]) => [s, t.toFixed(2), ((t / tot) * 100).toFixed(1) + '%']);
  exportReport('compras_proveedor', rows.map(r => r.map(escCSV).join(',')).join('\n'), 'Proveedor,Total,%');
}

function reportTop() {
  // Ranking real por unidades vendidas (agrega las líneas de todas las ventas).
  const sold = new Map();
  db.sales.forEach(s => (s.lines || []).forEach(l => {
    const k = l.pid != null ? String(l.pid) : String(l.code || '');
    if (!k) return;
    const e = sold.get(k) || { qty: 0, rev: 0 };
    e.qty += Number(l.qty) || 0;
    e.rev += (Number(l.price) || 0) * (Number(l.qty) || 0);
    sold.set(k, e);
  }));
  const top = [...sold.entries()].map(([k, e]) => {
    const p = db.products.find(x => String(x.id) === k || String(x.code) === k);
    return { name: p ? p.name : '(producto eliminado)', category: p ? p.category : '—', code: p ? p.code : k, qty: e.qty, rev: e.rev };
  }).sort((a, b) => b.qty - a.qty).slice(0, 10);
  openModal({ title: 'Productos más vendidos', size: 'modal-lg', body: `
    ${top.length === 0 ? '<div class="dt empty">Sin ventas registradas</div>'
      : `<table class="dt" style="width:100%">
      <thead><tr><th>#</th><th>Producto</th><th>Categoría</th><th class="num">Unid. vendidas</th><th class="num">Venta total</th></tr></thead>
      <tbody>${top.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}</td><td>${p.category}</td><td class="num">${fmt.num(p.qty)}</td><td class="num">${fmt.money(p.rev)}</td></tr>`).join('')}</tbody>
    </table>`}
  `, footer: `<button class="btn" onclick="closeModal()">Cerrar</button>
              <button class="btn primary" onclick="reportTopPDF()">Descargar PDF</button>
              <button class="btn" onclick="reportTopCSV()">${ico('export')} Exportar CSV</button>` });
}
function reportTopCSV() {
  const sold = new Map();
  db.sales.forEach(s => (s.lines || []).forEach(l => {
    const k = l.pid != null ? String(l.pid) : String(l.code || '');
    if (!k) return;
    const e = sold.get(k) || { qty: 0, rev: 0 };
    e.qty += Number(l.qty) || 0;
    e.rev += (Number(l.price) || 0) * (Number(l.qty) || 0);
    sold.set(k, e);
  }));
  const rows = [...sold.entries()].map(([k, e]) => {
    const p = db.products.find(x => String(x.id) === k || String(x.code) === k);
    return [p ? p.code : k, p ? p.name : '(producto eliminado)', p ? p.category : '—', e.qty, e.rev.toFixed(2)];
  });
  exportReport('productos_mas_vendidos', rows.map(r => r.map(escCSV).join(',')).join('\n'), 'Codigo,Producto,Categoria,Unidades,Venta');
}

/* ---------------- Generación de PDF profesionales ---------------- */
function reportInventoryPDF() {
  toastPdf();
  const plist = db.products.map(p => { canonicalizeProduct(p); return p; });
  const total = plist.reduce((s, p) => s + invBaseWhole(p) * invDefaultPrice(p), 0);
  const units = plist.reduce((s, p) => s + invStock(p), 0);
  const rows = plist.map(p => [
    p.code, p.name, p.category, invBreakdown(p, invStock(p)),
    '$ ' + fmt.esp(invDefaultPrice(p)), fmt.money(invBaseWhole(p) * invDefaultPrice(p))
  ]);
  exportReportPDF({
    title: 'Inventario',
    subtitle: 'Valorización actual del inventario · ' + plist.length + ' productos · ' + units.toFixed(0) + ' unidades canónicas',
    columns: ['Código', 'Producto', 'Categoría', 'Stock', 'Precio (pres. base)', 'Valor'],
    rows,
    align: ['left', 'left', 'left', 'center', 'right', 'right'],
    totals: ['', 'TOTAL', '', '', '', fmt.money(total)],
    fileName: 'reporte_inventario.pdf'
  });
}

function reportSalesPDF() {
  toastPdf();
  const tot = db.sales.reduce((s, x) => s + x.total, 0);
  const rows = db.sales.map(s => [String(s.date).slice(0, 10), s.number, s.client, s.items, fmt.money(s.total), s.status]);
  exportReportPDF({
    title: 'Historial de Ventas',
    subtitle: db.sales.length + ' operaciones · Total ' + fmt.money(tot),
    columns: ['Fecha', 'Recibo', 'Cliente', 'Items', 'Total', 'Estado'],
    rows,
    align: ['left', 'left', 'left', 'center', 'right', 'center'],
    totals: ['', 'TOTAL', '', '', fmt.money(tot), ''],
    fileName: 'reporte_ventas.pdf'
  });
}

function reportCXCPDF() {
  toastPdf();
  const bal = db.receivables.reduce((s, r) => s + (r.balance || 0), 0);
  const rows = db.receivables.map(r => [r.client, r.docNumber, fmt.date(r.dueDate), fmt.money(r.total), fmt.money(r.balance), r.status]);
  exportReportPDF({
    title: 'Estado de Cuentas por Cobrar (CxC)',
    subtitle: 'Documentos registrados · Saldo total por cobrar ' + fmt.money(bal),
    columns: ['Cliente', 'Documento', 'Vence', 'Total', 'Saldo', 'Estado'],
    rows,
    align: ['left', 'left', 'left', 'right', 'right', 'center'],
    totals: ['', 'TOTAL', '', '', fmt.money(bal), ''],
    fileName: 'estado_cxc.pdf'
  });
}

function reportPLPDF() {
  toastPdf();
  const i = db.accounting.filter(a => a.type === 'ingreso').reduce((s, a) => s + a.amount, 0);
  const e = db.accounting.filter(a => a.type === 'egreso').reduce((s, a) => s + a.amount, 0);
  const u = i - e;
  exportReportPDF({
    title: 'Estado de Resultados',
    subtitle: 'Ingresos vs Egresos del período',
    columns: ['Concepto', 'Monto'],
    rows: [['Ingresos', fmt.money(i)], ['(Egresos)', fmt.money(e)]],
    align: ['left', 'right'],
    totals: ['Utilidad Neta', fmt.money(u)],
    note: u >= 0 ? 'El negocio presenta utilidad positiva en el período.' : 'El negocio presenta pérdida en el período.',
    fileName: 'estado_resultados.pdf'
  });
}

function reportPurchasesPDF() {
  toastPdf();
  const grouped = {};
  db.purchases.forEach(p => { grouped[p.supplier] = (grouped[p.supplier] || 0) + p.total; });
  const entries = Object.entries(grouped);
  const grand = entries.reduce((s, [, t]) => s + t, 0) || 1;
  const rows = entries.map(([s, t]) => [s, fmt.money(t), ((t / grand) * 100).toFixed(1) + '%']);
  exportReportPDF({
    title: 'Compras por Proveedor',
    subtitle: 'Resumen de compras agrupado por proveedor',
    columns: ['Proveedor', 'Total comprado', '%'],
    rows,
    align: ['left', 'right', 'center'],
    totals: ['TOTAL', fmt.money(grand === 1 ? 0 : grand), '100%'],
    fileName: 'compras_proveedor.pdf'
  });
}

function reportTopPDF() {
  toastPdf();
  const sold = new Map();
  db.sales.forEach(s => (s.lines || []).forEach(l => {
    const k = l.pid != null ? String(l.pid) : String(l.code || '');
    if (!k) return;
    const e = sold.get(k) || { qty: 0, rev: 0 };
    e.qty += Number(l.qty) || 0;
    e.rev += (Number(l.price) || 0) * (Number(l.qty) || 0);
    sold.set(k, e);
  }));
  const top = [...sold.entries()].map(([k, e]) => {
    const p = db.products.find(x => String(x.id) === k || String(x.code) === k);
    return { name: p ? p.name : '(producto eliminado)', cat: p ? p.category : '—', qty: e.qty, rev: e.rev };
  }).sort((a, b) => b.qty - a.qty).slice(0, 10);
  const rows = top.map((p, i) => [String(i + 1), p.name, p.cat, fmt.num(p.qty), fmt.money(p.rev)]);
  exportReportPDF({
    title: 'Productos más vendidos',
    subtitle: 'Ranking por unidades vendidas',
    columns: ['#', 'Producto', 'Categoría', 'Unid. vendidas', 'Venta total'],
    rows,
    align: ['center', 'left', 'left', 'right', 'right'],
    fileName: 'productos_mas_vendidos.pdf'
  });
}

function exportReport(name, csvBody, header) {
  const h = header || 'Codigo,Descripcion,Categoria,Stock,Precio,Valor';
  const csv = h + '\n' + csvBody;
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name + '.csv'; a.click();
  toast('Reporte exportado', 'success');
}
function escCSV(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }

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
        a.download = 'possystem-backup-' + veDate() + '.json';
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

/* ============================================================
   GESTIÓN DE CAJAS (multi-caja)
   ============================================================ */
function renderCajas() {
  const cajas = isDesktop() ? (db.settings?.cajas || {}) : {};
  const cajaEntries = Object.entries(cajas);
  const totalVentas = db.sales.length;
  const resumen = salesSummaryByCaja();

  const html = `
    <div class="module-head">
      <h3>Gestión de Cajas</h3>
      <div class="actions">
        <button class="btn" id="cjNetConfig">${ico('refresh')} Configurar Red</button>
        <button class="btn primary" id="cjNew">+ Nueva Caja</button>
      </div>
    </div>
    <div class="grid cols-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-info"><div class="lbl">Cajas registradas</div><div class="val">${resumen.length || 1}</div></div><div class="kpi-ico">${ico('cashbox')}</div></div>
      <div class="kpi k-blue"><div class="kpi-info"><div class="lbl">Caja actual</div><div class="val">${getCajaId()}</div></div><div class="kpi-ico">${ico('check')}</div></div>
      <div class="kpi k-green"><div class="kpi-info"><div class="lbl">Ventas totales</div><div class="val">${totalVentas}</div></div><div class="kpi-ico">${ico('cxc')}</div></div>
      <div class="kpi k-orange"><div class="kpi-info"><div class="lbl">Ventas esta caja</div><div class="val">${filterSalesByCaja(getCajaId()).length}</div></div><div class="kpi-ico">${ico('sales')}</div></div>
    </div>
    <div class="dt">
      <div class="dt-toolbar"><h3>Cajas y su actividad</h3></div>
      <div class="dt-wrap">
        <table class="dt">
          <thead><tr><th>ID Caja</th><th>Nombre</th><th>Prefijo</th><th>Próx. #</th><th class="num">Ventas</th><th class="num">Total vendido</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${resumen.map(r => `
              <tr>
                <td><code>${r.caja_id}</code></td>
                <td>${r.caja_nombre}</td>
                <td>${(db.settings?.cajas?.[r.caja_id]?.prefijo || r.caja_id?.slice(-2) || '01')}</td>
                <td>${db.settings?.cajas?.[r.caja_id]?.nextNumber || 1}</td>
                <td class="num">${r.ventas}</td>
                <td class="num"><b>${fmt.money(r.total)}</b></td>
                <td>${r.caja_id === getCajaId() ? '<span class="pill green">Actual</span>' : '<span class="pill blue">Otra</span>'}</td>
                <td></td>
              </tr>`).join('')}
            ${resumen.length === 0 ? `
              <tr>
                <td><code>${getCajaId()}</code></td>
                <td>${getCajaNombre()}</td>
                <td>${getInvoicePrefix()}</td>
                <td>${db.settings?.cajas?.[getCajaId()]?.nextNumber || 1}</td>
                <td class="num">0</td>
                <td class="num">$ 0.00</td>
                <td><span class="pill green">Actual</span></td>
                <td></td>
              </tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <h3 class="card-title">Configuración de numeración por caja</h3>
      <p style="color:#6b7280;font-size:12px;margin:0 0 10px">Cada caja tiene su propio prefijo y secuencia de numeración de facturas, presupuestos, etc.</p>
      <div class="dt-wrap">
        <table class="dt">
          <thead><tr><th>Caja</th><th>Prefijo factura</th><th>Próximo número</th><th></th></tr></thead>
          <tbody id="cjConfigTbody"></tbody>
        </table>
      </div>
    </div>
  `;
  $('#dashContent').innerHTML = html;

  // Pintar configuración de numeración
  const configTb = $('#cjConfigTbody');
  if (configTb) {
    const allCajas = new Set(resumen.map(r => r.caja_id));
    allCajas.add(getCajaId());
    configTb.innerHTML = [...allCajas].map(cid => {
      const conf = db.settings?.cajas?.[cid] || {};
      const pref = conf.prefijo || cid?.slice(-2) || '01';
      const next = conf.nextNumber || 1;
      return `<tr>
        <td><code>${cid}</code></td>
        <td><input class="cj-pref" data-caja="${cid}" value="${pref}" style="width:80px" /></td>
        <td><input type="number" class="cj-next" data-caja="${cid}" value="${next}" min="1" style="width:100px" /></td>
        <td><button class="btn sm primary cj-save" data-caja="${cid}">Guardar</button></td>
      </tr>`;
    }).join('');
    configTb.querySelectorAll('.cj-save').forEach(btn => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.caja;
        const pref = configTb.querySelector(`.cj-pref[data-caja="${cid}"]`).value;
        const next = parseInt(configTb.querySelector(`.cj-next[data-caja="${cid}"]`).value) || 1;
        if (!db.settings.cajas) db.settings.cajas = {};
        db.settings.cajas[cid] = { ...(db.settings.cajas[cid] || {}), prefijo: pref, nextNumber: next };
        DB.save(db);
        toast(`Numeración de ${cid} actualizada`, 'success');
      });
    });
  }

  $('#cjNew')?.addEventListener('click', () => cajaForm());
  $('#cjNetConfig')?.addEventListener('click', openNetworkConfig);
}

function cajaForm() {
  const html = `
    <div class="form-grid">
      <div class="field"><label>Nombre de la caja</label><input id="cjfName" placeholder="Ej: Caja Norte" /></div>
      <div class="field"><label>Prefijo de facturación</label><input id="cjfPref" value="02" maxlength="4" /></div>
      <div class="field"><label>Tipo</label>
        <select id="cjfType"><option value="cliente">Cliente (se conecta a servidor)</option><option value="servidor">Servidor (principal)</option></select>
      </div>
      <div class="field"><label>Cajero asignado (opcional)</label>
        <select id="cjfCashier"><option value="">— Ninguno —</option>${db.users.filter(u => u.role === 'cashier').map(u => `<option value="${u.username}">${u.name}</option>`).join('')}</select>
      </div>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="cjfSave">Crear caja</button>`;
  openModal({ title: 'Nueva Caja', body: html, footer });
  setTimeout(() => {
    $('#cjfSave').addEventListener('click', () => {
      const name = $('#cjfName').value.trim();
      if (!name) { toast('Ingrese el nombre de la caja', 'warn'); return; }
      const cid = 'CAJA-' + name.replace(/\s+/g, '-').toUpperCase().slice(0, 12) + '-' + Date.now().toString(36).slice(-4).toUpperCase();
      if (!db.settings.cajas) db.settings.cajas = {};
      db.settings.cajas[cid] = { prefijo: $('#cjfPref').value || '02', nextNumber: 1 };
      DB.save(db);
      closeModal();
      renderCajas();
      toast('Caja "' + name + '" creada', 'success');
    });
  }, 60);
}

/* ============================================================
   RED / MULTI-CAJA (vista dashboard)
   ============================================================ */
function renderNetwork() {
  const net = getNetworkStatus();
  const pending = 0;
  const html = `
    <div class="module-head">
      <h3>Red / Multi-Caja</h3>
      <div class="actions">
        <button class="btn" id="rnRefresh">Actualizar</button>
      </div>
    </div>
    <div class="grid cols-3" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-info"><div class="lbl">Modo</div><div class="val">${net.role === 'servidor' ? 'Servidor' : net.role === 'cliente' ? 'Cliente' : 'Standalone'}</div></div><div class="kpi-ico">${ico('cashbox')}</div></div>
      <div class="kpi k-blue"><div class="kpi-info"><div class="lbl">Estado</div><div class="val">${net.connected ? 'Conectado' : 'Desconectado'}</div></div><div class="kpi-ico">${net.connected ? ico('check') : ico('close')}</div></div>
      <div class="kpi k-green"><div class="kpi-info"><div class="lbl">IP Local</div><div class="val" id="rnLocalIP">...</div></div><div class="kpi-ico">${ico('refresh')}</div></div>
    </div>
    <div class="grid cols-2">
      <div class="card">
        <h3 class="card-title">Servidor</h3>
        <p style="font-size:13px;color:#6b7280;margin:0 0 10px">Inicie un servidor para que otras cajas se conecten. La caja servidor comparte catálogos (productos, clientes, etc.) y recibe ventas de las cajas cliente.</p>
        ${net.role === 'servidor'
          ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;margin-bottom:10px"><b style="color:#15803d">Servidor activo</b><br><small style="color:#6b7280">IP: ${net.serverIP || '...'} · Las cajas cliente se conectan a esta dirección.</small></div>
             <button class="btn danger" id="rnStopServer">Detener Servidor</button>`
          : `<div class="field"><label>Puerto</label><input type="number" id="rnPort" value="3000" /></div>
             <button class="btn primary" id="rnStartServer" style="margin-top:8px">Iniciar Servidor</button>`
        }
      </div>
      <div class="card">
        <h3 class="card-title">Cliente</h3>
        <p style="font-size:13px;color:#6b7280;margin:0 0 10px">Conectarse a otra caja que actúe como servidor. Los catálogos se sincronizan automáticamente.</p>
        ${net.role === 'cliente'
          ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px;margin-bottom:10px"><b style="color:#1e40af">Conectado al servidor</b><br><small style="color:#6b7280">IP: ${net.serverIP || '...'}</small></div>
             <button class="btn danger" id="rnDisconnect">Desconectar</button>`
          : `<div class="field"><label>IP del servidor</label><input id="rnServerIP" placeholder="192.168.1.100" /></div>
             <div class="field"><label>Puerto</label><input type="number" id="rnClientPort" value="3000" /></div>
             <button class="btn primary" id="rnConnect" style="margin-top:8px">Conectar</button>`
        }
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <h3 class="card-title">Sincronización</h3>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <p style="font-size:12px;color:#6b7280;margin:0">Las operaciones offline se encolan y sincronizan automáticamente cuando hay conexión.</p>
          <p style="font-size:12px;color:#6b7280;margin:4px 0 0">Operaciones pendientes: <b id="rnPending">0</b> · Última sync: <b id="rnLastSync">Nunca</b></p>
        </div>
        <button class="btn" id="rnForceSync">Forzar sincronización</button>
      </div>
    </div>
  `;
  $('#dashContent').innerHTML = html;

  // Obtener IP local
  if (isDesktop() && window.posdesktop.netGetIP) {
    window.posdesktop.netGetIP().then(ip => {
      const el = document.getElementById('rnLocalIP');
      if (el) el.textContent = ip;
    });
  }

  // Verificar pending
  if (isDesktop() && window.posdesktop.syncPending) {
    window.posdesktop.syncPending().then(r => {
      const el = document.getElementById('rnPending');
      if (el && r.ok) el.textContent = r.pending.length;
    });
  }

  // Binds
  $('#rnStartServer')?.addEventListener('click', async () => {
    const port = parseInt($('#rnPort').value) || 3000;
    await startAsServer(port);
    renderNetwork();
  });
  $('#rnStopServer')?.addEventListener('click', async () => {
    await stopNetwork();
    renderNetwork();
  });
  $('#rnConnect')?.addEventListener('click', async () => {
    const ip = $('#rnServerIP').value.trim();
    const port = parseInt($('#rnClientPort').value) || 3000;
    if (!ip) { toast('Ingrese la IP del servidor', 'warn'); return; }
    await connectToServer(ip, port);
    renderNetwork();
  });
  $('#rnDisconnect')?.addEventListener('click', async () => {
    await stopNetwork();
    renderNetwork();
  });
  $('#rnForceSync')?.addEventListener('click', async () => {
    await forceSync();
    toast('Sincronización forzada', 'success');
  });
  $('#rnRefresh')?.addEventListener('click', () => renderNetwork());
}

/* ============================================================
   RESUMEN: Ventas por caja (en overview)
   ============================================================ */
function renderSalesByCajaKPIs() {
  const summary = salesSummaryByCaja();
  if (summary.length <= 1) return '';
  return `<div class="grid cols-${Math.min(summary.length, 4)}" style="margin-bottom:14px">
    ${summary.map(r => `
      <div class="kpi ${r.caja_id === getCajaId() ? '' : 'k-blue'}">
        <div class="kpi-info">
          <div class="lbl">${r.caja_nombre}</div>
          <div class="val">${fmt.money(r.total)}</div>
          <div class="delta">${r.ventas} ventas · ${r.caja_id}</div>
        </div>
        <div class="kpi-ico">${ico('cashbox')}</div>
      </div>
    `).join('')}
  </div>`;
}