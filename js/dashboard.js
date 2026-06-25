/* ============================================================
   JOAQUIN D&M - DASHBOARD
   ============================================================ */

const user = initLayout('dashboard');
let charts = {};

async function loadDashboard() {
  await Promise.all([
    loadKPIs(),
    loadCharts(),
    loadRecentTrips(),
    loadAuditLog()
  ]);
}

// ============================================================
// KPIs
// ============================================================
async function loadKPIs() {
  const today = new Date().toISOString().split('T')[0];
  const { start: wStart, end: wEnd } = getWeekRange();
  const { start: mStart, end: mEnd } = getMonthRange();

  const [viajesHoy, viajesSemana, viajesMes, colaboradores, pagosPendientes, pagosRealizados] = await Promise.all([
    db.from('viajes').select('id', { count: 'exact', head: true }).eq('fecha', today).neq('estado', 'cancelado'),
    db.from('viajes').select('id', { count: 'exact', head: true }).gte('fecha', wStart).lte('fecha', wEnd).neq('estado', 'cancelado'),
    db.from('viajes').select('id', { count: 'exact', head: true }).gte('fecha', mStart).lte('fecha', mEnd).neq('estado', 'cancelado'),
    db.from('colaboradores').select('id', { count: 'exact', head: true }).eq('estado', 'activo'),
    calcPagosPendientes(),
    calcPagosRealizados(mStart, mEnd)
  ]);

  const kpis = [
    { label: 'Viajes del Día', value: viajesHoy.count || 0, icon: '🚛', color: 'blue', footer: 'Hoy ' + formatDate(today) },
    { label: 'Viajes de la Semana', value: viajesSemana.count || 0, icon: '📅', color: 'purple', footer: 'Semana actual' },
    { label: 'Viajes del Mes', value: viajesMes.count || 0, icon: '📊', color: 'teal', footer: new Date().toLocaleString('es-PE', { month: 'long', year: 'numeric' }) },
    { label: 'Colaboradores Activos', value: colaboradores.count || 0, icon: '👥', color: 'green', footer: 'Personal disponible' },
    { label: 'Pagos Pendientes', value: pagosPendientes.count + ' viajes', icon: '⏳', color: 'amber', footer: formatMoney(pagosPendientes.monto) + ' por pagar' },
    { label: 'Pagos Realizados', value: pagosRealizados.count + ' viajes', icon: '✅', color: 'green', footer: formatMoney(pagosRealizados.monto) + ' — ' + new Date().toLocaleString('es-PE', { month: 'long' }) }
  ];

  document.getElementById('kpiGrid').innerHTML = kpis.map(k => `
    <div class="kpi-card ${k.color}">
      <div class="kpi-header">
        <div class="kpi-label">${escapeHtml(k.label)}</div>
        <div class="kpi-icon">${k.icon}</div>
      </div>
      <div class="kpi-value">${escapeHtml(String(k.value))}</div>
      <div class="kpi-footer">${escapeHtml(k.footer)}</div>
    </div>
  `).join('');
}

async function calcPagosPendientes() {
  const { data } = await db
    .from('viaje_colaboradores')
    .select('pago, viajes!inner(estado)')
    .eq('estado_pago', 'pendiente')
    .eq('viajes.estado', 'completado');
  return {
    count: (data || []).length,
    monto: (data || []).reduce((s, r) => s + (parseFloat(r.pago) || 0), 0)
  };
}

async function calcPagosRealizados(start, end) {
  const { data } = await db
    .from('viaje_colaboradores')
    .select('pago, viajes!inner(fecha)')
    .eq('estado_pago', 'pagado')
    .gte('viajes.fecha', start)
    .lte('viajes.fecha', end);
  return {
    count: (data || []).length,
    monto: (data || []).reduce((s, r) => s + (parseFloat(r.pago) || 0), 0)
  };
}

// ============================================================
// CHARTS
// ============================================================
async function loadCharts() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? '#334155' : '#E2E8F0';

  Chart.defaults.color = textColor;
  Chart.defaults.borderColor = gridColor;

  await Promise.all([
    loadChartViajesDia(),
    loadChartViajesSemana(),
    loadChartViajesMes(),
    loadChartColaboradores()
  ]);
}

async function loadChartViajesDia() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);

  const { data } = await db
    .from('viajes')
    .select('fecha')
    .gte('fecha', start.toISOString().split('T')[0])
    .lte('fecha', end.toISOString().split('T')[0])
    .neq('estado', 'cancelado')
    .order('fecha');

  const counts = {};
  const labels = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0];
    counts[key] = 0;
    labels.push(new Date(key + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }));
  }

  (data || []).forEach(v => { if (counts[v.fecha] !== undefined) counts[v.fecha]++; });
  const values = Object.values(counts);

  const ctx = document.getElementById('chartViajesDia');
  if (charts.viajesDia) charts.viajesDia.destroy();
  charts.viajesDia = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Viajes',
        data: values,
        borderColor: '#1565C0',
        backgroundColor: 'rgba(21,101,192,.1)',
        borderWidth: 2.5,
        fill: true,
        tension: .4,
        pointRadius: 3,
        pointBackgroundColor: '#1565C0'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { beginAtZero: true, ticks: { stepSize: 1 } }
      }
    }
  });
}

async function loadChartViajesSemana() {
  const labels = [];
  const values = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const { start, end } = getWeekRange(d);
    const { count } = await db
      .from('viajes')
      .select('id', { count: 'exact', head: true })
      .gte('fecha', start)
      .lte('fecha', end)
      .neq('estado', 'cancelado');

    labels.push(`S${12 - i}`);
    values.push(count || 0);
  }

  const ctx = document.getElementById('chartViajesSemana');
  if (charts.viajesSemana) charts.viajesSemana.destroy();
  charts.viajesSemana = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Viajes por Semana',
        data: values,
        backgroundColor: 'rgba(21,101,192,.75)',
        borderColor: '#1565C0',
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

async function loadChartViajesMes() {
  const labels = [];
  const values = [];
  const now = new Date();

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const { start, end } = getMonthRange(d);
    const { count } = await db
      .from('viajes')
      .select('id', { count: 'exact', head: true })
      .gte('fecha', start)
      .lte('fecha', end)
      .neq('estado', 'cancelado');

    labels.push(d.toLocaleString('es-PE', { month: 'short' }));
    values.push(count || 0);
  }

  const ctx = document.getElementById('chartViajesMes');
  if (charts.viajesMes) charts.viajesMes.destroy();
  charts.viajesMes = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Viajes por Mes',
        data: values,
        backgroundColor: [
          'rgba(11,36,71,.8)', 'rgba(21,101,192,.8)', 'rgba(33,150,243,.8)',
          'rgba(25,118,210,.8)', 'rgba(66,165,245,.8)', 'rgba(11,36,71,.8)',
          'rgba(21,101,192,.8)', 'rgba(33,150,243,.8)', 'rgba(25,118,210,.8)',
          'rgba(66,165,245,.8)', 'rgba(11,36,71,.8)', 'rgba(21,101,192,.8)'
        ],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

async function loadChartColaboradores() {
  const { start: mStart, end: mEnd } = getMonthRange();

  const { data: vcData } = await db
    .from('viaje_colaboradores')
    .select('colaborador_id, viajes!inner(fecha, estado)')
    .gte('viajes.fecha', mStart)
    .lte('viajes.fecha', mEnd)
    .eq('viajes.estado', 'completado');

  const { data: collabs } = await db
    .from('colaboradores')
    .select('id, nombre_completo')
    .eq('estado', 'activo');

  if (!collabs || collabs.length === 0) return;

  const counts = {};
  (vcData || []).forEach(vc => {
    counts[vc.colaborador_id] = (counts[vc.colaborador_id] || 0) + 1;
  });

  const sorted = collabs
    .map(c => ({ name: c.nombre_completo, count: counts[c.id] || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const ctx = document.getElementById('chartColaboradores');
  if (charts.colaboradores) charts.colaboradores.destroy();
  charts.colaboradores = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(c => c.name.split(' ')[0] + ' ' + (c.name.split(' ')[2] || '')),
      datasets: [{
        label: 'Viajes del Mes',
        data: sorted.map(c => c.count),
        backgroundColor: 'rgba(16,185,129,.75)',
        borderColor: '#10B981',
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

// ============================================================
// VIAJES RECIENTES
// ============================================================
async function loadRecentTrips() {
  const { data, error } = await db
    .from('viajes')
    .select('id, fecha, origen, destino, estado, placa_resguardo')
    .order('created_at', { ascending: false })
    .limit(8);

  if (error || !data || data.length === 0) {
    document.getElementById('recentTripsTable').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🚛</div>
        <div class="empty-title">Sin viajes registrados</div>
        <div class="empty-desc">Los viajes aparecerán aquí cuando sean registrados</div>
      </div>`;
    return;
  }

  const estadoBadge = { programado: 'badge-info', en_curso: 'badge-warning', completado: 'badge-success', cancelado: 'badge-danger' };
  const estadoLabel = { programado: 'Programado', en_curso: 'En Curso', completado: 'Completado', cancelado: 'Cancelado' };

  document.getElementById('recentTripsTable').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Origen → Destino</th>
          <th>Placa</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(v => `
          <tr>
            <td>${formatDate(v.fecha)}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${escapeHtml(v.origen)} → ${escapeHtml(v.destino)}
            </td>
            <td>${escapeHtml(v.placa_resguardo || '-')}</td>
            <td><span class="badge ${estadoBadge[v.estado] || 'badge-secondary'}">${estadoLabel[v.estado] || v.estado}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

// ============================================================
// AUDIT LOG
// ============================================================
async function loadAuditLog() {
  const { data } = await db
    .from('auditoria')
    .select('accion, modulo, descripcion, username, created_at')
    .order('created_at', { ascending: false })
    .limit(8);

  if (!data || data.length === 0) {
    document.getElementById('auditList').innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>Sin registros de auditoría</p></div>`;
    return;
  }

  const iconMap = {
    crear: { cls: 'create', icon: '+' },
    editar: { cls: 'update', icon: '✎' },
    eliminar: { cls: 'delete', icon: '✕' },
    iniciar_sesion: { cls: 'login', icon: '→' },
    cerrar_sesion: { cls: 'login', icon: '←' },
    exportar: { cls: 'export', icon: '↓' },
    backup: { cls: 'export', icon: '💾' }
  };

  document.getElementById('auditList').innerHTML = data.map(a => {
    const ic = iconMap[a.accion] || { cls: 'update', icon: '·' };
    return `
      <div class="audit-item">
        <div class="audit-dot ${ic.cls}">${ic.icon}</div>
        <div class="audit-content">
          <div class="audit-action">${escapeHtml(a.descripcion || a.accion)}</div>
          <div class="audit-meta">${escapeHtml(a.username || '-')} · ${formatDateTime(a.created_at)}</div>
        </div>
      </div>`;
  }).join('');
}

// Inicializar
loadDashboard();
