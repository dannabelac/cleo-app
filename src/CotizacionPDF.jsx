import React from "react";
import { Document, Page, View, Text, Image, StyleSheet, pdf } from "@react-pdf/renderer";

// ── Helpers de seguridad locales ───────────────────────────────────────────
// Este archivo es independiente de CLEO.jsx (evita imports circulares), así
// que mantiene sus propias copias mínimas de las validaciones que necesita.
// Nunca se usa dangerouslySetInnerHTML, nunca se interpretan etiquetas de
// usuario, nunca se crean enlaces automáticos, nunca se cargan imágenes
// remotas , todo el contenido de usuario se renderiza exclusivamente
// dentro de <Text>, como texto plano.

// Elimina caracteres de control no imprimibles (conserva \n y \t para el
// formato) y limita la longitud, para que una entrada accidental con
// millones de caracteres nunca pueda bloquear el navegador.
function textoPlanoSeguro(valor, maxLen) {
  if (valor === null || valor === undefined) return "";
  var texto = String(valor);
  texto = texto.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  var limite = maxLen || 5000;
  if (texto.length > limite) texto = texto.slice(0, limite) + "…";
  return texto;
}

function numeroSeguro(valor) {
  var n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

// Equivalente local de obtenerItemsCotizacion (definida en el archivo
// principal) , este módulo es independiente (evita imports circulares, ver
// comentario arriba), así que mantiene su propia copia mínima con la MISMA
// lógica no destructiva: si `cot.items` existe y tiene contenido, se usa tal
// cual (normalizado) , si no, se sintetiza UN item a partir de los campos
// legacy (concepto/cantidad/precioUnit/monto), sin tocar `cot`.
function obtenerItemsCotizacionPDF(cot) {
  if (!cot) return [];
  if (Array.isArray(cot.items) && cot.items.length > 0) {
    return cot.items.map(function (it) {
      var cantidad = numeroSeguro(it.cantidad) || 1;
      var precioUnitario = numeroSeguro(it.precioUnitario);
      return {
        nombre: textoPlanoSeguro(it.nombre, 300),
        cantidad: cantidad,
        precioUnitario: precioUnitario,
        total: it.total != null ? numeroSeguro(it.total) : cantidad * precioUnitario,
        // descripcion/condiciones PROPIAS de este renglón (ver
        // detallesPorItem en ItemsEditor, archivo principal) , llegan como
        // HTML ya saneado, se convierten a texto plano aquí mismo (nunca se
        // manda HTML crudo a react-pdf, ver htmlANotaPlanaPDF más abajo).
        descripcion: htmlANotaPlanaPDF(it.descripcion),
        condiciones: htmlANotaPlanaPDF(it.condiciones),
      };
    });
  }
  var cantidadLegacy = numeroSeguro(cot.cantidad) || 1;
  var precioLegacy = numeroSeguro(cot.precioUnit != null ? cot.precioUnit : cot.monto);
  return [
    {
      nombre: textoPlanoSeguro(cot.concepto, 300),
      cantidad: cantidadLegacy,
      precioUnitario: precioLegacy,
      total: cantidadLegacy * precioLegacy,
    },
  ];
}

function colorHexSeguroPDF(valor, fallback) {
  if (typeof valor === "string" && /^#[0-9a-fA-F]{6}$/.test(valor)) return valor;
  return fallback;
}

// Solo PNG/JPEG en data URL base64 , GIF, WEBP, SVG, URLs externas o
// cualquier otro formato se omiten sin hacer fallar la generación.
function logoSeguroPDF(valor) {
  if (typeof valor !== "string") return "";
  if (!/^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/i.test(valor)) return "";
  return valor;
}

// Convierte HTML enriquecido (de RichEditor/sanitizarHTMLRico, ya saneado
// antes de llegar aquí) a texto plano legible , nunca se envía HTML crudo
// a React PDF, solo texto con saltos de línea y viñetas básicas
// reconstruidas a mano a partir de las etiquetas de lista.
function htmlANotaPlanaPDF(html) {
  if (!html) return "";
  var texto = String(html);
  texto = texto.replace(/<li[^>]*>/gi, "• ");
  texto = texto.replace(/<\/li>/gi, "\n");
  texto = texto.replace(/<br\s*\/?>/gi, "\n");
  texto = texto.replace(/<\/p>/gi, "\n");
  texto = texto.replace(/<\/div>/gi, "\n");
  texto = texto.replace(/<[^>]+>/g, ""); // se elimina cualquier otra etiqueta
  texto = texto
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  texto = texto.replace(/\n{3,}/g, "\n\n").trim();
  return textoPlanoSeguro(texto, 4000);
}

function nombreArchivoSeguroPDF(valor, fallback) {
  var texto = String(valor == null ? "" : valor);
  texto = texto.replace(/[\/\\:*?"<>|]/g, "");
  texto = texto.replace(/[\r\n\t\x00-\x1F\x7F]/g, "");
  texto = texto.replace(/\s+/g, "_");
  texto = texto.slice(0, 80);
  return texto || fallback;
}

function formatearMonto(n) {
  return "$" + numeroSeguro(n).toLocaleString("es-MX");
}

// ── Estilos ─────────────────────────────────────────────────────────────
// Tipografía Helvetica incorporada (no se descarga ninguna fuente externa).
function crearEstilos(pc, ps) {
  return StyleSheet.create({
    pagina: {
      paddingTop: 48,
      paddingBottom: 60,
      paddingHorizontal: 48,
      fontFamily: "Helvetica",
      fontSize: 10,
      color: "#1a1a2e",
      backgroundColor: "#ffffff",
    },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
    headerIzq: { maxWidth: 300 },
    logo: { width: 40, height: 40, objectFit: "contain", marginBottom: 8, borderRadius: 6 },
    bizName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
    bizMeta: { fontSize: 9, color: "#888888", marginTop: 2 },
    headerDer: { alignItems: "flex-end" },
    docLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 1.5, color: pc, textTransform: "uppercase", marginBottom: 3 },
    docFolio: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
    docFechas: { flexDirection: "row", marginTop: 8 },
    fechaCol: { marginLeft: 16, alignItems: "center" },
    fechaVal: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a2e", textAlign: "center" },
    fechaLbl: { fontSize: 7, color: "#aaaaaa", textAlign: "center", marginTop: 1 },
    divider: { height: 1.5, backgroundColor: pc, marginBottom: 20 },
    paraBlock: { flexDirection: "row", alignItems: "center", backgroundColor: ps, borderRadius: 6, padding: 12, marginBottom: 20 },
    avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: pc, alignItems: "center", justifyContent: "center", marginRight: 10 },
    avatarTexto: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#ffffff" },
    paraLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 1, color: pc, textTransform: "uppercase" },
    paraName: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
    paraSub: { fontSize: 9, color: "#777777" },
    tablaHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e5e5", paddingBottom: 6, marginBottom: 4 },
    tablaFila: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "#f0f0f0" },
    thCelda: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#999999", textTransform: "uppercase", letterSpacing: 0.5 },
    tdCelda: { fontSize: 10, color: "#333333" },
    colConcepto: { flex: 2.2 },
    colCant: { flex: 0.6, textAlign: "center" },
    colPrecio: { flex: 1, textAlign: "right" },
    colTotal: { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" },
    notasBlock: { marginTop: 8, marginBottom: 4 },
    notasLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: pc, textTransform: "uppercase", marginBottom: 3 },
    notasTexto: { fontSize: 9, color: "#555555", lineHeight: 1.5 },
    // ── Tarjeta de notas POR ITEM (descripción/condiciones de un renglón) ──
    // Mismo lenguaje visual que condicionesBlock (más abajo, para
    // "Condiciones de pago" del documento completo) , fondo del color
    // secundario del negocio + borde izquierdo de acento, para que ambos
    // tipos de "nota destacada" se sientan parte del mismo sistema. Se
    // aplica SOLO cuando el item tiene descripción y/o condiciones , un item
    // sin ninguna de las dos sigue viéndose exactamente igual que antes (fila
    // simple, sin tarjeta), así que una cotización de un solo renglón sin
    // notas no cambia en nada.
    itemNotasCard: { backgroundColor: ps, borderLeftWidth: 2, borderLeftColor: pc, borderRadius: 4, padding: 10, marginTop: 4, marginBottom: 10 },
    itemDescTexto: { fontSize: 9, color: "#555555", lineHeight: 1.5 },
    // Condiciones un escalón más chico/claro que la descripción , se lee
    // como letra chica de apoyo, no como párrafo principal, sin competir
    // visualmente con el nombre/precio del item (lo más importante de la fila).
    itemCondLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: pc, textTransform: "uppercase", marginBottom: 3 },
    itemCondTexto: { fontSize: 8, color: "#6B7280", lineHeight: 1.5 },
    totalsBlock: { marginTop: 12, marginBottom: 6 },
    totalLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, fontSize: 9, color: "#888888", borderBottomWidth: 0.5, borderBottomColor: "#f5f5f5" },
    totalLineDiscount: { color: pc },
    totalLinePaid: { color: "#1A7A5E" },
    totalFinal: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderTopWidth: 1.5, borderTopColor: pc, marginTop: 8, marginBottom: 16 },
    totalFinalLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#999999", textTransform: "uppercase", letterSpacing: 1 },
    totalFinalVal: { fontSize: 20, fontFamily: "Helvetica-Bold", color: pc },
    bankBlock: { backgroundColor: "#f9f9fb", borderRadius: 6, padding: 14, marginBottom: 16 },
    bankTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#aaaaaa", textTransform: "uppercase", marginBottom: 6 },
    bankRow: { fontSize: 9, color: "#333333", marginBottom: 3 },
    bankInstr: { fontSize: 8, color: "#888888", marginTop: 6 },
    condicionesBlock: { backgroundColor: ps, borderLeftWidth: 2, borderLeftColor: pc, borderRadius: 4, padding: 12, marginBottom: 16 },
    condicionesLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: pc, textTransform: "uppercase", marginBottom: 4 },
    condicionesTexto: { fontSize: 9, color: "#555555", lineHeight: 1.5 },
    footerMsg: { fontSize: 9, color: "#aaaaaa", fontStyle: "italic", textAlign: "center", marginBottom: 20 },
    footerBar: {
      position: "absolute",
      bottom: 24,
      left: 48,
      right: 48,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 7,
      color: "#bbbbbb",
      borderTopWidth: 0.5,
      borderTopColor: "#eeeeee",
      paddingTop: 6,
    },
  });
}

// ── Documento ───────────────────────────────────────────────────────────
function DocumentoCotizacion({ datos }) {
  var s = datos.estilos;
  var tienePagos = datos.pagos.length > 0;
  return (
    <Document>
      <Page size="LETTER" style={s.pagina} wrap>
        <View style={s.header} wrap={false}>
          <View style={s.headerIzq}>
            {datos.logo ? <Image src={datos.logo} style={s.logo} /> : null}
            <Text style={s.bizName}>{datos.nombreNegocio}</Text>
            {datos.bizMeta ? <Text style={s.bizMeta}>{datos.bizMeta}</Text> : null}
          </View>
          <View style={s.headerDer}>
            <Text style={s.docLabel}>Cotización</Text>
            <Text style={s.docFolio}>{datos.folio}</Text>
            <View style={s.docFechas}>
              <View style={s.fechaCol}>
                <Text style={s.fechaVal}>{datos.fecha}</Text>
                <Text style={s.fechaLbl}>Fecha</Text>
              </View>
              {datos.vigencia ? (
                <View style={s.fechaCol}>
                  <Text style={s.fechaVal}>{datos.vigencia}</Text>
                  <Text style={s.fechaLbl}>Vigencia</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.paraBlock} wrap={false}>
          <View style={s.avatar}>
            <Text style={s.avatarTexto}>{datos.iniciales}</Text>
          </View>
          <View>
            <Text style={s.paraLabel}>Para</Text>
            <Text style={s.paraName}>{datos.clienteNombre}</Text>
            {datos.clienteNegocio ? <Text style={s.paraSub}>{datos.clienteNegocio}</Text> : null}
            {datos.clienteContacto ? <Text style={s.paraSub}>{datos.clienteContacto}</Text> : null}
          </View>
        </View>

        <View wrap={false}>
          <View style={s.tablaHead}>
            <Text style={[s.thCelda, s.colConcepto]}>Concepto</Text>
            <Text style={[s.thCelda, s.colCant]}>Cant.</Text>
            <Text style={[s.thCelda, s.colPrecio]}>Precio unit.</Text>
            <Text style={[s.thCelda, s.colTotal]}>Total</Text>
          </View>
        </View>
        {/* Una fila por item , cada una en su propio wrap={false} (mismo
            patrón que las filas de pagos más abajo) para que, si una
            cotización con muchos conceptos ocupa más de una página, nunca se
            corte una fila a la mitad , el encabezado de arriba queda fuera
            de este bloque para no repetirse pegado a cada fila. */}
        {datos.items.map(function (it, i) {
          // La fila de precio (nombre/cant/precio unit./total) NUNCA cambia
          // , mismas columnas, misma alineación con el encabezado de arriba,
          // exista o no descripción/condiciones. Solo lo que va DEBAJO se
          // agrupa en una tarjeta cuando hay algo que agrupar.
          var tieneNotas = !!(it.descripcion || it.condiciones);
          return (
            <View key={i}>
              <View style={s.tablaFila} wrap={false}>
                <Text style={[s.tdCelda, s.colConcepto]}>{it.nombre}</Text>
                <Text style={[s.tdCelda, s.colCant]}>{it.cantidad}</Text>
                <Text style={[s.tdCelda, s.colPrecio]}>{formatearMonto(it.precioUnitario)}</Text>
                <Text style={[s.tdCelda, s.colTotal]}>{formatearMonto(it.total)}</Text>
              </View>
              {/* Descripción/condiciones DE ESTE renglón (si existen) , antes
                  eran dos bloques de texto sueltos con la misma jerarquía
                  visual que el resto del documento, así que con varios items
                  no quedaba claro dónde terminaba la información de uno y
                  empezaba la del siguiente. Ahora van juntas dentro de UNA
                  sola tarjeta (un solo wrap={false}, nunca se separan entre
                  sí en un salto de página) que delimita claramente qué
                  pertenece a este item. */}
              {tieneNotas ? (
                <View style={s.itemNotasCard} wrap={false}>
                  {it.descripcion ? <Text style={s.itemDescTexto}>{it.descripcion}</Text> : null}
                  {it.condiciones ? (
                    <View style={it.descripcion ? { marginTop: 6 } : null}>
                      <Text style={s.itemCondLabel}>Condiciones</Text>
                      <Text style={s.itemCondTexto}>{it.condiciones}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}

        {/* Descripción/condiciones GENERALES del documento , ya no tienen
            campo de edición en la app (ver CLEO_55.jsx, modalCot , ahora
            viven por producto/servicio arriba), pero cotizaciones guardadas
            ANTES de ese cambio pueden traer texto aquí, y se sigue
            imprimiendo tal cual para no perder ese dato. */}
        {datos.notas ? (
          <View style={s.notasBlock}>
            <Text style={s.notasTexto}>{datos.notas}</Text>
          </View>
        ) : null}

        {datos.condicionesServicio ? (
          <View style={s.notasBlock}>
            <Text style={s.notasLabel}>Condiciones</Text>
            <Text style={s.notasTexto}>{datos.condicionesServicio}</Text>
          </View>
        ) : null}

        {datos.descuentoMonto > 0 || tienePagos ? (
          <View style={s.totalsBlock}>
            {datos.descuentoMonto > 0 ? (
              <View wrap={false}>
                <View style={s.totalLine}>
                  <Text>Subtotal</Text>
                  <Text>{formatearMonto(datos.subtotal)} MXN</Text>
                </View>
                <View style={[s.totalLine, s.totalLineDiscount]}>
                  <Text>Descuento especial ({datos.descuentoTexto})</Text>
                  <Text>- {formatearMonto(datos.descuentoMonto)} MXN</Text>
                </View>
              </View>
            ) : null}
            {datos.pagos.map(function (p, i) {
              return (
                <View style={[s.totalLine, s.totalLinePaid]} key={i} wrap={false}>
                  <Text>
                    {p.concepto} · {p.fecha}
                  </Text>
                  <Text>- {formatearMonto(p.monto)} MXN</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={s.totalFinal} wrap={false}>
          <Text style={s.totalFinalLabel}>{datos.saldoLabel}</Text>
          <Text style={s.totalFinalVal}>{formatearMonto(datos.saldo)} MXN</Text>
        </View>

        {datos.tieneBanco ? (
          <View style={s.bankBlock} wrap={false}>
            <Text style={s.bankTitle}>Datos para transferencia</Text>
            {datos.banco ? <Text style={s.bankRow}>Banco: {datos.banco}</Text> : null}
            {datos.bancotitular ? <Text style={s.bankRow}>Titular: {datos.bancotitular}</Text> : null}
            {datos.bancoclabe ? <Text style={s.bankRow}>CLABE: {datos.bancoclabe}</Text> : null}
            {datos.bancoaccount ? <Text style={s.bankRow}>Cuenta: {datos.bancoaccount}</Text> : null}
            {datos.bancoinstrucciones ? <Text style={s.bankInstr}>{datos.bancoinstrucciones}</Text> : null}
          </View>
        ) : null}

        {datos.condicionesPago ? (
          <View style={s.condicionesBlock} wrap={false}>
            <Text style={s.condicionesLabel}>Condiciones de pago</Text>
            <Text style={s.condicionesTexto}>{datos.condicionesPago}</Text>
          </View>
        ) : null}

        {datos.mensaje ? <Text style={s.footerMsg}>"{datos.mensaje}"</Text> : null}

        <View style={s.footerBar} fixed>
          <Text>
            {datos.nombreNegocio} · {datos.folio} · {datos.fecha}
          </Text>
          <Text render={function (info) { return "Página " + info.pageNumber + " de " + info.totalPages; }} />
        </View>
      </Page>
    </Document>
  );
}

// ── API pública ─────────────────────────────────────────────────────────
// Construye el <Document> y genera el Blob real mediante pdf(...).toBlob()
// , nunca convierte HTML, nunca usa capturas de pantalla.
export async function crearCotizacionPDF(cot, cliente, perfil) {
  cot = cot || {};
  cliente = cliente || {};
  perfil = perfil || {};

  var pc = colorHexSeguroPDF(perfil.color, "#534AB7");
  var ps = colorHexSeguroPDF(perfil.colorSecundario, "#F0EEFF");

  var folio = "COT-" + String(cot.id || "").slice(-4).padStart(4, "0");

  var pagosCrudos = Array.isArray(cot.pagos) ? cot.pagos : [];
  var totalPagado = pagosCrudos.reduce(function (s, p) { return s + numeroSeguro(p.monto); }, 0);
  var total = numeroSeguro(cot.monto);
  var saldo = total - totalPagado;

  var itemsPDF = obtenerItemsCotizacionPDF(cot);
  var subtotalItems =
    numeroSeguro(cot.subtotal) > 0
      ? numeroSeguro(cot.subtotal)
      : itemsPDF.reduce(function (s, it) { return s + it.total; }, 0);
  var descuentoMonto = 0;
  var descuentoTexto = "";
  if (numeroSeguro(cot.descuento) > 0) {
    if (cot.tipoDescuento === "porcentaje") {
      descuentoMonto = (subtotalItems * numeroSeguro(cot.descuento)) / 100;
      descuentoTexto = textoPlanoSeguro(cot.descuento, 10) + "% OFF";
    } else {
      descuentoMonto = numeroSeguro(cot.descuento);
      descuentoTexto = "OFF";
    }
  }

  var nombreCliente = textoPlanoSeguro(cliente.nombre, 200) || "--";
  var iniciales =
    nombreCliente !== "--"
      ? nombreCliente
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map(function (w) { return w[0]; })
          .join("")
          .toUpperCase()
      : "?";

  var logo = logoSeguroPDF(perfil.logo);
  var bizMeta = [perfil.email, perfil.direccion]
    .filter(Boolean)
    .map(function (v) { return textoPlanoSeguro(v, 120); })
    .join(" · ");

  var datos = {
    estilos: crearEstilos(pc, ps),
    folio: folio,
    fecha: textoPlanoSeguro(cot.fecha, 40),
    vigencia: textoPlanoSeguro(cot.vigencia, 40),
    nombreNegocio: textoPlanoSeguro(perfil.nombre, 120) || "Mi negocio",
    bizMeta: bizMeta,
    logo: logo || null,
    clienteNombre: nombreCliente,
    clienteNegocio: textoPlanoSeguro(cliente.negocio, 120),
    clienteContacto: textoPlanoSeguro(cliente.contacto, 60),
    iniciales: iniciales,
    items: itemsPDF,
    total: total,
    subtotal: subtotalItems,
    descuentoMonto: descuentoMonto,
    descuentoTexto: descuentoTexto,
    pagos: pagosCrudos.map(function (p) {
      return {
        concepto: textoPlanoSeguro(p.concepto || "Pago recibido", 120),
        fecha: textoPlanoSeguro(p.fecha, 40),
        monto: numeroSeguro(p.monto),
      };
    }),
    saldoLabel: saldo <= 0 ? "Pagado completamente" : "Saldo a cubrir",
    saldo: Math.max(0, saldo),
    notas: htmlANotaPlanaPDF(cot.notas),
    condicionesServicio: htmlANotaPlanaPDF(cot.svCondicionesHtml || cot.svCondiciones),
    tieneBanco: !!(perfil.banco || perfil.bancoclabe || perfil.bancoaccount),
    banco: textoPlanoSeguro(perfil.banco, 80),
    bancotitular: textoPlanoSeguro(perfil.bancotitular, 120),
    bancoclabe: textoPlanoSeguro(perfil.bancoclabe, 40),
    bancoaccount: textoPlanoSeguro(perfil.bancoaccount, 40),
    bancoinstrucciones: textoPlanoSeguro(perfil.bancoinstrucciones, 500),
    // Usa la copia propia de ESTA cotización si existe (puede diferir de las
    // condiciones generales sin que estas se hayan tocado) , solo cae a las
    // condiciones generales del perfil para cotizaciones de antes de que
    // existiera este campo (cot.condicionesPago === undefined).
    condicionesPago: textoPlanoSeguro(cot.condicionesPago != null ? cot.condicionesPago : perfil.condicionesPago, 500),
    mensaje: textoPlanoSeguro(perfil.mensaje, 300),
  };

  // Primer intento con el logo ya validado (si existía). El header PNG/JPEG
  // válido no garantiza que el CONTENIDO de la imagen esté sano , si
  // pdf().toBlob() falla y sí había logo, se reintenta UNA sola vez sin él,
  // en vez de perder la cotización completa por una imagen dañada. Si no
  // había logo desde el inicio, no tiene sentido reintentar , y si el
  // segundo intento también falla, el error se propaga tal cual (nunca se
  // oculta).
  var blobBruto;
  try {
    blobBruto = await pdf(<DocumentoCotizacion datos={datos} />).toBlob();
  } catch (errorPrimerIntento) {
    if (!datos.logo) throw errorPrimerIntento;
    var datosSinLogo = Object.assign({}, datos, { logo: null });
    blobBruto = await pdf(<DocumentoCotizacion datos={datosSinLogo} />).toBlob();
  }

  // Validación real del resultado antes de entregarlo , nunca se confía a
  // ciegas en lo que devolvió la librería.
  if (!(blobBruto instanceof Blob)) throw new Error("PDF inválido: no es un Blob");
  if (blobBruto.size < 100) throw new Error("PDF inválido: tamaño insuficiente");
  var primerosBytes = await blobBruto.slice(0, 5).arrayBuffer();
  var firma = String.fromCharCode.apply(null, new Uint8Array(primerosBytes));
  if (firma !== "%PDF-") throw new Error("PDF inválido: firma incorrecta");

  // El MIME solo se normaliza DESPUÉS de confirmar la firma real del PDF.
  var blob = blobBruto.type === "application/pdf" ? blobBruto : new Blob([blobBruto], { type: "application/pdf" });

  var nombreArchivo =
    nombreArchivoSeguroPDF(
      "Cotizacion_" + folio + "_" + (nombreCliente !== "--" ? nombreCliente.replace(/ /g, "_") : "cliente") + "_" + (cot.fecha || ""),
      "Cotizacion"
    ) + ".pdf";

  return { blob: blob, nombreArchivo: nombreArchivo, titulo: "Cotización " + folio, folio: folio };
}
