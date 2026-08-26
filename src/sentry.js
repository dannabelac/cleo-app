import * as Sentry from "@sentry/react";

// ─── DIAGNÓSTICO TÉCNICO MÍNIMO (beta) ─────────────────────────────────────
// Punto único de integración con Sentry para toda la app , cloudSync.js y
// la protección de almacenamiento (dentro de CLEO.jsx) importan SOLO estas
// funciones, nunca el SDK de Sentry directamente.
//
// Este archivo combina dos capas de protección de privacidad:
// (1) allowlist de métricas , soloMetricas() decide qué campos NUMÉRICOS
//     pueden viajar (conteos, bytes, milisegundos) más el nombre técnico de
//     una clave de storage , todo lo demás se descarta en silencio.
// (2) limpieza de texto , limpiarTexto() tacha emails, teléfonos, tokens,
//     JWTs y valores tras palabras clave sensibles dentro de mensajes de
//     error y stacks, por si un error real trae texto libre inesperado.
//
// REGLA DE ORO: aquí NUNCA entra contenido comercial. Nombres, correos,
// teléfonos, conceptos, montos, notas, archivos adjuntos e IDs de cliente
// JAMÁS se procesan aquí, ni siquiera de paso.
//
// Si no hay DSN configurado, o no estamos en producción, Sentry.init nunca
// se llama , todas las funciones de abajo quedan como no-ops seguros, CLEO
// sigue funcionando exactamente igual, sin diagnóstico.

// ── Limpieza de texto ──────────────────────────────────────────────────
// Se aplica a event.message y a cada event.exception.values[].value , el
// stack técnico (nombres de archivo, líneas) NUNCA se toca aquí.
var PATRON_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
var PATRON_BEARER = /Bearer\s+[A-Za-z0-9\-_.]+/gi;
var PATRON_JWT = /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
var PATRON_TELEFONO = /(\+?\d[\d\s.-]{6,}\d)/g;
// "password: xxxx", "contraseña= xxxx", "token xxxx", etc. , la palabra
// clave se conserva, solo se oculta lo que viene después.
var PATRON_PALABRA_CLAVE = /\b(password|contraseña|contrasena|token|email|correo|telefono|teléfono|clabe|cuenta)\b(\s*[:=]?\s*)([^\s,;]+)/gi;

function limpiarTexto(texto) {
  if (typeof texto !== "string" || !texto) return texto;
  var limpio = texto;
  limpio = limpio.replace(PATRON_PALABRA_CLAVE, function (match, palabra, separador) {
    return palabra + separador + "[DATO OCULTO]";
  });
  limpio = limpio.replace(PATRON_BEARER, "[DATO OCULTO]");
  limpio = limpio.replace(PATRON_JWT, "[DATO OCULTO]");
  limpio = limpio.replace(PATRON_EMAIL, "[DATO OCULTO]");
  limpio = limpio.replace(PATRON_TELEFONO, "[DATO OCULTO]");
  return limpio;
}

// ── Allowlist de métricas ────────────────────────────────────────────────
// Solo deja pasar campos numéricos conocidos (conteos, bytes, duración) y,
// como única excepción de texto, storageKey , el NOMBRE técnico fijo de una
// clave de localStorage (p. ej. "cleo_clientes"), nunca su contenido.
// Cualquier otro campo se descarta en silencio , este es el filtro real de
// privacidad, no una convención que los llamadores deban recordar respetar.
var CAMPOS_METRICA_PERMITIDOS = [
  "durationMs",
  "snapshotBytes",
  "clientesCount",
  "pedidosCount",
  "cotizacionesCount",
];
function soloMetricas(metricas) {
  var limpio = {};
  if (!metricas || typeof metricas !== "object") return limpio;
  CAMPOS_METRICA_PERMITIDOS.forEach(function (campo) {
    var v = metricas[campo];
    if (typeof v === "number" && Number.isFinite(v)) limpio[campo] = v;
  });
  if (typeof metricas.storageKey === "string" && metricas.storageKey.length > 0 && metricas.storageKey.length < 40) {
    limpio.storageKey = metricas.storageKey;
  }
  return limpio;
}

// ── Deduplicación ────────────────────────────────────────────────────────
// La misma combinación tipo+origen+código no se vuelve a reportar dentro de
// esta ventana, para no inundar Sentry con el mismo problema repitiéndose
// (p. ej. sin conexión un buen rato, reintentando cada 5s). El código (o
// nombre del error) es parte de la clave a propósito , sin él, dos errores
// DISTINTOS que comparten origen (p. ej. "cuota" y "serializacion" en el
// mismo storageKey, o "write_error" y "excepcion" en el mismo origen de
// sync) se suprimirían entre sí, en vez de deduplicar solo repeticiones del
// mismo problema.
var VENTANA_DEDUP_MS = 60000;
var ultimosReportes = {}; // clave "tipo:origen:codigo" -> timestamp del último envío
function debeReportar(tipo, origen, codigo) {
  var clave = String(tipo) + ":" + String(origen) + ":" + String(codigo || "");
  var t = Date.now();
  var visto = ultimosReportes[clave];
  if (visto && t - visto < VENTANA_DEDUP_MS) return false;
  ultimosReportes[clave] = t;
  return true;
}

// ── Filtro de breadcrumbs (al crearse) ───────────────────────────────────
// SOLO deja pasar los que este módulo agrega explícitamente (categorías
// "cloud-sync" y "storage"), y aun así vuelve a pasar su `data` por
// soloMetricas como segunda capa , cinturón y tirantes.
function filtrarBreadcrumb(breadcrumb) {
  if (!breadcrumb || (breadcrumb.category !== "cloud-sync" && breadcrumb.category !== "storage")) return null;
  breadcrumb.data = soloMetricas(breadcrumb.data);
  return breadcrumb;
}

// Nunca lanza , si algo interno falla, se degrada a un evento mínimo o a
// null en vez de romper el envío o la aplicación.
function beforeSend(event) {
  try {
    if (!event) return null;

    // Se eliminan por completo los bloques que podrían traer datos
    // personales o de negocio , nunca se intenta "limpiarlos", se quitan.
    // Nunca se adjunta el snapshot ni el objeto completo de Supabase , por
    // eso attachments se descarta igual que antes.
    delete event.user;
    delete event.request;
    delete event.attachments;

    // event.extra , antes se borraba entero. Ahora se filtra con la misma
    // allowlist que los breadcrumbs, porque las métricas que SÍ queremos
    // que viajen (durationMs, snapshotBytes, conteos, storageKey) llegan
    // aquí , borrarlo entero las habría eliminado también.
    if (event.extra) event.extra = soloMetricas(event.extra);

    // event.breadcrumbs , antes se borraba entero. Ahora se filtra en vez
    // de eliminarse, para que los breadcrumbs sync_ok/storage_near_limit
    // (ya reducidos a métricas por filtrarBreadcrumb al crearse) sí lleguen
    // como contexto de un error, mientras cualquier otro breadcrumb
    // (aunque no debería existir , ver beforeBreadcrumb) se descarta.
    if (event.breadcrumbs && Array.isArray(event.breadcrumbs.values)) {
      event.breadcrumbs.values = event.breadcrumbs.values
        .filter(function (b) { return b && (b.category === "cloud-sync" || b.category === "storage"); })
        .map(function (b) { b.data = soloMetricas(b.data); return b; });
    } else if (Array.isArray(event.breadcrumbs)) {
      event.breadcrumbs = event.breadcrumbs
        .filter(function (b) { return b && (b.category === "cloud-sync" || b.category === "storage"); })
        .map(function (b) { b.data = soloMetricas(b.data); return b; });
    }

    if (typeof event.message === "string") {
      event.message = limpiarTexto(event.message);
    }

    if (event.exception && Array.isArray(event.exception.values)) {
      event.exception.values.forEach(function (valor) {
        if (valor && typeof valor.value === "string") {
          valor.value = limpiarTexto(valor.value);
        }
        // El stack técnico (nombres de archivo, líneas, columnas) se deja
        // intacto , nunca se toca valor.stacktrace aquí.
      });
    }

    return event;
  } catch (e) {
    // Degradación segura: nunca se lanza una excepción desde beforeSend.
    try {
      return { message: "[evento no procesable]" };
    } catch (e2) {
      return null;
    }
  }
}

var activo = false; // true solo si Sentry.init llegó a ejecutarse (prod + DSN)

// Solo Error Monitoring , sin Session Replay, Tracing, Logs, Metrics ni
// Profiling. Se inicializa únicamente en producción y solo si existe DSN , si
// falta cualquiera de las dos condiciones, todo lo demás en este archivo
// queda como no-op y CLEO funciona igual.
export function inicializarSentry() {
  if (activo) return;
  var dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!import.meta.env.PROD) return;
  if (!dsn) return;

  Sentry.init({
    dsn: dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    // Ring buffer pequeño , antes en 0 impedía que existiera cualquier
    // breadcrumb, incluidos los de sync_ok que sí queremos mandar como
    // contexto de un error posterior.
    maxBreadcrumbs: 20,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
    beforeBreadcrumb: filtrarBreadcrumb,
    beforeSend: beforeSend,
  });
  activo = true;
}
// Alias , cloudSync.js y la protección de localStorage llaman a esta
// función bajo este nombre; se mantiene inicializarSentry() también por si
// algún otro punto de la app ya la invoca directamente.
export var inicializarDiagnostico = inicializarSentry;

// ── Breadcrumb de sincronización exitosa ────────────────────────────────
// NUNCA un evento independiente , solo queda como contexto reciente (ring
// buffer de 20) por si un error posterior necesita explicarse.
export function registrarSyncExitoso(metricas) {
  if (!activo) return;
  try {
    Sentry.addBreadcrumb({
      category: "cloud-sync",
      message: "sync_ok",
      level: "info",
      data: soloMetricas(metricas),
    });
  } catch (e) {}
}

// ── Breadcrumb de aviso de almacenamiento (cerca del límite) ───────────
// Tampoco es un evento propio , mismo criterio que sync_ok.
export function registrarAvisoAlmacenamiento(metricas) {
  if (!activo) return;
  try {
    Sentry.addBreadcrumb({
      category: "storage",
      message: "storage_near_limit",
      level: "warning",
      data: soloMetricas(metricas),
    });
  } catch (e) {}
}

// ── Error real de sincronización ────────────────────────────────────────
// captureException , deduplicado por origen dentro de VENTANA_DEDUP_MS.
// `mensaje` debe ser un texto técnico corto (p. ej. "pull_error"), NUNCA el
// objeto de error real de Supabase (que puede traer .details/.hint con
// fragmentos de la fila) , el llamador nunca debe pasar ese objeto aquí, y
// aunque lo hiciera, esta función solo acepta un string para construir un
// Error nuevo y limpio (que además pasa por limpiarTexto en beforeSend).
export function reportarErrorSync(origen, mensaje, metricas) {
  if (!activo) return;
  if (!debeReportar("sync_error", origen, mensaje)) return;
  try {
    var err = new Error(String(mensaje || "cloud-sync: error"));
    Sentry.captureException(err, {
      tags: { modulo: "cloud-sync", origen: String(origen || "desconocido") },
      extra: soloMetricas(metricas),
    });
  } catch (e) {}
}

// ── Conflicto de versión (controlado, no es un bug) ─────────────────────
// captureMessage nivel warning , deduplicado igual que los errores. `codigo`
// es opcional (p. ej. "23505" vs "0_filas") , distingue tipos de conflicto
// que comparten el mismo origen, para que uno no suprima al otro.
export function reportarConflictoVersion(origen, metricas, codigo) {
  if (!activo) return;
  if (!debeReportar("conflicto_version", origen, codigo || "conflicto")) return;
  try {
    Sentry.captureMessage("cloud-sync: conflicto de versión detectado", {
      level: "warning",
      tags: { modulo: "cloud-sync", origen: String(origen || "desconocido") },
      extra: soloMetricas(metricas),
    });
  } catch (e) {}
}

// ── Error real de almacenamiento local (QuotaExceededError u otro) ──────
// captureException , deduplicado por la clave de storage afectada
// (storageKey es el nombre técnico de la clave, p. ej. "cleo_clientes",
// nunca contenido).
export function reportarErrorAlmacenamiento(storageKey, mensaje, metricas) {
  if (!activo) return;
  if (!debeReportar("storage_error", storageKey || "desconocido", mensaje)) return;
  try {
    var err = new Error(String(mensaje || "localStorage: error"));
    Sentry.captureException(err, {
      tags: { modulo: "storage", origen: String(storageKey || "desconocido") },
      extra: soloMetricas(Object.assign({}, metricas, { storageKey: storageKey })),
    });
  } catch (e) {}
}