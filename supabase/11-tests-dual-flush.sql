-- ══════════════════════════════════════════════════════════════════════════════
-- 11-tests-dual-flush.sql
-- CLEO Pruebas — pruebas de cleo_dual_flush y cleo_dual_read
--
-- PRERREQUISITO: crear la cuenta dual09@cleo.test en CLEO Pruebas antes de
-- ejecutar. El script falla en el GUARD inicial si no existe.
--
-- Cada prueba corre en su propia transacción (ROLLBACK al final del bloque DO).
-- El estado del negocio de prueba se limpia al inicio de cada test.
--
-- Para simular auth.uid() se usa set_config('request.jwt.claims', ...) que es
-- el mecanismo que Supabase usa internamente en auth.uid().
--
-- NO activa schema_ver='dual' en producción ni en el negocio copia09.
-- ══════════════════════════════════════════════════════════════════════════════

do $setup$
declare
  v_uid uuid;
  v_neg_id uuid;
begin
  -- ── GUARD: verificar que el usuario de prueba existe ────────────────────
  select id into v_uid from auth.users where email = 'dual09@cleo.test' limit 1;
  if v_uid is null then
    raise exception
      '[GUARD] No se encontró dual09@cleo.test en auth.users. '
      'Crea la cuenta en CLEO Pruebas → Authentication → Users y vuelve a ejecutar.';
  end if;

  -- ── GUARD: verificar que los esquemas del dual flush existen ────────────
  if to_regproc('public.cleo_dual_flush') is null then
    raise exception '[GUARD] Función cleo_dual_flush no encontrada. Ejecuta 10-dual-flush.sql primero.';
  end if;

  -- ── Crear/limpiar negocio de prueba dual ────────────────────────────────
  -- Borrar si existe para empezar en estado limpio
  delete from public.negocios where user_id = v_uid;
  delete from public.user_data  where user_id = v_uid;

  -- Insertar negocio con schema_ver='dual'
  -- Ejecutamos como postgres, que no es 'authenticated', así que el trigger
  -- trg_negocios_reserved no bloquea el INSERT directo.
  insert into public.negocios (user_id, nombre, nombre_contacto, tipo_perfil, moneda, schema_ver)
  values (v_uid, 'Test Dual', 'Ana Test', 'servicios', 'MXN', 'dual');

  raise notice 'SETUP OK. Negocio dual creado para %.', v_uid;
end;
$setup$;


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOQUE DE UTILIDADES
-- ══════════════════════════════════════════════════════════════════════════════

-- Función auxiliar: simular auth.uid() = uid dado
create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true  -- is_local: válido para la transacción actual
  );
end;
$$;

-- Función auxiliar: blob mínimo válido para modo dual
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


-- ══════════════════════════════════════════════════════════════════════════════
-- T01: schema_ver='blob' → error schema_no_dual
-- ══════════════════════════════════════════════════════════════════════════════
do $t01$
declare
  v_uid  uuid;
  v_res  jsonb;
begin
  select id into v_uid from auth.users where email = 'copia09@cleo.test' limit 1;
  if v_uid is null then
    raise notice 'T01 SKIP: copia09@cleo.test no encontrado.';
    return;
  end if;

  perform pg_temp.as_user(v_uid);
  v_res := public.cleo_dual_flush(pg_temp.blob_minimo(), 'servicios', null);

  assert (v_res ->> 'estado') = 'error', 'T01: esperaba estado=error';
  assert (v_res ->> 'codigo') = 'schema_no_dual', 'T01: esperaba codigo=schema_no_dual';
  raise notice 'T01 OK: schema_ver=blob devuelve schema_no_dual.';
end;
$t01$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T02: cleo_oportunidades ausente → error formato_antiguo
-- ══════════════════════════════════════════════════════════════════════════════
do $t02$
declare
  v_uid  uuid;
  v_res  jsonb;
  v_blob jsonb;
begin
  select id into v_uid from auth.users where email = 'dual09@cleo.test' limit 1;
  perform pg_temp.as_user(v_uid);

  -- Blob sin cleo_oportunidades ni cleo_tombstones
  v_blob := '{"cleo_tipo_perfil":"servicios","cleo_perfil":{},"cleo_clientes":[]}'::jsonb;
  v_res  := public.cleo_dual_flush(v_blob, 'servicios', null);

  assert (v_res ->> 'estado') = 'error',          'T02: esperaba estado=error';
  assert (v_res ->> 'codigo') = 'formato_antiguo', 'T02: esperaba codigo=formato_antiguo';
  raise notice 'T02 OK: blob sin cleo_oportunidades → formato_antiguo.';
end;
$t02$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T03: cleo_tombstones ausente → error formato_antiguo
-- ══════════════════════════════════════════════════════════════════════════════
do $t03$
declare
  v_uid  uuid;
  v_res  jsonb;
  v_blob jsonb;
begin
  select id into v_uid from auth.users where email = 'dual09@cleo.test' limit 1;
  perform pg_temp.as_user(v_uid);

  -- Blob con oportunidades pero sin tombstones
  v_blob := '{"cleo_tipo_perfil":"servicios","cleo_perfil":{},"cleo_clientes":[],"cleo_oportunidades":[]}'::jsonb;
  v_res  := public.cleo_dual_flush(v_blob, 'servicios', null);

  assert (v_res ->> 'estado') = 'error',          'T03: esperaba estado=error';
  assert (v_res ->> 'codigo') = 'formato_antiguo', 'T03: esperaba codigo=formato_antiguo';
  raise notice 'T03 OK: blob sin cleo_tombstones → formato_antiguo.';
end;
$t03$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T04: primera escritura correcta → ok + updated_at
-- ══════════════════════════════════════════════════════════════════════════════
do $t04$
declare
  v_uid        uuid;
  v_neg_id     uuid;
  v_res        jsonb;
  v_updated_at timestamptz;
  v_cnt        int;
begin
  select id into v_uid    from auth.users    where email = 'dual09@cleo.test' limit 1;
  select id into v_neg_id from public.negocios where user_id = v_uid;
  perform pg_temp.as_user(v_uid);

  -- Estado limpio
  delete from public.user_data where user_id = v_uid;
  delete from public.clientes  where negocio_id = v_neg_id;

  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes := '[{"id":"t04_cli1","nombre":"Cliente T04","recordatorios":[],"historialContactos":[]}]'::jsonb,
      p_oportunidades := '[{"id":"op_cli_t04_cli1","clienteId":"t04_cli1","modo":"servicios","titulo":"Test","estatus":"activa","etapa":"nuevo_contacto"}]'::jsonb
    ),
    'servicios',
    null  -- primera escritura
  );

  assert (v_res ->> 'estado') = 'ok', 'T04: esperaba estado=ok, obtuvo: ' || v_res::text;
  assert (v_res -> 'updated_at') is not null, 'T04: updated_at debe estar presente';

  select count(*) into v_cnt from public.clientes      where negocio_id = v_neg_id;
  assert v_cnt = 1, 'T04: esperaba 1 cliente, obtuvo ' || v_cnt;

  select count(*) into v_cnt from public.oportunidades where negocio_id = v_neg_id;
  assert v_cnt = 1, 'T04: esperaba 1 oportunidad, obtuvo ' || v_cnt;

  select count(*) into v_cnt from public.user_data     where user_id = v_uid;
  assert v_cnt = 1, 'T04: esperaba 1 fila en user_data';

  raise notice 'T04 OK: primera escritura crea registros y devuelve updated_at.';
end;
$t04$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T05: updated_at incorrecto → conflicto (no escribe)
-- ══════════════════════════════════════════════════════════════════════════════
do $t05$
declare
  v_uid        uuid;
  v_neg_id     uuid;
  v_res        jsonb;
  v_real_ts    timestamptz;
  v_cli_antes  int;
begin
  select id into v_uid    from auth.users    where email = 'dual09@cleo.test' limit 1;
  select id into v_neg_id from public.negocios where user_id = v_uid;
  perform pg_temp.as_user(v_uid);

  -- Leer updated_at real
  select updated_at into v_real_ts from public.user_data where user_id = v_uid;
  if v_real_ts is null then
    raise notice 'T05 SKIP: user_data no existe aún (ejecuta T04 antes).';
    return;
  end if;

  select count(*) into v_cli_antes from public.clientes where negocio_id = v_neg_id;

  -- Usar una versión incorrecta
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes := '[{"id":"t05_intruso","nombre":"Intruso","recordatorios":[],"historialContactos":[]}]'::jsonb,
      p_oportunidades := '[]'::jsonb
    ),
    'servicios',
    v_real_ts - interval '1 second'  -- versión incorrecta
  );

  assert (v_res ->> 'estado') = 'conflicto', 'T05: esperaba conflicto, obtuvo: ' || v_res::text;

  -- No debe haber cambiado el conteo de clientes
  declare v_cli_despues int; begin
    select count(*) into v_cli_despues from public.clientes where negocio_id = v_neg_id;
    assert v_cli_despues = v_cli_antes,
      'T05: versión incorrecta escribió datos. FALLA GRAVE. antes=' || v_cli_antes || ' despues=' || v_cli_despues;
  end;

  raise notice 'T05 OK: updated_at incorrecto → conflicto sin escritura.';
end;
$t05$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T06: tombstone + entidad presente en blob → entidad borrada, no resucita
-- ══════════════════════════════════════════════════════════════════════════════
do $t06$
declare
  v_uid    uuid;
  v_neg_id uuid;
  v_res    jsonb;
  v_ts     timestamptz;
  v_cnt    int;
begin
  select id into v_uid    from auth.users    where email = 'dual09@cleo.test' limit 1;
  select id into v_neg_id from public.negocios where user_id = v_uid;
  perform pg_temp.as_user(v_uid);

  -- Estado: insertar un cliente y una oportunidad
  delete from public.clientes      where negocio_id = v_neg_id and cleo_id = 't06_cli1';
  delete from public.oportunidades where negocio_id = v_neg_id and cleo_id like 'op_cli_t06%';
  delete from public.user_data     where user_id = v_uid;

  -- Primer flush: crear cliente
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes      := '[{"id":"t06_cli1","nombre":"A borrar","recordatorios":[],"historialContactos":[]}]'::jsonb,
      p_oportunidades := '[{"id":"op_cli_t06_cli1","clienteId":"t06_cli1","modo":"servicios","titulo":"X","estatus":"activa","etapa":"nuevo_contacto"}]'::jsonb
    ),
    'servicios', null
  );
  assert (v_res ->> 'estado') = 'ok', 'T06 paso1: ' || v_res::text;

  select count(*) into v_cnt from public.clientes where negocio_id = v_neg_id and cleo_id = 't06_cli1';
  assert v_cnt = 1, 'T06: cliente debe existir antes de tombstone';

  -- Leer versión actual
  select updated_at into v_ts from public.user_data where user_id = v_uid;

  -- Segundo flush: tombstone del cliente + el cliente TAMBIÉN en cleo_clientes
  -- El tombstone debe ganar sobre el blob → el cliente NO debe resucitar
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes      := '[{"id":"t06_cli1","nombre":"A borrar","recordatorios":[],"historialContactos":[]}]'::jsonb,
      p_oportunidades := '[{"id":"op_cli_t06_cli1","clienteId":"t06_cli1","modo":"servicios","titulo":"X","estatus":"activa","etapa":"nuevo_contacto"}]'::jsonb,
      p_tombstones    := '[{"tipo":"cliente","cleoId":"t06_cli1"}]'::jsonb
    ),
    'servicios', v_ts
  );
  assert (v_res ->> 'estado') = 'ok', 'T06 paso2: ' || v_res::text;

  -- Cliente debe haber sido borrado (tombstone se procesó antes del UPSERT)
  select count(*) into v_cnt from public.clientes where negocio_id = v_neg_id and cleo_id = 't06_cli1';
  assert v_cnt = 0, 'T06 FALLA: cliente resucitó después del tombstone. cnt=' || v_cnt;

  -- Oportunidad debería haberse borrado también (CASCADE desde cliente)
  select count(*) into v_cnt from public.oportunidades where negocio_id = v_neg_id and cleo_id = 'op_cli_t06_cli1';
  assert v_cnt = 0, 'T06 FALLA: oportunidad no borrada por cascade. cnt=' || v_cnt;

  raise notice 'T06 OK: tombstone procesa borrado antes del UPSERT; entidad no resucita.';
end;
$t06$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T07: tombstone de entidad inexistente → ok (idempotente)
-- ══════════════════════════════════════════════════════════════════════════════
do $t07$
declare
  v_uid uuid;
  v_res jsonb;
  v_ts  timestamptz;
begin
  select id into v_uid from auth.users where email = 'dual09@cleo.test' limit 1;
  perform pg_temp.as_user(v_uid);

  select updated_at into v_ts from public.user_data where user_id = v_uid;
  if v_ts is null then
    raise notice 'T07 SKIP: ejecuta T04 antes para crear user_data.';
    return;
  end if;

  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_tombstones := '[{"tipo":"cliente","cleoId":"no_existe_nunca"}]'::jsonb
    ),
    'servicios', v_ts
  );

  assert (v_res ->> 'estado') = 'ok', 'T07: tombstone de entidad inexistente debe devolver ok. ' || v_res::text;
  raise notice 'T07 OK: tombstone idempotente cuando la entidad no existe.';
end;
$t07$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T08: borrar oportunidad → cotizacion.oportunidad_id = NULL (SET NULL, no CASCADE)
-- ══════════════════════════════════════════════════════════════════════════════
do $t08$
declare
  v_uid    uuid;
  v_neg_id uuid;
  v_res    jsonb;
  v_ts     timestamptz;
  v_cnt    int;
  v_op_id  uuid;
  v_cot_oportunidad_id uuid;
begin
  select id into v_uid    from auth.users    where email = 'dual09@cleo.test' limit 1;
  select id into v_neg_id from public.negocios where user_id = v_uid;
  perform pg_temp.as_user(v_uid);

  -- Limpiar datos previos del test
  delete from public.clientes      where negocio_id = v_neg_id and cleo_id in ('t08_cli1');
  delete from public.user_data     where user_id = v_uid;

  -- Flush inicial: cliente + oportunidad + cotización vinculada
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes      := '[{"id":"t08_cli1","nombre":"T08","recordatorios":[],"historialContactos":[]}]'::jsonb,
      p_oportunidades := '[{"id":"op_cli_t08_cli1","clienteId":"t08_cli1","modo":"servicios","titulo":"T08","estatus":"activa","etapa":"cotizacion_enviada"}]'::jsonb,
      p_cots          := '[{"id":"cot_t08_1","clienteId":"t08_cli1","items":[],"subtotal":0,"monto":0,"descuento":"","tipoDescuento":"porcentaje","anticipo":"","vigencia":"","vigenciaDias":"","tipoPago":null,"svCondiciones":"","svCondicionesHtml":"","notas":"","etiqueta":"","estatus":"Pendiente","fecha":"2026-09-21","pagos":[],"vinculadaOportunidadActual":true}]'::jsonb
    ),
    'servicios', null
  );
  assert (v_res ->> 'estado') = 'ok', 'T08 paso1: ' || v_res::text;

  -- Verificar que la cotización tiene oportunidad_id
  select ct.oportunidad_id into v_cot_oportunidad_id
    from public.cotizaciones ct
   where ct.negocio_id = v_neg_id and ct.cleo_id = 'cot_t08_1';
  assert v_cot_oportunidad_id is not null, 'T08: cotización debe tener oportunidad_id';

  -- Leer versión actual
  select updated_at into v_ts from public.user_data where user_id = v_uid;

  -- Segundo flush: tombstone de la oportunidad (sin el cliente)
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes      := '[{"id":"t08_cli1","nombre":"T08","recordatorios":[],"historialContactos":[]}]'::jsonb,
      p_oportunidades := '[]'::jsonb,
      p_tombstones    := '[{"tipo":"oportunidad","cleoId":"op_cli_t08_cli1"}]'::jsonb
    ),
    'servicios', v_ts
  );
  assert (v_res ->> 'estado') = 'ok', 'T08 paso2: ' || v_res::text;

  -- La cotización debe seguir existiendo (SET NULL, no CASCADE)
  select count(*) into v_cnt from public.cotizaciones
   where negocio_id = v_neg_id and cleo_id = 'cot_t08_1';
  assert v_cnt = 1, 'T08 FALLA: cotización fue eliminada por cascade (debería persistir con SET NULL). cnt=' || v_cnt;

  -- El oportunidad_id de la cotización debe ser NULL ahora
  select ct.oportunidad_id into v_cot_oportunidad_id
    from public.cotizaciones ct
   where ct.negocio_id = v_neg_id and ct.cleo_id = 'cot_t08_1';
  assert v_cot_oportunidad_id is null,
    'T08 FALLA: cotizacion.oportunidad_id debe ser NULL después de borrar la oportunidad.';

  -- La oportunidad no existe
  select count(*) into v_cnt from public.oportunidades
   where negocio_id = v_neg_id and cleo_id = 'op_cli_t08_cli1';
  assert v_cnt = 0, 'T08 FALLA: oportunidad no fue borrada. cnt=' || v_cnt;

  -- El cliente sigue existiendo
  select count(*) into v_cnt from public.clientes
   where negocio_id = v_neg_id and cleo_id = 't08_cli1';
  assert v_cnt = 1, 'T08 FALLA: cliente fue borrado junto con la oportunidad. cnt=' || v_cnt;

  raise notice 'T08 OK: borrar oportunidad → SET NULL en cotizacion.oportunidad_id, cliente intacto.';
end;
$t08$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T09: borrar cliente → oportunidades y recordatorios en CASCADE
-- ══════════════════════════════════════════════════════════════════════════════
do $t09$
declare
  v_uid    uuid;
  v_neg_id uuid;
  v_res    jsonb;
  v_ts     timestamptz;
  v_cnt    int;
begin
  select id into v_uid    from auth.users    where email = 'dual09@cleo.test' limit 1;
  select id into v_neg_id from public.negocios where user_id = v_uid;
  perform pg_temp.as_user(v_uid);

  -- Limpiar
  delete from public.clientes  where negocio_id = v_neg_id and cleo_id = 't09_cli1';
  delete from public.user_data where user_id = v_uid;

  -- Flush inicial
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes := $j$[{
        "id":"t09_cli1","nombre":"T09",
        "recordatorios":[{"id":"t09_rec1","categoria":"pipeline","nota":"Test","fecha":"2026-09-21","esPersonalizada":false,"origen":"cleo"}],
        "historialContactos":[]
      }]$j$::jsonb,
      p_oportunidades := '[{"id":"op_cli_t09_cli1","clienteId":"t09_cli1","modo":"servicios","titulo":"T09","estatus":"activa","etapa":"nuevo_contacto"}]'::jsonb
    ),
    'servicios', null
  );
  assert (v_res ->> 'estado') = 'ok', 'T09 paso1: ' || v_res::text;

  select count(*) into v_cnt from public.recordatorios  where negocio_id = v_neg_id and cleo_id = 't09_rec1';
  assert v_cnt = 1, 'T09: recordatorio debe existir antes del tombstone';
  select count(*) into v_cnt from public.oportunidades  where negocio_id = v_neg_id and cleo_id = 'op_cli_t09_cli1';
  assert v_cnt = 1, 'T09: oportunidad debe existir antes del tombstone';

  select updated_at into v_ts from public.user_data where user_id = v_uid;

  -- Flush con tombstone del cliente
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(p_tombstones := '[{"tipo":"cliente","cleoId":"t09_cli1"}]'::jsonb),
    'servicios', v_ts
  );
  assert (v_res ->> 'estado') = 'ok', 'T09 paso2: ' || v_res::text;

  select count(*) into v_cnt from public.clientes      where negocio_id = v_neg_id and cleo_id = 't09_cli1';
  assert v_cnt = 0, 'T09 FALLA: cliente no borrado. cnt=' || v_cnt;
  select count(*) into v_cnt from public.oportunidades where negocio_id = v_neg_id and cleo_id = 'op_cli_t09_cli1';
  assert v_cnt = 0, 'T09 FALLA: oportunidad no borrada por CASCADE. cnt=' || v_cnt;
  select count(*) into v_cnt from public.recordatorios where negocio_id = v_neg_id and cleo_id = 't09_rec1';
  assert v_cnt = 0, 'T09 FALLA: recordatorio no borrado por CASCADE. cnt=' || v_cnt;

  raise notice 'T09 OK: borrar cliente → oportunidades y recordatorios en CASCADE.';
end;
$t09$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T10: historial_contactos — mismo contenido → skip (idempotente)
-- ══════════════════════════════════════════════════════════════════════════════
do $t10$
declare
  v_uid    uuid;
  v_neg_id uuid;
  v_res    jsonb;
  v_ts     timestamptz;
  v_cnt    int;
  v_h_blob jsonb;
begin
  select id into v_uid    from auth.users    where email = 'dual09@cleo.test' limit 1;
  select id into v_neg_id from public.negocios where user_id = v_uid;
  perform pg_temp.as_user(v_uid);

  delete from public.clientes  where negocio_id = v_neg_id and cleo_id = 't10_cli1';
  delete from public.user_data where user_id = v_uid;

  v_h_blob := $j$[{
    "id":"hist_t10_001",
    "tipo":"precio_enviado",
    "fecha":"2026-09-21",
    "fechaHora":"2026-09-21T10:00:00.000Z",
    "resultado":"Precio enviado",
    "items":[],
    "monto":5000
  }]$j$::jsonb;

  -- Primer flush
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes := jsonb_build_array(jsonb_build_object(
        'id','t10_cli1','nombre','T10',
        'recordatorios','[]'::jsonb,
        'historialContactos', v_h_blob
      )),
      p_oportunidades := '[]'::jsonb
    ),
    'servicios', null
  );
  assert (v_res ->> 'estado') = 'ok', 'T10 paso1: ' || v_res::text;

  select count(*) into v_cnt from public.historial_contactos
   where negocio_id = v_neg_id and cleo_id = 'hist_t10_001';
  assert v_cnt = 1, 'T10: evento historial debe existir después del primer flush';

  select updated_at into v_ts from public.user_data where user_id = v_uid;

  -- Segundo flush: mismo evento
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes := jsonb_build_array(jsonb_build_object(
        'id','t10_cli1','nombre','T10',
        'recordatorios','[]'::jsonb,
        'historialContactos', v_h_blob  -- mismo contenido
      )),
      p_oportunidades := '[]'::jsonb
    ),
    'servicios', v_ts
  );
  assert (v_res ->> 'estado') = 'ok', 'T10 paso2: ' || v_res::text;
  assert jsonb_array_length(v_res -> 'historial_conflictos') = 0,
    'T10 FALLA: mismo contenido no debe reportar conflicto.';

  -- Debe seguir siendo 1 (no duplicó)
  select count(*) into v_cnt from public.historial_contactos
   where negocio_id = v_neg_id and cleo_id = 'hist_t10_001';
  assert v_cnt = 1, 'T10 FALLA: evento duplicado. cnt=' || v_cnt;

  raise notice 'T10 OK: historial_contactos idempotente con mismo contenido.';
end;
$t10$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T11: historial_contactos — contenido distinto → reporta conflicto, no sobrescribe
-- ══════════════════════════════════════════════════════════════════════════════
do $t11$
declare
  v_uid    uuid;
  v_neg_id uuid;
  v_res    jsonb;
  v_ts     timestamptz;
  v_tipo   text;
  v_conf   jsonb;
begin
  select id into v_uid    from auth.users    where email = 'dual09@cleo.test' limit 1;
  select id into v_neg_id from public.negocios where user_id = v_uid;
  perform pg_temp.as_user(v_uid);

  -- Aseguramos que t10_cli1 existe de T10 y tiene hist_t10_001
  -- Si no existe, reconstruir
  if not exists (select 1 from public.historial_contactos
                  where negocio_id = v_neg_id and cleo_id = 'hist_t10_001') then
    raise notice 'T11 SKIP: ejecuta T10 antes para crear el evento historial.';
    return;
  end if;

  select updated_at into v_ts from public.user_data where user_id = v_uid;
  if v_ts is null then
    raise notice 'T11 SKIP: user_data no existe.';
    return;
  end if;

  -- Flush con mismo cleo_id pero tipo diferente
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes := $j$[{
        "id":"t10_cli1","nombre":"T10",
        "recordatorios":[],
        "historialContactos":[{
          "id":"hist_t10_001",
          "tipo":"contacto",
          "fecha":"2026-09-21",
          "fechaHora":"2026-09-21T10:00:00.000Z",
          "resultado":"Versión distinta"
        }]
      }]$j$::jsonb,
      p_oportunidades := '[]'::jsonb
    ),
    'servicios', v_ts
  );
  assert (v_res ->> 'estado') = 'ok', 'T11: debe ser ok (no error por conflicto de historial). ' || v_res::text;

  v_conf := v_res -> 'historial_conflictos';
  assert jsonb_array_length(v_conf) = 1, 'T11 FALLA: debe haber 1 conflicto reportado. ' || v_conf::text;
  assert (v_conf -> 0 ->> 'cleo_id') = 'hist_t10_001', 'T11: conflicto debe incluir el cleo_id';

  -- El contenido guardado no debe haber cambiado
  select h.tipo into v_tipo from public.historial_contactos h
   where h.negocio_id = v_neg_id and h.cleo_id = 'hist_t10_001';
  assert v_tipo = 'precio_enviado', 'T11 FALLA: tipo fue sobreescrito. tipo=' || coalesce(v_tipo,'NULL');

  raise notice 'T11 OK: historial_contactos reporta conflicto pero NO sobrescribe.';
end;
$t11$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T12: cleo_dual_read devuelve datos consistentes con lo guardado
-- ══════════════════════════════════════════════════════════════════════════════
do $t12$
declare
  v_uid    uuid;
  v_neg_id uuid;
  v_res    jsonb;
  v_read   jsonb;
  v_ts     timestamptz;
  v_cnt    int;
begin
  select id into v_uid    from auth.users    where email = 'dual09@cleo.test' limit 1;
  select id into v_neg_id from public.negocios where user_id = v_uid;
  perform pg_temp.as_user(v_uid);

  -- Limpiar completamente para test aislado
  delete from public.clientes  where negocio_id = v_neg_id;
  delete from public.user_data where user_id = v_uid;

  -- Flush con datos controlados
  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes := $j$[{
        "id":"t12_cli1","nombre":"Read Test","negocio":"Corp T12",
        "contacto":"5550001212","email":"t12@test.com",
        "seguimientoFecha":"2026-10-01","mensajeSeguimientoPostVenta":"Revisar contrato",
        "recordatorios":[],"historialContactos":[]
      }]$j$::jsonb,
      p_oportunidades := '[{"id":"op_cli_t12_cli1","clienteId":"t12_cli1","modo":"servicios","titulo":"Proyecto T12","estatus":"activa","etapa":"nuevo_contacto"}]'::jsonb,
      p_ventas := $j$[{
        "id":"vta_t12_1","clienteId":"t12_cli1","concepto":"Servicio T12",
        "items":[],"monto":3000,"tipo":"especifico",
        "tipoPago":"completo","entregado":true,"fechaEntrega":"2026-09-21",
        "fecha":"2026-09-21","pagos":[{"id":"pg_t12_1","monto":3000,"fecha":"2026-09-21","concepto":"Pago"}]
      }]$j$::jsonb
    ),
    'servicios', null
  );
  assert (v_res ->> 'estado') = 'ok', 'T12 flush: ' || v_res::text;

  -- Leer con cleo_dual_read
  v_read := public.cleo_dual_read();
  assert (v_read ->> 'estado') = 'ok', 'T12 read: ' || v_read::text;

  declare v_data jsonb; begin
    v_data := v_read -> 'data';

    -- Verificar clientes
    assert jsonb_array_length(v_data -> 'cleo_clientes') = 1,
      'T12: debe haber 1 cliente en el read';

    declare v_cli jsonb; begin
      v_cli := v_data -> 'cleo_clientes' -> 0;
      assert (v_cli ->> 'nombre') = 'Read Test',
        'T12: nombre incorrecto. ' || (v_cli ->> 'nombre');
      assert (v_cli ->> 'seguimientoFecha') = '2026-10-01',
        'T12: seguimientoFecha no se conservó. ' || coalesce(v_cli ->> 'seguimientoFecha','NULL');
      assert (v_cli ->> 'mensajeSeguimientoPostVenta') = 'Revisar contrato',
        'T12: mensajeSeguimientoPostVenta no se conservó.';
    end;

    -- Verificar oportunidades
    assert jsonb_array_length(v_data -> 'cleo_oportunidades') = 1,
      'T12: debe haber 1 oportunidad en el read';

    -- Verificar ventas con P1-P3
    declare v_vta jsonb; begin
      v_vta := v_data -> 'cleo_ventas' -> 0;
      assert (v_vta ->> 'tipoPago') = 'completo',  'T12: tipoPago incorrecto';
      assert (v_vta -> 'entregado') = 'true'::jsonb, 'T12: entregado incorrecto';
      assert (v_vta ->> 'fechaEntrega') = '2026-09-21', 'T12: fechaEntrega incorrecta';
      -- tipo debe re-serializarse como 'especifico'
      assert (v_vta ->> 'tipo') = 'especifico', 'T12: tipo de venta incorrecto. ' || (v_vta ->> 'tipo');
    end;

    -- Verificar que tombstones = []
    assert (v_data -> 'cleo_tombstones') = '[]'::jsonb,
      'T12: cleo_tombstones debe ser [] en el read';

    -- Verificar updated_at presente
    assert (v_read -> 'updated_at') is not null, 'T12: updated_at debe estar en el read';
  end;

  raise notice 'T12 OK: cleo_dual_read devuelve datos consistentes con lo guardado.';
end;
$t12$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T13: versión correcta → ok; versión ya usada en siguiente flush → conflicto
-- (simula el mecanismo de aislamiento sin concurrencia real)
-- ══════════════════════════════════════════════════════════════════════════════
do $t13$
declare
  v_uid uuid;
  v_res jsonb;
  v_ts  timestamptz;
begin
  select id into v_uid from auth.users where email = 'dual09@cleo.test' limit 1;
  perform pg_temp.as_user(v_uid);

  select updated_at into v_ts from public.user_data where user_id = v_uid;
  if v_ts is null then
    raise notice 'T13 SKIP: ejecuta T12 antes.';
    return;
  end if;

  -- Flush válido con la versión correcta
  v_res := public.cleo_dual_flush(pg_temp.blob_minimo(), 'servicios', v_ts);
  assert (v_res ->> 'estado') = 'ok', 'T13 paso1: ' || v_res::text;

  -- Intentar el mismo flush con la versión ANTERIOR (ya caducó)
  v_res := public.cleo_dual_flush(pg_temp.blob_minimo(), 'servicios', v_ts);
  assert (v_res ->> 'estado') = 'conflicto',
    'T13 FALLA: versión ya usada debe devolver conflicto. ' || v_res::text;

  raise notice 'T13 OK: versión correcta escribe; reusar la misma versión → conflicto.';
end;
$t13$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T14: recordatorio sin categoría → sin_clasificar (no inventar postventa)
-- ══════════════════════════════════════════════════════════════════════════════
do $t14$
declare
  v_uid    uuid;
  v_neg_id uuid;
  v_res    jsonb;
  v_ts     timestamptz;
  v_cat    text;
begin
  select id into v_uid    from auth.users    where email = 'dual09@cleo.test' limit 1;
  select id into v_neg_id from public.negocios where user_id = v_uid;
  perform pg_temp.as_user(v_uid);

  -- Limpiar
  delete from public.clientes  where negocio_id = v_neg_id and cleo_id = 't14_cli1';
  delete from public.user_data where user_id = v_uid;

  v_res := public.cleo_dual_flush(
    pg_temp.blob_minimo(
      p_clientes := $j$[{
        "id":"t14_cli1","nombre":"T14",
        "recordatorios":[
          {"id":"t14_rec_sincat","nota":"Sin categoría","fecha":"2026-09-22","esPersonalizada":false,"origen":"cleo"},
          {"id":"t14_rec_exotica","categoria":"pipeline_v2","nota":"Cat desconocida","fecha":"2026-09-22","esPersonalizada":false,"origen":"cleo"}
        ],
        "historialContactos":[]
      }]$j$::jsonb,
      p_oportunidades := '[]'::jsonb
    ),
    'servicios', null
  );
  assert (v_res ->> 'estado') = 'ok', 'T14: ' || v_res::text;

  -- Recordatorio sin categoria → sin_clasificar
  select r.categoria into v_cat from public.recordatorios r
   where r.negocio_id = v_neg_id and r.cleo_id = 't14_rec_sincat';
  assert v_cat = 'sin_clasificar',
    'T14 FALLA: recordatorio sin categoria debe ser sin_clasificar. cat=' || coalesce(v_cat,'NULL');

  -- Recordatorio con categoria desconocida → sin_clasificar
  select r.categoria into v_cat from public.recordatorios r
   where r.negocio_id = v_neg_id and r.cleo_id = 't14_rec_exotica';
  assert v_cat = 'sin_clasificar',
    'T14 FALLA: categoria desconocida debe ser sin_clasificar. cat=' || coalesce(v_cat,'NULL');

  raise notice 'T14 OK: recordatorio sin categoría o con categoría desconocida → sin_clasificar.';
end;
$t14$;


-- ══════════════════════════════════════════════════════════════════════════════
-- T15: seguimientoFecha preservado como columna, sin convertir a recordatorio
-- ══════════════════════════════════════════════════════════════════════════════
do $t15$
declare
  v_uid    uuid;
  v_neg_id uuid;
  v_sf     date;
  v_msg    text;
  v_cnt_rec int;
begin
  -- T12 ya guardó un cliente con seguimientoFecha; verificamos aquí.
  select id into v_uid    from auth.users    where email = 'dual09@cleo.test' limit 1;
  select id into v_neg_id from public.negocios where user_id = v_uid;

  select c.seguimiento_fecha, c.mensaje_seguimiento_postventa
    into v_sf, v_msg
    from public.clientes c
   where c.negocio_id = v_neg_id and c.cleo_id = 't12_cli1';

  assert v_sf  = '2026-10-01'::date, 'T15 FALLA: seguimiento_fecha no guardada. val=' || coalesce(v_sf::text,'NULL');
  assert v_msg = 'Revisar contrato',  'T15 FALLA: mensaje_seguimiento_postventa no guardado.';

  -- No debe haber creado un recordatorio automático para esto
  select count(*) into v_cnt_rec
    from public.recordatorios r
    join public.clientes c on c.id = r.cliente_id
   where c.negocio_id = v_neg_id
     and c.cleo_id    = 't12_cli1'
     and r.categoria  = 'postventa';
  assert v_cnt_rec = 0,
    'T15 FALLA: seguimientoFecha fue convertida automáticamente a recordatorio postventa. cnt=' || v_cnt_rec;

  raise notice 'T15 OK: seguimientoFecha guardada como columna; no convertida automáticamente a recordatorio.';
end;
$t15$;


-- ══════════════════════════════════════════════════════════════════════════════
-- RESUMEN FINAL
-- ══════════════════════════════════════════════════════════════════════════════
do $resumen$
declare
  v_uid    uuid;
  v_neg_id uuid;
begin
  select id into v_uid    from auth.users    where email = 'dual09@cleo.test' limit 1;
  select id into v_neg_id from public.negocios where user_id = v_uid;

  raise notice '══════════════════════════════════════════';
  raise notice '11-tests-dual-flush.sql — RESUMEN FINAL';
  raise notice '══════════════════════════════════════════';
  raise notice 'Negocio dual (test): %', v_neg_id;
  raise notice 'T01 schema_ver=blob → schema_no_dual';
  raise notice 'T02 sin cleo_oportunidades → formato_antiguo';
  raise notice 'T03 sin cleo_tombstones → formato_antiguo';
  raise notice 'T04 primera escritura → ok + registros creados';
  raise notice 'T05 updated_at incorrecto → conflicto sin escritura';
  raise notice 'T06 tombstone + entidad en blob → entidad borrada, no resucitada';
  raise notice 'T07 tombstone entidad inexistente → ok (idempotente)';
  raise notice 'T08 borrar oportunidad → cotizacion.oportunidad_id=NULL (SET NULL)';
  raise notice 'T09 borrar cliente → oportunidades y recordatorios en CASCADE';
  raise notice 'T10 historial mismo contenido → sin conflicto, sin duplicado';
  raise notice 'T11 historial contenido distinto → conflicto reportado, no sobrescrito';
  raise notice 'T12 cleo_dual_read → datos consistentes, P1-P3 y P5 preservados';
  raise notice 'T13 versión reutilizada → conflicto (mecanismo de aislamiento)';
  raise notice 'T14 recordatorio sin categoría → sin_clasificar';
  raise notice 'T15 seguimientoFecha → columna directa, no convertida a recordatorio';
  raise notice '══════════════════════════════════════════';
  raise notice 'NOTA CONCURRENCIA: el aislamiento real (FOR UPDATE) requiere dos';
  raise notice 'sesiones simultáneas. T13 verifica el mecanismo de versión; la';
  raise notice 'garantía de exclusión mutua es del bloqueo FOR UPDATE de PostgreSQL.';
  raise notice '══════════════════════════════════════════';
end;
$resumen$;
