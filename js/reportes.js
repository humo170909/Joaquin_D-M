/* ============================================================
   JOAQUIN D&M - REPORTES, BACKUPS Y AUDITORÍA
   ============================================================ */

const user = initLayout('reportes');

let currentReporteTab = 'viajes';
let reporteData = { viajes: [], pagos: [], auditoria: [], backups: [] };
let periodoActual = { start: '', end: '' };

// ============================================================
// INICIALIZACIÓN
// ============================================================
async function init() {
  // Cargar colaboradores en filtro
  const { data: collabs } = await db
    .from('colaboradores')
    .select('id, nombre_completo')
    .order('nombres');

  const sel = document.getElementById('filtroColaborador');
  (collabs || []).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.nombre_completo;
    sel.appendChild(opt);
  });

  // Defaults
  const now = new Date();
  document.getElementById('filtroDia').value = now.toISOString().split('T')[0];
  document.getElementById('filtroMes').value = now.toISOString().slice(0, 7);
  document.getElementById('filtroAnio').value = now.getFullYear();

  // Set semana actual
  const wNum = getWeekNumber(now);
  document.getElementById('filtroSemana').value = `${now.getFullYear()}-W${String(wNum).padStart(2, '0')}`;

  // Tipo período change
  document.getElementById('tipoPeriodo').addEventListener('change', onTipoPeriodoChange);

  loadBackups();
  verificarBackupAutomatico();
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

function onTipoPeriodoChange() {
  const tipo = document.getElementById('tipoPeriodo').value;
  document.getElementById('selectDia').style.display = tipo === 'dia' ? 'block' : 'none';
  document.getElementById('selectSemana').style.display = tipo === 'semana' ? 'block' : 'none';
  document.getElementById('selectMes').style.display = tipo === 'mes' ? 'block' : 'none';
  document.getElementById('selectAnio').style.display = tipo === 'año' ? 'block' : 'none';
  document.getElementById('selectPersonalizado').style.display = tipo === 'personalizado' ? 'flex' : 'none';
}

function getFiltroPeriodo() {
  const tipo = document.getElementById('tipoPeriodo').value;
  if (tipo === 'dia') {
    const d = document.getElementById('filtroDia').value;
    return { start: d, end: d };
  }
  if (tipo === 'semana') {
    const w = document.getElementById('filtroSemana').value;
    if (!w) return getWeekRange();
    const [yr, wk] = w.split('-W').map(Number);
    const jan4 = new Date(yr, 0, 4);
    const start = new Date(jan4.getTime() + (wk - 1) * 7 * 86400000);
    start.setDate(start.getDate() - (start.getDay() || 7) + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  }
  if (tipo === 'mes') {
    const m = document.getElementById('filtroMes').value;
    if (!m) return getMonthRange();
    const [y, mo] = m.split('-').map(Number);
    return getMonthRange(new Date(y, mo - 1, 1));
  }
  if (tipo === 'año') {
    const y = parseInt(document.getElementById('filtroAnio').value);
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  return {
    start: document.getElementById('filtroDesde').value,
    end: document.getElementById('filtroHasta').value
  };
}

// ============================================================
// TABS
// ============================================================
function switchReporteTab(tab) {
  currentReporteTab = tab;
  ['viajes', 'pagos', 'auditoria', 'backups'].forEach(t => {
    const btn = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) btn.className = t === tab ? 'btn btn-primary' : 'btn btn-secondary';
  });
  renderTabContent();
}

// ============================================================
// GENERAR REPORTE
// ============================================================
async function generarReporte() {
  periodoActual = getFiltroPeriodo();
  if (!periodoActual.start || !periodoActual.end) {
    showNotification('warning', 'Período', 'Selecciona fechas válidas');
    return;
  }

  const colaboradorId = document.getElementById('filtroColaborador').value;

  showLoading('Generando reporte...');

  try {
    await Promise.all([
      loadReporteViajes(periodoActual, colaboradorId),
      loadReportePagos(periodoActual, colaboradorId),
      loadReporteAuditoria(periodoActual)
    ]);

    renderKpis();
    renderTabContent();
    document.getElementById('reporteKpis').removeAttribute('style');
    document.getElementById('backupsSection').removeAttribute('style');
  } finally {
    hideLoading();
  }
}

async function loadReporteViajes(periodo, colaboradorId) {
  let query = db
    .from('viajes')
    .select('id, fecha, hora_salida, hora_llegada, origen, destino, placa_resguardo, placa_trailer, conductor_resguardo, conductor_trailer, horas_trabajadas, pago_por_viaje, estado, observaciones')
    .gte('fecha', periodo.start)
    .lte('fecha', periodo.end)
    .order('fecha');

  if (colaboradorId) {
    // Filtrar por viajes donde participó el colaborador
    const { data: vcIds } = await db
      .from('viaje_colaboradores')
      .select('viaje_id')
      .eq('colaborador_id', colaboradorId);
    const ids = (vcIds || []).map(v => v.viaje_id);
    if (ids.length > 0) query = query.in('id', ids);
    else { reporteData.viajes = []; return; }
  }

  const { data } = await query;
  reporteData.viajes = data || [];
}

async function loadReportePagos(periodo, colaboradorId) {
  let query = db
    .from('viaje_colaboradores')
    .select('colaborador_id, pago, viajes!inner(fecha, origen, destino, estado, horas_trabajadas), colaboradores(nombre_completo, dni, cargo)')
    .gte('viajes.fecha', periodo.start)
    .lte('viajes.fecha', periodo.end)
    .eq('viajes.estado', 'completado');

  if (colaboradorId) {
    query = query.eq('colaborador_id', colaboradorId);
  }

  const { data } = await query;
  reporteData.pagos = data || [];
}

async function loadReporteAuditoria(periodo) {
  const { data } = await db
    .from('auditoria')
    .select('username, accion, modulo, descripcion, created_at')
    .gte('created_at', periodo.start + 'T00:00:00')
    .lte('created_at', periodo.end + 'T23:59:59')
    .order('created_at', { ascending: false })
    .limit(200);
  reporteData.auditoria = data || [];
}

function renderKpis() {
  const totalViajes = reporteData.viajes.length;
  const completados = reporteData.viajes.filter(v => v.estado === 'completado').length;
  const totalPago = reporteData.pagos.reduce((s, r) => s + (parseFloat(r.pago) || 0), 0);
  const totalHoras = reporteData.viajes.reduce((s, v) => s + (parseFloat(v.horas_trabajadas) || 0), 0);

  document.getElementById('reporteKpis').innerHTML = `
    <div class="kpi-card blue"><div class="kpi-header"><div class="kpi-label">Total Viajes</div><div class="kpi-icon">🚛</div></div><div class="kpi-value">${totalViajes}</div><div class="kpi-footer">En el período</div></div>
    <div class="kpi-card green"><div class="kpi-header"><div class="kpi-label">Completados</div><div class="kpi-icon">✅</div></div><div class="kpi-value">${completados}</div><div class="kpi-footer">Viajes terminados</div></div>
    <div class="kpi-card amber"><div class="kpi-header"><div class="kpi-label">Total a Pagar</div><div class="kpi-icon">💰</div></div><div class="kpi-value" style="font-size:1.3rem">${formatMoney(totalPago)}</div><div class="kpi-footer">A colaboradores</div></div>
    <div class="kpi-card teal"><div class="kpi-header"><div class="kpi-label">Horas Totales</div><div class="kpi-icon">⏱</div></div><div class="kpi-value">${formatHours(totalHoras)}</div><div class="kpi-footer">Trabajadas</div></div>
  `;
}

// ============================================================
// RENDER TABS
// ============================================================
function renderTabContent() {
  switch (currentReporteTab) {
    case 'viajes': renderTabViajes(); break;
    case 'pagos': renderTabPagos(); break;
    case 'auditoria': renderTabAuditoria(); break;
    case 'backups': renderTabBackups(); break;
  }
}

function renderTabViajes() {
  const data = reporteData.viajes;
  const estadoBadge = { programado: 'badge-info', en_curso: 'badge-warning', completado: 'badge-success', cancelado: 'badge-danger' };

  if (data.length === 0) {
    document.getElementById('reporteContent').innerHTML = `<div class="card-body"><div class="empty-state"><div class="empty-icon">🚛</div><div class="empty-title">Sin viajes en este período</div></div></div>`;
    return;
  }

  document.getElementById('reporteContent').innerHTML = `
    <div class="card-header">
      <div class="card-title"><div class="title-icon">🚛</div>Viajes del período (${data.length})</div>
    </div>
    <div class="card-body p-0">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Horario</th>
              <th>Ruta</th>
              <th>Placas</th>
              <th>Conductores</th>
              <th>Horas</th>
              <th>Pago</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(v => `
              <tr>
                <td>${formatDate(v.fecha)}</td>
                <td style="white-space:nowrap">${v.hora_salida || '-'} → ${v.hora_llegada || '-'}</td>
                <td>
                  <div style="font-weight:600;white-space:nowrap">${escapeHtml(v.origen)}</div>
                  <div style="font-size:.75rem;color:var(--text-muted)">→ ${escapeHtml(v.destino)}</div>
                </td>
                <td>
                  <div>${escapeHtml(v.placa_resguardo || '-')}</div>
                  <div style="font-size:.75rem;color:var(--text-muted)">${escapeHtml(v.placa_trailer || '')}</div>
                </td>
                <td>
                  <div style="font-size:.8rem">${escapeHtml(v.conductor_resguardo || '-')}</div>
                  <div style="font-size:.75rem;color:var(--text-muted)">${escapeHtml(v.conductor_trailer || '')}</div>
                </td>
                <td>${formatHours(v.horas_trabajadas)}</td>
                <td><strong style="color:var(--success)">${formatMoney(v.pago_por_viaje)}</strong></td>
                <td><span class="badge ${estadoBadge[v.estado] || 'badge-secondary'}">${v.estado}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderTabPagos() {
  const data = reporteData.pagos;
  if (data.length === 0) {
    document.getElementById('reporteContent').innerHTML = `<div class="card-body"><div class="empty-state"><div class="empty-icon">💰</div><div class="empty-title">Sin pagos en este período</div></div></div>`;
    return;
  }

  // Agrupar por colaborador
  const byCollab = {};
  data.forEach(r => {
    const id = r.colaborador_id;
    if (!byCollab[id]) {
      byCollab[id] = {
        nombre: r.colaboradores?.nombre_completo || '-',
        dni: r.colaboradores?.dni || '-',
        cargo: r.colaboradores?.cargo || '-',
        viajes: 0,
        horas: 0,
        monto: 0
      };
    }
    byCollab[id].viajes++;
    byCollab[id].horas += parseFloat(r.viajes?.horas_trabajadas) || 0;
    byCollab[id].monto += parseFloat(r.pago) || 0;
  });

  const rows = Object.values(byCollab).sort((a, b) => b.monto - a.monto);
  const totalMonto = rows.reduce((s, r) => s + r.monto, 0);

  document.getElementById('reporteContent').innerHTML = `
    <div class="card-header">
      <div class="card-title"><div class="title-icon">💰</div>Resumen de Pagos (${rows.length} colaboradores)</div>
    </div>
    <div class="card-body p-0">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>Colaborador</th><th>DNI</th><th>Cargo</th><th>Viajes</th><th>Horas</th><th>Total a Pagar</th></tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><strong>${escapeHtml(r.nombre)}</strong></td>
                <td>${escapeHtml(r.dni)}</td>
                <td>${escapeHtml(r.cargo)}</td>
                <td>${r.viajes}</td>
                <td>${formatHours(r.horas)}</td>
                <td><strong style="color:var(--success)">${formatMoney(r.monto)}</strong></td>
              </tr>
            `).join('')}
            <tr style="background:var(--light-bg);font-weight:700">
              <td colspan="5">TOTAL GENERAL</td>
              <td style="color:var(--success)">${formatMoney(totalMonto)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderTabAuditoria() {
  const data = reporteData.auditoria;
  if (data.length === 0) {
    document.getElementById('reporteContent').innerHTML = `<div class="card-body"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Sin registros de auditoría</div></div></div>`;
    return;
  }

  const accionBadge = { crear: 'badge-success', editar: 'badge-info', eliminar: 'badge-danger', iniciar_sesion: 'badge-primary', cerrar_sesion: 'badge-secondary', exportar: 'badge-warning', backup: 'badge-warning' };

  document.getElementById('reporteContent').innerHTML = `
    <div class="card-header">
      <div class="card-title"><div class="title-icon">📋</div>Registro de Auditoría (${data.length})</div>
    </div>
    <div class="card-body p-0">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>Fecha/Hora</th><th>Usuario</th><th>Acción</th><th>Módulo</th><th>Descripción</th></tr>
          </thead>
          <tbody>
            ${data.map(a => `
              <tr>
                <td style="white-space:nowrap;font-size:.8rem">${formatDateTime(a.created_at)}</td>
                <td><strong>${escapeHtml(a.username || '-')}</strong></td>
                <td><span class="badge ${accionBadge[a.accion] || 'badge-secondary'}">${escapeHtml(a.accion)}</span></td>
                <td>${escapeHtml(a.modulo || '-')}</td>
                <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(a.descripcion || '')}">
                  ${escapeHtml(a.descripcion || '-')}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderTabBackups() {
  document.getElementById('reporteContent').innerHTML = `<div class="card-body"><div class="empty-state"><div class="empty-icon">💾</div><div class="empty-title">Usa la sección "Historial de Backups" abajo</div></div></div>`;
  document.getElementById('backupsSection').removeAttribute('style');
  document.getElementById('backupsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================================
// EXPORTAR EXCEL
// ============================================================
async function exportarExcel() {
  if (typeof XLSX === 'undefined') {
    showNotification('warning', 'No disponible', 'Módulo SheetJS no cargado');
    return;
  }
  if (!periodoActual.start) {
    showNotification('warning', 'Período', 'Genera primero el reporte');
    return;
  }

  const wb = XLSX.utils.book_new();

  // Hoja Viajes
  if (reporteData.viajes.length > 0) {
    const ws1 = XLSX.utils.json_to_sheet(reporteData.viajes.map(v => ({
      Fecha: formatDate(v.fecha),
      'H. Salida': v.hora_salida, 'H. Llegada': v.hora_llegada,
      Origen: v.origen, Destino: v.destino,
      'P. Resguardo': v.placa_resguardo, 'P. Tráiler': v.placa_trailer,
      'Cond. Resguardo': v.conductor_resguardo, 'Cond. Tráiler': v.conductor_trailer,
      Horas: v.horas_trabajadas, Pago: v.pago_por_viaje, Estado: v.estado,
      Observaciones: v.observaciones
    })));
    XLSX.utils.book_append_sheet(wb, ws1, 'Viajes');
  }

  // Hoja Pagos agrupados
  if (reporteData.pagos.length > 0) {
    const byCollab = {};
    reporteData.pagos.forEach(r => {
      const id = r.colaborador_id;
      if (!byCollab[id]) byCollab[id] = { nombre: r.colaboradores?.nombre_completo, dni: r.colaboradores?.dni, cargo: r.colaboradores?.cargo, viajes: 0, monto: 0 };
      byCollab[id].viajes++;
      byCollab[id].monto += parseFloat(r.pago) || 0;
    });
    const ws2 = XLSX.utils.json_to_sheet(Object.values(byCollab).map(r => ({
      Colaborador: r.nombre, DNI: r.dni, Cargo: r.cargo, 'Total Viajes': r.viajes, 'Total Pago': r.monto
    })));
    XLSX.utils.book_append_sheet(wb, ws2, 'Pagos');
  }

  const fileName = `ReporteJDM_${periodoActual.start}_${periodoActual.end}.xlsx`;
  XLSX.writeFile(wb, fileName);

  await registrarBackup(fileName, 'excel', `${periodoActual.start} al ${periodoActual.end}`);
  await logAudit('exportar', 'reportes', `Reporte Excel generado: ${fileName}`, null, null, null);
  showNotification('success', 'Exportado', 'Reporte Excel generado correctamente');
}

// ============================================================
// EXPORTAR PDF
// ============================================================
async function exportarPDF() {
  if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
    showNotification('warning', 'No disponible', 'Módulo jsPDF no cargado');
    return;
  }
  if (!periodoActual.start) {
    showNotification('warning', 'Período', 'Genera primero el reporte');
    return;
  }

  const { jsPDF: JsPDF } = window.jspdf || { jsPDF };
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Header
  doc.setFillColor(11, 36, 71);
  doc.rect(0, 0, 297, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('JOAQUIN D&M — Empresa de Seguridad y Resguardo', 148.5, 10, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`REPORTE DE OPERACIONES | Período: ${formatDate(periodoActual.start)} al ${formatDate(periodoActual.end)}`, 148.5, 18, { align: 'center' });
  doc.text(`Generado: ${new Date().toLocaleString('es-PE')} | Usuario: ${Session.get()?.nombre_completo || '-'}`, 148.5, 24, { align: 'center' });

  let y = 36;
  doc.setTextColor(11, 36, 71);

  // KPIs
  const totalViajes = reporteData.viajes.length;
  const completados = reporteData.viajes.filter(v => v.estado === 'completado').length;
  const totalPago = reporteData.pagos.reduce((s, r) => s + (parseFloat(r.pago) || 0), 0);

  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.setFillColor(244, 246, 249);
  doc.rect(10, y, 85, 12, 'F');
  doc.rect(100, y, 85, 12, 'F');
  doc.rect(190, y, 97, 12, 'F');
  doc.text(`Total Viajes: ${totalViajes}`, 52.5, y + 8, { align: 'center' });
  doc.text(`Completados: ${completados}`, 142.5, y + 8, { align: 'center' });
  doc.text(`Total a Pagar: ${formatMoney(totalPago)}`, 238.5, y + 8, { align: 'center' });
  y += 18;

  // Tabla de Viajes
  if (reporteData.viajes.length > 0) {
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('REGISTRO DE VIAJES', 10, y);
    y += 4;

    doc.autoTable({
      startY: y,
      head: [['Fecha', 'Origen', 'Destino', 'Placa Res.', 'Placa Tráil.', 'Horas', 'Pago', 'Estado']],
      body: reporteData.viajes.map(v => [
        formatDate(v.fecha), v.origen.substring(0, 25), v.destino.substring(0, 25),
        v.placa_resguardo || '-', v.placa_trailer || '-',
        formatHours(v.horas_trabajadas), formatMoney(v.pago_por_viaje), v.estado
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [11, 36, 71], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 246, 249] },
      margin: { left: 10, right: 10 }
    });

    y = doc.lastAutoTable.finalY + 10;
  }

  // Tabla de Pagos por colaborador
  if (reporteData.pagos.length > 0 && y < 180) {
    const byCollab = {};
    reporteData.pagos.forEach(r => {
      const id = r.colaborador_id;
      if (!byCollab[id]) byCollab[id] = { nombre: r.colaboradores?.nombre_completo || '-', dni: r.colaboradores?.dni || '-', viajes: 0, monto: 0 };
      byCollab[id].viajes++;
      byCollab[id].monto += parseFloat(r.pago) || 0;
    });

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('RESUMEN DE PAGOS POR COLABORADOR', 10, y);
    y += 4;

    doc.autoTable({
      startY: y,
      head: [['Colaborador', 'DNI', 'Total Viajes', 'Total a Pagar']],
      body: Object.values(byCollab).map(r => [r.nombre, r.dni, r.viajes, formatMoney(r.monto)]),
      foot: [['TOTAL GENERAL', '', '', formatMoney(totalPago)]],
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [21, 101, 192], textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: [11, 36, 71], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 246, 249] },
      margin: { left: 10, right: 10 }
    });
  }

  // Footer
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`JOAQUIN D&M — Confidencial — Página ${i} de ${pages}`, 148.5, 200, { align: 'center' });
  }

  const fileName = `ReporteJDM_${periodoActual.start}_${periodoActual.end}.pdf`;
  doc.save(fileName);

  await registrarBackup(fileName, 'pdf', `${periodoActual.start} al ${periodoActual.end}`);
  await logAudit('exportar', 'reportes', `Reporte PDF generado: ${fileName}`, null, null, null);
  showNotification('success', 'PDF Generado', 'Reporte PDF generado y descargado');
}

// ============================================================
// BACKUPS
// ============================================================
async function loadBackups() {
  const { data } = await db
    .from('backups')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(20);

  reporteData.backups = data || [];

  if (!data || data.length === 0) {
    document.getElementById('backupsList').innerHTML = `
      <div class="empty-state"><div class="empty-icon">💾</div><div class="empty-title">Sin backups generados</div><div class="empty-desc">Los backups aparecerán aquí</div></div>`;
    return;
  }

  const tipoBadge = { excel: 'badge-success', pdf: 'badge-danger', automatico: 'badge-info', manual: 'badge-warning' };

  document.getElementById('backupsList').innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr><th>Fecha</th><th>Archivo</th><th>Tipo</th><th>Período</th><th>Usuario</th><th>Estado</th></tr>
        </thead>
        <tbody>
          ${data.map(b => `
            <tr>
              <td style="white-space:nowrap">${formatDateTime(b.fecha)}</td>
              <td style="font-size:.82rem">${escapeHtml(b.nombre_archivo)}</td>
              <td><span class="badge ${tipoBadge[b.tipo] || 'badge-secondary'}">${escapeHtml(b.tipo)}</span></td>
              <td style="font-size:.82rem">${escapeHtml(b.periodo_descripcion || '-')}</td>
              <td>${escapeHtml(b.usuario_nombre || '-')}</td>
              <td><span class="badge ${b.estado === 'completado' ? 'badge-success' : 'badge-danger'}">${escapeHtml(b.estado)}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

async function registrarBackup(nombre, tipo, periodo) {
  const u = Session.get();
  await db.from('backups').insert({
    nombre_archivo: nombre,
    tipo,
    usuario_id: u?.id || null,
    usuario_nombre: u?.nombre_completo || '-',
    periodo_descripcion: periodo,
    estado: 'completado'
  });
  await loadBackups();
}

async function generarBackupMensual() {
  const { start, end } = getMonthRange();

  periodoActual = { start, end };
  document.getElementById('tipoPeriodo').value = 'mes';
  onTipoPeriodoChange();

  await generarReporte();
  await exportarExcel();
  await exportarPDF();

  showNotification('success', 'Backup Mensual', `Backup del mes ${new Date().toLocaleString('es-PE', { month: 'long', year: 'numeric' })} generado`);
  await logAudit('backup', 'sistema', `Backup mensual automático generado: ${start} al ${end}`, null, null, null);
}

// ============================================================
// BACKUP AUTOMÁTICO (verificar al cargar)
// ============================================================
async function verificarBackupAutomatico() {
  const hoy = new Date();
  const lastDay = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();

  if (hoy.getDate() !== lastDay) return;

  const { start, end } = getMonthRange();
  const { data: existente } = await db
    .from('backups')
    .select('id')
    .eq('periodo_descripcion', `${start} al ${end}`)
    .eq('tipo', 'automatico')
    .limit(1);

  if (!existente || existente.length === 0) {
    showNotification('info', 'Backup Automático', 'Es el último día del mes. Generando backup automático...');
    setTimeout(async () => {
      periodoActual = { start, end };
      await generarReporte();
      await exportarExcel();
      await exportarPDF();
      await db.from('backups').insert({
        nombre_archivo: `AutoBackup_${start}_${end}`,
        tipo: 'automatico',
        usuario_id: Session.get()?.id,
        usuario_nombre: Session.get()?.nombre_completo,
        periodo_descripcion: `${start} al ${end}`,
        estado: 'completado'
      });
      showNotification('success', 'Backup Automático', 'Backup mensual automático completado');
    }, 3000);
  }
}

// Inicializar
init();
