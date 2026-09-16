/* ============================================================
   app.js — Login, navegación principal, modales, toasts
   ============================================================ */

const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));

/* ---------- Login ---------- */
async function boot() {
  // En escritorio (Electron) se carga el estado persistido en SQLite antes de pintar nada
  await hydrateFromSource();
  // Obtener tasa BCV oficial automáticamente
  await fetchBcvRate();
  setInterval(fetchBcvRate, BCV_CACHE_MS);
  // Actualizar UI del POS cuando la tasa BCV cambie
  setOnBcvRateUpdate((newRate) => {
    if (typeof updateTotals === 'function') updateTotals();
    toast('Tasa BCV actualizada: ' + fmt.num(newRate) + ' Bs/USD', 'info', 3000);
  });
  bindLogin();
  bindGlobal();
  hydrateIcons();
  updateClock();
  setInterval(updateClock, 1000);
  updateDate();
  // Inicializar red multi-caja
  await initNetwork();
  updateNetworkStatusUI();
  // Indicador de plataforma
  if (window.posdesktop) {
    console.info('[posdesktop]', window.posdesktop.versions);
    console.info('[Caja] ID:', getCajaId(), '· Nombre:', getCajaNombre());
  }
}

function bindLogin() {
  // Mostrar/ocultar campo IP según selección de caja
  const cajaSelect = $('#loginCaja');
  const ipBox = $('#clientIPBox');
  if (cajaSelect && ipBox) {
    cajaSelect.addEventListener('change', () => {
      ipBox.style.display = cajaSelect.value === 'client' ? '' : 'none';
    });
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = $('#loginUser').value.trim();
    const p = $('#loginPass').value.trim();
    const user = db.users.find(x => x.username === u);
    const isDemoLogin = isDemo() && (
      (u === 'admin'  && p === 'admin123') ||
      (u === 'cajero' && p === 'cajero123')
    );
    const passOk = isDemoLogin || (p === 'admin' || p === '1234');
    if (!user && !isDemoLogin) {
      toast('Usuario o contraseña inválidos', 'error');
      return;
    }
    if (!passOk) {
      toast('Usuario o contraseña inválidos', 'error');
      return;
    }

    // Manejar conexión de red según selección
    const cajaMode = cajaSelect ? cajaSelect.value : 'local';
    if (cajaMode === 'server') {
      const result = await startAsServer(3000);
      if (!result.ok) toast('Error al iniciar servidor: ' + (result.error || ''), 'error', 3500);
    } else if (cajaMode === 'client') {
      const ip = $('#loginServerIP')?.value?.trim();
      if (!ip) { toast('Ingrese la IP del servidor', 'warn'); return; }
      const result = await connectToServer(ip, 3000);
      if (!result.ok) toast('Error al conectar: ' + (result.error || ''), 'error', 3500);
    }

    if (isDemoLogin && !user) {
      const demoUser = {
        id: Date.now(), username: u, name: u === 'admin' ? 'Administrador Demo' : 'Cajero Demo',
        role: u === 'admin' ? 'admin' : 'cashier', email: u + '@demo.com',
        branch: 'Principal', status: 'active', lastLogin: ''
      };
      db.users.push(demoUser);
      DB.save(db);
      session.user = demoUser;
      session.role = demoUser.role;
    } else {
      session.user = user || db.users[0];
      session.role = session.user.role;
    }
    session.user.lastLogin = veStamp();
    DB.save(db);
    showApp();
  });
}

function showApp() {
  $('#loginScreen').style.display = 'none';
  $('#mainApp').style.display = 'block';
  $('#userName').textContent = session.user.name;
  $('#userRole').textContent = session.user.role;
  $('#userAvatar').textContent = session.user.name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  $('#posCashierName').textContent = session.user.name;
  $('#statusCashier').textContent = session.user.name;
  // Mostrar info de caja
  const cajaInfo = document.querySelector('.pos-topstrip-left b');
  if (cajaInfo) cajaInfo.textContent = getCajaId();
  const cajaNameEl = document.getElementById('posCajaName');
  if (cajaNameEl) cajaNameEl.textContent = getCajaNombre();
  // Banner de demostración
  if (isDemo()) {
    const existing = document.getElementById('demoBanner');
    if (!existing) {
      const banner = document.createElement('div');
      banner.id = 'demoBanner';
      banner.style.cssText = 'background:linear-gradient(90deg,#f59e0b,#d97706);color:#000;text-align:center;padding:6px 12px;font-size:12px;font-weight:700;letter-spacing:.5px;position:fixed;top:0;left:0;right:0;z-index:9999';
      banner.innerHTML = 'VERSION DEMO — Productos: ' + db.products.length + '/' + DEMO_MAX_PRODUCTS + ' · Ventas: ' + db.sales.length + '/' + DEMO_MAX_SALES + ' · Adquiera la version completa';
      document.body.appendChild(banner);
    }
  }
  // Los cajeros no acceden a la administración
  const isAdmin = session.role !== 'cashier';
  $('#openDashboardBtn').style.display = isAdmin ? '' : 'none';
  // Actualizar estado de red
  updateNetworkStatusUI();
  showPOS();
  // Apertura de caja obligatoria para cajeros
  if (session.role === 'cashier' && !db.jornada?.active) {
    setTimeout(openCashOpening, 200);
  }
}

function logout() {
  session = { user: null, role: null };
  $('#mainApp').style.display = 'none';
  $('#loginScreen').style.display = 'flex';
  $('#loginUser').value = 'admin';
  $('#loginPass').value = 'admin';
}

function showPOS() {
  $('#topBar').style.display = 'none';
  $('#dashboardView').style.display = 'none';
  $('#posView').style.display = 'flex';
  renderPOS();
}

function showDashboard(initialView) {
  if (session.role === 'cashier') {
    toast('Acceso restringido: el cajero no puede acceder a la administración', 'warn');
    return;
  }
  $('#posView').style.display = 'none';
  $('#topBar').style.display = 'flex';
  $('#dashboardView').style.display = 'flex';
  renderDashboard(initialView || 'overview');
}

/* ---------- Reloj y fecha del statusbar del POS (hora de Venezuela) ---------- */
function updateClock() {
  const p = veParts();
  const h24 = Number(p.hour) || 0;
  const hh = h24 % 12 || 12;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const el = $('#statusTime');
  if (el) el.textContent = `${hh}:${p.minute} ${ampm}`;
}
function updateDate() {
  const p = veParts();
  const el = $('#statusDate');
  if (el) el.textContent = `${p.month}/${p.day}/${p.year}`;
}

/* ---------- Globales ---------- */
function bindGlobal() {
  // Botón "Panel Admin" del top strip
  $('#openDashboardBtn').addEventListener('click', () => showDashboard('overview'));
  // Botón de configuración de red
  const netBtn = $('#btnNetConfig');
  if (netBtn) netBtn.addEventListener('click', openNetworkConfig);
  // Logout
  const lo = $('#btnLogout'); if (lo) lo.addEventListener('click', logout);
  const polo = $('#btnPosLogout'); if (polo) polo.addEventListener('click', logout);
  // Cambiar usuario (volver al login)
  const sw = $('#btnSwitchUser'); if (sw) sw.addEventListener('click', logout);
  // Modal close
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeModal();
  });
  // Esc para cerrar
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
  // Atajos globales del POS
  document.addEventListener('keydown', (e) => {
    if ($('#posView').style.display === 'none') return;
    if (e.key === 'F2') { e.preventDefault(); posAction('search'); }
    if (e.key === 'F3') { e.preventDefault(); posAction('link'); }
    if (e.key === 'F4') { e.preventDefault(); posAction('quantity'); }
    if (e.key === 'F5') { e.preventDefault(); posAction('clear'); }
    if (e.key === 'F6') { e.preventDefault(); posAction('return'); }
    if (e.key === 'F7') { e.preventDefault(); posAction('pending'); }
    if (e.key === 'F8') { e.preventDefault(); posAction('checkout'); }
    if (e.key === 'F9') { e.preventDefault(); posAction('suspend'); }
    if (e.key === 'F10') { e.preventDefault(); posAction('refund'); }
    if (e.key === 'F11') { e.preventDefault(); posAction('prices'); }
    if (e.key === 'F12') { e.preventDefault(); posAction('customers'); }
  });
}

/* ---------- Modal genérico ---------- */
const MODAL_ICONS = [
  ['buscar', 'search'], ['search', 'search'], ['consult', 'search'],
  ['cliente', 'customers'], ['customer', 'customers'], ['usuario', 'customers'],
  ['proveedor', 'suppliers'], ['supplier', 'suppliers'], ['producto', 'purchases'],
  ['inventario', 'inventory'], ['stock', 'inventory'], ['compra', 'purchases'],
  ['venta', 'cxc'], ['checkout', 'checkout'], ['cobrar', 'cxc'],
  ['pago', 'cxp'], ['reembolso', 'refund'], ['refund', 'refund'],
  ['movimiento', 'sales'], ['balance', 'scale'], ['cantidad', 'qty'],
  ['configuracion', 'settings'], ['reporte', 'reports'], ['estado', 'reports'],
  ['resultado', 'reports'], ['top', 'trophy'], ['precio', 'prices'], ['price', 'prices']
];
function modalIcon(title) {
  const t = (title || '').toLowerCase();
  const hit = MODAL_ICONS.find(([k]) => t.includes(k));
  return hit ? hit[1] : 'bolt';
}
function openModal({ title, body, footer, size = '' }) {
  $('#modalTitle').textContent = title || '';
  $('#modalIcon').innerHTML = ico(modalIcon(title));
  const card = $('#modalCard');
  card.className = 'modal-card ' + size;
  $('#modalBody').innerHTML = body || '';
  $('#modalFoot').innerHTML = footer || '';
  $('#modalBackdrop').style.display = 'flex';
  card.classList.remove('anim-in');
  void card.offsetWidth; // reinicia la animación
  card.classList.add('anim-in');
}
function closeModal() {
  $('#modalBackdrop').style.display = 'none';
}

/* ---------- Toasts ---------- */
function toast(msg, type = 'info', ms = 2400) {
  const wrap = $('#toastWrap');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const gl = type === 'success' ? 'check' : type === 'error' ? 'close' : type === 'warn' ? 'warn' : 'info';
  el.innerHTML = `<span>${ico(gl)}</span><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, ms - 300);
  setTimeout(() => el.remove(), ms);
}

/* ---------- Helpers de formato en tablas ---------- */
function statusPill(s) {
  const map = {
    active: ['green', 'Activo'], inactive: ['gray', 'Inactivo'],
    paid: ['green', 'Pagado'], pending: ['yellow', 'Pendiente'],
    partial: ['blue', 'Parcial'], received: ['green', 'Recibido'],
    credit: ['yellow', 'Crédito'], cash: ['green', 'Contado'],
    aprobado: ['green', 'Aprobado'], rechazado: ['red', 'Rechazado']
  };
  const [c, l] = map[s] || ['gray', s];
  return `<span class="pill ${c}">${l}</span>`;
}

document.addEventListener('DOMContentLoaded', boot);
