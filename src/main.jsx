import React from "react";
import ReactDOM from "react-dom/client";
import AuthGate from "./AuthGate.jsx";
import { inicializarSentry } from "./sentry.js";
import { inicializarAnalytics } from "./analytics.js";

inicializarSentry();
inicializarAnalytics();

// Service worker: solo en producción (nunca en `npm run dev`, rompería el
// hot-reload de Vite — ver public/sw.js para lo que sí/no cachea).
// Se registra después de que la app ya cargó (evento "load"), para no
// competir por ancho de banda con el primer render.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function (err) {
      console.error("CLEO: no se pudo registrar el service worker", err);
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>
);
