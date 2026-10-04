-- ══════════════════════════════════════════════════════════════════════════════
-- 24-copia-inicial.sql
-- Copia inicial de datos de un usuario desde user_data (blob) a las tablas
-- relacionales. Idempotente: re-ejecutar no duplica ni sobreescribe.
--
-- PREREQUISITOS (en orden):
--   03-schema-relacional.sql    (tablas base)
--   07-incremental-multi-oportunidad.sql (tabla oportunidades + triggers)
--   19-inventario-costos.sql    (columnas inventario en catalogo_items)
--   23-schema-patches.sql       (columnas nuevas: notas_prospecto, origen_otro,
--                                fecha_hora_entrega, fecha_hora_cancelacion,
--                                cotizaciones.cantidad)
--
-- RESTRICCIONES:
--   • Solo para CLEO Pruebas. No ejecutar en producción.
--   • No activa schema_ver='dual'; eso es un paso separado y posterior.
--   • No modifica cloudSync.js.
--   • El usuario objetivo se identifica por su email (ver variable p_email abajo).
--
-- IDEMPOTENCIA:
--   • INSERT ... ON CONFLICT DO NOTHING en todos los objetos con cleo_id.
--   • Recordatorios legacy usan cleo_id='legacy_sf_{cliente_cleo_id}' estable.
--   • Re-ejecutar es seguro; no duplica ni sobreescribe datos existentes.
--
-- OPORTUNIDADES (52 de 76 clientes):
--   • Solo clientes con estadoProspecto declarado reciben oportunidad.
--   • 24 clientes con estadoProspecto=null se insertan solo como clientes.
--   • tipoSeguimientoPostVenta: si el cliente tiene >1 pedido, la asignación
--     se marca con origen_migracion='migrada_producto' y el valor se preserva;
--     la relación pedido→oportunidad es unívoca (1 oportunidad por cliente).
--
-- VÍNCULOS pedidos/cotizaciones:
--   • cotizacion.vinculadaOportunidadActual=true → cotizacion.oportunidad_id
--     apunta a la oportunidad del cliente (no crea oportunidad nueva).
--   • Un pedido puede apuntar a una cotización que a su vez tiene otro pedido
--     del mismo cliente (ej: Cot 1790044899000 → 2 pedidos independientes).
--     Ambos pedidos tienen cotizacion_id válido; no son duplicados.
--   • cotizacion.monto: se lee c->'monto' cuando c->'total' es null.
--     Si ambos existen con distinto valor, se usa 'total' y se reporta
--     en los comentarios de los datos; no sucede en el blob actual.
-- ══════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if to_regclass('public.negocios') is null then
    raise exception 'Tablas relacionales no existen. Corre 03-schema-relacional.sql primero.';
  end if;
  if to_regclass('public.oportunidades') is null then
    raise exception 'Tabla oportunidades no existe. Corre 07-incremental-multi-oportunidad.sql primero.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='clientes' and column_name='notas_prospecto'
  ) then
    raise exception 'Columnas nuevas no existen. Corre 23-schema-patches.sql primero.';
  end if;
end;
$guard$;

begin;

-- ══════════════════════════════════════════════════════════════════════════════
-- CONFIGURACIÓN: cambiar este email al usuario que se va a copiar
-- ══════════════════════════════════════════════════════════════════════════════
do $$ begin
  raise notice 'Iniciando copia inicial para el usuario objetivo.';
  raise notice 'Verificar que p_email corresponde al usuario correcto antes de ejecutar.';
end $$;

-- ── CTE principal: extrae el blob del usuario objetivo ─────────────────────
-- Sustituir 'dual10@cleo.test' por el email real del usuario en CLEO Pruebas.
-- El blob es el campo 'data' de user_data, un JSONB con las CLEO_KEYS al nivel raíz.

with
  target_user as (
    select u.id as user_id, ud.data as blob
    from auth.users u
    join public.user_data ud on ud.user_id = u.id
    where u.email = 'dual10@cleo.test'
    limit 1
  ),

-- ── 1. negocio ────────────────────────────────────────────────────────────────
  upsert_negocio as (
    insert into public.negocios (
      user_id, nombre, nombre_contacto, tipo_perfil,
      telefono, email, color, color_sec,
      banco, cuenta, clabe, titular, moneda,
      config, datos_ui, schema_ver
    )
    select
      tu.user_id,
      coalesce(tu.blob->'cleo_perfil'->>'nombre', ''),
      tu.blob->'cleo_perfil'->>'tuNombre',
      coalesce(tu.blob->>'cleo_tipo_perfil', tu.blob->'cleo_perfil'->>'tipoPerfil', 'servicios'),
      tu.blob->'cleo_perfil'->>'telefono',
      tu.blob->'cleo_perfil'->>'email',
      tu.blob->'cleo_perfil'->>'color',
      tu.blob->'cleo_perfil'->>'colorSecundario',
      tu.blob->'cleo_perfil'->>'banco',
      tu.blob->'cleo_perfil'->>'bancoaccount',
      tu.blob->'cleo_perfil'->>'bancoclabe',
      tu.blob->'cleo_perfil'->>'bancotitular',
      coalesce(tu.blob->'cleo_perfil'->>'moneda', 'MXN'),
      -- config: campos de marca/visualización que no tienen columna propia
      jsonb_strip_nulls(jsonb_build_object(
        'logo',               tu.blob->'cleo_perfil'->'logo',
        'mensaje',            tu.blob->'cleo_perfil'->'mensaje',
        'condicionesPago',    tu.blob->'cleo_perfil'->'condicionesPago',
        'redesFB',            tu.blob->'cleo_perfil'->'redesFB',
        'redesIG',            tu.blob->'cleo_perfil'->'redesIG',
        'redesTT',            tu.blob->'cleo_perfil'->'redesTT',
        'colorTexto',         tu.blob->'cleo_perfil'->'colorTexto',
        'bancotarjeta',       tu.blob->'cleo_perfil'->'bancotarjeta',
        'bancoinstrucciones', tu.blob->'cleo_perfil'->'bancoinstrucciones',
        'direccion',          tu.blob->'cleo_perfil'->'direccion',
        'condiciones',        tu.blob->'cleo_perfil'->'condiciones'
      )),
      -- datos_ui: estado de interfaz
      jsonb_strip_nulls(jsonb_build_object(
        'onboardingListo',      tu.blob->'cleo_perfil'->'onboardingListo',
        'alertas_cerradas',     tu.blob->'cleo_alertas_cerradas',
        'etapas_vistas',        tu.blob->'cleo_etapas_vistas',
        'streak_prod',          tu.blob->'cleo_streak_accion_prod',
        'streak_serv',          tu.blob->'cleo_streak_accion_serv'
      )),
      'blob'   -- schema_ver permanece en 'blob' hasta activación dual (paso separado)
    from target_user tu
    on conflict (user_id) do nothing
    returning id, user_id
  ),

  -- helper: negocio_id del usuario (recién insertado o ya existente)
  negocio_ref as (
    select id as negocio_id, user_id
    from upsert_negocio
    union all
    select n.id as negocio_id, n.user_id
    from public.negocios n
    join target_user tu on tu.user_id = n.user_id
    where not exists (select 1 from upsert_negocio)
    limit 1
  ),

-- ── 2. clientes ──────────────────────────────────────────────────────────────
  insert_clientes as (
    insert into public.clientes (
      negocio_id, cleo_id, nombre, empresa, telefono, email,
      instagram, messenger, canal,
      origen, origen_otro,
      etapa, fecha_etapa, estado_prospecto,
      motivo_perdida, razon_cierre, ultimo_contacto,
      notas, notas_prospecto, etiqueta,
      nota_recontacto, fecha_pedido, servicio_interes,
      items_interes,
      mensaje_seguimiento, seguimiento_custom
    )
    select
      nr.negocio_id,
      (c->>'id'),
      coalesce(c->>'nombre', ''),
      c->>'negocio',
      c->>'contacto',
      c->>'email',
      c->>'instagram',
      c->>'messenger',
      c->>'canalPrincipal',
      c->>'origen',
      c->>'origenOtro',           -- → clientes.origen_otro
      c->>'etapa',
      nullif(c->>'fechaEtapa', '')::date,
      c->>'estadoProspecto',
      c->>'motivoPerdida',
      -- razonCierre puede ser array JSON
      case when c->'razonCierre' is not null
           then array(select jsonb_array_elements_text(c->'razonCierre'))
           else null end,
      nullif(c->>'ultimoContacto', '')::date,
      c->>'notas',
      c->>'notasProspecto',       -- → clientes.notas_prospecto
      c->>'etiqueta',
      c->>'notaRecontacto',
      nullif(c->>'fechaPedido', '')::date,
      c->>'servicioInteres',
      -- items_interes: alias 'items' en blobs recientes; usar el que exista
      coalesce(c->'itemsInteres', c->'items'),
      c->>'mensajeSeguimiento',
      coalesce(nullif(c->>'seguimientoCustom', '')::boolean, false)
    from negocio_ref nr cross join
         jsonb_array_elements(
           coalesce((select blob->'cleo_clientes' from target_user), '[]'::jsonb)
         ) as c
    on conflict (negocio_id, cleo_id) do nothing
    returning id, negocio_id, cleo_id, estado_prospecto
  ),

  -- helper: mapa cleo_id → uuid de clientes (recién insertados + ya existentes)
  clientes_map as (
    select id as cliente_id, negocio_id, cleo_id, estado_prospecto
    from insert_clientes
    union all
    select cl.id, cl.negocio_id, cl.cleo_id, cl.estado_prospecto
    from public.clientes cl
    join negocio_ref nr on nr.negocio_id = cl.negocio_id
    where not exists (select 1 from insert_clientes ic where ic.cleo_id = cl.cleo_id and ic.negocio_id = cl.negocio_id)
  ),

-- ── 3. catálogo ──────────────────────────────────────────────────────────────
  insert_catalogo_prod as (
    insert into public.catalogo_items (
      negocio_id, cleo_id, modo,
      nombre, precio, descripcion, condiciones,
      inventario_activo, stock, stock_minimo, costo_config
    )
    select
      nr.negocio_id,
      (p->>'id'),
      'productos',
      coalesce(p->>'nombre', ''),
      coalesce((p->>'precio')::numeric, 0),
      p->>'descripcion',
      p->>'condiciones',
      coalesce((p->>'inventarioActivo')::boolean, false),
      case when (p->>'inventarioActivo')::boolean then nullif(p->>'stock', '')::int else null end,
      nullif(p->>'stockMinimo', '')::int,
      p->'costoConfig'
    from negocio_ref nr cross join
         jsonb_array_elements(
           coalesce((select blob->'cleo_productos_cat' from target_user), '[]'::jsonb)
         ) as p
    on conflict (negocio_id, modo, cleo_id) do nothing
    returning id, negocio_id, cleo_id
  ),

  insert_catalogo_serv as (
    insert into public.catalogo_items (
      negocio_id, cleo_id, modo,
      nombre, precio, descripcion, condiciones
    )
    select
      nr.negocio_id,
      (s->>'id'),
      'servicios',
      coalesce(s->>'nombre', ''),
      coalesce((s->>'precio')::numeric, 0),
      s->>'descripcion',
      s->>'condiciones'
    from negocio_ref nr cross join
         jsonb_array_elements(
           coalesce((select blob->'cleo_servicios' from target_user), '[]'::jsonb)
         ) as s
    on conflict (negocio_id, modo, cleo_id) do nothing
    returning id, negocio_id, cleo_id
  ),

-- ── 4. oportunidades ─────────────────────────────────────────────────────────
-- Solo clientes con estadoProspecto declarado.
-- Reglas modo productos:
--   estadoProspecto='Convertido' → estatus='ganada',  etapa='convertido'
--   estadoProspecto='Nueva'      → estatus='activa',  etapa='nueva'
--   estadoProspecto='En seguimiento' → estatus='activa', etapa='en_seguimiento'
--   estadoProspecto='Sin respuesta'  → estatus='activa', etapa='sin_respuesta'
--   estadoProspecto='Perdido'    → estatus='perdida', etapa='perdido'
-- tipoSeguimientoPostVenta: se preserva aunque el cliente tenga múltiples pedidos;
--   la relación pedido→oportunidad es 1:1 por cliente en esta migración.
  insert_oportunidades as (
    insert into public.oportunidades (
      negocio_id, cleo_id, cliente_id, modo,
      titulo, estatus, etapa,
      tipo_seguimiento_postventa,
      fecha_etapa, ultimo_contacto, fecha_cierre,
      origen_migracion
    )
    select
      cm.negocio_id,
      -- cleo_id de oportunidad: 'op_' + cleo_id del cliente (estable)
      'op_' || cm.cleo_id,
      cm.cliente_id,
      'productos',
      -- titulo: productoInteres si existe, si no 'Conversión de cliente'
      coalesce(
        (select c2->>'productoInteres'
         from jsonb_array_elements(
           coalesce((select blob->'cleo_clientes' from target_user), '[]'::jsonb)
         ) as c2
         where c2->>'id' = cm.cleo_id
         limit 1),
        'Conversión de cliente'
      ),
      -- estatus según estadoProspecto
      case cm.estado_prospecto
        when 'Convertido'       then 'ganada'
        when 'Perdido'          then 'perdida'
        else 'activa'
      end,
      -- etapa según estadoProspecto
      case cm.estado_prospecto
        when 'Convertido'       then 'convertido'
        when 'Perdido'          then 'perdido'
        when 'En seguimiento'   then 'en_seguimiento'
        when 'Sin respuesta'    then 'sin_respuesta'
        else 'nueva'
      end,
      -- tipoSeguimientoPostVenta: camelCase o snake_case; nullif para evitar CHECK con ''
      (select nullif(coalesce(c2->>'tipoSeguimientoPostVenta', c2->>'tipo_seguimiento_postventa'), '')
       from jsonb_array_elements(
         coalesce((select blob->'cleo_clientes' from target_user), '[]'::jsonb)
       ) as c2
       where c2->>'id' = cm.cleo_id
       limit 1),
      -- fechas
      (select nullif(c2->>'fechaEtapa', '')::date
       from jsonb_array_elements(
         coalesce((select blob->'cleo_clientes' from target_user), '[]'::jsonb)
       ) as c2
       where c2->>'id' = cm.cleo_id limit 1),
      (select nullif(c2->>'ultimoContacto', '')::date
       from jsonb_array_elements(
         coalesce((select blob->'cleo_clientes' from target_user), '[]'::jsonb)
       ) as c2
       where c2->>'id' = cm.cleo_id limit 1),
      -- fecha_cierre solo si ganada o perdida
      case when cm.estado_prospecto in ('Convertido', 'Perdido') then
          (select nullif(c2->>'fechaEtapa', '')::date
           from jsonb_array_elements(
             coalesce((select blob->'cleo_clientes' from target_user), '[]'::jsonb)
           ) as c2
           where c2->>'id' = cm.cleo_id limit 1)
        else null
      end,
      'migrada_producto'
    from clientes_map cm
    where cm.estado_prospecto is not null    -- los 24 sin estadoProspecto quedan fuera
    on conflict (negocio_id, cleo_id) do nothing
    returning id, negocio_id, cleo_id, cliente_id
  ),

  -- helper: mapa cleo_id_oportunidad → uuid
  oportunidades_map as (
    select id as op_id, negocio_id, cleo_id as op_cleo_id, cliente_id
    from insert_oportunidades
    union all
    select op.id, op.negocio_id, op.cleo_id, op.cliente_id
    from public.oportunidades op
    join negocio_ref nr on nr.negocio_id = op.negocio_id
    where not exists (select 1 from insert_oportunidades io where io.cleo_id = op.cleo_id and io.negocio_id = op.negocio_id)
  ),

-- ── 5. cotizaciones ──────────────────────────────────────────────────────────
-- monto efectivo: usar 'total' si existe; si no, 'monto'.
-- Si ambos existen con distinto valor, se usa 'total' (canónico).
-- Las 3 cotizaciones del blob actual usan 'monto' (total=null): 750, 860, 350.
  insert_cotizaciones as (
    insert into public.cotizaciones (
      negocio_id, cleo_id, cliente_id, oportunidad_id,
      items, subtotal, monto, cantidad, descuento, tipo_descuento,
      anticipo, fecha_anticipo, vigencia, vigencia_dias, tipo_pago,
      sv_condiciones, sv_condiciones_html,
      notas, etiqueta, estatus,
      fecha, fecha_envio, fecha_cierre, fecha_hora_cierre,
      fecha_rechazo, fecha_hora_rechazo,
      items_aceptacion, monto_aceptacion,
      postv_pago, postv_seguimiento,
      seguimiento_fecha, seguimiento_estado
    )
    select
      nr.negocio_id,
      (c->>'id'),
      cm.cliente_id,
      -- oportunidad_id: si vinculadaOportunidadActual=true, apunta a la op del cliente
      case
        when (c->>'vinculadaOportunidadActual')::boolean is not false
          then om.op_id
        else null
      end,
      coalesce(c->'items', '[]'::jsonb),
      coalesce(nullif(c->>'subtotal', '')::numeric, 0),
      -- monto efectivo: coalesce(total, monto)
      coalesce(
        nullif(c->>'total', '')::numeric,
        nullif(c->>'monto', '')::numeric,
        0
      ),
      nullif(c->>'cantidad', '')::int,      -- suma de unidades (columna nueva)
      coalesce(nullif(c->>'descuento', '')::numeric, 0),
      nullif(c->>'tipoDescuento', ''),
      coalesce(nullif(c->>'anticipo', '')::numeric, 0),
      nullif(c->>'fechaAnticipo', '')::date,
      c->>'vigencia',
      nullif(c->>'vigenciaDias', '')::int,
      c->>'tipoPago',
      -- sv_condiciones: alias svCondiciones en blobs recientes
      coalesce(c->>'condicionesServicio', c->>'svCondiciones'),
      coalesce(c->>'condicionesServicioHTML', c->>'svCondicionesHtml'),
      c->>'notas',
      c->>'etiqueta',
      coalesce(c->>'estatus', 'Pendiente'),
      nullif(c->>'fecha', '')::date,
      nullif(c->>'fechaEnvio', '')::date,
      nullif(c->>'fechaCierre', '')::date,
      nullif(c->>'fechaHoraCierre', '')::timestamptz,
      nullif(c->>'fechaRechazo', '')::date,
      nullif(c->>'fechaHoraRechazo', '')::timestamptz,
      c->'itemsAceptacion',
      nullif(c->>'montoAceptacion', '')::numeric,
      nullif(c->'configPostVenta'->>'pago', ''),
      nullif(c->'configPostVenta'->>'seguimiento', ''),
      nullif(c->>'seguimientoFecha', '')::date,
      nullif(c->>'seguimientoEstado', '')
    from negocio_ref nr cross join
         jsonb_array_elements(
           coalesce((select blob->'cleo_cots' from target_user), '[]'::jsonb)
         ) as c
         -- join al cliente
         left join clientes_map cm
           on cm.cleo_id = (c->>'clienteId') and cm.negocio_id = nr.negocio_id
         -- join a la oportunidad del cliente (si vinculadaOportunidadActual)
         left join oportunidades_map om
           on om.cliente_id = cm.cliente_id
          and om.negocio_id = nr.negocio_id
    on conflict (negocio_id, cleo_id) do nothing
    returning id, negocio_id, cleo_id
  ),

  cots_map as (
    select id as cot_id, negocio_id, cleo_id as cot_cleo_id
    from insert_cotizaciones
    union all
    select ct.id, ct.negocio_id, ct.cleo_id
    from public.cotizaciones ct
    join negocio_ref nr on nr.negocio_id = ct.negocio_id
    where not exists (select 1 from insert_cotizaciones ic where ic.cleo_id = ct.cleo_id and ic.negocio_id = ct.negocio_id)
  ),

-- ── 6. pedidos ───────────────────────────────────────────────────────────────
-- Un pedido puede compartir cotizacion_id con otro pedido del mismo cliente
-- (ej: Cot 1790044899000 tiene 2 pedidos independientes). Ambos son válidos.
  insert_pedidos as (
    insert into public.pedidos (
      negocio_id, cleo_id, cliente_id, cotizacion_id, oportunidad_id,
      items, productos, cantidad, monto_total,
      notas, etiqueta, estado_pedido,
      fecha, fecha_entrega, fecha_hora_entrega,
      fecha_cancelacion, fecha_hora_cancelacion,
      anticipo_conservado, motivo_cancelacion, motivo_cancelacion_lado,
      items_confirmacion, monto_confirmacion,
      origen_venta,
      postv_pago, postv_seguimiento
    )
    select
      nr.negocio_id,
      (p->>'id'),
      cm.cliente_id,
      ctm.cot_id,
      -- oportunidad_id: oportunidad del cliente (si existe)
      om.op_id,
      coalesce(p->'items', '[]'::jsonb),
      p->>'productos',
      coalesce(nullif(p->>'cantidad', '')::int, 0),
      coalesce(nullif(p->>'total', '')::numeric, 0),  -- ⚑ blob usa 'total', no 'montoTotal'
      p->>'notas',
      p->>'etiqueta',
      -- estadoPedido normalizado: 'pendiente'→'preparando'
      coalesce(
        case p->>'estadoPedido'
          when 'pendiente'   then 'preparando'
          when 'Preparando'  then 'preparando'
          when 'Entregado'   then 'entregado'
          when 'Cancelado'   then 'cancelado'
          else p->>'estadoPedido'
        end,
        'preparando'
      ),
      nullif(p->>'fecha', '')::date,
      nullif(p->>'fechaEntrega', '')::date,
      nullif(p->>'fechaHoraEntrega', '')::timestamptz,      -- columna nueva
      nullif(p->>'fechaCancelacion', '')::date,
      nullif(p->>'fechaHoraCancelacion', '')::timestamptz,  -- columna nueva
      nullif(p->>'anticipoConservado', '')::boolean,
      p->>'motivoCancelacion',
      nullif(p->>'motivoCancelacionLado', ''),
      p->'itemsConfirmacion',
      nullif(p->>'montoConfirmacion', '')::numeric,
      coalesce(p->>'origenVenta', 'registro_manual'),
      nullif(p->'configPostVenta'->>'pago', ''),
      nullif(p->'configPostVenta'->>'seguimiento', '')
    from negocio_ref nr cross join
         jsonb_array_elements(
           coalesce((select blob->'cleo_pedidos' from target_user), '[]'::jsonb)
         ) as p
         left join clientes_map cm
           on cm.cleo_id = (p->>'clienteId') and cm.negocio_id = nr.negocio_id
         left join cots_map ctm
           on ctm.cot_cleo_id = (p->>'cotizacionId')::text and ctm.negocio_id = nr.negocio_id
         left join oportunidades_map om
           on om.cliente_id = cm.cliente_id and om.negocio_id = nr.negocio_id
    on conflict (negocio_id, cleo_id) do nothing
    returning id, negocio_id, cleo_id
  ),

  peds_map as (
    select id as ped_id, negocio_id, cleo_id as ped_cleo_id
    from insert_pedidos
    union all
    select pd.id, pd.negocio_id, pd.cleo_id
    from public.pedidos pd
    join negocio_ref nr on nr.negocio_id = pd.negocio_id
    where not exists (select 1 from insert_pedidos ip where ip.cleo_id = pd.cleo_id and ip.negocio_id = pd.negocio_id)
  ),

-- ── 7. ventas ────────────────────────────────────────────────────────────────
  insert_ventas as (
    insert into public.ventas (
      negocio_id, cleo_id, cliente_id,
      concepto, items, monto, tipo,
      notas, etiqueta, fecha, fecha_hora,
      postv_pago, postv_seguimiento
    )
    select
      nr.negocio_id,
      (v->>'id'),
      cm.cliente_id,
      v->>'concepto',
      coalesce(v->'items', '[]'::jsonb),
      coalesce(nullif(v->>'monto', '')::numeric, 0),
      case v->>'tipo'
        when 'especifico' then 'normal'
        else 'rapida'
      end,
      v->>'notas',
      v->>'etiqueta',
      nullif(v->>'fecha', '')::date,
      nullif(v->>'fechaHora', '')::timestamptz,
      null,  -- postv_pago: no hay configPostVenta en ventas
      null
    from negocio_ref nr cross join
         jsonb_array_elements(
           coalesce((select blob->'cleo_ventas' from target_user), '[]'::jsonb)
         ) as v
         left join clientes_map cm
           on cm.cleo_id = (v->>'clienteId') and cm.negocio_id = nr.negocio_id
    on conflict (negocio_id, cleo_id) do nothing
    returning id, negocio_id, cleo_id
  ),

  vtas_map as (
    select id as vta_id, negocio_id, cleo_id as vta_cleo_id
    from insert_ventas
    union all
    select vt.id, vt.negocio_id, vt.cleo_id
    from public.ventas vt
    join negocio_ref nr on nr.negocio_id = vt.negocio_id
    where not exists (select 1 from insert_ventas iv where iv.cleo_id = vt.cleo_id and iv.negocio_id = vt.negocio_id)
  ),

-- ── 8. pagos ─────────────────────────────────────────────────────────────────
-- Una fila por pago, exactamente un documento (cotización | pedido | venta).
  insert_pagos_cots as (
    insert into public.pagos (
      negocio_id, cleo_id, cotizacion_id, monto, fecha, fecha_hora_pago, concepto
    )
    select
      nr.negocio_id,
      (pg->>'id'),
      ctm.cot_id,
      coalesce(nullif(pg->>'monto', '')::numeric, 0),
      nullif(pg->>'fecha', '')::date,
      null,  -- fecha_hora_pago: no en pagos de cotizaciones del blob actual
      pg->>'concepto'
    from negocio_ref nr cross join
         jsonb_array_elements(
           coalesce((select blob->'cleo_cots' from target_user), '[]'::jsonb)
         ) as c cross join
         jsonb_array_elements(coalesce(c->'pagos', '[]'::jsonb)) as pg
         join cots_map ctm
           on ctm.cot_cleo_id = (c->>'id') and ctm.negocio_id = nr.negocio_id
    where pg->>'id' is not null
    on conflict (negocio_id, cleo_id) do nothing
    returning id, negocio_id, cleo_id
  ),

  insert_pagos_peds as (
    insert into public.pagos (
      negocio_id, cleo_id, pedido_id, monto, fecha, fecha_hora_pago, concepto
    )
    select
      nr.negocio_id,
      (pg->>'id'),
      pm.ped_id,
      coalesce(nullif(pg->>'monto', '')::numeric, 0),
      nullif(pg->>'fecha', '')::date,
      null,
      pg->>'concepto'
    from negocio_ref nr cross join
         jsonb_array_elements(
           coalesce((select blob->'cleo_pedidos' from target_user), '[]'::jsonb)
         ) as p cross join
         jsonb_array_elements(coalesce(p->'pagos', '[]'::jsonb)) as pg
         join peds_map pm
           on pm.ped_cleo_id = (p->>'id') and pm.negocio_id = nr.negocio_id
    where pg->>'id' is not null
    on conflict (negocio_id, cleo_id) do nothing
    returning id, negocio_id, cleo_id
  ),

  insert_pagos_vtas as (
    insert into public.pagos (
      negocio_id, cleo_id, venta_id, monto, fecha, fecha_hora_pago, concepto
    )
    select
      nr.negocio_id,
      (pg->>'id'),
      vm.vta_id,
      coalesce(nullif(pg->>'monto', '')::numeric, 0),
      nullif(pg->>'fecha', '')::date,
      null,
      pg->>'concepto'
    from negocio_ref nr cross join
         jsonb_array_elements(
           coalesce((select blob->'cleo_ventas' from target_user), '[]'::jsonb)
         ) as v cross join
         jsonb_array_elements(coalesce(v->'pagos', '[]'::jsonb)) as pg
         join vtas_map vm
           on vm.vta_cleo_id = (v->>'id') and vm.negocio_id = nr.negocio_id
    where pg->>'id' is not null
    on conflict (negocio_id, cleo_id) do nothing
    returning id, negocio_id, cleo_id
  ),

-- ── 9. historial_contactos ───────────────────────────────────────────────────
  insert_historial as (
    insert into public.historial_contactos (
      negocio_id, cleo_id, cliente_id,
      tipo, descripcion, monto, cotizacion_id, fecha
    )
    select
      nr.negocio_id,
      (h->>'id'),
      cm.cliente_id,
      (h->>'tipo'),
      h->>'descripcion',
      coalesce(nullif(h->>'monto', '')::numeric, 0),
      ctm.cot_id,
      coalesce(nullif(h->>'fecha', '')::timestamptz, now())
    from negocio_ref nr cross join
         jsonb_array_elements(
           coalesce((select blob->'cleo_clientes' from target_user), '[]'::jsonb)
         ) as c cross join
         jsonb_array_elements(coalesce(c->'historialContactos', '[]'::jsonb)) as h
         join clientes_map cm
           on cm.cleo_id = (c->>'id') and cm.negocio_id = nr.negocio_id
         left join cots_map ctm
           on ctm.cot_cleo_id = (h->>'cotizacionId') and ctm.negocio_id = nr.negocio_id
    where h->>'id' is not null
    on conflict do nothing
    returning id, negocio_id, cleo_id
  ),

-- ── 10. recordatorios — array ─────────────────────────────────────────────────
  insert_recordatorios_array as (
    insert into public.recordatorios (
      negocio_id, cleo_id, cliente_id,
      categoria, texto, fecha,
      completado, estatus, fecha_atendido,
      es_personalizada, origen,
      oportunidad_id, oportunidad_vinculada
    )
    select
      nr.negocio_id,
      (r->>'id'),
      cm.cliente_id,
      coalesce(r->>'categoria', 'manual'),
      r->>'nota',                          -- ⚑ blob usa 'nota', schema usa 'texto'
      nullif(r->>'fecha', '')::date,
      coalesce(nullif(r->>'completado', '')::boolean, false),
      case when nullif(r->>'completado', '')::boolean then 'atendido' else 'pendiente' end,
      nullif(r->>'fechaAtendido', '')::date,
      coalesce(nullif(r->>'esPersonalizada', '')::boolean, false),
      r->>'origen',
      null,  -- oportunidad_id: no asignar sin evidencia explícita
      false
    from negocio_ref nr cross join
         jsonb_array_elements(
           coalesce((select blob->'cleo_clientes' from target_user), '[]'::jsonb)
         ) as c cross join
         jsonb_array_elements(coalesce(c->'recordatorios', '[]'::jsonb)) as r
         join clientes_map cm
           on cm.cleo_id = (c->>'id') and cm.negocio_id = nr.negocio_id
    where r->>'id' is not null
    on conflict (negocio_id, cleo_id) where cleo_id is not null do nothing
    returning id, negocio_id, cleo_id
  ),

-- ── 11. recordatorios — legacy seguimientoFecha ───────────────────────────────
-- cleo_id estable: 'legacy_sf_' + cliente.cleo_id (garantiza deduplicación).
-- categoría: 'sin_clasificar' (aprobado: sin evidencia de otra categoría).
-- oportunidad_id: null (no asignar sin evidencia explícita).
  insert_recordatorios_legacy as (
    insert into public.recordatorios (
      negocio_id, cleo_id, cliente_id,
      categoria, texto, fecha,
      completado, estatus,
      es_personalizada, origen,
      oportunidad_id, oportunidad_vinculada
    )
    select
      nr.negocio_id,
      'legacy_sf_' || (c->>'id'),          -- ID estable para deduplicación
      cm.cliente_id,
      'sin_clasificar',                    -- categoría aprobada
      c->>'mensajeSeguimientoPostVenta',
      nullif(c->>'seguimientoFecha', '')::date,
      false,
      'pendiente',
      coalesce(nullif(c->>'seguimientoEsPersonalizada', '')::boolean, false),
      'cleo',
      null,
      false
    from negocio_ref nr cross join
         jsonb_array_elements(
           coalesce((select blob->'cleo_clientes' from target_user), '[]'::jsonb)
         ) as c
         join clientes_map cm
           on cm.cleo_id = (c->>'id') and cm.negocio_id = nr.negocio_id
    where c->>'seguimientoFecha' is not null
    on conflict (negocio_id, cleo_id) where cleo_id is not null do nothing
    returning id, negocio_id, cleo_id
  )

-- Ejecutar todas las CTEs (PostgreSQL requiere al menos un SELECT al final)
select
  (select count(*) from negocio_ref)                as negocios_ref,
  (select count(*) from insert_clientes)            as clientes_insertados,
  (select count(*) from insert_oportunidades)       as oportunidades_insertadas,
  (select count(*) from insert_cotizaciones)        as cotizaciones_insertadas,
  (select count(*) from insert_pedidos)             as pedidos_insertados,
  (select count(*) from insert_ventas)              as ventas_insertadas,
  (select count(*) from insert_pagos_cots)          as pagos_cots_insertados,
  (select count(*) from insert_pagos_peds)          as pagos_peds_insertados,
  (select count(*) from insert_pagos_vtas)          as pagos_vtas_insertados,
  (select count(*) from insert_historial)           as historial_insertado,
  (select count(*) from insert_recordatorios_array) as recordatorios_array_insertados,
  (select count(*) from insert_recordatorios_legacy) as recordatorios_legacy_insertados,
  (select count(*) from insert_catalogo_prod)       as catalogo_prod_insertados,
  (select count(*) from insert_catalogo_serv)       as catalogo_serv_insertados;

commit;


-- ── Verificación post-ejecución ───────────────────────────────────────────────
-- Ejecutar manualmente después del INSERT para confirmar conteos y montos.
-- Sustituir el email en la subquery según corresponda.
/*
select
  'negocios'            as tabla, count(*) from public.negocios n
  join auth.users u on u.id = n.user_id where u.email = 'dual10@cleo.test'
union all
select 'clientes',       count(*) from public.clientes
  where negocio_id = (select n.id from public.negocios n join auth.users u on u.id=n.user_id where u.email='dual10@cleo.test')
union all
select 'oportunidades',  count(*) from public.oportunidades
  where negocio_id = (select n.id from public.negocios n join auth.users u on u.id=n.user_id where u.email='dual10@cleo.test')
union all
select 'cotizaciones',   count(*) from public.cotizaciones
  where negocio_id = (select n.id from public.negocios n join auth.users u on u.id=n.user_id where u.email='dual10@cleo.test')
union all
select 'pedidos',        count(*) from public.pedidos
  where negocio_id = (select n.id from public.negocios n join auth.users u on u.id=n.user_id where u.email='dual10@cleo.test')
union all
select 'pagos',          count(*) from public.pagos
  where negocio_id = (select n.id from public.negocios n join auth.users u on u.id=n.user_id where u.email='dual10@cleo.test')
union all
select 'recordatorios',  count(*) from public.recordatorios
  where negocio_id = (select n.id from public.negocios n join auth.users u on u.id=n.user_id where u.email='dual10@cleo.test')
union all
select 'catalogo_items', count(*) from public.catalogo_items
  where negocio_id = (select n.id from public.negocios n join auth.users u on u.id=n.user_id where u.email='dual10@cleo.test')
order by 1;
*/
