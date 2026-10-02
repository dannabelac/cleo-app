-- ══════════════════════════════════════════════════════════════════════════════
-- 26-copia-victoria.sql
-- Datos reales de Salsas Soydiva (Victoria) cargados bajo cuenta de prueba.
-- El email de auth es victoria@cleo.test (no se usa el correo real de producción).
-- Los datos: 76 clientes, 58 pedidos, 3 cotizaciones, 97 productos de catálogo.
--
-- SOLO CLEO PRUEBAS. No ejecutar en producción.
--
-- PREREQUISITO:
--   Crear el usuario victoria@cleo.test en CLEO Pruebas:
--   Supabase dashboard → Authentication → Users → Add user.
--   Las tablas relacionales deben existir (03, 07, 19, 23-schema-patches.sql).
--
-- PASOS:
--   1. Insertar blob de Victoria en user_data (sobreescribe si ya existe).
--   2. Extracción relacional idempotente (ON CONFLICT DO NOTHING en todos los objetos).
--
-- LOGO:
--   El logo de perfil se omite de este script para mantener el tamaño manejable.
--   Si se necesita: actualizar manualmente cleo_perfil.logo en user_data.
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
  if not exists (select 1 from auth.users where email = 'victoria@cleo.test') then
    raise exception 'Usuario victoria@cleo.test no existe en auth.users de CLEO Pruebas. '
      'Crearlo primero via Supabase dashboard -> Authentication -> Users -> Invite user.';
  end if;
end;
$guard$;

begin;

-- ── Paso 1: Insertar blob en user_data ────────────────────────────────────────
-- Sobreescribe el blob existente si el usuario ya tiene datos.
-- El logo de perfil NO está incluido; el resto del blob es completo.

do $$
declare
  v_user_id uuid;
  v_blob    jsonb := $blob${"cleo_cots":[{"id":1790043697583,"fecha":"2026-09-21","items":[{"id":"it_1790042895409","total":300,"nombre":"Chimichurri - 500 ml","cantidad":1,"catalogoId":1787782756230,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790043469402_3us7","total":300,"nombre":"Crema de ajo - 500 ml","cantidad":1,"catalogoId":1787782756220,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790043488760_t0ry","total":300,"nombre":"Xcatic - 500 ml","cantidad":1,"catalogoId":1787782756250,"condiciones":"","descripcion":"","precioUnitario":300}],"monto":750,"notas":"","pagos":[],"estatus":"Pendiente","cantidad":3,"concepto":"Chimichurri - 500 ml, Crema de ajo - 500 ml y Xcatic - 500 ml","subtotal":900,"vigencia":"","clienteId":1790043500661,"descuento":150,"precioUnit":250,"vigenciaDias":"","motivoPerdida":"","svCondiciones":"","tipoDescuento":"monto","condicionesPago":"","seguimientoFecha":"","fechaHoraCreacion":"2026-09-22T02:21:37.583Z","seguimientoEstado":"","svCondicionesHtml":"","seguimientoAtendidoFecha":"","vinculadaOportunidadActual":true},{"id":1790044899000,"fecha":"2026-09-21","items":[{"id":"it_1790044710461","total":300,"nombre":"Crema de ajo - 500 ml","cantidad":1,"catalogoId":1787782756220,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790044747520_gbwb","total":300,"nombre":"Chipotle - 500 ml","cantidad":1,"catalogoId":1787782756245,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790044820869_1sbh","total":300,"nombre":"Macha Spicy - 500 ml","cantidad":1,"catalogoId":1787782756260,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790044965054_hpgs","total":60,"nombre":"servicio a domicilio","cantidad":1,"catalogoId":1790044661525,"condiciones":"solo en horario de 7 a 10 pm","descripcion":"","precioUnitario":60}],"monto":860,"notas":"","pagos":[],"estatus":"Pendiente","cantidad":4,"concepto":"Crema de ajo - 500 ml, Chipotle - 500 ml, Macha Spicy - 500 ml y 1 producto más","subtotal":960,"vigencia":"","clienteId":1788286091402,"descuento":100,"precioUnit":215,"vigenciaDias":"","motivoPerdida":"","svCondiciones":"","tipoDescuento":"monto","condicionesPago":"","seguimientoFecha":"","fechaHoraCreacion":"2026-09-22T02:41:39.000Z","seguimientoEstado":"","svCondicionesHtml":"","seguimientoAtendidoFecha":"","vinculadaOportunidadActual":true},{"id":1790442035513,"fecha":"2026-09-26","items":[{"id":"it_1790441310786","total":100,"nombre":"Macha Spicy - 100 ml","cantidad":1,"catalogoId":1787782756258,"condiciones":"","descripcion":"","precioUnitario":100},{"id":"it_1790441551536_bh8q","total":100,"nombre":"Macha Dulce - 100 ml","cantidad":1,"catalogoId":1787782756263,"condiciones":"","descripcion":"","precioUnitario":100},{"id":"it_1790441569038_15u6","total":200,"nombre":"Crema de Habanero - 100 ml","cantidad":2,"catalogoId":1787782756303,"condiciones":"","descripcion":"","precioUnitario":100}],"monto":350,"notas":"","pagos":[],"estatus":"Pendiente","cantidad":4,"concepto":"Macha Spicy - 100 ml, Macha Dulce - 100 ml y Crema de Habanero - 100 ml","subtotal":400,"vigencia":"","clienteId":1790442013906,"descuento":50,"precioUnit":87.5,"vigenciaDias":"","motivoPerdida":"","svCondiciones":"","tipoDescuento":"monto","condicionesPago":"","seguimientoFecha":"","fechaHoraCreacion":"2026-09-26T17:00:35.513Z","seguimientoEstado":"","svCondicionesHtml":"","seguimientoAtendidoFecha":"","vinculadaOportunidadActual":true}],"cleo_perfil":{"banco":"","color":"#ffffff","email":"victoria@cleo.test","nombre":"Salsas Soydiva","mensaje":"Gracias por tu confianza.","redesFB":"salsasdiva","redesIG":"salsasdiva","redesTT":"salsasdiva","telefono":"9993898788","tuNombre":"Victoria","direccion":"","bancoclabe":"","colorTexto":"#ffffff","tipoPerfil":"productos","bancoaccount":"","bancotitular":"","colorSecundario":"#123f6d","condicionesPago":"50% anticipo, 50% al entregar.","onboardingListo":true,"bancoinstrucciones":""},"cleo_ventas":[],"cleo_pedidos":[{"id":"ped_1790801646075","fecha":"2026-09-30","items":[{"id":"it_1790801674171_we9h","total":300,"nombre":"Crema de ajo - 500 ml","cantidad":1,"catalogoId":1787782756220,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790801674171_e3vt","total":300,"nombre":"Chipotle - 500 ml","cantidad":1,"catalogoId":1787782756245,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790801674171_he66","total":300,"nombre":"Macha Spicy - 500 ml","cantidad":1,"catalogoId":1787782756260,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790801674171_pc8s","total":60,"nombre":"servicio a domicilio","cantidad":1,"catalogoId":1790044661525,"condiciones":"solo en horario de 7 a 10 pm","descripcion":"","precioUnitario":60}],"notas":"le damos un descueto de $100","pagos":[],"total":860,"cantidad":4,"clienteId":1788286091402,"productos":"Crema de ajo - 500 ml, Chipotle - 500 ml, Macha Spicy - 500 ml y 1 producto más","fechaCreado":"2026-09-30T20:54:06.075Z","cotizacionId":1790044899000,"estadoPedido":"preparando","fechaEntrega":"2026-09-30","itemsConfirmacion":[{"id":"it_1790801312097_m1o2","total":300,"nombre":"Chipotle - 500 ml","cantidad":1,"catalogoId":1787782756245,"precioUnitario":300},{"id":"it_1790801343435_c4lv","total":300,"nombre":"Pesto - 500 ml","cantidad":1,"catalogoId":1787782756235,"precioUnitario":300},{"id":"it_1790801563040_09ht","total":300,"nombre":"Crema de ajo - 500 ml","cantidad":1,"catalogoId":1787782756220,"precioUnitario":300},{"id":"it_1790801591297_b73p","total":60,"nombre":"servicio a domicilio","cantidad":1,"catalogoId":1790044661525,"precioUnitario":60}],"montoConfirmacion":960},{"id":"ped_1790703636759","fecha":"2026-09-28","notas":"600 de vanya 400 de dieg0","pagos":[{"id":"pg_1790703636759_f7u7p","fecha":"2026-09-28","monto":1000,"concepto":"Pago completo","fechaHoraPago":"2026-09-29T17:40:36.759Z"}],"total":1000,"cantidad":1,"etiqueta":"en canvaceo ","clienteId":null,"productos":"","fechaCreado":"2026-09-29T17:40:36.759Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-28"},{"id":"ped_1790637613091","fecha":"2026-09-27","notas":"venta diego y victoria","pagos":[{"id":"pg_1790637613091_y9at5","fecha":"2026-09-27","monto":5450,"concepto":"Pago completo","fechaHoraPago":"2026-09-28T23:20:13.091Z"}],"total":5450,"cantidad":1,"etiqueta":"bazar de galerias campeche","clienteId":null,"productos":"","fechaCreado":"2026-09-28T23:20:13.091Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-27"},{"id":"ped_1790637561082","fecha":"2026-09-26","notas":"venta de diego y vanya ","pagos":[{"id":"pg_1790637561082_c5zgh","fecha":"2026-09-26","monto":7850,"concepto":"Pago completo","fechaHoraPago":"2026-09-28T23:19:21.082Z"}],"total":7850,"cantidad":1,"etiqueta":"en el bazar de galerias campeche","clienteId":null,"productos":"","fechaCreado":"2026-09-28T23:19:21.082Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-26"},{"id":"ped_1790442013935","fecha":"2026-09-26","items":[{"id":"it_1790442049025_a4yx","total":100,"nombre":"Macha Spicy - 100 ml","cantidad":1,"catalogoId":1787782756258,"condiciones":"","descripcion":"","precioUnitario":100},{"id":"it_1790442049025_dmkm","total":100,"nombre":"Macha Dulce - 100 ml","cantidad":1,"catalogoId":1787782756263,"condiciones":"","descripcion":"","precioUnitario":100},{"id":"it_1790442049025_84jk","total":200,"nombre":"Crema de Habanero - 100 ml","cantidad":2,"catalogoId":1787782756303,"condiciones":"","descripcion":"","precioUnitario":100}],"notas":"","pagos":[{"id":"pg_1790442059025_3lils","fecha":"2026-09-25","monto":350,"concepto":"Pago completo","fechaHoraPago":"2026-09-26T17:00:59.025Z"}],"total":350,"cantidad":4,"clienteId":1790442013906,"productos":"Macha Spicy - 100 ml, Macha Dulce - 100 ml y Crema de Habanero - 100 ml","fechaCreado":"2026-09-26T17:00:13.935Z","cotizacionId":1790442035513,"estadoPedido":"entregado","fechaEntrega":"2026-09-26","fechaHoraEntrega":"2026-09-26T17:01:02.770Z","itemsConfirmacion":[{"id":"it_1790441310786","total":100,"nombre":"Macha Spicy - 100 ml","cantidad":1,"catalogoId":1787782756258,"precioUnitario":100},{"id":"it_1790441551536_bh8q","total":100,"nombre":"Macha Dulce - 100 ml","cantidad":1,"catalogoId":1787782756263,"precioUnitario":100},{"id":"it_1790441569038_15u6","total":200,"nombre":"Crema de Habanero - 100 ml","cantidad":2,"catalogoId":1787782756303,"precioUnitario":100}],"montoConfirmacion":400},{"id":"ped_1790441309279","fecha":"2026-09-26","items":[{"id":"it_1790441149489","total":300,"nombre":"Crema de ajo - 500 ml","cantidad":1,"catalogoId":1787782756220,"precioUnitario":300},{"id":"it_1790441307266_yodb","total":300,"nombre":"Macha Chapulines - 500 ml","cantidad":1,"catalogoId":1787782756270,"precioUnitario":300}],"notas":"","pagos":[{"id":"pg_1790637760039_d9gqz","fecha":"2026-09-26","monto":600,"concepto":"Pago completo","fechaHoraPago":"2026-09-28T23:22:40.039Z"}],"total":600,"cantidad":2,"clienteId":1790441309251,"productos":"Crema de ajo - 500 ml y Macha Chapulines - 500 ml","fechaCreado":"2026-09-26T16:48:29.279Z","estadoPedido":"entregado","fechaEntrega":"2026-09-28","fechaHoraEntrega":"2026-09-28T23:22:44.098Z","itemsConfirmacion":[{"id":"it_1790441149489","total":300,"nombre":"Crema de ajo - 500 ml","cantidad":1,"catalogoId":1787782756220,"precioUnitario":300},{"id":"it_1790441307266_yodb","total":300,"nombre":"Macha Chapulines - 500 ml","cantidad":1,"catalogoId":1787782756270,"precioUnitario":300}],"montoConfirmacion":600},{"id":"ped_1790441105233","fecha":"2026-09-26","items":[{"id":"it_1790441149442_0kdz","total":300,"nombre":"Chimichurri - 500 ml","cantidad":1,"catalogoId":1787782756230,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790441149442_gz1x","total":300,"nombre":"Crema de ajo - 500 ml","cantidad":1,"catalogoId":1787782756220,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790441149442_y72q","total":300,"nombre":"Xcatic - 500 ml","cantidad":1,"catalogoId":1787782756250,"condiciones":"","descripcion":"","precioUnitario":300}],"notas":"","pagos":[{"id":"pg_1790703801339_zm1cr","fecha":"2026-09-29","monto":750,"concepto":"Pago completo","fechaHoraPago":"2026-09-29T17:43:21.339Z"}],"total":750,"cantidad":3,"clienteId":1790043500661,"productos":"Chimichurri - 500 ml, Crema de ajo - 500 ml y Xcatic - 500 ml","fechaCreado":"2026-09-26T16:45:05.214Z","cotizacionId":1790043697583,"estadoPedido":"entregado","fechaEntrega":"2026-09-29","fechaHoraEntrega":"2026-09-29T17:43:25.462Z","itemsConfirmacion":[{"id":"it_1790042895409","total":300,"nombre":"Chimichurri - 500 ml","cantidad":1,"catalogoId":1787782756230,"precioUnitario":300},{"id":"it_1790043469402_3us7","total":300,"nombre":"Crema de ajo - 500 ml","cantidad":1,"catalogoId":1787782756220,"precioUnitario":300},{"id":"it_1790043488760_t0ry","total":300,"nombre":"Xcatic - 500 ml","cantidad":1,"catalogoId":1787782756250,"precioUnitario":300}],"montoConfirmacion":900},{"id":"ped_1790440710875","fecha":"2026-09-25","notas":"venta diego y vanya ","pagos":[{"id":"pg_1790440710875_3y24p","fecha":"2026-09-25","monto":5250,"concepto":"Pago completo","fechaHoraPago":"2026-09-26T16:38:30.875Z"}],"total":5250,"cantidad":1,"etiqueta":"en el bazar de campeche galerias","clienteId":null,"productos":"","fechaCreado":"2026-09-26T16:38:30.875Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-25"},{"id":"ped_1790440635375","fecha":"2026-09-24","notas":"venta se diego y vanya","pagos":[{"id":"pg_1790440635375_u1r84","fecha":"2026-09-24","monto":2700,"concepto":"Pago completo","fechaHoraPago":"2026-09-26T16:37:15.375Z"}],"total":2700,"cantidad":1,"etiqueta":"en el bazar de galerías campeche","clienteId":null,"productos":"","fechaCreado":"2026-09-26T16:37:15.375Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-24"},{"id":"ped_1790215940748","fecha":"2026-09-23","items":[{"id":"it_1790215892989","total":450,"nombre":"Macha - 1000 ml","cantidad":1,"catalogoId":1787782756241,"precioUnitario":450}],"notas":"","pagos":[],"total":450,"cantidad":1,"clienteId":1788285527097,"productos":"Macha - 1000 ml","fechaCreado":"2026-09-24T02:12:20.748Z","estadoPedido":"preparando","fechaEntrega":"2026-09-30","itemsConfirmacion":[{"id":"it_1790215892989","total":450,"nombre":"Macha - 1000 ml","cantidad":1,"catalogoId":1787782756241,"precioUnitario":450}],"montoConfirmacion":450},{"id":"ped_1790215763515","fecha":"2026-09-23","items":[{"id":"it_1790215566908","total":200,"nombre":"Macha Dulce - 250 ml","cantidad":1,"catalogoId":1787782756264,"precioUnitario":200}],"notas":"","pagos":[{"id":"pg_1790442195781_8e4rm","fecha":"2026-09-23","monto":200,"concepto":"Pago completo","fechaHoraPago":"2026-09-26T17:03:15.781Z"}],"total":200,"cantidad":1,"clienteId":1790215763477,"productos":"Macha Dulce - 250 ml","fechaCreado":"2026-09-24T02:09:23.515Z","estadoPedido":"entregado","fechaEntrega":"2026-09-26","fechaHoraEntrega":"2026-09-26T17:03:19.985Z","itemsConfirmacion":[{"id":"it_1790215566908","total":200,"nombre":"Macha Dulce - 250 ml","cantidad":1,"catalogoId":1787782756264,"precioUnitario":200}],"montoConfirmacion":200},{"id":"ped_1790198061487","fecha":"2026-09-22","notas":"venta de diegp","pagos":[{"id":"pg_1790198061488_m2qax","fecha":"2026-09-22","monto":500,"concepto":"Pago completo","fechaHoraPago":"2026-09-23T21:14:21.488Z"}],"total":500,"cantidad":1,"etiqueta":"Venta en canvaseo en urban center ","clienteId":null,"productos":"","fechaCreado":"2026-09-23T21:14:21.487Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-22"},{"id":"ped_1790045593820","fecha":"2026-09-20","notas":"VENTA DE VANYA","pagos":[{"id":"pg_1790045593820_2svcf","fecha":"2026-09-20","monto":1100,"concepto":"Pago completo","fechaHoraPago":"2026-09-22T02:53:13.820Z"}],"total":1100,"cantidad":1,"etiqueta":"BAZAR DE UPTAOWN","clienteId":null,"productos":"","fechaCreado":"2026-09-22T02:53:13.820Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-20"},{"id":"ped_1790045525870","fecha":"2026-09-19","notas":"VENTA DE DIEGO","pagos":[{"id":"pg_1790045525870_ochc3","fecha":"2026-09-19","monto":1200,"concepto":"Pago completo","fechaHoraPago":"2026-09-22T02:52:05.870Z"}],"total":1200,"cantidad":1,"etiqueta":"BAZAR DE UPTAWON","clienteId":null,"productos":"","fechaCreado":"2026-09-22T02:52:05.870Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-19"},{"id":"ped_1790045452435","fecha":"2026-09-21","notas":"VENTA DE DIEGO","pagos":[{"id":"pg_1790045452436_b2fwh","fecha":"2026-09-21","monto":2250,"concepto":"Pago completo","fechaHoraPago":"2026-09-22T02:50:52.436Z"}],"total":2250,"cantidad":1,"etiqueta":"EN EL BAZAR DE UP TAOWN","clienteId":null,"productos":"","fechaCreado":"2026-09-22T02:50:52.435Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-21"},{"id":"ped_1790045235840","fecha":"2026-09-18","notas":"VENTA DE VICTORIA Y VANYA","pagos":[{"id":"pg_1790045235840_z8dj7","fecha":"2026-09-18","monto":4050,"concepto":"Pago completo","fechaHoraPago":"2026-09-22T02:47:15.840Z"}],"total":4050,"cantidad":1,"etiqueta":"EXPO TUZUNAMI","clienteId":null,"productos":"","fechaCreado":"2026-09-22T02:47:15.840Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-18"},{"id":"ped_1790044877485","fecha":"2026-09-21","items":[{"id":"it_1790044981351_5t24","total":300,"nombre":"Crema de ajo - 500 ml","cantidad":1,"catalogoId":1787782756220,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790044981351_7190","total":300,"nombre":"Chipotle - 500 ml","cantidad":1,"catalogoId":1787782756245,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790044981351_fane","total":300,"nombre":"Macha Spicy - 500 ml","cantidad":1,"catalogoId":1787782756260,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790044981351_quci","total":60,"nombre":"servicio a domicilio","cantidad":1,"catalogoId":1790044661525,"condiciones":"solo en horario de 7 a 10 pm","descripcion":"","precioUnitario":60}],"notas":"","pagos":[{"id":"pg_1790045031717_bczwu","fecha":"2026-09-21","monto":860,"concepto":"Pago completo","fechaHoraPago":"2026-09-22T02:43:51.717Z"}],"total":860,"cantidad":3,"clienteId":1788286091402,"productos":"Crema de ajo - 500 ml, Chipotle - 500 ml, Macha Spicy - 500 ml y 1 producto más","fechaCreado":"2026-09-22T02:41:17.485Z","cotizacionId":1790044899000,"estadoPedido":"entregado","fechaEntrega":"2026-09-21","fechaHoraEntrega":"2026-09-22T02:43:58.379Z","itemsConfirmacion":[{"id":"it_1790044710461","total":300,"nombre":"Crema de ajo - 500 ml","cantidad":1,"catalogoId":1787782756220,"precioUnitario":300},{"id":"it_1790044747520_gbwb","total":300,"nombre":"Chipotle - 500 ml","cantidad":1,"catalogoId":1787782756245,"precioUnitario":300},{"id":"it_1790044820869_1sbh","total":300,"nombre":"Macha Spicy - 500 ml","cantidad":1,"catalogoId":1787782756260,"precioUnitario":300}],"montoConfirmacion":900},{"id":"ped_1790044368535","fecha":"2026-09-21","items":[{"id":"it_1790044273077","total":200,"nombre":"Macha Spicy - 250 ml","cantidad":1,"catalogoId":1787782756259,"precioUnitario":200}],"notas":"","pagos":[{"id":"pg_1790044368536_ftipg","fecha":"2026-09-21","monto":200,"concepto":"Pago completo","fechaHoraPago":"2026-09-22T02:32:48.536Z"}],"total":200,"cantidad":1,"clienteId":1790044368511,"productos":"Macha Spicy - 250 ml","fechaCreado":"2026-09-22T02:32:48.535Z","estadoPedido":"entregado","fechaEntrega":"2026-09-21","fechaHoraEntrega":"2026-09-22T02:32:52.840Z","itemsConfirmacion":[{"id":"it_1790044273077","total":200,"nombre":"Macha Spicy - 250 ml","cantidad":1,"catalogoId":1787782756259,"precioUnitario":200}],"montoConfirmacion":200},{"id":"ped_1790044270839","fecha":"2026-09-21","items":[{"id":"it_1790043697624","total":300,"nombre":"Macha - 500 ml","cantidad":1,"catalogoId":1787782756240,"precioUnitario":300}],"notas":"","pagos":[{"id":"pg_1790214343945_6doly","fecha":"2026-09-19","monto":300,"concepto":"Pago completo","fechaHoraPago":"2026-09-24T01:45:43.945Z"}],"total":300,"cantidad":1,"clienteId":1790044262689,"productos":"Macha - 500 ml","fechaCreado":"2026-09-22T02:31:10.764Z","estadoPedido":"entregado","fechaEntrega":"2026-09-23","fechaHoraEntrega":"2026-09-24T01:45:53.235Z","itemsConfirmacion":[{"id":"it_1790043697624","total":300,"nombre":"Macha - 500 ml","cantidad":1,"catalogoId":1787782756240,"precioUnitario":300}],"montoConfirmacion":300},{"id":"ped_1790041521264","fecha":"2026-09-21","items":[{"id":"it_1790041277460","total":450,"nombre":"Macha Dulce - 1000 ml","cantidad":1,"catalogoId":1787782756266,"precioUnitario":450}],"notas":"","pagos":[{"id":"pg_1790041521265_i2fzl","fecha":"2026-09-21","monto":450,"concepto":"Pago completo","fechaHoraPago":"2026-09-22T01:45:21.265Z"}],"total":450,"cantidad":1,"clienteId":1790041521246,"productos":"Macha Dulce - 1000 ml","fechaCreado":"2026-09-22T01:45:21.265Z","estadoPedido":"entregado","fechaEntrega":"2026-09-29","fechaHoraEntrega":"2026-09-29T17:41:25.506Z","itemsConfirmacion":[{"id":"it_1790041277460","total":450,"nombre":"Macha Dulce - 1000 ml","cantidad":1,"catalogoId":1787782756266,"precioUnitario":450}],"montoConfirmacion":450},{"id":"ped_1790041168581","fecha":"2026-09-21","items":[{"id":"it_1790040578410","total":200,"nombre":"Xcatic - 250 ml","cantidad":1,"catalogoId":1787782756249,"precioUnitario":200}],"notas":"calle 87  108y110 viva alegre en caucel numero de casas 844 esta a lado de una dispensadora de agua","pagos":[{"id":"pg_1790041168582_x9ktj","fecha":"2026-09-21","monto":200,"concepto":"Pago completo","fechaHoraPago":"2026-09-22T01:39:28.582Z"}],"total":200,"cantidad":1,"clienteId":1790041168562,"productos":"Xcatic - 250 ml","fechaCreado":"2026-09-22T01:39:28.581Z","estadoPedido":"entregado","fechaEntrega":"2026-09-23","fechaHoraEntrega":"2026-09-24T01:43:23.825Z","itemsConfirmacion":[{"id":"it_1790040578410","total":200,"nombre":"Xcatic - 250 ml","cantidad":1,"catalogoId":1787782756249,"precioUnitario":200}],"montoConfirmacion":200},{"id":"ped_1790040396528","fecha":"2026-09-21","items":[{"id":"it_1790040220941","total":200,"nombre":"Xcatic - 250 ml","cantidad":1,"catalogoId":1787782756249,"precioUnitario":200},{"id":"it_1790040317048_5jli","total":100,"nombre":"Macha Dulce - 100 ml","cantidad":1,"catalogoId":1787782756263,"precioUnitario":100}],"notas":"calle 13 tamarindos cholul numero 10","pagos":[{"id":"pg_1790040396528_6wzhp","fecha":"2026-09-21","monto":150,"concepto":"Anticipo","fechaHoraPago":"2026-09-22T01:26:36.528Z"},{"id":"pg_1790135253952_dxf1m","fecha":"2026-09-22","monto":150,"concepto":"Pago final","fechaHoraPago":"2026-09-23T03:47:33.952Z"}],"total":300,"cantidad":2,"clienteId":1790040396509,"productos":"Xcatic - 250 ml y Macha Dulce - 100 ml","fechaCreado":"2026-09-22T01:26:36.528Z","estadoPedido":"entregado","fechaEntrega":"2026-09-22","fechaHoraEntrega":"2026-09-23T03:47:37.948Z","itemsConfirmacion":[{"id":"it_1790040220941","total":200,"nombre":"Xcatic - 250 ml","cantidad":1,"catalogoId":1787782756249,"precioUnitario":200},{"id":"it_1790040317048_5jli","total":100,"nombre":"Macha Dulce - 100 ml","cantidad":1,"catalogoId":1787782756263,"precioUnitario":100}],"montoConfirmacion":300},{"id":"ped_1790040204680","fecha":"2026-09-21","items":[{"id":"it_1790039921335","total":450,"nombre":"Macha Dulce - 1000 ml","cantidad":1,"catalogoId":1787782756266,"precioUnitario":450}],"notas":"calle 16 x 13y13B numero 43A col felipe carrillo puerto cuburna","pagos":[{"id":"pg_1790040204681_66vwa","fecha":"2026-09-21","monto":225,"concepto":"Anticipo","fechaHoraPago":"2026-09-22T01:23:24.681Z"},{"id":"pg_1790703711918_zlz7o","fecha":"2026-09-29","monto":225,"concepto":"Pago final","fechaHoraPago":"2026-09-29T17:41:51.918Z"}],"total":450,"cantidad":1,"clienteId":1790040204659,"productos":"Macha Dulce - 1000 ml","fechaCreado":"2026-09-22T01:23:24.680Z","estadoPedido":"entregado","fechaEntrega":"2026-09-29","fechaHoraEntrega":"2026-09-29T17:41:57.621Z","itemsConfirmacion":[{"id":"it_1790039921335","total":450,"nombre":"Macha Dulce - 1000 ml","cantidad":1,"catalogoId":1787782756266,"precioUnitario":450}],"montoConfirmacion":450},{"id":"ped_1789844240385","fecha":"2026-09-13","notas":"vanya","pagos":[{"id":"pg_1789844240385_w5ayo","fecha":"2026-09-13","monto":4650,"concepto":"Pago completo","fechaHoraPago":"2026-09-19T18:57:20.385Z"}],"total":4650,"cantidad":1,"etiqueta":"bazar the harbor","clienteId":null,"productos":"","fechaCreado":"2026-09-19T18:57:20.385Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-13"},{"id":"ped_1789844200173","fecha":"2026-09-12","notas":"vanya","pagos":[{"id":"pg_1789844200173_13o9g","fecha":"2026-09-12","monto":3000,"concepto":"Pago completo","fechaHoraPago":"2026-09-19T18:56:40.173Z"}],"total":3000,"cantidad":1,"etiqueta":"bazar en the harbor","clienteId":null,"productos":"","fechaCreado":"2026-09-19T18:56:40.173Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-12"},{"id":"ped_1789844161871","fecha":"2026-09-11","notas":"vanya","pagos":[{"id":"pg_1789844161871_rk5qt","fecha":"2026-09-11","monto":4230,"concepto":"Pago completo","fechaHoraPago":"2026-09-19T18:56:01.871Z"}],"total":4230,"cantidad":1,"etiqueta":"bazar de the harbor","clienteId":null,"productos":"","fechaCreado":"2026-09-19T18:56:01.871Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-11"},{"id":"ped_1789844072153","fecha":"2026-09-13","notas":"diego","pagos":[{"id":"pg_1789844072153_frh9d","fecha":"2026-09-13","monto":3500,"concepto":"Pago completo","fechaHoraPago":"2026-09-19T18:54:32.153Z"}],"total":3500,"cantidad":1,"etiqueta":"bazar de up twaon ","clienteId":null,"productos":"","fechaCreado":"2026-09-19T18:54:32.153Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-13"},{"id":"ped_1789844032363","fecha":"2026-09-12","notas":"diego","pagos":[{"id":"pg_1789844032363_f4f3c","fecha":"2026-09-12","monto":2200,"concepto":"Pago completo","fechaHoraPago":"2026-09-19T18:53:52.363Z"}],"total":2200,"cantidad":1,"etiqueta":"bazar de up tawon","clienteId":null,"productos":"","fechaCreado":"2026-09-19T18:53:52.363Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-12"},{"id":"ped_1789843941293","fecha":"2026-09-11","notas":"diego todo el dia","pagos":[{"id":"pg_1789843941293_tnaua","fecha":"2026-09-11","monto":1100,"concepto":"Pago completo","fechaHoraPago":"2026-09-19T18:52:21.293Z"}],"total":1100,"cantidad":1,"etiqueta":"venta en el bazar de up tawon ","clienteId":null,"productos":"","fechaCreado":"2026-09-19T18:52:21.293Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-11"},{"id":"ped_1789843889424","fecha":"2026-09-10","notas":"","pagos":[{"id":"pg_1789843889424_17pbc","fecha":"2026-09-10","monto":700,"concepto":"Pago completo","fechaHoraPago":"2026-09-19T18:51:29.424Z"}],"total":700,"cantidad":1,"etiqueta":"venta en canvaseo en el chedaui de urban center","clienteId":null,"productos":"","fechaCreado":"2026-09-19T18:51:29.424Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-10"},{"id":"ped_1789843836295","fecha":"2026-09-10","notas":"fue venta de diegó ","pagos":[{"id":"pg_1789843836295_q9qbx","fecha":"2026-09-10","monto":1900,"concepto":"Pago completo","fechaHoraPago":"2026-09-19T18:50:36.295Z"}],"total":1900,"cantidad":1,"etiqueta":"en el  bazar de the harbor","clienteId":null,"productos":"","fechaCreado":"2026-09-19T18:50:36.295Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-10"},{"id":"ped_1789843636275","fecha":"2026-09-18","notas":"se gastó 165 de comida veta total de diego","pagos":[{"id":"pg_1789843636275_rim4t","fecha":"2026-09-18","monto":2250,"concepto":"Pago completo","fechaHoraPago":"2026-09-19T18:47:16.275Z"}],"total":2250,"cantidad":1,"etiqueta":"en el bazar de up tawon ","clienteId":null,"productos":"","fechaCreado":"2026-09-19T18:47:16.275Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-18"},{"id":"ped_1788983566437","fecha":"2026-09-09","items":[{"id":"it_1788977347983","total":100,"nombre":"Habanero fuego - 100 ml","cantidad":1,"catalogoId":1787782756298,"precioUnitario":100},{"id":"it_1788983548936_mbf5","total":100,"nombre":"Crema de Habanero - 100 ml","cantidad":1,"catalogoId":1787782756303,"precioUnitario":100}],"notas":"","pagos":[{"id":"pg_1788983566437_35o1c","fecha":"2026-09-09","monto":200,"concepto":"Pago completo","fechaHoraPago":"2026-09-09T19:52:46.437Z"}],"total":200,"cantidad":2,"clienteId":1788286352749,"productos":"Habanero fuego - 100 ml y Crema de Habanero - 100 ml","fechaCreado":"2026-09-09T19:52:46.437Z","origenVenta":"registro_manual","estadoPedido":"entregado","fechaEntrega":"2026-09-09","itemsConfirmacion":[{"id":"it_1788977347983","total":100,"nombre":"Habanero fuego - 100 ml","cantidad":1,"catalogoId":1787782756298,"precioUnitario":100},{"id":"it_1788983548936_mbf5","total":100,"nombre":"Crema de Habanero - 100 ml","cantidad":1,"catalogoId":1787782756303,"precioUnitario":100}],"montoConfirmacion":200},{"id":"ped_1788915604943","fecha":"2026-09-05","notas":"","pagos":[{"id":"pg_1788915604943_0lnl7","fecha":"2026-09-05","monto":14930,"concepto":"Pago completo","fechaHoraPago":"2026-09-09T01:00:04.943Z"}],"total":14930,"cantidad":1,"etiqueta":"en el bazar gourmet show 2026 ","clienteId":null,"productos":"","fechaCreado":"2026-09-09T01:00:04.943Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-05"},{"id":"ped_1788915454632","fecha":"2026-09-04","notas":"","pagos":[{"id":"pg_1788915454632_2km6o","fecha":"2026-09-04","monto":11467.7,"concepto":"Pago completo","fechaHoraPago":"2026-09-09T00:57:34.632Z"}],"total":11467.7,"cantidad":1,"etiqueta":"Bazar del gourmet show 2026 ","clienteId":null,"productos":"","fechaCreado":"2026-09-09T00:57:34.632Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-04"},{"id":"ped_1788915170891","fecha":"2026-09-03","notas":"me falto contar esto ","pagos":[{"id":"pg_1788915170891_dg28f","fecha":"2026-09-03","monto":300,"concepto":"Pago completo","fechaHoraPago":"2026-09-09T00:52:50.891Z"}],"total":300,"cantidad":1,"etiqueta":"Bazar gurmet show 2026","clienteId":null,"productos":"","fechaCreado":"2026-09-09T00:52:50.891Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-03"},{"id":"ped_1788496232609","fecha":"2026-09-03","items":[{"id":"it_1788496125741","total":450,"nombre":"Macha Dulce - 1000 ml","cantidad":1,"catalogoId":1787782756266,"precioUnitario":450}],"notas":"","pagos":[{"id":"pg_1788496232609_khbcx","fecha":"2026-09-03","monto":450,"concepto":"Pago completo","fechaHoraPago":"2026-09-04T04:30:32.609Z"}],"total":450,"cantidad":1,"clienteId":1788496232594,"productos":"Macha Dulce - 1000 ml","fechaCreado":"2026-09-04T04:30:32.609Z","estadoPedido":"entregado","fechaEntrega":"2026-09-09","fechaHoraEntrega":"2026-09-09T19:40:16.412Z","itemsConfirmacion":[{"id":"it_1788496125741","total":450,"nombre":"Macha Dulce - 1000 ml","cantidad":1,"catalogoId":1787782756266,"precioUnitario":450}],"montoConfirmacion":450},{"id":"ped_1788496123838","fecha":"2026-09-03","items":[{"id":"it_1788496036738_259o","total":600,"nombre":"Macha - 250 ml","cantidad":3,"catalogoId":1787782756239,"precioUnitario":200}],"notas":"","pagos":[{"id":"pg_1788982885997_1h4hi","fecha":"2026-09-09","monto":600,"concepto":"Pago completo","fechaHoraPago":"2026-09-09T19:41:25.997Z"}],"total":600,"cantidad":3,"clienteId":1788496123820,"productos":"Macha - 250 ml","fechaCreado":"2026-09-04T04:28:43.838Z","estadoPedido":"entregado","fechaEntrega":"2026-09-09","fechaHoraEntrega":"2026-09-09T19:41:31.887Z","itemsConfirmacion":[{"id":"it_1788496036738_259o","total":600,"nombre":"Macha - 250 ml","cantidad":3,"catalogoId":1787782756239,"precioUnitario":200}],"montoConfirmacion":600},{"id":"ped_1788495819754","fecha":"2026-09-03","items":[{"id":"it_1788495594024","total":200,"nombre":"Habanero tatemado - 250 ml","cantidad":1,"catalogoId":1787782756294,"precioUnitario":200}],"notas":"","pagos":[],"total":200,"cantidad":1,"clienteId":1788495819736,"productos":"Habanero tatemado - 250 ml","fechaCreado":"2026-09-04T04:23:39.754Z","estadoPedido":"cancelado","fechaEntrega":"2026-09-06","fechaCancelacion":"2026-09-23","itemsConfirmacion":[{"id":"it_1788495594024","total":200,"nombre":"Habanero tatemado - 250 ml","cantidad":1,"catalogoId":1787782756294,"precioUnitario":200}],"montoConfirmacion":200,"motivoCancelacion":"falta de inventario","anticipoConservado":false,"fechaHoraCancelacion":"2026-09-24T01:42:24.919Z","motivoCancelacionLado":"otro"},{"id":"ped_1788495491998","fecha":"2026-09-03","items":[{"id":"it_1788495362377","total":400,"nombre":"Macha - 250 ml","cantidad":2,"catalogoId":1787782756239,"precioUnitario":200}],"notas":"","pagos":[{"id":"pg_1788495491998_l5sm5","fecha":"2026-09-03","monto":400,"concepto":"Pago completo","fechaHoraPago":"2026-09-04T04:18:11.998Z"}],"total":400,"cantidad":2,"clienteId":1788495491978,"productos":"Macha - 250 ml","fechaCreado":"2026-09-04T04:18:11.998Z","estadoPedido":"entregado","fechaEntrega":"2026-09-03","fechaHoraEntrega":"2026-09-04T04:18:17.302Z","itemsConfirmacion":[{"id":"it_1788495362377","total":400,"nombre":"Macha - 250 ml","cantidad":2,"catalogoId":1787782756239,"precioUnitario":200}],"montoConfirmacion":400},{"id":"ped_1788495359439","fecha":"2026-09-03","items":[{"id":"it_1788495254448","total":450,"nombre":"Macha Spicy - 1000 ml","cantidad":1,"catalogoId":1787782756261,"precioUnitario":450}],"notas":"","pagos":[{"id":"pg_1790214069689_uap6b","fecha":"2026-09-15","monto":450,"concepto":"Pago completo","fechaHoraPago":"2026-09-24T01:41:09.689Z"}],"total":450,"cantidad":1,"clienteId":1788495359428,"productos":"Macha Spicy - 1000 ml","fechaCreado":"2026-09-04T04:15:59.439Z","estadoPedido":"entregado","fechaEntrega":"2026-09-23","fechaHoraEntrega":"2026-09-24T01:41:19.240Z","itemsConfirmacion":[{"id":"it_1788495254448","total":450,"nombre":"Macha Spicy - 1000 ml","cantidad":1,"catalogoId":1787782756261,"precioUnitario":450}],"montoConfirmacion":450},{"id":"ped_1788495010089","fecha":"2026-09-03","items":[{"id":"it_1788494458537","total":420,"nombre":"Chimichurri - 100 ml","cantidad":6,"catalogoId":1787782756228,"precioUnitario":70},{"id":"it_1788494529033_9han","total":420,"nombre":"Macha Spicy - 100 ml","cantidad":6,"catalogoId":1787782756258,"precioUnitario":70},{"id":"it_1788494558102_n6tx","total":420,"nombre":"Crema de Habanero - 100 ml","cantidad":6,"catalogoId":1787782756303,"precioUnitario":70},{"id":"it_1788494578032_yb98","total":420,"nombre":"Habanero fuego - 100 ml","cantidad":6,"catalogoId":1787782756298,"precioUnitario":70}],"notas":"se le hizo un descuento de 30 porciento","pagos":[{"id":"pg_1788912756417_aa7oy","fecha":"2026-09-08","monto":1680,"concepto":"Pago completo","fechaHoraPago":"2026-09-09T00:12:36.417Z"}],"total":1680,"cantidad":24,"clienteId":1788494622736,"productos":"Chimichurri - 100 ml, Macha Spicy - 100 ml, Crema de Habanero - 100 ml y 1 producto más","fechaCreado":"2026-09-04T04:10:10.079Z","estadoPedido":"entregado","fechaEntrega":"2026-09-23","fechaHoraEntrega":"2026-09-24T01:40:39.123Z","itemsConfirmacion":[{"id":"it_1788494458537","total":420,"nombre":"Chimichurri - 100 ml","cantidad":6,"catalogoId":1787782756228,"precioUnitario":70},{"id":"it_1788494529033_9han","total":420,"nombre":"Macha Spicy - 100 ml","cantidad":6,"catalogoId":1787782756258,"precioUnitario":70},{"id":"it_1788494558102_n6tx","total":420,"nombre":"Crema de Habanero - 100 ml","cantidad":6,"catalogoId":1787782756303,"precioUnitario":70},{"id":"it_1788494578032_yb98","total":420,"nombre":"Habanero fuego - 100 ml","cantidad":6,"catalogoId":1787782756298,"precioUnitario":70}],"montoConfirmacion":1680},{"id":"ped_1788493859148","fecha":"2026-09-03","notas":"todos vedimos","pagos":[{"id":"pg_1788493859148_vhe3n","fecha":"2026-09-03","monto":6950,"concepto":"Pago completo","fechaHoraPago":"2026-09-04T03:50:59.148Z"}],"total":6950,"cantidad":1,"etiqueta":"expo gurmet show mexico","clienteId":null,"productos":"","fechaCreado":"2026-09-04T03:50:59.148Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-09-03"},{"id":"ped_1788286352765","fecha":"2026-09-01","items":[{"id":"it_1788286264647","total":300,"nombre":"Macha Spicy - 500 ml","cantidad":1,"catalogoId":1787782756260,"precioUnitario":300}],"notas":"es para ciudad de mexico","pagos":[{"id":"pg_1788982996735_ime1s","fecha":"2026-09-06","monto":300,"concepto":"Pago completo","fechaHoraPago":"2026-09-09T19:43:16.735Z"}],"total":300,"cantidad":1,"clienteId":1788286352749,"productos":"Macha Spicy - 500 ml","fechaCreado":"2026-09-01T18:12:32.765Z","estadoPedido":"entregado","fechaEntrega":"2026-09-09","fechaHoraEntrega":"2026-09-09T19:50:20.670Z","itemsConfirmacion":[{"id":"it_1788286264647","total":300,"nombre":"Macha Spicy - 500 ml","cantidad":1,"catalogoId":1787782756260,"precioUnitario":300}],"montoConfirmacion":300},{"id":"ped_1788286259493","fecha":"2026-09-01","items":[{"id":"it_1788286131627","total":200,"nombre":"Crema de Habanero - 250 ml","cantidad":1,"catalogoId":1787782756304,"precioUnitario":200}],"notas":"es para ciudad de mexico","pagos":[{"id":"pg_1788983053310_3tz7n","fecha":"2026-09-02","monto":200,"concepto":"Pago completo","fechaHoraPago":"2026-09-09T19:44:13.310Z"}],"total":200,"cantidad":1,"clienteId":1788286259482,"productos":"Crema de Habanero - 250 ml","fechaCreado":"2026-09-01T18:10:59.493Z","estadoPedido":"entregado","fechaEntrega":"2026-09-09","fechaHoraEntrega":"2026-09-09T19:44:19.784Z","itemsConfirmacion":[{"id":"it_1788286131627","total":200,"nombre":"Crema de Habanero - 250 ml","cantidad":1,"catalogoId":1787782756304,"precioUnitario":200}],"montoConfirmacion":200},{"id":"ped_1788286091468","fecha":"2026-09-01","items":[{"id":"it_1788285825452","total":100,"nombre":"Chimichurri - 100 ml","cantidad":1,"catalogoId":1787782756228,"precioUnitario":100},{"id":"it_1788285886359_09uk","total":100,"nombre":"Crema de ajo - 100 ml","cantidad":1,"catalogoId":1787782756218,"precioUnitario":100},{"id":"it_1788285894551_6ebb","total":100,"nombre":"Chipotle - 100 ml","cantidad":1,"catalogoId":1787782756243,"precioUnitario":100},{"id":"it_1788285912634_b9x7","total":100,"nombre":"Crema de Habanero - 100 ml","cantidad":1,"catalogoId":1787782756303,"precioUnitario":100}],"notas":"es para ciudad de mexico","pagos":[{"id":"pg_1788983196620_9fbk6","fecha":"2026-09-01","monto":400,"concepto":"Pago completo","fechaHoraPago":"2026-09-09T19:46:36.620Z"}],"total":400,"cantidad":4,"clienteId":1788286091402,"productos":"Chimichurri - 100 ml, Crema de ajo - 100 ml, Chipotle - 100 ml y 1 producto más","fechaCreado":"2026-09-01T18:08:11.468Z","estadoPedido":"entregado","fechaEntrega":"2026-09-09","fechaHoraEntrega":"2026-09-09T19:46:41.702Z","itemsConfirmacion":[{"id":"it_1788285825452","total":100,"nombre":"Chimichurri - 100 ml","cantidad":1,"catalogoId":1787782756228,"precioUnitario":100},{"id":"it_1788285886359_09uk","total":100,"nombre":"Crema de ajo - 100 ml","cantidad":1,"catalogoId":1787782756218,"precioUnitario":100},{"id":"it_1788285894551_6ebb","total":100,"nombre":"Chipotle - 100 ml","cantidad":1,"catalogoId":1787782756243,"precioUnitario":100},{"id":"it_1788285912634_b9x7","total":100,"nombre":"Crema de Habanero - 100 ml","cantidad":1,"catalogoId":1787782756303,"precioUnitario":100}],"montoConfirmacion":400},{"id":"ped_1788285527097","fecha":"2026-09-01","items":[{"id":"it_1788285073876","total":450,"nombre":"Macha - 1000 ml","cantidad":1,"catalogoId":1787782756241,"precioUnitario":450}],"notas":"","pagos":[{"id":"pg_1788285527097_4n8h5","fecha":"2026-09-01","monto":450,"concepto":"Pago completo","fechaHoraPago":"2026-09-01T17:58:47.097Z"}],"total":450,"cantidad":1,"clienteId":1788285527097,"productos":"Macha - 1000 ml","fechaCreado":"2026-09-01T17:58:47.097Z","origenVenta":"registro_manual","estadoPedido":"entregado","fechaEntrega":"2026-09-09","fechaHoraEntrega":"2026-09-09T19:48:35.413Z","itemsConfirmacion":[{"id":"it_1788285073876","total":450,"nombre":"Macha - 1000 ml","cantidad":1,"catalogoId":1787782756241,"precioUnitario":450}],"montoConfirmacion":450},{"id":"ped_1788285256087","fecha":"2026-08-31","notas":"","pagos":[{"id":"pg_1788285256087_tpz93","fecha":"2026-08-31","monto":800,"concepto":"Pago completo","fechaHoraPago":"2026-09-01T17:54:16.087Z"}],"total":800,"cantidad":1,"etiqueta":"fue en venta de canvaseo","clienteId":null,"productos":"","fechaCreado":"2026-09-01T17:54:16.087Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-08-31"},{"id":"ped_1788200849823","fecha":"2026-08-31","items":[{"id":"it_1788200763331","total":400,"nombre":"Pesto - 250 ml","cantidad":2,"catalogoId":1787782756234,"precioUnitario":200},{"id":"it_1788200824570_5dt8","total":400,"nombre":"Chipotle - 250 ml","cantidad":2,"catalogoId":1787782756244,"precioUnitario":200}],"notas":"","pagos":[{"id":"pg_1788200849826_lcqw2","fecha":"2026-08-31","monto":400,"concepto":"Anticipo","fechaHoraPago":"2026-08-31T18:27:29.826Z"},{"id":"pg_1788983264693_fhnae","fecha":"2026-09-05","monto":400,"concepto":"Pago final","fechaHoraPago":"2026-09-09T19:47:44.693Z"}],"total":800,"cantidad":4,"clienteId":1788200849813,"productos":"Pesto - 250 ml y Chipotle - 250 ml","fechaCreado":"2026-08-31T18:27:29.824Z","origenVenta":"registro_manual","estadoPedido":"entregado","fechaEntrega":"2026-09-09","fechaHoraEntrega":"2026-09-09T19:47:50.460Z","itemsConfirmacion":[{"id":"it_1788200763331","total":400,"nombre":"Pesto - 250 ml","cantidad":2,"catalogoId":1787782756234,"precioUnitario":200},{"id":"it_1788200824570_5dt8","total":400,"nombre":"Chipotle - 250 ml","cantidad":2,"catalogoId":1787782756244,"precioUnitario":200}],"montoConfirmacion":800},{"id":"ped_1788199542407","fecha":"2026-08-30","notas":"Vanya$700 Diego $1000","pagos":[{"id":"pg_1788199542407_5clqx","fecha":"2026-08-30","monto":1700,"concepto":"Pago completo","fechaHoraPago":"2026-08-31T18:05:42.407Z"}],"total":1700,"cantidad":1,"etiqueta":"En canvaseo ","clienteId":null,"productos":"","fechaCreado":"2026-08-31T18:05:42.407Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-08-30"},{"id":"ped_1788125623727","fecha":"2026-08-30","items":[{"id":"it_1788125571338","total":200,"nombre":"Macha Spicy - 250 ml","cantidad":1,"catalogoId":1787782756259,"precioUnitario":200}],"notas":"","pagos":[{"id":"pg_1788125623728_ln9ea","fecha":"2026-08-30","monto":200,"concepto":"Pago completo","fechaHoraPago":"2026-08-30T21:33:43.728Z"}],"total":200,"cantidad":1,"clienteId":1788125623727,"productos":"Macha Spicy - 250 ml","fechaCreado":"2026-08-30T21:33:43.728Z","origenVenta":"registro_manual","estadoPedido":"entregado","fechaEntrega":"2026-08-30","fechaHoraEntrega":"2026-08-31T00:51:50.236Z","itemsConfirmacion":[{"id":"it_1788125571338","total":200,"nombre":"Macha Spicy - 250 ml","cantidad":1,"catalogoId":1787782756259,"precioUnitario":200}],"montoConfirmacion":200},{"id":"ped_1788109666449","fecha":"2026-08-29","notas":"vanya vendio 600 y diego 600","pagos":[{"id":"pg_1788109666450_tjs4l","fecha":"2026-08-29","monto":1200,"concepto":"Pago completo","fechaHoraPago":"2026-08-30T17:07:46.450Z"}],"total":1200,"cantidad":1,"etiqueta":"canbaseo ","clienteId":null,"productos":"","fechaCreado":"2026-08-30T17:07:46.449Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-08-29"},{"id":"ped_1788042817447","fecha":"2026-08-27","notas":"","pagos":[{"id":"pg_1788042817447_rsovv","fecha":"2026-08-27","monto":400,"concepto":"Pago completo","fechaHoraPago":"2026-08-29T22:33:37.447Z"}],"total":400,"cantidad":1,"etiqueta":"fue en venta de canvaseo","clienteId":null,"productos":"","fechaCreado":"2026-08-29T22:33:37.447Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-08-27"},{"id":"ped_1788042728225","fecha":"2026-08-27","items":[{"id":"it_1788042631051","total":100,"nombre":"Xcatic - 100 ml","cantidad":1,"catalogoId":1787782756248,"precioUnitario":100},{"id":"it_1788042685087_4zkd","total":100,"nombre":"Macha Spicy - 100 ml","cantidad":1,"catalogoId":1787782756258,"precioUnitario":100},{"id":"it_1788042699025_3tse","total":100,"nombre":"Rajas con Piña - 100 ml","cantidad":1,"catalogoId":1787782756273,"precioUnitario":100}],"notas":"","pagos":[{"id":"pg_1788042728228_ibw11","fecha":"2026-08-27","monto":300,"concepto":"Pago completo","fechaHoraPago":"2026-08-29T22:32:08.228Z"}],"total":300,"cantidad":3,"clienteId":1788042728223,"productos":"Xcatic - 100 ml, Macha Spicy - 100 ml y Rajas con Piña - 100 ml","fechaCreado":"2026-08-29T22:32:08.225Z","origenVenta":"registro_manual","estadoPedido":"entregado","fechaEntrega":"2026-08-27","itemsConfirmacion":[{"id":"it_1788042631051","total":100,"nombre":"Xcatic - 100 ml","cantidad":1,"catalogoId":1787782756248,"precioUnitario":100},{"id":"it_1788042685087_4zkd","total":100,"nombre":"Macha Spicy - 100 ml","cantidad":1,"catalogoId":1787782756258,"precioUnitario":100},{"id":"it_1788042699025_3tse","total":100,"nombre":"Rajas con Piña - 100 ml","cantidad":1,"catalogoId":1787782756273,"precioUnitario":100}],"montoConfirmacion":300},{"id":"ped_1787949091574","fecha":"2026-08-27","items":[{"id":"it_1787873586828","total":200,"nombre":"Crema de Habanero - 100 ml","cantidad":2,"catalogoId":1787782756303,"precioUnitario":100}],"notas":"","pagos":[{"id":"pg_1787949091575_r9en4","fecha":"2026-08-27","monto":200,"concepto":"Pago completo","fechaHoraPago":"2026-08-28T20:31:31.575Z"}],"total":200,"cantidad":2,"clienteId":1787949091573,"productos":"Crema de Habanero - 100 ml","fechaCreado":"2026-08-28T20:31:31.574Z","origenVenta":"registro_manual","estadoPedido":"entregado","fechaEntrega":"2026-08-27","itemsConfirmacion":[{"id":"it_1787873586828","total":200,"nombre":"Crema de Habanero - 100 ml","cantidad":2,"catalogoId":1787782756303,"precioUnitario":100}],"montoConfirmacion":200},{"id":"ped_1787948987323","fecha":"2026-08-27","notas":"","pagos":[{"id":"pg_1787948987323_ubkky","fecha":"2026-08-27","monto":100,"concepto":"Pago completo","fechaHoraPago":"2026-08-28T20:29:47.323Z"}],"total":100,"cantidad":1,"etiqueta":"en la plaza urban center canbaseo","clienteId":null,"productos":"","fechaCreado":"2026-08-28T20:29:47.323Z","origenVenta":"venta_rapida","estadoPedido":"entregado","fechaEntrega":"2026-08-27"},{"id":"ped_1787873442363","fecha":"2026-08-27","items":[{"id":"it_1787872857924","total":350,"nombre":"slasas diferentes sabores a elegir","cantidad":1,"catalogoId":1787873192129,"precioUnitario":350}],"notas":"","pagos":[{"id":"pg_1787876456409_5tl6h","fecha":"2026-08-27","monto":350,"concepto":"Pago completo","fechaHoraPago":"2026-08-28T00:20:56.409Z"}],"total":350,"cantidad":1,"clienteId":1787873442305,"productos":"slasas diferentes sabores a elegir","fechaCreado":"2026-08-27T23:30:42.363Z","origenVenta":"registro_manual","estadoPedido":"entregado","fechaEntrega":"2026-08-27","fechaHoraEntrega":"2026-08-28T00:21:09.883Z","itemsConfirmacion":[{"id":"it_1787872857924","total":350,"nombre":"slasas diferentes sabores a elegir","cantidad":1,"catalogoId":1787873192129,"precioUnitario":350}],"montoConfirmacion":350},{"id":"ped_1787869188968","fecha":"2026-08-27","items":[{"id":"it_1787866295535","total":200,"nombre":"Macha - 250 ml","cantidad":1,"catalogoId":1787782756239,"precioUnitario":200}],"notas":"","pagos":[{"id":"pg_1787869188974_lj7iu","fecha":"2026-08-27","monto":200,"concepto":"Pago completo","fechaHoraPago":"2026-08-27T22:19:48.974Z"}],"total":200,"cantidad":1,"clienteId":1787869188968,"productos":"Macha - 250 ml","fechaCreado":"2026-08-27T22:19:48.969Z","origenVenta":"registro_manual","estadoPedido":"entregado","fechaEntrega":"2026-08-27","itemsConfirmacion":[{"id":"it_1787866295535","total":200,"nombre":"Macha - 250 ml","cantidad":1,"catalogoId":1787782756239,"precioUnitario":200}],"montoConfirmacion":200}],"cleo_clientes":[{"id":1790442013906,"email":"","etapa":"Ganado","fecha":"2026-09-26","items":[{"id":"it_1790441310786","total":100,"nombre":"Macha Spicy - 100 ml","cantidad":1,"catalogoId":1787782756258,"condiciones":"","descripcion":"","precioUnitario":100},{"id":"it_1790441551536_bh8q","total":100,"nombre":"Macha Dulce - 100 ml","cantidad":1,"catalogoId":1787782756263,"condiciones":"","descripcion":"","precioUnitario":100},{"id":"it_1790441569038_15u6","total":200,"nombre":"Crema de Habanero - 100 ml","cantidad":2,"catalogoId":1787782756303,"condiciones":"","descripcion":"","precioUnitario":100}],"notas":"","nombre":"Josh lucero","origen":"Instagram","negocio":"","contacto":"9997825258","instagram":"","messenger":"","fechaEtapa":"2026-09-26","fechaPedido":"2026-09-26T17:00:13.906Z","precioInteres":"350","recordatorios":[{"id":"r_1790442070110","nota":"Hola Josh, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-25","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-26","estadoProspecto":"Convertido","productoInteres":"Macha Spicy - 100 ml, Macha Dulce - 100 ml y Crema de Habanero - 100 ml","seguimientoFecha":"2026-12-25","tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Josh, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1790441309251,"email":"","etapa":"Ganado","fecha":"2026-09-26","notas":"","nombre":"Sofia campeche 1","origen":"bazar de galerias campeche","negocio":"","contacto":"9811685150","instagram":"","messenger":"","fechaEtapa":"2026-09-26","fechaPedido":"2026-09-26T16:48:29.251Z","recordatorios":[{"id":"r_1790637781285","nota":"Hola Sofia, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-27","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-26","estadoProspecto":"Convertido","seguimientoFecha":"2026-12-27","tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Sofia, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1790224958367,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","items":[],"notas":"","nombre":"Terra","origen":"expo de gourmet show","negocio":"","contacto":"9992237483","instagram":"","messenger":"","fechaEtapa":"2026-09-23","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"es un abastecedor de cafeterías","ultimoContacto":"2026-09-23","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1790223270431,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","items":[],"notas":"","nombre":"Ferretería Ferrevar","origen":"WhatsApp","negocio":"","contacto":"9993946381","instagram":"","messenger":"","fechaEtapa":"2026-09-23","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"","ultimoContacto":"2026-09-23","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1790215763477,"email":"","etapa":"Ganado","fecha":"2026-09-23","notas":"","nombre":"Lucely Cantillo","origen":"en el bazar de uptaown","negocio":"","contacto":"9991900201","instagram":"","messenger":"","fechaEtapa":"2026-09-23","fechaPedido":"2026-09-24T02:09:23.477Z","recordatorios":[{"id":"r_1790442214252","nota":"Hola Lucely, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-25","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","estadoProspecto":"Convertido","seguimientoFecha":"2026-12-25","tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Lucely, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1790198593401,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","items":[],"notas":"","nombre":"Martzna","origen":"Referido","negocio":"","contacto":"9991603707","instagram":"","messenger":"","fechaEtapa":"2026-09-23","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"es una tienda de frutas es solo un prospecto antes de 12:00","ultimoContacto":"2026-09-23","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1790198299301,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","items":[],"notas":"","nombre":"Elda Victor","origen":"Facebook","negocio":"","contacto":"9991324893","instagram":"","messenger":"","fechaEtapa":"2026-09-23","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"","ultimoContacto":"2026-09-23","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1790044368511,"email":"","etapa":"Ganado","fecha":"2026-09-21","notas":"","nombre":"Maryfer","origen":"","negocio":"","contacto":"","instagram":"","messenger":"","fechaEtapa":"2026-09-21","fechaPedido":"2026-09-22T02:32:48.511Z","recordatorios":[{"id":"r_1790044385316","nota":"Hola Maryfer, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-20","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-21","estadoProspecto":"Convertido","seguimientoFecha":"2026-12-20","tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Maryfer, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1790044262689,"email":"","etapa":"Ganado","fecha":"2026-09-21","items":[{"id":"it_1790043697624","total":300,"nombre":"Macha - 500 ml","cantidad":1,"catalogoId":1787782756240,"precioUnitario":300}],"notas":"","nombre":"Alejandra lopes","origen":"expo tuzunami","negocio":"","contacto":"9993392368","instagram":"","messenger":"","fechaEtapa":"2026-09-21","fechaPedido":"2026-09-22T02:31:10.764Z","precioInteres":"300","recordatorios":[{"id":"r_1790214359884","nota":"Hola Alejandra, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-22","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"","ultimoContacto":"2026-09-21","cantidadInteres":"1","estadoProspecto":"Convertido","productoInteres":"Macha - 500 ml","seguimientoFecha":"2026-12-22","tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Alejandra, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1790043500661,"email":"","etapa":"Ganado","fecha":"2026-09-21","items":[{"id":"it_1790042895409","total":300,"nombre":"Chimichurri - 500 ml","cantidad":1,"catalogoId":1787782756230,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790043469402_3us7","total":300,"nombre":"Crema de ajo - 500 ml","cantidad":1,"catalogoId":1787782756220,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790043488760_t0ry","total":300,"nombre":"Xcatic - 500 ml","cantidad":1,"catalogoId":1787782756250,"condiciones":"","descripcion":"","precioUnitario":300}],"notas":"","nombre":"Fernanda flores","origen":"bazar de mercado 60","negocio":"","contacto":"5521098308","instagram":"","messenger":"","fechaEtapa":"2026-09-26","fechaPedido":"2026-09-26T16:45:05.214Z","precioInteres":"750","recordatorios":[{"id":"r_1790703816023","nota":"Hola Fernanda, ¿cómo has estado? Si en algún momento necesitas algo o surge algo nuevo, aquí estoy.","fecha":"2026-10-29","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"","ultimoContacto":"2026-09-21","cantidadInteres":"3","estadoProspecto":"Convertido","productoInteres":"Chimichurri - 500 ml, Crema de ajo - 500 ml y Xcatic - 500 ml","seguimientoFecha":"2026-10-29","tipoSeguimientoPostVenta":"30","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Fernanda, ¿cómo has estado? Si en algún momento necesitas algo o surge algo nuevo, aquí estoy."},{"id":1790042895390,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-21","items":[],"notas":"","nombre":"Beatriz","origen":"Facebook","negocio":"","contacto":"9997433616","instagram":"","messenger":"","fechaEtapa":"2026-09-21","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"","ultimoContacto":"2026-09-21","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1790042705325,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-21","items":[],"notas":"","nombre":"Mercedes Soto","origen":"Facebook","negocio":"","contacto":"9997386004","instagram":"","messenger":"","fechaEtapa":"2026-09-21","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"","ultimoContacto":"2026-09-21","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1790042661510,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-21","items":[],"notas":"","nombre":"Ingmar","origen":"Facebook","negocio":"","contacto":"4421577144","instagram":"","messenger":"","fechaEtapa":"2026-09-21","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"","ultimoContacto":"2026-09-21","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1790042602004,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-21","items":[],"notas":"","nombre":"Laura Gonsales","origen":"Facebook","negocio":"","contacto":"9991400918","instagram":"","messenger":"","fechaEtapa":"2026-09-21","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"","ultimoContacto":"2026-09-21","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1790042522150,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-21","items":[],"notas":"","nombre":"Mario Arsego","origen":"Facebook","negocio":"","contacto":"9851017824","instagram":"","messenger":"","fechaEtapa":"2026-09-21","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"","ultimoContacto":"2026-09-21","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1790042429864,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-21","items":[],"notas":"","nombre":"Azul pevez","origen":"Facebook","negocio":"","contacto":"9993517852","instagram":"","messenger":"","fechaEtapa":"2026-09-21","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"bazar de up tawoun","ultimoContacto":"2026-09-21","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1790041521246,"email":"","etapa":"Ganado","fecha":"2026-09-21","notas":"","nombre":"Iliana Cen","origen":"en la expo tuzunami","negocio":"","contacto":"9992309270","instagram":"","messenger":"","fechaEtapa":"2026-09-21","fechaPedido":"2026-09-22T01:45:21.246Z","recordatorios":[{"id":"r_1790703697084","nota":"Hola Iliana, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-28","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-21","estadoProspecto":"Convertido","seguimientoFecha":"2026-12-28","tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Iliana, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1790041168562,"email":"","etapa":"Ganado","fecha":"2026-09-21","notas":"","nombre":"Mario Jose Valencia","origen":"en la expo de tuzunami","negocio":"","contacto":"9831867657","instagram":"","messenger":"","fechaEtapa":"2026-09-21","fechaPedido":"2026-09-22T01:39:28.562Z","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-21","estadoProspecto":"Convertido"},{"id":1790040396509,"email":"","etapa":"Ganado","fecha":"2026-09-21","notas":"","nombre":"Ricardo Jimeno","origen":"expo de tuzunami","negocio":"","contacto":"9992333293","instagram":"","messenger":"","fechaEtapa":"2026-09-21","fechaPedido":"2026-09-22T01:26:36.509Z","recordatorios":[{"id":"r_1790135270416","nota":"Hola Ricardo, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-21","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-21","estadoProspecto":"Convertido","seguimientoFecha":"2026-12-21","tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Ricardo, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1790040204659,"email":"","etapa":"Ganado","fecha":"2026-09-21","notas":"","nombre":": Nidia Valenzuela","origen":"Expo de tuzunami","negocio":"","contacto":"9993698808","instagram":"","messenger":"","fechaEtapa":"2026-09-21","fechaPedido":"2026-09-22T01:23:24.659Z","recordatorios":[{"id":"r_1790703728328","nota":"Hola :, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-28","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-21","estadoProspecto":"Convertido","seguimientoFecha":"2026-12-28","tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola :, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1789012339093,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-09","items":[],"notas":"","nombre":"sergio","origen":"en la expo del gourmet show 2026","negocio":"","contacto":"5629852031","instagram":"","messenger":"","fechaEtapa":"2026-09-09","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"dadydady2047@gmail.com","ultimoContacto":"2026-09-09","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1789012139264,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-09","items":[],"notas":"","nombre":"Juan Antonio Casillas","origen":"en la expo de gourmet show 2026","negocio":"","contacto":"3787313003","instagram":"","messenger":"","fechaEtapa":"2026-09-09","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"casillasjuanantonio06@gmail.com","ultimoContacto":"2026-09-09","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1789011513291,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-09","items":[],"notas":"","nombre":"Denis Luna Arriola","origen":"en la expo gourmet show 2026","negocio":"","contacto":"5510179585","instagram":"","messenger":"","fechaEtapa":"2026-09-09","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"La Casita de Papabin ","ultimoContacto":"2026-09-09","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1789011110151,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-09","items":[],"notas":"","nombre":"Sergio Hernandes","origen":"en la expo del gourmet show 2026","negocio":"","contacto":"5543208025","instagram":"","messenger":"","fechaEtapa":"2026-09-09","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"Empresa es salamanca","ultimoContacto":"2026-09-09","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1789010843373,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-09","items":[],"notas":"","nombre":"Javie Diaz","origen":"en la expo del gourmet show 2026","negocio":"","contacto":"5588362854","instagram":"","messenger":"","fechaEtapa":"2026-09-09","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"la empresa es la tienda Los Abuelos","ultimoContacto":"2026-09-09","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1789010682492,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-09","items":[],"notas":"","nombre":"Alexis Ian Ortis Vera","origen":"en la expo del gourmet show 2026","negocio":"","contacto":"5538908393","instagram":"","messenger":"","fechaEtapa":"2026-09-09","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"ianortis@hotmail.com","ultimoContacto":"2026-09-09","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1789010013507,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-09","items":[],"notas":"","nombre":"Juan Nader","origen":"en la expo gourmet show 2026","negocio":"","contacto":"5554185657","instagram":"","messenger":"","fechaEtapa":"2026-09-09","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"tiene una tienda en línea {cuidado es un poco agresivo}\nHola@wytlife.mx","ultimoContacto":"2026-09-09","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1789009607263,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-09","items":[],"notas":"","nombre":"Nadia Hernandes","origen":"en la expo gourmet show 2026","negocio":"","contacto":"5515719594","instagram":"","messenger":"","fechaEtapa":"2026-09-09","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"","ultimoContacto":"2026-09-09","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1788982781815,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-09","items":[],"notas":"","nombre":"Miguel Baeza","origen":"en la expo del gourmet show 2026","negocio":"","contacto":"7151348774","instagram":"","messenger":"","fechaEtapa":"2026-09-09","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"es una empresa de yelatos ","ultimoContacto":"2026-09-09","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1788979280054,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-09","items":[],"notas":"","nombre":"Aida montiel","origen":"en la expo gourmet show 2026","negocio":"","contacto":"5540546508","instagram":"","messenger":"","fechaEtapa":"2026-09-09","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"es un distribuidor ","ultimoContacto":"2026-09-09","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1788979120417,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-09","items":[],"notas":"","nombre":"Emauel Carrillo","origen":"en el bazar del gourmet show 2026","negocio":"","contacto":"7772363571","instagram":"","messenger":"","fechaEtapa":"2026-09-09","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"La empresa es restaurante antigros","ultimoContacto":"2026-09-09","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1788978379246,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-09","items":[],"notas":"","nombre":"Denisse Bastida","origen":"en el gourmet show 2026","negocio":"","contacto":"5527292597","instagram":"","messenger":"","fechaEtapa":"2026-09-09","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"El negocio Nova chocolatería {Toluca}  \nsus papas dejaron los datos\n","ultimoContacto":"2026-09-09","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1788977797191,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-09","items":[],"notas":"","nombre":"Iveth Herrera","origen":"en la expo del gourmet show 2026","negocio":"","contacto":"5562385185","instagram":"","messenger":"","fechaEtapa":"2026-09-09","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"info@Casafinisterra.com","ultimoContacto":"2026-09-09","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1788914617398,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-08","items":[],"notas":"","nombre":"Jonatan Raymundo","origen":"En la expo del gourmet show","negocio":"","contacto":"7551327827","instagram":"","messenger":"","fechaEtapa":"2026-09-08","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"es de Zihuatanejo guerrero","ultimoContacto":"2026-09-08","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1788914006001,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-08","items":[],"notas":"","nombre":"Edih Área Comercial","origen":"En la expo gourmet show","negocio":"","contacto":"7711003176","instagram":"","messenger":"","fechaEtapa":"2026-09-08","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"México se bebe - Tlatoani","ultimoContacto":"2026-09-08","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1788913692377,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-08","items":[],"notas":"","nombre":"Guadalupe Zambrano","origen":"Expo gurmet show  2026","negocio":"","contacto":"5543628095","instagram":"","messenger":"","fechaEtapa":"2026-09-08","precioInteres":"","canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"Comercializadora Mediajet","ultimoContacto":"2026-09-08","cantidadInteres":"0","estadoProspecto":"Nueva","productoInteres":""},{"id":1788496232594,"email":"","etapa":"Ganado","fecha":"2026-09-03","notas":"","nombre":"Leti Guerrero","origen":"es familia","negocio":"","contacto":"5537315160","instagram":"","messenger":"","fechaEtapa":"2026-09-03","fechaPedido":"2026-09-04T04:30:32.594Z","recordatorios":[{"id":"r_1788982848657","nota":"Hola Leti, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-08","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-03","estadoProspecto":"Convertido","seguimientoFecha":"2026-12-08","tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Leti, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1788496123820,"email":"","etapa":"Ganado","fecha":"2026-09-03","notas":"","nombre":"Maye Zavala","origen":"es familia","negocio":"","contacto":"5521096029","instagram":"","messenger":"","fechaEtapa":"2026-09-03","fechaPedido":"2026-09-04T04:28:43.820Z","recordatorios":[{"id":"r_1788982907192","nota":"Hola Maye, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-08","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-03","estadoProspecto":"Convertido","seguimientoFecha":"2026-12-08","tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Maye, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1788495819736,"email":"","etapa":"Ganado","fecha":"2026-09-03","notas":"","nombre":"Job García","origen":"es familia","negocio":"","contacto":"5576948852","instagram":"","messenger":"","fechaEtapa":"2026-09-03","fechaPedido":"2026-09-04T04:23:39.736Z","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-03","estadoProspecto":"Convertido"},{"id":1788495491978,"email":"","etapa":"Ganado","fecha":"2026-09-03","notas":"","nombre":"Berenice Placencia","origen":"bazar de galerías merida","negocio":"","contacto":"4772564428","instagram":"","messenger":"","fechaEtapa":"2026-09-03","fechaPedido":"2026-09-04T04:18:11.978Z","recordatorios":[{"id":"r_1788495534285","nota":"Hola Berenice, ¿cómo has estado? Si en algún momento necesitas algo o surge algo nuevo, aquí estoy.","fecha":"2026-10-03","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-03","estadoProspecto":"Convertido","seguimientoFecha":"2026-10-03","tipoSeguimientoPostVenta":"30","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Berenice, ¿cómo has estado? Si en algún momento necesitas algo o surge algo nuevo, aquí estoy."},{"id":1788495359428,"email":"","etapa":"Ganado","fecha":"2026-09-03","notas":"","nombre":"Elmer","origen":"bazar uptaown","negocio":"","contacto":"9999028546","instagram":"","messenger":"","fechaEtapa":"2026-09-03","fechaPedido":"2026-09-04T04:15:59.428Z","recordatorios":[{"id":"r_1790214089313","nota":"Hola Elmer, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-22","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-03","estadoProspecto":"Convertido","seguimientoFecha":"2026-12-22","tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Elmer, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1788494622736,"email":"","etapa":"Ganado","fecha":"2026-09-03","items":[{"id":"it_1788494458537","total":420,"nombre":"Chimichurri - 100 ml","cantidad":6,"catalogoId":1787782756228,"precioUnitario":70},{"id":"it_1788494529033_9han","total":420,"nombre":"Macha Spicy - 100 ml","cantidad":6,"catalogoId":1787782756258,"precioUnitario":70},{"id":"it_1788494558102_n6tx","total":420,"nombre":"Crema de Habanero - 100 ml","cantidad":6,"catalogoId":1787782756303,"precioUnitario":70},{"id":"it_1788494578032_yb98","total":420,"nombre":"Habanero fuego - 100 ml","cantidad":6,"catalogoId":1787782756298,"precioUnitario":70}],"notas":"","nombre":"Lorena Carmona","origen":"","negocio":"","contacto":"","instagram":"","messenger":"","fechaEtapa":"2026-09-03","fechaPedido":"2026-09-04T04:10:10.079Z","precioInteres":"1680","recordatorios":[{"id":"r_1790214049064","nota":"Hola Lorena, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-22","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"se le hizo un descuento de 30 porciento","ultimoContacto":"2026-09-03","cantidadInteres":"24","estadoProspecto":"Convertido","productoInteres":"Chimichurri - 100 ml, Macha Spicy - 100 ml, Crema de Habanero - 100 ml y 1 producto más","seguimientoFecha":"2026-12-22","historialContactos":[{"id":"hist_1788494622736_pkvjv6","tipo":"precio_enviado","fecha":"2026-09-03","items":[{"id":"it_1788494458537","total":600,"nombre":"Chimichurri - 100 ml","cantidad":6,"catalogoId":1787782756228,"precioUnitario":100},{"id":"it_1788494529033_9han","total":600,"nombre":"Macha Spicy - 100 ml","cantidad":6,"catalogoId":1787782756258,"precioUnitario":100},{"id":"it_1788494558102_n6tx","total":600,"nombre":"Crema de Habanero - 100 ml","cantidad":6,"catalogoId":1787782756303,"precioUnitario":100},{"id":"it_1788494578032_yb98","total":600,"nombre":"Habanero fuego - 100 ml","cantidad":6,"catalogoId":1787782756298,"precioUnitario":100}],"monto":2400,"fechaHora":"2026-09-04T04:03:42.736Z","resultado":"Precio enviado"}],"tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Lorena, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1788286352749,"email":"","etapa":"Ganado","fecha":"2026-09-01","notas":"","nombre":"Norma Moreno","origen":"es familia","negocio":"","contacto":"5540464351","instagram":"","messenger":"","fechaEtapa":"2026-09-09","fechaPedido":"2026-09-09T19:52:46.455Z","recordatorios":[{"id":"r_1788983431925","nota":"Hola Norma, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-08","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-09","estadoProspecto":"Convertido","seguimientoFecha":"2026-12-08","tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Norma, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1788286259482,"email":"","etapa":"Ganado","fecha":"2026-09-01","notas":"","nombre":"Alexis García","origen":"es familia","negocio":"","contacto":"5521173460","instagram":"","messenger":"","fechaEtapa":"2026-09-01","fechaPedido":"2026-09-01T18:10:59.482Z","recordatorios":[{"id":"r_1788983071138","nota":"Hola Alexis, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-08","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-01","estadoProspecto":"Convertido","seguimientoFecha":"2026-12-08","tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Alexis, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1788286091402,"email":"","etapa":"Ganado","fecha":"2026-09-01","items":[{"id":"it_1790044710461","total":300,"nombre":"Crema de ajo - 500 ml","cantidad":1,"catalogoId":1787782756220,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790044747520_gbwb","total":300,"nombre":"Chipotle - 500 ml","cantidad":1,"catalogoId":1787782756245,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790044820869_1sbh","total":300,"nombre":"Macha Spicy - 500 ml","cantidad":1,"catalogoId":1787782756260,"condiciones":"","descripcion":"","precioUnitario":300},{"id":"it_1790044965054_hpgs","total":60,"nombre":"servicio a domicilio","cantidad":1,"catalogoId":1790044661525,"condiciones":"solo en horario de 7 a 10 pm","descripcion":"","precioUnitario":60}],"notas":"","nombre":"braulio benegas","origen":"recomendación familiar","negocio":"","contacto":"5544779964","instagram":"","messenger":"","fechaEtapa":"2026-09-30","origenOtro":"recomendación familiar","fechaPedido":"2026-09-30T20:54:06.040Z","precioInteres":"860","recordatorios":[{"id":"r_1788983218204","nota":"Hola braulio, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-08","origen":"cleo","categoria":"postventa","esPersonalizada":false},{"id":"r_1790045056811","nota":"Hola braulio, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-20","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","notasProspecto":"","ultimoContacto":"2026-09-01","cantidadInteres":"3","estadoProspecto":"Convertido","productoInteres":"Crema de ajo - 500 ml, Chipotle - 500 ml, Macha Spicy - 500 ml y 1 producto más","seguimientoFecha":"2026-12-08","tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola braulio, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1788285527097,"email":"","etapa":"Ganado","fecha":"2026-09-01","notas":"","nombre":"heidi 1","origen":"","negocio":"","contacto":"9996037296","instagram":"","messenger":"","fechaEtapa":"2026-09-01","origenOtro":"","fechaPedido":"2026-09-01T17:58:47.114Z","recordatorios":[{"id":"r_1788983329565","nota":"Hola heidi, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-08","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-01","estadoProspecto":"Convertido","seguimientoFecha":"2026-12-08","tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola heidi, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1788200849813,"email":"","etapa":"Ganado","fecha":"2026-08-31","notas":"","nombre":"Sandra Luna","origen":"","negocio":"","contacto":"5534152034","instagram":"","messenger":"","fechaEtapa":"2026-08-31","fechaPedido":"2026-08-31T18:27:30.215Z","recordatorios":[{"id":"r_1788983291617","nota":"Hola Sandra, han pasado unos meses. Solo quería saludar y saber cómo estás.","fecha":"2026-12-08","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-08-31","estadoProspecto":"Convertido","seguimientoFecha":"2026-12-08","tipoSeguimientoPostVenta":"90","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Sandra, han pasado unos meses. Solo quería saludar y saber cómo estás."},{"id":1788125623727,"email":"","etapa":"Ganado","fecha":"2026-08-30","notas":"Disfrutar una buena comida con nuestras salsas ","nombre":"Sofia","origen":"Referido","negocio":"","contacto":"9991358466","instagram":"","messenger":"","fechaEtapa":"2026-08-30","origenOtro":"","fechaPedido":"2026-08-30T21:33:43.759Z","recordatorios":[{"id":"r_1788137530969","nota":"Hola Sofia, ¿cómo has estado? Si en algún momento necesitas algo o surge algo nuevo, aquí estoy.","fecha":"2026-09-29","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-08-30","estadoProspecto":"Convertido","seguimientoFecha":"2026-09-29","tipoSeguimientoPostVenta":"30","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Sofia, ¿cómo has estado? Si en algún momento necesitas algo o surge algo nuevo, aquí estoy."},{"id":1788042728223,"email":"","etapa":"Ganado","fecha":"2026-08-27","notas":"","nombre":"Pam Morales","origen":"","negocio":"","contacto":"9997001339","instagram":"","messenger":"","fechaEtapa":"2026-08-27","fechaPedido":"2026-08-29T22:32:08.271Z","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-08-27","estadoProspecto":"Convertido"},{"id":1787949091573,"email":"","etapa":"Ganado","fecha":"2026-08-27","notas":"","nombre":"Talia Lara","origen":"","negocio":"","contacto":"9999009055","instagram":"","messenger":"","fechaEtapa":"2026-08-27","fechaPedido":"2026-08-28T20:31:31.592Z","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-08-27","estadoProspecto":"Convertido"},{"id":1787873442305,"email":"","etapa":"Ganado","fecha":"2026-08-27","notas":"","nombre":"Jorge Lopez","origen":"","negocio":"","contacto":"","instagram":"@di.c3","messenger":"","fechaEtapa":"2026-08-27","fechaPedido":"2026-08-27T23:30:42.373Z","recordatorios":[{"id":"r_1787876555480","nota":"Hola Jorge, ¿cómo has estado? Si en algún momento necesitas algo o surge algo nuevo, aquí estoy.","fecha":"2026-09-26","origen":"cleo","categoria":"postventa","esPersonalizada":false}],"canalPrincipal":"Instagram","notaRecontacto":"","ultimoContacto":"2026-08-27","estadoProspecto":"Convertido","seguimientoFecha":"2026-09-26","tipoSeguimientoPostVenta":"30","seguimientoEsPersonalizada":false,"mensajeSeguimientoPostVenta":"Hola Jorge, ¿cómo has estado? Si en algún momento necesitas algo o surge algo nuevo, aquí estoy."},{"id":1787869188968,"email":"","etapa":"Ganado","fecha":"2026-08-27","notas":"","nombre":"Adriana Duran","origen":"","negocio":"","contacto":"9999696994","instagram":"","messenger":"","fechaEtapa":"2026-08-27","fechaPedido":"2026-08-27T22:19:48.986Z","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-08-27","estadoProspecto":"Convertido"},{"id":1790199328456,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"calidad de los productos","nombre":"Ruven Dario Cruz","origen":"bazar de galerias","negocio":"","contacto":"8992982068","instagram":"","messenger":"","origenOtro":"bazar de galerias","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790199593076,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"calidad y atención al cliente","nombre":"Daniela Beristain","origen":"es un cliente de bazar de galerias","negocio":"","contacto":"2711236661","instagram":"","messenger":"","origenOtro":"es un cliente de bazar de galerias","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790200134237,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"atención al cliente y salsas artesanales  ","nombre":"Pricila Valdes","origen":"Instagram","negocio":"","contacto":"9993359782","instagram":"","messenger":"","origenOtro":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790200294339,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Cintia Vargas ","origen":"Instagram","negocio":"","contacto":"9993903167","instagram":"","messenger":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790200452591,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Rosana Barbosa","origen":"Instagram","negocio":"","contacto":"9991335867","instagram":"","messenger":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790200573468,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Mariana Avila","origen":"Referido","negocio":"","contacto":"9999698990","instagram":"","messenger":"","origenOtro":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790200718978,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Susana Chaves","origen":"Instagram","negocio":"","contacto":"2226668674","instagram":"","messenger":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790200799604,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Elías Ortego ","origen":"WhatsApp","negocio":"","contacto":"9991592286","instagram":"","messenger":"","origenOtro":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790200986621,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Flori","origen":"Facebook","negocio":"","contacto":"9991630266","instagram":"","messenger":"","origenOtro":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790201349471,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Sharon Alexan","origen":"Instagram","negocio":"","contacto":"9991933560","instagram":"","messenger":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790201524926,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Nelly Torres","origen":"Instagram","negocio":"","contacto":"9992979823","instagram":"","messenger":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790201793738,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Estela Ramires","origen":"Instagram","negocio":"","contacto":"5585805094","instagram":"","messenger":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790202137094,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"un salsas artesanal","nombre":"Andrea Pacheco ","origen":"En el bazar de uptaown","negocio":"","contacto":"9999913487","instagram":"","messenger":"","origenOtro":"En el bazar de uptaown ","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790202253458,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Mary xalle","origen":"Instagram","negocio":"","contacto":"9993092491","instagram":"","messenger":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790207206101,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Jorge Ortiz","origen":"Instagram","negocio":"","contacto":"9992926352","instagram":"","messenger":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790207384437,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Karla Martines","origen":"Instagram","negocio":"","contacto":"5591971298","instagram":"","messenger":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790208816382,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"es el chef ejecutivo","nombre":"Jorge Lara","origen":"Instagram","negocio":"panaderia de suti","contacto":"9992760276","instagram":"","messenger":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790213620693,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Lizzy Monroy","origen":"WhatsApp","negocio":"La Casa de la Miel","contacto":"9995084865","instagram":"","messenger":"","origenOtro":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790213741063,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Vere Rodriges ","origen":"Instagram","negocio":"MC llantas ","contacto":"9992563710","instagram":"","messenger":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790222489104,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Fernado hoyo","origen":"Instagram","negocio":"UVER investnusa.io","contacto":"3465254279","instagram":"","messenger":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790222607567,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"David Perez","origen":"Facebook","negocio":"MEXICO EXPERIENCES","contacto":"5550860063","instagram":"","messenger":"","origenOtro":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790222912364,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Daniela Mendiola ","origen":"Instagram","negocio":"mezcal lengua suelta","contacto":"5528208506","instagram":"","messenger":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790223054354,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"","nombre":"Samuel  Heidra Reyes","origen":"Referido","negocio":"Merida Artecanal","contacto":"9991329807","instagram":"","messenger":"","origenOtro":"","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""},{"id":1790223452090,"email":"","etapa":"Nuevo contacto","fecha":"2026-09-23","notas":"hace caterings quesos y charcutería","nombre":"Marisol Rojas Avila","origen":"expo gurmet show","negocio":"María Mantequilla","contacto":"9995086844","instagram":"","messenger":"","origenOtro":"expo gurmet show","motivoPerdida":"","canalPrincipal":"WhatsApp","notaRecontacto":"","ultimoContacto":"2026-09-23","seguimientoFecha":""}],"cleo_servicios":[],"cleo_tipo_perfil":"productos","cleo_productos_cat":[{"id":1787782756218,"nombre":"Crema de ajo - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756219,"nombre":"Crema de ajo - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756220,"nombre":"Crema de ajo - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756221,"nombre":"Crema de ajo - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756222,"nombre":"Crema de ajo - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756223,"nombre":"Pasta de ajo - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756224,"nombre":"Pasta de ajo - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756225,"nombre":"Pasta de ajo - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756226,"nombre":"Pasta de ajo - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756227,"nombre":"Pasta de ajo - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756228,"nombre":"Chimichurri - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756229,"nombre":"Chimichurri - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756230,"nombre":"Chimichurri - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756231,"nombre":"Chimichurri - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756232,"nombre":"Chimichurri - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756233,"nombre":"Pesto - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756234,"nombre":"Pesto - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756235,"nombre":"Pesto - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756236,"nombre":"Pesto - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756237,"nombre":"Pesto - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756238,"nombre":"Macha - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756239,"nombre":"Macha - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756240,"nombre":"Macha - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756241,"nombre":"Macha - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756242,"nombre":"Macha - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756243,"nombre":"Chipotle - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756244,"nombre":"Chipotle - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756245,"nombre":"Chipotle - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756246,"nombre":"Chipotle - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756247,"nombre":"Chipotle - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756248,"nombre":"Xcatic - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756249,"nombre":"Xcatic - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756250,"nombre":"Xcatic - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756251,"nombre":"Xcatic - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756252,"nombre":"Xcatic - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756253,"nombre":"Rajas Borrachas - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756254,"nombre":"Rajas Borrachas - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756255,"nombre":"Rajas Borrachas - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756256,"nombre":"Rajas Borrachas - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756257,"nombre":"Rajas Borrachas - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756258,"nombre":"Macha Spicy - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756259,"nombre":"Macha Spicy - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756260,"nombre":"Macha Spicy - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756261,"nombre":"Macha Spicy - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756262,"nombre":"Macha Spicy - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756263,"nombre":"Macha Dulce - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756264,"nombre":"Macha Dulce - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756265,"nombre":"Macha Dulce - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756266,"nombre":"Macha Dulce - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756267,"nombre":"Macha Dulce - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756268,"nombre":"Macha Chapulines - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756269,"nombre":"Macha Chapulines - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756270,"nombre":"Macha Chapulines - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756271,"nombre":"Macha Chapulines - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756272,"nombre":"Macha Chapulines - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756273,"nombre":"Rajas con Piña - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756274,"nombre":"Rajas con Piña - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756275,"nombre":"Rajas con Piña - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756276,"nombre":"Rajas con Piña - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756277,"nombre":"Rajas con Piña - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756278,"nombre":"Crema de chiles rojos - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756279,"nombre":"Crema de chiles rojos - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756280,"nombre":"Crema de chiles rojos - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756281,"nombre":"Crema de chiles rojos - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756282,"nombre":"Crema de chiles rojos - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756283,"nombre":"Guacamole - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756284,"nombre":"Guacamole - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756285,"nombre":"Guacamole - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756286,"nombre":"Guacamole - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756287,"nombre":"Guacamole - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756288,"nombre":"Chicharrones Mix - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756289,"nombre":"Chicharrones Mix - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756290,"nombre":"Chicharrones Mix - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756291,"nombre":"Chicharrones Mix - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756292,"nombre":"Chicharrones Mix - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756293,"nombre":"Habanero tatemado - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756294,"nombre":"Habanero tatemado - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756295,"nombre":"Habanero tatemado - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756296,"nombre":"Habanero tatemado - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756297,"nombre":"Habanero tatemado - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756298,"nombre":"Habanero fuego - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756299,"nombre":"Habanero fuego - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756300,"nombre":"Habanero fuego - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756301,"nombre":"Habanero fuego - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756302,"nombre":"Habanero fuego - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756303,"nombre":"Crema de Habanero - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756304,"nombre":"Crema de Habanero - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756305,"nombre":"Crema de Habanero - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756306,"nombre":"Crema de Habanero - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756307,"nombre":"Crema de Habanero - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787782756308,"nombre":"Habanero en polvo - 100 ml","precio":100,"condiciones":"","descripcion":""},{"id":1787782756309,"nombre":"Habanero en polvo - 250 ml","precio":200,"condiciones":"","descripcion":""},{"id":1787782756310,"nombre":"Habanero en polvo - 500 ml","precio":300,"condiciones":"","descripcion":""},{"id":1787782756311,"nombre":"Habanero en polvo - 1000 ml","precio":450,"condiciones":"","descripcion":""},{"id":1787782756312,"nombre":"Habanero en polvo - Paquete degustación","precio":350,"condiciones":"","descripcion":""},{"id":1787873192129,"nombre":"slasas diferentes sabores a elegir","precio":350,"condiciones":"","descripcion":""},{"id":1790044661525,"nombre":"servicio a domicilio","precio":60,"condiciones":"solo en horario de 7 a 10 pm","descripcion":""}],"cleo_streak_accion_prod":{"dias":3,"tipo":"saldo_cobrar","fecha":"2026-09-30"}}$blob$;
begin
  select id into v_user_id from auth.users where email = 'victoria@cleo.test' limit 1;

  insert into public.user_data (user_id, data)
  values (v_user_id, v_blob)
  on conflict (user_id) do update set data = excluded.data;

  raise notice 'Blob insertado/actualizado para user_id: %', v_user_id;
end;
$$;

-- ── Paso 2: Extracción relacional ─────────────────────────────────────────────
-- Idempotente: ON CONFLICT DO NOTHING en todos los objetos con cleo_id.

with
  target_user as (
    select u.id as user_id, ud.data as blob
    from auth.users u
    join public.user_data ud on ud.user_id = u.id
    where u.email = 'victoria@cleo.test'
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
      jsonb_strip_nulls(jsonb_build_object(
        'onboardingListo',      tu.blob->'cleo_perfil'->'onboardingListo',
        'alertas_cerradas',     tu.blob->'cleo_alertas_cerradas',
        'etapas_vistas',        tu.blob->'cleo_etapas_vistas',
        'streak_prod',          tu.blob->'cleo_streak_accion_prod',
        'streak_serv',          tu.blob->'cleo_streak_accion_serv'
      )),
      'blob'
    from target_user tu
    on conflict (user_id) do nothing
    returning id, user_id
  ),

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
      c->>'origenOtro',
      c->>'etapa',
      nullif(c->>'fechaEtapa', '')::date,
      c->>'estadoProspecto',
      c->>'motivoPerdida',
      case when c->'razonCierre' is not null
           then array(select jsonb_array_elements_text(c->'razonCierre'))
           else null end,
      nullif(c->>'ultimoContacto', '')::date,
      c->>'notas',
      c->>'notasProspecto',
      c->>'etiqueta',
      c->>'notaRecontacto',
      nullif(c->>'fechaPedido', '')::date,
      c->>'servicioInteres',
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
      'op_' || cm.cleo_id,
      cm.cliente_id,
      'productos',
      coalesce(
        (select c2->>'productoInteres'
         from jsonb_array_elements(
           coalesce((select blob->'cleo_clientes' from target_user), '[]'::jsonb)
         ) as c2
         where c2->>'id' = cm.cleo_id
         limit 1),
        'Conversión de cliente'
      ),
      case cm.estado_prospecto
        when 'Convertido'       then 'ganada'
        when 'Perdido'          then 'perdida'
        else 'activa'
      end,
      case cm.estado_prospecto
        when 'Convertido'       then 'convertido'
        when 'Perdido'          then 'perdido'
        when 'En seguimiento'   then 'en_seguimiento'
        when 'Sin respuesta'    then 'sin_respuesta'
        else 'nueva'
      end,
      (select nullif(coalesce(c2->>'tipoSeguimientoPostVenta', c2->>'tipo_seguimiento_postventa'), '')
       from jsonb_array_elements(
         coalesce((select blob->'cleo_clientes' from target_user), '[]'::jsonb)
       ) as c2
       where c2->>'id' = cm.cleo_id
       limit 1),
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
    where cm.estado_prospecto is not null
    on conflict (negocio_id, cleo_id) do nothing
    returning id, negocio_id, cleo_id, cliente_id
  ),

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
      case
        when (c->>'vinculadaOportunidadActual')::boolean is not false
          then om.op_id
        else null
      end,
      coalesce(c->'items', '[]'::jsonb),
      coalesce(nullif(c->>'subtotal', '')::numeric, 0),
      coalesce(
        nullif(c->>'total', '')::numeric,
        nullif(c->>'monto', '')::numeric,
        0
      ),
      nullif(c->>'cantidad', '')::int,
      coalesce(nullif(c->>'descuento', '')::numeric, 0),
      nullif(c->>'tipoDescuento', ''),
      coalesce(nullif(c->>'anticipo', '')::numeric, 0),
      nullif(c->>'fechaAnticipo', '')::date,
      c->>'vigencia',
      nullif(c->>'vigenciaDias', '')::int,
      c->>'tipoPago',
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
         left join clientes_map cm
           on cm.cleo_id = (c->>'clienteId') and cm.negocio_id = nr.negocio_id
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
      om.op_id,
      coalesce(p->'items', '[]'::jsonb),
      p->>'productos',
      coalesce(nullif(p->>'cantidad', '')::int, 0),
      coalesce(nullif(p->>'total', '')::numeric, 0),
      p->>'notas',
      p->>'etiqueta',
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
      nullif(p->>'fechaHoraEntrega', '')::timestamptz,
      nullif(p->>'fechaCancelacion', '')::date,
      nullif(p->>'fechaHoraCancelacion', '')::timestamptz,
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
      null,
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
      null,
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
      r->>'nota',
      nullif(r->>'fecha', '')::date,
      coalesce(nullif(r->>'completado', '')::boolean, false),
      case when nullif(r->>'completado', '')::boolean then 'atendido' else 'pendiente' end,
      nullif(r->>'fechaAtendido', '')::date,
      coalesce(nullif(r->>'esPersonalizada', '')::boolean, false),
      r->>'origen',
      null,
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
      'legacy_sf_' || (c->>'id'),
      cm.cliente_id,
      'sin_clasificar',
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
/*
select
  tabla, count
from (
  select 'negocios'            as tabla, count(*) from public.negocios n
    join auth.users u on u.id = n.user_id where u.email = 'victoria@cleo.test'
  union all
  select 'clientes',       count(*) from public.clientes
    where negocio_id = (select n.id from public.negocios n join auth.users u on u.id=n.user_id where u.email='victoria@cleo.test')
  union all
  select 'oportunidades',  count(*) from public.oportunidades
    where negocio_id = (select n.id from public.negocios n join auth.users u on u.id=n.user_id where u.email='victoria@cleo.test')
  union all
  select 'cotizaciones',   count(*) from public.cotizaciones
    where negocio_id = (select n.id from public.negocios n join auth.users u on u.id=n.user_id where u.email='victoria@cleo.test')
  union all
  select 'pedidos',        count(*) from public.pedidos
    where negocio_id = (select n.id from public.negocios n join auth.users u on u.id=n.user_id where u.email='victoria@cleo.test')
  union all
  select 'catalogo_items', count(*) from public.catalogo_items
    where negocio_id = (select n.id from public.negocios n join auth.users u on u.id=n.user_id where u.email='victoria@cleo.test')
  union all
  select 'pagos',          count(*) from public.pagos
    where negocio_id = (select n.id from public.negocios n join auth.users u on u.id=n.user_id where u.email='victoria@cleo.test')
  union all
  select 'recordatorios',  count(*) from public.recordatorios
    where negocio_id = (select n.id from public.negocios n join auth.users u on u.id=n.user_id where u.email='victoria@cleo.test')
  union all
  select 'historial',      count(*) from public.historial_contactos
    where negocio_id = (select n.id from public.negocios n join auth.users u on u.id=n.user_id where u.email='victoria@cleo.test')
) t;
*/
