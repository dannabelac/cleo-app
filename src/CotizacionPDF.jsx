import React from "react";
import { Document, Page, View, Text, Image, StyleSheet, pdf } from "@react-pdf/renderer";

function textoPlanoSeguro(valor, maxLen) {
  if (valor === null || valor === undefined) return "";
  var texto = String(valor);
  texto = texto.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  var limite = maxLen || 5000;
  if (texto.length > limite) texto = texto.slice(0, limite) + "…";
  return texto;
}

// numeroSeguro: además de blindar contra NaN/infinito, redondea a 2
// decimales a salvo de coma flotante , mismo criterio que redondearDinero()
// en CLEO.jsx (archivo independiente, evita imports circulares).
function numeroSeguro(valor) {
  var n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  var signo = n < 0 ? -1 : 1;
  return (signo * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
}

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
        total: it.total != null ? numeroSeguro(it.total) : numeroSeguro(cantidad * precioUnitario),
        descripcionBloques: bloquesDesdeHTMLPDF(it.descripcion),
        condicionesBloques: bloquesDesdeHTMLPDF(it.condiciones),
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
      total: numeroSeguro(cantidadLegacy * precioLegacy),
    },
  ];
}

function colorHexSeguroPDF(valor, fallback) {
  if (typeof valor === "string" && /^#[0-9a-fA-F]{6}$/.test(valor)) return valor;
  return fallback;
}

function logoSeguroPDF(valor) {
  if (typeof valor !== "string") return "";
  if (!/^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/i.test(valor)) return "";
  return valor;
}

function htmlANotaPlanaPDF(html) {
  if (!html) return "";
  var texto = String(html);
  texto = texto.replace(/<li[^>]*>/gi, "• ");
  texto = texto.replace(/<\/li>/gi, "\n");
  texto = texto.replace(/<br\s*\/?>/gi, "\n");
  texto = texto.replace(/<\/p>/gi, "\n");
  texto = texto.replace(/<\/div>/gi, "\n");
  texto = texto.replace(/<[^>]+>/g, "");
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

// bloquesDesdeHTMLPDF: convierte el HTML ya sanitizado (por sanitizarHTMLRico
// en CLEO.jsx, que solo permite p/br/div/strong/b/em/i/ul/ol/li/h4) en una
// estructura de "bloques" que sí conserva forma real , párrafos separados,
// negritas/cursivas reales y listas con viñeta , en vez de aplanarlo todo a
// una sola cadena de texto (que es justo lo que perdía el formato y pegaba
// palabras entre sí, ej. "técnica:Fotografías"). Es el ÚNICO parser , tanto
// la descripción/condiciones por item como las condiciones del servicio
// pasan por aquí (ver renderBloquesHTMLPDF más abajo), nunca hay una segunda
// lógica de conversión por separado.
function bloquesDesdeHTMLPDF(html) {
  if (!html) return [];
  var texto = String(html);
  if (typeof DOMParser === "undefined") {
    // Entorno sin DOMParser (no debería ocurrir , este archivo solo corre en
    // el navegador) , se cae al texto plano de siempre, nunca se rompe.
    return texto.trim() ? [{ tipo: "p", runs: [{ texto: textoPlanoSeguro(texto, 4000), negrita: false, cursiva: false }] }] : [];
  }
  var doc;
  try {
    doc = new DOMParser().parseFromString(texto, "text/html");
  } catch (e) {
    return texto.trim() ? [{ tipo: "p", runs: [{ texto: textoPlanoSeguro(texto, 4000), negrita: false, cursiva: false }] }] : [];
  }

  function runsDeInline(nodo, negrita, cursiva) {
    var runs = [];
    Array.prototype.forEach.call(nodo.childNodes || [], function (hijo) {
      if (hijo.nodeType === 3) {
        if (hijo.nodeValue) runs.push({ texto: hijo.nodeValue, negrita: negrita, cursiva: cursiva });
      } else if (hijo.nodeType === 1) {
        var tag = hijo.tagName.toLowerCase();
        if (tag === "br") {
          runs.push({ texto: "\n", negrita: negrita, cursiva: cursiva });
        } else if (tag === "strong" || tag === "b") {
          runs = runs.concat(runsDeInline(hijo, true, cursiva));
        } else if (tag === "em" || tag === "i") {
          runs = runs.concat(runsDeInline(hijo, negrita, true));
        } else {
          runs = runs.concat(runsDeInline(hijo, negrita, cursiva));
        }
      }
    });
    return runs;
  }

  var bloques = [];
  function agregarParrafo(nodo, forzarNegrita) {
    var runs = runsDeInline(nodo, !!forzarNegrita, false);
    var tieneContenido = runs.some(function (r) { return r.texto && r.texto.trim(); });
    if (tieneContenido) bloques.push({ tipo: "p", runs: runs });
  }
  function agregarLista(nodo, ordenada) {
    var items = [];
    Array.prototype.forEach.call(nodo.children || [], function (li) {
      if (li.tagName && li.tagName.toLowerCase() === "li") {
        var runs = runsDeInline(li, false, false);
        if (runs.some(function (r) { return r.texto && r.texto.trim(); })) items.push({ runs: runs });
      }
    });
    if (items.length) bloques.push({ tipo: "lista", ordenada: !!ordenada, items: items });
  }

  // Recorre el cuerpo del documento , el contenido inline suelto (texto o
  // <strong>/<em> sin párrafo que lo envuelva) se agrupa en su propio
  // párrafo implícito, para nunca perderlo ni pegarlo al bloque siguiente.
  var bufferInline = [];
  function flushBuffer() {
    var tieneContenido = bufferInline.some(function (r) { return r.texto && r.texto.trim(); });
    if (tieneContenido) bloques.push({ tipo: "p", runs: bufferInline });
    bufferInline = [];
  }
  Array.prototype.forEach.call((doc.body && doc.body.childNodes) || [], function (nodo) {
    if (nodo.nodeType === 3) {
      if (nodo.nodeValue) bufferInline.push({ texto: nodo.nodeValue, negrita: false, cursiva: false });
      return;
    }
    if (nodo.nodeType !== 1) return;
    var tag = nodo.tagName.toLowerCase();
    if (tag === "p" || tag === "div") {
      flushBuffer();
      agregarParrafo(nodo, false);
    } else if (tag === "h4") {
      flushBuffer();
      agregarParrafo(nodo, true);
    } else if (tag === "ul") {
      flushBuffer();
      agregarLista(nodo, false);
    } else if (tag === "ol") {
      flushBuffer();
      agregarLista(nodo, true);
    } else if (tag === "br") {
      bufferInline.push({ texto: "\n", negrita: false, cursiva: false });
    } else if (tag === "strong" || tag === "b") {
      bufferInline = bufferInline.concat(runsDeInline(nodo, true, false));
    } else if (tag === "em" || tag === "i") {
      bufferInline = bufferInline.concat(runsDeInline(nodo, false, true));
    } else {
      bufferInline = bufferInline.concat(runsDeInline(nodo, false, false));
    }
  });
  flushBuffer();
  return bloques;
}

// renderBloquesHTMLPDF: ÚNICO renderizador reutilizable de la estructura de
// bloques de arriba hacia elementos reales de @react-pdf/renderer , lo usan
// la descripción y condiciones de cada item Y las condiciones del servicio
// (condicionesServicioBloques), nunca hay una copia paralela.
function renderBloquesHTMLPDF(bloques, s, keyPrefix) {
  if (!bloques || !bloques.length) return null;
  function runsAElementos(runs, keyBase) {
    return runs.map(function (run, i) {
      if (run.texto === "\n") return "\n";
      var estilo = run.negrita && run.cursiva ? [s.htmlNegrita, s.htmlCursiva] : run.negrita ? s.htmlNegrita : run.cursiva ? s.htmlCursiva : null;
      return estilo ? React.createElement(Text, { key: keyBase + "-" + i, style: estilo }, run.texto) : run.texto;
    });
  }
  return bloques.map(function (b, i) {
    if (b.tipo === "lista") {
      return React.createElement(
        View,
        { key: keyPrefix + "-b" + i, style: { marginTop: 1, marginBottom: 3 } },
        b.items.map(function (item, j) {
          return React.createElement(
            View,
            { key: j, style: s.htmlListaFila },
            React.createElement(Text, { style: s.htmlListaBullet }, b.ordenada ? j + 1 + "." : "•"),
            React.createElement(Text, { style: s.htmlListaTexto }, runsAElementos(item.runs, keyPrefix + "-b" + i + "-i" + j))
          );
        })
      );
    }
    return React.createElement(Text, { key: keyPrefix + "-b" + i, style: s.htmlParrafo }, runsAElementos(b.runs, keyPrefix + "-b" + i));
  });
}

// obtenerDimensionesImagenPDF: lee el ancho/alto REAL (en píxeles) del logo
// ya cargado como data URL, para poder respetar su proporción real en vez de
// forzarlo siempre a una caja cuadrada , nunca decodifica el archivo por
// disco, solo usa el mismo Image() del navegador. Si algo falla (o el
// entorno no tiene Image), resuelve null y calcularEstiloLogoPDF cae a su
// tamaño compacto de siempre.
function obtenerDimensionesImagenPDF(dataUrl) {
  return new Promise(function (resolve) {
    // OJO: "Image" a secas aquí es el componente de @react-pdf/renderer
    // importado arriba (una función de React, NO el constructor nativo del
    // navegador) , usar "new Image()" a secas llamaría a ese componente
    // como constructor, fallaría en silencio (atrapado por el catch) y
    // dejaría esta función SIEMPRE resolviendo null sin medir nada de
    // verdad. Por eso aquí se usa window.Image explícitamente.
    if (typeof window === "undefined" || typeof window.Image === "undefined" || !dataUrl) { resolve(null); return; }
    try {
      var img = new window.Image();
      img.onload = function () { resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 }); };
      img.onerror = function () { resolve(null); };
      img.src = dataUrl;
    } catch (e) { resolve(null); }
  });
}

// calcularEstiloLogoPDF: ajuste "contain" real dentro de una caja de 230x52
// , un logo cuadrado/isotipo cae naturalmente a ~52x52 (compacto), uno
// horizontal con letras (el caso típico: un isotipo chico + wordmark ancho)
// se estira hasta 230 de ancho manteniendo su altura real proporcional ,
// nunca se deforma ni se recorta, porque el ancho/alto final siempre
// respeta la proporción real de la imagen YA RECORTADA de su padding (ver
// recortarPaddingLogoPDF , un logo horizontal típico de 3600x1140px con
// bastante margen transparente arriba/abajo recorta a ~4.5:1 real, y con
// esta caja termina en ~230x52, claramente legible junto al folio).
function calcularEstiloLogoPDF(dim) {
  var maxW = 230, maxH = 52;
  if (!dim || !dim.width || !dim.height) return { width: maxH, height: maxH };
  var ratio = dim.width / dim.height;
  var w = maxW, h = maxW / ratio;
  if (h > maxH) { h = maxH; w = maxH * ratio; }
  return { width: numeroSeguro(w) || maxH, height: numeroSeguro(h) || maxH };
}

// recortarPaddingLogoPDF: MUCHOS logos exportados (Canva, Illustrator, etc.)
// traen de fábrica un margen transparente/blanco grande alrededor de la
// marca real , en ese caso, aunque calcularEstiloLogoPDF respete la
// proporción exacta del archivo, la caja resultante sigue viéndose chica
// porque una parte importante de esa caja es puro margen vacío. Esta función
// recorta ese margen (transparente de verdad, o un color casi idéntico al
// de la esquina superior izquierda , cubre tanto PNG con alpha como JPEG de
// fondo sólido) ANTES de medir y de dibujar el logo, así el recuadro que
// calcula calcularEstiloLogoPDF representa la marca real, no su lienzo
// original. Es puramente visual para ESTE PDF , nunca toca perfil.logo ni lo
// que la persona ve/edita en Perfil. Cualquier fallo (imagen dañada, canvas
// bloqueado, etc.) regresa la imagen original sin tocarla, nunca rompe la
// generación del PDF.
function recortarPaddingLogoPDF(dataUrl) {
  return new Promise(function (resolve) {
    // Mismo cuidado que en obtenerDimensionesImagenPDF: "Image" a secas es
    // el componente de @react-pdf/renderer, no el constructor del navegador
    // , se usa window.Image explícitamente para no llamarlo por error.
    if (!dataUrl || typeof window === "undefined" || typeof window.Image === "undefined" || typeof document === "undefined") { resolve(dataUrl); return; }
    try {
      var img = new window.Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) { resolve(dataUrl); return; }
          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          var data;
          try { data = ctx.getImageData(0, 0, w, h).data; } catch (eLectura) { resolve(dataUrl); return; }
          var bgR = data[0], bgG = data[1], bgB = data[2], bgA = data[3];
          function esFondo(i) {
            var a = data[i + 3];
            if (a < 10) return true;
            if (bgA < 10) return false;
            var r = data[i], g = data[i + 1], b = data[i + 2];
            return Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB) < 18;
          }
          var minX = w, minY = h, maxX = -1, maxY = -1;
          var paso = Math.max(1, Math.floor(Math.max(w, h) / 400));
          for (var y = 0; y < h; y += paso) {
            for (var x = 0; x < w; x += paso) {
              var i = (y * w + x) * 4;
              if (!esFondo(i)) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          if (maxX < minX || maxY < minY) { resolve(dataUrl); return; }
          var margenX = Math.round((maxX - minX) * 0.04) + paso;
          var margenY = Math.round((maxY - minY) * 0.04) + paso;
          minX = Math.max(0, minX - margenX); minY = Math.max(0, minY - margenY);
          maxX = Math.min(w - 1, maxX + margenX); maxY = Math.min(h - 1, maxY + margenY);
          var anchoRecorte = maxX - minX + 1, altoRecorte = maxY - minY + 1;
          if (anchoRecorte >= w * 0.97 && altoRecorte >= h * 0.97) { resolve(dataUrl); return; }
          var canvasRecorte = document.createElement("canvas");
          canvasRecorte.width = anchoRecorte; canvasRecorte.height = altoRecorte;
          canvasRecorte.getContext("2d").drawImage(canvas, minX, minY, anchoRecorte, altoRecorte, 0, 0, anchoRecorte, altoRecorte);
          resolve(canvasRecorte.toDataURL("image/png"));
        } catch (eProceso) { resolve(dataUrl); }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    } catch (e) { resolve(dataUrl); }
  });
}

// formatearTarjetaPDF: solo dígitos, agrupados de 4 en 4 para lectura ,
// nunca valida ni verifica el número (eso no le corresponde a este PDF),
// simplemente lo muestra tal como se capturó en Perfil.
function formatearTarjetaPDF(valor) {
  var soloDigitos = String(valor == null ? "" : valor).replace(/\D/g, "").slice(0, 16);
  if (!soloDigitos) return "";
  return soloDigitos.replace(/(.{4})/g, "$1 ").trim();
}

function nombreArchivoSeguroPDF(valor, fallback) {
  var texto = String(valor == null ? "" : valor);
  texto = texto.replace(/[\/\\:*?"<>|]/g, "");
  texto = texto.replace(/[\r\n\t\x00-\x1F\x7F]/g, "");
  texto = texto.replace(/\s+/g, "_");
  texto = texto.slice(0, 80);
  return texto || fallback;
}

// formatearMonto: muestra centavos SOLO cuando existen ($199.50) , entero
// sin decimales ($199) , mismo criterio que formatoDinero() en CLEO.jsx.
function formatearMonto(n) {
  // Siempre 2 decimales, sin excepción , mismo criterio que formatoDinero()
  // en CLEO.jsx: $199.00 , $199.50 , $1,250.00.
  var x = numeroSeguro(n);
  return "$" + x.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function crearEstilos(pc, ps) {
  return StyleSheet.create({
    pagina: {
      paddingTop: 48,
      // 60 dejaba ~21pt de aire de más antes del footer (que mide ~15pt y
      // está fijo en bottom:24) , eso es espacio que un bloque como
      // "Condiciones de pago" pierde SIEMPRE aunque le falten pocos puntos
      // para caber. 46 deja un colchón de ~7pt sobre el footer , suficiente
      // para no encimarse, y recupera ~14pt utilizables en cada página.
      paddingBottom: 46,
      paddingHorizontal: 48,
      fontFamily: "Helvetica",
      fontSize: 10,
      color: "#1a1a2e",
      backgroundColor: "#ffffff",
    },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
    headerIzq: { maxWidth: 300 },
    // width/height REALES se calculan por logo (ver calcularEstiloLogoPDF)
    // y se mezclan con este estilo base al renderizar , nunca un tamaño fijo
    // igual para un isotipo cuadrado y un logo horizontal con letras.
    logo: { objectFit: "contain", marginBottom: 8, borderRadius: 4 },
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
    // Bloques de texto enriquecido (descripción/condiciones por item,
    // condiciones del servicio, condiciones de pago) , UNA sola familia
    // visual para los cuatro, nunca fondo rosa sólido ni gris tenue: fondo
    // casi blanco con acento de color a la izquierda, cuerpo oscuro legible.
    htmlBloqueCard: { backgroundColor: "#F9FAFB", borderLeftWidth: 2.5, borderLeftColor: pc, borderRadius: 4, padding: 12 },
    htmlBloqueLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: pc, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 },
    htmlParrafo: { fontSize: 9.5, color: "#2b2b38", lineHeight: 1.5, marginBottom: 4 },
    htmlNegrita: { fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
    htmlCursiva: { fontFamily: "Helvetica-Oblique" },
    htmlListaFila: { flexDirection: "row", marginBottom: 3 },
    htmlListaBullet: { width: 13, fontSize: 9.5, color: "#2b2b38" },
    htmlListaTexto: { flex: 1, fontSize: 9.5, color: "#2b2b38", lineHeight: 1.5 },
    totalsBlock: { marginTop: 12, marginBottom: 6 },
    totalLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, fontSize: 9, color: "#888888", borderBottomWidth: 0.5, borderBottomColor: "#f5f5f5" },
    totalLineDiscount: { color: pc },
    totalFinal: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderTopWidth: 1.5, borderTopColor: pc, marginTop: 8, marginBottom: 16 },
    totalFinalLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#999999", textTransform: "uppercase", letterSpacing: 1 },
    totalFinalVal: { fontSize: 20, fontFamily: "Helvetica-Bold", color: pc },
    bankBlock: { backgroundColor: "#f9f9fb", borderRadius: 6, padding: 14, marginBottom: 16 },
    bankTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#aaaaaa", textTransform: "uppercase", marginBottom: 6 },
    bankRow: { fontSize: 9, color: "#333333", marginBottom: 3 },
    bankInstr: { fontSize: 8, color: "#888888", marginTop: 6 },
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

function DocumentoCotizacion({ datos }) {
  var s = datos.estilos;
  return (
    <Document>
      <Page size="LETTER" style={s.pagina} wrap>
        <View style={s.header} wrap={false}>
          <View style={s.headerIzq}>
            {datos.logo ? <Image src={datos.logo} style={[s.logo, { width: datos.logoAncho, height: datos.logoAlto }]} /> : null}
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
        {datos.items.map(function (it, i) {
          var tieneDesc = it.descripcionBloques && it.descripcionBloques.length > 0;
          var tieneCond = it.condicionesBloques && it.condicionesBloques.length > 0;
          return (
            <View key={i}>
              <View style={s.tablaFila} wrap={false}>
                <Text style={[s.tdCelda, s.colConcepto]}>{it.nombre}</Text>
                <Text style={[s.tdCelda, s.colCant]}>{it.cantidad}</Text>
                <Text style={[s.tdCelda, s.colPrecio]}>{formatearMonto(it.precioUnitario)}</Text>
                <Text style={[s.tdCelda, s.colTotal]}>{formatearMonto(it.total)}</Text>
              </View>
              {tieneDesc ? (
                <View style={[s.htmlBloqueCard, { marginTop: 4, marginBottom: tieneCond ? 6 : 10 }]}>
                  <Text style={s.htmlBloqueLabel} minPresenceAhead={14}>Descripción</Text>
                  {renderBloquesHTMLPDF(it.descripcionBloques, s, "it" + i + "-d")}
                </View>
              ) : null}
              {tieneCond ? (
                <View style={[s.htmlBloqueCard, { marginTop: tieneDesc ? 0 : 4, marginBottom: 10 }]}>
                  <Text style={s.htmlBloqueLabel} minPresenceAhead={14}>Condiciones del servicio</Text>
                  {renderBloquesHTMLPDF(it.condicionesBloques, s, "it" + i + "-c")}
                </View>
              ) : null}
            </View>
          );
        })}

        {datos.notas ? (
          <View style={s.notasBlock}>
            <Text style={s.notasTexto}>{datos.notas}</Text>
          </View>
        ) : null}

        {datos.condicionesServicioBloques && datos.condicionesServicioBloques.length ? (
          <View style={[s.htmlBloqueCard, { marginTop: 8, marginBottom: 12 }]}>
            <Text style={s.htmlBloqueLabel} minPresenceAhead={14}>Condiciones del servicio</Text>
            {renderBloquesHTMLPDF(datos.condicionesServicioBloques, s, "sv")}
          </View>
        ) : null}

        {datos.descuentoMonto > 0 ? (
          <View style={s.totalsBlock}>
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
          </View>
        ) : null}

        <View style={s.totalFinal} wrap={false}>
          <Text style={s.totalFinalLabel}>{datos.saldoLabel}</Text>
          <Text style={s.totalFinalVal}>{formatearMonto(datos.saldo)} MXN</Text>
        </View>

        {datos.tieneBanco ? (
          <View style={s.bankBlock}>
            <Text style={s.bankTitle} minPresenceAhead={14}>Datos para transferencia</Text>
            {datos.banco ? <Text style={s.bankRow}>Banco: {datos.banco}</Text> : null}
            {datos.bancotitular ? <Text style={s.bankRow}>Titular: {datos.bancotitular}</Text> : null}
            {datos.bancoclabe ? <Text style={s.bankRow}>CLABE: {datos.bancoclabe}</Text> : null}
            {datos.bancotarjeta ? <Text style={s.bankRow}>Número de tarjeta: {datos.bancotarjeta}</Text> : null}
            {datos.bancoaccount ? <Text style={s.bankRow}>Cuenta: {datos.bancoaccount}</Text> : null}
            {datos.bancoinstrucciones ? <Text style={s.bankInstr}>{datos.bancoinstrucciones}</Text> : null}
          </View>
        ) : null}

        {datos.condicionesPago ? (
          <View style={[s.htmlBloqueCard, { marginBottom: 16 }]}>
            <Text style={s.htmlBloqueLabel} minPresenceAhead={14}>Condiciones de pago</Text>
            <Text style={s.htmlParrafo}>{datos.condicionesPago}</Text>
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

// crearCotizacionPDF: genera SIEMPRE el documento ORIGINAL de la cotización,
// tal como se cotizó , items, precios, descuento y total quedan fijos aquí
// y NUNCA se les resta ningún pago registrado después. Antes este PDF traía
// cot.pagos y mostraba "Saldo a cubrir"/"Pagado completamente" restando los
// pagos ya cobrados , eso hacía que, en cuanto un trabajo quedaba saldado,
// descargar "la cotización" mostrara $0.00 en vez del documento que
// realmente se le mandó al cliente. El estado de pagos/saldo YA tiene su
// propio documento dedicado (Comprobante general / estado de cuenta, ver
// manejarGenerarDocumentoFinancieroPDF en CLEO.jsx), así que aquí nunca se
// vuelve a mezclar , quien quiera ver pagos usa ese otro documento, y este
// PDF siempre reproduce el original.
export async function crearCotizacionPDF(cot, cliente, perfil) {
  cot = cot || {};
  cliente = cliente || {};
  perfil = perfil || {};

  var pc = colorHexSeguroPDF(perfil.color, "#534AB7");
  var ps = colorHexSeguroPDF(perfil.colorSecundario, "#F0EEFF");

  var folio = "COT-" + String(cot.id || "").slice(-4).padStart(4, "0");

  var total = numeroSeguro(cot.monto);

  var itemsPDF = obtenerItemsCotizacionPDF(cot);
  var subtotalItems =
    numeroSeguro(cot.subtotal) > 0
      ? numeroSeguro(cot.subtotal)
      : numeroSeguro(itemsPDF.reduce(function (s, it) { return s + it.total; }, 0));
  var descuentoMonto = 0;
  var descuentoTexto = "";
  if (numeroSeguro(cot.descuento) > 0) {
    if (cot.tipoDescuento === "porcentaje") {
      descuentoMonto = numeroSeguro((subtotalItems * numeroSeguro(cot.descuento)) / 100);
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
  // Recorta el margen vacío del archivo original (ver recortarPaddingLogoPDF)
  // ANTES de medir proporción , así una marca pequeña dentro de un lienzo
  // grande con padding no sale mini solo porque el archivo tenía espacio de
  // sobra alrededor. Nunca bloquea la generación del PDF: si algo falla, se
  // sigue usando la imagen original tal cual.
  if (logo) logo = await recortarPaddingLogoPDF(logo);
  // Proporción REAL del logo (isotipo cuadrado vs. horizontal con letras) ,
  // ver calcularEstiloLogoPDF. Nunca bloquea la generación del PDF: si algo
  // falla al leer las dimensiones, cae al tamaño compacto de siempre.
  var logoDim = logo ? await obtenerDimensionesImagenPDF(logo) : null;
  var logoEstilo = calcularEstiloLogoPDF(logoDim);
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
    logoAncho: logoEstilo.width,
    logoAlto: logoEstilo.height,
    clienteNombre: nombreCliente,
    clienteNegocio: textoPlanoSeguro(cliente.negocio, 120),
    clienteContacto: textoPlanoSeguro(cliente.contacto, 60),
    iniciales: iniciales,
    items: itemsPDF,
    total: total,
    subtotal: subtotalItems,
    descuentoMonto: descuentoMonto,
    descuentoTexto: descuentoTexto,
    // saldoLabel/saldo: SIEMPRE el total original cotizado (fijo), nunca se
    // le resta ningún pago , ver comentario junto a crearCotizacionPDF.
    saldoLabel: "Total",
    saldo: total,
    notas: htmlANotaPlanaPDF(cot.notas),
    condicionesServicioBloques: bloquesDesdeHTMLPDF(cot.svCondicionesHtml || cot.svCondiciones),
    // La cotización muestra exactamente lo que esté capturado en Perfil ,
    // si hay CLABE, sale CLABE; si hay número de tarjeta, sale número de
    // tarjeta; si hay ambos, salen ambos. Ninguno se oculta a la fuerza.
    tieneBanco: !!(perfil.banco || perfil.bancoclabe || perfil.bancotarjeta || perfil.bancoaccount),
    banco: textoPlanoSeguro(perfil.banco, 80),
    bancotitular: textoPlanoSeguro(perfil.bancotitular, 120),
    bancoclabe: textoPlanoSeguro(perfil.bancoclabe, 40),
    bancotarjeta: formatearTarjetaPDF(perfil.bancotarjeta),
    bancoaccount: textoPlanoSeguro(perfil.bancoaccount, 40),
    bancoinstrucciones: textoPlanoSeguro(perfil.bancoinstrucciones, 500),
    condicionesPago: textoPlanoSeguro(cot.condicionesPago != null ? cot.condicionesPago : perfil.condicionesPago, 500),
    mensaje: textoPlanoSeguro(perfil.mensaje, 300),
  };

  var blobBruto;
  try {
    blobBruto = await pdf(<DocumentoCotizacion datos={datos} />).toBlob();
  } catch (errorPrimerIntento) {
    if (!datos.logo) throw errorPrimerIntento;
    var datosSinLogo = Object.assign({}, datos, { logo: null });
    blobBruto = await pdf(<DocumentoCotizacion datos={datosSinLogo} />).toBlob();
  }

  if (!(blobBruto instanceof Blob)) throw new Error("PDF inválido: no es un Blob");
  if (blobBruto.size < 100) throw new Error("PDF inválido: tamaño insuficiente");
  var primerosBytes = await blobBruto.slice(0, 5).arrayBuffer();
  var firma = String.fromCharCode.apply(null, new Uint8Array(primerosBytes));
  if (firma !== "%PDF-") throw new Error("PDF inválido: firma incorrecta");

  var blob = blobBruto.type === "application/pdf" ? blobBruto : new Blob([blobBruto], { type: "application/pdf" });

  var nombreArchivo =
    nombreArchivoSeguroPDF(
      "Cotizacion_" + folio + "_" + (nombreCliente !== "--" ? nombreCliente.replace(/ /g, "_") : "cliente") + "_" + (cot.fecha || ""),
      "Cotizacion"
    ) + ".pdf";

  return { blob: blob, nombreArchivo: nombreArchivo, titulo: "Cotización " + folio, folio: folio };
}
