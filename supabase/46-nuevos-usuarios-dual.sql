-- ══════════════════════════════════════════════════════════════════════════════
-- 46-nuevos-usuarios-dual.sql
-- CLEO Pruebas + Producción
--
-- Hace que los usuarios nuevos arranquen automáticamente en schema_ver='dual'.
--
-- CAMBIOS:
--   A. cleo_dual_read → si no existe negocio, devuelve {'estado':'negocio_nuevo'}
--      en lugar de error. cloudSync.js lo detecta y arranca el sync loop en
--      modo dual desde el primer guardado.
--
--   B. cleo_dual_flush → si no existe negocio (v_neg_id IS NULL), lo crea con
--      schema_ver='dual' en vez de devolver error 'negocio_no_encontrado'.
--      Seguro porque la función corre SECURITY DEFINER → current_user = postgres
--      → el trigger cleo_guard_negocios_reserved (que bloquea a 'authenticated')
--      no aplica dentro de esta función.
--
--   C. cleo_dual_flush → tras procesar pedidos (paso 11b), hace UPDATE para
--      backfillear evento_id desde pedidos_ids del evento. Cubre pedidos creados
--      antes de que la app empezara a escribir eventoId en el JSON, o migrados
--      desde blob donde solo existe etiqueta pero no eventoId.
--
-- PRECONDICIONES:
--   - Parches 44 y 45 aplicados (cleo_dual_read con metodo_pago y ORDER BY DESC)
--   - cloudSync.js actualizado (detecta 'negocio_nuevo' en rama sin user_data)
--
-- IDEMPOTENTE: CREATE OR REPLACE — se puede volver a correr sin efecto colateral.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── A. cleo_dual_read: devolver 'negocio_nuevo' cuando no existe negocio ──────

create or replace function public.cleo_dual_read()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_uid         uuid := auth.uid();
  v_neg_id      uuid;
  v_sv          text;
  v_updated_at  timestamptz;
  v_blob        jsonb;
  v_neg         record;
  v_ud_data     jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('estado','error','codigo','no_autenticado');
  end if;

  select n.id, n.schema_ver, n.nombre, n.nombre_contacto, n.tipo_perfil,
         n.telefono, n.email, n.color, n.color_sec,
         n.banco, n.cuenta, n.clabe, n.titular,
         n.moneda, n.productos, n.config, n.datos_ui
    into v_neg
    from public.negocios n
   where n.user_id = v_uid;

  -- FIX 46A: nuevo usuario, aún sin negocio
  if v_neg.id is null then
    return jsonb_build_object('estado','negocio_nuevo');
  end if;
  v_neg_id := v_neg.id;
  v_sv     := v_neg.schema_ver;

  if v_sv <> 'dual' then
    return jsonb_build_object('estado','error','codigo',
      case when v_sv = 'blob' then 'schema_no_dual' else 'schema_ya_relacional' end,
      'schema_ver', v_sv);
  end if;

  select ud.updated_at, ud.data
    into v_updated_at, v_ud_data
    from public.user_data ud where ud.user_id = v_uid;

  select jsonb_build_object(
    'cleo_tipo_perfil',        v_neg.tipo_perfil,
    'cleo_perfil', jsonb_build_object(
      'nombre',              coalesce(v_neg.nombre,          ''),
      'tuNombre',            v_neg.nombre_contacto,
      'tipoPerfil',          v_neg.tipo_perfil,
      'telefono',            v_neg.telefono,
      'email',               v_neg.email,
      'color',               v_neg.color,
      'colorSecundario',     v_neg.color_sec,
      'banco',               v_neg.banco,
      'bancoaccount',        v_neg.cuenta,
      'bancoclabe',          v_neg.clabe,
      'bancotitular',        v_neg.titular,
      'colorTexto',          v_neg.config ->> 'colorTexto',
      'logo',                v_neg.config ->> 'logo',
      'mensaje',             v_neg.config ->> 'mensaje',
      'condicionesPago',     v_neg.config ->> 'condicionesPago',
      'redesTT',             v_neg.config ->> 'redesTT',
      'redesIG',             v_neg.config ->> 'redesIG',
      'redesFB',             v_neg.config ->> 'redesFB',
      'bancotarjeta',        v_neg.config ->> 'bancotarjeta',
      'bancoinstrucciones',  v_neg.config ->> 'bancoinstrucciones',
      'direccion',           v_neg.config ->> 'direccion'
    ),
    'cleo_moneda',             coalesce(v_neg.moneda, 'MXN'),
    'cleo_productos',          coalesce(v_neg.productos, array[]::text[]),
    'cleo_alertas_cerradas',   coalesce(v_neg.datos_ui -> 'alertas_cerradas',   '[]'::jsonb),
    'cleo_etapas_vistas',      coalesce(v_neg.datos_ui -> 'etapas_vistas',      '[]'::jsonb),
    'cleo_streak_accion_fecha',coalesce(v_neg.datos_ui -> 'streak_accion_fecha', null),
    'cleo_streak_accion_racha',coalesce(v_neg.datos_ui -> 'streak_accion_racha', null)
  ) into v_blob;

  -- Cleo clientes
  v_blob := v_blob || jsonb_build_object('cleo_clientes', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',              c.cleo_id,
      'nombre',          c.nombre,
      'negocio',         coalesce(c.empresa,''),
      'contacto',        coalesce(c.contacto,''),
      'instagram',       coalesce(c.instagram,''),
      'messenger',       coalesce(c.messenger,''),
      'email',           coalesce(c.email,''),
      'canalPrincipal',  coalesce(c.canal_principal,'WhatsApp'),
      'origen',          coalesce(c.origen,''),
      'etapa',           public.cleo_etapa_to_ui(c.etapa),
      'notas',           coalesce(c.notas,''),
      'ultimoContacto',  c.ultimo_contacto,
      'razonCierre',     coalesce(c.razon_cierre, '[]'::jsonb),
      'tipoSeguimientoPostVenta', c.tipo_seguimiento_post_venta
    ))
    from public.clientes c
    where c.negocio_id = v_neg_id
      and not exists (
        select 1 from public.tombstones t
         where t.negocio_id = v_neg_id
           and t.tipo       = 'cliente'
           and t.cleo_id    = c.cleo_id
      )
  ), '[]'::jsonb));

  -- Cleo oportunidades
  v_blob := v_blob || jsonb_build_object('cleo_oportunidades', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',           o.cleo_id,
      'clienteId',    o.cliente_cleo_id,
      'modo',         o.modo,
      'etapa',        public.cleo_etapa_to_ui(o.etapa),
      'interes',      coalesce(o.interes,''),
      'precio',       o.precio,
      'cantidad',     o.cantidad,
      'notas',        coalesce(o.notas,''),
      'origen',       coalesce(o.origen,''),
      'creadoEn',     o.creado_en,
      'updatedAt',    o.updated_at
    ))
    from public.oportunidades o
    where o.negocio_id = v_neg_id
      and not exists (
        select 1 from public.tombstones t
         where t.negocio_id = v_neg_id
           and t.tipo       = 'oportunidad'
           and t.cleo_id    = o.cleo_id
      )
  ), '[]'::jsonb));

  -- Cleo cotizaciones
  v_blob := v_blob || jsonb_build_object('cleo_cotizaciones', coalesce((
    select jsonb_agg(ct.data order by ct.fecha desc nulls last, ct.created_at desc)
    from (
      select
        c.fecha,
        c.created_at,
        jsonb_build_object(
          'id',            c.cleo_id,
          'clienteId',     c.cliente_cleo_id,
          'oportunidadId', c.oportunidad_cleo_id,
          'estado',        c.estado,
          'fecha',         c.fecha,
          'vigencia',      c.vigencia,
          'subtotal',      c.subtotal,
          'descuento',     c.descuento,
          'total',         c.total,
          'notas',         c.notas,
          'items',         coalesce(c.items,'[]'::jsonb),
          'adjuntos',      coalesce((
            select jsonb_agg(jsonb_build_object(
              'uuid',            a.uuid::text,
              'storagePath',     a.storage_path,
              'nombreOriginal',  a.nombre_original,
              'mimeType',        a.mime_type,
              'sizeBytes',       a.size_bytes,
              'version',         a.version
            ))
            from public.archivo_adjuntos a
            where a.cotizacion_id = c.cleo_id
              and a.negocio_id    = v_neg_id
          ), '[]'::jsonb)
        ) as data
      from public.cotizaciones c
      where c.negocio_id = v_neg_id
        and not exists (
          select 1 from public.tombstones t
           where t.negocio_id = v_neg_id
             and t.tipo       = 'cotizacion'
             and t.cleo_id    = c.cleo_id
        )
    ) ct
  ), '[]'::jsonb));

  -- Cleo ventas
  v_blob := v_blob || jsonb_build_object('cleo_ventas', coalesce((
    select jsonb_agg(vt.data order by vt.fecha desc nulls last, vt.created_at desc)
    from (
      select
        v.fecha,
        v.created_at,
        jsonb_build_object(
          'id',            v.cleo_id,
          'clienteId',     v.cliente_cleo_id,
          'oportunidadId', v.oportunidad_cleo_id,
          'fecha',         v.fecha,
          'monto',         v.monto,
          'notas',         v.notas,
          'tipo',          v.tipo,
          'items',         coalesce(v.items,'[]'::jsonb),
          'pagos',         coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',          p.cleo_id,
              'monto',       p.monto,
              'fecha',       p.fecha,
              'metodoPago',  p.metodo_pago,   -- FIX 44
              'notas',       p.notas
            ) order by p.fecha)
            from public.pagos p
            where p.venta_id    = v.cleo_id
              and p.negocio_id  = v_neg_id
          ), '[]'::jsonb)
        ) as data
      from public.ventas v
      where v.negocio_id = v_neg_id
        and not exists (
          select 1 from public.tombstones t
           where t.negocio_id = v_neg_id
             and t.tipo       = 'venta'
             and t.cleo_id    = v.cleo_id
        )
    ) vt
  ), '[]'::jsonb));

  -- Cleo pedidos
  v_blob := v_blob || jsonb_build_object('cleo_pedidos', coalesce((
    select jsonb_agg(pd.data order by pd.fecha desc nulls last, pd.created_at desc)
    from (
      select
        p.fecha,
        p.created_at,
        jsonb_build_object(
          'id',            p.cleo_id,
          'clienteId',     p.cliente_cleo_id,
          'oportunidadId', p.oportunidad_cleo_id,
          'eventoId',      p.evento_id,             -- FIX 44
          'fecha',         p.fecha,
          'monto',         p.monto,
          'notas',         p.notas,
          'tipo',          p.tipo,
          'items',         coalesce(p.items,'[]'::jsonb),
          'pagos',         coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',          pp.cleo_id,
              'monto',       pp.monto,
              'fecha',       pp.fecha,
              'metodoPago',  pp.metodo_pago,   -- FIX 44
              'notas',       pp.notas
            ) order by pp.fecha)
            from public.pagos pp
            where pp.pedido_id   = p.cleo_id
              and pp.negocio_id  = v_neg_id
          ), '[]'::jsonb)
        ) as data
      from public.pedidos p
      where p.negocio_id = v_neg_id
        and not exists (
          select 1 from public.tombstones t
           where t.negocio_id = v_neg_id
             and t.tipo       = 'pedido'
             and t.cleo_id    = p.cleo_id
        )
    ) pd
  ), '[]'::jsonb));

  -- Cleo recordatorios
  v_blob := v_blob || jsonb_build_object('cleo_recordatorios', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',          r.cleo_id,
      'clienteId',   r.cliente_cleo_id,
      'fecha',       r.fecha,
      'nota',        coalesce(r.nota,''),
      'completado',  coalesce(r.completado, false),
      'origen',      coalesce(r.origen,''),
      'categoria',   coalesce(r.categoria,''),
      'esPersonalizada', coalesce(r.es_personalizada, false)
    ))
    from public.recordatorios r
    where r.negocio_id = v_neg_id
      and not exists (
        select 1 from public.tombstones t
         where t.negocio_id = v_neg_id
           and t.tipo       = 'recordatorio'
           and t.cleo_id    = r.cleo_id
      )
  ), '[]'::jsonb));

  -- Cleo tombstones
  v_blob := v_blob || jsonb_build_object('cleo_tombstones', coalesce((
    select jsonb_object_agg(t.cleo_id, jsonb_build_object(
      'tipo',      t.tipo,
      'deletedAt', t.deleted_at
    ))
    from public.tombstones t
    where t.negocio_id = v_neg_id
  ), '{}'::jsonb));

  -- Cleo eventos inventario (CAMBIO 40)
  v_blob := v_blob || jsonb_build_object('cleo_eventos_inventario', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',           ev.cleo_id,
      'nombre',       coalesce(ev.nombre,''),
      'fecha',        ev.fecha,
      'lugar',        coalesce(ev.lugar,''),
      'estado',       coalesce(ev.estado,'abierto'),
      'notas',        coalesce(ev.notas,''),
      'ventas',       coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',          evv.cleo_id,
          'productoId',  evv.producto_id,
          'cantidad',    evv.cantidad,
          'precio',      evv.precio,
          'fecha',       evv.fecha,
          'metodoPago',  evv.metodo_pago,   -- FIX 44
          'notas',       coalesce(evv.notas,''),
          'anulada',     coalesce(evv.anulada, false)
        ) order by evv.fecha)
        from public.evento_ventas evv
        where evv.evento_id  = ev.cleo_id
          and evv.negocio_id = v_neg_id
      ), '[]'::jsonb),
      'inventario',   coalesce((
        select jsonb_agg(jsonb_build_object(
          'productoId', evi.producto_id,
          'nombre',     coalesce(evi.nombre,''),
          'cantidad',   evi.cantidad,
          'precio',     evi.precio,
          'costo',      evi.costo
        ))
        from public.evento_inventario evi
        where evi.evento_id  = ev.cleo_id
          and evi.negocio_id = v_neg_id
      ), '[]'::jsonb)
    ))
    from public.eventos ev
    where ev.negocio_id = v_neg_id
      and not exists (
        select 1 from public.tombstones t
         where t.negocio_id = v_neg_id
           and t.tipo       = 'evento'
           and t.cleo_id    = ev.cleo_id
      )
  ), '[]'::jsonb));

  return jsonb_build_object(
    'estado',     'ok',
    'data',       v_blob,
    'updated_at', v_updated_at
  );

end;
$func$;




-- ── B. cleo_dual_flush: auto-crear negocio para usuarios nuevos ───────────────

create or replace function public.cleo_dual_flush(
  p_data              jsonb,
  p_tipo_perfil       text,
  p_ultimo_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_uid     uuid := auth.uid();
  v_neg_id  uuid;
  v_sv      text;
  v_ud_updated_at  timestamptz;
  v_ud_exists      boolean := false;
  v_new_updated_at timestamptz;

  v_del_clientes       text[] := '{}';
  v_del_oportunidades  text[] := '{}';
  v_del_cotizaciones   text[] := '{}';
  v_del_ventas         text[] := '{}';
  v_del_pedidos        text[] := '{}';
  v_del_recordatorios  text[] := '{}';
  v_del_adjuntos       text[] := '{}';
  v_del_eventos        text[] := '{}';   -- CAMBIO 40

  v_it      jsonb;
  v_sub     jsonb;
  v_uuid    uuid;
  v_uuid2   uuid;
  v_ci_id   uuid;
  v_ev_id   uuid;                        -- CAMBIO 40

  v_hist_conflictos jsonb := '[]'::jsonb;
  v_hist_existente  record;
  v_n int;

  -- CAMBIO 29a: mapa cotizacionId (cleo_id) → oportunidad cleo_id
  v_cot_to_op jsonb := '{}'::jsonb;
begin

  -- ── 0. AUTH ───────────────────────────────────────────────────────────────
  if v_uid is null then
    return jsonb_build_object('estado','error','codigo','no_autenticado');
  end if;

  -- ── 1. NEGOCIO + SCHEMA_VER ───────────────────────────────────────────────
  select n.id, n.schema_ver into v_neg_id, v_sv
    from public.negocios n
   where n.user_id = v_uid;

  if v_neg_id is null then
    -- Nuevo usuario: auto-crear negocio con schema_ver='dual'.
    -- Seguro porque cleo_dual_flush corre SECURITY DEFINER → current_user=postgres
    -- → el trigger cleo_guard_negocios_reserved (que bloquea 'authenticated')
    -- no aplica aquí.
    insert into public.negocios (user_id, tipo_perfil, schema_ver)
    values (v_uid, coalesce(nullif(p_tipo_perfil,''), 'servicios'), 'dual')
    returning id into v_neg_id;
    v_sv := 'dual';
  end if;

  if v_sv <> 'dual' then
    return jsonb_build_object(
      'estado','error',
      'codigo', case when v_sv = 'blob' then 'schema_no_dual' else 'schema_ya_relacional' end,
      'schema_ver', v_sv
    );
  end if;

  -- ── 2. FORMATO ────────────────────────────────────────────────────────────
  if p_data -> 'cleo_oportunidades' is null then
    return jsonb_build_object(
      'estado','error','codigo','formato_antiguo',
      'mensaje','Falta cleo_oportunidades. Actualiza la aplicación antes de guardar en modo dual.'
    );
  end if;
  if p_data -> 'cleo_tombstones' is null then
    return jsonb_build_object(
      'estado','error','codigo','formato_antiguo',
      'mensaje','Falta cleo_tombstones. Actualiza la aplicación antes de guardar en modo dual.'
    );
  end if;

  -- ── 3. BLOQUEO OPTIMISTA ──────────────────────────────────────────────────
  select ud.updated_at, true
    into v_ud_updated_at, v_ud_exists
    from public.user_data ud
   where ud.user_id = v_uid
     for update;

  if not found then
    if p_ultimo_updated_at is not null then
      return jsonb_build_object('estado','conflicto');
    end if;
    v_ud_exists := false;
  else
    if p_ultimo_updated_at is null then
      return jsonb_build_object('estado','conflicto');
    end if;
    if v_ud_updated_at is distinct from p_ultimo_updated_at then
      return jsonb_build_object('estado','conflicto');
    end if;
  end if;

  -- ── 4. RECOPILAR TOMBSTONES ───────────────────────────────────────────────
  select
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'cliente'),      '{}'),
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'oportunidad'),  '{}'),
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'cotizacion'),   '{}'),
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'venta'),        '{}'),
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'pedido'),       '{}'),
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'recordatorio'),'{}'),
    coalesce(array_agg(t ->> 'storagePath') filter (where t ->> 'tipo' = 'adjunto'),      '{}'),
    coalesce(array_agg(t ->> 'cleoId')      filter (where t ->> 'tipo' = 'evento'),       '{}')  -- CAMBIO 40
  into
    v_del_clientes, v_del_oportunidades, v_del_cotizaciones,
    v_del_ventas, v_del_pedidos, v_del_recordatorios, v_del_adjuntos,
    v_del_eventos
  from jsonb_array_elements(coalesce(p_data -> 'cleo_tombstones', '[]')) t;

  -- ── 5. PROCESAR BORRADOS ──────────────────────────────────────────────────
  perform set_config('cleo.procesando_tombstones', 'true', true);

  if array_length(v_del_adjuntos, 1) > 0 then
    delete from public.archivo_adjuntos
     where negocio_id   = v_neg_id
       and storage_path = any(v_del_adjuntos);
  end if;

  if array_length(v_del_recordatorios, 1) > 0 then
    delete from public.recordatorios
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_recordatorios);
  end if;

  if array_length(v_del_oportunidades, 1) > 0 then
    delete from public.oportunidades
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_oportunidades);
  end if;

  if array_length(v_del_cotizaciones, 1) > 0 then
    update public.cotizaciones
       set oportunidad_id = null, oportunidad_vinculada = false
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_cotizaciones);
    delete from public.cotizaciones
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_cotizaciones);
  end if;

  if array_length(v_del_ventas, 1) > 0 then
    delete from public.ventas
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_ventas);
  end if;

  if array_length(v_del_pedidos, 1) > 0 then
    delete from public.pedidos
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_pedidos);
  end if;

  if array_length(v_del_clientes, 1) > 0 then
    delete from public.clientes
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_clientes);
  end if;

  -- CAMBIO 40: borrar eventos eliminados (cascada a productos y gastos)
  if array_length(v_del_eventos, 1) > 0 then
    delete from public.eventos_inventario
     where negocio_id = v_neg_id
       and cleo_id    = any(v_del_eventos);
  end if;

  -- ── 6. UPSERT CATÁLOGO SERVICIOS ─────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_servicios', '[]'))
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

  -- ── CAMBIO 21: UPSERT CATÁLOGO PRODUCTOS con inventario ──────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_productos_cat', '[]'))
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

  -- ── CAMBIO 21b: INSERT inventario_movimientos (append-only) ──────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_productos_cat', '[]'))
  loop
    select ci.id into v_ci_id
      from public.catalogo_items ci
     where ci.negocio_id = v_neg_id
       and ci.modo       = 'productos'
       and ci.cleo_id    = (v_it ->> 'id');

    if v_ci_id is null then continue; end if;

    for v_sub in
      select value from jsonb_array_elements(coalesce(v_it -> 'movimientos', '[]'))
    loop
      if (v_sub ->> 'id') is null then continue; end if;

      insert into public.inventario_movimientos (
        negocio_id, catalogo_item_id, cleo_id,
        fecha, tipo, nota, cant_antes, cant_despues
      )
      values (
        v_neg_id, v_ci_id, v_sub ->> 'id',
        nullif(v_sub ->> 'fecha', '')::date,
        v_sub ->> 'tipo',
        v_sub ->> 'nota',
        nullif(v_sub ->> 'cantAntes', '')::int,
        nullif(v_sub ->> 'cantDespues', '')::int
      )
      on conflict (negocio_id, cleo_id)
        where cleo_id is not null
      do nothing;
    end loop;
  end loop;

  -- ── 6c. UPSERT EVENTOS INVENTARIO + PRODUCTOS + GASTOS ──────────── CAMBIO 40
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_eventos_inventario', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_eventos) then continue; end if;

    insert into public.eventos_inventario (
      negocio_id, cleo_id, nombre, fecha, fecha_fin,
      estado, fecha_cierre, pedidos_ids, movimientos
    )
    values (
      v_neg_id,
      v_it ->> 'id',
      coalesce(v_it ->> 'nombre', ''),
      nullif(v_it ->> 'fecha', '')::date,
      nullif(v_it ->> 'fechaFin', '')::date,
      coalesce(v_it ->> 'estado', 'abierto'),
      nullif(v_it ->> 'fechaCierre', '')::date,
      coalesce(v_it -> 'pedidosIds', '[]'),
      coalesce(v_it -> 'movimientos', '[]')
    )
    on conflict (negocio_id, cleo_id) do update set
      nombre       = excluded.nombre,
      fecha        = excluded.fecha,
      fecha_fin    = excluded.fecha_fin,
      estado       = excluded.estado,
      fecha_cierre = excluded.fecha_cierre,
      pedidos_ids  = excluded.pedidos_ids,
      movimientos  = excluded.movimientos
    returning id into v_ev_id;

    delete from public.eventos_productos
     where negocio_id = v_neg_id and evento_id = v_ev_id;

    for v_sub in
      select value from jsonb_array_elements(coalesce(v_it -> 'productos', '[]'))
    loop
      if (v_sub ->> 'catalogoId') is null then continue; end if;
      insert into public.eventos_productos (
        negocio_id, evento_id, catalogo_id,
        nombre, precio, cantidad, cantidad_vendida, reserva
      )
      values (
        v_neg_id, v_ev_id,
        v_sub ->> 'catalogoId',
        coalesce(v_sub ->> 'nombre', ''),
        coalesce((v_sub ->> 'precio')::numeric, 0),
        coalesce((v_sub ->> 'cantidadLlevada')::int, (v_sub ->> 'cantidad')::int, 0),
        coalesce((v_sub ->> 'cantidadVendida')::int, 0),
        nullif(v_sub ->> 'reserva', '')::int
      );
    end loop;

    for v_sub in
      select value from jsonb_array_elements(coalesce(v_it -> 'gastos', '[]'))
    loop
      if (v_sub ->> 'id') is null then continue; end if;
      insert into public.eventos_gastos (
        negocio_id, evento_id, cleo_id,
        concepto, monto, fecha, fecha_registro
      )
      values (
        v_neg_id, v_ev_id,
        v_sub ->> 'id',
        coalesce(v_sub ->> 'concepto', ''),
        coalesce((v_sub ->> 'monto')::numeric, 0),
        nullif(v_sub ->> 'fecha', '')::date,
        nullif(v_sub ->> 'fechaRegistro', '')::timestamptz
      )
      on conflict (negocio_id, cleo_id) do update set
        evento_id      = excluded.evento_id,
        concepto       = excluded.concepto,
        monto          = excluded.monto,
        fecha          = excluded.fecha,
        fecha_registro = excluded.fecha_registro;
    end loop;
  end loop;

  -- ── FIN CAMBIO 40 ─────────────────────────────────────────────────────────

  -- ── 7. UPSERT CLIENTES ────────────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_clientes', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_clientes) then continue; end if;

    insert into public.clientes (
      negocio_id, cleo_id,
      nombre, empresa, telefono, email, instagram, messenger, canal,
      origen, etapa, fecha_etapa, estado_prospecto,
      motivo_perdida, razon_cierre, ultimo_contacto,
      notas, etiqueta, nota_recontacto,
      fecha_pedido, producto_interes, precio_interes, cantidad_interes, servicio_interes, items_interes,
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
      v_it ->> 'notas', v_it ->> 'etiqueta',
      v_it ->> 'notaRecontacto',
      nullif(v_it ->> 'fechaPedido','')::date,
      nullif(v_it ->> 'productoInteres',''),
      nullif(v_it ->> 'precioInteres',''),
      nullif(v_it ->> 'cantidadInteres',''),
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
      producto_interes              = excluded.producto_interes,
      precio_interes                = excluded.precio_interes,
      cantidad_interes              = excluded.cantidad_interes,
      servicio_interes              = excluded.servicio_interes,
      items_interes                 = excluded.items_interes,
      mensaje_seguimiento           = excluded.mensaje_seguimiento,
      seguimiento_custom            = excluded.seguimiento_custom,
      seguimiento_fecha             = excluded.seguimiento_fecha,
      mensaje_seguimiento_postventa = excluded.mensaje_seguimiento_postventa;
  end loop;

  -- ── 8. UPSERT OPORTUNIDADES ───────────────────────────────────────────────
  -- CAMBIO 32: cleo_etapa_to_db normaliza title-case UI → snake_case DB
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_oportunidades', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_oportunidades) then continue; end if;

    select c.id into v_uuid
      from public.clientes c
     where c.negocio_id = v_neg_id
       and c.cleo_id    = (v_it ->> 'clienteId');

    if v_uuid is null then
      raise notice 'OPORTUNIDADES: cliente cleo_id=% no encontrado, saltando op %.',
        v_it ->> 'clienteId', v_it ->> 'id';
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

  -- CAMBIO 29b: construir mapa cotizacionId → oportunidad cleo_id
  v_cot_to_op := '{}'::jsonb;
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_oportunidades', '[]'))
  loop
    if (v_it ->> 'cotizacionId') is not null then
      v_cot_to_op := v_cot_to_op || jsonb_build_object(
        v_it ->> 'cotizacionId', v_it ->> 'id'
      );
    end if;
  end loop;

  -- ── 9. UPSERT COTIZACIONES + PAGOS ───────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_cots', '[]'))
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
      -- CAMBIO 29c: lookup multi-op primero; fallback heredado para oportunidades migradas
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
        case when v_it ->> 'tipoDescuento' in ('porcentaje','monto')
             then v_it ->> 'tipoDescuento' else null end,
        coalesce(nullif(v_it ->> 'anticipo','')::numeric,0),
        nullif(v_it ->> 'fechaAnticipo','')::date,
        nullif(v_it ->> 'vigencia',''),
        nullif(v_it ->> 'vigenciaDias','')::int,
        v_it ->> 'tipoPago',
        nullif(v_it ->> 'svCondiciones',''), nullif(v_it ->> 'svCondicionesHtml',''),
        v_it ->> 'notas', v_it ->> 'etiqueta',
        coalesce(v_it ->> 'estatus','Pendiente'),
        nullif(v_it ->> 'fecha','')::date,
        nullif(v_it ->> 'fechaEnvio','')::date,
        nullif(v_it ->> 'fechaCierre','')::date,
        nullif(v_it ->> 'fechaHoraCierre','')::timestamptz,
        nullif(v_it ->> 'fechaRechazo','')::date,
        nullif(v_it ->> 'fechaHoraRechazo','')::timestamptz,
        v_it -> 'itemsAceptacion', (v_it ->> 'montoAceptacion')::numeric,
        case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
             then (v_it -> 'configPostVenta') ->> 'pago' else null end,
        case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
             when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
             else null end,
        nullif(v_it ->> 'seguimientoFecha','')::date,
        v_it ->> 'motivoPerdida',
        coalesce((v_it ->> 'entregado')::boolean, false),
        nullif(v_it ->> 'fechaEntrega','')::date
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
      raise notice 'COTIZACION %: oportunidad % ya vinculada, guardada sin oportunidad_id.',
        v_it ->> 'id', v_uuid2;
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
        case when v_it ->> 'tipoDescuento' in ('porcentaje','monto')
             then v_it ->> 'tipoDescuento' else null end,
        coalesce(nullif(v_it ->> 'anticipo','')::numeric,0),
        nullif(v_it ->> 'fechaAnticipo','')::date,
        nullif(v_it ->> 'vigencia',''),
        nullif(v_it ->> 'vigenciaDias','')::int,
        v_it ->> 'tipoPago',
        nullif(v_it ->> 'svCondiciones',''), nullif(v_it ->> 'svCondicionesHtml',''),
        v_it ->> 'notas', v_it ->> 'etiqueta',
        coalesce(v_it ->> 'estatus','Pendiente'),
        nullif(v_it ->> 'fecha','')::date,
        nullif(v_it ->> 'fechaEnvio','')::date,
        nullif(v_it ->> 'fechaCierre','')::date,
        nullif(v_it ->> 'fechaHoraCierre','')::timestamptz,
        nullif(v_it ->> 'fechaRechazo','')::date,
        nullif(v_it ->> 'fechaHoraRechazo','')::timestamptz,
        v_it -> 'itemsAceptacion', (v_it ->> 'montoAceptacion')::numeric,
        case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
             then (v_it -> 'configPostVenta') ->> 'pago' else null end,
        case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
             when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
             else null end,
        nullif(v_it ->> 'seguimientoFecha','')::date,
        v_it ->> 'motivoPerdida',
        coalesce((v_it ->> 'entregado')::boolean, false),
        nullif(v_it ->> 'fechaEntrega','')::date
      )
      on conflict (negocio_id, cleo_id) do nothing;
    end;

    select ct.id into v_uuid
      from public.cotizaciones ct
     where ct.negocio_id = v_neg_id and ct.cleo_id = (v_it ->> 'id');

    if v_uuid is not null then
      for v_sub in select value from jsonb_array_elements(coalesce(v_it -> 'pagos','[]'))
      loop
        if (v_sub ->> 'id') is null then continue; end if;
        insert into public.pagos (negocio_id, cleo_id, cotizacion_id, monto, fecha, concepto, metodo_pago)
        values (
          v_neg_id, v_sub ->> 'id', v_uuid,
          coalesce((v_sub ->> 'monto')::numeric,0),
          nullif(v_sub ->> 'fecha','')::date,
          v_sub ->> 'concepto',
          nullif(v_sub ->> 'metodoPago','')
        )
        on conflict (negocio_id, cleo_id) do update set
          monto       = excluded.monto,
          fecha       = excluded.fecha,
          concepto    = excluded.concepto,
          metodo_pago = excluded.metodo_pago;
      end loop;
    end if;
  end loop;

  -- ── 10. UPSERT VENTAS + PAGOS ─────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_ventas', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_ventas) then continue; end if;

    select c.id into v_uuid
      from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'clienteId');

    insert into public.ventas (
      negocio_id, cleo_id, cliente_id,
      concepto, items, monto, tipo, notas, etiqueta, fecha,
      tipo_pago, entregado, fecha_entrega,
      postv_pago, postv_seguimiento
    )
    values (
      v_neg_id, v_it ->> 'id', v_uuid,
      v_it ->> 'concepto', coalesce(v_it -> 'items','[]'),
      coalesce((v_it ->> 'monto')::numeric,0),
      case when v_it ->> 'tipo' = 'especifico' then 'normal' else 'rapida' end,
      v_it ->> 'notas', v_it ->> 'etiqueta',
      nullif(v_it ->> 'fecha','')::date,
      v_it ->> 'tipoPago',
      coalesce((v_it ->> 'entregado')::boolean, false),
      nullif(v_it ->> 'fechaEntrega','')::date,
      case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
           then (v_it -> 'configPostVenta') ->> 'pago' else null end,
      case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
           when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
           else null end
    )
    on conflict (negocio_id, cleo_id) do update set
      cliente_id        = excluded.cliente_id,
      concepto          = excluded.concepto,
      items             = excluded.items,
      monto             = excluded.monto,
      tipo              = excluded.tipo,
      notas             = excluded.notas,
      etiqueta          = excluded.etiqueta,
      fecha             = excluded.fecha,
      tipo_pago         = excluded.tipo_pago,
      entregado         = excluded.entregado,
      fecha_entrega     = excluded.fecha_entrega,
      postv_pago        = excluded.postv_pago,
      postv_seguimiento = excluded.postv_seguimiento;

    select vt.id into v_uuid
      from public.ventas vt
     where vt.negocio_id = v_neg_id and vt.cleo_id = (v_it ->> 'id');

    if v_uuid is not null then
      for v_sub in select value from jsonb_array_elements(coalesce(v_it -> 'pagos','[]'))
      loop
        if (v_sub ->> 'id') is null then continue; end if;
        insert into public.pagos (negocio_id, cleo_id, venta_id, monto, fecha, concepto, metodo_pago)
        values (
          v_neg_id, v_sub ->> 'id', v_uuid,
          coalesce((v_sub ->> 'monto')::numeric,0),
          nullif(v_sub ->> 'fecha','')::date,
          v_sub ->> 'concepto',
          nullif(v_sub ->> 'metodoPago','')
        )
        on conflict (negocio_id, cleo_id) do update set
          monto       = excluded.monto,
          fecha       = excluded.fecha,
          concepto    = excluded.concepto,
          metodo_pago = excluded.metodo_pago;
      end loop;
    end if;
  end loop;

  -- ── 11. UPSERT PEDIDOS + PAGOS ────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_pedidos', '[]'))
  loop
    if (v_it ->> 'id') = any(v_del_pedidos) then continue; end if;
    if (v_it ->> 'clienteId') = any(v_del_clientes) then continue; end if;

    declare
      v_cli_id  uuid;
      v_cot_id  uuid;
      v_op_id   uuid;
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
        postv_pago, postv_seguimiento,
        evento_id
      )
      values (
        v_neg_id, v_it ->> 'id', v_cli_id, v_cot_id, v_op_id,
        coalesce(v_it ->> 'origenVenta','registro_manual'),
        coalesce(v_it -> 'items','[]'), v_it ->> 'productos',
        coalesce((v_it ->> 'cantidad')::int,0),
        coalesce((v_it ->> 'total')::numeric,0),
        v_it ->> 'notas', v_it ->> 'etiqueta',
        coalesce(v_it ->> 'estadoPedido','preparando'),
        nullif(v_it ->> 'fecha','')::date,
        nullif(v_it ->> 'fechaEntrega','')::date,
        nullif(v_it ->> 'fechaCancelacion','')::date,
        (v_it ->> 'anticipoConservado')::boolean,
        v_it ->> 'motivoCancelacion',
        case when v_it ->> 'motivoCancelacionLado' in ('cliente','negocio')
             then v_it ->> 'motivoCancelacionLado' else null end,
        v_it -> 'itemsConfirmacion',
        (v_it ->> 'montoConfirmacion')::numeric,
        case when (v_it -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
             then (v_it -> 'configPostVenta') ->> 'pago' else null end,
        case when (v_it -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
             when (v_it -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
             else null end,
        nullif(v_it ->> 'eventoId','')
      )
      on conflict (negocio_id, cleo_id) do update set
        cliente_id               = excluded.cliente_id,
        cotizacion_id            = excluded.cotizacion_id,
        origen_venta             = excluded.origen_venta,
        items                    = excluded.items,
        productos                = excluded.productos,
        cantidad                 = excluded.cantidad,
        monto_total              = excluded.monto_total,
        notas                    = excluded.notas,
        etiqueta                 = excluded.etiqueta,
        estado_pedido            = excluded.estado_pedido,
        fecha                    = excluded.fecha,
        fecha_entrega            = excluded.fecha_entrega,
        fecha_cancelacion        = excluded.fecha_cancelacion,
        anticipo_conservado      = excluded.anticipo_conservado,
        motivo_cancelacion       = excluded.motivo_cancelacion,
        motivo_cancelacion_lado  = excluded.motivo_cancelacion_lado,
        postv_pago               = excluded.postv_pago,
        postv_seguimiento        = excluded.postv_seguimiento,
        evento_id                = excluded.evento_id;
    end;

    select pd.id into v_uuid
      from public.pedidos pd
     where pd.negocio_id = v_neg_id and pd.cleo_id = (v_it ->> 'id');

    if v_uuid is not null then
      for v_sub in select value from jsonb_array_elements(coalesce(v_it -> 'pagos','[]'))
      loop
        if (v_sub ->> 'id') is null then continue; end if;
        insert into public.pagos (negocio_id, cleo_id, pedido_id, monto, fecha, concepto, metodo_pago)
        values (
          v_neg_id, v_sub ->> 'id', v_uuid,
          coalesce((v_sub ->> 'monto')::numeric,0),
          nullif(v_sub ->> 'fecha','')::date,
          v_sub ->> 'concepto',
          nullif(v_sub ->> 'metodoPago','')
        )
        on conflict (negocio_id, cleo_id) do update set
          monto       = excluded.monto,
          fecha       = excluded.fecha,
          concepto    = excluded.concepto,
          metodo_pago = excluded.metodo_pago;
      end loop;
    end if;
  end loop;

  -- ── 11b. BACKFILL evento_id EN PEDIDOS ────────────────────────────────────
  -- Pedidos creados antes de que la app escribiera eventoId quedan sin
  -- evento_id aunque el evento los lista en pedidos_ids. Este UPDATE los vincula.
  -- Corre DESPUÉS del upsert de pedidos (paso 11) para que los rows ya existan.
  update public.pedidos pd
     set evento_id = ei.cleo_id
    from public.eventos_inventario ei,
         jsonb_array_elements_text(coalesce(ei.pedidos_ids, '[]'::jsonb)) pid
   where ei.negocio_id = pd.negocio_id
     and pid           = pd.cleo_id
     and pd.evento_id  is null
     and ei.negocio_id = v_neg_id;

  -- ── 12. UPSERT RECORDATORIOS ──────────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_clientes','[]'))
  loop
    if (v_it ->> 'id') = any(v_del_clientes) then continue; end if;

    select c.id into v_uuid
      from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'id');

    if v_uuid is null then continue; end if;

    for v_sub in
      select value from jsonb_array_elements(coalesce(v_it -> 'recordatorios','[]'))
    loop
      declare
        v_rec_cleo_id text;
        v_rec_cat     text;
        v_op_r_uuid   uuid;
      begin
        v_rec_cleo_id := v_sub ->> 'id';
        if v_rec_cleo_id is not null and v_rec_cleo_id = any(v_del_recordatorios) then
          continue;
        end if;

        v_rec_cat := v_sub ->> 'categoria';
        if v_rec_cat is null or
           v_rec_cat not in ('pipeline','postventa','reactivacion','manual','sin_clasificar')
        then
          v_rec_cat := 'sin_clasificar';
        end if;

        v_op_r_uuid := null;
        if (v_sub ->> 'oportunidadId') is not null then
          select o.id into v_op_r_uuid
            from public.oportunidades o
           where o.negocio_id = v_neg_id and o.cleo_id = (v_sub ->> 'oportunidadId');
        end if;

        insert into public.recordatorios (
          negocio_id, cleo_id, cliente_id, oportunidad_id, oportunidad_vinculada,
          categoria, texto, fecha,
          completado, estatus, es_personalizada, origen
        )
        values (
          v_neg_id, v_rec_cleo_id, v_uuid, v_op_r_uuid, v_op_r_uuid is not null,
          v_rec_cat,
          v_sub ->> 'nota',
          nullif(v_sub ->> 'fecha','')::date,
          coalesce((v_sub ->> 'completado')::boolean, false),
          coalesce(v_sub ->> 'estatus','pendiente'),
          coalesce((v_sub ->> 'esPersonalizada')::boolean, false),
          v_sub ->> 'origen'
        )
        on conflict (negocio_id, cleo_id)
          where cleo_id is not null
        do update set
          oportunidad_id        = excluded.oportunidad_id,
          oportunidad_vinculada = excluded.oportunidad_vinculada,
          categoria             = excluded.categoria,
          texto                 = excluded.texto,
          fecha                 = excluded.fecha,
          completado            = excluded.completado,
          estatus               = excluded.estatus,
          es_personalizada      = excluded.es_personalizada,
          origen                = excluded.origen;
      end;
    end loop;
  end loop;

  -- ── 13. INSERT HISTORIAL CONTACTOS (inmutable) ────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_clientes','[]'))
  loop
    if (v_it ->> 'id') = any(v_del_clientes) then continue; end if;

    select c.id into v_uuid
      from public.clientes c
     where c.negocio_id = v_neg_id and c.cleo_id = (v_it ->> 'id');

    if v_uuid is null then continue; end if;

    for v_sub in
      select value from jsonb_array_elements(coalesce(v_it -> 'historialContactos','[]'))
    loop
      declare
        v_h_cleo_id text;
        v_h_tipo    text;
      begin
        v_h_cleo_id := v_sub ->> 'id';
        v_h_tipo    := v_sub ->> 'tipo';

        if v_h_cleo_id is null then
          insert into public.historial_contactos (
            negocio_id, cliente_id, cleo_id, tipo, fecha, fecha_hora,
            resultado, items, monto, resumen
          )
          values (
            v_neg_id, v_uuid, null, v_h_tipo,
            nullif(v_sub ->> 'fecha','')::date,
            nullif(v_sub ->> 'fechaHora','')::timestamptz,
            v_sub ->> 'resultado', v_sub -> 'items',
            (v_sub ->> 'monto')::numeric, v_sub ->> 'resumen'
          );
          continue;
        end if;

        select h.tipo, h.resultado, h.monto into v_hist_existente
          from public.historial_contactos h
         where h.negocio_id = v_neg_id
           and h.cleo_id    = v_h_cleo_id
         limit 1;

        if not found then
          insert into public.historial_contactos (
            negocio_id, cliente_id, cleo_id, tipo, fecha, fecha_hora,
            resultado, items, monto, resumen
          )
          values (
            v_neg_id, v_uuid, v_h_cleo_id, v_h_tipo,
            nullif(v_sub ->> 'fecha','')::date,
            nullif(v_sub ->> 'fechaHora','')::timestamptz,
            v_sub ->> 'resultado', v_sub -> 'items',
            (v_sub ->> 'monto')::numeric, v_sub ->> 'resumen'
          );
        else
          if v_hist_existente.tipo      is distinct from v_h_tipo
          or v_hist_existente.resultado is distinct from (v_sub ->> 'resultado')
          or v_hist_existente.monto     is distinct from (v_sub ->> 'monto')::numeric
          then
            v_hist_conflictos := v_hist_conflictos || jsonb_build_array(
              jsonb_build_object(
                'cleo_id',       v_h_cleo_id,
                'tipo_nuevo',    v_h_tipo,
                'tipo_guardado', v_hist_existente.tipo,
                'mensaje', 'historial_contactos inmutable: contenido distinto para el mismo id'
              )
            );
          end if;
        end if;
      end;
    end loop;
  end loop;

  -- ── 14. UPSERT ARCHIVO_ADJUNTOS ───────────────────────────────────────────
  for v_it in
    select value from jsonb_array_elements(coalesce(p_data -> 'cleo_cots','[]'))
  loop
    if (v_it ->> 'id') = any(v_del_cotizaciones) then continue; end if;
    declare v_adj jsonb; begin
      v_adj := v_it -> 'archivoAdjunto';
      if v_adj is null or v_adj = 'null'::jsonb then continue; end if;
      if coalesce(v_adj ->> 'storagePath', v_adj ->> 'path','') = '' then continue; end if;
      if (coalesce(v_adj ->> 'storagePath', v_adj ->> 'path')) = any(v_del_adjuntos) then continue; end if;

      select ct.id into v_uuid from public.cotizaciones ct
       where ct.negocio_id = v_neg_id and ct.cleo_id = (v_it ->> 'id');
      if v_uuid is null then continue; end if;

      insert into public.archivo_adjuntos (
        negocio_id, cotizacion_id, storage_path, nombre_original, mime_type, size_bytes, version
      )
      select v_neg_id, v_uuid,
        coalesce(v_adj ->> 'storagePath', v_adj ->> 'path'),
        v_adj ->> 'nombreOriginal', v_adj ->> 'mimeType',
        coalesce((v_adj ->> 'sizeBytes')::int,(v_adj ->> 'size')::int),
        coalesce((v_adj ->> 'version')::int, 1)
      where not exists (
        select 1 from public.archivo_adjuntos aa
         where aa.negocio_id    = v_neg_id
           and aa.cotizacion_id = v_uuid
           and aa.storage_path  = coalesce(v_adj ->> 'storagePath', v_adj ->> 'path')
      );
    end;
  end loop;

  -- ── 14b. ACTUALIZAR PERFIL EN NEGOCIOS ───────────────────────────────────
  update public.negocios set
    nombre          = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'nombre', ''),           nombre),
    nombre_contacto = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'tuNombre', ''),         nombre_contacto),
    telefono        = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'telefono', ''),         telefono),
    email           = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'email', ''),            email),
    color           = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'color', ''),            color),
    color_sec       = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'colorSecundario', ''),  color_sec),
    banco           = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'banco', ''),            banco),
    cuenta          = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'bancoaccount', ''),     cuenta),
    clabe           = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'bancoclabe', ''),       clabe),
    titular         = coalesce(nullif(p_data -> 'cleo_perfil' ->> 'bancotitular', ''),     titular),
    config          = coalesce(config, '{}'::jsonb) ||
                      jsonb_strip_nulls(jsonb_build_object(
                        'colorTexto',         nullif(p_data -> 'cleo_perfil' ->> 'colorTexto', ''),
                        'logo',               nullif(p_data -> 'cleo_perfil' ->> 'logo', ''),
                        'mensaje',            nullif(p_data -> 'cleo_perfil' ->> 'mensaje', ''),
                        'condicionesPago',    nullif(p_data -> 'cleo_perfil' ->> 'condicionesPago', ''),
                        'redesTT',            nullif(p_data -> 'cleo_perfil' ->> 'redesTT', ''),
                        'redesIG',            nullif(p_data -> 'cleo_perfil' ->> 'redesIG', ''),
                        'redesFB',            nullif(p_data -> 'cleo_perfil' ->> 'redesFB', ''),
                        'bancotarjeta',       nullif(p_data -> 'cleo_perfil' ->> 'bancotarjeta', ''),
                        'bancoinstrucciones', nullif(p_data -> 'cleo_perfil' ->> 'bancoinstrucciones', ''),
                        'direccion',          nullif(p_data -> 'cleo_perfil' ->> 'direccion', '')
                      ))
  where id = v_neg_id;

  -- ── 15. SYNC MARKER ──────────────────────────────────────────────────────
  -- En modo dual las tablas relacionales son la fuente de verdad.
  -- El trigger trg_user_data_schema_ver rechaza cualquier escritura a user_data
  -- cuando schema_ver='dual', así que se usa el updated_at bloqueado en el
  -- paso 3 como marca de sincronización en vez de actualizar el blob.
  v_new_updated_at := coalesce(v_ud_updated_at, now());

  -- ── 16. RETORNAR ─────────────────────────────────────────────────────────
  return jsonb_build_object(
    'estado',              'ok',
    'updated_at',          v_new_updated_at,
    'historial_conflictos', v_hist_conflictos
  );

exception when others then
  raise;

end;
$func$;
revoke execute on function public.cleo_dual_flush(jsonb, text, timestamptz) from public;
grant  execute on function public.cleo_dual_flush(jsonb, text, timestamptz) to authenticated;


-- ── Verificación ──────────────────────────────────────────────────────────────
select
  proname as funcion,
  pg_get_functiondef(oid) like '%cleo_etapa_to_ui%' as tiene_mapeo_read,
  pg_get_functiondef(oid) like '%cleo_etapa_to_db%' as tiene_mapeo_flush
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('cleo_dual_read','cleo_dual_flush','cleo_etapa_to_ui','cleo_etapa_to_db')
order by proname;

-- Resultado esperado:
--   cleo_dual_flush  | false | true
--   cleo_dual_read   | true  | false
--   cleo_etapa_to_db | false | false  (función helper)
--   cleo_etapa_to_ui | false | false  (función helper)


-- ── Verificaciones ────────────────────────────────────────────────────────────

do $$
declare
  v_src text;
begin
  select pg_get_functiondef(oid) into v_src
    from pg_proc
   where proname = 'cleo_dual_read'
     and pronamespace = 'public'::regnamespace;
  if v_src not like '%negocio_nuevo%' then
    raise exception 'FALLO: cleo_dual_read no contiene negocio_nuevo.';
  end if;
  raise notice 'OK A: cleo_dual_read → negocio_nuevo para usuarios sin negocio.';
end;
$$;

do $$
declare
  v_src text;
begin
  select pg_get_functiondef(oid) into v_src
    from pg_proc
   where proname = 'cleo_dual_flush'
     and pronamespace = 'public'::regnamespace;
  if v_src not like '%insert into public.negocios%' then
    raise exception 'FALLO: cleo_dual_flush no auto-crea negocio.';
  end if;
  raise notice 'OK B: cleo_dual_flush → auto-crea negocio en primer guardado.';
  if v_src not like '%11b. BACKFILL evento_id%' then
    raise exception 'FALLO: cleo_dual_flush no tiene backfill de evento_id en pedidos.';
  end if;
  raise notice 'OK C: cleo_dual_flush → backfill evento_id desde pedidos_ids del evento.';
end;
$$;
