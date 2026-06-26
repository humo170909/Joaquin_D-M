/* ============================================================
   JOAQUIN D&M - PAGOS REALIZADOS
   CRUD completo con SweetAlert2
   Ver: todos los usuarios | Modificar/Eliminar: solo Administrador
   ============================================================ */

const user         = initLayout('pagos-pagados');
let pagadosData    = [];
let currentEditPag = null;
const isAdminPag   = Session.isAdmin();

// ============================================================
// PERÍODO
// ============================================================
function getPeriodo() {
  const tipo = document.getElementById('filtroPeriodo').value;
  const hoy  = getLimaISODate(); // fecha Lima YYYY-MM-DD

  if (tipo === 'dia')    return { start: hoy, end: hoy };
  if (tipo === 'semana') return getWeekRange();
  if (tipo === 'mes')    return getMonthRange();
  if (tipo === 'anio') {
    const y = parseInt(getLimaISODate().split('-')[0]); // año Lima
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  return {
    start: document.getElementById('fechaDesde').value,
    end:   document.getElementById('fechaHasta').value
  };
}

document.getElementById('filtroPeriodo').addEventListener('change', e => {
  document.getElementById('fechasPersonalizadas').style.display =
    e.target.value === 'personalizado' ? 'flex' : 'none';
});

// ============================================================
// CARGAR DATOS
// ============================================================
async function loadPagados() {
  const { start, end } = getPeriodo();
  if (!start || !end) {
    showNotification('warning', 'Período incompleto', 'Selecciona un rango de fechas válido.');
    return;
  }

  document.getElementById('tablaPagados').innerHTML = `
    <div class="empty-state"><div class="empty-icon">⏳</div><p>Cargando historial...</p></div>`;

  const { data, error } = await db
    .from('viaje_colaboradores')
    .select(`
      id,
      pago,
      estado_pago,
      fecha_pago,
      usuario_pago,
      viajes!inner(
        id, fecha, origen, destino, horas_trabajadas, observaciones, estado
      ),
      colaboradores!inner(
        id, nombre_completo, dni, cargo
      )
    `)
    .eq('estado_pago', 'pagado')
    .gte('viajes.fecha', start)
    .lte('viajes.fecha', end)
    .order('fecha_pago', { ascending: false });

  if (error) {
    console.error('[JDM] loadPagados error:', error);
    document.getElementById('tablaPagados').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠</div>
        <div class="empty-title">Error al cargar datos</div>
        <div class="empty-desc">${escapeHtml(error.message)}<br>
        <small>Asegúrate de haber ejecutado migration_pagos_estado.sql en Supabase.</small></div>
      </div>`;
    return;
  }

  pagadosData = data || [];
  renderKpisPagados();
  renderPagados();
}

// ============================================================
// KPIs
// ============================================================
function renderKpisPagados() {
  const total   = pagadosData.length;
  const monto   = pagadosData.reduce((s, r) => s + (parseFloat(r.pago) || 0), 0);
  const collabs = new Set(pagadosData.map(r => r.colaboradores?.id));

  document.getElementById('pagadosKpis').innerHTML = `
    <div class="kpi-card green">
      <div class="kpi-header"><div class="kpi-label">Viajes Pagados</div><div class="kpi-icon">✅</div></div>
      <div class="kpi-value">${total}</div>
      <div class="kpi-footer">En el período seleccionado</div>
    </div>
    <div class="kpi-card teal">
      <div class="kpi-header"><div class="kpi-label">Monto Total Pagado</div><div class="kpi-icon">💰</div></div>
      <div class="kpi-value" style="font-size:1.4rem">${formatMoney(monto)}</div>
      <div class="kpi-footer">Total registrado</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-header"><div class="kpi-label">Colaboradores</div><div class="kpi-icon">👥</div></div>
      <div class="kpi-value">${collabs.size}</div>
      <div class="kpi-footer">Con pagos en período</div>
    </div>
  `;

  const el = document.getElementById('pagadosCount');
  if (el) el.textContent = `${total} registro${total !== 1 ? 's' : ''}`;
}

// ============================================================
// RENDERIZAR TABLA
// ============================================================
function renderPagados() {
  const q    = document.getElementById('buscarColaborador').value.toLowerCase();
  const data = pagadosData.filter(r => {
    if (!q) return true;
    const nombre = (r.colaboradores?.nombre_completo || '').toLowerCase();
    const dni    = (r.colaboradores?.dni || '').toLowerCase();
    return nombre.includes(q) || dni.includes(q);
  });

  if (data.length === 0) {
    document.getElementById('tablaPagados').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-title">${q ? 'Sin resultados' : 'Sin pagos en este período'}</div>
        <div class="empty-desc">${q ? 'Prueba con otro nombre o DNI.' : 'No se encontraron pagos realizados.'}</div>
      </div>`;
    return;
  }

  const totalMonto = data.reduce((s, r) => s + (parseFloat(r.pago) || 0), 0);

  document.getElementById('tablaPagados').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Fecha del Pago</th>
          <th>Colaborador</th>
          <th>Ruta</th>
          <th>Horas</th>
          <th>Pago</th>
          <th>Registrado por</th>
          <th style="text-align:right;min-width:180px">Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${data.map((r, i) => `
          <tr id="rowp-${r.id}">
            <td style="color:var(--text-muted)">${i + 1}</td>
            <td style="white-space:nowrap">${formatDateTime(r.fecha_pago)}</td>
            <td>
              <div style="font-weight:700">${escapeHtml(formatNombreCompleto(r.colaboradores?.nombre_completo || ''))}</div>
              <div style="font-size:.74rem;color:var(--text-muted)">
                ${escapeHtml(r.colaboradores?.cargo || '')}
                ${r.colaboradores?.dni ? ' · DNI ' + escapeHtml(r.colaboradores.dni) : ''}
              </div>
            </td>
            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${escapeHtml(r.viajes?.origen || '-')} → ${escapeHtml(r.viajes?.destino || '-')}
            </td>
            <td>${formatHours(r.viajes?.horas_trabajadas)}</td>
            <td><strong style="color:var(--success)">${formatMoney(r.pago)}</strong></td>
            <td><span class="badge badge-info">${escapeHtml(r.usuario_pago || '-')}</span></td>
            <td style="text-align:right">
              <div style="display:flex;gap:5px;justify-content:flex-end">
                <button class="btn btn-secondary btn-sm" title="Ver detalle"
                        onclick="openViewPagado('${r.id}')">👁 Ver</button>
                ${isAdminPag ? `
                <button class="btn btn-outline btn-sm" title="Modificar"
                        onclick="openEditPagado('${r.id}')">✏️ Modificar</button>
                <button class="btn btn-danger btn-sm" title="Eliminar"
                        onclick="deletePagado('${r.id}')">🗑 Eliminar</button>
                ` : ''}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr style="background:var(--light-bg);font-weight:700">
          <td colspan="5" style="padding:12px 16px;color:var(--text-secondary)">
            TOTAL (${data.length} viajes)
          </td>
          <td style="padding:12px 16px;color:var(--success)">${formatMoney(totalMonto)}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>
  `;
}

// ============================================================
// MODAL VER — ABRIR / CERRAR
// ============================================================
function openViewPagado(vcId) {
  const r = pagadosData.find(x => x.id === vcId);
  if (!r) return;

  document.getElementById('viewPagadoTitle').textContent =
    `Detalle — ${formatNombreCompleto(r.colaboradores?.nombre_completo || '') || 'Pago'}`;

  document.getElementById('viewPagadoBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:20px">
      <div class="kpi-card green" style="padding:14px">
        <div class="kpi-label">Monto Pagado</div>
        <div class="kpi-value" style="font-size:1.3rem">${formatMoney(r.pago)}</div>
      </div>
      <div class="kpi-card blue" style="padding:14px">
        <div class="kpi-label">Horas Trabajadas</div>
        <div class="kpi-value">${formatHours(r.viajes?.horas_trabajadas)}</div>
      </div>
      <div class="kpi-card teal" style="padding:14px">
        <div class="kpi-label">Fecha del Viaje</div>
        <div class="kpi-value" style="font-size:1rem">${formatDate(r.viajes?.fecha)}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      <div style="background:var(--light-bg);border-radius:var(--radius-md);padding:14px">
        <div style="font-size:.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;margin-bottom:6px">Colaborador</div>
        <div style="font-weight:700">${escapeHtml(formatNombreCompleto(r.colaboradores?.nombre_completo || ''))}</div>
        <div style="font-size:.8rem;color:var(--text-muted)">${escapeHtml(r.colaboradores?.cargo || '')} · DNI ${escapeHtml(r.colaboradores?.dni || '')}</div>
      </div>
      <div style="background:var(--light-bg);border-radius:var(--radius-md);padding:14px">
        <div style="font-size:.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;margin-bottom:6px">Ruta</div>
        <div style="font-weight:700">${escapeHtml(r.viajes?.origen || '-')} → ${escapeHtml(r.viajes?.destino || '-')}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div style="background:var(--light-bg);border-radius:var(--radius-md);padding:14px">
        <div style="font-size:.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;margin-bottom:6px">Fecha del Pago</div>
        <div style="font-weight:700">${formatDateTime(r.fecha_pago)}</div>
      </div>
      <div style="background:var(--light-bg);border-radius:var(--radius-md);padding:14px">
        <div style="font-size:.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;margin-bottom:6px">Registrado por</div>
        <div style="font-weight:700">${escapeHtml(r.usuario_pago || '-')}</div>
      </div>
    </div>
    ${r.viajes?.observaciones ? `
    <div style="background:var(--light-bg);border-radius:var(--radius-md);padding:14px;margin-top:14px">
      <div style="font-size:.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;margin-bottom:6px">Observaciones</div>
      <div>${escapeHtml(r.viajes.observaciones)}</div>
    </div>` : ''}
  `;

  document.getElementById('modalViewPagado').classList.add('show');
}

function closeModalViewPagado() {
  document.getElementById('modalViewPagado').classList.remove('show');
}

// ============================================================
// MODAL EDITAR — ABRIR / CERRAR
// ============================================================
function openEditPagado(vcId) {
  currentEditPag = pagadosData.find(r => r.id === vcId);
  if (!currentEditPag) return;

  const r = currentEditPag;
  document.getElementById('editPagColaborador').textContent =
    formatNombreCompleto(r.colaboradores?.nombre_completo || '');
  document.getElementById('editPagRuta').textContent =
    `${r.viajes?.origen || '-'} → ${r.viajes?.destino || '-'}`;
  document.getElementById('editPagPago').value    = r.pago || '';
  document.getElementById('editPagHoras').value   = r.viajes?.horas_trabajadas || '';
  document.getElementById('editPagUsuario').value = r.usuario_pago || '';
  document.getElementById('editPagObs').value     = r.viajes?.observaciones || '';

  // Convertir ISO a datetime-local
  if (r.fecha_pago) {
    const dt  = new Date(r.fecha_pago);
    const pad = n => String(n).padStart(2, '0');
    document.getElementById('editPagFechaPago').value =
      `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}` +
      `T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  } else {
    document.getElementById('editPagFechaPago').value = '';
  }

  document.getElementById('modalEditPagado').classList.add('show');
}

function closeModalEditPagado() {
  document.getElementById('modalEditPagado').classList.remove('show');
  currentEditPag = null;
}

// ============================================================
// MODAL EDITAR — CONFIRMAR Y GUARDAR
// ============================================================
async function confirmSaveEditPagado() {
  if (!currentEditPag) return;

  const pago = parseFloat(document.getElementById('editPagPago').value);
  if (isNaN(pago) || pago < 0) {
    showNotification('warning', 'Validación', 'El pago debe ser un número válido ≥ 0.');
    return;
  }

  const result = await Swal.fire({
    title:              'Modificar Pago',
    text:               '¿Está seguro de guardar los cambios?',
    icon:               'question',
    showCancelButton:   true,
    confirmButtonColor: '#1565C0',
    cancelButtonColor:  '#6c757d',
    confirmButtonText:  '💾 Guardar Cambios',
    cancelButtonText:   'Cancelar',
    reverseButtons:     true
  });

  if (!result.isConfirmed) return;
  await saveEditPagado();
}

async function saveEditPagado() {
  if (!currentEditPag) return;

  const vcId    = currentEditPag.id;
  const viajeId = currentEditPag.viajes?.id;
  const cu      = Session.get();

  const newPago    = parseFloat(document.getElementById('editPagPago').value) || 0;
  const rawFecha   = document.getElementById('editPagFechaPago').value;
  const newFecha   = rawFecha ? new Date(rawFecha).toISOString() : null;
  const newHoras   = parseFloat(document.getElementById('editPagHoras').value) || null;
  const newUsuario = document.getElementById('editPagUsuario').value.trim();
  const newObs     = document.getElementById('editPagObs').value.trim() || null;

  const previo = {
    pago:             currentEditPag.pago,
    fecha_pago:       currentEditPag.fecha_pago,
    horas_trabajadas: currentEditPag.viajes?.horas_trabajadas,
    usuario_pago:     currentEditPag.usuario_pago,
    observaciones:    currentEditPag.viajes?.observaciones
  };

  try {
    // 1. Actualizar viaje_colaboradores
    const updateVC = { pago: newPago, usuario_pago: newUsuario };
    if (newFecha) updateVC.fecha_pago = newFecha;
    const { error: e1 } = await db.from('viaje_colaboradores')
      .update(updateVC).eq('id', vcId);
    if (e1) throw e1;

    // 2. Actualizar viajes (horas, observaciones)
    if (viajeId) {
      const updateV = { observaciones: newObs };
      if (newHoras !== null) updateV.horas_trabajadas = newHoras;
      const { error: e2 } = await db.from('viajes')
        .update(updateV).eq('id', viajeId);
      if (e2) throw e2;
    }

    await logAudit('editar', 'pagos',
      `Pago realizado modificado por ${cu?.username || 'sistema'}. VC: ${vcId}`,
      vcId, previo,
      { pago: newPago, fecha_pago: newFecha, horas_trabajadas: newHoras, usuario_pago: newUsuario });

    closeModalEditPagado();
    await loadPagados();

    Swal.fire({
      title:             '¡Actualizado!',
      text:              'Pago actualizado correctamente.',
      icon:              'success',
      timer:             2000,
      showConfirmButton: false
    });

  } catch (err) {
    console.error('[JDM] saveEditPagado ERROR:', err);
    Swal.fire({
      title:              'Error al guardar',
      text:               err.message || 'No se pudo guardar los cambios.',
      icon:               'error',
      confirmButtonColor: '#1565C0'
    });
  }
}

// ============================================================
// ELIMINAR (restaura a pendiente — mantiene integridad referencial)
// ============================================================
async function deletePagado(vcId) {
  const record = pagadosData.find(r => r.id === vcId);
  if (!record) return;

  const nombre = formatNombreCompleto(record.colaboradores?.nombre_completo || '') || 'este colaborador';

  const result = await Swal.fire({
    title:              'Eliminar Pago Registrado',
    html:               `<span style="color:var(--text-secondary)">
                         Esta acción eliminará el historial del pago.<br>
                         El registro volverá a estado <strong>Pendiente</strong>.<br><br>
                         ¿Desea continuar?</span>`,
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
      .update({ estado_pago: 'pendiente', fecha_pago: null, usuario_pago: null })
      .eq('id', vcId);
    if (error) throw error;

    await logAudit('eliminar', 'pagos',
      `Historial de pago eliminado por ${cu?.username || 'sistema'} — Colaborador: ${nombre}`,
      vcId,
      { estado_pago: 'pagado', fecha_pago: record.fecha_pago, usuario_pago: record.usuario_pago },
      { estado_pago: 'pendiente', fecha_pago: null, usuario_pago: null });

    pagadosData = pagadosData.filter(r => r.id !== vcId);
    renderKpisPagados();
    renderPagados();

    Swal.fire({
      title:             'Eliminado',
      text:              'Historial eliminado. El viaje volvió a estado Pendiente.',
      icon:              'success',
      timer:             2500,
      showConfirmButton: false
    });

  } catch (err) {
    console.error('[JDM] deletePagado ERROR:', err);
    Swal.fire({
      title:              'Error al eliminar',
      text:               err.message || 'No se pudo eliminar el registro.',
      icon:               'error',
      confirmButtonColor: '#1565C0'
    });
  }
}

// ============================================================
// EXPORTAR EXCEL
// ============================================================
async function exportExcel() {
  if (typeof XLSX === 'undefined') {
    showNotification('warning', 'Librería no cargada', 'Recarga la página e intenta nuevamente.');
    return;
  }
  if (pagadosData.length === 0) {
    showNotification('warning', 'Sin datos', 'No hay registros para exportar.');
    return;
  }

  const { start, end } = getPeriodo();
  const totalMonto = pagadosData.reduce((s, r) => s + (parseFloat(r.pago) || 0), 0);

  const rows = pagadosData.map((r, i) => ({
    '#':               i + 1,
    'Fecha del Pago':  formatDateTime(r.fecha_pago),
    'Colaborador':     formatNombreCompleto(r.colaboradores?.nombre_completo || ''),
    'DNI':             r.colaboradores?.dni || '-',
    'Cargo':           r.colaboradores?.cargo || '-',
    'Origen':          r.viajes?.origen || '-',
    'Destino':         r.viajes?.destino || '-',
    'Horas':           parseFloat(r.viajes?.horas_trabajadas || 0).toFixed(2),
    'Pago (S/)':       parseFloat(r.pago || 0).toFixed(2),
    'Registrado por':  r.usuario_pago || '-'
  }));
  rows.push({ '#': '', 'Fecha del Pago': '', 'Colaborador': 'TOTAL',
    'DNI': '', 'Cargo': '', 'Origen': '', 'Destino': '', 'Horas': '',
    'Pago (S/)': parseFloat(totalMonto.toFixed(2)), 'Registrado por': '' });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch:5 },{ wch:20 },{ wch:30 },{ wch:12 },{ wch:20 },
                 { wch:22 },{ wch:22 },{ wch:8 },{ wch:12 },{ wch:18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pagos Realizados');
  XLSX.writeFile(wb, `Pagos_Realizados_${start}_${end}.xlsx`);

  await logAudit('exportar', 'pagos',
    `Exportación Excel pagos realizados ${start} al ${end}`, null, null, null);
  showNotification('success', 'Excel Exportado', 'Archivo descargado correctamente.');
}

// ============================================================
// EXPORTAR PDF
// ============================================================
async function exportPDF() {
  if (typeof window.jspdf === 'undefined') {
    showNotification('warning', 'Librería no cargada', 'Recarga la página e intenta nuevamente.');
    return;
  }
  if (pagadosData.length === 0) {
    showNotification('warning', 'Sin datos', 'No hay registros para exportar.');
    return;
  }

  const { start, end } = getPeriodo();
  const totalMonto     = pagadosData.reduce((s, r) => s + (parseFloat(r.pago) || 0), 0);
  const { jsPDF }      = window.jspdf;
  const doc            = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFillColor(11, 36, 71);
  doc.rect(0, 0, 297, 22, 'F');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('JOAQUIN D&M — Pagos Realizados', 14, 14);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text(`Período: ${formatDate(start)} al ${formatDate(end)}`, 14, 30);
  doc.text(`Generado: ${getFechaHoraLima().fechaHora} | Total: ${formatMoney(totalMonto)} (${pagadosData.length} registros)`, 14, 36);

  doc.autoTable({
    startY: 42,
    head: [['#', 'Fecha Pago', 'Colaborador', 'DNI', 'Ruta', 'Horas', 'Pago (S/)', 'Registrado por']],
    body: pagadosData.map((r, i) => [
      i + 1,
      formatDateTime(r.fecha_pago),
      formatNombreCompleto(r.colaboradores?.nombre_completo || ''),
      r.colaboradores?.dni || '-',
      `${r.viajes?.origen || '-'} → ${r.viajes?.destino || '-'}`,
      formatHours(r.viajes?.horas_trabajadas),
      `S/ ${parseFloat(r.pago || 0).toFixed(2)}`,
      r.usuario_pago || '-'
    ]),
    foot: [['', '', 'TOTAL', '', '', '', `S/ ${totalMonto.toFixed(2)}`, '']],
    headStyles: { fillColor:[11,36,71], textColor:[255,255,255], fontSize:8, fontStyle:'bold' },
    bodyStyles: { fontSize:7.5 },
    footStyles: { fillColor:[244,246,249], textColor:[11,36,71], fontStyle:'bold', fontSize:8 },
    alternateRowStyles: { fillColor:[248,250,252] },
    columnStyles: {
      0:{ cellWidth:8 }, 1:{ cellWidth:36 }, 2:{ cellWidth:42 }, 3:{ cellWidth:22 },
      4:{ cellWidth:58 }, 5:{ cellWidth:18 }, 6:{ cellWidth:24 }, 7:{ cellWidth:30 }
    },
    margin: { left:14, right:14 }
  });

  doc.save(`Pagos_Realizados_${start}_${end}.pdf`);

  await logAudit('exportar', 'pagos',
    `Exportación PDF pagos realizados ${start} al ${end}`, null, null, null);
  showNotification('success', 'PDF Exportado', 'Archivo descargado correctamente.');
}

// ============================================================
// EVENTOS
// ============================================================
document.getElementById('buscarColaborador')
  .addEventListener('input', debounce(renderPagados, 300));

loadPagados();
