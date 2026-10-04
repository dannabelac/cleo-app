import React from "react";
import { Document, Page, View, Text, StyleSheet, pdf } from "@react-pdf/renderer";

function txt(v, max) {
  if (v == null) return "";
  var s = String(v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return s.length > (max || 200) ? s.slice(0, max || 200) + "..." : s;
}

function fechaCorta(f) {
  var M = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  var p = String(f || "").split("-");
  return p.length === 3 ? Number(p[2]) + " " + (M[Number(p[1]) - 1] || p[1]) + " " + p[0] : String(f || "");
}

function generadoAhora() {
  var d = new Date();
  var M = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  var h = d.getHours(), mm = String(d.getMinutes()).padStart(2, "0");
  return d.getDate() + " " + M[d.getMonth()] + " " + d.getFullYear() + "  " + (h % 12 || 12) + ":" + mm + " " + (h >= 12 ? "p.m." : "a.m.");
}

function diffStr(cantAntes, cantDespues, tipo) {
  var antes = cantAntes != null ? Number(cantAntes) : null;
  var despues = cantDespues != null ? Number(cantDespues) : null;
  if (antes === null && despues !== null) return "+" + despues;
  if (antes !== null && despues !== null) {
    var d = despues - antes;
    return d >= 0 ? "+" + d : String(d);
  }
  return "";
}

// ─── Colores ──────────────────────────────────────────────────────────────────
var TINTA  = "#0B1020";
var AZUL   = "#4B5EFC";
var AZUL_L = "#7B8AFC";
var TXT    = "#111827";
var MUTED  = "#6B7280";
var DIM    = "#9CA3AF";
var BORDE  = "#E5E7EB";
var FONDO  = "#F9FAFB";
var VERDE  = "#059669";
var AMBAR  = "#D97706";
var ROJO   = "#DC2626";

var COL_ENT = 72;
var COL_SAL = 72;
var COL_ACT = 80;

var COL_HIST_FECHA   = 72;
var COL_HIST_PROD    = 110;
var COL_HIST_DELTA   = 44;

var S = StyleSheet.create({
  pag: {
    paddingTop: 36, paddingBottom: 44, paddingHorizontal: 36,
    fontFamily: "Helvetica", fontSize: 10, color: TXT, backgroundColor: "#ffffff"
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: TINTA, borderRadius: 10,
    paddingTop: 18, paddingBottom: 18, paddingHorizontal: 20, marginBottom: 20
  },
  brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  brandBox: {
    width: 18, height: 18, borderRadius: 4, backgroundColor: AZUL,
    alignItems: "center", justifyContent: "center"
  },
  brandC:    { color: "#ffffff", fontSize: 9, fontFamily: "Helvetica-Bold" },
  brandName: { color: "#ffffff", fontSize: 9, fontFamily: "Helvetica-Bold", marginLeft: 3, letterSpacing: 1 },
  brandTag:  { color: AZUL_L, fontSize: 8, fontFamily: "Helvetica-Bold", marginLeft: 10, letterSpacing: 1.5 },
  negocio:   { color: "#ffffff", fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  periodo:   { color: DIM, fontSize: 10 },

  // ── Resumen 3 cajas ──────────────────────────────────────────────────────────
  statsRow:  { flexDirection: "row", marginBottom: 20 },
  statBox:   {
    flex: 1, backgroundColor: FONDO,
    borderWidth: 1, borderColor: BORDE, borderRadius: 8,
    paddingTop: 12, paddingBottom: 12, paddingHorizontal: 14
  },
  statLabel: { color: MUTED, fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, marginBottom: 5 },
  statNum:   { color: TXT, fontSize: 24, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  statNumR:  { color: ROJO, fontSize: 24, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  statNumV:  { color: VERDE, fontSize: 24, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  statSub:   { color: DIM, fontSize: 8 },
  statMid:   { marginHorizontal: 8 },

  // ── Sección ──────────────────────────────────────────────────────────────────
  secRow:    { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  secTxt:    { color: TXT, fontSize: 11, fontFamily: "Helvetica-Bold" },
  secLinea:  { flex: 1, height: 1, backgroundColor: BORDE, marginLeft: 8 },

  // ── Tabla resumen ────────────────────────────────────────────────────────────
  thead: {
    flexDirection: "row",
    backgroundColor: FONDO, borderWidth: 1, borderColor: BORDE, borderRadius: 6,
    paddingTop: 7, paddingBottom: 7, paddingHorizontal: 12, marginBottom: 1
  },
  thProd:  { flex: 1, color: MUTED, fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 0.4 },
  thNum:   { width: COL_ENT, color: MUTED, fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 0.4, textAlign: "right" },
  thAct:   { width: COL_ACT, color: MUTED, fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 0.4, textAlign: "right" },

  fila: {
    flexDirection: "row", alignItems: "center",
    borderBottomWidth: 1, borderBottomColor: BORDE,
    paddingTop: 9, paddingBottom: 9, paddingHorizontal: 12
  },
  filaNombre: { flex: 1, color: TXT, fontSize: 10, fontFamily: "Helvetica-Bold" },
  filaNumV:   { width: COL_ENT, color: VERDE, fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right" },
  filaNumR:   { width: COL_SAL, color: ROJO,  fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right" },
  filaNum:    { width: COL_ACT, color: TXT,   fontSize: 10, textAlign: "right" },
  filaNumA:   { width: COL_ACT, color: AMBAR, fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right" },
  filaNumRed: { width: COL_ACT, color: ROJO,  fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right" },

  totalFila: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: TINTA, borderRadius: 6,
    paddingTop: 9, paddingBottom: 9, paddingHorizontal: 12, marginTop: 4
  },
  totalLabel: { flex: 1, color: "#ffffff", fontSize: 10, fontFamily: "Helvetica-Bold" },
  totalNum:   { width: COL_ENT, color: "#ffffff", fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right" },
  totalAct:   { width: COL_ACT, color: DIM,      fontSize: 10, textAlign: "right" },

  // ── Historial ────────────────────────────────────────────────────────────────
  histSec:   { marginTop: 24 },
  histThead: {
    flexDirection: "row",
    backgroundColor: FONDO, borderWidth: 1, borderColor: BORDE, borderRadius: 6,
    paddingTop: 6, paddingBottom: 6, paddingHorizontal: 10, marginBottom: 1
  },
  hthFecha:  { width: COL_HIST_FECHA, color: MUTED, fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 0.4 },
  hthProd:   { width: COL_HIST_PROD,  color: MUTED, fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 0.4 },
  hthMov:    { flex: 1,               color: MUTED, fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 0.4 },
  hthDelta:  { width: COL_HIST_DELTA, color: MUTED, fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 0.4, textAlign: "right" },

  hFila: {
    flexDirection: "row", alignItems: "center",
    borderBottomWidth: 1, borderBottomColor: BORDE,
    paddingTop: 7, paddingBottom: 7, paddingHorizontal: 10
  },
  hFecha:   { width: COL_HIST_FECHA, color: MUTED, fontSize: 9 },
  hProd:    { width: COL_HIST_PROD,  color: TXT,   fontSize: 9, fontFamily: "Helvetica-Bold" },
  hNota:    { flex: 1,               color: TXT,   fontSize: 9 },
  hDeltaV:  { width: COL_HIST_DELTA, color: VERDE, fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "right" },
  hDeltaR:  { width: COL_HIST_DELTA, color: ROJO,  fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "right" },
  hDelta:   { width: COL_HIST_DELTA, color: MUTED, fontSize: 9, textAlign: "right" },

  // ── Vacío / Footer ───────────────────────────────────────────────────────────
  vacio: { color: MUTED, fontSize: 10, textAlign: "center", marginTop: 28, marginBottom: 28 },
  footerRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 28
  },
  footerL: { color: DIM, fontSize: 8 },
  footerR: { color: DIM, fontSize: 8, fontFamily: "Helvetica-Bold" },
});

export function ReporteInventarioPDF({ negocio, filas, periodoLabel, periodoRango, totalSalidas, totalEntradas, agotados }) {
  var R = React.createElement;
  var nombre = txt(negocio && negocio.nombre ? negocio.nombre : "Mi negocio", 55);
  var hayFilas = Array.isArray(filas) && filas.length > 0;
  var nAgt = agotados || 0;
  var subPeriodo = periodoRango ? txt(periodoRango, 60) : txt(periodoLabel, 40);

  // Historial: aplanar todos los movimientos con nombre de producto
  var historial = [];
  if (hayFilas) {
    filas.forEach(function(f) {
      (f.movimientos || []).forEach(function(mv) {
        historial.push({ fecha: mv.fecha, producto: f.nombre, nota: mv.nota || "", cantAntes: mv.cantAntes, cantDespues: mv.cantDespues, tipo: mv.tipo });
      });
    });
    historial.sort(function(a, b) { return a.fecha < b.fecha ? -1 : 1; });
  }

  return R(Document, { title: "Inventario " + txt(periodoLabel, 30) },
    R(Page, { size: "A4", style: S.pag },

      // ── Header ────────────────────────────────────────────────────────────────
      R(View, { style: S.header },
        R(View, { style: S.brandRow },
          R(View, { style: S.brandBox }, R(Text, { style: S.brandC }, "C")),
          R(Text, { style: S.brandName }, "LEO"),
          R(Text, { style: S.brandTag }, "INVENTARIO")
        ),
        R(Text, { style: S.negocio }, nombre),
        R(Text, { style: S.periodo }, txt(periodoLabel, 40) + (subPeriodo && subPeriodo !== txt(periodoLabel, 40) ? "  /  " + subPeriodo : ""))
      ),

      // ── Resumen ────────────────────────────────────────────────────────────────
      R(View, { style: S.statsRow },
        R(View, { style: S.statBox },
          R(Text, { style: S.statLabel }, "SALIDAS"),
          R(Text, { style: (totalSalidas || 0) > 0 ? S.statNumR : S.statNum }, String(totalSalidas || 0)),
          R(Text, { style: S.statSub }, (totalSalidas || 0) === 1 ? "unidad vendida/entregada" : "unidades vendidas/entregadas")
        ),
        R(View, { style: Object.assign({}, S.statBox, S.statMid) },
          R(Text, { style: S.statLabel }, "ENTRADAS"),
          R(Text, { style: (totalEntradas || 0) > 0 ? S.statNumV : S.statNum }, String(totalEntradas || 0)),
          R(Text, { style: S.statSub }, (totalEntradas || 0) === 1 ? "unidad añadida" : "unidades añadidas")
        ),
        R(View, { style: S.statBox },
          R(Text, { style: S.statLabel }, "AGOTADOS AHORA"),
          R(Text, { style: nAgt > 0 ? S.statNumR : S.statNum }, String(nAgt)),
          R(Text, { style: S.statSub }, nAgt === 1 ? "producto sin stock" : "productos sin stock")
        )
      ),

      // ── Tabla resumen por producto ─────────────────────────────────────────────
      R(View, { style: S.secRow },
        R(Text, { style: S.secTxt }, "Resumen por producto"),
        R(View, { style: S.secLinea })
      ),

      hayFilas
        ? R(View, null,
            R(View, { style: S.thead },
              R(Text, { style: S.thProd }, "PRODUCTO"),
              R(Text, { style: S.thNum }, "ENTRADAS"),
              R(Text, { style: S.thNum }, "SALIDAS"),
              R(Text, { style: S.thAct }, "STOCK ACTUAL")
            ),
            filas.map(function(f, i) {
              var bg = i % 2 === 1 ? FONDO : "#ffffff";
              var actStyle = f.stockActual === 0 ? S.filaNumRed : (f.stockMinimo != null && f.stockActual <= f.stockMinimo) ? S.filaNumA : S.filaNum;
              return R(View, { key: String(f.id || i), style: Object.assign({}, S.fila, { backgroundColor: bg }) },
                R(Text, { style: S.filaNombre }, txt(f.nombre, 40)),
                R(Text, { style: f.entradas > 0 ? S.filaNumV : Object.assign({}, S.filaNum, { width: COL_ENT }) }, f.entradas > 0 ? "+" + f.entradas : "—"),
                R(Text, { style: f.salidas > 0 ? S.filaNumR : Object.assign({}, S.filaNum, { width: COL_SAL }) }, f.salidas > 0 ? "-" + f.salidas : "—"),
                R(Text, { style: actStyle }, String(f.stockActual || 0))
              );
            }),
            R(View, { style: S.totalFila },
              R(Text, { style: S.totalLabel }, "Total"),
              R(Text, { style: S.totalNum }, (totalEntradas || 0) > 0 ? "+" + totalEntradas : "—"),
              R(Text, { style: S.totalNum }, (totalSalidas || 0) > 0 ? "-" + totalSalidas : "—"),
              R(Text, { style: S.totalAct }, "")
            )
          )
        : R(Text, { style: S.vacio }, "Sin movimientos en este periodo."),

      // ── Historial de movimientos ───────────────────────────────────────────────
      historial.length > 0 && R(View, { style: S.histSec },
        R(View, { style: S.secRow },
          R(Text, { style: S.secTxt }, "Historial del periodo"),
          R(View, { style: S.secLinea })
        ),
        R(View, { style: S.histThead },
          R(Text, { style: S.hthFecha }, "FECHA"),
          R(Text, { style: S.hthProd }, "PRODUCTO"),
          R(Text, { style: S.hthMov }, "MOVIMIENTO"),
          R(Text, { style: S.hthDelta }, "CAMBIO")
        ),
        historial.map(function(mv, i) {
          var bg = i % 2 === 1 ? FONDO : "#ffffff";
          var delta = diffStr(mv.cantAntes, mv.cantDespues, mv.tipo);
          var esEntrada = delta.charAt(0) === "+";
          var esSalida = delta.charAt(0) === "-";
          var notaDisp = mv.nota ? txt(mv.nota, 55) : (mv.cantAntes != null && mv.cantDespues != null ? "De " + mv.cantAntes + " a " + mv.cantDespues : "");
          return R(View, { key: String(i), style: Object.assign({}, S.hFila, { backgroundColor: bg }) },
            R(Text, { style: S.hFecha }, fechaCorta(mv.fecha)),
            R(Text, { style: S.hProd }, txt(mv.producto, 22)),
            R(Text, { style: S.hNota }, notaDisp),
            R(Text, { style: esEntrada ? S.hDeltaV : esSalida ? S.hDeltaR : S.hDelta }, delta)
          );
        })
      ),

      // ── Footer ─────────────────────────────────────────────────────────────────
      R(View, { style: S.footerRow },
        R(Text, { style: S.footerL }, "Generado el " + generadoAhora()),
        R(Text, { style: S.footerR }, "CLEO")
      )
    )
  );
}

export async function crearReporteInventarioPDF(props) {
  var blob = await pdf(React.createElement(ReporteInventarioPDF, props)).toBlob();
  var periodo = String(props.periodoLabel || "inventario").toLowerCase().replace(/\s+/g, "-");
  return {
    blob: blob,
    nombreArchivo: "inventario-" + periodo + ".pdf",
    titulo: "Inventario — " + (props.periodoLabel || "")
  };
}
