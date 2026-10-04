-- ══════════════════════════════════════════════════════════════════════════════
-- CLEO Pruebas: pconfadsbtwjbjeblxgl.
-- BORRADOR — revisar y aprobar antes de ejecutar.
-- Ejecutar DESPUÉS de 03-schema-relacional.sql.
-- Para revertir: eliminar columnas de catalogo_items y DROP TABLE inventario_movimientos.
--
-- MAPA DE CLAVES localStorage → ESQUEMA
-- ──────────────────────────────────────────────────────────────────────────────
-- cleo_productos_cat[].inventarioActivo  → catalogo_items.inventario_activo
-- cleo_productos_cat[].stock             → catalogo_items.stock
-- cleo_productos_cat[].stockMinimo       → catalogo_items.stock_minimo
-- cleo_productos_cat[].costoConfig       → catalogo_items.costo_config (jsonb)
-- cleo_productos_cat[].movimientos[]     → inventario_movimientos (tabla propia)
--
-- DECISIONES DE DISEÑO
-- ──────────────────────────────────────────────────────────────────────────────
-- · inventario_activo / stock / stock_minimo van en catalogo_items porque la
--   relación es 1:1 con el producto. No hay beneficio en una tabla separada
--   para un negocio unipersonal.
--
-- · costo_config es jsonb en catalogo_items: la config se lee y escribe siempre
--   como unidad; ningún reporte filtra por ingrediente individual. Mismo patrón
--   que items jsonb en cotizaciones/pedidos.
--
-- · inventario_movimientos es tabla propia porque: (a) es 1:many por producto,
--   (b) se filtra por fecha en reportes, (c) crece ilimitado en el tiempo y
--   saturaria el blob JSON. Append-only: solo SELECT e INSERT.
-- ══════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if to_regclass('public.catalogo_items') is null then
    raise exception 'Corre 03-schema-relacional.sql primero.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'catalogo_items'
      and column_name  = 'inventario_activo'
  ) then
    raise exception
      'inventario_activo ya existe en catalogo_items. '
      'Este script ya fue ejecutado o el schema fue modificado manualmente.';
  end if;
end;
$guard$;

begin;

-- ── unique(id, negocio_id) en catalogo_items ─────────────────────────────────
-- Requerido para que inventario_movimientos use FK compuesta (catalogo_item_id,
-- negocio_id) → (id, negocio_id) y así garantizar a nivel de constraint que
-- el movimiento y el producto pertenecen al mismo negocio.
-- Sigue el patrón de clientes, oportunidades, cotizaciones y pedidos.
alter table public.catalogo_items
  add constraint catalogo_items_id_negocio_key unique (id, negocio_id);


-- ── Columnas de inventario y costos ──────────────────────────────────────────
alter table public.catalogo_items
  -- Inventario
  add column inventario_activo  boolean  not null default false,
  add column stock              int,       -- null mientras inventario_activo = false
  add column stock_minimo       int,       -- null = sin alerta de stock mínimo
  -- Costos (jsonb porque siempre se lee/escribe como unidad)
  add column costo_config       jsonb;     -- null = sin configuración de costos

-- Constraint: stock solo puede ser no null cuando inventario está activo.
-- Permite stock = 0 (agotado) pero no stock sin inventario activo.
alter table public.catalogo_items
  add constraint catalogo_items_stock_check
    check (stock is null or inventario_activo = true);


-- ══════════════════════════════════════════════════════════════════════════════
-- INVENTARIO_MOVIMIENTOS
-- Registro append-only de cambios de stock por producto.
--
-- Tipos de movimiento:
--   ajuste_cantidad → cambio manual desde "Cambiar cantidad"
--                     (nota: 'Stock inicial' | 'Entrada manual' | 'Ajuste manual')
--   entrega         → salida por pedido entregado o venta rápida con cliente
--                     (nota: 'Pedido entregado · N a Cliente' |
--                             'Venta rápida · N [en Lugar | a Cliente]')
--   venta_directa   → salida registrada desde "Registrar salidas" en inventario
--                     (nota: 'Salida manual · N [en Lugar]')
-- ══════════════════════════════════════════════════════════════════════════════
create table public.inventario_movimientos (
  id               uuid        primary key default gen_random_uuid(),
  negocio_id       uuid        not null references public.negocios(id) on delete cascade,

  -- FK compuesta: garantiza que el producto pertenece al mismo negocio.
  -- CASCADE: si se borra el producto, se borran sus movimientos.
  catalogo_item_id uuid        not null,
  foreign key (catalogo_item_id, negocio_id)
    references public.catalogo_items (id, negocio_id) on delete cascade
    deferrable initially deferred,

  -- cleo_id: id original generado en el cliente ('mov_' + timestamp + '_' + prodId).
  -- Índice único parcial (solo donde no es null) para deduplicar sin bloquear
  -- filas importadas sin id previo. Mismo patrón que recordatorios.
  cleo_id          text,

  fecha            date        not null,
  tipo             text        not null
                   check (tipo in ('ajuste_cantidad','entrega','venta_directa')),
  nota             text,
  cant_antes       int,        -- null en el primer movimiento (stock inicial)
  cant_despues     int,

  -- Sin updated_at: los movimientos son inmutables (append-only).
  -- Un movimiento equivocado se corrige con uno nuevo compensatorio, nunca editando.
  created_at       timestamptz not null default now()
);

create index idx_inv_mov_item    on public.inventario_movimientos (catalogo_item_id);
create index idx_inv_mov_negocio on public.inventario_movimientos (negocio_id, fecha);

-- Deduplicación: mismo criterio que recordatorios.
create unique index uq_inv_mov_negocio_cleo_id
  on public.inventario_movimientos (negocio_id, cleo_id) where cleo_id is not null;

-- Append-only: authenticated puede leer e insertar, nunca modificar ni borrar.
-- Mismo nivel de protección que historial_contactos.
alter table public.inventario_movimientos enable row level security;
revoke all on table public.inventario_movimientos from anon, authenticated;
grant select, insert on table public.inventario_movimientos to authenticated;

create policy "movimientos del negocio"
  on public.inventario_movimientos for all to authenticated
  using  (negocio_id = public.auth_negocio_id())
  with check (negocio_id = public.auth_negocio_id());


commit;


-- ── Verificación post-ejecución ───────────────────────────────────────────────
-- Columnas nuevas en catalogo_items
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'catalogo_items'
  and column_name  in ('inventario_activo','stock','stock_minimo','costo_config')
order by column_name;

-- Tabla inventario_movimientos
select
  relname                                                    as tabla,
  relrowsecurity                                             as rls,
  (select count(*) from pg_trigger
   where tgrelid = pg_class.oid and not tgisinternal)        as triggers,
  (select count(*) from pg_indexes
   where tablename = pg_class.relname
     and schemaname = 'public')                              as indices
from pg_class
where relname = 'inventario_movimientos'
  and relnamespace = 'public'::regnamespace;

-- Constraint de coherencia stock/inventario_activo
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.catalogo_items'::regclass
  and conname like 'catalogo_items_%';
