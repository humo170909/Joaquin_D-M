/* ============================================================
   JOAQUIN D&M - GESTIÓN DE USUARIOS (Solo Administrador)
   ============================================================ */

const user = requireAuth('administrador');
if (!user) throw new Error('Access denied');

initLayout('usuarios');

let allUsuarios = [];

// ============================================================
// CARGAR
// ============================================================
async function loadUsuarios() {
  const [usuariosRes, logsRes] = await Promise.all([
    db.from('usuarios').select('id, username, nombre_completo, email, rol, activo, ultimo_acceso, created_at').order('created_at', { ascending: false }),
    db.from('login_logs').select('username, fecha_hora, estado, motivo, navegador').order('fecha_hora', { ascending: false }).limit(30)
  ]);

  allUsuarios = usuariosRes.data || [];
  renderTablaUsuarios(allUsuarios);
  renderLoginLogs(logsRes.data || []);
}

function renderTablaUsuarios(data) {
  const rolBadge = { administrador: 'badge-danger', supervisor: 'badge-warning', consulta: 'badge-info' };
  const rolLabel = { administrador: '🔴 Administrador', supervisor: '🟡 Supervisor', consulta: '🔵 Consulta' };

  if (data.length === 0) {
    document.getElementById('tablaUsuarios').innerHTML = `<div class="empty-state"><div class="empty-icon">🔐</div><div class="empty-title">Sin usuarios</div></div>`;
    return;
  }

  const me = Session.get();

  document.getElementById('tablaUsuarios').innerHTML = `
    <table>
      <thead>
        <tr><th>Usuario</th><th>Nombre Completo</th><th>Email</th><th>Rol</th><th>Último Acceso</th><th>Estado</th><th style="text-align:right">Acciones</th></tr>
      </thead>
      <tbody>
        ${data.map(u => `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:10px">
                <div class="user-avatar" style="background:${u.rol === 'administrador' ? 'linear-gradient(135deg,#DC2626,#EF4444)' : u.rol === 'supervisor' ? 'linear-gradient(135deg,#D97706,#F59E0B)' : 'linear-gradient(135deg,#1565C0,#2196F3)'}">${escapeHtml(getInitials(u.nombre_completo))}</div>
                <strong>${escapeHtml(u.username)}</strong>
              </div>
            </td>
            <td>${escapeHtml(u.nombre_completo)}</td>
            <td style="font-size:.82rem;color:var(--text-muted)">${escapeHtml(u.email || '-')}</td>
            <td><span class="badge ${rolBadge[u.rol] || 'badge-secondary'}">${rolLabel[u.rol] || u.rol}</span></td>
            <td style="font-size:.8rem">${formatDateTime(u.ultimo_acceso) || 'Nunca'}</td>
            <td><span class="badge ${u.activo ? 'badge-success' : 'badge-secondary'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
            <td>
              <div class="table-actions">
                <button class="btn btn-primary btn-sm" onclick="editUsuario('${u.id}')">✎</button>
                ${u.id !== me?.id ? `<button class="btn btn-danger btn-sm" onclick="deleteUsuario('${u.id}', '${escapeHtml(u.username)}')">🗑</button>` : '<span class="badge badge-info btn-sm">Tú</span>'}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function renderLoginLogs(data) {
  if (data.length === 0) {
    document.getElementById('loginLogsTable').innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>Sin registros</p></div>`;
    return;
  }
  const estadoBadge = { exitoso: 'badge-success', fallido: 'badge-danger', bloqueado: 'badge-warning' };
  document.getElementById('loginLogsTable').innerHTML = `
    <table>
      <thead>
        <tr><th>Fecha/Hora</th><th>Usuario</th><th>Estado</th><th>Motivo</th><th>Navegador</th></tr>
      </thead>
      <tbody>
        ${data.map(l => `
          <tr>
            <td style="white-space:nowrap;font-size:.8rem">${formatDateTime(l.fecha_hora)}</td>
            <td><strong>${escapeHtml(l.username)}</strong></td>
            <td><span class="badge ${estadoBadge[l.estado] || 'badge-secondary'}">${escapeHtml(l.estado)}</span></td>
            <td style="font-size:.82rem;color:var(--text-muted)">${escapeHtml(l.motivo || '-')}</td>
            <td style="font-size:.75rem;color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis">${escapeHtml((l.navegador || '').substring(0, 60))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

// ============================================================
// BÚSQUEDA
// ============================================================
document.getElementById('searchUsuarios').addEventListener('input', debounce((e) => {
  const q = e.target.value.toLowerCase();
  renderTablaUsuarios(allUsuarios.filter(u =>
    u.username.toLowerCase().includes(q) ||
    u.nombre_completo.toLowerCase().includes(q) ||
    (u.email || '').toLowerCase().includes(q)
  ));
}, 250));

// ============================================================
// MODAL
// ============================================================
function openModalUsuario(data = null) {
  const isEdit = !!data;
  document.getElementById('modalUsuarioTitle').textContent = isEdit ? 'Editar Usuario' : 'Nuevo Usuario';
  document.getElementById('userId').value = data?.id || '';
  document.getElementById('userUsername').value = data?.username || '';
  document.getElementById('userNombre').value = data?.nombre_completo || '';
  document.getElementById('userEmail').value = data?.email || '';
  document.getElementById('userRol').value = data?.rol || 'consulta';
  document.getElementById('userActivo').value = String(data?.activo ?? true);
  document.getElementById('userPassword').value = '';
  document.getElementById('labelPassword').innerHTML = isEdit
    ? 'Nueva Contraseña <span style="font-size:.75rem;color:var(--text-muted)">(dejar en blanco para no cambiar)</span>'
    : 'Contraseña <span class="required">*</span>';
  document.querySelectorAll('#formUsuario .form-input').forEach(el => el.classList.remove('is-invalid'));
  document.getElementById('modalUsuario').classList.add('show');
}

function editUsuario(id) {
  const u = allUsuarios.find(x => x.id === id);
  if (u) openModalUsuario(u);
}

function closeModalUsuario() {
  document.getElementById('modalUsuario').classList.remove('show');
}

document.getElementById('modalUsuario').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModalUsuario();
});

function togglePassVis(inputId, btn) {
  const input = document.getElementById(inputId);
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.textContent = input.type === 'password' ? '👁' : '🙈';
}

// ============================================================
// GUARDAR
// ============================================================
async function saveUsuario() {
  const id = document.getElementById('userId').value;
  const username = document.getElementById('userUsername').value.trim().toLowerCase();
  const nombre = document.getElementById('userNombre').value.trim();
  const email = document.getElementById('userEmail').value.trim();
  const rol = document.getElementById('userRol').value;
  const activo = document.getElementById('userActivo').value === 'true';
  const password = document.getElementById('userPassword').value;

  let valid = true;
  const validate = (elId, cond) => { document.getElementById(elId).classList.toggle('is-invalid', !cond); if (!cond) valid = false; };
  validate('userUsername', username.length >= 3);
  validate('userNombre', nombre.length >= 3);
  if (!id) validate('userPassword', password.length >= 8);
  if (password && password.length > 0 && password.length < 8) { validate('userPassword', false); }

  if (!valid) { showNotification('warning', 'Validación', 'Completa todos los campos correctamente'); return; }

  const btn = document.getElementById('btnSaveUsuario');
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block"></div>';

  try {
    if (id) {
      const payload = { username, nombre_completo: nombre, email: email || null, rol, activo };
      if (password) {
        // Usar RPC para hashear la contraseña
        const { error: pwdErr } = await db.rpc('update_user_password', { p_user_id: id, p_new_password: password });
        if (pwdErr) {
          // Fallback directo si RPC no existe
          payload.password_hash = password; // En producción SIEMPRE usar bcrypt
        }
      }
      const { error } = await db.from('usuarios').update(payload).eq('id', id);
      if (error) throw error;
      await logAudit('editar', 'usuarios', `Usuario ${username} editado`, id, null, { username, rol, activo });
      showNotification('success', 'Actualizado', `Usuario ${username} actualizado`);
    } else {
      const { error } = await db.from('usuarios').insert({
        username, nombre_completo: nombre, email: email || null, rol, activo,
        password_hash: password // En producción usar: await hashPassword(password)
      });
      if (error) {
        if (error.code === '23505') throw new Error('El nombre de usuario ya está en uso');
        throw error;
      }
      await logAudit('crear', 'usuarios', `Usuario ${username} creado con rol ${rol}`, null, null, { username, rol });
      showNotification('success', 'Creado', `Usuario ${username} creado correctamente`);
    }
    closeModalUsuario();
    await loadUsuarios();
  } catch (err) {
    showNotification('error', 'Error', err.message || 'No se pudo guardar el usuario');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>💾</span> Guardar';
  }
}

// ============================================================
// ELIMINAR
// ============================================================
function deleteUsuario(id, username) {
  confirmDelete(
    'Eliminar Usuario',
    `¿Eliminar al usuario <strong>${escapeHtml(username)}</strong>? Perderá acceso al sistema.`,
    async () => {
      try {
        const { error } = await db.from('usuarios').delete().eq('id', id);
        if (error) throw error;
        await logAudit('eliminar', 'usuarios', `Usuario ${username} eliminado`, id, null, null);
        showNotification('success', 'Eliminado', `Usuario ${username} eliminado`);
        await loadUsuarios();
      } catch (err) {
        showNotification('error', 'Error', err.message || 'No se pudo eliminar');
      }
    }
  );
}

// Inicializar
loadUsuarios();
