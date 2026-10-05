-- ══════════════════════════════════════════════════════════════════════════════
-- 34-migrar-danna-produccion.sql
-- Producción (gpvpvkeqfcgypuoxvjne)
--
-- Migra dannaacubel@gmail.com de blob → dual en producción:
--   1. Lee el blob actual de user_data
--   2. Puebla las tablas relacionales (equivalente a cleo_dual_flush)
--   3. Cambia schema_ver a 'dual'
--
-- REQUISITO: Haber abierto CLEO al menos una vez después del deploy del 2026-10-04
--            para que el blob incluya cleo_oportunidades y cleo_tombstones.
--            Si el script falla con ese mensaje, abre CLEO, haz cualquier cambio
--            menor (p.ej. edita tu perfil) y ejecuta el script de nuevo.
-- ══════════════════════════════════════════════════════════════════════════════

do $migration$
declare
  v_user_email  constant text := 'dannaacubel@gmail.com';
  v_user_id     uuid;
  v_neg_id      uuid;
  v_sv_antes    text;
  v_blob        jsonb;
  v_tipo_perfil text;
  v_neg_creado  boolean := false;

  v_del_clientes       text[] := '{}';
  v_del_oportunidades  text[] := '{}';
  v_del_cotizaciones   text[] := '{}';
  v_del_ventas         text[] := '{}';
  v_del_pedidos        text[] := '{}';
  v_del_recordatorios  text[] := '{}';
  v_del_adjuntos       text[] := '{}';

  v_it   jsonb;
  v_sub  jsonb;
  v_uuid  uuid;
  v_uuid2 uuid;
  v_ci_id uuid;

  v_hist_existente record;
  v_cot_to_op jsonb := '{}'::jsonb;
begin

  -- ── 0. LOCALIZAR USUARIO ─────────────────────────────────────────────────
  select id into v_user_id
    from auth.users
   where email = v_user_email
   limit 1;
  if v_user_id is null then
    raise exception 'Usuario % no encontrado en auth.users.', v_user_email;
  end if;

  -- ── 1. LEER BLOB ──────────────────────────────────────────────────────────
  select data, tipo_perfil
    into v_blob, v_tipo_perfil
    from public.user_data
   where user_id = v_user_id;

  if v_blob is null then
    raise exception 'No hay datos en user_data para %. Inicia sesión en CLEO primero.', v_user_email;
  end if;

  -- ── 2. NEGOCIO (crear si no existe) ───────────────────────────────────────
  select id, schema_ver into v_neg_id, v_sv_antes
    from public.negocios
   where user_id = v_user_id;

  if v_neg_id is null then
    -- Usuario blob: crear fila en negocios desde el blob
    insert into public.negocios (
      user_id, nombre, nombre_contacto, tipo_perfil,
      telefono, email, color, color_sec,
      banco, cuenta, clabe, titular,
      moneda, productos, config, datos_ui,
      schema_ver
    )
    values (
      v_user_id,
      coalesce(nullif(v_blob -> 'cleo_perfil' ->> 'nombre', ''), ''),
      nullif(v_blob -> 'cleo_perfil' ->> 'tuNombre', ''),
      coalesce(nullif(v_blob ->> 'cleo_tipo_perfil', ''), 'servicios'),
      nullif(v_blob -> 'cleo_perfil' ->> 'telefono', ''),
      nullif(v_blob -> 'cleo_perfil' ->> 'email', ''),
      nullif(v_blob -> 'cleo_perfil' ->> 'color', ''),
      nullif(v_blob -> 'cleo_perfil' ->> 'colorSecundario', ''),
      nullif(v_blob -> 'cleo_perfil' ->> 'banco', ''),
      nullif(v_blob -> 'cleo_perfil' ->> 'bancoaccount', ''),
      nullif(v_blob -> 'cleo_perfil' ->> 'bancoclabe', ''),
      nullif(v_blob -> 'cleo_perfil' ->> 'bancotitular', ''),
      'MXN',
      array(select jsonb_array_elements_text(coalesce(v_blob -> 'cleo_productos', '[]'))),
      jsonb_strip_nulls(jsonb_build_object(
        'colorTexto',         nullif(v_blob -> 'cleo_perfil' ->> 'colorTexto', ''),
        'logo',               nullif(v_blob -> 'cleo_perfil' ->> 'logo', ''),
        'mensaje',            nullif(v_blob -> 'cleo_perfil' ->> 'mensaje', ''),
        'condicionesPago',    nullif(v_blob -> 'cleo_perfil' ->> 'condicionesPago', ''),
        'redesTT',            nullif(v_blob -> 'cleo_perfil' ->> 'redesTT', ''),
        'redesIG',            nullif(v_blob -> 'cleo_perfil' ->> 'redesIG', ''),
        'redesFB',            nullif(v_blob -> 'cleo_perfil' ->> 'redesFB', ''),
        'bancotarjeta',       nullif(v_blob -> 'cleo_perfil' ->> 'bancotarjeta', ''),
        'bancoinstrucciones', nullif(v_blob -> 'cleo_perfil' ->> 'bancoinstrucciones', ''),
        'direccion',          nullif(v_blob -> 'cleo_perfil' ->> 'direccion', '')
      )),
      jsonb_build_object(
        'alertas_cerradas', coalesce(v_blob -> 'cleo_alertas_cerradas', '[]'),
        'etapas_vistas',    coalesce(v_blob -> 'cleo_etapas_vistas', '[]'),
        'streak_serv',      v_blob -> 'cleo_streak_accion_serv',
        'streak_prod',      v_blob -> 'cleo_streak_accion_prod'
      ),
      'blob'  -- se actualizará a 'dual' al final
    )
    returning id, schema_ver into v_neg_id, v_sv_antes;
    v_neg_creado := true;
    raise notice 'Negocio creado para % (id=%)', v_user_email, v_neg_id;
  end if;

  if v_sv_antes = 'dual' then
    raise notice 'Ya está en dual mode — nada que hacer.';
    return;
  end if;

  if v_sv_antes <> 'blob' then
    raise exception 'schema_ver=% inesperado (esperaba blob).', v_sv_antes;
  end if;

  if v_blob -> 'cleo_oportunidades' is null then
    raise exception
      'El blob no tiene cleo_oportunidades. Abre CLEO, haz cualquier cambio menor (p.ej. edita tu perfil) para forzar una escritura, y ejecuta este script de nuevo.';
  end if;

  if v_blob -> 'cleo_tombstones' is null then
    raise exception
      'El blob no tiene cleo_tombstones. Abre CLEO, haz cualquier cambio menor y ejecuta este script de nuevo.';
  end if;

  -- ── 3. RECOPILAR TOMBSTONES ───────────────────────────────────────────────
  select
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'cliente'),      '{}'),
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'oportunidad'),  '{}'),
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'cotizacion'),   '{}'),
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'venta'),        '{}'),
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'pedido'),       '{}'),
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'recordatorio'),'{}'),
    coalesce(array_agg(t ->> 'storagePath') filter (where t ->> 'tipo' = 'adjunto'),      '{}')
  into
    v_del_clientes, v_del_oportunidades, v_del_cotizaciones,
    v_del_ventas, v_del_pedidos, v_del_recordatorios, v_del_adjuntos
  from jsonb_array_elements(coalesce(v_blob -> 'cleo_tombstones', '[]')) t;

  -- ── 4. PROCESAR BORRADOS ──────────────────────────────────────────────────
  perform set_config('cleo.procesando_tombstones', 'true', true);

  if array_length(v_del_adjuntos, 1) > 0 then
    delete from public.archivo_adjuntos
     where negocio_id   = v_neg_id
       and storage_path = any(v_del_adjuntos);
  end if;
  if array_length(v_del_recordatorios, 1) > 0 then
    delete from public.recordatorios
     where negocio_id = v_neg_id and cleo_id = any(v_del_recordatorios);
  end if;
  if array_length(v_del_oportunidades, 1) > 0 then
    delete from public.oportunidades
     where negocio_id = v_neg_id and cleo_id = any(v_del_oportunidades);
  end if;
  if array_length(v_del_cotizaciones, 1) > 0 then
    update public.cotizaciones
       set oportunidad_id = null, oportunidad_vinculada = false
     where negocio_id = v_neg_id and cleo_id = any(v_del_cotizaciones);
    delete from public.cotizaciones
     where negocio_id = v_neg_id and cleo_id = any(v_del_cotizaciones);
  end if;
  if array_length(v_del_ventas, 1) > 0 then
    delete from public.ventas
     where negocio_id = v_neg_id and cleo_id = any(v_del_ventas);
  end if;
  if array_length(v_del_pedidos, 1) > 0 then
    delete from public.pedidos
     where negocio_id = v_neg_id and cleo_id = any(v_del_pedidos);
  end if;
  if array_length(v_del_clientes, 1) > 0 then
    delete from public.clientes
     where negocio_id = v_neg_id and cleo_id = any(v_del_clientes);
  end if;

  -- ── 5. UPSERT CATÁLOGO SERVICIOS ─────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_servicios', '[]'))
  loop
    insert into public.catalogo_items
      (negocio_id, cleo_id, modo, nombre, precio, descripcion, condiciones)
    values (
      v_neg_id, v_it ->> 'id', 'servicios',
      coalesce(v_it ->> 'nombre',''), coalesce((v_it ->> 'precio')::numeric,0),
      v_it ->> 'descripcion', v_it ->> 'condiciones'
    )
    on conflict (negocio_id, modo, cleo_id) do update set
      nombre      = excluded.nombre,
      precio      = excluded.precio,
      descripcion = excluded.descripcion,
      condiciones = excluded.condiciones;
  end loop;

  -- ── 5b. UPSERT CATÁLOGO PRODUCTOS + INVENTARIO ───────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_productos_cat', '[]'))
  loop
    insert into public.catalogo_items
      (negocio_id, cleo_id, modo, nombre, precio, descripcion, condiciones,
       inventario_activo, stock, stock_minimo, costo_config)
    values (
      v_neg_id, v_it ->> 'id', 'productos',
      coalesce(v_it ->> 'nombre',''), coalesce((v_it ->> 'precio')::numeric,0),
      v_it ->> 'descripcion', v_it ->> 'condiciones',
      coalesce((v_it ->> 'inventarioActivo')::boolean, false),
      case when (v_it ->> 'inventarioActivo')::boolean
           then nullif(v_it ->> 'stock', '')::int
           else null end,
      nullif(v_it ->> 'stockMinimo', '')::int,
      v_it -> 'costoConfig'
    )
    on conflict (negocio_id, modo, cleo_id) do update set
      nombre            = excluded.nombre,
      precio            = excluded.precio,
      descripcion       = excluded.descripcion,
      condiciones       = excluded.condiciones,
      inventario_activo = excluded.inventario_activo,
      stock             = excluded.stock,
      stock_minimo      = excluded.stock_minimo,
      costo_config      = excluded.costo_config;
  end loop;

  for v_it in
    select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_productos_cat', '[]'))
  loop
    select ci.id into v_ci_id
      from public.catalogo_items ci
     where ci.negocio_id = v_neg_id and ci.modo = 'productos' and ci.cleo_id = (v_it ->> 'id');
    if v_ci_id is null then continue; end if;
    for v_sub in select value from jsonb_array_elements(coalesce(v_it -> 'movimientos', '[]'))
    loop
      if (v_sub ->> 'id') is null then continue; end if;
      insert into public.inventario_movimientos (
        negocio_id, catalogo_item_id, cleo_id, fecha, tipo, nota, cant_antes, cant_despues
      )
      values (
        v_neg_id, v_ci_id, v_sub ->> 'id',
        nullif(v_sub ->> 'fecha', '')::date, v_sub ->> 'tipo', v_sub ->> 'nota',
        nullif(v_sub ->> 'cantAntes', '')::int, nullif(v_sub ->> 'cantDespues', '')::int
      )
      on conflict (negocio_id, cleo_id) where cleo_id is not null do nothing;
    end loop;
  end loop;

  -- ── 6. UPSERT CLIENTES ────────────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_clientes', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_clientes) then continue; end if;
    insert into public.clientes (
      negocio_id, cleo_id,
      nombre, empresa, telefono, email, instagram, messenger, canal,
      origen, etapa, fecha_etapa, estado_prospecto,
      motivo_perdida, razon_cierre, ultimo_contacto,
      notas, etiqueta, nota_recontacto,
      fecha_pedido, servicio_interes, items_interes,
      mensaje_seguimiento, seguimiento_custom,
      seguimiento_fecha, mensaje_seguimiento_postventa,
      created_at
    )
    values (
      v_neg_id, v_it ->> 'id',
      coalesce(v_it ->> 'nombre',''), v_it ->> 'negocio',
      v_it ->> 'contacto', v_it ->> 'email',
      v_it ->> 'instagram', v_it ->> 'messenger',
      v_it ->> 'canalPrincipal',
      v_it ->> 'origen', v_it ->> 'etapa',
      nullif(v_it ->> 'fechaEtapa','')::date,
      v_it ->> 'estadoProspecto',
      v_it ->> 'motivoPerdida',
      case when v_it -> 'razonCierre' is not null and v_it -> 'razonCierre' <> 'null'::jsonb
           then array(select jsonb_array_elements_text(v_it -> 'razonCierre'))
           else null end,
      nullif(v_it ->> 'ultimoContacto','')::date,
      v_it ->> 'notas', v_it ->> 'etiqueta', v_it ->> 'notaRecontacto',
      nullif(v_it ->> 'fechaPedido','')::date,
      v_it ->> 'servicioInteres', v_it -> 'itemsInteres',
      v_it ->> 'mensajeSeguimiento',
      coalesce((v_it ->> 'seguimientoCustom')::boolean, false),
      nullif(v_it ->> 'seguimientoFecha','')::date,
      v_it ->> 'mensajeSeguimientoPostVenta',
      coalesce(nullif(v_it ->> 'fecha','')::timestamptz, now())
    )
    on conflict (negocio_id, cleo_id) do update set
      nombre                        = excluded.nombre,
      empresa                       = excluded.empresa,
      telefono                      = excluded.telefono,
      email                         = excluded.email,
      instagram                     = excluded.instagram,
      messenger                     = excluded.messenger,
      canal                         = excluded.canal,
      origen                        = excluded.origen,
      etapa                         = excluded.etapa,
      fecha_etapa                   = excluded.fecha_etapa,
      estado_prospecto              = excluded.estado_prospecto,
      motivo_perdida                = excluded.motivo_perdida,
      razon_cierre                  = excluded.razon_cierre,
      ultimo_contacto               = excluded.ultimo_contacto,
      notas                         = excluded.notas,
      etiqueta                      = excluded.etiqueta,
      nota_recontacto               = excluded.nota_recontacto,
      fecha_pedido                  = excluded.fecha_pedido,
      servicio_interes              = excluded.servicio_interes,
      items_interes                 = excluded.items_interes,
      mensaje_seguimiento           = excluded.mensaje_seguimiento,
      seguimiento_custom            = excluded.seguimiento_custom,
      seguimiento_fecha             = excluded.seguimiento_fecha,
      mensaje_seguimiento_postventa = excluded.mensaje_seguimiento_postventa;
  end loop;

  -- ── 7. UPSERT OPORTUNIDADES ───────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_oportunidades', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_oportunidades) then continue; end if;
    select c.id into v_uuid
      from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'clienteId');
    if v_uuid is null then
      raise notice 'OPORTUNIDADES: cliente cleo_id=% no encontrado, saltando op %.', v_it ->> 'clienteId', v_it ->> 'id';
      continue;
    end if;
    insert into public.oportunidades (
      negocio_id, cleo_id, cliente_id, modo,
      titulo, estatus, etapa,
      precio_interes, motivo_cierre,
      fecha, fecha_etapa, ultimo_contacto, fecha_cierre,
      origen_migracion
    )
    values (
      v_neg_id, v_it ->> 'id', v_uuid,
      coalesce(v_it ->> 'modo', 'servicios'),
      coalesce(v_it ->> 'titulo',''),
      coalesce(v_it ->> 'estatus','activa'),
      public.cleo_etapa_to_db(v_it ->> 'etapa'),
      nullif(v_it ->> 'precioInteres','')::numeric,
      v_it ->> 'motivoCierre',
      coalesce(nullif(v_it ->> 'fecha','')::date, current_date),
      nullif(v_it ->> 'fechaEtapa','')::date,
      nullif(v_it ->> 'ultimoContacto','')::date,
      nullif(v_it ->> 'fechaCierre','')::date,
      coalesce(v_it ->> 'origenMigracion','nueva')
    )
    on conflict (negocio_id, cleo_id) do update set
      titulo          = excluded.titulo,
      estatus         = excluded.estatus,
      etapa           = excluded.etapa,
      precio_interes  = excluded.precio_interes,
      motivo_cierre   = excluded.motivo_cierre,
      fecha_etapa     = excluded.fecha_etapa,
      ultimo_contacto = excluded.ultimo_contacto,
      fecha_cierre    = excluded.fecha_cierre;
  end loop;

  -- Mapa cotizacionId → oportunidad cleo_id (para multi-op)
  v_cot_to_op := '{}'::jsonb;
  for v_it in
    select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_oportunidades', '[]'))
  loop
    if (v_it ->> 'cotizacionId') is not null then
      v_cot_to_op := v_cot_to_op || jsonb_build_object(v_it ->> 'cotizacionId', v_it ->> 'id');
    end if;
  end loop;

  -- ── 8. UPSERT COTIZACIONES + PAGOS ───────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_cots', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_cotizaciones) then continue; end if;
    if (v_it ->> 'clienteId') = any(v_del_clientes) then continue; end if;

    select c.id into v_uuid
      from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'clienteId');

    v_uuid2 := null;
    declare
      v_es_indep boolean;
      v_op_cleo  text;
    begin
      v_op_cleo := v_cot_to_op ->> (v_it ->> 'id');
      if v_op_cleo is null then
        v_es_indep := (v_it ->> 'vinculadaOportunidadActual') = 'false'
                      or (v_it -> 'vinculadaOportunidadActual') = 'false'::jsonb;
        v_op_cleo  := case when v_es_indep
                        then 'op_cotindep_' || (v_it ->> 'id')
                        else 'op_cli_'      || (v_it ->> 'clienteId')
                      end;
      end if;
      select o.id into v_uuid2
        from public.oportunidades o
       where o.negocio_id = v_neg_id and o.cleo_id = v_op_cleo;
    end;

    begin
      insert into public.cotizaciones (
        negocio_id, cleo_id, cliente_id, oportunidad_id, oportunidad_vinculada,
        items, subtotal, monto, descuento, tipo_descuento,
        anticipo, fecha_anticipo, vigencia, vigencia_dias, tipo_pago,
        sv_condiciones, sv_condiciones_html, notas, etiqueta,
        estatus, fecha, fecha_envio, fecha_cierre, fecha_hora_cierre,
        fecha_rechazo, fecha_hora_rechazo,
        items_aceptacion, monto_aceptacion,
        postv_pago, postv_seguimiento,
        seguimiento_fecha, motivo_perdida, entregado, fecha_entrega
      )
      values (
        v_neg_id, v_it ->> 'id', v_uuid, v_uuid2, v_uuid2 is not null,
        coalesce(v_it -> 'items','[]'), coalesce((v_it ->> 'subtotal')::numeric,0),
        coalesce((v_it ->> 'monto')::numeric,0),
        coalesce(nullif(v_it ->> 'descuento','')::numeric,0),
        case when v_it ->> 'tipoDescuento' in ('porcentaje','monto') then v_it ->> 'tipoDescuento' else null end,
        coalesce(nullif(v_it ->> 'anticipo','')::numeric,0),
        nullif(v_it ->> 'fechaAnticipo','')::date,
        nullif(v_it ->> 'vigencia',''), nullif(v_it ->> 'vigenciaDias','')::int,
        v_it ->> 'tipoPago',
        nullif(v_it ->> 'svCondiciones',''), nullif(v_it ->> 'svCondicionesHtml',''),
        v_it ->> 'notas', v_it ->> 'etiqueta',
        coalesce(v_it ->> 'estatus','Pendiente'),
        nullif(v_it ->> 'fecha','')::date, nullif(v_it ->> 'fechaEnvio','')::date,
        nullif(v_it ->> 'fechaCierre','')::date, nullif(v_it ->> 'fechaHoraCierre','')::timestamptz,
        nullif(v_it ->> 'fechaRechazo','')::date, nullif(v_it ->> 'fechaHoraRechazo','')::timestamptz,
        v_it -> 'itemsAceptacion', (v_it ->> 'montoAceptacion')::numeric,
        case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
             then (v_it -> 'configPostVenta') ->> 'pago' else null end,
        case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
             when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
             else null end,
        nullif(v_it ->> 'seguimientoFecha','')::date, v_it ->> 'motivoPerdida',
        coalesce((v_it ->> 'entregado')::boolean, false), nullif(v_it ->> 'fechaEntrega','')::date
      )
      on conflict (negocio_id, cleo_id) do update set
        cliente_id          = excluded.cliente_id,
        items               = excluded.items,
        subtotal            = excluded.subtotal,
        monto               = excluded.monto,
        descuento           = excluded.descuento,
        tipo_descuento      = excluded.tipo_descuento,
        anticipo            = excluded.anticipo,
        fecha_anticipo      = excluded.fecha_anticipo,
        vigencia            = excluded.vigencia,
        vigencia_dias       = excluded.vigencia_dias,
        tipo_pago           = excluded.tipo_pago,
        sv_condiciones      = excluded.sv_condiciones,
        sv_condiciones_html = excluded.sv_condiciones_html,
        notas               = excluded.notas,
        etiqueta            = excluded.etiqueta,
        estatus             = excluded.estatus,
        fecha               = excluded.fecha,
        fecha_envio         = excluded.fecha_envio,
        fecha_cierre        = excluded.fecha_cierre,
        fecha_hora_cierre   = excluded.fecha_hora_cierre,
        fecha_rechazo       = excluded.fecha_rechazo,
        fecha_hora_rechazo  = excluded.fecha_hora_rechazo,
        postv_pago          = excluded.postv_pago,
        postv_seguimiento   = excluded.postv_seguimiento,
        seguimiento_fecha   = excluded.seguimiento_fecha,
        motivo_perdida      = excluded.motivo_perdida,
        entregado           = excluded.entregado,
        fecha_entrega       = excluded.fecha_entrega;
    exception when unique_violation then
      raise notice 'COTIZACION %: oportunidad % ya vinculada, guardada sin oportunidad_id.', v_it ->> 'id', v_uuid2;
      insert into public.cotizaciones (
        negocio_id, cleo_id, cliente_id, oportunidad_id, oportunidad_vinculada,
        items, subtotal, monto, descuento, tipo_descuento,
        anticipo, fecha_anticipo, vigencia, vigencia_dias, tipo_pago,
        sv_condiciones, sv_condiciones_html, notas, etiqueta,
        estatus, fecha, fecha_envio, fecha_cierre, fecha_hora_cierre,
        fecha_rechazo, fecha_hora_rechazo,
        items_aceptacion, monto_aceptacion,
        postv_pago, postv_seguimiento,
        seguimiento_fecha, motivo_perdida, entregado, fecha_entrega
      )
      values (
        v_neg_id, v_it ->> 'id', v_uuid, null, false,
        coalesce(v_it -> 'items','[]'), coalesce((v_it ->> 'subtotal')::numeric,0),
        coalesce((v_it ->> 'monto')::numeric,0),
        coalesce(nullif(v_it ->> 'descuento','')::numeric,0),
        case when v_it ->> 'tipoDescuento' in ('porcentaje','monto') then v_it ->> 'tipoDescuento' else null end,
        coalesce(nullif(v_it ->> 'anticipo','')::numeric,0),
        nullif(v_it ->> 'fechaAnticipo','')::date,
        nullif(v_it ->> 'vigencia',''), nullif(v_it ->> 'vigenciaDias','')::int,
        v_it ->> 'tipoPago',
        nullif(v_it ->> 'svCondiciones',''), nullif(v_it ->> 'svCondicionesHtml',''),
        v_it ->> 'notas', v_it ->> 'etiqueta',
        coalesce(v_it ->> 'estatus','Pendiente'),
        nullif(v_it ->> 'fecha','')::date, nullif(v_it ->> 'fechaEnvio','')::date,
        nullif(v_it ->> 'fechaCierre','')::date, nullif(v_it ->> 'fechaHoraCierre','')::timestamptz,
        nullif(v_it ->> 'fechaRechazo','')::date, nullif(v_it ->> 'fechaHoraRechazo','')::timestamptz,
        v_it -> 'itemsAceptacion', (v_it ->> 'montoAceptacion')::numeric,
        case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
             then (v_it -> 'configPostVenta') ->> 'pago' else null end,
        case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
             when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
             else null end,
        nullif(v_it ->> 'seguimientoFecha','')::date, v_it ->> 'motivoPerdida',
        coalesce((v_it ->> 'entregado')::boolean, false), nullif(v_it ->> 'fechaEntrega','')::date
      )
      on conflict (negocio_id, cleo_id) do nothing;
    end;

    select ct.id into v_uuid from public.cotizaciones ct
     where ct.negocio_id = v_neg_id and ct.cleo_id = (v_it ->> 'id');
    if v_uuid is not null then
      for v_sub in select value from jsonb_array_elements(coalesce(v_it -> 'pagos','[]'))
      loop
        if (v_sub ->> 'id') is null then continue; end if;
        insert into public.pagos (negocio_id, cleo_id, cotizacion_id, monto, fecha, concepto)
        values (v_neg_id, v_sub ->> 'id', v_uuid, coalesce((v_sub ->> 'monto')::numeric,0),
                nullif(v_sub ->> 'fecha','')::date, v_sub ->> 'concepto')
        on conflict (negocio_id, cleo_id) do update set
          monto=excluded.monto, fecha=excluded.fecha, concepto=excluded.concepto;
      end loop;
    end if;
  end loop;

  -- ── 9. UPSERT VENTAS + PAGOS ──────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_ventas', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_ventas) then continue; end if;
    select c.id into v_uuid from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'clienteId');
    insert into public.ventas (
      negocio_id, cleo_id, cliente_id, concepto, items, monto, tipo,
      notas, etiqueta, fecha, tipo_pago, entregado, fecha_entrega,
      postv_pago, postv_seguimiento
    )
    values (
      v_neg_id, v_it ->> 'id', v_uuid,
      v_it ->> 'concepto', coalesce(v_it -> 'items','[]'),
      coalesce((v_it ->> 'monto')::numeric,0),
      case when v_it ->> 'tipo' = 'especifico' then 'normal' else 'rapida' end,
      v_it ->> 'notas', v_it ->> 'etiqueta', nullif(v_it ->> 'fecha','')::date,
      v_it ->> 'tipoPago',
      coalesce((v_it ->> 'entregado')::boolean, false), nullif(v_it ->> 'fechaEntrega','')::date,
      case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
           then (v_it -> 'configPostVenta') ->> 'pago' else null end,
      case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
           when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
           else null end
    )
    on conflict (negocio_id, cleo_id) do update set
      cliente_id=excluded.cliente_id, concepto=excluded.concepto, items=excluded.items,
      monto=excluded.monto, tipo=excluded.tipo, notas=excluded.notas, etiqueta=excluded.etiqueta,
      fecha=excluded.fecha, tipo_pago=excluded.tipo_pago, entregado=excluded.entregado,
      fecha_entrega=excluded.fecha_entrega, postv_pago=excluded.postv_pago,
      postv_seguimiento=excluded.postv_seguimiento;

    select vt.id into v_uuid from public.ventas vt
     where vt.negocio_id = v_neg_id and vt.cleo_id = (v_it ->> 'id');
    if v_uuid is not null then
      for v_sub in select value from jsonb_array_elements(coalesce(v_it -> 'pagos','[]'))
      loop
        if (v_sub ->> 'id') is null then continue; end if;
        insert into public.pagos (negocio_id, cleo_id, venta_id, monto, fecha, concepto)
        values (v_neg_id, v_sub ->> 'id', v_uuid, coalesce((v_sub ->> 'monto')::numeric,0),
                nullif(v_sub ->> 'fecha','')::date, v_sub ->> 'concepto')
        on conflict (negocio_id, cleo_id) do update set
          monto=excluded.monto, fecha=excluded.fecha, concepto=excluded.concepto;
      end loop;
    end if;
  end loop;

  -- ── 10. UPSERT PEDIDOS + PAGOS ────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_pedidos', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_pedidos) then continue; end if;
    if (v_it ->> 'clienteId') = any(v_del_clientes) then continue; end if;
    declare
      v_cli_id uuid; v_cot_id uuid; v_op_id uuid;
    begin
      select c.id into v_cli_id from public.clientes c
       where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'clienteId');
      select ct.id into v_cot_id from public.cotizaciones ct
       where ct.negocio_id = v_neg_id and ct.cleo_id = (v_it ->> 'cotizacionId');
      select o.id into v_op_id from public.oportunidades o
       where o.negocio_id = v_neg_id and o.cleo_id = 'op_cli_' || (v_it ->> 'clienteId');

      insert into public.pedidos (
        negocio_id, cleo_id, cliente_id, cotizacion_id, oportunidad_id,
        origen_venta, items, productos, cantidad, monto_total,
        notas, etiqueta, estado_pedido, fecha, fecha_entrega, fecha_cancelacion,
        anticipo_conservado, motivo_cancelacion, motivo_cancelacion_lado,
        items_confirmacion, monto_confirmacion,
        postv_pago, postv_seguimiento
      )
      values (
        v_neg_id, v_it ->> 'id', v_cli_id, v_cot_id, v_op_id,
        coalesce(v_it ->> 'origenVenta','registro_manual'),
        coalesce(v_it -> 'items','[]'), v_it ->> 'productos',
        coalesce((v_it ->> 'cantidad')::int,0), coalesce((v_it ->> 'total')::numeric,0),
        v_it ->> 'notas', v_it ->> 'etiqueta',
        coalesce(v_it ->> 'estadoPedido','preparando'),
        nullif(v_it ->> 'fecha','')::date, nullif(v_it ->> 'fechaEntrega','')::date,
        nullif(v_it ->> 'fechaCancelacion','')::date,
        (v_it ->> 'anticipoConservado')::boolean, v_it ->> 'motivoCancelacion',
        case when v_it ->> 'motivoCancelacionLado' in ('cliente','negocio')
             then v_it ->> 'motivoCancelacionLado' else null end,
        v_it -> 'itemsConfirmacion', (v_it ->> 'montoConfirmacion')::numeric,
        case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
             then (v_it -> 'configPostVenta') ->> 'pago' else null end,
        case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
             when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
             else null end
      )
      on conflict (negocio_id, cleo_id) do update set
        cliente_id=excluded.cliente_id, cotizacion_id=excluded.cotizacion_id,
        origen_venta=excluded.origen_venta, items=excluded.items, productos=excluded.productos,
        cantidad=excluded.cantidad, monto_total=excluded.monto_total,
        notas=excluded.notas, etiqueta=excluded.etiqueta, estado_pedido=excluded.estado_pedido,
        fecha=excluded.fecha, fecha_entrega=excluded.fecha_entrega,
        fecha_cancelacion=excluded.fecha_cancelacion,
        anticipo_conservado=excluded.anticipo_conservado,
        motivo_cancelacion=excluded.motivo_cancelacion,
        motivo_cancelacion_lado=excluded.motivo_cancelacion_lado,
        postv_pago=excluded.postv_pago, postv_seguimiento=excluded.postv_seguimiento;
    end;

    select pd.id into v_uuid from public.pedidos pd
     where pd.negocio_id = v_neg_id and pd.cleo_id = (v_it ->> 'id');
    if v_uuid is not null then
      for v_sub in select value from jsonb_array_elements(coalesce(v_it -> 'pagos','[]'))
      loop
        if (v_sub ->> 'id') is null then continue; end if;
        insert into public.pagos (negocio_id, cleo_id, pedido_id, monto, fecha, concepto)
        values (v_neg_id, v_sub ->> 'id', v_uuid, coalesce((v_sub ->> 'monto')::numeric,0),
                nullif(v_sub ->> 'fecha','')::date, v_sub ->> 'concepto')
        on conflict (negocio_id, cleo_id) do update set
          monto=excluded.monto, fecha=excluded.fecha, concepto=excluded.concepto;
      end loop;
    end if;
  end loop;

  -- ── 11. UPSERT RECORDATORIOS ──────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_clientes','[]'))
  loop
    if (v_it ->> 'id') = any(v_del_clientes) then continue; end if;
    select c.id into v_uuid from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'id');
    if v_uuid is null then continue; end if;
    for v_sub in select value from jsonb_array_elements(coalesce(v_it -> 'recordatorios','[]'))
    loop
      declare
        v_rec_cleo_id text; v_rec_cat text; v_op_r_uuid uuid;
      begin
        v_rec_cleo_id := v_sub ->> 'id';
        if v_rec_cleo_id is not null and v_rec_cleo_id = any(v_del_recordatorios) then continue; end if;
        v_rec_cat := v_sub ->> 'categoria';
        if v_rec_cat is null or
           v_rec_cat not in ('pipeline','postventa','reactivacion','manual','sin_clasificar')
        then v_rec_cat := 'sin_clasificar'; end if;
        v_op_r_uuid := null;
        if (v_sub ->> 'oportunidadId') is not null then
          select o.id into v_op_r_uuid from public.oportunidades o
           where o.negocio_id = v_neg_id and o.cleo_id = (v_sub ->> 'oportunidadId');
        end if;
        insert into public.recordatorios (
          negocio_id, cleo_id, cliente_id, oportunidad_id, oportunidad_vinculada,
          categoria, texto, fecha, completado, estatus, es_personalizada, origen
        )
        values (
          v_neg_id, v_rec_cleo_id, v_uuid, v_op_r_uuid, v_op_r_uuid is not null,
          v_rec_cat, v_sub ->> 'nota', nullif(v_sub ->> 'fecha','')::date,
          coalesce((v_sub ->> 'completado')::boolean, false),
          coalesce(v_sub ->> 'estatus','pendiente'),
          coalesce((v_sub ->> 'esPersonalizada')::boolean, false),
          v_sub ->> 'origen'
        )
        on conflict (negocio_id, cleo_id) where cleo_id is not null do update set
          oportunidad_id=excluded.oportunidad_id, oportunidad_vinculada=excluded.oportunidad_vinculada,
          categoria=excluded.categoria, texto=excluded.texto, fecha=excluded.fecha,
          completado=excluded.completado, estatus=excluded.estatus,
          es_personalizada=excluded.es_personalizada, origen=excluded.origen;
      end;
    end loop;
  end loop;

  -- ── 12. INSERT HISTORIAL CONTACTOS (inmutable) ────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_clientes','[]'))
  loop
    if (v_it ->> 'id') = any(v_del_clientes) then continue; end if;
    select c.id into v_uuid from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'id');
    if v_uuid is null then continue; end if;
    for v_sub in select value from jsonb_array_elements(coalesce(v_it -> 'historialContactos','[]'))
    loop
      declare
        v_h_cleo_id text; v_h_tipo text; v_h_existente record;
      begin
        v_h_cleo_id := v_sub ->> 'id';
        v_h_tipo    := v_sub ->> 'tipo';
        if v_h_cleo_id is null then
          insert into public.historial_contactos (
            negocio_id, cliente_id, cleo_id, tipo, fecha, fecha_hora, resultado, items, monto, resumen
          ) values (
            v_neg_id, v_uuid, null, v_h_tipo,
            nullif(v_sub ->> 'fecha','')::date, nullif(v_sub ->> 'fechaHora','')::timestamptz,
            v_sub ->> 'resultado', v_sub -> 'items', (v_sub ->> 'monto')::numeric, v_sub ->> 'resumen'
          );
          continue;
        end if;
        select h.tipo into v_h_existente from public.historial_contactos h
         where h.negocio_id = v_neg_id and h.cleo_id = v_h_cleo_id limit 1;
        if not found then
          insert into public.historial_contactos (
            negocio_id, cliente_id, cleo_id, tipo, fecha, fecha_hora, resultado, items, monto, resumen
          ) values (
            v_neg_id, v_uuid, v_h_cleo_id, v_h_tipo,
            nullif(v_sub ->> 'fecha','')::date, nullif(v_sub ->> 'fechaHora','')::timestamptz,
            v_sub ->> 'resultado', v_sub -> 'items', (v_sub ->> 'monto')::numeric, v_sub ->> 'resumen'
          );
        end if;
      end;
    end loop;
  end loop;

  -- ── 13. ACTUALIZAR PERFIL EN NEGOCIOS ────────────────────────────────────
  update public.negocios set
    nombre          = coalesce(nullif(v_blob -> 'cleo_perfil' ->> 'nombre', ''),          nombre),
    nombre_contacto = coalesce(nullif(v_blob -> 'cleo_perfil' ->> 'tuNombre', ''),        nombre_contacto),
    telefono        = coalesce(nullif(v_blob -> 'cleo_perfil' ->> 'telefono', ''),        telefono),
    email           = coalesce(nullif(v_blob -> 'cleo_perfil' ->> 'email', ''),           email),
    color           = coalesce(nullif(v_blob -> 'cleo_perfil' ->> 'color', ''),           color),
    color_sec       = coalesce(nullif(v_blob -> 'cleo_perfil' ->> 'colorSecundario', ''), color_sec),
    banco           = coalesce(nullif(v_blob -> 'cleo_perfil' ->> 'banco', ''),           banco),
    cuenta          = coalesce(nullif(v_blob -> 'cleo_perfil' ->> 'bancoaccount', ''),    cuenta),
    clabe           = coalesce(nullif(v_blob -> 'cleo_perfil' ->> 'bancoclabe', ''),      clabe),
    titular         = coalesce(nullif(v_blob -> 'cleo_perfil' ->> 'bancotitular', ''),    titular),
    config          = coalesce(config, '{}'::jsonb) ||
                      jsonb_strip_nulls(jsonb_build_object(
                        'colorTexto',         nullif(v_blob -> 'cleo_perfil' ->> 'colorTexto', ''),
                        'logo',               nullif(v_blob -> 'cleo_perfil' ->> 'logo', ''),
                        'mensaje',            nullif(v_blob -> 'cleo_perfil' ->> 'mensaje', ''),
                        'condicionesPago',    nullif(v_blob -> 'cleo_perfil' ->> 'condicionesPago', ''),
                        'redesTT',            nullif(v_blob -> 'cleo_perfil' ->> 'redesTT', ''),
                        'redesIG',            nullif(v_blob -> 'cleo_perfil' ->> 'redesIG', ''),
                        'redesFB',            nullif(v_blob -> 'cleo_perfil' ->> 'redesFB', ''),
                        'bancotarjeta',       nullif(v_blob -> 'cleo_perfil' ->> 'bancotarjeta', ''),
                        'bancoinstrucciones', nullif(v_blob -> 'cleo_perfil' ->> 'bancoinstrucciones', ''),
                        'direccion',          nullif(v_blob -> 'cleo_perfil' ->> 'direccion', '')
                      ))
  where id = v_neg_id;

  -- ── 14. ACTIVAR DUAL MODE ─────────────────────────────────────────────────
  update public.negocios set schema_ver = 'dual' where id = v_neg_id;

  raise notice 'OK: % migrado a dual mode (negocio_creado=%). negocio_id=% clientes=% cots=% ventas=% pedidos=%',
    v_user_email, v_neg_creado,
    v_neg_id,
    (select count(*) from public.clientes     where negocio_id = v_neg_id),
    (select count(*) from public.cotizaciones where negocio_id = v_neg_id),
    (select count(*) from public.ventas       where negocio_id = v_neg_id),
    (select count(*) from public.pedidos      where negocio_id = v_neg_id);

end;
$migration$;

-- Verificar el resultado:
select
  u.email,
  n.schema_ver,
  (select count(*) from public.clientes     where negocio_id = n.id) as clientes,
  (select count(*) from public.cotizaciones where negocio_id = n.id) as cotizaciones,
  (select count(*) from public.ventas       where negocio_id = n.id) as ventas,
  (select count(*) from public.pedidos      where negocio_id = n.id) as pedidos
from public.negocios n
join auth.users u on u.id = n.user_id
where u.email = 'dannaacubel@gmail.com';
