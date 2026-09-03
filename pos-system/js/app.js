/* ============================================================
   app.js — Login, navegación principal, modales, toasts
   ============================================================ */

const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));

/* ---------- Login ---------- */
async function boot() {
  // En escritorio (Electron) se carga el estado persistido en SQLite antes de pintar nada
  await hydrateFromSource();
  bindLogin();
  bindGlobal();
  hydrateIcons();
  updateClock();
  setInterval(updateClock, 1000);
  updateDate();
  // Indicador de plataforma (solo console para no alterar la UI)
  if (window.posdesktop) {
    console.info('[posdesktop]', window.posdesktop.versions);
  }
}

function bindLogin() {
  // Selector de rol Administrador / Cajero
  $$('.rtab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.rtab').forEach(t => t.classList.toggle('active', t === tab));
    });
  });
  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const u = $('#loginUser').value.trim();
    const p = $('#loginPass').value.trim();
    const user = db.users.find(x => x.username === u);
    const passOk = (p === 'admin' || p === '1234');
    if (!user || !passOk) {
      toast('Usuario o contraseña inválidos', 'error');
      return;
    }
    session.user = user;
    session.role = user.role;
    user.lastLogin = new Date().toISOString().replace('T', ' ').slice(0, 16);
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
  // Los cajeros no acceden a la administración
  const isAdmin = session.role !== 'cashier';
  $('#openDashboardBtn').style.display = isAdmin ? '' : 'none';
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

/* ---------- Reloj y fecha del statusbar del POS ---------- */
function updateClock() {
  const d = new Date();
  const hh = d.getHours() % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
  const t = `${hh}:${mm} ${ampm}`;
  const el = $('#statusTime');
  if (el) el.textContent = t;
}
function updateDate() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const y = d.getFullYear();
  const el = $('#statusDate');
  if (el) el.textContent = `${m}/${day}/${y}`;
}

/* ---------- Globales ---------- */
function bindGlobal() {
  // Botón "Panel Admin" del top strip
  $('#openDashboardBtn').addEventListener('click', () => showDashboard('overview'));
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
    if (e.key === 'F5') { e.preventDefault(); posAction('scale'); }
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
