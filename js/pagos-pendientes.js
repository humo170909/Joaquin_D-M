/* ============================================================
   JOAQUIN D&M - PAGOS PENDIENTES (VISTA AGRUPADA POR COLABORADOR)
   Agrupa en memoria con JavaScript — sin modificar la BD.
   ============================================================ */

const user              = initLayout('pagos-pendientes');
let pendientesData      = [];   // registros raw de viaje_colaboradores
let groupedData         = [];   // [{colabId, colab, trips[], totalMonto, totalHoras}]
let currentEditPend     = null;
let currentResumenColabId = null;
const isAdminPend       = Session.isAdmin();

// ============================================================
// HELPER: formato HH:MM para campos TIME de PostgreSQL
// ============================================================
function formatTime(t) {
  if (!t) return '-';
  return String(t).substring(0, 5);
}

// ============================================================
// CARGAR DATOS DESDE SUPABASE
// ============================================================
async function loadPendientes() {
  document.getElementById('tablaPendientes').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">⏳</div>
      <p>Calculando pagos pendientes...</p>
    </div>`;

  const { data, error } = await db
    .from('viaje_colaboradores')
    .select(`
      id,
      pago,
      estado_pago,
      viajes!inner(
        id, fecha, hora_salida, hora_llegada,
        origen, destino, horas_trabajadas, observaciones, estado
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

  // Ordenar por fecha descendente antes de agrupar
  pendientesData = (data || []).sort(
    (a, b) => new Date(b.viajes?.fecha || 0) - new Date(a.viajes?.fecha || 0)
  );

  groupedData = groupByColaborador(pendientesData);
  renderKpisPendientes();
  renderPendientes();
}

// ============================================================
// AGRUPAR EN MEMORIA (un solo recorrido O(n))
// ============================================================
function groupByColaborador(data) {
  const map = new Map();

  for (const r of data) {
    const cid = r.colaboradores?.id;
    if (!cid) continue;

    if (!map.has(cid)) {
      map.set(cid, {
        colabId:    cid,
        colab:      r.colaboradores,
        trips:      [],
        totalMonto: 0,
        totalHoras: 0
      });
    }

    const g = map.get(cid);
    g.trips.push(r);
    g.totalMonto += parseFloat(r.pago) || 0;
    g.totalHoras += parseFloat(r.viajes?.horas_trabajadas) || 0;
  }

  // Ordenar grupos por monto total descendente
  return Array.from(map.values()).sort((a, b) => b.totalMonto - a.totalMonto);
}

// ============================================================
// ACTUALIZAR TODO: KPIs + tabla + modal resumen si está abierto
// ============================================================
function refreshAll(keepResumenOpen = false) {
  groupedData = groupByColaborador(pendientesData);
  renderKpisPendientes();
  renderPendientes();

  if (keepResumenOpen && currentResumenColabId) {
    const g = groupedData.find(g => g.colabId === currentResumenColabId);
    if (g && g.trips.length > 0) {
      renderResumenBody(g);
    } else {
      closeResumen();
    }
  }
}

// ============================================================
// KPIs
// ============================================================
function renderKpisPendientes() {
  const total   = pendientesData.length;
  const monto   = pendientesData.reduce((s, r) => s + (parseFloat(r.pago) || 0), 0);
  const collabs = new Set(pendientesData.map(r => r.colaboradores?.id));

  document.getElementById('pendientesKpis').innerHTML = `
    <div class="kpi-card amber">
      <div class="kpi-header">
        <div class="kpi-label">Viajes Pendientes</div>
        <div class="kpi-icon">⏳</div>
      </div>
      <div class="kpi-value">${total}</div>
      <div class="kpi-footer">Sin pago registrado</div>
    </div>
    <div class="kpi-card red">
      <div class="kpi-header">
        <div class="kpi-label">Monto Pendiente</div>
        <div class="kpi-icon">💰</div>
      </div>
      <div class="kpi-value" style="font-size:1.4rem">${formatMoney(monto)}</div>
      <div class="kpi-footer">Total por pagar</div>
    </div>
    <div class="kpi-card purple">
      <div class="kpi-header">
        <div class="kpi-label">Colaboradores</div>
        <div class="kpi-icon">👥</div>
      </div>
      <div class="kpi-value">${collabs.size}</div>
      <div class="kpi-footer">Con pagos pendientes</div>
    </div>
  `;
}

// ============================================================
// RENDERIZAR TABLA AGRUPADA (una fila por colaborador)
// ============================================================
function renderPendientes() {
  const q    = document.getElementById('buscarColaborador').value.toLowerCase();
  const data = groupedData.filter(g => {
    if (!q) return true;
    const nombre = (g.colab?.nombre_completo || '').toLowerCase();
    const dni    = (g.colab?.dni || '').toLowerCase();
    return nombre.includes(q) || dni.includes(q);
  });

  if (data.length === 0) {
    const msg = q
      ? `Sin resultados para "${escapeHtml(q)}"`
      : 'Sin pagos pendientes';
    const sub = q
      ? 'Prueba con otro nombre o DNI.'
      : 'Todos los viajes completados han sido pagados.';
    document.getElementById('tablaPendientes').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <div class="empty-title">${msg}</div>
        <div class="empty-desc">${sub}</div>
      </div>`;
    return;
  }

  document.getElementById('tablaPendientes').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Colaborador</th>
          <th style="text-align:center">Cantidad de Viajes</th>
          <th style="text-align:center">Horas Totales</th>
          <th>Monto Total</th>
          <th>Estado</th>
          <th style="text-align:right;min-width:270px">Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${data.map((g, i) => `
          <tr id="group-row-${g.colabId}">
            <td style="color:var(--text-muted)">${i + 1}</td>
            <td>
              <div style="display:flex;align-items:center;gap:10px">
                <div class="collab-avatar" style="width:38px;height:38px;font-size:.78rem;flex-shrink:0">
                  ${escapeHtml(getInitials(g.colab?.nombre_completo || ''))}
                </div>
                <div>
                  <div style="font-weight:700;color:var(--text-primary)">
                    ${escapeHtml(g.colab?.nombre_completo || '-')}
                  </div>
                  <div style="font-size:.74rem;color:var(--text-muted)">
                    ${escapeHtml(g.colab?.cargo || '')}
                    ${g.colab?.dni ? ' · DNI ' + escapeHtml(g.colab.dni) : ''}
                  </div>
                </div>
              </div>
            </td>
            <td style="text-align:center">
              <span class="badge badge-warning" style="font-size:.82rem;padding:4px 12px">
                ${g.trips.length}
              </span>
            </td>
            <td style="text-align:center;white-space:nowrap;font-weight:700">
              ${formatHours(g.totalHoras)}
            </td>
            <td>
              <strong style="color:var(--warning);font-size:1rem">
                ${formatMoney(g.totalMonto)}
              </strong>
            </td>
            <td>
              <span class="badge badge-warning">Pendiente</span>
            </td>
            <td style="text-align:right">
              <div style="display:flex;gap:6px;justify-content:flex-end">
                <button class="btn btn-outline btn-sm"
                        onclick="openResumen('${g.colabId}')">
                  📋 Ver Resumen
                </button>
                <button class="btn btn-success btn-sm"
                        onclick="marcarTodoPagado('${g.colabId}')">
                  ✓ Marcar Todo Pagado
                </button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ============================================================
// MODAL RESUMEN — ABRIR
// ============================================================
function openResumen(colabId) {
  const g = groupedData.find(g => g.colabId === colabId);
  if (!g) return;
  currentResumenColabId = colabId;
  renderResumenBody(g);
  document.getElementById('modalResumen').classList.add('show');
}

function closeResumen() {
  document.getElementById('modalResumen').classList.remove('show');
  currentResumenColabId = null;
}

function renderResumenBody(g) {
  // Datos del encabezado
  document.getElementById('resumenInitials').textContent =
    getInitials(g.colab?.nombre_completo || '');
  document.getElementById('resumenNombre').textContent =
    g.colab?.nombre_completo || '-';
  document.getElementById('resumenCargo').textContent =
    g.colab?.cargo || '-';
  document.getElementById('resumenDni').textContent =
    g.colab?.dni || '-';
  document.getElementById('resumenViajes').textContent = g.trips.length;
  document.getElementById('resumenHoras').textContent  = formatHours(g.totalHoras);
  document.getElementById('resumenMonto').textContent  = formatMoney(g.totalMonto);
  document.getElementById('resumenBtnPagarTodo').setAttribute('data-colab-id', g.colabId);

  // Viajes ordenados por fecha descendente
  const trips = [...g.trips].sort(
    (a, b) => new Date(b.viajes?.fecha || 0) - new Date(a.viajes?.fecha || 0)
  );

  const accionesHeader = isAdminPend
    ? '<th style="text-align:right;min-width:100px">Acciones</th>'
    : '';

  const rows = trips.map(r => {
    const accionesCell = isAdminPend ? `
      <td style="text-align:right">
        <div style="display:flex;gap:4px;justify-content:flex-end">
          <button class="btn btn-outline btn-sm" title="Modificar"
                  onclick="openEditPendiente('${r.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" title="Eliminar"
                  onclick="deletePendienteFromResumen('${r.id}')">🗑</button>
        </div>
      </td>` : '';

    return `
      <tr id="res-row-${r.id}">
        <td style="white-space:nowrap">${formatDate(r.viajes?.fecha)}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
            title="${escapeHtml(r.viajes?.origen || '')} → ${escapeHtml(r.viajes?.destino || '')}">
          ${escapeHtml(r.viajes?.origen || '-')} → ${escapeHtml(r.viajes?.destino || '-')}
        </td>
        <td style="white-space:nowrap">${formatTime(r.viajes?.hora_salida)}</td>
        <td style="white-space:nowrap">${formatTime(r.viajes?.hora_llegada)}</td>
        <td style="white-space:nowrap">${formatHours(r.viajes?.horas_trabajadas)}</td>
        <td><strong style="color:var(--warning)">${formatMoney(r.pago)}</strong></td>
        <td><span class="badge badge-warning">Pendiente</span></td>
        ${accionesCell}
      </tr>`;
  }).join('');

  document.getElementById('resumenTripTable').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Ruta</th>
          <th>Hora Salida</th>
          <th>Hora Llegada</th>
          <th>Horas</th>
          <th>Pago</th>
          <th>Estado</th>
          ${accionesHeader}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ============================================================
// MARCAR TODO COMO PAGADO (operación única en BD)
// ============================================================
async function marcarTodoPagado(colabId) {
  const g = groupedData.find(g => g.colabId === colabId);
  if (!g || g.trips.length === 0) return;

  const ids = g.trips.map(t => t.id);

  const result = await Swal.fire({
    title:    'Confirmar Pago',
    html: `
      <div style="text-align:left">
        <p style="color:var(--text-secondary);margin-bottom:16px">
          Se registrarán como <strong>PAGADOS</strong> todos los viajes
          pendientes del colaborador.
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:.68rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">
              Cantidad de Viajes
            </div>
            <div style="font-size:1.5rem;font-weight:800;color:#0b2447">${ids.length}</div>
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:.68rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">
              Monto Total
            </div>
            <div style="font-size:1.1rem;font-weight:800;color:#f59e0b">${formatMoney(g.totalMonto)}</div>
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:.68rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">
              Horas Acumuladas
            </div>
            <div style="font-size:1.1rem;font-weight:800;color:#0b2447">${formatHours(g.totalHoras)}</div>
          </div>
        </div>
      </div>`,
    icon:               'question',
    showCancelButton:   true,
    confirmButtonText:  '✓ Confirmar Pago',
    cancelButtonText:   'Cancelar',
    confirmButtonColor: '#10B981',
    cancelButtonColor:  '#6c757d',
    reverseButtons:     true
  });

  if (!result.isConfirmed) return;

  try {
    const cu = Session.get();

    // Una sola operación UPDATE con .in() para todos los IDs del colaborador
    const { error } = await db
      .from('viaje_colaboradores')
      .update({
        estado_pago:  'pagado',
        fecha_pago:   new Date().toISOString(),
        usuario_pago: cu?.username || 'sistema'
      })
      .in('id', ids);

    if (error) throw error;

    await logAudit(
      'editar', 'pagos',
      `${ids.length} viajes de ${g.colab?.nombre_completo} marcados PAGADOS en lote por ${cu?.username || 'sistema'}`,
      null,
      { ids, estado_pago: 'pendiente' },
      { ids, estado_pago: 'pagado', fecha_pago: new Date().toISOString() }
    );

    // Quitar del estado local sin recargar la página
    const idsSet = new Set(ids);
    pendientesData = pendientesData.filter(r => !idsSet.has(r.id));

    if (currentResumenColabId === colabId) closeResumen();

    refreshAll();

    showNotification(
      'success',
      'Pagos Registrados',
      `${ids.length} viaje${ids.length !== 1 ? 's' : ''} de ${g.colab?.nombre_completo} marcados como pagados.`
    );

  } catch (err) {
    console.error('[JDM] marcarTodoPagado ERROR:', err);
    showNotification('error', 'Error al registrar pagos', err.message || 'Error desconocido.');
  }
}

// ============================================================
// ELIMINAR DESDE MODAL RESUMEN
// ============================================================
async function deletePendienteFromResumen(vcId) {
  await deletePendiente(vcId, true);
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
      if (newFecha)          updateV.fecha            = newFecha;
      if (newHoras !== null) updateV.horas_trabajadas = newHoras;
      const { error: e2 } = await db.from('viajes')
        .update(updateV).eq('id', viajeId);
      if (e2) throw e2;
    }

    await logAudit(
      'editar', 'pagos',
      `Pago pendiente modificado por ${cu?.username || 'sistema'}. VC: ${vcId}`,
      vcId, previo,
      { pago: newPago, estado_pago: newEstado, fecha: newFecha, horas_trabajadas: newHoras }
    );

    closeModalEditPendiente();

    if (newEstado === 'pagado') {
      // Quitar del listado si fue marcado como pagado
      pendientesData = pendientesData.filter(r => r.id !== vcId);
    } else {
      // Actualizar datos locales del registro
      const idx = pendientesData.findIndex(r => r.id === vcId);
      if (idx !== -1) {
        pendientesData[idx] = {
          ...pendientesData[idx],
          pago:        newPago,
          estado_pago: newEstado,
          viajes: {
            ...pendientesData[idx].viajes,
            fecha:            newFecha  || pendientesData[idx].viajes?.fecha,
            horas_trabajadas: newHoras !== null ? newHoras : pendientesData[idx].viajes?.horas_trabajadas,
            observaciones:    newObs
          }
        };
      }
    }

    // Mantener resumen abierto si estaba visible
    refreshAll(currentResumenColabId !== null);

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
async function deletePendiente(vcId, fromResumen = false) {
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

    await logAudit(
      'eliminar', 'pagos',
      `Pago pendiente eliminado por ${cu?.username || 'sistema'} — Colaborador: ${nombre}`,
      vcId,
      { colaborador: nombre, pago: record.pago, fecha: record.viajes?.fecha },
      null
    );

    pendientesData = pendientesData.filter(r => r.id !== vcId);
    refreshAll(fromResumen);

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
