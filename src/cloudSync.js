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
  "cleo_data_version",
  "cleo_streak_accion_prod",
  "cleo_streak_accion_serv",
];

// Claves locales/temporales de CLEO — nunca se sincronizan a Supabase, pero sí
// deben limpiarse al cambiar de cuenta o cerrar sesión, para no dejar estado
// de una cuenta contaminando la siguiente en el mismo navegador.
export var CLEO_TEMP_KEYS = [
  "cleo_celebracion_pendiente", // modal de celebración pendiente de mostrar
  "cleo_demo_backup", // heredado de versiones anteriores — ya NO se usa para restaurar nada, solo se limpia como residuo si existe
  "cleo_demo_productos_loaded_v2", // bandera de datos demo ya cargados
  "cleo_conflict_backup", // respaldo del snapshot local que provocó un conflicto sin resolver
  "cleo_demo_session", // marca de que hay una sesión de modo demo aislada activa
];

// Marca la existencia de una sesión de modo demo activa, aislada de los
// datos reales. La fuente real de restauración al salir del demo es
// Supabase (ya confirmado con flush() antes de entrar) — esta marca NUNCA
// contiene tokens, contraseñas ni datos del negocio, solo metadatos mínimos.
export var DEMO_SESSION_KEY = "cleo_demo_session";

// Clave donde se guarda el snapshot local que provocó un conflicto de
// sincronización, junto con la fecha y el userId, para no perderlo mientras
// la persona decide qué versión conservar.
export var CONFLICT_BACKUP_KEY = "cleo_conflict_backup";

// Identifica a qué cuenta pertenece el caché local actual. Se usa para
// detectar cuando una cuenta distinta a la que dejó los datos anteriores
// inicia sesión en el mismo navegador.
export var CACHE_OWNER_KEY = "cleo_cache_owner_user_id";

// Borra exclusivamente las claves de CLEO (nunca localStorage.clear(), para no
// afectar otras apps que pudieran compartir el mismo dominio).
export function clearCleoLocalData() {
  CLEO_KEYS.forEach(function (key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  });
  CLEO_TEMP_KEYS.forEach(function (key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  });
  try {
    localStorage.removeItem(CACHE_OWNER_KEY);
  } catch (e) {}
}

// Lee el respaldo de conflicto guardado y lo valida a fondo antes de
// considerarlo un conflicto ACTIVO real:
// - debe existir y ser JSON válido (si está dañado, se ignora sin más);
// - debe pertenecer a la MISMA cuenta que inicia sesión ahora (nunca se
//   mezcla el conflicto de una cuenta con otra);
// - debe tener un snapshot con forma de objeto (nunca null/vacío/corrupto);
// - solo cuenta como pendiente si estado==="pendiente" — un respaldo ya
//   marcado como "resuelto" es solo historial, no debe volver a bloquear
//   nada ni reabrir el modal.
// Si cualquiera de estas condiciones falla, devuelve null , nunca provoca
// un ciclo ni una restauración a medias.
function leerConflictoBackupValido(userId) {
  var raw;
  try {
    raw = localStorage.getItem(CONFLICT_BACKUP_KEY);
  } catch (e) {
    return null;
  }
  if (!raw) return null;
  var backup;
  try {
    backup = JSON.parse(raw);
  } catch (e) {
    return null; // dañado / no es JSON válido
  }
  if (!backup || typeof backup !== "object") return null;
  if (backup.userId !== userId) return null; // pertenece a otra cuenta
  if (backup.estado !== "pendiente") return null; // ya resuelto, o histórico
  if (!backup.snapshot || typeof backup.snapshot !== "object") return null;
  return backup;
}

// Crea la marca y vuelve a leerla para confirmar que REALMENTE quedó
// guardada tal cual se esperaba (no solo que setItem no lanzó). Si algo no
// coincide, se elimina cualquier marca parcial y se devuelve false , nunca
// se deja una marca a medias que pudiera confundirse con una válida.
export function crearDemoSession(userId) {
  var marca = { version: 1, estado: "activo", userId: userId, createdAt: new Date().toISOString() };
  try {
    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(marca));
  } catch (e) {
    return false;
  }
  var relectura;
  try {
    relectura = JSON.parse(localStorage.getItem(DEMO_SESSION_KEY));
  } catch (e) {
    relectura = null;
  }
  var quedoBien =
    relectura &&
    typeof relectura === "object" &&
    relectura.estado === "activo" &&
    relectura.version === 1 &&
    relectura.userId === userId;
  if (!quedoBien) {
    try {
      localStorage.removeItem(DEMO_SESSION_KEY);
    } catch (e) {}
    return false;
  }
  return true;
}

// Devuelve true SOLO si, después de intentar eliminar la marca, la clave
// realmente ya no existe , nunca se asume éxito solo porque removeItem no
// lanzó una excepción.
export function eliminarDemoSession() {
  try {
    localStorage.removeItem(DEMO_SESSION_KEY);
  } catch (e) {
    return false;
  }
  try {
    return localStorage.getItem(DEMO_SESSION_KEY) === null;
  } catch (e) {
    return false;
  }
}

// Una sesión demo solo se considera válida si TODAS estas condiciones se
// cumplen: la marca existe y es JSON válido, su estado es "activo", su
// userId coincide con la cuenta actual, CACHE_OWNER_KEY también coincide
// con esa misma cuenta, Y ADEMÁS el perfil local realmente tiene
// modoDemo===true. Esta última comprobación es necesaria porque la marca se
// crea ANTES de que CLEO termine de cargar los datos demo , si la página se
// cerró o refrescó justo en ese instante, la marca podría existir sin que el
// demo haya llegado a activarse de verdad en el perfil. Si cualquiera de
// estas falla, nunca se confía en ella.
export function leerDemoSessionValida(userId) {
  var raw;
  try {
    raw = localStorage.getItem(DEMO_SESSION_KEY);
  } catch (e) {
    return null;
  }
  if (!raw) return null;
  var marca;
  try {
    marca = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (!marca || typeof marca !== "object") return null;
  if (marca.estado !== "activo") return null;
  if (marca.userId !== userId) return null;
  var duenioActual;
  try {
    duenioActual = localStorage.getItem(CACHE_OWNER_KEY);
  } catch (e) {
    duenioActual = null;
  }
  if (duenioActual !== userId) return null;

  var perfilRaw;
  try {
    perfilRaw = localStorage.getItem("cleo_perfil");
  } catch (e) {
    return null;
  }
  if (!perfilRaw) return null;
  var perfil;
  try {
    perfil = JSON.parse(perfilRaw);
  } catch (e) {
    return null;
  }
  if (!perfil || typeof perfil !== "object") return null;
  if (perfil.modoDemo !== true) return null;

  return marca;
}

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
    // Se relanza como excepción real (en vez de solo devolver false), para que
    // quien llama pueda distinguir "cuenta nueva sin datos todavía" de
    // "hubo un error de verdad" y no monte la app con datos vacíos por error.
    // Importante: no se toca nada local en este punto.
    throw res.error;
  }

  var duenioActual = null;
  try {
    duenioActual = localStorage.getItem(CACHE_OWNER_KEY);
  } catch (e) {}

  var esOtraCuenta = !!duenioActual && duenioActual !== userId;

  if (esOtraCuenta) {
    // El caché local pertenece a otra cuenta distinta a la que acaba de
    // iniciar sesión en este navegador — se limpia todo antes de continuar,
    // para no heredar ni mezclar información entre cuentas.
    clearCleoLocalData();
  }

  // Si hay un conflicto sin resolver para ESTA MISMA cuenta (persistido de una
  // sesión anterior, ya validado a fondo), no se reemplazan las claves locales
  // con la versión remota — eso podría descartar en silencio una de las 2
  // versiones antes de que la persona elija. Esta comprobación va ANTES de la
  // regla de "caché sin propietario" de abajo, porque un conflicto válido sí
  // contiene información real que no debemos perder. El modal de conflicto se
  // encargará de reabrirse (vía startCloudSync) para resolverlo primero.
  if (leerConflictoBackupValido(userId)) {
    try {
      localStorage.setItem(CACHE_OWNER_KEY, userId);
    } catch (e) {}
    return false;
  }

  // Caché sin ningún propietario registrado (nunca se le asignó
  // CACHE_OWNER_KEY). Ya NO se trata como "posiblemente una instalación
  // anterior legítima que conviene no tocar" — un caso real de contaminación
  // mostró que esto puede ser cualquier cosa ajena a esta cuenta: datos de
  // ejemplo viejos, una sesión de otra persona en un navegador compartido,
  // restos de antes de que existiera esta protección. Se considera huérfano
  // y no confiable, y se limpia por seguridad, exista o no fila remota más
  // abajo — nunca se hereda en silencio hacia una cuenta nueva.
  if (!duenioActual) {
    clearCleoLocalData();
  }

  var fila = res.data;

  if (!fila || !fila.data) {
    // Sin fila remota para esta cuenta.
    // - Si esOtraCuenta, o si el caché no tenía propietario, ya se limpió
    //   arriba — la cuenta simplemente inicia vacía.
    // - Si duenioActual === userId (misma cuenta reconectando), no se toca
    //   nada local: podrían ser cambios reales aún no sincronizados, y
    //   borrarlos aquí arriesgaría perderlos sin necesidad.
    try {
      localStorage.setItem(CACHE_OWNER_KEY, userId);
    } catch (e) {}
    return false;
  }

  // Sí hay fila remota: la nube es la fuente de verdad para esta cuenta.
  // Se limpian primero las claves sincronizables locales, así ninguna clave
  // vieja que ya no exista en el snapshot remoto queda mezclada con la
  // cuenta actual.
  CLEO_KEYS.forEach(function (key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  });
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

  try {
    localStorage.setItem(CACHE_OWNER_KEY, userId);
  } catch (e) {}

  return true;
}

// ── PUSH ──────────────────────────────────────────────────────────────────
// Sincroniza localStorage -> user_data cada 5s, más flush en beforeunload y
// al ocultarse la pestaña. Devuelve { stop } para cortar la sincronización.
export function startCloudSync(userId, onEstadoCambia) {
  var ultimoEnviado = "";
  var enVueloPromise = null; // promesa del guardado actualmente en curso, o null si no hay ninguno
  // Cuando hay un conflicto sin resolver, se guarda aquí (en memoria) el
  // snapshot local que lo provocó, junto con cuándo pasó. Mientras esto no
  // sea null, la sincronización automática queda pausada por completo , no
  // se reintenta cada 5s ni se sobrescribe nada hasta que la persona elija.
  // Si ya existía un conflicto pendiente y válido de una sesión anterior
  // (misma cuenta, respaldo con forma correcta), se restaura de inmediato ,
  // así el conflicto sobrevive a una recarga, cierre del navegador, o
  // reinicio de CLEO, en vez de perderse silenciosamente.
  var conflictoPendiente = leerConflictoBackupValido(userId);
  var resolviendoConflicto = false; // evita resoluciones dobles/paralelas dentro de este módulo
  // Se guarda el "updated_at" que vimos la última vez que leímos o escribimos
  // la fila en Supabase. Sirve para detectar si otro dispositivo (con la misma
  // cuenta) cambió algo mientras tanto, antes de arriesgarnos a sobrescribirlo.
  var ultimoUpdatedAt = null;
  var baselineLista = false;

  function avisar(estado) {
    if (typeof onEstadoCambia === "function") {
      try {
        onEstadoCambia(estado);
      } catch (e) {}
    }
  }

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

  function establecerBaseline(intentosRestantes) {
    if (intentosRestantes === undefined) intentosRestantes = 3;
    return supabase
      .from("user_data")
      .select("updated_at")
      .eq("user_id", userId)
      .maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        if (res.data) ultimoUpdatedAt = res.data.updated_at;
        baselineLista = true;
        return { estado: "ok" };
      })
      .catch(function (err) {
        if (intentosRestantes > 1) {
          // Reintenta un par de veces ante un hipo de red real, en vez de
          // rendirse de inmediato y arrancar sin protección contra choques.
          return new Promise(function (resolve) {
            setTimeout(resolve, 1500);
          }).then(function () {
            return establecerBaseline(intentosRestantes - 1);
          });
        }
        // Fallo final: NUNCA se marca baselineLista=true aquí. Sin baseline
        // confirmada, no sabemos el estado remoto real , seguir adelante
        // arriesgaría un upsert a ciegas que sobrescriba lo que haya en la nube.
        console.error("cloudSync: no se pudo establecer el baseline tras varios intentos", err);
        baselineLista = false;
        avisar("error");
        return { estado: "error" };
      });
  }

  // Único punto de entrada para obtener (o reintentar) la baseline. Si ya
  // está confirmada, resuelve de inmediato. Si ya hay un intento en marcha,
  // reutiliza esa misma promesa (nunca 2 peticiones de baseline en paralelo).
  // Si el intento anterior ya terminó (con éxito o fallo final), queda libre
  // para que la próxima llamada dispare un intento nuevo , así una falla no
  // deja el estado atorado para siempre, y basta con que vuelva la conexión
  // (sin recargar la página) para que el siguiente ciclo o "Reintentar" lo
  // resuelva solo.
  var baselineEnCursoPromise = null;
  function obtenerBaseline() {
    if (baselineLista) return Promise.resolve({ estado: "ok" });
    if (baselineEnCursoPromise) return baselineEnCursoPromise;
    baselineEnCursoPromise = establecerBaseline().then(function (resultado) {
      baselineEnCursoPromise = null;
      return resultado;
    });
    return baselineEnCursoPromise;
  }

  // Hace EXACTAMENTE un intento de guardado (o un no-op si nada cambió desde
  // el último envío exitoso), y siempre resuelve con un estado explícito , 
  // nunca lanza, para que quien la llame pueda decidir qué hacer.
  function intentarGuardar() {
    if (!baselineLista) return Promise.resolve({ estado: "nada" });
    var snap = leerSnapshotLocalStorage();
    var serializado = JSON.stringify(snap);
    if (serializado === ultimoEnviado) return Promise.resolve({ estado: "nada" });

    var nuevaFecha = new Date().toISOString();
    var payload = {
      data: snap,
      tipo_perfil: tipoPerfilActual(),
      updated_at: nuevaFecha,
    };

    // Si ya conocemos un updated_at previo, escribimos condicionado a que siga
    // siendo el mismo (nadie más lo tocó desde otro dispositivo). Si es la
    // primera vez que esta cuenta guarda algo, no hay nada que comparar todavía.
    var accion = ultimoUpdatedAt
      ? supabase
          .from("user_data")
          .update(payload)
          .eq("user_id", userId)
          .eq("updated_at", ultimoUpdatedAt)
          .select("updated_at")
      : supabase
          .from("user_data")
          .upsert(Object.assign({ user_id: userId }, payload), { onConflict: "user_id" })
          .select("updated_at");

    return accion
      .then(function (res) {
        if (res.error) {
          console.error("cloudSync: error al guardar user_data", res.error);
          avisar("error");
          return { estado: "error" };
        }
        if (ultimoUpdatedAt && (!res.data || res.data.length === 0)) {
          // 0 filas afectadas: otro dispositivo con la misma cuenta ya guardó
          // algo distinto mientras tanto. No sobrescribimos a ciegas , se
          // guarda el snapshot que provocó esto y se pausa todo lo automático.
          conflictoPendiente = { snapshot: snap, fecha: nuevaFecha, userId: userId, estado: "pendiente" };
          try {
            localStorage.setItem(CONFLICT_BACKUP_KEY, JSON.stringify(conflictoPendiente));
          } catch (e) {}
          avisar("conflicto");
          return { estado: "conflicto" };
        }
        ultimoEnviado = serializado;
        ultimoUpdatedAt = res.data && res.data[0] ? res.data[0].updated_at : nuevaFecha;
        avisar("ok");
        return { estado: "ok" };
      })
      .catch(function (err) {
        console.error("cloudSync: excepción al guardar user_data", err);
        avisar("error");
        return { estado: "error" };
      });
  }

  // Punto de entrada normal (lo llama el intervalo cada 5s). Si ya hay un
  // guardado en curso, se reutiliza esa misma promesa en vez de disparar una
  // petición en paralelo , nunca hay 2 peticiones de guardado a la vez.
  // Primero pasa por obtenerBaseline(): si la baseline había fallado antes,
  // este mismo ciclo la reintenta solo, sin necesitar recargar la página.
  function sincronizar() {
    // Mientras haya un conflicto sin resolver, el guardado automático queda
    // completamente pausado , ni reintenta cada 5s ni gasta ninguna petición,
    // hasta que la persona elija qué versión conservar.
    if (conflictoPendiente) return Promise.resolve({ estado: "conflicto" });
    if (enVueloPromise) return enVueloPromise;
    enVueloPromise = obtenerBaseline()
      .then(function (resultadoBaseline) {
        if (resultadoBaseline.estado === "error") return { estado: "error" };
        return intentarGuardar();
      })
      .then(function (resultado) {
        enVueloPromise = null;
        return resultado;
      });
    return enVueloPromise;
  }

  var intervalId = setInterval(sincronizar, 5000);
  sincronizar(); // primer intento al arrancar; establece la baseline internamente , sincronizar() ya se pausa sola si conflictoPendiente viene restaurado
  if (conflictoPendiente) {
    // Se avisa de inmediato para que la interfaz reabra el modal de
    // resolución, sin esperar a que ocurra un conflicto nuevo en esta sesión.
    avisar("conflicto");
  }

  // flush() garantiza que el estado MÁS RECIENTE de localStorage quede
  // guardado antes de resolverse (o que se tope con un error/conflicto real):
  // 1. Si ya hay un guardado en curso, espera a que termine (no lanza uno
  //    nuevo en paralelo).
  // 2. Una vez terminado, revisa si localStorage cambió mientras tanto — si
  //    sí, dispara otro guardado y repite el mismo chequeo, hasta que ya no
  //    quede nada pendiente o se presente un error/conflicto real.
  function flush() {
    // Mientras haya un conflicto sin resolver, flush() se corta aquí mismo ,
    // ni intenta la baseline ni sincronizar(), para no gastar peticiones ni
    // arriesgar sobrescribir nada mientras la persona no haya decidido.
    if (conflictoPendiente) return Promise.resolve({ estado: "conflicto" });
    function intentarDeNuevoSiHizoFalta(resultado) {
      if (resultado.estado === "error" || resultado.estado === "conflicto") return resultado;
      var snapActual = JSON.stringify(leerSnapshotLocalStorage());
      if (snapActual === ultimoEnviado) return resultado; // ya no queda nada pendiente
      return sincronizar().then(intentarDeNuevoSiHizoFalta);
    }
    // Se revisa primero el resultado real de la baseline (reintentable, nunca
    // una promesa vieja fallida guardada para siempre) — si falló, se corta
    // aquí mismo sin llegar a sincronizar() ni arriesgar nada.
    return obtenerBaseline().then(function (resultadoBaseline) {
      if (resultadoBaseline.estado === "error") return { estado: "error" };
      var enCurso = enVueloPromise || sincronizar();
      return enCurso.then(intentarDeNuevoSiHizoFalta);
    });
  }

  // "Conservar este dispositivo": vuelve a leer el updated_at más reciente de
  // Supabase, y escribe el snapshot local guardado condicionado a ESE valor
  // fresco (no al viejo que ya sabíamos desactualizado). Si algo más cambió
  // justo entre la lectura y la escritura, se conserva el conflicto y hay que
  // volver a decidir , nunca se sobrescribe sin una elección explícita.
  function resolverConflictoConservarLocal() {
    if (resolviendoConflicto) return Promise.resolve({ estado: "conflicto" });
    if (!conflictoPendiente) return Promise.resolve({ estado: "ok" });
    resolviendoConflicto = true;
    var snapshotAConservar = conflictoPendiente.snapshot;
    return supabase
      .from("user_data")
      .select("updated_at")
      .eq("user_id", userId)
      .maybeSingle()
      .then(function (resLectura) {
        if (resLectura.error) throw resLectura.error;
        var updatedAtFresco = resLectura.data ? resLectura.data.updated_at : null;
        var nuevaFecha = new Date().toISOString();
        var payload = {
          data: snapshotAConservar,
          tipo_perfil: tipoPerfilActual(),
          updated_at: nuevaFecha,
        };
        var accionEscritura = updatedAtFresco
          ? supabase
              .from("user_data")
              .update(payload)
              .eq("user_id", userId)
              .eq("updated_at", updatedAtFresco)
              .select("updated_at")
          : supabase
              .from("user_data")
              .upsert(Object.assign({ user_id: userId }, payload), { onConflict: "user_id" })
              .select("updated_at");
        return accionEscritura.then(function (resEscritura) {
          if (resEscritura.error) throw resEscritura.error;
          if (updatedAtFresco && (!resEscritura.data || resEscritura.data.length === 0)) {
            // Otra modificación ocurrió justo entre la lectura y la escritura , 
            // se conserva el conflicto (con el mismo snapshot local) y se pide
            // decidir de nuevo, en vez de forzar la escritura a ciegas.
            return { estado: "conflicto" };
          }
          // Escritura confirmada , solo ahora se actualizan estos valores.
          ultimoEnviado = JSON.stringify(snapshotAConservar);
          ultimoUpdatedAt =
            resEscritura.data && resEscritura.data[0] ? resEscritura.data[0].updated_at : nuevaFecha;
          conflictoPendiente = null;
          // Se elimina el respaldo persistido , ya se resolvió, no debe seguir
          // bloqueando ni reabriendo el modal en una futura recarga.
          try {
            localStorage.removeItem(CONFLICT_BACKUP_KEY);
          } catch (e) {}
          avisar("ok");
          return { estado: "ok" };
        });
      })
      .catch(function (err) {
        console.error("cloudSync: error al conservar la versión de este dispositivo", err);
        // No se borra nada , el conflicto sigue bloqueado para poder reintentar.
        return { estado: "error" };
      })
      .then(function (resultado) {
        resolviendoConflicto = false;
        return resultado;
      });
  }

  // "Usar la versión de la nube": confirma la lectura remota, reemplaza las
  // claves sincronizables locales con el snapshot remoto (el respaldo local
  // en cleo_conflict_backup se conserva, no se borra aquí), y actualiza el
  // estado interno. Solo se recarga la interfaz después de que todo esto
  // haya terminado correctamente.
  function resolverConflictoUsarRemoto() {
    if (resolviendoConflicto) return Promise.resolve({ estado: "conflicto" });
    if (!conflictoPendiente) return Promise.resolve({ estado: "ok" });
    resolviendoConflicto = true;
    return supabase
      .from("user_data")
      .select("data, tipo_perfil, updated_at")
      .eq("user_id", userId)
      .maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        var fila = res.data;
        if (!fila) throw new Error("No se encontró la fila remota al intentar usar la versión de la nube.");

        CLEO_KEYS.forEach(function (key) {
          try {
            localStorage.removeItem(key);
          } catch (e) {}
        });
        escribirSnapshotLocalStorage(fila.data || {});
        if (fila.tipo_perfil) {
          try {
            localStorage.setItem("cleo_tipo_perfil", JSON.stringify(fila.tipo_perfil));
            var perfilRaw = localStorage.getItem("cleo_perfil");
            var perfil = perfilRaw ? JSON.parse(perfilRaw) : {};
            perfil.tipoPerfil = fila.tipo_perfil;
            localStorage.setItem("cleo_perfil", JSON.stringify(perfil));
          } catch (e) {}
        }

        ultimoEnviado = JSON.stringify(leerSnapshotLocalStorage());
        ultimoUpdatedAt = fila.updated_at;
        conflictoPendiente = null;
        // Se conserva el respaldo local como historial (no se borra), pero se
        // marca como "resuelto" , así ya no cuenta como conflicto activo y no
        // vuelve a bloquear ni a reabrir el modal en una futura recarga.
        try {
          var respaldoRaw = localStorage.getItem(CONFLICT_BACKUP_KEY);
          if (respaldoRaw) {
            var respaldo = JSON.parse(respaldoRaw);
            respaldo.estado = "resuelto";
            localStorage.setItem(CONFLICT_BACKUP_KEY, JSON.stringify(respaldo));
          }
        } catch (e) {}
        avisar("ok");
        return { estado: "ok" };
      })
      .catch(function (err) {
        console.error("cloudSync: error al usar la versión de la nube", err);
        // No se borra nada local , el conflicto sigue bloqueado para reintentar.
        return { estado: "error" };
      })
      .then(function (resultado) {
        resolviendoConflicto = false;
        return resultado;
      });
  }

  function alOcultarse() {
    if (document.visibilityState === "hidden") flush();
  }

  document.addEventListener("visibilitychange", alOcultarse);
  // Aviso honesto: beforeunload NO garantiza que esta petición de red llegue
  // a completarse , los navegadores pueden cancelarla al cerrar la pestaña.
  // Se deja como protección adicional de "mejor esfuerzo", no como garantía.
  window.addEventListener("beforeunload", flush);

  return {
    stop: function () {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", alOcultarse);
      window.removeEventListener("beforeunload", flush);
    },
    flush: flush,
    hayConflictoPendiente: function () {
      return !!conflictoPendiente;
    },
    obtenerConflictoPendiente: function () {
      return conflictoPendiente;
    },
    resolverConflictoConservarLocal: resolverConflictoConservarLocal,
    resolverConflictoUsarRemoto: resolverConflictoUsarRemoto,
  };
}
