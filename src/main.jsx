import React from "react";
import ReactDOM from "react-dom/client";
import AuthGate from "./AuthGate.jsx";
import { inicializarSentry } from "./sentry.js";

inicializarSentry();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>
);
