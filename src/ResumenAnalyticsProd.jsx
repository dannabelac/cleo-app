import { useState, useMemo } from "react";

const MESES_CORTOS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const MESES_LARGO  = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS_SEMANA  = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const DIAS_CORTOS  = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

// ── Helpers de rango ──────────────────────────────────────────────────────────

// Calcula el rango del período A a partir del estado exp
function calcularRangoPeriodo(exp, HOY, fmtFechaLocal, parseFechaLocal) {
  if (exp.tipo === "dia") {
    const f = exp.diaA || fmtFechaLocal(HOY);
    return { desde: f, hasta: f };
  }
  if (exp.tipo === "semana") {
    const ref = exp.semanaRefA ? parseFechaLocal(exp.semanaRefA) : new Date(HOY);
    const ini = new Date(ref); ini.setDate(ref.getDate() - ref.getDay());
    const fin = new Date(ini); fin.setDate(ini.getDate() + 6);
    return { desde: fmtFechaLocal(ini), hasta: fmtFechaLocal(fin) };
  }
  if (exp.tipo === "mes") {
    const { year, month } = exp.mesA || { year: HOY.getFullYear(), month: HOY.getMonth() };
    const ini = new Date(year, month, 1);
    const fin = new Date(year, month + 1, 0);
    return { desde: fmtFechaLocal(ini), hasta: fmtFechaLocal(fin) };
  }
  // personalizado
  const hoy = fmtFechaLocal(HOY);
  return { desde: exp.desdeFechaCustom || hoy, hasta: exp.hastaFechaCustom || hoy };
}

// Calcula el rango de comparación B a partir del estado exp y rangoA ya calculado
function calcularRangoComparacion(tipo, exp, rangoA, fmtFechaLocal, parseFechaLocal) {
  if (tipo === "dia") {
    if (exp.diaB) return { desde: exp.diaB, hasta: exp.diaB };
    const d = parseFechaLocal(rangoA.desde); d.setDate(d.getDate() - 7);
    return { desde: fmtFechaLocal(d), hasta: fmtFechaLocal(d) };
  }
  if (tipo === "semana") {
    if (exp.semanaRefB) {
      const ref = parseFechaLocal(exp.semanaRefB);
      const ini = new Date(ref); ini.setDate(ref.getDate() - ref.getDay());
      const fin = new Date(ini); fin.setDate(ini.getDate() + 6);
      return { desde: fmtFechaLocal(ini), hasta: fmtFechaLocal(fin) };
    }
    const da = parseFechaLocal(rangoA.desde); da.setDate(da.getDate() - 7);
    const db = parseFechaLocal(rangoA.hasta); db.setDate(db.getDate() - 7);
    return { desde: fmtFechaLocal(da), hasta: fmtFechaLocal(db) };
  }
  if (tipo === "mes") {
    if (exp.mesB) {
      const { year, month } = exp.mesB;
      const ini = new Date(year, month, 1);
      const fin = new Date(year, month + 1, 0);
      return { desde: fmtFechaLocal(ini), hasta: fmtFechaLocal(fin) };
    }
    const m = parseFechaLocal(rangoA.desde); m.setMonth(m.getMonth() - 1);
    const ini = new Date(m.getFullYear(), m.getMonth(), 1);
    const fin = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    return { desde: fmtFechaLocal(ini), hasta: fmtFechaLocal(fin) };
  }
  // personalizado
  if (exp.compDesde && exp.compHasta) return { desde: exp.compDesde, hasta: exp.compHasta };
  const d1 = parseFechaLocal(rangoA.desde); const d2 = parseFechaLocal(rangoA.hasta);
  const dur = Math.max(0, Math.round((d2 - d1) / 86400000));
  const cH = new Date(d1); cH.setDate(cH.getDate() - 1);
  const cI = new Date(cH); cI.setDate(cH.getDate() - dur);
  return { desde: fmtFechaLocal(cI), hasta: fmtFechaLocal(cH) };
}

function calcularMetricasRango(desde, hasta, pedidos, ventas, obtenerItemsPedido, enRangoFechas) {
  const pedRango = pedidos.filter(p => {
    const f = p.fecha || (p.fechaCreado || "").slice(0, 10);
    return enRangoFechas(f, desde, hasta) && p.estadoPedido !== "cancelado";
  });
  const ventasRango = ventas.filter(v => enRangoFechas(v.fecha, desde, hasta));

  let montoVendido = 0;
  pedRango.forEach(p => { montoVendido += Number(p.total || 0); });
  ventasRango.forEach(v => { montoVendido += Number(v.monto || 0); });
  const numVentas = pedRango.length + ventasRango.length;
  const promedio = numVentas > 0 ? montoVendido / numVentas : 0;

  const productosMonto = {};
  const productosUnidades = {};
  pedRango.forEach(ped => {
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
  ventasRango.forEach(v => {
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
  const registrarHora = (ts, monto) => {
    const key = ts ? String(new Date(ts).getHours()) : "sin_horario";
    if (!porHora[key]) porHora[key] = { monto: 0, count: 0 };
    porHora[key].monto += Number(monto || 0);
    porHora[key].count++;
  };
  pedRango.forEach(ped => registrarHora(ped.fechaCreado, ped.total));
  ventasRango.forEach(v => registrarHora(v.fechaHoraCreacion, v.monto));

  const porDia = {};
  pedRango.forEach(ped => {
    const k = ped.fecha || (ped.fechaCreado || "").slice(0, 10);
    if (k) { if (!porDia[k]) porDia[k] = { monto: 0, count: 0 }; porDia[k].monto += Number(ped.total || 0); porDia[k].count++; }
  });
  ventasRango.forEach(v => {
    if (v.fecha) { if (!porDia[v.fecha]) porDia[v.fecha] = { monto: 0, count: 0 }; porDia[v.fecha].monto += Number(v.monto || 0); porDia[v.fecha].count++; }
  });

  return { montoVendido, numVentas, promedio, productosMonto, productosUnidades, porHora, porDia };
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

function delta(a, b) {
  if ((a === 0 || a == null) && (b === 0 || b == null)) return { sinBase: true };
  if (b === 0 || b == null) return null;
  const raw = Math.round(((a - b) / Math.abs(b)) * 100);
  return { pct: Math.abs(raw), signo: raw >= 0 ? "+" : "-", sube: raw >= 0 };
}

// Etiqueta legible de período para pastillas rápidas y el renglón de pasos
function humanLabel(tipo, desde, HOY, fmtFechaLocal, parseFechaLocal) {
  const hoy = fmtFechaLocal(HOY);
  if (tipo === "dia") {
    if (desde === hoy) return "hoy";
    const ayer = new Date(HOY); ayer.setDate(HOY.getDate() - 1);
    if (desde === fmtFechaLocal(ayer)) return "ayer";
    const d = parseFechaLocal(desde);
    return DIAS_CORTOS[d.getDay()] + " " + d.getDate() + " " + MESES_CORTOS[d.getMonth()];
  }
  if (tipo === "semana") {
    const ini = new Date(HOY); ini.setDate(HOY.getDate() - HOY.getDay());
    if (desde === fmtFechaLocal(ini)) return "esta semana";
    const iniP = new Date(ini); iniP.setDate(ini.getDate() - 7);
    if (desde === fmtFechaLocal(iniP)) return "la semana pasada";
    return "semana del " + labelFecha(desde);
  }
  if (tipo === "mes") {
    const mesI = new Date(HOY.getFullYear(), HOY.getMonth(), 1);
    if (desde === fmtFechaLocal(mesI)) return "este mes";
    const prevI = new Date(HOY.getFullYear(), HOY.getMonth() - 1, 1);
    if (desde === fmtFechaLocal(prevI)) return "el mes pasado";
    const d = parseFechaLocal(desde);
    return MESES_LARGO[d.getMonth()] + (d.getFullYear() !== HOY.getFullYear() ? " " + d.getFullYear() : "");
  }
  return labelRango(desde, desde);
}

function generarDiasEnRango(desde, hasta, fmtFechaLocal, parseFechaLocal) {
  const dias = [];
  const d = parseFechaLocal(desde);
  const fin = parseFechaLocal(hasta);
  while (d <= fin) { dias.push(fmtFechaLocal(new Date(d))); d.setDate(d.getDate() + 1); }
  return dias;
}

// ── Conclusión de "¿Vendí más?" ───────────────────────────────────────────────

function conclusionVentas(metA, metB, lblA, lblB, formatoDinero, TXT) {
  if (!metA) return { texto: "", detalle: "" };
  const nA = metA.numVentas, nB = metB ? metB.numVentas : null;
  const mA = metA.montoVendido, mB = metB ? metB.montoVendido : null;

  if (!metB) {
    if (nA === 0) return { texto: "Sin ventas registradas en " + lblA + ".", detalle: "Cuando registres una venta o entregues un " + TXT.pedido + " verás tu avance aquí." };
    return { texto: "En " + lblA + " vendiste $" + formatoDinero(mA) + ".", detalle: nA + (nA === 1 ? " " + TXT.venta + " registrada" : " " + TXT.ventas + " registradas") + ". Promedio por " + TXT.venta + ": $" + formatoDinero(metA.promedio) + "." };
  }

  const d = delta(mA, mB);
  if (d && d.sinBase) return { texto: "No hubo ventas en ninguno de los dos períodos.", detalle: "Agrega ventas para comparar tu avance." };
  if (nA === 0 && nB > 0) return { texto: "En " + lblA + " no registraste ventas.", detalle: "En " + lblB + " sí tuviste $" + formatoDinero(mB) + "." };
  if (nA === 0) return { texto: "Sin ventas en ninguno de los dos períodos.", detalle: "Agrega ventas para comparar tu avance." };
  if (!d) return { texto: "En " + lblA + " vendiste $" + formatoDinero(mA) + ".", detalle: "No hay ventas en " + lblB + " para comparar." };

  const direcText = d.sube ? "más" : "menos";
  const texto = "En " + lblA + " vendiste " + d.pct + "% " + direcText + " que " + lblB + ".";
  const detalles = ["$" + formatoDinero(mA) + " vs $" + formatoDinero(mB)];
  const difVentas = Math.abs(nA - nB);
  if (difVentas > 0) detalles.push(nA + " vs " + nB + " " + TXT.ventas);
  if (metA.promedio > 0 && metB.promedio > 0) {
    const dProm = delta(metA.promedio, metB.promedio);
    if (dProm && !dProm.sinBase) detalles.push("promedio: $" + formatoDinero(metA.promedio) + " vs $" + formatoDinero(metB.promedio));
  }
  return { texto, detalle: detalles.join(" · ") };
}

// ── Gráfica comparativa de dos períodos ───────────────────────────────────────

function BarDosDias({ metA, metB, lblA, lblB }) {
  const mA = metA.montoVendido, mB = metB ? metB.montoVendido : 0;
  const nA = metA.numVentas, nB = metB ? metB.numVentas : 0;
  const maxM = Math.max(1, mA, mB);
  const hA = mA > 0 ? Math.max(8, Math.round((mA / maxM) * 80)) : 4;
  const hB = mB > 0 ? Math.max(8, Math.round((mB / maxM) * 80)) : 4;
  return (
    <div style={{ display: "flex", gap: 28, alignItems: "flex-end" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#3F4BD0" }}>{mA > 0 ? "$" + formatoDineroLocal(mA) : "Sin ventas"}</div>
        <div style={{ width: 56, height: hA, borderRadius: "6px 6px 0 0", background: "rgba(63,75,208,0.72)" }} />
        <div style={{ fontSize: 11, color: "#0E1328", fontWeight: 600, textAlign: "center", maxWidth: 110 }}>{lblA}</div>
        {nA > 0 && <div style={{ fontSize: 10, color: "#6E7489" }}>{nA} {nA === 1 ? "venta" : "ventas"}</div>}
      </div>
      {metB && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#6E4806" }}>{mB > 0 ? "$" + formatoDineroLocal(mB) : "Sin ventas"}</div>
          <div style={{ width: 56, height: hB, borderRadius: "6px 6px 0 0", background: "rgba(217,151,31,0.72)" }} />
          <div style={{ fontSize: 11, color: "#0E1328", fontWeight: 600, textAlign: "center", maxWidth: 110 }}>{lblB}</div>
          {nB > 0 && <div style={{ fontSize: 10, color: "#6E7489" }}>{nB} {nB === 1 ? "venta" : "ventas"}</div>}
        </div>
      )}
    </div>
  );
}
// formatoDinero llega por props en todos lados menos aquí (componente puro de presentación);
// se resuelve vía closure asignada por el componente padre antes del primer render.
let formatoDineroLocal = (n) => n;

// ── Vista "Qué me compran" ────────────────────────────────────────────────────

function VistaQueCompran({ metA, metB, lblA, lblB, C, isMobile, formatoDinero, TXT }) {
  const [modoOrden, setModoOrden] = useState("monto");
  if (!metA) return null;
  const productosA = Object.entries(metA.productosMonto).sort((a, b) => b[1] - a[1]);

  if (productosA.length === 0) {
    return (
      <div>
        <div style={{ fontSize: isMobile ? 16 : 15, fontWeight: 800, color: "#0E1328", marginBottom: 6 }}>Sin ventas con desglose en este período.</div>
        <div style={{ fontSize: 13, color: "#4A5068" }}>{"Cuando registres ventas con " + TXT.vista2low + " específicos, aquí verás cuáles te funcionan mejor."}</div>
      </div>
    );
  }

  const top = productosA[0];
  const maxTotal = Math.max(1, ...productosA.map(([, m]) => m), ...(metB ? Object.values(metB.productosMonto) : []));
  const todasKeys = metB ? [...new Set([...Object.keys(metA.productosMonto), ...Object.keys(metB.productosMonto)])] : Object.keys(metA.productosMonto);
  const filas = todasKeys.map(k => ({
    nombre: k,
    mA: metA.productosMonto[k] || 0,
    mB: metB ? (metB.productosMonto[k] || 0) : null,
    uA: metA.productosUnidades[k] || 0,
    uB: metB ? (metB.productosUnidades[k] || 0) : null,
  })).sort((a, b) => modoOrden === "qty" ? b.uA - a.uA : b.mA - a.mA);

  const sinDesglose = filas.some(f => f.nombre === "Sin desglose");
  const porcentaje = (m) => Math.round((m / (metA.montoVendido || 1)) * 100);

  const topQty = filas.slice().sort((a, b) => b.uA - a.uA)[0];
  const liderMonto = top[0] !== "Sin desglose" ? top[0] : null;
  const liderCantidad = topQty && topQty.nombre !== "Sin desglose" ? topQty.nombre : null;

  let texto = "", detalle = "";
  if (top[0] === "Sin desglose") {
    texto = "Tus ventas de " + lblA + " no tienen desglose por " + TXT.vista2low + " aún.";
  } else if (modoOrden === "qty" && liderCantidad) {
    texto = liderCantidad + " es lo que más " + (TXT.vista2low === "servicios" ? "solicitan" : "piden") + " en " + lblA + ".";
    if (liderMonto && liderCantidad !== liderMonto) detalle = "En monto lo lidera " + liderMonto + " con $" + formatoDinero(top[1]) + ".";
    else detalle = productosA.length > 1 ? (productosA.length + " " + TXT.vista2low + " distintos este período.") : "";
  } else {
    texto = liderMonto + " genera más ventas en " + lblA + ": $" + formatoDinero(top[1]) + ".";
    if (liderCantidad && liderCantidad !== liderMonto) detalle = "En cantidad lo lidera " + liderCantidad + " con " + topQty.uA + " unidades.";
    else detalle = productosA.length > 1 ? (productosA.length + " " + TXT.vista2low + " distintos este período.") : "";
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {[["monto", "Qué genera más ventas"], ["qty", "Qué vendo más"]].map(([k, lbl]) => (
          <button key={k} onClick={() => setModoOrden(k)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 14, border: "1.5px solid " + (modoOrden === k ? "#3F4BD0" : "#E3E6EF"), background: modoOrden === k ? "#EEF0FF" : "transparent", color: modoOrden === k ? "#3F4BD0" : "#4A5068", cursor: "pointer", fontWeight: modoOrden === k ? 800 : 600 }}>{lbl}</button>
        ))}
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: isMobile ? 16 : 15, fontWeight: 800, color: "#0E1328", lineHeight: 1.3, marginBottom: 6 }}>{texto}</div>
        {detalle && <div style={{ fontSize: 13, color: "#4A5068" }}>{detalle}</div>}
      </div>

      {metB && (
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#6E7489", marginBottom: 12 }}>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#3F4BD0", marginRight: 4 }} />{lblA}</span>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#D9971F", marginRight: 4 }} />{lblB}</span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filas.slice(0, 12).map((p, i) => {
          const d = metB ? delta(p.mA, p.mB) : null;
          const barA = Math.max(3, Math.round((p.mA / maxTotal) * 120));
          const barB = (metB && p.mB) ? Math.max(3, Math.round((p.mB / maxTotal) * 120)) : 0;
          const pct = porcentaje(p.mA);
          return (
            <div key={i} style={{ background: "#F4F5FA", borderRadius: 12, padding: "10px 14px", border: "1px solid #E3E6EF" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0E1328", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</div>
                  {p.uA && <div style={{ fontSize: 11, color: "#6E7489", marginTop: 1 }}>{p.uA} {p.uA === 1 ? "unidad" : "unidades"}</div>}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#0E1328" }}>${formatoDinero(p.mA)}</div>
                  <div style={{ fontSize: 10, color: "#6E7489" }}>{pct}% del total</div>
                  {d && !d.sinBase && <div style={{ fontSize: 11, fontWeight: 700, color: d.sube ? "#1F9D5C" : "#C9442E" }}>{d.signo}{d.pct}%</div>}
                  {d && d.sinBase && <div style={{ fontSize: 10, color: "#6E7489" }}>Sin base</div>}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ height: 4, background: "#E3E6EF", borderRadius: 2 }}>
                  <div style={{ width: barA + "px", maxWidth: "100%", height: "100%", background: "#3F4BD0", borderRadius: 2 }} />
                </div>
                {metB && <div style={{ height: 4, background: "#E3E6EF", borderRadius: 2 }}>
                  <div style={{ width: barB + "px", maxWidth: "100%", height: "100%", background: "#D9971F", borderRadius: 2 }} />
                </div>}
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

// ── Vista "Cuándo me compran" ─────────────────────────────────────────────────

function VistaCuandoCompran({ metA, metB, lblA, lblB, exp, isMobile, formatoDinero, TXT }) {
  const [modo, setModo] = useState("monto");
  if (!metA) return null;

  const porHoraA = metA.porHora || {};
  const porHoraB = metB ? (metB.porHora || {}) : {};
  const todasHoras = [...new Set([
    ...Object.keys(porHoraA).filter(k => k !== "sin_horario"),
    ...Object.keys(porHoraB).filter(k => k !== "sin_horario"),
  ])].map(Number).sort((a, b) => a - b);

  const sinHorarioA = porHoraA["sin_horario"] || { monto: 0, count: 0 };
  const conHorarioA = todasHoras.reduce((s, h) => s + (porHoraA[String(h)] || { count: 0 }).count, 0);
  const totalRegistros = metA.numVentas;
  const sinHorarioPct = totalRegistros > 0 ? Math.round((sinHorarioA.count / totalRegistros) * 100) : 0;
  const fmt12 = (h) => h === 0 ? "12am" : h < 12 ? h + "am" : h === 12 ? "12pm" : (h - 12) + "pm";

  let texto = "", detalle = "";
  if (conHorarioA === 0 && sinHorarioA.count === 0) {
    texto = "Sin ventas en este período.";
  } else if (conHorarioA === 0) {
    texto = "No se registró hora de venta en este período.";
    detalle = sinHorarioA.count + " " + (sinHorarioA.count === 1 ? TXT.venta : TXT.ventas) + " sin hora exacta.";
  } else {
    const getVal = (h) => modo === "monto" ? (porHoraA[String(h)] || { monto: 0 }).monto : (porHoraA[String(h)] || { count: 0 }).count;
    const mejorHora = todasHoras.reduce((best, h) => getVal(h) > getVal(best) ? h : best, todasHoras[0]);
    const fmtH12 = (h) => h === 0 ? "12 am" : h < 12 ? h + " am" : h === 12 ? "12 pm" : (h - 12) + " pm";
    texto = "La hora con más " + (modo === "monto" ? "ventas" : "compras") + " es las " + fmtH12(mejorHora) + ".";
    if (sinHorarioPct >= 30) detalle = sinHorarioPct + "% de tus ventas no tiene hora registrada. La tendencia es parcial.";
    else if (sinHorarioPct > 0) detalle = sinHorarioPct + "% sin hora exacta.";
  }

  const maxVal = Math.max(1, ...todasHoras.map(h => {
    const vA = modo === "monto" ? (porHoraA[String(h)] || { monto: 0 }).monto : (porHoraA[String(h)] || { count: 0 }).count;
    const vB = modo === "monto" ? (porHoraB[String(h)] || { monto: 0 }).monto : (porHoraB[String(h)] || { count: 0 }).count;
    return Math.max(vA, vB);
  }));

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: isMobile ? 16 : 15, fontWeight: 800, color: "#0E1328", lineHeight: 1.3, marginBottom: 6 }}>{texto}</div>
        {detalle && <div style={{ fontSize: 13, color: "#4A5068" }}>{detalle}</div>}
      </div>

      {conHorarioA > 0 && (
        <>
          <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
            {[["monto", "Por monto"], ["count", "Por número de ventas"]].map(([k, lbl]) => (
              <button key={k} onClick={() => setModo(k)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 14, border: "1.5px solid " + (modo === k ? "#3F4BD0" : "#E3E6EF"), background: modo === k ? "#EEF0FF" : "transparent", color: modo === k ? "#3F4BD0" : "#4A5068", cursor: "pointer", fontWeight: modo === k ? 800 : 600 }}>{lbl}</button>
            ))}
          </div>
          {exp.tipo === "dia" && metB && (
            <div style={{ fontSize: 11, color: "#6E7489", marginBottom: 10 }}>
              Barras por hora del día. <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#3F4BD0", marginRight: 3, marginLeft: 4 }} />{lblA} <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#D9971F", marginRight: 3, marginLeft: 6 }} />{lblB}
            </div>
          )}
          <div style={{ display: "flex", gap: isMobile ? 3 : 4, alignItems: "flex-end", height: 72, overflowX: "auto" }}>
            {todasHoras.map((h, i) => {
              const vA = modo === "monto" ? (porHoraA[String(h)] || { monto: 0 }).monto : (porHoraA[String(h)] || { count: 0 }).count;
              const vB = metB ? (modo === "monto" ? (porHoraB[String(h)] || { monto: 0 }).monto : (porHoraB[String(h)] || { count: 0 }).count) : 0;
              const hA = Math.max(2, Math.round((vA / maxVal) * 60));
              const hB = metB ? Math.max(2, Math.round((vB / maxVal) * 60)) : 0;
              return (
                <div key={i} title={fmt12(h) + ": " + (modo === "monto" ? "$" + formatoDinero(vA) : vA + " ventas") + (metB ? " / " + (modo === "monto" ? "$" + formatoDinero(vB) : vB) : "")} style={{ flex: 1, minWidth: isMobile ? 8 : 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 60 }}>
                    <div style={{ width: metB ? "calc(50% - 0.5px)" : "100%", height: vA > 0 ? hA : 2, borderRadius: "2px 2px 0 0", background: "#3F4BD0" }} />
                    {metB && <div style={{ width: "calc(50% - 0.5px)", height: vB > 0 ? hB : 2, borderRadius: "2px 2px 0 0", background: "#D9971F" }} />}
                  </div>
                  {!isMobile && todasHoras.length <= 12 && <div style={{ fontSize: 7, color: "#9CA3AF" }}>{fmt12(h)}</div>}
                </div>
              );
            })}
          </div>
          {metB && exp.tipo !== "dia" && <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#6E7489", marginTop: 8 }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#3F4BD0", marginRight: 3 }} />{lblA}</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#D9971F", marginRight: 3 }} />{lblB}</span>
          </div>}
          {exp.tipo !== "dia" && <div style={{ fontSize: 11, color: "#6E7489", marginTop: 8 }}>Los totales acumulan todas las ventas del período en cada franja horaria.</div>}
        </>
      )}

      {sinHorarioA.count > 0 && (
        <div style={{ marginTop: 14, padding: "10px 14px", background: "#F4F5FA", borderRadius: 12, border: "1px solid #E3E6EF" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0E1328" }}>{sinHorarioA.count} {sinHorarioA.count === 1 ? TXT.venta : TXT.ventas} sin horario registrado</div>
          <div style={{ fontSize: 11, color: "#6E7489", marginTop: 2 }}>La hora de captura no siempre refleja la hora real de compra.</div>
        </div>
      )}
    </div>
  );
}

// ── Vista "De dónde llegan tus clientes" ──────────────────────────────────────
// (antes era una de 3 pestañas del explorador; ahora es su propia tarjeta,
// siempre visible debajo de "Comparar ventas" — ver Ronda 12 / decisión del 29 oct)

function VistaOrigenClientes({ canalesData, sinOrigenOps, sinOrigenConv, isMobile, setVista }) {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: isMobile ? 17 : 18, fontWeight: 800, color: "#0E1328", lineHeight: 1.3, marginBottom: 4 }}>De dónde llegan tus clientes</div>
        <div style={{ fontSize: 13.5, color: "#5A6078" }}>Clientes registrados por canal y cuántos compraron.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {canalesData.map((c, i) => {
          const tasa = c.total > 0 ? Math.round((c.convertidos / c.total) * 100) : 0;
          const colorBarra = tasa >= 50 ? "#1F9D5C" : tasa >= 25 ? "#D9971F" : "#E3E6EF";
          return (
            <div key={i} style={{ background: "#F4F5FA", borderRadius: 12, padding: "10px 14px", border: "1px solid #E3E6EF" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0E1328" }}>{c.canal}</div>
                <div style={{ fontSize: 11, color: "#6E7489" }}>{c.total} {c.total === 1 ? "cliente" : "clientes"}</div>
              </div>
              <div style={{ fontSize: 12, color: "#4A5068", marginBottom: 6 }}>
                {c.convertidos} {c.convertidos === 1 ? "compró" : "compraron"} · {c.sinConvertir} sin comprar aún
              </div>
              {c.total > 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 4, background: "#E3E6EF", borderRadius: 2 }}>
                    <div style={{ width: tasa + "%", height: "100%", background: colorBarra, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: colorBarra, minWidth: 32, textAlign: "right" }}>{tasa}%</span>
                  <span style={{ fontSize: 11, color: "#6E7489" }}>compraron</span>
                </div>
              ) : <div style={{ fontSize: 11, color: "#6E7489" }}>Sin base para calcular porcentaje.</div>}
            </div>
          );
        })}
        {sinOrigenOps > 0 && (
          <div style={{ background: "#F4F5FA", borderRadius: 12, padding: "10px 14px", border: "1px dashed #D5D8E4" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4A5068" }}>Sin origen registrado</div>
              <div style={{ fontSize: 11, color: "#6E7489" }}>{sinOrigenOps} {sinOrigenOps === 1 ? "cliente" : "clientes"}</div>
            </div>
            <div style={{ fontSize: 12, color: "#4A5068" }}>{sinOrigenConv} {sinOrigenConv === 1 ? "compró" : "compraron"} · No se puede atribuir a ningún canal.</div>
          </div>
        )}
      </div>
      <button onClick={() => setVista("clientes")} style={{ marginTop: 14, fontSize: 12, color: "#3F4BD0", background: "#EEF0FF", border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontWeight: 700 }}>Ver clientes →</button>
    </div>
  );
}

// ── Iconos (Ronda 12) ─────────────────────────────────────────────────────────

function IconCmp({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 20V10M12 20V4M18 20v-7" /></svg>;
}
function IconCheck({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
}
function IconCal({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>;
}
function IconArrow({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

// ── Piezas del sistema visual de Ronda 12 ─────────────────────────────────────

function SegmentadoTipo({ tipo, onChange, isMobile }) {
  const opts = [["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"]];
  return (
    <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 19, background: "#F4F5FA", width: isMobile ? "100%" : "fit-content" }}>
      {opts.map(([k, lbl]) => {
        const on = tipo === k;
        return (
          <button key={k} type="button" onClick={() => onChange(k)} style={{
            flex: isMobile ? 1 : "none", height: isMobile ? 36 : 32, padding: "0 16px", border: 0, borderRadius: 16,
            background: on ? "#FFFFFF" : "transparent", color: on ? "#0E1328" : "#4A5068",
            fontFamily: "inherit", fontSize: 13, fontWeight: on ? 800 : 600, cursor: "pointer",
            boxShadow: on ? "0 1px 2px rgba(14,19,40,.08)" : "none",
          }}>{lbl}</button>
        );
      })}
    </div>
  );
}

function PasoBox({ activo, numero, label, valor }) {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 14,
      background: activo ? "#EEF0FF" : "#F4F5FA", color: activo ? "#3F4BD0" : "#6E7489",
      fontSize: 12.5, fontWeight: 600, minWidth: 0,
    }}>
      <span style={{
        width: 22, height: 22, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center",
        fontSize: 11.5, fontWeight: 800,
        background: activo ? "#3F4BD0" : "#FFFFFF", color: activo ? "#FFFFFF" : "#6E7489",
        boxShadow: activo ? "none" : "inset 0 0 0 1.5px #D5D8E4",
      }}>{numero}</span>
      <div style={{ minWidth: 0 }}>
        {label}
        <b style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{valor}</b>
      </div>
    </div>
  );
}

function OpcionPill({ selected, onClick, children, isMobile, full }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      height: isMobile ? 44 : 38, padding: "0 16px", borderRadius: 19,
      border: "1.5px solid " + (selected ? "#E4E8FF" : "#E3E6EF"),
      background: selected ? "#E4E8FF" : "#FFFFFF",
      fontFamily: "inherit", fontSize: 13.5, fontWeight: selected ? 800 : 600, color: "#0E1328",
      cursor: "pointer", whiteSpace: "nowrap",
      justifyContent: isMobile ? "center" : "flex-start",
      gridColumn: full ? "1 / -1" : undefined,
    }}>{children}</button>
  );
}

function OpcionFechaPill({ selected, textoSeleccionado, value, max, onChange, tipoInput, isMobile, full }) {
  return (
    <label style={{
      position: "relative", display: "inline-flex", alignItems: "center", gap: 8,
      height: isMobile ? 44 : 38, padding: "0 16px", borderRadius: 19,
      border: "1.5px solid " + (selected ? "#E4E8FF" : "#E3E6EF"),
      background: selected ? "#E4E8FF" : "#FFFFFF",
      fontFamily: "inherit", fontSize: 13.5, fontWeight: selected ? 800 : 600, color: "#0E1328",
      cursor: "pointer", whiteSpace: "nowrap",
      justifyContent: isMobile ? "center" : "flex-start",
      gridColumn: full ? "1 / -1" : undefined,
    }}>
      <span style={{ color: selected ? "#3F4BD0" : "#0E1328", display: "flex" }}><IconCal size={15} /></span>
      <span>{selected ? textoSeleccionado : "Otra fecha"}</span>
      <input type={tipoInput || "date"} value={value} max={max} onChange={onChange}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", border: 0, width: "100%", height: "100%" }} />
    </label>
  );
}

function BotonPrincipal({ children, onClick, isMobile }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 8, justifyContent: isMobile ? "center" : "flex-start",
      height: isMobile ? 44 : 36, width: isMobile ? "100%" : "auto",
      padding: "0 18px", border: 0, borderRadius: isMobile ? 22 : 18,
      background: "#0E1328", color: "#FFFFFF", fontFamily: "inherit",
      fontSize: isMobile ? 14 : 13, fontWeight: 700, cursor: "pointer",
    }}>{children}</button>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ResumenAnalyticsProd({
  pedidos, ventas, clientes, productosCat, materialesCat,
  esProductos,
  C, sc, st, isMobile, HOY, FECHA_HOY,
  periodo, setPeriodo,
  formatoDinero, parseFechaLocal, fmtFechaLocal, enRangoFechas,
  obtenerItemsPedido, calcularCostoUnitario, tienePrecioReal, saldoPendienteDe, obtenerReversionIngresoPedido,
  setVista,
  setModalReporteComercial, setFormReporteComercial, rangoReporteComercialPorDefecto, setErrorReporteComercial,
}) {
  formatoDineroLocal = formatoDinero;

  const TXT = esProductos
    ? { venta: "venta", ventas: "ventas", pedido: "pedido", monto: "Monto vendido", num: "Número de ventas", vista2: "Productos", vista2low: "productos" }
    : { venta: "venta", ventas: "ventas", pedido: "trabajo", monto: "Monto registrado", num: "Número de trabajos", vista2: "Servicios", vista2low: "servicios" };

  // Estado del flujo guiado "Comparar ventas" (Ronda 12)
  const [step, setStep] = useState("pickA"); // pickA | pickB | result
  const [exp, setExp] = useState(() => {
    const [y, m] = FECHA_HOY.split("-").map(Number);
    return {
      tipo: "dia",
      diaA: FECHA_HOY, diaB: null,
      semanaRefA: FECHA_HOY, semanaRefB: null,
      mesA: { year: y, month: m - 1 }, mesB: null,
      comparando: true,
    };
  });
  const [mostrarHorarios, setMostrarHorarios] = useState(false);
  const updExp = (ch) => setExp(p => ({ ...p, ...ch }));

  const cambiarTipo = (nuevoTipo) => {
    const [y, m] = FECHA_HOY.split("-").map(Number);
    updExp({
      tipo: nuevoTipo,
      diaA: FECHA_HOY, diaB: null,
      semanaRefA: FECHA_HOY, semanaRefB: null,
      mesA: { year: y, month: m - 1 }, mesB: null,
    });
  };

  // ── Rangos y métricas (misma lógica de siempre) ───────────────────────────
  const rangoA = useMemo(() =>
    calcularRangoPeriodo(exp, HOY, fmtFechaLocal, parseFechaLocal),
    [exp.tipo, exp.diaA, exp.semanaRefA, exp.mesA]
  );
  const rangoB = useMemo(() =>
    calcularRangoComparacion(exp.tipo, exp, rangoA, fmtFechaLocal, parseFechaLocal),
    [exp.tipo, exp.diaB, exp.semanaRefB, exp.mesB, rangoA.desde, rangoA.hasta]
  );
  const metA = useMemo(() =>
    calcularMetricasRango(rangoA.desde, rangoA.hasta, pedidos, ventas, obtenerItemsPedido, enRangoFechas),
    [rangoA.desde, rangoA.hasta, pedidos, ventas]
  );
  const metB = useMemo(() =>
    calcularMetricasRango(rangoB.desde, rangoB.hasta, pedidos, ventas, obtenerItemsPedido, enRangoFechas),
    [rangoB.desde, rangoB.hasta, pedidos, ventas]
  );
  const lblA = humanLabel(exp.tipo, rangoA.desde, HOY, fmtFechaLocal, parseFechaLocal);
  const lblB = humanLabel(exp.tipo, rangoB.desde, HOY, fmtFechaLocal, parseFechaLocal);

  // ── Cobros y saldo del mes en curso ────────────────────────────────────────
  // La barra azul ya no sigue al selector de "Comparar ventas" (que ahora
  // compara 2 períodos cualesquiera, no un único período "actual") , se
  // queda fija sobre el mes en curso, igual que su diseño.
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

  // Ganancia estimada (mes actual, igual que antes)
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

  // ── Insights ──────────────────────────────────────────────────────────────
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
  if (topProducto) insights.push({ ic: "📦", titulo: "Tu " + TXT.vista2low.slice(0, -1) + " más pedido: " + topProducto[0], evidencia: topProducto[1] + (topProducto[1] === 1 ? " vez pedido" : " veces pedido"), accion: null });
  if (topCanal) insights.push({ ic: "📣", titulo: "Canal con más clientes: " + topCanal[0], evidencia: topCanal[1] + (topCanal[1] === 1 ? " cliente llegó por ahí" : " clientes llegaron por ahí"), accion: null });
  if (promDiasConv !== null) insights.push({ ic: "⏱️", titulo: promDiasConv === 0 ? "Tus clientes deciden en el día" : "En promedio cierras en " + promDiasConv + " días", evidencia: "Con " + tiemposConv.length + (tiemposConv.length === 1 ? " venta convertida" : " ventas convertidas"), accion: null });
  if (saldoPorCobrar > 0) insights.push({ ic: "💰", titulo: "$" + formatoDinero(saldoPorCobrar) + " pendientes de cobrar", evidencia: "Pedidos activos o entregados con saldo sin liquidar", accion: { label: "Ver pedidos con saldo", fn: () => setVista("pedidos") } });
  if (canceladosPer.length > 0) insights.push({ ic: "❌", titulo: canceladosPer.length + (canceladosPer.length === 1 ? " pedido cancelado" : " pedidos cancelados") + " este mes", evidencia: (() => { const mc = {}; canceladosPer.forEach(p => { if (p.motivoCancelacion) mc[p.motivoCancelacion] = (mc[p.motivoCancelacion] || 0) + 1; }); const top = Object.entries(mc).sort((a, b) => b[1] - a[1])[0]; return top ? 'Motivo más común: "' + top[0] + '"' : "Sin motivo dominante"; })(), accion: { label: "Ver pedidos", fn: () => setVista("pedidos") } });
  if (topMotivoPerdida && topMotivoPerdida[1] >= 2) insights.push({ ic: "⚠️", titulo: '"' + topMotivoPerdida[0] + '" repite como motivo de pérdida', evidencia: topMotivoPerdida[1] + " de " + totalPerdidas + " oportunidades o pedidos perdidos", accion: { label: "Ver clientes perdidos", fn: () => setVista("prospectos") } });
  if (sinOrigenCount > 0) insights.push({ ic: "❓", titulo: sinOrigenCount + (sinOrigenCount === 1 ? " cliente sin canal registrado" : " clientes sin canal registrado"), evidencia: "No se puede saber qué canal los trajo", accion: null });

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
  if (opsEnSeg.length > 0) acciones.push({ ic: "💬", titulo: "Da seguimiento a " + opsEnSeg.length + (opsEnSeg.length === 1 ? " oportunidad" : " oportunidades") + " en espera", desc: "Ya saben el precio. Un mensaje puede cerrar la venta.", fn: () => setVista("prospectos") });
  if (saldoPorCobrar > 0) acciones.push({ ic: "💰", titulo: "Cobra los $" + formatoDinero(saldoPorCobrar) + " pendientes", desc: "Ya entregaste o tienes pedidos activos con saldo.", fn: () => setVista("pedidos") });
  if (opsSinPrecio.length > 0) acciones.push({ ic: "🏷️", titulo: "Manda precio a " + opsSinPrecio.length + (opsSinPrecio.length === 1 ? " oportunidad" : " oportunidades"), desc: "Ya tienen " + TXT.vista2low.slice(0, -1) + " de interés. Solo falta el precio.", fn: () => setVista("prospectos") });
  if (opsSinProducto.length > 0) acciones.push({ ic: "🎯", titulo: opsSinProducto.length + (opsSinProducto.length === 1 ? " contacto sin" : " contactos sin") + " " + TXT.vista2low.slice(0, -1) + " definido", desc: "Pregúntales qué les interesa.", fn: () => setVista("prospectos") });
  if (acciones.length === 0) acciones.push({ ic: "✨", titulo: "Agrega nuevas oportunidades", desc: "Cuando alguien te pregunte por tus " + TXT.vista2low + ", regístralo.", fn: () => setVista("prospectos") });
  const accion = acciones[0];

  // ── Datos para el picker de la Ronda 12 (paso 1 / paso 2) ─────────────────
  const ayerStr = (() => { const d = new Date(HOY); d.setDate(d.getDate() - 1); return fmtFechaLocal(d); })();
  const semanaPasadaRefStr = (() => { const d = new Date(HOY); d.setDate(d.getDate() - 7); return fmtFechaLocal(d); })();
  const mesPasado = (() => { const d = new Date(HOY.getFullYear(), HOY.getMonth() - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })();

  const preguntaA = exp.tipo === "dia" ? "¿Qué día quieres revisar?" : exp.tipo === "semana" ? "¿Qué semana quieres revisar?" : "¿Qué mes quieres revisar?";
  const preguntaB = exp.tipo === "dia" ? "¿Con qué día lo comparas?" : exp.tipo === "semana" ? "¿Con qué semana lo comparas?" : "¿Con qué mes lo comparas?";
  const labelPasoUno = exp.tipo === "dia" ? "Primer día" : exp.tipo === "semana" ? "Primera semana" : "Primer mes";
  const labelPasoDos = exp.tipo === "dia" ? "Segundo día" : exp.tipo === "semana" ? "Segunda semana" : "Segundo mes";
  const valorPasoUno = step === "pickA" ? "Por elegir" : (exp.tipo === "dia" ? (lblA === "hoy" ? "Hoy · " + labelFecha(rangoA.desde) : lblA === "ayer" ? "Ayer · " + labelFecha(rangoA.desde) : labelFecha(rangoA.desde)) : exp.tipo === "semana" ? labelFecha(rangoA.desde) + " al " + labelFecha(rangoA.hasta) : MESES_LARGO[parseFechaLocal(rangoA.desde).getMonth()]);
  const valorPasoDos = step !== "result" && step !== "pickB" ? "Por elegir" : (exp.tipo === "dia" ? labelFecha(rangoB.desde) : exp.tipo === "semana" ? labelFecha(rangoB.desde) + " al " + labelFecha(rangoB.hasta) : MESES_LARGO[parseFechaLocal(rangoB.desde).getMonth()]);

  function mesVal(m) { return m ? m.year + "-" + String(m.month + 1).padStart(2, "0") : ""; }
  const mesMax = FECHA_HOY.slice(0, 7);

  // Modo elegido en paso 1 (para resaltar la pastilla correcta)
  const modoA = exp.tipo === "dia" ? (lblA === "hoy" ? "principal1" : lblA === "ayer" ? "principal2" : "otra")
    : exp.tipo === "semana" ? (lblA === "esta semana" ? "principal1" : lblA === "la semana pasada" ? "principal2" : "otra")
    : (lblA === "este mes" ? "principal1" : lblA === "el mes pasado" ? "principal2" : "otra");

  // Modo elegido en paso 2: "sugerido" = aún no se tocó (usa el default automático)
  const modoB = exp.diaB == null && exp.semanaRefB == null && exp.mesB == null ? "sugerido"
    : exp.tipo === "dia" ? (exp.diaB === ayerStr ? "ayer" : "otra")
    : "otra";

  function renderOpcionesPaso1() {
    if (exp.tipo === "dia") {
      return (
        <div className="opts" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, ...(isMobile ? { display: "grid", gridTemplateColumns: "1fr 1fr" } : {}) }}>
          <OpcionPill selected={modoA === "principal1"} onClick={() => updExp({ diaA: FECHA_HOY })} isMobile={isMobile}>
            {modoA === "principal1" && <IconCheck />}Hoy <small style={{ fontSize: 13, fontWeight: 500, color: modoA === "principal1" ? "#3F4BD0" : "#6E7489" }}>{labelFecha(FECHA_HOY)}</small>
          </OpcionPill>
          <OpcionPill selected={modoA === "principal2"} onClick={() => updExp({ diaA: ayerStr })} isMobile={isMobile}>
            Ayer <small style={{ fontSize: 13, fontWeight: 500, color: modoA === "principal2" ? "#3F4BD0" : "#6E7489" }}>{labelFecha(ayerStr)}</small>
          </OpcionPill>
          <OpcionFechaPill selected={modoA === "otra"} textoSeleccionado={"Otra fecha " + labelFecha(rangoA.desde) + " " + rangoA.desde.slice(0, 4)}
            value={rangoA.desde} max={FECHA_HOY} onChange={(e) => updExp({ diaA: e.target.value })} isMobile={isMobile} full />
        </div>
      );
    }
    if (exp.tipo === "semana") {
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, ...(isMobile ? { display: "grid", gridTemplateColumns: "1fr 1fr" } : {}) }}>
          <OpcionPill selected={modoA === "principal1"} onClick={() => updExp({ semanaRefA: FECHA_HOY })} isMobile={isMobile} full={isMobile}>
            {modoA === "principal1" && <IconCheck />}Esta semana
          </OpcionPill>
          <OpcionPill selected={modoA === "principal2"} onClick={() => updExp({ semanaRefA: semanaPasadaRefStr })} isMobile={isMobile} full={isMobile}>
            Semana pasada
          </OpcionPill>
          <OpcionFechaPill selected={modoA === "otra"} textoSeleccionado={"Otra semana " + labelFecha(rangoA.desde) + " al " + labelFecha(rangoA.hasta)}
            value={exp.semanaRefA || FECHA_HOY} max={FECHA_HOY} onChange={(e) => updExp({ semanaRefA: e.target.value })} isMobile={isMobile} full />
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, ...(isMobile ? { display: "grid", gridTemplateColumns: "1fr 1fr" } : {}) }}>
        <OpcionPill selected={modoA === "principal1"} onClick={() => { const [y, m] = FECHA_HOY.split("-").map(Number); updExp({ mesA: { year: y, month: m - 1 } }); }} isMobile={isMobile} full={isMobile}>
          {modoA === "principal1" && <IconCheck />}Este mes
        </OpcionPill>
        <OpcionPill selected={modoA === "principal2"} onClick={() => updExp({ mesA: mesPasado })} isMobile={isMobile} full={isMobile}>
          Mes pasado
        </OpcionPill>
        <OpcionFechaPill selected={modoA === "otra"} textoSeleccionado={"Otro mes " + MESES_LARGO[parseFechaLocal(rangoA.desde).getMonth()] + " " + rangoA.desde.slice(0, 4)}
          tipoInput="month" value={mesVal(exp.mesA)} max={mesMax}
          onChange={(e) => { const [y, m] = e.target.value.split("-").map(Number); updExp({ mesA: { year: y, month: m - 1 } }); }} isMobile={isMobile} full />
      </div>
    );
  }

  function renderOpcionesPaso2() {
    if (exp.tipo === "dia") {
      const dSug = parseFechaLocal(rangoB.desde);
      const sugTxt = DIAS_SEMANA[dSug.getDay()].charAt(0).toUpperCase() + DIAS_SEMANA[dSug.getDay()].slice(1) + " pasado";
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, ...(isMobile ? { display: "grid", gridTemplateColumns: "1fr 1fr" } : {}) }}>
          <OpcionPill selected={modoB === "sugerido"} onClick={() => updExp({ diaB: null })} isMobile={isMobile}>
            {modoB === "sugerido" && <IconCheck />}{sugTxt} <small style={{ fontSize: 13, fontWeight: 500, color: modoB === "sugerido" ? "#3F4BD0" : "#6E7489" }}>{labelFecha(rangoB.desde)}</small>
          </OpcionPill>
          <OpcionPill selected={modoB === "ayer"} onClick={() => updExp({ diaB: ayerStr })} isMobile={isMobile}>
            Ayer <small style={{ fontSize: 13, fontWeight: 500, color: modoB === "ayer" ? "#3F4BD0" : "#6E7489" }}>{labelFecha(ayerStr)}</small>
          </OpcionPill>
          <OpcionFechaPill selected={modoB === "otra"} textoSeleccionado={"Otra fecha " + labelFecha(rangoB.desde) + " " + rangoB.desde.slice(0, 4)}
            value={rangoB.desde} max={FECHA_HOY} onChange={(e) => updExp({ diaB: e.target.value })} isMobile={isMobile} full />
        </div>
      );
    }
    if (exp.tipo === "semana") {
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <OpcionPill selected={modoB === "sugerido"} onClick={() => updExp({ semanaRefB: null })} isMobile={isMobile} full>
            {modoB === "sugerido" && <IconCheck />}Semana pasada <small style={{ fontSize: 13, fontWeight: 500, color: modoB === "sugerido" ? "#3F4BD0" : "#6E7489" }}>{labelFecha(rangoB.desde) + " al " + labelFecha(rangoB.hasta)}</small>
          </OpcionPill>
          <OpcionFechaPill selected={modoB === "otra"} textoSeleccionado={"Otra semana " + labelFecha(rangoB.desde) + " al " + labelFecha(rangoB.hasta)}
            value={exp.semanaRefB || rangoB.desde} max={FECHA_HOY} onChange={(e) => updExp({ semanaRefB: e.target.value })} isMobile={isMobile} full />
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <OpcionPill selected={modoB === "sugerido"} onClick={() => updExp({ mesB: null })} isMobile={isMobile} full>
          {modoB === "sugerido" && <IconCheck />}Mes pasado <small style={{ fontSize: 13, fontWeight: 500, color: modoB === "sugerido" ? "#3F4BD0" : "#6E7489" }}>{MESES_LARGO[parseFechaLocal(rangoB.desde).getMonth()]}</small>
        </OpcionPill>
        <OpcionFechaPill selected={modoB === "otra"} textoSeleccionado={"Otro mes " + MESES_LARGO[parseFechaLocal(rangoB.desde).getMonth()] + " " + rangoB.desde.slice(0, 4)}
          tipoInput="month" value={exp.mesB ? mesVal(exp.mesB) : mesVal({ year: parseFechaLocal(rangoB.desde).getFullYear(), month: parseFechaLocal(rangoB.desde).getMonth() })} max={mesMax}
          onChange={(e) => { const [y, m] = e.target.value.split("-").map(Number); updExp({ mesB: { year: y, month: m - 1 } }); }} isMobile={isMobile} full />
      </div>
    );
  }

  const concl = step === "result" ? conclusionVentas(metA, metB, lblA, lblB, formatoDinero, TXT) : null;

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
            {MESES_LARGO[HOY.getMonth()].charAt(0).toUpperCase() + MESES_LARGO[HOY.getMonth()].slice(1)}
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

        {/* ══════════ COMPARAR VENTAS (Ronda 12) ═══════════════════════════════ */}
        <section aria-labelledby="cmp-ventas" style={{ background: "#FFFFFF", borderRadius: isMobile ? 22 : 22, border: "1px solid #E3E6EF", boxShadow: "0 2px 12px rgba(14,19,40,0.06)", padding: isMobile ? "18px" : "22px 24px 24px", boxSizing: "border-box" }}>

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 }}>
              <span style={{ width: isMobile ? 34 : 36, height: isMobile ? 34 : 36, flexShrink: 0, borderRadius: isMobile ? 11 : 12, background: "#EEF0FF", color: "#3F4BD0", display: "grid", placeItems: "center" }}>
                <IconCmp size={isMobile ? 17 : 18} />
              </span>
              <div style={{ minWidth: 0 }}>
                <h2 id="cmp-ventas" style={{ margin: 0, fontSize: isMobile ? 17 : 18, fontWeight: 800, letterSpacing: "-0.02em", color: "#0E1328" }}>Comparar ventas</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13.5, lineHeight: 1.5, color: "#5A6078" }}>Elige 2 períodos y te digo cuál vendiste más, qué vendiste y a qué hora.</p>
              </div>
            </div>
            {!isMobile && <SegmentadoTipo tipo={exp.tipo} onChange={cambiarTipo} isMobile={false} />}
          </div>
          {isMobile && <div style={{ marginTop: 16 }}><SegmentadoTipo tipo={exp.tipo} onChange={cambiarTipo} isMobile /></div>}

          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <PasoBox activo={step === "pickA"} numero="1" label={labelPasoUno} valor={valorPasoUno} />
            <PasoBox activo={step === "pickB" || step === "result"} numero="2" label={labelPasoDos} valor={valorPasoDos} />
          </div>

          {step === "pickA" && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #EDEFF5" }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", color: "#0E1328" }}>{preguntaA}</p>
              {renderOpcionesPaso1()}
              <div style={{ marginTop: 20, display: "flex", justifyContent: isMobile ? "stretch" : "flex-end" }}>
                <BotonPrincipal onClick={() => setStep("pickB")} isMobile={isMobile}>Siguiente<IconArrow /></BotonPrincipal>
              </div>
            </div>
          )}

          {step === "pickB" && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #EDEFF5" }}>
              <button type="button" onClick={() => setStep("pickA")} style={{ background: "none", border: "none", color: "#4A5068", fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 12, fontFamily: "inherit" }}>← Revisando {lblA}</button>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", color: "#0E1328" }}>{preguntaB}</p>
              {renderOpcionesPaso2()}
              <div style={{ marginTop: 20, display: "flex", justifyContent: isMobile ? "stretch" : "flex-end" }}>
                <BotonPrincipal onClick={() => setStep("result")} isMobile={isMobile}>Comparar<IconArrow /></BotonPrincipal>
              </div>
            </div>
          )}

          {step === "result" && concl && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #EDEFF5" }}>

              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: isMobile ? 17 : 16, fontWeight: 800, color: "#0E1328", lineHeight: 1.3, marginBottom: 6 }}>{concl.texto}</div>
                {concl.detalle && <div style={{ fontSize: 13, color: "#4A5068", lineHeight: 1.5 }}>{concl.detalle}</div>}
              </div>

              <div style={{ paddingBottom: 20, borderBottom: "1px solid #EDEFF5", marginBottom: 20, overflowX: "auto" }}>
                <BarDosDias metA={metA} metB={metB} lblA={lblA} lblB={lblB} />
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#4A5068", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Qué vendiste cada {exp.tipo === "dia" ? "día" : exp.tipo === "semana" ? "semana" : "mes"}</div>
                <VistaQueCompran metA={metA} metB={metB} lblA={lblA} lblB={lblB} C={C} isMobile={isMobile} formatoDinero={formatoDinero} TXT={TXT} />
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#4A5068", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>A qué hora vendiste</div>
                <VistaCuandoCompran metA={metA} metB={metB} lblA={lblA} lblB={lblB} exp={exp} isMobile={isMobile} formatoDinero={formatoDinero} TXT={TXT} />
              </div>

              <div style={{ marginTop: 20 }}>
                <button type="button" onClick={() => { setStep("pickA"); }} style={{ fontSize: 12, fontWeight: 700, color: "#3F4BD0", background: "#EEF0FF", border: "none", borderRadius: 14, padding: "7px 14px", cursor: "pointer", fontFamily: "inherit" }}>Comparar otros períodos</button>
              </div>
            </div>
          )}
        </section>

        {/* ══════════ MIS CLIENTES — reubicada fuera de pestañas (29 oct), sin estilo nuevo (fuera de alcance de Ronda 12) ══════════ */}
        <div style={{ background: C.surface, borderRadius: 20, border: "1px solid " + C.border, padding: isMobile ? "16px" : "22px 24px" }}>
          <VistaOrigenClientes canalesData={canalesData} sinOrigenOps={sinOrigenOps} sinOrigenConv={sinOrigenConv} isMobile={isMobile} setVista={setVista} />
        </div>

        {/* ── ESTO LLAMA LA ATENCIÓN + TU PRÓXIMO PASO ─────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
          <div style={{ background: C.surface, borderRadius: 20, padding: isMobile ? "16px" : "22px 24px", border: "1px solid " + C.border }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.purple, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>Esto llama la atención</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 18 }}>
              {insights.length === 0 ? "Registra más ventas para ver patrones aquí." : "Hallazgos del mes — cada uno tiene acción."}
            </div>
            {insights.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(mostrarInsightsTodos ? insights : insights.slice(0, 3)).map((ins, i) => (
                  <div key={i} style={{ borderRadius: 12, padding: "12px 14px", border: "1px solid " + C.border, background: C.bg }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <div style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{ins.ic}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2, lineHeight: 1.3 }}>{ins.titulo}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4, marginBottom: ins.accion ? 8 : 0 }}>{ins.evidencia}</div>
                        {ins.accion && <button onClick={ins.accion.fn} style={{ fontSize: 11, fontWeight: 600, color: C.purple, background: C.purplePale, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>{ins.accion.label} →</button>}
                      </div>
                    </div>
                  </div>
                ))}
                {insights.length > 3 && (
                  <button onClick={() => setMostrarInsightsTodos(v => !v)} style={{ fontSize: 12, color: C.purple, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                    {mostrarInsightsTodos ? "Ver menos" : "Ver " + (insights.length - 3) + " más"}
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ background: C.surface, borderRadius: 20, padding: isMobile ? "16px" : "22px 24px", border: "1px solid " + C.border }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>Tu próximo paso</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 18 }}>Lo que más impacto tendría hoy.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div onClick={accion.fn} style={{ background: C.greenBg, borderRadius: 14, padding: "14px 16px", border: "1px solid #86EFAC", cursor: "pointer" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4, lineHeight: 1.3 }}>{accion.ic} {accion.titulo}</div>
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>{accion.desc}</div>
              </div>
              {acciones.slice(1, 2).map((a, i) => (
                <div key={i} onClick={a.fn} style={{ background: C.bg, borderRadius: 12, padding: "12px 14px", border: "1px solid " + C.border, cursor: "pointer" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{a.ic} {a.titulo}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{a.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── REPORTE COMERCIAL ─────────────────────────────────────────────── */}
        <div style={{ background: C.surface, borderRadius: 20, padding: isMobile ? "16px" : "20px 24px", border: "1px solid " + C.border, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Reporte comercial</div>
            <div style={{ fontSize: 13, color: C.textMuted }}>Elige un período y descarga un resumen de tus ventas, cobros, pendientes y oportunidades.</div>
          </div>
          <button
            onClick={() => {
              if (setFormReporteComercial) setFormReporteComercial(rangoReporteComercialPorDefecto ? rangoReporteComercialPorDefecto() : {});
              if (setErrorReporteComercial) setErrorReporteComercial("");
              if (setModalReporteComercial) setModalReporteComercial(true);
            }}
            style={{ padding: "10px 20px", borderRadius: 12, border: "none", background: "#0E1328", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
          >Generar reporte PDF</button>
        </div>

      </div>
    </div>
  );
}
