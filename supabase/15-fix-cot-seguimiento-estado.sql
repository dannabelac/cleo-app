-- ══════════════════════════════════════════════════════════════════════════════
-- 15-fix-cot-seguimiento-estado.sql
-- Añade seguimiento_estado y seguimiento_atendido_fecha a cotizaciones.
-- Actualiza cleo_dual_read y cleo_dual_flush para leer y escribir los campos.
--
-- Problema: cleo_dual_read devolvía seguimientoFecha pero no seguimientoEstado.
-- El app filtra cotizaciones independientes con cot.seguimientoEstado!=="pendiente"
-- → tras reload el seguimiento desaparecía aunque seguimientoFecha estuviera set.
--
-- Entorno autorizado: CLEO Pruebas (pconfadsbtwjbjeblxgl)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Guardia ───────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from public.negocios
     where schema_ver in ('blob','dual')
     limit 1
  ) then
    raise exception 'Guardia: no se detecta entorno CLEO — abortando.';
  end if;
end;
$$;

-- ── 1. Columnas nuevas en cotizaciones ────────────────────────────────────────
alter table public.cotizaciones
  add column if not exists seguimiento_estado         text,
  add column if not exists seguimiento_atendido_fecha date;

alter table public.cotizaciones
  drop constraint if exists cotizaciones_seguimiento_estado_check;

alter table public.cotizaciones
  add constraint cotizaciones_seguimiento_estado_check
    check (seguimiento_estado in ('pendiente','atendido','cancelado'));

-- ── 2. cleo_dual_read: añade seguimientoEstado y seguimientoAtendidoFecha ─────
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
begin
  -- Auth
  if v_uid is null then
    return jsonb_build_object('estado','error','codigo','no_autenticado');
  end if;

  -- Negocio + schema_ver
  select n.id, n.schema_ver, n.nombre, n.nombre_contacto, n.tipo_perfil,
         n.telefono, n.email, n.color, n.color_sec,
         n.banco, n.cuenta, n.clabe, n.titular,
         n.moneda, n.productos, n.config, n.datos_ui
    into v_neg
    from public.negocios n
   where n.user_id = v_uid;

  if v_neg.id is null then
    return jsonb_build_object('estado','error','codigo','negocio_no_encontrado');
  end if;
  v_neg_id := v_neg.id;
  v_sv     := v_neg.schema_ver;

  if v_sv <> 'dual' then
    return jsonb_build_object('estado','error','codigo',
      case when v_sv = 'blob' then 'schema_no_dual' else 'schema_ya_relacional' end,
      'schema_ver', v_sv);
  end if;

  -- updated_at de user_data (versión del blob)
  select ud.updated_at into v_updated_at
    from public.user_data ud where ud.user_id = v_uid;

  -- ── Serializar blob ────────────────────────────────────────────────────────
  select jsonb_build_object(
    -- Perfil
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
      'logo',                coalesce(v_neg.config ->> 'logo',               ''),
      'mensaje',             coalesce(v_neg.config ->> 'mensaje',            ''),
      'condicionesPago',     coalesce(v_neg.config ->> 'condicionesPago',    ''),
      'redesTT',             coalesce(v_neg.config ->> 'redesTT',            ''),
      'redesIG',             coalesce(v_neg.config ->> 'redesIG',            ''),
      'redesFB',             coalesce(v_neg.config ->> 'redesFB',            ''),
      'colorTexto',          coalesce(v_neg.config ->> 'colorTexto',         ''),
      'bancotarjeta',        coalesce(v_neg.config ->> 'bancotarjeta',       ''),
      'bancoinstrucciones',  coalesce(v_neg.config ->> 'bancoinstrucciones', ''),
      'direccion',           coalesce(v_neg.config ->> 'direccion',          '')
    ),
    -- Datos UI
    'cleo_alertas_cerradas',   coalesce(v_neg.datos_ui -> 'alertas_cerradas', '[]'),
    'cleo_etapas_vistas',      coalesce(v_neg.datos_ui -> 'etapas_vistas',    '[]'),
    'cleo_streak_accion_serv', v_neg.datos_ui -> 'streak_serv',
    'cleo_streak_accion_prod', v_neg.datos_ui -> 'streak_prod',
    -- Productos (array de nombres)
    'cleo_productos',
      coalesce(
        (select jsonb_agg(p) from unnest(v_neg.productos) p),
        '[]'::jsonb
      ),
    -- Catálogo servicios
    'cleo_servicios',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',          public.cleo_id_to_json(ci.cleo_id),
            'nombre',      ci.nombre,
            'precio',      ci.precio,
            'descripcion', ci.descripcion,
            'condiciones', ci.condiciones
          ) order by ci.created_at)
         from public.catalogo_items ci
        where ci.negocio_id = v_neg_id and ci.modo = 'servicios'),
        '[]'::jsonb
      ),
    -- Catálogo productos
    'cleo_productos_cat',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',          public.cleo_id_to_json(ci.cleo_id),
            'nombre',      ci.nombre,
            'precio',      ci.precio,
            'descripcion', ci.descripcion,
            'condiciones', ci.condiciones
          ) order by ci.created_at)
         from public.catalogo_items ci
        where ci.negocio_id = v_neg_id and ci.modo = 'productos'),
        '[]'::jsonb
      ),
    -- Clientes (con recordatorios e historial embebidos)
    'cleo_clientes',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',                            public.cleo_id_to_json(c.cleo_id),
            'nombre',                        c.nombre,
            'negocio',                       c.empresa,
            'contacto',                      c.telefono,
            'email',                         c.email,
            'instagram',                     c.instagram,
            'messenger',                     c.messenger,
            'canalPrincipal',                c.canal,
            'origen',                        c.origen,
            'etapa',                         c.etapa,
            'fechaEtapa',                    c.fecha_etapa,
            'estadoProspecto',               c.estado_prospecto,
            'motivoPerdida',                 c.motivo_perdida,
            'razonCierre',                   c.razon_cierre,
            'ultimoContacto',                c.ultimo_contacto,
            'notas',                         c.notas,
            'etiqueta',                      c.etiqueta,
            'notaRecontacto',                c.nota_recontacto,
            'fechaPedido',                   c.fecha_pedido,
            'servicioInteres',               c.servicio_interes,
            'itemsInteres',                  c.items_interes,
            'mensajeSeguimiento',            c.mensaje_seguimiento,
            'seguimientoCustom',             c.seguimiento_custom,
            'seguimientoFecha',              c.seguimiento_fecha,
            'mensajeSeguimientoPostVenta',   c.mensaje_seguimiento_postventa,
            'fecha',                         c.created_at::date,
            'recordatorios',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'id',              r.cleo_id,
                    'oportunidadId',   op_r.cleo_id,
                    'categoria',       r.categoria,
                    'nota',            r.texto,
                    'fecha',           r.fecha,
                    'completado',      r.completado,
                    'estatus',         r.estatus,
                    'esPersonalizada', r.es_personalizada,
                    'origen',          r.origen
                  ) order by r.fecha)
                 from public.recordatorios r
                 left join public.oportunidades op_r
                        on op_r.id = r.oportunidad_id and op_r.negocio_id = r.negocio_id
                where r.cliente_id = c.id and r.negocio_id = c.negocio_id),
                '[]'::jsonb
              ),
            'historialContactos',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'id',        h.cleo_id,
                    'tipo',      h.tipo,
                    'fecha',     h.fecha,
                    'fechaHora', h.fecha_hora,
                    'resultado', h.resultado,
                    'items',     h.items,
                    'monto',     h.monto,
                    'resumen',   h.resumen
                  ) order by h.fecha_hora)
                 from public.historial_contactos h
                where h.cliente_id = c.id and h.negocio_id = c.negocio_id),
                '[]'::jsonb
              )
          ) order by c.created_at)
         from public.clientes c
        where c.negocio_id = v_neg_id),
        '[]'::jsonb
      ),
    -- Oportunidades (nuevo array dual)
    'cleo_oportunidades',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',              o.cleo_id,
            'clienteId',       public.cleo_id_to_json(c_o.cleo_id),
            'modo',            o.modo,
            'titulo',          o.titulo,
            'estatus',         o.estatus,
            'etapa',           o.etapa,
            'fecha',           o.fecha,
            'fechaEtapa',      o.fecha_etapa,
            'fechaCierre',     o.fecha_cierre,
            'motivoCierre',    o.motivo_cierre,
            'origenMigracion', o.origen_migracion
          ) order by o.fecha)
         from public.oportunidades o
         join public.clientes c_o on c_o.id = o.cliente_id
        where o.negocio_id = v_neg_id),
        '[]'::jsonb
      ),
    -- Cotizaciones (con pagos embebidos)
    'cleo_cots',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',                       ct.cleo_id,
            'clienteId',                public.cleo_id_to_json(c_ct.cleo_id),
            'items',                    ct.items,
            'subtotal',                 ct.subtotal,
            'monto',                    ct.monto,
            'descuento',                ct.descuento,
            'tipoDescuento',            ct.tipo_descuento,
            'anticipo',                 ct.anticipo,
            'fechaAnticipo',            ct.fecha_anticipo,
            'vigencia',                 ct.vigencia,
            'vigenciaDias',             ct.vigencia_dias,
            'tipoPago',                 ct.tipo_pago,
            'svCondiciones',            ct.sv_condiciones,
            'svCondicionesHtml',        ct.sv_condiciones_html,
            'notas',                    ct.notas,
            'etiqueta',                 ct.etiqueta,
            'estatus',                  ct.estatus,
            'fecha',                    ct.fecha,
            'fechaEnvio',               ct.fecha_envio,
            'fechaCierre',              ct.fecha_cierre,
            'fechaHoraCierre',          ct.fecha_hora_cierre,
            'fechaRechazo',             ct.fecha_rechazo,
            'fechaHoraRechazo',         ct.fecha_hora_rechazo,
            'itemsAceptacion',          ct.items_aceptacion,
            'montoAceptacion',          ct.monto_aceptacion,
            'configPostVenta',          case
              when ct.postv_pago is not null or ct.postv_seguimiento is not null
              then jsonb_build_object('pago', ct.postv_pago,
                     'seguimiento', case when ct.postv_seguimiento='ok' then 'resuelto' else ct.postv_seguimiento end)
              else null end,
            'seguimientoFecha',         ct.seguimiento_fecha,
            'seguimientoEstado',        ct.seguimiento_estado,
            'seguimientoAtendidoFecha', ct.seguimiento_atendido_fecha,
            'motivoPerdida',            ct.motivo_perdida,
            'entregado',                ct.entregado,
            'fechaEntrega',             ct.fecha_entrega,
            'vinculadaOportunidadActual', ct.oportunidad_vinculada,
            'pagos',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'id',       pg.cleo_id,
                    'monto',    pg.monto,
                    'fecha',    pg.fecha,
                    'concepto', pg.concepto
                  ) order by pg.fecha)
                 from public.pagos pg
                where pg.cotizacion_id = ct.id and pg.negocio_id = ct.negocio_id),
                '[]'::jsonb
              )
          ) order by ct.fecha)
         from public.cotizaciones ct
         left join public.clientes c_ct on c_ct.id = ct.cliente_id
        where ct.negocio_id = v_neg_id),
        '[]'::jsonb
      ),
    -- Ventas (con pagos embebidos)
    'cleo_ventas',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',          vt.cleo_id,
            'clienteId',   public.cleo_id_to_json(c_vt.cleo_id),
            'concepto',    vt.concepto,
            'items',       vt.items,
            'monto',       vt.monto,
            'tipo',        case when vt.tipo = 'normal' then 'especifico' else 'dia' end,
            'notas',       vt.notas,
            'etiqueta',    vt.etiqueta,
            'fecha',       vt.fecha,
            'tipoPago',    vt.tipo_pago,
            'entregado',   vt.entregado,
            'fechaEntrega',vt.fecha_entrega,
            'configPostVenta', case
              when vt.postv_pago is not null or vt.postv_seguimiento is not null
              then jsonb_build_object('pago', vt.postv_pago,
                     'seguimiento', case when vt.postv_seguimiento='ok' then 'resuelto' else vt.postv_seguimiento end)
              else null end,
            'pagos',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'id',pg.cleo_id,'concepto',pg.concepto,'monto',pg.monto,'fecha',pg.fecha
                  ) order by pg.fecha)
                 from public.pagos pg
                where pg.venta_id = vt.id and pg.negocio_id = vt.negocio_id),
                '[]'::jsonb
              )
          ) order by vt.fecha)
         from public.ventas vt
         left join public.clientes c_vt on c_vt.id = vt.cliente_id
        where vt.negocio_id = v_neg_id),
        '[]'::jsonb
      ),
    -- Pedidos (con pagos embebidos)
    'cleo_pedidos',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',                  pd.cleo_id,
            'clienteId',           public.cleo_id_to_json(c_pd.cleo_id),
            'cotizacionId',        ct_pd.cleo_id,
            'origenVenta',         pd.origen_venta,
            'items',               pd.items,
            'productos',           pd.productos,
            'cantidad',            pd.cantidad,
            'total',               pd.monto_total,
            'notas',               pd.notas,
            'etiqueta',            pd.etiqueta,
            'estadoPedido',        pd.estado_pedido,
            'fecha',               pd.fecha,
            'fechaEntrega',        pd.fecha_entrega,
            'fechaCancelacion',    pd.fecha_cancelacion,
            'anticipoConservado',  pd.anticipo_conservado,
            'motivoCancelacion',   pd.motivo_cancelacion,
            'motivoCancelacionLado', pd.motivo_cancelacion_lado,
            'configPostVenta', case
              when pd.postv_pago is not null or pd.postv_seguimiento is not null
              then jsonb_build_object('pago', pd.postv_pago,
                     'seguimiento', case when pd.postv_seguimiento='ok' then 'resuelto' else pd.postv_seguimiento end)
              else null end,
            'pagos',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'id',pg.cleo_id,'monto',pg.monto,'fecha',pg.fecha,'concepto',pg.concepto
                  ) order by pg.fecha)
                 from public.pagos pg
                where pg.pedido_id = pd.id and pg.negocio_id = pd.negocio_id),
                '[]'::jsonb
              )
          ) order by pd.fecha)
         from public.pedidos pd
         left join public.clientes   c_pd  on c_pd.id  = pd.cliente_id
         left join public.cotizaciones ct_pd on ct_pd.id = pd.cotizacion_id
        where pd.negocio_id = v_neg_id),
        '[]'::jsonb
      ),
    -- Tombstones vacíos (se limpian al leer desde el servidor)
    'cleo_tombstones', '[]'::jsonb
  )
  into v_blob;

  return jsonb_build_object(
    'estado',     'ok',
    'data',       v_blob,
    'updated_at', v_updated_at
  );
end;
$func$;

-- ── 3. cleo_dual_flush: parche dinámico para los dos INSERT de cotizaciones ───
-- Lee el cuerpo actual de la función, aplica 3 sustituciones de cadena y
-- re-ejecuta el CREATE OR REPLACE resultante.
do $patch$
declare
  v_src  text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cleo_dual_flush';

  if v_src is null then
    raise exception 'cleo_dual_flush no encontrada — abortar.';
  end if;

  -- 3a. Lista de columnas en los dos INSERT (ocurre 2 veces, se parchean las 2)
  v_src := replace(v_src,
    'seguimiento_fecha, motivo_perdida, entregado, fecha_entrega',
    'seguimiento_fecha, seguimiento_estado, seguimiento_atendido_fecha, motivo_perdida, entregado, fecha_entrega'
  );

  -- 3b. Valores correspondientes en los dos INSERT (ocurre 2 veces, misma cadena)
  v_src := replace(v_src,
    $$nullif(v_it ->> 'seguimientoFecha','')::date,
        v_it ->> 'motivoPerdida',$$,
    $$nullif(v_it ->> 'seguimientoFecha','')::date,
        nullif(v_it ->> 'seguimientoEstado',''),
        nullif(v_it ->> 'seguimientoAtendidoFecha','')::date,
        v_it ->> 'motivoPerdida',$$
  );

  -- 3c. ON CONFLICT DO UPDATE SET (solo el primer INSERT, el segundo es DO NOTHING)
  v_src := replace(v_src,
    $$seguimiento_fecha   = excluded.seguimiento_fecha,
        motivo_perdida$$,
    $$seguimiento_fecha        = excluded.seguimiento_fecha,
        seguimiento_estado       = excluded.seguimiento_estado,
        seguimiento_atendido_fecha = excluded.seguimiento_atendido_fecha,
        motivo_perdida$$
  );

  -- Verificar que el parche se aplicó
  if v_src not like '%seguimiento_estado       = excluded.seguimiento_estado%' then
    raise exception 'Parche falló: la sustitución ON CONFLICT no encontró el patrón esperado. '
      'Verificar indentación de cleo_dual_flush original.';
  end if;

  execute v_src;
  raise notice 'cleo_dual_flush parcheada correctamente.';
end;
$patch$;

-- ── 4. Verificación ───────────────────────────────────────────────────────────
select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'cotizaciones'
  and column_name  in ('seguimiento_estado','seguimiento_atendido_fecha')
order by column_name;

-- Debe mostrar que cleo_dual_read devuelve seguimientoEstado
select
  pg_get_functiondef(p.oid) like '%seguimientoEstado%' as read_tiene_estado,
  pg_get_functiondef(p.oid) like '%seguimientoAtendidoFecha%' as read_tiene_atendido
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'cleo_dual_read';

-- Debe mostrar que cleo_dual_flush escribe seguimiento_estado
select
  pg_get_functiondef(p.oid) like '%seguimiento_estado       = excluded%' as flush_tiene_update
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'cleo_dual_flush';
