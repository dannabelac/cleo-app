import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { pullUserData, startCloudSync, clearCleoLocalData, crearDemoSession, eliminarDemoSession, leerDemoSessionValida } from "./cloudSync";
// Único punto de integración con PostHog (ver analytics.js) , identidad y
// los 2 eventos que le tocan a AuthGate (sesion_iniciada/demo_iniciada).
// Nunca se importa "posthog-js" directamente aquí.
import { identificarUsuario, resetearIdentidad, registrarEvento, marcarModoDemo, dispositivoActual, marcarSesionIniciadaUnica, actualizarTipoPerfil } from "./analytics.js";
import CLEO from "./CLEO.jsx";
import { PRIVACY_VERSION, TERMS_VERSION, LegalModal, useDocumentoLegal } from "./LegalDocuments.jsx";

var C = {
  bg: "#F7F7FB",
  surface: "#FFFFFF",
  border: "#E7E7F1",
  text: "#15122B",
  textMuted: "#65637A",
  textDim: "#9C9AB0",
  purple: "#4B5EFC",
  purpleDeep: "#2E3AC7",
  purpleInk: "#1A1440",
  purplePale: "rgba(75,94,252,0.08)",
  red: "#EF4444",
  redBg: "#FEF2F2",
};

var FONT =
  "'Plus Jakarta Sans','Segoe UI',-apple-system,BlinkMacSystemFont,Arial,sans-serif";

var st = {
  page: {
    fontFamily: FONT,
    minHeight: "100vh",
    background: C.bg,
    display: "flex",
    alignItems: "stretch",
    justifyContent: "center",
    padding: 24,
    boxSizing: "border-box",
  },
  shell: {
    width: "100%",
    maxWidth: 980,
    margin: "auto",
    display: "flex",
    minHeight: 560,
    borderRadius: 24,
    overflow: "hidden",
    boxShadow: "0 24px 60px rgba(26,20,64,0.10)",
    background: C.surface,
    flexWrap: "wrap",
  },
  brandPanel: {
    flex: "1 1 340px",
    background: "linear-gradient(160deg," + C.purpleInk + " 0%," + C.purpleDeep + " 55%," + C.purple + " 100%)",
    color: "#fff",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    position: "relative",
    minHeight: 280,
  },
  formPanel: {
    flex: "1 1 380px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  formInner: { width: "100%", maxWidth: 340, margin: "0 auto" },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: C.textMuted,
    marginBottom: 7,
  },
  fieldWrap: { position: "relative", marginBottom: 16 },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1.5px solid " + C.border,
    background: C.surface,
    color: C.text,
    fontSize: 16,
    boxSizing: "border-box",
    fontFamily: FONT,
    outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  },
  inputFocus: {
    borderColor: C.purple,
    boxShadow: "0 0 0 3px " + C.purplePale,
  },
  btnPrimary: {
    cursor: "pointer",
    width: "100%",
    padding: "13px",
    borderRadius: 12,
    border: "none",
    background: C.purple,
    color: "#fff",
    fontSize: 14.5,
    fontWeight: 600,
    marginTop: 6,
    transition: "opacity 0.15s",
    boxShadow: "0 6px 16px rgba(75,94,252,0.28)",
  },
  toggleRow: {
    display: "flex",
    justifyContent: "center",
    gap: 6,
    marginTop: 22,
    fontSize: 13,
    color: C.textMuted,
  },
  btnLink: {
    cursor: "pointer",
    background: "none",
    border: "none",
    color: C.purple,
    fontSize: 13,
    fontWeight: 600,
    padding: 0,
  },
};

// Detecta si la URL actual corresponde a un enlace de recuperación de
// contraseña. Se revisa primero nuestra propia marca (cleo_recovery=1, que
// nosotros mismos agregamos al redirectTo), y como respaldo el formato que
// Supabase pueda usar internamente (type=recovery) — así no dependemos por
// completo de un detalle interno que Supabase podría cambiar.
function urlPareceRecuperacion() {
  if (typeof window === "undefined") return false;
  var hash = window.location.hash || "";
  var search = window.location.search || "";
  return (
    search.indexOf("cleo_recovery=1") !== -1 ||
    hash.indexOf("type=recovery") !== -1 ||
    search.indexOf("type=recovery") !== -1
  );
}

// Banderas NO sensibles en sessionStorage (nunca tokens ni contraseñas) para
// que el proceso de recuperación sobreviva a una recarga de página.
var RECOVERY_ACTIVE_KEY = "cleo_password_recovery_active";
var RECOVERY_UPDATED_KEY = "cleo_password_recovery_updated";
function leerBanderaRecuperacion(key) {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch (e) {
    return false;
  }
}
function escribirBanderaRecuperacion(key) {
  try {
    sessionStorage.setItem(key, "1");
  } catch (e) {}
}
function borrarBanderaRecuperacion(key) {
  try {
    sessionStorage.removeItem(key);
  } catch (e) {}
}

// Ícono oficial de Google (4 colores), como SVG local , nunca se carga como
// imagen externa.
function iconoGoogleSvg() {
  return React.createElement(
    "svg",
    { width: 18, height: 18, viewBox: "0 0 18 18", "aria-hidden": "true", focusable: "false" },
    React.createElement("path", {
      fill: "#4285F4",
      d: "M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z",
    }),
    React.createElement("path", {
      fill: "#34A853",
      d: "M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z",
    }),
    React.createElement("path", {
      fill: "#FBBC05",
      d: "M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z",
    }),
    React.createElement("path", {
      fill: "#EA4335",
      d: "M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z",
    })
  );
}

// Ícono de ojo abierto/tachado para mostrar/ocultar contraseña, reutilizado
// en todos los campos de contraseña de la app.
function iconoOjoSvg(visible) {
  return visible
    ? React.createElement(
        "svg",
        { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none" },
        React.createElement("path", {
          d: "M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 4.24A9.77 9.77 0 0112 4c5 0 9 4 10 8-.31 1.2-.89 2.36-1.68 3.38M6.61 6.61C4.6 8 3.13 9.9 2 12c1 4 5 8 10 8 1.4 0 2.73-.28 3.94-.79",
          stroke: "currentColor",
          strokeWidth: 1.7,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        })
      )
    : React.createElement(
        "svg",
        { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none" },
        React.createElement("path", {
          d: "M2 12c1-4 5-8 10-8s9 4 10 8c-1 4-5 8-10 8s-9-4-10-8z",
          stroke: "currentColor",
          strokeWidth: 1.7,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
        React.createElement("circle", {
          cx: 12,
          cy: 12,
          r: 3,
          stroke: "currentColor",
          strokeWidth: 1.7,
        })
      );
}

function useFocusRing() {
  var s = useState("");
  var focused = s[0];
  var setFocused = s[1];
  return {
    bind: function (name) {
      return {
        onFocus: function () {
          setFocused(name);
        },
        onBlur: function () {
          setFocused("");
        },
      };
    },
    styleFor: function (name) {
      return focused === name
        ? Object.assign({}, st.input, st.inputFocus)
        : st.input;
    },
  };
}

export default function AuthGate() {
  var s1 = useState("cargando");
  var estado = s1[0];
  var setEstado = s1[1];
  var s2 = useState("login");
  var modo = s2[0];
  var setModo = s2[1];
  var s3 = useState("");
  var email = s3[0];
  var setEmail = s3[1];
  var s4 = useState("");
  var password = s4[0];
  var setPassword = s4[1];
  var s5 = useState(false);
  var cargandoForm = s5[0];
  var setCargandoForm = s5[1];
  var s6 = useState("");
  var error = s6[0];
  var setError = s6[1];
  var s7 = useState("");
  var avisoSignup = s7[0];
  var setAvisoSignup = s7[1];
  var s8 = useState(false);
  var verPassword = s8[0];
  var setVerPassword = s8[1];
  var s9 = useState(null);
  var userId = s9[0];
  var setUserId = s9[1];
  var s10 = useState(null);
  var userEmail = s10[0];
  var setUserEmail = s10[1];
  var syncRef = useRef(null);
  // userId de la sesión que YA terminó de procesarse y está con CLEO
  // montado (estado==="listo") , se usa solo para detectar un
  // INITIAL_SESSION/SIGNED_IN duplicado que Supabase puede reemitir al
  // recuperar el foco de la pestaña (sin que haya ocurrido ningún login ni
  // recarga real), y así NO reprocesar esa sesión ni volver a pasar por
  // "sincronizando" , eso es lo que remonta CLEO innecesariamente. Se lee
  // de forma síncrona (a diferencia de un useState) porque el listener de
  // onAuthStateChange vive dentro de un efecto con dependencias [].
  var sesionActivaRef = useRef(null);
  // Guarda { updatedAt, snapshot } devuelto por el pullUserData más reciente
  // que sí llegó a completarse, para que el efecto que arranca
  // startCloudSync (más abajo) pueda usarlo como baseline inicial exacta ,
  // así se cierra la ventana entre el pull y el arranque del sync (antes
  // startCloudSync hacía su propia lectura de updated_at por separado,
  // pudiendo quedar desfasada de los datos que este pull en concreto trajo).
  var baselineSyncRef = useRef(null);
  var procesandoRef = useRef({ userId: null, promise: null });
  var s11 = useState(false);
  var syncError = s11[0];
  var setSyncError = s11[1];
  var s12 = useState(false);
  var syncConflicto = s12[0];
  var setSyncConflicto = s12[1];
  var s13 = useState(null); // null | "error" | "conflicto" , cierre de sesión cancelado por guardado pendiente
  var errorCierreSesion = s13[0];
  var setErrorCierreSesion = s13[1];
  var s14 = useState(false); // evita disparar cerrarSesion() varias veces en paralelo (para la UI)
  var cerrandoSesion = s14[0];
  var setCerrandoSesion = s14[1];
  var cerrandoSesionRef = useRef(false); // bloqueo REAL e inmediato — useState no cambia sincrónicamente
  var s15 = useState(false); // controla si el MODAL de conflicto está abierto (distinto de si el conflicto existe)
  var modalConflictoAbierto = s15[0];
  var setModalConflictoAbierto = s15[1];
  var s16 = useState(null); // null | "resolviendo" | "error" , estado de la resolución en curso
  var estadoResolucionConflicto = s16[0];
  var setEstadoResolucionConflicto = s16[1];
  var resolviendoConflictoRef = useRef(false); // bloqueo síncrono contra dobles clics / resoluciones paralelas

  // ── Recuperación de contraseña ────────────────────────────────────────
  // true si la URL con la que se cargó la página ya parecía un enlace de
  // recuperación (se calcula una sola vez, de forma síncrona) , el evento
  // PASSWORD_RECOVERY también lo activa como respaldo. Mientras sea true,
  // nunca se monta CLEO ni se tocan sus datos, sin importar qué más pase.
  var enRecuperacionRef = useRef(urlPareceRecuperacion() || leerBanderaRecuperacion(RECOVERY_ACTIVE_KEY));

  var s17 = useState(""); // correo para pedir el enlace de recuperación (reutiliza el campo visible)
  var emailRecuperacion = s17[0]; var setEmailRecuperacion = s17[1];
  var s18 = useState(false);
  var enviandoRecuperacion = s18[0]; var setEnviandoRecuperacion = s18[1];
  var enviandoRecuperacionRef = useRef(false); // bloqueo síncrono, igual patrón que cerrarSesion
  var s19 = useState(null); // {tipo:"ok"|"error", texto:"..."} | null
  var mensajeRecuperacion = s19[0]; var setMensajeRecuperacion = s19[1];

  var s20 = useState(""); var nuevaPassword = s20[0]; var setNuevaPassword = s20[1];
  var s21 = useState(""); var confirmarPassword = s21[0]; var setConfirmarPassword = s21[1];
  var s22 = useState(false); var verNuevaPassword = s22[0]; var setVerNuevaPassword = s22[1];
  var s23 = useState(false); var verConfirmarPassword = s23[0]; var setVerConfirmarPassword = s23[1];
  var s24 = useState(false); var guardandoPassword = s24[0]; var setGuardandoPassword = s24[1];
  var guardandoPasswordRef = useRef(false); // bloqueo síncrono, igual patrón que cerrarSesion
  var s25 = useState(null); // mensaje de error específico de esta vista (enlace vencido, contraseña débil, etc.)
  var errorRecuperacionPassword = s25[0]; var setErrorRecuperacionPassword = s25[1];

  var s26 = useState(false); var reintentandoCierre = s26[0]; var setReintentandoCierre = s26[1];
  var reintentandoCierreRef = useRef(false);
  var s27 = useState(false); var solicitandoNuevoEnlace = s27[0]; var setSolicitandoNuevoEnlace = s27[1];
  var solicitandoNuevoEnlaceRef = useRef(false);
  var s28 = useState(null); var errorNuevoEnlace = s28[0]; var setErrorNuevoEnlace = s28[1];

  // ── Confirmación de correo al registrarse ───────────────────────────────
  var s29 = useState(""); var confirmarPasswordRegistro = s29[0]; var setConfirmarPasswordRegistro = s29[1];

  // ── Consentimiento legal ────────────────────────────────────────────
  // ÚNICA fuente de verdad: la fila en legal_acceptances, verificada y
  // pedida DENTRO de manejarSesionReal (después de autenticar de verdad,
  // vía correo/contraseña confirmado o Google), a través de la pantalla
  // obligatoria de abajo. Antes existía además una casilla en el propio
  // formulario de registro que bloqueaba el envío pero nunca escribía
  // nada en Supabase , eso hacía que la persona "aceptara" dos veces:
  // una casilla que no contaba para nada, y luego esta misma pantalla de
  // verdad al volver de confirmar su correo. Se elimina esa casilla , el
  // consentimiento ahora se pide UNA sola vez, aquí.
  // Estado de la pantalla legal obligatoria (post-autenticación).
  var sSessionLegalPendiente = useState(null); var sessionLegalPendiente = sSessionLegalPendiente[0]; var setSessionLegalPendiente = sSessionLegalPendiente[1];
  var sAceptoLegalPantalla = useState(false); var aceptoLegalPantalla = sAceptoLegalPantalla[0]; var setAceptoLegalPantalla = sAceptoLegalPantalla[1];
  var sGuardandoLegal = useState(false); var guardandoLegal = sGuardandoLegal[0]; var setGuardandoLegal = sGuardandoLegal[1];
  var sErrorLegalPantalla = useState(""); var errorLegalPantalla = sErrorLegalPantalla[0]; var setErrorLegalPantalla = sErrorLegalPantalla[1];
  var sCerrandoSesionLegal = useState(false); var cerrandoSesionLegal = sCerrandoSesionLegal[0]; var setCerrandoSesionLegal = sCerrandoSesionLegal[1];
  var guardandoLegalRef = useRef(false); // bloqueo síncrono, además del estado visual
  var cerrandoSesionLegalRef = useRef(false);
  // Documento legal abierto , ahora solo se usa desde la pantalla
  // obligatoria (y desde "Mi cuenta" en CLEO.jsx, sin cambios ahí).
  var docLegalPantalla = useDocumentoLegal();
  // Permite reanudar el MISMO flujo (manejarSesionReal) desde fuera del
  // efecto una vez aceptados los documentos , así "continuar tras aceptar"
  // nunca duplica la lógica de demo/pullUserData/montar CLEO: literalmente
  // vuelve a llamar la misma función, que esta vez sí encontrará la fila.
  var manejarSesionRef = useRef(null);

  var s30 = useState(false); var verConfirmarPasswordRegistro = s30[0]; var setVerConfirmarPasswordRegistro = s30[1];
  var s31 = useState(""); var correoRegistro = s31[0]; var setCorreoRegistro = s31[1]; // solo en memoria, nunca en storage
  var s32 = useState(false); var reenviandoCorreo = s32[0]; var setReenviandoCorreo = s32[1];
  var reenviandoCorreoRef = useRef(false); // bloqueo síncrono contra doble clic
  var s33 = useState(null); var mensajeReenvio = s33[0]; var setMensajeReenvio = s33[1];
  var enviandoFormRef = useRef(false); // bloqueo síncrono adicional del formulario principal, contra doble envío

  // ── Inicio de sesión con Google ─────────────────────────────────────────
  var s34 = useState(false); var iniciandoGoogle = s34[0]; var setIniciandoGoogle = s34[1];
  var iniciandoGoogleRef = useRef(false); // bloqueo síncrono e inmediato contra doble clic

  // ── Modo demo aislado ────────────────────────────────────────────────
  var s35 = useState(false); var demoActivo = s35[0]; var setDemoActivo = s35[1];
  var demoActivoRef = useRef(false); // conocer el estado del demo de forma síncrona e inmediata
  var entrandoDemoRef = useRef(false); // bloqueo síncrono contra doble clic al entrar
  var saliendoDemoRef = useRef(false); // bloqueo síncrono contra doble clic al salir
  var eliminandoCuentaRef = useRef(false); // bloqueo síncrono e inmediato contra doble clic
  var ring = useFocusRing();

  useEffect(function () {
    var activo = true;

    function detenerSync() {
      if (syncRef.current) {
        syncRef.current.stop();
        syncRef.current = null;
      }
    }

    async function manejarSesionReal(session) {
      // Mientras estemos en un enlace de recuperación, nunca se procesa una
      // sesión normal , no se llama pullUserData, no se monta CLEO, no se
      // inicia la sincronización, sin importar qué sesión traiga esto.
      if (enRecuperacionRef.current) return;

      if (!session) {
        detenerSync();
        baselineSyncRef.current = null;
        // Único punto realmente central por el que pasa CUALQUIER cierre de
        // sesión (logout normal, error de logout ya resuelto por otro
        // lado, eliminación de cuenta) , nunca un reset() suelto solo en el
        // botón de salir. modoDemo también se restablece por seguridad.
        resetearIdentidad();
        marcarModoDemo(false);
        sesionActivaRef.current = null;
        if (!activo) return;
        setUserId(null);
        setUserEmail(null);
        setEstado("sinSesion");
        return;
      }

      // ── Control legal obligatorio ──────────────────────────────────
      // Antes de CUALQUIER otra cosa (demo, pullUserData, montar CLEO,
      // sincronizar): ¿esta cuenta ya aceptó EXACTAMENTE las versiones
      // vigentes? Ninguna aceptación con una versión distinta cuenta como
      // válida , cambiar PRIVACY_VERSION o TERMS_VERSION en
      // LegalDocuments.jsx hace que esto vuelva a pedirse solo.
      // Vive DENTRO de manejarSesionReal a propósito: ya está protegido
      // por el mismo bloqueo de manejarSesion() que evita procesar la
      // misma sesión 2 veces en paralelo (getSession + INITIAL_SESSION),
      // así que no hace falta ningún bloqueo adicional aquí.
      var resultadoLegal;
      try {
        resultadoLegal = await supabase
          .from("legal_acceptances")
          .select("id")
          .eq("user_id", session.user.id)
          .eq("privacy_version", PRIVACY_VERSION)
          .eq("terms_version", TERMS_VERSION)
          .eq("adult_confirmed", true)
          .eq("financial_consent", true)
          .eq("acceptance_channel", "web")
          .maybeSingle();
      } catch (excepcionLegal) {
        resultadoLegal = { error: excepcionLegal };
      }
      if (!activo) return;
      if (enRecuperacionRef.current) return; // pudo cambiar mientras esperábamos
      if (resultadoLegal.error) {
        // Nunca se monta CLEO ni se sincroniza si no pudimos confirmar la
        // aceptación , mismo criterio que errorCarga: mejor bloquear que
        // arriesgarnos a dejar pasar a alguien sin consentimiento válido.
        setSessionLegalPendiente(session);
        setEstado("errorLegal");
        return;
      }
      if (!resultadoLegal.data) {
        setSessionLegalPendiente(session);
        setAceptoLegalPantalla(false);
        setErrorLegalPantalla("");
        setEstado("requiereAceptacionLegal");
        return;
      }

      // Antes de pullUserData: ¿ya existe una sesión demo aislada y válida
      // para ESTA MISMA cuenta (por ejemplo, tras refrescar la página en
      // medio de un demo)? Si es así, se monta CLEO directamente con lo que
      // ya está en localStorage , la nube NUNCA reemplaza el demo al
      // refrescar, y la sincronización se mantiene detenida.
      var sesionDemo = leerDemoSessionValida(session.user.id);
      if (sesionDemo) {
        if (!activo) return;
        // Reanudar un demo (p. ej. tras refrescar) nunca identifica ni
        // dispara demo_iniciada de nuevo , esa marca solo se registra una
        // vez, en onEntrarModoDemo(). Aquí solo se asegura que analytics
        // se quede en silencio mientras el demo siga activo.
        marcarModoDemo(true);
        demoActivoRef.current = true;
        setDemoActivo(true);
        setUserId(session.user.id);
        setUserEmail(session.user.email || null);
        sesionActivaRef.current = session.user.id;
        setEstado("listo");
        return;
      }
      // Si había una marca pero pertenece a otra cuenta o está dañada, nunca
      // se confía en ella , se elimina exclusivamente la marca de demo, y
      // se continúa con el flujo normal. Nunca se permite que otra cuenta
      // herede un demo ajeno.
      var marcaDescartada = eliminarDemoSession();
      if (!marcaDescartada) {
        // No se puede confiar en el estado local si ni siquiera se pudo
        // descartar la marca inválida , no se continúa a pullUserData, no
        // se monta CLEO, no se inicia sincronización, y no se tocan otras
        // claves todavía. El botón "Reintentar" existente recarga la página.
        if (!activo) return;
        setEstado("errorCarga");
        return;
      }
      // Solo una vez confirmado que la marca inválida sí se eliminó, se
      // limpian también sus residuos heredados de versiones anteriores.
      try {
        localStorage.removeItem("cleo_demo_backup");
      } catch (e) {}
      try {
        localStorage.removeItem("cleo_demo_productos_loaded_v2");
      } catch (e) {}

      setEstado("sincronizando");
      var huboExito = false;
      var resultado;
      try {
        resultado = await Promise.race([
          pullUserData(session.user.id).then(function (r) {
            huboExito = true;
            return r;
          }),
          new Promise(function (resolve) {
            setTimeout(function () {
              resolve("timeout");
            }, 15000);
          }),
        ]);
      } catch (e) {
        resultado = "error";
      }
      if (!activo) return;
      // Se revisa de nuevo aquí , si PASSWORD_RECOVERY llegó MIENTRAS
      // esperábamos pullUserData, no se debe seguir adelante montando CLEO.
      if (enRecuperacionRef.current) return;

      // Si la carga real nunca llegó a tiempo (o falló), no seguimos adelante en
      // silencio con datos locales que podrían estar vacíos o desactualizados —
      // eso arriesga que 5 segundos después se sincronicen esos datos incompletos
      // hacia la nube, pisando lo que la persona ya tenía guardado de verdad.
      if (!huboExito && (resultado === "timeout" || resultado === "error")) {
        setEstado("errorCarga");
        return;
      }

      // resultado es el objeto { tieneDatos, updatedAt, snapshot } que
      // devuelve pullUserData (huboExito ya confirma que sí es ese objeto y
      // no el literal "timeout"/"error") , se guarda tal cual para que el
      // efecto que arranca startCloudSync lo use como baseline exacta de
      // ESTE pull, sin volver a preguntarle a Supabase por separado.
      baselineSyncRef.current = huboExito ? resultado : null;

      // Sesión real (no demo) ya autenticada y con datos cargados , único
      // punto central para identificar y registrar el inicio de sesión.
      // Nunca antes de este punto (todavía podía no haber sesión válida,
      // o tratarse de un demo).
      marcarModoDemo(false);
      identificarUsuario(session.user.id);
      // tipo_perfil , se intenta AQUÍ, antes de "sesion_iniciada", porque
      // pullUserData (ya resuelto arriba) deja tipo_perfil recién escrito
      // en localStorage ("cleo_perfil") como parte de esa misma carga ,
      // este es el primer momento real en que CLEO conoce el perfil de
      // esta cuenta, nunca antes. Es solo un intento temprano (no-op en
      // silencio si todavía no hay nada cacheado, por ejemplo una cuenta
      // sin perfil definido) , CLEO.jsx vuelve a llamar a
      // actualizarTipoPerfil por su cuenta en cuanto termina de cargar el
      // perfil real, así que ningún caso se queda sin cubrir. Nunca lee
      // nombre/correo/teléfono ni ningún otro dato , solo el valor plano
      // "productos"/"servicios".
      try {
        var tipoPerfilCacheado = JSON.parse(localStorage.getItem("cleo_perfil") || "null");
        if (tipoPerfilCacheado && tipoPerfilCacheado.tipoPerfil) {
          actualizarTipoPerfil(tipoPerfilCacheado.tipoPerfil);
        }
      } catch (e) {}
      // marcarSesionIniciadaUnica evita el duplicado: Supabase puede
      // disparar manejarSesionReal más de una vez para la MISMA sesión
      // (getSession + INITIAL_SESSION) y React StrictMode puede montar
      // este efecto 2 veces en desarrollo , el evento solo sale la
      // primera vez que se confirma esta sesión real para este userId.
      if (marcarSesionIniciadaUnica(session.user.id)) {
        registrarEvento("sesion_iniciada", { dispositivo: dispositivoActual() });
      }

      setUserId(session.user.id);
      setUserEmail(session.user.email || null);
      sesionActivaRef.current = session.user.id;
      setEstado("listo");
    }

    // getSession() y el evento INITIAL_SESSION de onAuthStateChange pueden disparar
    // ambos casi al mismo tiempo al cargar la página, con la misma sesión — esto
    // evita que se dupare el trabajo (2 pulls a la vez) sin quitar ninguno de los
    // 2 caminos, por si uno sirve de respaldo real cuando el otro falla.
    function manejarSesion(session) {
      var uid = session && session.user ? session.user.id : null;
      if (uid && procesandoRef.current.userId === uid && procesandoRef.current.promise) {
        return procesandoRef.current.promise;
      }
      var promesa = manejarSesionReal(session).finally(function () {
        if (procesandoRef.current.userId === uid) {
          procesandoRef.current = { userId: null, promise: null };
        }
      });
      procesandoRef.current = { userId: uid, promise: promesa };
      return promesa;
    }
    manejarSesionRef.current = manejarSesion;

    // Decide cuál de las 2 vistas de recuperación mostrar: si la contraseña
    // ya se guardó en un intento anterior (la página se recargó antes de que
    // se confirmara el cierre de la sesión temporal), se muestra esa vista de
    // éxito directamente , nunca se vuelve a pedir la contraseña.
    function mostrarVistaRecuperacionCorrecta() {
      escribirBanderaRecuperacion(RECOVERY_ACTIVE_KEY);
      if (leerBanderaRecuperacion(RECOVERY_UPDATED_KEY)) {
        setEstado("recuperacionActualizada");
      } else {
        setEstado("recuperarPassword");
      }
    }

    // Si la URL (o la bandera persistida) ya indicaba recuperación desde el
    // arranque, se muestra esa vista de inmediato , sin esperar a getSession
    // ni a ningún evento.
    if (enRecuperacionRef.current) {
      mostrarVistaRecuperacionCorrecta();
    }

    supabase.auth.getSession().then(function (res) {
      if (!activo) return;
      if (enRecuperacionRef.current) return; // ya se está mostrando la vista de recuperación
      manejarSesion(res.data.session);
    });

    var sub = supabase.auth.onAuthStateChange(function (_event, session) {
      if (!activo) return;

      // PASSWORD_RECOVERY se procesa ANTES que cualquier otro filtro y nunca
      // se ignora , nunca debe montar CLEO ni tocar sus datos, sin importar
      // qué haya pasado antes.
      if (_event === "PASSWORD_RECOVERY") {
        enRecuperacionRef.current = true;
        mostrarVistaRecuperacionCorrecta();
        return;
      }
      // Mientras sigamos en un enlace de recuperación, se ignora cualquier
      // otro evento que intente avanzar hacia la sesión normal (por ejemplo,
      // un INITIAL_SESSION que llegue con la sesión temporal de recuperación).
      if (enRecuperacionRef.current) return;

      // Solo procesar eventos reales de inicio/cierre de sesión. Supabase también
      // dispara este listener al renovar el token en segundo plano (por ejemplo
      // al regresar a una pestaña en pausa) — eso no debe volver a jalar datos
      // de la nube ni mandar al usuario a la pantalla de carga, o se arriesga a
      // pisar cambios locales recientes que aún no se han subido.
      if (_event !== "SIGNED_IN" && _event !== "SIGNED_OUT" && _event !== "INITIAL_SESSION") {
        if (session) {
          setUserId(session.user.id);
          setUserEmail(session.user.email || null);
        }
        return;
      }
      // Supabase puede reemitir INITIAL_SESSION (y en algunos casos
      // SIGNED_IN) para la MISMA cuenta que ya terminó de cargar y ya
      // tiene CLEO montado , por ejemplo al recuperar el foco de la
      // pestaña tras minimizar, cambiar de app o bloquear el celular, sin
      // que haya ocurrido ningún login real ni recarga de la página. Si
      // eso pasa, se trata igual que un TOKEN_REFRESHED de fondo (arriba):
      // se refresca userId/userEmail por si acaso, pero NUNCA se vuelve a
      // pasar por manejarSesion/"sincronizando" , eso es lo que
      // desmontaba y remontaba CLEO de la nada, perdiendo modales abiertos
      // y disparando el aviso de "retomar borrador" sin motivo real.
      if (session && sesionActivaRef.current === session.user.id) {
        setUserId(session.user.id);
        setUserEmail(session.user.email || null);
        return;
      }
      manejarSesion(session);
    });
    var listener = sub.data;

    return function () {
      activo = false;
      listener.subscription.unsubscribe();
      detenerSync();
    };
  }, []);

  // Arranca la sincronización en segundo plano solo cuando ya montamos CLEO
  // Y no estamos en modo demo , mientras el demo esté activo, nunca debe
  // existir ninguna sincronización corriendo sobre esas claves.
  useEffect(function () {
    if (estado !== "listo" || !userId || demoActivo) return;
    // baselineSyncRef.current viene del pullUserData que acaba de traer a
    // esta cuenta a "listo" (o null si no hubo pull de por medio, p. ej. al
    // reanudar sync tras un intento fallido de eliminar cuenta) , se
    // consume una sola vez aquí y se limpia, para que un reinicio posterior
    // de este mismo efecto (userId distinto) nunca reutilice por error una
    // baseline vieja de otra cuenta.
    var baselineParaEsteArranque = baselineSyncRef.current;
    baselineSyncRef.current = null;
    syncRef.current = startCloudSync(userId, function (estadoSync) {
      setSyncError(estadoSync === "error");
      setSyncConflicto(estadoSync === "conflicto");
      if (estadoSync === "conflicto") setModalConflictoAbierto(true);
    }, baselineParaEsteArranque);
    return function () {
      if (syncRef.current) {
        syncRef.current.stop();
        syncRef.current = null;
      }
    };
  }, [estado, userId, demoActivo]);

  function cambiarModo(nuevoModo) {
    setModo(nuevoModo);
    setError("");
    setAvisoSignup("");
    setMensajeRecuperacion(null);
    setConfirmarPasswordRegistro("");
    setMensajeReenvio(null);
  }

  function detectarLimiteCorreos(err) {
    if (!err) return false;
    if (err.status === 429) return true;
    var msg = (err.message || "").toLowerCase();
    return msg.indexOf("rate limit") !== -1 || msg.indexOf("too many") !== -1;
  }

  async function solicitarRecuperacion(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (enviandoRecuperacionRef.current) return; // bloqueo síncrono e inmediato
    if (!emailRecuperacion.trim()) {
      setMensajeRecuperacion({ tipo: "error", texto: "Escribe tu correo antes de continuar." });
      return;
    }
    enviandoRecuperacionRef.current = true;
    setEnviandoRecuperacion(true);
    setMensajeRecuperacion(null);
    try {
      var emailNormalizado = emailRecuperacion.trim().toLowerCase();
      var resultado;
      try {
        resultado = await supabase.auth.resetPasswordForEmail(emailNormalizado, {
          redirectTo: window.location.origin + "/?cleo_recovery=1",
        });
      } catch (excepcion) {
        resultado = { error: excepcion };
      }
      if (resultado && resultado.error) {
        // Nunca se muestran los mensajes técnicos de Supabase , solo estos 2
        // casos traducidos. Ninguno de los 2 revela si el correo existe.
        if (detectarLimiteCorreos(resultado.error)) {
          setMensajeRecuperacion({ tipo: "error", texto: "Espera un momento antes de solicitar otro enlace." });
        } else {
          setMensajeRecuperacion({ tipo: "error", texto: "No pudimos enviar el enlace. Revisa tu conexión e intenta de nuevo." });
        }
        return;
      }
      // Mensaje genérico siempre , nunca revela si la cuenta existe de verdad.
      setMensajeRecuperacion({
        tipo: "ok",
        texto: "Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña. Revisa también spam o correo no deseado.",
      });
    } finally {
      enviandoRecuperacionRef.current = false;
      setEnviandoRecuperacion(false);
    }
  }

  async function iniciarConGoogle() {
    if (iniciandoGoogleRef.current) return; // bloqueo síncrono e inmediato, no depende de que React re-renderice
    iniciandoGoogleRef.current = true;
    setIniciandoGoogle(true);
    setError("");
    var resultado;
    try {
      resultado = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/",
          queryParams: {
            prompt: "select_account",
          },
        },
      });
    } catch (excepcion) {
      resultado = { error: excepcion };
    }
    if (resultado && resultado.error) {
      // Nunca se muestra el mensaje técnico de Supabase/Google , solo este.
      setError("No pudimos conectar con Google. Revisa tu conexión e intenta de nuevo.");
      iniciandoGoogleRef.current = false;
      setIniciandoGoogle(false);
      return;
    }
    // Sin error: el navegador ya está siendo redirigido a Google , no se
    // libera el bloqueo aquí a propósito, la página está a punto de navegar
    // fuera de todas formas. pullUserData/startCloudSync/clearCleoLocalData
    // nunca se llaman aquí , eso queda exclusivamente para cuando regrese
    // el evento SIGNED_IN ya existente, igual que con cualquier otro login.
  }

  async function reenviarCorreoConfirmacion() {
    if (reenviandoCorreoRef.current) return; // bloqueo síncrono e inmediato
    reenviandoCorreoRef.current = true;
    setReenviandoCorreo(true);
    setMensajeReenvio(null);
    try {
      var resultado;
      try {
        resultado = await supabase.auth.resend({
          type: "signup",
          email: correoRegistro,
          options: {
            emailRedirectTo: window.location.origin + "/",
          },
        });
      } catch (excepcion) {
        resultado = { error: excepcion };
      }
      if (resultado && resultado.error) {
        if (detectarLimiteCorreos(resultado.error)) {
          setMensajeReenvio({ tipo: "error", texto: "Espera un momento antes de solicitar otro correo." });
        } else {
          setMensajeReenvio({ tipo: "error", texto: "No pudimos enviar el correo. Revisa tu conexión e intenta de nuevo." });
        }
        return;
      }
      setMensajeReenvio({ tipo: "ok", texto: "Correo enviado nuevamente. Revisa también spam o correo no deseado." });
    } finally {
      reenviandoCorreoRef.current = false;
      setReenviandoCorreo(false);
    }
  }

  function traducirError(msg) {
    if (/Invalid login credentials/i.test(msg))
      return "Correo o contraseña incorrectos.";
    if (/User already registered/i.test(msg))
      return "Ya existe una cuenta con este correo. Inicia sesión.";
    if (/Password should be at least/i.test(msg))
      return "La contraseña debe tener al menos 8 caracteres.";
    if (/Unable to validate email/i.test(msg))
      return "Ese correo no parece válido.";
    return msg;
  }

  function manejarSubmit(ev) {
    ev.preventDefault();
    if (enviandoFormRef.current) return; // bloqueo síncrono e inmediato, además de cargandoForm
    setError("");
    setAvisoSignup("");

    if (modo === "signup") {
      if (!email.trim() || !password || !confirmarPasswordRegistro) {
        setError("Completa tu correo y ambas contraseñas.");
        return;
      }
      if (password.length < 8) {
        setError("La contraseña debe tener al menos 8 caracteres.");
        return;
      }
      if (password !== confirmarPasswordRegistro) {
        setError("Las contraseñas no coinciden.");
        return;
      }
      // El consentimiento legal ya NO se valida aquí , se pide una única
      // vez, después de autenticar de verdad, en la pantalla obligatoria
      // ("requiereAceptacionLegal" más abajo). Antes esta casilla
      // bloqueaba el envío sin guardar nada en Supabase, lo que hacía que
      // la persona viera la pregunta dos veces (aquí y otra vez, de
      // verdad, al volver de confirmar su correo).
    } else {
      if (!email.trim() || !password) {
        setError("Escribe tu correo y contraseña.");
        return;
      }
    }

    enviandoFormRef.current = true;
    setCargandoForm(true);

    var accion;
    if (modo === "login") {
      accion = supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });
    } else {
      var emailNormalizadoRegistro = email.trim().toLowerCase();
      accion = supabase.auth.signUp({
        email: emailNormalizadoRegistro,
        password: password,
        options: {
          emailRedirectTo: window.location.origin + "/",
        },
      });
    }

    accion
      .then(function (res) {
        if (res.error) {
          if (modo === "signup") {
            // Nunca se revela si la cuenta ya existía , tanto un correo
            // nuevo como uno ya registrado llevan a la MISMA vista genérica
            // de "revisa tu correo". El login normal sigue mostrando su
            // mensaje real ("correo o contraseña incorrectos"), sin cambios.
            if (/User already registered/i.test(res.error.message || "")) {
              setCorreoRegistro(email.trim().toLowerCase());
              setPassword("");
              setConfirmarPasswordRegistro("");
              setModo("revisaCorreo");
              return;
            }
            setError(traducirError(res.error.message));
            return;
          }
          setError(traducirError(res.error.message));
          return;
        }
        if (modo === "signup" && !res.data.session) {
          setCorreoRegistro(email.trim().toLowerCase());
          setPassword("");
          setConfirmarPasswordRegistro("");
          setModo("revisaCorreo");
        }
      })
      .catch(function () {
        setError("No se pudo conectar. Revisa tu internet e intenta de nuevo.");
      })
      .finally(function () {
        enviandoFormRef.current = false;
        setCargandoForm(false);
      });
  }

  if (estado === "cargando" || estado === "sincronizando") {
    return React.createElement(
      "div",
      {
        style: Object.assign({}, st.page, {
          alignItems: "center",
          justifyContent: "center",
        }),
      },
      React.createElement("div", {
        style: {
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "3px solid " + C.border,
          borderTopColor: C.purple,
          animation: "cleoSpin 0.8s linear infinite",
        },
      }),
      React.createElement(
        "style",
        null,
        "@keyframes cleoSpin{to{transform:rotate(360deg)}}"
      )
    );
  }

  function reintentarCarga() {
    // La forma más confiable de reintentar es recargar por completo: así el
    // flujo normal del montaje (getSession → pullUserData → etc.) se repite
    // desde cero, sin arriesgarnos a duplicar o desincronizar esa lógica aquí.
    window.location.reload();
  }

  // ── Pantalla legal obligatoria ───────────────────────────────────────
  function reintentarControlLegal() {
    // Se reintenta reinvocando exactamente la misma función que ya hizo la
    // consulta la primera vez (manejarSesionReal, vía el ref) , nunca se
    // duplica esa lógica aquí. Solo si no hay sesión guardada (caso
    // extremo) se recurre a recargar la página, igual que reintentarCarga.
    if (sessionLegalPendiente && manejarSesionRef.current) {
      setErrorLegalPantalla("");
      manejarSesionRef.current(sessionLegalPendiente);
    } else {
      window.location.reload();
    }
  }

  async function noAceptarYCerrarSesion() {
    if (cerrandoSesionLegalRef.current) return; // bloqueo síncrono, primera línea
    cerrandoSesionLegalRef.current = true;
    setCerrandoSesionLegal(true);
    setErrorLegalPantalla("");
    // Deliberadamente NO se usa cerrarSesion() (el cierre normal de CLEO):
    // en este punto todavía no debe existir ninguna sincronización activa,
    // así que no hay nada que hacer flush antes de cerrar , un signOut
    // local simple y directo es lo correcto aquí.
    var resultado;
    try {
      resultado = await supabase.auth.signOut({ scope: "local" });
    } catch (excepcionSignOut) {
      resultado = { error: excepcionSignOut };
    }
    if (resultado && resultado.error) {
      // Nunca se permite entrar a CLEO por un fallo de cierre , la
      // pantalla se mantiene bloqueada, con opción de reintentar.
      cerrandoSesionLegalRef.current = false;
      setCerrandoSesionLegal(false);
      setErrorLegalPantalla("No se pudo cerrar la sesión. Intenta de nuevo.");
      return;
    }
    // Éxito: el listener de onAuthStateChange ya existente se encarga de
    // limpiar el estado (session:null → manejarSesionReal → "sinSesion"),
    // así que no hace falta tocar nada más aquí ni duplicar esa lógica.
    cerrandoSesionLegalRef.current = false;
    setCerrandoSesionLegal(false);
  }

  async function aceptarDocumentosLegales() {
    if (guardandoLegalRef.current) return; // bloqueo síncrono, primera línea, antes que cualquier otra cosa
    if (!aceptoLegalPantalla || !sessionLegalPendiente) return;
    guardandoLegalRef.current = true;
    setGuardandoLegal(true);
    setErrorLegalPantalla("");

    var uid = sessionLegalPendiente.user.id;
    var resultadoInsert;
    try {
      resultadoInsert = await supabase.from("legal_acceptances").insert({
        user_id: uid,
        privacy_version: PRIVACY_VERSION,
        terms_version: TERMS_VERSION,
        adult_confirmed: true,
        financial_consent: true,
        acceptance_channel: "web",
      });
    } catch (excepcionInsert) {
      resultadoInsert = { error: excepcionInsert };
    }
    if (resultadoInsert.error) {
      // No se asume fracaso todavía , podría tratarse de la restricción
      // única por usuario+versiones rechazando un doble envío. La fuente
      // de verdad real es la reconsulta de abajo, nunca este error solo.
    }

    // Se vuelve a consultar la fila EXACTA antes de continuar , nunca se
    // da por hecho que se guardó solo porque el INSERT terminó (con o sin
    // error). Si la fila exacta ya existe (por este intento o por un doble
    // envío previo), se considera éxito; nunca se crea una fila alternativa
    // ni se cambian versiones.
    var resultadoConfirmacion;
    try {
      resultadoConfirmacion = await supabase
        .from("legal_acceptances")
        .select("id")
        .eq("user_id", uid)
        .eq("privacy_version", PRIVACY_VERSION)
        .eq("terms_version", TERMS_VERSION)
        .eq("adult_confirmed", true)
        .eq("financial_consent", true)
        .eq("acceptance_channel", "web")
        .maybeSingle();
    } catch (excepcionConfirmacion) {
      resultadoConfirmacion = { error: excepcionConfirmacion };
    }

    if (resultadoConfirmacion.error || !resultadoConfirmacion.data) {
      // El guardado no pudo confirmarse , se mantiene bloqueado el acceso,
      // se conserva la casilla marcada para facilitar el reintento, y se
      // muestra un error comprensible. Nunca se monta CLEO ni se sincroniza.
      guardandoLegalRef.current = false;
      setGuardandoLegal(false);
      setErrorLegalPantalla("No se pudo guardar tu aceptación. Revisa tu conexión e intenta de nuevo.");
      return;
    }

    // Confirmado: la fila exacta existe. Se continúa UNA SOLA VEZ con el
    // flujo normal de esta misma sesión (demo/pullUserData/CLEO/sync),
    // reinvocando literalmente la misma función que ya lo hace , nunca se
    // duplica esa lógica aquí.
    guardandoLegalRef.current = false;
    setGuardandoLegal(false);
    var sessionParaContinuar = sessionLegalPendiente;
    setSessionLegalPendiente(null);
    if (manejarSesionRef.current) {
      manejarSesionRef.current(sessionParaContinuar);
    }
  }

  if (estado === "errorCarga") {
    return React.createElement(
      "div",
      {
        style: Object.assign({}, st.page, {
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }),
      },
      React.createElement(
        "div",
        { style: { maxWidth: 320 } },
        React.createElement(
          "div",
          { style: { fontSize: 32, marginBottom: 12 } },
          "📡"
        ),
        React.createElement(
          "div",
          {
            style: {
              fontSize: 16,
              fontWeight: 700,
              color: C.text,
              marginBottom: 8,
            },
          },
          "No pudimos cargar tu información"
        ),
        React.createElement(
          "div",
          {
            style: {
              fontSize: 13.5,
              color: C.textMuted,
              marginBottom: 22,
              lineHeight: 1.5,
            },
          },
          "Revisa tu conexión a internet e intenta de nuevo. No queremos arriesgarnos a mostrarte información incompleta."
        ),
        React.createElement(
          "button",
          {
            style: st.btnPrimary,
            onClick: reintentarCarga,
          },
          "Reintentar"
        )
      )
    );
  }

  // ── Pantalla: no se pudo confirmar la aceptación legal (error de red/Supabase) ──
  if (estado === "errorLegal") {
    return React.createElement(
      "div",
      {
        style: Object.assign({}, st.page, {
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }),
      },
      React.createElement(
        "div",
        { style: { maxWidth: 320 } },
        React.createElement("div", { style: { fontSize: 32, marginBottom: 12 } }, "📡"),
        React.createElement(
          "div",
          { style: { fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 } },
          "No pudimos confirmar tu aceptación"
        ),
        React.createElement(
          "div",
          { style: { fontSize: 13.5, color: C.textMuted, marginBottom: 22, lineHeight: 1.5 } },
          "Revisa tu conexión a internet e intenta de nuevo. Por seguridad, no podemos continuar sin confirmar esto."
        ),
        React.createElement(
          "button",
          { style: Object.assign({}, st.btnPrimary, { marginBottom: 10 }), onClick: reintentarControlLegal },
          "Reintentar"
        ),
        React.createElement(
          "button",
          {
            style: Object.assign({}, st.btnPrimary, {
              background: "transparent",
              color: C.textMuted,
              border: "1px solid " + C.border,
              opacity: cerrandoSesionLegal ? 0.6 : 1,
            }),
            disabled: cerrandoSesionLegal,
            onClick: noAceptarYCerrarSesion,
          },
          cerrandoSesionLegal ? "Cerrando sesión…" : "Cerrar sesión"
        )
      )
    );
  }

  // ── Pantalla: aceptación legal obligatoria ──────────────────────────
  if (estado === "requiereAceptacionLegal") {
    return React.createElement(
      "div",
      { style: Object.assign({}, st.page, { alignItems: "center", justifyContent: "center" }) },
      React.createElement(
        "div",
        { style: { width: "100%", maxWidth: 420 } },
        React.createElement(
          "div",
          { style: { fontSize: 19, fontWeight: 700, color: C.text, marginBottom: 10, textAlign: "center" } },
          "Antes de continuar"
        ),
        React.createElement(
          "div",
          { style: { fontSize: 13.5, color: C.textMuted, lineHeight: 1.55, marginBottom: 22, textAlign: "center" } },
          "Queremos que sepas con claridad cómo funciona CLEO y cómo protegemos la información que decides registrar."
        ),
        React.createElement(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 } },
          React.createElement(
            "button",
            {
              type: "button",
              onClick: docLegalPantalla.abrirPrivacidad,
              style: Object.assign({}, st.btnPrimary, {
                background: "transparent",
                color: C.purple,
                border: "1.5px solid " + C.purple,
              }),
            },
            "Ver Aviso de Privacidad"
          ),
          React.createElement(
            "button",
            {
              type: "button",
              onClick: docLegalPantalla.abrirTerminos,
              style: Object.assign({}, st.btnPrimary, {
                background: "transparent",
                color: C.purple,
                border: "1.5px solid " + C.purple,
              }),
            },
            "Ver Términos de la Beta"
          )
        ),

        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 18 } },
          React.createElement("input", {
            type: "checkbox",
            id: "acepto-legal-pantalla",
            checked: aceptoLegalPantalla,
            onChange: function (ev) {
              setAceptoLegalPantalla(ev.target.checked);
              setErrorLegalPantalla("");
            },
            style: { marginTop: 3, width: 18, height: 18, minWidth: 18, flexShrink: 0, cursor: "pointer" },
          }),
          React.createElement(
            "label",
            { htmlFor: "acepto-legal-pantalla", style: { fontSize: 13, color: C.text, lineHeight: 1.55, cursor: "pointer" } },
            "Confirmo que soy mayor de 18 años y que leí y acepto los Términos de la Beta y el Aviso de Privacidad. Autorizo expresamente el tratamiento de la información financiera o patrimonial que decida registrar en CLEO."
          )
        ),

        errorLegalPantalla &&
          React.createElement(
            "div",
            {
              style: {
                fontSize: 12.5,
                color: C.red,
                background: C.redBg,
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 14,
                lineHeight: 1.5,
              },
            },
            errorLegalPantalla
          ),

        React.createElement(
          "button",
          {
            style: Object.assign({}, st.btnPrimary, {
              marginBottom: 10,
              opacity: !aceptoLegalPantalla || guardandoLegal ? 0.55 : 1,
            }),
            disabled: !aceptoLegalPantalla || guardandoLegal,
            onClick: aceptarDocumentosLegales,
          },
          guardandoLegal ? "Guardando…" : "Aceptar y continuar"
        ),
        React.createElement(
          "button",
          {
            style: Object.assign({}, st.btnPrimary, {
              background: "transparent",
              color: C.textMuted,
              border: "1px solid " + C.border,
              opacity: cerrandoSesionLegal ? 0.6 : 1,
            }),
            disabled: cerrandoSesionLegal,
            onClick: noAceptarYCerrarSesion,
          },
          cerrandoSesionLegal ? "Cerrando sesión…" : "No aceptar y cerrar sesión"
        ),

        docLegalPantalla.documentoAbierto &&
          React.createElement(LegalModal, {
            tipo: docLegalPantalla.documentoAbierto,
            onClose: docLegalPantalla.cerrarDocumento,
          })
      )
    );
  }

  if (estado === "recuperarPassword") {
    function campoPassword(valor, onChange, verValor, onToggleVer, placeholder, autoComplete) {
      return React.createElement(
        "div",
        { style: { position: "relative" } },
        React.createElement("input", {
          type: verValor ? "text" : "password",
          autoComplete: autoComplete,
          placeholder: placeholder,
          value: valor,
          onChange: function (ev) {
            onChange(ev.target.value);
          },
          style: Object.assign({}, st.input, { paddingRight: 44 }),
        }),
        React.createElement(
          "button",
          {
            type: "button",
            onClick: onToggleVer,
            "aria-label": verValor ? "Ocultar contraseña" : "Mostrar contraseña",
            style: {
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.textDim,
              padding: 6,
            },
          },
          iconoOjoSvg(verValor)
        )
      );
    }

    return React.createElement(
      "div",
      { style: Object.assign({}, st.page, { alignItems: "center", justifyContent: "center" }) },
      React.createElement(
        "div",
        { style: { width: "100%", maxWidth: 360 } },
        React.createElement(
          "div",
          { style: { fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 6 } },
          "Crea una nueva contraseña"
        ),
        React.createElement(
          "div",
          { style: { fontSize: 13.5, color: C.textMuted, marginBottom: 22, lineHeight: 1.5 } },
          "Escribe tu nueva contraseña dos veces para confirmarla."
        ),
        React.createElement(
          "form",
          { onSubmit: guardarNuevaPassword },
          React.createElement(
            "div",
            { style: st.fieldWrap },
            React.createElement("label", { style: st.label }, "Nueva contraseña"),
            campoPassword(nuevaPassword, setNuevaPassword, verNuevaPassword, function () { setVerNuevaPassword(!verNuevaPassword); }, "••••••••", "new-password")
          ),
          React.createElement(
            "div",
            { style: st.fieldWrap },
            React.createElement("label", { style: st.label }, "Confirmar contraseña"),
            campoPassword(confirmarPassword, setConfirmarPassword, verConfirmarPassword, function () { setVerConfirmarPassword(!verConfirmarPassword); }, "••••••••", "new-password")
          ),
          errorRecuperacionPassword &&
            React.createElement(
              "div",
              {
                style: {
                  background: C.redBg,
                  color: C.red,
                  fontSize: 12.5,
                  padding: "9px 12px",
                  borderRadius: 10,
                  marginBottom: 14,
                  lineHeight: 1.4,
                },
              },
              errorRecuperacionPassword
            ),
          React.createElement(
            "button",
            {
              type: "submit",
              disabled: guardandoPassword,
              style: Object.assign({}, st.btnPrimary, { opacity: guardandoPassword ? 0.65 : 1 }),
            },
            guardandoPassword ? "Guardando…" : "Guardar nueva contraseña"
          )
        ),
        React.createElement(
          "div",
          { style: Object.assign({}, st.toggleRow, { flexDirection: "column", gap: 4 }) },
          React.createElement("span", null, "¿El enlace ya no sirve o venció?"),
          errorNuevoEnlace &&
            React.createElement(
              "div",
              { style: { color: C.red, fontSize: 12, marginTop: 2 } },
              errorNuevoEnlace
            ),
          React.createElement(
            "button",
            {
              disabled: solicitandoNuevoEnlace,
              style: Object.assign({}, st.btnLink, { opacity: solicitandoNuevoEnlace ? 0.65 : 1 }),
              onClick: solicitarEnlaceNuevo,
            },
            solicitandoNuevoEnlace ? "Un momento…" : "Solicitar un enlace nuevo"
          )
        )
      )
    );
  }

  if (estado === "recuperacionActualizada") {
    return React.createElement(
      "div",
      { style: Object.assign({}, st.page, { alignItems: "center", justifyContent: "center", textAlign: "center" }) },
      React.createElement(
        "div",
        { style: { maxWidth: 340 } },
        React.createElement("div", { style: { fontSize: 32, marginBottom: 12 } }, "✅"),
        React.createElement(
          "div",
          { style: { fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 8 } },
          "Tu contraseña se actualizó correctamente"
        ),
        React.createElement(
          "div",
          { style: { fontSize: 13.5, color: C.textMuted, marginBottom: 22, lineHeight: 1.5 } },
          "Falta cerrar la sesión temporal para volver al acceso."
        ),
        React.createElement(
          "button",
          {
            disabled: reintentandoCierre,
            style: Object.assign({}, st.btnPrimary, { opacity: reintentandoCierre ? 0.65 : 1 }),
            onClick: reintentarCerrarSesionTemporal,
          },
          reintentandoCierre ? "Un momento…" : "Volver al inicio de sesión"
        )
      )
    );
  }

  function detectarPasswordDebil(err) {
    if (!err) return false;
    var msg = (err.message || "").toLowerCase();
    return (
      msg.indexOf("password") !== -1 &&
      (msg.indexOf("weak") !== -1 || msg.indexOf("short") !== -1 || msg.indexOf("least") !== -1 || msg.indexOf("6 characters") !== -1)
    );
  }
  function detectarEnlaceInvalido(err) {
    if (!err) return false;
    var msg = (err.message || "").toLowerCase();
    return msg.indexOf("expired") !== -1 || msg.indexOf("invalid") !== -1 || msg.indexOf("token") !== -1 || msg.indexOf("session") !== -1;
  }

  // Intenta cerrar la sesión temporal de recuperación y, SOLO si funciona,
  // limpia banderas/URL/ref. Devuelve true si quedó todo limpio, false si
  // hay que seguir mostrando la vista de "falta cerrar sesión" para poder
  // reintentar. Se usa tanto justo después de guardar la contraseña como
  // desde el botón de reintentar.
  async function intentarCerrarSesionTemporalYLimpiar() {
    var resultadoSignOut;
    try {
      resultadoSignOut = await supabase.auth.signOut();
    } catch (excepcion) {
      resultadoSignOut = { error: excepcion };
    }
    if (resultadoSignOut && resultadoSignOut.error) {
      console.error("AuthGate: no se pudo cerrar la sesión temporal de recuperación", resultadoSignOut.error);
      return false;
    }
    // Solo se limpia hasta que el cierre de sesión quedó confirmado.
    borrarBanderaRecuperacion(RECOVERY_ACTIVE_KEY);
    borrarBanderaRecuperacion(RECOVERY_UPDATED_KEY);
    enRecuperacionRef.current = false;
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch (e) {}
    return true;
  }

  async function guardarNuevaPassword(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (guardandoPasswordRef.current) return; // bloqueo síncrono e inmediato
    setErrorRecuperacionPassword(null);
    if (!nuevaPassword || !confirmarPassword) {
      setErrorRecuperacionPassword("Completa ambos campos.");
      return;
    }
    if (nuevaPassword.length < 8) {
      setErrorRecuperacionPassword("La contraseña debe tener al menos 8 caracteres y ser más segura.");
      return;
    }
    if (nuevaPassword !== confirmarPassword) {
      setErrorRecuperacionPassword("Las contraseñas no coinciden.");
      return;
    }

    guardandoPasswordRef.current = true;
    setGuardandoPassword(true);
    try {
      var resultado;
      try {
        resultado = await supabase.auth.updateUser({ password: nuevaPassword });
      } catch (excepcion) {
        resultado = { error: excepcion };
      }
      // Se revisa explícitamente el error , nunca se asume que Supabase lanza.
      if (resultado && resultado.error) {
        if (detectarPasswordDebil(resultado.error)) {
          setErrorRecuperacionPassword("La contraseña debe tener al menos 8 caracteres y ser más segura.");
        } else if (detectarEnlaceInvalido(resultado.error)) {
          setErrorRecuperacionPassword("Este enlace ya venció o no es válido. Solicita uno nuevo.");
        } else {
          setErrorRecuperacionPassword("No pudimos actualizar la contraseña. Solicita un enlace nuevo e intenta otra vez.");
        }
        return;
      }

      // Éxito , la contraseña YA cambió. Se limpia del estado de inmediato,
      // sin dejarla ni un momento más de lo necesario en memoria.
      setNuevaPassword("");
      setConfirmarPassword("");

      // Se marca ANTES de intentar signOut , si la página se recarga entre
      // este punto y que termine, sabremos que la contraseña ya se guardó y
      // nunca se volverá a pedir.
      escribirBanderaRecuperacion(RECOVERY_UPDATED_KEY);
      setEstado("recuperacionActualizada");

      var cerroBien = await intentarCerrarSesionTemporalYLimpiar();
      if (cerroBien) {
        setEstado("sinSesion");
        setModo("login");
        setAvisoSignup("Tu contraseña se actualizó. Ya puedes iniciar sesión.");
      }
      // Si no cerró bien, se queda en "recuperacionActualizada" con su
      // propio botón de reintentar , nunca se muestra que la actualización
      // en sí falló, porque no fue así.
    } finally {
      guardandoPasswordRef.current = false;
      setGuardandoPassword(false);
    }
  }

  async function reintentarCerrarSesionTemporal() {
    if (reintentandoCierreRef.current) return; // bloqueo síncrono e inmediato
    reintentandoCierreRef.current = true;
    setReintentandoCierre(true);
    try {
      var cerroBien = await intentarCerrarSesionTemporalYLimpiar();
      if (cerroBien) {
        setEstado("sinSesion");
        setModo("login");
        setAvisoSignup("Tu contraseña se actualizó. Ya puedes iniciar sesión.");
      }
    } finally {
      reintentandoCierreRef.current = false;
      setReintentandoCierre(false);
    }
  }

  async function solicitarEnlaceNuevo() {
    if (solicitandoNuevoEnlaceRef.current) return; // bloqueo síncrono e inmediato
    solicitandoNuevoEnlaceRef.current = true;
    setSolicitandoNuevoEnlace(true);
    setErrorNuevoEnlace(null);
    try {
      // Antes de soltar el modo recuperación, se intenta cerrar cualquier
      // sesión temporal que haya quedado abierta , con scope "local" (solo
      // este navegador), ya que no se trata de un cierre de sesión normal.
      var resultado;
      try {
        resultado = await supabase.auth.signOut({ scope: "local" });
      } catch (excepcion) {
        resultado = { error: excepcion };
      }
      if (resultado && resultado.error) {
        console.error("AuthGate: no se pudo cerrar la sesión temporal antes de pedir un enlace nuevo", resultado.error);
        setErrorNuevoEnlace("No pudimos prepararlo todavía. Intenta de nuevo.");
        return;
      }
      borrarBanderaRecuperacion(RECOVERY_ACTIVE_KEY);
      borrarBanderaRecuperacion(RECOVERY_UPDATED_KEY);
      enRecuperacionRef.current = false;
      try {
        window.history.replaceState(null, "", window.location.pathname);
      } catch (e) {}
      setNuevaPassword("");
      setConfirmarPassword("");
      setErrorRecuperacionPassword(null);
      setEstado("sinSesion");
      setModo("recuperar");
    } finally {
      solicitandoNuevoEnlaceRef.current = false;
      setSolicitandoNuevoEnlace(false);
    }
  }

  // Elimina la cuenta de forma permanente vía la Edge Function delete-account.
  // Nunca guarda nada antes (los datos se van a borrar de todas formas), y
  // nunca limpia nada local hasta tener la confirmación real del servidor.
  async function eliminarCuenta(confirmacion) {
    if (eliminandoCuentaRef.current) return { estado: "error" }; // bloqueo síncrono e inmediato
    eliminandoCuentaRef.current = true;
    try {
      if (demoActivoRef.current) {
        // No se detiene nada ni se llama a Supabase , la sincronización ya
        // está detenida por el demo de todas formas, y no tiene sentido
        // intentar borrar la cuenta sobre un estado de práctica.
        return { estado: "demo" };
      }
      if (confirmacion !== "ELIMINAR") {
        return { estado: "error" };
      }

      // No se llama flush() , los datos se van a eliminar, no hay nada que
      // valga la pena guardar antes. Se detiene la sincronización para que
      // nunca corra en paralelo con la eliminación.
      if (syncRef.current) {
        syncRef.current.stop();
        syncRef.current = null;
      }

      var invocacion;
      try {
        invocacion = await supabase.functions.invoke("delete-account", {
          body: { confirmation: "ELIMINAR" },
        });
      } catch (excepcion) {
        invocacion = { data: null, error: excepcion };
      }
      var error = invocacion ? invocacion.error : true;
      var data = invocacion ? invocacion.data : null;

      var exito = !error && data && data.ok === true && data.code === "account_deleted";

      if (!exito) {
        // No se limpia localStorage, no se cierra sesión, no se afirma que
        // la cuenta fue eliminada , se restablece la sincronización con
        // exactamente el mismo manejo de estados que ya usa el efecto
        // normal, para no dejar a la persona sin protección de guardado.
        if (userId) {
          syncRef.current = startCloudSync(userId, function (estadoSync) {
            setSyncError(estadoSync === "error");
            setSyncConflicto(estadoSync === "conflicto");
            if (estadoSync === "conflicto") setModalConflictoAbierto(true);
          });
        }
        return { estado: "error" };
      }

      // Confirmado por el servidor: ahora sí se limpia todo local. La
      // sincronización se mantiene detenida (nunca se reinicia).
      clearCleoLocalData();
      try {
        // Únicamente para retirar la sesión local restante , si falla porque
        // la cuenta ya no existe, la eliminación ya confirmada sigue siendo
        // un éxito de todas formas.
        await supabase.auth.signOut({ scope: "local" });
      } catch (e) {}

      setUserId(null);
      setUserEmail(null);
      setEstado("sinSesion");
      return { estado: "ok" };
    } finally {
      eliminandoCuentaRef.current = false;
    }
  }

  async function cerrarSesion() {
    if (cerrandoSesionRef.current) return; // bloqueo síncrono e inmediato, no depende de useState
    cerrandoSesionRef.current = true;
    setCerrandoSesion(true);
    setErrorCierreSesion(null);
    try {
      if (syncRef.current) {
        // Se espera a que CUALQUIER guardado pendiente (incluido lo que haya
        // cambiado mientras esperábamos) quede resuelto antes de continuar.
        var resultadoFlush = await syncRef.current.flush();
        if (resultadoFlush && (resultadoFlush.estado === "error" || resultadoFlush.estado === "conflicto")) {
          // No se toca nada , la sincronización sigue corriendo normal y
          // seguirá reintentando sola en su próximo ciclo.
          setErrorCierreSesion(resultadoFlush.estado);
          return;
        }
      }

      // El guardado ya quedó confirmado. Ahora sí se intenta cerrar sesión ,
      // pero todavía SIN tocar nada local, por si Supabase la rechaza.
      var resultadoSignOut;
      try {
        resultadoSignOut = await supabase.auth.signOut();
      } catch (excepcionSignOut) {
        resultadoSignOut = { error: excepcionSignOut };
      }
      if (resultadoSignOut && resultadoSignOut.error) {
        // supabase-js normalmente devuelve { error } en vez de lanzar , se
        // revisa explícitamente ese campo. La sincronización nunca se detuvo,
        // así que sigue corriendo sola sin que haya que "restablecerla".
        console.error("AuthGate: no se pudo cerrar sesión", resultadoSignOut.error);
        setErrorCierreSesion("signout");
        return;
      }

      // Solo aquí, con el guardado Y el cierre de sesión ya confirmados,
      // se detiene la sincronización y se limpia el caché local de CLEO.
      if (syncRef.current) {
        syncRef.current.stop();
        syncRef.current = null;
      }
      // Se usa la función centralizada (no una lista duplicada aquí) para que
      // también se limpien las claves temporales y la del propietario del
      // caché , así la siguiente cuenta que inicie sesión en este navegador
      // nunca hereda nada de esta.
      clearCleoLocalData();
      // No hace falta redirigir a mano: onAuthStateChange detecta la sesión nula
      // y AuthGate regresa solo a la pantalla de login.
    } finally {
      cerrandoSesionRef.current = false;
      setCerrandoSesion(false);
    }
  }

  function forzarSync() {
    if (demoActivoRef.current) return Promise.resolve({ estado: "demo" }); // no-op durante el modo demo , nunca se sube nada del demo
    if (syncRef.current && syncRef.current.flush) {
      return syncRef.current.flush();
    }
    return Promise.resolve({ estado: "error" });
  }

  // Se llama ANTES de que CLEO cargue cualquier dato de ejemplo. Protege los
  // datos reales en Supabase primero, y solo autoriza el demo si eso quedó
  // confirmado. Nunca modifica ningún dato si algo falla.
  async function onEntrarModoDemo() {
    if (entrandoDemoRef.current) return { estado: "error" }; // bloqueo síncrono e inmediato
    entrandoDemoRef.current = true;
    try {
      if (!syncRef.current) {
        // Sin sincronización activa (por ejemplo, ya en demo o recién montado)
        // no hay nada seguro que confirmar todavía.
        return { estado: "error" };
      }
      if (syncRef.current.hayConflictoPendiente && syncRef.current.hayConflictoPendiente()) {
        return { estado: "conflicto" };
      }
      var resultadoFlush = await syncRef.current.flush();
      // Se exige un resultado EXPLÍCITO de "ok" o "nada" (nada pendiente que
      // guardar) — cualquier otro valor, conocido o no, cancela la entrada
      // al demo. No se asume éxito por descarte.
      var flushConfirmado = resultadoFlush && (resultadoFlush.estado === "ok" || resultadoFlush.estado === "nada");
      if (!flushConfirmado) {
        return { estado: resultadoFlush && resultadoFlush.estado ? resultadoFlush.estado : "error" };
      }

      // El guardado quedó confirmado en Supabase. Ahora sí se crea la marca
      // local de sesión demo (y se verifica que realmente quedó guardada),
      // ANTES de detener la sincronización.
      var marcaCreada = crearDemoSession(userId);
      if (!marcaCreada) {
        return { estado: "error" };
      }

      // Se detiene la sincronización por completo , nada de lo que pase en
      // el demo (ejemplos ni las modificaciones de la persona) debe subir a
      // user_data.
      syncRef.current.stop();
      syncRef.current = null;

      // demo_iniciada se registra AQUÍ, antes de marcarModoDemo(true) , es
      // la única transición que sí debe salir (el propio arranque del
      // demo). A partir de la siguiente línea, analytics queda en
      // silencio mientras el demo siga activo.
      registrarEvento("demo_iniciada", { dispositivo: dispositivoActual() });
      marcarModoDemo(true);
      demoActivoRef.current = true;
      setDemoActivo(true);
      return { estado: "ok" };
    } catch (e) {
      return { estado: "error" };
    } finally {
      entrandoDemoRef.current = false;
    }
  }

  // Sale del modo demo de forma segura: elimina la marca local (y verifica
  // que REALMENTE haya desaparecido, no solo que el intento no lanzó) junto
  // con cualquier residuo temporal exclusivo del demo, y recarga la página
  // solo tras confirmar eso , nunca restaura desde el respaldo local viejo.
  // Al volver a cargar, el flujo normal de pullUserData trae los datos
  // reales desde Supabase, ya confirmados ahí desde antes de entrar al demo.
  async function onSalirModoDemo() {
    if (saliendoDemoRef.current) return { estado: "error" }; // bloqueo síncrono e inmediato
    saliendoDemoRef.current = true;
    try {
      var marcaEliminada = eliminarDemoSession();
      if (!marcaEliminada) {
        // No se recarga sobre un estado ambiguo , el demo sigue activo y la
        // sincronización se mantiene detenida, tal cual estaban.
        saliendoDemoRef.current = false;
        return { estado: "error" };
      }
      // Residuos exclusivos de demo de versiones anteriores , nunca se usan
      // para restaurar nada, solo se limpian si quedaron por ahí. No se
      // tocan CACHE_OWNER_KEY, cleo_demo_session (ya confirmado eliminado) ni
      // respaldos de conflicto.
      try {
        localStorage.removeItem("cleo_demo_backup");
      } catch (e) {}
      try {
        localStorage.removeItem("cleo_demo_productos_loaded_v2");
      } catch (e) {}
      // No se cambia demoActivo aquí a propósito , el efecto que arranca
      // startCloudSync podría alcanzar a dispararse sobre las claves demo
      // antes de que la recarga surta efecto. Se recarga de inmediato, sin
      // ningún estado intermedio, y solo porque la marca ya se confirmó
      // eliminada de verdad.
      window.location.reload();
      return { estado: "ok" };
    } catch (e) {
      saliendoDemoRef.current = false;
      return { estado: "error" };
    }
  }

  async function elegirConservarLocal() {
    if (resolviendoConflictoRef.current) return;
    resolviendoConflictoRef.current = true;
    setEstadoResolucionConflicto("resolviendo");
    try {
      var resultado = await syncRef.current.resolverConflictoConservarLocal();
      if (resultado.estado === "ok") {
        setSyncConflicto(false);
        setModalConflictoAbierto(false);
        setEstadoResolucionConflicto(null);
      } else {
        // "conflicto" (alguien más volvió a cambiar algo justo ahora) o "error":
        // se queda todo bloqueado y visible para poder reintentar.
        setEstadoResolucionConflicto("error");
      }
    } finally {
      resolviendoConflictoRef.current = false;
    }
  }

  async function elegirUsarRemoto() {
    if (resolviendoConflictoRef.current) return;
    resolviendoConflictoRef.current = true;
    setEstadoResolucionConflicto("resolviendo");
    try {
      var resultado = await syncRef.current.resolverConflictoUsarRemoto();
      if (resultado.estado === "ok") {
        // Recién ahora, con todo ya confirmado y escrito localmente, se
        // recarga la interfaz para que CLEO monte con los datos remotos.
        window.location.reload();
      } else {
        setEstadoResolucionConflicto("error");
      }
    } finally {
      resolviendoConflictoRef.current = false;
    }
  }

  function elegirDecidirDespues() {
    // Solo cierra el modal , el conflicto sigue bloqueado, nada se borra ni
    // se sobrescribe, y queda un aviso visible para volver a abrir esto.
    setModalConflictoAbierto(false);
    setEstadoResolucionConflicto(null);
  }

  if (estado === "listo") {
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(CLEO, { onSignOut: cerrarSesion, userEmail: userEmail, userId: userId, syncError: syncError, syncConflicto: syncConflicto, forzarSync: forzarSync, onEntrarModoDemo: onEntrarModoDemo, onSalirModoDemo: onSalirModoDemo, demoActivo: demoActivo, onDeleteAccount: eliminarCuenta }),
      errorCierreSesion &&
        React.createElement(
          "div",
          {
            style: {
              position: "fixed",
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 600,
              background: errorCierreSesion === "conflicto" ? "#7C2D12" : "#1F2937",
              color: "#fff",
              padding: "10px 16px",
              borderRadius: 12,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
              maxWidth: "92vw",
              flexWrap: "wrap",
            },
          },
          React.createElement("span", { style: { fontSize: 14 } }, "⚠️"),
          React.createElement(
            "span",
            null,
            errorCierreSesion === "conflicto"
              ? "No se cerró la sesión: hay cambios de otro dispositivo sin resolver todavía."
              : errorCierreSesion === "signout"
              ? "Se guardó todo correctamente, pero no se pudo cerrar la sesión (revisa tu conexión). Tu información está a salvo — intenta de nuevo."
              : "No se cerró la sesión: no se pudo guardar tu último cambio. Revisa tu conexión e intenta de nuevo."
          ),
          React.createElement(
            "button",
            {
              style: {
                cursor: "pointer",
                background: "rgba(255,255,255,0.2)",
                border: "none",
                borderRadius: 8,
                padding: "3px 10px",
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
              },
              onClick: function () {
                if (errorCierreSesion === "conflicto") {
                  setErrorCierreSesion(null);
                  setModalConflictoAbierto(true);
                } else {
                  cerrarSesion();
                }
              },
            },
            errorCierreSesion === "conflicto" ? "Resolver" : "Reintentar"
          )
        ),
      // Aviso persistente cuando hay un conflicto sin resolver pero la persona
      // eligió "Decidir después" , el modal se cerró, pero esto sigue visible
      // para poder retomarlo, y el guardado automático sigue pausado.
      syncConflicto &&
        !modalConflictoAbierto &&
        !errorCierreSesion &&
        React.createElement(
          "div",
          {
            style: {
              position: "fixed",
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 590,
              background: "#7C2D12",
              color: "#fff",
              padding: "10px 16px",
              borderRadius: 12,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
              maxWidth: "92vw",
              flexWrap: "wrap",
              cursor: "pointer",
            },
            onClick: function () {
              setModalConflictoAbierto(true);
            },
          },
          React.createElement("span", { style: { fontSize: 14 } }, "⚠️"),
          React.createElement(
            "span",
            null,
            "Hay cambios de otro dispositivo sin resolver. Tus datos no se han borrado."
          ),
          React.createElement(
            "button",
            {
              style: {
                cursor: "pointer",
                background: "rgba(255,255,255,0.25)",
                border: "none",
                borderRadius: 8,
                padding: "3px 10px",
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
              },
              onClick: function (ev) {
                ev.stopPropagation();
                setModalConflictoAbierto(true);
              },
            },
            "Decidir ahora"
          )
        ),
      // Modal completo de resolución de conflicto , con las 3 opciones.
      // No se puede cerrar con clic afuera: solo con un botón explícito.
      modalConflictoAbierto &&
        React.createElement(
          "div",
          {
            style: {
              position: "fixed",
              inset: 0,
              zIndex: 700,
              background: "rgba(26,22,53,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            },
          },
          React.createElement(
            "div",
            {
              style: {
                background: "#fff",
                borderRadius: 16,
                padding: 24,
                maxWidth: 440,
                width: "100%",
                boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              },
              onClick: function (ev) {
                ev.stopPropagation();
              },
            },
            React.createElement("div", { style: { fontSize: 28, marginBottom: 12 } }, "⚠️"),
            React.createElement(
              "div",
              { style: { fontSize: 16, fontWeight: 700, color: "#1F2937", marginBottom: 10 } },
              "Encontramos cambios de tu cuenta hechos desde otro dispositivo"
            ),
            React.createElement(
              "div",
              { style: { fontSize: 13.5, color: "#4B5563", lineHeight: 1.6, marginBottom: 20 } },
              "Tus datos no se han borrado. Elige cuál versión quieres conservar."
            ),
            estadoResolucionConflicto === "error" &&
              React.createElement(
                "div",
                {
                  style: {
                    background: "#FEF2F2",
                    border: "1px solid #FCA5A5",
                    color: "#991B1B",
                    borderRadius: 10,
                    padding: "10px 12px",
                    fontSize: 12.5,
                    marginBottom: 16,
                    lineHeight: 1.5,
                  },
                },
                "No pudimos resolverlo todavía. Tus datos siguen protegidos. Revisa tu conexión e intenta nuevamente."
              ),
            React.createElement(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: 8 } },
              React.createElement(
                "button",
                {
                  disabled: estadoResolucionConflicto === "resolviendo",
                  style: {
                    cursor: estadoResolucionConflicto === "resolviendo" ? "default" : "pointer",
                    opacity: estadoResolucionConflicto === "resolviendo" ? 0.6 : 1,
                    padding: "11px 16px",
                    borderRadius: 10,
                    border: "none",
                    background: "#4F46E5",
                    color: "#fff",
                    fontSize: 13.5,
                    fontWeight: 600,
                  },
                  onClick: elegirConservarLocal,
                },
                "Conservar este dispositivo"
              ),
              React.createElement(
                "button",
                {
                  disabled: estadoResolucionConflicto === "resolviendo",
                  style: {
                    cursor: estadoResolucionConflicto === "resolviendo" ? "default" : "pointer",
                    opacity: estadoResolucionConflicto === "resolviendo" ? 0.6 : 1,
                    padding: "11px 16px",
                    borderRadius: 10,
                    border: "1px solid #D1D5DB",
                    background: "#fff",
                    color: "#1F2937",
                    fontSize: 13.5,
                    fontWeight: 600,
                  },
                  onClick: elegirUsarRemoto,
                },
                "Usar la versión de la nube"
              ),
              React.createElement(
                "button",
                {
                  disabled: estadoResolucionConflicto === "resolviendo",
                  style: {
                    cursor: estadoResolucionConflicto === "resolviendo" ? "default" : "pointer",
                    opacity: estadoResolucionConflicto === "resolviendo" ? 0.6 : 1,
                    padding: "9px 16px",
                    borderRadius: 10,
                    border: "none",
                    background: "transparent",
                    color: "#6B7280",
                    fontSize: 13,
                    fontWeight: 500,
                  },
                  onClick: elegirDecidirDespues,
                },
                "Decidir después"
              )
            )
          )
        )
    );
  }

  return React.createElement(
    "div",
    { style: st.page, className: "cleo-auth-page" },
    React.createElement(
      "style",
      null,
      "@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');" +
        ".cleo-auth-brand{padding:44px 40px}" +
        ".cleo-auth-form{padding:44px 48px}" +
        "@media(max-width:640px){" +
        ".cleo-auth-page{padding:0!important}" +
        ".cleo-auth-shell{border-radius:0!important;min-height:100vh!important;box-shadow:none!important}" +
        ".cleo-auth-brand{padding:32px 24px 28px!important;min-height:0!important}" +
        ".cleo-auth-form{padding:32px 24px 40px!important}" +
        ".cleo-auth-greeting{font-size:30px!important}" +
        "}"
    ),
    React.createElement(
      "div",
      { style: st.shell, className: "cleo-auth-shell" },

      React.createElement(
        "div",
        { style: st.brandPanel, className: "cleo-auth-brand" },
        React.createElement(
          "div",
          { style: { position: "relative", zIndex: 1, marginBottom: 28 } },
          React.createElement(
            "div",
            { style: { fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "1px" } },
            "CLEO"
          )
        ),
        React.createElement(
          "div",
          { style: { position: "relative", zIndex: 1 } },
          // Bloque editorial: título en sans-serif grande/grueso (FONT, la
          // misma familia que ya usa el resto de AuthGate , antes usaba
          // 'Caveat' cursiva, un estilo de firma manuscrita que ya no
          // aplica aquí) + párrafo + cierre resaltado en negritas. Mismo
          // fondo/logo/estructura del panel , solo cambia el contenido y la
          // tipografía del título. maxWidth:340 (antes 300) para que las
          // oraciones nuevas, más largas, no fuercen quiebres de línea
          // extraños en pantallas angostas , la media query de abajo
          // (.cleo-auth-greeting) sigue reduciendo el tamaño del título en
          // móvil, responsivo igual que antes.
          React.createElement(
            "div",
            {
              className: "cleo-auth-greeting",
              style: {
                fontFamily: FONT,
                fontSize: 40,
                fontWeight: 800,
                color: "#fff",
                lineHeight: 1.12,
                letterSpacing: "-0.5px",
                marginBottom: 16,
                maxWidth: 340,
              },
            },
            "Vender ya implica recordar demasiado"
          ),
          React.createElement(
            "div",
            {
              style: {
                fontSize: 14,
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.82)",
                maxWidth: 340,
                marginBottom: 22,
              },
            },
            "Con CLEO, sabes a quién contactar, qué necesita seguimiento y qué falta cobrar."
          )
        )
      ),

      React.createElement(
        "div",
        { style: st.formPanel, className: "cleo-auth-form" },
        React.createElement(
          "div",
          { style: st.formInner },
          modo === "recuperar"
            ? React.createElement(
                React.Fragment,
                null,
                React.createElement(
                  "div",
                  { style: { fontSize: 23, fontWeight: 700, color: C.text, marginBottom: 6 } },
                  "Recupera tu contraseña"
                ),
                React.createElement(
                  "div",
                  { style: { fontSize: 13.5, color: C.textMuted, marginBottom: 28, lineHeight: 1.5 } },
                  "Escribe el correo con el que creaste tu cuenta. Te enviaremos un enlace para elegir una contraseña nueva."
                ),
                React.createElement(
                  "form",
                  { onSubmit: solicitarRecuperacion },
                  React.createElement(
                    "div",
                    { style: st.fieldWrap },
                    React.createElement("label", { style: st.label }, "Correo"),
                    React.createElement(
                      "input",
                      Object.assign(
                        {
                          type: "email",
                          autoComplete: "email",
                          placeholder: "tu@correo.com",
                          value: emailRecuperacion,
                          onChange: function (ev) {
                            setEmailRecuperacion(ev.target.value);
                          },
                          style: ring.styleFor("emailRecuperacion"),
                        },
                        ring.bind("emailRecuperacion")
                      )
                    )
                  ),
                  mensajeRecuperacion &&
                    React.createElement(
                      "div",
                      {
                        style: {
                          background: mensajeRecuperacion.tipo === "ok" ? C.purplePale : C.redBg,
                          color: mensajeRecuperacion.tipo === "ok" ? C.purple : C.red,
                          fontSize: 12.5,
                          padding: "9px 12px",
                          borderRadius: 10,
                          marginBottom: 14,
                          lineHeight: 1.4,
                        },
                      },
                      mensajeRecuperacion.texto
                    ),
                  React.createElement(
                    "button",
                    {
                      type: "submit",
                      disabled: enviandoRecuperacion,
                      style: Object.assign({}, st.btnPrimary, { opacity: enviandoRecuperacion ? 0.65 : 1 }),
                    },
                    enviandoRecuperacion ? "Enviando…" : "Enviar enlace"
                  )
                ),
                React.createElement(
                  "div",
                  { style: st.toggleRow },
                  React.createElement(
                    "button",
                    {
                      style: st.btnLink,
                      onClick: function () {
                        cambiarModo("login");
                      },
                    },
                    "Volver a iniciar sesión"
                  )
                )
              )
            : modo === "revisaCorreo"
            ? React.createElement(
                React.Fragment,
                null,
                React.createElement(
                  "div",
                  { style: { fontSize: 40, marginBottom: 14 } },
                  "📩"
                ),
                React.createElement(
                  "div",
                  { style: { fontSize: 23, fontWeight: 700, color: C.text, marginBottom: 6 } },
                  "Revisa tu correo"
                ),
                React.createElement(
                  "div",
                  { style: { fontSize: 13.5, color: C.textMuted, marginBottom: 10, lineHeight: 1.5 } },
                  "Te enviamos un enlace para confirmar tu cuenta de CLEO. Abre el correo y selecciona \u201CConfirmar mi cuenta\u201D para continuar."
                ),
                correoRegistro &&
                  React.createElement(
                    "div",
                    { style: { fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 10 } },
                    correoRegistro
                  ),
                React.createElement(
                  "div",
                  { style: { fontSize: 12.5, color: C.textDim, marginBottom: 24, lineHeight: 1.5 } },
                  "Revisa también spam o correo no deseado."
                ),
                mensajeReenvio &&
                  React.createElement(
                    "div",
                    {
                      style: {
                        background: mensajeReenvio.tipo === "ok" ? C.purplePale : C.redBg,
                        color: mensajeReenvio.tipo === "ok" ? C.purple : C.red,
                        fontSize: 12.5,
                        padding: "9px 12px",
                        borderRadius: 10,
                        marginBottom: 14,
                        lineHeight: 1.4,
                      },
                    },
                    mensajeReenvio.texto
                  ),
                React.createElement(
                  "button",
                  {
                    disabled: reenviandoCorreo,
                    style: Object.assign({}, st.btnPrimary, { opacity: reenviandoCorreo ? 0.65 : 1 }),
                    onClick: reenviarCorreoConfirmacion,
                  },
                  reenviandoCorreo ? "Enviando…" : "Reenviar correo"
                ),
                React.createElement(
                  "div",
                  { style: Object.assign({}, st.toggleRow, { flexDirection: "column", gap: 8, marginTop: 18 }) },
                  React.createElement(
                    "button",
                    {
                      style: st.btnLink,
                      onClick: function () {
                        setPassword("");
                        setConfirmarPasswordRegistro("");
                        setMensajeReenvio(null);
                        setCorreoRegistro("");
                        setModo("signup");
                      },
                    },
                    "Usar otro correo"
                  ),
                  React.createElement(
                    "button",
                    {
                      style: st.btnLink,
                      onClick: function () {
                        setMensajeReenvio(null);
                        cambiarModo("login");
                      },
                    },
                    "Volver a iniciar sesión"
                  )
                )
              )
            : React.createElement(
                React.Fragment,
                null,
          React.createElement(
            "div",
            {
              style: {
                fontSize: 23,
                fontWeight: 700,
                color: C.text,
                marginBottom: 6,
              },
            },
            modo === "login" ? "Vuelve a tu negocio" : "Crea tu cuenta"
          ),
          React.createElement(
            "div",
            {
              style: {
                fontSize: 13.5,
                color: C.textMuted,
                marginBottom: 28,
              },
            },
            modo === "login"
              ? "Inicia sesión para continuar donde lo dejaste."
              : "Regístrate para empezar a organizar tu negocio."
          ),

          React.createElement(
            "form",
            { onSubmit: manejarSubmit },

            React.createElement(
              "div",
              { style: st.fieldWrap },
              React.createElement("label", { style: st.label }, "Correo"),
              React.createElement(
                "input",
                Object.assign(
                  {
                    type: "email",
                    autoComplete: "email",
                    placeholder: "tu@correo.com",
                    value: email,
                    onChange: function (ev) {
                      setEmail(ev.target.value);
                    },
                    style: ring.styleFor("email"),
                  },
                  ring.bind("email")
                )
              )
            ),

            React.createElement(
              "div",
              { style: st.fieldWrap },
              React.createElement("label", { style: st.label }, "Contraseña"),
              React.createElement(
                "div",
                { style: { position: "relative" } },
                React.createElement(
                  "input",
                  Object.assign(
                    {
                      type: verPassword ? "text" : "password",
                      autoComplete:
                        modo === "login"
                          ? "current-password"
                          : "new-password",
                      placeholder: "••••••••",
                      value: password,
                      onChange: function (ev) {
                        setPassword(ev.target.value);
                      },
                      style: Object.assign({}, ring.styleFor("password"), {
                        paddingRight: 44,
                      }),
                    },
                    ring.bind("password")
                  )
                ),
                React.createElement(
                  "button",
                  {
                    type: "button",
                    onClick: function () {
                      setVerPassword(!verPassword);
                    },
                    "aria-label": verPassword
                      ? "Ocultar contraseña"
                      : "Mostrar contraseña",
                    style: {
                      position: "absolute",
                      right: 6,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: C.textDim,
                      padding: 6,
                    },
                  },
                  verPassword
                    ? React.createElement(
                        "svg",
                        {
                          width: 18,
                          height: 18,
                          viewBox: "0 0 24 24",
                          fill: "none",
                        },
                        React.createElement("path", {
                          d: "M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 4.24A9.77 9.77 0 0112 4c5 0 9 4 10 8-.31 1.2-.89 2.36-1.68 3.38M6.61 6.61C4.6 8 3.13 9.9 2 12c1 4 5 8 10 8 1.4 0 2.73-.28 3.94-.79",
                          stroke: "currentColor",
                          strokeWidth: 1.7,
                          strokeLinecap: "round",
                          strokeLinejoin: "round",
                        })
                      )
                    : React.createElement(
                        "svg",
                        {
                          width: 18,
                          height: 18,
                          viewBox: "0 0 24 24",
                          fill: "none",
                        },
                        React.createElement("path", {
                          d: "M2 12c1-4 5-8 10-8s9 4 10 8c-1 4-5 8-10 8s-9-4-10-8z",
                          stroke: "currentColor",
                          strokeWidth: 1.7,
                          strokeLinecap: "round",
                          strokeLinejoin: "round",
                        }),
                        React.createElement("circle", {
                          cx: 12,
                          cy: 12,
                          r: 3,
                          stroke: "currentColor",
                          strokeWidth: 1.7,
                        })
                      )
                )
              )
            ),

            modo === "signup" &&
              React.createElement(
                "div",
                { style: st.fieldWrap },
                React.createElement("label", { style: st.label }, "Confirmar contraseña"),
                React.createElement(
                  "div",
                  { style: { position: "relative" } },
                  React.createElement("input", {
                    type: verConfirmarPasswordRegistro ? "text" : "password",
                    autoComplete: "new-password",
                    placeholder: "••••••••",
                    value: confirmarPasswordRegistro,
                    onChange: function (ev) {
                      setConfirmarPasswordRegistro(ev.target.value);
                    },
                    style: Object.assign({}, st.input, { paddingRight: 44 }),
                  }),
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      onClick: function () {
                        setVerConfirmarPasswordRegistro(!verConfirmarPasswordRegistro);
                      },
                      "aria-label": verConfirmarPasswordRegistro ? "Ocultar contraseña" : "Mostrar contraseña",
                      style: {
                        position: "absolute",
                        right: 6,
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: C.textDim,
                        padding: 6,
                      },
                    },
                    iconoOjoSvg(verConfirmarPasswordRegistro)
                  )
                )
              ),

            // La casilla de consentimiento que antes vivía aquí (con enlaces
            // a Términos/Privacidad) se eliminó , no escribía nada en
            // Supabase, así que solo duplicaba la pregunta real que ya hace,
            // una única vez, la pantalla obligatoria post-autenticación
            // ("requiereAceptacionLegal") tanto para correo/contraseña como
            // para Google. Ver el bloque "Consentimiento legal" más arriba.

            modo === "login" &&
              React.createElement(
                "div",
                { style: { textAlign: "right", marginBottom: 14, marginTop: -8 } },
                React.createElement(
                  "button",
                  {
                    type: "button",
                    style: Object.assign({}, st.btnLink, { fontSize: 12.5 }),
                    onClick: function () {
                      setEmailRecuperacion(email);
                      cambiarModo("recuperar");
                    },
                  },
                  "¿Olvidaste tu contraseña?"
                )
              ),

            error &&
              React.createElement(
                "div",
                {
                  style: {
                    background: C.redBg,
                    color: C.red,
                    fontSize: 12.5,
                    padding: "9px 12px",
                    borderRadius: 10,
                    marginBottom: 14,
                    lineHeight: 1.4,
                  },
                },
                error
              ),

            avisoSignup &&
              React.createElement(
                "div",
                {
                  style: {
                    background: C.purplePale,
                    color: C.purple,
                    fontSize: 12.5,
                    padding: "9px 12px",
                    borderRadius: 10,
                    marginBottom: 14,
                    lineHeight: 1.4,
                  },
                },
                avisoSignup
              ),

            React.createElement(
              "button",
              {
                type: "submit",
                disabled: cargandoForm,
                style: Object.assign({}, st.btnPrimary, {
                  opacity: cargandoForm ? 0.65 : 1,
                }),
              },
              cargandoForm
                ? "Un momento…"
                : modo === "login"
                ? "Entrar"
                : "Crear cuenta"
            )
          ),

          React.createElement(
            "div",
            { style: { display: "flex", alignItems: "center", gap: 10, margin: "18px 0" } },
            React.createElement("div", { style: { flex: 1, height: 1, background: C.border } }),
            React.createElement("span", { style: { fontSize: 12, color: C.textDim } }, "o"),
            React.createElement("div", { style: { flex: 1, height: 1, background: C.border } })
          ),
          React.createElement(
            "button",
            {
              type: "button",
              disabled: iniciandoGoogle,
              "aria-label": "Continuar con Google",
              onClick: iniciarConGoogle,
              style: {
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "13px",
                borderRadius: 12,
                border: "1px solid " + C.border,
                background: "#fff",
                color: "#1F2937",
                fontSize: 14.5,
                fontWeight: 600,
                cursor: iniciandoGoogle ? "default" : "pointer",
                opacity: iniciandoGoogle ? 0.65 : 1,
              },
            },
            !iniciandoGoogle && iconoGoogleSvg(),
            iniciandoGoogle ? "Conectando con Google…" : "Continuar con Google"
          ),

          React.createElement(
            "div",
            { style: st.toggleRow },
            React.createElement(
              "span",
              null,
              modo === "login" ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"
            ),
            React.createElement(
              "button",
              {
                style: st.btnLink,
                onClick: function () {
                  cambiarModo(modo === "login" ? "signup" : "login");
                },
              },
              modo === "login" ? "Regístrate" : "Inicia sesión"
            )
          )
        )
        )
      )
    )
  );
}

