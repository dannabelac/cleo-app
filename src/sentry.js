import * as Sentry from "@sentry/react";

// ── Limpieza de texto ──────────────────────────────────────────────────
// Se aplica a event.message y a cada event.exception.values[].value , el
// stack técnico (nombres de archivo, líneas) NUNCA se toca aquí.
var PATRON_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
var PATRON_BEARER = /Bearer\s+[A-Za-z0-9\-_.]+/gi;
var PATRON_JWT = /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
var PATRON_TELEFONO = /(\+?\d[\d\s.-]{6,}\d)/g;
// "password: xxxx", "contraseña= xxxx", "token xxxx", etc. , la palabra
// clave se conserva, solo se oculta lo que viene después.
var PATRON_PALABRA_CLAVE = /\b(password|contrase\u00f1a|contrasena|token|email|correo|telefono|tel\u00e9fono|clabe|cuenta)\b(\s*[:=]?\s*)([^\s,;]+)/gi;

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

// Nunca lanza , si algo interno falla, se degrada a un evento mínimo o a
// null en vez de romper el envío o la aplicación.
function beforeSend(event) {
  try {
    if (!event) return null;

    // Se eliminan por completo los bloques que podrían traer datos
    // personales o de negocio , nunca se intenta "limpiarlos", se quitan.
    delete event.user;
    delete event.request;
    delete event.extra;
    delete event.breadcrumbs;
    delete event.attachments;

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

// Solo Error Monitoring , sin Session Replay, Tracing, Logs, Metrics ni
// Profiling. Se inicializa únicamente en producción y solo si existe DSN.
export function inicializarSentry() {
  var dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!import.meta.env.PROD) return;
  if (!dsn) return;

  Sentry.init({
    dsn: dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
    beforeSend: beforeSend,
  });
}
