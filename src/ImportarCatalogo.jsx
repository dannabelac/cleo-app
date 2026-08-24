import React from "react";
import * as XLSX from "xlsx";
import { CLEO_DRAFT_KEY_PREFIX } from "./cloudSync";

// ─────────────────────────────────────────────────────────────────────────
// ImportarCatalogo , motor único de importación de catálogo (CSV/XLSX/XLS)
// compartido por Productos y Servicios.
//
// CLEO_55.jsx sigue siendo el único dueño del estado real del catálogo y de
// su persistencia (localStorage / sincronización): este componente NUNCA
// escribe el catálogo directamente. Recibe el catálogo actual por props
// (catalogoActual), y al confirmar entrega UNA lista completa nueva vía
// props.onConfirmar(nuevaListaCompleta, resumenConteos) , CLEO_55.jsx decide
// cómo guardarla (setCatActivo).
//
// El archivo original (File) nunca se sube a ningún lado , se lee 100% en
// el navegador con "xlsx" (SheetJS), que nunca ejecuta fórmulas (entrega
// siempre el valor ya calculado que trae el archivo, nunca código), y se
// descarta apenas se termina de leer. Lo único que se conserva más allá de
// esa lectura es un BORRADOR TEMPORAL en sessionStorage (nunca el archivo
// en sí, ver sección de borrador abajo).
//
// ── Una sola fuente de verdad por fila ──────────────────────────────────
// Cada fila tiene un único campo `decision` que determina su resultado
// final , nunca una casilla y un botón que puedan contradecirse:
//   "importar"             , fila válida, se agregará tal cual.
//   "omitir"                , no se importará (elección explícita, o
//                             default de seguridad en duplicados/errores).
//   "actualizar_existente"  , sobrescribe un producto/servicio ya existente
//                             (conserva su id).
//   "agregar_como_nuevo"    , se agrega de todas formas aunque sea un
//                             posible duplicado.
//   "error_pendiente"       , tiene errores de validación, nunca se importa
//                             mientras no se corrija.
// `tipo` (valido/error/duplicado_archivo/duplicado_existente) es la
// CLASIFICACIÓN de los datos (se recalcula solo con recalcularFilas), y
// determina qué decisiones son válidas para esa fila y cuál es el default
// , `decision` es la ELECCIÓN final, y es lo único que lee
// construirResultadoImportacion al confirmar. Ver DECISION_POR_DEFECTO /
// DECISIONES_PERMITIDAS.
//
// ── Flujo en 4 pasos ─────────────────────────────────────────────────────
//   0. "restaurar"   , solo aparece si ya existe un borrador válido de esta
//                      cuenta+perfil guardado en una sesión anterior.
//   1. "seleccion"   , elegir el archivo. Se lee y se detectan columnas.
//   2. "mapeo"       , asociar cada columna del archivo a un campo real.
//                      Aquí NO existen todavía "filas" , no hay nada que
//                      perder al cambiar una asociación. Se avanza con el
//                      botón explícito "Revisar catálogo".
//   3. "vistaPrevia" , construida UNA sola vez al entrar (o al restaurar un
//                      borrador). A partir de aquí el mapeo queda congelado
//                      , ninguna interacción normal (editar una celda,
//                      cambiar una decisión) vuelve a leer el archivo ni el
//                      mapeo. Volver al paso 2 requiere una acción
//                      explícita con advertencia y confirmación.
//
// ── Borrador temporal (sessionStorage, nunca localStorage) ──────────────
// Se guarda automáticamente mientras se está en "vistaPrevia": nombre del
// archivo, encabezados detectados, mapeo, filas ya normalizadas (con sus
// correcciones, errores y decisión de cada una) y fecha de creación , NUNCA
// el archivo original ni las filas crudas sin normalizar. La clave usa el
// prefijo central CLEO_DRAFT_KEY_PREFIX (importado de cloudSync.js, nunca
// redefinido aquí) + userId + perfil, así nunca se mezcla entre cuentas ni
// entre Productos/Servicios. clearCleoLocalData() (cloudSync.js) ya limpia
// estas claves en cada cierre de sesión, cambio de cuenta o eliminación de
// cuenta , este archivo nunca duplica esa lógica, solo escribe con el
// mismo prefijo.
// ─────────────────────────────────────────────────────────────────────────

var LIMITE_NOMBRE = 200; // límite razonable definido para este importador , no existía antes en CLEO
var LIMITE_TEXTO = 2000; // idem, para descripción/condiciones
var LIMITE_FILAS = 500;
var LIMITE_TAMANO_BYTES = 5 * 1024 * 1024; // 5 MB
var EXTENSIONES_PERMITIDAS = [".csv", ".xlsx", ".xls"];
var BORRADOR_VERSION = 1;

// Sinónimos de encabezados que SÍ tienen un campo real donde aterrizar en
// el modelo actual de CLEO (nombre, precio, descripcion, condiciones , ver
// reporte de análisis: es el mismo shape para Productos y Servicios).
var SINONIMOS = {
  productos: {
    nombre: ["producto", "nombre", "nombre del producto", "nombre producto", "articulo", "nombre del articulo"],
    precio: ["precio", "precio unitario", "precio de venta", "costo"],
    descripcion: ["descripcion", "descripcion del producto", "detalle"],
    condiciones: ["condiciones", "notas", "observaciones", "condiciones de venta"]
  },
  servicios: {
    nombre: ["servicio", "nombre", "nombre del servicio"],
    precio: ["precio", "costo", "precio base", "precio del servicio"],
    descripcion: ["descripcion", "descripcion del servicio", "detalle", "que incluye"],
    condiciones: ["condiciones", "notas", "observaciones", "condiciones de pago"]
  }
};

// Campos a los que se puede asociar cualquier columna del archivo.
var CAMPOS_DESTINO = [
  { key: "nombre", label: "Nombre" },
  { key: "precio", label: "Precio" },
  { key: "descripcion", label: "Descripción" },
  { key: "condiciones", label: "Condiciones" },
  { key: "ignorar", label: "No importar" }
];

// Decisión con la que nace cada fila según su clasificación (tipo) , la
// más segura siempre: nunca se importa nada por accidente.
var DECISION_POR_DEFECTO = {
  valido: "importar",
  duplicado_archivo: "omitir",
  duplicado_existente: "omitir",
  error: "error_pendiente"
};

// Decisiones que tiene sentido ofrecer para cada tipo , una fila "valido"
// nunca puede tener decision:"actualizar_existente" (no hay nada que
// actualizar), una fila "error" nunca puede tener decision:"importar"
// (nunca se importa una fila inválida, sin importar qué haya elegido antes
// la persona).
var DECISIONES_PERMITIDAS = {
  valido: ["importar", "omitir"],
  duplicado_archivo: ["omitir", "agregar_como_nuevo"],
  duplicado_existente: ["omitir", "actualizar_existente", "agregar_como_nuevo"],
  error: ["error_pendiente", "omitir"]
};

// ── Helpers puros (sin estado, sin acceso a React) ──────────────────────

function normalizarTexto(s) {
  return String(s == null ? "" : s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Mismo CRITERIO que normalizarNombreItem, ya usado en CLEO_55.jsx para
// comparar nombres de forma insensible a mayúsculas/acentos/espacios , se
// reimplementa aquí (una línea) porque este componente vive en su propio
// archivo y no puede importar funciones internas del componente principal.
function normalizarNombreComparacion(s) {
  return normalizarTexto(s);
}

function detectarColumna(encabezadoNormalizado, sinonimosPerfil) {
  if (!encabezadoNormalizado) return null;
  var campos = Object.keys(sinonimosPerfil);
  for (var i = 0; i < campos.length; i++) {
    if (sinonimosPerfil[campos[i]].indexOf(encabezadoNormalizado) >= 0) return campos[i];
  }
  return null;
}

// columnas: [{ indice, encabezado }] , el mapeo resultante usa SIEMPRE el
// índice de columna como llave (nunca el texto), así encabezados repetidos
// o vacíos nunca se pisan entre sí.
function construirMapeoInicial(columnas, esProductos) {
  var sinonimosPerfil = esProductos ? SINONIMOS.productos : SINONIMOS.servicios;
  var mapeo = {};
  var usados = {};
  columnas.forEach(function (col) {
    var norm = normalizarTexto(col.encabezado);
    var destino = detectarColumna(norm, sinonimosPerfil);
    if (destino && !usados[destino]) {
      mapeo[col.indice] = destino;
      usados[destino] = true;
    } else {
      mapeo[col.indice] = "ignorar";
    }
  });
  return mapeo;
}

// ── Parser de precios ────────────────────────────────────────────────────
// Soporta, al menos: 1500 / 1500.00 / 1500,00 / 1,500 / 1,500.00 /
// $1,500.00 / 1.500,00 / "$ 1 500.00". Nunca ejecuta nada , solo aritmética
// de texto. Regresa NaN si no logra interpretar nada útil (nunca revienta).
//
// Regla, en este orden:
//  1. Si aparecen PUNTO y COMA a la vez: el que aparece MÁS TARDE en el
//     texto es el separador decimal , el otro (y cualquier repetición
//     anterior de cualquiera de los dos) es separador de miles. Esto
//     resuelve tanto "1,500.00" (es-MX) como "1.500,00" (formato europeo)
//     de forma correcta y simétrica, sin asumir un locale fijo.
//  2. Si aparece solo UN tipo de separador (una o varias veces): si el
//     último grupo tiene exactamente 3 dígitos, se interpreta como
//     separador de miles (sin parte decimal) , si tiene 1 o 2 dígitos, se
//     interpreta como separador decimal.
//  3. Sin separadores: el número tal cual.
function parseNumeroLibre(v) {
  if (v == null) return NaN;
  if (typeof v === "number") return isFinite(v) ? v : NaN;
  var t = String(v).trim();
  if (t === "") return NaN;
  t = t.replace(/[^0-9.,\-]/g, ""); // quita $, espacios, letras, cualquier otro símbolo
  if (t === "" || t === "-") return NaN;
  var negativo = t.charAt(0) === "-";
  t = t.replace(/-/g, "");
  if (t === "") return NaN;

  var tieneComa = t.indexOf(",") >= 0;
  var tienePunto = t.indexOf(".") >= 0;
  var enteros, decimales;

  if (tieneComa && tienePunto) {
    var posUltimaComa = t.lastIndexOf(",");
    var posUltimoPunto = t.lastIndexOf(".");
    var posDecimal = Math.max(posUltimaComa, posUltimoPunto);
    enteros = t.slice(0, posDecimal).replace(/[.,]/g, "");
    decimales = t.slice(posDecimal + 1).replace(/[.,]/g, "");
  } else if (tieneComa || tienePunto) {
    var sep = tieneComa ? "," : ".";
    var partes = t.split(sep);
    var ultima = partes[partes.length - 1];
    if (partes.length > 1 && ultima.length === 3) {
      enteros = partes.join("");
      decimales = "";
    } else {
      enteros = partes.slice(0, -1).join("");
      decimales = ultima;
    }
  } else {
    enteros = t;
    decimales = "";
  }

  if (enteros === "" && decimales === "") return NaN;
  var textoFinal = (enteros || "0") + (decimales !== "" ? "." + decimales : "");
  var n = Number(textoFinal);
  if (isNaN(n) || !isFinite(n)) return NaN;
  return negativo ? -n : n;
}

// Una fila (arreglo de valores por índice de columna) está "completamente
// vacía" si ninguna celda tiene contenido , se ignora sin generar error ni
// contar para el límite de filas.
function filaCompletamenteVacia(filaArray) {
  for (var i = 0; i < filaArray.length; i++) {
    if (String(filaArray[i] == null ? "" : filaArray[i]).trim() !== "") return false;
  }
  return true;
}

// Valida y normaliza los 4 campos de UNA fila ya mapeada. Nunca lanza ,
// siempre regresa { campos, errores, erroresPorCampo, avisos }. errores =
// bloqueantes (la fila no se puede importar mientras existan) , además de
// la lista plana, erroresPorCampo ubica cada error bloqueante en su campo
// exacto (nombre/precio) para poder mostrarlo justo debajo del input
// correspondiente. avisos = informativos (la fila sí se puede importar,
// pero algo se ajustó automáticamente, ej. un texto muy largo se acortó).
//
// Los errores SIEMPRE se generan a partir de nombre/precio , nunca se
// infieren de la descripción ni de ningún otro texto libre del archivo:
// la descripción es información del producto, nunca una señal de validez.
//
// Regla de precio: debe ser un número finito MAYOR A CERO , esto replica
// el comportamiento real ya existente en "Mi catálogo" (el botón "Agregar
// producto/servicio" también está deshabilitado si el precio es 0, "" o
// no numérico: !formSv.precio), no es una regla nueva inventada aquí.
function procesarCampos(campos) {
  var errores = []; var avisos = [];
  var erroresPorCampo = { nombre: null, precio: null, descripcion: null, condiciones: null };

  var nombre = String(campos.nombre == null ? "" : campos.nombre).trim().replace(/\s+/g, " ");
  if (nombre.length > LIMITE_NOMBRE) {
    nombre = nombre.slice(0, LIMITE_NOMBRE);
    avisos.push("El nombre supera los " + LIMITE_NOMBRE + " caracteres (se acortó automáticamente).");
  }
  if (!nombre) {
    var msgNombre = "El nombre es obligatorio.";
    errores.push(msgNombre); erroresPorCampo.nombre = msgNombre;
  }

  var precioCrudo = campos.precio;
  var precioNum = NaN;
  if (precioCrudo == null || String(precioCrudo).trim() === "") {
    var msgPrecioObligatorio = "El precio es obligatorio.";
    errores.push(msgPrecioObligatorio); erroresPorCampo.precio = msgPrecioObligatorio;
  } else {
    precioNum = parseNumeroLibre(precioCrudo);
    if (isNaN(precioNum) || !isFinite(precioNum)) {
      var msgFormato = "El precio no tiene un formato válido.";
      errores.push(msgFormato); erroresPorCampo.precio = msgFormato;
    } else if (precioNum <= 0) {
      var msgMayorCero = "El precio debe ser mayor que cero.";
      errores.push(msgMayorCero); erroresPorCampo.precio = msgMayorCero;
    }
  }

  var descripcion = String(campos.descripcion == null ? "" : campos.descripcion).trim();
  if (descripcion.length > LIMITE_TEXTO) {
    descripcion = descripcion.slice(0, LIMITE_TEXTO);
    avisos.push("La descripción supera el límite permitido (se acortó automáticamente).");
  }

  var condiciones = String(campos.condiciones == null ? "" : campos.condiciones).trim();
  if (condiciones.length > LIMITE_TEXTO) {
    condiciones = condiciones.slice(0, LIMITE_TEXTO);
    avisos.push("Las condiciones superan el límite permitido (se acortaron automáticamente).");
  }

  return {
    campos: { nombre: nombre, precio: (!isNaN(precioNum) && isFinite(precioNum)) ? precioNum : "", descripcion: descripcion, condiciones: condiciones },
    errores: errores,
    erroresPorCampo: erroresPorCampo,
    avisos: avisos
  };
}

// Construye las filas derivadas base (campos + validación), SIN todavía
// clasificar tipo/decision , eso lo hace recalcularFilas por separado.
// filasCrudasDatos: arreglo de arreglos (cada fila = valores por ÍNDICE de
// columna, tal como vinieron del archivo). columnasArchivo: [{indice,
// encabezado}]. mapeo: { [indice]: destino }. TODA lectura de valor usa
// col.indice , nunca la posición dentro de un arreglo filtrado, así una
// columna vacía en medio del archivo nunca desplaza a las siguientes.
function construirFilasBase(filasCrudasDatos, columnasArchivo, mapeo) {
  return filasCrudasDatos.map(function (filaArray, idx) {
    var campos = { nombre: "", precio: "", descripcion: "", condiciones: "" };
    columnasArchivo.forEach(function (col) {
      var destino = mapeo[col.indice];
      if (destino && destino !== "ignorar" && campos.hasOwnProperty(destino)) {
        var actual = campos[destino];
        var nuevo = filaArray[col.indice];
        // Si dos columnas del archivo apuntan al mismo destino (caso raro,
        // ej. dos columnas "Notas"), se concatenan en vez de perder una.
        campos[destino] = actual ? (actual + (nuevo ? " " + nuevo : "")) : (nuevo || "");
      }
    });
    // precioEntradaInicial conserva el texto crudo tal como vino del
    // archivo, ANTES de que procesarCampos lo normalice a número , es el
    // valor inicial de precioEntrada (ver nota junto a handleEditarCampo).
    var precioEntradaInicial = campos.precio;
    var resultado = procesarCampos(campos);
    return {
      _id: "fila_" + idx,
      campos: resultado.campos,
      precioEntrada: precioEntradaInicial,
      errores: resultado.errores,
      erroresPorCampo: resultado.erroresPorCampo,
      avisos: resultado.avisos,
      tipo: null, // se calcula en recalcularFilas
      decision: null, // idem , null toma el default del tipo calculado
      duplicadoId: null
    };
  });
}

// Única función que clasifica cada fila (tipo) y resuelve su decisión
// final , se llama tanto para construir la vista previa la primera vez
// como para recalcular tras UNA edición puntual o al restaurar un borrador
// (nunca para releer el archivo completo: solo usa fila.campos.nombre y
// fila.errores, ya calculados).
//
// Prioridad de clasificación (idéntica a la ya usada/aprobada antes):
// errores de validación > coincide con el catálogo real > coincide con
// otra fila del mismo archivo > válida.
//
// La decisión se PRESERVA si sigue siendo válida para el tipo recalculado
// (ej. la persona eligió "Agregar de todas formas" en un duplicado y sigue
// siendo duplicado tras cerrar/abrir el acordeón , no se pierde). Si el
// tipo cambia y la decisión anterior ya no tiene sentido para el nuevo
// tipo (ej. una fila corregida deja de tener errores), se reemplaza por el
// default MÁS SEGURO de ese tipo nuevo , nunca se inventa una decisión
// intermedia.
function recalcularFilas(filas, catalogoActual) {
  var existentesPorNombre = {};
  (catalogoActual || []).forEach(function (it) {
    var key = normalizarNombreComparacion(it.nombre);
    if (key) existentesPorNombre[key] = it;
  });
  var vistos = {};
  return filas.map(function (fila) {
    var tipo, duplicadoId;
    if (fila.errores.length > 0) {
      tipo = "error"; duplicadoId = null;
    } else {
      var key = normalizarNombreComparacion(fila.campos.nombre);
      if (existentesPorNombre[key]) {
        tipo = "duplicado_existente"; duplicadoId = existentesPorNombre[key].id;
      } else if (vistos.hasOwnProperty(key)) {
        tipo = "duplicado_archivo"; duplicadoId = null;
      } else {
        vistos[key] = true;
        tipo = "valido"; duplicadoId = null;
      }
    }
    var permitidas = DECISIONES_PERMITIDAS[tipo];
    var decisionFinal = permitidas.indexOf(fila.decision) >= 0 ? fila.decision : DECISION_POR_DEFECTO[tipo];
    return Object.assign({}, fila, { tipo: tipo, duplicadoId: duplicadoId, decision: decisionFinal });
  });
}

// Cuenta las filas por su DECISIÓN final , exactamente las 5 categorías
// que pide la vista previa, mutuamente excluyentes por construcción (cada
// fila cae en exactamente un bucket), así los conteos siempre sí suman el
// total de filas sin necesidad de una verificación aparte.
function contarPorDecision(filas) {
  var c = { listos: 0, actualizaran: 0, agregaranDuplicados: 0, omitidos: 0, conErrores: 0 };
  filas.forEach(function (f) {
    if (f.tipo === "error") { c.conErrores++; return; }
    if (f.decision === "omitir") { c.omitidos++; return; }
    if (f.decision === "actualizar_existente") { c.actualizaran++; return; }
    if (f.decision === "agregar_como_nuevo") { c.agregaranDuplicados++; return; }
    c.listos++; // decision === "importar"
  });
  return c;
}

// Cuenta las filas por su CLASIFICACIÓN (tipo) , se usa solo para los
// chips de filtro de la lista, independiente de qué decisión se haya
// tomado (una fila duplicada sigue siendo "duplicada" en el filtro aunque
// ya se haya decidido agregarla de todas formas).
function contarPorTipo(filas) {
  var c = { errores: 0, duplicados: 0 };
  filas.forEach(function (f) {
    if (f.tipo === "error") c.errores++;
    else if (f.tipo === "duplicado_archivo" || f.tipo === "duplicado_existente") c.duplicados++;
  });
  return c;
}

// ── Plantilla descargable (CSV) ─────────────────────────────────────────
// Reproduce la misma técnica que ya usa CLEO_55.jsx en generarCSV/celdaCSV
// (BOM UTF-8 para que Excel lea acentos bien, protección básica contra
// fórmulas) , se reescribe aquí en unas pocas líneas porque este archivo
// no puede importar esas funciones (viven dentro del componente principal),
// pero el CRITERIO es el mismo, nunca uno paralelo distinto.
function celdaCSVPlantilla(v) {
  var t = String(v == null ? "" : v);
  if (/^[=+\-@]/.test(t)) t = "'" + t;
  if (/[",\n]/.test(t)) t = '"' + t.replace(/"/g, '""') + '"';
  return t;
}
function construirPlantillaCSV(esProductos) {
  var headers = ["Nombre", "Precio", "Descripción", "Condiciones"];
  var ejemplo = esProductos
    ? ["Aretes de plata", "250", "Aretes hechos a mano con plata .925.", "Incluye estuche de regalo."]
    : ["Sesión fotográfica", "1500", "Sesión de 1 hora en exteriores.", "Incluye 20 fotos editadas, entrega en 5 días hábiles."];
  var filas = [headers.map(celdaCSVPlantilla).join(","), ejemplo.map(celdaCSVPlantilla).join(",")];
  return "﻿" + filas.join("\r\n");
}
function descargarPlantilla(esProductos) {
  try {
    var contenido = construirPlantillaCSV(esProductos);
    var blob = new Blob([contenido], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = esProductos ? "CLEO_plantilla_productos.csv" : "CLEO_plantilla_servicios.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  } catch (e) { }
}

// Construye, en memoria y en UNA sola pasada, la lista completa final del
// catálogo (existentes + nuevos + actualizados) y el conteo para el mensaje
// final. Función pura (sin estado de React) para que sea fácil de probar,
// y es lo único que toca el arreglo real , se llama UNA sola vez al
// confirmar, nunca fila por fila contra el estado de React. Lee
// EXCLUSIVAMENTE fila.decision (nunca un estado/casilla aparte) , una fila
// con tipo:"error" JAMÁS se importa, sin importar qué decision tenga
// guardada (defensa adicional, no debería poder pasar por la UI, pero el
// motor no depende de que la UI se comporte bien).
function construirResultadoImportacion(filas, catalogoActual) {
  var nuevaLista = catalogoActual.slice();
  var contador = {
    agregados: 0, actualizados: 0, importados: 0,
    omitidosError: 0, omitidosDuplicado: 0, omitidosEleccion: 0, omitidos: 0
  };
  var base = Date.now();
  var offset = 0;
  filas.forEach(function (fila) {
    if (fila.tipo === "error") { contador.omitidosError++; contador.omitidos++; return; }
    if (fila.decision === "omitir") {
      contador.omitidos++;
      if (fila.tipo === "duplicado_archivo" || fila.tipo === "duplicado_existente") contador.omitidosDuplicado++;
      else contador.omitidosEleccion++;
      return;
    }
    if (fila.decision === "actualizar_existente" && fila.duplicadoId != null) {
      nuevaLista = nuevaLista.map(function (it) {
        if (it.id !== fila.duplicadoId) return it;
        // Conserva id y cualquier otro campo no confirmado aquí , solo
        // actualiza lo que la persona confirmó, y nunca reemplaza un
        // valor existente con una celda vacía del archivo.
        var actualizado = Object.assign({}, it, { nombre: fila.campos.nombre, precio: Number(fila.campos.precio) });
        if (fila.campos.descripcion) actualizado.descripcion = fila.campos.descripcion;
        if (fila.campos.condiciones) actualizado.condiciones = fila.campos.condiciones;
        return actualizado;
      });
      contador.actualizados++; contador.importados++;
      return;
    }
    // decision === "importar" (tipo valido) o "agregar_como_nuevo" (tipo duplicado_*)
    offset++;
    nuevaLista = nuevaLista.concat([{
      id: base + offset, // mismo mecanismo (Date.now) que agregarServicio, con un contador para garantizar unicidad dentro de este lote
      nombre: fila.campos.nombre,
      precio: Number(fila.campos.precio),
      descripcion: fila.campos.descripcion || "",
      condiciones: fila.campos.condiciones || ""
    }]);
    contador.agregados++; contador.importados++;
  });
  return { nuevaLista: nuevaLista, contador: contador };
}

function unirConY(partes) {
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0];
  return partes.slice(0, -1).join(", ") + " y " + partes[partes.length - 1];
}

// Arma el mensaje final legible ("Se importaron 7 productos. Se
// actualizaron 2. Se omitieron 6 filas con errores y 2 posibles
// duplicados.") a partir de los conteos REALES de construirResultadoImportacion
// , nunca de una estimación previa a la importación.
function construirMensajeResultado(contador, esProductos) {
  var etiqueta = esProductos ? "productos" : "servicios";
  var msg = "Se importaron " + contador.agregados + " " + etiqueta + ".";
  if (contador.actualizados > 0) msg += " Se actualizaron " + contador.actualizados + ".";
  var partesOmitidas = [];
  if (contador.omitidosError > 0) partesOmitidas.push(contador.omitidosError + " fila" + (contador.omitidosError === 1 ? "" : "s") + " con errores");
  if (contador.omitidosDuplicado > 0) partesOmitidas.push(contador.omitidosDuplicado + " posible" + (contador.omitidosDuplicado === 1 ? "" : "s") + " duplicado" + (contador.omitidosDuplicado === 1 ? "" : "s"));
  if (contador.omitidosEleccion > 0) partesOmitidas.push(contador.omitidosEleccion + " por elección");
  if (partesOmitidas.length > 0) msg += " Se omitieron " + unirConY(partesOmitidas) + ".";
  return msg;
}

// ── Borrador temporal (sessionStorage) ──────────────────────────────────
// Tres funciones centrales, nunca se llama sessionStorage directamente
// desde ningún otro lugar del componente. La clave usa el mismo prefijo
// central que cloudSync.js conoce (CLEO_DRAFT_KEY_PREFIX) , namespaced
// por userId y por perfil, así nunca se mezcla entre cuentas ni entre
// Productos/Servicios.
function construirClaveBorrador(userId, esProductos) {
  var uid = userId || "anonimo"; // no debería ocurrir en la práctica: este modal solo es alcanzable ya autenticado
  return CLEO_DRAFT_KEY_PREFIX + uid + "_" + (esProductos ? "productos" : "servicios");
}

// Guarda el progreso ACTUAL (nunca el archivo original ni las filas
// crudas sin normalizar) en sessionStorage. Nunca lanza , si sessionStorage
// no está disponible o se llenó, regresa false para que el componente
// pueda avisar sin romper la importación en curso (el estado de React
// sigue siendo la fuente de verdad mientras el componente siga montado).
function guardarBorrador(userId, esProductos, datos) {
  try {
    if (typeof sessionStorage === "undefined") return false;
    var clave = construirClaveBorrador(userId, esProductos);
    var payload = {
      version: BORRADOR_VERSION,
      userId: userId || null,
      perfil: esProductos ? "productos" : "servicios",
      nombreArchivo: datos.nombreArchivo,
      columnasArchivo: datos.columnasArchivo,
      mapeo: datos.mapeo,
      filas: datos.filas,
      fechaCreacion: datos.fechaCreacion
    };
    sessionStorage.setItem(clave, JSON.stringify(payload));
    return true;
  } catch (e) {
    return false;
  }
}

// Lee y valida A FONDO el borrador de ESTE userId+perfil , nunca regresa
// un borrador corrupto, de otra versión, o de otra cuenta/perfil. Esto es
// una defensa EN PROFUNDIDAD además del namespacing de la clave: aunque
// por cualquier motivo se leyera una clave ajena, esta validación explícita
// de datos.userId/datos.perfil contra los actuales bloquea que se muestre.
function leerBorradorValido(userId, esProductos) {
  try {
    if (typeof sessionStorage === "undefined") return null;
    var clave = construirClaveBorrador(userId, esProductos);
    var raw = sessionStorage.getItem(clave);
    if (!raw) return null;
    var datos = JSON.parse(raw);
    if (!datos || typeof datos !== "object") return null;
    if (datos.version !== BORRADOR_VERSION) return null;
    if ((datos.userId || null) !== (userId || null)) return null;
    if (datos.perfil !== (esProductos ? "productos" : "servicios")) return null;
    if (!Array.isArray(datos.filas) || datos.filas.length === 0) return null;
    if (!Array.isArray(datos.columnasArchivo)) return null;
    if (!datos.mapeo || typeof datos.mapeo !== "object") return null;
    return datos;
  } catch (e) {
    return null;
  }
}

function eliminarBorrador(userId, esProductos) {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.removeItem(construirClaveBorrador(userId, esProductos));
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────────────────────
export function ImportarCatalogo(props) {
  var e = React.createElement;
  var st = props.st;
  var C = props.C;
  var isMobile = !!props.isMobile;
  var esProductos = !!props.esProductos;
  var catalogoActual = props.catalogoActual || [];
  var userId = props.userId || null;
  var onConfirmar = props.onConfirmar;
  var onCerrar = props.onCerrar;

  // paso: "restaurar" | "seleccion" | "mapeo" | "vistaPrevia" , ver nota de flujo arriba.
  var sPaso = React.useState("seleccion"); var paso = sPaso[0]; var setPaso = sPaso[1];
  var sNombreArchivo = React.useState(""); var nombreArchivo = sNombreArchivo[0]; var setNombreArchivo = sNombreArchivo[1];
  // columnasArchivo: [{ indice, encabezado, etiqueta }] , indice es la
  // posición REAL de la columna en el archivo (nunca cambia aunque se
  // ignoren columnas vacías al mostrar la lista), etiqueta es lo que se
  // muestra en la interfaz (distingue vacíos/repetidos, ej. "(columna 2)").
  var sColumnas = React.useState([]); var columnasArchivo = sColumnas[0]; var setColumnasArchivo = sColumnas[1];
  // filasCrudasDatos: arreglo de arreglos , fila[indiceColumna] = valor
  // crudo tal como vino del archivo. Nunca se reordena ni se filtra por
  // columna, así el índice siempre corresponde a la posición real. NUNCA
  // se persiste en el borrador (ver guardarBorrador) , por eso, tras
  // restaurar un borrador, "Cambiar columnas" queda deshabilitado.
  var sDatosCrudos = React.useState([]); var filasCrudasDatos = sDatosCrudos[0]; var setFilasCrudasDatos = sDatosCrudos[1];
  // mapeo: { [indiceColumna]: "nombre"|"precio"|"descripcion"|"condiciones"|"ignorar" }
  var sMapeo = React.useState({}); var mapeo = sMapeo[0]; var setMapeo = sMapeo[1];
  var sFilas = React.useState([]); var filas = sFilas[0]; var setFilas = sFilas[1];
  var sErrorArchivo = React.useState(""); var errorArchivo = sErrorArchivo[0]; var setErrorArchivo = sErrorArchivo[1];
  var sProcesando = React.useState(false); var procesando = sProcesando[0]; var setProcesando = sProcesando[1];
  var sImportando = React.useState(false); var importando = sImportando[0]; var setImportando = sImportando[1];
  var sFiltroVista = React.useState("todas"); var filtroVista = sFiltroVista[0]; var setFiltroVista = sFiltroVista[1];
  var sFilaExpandida = React.useState(null); var filaExpandidaIdx = sFilaExpandida[0]; var setFilaExpandidaIdx = sFilaExpandida[1];
  var sBorradorDetectado = React.useState(null); var borradorDetectado = sBorradorDetectado[0]; var setBorradorDetectado = sBorradorDetectado[1];
  var sFechaCreacionBorrador = React.useState(null); var fechaCreacionBorrador = sFechaCreacionBorrador[0]; var setFechaCreacionBorrador = sFechaCreacionBorrador[1];
  var sSinAlmacenamiento = React.useState(false); var sinAlmacenamientoTemporal = sSinAlmacenamiento[0]; var setSinAlmacenamientoTemporal = sSinAlmacenamiento[1];

  var fileInputRef = React.useRef(null);
  // Bloqueo síncrono real contra doble clic , un useState solo no alcanza
  // porque React puede procesar dos clics antes de repintar (mismo patrón
  // ya usado en ArchivoAdjunto.jsx).
  var bloqueoRef = React.useRef(false);

  // Al montar (= al abrir el modal, por ser de montaje condicional), se
  // busca UNA vez si ya existe un borrador válido de esta cuenta+perfil.
  // Nunca se restaura en silencio , si existe, se muestra el paso
  // "restaurar" para que la persona decida.
  React.useEffect(function () {
    var encontrado = leerBorradorValido(userId, esProductos);
    if (encontrado) {
      setBorradorDetectado(encontrado);
      setPaso("restaurar");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-guardado del borrador , se ejecuta en cada cambio relevante
  // mientras se está en "vistaPrevia" (donde ya existen filas normalizadas
  // con sus correcciones y decisiones). Antes de eso ("seleccion"/"mapeo")
  // no hay nada útil que guardar todavía: no hay filas ni correcciones que
  // perder si se cierra el modal en esos pasos.
  React.useEffect(function () {
    if (paso !== "vistaPrevia") return;
    if (!filas || filas.length === 0) return;
    var ok = guardarBorrador(userId, esProductos, {
      nombreArchivo: nombreArchivo,
      columnasArchivo: columnasArchivo,
      mapeo: mapeo,
      filas: filas,
      fechaCreacion: fechaCreacionBorrador || Date.now()
    });
    if (!ok) setSinAlmacenamientoTemporal(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, filas, nombreArchivo, columnasArchivo, mapeo, fechaCreacionBorrador]);

  // Reinicia SOLO el estado local de React , nunca toca el borrador en
  // sessionStorage (eso lo hacen explícitamente handleConfirmar al
  // terminar con éxito, y handleDescartarImportacion/handleDescartarBorrador
  // al descartar). Cerrar por la X, "Cancelar" o "Cerrar por ahora" siempre
  // pasan por aquí , el progreso guardado sigue disponible después.
  function resetTodo() {
    setPaso("seleccion");
    setNombreArchivo("");
    setColumnasArchivo([]);
    setFilasCrudasDatos([]);
    setMapeo({});
    setFilas([]);
    setErrorArchivo("");
    setFiltroVista("todas");
    setFilaExpandidaIdx(null);
    setBorradorDetectado(null);
    setFechaCreacionBorrador(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // "Cerrar por ahora": conserva el progreso (el borrador ya se guardó
  // automáticamente si se llegó a "vistaPrevia"). Es lo que hacen la X del
  // encabezado, "Cancelar" (pasos sin progreso aún) y este botón.
  function handleCerrarPorAhora() {
    if (importando) return;
    resetTodo();
    if (onCerrar) onCerrar();
  }

  async function handleSeleccionArchivo(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    setErrorArchivo("");

    var nombreLower = file.name.toLowerCase();
    var extensionValida = EXTENSIONES_PERMITIDAS.some(function (ext) { return nombreLower.slice(-ext.length) === ext; });
    if (!extensionValida) {
      setErrorArchivo("Solo se aceptan archivos .csv, .xlsx o .xls.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size === 0) {
      setErrorArchivo("Este archivo está vacío.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > LIMITE_TAMANO_BYTES) {
      setErrorArchivo("El archivo pesa más de 5 MB. Reduce su tamaño e intenta de nuevo.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setProcesando(true);
    try {
      var esCSV = /\.csv$/i.test(file.name);
      var workbook;
      if (esCSV) {
        var texto = await file.text();
        workbook = XLSX.read(texto, { type: "string" });
      } else {
        var buffer = await file.arrayBuffer();
        workbook = XLSX.read(buffer, { type: "array" });
      }
      var nombreHoja = workbook.SheetNames && workbook.SheetNames[0];
      if (!nombreHoja) { setErrorArchivo("Este archivo no tiene datos para importar."); setProcesando(false); if (fileInputRef.current) fileInputRef.current.value = ""; return; }
      var hoja = workbook.Sheets[nombreHoja];
      // header:1 → arreglo de arreglos (fila 0 = encabezados). raw:false →
      // valores ya formateados como texto/número calculado, NUNCA fórmulas.
      var filasArray = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "", raw: false, blankrows: false });
      if (!filasArray || filasArray.length === 0) {
        setErrorArchivo("Este archivo no tiene datos para importar.");
        setProcesando(false); if (fileInputRef.current) fileInputRef.current.value = ""; return;
      }

      var encabezadosCrudos = filasArray[0] || [];
      var filasOriginales = filasArray.slice(1).map(function (fila) {
        return fila.map(function (v) { return v == null ? "" : String(v); });
      });

      // Número real de columnas: el máximo entre el encabezado y cualquier
      // fila de datos , así una columna sin encabezado pero CON datos en
      // alguna fila nunca se pierde.
      var numColumnas = encabezadosCrudos.length;
      filasOriginales.forEach(function (fila) { if (fila.length > numColumnas) numColumnas = fila.length; });

      // Columnas "útiles": tienen encabezado, o tienen algún dato en
      // alguna fila. Las columnas totalmente vacías (sin encabezado y sin
      // ningún dato en ninguna fila) se descartan de la interfaz , pero
      // esto SOLO afecta qué se muestra en el mapeo, nunca el índice real
      // de las columnas que sí se conservan (col.indice sigue siendo su
      // posición original en el archivo).
      var columnasCandidatas = [];
      for (var idxCol = 0; idxCol < numColumnas; idxCol++) {
        var encabezado = String(encabezadosCrudos[idxCol] == null ? "" : encabezadosCrudos[idxCol]).trim();
        var tieneAlgunDato = encabezado !== "" || filasOriginales.some(function (fila) { return String(fila[idxCol] == null ? "" : fila[idxCol]).trim() !== ""; });
        if (tieneAlgunDato) columnasCandidatas.push({ indice: idxCol, encabezado: encabezado });
      }
      if (columnasCandidatas.length === 0) {
        setErrorArchivo("No pudimos encontrar columnas con datos en este archivo.");
        setProcesando(false); if (fileInputRef.current) fileInputRef.current.value = ""; return;
      }

      // Etiquetas para la interfaz: distingue encabezados vacíos o
      // repetidos mostrando el número de columna (1-based, como lo vería
      // alguien contando columnas a mano), SIN tocar col.indice.
      var conteoEncabezados = {};
      columnasCandidatas.forEach(function (c) {
        if (c.encabezado) {
          var k = normalizarTexto(c.encabezado);
          conteoEncabezados[k] = (conteoEncabezados[k] || 0) + 1;
        }
      });
      columnasCandidatas.forEach(function (c) {
        var numVisible = c.indice + 1;
        if (!c.encabezado) {
          c.etiqueta = "(columna " + numVisible + ")";
        } else {
          var k = normalizarTexto(c.encabezado);
          c.etiqueta = conteoEncabezados[k] > 1 ? (c.encabezado + " (columna " + numVisible + ")") : c.encabezado;
        }
      });

      var datosCrudos = filasOriginales.filter(function (fila) { return !filaCompletamenteVacia(fila); });

      if (datosCrudos.length === 0) {
        setErrorArchivo("Este archivo no tiene filas con datos (todas están vacías).");
        setProcesando(false); if (fileInputRef.current) fileInputRef.current.value = ""; return;
      }
      if (datosCrudos.length > LIMITE_FILAS) {
        setErrorArchivo("Este archivo tiene " + datosCrudos.length + " filas, el máximo permitido es " + LIMITE_FILAS + ". Divide tu catálogo en partes más pequeñas e impórtalo por partes.");
        setProcesando(false); if (fileInputRef.current) fileInputRef.current.value = ""; return;
      }

      var mapeoInicial = construirMapeoInicial(columnasCandidatas, esProductos);

      setNombreArchivo(file.name);
      setColumnasArchivo(columnasCandidatas);
      setFilasCrudasDatos(datosCrudos);
      setMapeo(mapeoInicial);
      setFilas([]); // todavía no existe vista previa , se construye solo con "Revisar catálogo"
      setPaso("mapeo");
    } catch (e2) {
      setErrorArchivo("No pudimos leer este archivo. Verifica que no esté dañado y que sea .csv, .xlsx o .xls.");
    } finally {
      setProcesando(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Cambiar una asociación de columna SOLO es posible en el paso "mapeo",
  // donde todavía no existen filas de vista previa , por lo tanto nunca
  // hay nada que reconstruir ni ninguna corrección que se pueda perder.
  function handleCambiarMapeo(indiceColumna, nuevoDestino) {
    setMapeo(function (prev) {
      var copia = Object.assign({}, prev);
      copia[indiceColumna] = nuevoDestino;
      return copia;
    });
  }

  // Único punto donde se construye la vista previa a partir del archivo ,
  // se llama UNA vez, al presionar "Revisar catálogo". A partir de aquí el
  // mapeo queda congelado mientras la persona corrige filas.
  function handleRevisarCatalogo() {
    var base = construirFilasBase(filasCrudasDatos, columnasArchivo, mapeo);
    var clasificadas = recalcularFilas(base, catalogoActual);
    setFilas(clasificadas);
    setFiltroVista("todas");
    setFilaExpandidaIdx(null);
    setFechaCreacionBorrador(Date.now());
    setPaso("vistaPrevia");
  }

  // Volver a mapear columnas DESCARTA las filas de la vista previa (y por
  // lo tanto cualquier corrección/decisión hecha ahí) , por eso exige una
  // confirmación explícita y nunca ocurre como efecto secundario de otra
  // acción. Solo está disponible si todavía tenemos filasCrudasDatos en
  // memoria (nunca es el caso tras restaurar un borrador, ya que las filas
  // crudas nunca se persisten , ver guardarBorrador). Al confirmar, también
  // se elimina el borrador guardado: la persona ya aceptó perder esa
  // vista previa, así que no debe reaparecer como "importación pendiente"
  // si cierra el modal después.
  function handleVolverAMapeo() {
    if (filasCrudasDatos.length === 0) return;
    var confirmado = window.confirm("Vas a volver a asociar columnas. Las correcciones que hiciste en esta vista previa (ediciones, exclusiones, decisiones de duplicados) se perderán. ¿Quieres continuar?");
    if (!confirmado) return;
    eliminarBorrador(userId, esProductos);
    setFilas([]);
    setFiltroVista("todas");
    setFilaExpandidaIdx(null);
    setFechaCreacionBorrador(null);
    setPaso("mapeo");
  }

  // Edición de UNA celda dentro de la vista previa: solo revalida esa fila
  // y vuelve a clasificar sobre las filas YA EXISTENTES , nunca vuelve a
  // leer filasCrudasDatos ni el mapeo, así que ninguna otra fila ni
  // corrección se ve afectada.
  //
  // Caso especial "precio": el input de Precio muestra y edita
  // fila.precioEntrada (el texto EXACTO como lo escribe la persona), nunca
  // fila.campos.precio (el número ya normalizado) , evita que el parser
  // sustituya el texto mientras la persona todavía está escribiendo un
  // decimal ("1." → "1.5").
  function handleEditarCampo(idx, campo, valor) {
    setFilas(function (prev) {
      var copia = prev.slice();
      var filaActual = copia[idx];
      if (campo === "precio") {
        var nuevosCamposP = Object.assign({}, filaActual.campos, { precio: valor });
        var resultadoP = procesarCampos(nuevosCamposP);
        copia[idx] = Object.assign({}, filaActual, {
          precioEntrada: valor, // texto visible , nunca se reemplaza por el número normalizado
          campos: resultadoP.campos,
          errores: resultadoP.errores,
          erroresPorCampo: resultadoP.erroresPorCampo,
          avisos: resultadoP.avisos
        });
      } else {
        var nuevosCampos = Object.assign({}, filaActual.campos);
        nuevosCampos[campo] = valor;
        var resultado = procesarCampos(nuevosCampos);
        copia[idx] = Object.assign({}, filaActual, { campos: resultado.campos, errores: resultado.errores, erroresPorCampo: resultado.erroresPorCampo, avisos: resultado.avisos });
      }
      return recalcularFilas(copia, catalogoActual);
    });
  }

  // Único punto que cambia la decisión de una fila , nunca una casilla y
  // un botón por separado. No hace falta reclasificar las DEMÁS filas
  // (cambiar la decisión de una fila no afecta el nombre de ninguna otra,
  // así que no puede cambiar la clasificación de nadie más).
  function handleCambiarDecision(idx, nuevaDecision) {
    setFilas(function (prev) {
      var copia = prev.slice();
      copia[idx] = Object.assign({}, copia[idx], { decision: nuevaDecision });
      return copia;
    });
  }

  // El bloqueo (bloqueoRef) protege contra un segundo clic mientras React
  // todavía no desmonta este componente. Si la confirmación se completó
  // sin errores, bloqueoRef.current se queda en true A PROPÓSITO y nunca
  // se libera aquí , el componente está a punto de desmontarse cuando el
  // padre cierre el modal. Solo se libera en el camino de error, donde el
  // modal debe seguir abierto y volver a ser usable.
  function handleConfirmar() {
    if (bloqueoRef.current) return; // bloqueo síncrono contra doble clic
    bloqueoRef.current = true;
    setImportando(true);
    try {
      var resultado = construirResultadoImportacion(filas, catalogoActual);
      var mensaje = construirMensajeResultado(resultado.contador, esProductos);
      if (onConfirmar) onConfirmar(resultado.nuevaLista, Object.assign({}, resultado.contador, { mensaje: mensaje }));
      // Éxito confirmado (setCatActivo ya corrió dentro de onConfirmar,
      // de forma síncrona, antes de esta línea): la importación terminó
      // , ahora sí se elimina el borrador guardado.
      eliminarBorrador(userId, esProductos);
      resetTodo();
    } catch (err) {
      // Solo aquí, ante un error real antes de completar la confirmación,
      // se libera el bloqueo para que el modal (que sigue abierto) vuelva
      // a ser usable , el borrador NO se toca, sigue disponible para
      // reintentar.
      bloqueoRef.current = false;
      setImportando(false);
      throw err;
    }
  }

  // "Descartar importación": a diferencia de "Cerrar por ahora", esta sí
  // elimina el borrador , exige confirmación explícita porque es
  // irreversible (se pierde todo el progreso, no solo se pospone).
  function handleDescartarImportacion() {
    var confirmado = window.confirm("¿Descartar esta importación? Se perderá todo el progreso guardado y no podrás continuarla después.");
    if (!confirmado) return;
    eliminarBorrador(userId, esProductos);
    resetTodo();
    if (onCerrar) onCerrar();
  }

  function handleContinuarBorrador() {
    if (!borradorDetectado) return;
    // Se reclasifica contra el catálogo ACTUAL (no el de cuando se guardó
    // el borrador) , pudo haber cambiado mientras tanto. Las decisiones ya
    // tomadas se preservan si siguen teniendo sentido (ver recalcularFilas).
    var filasRecalculadas = recalcularFilas(borradorDetectado.filas, catalogoActual);
    setNombreArchivo(borradorDetectado.nombreArchivo || "");
    setColumnasArchivo(borradorDetectado.columnasArchivo || []);
    setMapeo(borradorDetectado.mapeo || {});
    setFilasCrudasDatos([]); // nunca se persistió , "Cambiar columnas" no estará disponible
    setFilas(filasRecalculadas);
    setFechaCreacionBorrador(borradorDetectado.fechaCreacion || null);
    setFiltroVista("todas");
    setFilaExpandidaIdx(null);
    setBorradorDetectado(null);
    setPaso("vistaPrevia");
  }

  function handleDescartarBorrador() {
    if (!borradorDetectado) return;
    var confirmado = window.confirm("¿Descartar la importación pendiente de \"" + borradorDetectado.nombreArchivo + "\"? Se perderá el progreso guardado.");
    if (!confirmado) return;
    eliminarBorrador(userId, esProductos);
    setBorradorDetectado(null);
    setPaso("seleccion");
  }

  var conteoDecision = contarPorDecision(filas);
  var conteoTipo = contarPorTipo(filas);
  var totalImportable = conteoDecision.listos + conteoDecision.actualizaran + conteoDecision.agregaranDuplicados;
  var hayAlgoQueImportar = totalImportable > 0;

  var filasConIndice = filas.map(function (f, i) { return { fila: f, idx: i }; });
  var filasVisibles = filasConIndice.filter(function (x) {
    if (filtroVista === "errores") return x.fila.tipo === "error";
    if (filtroVista === "duplicados") return x.fila.tipo === "duplicado_archivo" || x.fila.tipo === "duplicado_existente";
    return true;
  });

  function textoBadge(fila) {
    if (fila.tipo === "error") {
      if (fila.decision === "omitir") return "No se importará";
      return "Con " + fila.errores.length + " error" + (fila.errores.length === 1 ? "" : "es");
    }
    if (fila.decision === "omitir") return "No se importará";
    if (fila.decision === "importar") return "Lista para importar";
    if (fila.decision === "actualizar_existente") return "Actualizará existente";
    if (fila.decision === "agregar_como_nuevo") return "Se agregará (duplicado)";
    return "";
  }
  function colorBadge(fila) {
    if (fila.decision === "omitir") return "textDim";
    if (fila.tipo === "error") return "red";
    if (fila.decision === "actualizar_existente") return "purple";
    if (fila.decision === "agregar_como_nuevo") return "amber";
    return "green"; // importar
  }

  function estiloBotonChico(activo) {
    return { cursor: "pointer", padding: "6px 12px", borderRadius: 20, border: "1px solid " + (activo ? C.purple : C.border), background: activo ? C.purple : "transparent", fontSize: 11, color: activo ? "#fff" : C.textMuted, fontWeight: activo ? 600 : 400 };
  }

  // Control de decisión unificado por tipo , la ÚNICA UI que puede cambiar
  // fila.decision. Los mismos botones sirven para la fila expandida; los
  // atajos sin expandir (solo para tipo:"error", ver renderFila) llaman a
  // la misma handleCambiarDecision, nunca a una ruta paralela.
  function renderControlDecision(fila, idx) {
    if (fila.tipo === "valido") {
      if (fila.decision === "omitir") {
        return e("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: C.surfaceUp, border: "1px solid " + C.border, borderRadius: 10, padding: "8px 10px" } },
          e("span", { style: { fontSize: 12, color: C.textMuted } }, "No se importará."),
          e("button", { type: "button", onClick: function () { handleCambiarDecision(idx, "importar"); }, style: estiloBotonChico(false) }, "Volver a incluir")
        );
      }
      return e("div", { style: { display: "flex", justifyContent: "flex-end" } },
        e("button", { type: "button", onClick: function () { handleCambiarDecision(idx, "omitir"); }, style: estiloBotonChico(false) }, "No importar")
      );
    }
    if (fila.tipo === "duplicado_archivo") {
      return renderSegmentado(fila, idx, "Otra fila de este archivo ya tiene este nombre.", [
        { value: "omitir", label: "No importar" },
        { value: "agregar_como_nuevo", label: "Agregar de todas formas" }
      ]);
    }
    if (fila.tipo === "duplicado_existente") {
      var existente = catalogoActual.find(function (it) { return it.id === fila.duplicadoId; });
      var msg = "Ya existe en tu catálogo" + (existente ? ": \"" + existente.nombre + "\" — $" + Number(existente.precio).toLocaleString() : ".");
      return renderSegmentado(fila, idx, msg, [
        { value: "omitir", label: "No importar" },
        { value: "actualizar_existente", label: "Actualizar el existente" },
        { value: "agregar_como_nuevo", label: "Agregar como nuevo" }
      ]);
    }
    if (fila.tipo === "error") {
      if (fila.decision === "omitir") {
        return e("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: C.surfaceUp, border: "1px solid " + C.border, borderRadius: 10, padding: "8px 10px" } },
          e("span", { style: { fontSize: 12, color: C.textMuted } }, "No se importará."),
          e("button", { type: "button", onClick: function () { handleCambiarDecision(idx, "error_pendiente"); }, style: estiloBotonChico(false) }, "Volver a incluir")
        );
      }
      return e("div", { style: { display: "flex", justifyContent: "flex-end" } },
        e("button", { type: "button", onClick: function () { handleCambiarDecision(idx, "omitir"); }, style: estiloBotonChico(false) }, "No importar")
      );
    }
    return null;
  }

  function renderSegmentado(fila, idx, mensaje, opciones) {
    return e("div", { style: { background: C.amberBg, border: "1px solid " + C.amberBorder, borderRadius: 10, padding: "10px" } },
      e("div", { style: { fontSize: 12, color: "#92400E", marginBottom: 8 } }, mensaje),
      e("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
        opciones.map(function (op) {
          var activo = fila.decision === op.value;
          return e("button", { key: op.value, type: "button", onClick: function () { handleCambiarDecision(idx, op.value); }, style: estiloBotonChico(activo) }, op.label);
        })
      )
    );
  }

  function renderDetalleFila(fila, idx) {
    return e("div", { style: { padding: "12px", borderTop: "1px solid " + C.purple + "22", display: "flex", flexDirection: "column", gap: 10 } },
      fila.avisos.length > 0 && e("div", { style: { fontSize: 11, color: C.amber, background: C.amberBg, border: "1px solid " + C.amberBorder, borderRadius: 8, padding: "8px 10px" } },
        fila.avisos.map(function (msg, i) { return e("div", { key: i }, "• " + msg); })
      ),
      e("div", null,
        e("label", { style: st.lbl }, "Nombre"),
        e("input", { value: fila.campos.nombre, onChange: function (ev) { handleEditarCampo(idx, "nombre", ev.target.value); }, style: fila.erroresPorCampo.nombre ? Object.assign({}, st.inp, { borderColor: C.red }) : st.inp }),
        fila.erroresPorCampo.nombre && e("div", { style: { fontSize: 11, color: C.red, marginTop: 4 } }, fila.erroresPorCampo.nombre)
      ),
      e("div", null,
        e("label", { style: st.lbl }, "Precio"),
        e("input", { value: fila.precioEntrada, onChange: function (ev) { handleEditarCampo(idx, "precio", ev.target.value); }, style: fila.erroresPorCampo.precio ? Object.assign({}, st.inp, { borderColor: C.red }) : st.inp, inputMode: "decimal" }),
        fila.erroresPorCampo.precio && e("div", { style: { fontSize: 11, color: C.red, marginTop: 4 } }, fila.erroresPorCampo.precio)
      ),
      e("div", null, e("label", { style: st.lbl }, "Descripción"), e("textarea", { value: fila.campos.descripcion, onChange: function (ev) { handleEditarCampo(idx, "descripcion", ev.target.value); }, style: Object.assign({}, st.inp, { minHeight: 50, resize: "vertical" }) })),
      e("div", null, e("label", { style: st.lbl }, "Condiciones"), e("textarea", { value: fila.campos.condiciones, onChange: function (ev) { handleEditarCampo(idx, "condiciones", ev.target.value); }, style: Object.assign({}, st.inp, { minHeight: 50, resize: "vertical" }) })),
      renderControlDecision(fila, idx)
    );
  }

  function renderFila(item) {
    var fila = item.fila, idx = item.idx;
    var abierta = filaExpandidaIdx === idx;
    var atenuada = fila.decision === "omitir";
    var color = colorBadge(fila);
    var colorTexto = C[color] || C.textMuted;
    var colorFondo = C[color + "Bg"] || C.surfaceUp;
    var colorBorde = C[color + "Border"] || C.border;
    return e("div", { key: fila._id, style: { borderRadius: 12, border: "1.5px solid " + (abierta ? C.purple : C.border), background: abierta ? C.purplePale : C.surface, overflow: "hidden", opacity: atenuada ? 0.55 : 1 } },
      e("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }, onClick: function () { setFilaExpandidaIdx(abierta ? null : idx); } },
        e("span", { style: { fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: colorFondo, color: colorTexto, border: "1px solid " + colorBorde, flexShrink: 0, whiteSpace: "nowrap" } }, textoBadge(fila)),
        e("div", { style: { flex: 1, minWidth: 0 } },
          e("div", { style: { fontWeight: 600, fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, fila.campos.nombre || "(sin nombre)"),
          fila.errores.length > 0
            ? e("div", { style: { fontSize: 11, color: C.red, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, fila.errores.join(" · "))
            : (fila.campos.precio !== "" && e("div", { style: { fontSize: 11, color: C.textMuted, marginTop: 1 } }, "$" + Number(fila.campos.precio).toLocaleString()))
        ),
        // Atajos sin expandir , solo para filas con errores (sección 5): no
        // debe obligar a abrir la tarjeta para decidir "no importar" o para
        // ir a corregirla. stopPropagation evita que el clic también
        // abra/cierre el acordeón.
        fila.tipo === "error" && fila.decision === "error_pendiente" && e("div", { style: { display: "flex", gap: 6, flexShrink: 0 } },
          e("button", { type: "button", onClick: function (ev) { ev.stopPropagation(); setFilaExpandidaIdx(idx); }, style: estiloBotonChico(false) }, "Corregir fila"),
          e("button", { type: "button", onClick: function (ev) { ev.stopPropagation(); handleCambiarDecision(idx, "omitir"); }, style: estiloBotonChico(false) }, "No importar")
        ),
        fila.tipo === "error" && fila.decision === "omitir" && e("div", { style: { flexShrink: 0 } },
          e("button", { type: "button", onClick: function (ev) { ev.stopPropagation(); handleCambiarDecision(idx, "error_pendiente"); }, style: estiloBotonChico(false) }, "Volver a incluir")
        ),
        e("svg", { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", style: { flexShrink: 0, transition: "transform 0.2s", transform: abierta ? "rotate(180deg)" : "rotate(0deg)" } },
          e("path", { d: "M19 9l-7 7-7-7", stroke: C.textDim, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }))
      ),
      abierta && renderDetalleFila(fila, idx)
    );
  }

  function renderResumen() {
    var chips = [
      { label: "Listos para importar", valor: conteoDecision.listos, color: "green" },
      { label: "Actualizarán existentes", valor: conteoDecision.actualizaran, color: "purple" },
      { label: "Se agregarán (duplicados)", valor: conteoDecision.agregaranDuplicados, color: "amber" },
      { label: "Omitidos", valor: conteoDecision.omitidos, color: "textDim" },
      { label: "Con errores", valor: conteoDecision.conErrores, color: "red" }
    ];
    return e("div", { style: { display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(5,1fr)", gap: 8, marginBottom: 10 } },
      chips.map(function (c) {
        var colorVal = c.color === "textDim" ? C.textDim : (C[c.color] || C.textMuted);
        return e("div", { key: c.label, style: { background: C.surfaceUp, border: "1px solid " + C.border, borderRadius: 10, padding: "10px 8px", textAlign: "center" } },
          e("div", { style: { fontSize: 18, fontWeight: 700, color: colorVal } }, c.valor),
          e("div", { style: { fontSize: 9, color: C.textMuted, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.3 } }, c.label)
        );
      })
    );
  }

  // Panel de asociación de columnas , SOLO se usa en el paso "mapeo". La
  // llave de cada fila/valor es siempre col.indice (nunca el texto del
  // encabezado), así dos columnas con el mismo nombre ("Precio" repetido)
  // conservan asociaciones independientes.
  function renderMapeoColumnas() {
    return e("div", { style: { background: C.surfaceUp, borderRadius: 12, padding: "12px", border: "1px solid " + C.border } },
      e("div", { style: { fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 } }, "Columnas de tu archivo"),
      e("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
        columnasArchivo.map(function (col) {
          return e("div", { key: col.indice, style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
            e("div", { style: { fontSize: 12, color: C.text, fontWeight: 600, minWidth: 0, flex: "1 1 140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, "\"" + col.etiqueta + "\""),
            e("span", { style: { fontSize: 11, color: C.textDim, flexShrink: 0 } }, "corresponde a"),
            e("select", { value: mapeo[col.indice] || "ignorar", onChange: function (ev) { handleCambiarMapeo(col.indice, ev.target.value); }, style: { padding: "6px 8px", borderRadius: 8, border: "1px solid " + C.borderStrong, background: C.surface, color: C.text, fontSize: 12, flexShrink: 0 } },
              CAMPOS_DESTINO.map(function (c) { return e("option", { key: c.key, value: c.key }, c.label); })
            )
          );
        })
      )
    );
  }

  function renderFiltros() {
    var opciones = [
      { key: "todas", label: "Todas (" + filas.length + ")" },
      { key: "errores", label: "Con errores (" + conteoTipo.errores + ")" },
      { key: "duplicados", label: "Duplicados (" + conteoTipo.duplicados + ")" }
    ];
    return e("div", { style: { display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" } },
      opciones.map(function (op) {
        var activo = filtroVista === op.key;
        return e("button", {
          key: op.key, type: "button", onClick: function () { setFiltroVista(op.key); },
          style: { cursor: "pointer", padding: "6px 14px", borderRadius: 20, border: "1px solid " + (activo ? C.purple : C.border), background: activo ? C.purple : "transparent", fontSize: 12, color: activo ? "#fff" : C.textMuted, fontWeight: activo ? 600 : 400 }
        }, op.label);
      })
    );
  }

  function renderRestaurar() {
    if (!borradorDetectado) return null;
    var n = borradorDetectado.filas.length;
    return e("div", null,
      e("div", { style: { background: C.purplePale, border: "1px solid " + C.purple + "33", borderRadius: 12, padding: "14px 16px", marginBottom: 18, fontSize: 13, color: C.purple, lineHeight: 1.5 } },
        "Tienes una importación pendiente de \"" + borradorDetectado.nombreArchivo + "\".",
        e("div", { style: { fontSize: 11, color: C.purple, opacity: 0.8, marginTop: 4 } }, n + " fila" + (n === 1 ? "" : "s") + " revisada" + (n === 1 ? "" : "s") + " anteriormente.")
      ),
      e("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
        e("button", { type: "button", onClick: handleContinuarBorrador, style: st.btnP }, "Continuar importación"),
        e("button", { type: "button", onClick: handleDescartarBorrador, style: st.btn }, "Descartar y comenzar otra")
      )
    );
  }

  function renderSeleccion() {
    return e("div", null,
      e("div", { style: { background: C.purplePale, border: "1px solid " + C.purple + "33", borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 12, color: C.purple, lineHeight: 1.5 } },
        "Tu archivo solo se utilizará para leer el catálogo. CLEO no guardará ni subirá el documento original."
      ),
      e("div", { style: { marginBottom: 16 } },
        e("button", {
          type: "button", onClick: function () { descargarPlantilla(esProductos); },
          style: { cursor: "pointer", background: "none", border: "1px dashed " + C.border, fontSize: 12, color: C.purple, padding: "8px 14px", borderRadius: 10, fontWeight: 500 }
        }, "Descargar plantilla de " + (esProductos ? "Productos" : "Servicios"))
      ),
      e("input", { ref: fileInputRef, type: "file", accept: ".csv,.xlsx,.xls", style: { display: "none" }, onChange: handleSeleccionArchivo }),
      e("button", {
        type: "button", disabled: procesando, onClick: function () { if (fileInputRef.current) fileInputRef.current.click(); },
        style: { cursor: procesando ? "wait" : "pointer", width: "100%", padding: "28px 16px", borderRadius: 14, border: "2px dashed " + C.border, background: C.surfaceUp, color: C.textMuted, fontSize: 13, textAlign: "center" }
      }, procesando ? "Leyendo archivo..." : "Toca para elegir un archivo (.csv, .xlsx, .xls)"),
      e("div", { style: { fontSize: 11, color: C.textDim, marginTop: 10, lineHeight: 1.6 } }, "Máximo 5 MB por archivo · Máximo 500 filas"),
      errorArchivo && e("div", { style: { marginTop: 14, fontSize: 12, color: C.red, background: C.redBg, border: "1px solid " + C.redBorder, borderRadius: 10, padding: "10px 12px" } }, errorArchivo)
    );
  }

  function renderMapeo() {
    return e("div", null,
      e("div", { style: { fontSize: 12, color: C.textMuted, marginBottom: 14 } }, "Archivo: " + nombreArchivo + " · " + filasCrudasDatos.length + " fila" + (filasCrudasDatos.length === 1 ? "" : "s") + " detectada" + (filasCrudasDatos.length === 1 ? "" : "s")),
      e("div", { style: { fontSize: 12, color: C.text, marginBottom: 14, lineHeight: 1.5 } }, "Revisa que cada columna de tu archivo esté asociada al campo correcto. Podrás corregir valores individuales en el siguiente paso, pero la asociación de columnas se aplica a todo el archivo de una vez."),
      renderMapeoColumnas()
    );
  }

  function renderVistaPrevia() {
    return e("div", null,
      sinAlmacenamientoTemporal && e("div", { style: { marginBottom: 14, fontSize: 12, color: C.amber, background: C.amberBg, border: "1px solid " + C.amberBorder, borderRadius: 10, padding: "10px 12px", lineHeight: 1.5 } },
        "No pudimos guardar temporalmente tu progreso. Podría perderse si sales de esta pantalla."
      ),
      e("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 14 } },
        e("div", { style: { fontSize: 12, color: C.textMuted } }, "Archivo: " + nombreArchivo),
        filasCrudasDatos.length > 0
          ? e("button", { type: "button", onClick: handleVolverAMapeo, style: { cursor: "pointer", background: "none", border: "none", color: C.purple, fontSize: 12, fontWeight: 600, textDecoration: "underline", padding: 0 } }, "← Cambiar columnas")
          : e("span", { style: { fontSize: 11, color: C.textDim } }, "No puedes cambiar las columnas después de continuar una importación guardada.")
      ),
      renderResumen(),
      e("div", { style: { fontSize: 11, color: C.textDim, marginBottom: 14, lineHeight: 1.5 } }, "Las filas omitidas, con errores o con duplicados no resueltos no se importarán."),
      renderFiltros(),
      e("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
        filasVisibles.length === 0
          ? e("div", { style: { textAlign: "center", padding: "20px 0", color: C.textDim, fontSize: 13 } }, "No hay filas en este filtro.")
          : filasVisibles.map(renderFila)
      )
    );
  }

  return e("div", { style: st.ov, onClick: handleCerrarPorAhora },
    e("div", { style: Object.assign({}, st.modal2.outer, { maxWidth: isMobile ? "100%" : 840, width: isMobile ? "100%" : "92vw" }), onClick: function (ev) { ev.stopPropagation(); } },
      e("div", { style: st.modal2.header },
        e("div", null,
          e("div", { style: { fontWeight: 700, fontSize: 18, color: C.text } }, "Importar catálogo"),
          e("div", { style: { fontSize: 12, color: C.textMuted, marginTop: 2 } }, esProductos ? "Sube tus productos desde un archivo" : "Sube tus servicios desde un archivo")
        ),
        e("button", { style: { background: C.surfaceUp, border: "1px solid " + C.border, cursor: "pointer", color: C.textDim, fontSize: 18, padding: "6px 10px", borderRadius: 10, lineHeight: 1 }, onClick: handleCerrarPorAhora }, "×")
      ),
      e("div", { style: st.modal2.body },
        paso === "restaurar" ? renderRestaurar() : (paso === "seleccion" ? renderSeleccion() : (paso === "mapeo" ? renderMapeo() : renderVistaPrevia()))
      ),
      e("div", { style: Object.assign({}, st.modal2.footer, { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }) },
        e("div", { style: { display: "flex", gap: 8 } },
          paso === "vistaPrevia" && e("button", { type: "button", onClick: handleDescartarImportacion, style: { cursor: "pointer", background: "none", border: "1px solid " + C.redBorder, color: C.red, fontSize: 12, fontWeight: 600, padding: "9px 14px", borderRadius: 10 } }, "Descartar importación"),
          paso !== "restaurar" && e("button", { type: "button", style: st.btn, onClick: handleCerrarPorAhora }, paso === "vistaPrevia" ? "Cerrar por ahora" : "Cancelar")
        ),
        e("div", { style: { display: "flex", gap: 8 } },
          paso === "restaurar" && e("button", { type: "button", style: st.btn, onClick: handleCerrarPorAhora }, "Cerrar por ahora"),
          paso === "mapeo" && e("button", { type: "button", onClick: handleRevisarCatalogo, style: st.btnP }, "Revisar catálogo"),
          paso === "vistaPrevia" && e("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 } },
            e("button", {
              type: "button",
              disabled: importando || !hayAlgoQueImportar,
              onClick: handleConfirmar,
              style: Object.assign({}, st.btnP, { opacity: (importando || !hayAlgoQueImportar) ? 0.5 : 1 })
            }, importando ? "Importando..." : "Importar " + totalImportable + " " + (esProductos ? "productos" : "servicios")),
            !hayAlgoQueImportar && e("div", { style: { fontSize: 11, color: C.textDim, maxWidth: 220, textAlign: "right" } }, "No hay ninguna fila lista para importar. Corrige, incluye o resuelve al menos una fila.")
          )
        )
      )
    )
  );
}
