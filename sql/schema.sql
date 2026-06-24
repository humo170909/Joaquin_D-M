-- ============================================================
-- SISTEMA JOAQUIN D&M - EMPRESA DE SEGURIDAD Y RESGUARDO
-- ESQUEMA COMPLETO SUPABASE - PRODUCCIÓN
-- ============================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLA: usuarios
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nombre_completo VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    rol VARCHAR(20) NOT NULL DEFAULT 'consulta'
        CHECK (rol IN ('administrador', 'supervisor', 'consulta')),
    activo BOOLEAN DEFAULT true,
    ultimo_acceso TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_username ON public.usuarios(username);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON public.usuarios(rol);

-- ============================================================
-- TABLA: colaboradores
-- ============================================================
CREATE TABLE IF NOT EXISTS public.colaboradores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    dni VARCHAR(20) UNIQUE NOT NULL,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    nombre_completo VARCHAR(200) GENERATED ALWAYS AS (nombres || ' ' || apellidos) STORED,
    telefono VARCHAR(20),
    cargo VARCHAR(100),
    direccion TEXT,
    estado VARCHAR(20) DEFAULT 'activo'
        CHECK (estado IN ('activo', 'inactivo', 'suspendido')),
    fecha_ingreso DATE NOT NULL,
    pago_por_viaje DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_colaboradores_dni ON public.colaboradores(dni);
CREATE INDEX IF NOT EXISTS idx_colaboradores_estado ON public.colaboradores(estado);
CREATE INDEX IF NOT EXISTS idx_colaboradores_nombres ON public.colaboradores(nombres, apellidos);

-- ============================================================
-- TABLA: viajes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.viajes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fecha DATE NOT NULL,
    hora_salida TIME NOT NULL,
    hora_llegada TIME,
    origen VARCHAR(200) NOT NULL,
    destino VARCHAR(200) NOT NULL,
    placa_resguardo VARCHAR(20),
    placa_trailer VARCHAR(20),
    conductor_resguardo VARCHAR(100),
    conductor_trailer VARCHAR(100),
    horas_trabajadas DECIMAL(5,2),
    pago_por_viaje DECIMAL(10,2) DEFAULT 0.00,
    observaciones TEXT,
    estado VARCHAR(20) DEFAULT 'programado'
        CHECK (estado IN ('programado', 'en_curso', 'completado', 'cancelado')),
    created_by UUID REFERENCES public.usuarios(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_viajes_fecha ON public.viajes(fecha);
CREATE INDEX IF NOT EXISTS idx_viajes_estado ON public.viajes(estado);
CREATE INDEX IF NOT EXISTS idx_viajes_created_by ON public.viajes(created_by);

-- ============================================================
-- TABLA: viaje_colaboradores (relación N:N)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.viaje_colaboradores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    viaje_id UUID NOT NULL REFERENCES public.viajes(id) ON DELETE CASCADE,
    colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
    pago DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(viaje_id, colaborador_id)
);

CREATE INDEX IF NOT EXISTS idx_vc_viaje ON public.viaje_colaboradores(viaje_id);
CREATE INDEX IF NOT EXISTS idx_vc_colaborador ON public.viaje_colaboradores(colaborador_id);

-- ============================================================
-- TABLA: pagos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pagos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id),
    periodo VARCHAR(20) NOT NULL
        CHECK (periodo IN ('semanal', 'mensual')),
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    total_viajes INT DEFAULT 0,
    total_horas DECIMAL(8,2) DEFAULT 0.00,
    total_monto DECIMAL(10,2) DEFAULT 0.00,
    estado VARCHAR(20) DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'pagado', 'cancelado')),
    fecha_pago TIMESTAMPTZ,
    notas TEXT,
    created_by UUID REFERENCES public.usuarios(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- UNIQUE necesario para que upsert(onConflict) funcione
    CONSTRAINT uq_pagos_colaborador_periodo
        UNIQUE (colaborador_id, fecha_inicio, fecha_fin)
);

CREATE INDEX IF NOT EXISTS idx_pagos_colaborador ON public.pagos(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_pagos_periodo     ON public.pagos(periodo);
CREATE INDEX IF NOT EXISTS idx_pagos_fechas      ON public.pagos(fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_pagos_estado      ON public.pagos(estado);

-- ============================================================
-- TABLA: auditoria
-- ============================================================
CREATE TABLE IF NOT EXISTS public.auditoria (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    usuario_id UUID REFERENCES public.usuarios(id),
    username VARCHAR(50),
    accion VARCHAR(50) NOT NULL
        CHECK (accion IN ('crear', 'editar', 'eliminar', 'iniciar_sesion', 'cerrar_sesion', 'exportar', 'backup')),
    modulo VARCHAR(50),
    descripcion TEXT,
    registro_id UUID,
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    ip_address TEXT,
    navegador TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON public.auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_accion ON public.auditoria(accion);
CREATE INDEX IF NOT EXISTS idx_auditoria_modulo ON public.auditoria(modulo);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON public.auditoria(created_at);

-- ============================================================
-- TABLA: login_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.login_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    fecha_hora TIMESTAMPTZ DEFAULT NOW(),
    ip_address TEXT,
    navegador TEXT,
    estado VARCHAR(20) NOT NULL
        CHECK (estado IN ('exitoso', 'fallido', 'bloqueado')),
    motivo TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_logs_username ON public.login_logs(username);
CREATE INDEX IF NOT EXISTS idx_login_logs_fecha ON public.login_logs(fecha_hora);
CREATE INDEX IF NOT EXISTS idx_login_logs_estado ON public.login_logs(estado);

-- ============================================================
-- TABLA: backups
-- ============================================================
CREATE TABLE IF NOT EXISTS public.backups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fecha TIMESTAMPTZ DEFAULT NOW(),
    nombre_archivo VARCHAR(255) NOT NULL,
    tipo VARCHAR(20) NOT NULL
        CHECK (tipo IN ('excel', 'pdf', 'automatico', 'manual')),
    usuario_id UUID REFERENCES public.usuarios(id),
    usuario_nombre VARCHAR(100),
    periodo_descripcion VARCHAR(100),
    modulo VARCHAR(50),
    tamanio_kb DECIMAL(10,2),
    estado VARCHAR(20) DEFAULT 'completado'
        CHECK (estado IN ('completado', 'fallido', 'en_proceso'))
);

CREATE INDEX IF NOT EXISTS idx_backups_fecha ON public.backups(fecha);
CREATE INDEX IF NOT EXISTS idx_backups_tipo ON public.backups(tipo);

-- ============================================================
-- FUNCIÓN: actualizar updated_at automáticamente
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER trigger_usuarios_updated_at
    BEFORE UPDATE ON public.usuarios
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_colaboradores_updated_at
    BEFORE UPDATE ON public.colaboradores
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_viajes_updated_at
    BEFORE UPDATE ON public.viajes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_pagos_updated_at
    BEFORE UPDATE ON public.pagos
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- FUNCIÓN: calcular horas trabajadas automáticamente
-- ============================================================
CREATE OR REPLACE FUNCTION public.calcular_horas_trabajadas()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.hora_salida IS NOT NULL AND NEW.hora_llegada IS NOT NULL THEN
        NEW.horas_trabajadas = EXTRACT(EPOCH FROM (NEW.hora_llegada::INTERVAL - NEW.hora_salida::INTERVAL)) / 3600.0;
        IF NEW.horas_trabajadas < 0 THEN
            NEW.horas_trabajadas = NEW.horas_trabajadas + 24;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_viajes_horas
    BEFORE INSERT OR UPDATE ON public.viajes
    FOR EACH ROW EXECUTE FUNCTION public.calcular_horas_trabajadas();

-- ============================================================
-- FUNCIÓN: obtener resumen de pagos por colaborador
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_resumen_pagos(
    p_colaborador_id UUID,
    p_fecha_inicio DATE,
    p_fecha_fin DATE
)
RETURNS TABLE (
    total_viajes BIGINT,
    total_horas NUMERIC,
    total_monto NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT vc.viaje_id)::BIGINT AS total_viajes,
        COALESCE(SUM(v.horas_trabajadas), 0) AS total_horas,
        COALESCE(SUM(vc.pago), 0) AS total_monto
    FROM public.viaje_colaboradores vc
    JOIN public.viajes v ON v.id = vc.viaje_id
    WHERE vc.colaborador_id = p_colaborador_id
      AND v.fecha BETWEEN p_fecha_inicio AND p_fecha_fin
      AND v.estado = 'completado';
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCIÓN: estadísticas del dashboard
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
    hoy DATE := CURRENT_DATE;
    inicio_semana DATE := DATE_TRUNC('week', CURRENT_DATE)::DATE;
    inicio_mes DATE := DATE_TRUNC('month', CURRENT_DATE)::DATE;
BEGIN
    SELECT json_build_object(
        'viajes_hoy', (SELECT COUNT(*) FROM public.viajes WHERE fecha = hoy AND estado != 'cancelado'),
        'viajes_semana', (SELECT COUNT(*) FROM public.viajes WHERE fecha >= inicio_semana AND estado != 'cancelado'),
        'viajes_mes', (SELECT COUNT(*) FROM public.viajes WHERE fecha >= inicio_mes AND estado != 'cancelado'),
        'colaboradores_activos', (SELECT COUNT(*) FROM public.colaboradores WHERE estado = 'activo'),
        'pago_semanal', (SELECT COALESCE(SUM(pago), 0) FROM public.viaje_colaboradores vc
                         JOIN public.viajes v ON v.id = vc.viaje_id
                         WHERE v.fecha >= inicio_semana AND v.estado = 'completado'),
        'pago_mensual', (SELECT COALESCE(SUM(pago), 0) FROM public.viaje_colaboradores vc
                         JOIN public.viajes v ON v.id = vc.viaje_id
                         WHERE v.fecha >= inicio_mes AND v.estado = 'completado')
    ) INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viaje_colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

-- Política: service_role tiene acceso total (para operaciones del servidor)
CREATE POLICY "service_role_all_usuarios" ON public.usuarios FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_colaboradores" ON public.colaboradores FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_viajes" ON public.viajes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_vc" ON public.viaje_colaboradores FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pagos" ON public.pagos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_auditoria" ON public.auditoria FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_login_logs" ON public.login_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_backups" ON public.backups FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Política: anon puede leer/escribir login_logs (para registro de intentos)
CREATE POLICY "anon_insert_login_logs" ON public.login_logs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select_login_logs" ON public.login_logs FOR SELECT TO anon USING (true);

-- Política: anon puede leer usuarios para autenticación
CREATE POLICY "anon_select_usuarios" ON public.usuarios FOR SELECT TO anon USING (true);

-- ============================================================
-- NOTA ARQUITECTURA: Este sistema usa autenticación personalizada
-- (tabla usuarios + sessionStorage). NO usa supabase.auth.signIn().
-- Todas las peticiones usan el rol 'anon'. La seguridad de acceso
-- se controla a nivel de aplicación (JavaScript).
-- POR ESO: las políticas son para 'anon', NO para 'authenticated'.
-- ============================================================

-- ---- colaboradores ----
CREATE POLICY "anon_select_colaboradores" ON public.colaboradores FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_colaboradores" ON public.colaboradores FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_colaboradores" ON public.colaboradores FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_colaboradores" ON public.colaboradores FOR DELETE TO anon USING (true);

-- ---- viajes ----
CREATE POLICY "anon_select_viajes" ON public.viajes FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_viajes" ON public.viajes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_viajes" ON public.viajes FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_viajes" ON public.viajes FOR DELETE TO anon USING (true);

-- ---- viaje_colaboradores ----
CREATE POLICY "anon_select_vc" ON public.viaje_colaboradores FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_vc" ON public.viaje_colaboradores FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_vc" ON public.viaje_colaboradores FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_vc" ON public.viaje_colaboradores FOR DELETE TO anon USING (true);

-- ---- pagos ----
CREATE POLICY "anon_select_pagos" ON public.pagos FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_pagos" ON public.pagos FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_pagos" ON public.pagos FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_pagos" ON public.pagos FOR DELETE TO anon USING (true);

-- ---- auditoria ----
CREATE POLICY "anon_select_auditoria" ON public.auditoria FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_auditoria" ON public.auditoria FOR INSERT TO anon WITH CHECK (true);

-- ---- backups ----
CREATE POLICY "anon_select_backups" ON public.backups FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_backups" ON public.backups FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_backups" ON public.backups FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ---- usuarios: operaciones completas para el módulo admin ----
CREATE POLICY "anon_update_usuarios" ON public.usuarios FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_insert_usuarios" ON public.usuarios FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_delete_usuarios" ON public.usuarios FOR DELETE TO anon USING (true);

-- ============================================================
-- DATOS INICIALES: Usuario Administrador
-- Password: Admin@123 (hash bcrypt - cámbiala en producción)
-- ============================================================
INSERT INTO public.usuarios (username, password_hash, nombre_completo, email, rol, activo)
VALUES (
    'admin',
    crypt('Admin@123', gen_salt('bf', 12)),
    'Administrador del Sistema',
    'admin@joaquindm.com',
    'administrador',
    true
) ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- VISTA: viajes con colaboradores
-- ============================================================
CREATE OR REPLACE VIEW public.v_viajes_completos AS
SELECT
    v.*,
    u.username AS creado_por_usuario,
    u.nombre_completo AS creado_por_nombre,
    COALESCE(
        json_agg(
            json_build_object(
                'id', c.id,
                'nombre', c.nombre_completo,
                'dni', c.dni,
                'pago', vc.pago
            )
        ) FILTER (WHERE c.id IS NOT NULL),
        '[]'::json
    ) AS colaboradores_asignados,
    COUNT(vc.colaborador_id) AS total_personal,
    COALESCE(SUM(vc.pago), 0) AS total_pagos
FROM public.viajes v
LEFT JOIN public.usuarios u ON u.id = v.created_by
LEFT JOIN public.viaje_colaboradores vc ON vc.viaje_id = v.id
LEFT JOIN public.colaboradores c ON c.id = vc.colaborador_id
GROUP BY v.id, u.username, u.nombre_completo;

-- ============================================================
-- VISTA: resumen de pagos por colaborador
-- ============================================================
CREATE OR REPLACE VIEW public.v_resumen_colaboradores AS
SELECT
    c.id,
    c.dni,
    c.nombre_completo,
    c.cargo,
    c.estado,
    c.pago_por_viaje,
    COUNT(DISTINCT vc.viaje_id) AS total_viajes_historico,
    COALESCE(SUM(vc.pago), 0) AS total_ganado_historico
FROM public.colaboradores c
LEFT JOIN public.viaje_colaboradores vc ON vc.colaborador_id = c.id
LEFT JOIN public.viajes v ON v.id = vc.viaje_id AND v.estado = 'completado'
GROUP BY c.id, c.dni, c.nombre_completo, c.cargo, c.estado, c.pago_por_viaje;

-- ============================================================
-- FUNCIÓN: verificar contraseña (bcrypt)
-- Llamada desde el frontend para autenticación segura
-- ============================================================
CREATE OR REPLACE FUNCTION public.verify_password(
    p_username TEXT,
    p_password TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_hash TEXT;
BEGIN
    SELECT password_hash INTO v_hash
    FROM public.usuarios
    WHERE username = p_username AND activo = true;

    IF v_hash IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN (crypt(p_password, v_hash) = v_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revocar acceso público a la función de verificación
REVOKE ALL ON FUNCTION public.verify_password FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_password TO anon, authenticated;

-- ============================================================
-- FUNCIÓN: actualizar contraseña con hash bcrypt
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_user_password(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.usuarios
    SET password_hash = crypt(p_new_password, gen_salt('bf', 12)),
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.update_user_password FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_user_password TO authenticated;

-- ============================================================
-- FUNCIÓN: crear usuario con contraseña hasheada
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_user_secure(
    p_username TEXT,
    p_password TEXT,
    p_nombre TEXT,
    p_email TEXT,
    p_rol TEXT
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.usuarios (username, password_hash, nombre_completo, email, rol)
    VALUES (p_username, crypt(p_password, gen_salt('bf', 12)), p_nombre, p_email, p_rol)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.create_user_secure FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_user_secure TO authenticated;

-- ============================================================
-- DATOS DE EJEMPLO (Opcional - remover en producción)
-- ============================================================
-- Insertar usuario supervisor de prueba
INSERT INTO public.usuarios (username, password_hash, nombre_completo, email, rol, activo)
VALUES (
    'supervisor',
    crypt('Super@123', gen_salt('bf', 12)),
    'Supervisor de Campo',
    'supervisor@joaquindm.com',
    'supervisor',
    true
) ON CONFLICT (username) DO NOTHING;

-- Insertar usuario de consulta de prueba
INSERT INTO public.usuarios (username, password_hash, nombre_completo, email, rol, activo)
VALUES (
    'consulta',
    crypt('Consulta@123', gen_salt('bf', 12)),
    'Usuario de Consulta',
    'consulta@joaquindm.com',
    'consulta',
    true
) ON CONFLICT (username) DO NOTHING;
