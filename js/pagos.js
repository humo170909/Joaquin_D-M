/* ============================================================
   JOAQUIN D&M - PAGOS
   ============================================================ */

const user = initLayout('pagos');

let currentTab = 'semanal';
let resumenData = [];
let currentColaboradorId = null;

// ============================================================
// SWITCH TAB
// ============================================================
function switchTab(tab) {
  currentTab = tab;
  document.getElementById('tabSemanal').className = tab === 'semanal' ? 'btn btn-primary' : 'btn btn-secondary';
  document.getElementById('tabMensual').className = tab === 'mensual' ? 'btn btn-primary' : 'btn btn-secondary';
  loadPagos();
}

// ============================================================
// PERIODO
// ============================================================
function getPeriodo() {
  const tipo = document.getElementById('filtroPeriodo').value;
  if (tipo === 'semana') return getWeekRange();
  if (tipo === 'mes') return getMonthRange();
  // Personalizado
  const desde = document.getElementById('fechaDesde').value;
  const hasta = document.getElementById('fechaHasta').value;
  return { start: desde, end: hasta };
}

document.getElementById('filtroPeriodo').addEventListener('change', (e) => {
  document.getElementById('fechasPersonalizadas').style.display =
    e.target.value === 'personalizado' ? 'flex' : 'none';
});

document.getElementById('buscarColaborador').addEventListener('input', debounce(renderPagosList, 300));

// ============================================================
// CARGAR DATOS
// ============================================================
async function loadPagos() {
  const { start, end } = getPeriodo();
  if (!start || !end) {
    showNotification('warning', 'Período', 'Selecciona un rango de fechas válido');
    return;
  }

  document.getElementById('pagosList').innerHTML = `
    <div class="empty-state"><div class="empty-icon">⏳</div><p>Calculando pagos...</p></div>`;

  // Obtener colaboradores activos
  const { data: colaboradores } = await db
    .from('colaboradores')
    .select('id, nombre_completo, dni, cargo, pago_por_viaje')
    .eq('estado', 'activo')
    .order('nombres');

  if (!colaboradores || colaboradores.length === 0) {
    document.getElementById('pagosList').innerHTML = `
      <div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">Sin colaboradores activos</div></div>`;
    return;
  }

  // Obtener viaje_colaboradores en el período
  const { data: vcData } = await db
    .from('viaje_colaboradores')
    .select('colaborador_id, pago, viajes!inner(fecha, estado, horas_trabajadas, origen, destino)')
    .gte('viajes.fecha', start)
    .lte('viajes.fecha', end)
    .eq('viajes.estado', 'completado');

  // Construir resumen
  resumenData = colaboradores.map(c => {
    const mis_viajes = (vcData || []).filter(vc => vc.colaborador_id === c.id);
    const total_viajes = mis_viajes.length;
    const total_monto = mis_viajes.reduce((s, vc) => s + (parseFloat(vc.pago) || 0), 0);
    const total_horas = mis_viajes.reduce((s, vc) => s + (parseFloat(vc.viajes?.horas_trabajadas) || 0), 0);
    return { ...c, total_viajes, total_monto, total_horas, viajes: mis_viajes };
  }).sort((a, b) => b.total_monto - a.total_monto);

  loadKpis(start, end);
  renderPagosList();
}

function loadKpis(start, end) {
  const totalMonto = resumenData.reduce((s, c) => s + c.total_monto, 0);
  const totalViajes = resumenData.reduce((s, c) => s + c.total_viajes, 0);
  const conViajes = resumenData.filter(c => c.total_viajes > 0).length;
  const sinViajes = resumenData.filter(c => c.total_viajes === 0).length;

  document.getElementById('pagosKpis').innerHTML = `
    <div class="kpi-card green">
      <div class="kpi-header"><div class="kpi-label">Total a Pagar</div><div class="kpi-icon">💰</div></div>
      <div class="kpi-value" style="font-size:1.5rem">${formatMoney(totalMonto)}</div>
      <div class="kpi-footer">Período seleccionado</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-header"><div class="kpi-label">Viajes Pagados</div><div class="kpi-icon">🚛</div></div>
      <div class="kpi-value">${totalViajes}</div>
      <div class="kpi-footer">Viajes completados</div>
    </div>
    <div class="kpi-card teal">
      <div class="kpi-header"><div class="kpi-label">Con Actividad</div><div class="kpi-icon">👥</div></div>
      <div class="kpi-value">${conViajes}</div>
      <div class="kpi-footer">Colaboradores activos en período</div>
    </div>
    <div class="kpi-card amber">
      <div class="kpi-header"><div class="kpi-label">Sin Actividad</div><div class="kpi-icon">⏸</div></div>
      <div class="kpi-value">${sinViajes}</div>
      <div class="kpi-footer">Sin viajes en período</div>
    </div>
  `;
}

function renderPagosList() {
  const q = document.getElementById('buscarColaborador').value.toLowerCase();
  const data = resumenData.filter(c =>
    !q || c.nombre_completo.toLowerCase().includes(q) || c.dni.toLowerCase().includes(q)
  );

  if (data.length === 0) {
    document.getElementById('pagosList').innerHTML = `
      <div class="empty-state"><div class="empty-icon">💰</div><div class="empty-title">Sin resultados</div></div>`;
    return;
  }

  document.getElementById('pagosList').innerHTML = data.map((c, i) => `
    <div class="payment-collab-row" onclick="viewDetallePago('${c.id}')">
      <div class="collab-avatar">${escapeHtml(getInitials(c.nombre_completo))}</div>
      <div class="collab-info">
        <div class="collab-name">${escapeHtml(c.nombre_completo)}</div>
        <div class="collab-role">${escapeHtml(c.cargo || 'Sin cargo')} · DNI ${escapeHtml(c.dni)}</div>
      </div>
      <div class="payment-stats">
        <div class="payment-stat">
          <div class="payment-stat-value">${c.total_viajes}</div>
          <div class="payment-stat-label">Viajes</div>
        </div>
        <div class="payment-stat">
          <div class="payment-stat-value">${formatHours(c.total_horas)}</div>
          <div class="payment-stat-label">Horas</div>
        </div>
        <div class="payment-stat">
          <div class="payment-stat-value">${formatMoney(c.pago_por_viaje)}</div>
          <div class="payment-stat-label">S/ x Viaje</div>
        </div>
      </div>
      <div class="payment-amount" style="${c.total_monto === 0 ? 'color:var(--text-muted)' : ''}">${formatMoney(c.total_monto)}</div>
    </div>
  `).join('');
}

// ============================================================
// VER DETALLE
// ============================================================
async function viewDetallePago(colaboradorId) {
  currentColaboradorId = colaboradorId;
  const colab = resumenData.find(c => c.id === colaboradorId);
  if (!colab) return;

  document.getElementById('modalDetallePagoTitle').textContent = `Pagos — ${colab.nombre_completo}`;

  const { start, end } = getPeriodo();

  // Verificar si ya hay pago registrado para este período
  const { data: pagoExistente } = await db
    .from('pagos')
    .select('id, estado, fecha_pago')
    .eq('colaborador_id', colaboradorId)
    .eq('fecha_inicio', start)
    .eq('fecha_fin', end)
    .limit(1);

  const yaPagado = pagoExistente && pagoExistente.length > 0 && pagoExistente[0].estado === 'pagado';

  document.getElementById('btnMarcarPagado').style.display = yaPagado ? 'none' : 'flex';
  if (yaPagado) {
    document.getElementById('btnMarcarPagado').previousElementSibling.textContent = 'PAGADO ✓';
  }

  document.getElementById('modalDetallePago').classList.add('show');

  const viajes = colab.viajes || [];

  document.getElementById('modalDetallePagoBody').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px">
      <div class="kpi-card green" style="padding:14px">
        <div class="kpi-label">Total a Pagar</div>
        <div class="kpi-value" style="font-size:1.3rem">${formatMoney(colab.total_monto)}</div>
      </div>
      <div class="kpi-card blue" style="padding:14px">
        <div class="kpi-label">Total Viajes</div>
        <div class="kpi-value">${colab.total_viajes}</div>
      </div>
      <div class="kpi-card amber" style="padding:14px">
        <div class="kpi-label">Horas Totales</div>
        <div class="kpi-value">${formatHours(colab.total_horas)}</div>
      </div>
    </div>

    <div style="margin-bottom:16px;background:var(--light-bg);border-radius:var(--radius-md);padding:12px 16px;font-size:.85rem;color:var(--text-secondary)">
      📅 Período: <strong>${formatDate(start)}</strong> al <strong>${formatDate(end)}</strong>
    </div>

    ${yaPagado ? `
      <div style="background:var(--success-bg);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:16px;color:var(--success);font-weight:600">
        ✓ Pago ya realizado el ${formatDateTime(pagoExistente[0].fecha_pago)}
      </div>
    ` : ''}

    ${viajes.length === 0 ? `
      <div class="empty-state"><div class="empty-icon">🚛</div><div class="empty-title">Sin viajes en este período</div></div>
    ` : `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th>Ruta</th>
              <th>Horas</th>
              <th>Pago</th>
            </tr>
          </thead>
          <tbody>
            ${viajes.map((vc, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${formatDate(vc.viajes?.fecha)}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">
                  ${escapeHtml(vc.viajes?.origen || '-')} → ${escapeHtml(vc.viajes?.destino || '-')}
                </td>
                <td>${formatHours(vc.viajes?.horas_trabajadas)}</td>
                <td><strong style="color:var(--success)">${formatMoney(vc.pago)}</strong></td>
              </tr>
            `).join('')}
            <tr style="background:var(--light-bg);font-weight:700">
              <td colspan="3">TOTAL (${viajes.length} viajes)</td>
              <td>${formatHours(colab.total_horas)}</td>
              <td style="color:var(--success)">${formatMoney(colab.total_monto)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `}
  `;
}

// ============================================================
// MARCAR PAGADO
// ============================================================
async function marcarPagado() {
  const colab = resumenData.find(c => c.id === currentColaboradorId);
  if (!colab) return;

  const { start, end } = getPeriodo();

  const btn = document.getElementById('btnMarcarPagado');
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block"></div>';

  try {
    // Verificar si ya existe un registro para este período
    const { data: existente, error: selectError } = await db
      .from('pagos')
      .select('id')
      .eq('colaborador_id', currentColaboradorId)
      .eq('fecha_inicio', start)
      .eq('fecha_fin', end)
      .maybeSingle();

    if (selectError) throw selectError;

    const payload = {
      colaborador_id: currentColaboradorId,
      periodo:        currentTab,
      fecha_inicio:   start,
      fecha_fin:      end,
      total_viajes:   colab.total_viajes,
      total_horas:    parseFloat(colab.total_horas.toFixed(2)),
      total_monto:    parseFloat(colab.total_monto.toFixed(2)),
      estado:         'pagado',
      fecha_pago:     new Date().toISOString(),
      created_by:     Session.get()?.id
    };

    let opError;

    if (existente) {
      // Ya existe → UPDATE por ID (no necesita constraint UNIQUE)
      const { error } = await db
        .from('pagos')
        .update({ ...payload })
        .eq('id', existente.id);
      opError = error;
      console.log('[JDM] pagos.update → id:', existente.id, '| error:', error);
    } else {
      // No existe → INSERT limpio (tampoco necesita constraint para esto)
      const { error } = await db
        .from('pagos')
        .insert(payload);
      opError = error;
      console.log('[JDM] pagos.insert → error:', error);
    }

    if (opError) throw opError;

    await logAudit('crear', 'pagos',
      `Pago marcado para ${colab.nombre_completo}: ${formatMoney(colab.total_monto)}`,
      null, null, { colaborador: colab.nombre_completo, monto: colab.total_monto, periodo: `${start}/${end}` });

    showNotification('success', 'Pago Registrado',
      `Pago de ${formatMoney(colab.total_monto)} marcado para ${colab.nombre_completo}`);
    document.getElementById('modalDetallePago').classList.remove('show');

  } catch (err) {
    console.error('[JDM] marcarPagado ERROR:', err);
    showNotification('error', 'Error al registrar pago', err.message || 'Error desconocido. Revisa la consola (F12).');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>✓</span> Marcar como Pagado';
  }
}

// ============================================================
// EXPORTAR
// ============================================================
async function exportPagos() {
  if (typeof XLSX === 'undefined') {
    showNotification('warning', 'No disponible', 'Recarga con SheetJS para exportar');
    return;
  }

  const { start, end } = getPeriodo();

  const exportData = resumenData.map(c => ({
    DNI: c.dni,
    'Nombre Completo': c.nombre_completo,
    Cargo: c.cargo || '',
    'Total Viajes': c.total_viajes,
    'Horas Totales': parseFloat(c.total_horas.toFixed(2)),
    'Pago x Viaje': c.pago_por_viaje,
    'Total a Pagar': parseFloat(c.total_monto.toFixed(2)),
    'Período Desde': formatDate(start),
    'Período Hasta': formatDate(end)
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 14 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pagos');
  XLSX.writeFile(wb, `Pagos_${start}_${end}.xlsx`);

  await logAudit('exportar', 'pagos', `Exportación de pagos período ${start} al ${end}`, null, null, null);
  showNotification('success', 'Exportado', 'Reporte de pagos exportado a Excel');
}

// Inicializar
loadPagos();
