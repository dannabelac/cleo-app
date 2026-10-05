-- produccion-columnas-faltantes.sql
-- Columnas requeridas por cleo_dual_flush / cleo_dual_read que no forman parte
-- del schema base (03-schema-relacional.sql) ni de los patches previos (23).
-- Todas usan ADD COLUMN IF NOT EXISTS — idempotentes, seguras de re-ejecutar.
-- Ejecutar en Supabase produccion (gpvpvkeqfcgypuoxvjne) ANTES de la migración.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── clientes ──────────────────────────────────────────────────────────────────
alter table public.clientes
  add column if not exists seguimiento_fecha             date,
  add column if not exists mensaje_seguimiento_postventa text;

-- ── ventas ────────────────────────────────────────────────────────────────────
alter table public.ventas
  add column if not exists tipo_pago         text check (tipo_pago in ('completo','anticipo')),
  add column if not exists entregado         boolean not null default false,
  add column if not exists fecha_entrega     date,
  add column if not exists postv_pago        text check (postv_pago in ('pendiente','resuelto')),
  add column if not exists postv_seguimiento text check (postv_seguimiento in ('pendiente','ok'));

-- ── pedidos ───────────────────────────────────────────────────────────────────
alter table public.pedidos
  add column if not exists postv_pago        text check (postv_pago in ('pendiente','resuelto')),
  add column if not exists postv_seguimiento text check (postv_seguimiento in ('pendiente','ok'));

-- ── cotizaciones ──────────────────────────────────────────────────────────────
alter table public.cotizaciones
  add column if not exists seguimiento_fecha date,
  add column if not exists motivo_perdida    text,
  add column if not exists entregado         boolean not null default false,
  add column if not exists fecha_entrega     date;

-- ── historial_contactos ───────────────────────────────────────────────────────
alter table public.historial_contactos
  add column if not exists fecha_hora timestamptz,
  add column if not exists resultado  text,
  add column if not exists items      jsonb,
  add column if not exists resumen    text;

-- ── Verificación ─────────────────────────────────────────────────────────────
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'clientes'             and column_name in ('seguimiento_fecha','mensaje_seguimiento_postventa'))
    or (table_name = 'ventas'            and column_name in ('tipo_pago','entregado','fecha_entrega','postv_pago','postv_seguimiento'))
    or (table_name = 'pedidos'           and column_name in ('postv_pago','postv_seguimiento'))
    or (table_name = 'cotizaciones'      and column_name in ('seguimiento_fecha','motivo_perdida','entregado','fecha_entrega'))
    or (table_name = 'historial_contactos' and column_name in ('fecha_hora','resultado','items','resumen'))
  )
order by table_name, column_name;
