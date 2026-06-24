-- ============================================================
-- JOAQUIN D&M — MIGRACIÓN: fix_pagos.sql
-- PROBLEMA: upsert con onConflict falla porque no existe
--           UNIQUE (colaborador_id, fecha_inicio, fecha_fin)
-- SOLUCIÓN: agregar la restricción UNIQUE necesaria
-- ============================================================

-- 1. Eliminar el índice regular duplicado (estaba en fecha_inicio,fecha_fin
--    pero sin colaborador_id y sin UNIQUE)
DROP INDEX IF EXISTS public.idx_pagos_fechas;

-- 2. Limpiar registros duplicados ANTES de crear el constraint
--    (si ya ejecutaste inserts de prueba, esto evita el error "duplicate key")
--    Mantiene el registro más reciente por combinación (colaborador, inicio, fin)
DELETE FROM public.pagos p1
WHERE p1.id NOT IN (
    SELECT DISTINCT ON (colaborador_id, fecha_inicio, fecha_fin) id
    FROM public.pagos
    ORDER BY colaborador_id, fecha_inicio, fecha_fin, created_at DESC
);

-- 3. Agregar la restricción UNIQUE que necesita el upsert
ALTER TABLE public.pagos
    ADD CONSTRAINT uq_pagos_colaborador_periodo
    UNIQUE (colaborador_id, fecha_inicio, fecha_fin);

-- 4. Re-crear índice de fechas (ahora es parte del constraint, lo recreamos
--    por claridad en búsquedas sin colaborador_id)
CREATE INDEX IF NOT EXISTS idx_pagos_fechas
    ON public.pagos(fecha_inicio, fecha_fin);

-- 5. Verificar que quedó correcto
SELECT
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'pagos'
  AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
ORDER BY tc.constraint_name, kcu.ordinal_position;
