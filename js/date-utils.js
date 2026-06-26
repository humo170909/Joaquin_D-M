/* ============================================================
   JOAQUIN D&M — Utilidades de Fecha y Hora
   Zona Horaria: America/Lima (UTC-5, sin horario de verano)
   ============================================================

   REGLA DE ORO:
   • Supabase TIMESTAMPTZ almacena en UTC — correcto y no se cambia.
   • Supabase DATE/TIME no tienen timezone — se muestran tal cual.
   • TODA visualización usa timeZone: 'America/Lima'.
   • Para filtros y comparaciones de fecha, usar getLimaISODate().

   FUNCIONES EXPORTADAS (disponibles globalmente):
     getLimaISODate()     → 'YYYY-MM-DD' en Lima
     getLimaISO()         → ISO string UTC (para Supabase TIMESTAMPTZ)
     getFechaHoraLima()   → { fecha, hora, fechaHora, isoString }
     iniciarRelojLima()   → inicia reloj tiempo real Lima
     formatDate()         → 'DD/MM/YYYY'   (reemplaza global en supabase.js)
     formatDateTime()     → 'DD/MM/YYYY HH:mm:ss' en Lima
     formatTimeLima()     → 'HH:mm:ss' en Lima
     getWeekRange()       → { start, end } semana actual Lima
     getMonthRange()      → { start, end } mes actual Lima

   ============================================================ */

const TZ_LIMA = 'America/Lima';

/* ----------------------------------------------------------
   getLimaISODate
   Devuelve la fecha ACTUAL en Lima como 'YYYY-MM-DD'.
   Usar para: comparar contra columnas DATE de Supabase.
   ---------------------------------------------------------- */
function getLimaISODate() {
  // 'en-CA' produce el formato YYYY-MM-DD que necesita Supabase
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ_LIMA });
}

/* ----------------------------------------------------------
   getLimaISO
   Devuelve ISO string UTC — el formato correcto para guardar
   en columnas TIMESTAMPTZ de Supabase.
   ---------------------------------------------------------- */
function getLimaISO() {
  return new Date().toISOString();
}

/* ----------------------------------------------------------
   getFechaHoraLima
   Objeto completo con los componentes de fecha y hora Lima.
   Usar al registrar eventos, pagos, auditoría, etc.
   ---------------------------------------------------------- */
function getFechaHoraLima() {
  const now  = new Date();
  const fecha = now.toLocaleDateString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: TZ_LIMA
  });
  const hora = now.toLocaleTimeString('es-PE', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: TZ_LIMA
  });
  return {
    fecha,                       // '25/06/2026'
    hora,                        // '14:35:48'
    fechaHora: `${fecha} ${hora}`, // '25/06/2026 14:35:48'
    isoString: now.toISOString() // UTC → para Supabase
  };
}

/* ----------------------------------------------------------
   formatDate
   Formatea un campo DATE (YYYY-MM-DD) → 'DD/MM/YYYY'.
   Los campos DATE no tienen timezone; se parsean directamente.
   ---------------------------------------------------------- */
function formatDate(date) {
  if (!date) return '-';
  const str = String(date).substring(0, 10); // 'YYYY-MM-DD'
  const parts = str.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return str;
  const [y, m, d] = parts;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/* ----------------------------------------------------------
   formatDateTime
   Formatea un TIMESTAMPTZ (ISO UTC de Supabase) →
   'DD/MM/YYYY HH:mm:ss' en zona horaria Lima.
   ---------------------------------------------------------- */
function formatDateTime(dt) {
  if (!dt) return '-';
  return new Date(dt).toLocaleString('es-PE', {
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: TZ_LIMA
  });
}

/* ----------------------------------------------------------
   formatTimeLima
   Formatea solo la hora de un timestamp → 'HH:mm:ss' Lima.
   ---------------------------------------------------------- */
function formatTimeLima(dt) {
  if (!dt) return '-';
  return new Date(dt).toLocaleTimeString('es-PE', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: TZ_LIMA
  });
}

/* ----------------------------------------------------------
   getWeekRange
   Devuelve { start, end } de la semana (lunes–domingo) que
   contiene 'date', calculada en hora Lima.
   ---------------------------------------------------------- */
function getWeekRange(date = new Date()) {
  // Obtener fecha Lima del date de referencia
  const limaStr = new Date(date).toLocaleDateString('en-CA', { timeZone: TZ_LIMA });
  const [y, m, d] = limaStr.split('-').map(Number);
  // Operar con fecha local a mediodía para evitar problemas de DST
  const ref = new Date(y, m - 1, d, 12, 0, 0);
  const day = ref.getDay(); // 0 = domingo
  const toMonday = day === 0 ? -6 : 1 - day;

  const pad = n => String(n).padStart(2, '0');
  const fmt = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

  const start = new Date(y, m - 1, d + toMonday,     12, 0, 0);
  const end   = new Date(y, m - 1, d + toMonday + 6, 12, 0, 0);

  return { start: fmt(start), end: fmt(end) };
}

/* ----------------------------------------------------------
   getMonthRange
   Devuelve { start, end } del mes que contiene 'date',
   calculado en hora Lima.
   ---------------------------------------------------------- */
function getMonthRange(date = new Date()) {
  const limaStr = new Date(date).toLocaleDateString('en-CA', { timeZone: TZ_LIMA });
  const [y, m] = limaStr.split('-').map(Number);

  const pad     = n => String(n).padStart(2, '0');
  const lastDay = new Date(y, m, 0).getDate(); // último día del mes

  return {
    start: `${y}-${pad(m)}-01`,
    end:   `${y}-${pad(m)}-${pad(lastDay)}`
  };
}

/* ----------------------------------------------------------
   iniciarRelojLima
   Inicia un reloj en tiempo real que actualiza cada segundo.
   Recibe un objeto con referencias a elementos DOM.
   Devuelve el intervalId para detenerlo si es necesario.

   Uso:
     iniciarRelojLima({
       elFecha: document.getElementById('miRelojFecha'),
       elHora:  document.getElementById('miRelojHora')
     });
   ---------------------------------------------------------- */
function iniciarRelojLima({ elFecha = null, elHora = null } = {}) {
  const tick = () => {
    const now = new Date();

    if (elFecha) {
      const texto = now.toLocaleDateString('es-PE', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        timeZone: TZ_LIMA
      });
      // Capitalizar primera letra
      elFecha.textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
    }

    if (elHora) {
      elHora.textContent = now.toLocaleTimeString('es-PE', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: TZ_LIMA
      });
    }
  };

  tick(); // Ejecutar inmediatamente sin esperar 1 segundo
  return setInterval(tick, 1000);
}
