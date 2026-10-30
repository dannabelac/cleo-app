import { useState, useMemo } from "react";

const MESES_CORTOS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const MESES_LARGO  = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS_SEMANA  = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const C_TEAL = "#0D9488"; // mismo acento que ya usa la pantalla real de Eventos en Inventario

// ── Helpers de fecha y rango ───────────────────────────────────────────────────

// Una fecha-hora real trae componente de hora ("...T..." o "... ..."). Una
// fecha pura "YYYY-MM-DD" (10 caracteres) NO la trae: parsearla con
// `new Date(...).getHours()` daría una hora inventada por el desfase de zona
// horaria al asumir medianoche UTC. Nunca se le asigna una hora por defecto.
function tieneHoraReal(ts) {
  if (!ts) return false;
  const s = String(ts);
  return s.length > 10 && (s.indexOf("T") !== -1 || s.indexOf(" ") !== -1);
}

// Agregación pura sobre un conjunto YA FILTRADO de pedidos/ventas — no decide
// qué pertenece al conjunto (eso lo hacen calcularMetricasRango, por fecha, y
// calcularMetricasEvento, por eventoId explícito). Pantalla, insights y el
// detalle de evento comparten esta misma función, nunca cálculos paralelos.
function agregarMetricas(pedSet, ventaSet, obtenerItemsPedido) {
  let montoVendido = 0;
  pedSet.forEach(p => { montoVendido += Number(p.total || 0); });
  ventaSet.forEach(v => { montoVendido += Number(v.monto || 0); });
  const numVentas = pedSet.length + ventaSet.length;
  const promedio = numVentas > 0 ? montoVendido / numVentas : 0;

  const productosMonto = {};
  const productosUnidades = {};
  pedSet.forEach(ped => {
    const items = obtenerItemsPedido(ped);
    if (items.length > 0) {
      items.forEach(item => {
        const k = (item.nombre || "Sin nombre").trim();
        const m = Number(item.total || Number(item.precioUnitario || 0) * Number(item.cantidad || 1));
        productosMonto[k] = (productosMonto[k] || 0) + m;
        productosUnidades[k] = (productosUnidades[k] || 0) + Number(item.cantidad || 1);
      });
    } else {
      const k = (ped.productos || "Sin desglose").trim();
      productosMonto[k] = (productosMonto[k] || 0) + Number(ped.total || 0);
    }
  });
  ventaSet.forEach(v => {
    const items = (v.items || []).filter(it => it.nombre || it.concepto);
    if (items.length > 0) {
      items.forEach(item => {
        const k = (item.nombre || item.concepto || "Sin nombre").trim();
        const m = Number(item.total || Number(item.precioUnitario || 0) * Number(item.cantidad || 1));
        productosMonto[k] = (productosMonto[k] || 0) + m;
      });
    } else if (v.concepto) {
      productosMonto[v.concepto.trim()] = (productosMonto[v.concepto.trim()] || 0) + Number(v.monto || 0);
    }
  });

  const porHora = {};
  const registros = [];
  const registrarHora = (ts, monto) => {
    const conHora = tieneHoraReal(ts);
    const key = conHora ? String(new Date(ts).getHours()) : "sin_horario";
    if (!porHora[key]) porHora[key] = { monto: 0, count: 0 };
    porHora[key].monto += Number(monto || 0);
    porHora[key].count++;
    registros.push({ ts: conHora ? ts : null, monto: Number(monto || 0), conHora });
  };
  pedSet.forEach(ped => registrarHora(ped.fechaCreado, ped.total));
  ventaSet.forEach(v => registrarHora(v.fechaHoraCreacion, v.monto));

  const porDia = {};
  pedSet.forEach(ped => {
    const k = ped.fecha || (ped.fechaCreado || "").slice(0, 10);
    if (k) { if (!porDia[k]) porDia[k] = { monto: 0, count: 0 }; porDia[k].monto += Number(ped.total || 0); porDia[k].count++; }
  });
  ventaSet.forEach(v => {
    if (v.fecha) { if (!porDia[v.fecha]) porDia[v.fecha] = { monto: 0, count: 0 }; porDia[v.fecha].monto += Number(v.monto || 0); porDia[v.fecha].count++; }
  });

  return { montoVendido, numVentas, promedio, productosMonto, productosUnidades, porHora, porDia, registros };
}

function calcularMetricasRango(desde, hasta, pedidos, ventas, obtenerItemsPedido, enRangoFechas) {
  const pedRango = pedidos.filter(p => {
    const f = p.fecha || (p.fechaCreado || "").slice(0, 10);
    return enRangoFechas(f, desde, hasta) && p.estadoPedido !== "cancelado";
  });
  const ventasRango = ventas.filter(v => enRangoFechas(v.fecha, desde, hasta));
  return agregarMetricas(pedRango, ventasRango, obtenerItemsPedido);
}

// Pedidos/ventas de un evento se identifican por vínculo EXPLÍCITO
// (p.eventoId / v.eventoId, o evento.pedidosIds) — nunca porque su fecha
// coincide con el rango del evento. Pueden existir ventas ajenas al evento
// en esas mismas fechas, o eventos simultáneos; esto los mantiene separados.
function calcularMetricasEvento(evento, pedidos, ventas, obtenerItemsPedido) {
  const idsPed = new Set((evento.pedidosIds || []).map(String));
  pedidos.forEach(p => { if (p.eventoId && String(p.eventoId) === String(evento.id)) idsPed.add(String(p.id)); });
  const pedEvt = pedidos.filter(p => idsPed.has(String(p.id)) && p.estadoPedido !== "cancelado");
  const ventasEvt = ventas.filter(v => v.eventoId && String(v.eventoId) === String(evento.id));
  const base = agregarMetricas(pedEvt, ventasEvt, obtenerItemsPedido);
  // Cobrado = pagos reales recibidos a la fecha de hoy por pedidos/ventas de
  // este evento, sin importar cuándo llegó el pago (uno puede llegar después
  // de que el evento termine) — distinto de "monto vendido".
  let cobrado = 0;
  pedEvt.forEach(p => { (p.pagos || []).forEach(pg => { cobrado += Number(pg.monto || 0); }); });
  ventasEvt.forEach(v => { (v.pagos || []).forEach(pg => { cobrado += Number(pg.monto || 0); }); });
  return Object.assign({}, base, { cobrado });
}

function labelFecha(s) {
  if (!s) return "";
  const [, m, d] = s.split("-");
  return `${Number(d)} ${MESES_CORTOS[Number(m) - 1]}`;
}

function labelFechaLarga(s) {
  if (!s) return "";
  const [, m, d] = s.split("-").map(Number);
  return d + " de " + MESES_LARGO[m - 1];
}

function labelRango(desde, hasta) {
  if (!desde || !hasta) return "";
  if (desde === hasta) return labelFecha(desde);
  const [y1, m1, d1] = desde.split("-");
  const [y2, m2, d2] = hasta.split("-");
  if (m1 === m2 && y1 === y2) return `${Number(d1)}–${Number(d2)} ${MESES_CORTOS[Number(m1) - 1]}`;
  if (y1 === y2) return `${Number(d1)} ${MESES_CORTOS[Number(m1) - 1]} – ${Number(d2)} ${MESES_CORTOS[Number(m2) - 1]}`;
  return `${labelFecha(desde)} ${y1} – ${labelFecha(hasta)} ${y2}`;
}

function generarDiasEnRango(desde, hasta, fmtFechaLocal, parseFechaLocal) {
  const dias = [];
  const d = parseFechaLocal(desde);
  const fin = parseFechaLocal(hasta);
  while (d <= fin) { dias.push(fmtFechaLocal(new Date(d))); d.setDate(d.getDate() + 1); }
  return dias;
}

function rangoSemana(refStr, fmtFechaLocal, parseFechaLocal) {
  const ref = parseFechaLocal(refStr);
  const ini = new Date(ref); ini.setDate(ref.getDate() - ref.getDay());
  const fin = new Date(ini); fin.setDate(ini.getDate() + 6);
  return { desde: fmtFechaLocal(ini), hasta: fmtFechaLocal(fin) };
}

function rangoMes(year, month, fmtFechaLocal) {
  const ini = new Date(year, month, 1);
  const fin = new Date(year, month + 1, 0);
  return { desde: fmtFechaLocal(ini), hasta: fmtFechaLocal(fin) };
}

function ultimosNDias(n, HOY, fmtFechaLocal) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(HOY); d.setDate(d.getDate() - i); out.push(fmtFechaLocal(d)); }
  return out;
}

function ultimosNDiaSemana(n, HOY, fmtFechaLocal) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(HOY); d.setDate(d.getDate() - i * 7); out.push(fmtFechaLocal(d)); }
  return out;
}

function pluralDiaSemana(i) {
  const n = DIAS_SEMANA[i];
  return (n === "sábado" || n === "domingo") ? n + "s" : n;
}

function capDiaSemana(i) {
  const n = DIAS_SEMANA[i];
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function fmtHora12(ts) {
  const d = new Date(ts);
  const h = d.getHours(), m = d.getMinutes();
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return h12 + (m ? ":" + String(m).padStart(2, "0") : "") + " " + (h < 12 ? "am" : "pm");
}

// Hallazgo factual de "Comparar fechas": describe lo observado (el día con
// mayor monto vendido entre los seleccionados), nunca como tendencia ni
// "tu mejor día habitual" — con 2 a 7 fechas no hay base para eso.
function hallazgoComparar(dias, mets, parseFechaLocal) {
  if (!dias || dias.length === 0) return "";
  const conMonto = dias.map(f => ({ fecha: f, monto: mets[f] ? mets[f].montoVendido : 0 }));
  if (conMonto.every(d => d.monto === 0)) return "Ninguno de los " + dias.length + " días seleccionados tiene ventas registradas.";
  const top = conMonto.slice().sort((a, b) => b.monto - a.monto)[0];
  const empatados = conMonto.filter(d => d.monto === top.monto);
  const mismoDiaSemana = dias.length > 1 && dias.every(f => parseFechaLocal(f).getDay() === parseFechaLocal(dias[0]).getDay());
  const unidad = mismoDiaSemana ? pluralDiaSemana(parseFechaLocal(dias[0]).getDay()) : (dias.length === 1 ? "día" : "días");
  if (empatados.length > 1) return "Hay un empate en el monto vendido más alto entre " + empatados.length + " de los " + dias.length + " " + unidad + " seleccionados.";
  const dTop = parseFechaLocal(top.fecha);
  const fechaTxt = capDiaSemana(dTop.getDay()) + " " + dTop.getDate();
  return fechaTxt + " tuvo el mayor monto vendido de los " + dias.length + " " + unidad + " seleccionados.";
}

// Mismo criterio que hallazgoComparar, pero por evento: nunca "el más
// rentable" (eso requeriría costos, fuera de alcance), solo monto vendido.
function hallazgoEventos(ids, eventosPorId, mets) {
  if (!ids || ids.length === 0) return "";
  const conMonto = ids.map(id => ({ id, monto: mets[id] ? mets[id].montoVendido : 0 }));
  if (conMonto.every(d => d.monto === 0)) return "Ninguno de los " + ids.length + " eventos seleccionados tiene ventas registradas.";
  const top = conMonto.slice().sort((a, b) => b.monto - a.monto)[0];
  const empatados = conMonto.filter(d => d.monto === top.monto);
  if (empatados.length > 1) return "Hay un empate en el monto vendido más alto entre " + empatados.length + " de los " + ids.length + " eventos seleccionados.";
  const ev = eventosPorId[top.id];
  return (ev ? ev.nombre : "Un evento") + " tuvo el mayor monto vendido de los " + ids.length + " eventos seleccionados.";
}

function notaEventosEnCurso(ids, eventosPorId) {
  const enCurso = (ids || []).filter(id => eventosPorId[id] && eventosPorId[id].estado === "abierto");
  if (enCurso.length === 0) return "";
  if (enCurso.length === 1) return eventosPorId[enCurso[0]].nombre + " sigue en curso — su total todavía puede cambiar.";
  return enCurso.length + " de los eventos seleccionados siguen en curso — sus totales todavía pueden cambiar.";
}

// ── Gráfica compacta de días (compartida por "Ver un período" y "Comparar fechas") ──
// Ocupa siempre el 100% del ancho del contenedor (sin scroll horizontal, ni
// en meses de 31 días). Escala y base comunes desde cero. Etiqueta estable de
// fecha+monto seleccionados (no se mueve con la barra tocada). El resaltado
// de selección (punto debajo) es independiente de la altura de la barra.
// Cada barra es un <button>: accesible con toque y teclado.

function GraficaDias({ dias, datos, diaActivo, onSelect, isMobile, formatoDinero, parseFechaLocal, FECHA_HOY, invitacion }) {
  if (!dias || dias.length === 0) return null;
  const muchos = dias.length > 10;
  const maxMonto = Math.max(1, ...dias.map(f => (datos[f] && datos[f].monto) || 0));
  const mostrarTodasEtiquetas = dias.length <= 10;
  const step = mostrarTodasEtiquetas ? 1 : Math.ceil(dias.length / 8);

  const infoActivo = diaActivo ? (datos[diaActivo] || { monto: 0, count: 0 }) : null;
  const activoEsFutura = diaActivo ? diaActivo > FECHA_HOY : false;

  return (
    <div>
      {invitacion !== "" && (
        <div style={{ minHeight: 22, marginBottom: 8 }}>
          {diaActivo ? (
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0E1328" }}>
              {labelFechaLarga(diaActivo)} — {activoEsFutura ? "fecha futura" : infoActivo.monto > 0 ? "$" + formatoDinero(infoActivo.monto) + " vendido" : "sin ventas registradas"}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: "#9CA3AF" }}>{invitacion || "Toca un día para ver qué vendiste"}</div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: muchos ? 2 : 6, alignItems: "flex-end", height: 110, width: "100%" }}>
        {dias.map((f, i) => {
          const info = datos[f] || { monto: 0, count: 0 };
          const esFutura = f > FECHA_HOY;
          const h = info.monto > 0 ? Math.max(4, Math.round((info.monto / maxMonto) * 78)) : 3;
          const activo = f === diaActivo;
          const mostrarEtiqueta = mostrarTodasEtiquetas || i === 0 || i === dias.length - 1 || activo || i % step === 0;
          const d = parseFechaLocal(f);
          return (
            <button key={f} type="button" onClick={() => !esFutura && onSelect(f)} disabled={esFutura}
              aria-pressed={activo}
              aria-label={labelFechaLarga(f) + ": " + (esFutura ? "fecha futura, todavía sin datos" : info.monto > 0 ? "$" + formatoDinero(info.monto) + " vendido" : "sin ventas registradas")}
              style={{
                flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "flex-end", gap: 4, background: "none", border: 0, padding: "0 1px",
                cursor: esFutura ? "default" : "pointer", fontFamily: "inherit", opacity: esFutura ? 0.4 : 1, height: "100%",
              }}>
              <div style={{
                width: "100%", maxWidth: muchos ? 14 : 34, height: h, borderRadius: "3px 3px 0 0",
                background: esFutura ? "#E3E6EF" : "rgba(63,75,208,0.35)",
              }} />
              {mostrarEtiqueta && (
                <div style={{ fontSize: 9, color: activo ? "#0E1328" : "#9CA3AF", fontWeight: activo ? 800 : 600, whiteSpace: "nowrap" }}>
                  {d.getDate()}{(!muchos || dias.length <= 10) ? " " + MESES_CORTOS[d.getMonth()] : ""}
                </div>
              )}
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: activo ? "#3F4BD0" : "transparent" }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Gráfica compacta de eventos (mismo lenguaje visual, acento teal) ─────────

function GraficaEventos({ eventos, eventosPorId, metsEventos, eventoActivo, onSelect, isMobile, formatoDinero }) {
  if (!eventos || eventos.length === 0) return null;
  const maxMonto = Math.max(1, ...eventos.map(id => (metsEventos[id] && metsEventos[id].montoVendido) || 0));
  const evActivo = eventoActivo ? eventosPorId[eventoActivo] : null;
  const infoActivo = eventoActivo ? metsEventos[eventoActivo] : null;
  return (
    <div>
      <div style={{ minHeight: 22, marginBottom: 8 }}>
        {evActivo ? (
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0E1328" }}>
            {evActivo.nombre} — {infoActivo && infoActivo.montoVendido > 0 ? "$" + formatoDinero(infoActivo.montoVendido) + " vendido" : "sin ventas registradas"}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: "#9CA3AF" }}>Toca un evento para ver su detalle</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 110, width: "100%" }}>
        {eventos.map(id => {
          const ev = eventosPorId[id];
          if (!ev) return null;
          const met = metsEventos[id] || { montoVendido: 0 };
          const h = met.montoVendido > 0 ? Math.max(4, Math.round((met.montoVendido / maxMonto) * 78)) : 3;
          const sel = id === eventoActivo;
          return (
            <button key={id} type="button" onClick={() => onSelect(id)} aria-pressed={sel}
              aria-label={ev.nombre + ": " + (met.montoVendido > 0 ? "$" + formatoDinero(met.montoVendido) + " vendido" : "sin ventas registradas")}
              style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4, background: "none", border: 0, padding: "0 2px", cursor: "pointer", fontFamily: "inherit", height: "100%" }}>
              <div style={{ width: "100%", maxWidth: 34, height: h, borderRadius: "3px 3px 0 0", background: "rgba(13,148,136,0.35)" }} />
              <div style={{ fontSize: 9, color: sel ? "#0E1328" : "#9CA3AF", fontWeight: sel ? 800 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{ev.nombre}</div>
              {ev.estado === "abierto" && <div style={{ fontSize: 8, color: C_TEAL, fontWeight: 700 }}>EN CURSO</div>}
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: sel ? C_TEAL : "transparent" }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Desglose por producto/servicio ────────────────────────────────────────────
// Un solo período/evento: lista simple ordenable. Dos (comparar 2 días o 2
// eventos): tabla alineada con el mismo peso visual para ambos — nunca un
// monto "principal" y el otro como nota secundaria. "Sin ventas" cuando el
// producto no aparece ahí (nunca se inventa un $0 como si fuera un dato real).

function DesgloseProductos({ met, metComp, lblMet, lblComp, formatoDinero, TXT, isMobile, onVerRegistro }) {
  const [modoOrden, setModoOrden] = useState("monto");
  if (!met) return null;
  const todasKeys = metComp ? [...new Set([...Object.keys(met.productosMonto), ...Object.keys(metComp.productosMonto)])] : Object.keys(met.productosMonto);

  if (todasKeys.length === 0) {
    return (
      <div>
        <div style={{ fontSize: isMobile ? 15 : 14, fontWeight: 800, color: "#0E1328", marginBottom: 6 }}>Sin ventas con desglose{lblMet ? (" en " + lblMet) : ""}.</div>
        <div style={{ fontSize: 13, color: "#4A5068" }}>{"Cuando registres ventas con " + TXT.vista2low + " específicos, aquí verás cuáles te funcionan mejor."}</div>
      </div>
    );
  }

  const hayUnidades = Object.values(met.productosUnidades).some(u => u > 0) || (metComp && Object.values(metComp.productosUnidades).some(u => u > 0));
  const filas = todasKeys.map(k => ({
    nombre: k,
    mA: met.productosMonto[k] || 0,
    mB: metComp ? (metComp.productosMonto[k] || 0) : null,
    uA: met.productosUnidades[k] || 0,
    uB: metComp ? (metComp.productosUnidades[k] || 0) : null,
  })).sort((a, b) => modoOrden === "qty" ? b.uA - a.uA : b.mA - a.mA);

  const sinDesglose = filas.some(f => f.nombre === "Sin desglose");

  // ── Dos períodos/eventos: tabla alineada, mismo peso para ambos ───────────
  if (metComp) {
    const cols = isMobile ? "1.1fr 1fr 1fr" : "1.4fr 1fr 1fr";
    return (
      <div>
        {filas.length > 1 && hayUnidades && (
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {[["monto", "Por monto vendido"], ["qty", "Por cantidad"]].map(([k, lbl]) => (
              <button key={k} onClick={() => setModoOrden(k)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 14, border: "1.5px solid " + (modoOrden === k ? "#3F4BD0" : "#E3E6EF"), background: modoOrden === k ? "#EEF0FF" : "transparent", color: modoOrden === k ? "#3F4BD0" : "#4A5068", cursor: "pointer", fontWeight: modoOrden === k ? 800 : 600, fontFamily: "inherit" }}>{lbl}</button>
            ))}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "0 2px 8px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.04em" }}>{TXT.vista2}</div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#0E1328", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: isMobile ? "left" : "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lblMet}</div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#0E1328", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: isMobile ? "left" : "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lblComp}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {filas.slice(0, 12).map((p, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 8, padding: "11px 2px", borderTop: "1px solid #EDEFF5" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0E1328", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</div>
                {hayUnidades && (p.uA > 0 || p.uB > 0) && (
                  <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, marginTop: 1 }}>
                    {p.uA > 0 ? p.uA + " u. (" + lblMet + ")" : ""}{p.uA > 0 && p.uB > 0 ? " · " : ""}{p.uB > 0 ? p.uB + " u. (" + lblComp + ")" : ""}
                  </div>
                )}
              </div>
              <button type="button" onClick={onVerRegistro} style={{ fontSize: 14, fontWeight: 800, color: p.mA > 0 ? "#0E1328" : "#9CA3AF", textAlign: isMobile ? "left" : "right", background: "none", border: 0, padding: 0, cursor: onVerRegistro ? "pointer" : "default", fontFamily: "inherit" }}>
                {p.mA > 0 ? "$" + formatoDinero(p.mA) : "Sin ventas"}
              </button>
              <button type="button" onClick={onVerRegistro} style={{ fontSize: 14, fontWeight: 800, color: p.mB > 0 ? "#0E1328" : "#9CA3AF", textAlign: isMobile ? "left" : "right", background: "none", border: 0, padding: 0, cursor: onVerRegistro ? "pointer" : "default", fontFamily: "inherit" }}>
                {p.mB > 0 ? "$" + formatoDinero(p.mB) : "Sin ventas"}
              </button>
            </div>
          ))}
        </div>
        {filas.length > 12 && <div style={{ fontSize: 12, color: "#6E7489", textAlign: "center", padding: "6px 0" }}>+{filas.length - 12} {TXT.vista2low} más</div>}
        {sinDesglose && <div style={{ fontSize: 11, color: "#6E7489", marginTop: 10, lineHeight: 1.5 }}>«Sin desglose» agrupa {TXT.pedido + "s"} sin ítems individuales.</div>}
      </div>
    );
  }

  // ── Un solo período/evento: lista simple ───────────────────────────────────
  const maxTotal = Math.max(1, ...filas.map(f => f.mA));
  const porcentaje = (m, total) => total > 0 ? Math.round((m / total) * 100) : 0;
  return (
    <div>
      {filas.length > 1 && hayUnidades && (
        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
          {[["monto", "Por monto vendido"], ["qty", "Por cantidad"]].map(([k, lbl]) => (
            <button key={k} onClick={() => setModoOrden(k)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 14, border: "1.5px solid " + (modoOrden === k ? "#3F4BD0" : "#E3E6EF"), background: modoOrden === k ? "#EEF0FF" : "transparent", color: modoOrden === k ? "#3F4BD0" : "#4A5068", cursor: "pointer", fontWeight: modoOrden === k ? 800 : 600, fontFamily: "inherit" }}>{lbl}</button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {filas.slice(0, 12).map((p, i) => {
          const barA = Math.max(3, Math.round((p.mA / maxTotal) * 120));
          const pct = porcentaje(p.mA, met.montoVendido);
          return (
            <div key={i} style={{ background: "#F4F5FA", borderRadius: 12, padding: "10px 14px", border: "1px solid #E3E6EF" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0E1328", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</div>
                  {p.uA > 0 && <div style={{ fontSize: 11, color: "#6E7489", marginTop: 1 }}>{p.uA} {p.uA === 1 ? "unidad" : "unidades"}</div>}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#0E1328" }}>{p.mA > 0 ? "$" + formatoDinero(p.mA) : "$0"}</div>
                  {p.mA > 0 && <div style={{ fontSize: 10, color: "#6E7489" }}>{pct}% del total</div>}
                </div>
              </div>
              <div style={{ height: 6, background: "#E3E6EF", borderRadius: 3 }}>
                <div style={{ width: barA + "px", maxWidth: "100%", height: "100%", background: "#3F4BD0", borderRadius: 3 }} />
              </div>
            </div>
          );
        })}
        {filas.length > 12 && <div style={{ fontSize: 12, color: "#6E7489", textAlign: "center", padding: "6px 0" }}>+{filas.length - 12} {TXT.vista2low} más</div>}
      </div>
      {sinDesglose && <div style={{ fontSize: 11, color: "#6E7489", marginTop: 10, lineHeight: 1.5 }}>«Sin desglose» agrupa {TXT.pedido + "s"} sin ítems individuales.</div>}
    </div>
  );
}

// ── Vista "A qué hora vendiste" — un día/evento, o dos (comparar) ─────────────
// Con pocas operaciones (o todas en la misma hora), lista cada registro
// directo en vez de hablar de "la hora con más ventas" — con 1-3 datos eso
// suena a patrón que no existe. Siempre indica cuántas ventas tienen hora
// registrada y cuántas no. Nunca usa la hora de captura/migración como si
// fuera la hora real de venta (ver tieneHoraReal).

function VistaCuandoCompran({ met, metComp, lblMet, lblComp, isMobile, formatoDinero, TXT }) {
  if (!met) return null;
  const [modo, setModo] = useState("monto");

  const regsA = (met.registros || []).filter(r => r.conHora);
  const regsB = metComp ? (metComp.registros || []).filter(r => r.conHora) : [];
  const totalConHora = regsA.length + regsB.length;
  const totalRegistros = met.numVentas + (metComp ? metComp.numVentas : 0);

  if (totalRegistros === 0) {
    return <div style={{ fontSize: isMobile ? 15 : 14, fontWeight: 800, color: "#0E1328" }}>Sin ventas registradas.</div>;
  }

  const porHoraA = met.porHora || {};
  const porHoraB = metComp ? (metComp.porHora || {}) : {};
  const todasHoras = [...new Set([
    ...Object.keys(porHoraA).filter(k => k !== "sin_horario"),
    ...Object.keys(porHoraB).filter(k => k !== "sin_horario"),
  ])].map(Number).sort((a, b) => a - b);

  const resumenHorario = (
    <div style={{ fontSize: 12, color: "#6E7489", marginBottom: 14 }}>
      {totalConHora} de {totalRegistros} {totalRegistros === 1 ? TXT.venta : TXT.ventas} con hora registrada.
    </div>
  );

  if (totalConHora === 0) {
    return (
      <div>
        <div style={{ fontSize: isMobile ? 15 : 14, fontWeight: 800, color: "#0E1328", marginBottom: 4 }}>No se registró hora en ninguna venta.</div>
        {resumenHorario}
      </div>
    );
  }

  // Pocas operaciones, o todas concentradas en una sola hora: listar directo
  // en vez de agregarlas en una gráfica (que se vería como una barra sola
  // estirada a todo el ancho, con mucho espacio vacío y poca información).
  const usarLista = totalConHora <= 3 || todasHoras.length <= 1;

  if (usarLista) {
    const lista = [
      ...regsA.map(r => ({ ...r, lbl: metComp ? lblMet : null })),
      ...(metComp ? regsB.map(r => ({ ...r, lbl: lblComp })) : []),
    ].sort((a, b) => new Date(a.ts) - new Date(b.ts));
    return (
      <div>
        <div style={{ fontSize: isMobile ? 15 : 14, fontWeight: 800, color: "#0E1328", marginBottom: 4 }}>
          {totalConHora === 1 ? "1 venta con hora registrada" : totalConHora + " ventas con hora registrada"}
        </div>
        {resumenHorario}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {lista.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#F4F5FA", borderRadius: 10, padding: "9px 12px", border: "1px solid #E3E6EF" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0E1328" }}>{fmtHora12(r.ts)}{r.lbl ? " · " + r.lbl : ""}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#0E1328" }}>${formatoDinero(r.monto)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Suficientes registros repartidos en varias horas: distribución agregada.
  const getVal = (porHora, h) => modo === "monto" ? (porHora[String(h)] || { monto: 0 }).monto : (porHora[String(h)] || { count: 0 }).count;
  const mejorHora = todasHoras.reduce((best, h) => getVal(porHoraA, h) > getVal(porHoraA, best) ? h : best, todasHoras[0]);
  const maxVal = Math.max(1, ...todasHoras.map(h => Math.max(getVal(porHoraA, h), getVal(porHoraB, h))));

  return (
    <div>
      <div style={{ fontSize: isMobile ? 15 : 14, fontWeight: 800, color: "#0E1328", marginBottom: 4 }}>
        La hora con más {modo === "monto" ? "ventas" : "compras"} es las {fmtHora12(new Date().setHours(mejorHora, 0, 0, 0))}.
      </div>
      {resumenHorario}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {[["monto", "Por monto"], ["count", "Por número de ventas"]].map(([k, lbl]) => (
          <button key={k} onClick={() => setModo(k)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 14, border: "1.5px solid " + (modo === k ? "#3F4BD0" : "#E3E6EF"), background: modo === k ? "#EEF0FF" : "transparent", color: modo === k ? "#3F4BD0" : "#4A5068", cursor: "pointer", fontWeight: modo === k ? 800 : 600, fontFamily: "inherit" }}>{lbl}</button>
        ))}
      </div>
      {metComp && (
        <div style={{ fontSize: 11, color: "#6E7489", marginBottom: 10 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#3F4BD0", marginRight: 3 }} />{lblMet} <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#D9971F", marginRight: 3, marginLeft: 8 }} />{lblComp}
        </div>
      )}
      <div style={{ display: "flex", gap: isMobile ? 3 : 4, alignItems: "flex-end", height: 72, width: "100%" }}>
        {todasHoras.map((h, i) => {
          const vA = getVal(porHoraA, h);
          const vB = metComp ? getVal(porHoraB, h) : 0;
          const hA = Math.max(2, Math.round((vA / maxVal) * 60));
          const hB = metComp ? Math.max(2, Math.round((vB / maxVal) * 60)) : 0;
          return (
            <div key={i} title={fmtHora12(new Date().setHours(h, 0, 0, 0)) + ": " + (modo === "monto" ? "$" + formatoDinero(vA) : vA + " ventas") + (metComp ? " / " + (modo === "monto" ? "$" + formatoDinero(vB) : vB) : "")} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 60, width: "100%" }}>
                <div style={{ width: metComp ? "calc(50% - 0.5px)" : "100%", height: vA > 0 ? hA : 2, borderRadius: "2px 2px 0 0", background: "#3F4BD0" }} />
                {metComp && <div style={{ width: "calc(50% - 0.5px)", height: vB > 0 ? hB : 2, borderRadius: "2px 2px 0 0", background: "#D9971F" }} />}
              </div>
              {!isMobile && todasHoras.length <= 12 && <div style={{ fontSize: 7, color: "#9CA3AF" }}>{fmtHora12(new Date().setHours(h, 0, 0, 0))}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Detalle de un día (tocar una barra de la gráfica abre esto) ──────────────

function DetalleDia({ fecha, met, isMobile, formatoDinero, TXT, onVerRegistro, ocultarDesglose }) {
  if (!fecha || !met) return null;
  const d = new Date(fecha + "T00:00:00");
  return (
    <div style={{ background: "#F8F9FC", borderRadius: 16, border: "1px solid #E3E6EF", padding: isMobile ? "14px" : "18px 20px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#4A5068", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{capDiaSemana(d.getDay())}</div>
      <div style={{ fontSize: isMobile ? 18 : 17, fontWeight: 800, color: "#0E1328", marginBottom: 14 }}>{labelFechaLarga(fecha)}</div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: ocultarDesglose ? 14 : 18 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{TXT.monto}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0E1328" }}>{met.montoVendido > 0 ? "$" + formatoDinero(met.montoVendido) : "$0"}</div>
          {met.montoVendido === 0 && <div style={{ fontSize: 11, color: "#6E7489", marginTop: 2 }}>Sin ventas registradas</div>}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{TXT.num}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0E1328" }}>{met.numVentas}</div>
        </div>
      </div>

      {!ocultarDesglose && (
        <>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#4A5068", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>{TXT.vista2}</div>
            <DesgloseProductos met={met} metComp={null} lblMet="" formatoDinero={formatoDinero} TXT={TXT} isMobile={isMobile} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#4A5068", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Horarios</div>
            <VistaCuandoCompran met={met} metComp={null} isMobile={isMobile} formatoDinero={formatoDinero} TXT={TXT} />
          </div>
        </>
      )}

      <button type="button" onClick={onVerRegistro} style={{ fontSize: 12, fontWeight: 700, color: "#3F4BD0", background: "#EEF0FF", border: "none", borderRadius: 14, padding: "7px 14px", cursor: "pointer", fontFamily: "inherit" }}>Ver pedidos y ventas →</button>
    </div>
  );
}

// Franjas de 4 horas, de 8am a 12am — fuera de ese rango no hay horario de
// venta real de estos negocios. El objetivo sigue siendo comparar la FORMA
// del patrón entre eventos, no "la hora exacta" de cada venta.
const FRANJAS_DIA = [
  { id: "f1", label: "8–12pm", horas: [8, 9, 10, 11] },
  { id: "f2", label: "12–4pm", horas: [12, 13, 14, 15] },
  { id: "f3", label: "4–8pm", horas: [16, 17, 18, 19] },
  { id: "f4", label: "8–12am", horas: [20, 21, 22, 23] },
];

// ── Mapa de calor evento × franja horaria (Comparar eventos, 2 a 7) ──────────
// Reemplaza las barras duales (que solo sirven para 2 series) cuando hay más
// de 2 eventos — evita superponer varias curvas horarias. Intensidad =
// opacidad del teal con escala GLOBAL (no por fila), para que la magnitud
// sea comparable entre eventos. Un evento con ≤3 operaciones con hora se
// marca explícitamente en vez de implicar un patrón que no existe con tan
// poco dato — mismo umbral que ya usa VistaCuandoCompran.

function VistaHorariosEventos({ eventos, eventosPorId, metsEventos, isMobile, formatoDinero, TXT }) {
  const [activa, setActiva] = useState(null); // { id, franjaId } | null

  const filas = eventos.map(id => {
    const met = metsEventos[id];
    const regsConHora = (met.registros || []).filter(r => r.conHora);
    const franjas = FRANJAS_DIA.map(fr => {
      let monto = 0, count = 0;
      fr.horas.forEach(h => { const b = met.porHora[String(h)]; if (b) { monto += b.monto; count += b.count; } });
      return Object.assign({}, fr, { monto, count });
    });
    return {
      id, nombre: eventosPorId[id] ? eventosPorId[id].nombre : "",
      franjas, totalConHora: regsConHora.length, totalRegistros: met.numVentas,
      pocos: regsConHora.length > 0 && regsConHora.length <= 3,
      sinHora: regsConHora.length === 0,
    };
  });

  const maxMonto = Math.max(1, ...filas.flatMap(f => f.franjas.map(fr => fr.monto)));
  const totalConHora = filas.reduce((s, f) => s + f.totalConHora, 0);
  const totalRegistros = filas.reduce((s, f) => s + f.totalRegistros, 0);

  if (totalConHora === 0) {
    return <div style={{ fontSize: 13, color: "#4A5068" }}>Ninguno de los eventos seleccionados tiene hora de venta registrada.</div>;
  }

  const sel = activa ? filas.find(f => f.id === activa.id) : null;
  const selFranja = sel ? sel.franjas.find(fr => fr.id === activa.franjaId) : null;
  const colLabel = isMobile ? 70 : 100;
  const cols = colLabel + "px repeat(" + FRANJAS_DIA.length + ", 1fr)";

  return (
    <div>
      <div style={{ minHeight: 22, marginBottom: 10 }}>
        {sel && selFranja ? (
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0E1328" }}>
            {sel.nombre} · {selFranja.label} — {selFranja.monto > 0 ? "$" + formatoDinero(selFranja.monto) + " · " + selFranja.count + (selFranja.count === 1 ? " venta" : " ventas") : "sin ventas en esta franja"}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: "#9CA3AF" }}>Toca una celda para ver el monto exacto</div>
        )}
      </div>
      <div style={{ fontSize: 12, color: "#6E7489", marginBottom: 14 }}>{totalConHora} de {totalRegistros} {totalRegistros === 1 ? TXT.venta : TXT.ventas} con hora registrada, en total.</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 4 }}>
          <div />
          {FRANJAS_DIA.map(fr => (
            <div key={fr.id} style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", textAlign: "center", lineHeight: 1.3, whiteSpace: "nowrap" }}>{fr.label}</div>
          ))}
        </div>
        {filas.map(f => (
          <div key={f.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 4, alignItems: "center" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#0E1328", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nombre}</div>
            {f.franjas.map(fr => {
              const op = fr.monto > 0 ? 0.12 + 0.76 * (fr.monto / maxMonto) : 0;
              const esActiva = activa && activa.id === f.id && activa.franjaId === fr.id;
              return (
                <button key={fr.id} type="button" onClick={() => setActiva({ id: f.id, franjaId: fr.id })}
                  aria-pressed={!!esActiva}
                  aria-label={f.nombre + ", " + fr.label + ": " + (fr.monto > 0 ? "$" + formatoDinero(fr.monto) + " vendido" : "sin ventas")}
                  style={{
                    height: isMobile ? 34 : 38, borderRadius: 8, border: esActiva ? "2px solid " + C_TEAL : "1px solid transparent",
                    background: fr.monto > 0 ? "rgba(13,148,136," + op + ")" : "#F4F5FA",
                    cursor: "pointer", padding: 0, fontFamily: "inherit",
                  }} />
              );
            })}
          </div>
        ))}
      </div>

      {filas.some(f => f.pocos || f.sinHora) && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
          {filas.filter(f => f.pocos).map(f => (
            <div key={f.id} style={{ fontSize: 11, color: "#9CA3AF" }}>{f.nombre}: solo {f.totalConHora} {f.totalConHora === 1 ? "venta" : "ventas"} con hora — muy poco para ver un patrón, revisa su detalle.</div>
          ))}
          {filas.filter(f => f.sinHora).map(f => (
            <div key={f.id} style={{ fontSize: 11, color: "#9CA3AF" }}>{f.nombre}: sin hora registrada en ninguna venta.</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tabla comparativa de productos/servicios (Comparar eventos, 2 a 7) ───────
// Primera columna fija, columnas de eventos con scroll horizontal CONTENIDO
// a este widget si no caben todas (es una tabla de comparación, no un eje
// temporal — a diferencia de la gráfica de días, aquí sí se acepta scroll).
// "Sin ventas" cuando el producto no aparece en ese evento — nunca un $0
// inventado.

function TablaProductosEventos({ eventos, eventosPorId, metsEventos, formatoDinero, TXT, isMobile, onVerRegistro }) {
  const [modoOrden, setModoOrden] = useState("monto");
  const todasKeys = [...new Set(eventos.flatMap(id => Object.keys(metsEventos[id].productosMonto)))];

  if (todasKeys.length === 0) {
    return <div style={{ fontSize: 13, color: "#4A5068" }}>Ninguno de los eventos seleccionados tiene ventas con desglose.</div>;
  }

  const hayUnidades = eventos.some(id => Object.values(metsEventos[id].productosUnidades).some(u => u > 0));
  const filas = todasKeys.map(nombre => {
    const porEvento = {};
    let totalMonto = 0, totalUnidades = 0;
    eventos.forEach(id => {
      const m = metsEventos[id].productosMonto[nombre] || 0;
      const u = metsEventos[id].productosUnidades[nombre] || 0;
      porEvento[id] = { monto: m, unidades: u };
      totalMonto += m; totalUnidades += u;
    });
    return { nombre, porEvento, totalMonto, totalUnidades };
  }).sort((a, b) => modoOrden === "qty" ? b.totalUnidades - a.totalUnidades : b.totalMonto - a.totalMonto);

  const sinDesglose = filas.some(f => f.nombre === "Sin desglose");
  const colAncho = isMobile ? 92 : 112;
  const cols = "140px repeat(" + eventos.length + ", " + colAncho + "px)";

  return (
    <div>
      {filas.length > 1 && hayUnidades && (
        <>
          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            {[["monto", "Por monto vendido"], ["qty", "Por cantidad"]].map(([k, lbl]) => (
              <button key={k} onClick={() => setModoOrden(k)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 14, border: "1.5px solid " + (modoOrden === k ? "#3F4BD0" : "#E3E6EF"), background: modoOrden === k ? "#EEF0FF" : "transparent", color: modoOrden === k ? "#3F4BD0" : "#4A5068", cursor: "pointer", fontWeight: modoOrden === k ? 800 : 600, fontFamily: "inherit" }}>{lbl}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 10 }}>{modoOrden === "qty" ? "Unidades vendidas por evento, ordenadas de mayor a menor." : "Monto vendido por evento, ordenado de mayor a menor."}</div>
        </>
      )}
      <div style={{ overflowX: "auto", paddingBottom: 2 }}>
        <div style={{ minWidth: 140 + eventos.length * colAncho }}>
          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 6, marginBottom: 4 }}>
            <div />
            {eventos.map(id => (
              <div key={id} style={{ fontSize: 10.5, fontWeight: 700, color: "#0E1328", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eventosPorId[id] ? eventosPorId[id].nombre : ""}</div>
            ))}
          </div>
          {filas.slice(0, 12).map((f, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: cols, gap: 6, alignItems: "center", padding: "10px 0", borderTop: "1px solid #EDEFF5" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0E1328", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nombre}</div>
              {eventos.map(id => {
                const c = f.porEvento[id];
                const vendido = c.monto > 0;
                let texto;
                if (!vendido) texto = "Sin ventas";
                else if (modoOrden === "qty") texto = c.unidades > 0 ? c.unidades + " u." : "Sin cantidad";
                else texto = "$" + formatoDinero(c.monto);
                return (
                  <button key={id} type="button" onClick={onVerRegistro} style={{ fontSize: 13, fontWeight: 800, color: vendido ? "#0E1328" : "#9CA3AF", textAlign: "right", background: "none", border: 0, padding: 0, cursor: onVerRegistro ? "pointer" : "default", fontFamily: "inherit" }}>
                    {texto}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {filas.length > 12 && <div style={{ fontSize: 12, color: "#6E7489", textAlign: "center", padding: "6px 0" }}>+{filas.length - 12} {TXT.vista2low} más</div>}
      {sinDesglose && <div style={{ fontSize: 11, color: "#6E7489", marginTop: 10, lineHeight: 1.5 }}>«Sin desglose» agrupa {TXT.pedido + "s"} sin ítems individuales.</div>}
    </div>
  );
}

// ── Vista "De dónde llegan tus clientes" ──────────────────────────────────────
// Es de todo el historial, sin relación con las fechas que se exploren arriba
// en "Explora tus ventas" — se aclara explícitamente para no sugerir que
// cambiar esas fechas también cambiaría esto.

function VistaOrigenClientes({ canalesData, sinOrigenOps, sinOrigenConv, isMobile, setVista }) {
  const botonVerClientes = (
    <button onClick={() => setVista("clientes")} style={{
      display: "inline-flex", alignItems: "center", justifyContent: isMobile ? "center" : "flex-start", gap: 7,
      height: isMobile ? 40 : 32, width: isMobile ? "100%" : "auto", boxSizing: "border-box",
      padding: "0 14px", borderRadius: isMobile ? 20 : 16, border: "1.5px solid #E3E6EF", background: "#FFFFFF",
      color: "#0E1328", fontFamily: "inherit", fontSize: isMobile ? 13 : 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
    }}>Ver clientes <IconArrow size={14} /></button>
  );
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 }}>
          <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 12, background: "#EEF0FF", color: "#3F4BD0", display: "grid", placeItems: "center" }}>
            <IconUsers size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: isMobile ? 17 : 18, fontWeight: 800, letterSpacing: "-0.02em", color: "#0E1328" }}>De dónde llegan tus clientes</h2>
            <p style={{ margin: "3px 0 0", fontSize: 13.5, lineHeight: 1.5, color: "#5A6078" }}>Clientes registrados por canal y cuántos compraron desde que usas CLEO.</p>
          </div>
        </div>
        {!isMobile && botonVerClientes}
      </div>

      <div style={{ marginTop: 12 }}>
        {canalesData.map((c, i) => {
          const tasa = c.total > 0 ? Math.round((c.convertidos / c.total) * 100) : 0;
          const colorFill = tasa >= 50 ? "#3E9A64" : tasa >= 25 ? "#D9971F" : "#D5D8E4";
          const colorTxt = tasa >= 50 ? "#1E5C38" : tasa >= 25 ? "#8A5A06" : "#6E7489";
          const Icono = ICONOS_CANAL[c.canal] || IconUsers;
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 260px",
              alignItems: isMobile ? "stretch" : "center", gap: isMobile ? 10 : 24,
              padding: "14px 0", borderTop: i === 0 ? "none" : "1px solid #EDEFF5",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 11, background: "#F4F5FA", color: "#0E1328", display: "grid", placeItems: "center" }}>
                  <Icono size={16} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 15, fontWeight: 800, color: "#0E1328" }}>{c.canal}<small style={{ fontSize: 13, fontWeight: 600, color: "#6E7489", marginLeft: 6 }}>{c.total} {c.total === 1 ? "cliente" : "clientes"}</small></b>
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: "#5A6078" }}>{c.convertidos} {c.convertidos === 1 ? "compró" : "compraron"} · {c.sinConvertir} sin comprar aún</p>
                </div>
              </div>
              {c.total > 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#EEF0F5", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: colorFill, width: tasa + "%" }} />
                  </div>
                  <strong style={{ fontSize: 13, fontWeight: 800, color: colorTxt, whiteSpace: "nowrap" }}>{tasa}%<small style={{ fontWeight: 600, color: "#5A6078", marginLeft: 4 }}>compraron</small></strong>
                </div>
              ) : <div style={{ fontSize: 12.5, color: "#9CA3AF" }}>Sin base para calcular porcentaje.</div>}
            </div>
          );
        })}
        {sinOrigenOps > 0 && (
          <div style={{
            display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 260px",
            alignItems: isMobile ? "stretch" : "center", gap: isMobile ? 10 : 24,
            padding: "14px 0", borderTop: canalesData.length === 0 ? "none" : "1px solid #EDEFF5",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 11, background: "#F4F5FA", color: "#0E1328", display: "grid", placeItems: "center" }}>
                <IconHelp size={16} />
              </span>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 15, fontWeight: 800, color: "#0E1328" }}>Sin origen registrado<small style={{ fontSize: 13, fontWeight: 600, color: "#6E7489", marginLeft: 6 }}>{sinOrigenOps} {sinOrigenOps === 1 ? "cliente" : "clientes"}</small></b>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "#5A6078" }}>{sinOrigenConv} {sinOrigenConv === 1 ? "compró" : "compraron"} · No se puede atribuir a ningún canal.</p>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: "#9CA3AF" }}>No se puede calcular por canal.</div>
          </div>
        )}
      </div>

      {isMobile && <div style={{ marginTop: 12 }}>{botonVerClientes}</div>}
    </div>
  );
}

// ── Iconos ─────────────────────────────────────────────────────────────────────
// Ronda 13: reemplazan los emojis decorativos. Mismo lenguaje de línea
// (trazo 2, extremos redondeados, viewBox 24x24). Los que vienen de la
// referencia R13-Resumen-Abajo.html usan exactamente sus mismos paths.

function IconCmp({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 20V10M12 20V4M18 20v-7" /></svg>;
}
function IconUsers({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .8 3.2 2.6 3.5 5.2" /></svg>;
}
function IconIg({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17 7h.01" /></svg>;
}
function IconFb({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M14 8.5h3V5h-3a4 4 0 0 0-4 4v2H7.5v3.5H10V21h3.5v-6.5H16l.5-3.5h-3V9a.5.5 0 0 1 .5-.5z" /></svg>;
}
function IconRef({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="3.2" /><circle cx="17" cy="10" r="2.6" /><path d="M2.5 19.5c.5-3 2.8-4.8 5.5-4.8s5 1.8 5.5 4.8M14.5 15.2c.7-.4 1.6-.7 2.5-.7 2.3 0 4.1 1.5 4.5 4" /></svg>;
}
function IconArrow({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}
function IconBulb({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></svg>;
}
function IconBag({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h14l-1 13H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>;
}
function IconX({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6 6 18" /></svg>;
}
function IconCash({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>;
}
function IconFlag({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>;
}
function IconDown({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;
}
function IconDoc({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z" /><path d="M14 3.5V8h4M9.5 12.5h5M9.5 16h5" /></svg>;
}
// No están en la referencia (que solo ejemplifica 3 hallazgos); mismo
// lenguaje de línea para los hallazgos/acciones que la referencia no cubre.
function IconClock({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
}
function IconWarn({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2 20h20z" /><path d="M12 9v5M12 17h.01" /></svg>;
}
function IconHelp({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M9.3 9.2a2.7 2.7 0 0 1 5.1 1.2c0 1.8-2.4 2.1-2.4 3.6" /><path d="M12 17.3h.01" /></svg>;
}
function IconChat({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5h16v11H9.5L5 20v-3.5H4z" /></svg>;
}
function IconTag({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3h6a2 2 0 0 1 2 2v6l-9.5 9.5a1.5 1.5 0 0 1-2 0L3 15a1.5 1.5 0 0 1 0-2z" /><circle cx="16.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" /></svg>;
}
function IconTarget({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></svg>;
}
function IconPlus({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 8v8M8 12h8" /></svg>;
}

const ICONOS_INSIGHT = { bag: IconBag, users: IconUsers, clock: IconClock, x: IconX, warn: IconWarn, help: IconHelp };
const ICONOS_ACCION = { chat: IconChat, cash: IconCash, tag: IconTag, target: IconTarget, plus: IconPlus };
const ICONOS_CANAL = { Instagram: IconIg, Facebook: IconFb, Referido: IconRef };

// ── Piezas del sistema visual ──────────────────────────────────────────────────

function SegmentadoTipo({ tipo, onChange, opts, isMobile }) {
  return (
    <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 19, background: "#F4F5FA", width: isMobile ? "100%" : "fit-content", flexWrap: "wrap" }}>
      {opts.map(([k, lbl]) => {
        const on = tipo === k;
        return (
          <button key={k} type="button" onClick={() => onChange(k)} style={{
            flex: isMobile ? "1 1 auto" : "none", height: isMobile ? 36 : 32, padding: "0 16px", border: 0, borderRadius: 16,
            background: on ? "#FFFFFF" : "transparent", color: on ? "#0E1328" : "#4A5068",
            fontFamily: "inherit", fontSize: 13, fontWeight: on ? 800 : 600, cursor: "pointer", whiteSpace: "nowrap",
            boxShadow: on ? "0 1px 2px rgba(14,19,40,.08)" : "none",
          }}>{lbl}</button>
        );
      })}
    </div>
  );
}

function OpcionPill({ selected, onClick, children, isMobile, full }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      flex: isMobile ? "1 1 0" : "none", minWidth: 0,
      height: isMobile ? 38 : 38, padding: isMobile ? "0 8px" : "0 16px", borderRadius: 19,
      border: "1.5px solid " + (selected ? "#E4E8FF" : "#E3E6EF"),
      background: selected ? "#E4E8FF" : "#FFFFFF",
      fontFamily: "inherit", fontSize: isMobile ? 12 : 13.5, fontWeight: selected ? 800 : 600, color: "#0E1328",
      cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      gridColumn: full ? "1 / -1" : undefined,
    }}>{children}</button>
  );
}

// Fecha confirmada de "Comparar fechas": acción "Cambiar" la reemplaza
// directamente en el sitio (sin pasar por agregar-y-quitar), y el botón de
// quitar nunca aparece deshabilitado sin que el padre explique el motivo
// (texto visible junto a la fila, no solo aria-label).
function ChipFecha({ fecha, onCambiar, onQuitar, puedeQuitar, FECHA_HOY }) {
  const [cambiando, setCambiando] = useState(false);
  if (cambiando) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", height: 32, padding: "0 8px", borderRadius: 16, background: "#FFFFFF", border: "1.5px solid #3F4BD0" }}>
        <input type="date" autoFocus defaultValue={fecha} max={FECHA_HOY}
          onChange={(e) => { onCambiar(e.target.value); setCambiando(false); }}
          onBlur={() => setCambiando(false)}
          style={{ border: 0, fontSize: 12.5, fontFamily: "inherit", color: "#0E1328", width: 120, outline: "none" }} />
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, height: 32, padding: "0 4px 0 12px", borderRadius: 16, background: "#EEF0FF", color: "#3F4BD0", fontSize: 12.5, fontWeight: 700 }}>
      {labelFecha(fecha)}
      <button type="button" onClick={() => setCambiando(true)} style={{ fontSize: 11, fontWeight: 700, color: "#3F4BD0", background: "none", border: 0, cursor: "pointer", padding: "2px 6px", fontFamily: "inherit", textDecoration: "underline" }}>Cambiar</button>
      <button type="button" onClick={onQuitar} disabled={!puedeQuitar}
        aria-label={puedeQuitar ? "Quitar " + labelFechaLarga(fecha) : "No se puede quitar: se necesitan al menos 2 fechas"}
        style={{ width: 20, height: 20, borderRadius: "50%", border: 0, background: puedeQuitar ? "rgba(63,75,208,0.15)" : "transparent", color: puedeQuitar ? "#3F4BD0" : "#C7CBDB", cursor: puedeQuitar ? "pointer" : "default", fontSize: 13, lineHeight: 1, display: "grid", placeItems: "center", fontFamily: "inherit" }}
      >×</button>
    </span>
  );
}

// Borrador de "Elegir otras fechas": permite una selección temporalmente
// incompleta (0 a 7) mientras se edita — solo se valida el mínimo de 2 al
// aplicar, nunca mientras tanto.
function SelectorFechasMultiples({ dias, onAdd, onRemove, max, FECHA_HOY, isMobile }) {
  const [valor, setValor] = useState(FECHA_HOY);
  const puedeAgregar = dias.length < max && !dias.includes(valor);
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {dias.length === 0 && <div style={{ fontSize: 12.5, color: "#9CA3AF" }}>Aún no has elegido ninguna fecha.</div>}
        {dias.map(f => (
          <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 6px 0 12px", borderRadius: 16, background: "#EEF0FF", color: "#3F4BD0", fontSize: 12.5, fontWeight: 700 }}>
            {labelFecha(f)}
            <button type="button" onClick={() => onRemove(f)}
              aria-label={"Quitar " + labelFechaLarga(f)}
              style={{ width: 20, height: 20, borderRadius: "50%", border: 0, background: "rgba(63,75,208,0.15)", color: "#3F4BD0", cursor: "pointer", fontSize: 13, lineHeight: 1, display: "grid", placeItems: "center", fontFamily: "inherit" }}
            >×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input type="date" value={valor} max={FECHA_HOY} onChange={(e) => setValor(e.target.value)}
          style={{ height: 36, borderRadius: 10, border: "1.5px solid #E3E6EF", padding: "0 10px", fontSize: 13, fontFamily: "inherit", color: "#0E1328" }} />
        <button type="button" disabled={!puedeAgregar} onClick={() => onAdd(valor)}
          style={{ height: 36, padding: "0 14px", borderRadius: 10, border: 0, background: puedeAgregar ? "#0E1328" : "#E3E6EF", color: puedeAgregar ? "#fff" : "#9CA3AF", fontSize: 13, fontWeight: 700, cursor: puedeAgregar ? "pointer" : "default", fontFamily: "inherit" }}
        >Agregar fecha</button>
      </div>
      {dias.length >= max && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>Máximo {max} fechas.</div>}
    </div>
  );
}

// Selector de eventos por pastillas: tocar agrega/quita directamente — así
// "cambiar" y "quitar" la selección es la misma acción simple, sin un modo
// de edición aparte (a diferencia de fechas, aquí se elige de una lista
// cerrada, no se "escribe" un evento nuevo).
function SelectorEventosMultiples({ eventos, seleccionados, onToggle, isMobile }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {eventos.map(ev => {
        const on = seleccionados.includes(ev.id);
        return (
          <button key={ev.id} type="button" onClick={() => onToggle(ev.id)} style={{
            display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
            padding: "8px 14px", borderRadius: 14, textAlign: "left",
            border: "1.5px solid " + (on ? "rgba(13,148,136,0.4)" : "#E3E6EF"),
            background: on ? "rgba(13,148,136,0.08)" : "#FFFFFF",
            cursor: "pointer", fontFamily: "inherit",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: on ? 800 : 600, color: on ? C_TEAL : "#0E1328" }}>{ev.nombre}</span>
              {ev.estado === "abierto" && <span style={{ fontSize: 8.5, fontWeight: 700, color: C_TEAL, background: "rgba(13,148,136,0.12)", borderRadius: 8, padding: "1px 6px" }}>EN CURSO</span>}
            </div>
            <span style={{ fontSize: 11, color: "#6E7489" }}>{labelRango(ev.fecha, ev.fechaFin || ev.fecha)}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ResumenAnalyticsProd({
  pedidos, ventas, clientes, productosCat, materialesCat, eventos,
  esProductos,
  C, sc, st, isMobile, HOY, FECHA_HOY,
  periodo, setPeriodo,
  formatoDinero, parseFechaLocal, fmtFechaLocal, enRangoFechas,
  obtenerItemsPedido, calcularCostoUnitario, tienePrecioReal, saldoPendienteDe, obtenerReversionIngresoPedido,
  setVista,
  setFiltroPedidoPeriodo, setFiltroPedidoSaldo,
  setModalReporteComercial, setFormReporteComercial, rangoReporteComercialPorDefecto, setErrorReporteComercial,
}) {
  const TXT = esProductos
    ? { venta: "venta", ventas: "ventas", pedido: "pedido", monto: "Monto vendido", num: "Número de ventas", vista2: "Productos", vista2low: "productos" }
    : { venta: "venta", ventas: "ventas", pedido: "trabajo", monto: "Monto registrado", num: "Número de trabajos", vista2: "Servicios", vista2low: "servicios" };

  const eventosLista = eventos || [];

  // Navegación a registros: siempre que exista un filtro real y existente en
  // la app para el caso, se aplica antes de cambiar de vista — nunca se
  // promete un filtro que no existe.
  const verRegistros = () => { if (setFiltroPedidoPeriodo) setFiltroPedidoPeriodo("todo"); setVista("pedidos"); };
  const verRegistrosDeFecha = (fecha) => {
    if (setFiltroPedidoPeriodo) setFiltroPedidoPeriodo(fecha === FECHA_HOY ? "hoy" : "todo");
    setVista("pedidos");
  };

  // ── Estado de "Explora tus ventas" ─────────────────────────────────────────
  const [modo, setModo] = useState("periodo"); // "periodo" | "comparar" | "eventos"

  // Modo "Ver un período"
  const [tipoPeriodo, setTipoPeriodo] = useState("semana"); // semana | mes | rango
  const [refSemana, setRefSemana] = useState(FECHA_HOY);
  const [refMes, setRefMes] = useState(() => { const [y, m] = FECHA_HOY.split("-").map(Number); return { year: y, month: m - 1 }; });
  const [rangoCustomDesde, setRangoCustomDesde] = useState(FECHA_HOY);
  const [rangoCustomHasta, setRangoCustomHasta] = useState(FECHA_HOY);
  const [diaActivoPeriodo, setDiaActivoPeriodo] = useState(null);

  // Modo "Comparar fechas" — null = todavía no se ha preparado una
  // comparación; se siembra la primera vez que se entra al modo, a partir
  // del día que se estaba revisando en "Ver un período".
  const [diasComparar, setDiasComparar] = useState(null);
  const [diaActivoComparar, setDiaActivoComparar] = useState(null);
  const [editandoFechas, setEditandoFechas] = useState(false);
  const [borrador, setBorrador] = useState([]);
  const [errorBorrador, setErrorBorrador] = useState("");

  // Modo "Comparar eventos"
  const [eventosSeleccionados, setEventosSeleccionados] = useState(null);
  const [eventoActivo, setEventoActivo] = useState(null);

  function cambiarTipoPeriodo(t) {
    setTipoPeriodo(t);
    setRefSemana(FECHA_HOY);
    const [y, m] = FECHA_HOY.split("-").map(Number);
    setRefMes({ year: y, month: m - 1 });
    setRangoCustomDesde(FECHA_HOY); setRangoCustomHasta(FECHA_HOY);
    setDiaActivoPeriodo(null);
  }

  const rangoPeriodo = useMemo(() => {
    if (tipoPeriodo === "semana") return rangoSemana(refSemana, fmtFechaLocal, parseFechaLocal);
    if (tipoPeriodo === "mes") return rangoMes(refMes.year, refMes.month, fmtFechaLocal);
    const d1 = rangoCustomDesde <= rangoCustomHasta ? rangoCustomDesde : rangoCustomHasta;
    const d2 = rangoCustomDesde <= rangoCustomHasta ? rangoCustomHasta : rangoCustomDesde;
    return { desde: d1, hasta: d2 };
  }, [tipoPeriodo, refSemana, refMes.year, refMes.month, rangoCustomDesde, rangoCustomHasta]);

  const metPeriodo = useMemo(() =>
    calcularMetricasRango(rangoPeriodo.desde, rangoPeriodo.hasta, pedidos, ventas, obtenerItemsPedido, enRangoFechas),
    [rangoPeriodo.desde, rangoPeriodo.hasta, pedidos, ventas]
  );
  const diasPeriodo = useMemo(() =>
    generarDiasEnRango(rangoPeriodo.desde, rangoPeriodo.hasta, fmtFechaLocal, parseFechaLocal),
    [rangoPeriodo.desde, rangoPeriodo.hasta]
  );
  // Sin selección válida → sin detalle (no se abre automáticamente el de un
  // día vacío). Solo se abre cuando el usuario toca una barra.
  const diaMostradoPeriodo = (diaActivoPeriodo && diasPeriodo.includes(diaActivoPeriodo)) ? diaActivoPeriodo : null;
  const metDiaPeriodo = useMemo(() =>
    diaMostradoPeriodo ? calcularMetricasRango(diaMostradoPeriodo, diaMostradoPeriodo, pedidos, ventas, obtenerItemsPedido, enRangoFechas) : null,
    [diaMostradoPeriodo, pedidos, ventas]
  );

  function irPeriodo(direccion) {
    if (tipoPeriodo === "semana") {
      const d = parseFechaLocal(refSemana); d.setDate(d.getDate() + direccion * 7); setRefSemana(fmtFechaLocal(d));
    } else if (tipoPeriodo === "mes") {
      setRefMes(m => { const d = new Date(m.year, m.month + direccion, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
    } else {
      const d1 = parseFechaLocal(rangoPeriodo.desde), d2 = parseFechaLocal(rangoPeriodo.hasta);
      const dur = Math.max(0, Math.round((d2 - d1) / 86400000));
      if (direccion < 0) {
        const nd2 = new Date(d1); nd2.setDate(nd2.getDate() - 1);
        const nd1 = new Date(nd2); nd1.setDate(nd2.getDate() - dur);
        setRangoCustomDesde(fmtFechaLocal(nd1)); setRangoCustomHasta(fmtFechaLocal(nd2));
      } else {
        const nd1 = new Date(d2); nd1.setDate(nd1.getDate() + 1);
        const nd2 = new Date(nd1); nd2.setDate(nd1.getDate() + dur);
        setRangoCustomDesde(fmtFechaLocal(nd1)); setRangoCustomHasta(fmtFechaLocal(nd2));
      }
    }
    setDiaActivoPeriodo(null);
  }
  const puedeAvanzarPeriodo = rangoPeriodo.hasta < FECHA_HOY;

  const diasOrdenadosComparar = useMemo(() =>
    [...(diasComparar || ultimosNDias(2, HOY, fmtFechaLocal))].sort(),
    [diasComparar, HOY]
  );
  const metsComparar = useMemo(() => {
    const m = {};
    diasOrdenadosComparar.forEach(f => { m[f] = calcularMetricasRango(f, f, pedidos, ventas, obtenerItemsPedido, enRangoFechas); });
    return m;
  }, [diasOrdenadosComparar.join(","), pedidos, ventas]);
  const diaMostradoComparar = (diaActivoComparar && diasOrdenadosComparar.includes(diaActivoComparar)) ? diaActivoComparar
    : diasOrdenadosComparar[diasOrdenadosComparar.length - 1];
  const datosComparar = useMemo(() => {
    const o = {};
    diasOrdenadosComparar.forEach(f => { o[f] = { monto: metsComparar[f] ? metsComparar[f].montoVendido : 0, count: metsComparar[f] ? metsComparar[f].numVentas : 0 }; });
    return o;
  }, [diasOrdenadosComparar.join(","), metsComparar]);

  const eventosPorId = useMemo(() => { const o = {}; eventosLista.forEach(ev => { o[ev.id] = ev; }); return o; }, [eventosLista]);
  const eventosOrdenadosSel = useMemo(() =>
    [...(eventosSeleccionados || [])].filter(id => eventosPorId[id]).sort((a, b) => (eventosPorId[a].fecha || "").localeCompare(eventosPorId[b].fecha || "")),
    [eventosSeleccionados, eventosPorId]
  );
  const metsEventos = useMemo(() => {
    const m = {};
    eventosOrdenadosSel.forEach(id => { m[id] = calcularMetricasEvento(eventosPorId[id], pedidos, ventas, obtenerItemsPedido); });
    return m;
  }, [eventosOrdenadosSel.join(","), pedidos, ventas]);
  const eventoMostrado = (eventoActivo && eventosOrdenadosSel.includes(eventoActivo)) ? eventoActivo
    : eventosOrdenadosSel[eventosOrdenadosSel.length - 1];

  function cambiarModo(nuevo) {
    if (nuevo === "comparar" && diasComparar === null) {
      // Primera vez que se entra a comparar: conserva el día que se estaba
      // revisando (o hoy, si ninguno) y sugiere el mismo día de la semana
      // anterior — nunca fechas arbitrarias sin relación con lo que veía.
      const base = diaMostradoPeriodo || FECHA_HOY;
      const dAnt = parseFechaLocal(base); dAnt.setDate(dAnt.getDate() - 7);
      setDiasComparar([...new Set([fmtFechaLocal(dAnt), base])].sort());
    }
    if (nuevo === "eventos" && eventosSeleccionados === null && eventosLista.length >= 2) {
      const recientes = [...eventosLista].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")).slice(0, 2);
      setEventosSeleccionados(recientes.map(e => e.id));
    }
    setModo(nuevo);
  }

  // ── Edición de fechas: reemplazo directo, elegir de cero con borrador,
  // aplicar/cancelar. Nunca se pierde la comparación anterior al cancelar. ──
  function fijarDiasComparar(dias) { setDiasComparar(dias); setDiaActivoComparar(null); setEditandoFechas(false); setBorrador([]); setErrorBorrador(""); }
  function cambiarUnaFecha(vieja, nueva) {
    if (!nueva || nueva === vieja) return;
    setDiasComparar(prev => {
      const base = prev || diasOrdenadosComparar;
      if (base.includes(nueva)) return base;
      return base.map(f => f === vieja ? nueva : f);
    });
    setDiaActivoComparar(null);
  }
  function quitarFechaConfirmada(f) {
    setDiasComparar(prev => { const base = prev || diasOrdenadosComparar; return base.length <= 2 ? base : base.filter(x => x !== f); });
  }
  function iniciarEleccionNueva() { setBorrador([]); setErrorBorrador(""); setEditandoFechas(true); }
  function cancelarEleccion() { setEditandoFechas(false); setBorrador([]); setErrorBorrador(""); }
  function agregarABorrador(f) {
    if (!f) return;
    if (borrador.includes(f)) { setErrorBorrador("Esa fecha ya está en tu selección."); return; }
    if (borrador.length >= 7) { setErrorBorrador("Máximo 7 fechas."); return; }
    setBorrador(prev => [...prev, f]); setErrorBorrador("");
  }
  function quitarDeBorrador(f) { setBorrador(prev => prev.filter(x => x !== f)); setErrorBorrador(""); }
  function aplicarBorrador() {
    if (borrador.length < 2) { setErrorBorrador("Elige al menos 2 fechas para comparar."); return; }
    setDiasComparar([...new Set(borrador)].sort());
    setEditandoFechas(false); setDiaActivoComparar(null); setBorrador([]); setErrorBorrador("");
  }

  function toggleEvento(id) {
    setEventosSeleccionados(prev => {
      const base = prev || [];
      if (base.includes(id)) return base.length <= 2 ? base : base.filter(x => x !== id);
      return base.length >= 7 ? base : [...base, id];
    });
  }
  const notaSeleccionEventos = eventosOrdenadosSel.length <= 2 ? "Se necesitan al menos 2 eventos — no puedes quitar más."
    : eventosOrdenadosSel.length >= 7 ? "Máximo 7 eventos — quita alguno para agregar otro." : "";

  // ── Cobros y saldo del mes en curso ────────────────────────────────────────
  // (independiente de las fechas que se exploren arriba — ver nota junto al
  // encabezado de "Explora tus ventas")
  let cobradoPeriodo = 0;
  const mesActualStr = FECHA_HOY.slice(0, 7);
  pedidos.forEach(ped => {
    (ped.pagos || []).forEach(p => { if (p.fecha && p.fecha.slice(0, 7) === mesActualStr) cobradoPeriodo += Number(p.monto); });
    const rev = obtenerReversionIngresoPedido(ped);
    if (rev && rev.fecha && rev.fecha.slice(0, 7) === mesActualStr) cobradoPeriodo += rev.monto;
  });
  ventas.forEach(v => {
    (v.pagos || []).forEach(p => { if (p.fecha && p.fecha.slice(0, 7) === mesActualStr) cobradoPeriodo += Number(p.monto); });
  });

  const saldoPorCobrar = pedidos
    .filter(p => p.estadoPedido !== "cancelado")
    .reduce((s, p) => {
      const pagado = (p.pagos || []).reduce((a, pg) => a + Number(pg.monto), 0);
      return s + Math.max(0, Number(p.total || 0) - pagado);
    }, 0);

  const potencial = cobradoPeriodo + saldoPorCobrar;

  // Ganancia estimada (mes actual)
  let ganVentasBrutas = 0, ganCostos = 0, ganItemsConCosto = 0, ganItemsSinCosto = 0;
  pedidos.filter(p => p.estadoPedido !== "cancelado" && (p.fecha || (p.fechaCreado || "").slice(0, 10)).slice(0, 7) === mesActualStr).forEach(ped => {
    obtenerItemsPedido(ped).forEach(item => {
      ganVentasBrutas += Number(item.total || Number(item.precioUnitario || 0) * Number(item.cantidad || 1));
      const prod = productosCat.find(pr => pr.id === item.catalogoId);
      if (prod && prod.costoConfig) {
        const res = calcularCostoUnitario(prod.costoConfig, materialesCat);
        if (res && res.costoTotal != null && !res.incompleto) { ganCostos += res.costoTotal * Number(item.cantidad || 1); ganItemsConCosto++; }
        else ganItemsSinCosto++;
      } else ganItemsSinCosto++;
    });
  });
  const ganancia = ganVentasBrutas - ganCostos;
  const ganMargen = ganVentasBrutas > 0 ? Math.round((ganancia / ganVentasBrutas) * 100) : null;
  const hayGanancias = ganItemsConCosto > 0;
  const ganParcial = ganItemsConCosto > 0 && ganItemsSinCosto > 0;
  const colorGan = ganMargen == null ? C.textDim : ganMargen >= 40 ? C.green : ganMargen >= 20 ? C.amber : "#EF4444";

  const canceladosPer = pedidos.filter(p => p.estadoPedido === "cancelado" && (p.fechaCancelacion || p.fecha || (p.fechaCreado || "").slice(0, 10)).slice(0, 7) === mesActualStr);

  const resumenTexto = saldoPorCobrar > 0
    ? "$" + formatoDinero(saldoPorCobrar) + " pendientes de cobrar en pedidos activos o entregados."
    : "Tus números de este mes.";

  // ── Insights — cada uno con su alcance real indicado y, cuando existe un
  // filtro real en la app, una acción que de verdad filtra (no solo abre un
  // listado general). No se duplica el mismo pendiente de cobro en 2 bloques.
  const productoCount = {};
  pedidos.forEach(p => {
    if (p.estadoPedido !== "cancelado") {
      obtenerItemsPedido(p).forEach(it => { if (it.nombre) { const k = it.nombre.trim(); productoCount[k] = (productoCount[k] || 0) + 1; } });
      if (!obtenerItemsPedido(p).length && p.productos) { const k = p.productos.trim(); productoCount[k] = (productoCount[k] || 0) + 1; }
    }
  });
  const topProducto = Object.entries(productoCount).filter(([k]) => k !== "Sin desglose").sort((a, b) => b[1] - a[1])[0] || null;

  const canalCount = {};
  clientes.forEach(c => { if (c.origen) canalCount[c.origen] = (canalCount[c.origen] || 0) + 1; });
  const topCanal = Object.entries(canalCount).sort((a, b) => b[1] - a[1])[0] || null;
  const sinOrigenCount = clientes.filter(c => c.estadoProspecto && !c.origen).length;

  const tiemposConv = [];
  clientes.filter(c => c.estadoProspecto === "Convertido" && c.fecha && c.fechaPedido).forEach(c => {
    const dias = Math.floor((parseFechaLocal(c.fechaPedido) - parseFechaLocal(c.fecha)) / 86400000);
    if (dias >= 0) tiemposConv.push(dias);
  });
  const promDiasConv = tiemposConv.length > 0 ? Math.round(tiemposConv.reduce((s, d) => s + d, 0) / tiemposConv.length) : null;

  const motivoPerdidaCount = {};
  clientes.filter(c => c.estadoProspecto === "Perdido" && c.motivoPerdida).forEach(c => { motivoPerdidaCount[c.motivoPerdida] = (motivoPerdidaCount[c.motivoPerdida] || 0) + 1; });
  pedidos.filter(p => p.estadoPedido === "cancelado" && p.motivoCancelacion).forEach(p => { motivoPerdidaCount[p.motivoCancelacion] = (motivoPerdidaCount[p.motivoCancelacion] || 0) + 1; });
  const topMotivoPerdida = Object.entries(motivoPerdidaCount).sort((a, b) => b[1] - a[1])[0] || null;
  const totalPerdidas = clientes.filter(c => c.estadoProspecto === "Perdido").length + pedidos.filter(p => p.estadoPedido === "cancelado").length;

  const insights = [];
  if (topProducto) insights.push({ ic: "bag", titulo: "Tu " + TXT.vista2low.slice(0, -1) + " más pedido: " + topProducto[0], evidencia: topProducto[1] + (topProducto[1] === 1 ? " vez pedido" : " veces pedido") });
  if (topCanal) insights.push({ ic: "users", titulo: "Canal con más clientes: " + topCanal[0], evidencia: topCanal[1] + (topCanal[1] === 1 ? " cliente llegó por ahí" : " clientes llegaron por ahí") });
  if (promDiasConv !== null) insights.push({ ic: "clock", titulo: promDiasConv === 0 ? "Tus clientes deciden en el día" : "En promedio cierras en " + promDiasConv + " días", evidencia: "Con " + tiemposConv.length + (tiemposConv.length === 1 ? " venta convertida" : " ventas convertidas") });
  if (canceladosPer.length > 0) insights.push({ ic: "x", titulo: canceladosPer.length + (canceladosPer.length === 1 ? " pedido cancelado" : " pedidos cancelados") + " este mes", evidencia: (() => { const mc = {}; canceladosPer.forEach(p => { if (p.motivoCancelacion) mc[p.motivoCancelacion] = (mc[p.motivoCancelacion] || 0) + 1; }); const top = Object.entries(mc).sort((a, b) => b[1] - a[1])[0]; return top ? 'Motivo más común: "' + top[0] + '"' : "Sin motivo dominante"; })() });
  if (topMotivoPerdida && topMotivoPerdida[1] >= 2) insights.push({ ic: "warn", titulo: '"' + topMotivoPerdida[0] + '" repite como motivo de pérdida', evidencia: topMotivoPerdida[1] + " de " + totalPerdidas + " oportunidades o pedidos perdidos" });
  if (sinOrigenCount > 0) insights.push({ ic: "help", titulo: sinOrigenCount + (sinOrigenCount === 1 ? " cliente sin canal registrado" : " clientes sin canal registrado"), evidencia: "No se puede saber qué canal los trajo" });

  const [mostrarInsightsTodos, setMostrarInsightsTodos] = useState(false);

  // ── Canales ───────────────────────────────────────────────────────────────
  const ORIGENES_CONOCIDOS = ["Instagram", "Facebook", "WhatsApp", "Referido", "TikTok", "Otro"];
  const todosOrigenes = [...new Set(clientes.map(c => c.origen).filter(Boolean))];
  const origenesShow = [...new Set([...ORIGENES_CONOCIDOS, ...todosOrigenes])];
  const canalesData = origenesShow.map(o => {
    const con = clientes.filter(c => c.estadoProspecto && c.origen === o);
    const convertidos = con.filter(c => c.estadoProspecto === "Convertido").length;
    return { canal: o, total: con.length, convertidos, sinConvertir: con.length - convertidos };
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  const sinOrigenOps = clientes.filter(c => c.estadoProspecto && !c.origen).length;
  const sinOrigenConv = clientes.filter(c => c.estadoProspecto === "Convertido" && !c.origen).length;

  // ── Próximo paso ──────────────────────────────────────────────────────────
  const opsEnSeg = clientes.filter(c => c.estadoProspecto === "En seguimiento");
  const opsSinPrecio = clientes.filter(c => c.estadoProspecto === "Nueva" && c.productoInteres && !tienePrecioReal(c));
  const opsSinProducto = clientes.filter(c => c.estadoProspecto === "Nueva" && !c.productoInteres);
  const acciones = [];
  if (opsEnSeg.length > 0) acciones.push({ ic: "chat", titulo: "Da seguimiento a " + opsEnSeg.length + (opsEnSeg.length === 1 ? " oportunidad" : " oportunidades") + " en espera", desc: "Ya saben el precio. Un mensaje puede cerrar la venta.", fn: () => setVista("prospectos") });
  if (saldoPorCobrar > 0) acciones.push({ ic: "cash", titulo: "Cobra los $" + formatoDinero(saldoPorCobrar) + " pendientes", desc: "Ya entregaste o tienes pedidos activos con saldo.", fn: () => { if (setFiltroPedidoSaldo) setFiltroPedidoSaldo("con_saldo"); setVista("pedidos"); } });
  if (opsSinPrecio.length > 0) acciones.push({ ic: "tag", titulo: "Manda precio a " + opsSinPrecio.length + (opsSinPrecio.length === 1 ? " oportunidad" : " oportunidades"), desc: "Ya tienen " + TXT.vista2low.slice(0, -1) + " de interés. Solo falta el precio.", fn: () => setVista("prospectos") });
  if (opsSinProducto.length > 0) acciones.push({ ic: "target", titulo: opsSinProducto.length + (opsSinProducto.length === 1 ? " contacto sin" : " contactos sin") + " " + TXT.vista2low.slice(0, -1) + " definido", desc: "Pregúntales qué les interesa.", fn: () => setVista("prospectos") });
  if (acciones.length === 0) acciones.push({ ic: "plus", titulo: "Agrega nuevas oportunidades", desc: "Cuando alguien te pregunte por tus " + TXT.vista2low + ", regístralo.", fn: () => setVista("prospectos") });
  const accion = acciones[0];

  // ── Opciones del segmentado de "Explora tus ventas" ────────────────────────
  const opcionesModo = [["periodo", "Ver un período"], ["comparar", "Comparar fechas"]];
  if (esProductos) opcionesModo.push(["eventos", "Comparar eventos"]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Título */}
      <div style={{ paddingTop: 24, marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: C.text, lineHeight: 1.1, marginBottom: 6 }}>Así va tu negocio</div>
        <div style={{ fontSize: 14, color: C.textMuted }}>Una revisión de cómo estás vendiendo, no solo cuánto.</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

        {/* ── BARRA AZUL MARINO — sin cambios ─────────────────────────────────── */}
        <div style={{ background: "#0F1729", borderRadius: 24, padding: isMobile ? "24px 20px" : "28px 24px", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12, letterSpacing: "0.5px" }}>
            {MESES_LARGO[HOY.getMonth()].charAt(0).toUpperCase() + MESES_LARGO[HOY.getMonth()].slice(1)} · período general del resumen
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1px 1fr 1px 1fr", alignItems: "center" }}>
            {[
              { label: "Cobrado este mes", val: "$" + formatoDinero(cobradoPeriodo), sub: "pagos recibidos", color: "#4ADE80" },
              { label: "Saldo pendiente al " + labelFecha(FECHA_HOY), val: "$" + formatoDinero(saldoPorCobrar), sub: "en pedidos activos", color: "#FBBF24" },
              { label: "Si cobras todo", val: "$" + formatoDinero(potencial), sub: "", color: "#A78BFA" },
            ].map((k, i) => {
              const isLast = i === 2;
              return [
                <div key={"s" + i} style={{ padding: isMobile ? "10px 8px" : "0 10px", textAlign: "center", borderBottom: isMobile && !isLast ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 6, lineHeight: 1.3 }}>{k.label}</div>
                  <div style={{ fontSize: isMobile ? 24 : 22, fontWeight: 700, color: k.color, lineHeight: 1, marginBottom: 4 }}>{k.val}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{k.sub}</div>
                </div>,
                !isLast && !isMobile ? <div key={"d" + i} style={{ width: 1, background: "rgba(255,255,255,0.08)", alignSelf: "stretch" }} /> : null,
              ];
            }).flat().filter(Boolean)}
          </div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{resumenTexto}</div>
        </div>

        {/* ── GANANCIA ESTIMADA ─────────────────────────────────────────────── */}
        {hayGanancias && (
          <div style={{ background: C.surface, borderRadius: 20, padding: isMobile ? "16px" : "18px 24px", border: "1px solid " + C.border }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "1px" }}>Ganancia estimada — este mes</div>
                {ganParcial && <div style={{ fontSize: 11, fontWeight: 600, color: C.amber, background: C.amber + "18", borderRadius: 6, padding: "2px 8px" }}>Parcial</div>}
              </div>
              {ganMargen != null && <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}><div style={{ fontSize: 26, fontWeight: 800, color: colorGan }}>{ganMargen}%</div><div style={{ fontSize: 11, color: C.textDim, marginLeft: 2 }}>margen</div></div>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 10 }}>
              {[
                { lbl: "Ventas del período", val: "$" + formatoDinero(ganVentasBrutas), nota: "Incluye pedidos por cobrar", color: C.text },
                { lbl: "Costos estimados", val: "$" + formatoDinero(ganCostos), nota: "", color: C.text },
                { lbl: "Ganancia bruta", val: (ganancia < 0 ? "-" : "") + "$" + formatoDinero(Math.abs(ganancia)), nota: "", color: ganancia >= 0 ? C.green : "#EF4444", bg: ganancia >= 0 ? C.greenBg : "#FEF2F2", border: "1px solid " + (ganancia >= 0 ? "#86EFAC" : "#FCA5A5") },
              ].map((g, i) => (
                <div key={i} style={{ background: g.bg || C.bg, borderRadius: 12, padding: "12px 14px", border: g.border || "none" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: g.color, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4 }}>{g.lbl}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: g.color }}>{g.val}</div>
                  {g.nota && <div style={{ fontSize: 11, color: C.textDim, marginTop: 3 }}>{g.nota}</div>}
                </div>
              ))}
            </div>
            {ganParcial && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 10 }}>{ganItemsSinCosto} {ganItemsSinCosto === 1 ? "producto" : "productos"} sin costo configurado.</div>}
          </div>
        )}

        {/* ══════════ EXPLORA TUS VENTAS ═══════════════════════════════ */}
        <section aria-labelledby="explora-ventas" style={{ background: "#FFFFFF", borderRadius: 22, border: "1px solid #E3E6EF", boxShadow: "0 2px 12px rgba(14,19,40,0.06)", padding: isMobile ? "18px" : "22px 24px 24px", boxSizing: "border-box" }}>

          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 }}>
            <span style={{ width: isMobile ? 34 : 36, height: isMobile ? 34 : 36, flexShrink: 0, borderRadius: isMobile ? 11 : 12, background: "#EEF0FF", color: "#3F4BD0", display: "grid", placeItems: "center" }}>
              <IconCmp size={isMobile ? 17 : 18} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 id="explora-ventas" style={{ margin: 0, fontSize: isMobile ? 17 : 18, fontWeight: 800, letterSpacing: "-0.02em", color: "#0E1328" }}>Explora tus ventas</h2>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <SegmentadoTipo tipo={modo} onChange={cambiarModo} opts={opcionesModo} isMobile={isMobile} />
          </div>

          {modo === "periodo" && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #EDEFF5" }}>
              <SegmentadoTipo tipo={tipoPeriodo} onChange={cambiarTipoPeriodo} opts={[["semana", "Semana"], ["mes", "Mes"], ["rango", "Rango"]]} isMobile={isMobile} />

              {tipoPeriodo === "rango" && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
                  <input type="date" value={rangoCustomDesde} max={FECHA_HOY} onChange={(e) => { setRangoCustomDesde(e.target.value); setDiaActivoPeriodo(null); }} style={{ height: 38, borderRadius: 10, border: "1.5px solid #E3E6EF", padding: "0 10px", fontSize: 13, fontFamily: "inherit" }} />
                  <span style={{ fontSize: 12, color: "#6E7489" }}>a</span>
                  <input type="date" value={rangoCustomHasta} max={FECHA_HOY} onChange={(e) => { setRangoCustomHasta(e.target.value); setDiaActivoPeriodo(null); }} style={{ height: 38, borderRadius: 10, border: "1.5px solid #E3E6EF", padding: "0 10px", fontSize: 13, fontFamily: "inherit" }} />
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <button type="button" onClick={() => irPeriodo(-1)} style={{ fontSize: 12, fontWeight: 700, color: "#3F4BD0", background: "#EEF0FF", border: "none", borderRadius: 14, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit" }}>← Período anterior</button>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: "#0E1328", textAlign: "center" }}>{labelRango(rangoPeriodo.desde, rangoPeriodo.hasta)}</div>
                <button type="button" onClick={() => irPeriodo(1)} disabled={!puedeAvanzarPeriodo} style={{ fontSize: 12, fontWeight: 700, color: puedeAvanzarPeriodo ? "#3F4BD0" : "#C7CBDB", background: puedeAvanzarPeriodo ? "#EEF0FF" : "#F4F5FA", border: "none", borderRadius: 14, padding: "7px 12px", cursor: puedeAvanzarPeriodo ? "pointer" : "default", fontFamily: "inherit" }}>Período siguiente →</button>
              </div>

              <div style={{ marginTop: 14, marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: "#4A5068" }}>Vendido en el período: </span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#0E1328" }}>{metPeriodo.montoVendido > 0 ? "$" + formatoDinero(metPeriodo.montoVendido) : "$0"}</span>
              </div>

              <div style={{ marginTop: 14 }}>
                <GraficaDias dias={diasPeriodo} datos={metPeriodo.porDia} diaActivo={diaMostradoPeriodo} onSelect={setDiaActivoPeriodo} isMobile={isMobile} formatoDinero={formatoDinero} parseFechaLocal={parseFechaLocal} FECHA_HOY={FECHA_HOY} />
              </div>

              {diaMostradoPeriodo && metDiaPeriodo && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#4A5068", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Detalle del {labelFecha(diaMostradoPeriodo)}</div>
                  <DetalleDia fecha={diaMostradoPeriodo} met={metDiaPeriodo} isMobile={isMobile} formatoDinero={formatoDinero} TXT={TXT} onVerRegistro={() => verRegistrosDeFecha(diaMostradoPeriodo)} />
                </div>
              )}
            </div>
          )}

          {modo === "comparar" && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #EDEFF5" }}>
              {!editandoFechas ? (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: isMobile ? "nowrap" : "wrap", marginBottom: 4 }}>
                    <OpcionPill selected={false} onClick={() => fijarDiasComparar(ultimosNDias(7, HOY, fmtFechaLocal))} isMobile={isMobile}>{isMobile ? "7 días" : "Últimos 7 días"}</OpcionPill>
                    <OpcionPill selected={false} onClick={() => fijarDiasComparar(ultimosNDiaSemana(4, HOY, fmtFechaLocal))} isMobile={isMobile}>{isMobile ? "4 " + pluralDiaSemana(HOY.getDay()) : "Últimos 4 " + pluralDiaSemana(HOY.getDay())}</OpcionPill>
                    <OpcionPill selected={false} onClick={iniciarEleccionNueva} isMobile={isMobile}>{isMobile ? "Elegir fechas" : "Elegir otras fechas"}</OpcionPill>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {diasOrdenadosComparar.map(f => (
                      <ChipFecha key={f} fecha={f} onCambiar={(nueva) => cambiarUnaFecha(f, nueva)} onQuitar={() => quitarFechaConfirmada(f)} puedeQuitar={diasOrdenadosComparar.length > 2} FECHA_HOY={FECHA_HOY} />
                    ))}
                  </div>
                  {diasOrdenadosComparar.length <= 2 && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>Se necesitan al menos 2 fechas — usa "Cambiar" para reemplazar una, o "Elegir otras fechas" para empezar de nuevo.</div>}
                </>
              ) : (
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0E1328", marginBottom: 10 }}>Elige entre 2 y 7 fechas nuevas:</div>
                  <SelectorFechasMultiples dias={borrador} onAdd={agregarABorrador} onRemove={quitarDeBorrador} max={7} FECHA_HOY={FECHA_HOY} isMobile={isMobile} />
                  {errorBorrador && <div style={{ fontSize: 12, color: "#C9442E", marginTop: 8 }}>{errorBorrador}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button type="button" onClick={aplicarBorrador} style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "#0E1328", border: 0, borderRadius: 14, padding: "9px 18px", cursor: "pointer", fontFamily: "inherit" }}>Aplicar</button>
                    <button type="button" onClick={cancelarEleccion} style={{ fontSize: 13, fontWeight: 700, color: "#4A5068", background: "#F4F5FA", border: 0, borderRadius: 14, padding: "9px 18px", cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
                  </div>
                </div>
              )}

              {!editandoFechas && (
                <>
                  <div style={{ marginTop: 16 }}>
                    <GraficaDias dias={diasOrdenadosComparar} datos={datosComparar} diaActivo={diaMostradoComparar} onSelect={setDiaActivoComparar} isMobile={isMobile} formatoDinero={formatoDinero} parseFechaLocal={parseFechaLocal} FECHA_HOY={FECHA_HOY} />
                  </div>

                  <div style={{ marginTop: 18, marginBottom: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#4A5068", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Resumen de los días elegidos</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0E1328", lineHeight: 1.4, marginBottom: 20 }}>{hallazgoComparar(diasOrdenadosComparar, metsComparar, parseFechaLocal)}</div>

                    {diasOrdenadosComparar.length === 2 && (
                      <>
                        <div style={{ marginBottom: 24 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0E1328", marginBottom: 12 }}>Qué vendiste en cada día</div>
                          <DesgloseProductos met={metsComparar[diasOrdenadosComparar[0]]} metComp={metsComparar[diasOrdenadosComparar[1]]} lblMet={labelFecha(diasOrdenadosComparar[0])} lblComp={labelFecha(diasOrdenadosComparar[1])} formatoDinero={formatoDinero} TXT={TXT} isMobile={isMobile} onVerRegistro={verRegistros} />
                        </div>
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0E1328", marginBottom: 12 }}>A qué hora vendiste</div>
                          <VistaCuandoCompran met={metsComparar[diasOrdenadosComparar[0]]} metComp={metsComparar[diasOrdenadosComparar[1]]} lblMet={labelFecha(diasOrdenadosComparar[0])} lblComp={labelFecha(diasOrdenadosComparar[1])} isMobile={isMobile} formatoDinero={formatoDinero} TXT={TXT} />
                        </div>
                      </>
                    )}
                  </div>

                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#4A5068", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Detalle del {labelFecha(diaMostradoComparar)}</div>
                    <DetalleDia fecha={diaMostradoComparar} met={metsComparar[diaMostradoComparar]} isMobile={isMobile} formatoDinero={formatoDinero} TXT={TXT} onVerRegistro={() => verRegistrosDeFecha(diaMostradoComparar)} ocultarDesglose={diasOrdenadosComparar.length === 2} />
                  </div>
                </>
              )}
            </div>
          )}

          {modo === "eventos" && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #EDEFF5" }}>
              {eventosLista.length === 0 ? (
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#0E1328", marginBottom: 6 }}>Asocia tus ventas a un evento para comparar cómo te fue en cada uno.</div>
                  <div style={{ fontSize: 13, color: "#4A5068", marginBottom: 14 }}>Bazares, ferias, ventas especiales, talleres u otras ocasiones — regístralos desde Inventario → Eventos.</div>
                  <button type="button" onClick={() => setVista("inventario")} style={{ fontSize: 13, fontWeight: 700, color: C_TEAL, background: "rgba(13,148,136,0.09)", border: "none", borderRadius: 14, padding: "9px 16px", cursor: "pointer", fontFamily: "inherit" }}>Ir a Eventos →</button>
                </div>
              ) : eventosLista.length === 1 ? (
                <div style={{ fontSize: 13, color: "#4A5068" }}>Necesitas al menos 2 eventos para comparar. Por ahora tienes 1 registrado.</div>
              ) : (
                <>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#0E1328", marginBottom: 4 }}>¿En qué evento te fue mejor?</div>
                  <div style={{ fontSize: 12, color: "#6E7489", marginBottom: 14 }}>Elige entre 2 y 7 eventos para comparar. Toca uno para quitarlo o agregarlo.</div>

                  <SelectorEventosMultiples eventos={eventosLista} seleccionados={eventosOrdenadosSel} onToggle={toggleEvento} isMobile={isMobile} />
                  {notaSeleccionEventos && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>{notaSeleccionEventos}</div>}

                  <div style={{ marginTop: 18 }}>
                    <GraficaEventos eventos={eventosOrdenadosSel} eventosPorId={eventosPorId} metsEventos={metsEventos} eventoActivo={eventoMostrado} onSelect={setEventoActivo} isMobile={isMobile} formatoDinero={formatoDinero} />
                  </div>

                  <div style={{ marginTop: 18, marginBottom: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#4A5068", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Resumen de los eventos elegidos</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0E1328", lineHeight: 1.4, marginBottom: 6 }}>{hallazgoEventos(eventosOrdenadosSel, eventosPorId, metsEventos)}</div>
                    {notaEventosEnCurso(eventosOrdenadosSel, eventosPorId) && <div style={{ fontSize: 12, color: "#D9971F", fontWeight: 600, marginBottom: 20 }}>{notaEventosEnCurso(eventosOrdenadosSel, eventosPorId)}</div>}

                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0E1328", marginBottom: 12 }}>Qué vendiste en cada evento</div>
                      <TablaProductosEventos eventos={eventosOrdenadosSel} eventosPorId={eventosPorId} metsEventos={metsEventos} formatoDinero={formatoDinero} TXT={TXT} isMobile={isMobile} onVerRegistro={verRegistros} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0E1328", marginBottom: 12 }}>A qué hora vendiste</div>
                      <VistaHorariosEventos eventos={eventosOrdenadosSel} eventosPorId={eventosPorId} metsEventos={metsEventos} isMobile={isMobile} formatoDinero={formatoDinero} TXT={TXT} />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* ══════════ MIS CLIENTES ══════════ */}
        <div style={{ background: C.surface, borderRadius: isMobile ? 22 : 20, padding: isMobile ? "18px" : "22px 24px" }}>
          <VistaOrigenClientes canalesData={canalesData} sinOrigenOps={sinOrigenOps} sinOrigenConv={sinOrigenConv} isMobile={isMobile} setVista={setVista} />
        </div>

        {/* ── LO QUE CLEO APRENDIÓ + TU PRÓXIMO PASO ────────────────────────── */}
        {(() => {
          const bloqueAprendio = (
            <div key="aprendio" style={{ background: C.surface, borderRadius: isMobile ? 22 : 20, padding: isMobile ? "18px" : "22px 24px", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 12, background: "#FBF1DC", color: "#8A5A06", display: "grid", placeItems: "center" }}>
                  <IconBulb size={18} />
                </span>
                <h2 style={{ margin: 0, fontSize: isMobile ? 17 : 18, fontWeight: 800, letterSpacing: "-0.02em", color: "#0E1328" }}>Lo que Cleo aprendió de tu negocio</h2>
              </div>
              {insights.length === 0 ? (
                <div style={{ fontSize: 13, color: C.textMuted, marginTop: 14 }}>Registra más ventas para ver patrones aquí.</div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  {(mostrarInsightsTodos ? insights : insights.slice(0, 3)).map((ins, i) => {
                    const Icono = ICONOS_INSIGHT[ins.ic] || IconBag;
                    const rojo = ins.ic === "x";
                    return (
                      <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid #EDEFF5" }}>
                        <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 11, background: rojo ? "#FBE6E1" : "#EEF0FF", color: rojo ? "#B23A24" : "#3F4BD0", display: "grid", placeItems: "center" }}>
                          <Icono size={16} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <b style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#0E1328", lineHeight: 1.4 }}>{ins.titulo}</b>
                          <span style={{ display: "block", marginTop: 1, fontSize: 12.5, color: "#6E7489" }}>{ins.evidencia}</span>
                        </div>
                      </div>
                    );
                  })}
                  {insights.length > 3 && (
                    <button onClick={() => setMostrarInsightsTodos(v => !v)} style={{ display: "inline-block", marginTop: 6, fontSize: 13, fontWeight: 700, color: "#3F4BD0", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", fontFamily: "inherit" }}>
                      {mostrarInsightsTodos ? "Ver menos" : "Ver " + (insights.length - 3) + " más"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );

          const IconoAccionPrincipal = ICONOS_ACCION[accion.ic] || IconCash;
          const bloqueProximoPaso = (
            <div key="proximo" style={{ background: "#FBF1DC", borderRadius: isMobile ? 22 : 20, padding: isMobile ? "18px" : "22px 24px", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 800, color: "#8A5A06" }}>
                <IconFlag size={15} /> Tu próximo paso
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6E4806" }}>Lo que más impacto tendría hoy.</p>
              <div onClick={accion.fn} style={{ marginTop: isMobile ? 16 : 20, display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
                <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 13, background: "#FFFFFF", color: "#8A5A06", display: "grid", placeItems: "center" }}>
                  <IconoAccionPrincipal size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: isMobile ? 18 : 20, lineHeight: 1.25, fontWeight: 800, letterSpacing: "-0.02em", color: "#5E3D04" }}>{accion.titulo}</div>
                  <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.5, color: "#6E4806" }}>{accion.desc}</p>
                </div>
              </div>
              {acciones.slice(1, 2).map((a, i) => {
                const IconoA = ICONOS_ACCION[a.ic] || IconCash;
                return (
                  <div key={i} onClick={a.fn} style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(138,90,6,0.15)", display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                    <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 10, background: "#FFFFFF", color: "#8A5A06", display: "grid", placeItems: "center" }}>
                      <IconoA size={14} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#5E3D04" }}>{a.titulo}</div>
                      <div style={{ marginTop: 1, fontSize: 11.5, color: "#6E4806" }}>{a.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          );

          return isMobile ? (
            <>{bloqueProximoPaso}{bloqueAprendio}</>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,7fr) minmax(0,5fr)", gap: 16, alignItems: "stretch" }}>
              {bloqueAprendio}{bloqueProximoPaso}
            </div>
          );
        })()}

        {/* ── REPORTE COMERCIAL ─────────────────────────────────────────────── */}
        <div style={{ background: C.surface, borderRadius: isMobile ? 22 : 20, padding: isMobile ? "18px" : "22px 24px", display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: isMobile ? 14 : 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 12, background: "#F4F5FA", color: "#0E1328", display: "grid", placeItems: "center" }}>
              <IconDoc size={18} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: isMobile ? 17 : 18, fontWeight: 800, letterSpacing: "-0.02em", color: "#0E1328" }}>Reporte comercial</h2>
              <p style={{ margin: "3px 0 0", fontSize: 13.5, lineHeight: 1.5, color: "#5A6078" }}>Elige un período y descarga un resumen de tus ventas, cobros, pendientes y oportunidades.</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (setFormReporteComercial) setFormReporteComercial(rangoReporteComercialPorDefecto ? rangoReporteComercialPorDefecto() : {});
              if (setErrorReporteComercial) setErrorReporteComercial("");
              if (setModalReporteComercial) setModalReporteComercial(true);
            }}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: isMobile ? 44 : 36, width: isMobile ? "100%" : "auto", padding: "0 18px", border: 0, borderRadius: isMobile ? 22 : 18, background: "#0E1328", color: "#fff", fontFamily: "inherit", fontSize: isMobile ? 14 : 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
          ><IconDown size={15} />Generar reporte PDF</button>
        </div>

      </div>
    </div>
  );
}
