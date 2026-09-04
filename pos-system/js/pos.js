/* ============================================================
   pos.js — Lógica del POS (renderizado y acciones)
   ============================================================ */

// Estado del ticket actual
let ticket = {
  items: [],
  customer: db.clients[0],
  number: '010000' + String(db.settings.invoice.nextNumber).padStart(4, '0')
};

// Métodos de pago (orden de presentación). cur: BS | USD
const PAY_METHODS = [
  { k: 'efectivoBs',   lbl: 'Efectivo Bs.',   cur: 'BS' },
  { k: 'pagomovil',    lbl: 'Pagomóvil',      cur: 'BS' },
  { k: 'biopago',      lbl: 'Biopago',        cur: 'BS' },
  { k: 'tarjeta',      lbl: 'Tarjeta',        cur: 'BS' },
  { k: 'efectivoUsd',  lbl: 'Efectivo USD',   cur: 'USD' },
  { k: 'zelle',        lbl: 'Zelle',          cur: 'USD' },
  { k: 'transferencia',lbl: 'Transferencia',  cur: 'BS' }
];
const METHOD_LBL = (k) => { const m = PAY_METHODS.find(x => x.k === k); return m ? m.lbl : k; };

let posUiBound = false;

function renderPOS() {
  renderTicketTable();
  if (posUiBound) return;
  posUiBound = true;
  bindPOSActions();
  bindCustomerWidgets();
  // Marcar campos del cliente como editables
  $$('.cf-row b').forEach(el => {
    el.setAttribute('contenteditable', 'true');
    el.addEventListener('blur', () => {
      const v = el.textContent.trim();
      if (el.id === 'rcptCustomerCode') ticket.customer.code = v;
      if (el.id === 'rcptCustomerName') ticket.customer.name = v;
      if (el.id === 'rcptCustomerAddr') ticket.customer.address = v;
      DB.save(db);
    });
  });
  // El cursor arranca siempre posicionado en la columna de código (siguiente producto)
  setTimeout(focusCodeInput, 60);
}

function renderTicketTable() {
  const body = $('#posItemsBody');
  body.innerHTML = '';
  ticket.items.forEach((it, i) => {
    const tr = document.createElement('tr');
    if (it.weighed) tr.classList.add('is-weighed');
    tr.innerHTML = `
      <td class="ln">${i + 1}</td>
      <td class="code">${it.code}</td>
      <td class="desc">${it.name}</td>
      <td class="qty">${(it.qty).toFixed(3).replace(/\.?0+$/, m => m.includes('.') ? m : '')}</td>
      <td class="um">${unitAbbr(it.present || it.base || 'Und', it.qty)}</td>
      <td class="price"><div class="duo"><b>${fmt.frac(it.price)}</b><small>${fmt.bs(it.price)}</small></div></td>
      <td class="subtotal"><div class="duo"><b>${fmt.money(it.qty * it.price)}</b><small>${fmt.bs(it.qty * it.price)}</small></div></td>
      <td class="offer">${it.offer || 0}%<span class="row-actions"><button data-rm="${i}" title="Quitar">${ico('close')}</button></span></td>
    `;
    body.appendChild(tr);
  });
  // Fila de entrada para el "siguiente producto": la columna de código actúa como
  // buscador manual. El cajero escribe el código y presiona Enter para agregarlo.
  const addTr = document.createElement('tr');
  addTr.className = 'add-row';
  addTr.innerHTML = `
      <td class="ln">${ticket.items.length + 1}</td>
      <td class="code"><input id="posCode" class="code-input" placeholder="Código" autocomplete="off" spellcheck="false" /></td>
      <td class="desc add-hint">Escriba el código del producto y presione <b>Enter</b> para agregarlo</td>
      <td class="qty"></td>
      <td class="um"></td>
      <td class="price"></td>
      <td class="subtotal"></td>
      <td class="offer"></td>
    `;
  body.appendChild(addTr);
  // Bind remove buttons
  $$('button[data-rm]', body).forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.rm;
      ticket.items.splice(i, 1);
      renderTicketTable();
      updateTotals();
    });
  });
  bindCodeInput();
  updateTotals();
}

/* Localiza un producto por su código exacto (manual o lector de barras) */
function lookupProductByCode(code) {
  code = String(code == null ? '' : code).trim();
  if (!code) return null;
  return db.products.find(p => String(p.code).trim() === code) || null;
}

/* Enfoca la fila de entrada de código (buscador manual) cuando el POS está visible */
function focusCodeInput() {
  const pos = $('#posView');
  if (!pos || pos.style.display === 'none') return;
  if ($('#modalBackdrop') && $('#modalBackdrop').style.display === 'flex') return;
  const inp = $('#posCode');
  if (inp) { inp.focus(); }
}

/* Vincula el comportamiento del input de código de la fila "siguiente producto" */
function bindCodeInput() {
  const inp = $('#posCode');
  if (!inp || inp.dataset.bound) return;
  inp.dataset.bound = '1';
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = inp.value;
      if (!code.trim()) return;
      const p = lookupProductByCode(code);
      if (!p) {
        toast('Producto no encontrado: ' + code.trim(), 'error', 2600);
        inp.select();
        return;
      }
      inp.value = '';
      addProductToTicket(p);
      // Re-enfocar la siguiente línea (se omite si se abrió un modal para presentación/peso)
      setTimeout(() => {
        if (!($('#modalBackdrop') && $('#modalBackdrop').style.display === 'flex')) focusCodeInput();
      }, 60);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      inp.blur();
    }
  });
}

function updateTotals() {
  const subtotal = ticket.items.reduce((s, i) => s + i.qty * i.price, 0);
  const taxRate = (db.settings.tax?.rate || 0) / 100;
  // Asumimos precios con IVA incluido; lo extraemos
  const taxIncluded = db.settings.tax?.included !== false;
  let tax = 0, base = subtotal;
  if (taxIncluded) {
    base = subtotal / (1 + taxRate);
    tax = subtotal - base;
  } else {
    tax = subtotal * taxRate;
  }
  const rate = fmt.usdRate();
  $('#totUsdRate').textContent = fmt.num(rate);
  $('#totSubtotal').textContent = fmt.money(base);
  $('#totSubtotalBs').textContent = fmt.bs(base);
  $('#totTax').textContent = fmt.money(tax);
  $('#totTaxBs').textContent = fmt.bs(tax);
  $('#totTotal').textContent = fmt.money(subtotal);
  $('#totTotalBs').textContent = fmt.bs(subtotal);
}

/* ---------- Acciones del POS ---------- */
function bindPOSActions() {
  $$('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => posAction(btn.dataset.fn));
  });
}

/* Saldo deudor + Cobranza + venta a Crédito del cliente vinculado */
function bindCustomerWidgets() {
  const cob = $('#btnCobranza');
  if (cob) cob.addEventListener('click', posCollect);
  const last = $('#btnLastInvoice');
  if (last) last.addEventListener('click', posDaySales);
  const arq = $('#btnArqueo');
  if (arq) arq.addEventListener('click', posArqueo);
  const z = $('#btnReportZ');
  if (z) z.addEventListener('click', posReportZ);
  const rt = $('#btnChangeRate');
  if (rt) rt.addEventListener('click', posChangeRate);
  const cc = $('#btnClearCart');
  if (cc) cc.addEventListener('click', posClearCart);
}
function renderCustomerInfo() {
  const bal = Number(ticket.customer?.balance) || 0;
  const saldo = $('#rcptSaldo');
  const cob = $('#btnCobranza');
  if (saldo) { saldo.textContent = fmt.money(bal); saldo.classList.toggle('debt', bal > 0); }
  if (cob) cob.style.display = bal > 0 ? '' : 'none';
}

function posAction(fn) {
  const map = {
    search: posSearch,
    link: posLink,
    quantity: posQuantity,
    scale: posScale,
    return: posReturn,
    pending: posPending,
    checkout: posCheckout,
    suspend: posSuspend,
    refund: posRefund,
    prices: posPrices,
    customers: posCustomers,
    next: posNext
  };
  if (map[fn]) map[fn]();
}

/* F2 — Buscar producto */
function posSearch() {
  const html = `
    <div class="field">
      <label>Buscar producto (código o nombre)</label>
      <input id="psInput" placeholder="Ej: 010001, mantequilla, aceite..." autofocus />
    </div>
    <div id="psResults" style="margin-top:10px;max-height:340px;overflow:auto"></div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cerrar</button>`;
  openModal({ title: 'F2 — Buscar producto', body: html, footer, size: 'modal-lg' });
  setTimeout(() => {
    const input = $('#psInput');
    input.focus();
    input.addEventListener('input', filterResults);
    filterResults();
    function filterResults() {
      const q = input.value.toLowerCase().trim();
      const list = db.products.filter(p =>
        !q || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
      ).slice(0, 50);
      list.forEach(canonicalizeProduct);
      $('#psResults').innerHTML = list.length === 0
        ? `<div class="empty-state" style="padding:20px"><span class="ico">${ico('search')}</span>Sin resultados</div>`
        : `<table class="dt" style="width:100%"><thead><tr><th>Código</th><th>Descripción</th><th class="num">Precio pres. base</th><th class="num">Precio Bs.</th><th class="num">Stock</th><th></th></tr></thead><tbody>
            ${list.map(p => `
              <tr>
                <td><code>${p.code}</code></td>
                <td>${p.name}</td>
                <td class="num">${fmt.moneyDyn(invDefaultPrice(p))} <small>${unitAbbrPlural(invBasePres(p).unidad)}</small></td>
                <td class="num">${fmt.bs(invDefaultPrice(p))}</td>
                <td class="num" title="${invStock(p)} ${unitAbbr(invBaseUnit(p), invStock(p))}">${invBreakdown(p, invStock(p))}</td>
                <td><button class="btn sm primary" data-add="${p.id}">Agregar</button></td>
              </tr>`).join('')}
          </tbody></table>`;
      $$('button[data-add]', $('#psResults')).forEach(b => {
        b.addEventListener('click', () => {
          const p = db.products.find(x => x.id === +b.dataset.add);
          if (p) {
            closeModal();
            addProductToTicket(p);
          }
        });
      });
    }
  }, 60);
}

/* F3 — Vincular / seleccionar cliente */
function posLink() {
  const html = `
    <div class="field">
      <label>Buscar cliente</label>
      <input id="clInput" placeholder="Nombre, RIF o código..." autofocus />
    </div>
    <div id="clResults" style="max-height:340px;overflow:auto"></div>
  `;
  openModal({ title: 'F3 — Vincular cliente', body: html, size: 'modal-lg', footer: `<button class="btn" onclick="closeModal()">Cerrar</button>` });
  setTimeout(() => {
    const input = $('#clInput');
    input.focus();
    input.addEventListener('input', () => render(input.value));
    render('');
    function render(q) {
      q = (q || '').toLowerCase().trim();
      const list = db.clients.filter(c => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.taxId.toLowerCase().includes(q));
      $('#clResults').innerHTML = `
        <table class="dt" style="width:100%"><thead><tr><th>Código</th><th>Nombre</th><th>RIF/CI</th><th class="num">Saldo</th><th></th></tr></thead>
        <tbody>${list.map(c => `
          <tr>
            <td><code>${c.code}</code></td>
            <td>${c.name}</td>
            <td>${c.taxId}</td>
            <td class="num">${fmt.money(c.balance)}</td>
            <td><button class="btn sm primary" data-cl="${c.id}">Seleccionar</button></td>
          </tr>`).join('')}</tbody></table>`;
      $$('button[data-cl]', $('#clResults')).forEach(b => {
        b.addEventListener('click', () => {
          const c = db.clients.find(x => x.id === +b.dataset.cl);
          if (c) {
            ticket.customer = c;
            $('#rcptCustomerCode').textContent = c.code;
            $('#rcptCustomerName').textContent = c.name;
            $('#rcptCustomerAddr').textContent = c.address || '';
            renderCustomerInfo();
            if ((Number(c.balance) || 0) > 0) {
              toast(`Cliente "${c.name}" vinculado · Saldo: ${fmt.money(c.balance)}`, 'warn', 3200);
            } else {
              toast(`Cliente "${c.name}" vinculado`, 'success');
            }
            closeModal();
          }
        });
      });
    }
  }, 60);
}

/* F4 — Cambiar cantidad del item seleccionado */
function posQuantity() {
  if (ticket.items.length === 0) { toast('No hay items en el ticket', 'warn'); return; }
  const html = `
    <div class="field">
      <label>Item a modificar</label>
      <select id="qtItem">${ticket.items.map((it, i) => `<option value="${i}">${i + 1}. ${it.code} — ${it.name} (cant: ${it.qty})</option>`).join('')}</select>
    </div>
    <div class="field">
      <label>Operación</label>
      <select id="qtOp">
        <option value="set">Establecer cantidad</option>
        <option value="add">Sumar a la cantidad</option>
        <option value="mult">Multiplicar (×N)</option>
      </select>
    </div>
    <div class="field">
      <label>Cantidad</label>
      <input id="qtVal" type="number" step="0.001" min="0" value="1" autofocus />
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="qtOk">Aplicar</button>`;
  openModal({ title: 'F4 — Modificar cantidad', body: html, footer });
  setTimeout(() => {
    $('#qtVal').focus();
    $('#qtOk').addEventListener('click', () => {
      const i = +$('#qtItem').value;
      const v = parseFloat($('#qtVal').value) || 0;
      const op = $('#qtOp').value;
      const it = ticket.items[i];
      if (!it) return;
      if (op === 'set') it.qty = v;
      if (op === 'add') it.qty += v;
      if (op === 'mult') it.qty *= v;
      if (it.qty <= 0) ticket.items.splice(i, 1);
      renderTicketTable();
      closeModal();
      toast('Cantidad actualizada', 'success');
    });
  }, 60);
}

/* F5 — Lectura de balanza */
function posScale() {
  const weighed = ticket.items.map((it, idx) => ({ idx, it })).filter(x => x.it.weighed);
  if (weighed.length === 0) { toast('No hay productos pesados en el ticket. Agréguelo primero (F2)', 'warn'); return; }
  const html = `
    <div class="field">
      <label>Item pesado</label>
      <select id="scItem">${weighed.map((x, i) => `<option value="${x.idx}">${i + 1}. ${x.it.name}</option>`).join('')}</select>
    </div>
    <div class="field">
      <label>Peso leído (kg)</label>
      <input id="scWeight" type="number" step="0.001" min="0" value="1.000" autofocus />
    </div>
    <p style="color:#6b7280;font-size:12px">Simula la lectura del peso desde la balanza.</p>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="scOk">Aplicar</button>`;
  openModal({ title: 'F5 — Balanza', body: html, footer });
  setTimeout(() => {
    $('#scOk').addEventListener('click', () => {
      const i = +$('#scItem').value;
      const w = parseFloat($('#scWeight').value) || 0;
      ticket.items[i].qty = w;
      ticket.items[i].weighed = true;
      renderTicketTable();
      closeModal();
      toast(`Peso aplicado: ${w} kg`, 'success');
    });
  }, 60);
}

/* F6 — Devolver item */
function posReturn() {
  posSearch();
  toast('Use la búsqueda para registrar un item de devolución (precio negativo).', 'info', 3000);
}

/* F7 — Ticket pendiente (guardar sin cobrar) */
function posPending() {
  if (ticket.items.length === 0) { toast('El ticket está vacío', 'warn'); return; }
  const pending = JSON.parse(localStorage.getItem('possystem_pending') || '[]');
  pending.push({
    id: Date.now(),
    date: new Date().toISOString(),
    items: JSON.parse(JSON.stringify(ticket.items)),
    customer: ticket.customer
  });
  localStorage.setItem('possystem_pending', JSON.stringify(pending));
  toast('Ticket guardado como pendiente', 'success');
  resetTicket();
}

function loadPending() {
  return JSON.parse(localStorage.getItem('possystem_pending') || '[]');
}

/* F8 — Cobrar */
function getReceiptLines() {
  const subtotal = ticket.items.reduce((s, i) => s + i.qty * i.price, 0);
  const taxRate = (db.settings.tax?.rate || 0) / 100;
  const base = subtotal / (1 + taxRate);
  const tax = subtotal - base;
  const RW = 46;
  const sep = '='.repeat(RW);
  const padc = (t) => { t = String(t); if (t.length >= RW) return t; const p = Math.floor((RW - t.length) / 2); return ' '.repeat(p) + t + ' '.repeat(RW - p - t.length); };
  const padlr = (l, v) => { l = String(l); v = String(v); const gap = Math.max(1, RW - l.length - v.length); return l + ' '.repeat(gap) + v; };
  const c = db.settings.company;
  const lns = [];
  lns.push(padc(c.name));
  lns.push(padc('RIF: ' + c.rif));
  lns.push(padc(c.address));
  lns.push(padc('Tel: ' + c.phone));
  lns.push(padc('Email: ' + c.email));
  lns.push(padc(c.website));
  lns.push('');
  lns.push(padlr('Recibo:', ticket.number));
  lns.push(padlr('Fecha:', veDate() + ' ' + veHm12(veTime())));
  lns.push(padlr('Cliente:', ticket.customer.name + ' (' + ticket.customer.code + ')'));
  lns.push('');
  lns.push(sep);
  ticket.items.forEach(it => {
    const il = it.code + '  ' + it.name;
    lns.push(il.length > RW ? il.slice(0, RW) : il);
    lns.push(padlr('   ' + it.qty + ' x ' + fmt.num(it.price), fmt.num(it.qty * it.price)));
  });
  lns.push(sep);
  lns.push(padlr('Subtotal:', fmt.money(base)));
  lns.push(padlr('Subtotal Bs:', fmt.bs(base)));
  lns.push(padlr('IVA (' + db.settings.tax.rate + '%):', fmt.money(tax)));
  lns.push(padlr('IVA Bs:', fmt.bs(tax)));
  lns.push(padlr('TOTAL:', fmt.money(subtotal)));
  lns.push(padlr('TOTAL Bs:', fmt.bs(subtotal)));
  lns.push(sep);
  // Pie del recibo: nombre del sistema + mensaje configurable
  String(db.settings.pos.receiptFooter || '').split('\n').map(t => t.trim()).filter(Boolean).forEach(l => lns.push(padc(l)));
  lns.push(padc('POSsystem Evolution'));
  return { lines: lns, base, tax, subtotal, RW };
}

/* Construir HTML del ticket para impresión térmica 80mm */
function buildReceiptHtml() {
  const { lines } = getReceiptLines();
  return `<!doctype html><html><head><meta charset="utf-8"><title>Ticket ${ticket.number}</title><style>
    @page { size: 80mm auto; margin: 0; }
    html,body { margin:0; padding:0; }
    body { font-family:'Courier New','Lucida Console',monospace; font-size:11px; color:#000; width:72mm; }
    .l { white-space:pre; }
  </style></head><body>${lines.map(l => `<div class="l">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`).join('')}</body></html>`;
}

/* Imprimir ticket en impresora térmica 80mm */
function printHtml(html) {
  const f = document.getElementById('printFrame');
  if (!f) return;
  const d = f.contentDocument || f.contentWindow.document;
  d.open(); d.write(html); d.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); }, 150);
}
function printReceipt() {
  if (ticket.items.length === 0) { toast('El ticket está vacío', 'warn'); return; }
  printHtml(buildReceiptHtml());
}

function posCheckout() {
  if (ticket.items.length === 0) { toast('El ticket está vacío', 'warn'); return; }
  const { lines, base, tax, subtotal, RW } = getReceiptLines();
  const rpText = lines.join('\n');
  const rate = fmt.usdRate() || 36;
  const due = fmt.rnd(subtotal, 2); // total a cobrar (moneda en centavos)
  const mi = (k) => PAY_METHODS.find(m => m.k === k);
  const pnumC = (s) => { const v = parseFloat(String(s == null ? '' : s).replace(',', '.')); return isFinite(v) ? v : 0; };
  const usdOf = (cur, amt) => cur === 'BS' ? (amt / (rate || 1)) : amt;
  // Líneas de pago (inicia con un método USD por el total)
  let pl = [{ method: PAY_METHODS.find(m => m.cur === 'USD') ? PAY_METHODS.find(m => m.cur === 'USD').k : 'efectivoUsd', amt: due }];

  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
      <div>
        <div class="receipt-preview">
          <div style="white-space:pre-wrap;font-family:Consolas,'Courier New',monospace;width:${RW}ch;font-weight:600;line-height:1.45">${rpText}</div>
        </div>
      </div>
      <div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;text-align:center;margin-bottom:12px">
          <div style="font-size:12px;color:#166534">Total a pagar</div>
          <div style="font-size:26px;font-weight:800;color:#15803d">${fmt.moneyEsp(due)}</div>
          <div style="font-size:12px;color:#166534">Tasa: ${fmt.esp(rate)} Bs/USD</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          <div style="border:1px solid #fbbf24;border-radius:8px;padding:8px 10px;background:#fffbeb"><div style="font-size:11px;color:#92400e">Restante</div><b id="payFalta" style="color:#92400e">${fmt.moneyEsp(due)}</b><small id="payFaltaBs" style="display:block;color:#b45309"></small></div>
          <div style="border:1px solid #a7f3d0;border-radius:8px;padding:8px 10px;background:#ecfdf5"><div style="font-size:11px;color:#047857">Vuelto</div><b id="payVueltoUsd" style="color:#047857">$ 0,00</b><small id="payVueltoBs" style="display:block;color:#047857"></small></div>
        </div>
        <b style="font-size:12px;color:#374151">Métodos de pago</b>
        <div id="payLines" style="margin:6px 0"></div>
        <button type="button" class="btn sm" id="payAdd">+ Agregar método</button>
      </div>
    </div>
  `;
  const footer = `
    <button class="btn" onclick="printReceipt()">${ico('prices')} Imprimir</button>
    <button class="btn" onclick="closeModal()">Cancelar</button>
    <button class="btn primary" id="payOk">${ico('check')} Cobrar y emitir recibo</button>
  `;
  openModal({ title: 'F8 — Cobrar', body: html, footer, size: 'modal-lg' });
  setTimeout(() => {
    const plLines = () => $('#payLines');
    const paidTotal = () => { let p = 0; pl.forEach(ln => { const m = mi(ln.method); p += usdOf(m.cur, ln.amt || 0); }); return p; };
    const paint = () => {
      const box = plLines(); if (!box) return;
      box.innerHTML = pl.map((ln, i) => {
        const m = mi(ln.method); const cur = m ? m.cur : 'USD';
        const txt = (ln.amt == null || ln.amt === 0) ? '' : fmt.esp(ln.amt);
        const curLbl = cur === 'BS' ? 'Bs.' : 'USD';
        return `<div style="display:grid;grid-template-columns:1.1fr 1fr 76px 150px 28px;gap:6px;align-items:center;margin-bottom:6px" data-i="${i}">
          <select class="pl-m" title="Método de pago">${PAY_METHODS.map(mm => `<option value="${mm.k}" ${mm.k === ln.method ? 'selected' : ''}>${mm.lbl}</option>`).join('')}</select>
          <input type="text" inputmode="decimal" class="pl-a" value="${txt}" placeholder="Monto (${curLbl})" title="Monto en ${curLbl}" />
          <button type="button" class="btn sm pl-rest" title="Completar el saldo restante">Restante</button>
          <span class="pl-usd" style="font-size:11px;color:#15803d"></span>
          <button type="button" class="btn sm danger pl-del" title="Quitar">&times;</button>
        </div>`;
      }).join('');
      Array.from(box.querySelectorAll('[data-i]')).forEach(row => {
        const i = +row.dataset.i;
        const mSel = row.querySelector('.pl-m'); const aIn = row.querySelector('.pl-a');
        mSel.addEventListener('change', () => { pl[i].method = mSel.value; paint(); });
        aIn.addEventListener('input', () => { pl[i].amt = fmt.parseEsp(aIn.value); recalc(); });
        aIn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            pl[i].amt = fmt.parseEsp(aIn.value);
            if (paidTotal() >= due - 0.005) return; // ya cubierto
            const def = PAY_METHODS.find(mm => mm.cur === 'BS') ? PAY_METHODS.find(mm => mm.cur === 'BS').k : 'efectivoBs';
            pl.push({ method: def, amt: 0 });
            paint();
            const els = plLines().querySelectorAll('.pl-a'); if (els.length) els[els.length - 1].focus();
          }
        });
        row.querySelector('.pl-rest').addEventListener('click', () => {
          const m = mi(pl[i].method); const cur = m.cur;
          let paidOthers = 0;
          pl.forEach((ln, j) => { if (j !== i) { const mm = mi(ln.method); paidOthers += usdOf(mm.cur, ln.amt || 0); } });
          const rem = Math.max(0, due - paidOthers);
          pl[i].amt = cur === 'BS' ? rem * rate : rem;
          const inp = row.querySelector('.pl-a'); inp.value = fmt.esp(pl[i].amt);
          recalc();
        });
        row.querySelector('.pl-del').addEventListener('click', () => { pl.splice(i, 1); if (pl.length === 0) pl.push({ method: 'efectivoUsd', amt: 0 }); paint(); recalc(); });
      });
      recalc();
    };
    const recalc = () => {
      const paid = paidTotal();
      const falta = Math.max(0, due - paid);
      const vuelto = Math.max(0, paid - due);
      $('#payFalta').textContent = fmt.moneyEsp(falta);
      $('#payFaltaBs').textContent = fmt.bsEsp(falta * rate);
      $('#payVueltoUsd').textContent = fmt.moneyEsp(vuelto);
      $('#payVueltoBs').textContent = fmt.bsEsp(vuelto * rate);
      Array.from($('#payLines').querySelectorAll('[data-i]')).forEach(row => {
        const i = +row.dataset.i; const m = mi(pl[i].method); const usd = usdOf(m.cur, pl[i].amt || 0); pl[i].usd = usd;
        row.querySelector('.pl-usd').textContent = usd > 0 ? ('= USD ' + fmt.esp(usd)) : '';
      });
    };
    $('#payAdd').addEventListener('click', () => { pl.push({ method: PAY_METHODS.find(mm => mm.cur === 'BS') ? PAY_METHODS.find(mm => mm.cur === 'BS').k : 'efectivoBs', amt: 0 }); paint(); });
    paint();
    $('#payOk').addEventListener('click', () => {
      const isCredit = !!($('#chkCredito') && $('#chkCredito').checked);
      if (!isCredit) {
        const paidR = fmt.rnd(paidTotal(), 2);
        if (paidR < due - 0.005) { toast('Falta por cubrir ' + fmt.moneyEsp(fmt.rnd(due - paidR, 2)), 'warn'); return; }
      }
      const payments = pl.map(ln => { const m = mi(ln.method); const usd = usdOf(m.cur, ln.amt || 0); return { method: ln.method, cur: m.cur, amount: fmt.rnd(ln.amt || 0, m.cur === 'BS' ? 2 : 8), usd: fmt.rnd(usd, 8) }; }).filter(p => p.usd > 0);
      const paid = payments.reduce((s, p) => s + p.usd, 0);
      const changeUSD = Math.max(0, fmt.rnd(paid - due, 2));
      finalizeSale(due, base, tax, { payments, changeUSD });
    });
  }, 60);
}

function finalizeSale(total, base, tax, payData) {
  payData = payData || { payments: [], changeUSD: 0 };
  const isCredit = !!($('#chkCredito') && $('#chkCredito').checked);
  const payments = isCredit ? [] : (payData.payments || []);
  const method = isCredit ? 'credit' : (payments.length === 1 ? payments[0].method : (payments.length > 1 ? 'mixto' : 'efectivoUsd'));
  // Registrar venta
  const sale = {
    id: db.sales.length + 1,
    date: veStamp(),
    rate: fmt.usdRate(),
    client: ticket.customer.name,
    number: ticket.number,
    items: ticket.items.length,
    total: total,
    method: method,
    payments: payments,
    changeUSD: payData.changeUSD || 0,
    status: isCredit ? 'credit' : 'paid',
    lines: ticket.items.map(it => ({
      pid: it.id, code: it.code, name: it.name, present: it.present || '',
      qty: it.qty, content: it.content || 1,
      baseUnits: it.qty * (it.content || 1),
      price: it.price, base: it.base || 'UND'
    }))
  };
  db.sales.unshift(sale);
  // Descontar stock en la UNIDAD CANÓNICA (fuente única): it.content = equiv (unidades canónicas por presentación vendida)
  ticket.items.forEach(it => {
    const pr = db.products.find(x => x.id === it.id);
    if (pr) {
      canonicalizeProduct(pr);
      pr.stockBase = Math.max(0, invStock(pr) - (it.qty * (it.content || 1)));
    }
  });
  // Si es crédito, generar CxC y acumular la deuda del cliente
  if (isCredit) {
    const due = new Date(); due.setDate(due.getDate() + 30);
    db.receivables.unshift({
      id: db.receivables.length + 1,
      date: veDate(),
      client: ticket.customer.name,
      docType: 'FAC',
      docNumber: ticket.number,
      total: total,
      paid: 0,
      balance: total,
      dueDate: due.toISOString().slice(0, 10),
      status: 'pending'
    });
    const cli = db.clients.find(c => c.code === ticket.customer.code);
    if (cli) cli.balance = (cli.balance || 0) + total;
  }
  // Ingreso contable
  db.accounting.unshift({
    id: db.accounting.length + 1,
    date: veDate(),
    type: 'ingreso',
    category: 'Ventas',
    description: `Venta ${ticket.number} — ${ticket.customer.name}`,
    amount: total,
    ref: 'V-' + ticket.number
  });
  // Siguiente número
  db.settings.invoice.nextNumber += 1;
  DB.save(db);
  // Capturar el ticket ANTES de resetear para imprimir la copia correcta
  const receiptHtml = buildReceiptHtml();
  closeModal();
  const changeTxt = sale.changeUSD > 0 ? ' · Vuelto: ' + fmt.money(sale.changeUSD) : '';
  toast(`Venta ${ticket.number} procesada: ${fmt.money(total)}${changeTxt}`, 'success', 3200);
  resetTicket();
  // Impresión automática si está configurada (impresora térmica 80mm)
  if (db.settings.pos?.printAfterSale) { setTimeout(() => printHtml(receiptHtml), 250); }
  // El cursor vuelve a la columna de código para la siguiente venta (reintento tras imprimir,
  // que puede robar el foco)
  setTimeout(focusCodeInput, 60);
  setTimeout(focusCodeInput, 900);
}

function resetTicket() {
  ticket.items = [];
  ticket.customer = db.clients.find(c => c.name === 'Consumidor Final') || db.clients[0];
  ticket.number = '0100' + String(db.settings.invoice.nextNumber).padStart(4, '0');
  $('#rcptCustomerCode').textContent = ticket.customer.code;
  $('#rcptCustomerName').textContent = ticket.customer.name;
  $('#rcptCustomerAddr').textContent = ticket.customer.address || '';
  $('#rcptNumber').textContent = ticket.number;
  if ($('#chkCredito')) $('#chkCredito').checked = false;
  renderCustomerInfo();
  renderTicketTable();
  setTimeout(focusCodeInput, 0);
}

/* Vaciar el carrito actual y volver al cliente por defecto */
function posClearCart() {
  const n = ticket.items.length;
  resetTicket();
  if (n > 0) toast('Carrito vaciado · Cliente: Consumidor Final', 'success');
  else toast('El carrito ya está vacío · Cliente: Consumidor Final', 'info');
}

/* Cobranza: cobrar total o parcial de la deuda del cliente vinculado */
function posCollect() {
  const c = ticket.customer;
  const bal = Number(c?.balance) || 0;
  if (bal <= 0) { toast('El cliente no posee saldo pendiente', 'info'); return; }
  const html = `
    <div class="field"><label>Cliente</label><input value="${c.name}" disabled style="background:#f3f4f6" /></div>
    <div class="field"><label>Saldo pendiente</label><input value="${fmt.money(bal)}" disabled style="background:#f3f4f6;font-family:Consolas,monospace" /></div>
    <div class="field"><label>Monto a cobrar</label><input type="number" step="0.01" min="0" id="pcAmt" value="${bal.toFixed(2)}" /></div>
    <div class="field"><label>Método de pago</label>
      <select id="pcForm">${PAY_METHODS.map(m => `<option value="${m.k}">${m.lbl}</option>`).join('')}</select>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="pcOk">${ico('cxc')} Registrar cobro</button>`;
  openModal({ title: 'Cobranza — ' + c.name, body: html, footer });
  setTimeout(() => {
    const inp = $('#pcAmt'); inp.focus();
    $('#pcOk').addEventListener('click', () => {
      const amt = parseFloat(inp.value) || 0;
      if (amt <= 0 || amt > bal + 0.0001) { toast('Monto inválido', 'error'); return; }
      const met = $('#pcForm').value;
      c.balance = Math.max(0, bal - amt);
      // Actualizar una CxC abierta del cliente si existe
      const rec = db.receivables.find(r => r.client === c.name && r.status !== 'paid');
      if (rec) {
        rec.paid += amt;
        rec.balance = Math.max(0, rec.total - rec.paid);
        rec.status = rec.balance === 0 ? 'paid' : 'partial';
      }
      db.accounting.unshift({
        id: db.accounting.length + 1,
        date: veDate(),
        type: 'ingreso', category: 'Cobranza',
        description: 'Cobro POS a ' + c.name + ' · ' + METHOD_LBL(met),
        amount: amt, ref: 'COB-' + Date.now().toString().slice(-5)
      });
      DB.save(db);
      closeModal();
      renderCustomerInfo();
      toast('Cobro registrado: ' + fmt.money(amt), 'success');
    });
  }, 60);
}

/* Historial de ventas del día (ver / imprimir) */
function posDaySales() {
  const sales = [...db.sales];
  const now = new Date();
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const html = `
    <div class="field">
      <label>Buscar en el historial (N° recibo, cliente o fecha)</label>
      <input id="liInput" placeholder="Ej: 01000033, Cliente, 2025-05-05..." autofocus />
    </div>
    <div id="liMeta" style="margin-bottom:8px"></div>
    <div id="liResults" style="max-height:340px;overflow:auto"></div>
  `;
  openModal({ title: 'Ventas del día — ' + today, body: html, footer: `<button class="btn" onclick="closeModal()">Cerrar</button>`, size: 'modal-lg' });
  setTimeout(() => {
    const input = $('#liInput'); input.focus();
    input.addEventListener('input', () => render(input.value));
    render('');
    function render(q) {
      q = (q || '').toLowerCase().trim();
      let list;
      if (q) {
        list = sales.filter(s => String(s.number).toLowerCase().includes(q) || s.client.toLowerCase().includes(q) || String(s.date).toLowerCase().includes(q));
      } else {
        list = sales.filter(s => String(s.date).startsWith(today));
      }
      list = list.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const isToday = !q;
      $('#liMeta').innerHTML = isToday
        ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#6b7280"><span><b style="color:#1f2937">${list.length}</b> venta(s) hoy</span><span>Total del día: <b style="color:#15803d">${fmt.money(list.reduce((s, x) => s + x.total, 0))}</b></span></div>`
        : `<div style="font-size:12px;color:#6b7280"><b style="color:#1f2937">${list.length}</b> resultado(s) para "${q}"</div>`;
      if (!list.length) {
        $('#liResults').innerHTML = `<div class="dt empty">${isToday ? 'Sin ventas registradas hoy. Escriba para buscar en otras fechas.' : 'Sin resultados.'}</div>`;
        return;
      }
      $('#liResults').innerHTML = `
        <table class="dt" style="width:100%">
          <thead><tr><th>Recibo N°</th><th>Hora</th><th>Cliente</th><th class="num">Art.</th><th class="num">Total</th><th>Estado</th><th class="num"></th></tr></thead>
          <tbody>${list.map(s => `
            <tr>
              <td><code>${s.number}</code></td>
              <td>${String(s.date).length > 10 ? veHm12(String(s.date).slice(11)) : String(s.date).slice(0, 10)}</td>
              <td>${s.client}</td>
              <td class="num">${s.items}</td>
              <td class="num"><b>${fmt.money(s.total)}</b></td>
              <td>${s.status === 'credit' ? '<span class="pill yellow">Crédito</span>' : s.status === 'refunded' ? '<span class="pill red">Reembolsada</span>' : '<span class="pill green">Pagada</span>'}</td>
              <td class="num"><button class="row-eye" data-sale="${s.id}" title="Ver detalle / imprimir">${ico('eye')}</button></td>
            </tr>`).join('')}</tbody>
        </table>`;
      $$('button[data-sale]', $('#liResults')).forEach(b => b.addEventListener('click', () => posLastDetail(+b.dataset.sale)));
    }
  }, 60);
}

function posDateStr(d) { return veDate(d || new Date()); }

/* Cambiar tasa de cambio Bs/USD */
function posChangeRate() {
  const html = `
    <div class="field">
      <label>Tasa de cambio Bs/USD</label>
      <input type="number" step="0.01" min="0" id="rtRate" value="${fmt.usdRate()}" autofocus />
    </div>
    <p style="color:#6b7280;font-size:12px">La tasa se aplica a la equivalencia en Bolívares (Bs).</p>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="rtSave">${ico('check')} Guardar</button>`;
  openModal({ title: 'Cambiar Tasa', body: html, footer });
  setTimeout(() => {
    const inp = $('#rtRate'); inp.focus(); inp.select();
    $('#rtSave').addEventListener('click', () => {
      const v = parseFloat(inp.value);
      if (!(v > 0)) { toast('Ingrese una tasa válida mayor que 0', 'warn'); return; }
      db.settings.pos.usdRate = v;
      DB.save(db);
      updateTotals();
      closeModal();
      toast('Tasa actualizada a ' + fmt.num(v) + ' Bs/USD', 'success');
    });
  }, 60);
}

/* Arqueo de caja: montos en sistema (auto) vs reales por método de pago */
function posArqueo() {
  const today = posDateStr();
  const salesToday = db.sales.filter(s => String(s.date).startsWith(today));
  const ventasDia = salesToday.reduce((s, x) => s + x.total, 0);
  const creditoDia = salesToday.filter(s => s.status === 'credit').reduce((s, x) => s + x.total, 0);
  const devoluciones = salesToday.filter(s => s.status === 'refunded').reduce((s, x) => s + x.total, 0);
  const movCaja = db.cashbox.filter(c => String(c.date).startsWith(today)).reduce((s, x) => s + x.amount, 0);
  const tasa = fmt.usdRate();

  // Monto USD registrado por el sistema, agrupado por método real de pago.
  // Las ventas "mixtas" se desglosan por sus payments (Bs y/o USD); las antiguas
  // sin desglose se atribuyen al método único indicado.
  const amtUsd = {};
  salesToday.forEach(s => {
    if (s.status !== 'paid') return;
    if (Array.isArray(s.payments) && s.payments.length) {
      s.payments.forEach(p => { const k = p && p.method; if (k) amtUsd[k] = (amtUsd[k] || 0) + (Number(p.usd) || 0); });
    } else if (s.method && s.method !== 'mixto') {
      amtUsd[s.method] = (amtUsd[s.method] || 0) + s.total;
    }
  });

  const bsM = PAY_METHODS.filter(m => m.cur === 'BS');
  const usdM = PAY_METHODS.filter(m => m.cur === 'USD');
  const allM = PAY_METHODS.slice();

  const fmtNum = (v) => (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const curTxt = (c, v) => (c === 'USD' ? fmt.money(v) : 'Bs. ' + fmtNum(v));
  const signDif = (v) => v > 0.005 ? 'SOBRANTE' : (v < -0.005 ? 'FALTANTE' : 'CUADRADO');
  const parseAmount = (s) => {
    s = String(s == null ? '' : s).replace(/[^\d.,\-]/g, '');
    if (!s) return 0;
    const neg = s.startsWith('-');
    let v;
    const m = s.match(/([.,])(\d{1,2})$/);
    if (m) { const [i, d] = s.split(m[1]); v = parseFloat(i.replace(/[.,]/g, '') + '.' + d); }
    else { v = parseFloat(s.replace(/[.,]/g, '')); }
    return isFinite(v) ? (neg ? -v : v) : 0;
  };

  const th = (lbl) => `<th>${lbl}</th>`;
  const rowFor = (m) => `
      <tr>
        <td>${m.lbl}</td>
        <td class="num"><input type="text" id="arqSys_${m.k}" data-cur="${m.cur}" class="arq-sys" readonly style="width:120px;background:#eef2f7;color:#1f2937;font-weight:700" /></td>
        <td class="num"><input type="text" inputmode="decimal" placeholder="0.00" id="arqReal_${m.k}" data-cur="${m.cur}" class="arq-real" style="width:120px" /></td>
        <td class="num" id="arqDif_${m.k}" style="font-weight:700;font-family:Consolas,monospace"></td>
      </tr>`;
  const groupHead = (txt) => `<tr><td colspan="4" style="background:#f1f5f9;font-weight:800;color:#1f2937">${txt}</td></tr>`;

  const html = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">
      <div style="background:#f8fafc;border:1px solid #e2e6ec;border-radius:8px;padding:8px 10px">
        <div style="font-size:11px;color:#6b7280">Ventas del día</div>
        <b style="font-size:15px;color:#1f2937">${fmt.money(ventasDia)}</b>
        <small style="display:block;color:#6b7280">Bs. ${fmtNum(ventasDia * tasa)}</small>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e6ec;border-radius:8px;padding:8px 10px">
        <div style="font-size:11px;color:#6b7280">Movimientos de caja (hoy)</div>
        <b style="font-size:15px;color:#1f2937">${fmt.money(movCaja)}</b>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e6ec;border-radius:8px;padding:8px 10px">
        <div style="font-size:11px;color:#6b7280">Devoluciones (hoy)</div>
        <b style="font-size:15px;color:#c81e1e">${fmt.money(devoluciones)}</b>
      </div>
    </div>
    <div class="form-grid" style="margin-bottom:12px">
      <div class="field"><label>Fondo Inicial — Efectivo Bs.</label><input type="text" inputmode="decimal" id="arqFondoBs" value="${fmtNum(db.jornada?.fondoBs || 0)}" /></div>
      <div class="field"><label>Fondo Inicial — Efectivo USD</label><input type="text" inputmode="decimal" id="arqFondoUsd" value="${fmtNum(db.jornada?.fondoUsd || 0)}" /></div>
    </div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:6px">
      <b style="color:#1f2937">Monto en Sistema</b> = ventas del día por método + Fondo Inicial (cuando corresponde), calculado automáticamente (solo lectura). Ingrese únicamente el <b style="color:#1f2937">Monto Real</b>.
    </div>
    <div style="max-height:300px;overflow:auto;border:1px solid #e2e6ec;border-radius:8px">
      <table class="dt" style="width:100%;margin:0">
        <thead><tr><th>Método</th>${th('Monto en Sistema')}${th('Monto Real')}${th('Dif. (+/−)')}</tr></thead>
        <tbody>
          ${groupHead('Métodos en Bs.')}
          ${bsM.map(rowFor).join('')}
          ${groupHead('Métodos en USD')}
          ${usdM.map(rowFor).join('')}
          ${groupHead('Crédito (CxC)')}
          <tr>
            <td>Crédito (CxC) del día</td>
            <td class="num"><b style="font-family:Consolas,monospace">${fmt.money(creditoDia)}</b></td>
            <td class="num" colspan="2" style="color:#6b7280;font-size:11px">Se cobra por Cobranza (CxC)</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
      <div style="border:1px solid #c7d2fe;border-radius:8px;overflow:hidden">
        <div style="background:#eef2ff;padding:6px 10px;font-size:12px;font-weight:800;color:#3730a3">DIFERENCIA FINAL — Bs.</div>
        <div style="padding:8px 10px;font-size:18px;font-weight:800;font-family:Consolas,monospace" id="arqResBS">Bs. 0.00</div>
      </div>
      <div style="border:1px solid #a7f3d0;border-radius:8px;overflow:hidden">
        <div style="background:#ecfdf5;padding:6px 10px;font-size:12px;font-weight:800;color:#047857">DIFERENCIA FINAL — USD</div>
        <div style="padding:8px 10px;font-size:18px;font-weight:800;font-family:Consolas,monospace" id="arqResUSD">$ 0.00</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
      <div style="border:1px solid #e2e6ec;border-radius:8px;padding:8px 10px;background:#fbfcfd">
        <div style="font-size:11px;color:#6b7280">BALANCE Bs. — (FALTANTE / SOBRANTE)</div>
        <div style="font-size:15px;font-weight:800;font-family:Consolas,monospace;color:#1f2937" id="arqTagBS">Bs. 0.00</div>
      </div>
      <div style="border:1px solid #e2e6ec;border-radius:8px;padding:8px 10px;background:#fbfcfd">
        <div style="font-size:11px;color:#6b7280">BALANCE USD — (FALTANTE / SOBRANTE)</div>
        <div style="font-size:15px;font-weight:800;font-family:Consolas,monospace;color:#1f2937" id="arqTagUSD">$ 0.00</div>
      </div>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn" id="arqPrint">${ico('print')} Imprimir</button>
                  <button class="btn primary" id="arqOk">${ico('check')} Registrar arqueo</button>`;
  openModal({ title: 'Arqueo de Caja', body: html, footer, size: 'modal-lg' });
  setTimeout(() => {
    const allInputs = () => Array.from($$('#modalBody input.arq-real, #modalBody #arqFondoBs, #modalBody #arqFondoUsd'));
    const sys = (k) => {
      const m = PAY_METHODS.find(x => x.k === k);
      const base = amtUsd[k] || 0;
      const fb = parseAmount($('#arqFondoBs').value);
      const fu = parseAmount($('#arqFondoUsd').value);
      if (m.cur === 'BS') return (base * tasa) + (k === 'efectivoBs' ? fb : 0);
      return base + (k === 'efectivoUsd' ? fu : 0);
    };
    const recalc = () => {
      const sums = { BS: { s: 0, r: 0 }, USD: { s: 0, r: 0 } };
      allM.forEach(m => {
        const s = sys(m.k);
        const r = parseAmount($('#arqReal_' + m.k).value);
        const el = $('#arqSys_' + m.k); if (el) el.value = m.cur === 'USD' ? fmt.money(s) : 'Bs. ' + fmtNum(s);
        const d = r - s;
        sums[m.cur].s += s; sums[m.cur].r += r;
        const cell = $('#arqDif_' + m.k);
        if (cell) { cell.textContent = (d >= 0 ? '+' : '') + (m.cur === 'USD' ? fmt.money(d).replace('$ ', '$') : 'Bs. ' + fmtNum(d)).replace('Bs. ', 'Bs. ').replace('$', '$ ').trim(); if (m.cur === 'USD') cell.textContent = (d >= 0 ? '+$ ' : '-$ ') + fmtNum(Math.abs(d)); else cell.textContent = (d >= 0 ? '+Bs. ' : '-Bs. ') + fmtNum(Math.abs(d)); cell.style.color = Math.abs(d) < 0.005 ? '#6b7280' : (d > 0 ? '#15803d' : '#c81e1e'); }
      });
      const dBs = sums.BS.r - sums.BS.s;
      const dUsd = sums.USD.r - sums.USD.s;
      $('#arqResBS').textContent = 'Bs. ' + fmtNum(dBs);
      $('#arqResUSD').textContent = fmt.money(dUsd);
      const set = (el, t, d, c) => { const e = $(el); e.textContent = t + ' → ' + signDif(d) + '  ' + (c === 'USD' ? fmt.money(Math.abs(d)) : 'Bs. ' + fmtNum(Math.abs(d))); e.style.color = Math.abs(d) < 0.005 ? '#6b7280' : (d > 0 ? '#15803d' : '#c81e1e'); };
      set('#arqTagBS', 'Bs.', dBs, 'BS');
      set('#arqTagUSD', 'USD', dUsd, 'USD');
    };
    allInputs().forEach(i => i.addEventListener('input', recalc));
    recalc();
    const snapshot = () => {
      const r = {};
      let rBs = 0, sBs = 0, rUsd = 0, sUsd = 0;
      allM.forEach(m => {
        const s = sys(m.k); const v = parseAmount($('#arqReal_' + m.k).value);
        r[m.k] = v;
        if (m.cur === 'BS') { rBs += v; sBs += s; } else { rUsd += v; sUsd += s; }
      });
      return { r, dBs: rBs - sBs, dUsd: rUsd - sUsd };
    };
    $('#arqOk').addEventListener('click', () => {
      const sn = snapshot();
      const resumen = 'Bs: ' + signDif(sn.dBs) + ' Bs. ' + fmtNum(sn.dBs) + ' · USD: ' + signDif(sn.dUsd) + ' ' + fmt.money(sn.dUsd);
      db.cashbox.unshift({
        id: db.cashbox.length + 1,
        date: veStamp(),
        type: 'arqueo',
        description: 'Arqueo de caja · ' + resumen,
        amount: sn.r.efectivoUsd || 0,
        ref: 'ARQ-' + Date.now().toString().slice(-5)
      });
      DB.save(db);
      closeModal();
      toast('Arqueo registrado · ' + resumen, (Math.abs(sn.dBs) > 0.005 || Math.abs(sn.dUsd) > 0.005) ? 'warn' : 'success', 4000);
    });
    $('#arqPrint').addEventListener('click', () => {
      const line = [];
      const pad = '='.repeat(46);
      line.push(pad, '         ARQUEO DE CAJA         ', pad);
      line.push('Fecha: ' + today, 'Cajero: ' + (session?.user?.name || 'Cajero'), pad);
      const pr = (m) => line.push('  ' + m.lbl.padEnd(14) + (sys(m.k)).toFixed(2).padStart(8) + parseAmount($('#arqReal_' + m.k).value).toFixed(2).padStart(9));
      line.push('METODOS EN Bs.      Sistema   Real');
      bsM.forEach(pr);
      const sb = allM.filter(m => m.cur === 'BS'); const bd = sb.reduce((a, m) => a + parseAmount($('#arqReal_' + m.k).value), 0) - sb.reduce((a, m) => a + sys(m.k), 0);
      line.push('  Diferencia Bs.: ' + signDif(bd) + ' Bs. ' + fmtNum(bd), pad);
      line.push('METODOS EN USD      Sistema   Real');
      usdM.forEach(pr);
      const su = usdM.reduce((a, m) => a + parseAmount($('#arqReal_' + m.k).value), 0) - usdM.reduce((a, m) => a + sys(m.k), 0);
      line.push('  Diferencia USD: ' + signDif(su) + ' ' + fmt.money(su), pad);
      line.push('Ventas del día: ' + fmt.money(ventasDia), 'Devoluciones: ' + fmt.money(devoluciones), pad);
      const body = line.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      printHtml('<!doctype html><html><head><meta charset="utf-8"><title>Arqueo de Caja</title><style>@page{size:80mm auto;margin:0}html,body{margin:0;padding:0}body{font-family:"Courier New",monospace;font-size:11px;color:#000;width:72mm}.l{white-space:pre}</style></head><body>' + body.split('\n').map(l => '<div class="l">' + l + '</div>').join('') + '</body></html>');
      toast('Imprimiendo arqueo de caja', 'success');
    });
  }, 60);
}

/* Reporte Z: cierre diario */
function posReportZ() {
  const today = posDateStr();
  const now = new Date();
  const salesToday = db.sales.filter(s => String(s.date).startsWith(today));
  const totalVentas = salesToday.reduce((s, x) => s + x.total, 0);
  const nVentas = salesToday.length;
  const nArt = salesToday.reduce((s, x) => s + (x.items || 0), 0);
  const contado = salesToday.filter(s => s.status === 'paid').reduce((s, x) => s + x.total, 0);
  const credito = salesToday.filter(s => s.status === 'credit').reduce((s, x) => s + x.total, 0);
  const reemb = salesToday.filter(s => s.status === 'refunded').reduce((s, x) => s + x.total, 0);
  const tasa = fmt.usdRate();
  const taxIncl = db.settings.tax?.included !== false;
  const r = (db.settings.tax?.rate || 0) / 100;
  const base = taxIncl ? totalVentas / (1 + r) : totalVentas;
  const iva = taxIncl ? totalVentas - base : totalVentas * r;
  const jorn = db.jornada;
  const text = [
    '        POSsystem Evolution        ',
    '     Cierre de jornada (Reporte Z) ',
    ' '.padStart(1),
    'Fecha : ' + now.toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
    'Cajero: ' + (session?.user?.name || 'Cajero'),
    'Hora  : ' + now.toTimeString().slice(0, 5),
    ' '.padStart(1),
    '==================================',
    'Ventas del día  : ' + nVentas,
    'Artículos       : ' + nArt,
    '----------------------------------',
    'Base            : ' + fmt.money(base),
    'IVA ' + (db.settings.tax?.rate || 0) + '%        : ' + fmt.money(iva),
    'TOTAL VENTAS    : ' + fmt.money(totalVentas),
    '----------------------------------',
    'Contado         : ' + fmt.money(contado),
    'Crédito (CxC)   : ' + fmt.money(credito),
    'Reembolsos      : ' + fmt.money(reemb),
    '==================================',
    'Tasa Bs/USD     : ' + fmt.num(tasa),
    'Equiv. Bs       : ' + fmt.bs(totalVentas),
    (jorn?.active ? 'Estado jornada : ABIERTA' : 'Estado jornada : CERRADA'),
    String(db.settings.pos.receiptFooter || '').split('\n').map(t => t.trim()).filter(Boolean).join('\n')
  ].join('\n');

  const html = `
    <div class="field">
      <div class="z-report-preview"><span style="white-space:pre">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cerrar</button>
                  <button class="btn primary" id="zPrint">${ico('print')} Imprimir Reporte Z</button>`;
  openModal({ title: 'Reporte Z — Cierre del día', body: html, footer, size: 'modal-lg' });
  setTimeout(() => {
    $('#zPrint').addEventListener('click', () => {
      const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Reporte Z ${today}</title><style>
        @page { size: 80mm auto; margin: 0; }
        html,body { margin:0; padding:0; }
        body { font-family:'Courier New','Lucida Console',monospace; font-size:11px; color:#000; width:72mm; }
        .l { white-space:pre; }
      </style></head><body>${esc.split('\n').map(l => `<div class="l">${l}</div>`).join('')}</body></html>`);
      toast('Imprimiendo Reporte Z', 'success');
    });
  }, 60);
}

function posLastDetail(id) {
  const s = db.sales.find(x => x.id === id);
  if (!s) return;
  const cli = db.clients.find(c => c.name === s.client);
  const statePill = s.status === 'credit' ? '<span class="pill yellow">Crédito</span>' : s.status === 'refunded' ? '<span class="pill red">Reembolsada</span>' : '<span class="pill green">Pagada</span>';
  const rate = Number(s.rate) || fmt.usdRate();
  const linesArr = Array.isArray(s.lines) ? s.lines : [];
  const itemsHtml = linesArr.length
    ? `<table class="dt" style="width:100%"><thead><tr><th>Producto</th><th>UM</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead><tbody>
        ${linesArr.map(l => `<tr>
          <td>${l.name}</td>
          <td>${unitAbbr(l.present || l.base || 'Und', l.qty)}</td>
          <td class="num">${fmtNumStock(l.qty)}</td>
          <td class="num">${fmt.frac(l.price)}</td>
          <td class="num">${fmt.money((l.qty * l.price))}</td></tr>`).join('')}
       </tbody></table>`
    : '<div class="dt empty">Sin detalle de items</div>';
  const pays = Array.isArray(s.payments) && s.payments.length ? s.payments : null;
  const paysHtml = pays
    ? `<table class="dt" style="width:100%"><thead><tr><th>Método</th><th class="num">Monto (${pays[0].cur || 'USD'})</th><th class="num">Equiv. USD</th></tr></thead><tbody>
        ${pays.map(p => `<tr><td>${METHOD_LBL(p.method)}</td><td class="num">${p.cur === 'BS' ? 'Bs. ' + fmt.num(p.amount) : fmt.money(p.amount)}</td><td class="num">${fmt.money(p.usd)}</td></tr>`).join('')}
       </tbody></table>`
    : `<p style="color:#6b7280;font-size:13px">Método: <b>${METHOD_LBL(s.method)}</b></p>`;
  const changeTxt = s.changeUSD > 0 ? `<div style="font-size:12px;color:#b45309;margin-top:4px">Vuelto entregado: ${fmt.money(s.changeUSD)}</div>` : '';
  const html = `
    <div class="form-grid" style="margin-bottom:12px">
      <div class="field"><label>Recibo N°</label><input value="${s.number}" disabled style="background:#f3f4f6;font-family:Consolas,monospace" /></div>
      <div class="field"><label>Fecha (Venezuela)</label><input value="${String(s.date).length > 10 ? (String(s.date).slice(0, 10) + ' · ' + veHm12(String(s.date).slice(11))) : s.date}" disabled style="background:#f3f4f6" /></div>
      <div class="field"><label>Cliente</label><input value="${s.client}" disabled style="background:#f3f4f6" /></div>
      <div class="field"><label>RIF / CI</label><input value="${cli ? cli.taxId : ''}" disabled style="background:#f3f4f6" /></div>
      <div class="field"><label>Tasa BCV utilizada</label><input value="${fmt.num(rate)} Bs/USD" disabled style="background:#f3f4f6;font-family:Consolas,monospace" /></div>
      <div class="field"><label>Estado</label><input value="${s.status}" disabled style="background:#f3f4f6" /></div>
    </div>
    <b style="font-size:12px;color:#1f2937">Items vendidos (${linesArr.length})</b>
    <div style="max-height:180px;overflow:auto;margin:6px 0 12px;border:1px solid #e2e6ec;border-radius:8px">${itemsHtml}</div>
    <b style="font-size:12px;color:#1f2937">Pago</b>
    <div style="margin:6px 0 12px">${paysHtml}</div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:12px;color:#166534">Total cobrado</div>
      <div style="font-size:28px;font-weight:800;color:#15803d">${fmt.money(s.total)}</div>
      <div style="font-size:12px;color:#166534">Bs. ${fmt.num(s.total * rate)}</div>
      <div style="margin-top:6px">${statePill}</div>
      ${changeTxt}
    </div>`;
  const footer = `
    <button class="btn" onclick="closeModal()">Volver</button>
    <button class="btn primary" id="liPrint">${ico('print')} Imprimir</button>`;
  openModal({ title: 'Factura ' + s.number, body: html, footer });
  setTimeout(() => {
    $('#liPrint').addEventListener('click', () => {
      printHtml(buildSaleReceiptHtml(s));
      toast('Imprimiendo factura ' + s.number, 'success');
    });
  }, 60);
}

function buildSaleReceiptHtml(s) {
  const RW = 46;
  const sep = '='.repeat(RW);
  const padc = (t) => { t = String(t); if (t.length >= RW) return t; const p = Math.floor((RW - t.length) / 2); return ' '.repeat(p) + t + ' '.repeat(RW - p - t.length); };
  const padlr = (l, v) => { l = String(l); v = String(v); const gap = Math.max(1, RW - l.length - v.length); return l + ' '.repeat(gap) + v; };
  const cli = db.clients.find(c => c.name === s.client);
  const st = s.status === 'credit' ? 'CREDITO' : s.status === 'refunded' ? 'REEMBOLSO' : 'PAGADA';
  const lns = [];
  lns.push(padc('POSsystem Evolution'));
  lns.push(sep);
  lns.push(padlr('Recibo N°:', s.number));
  lns.push(padlr('Fecha:', String(s.date).length > 10 ? (String(s.date).slice(0, 10) + ' ' + veHm12(String(s.date).slice(11))) : s.date));
  lns.push('Cliente: ' + s.client);
  if (cli && cli.taxId) lns.push('RIF/CI: ' + cli.taxId);
  lns.push(sep);
  lns.push(padlr('Artículos:', s.items));
  lns.push(sep);
  lns.push(padlr('TOTAL:', fmt.money(s.total)));
  lns.push(padlr('Estado:', st));
  lns.push(sep);
  String(db.settings.pos.receiptFooter || '').split('\n').map(t => t.trim()).filter(Boolean).forEach(l => lns.push(padc(l)));
  return `<!doctype html><html><head><meta charset="utf-8"><title>Factura ${s.number}</title><style>
    @page { size: 80mm auto; margin: 0; }
    html,body { margin:0; padding:0; }
    body { font-family:'Courier New','Lucida Console',monospace; font-size:11px; color:#000; width:72mm; }
    .l { white-space:pre; }
  </style></head><body>${lns.map(l => `<div class="l">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`).join('')}</body></html>`;
}

/* Apertura de Caja (obligatoria al ingresar con rol de cajero) */
function openCashOpening() {
  if (!db.jornada) db.jornada = { openedOnce: false, active: false };
  const tasa = fmt.usdRate();
  const recibo = String(db.settings.invoice.nextNumber).padStart(9, '0');
  const html = `
    <div class="form-grid">
      <div class="field span-2"><label>Fondo de Apertura Inicial en Efectivo Bs</label>
        <input id="apFondoBs" placeholder="0,00" /></div>
      <div class="field span-2"><label>Fondo Inicial de Apertura en efectivo USD (físicos)</label>
        <input id="apFondoUsd" placeholder="0.00" /></div>
      <div class="field"><label>Tasa BCV</label>
        <input id="apTasa" type="number" step="0.01" min="0" value="${tasa}" /></div>
      <div class="field"><label>Recibo inicial de jornada</label>
        <input id="apRecibo" value="${recibo}" disabled style="background:#f3f4f6;font-family:Consolas,monospace" /></div>
    </div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="apOk">Aperturar Caja</button>`;
  openModal({ title: 'Apertura de Caja', body: html, footer, size: 'modal-lg' });
  setTimeout(() => {
    $('#apOk').addEventListener('click', () => {
      const fondoBs = $('#apFondoBs').value.trim();
      const fondoUsd = $('#apFondoUsd').value.trim();
      const tasaOpen = parseFloat($('#apTasa').value) || fmt.usdRate();
      const recibo = $('#apRecibo').value;
      const msg = '¿Confirmas los datos de apertura?\n\n' +
        'Fondo Bs: ' + (fondoBs || '0,00') + '\n' +
        'Fondo USD (físicos): ' + (fondoUsd || '0.00') + '\n' +
        'Tasa BCV: ' + tasaOpen + '\n' +
        'Recibo inicial: ' + recibo + '\n\n' +
        '¿Aperturar caja?';
      if (!confirm(msg)) return;
      const pAmt = (s) => { s = String(s == null ? '' : s).replace(/[^\d.,\-]/g, ''); if (!s) return 0; const m = s.match(/([.,])(\d{1,2})$/); let v; if (m) { const [i, d] = s.split(m[1]); v = parseFloat(i.replace(/[.,]/g, '') + '.' + d); } else { v = parseFloat(s.replace(/[.,]/g, '')); } return isFinite(v) ? v : 0; };
      // Registrar apertura en caja (fondo en USD como monto)
      db.cashbox.unshift({
        id: db.cashbox.length + 1,
        date: veStamp(),
        type: 'apertura',
        description: 'Apertura de caja · Bs ' + (fondoBs || '0') + ' / USD ' + (fondoUsd || '0'),
        amount: parseFloat(fondoUsd) || 0,
        ref: 'AP-' + Date.now().toString().slice(-5)
      });
      // Primera apertura: iniciar numeración correlativa de recibos en 000000001
      if (!db.jornada.openedOnce) {
        db.settings.invoice.nextNumber = 1;
        db.jornada.openedOnce = true;
      }
      db.jornada.active = true;
      db.jornada.openedAt = new Date().toISOString();
      db.jornada.fondoBs = pAmt(fondoBs);
      db.jornada.fondoUsd = pAmt(fondoUsd);
      db.settings.pos.usdRate = tasaOpen;
      DB.save(db);
      resetTicket();
      closeModal();
      toast('Caja aperturada correctamente', 'success');
    });
  }, 60);
}

/* F9 — Suspender (igual que pendiente) */
function posSuspend() { posPending(); }

/* F10 — Reembolso (búsqueda de venta previa) */
function posRefund() {
  const html = `
    <div class="field"><label>Venta a reembolsar</label>
      <select id="rfSale">${db.sales.map(s => `<option value="${s.id}">${s.number} — ${s.client} — ${fmt.money(s.total)}</option>`).join('')}</select>
    </div>
    <p style="color:#6b7280;font-size:12px">Se registrará la devolución como egreso y se restaurará el stock.</p>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn danger" id="rfOk">Procesar reembolso</button>`;
  openModal({ title: 'F10 — Reembolso', body: html, footer });
  setTimeout(() => {
    $('#rfOk').addEventListener('click', () => {
      const id = +$('#rfSale').value;
      const s = db.sales.find(x => x.id === id);
      if (!s) return;
      db.accounting.unshift({
        id: db.accounting.length + 1,
        date: veDate(),
        type: 'egreso', category: 'Devoluciones',
        description: `Reembolso ${s.number}`, amount: s.total, ref: 'R-' + s.number
      });
      const idx = db.sales.findIndex(x => x.id === id);
      if (idx >= 0) db.sales[idx].status = 'refunded';
      DB.save(db);
      closeModal();
      toast(`Reembolso procesado: ${fmt.money(s.total)}`, 'success');
    });
  }, 60);
}

/* F11 — Consulta rápida de precios */
function posPrices() {
  const html = `
    <div class="field"><label>Producto</label>
      <input id="prIn" placeholder="Código o nombre" autofocus />
    </div>
    <div id="prRes" style="margin-top:10px"></div>
  `;
  const footer = `<button class="btn" onclick="closeModal()">Cerrar</button>`;
  openModal({ title: 'F11 — Consulta de precios', body: html, footer, size: 'modal-lg' });
  setTimeout(() => {
    const in_ = $('#prIn');
    in_.focus();
    in_.addEventListener('input', () => {
      const q = in_.value.toLowerCase().trim();
      const list = db.products.filter(p => !q || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 12);
      list.forEach(canonicalizeProduct);
      $('#prRes').innerHTML = list.length === 0 ? '<div class="empty-state" style="padding:14px">Sin resultados</div>' :
        `<table class="dt" style="width:100%"><thead><tr><th>Código</th><th>Descripción</th><th class="num">Precio pres. base</th><th class="num">Precio Bs.</th><th class="num">Stock</th></tr></thead><tbody>
          ${list.map(p => `<tr><td><code>${p.code}</code></td><td>${p.name}</td><td class="num">${fmt.moneyDyn(invDefaultPrice(p))} <small>${unitAbbrPlural(invBasePres(p).unidad)}</small></td><td class="num">${fmt.bs(invDefaultPrice(p))}</td><td class="num">${invStock(p)} ${unitAbbr(invBaseUnit(p), invStock(p))}</td></tr>`).join('')}
        </tbody></table>`;
    });
    in_.dispatchEvent(new Event('input'));
  }, 60);
}

/* F12 — Gestión de clientes (atajo) */
function posCustomers() { showDashboard('clients'); }

/* Next — Limpiar / nuevo ticket */
function posNext() {
  if (ticket.items.length > 0) {
    if (!confirm('¿Limpiar el ticket actual?')) return;
  }
  resetTicket();
  toast('Nuevo ticket iniciado', 'info');
}

/* ---------- Agregar item al ticket ---------- */
function addItemToTicket(p, qty, o) {
  o = o || {};
  const price = o.price != null ? o.price : (p.price || 0);
  const name = o.name || p.name;
  const weighed = o.weighed != null ? o.weighed : !!p.weighed;
  const lk = o.lk || ('p' + p.id);
  const unit = o.unit || p.unit || '';
  const present = o.present || '';
  const base = o.base || p.base || p.unit || 'UND';
  const content = o.content != null ? o.content : 1; // unidad base por presentación
  const existing = ticket.items.find(i => i.lk === lk);
  if (existing) existing.qty += qty;
  else ticket.items.push({ id: p.id, lk, code: p.code, name, price, qty, weighed, unit, present, base, content, offer: 0 });
  renderTicketTable();
}

/* Decide cómo vender el producto según su configuración de venta */
function addProductToTicket(p) {
  canonicalizeProduct(p);
  const views = invSaleViews(p).filter(v => v.activa !== false);
  if (!views.length) { toast('El producto no tiene presentaciones de venta activas', 'warn'); return; }
  // Caso rápido (lector/buscador manual): una sola forma de venta que no es por peso → se agrega 1 inmediatamente
  if (views.length === 1) {
    const v = views[0];
    if (!p.weighed) { addCanonicalLine(p, v, 1); toast('"' + p.name + '" · ' + v.unidad + ' agregado', 'success'); return; }
  }
  if (views.length === 1) { openQtyCanonical(p, views[0]); return; }
  openPickCanonical(p, views);
}

/* Seleccionar la presentación/unidad de venta de un producto canónico */
function openPickCanonical(p, views) {
  const av = validateStock(p, invBasePres(p).contenido, 0); // sólo para mostrar disponibilidad
  const cards = views.map((v, i) => `
      <div style="display:flex;align-items:center;gap:10px;border:1px solid #e2e6ec;border-radius:8px;padding:10px 12px;background:#fff">
        <div style="flex:1">
          <b>${v.unidad}</b>
          <div style="color:#15803d;font-weight:800;font-family:Consolas,monospace">${fmt.moneyDyn(v.precio)}</div>
          <div style="font-size:11px;color:#6b7280">${fmtNumStock(v.equiv)} ${unitAbbr(invBaseUnit(p), v.equiv)} por unidad vendida${v.equiv === 1 ? ' · precio unitario' : ''}</div>
        </div>
        <button class="btn primary" data-pick="${i}">${ico('check')} Vender</button>
      </div>`).join('');
  const html = `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:13px">
      <span style="color:#166534;font-weight:600">Disponible:</span>
      <b style="color:#15803d">${invString(p)}</b>
      <span style="color:#6b7280">(${fmtNumStock(invStock(p))} ${unitAbbr(invBaseUnit(p), invStock(p))})</span>
    </div>
    <p style="color:#374151;font-weight:600;margin:0 0 8px">Seleccione la presentación para esta venta</p>
    <div style="display:flex;flex-direction:column;gap:8px;max-height:360px;overflow:auto">${cards}</div>`;
  openModal({ title: 'Vender — ' + p.name, body: html, footer: `<button class="btn" onclick="closeModal()">Cancelar</button>` });
  setTimeout(() => {
    $$('button[data-pick]').forEach(b => b.addEventListener('click', () => { closeModal(); openQtyCanonical(p, views[+b.dataset.pick]); }));
  }, 60);
}

function fmtNumStock(n) { const v = Number(n) || 0; return Number.isInteger(v) ? String(v) : parseFloat(v.toFixed(3)); }

/* Pedir cantidad y agregar la presentación canónica elegida (permite decimales si es por peso) */
function openQtyCanonical(p, view) {
  const price = view.precio || 0;
  const rate = fmt.usdRate() || 36;
  const fmtv = (v) => { const x = Number(v) || 0; if (x === 0) return '0'; return String(parseFloat(x.toFixed(8))); };
  const qv = (el) => parseFloat(String(el.value).replace(',', '.')) || 0;
  const html = `
    <div class="form-grid">
      <div class="field span-2"><label>Producto</label><input value="${p.name}" disabled style="background:#f3f4f6" /></div>
      <div class="field"><label>Presentación</label><input value="${view.unidad}" disabled style="background:#f3f4f6" /></div>
      <div class="field"><label>Precio / unid. de venta</label><input value="${fmt.moneyDyn(price)}" disabled style="background:#f3f4f6" /></div>
      <div class="field"><label>Cantidad</label><input type="text" inputmode="decimal" id="qcQty" value="1" autofocus /></div>
      <div class="field"><label>Subtotal (USD)</label><input type="text" inputmode="decimal" id="qcUsd" value="${fmtv(price)}" /></div>
      <div class="field"><label>Equiv. Bs</label><input type="text" inputmode="decimal" id="qcBs" value="${fmtv(price * rate)}" /></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;margin-top:8px">
      <span style="font-size:11px;color:#166534" id="qcRate">Tasa: ${fmt.num(rate)} Bs/USD</span>
      <span id="qcConsume" style="font-size:11px;color:#6b7280"></span>
    </div>`;
  const footer = `<button class="btn" onclick="closeModal()">Cancelar</button>
                  <button class="btn primary" id="qcOk">${ico('check')} Agregar al ticket</button>`;
  openModal({ title: 'Vender — ' + p.name, body: html, footer });
  setTimeout(() => {
    const qEl = $('#qcQty'), uEl = $('#qcUsd'), bEl = $('#qcBs'), consEl = $('#qcConsume');
    const setConsume = (q) => { const cons = q * (view.equiv || 1); consEl.textContent = 'Descuenta ' + fmtNumStock(cons) + ' ' + unitAbbr(invBaseUnit(p), cons) + ' del stock'; };
    const recalc = (src) => {
      let q, u, b;
      if (src === 'qty') { q = qv(qEl); u = q * price; b = u * rate; uEl.value = fmtv(u); bEl.value = fmtv(b); }
      else if (src === 'usd') { u = qv(uEl); b = u * rate; bEl.value = fmtv(b); q = price > 0 ? u / price : 0; qEl.value = fmtv(q); }
      else { b = qv(bEl); u = rate > 0 ? b / rate : 0; uEl.value = fmtv(u); q = price > 0 ? u / price : 0; qEl.value = fmtv(q); }
      setConsume(q);
    };
    qEl.addEventListener('input', () => recalc('qty'));
    uEl.addEventListener('input', () => recalc('usd'));
    bEl.addEventListener('input', () => recalc('bs'));
    recalc('qty');
    $('#qcOk').addEventListener('click', () => {
      const q = qv(qEl);
      const consume = q * (view.equiv || 1);
      if (q <= 0) { toast('Indique una cantidad mayor que cero', 'warn'); return; }
      const chk = validateStock(p, view.equiv || 1, q);
      if (!chk.ok) { toast(chk.message, 'warn', 3200); return; }
      addCanonicalLine(p, view, q);
      closeModal();
      const consTx = fmtNumStock(consume) + ' ' + unitAbbr(invBaseUnit(p), consume);
      toast('"' + p.name + '" · ' + view.unidad + ' × ' + fmtNumStock(q) + ' agregado (' + consTx + ')', 'success');
    });
  }, 60);
}

/* Agrega una presentación canónica como línea del ticket. content = equiv (unidad canónica). */
function addCanonicalLine(p, view, qty) {
  const baseUnit = invBaseUnit(p);
  addItemToTicket(p, qty, {
    name: p.name,
    price: view.precio || 0,
    weighed: !!p.weighed,
    lk: 'p' + p.id + '_u_' + (view.unidad || 'und'),
    unit: view.unidad,
    present: view.unidad,
    base: baseUnit,
    content: view.equiv || 1
  });
}
