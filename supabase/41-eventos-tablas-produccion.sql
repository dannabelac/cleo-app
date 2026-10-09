-- ══════════════════════════════════════════════════════════════════════════════
-- 41-eventos-tablas-produccion.sql
-- PRODUCCIÓN (gpvpvkeqfcgypuoxvjne)
--
-- Crea las tablas relacionales de eventos y migra los datos del blob.
-- Equivalente al bloque A+B+E del parche 40 (CLEO Pruebas) pero para producción.
--
-- Orden de ejecución en producción:
--   1. Este script  → crea tablas y migra datos del blob
--   2. produccion-funciones.sql → actualiza cleo_dual_flush y cleo_dual_read
--
-- Prerrequisito: schema dual activo para dannaacubel@gmail.com (parche 34).
-- Idempotente: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── A. TABLAS ─────────────────────────────────────────────────────────────────

create table if not exists public.eventos_inventario (
  id           uuid        primary key default gen_random_uuid(),
  negocio_id   uuid        not null references public.negocios(id) on delete cascade,
  cleo_id      text        not null,
  nombre       text        not null default '',
  fecha        date,
  fecha_fin    date,
  estado       text        not null default 'abierto'
                           check (estado in ('abierto','cerrado')),
  fecha_cierre date,
  pedidos_ids  jsonb       not null default '[]',
  movimientos  jsonb       not null default '[]',
  created_at   timestamptz not null default now(),
  unique (negocio_id, cleo_id)
);

create table if not exists public.eventos_productos (
  id               uuid        primary key default gen_random_uuid(),
  negocio_id       uuid        not null references public.negocios(id) on delete cascade,
  evento_id        uuid        not null references public.eventos_inventario(id) on delete cascade,
  catalogo_id      text        not null,
  nombre           text        not null default '',
  precio           numeric     not null default 0,
  cantidad         int         not null default 0,
  cantidad_vendida int         not null default 0,
  reserva          int,
  created_at       timestamptz not null default now()
);

create table if not exists public.eventos_gastos (
  id             uuid        primary key default gen_random_uuid(),
  negocio_id     uuid        not null references public.negocios(id) on delete cascade,
  evento_id      uuid        not null references public.eventos_inventario(id) on delete cascade,
  cleo_id        text        not null,
  concepto       text        not null default '',
  monto          numeric     not null default 0,
  fecha          date,
  fecha_registro timestamptz,
  created_at     timestamptz not null default now(),
  unique (negocio_id, cleo_id)
);

create index if not exists idx_eventos_negocio
  on public.eventos_inventario (negocio_id, fecha desc);
create index if not exists idx_ev_productos_evento
  on public.eventos_productos (evento_id);
create index if not exists idx_ev_gastos_evento
  on public.eventos_gastos (evento_id);


-- ── B. RLS ────────────────────────────────────────────────────────────────────

alter table public.eventos_inventario enable row level security;
alter table public.eventos_productos   enable row level security;
alter table public.eventos_gastos      enable row level security;

drop policy if exists "crud propio" on public.eventos_inventario;
create policy "crud propio" on public.eventos_inventario
  for all using (
    negocio_id in (select id from public.negocios where user_id = auth.uid())
  );

drop policy if exists "crud propio" on public.eventos_productos;
create policy "crud propio" on public.eventos_productos
  for all using (
    negocio_id in (select id from public.negocios where user_id = auth.uid())
  );

drop policy if exists "crud propio" on public.eventos_gastos;
create policy "crud propio" on public.eventos_gastos
  for all using (
    negocio_id in (select id from public.negocios where user_id = auth.uid())
  );


-- ── C. MIGRACIÓN — extraer eventos del blob (schema_ver = 'dual') ─────────────
-- Solo afecta a usuarios en dual mode (dannaacubel@gmail.com en producción).
-- ON CONFLICT DO NOTHING: seguro de re-ejecutar.

-- Paso 1: eventos principales
insert into public.eventos_inventario (
  negocio_id, cleo_id, nombre, fecha, fecha_fin,
  estado, fecha_cierre, pedidos_ids, movimientos
)
select
  n.id,
  ev ->> 'id',
  coalesce(ev ->> 'nombre', ''),
  nullif(ev ->> 'fecha',      '')::date,
  nullif(ev ->> 'fechaFin',   '')::date,
  coalesce(nullif(ev ->> 'estado', ''), 'abierto'),
  nullif(ev ->> 'fechaCierre','')::date,
  coalesce(ev -> 'pedidosIds',  '[]'),
  coalesce(ev -> 'movimientos', '[]')
from public.user_data ud
join public.negocios n on n.user_id = ud.user_id
cross join jsonb_array_elements(
  coalesce(ud.data -> 'cleo_eventos_inventario', '[]')
) ev
where n.schema_ver = 'dual'
  and (ev ->> 'id') is not null
on conflict (negocio_id, cleo_id) do nothing;

-- Paso 2: productos de los eventos migrados
insert into public.eventos_productos (
  negocio_id, evento_id, catalogo_id,
  nombre, precio, cantidad, cantidad_vendida, reserva
)
select
  n.id,
  ei.id,
  pr ->> 'catalogoId',
  coalesce(pr ->> 'nombre', ''),
  coalesce((pr ->> 'precio')::numeric, 0),
  coalesce((pr ->> 'cantidad')::int, 0),
  coalesce((pr ->> 'cantidadVendida')::int, 0),
  nullif(pr ->> 'reserva', '')::int
from public.user_data ud
join public.negocios n on n.user_id = ud.user_id
cross join jsonb_array_elements(
  coalesce(ud.data -> 'cleo_eventos_inventario', '[]')
) ev
join public.eventos_inventario ei
  on ei.negocio_id = n.id and ei.cleo_id = (ev ->> 'id')
cross join jsonb_array_elements(coalesce(ev -> 'productos', '[]')) pr
where n.schema_ver = 'dual'
  and (pr ->> 'catalogoId') is not null;

-- Paso 3: gastos de los eventos migrados
insert into public.eventos_gastos (
  negocio_id, evento_id, cleo_id,
  concepto, monto, fecha, fecha_registro
)
select
  n.id,
  ei.id,
  g ->> 'id',
  coalesce(g ->> 'concepto', ''),
  coalesce((g ->> 'monto')::numeric, 0),
  nullif(g ->> 'fecha',          '')::date,
  nullif(g ->> 'fechaRegistro',  '')::timestamptz
from public.user_data ud
join public.negocios n on n.user_id = ud.user_id
cross join jsonb_array_elements(
  coalesce(ud.data -> 'cleo_eventos_inventario', '[]')
) ev
join public.eventos_inventario ei
  on ei.negocio_id = n.id and ei.cleo_id = (ev ->> 'id')
cross join jsonb_array_elements(coalesce(ev -> 'gastos', '[]')) g
where n.schema_ver = 'dual'
  and (g ->> 'id') is not null
on conflict (negocio_id, cleo_id) do nothing;


-- ── D. Verificación ───────────────────────────────────────────────────────────
select
  (select count(*) from public.eventos_inventario) as eventos,
  (select count(*) from public.eventos_productos)  as productos_evento,
  (select count(*) from public.eventos_gastos)     as gastos_evento;

-- Resultado esperado: eventos > 0 si ya tenías eventos en el blob.
-- Siguiente paso: ejecutar produccion-funciones.sql para activar
-- cleo_dual_flush y cleo_dual_read con soporte de tablas.
