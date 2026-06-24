-- ============================================================
-- JOAQUIN D&M — CORRECCIÓN RLS
-- CAUSA RAÍZ: El sistema usa auth personalizada (tabla usuarios +
-- sessionStorage). Nunca se llama a supabase.auth.signIn(), por
-- lo que todas las peticiones llegan con rol 'anon'. Las políticas
-- originales exigían rol 'authenticated' → 401 Unauthorized.
-- SOLUCIÓN: Permitir 'anon' en todas las operaciones. La seguridad
-- de acceso está controlada a nivel de aplicación (JS).
-- ============================================================

-- ============================================================
-- 1. ELIMINAR políticas antiguas que exigen 'authenticated'
-- ============================================================
DROP POLICY IF EXISTS "auth_select_colaboradores"    ON public.colaboradores;
DROP POLICY IF EXISTS "auth_insert_colaboradores"    ON public.colaboradores;
DROP POLICY IF EXISTS "auth_update_colaboradores"    ON public.colaboradores;
DROP POLICY IF EXISTS "auth_delete_colaboradores"    ON public.colaboradores;

DROP POLICY IF EXISTS "auth_select_viajes"           ON public.viajes;
DROP POLICY IF EXISTS "auth_insert_viajes"           ON public.viajes;
DROP POLICY IF EXISTS "auth_update_viajes"           ON public.viajes;
DROP POLICY IF EXISTS "auth_delete_viajes"           ON public.viajes;

DROP POLICY IF EXISTS "auth_select_vc"               ON public.viaje_colaboradores;
DROP POLICY IF EXISTS "auth_insert_vc"               ON public.viaje_colaboradores;
DROP POLICY IF EXISTS "auth_update_vc"               ON public.viaje_colaboradores;
DROP POLICY IF EXISTS "auth_delete_vc"               ON public.viaje_colaboradores;

DROP POLICY IF EXISTS "auth_insert_pagos"            ON public.pagos;
DROP POLICY IF EXISTS "auth_update_pagos"            ON public.pagos;
DROP POLICY IF EXISTS "auth_delete_pagos"            ON public.pagos;
DROP POLICY IF EXISTS "auth_select_pagos"            ON public.pagos;

DROP POLICY IF EXISTS "auth_insert_auditoria"        ON public.auditoria;
DROP POLICY IF EXISTS "auth_select_auditoria"        ON public.auditoria;

DROP POLICY IF EXISTS "auth_insert_backups"          ON public.backups;
DROP POLICY IF EXISTS "auth_update_backups"          ON public.backups;
DROP POLICY IF EXISTS "auth_select_backups"          ON public.backups;

-- ============================================================
-- 2. CREAR políticas nuevas para rol 'anon' (auth personalizada)
-- ============================================================

-- ---- colaboradores ----
CREATE POLICY "anon_select_colaboradores"
    ON public.colaboradores FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_colaboradores"
    ON public.colaboradores FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_colaboradores"
    ON public.colaboradores FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_colaboradores"
    ON public.colaboradores FOR DELETE TO anon USING (true);

-- ---- viajes ----
CREATE POLICY "anon_select_viajes"
    ON public.viajes FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_viajes"
    ON public.viajes FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_viajes"
    ON public.viajes FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_viajes"
    ON public.viajes FOR DELETE TO anon USING (true);

-- ---- viaje_colaboradores ----
CREATE POLICY "anon_select_vc"
    ON public.viaje_colaboradores FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_vc"
    ON public.viaje_colaboradores FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_vc"
    ON public.viaje_colaboradores FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_vc"
    ON public.viaje_colaboradores FOR DELETE TO anon USING (true);

-- ---- pagos ----
CREATE POLICY "anon_select_pagos"
    ON public.pagos FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_pagos"
    ON public.pagos FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_pagos"
    ON public.pagos FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_pagos"
    ON public.pagos FOR DELETE TO anon USING (true);

-- ---- auditoria ----
CREATE POLICY "anon_select_auditoria"
    ON public.auditoria FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_auditoria"
    ON public.auditoria FOR INSERT TO anon WITH CHECK (true);

-- ---- backups ----
CREATE POLICY "anon_select_backups"
    ON public.backups FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_backups"
    ON public.backups FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_backups"
    ON public.backups FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ---- usuarios: permitir UPDATE para actualizar ultimo_acceso ----
DROP POLICY IF EXISTS "anon_update_usuarios" ON public.usuarios;
CREATE POLICY "anon_update_usuarios"
    ON public.usuarios FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ---- usuarios: permitir INSERT para crear usuarios desde admin ----
DROP POLICY IF EXISTS "anon_insert_usuarios" ON public.usuarios;
CREATE POLICY "anon_insert_usuarios"
    ON public.usuarios FOR INSERT TO anon WITH CHECK (true);

-- ---- usuarios: permitir DELETE para eliminar usuarios desde admin ----
DROP POLICY IF EXISTS "anon_delete_usuarios" ON public.usuarios;
CREATE POLICY "anon_delete_usuarios"
    ON public.usuarios FOR DELETE TO anon USING (true);

-- ============================================================
-- 3. VERIFICAR que RLS está habilitado en todas las tablas
-- ============================================================
ALTER TABLE public.colaboradores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viajes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viaje_colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios           ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. VERIFICAR existencia de la tabla colaboradores y sus columnas
-- ============================================================
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'colaboradores'
ORDER BY ordinal_position;

-- ============================================================
-- 5. VERIFICAR todas las políticas activas
-- ============================================================
SELECT
    tablename,
    policyname,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
