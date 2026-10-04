-- ══════════════════════════════════════════════════════════════════════════════
-- 09-copia-prueba.sql
-- CLEO Pruebas (pconfadsbtwjbjeblxgl) — datos ficticios
--
-- Copia blob → tablas relacionales con datos de prueba.
-- Preserva user_data intacto. Mantiene schema_ver='blob'.
-- Idempotente: repetir no duplica filas.
-- Conflictos de integridad (FK, CHECK) detienen el script.
-- Conflictos de unicidad (cleo_id ya existe) se saltan con NOTICE.
--
-- PRERREQUISITO:
--   Crear la cuenta de prueba en CLEO Pruebas con el email definido
--   en v_test_email antes de ejecutar. El script no crea usuarios.
--
-- PARA PROBAR SIN CONSERVAR CAMBIOS:
--   Ejecutar dentro de una transacción explícita:
--     BEGIN;
--     \i 09-copia-prueba.sql
--     ROLLBACK;   -- o COMMIT para conservar
--
-- SOLO PARA CLEO Pruebas. NO ejecutar en producción.
-- ══════════════════════════════════════════════════════════════════════════════

do $main$
declare
  v_test_email  constant text := 'copia09@cleo.test';

  v_user_id     uuid;
  v_neg_id      uuid;
  v_blob        jsonb;
  v_perfil      jsonb;
  v_tipo_perfil text;

  -- Cursores de trabajo (reutilizados en varios bloques)
  v_cli         jsonb;
  v_cot         jsonb;
  v_venta       jsonb;
  v_pedido      jsonb;
  v_rec         jsonb;
  v_pago        jsonb;
  v_adj         jsonb;

  -- UUIDs de trabajo
  v_cliente_uuid uuid;
  v_op_uuid      uuid;
  v_cot_uuid     uuid;
  v_ped_uuid     uuid;
  v_ven_uuid     uuid;

  -- Contador auxiliar (GET DIAGNOSTICS no acumula directamente)
  v_n           int := 0;

  -- Totales para el reporte final
  v_tot_cli     int := 0;
  v_tot_op      int := 0;
  v_tot_cat     int := 0;
  v_tot_cot     int := 0;
  v_tot_pag     int := 0;
  v_tot_ven     int := 0;
  v_tot_ped     int := 0;
  v_tot_rec     int := 0;
  v_tot_adj     int := 0;

begin

-- ══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 0: GUARDAS
-- ══════════════════════════════════════════════════════════════════════════════

if to_regclass('public.negocios') is null then
  raise exception '[G1] Schema relacional ausente. Ejecuta 03-schema-relacional.sql primero.';
end if;

if to_regclass('public.user_data') is null then
  raise exception '[G2] Tabla user_data no encontrada. Verifica que estás en CLEO Pruebas.';
end if;

if exists (
  select 1 from public.negocios where schema_ver is distinct from 'blob'
) then
  raise exception
    '[G3] Existen negocios con schema_ver != ''blob''. '
    'Este script solo corre mientras schema_ver=''blob''.';
end if;

select id into v_user_id
  from auth.users where email = v_test_email limit 1;

if v_user_id is null then
  raise exception
    '[G4] No se encontró el usuario % en auth.users. '
    'Crea la cuenta en CLEO Pruebas y vuelve a ejecutar.', v_test_email;
end if;

raise notice 'GUARDAS OK. Usuario: %', v_user_id;


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 1: BLOB FICTICIO EN user_data
-- Si ya existe, lo conserva (ON CONFLICT DO NOTHING).
-- El blob cubre todos los casos de prueba:
--   - clientes 9001–9005 con diferentes etapas
--   - cot_9001: pipeline Servicios (Pendiente), vinculadaOportunidadActual:true
--   - cot_9002: pipeline Servicios (Aceptada, con pagos y configPostVenta)
--   - cot_9003: cotización independiente (vinculadaOportunidadActual:false)
--   - vta_9001: tipo 'especifico' → normal; vta_9002: tipo 'dia' → rapida
--   - recordatorio CON id y recordatorio SIN id (solo fecha)
--   - cliente con seguimientoFecha (pendiente P5)
--   - cot_9003 con seguimientoFecha (pendiente P6)
-- ══════════════════════════════════════════════════════════════════════════════

insert into public.user_data (user_id, data, tipo_perfil)
values (
  v_user_id,
  $blob${
    "cleo_tipo_perfil": "servicios",
    "cleo_perfil": {
      "nombre":              "Prueba Copia SA",
      "tuNombre":            "Ana Prueba",
      "tipoPerfil":          "servicios",
      "color":               "#3B7FC4",
      "colorSecundario":     "#E8F0FA",
      "colorTexto":          "#1A2E4A",
      "banco":               "BBVA",
      "bancotitular":        "Ana Prueba",
      "bancoclabe":          "012000015555555558",
      "bancoaccount":        "55-5555-5555",
      "bancotarjeta":        "",
      "bancoinstrucciones":  "",
      "telefono":            "5550001111",
      "email":               "ana@prueba.test",
      "direccion":           "Ciudad de México",
      "logo":                "",
      "mensaje":             "Gracias por tu confianza.",
      "condicionesPago":     "50% anticipo, 50% al entregar.",
      "redesTT": "", "redesIG": "@prueba", "redesFB": ""
    },
    "cleo_alertas_cerradas": ["alerta_bienvenida"],
    "cleo_etapas_vistas":    ["Cotizacion enviada", "Negociacion", "Ganado"],
    "cleo_streak_accion_serv": null,
    "cleo_streak_accion_prod": null,
    "cleo_productos": [],
    "cleo_servicios": [
      { "id": 501, "nombre": "Diseño web",             "precio": 8000,  "descripcion": "Sitio web corporativo 5 páginas", "condiciones": "" },
      { "id": 502, "nombre": "Fotografía corporativa", "precio": 12000, "descripcion": "Sesión completa 4 horas",          "condiciones": "" }
    ],
    "cleo_productos_cat": [],
    "cleo_pedidos": [],
    "cleo_cots": [
      {
        "id":          "cot_9001",
        "clienteId":   9002,
        "items":       [{"id":"it_001","nombre":"Diseño web","cantidad":1,"precioUnitario":8000,"total":8000}],
        "subtotal":    8000, "monto": 8000,
        "descuento":   "", "tipoDescuento": "porcentaje",
        "anticipo": "", "vigencia": "", "vigenciaDias": "",
        "tipoPago":    "anticipo",
        "notas": "", "etiqueta": "",
        "svCondiciones": "", "svCondicionesHtml": "",
        "estatus":     "Pendiente",
        "fecha":       "2026-07-06",
        "pagos":       [],
        "vinculadaOportunidadActual": true
      },
      {
        "id":           "cot_9002",
        "clienteId":    9003,
        "items":        [{"id":"it_002","nombre":"Fotografía corporativa","cantidad":1,"precioUnitario":12000,"total":12000}],
        "subtotal":     12000, "monto": 12000,
        "descuento":    "", "tipoDescuento": "porcentaje",
        "anticipo": "", "vigencia": "", "vigenciaDias": "",
        "tipoPago":     "completo",
        "notas": "", "etiqueta": "",
        "svCondiciones": "", "svCondicionesHtml": "",
        "estatus":      "Aceptada",
        "fecha":        "2026-07-10",
        "fechaCierre":  "2026-08-15",
        "fechaHoraCierre": "2026-08-15T10:30:00.000Z",
        "itemsAceptacion":  [{"id":"it_002","nombre":"Fotografía corporativa","cantidad":1,"precioUnitario":12000,"total":12000}],
        "montoAceptacion":  12000,
        "configPostVenta":  {"pago":"resuelto","seguimiento":"pendiente"},
        "pagos": [
          {"id":"pg_9002a","monto":6000,"fecha":"2026-08-15","concepto":"Anticipo 50%"},
          {"id":"pg_9002b","monto":6000,"fecha":"2026-09-01","concepto":"Saldo final"}
        ],
        "vinculadaOportunidadActual": true
      },
      {
        "id":          "cot_9003",
        "clienteId":   9005,
        "items":       [{"id":"it_003","nombre":"Branding completo","cantidad":1,"precioUnitario":15000,"total":15000}],
        "subtotal":    15000, "monto": 15000,
        "descuento":   "", "tipoDescuento": "porcentaje",
        "anticipo": "", "vigencia": "30", "vigenciaDias": 30,
        "tipoPago":    "anticipo",
        "notas":       "Proyecto integral de marca", "etiqueta": "",
        "svCondiciones": "", "svCondicionesHtml": "",
        "seguimientoFecha": "2026-09-28",
        "estatus":     "Pendiente",
        "fecha":       "2026-08-05",
        "pagos":       [],
        "vinculadaOportunidadActual": false
      }
    ],
    "cleo_ventas": [
      {
        "id":          "vta_9001",
        "clienteId":   9003,
        "concepto":    "Retoque de fotos adicionales",
        "monto":       2500, "tipo": "especifico",
        "fecha":       "2026-09-05",
        "etiqueta": "", "notas": "",
        "tipoPago":    "completo",
        "entregado":   true, "fechaEntrega": "2026-09-05",
        "pagos": [
          {"id":"pg_v9001","monto":2500,"fecha":"2026-09-05","concepto":"Pago completo"}
        ]
      },
      {
        "id":          "vta_9002",
        "clienteId":   null,
        "concepto":    "Sesión rápida sin cliente",
        "monto":       1500, "tipo": "dia",
        "fecha":       "2026-09-10",
        "etiqueta": "", "notas": "",
        "pagos": [
          {"id":"pg_v9002","monto":1500,"fecha":"2026-09-10","concepto":"Pago completo"}
        ]
      }
    ],
    "cleo_clientes": [
      {
        "id": 9001, "nombre": "Cliente Activo",
        "negocio": "Empresa A", "contacto": "5551110001",
        "email": "", "instagram": "", "messenger": "",
        "origen": "Referido", "etapa": "Nuevo contacto",
        "notas": "Interesado en diseño web",
        "fecha": "2026-07-01", "fechaEtapa": "2026-07-01",
        "ultimoContacto": "2026-07-01", "canalPrincipal": "WhatsApp",
        "recordatorios": []
      },
      {
        "id": 9002, "nombre": "Cliente Con Cotización",
        "negocio": "Empresa B", "contacto": "5551110002",
        "email": "", "instagram": "@empresab", "messenger": "",
        "origen": "Instagram", "etapa": "Cotizacion enviada",
        "notas": "",
        "fecha": "2026-07-05", "fechaEtapa": "2026-07-06",
        "ultimoContacto": "2026-07-06", "canalPrincipal": "WhatsApp",
        "recordatorios": [
          {
            "id":   "r_900200001",
            "fecha": "2026-09-25",
            "nota": "Confirmar si recibió la cotización",
            "esPersonalizada": false, "origen": "cleo", "categoria": "pipeline"
          }
        ]
      },
      {
        "id": 9003, "nombre": "Cliente Ganado",
        "negocio": "Empresa C", "contacto": "5551110003",
        "email": "c@empresa.test", "instagram": "", "messenger": "",
        "origen": "Facebook", "etapa": "Ganado",
        "notas": "",
        "fecha": "2026-06-01", "fechaEtapa": "2026-08-15",
        "ultimoContacto": "2026-08-15", "canalPrincipal": "WhatsApp",
        "recordatorios": []
      },
      {
        "id": 9004, "nombre": "Cliente Perdido",
        "negocio": "Empresa D", "contacto": "5551110004",
        "email": "", "instagram": "", "messenger": "",
        "origen": "Recomendación", "etapa": "Perdido",
        "notas": "No llegó a un acuerdo de precio",
        "fecha": "2026-05-10", "fechaEtapa": "2026-07-20",
        "ultimoContacto": "2026-07-20",
        "archivado": true, "motivoPerdida": "Precio fuera de rango",
        "canalPrincipal": "WhatsApp",
        "recordatorios": []
      },
      {
        "id": 9005, "nombre": "Cliente Cot Independiente",
        "negocio": "Empresa E", "contacto": "5551110005",
        "email": "", "instagram": "", "messenger": "",
        "origen": "Otro", "etapa": "Nuevo contacto",
        "notas": "Pipeline sin avance; hay una cotización independiente",
        "fecha": "2026-08-01", "fechaEtapa": "2026-08-01",
        "ultimoContacto": "2026-08-01",
        "seguimientoFecha": "2026-09-30",
        "mensajeSeguimientoPostVenta": "Revisar avance del proyecto de branding",
        "canalPrincipal": "WhatsApp",
        "recordatorios": [
          {
            "fecha": "2026-09-15",
            "nota": "Sin campo id — solo fecha como identificador",
            "esPersonalizada": true, "origen": "cleo", "categoria": "manual"
          }
        ]
      }
    ]
  }$blob$::jsonb,
  'servicios'
)
on conflict (user_id) do nothing;

get diagnostics v_n = row_count;
if v_n = 0 then
  raise notice 'BLOB: user_data ya existía para %. Se usa el existente.', v_test_email;
else
  raise notice 'BLOB: insertado para %.', v_test_email;
end if;

select data into v_blob from public.user_data where user_id = v_user_id;
if v_blob is null then
  raise exception '[B1] No se pudo leer user_data para %.', v_user_id;
end if;

v_tipo_perfil := coalesce(
  v_blob ->> 'cleo_tipo_perfil',
  (v_blob -> 'cleo_perfil') ->> 'tipoPerfil',
  'servicios'
);
v_perfil := coalesce(v_blob -> 'cleo_perfil', '{}'::jsonb);

raise notice 'BLOB: tipo_perfil=%, clientes=%, cotizaciones=%, ventas=%, pedidos=%',
  v_tipo_perfil,
  jsonb_array_length(coalesce(v_blob -> 'cleo_clientes', '[]')),
  jsonb_array_length(coalesce(v_blob -> 'cleo_cots',     '[]')),
  jsonb_array_length(coalesce(v_blob -> 'cleo_ventas',   '[]')),
  jsonb_array_length(coalesce(v_blob -> 'cleo_pedidos',  '[]'));


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 2: NEGOCIOS
-- ══════════════════════════════════════════════════════════════════════════════

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
  raise notice 'NEGOCIOS: ya existía (id=%). Se usa el existente.', v_neg_id;
else
  raise notice 'NEGOCIOS: insertado (id=%).', v_neg_id;
end if;


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 3: CATÁLOGO
-- unique (negocio_id, modo, cleo_id): incluye modo para evitar colisiones
-- entre los catálogos de Servicios y Productos dentro del mismo negocio.
-- ══════════════════════════════════════════════════════════════════════════════

for v_cli in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_servicios', '[]'))
loop
  insert into public.catalogo_items (negocio_id, cleo_id, modo, nombre, precio, descripcion, condiciones)
  values (
    v_neg_id,
    v_cli ->> 'id',
    'servicios',
    coalesce(v_cli ->> 'nombre',      ''),
    coalesce((v_cli ->> 'precio')::numeric, 0),
    coalesce(v_cli ->> 'descripcion', null),
    coalesce(v_cli ->> 'condiciones', null)
  )
  on conflict (negocio_id, modo, cleo_id) do nothing;
  get diagnostics v_n = row_count;
  v_tot_cat := v_tot_cat + v_n;
end loop;

for v_cli in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_productos_cat', '[]'))
loop
  insert into public.catalogo_items (negocio_id, cleo_id, modo, nombre, precio, descripcion, condiciones)
  values (
    v_neg_id,
    v_cli ->> 'id',
    'productos',
    coalesce(v_cli ->> 'nombre',      ''),
    coalesce((v_cli ->> 'precio')::numeric, 0),
    coalesce(v_cli ->> 'descripcion', null),
    coalesce(v_cli ->> 'condiciones', null)
  )
  on conflict (negocio_id, modo, cleo_id) do nothing;
  get diagnostics v_n = row_count;
  v_tot_cat := v_tot_cat + v_n;
end loop;

raise notice 'CATÁLOGO: % ítems insertados.', v_tot_cat;


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 4: CLIENTES
-- clientes.created_at recibe la fecha de alta del blob (campo 'fecha').
-- Esto preserva la fecha original; no es una pendiente.
-- ══════════════════════════════════════════════════════════════════════════════

for v_cli in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_clientes', '[]'))
loop
  insert into public.clientes (
    negocio_id, cleo_id,
    nombre, empresa, telefono, email, instagram, messenger, canal,
    origen, etapa, fecha_etapa, estado_prospecto,
    motivo_perdida, razon_cierre, ultimo_contacto,
    notas, etiqueta, nota_recontacto,
    fecha_pedido, servicio_interes, items_interes,
    mensaje_seguimiento, seguimiento_custom,
    created_at
  )
  values (
    v_neg_id,
    v_cli ->> 'id',
    coalesce(v_cli ->> 'nombre',          ''),
    coalesce(v_cli ->> 'negocio',          null),
    coalesce(v_cli ->> 'contacto',         null),
    coalesce(v_cli ->> 'email',            null),
    coalesce(v_cli ->> 'instagram',        null),
    coalesce(v_cli ->> 'messenger',        null),
    coalesce(v_cli ->> 'canalPrincipal',   null),
    coalesce(v_cli ->> 'origen',           null),
    coalesce(v_cli ->> 'etapa',            null),
    coalesce((v_cli ->> 'fechaEtapa')::date, null),
    coalesce(v_cli ->> 'estadoProspecto',  null),
    coalesce(v_cli ->> 'motivoPerdida',    null),
    case when v_cli -> 'razonCierre' is not null
         then array(select jsonb_array_elements_text(v_cli -> 'razonCierre'))
         else null end,
    coalesce((v_cli ->> 'ultimoContacto')::date, null),
    coalesce(v_cli ->> 'notas',            null),
    coalesce(v_cli ->> 'etiqueta',         null),
    coalesce(v_cli ->> 'notaRecontacto',   null),
    coalesce((v_cli ->> 'fechaPedido')::date, null),
    coalesce(v_cli ->> 'servicioInteres',  null),
    coalesce(v_cli -> 'itemsInteres',      null),
    coalesce(v_cli ->> 'mensajeSeguimiento', null),
    coalesce((v_cli ->> 'seguimientoCustom')::boolean, false),
    coalesce((v_cli ->> 'fecha')::timestamptz, now())
  )
  on conflict (negocio_id, cleo_id) do nothing;
  get diagnostics v_n = row_count;
  v_tot_cli := v_tot_cli + v_n;
end loop;

raise notice 'CLIENTES: % insertados.', v_tot_cli;


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 5: OPORTUNIDADES
-- 5a: Una por cliente (oportunidad principal del pipeline).
-- 5b: Una por cotización independiente (vinculadaOportunidadActual=false).
--
-- REGLA archivado: si cliente.archivado=true, estatus='perdida' aunque
-- etapa diga otra cosa. Se lee del blob directamente, sin reconstruir.
--
-- NOTA: si un cliente tuviera dos cotizaciones pipeline, ambas intentarían
-- vincularse a la misma oportunidad principal y violarían uq_cot_oportunidad.
-- El bloque 6 maneja ese caso: la segunda cotización se inserta con
-- oportunidad_id=NULL y emite un NOTICE. Ver PENDIENTE P9.
-- ══════════════════════════════════════════════════════════════════════════════

-- 5a: Oportunidad principal por cliente
for v_cli in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_clientes', '[]'))
loop
  select id into v_cliente_uuid
    from public.clientes
   where negocio_id = v_neg_id and cleo_id = (v_cli ->> 'id');

  if v_cliente_uuid is null then
    raise notice 'OPORTUNIDADES 5a: cliente cleo_id=% no encontrado, saltando.', v_cli ->> 'id';
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
    v_neg_id,
    'op_cli_' || (v_cli ->> 'id'),
    v_cliente_uuid,
    v_tipo_perfil,
    -- titulo: servicioInteres (Servicios) o productoInteres (Productos)
    coalesce(
      case when v_tipo_perfil = 'servicios' then v_cli ->> 'servicioInteres'
           else v_cli ->> 'productoInteres' end,
      ''
    ),
    -- estatus: archivado prevalece sobre etapa
    case
      when (v_cli ->> 'archivado')::boolean is true
        then 'perdida'
      when v_tipo_perfil = 'servicios' then
        case v_cli ->> 'etapa'
          when 'Ganado'  then 'ganada'
          when 'Perdido' then 'perdida'
          else 'activa'
        end
      else -- productos
        case v_cli ->> 'estadoProspecto'
          when 'Convertido' then 'ganada'
          when 'Perdido'    then 'perdida'
          else 'activa'
        end
    end,
    -- etapa relacional
    case
      when (v_cli ->> 'archivado')::boolean is true
        then 'perdido'
      when v_tipo_perfil = 'servicios' then
        case v_cli ->> 'etapa'
          when 'Ganado'              then 'ganado'
          when 'Perdido'             then 'perdido'
          when 'Cotizacion enviada'  then 'cotizacion_enviada'
          when 'Negociacion'         then 'negociacion'
          else 'nuevo_contacto'   -- 'Nuevo contacto' y valores legacy
        end
      else -- productos
        case v_cli ->> 'estadoProspecto'
          when 'Convertido'    then 'convertido'
          when 'Perdido'       then 'perdido'
          when 'En seguimiento' then 'en_seguimiento'
          when 'Sin respuesta'  then 'sin_respuesta'
          else 'nueva'
        end
    end,
    coalesce((v_cli ->> 'precioInteres')::numeric, null),
    coalesce(v_cli ->> 'motivoPerdida', null),
    -- fecha de inicio de la oportunidad: fechaEtapa o fecha de alta del cliente
    coalesce(
      (v_cli ->> 'fechaEtapa')::date,
      (v_cli ->> 'fecha')::date,
      current_date
    ),
    coalesce((v_cli ->> 'fechaEtapa')::date, null),
    coalesce((v_cli ->> 'ultimoContacto')::date, null),
    -- fecha_cierre solo para oportunidades terminadas
    case
      when (v_cli ->> 'archivado')::boolean is true
            or v_cli ->> 'etapa' in ('Ganado','Perdido')
            or v_cli ->> 'estadoProspecto' in ('Convertido','Perdido')
        then coalesce((v_cli ->> 'fechaEtapa')::date, null)
      else null
    end,
    'migrada_vinculada'
  )
  on conflict (negocio_id, cleo_id) do nothing;
  get diagnostics v_n = row_count;
  v_tot_op := v_tot_op + v_n;
end loop;

-- 5b: Oportunidades para cotizaciones independientes
for v_cot in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_cots', '[]'))
  where (value ->> 'vinculadaOportunidadActual') = 'false'
     or value -> 'vinculadaOportunidadActual' = 'false'::jsonb
loop
  select id into v_cliente_uuid
    from public.clientes
   where negocio_id = v_neg_id and cleo_id = (v_cot ->> 'clienteId');

  if v_cliente_uuid is null then
    raise notice 'OPORTUNIDADES 5b: cliente cleo_id=% no encontrado, saltando.', v_cot ->> 'clienteId';
    continue;
  end if;

  insert into public.oportunidades (
    negocio_id, cleo_id, cliente_id, modo,
    titulo, estatus, etapa,
    fecha, fecha_cierre,
    origen_migracion
  )
  values (
    v_neg_id,
    'op_cotindep_' || (v_cot ->> 'id'),
    v_cliente_uuid,
    v_tipo_perfil,
    coalesce(
      (v_cot -> 'items' -> 0) ->> 'nombre',
      v_cot ->> 'notas',
      'Cotización ' || (v_cot ->> 'id')
    ),
    case
      when v_cot ->> 'estatus' = 'Aceptada'                          then 'ganada'
      when v_cot ->> 'estatus' in ('Rechazada','Cancelada')           then 'perdida'
      else 'activa'
    end,
    case
      when v_cot ->> 'estatus' = 'Aceptada' then
        case when v_tipo_perfil = 'productos' then 'convertido' else 'ganado' end
      when v_cot ->> 'estatus' in ('Rechazada','Cancelada')           then 'perdido'
      else
        case when v_tipo_perfil = 'productos' then 'en_seguimiento' else 'cotizacion_enviada' end
    end,
    coalesce((v_cot ->> 'fecha')::date, current_date),
    case
      when v_cot ->> 'estatus' = 'Aceptada'                          then coalesce((v_cot ->> 'fechaCierre')::date, null)
      when v_cot ->> 'estatus' in ('Rechazada','Cancelada')           then coalesce((v_cot ->> 'fechaRechazo')::date, (v_cot ->> 'fecha')::date, null)
      else null
    end,
    'migrada_cotindep'
  )
  on conflict (negocio_id, cleo_id) do nothing;
  get diagnostics v_n = row_count;
  v_tot_op := v_tot_op + v_n;
end loop;

raise notice 'OPORTUNIDADES: % insertadas (incluye cotindep).', v_tot_op;


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 6: COTIZACIONES + PAGOS
-- Si dos cotizaciones de un cliente son ambas "pipeline" (vinculadaOportunidadActual!=false),
-- la segunda no puede vincularse a la misma oportunidad (uq_cot_oportunidad).
-- Se maneja con EXCEPTION: la segunda se inserta con oportunidad_id=NULL y emite NOTICE.
-- ══════════════════════════════════════════════════════════════════════════════

for v_cot in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_cots', '[]'))
loop
  -- Resolver cliente
  v_cliente_uuid := null;
  if (v_cot ->> 'clienteId') is not null then
    select id into v_cliente_uuid
      from public.clientes
     where negocio_id = v_neg_id and cleo_id = (v_cot ->> 'clienteId');
  end if;

  -- Resolver oportunidad según tipo de cotización
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

    select id into v_op_uuid
      from public.oportunidades
     where negocio_id = v_neg_id and cleo_id = v_op_cleo;
  end;

  -- Intentar insertar con oportunidad_id; si viola uq_cot_oportunidad → sin oportunidad
  begin
    insert into public.cotizaciones (
      negocio_id, cleo_id, cliente_id, oportunidad_id, oportunidad_vinculada,
      items, subtotal, monto, descuento, tipo_descuento,
      anticipo, fecha_anticipo,
      vigencia, vigencia_dias, tipo_pago,
      sv_condiciones, sv_condiciones_html,
      notas, etiqueta,
      estatus, fecha, fecha_envio, fecha_cierre, fecha_hora_cierre,
      fecha_rechazo, fecha_hora_rechazo,
      items_aceptacion, monto_aceptacion,
      postv_pago, postv_seguimiento
    )
    values (
      v_neg_id,
      v_cot ->> 'id',
      v_cliente_uuid,
      v_op_uuid,
      v_op_uuid is not null,
      coalesce(v_cot -> 'items',              '[]'),
      coalesce((v_cot ->> 'subtotal')::numeric, 0),
      coalesce((v_cot ->> 'monto')::numeric,    0),
      coalesce(nullif(v_cot ->> 'descuento', '')::numeric, 0),
      case when v_cot ->> 'tipoDescuento' in ('porcentaje','monto')
           then v_cot ->> 'tipoDescuento' else null end,
      coalesce(nullif(v_cot ->> 'anticipo', '')::numeric, 0),
      coalesce((v_cot ->> 'fechaAnticipo')::date, null),
      coalesce(nullif(v_cot ->> 'vigencia', ''),  null),
      nullif(v_cot ->> 'vigenciaDias', '')::int,
      coalesce(v_cot ->> 'tipoPago',              null),
      coalesce(nullif(v_cot ->> 'svCondiciones', ''),     null),
      coalesce(nullif(v_cot ->> 'svCondicionesHtml', ''), null),
      coalesce(v_cot ->> 'notas',    null),
      coalesce(v_cot ->> 'etiqueta', null),
      coalesce(v_cot ->> 'estatus',  'Pendiente'),
      coalesce((v_cot ->> 'fecha')::date,            null),
      coalesce((v_cot ->> 'fechaEnvio')::date,       null),
      coalesce((v_cot ->> 'fechaCierre')::date,      null),
      coalesce((v_cot ->> 'fechaHoraCierre')::timestamptz,  null),
      coalesce((v_cot ->> 'fechaRechazo')::date,     null),
      coalesce((v_cot ->> 'fechaHoraRechazo')::timestamptz, null),
      coalesce(v_cot -> 'itemsAceptacion',    null),
      coalesce((v_cot ->> 'montoAceptacion')::numeric, null),
      coalesce((v_cot -> 'configPostVenta') ->> 'pago',        null),
      coalesce((v_cot -> 'configPostVenta') ->> 'seguimiento', null)
    )
    on conflict (negocio_id, cleo_id) do nothing;
    get diagnostics v_n = row_count;
    v_tot_cot := v_tot_cot + v_n;

  exception when unique_violation then
    -- uq_cot_oportunidad: la oportunidad ya tiene una cotización vinculada.
    -- Insertar sin oportunidad_id para preservar el registro sin sobreescribir. (P9)
    raise notice 'COT %: oportunidad % ya vinculada a otra cotización. Insertada con oportunidad_id=NULL.',
      v_cot ->> 'id', v_op_uuid;
    insert into public.cotizaciones (
      negocio_id, cleo_id, cliente_id, oportunidad_id, oportunidad_vinculada,
      items, subtotal, monto, descuento, tipo_descuento,
      anticipo, fecha_anticipo,
      vigencia, vigencia_dias, tipo_pago,
      sv_condiciones, sv_condiciones_html,
      notas, etiqueta,
      estatus, fecha, fecha_envio, fecha_cierre, fecha_hora_cierre,
      fecha_rechazo, fecha_hora_rechazo,
      items_aceptacion, monto_aceptacion,
      postv_pago, postv_seguimiento
    )
    values (
      v_neg_id,
      v_cot ->> 'id',
      v_cliente_uuid,
      null,   -- sin oportunidad
      false,
      coalesce(v_cot -> 'items',              '[]'),
      coalesce((v_cot ->> 'subtotal')::numeric, 0),
      coalesce((v_cot ->> 'monto')::numeric,    0),
      coalesce(nullif(v_cot ->> 'descuento', '')::numeric, 0),
      case when v_cot ->> 'tipoDescuento' in ('porcentaje','monto')
           then v_cot ->> 'tipoDescuento' else null end,
      coalesce(nullif(v_cot ->> 'anticipo', '')::numeric, 0),
      coalesce((v_cot ->> 'fechaAnticipo')::date, null),
      coalesce(nullif(v_cot ->> 'vigencia', ''),  null),
      nullif(v_cot ->> 'vigenciaDias', '')::int,
      coalesce(v_cot ->> 'tipoPago',              null),
      coalesce(nullif(v_cot ->> 'svCondiciones', ''),     null),
      coalesce(nullif(v_cot ->> 'svCondicionesHtml', ''), null),
      coalesce(v_cot ->> 'notas',    null),
      coalesce(v_cot ->> 'etiqueta', null),
      coalesce(v_cot ->> 'estatus',  'Pendiente'),
      coalesce((v_cot ->> 'fecha')::date,            null),
      coalesce((v_cot ->> 'fechaEnvio')::date,       null),
      coalesce((v_cot ->> 'fechaCierre')::date,      null),
      coalesce((v_cot ->> 'fechaHoraCierre')::timestamptz,  null),
      coalesce((v_cot ->> 'fechaRechazo')::date,     null),
      coalesce((v_cot ->> 'fechaHoraRechazo')::timestamptz, null),
      coalesce(v_cot -> 'itemsAceptacion',    null),
      coalesce((v_cot ->> 'montoAceptacion')::numeric, null),
      coalesce((v_cot -> 'configPostVenta') ->> 'pago',        null),
      coalesce((v_cot -> 'configPostVenta') ->> 'seguimiento', null)
    )
    on conflict (negocio_id, cleo_id) do nothing;
    get diagnostics v_n = row_count;
    v_tot_cot := v_tot_cot + v_n;
  end;

  -- Pagos de la cotización
  select id into v_cot_uuid
    from public.cotizaciones
   where negocio_id = v_neg_id and cleo_id = (v_cot ->> 'id');

  if v_cot_uuid is not null then
    for v_pago in
      select value from jsonb_array_elements(coalesce(v_cot -> 'pagos', '[]'))
    loop
      insert into public.pagos (negocio_id, cleo_id, cotizacion_id, monto, fecha, concepto)
      values (
        v_neg_id,
        v_pago ->> 'id',
        v_cot_uuid,
        coalesce((v_pago ->> 'monto')::numeric, 0),
        coalesce((v_pago ->> 'fecha')::date, current_date),
        coalesce(v_pago ->> 'concepto', null)
      )
      on conflict (negocio_id, cleo_id) do nothing;
      get diagnostics v_n = row_count;
      v_tot_pag := v_tot_pag + v_n;
    end loop;
  end if;
end loop;

raise notice 'COTIZACIONES: % insertadas, % pagos.', v_tot_cot, v_tot_pag;


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 7: VENTAS + PAGOS
-- tipo 'especifico' → 'normal'; cualquier otro → 'rapida'.
-- ventas.tipoPago, entregado, fechaEntrega: no tienen columna. Ver P1–P3.
-- ══════════════════════════════════════════════════════════════════════════════

for v_venta in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_ventas', '[]'))
loop
  v_cliente_uuid := null;
  if (v_venta ->> 'clienteId') is not null then
    select id into v_cliente_uuid
      from public.clientes
     where negocio_id = v_neg_id and cleo_id = (v_venta ->> 'clienteId');
  end if;

  insert into public.ventas (
    negocio_id, cleo_id, cliente_id,
    concepto, items, monto, tipo,
    notas, etiqueta, fecha,
    postv_pago, postv_seguimiento
  )
  values (
    v_neg_id,
    v_venta ->> 'id',
    v_cliente_uuid,
    coalesce(v_venta ->> 'concepto',  null),
    coalesce(v_venta -> 'items',      '[]'),
    coalesce((v_venta ->> 'monto')::numeric, 0),
    case when v_venta ->> 'tipo' = 'especifico' then 'normal' else 'rapida' end,
    coalesce(v_venta ->> 'notas',     null),
    coalesce(v_venta ->> 'etiqueta',  null),
    coalesce((v_venta ->> 'fecha')::date, null),
    coalesce((v_venta -> 'configPostVenta') ->> 'pago',        null),
    coalesce((v_venta -> 'configPostVenta') ->> 'seguimiento', null)
  )
  on conflict (negocio_id, cleo_id) do nothing;
  get diagnostics v_n = row_count;
  v_tot_ven := v_tot_ven + v_n;

  select id into v_ven_uuid
    from public.ventas where negocio_id = v_neg_id and cleo_id = (v_venta ->> 'id');

  if v_ven_uuid is not null then
    for v_pago in
      select value from jsonb_array_elements(coalesce(v_venta -> 'pagos', '[]'))
    loop
      insert into public.pagos (negocio_id, cleo_id, venta_id, monto, fecha, concepto)
      values (
        v_neg_id,
        v_pago ->> 'id',
        v_ven_uuid,
        coalesce((v_pago ->> 'monto')::numeric, 0),
        coalesce((v_pago ->> 'fecha')::date, current_date),
        coalesce(v_pago ->> 'concepto', null)
      )
      on conflict (negocio_id, cleo_id) do nothing;
      get diagnostics v_n = row_count;
      v_tot_pag := v_tot_pag + v_n;
    end loop;
  end if;
end loop;

raise notice 'VENTAS: % insertadas.', v_tot_ven;


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 8: PEDIDOS + PAGOS
-- ══════════════════════════════════════════════════════════════════════════════

for v_pedido in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_pedidos', '[]'))
loop
  v_cliente_uuid := null;
  if (v_pedido ->> 'clienteId') is not null then
    select id into v_cliente_uuid
      from public.clientes
     where negocio_id = v_neg_id and cleo_id = (v_pedido ->> 'clienteId');
  end if;

  declare
    v_cot_id_ped uuid;
    v_op_id_ped  uuid;
  begin
    if (v_pedido ->> 'cotizacionId') is not null then
      select id into v_cot_id_ped
        from public.cotizaciones
       where negocio_id = v_neg_id and cleo_id = (v_pedido ->> 'cotizacionId');
    end if;

    if v_cliente_uuid is not null then
      select id into v_op_id_ped
        from public.oportunidades
       where negocio_id = v_neg_id
         and cleo_id    = 'op_cli_' || (v_pedido ->> 'clienteId');
    end if;

    insert into public.pedidos (
      negocio_id, cleo_id, cliente_id, cotizacion_id, oportunidad_id,
      origen_venta, items, productos, cantidad, monto_total,
      notas, etiqueta, estado_pedido,
      fecha, fecha_entrega, fecha_cancelacion,
      anticipo_conservado, motivo_cancelacion, motivo_cancelacion_lado,
      items_confirmacion, monto_confirmacion,
      postv_pago, postv_seguimiento
    )
    values (
      v_neg_id,
      v_pedido ->> 'id',
      v_cliente_uuid,
      v_cot_id_ped,
      v_op_id_ped,
      coalesce(v_pedido ->> 'origenVenta', 'registro_manual'),
      coalesce(v_pedido -> 'items',         '[]'),
      coalesce(v_pedido ->> 'productos',     null),
      coalesce((v_pedido ->> 'cantidad')::int, 0),
      coalesce((v_pedido ->> 'total')::numeric, 0),
      coalesce(v_pedido ->> 'notas',            null),
      coalesce(v_pedido ->> 'etiqueta',         null),
      coalesce(v_pedido ->> 'estadoPedido',     'preparando'),
      coalesce((v_pedido ->> 'fecha')::date,            null),
      coalesce((v_pedido ->> 'fechaEntrega')::date,     null),
      coalesce((v_pedido ->> 'fechaCancelacion')::date, null),
      coalesce((v_pedido ->> 'anticipoConservado')::boolean, null),
      coalesce(v_pedido ->> 'motivoCancelacion', null),
      case when v_pedido ->> 'motivoCancelacionLado' in ('cliente','negocio')
           then v_pedido ->> 'motivoCancelacionLado' else null end,
      coalesce(v_pedido -> 'itemsConfirmacion',              null),
      coalesce((v_pedido ->> 'montoConfirmacion')::numeric,  null),
      coalesce((v_pedido -> 'configPostVenta') ->> 'pago',        null),
      coalesce((v_pedido -> 'configPostVenta') ->> 'seguimiento', null)
    )
    on conflict (negocio_id, cleo_id) do nothing;
    get diagnostics v_n = row_count;
    v_tot_ped := v_tot_ped + v_n;
  end;

  select id into v_ped_uuid
    from public.pedidos where negocio_id = v_neg_id and cleo_id = (v_pedido ->> 'id');

  if v_ped_uuid is not null then
    for v_pago in
      select value from jsonb_array_elements(coalesce(v_pedido -> 'pagos', '[]'))
    loop
      insert into public.pagos (negocio_id, cleo_id, pedido_id, monto, fecha, concepto)
      values (
        v_neg_id,
        v_pago ->> 'id',
        v_ped_uuid,
        coalesce((v_pago ->> 'monto')::numeric, 0),
        coalesce((v_pago ->> 'fecha')::date, current_date),
        coalesce(v_pago ->> 'concepto', null)
      )
      on conflict (negocio_id, cleo_id) do nothing;
      get diagnostics v_n = row_count;
      v_tot_pag := v_tot_pag + v_n;
    end loop;
  end if;
end loop;

raise notice 'PEDIDOS: % insertados. PAGOS total acumulado: %.', v_tot_ped, v_tot_pag;


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 9: RECORDATORIOS
-- Identificador: r.id si existe; NULL si no (no se inventa cleo_id desde fecha).
-- Categoría desconocida → 'sin_clasificar'.
-- Recordatorios 'pipeline' se vinculan a la oportunidad principal del cliente.
-- ══════════════════════════════════════════════════════════════════════════════

for v_cli in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_clientes', '[]'))
loop
  select id into v_cliente_uuid
    from public.clientes
   where negocio_id = v_neg_id and cleo_id = (v_cli ->> 'id');

  if v_cliente_uuid is null then continue; end if;

  for v_rec in
    select value from jsonb_array_elements(coalesce(v_cli -> 'recordatorios', '[]'))
  loop
    declare
      v_rec_cleo_id   text;
      v_rec_op_id     uuid;
      v_rec_categoria text;
    begin
      v_rec_cleo_id   := coalesce(v_rec ->> 'id', null);  -- NULL si no tiene id

      v_rec_categoria := coalesce(v_rec ->> 'categoria', 'manual');
      if v_rec_categoria not in ('pipeline','postventa','reactivacion','manual','sin_clasificar') then
        v_rec_categoria := 'sin_clasificar';
      end if;

      v_rec_op_id := null;
      if v_rec_categoria = 'pipeline' then
        select id into v_rec_op_id
          from public.oportunidades
         where negocio_id = v_neg_id
           and cleo_id    = 'op_cli_' || (v_cli ->> 'id');
      end if;

      insert into public.recordatorios (
        negocio_id, cleo_id, cliente_id, oportunidad_id,
        categoria, texto, fecha,
        completado, estatus,
        es_personalizada, origen
      )
      values (
        v_neg_id,
        v_rec_cleo_id,
        v_cliente_uuid,
        v_rec_op_id,
        v_rec_categoria,
        coalesce(v_rec ->> 'nota',    null),
        coalesce((v_rec ->> 'fecha')::date, null),
        false,
        'pendiente',
        coalesce((v_rec ->> 'esPersonalizada')::boolean, false),
        coalesce(v_rec ->> 'origen', null)
      )
      on conflict (negocio_id, cleo_id)
        where cleo_id is not null
      do nothing;
      get diagnostics v_n = row_count;
      v_tot_rec := v_tot_rec + v_n;
    end;
  end loop;
end loop;

raise notice 'RECORDATORIOS: % insertados.', v_tot_rec;


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 10: ARCHIVO_ADJUNTOS (solo metadatos)
-- archivo_adjuntos no tiene cleo_id. Idempotencia via WHERE NOT EXISTS
-- comparando (negocio_id, cotizacion_id, storage_path).
-- Los archivos físicos en Storage NO se tocan.
-- ══════════════════════════════════════════════════════════════════════════════

for v_cot in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_cots', '[]'))
  where value -> 'archivoAdjunto' is not null
    and value -> 'archivoAdjunto' <> 'null'::jsonb
loop
  v_adj := v_cot -> 'archivoAdjunto';

  select id into v_cot_uuid
    from public.cotizaciones
   where negocio_id = v_neg_id and cleo_id = (v_cot ->> 'id');

  if v_cot_uuid is null then continue; end if;
  if coalesce(v_adj ->> 'storagePath', v_adj ->> 'path', '') = '' then
    raise notice 'ADJUNTOS: cotización % sin storagePath, saltando.', v_cot ->> 'id';
    continue;
  end if;

  insert into public.archivo_adjuntos (
    negocio_id, cotizacion_id,
    storage_path, nombre_original, mime_type, size_bytes, version
  )
  select
    v_neg_id,
    v_cot_uuid,
    coalesce(v_adj ->> 'storagePath', v_adj ->> 'path'),
    coalesce(v_adj ->> 'nombreOriginal', v_adj ->> 'name', null),
    coalesce(v_adj ->> 'mimeType',       v_adj ->> 'type', null),
    coalesce((v_adj ->> 'sizeBytes')::int, (v_adj ->> 'size')::int, null),
    coalesce((v_adj ->> 'version')::int, 1)
  where not exists (
    select 1 from public.archivo_adjuntos
     where negocio_id    = v_neg_id
       and cotizacion_id = v_cot_uuid
       and storage_path  = coalesce(v_adj ->> 'storagePath', v_adj ->> 'path')
  );
  get diagnostics v_n = row_count;
  v_tot_adj := v_tot_adj + v_n;
end loop;

for v_pedido in
  select value from jsonb_array_elements(coalesce(v_blob -> 'cleo_pedidos', '[]'))
  where value -> 'archivoAdjunto' is not null
    and value -> 'archivoAdjunto' <> 'null'::jsonb
loop
  v_adj := v_pedido -> 'archivoAdjunto';

  select id into v_ped_uuid
    from public.pedidos
   where negocio_id = v_neg_id and cleo_id = (v_pedido ->> 'id');

  if v_ped_uuid is null then continue; end if;
  if coalesce(v_adj ->> 'storagePath', v_adj ->> 'path', '') = '' then continue; end if;

  insert into public.archivo_adjuntos (
    negocio_id, pedido_id,
    storage_path, nombre_original, mime_type, size_bytes, version
  )
  select
    v_neg_id,
    v_ped_uuid,
    coalesce(v_adj ->> 'storagePath', v_adj ->> 'path'),
    coalesce(v_adj ->> 'nombreOriginal', v_adj ->> 'name', null),
    coalesce(v_adj ->> 'mimeType',       v_adj ->> 'type', null),
    coalesce((v_adj ->> 'sizeBytes')::int, (v_adj ->> 'size')::int, null),
    coalesce((v_adj ->> 'version')::int, 1)
  where not exists (
    select 1 from public.archivo_adjuntos
     where negocio_id = v_neg_id
       and pedido_id  = v_ped_uuid
       and storage_path = coalesce(v_adj ->> 'storagePath', v_adj ->> 'path')
  );
  get diagnostics v_n = row_count;
  v_tot_adj := v_tot_adj + v_n;
end loop;

raise notice 'ADJUNTOS: % metadatos insertados.', v_tot_adj;


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 11: VERIFICACIONES
-- ══════════════════════════════════════════════════════════════════════════════

raise notice '── VERIFICACIONES ────────────────────────────';

-- V1: Conteos
declare
  v_cnt_cli int; v_cnt_op  int; v_cnt_cot int; v_cnt_pag int;
  v_cnt_ven int; v_cnt_ped int; v_cnt_rec int; v_cnt_adj int; v_cnt_cat int;
  v_cnt_cotindep int;
begin
  select count(*) into v_cnt_cli from public.clientes         where negocio_id = v_neg_id;
  select count(*) into v_cnt_op  from public.oportunidades    where negocio_id = v_neg_id;
  select count(*) into v_cnt_cot from public.cotizaciones     where negocio_id = v_neg_id;
  select count(*) into v_cnt_pag from public.pagos            where negocio_id = v_neg_id;
  select count(*) into v_cnt_ven from public.ventas           where negocio_id = v_neg_id;
  select count(*) into v_cnt_ped from public.pedidos          where negocio_id = v_neg_id;
  select count(*) into v_cnt_rec from public.recordatorios    where negocio_id = v_neg_id;
  select count(*) into v_cnt_adj from public.archivo_adjuntos where negocio_id = v_neg_id;
  select count(*) into v_cnt_cat from public.catalogo_items   where negocio_id = v_neg_id;
  select count(*) into v_cnt_cotindep
    from public.oportunidades
   where negocio_id = v_neg_id and origen_migracion = 'migrada_cotindep';

  raise notice 'V1 clientes:       % (blob: %)', v_cnt_cli,
    jsonb_array_length(coalesce(v_blob -> 'cleo_clientes', '[]'));
  raise notice 'V1 oportunidades:  % (% principales + % cotindep)',
    v_cnt_op, v_cnt_op - v_cnt_cotindep, v_cnt_cotindep;
  raise notice 'V1 cotizaciones:   % (blob: %)', v_cnt_cot,
    jsonb_array_length(coalesce(v_blob -> 'cleo_cots', '[]'));
  raise notice 'V1 pagos:          %', v_cnt_pag;
  raise notice 'V1 ventas:         % (blob: %)', v_cnt_ven,
    jsonb_array_length(coalesce(v_blob -> 'cleo_ventas', '[]'));
  raise notice 'V1 pedidos:        % (blob: %)', v_cnt_ped,
    jsonb_array_length(coalesce(v_blob -> 'cleo_pedidos', '[]'));
  raise notice 'V1 recordatorios:  %', v_cnt_rec;
  raise notice 'V1 adjuntos:       %', v_cnt_adj;
  raise notice 'V1 catalogo_items: %', v_cnt_cat;
end;

-- V2: Ninguna oportunidad sin cliente válido
declare v_op_sin_cli int; begin
  select count(*) into v_op_sin_cli
    from public.oportunidades o
    left join public.clientes c on c.id = o.cliente_id and c.negocio_id = o.negocio_id
   where o.negocio_id = v_neg_id and c.id is null;
  if v_op_sin_cli > 0 then
    raise exception 'V2 FALLA: % oportunidades sin cliente válido.', v_op_sin_cli;
  end if;
  raise notice 'V2 OK: oportunidades con cliente válido.';
end;

-- V3: Cliente de cada cotización coincide con el de su oportunidad
declare v_mismatch int; begin
  select count(*) into v_mismatch
    from public.cotizaciones c
    join public.oportunidades o on o.id = c.oportunidad_id and o.negocio_id = c.negocio_id
   where c.negocio_id = v_neg_id
     and c.cliente_id is distinct from o.cliente_id;
  if v_mismatch > 0 then
    raise exception 'V3 FALLA: % cotizaciones con cliente distinto al de su oportunidad.', v_mismatch;
  end if;
  raise notice 'V3 OK: coherencia cliente ↔ oportunidad en cotizaciones.';
end;

-- V4: Importes — suma de pagos vs. monto de cotización
declare
  v_r record; v_delta numeric;
begin
  for v_r in
    select c.cleo_id, c.monto, coalesce(sum(p.monto), 0) as suma_pag
      from public.cotizaciones c
      left join public.pagos p on p.cotizacion_id = c.id and p.negocio_id = c.negocio_id
     where c.negocio_id = v_neg_id
     group by c.cleo_id, c.monto
  loop
    v_delta := v_r.monto - v_r.suma_pag;
    raise notice 'V4 cot % monto=% pagado=% saldo=%',
      v_r.cleo_id, v_r.monto, v_r.suma_pag, v_delta;
  end loop;
end;

-- V5: Suma de pagos de ventas
declare
  v_r record;
begin
  for v_r in
    select v.cleo_id, v.monto, coalesce(sum(p.monto), 0) as suma_pag
      from public.ventas v
      left join public.pagos p on p.venta_id = v.id and p.negocio_id = v.negocio_id
     where v.negocio_id = v_neg_id
     group by v.cleo_id, v.monto
  loop
    raise notice 'V5 venta % monto=% pagado=% saldo=%',
      v_r.cleo_id, v_r.monto, v_r.suma_pag, v_r.monto - v_r.suma_pag;
  end loop;
end;

-- V6: Tipo de ventas — solo 'normal' o 'rapida'
declare v_tipo_inv int; begin
  select count(*) into v_tipo_inv
    from public.ventas
   where negocio_id = v_neg_id and tipo not in ('normal','rapida');
  if v_tipo_inv > 0 then
    raise exception 'V6 FALLA: % ventas con tipo inválido.', v_tipo_inv;
  end if;
  raise notice 'V6 OK: tipos de venta válidos.';
end;

-- V7: schema_ver intacto
declare v_sv text; begin
  select schema_ver into v_sv from public.negocios where id = v_neg_id;
  if v_sv <> 'blob' then
    raise exception 'V7 FALLA: schema_ver fue modificado a %.', v_sv;
  end if;
  raise notice 'V7 OK: schema_ver=''blob'' intacto.';
end;

-- V8: user_data.data conservado
declare v_ud_len int; begin
  select length(data::text) into v_ud_len
    from public.user_data where user_id = v_user_id;
  if v_ud_len is null or v_ud_len < 100 then
    raise warning 'V8: user_data parece vacío o muy pequeño (% chars). Revisar.', v_ud_len;
  else
    raise notice 'V8 OK: user_data.data conservado (% chars aprox).', v_ud_len;
  end if;
end;

-- V9: Cotizaciones Aceptadas tienen items_aceptacion y monto_aceptacion
declare v_sin_snap int; begin
  select count(*) into v_sin_snap
    from public.cotizaciones
   where negocio_id = v_neg_id
     and estatus = 'Aceptada'
     and (items_aceptacion is null or monto_aceptacion is null);
  if v_sin_snap > 0 then
    raise warning 'V9: % cotizaciones Aceptadas sin snapshot de aceptación.', v_sin_snap;
  else
    raise notice 'V9 OK: cotizaciones Aceptadas tienen snapshot.';
  end if;
end;


-- ══════════════════════════════════════════════════════════════════════════════
-- PENDIENTES DOCUMENTADOS
-- Campos del blob sin columna en el schema relacional actual.
-- Deben resolverse antes de activar schema_ver='dual'.
-- ══════════════════════════════════════════════════════════════════════════════

raise notice '── PENDIENTES ────────────────────────────────';
raise notice 'P1  ventas.tipoPago         — "completo"|"anticipo" — sin columna en ventas';
raise notice 'P2  ventas.entregado        — boolean — sin columna en ventas';
raise notice 'P3  ventas.fechaEntrega     — date — sin columna en ventas';
raise notice 'P4  clientes.fecha          — RESUELTO: escrito en clientes.created_at';
raise notice 'P5  clientes.seguimientoFecha + mensajeSeguimientoPostVenta';
raise notice '         pendiente: ¿crear recordatorio automático al migrar? Sin columna directa.';
raise notice 'P6  cotizaciones.seguimientoFecha — sin columna en cotizaciones';
raise notice 'P7  cotizaciones.motivoPerdida    — sin columna en cotizaciones';
raise notice 'P8  clientes[].historialContactos — no migrado en esta copia;';
raise notice '         verificar formato del blob antes de incluir en migración final.';
raise notice 'P9  cliente con múltiples cotizaciones pipeline (vinculadaOportunidadActual!=false):';
raise notice '         la segunda se insertó con oportunidad_id=NULL. Requiere diseño explícito.';
raise notice '─────────────────────────────────────────────';
raise notice 'FIN 09-copia-prueba.sql.';
raise notice 'COMMIT para conservar; ROLLBACK para descartar.';

end;
$main$;
