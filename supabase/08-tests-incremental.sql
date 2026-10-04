-- ══════════════════════════════════════════════════════════════════════════════
-- CLEO Pruebas: pconfadsbtwjbjeblxgl.
-- 08-tests-incremental.sql
-- Pruebas para 07-incremental-multi-oportunidad.sql.
-- Prerequisito: 07-incremental ejecutado.
-- Cada test usa ROLLBACK explícito: no persiste datos.
--
-- ESTADO DE EJECUCIÓN
-- ─────────────────────────────────────────────────────────────────────────────
-- Tests escritos:  24, 25, 26, 27, 28, 29
-- Tests ejecutados en CLEO Pruebas: ninguno todavía
-- ══════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if to_regclass('public.negocios') is null then
    raise exception 'Corre 03-schema-relacional.sql primero.';
  end if;
  if not exists (
    select 1 from pg_indexes
     where indexname = 'uq_cot_oportunidad' and schemaname = 'public'
  ) then
    raise exception 'Corre 07-incremental-multi-oportunidad.sql primero.';
  end if;
  -- Verificar que el trigger de blob existe.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.user_data'::regclass
       and tgname  = 'trg_user_data_schema_ver'
  ) then
    raise exception '07-incremental: trg_user_data_schema_ver no encontrado.';
  end if;
end;
$guard$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 24: CHECK de categoria — sin_clasificar aceptada, invalida rechazada,
--          categorías previas conservadas
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_neg uuid := gen_random_uuid();
  v_usr uuid := gen_random_uuid();
  v_cli uuid := gen_random_uuid();
  v_cnt int;
  v_paso_a boolean := false;
  v_paso_b boolean := false;
  v_paso_c boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_usr, 'authenticated', 'authenticated', '_t24@cleo-test.invalid', now(), now());
  insert into public.negocios (id, user_id, nombre)
    values (v_neg, v_usr, '_t24_neg');
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (v_cli, v_neg, '_t24_cli', '_t24_cli');

  -- 24a: las cinco categorías válidas (incluyendo sin_clasificar) se aceptan.
  insert into public.recordatorios (negocio_id, cliente_id, cleo_id, categoria, fecha)
    values
      (v_neg, v_cli, '_t24_r1', 'pipeline',       current_date),
      (v_neg, v_cli, '_t24_r2', 'postventa',      current_date),
      (v_neg, v_cli, '_t24_r3', 'reactivacion',   current_date),
      (v_neg, v_cli, '_t24_r4', 'manual',         current_date),
      (v_neg, v_cli, '_t24_r5', 'sin_clasificar', current_date);

  -- Verificar que las 5 filas existen (no solo que no hubo excepción).
  select count(*) into v_cnt
    from public.recordatorios
   where negocio_id = v_neg and categoria in (
     'pipeline','postventa','reactivacion','manual','sin_clasificar');
  if v_cnt is distinct from 5 then
    raise exception 'TEST 24a FALLÓ: se esperaban 5 filas, encontradas %.', v_cnt;
  end if;
  v_paso_a := true;
  raise notice 'TEST 24a PASÓ: 5 categorías válidas insertadas y verificadas.';

  -- 24b: valor fuera del CHECK rechazado.
  begin
    insert into public.recordatorios (negocio_id, cliente_id, cleo_id, categoria, fecha)
      values (v_neg, v_cli, '_t24_inv', 'invalida', current_date);
    raise exception 'TEST 24b FALLÓ: categoria invalida no fue rechazada';
  exception when check_violation then
    v_paso_b := true;
    raise notice 'TEST 24b PASÓ: categoria invalida rechazada por CHECK.';
  end;

  -- 24c: categorías explícitas válidas pre-existentes no fueron modificadas.
  -- Simula que un recordatorio ya tenía categoria='postventa' en el blob.
  if (select categoria from public.recordatorios where cleo_id = '_t24_r2')
     is distinct from 'postventa' then
    raise exception 'TEST 24c FALLÓ: categoria postventa fue modificada.';
  end if;
  v_paso_c := true;
  raise notice 'TEST 24c PASÓ: categorías explícitas conservadas sin modificar.';

  raise exception '__rollback_t24__';
exception when others then
  if sqlerrm = '__rollback_t24__' then raise notice 'TEST 24: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 25: uq_cot_oportunidad — como máximo una cotización por oportunidad,
--          índice único es el único existente para esa condición
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_neg  uuid := gen_random_uuid();
  v_usr  uuid := gen_random_uuid();
  v_cli  uuid := gen_random_uuid();
  v_op   uuid := gen_random_uuid();
  v_cnt  int;
  v_paso_a boolean := false;
  v_paso_b boolean := false;
  v_paso_c boolean := false;
  v_paso_d boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_usr, 'authenticated', 'authenticated', '_t25@cleo-test.invalid', now(), now());
  insert into public.negocios (id, user_id, nombre) values (v_neg, v_usr, '_t25_neg');
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (v_cli, v_neg, '_t25_cli', '_t25_cli');
  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, etapa)
    values (v_op, v_neg, '_t25_op', v_cli, 'servicios', 'nuevo_contacto');

  -- 25a: primera cotización permitida; verificar que fue insertada.
  insert into public.cotizaciones (negocio_id, cleo_id, cliente_id, oportunidad_id)
    values (v_neg, '_t25_cot1', v_cli, v_op);
  select count(*) into v_cnt from public.cotizaciones
   where negocio_id = v_neg and oportunidad_id = v_op;
  if v_cnt is distinct from 1 then
    raise exception 'TEST 25a FALLÓ: primera cotización no encontrada (count=%).', v_cnt;
  end if;
  v_paso_a := true;
  raise notice 'TEST 25a PASÓ: primera cotización vinculada insertada y verificada.';

  -- 25b: segunda cotización para la misma oportunidad → rechazada.
  begin
    insert into public.cotizaciones (negocio_id, cleo_id, cliente_id, oportunidad_id)
      values (v_neg, '_t25_cot2', v_cli, v_op);
    raise exception 'TEST 25b FALLÓ: segunda cotización no fue rechazada';
  exception when unique_violation then
    v_paso_b := true;
    raise notice 'TEST 25b PASÓ: segunda cotización rechazada por uq_cot_oportunidad.';
  end;

  -- 25c: cotización sin oportunidad_id → no afecta el índice.
  insert into public.cotizaciones (negocio_id, cleo_id, cliente_id)
    values (v_neg, '_t25_libre', v_cli);
  select count(*) into v_cnt from public.cotizaciones
   where negocio_id = v_neg and oportunidad_id is null;
  if v_cnt is distinct from 1 then
    raise exception 'TEST 25c FALLÓ: cotización libre no encontrada.';
  end if;
  raise notice 'TEST 25c PASÓ: cotización sin oportunidad siempre permitida.';

  -- 25d: solo un índice sobre (oportunidad_id) en cotizaciones.
  select count(*) into v_cnt
    from pg_indexes
   where tablename = 'cotizaciones' and schemaname = 'public'
     and indexdef like '%oportunidad_id%';
  if v_cnt is distinct from 1 then
    raise exception 'TEST 25d FALLÓ: se esperaba 1 índice sobre oportunidad_id, encontrados %.', v_cnt;
  end if;
  v_paso_d := true;
  raise notice 'TEST 25d PASÓ: un solo índice sobre oportunidad_id.';

  raise exception '__rollback_t25__';
exception when others then
  if sqlerrm = '__rollback_t25__' then raise notice 'TEST 25: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 26: trg_cotizaciones_delete — cuatro escenarios de borrado
--   26a: DELETE sin oportunidad_id → permitido
--   26b: DELETE directo con oportunidad_id → bloqueado
--   26c: intento de elusión (marcador de otro negocio) → aún bloqueado
--   26d: cascade desde DELETE de negocio → permitido
--   26e: cascade desde DELETE de auth.users → permitido
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_neg_a uuid := gen_random_uuid();
  v_neg_b uuid := gen_random_uuid();
  v_usr_a uuid := gen_random_uuid();
  v_usr_b uuid := gen_random_uuid();
  v_cli   uuid := gen_random_uuid();
  v_op    uuid := gen_random_uuid();
  v_cot   uuid;
  v_cnt   int;
  v_paso_a boolean := false;
  v_paso_b boolean := false;
  v_paso_c boolean := false;
  v_paso_d boolean := false;
  v_paso_e boolean := false;
begin
  -- Negocio A: tiene la cotización vinculada.
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_usr_a, 'authenticated', 'authenticated', '_t26a@cleo-test.invalid', now(), now()),
           (v_usr_b, 'authenticated', 'authenticated', '_t26b@cleo-test.invalid', now(), now());
  insert into public.negocios (id, user_id, nombre) values
    (v_neg_a, v_usr_a, '_t26_neg_a'),
    (v_neg_b, v_usr_b, '_t26_neg_b');
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (v_cli, v_neg_a, '_t26_cli', '_t26_cli');
  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, etapa)
    values (v_op, v_neg_a, '_t26_op', v_cli, 'servicios', 'nuevo_contacto');
  insert into public.cotizaciones (negocio_id, cleo_id, cliente_id, oportunidad_id)
    values (v_neg_a, '_t26_cot', v_cli, v_op)
    returning id into v_cot;

  -- 26a: DELETE de cotización sin oportunidad_id → siempre permitido.
  declare v_cot_libre uuid;
  begin
    insert into public.cotizaciones (negocio_id, cleo_id)
      values (v_neg_a, '_t26_libre') returning id into v_cot_libre;
    delete from public.cotizaciones where id = v_cot_libre;
    -- Verificar que ya no existe.
    if exists (select 1 from public.cotizaciones where id = v_cot_libre) then
      raise exception 'TEST 26a FALLÓ: cotización libre no fue eliminada.';
    end if;
    v_paso_a := true;
    raise notice 'TEST 26a PASÓ: DELETE de cotización sin oportunidad_id permitido y verificado.';
  end;

  -- 26b: DELETE directo de cotización con oportunidad_id → bloqueado.
  begin
    delete from public.cotizaciones where id = v_cot;
    raise exception 'TEST 26b FALLÓ: DELETE directo no fue bloqueado';
  exception when others then
    if sqlerrm like '%no se puede eliminar%' or sqlerrm like '%vinculada a una oportunidad%' then
      -- Verificar que la cotización AÚN existe tras el bloqueo.
      if not exists (select 1 from public.cotizaciones where id = v_cot) then
        raise exception 'TEST 26b FALLÓ: cotización fue eliminada a pesar del bloqueo.';
      end if;
      v_paso_b := true;
      raise notice 'TEST 26b PASÓ: DELETE directo bloqueado, cotización intacta.';
    else raise; end if;
  end;

  -- 26c: intento de elusión — marcador con UUID de OTRO negocio → aún bloqueado.
  -- El marcador para neg_b no debe permitir borrar cotizaciones de neg_a.
  begin
    perform set_config('cleo.deleting_negocio_id', v_neg_b::text, true);
    delete from public.cotizaciones where id = v_cot;
    raise exception 'TEST 26c FALLÓ: elusión con marcador de otro negocio no fue bloqueada';
  exception when others then
    if sqlerrm like '%no se puede eliminar%' or sqlerrm like '%vinculada a una oportunidad%' then
      if not exists (select 1 from public.cotizaciones where id = v_cot) then
        raise exception 'TEST 26c FALLÓ: cotización fue eliminada mediante elusión.';
      end if;
      v_paso_c := true;
      raise notice 'TEST 26c PASÓ: elusión con marcador de otro negocio bloqueada.';
    else raise; end if;
  end;
  -- Limpiar el marcador de elusión para que no interfiera con 26d.
  perform set_config('cleo.deleting_negocio_id', '', true);

  -- 26d: cascade desde DELETE de negocio → permitido; cotizaciones eliminadas.
  delete from public.negocios where id = v_neg_a;
  if exists (select 1 from public.cotizaciones where negocio_id = v_neg_a) then
    raise exception 'TEST 26d FALLÓ: cotizaciones sobrevivieron al CASCADE de negocio.';
  end if;
  if exists (select 1 from public.negocios where id = v_neg_a) then
    raise exception 'TEST 26d FALLÓ: negocio no fue eliminado.';
  end if;
  v_paso_d := true;
  raise notice 'TEST 26d PASÓ: cascade desde borrado de negocio eliminó cotizaciones.';

  -- 26e: cascade desde DELETE de auth.users → negocio → cotizaciones.
  -- Preparar negocio B con cotización vinculada.
  declare
    v_cli_b uuid := gen_random_uuid();
    v_op_b  uuid := gen_random_uuid();
    v_cot_b uuid;
  begin
    insert into public.clientes (id, negocio_id, cleo_id, nombre)
      values (v_cli_b, v_neg_b, '_t26_cli_b', '_t26_cli_b');
    insert into public.oportunidades
      (id, negocio_id, cleo_id, cliente_id, modo, etapa)
      values (v_op_b, v_neg_b, '_t26_op_b', v_cli_b, 'servicios', 'nuevo_contacto');
    insert into public.cotizaciones (negocio_id, cleo_id, cliente_id, oportunidad_id)
      values (v_neg_b, '_t26_cot_b', v_cli_b, v_op_b)
      returning id into v_cot_b;

    delete from auth.users where id = v_usr_b;

    if exists (select 1 from public.cotizaciones where id = v_cot_b) then
      raise exception 'TEST 26e FALLÓ: cotización sobrevivió al cascade de auth.users.';
    end if;
    if exists (select 1 from public.negocios where id = v_neg_b) then
      raise exception 'TEST 26e FALLÓ: negocio sobrevivió al cascade de auth.users.';
    end if;
    v_paso_e := true;
    raise notice 'TEST 26e PASÓ: cascade desde auth.users eliminó negocio y cotizaciones.';
  end;

  raise exception '__rollback_t26__';
exception when others then
  if sqlerrm = '__rollback_t26__' then raise notice 'TEST 26: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 27: cleo_reabrir_cotizacion() — coordinación, snapshots, pagos
--   27a: ganada + Servicios → cotización Enviada + oportunidad activa
--   27b: activa → solo cotización Enviada, oportunidad sin cambio
--   27c: perdida → excepción descriptiva
--   27d: ganada + Productos → excepción (decisión pendiente)
--   27e: sin oportunidad → solo cotización
--   27f: pedidos y pagos existentes no se modifican
--   27g: snapshot archivado en versiones_aceptacion
--   27h: llamada simultánea a la misma cotización → segunda falla limpiamente
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id  uuid := gen_random_uuid();
  v_neg_id   uuid := gen_random_uuid();
  v_cli_id   uuid := gen_random_uuid();
  v_op_id    uuid := gen_random_uuid();
  v_cot_id   uuid;
  v_ped_id   uuid;
  v_pag_id   uuid;
  v_op_est   text;
  v_op_etapa text;
  v_op_fecha date;
  v_cot_est  text;
  v_ped_est  text;
  v_vers     jsonb;
  v_entrada  jsonb;
  v_cnt      int;
  v_paso_a   boolean := false;
  v_paso_b   boolean := false;
  v_paso_c   boolean := false;
  v_paso_d   boolean := false;
  v_paso_e   boolean := false;
  v_paso_f   boolean := false;
  v_paso_g   boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id, 'authenticated', 'authenticated', '_t27@cleo-test.invalid', now(), now());
  insert into public.negocios (id, user_id, nombre)
    values (v_neg_id, v_user_id, '_t27_neg');
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (v_cli_id, v_neg_id, '_t27_cli', '_t27_cli');
  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa, fecha_cierre)
    values (v_op_id, v_neg_id, '_t27_op', v_cli_id,
            'servicios', 'ganada', 'ganado', current_date);
  insert into public.cotizaciones
    (negocio_id, cleo_id, cliente_id, oportunidad_id, estatus,
     items_aceptacion, monto_aceptacion)
    values (v_neg_id, '_t27_cot', v_cli_id, v_op_id, 'Aceptada',
            '[{"nombre":"Servicio A","total":1000}]'::jsonb, 1000)
    returning id into v_cot_id;

  -- Pedido vinculado.
  insert into public.pedidos
    (negocio_id, cleo_id, cliente_id, oportunidad_id, estado_pedido, monto_total)
    values (v_neg_id, '_t27_ped', v_cli_id, v_op_id, 'preparando', 1000)
    returning id into v_ped_id;

  -- Pago vinculado a la cotización.
  insert into public.pagos (negocio_id, cleo_id, cotizacion_id, monto, fecha)
    values (v_neg_id, '_t27_pag', v_cot_id, 500, current_date)
    returning id into v_pag_id;

  -- Contexto JWT para cleo_reabrir_cotizacion().
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ── 27a: ganada + Servicios → cotización Enviada + oportunidad activa ────────
  perform public.cleo_reabrir_cotizacion('_t27_cot');
  reset role;

  select estatus, etapa, fecha_cierre into v_op_est, v_op_etapa, v_op_fecha
    from public.oportunidades where id = v_op_id;
  select estatus into v_cot_est
    from public.cotizaciones   where id = v_cot_id;

  if v_cot_est is distinct from 'Enviada' then
    raise exception 'TEST 27a FALLÓ: cotización estatus=% (esperado Enviada).', v_cot_est;
  end if;
  if v_op_est is distinct from 'activa' then
    raise exception 'TEST 27a FALLÓ: oportunidad estatus=% (esperado activa).', v_op_est;
  end if;
  if v_op_etapa is distinct from 'cotizacion_enviada' then
    raise exception 'TEST 27a FALLÓ: oportunidad etapa=% (esperado cotizacion_enviada).', v_op_etapa;
  end if;
  if v_op_fecha is not null then
    raise exception 'TEST 27a FALLÓ: fecha_cierre no fue limpiada (valor: %).', v_op_fecha;
  end if;
  v_paso_a := true;
  raise notice 'TEST 27a PASÓ: oportunidad ganada Servicios reabierta correctamente.';

  -- ── 27f: pedido y pago intactos ───────────────────────────────────────────
  select estado_pedido into v_ped_est from public.pedidos where id = v_ped_id;
  if v_ped_est is distinct from 'preparando' then
    raise exception 'TEST 27f FALLÓ: pedido cambió estado a % (esperado preparando).', v_ped_est;
  end if;
  if not exists (select 1 from public.pagos where id = v_pag_id) then
    raise exception 'TEST 27f FALLÓ: pago fue eliminado al reabrir cotización.';
  end if;
  v_paso_f := true;
  raise notice 'TEST 27f PASÓ: pedido y pago existentes no fueron modificados.';

  -- ── 27g: snapshot archivado en versiones_aceptacion ──────────────────────
  select versiones_aceptacion into v_vers from public.cotizaciones where id = v_cot_id;
  if jsonb_typeof(v_vers) is distinct from 'array' then
    raise exception 'TEST 27g FALLÓ: versiones_aceptacion no es array (tipo: %).', jsonb_typeof(v_vers);
  end if;
  if jsonb_array_length(v_vers) is distinct from 1 then
    raise exception 'TEST 27g FALLÓ: versiones_aceptacion tiene % elementos (esperado 1).', jsonb_array_length(v_vers);
  end if;
  v_entrada := v_vers->0;
  if (v_entrada->>'monto')::numeric is distinct from 1000 then
    raise exception 'TEST 27g FALLÓ: monto archivado=% (esperado 1000).', v_entrada->>'monto';
  end if;
  if v_entrada->'items' is null then
    raise exception 'TEST 27g FALLÓ: campo "items" falta en la entrada archivada.';
  end if;
  if v_entrada->>'en' is null then
    raise exception 'TEST 27g FALLÓ: campo "en" (timestamp) falta en la entrada archivada.';
  end if;
  -- items_aceptacion debe ser NULL tras reapertura.
  if (select items_aceptacion from public.cotizaciones where id = v_cot_id) is not null then
    raise exception 'TEST 27g FALLÓ: items_aceptacion no fue limpiado tras reapertura.';
  end if;
  v_paso_g := true;
  raise notice 'TEST 27g PASÓ: snapshot archivado correctamente, items_aceptacion limpiado.';

  -- Re-aceptar para continuar los tests.
  update public.cotizaciones
     set estatus          = 'Aceptada',
         items_aceptacion = '[{"nombre":"Servicio A v2","total":1100}]'::jsonb,
         monto_aceptacion = 1100
   where id = v_cot_id;

  -- ── 27b: activa → solo cotización Enviada, oportunidad sin cambio ─────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.cleo_reabrir_cotizacion('_t27_cot');
  reset role;

  select estatus into v_op_est from public.oportunidades where id = v_op_id;
  select estatus into v_cot_est from public.cotizaciones   where id = v_cot_id;
  if v_cot_est is distinct from 'Enviada' then
    raise exception 'TEST 27b FALLÓ: cotización estatus=%.', v_cot_est;
  end if;
  if v_op_est is distinct from 'activa' then
    raise exception 'TEST 27b FALLÓ: oportunidad cambió a % (debía permanecer activa).', v_op_est;
  end if;
  v_paso_b := true;
  raise notice 'TEST 27b PASÓ: desde oportunidad activa, solo cotización reabierta.';

  -- Re-aceptar + cambiar oportunidad a perdida para 27c.
  update public.cotizaciones
     set estatus          = 'Aceptada',
         items_aceptacion = '[{"nombre":"Servicio A v3","total":1200}]'::jsonb,
         monto_aceptacion = 1200
   where id = v_cot_id;
  update public.oportunidades
     set estatus = 'perdida', etapa = 'perdido', fecha_cierre = current_date
   where id = v_op_id;

  -- ── 27c: perdida → excepción descriptiva ─────────────────────────────────
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.cleo_reabrir_cotizacion('_t27_cot');
    reset role;
    raise exception 'TEST 27c FALLÓ: reapertura desde perdida no fue rechazada';
  exception when others then
    reset role;
    if sqlerrm like '%pendiente%' or sqlerrm like '%perdida%' then
      v_paso_c := true;
      raise notice 'TEST 27c PASÓ: reapertura desde oportunidad perdida rechazada.';
    else raise; end if;
  end;

  -- ── 27d: ganada + Productos → excepción (decisión pendiente) ─────────────
  declare
    v_op_prod uuid := gen_random_uuid();
    v_cot_prod uuid;
  begin
    insert into public.oportunidades
      (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa, fecha_cierre)
      values (v_op_prod, v_neg_id, '_t27_op_prod', v_cli_id,
              'productos', 'ganada', 'convertido', current_date);
    insert into public.cotizaciones
      (negocio_id, cleo_id, cliente_id, oportunidad_id, estatus,
       items_aceptacion, monto_aceptacion)
      values (v_neg_id, '_t27_cot_prod', v_cli_id, v_op_prod, 'Aceptada',
              '[{"nombre":"Producto X","total":500}]'::jsonb, 500)
      returning id into v_cot_prod;

    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.cleo_reabrir_cotizacion('_t27_cot_prod');
      reset role;
      raise exception 'TEST 27d FALLÓ: reapertura Productos desde ganada no fue rechazada';
    exception when others then
      reset role;
      if sqlerrm like '%Productos%' or sqlerrm like '%pendiente%' then
        v_paso_d := true;
        raise notice 'TEST 27d PASÓ: reapertura Productos desde ganada rechazada.';
      else raise; end if;
    end;
  end;

  -- ── 27e: cotización sin oportunidad → solo cotización ────────────────────
  declare v_cot_libre uuid;
  begin
    insert into public.cotizaciones
      (negocio_id, cleo_id, cliente_id, estatus, items_aceptacion, monto_aceptacion)
      values (v_neg_id, '_t27_libre', v_cli_id, 'Aceptada',
              '[{"nombre":"Extra","total":200}]'::jsonb, 200)
      returning id into v_cot_libre;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.cleo_reabrir_cotizacion('_t27_libre');
    reset role;

    if (select estatus from public.cotizaciones where id = v_cot_libre)
       is distinct from 'Enviada' then
      raise exception 'TEST 27e FALLÓ: cotización libre no reabrió a Enviada.';
    end if;
    v_paso_e := true;
    raise notice 'TEST 27e PASÓ: cotización sin oportunidad reabierta correctamente.';
  end;

  raise exception '__rollback_t27__';
exception when others then
  if sqlerrm = '__rollback_t27__' then raise notice 'TEST 27: datos descartados.';
  else raise; end if;
end;
$$;


-- ── TEST 27h: concurrencia — dos sesiones intentan reabrir la misma cotización
-- ─────────────────────────────────────────────────────────────────────────────
-- Nota: este test simula la condición con un bloqueo y rollback explícito.
-- Una prueba real de concurrencia requiere dos conexiones simultáneas
-- (pg_advisory_lock o dos sesiones psql). Aquí se verifica que el FOR UPDATE
-- en la función es la barrera correcta: si la cotización ya no está 'Aceptada'
-- cuando la segunda llamada llega, la función falla limpiamente.
-- Estado: escrito como test de lógica; concurrencia real requiere herramienta externa.
do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_neg_id  uuid := gen_random_uuid();
  v_cli_id  uuid := gen_random_uuid();
  v_op_id   uuid := gen_random_uuid();
  v_cot_id  uuid;
  v_paso    boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id, 'authenticated', 'authenticated', '_t27h@cleo-test.invalid', now(), now());
  insert into public.negocios (id, user_id, nombre) values (v_neg_id, v_user_id, '_t27h_neg');
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (v_cli_id, v_neg_id, '_t27h_cli', '_t27h_cli');
  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa, fecha_cierre)
    values (v_op_id, v_neg_id, '_t27h_op', v_cli_id, 'servicios', 'ganada', 'ganado', current_date);
  insert into public.cotizaciones
    (negocio_id, cleo_id, cliente_id, oportunidad_id, estatus, items_aceptacion, monto_aceptacion)
    values (v_neg_id, '_t27h_cot', v_cli_id, v_op_id, 'Aceptada',
            '[{"n":"X"}]'::jsonb, 900)
    returning id into v_cot_id;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Primera apertura: debe tener éxito.
  perform public.cleo_reabrir_cotizacion('_t27h_cot');

  -- Segunda apertura: la cotización ya está en 'Enviada', no 'Aceptada'.
  -- La función debe fallar limpiamente con NOT FOUND.
  begin
    perform public.cleo_reabrir_cotizacion('_t27h_cot');
    reset role;
    raise exception 'TEST 27h FALLÓ: segunda apertura no fue rechazada';
  exception when others then
    reset role;
    if sqlerrm like '%no está en estado Aceptada%' or sqlerrm like '%no encontrada%' then
      v_paso := true;
      raise notice 'TEST 27h PASÓ: segunda apertura rechazada limpiamente (cotización ya no Aceptada).';
    else raise; end if;
  end;

  raise exception '__rollback_t27h__';
exception when others then
  if sqlerrm = '__rollback_t27h__' then raise notice 'TEST 27h: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 28: aislamiento de sin_clasificar frente a cancelaciones y clasificación
--   28a: UPDATE filtrado por categoria='pipeline' no afecta sin_clasificar
--   28b: UPDATE filtrado por categoria='sin_clasificar' SÍ lo afecta
--   28c: categorías explícitas (postventa, manual) también son inmunes al filtro pipeline
--   28d: la regla de supresión Hoy (WHERE pipeline + fecha<=hoy) no incluye sin_clasificar
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_neg  uuid := gen_random_uuid();
  v_usr  uuid := gen_random_uuid();
  v_cli  uuid := gen_random_uuid();
  v_op   uuid := gen_random_uuid();
  v_r_pip uuid;
  v_r_sc  uuid;
  v_r_pv  uuid;
  v_r_man uuid;
  v_cnt   int;
  v_paso_a boolean := false;
  v_paso_b boolean := false;
  v_paso_c boolean := false;
  v_paso_d boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_usr, 'authenticated', 'authenticated', '_t28@cleo-test.invalid', now(), now());
  insert into public.negocios (id, user_id, nombre) values (v_neg, v_usr, '_t28_neg');
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (v_cli, v_neg, '_t28_cli', '_t28_cli');
  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, etapa)
    values (v_op, v_neg, '_t28_op', v_cli, 'servicios', 'nuevo_contacto');

  insert into public.recordatorios (negocio_id, cliente_id, oportunidad_id, cleo_id, categoria, fecha)
    values
      (v_neg, v_cli, v_op, '_t28_pip', 'pipeline',       current_date) returning id into v_r_pip;
  insert into public.recordatorios (negocio_id, cliente_id, oportunidad_id, cleo_id, categoria, fecha)
    values
      (v_neg, v_cli, v_op, '_t28_sc',  'sin_clasificar', current_date) returning id into v_r_sc;
  insert into public.recordatorios (negocio_id, cliente_id, oportunidad_id, cleo_id, categoria, fecha)
    values
      (v_neg, v_cli, v_op, '_t28_pv',  'postventa',      current_date) returning id into v_r_pv;
  insert into public.recordatorios (negocio_id, cliente_id, oportunidad_id, cleo_id, categoria, fecha)
    values
      (v_neg, v_cli, v_op, '_t28_man', 'manual',         current_date) returning id into v_r_man;

  -- 28a: cancelarRecordatoriosPipeline (filtro: WHERE categoria='pipeline') →
  --      solo pipeline pasa a cancelado; sin_clasificar, postventa y manual intactos.
  update public.recordatorios
     set estatus = 'cancelado'
   where oportunidad_id = v_op and categoria = 'pipeline';

  if (select estatus from public.recordatorios where id = v_r_pip) is distinct from 'cancelado' then
    raise exception 'TEST 28a FALLÓ: pipeline no fue cancelado.';
  end if;
  if (select estatus from public.recordatorios where id = v_r_sc) is distinct from 'pendiente' then
    raise exception 'TEST 28a FALLÓ: sin_clasificar fue cancelado (no debería).';
  end if;
  if (select estatus from public.recordatorios where id = v_r_pv) is distinct from 'pendiente' then
    raise exception 'TEST 28a FALLÓ: postventa fue cancelado (no debería).';
  end if;
  if (select estatus from public.recordatorios where id = v_r_man) is distinct from 'pendiente' then
    raise exception 'TEST 28a FALLÓ: manual fue cancelado (no debería).';
  end if;
  v_paso_a := true;
  raise notice 'TEST 28a PASÓ: solo pipeline cancelado; sin_clasificar/postventa/manual intactos.';

  -- 28b: cancelación explícita de sin_clasificar SÍ funciona cuando se filtra
  --      específicamente (el usuario lo clasifica y cancela manualmente).
  update public.recordatorios
     set estatus = 'cancelado'
   where id = v_r_sc;
  if (select estatus from public.recordatorios where id = v_r_sc) is distinct from 'cancelado' then
    raise exception 'TEST 28b FALLÓ: sin_clasificar no pudo ser cancelado explícitamente.';
  end if;
  v_paso_b := true;
  raise notice 'TEST 28b PASÓ: sin_clasificar puede cancelarse explícitamente por el usuario.';

  -- 28c: la regla de supresión Hoy (pipeline + fecha<=hoy) no devuelve filas
  --      para sin_clasificar, postventa, ni manual.
  select count(*) into v_cnt
    from public.recordatorios
   where oportunidad_id = v_op
     and estatus        = 'pendiente'
     and fecha          <= current_date
     and categoria      = 'pipeline';
  -- Esperamos 0: el pipeline fue cancelado en 28a.
  if v_cnt is distinct from 0 then
    raise exception 'TEST 28c FALLÓ: hay % recordatorios pipeline pendientes (esperado 0).', v_cnt;
  end if;
  -- Ahora verificar que postventa y manual son pendientes pero NO entran al filtro.
  select count(*) into v_cnt
    from public.recordatorios
   where oportunidad_id = v_op
     and estatus        = 'pendiente'
     and fecha          <= current_date
     and categoria in ('postventa', 'manual');
  if v_cnt is distinct from 2 then
    raise exception 'TEST 28c FALLÓ: se esperaban 2 filas postventa+manual pendientes, encontradas %.', v_cnt;
  end if;
  v_paso_c := true;
  raise notice 'TEST 28c PASÓ: filtro pipeline no incluye postventa ni manual.';

  -- 28d: restaurar pipeline y verificar que la regla de supresión SÍ lo incluye.
  update public.recordatorios set estatus = 'pendiente' where id = v_r_pip;
  select count(*) into v_cnt
    from public.recordatorios
   where oportunidad_id = v_op
     and estatus        = 'pendiente'
     and fecha          <= current_date
     and categoria      = 'pipeline';
  if v_cnt is distinct from 1 then
    raise exception 'TEST 28d FALLÓ: se esperaba 1 fila pipeline, encontradas %.', v_cnt;
  end if;
  v_paso_d := true;
  raise notice 'TEST 28d PASÓ: regla de supresión pipeline devuelve exactamente 1 fila.';

  raise exception '__rollback_t28__';
exception when others then
  if sqlerrm = '__rollback_t28__' then raise notice 'TEST 28: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 29: barrera user_data — rechazo de escritura cuando schema_ver ≠ 'blob'
-- ══════════════════════════════════════════════════════════════════════════════
-- NOTA: el avance de schema_ver (blob → dual) solo lo puede hacer service_role
-- (protegido por trg_negocios_reserved). En este test simulamos el estado
-- avanzado modificando directamente desde postgres (sin restricción de rol).
do $$
declare
  v_usr uuid := gen_random_uuid();
  v_neg uuid := gen_random_uuid();
  v_ud  uuid;
  v_paso_a boolean := false;
  v_paso_b boolean := false;
  v_paso_c boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_usr, 'authenticated', 'authenticated', '_t29@cleo-test.invalid', now(), now());
  insert into public.negocios (id, user_id, nombre)
    values (v_neg, v_usr, '_t29_neg');
  insert into public.user_data (user_id, data)
    values (v_usr, '{"version":1}')
    returning id into v_ud;

  -- 29a: escritura con schema_ver='blob' → permitida.
  update public.user_data set data = '{"version":2}' where id = v_ud;
  if (select data->>'version' from public.user_data where id = v_ud)
     is distinct from '2' then
    raise exception 'TEST 29a FALLÓ: escritura con blob no fue persistida.';
  end if;
  v_paso_a := true;
  raise notice 'TEST 29a PASÓ: escritura con schema_ver=blob permitida.';

  -- 29b: avanzar schema_ver a 'dual' (solo posible desde postgres en el test).
  -- En producción, solo service_role puede hacer esto.
  update public.negocios set schema_ver = 'dual' where id = v_neg;

  -- 29b: UPDATE a user_data ahora debe ser rechazado.
  begin
    update public.user_data set data = '{"version":3}' where id = v_ud;
    raise exception 'TEST 29b FALLÓ: escritura con schema_ver=dual no fue rechazada';
  exception when sqlstate 'P0002' then
    v_paso_b := true;
    raise notice 'TEST 29b PASÓ: escritura rechazada con P0002 cuando schema_ver=dual.';
  end;

  -- 29c: INSERT también debe ser rechazado (no solo UPDATE).
  -- Usamos un user_id sin user_data existente simulando una inserción.
  declare v_usr2 uuid := gen_random_uuid();
  begin
    insert into auth.users (id, aud, role, email, created_at, updated_at)
      values (v_usr2, 'authenticated', 'authenticated', '_t29b@cleo-test.invalid', now(), now());
    -- Crear negocio con schema_ver='dual' directamente.
    insert into public.negocios (id, user_id, nombre, schema_ver)
      values (gen_random_uuid(), v_usr2, '_t29_neg2', 'dual');
    begin
      insert into public.user_data (user_id, data) values (v_usr2, '{"version":1}');
      raise exception 'TEST 29c FALLÓ: INSERT con schema_ver=dual no fue rechazado';
    exception when sqlstate 'P0002' then
      v_paso_c := true;
      raise notice 'TEST 29c PASÓ: INSERT rechazado con P0002 cuando schema_ver=dual.';
    end;
  end;

  raise exception '__rollback_t29__';
exception when others then
  if sqlerrm = '__rollback_t29__' then raise notice 'TEST 29: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- Resumen esperado (pruebas escritas, ninguna ejecutada todavía)
-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 24: a (5 categorías), b (invalida rechazada), c (categorías conservadas)
-- TEST 25: a (1ª cot ok), b (2ª rechazada), c (sin op ok), d (1 solo índice)
-- TEST 26: a (sin op ok), b (directo bloqueado), c (elusión bloqueada),
--          d (cascade negocio ok), e (cascade auth.users ok)
-- TEST 27: a (ganada Srv→activa), b (activa→sin cambio), c (perdida→exc),
--          d (Productos ganada→exc), e (sin op→solo cot),
--          f (pedido+pago intactos), g (snapshot archivado)
-- TEST 27h: segunda apertura rechazada limpiamente
-- TEST 28: a (pipeline cancelado, resto intacto), b (sin_clasificar cancelable
--          explícitamente), c (filtro pipeline no incluye postventa/manual),
--          d (filtro devuelve 1 fila pipeline restaurado)
-- TEST 29: a (blob ok), b (dual rechaza UPDATE), c (dual rechaza INSERT)
-- ══════════════════════════════════════════════════════════════════════════════
