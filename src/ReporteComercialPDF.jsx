import React from "react";
import { Document, Page, View, Text, StyleSheet, pdf } from "@react-pdf/renderer";

// ── Helpers de seguridad locales ───────────────────────────────────────────
// Este archivo es independiente de CLEO.jsx (evita imports circulares, mismo
// criterio que CotizacionPDF.jsx/ComprobantePDF.jsx), así que mantiene sus
// propias copias mínimas de las validaciones que necesita. Nunca se usa
// dangerouslySetInnerHTML, nunca se interpretan etiquetas de usuario, nunca
// se cargan imágenes remotas , todo el contenido de usuario se renderiza
// exclusivamente dentro de <Text>, como texto plano.

function textoPlanoSeguro(valor, maxLen) {
  if (valor === null || valor === undefined) return "";
  var texto = String(valor);
  texto = texto.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  var limite = maxLen || 2000;
  if (texto.length > limite) texto = texto.slice(0, limite) + "…";
  return texto;
}

// numeroSeguro: además de blindar contra NaN/infinito, redondea a 2
// decimales a salvo de coma flotante , mismo criterio que redondearDinero()
// en CLEO.jsx (archivo independiente, evita imports circulares). Los
// centavos reales SIEMPRE se conservan (ver formatearMonto abajo) , esta
// función solo evita que un dato ya dañado (arrastre de coma flotante
// desde CLEO.jsx) se propague con falsa precisión.
function numeroSeguro(valor) {
  var n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  var signo = n < 0 ? -1 : 1;
  return (signo * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
}

function nombreArchivoSeguroPDF(valor, fallback) {
  var texto = String(valor == null ? "" : valor);
  texto = texto.replace(/[\/\\:*?"<>|]/g, "");
  texto = texto.replace(/[\r\n\t\x00-\x1F\x7F]/g, "");
  texto = texto.replace(/\s+/g, "_");
  texto = texto.slice(0, 120);
  return texto || fallback;
}

// El cobro neto de un periodo puede ser negativo (ej. un pedido cobrado en
// un periodo anterior se cancela y su reversión cae dentro de ESTE rango) ,
// se muestra como "-$X" en vez de "$-X" para que se lea sin ambigüedad.
// Conserva los centavos reales (nunca redondea a peso entero) , siempre 2
// decimales , mismo criterio que formatoDinero() en CLEO.jsx y que
// formatearMonto() en CotizacionPDF.jsx/ComprobantePDF.jsx.
function formatearMonto(n) {
  var v = numeroSeguro(n);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "AAAA-MM-DD" → "16 ago 2026" (fecha corta legible) mediante partición de
// texto puro , NUNCA se construye un objeto Date a partir de este string
// (evita el corrimiento de zona horaria de new Date("AAAA-MM-DD"), que lo
// interpreta en UTC).
var MESES_CORTOS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fechaCortaTexto(f) {
  var p = String(f || "").split("-");
  if (p.length !== 3) return textoPlanoSeguro(f, 20);
  var mesIdx = Number(p[1]) - 1;
  var mes = MESES_CORTOS_ES[mesIdx] || p[1];
  return Number(p[2]) + " " + mes + " " + p[0];
}

// Fecha/hora de GENERACIÓN del documento , usa exclusivamente los getters
// LOCALES de Date (getDate/getMonth/getFullYear/getHours/getMinutes), nunca
// toISOString ni ningún componente UTC, para que muestre la hora real de la
// persona que lo genera.
var MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function fechaHoraGeneracionTexto() {
  var d = new Date();
  var fecha = d.getDate() + " de " + MESES_ES[d.getMonth()] + " de " + d.getFullYear();
  var h = d.getHours();
  var min = String(d.getMinutes()).padStart(2, "0");
  var ampm = h >= 12 ? "p.m." : "a.m.";
  var h12 = h % 12; if (h12 === 0) h12 = 12;
  return fecha + " · " + h12 + ":" + min + " " + ampm;
}

// ── Pluralización central ───────────────────────────────────────────────
// Única fuente en todo el reporte para "cantidad + palabra" en singular o
// plural , nunca se vuelve a escribir un ternario ===1?"x":"y" suelto por
// cada frase nueva. `articulo` es opcional ("una"/"un"): cuando se pasa,
// una cantidad de 1 se lee como artículo indefinido natural dentro de una
// frase en prosa ("una cotización") en vez de como dígito ("1 cotización")
// , se omite cuando el número debe seguir siendo un dato visible (conteos,
// listas, tarjetas).
function textoCantidad(n, singular, plural, articulo) {
  var palabra = n === 1 ? singular : plural;
  if (n === 1 && articulo) return articulo + " " + palabra;
  return n + " " + palabra;
}
// Forma verbal/adjetiva según cantidad (ej. "fue rechazada"/"fueron
// rechazadas", "se perdió"/"se perdieron") , para la parte de la frase que
// no es un sustantivo contable. Misma fuente única que textoCantidad.
function formaSegunCantidad(n, formaUno, formaVarios) {
  return n === 1 ? formaUno : formaVarios;
}

// ── Cifras largas (Escalabilidad y estados del diseño) ────────────────────
// Los montos deben soportar 7 dígitos ($1,234,567) sin romper la tarjeta ,
// se reduce el tamaño de fuente por escalones ANTES de permitir que el
// texto se corte o desborde. Nunca se usa en el texto primario del resto
// del reporte (filas, notas) , solo en las 2 cifras grandes de la Sección 1,
// que son las únicas con suficiente margen de crecimiento para justificar
// una escala de reducción propia.
function tamanoMontoGrande(textoFormateado, base) {
  var len = String(textoFormateado || "").length;
  if (len <= 8) return base;
  if (len <= 10) return base - 8;
  if (len <= 13) return base - 14;
  return base - 18;
}

// ── Resaltado de cifras clave dentro de una frase de "Lectura de CLEO" ────
// Única fuente para decidir qué se resalta en negrita dentro de una
// conclusión , se resaltan solo montos en dólares ($1,234), nunca cifras
// sueltas (para no sobrecargar la frase con negritas), consistente con el
// resto del reporte (nunca se inventa contenido, solo se reutiliza el texto
// ya generado por CLEO.jsx tal cual).
var PATRON_MONTO = /\$[\d.,]+/g;
function segmentosResaltados(texto) {
  var partes = [];
  var ultimo = 0;
  var m;
  PATRON_MONTO.lastIndex = 0;
  while ((m = PATRON_MONTO.exec(texto))) {
    if (m.index > ultimo) partes.push({ texto: texto.slice(ultimo, m.index), fuerte: false });
    partes.push({ texto: m[0], fuerte: true });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo), fuerte: false });
  return partes;
}

// ── Tokens de diseño (fijos, alta fidelidad) ──────────────────────────────
// Este rediseño adopta la identidad visual final de CLEO para el reporte
// (paquete de diseño hifi) , los colores YA NO se personalizan por el color
// de marca del negocio (perfil.color/colorSecundario), a diferencia de la
// versión anterior de este documento. Es una decisión explícita del nuevo
// diseño (el README lo marca como "Colores... finales"), no un cálculo ni
// un dato de negocio , el nombre del negocio y el nombre de quien lo generó
// siguen siendo 100% dinámicos.
var AZUL = "#4B5EFC";
var AZUL_CLARO = "#7B8AFC";
var TINTA = "#0B1020";
var TEXTO_PRINCIPAL = "#0F1117";
var TEXTO_SECUNDARIO = "#6B7280";
var TEXTO_APAGADO = "#9CA3AF";
var FONDO_SUAVE = "#F8FAFC";
var BORDE = "#E5E7EB";
var DIVISOR = "#EEF0F4";
var AMBAR_BG = "#FFF7ED", AMBAR_BORDE = "#FED7AA", AMBAR_TXT = "#B45309";
var ROJO_BG = "#FEF2F2", ROJO_BORDE = "#FCA5A5", ROJO_TXT = "#B91C1C";

// ── Estilos ─────────────────────────────────────────────────────────────
// Fuentes estándar embebidas (Helvetica/Helvetica-Bold) , el paquete de
// diseño pide Plus Jakarta Sans, pero es una fuente de Google Fonts que
// requeriría descargarla en cada generación de PDF. Todos los documentos de
// CLEO (CotizacionPDF, ComprobantePDF y este) usan exclusivamente fuentes
// embebidas para que la generación nunca dependa de la red , mismo criterio
// ya establecido en este proyecto, se conserva aquí.
function crearEstilos() {
  return StyleSheet.create({
    pagina: { paddingTop: 36, paddingBottom: 36, paddingHorizontal: 36, fontFamily: "Helvetica", fontSize: 10, color: TEXTO_PRINCIPAL, backgroundColor: "#ffffff" },

    // ── Cabecera (banda oscura) ───────────────────────────────────────
    headerBanda: { backgroundColor: TINTA, borderRadius: 14, padding: 16, marginBottom: 10, position: "relative", overflow: "hidden" },
    headerGlow: { position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: "rgba(75,94,252,0.22)", top: -140, right: -70 },
    headerFila: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
    // headerIzq NO lleva ancho fijo (a diferencia de la versión anterior) ,
    // aquí es headerDer (la tarjeta de periodo) quien lleva flexShrink:0,
    // así el nombre del negocio puede usar todo el espacio disponible y
    // envolver a una segunda línea sin nunca desplazar ni encoger la
    // tarjeta de periodo (mismo criterio, aplicado en la columna que
    // realmente necesita protección en este layout).
    headerIzq: { flex: 1, paddingRight: 16 },
    marcaFila: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
    marcaCuadro: { width: 16, height: 16, borderRadius: 5, backgroundColor: AZUL, alignItems: "center", justifyContent: "center" },
    marcaC: { color: "#ffffff", fontSize: 9, fontFamily: "Helvetica-Bold" },
    marcaLeo: { color: "#ffffff", fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 1, marginLeft: 2 },
    marcaEtiqueta: { color: AZUL_CLARO, fontSize: 8.5, fontFamily: "Helvetica-Bold", letterSpacing: 1.4, marginLeft: 10 },
    tituloNegocio: { color: "#ffffff", fontSize: 20, fontFamily: "Helvetica-Bold", lineHeight: 1.15 },
    tituloNegocioLargo: { fontSize: 16 },
    subtituloNegocio: { color: TEXTO_APAGADO, fontSize: 10, marginTop: 3 },
    periodoCard: { flexShrink: 0, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", borderRadius: 11, paddingVertical: 9, paddingHorizontal: 14, minWidth: 140 },
    periodoFila: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
    periodoLabel: { color: AZUL_CLARO, fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
    periodoValor: { color: "#ffffff", fontSize: 11, fontFamily: "Helvetica-Bold" },
    periodoDivisor: { height: 1, backgroundColor: "rgba(255,255,255,0.14)", marginVertical: 5 },

    // ── Encabezado de sección reutilizado ────────────────────────────
    seccionBlock: { marginBottom: 10 },
    seccionTituloFila: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    seccionTitulo: { color: TEXTO_PRINCIPAL, fontSize: 12.5, fontFamily: "Helvetica-Bold" },
    seccionRegla: { flex: 1, height: 1, backgroundColor: BORDE, marginLeft: 10 },

    // ── Sección 1: las dos cifras de dinero ─────────────────────────
    filaDinero: { flexDirection: "row", marginHorizontal: -6, marginBottom: 7 },
    tarjetaDineroWrap: { width: "50%", paddingHorizontal: 6 },
    tarjetaDineroClara: { backgroundColor: AZUL, borderRadius: 12, padding: 11, minHeight: 72 },
    tarjetaDineroOscura: { backgroundColor: TINTA, borderRadius: 12, padding: 11, minHeight: 72 },
    dineroEtiquetaClara: { color: "rgba(255,255,255,0.8)", fontSize: 8.5, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
    dineroEtiquetaOscura: { color: AZUL_CLARO, fontSize: 8.5, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
    dineroValor: { color: "#ffffff", fontFamily: "Helvetica-Bold", marginTop: 3 },
    dineroNotaClara: { color: "rgba(255,255,255,0.82)", fontSize: 8.5, marginTop: 3, lineHeight: 1.25 },
    dineroNotaOscura: { color: TEXTO_APAGADO, fontSize: 8.5, marginTop: 3, lineHeight: 1.25 },
    notaExtra: { color: TEXTO_SECUNDARIO, fontSize: 8, marginTop: -2, marginBottom: 7, lineHeight: 1.25 },

    // ── Sección 1: métricas secundarias ─────────────────────────────
    filaSecundaria: { flexDirection: "row", marginHorizontal: -6 },
    tarjetaSecWrap: { width: "50%", paddingHorizontal: 6 },
    tarjetaSecundaria: { backgroundColor: FONDO_SUAVE, borderWidth: 1, borderColor: BORDE, borderRadius: 12, padding: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 },
    secTextos: { flex: 1, paddingRight: 8 },
    secLabel: { color: TEXTO_SECUNDARIO, fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
    secSub: { color: TEXTO_APAGADO, fontSize: 8, marginTop: 2, lineHeight: 1.2 },
    secValor: { color: TEXTO_PRINCIPAL, fontSize: 21, fontFamily: "Helvetica-Bold" },
    secValorPct: { fontSize: 13 },

    // ── Bloque de 2 columnas ─────────────────────────────────────────
    dosColumnas: { flexDirection: "row", marginHorizontal: -8, marginBottom: 10 },
    columna: { width: "50%", paddingHorizontal: 8 },

    // Movimiento comercial (tabla sobria, sin color)
    movRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: DIVISOR },
    movRowUltima: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5 },
    movConcepto: { color: TEXTO_PRINCIPAL, fontSize: 9.5, flex: 1, paddingRight: 8 },
    movValor: { color: TEXTO_PRINCIPAL, fontSize: 12, fontFamily: "Helvetica-Bold" },
    movValorDestacado: { color: AZUL, fontSize: 12, fontFamily: "Helvetica-Bold" },

    // Necesita tu atención hoy (con color semántico)
    atencionTarjeta: { borderRadius: 10, borderWidth: 1, paddingVertical: 6.5, paddingHorizontal: 11, marginBottom: 5, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    atencionAmbar: { backgroundColor: AMBAR_BG, borderColor: AMBAR_BORDE },
    atencionNeutra: { backgroundColor: FONDO_SUAVE, borderColor: BORDE },
    atencionRoja: { backgroundColor: ROJO_BG, borderColor: ROJO_BORDE },
    atencionConcepto: { color: TEXTO_PRINCIPAL, fontSize: 9, fontFamily: "Helvetica-Bold", flex: 1, paddingRight: 8 },
    atencionValorAmbar: { color: AMBAR_TXT, fontSize: 13, fontFamily: "Helvetica-Bold" },
    atencionValorNeutro: { color: TEXTO_PRINCIPAL, fontSize: 13, fontFamily: "Helvetica-Bold" },
    atencionValorRojo: { color: ROJO_TXT, fontSize: 13, fontFamily: "Helvetica-Bold" },
    atencionParDoc: { color: TEXTO_SECUNDARIO, fontSize: 8.5, fontFamily: "Helvetica-Bold" },
    atencionParFila: { flexDirection: "row", alignItems: "baseline" },
    tarjetaPositiva: { backgroundColor: FONDO_SUAVE, borderWidth: 1, borderColor: BORDE, borderRadius: 10, padding: 10 },
    tarjetaPositivaTexto: { color: TEXTO_SECUNDARIO, fontSize: 9.5, lineHeight: 1.3 },
    notaColumna: { color: TEXTO_APAGADO, fontSize: 7.6, lineHeight: 1.3, marginTop: 3 },

    // ── Sección 4: "¿Por qué no se cerraron / se perdieron...?" ────────
    // Redactado en lenguaje natural: una sola pérdida NUNCA se muestra
    // como una fila con porcentaje aislado (obliga a interpretar qué
    // representa ese número) , varios motivos SÍ muestran cantidad
    // (número grande, principal) + contexto y porcentaje (subtítulo,
    // secundario). Una tarjeta por motivo, mismo estilo/componente para
    // todas , nunca se ajusta una individualmente.
    s4VacioTexto1: { color: TEXTO_PRINCIPAL, fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 3 },
    s4VacioTexto2: { color: TEXTO_SECUNDARIO, fontSize: 9 },
    motivoGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 },
    motivoCardWrapMitad: { width: "50%", paddingHorizontal: 6, marginBottom: 7 },
    motivoCardWrapCompleto: { width: "100%", paddingHorizontal: 6 },
    motivoCard: { backgroundColor: FONDO_SUAVE, borderWidth: 1, borderColor: BORDE, borderRadius: 10, padding: 9, flexDirection: "row", alignItems: "center" },
    motivoNumero: { color: TEXTO_PRINCIPAL, fontSize: 19, fontFamily: "Helvetica-Bold", marginRight: 10 },
    motivoTextos: { flex: 1 },
    motivoTitulo: { color: TEXTO_PRINCIPAL, fontSize: 10, fontFamily: "Helvetica-Bold" },
    motivoTituloSolo: { color: TEXTO_PRINCIPAL, fontSize: 12, fontFamily: "Helvetica-Bold" },
    motivoDetalle: { color: TEXTO_SECUNDARIO, fontSize: 8.5, marginTop: 2, lineHeight: 1.25 },

    // ── Productos más vendidos en este periodo (SOLO Productos) ────────
    // Tabla simple de 3 columnas , mismo lenguaje visual sobrio que
    // "Movimiento comercial" (filas con separador, sin color de fondo),
    // nunca compite visualmente con las tarjetas de color de arriba.
    prodTablaHead: { flexDirection: "row", paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: BORDE, marginBottom: 2 },
    prodTablaHeadTxt: { color: TEXTO_SECUNDARIO, fontSize: 7.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5 },
    prodRow: { flexDirection: "row", alignItems: "center", paddingVertical: 5.5, borderBottomWidth: 1, borderBottomColor: DIVISOR },
    prodRowUltima: { flexDirection: "row", alignItems: "center", paddingVertical: 5.5 },
    prodColNombre: { flex: 2.2, color: TEXTO_PRINCIPAL, fontSize: 9.5, paddingRight: 8 },
    // Fila especial "Venta sin desglose por producto" (pedidos sin base de
    // precio confiable para atribuir el monto a un producto puntual) , solo
    // cambia el color/estilo del nombre para diferenciarla visualmente de
    // un producto real, nunca esconde el monto ni la excluye de la suma.
    prodColNombreSinDesglose: { color: TEXTO_SECUNDARIO, fontStyle: "italic" },
    prodColUnidades: { flex: 1, color: TEXTO_PRINCIPAL, fontSize: 9.5, textAlign: "center" },
    prodColMonto: { flex: 1, color: TEXTO_PRINCIPAL, fontSize: 9.5, fontFamily: "Helvetica-Bold", textAlign: "right" },
    prodVacioTexto: { color: TEXTO_SECUNDARIO, fontSize: 9.5, fontStyle: "italic", paddingVertical: 6 },

    // ── Lectura de CLEO (bloque oscuro de cierre) ───────────────────────
    lecturaBloque: { backgroundColor: TINTA, borderRadius: 14, padding: 13, position: "relative", overflow: "hidden", marginBottom: 0 },
    lecturaGlow: { position: "absolute", width: 280, height: 280, borderRadius: 140, backgroundColor: "rgba(75,94,252,0.2)", bottom: -170, left: -90 },
    lecturaTituloFila: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
    lecturaMarcaCuadro: { width: 14, height: 14, borderRadius: 4, backgroundColor: AZUL, alignItems: "center", justifyContent: "center", marginRight: 8 },
    lecturaMarcaC: { color: "#ffffff", fontSize: 8, fontFamily: "Helvetica-Bold" },
    lecturaTitulo: { color: "#ffffff", fontSize: 12.5, fontFamily: "Helvetica-Bold" },
    lecturaFila: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 5 },
    lecturaFilaDivisor: { height: 1, backgroundColor: "rgba(255,255,255,0.1)" },
    lecturaIndice: { color: AZUL_CLARO, fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, width: 18, paddingTop: 1 },
    lecturaTexto: { color: "#ffffff", fontSize: 9.5, lineHeight: 1.32, flex: 1 },
    lecturaTextoFuerte: { fontFamily: "Helvetica-Bold" },

    // ── Pie de página ────────────────────────────────────────────────
    footerBar: { position: "absolute", bottom: 16, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: TEXTO_APAGADO, borderTopWidth: 1, borderTopColor: BORDE, paddingTop: 7 },
    footerDer: { fontFamily: "Helvetica-Bold" },
  });
}

// ── Documento ───────────────────────────────────────────────────────────
function DocumentoReporteComercial({ datos }) {
  var s = datos.estilos;
  var esProd = datos.esProductos;
  var s1 = datos.s1, s2 = datos.s2, s3 = datos.s3, s4 = datos.s4, s5 = datos.s5, s6 = datos.s6;

  var montoVendidoTxt = formatearMonto(s1.montoVendido);
  var montoCobradoTxt = formatearMonto(s1.montoCobrado);
  var notaVendido = s1.montoVendido === 0 ? "Este periodo no tuvo ventas registradas." : "Valor total de las ventas cerradas en el periodo.";
  var notaCobrado = s1.montoCobrado === 0 ? "No se registraron pagos en este periodo." : "Pagos que ingresaron durante el periodo.";
  var subVentasCerradas = esProd ? "Pedidos vendidos (no cancelados) en el periodo." : "Cotizaciones aceptadas y ventas directas.";
  // Nunca "N de M" cuando N===M===1 (lectura ambigua/robótica: "1 de 1") ,
  // el caso de un solo contacto nuevo en el periodo se redacta como frase,
  // igual que el caso de cero contactos ya se redactaba aparte.
  var subConversion;
  if (s1.conversionDenominador === 0) {
    subConversion = "No se registraron nuevos contactos en este periodo.";
  } else if (s1.conversionDenominador === 1) {
    subConversion = s1.conversionNumerador === 1
      ? "Tu único contacto nuevo se convirtió en cliente."
      : "Tu único contacto nuevo todavía no se convirtió en cliente.";
  } else {
    subConversion = (s1.conversionNumerador === 1 ? "Uno" : String(s1.conversionNumerador))
      + " de tus " + s1.conversionDenominador + " nuevos contactos se "
      + formaSegunCantidad(s1.conversionNumerador, "convirtió en cliente.", "convirtieron en clientes.");
  }

  var sinPendientes = s3.seguimientosPendientes === 0
    && (esProd ? s3.pedidosPendientesEntrega === 0 : s3.cotizacionesPendientesCantidad === 0)
    && s3.cobrosPendientesCantidad === 0;

  // El título de la Sección 4 cambia según si hubo pérdidas/rechazos en el
  // periodo , cuando no hubo ninguna, "¿Por qué...?" deja de tener sentido
  // como pregunta (no hay nada que explicar), se muestra un título de
  // estado en su lugar.
  var tituloS4 = s4.total === 0
    ? (esProd ? "Estado de las oportunidades" : "Estado de las cotizaciones")
    : (esProd ? "¿Por qué se perdieron algunas oportunidades?" : "¿Por qué no se cerraron algunas cotizaciones?");
  var ruidoSustantivoPlur = esProd ? "oportunidades" : "cotizaciones";

  // "Productos más vendidos en este periodo" , SOLO Productos (s6 viene
  // undefined en Servicios, nunca se renderiza nada de esta sección ahí).
  // Se muestran TODAS las filas (sin límite de 5 ni "Y X productos más") ,
  // ya vienen ordenadas desc por unidades (empate: monto) desde
  // obtenerProductosMasVendidos/construirDatosReporteComercial. Para que la
  // tabla pueda continuar en páginas siguientes sin cortar una fila a la
  // mitad y repitiendo el encabezado de columnas, se divide en bloques de
  // FILAS_PROD_POR_BLOQUE filas , cada bloque (encabezado + sus filas) es
  // un único View con wrap={false}: si no cabe en el espacio restante de la
  // página actual, react-pdf lo mueve completo a la siguiente página (nunca
  // lo parte), lo que en la práctica repite el encabezado cada vez que la
  // tabla salta de página. El número de filas por bloque es una estimación
  // conservadora (fila ~24pt, encabezado ~20pt) con margen amplio frente al
  // alto útil de una página carta (~680pt), para no arriesgar overflow ni
  // siquiera con nombres de producto que ocupen dos líneas.
  var FILAS_PROD_POR_BLOQUE = 20;
  var filasProdTodas = esProd && s6 ? s6.filas : [];
  var hayVentasProdTop = filasProdTodas.length > 0;
  var chunksProdTop = [];
  for (var _i = 0; _i < filasProdTodas.length; _i += FILAS_PROD_POR_BLOQUE) {
    chunksProdTop.push(filasProdTodas.slice(_i, _i + FILAS_PROD_POR_BLOQUE));
  }

  return (
    <Document>
      <Page size="LETTER" style={s.pagina} wrap>
        {/* ── Cabecera ── */}
        <View style={s.headerBanda} wrap={false}>
          <View style={s.headerGlow} />
          <View style={s.headerFila}>
            <View style={s.headerIzq}>
              <View style={s.marcaFila}>
                <View style={s.marcaCuadro}><Text style={s.marcaC}>C</Text></View>
                <Text style={s.marcaLeo}>LEO</Text>
                <Text style={s.marcaEtiqueta}>REPORTE COMERCIAL</Text>
              </View>
              <Text style={datos.nombreNegocio.length > 30 ? [s.tituloNegocio, s.tituloNegocioLargo] : s.tituloNegocio}>{datos.nombreNegocio}</Text>
              <Text style={s.subtituloNegocio}>{datos.nombreUsuario ? "Actividad comercial · preparado por " + datos.nombreUsuario : "Actividad comercial"}</Text>
            </View>
            <View style={s.periodoCard}>
              <View style={s.periodoFila}>
                <Text style={s.periodoLabel}>DESDE</Text>
                <Text style={s.periodoValor}>{datos.desdeTexto}</Text>
              </View>
              <View style={s.periodoDivisor} />
              <View style={s.periodoFila}>
                <Text style={s.periodoLabel}>HASTA</Text>
                <Text style={s.periodoValor}>{datos.hastaTexto}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Sección 1: Así te fue en este periodo ── */}
        <View style={s.seccionBlock} wrap={false}>
          <View style={s.seccionTituloFila}>
            <Text style={s.seccionTitulo}>Así te fue en este periodo</Text>
            <View style={s.seccionRegla} />
          </View>

          <View style={s.filaDinero}>
            <View style={s.tarjetaDineroWrap}>
              <View style={s.tarjetaDineroClara}>
                <Text style={s.dineroEtiquetaClara}>VENTAS GENERADAS</Text>
                <Text style={[s.dineroValor, { fontSize: tamanoMontoGrande(montoVendidoTxt, 28) }]}>{montoVendidoTxt}</Text>
                <Text style={s.dineroNotaClara}>{notaVendido}</Text>
              </View>
            </View>
            <View style={s.tarjetaDineroWrap}>
              <View style={s.tarjetaDineroOscura}>
                <Text style={s.dineroEtiquetaOscura}>DINERO RECIBIDO</Text>
                <Text style={[s.dineroValor, { fontSize: tamanoMontoGrande(montoCobradoTxt, 28) }]}>{montoCobradoTxt}</Text>
                <Text style={s.dineroNotaOscura}>{notaCobrado}</Text>
              </View>
            </View>
          </View>
          {s1.mostrarNotaCobro ? (
            <Text style={s.notaExtra}>Incluye pagos recibidos de ventas registradas anteriormente.</Text>
          ) : null}

          <View style={s.filaSecundaria}>
            <View style={s.tarjetaSecWrap}>
              <View style={s.tarjetaSecundaria}>
                <View style={s.secTextos}>
                  <Text style={s.secLabel}>VENTAS CERRADAS</Text>
                  <Text style={s.secSub}>{subVentasCerradas}</Text>
                </View>
                <Text style={s.secValor}>{s1.ventasCerradas}</Text>
              </View>
            </View>
            <View style={s.tarjetaSecWrap}>
              <View style={s.tarjetaSecundaria}>
                <View style={s.secTextos}>
                  <Text style={s.secLabel}>CONVERSIÓN DE NUEVOS CONTACTOS</Text>
                  <Text style={s.secSub}>{subConversion}</Text>
                </View>
                <Text style={s.secValor}>
                  {s1.conversionDenominador > 0 ? (<>{s1.conversionPct}<Text style={s.secValorPct}>%</Text></>) : "—"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Bloque de 2 columnas: Movimiento comercial + Necesita tu atención hoy ── */}
        <View style={s.dosColumnas} wrap={false}>
          <View style={s.columna}>
            <View style={s.seccionTituloFila}>
              <Text style={s.seccionTitulo}>Movimiento comercial</Text>
              <View style={s.seccionRegla} />
            </View>
            <View>
              <View style={s.movRow}><Text style={s.movConcepto}>Nuevos contactos registrados</Text><Text style={s.movValor}>{s2.nuevosContactos}</Text></View>
              {esProd ? (
                <>
                  <View style={s.movRow}><Text style={s.movConcepto}>Pedidos creados</Text><Text style={s.movValor}>{s2.pedidosCreados}</Text></View>
                  <View style={s.movRow}><Text style={s.movConcepto}>Pedidos entregados</Text><Text style={s.movValor}>{s2.pedidosEntregados}</Text></View>
                  <View style={s.movRowUltima}><Text style={s.movConcepto}>Pedidos cancelados</Text><Text style={s.movValor}>{s2.pedidosCancelados}</Text></View>
                </>
              ) : (
                <>
                  <View style={s.movRow}><Text style={s.movConcepto}>Cotizaciones creadas</Text><Text style={s.movValor}>{s2.cotizacionesCreadas}</Text></View>
                  <View style={s.movRow}><Text style={s.movConcepto}>Cotizaciones aceptadas</Text><Text style={s.movValorDestacado}>{s2.cotizacionesAceptadas}</Text></View>
                  <View style={s.movRow}><Text style={s.movConcepto}>Ventas directas registradas</Text><Text style={s.movValor}>{s2.ventasDirectas}</Text></View>
                  <View style={s.movRowUltima}><Text style={s.movConcepto}>Trabajos entregados</Text><Text style={s.movValor}>{s2.trabajosEntregados}</Text></View>
                </>
              )}
            </View>
          </View>

          <View style={s.columna}>
            <View style={s.seccionTituloFila}>
              <Text style={s.seccionTitulo}>Necesita tu atención hoy</Text>
              <View style={s.seccionRegla} />
            </View>
            {sinPendientes ? (
              <View style={s.tarjetaPositiva}>
                <Text style={s.tarjetaPositivaTexto}>No tienes nada pendiente en este periodo.</Text>
              </View>
            ) : (
              <View>
                <View style={[s.atencionTarjeta, s.atencionAmbar]}>
                  <Text style={s.atencionConcepto}>Seguimientos pendientes o vencidos</Text>
                  <Text style={s.atencionValorAmbar}>{s3.seguimientosPendientes}</Text>
                </View>
                {esProd ? (
                  <View style={[s.atencionTarjeta, s.atencionNeutra]}>
                    <Text style={s.atencionConcepto}>Pedidos pendientes de entrega</Text>
                    <Text style={s.atencionValorNeutro}>{s3.pedidosPendientesEntrega}</Text>
                  </View>
                ) : (
                  <View style={[s.atencionTarjeta, s.atencionNeutra]}>
                    <Text style={s.atencionConcepto}>Cotizaciones pendientes</Text>
                    <View style={s.atencionParFila}>
                      <Text style={s.atencionParDoc}>{s3.cotizacionesPendientesCantidad + " ·"}</Text>
                      <Text style={[s.atencionValorNeutro, { marginLeft: 6 }]}>{formatearMonto(s3.cotizacionesPendientesMonto)}</Text>
                    </View>
                  </View>
                )}
                {/* "Ventas con cobro pendiente" , nunca "documentos"/"docs":
                    internamente puede venir de un pedido, una cotización
                    aceptada o una venta directa, pero esa distinción es
                    técnica y no se expone en esta tarjeta. */}
                <View style={[s.atencionTarjeta, s.atencionRoja, { marginBottom: 0 }]}>
                  <Text style={s.atencionConcepto}>Ventas con cobro pendiente</Text>
                  <View style={s.atencionParFila}>
                    <Text style={s.atencionParDoc}>{s3.cobrosPendientesCantidad + " ·"}</Text>
                    <Text style={[s.atencionValorRojo, { marginLeft: 6 }]}>{formatearMonto(s3.cobrosPendientesMonto)}</Text>
                  </View>
                </View>
              </View>
            )}
            <Text style={s.notaColumna}>Estado actual de los registros del periodo. Un mismo registro puede aparecer en más de una fila: son conteos independientes, no se suman.</Text>
          </View>
        </View>

        {/* ── Sección 4: "¿Por qué no se cerraron / se perdieron...?" ── */}
        <View style={s.seccionBlock} wrap={false}>
          <View style={s.seccionTituloFila}>
            <Text style={s.seccionTitulo}>{tituloS4}</Text>
            <View style={s.seccionRegla} />
          </View>
          {s4.total === 0 ? (
            <View>
              <Text style={s.s4VacioTexto1}>{"Todas las " + ruidoSustantivoPlur + " del periodo continúan activas o avanzaron."}</Text>
              <Text style={s.s4VacioTexto2}>{esProd ? "No se registraron oportunidades perdidas en este periodo." : "No se registraron cotizaciones rechazadas en este periodo."}</Text>
            </View>
          ) : s4.total === 1 ? (
            // Un solo caso se lee como frase natural ("Una oportunidad
            // perdida") , nunca como un número aislado junto a una
            // etiqueta ("1 · oportunidad perdida"), que obliga a
            // interpretar qué representa esa cifra.
            <View style={s.motivoGrid}>
              <View style={s.motivoCardWrapCompleto}>
                <View style={s.motivoCard}>
                  <View style={s.motivoTextos}>
                    <Text style={s.motivoTituloSolo}>{esProd ? "Una oportunidad perdida" : "Una cotización rechazada"}</Text>
                    <Text style={s.motivoDetalle}>{"Motivo registrado: " + (s4.porMotivo[0] ? s4.porMotivo[0].motivo : "Sin motivo registrado")}</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View style={s.motivoGrid}>
              {s4.porMotivo.map(function (m, i) {
                return (
                  <View style={s.motivoCardWrapMitad} key={i}>
                    <View style={s.motivoCard}>
                      <Text style={s.motivoNumero}>{m.cantidad}</Text>
                      <View style={s.motivoTextos}>
                        <Text style={s.motivoTitulo}>{m.motivo}</Text>
                        <Text style={s.motivoDetalle}>{m.cantidad + " de " + s4.total + " " + ruidoSustantivoPlur + " (" + m.porcentaje + "%)"}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* ── Sección 6: "Productos más vendidos en este periodo" ── SOLO
             Productos. En Servicios, esProd es false y este bloque entero
             no se monta , el reporte de Servicios queda exactamente igual
             que antes. */}
        {esProd ? (
          <View style={s.seccionBlock}>
            <View style={s.seccionTituloFila} wrap={false}>
              <Text style={s.seccionTitulo}>Productos vendidos en este periodo</Text>
              <View style={s.seccionRegla} />
            </View>
            {!hayVentasProdTop ? (
              <Text style={s.prodVacioTexto}>Aún no registraste productos vendidos en este periodo.</Text>
            ) : (
              chunksProdTop.map(function (chunk, ci) {
                return (
                  <View key={ci} wrap={false}>
                    <View style={s.prodTablaHead}>
                      <Text style={[s.prodTablaHeadTxt, { flex: 2.2 }]}>Producto</Text>
                      <Text style={[s.prodTablaHeadTxt, { flex: 1, textAlign: "center" }]}>Unidades vendidas</Text>
                      <Text style={[s.prodTablaHeadTxt, { flex: 1, textAlign: "right" }]}>Monto vendido</Text>
                    </View>
                    {chunk.map(function (p, i) {
                      var esUltimaGlobal = ci === chunksProdTop.length - 1 && i === chunk.length - 1;
                      return (
                        <View style={esUltimaGlobal ? s.prodRowUltima : s.prodRow} key={i} wrap={false}>
                          <Text style={[s.prodColNombre, p.sinDesglose ? s.prodColNombreSinDesglose : null]}>{p.nombre}</Text>
                          <Text style={s.prodColUnidades}>{p.sinDesglose ? "—" : p.unidades}</Text>
                          <Text style={s.prodColMonto}>{formatearMonto(p.monto)}</Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })
            )}
          </View>
        ) : null}

        {/* ── Sección 5: Lectura de CLEO (bloque oscuro de cierre) ──
             El contenido (datos.s5) se genera íntegramente en CLEO.jsx , este
             módulo solo lo presenta: numera cada conclusión y resalta en
             negrita los montos en dólares que ya vienen en el texto, nunca
             agrega, quita ni reordena conclusiones. */}
        <View style={s.lecturaBloque} wrap={false}>
          <View style={s.lecturaGlow} />
          <View style={s.lecturaTituloFila}>
            <View style={s.lecturaMarcaCuadro}><Text style={s.lecturaMarcaC}>C</Text></View>
            <Text style={s.lecturaTitulo}>Lectura de CLEO</Text>
          </View>
          <View>
            {s5.map(function (texto, i) {
              var partes = segmentosResaltados(texto);
              return (
                <View key={i}>
                  {i > 0 ? <View style={s.lecturaFilaDivisor} /> : null}
                  <View style={s.lecturaFila} wrap={false}>
                    <Text style={s.lecturaIndice}>{String(i + 1).padStart(2, "0")}</Text>
                    <Text style={s.lecturaTexto}>
                      {partes.map(function (p, j) {
                        return p.fuerte ? <Text key={j} style={s.lecturaTextoFuerte}>{p.texto}</Text> : p.texto;
                      })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={s.footerBar} fixed>
          <Text>{"Generado el " + datos.generadoTexto}</Text>
          <Text style={s.footerDer} render={function (info) {
            return "Generado con CLEO · concleo.com" + (info.totalPages > 1 ? " · Página " + info.pageNumber + " de " + info.totalPages : "");
          }} />
        </View>
      </Page>
    </Document>
  );
}

// ── API pública ─────────────────────────────────────────────────────────
// Construye el <Document> y genera el Blob real mediante pdf(...).toBlob()
// , nunca convierte HTML, nunca usa capturas de pantalla. `datosReporte` ya
// viene completamente calculado por construirDatosReporteComercial (dentro
// de CLEO.jsx) , este módulo NUNCA recibe ni lee clientes/cotizaciones/
// pedidos/ventas, solo números y texto ya resueltos , y nunca recalcula ni
// reinterpreta esas cifras, solo las presenta. `perfil` se sanea aquí mismo
// (nunca teléfono/correo/IDs internos en el documento) , el color/logo de
// marca del negocio YA NO se usa en este diseño (ver tokens fijos arriba).
export async function crearReporteComercialPDF(datosReporte, perfil) {
  datosReporte = datosReporte || {};
  perfil = perfil || {};

  // El NOMBRE COMPLETO se conserva para el nombre de archivo (nunca se
  // trunca ahí más de lo que ya hace nombreArchivoSeguroPDF) , la variante
  // "Header" es la que se envía al documento, con un límite más corto
  // pensado para el ancho disponible de la cabecera , el texto siempre
  // puede envolver a una segunda línea, esta variante solo evita un nombre
  // absurdamente largo que igual desbordaría verticalmente.
  var nombreNegocioCompleto = textoPlanoSeguro(perfil.nombre, 120) || "Mi negocio";
  var nombreNegocioHeader = nombreNegocioCompleto.length > 90 ? nombreNegocioCompleto.slice(0, 90) + "…" : nombreNegocioCompleto;
  var nombreUsuario = textoPlanoSeguro(perfil.tuNombre, 60);

  var s1 = datosReporte.seccion1 || {};
  var s2 = datosReporte.seccion2 || {};
  var s3 = datosReporte.seccion3 || {};
  var s4 = datosReporte.seccion4 || { total: 0, porMotivo: [] };
  var s5 = Array.isArray(datosReporte.seccion5) ? datosReporte.seccion5 : [];
  // seccion6 ("Productos más vendidos") , SOLO existe para Productos , en
  // Servicios datosReporte.seccion6 es undefined y s6 queda null, el
  // componente entero de esta sección no se monta (ver esProd arriba).
  var s6raw = datosReporte.seccion6;

  var datos = {
    estilos: crearEstilos(),
    esProductos: !!datosReporte.esProductos,
    nombreNegocio: nombreNegocioHeader,
    nombreUsuario: nombreUsuario,
    desdeTexto: fechaCortaTexto(datosReporte.desde),
    hastaTexto: fechaCortaTexto(datosReporte.hasta),
    generadoTexto: fechaHoraGeneracionTexto(),
    s1: (function () {
      var montoVendidoSeguro = numeroSeguro(s1.montoVendido);
      var montoCobradoSeguro = numeroSeguro(s1.montoCobrado);
      return {
        montoVendido: montoVendidoSeguro,
        montoCobrado: montoCobradoSeguro,
        ventasCerradas: numeroSeguro(s1.ventasCerradas),
        conversionNumerador: numeroSeguro(s1.conversionNumerador),
        conversionDenominador: numeroSeguro(s1.conversionDenominador),
        conversionPct: s1.conversionPct == null ? null : numeroSeguro(s1.conversionPct),
        // La nota solo aparece cuando es útil: el caso que realmente puede
        // confundir es cuando lo cobrado SUPERA lo vendido de este periodo
        // (pagos de ventas de periodos anteriores cayendo aquí). No se
        // fuerza ninguna fórmula para que "cuadren" , solo se explica.
        mostrarNotaCobro: montoCobradoSeguro > montoVendidoSeguro,
      };
    })(),
    s2: {
      nuevosContactos: numeroSeguro(s2.nuevosContactos),
      pedidosCreados: numeroSeguro(s2.pedidosCreados),
      pedidosEntregados: numeroSeguro(s2.pedidosEntregados),
      pedidosCancelados: numeroSeguro(s2.pedidosCancelados),
      cotizacionesCreadas: numeroSeguro(s2.cotizacionesCreadas),
      cotizacionesAceptadas: numeroSeguro(s2.cotizacionesAceptadas),
      ventasDirectas: numeroSeguro(s2.ventasDirectas),
      trabajosEntregados: numeroSeguro(s2.trabajosEntregados),
    },
    s3: {
      seguimientosPendientes: numeroSeguro(s3.seguimientosPendientes),
      pedidosPendientesEntrega: numeroSeguro(s3.pedidosPendientesEntrega),
      cotizacionesPendientesCantidad: numeroSeguro(s3.cotizacionesPendientesCantidad),
      cotizacionesPendientesMonto: numeroSeguro(s3.cotizacionesPendientesMonto),
      cobrosPendientesCantidad: numeroSeguro(s3.cobrosPendientesCantidad),
      cobrosPendientesMonto: numeroSeguro(s3.cobrosPendientesMonto),
    },
    s4: {
      total: numeroSeguro(s4.total),
      porMotivo: (s4.porMotivo || []).map(function (m) {
        return { motivo: textoPlanoSeguro(m.motivo, 120) || "Sin motivo registrado", cantidad: numeroSeguro(m.cantidad), porcentaje: numeroSeguro(m.porcentaje) };
      }),
    },
    s5: s5.map(function (t) { return textoPlanoSeguro(t, 400); }).filter(Boolean),
    // Se sanitizan TODAS las filas, sin límite , el PDF ahora muestra la
    // tabla completa (paginada en bloques, ver chunksProdTop en
    // DocumentoReporteComercial), ya no se recorta a 5 filas. `sinDesglose`
    // se preserva tal cual (booleano) , identifica la fila especial "Venta
    // sin desglose por producto" que NO tiene unidades reales que mostrar
    // (se renderiza "—", nunca un número inventado), pero SÍ participa en
    // la suma visible de montos para que reconcilie con la sección 1.
    s6: s6raw && Array.isArray(s6raw.filas)
      ? {
          filas: s6raw.filas.map(function (p) {
            return {
              nombre: textoPlanoSeguro(p.nombre, 200) || "(sin nombre)",
              unidades: p.sinDesglose ? null : numeroSeguro(p.unidades),
              monto: numeroSeguro(p.monto),
              sinDesglose: !!p.sinDesglose,
            };
          }),
        }
      : null,
  };

  var blobBruto = await pdf(<DocumentoReporteComercial datos={datos} />).toBlob();

  // Validación real del resultado antes de entregarlo , nunca se confía a
  // ciegas en lo que devolvió la librería.
  if (!(blobBruto instanceof Blob)) throw new Error("PDF inválido: no es un Blob");
  if (blobBruto.size < 100) throw new Error("PDF inválido: tamaño insuficiente");
  var primerosBytes = await blobBruto.slice(0, 5).arrayBuffer();
  var firma = String.fromCharCode.apply(null, new Uint8Array(primerosBytes));
  if (firma !== "%PDF-") throw new Error("PDF inválido: firma incorrecta");

  var blob = blobBruto.type === "application/pdf" ? blobBruto : new Blob([blobBruto], { type: "application/pdf" });

  var nombreArchivo =
    nombreArchivoSeguroPDF(
      "CLEO_Reporte_" + nombreNegocioCompleto + "_" + (datosReporte.desde || "") + "_a_" + (datosReporte.hasta || ""),
      "CLEO_Reporte_Comercial"
    ) + ".pdf";

  return { blob: blob, nombreArchivo: nombreArchivo, titulo: "Reporte de actividad comercial" };
}
