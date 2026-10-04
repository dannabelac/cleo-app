-- ══════════════════════════════════════════════════════════════════════════════
-- 20-tests-adicionales-dual.sql
-- CLEO Pruebas (pconfadsbtwjbjeblxgl) — pruebas adicionales del modo dual
--
-- PRERREQUISITOS:
--   · 10-dual-flush.sql ejecutado (cleo_dual_flush, cleo_dual_read definidas)
--   · 11-tests-dual-flush.sql ejecutado (negocio dual09 creado y en schema_ver='dual')
--   · dual09@cleo.test existe en auth.users
--   · copia09@cleo.test existe en auth.users (T20 rechazo cross-negocio)
--
-- T16: tipo_perfil='productos' — oportunidad con modo='productos' + pedido vinculado
-- T17: tombstone oportunidad con pedido vinculado → SET NULL en pedido, pedido persiste
-- T18: recordatorio borrado del blob sin tombstone → persiste en DB
-- T19: resolución de conflicto "conservar local" — flush exitoso tras conflicto
-- T20: cleo_reabrir_pedido — transición Entregado → Preparando + rechazo cross-negocio
-- ══════════════════════════════════════════════════════════════════════════════


-- ── Recrear helpers de sesión (idempotente; necesarios si se ejecuta en sesión nueva) ──

create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

create or replace function pg_temp.blob_minimo(
  p_clientes jsonb default '[]',
  p_oportunidades jsonb default '[]',
  p_cots jsonb default '[]',
  p_ventas jsonb default '[]',
  p_pedidos jsonb default '[]',
  p_tombstones jsonb default '[]'
) returns jsonb language sql as $$
  select jsonb_build_object(
    'cleo_tipo_perfil',        'servicios',
    'cleo_perfil',             '{"nombre":"Test"}'::jsonb,
    'cleo_alertas_cerradas',   '[]'::jsonb,
    'cleo_etapas_vistas',      '[]'::jsonb,
    'cleo_streak_accion_serv', 'null'::jsonb,
    'cleo_streak_accion_prod', 'null'::jsonb,
    'cleo_productos',          '[]'::jsonb,
    'cleo_servicios',          '[]'::jsonb,
    'cleo_productos_cat',      '[]'::jsonb,
    'cleo_clientes',           p_clientes,
    'cleo_oportunidades',      p_oportunidades,
    'cleo_cots',               p_cots,
    'cleo_ventas',             p_ventas,
    'cleo_pedidos',            p_pedidos,
    'cleo_tombstones',         p_tombstones
  );
$$;

-- Guard: verificar que el negocio de prueba existe
do $guard20$
declare
  v_uid    uuid;
  v_neg_id uuid;
  v_sv     text;
begin
  select id into v_uid from auth.users where email = 'dual09@cleo.test' limit 1;
  if v_uid is null then
    raise exception '[GUARD20] dual09@cleo.test no encontrado. Ejecuta 11-tests-dual-flush.sql primero.';
  end if;

  select id, schema_ver into v_neg_id, v_sv from public.negocios where user_id = v_uid;
  if v_neg_id is null then
    raise exception '[GUARD20] Negocio de dual09 no encontrado. Ejecuta 11-tests-dual-flush.sql primero.';
  end if;
  if v_sv <> 'dual' then
    raise exception '[GUARD20] Negocio dual09 tiene schema_ver=%. Se espera dual.', v_sv;
  end if;

  raise notice 'GUARD20 OK. negocio=% schema_ver=%.', v_neg_id, v_sv;
end;
$guard20$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T16: tipo_perfil='productos' — oportunidad modo='productos' + pedido vinculado
--
-- QUÉ PRUEBA:
--   · Un negocio con tipo_perfil='productos' puede hacer flush con oportunidades
--     de modo='productos' (etapa='nueva', válida para productos).
--   · El pedido queda vinculado a la oportunidad vía el patrón op_cli_<clienteId>.
--   · cleo_dual_read serializa cleo_tipo_perfil='productos' desde el negocio.
--
-- QUÉ NO PRUEBA:
--   · Concurrencia. La prueba es serial y aislada.
-- ══════════════════════════════════════════════════════════════════════════════
do $t16$
declare
  v_uid       uuid;
  v_neg_id    uuid;
  v_res       jsonb;
  v_ts        timestamptz;
  v_ped_id    uuid;
  v_op_id     uuid;
  v_tp_orig   text;
  v_read      jsonb;
begin
  select id into v_uid    from auth.users    where email = 'dual09@cleo.test' limit 1;
  select id, tipo_perfil into v_neg_id, v_tp_orig
    from public.negocios where user_id = v_uid;
  perform pg_temp.as_user(v_uid);

  -- Limpiar datos previos del test
  delete from public.clientes  where negocio_id = v_neg_id and cleo_id = 't16_cli1';
  delete from public.user_data where user_id = v_uid;

  -- Cambiar temporalmente a tipo_perfil='productos'
  -- (postgres no es 'authenticated'; el trigger no lo bloquea)
  update public.negocios set tipo_perfil = 'productos' where user_id = v_uid;

  -- Flush inicial: cliente + oportunidad modo='productos' + pedido
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes := $j$[{
        "id":"t16_cli1","nombre":"T16 Productos",
        "estadoProspecto":"En seguimiento",
        "recordatorios":[],"historialContactos":[]
      }]$j$::jsonb,
      p_oportunidades := $j$[{
        "id":"op_cli_t16_cli1","clienteId":"t16_cli1",
        "modo":"productos","titulo":"Pedido T16",
        "estatus":"activa","etapa":"en_seguimiento"
      }]$j$::jsonb,
      p_pedidos := $j$[{
        "id":"ped_t16_1","clienteId":"t16_cli1",
        "items":[{"nombre":"Producto A","cantidad":2,"precio":300}],
        "productos":"Producto A","cantidad":2,"total":600,
        "estadoPedido":"preparando",
        "fecha":"2026-09-30","pagos":[]
      }]$j$::jsonb
    ),
    'productos', null
  );
  assert (v_res ->> 'estado') = 'ok', 'T16 flush: ' || v_res::text;

  -- Verificar oportunidad con modo='productos' creada correctamente
  select o.id into v_op_id from public.oportunidades o
   where o.negocio_id = v_neg_id and o.cleo_id = 'op_cli_t16_cli1';
  assert v_op_id is not null, 'T16 FALLA: oportunidad modo=productos no creada';

  declare v_modo text; v_etapa text; begin
    select o.modo, o.etapa into v_modo, v_etapa
      from public.oportunidades o where o.id = v_op_id;
    assert v_modo  = 'productos',      'T16 FALLA: modo incorrecto. modo=' || coalesce(v_modo,'NULL');
    assert v_etapa = 'en_seguimiento', 'T16 FALLA: etapa incorrecta. etapa=' || coalesce(v_etapa,'NULL');
  end;

  -- Verificar pedido creado y vinculado a la oportunidad
  select p.id, p.oportunidad_id into v_ped_id, v_op_id
    from public.pedidos p
   where p.negocio_id = v_neg_id and p.cleo_id = 'ped_t16_1';
  assert v_ped_id is not null, 'T16 FALLA: pedido no creado';
  assert v_op_id  is not null, 'T16 FALLA: pedido sin oportunidad_id (no vinculado a op_cli_t16_cli1)';

  declare v_cantidad int; v_estado text; begin
    select p.cantidad, p.estado_pedido into v_cantidad, v_estado
      from public.pedidos p where p.id = v_ped_id;
    assert v_cantidad = 2,             'T16 FALLA: cantidad incorrecta. cant=' || coalesce(v_cantidad::text,'NULL');
    assert v_estado   = 'preparando',  'T16 FALLA: estado incorrecto. estado=' || coalesce(v_estado,'NULL');
  end;

  -- cleo_dual_read debe serializar cleo_tipo_perfil='productos'
  v_read := public.cleo_dual_read();
  assert (v_read ->> 'estado') = 'ok', 'T16 read: ' || v_read::text;
  assert (v_read -> 'data' ->> 'cleo_tipo_perfil') = 'productos',
    'T16 FALLA: cleo_tipo_perfil no es productos en el read. ' || (v_read -> 'data' ->> 'cleo_tipo_perfil');

  -- Restaurar tipo_perfil original antes de salir exitosamente
  update public.negocios set tipo_perfil = v_tp_orig where user_id = v_uid;
  raise notice 'T16 OK: oportunidad modo=productos creada; pedido vinculado; cleo_dual_read serializa tipo_perfil correctamente.';
exception
  when others then
    -- Restaurar tipo_perfil aunque el test falle
    update public.negocios set tipo_perfil = v_tp_orig where user_id = v_uid;
    raise notice 'T16 ERROR: %', sqlerrm;
    raise;
end;
$t16$;

-- Garantía adicional: restaurar tipo_perfil='servicios' independientemente del resultado de T16
-- (el bloque DO anterior ya lo hace en su path de éxito y en EXCEPTION, pero lo reafirmamos)
do $t16_restore$
declare v_uid uuid;
begin
  select id into v_uid from auth.users where email = 'dual09@cleo.test' limit 1;
  update public.negocios set tipo_perfil = 'servicios' where user_id = v_uid;
  raise notice 'T16_RESTORE: tipo_perfil=servicios restaurado.';
end;
$t16_restore$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T17: tombstone oportunidad con pedido vinculado → SET NULL en pedido
--
-- QUÉ PRUEBA:
--   · Borrar una oportunidad vía tombstone cuando hay un pedido vinculado a ella.
--   · El pedido persiste (ON DELETE SET NULL en pedidos.oportunidad_id).
--   · La cotización vinculada también persiste con oportunidad_id = NULL.
--
-- COMPLEMENTA T08: T08 solo verifica SET NULL en cotizaciones.
-- ══════════════════════════════════════════════════════════════════════════════
do $t17$
declare
  v_uid    uuid;
  v_neg_id uuid;
  v_res    jsonb;
  v_ts     timestamptz;
  v_cnt    int;
  v_op_id_cot  uuid;
  v_op_id_ped  uuid;
begin
  select id into v_uid    from auth.users    where email = 'dual09@cleo.test' limit 1;
  select id into v_neg_id from public.negocios where user_id = v_uid;
  perform pg_temp.as_user(v_uid);

  -- Limpiar
  delete from public.clientes  where negocio_id = v_neg_id and cleo_id = 't17_cli1';
  delete from public.user_data where user_id = v_uid;

  -- Flush inicial: cliente + oportunidad + cotización + pedido (todos vinculados)
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes      := $j$[{
        "id":"t17_cli1","nombre":"T17",
        "recordatorios":[],"historialContactos":[]
      }]$j$::jsonb,
      p_oportunidades := $j$[{
        "id":"op_cli_t17_cli1","clienteId":"t17_cli1",
        "modo":"servicios","titulo":"T17","estatus":"activa","etapa":"cotizacion_enviada"
      }]$j$::jsonb,
      p_cots          := $j$[{
        "id":"cot_t17_1","clienteId":"t17_cli1",
        "items":[],"subtotal":0,"monto":5000,"descuento":"","tipoDescuento":"porcentaje",
        "anticipo":"","vigencia":"","vigenciaDias":"","tipoPago":null,
        "svCondiciones":"","svCondicionesHtml":"","notas":"","etiqueta":"",
        "estatus":"Enviada","fecha":"2026-09-30","pagos":[],
        "vinculadaOportunidadActual":true
      }]$j$::jsonb,
      p_pedidos       := $j$[{
        "id":"ped_t17_1","clienteId":"t17_cli1",
        "items":[],"productos":"Servicio T17","cantidad":1,"total":5000,
        "estadoPedido":"preparando","fecha":"2026-09-30","pagos":[]
      }]$j$::jsonb
    ),
    'servicios', null
  );
  assert (v_res ->> 'estado') = 'ok', 'T17 paso1: ' || v_res::text;

  -- Verificar que cotización y pedido tienen oportunidad_id
  select ct.oportunidad_id into v_op_id_cot from public.cotizaciones ct
   where ct.negocio_id = v_neg_id and ct.cleo_id = 'cot_t17_1';
  assert v_op_id_cot is not null, 'T17: cotización debe tener oportunidad_id antes del tombstone';

  select p.oportunidad_id into v_op_id_ped from public.pedidos p
   where p.negocio_id = v_neg_id and p.cleo_id = 'ped_t17_1';
  assert v_op_id_ped is not null, 'T17: pedido debe tener oportunidad_id antes del tombstone';

  select updated_at into v_ts from public.user_data where user_id = v_uid;

  -- Flush con tombstone de la oportunidad (cliente y documentos persisten)
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes      := $j$[{
        "id":"t17_cli1","nombre":"T17",
        "recordatorios":[],"historialContactos":[]
      }]$j$::jsonb,
      p_oportunidades := '[]'::jsonb,
      p_cots          := $j$[{
        "id":"cot_t17_1","clienteId":"t17_cli1",
        "items":[],"subtotal":0,"monto":5000,"descuento":"","tipoDescuento":"porcentaje",
        "anticipo":"","vigencia":"","vigenciaDias":"","tipoPago":null,
        "svCondiciones":"","svCondicionesHtml":"","notas":"","etiqueta":"",
        "estatus":"Enviada","fecha":"2026-09-30","pagos":[],
        "vinculadaOportunidadActual":true
      }]$j$::jsonb,
      p_pedidos       := $j$[{
        "id":"ped_t17_1","clienteId":"t17_cli1",
        "items":[],"productos":"Servicio T17","cantidad":1,"total":5000,
        "estadoPedido":"preparando","fecha":"2026-09-30","pagos":[]
      }]$j$::jsonb,
      p_tombstones    := '[{"tipo":"oportunidad","cleoId":"op_cli_t17_cli1"}]'::jsonb
    ),
    'servicios', v_ts
  );
  assert (v_res ->> 'estado') = 'ok', 'T17 paso2: ' || v_res::text;

  -- La oportunidad no existe
  select count(*) into v_cnt from public.oportunidades
   where negocio_id = v_neg_id and cleo_id = 'op_cli_t17_cli1';
  assert v_cnt = 0, 'T17 FALLA: oportunidad no borrada. cnt=' || v_cnt;

  -- El cliente sigue existiendo
  select count(*) into v_cnt from public.clientes
   where negocio_id = v_neg_id and cleo_id = 't17_cli1';
  assert v_cnt = 1, 'T17 FALLA: cliente fue borrado. cnt=' || v_cnt;

  -- La cotización persiste con oportunidad_id = NULL (SET NULL)
  select count(*) into v_cnt from public.cotizaciones
   where negocio_id = v_neg_id and cleo_id = 'cot_t17_1';
  assert v_cnt = 1, 'T17 FALLA: cotización fue eliminada. cnt=' || v_cnt;

  select ct.oportunidad_id into v_op_id_cot from public.cotizaciones ct
   where ct.negocio_id = v_neg_id and ct.cleo_id = 'cot_t17_1';
  assert v_op_id_cot is null,
    'T17 FALLA: cotizacion.oportunidad_id debe ser NULL. uuid=' || v_op_id_cot::text;

  -- El pedido persiste con oportunidad_id = NULL (SET NULL)
  select count(*) into v_cnt from public.pedidos
   where negocio_id = v_neg_id and cleo_id = 'ped_t17_1';
  assert v_cnt = 1, 'T17 FALLA: pedido fue eliminado. cnt=' || v_cnt;

  select p.oportunidad_id into v_op_id_ped from public.pedidos p
   where p.negocio_id = v_neg_id and p.cleo_id = 'ped_t17_1';
  assert v_op_id_ped is null,
    'T17 FALLA: pedido.oportunidad_id debe ser NULL. uuid=' || v_op_id_ped::text;

  raise notice 'T17 OK: tombstone oportunidad → SET NULL en cotizacion Y pedido; ambos documentos persisten.';
end;
$t17$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T18: recordatorio borrado del blob sin tombstone → persiste en DB
--
-- QUÉ PRUEBA:
--   · Cuando un recordatorio desaparece del blob sin que el cliente envíe un
--     tombstone, cleo_dual_flush NO lo borra de la tabla.
--   · La tabla es la fuente de verdad para recordatorios en modo dual;
--     las ausencias en el blob no son borrados.
--
-- MOTIVACIÓN: el client puede omitir recordatorios silenciosamente (filtrados
-- por UI, completados y ocultos, etc.). Solo el tombstone explícito borra.
-- ══════════════════════════════════════════════════════════════════════════════
do $t18$
declare
  v_uid    uuid;
  v_neg_id uuid;
  v_res    jsonb;
  v_ts     timestamptz;
  v_cnt    int;
  v_cat    text;
begin
  select id into v_uid    from auth.users    where email = 'dual09@cleo.test' limit 1;
  select id into v_neg_id from public.negocios where user_id = v_uid;
  perform pg_temp.as_user(v_uid);

  -- Limpiar
  delete from public.clientes  where negocio_id = v_neg_id and cleo_id = 't18_cli1';
  delete from public.user_data where user_id = v_uid;

  -- Flush inicial: cliente con un recordatorio
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes := $j$[{
        "id":"t18_cli1","nombre":"T18",
        "recordatorios":[{
          "id":"t18_rec1","categoria":"pipeline",
          "nota":"Llamar esta semana","fecha":"2026-10-05",
          "esPersonalizada":false,"origen":"cleo"
        }],
        "historialContactos":[]
      }]$j$::jsonb,
      p_oportunidades := '[]'::jsonb
    ),
    'servicios', null
  );
  assert (v_res ->> 'estado') = 'ok', 'T18 paso1: ' || v_res::text;

  -- Verificar que el recordatorio existe
  select count(*) into v_cnt from public.recordatorios
   where negocio_id = v_neg_id and cleo_id = 't18_rec1';
  assert v_cnt = 1, 'T18: recordatorio debe existir después del primer flush. cnt=' || v_cnt;

  select updated_at into v_ts from public.user_data where user_id = v_uid;

  -- Segundo flush: mismo cliente PERO sin el recordatorio en el array
  -- y sin tombstone — el recordatorio "desaparece" del blob silenciosamente
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes := $j$[{
        "id":"t18_cli1","nombre":"T18",
        "recordatorios":[],
        "historialContactos":[]
      }]$j$::jsonb,
      p_oportunidades := '[]'::jsonb
      -- SIN tombstone para t18_rec1
    ),
    'servicios', v_ts
  );
  assert (v_res ->> 'estado') = 'ok', 'T18 paso2: ' || v_res::text;

  -- El recordatorio DEBE seguir en la tabla (ausencia en blob ≠ borrado)
  select count(*) into v_cnt from public.recordatorios
   where negocio_id = v_neg_id and cleo_id = 't18_rec1';
  assert v_cnt = 1,
    'T18 FALLA: recordatorio borrado silenciosamente por ausencia en blob. cnt=' || v_cnt;

  -- La categoría debe ser la original (no corrompida)
  select r.categoria into v_cat from public.recordatorios r
   where r.negocio_id = v_neg_id and r.cleo_id = 't18_rec1';
  assert v_cat = 'pipeline',
    'T18 FALLA: categoría del recordatorio corrompida. cat=' || coalesce(v_cat,'NULL');

  raise notice 'T18 OK: recordatorio ausente en blob sin tombstone permanece en DB.';
end;
$t18$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T19: resolución de conflicto "conservar local"
--
-- QUÉ PRUEBA:
--   · Cuando hay un conflicto (updated_at incorrecto), el cliente puede
--     recuperarse leyendo el updated_at actual vía cleo_dual_read y reintentando
--     el flush con ese timestamp. Esto simula la ruta resolverConflictoConservarLocal
--     de cloudSync.js.
--   · El reintento con el timestamp correcto tiene éxito.
--   · El contenido del blob enviado en el reintento (datos locales) queda guardado.
--
-- QUÉ NO PRUEBA:
--   · Qué tan rápido ocurre el conflicto en condiciones reales.
-- ══════════════════════════════════════════════════════════════════════════════
do $t19$
declare
  v_uid     uuid;
  v_neg_id  uuid;
  v_res     jsonb;
  v_ts_1    timestamptz;  -- versión después del primer flush
  v_ts_2    timestamptz;  -- versión después del segundo flush (simula otro dispositivo)
  v_ts_srv  timestamptz;  -- versión leída del servidor para recuperación
  v_cnt     int;
begin
  select id into v_uid    from auth.users    where email = 'dual09@cleo.test' limit 1;
  select id into v_neg_id from public.negocios where user_id = v_uid;
  perform pg_temp.as_user(v_uid);

  -- Limpiar para empezar en estado conocido
  delete from public.clientes  where negocio_id = v_neg_id and cleo_id like 't19_%';
  delete from public.user_data where user_id = v_uid;

  -- Paso 1: primer flush limpio (cliente A)
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes := $j$[{
        "id":"t19_cli_a","nombre":"T19 Cliente A",
        "recordatorios":[],"historialContactos":[]
      }]$j$::jsonb,
      p_oportunidades := '[]'::jsonb
    ),
    'servicios', null
  );
  assert (v_res ->> 'estado') = 'ok', 'T19 paso1: ' || v_res::text;
  select updated_at into v_ts_1 from public.user_data where user_id = v_uid;

  -- Paso 2: otro dispositivo escribe (cliente B) — avanza el timestamp del servidor
  -- Usamos as_user del mismo uid porque es el mismo usuario desde otro "dispositivo"
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes := $j$[{
        "id":"t19_cli_b","nombre":"T19 Cliente B",
        "recordatorios":[],"historialContactos":[]
      }]$j$::jsonb,
      p_oportunidades := '[]'::jsonb
    ),
    'servicios', v_ts_1
  );
  assert (v_res ->> 'estado') = 'ok', 'T19 paso2 (segundo dispositivo): ' || v_res::text;
  select updated_at into v_ts_2 from public.user_data where user_id = v_uid;

  -- Paso 3: dispositivo original intenta guardar con versión v_ts_1 (ya caducó) → CONFLICTO
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes := $j$[{
        "id":"t19_cli_a","nombre":"T19 Cliente A actualizado",
        "recordatorios":[],"historialContactos":[]
      }]$j$::jsonb,
      p_oportunidades := '[]'::jsonb
    ),
    'servicios', v_ts_1  -- timestamp ya caducado
  );
  assert (v_res ->> 'estado') = 'conflicto',
    'T19 FALLA: debía ser conflicto con timestamp viejo. ' || v_res::text;

  -- Paso 4: cliente llama a cleo_dual_read para obtener el timestamp actual
  -- (esto es lo que hace resolverConflictoConservarLocal en cloudSync.js)
  declare v_read jsonb; begin
    v_read := public.cleo_dual_read();
    assert (v_read ->> 'estado') = 'ok', 'T19 read: ' || v_read::text;
    v_ts_srv := (v_read ->> 'updated_at')::timestamptz;
    assert v_ts_srv = v_ts_2,
      'T19 FALLA: timestamp del read no coincide con el del servidor. ' ||
      'read=' || v_ts_srv::text || ' servidor=' || v_ts_2::text;
  end;

  -- Paso 5: reintento con el timestamp correcto → OK (conservar local)
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes := $j$[{
        "id":"t19_cli_a","nombre":"T19 Cliente A actualizado",
        "recordatorios":[],"historialContactos":[]
      }]$j$::jsonb,
      p_oportunidades := '[]'::jsonb
    ),
    'servicios', v_ts_srv  -- timestamp obtenido en paso 4
  );
  assert (v_res ->> 'estado') = 'ok',
    'T19 FALLA: reintento con timestamp correcto debe ser ok. ' || v_res::text;

  -- Verificar que el dato local (cliente A actualizado) quedó guardado
  declare v_nombre text; begin
    select c.nombre into v_nombre from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = 't19_cli_a';
    assert v_nombre = 'T19 Cliente A actualizado',
      'T19 FALLA: nombre del cliente A no actualizado. nombre=' || coalesce(v_nombre,'NULL');
  end;

  -- Verificar que el cliente B (del otro dispositivo) también existe
  select count(*) into v_cnt from public.clientes
   where negocio_id = v_neg_id and cleo_id = 't19_cli_b';
  assert v_cnt = 1, 'T19 FALLA: cliente B no existe. cnt=' || v_cnt;

  raise notice 'T19 OK: conflicto detectado; cleo_dual_read devuelve timestamp correcto; reintento conservar_local exitoso.';
end;
$t19$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T20: cleo_reabrir_pedido
--
-- QUÉ PRUEBA:
--   T20a — transición legítima: Entregado → Preparando
--     · El pedido cambia a estado_pedido='preparando'.
--     · versiones_confirmacion recibe el snapshot de items_confirmacion.
--     · items_confirmacion queda NULL (listo para nueva confirmación).
--     · Un segundo reabrir en el mismo estado falla (ya no está en 'entregado').
--   T20b — rechazo cross-negocio
--     · copia09 intenta reabrir un pedido de dual09 → error 'no encontrado'.
--     · El pedido de dual09 permanece intacto.
--
-- NOTA: Requiere copia09@cleo.test existente en auth.users.
--       Si no existe, T20b se marca como SKIP.
-- ══════════════════════════════════════════════════════════════════════════════

-- T20a: reapertura legítima Entregado → Preparando
do $t20a$
declare
  v_uid        uuid;
  v_neg_id     uuid;
  v_res        jsonb;
  v_ts         timestamptz;
  v_ped_uuid   uuid;
  v_estado     text;
  v_vers_cnt   int;
  v_items_conf jsonb;
begin
  select id into v_uid    from auth.users    where email = 'dual09@cleo.test' limit 1;
  select id into v_neg_id from public.negocios where user_id = v_uid;
  perform pg_temp.as_user(v_uid);

  -- Limpiar
  delete from public.clientes  where negocio_id = v_neg_id and cleo_id = 't20_cli1';
  delete from public.user_data where user_id = v_uid;

  -- Flush: pedido en estado 'entregado' con items_confirmacion lleno
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes := $j$[{
        "id":"t20_cli1","nombre":"T20",
        "recordatorios":[],"historialContactos":[]
      }]$j$::jsonb,
      p_oportunidades := '[{"id":"op_cli_t20_cli1","clienteId":"t20_cli1","modo":"servicios","titulo":"T20","estatus":"ganada","etapa":"ganado"}]'::jsonb,
      p_pedidos := $j$[{
        "id":"ped_t20_1","clienteId":"t20_cli1",
        "items":[{"nombre":"Servicio T20","cantidad":1,"precio":2000}],
        "productos":"Servicio T20","cantidad":1,"total":2000,
        "estadoPedido":"entregado",
        "itemsConfirmacion":[{"nombre":"Servicio T20","cantidad":1,"precio":2000}],
        "montoConfirmacion":2000,
        "fecha":"2026-09-28","fechaEntrega":"2026-09-30","pagos":[]
      }]$j$::jsonb
    ),
    'servicios', null
  );
  assert (v_res ->> 'estado') = 'ok', 'T20a flush: ' || v_res::text;

  -- Obtener el UUID del pedido
  select p.id into v_ped_uuid from public.pedidos p
   where p.negocio_id = v_neg_id and p.cleo_id = 'ped_t20_1';
  assert v_ped_uuid is not null, 'T20a: pedido no encontrado después del flush';

  -- Verificar estado inicial
  select p.estado_pedido into v_estado from public.pedidos p where p.id = v_ped_uuid;
  assert v_estado = 'entregado', 'T20a: estado inicial debe ser entregado. estado=' || coalesce(v_estado,'NULL');

  -- Llamar a cleo_reabrir_pedido con el cleo_id del pedido
  -- Retorna void; lanza excepción si el pedido no existe, no pertenece al negocio
  -- o no está en estado 'entregado'
  perform public.cleo_reabrir_pedido('ped_t20_1');

  -- Verificar estado → preparando
  select p.estado_pedido into v_estado from public.pedidos p where p.id = v_ped_uuid;
  assert v_estado = 'preparando',
    'T20a FALLA: estado_pedido debe ser preparando. estado=' || coalesce(v_estado,'NULL');

  -- Verificar versiones_confirmacion tiene 1 entrada con el snapshot
  select jsonb_array_length(p.versiones_confirmacion) into v_vers_cnt
    from public.pedidos p where p.id = v_ped_uuid;
  assert v_vers_cnt = 1,
    'T20a FALLA: versiones_confirmacion debe tener 1 entrada. cnt=' || v_vers_cnt;

  -- items_confirmacion debe haber quedado NULL (listo para nueva confirmación)
  select p.items_confirmacion into v_items_conf from public.pedidos p where p.id = v_ped_uuid;
  assert v_items_conf is null,
    'T20a FALLA: items_confirmacion debe ser NULL tras reapertura. val=' || v_items_conf::text;

  -- Segundo reabrir: debe fallar porque ya no está en 'entregado'
  begin
    perform public.cleo_reabrir_pedido('ped_t20_1');
    assert false, 'T20a FALLA: segundo reabrir debía lanzar excepción.';
  exception
    when others then
      -- Esperamos un error de transición inválida
      raise notice 'T20a: segundo reabrir rechazado correctamente. msg=%', sqlerrm;
  end;

  raise notice 'T20a OK: Entregado → Preparando; snapshot en versiones_confirmacion; segundo reabrir rechazado.';
end;
$t20a$;


-- T20b: rechazo cross-negocio — copia09 no puede reabrir pedido de dual09
do $t20b$
declare
  v_uid_dual  uuid;
  v_uid_copia uuid;
  v_neg_id    uuid;
  v_estado    text;
begin
  select id into v_uid_dual  from auth.users where email = 'dual09@cleo.test'  limit 1;
  select id into v_uid_copia from auth.users where email = 'copia09@cleo.test' limit 1;

  if v_uid_copia is null then
    raise notice 'T20b SKIP: copia09@cleo.test no encontrado. Crea el usuario para probar el rechazo cross-negocio.';
    return;
  end if;

  -- Verificar que el pedido ped_t20_1 sigue existiendo del T20a
  select id into v_neg_id from public.negocios where user_id = v_uid_dual;
  if not exists (select 1 from public.pedidos where negocio_id = v_neg_id and cleo_id = 'ped_t20_1') then
    raise notice 'T20b SKIP: ped_t20_1 no encontrado. Ejecuta T20a primero.';
    return;
  end if;

  -- Simular JWT de copia09 intentando reabrir un pedido de dual09
  perform pg_temp.as_user(v_uid_copia);

  -- cleo_reabrir_pedido retorna void y lanza excepción cuando el pedido
  -- no existe, no pertenece al negocio del JWT, o no está en 'entregado'.
  -- Esperamos que la excepción sea lanzada aquí porque copia09 no es dueño de ped_t20_1.
  begin
    perform public.cleo_reabrir_pedido('ped_t20_1');
    -- Si llega aquí sin excepción, el test falla
    assert false,
      'T20b FALLA: copia09 pudo reabrir pedido de dual09 sin excepción.';
  exception
    when others then
      -- Excepción esperada: "no encontrado, no pertenece a este negocio"
      raise notice 'T20b: cleo_reabrir_pedido rechazó cross-negocio con excepción. msg=%', sqlerrm;
  end;

  -- Verificar que el pedido de dual09 está intacto
  perform pg_temp.as_user(v_uid_dual);
  select p.estado_pedido into v_estado from public.pedidos p
   join public.negocios n on n.id = p.negocio_id
   where n.user_id = v_uid_dual and p.cleo_id = 'ped_t20_1';

  -- Estado esperado: 'preparando' (reabierto en T20a, no revertido por el intento de copia09)
  assert v_estado = 'preparando',
    'T20b FALLA: el estado del pedido de dual09 fue alterado por copia09. estado=' || coalesce(v_estado,'NULL');

  raise notice 'T20b OK: copia09 rechazado; pedido de dual09 intacto en estado=%.', v_estado;
end;
$t20b$;


-- ══════════════════════════════════════════════════════════════════════════════
-- RESUMEN FINAL
-- ══════════════════════════════════════════════════════════════════════════════
do $resumen20$
begin
  raise notice '══════════════════════════════════════════';
  raise notice '20-tests-adicionales-dual.sql — RESUMEN';
  raise notice '══════════════════════════════════════════';
  raise notice 'T16 tipo_perfil=productos → oportunidad modo=productos; pedido vinculado; read ok';
  raise notice 'T17 tombstone oportunidad → SET NULL en cotizacion Y pedido; ambos persisten';
  raise notice 'T18 recordatorio ausente en blob sin tombstone → permanece en DB';
  raise notice 'T19 conflicto → read devuelve timestamp; reintento conservar_local exitoso';
  raise notice 'T20a cleo_reabrir_pedido Entregado → Preparando; snapshot archivado';
  raise notice 'T20b cross-negocio rechazado; pedido original intacto';
  raise notice '══════════════════════════════════════════';
  raise notice 'NOTAS:';
  raise notice '  T16 restaura tipo_perfil=servicios al finalizar (ENSURE).';
  raise notice '  T20b hace SKIP si copia09@cleo.test no existe.';
  raise notice '══════════════════════════════════════════';
end;
$resumen20$;
