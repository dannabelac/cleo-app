import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { pullUserData, startCloudSync, CLEO_KEYS } from "./cloudSync";
import CLEO from "./CLEO.jsx";

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
  "'Inter','Segoe UI',-apple-system,BlinkMacSystemFont,Arial,sans-serif";

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
    fontSize: 14.5,
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
  var s11 = useState(false);
  var syncError = s11[0];
  var setSyncError = s11[1];
  var ring = useFocusRing();

  useEffect(function () {
    var activo = true;

    function detenerSync() {
      if (syncRef.current) {
        syncRef.current.stop();
        syncRef.current = null;
      }
    }

    async function manejarSesion(session) {
      if (!session) {
        detenerSync();
        if (!activo) return;
        setUserId(null);
        setUserEmail(null);
        setEstado("sinSesion");
        return;
      }

      setEstado("sincronizando");
      try {
        await Promise.race([
          pullUserData(session.user.id),
          new Promise(function (resolve) {
            setTimeout(resolve, 8000);
          }),
        ]);
      } catch (e) {}
      if (!activo) return;

      setUserId(session.user.id);
      setUserEmail(session.user.email || null);
      setEstado("listo");
    }

    supabase.auth.getSession().then(function (res) {
      if (!activo) return;
      manejarSesion(res.data.session);
    });

    var sub = supabase.auth.onAuthStateChange(function (_event, session) {
      if (!activo) return;
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
      manejarSesion(session);
    });
    var listener = sub.data;

    return function () {
      activo = false;
      listener.subscription.unsubscribe();
      detenerSync();
    };
  }, []);

  // Arranca la sincronización en segundo plano solo cuando ya montamos CLEO.
  useEffect(function () {
    if (estado !== "listo" || !userId) return;
    syncRef.current = startCloudSync(userId, function (estadoSync) {
      setSyncError(estadoSync === "error");
    });
    return function () {
      if (syncRef.current) {
        syncRef.current.stop();
        syncRef.current = null;
      }
    };
  }, [estado, userId]);

  function cambiarModo(nuevoModo) {
    setModo(nuevoModo);
    setError("");
    setAvisoSignup("");
  }

  function traducirError(msg) {
    if (/Invalid login credentials/i.test(msg))
      return "Correo o contraseña incorrectos.";
    if (/User already registered/i.test(msg))
      return "Ya existe una cuenta con este correo. Inicia sesión.";
    if (/Password should be at least/i.test(msg))
      return "La contraseña debe tener al menos 6 caracteres.";
    if (/Unable to validate email/i.test(msg))
      return "Ese correo no parece válido.";
    return msg;
  }

  function manejarSubmit(ev) {
    ev.preventDefault();
    setError("");
    setAvisoSignup("");

    if (!email.trim() || !password) {
      setError("Escribe tu correo y contraseña.");
      return;
    }

    setCargandoForm(true);

    var accion =
      modo === "login"
        ? supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password,
          })
        : supabase.auth.signUp({ email: email.trim(), password: password });

    accion
      .then(function (res) {
        setCargandoForm(false);
        if (res.error) {
          setError(traducirError(res.error.message));
          return;
        }
        if (modo === "signup" && !res.data.session) {
          setAvisoSignup(
            "Cuenta creada. Revisa tu correo para confirmarla antes de entrar."
          );
        }
      })
      .catch(function () {
        setCargandoForm(false);
        setError("No se pudo conectar. Revisa tu internet e intenta de nuevo.");
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

  function cerrarSesion() {
    if (syncRef.current) {
      syncRef.current.stop();
      syncRef.current = null;
    }
    CLEO_KEYS.forEach(function (key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    });
    supabase.auth.signOut();
    // No hace falta redirigir a mano: onAuthStateChange detecta la sesión nula
    // y AuthGate regresa solo a la pantalla de login.
  }

  function forzarSync() {
    if (syncRef.current && syncRef.current.flush) {
      syncRef.current.flush();
    }
  }

  if (estado === "listo") {
    return React.createElement(CLEO, { onSignOut: cerrarSesion, userEmail: userEmail, syncError: syncError, forzarSync: forzarSync });
  }

  return React.createElement(
    "div",
    { style: st.page, className: "cleo-auth-page" },
    React.createElement(
      "style",
      null,
      "@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap');" +
        ".cleo-auth-brand{padding:44px 40px}" +
        ".cleo-auth-form{padding:44px 48px}" +
        "@media(max-width:640px){" +
        ".cleo-auth-page{padding:0!important}" +
        ".cleo-auth-shell{border-radius:0!important;min-height:100vh!important;box-shadow:none!important}" +
        ".cleo-auth-brand{padding:32px 24px 28px!important;min-height:0!important}" +
        ".cleo-auth-form{padding:32px 24px 40px!important}" +
        ".cleo-auth-greeting{font-size:34px!important}" +
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
          React.createElement(
            "div",
            {
              className: "cleo-auth-greeting",
              style: {
                fontFamily: "'Caveat',cursive",
                fontSize: 44,
                fontWeight: 700,
                color: "#fff",
                lineHeight: 1.1,
                marginBottom: 16,
              },
            },
            "Hecho para",
            React.createElement("br", null),
            "emprendedores como tú."
          ),
          React.createElement(
            "div",
            {
              style: {
                fontSize: 14,
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.82)",
                maxWidth: 300,
                marginBottom: 22,
              },
            },
            "Emprender ya es suficientemente difícil. CLEO te ayuda a organizar tu negocio, recordar lo importante y tener claridad sobre qué hacer para hacerlo crecer."
          )
        ),
        React.createElement(
          "div",
          {
            style: {
              position: "relative",
              zIndex: 1,
              fontSize: 13,
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.5,
              maxWidth: 300,
              marginTop: "auto",
            },
          },
          "No tienes que emprender solo. ",
          React.createElement("b", { style: { color: "#fff" } }, "CLEO está contigo.")
        )
      ),

      React.createElement(
        "div",
        { style: st.formPanel, className: "cleo-auth-form" },
        React.createElement(
          "div",
          { style: st.formInner },
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
            "Hola, emprendedor"
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
  );
}
