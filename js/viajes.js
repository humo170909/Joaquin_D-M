/* ============================================================
   JOAQUIN D&M - VIAJES CRUD
   ============================================================ */

const user = initLayout('viajes');

let allViajes = [];
let filteredViajes = [];
let currentPage = 1;
const PAGE_SIZE = 10;
let colaboradoresList = [];
let selectedPersonal = []; // [{id, nombre, pago}]
let _modalController  = null; // AbortController activo del modal

// ============================================================
// CARGAR
// ============================================================
async function loadViajes() {
  const [viajesRes, collabsRes] = await Promise.all([
    db.from('viajes')
      .select('id, fecha, hora_salida, hora_llegada, origen, destino, placa_resguardo, placa_trailer, conductor_resguardo, conductor_trailer, horas_trabajadas, pago_por_viaje, estado, observaciones, created_at')
      .order('fecha', { ascending: false })
      .order('hora_salida', { ascending: false }),
    db.from('colaboradores').select('id, nombre_completo, pago_por_viaje, estado').eq('estado', 'activo').order('nombres')
  ]);

  allViajes = viajesRes.data || [];
  colaboradoresList = collabsRes.data || [];
  filteredViajes = [...allViajes];

  loadKpis();
  renderTable();
}

function loadKpis() {
  const today = getLimaISODate(); // fecha Lima YYYY-MM-DD
  const { start: wStart, end: wEnd } = getWeekRange();
  const { start: mStart, end: mEnd } = getMonthRange();

  const hoy = allViajes.filter(v => v.fecha === today && v.estado !== 'cancelado').length;
  const semana = allViajes.filter(v => v.fecha >= wStart && v.fecha <= wEnd && v.estado !== 'cancelado').length;
  const mes = allViajes.filter(v => v.fecha >= mStart && v.fecha <= mEnd && v.estado !== 'cancelado').length;
  const completados = allViajes.filter(v => v.estado === 'completado').length;
  const enCurso = allViajes.filter(v => v.estado === 'en_curso').length;
  const totalPago = allViajes.filter(v => v.estado === 'completado' && v.fecha >= mStart).reduce((s, v) => s + (parseFloat(v.pago_por_viaje) || 0), 0);

  document.getElementById('viajesKpis').innerHTML = `
    <div class="kpi-card blue"><div class="kpi-header"><div class="kpi-label">Hoy</div><div class="kpi-icon">📅</div></div><div class="kpi-value">${hoy}</div><div class="kpi-footer">Viajes del día</div></div>
    <div class="kpi-card purple"><div class="kpi-header"><div class="kpi-label">Semana</div><div class="kpi-icon">📊</div></div><div class="kpi-value">${semana}</div><div class="kpi-footer">Viajes total de la semana</div></div>
    <div class="kpi-card teal"><div class="kpi-header"><div class="kpi-label">Mes</div><div class="kpi-icon">🗓</div></div><div class="kpi-value">${mes}</div><div class="kpi-footer">Viajes del mes</div></div>
    <div class="kpi-card green"><div class="kpi-header"><div class="kpi-label">Completados</div><div class="kpi-icon">✅</div></div><div class="kpi-value">${completados}</div><div class="kpi-footer">Total de Viajes completados</div></div>
    <div class="kpi-card amber"><div class="kpi-header"><div class="kpi-label">En Curso</div><div class="kpi-icon">🔄</div></div><div class="kpi-value">${enCurso}</div><div class="kpi-footer">En progreso</div></div>
    <div class="kpi-card red"><div class="kpi-header"><div class="kpi-label">Pago Mes</div><div class="kpi-icon">💰</div></div><div class="kpi-value" style="font-size:1.2rem">${formatMoney(totalPago)}</div><div class="kpi-footer">Monto este mes</div></div>
  `;
}

// ============================================================
// FILTROS
// ============================================================
const doFilter = debounce(() => {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const estado = document.getElementById('filterEstado').value;
  const fi = document.getElementById('filterFechaInicio').value;
  const ff = document.getElementById('filterFechaFin').value;

  filteredViajes = allViajes.filter(v => {
    const matchQ = !q || (
      (v.origen || '').toLowerCase().includes(q) ||
      (v.destino || '').toLowerCase().includes(q) ||
      (v.placa_resguardo || '').toLowerCase().includes(q) ||
      (v.placa_trailer || '').toLowerCase().includes(q) ||
      (v.conductor_resguardo || '').toLowerCase().includes(q)
    );
    const matchEstado = !estado || v.estado === estado;
    const matchFi = !fi || v.fecha >= fi;
    const matchFf = !ff || v.fecha <= ff;
    return matchQ && matchEstado && matchFi && matchFf;
  });

  currentPage = 1;
  renderTable();
}, 250);

document.getElementById('searchInput').addEventListener('input', doFilter);
document.getElementById('filterEstado').addEventListener('change', doFilter);
document.getElementById('filterFechaInicio').addEventListener('change', doFilter);
document.getElementById('filterFechaFin').addEventListener('change', doFilter);

// ============================================================
// RENDER TABLA
// ============================================================
function renderTable() {
  const total = filteredViajes.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);

  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filteredViajes.slice(start, start + PAGE_SIZE);

  const estadoBadge = { programado: 'badge-info', en_curso: 'badge-warning', completado: 'badge-success', cancelado: 'badge-danger' };
  const estadoLabel = { programado: 'Programado', en_curso: 'En Curso', completado: 'Completado', cancelado: 'Cancelado' };
  const canEdit = Session.isSupervisor();

  if (page.length === 0) {
    document.getElementById('tablaViajes').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🚛</div>
        <div class="empty-title">Sin viajes registrados</div>
        <div class="empty-desc">No se encontraron viajes con los filtros seleccionados</div>
      </div>`;
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  document.getElementById('tablaViajes').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Horario</th>
          <th>Ruta</th>
          <th>Vehículos</th>
          <th>Horas</th>
          <th>Pago</th>
          <th>Estado</th>
          <th style="text-align:right">Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${page.map(v => `
          <tr>
            <td><strong>${formatDate(v.fecha)}</strong></td>
            <td style="white-space:nowrap">
              ${v.hora_salida || '-'}<br>
              <span style="font-size:.75rem;color:var(--text-muted)">${v.hora_llegada ? '→ ' + v.hora_llegada : ''}</span>
            </td>
            <td>
              <div style="font-weight:600">${escapeHtml(v.origen)}</div>
              <div style="font-size:.75rem;color:var(--text-muted)">→ ${escapeHtml(v.destino)}</div>
            </td>
            <td>
              <span class="badge badge-primary">${escapeHtml(v.placa_resguardo || '-')}</span>
              ${v.placa_trailer ? `<br><span class="badge badge-secondary" style="margin-top:3px">${escapeHtml(v.placa_trailer)}</span>` : ''}
            </td>
            <td>${formatHours(v.horas_trabajadas)}</td>
            <td><strong style="color:var(--success)">${formatMoney(v.pago_por_viaje)}</strong></td>
            <td><span class="badge ${estadoBadge[v.estado] || 'badge-secondary'}">${estadoLabel[v.estado] || v.estado}</span></td>
            <td>
              <div class="table-actions">
                <button class="btn btn-secondary btn-sm" onclick="viewDetalleViaje('${v.id}')" title="Ver detalle">👁</button>
                ${canEdit ? `
                  <button class="btn btn-primary btn-sm" onclick="editViaje('${v.id}')" title="Editar">✎</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteViaje('${v.id}', '${escapeHtml(v.origen)} → ${escapeHtml(v.destino)}')" title="Eliminar">🗑</button>
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
    <div class="pagination-info">Mostrando ${start}-${end} de ${total} viajes</div>
    <div class="pagination-controls">
      <button class="page-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>
      ${pages}
      <button class="page-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>›</button>
    </div>`;
}

function goToPage(page) {
  const totalPages = Math.ceil(filteredViajes.length / PAGE_SIZE);
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderTable();
}

// ============================================================
// MODAL VIAJE
// ============================================================
function openModalViaje(data = null) {
  // 1. Abortar sesión anterior — elimina TODOS los listeners de la sesión previa
  if (_modalController) {
    _modalController.abort();
    console.log('[JDM] Modal: sesión anterior abortada, listeners eliminados');
  }

  // 2. Nueva sesión limpia
  _modalController = new AbortController();
  const { signal } = _modalController;

  // 3. Resetear personal y buscador
  selectedPersonal = [];
  _resetPersonalTagList();
  initPersonalSearch(signal);

  // 4. Rellenar campos
  document.getElementById('modalViajeTitle').textContent = data ? 'Editar Viaje' : 'Nuevo Viaje';
  document.getElementById('viajeId').value               = data?.id || '';
  document.getElementById('viajeFecha').value            = data?.fecha || getLimaISODate();
  document.getElementById('viajeHoraSalida').value       = data?.hora_salida?.slice(0, 5) || '';
  document.getElementById('viajeHoraLlegada').value      = data?.hora_llegada?.slice(0, 5) || '';
  document.getElementById('viajeOrigen').value           = data?.origen || '';
  document.getElementById('viajeDestino').value          = data?.destino || '';
  document.getElementById('viajePlacaResguardo').value   = data?.placa_resguardo || '';
  document.getElementById('viajePlacaTrailer').value     = data?.placa_trailer || '';
  document.getElementById('viajeConductorResguardo').value = data?.conductor_resguardo || '';
  document.getElementById('viajeConductorTrailer').value = data?.conductor_trailer || '';
  document.getElementById('viajePago').value             = data?.pago_por_viaje || '';
  document.getElementById('viajeEstado').value           = data?.estado || 'programado';
  document.getElementById('viajeObservaciones').value    = data?.observaciones || '';
  document.getElementById('viajeHoras').value            = data?.horas_trabajadas ? formatHours(data.horas_trabajadas) : '';

  // 5. calcHoras con signal — se auto-elimina al abortar
  document.getElementById('viajeHoraSalida').addEventListener('change', calcHoras, { signal });
  document.getElementById('viajeHoraLlegada').addEventListener('change', calcHoras, { signal });

  // 6. Personal asignado (edición)
  if (data?.id) {
    loadPersonalAsignado(data.id);
  }

  document.querySelectorAll('#formViaje .form-input').forEach(el => el.classList.remove('is-invalid'));
  document.getElementById('modalViaje').classList.add('show');
  console.log('[JDM] Modal abierto:', data ? `Editar viaje ${data.id}` : 'Nuevo viaje');
}

async function loadPersonalAsignado(viajeId) {
  const { data } = await db
    .from('viaje_colaboradores')
    .select('colaborador_id, pago, colaboradores(nombre_completo)')
    .eq('viaje_id', viajeId);

  if (!data) return;
  selectedPersonal = data.map(vc => ({
    id: vc.colaborador_id,
    nombre: vc.colaboradores?.nombre_completo || 'Desconocido',
    pago: vc.pago
  }));
  renderPersonalTags();
}

function calcHoras() {
  const salida = document.getElementById('viajeHoraSalida').value;
  const llegada = document.getElementById('viajeHoraLlegada').value;
  if (salida && llegada) {
    let [h1, m1] = salida.split(':').map(Number);
    let [h2, m2] = llegada.split(':').map(Number);
    let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (mins < 0) mins += 24 * 60;
    const horas = mins / 60;
    document.getElementById('viajeHoras').value = formatHours(horas);
  }
}

function closeModalViaje() {
  document.getElementById('modalViaje').classList.remove('show');

  // Abortar todos los listeners de esta sesión del modal
  if (_modalController) {
    _modalController.abort();
    _modalController = null;
    console.log('[JDM] Modal cerrado: listeners eliminados');
  }

  // Limpiar dropdown y buscador
  const dropdown = document.getElementById('personalDropdown');
  if (dropdown) dropdown.style.display = 'none';
  const search = document.getElementById('personalSearch');
  if (search) search.value = '';
}

document.getElementById('modalViaje').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModalViaje();
});

// ---- Utilidades internas del selector de personal ----

// Limpia solo los chips dejando intactos #personalSearch y #personalDropdown
function _resetPersonalTagList() {
  const list = document.getElementById('personalTagList');
  if (!list) return;
  list.querySelectorAll('.tag-chip').forEach(el => el.remove());

  const inp = document.getElementById('personalSearch');
  if (inp) {
    inp.value = '';
    inp.placeholder = 'Buscar y agregar personal...';
  }

  const dropdown = document.getElementById('personalDropdown');
  if (dropdown) dropdown.style.display = 'none';

  const ids = document.getElementById('personalIds');
  if (ids) ids.value = '';
}

// Recibe el signal del AbortController de la sesión actual del modal.
// Cuando closeModalViaje() llama abort(), TODOS los listeners se eliminan
// automáticamente — sin cloneNode, sin flags, sin memory leaks.
function initPersonalSearch(signal) {
  const input    = document.getElementById('personalSearch');
  const dropdown = document.getElementById('personalDropdown');

  if (!input || !dropdown) {
    console.error('[JDM] initPersonalSearch: elemento no encontrado',
      { input: !!input, dropdown: !!dropdown });
    return;
  }

  // Listener: filtrar colaboradores disponibles al escribir
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    const available = colaboradoresList.filter(c =>
      !selectedPersonal.find(s => s.id === c.id) &&
      (q === '' || c.nombre_completo.toLowerCase().includes(q))
    );

    if (available.length === 0 || q === '') {
      dropdown.style.display = 'none';
      return;
    }

    dropdown.innerHTML = available.slice(0, 8).map(c => `
      <div onclick="addPersonal('${c.id}','${escapeHtml(c.nombre_completo)}',${c.pago_por_viaje || 0})"
        style="padding:10px 14px;cursor:pointer;transition:background .15s;font-size:.85rem"
        onmouseover="this.style.background='var(--light-bg)'"
        onmouseout="this.style.background=''">
        <strong>${escapeHtml(c.nombre_completo)}</strong>
        <span style="color:var(--text-muted);font-size:.75rem;margin-left:8px">${formatMoney(c.pago_por_viaje)}</span>
      </div>
    `).join('');
    dropdown.style.display = 'block';
  }, { signal });

  // Listener: cerrar dropdown al perder foco
  input.addEventListener('blur', () => {
    setTimeout(() => { dropdown.style.display = 'none'; }, 200);
  }, { signal });

  // Listener: re-filtrar al ganar foco (muestra resultados previos)
  input.addEventListener('focus', () => {
    input.dispatchEvent(new Event('input'));
  }, { signal });

  console.log('[JDM] Buscador inicializado');
}

function addPersonal(id, nombre, pago) {
  if (selectedPersonal.find(s => s.id === id)) return;
  selectedPersonal.push({ id, nombre, pago: parseFloat(pago) || 0 });
  renderPersonalTags();
  // Buscar el input por ID luego del render (puede haber sido clonado)
  const input = document.getElementById('personalSearch');
  if (input) {
    input.value = '';
    input.focus();
    input.dispatchEvent(new Event('input'));
  }
}

function removePersonal(id) {
  selectedPersonal = selectedPersonal.filter(s => s.id !== id);
  renderPersonalTags();
}

function renderPersonalTags() {
  const list  = document.getElementById('personalTagList');
  const input = document.getElementById('personalSearch');

  if (!list || !input) {
    console.error('[JDM] renderPersonalTags: elementos no encontrados');
    return;
  }

  // Eliminar solo los chips existentes — NO tocar input ni dropdown
  list.querySelectorAll('.tag-chip').forEach(el => el.remove());

  // Insertar chips nuevos ANTES del input
  selectedPersonal.forEach(p => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `${escapeHtml(p.nombre)}
      <button type="button" onclick="removePersonal('${p.id}')">✕</button>`;
    list.insertBefore(chip, input);
  });

  // Actualizar placeholder del input
  input.placeholder = selectedPersonal.length > 0 ? 'Agregar más...' : 'Buscar y agregar personal...';

  // Actualizar campo oculto con IDs
  const ids = document.getElementById('personalIds');
  if (ids) ids.value = selectedPersonal.map(p => p.id).join(',');
}

// ============================================================
// EDITAR
// ============================================================
function editViaje(id) {
  const v = allViajes.find(x => x.id === id);
  if (v) openModalViaje(v);
}

// ============================================================
// GUARDAR
// ============================================================
async function saveViaje() {
  const id = document.getElementById('viajeId').value;
  const fecha = document.getElementById('viajeFecha').value;
  const horaSalida = document.getElementById('viajeHoraSalida').value;
  const horaLlegada = document.getElementById('viajeHoraLlegada').value;
  const origen = document.getElementById('viajeOrigen').value.trim();
  const destino = document.getElementById('viajeDestino').value.trim();
  const pago = parseFloat(document.getElementById('viajePago').value) || 0;

  let valid = true;
  const validate = (elId, cond) => {
    document.getElementById(elId).classList.toggle('is-invalid', !cond);
    if (!cond) valid = false;
  };

  validate('viajeFecha', fecha !== '');
  validate('viajeHoraSalida', horaSalida !== '');
  validate('viajeOrigen', origen.length >= 2);
  validate('viajeDestino', destino.length >= 2);
  validate('viajePago', pago >= 0);

  if (!valid) {
    showNotification('warning', 'Validación', 'Completa todos los campos obligatorios');
    return;
  }

  // Calcular horas
  let horasTrabajadas = null;
  if (horaSalida && horaLlegada) {
    let [h1, m1] = horaSalida.split(':').map(Number);
    let [h2, m2] = horaLlegada.split(':').map(Number);
    let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (mins < 0) mins += 24 * 60;
    horasTrabajadas = parseFloat((mins / 60).toFixed(2));
  }

  const payload = {
    fecha,
    hora_salida: horaSalida,
    hora_llegada: horaLlegada || null,
    origen,
    destino,
    placa_resguardo: document.getElementById('viajePlacaResguardo').value.trim().toUpperCase() || null,
    placa_trailer: document.getElementById('viajePlacaTrailer').value.trim().toUpperCase() || null,
    conductor_resguardo: document.getElementById('viajeConductorResguardo').value.trim() || null,
    conductor_trailer: document.getElementById('viajeConductorTrailer').value.trim() || null,
    pago_por_viaje: pago,
    horas_trabajadas: horasTrabajadas,
    estado: document.getElementById('viajeEstado').value,
    observaciones: document.getElementById('viajeObservaciones').value.trim() || null,
    created_by: Session.get()?.id
  };

  const btn = document.getElementById('btnSaveViaje');
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;border-width:2px;display:inline-block"></div>';

  try {
    let viajeId = id;

    if (id) {
      const { error } = await db.from('viajes').update(payload).eq('id', id);
      if (error) throw error;
      // Actualizar personal
      await db.from('viaje_colaboradores').delete().eq('viaje_id', id);
      await logAudit('editar', 'viajes', `Viaje ${origen} → ${destino} editado`, id, null, payload);
      showNotification('success', 'Actualizado', `Viaje ${origen} → ${destino} actualizado`);
    } else {
      const { data: newViaje, error } = await db.from('viajes').insert(payload).select().single();
      if (error) throw error;
      viajeId = newViaje.id;
      await logAudit('crear', 'viajes', `Viaje ${origen} → ${destino} creado`, viajeId, null, payload);
      showNotification('success', 'Registrado', `Viaje ${origen} → ${destino} registrado`);
    }

    // Guardar personal asignado
    if (selectedPersonal.length > 0 && viajeId) {
      const pagoIndividual = pago / selectedPersonal.length;
      const vcRows = selectedPersonal.map(p => ({
        viaje_id: viajeId,
        colaborador_id: p.id,
        pago: parseFloat(p.pago) > 0 ? p.pago : pagoIndividual
      }));
      await db.from('viaje_colaboradores').insert(vcRows);
    }

    closeModalViaje();
    await loadViajes();
  } catch (err) {
    showNotification('error', 'Error', err.message || 'No se pudo guardar el viaje');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>💾</span> Guardar Viaje';
  }
}

// ============================================================
// ELIMINAR
// ============================================================
function deleteViaje(id, label) {
  confirmDelete(
    'Eliminar Viaje',
    `¿Deseas eliminar el viaje <strong>${escapeHtml(label)}</strong>?<br>Se eliminarán también los registros de personal asignado.`,
    async () => {
      try {
        const { error } = await db.from('viajes').delete().eq('id', id);
        if (error) throw error;
        await logAudit('eliminar', 'viajes', `Viaje ${label} eliminado`, id, null, null);
        showNotification('success', 'Eliminado', `Viaje eliminado correctamente`);
        await loadViajes();
      } catch (err) {
        showNotification('error', 'Error', err.message || 'No se pudo eliminar');
      }
    }
  );
}

// ============================================================
// VER DETALLE
// ============================================================
async function viewDetalleViaje(id) {
  document.getElementById('modalDetalleViaje').classList.add('show');
  document.getElementById('modalDetalleBody').innerHTML = `<div class="empty-state"><div class="empty-icon">⏳</div><p>Cargando...</p></div>`;

  const viaje = allViajes.find(v => v.id === id);
  if (!viaje) return;

  const { data: personal } = await db
    .from('viaje_colaboradores')
    .select('pago, colaboradores(nombre_completo, dni, cargo)')
    .eq('viaje_id', id);

  const estadoBadge = { programado: 'badge-info', en_curso: 'badge-warning', completado: 'badge-success', cancelado: 'badge-danger' };
  const totalPersonal = (personal || []).reduce((s, r) => s + (parseFloat(r.pago) || 0), 0);

  document.getElementById('modalDetalleBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
      <div>
        <div style="font-size:.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Fecha</div>
        <div style="font-weight:700;font-size:1.1rem">${formatDate(viaje.fecha)}</div>
      </div>
      <div>
        <div style="font-size:.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Estado</div>
        <span class="badge ${estadoBadge[viaje.estado] || 'badge-secondary'}" style="font-size:.85rem">${viaje.estado}</span>
      </div>
      <div>
        <div style="font-size:.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Horario</div>
        <div style="font-weight:600">${viaje.hora_salida || '-'} → ${viaje.hora_llegada || '-'}</div>
        <div style="font-size:.75rem;color:var(--text-muted)">${formatHours(viaje.horas_trabajadas)} trabajadas</div>
      </div>
      <div>
        <div style="font-size:.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Pago por Viaje</div>
        <div style="font-weight:800;font-size:1.2rem;color:var(--success)">${formatMoney(viaje.pago_por_viaje)}</div>
      </div>
    </div>

    <div style="background:var(--light-bg);border-radius:var(--radius-md);padding:16px;margin-bottom:20px">
      <div style="font-size:.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px">Ruta</div>
      <div style="display:flex;align-items:center;gap:12px;font-weight:600">
        <span>📍 ${escapeHtml(viaje.origen)}</span>
        <span style="color:var(--primary-blue)">→</span>
        <span>🏁 ${escapeHtml(viaje.destino)}</span>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div style="background:var(--light-bg);border-radius:var(--radius-md);padding:14px">
        <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:4px">VEHÍCULO RESGUARDO</div>
        <div style="font-weight:700">${escapeHtml(viaje.placa_resguardo || 'No registrado')}</div>
        <div style="font-size:.8rem;color:var(--text-secondary)">${escapeHtml(viaje.conductor_resguardo || '-')}</div>
      </div>
      <div style="background:var(--light-bg);border-radius:var(--radius-md);padding:14px">
        <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:4px">TRÁILER</div>
        <div style="font-weight:700">${escapeHtml(viaje.placa_trailer || 'No registrado')}</div>
        <div style="font-size:.8rem;color:var(--text-secondary)">${escapeHtml(viaje.conductor_trailer || '-')}</div>
      </div>
    </div>

    ${personal && personal.length > 0 ? `
      <div style="margin-bottom:20px">
        <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px">Personal Asignado (${personal.length})</div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Colaborador</th><th>DNI</th><th>Cargo</th><th>Pago</th></tr></thead>
            <tbody>
              ${personal.map(p => `
                <tr>
                  <td><strong>${escapeHtml(p.colaboradores?.nombre_completo || '-')}</strong></td>
                  <td>${escapeHtml(p.colaboradores?.dni || '-')}</td>
                  <td>${escapeHtml(p.colaboradores?.cargo || '-')}</td>
                  <td><strong style="color:var(--success)">${formatMoney(p.pago)}</strong></td>
                </tr>
              `).join('')}
              <tr style="background:var(--light-bg)">
                <td colspan="3"><strong>Total pagos al personal</strong></td>
                <td><strong style="color:var(--success)">${formatMoney(totalPersonal)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    ` : '<p style="color:var(--text-muted);font-size:.875rem">Sin personal asignado</p>'}

    ${viaje.observaciones ? `
      <div style="background:var(--warning-bg);border-radius:var(--radius-md);padding:14px">
        <div style="font-size:.75rem;font-weight:700;color:#92400E;margin-bottom:4px">OBSERVACIONES</div>
        <div style="font-size:.875rem;color:#78350F">${escapeHtml(viaje.observaciones)}</div>
      </div>
    ` : ''}
  `;
}

// ============================================================
// EXPORTAR
// ============================================================
async function exportViajes() {
  if (typeof XLSX === 'undefined') {
    showNotification('warning', 'Módulo no disponible', 'Recarga con SheetJS para exportar');
    return;
  }

  const exportData = filteredViajes.map(v => ({
    Fecha: formatDate(v.fecha),
    'Hora Salida': v.hora_salida || '',
    'Hora Llegada': v.hora_llegada || '',
    Origen: v.origen,
    Destino: v.destino,
    'Placa Resguardo': v.placa_resguardo || '',
    'Placa Tráiler': v.placa_trailer || '',
    'Conductor Resguardo': v.conductor_resguardo || '',
    'Conductor Tráiler': v.conductor_trailer || '',
    'Horas Trabajadas': v.horas_trabajadas || 0,
    'Pago x Viaje': v.pago_por_viaje || 0,
    Estado: v.estado,
    Observaciones: v.observaciones || ''
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Viajes');
  XLSX.writeFile(wb, `Viajes_${getLimaISODate()}.xlsx`);

  await logAudit('exportar', 'viajes', `Exportación de ${exportData.length} viajes`, null, null, null);
  showNotification('success', 'Exportado', `${exportData.length} viajes exportados`);
}

// Inicializar
loadViajes();
