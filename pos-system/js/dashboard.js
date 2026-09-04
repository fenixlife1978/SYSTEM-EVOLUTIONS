/* ============================================================
   dashboard.js — Navegación del dashboard y vista de resumen
   ============================================================ */

const DASH_VIEWS = {
  overview:   { title: 'Resumen',              crumb: 'Resumen',                            render: () => renderOverview() },
  pos:        { title: 'Punto de Venta',       crumb: 'Punto de Venta',                     render: () => showPOS() },
  purchases:  { title: 'Compras (Entradas)',   crumb: 'Operaciones › Compras',              render: () => renderPurchases() },
  inventory:  { title: 'Inventario',           crumb: 'Operaciones › Inventario',           render: () => renderInventory() },
  sales:      { title: 'Ventas',               crumb: 'Operaciones › Ventas',               render: () => renderSales() },
  cxc:        { title: 'Cuentas por Cobrar',   crumb: 'Operaciones › CxC',                  render: () => renderCxC() },
  cxp:        { title: 'Cuentas por Pagar',    crumb: 'Operaciones › CxP',                  render: () => renderCxP() },
  clients:    { title: 'Clientes',             crumb: 'Entidades › Clientes',               render: () => renderClients() },
  suppliers:  { title: 'Proveedores',          crumb: 'Entidades › Proveedores',            render: () => renderSuppliers() },
  employees:  { title: 'Empleados',            crumb: 'Entidades › Empleados',              render: () => renderEmployees() },
  accounting: { title: 'Contabilidad',         crumb: 'Finanzas › Contabilidad',            render: () => renderAccounting() },
  cashbox:    { title: 'Caja y Bancos',        crumb: 'Finanzas › Caja',                    render: () => renderCashbox() },
  reports:    { title: 'Reportes',             crumb: 'Finanzas › Reportes',                render: () => renderReports() },
  users:      { title: 'Usuarios',             crumb: 'Sistema › Usuarios',                 render: () => renderUsers() },
  settings:   { title: 'Configuración',        crumb: 'Sistema › Configuración',            render: () => renderSettings() }
};

function renderDashboard(view) {
  const def = DASH_VIEWS[view] || DASH_VIEWS.overview;
  // Si la vista es POS, no hace nada aquí
  if (view === 'pos') { showPOS(); return; }
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  $('#dashPageTitle').textContent = def.title;
  $('#dashPageCrumb').textContent = def.crumb;
  $('#dashContent').innerHTML = '';
  def.render();
  $('#dashContent').scrollTop = 0;
}

/* Bind sidebar nav */
document.addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (item) renderDashboard(item.dataset.view);
});

/* ============================================================
   OVERVIEW / Resumen
   ============================================================ */
function renderOverview() {
  const today = veDate();
  const todaySales = db.sales.filter(s => s.date.startsWith(today.replace(/-/g, '/')));
  const todayTotal = todaySales.reduce((s, x) => s + x.total, 0);
  const monthSales = db.sales.filter(s => s.date.startsWith(today.slice(0, 7)));
  const monthTotal = monthSales.reduce((s, x) => s + x.total, 0);
  const totalCxc = db.receivables.reduce((s, r) => s + r.balance, 0);
  const totalCxp = db.payables.reduce((s, p) => s + p.balance, 0);
  const monthIncome = db.accounting.filter(a => a.type === 'ingreso' && a.date.startsWith(today.slice(0, 7))).reduce((s, a) => s + a.amount, 0);
  const monthExpense = db.accounting.filter(a => a.type === 'egreso' && a.date.startsWith(today.slice(0, 7))).reduce((s, a) => s + a.amount, 0);
  const prods = db.products.map(p => { canonicalizeProduct(p); return p; });
  const lowStock = prods.filter(p => invStock(p) < Math.max(1, Number(p.stockMinimo) || 20)).length;

  $('#dashContent').innerHTML = `
    <div class="session-card">
      <div class="avatar">${session.user.name.split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase()}</div>
      <div style="flex:1">
        <strong>Hola, ${session.user.name}</strong>
        <div style="font-size:12px;color:#6b7280">Rol: ${session.user.role} · Sucursal: Principal · ${fmt.dateLong(new Date().toISOString())}</div>
      </div>
    </div>

    <div class="grid cols-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-info"><div class="lbl">Ventas hoy</div><div class="val">${fmt.money(todayTotal)}</div><div class="delta up">${ico('arrowUp')} ${todaySales.length} operaciones</div></div><div class="kpi-ico">${ico('cxc')}</div></div>
      <div class="kpi k-blue"><div class="kpi-info"><div class="lbl">Ventas del mes</div><div class="val">${fmt.money(monthTotal)}</div><div class="delta up">${ico('arrowUp')} ${monthSales.length} ventas</div></div><div class="kpi-ico">${ico('reports')}</div></div>
      <div class="kpi k-orange"><div class="kpi-info"><div class="lbl">Por cobrar (CxC)</div><div class="val">${fmt.money(totalCxc)}</div><div class="delta">${db.receivables.filter(r => r.status !== 'paid').length} facturas</div></div><div class="kpi-ico">${ico('export')}</div></div>
      <div class="kpi k-red"><div class="kpi-info"><div class="lbl">Por pagar (CxP)</div><div class="val">${fmt.money(totalCxp)}</div><div class="delta">${db.payables.filter(p => p.status !== 'paid').length} facturas</div></div><div class="kpi-ico">${ico('import')}</div></div>
    </div>

    <div class="grid cols-4" style="margin-bottom:14px">
      <div class="kpi k-yellow"><div class="kpi-info"><div class="lbl">Ingresos del mes</div><div class="val">${fmt.money(monthIncome)}</div></div><div class="kpi-ico">${ico('arrowUp')}</div></div>
      <div class="kpi k-purple"><div class="kpi-info"><div class="lbl">Egresos del mes</div><div class="val">${fmt.money(monthExpense)}</div></div><div class="kpi-ico">${ico('arrowDown')}</div></div>
      <div class="kpi"><div class="kpi-info"><div class="lbl">Utilidad del mes</div><div class="val">${fmt.money(monthIncome - monthExpense)}</div></div><div class="kpi-ico">${ico('dashboard')}</div></div>
      <div class="kpi k-red"><div class="kpi-info"><div class="lbl">Stock bajo</div><div class="val">${lowStock}</div><div class="delta down">productos</div></div><div class="kpi-ico">${ico('warn')}</div></div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <h3 class="card-title">Ventas últimos 7 días
          <span class="actions"><button class="btn sm" onclick="renderDashboard('sales')">Ver todas</button></span>
        </h3>
        ${renderSalesChart()}
      </div>
      <div class="card">
        <h3 class="card-title">Top productos del mes</h3>
        ${renderTopProducts()}
      </div>
    </div>

    <div class="grid cols-2" style="margin-top:14px">
      <div class="card">
        <h3 class="card-title">Distribución de cuentas
          <span class="actions"></span>
        </h3>
        <div style="display:flex;align-items:center;gap:18px">
          <div class="donut" style="--p:${totalCxc + totalCxp ? Math.round((totalCxc / (totalCxc + totalCxp)) * 100) : 50};--c:var(--green)">
            <div class="d-center"><b>${Math.round((totalCxc / (totalCxc + totalCxp || 1)) * 100)}%</b><span>CxC vs CxP</span></div>
          </div>
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eef1f5"><span><span class="pill green"></span> Por cobrar</span><b>${fmt.money(totalCxc)}</b></div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eef1f5"><span><span class="pill red"></span> Por pagar</span><b>${fmt.money(totalCxp)}</b></div>
            <div style="display:flex;justify-content:space-between;padding:8px 0"><span><span class="pill blue"></span> Diferencia</span><b>${fmt.money(totalCxc - totalCxp)}</b></div>
          </div>
        </div>
      </div>
      <div class="card">
        <h3 class="card-title">Actividad reciente</h3>
        <div class="activity">
          ${db.accounting.slice(0, 5).map(a => `
            <div class="item">
              <div class="dot" style="background:${a.type === 'ingreso' ? 'var(--green)' : 'var(--red)'}"></div>
              <div class="body">
                <b>${a.description}</b>
                <small>${fmt.date(a.date)} · ${a.category}</small>
              </div>
              <div style="text-align:right">
                <b style="color:${a.type === 'ingreso' ? 'var(--green)' : 'var(--red)'}">${a.type === 'ingreso' ? '+' : '-'}${fmt.money(a.amount)}</b>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3 class="card-title">Productos con stock bajo
        <span class="actions"><button class="btn sm" onclick="renderDashboard('inventory')">Ver inventario</button></span>
      </h3>
      <div class="dt-wrap">
        <table class="dt">
          <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th class="num">Stock</th><th>Estado</th></tr></thead>
          <tbody>
            ${prods.filter(p => invStock(p) < Math.max(1, Number(p.stockMinimo) || 20)).slice(0, 8).map(p => `
              <tr>
                <td><code>${p.code}</code></td>
                <td>${p.name}</td>
                <td>${p.category}</td>
                <td class="num">${invStock(p)} ${invBaseUnit(p)}</td>
                <td>${invStock(p) < (Math.max(1, Number(p.stockMinimo) || 20) * 0.5) ? '<span class="pill red">Crítico</span>' : '<span class="pill yellow">Bajo</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSalesChart() {
  // Generar datos de los últimos 7 días
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const total = db.sales.filter(s => s.date.startsWith(key.replace(/-/g, '/'))).reduce((s, x) => s + x.total, 0);
    // generar datos de demo si está vacío
    const final = total > 0 ? total : (2000 + Math.random() * 6000);
    days.push({ label: d.toLocaleDateString('es-VE', { weekday: 'short' }).slice(0, 3), value: final });
  }
  const max = Math.max(...days.map(d => d.value)) || 1;
  return `
    <div class="bar-chart">
      ${days.map(d => `<div class="bar" style="height:${(d.value / max) * 100}%"><span class="v">${fmt.num(d.value / 1000)}k</span></div>`).join('')}
    </div>
    <div class="bar-chart-labels">${days.map(d => `<span>${d.label}</span>`).join('')}</div>
  `;
}

function renderTopProducts() {
  // Tomamos productos con más stock canónico como "top" demo
  const top = db.products.map(p => { canonicalizeProduct(p); return p; }).sort((a, b) => invStock(b) - invStock(a)).slice(0, 5);
  return `<div class="activity">
    ${top.map((p, i) => `
      <div class="item">
        <div class="dot" style="background:var(--green)">${i + 1}</div>
        <div class="body">
          <b>${p.name}</b>
          <small>${p.code} · ${p.category}</small>
        </div>
        <div style="text-align:right">
          <b>${fmt.moneyDyn(invUnitPrice(p))}</b>
          <small style="display:block;color:#6b7280">${invBreakdown(p, invStock(p))}</small>
        </div>
      </div>`).join('')}
  </div>`;
}
