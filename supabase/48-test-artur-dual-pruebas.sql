-- ══════════════════════════════════════════════════════════════════════════════
-- 48-test-artur-dual-pruebas.sql
-- CLEO PRUEBAS únicamente — NO ejecutar en producción
--
-- Prueba la migración del JSON de Artur (artur.szklarski2@gmail.com) usando
-- la cuenta de test dual09@cleo.test. Limpia sus tablas duales, inyecta el
-- JSON y verifica que cleo_dual_flush lo procesa correctamente.
--
-- Resultados esperados:
--   clientes:  1  (Mike Diaz de León)
--   pedidos:   8  (6 del tianguis + 1 cancelado + 1 registro manual)
--   pagos:     8  (uno por pedido)
--   eventos:   1  (Tianguis Francisco de Montejo)
--   gastos:    1  (Espacio $122.50)
--   pedidos con evento_id: 6  (los 6 del tianguis, vía backfill 6d)
-- ══════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_test_email  text := 'prueba@dual.test';
  v_uid         uuid;
  v_neg_id      uuid;
  v_neg_sv      text;
  v_resultado   jsonb;
  v_blob        jsonb;

  v_n_clientes  int; v_n_pedidos    int; v_n_pagos     int;
  v_n_eventos   int; v_n_gastos     int; v_n_cat       int;
  v_n_con_evid  int;
begin

  -- ── 1. OBTENER CUENTA DE TEST ─────────────────────────────────────────────
  select id into v_uid from auth.users where email = v_test_email limit 1;
  if v_uid is null then
    raise exception 'FALLO: % no existe en auth.users de CLEO Pruebas. Usar otra cuenta.', v_test_email;
  end if;
  raise notice 'Cuenta test: % → uid=%', v_test_email, v_uid;

  -- ── 2. OBTENER / PREPARAR NEGOCIO ─────────────────────────────────────────
  select n.id, n.schema_ver into v_neg_id, v_neg_sv
    from public.negocios n where n.user_id = v_uid limit 1;

  if v_neg_id is null then
    -- parche 46 auto-crea el negocio en el flush; continúa con neg_id null
    raise notice 'Sin negocio previo — se creará automáticamente en el flush.';
  else
    raise notice 'Negocio: % | schema_ver=%', v_neg_id, v_neg_sv;

    -- ── 3. LIMPIAR TABLAS DUALES (para test limpio) ──────────────────────────
    -- Limpiar solo las tablas que el JSON de Artur popula.
    -- Cotizaciones se omiten: tienen triggers que bloquean borrado cuando están
    -- vinculadas a oportunidades, y Artur no tiene cotizaciones.
    delete from public.eventos_gastos        where negocio_id = v_neg_id;
    delete from public.eventos_productos     where negocio_id = v_neg_id;
    delete from public.eventos_inventario    where negocio_id = v_neg_id;
    delete from public.pagos                 where negocio_id = v_neg_id;
    delete from public.pedidos               where negocio_id = v_neg_id;
    delete from public.ventas                where negocio_id = v_neg_id;
    delete from public.historial_contactos   where negocio_id = v_neg_id;
    delete from public.recordatorios         where negocio_id = v_neg_id;
    delete from public.oportunidades         where negocio_id = v_neg_id;
    delete from public.clientes              where negocio_id = v_neg_id;
    delete from public.catalogo_items        where negocio_id = v_neg_id;
    delete from public.tombstones            where negocio_id = v_neg_id;
    raise notice 'Tablas duales limpiadas.';

    -- Forzar schema_ver='dual' para que el flush no lo rechace
    update public.negocios set schema_ver = 'dual', tipo_perfil = 'productos'
     where id = v_neg_id;
    raise notice 'schema_ver forzado a dual.';
  end if;

  -- Eliminar user_data para que p_ultimo_updated_at=NULL sea válido
  delete from public.user_data where user_id = v_uid;
  raise notice 'user_data eliminado (fresh start para el test).';

  -- ── 4. SIMULAR auth.uid() ─────────────────────────────────────────────────
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text,
    true
  );

  -- ── 5. JSON DE ARTUR ──────────────────────────────────────────────────────
  v_blob := $json$
{"cleo_perfil":{"logo":"","banco":"","color":"#4B5EFC","email":"","nombre":"ARTI GOURMET","mensaje":"Gracias por tu confianza.","redesFB":"","redesIG":"","redesTT":"","telefono":"9995443301","tuNombre":"Arturo","direccion":"","bancoclabe":"","colorTexto":"#1A1635","tipoPerfil":"productos","bancoaccount":"","bancotarjeta":"","bancotitular":"","colorSecundario":"#E4E2F8","condicionesPago":"50% anticipo, 50% al entregar.","onboardingListo":true,"bancoinstrucciones":""},"cleo_pedidos":[{"id":"ped_1791685153092","fecha":"2026-10-10","items":[{"id":1791685142919,"total":105,"nombre":"Crema Artesanal de Ajo 200gr","cantidad":1,"catalogoId":1791665616682,"precioUnitario":105}],"notas":"Transferencia ","pagos":[{"id":"pg_1791685153093_4nu4u","fecha":"2026-10-10","monto":105,"concepto":"Pago completo","fechaHoraPago":"2026-10-11T02:19:13.093Z"}],"total":105,"cantidad":1,"etiqueta":"Tianguis Francisco de Montejo","clienteId":null,"productos":"Crema Artesanal de Ajo 200gr","fechaCreado":"2026-10-11T02:19:13.092Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-10-10"},{"id":"ped_1791685138543","fecha":"2026-10-10","items":[{"id":1791685132718,"total":105,"nombre":"Crema Artesanal de Ajo 200gr","cantidad":1,"catalogoId":1791665616682,"precioUnitario":105}],"notas":"Efectivo ","pagos":[{"id":"pg_1791685138544_84oqw","fecha":"2026-10-10","monto":105,"concepto":"Pago completo","fechaHoraPago":"2026-10-11T02:18:58.544Z"}],"total":105,"cantidad":1,"etiqueta":"Tianguis Francisco de Montejo","clienteId":null,"productos":"Crema Artesanal de Ajo 200gr","fechaCreado":"2026-10-11T02:18:58.543Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-10-10"},{"id":"ped_1791684697114","fecha":"2026-10-10","items":[{"id":1791684691453,"total":135,"nombre":"Crema Artesanal de Chile Xcatic 200gr","cantidad":1,"catalogoId":1791665592574,"precioUnitario":135}],"notas":"Efectivo ","pagos":[{"id":"pg_1791684697114_vhgfq","fecha":"2026-10-10","monto":135,"concepto":"Pago completo","fechaHoraPago":"2026-10-11T02:11:37.114Z"}],"total":135,"cantidad":1,"etiqueta":"Tianguis Francisco de Montejo","clienteId":null,"productos":"Crema Artesanal de Chile Xcatic 200gr","fechaCreado":"2026-10-11T02:11:37.114Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-10-10"},{"id":"ped_1791682815485","fecha":"2026-10-10","items":[{"id":1791682805391,"total":95,"nombre":"Salsa Artesanal de Chipotle 200gr","cantidad":1,"catalogoId":1791665646209,"precioUnitario":95}],"notas":"Transferncia ","pagos":[{"id":"pg_1791682815485_zwntv","fecha":"2026-10-10","monto":95,"concepto":"Pago completo","fechaHoraPago":"2026-10-11T01:40:15.485Z"}],"total":95,"cantidad":1,"etiqueta":"Tianguis Francisco de Montejo","clienteId":null,"productos":"Salsa Artesanal de Chipotle 200gr","fechaCreado":"2026-10-11T01:40:15.485Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-10-10"},{"id":"ped_1791680045405","fecha":"2026-10-10","items":[{"id":1791680023716,"total":315,"nombre":"Crema Artesanal de Ajo 200gr","cantidad":3,"catalogoId":1791665616682,"invEntregado":0,"precioUnitario":105}],"notas":"Efectivo ","pagos":[{"id":"pg_1791680045405_8a7w3","fecha":"2026-10-10","monto":315,"concepto":"Pago completo","fechaHoraPago":"2026-10-11T00:54:05.405Z"}],"total":315,"cantidad":3,"etiqueta":"Tianguis Francisco de Montejo","clienteId":null,"productos":"3x Crema Artesanal de Ajo 200gr","fechaCreado":"2026-10-11T00:54:05.405Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-10-10","fechaCancelacion":"2026-10-10","fechaHoraEntrega":"2026-10-11T01:50:12.760Z","motivoCancelacion":"Producto defectuoso","anticipoConservado":false,"fechaHoraCancelacion":"2026-10-11T01:44:06.550Z","motivoCancelacionLado":"negocio"},{"id":"ped_1791679958882","fecha":"2026-10-10","items":[{"id":"it_1791677668366","total":0,"nombre":"Ajo","cantidad":1,"catalogoId":null,"precioUnitario":0},{"id":"it_1791679944269_gvpb","total":315,"nombre":"Crema Artesanal de Ajo 200gr","cantidad":3,"catalogoId":1791665616682,"precioUnitario":105}],"notas":"","pagos":[{"id":"pg_1791679958883_45rpw","fecha":"2026-10-10","monto":315,"concepto":"Pago completo","fechaHoraPago":"2026-10-11T00:52:38.883Z"}],"total":315,"cantidad":4,"clienteId":null,"productos":"Ajo y Crema Artesanal de Ajo 200gr","fechaCreado":"2026-10-11T00:52:38.882Z","origenVenta":"registro_manual","estadoPedido":"cancelado","fechaEntrega":"2026-10-10","fechaCancelacion":"2026-10-10","itemsConfirmacion":[{"id":"it_1791677668366","total":0,"nombre":"Ajo","cantidad":1,"catalogoId":null,"precioUnitario":0},{"id":"it_1791679944269_gvpb","total":315,"nombre":"Crema Artesanal de Ajo 200gr","cantidad":3,"catalogoId":1791665616682,"precioUnitario":105}],"montoConfirmacion":315,"motivoCancelacion":"Producto defectuoso","anticipoConservado":false,"fechaHoraCancelacion":"2026-10-11T01:50:33.377Z","motivoCancelacionLado":"negocio"},{"id":"ped_1791677738212","fecha":"2026-10-10","items":[{"id":1791677718743,"total":95,"nombre":"Salsa Artesanal de Chipotle 200gr","cantidad":1,"catalogoId":1791665646209,"precioUnitario":95}],"notas":"Efectivo ","pagos":[{"id":"pg_1791677738212_mwdv5","fecha":"2026-10-10","monto":95,"concepto":"Pago completo","fechaHoraPago":"2026-10-11T00:15:38.212Z"}],"total":95,"cantidad":1,"etiqueta":"Tianguis Francisco de Montejo","clienteId":null,"productos":"Salsa Artesanal de Chipotle 200gr","fechaCreado":"2026-10-11T00:15:38.212Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-10-10"},{"id":"ped_1791665526382","fecha":"2026-10-10","items":[{"id":"it_1791665470415","total":125,"nombre":"Crema Artesanal de chile xcatic","cantidad":1,"catalogoId":null,"precioUnitario":125}],"notas":"","pagos":[{"id":"pg_1791665526383_1r8rc","fecha":"2026-10-10","monto":125,"concepto":"Pago completo","fechaHoraPago":"2026-10-10T20:52:06.383Z"}],"total":125,"cantidad":1,"clienteId":1791665526382,"productos":"Crema Artesanal de chile xcatic","fechaCreado":"2026-10-10T20:52:06.383Z","origenVenta":"registro_manual","estadoPedido":"entregado","fechaEntrega":"2026-10-10","itemsConfirmacion":[{"id":"it_1791665470415","total":125,"nombre":"Crema Artesanal de chile xcatic","cantidad":1,"catalogoId":null,"precioUnitario":125}],"montoConfirmacion":125}],"cleo_clientes":[{"id":1791665526382,"email":"","etapa":"Ganado","fecha":"2026-10-10","notas":"","nombre":"Mike Diaz de León","origen":"","negocio":"","contacto":"","instagram":"","messenger":"","fechaEtapa":"2026-10-10","fechaPedido":"2026-10-10T20:52:06.427Z","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-10-10","estadoProspecto":"Convertido"}],"cleo_productos":["Crema Artesanal de Ajo 200gr","Crema Artesanal de Chile Xcatic 200gr","3x Crema Artesanal de Ajo 200gr","Salsa Artesanal de Chipotle 200gr"],"cleo_tombstones":[],"cleo_oportunidades":[{"id":"op_cli_1791665526382","modo":"productos","etapa":"convertido","fecha":"2026-10-10","titulo":"","estatus":"ganada","clienteId":1791665526382,"fechaEtapa":"2026-10-10","motivoCierre":null,"precioInteres":"","ultimoContacto":"2026-10-10","origenMigracion":"migrada_producto"}],"cleo_productos_cat":[{"id":1791665592574,"stock":7,"nombre":"Crema Artesanal de Chile Xcatic 200gr","precio":135,"condiciones":"","descripcion":"Frasco de 200gr&nbsp;","movimientos":[{"id":"mov_1791665676989","nota":"Stock inicial","tipo":"ajuste_cantidad","fecha":"2026-10-10","cantAntes":null,"cantDespues":8},{"id":"mov_1791684697139_1791665592574","nota":"Venta rápida · 1 en Tianguis Francisco de Montejo","tipo":"entrega","fecha":"2026-10-10","cantAntes":8,"cantDespues":7}],"stockMinimo":null,"inventarioActivo":true},{"id":1791665616682,"stock":9,"nombre":"Crema Artesanal de Ajo 200gr","precio":105,"condiciones":"","descripcion":"Frasco de 200gr","movimientos":[{"id":"mov_1791665681442","nota":"Stock inicial","tipo":"ajuste_cantidad","fecha":"2026-10-10","cantAntes":null,"cantDespues":14},{"id":"mov_1791680045414_1791665616682","nota":"Venta rápida · 3 en Tianguis Francisco de Montejo","tipo":"entrega","fecha":"2026-10-10","cantAntes":14,"cantDespues":11},{"id":"mov_1791685138563_1791665616682","nota":"Venta rápida · 1 en Tianguis Francisco de Montejo","tipo":"entrega","fecha":"2026-10-10","cantAntes":11,"cantDespues":10},{"id":"mov_1791685153108_1791665616682","nota":"Venta rápida · 1 en Tianguis Francisco de Montejo","tipo":"entrega","fecha":"2026-10-10","cantAntes":10,"cantDespues":9}],"stockMinimo":null,"inventarioActivo":true},{"id":1791665646209,"stock":6,"nombre":"Salsa Artesanal de Chipotle 200gr","precio":95,"condiciones":"","descripcion":"Frasco de 200gr","movimientos":[{"id":"mov_1791665685259","nota":"Stock inicial","tipo":"ajuste_cantidad","fecha":"2026-10-10","cantAntes":null,"cantDespues":8},{"id":"mov_1791677738230_1791665646209","nota":"Venta rápida · 1 en Tianguis Francisco de Montejo","tipo":"entrega","fecha":"2026-10-10","cantAntes":8,"cantDespues":7},{"id":"mov_1791682815501_1791665646209","nota":"Venta rápida · 1 en Tianguis Francisco de Montejo","tipo":"entrega","fecha":"2026-10-10","cantAntes":7,"cantDespues":6}],"stockMinimo":null,"inventarioActivo":true}],"cleo_eventos_inventario":[{"id":"evt_1791677709860","fecha":"2026-10-10","estado":"cerrado","gastos":[{"id":"g_1791688915447","fecha":"2026-10-10","monto":122.5,"concepto":"Espacio","eventoId":"evt_1791677709860","fechaRegistro":"2026-10-11T03:21:55.447Z"}],"nombre":"Tianguis Francisco de Montejo","fechaFin":"2026-10-10","productos":[{"nombre":"Crema Artesanal de Chile Xcatic 200gr","catalogoId":1791665592574,"cantidadLlevada":8,"cantidadVendida":1,"tieneInventario":true,"cantidadRegresada":7},{"nombre":"Crema Artesanal de Ajo 200gr","catalogoId":1791665616682,"cantidadLlevada":14,"cantidadVendida":5,"tieneInventario":true,"cantidadRegresada":9},{"nombre":"Salsa Artesanal de Chipotle 200gr","catalogoId":1791665646209,"cantidadLlevada":8,"cantidadVendida":2,"tieneInventario":true,"cantidadRegresada":6}],"pedidosIds":["ped_1791677738212","ped_1791680045405","ped_1791682815485","ped_1791684697114","ped_1791685138543","ped_1791685153092"],"fechaCierre":"2026-10-10","movimientos":[{"id":"emov_1791677738234","nota":"Salsa Artesanal de Chipotle 200gr","tipo":"venta","fecha":"2026-10-10","pedidoId":"ped_1791677738212"},{"id":"emov_1791680045423","nota":"3x Crema Artesanal de Ajo 200gr","tipo":"venta","fecha":"2026-10-10","pedidoId":"ped_1791680045405"},{"id":"emov_1791682815508","nota":"Salsa Artesanal de Chipotle 200gr","tipo":"venta","fecha":"2026-10-10","pedidoId":"ped_1791682815485"},{"id":"emov_1791684697145","nota":"Crema Artesanal de Chile Xcatic 200gr","tipo":"venta","fecha":"2026-10-10","pedidoId":"ped_1791684697114"},{"id":"emov_1791685138568","nota":"Crema Artesanal de Ajo 200gr","tipo":"venta","fecha":"2026-10-10","pedidoId":"ped_1791685138543"},{"id":"emov_1791685153113","nota":"Crema Artesanal de Ajo 200gr","tipo":"venta","fecha":"2026-10-10","pedidoId":"ped_1791685153092"}]}],"cleo_streak_accion_prod":{"dias":1,"tipo":"agregar_nuevas","fecha":"2026-10-10"}}
  $json$;

  -- ── 6. EJECUTAR FLUSH ─────────────────────────────────────────────────────
  select public.cleo_dual_flush(v_blob, 'productos', null) into v_resultado;

  raise notice 'Resultado flush: %', v_resultado ->> 'estado';

  if v_resultado ->> 'estado' <> 'ok' then
    raise exception 'FALLO en cleo_dual_flush: %', v_resultado;
  end if;

  -- Actualizar v_neg_id si lo creó el flush (caso nuevo negocio)
  if v_neg_id is null then
    select n.id into v_neg_id from public.negocios n where n.user_id = v_uid;
    raise notice 'Negocio creado automáticamente: %', v_neg_id;
  end if;

  -- ── 7. VERIFICAR RESULTADOS ───────────────────────────────────────────────
  select count(*) into v_n_clientes  from public.clientes           where negocio_id = v_neg_id;
  select count(*) into v_n_pedidos   from public.pedidos            where negocio_id = v_neg_id;
  select count(*) into v_n_pagos     from public.pagos              where negocio_id = v_neg_id;
  select count(*) into v_n_eventos   from public.eventos_inventario where negocio_id = v_neg_id;
  select count(*) into v_n_gastos    from public.eventos_gastos     where negocio_id = v_neg_id;
  select count(*) into v_n_cat       from public.catalogo_items     where negocio_id = v_neg_id;
  select count(*) into v_n_con_evid  from public.pedidos
    where negocio_id = v_neg_id and evento_id is not null;

  raise notice '── RESULTADOS ─────────────────────────────────────────────';
  raise notice '  clientes:            % (esperado: 1)',  v_n_clientes;
  raise notice '  pedidos:             % (esperado: 8)',  v_n_pedidos;
  raise notice '  pagos:               % (esperado: 8)',  v_n_pagos;
  raise notice '  eventos:             % (esperado: 1)',  v_n_eventos;
  raise notice '  gastos:              % (esperado: 1)',  v_n_gastos;
  raise notice '  productos catálogo:  % (esperado: 3)',  v_n_cat;
  raise notice '  pedidos con evento_id: % (esperado: 6)', v_n_con_evid;

  -- Validaciones estrictas
  if v_n_clientes <> 1  then raise exception 'FALLO: clientes=%', v_n_clientes; end if;
  if v_n_pedidos  <> 8  then raise exception 'FALLO: pedidos=%',  v_n_pedidos;  end if;
  if v_n_pagos    <> 8  then raise exception 'FALLO: pagos=%',    v_n_pagos;    end if;
  if v_n_eventos  <> 1  then raise exception 'FALLO: eventos=%',  v_n_eventos;  end if;
  if v_n_gastos   <> 1  then raise exception 'FALLO: gastos=%',   v_n_gastos;   end if;
  if v_n_cat      <> 3  then raise exception 'FALLO: catalogo=%', v_n_cat;      end if;
  if v_n_con_evid <> 6  then raise exception 'FALLO: pedidos con evento_id=%', v_n_con_evid; end if;

  raise notice '══ TEST EXITOSO — JSON de Artur migrado correctamente ══';

end;
$$;


-- ── Consulta de revisión (opcional) ──────────────────────────────────────────
/*
select
  p.cleo_id        as pedido,
  p.etiqueta,
  p.evento_id,
  p.estado_pedido,
  p.monto_total,
  pg.metodo_pago
from public.pedidos p
left join public.pagos pg on pg.pedido_id = p.id
where p.negocio_id = (
  select n.id from public.negocios n
  join auth.users u on u.id = n.user_id
  where u.email = 'prueba@dual.test'
)
order by p.fecha desc, p.created_at desc;
*/
