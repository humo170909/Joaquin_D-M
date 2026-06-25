/* ============================================================
   JOAQUIN D&M - SUPABASE CLIENT & UTILITIES
   ============================================================ */

// ---- CONFIGURACIÓN SUPABASE ----
// IMPORTANTE: Reemplazar con tus credenciales reales de Supabase
const SUPABASE_URL = 'https://rnnqlwwasuofdgrxhxls.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJubnFsd3dhc3VvZmRncnhoeGxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMzE4NzksImV4cCI6MjA5NzgwNzg3OX0.bowkoxsrVTMtXDzr8-tkueF5YbguTS71tffGVYS8DAg';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// DEBUG — activa con: localStorage.setItem('jdm_debug','1')
// Desactiva con: localStorage.removeItem('jdm_debug')
// ============================================================
const DEBUG = localStorage.getItem('jdm_debug') === '1';

function dbg(...args) {
  if (DEBUG) console.log('[JDM]', ...args);
}

// Wrapper con logging automático para todas las operaciones DB
const dbSafe = {
  from(table) {
    const builder = db.from(table);
    const wrap = (method) => async (...args) => {
      dbg(`${table}.${method}`, ...args);
      const result = await builder[method](...args);
      if (result.error) {
        console.error(`[JDM ERROR] ${table}.${method}`, {
          code:    result.error.code,
          message: result.error.message,
          details: result.error.details,
          hint:    result.error.hint,
          status:  result.status
        });
      } else {
        dbg(`${table}.${method} OK →`, result.data ?? `count:${result.count}`);
      }
      return result;
    };
    // Pasamos el builder original pero sobreescribimos métodos clave
    return builder;
  },
  rpc(...args) { return db.rpc(...args); }
};

// ============================================================
// GESTIÓN DE SESIÓN
// ============================================================
const SESSION_KEY = 'jdm_session';
const INACTIVITY_LIMIT = 30 * 60 * 1000; // 30 minutos
let inactivityTimer = null;

const Session = {
  set(data) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      ...data,
      loginTime: Date.now()
    }));
  },

  get() {
    try {
      const data = sessionStorage.getItem(SESSION_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  clear() {
    sessionStorage.removeItem(SESSION_KEY);
  },

  isValid() {
    const s = this.get();
    return s !== null && s.id !== undefined;
  },

  getUser() {
    return this.get();
  },

  hasRole(role) {
    const s = this.get();
    if (!s) return false;
    if (s.rol === 'administrador') return true;
    if (role === 'supervisor') return s.rol === 'supervisor';
    return false;
  },

  isAdmin() { return this.getUser()?.rol === 'administrador'; },
  isSupervisor() {
    const r = this.getUser()?.rol;
    return r === 'administrador' || r === 'supervisor';
  }
};

// ============================================================
// PROTECCIÓN DE RUTAS
// ============================================================
function requireAuth(requiredRole) {
  const user = Session.get();
  if (!user) {
    window.location.href = '../index.html';
    return false;
  }

  if (requiredRole === 'administrador' && user.rol !== 'administrador') {
    showNotification('error', 'Acceso Denegado', 'No tienes permisos para acceder a esta sección');
    setTimeout(() => window.location.href = 'dashboard.html', 2000);
    return false;
  }

  resetInactivityTimer();
  return user;
}

// ============================================================
// TEMPORIZADOR DE INACTIVIDAD
// ============================================================
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(async () => {
    const user = Session.get();
    if (user) {
      await logAudit('cerrar_sesion', 'sistema', 'Sesión cerrada por inactividad (30 min)', null, null, null);
      await logLogin(user.username, 'fallido', 'Sesión expirada por inactividad');
    }
    Session.clear();
    showNotification('warning', 'Sesión Expirada', 'Tu sesión ha sido cerrada por inactividad');
    setTimeout(() => window.location.href = '../index.html', 2500);
  }, INACTIVITY_LIMIT);
}

function initInactivityMonitor() {
  const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
  events.forEach(e => document.addEventListener(e, resetInactivityTimer, { passive: true }));
  resetInactivityTimer();
  updateSessionBar();
  setInterval(updateSessionBar, 10000);
}

function updateSessionBar() {
  const bar = document.querySelector('.session-bar-fill');
  if (!bar) return;
  const s = Session.get();
  if (!s) return;
  const elapsed = Date.now() - (s.loginTime || Date.now());
  const pct = Math.max(0, 100 - (elapsed / INACTIVITY_LIMIT) * 100);
  bar.style.width = pct + '%';

  if (pct < 10) bar.className = 'session-bar-fill danger';
  else if (pct < 25) bar.className = 'session-bar-fill warning';
  else bar.className = 'session-bar-fill';
}

// ============================================================
// LOGOUT
// ============================================================
async function logout() {
  const user = Session.get();
  if (user) {
    await logAudit('cerrar_sesion', 'autenticacion', `Usuario ${user.username} cerró sesión`, null, null, null);
    await logLogin(user.username, 'exitoso', 'Cierre de sesión manual');
    await db.from('usuarios').update({ ultimo_acceso: new Date().toISOString() }).eq('id', user.id);
  }
  Session.clear();
  clearTimeout(inactivityTimer);
  window.location.href = '../index.html';
}

// ============================================================
// AUDITORÍA
// ============================================================
async function logAudit(accion, modulo, descripcion, registroId, datosAnteriores, datosNuevos) {
  try {
    const user = Session.get();
    await db.from('auditoria').insert({
      usuario_id: user?.id || null,
      username: user?.username || 'sistema',
      accion,
      modulo,
      descripcion,
      registro_id: registroId || null,
      datos_anteriores: datosAnteriores || null,
      datos_nuevos: datosNuevos || null,
      ip_address: null,
      navegador: navigator.userAgent
    });
  } catch (e) {
    console.warn('Audit log error:', e);
  }
}

// ============================================================
// LOGIN LOGS
// ============================================================
async function logLogin(username, estado, motivo) {
  try {
    await db.from('login_logs').insert({
      username,
      estado,
      motivo: motivo || null,
      navegador: navigator.userAgent,
      ip_address: null
    });
  } catch (e) {
    console.warn('Login log error:', e);
  }
}

// ============================================================
// NOTIFICACIONES
// ============================================================
function showNotification(type, title, message, duration = 4500) {
  const container = document.getElementById('notificationContainer') ||
    (() => {
      const c = document.createElement('div');
      c.id = 'notificationContainer';
      c.className = 'notification-container';
      document.body.appendChild(c);
      return c;
    })();

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  const notif = document.createElement('div');
  notif.className = `notification n-${type}`;
  notif.innerHTML = `
    <span class="notification-icon">${icons[type] || 'ℹ'}</span>
    <div class="notification-text">
      <div class="notif-title">${escapeHtml(title)}</div>
      <div class="notif-msg">${escapeHtml(message)}</div>
    </div>
    <button class="btn-notif-close" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(notif);
  requestAnimationFrame(() => notif.classList.add('show'));

  setTimeout(() => {
    notif.classList.remove('show');
    setTimeout(() => notif.remove(), 400);
  }, duration);
}

// ============================================================
// MODAL CONFIRMAR ELIMINACIÓN
// ============================================================
function confirmDelete(title, message, onConfirm) {
  const modalId = 'confirmDeleteModal';
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal modal-sm">
        <div class="modal-header">
          <div class="modal-title">
            <div class="modal-icon red">⚠</div>
            <span id="confirmDeleteTitle">Confirmar eliminación</span>
          </div>
          <button class="btn-modal-close" onclick="closeConfirmDelete()">✕</button>
        </div>
        <div class="modal-body">
          <div class="confirm-icon">🗑</div>
          <p class="confirm-text" id="confirmDeleteMsg"></p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeConfirmDelete()">Cancelar</button>
          <button class="btn btn-danger" id="confirmDeleteBtn">Eliminar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('confirmDeleteTitle').textContent = title;
  document.getElementById('confirmDeleteMsg').innerHTML = message;
  document.getElementById('confirmDeleteBtn').onclick = () => {
    closeConfirmDelete();
    onConfirm();
  };

  modal.classList.add('show');
  modal.onclick = (e) => { if (e.target === modal) closeConfirmDelete(); };
}

function closeConfirmDelete() {
  const modal = document.getElementById('confirmDeleteModal');
  if (modal) modal.classList.remove('show');
}

// ============================================================
// LOADING OVERLAY
// ============================================================
function showLoading(text = 'Cargando...') {
  let overlay = document.getElementById('loadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
      <div class="loading-spinner"></div>
      <span class="loading-text" id="loadingText">${escapeHtml(text)}</span>
    `;
    document.body.appendChild(overlay);
  } else {
    document.getElementById('loadingText').textContent = text;
  }
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.remove();
}

// ============================================================
// UTILIDADES
// ============================================================
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(date) {
  if (!date) return '-';
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dt) {
  if (!dt) return '-';
  return new Date(dt).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatMoney(amount) {
  if (amount === null || amount === undefined) return 'S/ 0.00';
  return 'S/ ' + parseFloat(amount).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatHours(h) {
  if (!h && h !== 0) return '-';
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}

function getInitials(name) {
  if (!name) return '??';
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function getWeekRange(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d.setDate(diff));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  };
}

function getMonthRange(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const start = new Date(y, m, 1).toISOString().split('T')[0];
  const end = new Date(y, m + 1, 0).toISOString().split('T')[0];
  return { start, end };
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ============================================================
// INICIALIZAR LAYOUT (sidebar + topbar)
// ============================================================
function initLayout(pageId) {
  const user = requireAuth();
  if (!user) return;

  // Render user info en topbar y sidebar
  const userInitials = document.querySelectorAll('.js-user-initials');
  userInitials.forEach(el => el.textContent = getInitials(user.nombre_completo));

  const userNames = document.querySelectorAll('.js-user-name');
  userNames.forEach(el => el.textContent = user.nombre_completo);

  const userRoles = document.querySelectorAll('.js-user-role');
  const roleLabels = { administrador: 'Administrador', supervisor: 'Supervisor', consulta: 'Consulta' };
  userRoles.forEach(el => el.textContent = roleLabels[user.rol] || user.rol);

  // Marcar nav link activo
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.dataset.page === pageId) link.classList.add('active');
  });

  // Sidebar toggle
  const sidebar = document.getElementById('sidebar');
  const topbar = document.getElementById('topbar');
  const mainContent = document.getElementById('mainContent');
  const toggleBtn = document.getElementById('sidebarToggle');
  const overlay = document.getElementById('sidebarOverlay');

  const isMobile = () => window.innerWidth <= 768;

  function updateLayout() {
    if (isMobile()) {
      sidebar.classList.remove('collapsed');
      topbar.classList.remove('sidebar-collapsed');
      mainContent.classList.remove('sidebar-collapsed');
    }
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (isMobile()) {
        sidebar.classList.toggle('mobile-open');
      } else {
        sidebar.classList.toggle('collapsed');
        topbar.classList.toggle('sidebar-collapsed');
        mainContent.classList.toggle('sidebar-collapsed');
      }
    });
  }

  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
    });
  }

  window.addEventListener('resize', updateLayout);
  updateLayout();

  // Ocultar elementos según rol
  if (!Session.isAdmin()) {
    document.querySelectorAll('[data-role="admin"]').forEach(el => el.style.display = 'none');
  }
  if (!Session.isSupervisor()) {
    document.querySelectorAll('[data-role="supervisor"]').forEach(el => el.style.display = 'none');
  }

  // Modo oscuro
  const savedTheme = localStorage.getItem('jdm_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.textContent = savedTheme === 'dark' ? '☀' : '🌙';
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('jdm_theme', next);
      themeBtn.textContent = next === 'dark' ? '☀' : '🌙';
    });
  }

  // Inactividad
  initInactivityMonitor();

  // Logout
  document.querySelectorAll('.btn-logout').forEach(btn => {
    btn.addEventListener('click', async () => {
      confirmDelete(
        'Cerrar Sesión',
        '¿Estás seguro de que deseas cerrar la sesión?',
        logout
      );
    });
  });
}

// ============================================================
// HTML DEL SIDEBAR (compartido)
// ============================================================
function renderSidebar() {
  return `
    <div class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <img src="../assets/logo.jpeg" alt="Logo Joaquin D&M" class="sidebar-logo">
        <div class="sidebar-brand">
          <h2>JOAQUIN D&amp;M</h2>
          <span>Seguridad y Resguardo</span>
        </div>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section-title">Principal</div>
        <div class="nav-item">
          <a class="nav-link" href="dashboard.html" data-page="dashboard">
            <span class="nav-icon">📊</span>
            <span class="nav-text">Dashboard</span>
          </a>
          <span class="sidebar-tooltip">Dashboard</span>
        </div>
        <div class="nav-section-title">Gestión</div>
        <div class="nav-item">
          <a class="nav-link" href="colaboradores.html" data-page="colaboradores">
            <span class="nav-icon">👥</span>
            <span class="nav-text">Colaboradores</span>
          </a>
          <span class="sidebar-tooltip">Colaboradores</span>
        </div>
        <div class="nav-item">
          <a class="nav-link" href="viajes.html" data-page="viajes">
            <span class="nav-icon">🚛</span>
            <span class="nav-text">Viajes</span>
          </a>
          <span class="sidebar-tooltip">Viajes</span>
        </div>
        <div class="nav-item">
          <a class="nav-link" href="pagos-pendientes.html" data-page="pagos-pendientes">
            <span class="nav-icon">⏳</span>
            <span class="nav-text">Pagos Pendientes</span>
          </a>
          <span class="sidebar-tooltip">Pagos Pendientes</span>
        </div>
        <div class="nav-item">
          <a class="nav-link" href="pagos-pagados.html" data-page="pagos-pagados">
            <span class="nav-icon">✅</span>
            <span class="nav-text">Pagos Realizados</span>
          </a>
          <span class="sidebar-tooltip">Pagos Realizados</span>
        </div>
        <div class="nav-section-title">Reportes</div>
        <div class="nav-item">
          <a class="nav-link" href="reportes.html" data-page="reportes">
            <span class="nav-icon">📋</span>
            <span class="nav-text">Reportes</span>
          </a>
          <span class="sidebar-tooltip">Reportes</span>
        </div>
        <div class="nav-item" data-role="admin">
          <a class="nav-link" href="usuarios.html" data-page="usuarios">
            <span class="nav-icon">🔐</span>
            <span class="nav-text">Usuarios</span>
          </a>
          <span class="sidebar-tooltip">Usuarios</span>
        </div>
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="user-avatar js-user-initials">AD</div>
          <div class="user-info">
            <div class="user-name js-user-name">Cargando...</div>
            <div class="user-role js-user-role">-</div>
          </div>
        </div>
      </div>
    </div>
    <div class="sidebar-overlay" id="sidebarOverlay"></div>
  `;
}

function renderTopbar(title, subtitle) {
  return `
    <div class="topbar" id="topbar">
      <button class="btn-sidebar-toggle" id="sidebarToggle" title="Alternar menú">☰</button>
      <div style="flex:1">
        <div class="topbar-title">${escapeHtml(title)}</div>
        ${subtitle ? `<div class="topbar-subtitle">${escapeHtml(subtitle)}</div>` : ''}
      </div>
      <div class="topbar-actions">
        <button class="btn-icon" id="themeToggle" title="Modo oscuro">🌙</button>
        <div class="topbar-divider"></div>
        <div class="topbar-user" title="Mi perfil">
          <div class="user-avatar js-user-initials">AD</div>
          <div>
            <div class="user-name js-user-name">Cargando...</div>
            <div class="user-role js-user-role">-</div>
          </div>
        </div>
        <button class="btn-icon btn-logout" title="Cerrar sesión">⏻</button>
      </div>
    </div>
  `;
}
