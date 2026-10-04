-- ══════════════════════════════════════════════════════════════════════════════
-- 23-schema-patches.sql
-- Columnas nuevas aprobadas el 2026-09-30 antes de la copia inicial.
-- Ejecutar ANTES de 23-copia-inicial.sql.
-- Solo aplica en CLEO Pruebas. No tocar producción.
-- ══════════════════════════════════════════════════════════════════════════════

-- Decisiones aprobadas:
--   clientes.notas_prospecto   : preservar notasProspecto sin mezclar con notas.
--   clientes.origen_otro       : preservar origenOtro separado de origen.
--   pedidos.fecha_hora_entrega : timestamptz; conservar precisión junto a fecha_entrega.
--   pedidos.fecha_hora_cancelacion : timestamptz; conservar precisión junto a fecha_cancelacion.
--   cotizaciones.cantidad      : suma de unidades (sum items[].cantidad), no conteo de líneas.

do $guard$
begin
  if to_regclass('public.clientes') is null then
    raise exception 'La tabla clientes no existe. Corre 03-schema-relacional.sql primero.';
  end if;
end;
$guard$;

begin;

-- ── clientes ──────────────────────────────────────────────────────────────────
alter table public.clientes
  add column if not exists notas_prospecto text,
  add column if not exists origen_otro     text;

comment on column public.clientes.notas_prospecto is
  'Notas internas sobre la etapa de prospecto. Origen: blob.notasProspecto. '
  'Distinto de notas (notas generales del cliente).';

comment on column public.clientes.origen_otro is
  'Texto libre cuando origen = ''Otro''. Origen: blob.origenOtro. '
  'No sustituye a origen; se conserva por separado.';

-- ── pedidos ───────────────────────────────────────────────────────────────────
alter table public.pedidos
  add column if not exists fecha_hora_entrega      timestamptz,
  add column if not exists fecha_hora_cancelacion  timestamptz;

comment on column public.pedidos.fecha_hora_entrega is
  'Precisión de hora de entrega. Origen: blob.fechaHoraEntrega. '
  'Coexiste con fecha_entrega (date); no la reemplaza.';

comment on column public.pedidos.fecha_hora_cancelacion is
  'Precisión de hora de cancelación. Origen: blob.fechaHoraCancelacion. '
  'Coexiste con fecha_cancelacion (date); no la reemplaza.';

-- ── cotizaciones ──────────────────────────────────────────────────────────────
alter table public.cotizaciones
  add column if not exists cantidad int;

comment on column public.cotizaciones.cantidad is
  'Suma de unidades vendidas: sum(items[].cantidad). '
  'Distinto de items.length (conteo de líneas). Origen: blob.cantidad.';

-- ── recordatorios.categoria — agregar 'sin_clasificar' al CHECK ──────────────
-- Necesario para los 21 recordatorios legacy (seguimientoFecha) cuya categoría
-- no puede determinarse sin evidencia explícita del usuario.
-- El constraint original: check (categoria in ('pipeline','postventa','reactivacion','manual'))
alter table public.recordatorios
  drop constraint if exists recordatorios_categoria_check;

alter table public.recordatorios
  add constraint recordatorios_categoria_check
    check (categoria in ('pipeline','postventa','reactivacion','manual','sin_clasificar'));

commit;


-- ── Verificación post-ejecución ───────────────────────────────────────────────
select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'clientes'        and column_name in ('notas_prospecto','origen_otro'))
    or (table_name = 'pedidos'      and column_name in ('fecha_hora_entrega','fecha_hora_cancelacion'))
    or (table_name = 'cotizaciones' and column_name = 'cantidad')
  )
order by table_name, column_name;

-- Confirmar que el constraint de categoría incluye sin_clasificar
select conname, pg_get_constraintdef(oid) as constraint_def
from pg_constraint
where conrelid = 'public.recordatorios'::regclass
  and conname = 'recordatorios_categoria_check';
