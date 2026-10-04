-- ══════════════════════════════════════════════════════════════════════════════
-- 30-copia-crismile.sql
-- CLEO Pruebas (pconfadsbtwjbjeblxgl) — SOLO CLEO Pruebas, nunca producción
--
-- Carga el blob de Crismile (fotografía, servicios) en las tablas relacionales.
-- Mantiene schema_ver='blob' — ejecutar 31-activar-dual-crismile.sql después.
-- Idempotente: repetir no duplica filas.
--
-- PRERREQUISITO: crismile@cleo.test existe en Auth de CLEO Pruebas.
-- ══════════════════════════════════════════════════════════════════════════════

do $main$
declare
  v_test_email  constant text := 'crismile@cleo.test';

  v_user_id     uuid;
  v_neg_id      uuid;
  v_blob        jsonb;
  v_perfil      jsonb;
  v_tipo_perfil text;

  v_cli         jsonb;
  v_cot         jsonb;
  v_venta       jsonb;
  v_rec         jsonb;
  v_pago        jsonb;

  v_cliente_uuid uuid;
  v_op_uuid      uuid;
  v_cot_uuid     uuid;
  v_ven_uuid     uuid;

  v_n           int := 0;
  v_tot_cli     int := 0;
  v_tot_op      int := 0;
  v_tot_cat     int := 0;
  v_tot_cot     int := 0;
  v_tot_pag     int := 0;
  v_tot_ven     int := 0;
  v_tot_rec     int := 0;

begin

-- ── GUARDAS ──────────────────────────────────────────────────────────────────

if to_regclass('public.negocios') is null then
  raise exception '[G1] Schema relacional ausente.';
end if;

select id into v_user_id
  from auth.users where email = v_test_email limit 1;

if v_user_id is null then
  raise exception '[G2] No se encontró % en auth.users.', v_test_email;
end if;

raise notice 'GUARDAS OK. Usuario: %', v_user_id;


-- ── BLOQUE 1: BLOB EN user_data ──────────────────────────────────────────────

insert into public.user_data (user_id, data, tipo_perfil)
values (
  v_user_id,
  $blob${
    "cleo_tipo_perfil": "servicios",
    "cleo_perfil": {
      "nombre": "CRISMILE",
      "tuNombre": "Crismile",
      "tipoPerfil": "servicios",
      "color": "#f2728b",
      "colorSecundario": "#f8d1d5",
      "colorTexto": "#f2a8af",
      "banco": "BBVA",
      "bancotitular": "JESUS MANUEL ALVAREZ CAMPOS",
      "bancoclabe": "",
      "bancoaccount": "",
      "bancotarjeta": "4152314136290114",
      "bancoinstrucciones": "Al realizar el pago, manda el comprobante en una fotografía o captura de pantalla de la transferencia al medio en el que te comunicaste con nosotros.",
      "telefono": "9321254332",
      "email": "crismilebusiness@gmail.com",
      "direccion": "",
      "logo": "",
      "mensaje": "¡Tu sonrisa es nuestro objetivo!",
      "condicionesPago": "•Se paga el 50% del valor total para agendar la fecha en la que se llevará a cabo la sesión. (al menos son 10 días antes de la fecha) (el apartado no es reembolsable en caso de cancelación) (tiene derecho a un cambio de fecha sin costo)\nEl 50% restante se paga un día antes de la fecha de la sesión.\nEl lapso de entrega es de 3 a 20 días después de la toma de fotos.",
      "redesTT": "crismile.mx",
      "redesIG": "crismile.mx",
      "redesFB": "crismile",
      "onboardingListo": true
    },
    "cleo_alertas_cerradas": [],
    "cleo_etapas_vistas": ["Cotizacion enviada", "Negociacion"],
    "cleo_streak_accion_serv": {"dias": 8, "tipo": "cotizaciones_pendientes", "fecha": "2026-10-02"},
    "cleo_streak_accion_prod": null,
    "cleo_productos": ["5x FOTOS EXTRAS", "FOTO TÍTULO", "COTIZACION COMPLETA VIDEO", "Sesion personalizada", "Sesión personalizada"],
    "cleo_servicios": [
      {"id": 1788466350955, "nombre": "SESIÓN BASE PREMIUM", "precio": 3500, "condiciones": "<b>Delimitaciones:</b><div></div><ul><li>Duración: 3:30 hrsDerecho a 3 OutfitsNo incluye gastos de locación ni viáticos.</li></ul><div></div>", "descripcion": "<b>Sesión fotográfica Premium</b> con concepto personalizado y pensado, ideal para capturar momentos importantes."},
      {"id": 1788542635070, "nombre": "SESIÓN BASE BASICA", "precio": 2600, "condiciones": "<ul><li>Duración: 1:00 hrs</li><li>Derecho a 1 Outfits</li><li>No incluye gastos de locación ni viáticos.</li></ul>", "descripcion": "<b>Sesión fotográfica Básica</b> con concepto personalizado y pensado."},
      {"id": 1788543737146, "nombre": "MENÚ/PDF/CATÁLOGO", "precio": 500, "condiciones": "COSTO POR CARA<div>Después de la 3° cara el costo es de 300 por cara.</div>", "descripcion": "<b>DISEÑO DE DOCUMENTOS DESCRIPTIVOS</b>"},
      {"id": 1789073336644, "nombre": "PAQUETE BÁSICO/CREACIÓN DE CONTENIDO", "precio": 3500, "condiciones": "", "descripcion": "<ul><li>Guión del Material (videos)</li><li>4 Videos de 15 a 30 segundos</li></ul>"},
      {"id": 1790038622041, "nombre": "FOTO TÍTULO", "precio": 300, "condiciones": "", "descripcion": ""},
      {"id": 1790540563435, "nombre": "SESIÓN CUMPLEAÑOS/ STANDAR", "precio": 3000, "condiciones": "<b>Delimitaciones:</b><div>Duración: 2:00 hra</div><div>Derecho a 2 outfit.</div>", "descripcion": "<b>Sesión fotográfica</b> para cumpleaños."},
      {"id": 1790540663312, "nombre": "MAQUILLAJE FOTOGRÁFICO", "precio": 800, "condiciones": "", "descripcion": ""},
      {"id": 1790540665195, "nombre": "ONDAS CLASICAS", "precio": 750, "condiciones": "", "descripcion": ""},
      {"id": 1790993670940, "nombre": "COBERTURA DE EVENTO/BODA", "precio": 5500, "condiciones": "<ul><li>30 mins de alimentos no se cuentan.</li></ul>", "descripcion": "Captura momentos importantes, ideal para Cobertura de Boda."}
    ],
    "cleo_productos_cat": [],
    "cleo_pedidos": [],
    "cleo_ventas": [
      {"id": 1790294119108, "tipo": "especifico", "fecha": "2026-09-24", "items": [{"id": 1790294101474, "nombre": "FOTOS EXTRAS", "precio": "100", "cantidad": "5"}], "monto": 500, "notas": "", "pagos": [{"id": "pg_1790294119108_13qqx", "fecha": "2026-09-24", "monto": 500, "concepto": "Pago completo", "fechaHoraPago": "2026-09-24T23:55:19.108Z"}], "concepto": "5x FOTOS EXTRAS", "etiqueta": "whatsapp", "clienteId": 1790038069151, "entregado": true, "fechaEntrega": "2026-09-28"},
      {"id": 1790038620346, "tipo": "especifico", "fecha": "2026-09-21", "items": [{"id": 1790038592608, "nombre": "FOTO TÍTULO", "precio": "300", "cantidad": 1}], "monto": 300, "notas": "", "pagos": [{"id": "pg_1790038620361_nk2rh", "fecha": "2026-09-21", "monto": 150, "concepto": "Anticipo", "fechaHoraPago": "2026-09-22T00:57:00.361Z"}, {"id": "pg_1790202071342_jwv3j", "fecha": "2026-09-23", "monto": 150, "concepto": "Pago final", "fechaHoraPago": "2026-09-23T22:21:11.342Z"}], "concepto": "FOTO TÍTULO", "etiqueta": "WhatsApp", "clienteId": 1790038620347, "entregado": true, "fechaEntrega": "2026-09-23"},
      {"id": 1790038338433, "tipo": "especifico", "fecha": "2026-09-16", "items": [{"id": 1790038246332, "nombre": "COTIZACION COMPLETA VIDEO", "precio": "8800", "cantidad": 1}], "monto": 8800, "notas": "VIAJE A MEXICO", "pagos": [{"id": "pg_1790038338441_yvbyd", "fecha": "2026-09-16", "monto": 4400, "concepto": "Anticipo", "fechaHoraPago": "2026-09-22T00:52:18.441Z"}, {"id": "pg_1790625984869_f8ehv", "fecha": "2026-09-28", "monto": 4400, "concepto": "Pago final", "fechaHoraPago": "2026-09-28T20:06:24.869Z"}], "concepto": "COTIZACION COMPLETA VIDEO", "etiqueta": "WhatsApp", "clienteId": 1790038338434, "entregado": true, "fechaEntrega": "2026-10-17"},
      {"id": 1790038069150, "tipo": "especifico", "fecha": "2026-09-21", "items": [{"id": 1790038018240, "nombre": "Sesion personalizada", "precio": "2000", "cantidad": 1}], "monto": 2000, "notas": "Costo personalizado", "pagos": [{"id": "pg_1790038069157_8jof1", "fecha": "2026-09-21", "monto": 1000, "concepto": "Anticipo", "fechaHoraPago": "2026-09-22T00:47:49.157Z"}, {"id": "pg_1790294038224_h5kp9", "fecha": "2026-09-24", "monto": 1000, "concepto": "Pago final", "fechaHoraPago": "2026-09-24T23:53:58.224Z"}], "concepto": "Sesion personalizada", "etiqueta": "Whats app", "clienteId": 1790038069151, "entregado": true, "fechaEntrega": "2026-09-24"},
      {"id": 1790037830971, "tipo": "especifico", "fecha": "2026-09-21", "items": [{"id": 1790037788934, "nombre": "Sesión personalizada", "precio": "3000", "cantidad": 1}], "monto": 3000, "notas": "El costo fue personalizado", "pagos": [{"id": "pg_1790037830978_x2een", "fecha": "2026-09-21", "monto": 1500, "concepto": "Anticipo", "fechaHoraPago": "2026-09-22T00:43:50.978Z"}, {"id": "pg_1790325412527_lq1td", "fecha": "2026-09-25", "monto": 1500, "concepto": "Pago final", "fechaHoraPago": "2026-09-25T08:36:52.527Z"}], "concepto": "Sesión personalizada", "etiqueta": "WhatsApp", "clienteId": 1790037830972, "entregado": true, "fechaEntrega": "2026-10-09"}
    ],
    "cleo_cots": [
      {"id": 1788466342925, "fecha": "2026-09-03", "items": [{"id": "it_1788465164199", "total": 2600, "nombre": "SESIÓN BASE BASICA", "cantidad": 1, "catalogoId": null, "precioUnitario": 2600}], "monto": 2600, "notas": "", "pagos": [], "estatus": "Rechazada", "subtotal": 2600, "clienteId": 1788466342922, "descuento": 0, "tipoDescuento": "porcentaje", "fechaCierre": "2026-09-03", "fechaHoraCierre": "2026-09-03T20:40:16.433Z", "itemsAceptacion": [], "montoAceptacion": null, "configPostVenta": {"pago": "pendiente", "seguimiento": "pendiente"}, "vinculadaOportunidadActual": true},
      {"id": 1788543735474, "fecha": "2026-09-04", "items": [{"id": "it_1788542516917", "total": 6000, "nombre": "MENÚ/PDF/CATÁLOGO", "cantidad": 12, "catalogoId": null, "precioUnitario": 500}], "monto": 2160, "notas": "", "pagos": [], "estatus": "Rechazada", "subtotal": 6000, "clienteId": 1788543735464, "descuento": 64, "tipoDescuento": "porcentaje", "vinculadaOportunidadActual": true},
      {"id": 1788549459889, "fecha": "2026-09-04", "items": [{"id": "it_1788549182704", "total": 2600, "nombre": "SESIÓN BASE BASICA", "cantidad": 1, "catalogoId": 1788542635070, "precioUnitario": 2600}], "monto": 2600, "notas": "", "pagos": [], "estatus": "Rechazada", "subtotal": 2600, "clienteId": 1788543735464, "descuento": 0, "tipoDescuento": "porcentaje", "vinculadaOportunidadActual": false},
      {"id": 1789073333591, "fecha": "2026-09-10", "items": [{"id": "it_1789072878156", "total": 3500, "nombre": "PAQUETE BÁSICO/CREACIÓN DE CONTENIDO", "cantidad": 1, "catalogoId": null, "precioUnitario": 3500}, {"id": "it_1789073357609_rrb3", "total": 1000, "nombre": "Modelo", "cantidad": 1, "catalogoId": null, "precioUnitario": 1000}], "monto": 4500, "notas": "", "pagos": [], "estatus": "Pendiente", "subtotal": 4500, "clienteId": 1789073333583, "descuento": 0, "tipoDescuento": "porcentaje", "vinculadaOportunidadActual": true},
      {"id": 1790540560327, "fecha": "2026-09-27", "items": [{"id": "it_1790540197136", "total": 3000, "nombre": "SESIÓN CUMPLEAÑOS/ STANDAR", "cantidad": 1, "catalogoId": null, "precioUnitario": 3000}, {"id": "it_1790540601705_3dse", "total": 800, "nombre": "MAQUILLAJE FOTOGRÁFICO", "cantidad": 1, "catalogoId": null, "precioUnitario": 800}], "monto": 3800, "notas": "", "pagos": [{"id": "pg_1790625849099_lnc3n", "fecha": "2026-09-28", "monto": 1900, "concepto": "Anticipo", "fechaHoraPago": "2026-09-28T20:04:09.099Z"}], "estatus": "Aceptada", "subtotal": 3800, "clienteId": 1790540560315, "descuento": 0, "tipoDescuento": "porcentaje", "fechaCierre": "2026-09-28", "fechaHoraCierre": "2026-09-28T20:03:58.835Z", "itemsAceptacion": [{"id": "it_1790540197136", "total": 3000, "nombre": "SESIÓN CUMPLEAÑOS/ STANDAR", "cantidad": 1, "precioUnitario": 3000}, {"id": "it_1790540601705_3dse", "total": 800, "nombre": "MAQUILLAJE FOTOGRÁFICO", "cantidad": 1, "precioUnitario": 800}], "montoAceptacion": 3800, "configPostVenta": {"pago": "resuelto", "seguimiento": "resuelto"}, "vinculadaOportunidadActual": true},
      {"id": 1790971221793, "fecha": "2026-10-02", "items": [{"id": "it_1790971034939", "total": 2600, "nombre": "SESIÓN BASE BASICA", "cantidad": 1, "catalogoId": 1788542635070, "precioUnitario": 2600}, {"id": "it_1790971203349_9f65", "total": 800, "nombre": "MAQUILLAJE FOTOGRÁFICO", "cantidad": 1, "catalogoId": 1790540663312, "precioUnitario": 800}], "monto": 3400, "notas": "", "pagos": [], "estatus": "Pendiente", "subtotal": 3400, "clienteId": 1790971221775, "descuento": 0, "tipoDescuento": "porcentaje", "vinculadaOportunidadActual": true},
      {"id": 1790993667752, "fecha": "2026-10-02", "items": [{"id": "it_1790993107615", "total": 5500, "nombre": "COBERTURA DE EVENTO/BODA", "cantidad": 1, "catalogoId": null, "precioUnitario": 5500}, {"id": "it_1790993643811_h75m", "total": 500, "nombre": "Viáticos", "cantidad": 1, "catalogoId": null, "precioUnitario": 500}], "monto": 6000, "notas": "", "pagos": [{"id": "pg_1791050702843_zz6qb", "fecha": "2026-10-03", "monto": 3000, "concepto": "Anticipo", "fechaHoraPago": "2026-10-03T18:05:02.843Z"}], "estatus": "Aceptada", "subtotal": 6000, "clienteId": 1790993667746, "descuento": 0, "tipoDescuento": "porcentaje", "fechaCierre": "2026-10-03", "fechaHoraCierre": "2026-10-03T18:04:53.166Z", "itemsAceptacion": [{"id": "it_1790993107615", "total": 5500, "nombre": "COBERTURA DE EVENTO/BODA", "cantidad": 1, "precioUnitario": 5500}, {"id": "it_1790993643811_h75m", "total": 500, "nombre": "Viáticos", "cantidad": 1, "precioUnitario": 500}], "montoAceptacion": 6000, "configPostVenta": {"pago": "resuelto", "seguimiento": "resuelto"}, "vinculadaOportunidadActual": true}
    ],
    "cleo_clientes": [
      {"id": 1790993667746, "nombre": "Claudia Cid", "negocio": "", "contacto": "9931080475", "email": "", "instagram": "", "messenger": "", "origen": "WhatsApp", "etapa": "Ganado", "fecha": "2026-10-02", "fechaEtapa": "2026-10-03", "ultimoContacto": "2026-10-02", "canalPrincipal": "WhatsApp", "precioInteres": "6000", "productoInteres": "COBERTURA DE EVENTO/BODA y Viáticos", "notas": "", "recordatorios": [{"id": "r_1791050740922", "nota": "Preguntar para el dia siguiente", "fecha": "2026-10-09", "origen": "cleo", "categoria": "postventa", "esPersonalizada": true}]},
      {"id": 1790971221775, "nombre": "Elio Cruz Mendoza", "negocio": "", "contacto": "9321225830", "email": "", "instagram": "", "messenger": "", "origen": "Referido", "etapa": "Cotizacion enviada", "fecha": "2026-10-02", "fechaEtapa": "2026-10-02", "ultimoContacto": "2026-10-02", "canalPrincipal": "WhatsApp", "precioInteres": "3400", "productoInteres": "SESIÓN BASE BASICA y MAQUILLAJE FOTOGRÁFICO", "notas": "", "recordatorios": []},
      {"id": 1790540560315, "nombre": "Cinthya Jimenez", "negocio": "", "contacto": "9323297940", "email": "", "instagram": "", "messenger": "", "origen": "WhatsApp", "etapa": "Ganado", "fecha": "2026-09-27", "fechaEtapa": "2026-09-28", "ultimoContacto": "2026-09-27", "canalPrincipal": "WhatsApp", "precioInteres": "3800", "productoInteres": "SESIÓN CUMPLEAÑOS/ STANDAR y MAQUILLAJE FOTOGRÁFICO", "notas": "", "recordatorios": [{"id": "r_1790625936432", "nota": "Preguntar que ropa llevará y de que color son sus números y globos", "fecha": "2026-10-01", "origen": "cleo", "categoria": "postventa", "esPersonalizada": true}]},
      {"id": 1789073333583, "nombre": "Fernando Sanchez", "negocio": "", "contacto": "9321080243", "email": "", "instagram": "", "messenger": "", "origen": "Facebook", "etapa": "Negociacion", "fecha": "2026-09-10", "fechaEtapa": "2026-09-10", "ultimoContacto": "2026-10-02", "canalPrincipal": "WhatsApp", "precioInteres": "4500", "productoInteres": "PAQUETE BÁSICO/CREACIÓN DE CONTENIDO y Modelo", "notas": "", "recordatorios": [{"id": "r_1790037726218", "nota": "Seguía interesado. Le dijiste que le darías seguimiento.", "fecha": "2026-09-24", "origen": "cleo", "categoria": "pipeline", "esPersonalizada": false}, {"id": "r_1790995615288", "nota": "Seguía interesado. Le dijiste que le darías seguimiento.", "fecha": "2026-10-07", "origen": "cleo", "categoria": "pipeline", "esPersonalizada": false}]},
      {"id": 1788543735464, "nombre": "Karelly Rodriguez", "negocio": "", "contacto": "9321293938", "email": "", "instagram": "", "messenger": "", "origen": "WhatsApp", "etapa": "Perdido", "fecha": "2026-09-04", "fechaEtapa": "2026-09-08", "ultimoContacto": "2026-09-25", "canalPrincipal": "WhatsApp", "precioInteres": "2160", "productoInteres": "MENÚ/PDF/CATÁLOGO", "notas": "", "recordatorios": [], "historialContactos": [{"fecha": "2026-09-25", "fechaHora": "2026-09-25T08:38:51.669Z", "resultado": "Recordatorio atendido: \"Dijo que para otra presentación\""}]},
      {"id": 1788466342922, "nombre": "Vivian Montserrat", "negocio": "", "contacto": "9321142201", "email": "", "instagram": "", "messenger": "", "origen": "Instagram", "etapa": "Perdido", "fecha": "2026-09-03", "fechaEtapa": "2026-09-21", "ultimoContacto": "2026-09-10", "canalPrincipal": "WhatsApp", "precioInteres": "2600", "productoInteres": "SESIÓN BASE BASICA", "notas": "", "recordatorios": [{"id": "r_1790037711654", "nota": "Hola Vivian, estoy abriendo agenda para el próximo trimestre.", "fecha": "2026-10-06", "origen": "cleo", "categoria": "reactivacion", "esPersonalizada": false}]},
      {"id": 1790037830972, "nombre": "Julio Narez", "negocio": "", "contacto": "9321101565", "email": "", "instagram": "", "messenger": "", "origen": "WhatsApp", "etapa": "Ganado", "fecha": "2026-09-21", "fechaEtapa": "2026-09-21", "ultimoContacto": "2026-09-21", "canalPrincipal": "WhatsApp", "notas": "Registrado desde venta directa", "recordatorios": [{"id": "r_1790325947729", "nota": "Cumpleaños el día 19 de Septiembre (Julia)", "fecha": "2027-09-08", "origen": "manual", "categoria": "manual", "esPersonalizada": true}]},
      {"id": 1790038069151, "nombre": "Doria Ramos", "negocio": "", "contacto": "9321071766", "email": "", "instagram": "", "messenger": "", "origen": "WhatsApp", "etapa": "Ganado", "fecha": "2026-09-21", "fechaEtapa": "2026-09-21", "ultimoContacto": "2026-09-21", "canalPrincipal": "WhatsApp", "notas": "Registrado desde venta directa", "recordatorios": [{"id": "r_1790325773749", "nota": "Cumpleaños de Andrea hija de Doria", "fecha": "2027-09-14", "origen": "manual", "categoria": "manual", "esPersonalizada": true}, {"id": "r_1790325893801", "nota": "Cumpleaños día 26 de Septiembre", "fecha": "2027-09-19", "origen": "manual", "categoria": "manual", "esPersonalizada": true}]},
      {"id": 1790038338434, "nombre": "PLATANERA BANDOLERO", "negocio": "", "contacto": "5525581643", "email": "", "instagram": "", "messenger": "", "origen": "Referido", "etapa": "Ganado", "fecha": "2026-09-16", "fechaEtapa": "2026-09-16", "ultimoContacto": "2026-09-16", "canalPrincipal": "WhatsApp", "notas": "Registrado desde venta directa", "recordatorios": []},
      {"id": 1790038620347, "nombre": "Diego velazquez", "negocio": "", "contacto": "8140060007", "email": "", "instagram": "", "messenger": "", "origen": "WhatsApp", "etapa": "Ganado", "fecha": "2026-09-21", "fechaEtapa": "2026-09-21", "ultimoContacto": "2026-09-21", "canalPrincipal": "WhatsApp", "notas": "Registrado desde venta directa", "recordatorios": []}
    ]
  }$blob$::jsonb,
  'servicios'
)
on conflict (user_id) do nothing;

get diagnostics v_n = row_count;
if v_n = 0 then
  raise notice 'BLOB: user_data ya existía para %. Usando existente.', v_test_email;
else
  raise notice 'BLOB: insertado para %.', v_test_email;
end if;

select data into v_blob from public.user_data where user_id = v_user_id;
v_tipo_perfil := coalesce(v_blob ->> 'cleo_tipo_perfil', 'servicios');
v_perfil      := coalesce(v_blob -> 'cleo_perfil', '{}'::jsonb);

raise notice 'BLOB: tipo_perfil=%, clientes=%, cots=%, ventas=%',
  v_tipo_perfil,
  jsonb_array_length(coalesce(v_blob -> 'cleo_clientes', '[]')),
  jsonb_array_length(coalesce(v_blob -> 'cleo_cots',     '[]')),
  jsonb_array_length(coalesce(v_blob -> 'cleo_ventas',   '[]'));


-- ── BLOQUE 2: NEGOCIOS ────────────────────────────────────────────────────────

insert into public.negocios (
  user_id, nombre, nombre_contacto, tipo_perfil,
  telefono, email, color, color_sec,
  banco, cuenta, clabe, titular,
  moneda, productos, config, datos_ui, schema_ver
)
values (
  v_user_id,
  coalesce(v_perfil ->> 'nombre',          ''),
  coalesce(v_perfil ->> 'tuNombre',         null),
  v_tipo_perfil,
  coalesce(v_perfil ->> 'telefono',         null),
  coalesce(v_perfil ->> 'email',            null),
  coalesce(v_perfil ->> 'color',            null),
  coalesce(v_perfil ->> 'colorSecundario',  null),
  coalesce(v_perfil ->> 'banco',            null),
  coalesce(v_perfil ->> 'bancoaccount',     null),
  coalesce(v_perfil ->> 'bancoclabe',       null),
  coalesce(v_perfil ->> 'bancotitular',     null),
  'MXN',
  coalesce(
    (select array_agg(e) from jsonb_array_elements_text(coalesce(v_blob -> 'cleo_productos', '[]')) e),
    '{}'
  ),
  jsonb_build_object(
    'logo',               coalesce(v_perfil ->> 'logo',               ''),
    'mensaje',            coalesce(v_perfil ->> 'mensaje',            ''),
    'condicionesPago',    coalesce(v_perfil ->> 'condicionesPago',    ''),
    'redesTT',            coalesce(v_perfil ->> 'redesTT',            ''),
    'redesIG',            coalesce(v_perfil ->> 'redesIG',            ''),
    'redesFB',            coalesce(v_perfil ->> 'redesFB',            ''),
    'colorTexto',         coalesce(v_perfil ->> 'colorTexto',         ''),
    'bancotarjeta',       coalesce(v_perfil ->> 'bancotarjeta',       ''),
    'bancoinstrucciones', coalesce(v_perfil ->> 'bancoinstrucciones', ''),
    'direccion',          coalesce(v_perfil ->> 'direccion',          '')
  ),
  jsonb_build_object(
    'alertas_cerradas', coalesce(v_blob -> 'cleo_alertas_cerradas',   '[]'),
    'etapas_vistas',    coalesce(v_blob -> 'cleo_etapas_vistas',      '[]'),
    'streak_serv',      coalesce(v_blob -> 'cleo_streak_accion_serv', 'null'::jsonb),
    'streak_prod',      coalesce(v_blob -> 'cleo_streak_accion_prod', 'null'::jsonb)
  ),
  'blob'
)
on conflict (user_id) do nothing
returning id into v_neg_id;

if v_neg_id is null then
  select id into v_neg_id from public.negocios where user_id = v_user_id;
  raise notice 'NEGOCIOS: ya existía (id=%).', v_neg_id;
else
  raise notice 'NEGOCIOS: insertado (id=%).', v_neg_id;
end if;


-- ── BLOQUE 3: CATÁLOGO ────────────────────────────────────────────────────────

for v_cli in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_servicios', '[]'))
loop
  insert into public.catalogo_items (negocio_id, cleo_id, modo, nombre, precio, descripcion, condiciones)
  values (v_neg_id, v_cli ->> 'id', 'servicios',
    coalesce(v_cli ->> 'nombre', ''), coalesce((v_cli ->> 'precio')::numeric, 0),
    v_cli ->> 'descripcion', v_cli ->> 'condiciones')
  on conflict (negocio_id, modo, cleo_id) do nothing;
  get diagnostics v_n = row_count; v_tot_cat := v_tot_cat + v_n;
end loop;
raise notice 'CATÁLOGO: % ítems.', v_tot_cat;


-- ── BLOQUE 4: CLIENTES ────────────────────────────────────────────────────────

for v_cli in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_clientes', '[]'))
loop
  insert into public.clientes (
    negocio_id, cleo_id, nombre, empresa, telefono, email,
    instagram, messenger, canal, origen, etapa, fecha_etapa,
    motivo_perdida, ultimo_contacto, notas, etiqueta,
    mensaje_seguimiento, seguimiento_custom, created_at
  )
  values (
    v_neg_id, v_cli ->> 'id',
    coalesce(v_cli ->> 'nombre', ''), v_cli ->> 'negocio',
    v_cli ->> 'contacto', v_cli ->> 'email',
    v_cli ->> 'instagram', v_cli ->> 'messenger',
    v_cli ->> 'canalPrincipal', v_cli ->> 'origen',
    v_cli ->> 'etapa', nullif(v_cli ->> 'fechaEtapa', '')::date,
    v_cli ->> 'motivoPerdida',
    nullif(v_cli ->> 'ultimoContacto', '')::date,
    v_cli ->> 'notas', v_cli ->> 'etiqueta',
    v_cli ->> 'mensajeSeguimiento',
    coalesce((v_cli ->> 'seguimientoCustom')::boolean, false),
    coalesce(nullif(v_cli ->> 'fecha', '')::timestamptz, now())
  )
  on conflict (negocio_id, cleo_id) do nothing;
  get diagnostics v_n = row_count; v_tot_cli := v_tot_cli + v_n;
end loop;
raise notice 'CLIENTES: % insertados.', v_tot_cli;


-- ── BLOQUE 5: OPORTUNIDADES ───────────────────────────────────────────────────

-- 5a: Una por cliente (pipeline principal)
for v_cli in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_clientes', '[]'))
loop
  select id into v_cliente_uuid
    from public.clientes where negocio_id = v_neg_id and cleo_id = (v_cli ->> 'id');
  if v_cliente_uuid is null then continue; end if;

  insert into public.oportunidades (
    negocio_id, cleo_id, cliente_id, modo,
    titulo, estatus, etapa,
    precio_interes, motivo_cierre,
    fecha, fecha_etapa, ultimo_contacto, fecha_cierre,
    origen_migracion
  )
  values (
    v_neg_id,
    'op_cli_' || (v_cli ->> 'id'),
    v_cliente_uuid,
    'servicios',
    coalesce(v_cli ->> 'servicioInteres', v_cli ->> 'productoInteres', ''),
    case v_cli ->> 'etapa'
      when 'Ganado'  then 'ganada'
      when 'Perdido' then 'perdida'
      else 'activa'
    end,
    case v_cli ->> 'etapa'
      when 'Ganado'             then 'ganado'
      when 'Perdido'            then 'perdido'
      when 'Cotizacion enviada' then 'cotizacion_enviada'
      when 'Negociacion'        then 'negociacion'
      else 'nuevo_contacto'
    end,
    nullif(v_cli ->> 'precioInteres', '')::numeric,
    v_cli ->> 'motivoPerdida',
    coalesce(nullif(v_cli ->> 'fechaEtapa', '')::date, nullif(v_cli ->> 'fecha', '')::date, current_date),
    nullif(v_cli ->> 'fechaEtapa', '')::date,
    nullif(v_cli ->> 'ultimoContacto', '')::date,
    case when v_cli ->> 'etapa' in ('Ganado','Perdido')
      then nullif(v_cli ->> 'fechaEtapa', '')::date else null end,
    'migrada_vinculada'
  )
  on conflict (negocio_id, cleo_id) do nothing;
  get diagnostics v_n = row_count; v_tot_op := v_tot_op + v_n;
end loop;

-- 5b: Cotizaciones independientes
for v_cot in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_cots', '[]'))
  where (value ->> 'vinculadaOportunidadActual') = 'false'
     or (value -> 'vinculadaOportunidadActual') = 'false'::jsonb
loop
  select id into v_cliente_uuid
    from public.clientes where negocio_id = v_neg_id and cleo_id = (v_cot ->> 'clienteId');
  if v_cliente_uuid is null then continue; end if;

  insert into public.oportunidades (
    negocio_id, cleo_id, cliente_id, modo, titulo, estatus, etapa,
    fecha, fecha_cierre, origen_migracion
  )
  values (
    v_neg_id,
    'op_cotindep_' || (v_cot ->> 'id'),
    v_cliente_uuid, 'servicios',
    coalesce((v_cot -> 'items' -> 0) ->> 'nombre', 'Cotización ' || (v_cot ->> 'id')),
    case when v_cot ->> 'estatus' = 'Aceptada' then 'ganada'
         when v_cot ->> 'estatus' in ('Rechazada','Cancelada') then 'perdida'
         else 'activa' end,
    case when v_cot ->> 'estatus' = 'Aceptada' then 'ganado'
         when v_cot ->> 'estatus' in ('Rechazada','Cancelada') then 'perdido'
         else 'cotizacion_enviada' end,
    coalesce(nullif(v_cot ->> 'fecha', '')::date, current_date),
    case when v_cot ->> 'estatus' = 'Aceptada' then nullif(v_cot ->> 'fechaCierre', '')::date
         when v_cot ->> 'estatus' in ('Rechazada','Cancelada') then nullif(v_cot ->> 'fechaRechazo', '')::date
         else null end,
    'migrada_cotindep'
  )
  on conflict (negocio_id, cleo_id) do nothing;
  get diagnostics v_n = row_count; v_tot_op := v_tot_op + v_n;
end loop;

raise notice 'OPORTUNIDADES: % insertadas.', v_tot_op;


-- ── BLOQUE 6: COTIZACIONES + PAGOS ───────────────────────────────────────────

for v_cot in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_cots', '[]'))
loop
  v_cliente_uuid := null;
  select id into v_cliente_uuid
    from public.clientes where negocio_id = v_neg_id and cleo_id = (v_cot ->> 'clienteId');

  v_op_uuid := null;
  declare
    v_es_indep boolean;
    v_op_cleo  text;
  begin
    v_es_indep := (v_cot ->> 'vinculadaOportunidadActual') = 'false'
                  or (v_cot -> 'vinculadaOportunidadActual') = 'false'::jsonb;
    v_op_cleo  := case when v_es_indep
                    then 'op_cotindep_' || (v_cot ->> 'id')
                    else 'op_cli_'      || (v_cot ->> 'clienteId')
                  end;
    select id into v_op_uuid from public.oportunidades
     where negocio_id = v_neg_id and cleo_id = v_op_cleo;
  end;

  begin
    insert into public.cotizaciones (
      negocio_id, cleo_id, cliente_id, oportunidad_id, oportunidad_vinculada,
      items, subtotal, monto, descuento, tipo_descuento,
      anticipo, vigencia, vigencia_dias, tipo_pago,
      sv_condiciones, sv_condiciones_html, notas, etiqueta,
      estatus, fecha, fecha_cierre, fecha_hora_cierre,
      fecha_rechazo, fecha_hora_rechazo,
      items_aceptacion, monto_aceptacion,
      postv_pago, postv_seguimiento,
      entregado
    )
    values (
      v_neg_id, v_cot ->> 'id', v_cliente_uuid, v_op_uuid, v_op_uuid is not null,
      coalesce(v_cot -> 'items', '[]'),
      coalesce((v_cot ->> 'subtotal')::numeric, 0),
      coalesce((v_cot ->> 'monto')::numeric, 0),
      coalesce(nullif(v_cot ->> 'descuento', '')::numeric, 0),
      case when v_cot ->> 'tipoDescuento' in ('porcentaje','monto') then v_cot ->> 'tipoDescuento' else null end,
      coalesce(nullif(v_cot ->> 'anticipo', '')::numeric, 0),
      nullif(v_cot ->> 'vigencia', ''),
      nullif(v_cot ->> 'vigenciaDias', '')::int,
      v_cot ->> 'tipoPago',
      nullif(v_cot ->> 'svCondiciones', ''), nullif(v_cot ->> 'svCondicionesHtml', ''),
      v_cot ->> 'notas', v_cot ->> 'etiqueta',
      coalesce(v_cot ->> 'estatus', 'Pendiente'),
      nullif(v_cot ->> 'fecha', '')::date,
      nullif(v_cot ->> 'fechaCierre', '')::date,
      nullif(v_cot ->> 'fechaHoraCierre', '')::timestamptz,
      nullif(v_cot ->> 'fechaRechazo', '')::date,
      nullif(v_cot ->> 'fechaHoraRechazo', '')::timestamptz,
      coalesce(v_cot -> 'itemsAceptacion', null),
      nullif(v_cot ->> 'montoAceptacion', '')::numeric,
      case when (v_cot -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
           then (v_cot -> 'configPostVenta') ->> 'pago' else null end,
      case when (v_cot -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
           when (v_cot -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
           else null end,
      coalesce((v_cot ->> 'entregado')::boolean, false)
    )
    on conflict (negocio_id, cleo_id) do nothing;
    get diagnostics v_n = row_count; v_tot_cot := v_tot_cot + v_n;

  exception when unique_violation then
    raise notice 'COT %: oportunidad ya vinculada, insertada sin oportunidad_id.', v_cot ->> 'id';
    insert into public.cotizaciones (
      negocio_id, cleo_id, cliente_id, oportunidad_id, oportunidad_vinculada,
      items, subtotal, monto, descuento, tipo_descuento, notas, etiqueta, estatus, fecha
    )
    values (
      v_neg_id, v_cot ->> 'id', v_cliente_uuid, null, false,
      coalesce(v_cot -> 'items', '[]'),
      coalesce((v_cot ->> 'subtotal')::numeric, 0),
      coalesce((v_cot ->> 'monto')::numeric, 0),
      coalesce(nullif(v_cot ->> 'descuento', '')::numeric, 0),
      case when v_cot ->> 'tipoDescuento' in ('porcentaje','monto') then v_cot ->> 'tipoDescuento' else null end,
      v_cot ->> 'notas', v_cot ->> 'etiqueta',
      coalesce(v_cot ->> 'estatus', 'Pendiente'),
      nullif(v_cot ->> 'fecha', '')::date
    )
    on conflict (negocio_id, cleo_id) do nothing;
    get diagnostics v_n = row_count; v_tot_cot := v_tot_cot + v_n;
  end;

  -- Pagos de la cotización
  select id into v_cot_uuid
    from public.cotizaciones where negocio_id = v_neg_id and cleo_id = (v_cot ->> 'id');

  if v_cot_uuid is not null then
    for v_pago in
      select value from jsonb_array_elements(coalesce(v_cot -> 'pagos', '[]'))
    loop
      insert into public.pagos (negocio_id, cleo_id, cotizacion_id, monto, fecha, concepto)
      values (v_neg_id, v_pago ->> 'id', v_cot_uuid,
        coalesce((v_pago ->> 'monto')::numeric, 0),
        nullif(v_pago ->> 'fecha', '')::date,
        v_pago ->> 'concepto')
      on conflict (negocio_id, cleo_id) do nothing;
      get diagnostics v_n = row_count; v_tot_pag := v_tot_pag + v_n;
    end loop;
  end if;
end loop;

raise notice 'COTIZACIONES: %, PAGOS cots: %.', v_tot_cot, v_tot_pag;


-- ── BLOQUE 7: VENTAS + PAGOS ──────────────────────────────────────────────────

for v_venta in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_ventas', '[]'))
loop
  v_cliente_uuid := null;
  select id into v_cliente_uuid
    from public.clientes where negocio_id = v_neg_id and cleo_id = (v_venta ->> 'clienteId');

  insert into public.ventas (
    negocio_id, cleo_id, cliente_id,
    concepto, items, monto, tipo, notas, etiqueta, fecha,
    tipo_pago, entregado, fecha_entrega,
    postv_pago, postv_seguimiento
  )
  values (
    v_neg_id, v_venta ->> 'id', v_cliente_uuid,
    v_venta ->> 'concepto', coalesce(v_venta -> 'items', '[]'),
    coalesce((v_venta ->> 'monto')::numeric, 0),
    case when v_venta ->> 'tipo' = 'especifico' then 'normal' else 'rapida' end,
    v_venta ->> 'notas', v_venta ->> 'etiqueta',
    nullif(v_venta ->> 'fecha', '')::date,
    v_venta ->> 'tipoPago',
    coalesce((v_venta ->> 'entregado')::boolean, false),
    nullif(v_venta ->> 'fechaEntrega', '')::date,
    case when (v_venta -> 'configPostVenta') ->> 'pago' in ('pendiente','resuelto')
         then (v_venta -> 'configPostVenta') ->> 'pago' else null end,
    case when (v_venta -> 'configPostVenta') ->> 'seguimiento' = 'pendiente' then 'pendiente'
         when (v_venta -> 'configPostVenta') ->> 'seguimiento' in ('ok','resuelto') then 'ok'
         else null end
  )
  on conflict (negocio_id, cleo_id) do nothing;
  get diagnostics v_n = row_count; v_tot_ven := v_tot_ven + v_n;

  select id into v_ven_uuid
    from public.ventas where negocio_id = v_neg_id and cleo_id = (v_venta ->> 'id');

  if v_ven_uuid is not null then
    for v_pago in
      select value from jsonb_array_elements(coalesce(v_venta -> 'pagos', '[]'))
    loop
      insert into public.pagos (negocio_id, cleo_id, venta_id, monto, fecha, concepto)
      values (v_neg_id, v_pago ->> 'id', v_ven_uuid,
        coalesce((v_pago ->> 'monto')::numeric, 0),
        nullif(v_pago ->> 'fecha', '')::date,
        v_pago ->> 'concepto')
      on conflict (negocio_id, cleo_id) do nothing;
      get diagnostics v_n = row_count; v_tot_pag := v_tot_pag + v_n;
    end loop;
  end if;
end loop;

raise notice 'VENTAS: %, PAGOS total: %.', v_tot_ven, v_tot_pag;


-- ── BLOQUE 8: RECORDATORIOS ───────────────────────────────────────────────────

for v_cli in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_clientes', '[]'))
loop
  select id into v_cliente_uuid
    from public.clientes where negocio_id = v_neg_id and cleo_id = (v_cli ->> 'id');
  if v_cliente_uuid is null then continue; end if;

  for v_rec in
    select value from jsonb_array_elements(coalesce(v_cli -> 'recordatorios', '[]'))
  loop
    declare
      v_rec_cleo_id   text;
      v_rec_op_id     uuid;
      v_rec_categoria text;
    begin
      v_rec_cleo_id   := v_rec ->> 'id';
      v_rec_categoria := coalesce(v_rec ->> 'categoria', 'manual');
      if v_rec_categoria not in ('pipeline','postventa','reactivacion','manual','sin_clasificar') then
        v_rec_categoria := 'sin_clasificar';
      end if;

      v_rec_op_id := null;
      if v_rec_categoria = 'pipeline' then
        select id into v_rec_op_id from public.oportunidades
         where negocio_id = v_neg_id and cleo_id = 'op_cli_' || (v_cli ->> 'id');
      end if;

      insert into public.recordatorios (
        negocio_id, cleo_id, cliente_id, oportunidad_id,
        categoria, texto, fecha, completado, estatus, es_personalizada, origen
      )
      values (
        v_neg_id, v_rec_cleo_id, v_cliente_uuid, v_rec_op_id,
        v_rec_categoria, v_rec ->> 'nota',
        nullif(v_rec ->> 'fecha', '')::date,
        false, 'pendiente',
        coalesce((v_rec ->> 'esPersonalizada')::boolean, false),
        v_rec ->> 'origen'
      )
      on conflict (negocio_id, cleo_id) where cleo_id is not null do nothing;
      get diagnostics v_n = row_count; v_tot_rec := v_tot_rec + v_n;
    end;
  end loop;
end loop;

raise notice 'RECORDATORIOS: % insertados.', v_tot_rec;


-- ── VERIFICACIONES FINALES ────────────────────────────────────────────────────

raise notice '── VERIFICACIONES ────────────────────────────';

declare
  v_cnt_cli int; v_cnt_op int; v_cnt_cot int; v_cnt_pag int; v_cnt_ven int; v_cnt_rec int;
begin
  select count(*) into v_cnt_cli from public.clientes      where negocio_id = v_neg_id;
  select count(*) into v_cnt_op  from public.oportunidades where negocio_id = v_neg_id;
  select count(*) into v_cnt_cot from public.cotizaciones  where negocio_id = v_neg_id;
  select count(*) into v_cnt_pag from public.pagos         where negocio_id = v_neg_id;
  select count(*) into v_cnt_ven from public.ventas        where negocio_id = v_neg_id;
  select count(*) into v_cnt_rec from public.recordatorios where negocio_id = v_neg_id;

  raise notice 'V1 clientes: %  oportunidades: %  cotizaciones: %  pagos: %  ventas: %  recordatorios: %',
    v_cnt_cli, v_cnt_op, v_cnt_cot, v_cnt_pag, v_cnt_ven, v_cnt_rec;
end;

-- V2: Ninguna oportunidad sin cliente válido
declare v_n2 int; begin
  select count(*) into v_n2
    from public.oportunidades o
    left join public.clientes c on c.id = o.cliente_id and c.negocio_id = o.negocio_id
   where o.negocio_id = v_neg_id and c.id is null;
  if v_n2 > 0 then raise exception 'V2 FALLA: % oportunidades sin cliente.', v_n2; end if;
  raise notice 'V2 OK: oportunidades con cliente válido.';
end;

-- V3: Coherencia cliente ↔ oportunidad en cotizaciones
declare v_n3 int; begin
  select count(*) into v_n3
    from public.cotizaciones c
    join public.oportunidades o on o.id = c.oportunidad_id and o.negocio_id = c.negocio_id
   where c.negocio_id = v_neg_id and c.cliente_id is distinct from o.cliente_id;
  if v_n3 > 0 then raise exception 'V3 FALLA: % cotizaciones con cliente distinto al de su oportunidad.', v_n3; end if;
  raise notice 'V3 OK: coherencia cliente ↔ oportunidad.';
end;

-- V4: schema_ver intacto
declare v_sv2 text; begin
  select schema_ver into v_sv2 from public.negocios where id = v_neg_id;
  if v_sv2 <> 'blob' then raise exception 'V4 FALLA: schema_ver=% (esperaba blob).', v_sv2; end if;
  raise notice 'V4 OK: schema_ver=blob intacto.';
end;

raise notice 'FIN 30-copia-crismile.sql — COMMIT para conservar, ROLLBACK para descartar.';

end;
$main$;
