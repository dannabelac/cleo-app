-- ══════════════════════════════════════════════════════════════════════════════
-- 22-tests-inventario-dual.sql
-- CLEO Pruebas (pconfadsbtwjbjeblxgl) — tests de inventario en dual flush/read
--
-- PRERREQUISITO: 19-inventario-costos.sql y 21-inventario-flush-read.sql
--   ejecutados. dual09@cleo.test existe con schema_ver='dual'.
--
-- Tests:
--   T21a: flush producto con inventario activo + movimiento → flush+read OK
--   T21b: flush movimiento duplicado (mismo cleo_id) → append-only, sin duplicados
--   T21c: flush con inventarioActivo=false → stock=null, movimientos persisten
--   T21d: flush con movimiento sin id → ignorado sin error ni fila nueva
--
-- NOTA: auth.users se lee UNA SOLA VEZ en el guard (como postgres/service_role)
-- y se almacena como configuración de sesión. Los bloques de test usan
-- current_setting() para obtener el uid/neg_id sin necesitar acceso a auth.users.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── Helpers (idempotentes — se re-declaran en cada sesión) ────────────────────

create or replace function pg_temp.as_user(p_uid uuid)
returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$f$;

create or replace function pg_temp.blob_minimo(
  p_tipo_perfil   text  default 'servicios',
  p_oportunidades jsonb default '[]',
  p_clientes      jsonb default '[]',
  p_cots          jsonb default '[]',
  p_pedidos       jsonb default '[]',
  p_ventas        jsonb default '[]',
  p_servicios     jsonb default '[]',
  p_productos_cat jsonb default '[]',
  p_tombstones    jsonb default '[]'
) returns jsonb language sql as $f$
  select jsonb_build_object(
    'cleo_tipo_perfil',   p_tipo_perfil,
    'cleo_perfil',        jsonb_build_object('nombre','TestNegocio','tipoPerfil',p_tipo_perfil),
    'cleo_clientes',      p_clientes,
    'cleo_oportunidades', p_oportunidades,
    'cleo_cots',          p_cots,
    'cleo_pedidos',       p_pedidos,
    'cleo_ventas',        p_ventas,
    'cleo_servicios',     p_servicios,
    'cleo_productos_cat', p_productos_cat,
    'cleo_tombstones',    p_tombstones
  );
$f$;


-- ══════════════════════════════════════════════════════════════════════════════
-- Guard + setup
-- auth.users se consulta AQUÍ (como postgres/service_role) y los resultados
-- se guardan como configuración de sesión (is_local=false) accesibles por
-- cualquier rol mediante current_setting() en los bloques siguientes.
-- ══════════════════════════════════════════════════════════════════════════════

do $guard$
declare
  v_uid    uuid;
  v_neg_id uuid;
  v_sv     text;
begin
  select u.id into v_uid from auth.users u where u.email = 'dual09@cleo.test';
  if v_uid is null then
    raise exception
      'GUARD: dual09@cleo.test no existe en auth.users. Crear el usuario antes de ejecutar.';
  end if;

  select n.id, n.schema_ver into v_neg_id, v_sv
    from public.negocios n where n.user_id = v_uid;
  if v_sv is distinct from 'dual' then
    raise exception
      'GUARD: dual09@cleo.test tiene schema_ver=%. Debe ser ''dual''.', coalesce(v_sv,'NULL');
  end if;

  if not exists (
    select 1 from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname = 'cleo_dual_flush'
       and pg_get_functiondef(oid) like '%inventario_movimientos%'
  ) then
    raise exception
      'GUARD: cleo_dual_flush no tiene código de inventario. Ejecutar 21-inventario-flush-read.sql primero.';
  end if;

  -- Guardar a nivel de sesión (false = no local) para que los DO blocks
  -- posteriores puedan leerlos con current_setting() sin acceder a auth.users.
  perform set_config('cleo.t22_uid',    v_uid::text,    false);
  perform set_config('cleo.t22_neg_id', v_neg_id::text, false);

  raise notice 'GUARD OK: uid=%, neg_id=%, schema_ver=dual.', v_uid, v_neg_id;
end;
$guard$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T21a — flush con inventarioActivo=true, stock, costoConfig y un movimiento
-- ══════════════════════════════════════════════════════════════════════════════

do $t21a$
declare
  v_uid           uuid;
  v_neg_id        uuid;
  v_ts            timestamptz;
  v_res           jsonb;
  v_read          jsonb;
  v_ci_inv_activo boolean;
  v_ci_stock      int;
  v_ci_stock_min  int;
  v_ci_costo      jsonb;
  v_mov_cnt       int;
  v_mov_cleo_id   text;
  v_mov_tipo      text;
  v_mov_cant_d    int;
  v_prod          jsonb;
  v_movs          jsonb;
begin
  raise notice '=== T21a: flush producto con inventario activo + movimiento ===';

  v_uid    := current_setting('cleo.t22_uid')::uuid;
  v_neg_id := current_setting('cleo.t22_neg_id')::uuid;

  -- Activar JWT antes de todo (necesario para RLS en flush, read y limpieza)
  perform pg_temp.as_user(v_uid);

  -- Limpiar datos de prueba de ejecuciones anteriores (RLS activo con JWT)
  delete from public.catalogo_items
   where negocio_id = v_neg_id and modo = 'productos'
     and cleo_id in ('prod_t21_1', 'prod_t21_4');

  -- Leer updated_at actual para el bloqueo optimista
  select ud.updated_at into v_ts from public.user_data ud where ud.user_id = v_uid;

  -- Flush 1: producto con inventario activo, stock=10, stockMinimo=2,
  --          costoConfig con margen, y 1 movimiento inicial
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_tipo_perfil   := 'productos',
      p_productos_cat := '[{
        "id":               "prod_t21_1",
        "nombre":           "Playera Básica",
        "precio":           350,
        "inventarioActivo": true,
        "stock":            10,
        "stockMinimo":      2,
        "costoConfig":      {"margen": 30, "ingredientes": []},
        "movimientos": [{
          "id":          "mov_t21_1",
          "fecha":       "2026-09-30",
          "tipo":        "ajuste_cantidad",
          "nota":        "Stock inicial",
          "cantAntes":   null,
          "cantDespues": 10
        }]
      }]'::jsonb
    ),
    'productos',
    v_ts
  );

  assert (v_res ->> 'estado') = 'ok',
    format('T21a FALLA: flush 1 no fue ok. res=%s', v_res);
  v_ts := (v_res ->> 'updated_at')::timestamptz;

  -- Verificar catalogo_items
  select ci.inventario_activo, ci.stock, ci.stock_minimo, ci.costo_config
    into v_ci_inv_activo, v_ci_stock, v_ci_stock_min, v_ci_costo
    from public.catalogo_items ci
   where ci.negocio_id = v_neg_id and ci.modo = 'productos' and ci.cleo_id = 'prod_t21_1';

  assert found, 'T21a FALLA: prod_t21_1 no insertado en catalogo_items';
  assert v_ci_inv_activo = true,
    format('T21a FALLA: inventario_activo esperado true, got %s', v_ci_inv_activo);
  assert v_ci_stock = 10,
    format('T21a FALLA: stock esperado 10, got %s', v_ci_stock);
  assert v_ci_stock_min = 2,
    format('T21a FALLA: stock_minimo esperado 2, got %s', v_ci_stock_min);
  assert v_ci_costo is not null,
    'T21a FALLA: costo_config es null';
  assert (v_ci_costo ->> 'margen')::int = 30,
    format('T21a FALLA: costo_config.margen esperado 30, got %s', v_ci_costo ->> 'margen');

  -- Verificar inventario_movimientos
  select count(*) into v_mov_cnt
    from public.inventario_movimientos mv
    join public.catalogo_items ci on ci.id = mv.catalogo_item_id
   where ci.negocio_id = v_neg_id and ci.cleo_id = 'prod_t21_1';

  assert v_mov_cnt = 1,
    format('T21a FALLA: movimientos esperados 1, got %s', v_mov_cnt);

  select mv.cleo_id, mv.tipo, mv.cant_despues
    into v_mov_cleo_id, v_mov_tipo, v_mov_cant_d
    from public.inventario_movimientos mv
    join public.catalogo_items ci on ci.id = mv.catalogo_item_id
   where ci.negocio_id = v_neg_id and ci.cleo_id = 'prod_t21_1';

  assert v_mov_cleo_id = 'mov_t21_1',
    format('T21a FALLA: mov.cleo_id esperado mov_t21_1, got %s', v_mov_cleo_id);
  assert v_mov_tipo = 'ajuste_cantidad',
    format('T21a FALLA: mov.tipo esperado ajuste_cantidad, got %s', v_mov_tipo);
  assert v_mov_cant_d = 10,
    format('T21a FALLA: mov.cant_despues esperado 10, got %s', v_mov_cant_d);

  -- Verificar cleo_dual_read devuelve los campos correctos
  v_read := public.cleo_dual_read();
  assert (v_read ->> 'estado') = 'ok',
    format('T21a FALLA: read no fue ok. res=%s', v_read);

  select cat into v_prod
    from jsonb_array_elements(v_read -> 'data' -> 'cleo_productos_cat') cat
   where cat ->> 'id' = 'prod_t21_1';

  assert v_prod is not null,
    'T21a FALLA: prod_t21_1 no aparece en cleo_dual_read';
  assert coalesce((v_prod ->> 'inventarioActivo')::boolean, false) = true,
    format('T21a FALLA: read.inventarioActivo esperado true, got %s',
      v_prod ->> 'inventarioActivo');
  assert (v_prod ->> 'stock')::int = 10,
    format('T21a FALLA: read.stock esperado 10, got %s', v_prod ->> 'stock');
  assert (v_prod ->> 'stockMinimo')::int = 2,
    format('T21a FALLA: read.stockMinimo esperado 2, got %s', v_prod ->> 'stockMinimo');
  assert (v_prod -> 'costoConfig' ->> 'margen')::int = 30,
    format('T21a FALLA: read.costoConfig.margen esperado 30, got %s',
      v_prod -> 'costoConfig' ->> 'margen');

  v_movs := coalesce(v_prod -> 'movimientos', '[]');
  assert jsonb_array_length(v_movs) = 1,
    format('T21a FALLA: read.movimientos esperados 1, got %s', jsonb_array_length(v_movs));
  assert (v_movs -> 0 ->> 'id') = 'mov_t21_1',
    format('T21a FALLA: read.movimientos[0].id esperado mov_t21_1, got %s',
      v_movs -> 0 ->> 'id');
  assert (v_movs -> 0 ->> 'tipo') = 'ajuste_cantidad',
    format('T21a FALLA: read.movimientos[0].tipo esperado ajuste_cantidad, got %s',
      v_movs -> 0 ->> 'tipo');

  raise notice 'T21a OK: flush+read con inventario activo y movimiento verificados. ts=%s', v_ts;
end;
$t21a$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T21b — flush con movimiento duplicado → ON CONFLICT DO NOTHING, sin duplicados
-- ══════════════════════════════════════════════════════════════════════════════

do $t21b$
declare
  v_uid         uuid;
  v_neg_id      uuid;
  v_ts          timestamptz;
  v_res         jsonb;
  v_mov_cnt     int;
  v_stock_nuevo int;
begin
  raise notice '=== T21b: flush con movimiento duplicado (mismo cleo_id) ===';

  v_uid    := current_setting('cleo.t22_uid')::uuid;
  v_neg_id := current_setting('cleo.t22_neg_id')::uuid;

  perform pg_temp.as_user(v_uid);

  select ud.updated_at into v_ts from public.user_data ud where ud.user_id = v_uid;

  -- Flush 2: mismo mov_t21_1 (ya existe) + uno nuevo mov_t21_2, stock actualizado a 15
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_tipo_perfil   := 'productos',
      p_productos_cat := '[{
        "id":               "prod_t21_1",
        "nombre":           "Playera Básica",
        "precio":           350,
        "inventarioActivo": true,
        "stock":            15,
        "stockMinimo":      2,
        "costoConfig":      {"margen": 30, "ingredientes": []},
        "movimientos": [
          {
            "id":          "mov_t21_1",
            "fecha":       "2026-09-30",
            "tipo":        "ajuste_cantidad",
            "nota":        "Stock inicial",
            "cantAntes":   null,
            "cantDespues": 10
          },
          {
            "id":          "mov_t21_2",
            "fecha":       "2026-09-30",
            "tipo":        "ajuste_cantidad",
            "nota":        "Entrada manual",
            "cantAntes":   10,
            "cantDespues": 15
          }
        ]
      }]'::jsonb
    ),
    'productos',
    v_ts
  );

  assert (v_res ->> 'estado') = 'ok',
    format('T21b FALLA: flush 2 no fue ok. res=%s', v_res);

  -- Debe haber exactamente 2 movimientos (mov_t21_1 no se duplicó)
  select count(*) into v_mov_cnt
    from public.inventario_movimientos mv
    join public.catalogo_items ci on ci.id = mv.catalogo_item_id
   where ci.negocio_id = v_neg_id and ci.cleo_id = 'prod_t21_1';

  assert v_mov_cnt = 2,
    format('T21b FALLA: movimientos esperados 2, got %s. '
           'mov_t21_1 puede haberse duplicado.', v_mov_cnt);

  -- stock en catalogo_items debe actualizarse al valor nuevo (UPSERT overwrite)
  select ci.stock into v_stock_nuevo
    from public.catalogo_items ci
   where ci.negocio_id = v_neg_id and ci.modo = 'productos' and ci.cleo_id = 'prod_t21_1';

  assert v_stock_nuevo = 15,
    format('T21b FALLA: stock esperado 15 (actualizado), got %s', v_stock_nuevo);

  raise notice 'T21b OK: movimiento duplicado ignorado (DO NOTHING). stock=15. Movimientos: 2.';
end;
$t21b$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T21c — flush con inventarioActivo=false → stock=null, movimientos persisten
-- ══════════════════════════════════════════════════════════════════════════════

do $t21c$
declare
  v_uid            uuid;
  v_neg_id         uuid;
  v_ts             timestamptz;
  v_res            jsonb;
  v_read           jsonb;
  v_ci_inv_activo  boolean;
  v_ci_stock_null  boolean;
  v_mov_cnt        int;
  v_prod           jsonb;
  v_movs           jsonb;
begin
  raise notice '=== T21c: flush con inventarioActivo=false → stock=null, movimientos persisten ===';

  v_uid    := current_setting('cleo.t22_uid')::uuid;
  v_neg_id := current_setting('cleo.t22_neg_id')::uuid;

  perform pg_temp.as_user(v_uid);

  select ud.updated_at into v_ts from public.user_data ud where ud.user_id = v_uid;

  -- Flush 3: mismo producto, inventarioActivo=false, sin movimientos nuevos
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_tipo_perfil   := 'productos',
      p_productos_cat := '[{
        "id":               "prod_t21_1",
        "nombre":           "Playera Básica",
        "precio":           350,
        "inventarioActivo": false,
        "movimientos":      []
      }]'::jsonb
    ),
    'productos',
    v_ts
  );

  assert (v_res ->> 'estado') = 'ok',
    format('T21c FALLA: flush 3 no fue ok. res=%s', v_res);

  -- catalogo_items: inventario_activo=false, stock DEBE ser NULL
  select ci.inventario_activo,
         ci.stock is null
    into v_ci_inv_activo, v_ci_stock_null
    from public.catalogo_items ci
   where ci.negocio_id = v_neg_id and ci.modo = 'productos' and ci.cleo_id = 'prod_t21_1';

  assert v_ci_inv_activo = false,
    format('T21c FALLA: inventario_activo esperado false, got %s', v_ci_inv_activo);
  assert v_ci_stock_null = true,
    'T21c FALLA: stock debe ser NULL cuando inventarioActivo=false';

  -- inventario_movimientos persisten (append-only; flush no borra historial)
  select count(*) into v_mov_cnt
    from public.inventario_movimientos mv
    join public.catalogo_items ci on ci.id = mv.catalogo_item_id
   where ci.negocio_id = v_neg_id and ci.cleo_id = 'prod_t21_1';

  assert v_mov_cnt = 2,
    format('T21c FALLA: movimientos esperados 2 (persisten aunque inventario=false), got %s',
      v_mov_cnt);

  -- cleo_dual_read: inventarioActivo=false, stock=null, movimientos siguen presentes
  v_read := public.cleo_dual_read();
  assert (v_read ->> 'estado') = 'ok',
    format('T21c FALLA: read no fue ok. res=%s', v_read);

  select cat into v_prod
    from jsonb_array_elements(v_read -> 'data' -> 'cleo_productos_cat') cat
   where cat ->> 'id' = 'prod_t21_1';

  assert v_prod is not null,
    'T21c FALLA: prod_t21_1 no aparece en cleo_dual_read';
  assert coalesce((v_prod ->> 'inventarioActivo')::boolean, false) = false,
    format('T21c FALLA: read.inventarioActivo esperado false, got %s',
      v_prod ->> 'inventarioActivo');
  -- stock puede ser JSON null o ausente del objeto
  assert (v_prod -> 'stock') is null or (v_prod -> 'stock') = 'null'::jsonb,
    format('T21c FALLA: read.stock debe ser null, got %s', v_prod ->> 'stock');

  v_movs := coalesce(v_prod -> 'movimientos', '[]');
  assert jsonb_array_length(v_movs) = 2,
    format('T21c FALLA: read.movimientos esperados 2 (historial persiste), got %s',
      jsonb_array_length(v_movs));

  raise notice 'T21c OK: stock=null tras desactivar inventario; 2 movimientos históricos persisten.';
end;
$t21c$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T21d — flush con movimiento sin id → ignorado sin error ni fila nueva
-- ══════════════════════════════════════════════════════════════════════════════

do $t21d$
declare
  v_uid     uuid;
  v_neg_id  uuid;
  v_ts      timestamptz;
  v_res     jsonb;
  v_mov_cnt int;
begin
  raise notice '=== T21d: flush con movimiento sin id → ignorado sin error ===';

  v_uid    := current_setting('cleo.t22_uid')::uuid;
  v_neg_id := current_setting('cleo.t22_neg_id')::uuid;

  perform pg_temp.as_user(v_uid);

  select ud.updated_at into v_ts from public.user_data ud where ud.user_id = v_uid;

  -- Flush: prod_t21_4 nuevo con un movimiento sin id (debe ignorarse silenciosamente)
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_tipo_perfil   := 'productos',
      p_productos_cat := '[
        {
          "id":               "prod_t21_1",
          "nombre":           "Playera Básica",
          "precio":           350,
          "inventarioActivo": false,
          "movimientos":      []
        },
        {
          "id":               "prod_t21_4",
          "nombre":           "Taza Custom",
          "precio":           180,
          "inventarioActivo": true,
          "stock":            5,
          "stockMinimo":      1,
          "movimientos": [{
            "fecha":       "2026-09-30",
            "tipo":        "ajuste_cantidad",
            "nota":        "Movimiento sin id — debe ignorarse",
            "cantAntes":   null,
            "cantDespues": 5
          }]
        }
      ]'::jsonb
    ),
    'productos',
    v_ts
  );

  -- El flush debe ser ok pese al movimiento sin id
  assert (v_res ->> 'estado') = 'ok',
    format('T21d FALLA: flush no fue ok. res=%s', v_res);

  -- No debe haber ningún movimiento para prod_t21_4
  select count(*) into v_mov_cnt
    from public.inventario_movimientos mv
    join public.catalogo_items ci on ci.id = mv.catalogo_item_id
   where ci.negocio_id = v_neg_id and ci.cleo_id = 'prod_t21_4';

  assert v_mov_cnt = 0,
    format('T21d FALLA: movimientos esperados 0 para prod_t21_4 (sin id), got %s', v_mov_cnt);

  -- El producto sí se insertó con stock=5
  assert exists (
    select 1 from public.catalogo_items ci
     where ci.negocio_id = v_neg_id and ci.cleo_id = 'prod_t21_4'
       and ci.stock = 5 and ci.inventario_activo = true
  ), 'T21d FALLA: prod_t21_4 no insertado correctamente o con stock incorrecto';

  raise notice 'T21d OK: movimiento sin id ignorado; prod_t21_4 insertado con stock=5 sin movimientos.';
end;
$t21d$;


-- ── Limpieza post-tests ───────────────────────────────────────────────────────

do $cleanup$
declare
  v_uid    uuid;
  v_neg_id uuid;
begin
  v_uid    := current_setting('cleo.t22_uid')::uuid;
  v_neg_id := current_setting('cleo.t22_neg_id')::uuid;

  perform pg_temp.as_user(v_uid);

  -- CASCADE borra inventario_movimientos al eliminar los catalogo_items
  delete from public.catalogo_items
   where negocio_id = v_neg_id and modo = 'productos'
     and cleo_id in ('prod_t21_1', 'prod_t21_4');

  raise notice 'Limpieza OK: prod_t21_1 y prod_t21_4 eliminados (movimientos por cascade).';
end;
$cleanup$;


-- ── Resumen ───────────────────────────────────────────────────────────────────

select
  'T21a' as test, 'flush+read inventario activo + movimiento'            as descripcion
union all select 'T21b', 'movimiento duplicado: ON CONFLICT DO NOTHING'
union all select 'T21c', 'inventarioActivo=false: stock=null, historial persiste'
union all select 'T21d', 'movimiento sin id: ignorado sin error'
order by test;
