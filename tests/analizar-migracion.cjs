/**
 * Analizador de migración CLEO — solo lectura, sin conexión a Supabase.
 *
 * Soporta dos formatos de entrada:
 *   - blob      : objeto con las CLEO_KEYS al nivel raíz (localStorage)
 *   - cleo-export: objeto con formato:"cleo-export" y claves en español
 *                  (generado por descargarRespaldoJSON en CLEO.jsx)
 * Formatos no reconocidos son rechazados explícitamente.
 *
 * Uso:
 *   node tests/analizar-migracion.cjs <ruta/al/blob.json>
 *   node tests/analizar-migracion.cjs --test        (datos ficticios, reporte)
 *   node tests/analizar-migracion.cjs --test-unit   (assertions automáticas)
 *   node tests/analizar-migracion.cjs --matriz      (imprime solo la matriz campos)
 *
 * Códigos de salida: 0 sin errores bloqueantes · 1 errores o assertions fallidas
 *
 * Restricciones: no escribe en Supabase, no modifica schema_ver, no toca cloudSync.
 * El mensaje "apto para copia inicial" está suprimido hasta cubrir la transformación
 * completa y aprobar las decisiones de negocio pendientes.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ══════════════════════════════════════════════════════════════════════════════
// MATRIZ DE CAMPOS  origen (blob) → destino (DB) → validación
// Derivada del código de CLEO.jsx y SEGUIMIENTO.md.
// Correcciones respecto a SEGUIMIENTO.md original marcadas con ⚑.
// ══════════════════════════════════════════════════════════════════════════════

const MATRIZ = {
  PEDIDOS: [
    { origen:'id',                destino:'cleo_id',               tipo:'str',  req:true  },
    { origen:'clienteId',         destino:'cliente_id',            tipo:'ref_cli'          },
    { origen:'cotizacionId',      destino:'cotizacion_id',         tipo:'ref_cot', nota:'verificar coherencia cliente' },
    { origen:'items',             destino:'items (jsonb)',          tipo:'jsonb'             },
    { origen:'productos',         destino:'productos',             tipo:'str'               },
    { origen:'cantidad',          destino:'cantidad',              tipo:'int'               },
    { origen:'total',             destino:'monto_total',           tipo:'num',  req:true,  nota:'⚑ blob usa total, no montoTotal' },
    { origen:'notas',             destino:'notas',                 tipo:'str'               },
    { origen:'etiqueta',          destino:'etiqueta',              tipo:'str'               },
    { origen:'estadoPedido',      destino:'estado_pedido',         tipo:'enum', req:true,  nota:'⚑ blob usa estadoPedido, no estado. "pendiente"→"preparando"' },
    { origen:'fecha',             destino:'fecha',                 tipo:'fecha'             },
    { origen:'fechaEntrega',      destino:'fecha_entrega',         tipo:'fecha'             },
    { origen:'fechaCancelacion',  destino:'fecha_cancelacion',     tipo:'fecha'             },
    { origen:'anticipoConservado',destino:'anticipo_conservado',   tipo:'bool', nota:'⚑ blob usa anticipoConservado, no antiocitoConservado' },
    { origen:'motivoCancelacion', destino:'motivo_cancelacion',    tipo:'str'               },
    { origen:'motivoCancelacionLado', destino:'motivo_cancelacion_lado', tipo:'enum', nota:'cliente|negocio' },
    { origen:'itemsConfirmacion', destino:'items_confirmacion',    tipo:'jsonb'             },
    { origen:'montoConfirmacion', destino:'monto_confirmacion',    tipo:'num'               },
    { origen:'historialConfirmacion', destino:'versiones_confirmacion', tipo:'jsonb'        },
    { origen:'configPostVenta.pago',       destino:'postv_pago',        tipo:'enum', nota:'pendiente|resuelto. ⚑ campo anidado, no postvPago directo' },
    { origen:'configPostVenta.seguimiento',destino:'postv_seguimiento', tipo:'enum', nota:'pendiente|atendido. ⚑ campo anidado' },
    { origen:'origenVenta',       destino:'origen_venta',          tipo:'enum', nota:'⚑ blob usa origenVenta, no origen. registro_manual|oportunidad|venta_rapida' },
    { origen:'archivoAdjunto',    destino:'archivo_adjuntos (tabla)', tipo:'ref_adjunto', nota:'solo metadato; binario en Supabase Storage' },
  ],
  COTIZACIONES: [
    { origen:'id',                destino:'cleo_id',               tipo:'str',  req:true  },
    { origen:'clienteId',         destino:'cliente_id',            tipo:'ref_cli'          },
    { origen:'items',             destino:'items (jsonb)',          tipo:'jsonb'             },
    { origen:'subtotal',          destino:'subtotal',              tipo:'num'               },
    { origen:'total',             destino:'monto',                 tipo:'num',  req:true   },
    { origen:'descuento',         destino:'descuento',             tipo:'num'               },
    { origen:'tipoDescuento',     destino:'tipo_descuento',        tipo:'str'               },
    { origen:'anticipo',          destino:'anticipo',              tipo:'num'               },
    { origen:'fechaAnticipo',     destino:'fecha_anticipo',        tipo:'fecha'             },
    { origen:'vigencia',          destino:'vigencia',              tipo:'str'               },
    { origen:'vigenciaDias',      destino:'vigencia_dias',         tipo:'int'               },
    { origen:'tipoPago',          destino:'tipo_pago',             tipo:'str'               },
    { origen:'condicionesPago',   destino:'condiciones_pago',      tipo:'str',  nota:'campo adicional no en SEGUIMIENTO original' },
    { origen:'condicionesServicio', destino:'sv_condiciones',      tipo:'str'               },
    { origen:'condicionesServicioHTML', destino:'sv_condiciones_html', tipo:'str'           },
    { origen:'notas',             destino:'notas',                 tipo:'str'               },
    { origen:'etiqueta',          destino:'etiqueta',              tipo:'str'               },
    { origen:'estatus',           destino:'estatus',               tipo:'enum', req:true   },
    { origen:'fecha',             destino:'fecha',                 tipo:'fecha'             },
    { origen:'fechaHoraCreacion', destino:'fecha_hora_creacion',   tipo:'fecha', nota:'campo adicional' },
    { origen:'fechaEnvio',        destino:'fecha_envio',           tipo:'fecha'             },
    { origen:'fechaCierre',       destino:'fecha_cierre',          tipo:'fecha'             },
    { origen:'fechaHoraCierre',   destino:'fecha_hora_cierre',     tipo:'fecha'             },
    { origen:'fechaRechazo',      destino:'fecha_rechazo',         tipo:'fecha'             },
    { origen:'fechaHoraRechazo',  destino:'fecha_hora_rechazo',    tipo:'fecha'             },
    { origen:'itemsAceptacion',   destino:'items_aceptacion (snapshot)', tipo:'jsonb'       },
    { origen:'montoAceptacion',   destino:'monto_aceptacion (snapshot)', tipo:'num'         },
    { origen:'historialAceptacion', destino:'versiones_aceptacion', tipo:'jsonb'            },
    { origen:'configPostVenta.pago',       destino:'postv_pago',   tipo:'enum', nota:'pendiente|resuelto. ⚑ campo anidado' },
    { origen:'configPostVenta.seguimiento',destino:'postv_seguimiento', tipo:'enum', nota:'pendiente|atendido. ⚑ campo anidado' },
    { origen:'seguimientoFecha',  destino:'seguimiento_fecha',     tipo:'fecha', nota:'solo en cotizaciones independientes' },
    { origen:'seguimientoEstado', destino:'seguimiento_estado',    tipo:'str'               },
    { origen:'vinculadaOportunidadActual', destino:'(regla oportunidad)', tipo:'lógico', nota:'false→oportunidad propia; true/undef→ambiguo' },
    { origen:'archivoAdjunto',    destino:'archivo_adjuntos (tabla)', tipo:'ref_adjunto'    },
  ],
  RECORDATORIOS: [
    { origen:'id',                destino:'cleo_id',               tipo:'str',  nota:'puede ser null en registros viejos' },
    { origen:'nota',              destino:'texto',                 tipo:'str',  nota:'⚑ blob usa nota, no texto' },
    { origen:'categoria',         destino:'categoria',             tipo:'enum'              },
    { origen:'fecha',             destino:'fecha',                 tipo:'fecha'             },
    { origen:'completado',        destino:'completado',            tipo:'bool'              },
    { origen:'(derivado)',        destino:'estatus',               tipo:'enum', nota:'completado=true→atendido; else→pendiente' },
    { origen:'fechaAtendido',     destino:'fecha_atendido',        tipo:'fecha'             },
    { origen:'esPersonalizada',   destino:'es_personalizada',      tipo:'bool'              },
    { origen:'origen',            destino:'origen',                tipo:'str'               },
  ],
  RECORDATORIOS_LEGACY: [
    { origen:'seguimientoFecha',          destino:'recordatorio.fecha',     tipo:'fecha', nota:'⚑ campo en cliente, no en recordatorios[]' },
    { origen:'mensajeSeguimientoPostVenta', destino:'recordatorio.texto',   tipo:'str'   },
    { origen:'seguimientoEsPersonalizada', destino:'recordatorio.es_personalizada', tipo:'bool' },
  ],
  VENTAS: [
    { origen:'id',          destino:'cleo_id',  tipo:'str', req:true },
    { origen:'clienteId',   destino:'cliente_id', tipo:'ref_cli' },
    { origen:'concepto',    destino:'concepto', tipo:'str' },
    { origen:'items',       destino:'items (jsonb)', tipo:'jsonb' },
    { origen:'monto',       destino:'monto',    tipo:'num', req:true },
    { origen:'tipo',        destino:'tipo',     tipo:'enum', nota:'especifico→normal; dia/generico/rapida→rapida (resuelto)' },
    { origen:'notas',       destino:'notas',    tipo:'str' },
    { origen:'etiqueta',    destino:'etiqueta', tipo:'str' },
    { origen:'fecha',       destino:'fecha',    tipo:'fecha' },
    { origen:'fechaHora',   destino:'fecha_hora', tipo:'fecha' },
    { origen:'entregado',   destino:'(postv)',   tipo:'bool', nota:'campo en ventas de servicios' },
  ],
  PRODUCTOS_CAT: [
    { origen:'id',               destino:'cleo_id',           tipo:'str',  req:true },
    { origen:'nombre',           destino:'nombre',            tipo:'str'            },
    { origen:'precio',           destino:'precio',            tipo:'num'            },
    { origen:'descripcion',      destino:'descripcion',       tipo:'str'            },
    { origen:'condiciones',      destino:'condiciones',       tipo:'str'            },
    { origen:'inventarioActivo', destino:'inventario_activo', tipo:'bool', nota:'false por defecto' },
    { origen:'stock',            destino:'stock',             tipo:'int',  nota:'null si inventarioActivo=false (constraint en DB)' },
    { origen:'stockMinimo',      destino:'stock_minimo',      tipo:'int'            },
    { origen:'costoConfig',      destino:'costo_config',      tipo:'jsonb'          },
    { origen:'movimientos[]',    destino:'inventario_movimientos', tipo:'ref_mov', nota:'tabla separada, append-only, dedup por (negocio_id, cleo_id)' },
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
// DECISIONES DE NEGOCIO PENDIENTES
// Cada entrada impide declarar "apto para migrar".
// ══════════════════════════════════════════════════════════════════════════════

// Todas las decisiones están resueltas — ver abajo para el detalle.
const DECISIONES_PENDIENTES = [];

// Historial de decisiones tomadas:
const DECISIONES_RESUELTAS = [
  'ventas.tipo: especifico→normal, todo lo demás→rapida. Adoptado en cleo_dual_flush.',
  'configPostVenta en pedidos: campo anidado { pago, seguimiento }, igual que cotizaciones. Confirmado en cleo_dual_flush.',
  '[2026-09-30] recordatorios legacy: cleo_id="legacy_sf_{cliente_cleo_id}" (estable), categoría="sin_clasificar", oportunidad_id=NULL. Deduplicación por cleo_id garantiza idempotencia.',
  'archivoAdjunto en cots y pedidos: copiar metadato a archivo_adjuntos. El binario ya está en Storage y el path es el mismo; no hay que volver a subir.',
  'clientes.archivado: omitir en copia inicial. La UI filtra por el blob (que sí tiene el campo) hasta que se añada la columna al schema en una etapa posterior.',
  'cotizaciones independientes sin seguimientoFecha: sí se crea oportunidad con estado derivado del estatus de la cotización.',
  'clientes en etapa activa sin cotizaciones independientes: sin oportunidad en copia inicial. El usuario las crea manualmente en fase dual.',
  '[2026-09-30] clientes sin estadoProspecto (modo productos): se insertan como clientes sin oportunidad. No crean negociación activa por defecto.',
  '[2026-09-30] campo items en clientes: alias de itemsInteres; se mapea a clientes.items_interes. Conflicto si ambos coexisten con distinto valor.',
  '[2026-09-30] campo monto en cotizaciones: alias de total en blobs recientes; se mapea a cotizaciones.monto. Conflicto si ambos coexisten con distinto valor.',
  '[2026-09-30] svCondiciones/svCondicionesHtml en cots: alias de condicionesServicio/condicionesServicioHTML; se mapea a sv_condiciones/sv_condiciones_html.',
  '[2026-09-30] notasProspecto→clientes.notas_prospecto (columna nueva). origenOtro→clientes.origen_otro (columna nueva).',
  '[2026-09-30] fechaHoraEntrega→pedidos.fecha_hora_entrega (timestamptz, columna nueva). fechaHoraCancelacion→pedidos.fecha_hora_cancelacion (timestamptz, columna nueva).',
  '[2026-09-30] cantidad en cotizaciones: suma de unidades (sum items[].cantidad), no items.length. Se preserva en cotizaciones.cantidad (columna nueva).',
  '[2026-09-30] tipoSeguimientoPostVenta (camelCase): va en oportunidades.tipo_seguimiento_postventa. Sin asignación arbitraria si hay múltiples pedidos.',
];

// ══════════════════════════════════════════════════════════════════════════════
// SETS DE VALORES VÁLIDOS  (derivados de CLEO.jsx, no de SEGUIMIENTO.md)
// ══════════════════════════════════════════════════════════════════════════════

const COT_ESTATUS        = new Set(['Borrador','Pendiente','Enviada','Aceptada','Rechazada','Cancelada']);
const PEDIDO_ESTADO      = new Set(['preparando','entregado','cancelado']);  // lowercase — blob puede traer "pendiente" que se normaliza
const PEDIDO_ESTADO_NORM = { pendiente:'preparando', Preparando:'preparando', Entregado:'entregado', Cancelado:'cancelado', preparando:'preparando', entregado:'entregado', cancelado:'cancelado' };
const PEDIDO_ORIGEN      = new Set(['registro_manual','oportunidad','venta_rapida']);
const VENTA_TIPO_BLOB    = new Set(['dia','especifico','rapida','generico','normal']);  // todos los que existen en el blob
const VENTA_TIPO_SCHEMA  = new Set(['normal','rapida']);                               // solo los que acepta el schema
const REC_CATEGORIA      = new Set(['pipeline','postventa','reactivacion','manual','sin_clasificar']);
const HIST_TIPO          = new Set(['precio_enviado','consulta_registrada','consulta_actualizada','contacto']);
const ESTADOPROSPECTO    = new Set(['Nueva','En seguimiento','Sin respuesta','Convertido','Perdido']);
const POSTV_PAGO         = new Set(['pendiente','resuelto']);
const POSTV_SEG          = new Set(['pendiente','ok']);  // DB guarda 'ok', no 'atendido'
const CANCELACION_LADO   = new Set(['cliente','negocio']);

// Campos conocidos por entidad (para detectar campos extras)
const CLIENTES_CONOCIDOS = new Set([
  'id','nombre','negocio','contacto','email','instagram','messenger',
  'canalPrincipal','origen','etapa','fechaEtapa','estadoProspecto',
  'motivoPerdida','razonCierre','ultimoContacto','notas','etiqueta',
  'notaRecontacto','fechaPedido','servicioInteres','itemsInteres',
  'mensajeSeguimiento','seguimientoCustom','historialContactos','recordatorios',
  // legacy seguimiento (⚑ campos en el cliente, no en recordatorios[])
  'seguimientoFecha','mensajeSeguimientoPostVenta','seguimientoEsPersonalizada',
  // productos
  'productoInteres','precioInteres','cantidadInteres',
  'tipo_seguimiento_postventa',   // snake_case (versiones anteriores)
  'tipoSeguimientoPostVenta',     // camelCase (versiones recientes) → oportunidades.tipo_seguimiento_postventa
  // campos preservados con columnas propias en el schema
  'notasProspecto',               // → clientes.notas_prospecto (columna nueva aprobada)
  'origenOtro',                   // → clientes.origen_otro (columna nueva aprobada)
  // ⚑ items es alias de itemsInteres en blobs recientes (mismo contenido, distinto nombre)
  'items',                        // → clientes.items_interes (COALESCE cuando ambos existen)
  // otros
  'archivado','created_at','updated_at','createdAt','updatedAt','fecha',
]);
const COTS_CONOCIDOS = new Set([
  'id','clienteId','items','subtotal',
  'total',                         // campo canónico → cotizaciones.monto
  'monto',                         // alias de 'total' en blobs recientes → cotizaciones.monto
  'descuento','tipoDescuento',
  'anticipo','fechaAnticipo','vigencia','vigenciaDias','tipoPago',
  'condicionesPago','condicionesServicio','condicionesServicioHTML',
  'svCondiciones',                 // alias de condicionesServicio en blobs recientes
  'svCondicionesHtml',             // alias de condicionesServicioHTML en blobs recientes
  'notas','etiqueta','estatus','fecha','fechaHoraCreacion',
  'fechaEnvio','fechaCierre','fechaHoraCierre','fechaRechazo','fechaHoraRechazo',
  'itemsAceptacion','montoAceptacion','historialAceptacion',
  'configPostVenta','seguimientoFecha','seguimientoEstado','seguimientoAtendidoFecha',
  'vinculadaOportunidadActual','archivoAdjunto','pagos',
  'motivoPerdida',
  // campos preservados (columna nueva cotizaciones.cantidad)
  'cantidad',                      // suma de unidades (≠ items.length); → cotizaciones.cantidad
  'concepto',                      // string resumen derivable de items[].nombre — redundante, descartable si items presente
  'precioUnit',                    // monto/cantidad — derivable, descartable si ambos presentes
]);
const PEDIDOS_CONOCIDOS = new Set([
  'id','clienteId','cotizacionId','items','productos','cantidad','total',
  'notas','etiqueta','estadoPedido','fecha',
  'fechaEntrega',                  // date → pedidos.fecha_entrega
  'fechaHoraEntrega',              // timestamptz → pedidos.fecha_hora_entrega (columna nueva aprobada)
  'fechaCancelacion',              // date → pedidos.fecha_cancelacion
  'fechaHoraCancelacion',          // timestamptz → pedidos.fecha_hora_cancelacion (columna nueva aprobada)
  'anticipoConservado','motivoCancelacion','motivoCancelacionLado',
  'itemsConfirmacion','montoConfirmacion','historialConfirmacion',
  'configPostVenta','postvPago','postvSeguimiento',  // ambas formas por compatibilidad
  'origenVenta','archivoAdjunto','pagos',
  'fechaCreado','fechaHoraCreacion',
]);
const VENTAS_CONOCIDOS = new Set([
  'id','clienteId','concepto','items','monto','tipo','notas','etiqueta',
  'fecha','fechaHora','entregado','fechaEntrega','tipoPago','pagos',
]);
const HIST_CONOCIDOS = new Set(['id','tipo','descripcion','monto','cotizacionId','fecha']);
const REC_CONOCIDOS  = new Set(['id','nota','categoria','fecha','completado','fechaAtendido','esPersonalizada','origen']);

// ══════════════════════════════════════════════════════════════════════════════
// DATOS FICTICIOS  — representativos del blob real
// ══════════════════════════════════════════════════════════════════════════════

const DATOS_PRUEBA_BLOB = {
  // ── formato blob (CLEO_KEYS al nivel raíz) ────────────────────────────────
  cleo_perfil: {
    nombre:'Taller Diseño SA', tuNombre:'Ana García', tipoPerfil:'servicios',
    telefono:'5551234567', email:'ana@demo.test', color:'#3498DB',
    colorSecundario:'#2C3E50', banco:'BANAMEX', bancoaccount:'1234567890',
    bancoclabe:'002180012345678901', bancotitular:'Ana García López', moneda:'MXN',
    logo:'https://demo.test/logo.png', condicionesPago:'50% anticipo',
    notificacionesEmail:true,  // → aviso: sin correspondencia
  },
  cleo_tipo_perfil:'servicios',

  cleo_clientes:[
    {
      id:'cli_01', nombre:'Carlos Ruiz', contacto:'5552000001',
      etapa:'cotizacion_enviada', estadoProspecto:null,
      // legacy seguimiento → se convierte a recordatorio en migración
      seguimientoFecha:'2026-10-15', mensajeSeguimientoPostVenta:'Confirmar aceptación',
      seguimientoEsPersonalizada:false,
      historialContactos:[
        {id:'hc_01',tipo:'precio_enviado',descripcion:'Cot. enviada',monto:5000,cotizacionId:'cot_01',fecha:'2026-02-15T09:00:00Z'},
      ],
      recordatorios:[
        {id:'rec_01',nota:'Dar seguimiento',categoria:'pipeline',fecha:'2026-03-10',completado:false,esPersonalizada:false,origen:'cleo'},
      ],
    },
    {
      id:'cli_02', nombre:'Rosa Sánchez', etapa:'negociacion',
      historialContactos:[
        {id:'hc_02',tipo:'consulta_registrada',descripcion:'Consulta',fecha:'2026-01-20T15:00:00Z'},
        {id:'hc_02',tipo:'contacto',descripcion:'Dup',fecha:'2026-02-10T15:00:00Z'},  // dup id → error
      ],
      recordatorios:[],
    },
    {
      id:'cli_03', nombre:'Pedro Morales', etapa:'nuevo_contacto',
      campoInventado:'xyz',  // → aviso
      historialContactos:[
        {id:'hc_03',tipo:'visita_presencial',descripcion:'Reunión',fecha:'2026-01-05T08:00:00Z'},  // tipo fuera de set
        {id:'hc_04',tipo:'contacto',cotizacionId:'cot_INEXISTENTE',fecha:'2026-01-08T08:00:00Z'}, // dangling
      ],
      recordatorios:[
        {id:'rec_02',nota:'Llamar',categoria:'seguimiento_preventa',fecha:'2026-04-01',completado:true},  // cat fuera de set
      ],
    },
    {id:'cli_01',nombre:'Duplicado',historialContactos:[],recordatorios:[]},  // dup → error
  ],

  cleo_cots:[
    // cotización independiente, pago parcial válido (anticipo)
    {
      id:'cot_01',clienteId:'cli_01',
      items:[{nombre:'Diseño de logo',cantidad:1,precioUnitario:5000,total:5000}],
      subtotal:5000,total:5000,descuento:0,estatus:'Enviada',fecha:'2026-02-15',
      seguimientoFecha:'2026-03-15',seguimientoEstado:'pendiente',
      vinculadaOportunidadActual:false,
      configPostVenta:null,  // sin configPostVenta (no Aceptada aún)
      pagos:[
        {id:'pag_01',monto:2500,fecha:'2026-02-20',concepto:'Anticipo 50%'},
      ],
    },
    // ambigua, pagos con monto inválido → error
    {
      id:'cot_02',clienteId:'cli_02',
      items:[{nombre:'Evento',cantidad:1,precioUnitario:12000,total:12000}],
      subtotal:12000,total:12000,descuento:0,estatus:'Aceptada',fecha:'2026-02-01',
      itemsAceptacion:[{nombre:'Evento',total:12000}],montoAceptacion:12000,
      configPostVenta:{pago:'pendiente',seguimiento:'pendiente'},
      vinculadaOportunidadActual:true,
      pagos:[
        {id:'pag_02',monto:6000,fecha:'2026-02-05'},
        {id:'pag_INVALIDO',monto:'no-es-numero',fecha:'2026-02-10'},  // → error
      ],
    },
    // suma > total → error (exceso)
    {
      id:'cot_03',clienteId:'cli_01',
      subtotal:100,total:100,descuento:0,estatus:'Enviada',fecha:'2026-04-01',
      vinculadaOportunidadActual:false,
      pagos:[{id:'pag_03',monto:150,fecha:'2026-04-02'}],
    },
    // dangling clienteId
    {id:'cot_04',clienteId:'cli_NOEXISTE',subtotal:0,total:8000,descuento:0,
     estatus:'Pendiente',vinculadaOportunidadActual:false,pagos:[]},
    // id duplicado + estatus fuera de rango
    {id:'cot_01',clienteId:'cli_03',subtotal:500,total:500,descuento:0,
     estatus:'En_Revision',pagos:[]},
  ],

  cleo_pedidos:[
    // ⚑ usa estadoPedido (no estado) y total (no montoTotal) y anticipoConservado
    {
      id:'ped_01',clienteId:'cli_01',cotizacionId:'cot_01',
      productos:'Diseño final',total:700,estadoPedido:'entregado',
      anticipoConservado:null,  // no cancelado → no aplica
      origenVenta:'oportunidad',fecha:'2026-03-15',
      pagos:[{id:'ppag_01',monto:700,fecha:'2026-03-16'}],
    },
    // estadoPedido:'pendiente' → se normaliza a 'preparando'
    {
      id:'ped_02',clienteId:'cli_NOEXISTE2',
      total:1200,estadoPedido:'pendiente',origenVenta:'registro_manual',
      pagos:[{id:'ppag_02',monto:600,fecha:'2026-04-01'}],
    },
    // cotizacionId de otro cliente → coherencia rota
    {
      id:'ped_03',clienteId:'cli_02',cotizacionId:'cot_01',  // cot_01 pertenece a cli_01
      total:500,estadoPedido:'preparando',
      pagos:[],
    },
    // pag_01 duplicado global
    {
      id:'ped_04',clienteId:'cli_01',
      total:300,estadoPedido:'entregado',
      pagos:[{id:'pag_01',monto:300,fecha:'2026-05-01'}],  // dup global
    },
  ],

  cleo_ventas:[
    {id:'vta_01',clienteId:'cli_01',concepto:'Venta directa',monto:200,tipo:'especifico',fecha:'2026-04-10',
     pagos:[{id:'vpag_01',monto:200,fecha:'2026-04-10'}]},
    // tipo:'dia' → DECISIÓN PENDIENTE (no en schema)
    {id:'vta_02',concepto:'Total del día',monto:1500,tipo:'dia',fecha:'2026-05-01',
     pagos:[{id:'vpag_02',monto:1500,fecha:'2026-05-01'}]},
  ],

  cleo_servicios:[
    {id:'srv_01',nombre:'Diseño de logo',precio:5000,descripcion:'Logo',condiciones:'7 días'},
    {id:'srv_02',nombre:'Sitio web',precio:15000},
    {id:'srv_01',nombre:'Diseño básico',precio:2000},  // dup → error
  ],
  cleo_productos_cat:[
    {id:'prd_01',nombre:'Collar dorado',precio:350},
    {id:'srv_01',nombre:'Ítem catálogo',precio:100},  // colisión con servicios → info
  ],

  cleo_productos:['Collar dorado','Pulsera plata'],
  cleo_alertas_cerradas:['alerta_bienvenida'],
  cleo_etapas_vistas:['nuevo_contacto'],
  cleo_streak_accion_serv:null,
  cleo_data_version:'3',
};

// Formato cleo-export (generado por descargarRespaldoJSON)
const DATOS_PRUEBA_EXPORT = {
  formato:'cleo-export',
  version:1,
  exportado_en:'2026-09-15T12:00:00Z',
  perfil:{nombre:'Tienda Demo',tuNombre:'Lucía',tipoPerfil:'productos',moneda:'MXN'},
  tipo_perfil:'productos',
  clientes:[
    {id:'c1',nombre:'Juan Pérez',estadoProspecto:'Nueva',historialContactos:[],recordatorios:[]},
    {id:'c2',nombre:'Laura Gómez',estadoProspecto:'Convertido',
     recordatorios:[{id:'r1',nota:'Reactivar en diciembre',categoria:'reactivacion',fecha:'2026-12-01',completado:false}],
     historialContactos:[]},
  ],
  cotizaciones:[],
  ventas:[],
  servicios:[],
  pedidos:[
    {id:'p1',clienteId:'c1',productos:'Aretes',total:350,estadoPedido:'entregado',
     anticipoConservado:null,origenVenta:'venta_rapida',fecha:'2026-09-10',
     pagos:[{id:'pg1',monto:350,fecha:'2026-09-10'}]},
  ],
  productos:['Aretes dorados'],
  categorias_productos:[{id:'cat1',nombre:'Aretes dorados',precio:350}],
};

// ══════════════════════════════════════════════════════════════════════════════
// DETECCIÓN Y NORMALIZACIÓN DE FORMATO
// ══════════════════════════════════════════════════════════════════════════════

const FORMATOS_CONOCIDOS = new Set(['blob','cleo-export']);

function detectarFormato(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return { tipo:null, error:'El contenido no es un objeto JSON válido.' };
  if (raw.formato === 'cleo-export') return { tipo:'cleo-export', error:null };
  if ('cleo_perfil' in raw || 'cleo_clientes' in raw || 'cleo_cots' in raw)
    return { tipo:'blob', error:null };
  return { tipo:null, error:'Formato no reconocido. Se esperaba un blob (con cleo_perfil/cleo_clientes) o un cleo-export (con formato:"cleo-export"). No se interpreta como vacío.' };
}

function normalizarABlob(raw, tipo) {
  if (tipo === 'blob') return raw;
  // cleo-export → blob  (mapeo de claves)
  return {
    cleo_perfil:        raw.perfil         || {},
    cleo_tipo_perfil:   raw.tipo_perfil    || (raw.perfil || {}).tipoPerfil || null,
    cleo_clientes:      raw.clientes       || [],
    cleo_cots:          raw.cotizaciones   || [],
    cleo_pedidos:       raw.pedidos        || [],
    cleo_ventas:        raw.ventas         || [],
    cleo_servicios:     raw.servicios      || [],
    cleo_productos_cat: raw.categorias_productos || [],
    cleo_productos:     raw.productos      || [],
    // resto de keys opcionales
    cleo_alertas_cerradas:   raw.alertas_cerradas   || null,
    cleo_etapas_vistas:      raw.etapas_vistas       || null,
    cleo_streak_accion_prod: raw.streak_prod          || null,
    cleo_streak_accion_serv: raw.streak_serv          || null,
    cleo_data_version:       raw.data_version         || null,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// VALIDACIÓN DE ESTRUCTURA (colecciones deben ser arrays)
// ══════════════════════════════════════════════════════════════════════════════

function validarEstructura(blob) {
  const errores = [];
  for (const clave of ['cleo_clientes','cleo_cots','cleo_pedidos','cleo_ventas','cleo_servicios','cleo_productos_cat']) {
    if (Object.prototype.hasOwnProperty.call(blob, clave) && !Array.isArray(blob[clave]))
      errores.push(`${clave}: se esperaba array, se recibió ${typeof blob[clave]} — no se interpreta como colección vacía.`);
  }
  if (Object.prototype.hasOwnProperty.call(blob, 'cleo_perfil')) {
    const p = blob.cleo_perfil;
    if (typeof p !== 'object' || p === null || Array.isArray(p))
      errores.push(`cleo_perfil: se esperaba objeto, se recibió ${Array.isArray(p)?'array':p===null?'null':typeof p}.`);
  }
  return errores;
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILIDADES DE VALIDACIÓN
// ══════════════════════════════════════════════════════════════════════════════

function esNumericoFinito(v) { return typeof v === 'number' && isFinite(v); }
function esMontoValido(v)    { return v != null && typeof v !== 'boolean' && !isNaN(Number(v)) && isFinite(Number(v)); }
function esFecha(v)          { return typeof v === 'string' && v.trim() !== '' && !isNaN(Date.parse(v)); }

function duplicados(arr, campo) {
  const visto = new Map();
  arr.forEach((item, i) => {
    const v = item[campo]; if (v == null) return;
    const k = String(v);
    if (!visto.has(k)) visto.set(k, []);
    visto.get(k).push(i);
  });
  return [...visto.entries()].filter(([,idxs]) => idxs.length > 1).map(([v,idxs]) => `${v}(pos ${idxs.join(',')})`);
}

function camposExtra(items, conocidos) {
  const extra = new Set();
  items.forEach(item => Object.keys(item).forEach(k => { if (!conocidos.has(k)) extra.add(k); }));
  return [...extra].sort();
}

/**
 * Analiza pagos de un documento.
 * - invalidos: montos no numéricos o no finitos → ERROR
 * - suma > total → ERROR (exceso real)
 * - suma < total → INFO (pago parcial válido)
 * - suma == total → OK
 */
function analizarPagos(doc, campoTotal) {
  if (!Array.isArray(doc.pagos) || doc.pagos.length === 0) return null;
  const invalidos = [];
  let suma = 0;
  for (const p of doc.pagos) {
    if (!esMontoValido(p.monto)) invalidos.push({ id:p.id??'(sin id)', monto:p.monto });
    else suma += Number(p.monto);
  }
  const total = Number(doc[campoTotal]);
  const diff  = total - suma;
  return { suma, invalidos, total, diff };
}

// ══════════════════════════════════════════════════════════════════════════════
// TRANSFORMACIÓN EN MEMORIA  — genera filas completas, no solo IDs
// ══════════════════════════════════════════════════════════════════════════════

function transformar(blob) {
  const tipoPerfil = blob.cleo_tipo_perfil || (blob.cleo_perfil||{}).tipoPerfil || null;
  const clientes   = Array.isArray(blob.cleo_clientes)      ? blob.cleo_clientes      : [];
  const cots       = Array.isArray(blob.cleo_cots)          ? blob.cleo_cots          : [];
  const pedidos    = Array.isArray(blob.cleo_pedidos)       ? blob.cleo_pedidos       : [];
  const ventas     = Array.isArray(blob.cleo_ventas)        ? blob.cleo_ventas        : [];
  const servicios  = Array.isArray(blob.cleo_servicios)     ? blob.cleo_servicios     : [];
  const prodCat    = Array.isArray(blob.cleo_productos_cat) ? blob.cleo_productos_cat : [];

  const filas = { clientes:[], catalogo:[], oportunidades:[], cotizaciones:[], pedidos:[], ventas:[], pagos:[], historial:[], recordatorios:[] };
  const pendientes = [];   // campos sin destino o con decisión pendiente

  // clientes
  for (const c of clientes) {
    // items_interes: items es el alias reciente; si ambos existen y coinciden se usa uno; conflicto ya reportado arriba
    const itemsInteres = (() => {
      if (c.items != null && c.itemsInteres != null) return c.itemsInteres; // conflicto reportado; conservar itemsInteres
      return c.itemsInteres ?? c.items ?? null;
    })();

    filas.clientes.push({
      cleo_id: c.id,
      nombre: c.nombre ?? null,
      empresa: c.negocio ?? null,
      telefono: c.contacto ?? null,
      email: c.email ?? null,
      instagram: c.instagram ?? null,
      messenger: c.messenger ?? null,
      canal: c.canalPrincipal ?? null,
      origen: c.origen ?? null,
      origen_otro: c.origenOtro ?? null,   // → clientes.origen_otro (columna nueva)
      etapa: c.etapa ?? null,
      fecha_etapa: c.fechaEtapa ?? null,
      estado_prospecto: c.estadoProspecto ?? null,
      motivo_perdida: c.motivoPerdida ?? null,
      razon_cierre: c.razonCierre ?? null,
      ultimo_contacto: c.ultimoContacto ?? null,
      notas: c.notas ?? null,
      notas_prospecto: c.notasProspecto ?? null,  // → clientes.notas_prospecto (columna nueva)
      etiqueta: c.etiqueta ?? null,
      nota_recontacto: c.notaRecontacto ?? null,
      servicio_interes: c.servicioInteres ?? null,
      items_interes: itemsInteres,
      // campos presentes en cleo_dual_flush paso 7 (faltaban en versión anterior)
      mensaje_seguimiento:           c.mensajeSeguimiento          ?? null,
      seguimiento_custom:            c.seguimientoCustom           ?? false,
      seguimiento_fecha:             c.seguimientoFecha            ?? null,
      mensaje_seguimiento_postventa: c.mensajeSeguimientoPostVenta ?? null,
      fecha_pedido:                  c.fechaPedido                 ?? null,
      // archivado omitido — sin columna en DB (ver DECISIONES_RESUELTAS)
    });

    // historial
    for (const h of (Array.isArray(c.historialContactos) ? c.historialContactos : [])) {
      filas.historial.push({ cleo_id:h.id??null, cliente_cleo_id:c.id, tipo:h.tipo, descripcion:h.descripcion??null, monto:h.monto??null, cotizacion_cleo_id:h.cotizacionId??null, fecha:h.fecha??null });
    }

    // recordatorios en array
    for (const r of (Array.isArray(c.recordatorios) ? c.recordatorios : [])) {
      filas.recordatorios.push({
        cleo_id: r.id ?? null,
        cliente_cleo_id: c.id,
        texto: r.nota ?? null,  // ⚑ blob.nota → DB.texto
        categoria: r.categoria ?? null,
        fecha: r.fecha ?? null,
        completado: r.completado ?? false,
        estatus: r.completado ? 'atendido' : 'pendiente',
        fecha_atendido: r.fechaAtendido ?? null,
        es_personalizada: r.esPersonalizada ?? false,
        origen: r.origen ?? null,
        oportunidad_id: null,
        _fuente: 'recordatorios_array',
      });
    }

    // recordatorio legacy (seguimientoFecha en el cliente)
    // cleo_id estable: 'legacy_sf_' + c.id — garantiza deduplicación en re-ejecuciones
    if (c.seguimientoFecha) {
      filas.recordatorios.push({
        cleo_id: `legacy_sf_${c.id}`,  // ID estable para deduplicación idempotente
        cliente_cleo_id: c.id,
        texto: c.mensajeSeguimientoPostVenta ?? '',
        categoria: 'sin_clasificar',    // aprobado: sin evidencia de categoría alternativa
        fecha: c.seguimientoFecha,
        completado: false,
        estatus: 'pendiente',
        es_personalizada: c.seguimientoEsPersonalizada ?? false,
        origen: 'cleo',
        oportunidad_id: null,           // no asignar a oportunidad sin evidencia explícita
        _fuente: 'legacy_seguimientoFecha',
      });
    }
  }

  // catálogo
  for (const s of servicios) filas.catalogo.push({ cleo_id:s.id, modo:'servicios', nombre:s.nombre??null, precio:s.precio??null, descripcion:s.descripcion??null, condiciones:s.condiciones??null });
  for (const p of prodCat)   filas.catalogo.push({
    cleo_id:          p.id,
    modo:             'productos',
    nombre:           p.nombre            ?? null,
    precio:           p.precio            ?? null,
    descripcion:      p.descripcion       ?? null,
    condiciones:      p.condiciones       ?? null,
    inventario_activo: p.inventarioActivo ?? false,
    stock:            p.inventarioActivo  ? (p.stock ?? null) : null,
    stock_minimo:     p.stockMinimo       ?? null,
    costo_config:     p.costoConfig       ?? null,
    _movimientos_count: Array.isArray(p.movimientos) ? p.movimientos.length : 0,
  });

  // oportunidades (reglas de conversión)
  let nSinTransformar = 0;
  if (tipoPerfil === 'productos') {
    for (const c of clientes) {
      // Solo crean oportunidad los clientes con estadoProspecto declarado
      if (!c.estadoProspecto) continue;
      filas.oportunidades.push({
        origen_migracion: 'migrada_producto',
        cliente_cleo_id:  c.id,
        estado_prospecto: c.estadoProspecto,
        // tipo_seguimiento_postventa: camelCase o snake_case, va en la oportunidad
        tipo_seguimiento_postventa: c.tipoSeguimientoPostVenta ?? c.tipo_seguimiento_postventa ?? null,
      });
    }
  } else if (tipoPerfil === 'servicios') {
    for (const c of cots) {
      if (c.vinculadaOportunidadActual === false) {
        filas.oportunidades.push({ origen_migracion:'migrada_cotindep', cot_cleo_id:c.id, estatus_cot:c.estatus });
      } else {
        nSinTransformar++;
      }
    }
    // clientes en etapa activa sin cotizaciones independientes
    const idsCotsPorCliente = {};
    cots.forEach(c => { if (!idsCotsPorCliente[c.clienteId]) idsCotsPorCliente[c.clienteId] = {indep:0,amb:0}; c.vinculadaOportunidadActual===false?idsCotsPorCliente[c.clienteId].indep++:idsCotsPorCliente[c.clienteId].amb++; });
    const etapasActivas = new Set(['cotizacion_enviada','negociacion','nuevo_contacto']);
    for (const c of clientes) {
      if (etapasActivas.has(c.etapa) && !idsCotsPorCliente[c.id]) {
        pendientes.push(`${c.id} (etapa ${c.etapa}): sin cotizaciones — oportunidad pendiente de decisión`);
      }
    }
  }

  // cotizaciones
  for (const c of cots) {
    const postv = c.configPostVenta || null;
    // monto efectivo: si solo existe uno de los dos, usarlo; si ambos existen y son iguales, usarlo;
    // si ambos existen y difieren, conflicto ya reportado — se usa total como campo canónico
    const montoEfectivo = (() => {
      if (c.total != null && c.monto != null) return c.total; // conflicto reportado; total es canónico
      return c.total ?? c.monto ?? null;
    })();
    filas.cotizaciones.push({
      cleo_id: c.id,
      cliente_cleo_id: c.clienteId ?? null,
      items: c.items ?? [],
      subtotal: c.subtotal ?? null,
      monto: montoEfectivo,
      cantidad: c.cantidad ?? null,  // suma de unidades → cotizaciones.cantidad (columna nueva)
      descuento: c.descuento ?? null,
      tipo_descuento: c.tipoDescuento ?? null,
      anticipo: c.anticipo ?? null,
      fecha_anticipo: c.fechaAnticipo ?? null,
      estatus: c.estatus ?? null,
      fecha: c.fecha ?? null,
      items_aceptacion: c.itemsAceptacion ?? null,
      monto_aceptacion: c.montoAceptacion ?? null,
      versiones_aceptacion: c.historialAceptacion ?? [],
      postv_pago: postv?.pago ?? null,
      postv_seguimiento: postv?.seguimiento ?? null,
      // sv_condiciones: alias svCondiciones en blobs recientes
      sv_condiciones: c.condicionesServicio ?? c.svCondiciones ?? null,
      sv_condiciones_html: c.condicionesServicioHTML ?? c.svCondicionesHtml ?? null,
      seguimiento_fecha: c.seguimientoFecha ?? null,
      seguimiento_estado: c.seguimientoEstado ?? null,
      oportunidad_id: null,  // pendiente
      _vinculada: c.vinculadaOportunidadActual,
      _pendiente_archivo: !!c.archivoAdjunto,
    });
    for (const p of (Array.isArray(c.pagos) ? c.pagos : []))
      filas.pagos.push({ cleo_id:p.id??null, origen:`cot:${c.id}`, monto:p.monto });
  }

  // pedidos (⚑ estadoPedido, total, anticipoConservado, origenVenta)
  for (const p of pedidos) {
    const estadoNorm = PEDIDO_ESTADO_NORM[p.estadoPedido] ?? null;
    filas.pedidos.push({
      cleo_id: p.id,
      cliente_cleo_id: p.clienteId ?? null,
      cotizacion_cleo_id: p.cotizacionId ?? null,
      items: p.items ?? [],
      productos: p.productos ?? null,
      cantidad: p.cantidad ?? null,
      monto_total: p.total ?? null,       // ⚑ blob.total → DB.monto_total
      notas: p.notas ?? null,
      estado_pedido: estadoNorm,           // ⚑ blob.estadoPedido → DB.estado_pedido
      fecha: p.fecha ?? null,
      fecha_entrega: p.fechaEntrega ?? null,
      fecha_hora_entrega: p.fechaHoraEntrega ?? null,       // timestamptz (columna nueva aprobada)
      fecha_cancelacion: p.fechaCancelacion ?? null,
      fecha_hora_cancelacion: p.fechaHoraCancelacion ?? null, // timestamptz (columna nueva aprobada)
      anticipo_conservado: p.anticipoConservado ?? null,  // ⚑ no antiocitoConservado
      motivo_cancelacion: p.motivoCancelacion ?? null,
      motivo_cancelacion_lado: p.motivoCancelacionLado ?? null,
      items_confirmacion: p.itemsConfirmacion ?? null,
      monto_confirmacion: p.montoConfirmacion ?? null,
      versiones_confirmacion: p.historialConfirmacion ?? [],
      origen_venta: p.origenVenta ?? 'registro_manual',  // ⚑ blob.origenVenta → DB.origen_venta
      _pendiente_archivo: !!p.archivoAdjunto,
    });
    for (const pg of (Array.isArray(p.pagos) ? p.pagos : []))
      filas.pagos.push({ cleo_id:pg.id??null, origen:`ped:${p.id}`, monto:pg.monto });
  }

  // ventas
  for (const v of ventas) {
    filas.ventas.push({ cleo_id:v.id, cliente_cleo_id:v.clienteId??null, concepto:v.concepto??null, monto:v.monto??null, tipo:v.tipo??null, fecha:v.fecha??null });
    for (const p of (Array.isArray(v.pagos) ? v.pagos : []))
      filas.pagos.push({ cleo_id:p.id??null, origen:`vta:${v.id}`, monto:p.monto });
  }

  const nMovimientos = prodCat.reduce((s,p) => s + (Array.isArray(p.movimientos) ? p.movimientos.filter(m => m.id != null).length : 0), 0);

  const conteos = {
    blob: {
      clientes:  clientes.length,
      historial: filas.historial.length,
      recordatorios_array:  clientes.reduce((s,c) => s + (c.recordatorios||[]).length, 0),
      recordatorios_legacy: clientes.filter(c => c.seguimientoFecha).length,
      cotizaciones: cots.length,
      pedidos:   pedidos.length,
      ventas:    ventas.length,
      pagos:     filas.pagos.length,
      catalogo:  servicios.length + prodCat.length,
      movimientos_inventario: nMovimientos,
    },
    destino: {
      clientes:      filas.clientes.length,
      historial:     filas.historial.length,
      recordatorios: filas.recordatorios.length,
      cotizaciones:  filas.cotizaciones.length,
      pedidos:       filas.pedidos.length,
      ventas:        filas.ventas.length,
      pagos:         filas.pagos.length,
      catalogo:      filas.catalogo.length,
      oportunidades: filas.oportunidades.length,
      movimientos_inventario: nMovimientos,  // append-only: se insertan todos (dedup en DB por cleo_id)
    },
    montos: {
      // usar monto efectivo para cots (alias: total o monto)
      cotizaciones: cots.reduce((s,c) => s + (Number(c.total ?? c.monto)||0), 0),
      pedidos:      pedidos.reduce((s,p) => s + (Number(p.total)||0), 0),
      ventas:       ventas.reduce((s,v) => s + (Number(v.monto)||0), 0),
    },
    nSinTransformar,
    pendientes,
  };

  return { filas, conteos };
}

// ══════════════════════════════════════════════════════════════════════════════
// CLASE INFORME
// ══════════════════════════════════════════════════════════════════════════════

class Informe {
  constructor(silencioso = false) {
    this._lineas = []; this._silencioso = silencioso;
    this.nErrores = 0; this.nAvisos = 0; this.flags = {};
  }
  sep(t)    { this._lineas.push(''); this._lineas.push(`[${t}]`); }
  ok(m)     { this._lineas.push(`  ✓ ${m}`); }
  aviso(m)  { this._lineas.push(`  ⚠ ${m}`); this.nAvisos++; }
  error(m)  { this._lineas.push(`  ✗ ${m}`); this.nErrores++; }
  info(m)   { this._lineas.push(`  · ${m}`); }
  flag(k,v) { this.flags[k] = v; }
  encabezado(fuente,fmt) {
    const hr = '─'.repeat(62);
    this._lineas.push(hr);
    this._lineas.push('ANALIZADOR DE MIGRACIÓN CLEO  (solo lectura)');
    this._lineas.push(`Fuente : ${fuente}`);
    this._lineas.push(`Formato: ${fmt}`);
    this._lineas.push(hr);
  }
  resumen(nSinT, nDecisiones) {
    this._lineas.push(''); this._lineas.push('─'.repeat(62));
    if (this.nErrores > 0)
      this._lineas.push(`  ✗ ${this.nErrores} error(es) bloqueante(s) — resolver antes de migrar.`);
    if (nSinT > 0)
      this._lineas.push(`  · ${nSinT} cotizacion(es) sin oportunidad automática — asignación manual en fase dual.`);
    if (nDecisiones > 0)
      this._lineas.push(`  · ${nDecisiones} decisión/decisiones de negocio pendientes — ver sección DECISIONES.`);
    if (this.nAvisos > 0)
      this._lineas.push(`  ⚠ ${this.nAvisos} aviso(s) — revisar antes de activar schema_ver=dual.`);
    // "Apto" suprimido hasta cubrir transformación completa
    if (this.nErrores === 0 && this.nAvisos === 0 && nSinT === 0 && nDecisiones === 0)
      this._lineas.push('  · Sin problemas en esta pasada. Revisar DECISIONES_PENDIENTES antes de ejecutar cualquier migración.');
    this.flag('aptoParaMigrar', false);  // nunca true hasta decisiones resueltas
    this._lineas.push('─'.repeat(62));
  }
  imprimir() { if (!this._silencioso) console.log(this._lineas.join('\n')); }
}

// ══════════════════════════════════════════════════════════════════════════════
// ANÁLISIS PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

function analizar(rawBlob, fuente, silencioso = false) {
  const R = new Informe(silencioso);

  // ── 0. FORMATO ─────────────────────────────────────────────────────────────
  const { tipo: fmtTipo, error: fmtError } = detectarFormato(rawBlob);
  if (!fmtTipo) {
    R.encabezado(fuente, 'desconocido');
    R.sep('FORMATO'); R.error(fmtError);
    R.flag('formatoValido', false);
    R.resumen(0, 0); R.imprimir(); return R;
  }
  R.flag('formatoValido', true);
  R.flag('formato', fmtTipo);

  const blob = normalizarABlob(rawBlob, fmtTipo);
  R.encabezado(fuente, fmtTipo);

  const errEst = validarEstructura(blob);
  if (errEst.length) {
    R.sep('ESTRUCTURA'); errEst.forEach(e => R.error(e));
    R.flag('estructuraValida', false);
    R.resumen(0, 0); R.imprimir(); return R;
  }
  R.flag('estructuraValida', true);

  const perfil    = blob.cleo_perfil        || {};
  const tipoPerfil = blob.cleo_tipo_perfil  || perfil.tipoPerfil || null;
  const clientes  = blob.cleo_clientes      || [];
  const cots      = blob.cleo_cots          || [];
  const pedidos   = blob.cleo_pedidos       || [];
  const ventas    = blob.cleo_ventas        || [];
  const servicios = blob.cleo_servicios     || [];
  const prodCat   = blob.cleo_productos_cat || [];

  const idClientes = new Set(clientes.map(c => c.id).filter(Boolean));
  const idCots     = new Set(cots.map(c => c.id).filter(Boolean));

  // ── 1. PERFIL ──────────────────────────────────────────────────────────────
  R.sep('PERFIL');
  R.info(`tipo_perfil: ${tipoPerfil ?? '(no definido)'}`);
  const PERFIL_CONOCIDOS = new Set([
    'nombre','tuNombre','tipoPerfil','telefono','email','color','colorSecundario',
    'banco','bancoaccount','bancoclabe','bancotitular','moneda',
    'logo','mensaje','condicionesPago',
    'redes_tt','redes_ig','redes_fb',
    // camelCase que van a negocios.config
    'redesTT','redesIG','redesFB','colorTexto',
    // bancotarjeta, bancoinstrucciones, direccion, condiciones → negocios.config
    'bancotarjeta','bancoinstrucciones','direccion','condiciones','color_texto',
    // estado de UI → negocios.datos_ui
    'onboardingListo',
    // otros campos operativos
    'modoDemo','ultimaVez',
  ]);
  const pSinMap = Object.keys(perfil).filter(k => !PERFIL_CONOCIDOS.has(k));
  if (pSinMap.length) R.aviso(`Campos sin correspondencia: ${pSinMap.join(', ')}`);
  else R.ok('Campos del perfil reconocidos (redes/colorTexto→config; onboardingListo→datos_ui).');

  // ── 2. CLIENTES ───────────────────────────────────────────────────────────
  R.sep(`CLIENTES  (${clientes.length})`);
  const dupsC = duplicados(clientes,'id');
  if (dupsC.length) { R.error(`id duplicados: ${dupsC.join(' | ')}`); R.flag('hasDupCliente',true); } else R.flag('hasDupCliente',false);
  const extraC = camposExtra(clientes, CLIENTES_CONOCIDOS);
  if (extraC.length) R.aviso(`Campos sin correspondencia: ${extraC.join(', ')}`);

  // conflicto items vs itemsInteres: si ambos existen en el mismo cliente y difieren → error
  let hayItemsConflicto = false;
  for (const c of clientes) {
    if (c.items != null && c.itemsInteres != null) {
      if (JSON.stringify(c.items) !== JSON.stringify(c.itemsInteres)) {
        hayItemsConflicto = true;
        R.error(`Cliente ${c.id} — CONFLICTO: 'items' e 'itemsInteres' coexisten con valores distintos. Requiere resolución manual.`);
      }
    }
  }
  R.flag('hayItemsConflicto', hayItemsConflicto);

  // tipoSeguimientoPostVenta: advertir si cliente tiene múltiples pedidos (asignación a oportunidad puede ser ambigua)
  const nPedPorCliente = {};
  blob.cleo_pedidos && (blob.cleo_pedidos || []).forEach(p => { if (p.clienteId) nPedPorCliente[p.clienteId] = (nPedPorCliente[p.clienteId]||0)+1; });
  const ambiguosTipoSeg = clientes.filter(c => c.tipoSeguimientoPostVenta && (nPedPorCliente[c.id]||0) > 1);
  if (ambiguosTipoSeg.length) R.aviso(`${ambiguosTipoSeg.length} cliente(s) con tipoSeguimientoPostVenta y múltiples pedidos — asignación a oportunidad marcada como ambigua: ${ambiguosTipoSeg.map(c=>c.id).join(', ')}.`);

  const historial = clientes.flatMap(c => (Array.isArray(c.historialContactos)?c.historialContactos:[]).map(h=>({...h,_cliId:c.id})));
  const recs      = clientes.flatMap(c => (Array.isArray(c.recordatorios)?c.recordatorios:[]).map(r=>({...r,_cliId:c.id})));
  const legacySeg = clientes.filter(c => c.seguimientoFecha);
  R.info(`Historial: ${historial.length} entrada(s).`);
  R.info(`Recordatorios: ${recs.length} en array + ${legacySeg.length} legacy (seguimientoFecha).`);
  R.flag('nLegacySeg', legacySeg.length);
  if (legacySeg.length) R.aviso(`${legacySeg.length} cliente(s) con seguimientoFecha legacy → se añadirán como recordatorios con cleo_id='legacy_sf_{cleo_id}' (estable, deduplicable) y categoría='sin_clasificar'.`);

  // duplicados historial (global)
  const dupsH = duplicados(historial,'id');
  if (dupsH.length) { R.error(`Historial — id duplicados (global): ${dupsH.join(' | ')}`); R.flag('hasDupHistorial',true); } else R.flag('hasDupHistorial',false);

  // duplicados recordatorios (global)
  const dupsR = duplicados(recs.filter(r=>r.id!=null),'id');
  if (dupsR.length) { R.error(`Recordatorios — id duplicados (global): ${dupsR.join(' | ')}`); R.flag('hasDupRec',true); } else R.flag('hasDupRec',false);

  // validaciones internas historial y recordatorios
  const histTipoInv = historial.filter(h => h.tipo && !HIST_TIPO.has(h.tipo));
  if (histTipoInv.length) R.aviso(`Historial — tipo fuera de rango (${histTipoInv.length}): ${[...new Set(histTipoInv.map(h=>h.tipo))].join(', ')}`);
  const histDangling = historial.filter(h => h.cotizacionId && !idCots.has(h.cotizacionId));
  if (histDangling.length) R.aviso(`Historial — cotizacionId dangling (${histDangling.length}): ${histDangling.map(h=>h.cotizacionId).join(', ')}`);
  const recCatInv = recs.filter(r => r.categoria && !REC_CATEGORIA.has(r.categoria));
  if (recCatInv.length) R.aviso(`Recordatorios — categoria fuera de rango: ${[...new Set(recCatInv.map(r=>r.categoria))].join(', ')}`);
  const recSinCampoNota = recs.filter(r => r.texto != null);  // campo obsoleto
  if (recSinCampoNota.length) R.aviso(`${recSinCampoNota.length} recordatorio(s) con campo "texto" en lugar de "nota" — campo antiguo o incorrecto.`);

  // ── 3. OPORTUNIDADES ─────────────────────────────────────────────────────
  R.sep('OPORTUNIDADES — reglas de conversión');
  if (tipoPerfil === 'productos') {
    const sinEP = clientes.filter(c => !c.estadoProspecto);
    const conEP = clientes.filter(c => c.estadoProspecto);
    R.info(`Modo productos: ${conEP.length} cliente(s) con estadoProspecto → oportunidad. ${sinEP.length} sin estadoProspecto → solo cliente, sin oportunidad.`);
    if (sinEP.length) R.aviso(`${sinEP.length} cliente(s) con estadoProspecto=null — se insertan como clientes pero sin oportunidad asociada.`);
    const fuera = clientes.filter(c => c.estadoProspecto != null && !ESTADOPROSPECTO.has(c.estadoProspecto));
    if (fuera.length) R.aviso(`estadoProspecto fuera de rango (${fuera.length}): ${[...new Set(fuera.map(c=>c.estadoProspecto))].join(', ')}`);
    else R.ok('estadoProspecto dentro de rango.');
  } else if (tipoPerfil === 'servicios') {
    const nIndep  = cots.filter(c => c.vinculadaOportunidadActual === false).length;
    const nAmb    = cots.filter(c => c.vinculadaOportunidadActual !== false).length;
    R.info(`Cotizaciones independientes: ${nIndep} → ${nIndep} oportunidad(es) a crear.`);
    if (nAmb) R.aviso(`Cotizaciones ambiguas: ${nAmb} → oportunidad_id=NULL, asignación manual en fase dual.`);
    else R.ok('Sin cotizaciones ambiguas.');
    // clientes en etapa activa sin cotizaciones
    const conCot = new Set(cots.map(c=>c.clienteId));
    const sinCot = clientes.filter(c => ['cotizacion_enviada','negociacion','nuevo_contacto'].includes(c.etapa) && !conCot.has(c.id));
    if (sinCot.length) R.aviso(`${sinCot.length} cliente(s) en etapa activa sin cotizaciones — oportunidad a definir (ver DECISIONES).`);
  } else R.aviso(`tipo_perfil desconocido: '${tipoPerfil}'`);

  // ── 4. COTIZACIONES ───────────────────────────────────────────────────────
  R.sep(`COTIZACIONES  (${cots.length})`);
  const dupsQ = duplicados(cots,'id');
  if (dupsQ.length) { R.error(`id duplicados: ${dupsQ.join(' | ')}`); R.flag('hasDupCot',true); } else R.flag('hasDupCot',false);
  const extraQ = camposExtra(cots, COTS_CONOCIDOS);
  if (extraQ.length) R.aviso(`Campos sin correspondencia: ${extraQ.join(', ')}`);
  const cotDangling = cots.filter(c => c.clienteId && !idClientes.has(c.clienteId));
  if (cotDangling.length) R.aviso(`clienteId dangling (${cotDangling.length}): ${cotDangling.map(c=>`${c.id}→${c.clienteId}`).join(', ')}`);
  const cotEstInv = cots.filter(c => c.estatus && !COT_ESTATUS.has(c.estatus));
  if (cotEstInv.length) R.aviso(`estatus fuera de rango: ${[...new Set(cotEstInv.map(c=>c.estatus))].join(', ')}`);

  // conflicto monto vs total: si ambos existen y difieren → error
  let hayCotMontoConflicto = false;
  for (const c of cots) {
    if (c.total != null && c.monto != null && Number(c.total) !== Number(c.monto)) {
      hayCotMontoConflicto = true;
      R.error(`${c.id} — CONFLICTO: total=${c.total} y monto=${c.monto} coexisten con valores distintos. Requiere resolución manual.`);
    }
  }
  R.flag('hasCotMontoConflicto', hayCotMontoConflicto);

  // cantidad en cotizaciones: debe coincidir con sum(items[].cantidad) si hay items
  for (const c of cots) {
    if (c.cantidad != null && Array.isArray(c.items) && c.items.length > 0) {
      const sumCant = c.items.reduce((s, it) => s + Number(it.cantidad || 0), 0);
      if (c.cantidad !== sumCant) {
        R.aviso(`${c.id} — cantidad=${c.cantidad} difiere de sum(items[].cantidad)=${sumCant}. Conservar valor original del blob.`);
      }
    }
  }

  let hayMontoInvalido=false, hayOverpaid=false, hayPagoParcial=false;
  for (const c of cots) {
    // usar monto efectivo: total si existe, si no monto; reportar el campo usado
    const campoMonto = c.total != null ? 'total' : (c.monto != null ? 'monto' : null);
    if (!campoMonto) continue;
    const pa = analizarPagos(c, campoMonto);
    if (!pa) continue;
    if (pa.invalidos.length) { hayMontoInvalido=true; R.error(`${c.id} — monto inválido en pagos: ${pa.invalidos.map(p=>`id=${p.id} val=${JSON.stringify(p.monto)}`).join(', ')}`); }
    if (pa.diff < -0.01) { hayOverpaid=true; R.error(`${c.id} — pagos (${pa.suma.toFixed(2)}) superan total (${pa.total.toFixed(2)}).`); }
    else if (pa.diff > 0.01) { hayPagoParcial=true; R.info(`${c.id} — pago parcial: cobrado ${pa.suma.toFixed(2)}/total ${pa.total.toFixed(2)}.`); }
    else if (!pa.invalidos.length) R.ok(`${c.id} — pagos completos.`);
  }

  // ── 5. PEDIDOS  (⚑ campos corregidos respecto a SEGUIMIENTO.md) ──────────
  R.sep(`PEDIDOS  (${pedidos.length})`);
  const dupsP = duplicados(pedidos,'id');
  if (dupsP.length) R.error(`id duplicados: ${dupsP.join(' | ')}`);
  else R.ok('Sin duplicados de id.');
  const extraP = camposExtra(pedidos, PEDIDOS_CONOCIDOS);
  if (extraP.length) R.aviso(`Campos sin correspondencia: ${extraP.join(', ')}`);
  const pedDangling = pedidos.filter(p => p.clienteId && !idClientes.has(p.clienteId));
  if (pedDangling.length) R.aviso(`clienteId dangling (${pedDangling.length}): ${pedDangling.map(p=>`${p.id}→${p.clienteId}`).join(', ')}`);

  // cotizacionId dangling + coherencia de cliente
  const pedCotDangling = pedidos.filter(p => p.cotizacionId && !idCots.has(p.cotizacionId));
  if (pedCotDangling.length) R.aviso(`cotizacionId dangling (${pedCotDangling.length}): ${pedCotDangling.map(p=>`${p.id}→${p.cotizacionId}`).join(', ')}`);
  R.flag('hasCotIdDangling', pedCotDangling.length > 0);

  // coherencia cliente: pedido.clienteId debe coincidir con cotizacion.clienteId
  const cotClienteMap = new Map(cots.map(c=>[c.id, c.clienteId]));
  const pedIncoherente = pedidos.filter(p => p.cotizacionId && idCots.has(p.cotizacionId) &&
    cotClienteMap.get(p.cotizacionId) != null &&
    p.clienteId != null &&
    String(cotClienteMap.get(p.cotizacionId)) !== String(p.clienteId));
  if (pedIncoherente.length) { R.error(`pedido/cotización — clienteId incoherente (${pedIncoherente.length}): ${pedIncoherente.map(p=>`ped ${p.id}: cli=${p.clienteId} vs cot ${p.cotizacionId}: cli=${cotClienteMap.get(p.cotizacionId)}`).join(' | ')}`); R.flag('hasClienteIncoherente',true); }
  else { R.flag('hasClienteIncoherente',false); }

  // estadoPedido (⚑ nombre correcto)
  const pedSinEstado = pedidos.filter(p => !p.estadoPedido);
  if (pedSinEstado.length) R.aviso(`${pedSinEstado.length} pedido(s) sin estadoPedido (⚑ campo correcto: estadoPedido, no estado).`);
  const pedEstNorm = pedidos.filter(p => p.estadoPedido === 'pendiente');
  if (pedEstNorm.length) R.info(`${pedEstNorm.length} pedido(s) con estadoPedido="pendiente" → se normalizará a "preparando".`);
  const pedEstInv = pedidos.filter(p => p.estadoPedido && !PEDIDO_ESTADO_NORM[p.estadoPedido]);
  if (pedEstInv.length) R.aviso(`estadoPedido fuera de rango: ${[...new Set(pedEstInv.map(p=>p.estadoPedido))].join(', ')}`);

  // total (⚑ blob usa total, no montoTotal)
  const pedSinTotal = pedidos.filter(p => p.total == null && p.montoTotal != null);
  if (pedSinTotal.length) R.error(`${pedSinTotal.length} pedido(s) con campo "montoTotal" en lugar de "total" — nombre de campo incorrecto en el blob.`);

  // origenVenta (⚑ blob usa origenVenta, no origen)
  const pedOrigenInv = pedidos.filter(p => p.origenVenta && !PEDIDO_ORIGEN.has(p.origenVenta));
  if (pedOrigenInv.length) R.aviso(`origenVenta fuera de rango: ${[...new Set(pedOrigenInv.map(p=>p.origenVenta))].join(', ')}`);

  for (const p of pedidos) {
    const pa = analizarPagos(p,'total');  // ⚑ campoTotal es 'total'
    if (!pa) continue;
    if (pa.invalidos.length) { hayMontoInvalido=true; R.error(`${p.id} — monto inválido en pagos: ${pa.invalidos.map(pg=>`id=${pg.id}`).join(', ')}`); }
    if (pa.diff < -0.01) { hayOverpaid=true; R.error(`${p.id} — pagos superan total.`); }
    else if (pa.diff > 0.01) { hayPagoParcial=true; R.info(`${p.id} — pago parcial: ${pa.suma.toFixed(2)}/${pa.total.toFixed(2)}.`); }
  }

  // ── 6. VENTAS ─────────────────────────────────────────────────────────────
  R.sep(`VENTAS  (${ventas.length})`);
  const dupsV = duplicados(ventas,'id');
  if (dupsV.length) R.error(`id duplicados: ${dupsV.join(' | ')}`); else R.ok('Sin duplicados.');
  const vtaDangling = ventas.filter(v => v.clienteId && !idClientes.has(v.clienteId));
  if (vtaDangling.length) R.aviso(`clienteId dangling (${vtaDangling.length}).`);

  const tiposBlobEncontrados = [...new Set(ventas.map(v=>v.tipo).filter(Boolean))];
  const tiposNoSchema = tiposBlobEncontrados.filter(t => !VENTA_TIPO_SCHEMA.has(t));
  if (tiposNoSchema.length) {
    R.aviso(`ventas.tipo con valores fuera del schema (${tiposNoSchema.join(', ')}) — DECISIÓN PENDIENTE: definir mapeo a normal/rapida antes del INSERT.`);
    R.flag('hasVentaTipoDecision', true);
  } else R.flag('hasVentaTipoDecision', false);

  for (const v of ventas) {
    const pa = analizarPagos(v,'monto');
    if (!pa) continue;
    if (pa.invalidos.length) { hayMontoInvalido=true; R.error(`${v.id} — monto inválido.`); }
    if (pa.diff < -0.01) { hayOverpaid=true; R.error(`${v.id} — pagos superan monto.`); }
    else if (pa.diff > 0.01) { hayPagoParcial=true; R.info(`${v.id} — pago parcial.`); }
    else if (!pa.invalidos.length) R.ok(`${v.id} — pagos completos.`);
  }

  // ── 7. PAGOS — duplicados globales ────────────────────────────────────────
  R.sep('PAGOS — duplicados globales');
  const todosPagos = [
    ...cots.flatMap(c=>(Array.isArray(c.pagos)?c.pagos:[]).map(p=>({...p,_o:`cot:${c.id}`}))),
    ...pedidos.flatMap(p=>(Array.isArray(p.pagos)?p.pagos:[]).map(pg=>({...pg,_o:`ped:${p.id}`}))),
    ...ventas.flatMap(v=>(Array.isArray(v.pagos)?v.pagos:[]).map(p=>({...p,_o:`vta:${v.id}`}))),
  ];
  const dupsPG = duplicados(todosPagos.filter(p=>p.id!=null),'id');
  if (dupsPG.length) { R.error(`id duplicados entre todas las colecciones: ${dupsPG.join(' | ')}`); R.flag('hasDupPago',true); }
  else { R.ok(`Sin duplicados en ${todosPagos.length} pago(s).`); R.flag('hasDupPago',false); }

  R.flag('hasMontoInvalido', hayMontoInvalido);
  R.flag('hasOverpaid',      hayOverpaid);
  R.flag('hasPagoParcial',   hayPagoParcial);

  // ── 8. CATÁLOGO ───────────────────────────────────────────────────────────
  R.sep('CATÁLOGO');
  const dupsSrv = duplicados(servicios,'id');
  if (dupsSrv.length) { R.error(`cleo_servicios — id duplicados: ${dupsSrv.join(' | ')}`); R.flag('hasDupSrv',true); }
  else { R.ok('cleo_servicios: sin duplicados.'); R.flag('hasDupSrv',false); }
  const dupsPrd = duplicados(prodCat,'id');
  if (dupsPrd.length) R.error(`cleo_productos_cat — id duplicados: ${dupsPrd.join(' | ')}`);
  else R.ok('cleo_productos_cat: sin duplicados.');
  const colision = prodCat.filter(p=>p.id && new Set(servicios.map(s=>s.id)).has(p.id)).map(p=>p.id);
  if (colision.length) R.info(`IDs en ambos catálogos: ${colision.join(', ')} — el campo modo los distingue.`);

  // ── 9. TRANSFORMACIÓN ────────────────────────────────────────────────────
  R.sep('TRANSFORMACIÓN — origen vs. destino (filas completas)');
  const { conteos, filas } = transformar(blob);
  const b=conteos.blob, d=conteos.destino;
  R.info(`Clientes:       ${b.clientes} → ${d.clientes} filas`);
  R.info(`Historial:      ${b.historial} → ${d.historial} filas`);
  R.info(`Recordatorios:  ${b.recordatorios_array} array + ${b.recordatorios_legacy} legacy → ${d.recordatorios} filas`);
  R.info(`Cotizaciones:   ${b.cotizaciones} → ${d.cotizaciones} filas`);
  R.info(`Pedidos:        ${b.pedidos} → ${d.pedidos} filas`);
  R.info(`Ventas:         ${b.ventas} → ${d.ventas} filas`);
  R.info(`Pagos (total):  ${b.pagos} → ${d.pagos} filas`);
  R.info(`Catálogo:       ${b.catalogo} → ${d.catalogo} filas`);
  R.info(`Mov. inventario: ${b.movimientos_inventario} con id → ${d.movimientos_inventario} a insertar (dedup en DB)`);
  R.info(`Oportunidades a crear: ${d.oportunidades}`);
  if (conteos.nSinTransformar>0) R.info(`Sin oportunidad automática: ${conteos.nSinTransformar} cotizacion(es) ambiguas.`);
  R.info(`Monto total cots: ${conteos.montos.cotizaciones.toFixed(2)}`);
  R.info(`Monto total peds: ${conteos.montos.pedidos.toFixed(2)}`);
  R.info(`Monto total vtas: ${conteos.montos.ventas.toFixed(2)}`);

  const pedConArchivo = filas.pedidos.filter(p=>p._pendiente_archivo).length;
  const cotConArchivo = filas.cotizaciones.filter(c=>c._pendiente_archivo).length;
  if (pedConArchivo+cotConArchivo > 0)
    R.aviso(`${pedConArchivo+cotConArchivo} documento(s) con archivoAdjunto — metadato presente, binario en Storage (ver DECISIONES).`);

  if (conteos.pendientes.length > 0) {
    R.info(`Elementos con decisión pendiente individual: ${conteos.pendientes.length}`);
    conteos.pendientes.slice(0,5).forEach(p => R.info(`  · ${p}`));
    if (conteos.pendientes.length>5) R.info(`  ... y ${conteos.pendientes.length-5} más.`);
  }
  R.flag('nSinTransformar', conteos.nSinTransformar);

  // ── 10. DECISIONES DE NEGOCIO ─────────────────────────────────────────────
  R.sep('DECISIONES DE NEGOCIO PENDIENTES');
  DECISIONES_PENDIENTES.forEach((d,i) => R.info(`${i+1}. ${d}`));
  R.flag('nDecisiones', DECISIONES_PENDIENTES.length);

  R.resumen(conteos.nSinTransformar, DECISIONES_PENDIENTES.length);
  R.imprimir();
  return R;
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS AUTOMÁTICOS  (--test-unit)
// ══════════════════════════════════════════════════════════════════════════════

function correrTestsUnitarios() {
  let ok=0, fail=0;
  function assert(cond,desc) {
    if (cond) { console.log(`  ✓ ${desc}`); ok++; }
    else      { console.log(`  ✗ FALLÓ: ${desc}`); fail++; }
  }

  // ─── A: DATOS_PRUEBA_BLOB (escenario blob con errores conocidos) ──────────
  console.log('\n[A — blob con errores conocidos]');
  const rA = analizar(DATOS_PRUEBA_BLOB,'DATOS_PRUEBA_BLOB',true);
  assert(rA.flags.formatoValido,'Formato blob reconocido');
  assert(rA.flags.formato==='blob','Formato identificado como blob');
  assert(rA.flags.hasDupCliente,'cli_01 duplicado detectado');
  assert(rA.flags.hasDupHistorial,'hc_02 duplicado detectado (global)');
  assert(rA.flags.hasDupCot,'cot_01 duplicado detectado');
  assert(rA.flags.hasDupPago,'pag_01 duplicado global detectado');
  assert(rA.flags.hasDupSrv,'srv_01 duplicado en servicios detectado');
  assert(rA.flags.hasMontoInvalido,'Monto no numérico detectado como error');
  assert(rA.flags.hasOverpaid,'Suma > total detectado como error');
  assert(rA.flags.hasPagoParcial,'Pago parcial como INFO (no error ni aviso)');
  assert(rA.flags.hasClienteIncoherente,'ped_03/cot_01 incoherencia de cliente detectada');
  assert(rA.flags.aptoParaMigrar===false,'No apto para migrar (suprimido hasta decisiones)');
  assert(rA.nErrores >= 6,`≥6 errores bloqueantes (encontrados: ${rA.nErrores})`);
  assert(rA.flags.nDecisiones === 0,`0 decisiones pendientes (todas resueltas) — encontradas: ${rA.flags.nDecisiones}`);

  // ─── B: cleo-export (detección y normalización) ───────────────────────────
  console.log('\n[B — formato cleo-export]');
  const rB = analizar(DATOS_PRUEBA_EXPORT,'DATOS_PRUEBA_EXPORT',true);
  assert(rB.flags.formatoValido,'Formato cleo-export reconocido');
  assert(rB.flags.formato==='cleo-export','Formato identificado como cleo-export');
  assert(rB.nErrores===0,`Exportación limpia: 0 errores (encontrados: ${rB.nErrores})`);

  // ─── C: formato desconocido rechazado ────────────────────────────────────
  console.log('\n[C — formato desconocido rechazado]');
  const rC = analizar({datos_raros:[1,2,3],version_app:'4.2'},'blob_raro',true);
  assert(rC.flags.formatoValido===false,'Formato desconocido rechazado con error');
  assert(rC.nErrores>=1,'Al menos 1 error de formato');

  // ─── D: estructura inválida (colección no es array) ──────────────────────
  console.log('\n[D — colección no-array rechazada]');
  const rD = analizar({cleo_perfil:{},cleo_clientes:'no soy array',cleo_cots:42},'blobMal',true);
  assert(rD.flags.formatoValido,'Formato blob detectado aunque tenga errores');
  assert(rD.flags.estructuraValida===false,'Estructura inválida detectada');
  assert(rD.nErrores>=2,'≥2 errores de estructura');

  // ─── E: monto inválido como error, parcial como info ─────────────────────
  console.log('\n[E — importe inválido=error; parcial=info]');
  const blobE = {
    cleo_perfil:{nombre:'X',tipoPerfil:'servicios',moneda:'MXN'}, cleo_tipo_perfil:'servicios',
    cleo_clientes:[],
    cleo_cots:[
      {id:'c_inv',clienteId:null,total:100,estatus:'Pendiente',vinculadaOportunidadActual:false,
       pagos:[{id:'p1',monto:'texto',fecha:'2026-01-01'}]},
      {id:'c_over',clienteId:null,total:100,estatus:'Pendiente',vinculadaOportunidadActual:false,
       pagos:[{id:'p2',monto:200,fecha:'2026-01-01'}]},
      {id:'c_part',clienteId:null,total:500,estatus:'Pendiente',vinculadaOportunidadActual:false,
       pagos:[{id:'p3',monto:250,fecha:'2026-01-01'}]},
    ],
    cleo_pedidos:[], cleo_ventas:[], cleo_servicios:[], cleo_productos_cat:[],
  };
  const rE = analizar(blobE,'blobE',true);
  assert(rE.flags.hasMontoInvalido,'Monto texto detectado como error');
  assert(rE.flags.hasOverpaid,'Exceso detectado como error');
  assert(rE.flags.hasPagoParcial,'Pago parcial detectado como info');
  assert(rE.nErrores===2,`Solo 2 errores (inválido+exceso), no el parcial: ${rE.nErrores}`);

  // ─── F: coherencia pedido↔cotización (cliente distinto) ──────────────────
  console.log('\n[F — coherencia cliente pedido/cotización]');
  const blobF = {
    cleo_perfil:{nombre:'X',tipoPerfil:'servicios',moneda:'MXN'}, cleo_tipo_perfil:'servicios',
    cleo_clientes:[{id:'c1',historialContactos:[],recordatorios:[]},{id:'c2',historialContactos:[],recordatorios:[]}],
    cleo_cots:[{id:'ct1',clienteId:'c1',total:500,estatus:'Aceptada',vinculadaOportunidadActual:false,pagos:[]}],
    cleo_pedidos:[{id:'ped1',clienteId:'c2',cotizacionId:'ct1',total:500,estadoPedido:'preparando',pagos:[]}],
    cleo_ventas:[], cleo_servicios:[], cleo_productos_cat:[],
  };
  const rF = analizar(blobF,'blobF',true);
  assert(rF.flags.hasClienteIncoherente,'Incoherencia de cliente pedido/cotización detectada');
  assert(rF.nErrores>=1,'Al menos 1 error de coherencia');

  // ─── G: blob limpio (productos, sin errores) ──────────────────────────────
  console.log('\n[G — blob limpio]');
  const blobG = {
    cleo_perfil:{nombre:'Tienda',tuNombre:'Luis',tipoPerfil:'productos',moneda:'MXN'},
    cleo_tipo_perfil:'productos',
    cleo_clientes:[
      {id:'c1',nombre:'Ana',estadoProspecto:'Nueva',historialContactos:[],recordatorios:[]},
    ],
    cleo_cots:[],
    cleo_pedidos:[{id:'p1',clienteId:'c1',total:500,estadoPedido:'preparando',origenVenta:'registro_manual',pagos:[]}],
    cleo_ventas:[],
    cleo_servicios:[],
    cleo_productos_cat:[{id:'cat1',nombre:'Aretes',precio:350}],
  };
  const rG = analizar(blobG,'blobG',true);
  assert(rG.nErrores===0,`Blob limpio: 0 errores (${rG.nErrores})`);
  assert(rG.nAvisos===0,`Blob limpio: 0 avisos (${rG.nAvisos})`);
  assert(rG.flags.aptoParaMigrar===false,'Mensaje "apto" suprimido aunque no haya errores (decisiones pendientes)');

  // ─── resultado ────────────────────────────────────────────────────────────
  console.log('');
  console.log('─'.repeat(62));
  console.log(`  Tests: ${ok} pasaron, ${fail} fallaron.`);
  console.log('─'.repeat(62));
  return fail;
}

// ══════════════════════════════════════════════════════════════════════════════
// IMPRIMIR MATRIZ DE CAMPOS
// ══════════════════════════════════════════════════════════════════════════════

function imprimirMatriz() {
  const hr = '─'.repeat(62);
  console.log(hr);
  console.log('MATRIZ CAMPOS  origen (blob) → destino (DB) → validación');
  console.log(hr);
  for (const [entidad, campos] of Object.entries(MATRIZ)) {
    console.log(`\n[${entidad}]`);
    for (const c of campos) {
      const requerido = c.req ? ' REQ' : '';
      const nota = c.nota ? `  # ${c.nota}` : '';
      console.log(`  ${c.origen.padEnd(38)} → ${(c.destino+' ('+c.tipo+')').padEnd(28)}${requerido}${nota}`);
    }
  }
  console.log('');
  console.log('[DECISIONES DE NEGOCIO PENDIENTES]');
  DECISIONES_PENDIENTES.forEach((d,i) => console.log(`  ${i+1}. ${d}`));
  console.log(hr);
}

// ══════════════════════════════════════════════════════════════════════════════
// ENTRADA
// ══════════════════════════════════════════════════════════════════════════════

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--test-unit')) { process.exit(correrTestsUnitarios()>0?1:0); }
  if (args.includes('--matriz'))    { imprimirMatriz(); process.exit(0); }
  if (args.includes('--test'))      { process.exit(analizar(DATOS_PRUEBA_BLOB,'DATOS_PRUEBA_BLOB').nErrores>0?1:0); }
  if (args[0] && !args[0].startsWith('--')) {
    const fp = path.resolve(args[0]);
    let raw;
    try { raw = JSON.parse(fs.readFileSync(fp,'utf8')); }
    catch(e) { process.stderr.write(`ERROR: no se pudo leer ${fp}: ${e.message}\n`); process.exit(1); }
    process.exit(analizar(raw,fp).nErrores>0?1:0);
  }
  process.stderr.write(
    'Uso:\n  node tests/analizar-migracion.cjs <ruta/al/blob.json>\n' +
    '  node tests/analizar-migracion.cjs --test\n' +
    '  node tests/analizar-migracion.cjs --test-unit\n' +
    '  node tests/analizar-migracion.cjs --matriz\n'
  );
  process.exit(1);
}

main();
