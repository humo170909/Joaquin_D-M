/* ============================================================
   JOAQUIN D&M - COLABORADORES CRUD
   ============================================================ */

// ---- Traducir errores de Supabase a mensajes claros ----
function resolverErrorSupabase(error) {
  if (!error) return 'Error desconocido';
  const MAP = {
    '42501': 'Sin permisos (RLS). Ejecuta fix_rls.sql en Supabase.',
    '23505': 'El DNI ya está registrado.',
    '23503': 'No se puede eliminar: tiene registros relacionados.',
    '42P01': 'La tabla no existe. Ejecuta schema.sql en Supabase.',
    'PGRST301': 'JWT expirado. Recarga la página.',
    'PGRST116': 'Registro no encontrado.'
  };
  const byStatus = {
    401: 'No autorizado (401). Ejecuta sql/fix_rls.sql en Supabase SQL Editor.',
    403: 'Prohibido (403). Verifica las políticas RLS.',
    404: 'Tabla no encontrada (404). Verifica que ejecutaste schema.sql.',
    409: 'Conflicto: el registro ya existe.'
  };
  return MAP[error.code] || byStatus[error.status] || error.message || 'Error desconocido';
}

function errorSupabase(error, status) {
  const msg = resolverErrorSupabase({ ...error, status });
  return new Error(msg);
}

const user = initLayout('colaboradores');

let allColaboradores = [];
let filteredColaboradores = [];
let currentPage = 1;
const PAGE_SIZE = 12;

// ============================================================
// CARGAR DATOS
// ============================================================
async function loadColaboradores() {
  const { data, error, status } = await db
    .from('colaboradores')
    .select('*')
    .order('nombres');

  console.log('[JDM] colaboradores.select → status:', status, '| error:', error, '| rows:', data?.length);

  if (error) {
    const msg = resolverErrorSupabase(error);
    showNotification('error', `Error ${status}`, msg);
    console.error('[JDM] colaboradores.select ERROR', { code: error.code, message: error.message, hint: error.hint });
    return;
  }

  allColaboradores = data || [];
  filteredColaboradores = [...allColaboradores];

  populateCargoFilter();
  loadKpis();
  renderTable();
}

function loadKpis() {
  const total = allColaboradores.length;
  const activos = allColaboradores.filter(c => c.estado === 'activo').length;
  const inactivos = allColaboradores.filter(c => c.estado === 'inactivo').length;
  const suspendidos = allColaboradores.filter(c => c.estado === 'suspendido').length;

  document.getElementById('collabKpis').innerHTML = `
    <div class="kpi-card blue">
      <div class="kpi-header">
        <div class="kpi-label">Total</div>
        <div class="kpi-icon">👥</div>
      </div>
      <div class="kpi-value">${total}</div>
      <div class="kpi-footer">Colaboradores registrados</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-header">
        <div class="kpi-label">Activos</div>
        <div class="kpi-icon">✅</div>
      </div>
      <div class="kpi-value">${activos}</div>
      <div class="kpi-footer">En servicio</div>
    </div>
    <div class="kpi-card amber">
      <div class="kpi-header">
        <div class="kpi-label">Inactivos</div>
        <div class="kpi-icon">⏸</div>
      </div>
      <div class="kpi-value">${inactivos}</div>
      <div class="kpi-footer">Fuera de servicio</div>
    </div>
    <div class="kpi-card red">
      <div class="kpi-header">
        <div class="kpi-label">Suspendidos</div>
        <div class="kpi-icon">🚫</div>
      </div>
      <div class="kpi-value">${suspendidos}</div>
      <div class="kpi-footer">Suspendidos</div>
    </div>
  `;
}

function populateCargoFilter() {
  const cargos = [...new Set(allColaboradores.map(c => c.cargo).filter(Boolean))].sort();
  const sel = document.getElementById('filterCargo');
  sel.innerHTML = '<option value="">Todos los cargos</option>' +
    cargos.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
}

// ============================================================
// FILTROS
// ============================================================
const searchInput = document.getElementById('searchInput');
const filterEstado = document.getElementById('filterEstado');
const filterCargo = document.getElementById('filterCargo');

const doFilter = debounce(() => {
  const q = searchInput.value.toLowerCase();
  const estado = filterEstado.value;
  const cargo = filterCargo.value;

  filteredColaboradores = allColaboradores.filter(c => {
    const matchQ = !q || (
      (c.nombres + ' ' + c.apellidos).toLowerCase().includes(q) ||
      c.dni.toLowerCase().includes(q) ||
      (c.cargo || '').toLowerCase().includes(q) ||
      (c.telefono || '').includes(q)
    );
    const matchEstado = !estado || c.estado === estado;
    const matchCargo = !cargo || c.cargo === cargo;
    return matchQ && matchEstado && matchCargo;
  });

  currentPage = 1;
  renderTable();
}, 250);

searchInput.addEventListener('input', doFilter);
filterEstado.addEventListener('change', doFilter);
filterCargo.addEventListener('change', doFilter);

// ============================================================
// RENDER TABLA
// ============================================================
function renderTable() {
  const total = filteredColaboradores.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);

  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filteredColaboradores.slice(start, start + PAGE_SIZE);

  const estadoBadge = {
    activo: 'badge-success',
    inactivo: 'badge-secondary',
    suspendido: 'badge-danger'
  };
  const estadoLabel = { activo: 'Activo', inactivo: 'Inactivo', suspendido: 'Suspendido' };

  if (page.length === 0) {
    document.getElementById('tablaColaboradores').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <div class="empty-title">Sin resultados</div>
        <div class="empty-desc">No se encontraron colaboradores con esos criterios de búsqueda</div>
      </div>`;
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  const canEdit = Session.isSupervisor();

  document.getElementById('tablaColaboradores').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Colaborador</th>
          <th>DNI</th>
          <th>Cargo</th>
          <th>Teléfono</th>
          <th>Fecha Ingreso</th>
          <th>Pago x Viaje</th>
          <th>Estado</th>
          <th style="text-align:right">Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${page.map(c => `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:10px">
                <div class="collab-avatar" style="width:36px;height:36px;font-size:.78rem">
                  ${escapeHtml(getInitials(c.nombres + ' ' + c.apellidos))}
                </div>
                <div>
                  <div style="font-weight:600">${escapeHtml(c.apellidos + ', ' + c.nombres)}</div>
                  <div style="font-size:.75rem;color:var(--text-muted)">${escapeHtml(c.direccion || 'Sin dirección')}</div>
                </div>
              </div>
            </td>
            <td><strong>${escapeHtml(c.dni)}</strong></td>
            <td>${escapeHtml(c.cargo || '-')}</td>
            <td>${escapeHtml(c.telefono || '-')}</td>
            <td>${formatDate(c.fecha_ingreso)}</td>
            <td><strong style="color:var(--success)">${formatMoney(c.pago_por_viaje)}</strong></td>
            <td><span class="badge ${estadoBadge[c.estado] || 'badge-secondary'}">${estadoLabel[c.estado] || c.estado}</span></td>
            <td>
              <div class="table-actions">
                <button class="btn btn-secondary btn-sm" onclick="viewHistorial('${c.id}', '${escapeHtml(c.apellidos + ', ' + c.nombres)}')" title="Ver historial">📋</button>
                ${canEdit ? `
                  <button class="btn btn-primary btn-sm" onclick="editColaborador('${c.id}')" title="Editar">✎</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteColaborador('${c.id}', '${escapeHtml(c.apellidos + ', ' + c.nombres)}')" title="Eliminar">🗑</button>
                ` : ''}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;

  renderPagination(total, totalPages);
}

function renderPagination(total, totalPages) {
  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, total);

  let pages = '';
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 2) {
      pages += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    } else if (Math.abs(i - currentPage) === 3) {
      pages += `<span style="padding:0 4px;color:var(--text-muted)">…</span>`;
    }
  }

  document.getElementById('pagination').innerHTML = `
    <div class="pagination-info">Mostrando ${start}-${end} de ${total} colaboradores</div>
    <div class="pagination-controls">
      <button class="page-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>
      ${pages}
      <button class="page-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>›</button>
    </div>`;
}

function goToPage(page) {
  const totalPages = Math.ceil(filteredColaboradores.length / PAGE_SIZE);
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderTable();
}

// ============================================================
// MODAL
// ============================================================
function openModalColaborador(data = null) {
  document.getElementById('modalColaboradorTitle').textContent = data ? 'Editar Colaborador' : 'Nuevo Colaborador';
  document.getElementById('colabId').value = data?.id || '';
  document.getElementById('colabDni').value = data?.dni || '';
  document.getElementById('colabNombres').value = data?.nombres || '';
  document.getElementById('colabApellidos').value = data?.apellidos || '';
  document.getElementById('colabTelefono').value = data?.telefono || '';
  document.getElementById('colabCargo').value = data?.cargo || '';
  document.getElementById('colabDireccion').value = data?.direccion || '';
  document.getElementById('colabEstado').value = data?.estado || 'activo';
  document.getElementById('colabFechaIngreso').value = data?.fecha_ingreso || getLimaISODate();
  document.getElementById('colabPago').value = data?.pago_por_viaje || 0;

  document.querySelectorAll('#formColaborador .form-input').forEach(el => el.classList.remove('is-invalid'));
  document.getElementById('modalColaborador').classList.add('show');
  document.getElementById('colabDni').focus();
}

function editColaborador(id) {
  const c = allColaboradores.find(x => x.id === id);
  if (c) openModalColaborador(c);
}

function closeModalColaborador() {
  document.getElementById('modalColaborador').classList.remove('show');
}

document.getElementById('modalColaborador').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModalColaborador();
});

// ============================================================
// GUARDAR
// ============================================================
async function saveColaborador() {
  const id = document.getElementById('colabId').value;
  const dni = document.getElementById('colabDni').value.trim();
  const nombres = document.getElementById('colabNombres').value.trim();
  const apellidos = document.getElementById('colabApellidos').value.trim();
  const cargo = document.getElementById('colabCargo').value;
  const telefono = document.getElementById('colabTelefono').value.trim();
  const direccion = document.getElementById('colabDireccion').value.trim();
  const estado = document.getElementById('colabEstado').value;
  const fechaIngreso = document.getElementById('colabFechaIngreso').value;
  const pagoPorViaje = parseFloat(document.getElementById('colabPago').value) || 0;

  // Validar
  let valid = true;
  const validate = (id, condition) => {
    const el = document.getElementById(id);
    el.classList.toggle('is-invalid', !condition);
    if (!condition) valid = false;
  };

  validate('colabDni', dni.length >= 5);
  validate('colabNombres', nombres.length >= 2);
  validate('colabApellidos', apellidos.length >= 2);
  validate('colabCargo', cargo !== '');
  validate('colabFechaIngreso', fechaIngreso !== '');

  if (!valid) {
    showNotification('warning', 'Validación', 'Completa todos los campos obligatorios');
    return;
  }

  const payload = {
    dni,
    nombres,
    apellidos,
    cargo,
    telefono:       telefono || null,
    direccion:      direccion || null,
    estado,
    fecha_ingreso:  fechaIngreso,
    pago_por_viaje: pagoPorViaje
  };

  console.log('[JDM] saveColaborador → session:', Session.get());
  console.log('[JDM] saveColaborador → payload:', payload);

  const btn = document.getElementById('btnSaveColaborador');
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;border-width:2px;display:inline-block"></div>';

  try {
    if (id) {
      const old = allColaboradores.find(x => x.id === id);
      const { error, status } = await db.from('colaboradores').update(payload).eq('id', id);
      console.log('[JDM] colaboradores.update → status:', status, '| error:', error);
      if (error) throw errorSupabase(error, status);
      await logAudit('editar', 'colaboradores', `Colaborador ${nombres} ${apellidos} editado`, id, old, payload);
      showNotification('success', 'Actualizado', `${apellidos}, ${nombres} fue actualizado correctamente`);
    } else {
      const { error, status } = await db.from('colaboradores').insert(payload);
      console.log('[JDM] colaboradores.insert → status:', status, '| error:', error);
      if (error) {
        if (error.code === '23505') throw new Error('El DNI ya está registrado en el sistema');
        throw errorSupabase(error, status);
      }
      await logAudit('crear', 'colaboradores', `Colaborador ${nombres} ${apellidos} creado`, null, null, payload);
      showNotification('success', 'Registrado', `${apellidos}, ${nombres} fue registrado correctamente`);
    }

    closeModalColaborador();
    await loadColaboradores();
  } catch (err) {
    console.error('[JDM] saveColaborador CATCH:', err);
    showNotification('error', 'Error al guardar', err.message || 'Error desconocido. Revisa la consola (F12).');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>💾</span> Guardar';
  }
}

// ============================================================
// ELIMINAR
// ============================================================
function deleteColaborador(id, nombre) {
  confirmDelete(
    'Eliminar Colaborador',
    `¿Deseas eliminar a <strong>${escapeHtml(nombre)}</strong>? Esta acción no se puede deshacer.`,
    async () => {
      try {
        const { error, status } = await db.from('colaboradores').delete().eq('id', id);
        console.log('[JDM] colaboradores.delete → status:', status, '| error:', error);
        if (error) throw errorSupabase(error, status);
        await logAudit('eliminar', 'colaboradores', `Colaborador ${nombre} eliminado`, id, null, null);
        showNotification('success', 'Eliminado', `${nombre} fue eliminado del sistema`);
        await loadColaboradores();
      } catch (err) {
        console.error('[JDM] deleteColaborador CATCH:', err);
        showNotification('error', 'Error al eliminar', err.message || 'Error desconocido. Revisa la consola (F12).');
      }
    }
  );
}

// ============================================================
// VER HISTORIAL
// ============================================================
async function viewHistorial(colaboradorId, nombre) {
  document.getElementById('modalHistorialTitle').textContent = `Historial — ${nombre}`;
  document.getElementById('modalHistorial').classList.add('show');
  document.getElementById('modalHistorialBody').innerHTML = `
    <div class="empty-state"><div class="empty-icon">⏳</div><p>Cargando historial...</p></div>`;

  const { data } = await db
    .from('viaje_colaboradores')
    .select('pago, viajes(fecha, origen, destino, estado, horas_trabajadas, placa_resguardo)')
    .eq('colaborador_id', colaboradorId)
    .order('viajes(fecha)', { ascending: false });

  if (!data || data.length === 0) {
    document.getElementById('modalHistorialBody').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🚛</div>
        <div class="empty-title">Sin viajes registrados</div>
        <div class="empty-desc">Este colaborador no tiene viajes asignados</div>
      </div>`;
    return;
  }

  const totalViajes = data.length;
  const totalPago = data.reduce((s, r) => s + (parseFloat(r.pago) || 0), 0);
  const totalHoras = data.reduce((s, r) => s + (parseFloat(r.viajes?.horas_trabajadas) || 0), 0);

  const estadoBadge = { programado: 'badge-info', en_curso: 'badge-warning', completado: 'badge-success', cancelado: 'badge-danger' };

  document.getElementById('modalHistorialBody').innerHTML = `
    <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap">
      <div class="kpi-card blue" style="flex:1;min-width:140px;padding:14px">
        <div class="kpi-label">Total Viajes</div>
        <div class="kpi-value" style="font-size:1.4rem">${totalViajes}</div>
      </div>
      <div class="kpi-card green" style="flex:1;min-width:140px;padding:14px">
        <div class="kpi-label">Total Ganado</div>
        <div class="kpi-value" style="font-size:1.4rem">${formatMoney(totalPago)}</div>
      </div>
      <div class="kpi-card amber" style="flex:1;min-width:140px;padding:14px">
        <div class="kpi-label">Horas Totales</div>
        <div class="kpi-value" style="font-size:1.4rem">${formatHours(totalHoras)}</div>
      </div>
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Origen → Destino</th>
            <th>Placa</th>
            <th>Horas</th>
            <th>Pago</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(r => {
            const v = r.viajes || {};
            return `<tr>
              <td>${formatDate(v.fecha)}</td>
              <td>${escapeHtml(v.origen || '-')} → ${escapeHtml(v.destino || '-')}</td>
              <td>${escapeHtml(v.placa_resguardo || '-')}</td>
              <td>${formatHours(v.horas_trabajadas)}</td>
              <td><strong style="color:var(--success)">${formatMoney(r.pago)}</strong></td>
              <td><span class="badge ${estadoBadge[v.estado] || 'badge-secondary'}">${v.estado || '-'}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ============================================================
// EXPORTAR
// ============================================================
async function exportColaboradores() {
  if (typeof XLSX === 'undefined') {
    showNotification('warning', 'Módulo no disponible', 'Carga la página con SheetJS para exportar');
    return;
  }

  const exportData = filteredColaboradores.map(c => ({
    DNI: c.dni,
    Nombres: c.nombres,
    Apellidos: c.apellidos,
    Cargo: c.cargo || '',
    Teléfono: c.telefono || '',
    Estado: c.estado,
    'Fecha Ingreso': formatDate(c.fecha_ingreso),
    'Pago x Viaje': c.pago_por_viaje,
    Dirección: c.direccion || ''
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Colaboradores');
  XLSX.writeFile(wb, `Colaboradores_${getLimaISODate()}.xlsx`);

  await logAudit('exportar', 'colaboradores', `Exportación de ${exportData.length} colaboradores`, null, null, null);
  showNotification('success', 'Exportado', `${exportData.length} colaboradores exportados a Excel`);
}

// Inicializar
loadColaboradores();
