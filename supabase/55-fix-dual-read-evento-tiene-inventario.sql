-- Parche 55: eventos_productos no persiste tieneInventario — cleo_dual_read lo
-- omitía por completo, así que en JS !ep.tieneInventario siempre daba true tras
-- cualquier sincronización en modo dual, sin importar si el producto SÍ tenía
-- inventario activo en el catálogo. Por eso la app mostraba "solo registro" (o
-- "no descuenta tu inventario") en TODOS los productos de un evento, incorrecto
-- para quienes sí llevan control de inventario.
--
-- Causa: public.eventos_productos no tiene columna para este dato (no se
-- guarda ahí). Fix: derivarlo en vivo con un LEFT JOIN a catalogo_items
-- (negocio_id + modo='productos' + cleo_id = eventos_productos.catalogo_id),
-- en vez de intentar persistir un snapshot que se desactualiza.
--
-- Idempotente (CREATE OR REPLACE). No modifica tablas ni cleo_dual_flush.
-- Base: produccion-funciones.sql vigente al momento de este parche.

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
            'productoInteres',               c.producto_interes,
            'precioInteres',                 c.precio_interes,
            'cantidadInteres',               c.cantidad_interes,
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
    -- CAMBIO 32: etapa mapeada snake_case → title-case (cleo_etapa_to_ui)
    'cleo_oportunidades',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',              o.cleo_id,
            'clienteId',       public.cleo_id_to_json(c_o.cleo_id),
            'modo',            o.modo,
            'titulo',          o.titulo,
            'estatus',         o.estatus,
            'etapa',           public.cleo_etapa_to_ui(o.etapa),
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
                    'id',         pg.cleo_id,
                    'monto',      pg.monto,
                    'fecha',      pg.fecha,
                    'concepto',   pg.concepto,
                    'metodoPago', pg.metodo_pago
                  ) order by pg.fecha)
                 from public.pagos pg
                where pg.cotizacion_id = ct.id and pg.negocio_id = ct.negocio_id),
                '[]'::jsonb
              )
          ) order by ct.fecha desc nulls last, ct.created_at desc)
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
                    'id',pg.cleo_id,'concepto',pg.concepto,'monto',pg.monto,'fecha',pg.fecha,
                    'metodoPago',pg.metodo_pago
                  ) order by pg.fecha)
                 from public.pagos pg
                where pg.venta_id = vt.id and pg.negocio_id = vt.negocio_id),
                '[]'::jsonb
              )
          ) order by vt.fecha desc nulls last, vt.created_at desc)
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
            'eventoId',        pd.evento_id,
            'pagos',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'id',pg.cleo_id,'monto',pg.monto,'fecha',pg.fecha,'concepto',pg.concepto,
                    'metodoPago',pg.metodo_pago
                  ) order by pg.fecha)
                 from public.pagos pg
                where pg.pedido_id = pd.id and pg.negocio_id = pd.negocio_id),
                '[]'::jsonb
              )
          ) order by pd.fecha desc nulls last, pd.created_at desc)
         from public.pedidos pd
         left join public.clientes   c_pd  on c_pd.id  = pd.cliente_id
         left join public.cotizaciones ct_pd on ct_pd.id = pd.cotizacion_id
        where pd.negocio_id = v_neg_id),
        '[]'::jsonb
      ),
    'cleo_tombstones', '[]'::jsonb,
    -- CAMBIO 40: eventos desde tablas relacionales (antes era blob passthrough)
    'cleo_eventos_inventario',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
            'id',          public.cleo_id_to_json(ei.cleo_id),
            'nombre',      ei.nombre,
            'fecha',       ei.fecha,
            'fechaFin',    ei.fecha_fin,
            'estado',      ei.estado,
            'fechaCierre', ei.fecha_cierre,
            'pedidosIds',  ei.pedidos_ids,
            'movimientos', ei.movimientos,
            'productos',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'catalogoId',      public.cleo_id_to_json(ep.catalogo_id),
                    'nombre',          ep.nombre,
                    'precio',          ep.precio,
                    'cantidadLlevada', ep.cantidad,
                    'cantidadVendida', ep.cantidad_vendida,
                    'reserva',         ep.reserva,
                    -- CAMBIO 55: eventos_productos no guarda tieneInventario (no hay
                    -- columna para eso) , se deriva en vivo del catálogo actual. Antes
                    -- esta clave faltaba por completo, así que en JS !ep.tieneInventario
                    -- siempre daba true tras cualquier sincronización en dual, aunque el
                    -- producto sí tuviera inventario activo en el catálogo.
                    'tieneInventario', coalesce(ci.inventario_activo, false)
                  ) order by ep.created_at)
                 from public.eventos_productos ep
                 left join public.catalogo_items ci
                        on ci.negocio_id = v_neg_id
                       and ci.modo       = 'productos'
                       and ci.cleo_id    = ep.catalogo_id
                where ep.evento_id = ei.id),
                '[]'::jsonb
              ),
            'gastos',
              coalesce(
                (select jsonb_agg(jsonb_build_object(
                    'id',            public.cleo_id_to_json(eg.cleo_id),
                    'eventoId',      public.cleo_id_to_json(ei.cleo_id),
                    'concepto',      eg.concepto,
                    'monto',         eg.monto,
                    'fecha',         eg.fecha,
                    'fechaRegistro', eg.fecha_registro
                  ) order by eg.fecha)
                 from public.eventos_gastos eg
                where eg.evento_id = ei.id),
                '[]'::jsonb
              )
          ) order by ei.fecha desc)
         from public.eventos_inventario ei
        where ei.negocio_id = v_neg_id),
        '[]'::jsonb
      ),
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
