/* ============================================================
   JOAQUIN D&M - PAGOS PENDIENTES
   CRUD completo con SweetAlert2
   Solo Administrador puede Modificar y Eliminar
   ============================================================ */

const user          = initLayout('pagos-pendientes');
let pendientesData  = [];
let currentEditPend = null;
const isAdminPend   = Session.isAdmin();

// ============================================================
// CARGAR DATOS
// ============================================================
async function loadPendientes() {
  document.getElementById('tablaPendientes').innerHTML = `
    <div class="empty-state"><div class="empty-icon">⏳</div><p>Calculando pagos pendientes...</p></div>`;

  const { data, error } = await db
    .from('viaje_colaboradores')
    .select(`
      id,
      pago,
      estado_pago,
      viajes!inner(
        id, fecha, origen, destino, horas_trabajadas, observaciones, estado
      ),
      colaboradores!inner(
        id, nombre_completo, dni, cargo
      )
    `)
    .eq('estado_pago', 'pendiente')
    .eq('viajes.estado', 'completado');

  if (error) {
    console.error('[JDM] loadPendientes error:', error);
    document.getElementById('tablaPendientes').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠</div>
        <div class="empty-title">Error al cargar datos</div>
        <div class="empty-desc">${escapeHtml(error.message)}<br>
        <small>Asegúrate de haber ejecutado migration_pagos_estado.sql en Supabase.</small></div>
      </div>`;
    return;
  }

  pendientesData = (data || []).sort(
    (a, b) => new Date(b.viajes?.fecha || 0) - new Date(a.viajes?.fecha || 0)
  );
  renderKpisPendientes();
  renderPendientes();
}

// ============================================================
// KPIs
// ============================================================
function renderKpisPendientes() {
  const total    = pendientesData.length;
  const monto    = pendientesData.reduce((s, r) => s + (parseFloat(r.pago) || 0), 0);
  const collabs  = new Set(pendientesData.map(r => r.colaboradores?.id));

  document.getElementById('pendientesKpis').innerHTML = `
    <div class="kpi-card amber">
      <div class="kpi-header"><div class="kpi-label">Viajes Pendientes</div><div class="kpi-icon">⏳</div></div>
      <div class="kpi-value">${total}</div>
      <div class="kpi-footer">Sin pago registrado</div>
    </div>
    <div class="kpi-card red">
      <div class="kpi-header"><div class="kpi-label">Monto Pendiente</div><div class="kpi-icon">💰</div></div>
      <div class="kpi-value" style="font-size:1.4rem">${formatMoney(monto)}</div>
      <div class="kpi-footer">Total por pagar</div>
    </div>
    <div class="kpi-card purple">
      <div class="kpi-header"><div class="kpi-label">Colaboradores</div><div class="kpi-icon">👥</div></div>
      <div class="kpi-value">${collabs.size}</div>
      <div class="kpi-footer">Con pagos pendientes</div>
    </div>
  `;
}

// ============================================================
// RENDERIZAR TABLA
// ============================================================
function renderPendientes() {
  const q    = document.getElementById('buscarColaborador').value.toLowerCase();
  const data = pendientesData.filter(r => {
    if (!q) return true;
    const nombre = (r.colaboradores?.nombre_completo || '').toLowerCase();
    const dni    = (r.colaboradores?.dni || '').toLowerCase();
    return nombre.includes(q) || dni.includes(q);
  });

  if (data.length === 0) {
    document.getElementById('tablaPendientes').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <div class="empty-title">${q ? 'Sin resultados para "' + escapeHtml(q) + '"' : 'Sin pagos pendientes'}</div>
        <div class="empty-desc">${q ? 'Prueba con otro nombre o DNI.' : 'Todos los viajes completados han sido pagados.'}</div>
      </div>`;
    return;
  }

  const thAcciones = isAdminPend
    ? '<th style="text-align:right;min-width:120px">Acciones</th>'
    : '';

  document.getElementById('tablaPendientes').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Colaborador</th>
          <th>Fecha</th>
          <th>Ruta</th>
          <th>Horas</th>
          <th>Pago</th>
          <th>Estado</th>
          <th style="text-align:right">Pagar</th>
          ${thAcciones}
        </tr>
      </thead>
      <tbody>
        ${data.map((r, i) => `
          <tr id="row-${r.id}">
            <td style="color:var(--text-muted)">${i + 1}</td>
            <td>
              <div style="font-weight:700;color:var(--text-primary)">
                ${escapeHtml(r.colaboradores?.nombre_completo || '-')}
              </div>
              <div style="font-size:.74rem;color:var(--text-muted)">
                ${escapeHtml(r.colaboradores?.cargo || '')}
                ${r.colaboradores?.dni ? ' · DNI ' + escapeHtml(r.colaboradores.dni) : ''}
              </div>
            </td>
            <td style="white-space:nowrap">${formatDate(r.viajes?.fecha)}</td>
            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${escapeHtml(r.viajes?.origen || '-')} → ${escapeHtml(r.viajes?.destino || '-')}
            </td>
            <td style="white-space:nowrap">${formatHours(r.viajes?.horas_trabajadas)}</td>
            <td><strong style="color:var(--warning)">${formatMoney(r.pago)}</strong></td>
            <td><span class="badge badge-warning">Pendiente</span></td>
            <td style="text-align:right">
              <button class="btn btn-success btn-sm" id="btn-${r.id}"
                      onclick="marcarPagado('${r.id}', this)">
                ✓ Marcar Pagado
              </button>
            </td>
            ${isAdminPend ? `
            <td style="text-align:right">
              <div style="display:flex;gap:5px;justify-content:flex-end">
                <button class="btn btn-outline btn-sm" title="Modificar"
                        onclick="openEditPendiente('${r.id}')">✏️ Modificar</button>
                <button class="btn btn-danger btn-sm" title="Eliminar"
                        onclick="deletePendiente('${r.id}')">🗑 Eliminar</button>
              </div>
            </td>` : ''}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ============================================================
// MARCAR COMO PAGADO
// ============================================================
async function marcarPagado(vcId, btn) {
  const original = btn.innerHTML;
  btn.disabled   = true;
  btn.innerHTML  = '<div class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;margin:0 6px"></div>';

  try {
    const cu = Session.get();
    const { error } = await db
      .from('viaje_colaboradores')
      .update({
        estado_pago:  'pagado',
        fecha_pago:   new Date().toISOString(),
        usuario_pago: cu?.username || 'sistema'
      })
      .eq('id', vcId);

    if (error) throw error;

    await logAudit('editar', 'pagos',
      `Viaje marcado como pagado por ${cu?.username || 'sistema'}`,
      vcId, { estado_pago: 'pendiente' }, { estado_pago: 'pagado' });

    showNotification('success', 'Pago Registrado',
      `Marcado como pagado por ${cu?.username || 'sistema'}.`);

    const row = document.getElementById(`row-${vcId}`);
    if (row) {
      row.style.transition = 'opacity .3s';
      row.style.opacity    = '0';
      setTimeout(() => {
        pendientesData = pendientesData.filter(r => r.id !== vcId);
        renderKpisPendientes();
        renderPendientes();
      }, 300);
    }
  } catch (err) {
    console.error('[JDM] marcarPagado ERROR:', err);
    showNotification('error', 'Error al registrar pago', err.message || 'Error desconocido.');
    btn.disabled  = false;
    btn.innerHTML = original;
  }
}

// ============================================================
// MODAL EDITAR — ABRIR
// ============================================================
function openEditPendiente(vcId) {
  currentEditPend = pendientesData.find(r => r.id === vcId);
  if (!currentEditPend) return;

  const r = currentEditPend;
  document.getElementById('editPendColaborador').textContent =
    r.colaboradores?.nombre_completo || '-';
  document.getElementById('editPendRuta').textContent =
    `${r.viajes?.origen || '-'} → ${r.viajes?.destino || '-'}`;
  document.getElementById('editPendPago').value   = r.pago || '';
  document.getElementById('editPendEstado').value = r.estado_pago || 'pendiente';
  document.getElementById('editPendFecha').value  = r.viajes?.fecha || '';
  document.getElementById('editPendHoras').value  = r.viajes?.horas_trabajadas || '';
  document.getElementById('editPendObs').value    = r.viajes?.observaciones || '';

  document.getElementById('modalEditPendiente').classList.add('show');
}

function closeModalEditPendiente() {
  document.getElementById('modalEditPendiente').classList.remove('show');
  currentEditPend = null;
}

// ============================================================
// MODAL EDITAR — CONFIRMAR Y GUARDAR
// ============================================================
async function confirmSaveEditPendiente() {
  if (!currentEditPend) return;

  const pago = parseFloat(document.getElementById('editPendPago').value);
  if (isNaN(pago) || pago < 0) {
    showNotification('warning', 'Validación', 'El pago debe ser un número válido ≥ 0.');
    return;
  }

  const result = await Swal.fire({
    title:              'Confirmar modificación',
    text:               '¿Está seguro de modificar este pago?',
    icon:               'warning',
    showCancelButton:   true,
    confirmButtonColor: '#1565C0',
    cancelButtonColor:  '#6c757d',
    confirmButtonText:  'Guardar Cambios',
    cancelButtonText:   'Cancelar',
    reverseButtons:     true
  });

  if (!result.isConfirmed) return;
  await saveEditPendiente();
}

async function saveEditPendiente() {
  if (!currentEditPend) return;

  const vcId    = currentEditPend.id;
  const viajeId = currentEditPend.viajes?.id;
  const cu      = Session.get();

  const newPago   = parseFloat(document.getElementById('editPendPago').value) || 0;
  const newEstado = document.getElementById('editPendEstado').value;
  const newFecha  = document.getElementById('editPendFecha').value || null;
  const newHoras  = parseFloat(document.getElementById('editPendHoras').value) || null;
  const newObs    = document.getElementById('editPendObs').value.trim() || null;

  const previo = {
    pago:             currentEditPend.pago,
    estado_pago:      currentEditPend.estado_pago,
    fecha:            currentEditPend.viajes?.fecha,
    horas_trabajadas: currentEditPend.viajes?.horas_trabajadas,
    observaciones:    currentEditPend.viajes?.observaciones
  };

  try {
    // 1. Actualizar viaje_colaboradores
    const updateVC = { pago: newPago, estado_pago: newEstado };
    if (newEstado === 'pagado' && currentEditPend.estado_pago !== 'pagado') {
      updateVC.fecha_pago   = new Date().toISOString();
      updateVC.usuario_pago = cu?.username || 'sistema';
    }
    const { error: e1 } = await db.from('viaje_colaboradores')
      .update(updateVC).eq('id', vcId);
    if (e1) throw e1;

    // 2. Actualizar viajes (fecha, horas, observaciones)
    if (viajeId) {
      const updateV = { observaciones: newObs };
      if (newFecha)  updateV.fecha            = newFecha;
      if (newHoras !== null) updateV.horas_trabajadas = newHoras;
      const { error: e2 } = await db.from('viajes')
        .update(updateV).eq('id', viajeId);
      if (e2) throw e2;
    }

    await logAudit('editar', 'pagos',
      `Pago pendiente modificado por ${cu?.username || 'sistema'}. VC: ${vcId}`,
      vcId, previo,
      { pago: newPago, estado_pago: newEstado, fecha: newFecha, horas_trabajadas: newHoras });

    closeModalEditPendiente();
    await loadPendientes();

    Swal.fire({
      title:             '¡Actualizado!',
      text:              'Pago actualizado correctamente.',
      icon:              'success',
      timer:             2000,
      showConfirmButton: false
    });

  } catch (err) {
    console.error('[JDM] saveEditPendiente ERROR:', err);
    Swal.fire({
      title:              'Error al guardar',
      text:               err.message || 'No se pudo guardar los cambios.',
      icon:               'error',
      confirmButtonColor: '#1565C0'
    });
  }
}

// ============================================================
// ELIMINAR
// ============================================================
async function deletePendiente(vcId) {
  const record = pendientesData.find(r => r.id === vcId);
  if (!record) return;

  const nombre = record.colaboradores?.nombre_completo || 'este colaborador';

  const result = await Swal.fire({
    title:              'Eliminar Pago',
    html:               `<span style="color:var(--text-secondary)">Esta acción <strong>no se puede deshacer</strong>.<br>
                         ¿Desea eliminar el pago pendiente de<br><strong>${escapeHtml(nombre)}</strong>?</span>`,
    icon:               'warning',
    showCancelButton:   true,
    confirmButtonColor: '#EF4444',
    cancelButtonColor:  '#6c757d',
    confirmButtonText:  '🗑 Eliminar',
    cancelButtonText:   'Cancelar',
    reverseButtons:     true
  });

  if (!result.isConfirmed) return;

  try {
    const cu = Session.get();
    const { error } = await db.from('viaje_colaboradores')
      .delete().eq('id', vcId);
    if (error) throw error;

    await logAudit('eliminar', 'pagos',
      `Pago pendiente eliminado por ${cu?.username || 'sistema'} — Colaborador: ${nombre}`,
      vcId,
      { colaborador: nombre, pago: record.pago, fecha: record.viajes?.fecha },
      null);

    pendientesData = pendientesData.filter(r => r.id !== vcId);
    renderKpisPendientes();
    renderPendientes();

    Swal.fire({
      title:             'Eliminado',
      text:              'Pago eliminado correctamente.',
      icon:              'success',
      timer:             2000,
      showConfirmButton: false
    });

  } catch (err) {
    console.error('[JDM] deletePendiente ERROR:', err);
    Swal.fire({
      title:              'Error al eliminar',
      text:               err.message || 'No se pudo eliminar el registro.',
      icon:               'error',
      confirmButtonColor: '#1565C0'
    });
  }
}

// ============================================================
// EVENTOS
// ============================================================
document.getElementById('buscarColaborador')
  .addEventListener('input', debounce(renderPendientes, 300));

loadPendientes();
