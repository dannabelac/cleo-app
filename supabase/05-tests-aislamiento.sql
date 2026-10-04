-- ══════════════════════════════════════════════════════════════════════════════
-- CLEO Pruebas: pconfadsbtwjbjeblxgl.
-- BORRADOR — pruebas de aislamiento para 03-schema-relacional.sql.
-- Ejecutar DESPUÉS de 03-schema-relacional.sql.
-- Cada prueba se envuelve en ROLLBACK: no persiste datos.
--
-- PRERREQUISITOS
-- ─────────────────────────────────────────────────────────────────────────────
-- • Debe existir al menos 1 usuario en auth.users (tests 7–9).
--
-- CONTROLES NEGATIVOS (disable trigger / drop constraint)
-- ─────────────────────────────────────────────────────────────────────────────
-- Solo en base desechable aislada.  Instrucciones al final del archivo.
-- ══════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if to_regclass('public.negocios') is null then
    raise exception 'Corre 03-schema-relacional.sql primero.';
  end if;
end;
$guard$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTS 1–4: FK COMPUESTAS ENTRE NEGOCIOS
-- ══════════════════════════════════════════════════════════════════════════════

-- ── TEST 1: cotizacion.cliente_id no puede apuntar a cliente de otro negocio ──
do $$
declare
  v_neg_a  uuid := gen_random_uuid();
  v_neg_b  uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_cli_b  uuid := gen_random_uuid();
  v_paso   boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_user_a,'authenticated','authenticated','_t1a@cleo-test.invalid',now(),now()),
    (v_user_b,'authenticated','authenticated','_t1b@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre) values
    (v_neg_a, v_user_a, '_test1_neg_a'), (v_neg_b, v_user_b, '_test1_neg_b');
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (v_cli_b, v_neg_b, '_t1_cli_b', '_test1_cli_b');

  -- Control positivo: cotización sin cliente → siempre permitido.
  insert into public.cotizaciones (negocio_id, cleo_id) values (v_neg_a, '_t1_ctrl');
  raise notice 'TEST 1 ctrl+: cotización sin cliente_id permitida.';

  -- Prueba principal.
  insert into public.cotizaciones (negocio_id, cliente_id, cleo_id)
    values (v_neg_a, v_cli_b, '_t1_cross');

  begin
    set constraints all immediate;
  exception when foreign_key_violation then
    v_paso := true;
    raise notice 'TEST 1 PASÓ: FK cruzada cotización→cliente detectada.';
  end;

  if not v_paso then
    raise exception 'TEST 1 FALLÓ: referencia cruzada no fue rechazada';
  end if;

  raise exception '__rollback_p1__';
exception when others then
  if sqlerrm = '__rollback_p1__' then raise notice 'TEST 1: datos descartados.';
  else raise; end if;
end;
$$;


-- ── TEST 2: pedido.cliente_id no puede apuntar a cliente de otro negocio ──────
do $$
declare
  v_neg_a  uuid := gen_random_uuid();
  v_neg_b  uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_cli_b  uuid := gen_random_uuid();
  v_paso   boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_user_a,'authenticated','authenticated','_t2a@cleo-test.invalid',now(),now()),
    (v_user_b,'authenticated','authenticated','_t2b@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre) values
    (v_neg_a, v_user_a, '_test2_neg_a'), (v_neg_b, v_user_b, '_test2_neg_b');
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (v_cli_b, v_neg_b, '_t2_cli_b', '_test2_cli_b');

  insert into public.pedidos (negocio_id, cleo_id, monto_total)
    values (v_neg_a, '_t2_ctrl', 0);
  raise notice 'TEST 2 ctrl+: pedido sin cliente_id permitido.';

  insert into public.pedidos (negocio_id, cliente_id, cleo_id, monto_total)
    values (v_neg_a, v_cli_b, '_t2_cross', 0);

  begin
    set constraints all immediate;
  exception when foreign_key_violation then
    v_paso := true;
    raise notice 'TEST 2 PASÓ: FK cruzada pedido→cliente detectada.';
  end;

  if not v_paso then
    raise exception 'TEST 2 FALLÓ: referencia cruzada no fue rechazada';
  end if;

  raise exception '__rollback_p2__';
exception when others then
  if sqlerrm = '__rollback_p2__' then raise notice 'TEST 2: datos descartados.';
  else raise; end if;
end;
$$;


-- ── TEST 3: pago no puede referenciar cotización de otro negocio ──────────────
do $$
declare
  v_neg_a  uuid := gen_random_uuid();
  v_neg_b  uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_cot_a  uuid := gen_random_uuid();
  v_cot_b  uuid := gen_random_uuid();
  v_paso   boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_user_a,'authenticated','authenticated','_t3a@cleo-test.invalid',now(),now()),
    (v_user_b,'authenticated','authenticated','_t3b@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre) values
    (v_neg_a, v_user_a, '_test3_neg_a'), (v_neg_b, v_user_b, '_test3_neg_b');
  insert into public.cotizaciones (id, negocio_id, cleo_id) values
    (v_cot_a, v_neg_a, '_t3_cot_a'), (v_cot_b, v_neg_b, '_t3_cot_b');

  -- Control positivo: pago con cotización propia.
  insert into public.pagos (negocio_id, cotizacion_id, cleo_id, monto, fecha)
    values (v_neg_a, v_cot_a, '_t3_ctrl', 100, now());
  raise notice 'TEST 3 ctrl+: pago con cotización propia permitido.';

  -- Prueba principal.
  insert into public.pagos (negocio_id, cotizacion_id, cleo_id, monto, fecha)
    values (v_neg_a, v_cot_b, '_t3_cross', 100, now());

  begin
    set constraints all immediate;
  exception when foreign_key_violation then
    v_paso := true;
    raise notice 'TEST 3 PASÓ: FK cruzada pago→cotización detectada.';
  end;

  if not v_paso then
    raise exception 'TEST 3 FALLÓ: pago con cotización de otro negocio no fue rechazado';
  end if;

  raise exception '__rollback_p3__';
exception when others then
  if sqlerrm = '__rollback_p3__' then raise notice 'TEST 3: datos descartados.';
  else raise; end if;
end;
$$;


-- ── TEST 4: historial_contactos no puede referenciar cliente de otro negocio ──
do $$
declare
  v_neg_a  uuid := gen_random_uuid();
  v_neg_b  uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_cli_a  uuid := gen_random_uuid();
  v_cli_b  uuid := gen_random_uuid();
  v_paso   boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (v_user_a,'authenticated','authenticated','_t4a@cleo-test.invalid',now(),now()),
    (v_user_b,'authenticated','authenticated','_t4b@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre) values
    (v_neg_a, v_user_a, '_test4_neg_a'), (v_neg_b, v_user_b, '_test4_neg_b');
  insert into public.clientes (id, negocio_id, cleo_id, nombre) values
    (v_cli_a, v_neg_a, '_t4_cli_a', '_test4_cli_a'),
    (v_cli_b, v_neg_b, '_t4_cli_b', '_test4_cli_b');

  -- Control positivo: historial con cliente propio.
  insert into public.historial_contactos (negocio_id, cliente_id, tipo, descripcion)
    values (v_neg_a, v_cli_a, 'contacto', '_t4_ctrl');
  raise notice 'TEST 4 ctrl+: historial con cliente propio permitido.';

  -- Prueba principal.
  insert into public.historial_contactos (negocio_id, cliente_id, tipo, descripcion)
    values (v_neg_a, v_cli_b, 'contacto', '_t4_cross');

  begin
    set constraints all immediate;
  exception when foreign_key_violation then
    v_paso := true;
    raise notice 'TEST 4 PASÓ: FK cruzada historial→cliente detectada.';
  end;

  if not v_paso then
    raise exception 'TEST 4 FALLÓ: historial con cliente de otro negocio no fue rechazado';
  end if;

  raise exception '__rollback_p4__';
exception when others then
  if sqlerrm = '__rollback_p4__' then raise notice 'TEST 4: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 5: SNAPSHOTS DE COTIZACIÓN — inmutabilidad + ciclo de reapertura
-- Verifica:
--   5a. valor→NULL directo BLOQUEADO (también para el propietario)
--   5b. valor→valor_diferente directo BLOQUEADO
--   5c. cleo_reabrir_cotizacion() archiva el snapshot y lo limpia atómicamente
--   5d. estructura de versiones_aceptacion: jsonb array, campos exactos
--   5e. re-aceptación posterior funciona (NULL→valor permitido)
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id   uuid := gen_random_uuid();
  v_neg_id    uuid := gen_random_uuid();
  v_cot_id    uuid;
  v_vers      jsonb;
  v_entrada   jsonb;
  v_paso_a    boolean := false;
  v_paso_b    boolean := false;
  v_paso_c    boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id,'authenticated','authenticated','_t5@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre)
    values (v_neg_id, v_user_id, '_test5_neg');
  insert into public.cotizaciones
    (negocio_id, cleo_id, estatus, items_aceptacion, monto_aceptacion)
    values (v_neg_id, '_t5_cot', 'Aceptada',
            '[{"nombre":"Diseño","total":500}]'::jsonb, 500)
    returning id into v_cot_id;

  -- Control positivo: UPDATE de campo no protegido → permitido.
  update public.cotizaciones set notas = 'nota ok' where id = v_cot_id;
  raise notice 'TEST 5 ctrl+: UPDATE de notas permitido.';

  -- ── 5a: valor→NULL directo BLOQUEADO ──────────────────────────────────────
  begin
    update public.cotizaciones set items_aceptacion = null where id = v_cot_id;
  exception when others then
    if sqlerrm like '%inmutable%' or sqlerrm like '%items_aceptacion%' then
      v_paso_a := true;
      raise notice 'TEST 5a PASÓ: valor→NULL directo bloqueado.';
    else raise; end if;
  end;
  if not v_paso_a then
    raise exception 'TEST 5a FALLÓ: items_aceptacion=NULL directo no fue rechazado';
  end if;

  -- ── 5b: valor→valor_diferente directo BLOQUEADO ───────────────────────────
  begin
    update public.cotizaciones
       set items_aceptacion = '[{"nombre":"Nuevo"}]'::jsonb where id = v_cot_id;
  exception when others then
    if sqlerrm like '%inmutable%' or sqlerrm like '%items_aceptacion%' then
      v_paso_b := true;
      raise notice 'TEST 5b PASÓ: valor→valor_diferente directo bloqueado.';
    else raise; end if;
  end;
  if not v_paso_b then
    raise exception 'TEST 5b FALLÓ: items_aceptacion→valor_diferente no fue rechazado';
  end if;

  -- ── 5c/5d: cleo_reabrir_cotizacion() — ciclo completo + estructura ────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  perform public.cleo_reabrir_cotizacion('_t5_cot');

  reset role;

  -- Verificar estructura exacta de versiones_aceptacion.
  select versiones_aceptacion into v_vers
    from public.cotizaciones where id = v_cot_id;

  -- Debe ser jsonb array con exactamente 1 elemento.
  if jsonb_typeof(v_vers) <> 'array' then
    raise exception 'TEST 5d FALLÓ: versiones_aceptacion no es un array JSON (tipo: %).', jsonb_typeof(v_vers);
  end if;
  if jsonb_array_length(v_vers) <> 1 then
    raise exception 'TEST 5d FALLÓ: versiones_aceptacion debe tener 1 elemento, tiene %.', jsonb_array_length(v_vers);
  end if;

  v_entrada := v_vers->0;
  if (v_entrada->>'monto')::numeric is distinct from 500 then
    raise exception 'TEST 5d FALLÓ: monto archivado es %, esperado 500.', v_entrada->>'monto';
  end if;
  if v_entrada->'items' is null then
    raise exception 'TEST 5d FALLÓ: campo "items" falta en la entrada archivada.';
  end if;
  if v_entrada->>'en' is null then
    raise exception 'TEST 5d FALLÓ: campo "en" (timestamp) falta en la entrada archivada.';
  end if;
  raise notice 'TEST 5d PASÓ: versiones_aceptacion es array JSON con estructura correcta.';

  -- items_aceptacion debe ser NULL tras reapertura.
  if (select items_aceptacion from public.cotizaciones where id = v_cot_id) is not null then
    raise exception 'TEST 5c FALLÓ: items_aceptacion no fue limpiado.';
  end if;

  -- ── 5e: re-aceptación (NULL→valor, siempre permitido) ─────────────────────
  update public.cotizaciones
     set items_aceptacion = '[{"nombre":"Diseño v2","total":600}]'::jsonb,
         monto_aceptacion = 600,
         estatus          = 'Aceptada'
   where id = v_cot_id;
  raise notice 'TEST 5e PASÓ: re-aceptación tras reapertura funcionó.';
  v_paso_c := true;

  if not v_paso_c then
    raise exception 'TEST 5 FALLÓ inesperadamente en 5e';
  end if;

  raise exception '__rollback_p5__';
exception when others then
  if sqlerrm = '__rollback_p5__' then raise notice 'TEST 5: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 6: SNAPSHOTS DE PEDIDO — misma mecánica que test 5
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_neg_id  uuid := gen_random_uuid();
  v_ped_id  uuid;
  v_vers    jsonb;
  v_entrada jsonb;
  v_paso_a  boolean := false;
  v_paso_b  boolean := false;
  v_paso_c  boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id,'authenticated','authenticated','_t6@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre)
    values (v_neg_id, v_user_id, '_test6_neg');
  insert into public.pedidos
    (negocio_id, cleo_id, estado_pedido, items_confirmacion, monto_confirmacion, monto_total)
    values (v_neg_id, '_t6_ped', 'entregado',
            '[{"nombre":"Producto A","total":300}]'::jsonb, 300, 300)
    returning id into v_ped_id;

  -- ── 6a: valor→NULL directo BLOQUEADO ──────────────────────────────────────
  begin
    update public.pedidos set items_confirmacion = null where id = v_ped_id;
  exception when others then
    if sqlerrm like '%inmutable%' or sqlerrm like '%items_confirmacion%' then
      v_paso_a := true;
      raise notice 'TEST 6a PASÓ: valor→NULL directo bloqueado.';
    else raise; end if;
  end;
  if not v_paso_a then
    raise exception 'TEST 6a FALLÓ: items_confirmacion=NULL no fue rechazado';
  end if;

  -- ── 6b: valor→valor_diferente directo BLOQUEADO ───────────────────────────
  begin
    update public.pedidos
       set items_confirmacion = '[{"nombre":"Nuevo"}]'::jsonb where id = v_ped_id;
  exception when others then
    if sqlerrm like '%inmutable%' or sqlerrm like '%items_confirmacion%' then
      v_paso_b := true;
      raise notice 'TEST 6b PASÓ: valor→valor_diferente directo bloqueado.';
    else raise; end if;
  end;
  if not v_paso_b then
    raise exception 'TEST 6b FALLÓ: items_confirmacion→valor_diferente no fue rechazado';
  end if;

  -- ── 6c/6d: ciclo completo + estructura ────────────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  perform public.cleo_reabrir_pedido('_t6_ped');

  reset role;

  select versiones_confirmacion into v_vers from public.pedidos where id = v_ped_id;

  if jsonb_typeof(v_vers) <> 'array' then
    raise exception 'TEST 6d FALLÓ: versiones_confirmacion no es array JSON.';
  end if;
  if jsonb_array_length(v_vers) <> 1 then
    raise exception 'TEST 6d FALLÓ: versiones_confirmacion debe tener 1 elemento, tiene %.', jsonb_array_length(v_vers);
  end if;
  v_entrada := v_vers->0;
  if (v_entrada->>'monto')::numeric is distinct from 300 then
    raise exception 'TEST 6d FALLÓ: monto archivado %, esperado 300.', v_entrada->>'monto';
  end if;
  if v_entrada->'items' is null or v_entrada->>'en' is null then
    raise exception 'TEST 6d FALLÓ: campos "items" o "en" faltan.';
  end if;
  raise notice 'TEST 6d PASÓ: versiones_confirmacion con estructura correcta.';

  update public.pedidos
     set items_confirmacion = '[{"nombre":"Producto A v2","total":350}]'::jsonb,
         monto_confirmacion  = 350,
         estado_pedido       = 'entregado'
   where id = v_ped_id;
  raise notice 'TEST 6e PASÓ: re-confirmación tras reapertura funcionó.';
  v_paso_c := true;

  if not v_paso_c then
    raise exception 'TEST 6 FALLÓ inesperadamente en 6e';
  end if;

  raise exception '__rollback_p6__';
exception when others then
  if sqlerrm = '__rollback_p6__' then raise notice 'TEST 6: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TESTS 7–9: PROTECCIÓN DE CAMPOS RESERVADOS Y PERMISOS
-- 'TEST FALLÓ' siempre fuera del bloque que captura el rechazo esperado.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── TEST 7: authenticated no puede crear negocio con schema_ver ≠ 'blob' ──────
do $$
declare
  v_user_id uuid;
  v_neg_id  uuid;
  v_paso    boolean := false;
begin
  select id into v_user_id from auth.users limit 1;
  if v_user_id is null then
    raise exception 'PRERREQUISITO TEST 7: necesita al menos 1 usuario en auth.users.';
  end if;

  insert into public.negocios (id, user_id, nombre, schema_ver)
    values (gen_random_uuid(), v_user_id, '_test7_ctrl', 'blob')
    returning id into v_neg_id;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Control positivo A: negocio visible.
  if not exists (select 1 from public.negocios where id = v_neg_id) then
    raise exception 'TEST 7 ctrl+ FALLÓ: negocio no visible para authenticated.';
  end if;
  raise notice 'TEST 7 ctrl+A: negocio visible para authenticated.';

  -- Control positivo B: INSERT con schema_ver='blob' → permitido.
  begin
    insert into public.negocios (user_id, nombre, schema_ver)
      values (v_user_id, '_test7_blob_ok', 'blob');
    raise notice 'TEST 7 ctrl+B: INSERT schema_ver=blob permitido.';
  exception when unique_violation then
    raise notice 'TEST 7 ctrl+B: unique(user_id) ya existe (no es error del trigger).';
  end;

  -- Prueba principal: INSERT schema_ver='dual' → BLOQUEADO.
  begin
    insert into public.negocios (user_id, nombre, schema_ver)
      values (v_user_id, '_test7_dual_fail', 'dual');
  exception when others then
    if sqlerrm like '%blob%' or sqlerrm like '%schema_ver%' then
      v_paso := true;
      raise notice 'TEST 7 PASÓ: INSERT con schema_ver=dual bloqueado.';
    else raise; end if;
  end;

  reset role;

  if not v_paso then
    raise exception 'TEST 7 FALLÓ: INSERT con schema_ver=dual no fue bloqueado';
  end if;

  raise exception '__rollback_p7__';
exception when others then
  if sqlerrm = '__rollback_p7__' then raise notice 'TEST 7: datos descartados.';
  else raise; end if;
end;
$$;


-- ── TEST 8: authenticated no puede cambiar schema_ver de negocio existente ────
do $$
declare
  v_user_id uuid;
  v_neg_id  uuid;
  v_paso    boolean := false;
begin
  select id into v_user_id from auth.users limit 1;
  if v_user_id is null then
    raise exception 'PRERREQUISITO TEST 8: necesita al menos 1 usuario en auth.users.';
  end if;

  insert into public.negocios (id, user_id, nombre, schema_ver)
    values (gen_random_uuid(), v_user_id, '_test8_neg', 'blob')
    returning id into v_neg_id;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Control positivo A: negocio visible.
  if not exists (select 1 from public.negocios where id = v_neg_id) then
    raise exception 'TEST 8 ctrl+ FALLÓ: negocio no visible para authenticated.';
  end if;
  raise notice 'TEST 8 ctrl+A: negocio visible.';

  -- Control positivo B: UPDATE de nombre → permitido.
  update public.negocios set nombre = '_test8_renombrado' where id = v_neg_id;
  raise notice 'TEST 8 ctrl+B: UPDATE de nombre permitido.';

  -- Prueba principal: UPDATE schema_ver → BLOQUEADO.
  begin
    update public.negocios set schema_ver = 'dual' where id = v_neg_id;
  exception when others then
    if sqlerrm like '%schema_ver%' or sqlerrm like '%reservado%' or sqlerrm like '%migración%' then
      v_paso := true;
      raise notice 'TEST 8 PASÓ: cambio de schema_ver bloqueado para authenticated.';
    else raise; end if;
  end;

  reset role;

  if not v_paso then
    raise exception 'TEST 8 FALLÓ: authenticated pudo cambiar schema_ver';
  end if;

  -- Control positivo C: postgres (service_role) SÍ puede cambiar schema_ver.
  update public.negocios set schema_ver = 'dual' where id = v_neg_id;
  raise notice 'TEST 8 ctrl+C: postgres puede cambiar schema_ver (OK).';

  raise exception '__rollback_p8__';
exception when others then
  if sqlerrm = '__rollback_p8__' then raise notice 'TEST 8: datos descartados.';
  else raise; end if;
end;
$$;


-- ── TEST 9: authenticated no puede UPDATE en historial_contactos ──────────────
do $$
declare
  v_user_id uuid;
  v_neg_id  uuid;
  v_cli_id  uuid;
  v_hist_id uuid;
  v_paso    boolean := false;
begin
  select id into v_user_id from auth.users limit 1;
  if v_user_id is null then
    raise exception 'PRERREQUISITO TEST 9: necesita al menos 1 usuario en auth.users.';
  end if;

  insert into public.negocios (id, user_id, nombre)
    values (gen_random_uuid(), v_user_id, '_test9_neg')
    returning id into v_neg_id;
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (gen_random_uuid(), v_neg_id, '_t9_cli', '_test9_cli')
    returning id into v_cli_id;
  insert into public.historial_contactos (negocio_id, cliente_id, tipo, descripcion)
    values (v_neg_id, v_cli_id, 'contacto', '_t9_entrada_orig')
    returning id into v_hist_id;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Control positivo A: registro visible.
  if not exists (select 1 from public.historial_contactos where id = v_hist_id) then
    raise exception 'TEST 9 ctrl+ FALLÓ: historial no visible para authenticated.';
  end if;
  raise notice 'TEST 9 ctrl+A: historial visible.';

  -- Control positivo B: INSERT nuevo registro → permitido.
  insert into public.historial_contactos (negocio_id, cliente_id, tipo, descripcion)
    values (v_neg_id, v_cli_id, 'contacto', '_t9_nueva');
  raise notice 'TEST 9 ctrl+B: INSERT de historial permitido.';

  -- Prueba principal: UPDATE → BLOQUEADO.
  begin
    update public.historial_contactos
       set descripcion = '_t9_modificado' where id = v_hist_id;
  exception
    when insufficient_privilege then
      v_paso := true;
      raise notice 'TEST 9 PASÓ: UPDATE bloqueado (insufficient_privilege).';
    when others then
      if sqlerrm like '%permission%' or sqlerrm like '%privilege%' then
        v_paso := true;
        raise notice 'TEST 9 PASÓ: UPDATE bloqueado. %', sqlerrm;
      else raise; end if;
  end;

  reset role;

  if not v_paso then
    raise exception 'TEST 9 FALLÓ: authenticated pudo hacer UPDATE en historial_contactos';
  end if;

  raise exception '__rollback_p9__';
exception when others then
  if sqlerrm = '__rollback_p9__' then raise notice 'TEST 9: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 10: CASCADE DELETE
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_neg_id  uuid := gen_random_uuid();
  v_cli_id  uuid := gen_random_uuid();
  v_cot_id  uuid := gen_random_uuid();
  v_paso    boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id,'authenticated','authenticated','_t10@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre) values (v_neg_id, v_user_id, '_test10_neg');
  insert into public.clientes (id, negocio_id, cleo_id, nombre) values (v_cli_id, v_neg_id, '_t10_cli', '_test10_cli');
  insert into public.cotizaciones (id, negocio_id, cliente_id, cleo_id)
    values (v_cot_id, v_neg_id, v_cli_id, '_t10_cot');
  insert into public.historial_contactos (negocio_id, cliente_id, tipo, descripcion)
    values (v_neg_id, v_cli_id, 'contacto', '_t10_hist');

  delete from public.negocios where id = v_neg_id;

  if exists (select 1 from public.clientes           where negocio_id = v_neg_id)
  or exists (select 1 from public.cotizaciones       where negocio_id = v_neg_id)
  or exists (select 1 from public.historial_contactos where negocio_id = v_neg_id)
  then
    raise exception 'TEST 10 FALLÓ: registros hijo no fueron eliminados con el negocio.';
  end if;

  raise notice 'TEST 10 PASÓ: cascade delete correcto.';
  v_paso := true;

  if not v_paso then raise exception 'TEST 10 FALLÓ inesperadamente'; end if;

  raise exception '__rollback_p10__';
exception when others then
  if sqlerrm = '__rollback_p10__' then raise notice 'TEST 10: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 11: HISTORIAL PROTEGIDO CONTRA MODIFICACIÓN DIRECTA
-- El propietario del negocio NO puede vaciar ni sobreescribir versiones_aceptacion.
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id   uuid := gen_random_uuid();
  v_neg_id    uuid := gen_random_uuid();
  v_cot_id    uuid;
  v_paso_a    boolean := false;  -- vaciar historial bloqueado
  v_paso_b    boolean := false;  -- sobreescribir historial bloqueado
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id,'authenticated','authenticated','_t11@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre)
    values (v_neg_id, v_user_id, '_test11_neg');

  -- Cotización con un snapshot ya archivado (como si ya se hubiera reabierto antes).
  insert into public.cotizaciones
    (negocio_id, cleo_id, estatus, items_aceptacion, monto_aceptacion,
     versiones_aceptacion)
    values (v_neg_id, '_t11_cot', 'Aceptada',
            '[{"nombre":"Diseño","total":500}]'::jsonb, 500,
            '[{"items":[{"nombre":"Borrador","total":200}],"monto":200,"en":"2024-01-01T00:00:00Z"}]'::jsonb)
    returning id into v_cot_id;

  -- Simular sesión de propietario (authenticated).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ── 11a: vaciar versiones_aceptacion → BLOQUEADO ──────────────────────────
  begin
    update public.cotizaciones
       set versiones_aceptacion = '[]'::jsonb where id = v_cot_id;
  exception when others then
    if sqlerrm like '%versiones_aceptacion%' or sqlerrm like '%solo lectura%' then
      v_paso_a := true;
      raise notice 'TEST 11a PASÓ: vaciar versiones_aceptacion directo bloqueado.';
    else raise; end if;
  end;
  if not v_paso_a then
    raise exception 'TEST 11a FALLÓ: propietario pudo vaciar versiones_aceptacion';
  end if;

  -- ── 11b: sobreescribir versiones_aceptacion con datos falsos → BLOQUEADO ──
  begin
    update public.cotizaciones
       set versiones_aceptacion = '[{"items":[],"monto":0,"en":"2000-01-01"}]'::jsonb
     where id = v_cot_id;
  exception when others then
    if sqlerrm like '%versiones_aceptacion%' or sqlerrm like '%solo lectura%' then
      v_paso_b := true;
      raise notice 'TEST 11b PASÓ: sobreescribir versiones_aceptacion bloqueado.';
    else raise; end if;
  end;
  if not v_paso_b then
    raise exception 'TEST 11b FALLÓ: propietario pudo sobreescribir versiones_aceptacion';
  end if;

  reset role;

  raise exception '__rollback_p11__';
exception when others then
  if sqlerrm = '__rollback_p11__' then raise notice 'TEST 11: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 12: BLOQUEO DE ATAQUES AL MECANISMO DE AUTORIZACIÓN
--
-- NOTA SOBRE EL MODELO DE SESIÓN
-- Este test simula la forma en que PostgREST gestiona las peticiones: la
-- conexión subyacente es de postgres (o authenticator), que hace SET LOCAL ROLE
-- authenticated antes de cada transacción.  session_user sigue siendo el rol
-- de conexión; current_user pasa a ser authenticated.
-- Esto NO es equivalente a una conexión que originó directamente como un rol
-- restringido (que en Supabase no es posible: authenticated tiene NOLOGIN).
-- Lo que estos tests sí verifican:
--   12a. El trigger bloquea el UPDATE directo cuando current_user='authenticated'.
--   12b. authenticated no puede hacer SET ROLE cleo_service (que sería el único
--        escalamiento relevante para este mecanismo de autorización).
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_neg_id  uuid := gen_random_uuid();
  v_cot_id  uuid;
  v_paso_a  boolean := false;
  v_paso_b  boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id,'authenticated','authenticated','_t12@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre)
    values (v_neg_id, v_user_id, '_test12_neg');
  insert into public.cotizaciones
    (negocio_id, cleo_id, estatus, items_aceptacion, monto_aceptacion)
    values (v_neg_id, '_t12_cot', 'Aceptada',
            '[{"nombre":"Item","total":100}]'::jsonb, 100)
    returning id into v_cot_id;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ── 12a: UPDATE directo de items_aceptacion → BLOQUEADO ───────────────────
  -- Verifica que el trigger rechaza la operación cuando current_user='authenticated'.
  begin
    update public.cotizaciones set items_aceptacion = null where id = v_cot_id;
  exception when others then
    if sqlerrm like '%inmutable%' or sqlerrm like '%items_aceptacion%' then
      v_paso_a := true;
      raise notice 'TEST 12a PASÓ: UPDATE directo bloqueado (current_user=authenticated).';
    else raise; end if;
  end;
  if not v_paso_a then
    raise exception 'TEST 12a FALLÓ: authenticated pudo limpiar items_aceptacion';
  end if;

  -- ── 12b: authenticated sin acceso a cleo_service (directo ni transitivo) ────
  -- La garantía real: en una sesión PostgREST (session_user=authenticated),
  -- SET ROLE cleo_service falla porque authenticated no tiene esa membresía.
  -- No usamos SET ROLE aquí: session_user sigue siendo postgres, que SÍ tiene
  -- cleo_service concedido (para ALTER FUNCTION OWNER), y el intento daría
  -- un falso positivo.
  -- CTE recursiva para detectar membresías transitivas (authenticated→X→cleo_service
  -- también habilitaría el escalamiento).
  -- NOTA: este test verifica la configuración de roles en la base de datos, no el
  -- comportamiento real de la API. El acceso real vía PostgREST debe verificarse
  -- por separado con una llamada a la API una vez ejecutado el schema.
  if exists (
    with recursive miembros_de_cleo_service as (
      select m.member as roleid
        from pg_auth_members m
        join pg_roles r on r.oid = m.roleid
       where r.rolname = 'cleo_service'
      union
      select m.member
        from pg_auth_members m
        join miembros_de_cleo_service p on p.roleid = m.roleid
    )
    select 1 from miembros_de_cleo_service mc
      join pg_roles r on r.oid = mc.roleid
     where r.rolname = 'authenticated'
  ) then
    raise exception
      'TEST 12b FALLÓ: authenticated tiene acceso a cleo_service (directo o transitivo)';
  end if;
  v_paso_b := true;
  raise notice 'TEST 12b PASÓ: authenticated sin acceso a cleo_service (directo ni transitivo).';
  -- postgres sí es miembro de cleo_service (requerido para ALTER FUNCTION OWNER);
  -- solo se verifica que authenticated no tenga ese vínculo.

  reset role;

  raise exception '__rollback_p12__';
exception when others then
  if sqlerrm = '__rollback_p12__' then raise notice 'TEST 12: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 13 (SERIAL): INVARIANTE POST-COMMIT DE REAPERTURA DOBLE
--
-- QUÉ PRUEBA ESTE TEST
-- Una sola transacción hace dos llamadas consecutivas a cleo_reabrir_cotizacion.
-- Verifica el invariante del estado post-commit: después de un reopen exitoso la
-- cotización queda en 'Enviada' y el segundo intento es rechazado limpiamente.
-- Resultado esperado: exactamente 1 entrada en versiones_aceptacion.
--
-- QUÉ NO PRUEBA ESTE TEST
-- No verifica el comportamiento bajo concurrencia real (dos transacciones
-- simultáneas en sesiones distintas).  Dentro de una sola sesión no hay
-- conflicto de bloqueo: el FOR UPDATE solo es observable desde una segunda
-- conexión que compita por la misma fila mientras la primera aún no hizo commit.
--
-- PARA VERIFICAR EL FOR UPDATE: ver sección al final del archivo
-- "PRUEBA REAL CON DOS CONEXIONES (TEST 13-CONCURRENTE)".
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id   uuid := gen_random_uuid();
  v_neg_id    uuid := gen_random_uuid();
  v_cot_id    uuid;
  v_vers      jsonb;
  v_segundo   boolean := false;  -- el segundo reopen debe fallar
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id,'authenticated','authenticated','_t13@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre)
    values (v_neg_id, v_user_id, '_test13_neg');
  insert into public.cotizaciones
    (negocio_id, cleo_id, estatus, items_aceptacion, monto_aceptacion)
    values (v_neg_id, '_t13_cot', 'Aceptada',
            '[{"nombre":"Servicio","total":750}]'::jsonb, 750)
    returning id into v_cot_id;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Primer reopen → debe pasar.
  perform public.cleo_reabrir_cotizacion('_t13_cot');
  raise notice 'TEST 13: primer reopen exitoso.';

  -- Segundo reopen → debe fallar (estatus ya es Enviada, no Aceptada).
  begin
    perform public.cleo_reabrir_cotizacion('_t13_cot');
    -- Si llega aquí: el FOR UPDATE o la condición fallaron.
  exception when others then
    if sqlerrm like '%Aceptada%' or sqlerrm like '%no encontrada%' then
      v_segundo := true;
      raise notice 'TEST 13 PASÓ: segundo reopen rechazado correctamente.';
    else raise; end if;
  end;

  reset role;

  if not v_segundo then
    raise exception 'TEST 13 FALLÓ: segundo reopen no fue rechazado';
  end if;

  -- Verificar que versiones_aceptacion tiene EXACTAMENTE 1 entrada (no 2).
  select versiones_aceptacion into v_vers
    from public.cotizaciones where id = v_cot_id;

  if jsonb_array_length(v_vers) <> 1 then
    raise exception
      'TEST 13 FALLÓ: versiones_aceptacion tiene % entradas, esperado 1 (doble-archivo).',
      jsonb_array_length(v_vers);
  end if;
  raise notice 'TEST 13: versiones_aceptacion tiene exactamente 1 entrada.';

  raise exception '__rollback_p13__';
exception when others then
  if sqlerrm = '__rollback_p13__' then raise notice 'TEST 13: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 14: COMBINACIONES MODO × ESTATUS × ETAPA EN OPORTUNIDADES
-- 14a/14d: combinaciones válidas (controles positivos).
-- 14b/14c/14e: combinaciones inválidas bloqueadas por trg_oportunidades_etapa_modo.
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id  uuid := gen_random_uuid();
  v_neg_id   uuid := gen_random_uuid();
  v_cli_id   uuid := gen_random_uuid();
  v_op_id    uuid;
  v_paso_b   boolean := false;
  v_paso_c   boolean := false;
  v_paso_e   boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id,'authenticated','authenticated','_t14@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre) values (v_neg_id, v_user_id, '_test14_neg');
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (v_cli_id, v_neg_id, '_t14_cli', '_test14_cli');

  -- ── 14a: Servicios activa, etapa válida → DEBE PASAR ─────────────────────
  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa)
    values (gen_random_uuid(), v_neg_id, '_t14_op_a', v_cli_id, 'servicios', 'activa', 'cotizacion_enviada')
    returning id into v_op_id;
  raise notice 'TEST 14a PASÓ: Servicios activa/cotizacion_enviada permitida.';

  -- ── 14b: Servicios con etapa de Productos → BLOQUEADO ────────────────────
  begin
    insert into public.oportunidades
      (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa)
      values (gen_random_uuid(), v_neg_id, '_t14_op_b', v_cli_id, 'servicios', 'activa', 'nueva');
  exception when others then
    if sqlerrm like '%no es válida para modo ''servicios''%' then
      v_paso_b := true;
      raise notice 'TEST 14b PASÓ: etapa de Productos rechazada en Servicios.';
    else raise; end if;
  end;
  if not v_paso_b then
    raise exception 'TEST 14b FALLÓ: etapa ''nueva'' aceptada en modo servicios';
  end if;

  -- ── 14c: Servicios estatus ganada con etapa incorrecta → BLOQUEADO ────────
  begin
    insert into public.oportunidades
      (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa)
      values (gen_random_uuid(), v_neg_id, '_t14_op_c', v_cli_id, 'servicios', 'ganada', 'cotizacion_enviada');
  exception when others then
    if sqlerrm like '%requiere etapa ''ganado''%' then
      v_paso_c := true;
      raise notice 'TEST 14c PASÓ: estatus ganada con etapa incorrecta rechazado (servicios).';
    else raise; end if;
  end;
  if not v_paso_c then
    raise exception 'TEST 14c FALLÓ: estatus ganada + etapa cotizacion_enviada aceptados';
  end if;

  -- ── 14d: Productos ganada, etapa convertido → DEBE PASAR ─────────────────
  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa)
    values (gen_random_uuid(), v_neg_id, '_t14_op_d', v_cli_id, 'productos', 'ganada', 'convertido');
  raise notice 'TEST 14d PASÓ: Productos ganada/convertido permitida.';

  -- ── 14e: Productos ganada con etapa incorrecta → BLOQUEADO ───────────────
  begin
    insert into public.oportunidades
      (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa)
      values (gen_random_uuid(), v_neg_id, '_t14_op_e', v_cli_id, 'productos', 'ganada', 'nueva');
  exception when others then
    if sqlerrm like '%requiere etapa ''convertido''%' then
      v_paso_e := true;
      raise notice 'TEST 14e PASÓ: estatus ganada con etapa nueva rechazado (productos).';
    else raise; end if;
  end;
  if not v_paso_e then
    raise exception 'TEST 14e FALLÓ: estatus ganada + etapa nueva aceptados en productos';
  end if;

  raise exception '__rollback_p14__';
exception when others then
  if sqlerrm = '__rollback_p14__' then raise notice 'TEST 14: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 15: INMUTABILIDAD DE cliente_id Y modo EN OPORTUNIDADES
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id  uuid := gen_random_uuid();
  v_neg_id   uuid := gen_random_uuid();
  v_cli_a    uuid := gen_random_uuid();
  v_cli_b    uuid := gen_random_uuid();
  v_op_id    uuid;
  v_paso_a   boolean := false;
  v_paso_b   boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id,'authenticated','authenticated','_t15@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre) values (v_neg_id, v_user_id, '_test15_neg');
  insert into public.clientes (id, negocio_id, cleo_id, nombre) values
    (v_cli_a, v_neg_id, '_t15_cli_a', '_test15_cli_a'),
    (v_cli_b, v_neg_id, '_t15_cli_b', '_test15_cli_b');

  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa)
    values (gen_random_uuid(), v_neg_id, '_t15_op', v_cli_a, 'servicios', 'activa', 'nuevo_contacto')
    returning id into v_op_id;

  -- ── 15a: cambiar cliente_id → BLOQUEADO ──────────────────────────────────
  begin
    update public.oportunidades set cliente_id = v_cli_b where id = v_op_id;
  exception when others then
    if sqlerrm like '%cliente_id es inmutable%' then
      v_paso_a := true;
      raise notice 'TEST 15a PASÓ: cliente_id inmutable en oportunidades.';
    else raise; end if;
  end;
  if not v_paso_a then
    raise exception 'TEST 15a FALLÓ: cliente_id cambió en una oportunidad existente';
  end if;

  -- ── 15b: cambiar modo → BLOQUEADO ────────────────────────────────────────
  begin
    update public.oportunidades set modo = 'productos', etapa = 'nueva' where id = v_op_id;
  exception when others then
    if sqlerrm like '%modo es inmutable%' then
      v_paso_b := true;
      raise notice 'TEST 15b PASÓ: modo inmutable en oportunidades.';
    else raise; end if;
  end;
  if not v_paso_b then
    raise exception 'TEST 15b FALLÓ: modo cambió en una oportunidad existente';
  end if;

  raise exception '__rollback_p15__';
exception when others then
  if sqlerrm = '__rollback_p15__' then raise notice 'TEST 15: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 16: COHERENCIA CLIENTE ↔ OPORTUNIDAD EN RECORDATORIOS
-- 16a: recordatorio con cliente diferente al de la oportunidad → BLOQUEADO.
-- 16b: recordatorio con cliente correcto → PASA.
-- 16c: reasignación de oportunidad_id → BLOQUEADO.
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id  uuid := gen_random_uuid();
  v_neg_id   uuid := gen_random_uuid();
  v_cli_a    uuid := gen_random_uuid();
  v_cli_b    uuid := gen_random_uuid();
  v_op_a     uuid;
  v_op_b     uuid;
  v_rec_id   uuid;
  v_paso_a   boolean := false;
  v_paso_c   boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id,'authenticated','authenticated','_t16@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre) values (v_neg_id, v_user_id, '_test16_neg');
  insert into public.clientes (id, negocio_id, cleo_id, nombre) values
    (v_cli_a, v_neg_id, '_t16_cli_a', '_test16_cli_a'),
    (v_cli_b, v_neg_id, '_t16_cli_b', '_test16_cli_b');

  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa)
    values (gen_random_uuid(), v_neg_id, '_t16_op_a', v_cli_a, 'servicios', 'activa', 'nuevo_contacto')
    returning id into v_op_a;
  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa)
    values (gen_random_uuid(), v_neg_id, '_t16_op_b', v_cli_b, 'servicios', 'activa', 'nuevo_contacto')
    returning id into v_op_b;

  -- ── 16a: recordatorio de cli_b con oportunidad de cli_a → BLOQUEADO ──────
  begin
    insert into public.recordatorios
      (negocio_id, cliente_id, oportunidad_id, categoria, texto, fecha, estatus)
      values (v_neg_id, v_cli_b, v_op_a, 'pipeline', 'test', current_date, 'pendiente');
  exception when others then
    if sqlerrm like '%pertenece al cliente %' then
      v_paso_a := true;
      raise notice 'TEST 16a PASÓ: coherencia cliente/oportunidad verificada.';
    else raise; end if;
  end;
  if not v_paso_a then
    raise exception 'TEST 16a FALLÓ: recordatorio con cliente/oportunidad inconsistentes aceptado';
  end if;

  -- ── 16b: recordatorio con cliente correcto → DEBE PASAR ──────────────────
  insert into public.recordatorios
    (id, negocio_id, cleo_id, cliente_id, oportunidad_id, categoria, texto, fecha, estatus)
    values (gen_random_uuid(), v_neg_id, '_t16_rec', v_cli_a, v_op_a, 'pipeline', 'Seguimiento A', current_date, 'pendiente')
    returning id into v_rec_id;
  raise notice 'TEST 16b PASÓ: recordatorio con cliente y oportunidad coherentes insertado.';

  -- ── 16c: reasignar oportunidad_id → BLOQUEADO ────────────────────────────
  begin
    update public.recordatorios set oportunidad_id = v_op_b where id = v_rec_id;
  exception when others then
    if sqlerrm like '%oportunidad_id es inmutable%' then
      v_paso_c := true;
      raise notice 'TEST 16c PASÓ: oportunidad_id inmutable en recordatorio.';
    else raise; end if;
  end;
  if not v_paso_c then
    raise exception 'TEST 16c FALLÓ: oportunidad_id reasignado en recordatorio existente';
  end if;

  raise exception '__rollback_p16__';
exception when others then
  if sqlerrm = '__rollback_p16__' then raise notice 'TEST 16: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 17: COHERENCIA CLIENTE ↔ OPORTUNIDAD EN COTIZACIONES Y PEDIDOS
-- 17a: cotización con cliente diferente al de su oportunidad → BLOQUEADO.
-- 17b: cotización con cliente correcto → PASA.
-- 17c: reasignación de oportunidad_id en cotización → BLOQUEADO.
-- 17d: pedido con cliente diferente al de su oportunidad → BLOQUEADO.
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id  uuid := gen_random_uuid();
  v_neg_id   uuid := gen_random_uuid();
  v_cli_a    uuid := gen_random_uuid();
  v_cli_b    uuid := gen_random_uuid();
  v_op_a     uuid;
  v_op_b     uuid;
  v_cot_id   uuid;
  v_paso_a   boolean := false;
  v_paso_c   boolean := false;
  v_paso_d   boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id,'authenticated','authenticated','_t17@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre) values (v_neg_id, v_user_id, '_test17_neg');
  insert into public.clientes (id, negocio_id, cleo_id, nombre) values
    (v_cli_a, v_neg_id, '_t17_cli_a', '_test17_cli_a'),
    (v_cli_b, v_neg_id, '_t17_cli_b', '_test17_cli_b');

  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa)
    values (gen_random_uuid(), v_neg_id, '_t17_op_a', v_cli_a, 'servicios', 'activa', 'nuevo_contacto')
    returning id into v_op_a;
  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa)
    values (gen_random_uuid(), v_neg_id, '_t17_op_b', v_cli_b, 'servicios', 'activa', 'nuevo_contacto')
    returning id into v_op_b;

  -- ── 17a: cotización de cli_b con oportunidad de cli_a → BLOQUEADO ─────────
  begin
    insert into public.cotizaciones
      (negocio_id, cleo_id, cliente_id, oportunidad_id)
      values (v_neg_id, '_t17_cot_x', v_cli_b, v_op_a);
  exception when others then
    if sqlerrm like '%pertenece al cliente %' then
      v_paso_a := true;
      raise notice 'TEST 17a PASÓ: coherencia cliente/oportunidad en cotizacion verificada.';
    else raise; end if;
  end;
  if not v_paso_a then
    raise exception 'TEST 17a FALLÓ: cotización con cliente/oportunidad inconsistentes aceptada';
  end if;

  -- ── 17b: cotización con cliente correcto → DEBE PASAR ────────────────────
  insert into public.cotizaciones
    (negocio_id, cleo_id, cliente_id, oportunidad_id)
    values (v_neg_id, '_t17_cot_ok', v_cli_a, v_op_a)
    returning id into v_cot_id;
  raise notice 'TEST 17b PASÓ: cotización con cliente/oportunidad coherentes insertada.';

  -- ── 17c: reasignar oportunidad_id en cotización → BLOQUEADO ──────────────
  begin
    update public.cotizaciones set oportunidad_id = v_op_b where id = v_cot_id;
  exception when others then
    if sqlerrm like '%oportunidad_id es inmutable%' then
      v_paso_c := true;
      raise notice 'TEST 17c PASÓ: oportunidad_id inmutable en cotización.';
    else raise; end if;
  end;
  if not v_paso_c then
    raise exception 'TEST 17c FALLÓ: oportunidad_id reasignado en cotización existente';
  end if;

  -- ── 17d: pedido de cli_b con oportunidad de cli_a → BLOQUEADO ─────────────
  begin
    insert into public.pedidos
      (negocio_id, cleo_id, cliente_id, oportunidad_id)
      values (v_neg_id, '_t17_ped_x', v_cli_b, v_op_a);
  exception when others then
    if sqlerrm like '%pertenece al cliente %' then
      v_paso_d := true;
      raise notice 'TEST 17d PASÓ: coherencia cliente/oportunidad en pedido verificada.';
    else raise; end if;
  end;
  if not v_paso_d then
    raise exception 'TEST 17d FALLÓ: pedido con cliente/oportunidad inconsistentes aceptado';
  end if;

  raise exception '__rollback_p17__';
exception when others then
  if sqlerrm = '__rollback_p17__' then raise notice 'TEST 17: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 18: DOS OPORTUNIDADES POR CLIENTE, DOS SEGUIMIENTOS POR OPORTUNIDAD + GENERAL
-- op_A: 2 seguimientos; op_B: 2 seguimientos; 1 recordatorio general sin oportunidad.
-- Verifica el invariante central del diseño:
--   - Dos oportunidades del mismo cliente son entidades completamente independientes.
--   - Atender un seguimiento de op_A no afecta op_B ni el recordatorio general.
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id  uuid := gen_random_uuid();
  v_neg_id   uuid := gen_random_uuid();
  v_cli_id   uuid := gen_random_uuid();
  v_op_a     uuid;
  v_op_b     uuid;
  v_seg_a1   uuid;
  v_seg_a2   uuid;
  v_seg_b1   uuid;
  v_seg_b2   uuid;
  v_seg_gen  uuid;
  v_cnt      int;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id,'authenticated','authenticated','_t18@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre) values (v_neg_id, v_user_id, '_test18_neg');
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (v_cli_id, v_neg_id, '_t18_cli', '_test18_cli');

  -- Dos oportunidades activas del mismo cliente
  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa, titulo)
    values (gen_random_uuid(), v_neg_id, '_t18_op_a', v_cli_id, 'servicios', 'activa', 'cotizacion_enviada', 'Fotografía')
    returning id into v_op_a;
  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa, titulo)
    values (gen_random_uuid(), v_neg_id, '_t18_op_b', v_cli_id, 'servicios', 'activa', 'nuevo_contacto', 'Video')
    returning id into v_op_b;

  -- Dos seguimientos para op_A (pipeline + manual, ambos para hoy)
  insert into public.recordatorios
    (id, negocio_id, cleo_id, cliente_id, oportunidad_id, categoria, texto, fecha, estatus, origen)
    values (gen_random_uuid(), v_neg_id, '_t18_seg_a1', v_cli_id, v_op_a,
            'pipeline', 'Preguntarle si revisó la cotización de fotografía',
            current_date, 'pendiente', 'cleo')
    returning id into v_seg_a1;
  insert into public.recordatorios
    (id, negocio_id, cleo_id, cliente_id, oportunidad_id, categoria, texto, fecha, estatus, origen)
    values (gen_random_uuid(), v_neg_id, '_t18_seg_a2', v_cli_id, v_op_a,
            'manual', 'Confirmar disponibilidad del estudio',
            current_date, 'pendiente', 'manual')
    returning id into v_seg_a2;

  -- Dos seguimientos para op_B
  insert into public.recordatorios
    (id, negocio_id, cleo_id, cliente_id, oportunidad_id, categoria, texto, fecha, estatus, origen)
    values (gen_random_uuid(), v_neg_id, '_t18_seg_b1', v_cli_id, v_op_b,
            'pipeline', 'Enviarle el precio del video',
            current_date, 'pendiente', 'cleo')
    returning id into v_seg_b1;
  insert into public.recordatorios
    (id, negocio_id, cleo_id, cliente_id, oportunidad_id, categoria, texto, fecha, estatus, origen)
    values (gen_random_uuid(), v_neg_id, '_t18_seg_b2', v_cli_id, v_op_b,
            'manual', 'Confirmar si tiene presupuesto para video',
            current_date, 'pendiente', 'manual')
    returning id into v_seg_b2;

  -- Un recordatorio general del cliente (sin oportunidad)
  insert into public.recordatorios
    (id, negocio_id, cleo_id, cliente_id, oportunidad_id, categoria, texto, fecha, estatus, origen)
    values (gen_random_uuid(), v_neg_id, '_t18_seg_gen', v_cli_id, null,
            'manual', 'Recordatorio general sin oportunidad específica',
            current_date, 'pendiente', 'manual')
    returning id into v_seg_gen;

  -- Verificar estructura: 2 oportunidades, 5 recordatorios (2+2 por oportunidad + 1 general)
  select count(*) into v_cnt from public.oportunidades
   where negocio_id = v_neg_id and cliente_id = v_cli_id;
  if v_cnt <> 2 then
    raise exception 'TEST 18 FALLÓ: esperadas 2 oportunidades, encontradas %', v_cnt;
  end if;

  select count(*) into v_cnt from public.recordatorios
   where negocio_id = v_neg_id and cliente_id = v_cli_id;
  if v_cnt <> 5 then
    raise exception 'TEST 18 FALLÓ: esperados 5 recordatorios, encontrados %', v_cnt;
  end if;

  select count(*) into v_cnt from public.recordatorios
   where negocio_id = v_neg_id and oportunidad_id = v_op_a;
  if v_cnt <> 2 then
    raise exception 'TEST 18 FALLÓ: op_A debe tener 2 seguimientos, tiene %', v_cnt;
  end if;

  select count(*) into v_cnt from public.recordatorios
   where negocio_id = v_neg_id and oportunidad_id = v_op_b;
  if v_cnt <> 2 then
    raise exception 'TEST 18 FALLÓ: op_B debe tener 2 seguimientos, tiene %', v_cnt;
  end if;

  -- Atender seg_a1: solo debe afectar ese registro
  update public.recordatorios
     set estatus = 'atendido', completado = true, fecha_atendido = current_date
   where id = v_seg_a1;

  select count(*) into v_cnt from public.recordatorios
   where negocio_id = v_neg_id and estatus = 'pendiente';
  if v_cnt <> 4 then
    raise exception 'TEST 18 FALLÓ: después de atender seg_a1 deben quedar 4 pendientes, hay %', v_cnt;
  end if;

  -- op_B (ambos seguimientos) y el recordatorio general no se tocaron
  select count(*) into v_cnt from public.recordatorios
   where id in (v_seg_b1, v_seg_b2, v_seg_gen) and estatus = 'pendiente';
  if v_cnt <> 3 then
    raise exception 'TEST 18 FALLÓ: atender seg_a1 modificó un seguimiento de op_B o el general';
  end if;

  raise notice 'TEST 18 PASÓ: 2 oportunidades × 2 seguimientos + general, aislamiento verificado.';

  raise exception '__rollback_p18__';
exception when others then
  if sqlerrm = '__rollback_p18__' then raise notice 'TEST 18: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 19: ON DELETE SET NULL PASA A TRAVÉS DE LOS TRIGGERS DE INMUTABILIDAD
-- Borra una oportunidad vinculada: cotizacion, pedido y recordatorio deben
-- quedar con oportunidad_id=NULL sin que el trigger lance excepción; y
-- oportunidad_vinculada=true debe persistir (impide reasignaciones posteriores).
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id  uuid := gen_random_uuid();
  v_neg_id   uuid := gen_random_uuid();
  v_cli_id   uuid := gen_random_uuid();
  v_op_id    uuid;
  v_cot_id   uuid;
  v_ped_id   uuid;
  v_rec_id   uuid;
  v_check_id uuid;
  v_check_v  boolean;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id,'authenticated','authenticated','_t19@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre) values (v_neg_id, v_user_id, '_test19_neg');
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (v_cli_id, v_neg_id, '_t19_cli', '_test19_cli');

  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa)
    values (gen_random_uuid(), v_neg_id, '_t19_op', v_cli_id, 'servicios', 'activa', 'cotizacion_enviada')
    returning id into v_op_id;

  insert into public.cotizaciones
    (id, negocio_id, cleo_id, cliente_id, oportunidad_id)
    values (gen_random_uuid(), v_neg_id, '_t19_cot', v_cli_id, v_op_id)
    returning id into v_cot_id;

  insert into public.pedidos
    (id, negocio_id, cleo_id, cliente_id, oportunidad_id)
    values (gen_random_uuid(), v_neg_id, '_t19_ped', v_cli_id, v_op_id)
    returning id into v_ped_id;

  insert into public.recordatorios
    (id, negocio_id, cleo_id, cliente_id, oportunidad_id, categoria, texto, fecha, estatus)
    values (gen_random_uuid(), v_neg_id, '_t19_rec', v_cli_id, v_op_id,
            'pipeline', 'Seguimiento test', current_date, 'pendiente')
    returning id into v_rec_id;

  -- Precondición: los tres documentos tienen oportunidad_vinculada=true
  select oportunidad_vinculada into v_check_v from public.cotizaciones where id = v_cot_id;
  if not v_check_v then raise exception 'TEST 19 prereq: cotizacion.oportunidad_vinculada no es true'; end if;
  select oportunidad_vinculada into v_check_v from public.pedidos where id = v_ped_id;
  if not v_check_v then raise exception 'TEST 19 prereq: pedido.oportunidad_vinculada no es true'; end if;
  select oportunidad_vinculada into v_check_v from public.recordatorios where id = v_rec_id;
  if not v_check_v then raise exception 'TEST 19 prereq: recordatorio.oportunidad_vinculada no es true'; end if;

  -- Borrar la oportunidad: triggers de inmutabilidad NO deben bloquear el CASCADE.
  delete from public.oportunidades where id = v_op_id;

  -- oportunidad_id debe ser NULL en los tres documentos
  select oportunidad_id into v_check_id from public.cotizaciones where id = v_cot_id;
  if v_check_id is not null then
    raise exception 'TEST 19 FALLÓ: cotizacion.oportunidad_id no quedó NULL tras borrar oportunidad';
  end if;
  select oportunidad_id into v_check_id from public.pedidos where id = v_ped_id;
  if v_check_id is not null then
    raise exception 'TEST 19 FALLÓ: pedido.oportunidad_id no quedó NULL tras borrar oportunidad';
  end if;
  select oportunidad_id into v_check_id from public.recordatorios where id = v_rec_id;
  if v_check_id is not null then
    raise exception 'TEST 19 FALLÓ: recordatorio.oportunidad_id no quedó NULL tras borrar oportunidad';
  end if;

  -- oportunidad_vinculada debe seguir siendo true (impide reasignaciones)
  select oportunidad_vinculada into v_check_v from public.cotizaciones where id = v_cot_id;
  if not v_check_v then raise exception 'TEST 19 FALLÓ: cotizacion.oportunidad_vinculada se reseteo tras cascade'; end if;
  select oportunidad_vinculada into v_check_v from public.pedidos where id = v_ped_id;
  if not v_check_v then raise exception 'TEST 19 FALLÓ: pedido.oportunidad_vinculada se reseteo tras cascade'; end if;
  select oportunidad_vinculada into v_check_v from public.recordatorios where id = v_rec_id;
  if not v_check_v then raise exception 'TEST 19 FALLÓ: recordatorio.oportunidad_vinculada se reseteo tras cascade'; end if;

  raise notice 'TEST 19 PASÓ: CASCADE propagado en cotizacion/pedido/recordatorio sin excepción; oportunidad_vinculada persiste.';

  raise exception '__rollback_p19__';
exception when others then
  if sqlerrm = '__rollback_p19__' then raise notice 'TEST 19: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 20: MÚLTIPLES cleo_id=NULL EN EL MISMO NEGOCIO (ÍNDICE PARCIAL)
-- 20a: dos registros con cleo_id=NULL en mismo negocio → DEBEN PASAR.
-- 20b: dos registros con mismo cleo_id no nulo → el segundo debe FALLAR.
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id  uuid := gen_random_uuid();
  v_neg_id   uuid := gen_random_uuid();
  v_cli_id   uuid := gen_random_uuid();
  v_paso_dup boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id,'authenticated','authenticated','_t20@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre) values (v_neg_id, v_user_id, '_test20_neg');
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (v_cli_id, v_neg_id, '_t20_cli', '_test20_cli');

  -- 20a: dos recordatorios con cleo_id=NULL en mismo negocio → DEBEN PASAR
  insert into public.recordatorios
    (negocio_id, cleo_id, cliente_id, categoria, texto, fecha, estatus)
    values (v_neg_id, null, v_cli_id, 'manual', 'Sin ID legacy 1', current_date, 'pendiente');
  insert into public.recordatorios
    (negocio_id, cleo_id, cliente_id, categoria, texto, fecha, estatus)
    values (v_neg_id, null, v_cli_id, 'manual', 'Sin ID legacy 2', current_date, 'pendiente');
  raise notice 'TEST 20a PASÓ: dos recordatorios con cleo_id=NULL permitidos en mismo negocio.';

  -- 20b: mismo cleo_id no nulo → el segundo debe FALLAR (unique_violation)
  insert into public.recordatorios
    (negocio_id, cleo_id, cliente_id, categoria, texto, fecha, estatus)
    values (v_neg_id, '_t20_dup', v_cli_id, 'pipeline', 'Primero', current_date, 'pendiente');
  begin
    insert into public.recordatorios
      (negocio_id, cleo_id, cliente_id, categoria, texto, fecha, estatus)
      values (v_neg_id, '_t20_dup', v_cli_id, 'pipeline', 'Duplicado', current_date, 'pendiente');
  exception when unique_violation then
    v_paso_dup := true;
    raise notice 'TEST 20b PASÓ: cleo_id duplicado no nulo rechazado correctamente.';
  end;
  if not v_paso_dup then
    raise exception 'TEST 20b FALLÓ: se insertó un cleo_id duplicado en recordatorios';
  end if;

  raise exception '__rollback_p20__';
exception when others then
  if sqlerrm = '__rollback_p20__' then raise notice 'TEST 20: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 21: BYPASS NULL A→NULL→B BLOQUEADO PARA authenticated
--
-- Verifica que el flag oportunidad_vinculada impide la secuencia:
--   21a: authenticated intenta poner oportunidad_id=NULL manualmente (op_A existe) → BLOQUEADO
--   cascade: superusuario borra op_A → ON DELETE SET NULL → oportunidad_id queda NULL
--   21b: authenticated intenta reasignar oportunidad_id=op_B → BLOQUEADO (vinculada=true)
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id  uuid := gen_random_uuid();
  v_neg_id   uuid := gen_random_uuid();
  v_cli_id   uuid := gen_random_uuid();
  v_op_a_id  uuid;
  v_op_b_id  uuid;
  v_cot_id   uuid;
  v_paso_a   boolean := false;
  v_paso_b   boolean := false;
  v_check_id uuid;
  v_check_v  boolean;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id,'authenticated','authenticated','_t21@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre) values (v_neg_id, v_user_id, '_test21_neg');
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (v_cli_id, v_neg_id, '_t21_cli', '_test21_cli');

  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa)
    values (gen_random_uuid(), v_neg_id, '_t21_op_a', v_cli_id, 'servicios', 'activa', 'cotizacion_enviada')
    returning id into v_op_a_id;
  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa)
    values (gen_random_uuid(), v_neg_id, '_t21_op_b', v_cli_id, 'servicios', 'activa', 'nuevo_contacto')
    returning id into v_op_b_id;

  insert into public.cotizaciones (id, negocio_id, cleo_id, cliente_id, oportunidad_id)
    values (gen_random_uuid(), v_neg_id, '_t21_cot', v_cli_id, v_op_a_id)
    returning id into v_cot_id;

  -- Activar identidad authenticated (JWT apunta a v_user_id)
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ── 21a: intento de NULL manual mientras op_A existe → BLOQUEADO ─────────
  begin
    update public.cotizaciones set oportunidad_id = null where id = v_cot_id;
  exception when others then
    if sqlerrm like '%inmutable%' or sqlerrm like '%oportunidad_id%' then
      v_paso_a := true;
      raise notice 'TEST 21a PASÓ: SET oportunidad_id=NULL rechazado mientras op_A existe.';
    else raise; end if;
  end;

  reset role;

  if not v_paso_a then
    raise exception 'TEST 21a FALLÓ: debería haber bloqueado SET oportunidad_id=NULL';
  end if;

  -- Verificar que oportunidad_id sigue siendo op_A (no se modificó)
  select oportunidad_id into v_check_id from public.cotizaciones where id = v_cot_id;
  if v_check_id is distinct from v_op_a_id then
    raise exception 'TEST 21a FALLÓ: oportunidad_id cambió pese al bloqueo';
  end if;

  -- ── cascade: superusuario borra op_A → ON DELETE SET NULL ────────────────
  delete from public.oportunidades where id = v_op_a_id;

  select oportunidad_id, oportunidad_vinculada
    into v_check_id, v_check_v
    from public.cotizaciones where id = v_cot_id;
  if v_check_id is not null then
    raise exception 'TEST 21 cascade FALLÓ: oportunidad_id no quedó NULL tras borrar op_A';
  end if;
  if not v_check_v then
    raise exception 'TEST 21 cascade FALLÓ: oportunidad_vinculada se reseteo tras cascade';
  end if;
  raise notice 'TEST 21 cascade: oportunidad_id=NULL, oportunidad_vinculada=true — correcto.';

  -- ── 21b: intento de reasignación a op_B → BLOQUEADO (vinculada=true) ─────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update public.cotizaciones set oportunidad_id = v_op_b_id where id = v_cot_id;
  exception when others then
    if sqlerrm like '%inmutable%' or sqlerrm like '%oportunidad_id%' then
      v_paso_b := true;
      raise notice 'TEST 21b PASÓ: reasignación a op_B rechazada (oportunidad_vinculada=true).';
    else raise; end if;
  end;

  reset role;

  if not v_paso_b then
    raise exception 'TEST 21b FALLÓ: debería haber bloqueado la reasignación a op_B';
  end if;

  -- Verificar que oportunidad_id sigue NULL (no se asignó op_B)
  select oportunidad_id into v_check_id from public.cotizaciones where id = v_cot_id;
  if v_check_id is not null then
    raise exception 'TEST 21b FALLÓ: oportunidad_id cambió a op_B pese al bloqueo';
  end if;

  raise notice 'TEST 21 PASÓ: bypass A→NULL→B completamente bloqueado para authenticated.';

  raise exception '__rollback_p21__';
exception when others then
  if sqlerrm = '__rollback_p21__' then raise notice 'TEST 21: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 22: authenticated no puede revertir oportunidad_vinculada de true a false
--
-- Si se pudiera revertir el flag, el bypass A→NULL→B sería posible:
--   SET oportunidad_vinculada=false → cascade → SET oportunidad_id=op_B (primera asignación).
--
-- 22a/22b: cotizacion  — solo flag / flag + reasignación → BLOQUEADO
-- 22c/22d: pedido      — mismos casos → BLOQUEADO
-- 22e/22f: recordatorio — mismos casos → BLOQUEADO
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id  uuid := gen_random_uuid();
  v_neg_id   uuid := gen_random_uuid();
  v_cli_id   uuid := gen_random_uuid();
  v_op_a_id  uuid;
  v_op_b_id  uuid;
  v_cot_id   uuid;
  v_ped_id   uuid;
  v_rec_id   uuid;
  v_paso_a   boolean := false;
  v_paso_b   boolean := false;
  v_paso_c   boolean := false;
  v_paso_d   boolean := false;
  v_paso_e   boolean := false;
  v_paso_f   boolean := false;
  v_check_v  boolean;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id,'authenticated','authenticated','_t22@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre) values (v_neg_id, v_user_id, '_test22_neg');
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (v_cli_id, v_neg_id, '_t22_cli', '_test22_cli');

  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa)
    values (gen_random_uuid(), v_neg_id, '_t22_op_a', v_cli_id, 'servicios', 'activa', 'cotizacion_enviada')
    returning id into v_op_a_id;
  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa)
    values (gen_random_uuid(), v_neg_id, '_t22_op_b', v_cli_id, 'servicios', 'activa', 'nuevo_contacto')
    returning id into v_op_b_id;

  insert into public.cotizaciones (id, negocio_id, cleo_id, cliente_id, oportunidad_id)
    values (gen_random_uuid(), v_neg_id, '_t22_cot', v_cli_id, v_op_a_id)
    returning id into v_cot_id;
  insert into public.pedidos (id, negocio_id, cleo_id, cliente_id, oportunidad_id)
    values (gen_random_uuid(), v_neg_id, '_t22_ped', v_cli_id, v_op_a_id)
    returning id into v_ped_id;
  insert into public.recordatorios
    (id, negocio_id, cleo_id, cliente_id, oportunidad_id, categoria, texto, fecha, estatus)
    values (gen_random_uuid(), v_neg_id, '_t22_rec', v_cli_id, v_op_a_id,
            'pipeline', 'Test22', current_date, 'pendiente')
    returning id into v_rec_id;

  -- Precondición: los tres tienen oportunidad_vinculada=true
  select oportunidad_vinculada into v_check_v from public.cotizaciones  where id = v_cot_id;
  if not v_check_v then raise exception 'TEST 22 prereq: cotizacion.oportunidad_vinculada no es true'; end if;
  select oportunidad_vinculada into v_check_v from public.pedidos        where id = v_ped_id;
  if not v_check_v then raise exception 'TEST 22 prereq: pedido.oportunidad_vinculada no es true'; end if;
  select oportunidad_vinculada into v_check_v from public.recordatorios  where id = v_rec_id;
  if not v_check_v then raise exception 'TEST 22 prereq: recordatorio.oportunidad_vinculada no es true'; end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ── 22a: cotizacion — solo flag → BLOQUEADO ───────────────────────────────
  begin
    update public.cotizaciones set oportunidad_vinculada = false where id = v_cot_id;
  exception when others then
    if sqlerrm like '%oportunidad_vinculada%' or sqlerrm like '%revertirse%' then
      v_paso_a := true;
      raise notice 'TEST 22a PASÓ: cotizacion SET oportunidad_vinculada=false bloqueado.';
    else raise; end if;
  end;

  -- ── 22b: cotizacion — flag + reasignación a op_B → BLOQUEADO ─────────────
  begin
    update public.cotizaciones
       set oportunidad_vinculada = false, oportunidad_id = v_op_b_id
     where id = v_cot_id;
  exception when others then
    if sqlerrm like '%oportunidad_vinculada%' or sqlerrm like '%revertirse%' then
      v_paso_b := true;
      raise notice 'TEST 22b PASÓ: cotizacion SET flag=false + oportunidad_id=op_B bloqueado.';
    else raise; end if;
  end;

  -- ── 22c: pedido — solo flag → BLOQUEADO ──────────────────────────────────
  begin
    update public.pedidos set oportunidad_vinculada = false where id = v_ped_id;
  exception when others then
    if sqlerrm like '%oportunidad_vinculada%' or sqlerrm like '%revertirse%' then
      v_paso_c := true;
      raise notice 'TEST 22c PASÓ: pedido SET oportunidad_vinculada=false bloqueado.';
    else raise; end if;
  end;

  -- ── 22d: pedido — flag + reasignación a op_B → BLOQUEADO ─────────────────
  begin
    update public.pedidos
       set oportunidad_vinculada = false, oportunidad_id = v_op_b_id
     where id = v_ped_id;
  exception when others then
    if sqlerrm like '%oportunidad_vinculada%' or sqlerrm like '%revertirse%' then
      v_paso_d := true;
      raise notice 'TEST 22d PASÓ: pedido SET flag=false + oportunidad_id=op_B bloqueado.';
    else raise; end if;
  end;

  -- ── 22e: recordatorio — solo flag → BLOQUEADO ────────────────────────────
  begin
    update public.recordatorios set oportunidad_vinculada = false where id = v_rec_id;
  exception when others then
    if sqlerrm like '%oportunidad_vinculada%' or sqlerrm like '%revertirse%' then
      v_paso_e := true;
      raise notice 'TEST 22e PASÓ: recordatorio SET oportunidad_vinculada=false bloqueado.';
    else raise; end if;
  end;

  -- ── 22f: recordatorio — flag + reasignación a op_B → BLOQUEADO ───────────
  begin
    update public.recordatorios
       set oportunidad_vinculada = false, oportunidad_id = v_op_b_id
     where id = v_rec_id;
  exception when others then
    if sqlerrm like '%oportunidad_vinculada%' or sqlerrm like '%revertirse%' then
      v_paso_f := true;
      raise notice 'TEST 22f PASÓ: recordatorio SET flag=false + oportunidad_id=op_B bloqueado.';
    else raise; end if;
  end;

  reset role;

  if not v_paso_a then raise exception 'TEST 22a FALLÓ: cotizacion: debería haber bloqueado SET oportunidad_vinculada=false'; end if;
  if not v_paso_b then raise exception 'TEST 22b FALLÓ: cotizacion: debería haber bloqueado UPDATE combinado'; end if;
  if not v_paso_c then raise exception 'TEST 22c FALLÓ: pedido: debería haber bloqueado SET oportunidad_vinculada=false'; end if;
  if not v_paso_d then raise exception 'TEST 22d FALLÓ: pedido: debería haber bloqueado UPDATE combinado'; end if;
  if not v_paso_e then raise exception 'TEST 22e FALLÓ: recordatorio: debería haber bloqueado SET oportunidad_vinculada=false'; end if;
  if not v_paso_f then raise exception 'TEST 22f FALLÓ: recordatorio: debería haber bloqueado UPDATE combinado'; end if;

  -- Verificar que el flag sigue true en los tres
  select oportunidad_vinculada into v_check_v from public.cotizaciones  where id = v_cot_id;
  if not v_check_v then raise exception 'TEST 22 FALLÓ: cotizacion.oportunidad_vinculada se reseteo'; end if;
  select oportunidad_vinculada into v_check_v from public.pedidos        where id = v_ped_id;
  if not v_check_v then raise exception 'TEST 22 FALLÓ: pedido.oportunidad_vinculada se reseteo'; end if;
  select oportunidad_vinculada into v_check_v from public.recordatorios  where id = v_rec_id;
  if not v_check_v then raise exception 'TEST 22 FALLÓ: recordatorio.oportunidad_vinculada se reseteo'; end if;

  raise notice 'TEST 22 PASÓ (22a–22f): oportunidad_vinculada no puede revertirse a false en cotizaciones, pedidos ni recordatorios.';

  raise exception '__rollback_p22__';
exception when others then
  if sqlerrm = '__rollback_p22__' then raise notice 'TEST 22: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- TEST 23: coherencia cliente↔oportunidad verificada cuando oportunidad_id
--          no cambia pero sí cambia cliente_id
--
-- El early return del trigger omitía esta revisión. La corrección añade un bloque
-- de coherencia explícito antes del early return para este caso.
--
-- 23a: cotizacion SET cliente_id=cli_B (op vinculada a cli_A) → BLOQUEADO
-- 23b: pedido SET cliente_id=cli_B → BLOQUEADO
-- 23c: recordatorio SET cliente_id=cli_B → BLOQUEADO
-- ══════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user_id  uuid := gen_random_uuid();
  v_neg_id   uuid := gen_random_uuid();
  v_cli_a_id uuid := gen_random_uuid();
  v_cli_b_id uuid := gen_random_uuid();
  v_op_id    uuid;
  v_cot_id   uuid;
  v_ped_id   uuid;
  v_rec_id   uuid;
  v_paso_a   boolean := false;
  v_paso_b   boolean := false;
  v_paso_c   boolean := false;
  v_check_id uuid;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_user_id,'authenticated','authenticated','_t23@cleo-test.invalid',now(),now());
  insert into public.negocios (id, user_id, nombre) values (v_neg_id, v_user_id, '_test23_neg');
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (v_cli_a_id, v_neg_id, '_t23_cli_a', '_test23_cli_A');
  insert into public.clientes (id, negocio_id, cleo_id, nombre)
    values (v_cli_b_id, v_neg_id, '_t23_cli_b', '_test23_cli_B');

  -- Oportunidad ligada a cli_A
  insert into public.oportunidades
    (id, negocio_id, cleo_id, cliente_id, modo, estatus, etapa)
    values (gen_random_uuid(), v_neg_id, '_t23_op', v_cli_a_id, 'servicios', 'activa', 'cotizacion_enviada')
    returning id into v_op_id;

  -- Documentos vinculados a la oportunidad (y por tanto a cli_A)
  insert into public.cotizaciones (id, negocio_id, cleo_id, cliente_id, oportunidad_id)
    values (gen_random_uuid(), v_neg_id, '_t23_cot', v_cli_a_id, v_op_id)
    returning id into v_cot_id;
  insert into public.pedidos (id, negocio_id, cleo_id, cliente_id, oportunidad_id)
    values (gen_random_uuid(), v_neg_id, '_t23_ped', v_cli_a_id, v_op_id)
    returning id into v_ped_id;
  insert into public.recordatorios
    (id, negocio_id, cleo_id, cliente_id, oportunidad_id, categoria, texto, fecha, estatus)
    values (gen_random_uuid(), v_neg_id, '_t23_rec', v_cli_a_id, v_op_id,
            'pipeline', 'Test23', current_date, 'pendiente')
    returning id into v_rec_id;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ── 23a: cotizacion SET cliente_id=cli_B (oportunidad_id sin cambio) → BLOQUEADO
  begin
    update public.cotizaciones set cliente_id = v_cli_b_id where id = v_cot_id;
  exception when others then
    if sqlerrm like '%cliente%' or sqlerrm like '%oportunidad%' then
      v_paso_a := true;
      raise notice 'TEST 23a PASÓ: cotizacion SET cliente_id=cli_B bloqueado (coherencia falla).';
    else raise; end if;
  end;

  -- ── 23b: pedido SET cliente_id=cli_B → BLOQUEADO ─────────────────────────
  begin
    update public.pedidos set cliente_id = v_cli_b_id where id = v_ped_id;
  exception when others then
    if sqlerrm like '%cliente%' or sqlerrm like '%oportunidad%' then
      v_paso_b := true;
      raise notice 'TEST 23b PASÓ: pedido SET cliente_id=cli_B bloqueado.';
    else raise; end if;
  end;

  -- ── 23c: recordatorio SET cliente_id=cli_B → BLOQUEADO ───────────────────
  begin
    update public.recordatorios set cliente_id = v_cli_b_id where id = v_rec_id;
  exception when others then
    if sqlerrm like '%cliente%' or sqlerrm like '%oportunidad%' then
      v_paso_c := true;
      raise notice 'TEST 23c PASÓ: recordatorio SET cliente_id=cli_B bloqueado.';
    else raise; end if;
  end;

  reset role;

  if not v_paso_a then raise exception 'TEST 23a FALLÓ: cotizacion: SET cliente_id=cli_B no fue bloqueado'; end if;
  if not v_paso_b then raise exception 'TEST 23b FALLÓ: pedido: SET cliente_id=cli_B no fue bloqueado'; end if;
  if not v_paso_c then raise exception 'TEST 23c FALLÓ: recordatorio: SET cliente_id=cli_B no fue bloqueado'; end if;

  -- Verificar que cliente_id no cambió en ninguno
  select cliente_id into v_check_id from public.cotizaciones  where id = v_cot_id;
  if v_check_id is distinct from v_cli_a_id then raise exception 'TEST 23 FALLÓ: cotizacion.cliente_id cambió pese al bloqueo'; end if;
  select cliente_id into v_check_id from public.pedidos        where id = v_ped_id;
  if v_check_id is distinct from v_cli_a_id then raise exception 'TEST 23 FALLÓ: pedido.cliente_id cambió pese al bloqueo'; end if;
  select cliente_id into v_check_id from public.recordatorios  where id = v_rec_id;
  if v_check_id is distinct from v_cli_a_id then raise exception 'TEST 23 FALLÓ: recordatorio.cliente_id cambió pese al bloqueo'; end if;

  raise notice 'TEST 23 PASÓ (23a–23c): coherencia cliente↔oportunidad aplicada aunque oportunidad_id no cambie.';

  raise exception '__rollback_p23__';
exception when others then
  if sqlerrm = '__rollback_p23__' then raise notice 'TEST 23: datos descartados.';
  else raise; end if;
end;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- CONTROLES NEGATIVOS — instrucciones para base desechable aislada
-- ══════════════════════════════════════════════════════════════════════════════
-- Solo en snapshot efímero de CLEO Pruebas, nunca en el entorno activo.
--
-- ── Trigger de schema_ver (tests 7/8):
--   ALTER TABLE public.negocios DISABLE TRIGGER trg_negocios_reserved;
--   -- INSERT/UPDATE con schema_ver='dual' como authenticated → debe PASAR
--   ALTER TABLE public.negocios ENABLE TRIGGER trg_negocios_reserved;
--   -- mismo intento → debe FALLAR
--
-- ── Trigger de snapshots (tests 5/6/11):
--   ALTER TABLE public.cotizaciones DISABLE TRIGGER trg_cotizaciones_snapshots;
--   -- UPDATE SET items_aceptacion=NULL, versiones_aceptacion='[]' → debe PASAR
--   ALTER TABLE public.cotizaciones ENABLE TRIGGER trg_cotizaciones_snapshots;
--   -- mismos UPDATEs → deben FALLAR con mensaje del trigger
--
-- ── FK compuestas (tests 1–4):
--   -- Sin SET CONSTRAINTS ALL IMMEDIATE: la violación no se detecta.
--   -- Con SET CONSTRAINTS ALL IMMEDIATE: la violación sí se detecta.
--   -- Esto valida que el patrón de forzar evaluación es necesario.
-- ══════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════════
-- PRUEBA REAL CON DOS CONEXIONES psql (TEST 13-CONCURRENTE)
--
-- Qué verifica: que FOR UPDATE en cleo_reabrir_cotizacion bloquea la segunda
-- conexión hasta que la primera hace commit, y que al desbloquearse encuentra
-- estatus='Enviada' y falla con error limpio — produciendo exactamente 1 entrada
-- en versiones_aceptacion, no 2.
--
-- Por qué requiere psql: dentro de un bloque DO (sesión única) no es posible
-- observar el bloqueo propio. El SQL Editor de Supabase tampoco sirve: no
-- mantiene transacciones abiertas entre ejecuciones individuales de statements.
-- Test 13 SERIAL (ejecutado 2026-09-17) cubre el invariante post-commit en
-- sesión única. Este test cubre el bloqueo FOR UPDATE entre dos transacciones
-- simultáneas — requiere dos conexiones persistentes e independientes.
--
-- Herramienta: dos terminales con psql usando conexión directa (no pooler).
-- Entorno: CLEO Pruebas (pconfadsbtwjbjeblxgl). No ejecutar en producción.
-- Duración estimada: menos de 10 minutos.
--
-- Esquema verificado antes de este procedimiento:
--   negocios.user_id → auth.users(id) ON DELETE CASCADE ✓
--   cotizaciones.negocio_id → negocios(id) ON DELETE CASCADE ✓
--   negocios: user_id es el único campo obligatorio sin default ✓
--   cotizaciones: negocio_id y cleo_id son los únicos campos obligatorios sin default ✓
--   estatus 'Aceptada' es valor válido según CHECK constraint ✓
-- ──────────────────────────────────────────────────────────────────────────────
--
-- CONEXIÓN (Direct connection — no Transaction Pooler ni Session Pooler)
-- Supabase Dashboard → Project Settings → Database → Connection string → psql
-- Omitir la contraseña del comando; psql la solicitará al conectar:
--
--   psql -h db.pconfadsbtwjbjeblxgl.supabase.co -p 5432 -U postgres -d postgres -W
--
-- Abrir dos terminales y conectar ambos antes de empezar.
-- Cada terminal mantiene su sesión abierta durante toda la prueba.
--
-- ──────────────────────────────────────────────────────────────────────────────
-- PASO 0 — crear datos de prueba propios
-- (en cualquiera de los dos terminales, una sola vez antes del test)
-- Todos los registros usan el prefijo _t13c_ y el email _t13c@cleo-test.invalid
-- para que la limpieza del paso 4 sea precisa y no afecte otros datos.
--
--   INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
--     VALUES (gen_random_uuid(), 'authenticated', 'authenticated',
--             '_t13c@cleo-test.invalid', now(), now())
--     RETURNING id AS t13c_user_id;
--   -- Anotar el UUID retornado. Se usará como <T13C_USER_ID> en todos los pasos.
--
--   INSERT INTO public.negocios (user_id, nombre)
--     VALUES ('<T13C_USER_ID>', '_test13c_neg')
--     RETURNING id AS t13c_neg_id;
--   -- Anotar el UUID retornado. Se usará como <T13C_NEG_ID> en todos los pasos.
--
--   INSERT INTO public.cotizaciones
--     (negocio_id, cleo_id, estatus, items_aceptacion, monto_aceptacion)
--     VALUES ('<T13C_NEG_ID>', '_t13c_cot', 'Aceptada',
--             '[{"nombre":"Servicio test","total":99}]'::jsonb, 99);
--
--   -- Verificar antes de continuar:
--   SELECT estatus FROM public.cotizaciones
--    WHERE negocio_id = '<T13C_NEG_ID>' AND cleo_id = '_t13c_cot';
--   -- Resultado esperado: una fila con estatus='Aceptada'.
--   -- Si hay error de clave duplicada: ejecutar el PASO 4 (limpieza) y reintentar.
--
-- ──────────────────────────────────────────────────────────────────────────────
-- PASO 1 — TERMINAL A: abrir transacción y bloquear la fila (NO hacer commit)
--
--   BEGIN;
--
--   SELECT set_config('request.jwt.claims',
--     '{"sub":"<T13C_USER_ID>","role":"authenticated"}', true);
--
--   SET LOCAL ROLE authenticated;
--
--   SELECT public.cleo_reabrir_cotizacion('_t13c_cot');
--   -- Resultado esperado: la función retorna sin error.
--   -- La fila está ahora bloqueada con FOR UPDATE dentro de esta transacción.
--
--   -- *** NO escribir COMMIT. Dejar este terminal abierto y pasar al Terminal B. ***
--
-- ──────────────────────────────────────────────────────────────────────────────
-- PASO 2 — TERMINAL B: intentar el reopen concurrente
-- (ejecutar mientras el Terminal A tiene la transacción abierta sin commit)
--
--   BEGIN;
--
--   SET lock_timeout = '30s';
--   -- Tiempo máximo de espera en el bloqueo FOR UPDATE.
--   -- Si el Terminal A no hace commit en 30 s, este terminal falla con:
--   --   ERROR:  canceling statement due to lock timeout
--   -- Ese resultado NO cuenta como prueba aprobada.
--   -- Ver el bloque "Si ocurre lock_timeout" al final del paso 3.
--
--   SELECT set_config('request.jwt.claims',
--     '{"sub":"<T13C_USER_ID>","role":"authenticated"}', true);
--
--   SET LOCAL ROLE authenticated;
--
--   SELECT public.cleo_reabrir_cotizacion('_t13c_cot');
--   -- Resultado esperado: el cursor queda esperando (terminal bloqueado).
--   -- Si retorna sin bloquearse: el FOR UPDATE no está actuando → FALLO.
--   -- Dejar este terminal visible y volver al Terminal A para el paso 3.
--
-- ──────────────────────────────────────────────────────────────────────────────
-- PASO 3 — TERMINAL A: commit; verificación; ROLLBACK en Terminal B
-- (mientras el Terminal B sigue bloqueado)
--
--   [TERMINAL A]
--   COMMIT;
--   -- El Terminal B debe desbloquearse de inmediato y mostrar:
--   --   ERROR:  cotizacion '_t13c_cot' no encontrada en el negocio
--   --           o no está en estado Aceptada
--   -- Ese error es el resultado correcto: el COMMIT de A ya fijó estatus='Enviada'.
--   -- Si el Terminal B también retorna éxito (no error): ambas sesiones
--   -- escribieron en versiones_aceptacion → FOR UPDATE falló → FALLO.
--
--   [TERMINAL A] — verificar resultado:
--   SELECT estatus, jsonb_array_length(versiones_aceptacion) AS entradas
--     FROM public.cotizaciones
--    WHERE negocio_id = '<T13C_NEG_ID>' AND cleo_id = '_t13c_cot';
--   -- Resultado esperado: estatus='Enviada', entradas=1.
--   -- entradas=2 significa que el bloqueo no funcionó → FALLO.
--
--   [TERMINAL B] — cerrar la transacción abortada antes de cualquier otro comando:
--   ROLLBACK;
--   -- Una transacción que terminó en error queda en estado abortado.
--   -- Sin ROLLBACK explícito, cualquier comando siguiente fallará con:
--   --   ERROR:  current transaction is aborted, commands ignored until
--   --           end of transaction block
--
-- ── Si ocurre lock_timeout en Terminal B ────────────────────────────────────
--   El resultado no cuenta como prueba aprobada. Pasos para recuperar y reiniciar:
--
--   [TERMINAL B]  ROLLBACK;
--   [TERMINAL A]  ROLLBACK;   -- si la transacción sigue abierta en A
--
--   Verificar estado de la cotización antes de reintentar:
--   SELECT estatus FROM public.cotizaciones
--    WHERE negocio_id = '<T13C_NEG_ID>' AND cleo_id = '_t13c_cot';
--
--   Si estatus='Aceptada': la prueba no se ejecutó; reiniciar desde el PASO 1.
--   Si estatus='Enviada':  Terminal A hizo commit parcialmente; limpiar con
--     el PASO 4 y recrear los datos del PASO 0 antes de reintentar.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ──────────────────────────────────────────────────────────────────────────────
-- PASO 4 — limpieza
-- (en Terminal A, después de verificar el resultado y de que Terminal B hizo ROLLBACK)
-- Elimina únicamente los datos creados en el paso 0, identificados por UUID y correo.
-- El DELETE en auth.users propaga en cascada: negocios → cotizaciones.
--
--   [TERMINAL A]
--   DELETE FROM auth.users
--    WHERE id = '<T13C_USER_ID>'
--      AND email = '_t13c@cleo-test.invalid';
--
--   -- Confirmar que la cotización desapareció por cascada:
--   SELECT count(*) AS restantes
--     FROM public.cotizaciones
--    WHERE negocio_id = '<T13C_NEG_ID>' AND cleo_id = '_t13c_cot';
--   -- Resultado esperado: 0.
--
-- ══════════════════════════════════════════════════════════════════════════════
