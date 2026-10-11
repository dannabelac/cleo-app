-- 43-columnas-interes-produccion.sql
-- PRODUCCIÓN (gpvpvkeqfcgypuoxvjne)
--
-- Los parches 36 y 37 agregaron columnas a clientes en CLEO Pruebas pero nunca
-- se aplicaron en producción. Las funciones cleo_dual_flush / cleo_dual_read
-- (aplicadas con produccion-funciones.sql) ya las referencian, causando el error:
--   column "producto_interes" of relation "clientes" does not exist
--
-- Agrega las 5 columnas faltantes. Idempotente (IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════════════════════

alter table public.clientes
  add column if not exists producto_interes   text,
  add column if not exists precio_interes     text,
  add column if not exists cantidad_interes   text,
  add column if not exists servicio_interes   text,
  add column if not exists items_interes      jsonb;


-- Verificación: debe mostrar las 5 columnas con sus tipos
select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'clientes'
  and column_name in (
    'producto_interes', 'precio_interes', 'cantidad_interes',
    'servicio_interes', 'items_interes'
  )
order by column_name;
