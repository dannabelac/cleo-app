import posthog from "posthog-js";

// Único punto de integración con PostHog en toda CLEO , ningún otro
// archivo debe importar "posthog-js" directamente. Minimal para la beta:
// sin autocapture, sin pageviews automáticos, sin session recording.
// Si faltan las variables de entorno, o estamos en modo demo, todas las
// funciones de aquí abajo fallan en silencio , CLEO nunca debe romperse
// ni bloquearse por PostHog.

var POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
var POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST;

// Seguridad: posthog-js adjunta AUTOMÁTICAMENTE propiedades como
// $current_url y $referrer a CUALQUIER evento capturado, sin importar
// autocapture/capture_pageview/disable_session_recording (esas opciones
// solo controlan la captura automática de clics/vistas, nunca el
// enriquecimiento de propiedades por evento) , por eso la lista blanca
// PROPIEDADES_PERMITIDAS de más abajo, que solo filtra lo que CLEO manda
// explícito, no basta por sí sola. before_send (ver beforeSendPostHog más
// abajo) es el único punto que también revisa esas propiedades
// automáticas antes de que salgan del navegador.
var NOMBRES_PROPIEDAD_SENSIBLES = [
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "code",
  "expires_at",
  "expires_in",
  "token_type",
];
// Cada patrón exige un límite real de parámetro de URL (inicio de cadena,
// o precedido de ?/&/# o su forma codificada %3f/%26/%23, seguido de = o
// %3d) , así nunca hay falso positivo con algo como "country_code=mx".
var PATRONES_VALOR_SENSIBLE = NOMBRES_PROPIEDAD_SENSIBLES.map(function (nombre) {
  var previos = "(?:^|[?&#]|%3f|%26|%23)";
  var igual = "(?:=|%3d)";
  return new RegExp(previos + nombre + igual, "i");
});

// Revisa un valor (string u objeto) tanto tal cual como decodificado con
// decodeURIComponent , cubre tanto una URL sin codificar como una que
// venga codificada dentro de otra (por ejemplo un referrer con la URL de
// retorno como parámetro).
function valorTieneDatoAutenticacion(valor) {
  if (valor === null || valor === undefined) return false;
  var texto;
  if (typeof valor === "string") {
    texto = valor;
  } else {
    try {
      texto = JSON.stringify(valor);
    } catch (e) {
      texto = String(valor);
    }
  }
  var candidatos = [texto];
  try {
    var decodificado = decodeURIComponent(texto);
    if (decodificado !== texto) candidatos.push(decodificado);
  } catch (e) {}
  return candidatos.some(function (c) {
    return PATRONES_VALOR_SENSIBLE.some(function (re) {
      return re.test(c);
    });
  });
}

// Recorre el objeto (recursivo, cubre propiedades anidadas) y ELIMINA por
// completo cualquier propiedad cuyo nombre sea una de las sensibles, o
// cuyo valor contenga un dato de autenticación , nunca se manda una
// versión parcial/truncada del token, la propiedad completa desaparece.
function limpiarPropiedadesAutenticacion(obj) {
  if (!obj || typeof obj !== "object") return obj;
  Object.keys(obj).forEach(function (k) {
    if (NOMBRES_PROPIEDAD_SENSIBLES.indexOf(k.toLowerCase()) !== -1) {
      delete obj[k];
      return;
    }
    var v = obj[k];
    if (v && typeof v === "object") {
      limpiarPropiedadesAutenticacion(v);
      return;
    }
    if (valorTieneDatoAutenticacion(v)) delete obj[k];
  });
  return obj;
}

// Único before_send de PostHog , se aplica a TODO lo que se vaya a enviar,
// incluidas las propiedades automáticas ($current_url, $referrer, etc.)
// que nunca pasan por limpiarPropiedades/PROPIEDADES_PERMITIDAS más abajo.
// Nunca deja pasar nada si algo falla inesperadamente (devuelve null ,
// cancela el envío de ese evento , en vez de arriesgarse a mandarlo tal
// cual).
function beforeSendPostHog(capturaOArreglo) {
  try {
    function limpiarUna(captura) {
      if (!captura) return captura;
      if (captura.properties) limpiarPropiedadesAutenticacion(captura.properties);
      if (captura.$set) limpiarPropiedadesAutenticacion(captura.$set);
      if (captura.$set_once) limpiarPropiedadesAutenticacion(captura.$set_once);
      return captura;
    }
    if (Array.isArray(capturaOArreglo)) return capturaOArreglo.map(limpiarUna);
    return limpiarUna(capturaOArreglo);
  } catch (e) {
    return null;
  }
}

var inicializado = false;
// Bandera interna de modo demo , la marca el único punto central que
// conoce ese estado (ver marcarModoDemo más abajo), nunca se adivina aquí.
// Mientras esté en true, identificarUsuario/registrarEvento son no-op ,
// nunca se manda nada de una sesión demo a PostHog.
var modoDemoActivo = false;

// Único punto de arranque. Se puede llamar más de una vez sin riesgo
// (por ejemplo si main.jsx y algún flujo de reinicio la invocan los dos) ,
// la segunda llamada es un no-op.
export function inicializarAnalytics() {
  if (inicializado) return;
  if (!POSTHOG_KEY || !POSTHOG_HOST) return; // faltan variables , no-op silencioso
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      person_profiles: "identified_only",
      before_send: beforeSendPostHog,
    });
    inicializado = true;
  } catch (e) {
    // Nunca debe impedir que CLEO arranque , PostHog bloqueado/fallando
    // (ad-blocker, red, etc.) es indistinguible de "no configurado".
  }
}

// Único setter del estado de modo demo , se llama desde CLEO.jsx (efecto
// central sobre props.demoActivo) y desde AuthGate.jsx donde se conoce ese
// estado. Nunca se infiere aquí dentro a partir de otra cosa.
export function marcarModoDemo(activo) {
  modoDemoActivo = !!activo;
}

// Identifica al usuario real usando EXCLUSIVAMENTE el UUID de Supabase ,
// nunca correo, nombre ni ningún otro dato. No-op si no hay id, si estamos
// en demo, o si PostHog no llegó a inicializarse.
export function identificarUsuario(userId) {
  if (!inicializado || modoDemoActivo || !userId) return;
  try {
    posthog.identify(String(userId));
  } catch (e) {}
}

// tipoPerfilActivo: ÚNICA fuente de verdad, en memoria, del perfil activo
// de ESTA sesión del navegador , la escribe exclusivamente
// actualizarTipoPerfil de aquí abajo. registrarEvento (ver más abajo) la
// lee y la adjunta AUTOMÁTICAMENTE como propiedad `tipo_perfil` a
// CUALQUIER evento que no la traiga ya explícita , así "sesion_iniciada"
// (que se dispara en AuthGate.jsx, antes de que CLEO.jsx termine de cargar
// el perfil) y cualquier evento comercial futuro quedan cubiertos desde un
// solo punto central, sin tener que agregar el valor a mano en cada
// llamada. También sirve como bandera de "ya se envió este valor" , evita
// reescribir la propiedad de persona en cada render de CLEO.jsx.
var tipoPerfilActivo = null;
var TIPOS_PERFIL_VALIDOS = ["productos", "servicios"];
// Único punto que (a) guarda el perfil activo en memoria para que
// registrarEvento lo adjunte solo, y (b) lo escribe como propiedad
// PERSISTENTE de la PERSONA ya identificada en PostHog , acepta
// ÚNICAMENTE "productos" o "servicios", cualquier otro valor (incluido ""
// o undefined mientras el perfil real todavía no carga) se ignora en
// silencio, sin tocar nada. No-op en demo o si PostHog no está listo,
// igual que el resto de este archivo. Se puede llamar tan pronto como se
// conozca el perfil (incluso ANTES de identificarUsuario, ver AuthGate.jsx
// , el perfil llega cacheado en localStorage por pullUserData antes de
// identificar), y también más tarde desde CLEO.jsx cuando el perfil
// termina de cargar del todo , en ambos casos, si el valor no cambió
// desde la última vez, es un no-op real (nunca vuelve a llamar a
// identify() ni a people.set() de más).
export function actualizarTipoPerfil(tipoPerfil) {
  if (!inicializado || modoDemoActivo) return;
  if (TIPOS_PERFIL_VALIDOS.indexOf(tipoPerfil) === -1) return;
  if (tipoPerfilActivo === tipoPerfil) return;
  try {
    posthog.people.set({ tipo_perfil: tipoPerfil });
    tipoPerfilActivo = tipoPerfil;
  } catch (e) {}
}

// Limpia la identidad , se llama al cerrar sesión o al detectar que ya no
// hay sesión (ver AuthGate.jsx), así la siguiente cuenta que inicie sesión
// en este navegador nunca hereda la identidad de la anterior.
// Guarda qué userId ya disparó "sesion_iniciada" en esta pestaña/sesión
// real del navegador , único punto central que evita el duplicado, sin
// parches en cada pantalla. Cubre 2 causas a la vez: React StrictMode
// montando efectos 2 veces en desarrollo, y Supabase disparando
// manejarSesionReal más de una vez para la misma sesión (getSession +
// INITIAL_SESSION). sessionStorage sobrevive a StrictMode/re-renders;
// la variable en memoria es respaldo si sessionStorage no está disponible
// (privado/bloqueado) , en ese caso protege al menos dentro de la misma
// carga de página.
var SESION_INICIADA_KEY = "cleo_ph_sesion_iniciada_uid";
var sesionIniciadaUidMemoria = null;

function leerSesionIniciadaUid() {
  if (sesionIniciadaUidMemoria) return sesionIniciadaUidMemoria;
  try {
    return sessionStorage.getItem(SESION_INICIADA_KEY);
  } catch (e) {
    return null;
  }
}

// Devuelve true SOLO la primera vez que se llama para este userId (y lo
// marca) , cualquier llamada posterior para el mismo userId devuelve
// false, hasta que resetearIdentidad() limpie la marca (logout o cambio
// de cuenta). Quien llama debe usar el resultado para decidir si registra
// el evento; esta función nunca llama a registrarEvento por su cuenta.
export function marcarSesionIniciadaUnica(userId) {
  if (!userId) return false;
  var uid = String(userId);
  if (leerSesionIniciadaUid() === uid) return false;
  sesionIniciadaUidMemoria = uid;
  try {
    sessionStorage.setItem(SESION_INICIADA_KEY, uid);
  } catch (e) {}
  return true;
}

export function resetearIdentidad() {
  // La marca de sesion_iniciada se limpia siempre, incluso si PostHog
  // nunca llegó a inicializarse , así una cuenta que inicia sesión más
  // tarde en la misma pestaña nunca hereda la marca de la anterior.
  sesionIniciadaUidMemoria = null;
  // Mismo criterio para tipo_perfil , así la próxima cuenta que inicie
  // sesión en esta pestaña SIEMPRE reenvía su propio tipo_perfil (y
  // registrarEvento deja de adjuntarlo mientras no se conozca el de la
  // cuenta nueva), aunque coincida por coincidencia con el de la cuenta
  // anterior.
  tipoPerfilActivo = null;
  try {
    sessionStorage.removeItem(SESION_INICIADA_KEY);
  } catch (e) {}
  if (!inicializado) return;
  try {
    posthog.reset();
  } catch (e) {}
}

// Lista blanca de eventos , cualquier nombre fuera de esta lista se
// descarta en silencio. Es la única forma de registrar un evento nuevo:
// agregarlo aquí primero.
var EVENTOS_PERMITIDOS = [
  "sesion_iniciada",
  "pantalla_vista",
  "cliente_creado",
  "oportunidad_creada",
  "cotizacion_creada",
  "cotizacion_aceptada",
  "cotizacion_rechazada",
  "pedido_creado",
  "pedido_entregado",
  "pedido_cancelado",
  "trabajo_completado",
  "pago_registrado",
  "seguimiento_programado",
  "recordatorio_atendido",
  "pdf_generado",
  "reporte_generado",
  "demo_iniciada",
];

// Lista blanca de propiedades , cualquier llave fuera de esta lista se
// descarta en silencio, nunca se manda "tal cual venga". Nunca debe
// agregarse aquí nada que identifique a una persona o traiga información
// comercial (nombres, montos, notas, productos, documentos).
var PROPIEDADES_PERMITIDAS = ["tipo_perfil", "pantalla", "origen", "modo_demo", "dispositivo", "estado", "tipo_documento"];

function limpiarPropiedades(props) {
  var limpio = {};
  if (props) {
    Object.keys(props).forEach(function (k) {
      if (PROPIEDADES_PERMITIDAS.indexOf(k) !== -1 && props[k] !== undefined) limpio[k] = props[k];
    });
  }
  return limpio;
}

// Único punto para registrar un evento. No-op si PostHog no está listo, si
// estamos en demo, o si el nombre no está en la lista blanca de arriba.
// Las propiedades se filtran siempre contra PROPIEDADES_PERMITIDAS , nunca
// se manda un objeto de propiedades sin filtrar.
export function registrarEvento(nombre, propiedades) {
  if (!inicializado || modoDemoActivo) return;
  if (EVENTOS_PERMITIDOS.indexOf(nombre) === -1) return;
  var propiedadesLimpias = limpiarPropiedades(propiedades);
  // tipo_perfil se adjunta AQUÍ, en el único punto central por el que pasa
  // todo evento , nunca hace falta agregarlo a mano en cada llamada. Si
  // quien llama ya lo trae explícito (la mayoría de los eventos
  // comerciales de CLEO.jsx lo siguen mandando así, con el valor real más
  // fresco que tienen a la mano), ese valor explícito gana siempre , esto
  // solo rellena los casos que no lo traen (como "sesion_iniciada" en
  // AuthGate.jsx, disparado antes de que CLEO.jsx termine de cargar el
  // perfil). Si tipoPerfilActivo todavía es null (perfil real aún no
  // conocido en esta sesión del navegador), simplemente no se agrega nada
  // , nunca se manda tipo_perfil vacío ni inventado.
  if (tipoPerfilActivo && !propiedadesLimpias.tipo_perfil) {
    propiedadesLimpias.tipo_perfil = tipoPerfilActivo;
  }
  try {
    posthog.capture(nombre, propiedadesLimpias);
  } catch (e) {}
}

// Dispositivo genérico (móvil/escritorio) , mismo criterio simple que ya
// usa el resto de CLEO para isMobile, sin User-Agent sniffing detallado.
export function dispositivoActual() {
  try {
    return typeof window !== "undefined" && window.innerWidth <= 768 ? "movil" : "escritorio";
  } catch (e) {
    return "escritorio";
  }
}