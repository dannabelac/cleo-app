import React from "react";
import { Document, Page, View, Text, Image, StyleSheet, Svg, Path, Circle, Rect, Defs, LinearGradient, Stop, pdf } from "@react-pdf/renderer";

// ── Helpers de seguridad locales ───────────────────────────────────────────
// Igual que en CotizacionPDF.jsx: este archivo es independiente de CLEO.jsx
// (evita imports circulares) y mantiene sus propias copias mínimas de las
// mismas validaciones. Todo contenido dinámico se renderiza exclusivamente
// dentro de <Text>, nunca se interpreta HTML, nunca se crean enlaces
// automáticos, nunca se cargan imágenes remotas. No se registra en consola
// perfil, datos bancarios, clientes, conceptos ni pagos.

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
// en CLEO.jsx (archivo independiente, evita imports circulares, ver
// comentario arriba).
function numeroSeguro(valor) {
  var n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  var signo = n < 0 ? -1 : 1;
  return (signo * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
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

// formatearTarjetaPDF: solo dígitos, agrupados de 4 en 4 para lectura ,
// nunca valida ni verifica el número (eso no le corresponde a este
// comprobante), simplemente lo muestra tal como se capturó en Perfil ,
// mismo criterio que en CotizacionPDF.jsx.
function formatearTarjetaPDF(valor) {
  var soloDigitos = String(valor == null ? "" : valor).replace(/\D/g, "").slice(0, 16);
  if (!soloDigitos) return "";
  return soloDigitos.replace(/(.{4})/g, "$1 ").trim();
}

// ── Logo: dimensiones reales + recorte de margen vacío ────────────────────
// Mismo criterio y mismo bug corregido que en CotizacionPDF.jsx: "Image" a
// secas aquí es el componente de @react-pdf/renderer importado arriba, NO
// el constructor nativo del navegador , usar "new Image()" a secas fallaría
// en silencio (atrapado por el catch) y esta función SIEMPRE resolvería
// null sin medir nada de verdad. Por eso se usa window.Image explícito.
function obtenerDimensionesImagenPDF(dataUrl) {
  return new Promise(function (resolve) {
    if (typeof window === "undefined" || typeof window.Image === "undefined" || !dataUrl) { resolve(null); return; }
    try {
      var img = new window.Image();
      img.onload = function () { resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 }); };
      img.onerror = function () { resolve(null); };
      img.src = dataUrl;
    } catch (e) { resolve(null); }
  });
}

// calcularEstiloLogoPDF: ajuste "contain" real dentro de una caja de 140x38
// (el encabezado del comprobante es más compacto que el de la cotización) ,
// un logo cuadrado/isotipo cae naturalmente a ~38x38, uno horizontal con
// letras se estira hasta 140 de ancho manteniendo su altura real
// proporcional , nunca se deforma ni se recorta.
function calcularEstiloLogoPDF(dim) {
  var maxW = 140, maxH = 38;
  if (!dim || !dim.width || !dim.height) return { width: maxH, height: maxH };
  var ratio = dim.width / dim.height;
  var w = maxW, h = maxW / ratio;
  if (h > maxH) { h = maxH; w = maxH * ratio; }
  return { width: numeroSeguro(w) || maxH, height: numeroSeguro(h) || maxH };
}

// recortarPaddingLogoPDF: idéntica lógica que en CotizacionPDF.jsx , muchos
// logos exportados (Canva, Illustrator, etc.) traen un margen transparente
// grande alrededor de la marca real, esto lo recorta ANTES de medir y
// dibujar el logo. Puramente visual para ESTE documento , nunca toca
// perfil.logo. Cualquier fallo regresa la imagen original sin tocar.
function recortarPaddingLogoPDF(dataUrl) {
  return new Promise(function (resolve) {
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

// Equivalente local de obtenerItemsCotizacion/obtenerItemsPedido (definidas
// en el archivo principal) , este módulo es independiente (evita imports
// circulares, ver comentario arriba), así que mantiene su propia copia
// mínima con la MISMA lógica no destructiva: si `cot.items` existe y tiene
// contenido (cotización, pedido o el objeto "cotParaComprobante" armado en
// CLEO_55.jsx, que siempre preserva items vía spread), se usa tal cual , si
// no, se sintetiza UN item legacy a partir de cot.concepto/cantidad/
// precioUnit, igual que ya hace CotizacionPDF.jsx. Antes este archivo nunca
// miraba cot.items , siempre usaba cot.concepto directo, que para una
// cotización de más de un producto/servicio es el resumen corto pensado
// para tarjetas ("Aretes dorados + 1 concepto más"), no un texto pensado
// para un comprobante formal , por eso el comprobante mostraba ese resumen
// truncado en vez del desglose real.
function obtenerItemsComprobantePDF(cot, fallbackNombre) {
  if (!cot) return [{ nombre: textoPlanoSeguro(fallbackNombre || "", 300), cantidad: 1, precioUnitario: 0, total: 0 }];
  if (Array.isArray(cot.items) && cot.items.length > 0) {
    return cot.items.map(function (it) {
      var cantidad = numeroSeguro(it.cantidad) || 1;
      var precioUnitario = numeroSeguro(it.precioUnitario);
      return {
        nombre: textoPlanoSeguro(it.nombre, 300),
        cantidad: cantidad,
        precioUnitario: precioUnitario,
        total: it.total != null ? numeroSeguro(it.total) : numeroSeguro(cantidad * precioUnitario),
      };
    });
  }
  var cantidadLegacy = numeroSeguro(cot.cantidad) || 1;
  var precioLegacy = numeroSeguro(cot.precioUnit != null ? cot.precioUnit : cot.monto);
  return [
    {
      nombre: textoPlanoSeguro(cot.concepto || fallbackNombre || "", 300),
      cantidad: cantidadLegacy,
      precioUnitario: precioLegacy,
      total: numeroSeguro(cantidadLegacy * precioLegacy),
    },
  ];
}

// ── Movimientos (pagos) , limpieza defensiva ──────────────────────────────
// Nunca deja que una entrada dañada rompa todo el documento: se ignoran
// elementos nulos o que no son objetos, se limita la cantidad máxima, se
// limitan concepto/fecha, y los montos no finitos se tratan como 0. Un pago
// de monto 0 solo se conserva si trae información útil (concepto o fecha).
function limpiarPagosPDF(pagosCrudos) {
  var lista = Array.isArray(pagosCrudos) ? pagosCrudos : [];
  var limpios = [];
  for (var i = 0; i < lista.length && limpios.length < 200; i++) {
    var p = lista[i];
    if (!p || typeof p !== "object") continue;
    var monto = numeroSeguro(p.monto);
    var concepto = textoPlanoSeguro(p.concepto || "Pago recibido", 120);
    var fecha = textoPlanoSeguro(p.fecha, 40);
    if (monto === 0 && !p.concepto && !p.fecha) continue; // sin monto ni información útil
    limpios.push({ id: p.id, concepto: concepto, fecha: fecha, monto: monto, esPagoActual: false });
  }
  return limpios;
}

// Marca (solo visualmente, nunca altera montos ni la lista) cuál de los
// movimientos ya limpios corresponde al pago que originó el comprobante.
// Se compara primero por id , si el pago original no tenía id, se compara
// de forma defensiva por monto+fecha+concepto ya limpios (mismos valores
// que ya se muestran), y solo se marca el PRIMER movimiento que coincide,
// para nunca marcar más de uno por error.
function marcarPagoActual(pagosLimpios, pagoOriginal) {
  if (!pagoOriginal) return pagosLimpios;
  var yaMarcado = false;
  var tieneId = pagoOriginal.id !== undefined && pagoOriginal.id !== null;
  var montoOriginal = numeroSeguro(pagoOriginal.monto);
  var conceptoOriginal = textoPlanoSeguro(pagoOriginal.concepto || "Pago recibido", 120);
  var fechaOriginal = textoPlanoSeguro(pagoOriginal.fecha, 40);
  return pagosLimpios.map(function (p) {
    if (yaMarcado) return p;
    var coincide = tieneId ? p.id === pagoOriginal.id : (p.monto === montoOriginal && p.fecha === fechaOriginal && p.concepto === conceptoOriginal);
    if (coincide) {
      yaMarcado = true;
      return Object.assign({}, p, { esPagoActual: true });
    }
    return p;
  });
}

// ── Estilos ─────────────────────────────────────────────────────────────
// Traslado directo de _comprobanteShared: mismos tamaños, mismos colores,
// misma jerarquía. React PDF no soporta CSS Grid , el bloque bancario del
// HTML original ya usaba grid-template-columns:1fr forzado a una sola
// columna en la práctica (nunca se usan las 2 columnas reales), así que el
// equivalente en Flexbox de una sola columna es visualmente idéntico.
function crearEstilosComprobante(pc, ps) {
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
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1.5, borderBottomColor: pc },
    headerIzq: { maxWidth: 300 },
    // width/height REALES se calculan por logo (ver calcularEstiloLogoPDF)
    // y se mezclan con este estilo base al renderizar , nunca un tamaño fijo
    // igual para un isotipo cuadrado y un logo horizontal con letras.
    logo: { objectFit: "contain", marginBottom: 8, borderRadius: 6 },
    bizName: { fontSize: 13, fontFamily: "Helvetica-Bold" },
    bizMeta: { fontSize: 8.5, color: "#888888", marginTop: 2 },
    headerDer: { alignItems: "flex-end" },
    docLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 1.5, color: pc, textTransform: "uppercase", marginBottom: 3 },
    docFolio: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
    docFecha: { fontSize: 8.5, color: "#888888", marginTop: 5 },
    paraBlock: { flexDirection: "row", alignItems: "center", backgroundColor: ps, borderRadius: 8, padding: 10, marginBottom: 18 },
    avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: pc, alignItems: "center", justifyContent: "center", marginRight: 10 },
    avatarTexto: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#ffffff" },
    paraLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 1.5, color: pc, textTransform: "uppercase" },
    paraName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
    paraSub: { fontSize: 8.5, color: "#777777" },
    conceptoBlock: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f0f0f0", marginBottom: 14 },
    conceptoLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 1.5, color: "#aaaaaa", textTransform: "uppercase", marginBottom: 4 },
    conceptoNombre: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
    totalLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, fontSize: 9.5, color: "#888888", borderBottomWidth: 0.5, borderBottomColor: "#f5f5f5" },
    totalLineAccentVal: { fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
    totalLinePaid: { color: "#1A7A5E" },
    totalLineDestacada: { backgroundColor: ps, borderLeftWidth: 2, borderLeftColor: pc, paddingLeft: 8, paddingVertical: 7, borderBottomWidth: 0, marginBottom: 2, borderRadius: 3 },
    etiquetaEstePago: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: pc, textTransform: "uppercase", letterSpacing: 0.5, marginLeft: 6 },
    sinPagosTexto: { fontSize: 9.5, color: "#aaaaaa", fontStyle: "italic", paddingVertical: 8 },
    totalFinal: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 16, borderTopWidth: 1.5, borderTopColor: pc, borderBottomWidth: 1.5, borderBottomColor: pc, marginTop: 6, marginBottom: 16 },
    totalFinalLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#999999", textTransform: "uppercase", letterSpacing: 1.5 },
    totalFinalVal: { fontSize: 22, fontFamily: "Helvetica-Bold", color: pc },
    bankBlock: { backgroundColor: "#f9f9fb", borderRadius: 8, padding: 14, marginBottom: 16 },
    bankTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#aaaaaa", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 },
    bankRow: { flexDirection: "row", fontSize: 8.5, marginBottom: 4 },
    bankKey: { color: "#aaaaaa", width: 42 },
    bankVal: { fontFamily: "Helvetica-Bold", color: "#1a1a2e" },
    bankInstr: { fontSize: 8, color: "#888888", marginTop: 6, lineHeight: 1.4 },
    footerMsg: { fontSize: 9, color: "#aaaaaa", fontStyle: "italic", textAlign: "center", marginBottom: 20 },
    footerBar: {
      position: "absolute",
      bottom: 24,
      left: 48,
      right: 48,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: 7,
      color: "#bbbbbb",
      borderTopWidth: 0.5,
      borderTopColor: "#eeeeee",
      paddingTop: 6,
    },
    redesFila: { flexDirection: "row", alignItems: "center" },
    redesItem: { flexDirection: "row", alignItems: "center", marginRight: 10 },
    redesTexto: { fontSize: 7, color: "#bbbbbb", marginLeft: 3 },
  });
}

// ── Íconos de redes sociales (SVG propio de React PDF) ───────────────────
// Recreados con componentes Svg/Path/Circle/Rect/Defs/LinearGradient/Stop
// de @react-pdf/renderer , nunca se cargan como imagen externa, y nunca
// se convierten en un enlace activo (solo texto + ícono decorativo).
function IconoTikTok({ color }) {
  return (
    <Svg width={9} height={9} viewBox="0 0 24 24">
      <Path
        d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.75a8.16 8.16 0 004.77 1.52V6.82a4.85 4.85 0 01-1-.13z"
        fill={color}
      />
    </Svg>
  );
}
function IconoInstagram() {
  return (
    <Svg width={9} height={9} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="igGrad" x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#F58529" />
          <Stop offset="0.5" stopColor="#DD2A7B" />
          <Stop offset="1" stopColor="#8134AF" />
        </LinearGradient>
      </Defs>
      <Rect x="2" y="2" width="20" height="20" rx="5" fill="url(#igGrad)" />
      <Circle cx="12" cy="12" r="4" stroke="#ffffff" strokeWidth={2} fill="none" />
      <Circle cx="17" cy="7" r="1.2" fill="#ffffff" />
    </Svg>
  );
}
function IconoFacebook() {
  return (
    <Svg width={9} height={9} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" fill="#185FA5" />
      <Path d="M13.5 8H15V6h-1.5C12.1 6 11 7.1 11 8.5V10H9.5v2H11v6h2v-6h1.5l.5-2H13V8.5c0-.3.2-.5.5-.5z" fill="#ffffff" />
    </Svg>
  );
}

// ── Documento ───────────────────────────────────────────────────────────
function DocumentoFinanciero({ datos }) {
  var s = datos.estilos;
  var tienePagos = datos.pagos.length > 0;
  return (
    <Document>
      <Page size="LETTER" style={s.pagina} wrap>
        <View style={s.header} wrap={false}>
          <View>
            {datos.logo ? <Image src={datos.logo} style={[s.logo, { width: datos.logoAncho, height: datos.logoAlto }]} /> : null}
            <Text style={s.bizName}>{datos.nombreNegocio}</Text>
            {datos.bizMeta ? <Text style={s.bizMeta}>{datos.bizMeta}</Text> : null}
          </View>
          <View style={s.headerDer}>
            <Text style={s.docLabel}>{datos.tipoLabel}</Text>
            <Text style={s.docFolio}>{datos.folio}</Text>
            <Text style={s.docFecha}>{datos.fecha}</Text>
          </View>
        </View>

        <View style={s.paraBlock} wrap={false}>
          <View style={s.avatar}>
            <Text style={s.avatarTexto}>{datos.iniciales}</Text>
          </View>
          <View>
            <Text style={s.paraLabel}>Para</Text>
            <Text style={s.paraName}>{datos.clienteNombre}</Text>
            {datos.clienteNegocio ? <Text style={s.paraSub}>{datos.clienteNegocio}</Text> : null}
          </View>
        </View>

        <View style={s.conceptoBlock} wrap={false}>
          <Text style={s.conceptoLabel}>Concepto</Text>
          {/* Con 1 solo item se muestra EXACTAMENTE igual que antes (mismo
              estilo, sin prefijo de cantidad) , con varios, cada uno se
              imprime en su propia línea, para que un comprobante de una
              cotización con 3 productos ya no se vea truncado como "Aretes
              dorados + 2 conceptos más". */}
          {datos.items.map(function (it, i) {
            var multiItem = datos.items.length > 1;
            var etiqueta = multiItem && it.cantidad > 1 ? it.cantidad + "× " + it.nombre : it.nombre;
            return (
              <Text key={i} style={i > 0 ? [s.conceptoNombre, { marginTop: 3 }] : s.conceptoNombre}>
                {etiqueta}
              </Text>
            );
          })}
        </View>

        <View style={s.totalLine} wrap={false}>
          <Text>Total acordado</Text>
          <Text style={s.totalLineAccentVal}>{formatearMonto(datos.monto)} MXN</Text>
        </View>

        {tienePagos ? (
          datos.pagos.map(function (p, i) {
            var estiloFila = p.esPagoActual ? [s.totalLine, s.totalLinePaid, s.totalLineDestacada] : [s.totalLine, s.totalLinePaid];
            return (
              <View style={estiloFila} key={i} wrap={false}>
                <Text>
                  {p.concepto} · {p.fecha}
                  {p.esPagoActual ? <Text style={s.etiquetaEstePago}>ESTE PAGO</Text> : null}
                </Text>
                <Text>- {formatearMonto(p.monto)} MXN</Text>
              </View>
            );
          })
        ) : datos.mostrarMensajeSinPagos ? (
          <Text style={s.sinPagosTexto}>Aún no hay pagos registrados</Text>
        ) : null}

        <View style={s.totalFinal} wrap={false}>
          <Text style={s.totalFinalLabel}>{datos.saldoLabel}</Text>
          <Text style={s.totalFinalVal}>{formatearMonto(datos.saldo)} MXN</Text>
        </View>

        {datos.tieneBanco ? (
          <View style={s.bankBlock} wrap={false}>
            <Text style={s.bankTitle}>Datos para transferencia</Text>
            {datos.banco ? (
              <View style={s.bankRow}>
                <Text style={s.bankKey}>Banco</Text>
                <Text style={s.bankVal}>{datos.banco}</Text>
              </View>
            ) : null}
            {datos.bancotitular ? (
              <View style={s.bankRow}>
                <Text style={s.bankKey}>Titular</Text>
                <Text style={s.bankVal}>{datos.bancotitular}</Text>
              </View>
            ) : null}
            {datos.bancoclabe ? (
              <View style={s.bankRow}>
                <Text style={s.bankKey}>CLABE</Text>
                <Text style={s.bankVal}>{datos.bancoclabe}</Text>
              </View>
            ) : null}
            {datos.bancotarjeta ? (
              <View style={s.bankRow}>
                <Text style={s.bankKey}>Tarjeta</Text>
                <Text style={s.bankVal}>{datos.bancotarjeta}</Text>
              </View>
            ) : null}
            {datos.bancoaccount ? (
              <View style={s.bankRow}>
                <Text style={s.bankKey}>Cuenta</Text>
                <Text style={s.bankVal}>{datos.bancoaccount}</Text>
              </View>
            ) : null}
            {datos.bancoinstrucciones ? <Text style={s.bankInstr}>{datos.bancoinstrucciones}</Text> : null}
          </View>
        ) : null}

        {datos.mensaje ? <Text style={s.footerMsg}>"{datos.mensaje}"</Text> : null}

        <View style={s.footerBar} fixed>
          <Text>
            {datos.footerContacto}
            {datos.footerContacto && datos.nombreNegocio ? " · " : ""}
            {datos.nombreNegocio}
          </Text>
          <View style={s.redesFila}>
            {datos.redesTT ? (
              <View style={s.redesItem}>
                <IconoTikTok color={datos.pc} />
                <Text style={s.redesTexto}>{datos.redesTT}</Text>
              </View>
            ) : null}
            {datos.redesIG ? (
              <View style={s.redesItem}>
                <IconoInstagram />
                <Text style={s.redesTexto}>{datos.redesIG}</Text>
              </View>
            ) : null}
            {datos.redesFB ? (
              <View style={s.redesItem}>
                <IconoFacebook />
                <Text style={s.redesTexto}>{datos.redesFB}</Text>
              </View>
            ) : null}
          </View>
          <Text>
            {datos.folio} · {datos.fecha}
          </Text>
        </View>
        <Text
          style={{ position: "absolute", bottom: 8, right: 48, fontSize: 6.5, color: "#cccccc" }}
          render={function (info) { return "Página " + info.pageNumber + " de " + info.totalPages; }}
          fixed
        />
      </Page>
    </Document>
  );
}

// ── Construcción de datos comunes ─────────────────────────────────────────
// Ahora es ASYNC: el logo se recorta de su margen vacío y se miden sus
// dimensiones reales ANTES de construir `datos` (misma secuencia que
// crearCotizacionPDF en CotizacionPDF.jsx) , así calcularEstiloLogoPDF
// siempre calcula sobre la marca real, nunca sobre el lienzo con padding.
async function construirDatosBase(tipoLabel, folio, itemsPDF, monto, pagosLimpios, saldo, cliente, perfil, fecha, mostrarMensajeSinPagos) {
  cliente = cliente || {};
  perfil = perfil || {};

  var pc = colorHexSeguroPDF(perfil.color, "#534AB7");
  var ps = colorHexSeguroPDF(perfil.colorSecundario, "#F0EEFF");

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
  if (logo) logo = await recortarPaddingLogoPDF(logo);
  var logoDim = logo ? await obtenerDimensionesImagenPDF(logo) : null;
  var logoEstilo = calcularEstiloLogoPDF(logoDim);

  var bizMeta = [perfil.email, perfil.direccion]
    .filter(Boolean)
    .map(function (v) { return textoPlanoSeguro(v, 120); })
    .join(" · ");

  return {
    estilos: crearEstilosComprobante(pc, ps),
    pc: pc,
    tipoLabel: tipoLabel,
    folio: folio,
    fecha: textoPlanoSeguro(fecha, 40),
    nombreNegocio: textoPlanoSeguro(perfil.nombre, 120) || "Mi negocio",
    bizMeta: bizMeta,
    footerContacto: textoPlanoSeguro(perfil.telefono, 40),
    logo: logo || null,
    logoAncho: logoEstilo.width,
    logoAlto: logoEstilo.height,
    clienteNombre: nombreCliente,
    clienteNegocio: textoPlanoSeguro(cliente.negocio, 120),
    iniciales: iniciales,
    items: itemsPDF && itemsPDF.length > 0 ? itemsPDF : [{ nombre: "", cantidad: 1, precioUnitario: 0, total: 0 }],
    monto: numeroSeguro(monto),
    pagos: pagosLimpios,
    mostrarMensajeSinPagos: !!mostrarMensajeSinPagos,
    saldoLabel: saldo <= 0 ? "Pagado completamente" : "Saldo pendiente",
    saldo: numeroSeguro(Math.max(0, saldo)),
    // La cotización muestra exactamente lo que esté capturado en Perfil ,
    // si hay CLABE, sale CLABE; si hay número de tarjeta, sale número de
    // tarjeta; si hay ambos, salen ambos. Ninguno se oculta a la fuerza ,
    // mismo criterio que CotizacionPDF.jsx.
    tieneBanco: !!(perfil.banco || perfil.bancoclabe || perfil.bancotarjeta || perfil.bancoaccount),
    banco: textoPlanoSeguro(perfil.banco, 80),
    bancotitular: textoPlanoSeguro(perfil.bancotitular, 120),
    bancoclabe: textoPlanoSeguro(perfil.bancoclabe, 40),
    bancotarjeta: formatearTarjetaPDF(perfil.bancotarjeta),
    bancoaccount: textoPlanoSeguro(perfil.bancoaccount, 40),
    bancoinstrucciones: textoPlanoSeguro(perfil.bancoinstrucciones, 500),
    mensaje: textoPlanoSeguro(perfil.mensaje, 300),
    redesTT: textoPlanoSeguro(perfil.redesTT, 60),
    redesIG: textoPlanoSeguro(perfil.redesIG, 60),
    redesFB: textoPlanoSeguro(perfil.redesFB, 60),
  };
}

async function generarBlobDesdeDatos(datos) {
  var blobBruto;
  try {
    blobBruto = await pdf(<DocumentoFinanciero datos={datos} />).toBlob();
  } catch (errorPrimerIntento) {
    if (!datos.logo) throw errorPrimerIntento;
    var datosSinLogo = Object.assign({}, datos, { logo: null });
    blobBruto = await pdf(<DocumentoFinanciero datos={datosSinLogo} />).toBlob();
  }

  if (!(blobBruto instanceof Blob)) throw new Error("PDF inválido: no es un Blob");
  if (blobBruto.size < 100) throw new Error("PDF inválido: tamaño insuficiente");
  var primerosBytes = await blobBruto.slice(0, 5).arrayBuffer();
  var firma = String.fromCharCode.apply(null, new Uint8Array(primerosBytes));
  if (firma !== "%PDF-") throw new Error("PDF inválido: firma incorrecta");

  return blobBruto.type === "application/pdf" ? blobBruto : new Blob([blobBruto], { type: "application/pdf" });
}

// ── API pública ─────────────────────────────────────────────────────────
// tipo: "anticipo" | "pago" | "estado_cuenta"
export async function crearDocumentoFinancieroPDF(opciones) {
  opciones = opciones || {};
  var tipo = opciones.tipo;
  var cot = opciones.cot || {};
  var pago = opciones.pago;
  var cliente = opciones.cliente || {};
  var perfil = opciones.perfil || {};
  var fechaHoy = opciones.fechaHoy;

  if (tipo !== "anticipo" && tipo !== "pago" && tipo !== "estado_cuenta") {
    throw new Error("Tipo de documento financiero no reconocido.");
  }

  var nombreClienteArchivo = textoPlanoSeguro(cliente && cliente.nombre, 200);
  var fragmentoCliente = nombreClienteArchivo ? nombreClienteArchivo.replace(/ /g, "_") : "cliente";

  var datos, nombreArchivo, titulo, folio;

  if (tipo === "anticipo") {
    // Muestra únicamente el anticipo correspondiente , nunca se mezcla con
    // cot.pagos, para no duplicar el mismo movimiento dos veces.
    var anticipo = numeroSeguro(cot.anticipo);
    var totalAnt = numeroSeguro(cot.monto);
    var saldoAnt = numeroSeguro(Math.max(0, totalAnt - anticipo));
    var fechaAnt = textoPlanoSeguro(cot.fechaAnticipo, 40) || textoPlanoSeguro(fechaHoy, 40);
    folio = "ANT-" + String(cot.id || "").slice(-4).padStart(4, "0") + "-" + String(Date.now()).slice(-4);
    var pagosAnticipo = anticipo > 0 || cot.fechaAnticipo ? [{ concepto: "Anticipo recibido", fecha: fechaAnt, monto: anticipo }] : [];
    datos = await construirDatosBase(
      "Comprobante de Anticipo",
      folio,
      obtenerItemsComprobantePDF(cot),
      totalAnt,
      pagosAnticipo,
      saldoAnt,
      cliente,
      perfil,
      fechaAnt,
      false
    );
    nombreArchivo = nombreArchivoSeguroPDF("Comprobante_" + fragmentoCliente + "_" + fechaAnt, "Comprobante") + ".pdf";
    titulo = "Comprobante " + folio;
  } else if (tipo === "pago") {
    var pagosLimpiosTodos = limpiarPagosPDF(cot.pagos);
    // El pago específico que originó el comprobante se destaca , si ya
    // existe dentro de cot.pagos (mismo id), no se duplica en la lista.
    var pagoEspecifico = pago || {};
    var yaEstaEnLista =
      pagoEspecifico.id !== undefined && pagosLimpiosTodos.some(function (p) { return p.id === pagoEspecifico.id; });
    var pagosParaMostrar = yaEstaEnLista
      ? pagosLimpiosTodos
      : pagosLimpiosTodos.concat(
          limpiarPagosPDF([pagoEspecifico])
        );
    var totalPag = numeroSeguro(cot.monto);
    var totalPagadoPag = numeroSeguro(pagosLimpiosTodos.reduce(function (s, p) { return s + p.monto; }, 0) + (yaEstaEnLista ? 0 : numeroSeguro(pagoEspecifico.monto)));
    var saldoPag = numeroSeguro(Math.max(0, totalPag - totalPagadoPag));
    var fechaPag = textoPlanoSeguro(pagoEspecifico.fecha, 40) || textoPlanoSeguro(fechaHoy, 40);
    folio = "PAG-" + String(pagoEspecifico.id || "").slice(-4);
    // El marcado del pago actual ocurre DESPUÉS de todos los cálculos de
    // arriba (totalPagadoPag/saldoPag) , es puramente visual, nunca los
    // altera.
    var pagosMarcados = marcarPagoActual(pagosParaMostrar, pagoEspecifico);
    datos = await construirDatosBase(
      "Comprobante de Pago",
      folio,
      obtenerItemsComprobantePDF(cot, "Venta"),
      totalPag,
      pagosMarcados,
      saldoPag,
      cliente,
      perfil,
      fechaPag,
      false
    );
    nombreArchivo = nombreArchivoSeguroPDF("ComprobantePago_" + fragmentoCliente + "_" + fechaPag, "ComprobantePago") + ".pdf";
    titulo = "Comprobante de pago " + folio;
  } else {
    // estado_cuenta
    var pagosLimpiosEst = limpiarPagosPDF(cot.pagos);
    var totalEst = numeroSeguro(cot.monto);
    var totalPagadoEst = numeroSeguro(pagosLimpiosEst.reduce(function (s, p) { return s + p.monto; }, 0));
    var saldoEst = numeroSeguro(Math.max(0, totalEst - totalPagadoEst));
    var fechaEst = textoPlanoSeguro(fechaHoy, 40);
    folio = "EST-" + String(cot.id || "").slice(-4).padStart(4, "0");
    datos = await construirDatosBase(
      "Estado de Cuenta",
      folio,
      obtenerItemsComprobantePDF(cot, "Venta directa"),
      totalEst,
      pagosLimpiosEst,
      saldoEst,
      cliente,
      perfil,
      fechaEst,
      true // mostrar "Aún no hay pagos registrados" si no hay movimientos
    );
    nombreArchivo = nombreArchivoSeguroPDF("EstadoCuenta_" + fragmentoCliente + "_" + fechaEst, "EstadoCuenta") + ".pdf";
    titulo = "Estado de cuenta " + folio;
  }

  var blob = await generarBlobDesdeDatos(datos);

  return { blob: blob, nombreArchivo: nombreArchivo, titulo: titulo, folio: folio };
}
