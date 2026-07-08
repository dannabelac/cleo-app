import { supabase } from "./supabaseClient";

// Única lista de claves que CLEO.jsx guarda en localStorage.
// pull y push usan exactamente esta misma lista para no desincronizarse entre sí.
export var CLEO_KEYS = [
  "cleo_clientes",
  "cleo_cots",
  "cleo_ventas",
  "cleo_servicios",
  "cleo_pedidos",
  "cleo_productos",
  "cleo_productos_cat",
  "cleo_perfil",
  "cleo_tipo_perfil",
  "cleo_alertas_cerradas",
  "cleo_etapas_vistas",
];

function leerSnapshotLocalStorage() {
  var snap = {};
  CLEO_KEYS.forEach(function (key) {
    var raw = null;
    try {
      raw = localStorage.getItem(key);
    } catch (e) {
      raw = null;
    }
    if (raw === null) return;
    try {
      snap[key] = JSON.parse(raw);
    } catch (e) {
      // Si no es JSON válido (no debería pasar con las claves de CLEO), se ignora.
    }
  });
  return snap;
}

function escribirSnapshotLocalStorage(data) {
  CLEO_KEYS.forEach(function (key) {
    if (!(key in data)) return;
    try {
      localStorage.setItem(key, JSON.stringify(data[key]));
    } catch (e) {}
  });
}

// ── PULL ──────────────────────────────────────────────────────────────────
// Trae el estado guardado en Supabase y lo escribe en localStorage ANTES de
// montar <CLEO/>, para que sus useState(() => lsGet(...)) lo lean ya listo.
// Devuelve true si había datos guardados, false si el usuario es nuevo.
export async function pullUserData(userId) {
  var res = await supabase
    .from("user_data")
    .select("data, tipo_perfil")
    .eq("user_id", userId)
    .maybeSingle();

  if (res.error) {
    console.error("cloudSync: error al leer user_data", res.error);
    return false;
  }

  var fila = res.data;
  if (!fila || !fila.data) return false;

  escribirSnapshotLocalStorage(fila.data);

  // tipo_perfil (columna) es la fuente de verdad, pisa lo que traiga el blob.
  if (fila.tipo_perfil) {
    try {
      localStorage.setItem("cleo_tipo_perfil", JSON.stringify(fila.tipo_perfil));
      var perfilRaw = localStorage.getItem("cleo_perfil");
      var perfil = perfilRaw ? JSON.parse(perfilRaw) : {};
      perfil.tipoPerfil = fila.tipo_perfil;
      localStorage.setItem("cleo_perfil", JSON.stringify(perfil));
    } catch (e) {}
  }

  return true;
}

// ── PUSH ──────────────────────────────────────────────────────────────────
// Sincroniza localStorage -> user_data cada 5s, más flush en beforeunload y
// al ocultarse la pestaña. Devuelve { stop } para cortar la sincronización.
export function startCloudSync(userId) {
  var ultimoEnviado = "";
  var enVuelo = false;

  function tipoPerfilActual() {
    try {
      var perfilRaw = localStorage.getItem("cleo_perfil");
      if (perfilRaw) {
        var perfil = JSON.parse(perfilRaw);
        if (perfil && perfil.tipoPerfil) return perfil.tipoPerfil;
      }
    } catch (e) {}
    return null;
  }

  function sincronizar() {
    if (enVuelo) return;
    var snap = leerSnapshotLocalStorage();
    var serializado = JSON.stringify(snap);
    if (serializado === ultimoEnviado) return; // nada cambió, no gastamos llamada

    enVuelo = true;
    supabase
      .from("user_data")
      .upsert(
        {
          user_id: userId,
          data: snap,
          tipo_perfil: tipoPerfilActual(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .then(function (res) {
        enVuelo = false;
        if (res.error) {
          console.error("cloudSync: error al guardar user_data", res.error);
          return;
        }
        ultimoEnviado = serializado;
      })
      .catch(function (err) {
        enVuelo = false;
        console.error("cloudSync: excepción al guardar user_data", err);
      });
  }

  var intervalId = setInterval(sincronizar, 5000);

  function flush() {
    sincronizar();
  }

  function alOcultarse() {
    if (document.visibilityState === "hidden") flush();
  }

  document.addEventListener("visibilitychange", alOcultarse);
  window.addEventListener("beforeunload", flush);

  return {
    stop: function () {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", alOcultarse);
      window.removeEventListener("beforeunload", flush);
    },
  };
}
