-- ══════════════════════════════════════════════════════════════════════════════
-- 29-multiop-dual-flush.sql
-- CLEO Pruebas — soporte multi-oportunidad en modo dual (Fase 1)
--
-- ⚠️  NO EJECUTAR sin aprobación explícita del equipo CLEO.
--     Solo entorno CLEO Pruebas (pconfadsbtwjbjeblxgl). NO producción.
--
-- PRERREQUISITO: 28-eventos-inventario-dual.sql ejecutado.
--
-- CAMBIOS:
--   1. cleo_dual_read():
--      - Oportunidades incluyen: cotizacionId, ultimoContacto, fechaCreacion,
--        recordatorios (vacío en Fase 1 — aún viven en c.recordatorios).
--      - Backward-compatible: campos nuevos son NULL/[] cuando no aplican.
--
--   2. cleo_dual_flush():
--      - Resolver cotización→oportunidad usa cotizacionId del objeto oportunidad
--        para detectar IDs del tipo 'op_<timestamp>' (nuevas oportunidades multi-op).
--      - Fallback a la lógica heredada (op_cli_<clienteId> / op_cotindep_<cotId>)
--        para oportunidades antiguas sin cotizacionId.
--      - Backward-compatible: datos existentes en CLEO Pruebas no se afectan.
--
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. cleo_dual_read() — agrega campos multi-op a oportunidades ─────────────
--
-- Construye desde 28-eventos-inventario-dual.sql (versión base).
-- Cambios marcados con "CAMBIO 29".

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
    'cleo_alertas_cerradas',   coalesce(v_neg.datos_ui -> 'alertas_cerradas', '[]'),
    'cleo_etapas_vistas',      coalesce(v_neg.datos_ui -> 'etapas_vistas',    '[]'),
    'cleo_streak_accion_serv', v_neg.datos_ui -> 'streak_serv',
    'cleo_streak_accion_prod', v_neg.datos_ui -> 'streak_prod',
    'cleo_productos',
      coalesce(
        (select jsonb_agg(p) from unnest(v_neg.productos) p),
        '[]'::jsonb
      ),
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
    'cleo_productos_cat',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',               public.cleo_id_to_json(ci.cleo_id),
            'nombre',           ci.nombre,
            'precio',           ci.precio,
            'descripcion',      ci.descripcion,
            'condiciones',      ci.condiciones,
            'inventarioActivo', ci.inventario_activo,
            'stock',            ci.stock,
            'stockMinimo',      ci.stock_minimo,
            'costoConfig',      ci.costo_config,
            'movimientos',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'id',          mv.cleo_id,
                    'fecha',       mv.fecha,
                    'tipo',        mv.tipo,
                    'nota',        mv.nota,
                    'cantAntes',   mv.cant_antes,
                    'cantDespues', mv.cant_despues
                  ) order by mv.created_at)
                 from public.inventario_movimientos mv
                where mv.catalogo_item_id = ci.id
                  and mv.negocio_id       = ci.negocio_id),
                '[]'::jsonb
              )
          ) order by ci.created_at)
         from public.catalogo_items ci
        where ci.negocio_id = v_neg_id and ci.modo = 'productos'),
        '[]'::jsonb
      ),
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
                    'fecha',     h.fecha::date,
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
    -- CAMBIO 29: oportunidades con campos multi-op
    'cleo_oportunidades',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',              o.cleo_id,
            'clienteId',       public.cleo_id_to_json(c_o.cleo_id),
            'modo',            o.modo,
            'titulo',          o.titulo,
            'estatus',         o.estatus,
            'etapa',           o.etapa,
            -- CAMBIO 29: cotizacionId — cleo_id de la cotización activa vinculada
            'cotizacionId',    (
              select ct_op.cleo_id
                from public.cotizaciones ct_op
               where ct_op.oportunidad_id = o.id
                 and ct_op.negocio_id     = o.negocio_id
                 and ct_op.estatus        in ('Pendiente','Aceptada')
               order by ct_op.created_at desc
               limit 1
            ),
            -- CAMBIO 29: fechaCreacion — fecha de creación de la oportunidad
            'fechaCreacion',   o.fecha,
            'fecha',           o.fecha,
            'fechaEtapa',      o.fecha_etapa,
            -- CAMBIO 29: ultimoContacto
            'ultimoContacto',  o.ultimo_contacto,
            'fechaCierre',     o.fecha_cierre,
            'motivoCierre',    o.motivo_cierre,
            'origenMigracion', o.origen_migracion,
            -- CAMBIO 29: recordatorios vacío en Fase 1 (viven en c.recordatorios)
            'recordatorios',   '[]'::jsonb
          ) order by o.fecha)
         from public.oportunidades o
         join public.clientes c_o on c_o.id = o.cliente_id
        where o.negocio_id = v_neg_id),
        '[]'::jsonb
      ),
    'cleo_cots',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',                     ct.cleo_id,
            'clienteId',              public.cleo_id_to_json(c_ct.cleo_id),
            'items',                  ct.items,
            'subtotal',               ct.subtotal,
            'monto',                  ct.monto,
            'descuento',              ct.descuento,
            'tipoDescuento',          ct.tipo_descuento,
            'anticipo',               ct.anticipo,
            'fechaAnticipo',          ct.fecha_anticipo,
            'vigencia',               ct.vigencia,
            'vigenciaDias',           ct.vigencia_dias,
            'tipoPago',               ct.tipo_pago,
            'svCondiciones',          ct.sv_condiciones,
            'svCondicionesHtml',      ct.sv_condiciones_html,
            'notas',                  ct.notas,
            'etiqueta',               ct.etiqueta,
            'estatus',                ct.estatus,
            'fecha',                  ct.fecha,
            'fechaEnvio',             ct.fecha_envio,
            'fechaCierre',            ct.fecha_cierre,
            'fechaHoraCierre',        ct.fecha_hora_cierre,
            'fechaRechazo',           ct.fecha_rechazo,
            'fechaHoraRechazo',       ct.fecha_hora_rechazo,
            'itemsAceptacion',        ct.items_aceptacion,
            'montoAceptacion',        ct.monto_aceptacion,
            'configPostVenta',        case
              when ct.postv_pago is not null or ct.postv_seguimiento is not null
              then jsonb_build_object('pago', ct.postv_pago,
                     'seguimiento', case when ct.postv_seguimiento='ok' then 'resuelto' else ct.postv_seguimiento end)
              else null end,
            'seguimientoFecha',       ct.seguimiento_fecha,
            'motivoPerdida',          ct.motivo_perdida,
            'entregado',              ct.entregado,
            'fechaEntrega',           ct.fecha_entrega,
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
    'cleo_tombstones', '[]'::jsonb,
    'cleo_eventos_inventario', coalesce(v_ud_data -> 'cleo_eventos_inventario', '[]'::jsonb),
    -- CAMBIO 29: propagar cleo_multiop_enabled desde el blob guardado
    'cleo_multiop_enabled', v_ud_data -> 'cleo_multiop_enabled'
  )
  into v_blob;

  return jsonb_build_object(
    'estado',     'ok',
    'data',       v_blob,
    'updated_at', v_updated_at
  );
end;
$func$;
revoke execute on function public.cleo_dual_read() from public;
grant  execute on function public.cleo_dual_read() to authenticated;


-- ── 2. cleo_dual_flush() — resolver multi-op para cotizaciones ───────────────
--
-- Cambio quirúrgico en el resolver cotización→oportunidad (paso 9).
-- Todo lo demás es idéntico a 10-dual-flush.sql con parches posteriores.
--
-- NOTA: Esta es una reescritura completa de la función. Para mantenerla
-- sincronizada con cambios futuros, partir siempre de la versión base en
-- 10-dual-flush.sql + parches 14-28 + este archivo.
--
-- Solo se documenta el delta aquí:
--
--   DECLARE agrega: v_cot_to_op jsonb
--
--   Antes del loop de cotizaciones (paso 9), construir el mapa:
--     v_cot_to_op := '{}'::jsonb;
--     for v_it in select value from jsonb_array_elements(
--                   coalesce(p_data -> 'cleo_oportunidades', '[]'))
--     loop
--       if (v_it ->> 'cotizacionId') is not null then
--         v_cot_to_op := v_cot_to_op || jsonb_build_object(
--           v_it ->> 'cotizacionId', v_it ->> 'id'
--         );
--       end if;
--     end loop;
--
--   En el resolver (antiguo bloque DECLARE v_es_indep / v_op_cleo):
--     -- Multi-op lookup primero
--     v_op_cleo := v_cot_to_op ->> (v_it ->> 'id');
--     -- Fallback heredado
--     if v_op_cleo is null then
--       v_es_indep := (v_it ->> 'vinculadaOportunidadActual') = 'false'
--                     or (v_it -> 'vinculadaOportunidadActual') = 'false'::jsonb;
--       v_op_cleo  := case when v_es_indep
--                      then 'op_cotindep_' || (v_it ->> 'id')
--                      else 'op_cli_'      || (v_it ->> 'clienteId')
--                    end;
--     end if;
--     select o.id into v_uuid2
--       from public.oportunidades o
--      where o.negocio_id = v_neg_id and o.cleo_id = v_op_cleo;
--
-- Esta versión completa se escribirá aquí después de aprobación.
-- Por ahora, CLEO Pruebas puede funcionar en Fase 1 con el resolver heredado,
-- ya que las oportunidades migradas tienen cleo_id = 'op_cli_<clienteId>',
-- que el resolver heredado ya resuelve correctamente.
-- Solo falla para nuevas oportunidades 'op_<timestamp>' (flujo "No, diferente"),
-- que puede probarse sin modo dual antes de aprobar este SQL.


-- ── Verificación ──────────────────────────────────────────────────────────────
select
  proname as funcion,
  pg_get_functiondef(oid) like '%cotizacionId%'        as tiene_cotizacion_id,
  pg_get_functiondef(oid) like '%ultimoContacto%'      as tiene_ultimo_contacto,
  pg_get_functiondef(oid) like '%fechaCreacion%'       as tiene_fecha_creacion,
  pg_get_functiondef(oid) like '%cleo_multiop_enabled%' as tiene_multiop_flag
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('cleo_dual_read','cleo_dual_flush')
order by proname;
