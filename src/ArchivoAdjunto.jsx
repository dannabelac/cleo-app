import React from "react";
import { supabase } from "./supabaseClient";

// ── Constantes ──────────────────────────────────────────────────────────
// Mismo bucket privado compartido por cotizaciones y pedidos , no se crea
// un bucket nuevo ni una tabla nueva en Supabase. La diferenciación entre
// ambos tipos de documento vive en la ruta (ver construirRutaStorage) y en
// el objeto que cada quien guarda (cotizacion.archivoAdjunto /
// pedido.archivoAdjunto), nunca en infraestructura distinta.
var BUCKET = "cleo-cotizacion-archivos";
var TAMANO_MAX = 5 * 1024 * 1024; // 5 MB exactos
var MIME_A_EXTENSION = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
// Extensiones visibles aceptadas por MIME , comparación sin distinguir
// mayúsculas. JPEG admite ambas grafías comunes.
var EXTENSIONES_VISIBLES_POR_MIME = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

// Carpeta de primer nivel (dentro del userId) según el tipo de documento ,
// única fuente de verdad para esa diferenciación de ruta.
var CARPETA_POR_TIPO_DOCUMENTO = {
  cotizacion: "cotizaciones",
  pedido: "pedidos",
};

// ── Helpers de seguridad ────────────────────────────────────────────────
// Nunca se usa el nombre tal cual como HTML , siempre se muestra como
// texto normal de React (nunca dangerouslySetInnerHTML).
function normalizarNombre(nombre) {
  var texto = String(nombre == null ? "" : nombre);
  texto = texto.replace(/[\x00-\x1F\x7F]/g, ""); // caracteres de control
  texto = texto.slice(0, 150);
  return texto || "archivo";
}

function extensionVisibleValida(nombreArchivo, mimeType) {
  var nombreLower = String(nombreArchivo || "").toLowerCase();
  var permitidas = EXTENSIONES_VISIBLES_POR_MIME[mimeType] || [];
  return permitidas.some(function (ext) {
    return nombreLower.slice(-ext.length) === ext;
  });
}

async function leerPrimerosBytes(file, cantidad) {
  var buffer = await file.slice(0, cantidad).arrayBuffer();
  return new Uint8Array(buffer);
}

// Valida tamaño, MIME, extensión visible y firma real del contenido , si
// cualquiera de estas señales no coincide con las demás, se rechaza. La
// extensión final usada en la ruta de Storage SIEMPRE sale de la firma
// validada, nunca ciegamente de lo que escribió la persona en el nombre.
// Genérica para cualquier tipo de documento , no depende de cotización ni
// de pedido.
async function validarArchivo(file) {
  if (!file) return { ok: false, error: "Selecciona un archivo." };
  if (!(file.size > 0)) return { ok: false, error: "El archivo está vacío." };
  if (file.size > TAMANO_MAX) return { ok: false, error: "El archivo supera el límite de 5 MB." };

  var extension = MIME_A_EXTENSION[file.type];
  if (!extension) return { ok: false, error: "Solo puedes adjuntar archivos PDF, JPG o PNG." };

  // Extensión visible del nombre , no basta con MIME + firma, también debe
  // coincidir razonablemente con lo que la persona ve en el nombre.
  if (!extensionVisibleValida(file.name, file.type)) {
    return { ok: false, error: "El contenido del archivo no coincide con su formato." };
  }

  var firma;
  try {
    firma = await leerPrimerosBytes(file, 8);
  } catch (e) {
    return { ok: false, error: "No pudimos subir el archivo. Inténtalo nuevamente." };
  }

  var firmaOk = false;
  if (file.type === "application/pdf") {
    // "%PDF-"
    firmaOk = firma[0] === 0x25 && firma[1] === 0x50 && firma[2] === 0x44 && firma[3] === 0x46 && firma[4] === 0x2d;
  } else if (file.type === "image/png") {
    var firmaPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    firmaOk = firmaPng.every(function (b, i) { return firma[i] === b; });
  } else if (file.type === "image/jpeg") {
    firmaOk = firma[0] === 0xff && firma[1] === 0xd8 && firma[2] === 0xff;
  }
  if (!firmaOk) return { ok: false, error: "El contenido del archivo no coincide con su formato." };

  return { ok: true, extension: extension, mimeType: file.type };
}

// Solo letras ASCII, números, guion y guion bajo , cualquier otro carácter
// se reemplaza por guion, tope de 100 caracteres. Si queda vacío, la subida
// se rechaza (nunca se usa una ruta con segmento vacío). Genérica: sirve
// igual para un id de cotización que para un id de pedido.
function normalizarIdParaRuta(id) {
  var texto = String(id == null ? "" : id);
  texto = texto.replace(/[^A-Za-z0-9_-]/g, "-");
  texto = texto.slice(0, 100);
  return texto;
}

// UUID criptográficamente seguro , nunca Date.now()+Math.random() como
// nombre de Storage. Si no existe ninguna API criptográfica disponible en
// el navegador, se devuelve null y la subida se cancela por completo.
function generarUUIDSeguro() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    var bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = Array.prototype.map
      .call(bytes, function (b) { return b.toString(16).padStart(2, "0"); })
      .join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }
  return null;
}

// {auth.uid()}/{cotizaciones|pedidos}/{idDocumentoSeguro}/{uuidSeguro}.{extensionValidada}
// , nunca se usa el nombre original dentro de la ruta. `tipoDocumento` debe
// ser "cotizacion" o "pedido" , cualquier otro valor cancela la subida en
// vez de adivinar una carpeta.
//
// Nota de compatibilidad: las cotizaciones ya tenían archivos guardados
// ANTES de este cambio bajo el formato antiguo
// {userId}/{idCotizacion}/{uuid}.{ext} (sin el segmento "cotizaciones/").
// Esta función solo se usa para construir la ruta de una SUBIDA NUEVA , el
// storagePath de un archivo ya existente se sigue leyendo tal cual está
// guardado en el metadato (nunca se reconstruye), así que los archivos
// viejos siguen abriéndose y descargándose exactamente igual que antes.
function construirRutaStorage(userId, tipoDocumento, documentoId, extension) {
  var carpeta = CARPETA_POR_TIPO_DOCUMENTO[tipoDocumento];
  if (!carpeta) return null;
  var idSeguro = normalizarIdParaRuta(documentoId);
  if (!idSeguro) return null;
  var uuid = generarUUIDSeguro();
  if (!uuid) return null;
  return userId + "/" + carpeta + "/" + idSeguro + "/" + uuid + "." + extension;
}

async function obtenerUserIdReal() {
  var resultado = await supabase.auth.getSession();
  if (resultado.error) return null;
  var session = resultado && resultado.data ? resultado.data.session : null;
  return session && session.user ? session.user.id : null;
}

// Convierte uploadedAt (ISO) a texto legible en horario local , si no es
// una fecha válida, devuelve cadena vacía en vez de romper el modal.
function formatearFechaLocal(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  try {
    return d.toLocaleString();
  } catch (e) {
    return "";
  }
}

// Detección conservadora de "dispositivo móvil/tableta real" , copia local
// mínima (mismo criterio que ya usa CLEO.jsx para PDFs), para no depender
// de un import cruzado entre archivos.
function esProbablementeMovilOTabletLocal() {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  var tienePuntosTactiles = (navigator.maxTouchPoints || 0) > 0;
  var punteroGrueso = false;
  try {
    punteroGrueso = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  } catch (e) {
    punteroGrueso = false;
  }
  return tienePuntosTactiles && punteroGrueso;
}

async function entregarBlob(blob, nombreArchivo, mimeType) {
  var pareceMovilOTablet = esProbablementeMovilOTabletLocal();
  if (pareceMovilOTablet && typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
    try {
      var archivo = new File([blob], nombreArchivo, { type: mimeType });
      if (navigator.canShare({ files: [archivo] })) {
        try {
          await navigator.share({ files: [archivo] });
          return;
        } catch (errShare) {
          if (errShare && errShare.name === "AbortError") return; // canceló, no se descarga nada
        }
      }
    } catch (e) {
      // cae a descarga
    }
  }
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

// ── Operaciones centrales ───────────────────────────────────────────────
// Genéricas para cualquier tipo de documento , reciben tipoDocumento +
// documentoId en vez de asumir "cotización".
async function subirNuevo(tipoDocumento, documentoId, file) {
  var validado = await validarArchivo(file);
  if (!validado.ok) throw new Error(validado.error);

  var userId = await obtenerUserIdReal();
  if (!userId) throw new Error("No pudimos subir el archivo. Inténtalo nuevamente.");

  var storagePath = construirRutaStorage(userId, tipoDocumento, documentoId, validado.extension);
  if (!storagePath) throw new Error("No pudimos subir el archivo. Inténtalo nuevamente.");
  var subida = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: validado.mimeType,
    upsert: false,
  });
  if (subida.error) throw new Error("No pudimos subir el archivo. Inténtalo nuevamente.");

  return {
    version: 1,
    storagePath: storagePath,
    nombreOriginal: normalizarNombre(file.name),
    mimeType: validado.mimeType,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
}

async function descargarBlob(storagePath) {
  var resultado = await supabase.storage.from(BUCKET).download(storagePath);
  if (resultado.error || !resultado.data) throw new Error("No pudimos abrir el archivo. Inténtalo nuevamente.");
  return resultado.data;
}

async function eliminarObjeto(storagePath) {
  var resultado = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (resultado.error) throw new Error("No pudimos eliminar el archivo. Tus datos siguen intactos.");
}

// ── Componente ──────────────────────────────────────────────────────────
// Único componente reutilizado por cotizaciones y pedidos (card de
// Cotizaciones, Trabajos → Ver pagos, y ahora también la tarjeta de
// Pedidos) , mismo dato, mismas acciones, sin duplicar lógica. El
// componente nunca conoce setCotizaciones/setPedidos directamente: solo
// recibe `documento` (el objeto ya cargado) y `onActualizarDocumento`
// (callback que decide, afuera, en qué lista y cómo persistir el cambio).
export function ArchivoAdjunto(props) {
  var tipoDocumento = props.tipoDocumento; // "cotizacion" | "pedido"
  var doc = props.documento;
  var esDemo = !!props.demoActivo;
  var onActualizarDocumento = props.onActualizarDocumento; // (docId, nuevoMetaOrNull) => Promise

  var sAbierto = React.useState(false);
  var abierto = sAbierto[0];
  var setAbierto = sAbierto[1];
  var sProcesando = React.useState(false);
  var procesando = sProcesando[0];
  var setProcesando = sProcesando[1];
  var sError = React.useState("");
  var error = sError[0];
  var setError = sError[1];
  var sOk = React.useState("");
  var ok = sOk[0];
  var setOk = sOk[1];
  var sConfirmarEliminar = React.useState(false);
  var confirmarEliminar = sConfirmarEliminar[0];
  var setConfirmarEliminar = sConfirmarEliminar[1];

  // Bloqueo síncrono real contra doble clic / operaciones paralelas , un
  // useState solo no alcanza porque React puede procesar dos clics antes
  // de repintar.
  var procesandoRef = React.useRef(false);

  var meta = doc && doc.archivoAdjunto ? doc.archivoAdjunto : null;
  var inputRef = React.useRef(null);

  // Único texto de la UI que antes mencionaba "cotización" explícitamente
  // , se vuelve genérico según tipoDocumento, sin tocar ningún otro
  // mensaje (los de error/demo ya eran genéricos y se reutilizan igual).
  var etiquetaDocumento = tipoDocumento === "pedido" ? "este pedido" : "esta cotización";

  function limpiarMensajes() {
    setError("");
    setOk("");
  }

  function abrirModal() {
    limpiarMensajes();
    setConfirmarEliminar(false);
    setAbierto(true);
  }
  function cerrarModal() {
    if (procesandoRef.current) return;
    setAbierto(false);
    limpiarMensajes();
    setConfirmarEliminar(false);
  }

  async function manejarSeleccion(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (esDemo) {
      setError("Los archivos no se suben en modo demo.");
      return;
    }
    if (procesandoRef.current) return;
    procesandoRef.current = true;
    setProcesando(true);
    limpiarMensajes();
    var metaAnterior = meta;
    try {
      var nuevoMeta = await subirNuevo(tipoDocumento, doc.id, file);

      if (!metaAnterior) {
        // ── SUBIDA NUEVA (no había archivo previo) ──────────────────────
        try {
          await onActualizarDocumento(doc.id, nuevoMeta); // espera confirmación real de sync
        } catch (errSync) {
          // La subida sí ocurrió pero la sincronización del metadato
          // falló , se restaura el documento SIN archivoAdjunto y se
          // intenta limpiar el objeto recién subido para no dejar basura.
          try {
            await onActualizarDocumento(doc.id, null);
          } catch (e2) {}
          try {
            await eliminarObjeto(nuevoMeta.storagePath);
          } catch (e3) {
            console.error("CLEO: no se pudo limpiar un archivo huérfano tras fallo de sincronización.");
          }
          throw errSync;
        }
        setOk("Archivo adjuntado correctamente.");
      } else {
        // ── REEMPLAZO (ya había un archivo) ─────────────────────────────
        try {
          await onActualizarDocumento(doc.id, nuevoMeta); // espera confirmación real de sync
        } catch (errSync) {
          // La sincronización falló , se restaura el metadato ANTERIOR
          // localmente, nunca se borra el archivo anterior. El archivo
          // nuevo se limpia como mejor esfuerzo, sin alterar el mensaje.
          try {
            await onActualizarDocumento(doc.id, metaAnterior);
          } catch (e2) {}
          try {
            await eliminarObjeto(nuevoMeta.storagePath);
          } catch (e3) {
            console.error("CLEO: no se pudo limpiar el archivo nuevo tras un reemplazo fallido.");
          }
          throw new Error("No pudimos completar el reemplazo. Tu archivo anterior sigue intacto.");
        }
        // Solo AHORA que la sincronización confirmó éxito real se elimina
        // el archivo anterior , nunca antes de ese punto.
        try {
          await eliminarObjeto(metaAnterior.storagePath);
        } catch (e4) {
          // El nuevo archivo ya quedó bien establecido , un huérfano del
          // anterior no es motivo para reportar error a la persona.
        }
        setOk("Archivo adjuntado correctamente.");
      }
    } catch (e) {
      setError((e && e.message) || "No pudimos subir el archivo. Inténtalo nuevamente.");
    } finally {
      procesandoRef.current = false;
      setProcesando(false);
    }
  }

  async function manejarAbrirODescargar() {
    if (!meta || procesandoRef.current) return;
    procesandoRef.current = true;
    setProcesando(true);
    limpiarMensajes();
    try {
      var blob = await descargarBlob(meta.storagePath);
      await entregarBlob(blob, meta.nombreOriginal || "archivo", meta.mimeType);
    } catch (e) {
      setError((e && e.message) || "No pudimos abrir el archivo. Inténtalo nuevamente.");
    } finally {
      procesandoRef.current = false;
      setProcesando(false);
    }
  }

  async function manejarEliminar() {
    if (!meta || procesandoRef.current) return;
    if (esDemo) {
      setError("Los archivos no se suben en modo demo.");
      return;
    }
    procesandoRef.current = true;
    setProcesando(true);
    limpiarMensajes();
    var metaOriginal = meta;
    try {
      // 1) Se quita archivoAdjunto del documento PRIMERO , esta llamada ya
      // escribe en localStorage de inmediato y espera la confirmación real
      // de sincronización antes de devolver.
      try {
        await onActualizarDocumento(doc.id, null);
      } catch (errSync) {
        // 2) La sincronización falló , el objeto en Storage sigue
        // existiendo intacto y NO se toca. Se restaura metaOriginal
        // localmente como mejor esfuerzo (si esto también falla por red,
        // el valor local ya quedó escrito de inmediato por
        // onActualizarDocumento, así que el sincronizador podrá
        // reintentarlo después , no se pierde nada, solo queda pendiente).
        try {
          await onActualizarDocumento(doc.id, metaOriginal);
        } catch (errRestaurar) {
          console.error("CLEO: fallo al restaurar el metadato tras un intento de eliminación.");
        }
        throw new Error("No pudimos eliminar el archivo. Tus datos siguen intactos.");
      }

      // 3) Solo ahora que el metadato quedó confirmado como sincronizado,
      // se elimina el objeto real en Storage.
      try {
        await eliminarObjeto(metaOriginal.storagePath);
      } catch (errStorage) {
        // 4) El archivo todavía existe en Storage , se restaura el
        // metadato (y se espera también su sincronización) para que el
        // documento vuelva a apuntar al archivo real que sigue ahí.
        try {
          await onActualizarDocumento(doc.id, metaOriginal);
        } catch (errRestaurar2) {
          console.error("CLEO: fallo al restaurar el metadato tras un error de Storage al eliminar.");
        }
        throw new Error("No pudimos eliminar el archivo. Tus datos siguen intactos.");
      }

      setOk("Archivo eliminado correctamente.");
      setConfirmarEliminar(false);
    } catch (e) {
      setError((e && e.message) || "No pudimos eliminar el archivo. Tus datos siguen intactos.");
    } finally {
      procesandoRef.current = false;
      setProcesando(false);
    }
  }

  function nombreCorto(nombre) {
    var n = normalizarNombre(nombre);
    return n.length > 22 ? n.slice(0, 19) + "…" : n;
  }

  // Modo compacto (props.compacto) , mismo botón/acción/modal, solo cambia
  // la presentación a ícono-únicamente (sin nombre de archivo como texto),
  // pensado para filas de acciones angostas (ej. tarjeta de Pedidos en
  // móvil) donde el texto largo forzaba salto de línea o cuadrícula. El
  // nombre del archivo sigue disponible vía title (tooltip) y dentro del
  // modal, nunca se pierde información , solo deja de ocupar espacio en
  // la fila.
  var esCompacto = !!props.compacto;

  var btnStyle = esCompacto
    ? {
        cursor: "pointer",
        width: 32,
        height: 32,
        padding: 0,
        borderRadius: 8,
        border: "1px solid " + (props.borderColor || "#E5E7EB"),
        background: "transparent",
        fontSize: 13,
        color: props.textColor || "#374151",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        flexShrink: 0,
      }
    : {
        cursor: "pointer",
        padding: "4px 10px",
        borderRadius: 8,
        border: "1px solid " + (props.borderColor || "#E5E7EB"),
        background: "transparent",
        fontSize: 11,
        color: props.textColor || "#374151",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      };

  var tituloBoton = meta
    ? "Ver archivo adjunto: " + normalizarNombre(meta.nombreOriginal)
    : "Adjuntar archivo";

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "button",
      {
        style: btnStyle,
        title: tituloBoton,
        onClick: abrirModal,
      },
      esCompacto
        ? [
            "📎",
            // Puntito indicador cuando ya hay un archivo , mismo lenguaje
            // visual que el badge de "Pagos" compacto en Pedidos.
            meta &&
              React.createElement("span", {
                key: "dot",
                style: {
                  position: "absolute",
                  top: 3,
                  right: 3,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#10B981",
                  border: "1px solid #fff",
                },
              }),
          ]
        : [
            "📎 ",
            meta ? nombreCorto(meta.nombreOriginal) || "1 archivo" : "Adjuntar archivo",
          ]
    ),
    abierto &&
      React.createElement(
        "div",
        {
          style: {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          },
          onClick: cerrarModal,
        },
        React.createElement(
          "div",
          {
            style: {
              background: "#fff",
              borderRadius: 16,
              padding: 20,
              maxWidth: 360,
              width: "100%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            },
            onClick: function (ev) {
              ev.stopPropagation();
            },
          },
          React.createElement(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } },
            React.createElement("div", { style: { fontWeight: 700, fontSize: 15, color: "#111827" } }, "Archivo adjunto"),
            React.createElement(
              "button",
              {
                style: { background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#6B7280" },
                onClick: cerrarModal,
                disabled: procesando,
              },
              "×"
            )
          ),

          esDemo &&
            React.createElement(
              "div",
              { style: { fontSize: 12, color: "#92400E", background: "#FEF3C7", padding: "8px 10px", borderRadius: 8, marginBottom: 10 } },
              "Los archivos no se suben en modo demo."
            ),

          meta
            ? React.createElement(
                "div",
                { style: { marginBottom: 12 } },
                React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 2, wordBreak: "break-word" } }, normalizarNombre(meta.nombreOriginal)),
                React.createElement(
                  "div",
                  { style: { fontSize: 11, color: "#6B7280" } },
                  (meta.size ? (meta.size / 1024).toFixed(0) + " KB" : "") + (meta.mimeType ? " · " + meta.mimeType.split("/")[1].toUpperCase() : "")
                ),
                formatearFechaLocal(meta.uploadedAt) &&
                  React.createElement("div", { style: { fontSize: 11, color: "#9CA3AF", marginTop: 2 } }, "Subido: " + formatearFechaLocal(meta.uploadedAt))
              )
            : React.createElement("div", { style: { fontSize: 13, color: "#6B7280", marginBottom: 12 } }, "Todavía no has adjuntado ningún archivo a " + etiquetaDocumento + "."),

          error && React.createElement("div", { style: { fontSize: 12, color: "#B91C1C", background: "#FEF2F2", padding: "8px 10px", borderRadius: 8, marginBottom: 10 } }, error),
          ok && React.createElement("div", { style: { fontSize: 12, color: "#166534", background: "#F0FDF4", padding: "8px 10px", borderRadius: 8, marginBottom: 10 } }, ok),

          React.createElement("input", {
            ref: inputRef,
            type: "file",
            accept: "application/pdf,image/jpeg,image/png",
            style: { display: "none" },
            onChange: manejarSeleccion,
          }),

          React.createElement(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: 8 } },
            meta &&
              React.createElement(
                "button",
                {
                  disabled: procesando,
                  onClick: manejarAbrirODescargar,
                  style: { cursor: procesando ? "default" : "pointer", padding: "9px 12px", borderRadius: 10, border: "1px solid #4F46E5", background: "#4F46E5", color: "#fff", fontSize: 13, fontWeight: 600, opacity: procesando ? 0.6 : 1 },
                },
                procesando ? "Abriendo…" : "Abrir / descargar"
              ),
            React.createElement(
              "button",
              {
                disabled: procesando || esDemo,
                onClick: function () {
                  if (inputRef.current) inputRef.current.click();
                },
                style: { cursor: procesando || esDemo ? "default" : "pointer", padding: "9px 12px", borderRadius: 10, border: "1px solid #D1D5DB", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 500, opacity: procesando || esDemo ? 0.6 : 1 },
              },
              procesando ? "Subiendo…" : meta ? "Reemplazar archivo" : "Subir archivo"
            ),
            meta &&
              (confirmarEliminar
                ? React.createElement(
                    "div",
                    { style: { display: "flex", gap: 8 } },
                    React.createElement(
                      "button",
                      {
                        disabled: procesando || esDemo,
                        onClick: manejarEliminar,
                        style: { flex: 1, cursor: "pointer", padding: "9px 12px", borderRadius: 10, border: "1px solid #DC2626", background: "#DC2626", color: "#fff", fontSize: 13, fontWeight: 600, opacity: procesando || esDemo ? 0.6 : 1 },
                      },
                      "Confirmar eliminar"
                    ),
                    React.createElement(
                      "button",
                      {
                        disabled: procesando,
                        onClick: function () {
                          setConfirmarEliminar(false);
                        },
                        style: { cursor: "pointer", padding: "9px 12px", borderRadius: 10, border: "1px solid #D1D5DB", background: "#fff", color: "#374151", fontSize: 13 },
                      },
                      "Cancelar"
                    )
                  )
                : React.createElement(
                    "button",
                    {
                      disabled: procesando || esDemo,
                      onClick: function () {
                        setConfirmarEliminar(true);
                      },
                      style: { cursor: procesando || esDemo ? "default" : "pointer", padding: "9px 12px", borderRadius: 10, border: "1px solid #FCA5A5", background: "#fff", color: "#DC2626", fontSize: 13, fontWeight: 500, opacity: procesando || esDemo ? 0.6 : 1 },
                    },
                    "Eliminar archivo"
                  ))
          )
        )
      )
  );
}

// ── Compatibilidad hacia atrás ──────────────────────────────────────────
// Mismo componente, mismo mecanismo, sin lógica duplicada , es solo un
// adaptador de props para no romper ningún import existente que todavía
// use el nombre/forma anterior (cot/esDemo/onActualizarCotizacion). CLEO.jsx
// ya fue actualizado para usar ArchivoAdjunto directamente con las props
// nuevas; este export queda como red de seguridad, no como sistema
// paralelo.
export function CotizacionAdjunto(props) {
  return React.createElement(
    ArchivoAdjunto,
    Object.assign({}, props, {
      tipoDocumento: "cotizacion",
      documento: props.cot,
      onActualizarDocumento: props.onActualizarCotizacion,
      demoActivo: props.esDemo,
    })
  );
}
