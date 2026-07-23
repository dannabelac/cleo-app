import { useState, useMemo, useEffect } from "react";
import React from "react";

const ETAPAS = ["Nuevo contacto","Cotizacion enviada","Negociacion","Ganado","Perdido"];
const ORIGENES = ["Instagram","Facebook","WhatsApp","Referido","TikTok","Otro"];
const CANALES = ["WhatsApp","Instagram","Facebook"];
const MOTIVOS = ["Precio alto","Eligio a otro","Sin presupuesto","No respondio","Otro"];
const FECHA_HOY = (function(){
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth()+1).padStart(2,"0");
  var dd = String(d.getDate()).padStart(2,"0");
  return y+"-"+m+"-"+dd;
})();

const C = {
  // Acento principal , azul eléctrico
  purple:"#4B5EFC", purpleLight:"#7B8AFC", purplePale:"rgba(75,94,252,0.08)",

  // Fondos
  bg:"#F8FAFC",          // fondo principal neutro
  surface:"#FFFFFF",     // cards blanco puro
  surfaceUp:"#F8F9FC",   // fondo sutil
  border:"#E5E7EB",      // borde suave
  borderStrong:"#D1D5DB",// borde prominente

  // Texto
  text:"#0F1117",
  textMuted:"#6B7280",
  textDim:"#9CA3AF",

  // Semánticos
  green:"#10B981", greenBg:"#ECFDF5", greenBorder:"#6EE7B7",
  red:"#EF4444",   redBg:"#FEF2F2",   redBorder:"#FCA5A5",
  amber:"#F59E0B", amberBg:"#FFFBEB", amberBorder:"#FCD34D",
  urgent:"#EF4444",urgentBg:"#FEF2F2",urgentBorder:"#FCA5A5",

  // Sidebar oscuro
  dark:"#0B1020", darkCard:"#11182F", darkCard2:"#11182F",
  darkBorder:"rgba(255,255,255,0.06)",
};

const ETAPA_COLOR = {
  "Nuevo contacto":"#3B7FC4",
  "Cotizacion enviada":"#F59E0B",
  "Negociacion":"#8B6914",
  "Ganado":"#1A7A5E",
  "Perdido":"#9B3535",
};

const CONSEJOS = {
  "Precio alto":"Cuando alguien dice que esta caro, casi siempre significa que no vio suficiente valor, no que no tenga dinero. La proxima vez, antes de dar el precio, explica que problema resuelves y que incluye. El precio es lo ultimo, no lo primero.",
  "Eligio a otro":"Perder con un competidor no significa que el otro sea mejor, muchas veces significa que comunico mejor lo que ofrece. Preguntale al cliente que fue lo que le gusto del otro. Esa respuesta vale mas que cualquier curso de ventas.",
  "Sin presupuesto":"Sin presupuesto hoy no significa nunca. Los negocios cambian, los proyectos se reactivan. Programa un mensaje para dentro de 6 semanas, un simple hola puede llegar justo cuando ya tenga el dinero.",
  "No respondio":"Cuando alguien deja de responder, casi nunca es porque decidio que no. Es porque algo no quedo claro y no supo como preguntarlo. Un mensaje como 'Hola, tienes alguna duda sobre lo que te mande?' puede reactivar toda la conversacion.",
  "Otro":"Registrar por que no cerraste es uno de los habitos mas valiosos que puedes tener. No para castigarte, sino para ver patrones. Si pierdes tres veces por el mismo motivo, ya sabes exactamente que mejorar.",
};

const HOY = new Date();
const avatarColors = [C.purple,"#1D9E75","#D85A30","#185FA5","#BA7517","#993556"];

function iniciales(n){ return n.split(" ").slice(0,2).map(function(x){return x[0];}).join("").toUpperCase(); }
function diasDesde(f){ return Math.floor((HOY-parseFechaLocal(f))/86400000); }
var DIAS_SEMANA_ES=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
function nombreDiaSemana(fechaStr){
  if(!fechaStr) return "";
  var d=new Date(fechaStr+"T00:00:00");
  var hoyStr=FECHA_HOY;
  var manana=new Date(); manana.setDate(manana.getDate()+1);
  var mananaStr=fmtFechaLocal(manana);
  if(fechaStr===hoyStr) return "hoy";
  if(fechaStr===mananaStr) return "mañana";
  return DIAS_SEMANA_ES[d.getDay()];
}
function fraseDia(fechaStr){
  var n=nombreDiaSemana(fechaStr);
  if(n==="hoy") return "Hoy";
  if(n==="mañana") return "Mañana";
  return "El "+n;
}
function diasSinContacto(c){ var ref=c.ultimoContacto&&c.ultimoContacto!==""?c.ultimoContacto:c.fecha; return Math.max(0,Math.floor((HOY-new Date(ref))/86400000)); }

// Cuenta cuántos pendientes hay realmente en la vista "Hoy", usando el MISMO
// criterio que esa vista (P1-P7 para servicios, oportunidades+pedidos para productos).
// Se usa para el badge de la barra de navegación, para que nunca se desincronice
// del contenido real de la pestaña.
function contarPendientesHoy(clientes,cotizaciones,pedidos,esProductos){
  if(esProductos){
    var opsRetomarN=clientes.filter(function(c){
      if(!c.estadoProspecto||c.estadoProspecto==="Convertido"||c.estadoProspecto==="Perdido") return false;
      if(c.seguimientoFecha&&c.seguimientoFecha<=FECHA_HOY) return true;
      var dias=diasDesde(c.fechaEtapa||c.fecha);
      if(c.estadoProspecto==="Nueva") return dias>=3;
      if(c.estadoProspecto==="En seguimiento") return dias>=4;
      return false;
    }).length;
    var pedidosAccionN=0;
    (pedidos||[]).forEach(function(ped){
      var estadoNorm=ped.estadoPedido==="pendiente"?"preparando":ped.estadoPedido;
      if(estadoNorm==="cancelado") return;
      var pagado=(ped.pagos||[]).reduce(function(s,p){ return s+Number(p.monto); },0);
      var saldo=Math.max(0,Number(ped.total||0)-pagado);
      if(saldo>0&&ped.total>0&&estadoNorm==="preparando") pedidosAccionN++;
      if(estadoNorm==="entregado"&&saldo>0&&ped.total>0) pedidosAccionN++;
    });
    return opsRetomarN+pedidosAccionN;
  }
  var hoyN=new Date();
  var idsVistoN={};
  var countN=0;
  function marcar(c){
    if(idsVistoN[c.id]) return;
    idsVistoN[c.id]=true;
    if((diasSinContacto(c)>=1||c.seguimientoFecha)&&!c.archivado) countN++;
  }
  clientes.filter(function(c){ return c.seguimientoFecha&&new Date(c.seguimientoFecha)<=hoyN; }).forEach(marcar);
  clientes.filter(function(c){ return c.etapa==="Negociacion"&&!c.seguimientoFecha&&diasSinContacto(c)>=2; }).forEach(marcar);
  clientes.filter(function(c){
    if(c.etapa!=="Cotizacion enviada"||c.seguimientoFecha) return false;
    var cotPend=cotizaciones.filter(function(cot){ return cot.clienteId===c.id&&cot.estatus==="Pendiente"; }).sort(function(a,b){ return new Date(b.fecha)-new Date(a.fecha); })[0];
    var diasCot=cotPend?diasDesde(cotPend.fecha):0;
    var d=diasSinContacto(c);
    return d>=3||diasCot>=3;
  }).forEach(marcar);
  clientes.filter(function(c){ return c.etapa==="Nuevo contacto"&&!c.seguimientoFecha&&diasSinContacto(c)>=2; }).forEach(marcar);
  clientes.filter(function(c){
    if(c.etapa!=="Ganado") return false;
    if(c.seguimientoFecha) return false;
    var diasGanado=Math.floor((HOY-parseFechaLocal(c.fechaEtapa||c.fecha))/86400000);
    return diasGanado>=45;
  }).forEach(marcar);
  clientes.filter(function(c){
    if(c.etapa!=="Perdido") return false;
    if(c.seguimientoFecha) return false;
    var diasPerdido=Math.floor((HOY-parseFechaLocal(c.fechaEtapa||c.fecha))/86400000);
    return diasPerdido>=60;
  }).forEach(marcar);
  return countN;
}

// Devuelve la lista real de clientes a contactar hoy (mismo criterio que la pestaña Hoy),
// para usarse tanto en el widget de Inicio como en Hoy y que nunca se desincronicen.
function obtenerAccionesHoy(clientes,cotizaciones,esProductos,limite){
  if(esProductos){
    var listaP=clientes.filter(function(c){
      if(!c.estadoProspecto||c.estadoProspecto==="Convertido"||c.estadoProspecto==="Perdido") return false;
      if(c.seguimientoFecha&&c.seguimientoFecha<=FECHA_HOY) return true;
      var dias=diasDesde(c.fechaEtapa||c.fecha);
      if(c.estadoProspecto==="Nueva") return dias>=3;
      if(c.estadoProspecto==="En seguimiento") return dias>=4;
      return false;
    }).map(function(c){
      var dias=diasDesde(c.fechaEtapa||c.fecha);
      return {cliente:c,dias:dias,tipo:c.estadoProspecto,prioridad:dias>=10?"alta":dias>=5?"media":"baja",desc:c.estadoProspecto==="Nueva"?"Sin retomar hace "+dias+" días":"En seguimiento hace "+dias+" días"};
    });
    listaP.sort(function(a,b){ return b.dias-a.dias; });
    return limite?listaP.slice(0,limite):listaP;
  }
  var hoyN=new Date();
  var idsVistoA={};
  var lista=[];
  function cotPendienteDe(clienteId){
    return cotizaciones.filter(function(cot){ return cot.clienteId===clienteId&&cot.estatus==="Pendiente"; }).sort(function(a,b){ return new Date(b.fecha)-new Date(a.fecha); })[0];
  }
  function cotAceptadaDe(clienteId){
    return cotizaciones.filter(function(cot){ return cot.clienteId===clienteId&&cot.estatus==="Aceptada"; }).sort(function(a,b){ return new Date(b.fecha)-new Date(a.fecha); })[0];
  }
  function agregar(c,tipo,desc,prioridad,ordenReal,monto){
    if(idsVistoA[c.id]) return;
    var dias=diasSinContacto(c);
    if(!((dias>=1||c.seguimientoFecha)&&!c.archivado)) return;
    idsVistoA[c.id]=true;
    lista.push({cliente:c,tipo:tipo,desc:desc,prioridad:prioridad,dias:dias,ordenReal:ordenReal,monto:monto||0});
  }

  // NIVEL 1 , seguimiento agendado vencido (cualquier etapa)
  clientes.filter(function(c){ return c.seguimientoFecha&&new Date(c.seguimientoFecha)<=hoyN; }).forEach(function(c){
    var cotP=cotPendienteDe(c.id);
    var servicio=cotP?cotP.concepto:(c.servicioInteres||c.notas||"");
    var desc1;
    if(cotP) desc1="Le enviaste el precio de "+servicio+". Hoy habías programado preguntarle si pudo revisarlo.";
    else if(servicio) desc1="Preguntó por "+servicio+" y todavía no ha recibido el precio. Hoy habías quedado en enviárselo.";
    else desc1="Hoy habías programado retomar esta conversación.";
    agregar(c,"Seguimiento programado",desc1,"alta",1,cotP?Number(cotP.monto):0);
  });

  // NIVEL 2 , en negociación (absorbe lo que antes era "en seguimiento")
  clientes.filter(function(c){ return c.etapa==="Negociacion"&&!c.seguimientoFecha&&diasSinContacto(c)>=2; }).forEach(function(c){
    var cotP=cotPendienteDe(c.id);
    var servicio=cotP?cotP.concepto:(c.servicioInteres||c.notas||"tu servicio");
    var desc2=cotP
      ?"Está considerando la propuesta de "+servicio+" por $"+Number(cotP.monto).toLocaleString()+". Pregúntale qué le impide avanzar antes de modificar el precio."
      :"Está considerando la propuesta de "+servicio+". Antes de ofrecer un descuento, conviene preguntarle qué le preocupa.";
    agregar(c,"Negociacion",desc2,"alta",2,cotP?Number(cotP.monto):0);
  });

  // NIVEL 3 , propuesta próxima a vencer (solo si existe el dato de vigencia)
  clientes.forEach(function(c){
    if(c.seguimientoFecha) return;
    var cotP=cotPendienteDe(c.id);
    if(!cotP||!cotP.vigencia) return;
    var vig=new Date(cotP.vigencia+"T00:00:00");
    var hoyD=new Date(FECHA_HOY+"T00:00:00");
    var diffDias=Math.round((vig-hoyD)/86400000);
    if(diffDias!==0&&diffDias!==1) return;
    var cuando=diffDias===0?"hoy":"mañana";
    agregar(c,"Vigencia","La propuesta de "+cotP.concepto+" vence "+cuando+". Conviene preguntarle si necesita aclarar algo.","alta",3,Number(cotP.monto));
  });

  // NIVEL 4 , cotización enviada sin respuesta
  clientes.filter(function(c){
    if(c.etapa!=="Cotizacion enviada"||c.seguimientoFecha) return false;
    var cotPend=cotPendienteDe(c.id);
    var diasCot=cotPend?diasDesde(cotPend.fecha):0;
    var d=diasSinContacto(c);
    return d>=3||diasCot>=3;
  }).forEach(function(c){
    var d=diasSinContacto(c);
    var cotP=cotPendienteDe(c.id);
    var servicio=cotP?cotP.concepto:(c.servicioInteres||c.notas||"tu servicio");
    var desc4=cotP
      ?"Le enviaste una propuesta de "+servicio+" por $"+Number(cotP.monto).toLocaleString()+" hace "+d+" días. Conviene preguntarle si pudo revisarla."
      :"Le enviaste la propuesta de "+servicio+" hace "+d+" días. Conviene preguntarle si pudo revisarla o tiene alguna duda.";
    agregar(c,"Seguimiento",desc4,d>=8?"alta":"media",4,cotP?Number(cotP.monto):0);
  });

  // NIVEL 5 , nuevo contacto esperando precio o respuesta
  clientes.filter(function(c){ return c.etapa==="Nuevo contacto"&&!c.seguimientoFecha&&diasSinContacto(c)>=2; }).forEach(function(c){
    var d=diasSinContacto(c);
    var servicio=c.servicioInteres||c.notas||"";
    var desc5=servicio
      ?"Preguntó por "+servicio+" hace "+d+" días y todavía no ha recibido el precio. Conviene responderle antes de que pierda el interés."
      :"Esta conversación lleva "+d+" días sin un siguiente paso.";
    agregar(c,"Nuevo contacto",desc5,"baja",5);
  });

  // NIVEL 6 , cliente ganado (satisfacción o referido)
  clientes.filter(function(c){
    if(c.etapa!=="Ganado") return false;
    if(c.seguimientoFecha) return false;
    var diasGanado=Math.floor((HOY-parseFechaLocal(c.fechaEtapa||c.fecha))/86400000);
    return diasGanado>=45;
  }).forEach(function(c){
    var diasGanado=Math.floor((HOY-parseFechaLocal(c.fechaEtapa||c.fecha))/86400000);
    var cotA=cotAceptadaDe(c.id);
    var servicio=(cotA?cotA.concepto:(c.servicioInteres||c.notas))||"tu servicio";
    var desc6;
    if(diasGanado<60) desc6="Te compró "+servicio+" hace más de 45 días. Buen momento para preguntarle cómo le fue.";
    else{ var meses=Math.floor(diasGanado/30); desc6="Te compró "+servicio+" hace "+meses+" meses. Si quedó satisfecho, puede ser buen momento para pedirle una recomendación."; }
    agregar(c,"Ganado",desc6,"baja",6,cotA?Number(cotA.monto):0);
  });

  // NIVEL 7 , cliente perdido (recuperación)
  clientes.filter(function(c){
    if(c.etapa!=="Perdido") return false;
    if(c.seguimientoFecha) return false;
    var diasPerdido=Math.floor((HOY-parseFechaLocal(c.fechaEtapa||c.fecha))/86400000);
    return diasPerdido>=60;
  }).forEach(function(c){
    var diasPerdido=Math.floor((HOY-parseFechaLocal(c.fechaEtapa||c.fecha))/86400000);
    var meses=Math.floor(diasPerdido/30);
    var servicio=c.servicioInteres||c.notas||"tu servicio";
    var desc7=c.motivoPerdida
      ?"La conversación sobre "+servicio+" se detuvo por "+c.motivoPerdida+" hace "+meses+" meses. El momento puede haber cambiado; un mensaje breve puede reabrirla."
      :"Han pasado "+meses+" meses desde la conversación sobre "+servicio+". Un mensaje sin presión puede reabrir la puerta.";
    agregar(c,"Perdido",desc7,"baja",7);
  });

  // Orden: por nivel, luego por monto involucrado (mayor primero), luego por días sin contacto
  lista.sort(function(a,b){
    if(a.ordenReal!==b.ordenReal) return a.ordenReal-b.ordenReal;
    if(b.monto!==a.monto) return b.monto-a.monto;
    return b.dias-a.dias;
  });
  return limite?lista.slice(0,limite):lista;
}

// Cotizaciones aceptadas con saldo pendiente (ya vendiste, falta cobrar), ordenadas
// por cuántos días llevan sin cobrarse completo (más antiguo = más urgente).
function obtenerCobrosPendientesHoy(cotizaciones,ventas,clientes,limite,ignorarGracia){
  function pasaGraciaYSaldo(pagos,monto){
    var pagado=(pagos||[]).reduce(function(s,p){ return s+Number(p.monto); },0);
    if(pagado>=Number(monto)) return false;
    // Si ya registró algún pago, se le da un respiro de 3 días desde el último pago
    // antes de volver a insistir , acaba de hacer algo, no hace falta presionarlo el mismo día.
    // (se puede omitir con ignorarGracia, para vistas que quieren ver todo sin excepción)
    if(!ignorarGracia&&pagos&&pagos.length>0){
      var ultimoPago=pagos.slice().sort(function(a,b){ return new Date(b.fecha)-new Date(a.fecha); })[0];
      if(diasDesde(ultimoPago.fecha)<3) return false;
    }
    return true;
  }
  var deCot=cotizaciones.filter(function(c){ return c.estatus==="Aceptada"&&pasaGraciaYSaldo(c.pagos,c.monto); }).map(function(c){
    var cl=clientes.find(function(x){ return x.id===c.clienteId; });
    var pagado=(c.pagos||[]).reduce(function(s,p){ return s+Number(p.monto); },0);
    return {cliente:cl,cot:c,tipo:"cotizacion",saldo:Number(c.monto)-pagado,dias:diasDesde(c.fecha)};
  });
  var deVentas=(ventas||[]).filter(function(v){ return v.clienteId&&v.tipoPago==="anticipo"&&pasaGraciaYSaldo(v.pagos,v.monto); }).map(function(v){
    var cl=clientes.find(function(x){ return x.id===v.clienteId; });
    var pagado=(v.pagos||[]).reduce(function(s,p){ return s+Number(p.monto); },0);
    return {cliente:cl,cot:v,tipo:"venta",saldo:Number(v.monto)-pagado,dias:diasDesde(v.fecha)};
  });
  var lista=deCot.concat(deVentas).filter(function(x){ return x.cliente; }).sort(function(a,b){ return b.dias-a.dias; });
  return limite?lista.slice(0,limite):lista;
}

function avatarColor(id){ return avatarColors[id%avatarColors.length]; }
function canalColor(c){ return c==="WhatsApp"?C.green:c==="Instagram"?"#D85A30":(c==="Messenger"||c==="Facebook")?"#185FA5":C.purple; }
function parseFechaLocal(f){
  // "2026-07-21" se interpreta como medianoche UTC por defecto, lo cual puede
  // correr la fecha un día hacia atrás en zonas horarias negativas (ej. México).
  // Aquí la forzamos a interpretarse como fecha LOCAL, no UTC.
  if(typeof f==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(f)){
    var partes=f.split("-");
    return new Date(Number(partes[0]),Number(partes[1])-1,Number(partes[2]));
  }
  return new Date(f);
}
function fmtFechaLocal(d){
  // Igual que parseFechaLocal pero al revés: convierte un objeto Date a "YYYY-MM-DD"
  // usando sus componentes LOCALES, en vez de .toISOString() que usa UTC y puede
  // correr la fecha en zonas horarias negativas (ej. México).
  var y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),dd=String(d.getDate()).padStart(2,"0");
  return y+"-"+m+"-"+dd;
}
function enPeriodo(f,p){
  var d=parseFechaLocal(f);
  if(p==="todo") return true;
  if(p==="hoy"){var h=new Date(HOY);h.setHours(0,0,0,0);var df=parseFechaLocal(f);df.setHours(0,0,0,0);return df.getTime()===h.getTime();}
  if(p==="semana"){var x=new Date(HOY);x.setDate(x.getDate()-7);return d>=x;}
  if(p==="mes") return d.getMonth()===HOY.getMonth()&&d.getFullYear()===HOY.getFullYear();
  if(p==="trimestre"){var y=new Date(HOY);y.setMonth(y.getMonth()-3);return d>=y;}
  return true;
}
// Mismo criterio que usa Ingresos: cada pago cuenta en el periodo en que realmente entró,
// no en el periodo en que se cerró la cotización o venta que lo originó.
function totalPagadoCotizacionesPeriodo(cotizaciones,periodo){
  var total=0;
  cotizaciones.filter(function(c){ return c.estatus==="Aceptada"; }).forEach(function(c){
    (c.pagos||[]).forEach(function(p){
      if(enPeriodo(p.fecha||c.fecha,periodo)) total+=Number(p.monto);
    });
  });
  return total;
}
function totalPagadoVentasPeriodo(ventas,periodo){
  var total=0;
  ventas.forEach(function(v){
    if(v.pagos&&v.pagos.length>0){
      v.pagos.forEach(function(p){
        if(enPeriodo(p.fecha||v.fecha,periodo)) total+=Number(p.monto);
      });
    } else if(v.tipoPago!=="anticipo"){
      if(enPeriodo(v.fecha,periodo)) total+=Number(v.monto);
    }
  });
  return total;
}
function contactUrl(c,msg){
  var canal=c.canalPrincipal||"WhatsApp";
  if(canal==="WhatsApp"&&c.contacto) return "https://wa.me/52"+c.contacto+"?text="+encodeURIComponent(msg);
  if(canal==="Instagram"&&c.instagram) return "https://instagram.com/"+c.instagram.replace("@","");
  if(canal==="Messenger"||canal==="Facebook"){
    var fb=c.messenger||c.facebook||"";
    if(fb) return "https://facebook.com/"+fb.replace("@","");
    return null;
  }
  if(canal==="Email"&&c.email) return "mailto:"+c.email;
  return null;
}
function contactLabel(c){
  var canal=c.canalPrincipal||"WhatsApp";
  if(canal==="WhatsApp") return "Contactar";
  if(canal==="Instagram") return "Ver perfil";
  if(canal==="Facebook"||canal==="Messenger"){
    var fb=c.messenger||c.facebook||"";
    return fb?"Abrir Facebook":"Copiar nombre";
  }
  if(canal==="Email") return "Enviar email";
  return "Contactar";
}
function contactFallbackCopy(c){
  var canal=c.canalPrincipal||"WhatsApp";
  if((canal==="Facebook"||canal==="Messenger")&&!(c.messenger||c.facebook)){
    var val=c.messenger||c.nombre||"";
    try{ navigator.clipboard.writeText(val); }catch(e){}
    return true;
  }
  return false;
}
function msgEtapa(c,concepto){
  var nombre=c.nombre?c.nombre.split(" ")[0]:"";
  if(c.etapa==="Negociacion") return "Hola "+nombre+", quería retomar nuestra plática. ¿Qué es lo que más te preocupa del proyecto?";
  if(c.etapa==="Cotizacion enviada") return "Hola "+nombre+", te escribo por la cotización que te mandé"+(concepto?" de "+concepto:"")+". ¿La pudiste revisar?";
  if(c.etapa==="Perdido") return "Hola "+nombre+", hace tiempo que no hablamos. ¿Cómo va todo?";
  if(c.etapa==="Ganado") return "Hola "+nombre+", ¿cómo has estado? Si en algún momento necesitas algo, no dudes en escribirme.";
  if(c.etapa==="Nuevo contacto") return "Hola "+nombre+", vi que te interesa lo que ofrezco. ¿Tienes unos minutos para platicar?";
  return "Hola "+nombre+", ¿cómo estás? Quería ponerme en contacto contigo.";
}
function loadLS(k,d){ return d; }
function saveLS(k,v){}

function SvgWA(p){ var z=p.size||14; return React.createElement("svg",{width:z,height:z,viewBox:"0 0 24 24",fill:"none"},React.createElement("path",{d:"M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.96 9.96 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z",fill:"#3A9E7E"}),React.createElement("path",{d:"M8.5 8.5c.2-.5.7-.8 1.2-.8.3 0 .5.1.7.2l.8 1.8c.1.3 0 .6-.2.8l-.5.5c.5 1 1.4 1.9 2.5 2.5l.5-.5c.2-.2.5-.3.8-.2l1.8.8c.3.1.4.5.3.8-.5 1.2-1.8 2-3.1 1.6C11.1 15.5 8.5 13 8.5 9.7c0-.4.1-.8.2-1.2z",fill:"#fff"})); }
function SvgIG(p){ var z=p.size||14; return React.createElement("svg",{width:z,height:z,viewBox:"0 0 24 24",fill:"none"},React.createElement("defs",null,React.createElement("linearGradient",{id:"ig"+z,x1:"2",y1:"22",x2:"22",y2:"2",gradientUnits:"userSpaceOnUse"},React.createElement("stop",{stopColor:"#F58529"}),React.createElement("stop",{offset:"0.5",stopColor:"#DD2A7B"}),React.createElement("stop",{offset:"1",stopColor:"#8134AF"}))),React.createElement("rect",{x:"2",y:"2",width:"20",height:"20",rx:"5",fill:"url(#ig"+z+")"}),React.createElement("circle",{cx:"12",cy:"12",r:"4",stroke:"#fff",strokeWidth:"2"}),React.createElement("circle",{cx:"17",cy:"7",r:"1",fill:"#fff"})); }
function SvgFB(p){ var z=p.size||14; return React.createElement("svg",{width:z,height:z,viewBox:"0 0 24 24",fill:"none"},React.createElement("circle",{cx:"12",cy:"12",r:"10",fill:"#185FA5"}),React.createElement("path",{d:"M13.5 8H15V6h-1.5C12.1 6 11 7.1 11 8.5V10H9.5v2H11v6h2v-6h1.5l.5-2H13V8.5c0-.3.2-.5.5-.5z",fill:"#fff"})); }
function SvgEM(p){ var z=p.size||14; return React.createElement("svg",{width:z,height:z,viewBox:"0 0 24 24",fill:"none"},React.createElement("rect",{x:"2",y:"4",width:"20",height:"16",rx:"3",fill:C.purple}),React.createElement("path",{d:"M2 7l10 7 10-7",stroke:"#fff",strokeWidth:"1.5",strokeLinecap:"round"})); }
function SvgIcon(p){ var c=p.canal,z=p.size||14; if(c==="WhatsApp") return React.createElement(SvgWA,{size:z}); if(c==="Instagram") return React.createElement(SvgIG,{size:z}); if(c==="Messenger"||c==="Facebook") return React.createElement(SvgFB,{size:z}); return React.createElement(SvgEM,{size:z}); }

// ── RICH EDITOR , negrita, cursiva, listas ──────────────────────────────────
function RichEditor(props){
  var value=props.value||""; var onChange=props.onChange; var placeholder=props.placeholder||""; var minHeight=props.minHeight||80;
  var ref=React.useRef(null);
  React.useEffect(function(){
    if(ref.current) ref.current.innerHTML=value;
  },[]);

  function getSelection(){ return window.getSelection(); }

  function wrapSelection(tagOpen,tagClose){
    ref.current.focus();
    var sel=getSelection();
    if(!sel||sel.rangeCount===0) return;
    var range=sel.getRangeAt(0);
    var selected=range.toString();
    if(!selected){ document.execCommand("bold",false,null); onChange(ref.current.innerHTML); return; }
    range.deleteContents();
    var frag=document.createDocumentFragment();
    var el=document.createElement(tagOpen==="b"?"strong":"em");
    el.textContent=selected;
    frag.appendChild(el);
    range.insertNode(frag);
    onChange(ref.current.innerHTML);
  }

  function applyList(ordered){
    ref.current.focus();
    var sel=getSelection();
    if(!sel||sel.rangeCount===0) return;
    var range=sel.getRangeAt(0);
    var selected=range.toString().trim();

    // Check if already inside a list , toggle off
    var node=sel.anchorNode;
    while(node&&node!==ref.current){
      if(node.nodeName==="UL"||node.nodeName==="OL"){
        var lines=[];
        node.querySelectorAll("li").forEach(function(li){ lines.push(li.textContent); });
        var p=document.createElement("p");
        p.innerHTML=lines.join("<br>");
        node.parentNode.replaceChild(p,node);
        onChange(ref.current.innerHTML);
        return;
      }
      node=node.parentNode;
    }

    var list=document.createElement(ordered?"ol":"ul");
    list.style.paddingLeft="20px";
    list.style.margin="4px 0";

    if(selected){
      // Convert only the selected text to list items
      var lines=selected.split("\n").filter(function(l){ return l.trim(); });
      if(!lines.length) lines=[selected];
      lines.forEach(function(line){
        var li=document.createElement("li");
        li.textContent=line;
        list.appendChild(li);
      });
      range.deleteContents();
      range.insertNode(list);
    } else {
      // No selection , convert entire content, replacing it
      var allText=ref.current.innerText.trim();
      var lines=allText.split("\n").filter(function(l){ return l.trim(); });
      if(!lines.length) lines=[""];
      lines.forEach(function(line){
        var li=document.createElement("li");
        li.textContent=line;
        list.appendChild(li);
      });
      ref.current.innerHTML="";
      ref.current.appendChild(list);
    }
    onChange(ref.current.innerHTML);
  }

  function clearFormat(){
    ref.current.focus();
    var text=ref.current.innerText;
    ref.current.innerHTML=text.split("\n").filter(function(l){ return l.trim(); }).map(function(l){ return "<p>"+l+"</p>"; }).join("");
    onChange(ref.current.innerHTML);
  }

  var btnStyle={cursor:"pointer",padding:"4px 9px",borderRadius:6,border:"1px solid #E2E8F0",background:"#fff",fontSize:12,color:"#475569",fontWeight:500,lineHeight:1.4,flexShrink:0};
  var showPlaceholder=!value||value==="<br>"||value===""||value==="<p></p>";
  var editorId=React.useRef("re-"+(Math.random().toString(36).slice(2)));

  return React.createElement("div",{style:{border:"1px solid #CBD5E1",borderRadius:10,overflow:"hidden",background:"#fff",position:"relative"}},
    React.createElement("style",null,
      "#"+editorId.current+" ul{list-style-type:disc;padding-left:20px;margin:4px 0;}"+
      "#"+editorId.current+" ol{list-style-type:decimal;padding-left:20px;margin:4px 0;}"+
      "#"+editorId.current+" li{margin:2px 0;}"
    ),
    React.createElement("div",{style:{display:"flex",gap:4,padding:"6px 10px",borderBottom:"1px solid #E2E8F0",background:"#F8FAFC",flexWrap:"wrap",alignItems:"center"}},
      React.createElement("button",{style:Object.assign({},btnStyle,{fontWeight:700}),onMouseDown:function(ev){ ev.preventDefault(); document.execCommand("bold",false,null); onChange(ref.current.innerHTML); },title:"Negrita"},"B"),
      React.createElement("button",{style:Object.assign({},btnStyle,{fontStyle:"italic"}),onMouseDown:function(ev){ ev.preventDefault(); document.execCommand("italic",false,null); onChange(ref.current.innerHTML); },title:"Cursiva"},"I"),
      React.createElement("div",{style:{width:1,height:16,background:"#E2E8F0",margin:"0 2px"}}),
      React.createElement("button",{style:btnStyle,onMouseDown:function(ev){ ev.preventDefault(); applyList(false); },title:"Lista con viñetas"},"• Lista"),
      React.createElement("button",{style:btnStyle,onMouseDown:function(ev){ ev.preventDefault(); applyList(true); },title:"Lista numerada"},"1. Lista"),
      React.createElement("div",{style:{width:1,height:16,background:"#E2E8F0",margin:"0 2px"}}),
      React.createElement("button",{style:Object.assign({},btnStyle,{color:"#94A3B8",fontSize:11}),onMouseDown:function(ev){ ev.preventDefault(); clearFormat(); },title:"Quitar todo el formato"},"✕ Limpiar")
    ),
    React.createElement("div",{
      ref:ref,
      id:editorId.current,
      contentEditable:true,
      suppressContentEditableWarning:true,
      onPaste:function(ev){
        ev.preventDefault();
        var text=ev.clipboardData?ev.clipboardData.getData("text/plain"):(window.clipboardData?window.clipboardData.getData("Text"):"");
        var escaped=text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>");
        var ok=document.execCommand("insertText",false,text);
        if(!ok) document.execCommand("insertHTML",false,escaped);
        onChange(ref.current.innerHTML);
      },
      onInput:function(){ onChange(ref.current.innerHTML); },
      onKeyDown:function(ev){
        // Enter en lista no sale del editor
        if(ev.key==="Tab"){ ev.preventDefault(); document.execCommand("insertHTML",false,"&nbsp;&nbsp;"); }
      },
      style:{
        minHeight:minHeight,padding:"10px 12px",fontSize:14,color:"#1E293B",lineHeight:1.65,
        outline:"none",wordBreak:"break-word",position:"relative"
      }
    }),
    showPlaceholder&&React.createElement("div",{
      style:{position:"absolute",pointerEvents:"none",fontSize:14,color:"#94A3B8",padding:"10px 12px",top:37,left:0},
      onClick:function(){ ref.current.focus(); }
    },placeholder)
  );
}

function SvgGear(){ return React.createElement("svg",{width:16,height:16,viewBox:"0 0 24 24",fill:C.textMuted},React.createElement("path",{d:"M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.92c.04-.36.07-.72.07-1.08s-.03-.73-.07-1.08l2.3-1.77c.21-.16.27-.46.13-.7l-2.18-3.78a.54.54 0 0 0-.66-.23l-2.71 1.09a8.1 8.1 0 0 0-1.87-1.09l-.41-2.89A.54.54 0 0 0 14 2h-4a.54.54 0 0 0-.54.46l-.41 2.89A8.1 8.1 0 0 0 7.17 6.44L4.46 5.35a.54.54 0 0 0-.66.23L1.62 9.36c-.14.24-.08.54.13.7l2.3 1.77c-.04.35-.07.72-.07 1.08s.03.73.07 1.08l-2.3 1.77c-.21.16-.27.46-.13.7l2.18 3.78c.14.24.43.31.66.23l2.71-1.09c.58.43 1.2.79 1.87 1.09l.41 2.89c.07.27.29.46.54.46h4c.25 0 .47-.19.54-.46l.41-2.89a8.1 8.1 0 0 0 1.87-1.09l2.71 1.09c.23.08.52.01.66-.23l2.18-3.78c.14-.24.08-.54-.13-.7l-2.3-1.77z"})); }

// ─── DEMO DATA ───────────────────────────────────────────────────────────────

function diasAtras(n){ var d=new Date(); d.setDate(d.getDate()-n); return fmtFechaLocal(d); }
var clientesDemo=[
  {id:1,nombre:"Ana Garcia",negocio:"Tienda Ropa",contacto:"",origen:"Instagram",etapa:"Cotizacion enviada",notas:"Me contactó por DM, interesada en sesión de fotos para su catálogo",fecha:diasAtras(11),instagram:"@anagarcia",canalPrincipal:"Instagram",messenger:"",email:"",fechaEtapa:diasAtras(11),ultimoContacto:diasAtras(11)},
  {id:2,nombre:"Carlos Lopez",negocio:"Restaurante El Fogón",contacto:"9991234567",origen:"Referido",etapa:"Cotizacion enviada",notas:"Necesita el menú digital antes de fin de mes",fecha:diasAtras(15),instagram:"",canalPrincipal:"WhatsApp",messenger:"",email:"",fechaEtapa:diasAtras(15),ultimoContacto:diasAtras(15)},
  {id:3,nombre:"Maria Rodriguez",negocio:"Clínica Dental",contacto:"9998765432",origen:"Instagram",etapa:"Negociacion",notas:"Le mandé cotización hace más de una semana, sin respuesta",fecha:diasAtras(25),instagram:"@drarodriguez",canalPrincipal:"WhatsApp",messenger:"",email:"",fechaEtapa:diasAtras(25),ultimoContacto:diasAtras(25)},
  {id:4,nombre:"Roberto Mendez",negocio:"Constructora RM",contacto:"9994567890",origen:"Referido",etapa:"Negociacion",notas:"Interesado, pidió ajustar el precio de la remodelación",fecha:diasAtras(13),instagram:"",canalPrincipal:"WhatsApp",messenger:"",email:"",fechaEtapa:diasAtras(13),ultimoContacto:diasAtras(12)},
  {id:5,nombre:"Sofia Herrera",negocio:"Boutique Sofia",contacto:"9993334455",origen:"Instagram",etapa:"Ganado",notas:"Cerró sin problema, muy contenta con el servicio",fecha:diasAtras(23),instagram:"@sofiaherrera",canalPrincipal:"WhatsApp",messenger:"",email:"",fechaEtapa:diasAtras(19),ultimoContacto:diasAtras(19),razonCierre:["Confianza","Seguimiento"]},
  {id:6,nombre:"Diego Torres",negocio:"Bar La Noche",contacto:"9996543210",origen:"Facebook",etapa:"Perdido",notas:"Decidió con otro proveedor",fecha:diasAtras(38),instagram:"",canalPrincipal:"WhatsApp",messenger:"",email:"",fechaEtapa:diasAtras(31),ultimoContacto:diasAtras(31),motivoPerdida:"Eligió otro proveedor"},
  {id:7,nombre:"Valentina Cruz",negocio:"Studio Pilates",contacto:"9997891234",origen:"Instagram",etapa:"Perdido",notas:"Le pareció caro pero le interesó mucho el servicio",fecha:diasAtras(54),instagram:"@valcruz",canalPrincipal:"WhatsApp",messenger:"",email:"",fechaEtapa:diasAtras(49),ultimoContacto:diasAtras(49),motivoPerdida:"Precio alto",seguimientoFecha:diasAtras(-2),notaRecontacto:"Le encantó la propuesta pero dijo que en ese momento no podía. Mencionó que a mediados de mes tendría más presupuesto."},
];
var cotDemo=[
  {id:1,clienteId:2,concepto:"Diseño de menú digital",cantidad:1,precioUnit:3500,monto:3500,estatus:"Pendiente",fecha:diasAtras(15),motivoPerdida:"",vigencia:diasAtras(1),vigenciaDias:"14",notas:"Incluye versión impresa y digital",anticipo:0,fechaAnticipo:"",pagos:[]},
  {id:7,clienteId:1,concepto:"Sesión fotográfica para catálogo",cantidad:1,precioUnit:4500,monto:4500,estatus:"Pendiente",fecha:diasAtras(11),motivoPerdida:"",vigencia:diasAtras(4),vigenciaDias:"7",notas:"20 fotos editadas para su catálogo de ropa",anticipo:0,fechaAnticipo:"",pagos:[]},
  {id:2,clienteId:3,concepto:"Sesión fotográfica",cantidad:1,precioUnit:4500,monto:4500,estatus:"Pendiente",fecha:diasAtras(25),motivoPerdida:"",vigencia:diasAtras(11),vigenciaDias:"14",notas:"20 fotos editadas",anticipo:0,fechaAnticipo:"",pagos:[]},
  {id:3,clienteId:4,concepto:"Remodelación de oficina",cantidad:1,precioUnit:8000,monto:8000,estatus:"Aceptada",fecha:diasAtras(13),motivoPerdida:"",vigencia:"",vigenciaDias:"",notas:"Incluye materiales básicos",anticipo:2000,fechaAnticipo:diasAtras(12),pagos:[{id:"p_401",monto:2000,fecha:diasAtras(12),concepto:"Anticipo"}]},
  {id:4,clienteId:5,concepto:"Consultoría redes sociales",cantidad:1,precioUnit:5500,monto:5500,estatus:"Aceptada",fecha:diasAtras(23),motivoPerdida:"",vigencia:"",vigenciaDias:"",notas:"3 meses de consultoría",anticipo:0,fechaAnticipo:"",pagos:[{id:"p_501",monto:5500,fecha:diasAtras(19),concepto:"Pago completo"}]},
  {id:5,clienteId:6,concepto:"Branding completo",cantidad:1,precioUnit:12000,monto:12000,estatus:"Rechazada",fecha:diasAtras(38),motivoPerdida:"Eligió otro proveedor",vigencia:"",vigenciaDias:"",notas:"",anticipo:0,fechaAnticipo:"",pagos:[]},
  {id:6,clienteId:7,concepto:"Sesión de fotos premium",cantidad:1,precioUnit:4500,monto:4500,estatus:"Rechazada",fecha:diasAtras(54),motivoPerdida:"Precio alto",vigencia:"",vigenciaDias:"",notas:"Incluye 30 fotos editadas",anticipo:0,fechaAnticipo:"",pagos:[]},
];
var serviciosDemo=[
  {id:1,nombre:"Consultoría",precio:3500,descripcion:"Sesión de consultoría de 2 horas"},
  {id:2,nombre:"Diseño gráfico",precio:2800,descripcion:"Incluye 3 revisiones"},
  {id:3,nombre:"Sesión fotográfica",precio:4500,descripcion:"20 fotos editadas en alta resolución"},
  {id:4,nombre:"Diseño de menú digital",precio:3500,descripcion:"Versión impresa y digital, entrega en PDF y editable"},
  {id:5,nombre:"Video promocional",precio:2200,descripcion:"Video de 30-60 segundos para redes sociales"},
  {id:6,nombre:"Branding completo",precio:12000,descripcion:"Logo, paleta de colores, tipografía y manual de marca"},
  {id:7,nombre:"Consultoría de redes sociales",precio:5500,descripcion:"3 meses de acompañamiento y estrategia mensual"},
  {id:8,nombre:"Retoque de fotos",precio:650,descripcion:"Edición y retoque profesional, precio por sesión"},
  {id:9,nombre:"Sesión fotográfica premium",precio:6500,descripcion:"Medio día de sesión, 40 fotos editadas, locación incluida"},
];
var perfilDemo={nombre:"Mi Negocio",tuNombre:"",telefono:"",email:"",direccion:"",color:C.purple,colorSecundario:"#E4E2F8",colorTexto:"#1A1635",logo:"",mensaje:"Gracias por tu confianza.",condicionesPago:"50% anticipo, 50% al entregar.",redesTT:"",redesIG:"",redesFB:"",tipoPerfil:"",banco:"",bancotitular:"",bancoclabe:"",bancoaccount:"",bancoinstrucciones:""};
var perfilDemoServicios={nombre:"Vega Estudio Creativo",tuNombre:"Andrea Vega",telefono:"9992223344",email:"andrea@vegaestudio.mx",direccion:"Mérida, Yucatán",color:C.purple,colorSecundario:"#E4E2F8",colorTexto:"#1A1635",logo:"",mensaje:"Gracias por confiar en Vega Estudio para tu proyecto.",condicionesPago:"50% anticipo para reservar la fecha, 50% al entregar.",redesTT:"",redesIG:"@vegaestudiocreativo",redesFB:"",tipoPerfil:"Servicios",banco:"",bancotitular:"Andrea Vega",bancoclabe:"",bancoaccount:"",bancoinstrucciones:""};
var productosDemo=["Aretes plata","Collar dorado","Pulsera tejida","Anillo boda custom","Aretes dorados","Collar perlas"];
var ventasDemo=[
  {id:1,monto:800,fecha:diasAtras(9),concepto:"Venta directa",tipo:"dia",etiqueta:"",clienteId:null},
  {id:2,monto:1200,fecha:diasAtras(10),concepto:"Asesoría rápida",tipo:"especifico",etiqueta:"",clienteId:5,tipoPago:"completo",anticipo:0,pagos:[]},
  {id:3,monto:650,fecha:diasAtras(12),concepto:"Retoque de fotos",tipo:"rapida",etiqueta:"",clienteId:null},
  {id:4,monto:2200,fecha:diasAtras(14),concepto:"Video promocional",tipo:"especifico",etiqueta:"",clienteId:2,tipoPago:"anticipo",anticipo:1000,pagos:[{id:"p_v4",monto:1000,fecha:diasAtras(14),concepto:"Anticipo"}]},
];

// ── DEMO DATA PRODUCTOS (joyería artesanal) ──────────────────────────────────
var clientesDemoProductos=[
  {id:101,nombre:"María Gómez",negocio:"",contacto:"9991112233",origen:"Instagram",etapa:"Ganado",notas:"Le encantaron los aretes de plata",fecha:diasAtras(15),instagram:"@mariagomez",canalPrincipal:"WhatsApp",messenger:"",email:"",fechaEtapa:diasAtras(12),estadoProspecto:"Convertido",productoInteres:"Kit jabones x2",cantidadInteres:"2",precioInteres:"500",ultimoContacto:diasAtras(12)},
  {id:102,nombre:"Carlos Ruiz",negocio:"",contacto:"9992223344",origen:"Referido",etapa:"Nuevo contacto",notas:"Lo refirió María, quiere un collar para regalo",fecha:diasAtras(9),instagram:"",canalPrincipal:"WhatsApp",messenger:"",email:"",fechaEtapa:diasAtras(9),estadoProspecto:"Nueva",productoInteres:"Collar dorado",cantidadInteres:"1",precioInteres:"480",ultimoContacto:diasAtras(9)},
  {id:103,nombre:"Sofía Herrera",negocio:"",contacto:"9993334455",origen:"Instagram",etapa:"Nuevo contacto",notas:"Preguntó por pulseras de boda para damas de honor x6",fecha:diasAtras(12),instagram:"@sofiaherrera",canalPrincipal:"Instagram",messenger:"",email:"",fechaEtapa:diasAtras(12),estadoProspecto:"En seguimiento",productoInteres:"Pulseras boda x6",cantidadInteres:"6",precioInteres:"1800",ultimoContacto:diasAtras(12)},
  {id:104,nombre:"Luisa Martínez",negocio:"",contacto:"9994445566",origen:"Facebook",etapa:"Nuevo contacto",notas:"Sin respuesta desde que le mandé el precio",fecha:diasAtras(18),instagram:"",canalPrincipal:"WhatsApp",messenger:"",email:"",fechaEtapa:diasAtras(18),estadoProspecto:"Sin respuesta",productoInteres:"Aretes plata",cantidadInteres:"1",precioInteres:"350",ultimoContacto:diasAtras(18)},
  {id:105,nombre:"Diana López",negocio:"",contacto:"9995556677",origen:"Instagram",etapa:"Perdido",notas:"Le pareció caro, fue con otra vendedora",fecha:diasAtras(23),instagram:"@dianalopez",canalPrincipal:"Instagram",messenger:"",email:"",fechaEtapa:diasAtras(20),estadoProspecto:"Perdido",productoInteres:"Anillo boda custom",cantidadInteres:"1",precioInteres:"1200",ultimoContacto:diasAtras(20),motivoPerdida:"Precio alto"},
  {id:106,nombre:"Andrea Vega",negocio:"",contacto:"9996667788",origen:"Referido",etapa:"Ganado",notas:"Pagó completo, encantada con el resultado",fecha:diasAtras(16),instagram:"",canalPrincipal:"WhatsApp",messenger:"",email:"",fechaEtapa:diasAtras(11),estadoProspecto:"Convertido",productoInteres:"Collar perlas",cantidadInteres:"1",precioInteres:"850",ultimoContacto:diasAtras(11)},
  {id:107,nombre:"Renata Flores",negocio:"",contacto:"9997778899",origen:"Instagram",etapa:"Nuevo contacto",notas:"Preguntó disponibilidad para quincena",fecha:diasAtras(8),instagram:"@renataflores",canalPrincipal:"WhatsApp",messenger:"",email:"",fechaEtapa:diasAtras(8),estadoProspecto:"Nueva",productoInteres:"Aretes dorados",cantidadInteres:"1",precioInteres:"290",ultimoContacto:diasAtras(8)},
  {id:108,nombre:"Paola Jiménez",negocio:"",contacto:"9998889900",origen:"Instagram",etapa:"Perdido",notas:"Le encantó el anillo pero el presupuesto no le alcanzaba",fecha:diasAtras(35),instagram:"@paolaj",canalPrincipal:"WhatsApp",messenger:"",email:"",fechaEtapa:diasAtras(33),estadoProspecto:"Perdido",productoInteres:"Anillo boda custom",cantidadInteres:"1",precioInteres:"1200",ultimoContacto:diasAtras(33),motivoPerdida:"Precio alto",seguimientoFecha:diasAtras(-7),notaRecontacto:"Dijo que después de cobrar su quincena doble, le gustaría retomarlo."},
  {id:109,nombre:"Gaby Torres",negocio:"",contacto:"9990001122",origen:"Referido",etapa:"Ganado",notas:"Pidió aretes para su hija, pagó completo al recibir",fecha:diasAtras(5),instagram:"",canalPrincipal:"WhatsApp",messenger:"",email:"",fechaEtapa:diasAtras(3),estadoProspecto:"Convertido",productoInteres:"Aretes plata",cantidadInteres:"1",precioInteres:"350",ultimoContacto:diasAtras(3)},
  {id:110,nombre:"Ximena Cab",negocio:"",contacto:"9991234000",origen:"Facebook",etapa:"Nuevo contacto",notas:"Preguntó por un collar personalizado con inicial",fecha:diasAtras(4),instagram:"",canalPrincipal:"Facebook",messenger:"ximenacab",email:"",fechaEtapa:diasAtras(4),estadoProspecto:"En seguimiento",productoInteres:"Collar dorado",cantidadInteres:"1",precioInteres:"480",ultimoContacto:diasAtras(4)},
];
var pedidosDemoProductos=[
  {id:"ped_demo_1",clienteId:101,productos:"Kit jabones x2",cantidad:2,total:500,pagos:[{id:"pp_d1",monto:200,fecha:diasAtras(14),concepto:"Anticipo"},{id:"pp_d2",monto:300,fecha:diasAtras(12),concepto:"Pago final"}],estadoPedido:"entregado",notas:"Cliente muy feliz, pidió más para el mes que viene",fecha:diasAtras(14),fechaCreado:new Date(Date.now()-14*86400000).toISOString()},
  {id:"ped_demo_2",clienteId:106,productos:"Collar perlas",cantidad:1,total:850,pagos:[{id:"pp_d3",monto:850,fecha:diasAtras(11),concepto:"Pago completo"}],estadoPedido:"entregado",notas:"",fecha:diasAtras(16),fechaCreado:new Date(Date.now()-16*86400000).toISOString()},
  {id:"ped_demo_3",clienteId:103,productos:"Pulseras boda x6",cantidad:6,total:1800,pagos:[{id:"pp_d4",monto:900,fecha:diasAtras(12),concepto:"Anticipo 50%"}],estadoPedido:"preparando",notas:"Boda en Mérida, entrega en una semana",fecha:diasAtras(12),fechaCreado:new Date(Date.now()-12*86400000).toISOString()},
  {id:"ped_demo_4",clienteId:109,productos:"Aretes plata",cantidad:1,total:350,pagos:[{id:"pp_d5",monto:200,fecha:diasAtras(5),concepto:"Anticipo"}],estadoPedido:"entregado",notas:"Se entregó de una vez porque la clienta tenía prisa, falta cobrar el resto",fecha:diasAtras(5),fechaCreado:new Date(Date.now()-5*86400000).toISOString()},
  {id:"ped_demo_5",clienteId:104,productos:"Aretes plata",cantidad:2,total:700,pagos:[],estadoPedido:"cancelado",motivoCancelacion:"No conseguí insumo",motivoCancelacionLado:"negocio",notas:"No llegó el material a tiempo con el proveedor, se le devolvió el anticipo",fecha:diasAtras(17),fechaCreado:new Date(Date.now()-17*86400000).toISOString()},
  {id:"ped_demo_6",clienteId:105,productos:"Anillo boda custom",cantidad:1,total:1200,pagos:[{id:"pp_d6",monto:300,fecha:diasAtras(22),concepto:"Anticipo"}],estadoPedido:"cancelado",motivoCancelacion:"Cliente se arrepintió",motivoCancelacionLado:"cliente",notas:"Encontró un anillo más barato en otro lado",fecha:diasAtras(22),fechaCreado:new Date(Date.now()-22*86400000).toISOString()},
];
var ventasDemoProductos=[
  {id:201,monto:320,fecha:diasAtras(8),concepto:"Aretes dorados pequeños",tipo:"especifico",etiqueta:"",clienteId:null,pagos:[]},
  {id:202,monto:180,fecha:diasAtras(10),concepto:"Pulsera tejida sencilla",tipo:"especifico",etiqueta:"",clienteId:null,pagos:[]},
  {id:203,monto:350,fecha:diasAtras(13),concepto:"Aretes plata",tipo:"especifico",etiqueta:"",clienteId:null,pagos:[]},
];
var perfilDemoProductos={nombre:"Joyería Artesanal Mía",tuNombre:"Mía",telefono:"9990001111",email:"mia@ejemplo.com",direccion:"Mérida, Yucatán",color:C.purple,colorSecundario:"#E4E2F8",colorTexto:"#1A1635",logo:"",mensaje:"Gracias por elegir mis piezas. Cada una está hecha con amor.",condicionesPago:"50% anticipo para comenzar, 50% al entregar.",redesTT:"",redesIG:"@joyeriamia",redesFB:"",tipoPerfil:"productos",banco:"",bancotitular:"Mía López",bancoclabe:"",bancoaccount:"",bancoinstrucciones:""};
var productosCatDemo=[
  {id:1001,nombre:"Aretes plata",precio:350,descripcion:"Aretes de plata 925, acabado brillante.",condiciones:""},
  {id:1002,nombre:"Collar dorado",precio:480,descripcion:"Collar bañado en oro 18k.",condiciones:""},
  {id:1003,nombre:"Pulsera tejida",precio:220,descripcion:"Pulsera tejida a mano con hilo encerado.",condiciones:""},
  {id:1004,nombre:"Anillo boda custom",precio:1200,descripcion:"Anillo personalizado para boda.",condiciones:"50% anticipo al confirmar."},
  {id:1005,nombre:"Aretes dorados",precio:290,descripcion:"Aretes dorados pequeños, uso diario.",condiciones:""},
  {id:1006,nombre:"Collar perlas",precio:850,descripcion:"Collar con perlas naturales.",condiciones:""},
  {id:1007,nombre:"Kit jabones x2",precio:250,descripcion:"Jabones artesanales aromáticos, set de 2.",condiciones:""},
  {id:1008,nombre:"Pulseras boda x6",precio:1800,descripcion:"Set de 6 pulseras a juego para damas de honor.",condiciones:"50% anticipo, se entregan 5 días antes del evento."},
  {id:1009,nombre:"Dije corazón plata",precio:180,descripcion:"Dije chico de plata 925 en forma de corazón.",condiciones:""},
  {id:1010,nombre:"Aretes turquesa",precio:420,descripcion:"Aretes con piedra turquesa natural, montura plateada.",condiciones:""},
  {id:1011,nombre:"Pulsera personalizada",precio:390,descripcion:"Pulsera con nombre o iniciales grabadas.",condiciones:"Requiere 3-4 días para grabado."},
  {id:1012,nombre:"Set collar y aretes",precio:960,descripcion:"Juego a juego de collar corto y aretes a conjunto.",condiciones:""},
];
var formVacio={nombre:"",negocio:"",contacto:"",origen:"Instagram",etapa:"Nuevo contacto",notas:"",instagram:"",canalPrincipal:"WhatsApp",messenger:"",email:"",ultimoContacto:"",notaRecontacto:""};
var cotVacio={clienteId:"",concepto:"",cantidad:1,precioUnit:"",descuento:"",tipoDescuento:"porcentaje",estatus:"Pendiente",vigencia:"",vigenciaDias:"",notas:"",anticipo:0,fechaAnticipo:""};
var svVacio={nombre:"",precio:"",descripcion:"",condiciones:""};
// Formulario de venta directa vacío
var ventaVacia={tipo:"especifico",clienteId:"",concepto:"",monto:"",fecha:FECHA_HOY,etiqueta:"",notas:"",nuevoNombre:"",nuevoContacto:"",nuevoNegocio:"",items:[]};

// ─── PDF GENERATORS ──────────────────────────────────────────────────────────

function fmtNum(v){ return v===undefined||v===null||v===""?"":Number(String(v).replace(/,/g,"")).toLocaleString("es-MX"); }
function parseMonto(v){ return String(v).replace(/,/g,"").replace(/[^0-9.]/g,""); }
function MontoInput(props){
  var e=React.createElement;
  var val=props.value||""; var onChange=props.onChange; var style=props.style; var placeholder=props.placeholder||"0";
  var r=React.useState(fmtNum(val)); var display=r[0]; var setDisplay=r[1];
  React.useEffect(function(){ setDisplay(val===""?"":fmtNum(val)); },[val]);
  return e("input",Object.assign({},props,{
    value:display,
    placeholder:placeholder,
    onChange:function(ev){
      var raw=parseMonto(ev.target.value);
      setDisplay(raw===""?"":fmtNum(raw));
      if(onChange) onChange({target:{value:raw}});
    },
    onBlur:function(ev){
      var raw=parseMonto(ev.target.value);
      setDisplay(raw===""?"":fmtNum(raw));
    },
    style:style,
    type:"text"
  }));
}

function generarPDFCot(cot,cliente,perfil){
  var pagos=cot.pagos||[];
  var totalPagado=pagos.reduce(function(s,p){ return s+Number(p.monto); },0);
  var saldo=cot.monto-totalPagado;
  var pc=perfil.color||"#534AB7";
  var ps=perfil.colorSecundario||"#F0EEFF";
  var pt=perfil.colorTexto||"#ffffff";
  var folio="COT-"+String(cot.id).slice(-4).padStart(4,"0");
  var initCl=(cliente&&cliente.nombre)?cliente.nombre.split(" ").slice(0,2).map(function(w){return w[0];}).join("").toUpperCase():"?";
  var redesHtml=_redesHtml(perfil,pc);

  var html='<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="format-detection" content="telephone=no"><title>'+folio+'</title>';
  html+='<style>*{margin:0;padding:0;box-sizing:border-box;}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}@page{margin:0;size:Letter;}}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;background:#fff;color:#1a1a2e;font-size:13px;line-height:1.5;padding:48px 56px;max-width:760px;margin:0 auto;}';
  html+='.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:2px solid '+pc+';margin-bottom:32px;}';
  html+='.logo-box{width:56px;height:56px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:22px;overflow:hidden;margin-bottom:12px;}';
  html+='.logo-box img{width:56px;height:56px;object-fit:cover;border-radius:10px;}';
  html+='.biz-name{font-size:17px;font-weight:700;color:#1a1a2e;}';
  html+='.biz-meta{font-size:12px;color:#888;margin-top:2px;}';
  html+='.doc-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:'+pc+';text-align:right;margin-bottom:4px;}';
  html+='.doc-folio{font-size:34px;font-weight:800;color:#1a1a2e;text-align:right;letter-spacing:-1px;}';
  html+='.doc-dates{display:flex;gap:24px;justify-content:flex-end;margin-top:10px;}';
  html+='.doc-date-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#aaa;margin-bottom:2px;}';
  html+='.doc-date-val{font-size:13px;font-weight:700;color:#1a1a2e;}';
  html+='.para-block{display:flex;align-items:center;gap:12px;padding:14px 18px;background:'+ps+';border-radius:10px;margin-bottom:28px;}';
  html+='.para-avatar{width:38px;height:38px;border-radius:50%;background:'+pc+';display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0;}';
  html+='.para-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:'+pc+';margin-bottom:2px;}';
  html+='.para-name{font-size:15px;font-weight:700;color:#1a1a2e;}';
  html+='.para-sub{font-size:11px;color:#777;}';
  html+='table{width:100%;border-collapse:collapse;margin-bottom:24px;}';
  html+='thead th{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;padding:0 0 10px;border-bottom:1.5px solid #e5e5e5;}';
  html+='thead th.right{text-align:right;}';
  html+='thead th.center{text-align:center;}';
  html+='tbody tr td{padding:16px 0 4px;vertical-align:top;border-bottom:none;}';
  html+='.sv-name{font-size:14px;font-weight:700;color:#1a1a2e;}';
  html+='.sv-desc{font-size:12px;color:#555;line-height:1.7;padding:8px 0 12px;max-width:100%;text-align:justify;}';
  html+='.sv-desc p{margin-bottom:4px;}';
  html+='.sv-desc ul,.sv-desc ol{padding-left:0;list-style:none;column-count:2;column-gap:24px;margin-top:8px;}';
  html+='.sv-desc li{break-inside:avoid;padding-left:14px;position:relative;margin-bottom:6px;font-size:12px;color:#555;line-height:1.6;}';
  html+='.sv-desc li::before{content:"●";color:'+pc+';font-size:8px;position:absolute;left:0;top:4px;}';
  html+='.sv-desc h4,.sv-desc strong{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:'+pc+';display:block;margin:12px 0 6px;column-span:all;}';
  html+='.sv-desc b{font-weight:600;color:#1a1a2e;}';
  html+='.sv-qty{font-size:13px;text-align:center;color:#555;}';
  html+='.sv-price{font-size:13px;text-align:right;color:#555;}';
  html+='.sv-total{font-size:14px;font-weight:700;text-align:right;color:'+pc+';}';
  html+='.sv-total-orig{font-size:11px;text-align:right;color:#aaa;text-decoration:line-through;display:block;}';
  html+='.divider{height:1.5px;background:#f0f0f0;margin:8px 0 20px;}';
  html+='.totals{margin-bottom:24px;}';
  html+='.total-line{display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:13px;color:#888;border-bottom:1px solid #f5f5f5;}';
  html+='.total-line.discount{color:'+pc+';}';
  html+='.total-line.paid{color:#1A7A5E;}';
  html+='.badge{display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700;border:1.5px solid '+pc+';color:'+pc+';margin-left:6px;}';
  html+='.total-final{display:flex;justify-content:space-between;align-items:center;padding:20px 0 24px;border-bottom:1.5px solid '+pc+';margin-bottom:24px;}';
  html+='.total-final-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#999;}';
  html+='.total-final-val{font-size:32px;font-weight:800;color:'+pc+';}';
  html+='.bank-block{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:20px 24px;background:#f9f9fb;border-radius:10px;margin-bottom:24px;}';
  html+='.bank-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#aaa;margin-bottom:12px;}';
  html+='.bank-row{display:flex;gap:8px;margin-bottom:6px;}';
  html+='.bank-key{font-size:11px;color:#aaa;flex-shrink:0;width:54px;}';
  html+='.bank-val{font-size:11px;font-weight:700;color:#1a1a2e;}';
  html+='.conditions{font-size:12px;color:#666;line-height:1.7;padding:14px 18px;border-left:3px solid '+pc+';background:'+ps+';border-radius:0 8px 8px 0;margin-bottom:20px;}';
  html+='.cond-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:'+pc+';margin-bottom:5px;}';
  html+='.footer-msg{font-size:12px;color:#aaa;font-style:italic;margin-bottom:28px;}';
  html+='.footer-bar{display:flex;justify-content:space-between;align-items:center;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#bbb;}';
  html+='</style></head><body>';

  // HEADER
  html+='<div class="header"><div>';
  if(perfil.logo) html+='<div class="logo-box"><img src="'+perfil.logo+'"></div>';
  html+='<div class="biz-name">'+( perfil.nombre||"Mi negocio")+'</div>';
  var metaParts=[];
  if(perfil.telefono) metaParts.push(perfil.telefono);
  if(perfil.email) metaParts.push(perfil.email);
  if(perfil.direccion) metaParts.push(perfil.direccion);
  // Solo email y dirección en header (no teléfono para evitar link azul en mobile)
  var headerMeta=[];
  if(perfil.email) headerMeta.push(perfil.email);
  if(perfil.direccion) headerMeta.push(perfil.direccion);
  if(headerMeta.length) html+='<div class="biz-meta">'+headerMeta.join(' · ')+'</div>';
  html+='</div><div><div class="doc-label">Cotizaci&oacute;n</div><div class="doc-folio">'+folio+'</div><div class="doc-dates">';
  html+='<div><div class="doc-date-label">Fecha</div><div class="doc-date-val">'+cot.fecha+'</div></div>';
  if(cot.vigencia) html+='<div><div class="doc-date-label">Vigencia</div><div class="doc-date-val">'+cot.vigencia+'</div></div>';
  html+='</div></div></div>';

  // PARA
  html+='<div class="para-block"><div class="para-avatar">'+initCl+'</div><div><div class="para-label">Para</div><div class="para-name">'+( cliente?cliente.nombre:"--")+'</div>';
  if(cliente&&cliente.negocio) html+='<div class="para-sub">'+cliente.negocio+'</div>';
  if(cliente&&cliente.contacto) html+='<div class="para-sub">'+cliente.contacto+'</div>';
  html+='</div></div>';

  // TABLA SERVICIOS
  html+='<table><thead><tr><th style="text-align:left;width:52%">Concepto</th><th class="center" style="width:10%">Cant.</th><th class="right" style="width:19%">Precio unit.</th><th class="right" style="width:19%">Total</th></tr></thead><tbody>';

  var subtotalItems=(cot.subtotal&&Number(cot.subtotal)>0)?Number(cot.subtotal):Number(cot.monto);
  var descAmt=0;
  if(cot.descuento&&Number(cot.descuento)>0){
    descAmt=cot.tipoDescuento==="porcentaje"?subtotalItems*Number(cot.descuento)/100:Number(cot.descuento);
  }

  html+='<tr><td><div class="sv-name">'+cot.concepto+'</div></td>';
  html+='<td class="sv-qty">'+( cot.cantidad||1)+'</td>';
  html+='<td class="sv-price">$'+Number(cot.precioUnit||cot.monto).toLocaleString()+'</td>';
  if(descAmt>0){
    html+='<td style="text-align:right;"><span class="sv-total-orig">$'+subtotalItems.toLocaleString()+'</span><span class="sv-total">$'+Number(cot.monto).toLocaleString()+'</span></td>';
  } else {
    html+='<td><div class="sv-total">$'+Number(cot.monto).toLocaleString()+'</div></td>';
  }
  html+='</tr>';
  if(cot.notas) html+='<tr><td colspan="4" style="padding:6px 0 16px;"><div class="sv-desc">'+cot.notas+'</div></td></tr>';
  if(cot.svCondicionesHtml||cot.svCondiciones){
    html+='<tr><td colspan="4" style="padding:4px 0 16px;border-top:1px solid #f0f0f0;"><div class="sv-desc"><strong>Condiciones</strong>'+(cot.svCondicionesHtml||cot.svCondiciones)+'</div></td></tr>';
  }
  html+='</tbody></table>';

  // TOTALES
  html+='<div class="totals">';
  if(descAmt>0){
    html+='<div class="total-line"><span>Subtotal</span><span>$'+subtotalItems.toLocaleString()+' MXN</span></div>';
    html+='<div class="total-line discount"><span>Descuento especial <span class="badge">'+cot.descuento+(cot.tipoDescuento==="porcentaje"?"%":"")+' OFF</span></span><span>- $'+Math.round(descAmt).toLocaleString()+' MXN</span></div>';
  }
  pagos.forEach(function(p){
    html+='<div class="total-line paid"><span>'+( p.concepto||"Pago recibido")+' · '+p.fecha+'</span><span>- $'+Number(p.monto).toLocaleString()+' MXN</span></div>';
  });
  html+='</div>';

  // TOTAL FINAL
  var labelFinal=saldo<=0?"Pagado completamente":"Saldo a cubrir";
  html+='<div class="total-final"><div class="total-final-label">'+labelFinal+'</div><div class="total-final-val">$'+Math.max(0,saldo).toLocaleString()+' MXN</div></div>';

  // DATOS BANCARIOS
  if(perfil.banco||perfil.bancoclabe||perfil.bancoaccount){
    html+='<div class="bank-block" style="grid-template-columns:1fr;"><div><div class="bank-title">Datos para transferencia</div>';
    if(perfil.banco) html+='<div class="bank-row"><span class="bank-key">Banco</span><span class="bank-val">'+perfil.banco+'</span></div>';
    if(perfil.bancotitular) html+='<div class="bank-row"><span class="bank-key">Titular</span><span class="bank-val">'+perfil.bancotitular+'</span></div>';
    if(perfil.bancoclabe){
      html+='<div class="bank-row"><span class="bank-key">CLABE</span><span class="bank-val">'+perfil.bancoclabe.replace(/(\d{3})(\d{3})(\d{5})(\d{5})(\d{2})/,"$1 $2 $3 $4 $5")+'</span></div>';
    }
    if(perfil.bancoaccount) html+='<div class="bank-row"><span class="bank-key">Cuenta</span><span class="bank-val">'+perfil.bancoaccount+'</span></div>';
    if(perfil.bancoinstrucciones) html+='<div style="font-size:11px;color:#888;margin-top:8px;line-height:1.5;">'+perfil.bancoinstrucciones+'</div>';
    html+='</div></div>';
  }

  // CONDICIONES
  if(perfil.condicionesPago) html+='<div class="conditions"><div class="cond-label">Condiciones de pago</div>'+perfil.condicionesPago+'</div>';

  // MENSAJE
  if(perfil.mensaje) html+='<div class="footer-msg" style="text-align:center;">&ldquo;'+perfil.mensaje+'&rdquo;</div>';

  // FOOTER
  var footerRedes=redesHtml||"";
  var footerContact=metaParts[0]||"";
  html+='<div class="footer-bar"><span>'+(footerContact&&perfil.nombre&&footerContact!==perfil.nombre?footerContact+' &middot; '+perfil.nombre:perfil.nombre||footerContact)+'</span>';
  if(footerRedes) html+='<span style="display:inline-flex;align-items:center;gap:8px;">'+footerRedes+'</span>';
  html+='<span style="color:#ccc;font-size:10px;">'+folio+' · '+cot.fecha+'</span></div>';
  html+='</body></html>';

  _abrirHTML(html,'Cotizacion_'+(cliente?cliente.nombre.replace(/ /g,"_"):"cliente")+'_'+cot.fecha+'.html');
}

function _comprobanteShared(tipo,folio,concepto,monto,pagos,saldo,cliente,perfil,extraInfo){
  var pc=perfil.color||"#534AB7"; var ps=perfil.colorSecundario||"#F0EEFF";
  var initCl=(cliente&&cliente.nombre)?cliente.nombre.split(" ").slice(0,2).map(function(w){return w[0];}).join("").toUpperCase():"?";
  var redesHtml=_redesHtml(perfil,pc);
  var metaParts=[]; if(perfil.telefono) metaParts.push(perfil.telefono); if(perfil.email) metaParts.push(perfil.email);

  var html='<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="format-detection" content="telephone=no"><title>'+tipo+' '+folio+'</title>';
  html+='<style>*{margin:0;padding:0;box-sizing:border-box;}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}@page{margin:0;size:Letter;}}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;background:#fff;color:#1a1a2e;font-size:13px;line-height:1.5;padding:48px 56px;max-width:680px;margin:0 auto;}';
  html+='.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:2px solid '+pc+';margin-bottom:28px;}';
  html+='.logo-box{width:48px;height:48px;border-radius:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:10px;}';
  html+='.logo-box img{width:48px;height:48px;object-fit:cover;border-radius:8px;}';
  html+='.biz-name{font-size:16px;font-weight:700;color:#1a1a2e;}';
  html+='.biz-meta{font-size:11px;color:#888;margin-top:2px;}';
  html+='.doc-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:'+pc+';text-align:right;margin-bottom:4px;}';
  html+='.doc-folio{font-size:28px;font-weight:800;color:#1a1a2e;text-align:right;letter-spacing:-0.5px;}';
  html+='.doc-date{font-size:11px;color:#888;text-align:right;margin-top:6px;}';
  html+='.para-block{display:flex;align-items:center;gap:12px;padding:12px 16px;background:'+ps+';border-radius:10px;margin-bottom:24px;}';
  html+='.para-avatar{width:34px;height:34px;border-radius:50%;background:'+pc+';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;}';
  html+='.para-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:'+pc+';margin-bottom:1px;}';
  html+='.para-name{font-size:14px;font-weight:700;color:#1a1a2e;}';
  html+='.concepto-block{padding:14px 0;border-bottom:1.5px solid #f0f0f0;margin-bottom:20px;}';
  html+='.concepto-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#aaa;margin-bottom:6px;}';
  html+='.concepto-name{font-size:16px;font-weight:700;color:#1a1a2e;}';
  html+='.total-line{display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:13px;color:#888;border-bottom:1px solid #f5f5f5;}';
  html+='.total-line.accent{color:'+pc+';font-weight:600;}';
  html+='.total-line.paid{color:#1A7A5E;font-weight:500;}';
  html+='.total-final{display:flex;justify-content:space-between;align-items:center;padding:20px 0 24px;border-bottom:1.5px solid '+pc+';margin:8px 0 24px;}';
  html+='.total-final-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#999;}';
  html+='.total-final-val{font-size:30px;font-weight:800;color:'+pc+';}';
  html+='.bank-block{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:18px 20px;background:#f9f9fb;border-radius:10px;margin-bottom:20px;}';
  html+='.bank-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#aaa;margin-bottom:10px;}';
  html+='.bank-row{display:flex;gap:8px;margin-bottom:5px;}';
  html+='.bank-key{font-size:10px;color:#aaa;flex-shrink:0;width:50px;}';
  html+='.bank-val{font-size:11px;font-weight:700;color:#1a1a2e;}';
  html+='.footer-msg{font-size:12px;color:#aaa;font-style:italic;margin-bottom:24px;}';
  html+='.footer-bar{display:flex;justify-content:space-between;padding-top:14px;border-top:1px solid #eee;font-size:10px;color:#bbb;}';
  html+='</style></head><body>';

  // HEADER
  html+='<div class="header"><div>';
  if(perfil.logo) html+='<div class="logo-box"><img src="'+perfil.logo+'"></div>';
  html+='<div class="biz-name">'+( perfil.nombre||"Mi negocio")+'</div>';
  var headerMetaC=[]; if(perfil.email) headerMetaC.push(perfil.email); if(perfil.direccion) headerMetaC.push(perfil.direccion);
  if(headerMetaC.length) html+='<div class="biz-meta">'+headerMetaC.join(' · ')+'</div>';
  html+='</div><div><div class="doc-label">'+tipo+'</div><div class="doc-folio">'+folio+'</div><div class="doc-date">'+extraInfo.fecha+'</div></div></div>';

  // PARA
  html+='<div class="para-block"><div class="para-avatar">'+initCl+'</div><div><div class="para-label">Para</div><div class="para-name">'+( cliente?cliente.nombre:"--")+'</div>';
  if(cliente&&cliente.negocio) html+='<div style="font-size:11px;color:#777;">'+cliente.negocio+'</div>';
  html+='</div></div>';

  // CONCEPTO
  html+='<div class="concepto-block"><div class="concepto-label">Concepto</div><div class="concepto-name">'+concepto+'</div></div>';

  // LÍNEAS
  html+='<div class="total-line"><span>Total acordado</span><span style="font-weight:600;color:#1a1a2e;">$'+Number(monto).toLocaleString()+' MXN</span></div>';
  (pagos||[]).forEach(function(p){
    html+='<div class="total-line paid"><span>'+( p.concepto||"Pago recibido")+' · '+p.fecha+'</span><span>- $'+Number(p.monto).toLocaleString()+' MXN</span></div>';
  });

  // TOTAL FINAL
  var labelFinal=saldo<=0?"Pagado completamente":"Saldo pendiente";
  html+='<div class="total-final"><div class="total-final-label">'+labelFinal+'</div><div class="total-final-val">$'+Math.max(0,saldo).toLocaleString()+' MXN</div></div>';

  // DATOS BANCARIOS
  if(perfil.banco||perfil.bancoclabe||perfil.bancoaccount){
    html+='<div class="bank-block" style="grid-template-columns:1fr;"><div><div class="bank-title">Datos para transferencia</div>';
    if(perfil.banco) html+='<div class="bank-row"><span class="bank-key">Banco</span><span class="bank-val">'+perfil.banco+'</span></div>';
    if(perfil.bancotitular) html+='<div class="bank-row"><span class="bank-key">Titular</span><span class="bank-val">'+perfil.bancotitular+'</span></div>';
    if(perfil.bancoclabe){
      html+='<div class="bank-row"><span class="bank-key">CLABE</span><span class="bank-val">'+perfil.bancoclabe+'</span></div>';
    }
    if(perfil.bancoaccount) html+='<div class="bank-row"><span class="bank-key">Cuenta</span><span class="bank-val">'+perfil.bancoaccount+'</span></div>';
    if(perfil.bancoinstrucciones) html+='<div style="font-size:11px;color:#888;margin-top:8px;line-height:1.5;">'+perfil.bancoinstrucciones+'</div>';
    html+='</div></div>';
  }

  if(perfil.mensaje) html+='<div class="footer-msg" style="text-align:center;">&ldquo;'+perfil.mensaje+'&rdquo;</div>';
  var redesHtmlC=_redesHtml(perfil,pc);
  var footerLeftC=perfil.telefono?(perfil.telefono+(perfil.nombre?' &middot; '+perfil.nombre:"")):perfil.nombre||"";
  html+='<div class="footer-bar"><span>'+footerLeftC+'</span>';
  if(redesHtmlC) html+='<span style="display:inline-flex;align-items:center;gap:8px;">'+redesHtmlC+'</span>';
  html+='<span>'+folio+' · '+extraInfo.fecha+'</span></div>';
  html+='</body></html>';
  return html;
}

function generarComprobante(cot,cliente,perfil){
  var pagos=[{concepto:"Anticipo recibido",fecha:cot.fechaAnticipo,monto:cot.anticipo}];
  var saldo=cot.monto-cot.anticipo;
  var folio="ANT-"+String(cot.id).slice(-4).padStart(4,"0")+"-"+String(Date.now()).slice(-4);
  var html=_comprobanteShared("Comprobante de Anticipo",folio,cot.concepto,cot.monto,pagos,saldo,cliente,perfil,{fecha:cot.fechaAnticipo||FECHA_HOY});
  _abrirHTML(html,"Comprobante_"+(cliente?cliente.nombre.replace(/ /g,"_"):"cliente")+"_"+(cot.fechaAnticipo||FECHA_HOY)+".html");
}

function generarComprobantePago(pago,cot,cliente,perfil){
  var allPagos=cot.pagos||[];
  var totalPagado=allPagos.reduce(function(s,p){return s+Number(p.monto);},0);
  var saldo=Number(cot.monto)-totalPagado;
  var folio="PAG-"+String(pago.id).slice(-4);
  var html=_comprobanteShared("Comprobante de Pago",folio,cot.concepto||"Venta",cot.monto,allPagos,saldo,cliente,perfil,{fecha:pago.fecha});
  _abrirHTML(html,"ComprobantePago_"+(cliente?cliente.nombre.replace(/ /g,"_"):"cliente")+"_"+pago.fecha+".html");
}

function generarComprobanteGeneral(cot,cliente,perfil){
  var pagos=cot.pagos||[];
  var totalPagado=pagos.reduce(function(s,p){return s+Number(p.monto);},0);
  var saldo=cot.monto-totalPagado;
  var folio="EST-"+String(cot.id).slice(-4).padStart(4,"0");
  var html=_comprobanteShared("Estado de Cuenta",folio,cot.concepto||"Venta directa",cot.monto,pagos,saldo,cliente,perfil,{fecha:FECHA_HOY});
  _abrirHTML(html,"EstadoCuenta_"+(cliente?cliente.nombre.replace(/ /g,"_"):"cliente")+"_"+FECHA_HOY+".html");
}


function _bancoPDFBlock(perfil,pc,ps){
  if(!perfil.banco&&!perfil.bancoclabe&&!perfil.bancoaccount) return '';
  var h='<div style="margin-top:20px;padding:14px 16px;background:'+ps+';border-radius:10px;border-left:3px solid '+pc+';">';
  h+='<div style="font-size:9px;text-transform:uppercase;letter-spacing:2px;color:'+pc+';font-weight:700;margin-bottom:8px;">Datos para tu pago</div>';
  if(perfil.banco) h+='<div style="font-size:12px;color:#555;margin-bottom:3px;"><b>Banco:</b> '+perfil.banco+'</div>';
  if(perfil.bancotitular) h+='<div style="font-size:12px;color:#555;margin-bottom:3px;"><b>Titular:</b> '+perfil.bancotitular+'</div>';
  if(perfil.bancoclabe) h+='<div style="font-size:12px;color:#555;margin-bottom:3px;font-family:monospace;"><b>CLABE:</b> '+perfil.bancoclabe+'</div>';
  if(perfil.bancoaccount) h+='<div style="font-size:12px;color:#555;margin-bottom:3px;"><b>Cuenta:</b> '+perfil.bancoaccount+'</div>';
  if(perfil.bancoinstrucciones) h+='<div style="font-size:11px;color:#888;margin-top:6px;padding-top:6px;border-top:1px solid '+pc+'22;">'+perfil.bancoinstrucciones+'</div>';
  h+='</div>';
  return h;
}
function _redesHtml(perfil,pc){
  var svgTT='<svg width="14" height="14" viewBox="0 0 24 24" fill="'+pc+'"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.75a8.16 8.16 0 004.77 1.52V6.82a4.85 4.85 0 01-1-.13z"/></svg>';
  var svgIG='<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="igc" x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse"><stop stop-color="#F58529"/><stop offset="0.5" stop-color="#DD2A7B"/><stop offset="1" stop-color="#8134AF"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="5" fill="url(#igc)"/><circle cx="12" cy="12" r="4" stroke="#fff" stroke-width="2"/><circle cx="17" cy="7" r="1.2" fill="#fff"/></svg>';
  var svgFB='<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#185FA5"/><path d="M13.5 8H15V6h-1.5C12.1 6 11 7.1 11 8.5V10H9.5v2H11v6h2v-6h1.5l.5-2H13V8.5c0-.3.2-.5.5-.5z" fill="#fff"/></svg>';
  var r="";
  if(perfil.redesTT) r+='<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;">'+svgTT+' '+perfil.redesTT+'</span>';
  if(perfil.redesIG) r+='<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;">'+svgIG+' '+perfil.redesIG+'</span>';
  if(perfil.redesFB) r+='<span style="display:inline-flex;align-items:center;gap:4px;">'+svgFB+' '+perfil.redesFB+'</span>';
  return r;
}
function _comprobanteCSS(pc,ps,pt){
  return '*{margin:0;padding:0;box-sizing:border-box;}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.wrap{box-shadow:none!important;border:none!important;}}@page{margin:0;}body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;background:#f4f4f8;color:#1a1a2e;font-size:13px;line-height:1.5;padding:32px 20px;}.wrap{max-width:560px;margin:0 auto;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10);background:#fff;}.header{background:'+pc+';padding:32px 36px;}.header-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;}.logo-box{width:48px;height:48px;border-radius:10px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:'+pt+';flex-shrink:0;overflow:hidden;margin-bottom:12px;}.logo-box img{width:48px;height:48px;object-fit:cover;}.biz-name{font-size:18px;font-weight:700;color:'+pt+';}.biz-meta{font-size:11px;color:'+pt+';opacity:0.7;margin-top:3px;}.doc-block{text-align:right;}.doc-label{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:'+pt+';opacity:0.6;font-weight:600;margin-bottom:4px;}.doc-folio{font-size:24px;font-weight:800;color:'+pt+';}.doc-dates{display:flex;gap:20px;margin-top:8px;justify-content:flex-end;}.doc-date-val{font-size:12px;font-weight:700;color:'+pt+';text-align:center;}.doc-date-lbl{font-size:10px;color:'+pt+';opacity:0.6;text-align:center;margin-top:1px;}.body{padding:32px 36px;}.para-block{display:flex;align-items:center;gap:12px;padding:14px 16px;background:'+ps+';border-radius:10px;margin-bottom:24px;border-left:4px solid '+pc+';}.para-avatar{width:36px;height:36px;border-radius:50%;background:'+pc+';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;}.para-label{font-size:9px;text-transform:uppercase;letter-spacing:2px;color:'+pc+';font-weight:700;margin-bottom:1px;}.para-name{font-size:15px;font-weight:700;color:#1a1a2e;}.para-sub{font-size:11px;color:#777;margin-top:1px;}.sv-label{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:'+pc+';font-weight:700;margin-bottom:8px;}.sv-card{border:1px solid #eee;border-radius:10px;padding:14px 18px;}.sv-name{font-size:15px;font-weight:700;color:#1a1a2e;}.total-line{display:flex;justify-content:space-between;padding:8px 0;font-size:13px;color:#888;border-bottom:1px solid #f5f5f5;}.total-main{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;background:'+pc+';border-radius:10px;margin-top:10px;}.total-main-lbl{font-size:13px;font-weight:600;color:'+pt+';}.total-main-val{font-size:20px;font-weight:800;color:'+pt+';}.footer{background:#f8f8fb;padding:16px 36px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #eee;font-size:11px;color:#bbb;}';
}
function _comprobanteHeader(perfil,pc,pt,tipo,folio,fecha,fechaLbl){
  var html='<div class="header"><div class="header-top"><div>';
  if(perfil.logo) html+='<div class="logo-box"><img src="'+perfil.logo+'"></div>';
  else html+='<div class="logo-box">'+(perfil.nombre?perfil.nombre[0].toUpperCase():"N")+'</div>';
  html+='<div class="biz-name">'+(perfil.nombre||"Mi Negocio")+'</div>';
  html+='<div class="biz-meta">'+(perfil.telefono||"")+(perfil.telefono&&perfil.email?" &middot; ":"")+(perfil.email||"")+'</div>';
  html+='</div><div class="doc-block"><div class="doc-label">'+tipo+'</div><div class="doc-folio">'+folio+'</div>';
  html+='<div class="doc-dates"><div><div class="doc-date-val">'+fecha+'</div><div class="doc-date-lbl">'+fechaLbl+'</div></div></div>';
  html+='</div></div></div>';
  return html;
}
function _comprobanteCliente(cliente,initCl,pc,ps){
  var html='<div class="para-block"><div class="para-avatar">'+initCl+'</div><div><div class="para-label">Para</div><div class="para-name">'+(cliente?cliente.nombre:"--")+'</div>';
  if(cliente&&cliente.negocio) html+='<div class="para-sub">'+cliente.negocio+'</div>';
  html+='</div></div>';
  return html;
}
function _comprobanteFooter(folio,fecha,redesHtml,perfil){
  return '<div class="footer"><span>'+folio+' &nbsp;&middot;&nbsp; '+fecha+'</span><span>'+(redesHtml||perfil.nombre)+'</span></div>';
}
function _abrirHTML(html,filename){
  var win=window.open('','_blank');
  if(win){ win.document.write(html); win.document.close(); win.focus(); setTimeout(function(){ win.print(); },800); }
  else { var blob=new Blob([html],{type:'text/html'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }
}

function ModalVenta(props){
  var e=React.createElement;
  var isMobile=(function(){ var w=window.innerWidth,h=window.innerHeight; return w<768||(w>=768&&w<1024&&h>w); })();
  var modalVenta=props.modalVenta; var setModalVenta=props.setModalVenta;
  var formVenta=props.formVenta; var setFormVenta=props.setFormVenta;
  var pasoVenta=props.pasoVenta; var setPasoVenta=props.setPasoVenta;
  var clientes=props.clientes; var guardarVentaDirecta=props.guardarVentaDirecta;
  var avanzarVenta=props.avanzarVenta; var st=props.st;
  var productos=props.productos||[]; var sugerenciasConcepto=props.sugerenciasConcepto||[]; var setSugerenciasConcepto=props.setSugerenciasConcepto||function(){};
  var esProductos=props.esProductos||false; var servicios=props.servicios||[];
  var cotAceptadaId=props.cotAceptadaId; var setCotAceptadaId=props.setCotAceptadaId||function(){};
  var etapaAnteriorGanado=props.etapaAnteriorGanado; var setEtapaAnteriorGanado=props.setEtapaAnteriorGanado||function(){};
  var setClientes=props.setClientes||function(){}; var FECHA_HOY=props.FECHA_HOY||"";
  if(!modalVenta) return null;
  var tipoActual=formVenta.tipo;
  if(pasoVenta==="educativo"){
    return e("div",{style:st.ov,onClick:function(){ setModalVenta(false); setPasoVenta("form"); }},
      e("div",{style:st.modal,onClick:function(ev){ ev.stopPropagation(); }},
        e("div",{style:{fontSize:16,fontWeight:600,color:"#fff",marginBottom:12}},tipoActual==="dia"?"Venta del dia registrada":"Venta registrada"),
        e("div",{style:{padding:"14px 16px",background:C.surfaceUp,borderRadius:10,marginBottom:16,borderLeft:"2px solid "+C.amber}},
          e("div",{style:{fontSize:13,color:C.text,lineHeight:1.7}},
            tipoActual==="dia"
              ?"Registraste $"+Number(formVenta.monto).toLocaleString()+" en ventas del dia"+(formVenta.etiqueta?" en "+formVenta.etiqueta:"")+". Aunque sea un contacto de hoy puede convertirse en cliente recurrente."
              :"Sin el WhatsApp de este cliente, no puedes volver a venderle. La proxima vez intenta pedirlo."
          )
        ),
        tipoActual==="especifico"&&!esProductos&&e("div",{style:{fontSize:12,color:C.green,fontWeight:600,marginBottom:16,padding:"9px 12px",background:C.green+"12",borderRadius:8}},"Ya quedó en tu pestaña Trabajos, para que no se te olvide entregarlo."),
        e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:12}},"Tienes el contacto de alguien de hoy?"),
        e("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"}},
          e("button",{style:st.btn,onClick:function(){ guardarVentaDirecta(false); }},"No por ahora"),
          e("button",{style:st.btnP,onClick:function(){ setPasoVenta("crear_cliente"); }},"Si, agregar contacto")
        )
      )
    );
  }
  var tipoOpciones=[{key:"especifico",label:"Con cliente",desc:"Tienes el contacto"},{key:"generico",label:"Sin contacto",desc:"Venta directa"},{key:"dia",label:"Total del dia",desc:"Monto global"}];
  return e("div",{style:st.ov,onClick:function(){ setModalVenta(false); }},
    e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",display:"flex",flexDirection:"column",maxHeight:isMobile?"94vh":"88vh"}),onClick:function(ev){ ev.stopPropagation(); }},
      e("div",{style:{padding:"20px 24px 16px",background:"linear-gradient(135deg,"+C.greenBg+" 0%,transparent 70%)",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}},
        e("div",null,
          e("div",{style:{fontWeight:700,fontSize:18,color:C.text}},"Venta directa"),
          e("div",{style:{fontSize:12,color:C.textMuted,marginTop:2}},"Ventas que no requirieron una cotización")
        ),
        e("button",{style:{background:C.surfaceUp,border:"1px solid "+C.border,borderRadius:10,cursor:"pointer",color:C.textMuted,fontSize:16,lineHeight:1,padding:"6px 10px"},onClick:function(){
          // Si vino del pipeline, revertir etapa
          if(cotAceptadaId&&String(cotAceptadaId).startsWith("pipeline_revert_")){
            var revId=Number(String(cotAceptadaId).replace("pipeline_revert_",""));
            setClientes(clientes.map(function(c){ return c.id===revId?Object.assign({},c,{etapa:etapaAnteriorGanado||"Nuevo contacto",archivado:false,fechaEtapa:FECHA_HOY}):c; }));
            setCotAceptadaId(null); setEtapaAnteriorGanado(null);
          }
          setModalVenta(false);
        }},"×")
      ),
      e("div",{style:{padding:"20px 24px",overflowY:"auto",flex:1}},
      e("div",{style:{marginBottom:16}},
        e("label",{style:st.lbl},"Tipo de venta"),
        e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}},
          tipoOpciones.map(function(op){
            var activo=tipoActual===op.key;
            return e("button",{key:op.key,style:{cursor:"pointer",padding:"10px 8px",borderRadius:8,border:"0.5px solid "+(activo?C.purpleLight+"66":C.border),background:activo?C.purplePale:"transparent",textAlign:"center",display:"flex",flexDirection:"column",gap:2,alignItems:"center"},onClick:function(){ setFormVenta(Object.assign({},formVenta,{tipo:op.key,clienteId:""})); }},
              e("span",{style:{fontSize:12,fontWeight:500,color:activo?C.purpleLight:C.textMuted}},op.label),
              e("span",{style:{fontSize:10,color:C.textDim}},op.desc)
            );
          })
        )
      ),
      tipoActual==="especifico"&&e("div",{style:{marginBottom:12,position:"relative"}},
        e("label",{style:st.lbl},"Cliente"),
        e("div",{style:{display:"flex",gap:6}},
          e("input",{
            placeholder:formVenta.clienteId?(clientes.find(function(c){ return String(c.id)===String(formVenta.clienteId); })||{}).nombre||"Buscar cliente...":"Buscar o escribir nombre...",
            value:formVenta._buscaCli||"",
            onChange:function(ev){ setFormVenta(Object.assign({},formVenta,{_buscaCli:ev.target.value,clienteId:"",nuevoNombre:ev.target.value})); },
            style:Object.assign({},st.inp,{flex:1,marginBottom:0})
          }),
          e("button",{
            style:{cursor:"pointer",padding:"0 12px",borderRadius:10,border:"1px solid "+C.border,background:formVenta._buscaCli==="*"?C.purplePale:"transparent",fontSize:14,color:C.textMuted,flexShrink:0},
            onClick:function(){ setFormVenta(Object.assign({},formVenta,{_buscaCli:formVenta._buscaCli==="*"?"":"*",clienteId:""})); }
          },"☰")
        ),
        (formVenta._buscaCli||"").length>0&&e("div",{style:{position:"absolute",top:"calc(100% - 2px)",left:0,right:0,background:C.surface,border:"1px solid "+C.border,borderRadius:10,zIndex:50,maxHeight:180,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.1)"}},
          (function(){
            var q=formVenta._buscaCli==="*"?"":formVenta._buscaCli;
            var filtrados=clientes.filter(function(c){ return !q||c.nombre.toLowerCase().includes(q.toLowerCase()); });
            return e("div",null,
              filtrados.map(function(c){
                return e("div",{key:c.id,
                  style:{padding:"10px 14px",cursor:"pointer",fontSize:13,color:C.text,borderBottom:"0.5px solid "+C.border},
                  onMouseDown:function(ev){ ev.preventDefault(); setFormVenta(Object.assign({},formVenta,{clienteId:String(c.id),nuevoNombre:"",_buscaCli:""})); }
                },c.nombre+(c.negocio?" · "+c.negocio:""));
              }),
              q.trim().length>1&&e("div",{
                style:{padding:"10px 14px",cursor:"pointer",fontSize:13,color:C.purple,fontWeight:600,borderTop:filtrados.length>0?"1px solid "+C.border:"none"},
                onMouseDown:function(ev){ ev.preventDefault(); setFormVenta(Object.assign({},formVenta,{clienteId:"",nuevoNombre:q.trim(),_buscaCli:""})); }
              },"＋ Agregar \""+q.trim()+"\" como nuevo cliente")
            );
          })()
        ),
        formVenta.clienteId&&!formVenta._buscaCli&&(function(){
          var cl=clientes.find(function(c){ return String(c.id)===String(formVenta.clienteId); });
          if(!cl) return null;
          return e("div",{style:{marginTop:6,padding:"7px 12px",background:C.purplePale,borderRadius:8,fontSize:13,color:C.purple,display:"flex",justifyContent:"space-between",alignItems:"center"}},
            e("span",{style:{fontWeight:600}},cl.nombre),
            e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:16},onClick:function(){ setFormVenta(Object.assign({},formVenta,{clienteId:"",nuevoNombre:"",_buscaCli:""})); }},"×")
          );
        })(),
        !formVenta.clienteId&&formVenta.nuevoNombre&&!formVenta._buscaCli&&e("div",{style:{marginTop:6,padding:"7px 12px",background:"#ECFDF5",borderRadius:8,fontSize:13,color:"#10B981",display:"flex",justifyContent:"space-between",alignItems:"center"}},
          e("span",null,"＋ Nuevo: ",e("b",null,formVenta.nuevoNombre)),
          e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:16},onClick:function(){ setFormVenta(Object.assign({},formVenta,{nuevoNombre:"",_buscaCli:""})); }},"×")
        ),
        !formVenta.clienteId&&formVenta.nuevoNombre&&!formVenta._buscaCli&&e("div",null,
          e("div",{style:{marginTop:8}},
            e("label",{style:st.lbl},"¿Cómo llegó a ti?"),
            e("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
              ["Instagram","Facebook","WhatsApp","Referido","TikTok","Otro"].map(function(org){
                var activo=formVenta.nuevoOrigen===org;
                return e("button",{key:org,style:{cursor:"pointer",padding:"6px 12px",borderRadius:20,border:"1px solid "+(activo?C.purple:C.border),background:activo?C.purple:"transparent",fontSize:12,color:activo?"#fff":C.textMuted,fontWeight:activo?600:400},
                  onClick:function(){ setFormVenta(Object.assign({},formVenta,{nuevoOrigen:org})); }
                },org);
              })
            )
          ),
          e("div",{style:{marginTop:10}},
            e("label",{style:Object.assign({},st.lbl,{display:"flex",alignItems:"center",gap:4})},
              "¿Dónde lo contactas?",
              e("span",{style:{fontSize:10,color:C.amber,fontWeight:600}},"obligatorio")
            ),
            e("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}},
              ["WhatsApp","Instagram","Facebook"].map(function(canal){
                var activo=formVenta.nuevoCanal===canal;
                return e("button",{key:canal,style:{cursor:"pointer",padding:"7px 14px",borderRadius:20,border:"1.5px solid "+(activo?C.purple:C.border),background:activo?C.purple:"transparent",fontSize:12,color:activo?"#fff":C.textMuted,fontWeight:activo?600:400},
                  onClick:function(){ setFormVenta(Object.assign({},formVenta,{nuevoCanal:canal,nuevoContacto:""})); }
                },canal);
              })
            ),
            formVenta.nuevoCanal&&e("input",{
              type:formVenta.nuevoCanal==="WhatsApp"?"tel":"text",
              placeholder:formVenta.nuevoCanal==="WhatsApp"?"Número de WhatsApp (10 dígitos)":formVenta.nuevoCanal==="Instagram"?"Usuario de Instagram (@...)":"Nombre en Facebook",
              value:formVenta.nuevoContacto||"",
              onChange:function(ev){
                var v=formVenta.nuevoCanal==="WhatsApp"?ev.target.value.replace(/\D/g,"").slice(0,10):ev.target.value;
                setFormVenta(Object.assign({},formVenta,{nuevoContacto:v}));
              },
              maxLength:formVenta.nuevoCanal==="WhatsApp"?10:undefined,
              inputMode:formVenta.nuevoCanal==="WhatsApp"?"numeric":undefined,
              style:st.inp
            }),
            formVenta.nuevoCanal==="WhatsApp"&&formVenta.nuevoContacto&&formVenta.nuevoContacto.length>0&&formVenta.nuevoContacto.length<10&&e("div",{style:{fontSize:11,color:"#E53E3E",marginTop:-4,marginBottom:8}},"Faltan "+(10-formVenta.nuevoContacto.length)+" dígitos")
          )
        )
      ),
      tipoActual!=="dia"&&(function(){
        var items=formVenta.items||[];
        var totalItems=items.reduce(function(s,it){ return s+Number(it.cantidad||1)*Number(it.precio||0); },0);
        function setItems(newItems){ setFormVenta(Object.assign({},formVenta,{items:newItems,monto:newItems.length>0?newItems.reduce(function(s,it){ return s+Number(it.cantidad||1)*Number(it.precio||0); },0):formVenta.monto})); }
        function addItem(sv){ setItems([...items,{id:Date.now(),nombre:sv?sv.nombre:"",cantidad:1,precio:sv?String(sv.precio):""}]); }
        function updItem(id,field,val){ setItems(items.map(function(it){ return it.id===id?Object.assign({},it,{[field]:val}):it; })); }
        function delItem(id){ setItems(items.filter(function(it){ return it.id!==id; })); }
        return e("div",{style:{marginBottom:12}},
          items.length>0&&e("div",{style:{borderRadius:12,border:"1px solid "+C.border,overflow:"hidden",marginBottom:8}},
            e("div",{style:{display:"grid",gridTemplateColumns:"1fr 52px 88px 28px",gap:0,background:C.surfaceUp,borderBottom:"1px solid "+C.border,padding:"6px 10px"}},
              e("span",{style:{fontSize:10,color:C.textDim,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px"}},"Producto"),
              e("span",{style:{fontSize:10,color:C.textDim,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",textAlign:"center"}},"Cant."),
              e("span",{style:{fontSize:10,color:C.textDim,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",textAlign:"right"}},"Precio"),
              e("span",null)
            ),
            items.map(function(it,idx){
              return e("div",{key:it.id,style:{display:"grid",gridTemplateColumns:"1fr 52px 88px 28px",gap:6,padding:"6px 10px",borderBottom:idx<items.length-1?"1px solid "+C.border:"none",alignItems:"center",background:C.surface}},
                e("input",{value:it.nombre,placeholder:"Nombre...",onChange:function(ev){ updItem(it.id,"nombre",ev.target.value); },style:Object.assign({},st.inp,{padding:"5px 8px",fontSize:12,marginBottom:0})}),
                e("input",{type:"number",min:1,value:it.cantidad,onChange:function(ev){ updItem(it.id,"cantidad",ev.target.value); },style:Object.assign({},st.inp,{padding:"5px 4px",fontSize:12,textAlign:"center",marginBottom:0})}),
                e(MontoInput,{value:it.precio,placeholder:"0",onChange:function(ev){ updItem(it.id,"precio",ev.target.value); },style:Object.assign({},st.inp,{padding:"5px 8px",fontSize:12,textAlign:"right",marginBottom:0})}),
                e("button",{onClick:function(){ delItem(it.id); },style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:18,lineHeight:1,padding:0,display:"flex",alignItems:"center",justifyContent:"center"}},"×")
              );
            }),
            e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",borderTop:"1px solid "+C.border,background:C.surfaceUp}},
              e("span",{style:{fontSize:11,color:C.textDim}},items.length+" producto"+(items.length>1?"s":"")),
              e("span",{style:{fontSize:15,fontWeight:700,color:C.green}},"$"+totalItems.toLocaleString())
            )
          ),
          e("div",{style:{display:"flex",gap:6}},
            (function(){
              var cat=esProductos?(props.productosCat||[]):servicios;
              return cat.length>0&&e("select",{
                value:"",
                onChange:function(ev){
                  if(!ev.target.value) return;
                  var sv=cat.find(function(s){ return String(s.id)===ev.target.value; });
                  if(sv) addItem(sv);
                  ev.target.value="";
                },
                style:Object.assign({},st.inp,{flex:1,marginBottom:0,fontSize:12,color:C.purple,cursor:"pointer"})
              },
                e("option",{value:""},"＋ Del catálogo..."),
                cat.map(function(sv){ return e("option",{key:sv.id,value:sv.id},sv.nombre+" , $"+Number(sv.precio).toLocaleString()); })
              );
            })(),
            (function(){
              var cat=esProductos?(props.productosCat||[]):servicios;
              if(cat.length>0){
                return e("button",{
                  onClick:function(){ addItem(null); },
                  style:{cursor:"pointer",padding:"8px 14px",borderRadius:10,border:"1px dashed "+C.border,background:"transparent",fontSize:12,color:C.textMuted,fontWeight:500,flexShrink:0,whiteSpace:"nowrap"}
                },"+ Manual");
              }
              return e("button",{
                onClick:function(){ addItem(null); },
                style:{cursor:"pointer",padding:"8px 14px",borderRadius:10,border:"1px dashed "+C.border,background:"transparent",fontSize:12,color:C.textMuted,fontWeight:500,flex:1,whiteSpace:"nowrap"}
              },"+ Agregar "+(esProductos?"producto":"servicio"));
            })()
          ),
          (function(){
            var cat=esProductos?(props.productosCat||[]):servicios;
            return cat.length===0&&e("div",{style:{fontSize:11,color:C.textDim,marginTop:6,lineHeight:1.4}},"Aún no tienes "+(esProductos?"productos":"servicios")+" guardados en tu catálogo. Puedes agregarlo aquí a mano, o crear tu catálogo en \"Mi catálogo\" para reusarlo después.");
          })(),
        );
      })(),
      tipoActual==="dia"&&e("div",{style:{marginBottom:12}},
        e("label",{style:st.lbl},"Total del día ($) *"),
        e(MontoInput,{value:formVenta.monto||"",onChange:function(ev){ setFormVenta(Object.assign({},formVenta,{monto:ev.target.value})); },placeholder:"0",style:st.inp})
      ),
      // ¿CÓMO TE PAGARON?
      tipoActual!=="dia"&&e("div",{style:{marginBottom:12}},
        e("label",{style:st.lbl},"¿Cómo te pagaron?"),
        e("div",{style:{display:"grid",gridTemplateColumns:esProductos?"1fr":"1fr 1fr",gap:8,marginBottom:8}},
          e("button",{style:{cursor:"pointer",padding:"12px",borderRadius:12,border:"2px solid "+(formVenta.tipoPago==="completo"?C.green:C.border),background:formVenta.tipoPago==="completo"?C.greenBg:"transparent",textAlign:"left"},onClick:function(){ setFormVenta(Object.assign({},formVenta,{tipoPago:"completo",anticipo:""})); }},
            e("div",{style:{fontSize:13,fontWeight:600,color:formVenta.tipoPago==="completo"?C.green:C.text,marginBottom:2}},"✓ Pago completo"),
            e("div",{style:{fontSize:11,color:C.textMuted}},"Ya recibiste el 100%")
          ),
          !esProductos&&e("button",{style:{cursor:"pointer",padding:"12px",borderRadius:12,border:"2px solid "+(formVenta.tipoPago==="anticipo"?C.amber:C.border),background:formVenta.tipoPago==="anticipo"?C.amberBg:"transparent",textAlign:"left"},onClick:function(){ setFormVenta(Object.assign({},formVenta,{tipoPago:"anticipo"})); }},
            e("div",{style:{fontSize:13,fontWeight:600,color:formVenta.tipoPago==="anticipo"?"#92400E":C.text,marginBottom:2}},"💰 Anticipo recibido"),
            e("div",{style:{fontSize:11,color:C.textMuted}},"Hay un saldo pendiente")
          )
        ),
        !esProductos&&formVenta.tipoPago==="anticipo"&&e("div",null,
          e("label",{style:st.lbl},"Monto del anticipo"),
          e(MontoInput,{value:formVenta.anticipo||"",onChange:function(ev){ setFormVenta(Object.assign({},formVenta,{anticipo:ev.target.value})); },placeholder:"0",style:st.inp}),
          (function(){
            var total=Number(formVenta.monto||0)||(formVenta.items||[]).reduce(function(s,it){ return s+Number(it.cantidad||1)*Number(it.precio||0); },0);
            var ant=Number(formVenta.anticipo||0);
            if(!ant||!total) return null;
            return e("div",{style:{fontSize:12,color:C.amber,marginTop:4}},"Saldo pendiente: $"+(total-ant).toLocaleString());
          })()
        )
      ),
      e("div",{style:{marginBottom:12}},
        e("label",{style:st.lbl},"Fecha"),
        e("input",{type:"date",value:formVenta.fecha||FECHA_HOY,onChange:function(ev){ setFormVenta(Object.assign({},formVenta,{fecha:ev.target.value})); },style:Object.assign({},st.inp,{width:"100%",maxWidth:"100%",boxSizing:"border-box",display:"block",minWidth:0,WebkitAppearance:"none"})})
      ),
      e("div",{style:{marginBottom:12}},
        e("label",{style:st.lbl},"¿Donde fue esta venta? (opcional)"),
        e("input",{value:formVenta.etiqueta||"",onChange:function(ev){ setFormVenta(Object.assign({},formVenta,{etiqueta:ev.target.value})); },placeholder:"ej. Bazar Merida, WhatsApp, Tienda...",style:st.inp})
      ),
      e("div",{style:{marginBottom:8}},
        e("label",{style:st.lbl},"Notas (opcional)"),
        e("textarea",{value:formVenta.notas||"",onChange:function(ev){ setFormVenta(Object.assign({},formVenta,{notas:ev.target.value})); },style:Object.assign({},st.inp,{minHeight:44,resize:"vertical"})})
      )
      ), // cierra body scrollable
      e("div",{style:{padding:isMobile?"12px 24px 28px":"14px 24px",borderTop:"1px solid "+C.border,background:C.surfaceUp,display:"flex",gap:8,justifyContent:"flex-end",flexShrink:0}},
        e("button",{style:st.btn,onClick:function(){
          if(cotAceptadaId&&String(cotAceptadaId).startsWith("pipeline_revert_")){
            var revId=Number(String(cotAceptadaId).replace("pipeline_revert_",""));
            setClientes(clientes.map(function(c){ return c.id===revId?Object.assign({},c,{etapa:etapaAnteriorGanado||"Nuevo contacto",archivado:false,fechaEtapa:FECHA_HOY}):c; }));
            setCotAceptadaId(null); setEtapaAnteriorGanado(null);
          }
          setModalVenta(false);
        }},"Cancelar"),
        e("button",{style:Object.assign({},st.btnG,{opacity:(tipoActual==="dia"||formVenta.tipoPago)&&!(!formVenta.clienteId&&formVenta.nuevoNombre&&formVenta.nuevoNombre.trim()&&(!formVenta.nuevoCanal||!formVenta.nuevoContacto||!formVenta.nuevoContacto.trim()))?1:0.5}),onClick:function(){
          if(tipoActual!=="dia"&&!formVenta.tipoPago){ alert("Selecciona cómo te pagaron antes de guardar."); return; }
          avanzarVenta();
        }},"Guardar venta")
      )
    )
  );
}

var formVacio={nombre:"",negocio:"",contacto:"",origen:"Instagram",etapa:"Nuevo contacto",notas:"",instagram:"",canalPrincipal:"WhatsApp",messenger:"",email:"",ultimoContacto:"",notaRecontacto:""};
var cotVacio={clienteId:"",concepto:"",cantidad:1,precioUnit:"",descuento:"",tipoDescuento:"porcentaje",estatus:"Pendiente",vigencia:"",vigenciaDias:"",notas:"",anticipo:0,fechaAnticipo:""};
var svVacio={nombre:"",precio:"",descripcion:""};
// Formulario de venta directa vacío
var ventaVacia={tipo:"especifico",clienteId:"",concepto:"",monto:"",fecha:FECHA_HOY,etiqueta:"",notas:"",nuevoNombre:"",nuevoContacto:"",nuevoNegocio:"",items:[]};

// ─── PDF GENERATORS ──────────────────────────────────────────────────────────



function BtnCanal(props){
  var e=React.createElement;
  var cliente=props.cliente; var small=props.small; var concepto=props.concepto;
  var msg=msgEtapa(cliente,concepto);
  var url=contactUrl(cliente,msg);
  if(!url) return null;
  var canal=cliente.canalPrincipal||"WhatsApp"; var cc=canalColor(canal);
  return e("a",{href:url,target:"_blank",rel:"noreferrer",style:{cursor:"pointer",padding:small?"3px 8px":"5px 10px",borderRadius:8,border:"0.5px solid "+cc+"44",fontSize:small?11:12,color:cc,fontWeight:500,textDecoration:"none",display:"inline-flex",alignItems:"center",gap:4,background:cc+"18"}},e(SvgIcon,{canal:canal,size:small?11:13}),canal);
}

function BadgeAnticipo(props){
  var e=React.createElement;
  var cot=props.cot;
  if(!cot||cot.estatus!=="Aceptada") return null;
  var saldo=cot.monto-(cot.anticipo||0);
  if(cot.anticipo>0&&saldo===0) return e("span",{style:{fontSize:10,padding:"2px 7px",borderRadius:20,background:C.green+"22",color:C.green,border:"0.5px solid "+C.green+"44"}},"Pagado");
  if(cot.anticipo>0&&saldo>0) return e("span",{style:{fontSize:10,padding:"2px 7px",borderRadius:20,background:C.amber+"22",color:C.amber,border:"0.5px solid "+C.amber+"44"}},"Saldo $"+saldo.toLocaleString());
  return null;
}

function TopBarProductos(props){
  var e=React.createElement;
  var open=props.open; var setOpen=props.setOpen;
  var isMobile=props.isMobile; var C=props.C; var st=props.st;
  var onCliente=props.onCliente; var onProspecto=props.onProspecto;
  var onPedido=props.onPedido; var onVenta=props.onVenta;
  var OPCIONES=[
    {label:"+ Nueva oportunidad", desc:"Alguien que preguntó",     color:C.purple,  border:C.purple+"44", bg:C.purplePale, onClick:onProspecto},
    {label:"+ Pedido",            desc:"Compra ya confirmada",     color:"#10B981", border:"#10B981"+"44", bg:"#ECFDF588",  onClick:onPedido},
    {label:"+ Venta directa",      desc:"Cobro inmediato",          color:"#F59E0B", border:"#F59E0B"+"44", bg:"#FFFBEB88",  onClick:onVenta},
  ];
  return e("div",{style:{position:"relative",display:"inline-block"}},
    open&&e("div",{style:{position:"fixed",inset:0,zIndex:499},onClick:function(){ setOpen(false); }}),
    e("button",{
      style:{cursor:"pointer",padding:isMobile?"0 14px":"9px 20px",height:isMobile?36:"auto",borderRadius:14,border:"none",background:C.purple,fontSize:isMobile?12:13,color:"#fff",fontWeight:700,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"},
      onClick:function(){ setOpen(!open); }
    },
      "+ Nuevo",
      e("svg",{width:12,height:12,viewBox:"0 0 12 12",fill:"none",style:{transition:"transform 0.15s",transform:open?"rotate(180deg)":"rotate(0deg)"}},
        e("path",{d:"M2 4l4 4 4-4",stroke:"#fff",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round"})
      )
    ),
    open&&e("div",{
      style:{position:"absolute",top:"calc(100% + 8px)",right:0,background:C.surface,border:"1px solid "+C.border,borderRadius:16,boxShadow:"0 8px 32px rgba(0,0,0,0.14)",minWidth:200,zIndex:500,overflow:"hidden",padding:6}
    },
      OPCIONES.map(function(op){
        return e("button",{key:op.label,
          style:{cursor:"pointer",width:"100%",padding:"10px 14px",border:"none",background:"transparent",display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2,borderRadius:10,textAlign:"left"},
          onClick:function(){ setOpen(false); op.onClick&&op.onClick(); },
          onMouseEnter:function(ev){ ev.currentTarget.style.background=C.surfaceUp; },
          onMouseLeave:function(ev){ ev.currentTarget.style.background="transparent"; }
        },
          e("span",{style:{fontSize:13,fontWeight:600,color:op.color}},op.label),
          e("span",{style:{fontSize:11,color:C.textDim}},op.desc)
        );
      })
    )
  );
}

function TopBarServicios(props){
  var e=React.createElement;
  var open=props.open; var setOpen=props.setOpen;
  var isMobile=props.isMobile; var C=props.C; var st=props.st;
  var onCliente=props.onCliente; var onCot=props.onCot; var onVenta=props.onVenta;
  var OPCIONES=[
    {label:"+ Cliente",      desc:"Agrega un nuevo contacto",   color:C.purple,  onClick:onCliente},
    {label:"+ Cotización",   desc:"Propuesta formal de precio", color:"#10B981",  onClick:onCot},
    {label:"+ Venta directa", desc:"Cobro inmediato sin cot.",   color:"#F59E0B",  onClick:onVenta},
  ];
  return e("div",{style:{position:"relative",display:"inline-block"}},
    open&&e("div",{style:{position:"fixed",inset:0,zIndex:499},onClick:function(){ setOpen(false); }}),
    e("button",{
      style:{cursor:"pointer",padding:isMobile?"0 14px":"9px 20px",height:isMobile?36:"auto",borderRadius:14,border:"none",background:C.purple,fontSize:isMobile?12:13,color:"#fff",fontWeight:700,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"},
      onClick:function(){ setOpen(!open); }
    },
      "+ Nuevo",
      e("svg",{width:12,height:12,viewBox:"0 0 12 12",fill:"none",style:{transition:"transform 0.15s",transform:open?"rotate(180deg)":"rotate(0deg)"}},
        e("path",{d:"M2 4l4 4 4-4",stroke:"#fff",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round"})
      )
    ),
    open&&e("div",{
      style:{position:"absolute",top:"calc(100% + 8px)",right:0,background:C.surface,border:"1px solid "+C.border,borderRadius:16,boxShadow:"0 8px 32px rgba(0,0,0,0.14)",minWidth:200,zIndex:500,overflow:"hidden",padding:6}
    },
      OPCIONES.map(function(op){
        return e("button",{key:op.label,
          style:{cursor:"pointer",width:"100%",padding:"10px 14px",border:"none",background:"transparent",display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2,borderRadius:10,textAlign:"left"},
          onClick:function(){ setOpen(false); op.onClick&&op.onClick(); },
          onMouseEnter:function(ev){ ev.currentTarget.style.background=C.surfaceUp; },
          onMouseLeave:function(ev){ ev.currentTarget.style.background="transparent"; }
        },
          e("span",{style:{fontSize:13,fontWeight:600,color:op.color}},op.label),
          e("span",{style:{fontSize:11,color:C.textDim}},op.desc)
        );
      })
    )
  );
}

function Alertas(props){
  var e=React.createElement; var cerrarAlerta=props.cerrarAlerta; var st=props.st;
  if(!alertas.length) return null;
  return e("div",{style:{marginBottom:16}},alertas.map(function(a){
    var borderColor=a.urgente?C.amber:C.border;
    var bg=a.urgente?"rgba(184,146,42,0.06)":"rgba(255,255,255,0.03)";
    return e("div",{key:a.key,style:{display:"flex",alignItems:"flex-start",gap:10,padding:"12px 14px",borderRadius:8,background:bg,border:"0.5px solid "+borderColor,marginBottom:6,fontSize:13,color:C.text}},
      a.urgente&&e("span",{style:{fontSize:14,flexShrink:0}},"⚠️"),
      e("span",{style:{flex:1,lineHeight:1.6,color:a.urgente?C.text:C.textMuted}},a.msg,a.accion&&e("button",{onClick:a.accion.fn,style:Object.assign({},st.btn,{fontSize:11,padding:"2px 8px",marginLeft:8})},a.accion.label)),
      e("button",{onClick:function(){ cerrarAlerta(a.key); },style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:16,lineHeight:1,padding:"0 4px",flexShrink:0}},"x")
    );
  }));
}

function migrarCots(cots){
  return cots.map(function(c){
    if(c.pagos) return c; // ya migrado
    var pagos=[];
    if(c.anticipo>0) pagos.push({id:"p_"+c.id,monto:c.anticipo,fecha:c.fechaAnticipo||c.fecha,concepto:"Anticipo"});
    return Object.assign({},c,{pagos:pagos});
  });
}

export default function CLEO(props){
  var e=React.createElement;

  // Estados principales , forzar datos frescos si version cambio
  var DATA_VERSION="v4";
  // No borrar datos al iniciar , solo marcar version si es nueva instalación
  if(typeof localStorage!=="undefined"&&!localStorage.getItem("cleo_data_version")){
    localStorage.setItem("cleo_data_version",DATA_VERSION);
  }
  function lsGet(key,fallback){ try{ var v=localStorage.getItem(key); return v?JSON.parse(v):fallback; }catch(e){ return fallback; } }
  var s1=useState(function(){ return lsGet("cleo_clientes",[]); }); var clientes=s1[0]; var setClientesRaw=s1[1];
  var s2=useState(function(){ return migrarCots(lsGet("cleo_cots",[])); }); var cotizaciones=s2[0]; var setCotizacionesRaw=s2[1];
  var s3=useState(function(){ return lsGet("cleo_perfil",perfilDemo); }); var perfil=s3[0]; var setPerfilRaw=s3[1];
  var s4=useState(function(){ return lsGet("cleo_servicios",[]); }); var servicios=s4[0]; var setServiciosRaw=s4[1];
  var s4p=useState(function(){ return lsGet("cleo_productos_cat",[]); }); var productosCat=s4p[0]; var setProductosCatRaw=s4p[1];
  function setProductosCat(v){ setProductosCatRaw(v); try{ localStorage.setItem("cleo_productos_cat",JSON.stringify(v)); }catch(e){} }
  var s4b=useState(function(){ return lsGet("cleo_ventas",[]); }); var ventas=s4b[0]; var setVentasRaw=s4b[1];
  var s4c=useState(function(){ return lsGet("cleo_productos",[]); }); var productos=s4c[0]; var setProductosRaw=s4c[1];

  // Estados de navegacion
  var s5=useState("inicio"); var vista=s5[0]; var setVistaRaw=s5[1];
  var sHighlightOpo=useState(null); var highlightOpoId=sHighlightOpo[0]; var setHighlightOpoId=sHighlightOpo[1];
  var sHighlightPed=useState(null); var highlightPedidoId=sHighlightPed[0]; var setHighlightPedidoId=sHighlightPed[1];
  var sHighlightHoy=useState(null); var highlightHoyClienteId=sHighlightHoy[0]; var setHighlightHoyClienteId=sHighlightHoy[1];
  var sHighlightCot=useState(null); var highlightCotId=sHighlightCot[0]; var setHighlightCotId=sHighlightCot[1];
  function setVista(v){ setVistaRaw(v); if(v!=="prospectos") setHighlightOpoId(null); if(v!=="pedidos") setHighlightPedidoId(null); if(v!=="hoy") setHighlightHoyClienteId(null); if(v!=="cotizaciones") setHighlightCotId(null); }
  var s6=useState("todo"); var periodo=s6[0]; var setPeriodo=s6[1];
  var s7=useState(""); var busqueda=s7[0]; var setBusqueda=s7[1];
  var s8=useState({estatus:"",busqueda:"",periodo:"todo",conSaldo:false}); var filtroCot=s8[0]; var setFiltroCot=s8[1];
  var s9=useState({periodo:"todo",conCot:"",tab:"ganados"}); var filtroGanados=s9[0]; var setFiltroGanados=s9[1];

  // Estados de modales
  var s10=useState(false); var modalCliente=s10[0]; var setModalCliente=s10[1];
  var s11=useState(false); var modalCot=s11[0]; var setModalCot=s11[1];
  var s12=useState(false); var modalPerfil=s12[0]; var setModalPerfil=s12[1];
  var s12b=useState(false); var modalCatalogo=s12b[0]; var setModalCatalogo=s12b[1];
  var s12c=useState(null); var svDetalleId=s12c[0]; var setSvDetalleId=s12c[1];
  var s12d=useState(null); var editSv=s12d[0]; var setEditSv=s12d[1];
  var s12d=useState(false); var mostrarDesc=s12d[0]; var setMostrarDesc=s12d[1];
  var s12e=useState(false); var mostrarCond=s12e[0]; var setMostrarCond=s12e[1];
  var s12f=useState(false); var acordeonSv=s12f[0]; var setAcordeonSv=s12f[1];
  var s12g=useState(""); var buscaSv=s12g[0]; var setBuscaSv=s12g[1];
  var s13=useState(null); var clienteSel=s13[0]; var setClienteSel=s13[1];
  var s13b=useState(false); var modalVenta=s13b[0]; var setModalVenta=s13b[1];

  // Estados de formularios
  var s14=useState(formVacio); var form=s14[0]; var setForm=s14[1];
  var s15=useState(cotVacio); var formCot=s15[0]; var setFormCot=s15[1];
  var sEditCot=useState(null); var editCotId=sEditCot[0]; var setEditCotId=sEditCot[1];
  var sBuscaCli=useState(""); var buscaCli=sBuscaCli[0]; var setBuscaCli=sBuscaCli[1];
  var sGuardarSv=useState(null); var guardarSvModal=sGuardarSv[0]; var setGuardarSvModal=sGuardarSv[1];
  var s16=useState(function(){ return lsGet("cleo_perfil",perfilDemo); }); var formPerfil=s16[0]; var setFormPerfil=s16[1];
  var s17=useState(svVacio); var formSv=s17[0]; var setFormSv=s17[1];
  var s17b=useState(0); var editorKey=s17b[0]; var setEditorKey=s17b[1];
  var s18=useState(false); var envioCotizacion=s18[0]; var setEnvioCotizacion=s18[1];
  var s19=useState({concepto:"",monto:""}); var formEnvioCot=s19[0]; var setFormEnvioCot=s19[1];
  var s19b=useState(ventaVacia); var formVenta=s19b[0]; var setFormVenta=s19b[1];
  // paso del modal de venta: "form" | "educativo" | "crear_cliente"
  var s19c=useState("form"); var pasoVenta=s19c[0]; var setPasoVenta=s19c[1];
  var s19d=useState([]); var sugerenciasConcepto=s19d[0]; var setSugerenciasConcepto=s19d[1];
  var s19e=useState(function(){ try{ return localStorage.getItem("cleo_celebracion_pendiente")||null; }catch(e){ return null; } }); var cotAceptadaId=s19e[0]; var setCotAceptadaId=s19e[1];
  React.useEffect(function(){
    try{
      if(cotAceptadaId) localStorage.setItem("cleo_celebracion_pendiente",cotAceptadaId);
      else localStorage.removeItem("cleo_celebracion_pendiente");
    }catch(e){}
  },[cotAceptadaId]);
  var s19f=useState(false); var mostrarHoy=s19f[0]; var setMostrarHoy=s19f[1];
  var s19g=useState("30"); var diasPostVenta=s19g[0]; var setDiasPostVenta=s19g[1];
  var s19h=useState(null); var contactadoClienteId=s19h[0]; var setContactadoClienteId=s19h[1];
  var sSugerencia=useState(null); var sugerenciaClienteId=sSugerencia[0]; var setSugerenciaClienteId=sSugerencia[1];
  var sPasoPregunto=useState(null); var pasoPregunto=sPasoPregunto[0]; var setPasoPregunto=sPasoPregunto[1];
  // Flujo independiente "Alguien preguntó" para PRODUCTOS , no comparte estado con el de Servicios
  var sPasoPreguntoP=useState(null); var pasoPreguntoP=sPasoPreguntoP[0]; var setPasoPreguntoP=sPasoPreguntoP[1];
  // Onboarding guiado nuevo: bienvenida → nombre → negocio → situación → confirmación
  var sOnbSubPaso=useState("bienvenida"); var onbSubPaso=sOnbSubPaso[0]; var setOnbSubPaso=sOnbSubPaso[1];
  var sOnbNombreTmp=useState(""); var onbNombreTmp=sOnbNombreTmp[0]; var setOnbNombreTmp=sOnbNombreTmp[1];
  var sOnbNegocioTmp=useState(""); var onbNegocioTmp=sOnbNegocioTmp[0]; var setOnbNegocioTmp=sOnbNegocioTmp[1];
  var sOnbFlujoActivo=useState(null); var onbFlujoActivo=sOnbFlujoActivo[0]; var setOnbFlujoActivo=sOnbFlujoActivo[1];
  var sOnbSnapshot=useState(null); var onbSnapshot=sOnbSnapshot[0]; var setOnbSnapshot=sOnbSnapshot[1];
  var sResizeTick=useState(0); var setResizeTick=sResizeTick[1];
  var sOnbFlujoCompletado=useState(null); var onbFlujoCompletado=sOnbFlujoCompletado[0]; var setOnbFlujoCompletado=sOnbFlujoCompletado[1];
  var formPreguntoPVacio={nombre:"",negocio:"",canal:"",contacto:"",instagram:"",messenger:"",productoInteres:"",cantidadInteres:"1",notaAdicional:"",yaEnvio:null,monto:"",fechaEnvioPlaneada:"",fechaEnvioPlaneadaCustom:"",clienteExistenteId:""};
  var sFormPreguntoP=useState(formPreguntoPVacio); var formPreguntoP=sFormPreguntoP[0]; var setFormPreguntoP=sFormPreguntoP[1];
  function cerrarPreguntoP(){ setPasoPreguntoP(null); setFormPreguntoP(formPreguntoPVacio); }
  var sMostrarCatPreguntoP=useState(false); var mostrarCatPreguntoP=sMostrarCatPreguntoP[0]; var setMostrarCatPreguntoP=sMostrarCatPreguntoP[1];
  var sMostrarCoincidencias1P=useState(false); var mostrarCoincidencias1P=sMostrarCoincidencias1P[0]; var setMostrarCoincidencias1P=sMostrarCoincidencias1P[1];
  function guardarPreguntoP(overrides){
    var fp=Object.assign({},formPreguntoP,overrides||{});
    if(!fp.nombre.trim()) return;
    var digits=fp.canal==="WhatsApp"?fp.contacto.replace(/\D/g,""):fp.contacto;
    // Si el producto ya existe en el catálogo, usamos ese precio como referencia,
    // sin importar si todavía no se lo has enviado al cliente.
    var prodCatalogo=productosCat.find(function(p){ return p.nombre===fp.productoInteres; });
    var precioFinal=fp.monto?String(fp.monto):(prodCatalogo&&prodCatalogo.precio?String(prodCatalogo.precio):"");
    var estadoAuto=(fp.yaEnvio&&fp.monto)?"En seguimiento":"Nueva";
    var seguimientoFechaFinal=(!fp.yaEnvio)?resolverFechaPregunto(fp.fechaEnvioPlaneada,fp.fechaEnvioPlaneadaCustom):"";
    if(fp.clienteExistenteId){
      setClientes(clientes.map(function(c){
        if(c.id!==fp.clienteExistenteId) return c;
        return Object.assign({},c,{
          nombre:fp.nombre.trim(),negocio:fp.negocio||c.negocio,
          fechaEtapa:FECHA_HOY,etapa:"Nuevo contacto",estadoProspecto:estadoAuto,
          productoInteres:fp.productoInteres,precioInteres:precioFinal,cantidadInteres:fp.cantidadInteres||"1",
          notasProspecto:fp.notaAdicional,seguimientoFecha:seguimientoFechaFinal,ultimoContacto:FECHA_HOY
        });
      }));
      setFormPreguntoP(fp);
      setPasoPreguntoP(5);
      return;
    }
    var nuevoId=Date.now();
    setClientes([Object.assign({},formVacio,{
      id:nuevoId,
      nombre:fp.nombre.trim(),
      negocio:fp.negocio||"",
      origen:"",
      canalPrincipal:fp.canal||"WhatsApp",
      contacto:fp.canal==="WhatsApp"?(digits||""):"",
      instagram:fp.canal==="Instagram"?fp.instagram:"",
      messenger:fp.canal==="Facebook"?fp.messenger:"",
      fecha:FECHA_HOY,
      fechaEtapa:FECHA_HOY,
      etapa:"Nuevo contacto",
      estadoProspecto:estadoAuto,
      productoInteres:fp.productoInteres,
      precioInteres:precioFinal,
      cantidadInteres:fp.cantidadInteres||"1",
      notasProspecto:fp.notaAdicional,
      seguimientoFecha:seguimientoFechaFinal,
      ultimoContacto:FECHA_HOY,
    }),...clientes]);
    setFormPreguntoP(fp);
    setPasoPreguntoP(5);
  }
  var sModalEnvie=useState(false); var modalEnvie=sModalEnvie[0]; var setModalEnvie=sModalEnvie[1];
  var sFormEnvie=useState({busqueda:"",clienteId:null,concepto:"",monto:""}); var formEnvie=sFormEnvie[0]; var setFormEnvie=sFormEnvie[1];
  // Flujo independiente "Envié un precio" para PRODUCTOS
  var sModalEnvieP=useState(false); var modalEnvieP=sModalEnvieP[0]; var setModalEnvieP=sModalEnvieP[1];
  var sFormEnvieP=useState({busqueda:"",clienteId:null,concepto:"",cantidad:"1",monto:""}); var formEnvieP=sFormEnvieP[0]; var setFormEnvieP=sFormEnvieP[1];
  var sMostrarCatEnvieP=useState(false); var mostrarCatEnvieP=sMostrarCatEnvieP[0]; var setMostrarCatEnvieP=sMostrarCatEnvieP[1];
  function cerrarEnvieP(){ setModalEnvieP(false); setFormEnvieP({busqueda:"",clienteId:null,concepto:"",cantidad:"1",monto:""}); }
  function guardarEnvieP(){
    var fe=formEnvieP;
    var clienteId=fe.clienteId;
    if(!clienteId){
      clienteId=Date.now();
      var clienteFinalNuevo=Object.assign({},formVacio,{
        id:clienteId,nombre:fe.busqueda.trim(),negocio:"",contacto:"",origen:"",
        canalPrincipal:"WhatsApp",instagram:"",messenger:"",
        etapa:"Nuevo contacto",fecha:FECHA_HOY,fechaEtapa:FECHA_HOY,ultimoContacto:FECHA_HOY,
        estadoProspecto:"En seguimiento",productoInteres:fe.concepto,precioInteres:String(fe.monto),cantidadInteres:fe.cantidad||"1",notasProspecto:""
      });
      setClientes([clienteFinalNuevo,...clientes]);
      var conceptoTrimN=(fe.concepto||"").trim();
      if(conceptoTrimN&&!productosCat.some(function(p){ return p.nombre===conceptoTrimN; })){
        setProductosCat([...productosCat,{id:Date.now()+2,nombre:conceptoTrimN,precio:Number(fe.monto)||0,descripcion:"",condiciones:""}]);
      }
      if(!tieneContactoCompleto(clienteFinalNuevo)){ setClienteCompletarId(clienteId); } else { cerrarEnvieP(); }
    } else {
      var clienteExistente=clientes.find(function(c){ return c.id===clienteId; });
      var clienteFinalUpd=Object.assign({},clienteExistente,{
        estadoProspecto:"En seguimiento",fechaEtapa:FECHA_HOY,ultimoContacto:FECHA_HOY,
        productoInteres:fe.concepto,precioInteres:String(fe.monto),cantidadInteres:fe.cantidad||"1"
      });
      setClientes(clientes.map(function(c){ return c.id===clienteId?clienteFinalUpd:c; }));
      var conceptoTrimE=(fe.concepto||"").trim();
      if(conceptoTrimE&&!productosCat.some(function(p){ return p.nombre===conceptoTrimE; })){
        setProductosCat([...productosCat,{id:Date.now()+2,nombre:conceptoTrimE,precio:Number(fe.monto)||0,descripcion:"",condiciones:""}]);
      }
      if(!tieneContactoCompleto(clienteFinalUpd)){ setClienteCompletarId(clienteId); } else { cerrarEnvieP(); }
    }
  }
  var sModalCerre=useState(false); var modalCerre=sModalCerre[0]; var setModalCerre=sModalCerre[1];
  var sFormCerre=useState({busqueda:"",clienteId:null,mostrarForm:false,concepto:"",monto:"",tipoPago:"completo",anticipo:""}); var formCerre=sFormCerre[0]; var setFormCerre=sFormCerre[1];
  // Flujo independiente "Cerré una venta" para PRODUCTOS
  var sModalCerreP=useState(false); var modalCerreP=sModalCerreP[0]; var setModalCerreP=sModalCerreP[1];
  var formCerrePVacio={busqueda:"",clienteId:null,mostrarForm:false,concepto:"",cantidad:"1",monto:"",tipoPago:"completo",anticipo:""};
  var sFormCerreP=useState(formCerrePVacio); var formCerreP=sFormCerreP[0]; var setFormCerreP=sFormCerreP[1];
  var sMostrarCatCerreP=useState(false); var mostrarCatCerreP=sMostrarCatCerreP[0]; var setMostrarCatCerreP=sMostrarCatCerreP[1];
  var sCerrePExito=useState(false); var cerrePExito=sCerrePExito[0]; var setCerrePExito=sCerrePExito[1];
  function cerrarCerreP(){ setModalCerreP(false); setFormCerreP(formCerrePVacio); setClienteCompletarId(null); setFormCompletar({canal:"",contacto:"",instagram:"",messenger:""}); setCerrePExito(false); }
  function crearPedidoDesdeVenta(clienteId,producto,cantidad,monto,tipoPago,anticipo){
    var nuevoPed={
      id:"ped_"+Date.now(),clienteId:clienteId,productos:producto||"Producto",
      cantidad:Number(cantidad)||1,total:Number(monto),
      pagos:tipoPago==="completo"
        ?[{id:"p_"+Date.now(),monto:Number(monto),fecha:FECHA_HOY,concepto:"Pago completo"}]
        :tipoPago==="anticipo"&&anticipo
        ?[{id:"p_"+Date.now(),monto:Number(anticipo),fecha:FECHA_HOY,concepto:"Anticipo"}]
        :[],
      estadoPedido:"preparando",notas:"",fecha:FECHA_HOY,fechaCreado:new Date().toISOString()
    };
    setPedidos([nuevoPed,...pedidos]);
    var conceptoTrim=(producto||"").trim();
    if(conceptoTrim&&!productosCat.some(function(p){ return p.nombre===conceptoTrim; })){
      setProductosCat([...productosCat,{id:Date.now()+2,nombre:conceptoTrim,precio:Number(monto)||0,descripcion:"",condiciones:""}]);
    }
  }
  function guardarCerreP(){
    var fc=formCerreP;
    var clienteId=fc.clienteId;
    var clienteFinal=null;
    if(!clienteId&&fc.busqueda.trim()){
      clienteId=Date.now();
      clienteFinal=Object.assign({},formVacio,{
        id:clienteId,nombre:fc.busqueda.trim(),negocio:"",contacto:"",origen:"",
        canalPrincipal:"WhatsApp",instagram:"",messenger:"",
        etapa:"Ganado",fecha:FECHA_HOY,fechaEtapa:FECHA_HOY,ultimoContacto:FECHA_HOY,
        estadoProspecto:"Convertido",fechaPedido:new Date().toISOString()
      });
      setClientes([clienteFinal,...clientes]);
    } else if(clienteId){
      clienteFinal=Object.assign({},clientes.find(function(c){ return c.id===clienteId; }),{etapa:"Ganado",fechaEtapa:FECHA_HOY,ultimoContacto:FECHA_HOY,estadoProspecto:"Convertido",fechaPedido:new Date().toISOString()});
      setClientes(clientes.map(function(c){ return c.id===clienteId?clienteFinal:c; }));
    }
    crearPedidoDesdeVenta(clienteId,fc.concepto,fc.cantidad,fc.monto,fc.tipoPago,fc.anticipo);
    if(clienteFinal&&!tieneContactoCompleto(clienteFinal)){ setClienteCompletarId(clienteId); }
    else { if(clienteFinal&&!clienteFinal.origen) setOrigenPromptId(clienteId); setCerrePExito(true); }
  }
  var sModalRecibi=useState(false); var modalRecibi=sModalRecibi[0]; var setModalRecibi=sModalRecibi[1];
  var sFiltroTrabajo=useState("porCompletar"); var filtroTrabajo=sFiltroTrabajo[0]; var setFiltroTrabajo=sFiltroTrabajo[1];
  var sCerreExito=useState(false); var cerreExito=sCerreExito[0]; var setCerreExito=sCerreExito[1];
  var sToastTrabajo=useState(""); var toastTrabajo=sToastTrabajo[0]; var setToastTrabajo=sToastTrabajo[1];
  function mostrarToast(mensaje){
    setToastTrabajo(mensaje);
    setTimeout(function(){ setToastTrabajo(""); },3500);
  }
  function mostrarToastTrabajo(){ mostrarToast("Ya quedó en tu pestaña Trabajos, para que no se te olvide entregarlo."); }
  var sMostrarCatEnvie=useState(false); var mostrarCatEnvie=sMostrarCatEnvie[0]; var setMostrarCatEnvie=sMostrarCatEnvie[1];
  var sMostrarCatCerre=useState(false); var mostrarCatCerre=sMostrarCatCerre[0]; var setMostrarCatCerre=sMostrarCatCerre[1];
  var sMostrarCatPregunto=useState(false); var mostrarCatPregunto=sMostrarCatPregunto[0]; var setMostrarCatPregunto=sMostrarCatPregunto[1];
  var sMostrarCoincidencias1=useState(false); var mostrarCoincidencias1=sMostrarCoincidencias1[0]; var setMostrarCoincidencias1=sMostrarCoincidencias1[1];
  var sMandoPrecioForm=useState({concepto:"",monto:""}); var mandoPrecioForm=sMandoPrecioForm[0]; var setMandoPrecioForm=sMandoPrecioForm[1];
  var sMostrarCatMandoPrecio=useState(false); var mostrarCatMandoPrecio=sMostrarCatMandoPrecio[0]; var setMostrarCatMandoPrecio=sMostrarCatMandoPrecio[1];
  var sReconocimientoCerrado=useState(""); var reconocimientoCerrado=sReconocimientoCerrado[0]; var setReconocimientoCerrado=sReconocimientoCerrado[1];
  var sBusquedaRecibi=useState(""); var busquedaRecibi=sBusquedaRecibi[0]; var setBusquedaRecibi=sBusquedaRecibi[1];
  function cerrarRecibi(){ setModalRecibi(false); setBusquedaRecibi(""); }
  // Flujo independiente "Recibí un pago" para PRODUCTOS
  var sModalRecibiP=useState(false); var modalRecibiP=sModalRecibiP[0]; var setModalRecibiP=sModalRecibiP[1];
  var sBusquedaRecibiP=useState(""); var busquedaRecibiP=sBusquedaRecibiP[0]; var setBusquedaRecibiP=sBusquedaRecibiP[1];
  function cerrarRecibiP(){ setModalRecibiP(false); setBusquedaRecibiP(""); }
  function obtenerPedidosConSaldo(){
    return pedidos.filter(function(p){
      if(p.estadoPedido==="cancelado") return false;
      var pagado=(p.pagos||[]).reduce(function(s,pg){ return s+Number(pg.monto); },0);
      return Number(p.total||0)>pagado;
    }).map(function(p){
      var cl=clientes.find(function(c){ return c.id===p.clienteId; });
      var pagado=(p.pagos||[]).reduce(function(s,pg){ return s+Number(pg.monto); },0);
      return {cliente:cl,ped:p,saldo:Number(p.total||0)-pagado};
    }).filter(function(x){ return x.cliente; }).sort(function(a,b){ return new Date(b.ped.fecha)-new Date(a.ped.fecha); });
  }
  function cerrarCerre(){ setModalCerre(false); setFormCerre({busqueda:"",clienteId:null,mostrarForm:false,concepto:"",monto:"",tipoPago:"completo",anticipo:""}); setClienteCompletarId(null); setFormCompletar({canal:"",contacto:"",instagram:"",messenger:""}); setCerreExito(false); }
  function formatearFechaLarga(fechaStr){
    if(!fechaStr) return "";
    var MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    var d=new Date(fechaStr+"T00:00:00");
    return d.getDate()+" de "+MESES[d.getMonth()];
  }
  function obtenerTrabajos(){
    var deCotizaciones=cotizaciones.filter(function(c){ return c.estatus==="Aceptada"; }).map(function(c){
      var cl=clientes.find(function(x){ return x.id===c.clienteId; });
      var pagado=(c.pagos||[]).reduce(function(s,p){ return s+Number(p.monto); },0);
      return {tipo:"cotizacion",id:c.id,cliente:cl,servicio:c.concepto,total:Number(c.monto),cobrado:pagado,entregado:!!c.entregado,fechaEntrega:c.fechaEntrega||"",fecha:c.fechaCierre||c.fecha};
    });
    var deVentas=ventas.filter(function(v){ return v.clienteId&&v.entregado!==undefined; }).map(function(v){
      var cl=clientes.find(function(x){ return x.id===v.clienteId; });
      var pagado=v.tipoPago==="anticipo"?(v.pagos||[]).reduce(function(s,p){ return s+Number(p.monto); },0):Number(v.monto);
      return {tipo:"venta",id:v.id,cliente:cl,servicio:v.concepto,total:Number(v.monto),cobrado:pagado,entregado:!!v.entregado,fechaEntrega:v.fechaEntrega||"",fecha:v.fecha};
    });
    return deCotizaciones.concat(deVentas).filter(function(t){ return t.cliente; }).sort(function(a,b){ return new Date(b.fecha)-new Date(a.fecha); });
  }
  function marcarTrabajoCompletado(trabajo){
    if(trabajo.tipo==="cotizacion"){
      setCotizaciones(cotizaciones.map(function(c){ return c.id===trabajo.id?Object.assign({},c,{entregado:true}):c; }));
    } else {
      setVentas(ventas.map(function(v){ return v.id===trabajo.id?Object.assign({},v,{entregado:true}):v; }));
    }
    var saldoTrabajo=trabajo.total-trabajo.cobrado;
    var nombreCortoTrabajo=trabajo.cliente.nombre.split(" ")[0];
    if(saldoTrabajo>0){
      mostrarToast("✓ Marcado como entregado. Todavía faltan $"+saldoTrabajo.toLocaleString()+" por cobrarle a "+nombreCortoTrabajo+" — no se te vaya a pasar.");
    } else {
      mostrarToast("✓ "+nombreCortoTrabajo+" — trabajo entregado y cobrado. Uno menos, bien hecho.");
    }
  }
  function actualizarFechaEntrega(trabajo,nuevaFecha){
    if(trabajo.tipo==="cotizacion"){
      setCotizaciones(cotizaciones.map(function(c){ return c.id===trabajo.id?Object.assign({},c,{fechaEntrega:nuevaFecha}):c; }));
    } else {
      setVentas(ventas.map(function(v){ return v.id===trabajo.id?Object.assign({},v,{fechaEntrega:nuevaFecha}):v; }));
    }
  }
  function guardarCerre(){
    var fc=formCerre;
    var clienteId=fc.clienteId;
    var clienteFinal=null;
    if(!clienteId&&fc.busqueda.trim()){
      clienteId=Date.now();
      clienteFinal={
        id:clienteId,nombre:fc.busqueda.trim(),negocio:"",contacto:"",origen:"",
        canalPrincipal:"WhatsApp",instagram:"",messenger:"",email:"",
        etapa:"Ganado",fecha:FECHA_HOY,fechaEtapa:FECHA_HOY,ultimoContacto:FECHA_HOY,
        notas:"",seguimientoFecha:"",motivoPerdida:""
      };
      setClientes([clienteFinal,...clientes]);
    } else if(clienteId){
      clienteFinal=Object.assign({},clientes.find(function(c){ return c.id===clienteId; }),{etapa:"Ganado",fechaEtapa:FECHA_HOY,ultimoContacto:FECHA_HOY});
      setClientes(clientes.map(function(c){ return c.id===clienteId?clienteFinal:c; }));
    }
    var nuevaVenta={
      id:Date.now()+1,monto:Number(fc.monto),fecha:FECHA_HOY,concepto:fc.concepto||"Venta",
      tipo:clienteId?"especifico":"dia",clienteId:clienteId||null,
      tipoPago:fc.tipoPago,anticipo:fc.tipoPago==="anticipo"&&fc.anticipo?Number(fc.anticipo):0,
      pagos:fc.tipoPago==="completo"
        ?[{id:"p_"+Date.now(),monto:Number(fc.monto),fecha:FECHA_HOY,concepto:"Pago completo"}]
        :fc.tipoPago==="anticipo"&&fc.anticipo
        ?[{id:"p_"+Date.now(),monto:Number(fc.anticipo),fecha:FECHA_HOY,concepto:"Anticipo"}]
        :[],
      entregado:clienteId?false:undefined,fechaEntrega:""
    };
    setVentas([nuevaVenta,...ventas]);
    if(clienteFinal&&!tieneContactoCompleto(clienteFinal)){ setClienteCompletarId(clienteId); }
    else { if(clienteFinal&&!clienteFinal.origen) setOrigenPromptId(clienteId); setCerreExito(true); }
  }
  function cerrarEnvie(){ setModalEnvie(false); setFormEnvie({busqueda:"",clienteId:null,concepto:"",monto:""}); setClienteCompletarId(null); setFormCompletar({canal:"",contacto:"",instagram:"",messenger:""}); }
  var sClienteCompletarId=useState(null); var clienteCompletarId=sClienteCompletarId[0]; var setClienteCompletarId=sClienteCompletarId[1];
  var sOrigenPromptId=useState(null); var origenPromptId=sOrigenPromptId[0]; var setOrigenPromptId=sOrigenPromptId[1];
  var ORIGENES_PROMPT=["Instagram","Facebook","WhatsApp","Referido","TikTok"];
  function guardarOrigenPrompt(clienteId,origenElegido){
    setClientes(clientes.map(function(c){ return c.id===clienteId?Object.assign({},c,{origen:origenElegido}):c; }));
    setOrigenPromptId(null);
  }
  function omitirOrigenPrompt(){ setOrigenPromptId(null); }
  var sFormCompletar=useState({canal:"",contacto:"",instagram:"",messenger:""}); var formCompletar=sFormCompletar[0]; var setFormCompletar=sFormCompletar[1];
  function tieneContactoCompleto(c){
    if(!c) return false;
    if(c.canalPrincipal==="WhatsApp") return !!c.contacto;
    if(c.canalPrincipal==="Instagram") return !!c.instagram;
    if(c.canalPrincipal==="Facebook") return !!c.messenger;
    return false;
  }
  function guardarCompletarContacto(clienteId){
    var fc=formCompletar;
    setClientes(clientes.map(function(c){
      if(c.id!==clienteId) return c;
      return Object.assign({},c,{
        canalPrincipal:fc.canal||c.canalPrincipal,
        contacto:fc.canal==="WhatsApp"?fc.contacto:c.contacto,
        instagram:fc.canal==="Instagram"?fc.instagram:c.instagram,
        messenger:fc.canal==="Facebook"?fc.messenger:c.messenger
      });
    }));
    setClienteCompletarId(null);
    setFormCompletar({canal:"",contacto:"",instagram:"",messenger:""});
  }
  function omitirCompletarContacto(){ setClienteCompletarId(null); setFormCompletar({canal:"",contacto:"",instagram:"",messenger:""}); }
  function puedeGuardarCompletar(){
    var fc=formCompletar;
    return !!(fc.canal&&(fc.canal==="WhatsApp"?(fc.contacto&&fc.contacto.length===10):fc.canal==="Instagram"?fc.instagram:fc.messenger));
  }
  function renderCompletarContacto(){
    var fc=formCompletar;
    return e("div",null,
      e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:12}},
        CANALES.map(function(canal){
          var cc=canalColor(canal);
          var activo=fc.canal===canal;
          return e("button",{key:canal,style:{cursor:"pointer",padding:"9px 6px",borderRadius:10,border:"1.5px solid "+(activo?cc:C.border),background:activo?cc+"18":"transparent",fontSize:12,color:activo?cc:C.textMuted,fontWeight:activo?600:400,display:"flex",flexDirection:"column",alignItems:"center",gap:4},onClick:function(){ setFormCompletar(Object.assign({},fc,{canal:canal})); }},
            e(SvgIcon,{canal:canal,size:15}),canal
          );
        })
      ),
      fc.canal==="WhatsApp"&&e("input",{value:fc.contacto,onChange:function(ev){ var v=ev.target.value.replace(/\D/g,"").slice(0,10); setFormCompletar(Object.assign({},fc,{contacto:v})); },placeholder:"Número de WhatsApp",style:Object.assign({},st.inp,{marginBottom:12}),maxLength:10,inputMode:"numeric"}),
      fc.canal==="Instagram"&&e("input",{value:fc.instagram,onChange:function(ev){ setFormCompletar(Object.assign({},fc,{instagram:ev.target.value})); },placeholder:"@usuario",style:Object.assign({},st.inp,{marginBottom:12})}),
      fc.canal==="Facebook"&&e("input",{value:fc.messenger,onChange:function(ev){ setFormCompletar(Object.assign({},fc,{messenger:ev.target.value})); },placeholder:"Nombre, usuario o enlace del perfil",style:Object.assign({},st.inp,{marginBottom:12})})
    );
  }
  function guardarEnvie(){
    var fe=formEnvie;
    var clienteId=fe.clienteId;
    var seguimientoAuto=resolverFechaPregunto("2dias","");
    var clienteFinal;
    if(!clienteId){
      clienteId=Date.now();
      clienteFinal={
        id:clienteId,nombre:fe.busqueda.trim(),negocio:"",contacto:"",origen:"",
        canalPrincipal:"WhatsApp",instagram:"",messenger:"",email:"",
        etapa:"Cotizacion enviada",fecha:FECHA_HOY,fechaEtapa:FECHA_HOY,ultimoContacto:FECHA_HOY,
        notas:fe.concepto,seguimientoFecha:seguimientoAuto,motivoPerdida:""
      };
      setClientes([clienteFinal,...clientes]);
    } else {
      clienteFinal=Object.assign({},clientes.find(function(c){ return c.id===clienteId; }),{etapa:"Cotizacion enviada",fechaEtapa:FECHA_HOY,ultimoContacto:FECHA_HOY,seguimientoFecha:seguimientoAuto});
      setClientes(clientes.map(function(c){ return c.id===clienteId?clienteFinal:c; }));
    }
    var nuevaCot={
      id:Date.now()+1,clienteId:clienteId,concepto:fe.concepto||"Servicio",
      cantidad:1,precioUnit:Number(fe.monto),monto:Number(fe.monto),estatus:"Pendiente",
      fecha:FECHA_HOY,motivoPerdida:"",vigencia:"",vigenciaDias:"",
      notas:"",anticipo:0,fechaAnticipo:"",pagos:[]
    };
    setCotizaciones([nuevaCot,...cotizaciones]);
    // Si el servicio no está en el catálogo, se agrega solo, sin preguntar
    var conceptoTrim=(fe.concepto||"").trim();
    if(conceptoTrim&&!servicios.some(function(sv){ return sv.nombre===conceptoTrim; })){
      setServicios([...servicios,{id:Date.now()+2,nombre:conceptoTrim,precio:Number(fe.monto)||0,descripcion:"",condiciones:""}]);
    }
    if(!tieneContactoCompleto(clienteFinal)){ setClienteCompletarId(clienteId); }
    else { if(!clienteFinal.origen) setOrigenPromptId(clienteId); cerrarEnvie(); }
  }
  var sFormPregunto=useState({nombre:"",negocio:"",canal:"",contacto:"",instagram:"",messenger:"",servicioInteres:"",notaAdicional:"",yaEnvio:null,monto:"",fechaEnvio:"hoy",fechaEnvioCustom:"",fechaSeguimiento:"",fechaSeguimientoCustom:"",fechaEnvioPlaneada:"",fechaEnvioPlaneadaCustom:"",clienteExistenteId:null});
  var formPregunto=sFormPregunto[0]; var setFormPregunto=sFormPregunto[1];
  function cerrarPregunto(){ setPasoPregunto(null); setFormPregunto({nombre:"",negocio:"",canal:"",contacto:"",instagram:"",messenger:"",servicioInteres:"",notaAdicional:"",yaEnvio:null,monto:"",fechaEnvio:"hoy",fechaEnvioCustom:"",fechaSeguimiento:"",fechaSeguimientoCustom:"",fechaEnvioPlaneada:"",fechaEnvioPlaneadaCustom:"",clienteExistenteId:null}); }
  function formatFechaLocal(d){
    var y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),dd=String(d.getDate()).padStart(2,"0");
    return y+"-"+m+"-"+dd;
  }
  function resolverFechaPregunto(opcion,custom){
    if(opcion==="elegir") return custom||FECHA_HOY;
    var d=new Date();
    if(opcion==="hoy") return FECHA_HOY;
    if(opcion==="ayer"){ d.setDate(d.getDate()-1); return formatFechaLocal(d); }
    if(opcion==="manana"){ d.setDate(d.getDate()+1); return formatFechaLocal(d); }
    if(opcion==="2dias"){ d.setDate(d.getDate()+2); return formatFechaLocal(d); }
    if(opcion==="3dias"){ d.setDate(d.getDate()+3); return formatFechaLocal(d); }
    return "";
  }
  function guardarPregunto(){
    var fp=formPregunto;
    var esExistente=!!fp.clienteExistenteId;
    var nuevoId=esExistente?fp.clienteExistenteId:Date.now();
    var fechaEnvioReal=fp.yaEnvio?resolverFechaPregunto(fp.fechaEnvio,fp.fechaEnvioCustom):"";
    var etapaFinal=fp.yaEnvio?"Cotizacion enviada":"Nuevo contacto";
    var seguimientoFechaFinal=fp.yaEnvio
      ?resolverFechaPregunto(fp.fechaSeguimiento,fp.fechaSeguimientoCustom)
      :resolverFechaPregunto(fp.fechaEnvioPlaneada,fp.fechaEnvioPlaneadaCustom);
    if(esExistente){
      setClientes(clientes.map(function(c){
        if(c.id!==nuevoId) return c;
        return Object.assign({},c,{
          negocio:fp.negocio||c.negocio,
          canalPrincipal:fp.canal||c.canalPrincipal,
          contacto:fp.canal==="WhatsApp"?fp.contacto:c.contacto,
          instagram:fp.canal==="Instagram"?fp.instagram:c.instagram,
          messenger:fp.canal==="Facebook"?fp.messenger:c.messenger,
          etapa:etapaFinal,fechaEtapa:FECHA_HOY,ultimoContacto:FECHA_HOY,
          servicioInteres:fp.servicioInteres,
          notas:fp.notaAdicional,
          seguimientoFecha:seguimientoFechaFinal
        });
      }));
    } else {
      var nuevoCliente={
        id:nuevoId,nombre:fp.nombre,negocio:fp.negocio,
        contacto:fp.canal==="WhatsApp"?fp.contacto:"",
        origen:"",canalPrincipal:fp.canal||"WhatsApp",
        instagram:fp.canal==="Instagram"?fp.instagram:"",
        messenger:fp.canal==="Facebook"?fp.messenger:"",
        email:"",etapa:etapaFinal,fecha:FECHA_HOY,fechaEtapa:FECHA_HOY,ultimoContacto:FECHA_HOY,
        servicioInteres:fp.servicioInteres,
        notas:fp.notaAdicional,
        seguimientoFecha:seguimientoFechaFinal,motivoPerdida:""
      };
      setClientes([nuevoCliente,...clientes]);
    }
    if(fp.yaEnvio&&fp.monto){
      var nuevaCot={
        id:Date.now()+1,clienteId:nuevoId,concepto:fp.servicioInteres||"Servicio",
        cantidad:1,precioUnit:Number(fp.monto),monto:Number(fp.monto),estatus:"Pendiente",
        fecha:fechaEnvioReal||FECHA_HOY,motivoPerdida:"",vigencia:"",vigenciaDias:"",
        notas:"",anticipo:0,fechaAnticipo:"",pagos:[]
      };
      setCotizaciones([nuevaCot,...cotizaciones]);
    }
    var clienteParaOrigen=esExistente?clientes.find(function(c){ return c.id===nuevoId; }):null;
    var yaTieneOrigen=esExistente?!!(clienteParaOrigen&&clienteParaOrigen.origen):false;
    if(!yaTieneOrigen){ setOrigenPromptId(nuevoId); }
    setPasoPregunto(5);
  }
  var s19i=useState(null); var contactadoOpcion=s19i[0]; var setContactadoOpcion=s19i[1];
  var s19j=useState(""); var contactadoNota=s19j[0]; var setContactadoNota=s19j[1];
  var s19k=useState(null); var contactadoDias=s19k[0]; var setContactadoDias=s19k[1];
  var s19l=useState(null); var contactadoResult=s19l[0]; var setContactadoResult=s19l[1];
  var s19i=useState(1); var pasoGanado=s19i[0]; var setPasoGanado=s19i[1];
  var s19q=useState([]); var razonCierre=s19q[0]; var setRazonCierre=s19q[1];
  var s19r=useState(null); var estatusAnteriorCot=s19r[0]; var setEstatusAnteriorCot=s19r[1];
  var s19k=useState(null); var pagosModalId=s19k[0]; var setPagosModalId=s19k[1];
  var sPagosModalTipo=useState("cotizacion"); var pagosModalTipo=sPagosModalTipo[0]; var setPagosModalTipo=sPagosModalTipo[1];
  var s19l=useState({monto:"",fecha:FECHA_HOY,concepto:"Anticipo"}); var formPago=s19l[0]; var setFormPago=s19l[1];
  var s19m=useState(null); var cotRapidaId=s19m[0]; var setCotRapidaId=s19m[1];
  var s19n=useState(function(){ try{ return JSON.parse(localStorage.getItem("cleo_etapas_vistas")||"[]"); }catch(e){ return []; } }); var etapasVistas=s19n[0]; var setEtapasVistas=s19n[1];
  var s19o=useState(null); var modalEtapa=s19o[0]; var setModalEtapa=s19o[1];
  var s19p=useState(null); var etapaPendiente=s19p[0]; var setEtapaPendiente=s19p[1];
  var s19j=useState({tipo:"",monto:"",fecha:FECHA_HOY}); var pagoGanado=s19j[0]; var setPagoGanado=s19j[1];

  // Estados de drag and drop
  var s20=useState(null); var dragging=s20[0]; var setDragging=s20[1];
  var s21=useState(null); var dragOver=s21[0]; var setDragOver=s21[1];

  // Estados de anticipo
  var s22=useState(null); var anticCotId=s22[0]; var setAnticCotId=s22[1];
  var s23=useState({monto:"",fecha:FECHA_HOY}); var anticVal=s23[0]; var setAnticVal=s23[1];

  // Estados de motivo perdida pipeline
  var s24=useState(null); var motivoPipelineId=s24[0]; var setMotivoPipelineId=s24[1];
  var s24b=useState(null); var etapaAnteriorPipeline=s24b[0]; var setEtapaAnteriorPipeline=s24b[1];
  var s24c=useState(null); var etapaAnteriorGanado=s24c[0]; var setEtapaAnteriorGanado=s24c[1];
  var s24d=useState(null); var modalVentaRapidaPipeline=s24d[0]; var setModalVentaRapidaPipeline=s24d[1];
  var s24e=useState(null); var pagoVentaData=s24e[0]; var setPagoVentaData=s24e[1];
  var s24f=useState({monto:"",fecha:FECHA_HOY,concepto:"Pago"}); var formPagoVenta=s24f[0]; var setFormPagoVenta=s24f[1];

  function abrirPagoVenta(v){ setPagoVentaData(v); setFormPagoVenta({monto:"",fecha:FECHA_HOY,concepto:"Pago"}); }
  function guardarPagoVenta(){
    if(!formPagoVenta.monto||!pagoVentaData) return;
    var nuevosPagos=[...(pagoVentaData.pagos||[]),{id:"pv_"+Date.now(),monto:Number(formPagoVenta.monto),fecha:formPagoVenta.fecha,concepto:formPagoVenta.concepto||"Pago"}];
    setVentas(ventas.map(function(v){ return v.id===pagoVentaData.id?Object.assign({},v,{pagos:nuevosPagos}):v; }));
    setPagoVentaData(null);
  }
  function generarComprobanteVenta(v,cl){
    generarComprobanteGeneral({id:v.id,concepto:v.concepto||"Venta directa",monto:v.monto,pagos:v.pagos||[]},cl||{nombre:"Cliente"},perfil);
  }
  var s25=useState(null); var consejoMotivo=s25[0]; var setConsejoMotivo=s25[1];
  var s26=useState(false); var showSeguimientoLost=s26[0]; var setShowSeguimientoLost=s26[1];
  var s26b=useState(null); var clientePerdidoId=s26b[0]; var setClientePerdidoId=s26b[1];
  var s27=useState({dias:"",custom:""}); var seguimientoLost=s27[0]; var setSeguimientoLost=s27[1];
  var s28=useState(""); var motivoLibre=s28[0]; var setMotivoLibre=s28[1];
  var s29=useState(false); var showMotivoLibre=s29[0]; var setShowMotivoLibre=s29[1];

  // Estados de seguimiento ganados
  var s30=useState(null); var seguimientoClienteId=s30[0]; var setSeguimientoClienteId=s30[1];
  var s31=useState(""); var seguimientoDias=s31[0]; var setSeguimientoDias=s31[1];

  // Estados de carpeta cliente
  var s32=useState(null); var clienteAbierto=s32[0]; var setClienteAbierto=s32[1];
  var s33=useState("perfil"); var tabCliente=s33[0]; var setTabCliente=s33[1];

  // Alertas cerradas
  var s34=useState(function(){ try{ return JSON.parse(localStorage.getItem("cleo_alertas_cerradas")||"[]"); }catch(e){ return []; } }); var alertasCerradas=s34[0]; var setAlertasCerradas=s34[1];
  var s35=useState(false); var mostrarArchivados=s35[0]; var setMostrarArchivados=s35[1];

  // Estados de prospectos (modo productos)
  var sProsp=useState(false); var modalProspecto=sProsp[0]; var setModalProspecto=sProsp[1];
  var sProspForm=useState({clienteId:"",nuevoNombre:"",productoInteres:"",notas:""}); var formProspecto=sProspForm[0]; var setFormProspecto=sProspForm[1];
  var sProspBusca=useState(""); var buscaProspecto=sProspBusca[0]; var setBuscaProspecto=sProspBusca[1];
  var sProspFiltro=useState("activas"); var filtroProspecto=sProspFiltro[0]; var setFiltroProspecto=sProspFiltro[1];
  var sBuscaCliOpo=useState(""); var buscaCliOpo=sBuscaCliOpo[0]; var setBuscaCliOpo=sBuscaCliOpo[1];

  // Estados de edición inline de oportunidades
  var sEditOpo=useState(null); var editandoOpoId=sEditOpo[0]; var setEditandoOpoId=sEditOpo[1];
  var sEditOpoForm=useState({}); var editOpoForm=sEditOpoForm[0]; var setEditOpoForm=sEditOpoForm[1];
  var sConfirmPedido=useState(null); var confirmPedidoData=sConfirmPedido[0]; var setConfirmPedidoData=sConfirmPedido[1];

  // Estados de pedidos (modo productos)
  var sPedidos=useState(function(){ return lsGet("cleo_pedidos",[]); }); var pedidos=sPedidos[0]; var setPedidosRaw=sPedidos[1];
  function setPedidos(v){ setPedidosRaw(v); try{ localStorage.setItem("cleo_pedidos",JSON.stringify(v)); }catch(e){} }
  var sPedFiltro=useState("todos"); var filtroPedido=sPedFiltro[0]; var setFiltroPedido=sPedFiltro[1];
  var sPedFiltroPeriodo=useState("todo"); var filtroPedidoPeriodo=sPedFiltroPeriodo[0]; var setFiltroPedidoPeriodo=sPedFiltroPeriodo[1];
  var sPedFiltroSaldo=useState("todos"); var filtroPedidoSaldo=sPedFiltroSaldo[0]; var setFiltroPedidoSaldo=sPedFiltroSaldo[1];
  var sPedModal=useState(null); var pedidoPagosId=sPedModal[0]; var setPedidoPagosId=sPedModal[1];
  var sPedFormPago=useState({monto:"",fecha:FECHA_HOY,concepto:"Anticipo"}); var formPagoPedido=sPedFormPago[0]; var setFormPagoPedido=sPedFormPago[1];
  var sPedFormPagoModal=useState({monto:"",fecha:FECHA_HOY,concepto:"Anticipo"}); var formPagoPedidoModal=sPedFormPagoModal[0]; var setFormPagoPedidoModal=sPedFormPagoModal[1];
  var sPedEdit=useState(null); var pedidoEditando=sPedEdit[0]; var setPedidoEditando=sPedEdit[1];
  var sNuevoPedidoModal=useState(false); var nuevoPedidoModal=sNuevoPedidoModal[0]; var setNuevoPedidoModal=sNuevoPedidoModal[1];
  var sNuevoPedidoForm=useState({}); var nuevoPedidoForm=sNuevoPedidoForm[0]; var setNuevoPedidoForm=sNuevoPedidoForm[1];
  var sBuscaCliPed=useState(""); var buscaCliPed=sBuscaCliPed[0]; var setBuscaCliPed=sBuscaCliPed[1];
  var sGuardarProdOpo=useState(null); var guardarProdOpo=sGuardarProdOpo[0]; var setGuardarProdOpo=sGuardarProdOpo[1];

  // Estados celebración productos
  var sCelebPedido=useState(null); var celebPedidoData=sCelebPedido[0]; var setCelebPedidoData=sCelebPedido[1];
  var sCelebEntregado=useState(null); var celebEntregadoData=sCelebEntregado[0]; var setCelebEntregadoData=sCelebEntregado[1];
  var sCelebPaso=useState(1); var celebPaso=sCelebPaso[0]; var setCelebPaso=sCelebPaso[1];
  var sCelebRazon=useState([]); var celebRazon=sCelebRazon[0]; var setCelebRazon=sCelebRazon[1];
  var sCelebRecontacto=useState("30"); var celebRecontacto=sCelebRecontacto[0]; var setCelebRecontacto=sCelebRecontacto[1];

  // Estado menú +Nuevo (modo productos)
  var sMenuNuevo=useState(false); var menuNuevo=sMenuNuevo[0]; var setMenuNuevo=sMenuNuevo[1];

  // Estado filtros Ventas (modo productos)
  var sVPFiltro=useState({periodo:"mes",origen:"todos",busqueda:""}); var filtroVP=sVPFiltro[0]; var setFiltroVP=sVPFiltro[1];

  function setClientes(v){ setClientesRaw(v); try{ localStorage.setItem("cleo_clientes",JSON.stringify(v)); }catch(e){} }
  function setCotizaciones(v){ var m=migrarCots(v); setCotizacionesRaw(m); try{ localStorage.setItem("cleo_cots",JSON.stringify(m)); }catch(e){} }
  function setPerfil(v){ 
    setPerfilRaw(v); 
    setFormPerfil(v); 
    try{ 
      localStorage.setItem("cleo_perfil",JSON.stringify(v)); 
      if(v.tipoPerfil) localStorage.setItem("cleo_tipo_perfil",v.tipoPerfil);
    }catch(e){} 
  }
  function setServicios(v){ setServiciosRaw(v); try{ localStorage.setItem("cleo_servicios",JSON.stringify(v)); }catch(e){} }
  function setVentas(v){ setVentasRaw(v); try{ localStorage.setItem("cleo_ventas",JSON.stringify(v)); }catch(e){} }
  function setProductos(v){ setProductosRaw(v); try{ localStorage.setItem("cleo_productos",JSON.stringify(v)); }catch(e){} }

  // Aprender producto nuevo al guardar venta
  function aprenderProducto(concepto){
    if(!concepto||!concepto.trim()) return;
    var nombre=concepto.trim();
    if(productos.indexOf(nombre)<0){
      var nuevos=[nombre,...productos];
      setProductos(nuevos);
    }
  }

  function alertaCerrada(key){ return alertasCerradas.indexOf(key)>=0; }
  function cerrarAlerta(key){ setAlertasCerradas(function(prev){ var n=prev.concat([key]); try{ localStorage.setItem("cleo_alertas_cerradas",JSON.stringify(n)); }catch(e){} return n; }); }

  var clientesFiltrados=[...clientes].filter(function(c){ return c.nombre.toLowerCase().includes(busqueda.toLowerCase())||c.negocio.toLowerCase().includes(busqueda.toLowerCase()); }).sort(function(a,b){ return a.nombre.localeCompare(b.nombre,"es"); });

  // Auto-sync: si una cotizacion esta Aceptada y el cliente no esta en Ganado, moverlo
  React.useEffect(function(){
    var needsUpdate=false;
    var updated=clientes.map(function(c){
      if(c.etapa==="Ganado"||c.etapa==="Perdido") return c;
      var cotAcep=cotizaciones.find(function(cot){ return cot.clienteId===c.id&&cot.estatus==="Aceptada"; });
      if(cotAcep){ needsUpdate=true; return Object.assign({},c,{etapa:"Ganado",fechaEtapa:c.fechaEtapa||FECHA_HOY}); }
      return c;
    });
    if(needsUpdate) setClientesRaw(updated);
  },[cotizaciones]);
  var cotsPeriodo=useMemo(function(){ return cotizaciones.filter(function(c){ var fechaRef=c.estatus==="Aceptada"&&c.fechaCierre?c.fechaCierre:c.fecha; return enPeriodo(fechaRef,periodo); }); },[cotizaciones,periodo]);
  var sinMovimiento=clientes.filter(function(c){ return diasDesde(c.fecha)>=5&&c.etapa!=="Ganado"&&c.etapa!=="Perdido"; });
  var diasSinRegistrar=clientes.length>0?diasDesde([...clientes].sort(function(a,b){ return new Date(b.fecha)-new Date(a.fecha); })[0].fecha):0;
  var cotsMes=cotizaciones.filter(function(c){ return enPeriodo(c.fecha,"mes"); });
  var tasaCierre=cotsMes.length?Math.round((cotsMes.filter(function(c){ return c.estatus==="Aceptada"; }).length/cotsMes.length)*100):null;
  var sinWA=clientes.filter(function(c){ return c.canalPrincipal!=="WhatsApp"&&!c.contacto; });
  var totalGanado=cotizaciones.filter(function(c){ return c.estatus==="Aceptada"; }).reduce(function(s,c){ return s+c.monto; },0);

  // Stats ventas directas
  var totalVentasDirectas=ventas.reduce(function(s,v){ return s+Number(v.monto); },0);
  var ventasSinContacto=ventas.filter(function(v){ return v.tipo!=="especifico"; });
  var ventasConContacto=ventas.filter(function(v){ return v.tipo==="especifico"; });

  function guardarCliente(){
    if(!form.nombre.trim()){ alert("Escribe el nombre del cliente antes de guardar."); return; }
    if(form.contacto&&form.contacto.length<10){ alert("El teléfono debe tener 10 dígitos."); return; }
    var nuevoId=Date.now();
    var etapaFinal=envioCotizacion?"Cotizacion enviada":form.etapa;
    if(clienteSel){
      setClientes(clientes.map(function(c){ return c.id===clienteSel.id?Object.assign({},c,form):c; }));
    } else {
      // En modo productos: asignar estadoProspecto automáticamente
      var estadoProspectoAuto=esProductos
        ?(envioCotizacion===true?"En seguimiento":"Nueva")
        :undefined;
      var nuevoCliente=Object.assign({},form,{
        id:nuevoId,
        fecha:FECHA_HOY,
        etapa:etapaFinal,
        motivoPerdida:"",
        seguimientoFecha:"",
        ultimoContacto:FECHA_HOY,
      });
      if(esProductos) nuevoCliente.estadoProspecto=estadoProspectoAuto;
      setClientes([...clientes,nuevoCliente]);
      if(envioCotizacion&&formEnvioCot.concepto&&formEnvioCot.monto){
        setCotizaciones([...cotizaciones,{id:nuevoId+1,clienteId:nuevoId,concepto:formEnvioCot.concepto,cantidad:1,precioUnit:Number(formEnvioCot.monto),monto:Number(formEnvioCot.monto),estatus:"Pendiente",fecha:FECHA_HOY,motivoPerdida:"",vigencia:"",vigenciaDias:"",notas:"",anticipo:0,fechaAnticipo:""}]);
      }
    }
    setModalCliente(false); setClienteSel(null); setForm(formVacio);
    setEnvioCotizacion(false); setFormEnvioCot({concepto:"",monto:""});
  }

  function editarCliente(c){ setClienteSel(c); setForm({nombre:c.nombre,negocio:c.negocio,contacto:c.contacto,origen:c.origen,etapa:c.etapa,notas:c.notas,instagram:c.instagram||"",canalPrincipal:c.canalPrincipal||"WhatsApp",messenger:c.messenger||"",email:c.email||"",notaRecontacto:c.notaRecontacto||""}); setModalCliente(true); }
  function eliminarCliente(id){ setClientes(clientes.filter(function(c){ return c.id!==id; })); setCotizaciones(cotizaciones.filter(function(c){ return c.clienteId!==id; })); }
        function coachingCliente(c,prioridad){
          var cid=Number(c.id);
          var cotPend=cotizaciones.filter(function(cot){ return Number(cot.clienteId)===cid&&cot.estatus==="Pendiente"; }).sort(function(a,b){ return new Date(b.fecha)-new Date(a.fecha); })[0];
          var nombre=c.nombre.split(" ")[0];
          var d=diasSinContacto(c);

          if(c.etapa==="Ganado"){
            var meses=Math.floor(d/30);
            return {
              objetivo:nombre+" ya es cliente. Tu objetivo NO es venderle de nuevo todavía.",
              objetivoSub:"Tu objetivo es saber cómo le fue y mantener la relación.",
              consejo:"Pregunta por los resultados antes de ofrecer algo nuevo. Los clientes que sienten que te importa su éxito vuelven solos.",
              mensaje:"Hola "+nombre+", quería saber cómo te fue con lo que trabajamos. ¿Todo salió bien?"
            };
          }
          if(c.etapa==="Perdido"){
            var motivo=c.motivoPerdida||"";
            var consejoP=motivo==="Precio alto"
              ?"No intentes reabrir con descuento. Pregunta si su situación cambió, eso es más poderoso que bajar precio."
              :motivo==="Sin presupuesto"
              ?"No vendas todavía. Solo pregunta si el presupuesto ya está disponible."
              :"No menciones la venta anterior. Solo reabre la conversación con algo genuino.";
            return {
              objetivo:nombre+" dijo que no hace "+Math.floor(d/30)+" mes"+(Math.floor(d/30)>1?"es":"")+(motivo?" por "+motivo.toLowerCase():"")+". Tu objetivo NO es convencer.",
              objetivoSub:"Tu objetivo es descubrir si su situación cambió.",
              consejo:consejoP,
              mensaje:"Hola "+nombre+", han pasado unos meses. Quería saber cómo van las cosas por tu lado."
            };
          }
          if(cotPend){
            var concepto=cotPend.concepto;
            if(d<=7) return {
              objetivo:nombre+" recibió tu propuesta de "+concepto+" hace "+d+" día"+(d>1?"s":"")+". Tu objetivo NO es presionar.",
              objetivoSub:"Tu objetivo es resolver dudas antes de que tome la decisión.",
              consejo:"Haz una pregunta abierta, no una pregunta de sí/no. Eso te da información y le da espacio a él.",
              mensaje:"Hola "+nombre+", ¿tuviste oportunidad de revisar la propuesta? ¿Hay algo que quieras que te explique mejor?"
            };
            if(d<=14) return {
              objetivo:nombre+" recibió tu propuesta de "+concepto+" hace "+d+" días. Tu objetivo NO es vender.",
              objetivoSub:"Tu objetivo es descubrir si sigue interesado.",
              consejo:"Haz una pregunta antes de volver a presentar tu producto. La pregunta correcta revela si hay interés real o si ya decidió no comprar.",
              mensaje:"Hola "+nombre+", quería saber si sigues evaluando la propuesta o si surgió alguna duda."
            };
            if(d<=30) return {
              objetivo:nombre+" lleva "+d+" días sin responder sobre "+concepto+". Tu objetivo NO es cerrar hoy.",
              objetivoSub:"Tu objetivo es saber si sigue siendo una oportunidad real.",
              consejo:"Un mensaje directo y sin presión es más efectivo que uno largo. Si no responde a este, cierra la oportunidad y enfócate en otros.",
              mensaje:"Hola "+nombre+", ¿sigue en pie lo de "+concepto+"? Solo quiero saber si te puedo ayudar en algo."
            };
            return {
              objetivo:nombre+" lleva más de un mes sin responder. Tu objetivo es saber si sigue siendo una oportunidad.",
              objetivoSub:"Un mensaje directo y sin presión es suficiente.",
              consejo:"No asumas que ya no quiere. A veces la vida se los lleva. Un mensaje corto puede reactivar la conversación.",
              mensaje:"Hola "+nombre+", ¿cómo vas? Quería saber si todavía estás evaluando la propuesta o si hay algo en lo que te pueda ayudar."
            };
          }
          if(c.etapa==="Negociacion") return {
            objetivo:nombre+" lleva "+d+" días en esta etapa. Tu objetivo NO es bajar el precio ni venderle algo nuevo.",
            objetivoSub:"Tu objetivo es entender qué le impide decir que sí, o simplemente mantener la relación activa.",
            consejo:"Antes de dar un descuento, pregunta '¿Qué necesitarías ver para sentirte seguro de avanzar?'. Si ya se lo preguntaste, un mensaje corto y sin agenda comercial también funciona , muestra que te acuerdas de él sin pedir nada.",
            mensaje:"Hola "+nombre+", ¿qué necesitarías para sentirte seguro de avanzar con esto?"
          };
          return {
            objetivo:"Registraste a "+nombre+" hace "+d+" días y no ha habido movimiento.",
            objetivoSub:"Tu objetivo es dar el primer paso antes de que se enfríe.",
            consejo:"El primer mensaje marca el tono. Sé específico sobre cómo lo puedes ayudar.",
            mensaje:"Hola "+nombre+", ¿en qué etapa está tu proyecto? Me gustaría ver cómo te puedo apoyar."
          };
        }
  var ETAPA_INFO={
    "Cotizacion enviada":{msg:"Ya le enviaste una propuesta formal con precio.",accion:"En esta etapa el cliente ya sabe cuánto cuesta. Está evaluando si te contrata.",requiereCot:true},
    "Negociacion":{msg:"Le enviaste precio y está decidiendo, o hay algo que lo frena.",accion:"Puede que solo esté pensando, o que el precio, las condiciones o el momento sean un obstáculo. Aquí es donde se define la venta, mantente presente sin presionar.",requiereCot:true},
  };

  function moverEtapa(id,nueva){
    var info=ETAPA_INFO[nueva];
    var tieneCot=cotizaciones.some(function(c){ return c.clienteId===id&&(c.estatus==="Pendiente"||c.estatus==="Aceptada"); });
    var yaVio=etapasVistas.indexOf(nueva)>=0;
    if(nueva==="Perdido"){
      var clienteActual=clientes.find(function(c){ return c.id===id; });
      setEtapaAnteriorPipeline(clienteActual?clienteActual.etapa:null);
      setMotivoPipelineId(id);
      setClientes(clientes.map(function(c){ return c.id===id?Object.assign({},c,{etapa:nueva,fechaEtapa:FECHA_HOY}):c; }));
      // Marcar cotizaciones pendientes como Rechazadas
      var cotsPendP=cotizaciones.filter(function(c){ return c.clienteId===id&&c.estatus==="Pendiente"; });
      if(cotsPendP.length>0){
        setCotizaciones(cotizaciones.map(function(c){ return c.clienteId===id&&c.estatus==="Pendiente"?Object.assign({},c,{estatus:"Rechazada"}):c; }));
      }
      return;
    }
    if(nueva==="Ganado"){
      var clienteActualG=clientes.find(function(c){ return c.id===id; });
      setEtapaAnteriorGanado(clienteActualG?clienteActualG.etapa:null);
      var cotPendienteG=cotizaciones.find(function(c){ return c.clienteId===id&&c.estatus==="Pendiente"; });
      var cotAceptadaG=cotizaciones.find(function(c){ return c.clienteId===id&&c.estatus==="Aceptada"; });
      // Sin cotización,preguntar si quiere registrar venta directa
      if(!cotPendienteG&&!cotAceptadaG){
        setModalVentaRapidaPipeline(id);
        return;
      }
      setCotAceptadaId("ganado_"+id);
      if(cotPendienteG){
        setEstatusAnteriorCot({cotId:cotPendienteG.id,estatus:cotPendienteG.estatus,fecha:cotPendienteG.fecha});
        setCotizaciones(cotizaciones.map(function(c){ return c.id===cotPendienteG.id?Object.assign({},c,{estatus:"Aceptada",fechaCierre:FECHA_HOY,entregado:false,fechaEntrega:""}):c; }));
      }
      setClientes(clientes.map(function(c){ return c.id===id?Object.assign({},c,{etapa:nueva,fechaEtapa:FECHA_HOY,ultimoContacto:FECHA_HOY}):c; }));
      return;
    }
    if(info&&info.requiereCot&&!tieneCot){
      if(!yaVio){ var nv=etapasVistas.concat([nueva]); setEtapasVistas(nv); try{ localStorage.setItem("cleo_etapas_vistas",JSON.stringify(nv)); }catch(e){} }
      setModalEtapa({clienteId:id,etapa:nueva,info:info,esPrimeraVez:!yaVio});
      return;
    }
    if(info&&!yaVio){ var nv2=etapasVistas.concat([nueva]); setEtapasVistas(nv2); try{ localStorage.setItem("cleo_etapas_vistas",JSON.stringify(nv2)); }catch(e){} }
    setClientes(clientes.map(function(c){ return c.id===id?Object.assign({},c,{etapa:nueva,fechaEtapa:FECHA_HOY,ultimoContacto:FECHA_HOY}):c; }));
  }
  function cancelarGanado(){
    var clienteId2=cotAceptadaId&&String(cotAceptadaId).startsWith("ganado_")?Number(String(cotAceptadaId).replace("ganado_","")):null;
    // Revertir etapa del pipeline
    if(etapaAnteriorGanado&&pasoGanado===1){
      if(clienteId2){
        setClientes(clientes.map(function(c){ return c.id===clienteId2?Object.assign({},c,{etapa:etapaAnteriorGanado}):c; }));
      } else if(cotAceptadaId){
        // Viene de cotizaciones , buscar cliente por cotizacion
        var cotCancel=cotizaciones.find(function(c){ return c.id===cotAceptadaId; });
        if(cotCancel) setClientes(clientes.map(function(c){ return c.id===cotCancel.clienteId?Object.assign({},c,{etapa:etapaAnteriorGanado}):c; }));
      }
    }
    // Revertir estatus de cotizacion si se cancela en paso 1
    if(estatusAnteriorCot&&pasoGanado===1){
      setCotizaciones(cotizaciones.map(function(c){ return c.id===estatusAnteriorCot.cotId?Object.assign({},c,{estatus:estatusAnteriorCot.estatus}):c; }));
    }
    setCotAceptadaId(null); setDiasPostVenta("30"); setEtapaAnteriorGanado(null);
    setPasoGanado(1); setPagoGanado({tipo:"",monto:"",fecha:FECHA_HOY}); setRazonCierre([]);
    setEstatusAnteriorCot(null);
  }
  function cancelarMotivoPipeline(){
    // Revertir etapa si el usuario cierra sin seleccionar motivo
    if(motivoPipelineId&&etapaAnteriorPipeline){
      setClientes(clientes.map(function(c){ return c.id===motivoPipelineId?Object.assign({},c,{etapa:etapaAnteriorPipeline}):c; }));
    }
    // Revertir estatus de cotizacion
    if(estatusAnteriorCot){
      setCotizaciones(cotizaciones.map(function(c){ return c.id===estatusAnteriorCot.cotId?Object.assign({},c,{estatus:estatusAnteriorCot.estatus}):c; }));
      setEstatusAnteriorCot(null);
    }
    setMotivoPipelineId(null); setConsejoMotivo(null); setShowSeguimientoLost(false);
    setSeguimientoLost({dias:"",custom:""}); setMotivoLibre(""); setShowMotivoLibre(false);
    setEtapaAnteriorPipeline(null);
  }
  function guardarCot(){
    if(!formCot.clienteId&&!(formCot.nuevoNombre&&formCot.nuevoNombre.trim())){ alert("Selecciona o escribe el nombre del cliente antes de guardar."); return; }
    if(!formCot.concepto){ alert("Escribe el concepto de la cotización antes de guardar."); return; }
    if(!formCot.clienteId&&formCot.nuevoNombre&&formCot.nuevoNombre.trim()){
      if(!formCot.nuevoCanal||!formCot.nuevoContacto||!formCot.nuevoContacto.trim()){
        alert("Selecciona por dónde contactas a este cliente antes de guardar.");
        return;
      }
      if(formCot.nuevoCanal==="WhatsApp"&&formCot.nuevoContacto.replace(/\D/g,"").length!==10){
        alert("El número de WhatsApp debe tener exactamente 10 dígitos.");
        return;
      }
      var nuevoClienteIdCot=Date.now();
      var canalCot=formCot.nuevoCanal||"WhatsApp";
      var nuevoClienteCot=Object.assign({},formVacio,{
        id:nuevoClienteIdCot,
        nombre:formCot.nuevoNombre.trim(),
        fecha:FECHA_HOY,
        fechaEtapa:FECHA_HOY,
        etapa:"Nuevo contacto",
        ultimoContacto:FECHA_HOY,
        origen:formCot.nuevoOrigen||"",
        canalPrincipal:canalCot,
        contacto:canalCot==="WhatsApp"?(formCot.nuevoContacto||"").replace(/\D/g,""):"",
        instagram:canalCot==="Instagram"?(formCot.nuevoContacto||""):"",
        messenger:canalCot==="Facebook"?(formCot.nuevoContacto||""):""
      });
      setClientes(function(prev){ return [nuevoClienteCot,...prev]; });
      formCot=Object.assign({},formCot,{clienteId:String(nuevoClienteIdCot)});
    }
    var subtotal=Number(formCot.cantidad||1)*Number(formCot.precioUnit||formCot.monto||0);
    var desc=Number(formCot.descuento||0);
    var monto=formCot.tipoDescuento==="porcentaje"?subtotal-(subtotal*desc/100):subtotal-desc;
    monto=Math.max(0,monto);
    var descuentoData=desc>0?{descuento:desc,tipoDescuento:formCot.tipoDescuento,subtotal:subtotal}:{};
    if(editCotId){
      setCotizaciones(cotizaciones.map(function(c){ return c.id===editCotId?Object.assign({},c,{clienteId:Number(formCot.clienteId),concepto:formCot.concepto,cantidad:formCot.cantidad,precioUnit:Number(formCot.precioUnit||0),monto:monto,estatus:formCot.estatus,vigencia:formCot.vigencia,vigenciaDias:formCot.vigenciaDias,notas:formCot.notas,svCondiciones:formCot.svCondiciones||"",svCondicionesHtml:formCot.svCondicionesHtml||""},descuentoData):c; }));
      // Actualizar total del pedido vinculado si existe
      var pedVinculado=pedidos.find(function(p){ return String(p.clienteId)===String(formCot.clienteId); });
      if(pedVinculado&&monto>0) setPedidos(pedidos.map(function(p){ return String(p.clienteId)===String(formCot.clienteId)?Object.assign({},p,{total:monto}):p; }));
      // Sincronizar precioInteres/productoInteres del cliente para que la ficha refleje el monto real de la cotización
      setClientes(clientes.map(function(c){ return c.id===Number(formCot.clienteId)?Object.assign({},c,{precioInteres:String(monto),productoInteres:formCot.concepto||c.productoInteres}):c; }));
      setEditCotId(null);
    } else {
      setCotizaciones([...cotizaciones,Object.assign({},formCot,{id:Date.now(),clienteId:Number(formCot.clienteId),monto:monto,fecha:FECHA_HOY,motivoPerdida:"",anticipo:0,fechaAnticipo:"",pagos:[]},descuentoData)]);
      // Sincronizar precioInteres/productoInteres del cliente para que la ficha refleje el monto real de la cotización
      setClientes(function(prev){
        return prev.map(function(c){
          if(c.id!==Number(formCot.clienteId)) return c;
          var upd=Object.assign({},c,{precioInteres:String(monto),productoInteres:formCot.concepto||c.productoInteres});
          if(c.etapa!=="Ganado"&&c.etapa!=="Perdido"&&c.etapa!=="Negociacion") upd=Object.assign(upd,{etapa:"Cotizacion enviada",fechaEtapa:FECHA_HOY});
          return upd;
        });
      });
    }
    // Aplicar etapa pendiente solo si se guardo la cotizacion
    if(etapaPendiente&&Number(formCot.clienteId)===etapaPendiente.clienteId){
      setClientes(clientes.map(function(c){ return c.id===etapaPendiente.clienteId?Object.assign({},c,{etapa:etapaPendiente.etapa,fechaEtapa:FECHA_HOY}):c; }));
      setEtapaPendiente(null);
    }
    // Si el concepto no esta en el catalogo, preguntar si guardar
    var conceptoNuevo=formCot.concepto.trim();
    var catCheck=esProductos?productosCat:servicios;
    var yaExiste=catCheck.some(function(s){ return s.nombre.trim().toLowerCase()===conceptoNuevo.toLowerCase(); });
    if(!yaExiste&&conceptoNuevo){
      setGuardarSvModal({nombre:conceptoNuevo,precio:Number(formCot.precioUnit),descripcion:formCot.notas||""});
    }
    setModalCot(false); setFormCot(cotVacio);
  }
  function editarCot(cot){
    setEditCotId(cot.id);
    setFormCot({clienteId:String(cot.clienteId),concepto:cot.concepto,cantidad:cot.cantidad||1,precioUnit:cot.precioUnit||cot.monto,descuento:cot.descuento||"",tipoDescuento:cot.tipoDescuento||"porcentaje",estatus:cot.estatus,vigencia:cot.vigencia||"",vigenciaDias:cot.vigenciaDias||"",notas:cot.notas||"",svCondiciones:(cot.svCondicionesHtml||cot.svCondiciones||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim(),svCondicionesHtml:cot.svCondicionesHtml||cot.svCondiciones||"",anticipo:cot.anticipo||0,fechaAnticipo:cot.fechaAnticipo||""});
    setModalCot(true);
  }
  function cambiarEstatus(cotId,v){
    setCotizaciones(cotizaciones.map(function(c){ return c.id===cotId?Object.assign({},c,{estatus:v,fechaCierre:v==="Aceptada"?FECHA_HOY:c.fechaCierre,entregado:v==="Aceptada"?false:c.entregado,fechaEntrega:v==="Aceptada"?"":c.fechaEntrega}):c; }));
    if(v==="Aceptada"){
      // Mover cliente a Ganado y abrir modal
      var cot=cotizaciones.find(function(c){ return c.id===cotId; });
      if(cot){
        setEstatusAnteriorCot({cotId:cotId,estatus:cot.estatus});
        var clienteActualG=clientes.find(function(c){ return c.id===cot.clienteId; });
        if(clienteActualG&&clienteActualG.etapa!=="Ganado"){
          setEtapaAnteriorGanado(clienteActualG.etapa);
          setClientes(clientes.map(function(c){ return c.id===cot.clienteId?Object.assign({},c,{etapa:"Ganado",fechaEtapa:FECHA_HOY}):c; }));
        }
        setCotAceptadaId(cotId);
        setCotRapidaId(null);
        setPasoGanado(1); setPagoGanado({tipo:"",monto:"",fecha:FECHA_HOY}); setRazonCierre([]);
      }
    }
    if(v==="Rechazada"){
      var cotR=cotizaciones.find(function(c){ return c.id===cotId; });
      if(cotR){
        setEstatusAnteriorCot({cotId:cotId,estatus:cotR.estatus});
        var clienteR=clientes.find(function(c){ return c.id===cotR.clienteId; });
        if(clienteR&&clienteR.etapa!=="Perdido"&&clienteR.etapa!=="Ganado"){
          setEtapaAnteriorPipeline(clienteR.etapa);
          setClientes(clientes.map(function(c){ return c.id===clienteR.id?Object.assign({},c,{etapa:"Perdido",fechaEtapa:FECHA_HOY}):c; }));
          setMotivoPipelineId(clienteR.id);
        }
      }
      setCotAceptadaId(null);
      setCotRapidaId(null);
    }
  }
  function guardarMotivo(cotId,m){ setCotizaciones(cotizaciones.map(function(c){ return c.id===cotId?Object.assign({},c,{motivoPerdida:m}):c; })); }
  function guardarAnticipo(cotId,monto,fecha){ setCotizaciones(cotizaciones.map(function(c){ return c.id===cotId?Object.assign({},c,{anticipo:Number(monto),fechaAnticipo:fecha}):c; })); }
  function agregarServicio(){ if(!formSv.nombre.trim()||!formSv.precio) return; setCatActivo([...catActivo,Object.assign({},formSv,{id:Date.now(),precio:Number(formSv.precio),condiciones:formSv.condiciones||""})]); setFormSv(svVacio); setEditorKey(function(k){ return k+1; }); }
  function eliminarServicio(id){ setCatActivo(catActivo.filter(function(s){ return s.id!==id; })); }
  function onDragStart(ev,id){ setDragging(id); ev.dataTransfer.effectAllowed="move"; }
  function onDragOver(ev,etapa){ ev.preventDefault(); setDragOver(etapa); }
  function onDrop(ev,etapa){ ev.preventDefault(); if(dragging) moverEtapa(dragging,etapa); setDragging(null); setDragOver(null); }
  function onDragEnd(){ setDragging(null); setDragOver(null); }
  function guardarMotivoPipeline(motivo){
    // Guardar motivo en cliente
    setClientes(clientes.map(function(c){ return c.id===motivoPipelineId?Object.assign({},c,{motivoPerdida:motivo,etapa:"Perdido",fechaEtapa:FECHA_HOY}):c; }));
    // Marcar cotizacion como Rechazada
    var cotPerdida=cotizaciones.find(function(c){ return c.clienteId===motivoPipelineId&&(c.estatus==="Pendiente"||c.estatus==="Aceptada"); });
    if(cotPerdida) setCotizaciones(cotizaciones.map(function(c){ return c.id===cotPerdida.id?Object.assign({},c,{estatus:"Rechazada",motivoPerdida:motivo}):c; }));
    // Limpiar etapaAnterior , ya confirmó
    setEtapaAnteriorPipeline(null);
    setEstatusAnteriorCot(null);
    // Mostrar mensaje educativo y seguimiento inline
    setConsejoMotivo(motivo);
  }
  function guardarSeguimientoLost(){
    var dias=seguimientoLost.dias==="custom"?Number(seguimientoLost.custom):Number(seguimientoLost.dias);
    if(!dias) return;
    var fecha=new Date(); fecha.setDate(fecha.getDate()+dias);
    var targetId=clientePerdidoId||motivoPipelineId;
    setClientes(clientes.map(function(c){ return c.id===targetId?Object.assign({},c,{seguimientoFecha:fmtFechaLocal(fecha)}):c; }));
    setShowSeguimientoLost(false); setConsejoMotivo(null); setSeguimientoLost({dias:"",custom:""});
    setMotivoLibre(""); setShowMotivoLibre(false); setClientePerdidoId(null);
  }

  // ─── GUARDAR VENTA DIRECTA ────────────────────────────────────────────────
  function abrirModalVenta(){
    setFormVenta(ventaVacia);
    setPasoVenta("form");
    setModalVenta(true);
  }

  function guardarVentaDirecta(crearCliente){
    var items=formVenta.items||[];
    var totalItems=items.reduce(function(s,it){ return s+Number(it.cantidad||1)*Number(it.precio||0); },0);
    var montoFinal=items.length>0?totalItems:Number(formVenta.monto);
    if(!montoFinal) return;
    var conceptoFinal=items.length>0
      ? items.map(function(it){ return (it.cantidad&&it.cantidad>1?it.cantidad+"x ":"")+it.nombre; }).join(", ")
      : formVenta.concepto;
    var nuevaVenta={
      id:Date.now(),
      tipo:formVenta.tipo,
      clienteId:formVenta.tipo==="especifico"&&formVenta.clienteId?Number(formVenta.clienteId):null,
      concepto:conceptoFinal,
      monto:montoFinal,
      items:items.length>0?items:undefined,
      fecha:formVenta.fecha||FECHA_HOY,
      etiqueta:formVenta.etiqueta||"",
      notas:formVenta.notas||"",
      tipoPago:formVenta.tipoPago||"completo",
      anticipo:formVenta.tipoPago==="anticipo"&&formVenta.anticipo?Number(formVenta.anticipo):0,
      pagos:formVenta.tipoPago==="anticipo"
        ?(formVenta.anticipo?[{id:"p_"+Date.now(),monto:Number(formVenta.anticipo),fecha:formVenta.fecha||FECHA_HOY,concepto:"Anticipo"}]:[])
        :[{id:"p_"+Date.now(),monto:montoFinal,fecha:formVenta.fecha||FECHA_HOY,concepto:"Pago completo"}],
      entregado:formVenta.tipo==="especifico"?false:undefined,fechaEntrega:"",
    };

    // Si es especifico y eligieron crear cliente nuevo
    if(crearCliente&&formVenta.nuevoNombre.trim()){
      var nuevoId=Date.now()+1;
      var canalNuevo=formVenta.nuevoCanal||"WhatsApp";
      var nuevoCliente={
        id:nuevoId,
        nombre:formVenta.nuevoNombre,
        negocio:formVenta.nuevoNegocio||"",
        contacto:canalNuevo==="WhatsApp"?(formVenta.nuevoContacto||"").replace(/\D/g,""):"",
        origen:formVenta.nuevoOrigen||"Venta directa",
        etapa:"Ganado",
        notas:"Registrado desde venta directa"+(formVenta.etiqueta?" , "+formVenta.etiqueta:""),
        fecha:formVenta.fecha||FECHA_HOY,
        instagram:canalNuevo==="Instagram"?(formVenta.nuevoContacto||""):"",
        canalPrincipal:canalNuevo,
        messenger:canalNuevo==="Facebook"?(formVenta.nuevoContacto||""):"",
        email:"",
        motivoPerdida:"",
        seguimientoFecha:"",
      };
      setClientes([...clientes,nuevoCliente]);
      nuevaVenta.clienteId=nuevoId;
      nuevaVenta.tipo="especifico";
    }

    var tipoParaGuardar=formVenta.tipo;
    setVentas([...ventas,nuevaVenta]);
    if(nuevaVenta.concepto) aprenderProducto(nuevaVenta.concepto);
    // Si vino del pipeline, limpiar estado de reversión
    if(cotAceptadaId&&String(cotAceptadaId).startsWith("pipeline_revert_")){
      setCotAceptadaId(null); setEtapaAnteriorGanado(null);
    }
    setModalVenta(false);
    setFormVenta(ventaVacia);
    setPasoVenta("form");

    // Preguntar si guardar en catálogo
    if(tipoParaGuardar!=="dia"){
      var catCheck=esProductos?productosCat:servicios;
      var itemsParaGuardar=items.length>0
        ? items.filter(function(it){
            return it.nombre&&!catCheck.some(function(s){ return s.nombre.trim().toLowerCase()===it.nombre.trim().toLowerCase(); });
          })
        : (conceptoFinal&&!catCheck.some(function(s){ return s.nombre.trim().toLowerCase()===conceptoFinal.trim().toLowerCase(); })?[{nombre:conceptoFinal,precio:montoFinal}]:[]);
      if(itemsParaGuardar.length>=1){
        setGuardarSvModal({nombre:itemsParaGuardar[0].nombre,precio:Number(itemsParaGuardar[0].precio)||montoFinal,descripcion:"",condiciones:"",pendientes:itemsParaGuardar.slice(1)});
      }
    }
  }

  // Paso 1: validar form, luego decidir si mostrar pantalla educativa
  function avanzarVenta(){
    var items=formVenta.items||[];
    var totalItems=items.reduce(function(s,it){ return s+Number(it.cantidad||1)*Number(it.precio||0); },0);
    if(!formVenta.monto&&totalItems===0) return;
    var creandoClienteV=!formVenta.clienteId&&formVenta.nuevoNombre&&formVenta.nuevoNombre.trim();
    if(creandoClienteV&&(!formVenta.nuevoCanal||!formVenta.nuevoContacto||!formVenta.nuevoContacto.trim())){
      alert("Selecciona por dónde contactas a este cliente antes de guardar.");
      return;
    }
    if(creandoClienteV&&formVenta.nuevoCanal==="WhatsApp"&&formVenta.nuevoContacto.replace(/\D/g,"").length!==10){
      alert("El número de WhatsApp debe tener exactamente 10 dígitos.");
      return;
    }
    // Si es generico o dia, mostrar momento educativo antes de guardar
    if(formVenta.tipo==="generico"||formVenta.tipo==="dia"){
      setPasoVenta("educativo");
    } else {
      // especifico: guardar directo, creando cliente si hay nombre nuevo
      guardarVentaDirecta(!!formVenta.nuevoNombre&&!!formVenta.nuevoNombre.trim());
    }
  }

  // PIPELINE , solo una alerta urgente a la vez, la mas critica
  var alertas=[];
  (function(){
    // Buscar la alerta mas urgente
    // 1. Cotizacion con vigencia que vence manana
    var cotVenceManana=cotizaciones.filter(function(c){
      if(c.estatus!=="Pendiente"||!c.vigencia) return false;
      var diasVigencia=Math.floor((new Date(c.vigencia)-HOY)/86400000);
      return diasVigencia>=0&&diasVigencia<=1;
    })[0];
    if(cotVenceManana&&!alertaCerrada("vig_"+cotVenceManana.id)){
      var clVig=clientes.find(function(c){ return c.id===cotVenceManana.clienteId; });
      alertas.push({key:"vig_"+cotVenceManana.id,msg:"La cotización de "+(clVig?clVig.nombre:"un cliente")+" para "+(perfil.nombre||"tu negocio")+" vence "+(Math.floor((new Date(cotVenceManana.vigencia)-HOY)/86400000)===0?"hoy":"mañana")+". Si no responde hoy, perderás urgencia.",urgente:true});
      return;
    }
    // 2. Cliente en negociacion sin contacto >2 dias
    var negSinContacto=clientes.filter(function(c){
      var ref=c.ultimoContacto||c.fecha;
      return c.etapa==="Negociacion"&&Math.floor((HOY-new Date(ref))/86400000)>2&&!alertaCerrada("neg2_"+c.id);
    })[0];
    if(negSinContacto){
      alertas.push({key:"neg2_"+negSinContacto.id,msg:negSinContacto.nombre+" lleva más de 2 días en negociación con "+(perfil.nombre||"tu negocio")+" sin contacto. En negociación cada día cuenta.",urgente:true,accion:{label:"Ver en Hoy",fn:function(){ setVista("hoy"); }}});
      return;
    }
    // 3. Sin clientes nuevos esta semana
    if(clientes.filter(function(c){ return diasDesde(c.fecha)<=7; }).length===0&&clientes.length>0&&!alertaCerrada("sin_leads")){
      alertas.push({key:"sin_leads",msg:"Esta semana "+(perfil.nombre||"tu negocio")+" no tiene contactos nuevos registrados. ¿Hablaste con alguien interesado? Regístralo ahora, en 48 horas ya no lo vas a recordar.",urgente:false,accion:{label:"+ Registrar",fn:function(){ setClienteSel(null); setForm(formVacio); setModalCliente(true); }}});
    }
  })();

  var cotsFiltradas=cotizaciones.filter(function(cot){
    var cl=clientes.find(function(c){ return c.id===cot.clienteId; });
    var mb=!filtroCot.busqueda||cot.concepto.toLowerCase().includes(filtroCot.busqueda.toLowerCase())||(cl&&cl.nombre.toLowerCase().includes(filtroCot.busqueda.toLowerCase()));
    var me=!filtroCot.estatus||cot.estatus===filtroCot.estatus;
    var mf=enPeriodo(cot.fecha,filtroCot.periodo);
    // Las aceptadas viven en Trabajos , Cotizaciones solo muestra Pendientes y Rechazadas
    return mb&&me&&mf&&cot.estatus!=="Aceptada";
  }).sort(function(a,b){ return new Date(b.fecha)-new Date(a.fecha); });
  if(highlightCotId){
    cotsFiltradas=cotsFiltradas.slice().sort(function(a,b){
      if(a.id===highlightCotId) return -1;
      if(b.id===highlightCotId) return 1;
      return 0;
    });
  }

  var st={
    wrap:{fontFamily:"Arial,sans-serif",background:C.bg,minHeight:"100vh",color:C.text},
    hdr:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0.85rem 1.25rem",borderBottom:"0.5px solid "+C.border,background:C.dark},
    nav:{display:"flex",gap:2,padding:"0.5rem 1.25rem",borderBottom:"0.5px solid "+C.border,background:C.bg,flexWrap:"wrap"},
    nb:function(a){ return {padding:"7px 14px",borderRadius:8,border:"none",background:a?C.surfaceUp:"transparent",cursor:"pointer",fontSize:12,fontWeight:a?500:400,color:a?C.text:C.textMuted}; },
    btn:{cursor:"pointer",padding:"8px 18px",borderRadius:12,border:"1px solid "+C.border,background:"transparent",fontSize:13,color:C.textMuted},
    btnP:{cursor:"pointer",padding:"9px 20px",borderRadius:14,border:"none",background:"#5B5CF6",fontSize:13,color:"#fff",fontWeight:600},
    btnG:{cursor:"pointer",padding:"7px 16px",borderRadius:8,border:"none",background:C.green,fontSize:13,color:"#fff",fontWeight:500},
    card:{background:C.surface,border:"1px solid "+C.border,borderRadius:20,padding:"20px 24px",marginBottom:0,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"},
    badge:function(et){ return {display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:600,background:ETAPA_COLOR[et]+"15",color:ETAPA_COLOR[et]||C.textMuted,border:"1px solid "+(ETAPA_COLOR[et]||C.borderStrong)+"30"}; },
    badgeCot:function(et){ var m={Aceptada:C.green,Rechazada:C.red,Pendiente:C.amber}; var bg={Aceptada:C.greenBg,Rechazada:C.redBg,Pendiente:C.amberBg}; var cl=m[et]||C.textMuted; return {display:"inline-block",padding:"2px 9px",borderRadius:20,fontSize:11,background:bg[et]||C.surfaceUp,color:cl,border:"0.5px solid "+cl+"44"}; },
    inp:{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid "+C.borderStrong,background:C.surface,color:C.text,fontSize:14,boxSizing:"border-box",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"},
    lbl:{fontSize:11,color:C.textMuted,marginBottom:5,display:"block",textTransform:"uppercase",letterSpacing:"0.8px",fontWeight:600},
    ov:{position:"fixed",inset:0,background:"rgba(26,22,53,0.55)",display:"flex",alignItems:isMobile?"flex-end":"center",justifyContent:"center",zIndex:100,padding:0},
    modal:{background:C.surface,borderRadius:isMobile?"20px 20px 0 0":"20px",padding:"28px",width:isMobile?"100%":460,maxWidth:isMobile?"100%":"95vw",borderTop:"1px solid "+C.border,borderLeft:"1px solid "+C.border,borderRight:"1px solid "+C.border,borderBottom:isMobile?"none":"1px solid "+C.border,maxHeight:isMobile?"92vh":"88vh",overflowY:"auto",overflowX:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,0.12)"},
    pb:function(a){ return {cursor:"pointer",padding:"6px 16px",borderRadius:12,border:"1px solid "+(a?C.border:"transparent"),background:a?C.surface:"transparent",color:a?C.text:C.textMuted,fontSize:13,fontWeight:a?600:400}; },
    av:function(color){ return {width:36,height:36,borderRadius:"50%",background:color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12,color:color,flexShrink:0}; },
  };

  var sidebarAbierto=useState(function(){
    if(typeof window==="undefined") return true;
    // En pantallas angostas de escritorio (iPad horizontal, laptops chicas), empezar colapsado
    // para dejar más espacio al contenido. El usuario puede expandirlo cuando quiera.
    return !(window.innerWidth>=1024&&window.innerWidth<1300);
  }); var sbOpen=sidebarAbierto[0]; var setSbOpen=sidebarAbierto[1];

  // SVG Nav Icons
  var NAV_SVG={
    inicio:'M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h3a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h3a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z',
    pipeline:'M3 4h4v12H3zM9 8h4v8H9zM15 2h4v14h-4z',
    clientes:'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    ventas:'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
    cotizaciones:'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    hoy:'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
    resumen:'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    prospectos:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    pedidos:'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7',
    ventas_productos:'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
    trabajos:'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  };
  var NAV_LABELS={inicio:"Inicio",pipeline:"Seguimientos",clientes:"Clientes",ventas:"Ingresos",cotizaciones:"Cotizaciones",trabajos:"Trabajos","hoy":"Hoy",resumen:"Resumen",prospectos:"Oportunidades",pedidos:"Pedidos"};
  var NAV_LABELS_SHORT={inicio:"Inicio",pipeline:"Seguim.",clientes:"Clientes",ventas:"Ingresos",cotizaciones:"Cotiz.",trabajos:"Trabajos","hoy":"Hoy",resumen:"Resumen",prospectos:"Oportunidades",pedidos:"Pedidos"};

  // ── LENGUAJE SEGÚN PERFIL ───────────────────────────────────────────────────
  var esProductos=perfil.tipoPerfil==="productos";
  var catActivo=esProductos?productosCat:servicios;
  function setCatActivo(v){ if(esProductos) setProductosCat(v); else setServicios(v); }
  var ETAPAS_LABEL={
    "Nuevo contacto":     esProductos?"Preguntó precio":"Nuevo contacto",
    "Cotizacion enviada": esProductos?"Le mandé el precio":"Cotización enviada",
    "Negociacion":        esProductos?"Decidiendo":"Esperando respuesta",
    "Ganado":             esProductos?"Compró":"Cliente ganado",
    "Perdido":            esProductos?"No compró":"Sin cerrar",
  };
  var ETAPAS_PREGUNTA={
    "Nuevo contacto":     "¿Ya entendiste qué necesita?",
    "Cotizacion enviada": "¿Ya confirmó que la recibió?",
    "Negociacion":        "¿Sabes qué le impide avanzar?",
    "Ganado":             "¿Ya pediste una recomendación?",
    "Perdido":            "¿Qué te enseñó esta oportunidad?",
  };
  var TXT={
    cotizacion:      esProductos?"Precio":"Cotizacion",
    cotizaciones:    esProductos?"Precios enviados":"Cotizaciones",
    nuevaCotizacion: esProductos?"+ Precio":"+ Cotizacion",
    pipeline:        esProductos?"Mis clientes":"Seguimientos",
    tasaCierre:      esProductos?"De cada 10, cuántos compran":"Tasa de cierre",
    concepto:        esProductos?"Producto":"Concepto / Servicio",
    clienteGanado:   esProductos?"Compró":"Ganado",
    clientePerdido:  esProductos?"No compró":"Perdido",
  };
  if(esProductos){
    NAV_LABELS.cotizaciones="Precios enviados";
    NAV_LABELS.pipeline="Mis clientes";
  }

  // ── HYDRATION GATE , evita flash de onboarding antes de leer localStorage ──
  var s_hyd=useState(false); var hydrated=s_hyd[0]; var setHydrated=s_hyd[1];
  var sMas=useState(false); var mostrarMas=sMas[0]; var setMostrarMas=sMas[1];
  var sMoverC=useState(null); var moverClienteId=sMoverC[0]; var setMoverClienteId=sMoverC[1];
  var sMenuUsuario=useState(false); var menuUsuario=sMenuUsuario[0]; var setMenuUsuario=sMenuUsuario[1];
  var sModalCuenta=useState(false); var modalCuenta=sModalCuenta[0]; var setModalCuenta=sModalCuenta[1];
  var sHoverDemo=useState(false); var hoverDemo=sHoverDemo[0]; var setHoverDemo=sHoverDemo[1];
  var sHoverCero=useState(false); var hoverCero=sHoverCero[0]; var setHoverCero=sHoverCero[1];
  var sHoverSalir=useState(false); var hoverSalir=sHoverSalir[0]; var setHoverSalir=sHoverSalir[1];
  var sCancPed=useState(null); var cancelarPedidoId=sCancPed[0]; var setCancelarPedidoId=sCancPed[1];
  var sCancMot=useState(""); var motivoCancelPedido=sCancMot[0]; var setMotivoCancelPedido=sCancMot[1];
  var sCancLibre=useState(""); var motivoCancelLibre=sCancLibre[0]; var setMotivoCancelLibre=sCancLibre[1];
  useEffect(function(){
    console.log("[CLEO] mount , perfil.tipoPerfil:", perfil.tipoPerfil);
    console.log("[CLEO] localStorage cleo_perfil:", localStorage.getItem("cleo_perfil"));
    console.log("[CLEO] clientes count:", clientes.length);
    setHydrated(true);
  },[]);
  // Detecta si el flujo de "situación" lanzado desde el onboarding guiado ya se cerró,
  // y si tuvo éxito (se creó algo) o se canceló (regresa al paso de elegir situación).
  useEffect(function(){
    if(!onbFlujoActivo) return;
    var todosCerrados=!pasoPregunto&&!modalEnvie&&!modalCerre&&!modalRecibi&&!pasoPreguntoP&&!modalEnvieP&&!modalCerreP&&!modalRecibiP&&!clienteCompletarId&&!origenPromptId&&!pagosModalId;
    if(!todosCerrados) return;
    var huboExito=onbSnapshot&&(clientes.length>onbSnapshot.clientes||ventas.length>onbSnapshot.ventas||pedidos.length>onbSnapshot.pedidos||cotizaciones.length>onbSnapshot.cotizaciones);
    if(huboExito){
      setOnbFlujoCompletado(onbFlujoActivo);
      setOnbSubPaso("confirmacion");
    } else {
      setOnbSubPaso("situacion");
    }
    setOnbFlujoActivo(null);
    setOnbSnapshot(null);
  },[pasoPregunto,modalEnvie,modalCerre,modalRecibi,pasoPreguntoP,modalEnvieP,modalCerreP,modalRecibiP,clienteCompletarId,origenPromptId,pagosModalId]);
  useEffect(function(){
    function onResize(){ setResizeTick(function(t){ return t+1; }); }
    window.addEventListener("resize",onResize);
    window.addEventListener("orientationchange",onResize);
    return function(){ window.removeEventListener("resize",onResize); window.removeEventListener("orientationchange",onResize); };
  },[]);
  var isMobile=typeof window!=="undefined"&&(function(){ var w=window.innerWidth,h=window.innerHeight; return w<768||(w>=768&&w<1024&&h>w); })();
  if(!hydrated) return e("div",{style:{minHeight:"100vh",background:C.bg}});

  // ── ONBOARDING ─────────────────────────────────────────────────────────────
  var tienesDatos=clientes.length>0||cotizaciones.length>0||ventas.length>0;
  var tipoPerfilGuardado=perfil.tipoPerfil||(function(){ 
    try{ 
      var p=localStorage.getItem("cleo_perfil"); 
      var tp=p?JSON.parse(p).tipoPerfil||"":"";
      if(!tp) tp=localStorage.getItem("cleo_tipo_perfil")||"";
      return tp;
    }catch(e){ return ""; } 
  })();
  if(!tipoPerfilGuardado&&!tienesDatos){
    return e("div",{style:{fontFamily:"Arial,sans-serif",minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}},
      e("div",{style:{width:"100%",maxWidth:440}},
        // Logo
        e("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:40}},
          e("div",{style:{width:36,height:36,borderRadius:10,background:C.purple,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:16}},"C"),
          e("div",{style:{fontWeight:700,fontSize:18,letterSpacing:"2px",color:C.text}},"CLEO")
        ),
        // Bienvenida
        e("div",{style:{marginBottom:36}},
          e("div",{style:{fontSize:26,fontWeight:700,color:C.text,lineHeight:1.2}},"Bienvenido a CLEO"),
          e("div",{style:{fontSize:26,fontWeight:700,color:C.purple,lineHeight:1.2}},"A partir de hoy, ya no emprendes solo.")
        ),
        e("div",{style:{fontSize:13,color:C.textDim,marginBottom:16}},"Para hablarte en tu idioma, dinos cómo es tu negocio:"),
        // Opciones
        e("div",{style:{display:"flex",flexDirection:"column",gap:12,marginBottom:32}},
          [{k:"productos",emoji:"🛍️",titulo:"Vendo productos",desc:"Joyería, ropa, comida, artesanías, cosméticos y otros productos físicos."},{k:"servicios",emoji:"💼",titulo:"Ofrezco servicios",desc:"Fotografía, diseño, reparaciones, consultoría y otros servicios basados en tu tiempo o conocimiento."}].map(function(op){
            return e("button",{key:op.k,
              style:{cursor:"pointer",padding:"20px",borderRadius:14,border:"1.5px solid "+C.border,background:C.surface,textAlign:"left",display:"flex",gap:16,alignItems:"flex-start",transition:"border-color 0.15s"},
              onMouseEnter:function(ev){ ev.currentTarget.style.borderColor=C.purple; },
              onMouseLeave:function(ev){ ev.currentTarget.style.borderColor=C.border; },
              onClick:function(){
                var nuevoPerfil=Object.assign({},perfil,{tipoPerfil:op.k});
                setPerfil(nuevoPerfil);
                setVista("inicio");
              }
            },
              e("span",{style:{fontSize:28,flexShrink:0}},op.emoji),
              e("div",null,
                e("div",{style:{fontSize:15,fontWeight:600,color:C.text,marginBottom:4}},op.titulo),
                e("div",{style:{fontSize:13,color:C.textMuted,lineHeight:1.5}},op.desc)
              )
            );
          })
        )
      )
    );
  }

  // ── HYDRATION GATE

  return e("div",{style:{fontFamily:'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',minHeight:"100vh",display:"flex",background:C.bg}},

    props.syncError&&e("div",{style:{position:"fixed",bottom:isMobile?76:16,left:"50%",transform:"translateX(-50%)",zIndex:500,background:"#1F2937",color:"#fff",padding:"10px 16px",borderRadius:12,fontSize:12,display:"flex",alignItems:"center",gap:8,boxShadow:"0 4px 16px rgba(0,0,0,0.25)",maxWidth:"90vw"}},
      e("span",{style:{fontSize:14}},"⚠️"),
      e("span",null,"No se pudo guardar en la nube. Revisa tu internet — tus cambios siguen aquí en este dispositivo.")
    ),

    toastTrabajo&&e("div",{style:{position:"fixed",bottom:isMobile?76:16,left:"50%",transform:"translateX(-50%)",zIndex:500,background:"#1F2937",color:"#fff",padding:"10px 16px",borderRadius:12,fontSize:12,display:"flex",alignItems:"center",gap:8,boxShadow:"0 4px 16px rgba(0,0,0,0.25)",maxWidth:"90vw"}},
      e("span",{style:{fontSize:14}},"✓"),
      e("span",null,toastTrabajo)
    ),

    // BODY , sidebar + contenido (sin header fijo)
    e("div",{style:{display:"flex",width:"100%"}},

      // SIDEBAR , solo desktop
      e("div",{style:{
        width:sbOpen?280:64,
        minHeight:"100vh",
        background:C.dark,
        borderRight:"1px solid "+C.darkBorder,
        display:isMobile?"none":"flex",flexDirection:"column",
        flexShrink:0,
        transition:"width 0.2s ease",
        overflow:"hidden",
        position:"sticky",
        top:0,
        height:"100vh",
        zIndex:40
      }},
        // LOGO + HAMBURGER dentro del sidebar (desktop: sin logo ni leyenda, solo CLEO)
        e("div",{style:{padding:"16px 8px 8px",display:"flex",flexDirection:sbOpen?"row":"column",alignItems:"center",gap:sbOpen?10:8,borderBottom:"1px solid "+C.darkBorder,marginBottom:8,flexShrink:0,justifyContent:sbOpen?"flex-start":"center"}},
          e("button",{style:{cursor:"pointer",background:"none",border:"none",color:"rgba(255,255,255,0.4)",fontSize:18,padding:"2px",lineHeight:1,flexShrink:0},onClick:function(){ setSbOpen(!sbOpen); }},"☰"),
          sbOpen&&e("div",{style:{fontWeight:700,fontSize:15,color:"#fff",letterSpacing:"1px"}},"CLEO")
        ),

        e("div",{style:{padding:"8px",display:"flex",flexDirection:"column",gap:0,flex:1,overflowY:"auto"}},

          // GRUPO: TU DÍA (ambos)
          sbOpen&&e("div",{style:{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.25)",letterSpacing:"1.5px",textTransform:"uppercase",padding:"8px 10px 4px"}},"TU DÍA"),

          // Inicio
          (function(){
            var v="inicio"; var activo=vista===v;
            return e("button",{key:v,style:{cursor:"pointer",padding:"9px 10px",borderRadius:8,border:"none",background:activo?"#5B5CF6":"transparent",fontSize:13,color:activo?"#FFFFFF":"#CBD5E1",fontWeight:activo?600:400,textAlign:"left",width:"100%",display:"flex",alignItems:"center",gap:sbOpen?10:0,justifyContent:sbOpen?"flex-start":"center",borderLeft:"none",whiteSpace:"nowrap",overflow:"hidden",marginBottom:1},onClick:function(){ setVista(v); }},
              e("svg",{width:16,height:16,viewBox:"0 0 24 24",fill:"none",stroke:activo?"#fff":"rgba(255,255,255,0.4)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round",flexShrink:0},e("path",{d:NAV_SVG[v]||""})),
              sbOpen&&e("span",null,NAV_LABELS[v])
            );
          })(),

          // Hoy
          (function(){
            var v="hoy"; var activo=vista===v;
            var nUrgentes=contarPendientesHoy(clientes,cotizaciones,pedidos,esProductos);
            return e("button",{key:v,style:{cursor:"pointer",padding:"9px 10px",borderRadius:8,border:"none",background:activo?"#5B5CF6":"transparent",fontSize:13,color:activo?"#FFFFFF":"#CBD5E1",fontWeight:activo?600:400,textAlign:"left",width:"100%",display:"flex",alignItems:"center",gap:sbOpen?10:0,justifyContent:sbOpen?"flex-start":"center",borderLeft:"none",whiteSpace:"nowrap",overflow:"hidden",marginBottom:1,position:"relative"},onClick:function(){ setVista(v); }},
              e("svg",{width:16,height:16,viewBox:"0 0 24 24",fill:"none",stroke:activo?"#fff":"rgba(255,255,255,0.4)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round",flexShrink:0},e("path",{d:NAV_SVG[v]||""})),
              sbOpen&&e("span",{style:{flex:1}},NAV_LABELS[v]),
              sbOpen&&nUrgentes>0&&e("span",{style:{fontSize:10,padding:"1px 6px",borderRadius:20,background:C.red,color:"#fff",fontWeight:600}},nUrgentes),
              !sbOpen&&nUrgentes>0&&e("span",{style:{position:"absolute",top:6,right:6,width:7,height:7,borderRadius:"50%",background:C.red,border:"1.5px solid "+C.dark}})
            );
          })(),

          // GRUPO: CLIENTES Y PEDIDOS (productos) / CLIENTES Y VENTAS (servicios)
          sbOpen&&e("div",{style:{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.25)",letterSpacing:"1.5px",textTransform:"uppercase",padding:"12px 10px 4px"}},esProductos?"CLIENTES Y PEDIDOS":"CLIENTES Y VENTAS"),

          // Oportunidades, Pedidos, Clientes (productos) / Seguimientos, Clientes, Cotizaciones, Trabajos (servicios)
          ...(esProductos?["prospectos","pedidos","clientes"]:["pipeline","clientes","cotizaciones","trabajos"]).map(function(v){
            var activo=vista===v;
            return e("button",{key:v,style:{cursor:"pointer",padding:"9px 10px",borderRadius:8,border:"none",background:activo?"#5B5CF6":"transparent",fontSize:13,color:activo?"#FFFFFF":"#CBD5E1",fontWeight:activo?600:400,textAlign:"left",width:"100%",display:"flex",alignItems:"center",gap:sbOpen?10:0,justifyContent:sbOpen?"flex-start":"center",borderLeft:"none",whiteSpace:"nowrap",overflow:"hidden",marginBottom:1},onClick:function(){ setVista(v); if(v!=="clientes") setClienteAbierto(null); }},
              e("svg",{width:16,height:16,viewBox:"0 0 24 24",fill:"none",stroke:activo?"#fff":"rgba(255,255,255,0.4)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round",flexShrink:0},e("path",{d:NAV_SVG[v]||""})),
              sbOpen&&e("span",null,NAV_LABELS[v])
            );
          }),

          // GRUPO: CÓMO VAS (ambos)
          sbOpen&&e("div",{style:{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.25)",letterSpacing:"1.5px",textTransform:"uppercase",padding:"12px 10px 4px"}},"CÓMO VAS"),

          esProductos&&(function(){
            var v="ventas_productos"; var activo=vista===v;
            return e("button",{key:v,style:{cursor:"pointer",padding:"9px 10px",borderRadius:8,border:"none",background:activo?"#5B5CF6":"transparent",fontSize:13,color:activo?"#FFFFFF":"#CBD5E1",fontWeight:activo?600:400,textAlign:"left",width:"100%",display:"flex",alignItems:"center",gap:sbOpen?10:0,justifyContent:sbOpen?"flex-start":"center",borderLeft:"none",whiteSpace:"nowrap",overflow:"hidden",marginBottom:1},onClick:function(){ setVista(v); }},
              e("svg",{width:16,height:16,viewBox:"0 0 24 24",fill:"none",stroke:activo?"#fff":"rgba(255,255,255,0.4)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round",flexShrink:0},e("path",{d:NAV_SVG["ventas"]||""})),
              sbOpen&&e("span",null,"Ingresos")
            );
          })(),

          // Ingresos , antes de Resumen (solo servicios)
          !esProductos&&(function(){
            var v="ventas"; var activo=vista===v;
            return e("button",{key:v,style:{cursor:"pointer",padding:"9px 10px",borderRadius:8,border:"none",background:activo?"#5B5CF6":"transparent",fontSize:13,color:activo?"#FFFFFF":"#CBD5E1",fontWeight:activo?600:400,textAlign:"left",width:"100%",display:"flex",alignItems:"center",gap:sbOpen?10:0,justifyContent:sbOpen?"flex-start":"center",borderLeft:"none",whiteSpace:"nowrap",overflow:"hidden",marginBottom:1},onClick:function(){ setVista(v); }},
              e("svg",{width:16,height:16,viewBox:"0 0 24 24",fill:"none",stroke:activo?"#fff":"rgba(255,255,255,0.4)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round",flexShrink:0},e("path",{d:NAV_SVG["ventas"]||""})),
              sbOpen&&e("span",null,NAV_LABELS[v])
            );
          })(),

          (function(){
            var v="resumen"; var activo=vista===v;
            return e("button",{key:v,style:{cursor:"pointer",padding:"9px 10px",borderRadius:8,border:"none",background:activo?"#5B5CF6":"transparent",fontSize:13,color:activo?"#FFFFFF":"#CBD5E1",fontWeight:activo?600:400,textAlign:"left",width:"100%",display:"flex",alignItems:"center",gap:sbOpen?10:0,justifyContent:sbOpen?"flex-start":"center",borderLeft:"none",whiteSpace:"nowrap",overflow:"hidden",marginBottom:1},onClick:function(){ setVista(v); }},
              e("svg",{width:16,height:16,viewBox:"0 0 24 24",fill:"none",stroke:activo?"#fff":"rgba(255,255,255,0.4)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round",flexShrink:0},e("path",{d:NAV_SVG[v]||""})),
              sbOpen&&e("span",null,NAV_LABELS[v])
            );
          })()
        ),

        // HERRAMIENTAS , Mi Catálogo + Mi Perfil
        e("div",{style:{borderTop:"0.5px solid "+C.darkBorder,flexShrink:0}},
          // Mi Catálogo
          e("div",{style:{padding:sbOpen?"10px 14px":"8px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",justifyContent:sbOpen?"flex-start":"center"},onClick:function(){ setModalCatalogo(true); }},
            e("div",{style:{width:28,height:28,borderRadius:8,background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}},
              e("svg",{width:14,height:14,viewBox:"0 0 24 24",fill:"none",stroke:"rgba(255,255,255,0.45)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"},
                e("path",{d:"M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"})
              )
            ),
            sbOpen&&e("div",{style:{flex:1}},
              e("div",{style:{fontSize:12,color:"rgba(255,255,255,0.7)",fontWeight:500}},"Mi catálogo"),
              e("div",{style:{fontSize:10,color:"rgba(255,255,255,0.3)"}},catActivo.length>0?catActivo.length+(esProductos?" productos":" servicios"):"Sin "+(esProductos?"productos":"servicios"))
            )
          ),
          // Usuario — avatar + nombre + negocio, con dropdown
          e("div",{style:{position:"relative",borderTop:"0.5px solid "+C.darkBorder}},
            e("div",{style:{padding:sbOpen?"10px 14px":"8px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",justifyContent:sbOpen?"flex-start":"center"},onClick:function(){ setMenuUsuario(!menuUsuario); }},
              e("div",{style:{width:28,height:28,borderRadius:"50%",background:C.purple,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:11,fontWeight:700,color:"#fff"}},
                (perfil.tuNombre||perfil.nombre||"?").slice(0,2).toUpperCase()
              ),
              sbOpen&&e("div",{style:{flex:1,minWidth:0}},
                e("div",{style:{fontSize:12,color:"rgba(255,255,255,0.7)",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},perfil.tuNombre||"Mi cuenta"),
                perfil.nombre&&e("div",{style:{fontSize:10,color:"rgba(255,255,255,0.3)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},perfil.nombre)
              ),
              sbOpen&&e("svg",{width:14,height:14,viewBox:"0 0 24 24",fill:"none",stroke:"rgba(255,255,255,0.4)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round",style:{flexShrink:0,transform:menuUsuario?"rotate(180deg)":"none",transition:"transform 0.15s"}},
                e("path",{d:"M6 9l6 6 6-6"})
              )
            ),
            menuUsuario&&e("div",{style:{position:sbOpen?"absolute":"fixed",bottom:sbOpen?"100%":16,left:sbOpen?8:72,right:sbOpen?8:"auto",marginBottom:sbOpen?6:0,background:"#1E1B33",border:"1px solid "+C.darkBorder,borderRadius:12,padding:6,boxShadow:"0 12px 32px rgba(0,0,0,0.4)",zIndex:60,minWidth:sbOpen?"auto":180}},
              e("button",{style:{cursor:"pointer",width:"100%",textAlign:"left",padding:"9px 10px",borderRadius:8,border:"none",background:"transparent",fontSize:13,color:"#fff",display:"flex",alignItems:"center",gap:8},onClick:function(){ setFormPerfil(Object.assign({},perfil)); setModalPerfil(true); setMenuUsuario(false); }},
                e("svg",{width:14,height:14,viewBox:"0 0 24 24",fill:"none",stroke:"rgba(255,255,255,0.6)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"},e("rect",{x:2,y:7,width:20,height:14,rx:2,ry:2}),e("path",{d:"M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"})),
                "Mi negocio"
              ),
              e("button",{style:{cursor:"pointer",width:"100%",textAlign:"left",padding:"9px 10px",borderRadius:8,border:"none",background:"transparent",fontSize:13,color:"#fff",display:"flex",alignItems:"center",gap:8},onClick:function(){ setModalCuenta(true); setMenuUsuario(false); }},
                e("svg",{width:14,height:14,viewBox:"0 0 24 24",fill:"none",stroke:"rgba(255,255,255,0.6)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"},e("circle",{cx:12,cy:8,r:4}),e("path",{d:"M4 20c0-4 4-6 8-6s8 2 8 6"})),
                "Mi cuenta"
              ),
              e("div",{style:{height:1,background:C.darkBorder,margin:"4px 0"}}),
              e("button",{style:{cursor:"pointer",width:"100%",textAlign:"left",padding:"9px 10px",borderRadius:8,border:"none",background:"transparent",fontSize:13,color:"#F87171",display:"flex",alignItems:"center",gap:8},onClick:function(){ setMenuUsuario(false); if(window.confirm("¿Cerrar sesión?")){ if(props.onSignOut) props.onSignOut(); } }},
                e("svg",{width:14,height:14,viewBox:"0 0 24 24",fill:"none",stroke:"#F87171",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"},e("path",{d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"})),
                "Cerrar sesión"
              )
            )
          )
        )
      ),

      // CONTENIDO PRINCIPAL
      e("div",{style:{flex:1,overflow:"auto",background:C.bg,minHeight:"100vh",paddingBottom:isMobile?70:0}},

        e("div",{style:{padding:isMobile?"20px 16px":sbOpen?"40px 32px":"40px 48px",maxWidth:1280,margin:"0 auto",width:"100%",boxSizing:"border-box"}},

      // INICIO - ONBOARDING GUIADO NUEVO
      vista==="inicio"&&(function(){
        var tieneRegistroApp=clientes.length>0||ventas.length>0||pedidos.length>0;
        var enPantallaFinal=!!onbFlujoActivo||((onbSubPaso==="confirmacion"||onbSubPaso==="omitido")&&!perfil.onboardingListo);
        var necesitaOnboarding=enPantallaFinal||(!tieneRegistroApp&&(!perfil.tuNombre||perfil.nombre==="Mi Negocio"||!perfil.onboardingListo));
        if(!necesitaOnboarding) return null;

        var nombreNegocioTxt=perfil.nombre&&perfil.nombre!=="Mi Negocio"?perfil.nombre:"";
        var tuNombreCorto=(perfil.tuNombre||"").split(" ")[0];

        function avanzarNombre(){
          if(!onbNombreTmp.trim()) return;
          setPerfil(Object.assign({},perfil,{tuNombre:onbNombreTmp.trim()}));
          setOnbSubPaso("negocio");
        }
        function avanzarNegocio(){
          if(!onbNegocioTmp.trim()) return;
          setPerfil(Object.assign({},perfil,{nombre:onbNegocioTmp.trim()}));
          setOnbSubPaso("situacion");
        }
        function omitirNegocio(){
          setPerfil(Object.assign({},perfil,{nombre:""}));
          setOnbSubPaso("situacion");
        }
        function lanzarFlujo(tipo){
          setOnbSnapshot({clientes:clientes.length,ventas:ventas.length,pedidos:pedidos.length,cotizaciones:cotizaciones.length});
          setOnbFlujoActivo(tipo);
          if(tipo==="pregunto"){ if(esProductos){ setPasoPreguntoP(1); } else { setPasoPregunto(1); } }
          else if(tipo==="envie"){ if(esProductos){ setModalEnvieP(true); } else { setModalEnvie(true); } }
          else if(tipo==="cerre"){ if(esProductos){ setModalCerreP(true); } else { setModalCerre(true); } }
          else if(tipo==="recibi"){ if(esProductos){ setModalRecibiP(true); } else { setModalRecibi(true); } }
        }
        function elegirAhoraNo(){ setOnbSubPaso("omitido"); }
        function mensajeConfirmacion(){
          if(onbFlujoCompletado==="pregunto"||onbFlujoCompletado==="envie") return "Ya empezamos a cuidar esta conversación contigo.";
          if(onbFlujoCompletado==="cerre") return esProductos?"Ya guardamos este pedido.":"Ya registramos esta venta.";
          if(onbFlujoCompletado==="recibi") return "Ya registramos este pago.";
          return "Ya empezamos a cuidar esto contigo.";
        }
        function irAInicio(){ setPerfil(Object.assign({},perfil,{onboardingListo:true})); }

        function puntos(activo){
          var pasos=["nombre","negocio","situacion"];
          var idx=pasos.indexOf(activo);
          if(idx<0) return null;
          return e("div",{style:{display:"flex",gap:6,justifyContent:"center",marginBottom:28}},
            pasos.map(function(p,i){
              return e("div",{key:p,style:{width:7,height:7,borderRadius:"50%",background:i<=idx?C.purple:C.border}});
            })
          );
        }
        function botonAtras(destino){
          return e("button",{style:{cursor:"pointer",background:"none",border:"none",color:C.textDim,fontSize:13,marginTop:18,display:"block",marginLeft:"auto",marginRight:"auto"},onClick:function(){ setOnbSubPaso(destino); }},"← Atrás");
        }

        var pasoMostrar=onbSubPaso;
        if(!perfil.tuNombre&&(pasoMostrar==="negocio"||pasoMostrar==="situacion"||pasoMostrar==="confirmacion"||pasoMostrar==="omitido")) pasoMostrar="bienvenida";
        if(perfil.tuNombre&&perfil.nombre==="Mi Negocio"&&pasoMostrar==="bienvenida") pasoMostrar="negocio";
        if(perfil.tuNombre&&perfil.nombre!=="Mi Negocio"&&(pasoMostrar==="bienvenida"||pasoMostrar==="nombre"||pasoMostrar==="negocio")) pasoMostrar="situacion";

        return e("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"70vh",padding:"0 16px"}},
          e("div",{style:{width:"100%",maxWidth:440}},

            // PASO: BIENVENIDA
            pasoMostrar==="bienvenida"&&e("div",{style:{textAlign:"center"}},
              e("div",{style:{fontSize:40,marginBottom:20}},"👋"),
              e("div",{style:{fontSize:24,fontWeight:700,color:C.text,marginBottom:10,lineHeight:1.3}},"Hola, qué bueno tenerte aquí."),
              e("div",{style:{fontSize:16,color:C.text,marginBottom:8,lineHeight:1.5}},"Desde hoy ya no emprendes solo."),
              e("div",{style:{fontSize:14,color:C.textMuted,marginBottom:32,lineHeight:1.6}},"CLEO te ayudará a recordar lo importante y a saber qué necesita tu atención."),
              e("button",{style:{cursor:"pointer",padding:"13px 36px",borderRadius:12,border:"none",background:C.purple,fontSize:15,color:"#fff",fontWeight:600},onClick:function(){ setOnbSubPaso("nombre"); }},"Empecemos →")
            ),

            // PASO: NOMBRE
            pasoMostrar==="nombre"&&e("div",null,
              puntos("nombre"),
              e("div",{style:{textAlign:"center",marginBottom:28}},
                e("div",{style:{fontSize:22,fontWeight:700,color:C.text,marginBottom:8,lineHeight:1.3}},"Primero, ¿cómo te llamas?"),
                e("div",{style:{fontSize:14,color:C.textMuted,lineHeight:1.5}},"Queremos que CLEO se sienta como tu espacio.")
              ),
              e("input",{value:onbNombreTmp,onChange:function(ev){ setOnbNombreTmp(ev.target.value); },placeholder:"Tu nombre",autoFocus:true,onKeyDown:function(ev){ if(ev.key==="Enter") avanzarNombre(); },style:{width:"100%",padding:"14px 16px",borderRadius:12,border:"1.5px solid "+C.border,background:C.surface,fontSize:16,color:C.text,marginBottom:16,boxSizing:"border-box",textAlign:"center",outline:"none"}}),
              e("button",{style:{cursor:"pointer",width:"100%",padding:"13px",borderRadius:12,border:"none",background:C.purple,fontSize:15,color:"#fff",fontWeight:600,opacity:onbNombreTmp.trim()?1:0.4},disabled:!onbNombreTmp.trim(),onClick:avanzarNombre},"Continuar →"),
              botonAtras("bienvenida")
            ),

            // PASO: NEGOCIO
            pasoMostrar==="negocio"&&e("div",null,
              puntos("negocio"),
              e("div",{style:{textAlign:"center",marginBottom:28}},
                e("div",{style:{fontSize:22,fontWeight:700,color:C.text,marginBottom:8,lineHeight:1.3}},"Mucho gusto, "+tuNombreCorto+" 👋"),
                e("div",{style:{fontSize:16,color:C.text,lineHeight:1.5}},"¿Cómo se llama tu negocio?")
              ),
              e("input",{value:onbNegocioTmp,onChange:function(ev){ setOnbNegocioTmp(ev.target.value); },placeholder:"Nombre de tu negocio",autoFocus:true,onKeyDown:function(ev){ if(ev.key==="Enter"&&onbNegocioTmp.trim()) avanzarNegocio(); },style:{width:"100%",padding:"14px 16px",borderRadius:12,border:"1.5px solid "+C.border,background:C.surface,fontSize:16,color:C.text,marginBottom:16,boxSizing:"border-box",textAlign:"center",outline:"none"}}),
              e("button",{style:{cursor:"pointer",width:"100%",padding:"13px",borderRadius:12,border:"none",background:C.purple,fontSize:15,color:"#fff",fontWeight:600,opacity:onbNegocioTmp.trim()?1:0.4,marginBottom:10},disabled:!onbNegocioTmp.trim(),onClick:avanzarNegocio},"Continuar →"),
              e("button",{style:{cursor:"pointer",width:"100%",padding:"10px",borderRadius:12,border:"none",background:"none",fontSize:13,color:C.textDim},onClick:omitirNegocio},"Todavía no tiene nombre"),
              botonAtras("nombre")
            ),

            // PASO: SITUACIÓN
            pasoMostrar==="situacion"&&e("div",null,
              puntos("situacion"),
              e("div",{style:{textAlign:"center",marginBottom:8}},
                e("div",{style:{fontSize:22,fontWeight:700,color:C.text,marginBottom:8,lineHeight:1.3}},nombreNegocioTxt?"¿Qué está pasando en "+nombreNegocioTxt+"?":"¿Qué está pasando hoy en tu negocio?"),
                e("div",{style:{fontSize:14,color:C.textMuted,marginBottom:28,lineHeight:1.5}},"Empecemos con algo que quieras recordar o cuidar.")
              ),
              e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}},
                [
                  {ic:"💬",label:"Alguien preguntó",tipo:"pregunto"},
                  {ic:"🏷️",label:"Envié un precio",tipo:"envie"},
                  {ic:"🎉",label:"Cerré una venta",tipo:"cerre"},
                  {ic:"💰",label:"Recibí un pago",tipo:"recibi"}
                ].map(function(op,i){
                  return e("button",{key:i,style:{cursor:"pointer",padding:"14px",borderRadius:12,border:"1px solid "+C.border,background:C.bg,fontSize:13,color:C.text,fontWeight:500,display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left"},onClick:function(){ lanzarFlujo(op.tipo); }},
                    e("span",{style:{fontSize:16,flexShrink:0}},op.ic),
                    e("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},op.label)
                  );
                })
              ),
              e("button",{style:{cursor:"pointer",width:"100%",padding:"10px",borderRadius:12,border:"none",background:"none",fontSize:13,color:C.textDim},onClick:elegirAhoraNo},"Ahora no tengo nada que registrar"),
              botonAtras("negocio")
            ),

            // PASO: CONFIRMACIÓN (tras registrar algo)
            pasoMostrar==="confirmacion"&&e("div",{style:{textAlign:"center"}},
              e("div",{style:{fontSize:40,marginBottom:20}},"✅"),
              e("div",{style:{fontSize:22,fontWeight:700,color:C.text,marginBottom:10,lineHeight:1.35}},"Listo, "+tuNombreCorto+". "+mensajeConfirmacion()),
              e("div",{style:{fontSize:14,color:C.textMuted,marginBottom:32,lineHeight:1.6}},"Cuando vuelvas, CLEO te mostrará qué necesita tu atención."),
              e("button",{style:{cursor:"pointer",padding:"13px 36px",borderRadius:12,border:"none",background:C.purple,fontSize:15,color:"#fff",fontWeight:600},onClick:irAInicio},"Ir a mi inicio →")
            ),

            // PASO: OMITIDO ("Ahora no tengo nada que registrar")
            pasoMostrar==="omitido"&&e("div",{style:{textAlign:"center"}},
              e("div",{style:{fontSize:40,marginBottom:20}},"👍"),
              e("div",{style:{fontSize:22,fontWeight:700,color:C.text,marginBottom:10,lineHeight:1.35}},"Está bien, "+tuNombreCorto+". Puedes empezar cuando ocurra algo nuevo."),
              e("div",{style:{fontSize:14,color:C.textMuted,marginBottom:32,lineHeight:1.6}},"Cuando alguien pregunte, hagas una venta o recibas un pago, CLEO estará aquí para ayudarte a recordarlo."),
              e("button",{style:{cursor:"pointer",padding:"13px 36px",borderRadius:12,border:"none",background:C.purple,fontSize:15,color:"#fff",fontWeight:600},onClick:irAInicio},"Conocer mi inicio →")
            )

          )
        );
      })(),


      vista==="inicio"&&(clientes.length>0||ventas.length>0||perfil.onboardingListo)&&(function(){
        var perfilCompletoDash=!!(perfil.nombre&&perfil.nombre!=="Mi Negocio");
        var tieneRegistroDash=clientes.length>0||ventas.length>0;
        // Mientras la confirmación del onboarding guiado siga visible, no mostrar el dashboard debajo todavía
        if(onbFlujoActivo||(!perfil.onboardingListo&&(onbSubPaso==="confirmacion"||onbSubPaso==="omitido"))) return null;
        // Onboarding ya terminado ("Ahora no tengo nada que registrar") y todavía sin ningún dato real
        if(clientes.length===0&&ventas.length===0&&pedidos.length===0){
          var empresaVacia=perfil.nombre&&perfil.nombre!=="Mi Negocio"?perfil.nombre:"tu negocio";
          return e("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh",padding:"0 16px",textAlign:"center"}},
            e("div",{style:{fontSize:36,marginBottom:16}},"👋"),
            e("div",{style:{fontSize:20,fontWeight:700,color:C.text,marginBottom:8}},"¿Qué está pasando hoy en "+empresaVacia+"?"),
            e("div",{style:{fontSize:14,color:C.textMuted,marginBottom:28,maxWidth:380}},"En cuanto registres algo, CLEO empezará a mostrarte qué necesita tu atención."),
            e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,width:"100%",maxWidth:380}},
              [
                {ic:"💬",label:"Alguien preguntó",onClick:function(){ if(esProductos){ setPasoPreguntoP(1); } else { setPasoPregunto(1); } }},
                {ic:"🏷️",label:"Envié un precio",onClick:function(){ if(esProductos){ setModalEnvieP(true); } else { setModalEnvie(true); } }},
                {ic:"🎉",label:"Cerré una venta",onClick:function(){ if(esProductos){ setModalCerreP(true); } else { setModalCerre(true); } }},
                {ic:"💰",label:"Recibí un pago",onClick:function(){ if(esProductos){ setModalRecibiP(true); } else { setModalRecibi(true); } }}
              ].map(function(op,i){
                return e("button",{key:i,style:{cursor:"pointer",padding:"14px",borderRadius:12,border:"1px solid "+C.border,background:C.bg,fontSize:13,color:C.text,fontWeight:500,display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left"},onClick:op.onClick},
                  e("span",{style:{fontSize:16,flexShrink:0}},op.ic),
                  e("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},op.label)
                );
              })
            )
          );
        }
        function calcPctPerfil(p){
          var pts=0;
          if(p.nombre&&p.nombre!=="Mi Negocio") pts+=25;
          if(p.tipoPerfil) pts+=20;
          if(p.telefono||p.redesTT) pts+=20;
          if(p.email||p.redesIG) pts+=20;
          if(p.logo) pts+=15;
          return pts;
        }
        var DIAS=["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
        var MESES_N=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
        var hoyLabel=DIAS[HOY.getDay()]+" "+HOY.getDate()+" de "+MESES_N[HOY.getMonth()];
        var hora=new Date().getHours();
        var saludo=hora<12?"Buenos días":hora<19?"Buenas tardes":"Buenas noches";
        var tuNombre=perfil.tuNombre||perfil.nombre||"emprendedor";
        var empresa=perfil.nombre||"tu negocio";
        var nombre=perfil.tuNombre||perfil.nombre||"emprendedor";

        // Metricas (solo servicios)
        var cotsPend=[],totalPend=0,clientesActivos=0,sinContacto=0,ganados=[],totalGanado=0,ganadosRecientes=[];
        var subtitulo="",enNegociacion=0,acciones=[],leccion=null,preguntaSemana="",reconocimiento=null,ideaDestino=null,ideaClickeable=true;
        var prioColor={"alta":"#EF4444","media":"#F59E0B","baja":"#6B7280"};
        var prioLabel={"alta":"URGENTE","media":"ESTA SEMANA","baja":"CUANDO PUEDAS"};
        var prioBg={"alta":"#FEF2F2","media":"#FFFBEB","baja":"#EFF6FF"};
        if(!esProductos){
        cotsPend=cotizaciones.filter(function(c){ return c.estatus==="Pendiente"; });
        totalPend=cotsPend.reduce(function(s,c){ return s+c.monto; },0);
        var clientesActivos=clientes.filter(function(c){ return c.etapa!=="Ganado"&&c.etapa!=="Perdido"; }).length;
        var sinContacto=clientes.filter(function(c){ var ref=c.ultimoContacto||c.fecha; var d=Math.floor((HOY-new Date(ref))/86400000); return !c.seguimientoFecha&&((c.etapa==="Negociacion"&&d>2)||(c.etapa==="Cotizacion enviada"&&d>3)||(c.etapa==="Nuevo contacto"&&d>5)); }).length;
        var ganados=cotizaciones.filter(function(c){ return c.estatus==="Aceptada"; });
        var totalGanado=ganados.reduce(function(s,c){ return s+c.monto; },0);
        var ganadosRecientes=clientes.filter(function(c){ return c.etapa==="Ganado"&&diasDesde(c.fechaEtapa||c.fecha)<=14; });

        // Subtitulo educativo , basado en lo mismo que muestra "A quién contactar hoy"
        var subtitulo;
        var totalAccionesHoy=obtenerAccionesHoy(clientes,cotizaciones,esProductos).length;
        var cobrosPendientesCount=esProductos?0:obtenerCobrosPendientesHoy(cotizaciones,ventas,clientes).length;
        var txtConv=totalAccionesHoy+" conversaci"+(totalAccionesHoy===1?"ón":"ones");
        var txtCobro=cobrosPendientesCount+" cobro"+(cobrosPendientesCount===1?"":"s")+" pendiente"+(cobrosPendientesCount===1?"":"s");
        if(totalAccionesHoy>0&&cobrosPendientesCount>0) subtitulo="Hoy tienes "+txtConv+" por retomar y "+txtCobro+".";
        else if(totalAccionesHoy>0) subtitulo="Tienes "+txtConv+" que vale la pena retomar hoy.";
        else if(cobrosPendientesCount>0) subtitulo="Tienes "+txtCobro+" que conviene revisar hoy.";
        else if(clientes.length<5) subtitulo="Registra la actividad de ventas para "+empresa+" y descubre qué acciones generan más resultados.";
        else subtitulo="La herramienta que ayuda a "+empresa+" a vender mejor con cada cliente que registras.";

        // Top 3 EN TOTAL (conversaciones + cobros combinados), misma fuente real que usa Hoy
        var accionesTodas=obtenerAccionesHoy(clientes,cotizaciones,esProductos);
        var cobrosTodosIni=esProductos?[]:obtenerCobrosPendientesHoy(cotizaciones,ventas,clientes);
        var acciones=[],cobrosPendientes=[];
        (function(){
          var iA=0,iC=0,turno="accion";
          while(acciones.length+cobrosPendientes.length<3&&(iA<accionesTodas.length||iC<cobrosTodosIni.length)){
            if(turno==="accion"){
              if(iA<accionesTodas.length){ acciones.push(accionesTodas[iA]); iA++; }
              else if(iC<cobrosTodosIni.length){ cobrosPendientes.push(cobrosTodosIni[iC]); iC++; }
            } else {
              if(iC<cobrosTodosIni.length){ cobrosPendientes.push(cobrosTodosIni[iC]); iC++; }
              else if(iA<accionesTodas.length){ acciones.push(accionesTodas[iA]); iA++; }
            }
            turno=turno==="accion"?"cobro":"accion";
          }
        })();
        var accionesRestantes=accionesTodas.length-acciones.length;
        var cobrosRestantesIni=cobrosTodosIni.length-cobrosPendientes.length;

        // ── INSIGHT mejorado , sin tecnicismos, basado en datos reales ──────────
        var rechazadasTotal=cotizaciones.filter(function(c){ return c.estatus==="Rechazada"; });
        var porPrecio=rechazadasTotal.filter(function(c){ return c.motivoPerdida==="Precio alto"; });
        var sinContactoWA=clientes.filter(function(c){ return !c.contacto&&c.canalPrincipal!=="WhatsApp"; });
        var leccion=null;
        if(porPrecio.length>=3){
          leccion={
            icono:"💡",
            etiqueta:"Lo que tus números dicen de ti",
            titulo:"Te han dicho que es muy caro "+porPrecio.length+" veces",
            texto:"Casi nunca significa que eres caro, significa que el cliente no vio suficiente valor antes de escuchar el número. La solución no es bajar precio: es explicar qué resuelves antes de decir cuánto cuesta.",
            accionLabel:"Ver esos casos",
            accionVista:"cotizaciones"
          };
        } else if(sinContactoWA.length>=2){
          leccion={
            icono:"📱",
            etiqueta:"Lo que tus números dicen de ti",
            titulo:"Tienes "+sinContactoWA.length+" clientes sin seguimiento",
            texto:"Si esos clientes dejan de escribirte, no tienes forma de retomar el contacto. En tu próxima venta, pide el número antes de que se vayan, una sola pregunta cambia todo.",
            accionLabel:"Ver esos clientes",
            accionVista:"clientes"
          };
        } else if(ganadosRecientes.length>=2){
          leccion={
            icono:"🤝",
            etiqueta:"Lo que tus números dicen de ti",
            titulo:ganadosRecientes.length+" clientes te compraron recientemente",
            texto:"Este es el mejor momento para pedir referidos. A un cliente que acaba de comprar le da gusto recomendarte, pero si no se lo pides, no lo hace. Un mensaje de seguimiento hoy puede traerte tu próximo cliente.",
            accionLabel:"Ver clientes ganados",
            accionVista:"resumen"
          };
        } else if(cotsPend.length>=3){
          leccion={
            icono:null,
            etiqueta:"Lo que tus números dicen de ti",
            titulo:"Tienes "+cotsPend.length+" precios enviados esperando respuesta",
            texto:"No necesitas más prospectos ahora mismo, necesitas darle seguimiento a los que ya tienes. Un mensaje simple de '¿pudiste revisar lo que te mandé?' puede reactivar una venta que ya creías perdida.",
            accionLabel:"Ver precios enviados",
            accionVista:"cotizaciones"
          };
        } else if(promDiasPropioIni!==null){
          leccion={
            icono:"📊",
            etiqueta:"Lo que tus números dicen de ti",
            titulo:esProductos?"Normalmente conviertes en "+promDiasPropioIni+" día"+(promDiasPropioIni===1?"":"s"):"Normalmente cierras en "+promDiasPropioIni+" día"+(promDiasPropioIni===1?"":"s"),
            texto:"Ese es tu ritmo real, calculado con tu propio historial, no un promedio genérico. Si un cliente lleva más de eso esperando, ya se está saliendo de lo normal para tu negocio, vale la pena escribirle.",
            accionLabel:esProductos?"Ver oportunidades":"Ver quién necesita seguimiento",
            accionVista:esProductos?"prospectos":"hoy"
          };
        } else if(mejorDiaCierre){
          leccion={
            icono:"📅",
            etiqueta:"Lo que tus números dicen de ti",
            titulo:"La mayoría de tus cierres pasan los "+mejorDiaCierre.dia+"s",
            texto:mejorDiaCierre.n+" de tus "+mejorDiaCierre.total+" cierres registrados fueron ese día. Puede valer la pena concentrar tus seguimientos más importantes cerca de ese día de la semana.",
            accionLabel:"Ver resumen completo",
            accionVista:"resumen"
          };
        } else {
          leccion={
            icono:"🎯",
            etiqueta:"Lo que tus números dicen de ti",
            titulo:"La mayoría pierde ventas por no dar seguimiento, no por precio",
            texto:"La diferencia entre cerrar y no cerrar casi siempre está en un mensaje que nunca se mandó. ¿Cuántos clientes tuyos llevan más de una semana sin saber de ti?",
            accionLabel:"Ver quién necesita seguimiento",
            accionVista:"hoy"
          };
        }

        // ── PREGUNTA DEL DÍA , basada en datos reales ─────────────────────
        var preguntaSemana=null;
        var diaNum=Math.floor((HOY-new Date(HOY.getFullYear(),0,1))/86400000);
        var clientesHoy2=clientes.filter(function(c){ return diasDesde(c.fecha)===0; });
        var clientesAyer=clientes.filter(function(c){ return diasDesde(c.fecha)===1; });
        var perdidasRecientes=cotizaciones.filter(function(c){ return c.estatus==="Rechazada"&&diasDesde(c.fecha)<=2; });
        var ganadasHoy=cotizaciones.filter(function(c){ return c.estatus==="Aceptada"&&diasDesde(c.fecha)<=1; });
        var ventasHoy=ventas.filter(function(v){ return diasDesde(v.fecha)===0; });
        var cotsPendientesViejas=cotizaciones.filter(function(c){ return c.estatus==="Pendiente"&&diasDesde(c.fecha)>=3; });
        var clienteMasDias=clientes.filter(function(c){ return c.etapa!=="Ganado"&&c.etapa!=="Perdido"; }).sort(function(a,b){ return diasSinContacto(b)-diasSinContacto(a); })[0];

        // Motivo dominante de pérdida/cancelación (misma fuente que Resumen), prioridad más alta si existe
        var motivoDomCount={};
        cotizaciones.filter(function(c){ return c.estatus==="Rechazada"&&c.motivoPerdida; }).forEach(function(c){ motivoDomCount[c.motivoPerdida]=(motivoDomCount[c.motivoPerdida]||0)+1; });
        clientes.filter(function(c){ return (c.etapa==="Perdido"||c.estadoProspecto==="Perdido")&&c.motivoPerdida; }).forEach(function(c){ motivoDomCount[c.motivoPerdida]=(motivoDomCount[c.motivoPerdida]||0)+1; });
        (pedidos||[]).filter(function(p){ return p.estadoPedido==="cancelado"&&p.motivoCancelacion; }).forEach(function(p){ motivoDomCount[p.motivoCancelacion]=(motivoDomCount[p.motivoCancelacion]||0)+1; });
        var motivoDomRank=Object.entries(motivoDomCount).sort(function(a,b){ return b[1]-a[1]; });
        var motivoDominante=motivoDomRank[0]||null;

        // Tiempo promedio REAL de este negocio para cerrar (aprendizaje personalizado, no un número fijo igual para todos)
        var tiemposCierreIni=[];
        cotizaciones.filter(function(c){ return c.estatus==="Aceptada"; }).forEach(function(cot){
          var cl=clientes.find(function(c){ return c.id===cot.clienteId; });
          if(cl&&cl.fecha&&cot.fecha){
            var dias=Math.floor((parseFechaLocal(cot.fecha)-parseFechaLocal(cl.fecha))/86400000);
            if(dias>=0) tiemposCierreIni.push(dias);
          }
        });
        var tiemposConvIni=[];
        clientes.filter(function(c){ return c.estadoProspecto==="Convertido"&&c.fecha&&c.fechaPedido; }).forEach(function(c){
          var dias=Math.floor((parseFechaLocal(c.fechaPedido)-parseFechaLocal(c.fecha))/86400000);
          if(dias>=0) tiemposConvIni.push(dias);
        });
        var muestraTiempoIni=esProductos?tiemposConvIni:tiemposCierreIni;
        var promDiasPropioIni=muestraTiempoIni.length>=3?Math.round(muestraTiempoIni.reduce(function(s,d){ return s+d; },0)/muestraTiempoIni.length):null;

        // Mejor día de la semana para cerrar (aprendizaje personalizado)
        var diasSemanaNombres=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
        var cierresPorDiaIni=[0,0,0,0,0,0,0];
        cotizaciones.filter(function(c){ return c.estatus==="Aceptada"&&c.fecha; }).forEach(function(c){ cierresPorDiaIni[new Date(c.fecha+"T12:00:00").getDay()]++; });
        clientes.filter(function(c){ return c.estadoProspecto==="Convertido"&&c.fechaPedido; }).forEach(function(c){ cierresPorDiaIni[new Date(c.fechaPedido+"T12:00:00").getDay()]++; });
        var totalCierresDiaIni=cierresPorDiaIni.reduce(function(s,n){ return s+n; },0);
        var maxDiaIdxIni=0;
        for(var diIni=1;diIni<7;diIni++){ if(cierresPorDiaIni[diIni]>cierresPorDiaIni[maxDiaIdxIni]) maxDiaIdxIni=diIni; }
        var mejorDiaCierre=(totalCierresDiaIni>=5&&cierresPorDiaIni[maxDiaIdxIni]>=2)?{dia:diasSemanaNombres[maxDiaIdxIni],n:cierresPorDiaIni[maxDiaIdxIni],total:totalCierresDiaIni}:null;

        if(motivoDominante&&motivoDominante[1]>=2){
          preguntaSemana="\""+motivoDominante[0]+"\" es el motivo que más se repite cuando un cliente no continúa. Ya sabes contra qué te enfrentas más seguido, eso te da ventaja para responderlo mejor la próxima vez.";
        } else if(perdidasRecientes.length>=1){
          var mot=perdidasRecientes[0].motivoPerdida;
          var clP=clientes.find(function(c){ return c.id===perdidasRecientes[0].clienteId; });
          var nombreP=clP?clP.nombre.split(" ")[0]:"ese cliente";
          if(clP) ideaDestino={tipo:"clienteHoy",id:clP.id};
          preguntaSemana=mot
            ?nombreP+" decidió no continuar por \""+mot+"\". Si otro cliente te dice lo mismo, ya tendrás una mejor forma de responder."
            :nombreP+" no continuó. A veces entender en qué momento se enfrió la conversación enseña más que una venta cerrada.";
        } else if(ganadasHoy.length>=1){
          var clG=clientes.find(function(c){ return c.id===ganadasHoy[0].clienteId; });
          var nombreG=clG?clG.nombre.split(" ")[0]:"tu cliente";
          ideaClickeable=false;
          preguntaSemana="Cerraste con "+nombreG+". Vale la pena recordar qué hizo que esta vez dijera que sí.";
        } else if(ventasHoy.length>=1){
          var nombreVH=ventasHoy[0].concepto||"esa venta directa";
          preguntaSemana="Registraste \""+nombreVH+"\" hoy. Ese cliente ya confió en ti, muchas veces una buena experiencia abre la puerta a la siguiente venta.";
        } else if(clientesHoy2.length>=1){
          var nc2=clientesHoy2[0];
          ideaDestino={tipo:"clienteHoy",id:nc2.id};
          preguntaSemana="Acabas de registrar a "+nc2.nombre.split(" ")[0]+". Las primeras conversaciones suelen marcar toda la relación con un cliente.";
        } else if(clientesAyer.length>=1){
          var ncA=clientesAyer[0];
          ideaDestino={tipo:"clienteHoy",id:ncA.id};
          preguntaSemana="Ayer registraste a "+ncA.nombre.split(" ")[0]+". Un seguimiento a tiempo demuestra interés y mantiene viva la conversación.";
        } else {
          preguntaSemana=clientes.length>=5
            ?"No tienes conversaciones recientes que resaltar hoy. Revisa 'A quién contactar hoy' para ver quién sigue esperando respuesta."
            :"Sigue registrando tu actividad , entre más datos tengas, mejores patrones te podrá mostrar CLEO sobre tu negocio.";
        }

        // ── RECONOCIMIENTO , aparece cuando el emprendedor hizo algo bien ────────
        var reconocimiento=null;
        var cierreHoy=cotizaciones.filter(function(c){ return c.estatus==="Aceptada"&&diasDesde(c.fecha)<=2; });
        var clientesHoy=clientes.filter(function(c){ return diasDesde(c.fecha)<=2; });
        var perdidasDocumentadas=cotizaciones.filter(function(c){ return c.estatus==="Rechazada"&&c.motivoPerdida&&diasDesde(c.fecha)<=2; });
        if(cierreHoy.length>=1){
          var totalCierreHoy=cierreHoy.reduce(function(s,c){ return s+c.monto; },0);
          reconocimiento={
            titulo:"¡Cerraste una venta para "+empresa+"!",
            texto:"$"+totalCierreHoy.toLocaleString()+" registrados. Documentar tus cierres te ayuda a ver qué está funcionando, sigue así.",
            icono:"🎉"
          };
        } else if(clientesHoy.length>=2){
          reconocimiento={
            titulo:"Buen ritmo de prospectos",
            texto:"Registraste "+clientesHoy.length+" contactos nuevos. Mientras más registras, más aprende CLEO sobre tu negocio.",
            icono:"👍"
          };
        } else if(perdidasDocumentadas.length>=1){
          reconocimiento={
            titulo:"Bien documentado",
            texto:"Registraste el motivo de una pérdida. Eso es exactamente lo que necesitas para mejorar, muy pocos emprendedores lo hacen.",
            icono:"📝"
          };
        }

        var prioColor={"alta":"#EF4444","media":"#F59E0B","baja":"#3B82F6"};
        var prioLabel={"alta":"LO MÁS IMPORTANTE","media":"CONVIENE HOY","baja":"SE ESTÁ ENFRIANDO"};
        var prioBg={"alta":"#FEF2F2","media":"#FFFBEB","baja":"#EFF6FF"};
        } else { // esProductos
          // Subtitulo educativo para Productos , mismo criterio que la tarjeta de Inicio
          var opsRetomarSub=clientes.filter(function(c){
            if(!c.estadoProspecto||c.estadoProspecto==="Convertido"||c.estadoProspecto==="Perdido") return false;
            if(c.seguimientoFecha&&c.seguimientoFecha<=FECHA_HOY) return true;
            var dias=diasDesde(c.fechaEtapa||c.fecha);
            if(c.estadoProspecto==="Nueva") return dias>=3;
            if(c.estadoProspecto==="En seguimiento") return dias>=4;
            return false;
          }).length;
          var pedidosAtencionCount=pedidos.filter(function(ped){
            var estadoNorm=ped.estadoPedido==="pendiente"?"preparando":ped.estadoPedido;
            if(estadoNorm==="cancelado") return false;
            var pagado=(ped.pagos||[]).reduce(function(s,p){ return s+Number(p.monto); },0);
            var saldo=Math.max(0,Number(ped.total||0)-pagado);
            var tieneSaldo=saldo>0&&ped.total>0&&(estadoNorm==="preparando"||estadoNorm==="entregado");
            var sinEntregar=estadoNorm==="preparando"&&diasDesde(ped.fecha)>=5;
            return tieneSaldo||sinEntregar;
          }).length;
          var txtOps=opsRetomarSub+" oportunidad"+(opsRetomarSub===1?"":"es");
          var txtPed=pedidosAtencionCount+" pedido"+(pedidosAtencionCount===1?"":"s")+" que requieren tu atención";
          if(opsRetomarSub>0&&pedidosAtencionCount>0) subtitulo="Hoy tienes "+txtOps+" por retomar y "+txtPed+".";
          else if(opsRetomarSub>0) subtitulo="Tienes "+txtOps+" que vale la pena retomar hoy.";
          else if(pedidosAtencionCount>0) subtitulo="Tienes "+txtPed+" que conviene revisar hoy.";
          else if(clientes.length<5) subtitulo="Registra la actividad de ventas para "+empresa+" y descubre qué acciones generan más resultados.";
          else subtitulo="La herramienta que ayuda a "+empresa+" a vender mejor con cada cliente que registras.";
        } // fin esProductos

        var textoIdea=(function(){
          if(!esProductos) return preguntaSemana;

          // Lógica para productos
          if(motivoDominante&&motivoDominante[1]>=2){
            return "\""+motivoDominante[0]+"\" es el motivo que más se repite cuando un cliente no continúa. Ya sabes contra qué te enfrentas más seguido, eso te da ventaja para responderlo mejor la próxima vez.";
          }
          var oportunidadesActivas=clientes.filter(function(c){ return c.estadoProspecto&&c.estadoProspecto!=="Convertido"&&c.estadoProspecto!=="Perdido"; });
          var enSeguimiento=oportunidadesActivas.filter(function(c){ return c.estadoProspecto==="En seguimiento"; });
          var nuevas=oportunidadesActivas.filter(function(c){ return c.estadoProspecto==="Nueva"; });
          var pedidosActivos2=pedidos.filter(function(p){ return p.estadoPedido==="preparando"; });
          var conSaldo=pedidosActivos2.filter(function(p){
            var pagado=(p.pagos||[]).reduce(function(s,pg){ return s+Number(pg.monto); },0);
            return Number(p.total||0)>0&&pagado<Number(p.total);
          });

          if(enSeguimiento.length>0){
            var c=enSeguimiento[0]; var dias=diasDesde(c.fechaEtapa||c.fecha);
            var nombre=c.nombre.split(" ")[0];
            ideaDestino={tipo:"opo",id:c.id};
            if(dias>=4) return nombre+" lleva "+dias+" días con tu precio sin confirmar. A veces solo falta un mensaje que resuelva la última duda.";
            if(dias>=2) return nombre+" ya sabe el precio. ¿Le diste la opción de apartar con un anticipo pequeño?";
          }
          if(nuevas.length>0){
            var c2=nuevas[0]; var nombre2=c2.nombre.split(" ")[0];
            var dias2=diasDesde(c2.fechaEtapa||c2.fecha);
            ideaDestino={tipo:"opo",id:c2.id};
            if(c2.productoInteres) return nombre2+" preguntó por "+c2.productoInteres+" hace "+dias2+" días y aún no tiene precio. Entre más rápido le respondas, más probable es que compre.";
            return "Tienes "+nuevas.length+" oportunidad"+(nuevas.length>1?"es":"")+" nueva"+(nuevas.length>1?"s":"")+" sin precio. ¿Ya les escribiste?";
          }
          if(conSaldo.length>0){
            var ped=conSaldo[0]; var clP=clientes.find(function(c){ return c.id===ped.clienteId; });
            var nombreP=clP?clP.nombre.split(" ")[0]:"Tu cliente";
            var saldo=(Number(ped.total)||0)-(ped.pagos||[]).reduce(function(s,p){ return s+Number(p.monto); },0);
            ideaDestino={tipo:"pedido",id:ped.id};
            return nombreP+" tiene un saldo pendiente de $"+saldo.toLocaleString()+". ¿Ya coordinaron cuándo lo liquida?";
          }
          var preguntasProductos=[
            "¿Hay algún cliente que ya te compró y no has vuelto a contactar? Es más fácil venderle a alguien que ya confió en ti.",
            "¿Cuál de tus productos tiene más demanda? Ese merece estar siempre visible en tus redes.",
            "¿Tienes clientes que preguntaron pero no compraron? Un mensaje simple puede reactivar la conversación.",
            "¿Tu catálogo está completo con precios actualizados? Eso le ahorra tiempo a tus clientes y a ti.",
            "Un cliente satisfecho puede traerte 3 más. ¿Ya le pediste una recomendación a alguien que compró recientemente?"
          ];
          return preguntasProductos[diaNum%preguntasProductos.length];
        })();

        return e("div",{style:{display:"flex",flexDirection:"column",gap:0}},

          // BARRA SUPERIOR , solo botones
          e("div",{style:{display:"flex",alignItems:"center",justifyContent:isMobile?"space-between":"flex-end",gap:isMobile?6:8,marginLeft:isMobile?-16:-48,marginRight:isMobile?-16:-48,marginTop:isMobile?-20:-40,padding:isMobile?"12px 16px":"14px 48px",background:C.bg,flexWrap:"nowrap"}},
            isMobile&&e("div",{style:{width:36,height:36,borderRadius:10,background:C.dark,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginRight:"auto"}},
              e("svg",{width:22,height:22,viewBox:"0 0 100 100",fill:"none"},
                e("path",{d:"M72 28C65 20 54 16 44 18C28 21 17 35 17 50C17 65 28 79 44 82C54 84 65 80 72 72",stroke:"#fff",strokeWidth:12,strokeLinecap:"round",fill:"none"}),
                e("path",{d:"M62 38C57 33 50 30 44 31C34 33 27 41 27 50C27 59 34 67 44 69C50 70 57 67 62 62",stroke:"rgba(255,255,255,0.35)",strokeWidth:8,strokeLinecap:"round",fill:"none"})
              )
            ),
            esProductos
              ? e(TopBarProductos,{open:menuNuevo,setOpen:setMenuNuevo,isMobile:isMobile,C:C,st:st,
                  onCliente:function(){ setClienteSel(null); setForm(formVacio); setModalCliente(true); },
                  onProspecto:function(){ setFormProspecto({clienteId:"",nuevoNombre:"",origen:"",canalPrincipal:"",contacto:"",productoInteres:"",precioInteres:"",envioPrecio:false,notas:""}); setBuscaCliOpo(""); setModalProspecto(true); setVista("prospectos"); },
                  onPedido:function(){ setNuevoPedidoForm({clienteId:"",nuevoNombre:"",productos:"",cantidad:1,total:"",anticipo:"",fechaEntrega:"",notas:""}); setBuscaCliPed(""); setNuevoPedidoModal(true); setVista("pedidos"); },
                  onVenta:abrirModalVenta})
              : e(TopBarServicios,{open:menuNuevo,setOpen:setMenuNuevo,isMobile:isMobile,C:C,st:st,
                  onCliente:function(){ setClienteSel(null); setForm(formVacio); setModalCliente(true); },
                  onCot:function(){ setModalCot(true); },
                  onVenta:abrirModalVenta})
          ),
          e("div",{style:{marginBottom:20,paddingTop:24}},
            e("div",{style:{fontSize:isMobile?26:32,fontWeight:700,color:C.text,lineHeight:1.1}},saludo+", "+nombre+" 👋"),
            isMobile&&e("div",{style:{fontSize:13,fontWeight:500,color:C.purple,marginTop:6,letterSpacing:"0.1px"}},"CLEO · Nunca emprendas solo"),
            e("div",{style:{fontSize:12,color:C.textDim,marginTop:isMobile?4:4}},hoyLabel),
            !isMobile&&e("div",{style:{fontSize:14,color:C.textMuted,marginTop:8}},subtitulo)
          ),

          // QUÉ HA PASADO , registro rápido de actividad
          e("div",{style:{background:C.surface,borderRadius:20,padding:"28px",border:"1px solid "+C.border,boxShadow:"0 2px 12px rgba(0,0,0,0.06)",marginBottom:20}},
            e("div",{style:{fontSize:isMobile?18:20,fontWeight:700,color:C.text,marginBottom:4}},"¿Qué ha pasado en "+empresa+"?"),
            e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:18}},"Registra algo nuevo para mantener tus ventas al día."),
            e("div",{style:{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:10}},
              [
                {ic:"💬",label:"Alguien preguntó",onClick:function(){ if(esProductos){ setPasoPreguntoP(1); } else { setPasoPregunto(1); } }},
                {ic:"🏷️",label:"Envié un precio",onClick:function(){ if(esProductos){ setModalEnvieP(true); } else { setModalEnvie(true); } }},
                {ic:"🛒",label:"Cerré una venta",onClick:function(){ if(esProductos){ setModalCerreP(true); } else { setModalCerre(true); } }},
                {ic:"💰",label:"Recibí un pago",onClick:function(){ if(esProductos){ setModalRecibiP(true); } else { setModalRecibi(true); } }}
              ].map(function(op,i){
                return e("button",{key:i,style:{cursor:"pointer",padding:"12px 14px",borderRadius:12,border:"1px solid "+C.border,background:C.bg,fontSize:13,color:C.text,fontWeight:500,display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left"},onClick:op.onClick},
                  e("span",{style:{fontSize:15,flexShrink:0}},op.ic),
                  e("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},op.label)
                );
              })
            )
          ),

          // CELEBRACIÓN , primer cliente registrado
          false&&(function(){
            var pctP=calcPctPerfil(perfil);
            if(pctP>=80) return e("div",{style:{background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:14,padding:"16px 20px",marginBottom:20,display:"flex",alignItems:"center",gap:14}},
              e("span",{style:{fontSize:24,flexShrink:0}},"🎉"),
              e("div",{style:{flex:1}},
                e("div",{style:{fontSize:13,fontWeight:700,color:"#166534",marginBottom:2}},"CLEO ya está listo para ayudarte a vender mejor."),
                e("div",{style:{fontSize:13,color:"#15803D",lineHeight:1.5}},"Registraste tu primer cliente. Sigue agregando y CLEO te dirá exactamente qué está funcionando.")
              )
            );
            return e("div",{style:{background:"#EEF2FF",border:"1px solid #C7D2FE",borderRadius:14,padding:"16px 20px",marginBottom:20,display:"flex",alignItems:"center",gap:14}},
              e("span",{style:{fontSize:22,flexShrink:0}},"🎉"),
              e("div",{style:{flex:1}},
                e("div",{style:{fontSize:13,fontWeight:700,color:"#3730A3",marginBottom:2}},"Ya completaste 1 de 2 pasos para empezar."),
                e("div",{style:{fontSize:13,color:"#4338CA",lineHeight:1.5,marginBottom:10}},"Solo falta configurar tu perfil para que CLEO pueda ayudarte mejor."),
                e("button",{style:{cursor:"pointer",padding:"7px 16px",borderRadius:10,border:"none",background:C.purple,fontSize:13,color:"#fff",fontWeight:600},
                  onClick:function(){ setFormPerfil(Object.assign({},perfil)); setModalPerfil(true); }},"Configurar perfil →")
              )
            );
          })(),

          // RECONOCIMIENTO , solo visible si aplica, desaparece después de 2 días
          reconocimiento&&reconocimiento.texto!==reconocimientoCerrado&&e("div",{style:{
            background:"#F0FDF4",border:"1px solid #86EFAC",borderRadius:14,
            padding:"14px 20px",marginBottom:20,
            display:"flex",alignItems:"center",gap:14
          }},
            e("span",{style:{fontSize:22,flexShrink:0}},reconocimiento.icono),
            e("div",{style:{flex:1}},
              e("div",{style:{fontSize:13,fontWeight:700,color:"#166534",marginBottom:2}},reconocimiento.titulo),
              e("div",{style:{fontSize:13,color:"#15803D",lineHeight:1.5}},reconocimiento.texto)
            ),
            e("button",{style:{background:"none",border:"none",cursor:"pointer",color:"#15803D",opacity:0.6,fontSize:18,lineHeight:1,padding:"0 4px",flexShrink:0},onClick:function(){ setReconocimientoCerrado(reconocimiento.texto); }},"×")
          ),


          // CARD METRICAS — condicional por modo
          esProductos?(function(){
            // ── DATOS PARA PRODUCTOS ─────────────────────────────────────────
            var hoyStr=fmtFechaLocal(HOY);
            var inicioSem=new Date(HOY); inicioSem.setDate(HOY.getDate()-HOY.getDay());

            // 💰 Dinero reciente: pagos de pedidos + ventas rápidas de los últimos 30 días
            var ingresosHoy=0; var ingresosSemana=0;
            pedidos.forEach(function(ped){
              (ped.pagos||[]).forEach(function(p){
                var fp=new Date(p.fecha+"T12:00:00"); fp.setHours(0,0,0,0);
                var hoyD=new Date(HOY); hoyD.setHours(0,0,0,0);
                var diff=Math.round((hoyD-fp)/(1000*60*60*24));
                if(diff===0) ingresosHoy+=Number(p.monto);
                if(fp>=inicioSem) ingresosSemana+=Number(p.monto);
              });
            });
            ventas.forEach(function(v){
              var fv=new Date(v.fecha+"T12:00:00"); fv.setHours(0,0,0,0);
              var hoyD=new Date(HOY); hoyD.setHours(0,0,0,0);
              var diff=Math.round((hoyD-fv)/(1000*60*60*24));
              var monto=Number(v.monto)||0;
              if(diff===0) ingresosHoy+=monto;
              if(fv>=inicioSem) ingresosSemana+=monto;
            });

            // 📦 Pedidos activos (no entregados ni cancelados)
            var pedidosActivos=pedidos.filter(function(p){ return p.estadoPedido==="preparando"||p.estadoPedido==="pendiente"; });
            var pedidosSaldo=pedidosActivos.reduce(function(s,p){
              var pagado=(p.pagos||[]).reduce(function(a,pg){ return a+Number(pg.monto); },0);
              return s+Math.max(0,Number(p.total||0)-pagado);
            },0);

            // 🎯 Prospectos nuevos (estado "Nuevo")
            var prospectoNuevos=clientes.filter(function(c){ return c.estadoProspecto==="Nuevo"; });
            var prospectosSeguimiento=clientes.filter(function(c){ return c.estadoProspecto==="En seguimiento"||c.estadoProspecto==="Sin respuesta"; });

            // 🔴 Urgentes: prospectos sin contacto hace +3 días
            var urgentesTodas=clientes.filter(function(c){
              if(!c.estadoProspecto||c.estadoProspecto==="Convertido"||c.estadoProspecto==="Perdido") return false;
              if(c.seguimientoFecha&&c.seguimientoFecha<=FECHA_HOY) return true;
              var dias=diasDesde(c.fechaEtapa||c.fecha);
              if(c.estadoProspecto==="Nueva") return dias>=3;
              if(c.estadoProspecto==="En seguimiento") return dias>=4;
              return false;
            }).sort(function(a,b){ return diasDesde(b.fechaEtapa||b.fecha)-diasDesde(a.fechaEtapa||a.fecha); });

            var calientes=clientes.filter(function(c){ return c.estadoProspecto==="En seguimiento"; });
            var totalCalientes=calientes.reduce(function(s,c){ return s+(Number(c.precioInteres)||0); },0);

            // Pedidos que requieren acción , mismo criterio que Hoy
            var pedidosAccionTodos=[];
            pedidos.forEach(function(ped){
              var estadoNorm=ped.estadoPedido==="pendiente"?"preparando":ped.estadoPedido;
              if(estadoNorm==="cancelado") return;
              var clPed=clientes.find(function(c){ return c.id===ped.clienteId; });
              var pagadoPed=(ped.pagos||[]).reduce(function(s,p){ return s+Number(p.monto); },0);
              var saldoPed=Math.max(0,Number(ped.total||0)-pagadoPed);
              if(saldoPed>0&&ped.total>0&&estadoNorm==="preparando"){
                pedidosAccionTodos.push({ped:ped,cl:clPed,tipo:"cobro",msg:"Saldo pendiente: $"+saldoPed.toLocaleString(),color:"#F59E0B",bg:"#FFFBEB"});
              }
              if(estadoNorm==="entregado"&&saldoPed>0&&ped.total>0){
                pedidosAccionTodos.push({ped:ped,cl:clPed,tipo:"cobro_entregado",msg:"Ya entregado · Falta cobrar $"+saldoPed.toLocaleString(),color:"#EF4444",bg:"#FEF2F2"});
              }
              if(estadoNorm==="preparando"&&diasDesde(ped.fecha)>=5){
                pedidosAccionTodos.push({ped:ped,cl:clPed,tipo:"atrasado",msg:"Lleva "+diasDesde(ped.fecha)+" días sin marcarse como entregado",color:"#EF4444",bg:"#FEF2F2"});
              }
            });

            // Combinar oportunidades y pedidos alternando, límite conjunto de 3 (igual que Servicios)
            var urgentes=[],pedidosAccionIni=[];
            var iU=0,iP=0;
            while(urgentes.length+pedidosAccionIni.length<3&&(iU<urgentesTodas.length||iP<pedidosAccionTodos.length)){
              if(iU<urgentesTodas.length){ urgentes.push(urgentesTodas[iU]); iU++; }
              if(urgentes.length+pedidosAccionIni.length<3&&iP<pedidosAccionTodos.length){ pedidosAccionIni.push(pedidosAccionTodos[iP]); iP++; }
            }

            return e("div",null,
              // CARD MORADA — Oportunidades en seguimiento, mismo estilo y mensaje que la de Servicios
              calientes.length>0&&e("div",{style:{background:C.purplePale,border:"1px solid "+C.purple+"33",borderRadius:16,padding:"18px 20px",marginBottom:24,display:"flex",alignItems:"center",gap:16,cursor:"pointer"},onClick:function(){ setVista("prospectos"); setFiltroProspecto("En seguimiento"); }},
                e("div",{style:{flex:1,minWidth:0}},
                  e("div",{style:{fontSize:15,fontWeight:700,color:C.text}},totalCalientes>0?"Hay $"+totalCalientes.toLocaleString()+" que todavía "+(calientes.length>1?"podrían":"podría")+" convertirse en venta.":"Vale la pena darles seguimiento hoy.")
                ),
                e("div",{style:{fontSize:13,fontWeight:600,color:C.purple,display:"flex",alignItems:"center",gap:4,flexShrink:0}},"Ver oportunidades ","→")
              ),

              // A QUIÉN CONTACTAR HOY , mismo diseño que Servicios
              e("div",{style:{background:C.surface,borderRadius:20,padding:"28px",border:"1px solid "+C.border,boxShadow:"0 2px 12px rgba(0,0,0,0.06)",marginBottom:20}},
                e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4,gap:12}},
                  e("div",{style:{fontSize:15,fontWeight:700,color:C.text}},"A quién contactar hoy"),
                  urgentes.length>0&&e("button",{style:{cursor:"pointer",background:"none",border:"none",color:C.purple,fontSize:13,fontWeight:600,padding:0,flexShrink:0,whiteSpace:"nowrap"},onClick:function(){ setVista("hoy"); }},"Ver todo →")
                ),
                e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:20,lineHeight:1.6}},
                  urgentes.length>0?"Estas son las acciones que más necesitan tu atención.":"Todo importante está atendido por hoy."
                ),
                urgentes.length>0&&e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10,display:"flex",alignItems:"center",gap:8}},
                  "🎯 OPORTUNIDADES POR RETOMAR",
                  e("span",{style:{fontSize:11,padding:"2px 8px",borderRadius:10,background:C.purple+"18",color:C.purple,fontWeight:700}},urgentes.length)
                ),
                urgentes.length===0
                  ? e("div",{style:{fontSize:13,color:C.textMuted,padding:"12px 0",textAlign:"center"}},"✓ Todo al día, sin pendientes urgentes.")
                  : e("div",{style:{display:"flex",flexDirection:"column",gap:10}},
                      urgentes.map(function(c){
                        var dias=diasDesde(c.fechaEtapa||c.fecha);
                        var nombre=c.nombre.split(" ")[0];
                        var producto=c.productoInteres;
                        var msg=c.estadoProspecto==="En seguimiento"&&producto
                          ?(dias<=3?""+nombre+" lleva "+dias+" días con tu precio de "+producto+". ¿Ya le escribiste?":
                            ""+nombre+" lleva "+dias+" días con tu precio de "+producto+" sin responder. ¿Ya le escribiste para ver si tiene dudas?")
                          :c.estadoProspecto==="Nueva"&&producto
                          ?(c.seguimientoFecha&&c.seguimientoFecha<=FECHA_HOY?"Hoy es el día que programaste para enviarle el precio de "+producto+" a "+nombre+".":"Registraste a "+nombre+" hace "+dias+" días con interés en "+producto+". Aún no le has enviado precio.")
                          :"Registraste a "+nombre+" hace "+dias+" días y aún no la has contactado.";
                        var prio=dias>=7?"alta":dias>=4?"media":"baja";
                        var ac=avatarColor(c.id);
                        return e("div",{key:c.id,style:{display:"flex",alignItems:"center",gap:12,padding:"14px",border:"1px solid "+C.border,borderRadius:14,flexWrap:isMobile?"wrap":"nowrap"}},
                          e("div",{style:{padding:"4px 10px",borderRadius:20,background:prioBg[prio],color:prioColor[prio],fontSize:10,fontWeight:700,letterSpacing:"0.3px",flexShrink:0,minWidth:132,textAlign:"center",flex:isMobile?"1 1 100%":"0 0 auto"}},prioLabel[prio]),
                          e("div",{style:{display:"flex",alignItems:"flex-start",gap:12,flex:isMobile?"1 1 100%":"1 1 auto",minWidth:0}},
                          e("div",{style:{width:40,height:40,borderRadius:"50%",background:ac+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:ac,flexShrink:0}},iniciales(c.nombre)),
                          e("div",{style:{flex:1,minWidth:isMobile?0:200}},
                            e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:2}},c.nombre),
                            e("div",{style:{fontSize:12,color:C.textMuted,lineHeight:1.4}},msg)
                          ),
                          ) // cierra grupo avatar + texto
                          ,
                          e("div",{style:{display:"flex",gap:8,flexShrink:0,minWidth:266,flex:isMobile?"1 1 100%":"0 0 auto"}},
                            e(BtnCanal,{cliente:c,small:false}),
                            e("button",{style:{cursor:"pointer",padding:"9px 16px",borderRadius:10,border:"1px solid "+C.border,background:"transparent",fontSize:12,color:C.textMuted,fontWeight:500,whiteSpace:"nowrap",flex:1},onClick:function(){ setVista("prospectos"); setFiltroProspecto("todos"); setHighlightOpoId(c.id); }},
                              "Ver oportunidad →"
                            )
                          )
                        );
                      })
                    )
              ,

              // Pedidos que requieren acción , dentro de la misma tarjeta A quién contactar hoy
              pedidosAccionIni.length>0&&e("div",{style:{marginTop:20}},
                e("div",{style:{fontSize:11,fontWeight:700,color:C.amber,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10,display:"flex",alignItems:"center",gap:8}},
                  "📦 PEDIDOS QUE REQUIEREN ACCIÓN",
                  e("span",{style:{fontSize:11,padding:"2px 8px",borderRadius:10,background:C.amber+"22",color:C.amber,fontWeight:700}},pedidosAccionIni.length)
                ),
                e("div",{style:{display:"flex",flexDirection:"column",gap:10}},
                  pedidosAccionIni.map(function(item){
                    var clP=item.cl;
                    var acP=clP?avatarColor(clP.id):"#94A3B8";
                    return e("div",{key:item.ped.id+"_"+item.tipo,style:{display:"flex",alignItems:"center",gap:12,padding:"14px",border:"1px solid "+C.border,borderRadius:14,flexWrap:isMobile?"wrap":"nowrap"}},
                      e("div",{style:{padding:"4px 10px",borderRadius:20,background:item.bg,color:item.color,fontSize:10,fontWeight:700,letterSpacing:"0.3px",flexShrink:0,minWidth:132,textAlign:"center",flex:isMobile?"1 1 100%":"0 0 auto"}},item.tipo==="atrasado"?"SIN ENTREGAR":"SALDO PENDIENTE"),
                      e("div",{style:{display:"flex",alignItems:"flex-start",gap:12,flex:isMobile?"1 1 100%":"1 1 auto",minWidth:0}},
                      e("div",{style:{width:40,height:40,borderRadius:"50%",background:acP+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:acP,flexShrink:0}},clP?iniciales(clP.nombre):"?"),
                      e("div",{style:{flex:1,minWidth:isMobile?0:200}},
                        e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:2}},clP?clP.nombre:"Cliente"),
                        e("div",{style:{fontSize:12,color:C.textMuted,lineHeight:1.4}},item.msg+(item.ped.productos?" · "+item.ped.productos:""))
                      ),
                      ) // cierra grupo avatar + texto
                      ,
                      e("div",{style:{display:"flex",gap:8,flexShrink:0,minWidth:266,flex:isMobile?"1 1 100%":"0 0 auto"}},
                        clP&&e(BtnCanal,{cliente:clP,small:false}),
                        e("button",{style:{cursor:"pointer",padding:"9px 16px",borderRadius:10,border:"1px solid "+C.border,background:"transparent",fontSize:12,color:C.textMuted,fontWeight:500,whiteSpace:"nowrap",flex:1},onClick:function(){ setVista("pedidos"); setHighlightPedidoId(item.ped.id); }},
                          "Ver pedido →"
                        )
                      )
                    );
                  })
                )
              )
            )
            ,

              // IDEA DEL DÍA , misma tarjeta que Servicios
              e("div",{style:{
                background:"#EEF2FF",border:"1px solid #C7D2FE",borderRadius:14,
                padding:"16px 20px",marginBottom:24,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12
              }},
                e("div",{style:{flex:1,minWidth:0}},
                  e("div",{style:{fontSize:11,fontWeight:700,color:"#4338CA",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:6}},"💡 Idea del día"),
                  e("div",{style:{fontSize:14,color:"#312E81",lineHeight:1.6}},textoIdea)
                )
              )
            );
          })():e("div",null,
          // CARD PROPUESTAS ESPERANDO RESPUESTA (SERVICIOS)
          cotsPend.length>0&&e("div",{style:{background:C.purplePale,border:"1px solid "+C.purple+"33",borderRadius:16,padding:"18px 20px",marginBottom:24,display:"flex",alignItems:"center",gap:16,cursor:"pointer"},onClick:function(){ setVista("cotizaciones"); setFiltroCot(Object.assign({},filtroCot,{estatus:"Pendiente"})); }},
            e("div",{style:{width:44,height:44,borderRadius:12,background:C.purple,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:20}},"📄"),
            e("div",{style:{flex:1,minWidth:0}},
              e("div",{style:{fontSize:15,fontWeight:700,color:C.text}},totalPend>0?"Hay $"+totalPend.toLocaleString()+" que todavía "+(cotsPend.length>1?"podrían":"podría")+" convertirse en venta.":"Vale la pena darles seguimiento hoy.")
            ),
            e("div",{style:{fontSize:13,fontWeight:600,color:C.purple,display:"flex",alignItems:"center",gap:4,flexShrink:0}},"Ver propuestas ","→")
          ),

          // STACK VERTICAL (antes 60/40)
          e("div",{style:{display:"flex",flexDirection:"column",gap:20,marginBottom:20}},

            // ACCIONES TOP 3
            e("div",{style:{background:C.surface,borderRadius:20,padding:"28px",border:"1px solid "+C.border,boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}},
              (function(){ var hayCobrosPendientes=cobrosTodosIni.length>0;
              var totalRestantes=accionesRestantes+cobrosRestantesIni;
              return [
              e("div",{key:"tit",style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4,gap:12}},
                e("div",{style:{fontSize:15,fontWeight:700,color:C.text}},"A quién contactar hoy"),
                totalRestantes>0&&e("button",{style:{cursor:"pointer",background:"none",border:"none",color:C.purple,fontSize:13,fontWeight:600,padding:0,flexShrink:0,whiteSpace:"nowrap"},onClick:function(){ setVista("hoy"); }},
                  "Ver todo →"
                )
              ),
              e("div",{key:"sub",style:{fontSize:13,color:C.textMuted,marginBottom:20,lineHeight:1.6}},
                acciones.length>0&&hayCobrosPendientes
                  ? "Estas son las acciones que más necesitan tu atención."
                  : acciones.length>0
                    ? "Estas conversaciones necesitan un siguiente paso."
                    : hayCobrosPendientes
                      ? "Hay pagos pendientes que conviene recordar hoy."
                      : "Todo importante está atendido por hoy."
              ),

              // CONVERSACIONES POR RETOMAR , se oculta por completo si no hay conversaciones pero sí hay cobros
              (acciones.length>0||!hayCobrosPendientes)&&e("div",{key:"conv",style:{}},
              e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10,display:"flex",alignItems:"center",gap:8}},
                "💬 CONVERSACIONES POR RETOMAR",
                acciones.length>0&&e("span",{style:{fontSize:11,padding:"2px 8px",borderRadius:10,background:C.purple+"18",color:C.purple,fontWeight:700}},acciones.length)
              ),
              acciones.length===0
                ? e("div",{style:{fontSize:13,color:C.textMuted,padding:"12px 0 20px",textAlign:"center"}},"✓ Todo al día, sin pendientes urgentes.")
                : e("div",{style:{display:"flex",flexDirection:"column",gap:10,marginBottom:24}},
                    acciones.map(function(a,i){
                      var ac=avatarColor(a.cliente.id);
                      var cotCliente=cotizaciones.filter(function(cc){ return cc.clienteId===a.cliente.id; }).sort(function(x,y){ return new Date(y.fecha)-new Date(x.fecha); })[0];
                      return e("div",{key:i,style:{display:"flex",alignItems:"center",gap:12,padding:"14px",border:"1px solid "+C.border,borderRadius:14,flexWrap:isMobile?"wrap":"nowrap"}},
                        e("div",{style:{padding:"4px 10px",borderRadius:20,background:prioBg[a.prioridad],color:prioColor[a.prioridad],fontSize:10,fontWeight:700,letterSpacing:"0.3px",flexShrink:0,minWidth:132,textAlign:"center",flex:isMobile?"1 1 100%":"0 0 auto"}},prioLabel[a.prioridad]),
                        e("div",{style:{display:"flex",alignItems:"flex-start",gap:12,flex:isMobile?"1 1 100%":"1 1 auto",minWidth:0}},
                        e("div",{style:{width:40,height:40,borderRadius:"50%",background:ac+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:ac,flexShrink:0}},iniciales(a.cliente.nombre)),
                        e("div",{style:{flex:1,minWidth:isMobile?0:200}},
                          e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:2}},a.cliente.nombre),
                          e("div",{style:{fontSize:12,color:C.textMuted,lineHeight:1.4}},a.desc)
                        ),
                        ) // cierra grupo avatar + texto
                        ,
                        e("div",{style:{textAlign:isMobile?"left":"right",flexShrink:0,minWidth:100,marginRight:isMobile?0:8,flex:isMobile?"1 1 100%":"0 0 auto"}},
                          cotCliente&&e("div",{style:{fontSize:15,fontWeight:700,color:C.text}},"$"+Number(cotCliente.monto).toLocaleString())
                        ),
                        e("div",{style:{display:"flex",gap:8,flexShrink:0,minWidth:266,flex:isMobile?"1 1 100%":"0 0 auto"}},
                          e("button",{style:{cursor:"pointer",padding:"9px 16px",borderRadius:10,border:"none",background:C.purple,fontSize:12,color:"#fff",fontWeight:600,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap",flex:1,justifyContent:"center"},onClick:function(){ setSugerenciaClienteId(a.cliente.id); }},
                            "💬 Contactar"
                          ),
                          e("button",{style:{cursor:"pointer",padding:"9px 16px",borderRadius:10,border:"1px solid "+C.border,background:"transparent",fontSize:12,color:C.textMuted,fontWeight:500,whiteSpace:"nowrap",flex:1},onClick:function(){ setContactadoClienteId(a.cliente.id); }},
                            "✓ Ya le hablé"
                          )
                        )
                      );
                    })
                  ),
              ),
              ]; })(),

              // COBROS PENDIENTES , cotizaciones aceptadas con saldo (ya vendiste, falta cobrar)
              (function(){
                if(cobrosTodosIni.length===0) return null;
                return e("div",null,
                  e("div",{style:{fontSize:11,fontWeight:700,color:C.amber,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10,display:"flex",alignItems:"center",gap:8}},
                    "💰 COBROS PENDIENTES",
                    e("span",{style:{fontSize:11,padding:"2px 8px",borderRadius:10,background:C.amber+"22",color:C.amber,fontWeight:700}},cobrosTodosIni.length)
                  ),
                  e("div",{style:{display:"flex",flexDirection:"column",gap:10}},
                    cobrosPendientes.map(function(x,i){
                      var ac=avatarColor(x.cliente.id);
                      var pagado=Number(x.cot.monto)-x.saldo;
                      var descSaldo=pagado<=0
                        ?"Aún no ha pagado nada de esta cotización."
                        :"Ya pagó $"+pagado.toLocaleString()+". Quedó pendiente un saldo de $"+x.saldo.toLocaleString()+".";
                      var pagosX=x.cot.pagos||[];
                      return e("div",{key:i,style:{display:"flex",alignItems:"center",gap:12,padding:"14px",border:"1px solid "+C.border,borderRadius:14,flexWrap:isMobile?"wrap":"nowrap"}},
                        e("div",{style:{padding:"4px 10px",borderRadius:20,background:"#FFFBEB",color:C.amber,fontSize:10,fontWeight:700,letterSpacing:"0.3px",flexShrink:0,minWidth:132,textAlign:"center",flex:isMobile?"1 1 100%":"0 0 auto"}},"COBRO PENDIENTE"),
                        e("div",{style:{display:"flex",alignItems:"flex-start",gap:12,flex:isMobile?"1 1 100%":"1 1 auto",minWidth:0}},
                        e("div",{style:{width:40,height:40,borderRadius:"50%",background:ac+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:ac,flexShrink:0}},iniciales(x.cliente.nombre)),
                        e("div",{style:{flex:1,minWidth:isMobile?0:200}},
                          e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:2}},x.cliente.nombre),
                          e("div",{style:{fontSize:12,color:C.textMuted,lineHeight:1.4}},descSaldo)
                        ),
                        ) // cierra grupo avatar + texto
                        ,
                        e("div",{style:{textAlign:isMobile?"left":"right",flexShrink:0,minWidth:100,marginRight:isMobile?0:8,flex:isMobile?"1 1 100%":"0 0 auto"}},
                          e("div",{style:{fontSize:15,fontWeight:700,color:C.amber}},"$"+x.saldo.toLocaleString())
                        ),
                        e("div",{style:{display:"flex",gap:8,flexShrink:0,minWidth:266,flex:isMobile?"1 1 100%":"0 0 auto"}},
                          e("button",{style:{cursor:"pointer",padding:"9px 16px",borderRadius:10,border:"none",background:C.purple,fontSize:12,color:"#fff",fontWeight:600,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap",flex:1,justifyContent:"center"},onClick:function(){ var url=contactUrl(x.cliente,"Hola "+x.cliente.nombre.split(" ")[0]+", te escribo para ver cómo va el pago pendiente de "+(x.cot.concepto||"tu cotización")+"."); if(url) window.open(url,"_blank"); else setClienteCompletarId(x.cliente.id); }},
                            "💬 Contactar"
                          ),
                          e("button",{style:{cursor:"pointer",padding:"9px 16px",borderRadius:10,border:"1px solid "+C.border,background:"transparent",fontSize:12,color:C.textMuted,fontWeight:500,whiteSpace:"nowrap",flex:1},onClick:function(){ setPagosModalTipo(x.tipo); setPagosModalId(x.cot.id); setFormPago({monto:"",fecha:FECHA_HOY,concepto:pagosX.length===0?"Anticipo":"Pago"}); }},
                            "+ Registrar pago"
                          )
                        )
                      );
                    })
                  )
                );
              })()
            ),
          // PREGUNTA DEL DÍA , justo debajo del saludo
          e("div",{style:{
            background:"#EEF2FF",border:"1px solid #C7D2FE",borderRadius:14,
            padding:"16px 20px",marginBottom:24,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12
          }},
            e("div",{style:{flex:1,minWidth:0}},
              e("div",{style:{fontSize:11,fontWeight:700,color:"#4338CA",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:6}},"💡 Idea del día"),
              e("div",{style:{fontSize:14,color:"#312E81",lineHeight:1.6}},textoIdea)
            )
          ),

          )
          )
        );
      })(),

      // PIPELINE
      vista==="pipeline"&&(function(){

        // Frase educativa , detecta patron en el kanban
        var enNegociacionDias=clientes.filter(function(c){ return c.etapa==="Negociacion"&&diasDesde(c.fechaEtapa||c.fecha)>=3; }).length;
        var enNuevoContacto=clientes.filter(function(c){ return c.etapa==="Nuevo contacto"; }).length;
        var clientesActivos=clientes.filter(function(c){ return c.etapa!=="Ganado"&&c.etapa!=="Perdido"; }).length;
        var perdidasRecientes=clientes.filter(function(c){ return c.etapa==="Perdido"&&diasDesde(c.fechaEtapa||c.fecha)<=7; }).length;
        var etapaMasLlena=["Nuevo contacto","Cotizacion enviada","Negociacion"].reduce(function(max,et){
          var n=clientes.filter(function(c){ return c.etapa===et; }).length;
          return n>max.n?{et:et,n:n}:max;
        },{et:"",n:0});
        var frase;
        if(enNegociacionDias>=2) frase="Los clientes en negociación suelen necesitar que alguien los ayude a decidir, no que los presionen. Una pregunta abierta puede destrabar mucho.";
        else if(etapaMasLlena.et==="Nuevo contacto"&&etapaMasLlena.n>=3) frase="Tienes buenos prospectos. El siguiente paso es conocerlos mejor antes de hablarles de precio.";
        else if(perdidasRecientes>=1) frase="Perder un cliente no es el final, a veces es el inicio de una mejor conversación más adelante.";
        else if(clientesActivos>=3) frase="Tus clientes están bien distribuidos entre etapas. Eso significa que estás dándole atención a cada uno, sigue así.";
        else frase="Cada cliente que registras es una conversación que no se va a perder. Sigue moviéndolos de etapa conforme avancen.";

        return e("div",{style:{display:"flex",flexDirection:"column",gap:0}},

          // BOTONES , arriba a la derecha solos
          e("div",{style:{display:"flex",alignItems:"center",justifyContent:isMobile?"space-between":"flex-end",gap:isMobile?6:8,marginLeft:isMobile?-16:-48,marginRight:isMobile?-16:-48,marginTop:isMobile?-20:-40,padding:isMobile?"12px 16px":"14px 48px",background:C.bg,flexWrap:"nowrap"}},
            isMobile&&e("div",{style:{
              width:36,height:36,borderRadius:10,
              background:C.dark,
              display:"flex",alignItems:"center",justifyContent:"center",
              flexShrink:0,marginRight:"auto"
            }},
              e("svg",{width:22,height:22,viewBox:"0 0 100 100",fill:"none"},
                e("path",{d:"M72 28C65 20 54 16 44 18C28 21 17 35 17 50C17 65 28 79 44 82C54 84 65 80 72 72",stroke:"#fff",strokeWidth:12,strokeLinecap:"round",fill:"none"}),
                e("path",{d:"M62 38C57 33 50 30 44 31C34 33 27 41 27 50C27 59 34 67 44 69C50 70 57 67 62 62",stroke:"rgba(255,255,255,0.35)",strokeWidth:8,strokeLinecap:"round",fill:"none"})
              )
            ),
            esProductos
              ? e(TopBarProductos,{open:menuNuevo,setOpen:setMenuNuevo,isMobile:isMobile,C:C,st:st,
                  onCliente:function(){ setClienteSel(null); setForm(formVacio); setModalCliente(true); },
                  onProspecto:function(){ setFormProspecto({clienteId:"",nuevoNombre:"",origen:"",canalPrincipal:"",contacto:"",productoInteres:"",precioInteres:"",envioPrecio:false,notas:""}); setBuscaCliOpo(""); setModalProspecto(true); setVista("prospectos"); },
                  onPedido:function(){ setNuevoPedidoForm({clienteId:"",nuevoNombre:"",productos:"",cantidad:1,total:"",anticipo:"",fechaEntrega:"",notas:""}); setBuscaCliPed(""); setNuevoPedidoModal(true); setVista("pedidos"); },
                  onVenta:abrirModalVenta})
              : e(TopBarServicios,{open:menuNuevo,setOpen:setMenuNuevo,isMobile:isMobile,C:C,st:st,
                  onCliente:function(){ setClienteSel(null); setForm(formVacio); setModalCliente(true); },
                  onCot:function(){ setModalCot(true); },
                  onVenta:abrirModalVenta})
          ),

          // TÍTULO + FRASE EDUCATIVA
          e("div",{style:{paddingTop:24,marginBottom:24}},
            e("div",{style:{fontSize:28,fontWeight:700,color:C.text,lineHeight:1.1,marginBottom:6}},esProductos?"Tus clientes":"Tus seguimientos"),
            e("div",{style:{fontSize:14,color:C.textMuted}},esProductos?frase:"Mira en qué va cada conversación y qué necesita para avanzar.")
          ),

          // KANBAN
          e("div",{style:{overflowX:"auto",paddingBottom:8,marginLeft:isMobile?-16:0,marginRight:isMobile?-16:0}},
            e("div",{style:{display:"flex",gap:12,minWidth:isMobile?"unset":"max-content",width:"100%"}},
              ETAPAS.map(function(etapa){
                var cols=clientesFiltrados.filter(function(c){
                  if(c.etapa!==etapa) return false;
                  if(etapa!=="Ganado"&&etapa!=="Perdido") return true;
                  if(mostrarArchivados) return true;
                  var cotC=cotizaciones.find(function(cot){ return Number(cot.clienteId)===Number(c.id)&&cot.estatus==="Aceptada"; });
                  if(cotC){
                    var pagosC=cotC.pagos||[];
                    var totalPagadoC=pagosC.reduce(function(s,p){ return s+Number(p.monto); },0);
                    if(cotC.monto-totalPagadoC>0) return true;
                  }
                  return diasDesde(c.fechaEtapa||c.fecha)<=7;
                });
                var ec=ETAPA_COLOR[etapa]||C.purple;
                var isDragOver=dragOver===etapa;
                var totalCol=cols.reduce(function(s,c){
                  var cot=cotizaciones.find(function(q){ return Number(q.clienteId)===Number(c.id)&&(q.estatus==="Pendiente"||q.estatus==="Aceptada"); });
                  return s+(cot?cot.monto:0);
                },0);
                return e("div",{key:etapa,
                  style:{flex:isMobile?"0 0 85vw":"1 1 0",minWidth:isMobile?"85vw":150,display:"flex",flexDirection:"column"},
                  onDragOver:function(ev){ onDragOver(ev,etapa); },
                  onDrop:function(ev){ onDrop(ev,etapa); },
                  onDragLeave:function(){ setDragOver(null); }
                },

                  // ENCABEZADO columna
                  e("div",{style:{
                    background:C.surface,borderRadius:14,
                    border:"1px solid "+C.border,
                    boxShadow:"0 2px 8px rgba(0,0,0,0.04)",
                    padding:"12px 12px 10px",marginBottom:8,
                    height:88,boxSizing:"border-box",
                    flexShrink:0,overflow:"hidden",
                    display:"flex",flexDirection:"column",justifyContent:"space-between"
                  }},
                    e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}},
                      e("div",{style:{flex:1,minWidth:0,marginRight:6}},
                        e("div",{style:{fontSize:11,fontWeight:700,color:ec,marginBottom:2,lineHeight:1.3}},ETAPAS_LABEL[etapa]||etapa),
                        e("div",{style:{fontSize:10,color:totalCol>0?C.textMuted:C.textDim,whiteSpace:"nowrap"}},totalCol>0?"$"+totalCol.toLocaleString():",")
                      ),
                      e("div",{style:{
                        width:22,height:22,borderRadius:"50%",flexShrink:0,
                        background:ec+"18",display:"flex",alignItems:"center",
                        justifyContent:"center",fontSize:11,fontWeight:700,color:ec
                      }},cols.length)
                    ),
                    e("div",{style:{
                      fontSize:10,color:C.textDim,lineHeight:1.4,
                      paddingTop:6,borderTop:"1px solid "+ec+"18",
                      fontStyle:"italic"
                    }},ETAPAS_PREGUNTA[etapa]||"")
                  ),

                  // ZONA FICHAS
                  e("div",{style:{
                    background:isDragOver?ec+"06":C.bg,
                    borderRadius:12,padding:"6px",minHeight:80,
                    display:"flex",flexDirection:"column",gap:6,
                    transition:"background 0.15s",
                    border:isDragOver?"1.5px dashed "+ec+"50":"1.5px solid transparent"
                  }},
                    cols.map(function(c){
                      var cotPend=cotizaciones.find(function(cot){ return Number(cot.clienteId)===Number(c.id)&&cot.estatus==="Pendiente"; });
                      var cotAcep=cotizaciones.find(function(cot){ return Number(cot.clienteId)===Number(c.id)&&cot.estatus==="Aceptada"; });
                      var dias=diasDesde(c.fechaEtapa||c.fecha);
                      var ref=c.ultimoContacto||c.fecha;
                      var dSinContacto=Math.floor((HOY-new Date(ref))/86400000);
                      var umbral=c.etapa==="Nuevo contacto"?5:c.etapa==="Cotizacion enviada"?3:c.etapa==="Negociacion"?3:null;
                      var esUrgente=umbral!==null&&!c.seguimientoFecha&&dSinContacto>=umbral;
                      var cot=cotAcep||cotPend;
                      var pagos=cot?(cot.pagos||[]):[];
                      var totalPagado=pagos.reduce(function(s,p){ return s+Number(p.monto); },0);
                      var saldoReal=cot?cot.monto-totalPagado:0;
                      var urlContactar=contactUrl(c,"Hola "+c.nombre.split(" ")[0]+", queria hacer seguimiento"+(cotPend?" a la cotizacion de "+cotPend.concepto:"")+".");
                      var borderColor=esUrgente?C.red:ec;
                      return e("div",{key:c.id,
                        draggable:true,
                        onDragStart:function(ev){ onDragStart(ev,c.id); },
                        onDragEnd:onDragEnd,
                        style:{
                          background:C.surface,
                          borderRadius:12,
                          padding:"12px 14px",
                          cursor:"grab",
                          opacity:dragging===c.id?0.4:1,
                          border:"1px solid "+C.border,
                          borderLeft:"3px solid "+borderColor,
                          boxShadow:"0 1px 4px rgba(0,0,0,0.05)",
                          boxSizing:"border-box",minHeight:135,
                          display:"flex",flexDirection:"column",gap:5,overflow:"hidden"
                        },
                        onClick:function(){
                          setCotRapidaId(c.id);
                        }
                      },
                        // Fila 1 , avatar + nombre
                        e("div",{style:{display:"flex",gap:8,alignItems:"center"}},
                          e("div",{style:{
                            width:32,height:32,borderRadius:"50%",flexShrink:0,
                            background:ec+"18",display:"flex",alignItems:"center",
                            justifyContent:"center",fontSize:11,fontWeight:700,color:ec
                          }},iniciales(c.nombre)),
                          e("div",{style:{flex:1,minWidth:0}},
                            e("div",{style:{fontWeight:600,fontSize:12,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},c.nombre),
                            e("div",{style:{fontSize:10,color:C.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},c.negocio||(" "))
                          )
                        ),
                        // Fila 2 , contenido según etapa
                        (function(){
                          var esPerdidoG=c.etapa==="Perdido";
                          var esGanadoG=c.etapa==="Ganado";
                          // Perdido: solo servicio + seguimiento si hay
                          if(esPerdidoG){
                            var cotPerd=cotAcep||cotPend||cotizaciones.find(function(q){ return Number(q.clienteId)===Number(c.id); });
                            var concepto=cotPerd?cotPerd.concepto:null;
                            return e("div",{style:{fontSize:10,lineHeight:"22px",height:22,padding:"0 7px",borderRadius:6,flexShrink:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",color:C.textMuted,background:"#F8FAFC",border:"0.5px solid "+C.border}},
                              concepto?concepto.slice(0,22)+(concepto.length>22?"...":""):"Sin cotización"
                            );
                          }
                          // Ganado: solo servicio
                          if(esGanadoG){
                            var cot2=cotAcep||cotPend;
                            var concepto2=cot2?cot2.concepto:null;
                            return e("div",{style:{fontSize:10,lineHeight:"22px",height:22,padding:"0 7px",borderRadius:6,flexShrink:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",color:C.green,background:C.green+"08",border:"0.5px solid "+C.green+"30"}},
                              concepto2?concepto2.slice(0,22)+(concepto2.length>22?"...":""):"Venta cerrada"
                            );
                          }
                          // Activo: días + concepto + rojo si urgente
                          if(c.etapa==="Perdido"){
                            return e("div",{style:{fontSize:10,lineHeight:"22px",height:22,padding:"0 7px",borderRadius:6,flexShrink:0,whiteSpace:"nowrap",color:C.red,background:C.red+"08",border:"0.5px solid "+C.red+"30"}},"Por recuperar");
                          }
                          var umbral=c.etapa==="Nuevo contacto"?5:3;
                          var diasRojo=dias>=umbral;
                          var cot3=cotAcep||cotPend;
                          var concepto3=cot3?cot3.concepto:null;
                          var texto=dias+"d"+(concepto3?" · "+concepto3.slice(0,16)+(concepto3.length>16?"...":""):"");
                          return e("div",{style:{fontSize:10,lineHeight:"22px",height:22,padding:"0 7px",borderRadius:6,flexShrink:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",color:diasRojo?C.red:C.textMuted,background:diasRojo?C.red+"08":"#F8FAFC",border:"0.5px solid "+(diasRojo?C.red+"30":C.border)}},texto);
                        })(),
                        // Fila 3 , monto pendiente (solo si no es Perdido)
                        e("div",{style:{fontSize:10,fontWeight:600,color:saldoReal>0&&c.etapa!=="Perdido"?C.amber:"transparent",height:16,lineHeight:"16px",flexShrink:0,whiteSpace:"nowrap",overflow:"hidden"}},
                          saldoReal>0&&c.etapa!=="Perdido"?"$"+saldoReal.toLocaleString()+" pendiente":"\u00a0"
                        ),
                        // Fila 4 , seguimiento si perdido, contactar si activo/ganado
                        e("div",{style:{height:28,flexShrink:0,display:"flex",gap:6,alignItems:"center"},onClick:function(ev){ ev.stopPropagation(); }},
                          c.etapa==="Perdido"?(function(){
                            if(!c.seguimientoFecha) return null;
                            var dSeg=Math.round((new Date(c.seguimientoFecha).getTime()-HOY.getTime())/86400000);
                            return e("div",{style:{fontSize:10,color:"#5B5CF6",fontWeight:500}},"Seg: "+(dSeg<=0?"hoy":dSeg===1?"mañana":"en "+dSeg+" días"));
                          })()
                          : urlContactar
                            ? (contactUrl(c,msgEtapa(c))
                              ? e("a",{href:contactUrl(c,msgEtapa(c)),target:"_blank",rel:"noreferrer",
                                  style:{display:"inline-flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:10,background:C.green,color:"#fff",fontSize:10,fontWeight:600,textDecoration:"none",whiteSpace:"nowrap"}
                                },e(SvgIcon,{canal:c.canalPrincipal||"WhatsApp",size:10}),contactLabel(c))
                              : e("button",{style:{display:"inline-flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:10,background:C.surfaceUp,color:C.textMuted,fontSize:10,fontWeight:600,border:"1px solid "+C.border,cursor:"pointer"},
                                  onClick:function(ev){ ev.stopPropagation(); contactFallbackCopy(c); }
                                },e(SvgIcon,{canal:c.canalPrincipal||"WhatsApp",size:10}),contactLabel(c)))
                            : null
                          ,
                          isMobile&&e("button",{
                            style:{marginLeft:"auto",padding:"4px 8px",borderRadius:8,border:"1px solid "+C.border,background:C.surfaceUp,fontSize:10,color:C.textMuted,cursor:"pointer",flexShrink:0},
                            onClick:function(ev){ ev.stopPropagation(); setMoverClienteId(c.id); }
                          },"Mover →")
                        )
                      );
                    }),
                    cols.length===0&&e("div",{style:{padding:"24px 8px",textAlign:"center",fontSize:11,color:ec,opacity:0.3}},"Arrastra aquí"),
                    dragOver===etapa&&dragging&&e("div",{style:{border:"1.5px dashed "+ec+"40",borderRadius:10,height:44,display:"flex",alignItems:"center",justifyContent:"center",background:ec+"06"}},
                      e("span",{style:{fontSize:11,color:ec}},"Soltar aquí")
                    )
                  )
                );
              })
            )
          ),

          // ARCHIVADOS
          (function(){
            var totalArchivados=clientes.filter(function(c){
              if(c.etapa!=="Ganado"&&c.etapa!=="Perdido") return false;
              if(diasDesde(c.fechaEtapa||c.fecha)<=7) return false;
              var cotC=cotizaciones.find(function(cot){ return Number(cot.clienteId)===Number(c.id)&&cot.estatus==="Aceptada"; });
              if(cotC){
                var pagosC=cotC.pagos||[];
                var totalPagadoC=pagosC.reduce(function(s,p){ return s+Number(p.monto); },0);
                if(cotC.monto-totalPagadoC>0) return false;
              }
              return true;
            }).length;
            if(totalArchivados===0) return null;
            return e("div",{style:{marginTop:16,textAlign:"center"}},
              e("button",{style:Object.assign({},st.btn,{fontSize:12,padding:"8px 20px",borderRadius:10}),onClick:function(){ setMostrarArchivados(!mostrarArchivados); }},
                mostrarArchivados?"Ocultar archivados":"Ver archivados ("+totalArchivados+")"
              )
            );
          })()
        );
      })(),

      // CLIENTES
      vista==="clientes"&&(function(){
        if(clienteAbierto){
          var c=clientes.find(function(x){ return x.id===clienteAbierto; });
          if(!c) return null;
          // Auto-corregir: si cliente está en Sin cerrar, sus cots pendientes deben ser Rechazadas
          if(c.etapa==="Perdido"){
            var cotsPendFicha=cotizaciones.filter(function(cot){ return Number(cot.clienteId)===Number(c.id)&&cot.estatus==="Pendiente"; });
            if(cotsPendFicha.length>0){
              setCotizaciones(cotizaciones.map(function(cot){ return Number(cot.clienteId)===Number(c.id)&&cot.estatus==="Pendiente"?Object.assign({},cot,{estatus:"Rechazada"}):cot; }));
            }
          }
          var cotCliente=cotizaciones.filter(function(cot){ return Number(cot.clienteId)===Number(c.id); }).sort(function(a,b){ return new Date(b.fecha)-new Date(a.fecha); });
          var ventasCliente=ventas.filter(function(v){ return v.clienteId===c.id; }).sort(function(a,b){ return new Date(b.fecha)-new Date(a.fecha); });
          var tabs=["perfil","historial","seguimiento"];
          var tabLabels={perfil:"Perfil",historial:"Historial",seguimiento:"Seguimiento"};
          var segBadge=null;
          if(c.seguimientoFecha){
            var segMs=new Date(c.seguimientoFecha).getTime()-HOY.getTime();
            var diasSegH=Math.round(segMs/86400000);
            segBadge=diasSegH<=0?"Seguimiento hoy":diasSegH===1?"Seguimiento mañana":"Seguimiento en "+diasSegH+" días";
          }
          var ec2=ETAPA_COLOR[c.etapa]||C.purple;
          return e("div",null,
            e("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginLeft:isMobile?-16:-48,marginRight:isMobile?-16:-48,marginTop:isMobile?-20:-40,padding:isMobile?"12px 16px":"14px 48px",background:C.bg,marginBottom:isMobile?12:20}},
              e("button",{style:{cursor:"pointer",background:"none",border:"none",fontSize:13,color:C.textMuted,fontWeight:500,padding:"4px 0"},onClick:function(){ setClienteAbierto(null); setTabCliente("perfil"); }},"← Volver"),
              e(BtnCanal,{cliente:c})
            ),
            e("div",{style:{display:"flex",alignItems:"center",gap:14,marginBottom:20}},
              e("div",{style:{width:44,height:44,borderRadius:"50%",background:ec2+"18",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14,color:ec2,flexShrink:0}},iniciales(c.nombre)),
              e("div",{style:{flex:1,minWidth:0}},
                e("div",{style:{fontWeight:700,fontSize:18,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},c.nombre),
                e("div",{style:{fontSize:13,color:C.textMuted}},c.negocio)
              ),
              segBadge&&e("div",{style:{fontSize:11,color:"#5B5CF6",fontWeight:500,background:"#EEF2FF",padding:"4px 10px",borderRadius:20,flexShrink:0,whiteSpace:"nowrap"}},"Seg: "+segBadge)
            ),
            e("div",{style:{display:"flex",gap:2,marginBottom:16,borderBottom:"0.5px solid "+C.border,paddingBottom:8}},
              tabs.map(function(t){ return e("button",{key:t,style:{padding:"6px 12px",borderRadius:8,border:"none",background:tabCliente===t?C.surfaceUp:"transparent",cursor:"pointer",fontSize:12,color:tabCliente===t?C.text:C.textDim,fontWeight:tabCliente===t?500:400},onClick:function(){ setTabCliente(t); }},tabLabels[t]); })
            ),
            tabCliente==="perfil"&&e("div",null,
              // LO QUE CLEO SABE DE ESTE CLIENTE
              (function(){
                var cotC=cotCliente.filter(function(c){ return c.estatus==="Aceptada"; });
                var cotPendC=cotCliente.filter(function(c){ return c.estatus==="Pendiente"; });
                var ventasC=ventasCliente;
                var facts=[];

                // Origen
                if(c.origen) facts.push({ic:"📍",txt:"Llegó por "+c.origen+"."});

                // Tiempo en cerrar
                var tiemposCierreC=cotC.map(function(cot){
                  if(c.fecha&&cot.fecha){ var d=Math.floor((parseFechaLocal(cot.fecha)-parseFechaLocal(c.fecha))/86400000); return d>=0?d:null; }
                  return null;
                }).filter(function(d){ return d!==null; });
                if(tiemposCierreC.length>=1){
                  var promC=Math.round(tiemposCierreC.reduce(function(s,d){ return s+d; },0)/tiemposCierreC.length);
                  facts.push({ic:"⏱️",txt:"Tardó "+promC+" día"+(promC!==1?"s":"")+" en comprar."});
                } else if(cotPendC.length>0){
                  var diasEspera=diasDesde(cotPendC[cotPendC.length-1].fecha);
                  facts.push({ic:null,txt:"Lleva "+diasEspera+" días evaluando tu propuesta."});
                }

                // Canal de contacto
                if(c.canalPrincipal) facts.push({ic:"💬",txt:"Prefiere contacto por "+c.canalPrincipal+"."});

                // Total invertido
                var totalCliente=cotC.reduce(function(s,cot){ return s+cot.monto; },0)+ventasC.reduce(function(s,v){ return s+Number(v.monto); },0);
                if(totalCliente>0) facts.push({ic:"💰",txt:"Ha invertido $"+totalCliente.toLocaleString()+" contigo."+(cotC.length+ventasC.length>1?" ("+((cotC.length||0)+(ventasC.length||0))+" transacciones)":"")});

                // Tasa de cierre personal
                if(cotCliente.length>=2){
                  var tasaC=Math.round((cotC.length/cotCliente.length)*100);
                  if(tasaC===100) facts.push({ic:"⭐",txt:"Ha aceptado todas tus propuestas."});
                  else if(tasaC>=50) facts.push({ic:"✅",txt:"Acepta el "+tasaC+"% de tus propuestas."});
                  else facts.push({ic:"🤔",txt:"Solo ha aceptado el "+tasaC+"% de tus propuestas."});
                }

                // Notas del cliente
                if(c.notas) facts.push({ic:"📝",txt:c.notas});

                if(facts.length===0) facts.push({ic:"🌱",txt:"CLEO aprenderá más sobre "+c.nombre.split(" ")[0]+" conforme registres más interacciones."});

                return e("div",{style:{
                  background:"#0F1729",borderRadius:16,padding:"20px",marginBottom:12
                }},
                  e("div",{style:{marginBottom:14}},
                    e("div",{style:{fontSize:9,fontWeight:700,color:"#4F46E5",textTransform:"uppercase",letterSpacing:"1.8px",marginBottom:4}},"CLEO sabe"),
                    e("div",{style:{fontSize:14,fontWeight:700,color:"#fff"}},"Lo que aprendimos de "+c.nombre.split(" ")[0])
                  ),
                  e("div",{style:{display:"flex",flexDirection:"column",gap:0}},
                    facts.map(function(f,i){
                      return e("div",{key:i,style:{
                        display:"flex",gap:10,alignItems:"flex-start",
                        paddingTop:i===0?0:10,paddingBottom:i<facts.length-1?10:0,
                        borderBottom:i<facts.length-1?"1px solid rgba(255,255,255,0.06)":"none"
                      }},
                        e("span",{style:{fontSize:13,flexShrink:0,marginTop:1}},f.ic),
                        e("div",{style:{fontSize:13,color:"#94A3B8",lineHeight:1.5}},f.txt)
                      );
                    })
                  )
                );
              })(),
              e("div",{style:st.card},
                [{label:"Negocio",valor:c.negocio},{label:"Canal",valor:c.canalPrincipal},{label:"Origen",valor:c.origen},{label:"Etapa",valor:c.etapa},{label:"WhatsApp",valor:c.contacto},{label:"Instagram",valor:c.instagram},{label:"Email",valor:c.email},{label:"Notas",valor:c.notas},{label:"Registrado",valor:c.fecha}].filter(function(r){ return r.valor; }).map(function(r){
                  return e("div",{key:r.label,style:{display:"flex",gap:12,padding:"8px 0",borderBottom:"0.5px solid "+C.border}},e("div",{style:{fontSize:12,color:C.textDim,width:100,flexShrink:0}},r.label),e("div",{style:{fontSize:13,color:C.text}},r.valor));
                })
              ),
              e("div",{style:{display:"flex",gap:8,marginTop:8}},
                e("button",{style:Object.assign({},st.btn,{fontSize:12}),onClick:function(){ editarCliente(c); }},"Editar datos"),
                e("button",{style:Object.assign({},st.btn,{fontSize:12,color:C.red}),onClick:function(){ if(window.confirm("Eliminar a "+c.nombre+"?")){ eliminarCliente(c.id); setClienteAbierto(null); } }},"Eliminar")
              )
            ),
            tabCliente==="historial"&&e("div",null,
              e("div",{style:{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}},
                e("button",{style:Object.assign({},st.btn,{fontSize:12,padding:"5px 12px"}),onClick:function(){ setFormCot(Object.assign({},cotVacio,{clienteId:String(c.id)})); setModalCot(true); }},"+ "+TXT.cotizacion),
                e("button",{style:Object.assign({},st.btn,{fontSize:12,padding:"5px 12px",color:C.green,borderColor:C.greenBorder}),onClick:function(){ setFormVenta(Object.assign({},ventaVacia,{tipo:"especifico",clienteId:String(c.id)})); setPasoVenta("form"); setModalVenta(true); }},"+ Venta directa")
              ),
              e("div",{style:{background:C.surface,borderRadius:20,border:"1px solid "+C.border,padding:"24px",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}},
              (function(){
                var fmtF=function(f){ if(!f) return ""; var p=f.split("-"); return p[2]+"/"+p[1]+"/"+p[0].slice(2); };

                // SVG paths para iconos del timeline
                var ICONOS_SVG={
                  registro:"M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
                  cotizacion:"M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
                  aceptada:"M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
                  rechazada:"M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
                  pago:"M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
                  venta:"M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
                  seguimiento:"M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
                  perdido:"M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636",
                  ganado:"M5 3l14 9-14 9V3z",
                };

                // Construir eventos
                var eventos=[];
                eventos.push({fecha:c.fecha,tipo:"registro",titulo:"Cliente registrado",desc:"Origen: "+c.origen,color:C.purple,orden:0});
                if(c.etapa==="Perdido") eventos.push({fecha:c.fecha,tipo:"perdido",titulo:"Marcado como perdido",desc:c.motivoPerdida?"Motivo: "+c.motivoPerdida:"Sin motivo registrado",color:C.red,orden:6});
                if(c.etapa==="Ganado") eventos.push({fecha:c.fecha,tipo:"ganado",titulo:"Venta cerrada",desc:"Cliente ganado",color:C.green,orden:6});
                // Historial de contactos
                (c.historialContactos||[]).forEach(function(h){
                  var isRecup=h.resultado&&(h.resultado.includes("recuperad")||h.resultado.includes("Recuperad")||h.resultado.includes("reactivad"));
                  eventos.push({fecha:h.fecha,tipo:"contacto",titulo:"Contacto registrado",desc:h.resultado||"Sin detalle",color:isRecup?C.green:h.resultado&&h.resultado.includes("interés")||h.resultado&&h.resultado.includes("interes")?C.amber:C.textMuted,orden:1});
                });

                cotCliente.forEach(function(cot){
                  eventos.push({fecha:cot.fecha,tipo:"cotizacion",titulo:"Cotizacion enviada",desc:cot.concepto+" · $"+Number(cot.monto).toLocaleString(),color:C.amber,orden:2});
                  if(cot.estatus==="Aceptada") eventos.push({fecha:cot.fecha,tipo:"aceptada",titulo:"Cotizacion aceptada",desc:"$"+Number(cot.monto).toLocaleString(),color:C.green,orden:3});
                  if(cot.estatus==="Rechazada") eventos.push({fecha:cot.fecha,tipo:"rechazada",titulo:"Cotizacion rechazada",desc:cot.motivoPerdida?"Motivo: "+cot.motivoPerdida:"Sin motivo registrado",color:C.red,orden:3});
                  // Pagos del nuevo sistema
                  var pagosH=cot.pagos||[];
                  pagosH.forEach(function(p){
                    var totalPagadoH=pagosH.reduce(function(s,x){ return s+Number(x.monto); },0);
                    var saldoH=cot.monto-totalPagadoH;
                    eventos.push({fecha:p.fecha,tipo:"pago",titulo:(p.concepto||"Pago")+" recibido",desc:"$"+Number(p.monto).toLocaleString()+(saldoH>0?" · Saldo: $"+saldoH.toLocaleString():" · Pagado completamente"),color:C.green,orden:4});
                  });
                });

                ventasCliente.forEach(function(v){
                  eventos.push({fecha:v.fecha,tipo:"venta",titulo:"Venta directa"+(v.concepto?" · "+v.concepto:""),desc:"$"+Number(v.monto).toLocaleString()+(v.etiqueta?" · "+v.etiqueta:""),color:C.green,orden:5});
                });

                // Ordenar , reciente primero, futuros al fondo, registro siempre último
                eventos.sort(function(a,b){
                  if(a.futuro&&!b.futuro) return 1;
                  if(!a.futuro&&b.futuro) return -1;
                  // Registro siempre al fondo
                  if(a.tipo==="registro"&&b.tipo!=="registro") return 1;
                  if(a.tipo!=="registro"&&b.tipo==="registro") return -1;
                  var df=new Date(b.fecha)-new Date(a.fecha);
                  if(df!==0) return df;
                  return (b.orden||0)-(a.orden||0);
                });

                if(eventos.length===0) return e("div",{style:{fontSize:13,color:C.textDim,textAlign:"center",padding:"24px 0"}},"Sin historial aun.");

                var ICON_SIZE=28;
                var ICON_HALF=ICON_SIZE/2;

                return e("div",null,
                  eventos.map(function(ev,i){
                    var svgPath=ICONOS_SVG[ev.tipo]||ICONOS_SVG.registro;
                    var isLast=i===eventos.length-1;
                    return e("div",{key:i,style:{
                      display:"flex",gap:12,alignItems:"flex-start",
                      padding:"12px 0",
                      borderBottom:isLast?"none":"1px solid "+C.border
                    }},
                      e("div",{style:{
                        width:32,height:32,borderRadius:"50%",flexShrink:0,
                        background:ev.color+"15",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        marginTop:1
                      }},
                        e("svg",{width:14,height:14,viewBox:"0 0 24 24",fill:"none",stroke:ev.color,strokeWidth:2.5,strokeLinecap:"round",strokeLinejoin:"round"},
                          e("path",{d:svgPath})
                        )
                      ),
                      e("div",{style:{flex:1}},
                        e("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:2,flexWrap:"wrap"}},
                          e("span",{style:{fontSize:13,fontWeight:600,color:C.text}},ev.titulo),
                          ev.futuro&&e("span",{style:{fontSize:10,padding:"1px 8px",borderRadius:20,background:"#EEF2FF",color:"#5B5CF6",fontWeight:500}},"Programado")
                        ),
                        e("div",{style:{fontSize:12,color:C.textMuted,marginBottom:1}},ev.desc),
                        e("div",{style:{fontSize:11,color:C.textDim}},fmtF(ev.fecha))
                      )
                    );
                  })
                );
              })()
              )// cierra card
            ),
            tabCliente==="seguimiento"&&e("div",null,
              e("div",{style:st.card},
                c.seguimientoFecha
                  ?e("div",null,e("div",{style:{fontSize:12,color:C.textDim,marginBottom:4}},"Proximo seguimiento"),e("div",{style:{fontSize:16,fontWeight:600,color:C.amber,marginBottom:12}},c.seguimientoFecha),e("div",{style:{display:"flex",gap:8}},e("button",{style:Object.assign({},st.btn,{fontSize:12}),onClick:function(){ setSeguimientoClienteId(c.id); setSeguimientoDias(""); }},"Reprogramar"),e("button",{style:Object.assign({},st.btn,{fontSize:12,color:C.green}),onClick:function(){ setClientes(clientes.map(function(x){ return x.id===c.id?Object.assign({},x,{seguimientoFecha:""}):x; })); }},"Marcar contactado")))
                  :e("div",null,e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:12}},"Sin seguimiento programado."),e("button",{style:st.btnP,onClick:function(){ setSeguimientoClienteId(c.id); setSeguimientoDias(""); }},"+ Programar seguimiento"))
              )
            )
          );
        }
        return e("div",{style:{display:"flex",flexDirection:"column",gap:0}},
          e("div",{style:{display:"flex",alignItems:"center",justifyContent:isMobile?"space-between":"flex-end",gap:isMobile?6:8,marginLeft:isMobile?-16:-48,marginRight:isMobile?-16:-48,marginTop:isMobile?-20:-40,padding:isMobile?"12px 16px":"14px 48px",background:C.bg,flexWrap:"nowrap"}},
            isMobile&&e("div",{style:{
              width:36,height:36,borderRadius:10,
              background:C.dark,
              display:"flex",alignItems:"center",justifyContent:"center",
              flexShrink:0,marginRight:"auto"
            }},
              e("svg",{width:22,height:22,viewBox:"0 0 100 100",fill:"none"},
                e("path",{d:"M72 28C65 20 54 16 44 18C28 21 17 35 17 50C17 65 28 79 44 82C54 84 65 80 72 72",stroke:"#fff",strokeWidth:12,strokeLinecap:"round",fill:"none"}),
                e("path",{d:"M62 38C57 33 50 30 44 31C34 33 27 41 27 50C27 59 34 67 44 69C50 70 57 67 62 62",stroke:"rgba(255,255,255,0.35)",strokeWidth:8,strokeLinecap:"round",fill:"none"})
              )
            ),
            esProductos
              ? e(TopBarProductos,{open:menuNuevo,setOpen:setMenuNuevo,isMobile:isMobile,C:C,st:st,
                  onCliente:function(){ setClienteSel(null); setForm(formVacio); setModalCliente(true); },
                  onProspecto:function(){ setFormProspecto({clienteId:"",nuevoNombre:"",origen:"",canalPrincipal:"",contacto:"",productoInteres:"",precioInteres:"",envioPrecio:false,notas:""}); setBuscaCliOpo(""); setModalProspecto(true); setVista("prospectos"); },
                  onPedido:function(){ setNuevoPedidoForm({clienteId:"",nuevoNombre:"",productos:"",cantidad:1,total:"",anticipo:"",fechaEntrega:"",notas:""}); setBuscaCliPed(""); setNuevoPedidoModal(true); setVista("pedidos"); },
                  onVenta:abrirModalVenta})
              : e(TopBarServicios,{open:menuNuevo,setOpen:setMenuNuevo,isMobile:isMobile,C:C,st:st,
                  onCliente:function(){ setClienteSel(null); setForm(formVacio); setModalCliente(true); },
                  onCot:function(){ setModalCot(true); },
                  onVenta:abrirModalVenta})
          ),
          e("div",{style:{paddingTop:20,marginBottom:20}},
            e("div",{style:{fontSize:28,fontWeight:700,color:C.text,lineHeight:1.1,marginBottom:6}},"Tus clientes"),
            e("div",{style:{fontSize:14,color:C.textMuted,marginBottom:6}},esProductos?"Las personas que se han interesado en lo que ofreces o ya te han comprado.":"Las personas que se han interesado en tus servicios o te han contratado.")
          ),
          e("div",{style:{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}},
            e("input",{placeholder:"Buscar...",style:Object.assign({},st.inp,{flex:1,minWidth:120}),value:busqueda,onChange:function(ev){ setBusqueda(ev.target.value); }}),
            e("select",{value:filtroGanados.etapaClientes||"",onChange:function(ev){ setFiltroGanados(Object.assign({},filtroGanados,{etapaClientes:ev.target.value})); },style:Object.assign({},st.inp,{width:160})},
              e("option",{value:""},"Todos"),
              e("option",{value:"activos"},"Activos"),
              e("option",{value:"Ganado"},"Ganados"),
              e("option",{value:"Perdido"},"Perdidos")
            )
          ),
          (function(){
            var filtroEtapa=filtroGanados.etapaClientes||"";
            var lista=clientesFiltrados.filter(function(c){
              if(!filtroEtapa) return true;
              if(filtroEtapa==="activos") return c.etapa!=="Ganado"&&c.etapa!=="Perdido";
              return c.etapa===filtroEtapa;
            });
            return lista.map(function(c){
              var ec=ETAPA_COLOR[c.etapa]||C.purple;
              var segBL=null;
              if(c.seguimientoFecha){
                var segMsBL=new Date(c.seguimientoFecha).getTime()-HOY.getTime();
                var dBL=Math.round(segMsBL/86400000);
                segBL=dBL<=0?"Hoy":dBL===1?"Mañana":"En "+dBL+" días";
              }
              return e("div",{key:c.id,style:{background:C.surface,border:"1px solid "+C.border,borderRadius:16,padding:"14px 18px",marginBottom:8,display:"flex",alignItems:"center",gap:14,cursor:"pointer",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"},onClick:function(){ setClienteAbierto(c.id); setTabCliente("perfil"); }},
                e("div",{style:{width:38,height:38,borderRadius:"50%",background:ec+"18",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12,color:ec,flexShrink:0}},iniciales(c.nombre)),
                e("div",{style:{flex:1,minWidth:0}},
                  e("div",{style:{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}},
                    e("span",{style:{fontWeight:600,fontSize:14,color:C.text}},c.nombre),
                    segBL&&e("span",{style:{fontSize:10,color:"#fff",fontWeight:600,whiteSpace:"nowrap",background:"#5B5CF6",padding:"3px 10px",borderRadius:20}},"Seg: "+segBL)
                  ),
                  e("div",{style:{fontSize:12,color:C.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},c.negocio||"\u00a0")
                ),
                e("div",{style:{flexShrink:0},onClick:function(ev){ ev.stopPropagation(); }},
                  e(BtnCanal,{cliente:c,small:true})
                )
              );
            });
          })()
        );
      })(),

      // VENTAS DIRECTAS
      vista==="ventas"&&(function(){
        // Construir lista de ingresos: pagos de cotizaciones aceptadas + ventas rápidas
        var ingresos=[];

        // 1. Pagos desde cotizaciones aceptadas
        cotizaciones.filter(function(c){ return c.estatus==="Aceptada"; }).forEach(function(cot){
          var cl=clientes.find(function(c){ return c.id===cot.clienteId; });
          (cot.pagos||[]).forEach(function(pago){
            ingresos.push({
              id:"vs_cot_"+pago.id,
              clienteId:cot.clienteId,
              clienteNombre:cl?cl.nombre:"Sin cliente",
              origen:"cotizacion",
              cotId:cot.id,
              monto:Number(pago.monto),
              fecha:pago.fecha||cot.fecha,
              concepto:pago.concepto||cot.concepto||"Pago",
              productos:"",
            });
          });
        });

        // 2. Ventas directas
        ventas.forEach(function(v){
          var cl=clientes.find(function(c){ return c.id===v.clienteId; });
          if(v.pagos&&v.pagos.length>0){
            v.pagos.forEach(function(pago){
              ingresos.push({
                id:"vs_vr_"+v.id+"_"+pago.id,
                clienteId:v.clienteId,
                clienteNombre:cl?cl.nombre:"Cliente general",
                origen:"venta_rapida",
                monto:Number(pago.monto),
                fecha:pago.fecha||v.fecha,
                concepto:v.concepto||"Venta directa",
                productos:"",
              });
            });
            // El saldo sin cobrar de una venta con anticipo NO se cuenta aquí , todavía no ha entrado.
          } else if(v.tipoPago!=="anticipo"){
            // Solo se asume el monto completo si de verdad se marcó "pagó completo",
            // no cuando fue "anticipo" con el campo vacío (eso es $0 cobrado, no el total).
            ingresos.push({
              id:"vs_vr_"+v.id,
              clienteId:v.clienteId,
              clienteNombre:cl?cl.nombre:"Cliente general",
              origen:"venta_rapida",
              monto:Number(v.monto),
              fecha:v.fecha,
              concepto:v.concepto||"Venta directa",
              productos:"",
            });
          }
        });

        ingresos.sort(function(a,b){ return new Date(b.fecha)-new Date(a.fecha); });

        var totalHoy=ingresos.filter(function(i){ return enPeriodo(i.fecha,"hoy"); }).reduce(function(s,i){ return s+i.monto; },0);
        var totalSemana=ingresos.filter(function(i){ return enPeriodo(i.fecha,"semana"); }).reduce(function(s,i){ return s+i.monto; },0);
        var totalMes=ingresos.filter(function(i){ return enPeriodo(i.fecha,"mes"); }).reduce(function(s,i){ return s+i.monto; },0);

        var ingFiltrados=ingresos.filter(function(ing){
          if(!enPeriodo(ing.fecha,filtroVP.periodo)) return false;
          if(filtroVP.origen!=="todos"&&ing.origen!==filtroVP.origen) return false;
          if(filtroVP.busqueda&&!ing.clienteNombre.toLowerCase().includes(filtroVP.busqueda.toLowerCase())&&!ing.concepto.toLowerCase().includes(filtroVP.busqueda.toLowerCase())) return false;
          return true;
        });

        var fmtFecha=function(f){
          if(!f) return "";
          var fd=new Date(f+"T12:00:00");
          var hoyD=new Date(); hoyD.setHours(0,0,0,0);
          var fd0=new Date(fd); fd0.setHours(0,0,0,0);
          var diff=Math.round((hoyD-fd0)/(1000*60*60*24));
          if(diff===0) return "Hoy";
          if(diff===1) return "Ayer";
          return fd.toLocaleDateString("es-MX",{day:"numeric",month:"short"});
        };

        return e("div",null,
          e("div",{style:{marginBottom:20}},
            e("div",{style:{fontSize:28,fontWeight:700,color:C.text,lineHeight:1.1,marginBottom:4}},"Ingresos"),
            e("div",{style:{fontSize:14,color:C.textMuted}},"Dinero que ya entró a tu negocio")
          ),

          e("div",{style:{background:C.surface,borderRadius:16,border:"1px solid "+C.border,boxShadow:"0 1px 6px rgba(0,0,0,0.04)",marginBottom:20,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:0}},
            [
              {label:"Hoy",valor:totalHoy,periodo:"hoy"},
              {label:"Semana",valor:totalSemana,periodo:"semana"},
              {label:"Mes",valor:totalMes,periodo:"mes"},
            ].map(function(kpi,i){
              var activo=filtroVP.periodo===kpi.periodo;
              return e("div",{key:kpi.label,
                style:{
                  padding:isMobile?"10px 6px":"16px 20px",cursor:"pointer",textAlign:"center",
                  borderRight:i<2?"1px solid "+C.border:"none",
                  background:activo?C.purplePale:"transparent",
                  borderRadius:i===0?"16px 0 0 16px":i===2?"0 16px 16px 0":"0",
                  transition:"background 0.15s"
                },
                onClick:function(){ setFiltroVP(Object.assign({},filtroVP,{periodo:kpi.periodo})); }
              },
                e("div",{style:{fontSize:isMobile?9:10,fontWeight:700,color:activo?C.purple:C.textDim,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}},kpi.label),
                e("div",{style:{fontSize:isMobile?18:24,fontWeight:700,color:activo?C.purple:kpi.valor>0?C.green:C.textMuted,lineHeight:1}},"$"+kpi.valor.toLocaleString())
              );
            })
          ),

          e("div",{style:{display:"flex",flexDirection:"column",gap:8,marginBottom:16}},
            e("input",{
              placeholder:"Buscar...",
              value:filtroVP.busqueda,
              onChange:function(ev){ setFiltroVP(Object.assign({},filtroVP,{busqueda:ev.target.value})); },
              style:Object.assign({},st.inp,{marginBottom:0})
            }),
            e("div",{style:{display:"flex",gap:6}},
              ["todos","cotizacion","venta_rapida"].map(function(orig){
                var labels={todos:"Todos",cotizacion:"Cotizaciones",venta_rapida:"Ventas rápidas"};
                var activo=filtroVP.origen===orig;
                return e("button",{key:orig,
                  style:{cursor:"pointer",padding:"7px 10px",borderRadius:10,border:"1px solid "+(activo?C.purple:C.border),background:activo?"#EEF2FF":"transparent",fontSize:11,color:activo?C.purple:C.textMuted,fontWeight:activo?600:400,flex:1,whiteSpace:"nowrap"},
                  onClick:function(){ setFiltroVP(Object.assign({},filtroVP,{origen:orig})); }
                },labels[orig]);
              })
            )
          ),

          ingFiltrados.length===0?
            e("div",{style:{textAlign:"center",padding:"60px 0"}},
              e("div",{style:{fontSize:36,marginBottom:12}},"💰"),
              e("div",{style:{fontSize:15,fontWeight:600,color:C.textMuted,marginBottom:6}},"Sin ingresos en este período"),
              e("div",{style:{fontSize:13,color:C.textDim}},"Los pagos de cotizaciones y ventas rápidas aparecen aquí.")
            ):
            e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
              ingFiltrados.map(function(ing){
                var cl=clientes.find(function(c){ return c.id===ing.clienteId; });
                var esCot=ing.origen==="cotizacion";
                return e("div",{key:ing.id,style:{background:C.surface,borderRadius:12,border:"1px solid "+C.border,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}},
                  e("div",{style:{width:36,height:36,borderRadius:9,background:cl?avatarColor(cl.id)+"22":"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontWeight:700,fontSize:12,color:cl?avatarColor(cl.id):"#94A3B8"}},
                    cl?iniciales(cl.nombre):esCot?"C":"V"
                  ),
                  e("div",{style:{flex:1,minWidth:0}},
                    e("div",{style:{fontWeight:600,fontSize:13,color:C.text,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},ing.clienteNombre),
                    e("div",{style:{fontSize:11,color:C.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},ing.concepto)
                  ),
                  e("div",{style:{textAlign:"right",flexShrink:0}},
                    e("div",{style:{fontSize:15,fontWeight:700,color:C.green}},"$"+ing.monto.toLocaleString()),
                    e("div",{style:{fontSize:10,color:C.textDim,marginTop:1}},fmtFecha(ing.fecha)),
                    e("div",{style:{fontSize:9,color:esCot?C.purple:C.amber,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.3px"}},esCot?"Cotización":"Venta directa")
                  )
                );
              }),
              e("div",{style:{borderTop:"1px solid "+C.border,paddingTop:12,marginTop:4,display:"flex",justifyContent:"space-between",alignItems:"center"}},
                e("span",{style:{fontSize:12,color:C.textMuted}},ingFiltrados.length+" registros"),
                e("span",{style:{fontSize:15,fontWeight:700,color:C.green}},"$"+ingFiltrados.reduce(function(s,i){ return s+i.monto; },0).toLocaleString())
              )
            )
        );
      })(),

      // OPORTUNIDADES (solo modo productos)
      vista==="prospectos"&&(function(){
        var ESTADOS_OPO=[
          {k:"Nueva",          label:"Nueva",          color:"#F59E0B", bg:"#FFFBEB",               border:"#FCD34D", dot:"#F59E0B"},
          {k:"En seguimiento", label:"En seguimiento", color:"#4B5EFC", bg:"rgba(75,94,252,0.06)",  border:"#A5B4FC", dot:"#4B5EFC"},
          {k:"Sin respuesta",  label:"Sin respuesta",  color:"#6B7280", bg:"#F9FAFB",               border:"#D1D5DB", dot:"#6B7280"},
          {k:"Perdido",        label:"Perdida",        color:"#EF4444", bg:"#FEF2F2",               border:"#FCA5A5", dot:"#EF4444"},
        ];

        // Oportunidades = clientes con estadoProspecto activo (no Convertido)
        var oportunidades=clientes.filter(function(c){ return c.estadoProspecto&&c.estadoProspecto!=="Convertido"; });
        var opsFiltradas=filtroProspecto==="Perdido"
          ?oportunidades.filter(function(c){ return c.estadoProspecto==="Perdido"; })
          :(filtroProspecto==="Nueva"||filtroProspecto==="En seguimiento"||filtroProspecto==="Sin respuesta")
          ?oportunidades.filter(function(c){ return c.estadoProspecto===filtroProspecto; })
          :oportunidades.filter(function(c){ return c.estadoProspecto!=="Perdido"; });

        // Poner la oportunidad destacada al tope
        if(highlightOpoId){
          opsFiltradas=opsFiltradas.slice().sort(function(a,b){
            if(a.id===highlightOpoId) return -1;
            if(b.id===highlightOpoId) return 1;
            return 0;
          });
        }

        function calcEstado(productoInteres, precio){
          return (productoInteres&&productoInteres.trim())||(precio&&String(precio).trim())
            ?"En seguimiento":"Nueva";
        }

        function guardarOpo(clienteId, cambios){
          var cl=clientes.find(function(c){ return c.id===clienteId; });
          var estadoActual=cl?cl.estadoProspecto:"Nueva";
          var estadoFinal=estadoActual;
          if(estadoActual!=="Perdido"&&estadoActual!=="Sin respuesta"){
            if(cambios.envioPrecio===true) estadoFinal="En seguimiento";
            else if(cambios.envioPrecio===false) estadoFinal="Nueva";
          }
          setClientes(clientes.map(function(c){
            return c.id===clienteId?Object.assign({},c,cambios,{estadoProspecto:estadoFinal,fechaEtapa:estadoFinal!==estadoActual?FECHA_HOY:c.fechaEtapa}):c;
          }));
        }

        function cambiarEstado(clienteId, nuevoEstado){
          if(nuevoEstado==="Perdido"){
            var clAnt=clientes.find(function(c){ return c.id===clienteId; });
            setEtapaAnteriorPipeline(clAnt?clAnt.estadoProspecto:"Nueva");
            setMotivoPipelineId(clienteId);
            return;
          }
          setClientes(clientes.map(function(c){ return c.id===clienteId?Object.assign({},c,{estadoProspecto:nuevoEstado}):c; }));
        }

        function crearOportunidad(){
          var fp=formProspecto;
          if(!fp.clienteId&&!fp.nuevoNombre.trim()) return;

          // Validar teléfono si es WhatsApp y es cliente nuevo
          if(!fp.clienteId&&fp.canalPrincipal==="WhatsApp"&&fp.contacto){
            var digits=fp.contacto.replace(/\D/g,"");
            if(digits.length!==10){ alert("El número de WhatsApp debe tener exactamente 10 dígitos."); return; }
          }

          var precioFinal=fp.precioInteres&&String(fp.precioInteres).trim()!==""?String(Number(fp.precioInteres)*Number(fp.cantidadInteres||1)):"";
          var estadoAuto=(precioFinal&&fp.envioPrecio===true)?"En seguimiento":"Nueva";

          // MODO EDICIÓN — actualizar cliente existente
          if(fp._editandoId){
            setClientes(clientes.map(function(c){
              return c.id===fp._editandoId?Object.assign({},c,{
                estadoProspecto:estadoAuto,
                productoInteres:fp.productoInteres,
                precioInteres:precioFinal,
                cantidadInteres:fp.cantidadInteres||"1",
                notasProspecto:fp.notas,
                fechaEtapa:estadoAuto!==c.estadoProspecto?FECHA_HOY:c.fechaEtapa,
              }):c;
            }));
          } else if(fp.clienteId){
            setClientes(clientes.map(function(c){
              return c.id===Number(fp.clienteId)?Object.assign({},c,{
                estadoProspecto:estadoAuto,
                productoInteres:fp.productoInteres,
                precioInteres:precioFinal,
                cantidadInteres:fp.cantidadInteres||"1",
                notasProspecto:fp.notas,
                fechaEtapa:FECHA_HOY,
              }):c;
            }));
          } else {
            var nuevoId=Date.now();
            var digits2=fp.contacto?fp.contacto.replace(/\D/g,""):fp.contacto;
            setClientes([Object.assign({},formVacio,{
              id:nuevoId,
              nombre:fp.nuevoNombre.trim(),
              origen:fp.origen||"",
              canalPrincipal:fp.canalPrincipal||"WhatsApp",
              contacto:fp.canalPrincipal==="WhatsApp"?(digits2||""):"",
              instagram:fp.canalPrincipal==="Instagram"?(fp.contacto||""):"",
              messenger:fp.canalPrincipal==="Facebook"?(fp.contacto||""):"",
              fecha:FECHA_HOY,
              fechaEtapa:FECHA_HOY,
              etapa:"Nuevo contacto",
              estadoProspecto:estadoAuto,
              productoInteres:fp.productoInteres,
              precioInteres:precioFinal,
              cantidadInteres:fp.cantidadInteres||"1",
              notasProspecto:fp.notas,
              ultimoContacto:FECHA_HOY,
            }),...clientes]);
          }

          // ¿Guardar producto en catálogo?
          var prod=fp.productoInteres&&fp.productoInteres.trim();
          var yaEnCat=prod&&productosCat.some(function(p){ return p.nombre.trim().toLowerCase()===prod.toLowerCase(); });
          if(prod&&!yaEnCat){
            setGuardarProdOpo({nombre:prod,precio:Number(precioFinal)||0});
          }

          setFormProspecto({clienteId:"",nuevoNombre:"",origen:"",canalPrincipal:"",contacto:"",productoInteres:"",precioInteres:"",envioPrecio:false,notas:""});
          setBuscaCliOpo("");
          setModalProspecto(false);
        }

        // Estado de edición inline por tarjeta
        var editandoId=editandoOpoId; var setEditandoId=setEditandoOpoId;
        var editForm=editOpoForm; var setEditForm=setEditOpoForm;

        function abrirEdicion(c){
          // Abrir modal de nueva oportunidad precargado con datos del cliente
          var cantidadGuardada=c.cantidadInteres||"1";
          var precioGuardado=c.precioInteres?String(Number(c.precioInteres)/Number(cantidadGuardada||1)):"";
          if(!precioGuardado&&c.productoInteres){
            var match=catActivo.find(function(p){ return p.nombre===c.productoInteres; });
            if(match&&match.precio) precioGuardado=String(match.precio);
          }
          setFormProspecto({
            clienteId:String(c.id),
            nuevoNombre:"",
            origen:c.origen||"",
            canalPrincipal:c.canalPrincipal||"",
            contacto:c.contacto||c.instagram||c.messenger||"",
            productoInteres:c.productoInteres||"",
            precioInteres:precioGuardado,
            cantidadInteres:cantidadGuardada,
            envioPrecio:c.estadoProspecto==="En seguimiento",
            notas:c.notasProspecto||"",
            _editandoId:c.id // flag para saber que es edición
          });
          setBuscaCliOpo("");
          setModalProspecto(true);
        }

        return e("div",null,
          // HEADER
          e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,flexWrap:"wrap",gap:12}},
            e("div",null,
              e("div",{style:{fontSize:28,fontWeight:700,color:C.text,lineHeight:1.1,marginBottom:4}},"Oportunidades"),
              e("div",{style:{fontSize:14,color:C.textMuted}},"Personas interesadas en tus productos")
            ),
            e("button",{
              style:{cursor:"pointer",padding:"9px 20px",borderRadius:14,border:"none",background:C.purple,fontSize:13,color:"#fff",fontWeight:600,whiteSpace:"nowrap"},
              onClick:function(){ setFormProspecto({clienteId:"",nuevoNombre:"",origen:"",canalPrincipal:"",contacto:"",productoInteres:"",precioInteres:"",envioPrecio:false,notas:""}); setBuscaCliOpo(""); setModalProspecto(true); }
            },"+ Nueva oportunidad")
          ),

          // FILTROS
          e("div",{style:{display:"flex",gap:8,marginBottom:20}},
            e("button",{
              style:{cursor:"pointer",padding:"6px 16px",borderRadius:20,border:"1.5px solid "+(filtroProspecto!=="Perdido"?C.purple:C.border),background:filtroProspecto!=="Perdido"?C.purplePale:"transparent",fontSize:12,color:filtroProspecto!=="Perdido"?C.purple:C.textMuted,fontWeight:filtroProspecto!=="Perdido"?600:400},
              onClick:function(){ setFiltroProspecto("activas"); }
            },"Activas · "+oportunidades.filter(function(c){ return c.estadoProspecto!=="Perdido"; }).length),
            e("button",{
              style:{cursor:"pointer",padding:"6px 16px",borderRadius:20,border:"1.5px solid "+(filtroProspecto==="Perdido"?C.border:C.border),background:filtroProspecto==="Perdido"?"#FEF2F2":"transparent",fontSize:12,color:filtroProspecto==="Perdido"?"#EF4444":C.textMuted,fontWeight:filtroProspecto==="Perdido"?600:400},
              onClick:function(){ setFiltroProspecto("Perdido"); }
            },"Perdidas · "+oportunidades.filter(function(c){ return c.estadoProspecto==="Perdido"; }).length)
          ),

          (filtroProspecto==="Nueva"||filtroProspecto==="En seguimiento"||filtroProspecto==="Sin respuesta")&&e("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:16,fontSize:12,color:C.purple}},
            e("span",null,"Mostrando: "+filtroProspecto),
            e("button",{style:{cursor:"pointer",background:"none",border:"none",color:C.purple,fontSize:13,padding:0,lineHeight:1},onClick:function(){ setFiltroProspecto("activas"); }},"×")
          ),

          // LISTA
          opsFiltradas.length===0?
            e("div",{style:{textAlign:"center",padding:"60px 0"}},
              e("div",{style:{fontSize:36,marginBottom:12}},"🎯"),
              filtroProspecto==="todos"
                ? e("div",null,
                    e("div",{style:{fontSize:15,fontWeight:600,color:C.textMuted,marginBottom:6}},"Aún no tienes oportunidades"),
                    e("div",{style:{fontSize:13,color:C.textDim,marginBottom:20}},"Todo contacto nuevo se convierte en una oportunidad."),
                    e("button",{style:{cursor:"pointer",padding:"9px 20px",borderRadius:12,border:"none",background:C.purple,fontSize:13,color:"#fff",fontWeight:600},onClick:function(){ setModalProspecto(true); }},"+ Nueva oportunidad")
                  )
                : e("div",{style:{fontSize:14,color:C.textDim}},"No hay oportunidades en este estado")
            ):
            e("div",{style:{display:"flex",flexDirection:"column",gap:12}},
              opsFiltradas.map(function(c){
                var est=ESTADOS_OPO.find(function(x){ return x.k===c.estadoProspecto; })||ESTADOS_OPO[0];
                var esPerdido=c.estadoProspecto==="Perdido";
                var editando=editandoId===c.id;

                var esHighlight=c.id===highlightOpoId;
                return e("div",{key:c.id,style:{background:C.surface,borderRadius:16,border:"2px solid "+(esHighlight?C.purple:esPerdido?C.border+"55":C.border),padding:"16px 18px",boxShadow:esHighlight?"0 0 0 3px "+C.purple+"22":"0 1px 4px rgba(0,0,0,0.04)",opacity:esPerdido?0.65:1,transition:"box-shadow 0.3s"},ref:function(el){ if(el&&esHighlight){ el.scrollIntoView({behavior:"smooth",block:"start"}); } }},

                  // FILA 1: avatar + nombre + estado (discreto)
                  e("div",{style:{display:"flex",alignItems:"center",gap:12,marginBottom:10}},
                    e("div",{style:{width:38,height:38,borderRadius:10,background:avatarColor(c.id)+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontWeight:700,fontSize:13,color:avatarColor(c.id)}},iniciales(c.nombre)),
                    e("div",{style:{flex:1,minWidth:0}},
                      e("div",{style:{fontWeight:700,fontSize:14,color:C.text,marginBottom:2}},c.nombre),
                      e("div",{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}},(function(){
                        var diasEnEstado=diasDesde(c.fechaEtapa||c.fecha);
                        var esNueva=c.estadoProspecto==="Nueva";
                        var esSeguimiento=c.estadoProspecto==="En seguimiento";
                        var urgente=(esNueva&&diasEnEstado>=3)||(esSeguimiento&&diasEnEstado>=4);
                        return [
                          e("span",{key:"fecha",style:{fontSize:11,color:C.textDim}},c.fecha||FECHA_HOY),
                          urgente&&e("span",{key:"alerta",style:{fontSize:11,fontWeight:600,color:"#EF4444",background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:20,padding:"1px 8px"}},
                            diasEnEstado+" días "+(esSeguimiento?"sin confirmar":"sin movimiento")
                          )
                        ];
                      })())
                    ),
                    // Estado — discreto, solo punto + texto
                    e("select",{
                      value:c.estadoProspecto,
                      onChange:function(ev){ cambiarEstado(c.id,ev.target.value); },
                      style:{fontSize:11,padding:"4px 6px",borderRadius:8,border:"1px solid "+C.border,background:C.surfaceUp,color:C.textMuted,cursor:"pointer",outline:"none",flexShrink:0}
                    }, ESTADOS_OPO.map(function(x){ return e("option",{key:x.k,value:x.k},x.label); }))
                  ),

                  // FILA 2: datos (clickeable para editar)
                  e("div",{
                        style:{borderRadius:10,padding:"8px 12px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:10,border:"1px dashed "+C.border},
                        onClick:function(){ abrirEdicion(c); }
                      },
                        e("div",{style:{flex:1,minWidth:0}},
                          c.productoInteres
                            ? e("div",{style:{fontSize:13,fontWeight:600,color:C.text,marginBottom:1}},c.productoInteres)
                            : e("div",{style:{fontSize:12,color:C.textDim}},"Sin producto aún — toca para agregar"),
                          c.precioInteres&&e("div",{style:{fontSize:13,color:C.green,fontWeight:700}},"$"+Number(c.precioInteres).toLocaleString()),
                          c.notasProspecto&&e("div",{style:{fontSize:11,color:C.textMuted,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},c.notasProspecto)
                        ),
                        e("svg",{width:12,height:12,viewBox:"0 0 24 24",fill:"none",stroke:C.border,strokeWidth:2,flexShrink:0},e("path",{d:"M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"}))
                      ),

                  // HINT CLEO
                  !esPerdido&&!editando&&(function(){
                    var texto=!c.productoInteres?"Pregúntale qué producto le interesa y agrégalo aquí":
                              c.estadoProspecto==="Nueva"&&c.precioInteres?"Envíale el precio para que confirme":
                              c.estadoProspecto==="En seguimiento"?"¿Ya confirmó? Convierte en pedido":
                              c.estadoProspecto==="Sin respuesta"?"Intenta contactarla de nuevo":"";
                    if(!texto) return null;
                    return e("div",{style:{fontSize:11,color:C.textDim,marginBottom:8,display:"flex",alignItems:"center",gap:4}},
                      e("span",{style:{opacity:0.5}},"💡"),e("span",null,texto)
                    );
                  })(),

                  // FILA 3: acciones
                  !esPerdido&&!editando&&e("div",{style:{display:"flex",gap:6,borderTop:"1px solid "+C.border+"44",paddingTop:10,alignItems:"center"}},
                    e(BtnCanal,{cliente:c,small:true}),
                    c.productoInteres&&c.precioInteres&&e("button",{
                      style:{cursor:"pointer",padding:"5px 10px",borderRadius:8,border:"1px solid "+C.border+"88",background:"transparent",fontSize:11,color:C.textDim},
                      onClick:function(){
                        var precioOpo=c.precioInteres||"";
                        if(!precioOpo&&c.productoInteres){
                          var match=catActivo.find(function(p){ return p.nombre===c.productoInteres; });
                          if(match&&match.precio) precioOpo=String(match.precio);
                        }
                        var cotExistente=cotizaciones.find(function(cot){ return String(cot.clienteId)===String(c.id); });
                        if(cotExistente){
                          setFormCot(Object.assign({},cotExistente,{clienteNombre:c.nombre}));
                        } else {
                          setFormCot(Object.assign({},cotVacio,{clienteId:String(c.id),clienteNombre:c.nombre,concepto:c.productoInteres||"",precioUnit:precioOpo,monto:precioOpo}));
                        }
                        setModalCot(true);
                      }
                    },"Cotización"),

                    e("div",{style:{flex:1}}),

                    // Acción principal
                    !c.productoInteres&&e("button",{
                      style:{cursor:"pointer",padding:"7px 16px",borderRadius:10,border:"none",background:C.purple,fontSize:12,color:"#fff",fontWeight:600},
                      onClick:function(){ abrirEdicion(c); }
                    },"¿Qué le interesa? →"),

                    c.productoInteres&&c.precioInteres&&c.estadoProspecto==="Nueva"&&e("button",{
                      style:{cursor:"pointer",padding:"7px 16px",borderRadius:10,border:"none",background:C.purple,fontSize:12,color:"#fff",fontWeight:600},
                      onClick:function(){
                        var canal=c.canalPrincipal||"WhatsApp";
                        var nombre=c.nombre.split(" ")[0];
                        var msg="Hola "+nombre+", te comparto el precio de "+(c.productoInteres||"mi producto")+": $"+Number(c.precioInteres).toLocaleString()+". ¿Te interesa? 😊";
                        var url=null;
                        if(canal==="WhatsApp"&&c.contacto) url="https://wa.me/52"+c.contacto.replace(/\D/g,"")+"?text="+encodeURIComponent(msg);
                        else if(canal==="Instagram"&&c.instagram) url="https://instagram.com/"+c.instagram.replace("@","");
                        else if(c.contacto) url="https://wa.me/52"+c.contacto.replace(/\D/g,"")+"?text="+encodeURIComponent(msg);
                        if(url) window.open(url,"_blank");
                        // Actualizar estado y resetear contador
                        setClientes(clientes.map(function(x){
                          return x.id===c.id?Object.assign({},x,{estadoProspecto:"En seguimiento",fechaEtapa:FECHA_HOY,ultimoContacto:FECHA_HOY}):x;
                        }));
                      }
                    },"Enviar precio"),

                    c.productoInteres&&!c.precioInteres&&c.estadoProspecto==="Nueva"&&e("button",{
                      style:{cursor:"pointer",padding:"7px 16px",borderRadius:10,border:"none",background:C.purple,fontSize:12,color:"#fff",fontWeight:600},
                      onClick:function(){ abrirEdicion(c); }
                    },"Agregar precio"),

                    c.estadoProspecto==="En seguimiento"&&e("button",{
                      style:{cursor:"pointer",padding:"7px 16px",borderRadius:10,border:"none",background:C.green,fontSize:12,color:"#fff",fontWeight:600,whiteSpace:"nowrap"},
                      onClick:function(){
                        var ahora=new Date().toISOString();
                        setClientes(clientes.map(function(x){
                          return x.id===c.id?Object.assign({},x,{estadoProspecto:"Convertido",etapa:"Ganado",fechaPedido:ahora}):x;
                        }));
                        var nuevoPedido={id:"ped_"+Date.now(),clienteId:c.id,productos:c.productoInteres||"",cantidad:1,total:Number(c.precioInteres)||0,pagos:[],estadoPedido:"preparando",notas:c.notasProspecto||"",fecha:FECHA_HOY,fechaCreado:ahora};
                        setPedidos([nuevoPedido,...pedidos]);
                        setCelebPedidoData({clienteNombre:c.nombre,producto:c.productoInteres||"",precio:c.precioInteres||0,clienteId:c.id});
                        setCelebPaso(1); setCelebRazon([]);
                        setVista("pedidos");
                      }
                    },"Crear pedido"),

                    c.estadoProspecto==="Sin respuesta"&&e(BtnCanal,{cliente:c,small:false,label:"Contactar"})
                  )
                );
              })
            ),

          // MODAL NUEVA OPORTUNIDAD
          modalProspecto&&e("div",{style:Object.assign({},st.ov,{overflow:"hidden"}),onClick:function(){ setModalProspecto(false); setBuscaCliOpo(""); }},
            e("div",{style:{background:C.surface,borderRadius:isMobile?"20px 20px 0 0":"20px",width:isMobile?"100%":500,maxWidth:"100%",maxHeight:isMobile?"94vh":"88vh",border:isMobile?"none":"1px solid "+C.border,boxShadow:"0 8px 32px rgba(0,0,0,0.14)",display:"flex",flexDirection:"column",overflow:"hidden",margin:isMobile?0:"auto"},onClick:function(ev){ ev.stopPropagation(); }},

              // HEADER
              e("div",{style:{padding:"20px 24px 16px",background:"linear-gradient(135deg,"+C.purplePale+" 0%,transparent 70%)",borderBottom:"1px solid "+C.border,flexShrink:0,display:"flex",alignItems:"flex-start",justifyContent:"space-between"}},
                e("div",null,
                  e("div",{style:{fontWeight:700,fontSize:18,color:C.text}},formProspecto._editandoId?"Editar oportunidad":"Nueva oportunidad"),
                  e("div",{style:{fontSize:12,color:C.textMuted,marginTop:2}},formProspecto._editandoId?"Actualiza el producto, precio o notas":"Alguien que mostró interés en tus productos")
                ),
                e("button",{style:{background:C.surfaceUp,border:"1px solid "+C.border,borderRadius:10,cursor:"pointer",color:C.textMuted,fontSize:16,lineHeight:1,padding:"6px 10px"},onClick:function(){ setModalProspecto(false); setBuscaCliOpo(""); }},"×")
              ),

              // BODY
              e("div",{style:{padding:isMobile?"16px 20px":"20px 24px",overflowY:"auto",flex:1,display:"flex",flexDirection:"column",gap:16}},

                // CLIENTE — solo si es nueva oportunidad
                !formProspecto._editandoId&&e("div",{style:{position:"relative"}},
                  e("label",{style:st.lbl},"Cliente"),
                  e("div",{style:{display:"flex",gap:6}},
                    e("input",{
                      placeholder:formProspecto.clienteId?(clientes.find(function(c){ return String(c.id)===String(formProspecto.clienteId); })||{}).nombre||"Buscar cliente...":"Buscar o escribir nombre...",
                      value:buscaCliOpo,
                      onChange:function(ev){ setBuscaCliOpo(ev.target.value); setFormProspecto(Object.assign({},formProspecto,{clienteId:"",nuevoNombre:ev.target.value})); },
                      onFocus:function(){ setBuscaCliOpo(""); },
                      style:Object.assign({},st.inp,{flex:1})
                    }),
                    e("button",{
                      style:{cursor:"pointer",padding:"0 14px",borderRadius:10,border:"1px solid "+C.border,background:buscaCliOpo==="*"?C.purplePale:"transparent",fontSize:14,color:C.textMuted,flexShrink:0},
                      onClick:function(){ setBuscaCliOpo(buscaCliOpo==="*"?"":"*"); setFormProspecto(Object.assign({},formProspecto,{clienteId:""})); }
                    },"☰")
                  ),
                  buscaCliOpo.length>0&&e("div",{style:{position:"absolute",top:"100%",left:0,right:0,background:C.surface,border:"1px solid "+C.border,borderRadius:10,zIndex:50,maxHeight:180,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.1)"}},
                    (function(){
                      var filtrados=clientes.filter(function(c){ return buscaCliOpo==="*"||c.nombre.toLowerCase().includes(buscaCliOpo.toLowerCase()); }).sort(function(a,b){ return a.nombre.localeCompare(b.nombre,"es"); });
                      return e("div",null,
                        filtrados.map(function(c){
                          return e("div",{key:c.id,
                            style:{padding:"10px 14px",cursor:"pointer",fontSize:13,color:C.text,borderBottom:"0.5px solid "+C.border},
                            onMouseDown:function(ev){ ev.preventDefault(); setFormProspecto(Object.assign({},formProspecto,{clienteId:String(c.id),nuevoNombre:"",origen:""})); setBuscaCliOpo(""); }
                          },
                            e("div",{style:{fontWeight:500}},c.nombre),
                            c.negocio&&e("div",{style:{fontSize:12,color:C.textDim}},c.negocio)
                          );
                        }),
                        buscaCliOpo!=="*"&&buscaCliOpo.trim().length>1&&e("div",{
                          style:{padding:"10px 14px",cursor:"pointer",fontSize:13,color:C.purple,fontWeight:600,borderTop:filtrados.length>0?"1px solid "+C.border:"none"},
                          onMouseDown:function(ev){ ev.preventDefault(); setFormProspecto(Object.assign({},formProspecto,{clienteId:"",nuevoNombre:buscaCliOpo.trim()})); setBuscaCliOpo(""); }
                        },"＋ Agregar \""+buscaCliOpo.trim()+"\" como nuevo cliente")
                      );
                    })()
                  ),
                  formProspecto.clienteId&&!buscaCliOpo&&(function(){
                    var cl=clientes.find(function(c){ return String(c.id)===String(formProspecto.clienteId); });
                    if(!cl) return null;
                    return e("div",{style:{marginTop:6,padding:"8px 12px",background:C.purplePale,borderRadius:8,fontSize:13,color:C.purple,display:"flex",justifyContent:"space-between",alignItems:"center"}},
                      e("div",{style:{fontWeight:600}},cl.nombre),
                      e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:16},onClick:function(){ setFormProspecto(Object.assign({},formProspecto,{clienteId:"",nuevoNombre:""})); setBuscaCliOpo(""); }},"×")
                    );
                  })(),
                  !formProspecto.clienteId&&formProspecto.nuevoNombre&&!buscaCliOpo&&e("div",{style:{marginTop:6,padding:"8px 12px",background:"#ECFDF5",borderRadius:8,fontSize:13,color:"#10B981",display:"flex",justifyContent:"space-between",alignItems:"center"}},
                    e("span",null,"＋ Nuevo: ",e("b",null,formProspecto.nuevoNombre)),
                    e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:16},onClick:function(){ setFormProspecto(Object.assign({},formProspecto,{nuevoNombre:""})); }},"×")
                  )
                ),

                // ¿CÓMO LLEGÓ A TI? — solo si es cliente nuevo
                !formProspecto._editandoId&&!formProspecto.clienteId&&formProspecto.nuevoNombre&&e("div",null,
                  e("label",{style:st.lbl},"¿Cómo llegó a ti?"),
                  e("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
                    ["Instagram","Facebook","WhatsApp","Referido","TikTok","Otro"].map(function(org){
                      var activo=formProspecto.origen===org;
                      return e("button",{key:org,
                        style:{cursor:"pointer",padding:"7px 12px",borderRadius:20,border:"1.5px solid "+(activo?C.purple:C.border),background:activo?C.purple:"transparent",fontSize:12,color:activo?"#fff":C.textMuted,fontWeight:activo?600:400},
                        onClick:function(){ setFormProspecto(Object.assign({},formProspecto,{origen:org})); }
                      },org);
                    })
                  )
                ),

                // ¿POR DÓNDE LO CONTACTAS? — solo si es cliente nuevo, obligatorio
                !formProspecto._editandoId&&!formProspecto.clienteId&&formProspecto.nuevoNombre&&e("div",null,
                  e("label",{style:Object.assign({},st.lbl,{display:"flex",alignItems:"center",gap:4})},
                    "¿Dónde lo contactas?",
                    e("span",{style:{fontSize:10,color:C.amber,fontWeight:600}},"obligatorio")
                  ),
                  e("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}},
                    ["WhatsApp","Instagram","Facebook"].map(function(canal){
                      var activo=formProspecto.canalPrincipal===canal;
                      return e("button",{key:canal,
                        style:{cursor:"pointer",padding:"7px 14px",borderRadius:20,border:"1.5px solid "+(activo?C.purple:C.border),background:activo?C.purple:"transparent",fontSize:12,color:activo?"#fff":C.textMuted,fontWeight:activo?600:400},
                        onClick:function(){ setFormProspecto(Object.assign({},formProspecto,{canalPrincipal:canal,contacto:""})); }
                      },canal);
                    })
                  ),
                  formProspecto.canalPrincipal&&e("div",null,
                    e("input",{
                      placeholder:formProspecto.canalPrincipal==="WhatsApp"?"Número de WhatsApp (10 dígitos)":
                                  formProspecto.canalPrincipal==="Instagram"?"Usuario de Instagram (@...)":
                                  "Perfil de Facebook",
                      value:formProspecto.contacto||"",
                      onChange:function(ev){ setFormProspecto(Object.assign({},formProspecto,{contacto:ev.target.value})); },
                      style:Object.assign({},st.inp,{
                        border:"1px solid "+(
                          formProspecto.canalPrincipal==="WhatsApp"&&formProspecto.contacto&&formProspecto.contacto.replace(/\D/g,"").length!==10
                            ?"#FCA5A5":C.border)
                      }),
                      type:formProspecto.canalPrincipal==="WhatsApp"?"tel":"text"
                    }),
                    formProspecto.canalPrincipal==="WhatsApp"&&formProspecto.contacto&&formProspecto.contacto.replace(/\D/g,"").length!==10&&
                      e("div",{style:{fontSize:11,color:"#EF4444",marginTop:3}},
                        formProspecto.contacto.replace(/\D/g,"").length+" de 10 dígitos"
                      )
                  )
                ),

                // PRODUCTO
                e("div",null,
                  e("label",{style:st.lbl},"Producto de interés"),
                  (function(){
                    // Catálogo de productos
                    var catalogoUnificado=[];
                    productosCat.forEach(function(sv){ catalogoUnificado.push({nombre:sv.nombre,precio:sv.precio}); });
                    productos.forEach(function(p){
                      if(!catalogoUnificado.find(function(x){ return x.nombre===p; })){
                        catalogoUnificado.push({nombre:p,precio:""});
                      }
                    });
                    var seleccionado=catalogoUnificado.find(function(x){ return x.nombre===formProspecto.productoInteres; });
                    var esManual=formProspecto.productoInteres&&!seleccionado;

                    return e("div",null,
                      catalogoUnificado.length>0&&e("select",{
                        value:seleccionado?formProspecto.productoInteres:"",
                        onChange:function(ev){
                          var val=ev.target.value;
                          var match=catalogoUnificado.find(function(x){ return x.nombre===val; });
                          var precioAuto=match&&match.precio?String(match.precio):"";
                          setFormProspecto(Object.assign({},formProspecto,{
                            productoInteres:val,
                            precioInteres:precioAuto||formProspecto.precioInteres
                          }));
                        },
                        style:Object.assign({},st.inp,{marginBottom:6})
                      },
                        e("option",{value:""},"— Seleccionar del catálogo —"),
                        catalogoUnificado.map(function(p){ return e("option",{key:p.nombre,value:p.nombre},p.nombre+(p.precio?" · $"+Number(p.precio).toLocaleString():"")); })
                      ),
                      !seleccionado&&catalogoUnificado.length>0&&e("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:6}},
                        e("div",{style:{flex:1,height:1,background:C.border}}),
                        e("div",{style:{fontSize:11,color:C.textDim,whiteSpace:"nowrap"}},"o escríbelo"),
                        e("div",{style:{flex:1,height:1,background:C.border}})
                      ),
                      !seleccionado&&e("input",{
                        placeholder:"ej. Pastel de 3 leches...",
                        value:esManual?formProspecto.productoInteres:"",
                        onChange:function(ev){ setFormProspecto(Object.assign({},formProspecto,{productoInteres:ev.target.value})); },
                        style:st.inp
                      })
                    );
                  })()
                ),

                // PRECIO — requerido
                e("div",{style:{display:"flex",gap:10}},
                  e("div",{style:{flex:1}},
                    e("label",{style:st.lbl},"Cantidad"),
                    e("input",{
                      type:"number",min:1,placeholder:"1",
                      value:formProspecto.cantidadInteres||"",
                      onChange:function(ev){ setFormProspecto(Object.assign({},formProspecto,{cantidadInteres:ev.target.value})); },
                      style:st.inp
                    })
                  ),
                  e("div",{style:{flex:2}},
                    e("label",{style:st.lbl},"Precio unitario"),
                    e("input",{
                      type:"number",placeholder:"$0",
                      value:formProspecto.precioInteres||"",
                      onChange:function(ev){ setFormProspecto(Object.assign({},formProspecto,{precioInteres:ev.target.value})); },
                      style:st.inp
                    })
                  )
                ),
                formProspecto.precioInteres&&e("div",{style:{fontSize:12,color:C.textMuted,marginTop:-6}},
                  "Total: ",e("b",{style:{color:C.text}},"$"+(Number(formProspecto.precioInteres||0)*Number(formProspecto.cantidadInteres||1)).toLocaleString())
                ),

                // ¿YA LE ENVIASTE EL PRECIO? — solo cambia el estado
                formProspecto.precioInteres&&e("div",null,
                  e("label",{style:st.lbl},"¿Ya le enviaste el precio?"),
                  e("div",{style:{display:"flex",gap:8}},
                    e("button",{
                      style:{cursor:"pointer",padding:"8px 20px",borderRadius:10,border:"1.5px solid "+(formProspecto.envioPrecio===false?C.purple:C.border),background:formProspecto.envioPrecio===false?C.purple:"transparent",fontSize:13,color:formProspecto.envioPrecio===false?"#fff":C.textMuted,fontWeight:500},
                      onClick:function(){ setFormProspecto(Object.assign({},formProspecto,{envioPrecio:false})); }
                    },"No"),
                    e("button",{
                      style:{cursor:"pointer",padding:"8px 20px",borderRadius:10,border:"1.5px solid "+(formProspecto.envioPrecio===true?C.purple:C.border),background:formProspecto.envioPrecio===true?C.purple:"transparent",fontSize:13,color:formProspecto.envioPrecio===true?"#fff":C.textMuted,fontWeight:500},
                      onClick:function(){ setFormProspecto(Object.assign({},formProspecto,{envioPrecio:true})); }
                    },"Sí")
                  )
                ),

                // NOTAS
                e("div",null,
                  e("label",{style:st.lbl},"Notas (opcional)"),
                  e("textarea",{
                    placeholder:"ej. Preguntó por WhatsApp, referida por Ana...",
                    value:formProspecto.notas,
                    onChange:function(ev){ setFormProspecto(Object.assign({},formProspecto,{notas:ev.target.value})); },
                    style:Object.assign({},st.inp,{minHeight:60,resize:"vertical"})
                  })
                )
              ),

              // FOOTER
              e("div",{style:{padding:"14px 24px",borderTop:"1px solid "+C.border,display:"flex",flexDirection:"column",gap:8,background:C.surfaceUp,flexShrink:0}},
                (function(){
                  var esEdicion=!!formProspecto._editandoId;
                  var esNuevo=!esEdicion&&!formProspecto.clienteId&&!!formProspecto.nuevoNombre.trim();
                  var faltaCanal=esNuevo&&!formProspecto.canalPrincipal;
                  var telefonoBad=esNuevo&&formProspecto.canalPrincipal==="WhatsApp"&&formProspecto.contacto&&formProspecto.contacto.replace(/\D/g,"").length!==10;
                  var faltaContacto=esNuevo&&formProspecto.canalPrincipal&&!formProspecto.contacto;
                  var valido=esEdicion||(formProspecto.clienteId||formProspecto.nuevoNombre.trim())&&!faltaCanal&&!faltaContacto&&!telefonoBad;
                  var faltantes=[];
                  if(!esEdicion&&!formProspecto.clienteId&&!formProspecto.nuevoNombre.trim()) faltantes.push("nombre");
                  if(faltaCanal) faltantes.push("canal de contacto");
                  if(faltaContacto) faltantes.push(formProspecto.canalPrincipal==="WhatsApp"?"número":"usuario");
                  if(telefonoBad) faltantes.push("número debe ser 10 dígitos");
                  return e("div",null,
                    !valido&&faltantes.length>0&&e("div",{style:{fontSize:11,color:C.amber,textAlign:"center",marginBottom:4}},"Falta: "+faltantes.join(", ")),
                    e("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"}},
                      e("button",{style:st.btn,onClick:function(){ setModalProspecto(false); setBuscaCliOpo(""); }},"Cancelar"),
                      e("button",{
                        style:Object.assign({},st.btnP,{opacity:valido?1:0.45}),
                        disabled:!valido,
                        onClick:function(){ if(valido){ crearOportunidad(); setBuscaCliOpo(""); } }
                      },esEdicion?"Guardar cambios":"Guardar oportunidad")
                    )
                  );
                })()
              )
            )
          )
        );
      })(),

      // PEDIDOS (solo modo productos)
      vista==="pedidos"&&(function(){
        var ESTADOS_PEDIDO=[
          {k:"preparando", label:"Preparando", color:"#4B5EFC", bg:"rgba(75,94,252,0.06)", border:"#A5B4FC"},
          {k:"entregado",  label:"Entregado",  color:"#10B981", bg:"#ECFDF5", border:"#6EE7B7"},
          {k:"cancelado",  label:"Cancelado",  color:"#EF4444", bg:"#FEF2F2", border:"#FCA5A5"},
        ];

        // Normalizar pedidos legacy con estado "pendiente" → "preparando"
        var pedidosNorm=pedidos.map(function(p){ return p.estadoPedido==="pendiente"?Object.assign({},p,{estadoPedido:"preparando"}):p; });

        function estadoPago(totalPagado, totalPedido){
          if(totalPagado<=0) return {k:"sin_pago", label:"Sin pago", color:"#6B7280", bg:"#F9FAFB"};
          if(totalPagado>=totalPedido&&totalPedido>0) return {k:"pagado", label:"Pagado ✓", color:"#10B981", bg:"#ECFDF5"};
          if(totalPagado>0) return {k:"anticipo", label:"Anticipo recibido", color:"#F59E0B", bg:"#FFFBEB"};
          return {k:"sin_pago", label:"Sin pago", color:"#6B7280", bg:"#F9FAFB"};
        }

        var pedidosFiltrados=pedidosNorm.filter(function(p){
          if(filtroPedido!=="todos"&&p.estadoPedido!==filtroPedido) return false;
          if(filtroPedidoPeriodo!=="todo"&&!enPeriodo(p.fecha||p.fechaCreado,filtroPedidoPeriodo)) return false;
          if(filtroPedidoSaldo==="con_saldo"){
            var pagadoF=(p.pagos||[]).reduce(function(s,pg){ return s+Number(pg.monto); },0);
            var saldoF=Number(p.total||0)-pagadoF;
            if(!(saldoF>0&&p.estadoPedido!=="cancelado")) return false;
          }
          return true;
        });
        if(highlightPedidoId){
          pedidosFiltrados=[...pedidosFiltrados].sort(function(a,b){
            if(a.id===highlightPedidoId) return -1;
            if(b.id===highlightPedidoId) return 1;
            return 0;
          });
        }

        function actualizarPedido(id, cambios){
          setPedidos(pedidos.map(function(p){ return p.id===id?Object.assign({},p,cambios):p; }));
        }

        function registrarPagoPedido(pedidoId){
          if(!formPagoPedido.monto) return;
          var ped=pedidos.find(function(p){ return p.id===pedidoId; });
          if(!ped) return;
          var nuevosPagos=[...(ped.pagos||[]),{id:"pp_"+Date.now(),monto:Number(formPagoPedido.monto),fecha:formPagoPedido.fecha,concepto:formPagoPedido.concepto||"Pago"}];
          actualizarPedido(pedidoId,{pagos:nuevosPagos});
          setFormPagoPedido({monto:"",fecha:FECHA_HOY,concepto:"Pago"});
          setPedidoPagosId(null);
        }

        return e("div",null,
          // HEADER
          e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,flexWrap:"wrap",gap:12}},
            e("div",null,
              e("div",{style:{fontSize:28,fontWeight:700,color:C.text,lineHeight:1.1,marginBottom:4}},"Pedidos"),
              e("div",{style:{fontSize:14,color:C.textMuted}},"Compras confirmadas y en proceso")
            ),
            e("button",{
              style:{cursor:"pointer",padding:"9px 20px",borderRadius:14,border:"none",background:C.green,fontSize:13,color:"#fff",fontWeight:600,whiteSpace:"nowrap"},
              onClick:function(){
                setNuevoPedidoForm({clienteId:"",nuevoNombre:"",productos:"",cantidad:1,total:"",anticipo:"",fechaEntrega:"",notas:""});
                setBuscaCliPed("");
                setNuevoPedidoModal(true);
              }
            },"+ Pedido")
          ),

          // FILTROS — mismo estilo que Cotizaciones
          e("div",{style:{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}},
            e("select",{
              value:filtroPedido,
              onChange:function(ev){ setFiltroPedido(ev.target.value); },
              style:{cursor:"pointer",padding:"7px 12px",borderRadius:12,border:"1px solid "+C.border,background:C.surface,fontSize:12,color:C.textMuted,outline:"none"}
            },
              e("option",{value:"todos"},"Todos · "+pedidosNorm.length),
              ESTADOS_PEDIDO.map(function(est){
                var n=pedidosNorm.filter(function(p){ return p.estadoPedido===est.k; }).length;
                return e("option",{key:est.k,value:est.k},est.label+" · "+n);
              })
            ),
            e("select",{
              value:filtroPedidoSaldo,
              onChange:function(ev){ setFiltroPedidoSaldo(ev.target.value); },
              style:{cursor:"pointer",padding:"7px 12px",borderRadius:12,border:"1px solid "+C.border,background:filtroPedidoSaldo==="con_saldo"?C.amberBg:C.surface,fontSize:12,color:filtroPedidoSaldo==="con_saldo"?C.amber:C.textMuted,fontWeight:filtroPedidoSaldo==="con_saldo"?600:400,outline:"none"}
            },
              e("option",{value:"todos"},"Todos los pagos"),
              e("option",{value:"con_saldo"},"Con saldo pendiente")
            ),
            e("select",{
              value:filtroPedidoPeriodo,
              onChange:function(ev){ setFiltroPedidoPeriodo(ev.target.value); },
              style:{cursor:"pointer",padding:"7px 12px",borderRadius:12,border:"1px solid "+C.border,background:C.surface,fontSize:12,color:C.textMuted,outline:"none"}
            },
              [["todo","Todo el tiempo"],["semana","Esta semana"],["mes","Este mes"],["trimestre","Trimestre"]].map(function(p){ return e("option",{key:p[0],value:p[0]},p[1]); })
            )
          ),

          // LISTA
          pedidosFiltrados.length===0?
            e("div",{style:{textAlign:"center",padding:"60px 0"}},
              e("div",{style:{fontSize:36,marginBottom:12}},"📦"),
              e("div",{style:{fontSize:15,fontWeight:600,color:C.textMuted,marginBottom:6}},
                (filtroPedido==="todos"&&filtroPedidoPeriodo==="todo"&&filtroPedidoSaldo==="todos")?"Aún no hay pedidos":"No hay pedidos con esos filtros"
              ),
              (filtroPedido==="todos"&&filtroPedidoPeriodo==="todo"&&filtroPedidoSaldo==="todos")&&e("div",{style:{fontSize:13,color:C.textDim}},"Convierte un prospecto en pedido para verlo aquí.")
            ):
            e("div",{style:{display:"flex",flexDirection:"column",gap:12}},
              pedidosFiltrados.map(function(ped){
                var cl=clientes.find(function(c){ return c.id===ped.clienteId; });
                var estPed=ESTADOS_PEDIDO.find(function(x){ return x.k===ped.estadoPedido; })||ESTADOS_PEDIDO[0];
                var pagosArr=ped.pagos||[];
                var totalPagado=pagosArr.reduce(function(s,p){ return s+Number(p.monto); },0);
                var totalPedido=Number(ped.total)||0;
                var restante=Math.max(0,totalPedido-totalPagado);
                var ep=estadoPago(totalPagado,totalPedido);
                var esCancelado=ped.estadoPedido==="cancelado";
                var esEntregado=ped.estadoPedido==="entregado";
                var abierto=pedidoPagosId===ped.id;
                var diasPreparando=ped.estadoPedido==="preparando"?diasDesde(ped.fecha||ped.fechaCreado):0;
                var alertaDias=diasPreparando>=5;

                var bordeColor=esCancelado?C.border:
                               esEntregado&&restante<=0?C.green:
                               esEntregado&&restante>0?C.amber:
                               estPed.color;
                var esHighlightPed=ped.id===highlightPedidoId;
                return e("div",{key:ped.id,style:{background:C.surface,borderRadius:14,border:esHighlightPed?"2px solid "+C.purple:"1px solid "+C.border,padding:isMobile?"12px 14px":"16px 18px",boxShadow:esHighlightPed?"0 0 0 3px "+C.purple+"22":"0 1px 4px rgba(0,0,0,0.04)",opacity:esCancelado?0.65:1,borderLeft:"3px solid "+bordeColor,transition:"box-shadow 0.3s"},ref:function(el){ if(el&&esHighlightPed){ el.scrollIntoView({behavior:"smooth",block:"start"}); } }},

                  // FILA 1: avatar + info + estado discreto
                  e("div",{style:{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}},
                    e("div",{style:{width:36,height:36,borderRadius:9,background:cl?avatarColor(cl.id)+"18":"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontWeight:700,fontSize:12,color:cl?avatarColor(cl.id):"#94A3B8"}},cl?iniciales(cl.nombre):"?"),
                    e("div",{style:{flex:1,minWidth:0}},
                      e("div",{style:{fontWeight:700,fontSize:13,color:C.text,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},cl?cl.nombre:"Cliente"),
                      e("div",{style:{fontSize:11,color:C.textMuted,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},ped.productos||"Sin producto"),
                      e("div",{style:{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}},
                        e("span",{style:{fontSize:11,padding:"2px 7px",borderRadius:8,background:ep.bg,color:ep.color,fontWeight:600}},ep.label),
                        ped.fechaEntrega&&e("span",{style:{fontSize:10,color:C.textDim}},"Entrega: "+ped.fechaEntrega),
                        alertaDias&&e("span",{style:{fontSize:10,fontWeight:600,color:"#EF4444",background:"#FEF2F2",border:"1px solid #FCA5A5",borderRadius:20,padding:"1px 7px"}},diasPreparando+"d preparando")
                      )
                    ),
                    // Estado — discreto
                    e("select",{
                      value:ped.estadoPedido,
                      onChange:function(ev){
                        var nuevoEstado=ev.target.value;
                        if(nuevoEstado==="cancelado"){ setCancelarPedidoId(ped.id); return; }
                        actualizarPedido(ped.id,{estadoPedido:nuevoEstado});
                        if(nuevoEstado==="entregado"){
                          var cl2=clientes.find(function(c){ return c.id===ped.clienteId; });
                          setCelebEntregadoData({pedidoId:ped.id,clienteNombre:cl2?cl2.nombre:"Cliente",producto:ped.productos||"",precio:ped.total||0,clienteId:ped.clienteId});
                          setCelebPaso(1); setCelebRazon([]); setCelebRecontacto("30");
                        }
                      },
                      style:{fontSize:10,padding:"4px 4px",borderRadius:8,border:"1px solid "+C.border,background:C.surfaceUp,color:C.textMuted,cursor:"pointer",outline:"none",flexShrink:0,maxWidth:isMobile?90:120}
                    },
                      ESTADOS_PEDIDO.map(function(x){ return e("option",{key:x.k,value:x.k},x.label); })
                    )
                  ),

                  // FILA 2: resumen financiero — 3 columnas con divisores
                  totalPedido>0&&e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",borderRadius:10,background:C.surfaceUp,marginBottom:8,overflow:"hidden"}},
                    e("div",{style:{padding:"7px 10px",textAlign:"center",borderRight:"1px solid "+C.border}},
                      e("div",{style:{fontSize:9,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.3px",marginBottom:2}},"Total"),
                      e("div",{style:{fontSize:13,fontWeight:700,color:C.text}},"$"+totalPedido.toLocaleString())
                    ),
                    e("div",{style:{padding:"7px 10px",textAlign:"center",borderRight:"1px solid "+C.border}},
                      e("div",{style:{fontSize:9,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.3px",marginBottom:2}},"Pagado"),
                      e("div",{style:{fontSize:13,fontWeight:700,color:C.green}},"$"+totalPagado.toLocaleString())
                    ),
                    e("div",{style:{padding:"7px 10px",textAlign:"center"}},
                      e("div",{style:{fontSize:9,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.3px",marginBottom:2}},"Restante"),
                      e("div",{style:{fontSize:13,fontWeight:700,color:restante>0?C.amber:C.green}},"$"+restante.toLocaleString())
                    )
                  ),

                  // HINT CLEO
                  !esCancelado&&!esEntregado&&(function(){
                    var txt=restante>0&&totalPedido>0?"💡 Cobra el saldo antes de entregar":
                             ep.k==="sin_pago"&&totalPedido>0?"💡 Aún no hay pago registrado":null;
                    if(!txt) return null;
                    return e("div",{style:{fontSize:11,color:C.textDim,marginBottom:6}},txt);
                  })(),

                  // FILA 3: acciones
                  !esCancelado&&e("div",{style:{borderTop:"1px solid "+C.border+"44",paddingTop:8,display:"flex",flexDirection:isMobile?"column":"row",gap:8,alignItems:isMobile?"stretch":"center"}},
                    // Secundarias — fila
                    e("div",{style:{display:"flex",gap:6}},
                      cl&&e(BtnCanal,{cliente:cl,small:true}),
                      e("button",{
                        style:{cursor:"pointer",padding:"6px 10px",borderRadius:8,border:"1px solid "+C.border+"88",background:"transparent",fontSize:11,color:C.textDim,whiteSpace:"nowrap"},
                        onClick:function(){
                          var cotExistente=cotizaciones.find(function(cot){ return String(cot.clienteId)===String(ped.clienteId); });
                          if(cotExistente){ editarCot(cotExistente); }
                          else { setFormCot(Object.assign({},cotVacio,{clienteId:String(ped.clienteId),clienteNombre:cl?cl.nombre:"",concepto:ped.productos||"",precioUnit:String(ped.total||""),monto:String(ped.total||"")})); setModalCot(true); }
                        }
                      },"Cotización"),
                      e("button",{
                        style:{cursor:"pointer",padding:"6px 10px",borderRadius:8,border:"1px solid "+C.border+"88",background:"transparent",fontSize:11,color:C.textDim,whiteSpace:"nowrap"},
                        onClick:function(){
                          setFormPagoPedidoModal({monto:"",fecha:FECHA_HOY,concepto:pagosArr.length===0?"Anticipo":"Pago"});
                          setPedidoPagosId(ped.id);
                        }
                      },pagosArr.length>0?"Pagos ("+pagosArr.length+")":"Ver pagos")
                    ),
                    !isMobile&&e("div",{style:{flex:1}}),
                    // Acción principal — full width en móvil, a la derecha en desktop
                    restante>0&&totalPedido>0&&e("button",{
                      style:{cursor:"pointer",padding:"8px 20px",borderRadius:10,border:"none",background:C.purple,fontSize:12,color:"#fff",fontWeight:600,width:isMobile?"100%":"auto"},
                      onClick:function(){
                        setFormPagoPedidoModal({monto:String(restante),fecha:FECHA_HOY,concepto:"Pago final"});
                        setPedidoPagosId(ped.id);
                      }
                    },isMobile?"Registrar pago · $"+restante.toLocaleString()+" pendiente":"Registrar pago"),
                    !esEntregado&&(restante<=0||totalPedido===0)&&e("button",{
                      style:{cursor:"pointer",padding:"8px 20px",borderRadius:10,border:"none",background:C.green,fontSize:12,color:"#fff",fontWeight:600,width:isMobile?"100%":"auto"},
                      onClick:function(){
                        actualizarPedido(ped.id,{estadoPedido:"entregado"});
                        var cl2=clientes.find(function(c){ return c.id===ped.clienteId; });
                        setCelebEntregadoData({pedidoId:ped.id,clienteNombre:cl2?cl2.nombre:"Cliente",producto:ped.productos||"",precio:ped.total||0,clienteId:ped.clienteId});
                        setCelebPaso(1); setCelebRazon([]); setCelebRecontacto("30");
                      }
                    },"Marcar entregado")
                  ),

                );
              })
            ),

          // MODAL CANCELAR PEDIDO — motivo
          cancelarPedidoId&&(function(){
            var ped=pedidosNorm.find(function(p){ return p.id===cancelarPedidoId; });
            if(!ped) return null;
            var cl=clientes.find(function(c){ return c.id===ped.clienteId; });
            var MOTIVOS_CANCEL=[
              {key:"No llegó a tiempo",   lado:"negocio", icono:"⏱️", label:"No llegó a tiempo / producción"},
              {key:"Producto defectuoso", lado:"negocio", icono:"⚠️", label:"Producto defectuoso o error"},
              {key:"No conseguí insumo",  lado:"negocio", icono:"📦", label:"No conseguí el insumo/material"},
              {key:"Cliente se arrepintió",lado:"cliente", icono:"🙅", label:"Cliente se arrepintió"},
              {key:"Dejó de responder",   lado:"cliente", icono:"💬", label:"Dejó de responder / no pagó"},
              {key:"Otro",                lado:"otro",    icono:"📝", label:"Otro motivo"},
            ];
            var motivoSel=motivoCancelPedido;
            function cerrarCancelModal(){ setCancelarPedidoId(null); setMotivoCancelPedido(""); setMotivoCancelLibre(""); }
            return e("div",{style:st.ov,onClick:cerrarCancelModal},
              e("div",{style:Object.assign({},st.modal,{maxWidth:isMobile?"100%":420}),onClick:function(ev){ ev.stopPropagation(); }},
                e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}},
                  e("div",null,
                    e("div",{style:{fontWeight:700,fontSize:18,color:C.text,marginBottom:4}},"¿Por qué se canceló?"),
                    e("div",{style:{fontSize:12,color:C.textMuted}},"Esto te ayuda a detectar patrones en tu negocio.")
                  ),
                  e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:20,lineHeight:1,padding:"0 4px"},onClick:cerrarCancelModal},"×")
                ),
                e("div",{style:{marginBottom:16,padding:"10px 14px",background:C.surfaceUp,borderRadius:10,border:"1px solid "+C.border}},
                  e("div",{style:{fontWeight:600,color:C.text,fontSize:13}},cl?cl.nombre:"--"),
                  e("div",{style:{fontSize:12,color:C.textMuted,marginTop:2}},(ped.productos||"Pedido")+" · $"+Number(ped.total||0).toLocaleString())
                ),
                e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px",marginBottom:8}},"Por parte del negocio"),
                e("div",{style:{display:"flex",flexDirection:"column",gap:6,marginBottom:14}},
                  MOTIVOS_CANCEL.filter(function(m){ return m.lado==="negocio"; }).map(function(m){
                    var sel=motivoSel===m.key;
                    return e("button",{key:m.key,style:{cursor:"pointer",padding:"11px 14px",borderRadius:12,textAlign:"left",background:sel?"#EEF2FF":"transparent",border:"1px solid "+(sel?"#5B5CF6":C.border),display:"flex",alignItems:"center",gap:12},onClick:function(){ setMotivoCancelPedido(m.key); }},
                      e("span",{style:{fontSize:18,flexShrink:0,width:24,textAlign:"center"}},m.icono),
                      e("span",{style:{fontSize:13,fontWeight:sel?600:400,color:sel?"#5B5CF6":C.text}},m.label)
                    );
                  })
                ),
                e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px",marginBottom:8}},"Por parte del cliente"),
                e("div",{style:{display:"flex",flexDirection:"column",gap:6,marginBottom:14}},
                  MOTIVOS_CANCEL.filter(function(m){ return m.lado==="cliente"; }).map(function(m){
                    var sel=motivoSel===m.key;
                    return e("button",{key:m.key,style:{cursor:"pointer",padding:"11px 14px",borderRadius:12,textAlign:"left",background:sel?"#EEF2FF":"transparent",border:"1px solid "+(sel?"#5B5CF6":C.border),display:"flex",alignItems:"center",gap:12},onClick:function(){ setMotivoCancelPedido(m.key); }},
                      e("span",{style:{fontSize:18,flexShrink:0,width:24,textAlign:"center"}},m.icono),
                      e("span",{style:{fontSize:13,fontWeight:sel?600:400,color:sel?"#5B5CF6":C.text}},m.label)
                    );
                  })
                ),
                MOTIVOS_CANCEL.filter(function(m){ return m.lado==="otro"; }).map(function(m){
                  var sel=motivoSel===m.key;
                  return e("button",{key:m.key,style:{cursor:"pointer",padding:"11px 14px",borderRadius:12,textAlign:"left",background:sel?"#EEF2FF":"transparent",border:"1px solid "+(sel?"#5B5CF6":C.border),display:"flex",alignItems:"center",gap:12,width:"100%",marginBottom:8},onClick:function(){ setMotivoCancelPedido(m.key); }},
                    e("span",{style:{fontSize:18,flexShrink:0,width:24,textAlign:"center"}},m.icono),
                    e("span",{style:{fontSize:13,fontWeight:sel?600:400,color:sel?"#5B5CF6":C.text}},m.label)
                  );
                }),
                motivoSel==="Otro"&&e("input",{value:motivoCancelLibre,onChange:function(ev){ setMotivoCancelLibre(ev.target.value); },placeholder:"¿Qué pasó exactamente?",style:Object.assign({},st.inp,{marginBottom:14}),autoFocus:true}),
                e("button",{
                  style:{cursor:"pointer",padding:"11px",borderRadius:14,border:"none",background:motivoSel?"#5B5CF6":C.border,fontSize:13,color:"#fff",fontWeight:600,width:"100%"},
                  disabled:!motivoSel,
                  onClick:function(){
                    if(!motivoSel) return;
                    var motivoFinal=motivoSel==="Otro"?(motivoCancelLibre||"Otro"):motivoSel;
                    var motivoCat=(MOTIVOS_CANCEL.find(function(m){ return m.key===motivoSel; })||{}).lado||"otro";
                    actualizarPedido(cancelarPedidoId,{estadoPedido:"cancelado",motivoCancelacion:motivoFinal,motivoCancelacionLado:motivoCat});
                    cerrarCancelModal();
                    if(cl&&!cl.origen) setOrigenPromptId(cl.id);
                  }
                },"Confirmar cancelación")
              )
            );
          })(),

          // MODAL PAGOS PEDIDO
          pedidoPagosId&&(function(){
            var ped=pedidosNorm.find(function(p){ return p.id===pedidoPagosId; });
            if(!ped) return null;
            var cl=clientes.find(function(c){ return c.id===ped.clienteId; });
            var pagosArr=ped.pagos||[];
            var totalPagado=pagosArr.reduce(function(s,p){ return s+Number(p.monto); },0);
            var totalPedido=Number(ped.total)||0;
            var saldoReal=Math.max(0,totalPedido-totalPagado);
            var pc=C.purple;

            return e("div",{style:st.ov,onClick:function(){ setPedidoPagosId(null); }},
              e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",overflowY:"auto"}),onClick:function(ev){ ev.stopPropagation(); }},

                // HEADER
                e("div",{style:{padding:"20px 24px 16px",borderBottom:"1px solid "+C.border,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}},
                  e("div",null,
                    e("div",{style:{fontWeight:700,fontSize:16,color:C.text,marginBottom:3}},"Registrar pago"),
                    e("div",{style:{fontSize:12,color:C.textMuted}},(cl?cl.nombre:"--")+" · "+(ped.productos||"")+(totalPedido>0?" · $"+totalPedido.toLocaleString():""))
                  ),
                  e("button",{style:{background:"transparent",border:"1px solid "+C.border,cursor:"pointer",color:C.textDim,fontSize:16,width:28,height:28,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"},onClick:function(){ setPedidoPagosId(null); }},"×")
                ),

                // BODY
                e("div",{style:{padding:"20px 24px",overflowY:"auto",maxHeight:"65vh"}},

                  // Pagos existentes
                  pagosArr.length>0&&e("div",{style:{marginBottom:20}},
                    e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px",marginBottom:10}},"Pagos registrados"),
                    e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
                      pagosArr.map(function(pago){
                        return e("div",{key:pago.id,style:{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:C.surfaceUp,borderRadius:10,border:"1px solid "+C.border}},
                          e("div",{style:{flex:1}},
                            e("div",{style:{fontSize:13,fontWeight:600,color:C.text}},pago.concepto||"Pago"),
                            e("div",{style:{fontSize:11,color:C.textDim,marginTop:1}},pago.fecha)
                          ),
                          e("div",{style:{fontSize:14,fontWeight:700,color:C.green,marginRight:6}},"$"+Number(pago.monto).toLocaleString()),
                          e("button",{style:{cursor:"pointer",padding:"4px 10px",borderRadius:8,border:"1px solid "+C.border,background:"transparent",fontSize:11,color:C.amber,fontWeight:500},
                            onClick:function(){ generarComprobantePago(pago,{id:ped.id,concepto:ped.productos||"Pedido",monto:totalPedido,pagos:pagosArr},cl||{nombre:"Cliente"},perfil); }
                          },"Comprobante"),
                          e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:16,padding:"2px 6px"},
                            onClick:function(){
                              var nuevosPagos=pagosArr.filter(function(p){ return p.id!==pago.id; });
                              actualizarPedido(ped.id,{pagos:nuevosPagos});
                            }
                          },"×")
                        );
                      })
                    ),
                    e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderRadius:10,background:saldoReal<=0?"#F0FDF4":C.amberBg||"#FFFBEB",border:"1px solid "+(saldoReal<=0?"#86EFAC":"#FCD34D"),marginTop:10}},
                      e("span",{style:{fontSize:13,color:saldoReal<=0?"#166534":C.amber,fontWeight:500}},"Saldo pendiente"),
                      e("span",{style:{fontSize:16,fontWeight:700,color:saldoReal<=0?C.green:C.amber}},"$"+saldoReal.toLocaleString())
                    ),
                    e("button",{style:{cursor:"pointer",marginTop:10,padding:"8px 14px",borderRadius:10,border:"1px solid "+C.amberBorder,background:"transparent",fontSize:12,color:C.amber,fontWeight:500,width:"100%"},
                      onClick:function(){ generarComprobanteGeneral({id:ped.id,concepto:ped.productos||"Pedido",monto:totalPedido,pagos:pagosArr},cl||{nombre:"Cliente"},perfil); }
                    },"Ver comprobante general (estado de cuenta)")
                  ),

                  // Formulario nuevo pago
                  saldoReal>0&&e("div",null,
                    pagosArr.length>0&&e("div",{style:{height:1,background:C.border,marginBottom:20}}),
                    e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px",marginBottom:12}},"Agregar pago"),
                    e("div",{style:{marginBottom:14}},
                      e("label",{style:st.lbl},"Tipo de pago"),
                      e("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}},
                        ["Anticipo","Segundo pago","Pago final","Otro"].map(function(tipo){
                          var activo=formPagoPedidoModal.concepto===tipo;
                          return e("button",{key:tipo,
                            style:{cursor:"pointer",padding:"7px 14px",borderRadius:10,border:"1.5px solid "+(activo?pc:C.border),background:activo?pc:"transparent",fontSize:12,color:activo?"#fff":C.textMuted,fontWeight:activo?600:400},
                            onClick:function(){
                              var nuevoMonto=formPagoPedidoModal.monto;
                              if(tipo==="Pago final") nuevoMonto=String(saldoReal);
                              setFormPagoPedidoModal(Object.assign({},formPagoPedidoModal,{concepto:tipo,monto:nuevoMonto}));
                            }
                          },tipo);
                        })
                      )
                    ),
                    e("div",{style:{display:"flex",gap:10,flexWrap:"wrap"}},
                      e("div",{style:{flex:"1 1 120px"}},
                        e("label",{style:st.lbl},"Monto"),
                        e("input",{type:"number",placeholder:"0",value:formPagoPedidoModal.monto,onChange:function(ev){ setFormPagoPedidoModal(Object.assign({},formPagoPedidoModal,{monto:ev.target.value})); },style:Object.assign({},st.inp,{width:"100%"})})
                      ),
                      e("div",{style:{flex:"1 1 140px"}},
                        e("label",{style:st.lbl},"Fecha"),
                        e("input",{type:"date",value:formPagoPedidoModal.fecha,onChange:function(ev){ setFormPagoPedidoModal(Object.assign({},formPagoPedidoModal,{fecha:ev.target.value})); },style:Object.assign({},st.inp,{width:"100%",maxWidth:"100%",boxSizing:"border-box",display:"block",minWidth:0,WebkitAppearance:"none"})})
                      )
                    )
                  ),

                  // Pagado completo
                  saldoReal<=0&&pagosArr.length>0&&e("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"14px 16px",background:"#F0FDF4",borderRadius:12,border:"1px solid #86EFAC"}},
                    e("span",{style:{fontSize:20}},"✅"),
                    e("div",{style:{fontSize:13,fontWeight:700,color:"#166534"}},"Pagado completamente")
                  )
                ),

                // FOOTER
                e("div",{style:{padding:"14px 24px",borderTop:"1px solid "+C.border,display:"flex",justifyContent:"flex-end",gap:8,background:C.surfaceUp}},
                  e("button",{style:st.btn,onClick:function(){ setPedidoPagosId(null); }},"Cerrar"),
                  saldoReal>0&&e("button",{
                    style:Object.assign({},st.btnP,{opacity:!formPagoPedidoModal.monto||Number(formPagoPedidoModal.monto)<=0?0.4:1}),
                    disabled:!formPagoPedidoModal.monto||Number(formPagoPedidoModal.monto)<=0,
                    onClick:function(){
                      var nuevoPago={id:"pp_"+Date.now(),monto:Number(formPagoPedidoModal.monto),fecha:formPagoPedidoModal.fecha,concepto:formPagoPedidoModal.concepto};
                      actualizarPedido(ped.id,{pagos:[...pagosArr,nuevoPago]});
                      setFormPagoPedidoModal({monto:"",fecha:FECHA_HOY,concepto:"Pago"});
                    }
                  },"+ Guardar pago")
                )
              )
            );
          })(),

          // MODAL NUEVO PEDIDO
          nuevoPedidoModal&&e("div",{style:Object.assign({},st.ov,{overflow:"hidden"}),onClick:function(){ setNuevoPedidoModal(false); setBuscaCliPed(""); }},
            e("div",{style:{background:C.surface,borderRadius:isMobile?"20px 20px 0 0":"20px",width:isMobile?"100%":500,maxWidth:"100%",maxHeight:isMobile?"94vh":"88vh",border:isMobile?"none":"1px solid "+C.border,boxShadow:"0 8px 32px rgba(0,0,0,0.14)",display:"flex",flexDirection:"column",overflow:"hidden",margin:isMobile?0:"auto"},onClick:function(ev){ ev.stopPropagation(); }},

              // HEADER
              e("div",{style:{padding:"20px 24px 16px",background:"linear-gradient(135deg,#ECFDF5 0%,transparent 70%)",borderBottom:"1px solid "+C.border,flexShrink:0,display:"flex",alignItems:"flex-start",justifyContent:"space-between"}},
                e("div",null,
                  e("div",{style:{fontWeight:700,fontSize:18,color:C.text}},"Nuevo pedido"),
                  e("div",{style:{fontSize:12,color:C.textMuted,marginTop:2}},"Compra confirmada, sin pasar por oportunidad")
                ),
                e("button",{style:{background:C.surfaceUp,border:"1px solid "+C.border,borderRadius:10,cursor:"pointer",color:C.textMuted,fontSize:16,lineHeight:1,padding:"6px 10px"},onClick:function(){ setNuevoPedidoModal(false); setBuscaCliPed(""); }},"×")
              ),

              // BODY
              e("div",{style:{padding:isMobile?"16px 20px":"20px 24px",overflowY:"auto",flex:1,display:"flex",flexDirection:"column",gap:16}},

                // CLIENTE
                e("div",{style:{position:"relative"}},
                  e("label",{style:st.lbl},"Cliente"),
                  e("div",{style:{display:"flex",gap:6}},
                    e("input",{
                      placeholder:nuevoPedidoForm.clienteId?(clientes.find(function(c){ return String(c.id)===String(nuevoPedidoForm.clienteId); })||{}).nombre||"":"Buscar o escribir nombre...",
                      value:buscaCliPed,
                      onChange:function(ev){ setBuscaCliPed(ev.target.value); setNuevoPedidoForm(Object.assign({},nuevoPedidoForm,{clienteId:"",nuevoNombre:ev.target.value})); },
                      style:Object.assign({},st.inp,{flex:1})
                    }),
                    e("button",{style:{cursor:"pointer",padding:"0 12px",borderRadius:10,border:"1px solid "+C.border,background:"transparent",fontSize:13,color:C.textMuted},onClick:function(){ setBuscaCliPed(buscaCliPed==="*"?"":"*"); }},"☰")
                  ),
                  buscaCliPed.length>0&&e("div",{style:{position:"absolute",top:"100%",left:0,right:0,background:C.surface,border:"1px solid "+C.border,borderRadius:10,zIndex:50,maxHeight:160,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.1)"}},
                    (function(){
                      var filtrados=clientes.filter(function(c){ return buscaCliPed==="*"||c.nombre.toLowerCase().includes(buscaCliPed.toLowerCase()); });
                      return e("div",null,
                        filtrados.map(function(c){
                          return e("div",{key:c.id,style:{padding:"10px 14px",cursor:"pointer",fontSize:13,color:C.text,borderBottom:"0.5px solid "+C.border},
                            onMouseDown:function(ev){ ev.preventDefault(); setNuevoPedidoForm(Object.assign({},nuevoPedidoForm,{clienteId:String(c.id),nuevoNombre:""})); setBuscaCliPed(""); }
                          },e("div",{style:{fontWeight:500}},c.nombre));
                        }),
                        buscaCliPed!=="*"&&buscaCliPed.trim().length>1&&e("div",{
                          style:{padding:"10px 14px",cursor:"pointer",fontSize:13,color:C.purple,fontWeight:600,borderTop:filtrados.length>0?"1px solid "+C.border:"none"},
                          onMouseDown:function(ev){ ev.preventDefault(); setNuevoPedidoForm(Object.assign({},nuevoPedidoForm,{clienteId:"",nuevoNombre:buscaCliPed.trim()})); setBuscaCliPed(""); }
                        },"＋ Agregar \""+buscaCliPed.trim()+"\" como nuevo cliente")
                      );
                    })()
                  ),
                  nuevoPedidoForm.clienteId&&!buscaCliPed&&(function(){
                    var cl=clientes.find(function(c){ return String(c.id)===String(nuevoPedidoForm.clienteId); });
                    if(!cl) return null;
                    return e("div",{style:{marginTop:6,padding:"8px 12px",background:"#ECFDF5",borderRadius:8,fontSize:13,color:"#10B981",display:"flex",justifyContent:"space-between",alignItems:"center"}},
                      e("div",{style:{fontWeight:600}},cl.nombre),
                      e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:16},onClick:function(){ setNuevoPedidoForm(Object.assign({},nuevoPedidoForm,{clienteId:"",nuevoNombre:""})); }},"×")
                    );
                  })(),
                  !nuevoPedidoForm.clienteId&&nuevoPedidoForm.nuevoNombre&&!buscaCliPed&&e("div",{style:{marginTop:6,padding:"8px 12px",background:"#ECFDF5",borderRadius:8,fontSize:13,color:"#10B981",display:"flex",justifyContent:"space-between",alignItems:"center"}},
                    e("span",null,"＋ Nuevo: ",e("b",null,nuevoPedidoForm.nuevoNombre)),
                    e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:16},onClick:function(){ setNuevoPedidoForm(Object.assign({},nuevoPedidoForm,{nuevoNombre:""})); }},"×")
                  ),
                  !nuevoPedidoForm.clienteId&&nuevoPedidoForm.nuevoNombre&&!buscaCliPed&&e("div",null,
                    e("div",{style:{marginTop:10}},
                      e("label",{style:st.lbl},"¿Cómo llegó a ti?"),
                      e("div",{style:{display:"flex",flexWrap:"wrap",gap:6}},
                        ["Instagram","Facebook","WhatsApp","Referido","TikTok","Otro"].map(function(org){
                          var activo=nuevoPedidoForm.nuevoOrigen===org;
                          return e("button",{key:org,type:"button",
                            style:{cursor:"pointer",padding:"6px 12px",borderRadius:20,border:"1px solid "+(activo?C.purple:C.border),background:activo?C.purple:"transparent",fontSize:12,color:activo?"#fff":C.textMuted,fontWeight:activo?600:400},
                            onClick:function(){ setNuevoPedidoForm(Object.assign({},nuevoPedidoForm,{nuevoOrigen:org})); }
                          },org);
                        })
                      )
                    ),
                    e("div",{style:{marginTop:10}},
                      e("label",{style:Object.assign({},st.lbl,{display:"flex",alignItems:"center",gap:4})},
                        "¿Dónde lo contactas?",
                        e("span",{style:{fontSize:10,color:C.amber,fontWeight:600}},"obligatorio")
                      ),
                      e("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:nuevoPedidoForm.nuevoCanal?8:0}},
                        ["WhatsApp","Instagram","Facebook"].map(function(canal){
                          var activo=nuevoPedidoForm.nuevoCanal===canal;
                          return e("button",{key:canal,type:"button",
                            style:{cursor:"pointer",padding:"7px 14px",borderRadius:20,border:"1.5px solid "+(activo?C.purple:C.border),background:activo?C.purple:"transparent",fontSize:12,color:activo?"#fff":C.textMuted,fontWeight:activo?600:400},
                            onClick:function(){ setNuevoPedidoForm(Object.assign({},nuevoPedidoForm,{nuevoCanal:canal,nuevoContacto:""})); }
                          },canal);
                        })
                      ),
                      nuevoPedidoForm.nuevoCanal&&e("input",{
                        placeholder:nuevoPedidoForm.nuevoCanal==="WhatsApp"?"Número de WhatsApp (10 dígitos)":nuevoPedidoForm.nuevoCanal==="Instagram"?"Usuario de Instagram (@...)":"Usuario de Facebook",
                        value:nuevoPedidoForm.nuevoContacto||"",
                        onChange:function(ev){
                          var v=nuevoPedidoForm.nuevoCanal==="WhatsApp"?ev.target.value.replace(/\D/g,"").slice(0,10):ev.target.value;
                          setNuevoPedidoForm(Object.assign({},nuevoPedidoForm,{nuevoContacto:v}));
                        },
                        type:nuevoPedidoForm.nuevoCanal==="WhatsApp"?"tel":"text",
                        maxLength:nuevoPedidoForm.nuevoCanal==="WhatsApp"?10:undefined,
                        inputMode:nuevoPedidoForm.nuevoCanal==="WhatsApp"?"numeric":undefined,
                        style:st.inp
                      }),
                      nuevoPedidoForm.nuevoCanal==="WhatsApp"&&nuevoPedidoForm.nuevoContacto&&nuevoPedidoForm.nuevoContacto.length>0&&nuevoPedidoForm.nuevoContacto.length<10&&e("div",{style:{fontSize:11,color:"#E53E3E",marginTop:4}},"Faltan "+(10-nuevoPedidoForm.nuevoContacto.length)+" dígitos")
                    )
                  )
                ),

                // PRODUCTO del catálogo
                e("div",null,
                  e("label",{style:st.lbl},"Producto"),
                  (function(){
                    var seleccionado=catActivo.find(function(x){ return x.nombre===nuevoPedidoForm.productos; });
                    return e("div",null,
                      catActivo.length>0&&e("select",{
                        value:seleccionado?nuevoPedidoForm.productos:"",
                        onChange:function(ev){
                          var val=ev.target.value;
                          var match=catActivo.find(function(x){ return x.nombre===val; });
                          setNuevoPedidoForm(Object.assign({},nuevoPedidoForm,{
                            productos:val,
                            total:match&&match.precio?String(match.precio):nuevoPedidoForm.total
                          }));
                        },
                        style:Object.assign({},st.inp,{marginBottom:seleccionado?0:6})
                      },
                        e("option",{value:""},"— Seleccionar del catálogo —"),
                        catActivo.map(function(p){ return e("option",{key:p.id,value:p.nombre},p.nombre+(p.precio?" · $"+Number(p.precio).toLocaleString():"")); })
                      ),
                      !seleccionado&&e("input",{
                        placeholder:"o escribe el producto...",
                        value:nuevoPedidoForm.productos||"",
                        onChange:function(ev){ setNuevoPedidoForm(Object.assign({},nuevoPedidoForm,{productos:ev.target.value})); },
                        style:st.inp
                      })
                    );
                  })()
                ),

                // CANTIDAD + TOTAL
                e("div",{style:{display:"flex",gap:10}},
                  e("div",{style:{flex:1}},
                    e("label",{style:st.lbl},"Cantidad"),
                    e("input",{type:"number",min:"1",value:nuevoPedidoForm.cantidad||1,onChange:function(ev){ setNuevoPedidoForm(Object.assign({},nuevoPedidoForm,{cantidad:ev.target.value})); },style:st.inp})
                  ),
                  e("div",{style:{flex:1}},
                    e("label",{style:st.lbl},"Total ($)"),
                    e("input",{type:"number",placeholder:"0",value:nuevoPedidoForm.total||"",onChange:function(ev){ setNuevoPedidoForm(Object.assign({},nuevoPedidoForm,{total:ev.target.value})); },style:st.inp})
                  )
                ),

                // ANTICIPO
                e("div",null,
                  e("label",{style:st.lbl},"¿Ya dio anticipo?"),
                  e("input",{type:"number",placeholder:"$0 (dejar vacío si no)",value:nuevoPedidoForm.anticipo||"",onChange:function(ev){ setNuevoPedidoForm(Object.assign({},nuevoPedidoForm,{anticipo:ev.target.value})); },style:st.inp})
                ),

                // FECHA DE ENTREGA
                e("div",null,
                  e("label",{style:st.lbl},"Fecha de entrega (opcional)"),
                  e("input",{type:"date",value:nuevoPedidoForm.fechaEntrega||"",onChange:function(ev){ setNuevoPedidoForm(Object.assign({},nuevoPedidoForm,{fechaEntrega:ev.target.value})); },style:Object.assign({},st.inp,{width:"100%",maxWidth:"100%",boxSizing:"border-box",display:"block",minWidth:0,WebkitAppearance:"none"})})
                ),

                // NOTAS
                e("div",null,
                  e("label",{style:st.lbl},"Notas (opcional)"),
                  e("textarea",{placeholder:"ej. Color específico, instrucciones, detalles...",value:nuevoPedidoForm.notas||"",onChange:function(ev){ setNuevoPedidoForm(Object.assign({},nuevoPedidoForm,{notas:ev.target.value})); },style:Object.assign({},st.inp,{minHeight:60,resize:"vertical"})})
                )
              ),

              // FOOTER
              e("div",{style:{padding:"14px 24px",borderTop:"1px solid "+C.border,display:"flex",gap:8,justifyContent:"flex-end",background:C.surfaceUp,flexShrink:0}},
                e("button",{style:st.btn,onClick:function(){ setNuevoPedidoModal(false); setBuscaCliPed(""); }},"Cancelar"),
                e("button",{
                  style:Object.assign({},st.btnP,{opacity:(nuevoPedidoForm.clienteId||nuevoPedidoForm.nuevoNombre)&&!(!nuevoPedidoForm.clienteId&&nuevoPedidoForm.nuevoNombre&&(!nuevoPedidoForm.nuevoCanal||!nuevoPedidoForm.nuevoContacto||!nuevoPedidoForm.nuevoContacto.trim()))?1:0.5}),
                  disabled:!nuevoPedidoForm.clienteId&&!nuevoPedidoForm.nuevoNombre,
                  onClick:function(){
                    var fp=nuevoPedidoForm;
                    if(!fp.clienteId&&fp.nuevoNombre&&(!fp.nuevoCanal||!fp.nuevoContacto||!fp.nuevoContacto.trim())){
                      alert("Selecciona por dónde contactas a este cliente antes de guardar.");
                      return;
                    }
                    if(!fp.clienteId&&fp.nuevoNombre&&fp.nuevoCanal==="WhatsApp"&&fp.nuevoContacto.replace(/\D/g,"").length!==10){
                      alert("El número de WhatsApp debe tener exactamente 10 dígitos.");
                      return;
                    }
                    var clienteIdFinal=fp.clienteId?Number(fp.clienteId):null;
                    // Crear cliente nuevo si no existe
                    if(!fp.clienteId&&fp.nuevoNombre){
                      clienteIdFinal=Date.now();
                      var canalPed=fp.nuevoCanal||"WhatsApp";
                      setClientes([Object.assign({},formVacio,{
                        id:clienteIdFinal,
                        nombre:fp.nuevoNombre.trim(),
                        fecha:FECHA_HOY,
                        etapa:"Ganado",
                        ultimoContacto:FECHA_HOY,
                        origen:fp.nuevoOrigen||"",
                        canalPrincipal:canalPed,
                        contacto:canalPed==="WhatsApp"?(fp.nuevoContacto||"").replace(/\D/g,""):"",
                        instagram:canalPed==="Instagram"?(fp.nuevoContacto||""):"",
                        messenger:canalPed==="Facebook"?(fp.nuevoContacto||""):""
                      }),...clientes]);
                    }
                    // Crear pedido
                    var pagosIniciales=[];
                    if(fp.anticipo&&Number(fp.anticipo)>0){
                      pagosIniciales=[{id:"pa_"+Date.now(),monto:Number(fp.anticipo),fecha:FECHA_HOY,concepto:"Anticipo"}];
                    }
                    var nuevoPed={
                      id:"ped_"+Date.now(),
                      clienteId:clienteIdFinal,
                      productos:fp.productos||"",
                      cantidad:Number(fp.cantidad)||1,
                      total:Number(fp.total)||0,
                      pagos:pagosIniciales,
                      estadoPedido:"preparando",
                      notas:fp.notas||"",
                      fechaEntrega:fp.fechaEntrega||"",
                      fecha:FECHA_HOY,
                      fechaCreado:new Date().toISOString(),
                    };
                    setPedidos([nuevoPed,...pedidos]);
                    setNuevoPedidoModal(false); setBuscaCliPed("");
                    setCelebPedidoData({clienteNombre:fp.nuevoNombre||(clientes.find(function(c){ return String(c.id)===String(fp.clienteId); })||{}).nombre||"Cliente",producto:fp.productos||"",precio:fp.total||0,clienteId:clienteIdFinal});
                    setCelebPaso(1); setCelebRazon([]);
                  }
                },"Guardar pedido")
              )
            )
          ),

          // MODAL EDITAR PEDIDO
          pedidoEditando&&e("div",{style:st.ov,onClick:function(){ setPedidoEditando(null); }},
            e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",maxWidth:440}),onClick:function(ev){ ev.stopPropagation(); }},
              e("div",{style:{padding:"20px 24px 16px",borderBottom:"1px solid "+C.border,display:"flex",justifyContent:"space-between",alignItems:"center"}},
                e("div",{style:{fontWeight:700,fontSize:16,color:C.text}},"Editar pedido"),
                e("button",{style:{background:"transparent",border:"1px solid "+C.border,cursor:"pointer",color:C.textDim,fontSize:16,width:28,height:28,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"},onClick:function(){ setPedidoEditando(null); }},"×")
              ),
              e("div",{style:{padding:"20px 24px",display:"flex",flexDirection:"column",gap:14}},
                e("div",null,
                  e("label",{style:st.lbl},"Productos / descripción"),
                  e("input",{value:pedidoEditando.productos,onChange:function(ev){ setPedidoEditando(Object.assign({},pedidoEditando,{productos:ev.target.value})); },style:st.inp})
                ),
                e("div",null,
                  e("label",{style:st.lbl},"Cantidad"),
                  e("input",{type:"number",min:"1",value:pedidoEditando.cantidad,onChange:function(ev){ setPedidoEditando(Object.assign({},pedidoEditando,{cantidad:ev.target.value})); },style:st.inp})
                ),
                e("div",null,
                  e("label",{style:st.lbl},"Total del pedido ($)"),
                  e("input",{type:"number",placeholder:"0",value:pedidoEditando.total,onChange:function(ev){ setPedidoEditando(Object.assign({},pedidoEditando,{total:ev.target.value})); },style:st.inp})
                ),
                e("div",null,
                  e("label",{style:st.lbl},"Notas"),
                  e("textarea",{value:pedidoEditando.notas||"",onChange:function(ev){ setPedidoEditando(Object.assign({},pedidoEditando,{notas:ev.target.value})); },style:Object.assign({},st.inp,{minHeight:60,resize:"vertical"})})
                )
              ),
              e("div",{style:{padding:"14px 24px",borderTop:"1px solid "+C.border,display:"flex",gap:8,justifyContent:"flex-end",background:C.surfaceUp}},
                e("button",{style:st.btn,onClick:function(){ setPedidoEditando(null); }},"Cancelar"),
                e("button",{style:st.btnP,onClick:function(){
                  actualizarPedido(pedidoEditando.id,{
                    productos:pedidoEditando.productos,
                    cantidad:Number(pedidoEditando.cantidad)||1,
                    total:Number(pedidoEditando.total)||0,
                    notas:pedidoEditando.notas,
                  });
                  setPedidoEditando(null);
                }},"Guardar cambios")
              )
            )
          )
        );
      })(),

      // COTIZACIONES
      vista==="cotizaciones"&&e("div",{style:{display:"flex",flexDirection:"column",gap:0}},
        e("div",{style:{display:"flex",alignItems:"center",justifyContent:isMobile?"space-between":"flex-end",gap:isMobile?6:8,marginLeft:isMobile?-16:-48,marginRight:isMobile?-16:-48,marginTop:isMobile?-20:-40,padding:isMobile?"12px 16px":"14px 48px",background:C.bg,flexWrap:"nowrap"}},
            isMobile&&e("div",{style:{
              width:36,height:36,borderRadius:10,
              background:C.dark,
              display:"flex",alignItems:"center",justifyContent:"center",
              flexShrink:0,marginRight:"auto"
            }},
              e("svg",{width:22,height:22,viewBox:"0 0 100 100",fill:"none"},
                e("path",{d:"M72 28C65 20 54 16 44 18C28 21 17 35 17 50C17 65 28 79 44 82C54 84 65 80 72 72",stroke:"#fff",strokeWidth:12,strokeLinecap:"round",fill:"none"}),
                e("path",{d:"M62 38C57 33 50 30 44 31C34 33 27 41 27 50C27 59 34 67 44 69C50 70 57 67 62 62",stroke:"rgba(255,255,255,0.35)",strokeWidth:8,strokeLinecap:"round",fill:"none"})
              )
            ),
            esProductos
              ? e(TopBarProductos,{open:menuNuevo,setOpen:setMenuNuevo,isMobile:isMobile,C:C,st:st,
                  onCliente:function(){ setClienteSel(null); setForm(formVacio); setModalCliente(true); },
                  onProspecto:function(){ setFormProspecto({clienteId:"",nuevoNombre:"",origen:"",canalPrincipal:"",contacto:"",productoInteres:"",precioInteres:"",envioPrecio:false,notas:""}); setBuscaCliOpo(""); setModalProspecto(true); setVista("prospectos"); },
                  onPedido:function(){ setNuevoPedidoForm({clienteId:"",nuevoNombre:"",productos:"",cantidad:1,total:"",anticipo:"",fechaEntrega:"",notas:""}); setBuscaCliPed(""); setNuevoPedidoModal(true); setVista("pedidos"); },
                  onVenta:abrirModalVenta})
              : e(TopBarServicios,{open:menuNuevo,setOpen:setMenuNuevo,isMobile:isMobile,C:C,st:st,
                  onCliente:function(){ setClienteSel(null); setForm(formVacio); setModalCliente(true); },
                  onCot:function(){ setModalCot(true); },
                  onVenta:abrirModalVenta})
          ),
          // Filtros styled
        e("div",{style:{paddingTop:20,marginBottom:20}},
          e("div",{style:{fontSize:28,fontWeight:700,color:C.text,lineHeight:1.1,marginBottom:4}},"Cotizaciones"),
          e("div",{style:{fontSize:14,color:C.textMuted,marginBottom:6}},"Las propuestas que tus clientes siguen pensando y las que esta vez no se concretaron.")
        ),
        e("div",{style:{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}},
          e("input",{placeholder:"Buscar...",value:filtroCot.busqueda,onChange:function(ev){ setFiltroCot(Object.assign({},filtroCot,{busqueda:ev.target.value})); },style:Object.assign({},st.inp,{flex:1,minWidth:120})}),
          e("select",{value:filtroCot.estatus,onChange:function(ev){ setHighlightCotId(null); setFiltroCot(Object.assign({},filtroCot,{estatus:ev.target.value})); },style:{cursor:"pointer",padding:"7px 12px",borderRadius:12,border:"1px solid "+C.border,background:C.surface,fontSize:12,color:C.textMuted,outline:"none"}},
            [["","Todas"],["Pendiente","Esperando respuesta"],["Rechazada","Sin cerrar"]].map(function(f){ return e("option",{key:f[0]||"todas",value:f[0]},f[1]); })
          ),
          e("select",{value:filtroCot.periodo,onChange:function(ev){ setFiltroCot(Object.assign({},filtroCot,{periodo:ev.target.value})); },style:{cursor:"pointer",padding:"7px 12px",borderRadius:12,border:"1px solid "+C.border,background:C.surface,fontSize:12,color:C.textMuted,outline:"none"}},
            [["todo","Todo el tiempo"],["semana","Esta semana"],["mes","Este mes"],["trimestre","Trimestre"]].map(function(p){ return e("option",{key:p[0],value:p[0]},p[1]); })
          )
        ),
        cotsFiltradas.length===0&&e("div",{style:{fontSize:13,color:C.textDim,textAlign:"center",padding:"24px 0"}},"No hay cotizaciones con esos filtros."),
        cotsFiltradas.map(function(cot){
          var cl=clientes.find(function(c){ return c.id===cot.clienteId; });
          var waUrl=cl&&cl.contacto?"https://wa.me/52"+cl.contacto+"?text="+encodeURIComponent("Hola "+cl.nombre+"\n\nTe comparto tu cotizacion:\n"+cot.concepto+"\nTotal: $"+Number(cot.monto).toLocaleString()+" MXN"+(cot.vigencia?"\nVigencia: "+cot.vigencia:"")+"\n\n"+perfil.mensaje):null;
          var saldo=cot.monto-(cot.anticipo||0);
          // Formatear fechas legibles
          var fmtFecha=function(f){ if(!f) return ""; var p=f.split("-"); return p[2]+"/"+p[1]+"/"+p[0].slice(2); };
          var esAceptada=cot.estatus==="Aceptada";
          var esPendiente=cot.estatus==="Pendiente";
          var esRechazada=cot.estatus==="Rechazada";
          var borderColor=esAceptada?C.green:esRechazada?C.red:esPendiente?C.amber:C.borderStrong;
          var esHighlightCot=cot.id===highlightCotId;
          return e("div",{key:cot.id,style:{background:C.surface,border:"1px solid "+C.border,borderRadius:16,padding:"16px",marginBottom:10,borderLeft:esHighlightCot?"4px solid "+C.purple:"3px solid "+borderColor,boxShadow:"0 2px 6px rgba(0,0,0,0.05)",transition:"border-left 0.3s"},ref:function(el){ if(el&&esHighlightCot){ el.scrollIntoView({behavior:"smooth",block:"start"}); } }},
            // HEADER,info + monto
            e("div",{style:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:8}},
              e("div",{style:{flex:1,minWidth:0}},
                e("div",{style:{fontWeight:600,fontSize:14,color:C.text,marginBottom:3,lineHeight:1.3,wordBreak:"break-word"}},cot.concepto||"Cotizacion"),
                e("div",{style:{fontSize:12,color:C.textMuted,marginBottom:4}},cl?(cl.nombre+(cl.negocio?" · "+cl.negocio:"")):"--"),
                e("div",{style:{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}},
                  e("span",{style:{fontSize:11,color:C.textDim}},"Enviada: "+fmtFecha(cot.fecha)),
                  cot.vigencia&&e("span",{style:{fontSize:11,color:new Date(cot.vigencia)<new Date()?C.red:C.textDim}},"Vence: "+fmtFecha(cot.vigencia))
                )
              ),
              e("div",{style:{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0,paddingLeft:8}},
                e("div",{style:{fontSize:17,fontWeight:700,color:esAceptada?C.green:C.text,whiteSpace:"nowrap"}},"$"+Number(cot.monto).toLocaleString()),
                e("span",{style:st.badgeCot(cot.estatus)},cot.estatus)
              )
            ),
            // ACCIONES
            e("div",{style:{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center",marginBottom:esAceptada||esRechazada?10:0}},
              e("div",{style:{display:"flex",gap:2,background:C.surfaceUp,borderRadius:6,padding:3,border:"0.5px solid "+C.border}},
                ["Pendiente","Aceptada","Rechazada"].map(function(est){
                  var activo=cot.estatus===est;
                  return e("button",{key:est,style:{cursor:"pointer",padding:"3px 8px",borderRadius:4,border:"none",background:activo?C.surface:"transparent",fontSize:11,color:activo?C.text:C.textMuted,fontWeight:activo?500:400},onClick:function(){ var eraAceptada=cot.estatus==="Aceptada"; cambiarEstatus(cot.id,est); if(est==="Aceptada"&&!eraAceptada) mostrarToastTrabajo(); }},est);
                })
              ),
              e("button",{style:Object.assign({},st.btn,{fontSize:11,padding:"4px 10px"}),onClick:function(){ editarCot(cot); }},"Editar"),
              e("button",{style:Object.assign({},st.btn,{fontSize:11,padding:"4px 10px"}),onClick:function(){ generarPDFCot(cot,cl,perfil); }},"PDF"),
              waUrl
                ? e("a",{href:waUrl,target:"_blank",rel:"noreferrer",style:{padding:"4px 10px",borderRadius:8,background:C.greenBg,color:C.green,border:"0.5px solid "+C.greenBorder,fontSize:11,textDecoration:"none",display:"inline-flex",alignItems:"center",gap:4}},e(SvgWA,{size:12}),"WA")
                : cl&&cl.canalPrincipal&&cl.canalPrincipal!=="WhatsApp"&&contactUrl(cl,"Hola")&&e("a",{href:contactUrl(cl,"Hola"),target:"_blank",rel:"noreferrer",style:{padding:"4px 10px",borderRadius:8,background:C.purplePale,color:C.purple,border:"0.5px solid "+C.purple+"33",fontSize:11,textDecoration:"none",display:"inline-flex",alignItems:"center",gap:4}},e(SvgIcon,{canal:cl.canalPrincipal,size:11}),cl.canalPrincipal.slice(0,2))
            ),
            esAceptada&&e("div",{style:{paddingTop:10,borderTop:"0.5px solid "+C.border}},
              (function(){
                var pagos=cot.pagos||[];
                var totalPagado=pagos.reduce(function(s,p){ return s+Number(p.monto); },0);
                var saldoReal=cot.monto-totalPagado;
                return e("div",{style:{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}},
                  e("div",null,
                    e("div",{style:{fontSize:10,color:C.textDim}},"Pagado"),
                    e("div",{style:{fontSize:14,fontWeight:600,color:C.green}},"$"+totalPagado.toLocaleString())
                  ),
                  e("div",null,
                    e("div",{style:{fontSize:10,color:C.textDim}},"Saldo pendiente"),
                    e("div",{style:{fontSize:14,fontWeight:600,color:saldoReal<=0?C.green:C.amber}},"$"+Math.max(0,saldoReal).toLocaleString())
                  ),
                  e("div",{style:{marginLeft:"auto",display:"flex",gap:6}},
                    e("button",{style:Object.assign({},st.btn,{fontSize:11}),onClick:function(){ setPagosModalId(cot.id); setFormPago({monto:"",fecha:FECHA_HOY,concepto:pagos.length===0?"Anticipo":saldoReal<=0?"Pago adicional":"Pago"}); }},saldoReal<=0?"Ver pagos":"+ Registrar pago"),
                    pagos.length>0&&e("button",{style:Object.assign({},st.btn,{fontSize:11,color:C.amber,borderColor:C.amberBorder}),onClick:function(){ generarComprobanteGeneral(cot,cl,perfil); }},"Comprobante general")
                  )
                );
              })()
            ),
            esRechazada&&cot.motivoPerdida&&e("div",{style:{marginTop:10,paddingTop:10,borderTop:"0.5px solid "+C.redBorder,display:"flex",alignItems:"center",gap:6}},
              e("span",{style:{fontSize:12,color:C.red,fontWeight:500}},"Motivo:"),
              e("span",{style:{fontSize:12,color:C.red}},cot.motivoPerdida)
            )
          );
        })
      ),
      // TRABAJOS , cotizaciones aceptadas + ventas con cliente, por completar o completadas
      vista==="trabajos"&&(function(){
        var trabajosTodos=obtenerTrabajos();
        var trabajos=filtroTrabajo==="todos"?trabajosTodos
          :filtroTrabajo==="conSaldo"?trabajosTodos.filter(function(t){ return (t.total-t.cobrado)>0; })
          :trabajosTodos.filter(function(t){ return filtroTrabajo==="completado"?t.entregado:!t.entregado; });
        var nPorCompletar=trabajosTodos.filter(function(t){ return !t.entregado; }).length;
        var nCompletados=trabajosTodos.filter(function(t){ return t.entregado; }).length;
        var nConSaldo=trabajosTodos.filter(function(t){ return (t.total-t.cobrado)>0; }).length;
        function nivelUrgenciaT(t){
          if(!t.fechaEntrega) return 3;
          var hoyU=new Date(); hoyU.setHours(0,0,0,0);
          var fE=new Date(t.fechaEntrega+"T00:00:00");
          var d=Math.round((fE-hoyU)/86400000);
          if(d<0) return 0;
          if(d===0) return 1;
          return 2;
        }
        if(filtroTrabajo!=="completado"){
          trabajos=trabajos.slice().sort(function(a,b){
            var na=nivelUrgenciaT(a),nb=nivelUrgenciaT(b);
            if(na!==nb) return na-nb;
            return new Date(a.fechaEntrega||"9999-12-31")-new Date(b.fechaEntrega||"9999-12-31");
          });
        }
        var sinFechaCount=trabajos.filter(function(t){ return !t.fechaEntrega; }).length;
        return e("div",{style:{display:"flex",flexDirection:"column",gap:0}},
          e("div",{style:{marginBottom:16}},
            e("div",{style:{fontSize:28,fontWeight:700,color:C.text}},"Tus trabajos"),
            e("div",{style:{fontSize:14,color:C.textMuted,marginTop:2}},"Lo que tus clientes ya contrataron y tienes por completar.")
          ),
          e("div",{style:{display:"flex",gap:8,marginBottom:20,alignItems:"center",flexWrap:"wrap"}},
            [{k:"porCompletar",l:"Por completar",n:nPorCompletar},{k:"completado",l:"Completados",n:nCompletados},{k:"conSaldo",l:"Con saldo",n:nConSaldo}].map(function(f,idx){
              var activo=filtroTrabajo===f.k;
              return [
                idx>0&&e("span",{key:"sep",style:{color:C.textDim,fontSize:14}},"·"),
                e("button",{key:f.k,style:{cursor:"pointer",padding:0,border:"none",background:"none",fontSize:14,color:activo?(f.k==="conSaldo"?C.amber:C.text):C.textMuted,fontWeight:activo?700:400,display:"flex",alignItems:"center",gap:4,borderBottom:activo?"2px solid "+(f.k==="conSaldo"?C.amber:C.purple):"2px solid transparent",paddingBottom:6},onClick:function(){ setFiltroTrabajo(f.k); }},
                  f.l+" "+f.n
                )
              ];
            })
          ),
          sinFechaCount>=2&&filtroTrabajo!=="completado"&&e("div",{style:{fontSize:13,color:C.textMuted,padding:"14px 16px",background:C.surface,borderRadius:12,marginBottom:14,border:"1px solid "+C.border,display:"flex",alignItems:"center",gap:10}},
            e("span",{style:{fontSize:16}},"📅"),
            sinFechaCount+" trabajos necesitan una fecha de entrega. Agregarla ayudará a que ninguno se te pase."
          ),
          trabajos.length===0
            ? e("div",{style:{fontSize:13,color:C.textDim,textAlign:"center",padding:"40px 0"}},filtroTrabajo==="completado"?"Todavía no has marcado ningún trabajo como completado.":filtroTrabajo==="conSaldo"?"No tienes ningún trabajo con saldo pendiente en este momento.":"No tienes trabajos por completar en este momento , buen momento para revisar si algo quedó pendiente de registrar.")
            : e("div",{style:{display:"flex",flexDirection:"column",gap:12}},
                trabajos.map(function(t){
                  var ac=avatarColor(t.cliente.id);
                  var saldoT=t.total-t.cobrado;
                  var pctPagado=t.total>0?Math.round((t.cobrado/t.total)*100):100;
                  var nombreCortoT=t.cliente.nombre.split(" ")[0];
                  var nivel=nivelUrgenciaT(t);

                  var fechaColor=C.textMuted,fechaTexto;
                  if(!t.fechaEntrega){ fechaTexto="Sin fecha de entrega"; }
                  else {
                    var diasF=Math.round((new Date(t.fechaEntrega+"T00:00:00")-new Date(new Date().setHours(0,0,0,0)))/86400000);
                    if(diasF<0){ fechaTexto=diasF===-1?"Debía entregarse ayer":"Debía entregarse el "+formatearFechaLarga(t.fechaEntrega); fechaColor="#EF4444"; }
                    else if(diasF===0){ fechaTexto="Entrega hoy"; fechaColor="#EF4444"; }
                    else if(diasF===1){ fechaTexto="Entrega mañana"; fechaColor="#3B82F6"; }
                    else { fechaTexto="Entrega: "+formatearFechaLarga(t.fechaEntrega); }
                  }

                  var urlContactarT=contactUrl(t.cliente,"Hola "+nombreCortoT+", te escribo para darte una actualización sobre "+t.servicio+".");

                  return e("div",{key:t.tipo+"_"+t.id,style:{display:"flex",alignItems:isMobile?"stretch":"center",gap:isMobile?14:20,padding:"18px 20px",background:C.surface,border:"1px solid "+C.border,borderRadius:16,flexWrap:isMobile?"wrap":"nowrap",boxShadow:"0 1px 3px rgba(0,0,0,0.04)",opacity:t.entregado?0.75:1}},

                    // Grupo: avatar + nombre/servicio/fecha, siempre en la misma fila
                    e("div",{style:{display:"flex",alignItems:"flex-start",gap:12,flex:isMobile?"1 1 100%":"0 1 320px",minWidth:isMobile?"100%":180,maxWidth:isMobile?"100%":340}},

                    e("div",{style:{width:44,height:44,borderRadius:"50%",background:ac+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:ac,flexShrink:0}},iniciales(t.cliente.nombre)),

                    // Columna 1: nombre + servicio + fecha
                    e("div",{style:{flex:1,minWidth:0}},
                      e("div",{style:{fontSize:16,fontWeight:700,color:C.text,marginBottom:2}},t.cliente.nombre),
                      e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:6}},t.servicio),
                      e("div",{style:{display:"flex",alignItems:"center",gap:6,fontSize:13,flexWrap:"wrap"}},
                        e("span",{style:{fontSize:13}},"📅"),
                        t.fechaEntrega
                          ? e("span",{style:{color:fechaColor,fontWeight:fechaColor!==C.textMuted?600:400}},fechaTexto)
                          : e("span",{style:{color:C.textMuted}},"Sin fecha"),
                        e("input",{type:"date",value:t.fechaEntrega||"",onChange:function(ev){ actualizarFechaEntrega(t,ev.target.value); },style:{border:"1px solid "+C.border,borderRadius:6,background:C.bg,fontSize:11,color:C.purple,fontWeight:600,cursor:"pointer",padding:"3px 5px",height:24}})
                      )
                    ),

                    ) // cierra grupo avatar + columna 1
                    ,

                    // Columna 2: pago , solo lo esencial, un dato principal y una acción
                    e("div",{style:{flex:isMobile?"1 1 100%":"0 0 180px",minWidth:isMobile?"100%":160,paddingTop:isMobile?14:0,borderTop:isMobile?"1px solid "+C.border:"none"}},
                      saldoT<=0
                        ? e("div",null,
                            e("div",{style:{fontSize:13,fontWeight:700,color:C.green,display:"flex",alignItems:"center",gap:6,marginBottom:4}},"✓ Pagado completo"),
                            e("button",{style:{cursor:"pointer",padding:0,border:"none",background:"none",fontSize:13,color:C.purple,fontWeight:600},onClick:function(){ setPagosModalTipo(t.tipo==="venta"?"venta":"cotizacion"); setPagosModalId(t.id); setFormPago({monto:"",fecha:FECHA_HOY,concepto:"Pago"}); }},"Ver pagos")
                          )
                        : e("div",null,
                            e("div",{style:{fontSize:14,fontWeight:700,color:C.amber,marginBottom:2}},"Falta $"+saldoT.toLocaleString()),
                            e("div",{style:{fontSize:12,color:C.textDim,marginBottom:4}},"$"+t.cobrado.toLocaleString()+" pagado de $"+t.total.toLocaleString()),
                            e("button",{style:{cursor:"pointer",padding:0,border:"none",background:"none",fontSize:13,color:C.purple,fontWeight:600},onClick:function(){ setPagosModalTipo(t.tipo==="venta"?"venta":"cotizacion"); setPagosModalId(t.id); setFormPago({monto:"",fecha:FECHA_HOY,concepto:t.cobrado===0?"Anticipo":"Pago"}); }},"+ Registrar pago")
                          )
                    ),

                    // Columna 3: acciones
                    e("div",{style:{display:"flex",gap:10,flexShrink:0,flexWrap:"wrap",marginLeft:isMobile?0:"auto",paddingTop:isMobile?14:0,borderTop:isMobile?"1px solid "+C.border:"none",width:isMobile?"100%":"auto"}},
                      e("button",{style:{cursor:"pointer",padding:"10px 18px",borderRadius:10,border:"1px solid "+C.border,background:"transparent",fontSize:13,color:C.textMuted,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6,whiteSpace:"nowrap",flex:isMobile?1:"none"},onClick:function(){ if(urlContactarT){ window.open(urlContactarT,"_blank"); } else { setClienteCompletarId(t.cliente.id); } }},
                        "💬 Contactar"
                      ),
                      !t.entregado&&e("button",{style:{cursor:"pointer",padding:"10px 18px",borderRadius:10,border:"none",background:C.green,fontSize:13,color:"#fff",fontWeight:700,whiteSpace:"nowrap",display:"flex",alignItems:"center",justifyContent:"center",flex:isMobile?1:"none"},onClick:function(){ marcarTrabajoCompletado(t); }},"✓ Completar")
                    )
                  );
                })
              )
        );
      })(),


      // HOY
      vista==="hoy"&&(function(){
        var hoy=new Date();
        var prioColor={"alta":"#EF4444","media":"#F59E0B","baja":"#3B82F6"};
        var prioLabel={"alta":"LO MÁS IMPORTANTE","media":"CONVIENE HOY","baja":"SE ESTÁ ENFRIANDO"};
        var prioBg={"alta":"#FEF2F2","media":"#FFFBEB","baja":"#EFF6FF"};


        var urgentes=[];

        if(!esProductos){
        var accionesCompletas=obtenerAccionesHoy(clientes,cotizaciones,esProductos);
        urgentes=accionesCompletas.map(function(a){
          return {cliente:a.cliente,razon:a.desc,prioridad:a.prioridad};
        });
        } // fin !esProductos
        var idsVisto={};
        urgentes=urgentes.filter(function(u){ return diasSinContacto(u.cliente)>=1||u.cliente.seguimientoFecha; });
        urgentes=urgentes.filter(function(u){ if(idsVisto[u.cliente.id]) return false; idsVisto[u.cliente.id]=true; return true; });
        urgentes=urgentes.filter(function(u){ return !u.cliente.archivado; });
        if(highlightHoyClienteId){
          urgentes=urgentes.slice().sort(function(a,b){
            if(a.cliente.id===highlightHoyClienteId) return -1;
            if(b.cliente.id===highlightHoyClienteId) return 1;
            return 0;
          });
        }

        return e("div",{style:{display:"flex",flexDirection:"column",gap:0}},

          // BOTONES , arriba a la derecha
          e("div",{style:{display:"flex",alignItems:"center",justifyContent:isMobile?"space-between":"flex-end",gap:isMobile?6:8,marginBottom:16,padding:isMobile?"12px 16px":"14px 0",flexWrap:"nowrap"}},
            isMobile&&e("div",{style:{
              width:36,height:36,borderRadius:10,
              background:C.dark,
              display:"flex",alignItems:"center",justifyContent:"center",
              flexShrink:0,marginRight:"auto"
            }},
              e("svg",{width:22,height:22,viewBox:"0 0 100 100",fill:"none"},
                e("path",{d:"M72 28C65 20 54 16 44 18C28 21 17 35 17 50C17 65 28 79 44 82C54 84 65 80 72 72",stroke:"#fff",strokeWidth:12,strokeLinecap:"round",fill:"none"}),
                e("path",{d:"M62 38C57 33 50 30 44 31C34 33 27 41 27 50C27 59 34 67 44 69C50 70 57 67 62 62",stroke:"rgba(255,255,255,0.35)",strokeWidth:8,strokeLinecap:"round",fill:"none"})
              )
            ),
            esProductos
              ? e(TopBarProductos,{open:menuNuevo,setOpen:setMenuNuevo,isMobile:isMobile,C:C,st:st,
                  onCliente:function(){ setClienteSel(null); setForm(formVacio); setModalCliente(true); },
                  onProspecto:function(){ setFormProspecto({clienteId:"",nuevoNombre:"",origen:"",canalPrincipal:"",contacto:"",productoInteres:"",precioInteres:"",envioPrecio:false,notas:""}); setBuscaCliOpo(""); setModalProspecto(true); setVista("prospectos"); },
                  onPedido:function(){ setNuevoPedidoForm({clienteId:"",nuevoNombre:"",productos:"",cantidad:1,total:"",anticipo:"",fechaEntrega:"",notas:""}); setBuscaCliPed(""); setNuevoPedidoModal(true); setVista("pedidos"); },
                  onVenta:abrirModalVenta})
              : e(TopBarServicios,{open:menuNuevo,setOpen:setMenuNuevo,isMobile:isMobile,C:C,st:st,
                  onCliente:function(){ setClienteSel(null); setForm(formVacio); setModalCliente(true); },
                  onCot:function(){ setModalCot(true); },
                  onVenta:abrirModalVenta})
          ),

          // TÍTULO
          e("div",{style:{paddingTop:16,marginBottom:16,display:"flex",alignItems:"baseline",justifyContent:"space-between"}},
            e("div",null,
              e("div",{style:{fontSize:28,fontWeight:700,color:C.text,lineHeight:1.1,marginBottom:4}},"A quién contactar hoy"),
              e("div",{style:{fontSize:14,color:C.textMuted}},
                esProductos?"Todas tus oportunidades y pedidos pendientes, ordenados por urgencia.":"Todas tus conversaciones pendientes, ordenadas por urgencia."
              )
            )
          ),

          // HOY EN MODO PRODUCTOS
          esProductos?(function(){
            // 1. Oportunidades por retomar (sin contacto >=2 días, no Convertido, no Perdido)
            var opsRetomar=clientes.filter(function(c){
              if(!c.estadoProspecto||c.estadoProspecto==="Convertido"||c.estadoProspecto==="Perdido") return false;
              if(c.seguimientoFecha&&c.seguimientoFecha<=FECHA_HOY) return true;
              var dias=diasDesde(c.fechaEtapa||c.fecha);
              if(c.estadoProspecto==="Nueva") return dias>=3;
              if(c.estadoProspecto==="En seguimiento") return dias>=4;
              return false;
            }).sort(function(a,b){ return diasDesde(b.fechaEtapa||b.fecha)-diasDesde(a.fechaEtapa||a.fecha); });

            // 2. Pedidos que requieren acción
            var pedidosAccion=[];
            pedidos.forEach(function(ped){
              var estadoNorm=ped.estadoPedido==="pendiente"?"preparando":ped.estadoPedido;
              if(estadoNorm==="cancelado") return;
              var cl=clientes.find(function(c){ return c.id===ped.clienteId; });
              var pagado=(ped.pagos||[]).reduce(function(s,p){ return s+Number(p.monto); },0);
              var saldo=Math.max(0,Number(ped.total||0)-pagado);

              // Saldo pendiente en pedidos activos
              if(saldo>0&&ped.total>0&&estadoNorm==="preparando"){
                pedidosAccion.push({ped:ped,cl:cl,tipo:"cobro",msg:"Saldo pendiente: $"+saldo.toLocaleString(),color:"#F59E0B",bg:"#FFFBEB",border:"#FCD34D"});
              }
              // Entregado pero sin cobrar — más urgente
              if(estadoNorm==="entregado"&&saldo>0&&ped.total>0){
                pedidosAccion.push({ped:ped,cl:cl,tipo:"cobro_entregado",msg:"Ya entregado · Falta cobrar $"+saldo.toLocaleString(),color:"#EF4444",bg:"#FEF2F2",border:"#FCA5A5"});
              }
              // Preparando desde hace muchos días sin marcarse entregado
              if(estadoNorm==="preparando"&&diasDesde(ped.fecha)>=5){
                pedidosAccion.push({ped:ped,cl:cl,tipo:"atrasado",msg:"Lleva "+diasDesde(ped.fecha)+" días sin marcarse como entregado",color:"#EF4444",bg:"#FEF2F2",border:"#FCA5A5"});
              }
            });

            var sinNada=opsRetomar.length===0&&pedidosAccion.length===0;

            return e("div",{style:{display:"flex",flexDirection:"column",gap:20}},

              sinNada&&e("div",{style:{background:C.surface,borderRadius:20,padding:"28px",border:"1px solid "+C.border,boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}},
                e("div",{style:{fontSize:18,fontWeight:700,color:C.text,marginBottom:8}},"✓ Todo en orden"),
                e("div",{style:{fontSize:14,color:C.textMuted,lineHeight:1.7}},"No tienes oportunidades pendientes ni pedidos que atender hoy. Buen momento para agregar nuevos contactos.")
              ),

              // SECCIÓN 1: Oportunidades por retomar , mismo estilo de tarjeta que Inicio
              opsRetomar.length>0&&e("div",null,
                e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10,display:"flex",alignItems:"center",gap:8}},
                  "🎯 OPORTUNIDADES POR RETOMAR",
                  e("span",{style:{fontSize:11,padding:"2px 8px",borderRadius:10,background:C.purple+"18",color:C.purple,fontWeight:700}},opsRetomar.length)
                ),
                e("div",{style:{display:"flex",flexDirection:"column",gap:10}},
                  opsRetomar.map(function(c){
                    var dias=diasDesde(c.fechaEtapa||c.fecha);
                    var nombre=c.nombre.split(" ")[0];
                    var producto=c.productoInteres;
                    var msg=c.estadoProspecto==="En seguimiento"&&producto
                      ?(dias<=3?""+nombre+" lleva "+dias+" días con tu precio de "+producto+". ¿Ya le escribiste?":
                        ""+nombre+" lleva "+dias+" días con tu precio de "+producto+" sin responder. ¿Ya le escribiste para ver si tiene dudas?")
                      :c.estadoProspecto==="Nueva"&&producto
                      ?(c.seguimientoFecha&&c.seguimientoFecha<=FECHA_HOY?"Hoy es el día que programaste para enviarle el precio de "+producto+" a "+nombre+".":"Registraste a "+nombre+" hace "+dias+" días con interés en "+producto+". Aún no le has enviado precio.")
                      :"Registraste a "+nombre+" hace "+dias+" días y aún no la has contactado.";
                    var prio=dias>=7?"alta":dias>=4?"media":"baja";
                    var ac=avatarColor(c.id);
                    return e("div",{key:c.id,style:{display:"flex",alignItems:"center",gap:12,padding:"14px",background:C.surface,border:"1px solid "+C.border,borderRadius:14,flexWrap:isMobile?"wrap":"nowrap",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}},
                      e("div",{style:{padding:"4px 10px",borderRadius:20,background:prioBg[prio],color:prioColor[prio],fontSize:10,fontWeight:700,letterSpacing:"0.3px",flexShrink:0,minWidth:132,textAlign:"center",flex:isMobile?"1 1 100%":"0 0 auto"}},prioLabel[prio]),
                      e("div",{style:{display:"flex",alignItems:"flex-start",gap:12,flex:isMobile?"1 1 100%":"1 1 auto",minWidth:0}},
                      e("div",{style:{width:40,height:40,borderRadius:"50%",background:ac+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:ac,flexShrink:0}},iniciales(c.nombre)),
                      e("div",{style:{flex:1,minWidth:isMobile?0:200}},
                        e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:2}},c.nombre),
                        e("div",{style:{fontSize:12,color:C.textMuted,lineHeight:1.4}},msg)
                      ),
                      ) // cierra grupo avatar + texto
                      ,
                      e("div",{style:{display:"flex",gap:8,flexShrink:0,minWidth:266,flex:isMobile?"1 1 100%":"0 0 auto"}},
                        e(BtnCanal,{cliente:c,small:false}),
                        e("button",{style:{cursor:"pointer",padding:"9px 16px",borderRadius:10,border:"1px solid "+C.border,background:"transparent",fontSize:12,color:C.textMuted,fontWeight:500,whiteSpace:"nowrap",flex:1},onClick:function(){ setVista("prospectos"); setFiltroProspecto("todos"); setHighlightOpoId(c.id); }},
                          "Ver oportunidad →"
                        )
                      )
                    );
                  })
                )
              ),

              // SECCIÓN 2: Pedidos que requieren acción , mismo estilo de tarjeta
              pedidosAccion.length>0&&e("div",null,
                e("div",{style:{fontSize:11,fontWeight:700,color:C.amber,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10,display:"flex",alignItems:"center",gap:8}},
                  "📦 PEDIDOS QUE REQUIEREN ACCIÓN",
                  e("span",{style:{fontSize:11,padding:"2px 8px",borderRadius:10,background:C.amber+"22",color:C.amber,fontWeight:700}},pedidosAccion.length)
                ),
                e("div",{style:{display:"flex",flexDirection:"column",gap:10}},
                  pedidosAccion.map(function(item,i){
                    var cl=item.cl;
                    var ac=cl?avatarColor(cl.id):"#94A3B8";
                    return e("div",{key:item.ped.id+"_"+item.tipo,style:{display:"flex",alignItems:"center",gap:12,padding:"14px",background:C.surface,border:"1px solid "+C.border,borderRadius:14,flexWrap:isMobile?"wrap":"nowrap",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}},
                      e("div",{style:{padding:"4px 10px",borderRadius:20,background:item.bg,color:item.color,fontSize:10,fontWeight:700,letterSpacing:"0.3px",flexShrink:0,minWidth:132,textAlign:"center",flex:isMobile?"1 1 100%":"0 0 auto"}},item.tipo==="atrasado"?"SIN ENTREGAR":"SALDO PENDIENTE"),
                      e("div",{style:{display:"flex",alignItems:"flex-start",gap:12,flex:isMobile?"1 1 100%":"1 1 auto",minWidth:0}},
                      e("div",{style:{width:40,height:40,borderRadius:"50%",background:ac+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:ac,flexShrink:0}},cl?iniciales(cl.nombre):"?"),
                      e("div",{style:{flex:1,minWidth:isMobile?0:200}},
                        e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:2}},cl?cl.nombre:"Cliente"),
                        e("div",{style:{fontSize:12,color:C.textMuted,lineHeight:1.4}},item.msg+(item.ped.productos?" · "+item.ped.productos:""))
                      ),
                      ) // cierra grupo avatar + texto
                      ,
                      e("div",{style:{display:"flex",gap:8,flexShrink:0,minWidth:266,flex:isMobile?"1 1 100%":"0 0 auto"}},
                        cl&&e(BtnCanal,{cliente:cl,small:false}),
                        e("button",{style:{cursor:"pointer",padding:"9px 16px",borderRadius:10,border:"1px solid "+C.border,background:"transparent",fontSize:12,color:C.textMuted,fontWeight:500,whiteSpace:"nowrap",flex:1},onClick:function(){ setVista("pedidos"); setHighlightPedidoId(item.ped.id); }},
                          "Ver pedido →"
                        )
                      )
                    );
                  })
                )
              )
            );
          })():null,

          // HOY EN MODO SERVICIOS
          !esProductos&&e("div",null,

          // ESTADO VACÍO
          urgentes.length===0&&(function(){
            var canalCierres={};
            clientes.filter(function(c){ return c.etapa==="Ganado"; }).forEach(function(c){ canalCierres[c.origen]=(canalCierres[c.origen]||0)+1; });
            var mejorCanal=Object.entries(canalCierres).sort(function(a,b){ return b[1]-a[1]; })[0];
            var ganadosRecientes=clientes.filter(function(c){ return c.etapa==="Ganado"&&diasDesde(c.fecha)<=60; });
            var sinContacto=clientes.filter(function(c){ return !c.contacto&&c.canalPrincipal!=="WhatsApp"; });
            var diasUsando=clientes.length>0?diasDesde([...clientes].sort(function(a,b){ return new Date(a.fecha)-new Date(b.fecha); })[0].fecha):0;
            var consejo=null;
            if(ganadosRecientes.length>=2) consejo="Tienes "+ganadosRecientes.length+" clientes que ya te compraron. ¿Les has escrito desde entonces? Un mensaje simple puede traerte una venta sin buscar cliente nuevo.";
            else if(sinContacto.length>=2) consejo="Tienes "+sinContacto.length+" clientes sin seguimiento reciente. La próxima vez que alguien te compre, pídele el número , así puedes volver a venderle cuando quieras.";
            else if(diasUsando<=21&&clientes.length>=3) consejo="Sigue registrando tus conversaciones aunque no cierren. En 2 semanas CLEO te va a mostrar exactamente qué está funcionando en tu negocio.";
            else if(mejorCanal&&mejorCanal[1]>=2) consejo=mejorCanal[0]+" es donde más cierras. ¿Qué estás haciendo ahí que no estás haciendo en los demás canales?";
            return e("div",{style:{background:C.surface,borderRadius:20,padding:"28px",border:"1px solid "+C.border,boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}},
              e("div",{style:{fontSize:18,fontWeight:700,color:C.text,marginBottom:8}},"✓ Estás al día"),
              e("div",{style:{fontSize:14,color:C.textMuted,lineHeight:1.7,marginBottom:consejo?20:0}},"Diste seguimiento a tiempo , eso es exactamente lo que más importa en ventas. No es talento, es constancia."),
              consejo&&e("div",{style:{fontSize:13,color:"#312E81",lineHeight:1.7,padding:"14px 16px",background:"#EEF2FF",borderRadius:12,border:"1px solid #C7D2FE"}},
                e("span",{style:{fontWeight:600,marginRight:6}},"💡"),consejo
              )
            );
          })(),

          // LISTA DE URGENTES , mismo estilo compacto de tarjeta que usa Inicio
          (function(){
            var prioColorH={"alta":"#EF4444","media":"#F59E0B","baja":"#3B82F6"};
            var prioLabelH={"alta":"LO MÁS IMPORTANTE","media":"CONVIENE HOY","baja":"SE ESTÁ ENFRIANDO"};
            var prioBgH={"alta":"#FEF2F2","media":"#FFFBEB","baja":"#EFF6FF"};
            return e("div",null,
              urgentes.length>0&&e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10,display:"flex",alignItems:"center",gap:8}},
                "💬 CONVERSACIONES POR RETOMAR",
                e("span",{style:{fontSize:11,padding:"2px 8px",borderRadius:10,background:C.purple+"18",color:C.purple,fontWeight:700}},urgentes.length)
              ),
              e("div",{style:{display:"flex",flexDirection:"column",gap:10}},
                urgentes.map(function(u){
                  try {
                    var c=u.cliente;
                    var urlContactar=contactUrl(c,msgEtapa(c));
                    var ac=avatarColor(c.id);
                    var cotCliente=cotizaciones.filter(function(cc){ return cc.clienteId===c.id; }).sort(function(x,y){ return new Date(y.fecha)-new Date(x.fecha); })[0];
                    var esHighlightHoy=c.id===highlightHoyClienteId;
                    return e("div",{key:c.id,style:{display:"flex",alignItems:"center",gap:12,padding:"14px",background:C.surface,border:esHighlightHoy?"2px solid "+C.purple:"1px solid "+C.border,borderRadius:14,flexWrap:isMobile?"wrap":"nowrap",boxShadow:esHighlightHoy?"0 0 0 3px "+C.purple+"22":"0 1px 3px rgba(0,0,0,0.04)"},ref:function(el){ if(el&&esHighlightHoy){ el.scrollIntoView({behavior:"smooth",block:"start"}); } }},
                      e("div",{style:{padding:"4px 10px",borderRadius:20,background:prioBgH[u.prioridad],color:prioColorH[u.prioridad],fontSize:10,fontWeight:700,letterSpacing:"0.3px",flexShrink:0,minWidth:132,textAlign:"center",flex:isMobile?"1 1 100%":"0 0 auto"}},prioLabelH[u.prioridad]),
                      e("div",{style:{display:"flex",alignItems:"flex-start",gap:12,flex:isMobile?"1 1 100%":"1 1 auto",minWidth:0}},
                      e("div",{style:{width:40,height:40,borderRadius:"50%",background:ac+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:ac,flexShrink:0}},iniciales(c.nombre)),
                      e("div",{style:{flex:1,minWidth:isMobile?0:200}},
                        e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:2}},c.nombre),
                        e("div",{style:{fontSize:12,color:C.textMuted,lineHeight:1.4}},u.razon)
                      ),
                      ) // cierra grupo avatar + texto
                      ,
                      e("div",{style:{textAlign:isMobile?"left":"right",flexShrink:0,minWidth:100,marginRight:isMobile?0:8,flex:isMobile?"1 1 100%":"0 0 auto"}},
                        cotCliente&&e("div",{style:{fontSize:15,fontWeight:700,color:C.text}},"$"+Number(cotCliente.monto).toLocaleString())
                      ),
                      e("div",{style:{display:"flex",gap:8,flexShrink:0,minWidth:266,flex:isMobile?"1 1 100%":"0 0 auto"}},
                        e("button",{style:{cursor:"pointer",padding:"9px 16px",borderRadius:10,border:"none",background:C.purple,fontSize:12,color:"#fff",fontWeight:600,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap",flex:1,justifyContent:"center"},onClick:function(){ setSugerenciaClienteId(c.id); }},
                          "💬 Contactar"
                        ),
                        e("button",{style:{cursor:"pointer",padding:"9px 16px",borderRadius:10,border:"1px solid "+C.border,background:"transparent",fontSize:12,color:C.textMuted,fontWeight:500,whiteSpace:"nowrap",flex:1},onClick:function(){ setContactadoClienteId(c.id); }},
                          "✓ Ya le hablé"
                        )
                      )
                    );
                  } catch(err){ return e("div",{key:u.cliente&&u.cliente.id,style:{padding:8,fontSize:11,color:C.red}},"Error cargando cliente"); }
                })
              )
            );
          })(),


          // COBROS PENDIENTES , cotizaciones aceptadas con saldo (dinero ya ganado, falta cobrar)
          (function(){
            var cobrosPendientes=obtenerCobrosPendientesHoy(cotizaciones,ventas,clientes);
            if(cobrosPendientes.length===0) return null;
            return e("div",{style:{marginTop:20}},
              e("div",{style:{fontSize:11,fontWeight:700,color:C.amber,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10,display:"flex",alignItems:"center",gap:8}},
                "💰 COBROS PENDIENTES",
                e("span",{style:{fontSize:11,padding:"2px 8px",borderRadius:10,background:C.amber+"22",color:C.amber,fontWeight:700}},cobrosPendientes.length)
              ),
              e("div",{style:{display:"flex",flexDirection:"column",gap:10}},
                cobrosPendientes.map(function(x,i){
                  var ac=avatarColor(x.cliente.id);
                  var pagado=Number(x.cot.monto)-x.saldo;
                  var descSaldo=pagado<=0
                    ?"Aún no ha pagado nada de esta cotización."
                    :"Ya pagó $"+pagado.toLocaleString()+". Quedó pendiente un saldo de $"+x.saldo.toLocaleString()+".";
                  var pagosX=x.cot.pagos||[];
                  return e("div",{key:i,style:{display:"flex",alignItems:"center",gap:12,padding:"14px",background:C.surface,border:"1px solid "+C.border,borderRadius:14,flexWrap:isMobile?"wrap":"nowrap",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}},
                    e("div",{style:{padding:"4px 10px",borderRadius:20,background:"#FFFBEB",color:C.amber,fontSize:10,fontWeight:700,letterSpacing:"0.3px",flexShrink:0,minWidth:132,textAlign:"center",flex:isMobile?"1 1 100%":"0 0 auto"}},"COBRO PENDIENTE"),
                    e("div",{style:{display:"flex",alignItems:"flex-start",gap:12,flex:isMobile?"1 1 100%":"1 1 auto",minWidth:0}},
                    e("div",{style:{width:40,height:40,borderRadius:"50%",background:ac+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:ac,flexShrink:0}},iniciales(x.cliente.nombre)),
                    e("div",{style:{flex:1,minWidth:isMobile?0:200}},
                      e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:2}},x.cliente.nombre),
                      e("div",{style:{fontSize:12,color:C.textMuted,lineHeight:1.4}},descSaldo)
                    ),
                    ) // cierra grupo avatar + texto
                    ,
                    e("div",{style:{textAlign:isMobile?"left":"right",flexShrink:0,minWidth:100,marginRight:isMobile?0:8,flex:isMobile?"1 1 100%":"0 0 auto"}},
                      e("div",{style:{fontSize:15,fontWeight:700,color:C.amber}},"$"+x.saldo.toLocaleString())
                    ),
                    e("div",{style:{display:"flex",gap:8,flexShrink:0,minWidth:266,flex:isMobile?"1 1 100%":"0 0 auto"}},
                      e("button",{style:{cursor:"pointer",padding:"9px 16px",borderRadius:10,border:"none",background:C.purple,fontSize:12,color:"#fff",fontWeight:600,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap",flex:1,justifyContent:"center"},onClick:function(){ var url=contactUrl(x.cliente,"Hola "+x.cliente.nombre.split(" ")[0]+", te escribo para ver cómo va el pago pendiente de "+(x.cot.concepto||"tu cotización")+"."); if(url) window.open(url,"_blank"); else setClienteCompletarId(x.cliente.id); }},
                        "💬 Contactar"
                      ),
                      e("button",{style:{cursor:"pointer",padding:"9px 16px",borderRadius:10,border:"1px solid "+C.border,background:"transparent",fontSize:12,color:C.textMuted,fontWeight:500,whiteSpace:"nowrap",flex:1},onClick:function(){ setPagosModalTipo(x.tipo); setPagosModalId(x.cot.id); setFormPago({monto:"",fecha:FECHA_HOY,concepto:pagosX.length===0?"Anticipo":"Pago"}); }},
                        "+ Registrar pago"
                      )
                    )
                  );
                })
              )
            );
          })()
          ) // cierre !esProductos
        );
      })(),
      // VENTAS (modo productos) — historial de ingresos ya recibidos
      vista==="ventas_productos"&&(function(){
        // Construir lista de ingresos: pagos de pedidos + ventas rápidas
        var ingresos=[];

        // 1. Pagos desde pedidos
        pedidos.forEach(function(ped){
          var cl=clientes.find(function(c){ return c.id===ped.clienteId; });
          (ped.pagos||[]).forEach(function(pago){
            ingresos.push({
              id:"vp_ped_"+pago.id,
              clienteId:ped.clienteId,
              clienteNombre:cl?cl.nombre:"Sin cliente",
              origen:"pedido",
              pedidoId:ped.id,
              monto:Number(pago.monto),
              fecha:pago.fecha||ped.fecha,
              concepto:pago.concepto||"Pago",
              productos:ped.productos||"",
            });
          });
        });

        // 2. Ventas rápidas
        ventas.forEach(function(v){
          var cl=clientes.find(function(c){ return c.id===v.clienteId; });
          // pagos individuales si es anticipo
          if(v.pagos&&v.pagos.length>0){
            v.pagos.forEach(function(pago){
              ingresos.push({
                id:"vp_vr_"+v.id+"_"+pago.id,
                clienteId:v.clienteId,
                clienteNombre:cl?cl.nombre:"Cliente general",
                origen:"venta_rapida",
                monto:Number(pago.monto),
                fecha:pago.fecha||v.fecha,
                concepto:v.concepto||"Venta directa",
                productos:"",
              });
            });
            // El saldo sin cobrar de una venta con anticipo NO se cuenta aquí , todavía no ha entrado.
          } else if(v.tipoPago!=="anticipo"){
            // Solo se asume el monto completo si de verdad se marcó "pagó completo".
            ingresos.push({
              id:"vp_vr_"+v.id,
              clienteId:v.clienteId,
              clienteNombre:cl?cl.nombre:"Cliente general",
              origen:"venta_rapida",
              monto:Number(v.monto),
              fecha:v.fecha,
              concepto:v.concepto||"Venta directa",
              productos:"",
            });
          }
        });

        // Ordenar por fecha desc
        ingresos.sort(function(a,b){ return new Date(b.fecha)-new Date(a.fecha); });

        // KPIs
        var totalHoy=ingresos.filter(function(i){ return enPeriodo(i.fecha,"hoy"); }).reduce(function(s,i){ return s+i.monto; },0);
        var totalSemana=ingresos.filter(function(i){ return enPeriodo(i.fecha,"semana"); }).reduce(function(s,i){ return s+i.monto; },0);
        var totalMes=ingresos.filter(function(i){ return enPeriodo(i.fecha,"mes"); }).reduce(function(s,i){ return s+i.monto; },0);

        // Filtrar
        var ingFiltrados=ingresos.filter(function(ing){
          if(!enPeriodo(ing.fecha,filtroVP.periodo)) return false;
          if(filtroVP.origen!=="todos"&&ing.origen!==filtroVP.origen) return false;
          if(filtroVP.busqueda&&!ing.clienteNombre.toLowerCase().includes(filtroVP.busqueda.toLowerCase())&&!ing.concepto.toLowerCase().includes(filtroVP.busqueda.toLowerCase())) return false;
          return true;
        });

        var fmtFecha=function(f){
          if(!f) return "";
          var fd=new Date(f+"T12:00:00"); // evitar timezone issues
          var hoyD=new Date(); hoyD.setHours(0,0,0,0);
          var fd0=new Date(fd); fd0.setHours(0,0,0,0);
          var diff=Math.round((hoyD-fd0)/(1000*60*60*24));
          if(diff===0) return "Hoy";
          if(diff===1) return "Ayer";
          return fd.toLocaleDateString("es-MX",{day:"numeric",month:"short"});
        };

        return e("div",null,
          // HEADER
          e("div",{style:{marginBottom:20}},
            e("div",{style:{fontSize:28,fontWeight:700,color:C.text,lineHeight:1.1,marginBottom:4}},"Ingresos"),
            e("div",{style:{fontSize:14,color:C.textMuted}},"Dinero que ya entró a tu negocio")
          ),

          // KPI CARDS — como servicios: una sola card con 3 secciones
          e("div",{style:{background:C.surface,borderRadius:16,border:"1px solid "+C.border,boxShadow:"0 1px 6px rgba(0,0,0,0.04)",marginBottom:20,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:0}},
            [
              {label:"Hoy",      valor:totalHoy,    periodo:"hoy"},
              {label:"Semana",   valor:totalSemana, periodo:"semana"},
              {label:"Mes",      valor:totalMes,    periodo:"mes"},
            ].map(function(kpi,i){
              var activo=filtroVP.periodo===kpi.periodo;
              return e("div",{key:kpi.label,
                style:{
                  padding:isMobile?"10px 6px":"16px 20px",cursor:"pointer",textAlign:"center",
                  borderRight:i<2?"1px solid "+C.border:"none",
                  background:activo?C.purplePale:"transparent",
                  borderRadius:i===0?"16px 0 0 16px":i===2?"0 16px 16px 0":"0",
                  transition:"background 0.15s"
                },
                onClick:function(){ setFiltroVP(Object.assign({},filtroVP,{periodo:kpi.periodo})); }
              },
                e("div",{style:{fontSize:isMobile?9:10,fontWeight:700,color:activo?C.purple:C.textDim,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}},kpi.label),
                e("div",{style:{fontSize:isMobile?18:24,fontWeight:700,color:activo?C.purple:kpi.valor>0?C.green:C.textMuted,lineHeight:1}},"$"+kpi.valor.toLocaleString())
              );
            })
          ),

          // FILTROS — búsqueda arriba, origen abajo en móvil
          e("div",{style:{display:"flex",flexDirection:"column",gap:8,marginBottom:16}},
            e("input",{
              placeholder:"Buscar...",
              value:filtroVP.busqueda,
              onChange:function(ev){ setFiltroVP(Object.assign({},filtroVP,{busqueda:ev.target.value})); },
              style:Object.assign({},st.inp,{marginBottom:0})
            }),
            e("div",{style:{display:"flex",gap:6}},
              ["todos","pedido","venta_rapida"].map(function(orig){
                var labels={todos:"Todos",pedido:"Pedidos",venta_rapida:"Ventas rápidas"};
                var activo=filtroVP.origen===orig;
                return e("button",{key:orig,
                  style:{cursor:"pointer",padding:"7px 10px",borderRadius:10,border:"1px solid "+(activo?C.purple:C.border),background:activo?"#EEF2FF":"transparent",fontSize:11,color:activo?C.purple:C.textMuted,fontWeight:activo?600:400,flex:1,whiteSpace:"nowrap"},
                  onClick:function(){ setFiltroVP(Object.assign({},filtroVP,{origen:orig})); }
                },labels[orig]);
              })
            )
          ),

          // LISTA
          ingFiltrados.length===0?
            e("div",{style:{textAlign:"center",padding:"60px 0"}},
              e("div",{style:{fontSize:36,marginBottom:12}},"💰"),
              e("div",{style:{fontSize:15,fontWeight:600,color:C.textMuted,marginBottom:6}},"Sin ingresos en este período"),
              e("div",{style:{fontSize:13,color:C.textDim}},"Los pagos de pedidos y ventas rápidas aparecen aquí.")
            ):
            e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
              ingFiltrados.map(function(ing){
                var cl=clientes.find(function(c){ return c.id===ing.clienteId; });
                var esPedido=ing.origen==="pedido";
                return e("div",{key:ing.id,style:{background:C.surface,borderRadius:12,border:"1px solid "+C.border,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}},
                  // Avatar
                  e("div",{style:{width:36,height:36,borderRadius:9,background:cl?avatarColor(cl.id)+"22":"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontWeight:700,fontSize:12,color:cl?avatarColor(cl.id):"#94A3B8"}},
                    cl?iniciales(cl.nombre):esPedido?"P":"V"
                  ),
                  // Info
                  e("div",{style:{flex:1,minWidth:0}},
                    e("div",{style:{fontWeight:600,fontSize:13,color:C.text,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},ing.clienteNombre),
                    e("div",{style:{fontSize:11,color:C.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},
                      ing.concepto+(ing.productos?" · "+ing.productos:"")
                    )
                  ),
                  // Monto + fecha + origen
                  e("div",{style:{textAlign:"right",flexShrink:0}},
                    e("div",{style:{fontSize:15,fontWeight:700,color:C.green}},"$"+ing.monto.toLocaleString()),
                    e("div",{style:{fontSize:10,color:C.textDim,marginTop:1}},fmtFecha(ing.fecha)),
                    e("div",{style:{fontSize:9,color:esPedido?C.purple:C.amber,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.3px"}},esPedido?"Pedido":"Venta directa")
                  )
                );
              }),
              // Total visible
              e("div",{style:{borderTop:"1px solid "+C.border,paddingTop:12,marginTop:4,display:"flex",justifyContent:"space-between",alignItems:"center"}},
                e("span",{style:{fontSize:12,color:C.textMuted}},ingFiltrados.length+" registros"),
                e("span",{style:{fontSize:15,fontWeight:700,color:C.green}},"$"+ingFiltrados.reduce(function(s,i){ return s+i.monto; },0).toLocaleString())
              )
            )
        );
      })(),

      // RESUMEN
      vista==="resumen"&&esProductos&&(function(){
        var PERIODOS=[["semana","Semana"],["mes","Mes"],["trimestre","Trimestre"],["todo","Todo"]];
        var periodoRes=periodo||"mes";

        function enPeriodoRes(fecha){
          if(!fecha) return false;
          var f=new Date(fecha+"T12:00:00"); f.setHours(0,0,0,0);
          var hoyD=new Date(HOY); hoyD.setHours(0,0,0,0);
          if(periodoRes==="todo") return true;
          if(periodoRes==="semana"){ var s=new Date(hoyD); s.setDate(hoyD.getDate()-hoyD.getDay()); return f>=s; }
          if(periodoRes==="mes"){ return f.getMonth()===hoyD.getMonth()&&f.getFullYear()===hoyD.getFullYear(); }
          if(periodoRes==="trimestre"){ var t=new Date(hoyD); t.setMonth(hoyD.getMonth()-3); return f>=t; }
          return true;
        }

        // Ingresos del período (pagos de pedidos + ventas rápidas)
        var ingresosPer=0;
        pedidos.forEach(function(ped){
          (ped.pagos||[]).forEach(function(p){ if(enPeriodoRes(p.fecha)) ingresosPer+=Number(p.monto); });
        });
        var ventasPer=ventas.filter(function(v){ return enPeriodoRes(v.fecha); });
        var ingresoVentasPer=ventasPer.reduce(function(s,v){ return s+(v.tipoPago==="anticipo"?(v.pagos||[]).reduce(function(x,p){ return x+Number(p.monto); },0):Number(v.monto)); },0);
        var totalCobrado=ingresosPer+ingresoVentasPer;

        // Pedidos del período
        var pedidosPer=pedidos.filter(function(p){ return enPeriodoRes(p.fecha||p.fechaCreado); });
        var pedidosEntregados=pedidosPer.filter(function(p){ return p.estadoPedido==="entregado"; });

        // Saldo por cobrar
        var saldoPorCobrar=pedidos.filter(function(p){ return p.estadoPedido!=="cancelado"; }).reduce(function(s,p){
          var pagado=(p.pagos||[]).reduce(function(a,pg){ return a+Number(pg.monto); },0);
          return s+Math.max(0,Number(p.total||0)-pagado);
        },0);

        // Si cobraras todo
        var potencial=totalCobrado+saldoPorCobrar;

        // Tasa de conversión oportunidades → pedidos
        var oportunidadesTot=clientes.filter(function(c){ return c.estadoProspecto; }).length;
        var convertidosTot=clientes.filter(function(c){ return c.estadoProspecto==="Convertido"; }).length;
        var tasaConv=oportunidadesTot>0?Math.round((convertidosTot/oportunidadesTot)*100):null;

        // Producto más vendido
        var productoCount={};
        pedidos.forEach(function(p){ if(p.productos&&p.estadoPedido!=="cancelado"){ var k=p.productos.trim(); productoCount[k]=(productoCount[k]||0)+1; } });
        ventasPer.forEach(function(v){ if(v.concepto){ var k=v.concepto.trim(); productoCount[k]=(productoCount[k]||0)+1; } });
        var topProducto=Object.entries(productoCount).sort(function(a,b){ return b[1]-a[1]; })[0]||null;

        // Canal que más trae , se excluyen los que no tienen origen registrado (no es un canal real)
        // Sin depender de estadoProspecto, ya que ese campo es exclusivo de Productos y en Servicios nunca existe
        var canalCount={};
        clientes.forEach(function(c){ if(c.origen) canalCount[c.origen]=(canalCount[c.origen]||0)+1; });
        var topCanal=Object.entries(canalCount).sort(function(a,b){ return b[1]-a[1]; })[0]||null;
        var sinOrigenCount=clientes.filter(function(c){ return !c.origen; }).length;

        // Por qué compraron (razones de cierre)
        var razonCount={};
        clientes.filter(function(c){ return c.razonCierre; }).forEach(function(c){
          (Array.isArray(c.razonCierre)?c.razonCierre:[c.razonCierre]).forEach(function(r){ razonCount[r]=(razonCount[r]||0)+1; });
        });
        var topRazon=Object.entries(razonCount).sort(function(a,b){ return b[1]-a[1]; })[0]||null;

        // Motivo más común de por qué se pierden clientes (oportunidades perdidas + pedidos cancelados)
        var motivoPerdidaCount={};
        clientes.filter(function(c){ return c.estadoProspecto==="Perdido"&&c.motivoPerdida; }).forEach(function(c){ motivoPerdidaCount[c.motivoPerdida]=(motivoPerdidaCount[c.motivoPerdida]||0)+1; });
        pedidos.filter(function(p){ return p.estadoPedido==="cancelado"&&p.motivoCancelacion; }).forEach(function(p){ motivoPerdidaCount[p.motivoCancelacion]=(motivoPerdidaCount[p.motivoCancelacion]||0)+1; });
        var motivosPerdidaRank=Object.entries(motivoPerdidaCount).sort(function(a,b){ return b[1]-a[1]; });
        var topMotivoPerdida=motivosPerdidaRank[0]||null;
        var totalPerdidasProd=clientes.filter(function(c){ return c.estadoProspecto==="Perdido"; }).length+pedidos.filter(function(p){ return p.estadoPedido==="cancelado"; }).length;

        // Ticket promedio
        var pedidosConTotal=pedidos.filter(function(p){ return Number(p.total)>0&&p.estadoPedido==="entregado"; });
        var ticketProm=pedidosConTotal.length>0?Math.round(pedidosConTotal.reduce(function(s,p){ return s+Number(p.total); },0)/pedidosConTotal.length):null;

        // Tiempo promedio oportunidad → pedido
        var tiemposConv=[];
        clientes.filter(function(c){ return c.estadoProspecto==="Convertido"&&c.fecha&&c.fechaPedido; }).forEach(function(c){
          var dias=Math.floor((parseFechaLocal(c.fechaPedido)-parseFechaLocal(c.fecha))/86400000);
          if(dias>=0) tiemposConv.push(dias);
        });
        var promDiasConv=tiemposConv.length>0?Math.round(tiemposConv.reduce(function(s,d){ return s+d; },0)/tiemposConv.length):null;

        // Racha
        var todasFechas={};
        pedidos.forEach(function(p){ (p.pagos||[]).forEach(function(pg){ if(pg.fecha) todasFechas[pg.fecha.slice(0,10)]=true; }); });
        ventas.forEach(function(v){ if(v.fecha) todasFechas[v.fecha.slice(0,10)]=true; });
        clientes.filter(function(c){ return c.estadoProspecto; }).forEach(function(c){ if(c.fecha) todasFechas[c.fecha.slice(0,10)]=true; });
        var rachaActual=0; var dR=new Date(HOY);
        for(var ri=0;ri<365;ri++){
          if(todasFechas[fmtFechaLocal(dR)]) rachaActual++;
          else if(ri>0) break;
          dR.setDate(dR.getDate()-1);
        }

        // Barras últimos 6 meses
        var MESES_LABELS=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
        var MESES_LARGO=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
        function diasEnMes(mes,anio){ return new Date(anio,mes+1,0).getDate(); }
        var mesesData=[];
        for(var mi=5;mi>=0;mi--){
          var fechaMes=new Date(HOY.getFullYear(),HOY.getMonth()-mi,1);
          var mes=fechaMes.getMonth(); var anio=fechaMes.getFullYear();
          var ingMes=0;
          pedidos.forEach(function(p){ (p.pagos||[]).forEach(function(pg){ var d=new Date(pg.fecha+"T12:00:00"); if(d.getMonth()===mes&&d.getFullYear()===anio) ingMes+=Number(pg.monto); }); });
          ventas.forEach(function(v){
            if(v.pagos&&v.pagos.length>0){
              v.pagos.forEach(function(pg){ var d=new Date((pg.fecha||v.fecha)+"T12:00:00"); if(d.getMonth()===mes&&d.getFullYear()===anio) ingMes+=Number(pg.monto); });
            } else if(v.tipoPago!=="anticipo"){
              var d=new Date(v.fecha+"T12:00:00"); if(d.getMonth()===mes&&d.getFullYear()===anio) ingMes+=Number(v.monto);
            }
          });
          mesesData.push({label:MESES_LABELS[mes],total:ingMes,mes:mes,anio:anio,esMesActual:mi===0});
        }
        var maxMes=Math.max.apply(null,mesesData.map(function(m){ return m.total; }).concat([1]));
        var mesActual=mesesData[5]; var mesAnterior=mesesData[4];

        // Comparación justa: mismo número de días transcurridos en ambos meses (no mes completo vs parcial)
        var diaHoy=HOY.getDate();
        var diaCorte=Math.min(diaHoy,diasEnMes(mesAnterior.mes,mesAnterior.anio));
        var mesAnteriorParcial=0;
        pedidos.forEach(function(p){ (p.pagos||[]).forEach(function(pg){ var d=new Date(pg.fecha+"T12:00:00"); if(d.getMonth()===mesAnterior.mes&&d.getFullYear()===mesAnterior.anio&&d.getDate()<=diaCorte) mesAnteriorParcial+=Number(pg.monto); }); });
        ventas.forEach(function(v){
          if(v.pagos&&v.pagos.length>0){
            v.pagos.forEach(function(pg){ var d=new Date((pg.fecha||v.fecha)+"T12:00:00"); if(d.getMonth()===mesAnterior.mes&&d.getFullYear()===mesAnterior.anio&&d.getDate()<=diaCorte) mesAnteriorParcial+=Number(pg.monto); });
          } else if(v.tipoPago!=="anticipo"){
            var d=new Date(v.fecha+"T12:00:00"); if(d.getMonth()===mesAnterior.mes&&d.getFullYear()===mesAnterior.anio&&d.getDate()<=diaCorte) mesAnteriorParcial+=Number(v.monto);
          }
        });
        var numTransaccionesMes=0;
        pedidos.forEach(function(p){ (p.pagos||[]).forEach(function(pg){ var d=new Date(pg.fecha+"T12:00:00"); if(d.getMonth()===mesActual.mes&&d.getFullYear()===mesActual.anio) numTransaccionesMes++; }); });
        ventas.forEach(function(v){ var d=new Date(v.fecha+"T12:00:00"); if(d.getMonth()===mesActual.mes&&d.getFullYear()===mesActual.anio) numTransaccionesMes++; });
        var suficienteData=diaHoy>=3&&numTransaccionesMes>=2;
        var cambioMes=(suficienteData&&mesAnteriorParcial>0)?Math.round(((mesActual.total-mesAnteriorParcial)/mesAnteriorParcial)*100):null;

        // Meta: cuánto falta para superar el total del mes anterior completo
        var faltaParaSuperar=Math.max(0,mesAnterior.total-mesActual.total);

        // Texto resumen
        var resumenTexto;
        if(pedidosEntregados.length===0&&ventasPer.length===0){
          resumenTexto="Aún no hay ventas registradas este período. Cuando entregues un pedido o registres una venta, aquí verás cómo te va.";
        } else if(tasaConv!==null&&tasaConv>=50){
          resumenTexto="Convertiste "+convertidosTot+" de "+oportunidadesTot+" oportunidades en pedido. Más de la mitad de las personas que te contactan terminan comprando.";
        } else if(tasaConv!==null&&tasaConv>=30){
          resumenTexto="Convertiste el "+tasaConv+"% de tus oportunidades en pedidos y cobraste $"+totalCobrado.toLocaleString()+". Hay margen para crecer con seguimiento.";
        } else {
          resumenTexto="Tienes "+(oportunidadesTot-convertidosTot)+" oportunidades que aún no se convirtieron en pedido. Un seguimiento a tiempo puede rescatar algunas.";
        }

        // Insights
        var insights=[];
        if(topProducto) insights.push({ic:"📦",color:"#DCFCE7",icBg:"#166534",titulo:"Tu producto más pedido es "+topProducto[0],desc:topProducto[1]+" veces pedido. Asegúrate de tenerlo siempre disponible y con precio actualizado."});
        if(topCanal) insights.push({ic:"📣",color:"#EDE9FE",icBg:"#4C1D95",titulo:"La mayoría de tus clientes llegan por "+topCanal[0],desc:topCanal[1]+(topCanal[1]===1?" cliente vino":" clientes vinieron")+" de ahí. Ese canal merece más atención y presencia."});
        if(sinOrigenCount>0) insights.push({ic:"❓",color:"#FEF3C7",icBg:"#92400E",titulo:sinOrigenCount+(sinOrigenCount===1?" cliente no tiene":" clientes no tienen")+" registrado cómo te encontró",desc:"Registrarlo te ayuda a ver con más claridad qué canal te está trayendo clientes de verdad."});
        if(promDiasConv!==null) insights.push({ic:"⏱️",color:promDiasConv<=3?"#DCFCE7":"#FEF3C7",icBg:promDiasConv<=3?"#166534":"#92400E",titulo:promDiasConv===0?"Tus clientes deciden rápido":"En promedio tardas "+promDiasConv+" días en cerrar",desc:promDiasConv<=3?"La mayoría de tus ventas se cierran muy rápido. Eso es buena señal de confianza.":"Entre más rápido le mandas el precio, más probabilidad de que compre."});
        if(topRazon) insights.push({ic:"🏆",color:"#FEF9C3",icBg:"#713F12",titulo:"La razón de compra más común es "+topRazon[0],desc:"Registrada "+topRazon[1]+" veces. Eso es lo que más convence a tus clientes — úsalo en tu comunicación."});
        if(topMotivoPerdida&&topMotivoPerdida[1]>=2) insights.push({ic:"⚠️",color:"#FEE2E2",icBg:"#991B1B",titulo:'"'+topMotivoPerdida[0]+'" es el motivo más común de que se te vayan clientes',desc:"Apareció en "+topMotivoPerdida[1]+" de "+totalPerdidasProd+" oportunidades o pedidos que no se concretaron."});
        if(saldoPorCobrar>0) insights.push({ic:"💰",color:"#FEF3C7",icBg:"#92400E",titulo:"Tienes $"+saldoPorCobrar.toLocaleString()+" pendientes de cobrar",desc:"Pedidos entregados o en proceso con saldo sin liquidar. Un mensaje puede acelerar el pago."});

        // Stats para card oscura
        var stats=[
          {label:"Ya ganaste",val:"$"+totalCobrado.toLocaleString(),sub:"",color:"#4ADE80",ic:"💼"},
          {label:"Todavía te deben",val:"$"+saldoPorCobrar.toLocaleString(),sub:"por cobrar",color:"#FBBF24",ic:null},
          {label:"Si cobras todo hoy, terminarías el periodo con",val:"$"+potencial.toLocaleString(),sub:"",color:"#A78BFA",ic:"🏆"},
        ];

        // Acciones semanales
        var accionesSemana=[];
        var opsEnSeguimiento=clientes.filter(function(c){ return c.estadoProspecto==="En seguimiento"; });
        var opsSinPrecio=clientes.filter(function(c){ return c.estadoProspecto==="Nueva"&&c.productoInteres&&!c.precioInteres; });
        var opsSinProducto=clientes.filter(function(c){ return c.estadoProspecto==="Nueva"&&!c.productoInteres; });
        if(opsEnSeguimiento.length>0) accionesSemana.push({n:1,ic:"💬",tipo:"seguimiento_espera",titulo:"Da seguimiento a "+opsEnSeguimiento.length+" oportunidad"+(opsEnSeguimiento.length>1?"es":"")+" en espera",desc:"Ya saben el precio. Un mensaje puede cerrar la venta esta semana."});
        if(saldoPorCobrar>0) accionesSemana.push({n:accionesSemana.length+1,ic:"💰",tipo:"saldo_cobrar",titulo:"Cobra los $"+saldoPorCobrar.toLocaleString()+" pendientes",desc:"Ya entregaste o tienes pedidos activos con saldo. Un mensaje rápido lo resuelve."});
        if(opsSinPrecio.length>0) accionesSemana.push({n:accionesSemana.length+1,ic:"🏷️",tipo:"sin_precio",titulo:"Manda precio a "+opsSinPrecio.length+" oportunidad"+(opsSinPrecio.length>1?"es":"")+" sin precio",desc:"Ya tienen producto de interés. Solo falta el precio para avanzar."});
        if(opsSinProducto.length>0) accionesSemana.push({n:accionesSemana.length+1,ic:"🎯",tipo:"sin_producto",titulo:opsSinProducto.length+" contacto"+(opsSinProducto.length>1?"s":"")+" sin producto definido",desc:"Pregúntales qué les interesa. Ese dato vale mucho."});
        if(accionesSemana.length===0) accionesSemana.push({n:1,ic:"✨",tipo:"agregar_nuevas",titulo:"Agrega nuevas oportunidades",desc:"Cuando alguien te pregunte por tus productos, regístralo. Cada contacto cuenta."});
        accionesSemana=accionesSemana.slice(0,3);

        // Detectar si la acción principal lleva varios días repitiéndose sin resolverse
        var diasRepetidoAccion=1;
        (function(){
          if(!accionesSemana[0]) return;
          try{
            var raw=localStorage.getItem("cleo_streak_accion_prod");
            var prev=raw?JSON.parse(raw):null;
            if(prev&&prev.tipo===accionesSemana[0].tipo){
              diasRepetidoAccion=prev.fecha===FECHA_HOY?(prev.dias||1):(prev.dias||1)+1;
            }
            localStorage.setItem("cleo_streak_accion_prod",JSON.stringify({tipo:accionesSemana[0].tipo,dias:diasRepetidoAccion,fecha:FECHA_HOY}));
          }catch(e){}
        })();

        var animo=totalCobrado>0&&tasaConv>=50?"Vas por buen camino. Más de la mitad de las personas que te contactan terminan comprando.":
          totalCobrado>0&&tasaConv>=30?"Estás generando ventas. Un par de cierres más y este período cambia por completo.":
          saldoPorCobrar>0?"Tienes $"+saldoPorCobrar.toLocaleString()+" esperando cobro. Eso ya es tuyo — solo falta pedirlo.":
          "Cada pedido registrado es información valiosa. Los patrones aparecen cuando más datos tienes.";

        return e("div",{style:{display:"flex",flexDirection:"column",gap:0}},

          // TOP BAR
          e("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginLeft:isMobile?-16:-48,marginRight:isMobile?-16:-48,marginTop:isMobile?-20:-40,padding:isMobile?"12px 16px":"14px 48px",background:C.bg}},
            e("div",{style:{display:"flex",gap:3,background:C.surfaceUp,border:"1px solid "+C.border,borderRadius:10,padding:3}},
              PERIODOS.map(function(p){
                var activo=periodo===p[0];
                return e("button",{key:p[0],style:{padding:"5px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,background:activo?C.surface:"transparent",color:activo?C.text:C.textMuted,fontWeight:activo?600:400,boxShadow:activo?"0 1px 3px rgba(0,0,0,0.08)":"none",transition:"all 0.15s"},onClick:function(){ setPeriodo(p[0]); }},p[1]);
              })
            )
          ),

          // TÍTULO
          e("div",{style:{paddingTop:24,marginBottom:24}},
            e("div",{style:{fontSize:28,fontWeight:700,color:C.text,lineHeight:1.1,marginBottom:6}},"Así va tu negocio"),
            e("div",{style:{fontSize:14,color:C.textMuted}},"Una revisión de cómo estás vendiendo, no solo cuánto.")
          ),

          e("div",{style:{display:"flex",flexDirection:"column",gap:24}},

          // CARD OSCURA — igual que servicios
          e("div",{style:{background:"#0F1729",borderRadius:24,padding:isMobile?"24px 20px":"28px 24px",position:"relative",overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,0.18)"}},
            e("div",{style:{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1px 1fr 1px 1fr",gap:isMobile?0:0,alignItems:"center"}},
              stats.map(function(k,i){
                var isLast=i===stats.length-1;
                return [
                  e("div",{key:"s"+i,style:{padding:isMobile?"16px 8px":"0 10px",textAlign:"center",borderBottom:isMobile&&!isLast?"1px solid rgba(255,255,255,0.08)":"none"}},
                    e("div",{style:{fontSize:isMobile?11:11,color:"rgba(255,255,255,0.5)",letterSpacing:"0.2px",marginBottom:8,lineHeight:1.3}},k.label),
                    e("div",{style:{fontSize:isMobile?24:22,fontWeight:700,color:k.color,lineHeight:1,marginBottom:6,whiteSpace:"nowrap"}},k.val),
                    e("div",{style:{fontSize:isMobile?11:11,color:"rgba(255,255,255,0.35)",lineHeight:1.3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},k.sub)
                  ),
                  !isLast&&!isMobile?e("div",{key:"d"+i,style:{width:1,background:"rgba(255,255,255,0.08)",alignSelf:"stretch"}}):null
                ];
              }).flat().filter(Boolean)
            ),
            e("div",{style:{marginTop:20,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.06)",fontSize:13,color:"rgba(255,255,255,0.5)",lineHeight:1.6}},resumenTexto)
          ),

          // GRÁFICA BARRAS
          e("div",{style:{background:C.surface,borderRadius:20,padding:isMobile?"16px":"24px",border:"1px solid "+C.border}},
            e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}},
              e("div",{style:{fontSize:14,fontWeight:700,color:C.text}},"Ingresos por mes"),
              cambioMes!==null&&e("div",{style:{textAlign:"right"}},
                e("div",{style:{fontSize:12,color:cambioMes>=0?C.green:"#EF4444",fontWeight:600}},(cambioMes>=0?"+":"")+cambioMes+"%"),
                e("div",{style:{fontSize:9,color:C.textDim}},"vs mismo punto de "+MESES_LARGO[mesAnterior.mes])
              )
            ),
            mesActual.total>0&&faltaParaSuperar>0&&e("div",{style:{fontSize:isMobile?13:14,color:C.textMuted,marginBottom:16,lineHeight:1.4}},
              "Te faltan ",e("span",{style:{fontWeight:700,color:C.purple}},"$"+faltaParaSuperar.toLocaleString())," para superar "+MESES_LARGO[mesAnterior.mes]
            ),
            mesActual.total>0&&faltaParaSuperar===0&&e("div",{style:{fontSize:isMobile?13:14,color:C.green,fontWeight:600,marginBottom:16,lineHeight:1.4}},"🎉 Vas $"+(mesActual.total-mesAnterior.total).toLocaleString()+" arriba de "+MESES_LARGO[mesAnterior.mes]),
            mesActual.total===0&&e("div",{style:{fontSize:12,color:C.textDim,marginBottom:16,lineHeight:1.4}},"Aún no registras ingresos en "+MESES_LARGO[mesActual.mes]+". En cuanto llegue el primero, verás tu avance aquí."),
            e("div",{style:{display:"flex",gap:isMobile?4:8,alignItems:"flex-end",height:80}},
              mesesData.map(function(m,i){
                var h=Math.max(4,Math.round((m.total/maxMes)*80));
                return e("div",{key:i,style:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}},
                  e("div",{style:{width:"100%",height:h,borderRadius:"4px 4px 0 0",background:m.esMesActual?C.purple:C.purple+"44",transition:"height 0.3s"}}),
                  e("div",{style:{fontSize:isMobile?8:9,color:C.textDim,textAlign:"center"}},m.label),
                  m.total>0&&e("div",{style:{fontSize:8,color:C.textDim,textAlign:"center"}},"$"+(m.total>=1000?Math.round(m.total/1000)+"k":m.total))
                );
              })
            )
          ),


          e("div",{style:{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:20}},

          // CARD 3: LO QUE APRENDIÓ CLEO (insights + canales)
          e("div",{style:{background:C.surface,borderRadius:20,padding:"24px",border:"1px solid "+C.border,boxShadow:"0 2px 12px rgba(0,0,0,0.04)"}},
            e("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:6}},
              e("div",{style:{width:28,height:28,borderRadius:8,background:C.purplePale,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}},"🧠"),
              e("div",{style:{fontSize:11,fontWeight:700,color:C.purple,textTransform:"uppercase",letterSpacing:"1.5px"}},"Lo que aprendió CLEO")
            ),
            e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:20}},"Patrones de tus ventas este período"),

            // Insights
            insights.length>0&&e("div",{style:{display:"flex",flexDirection:"column",gap:10,marginBottom:20}},
              insights.map(function(ins,i){
                return e("div",{key:i,style:{background:C.bg,borderRadius:14,padding:"14px 16px",border:"1px solid "+C.border,display:"flex",gap:12,alignItems:"flex-start"}},
                  e("div",{style:{width:32,height:32,borderRadius:9,background:ins.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}},ins.ic),
                  e("div",null,
                    e("div",{style:{fontSize:13,fontWeight:600,color:C.text,marginBottom:3,lineHeight:1.3}},ins.titulo),
                    e("div",{style:{fontSize:12,color:C.textMuted,lineHeight:1.5}},ins.desc)
                  )
                );
              })
            ),
          ),

          e("div",{style:{display:"flex",flexDirection:"column",gap:20}},

          (function(){
            var canalesP=["Instagram","Facebook","WhatsApp","Referido","Otro"].map(function(o){
              var total=clientes.filter(function(c){ return c.origen===o&&c.estadoProspecto; }).length;
              var convertidos=clientes.filter(function(c){ return c.origen===o&&c.estadoProspecto==="Convertido"; }).length;
              var sinConvertir=total-convertidos;
              return {canal:o,total:total,convertidos:convertidos,sinConvertir:sinConvertir};
            }).filter(function(c){ return c.total>0; }).sort(function(a,b){ return b.total-a.total; });
            if(canalesP.length===0) return null;
            return e("div",{style:{background:C.surface,borderRadius:20,padding:"24px",border:"1px solid "+C.border,boxShadow:"0 2px 12px rgba(0,0,0,0.04)"}},
              e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px",marginBottom:12}},"De dónde vienen tus clientes"),
              e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
                canalesP.map(function(c){
                  var msg=c.convertidos===c.total&&c.total>0?"Todos compraron — tu mejor canal":
                          c.sinConvertir>0?c.sinConvertir+" sin comprar aún — dales seguimiento":
                          "Sin ventas registradas aún";
                  var color=c.convertidos===c.total&&c.total>0?C.green:c.sinConvertir>0?C.amber:C.textDim;
                  return e("div",{key:c.canal,style:{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:C.bg,borderRadius:10,border:"1px solid "+C.border}},
                    e("div",{style:{flex:1}},
                      e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},
                        e("span",{style:{fontSize:13,fontWeight:600,color:C.text}},c.canal),
                        e("span",{style:{fontSize:12,color:C.textMuted}},c.total+" cliente"+(c.total>1?"s":""))
                      ),
                      e("div",{style:{fontSize:11,color:color,marginTop:2}},msg)
                    )
                  );
                })
              )
            );
          })(),

          // CARD 4: TU PRÓXIMO PASO (una sola acción principal + secundarias discretas)
          e("div",{style:{background:C.surface,borderRadius:20,padding:"24px",border:"1px solid "+C.border,boxShadow:"0 2px 12px rgba(0,0,0,0.04)"}},
            e("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:6}},
              e("div",{style:{width:28,height:28,borderRadius:8,background:"#DCFCE7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}},"🎯"),
              e("div",{style:{fontSize:11,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:"1.5px"}},"Tu próximo paso")
            ),
            e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:20}},diasRepetidoAccion>=3?"Llevas "+diasRepetidoAccion+" días con esto pendiente. ¿Qué te está deteniendo?":"Esto es lo que más impacto tendría hoy."),
            // Acción principal, grande y sola
            accionesSemana[0]&&e("div",{style:{background:"linear-gradient(135deg,#ECFDF5 0%,#F0FDF4 100%)",borderRadius:16,padding:"18px 20px",border:"1px solid #86EFAC",display:"flex",gap:14,alignItems:"flex-start",marginBottom:accionesSemana.length>1?14:20}},
              e("div",{style:{fontSize:26,flexShrink:0}},accionesSemana[0].ic),
              e("div",null,
                e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:4,lineHeight:1.3}},accionesSemana[0].titulo),
                e("div",{style:{fontSize:13,color:C.textMuted,lineHeight:1.5}},accionesSemana[0].desc)
              )
            ),
            // Secundarias, discretas
            accionesSemana.length>1&&e("div",{style:{marginBottom:20}},
              e("div",{style:{fontSize:11,color:C.textDim,marginBottom:8}},"Si te sobra tiempo, también:"),
              e("div",{style:{display:"flex",flexDirection:"column",gap:6}},
                accionesSemana.slice(1).map(function(ac){
                  return e("div",{key:ac.n,style:{display:"flex",gap:8,alignItems:"center",fontSize:12,color:C.textMuted}},
                    e("span",{style:{fontSize:13,flexShrink:0}},ac.ic),
                    e("span",null,ac.titulo)
                  );
                })
              )
            ),
            // Ánimo integrado
            e("div",{style:{background:C.purplePale,borderRadius:12,padding:"14px 16px",border:"1px solid "+C.purple+"22",display:"flex",alignItems:"center",gap:12}},
              e("div",{style:{fontSize:22,flexShrink:0}},"✨"),
              e("div",{style:{fontSize:13,color:C.text,lineHeight:1.6}},animo)
            )
          )

          ) // cierra columna 2 (canales + Tu próximo paso)

          ) // cierra grid Card3/Card4
          ,
          // 🔥 TU RITMO DE VENTAS (compacta, proporcional)
          e("div",{style:{background:"#0F1729",borderRadius:14,padding:"12px 18px",display:"flex",alignItems:"center",gap:14,flexWrap:isMobile?"wrap":"nowrap"}},(function(){
            var todasFechas=[];
            ventas.forEach(function(v){ if(v.fecha) todasFechas.push(v.fecha.slice(0,10)); });
            cotizaciones.forEach(function(c){ if(c.fecha) todasFechas.push(c.fecha.slice(0,10)); });
            clientes.forEach(function(c){ if(c.fecha) todasFechas.push(c.fecha.slice(0,10)); });
            var fechasSet={}; todasFechas.forEach(function(f){ fechasSet[f]=true; });
            var hoyStr=fmtFechaLocal(HOY);
            var rachaActual=0;
            var d=new Date(HOY);
            for(var ri=0;ri<365;ri++){
              var ds=fmtFechaLocal(d);
              if(fechasSet[ds]) rachaActual++;
              else if(ri>0) break;
              d.setDate(d.getDate()-1);
            }
            var diasSinAct=0;
            var d2=new Date(HOY); d2.setDate(d2.getDate()-1);
            for(var ri2=0;ri2<365;ri2++){
              if(fechasSet[fmtFechaLocal(d2)]) break;
              diasSinAct++; d2.setDate(d2.getDate()-1);
            }
            var tieneHoy=!!fechasSet[hoyStr];
            var ultimos7=[];
            for(var ui=6;ui>=0;ui--){ var ud=new Date(HOY); ud.setDate(ud.getDate()-ui); ultimos7.push(fmtFechaLocal(ud)); }
            var horaActual=new Date().getHours();
            var esTarde=horaActual>=18;
            var mensajeRacha=(!tieneHoy&&esTarde&&rachaActual>=2)?"Se está acabando el día y aún no registras nada.":
              rachaActual>=7?"¡Llevas "+rachaActual+" días seguidos activo en CLEO!":
              rachaActual>=3?"Llevas "+rachaActual+" días registrando actividad.":
              tieneHoy?"Hoy ya registraste actividad. Buen comienzo.":
              diasSinAct===0?"Empieza hoy, registrar algo tarda menos de un minuto.":
              diasSinAct===1?"Ayer no registraste nada. Hoy puedes retomar el ritmo.":
              "Han pasado "+diasSinAct+" días desde tu última actividad.";
            var colorRacha=(!tieneHoy&&esTarde&&rachaActual>=2)?"#F87171":rachaActual>=7?"#FBBF24":rachaActual>=3?"#4ADE80":"#94A3B8";
            return [
              e("div",{key:"e",style:{fontSize:20,flexShrink:0}},rachaActual>=7?"🔥":rachaActual>=3?"⚡":"🌱"),
              e("div",{key:"n",style:{flexShrink:0}},
                e("div",{style:{fontSize:16,fontWeight:800,color:colorRacha,lineHeight:1}},rachaActual+" días"),
                e("div",{style:{fontSize:9,color:"rgba(255,255,255,0.35)",marginTop:1}},"de racha")
              ),
              e("div",{key:"s",style:{width:1,height:24,background:"rgba(255,255,255,0.1)",flexShrink:0}}),
              e("div",{key:"m",style:{flex:1,fontSize:12,color:"rgba(255,255,255,0.55)",lineHeight:1.35,minWidth:150}},mensajeRacha),
              e("div",{key:"h",style:{display:"flex",gap:4,flexShrink:0}},
                ultimos7.map(function(f,i){
                  var activo=!!fechasSet[f];
                  var esHoy=f===hoyStr;
                  return e("div",{key:i,style:{width:14,height:14,borderRadius:4,background:activo?(esHoy?colorRacha:"rgba(75,94,252,0.6)"):"rgba(255,255,255,0.06)",border:esHoy?"1px solid "+colorRacha+"66":"none"}});
                })
              )
            ];
          })()),

          ) // fin gap:24
        ); // fin return
      })(),
      vista==="resumen"&&!esProductos&&(function(){
        var aceptadas=cotsPeriodo.filter(function(c){ return c.estatus==="Aceptada"; });
        var rechazadas=cotsPeriodo.filter(function(c){ return c.estatus==="Rechazada"; });
        // totalG = lo que realmente se ha cobrado, contado en el periodo en que cada pago entró
        var totalG=totalPagadoCotizacionesPeriodo(cotizaciones,periodo);
        var totalR=rechazadas.reduce(function(s,c){ return s+c.monto; },0);
        var totalP=cotsPeriodo.filter(function(c){ return c.estatus==="Pendiente"; }).reduce(function(s,c){ return s+c.monto; },0);
        var tasa=cotsPeriodo.length?Math.round((aceptadas.length/cotsPeriodo.length)*100):0;
        var prom=aceptadas.length?Math.round(totalG/aceptadas.length):0;
        var totalSaldos=cotizaciones.filter(function(c){ return c.estatus==="Aceptada"&&c.anticipo>0&&(c.monto-c.anticipo)>0; }).reduce(function(s,c){ return s+(c.monto-c.anticipo); },0)
          +ventas.filter(function(v){ return v.tipoPago==="anticipo"&&Number(v.anticipo)>0&&(Number(v.monto)-Number(v.anticipo))>0; }).reduce(function(s,v){ return s+(Number(v.monto)-Number(v.anticipo)); },0);
        var motivoCount={};
        rechazadas.forEach(function(c){ if(c.motivoPerdida) motivoCount[c.motivoPerdida]=(motivoCount[c.motivoPerdida]||0)+1; });
        var motivosRank=Object.entries(motivoCount).sort(function(a,b){ return b[1]-a[1]; });
        var canalCierres={};
        clientes.filter(function(c){ return c.etapa==="Ganado"; }).forEach(function(c){ canalCierres[c.origen]=(canalCierres[c.origen]||0)+1; });
        var mejorCanalCierre=Object.entries(canalCierres).sort(function(a,b){ return b[1]-a[1]; })[0];

        // Ventas directas: se cuentan en el periodo en que realmente entró el dinero
        var ventasPer=ventas.filter(function(v){ return enPeriodo(v.fecha,periodo); });
        var totalVD=totalPagadoVentasPeriodo(ventas,periodo);
        var vdConContacto=ventasPer.filter(function(v){ return v.tipo==="especifico"; }).length;
        var vdSinContacto=ventasPer.filter(function(v){ return v.tipo!=="especifico"; }).length;
        var pctCapturado=ventasPer.length>0?Math.round((vdConContacto/ventasPer.length)*100):null;

        // Servicio/concepto más vendido (cotizaciones aceptadas + ventas rápidas)
        var conceptoCount={};
        aceptadas.forEach(function(c){ if(c.concepto){ var k=c.concepto.trim(); conceptoCount[k]=(conceptoCount[k]||0)+1; } });
        ventasPer.forEach(function(v){ if(v.concepto){ var k=v.concepto.trim(); conceptoCount[k]=(conceptoCount[k]||0)+1; } });
        var topConcepto=Object.entries(conceptoCount).sort(function(a,b){ return b[1]-a[1]; })[0]||null;

        // Tiempo promedio de cierre (dias desde registro hasta cotizacion aceptada)
        var tiemposCierre=[];
        aceptadas.forEach(function(cot){
          var cl=clientes.find(function(c){ return c.id===cot.clienteId; });
          if(cl&&cl.fecha&&cot.fecha){
            var dias=Math.floor((parseFechaLocal(cot.fecha)-parseFechaLocal(cl.fecha))/86400000);
            if(dias>=0) tiemposCierre.push(dias);
          }
        });
        var promDiasCierre=tiemposCierre.length>0?Math.round(tiemposCierre.reduce(function(s,d){ return s+d; },0)/tiemposCierre.length):null;
        // Comparar con periodo anterior para ver tendencia
        var cotsPeriodoAnterior=cotizaciones.filter(function(c){
          if(periodo==="mes"){ var d=parseFechaLocal(c.fecha); var prev=new Date(HOY); prev.setMonth(prev.getMonth()-1); return d.getMonth()===prev.getMonth()&&d.getFullYear()===prev.getFullYear()&&c.estatus==="Aceptada"; }
          return false;
        });
        var tiemposAnterior=[];
        cotsPeriodoAnterior.forEach(function(cot){
          var cl=clientes.find(function(c){ return c.id===cot.clienteId; });
          if(cl&&cl.fecha){ var dias=Math.floor((parseFechaLocal(cot.fecha)-parseFechaLocal(cl.fecha))/86400000); if(dias>=0) tiemposAnterior.push(dias); }
        });
        var promAnterior=tiemposAnterior.length>0?Math.round(tiemposAnterior.reduce(function(s,d){ return s+d; },0)/tiemposAnterior.length):null;
        var tendenciaCierre=promDiasCierre!==null&&promAnterior!==null?(promDiasCierre<promAnterior?"mejorando":promDiasCierre>promAnterior?"empeorando":"igual"):null;

        var motivoPrincipal=motivosRank.length>0?motivosRank[0][0]:null;
        var resumenTexto;
        if(cotsPeriodo.length===0){
          resumenTexto=esProductos?"Aun no hay precios registrados este periodo. Cuando registres uno, aqui veras cuantos clientes te compran.":"Aun no hay cotizaciones en este periodo. Cuando mandes una, aqui veras como te va.";
        } else if(aceptadas.length===0){
          resumenTexto="Mandaste "+cotsPeriodo.length+" cotizacion"+(cotsPeriodo.length>1?"es":"")+" este periodo pero ninguna cerro todavia."+(motivoPrincipal?" El motivo mas frecuente fue '"+motivoPrincipal+"'.":" Registra el motivo cuando pierdas una , te ayuda a mejorar.");
        } else if(tasa>=50){
          resumenTexto="Cerraste "+aceptadas.length+" de "+cotsPeriodo.length+" cotizaciones. Excelente , mas de la mitad de lo que mandas se convierte en venta.";
        } else if(tasa>=30){
          resumenTexto="Cerraste "+aceptadas.length+" de "+cotsPeriodo.length+" cotizaciones y cobraste $"+totalG.toLocaleString()+"."+(motivoPrincipal?" Las que no cerraron fue principalmente por '"+motivoPrincipal+"'.":"");
        } else {
          resumenTexto="Cerraste "+aceptadas.length+" de "+cotsPeriodo.length+" cotizaciones."+(motivoPrincipal?" El motivo mas frecuente de rechazo fue '"+motivoPrincipal+"' , un seguimiento a tiempo puede rescatar algunas.":" Registra por que no cerraron , ese dato vale oro.");
        }
        var maxLeads=Math.max.apply(null,ORIGENES.map(function(o){ return clientes.filter(function(c){ return c.origen===o; }).length; }).concat([1]));

        // Clientes recuperados: estaban Perdidos y ahora son Ganados o tienen cotización Aceptada
        var recuperados=clientes.filter(function(c){
          if(c.etapa!=="Ganado") return false;
          // Tiene historial de cotización rechazada o motivoPerdida registrado
          var tuvoRechazo=cotizaciones.some(function(cot){ return cot.clienteId===c.id&&(cot.estatus==="Rechazada"||cot.motivoPerdida); });
          return tuvoRechazo||c.motivoPerdida;
        });
        var perdidosActuales=clientes.filter(function(c){ return c.etapa==="Perdido"; });
        var tasaRecuperacion=perdidosActuales.length+recuperados.length>0?Math.round((recuperados.length/(perdidosActuales.length+recuperados.length))*100):null;

        // ── DATOS PARA GRAFICAS ──────────────────────────────────────────────

        // Dona: cotizaciones vs ventas directas (sobre totales historicos)
        var totalCotHist=cotizaciones.filter(function(c){ return c.estatus==="Aceptada"; }).reduce(function(s,c){ return s+c.monto; },0);
        var totalVDHist=ventas.reduce(function(s,v){ return s+Number(v.monto); },0);
        var totalDona=totalCotHist+totalVDHist||1;
        var pctCot=Math.round((totalCotHist/totalDona)*100);
        var pctVD=100-pctCot;
        // SVG dona: radio=54, stroke=18, circunferencia=2*pi*54=339.3
        var circ=339.3;
        var dashCot=(pctCot/100)*circ;
        var dashVD=(pctVD/100)*circ;

        // Barras por mes , ultimos 6 meses
        var MESES_LABELS=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
        var mesesData=[];
        for(var mi=5;mi>=0;mi--){
          var fechaMes=new Date(HOY.getFullYear(),HOY.getMonth()-mi,1);
          var mes=fechaMes.getMonth(); var anio=fechaMes.getFullYear();
          var ingCotMes=cotizaciones.filter(function(c){ var d=parseFechaLocal(c.fecha); return c.estatus==="Aceptada"&&d.getMonth()===mes&&d.getFullYear()===anio; }).reduce(function(s,c){ return s+c.monto; },0);
          var ingVDMes=ventas.filter(function(v){ var d=parseFechaLocal(v.fecha); return d.getMonth()===mes&&d.getFullYear()===anio; }).reduce(function(s,v){ return s+Number(v.monto); },0);
          mesesData.push({label:MESES_LABELS[mes],total:ingCotMes+ingVDMes,mes:mes,anio:anio,esMesActual:mi===0});
        }
        var maxMes=Math.max.apply(null,mesesData.map(function(m){ return m.total; }).concat([1]));
        var mesActual=mesesData[5]; var mesAnterior=mesesData[4];
        var diaHoy2=HOY.getDate();
        var diaCorte2=Math.min(diaHoy2,new Date(mesAnterior.anio,mesAnterior.mes+1,0).getDate());
        var mesAnteriorParcial2=cotizaciones.filter(function(c){ var d=parseFechaLocal(c.fecha); return c.estatus==="Aceptada"&&d.getMonth()===mesAnterior.mes&&d.getFullYear()===mesAnterior.anio&&d.getDate()<=diaCorte2; }).reduce(function(s,c){ return s+c.monto; },0)
          +ventas.filter(function(v){ var d=parseFechaLocal(v.fecha); return d.getMonth()===mesAnterior.mes&&d.getFullYear()===mesAnterior.anio&&d.getDate()<=diaCorte2; }).reduce(function(s,v){ return s+Number(v.monto); },0);
        var cambioMes=(diaHoy2>=3&&mesAnteriorParcial2>0)?Math.round(((mesActual.total-mesAnteriorParcial2)/mesAnteriorParcial2)*100):null;

        return e("div",{style:{display:"flex",flexDirection:"column",gap:0}},

          // TOP BAR
          e("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginLeft:isMobile?-16:-48,marginRight:isMobile?-16:-48,marginTop:isMobile?-20:-40,padding:isMobile?"12px 16px":"14px 48px",background:C.bg}},
            e("div",{style:{display:"flex",gap:3,background:C.surfaceUp,border:"1px solid "+C.border,borderRadius:10,padding:3}},
              [["semana","Semana"],["mes","Mes"],["trimestre","Trimestre"],["todo","Todo"]].map(function(p){
                var activo=periodo===p[0];
                return e("button",{key:p[0],style:{padding:"5px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,background:activo?C.surface:"transparent",color:activo?C.text:C.textMuted,fontWeight:activo?600:400,boxShadow:activo?"0 1px 3px rgba(0,0,0,0.08)":"none",transition:"all 0.15s"},onClick:function(){ setPeriodo(p[0]); }},p[1]);
              })
            )
          ),

          // TITULO
          e("div",{style:{paddingTop:24,marginBottom:24}},
            e("div",{style:{fontSize:28,fontWeight:700,color:C.text,lineHeight:1.1,marginBottom:6}},"Así va tu negocio"),
            e("div",{style:{fontSize:14,color:C.textMuted,marginBottom:6}},"Una revisión de cómo estás vendiendo, no solo cuánto.")
          ),

          (function(){
            var cobradoMes=totalG+totalVD;
            var enJuego=cotsPeriodo.filter(function(c){ return c.estatus==="Pendiente"; }).reduce(function(s,c){ return s+c.monto; },0);
            var potencial=cobradoMes+enJuego;

            // ── CARD OSCURA 4 MÉTRICAS ──
            var stats=[
              {label:"Ya ganaste",val:"$"+cobradoMes.toLocaleString(),sub:"",color:"#4ADE80",ic:"💼"},
              {label:"Todavía tienes",val:"$"+enJuego.toLocaleString(),sub:"por cerrar",color:"#A78BFA",ic:null},
              {label:"Si das seguimiento hoy, podrías terminar el periodo con",val:"$"+potencial.toLocaleString(),sub:"",color:"#FBBF24",ic:"🏆"},
            ];

            // ── INSIGHTS DINÁMICOS (Lo que CLEO descubrió) ──
            var insights=[];
            // Recuperaciones
            if(recuperados.length>0){
              insights.push({ic:"🔄",color:"#DCFCE7",icBg:"#166534",titulo:recuperados.length===1?"Recuperaste 1 cliente perdido":"Recuperaste "+recuperados.length+" clientes perdidos",desc:tasaRecuperacion!==null?"El "+tasaRecuperacion+"% de los clientes que parecían perdidos volvieron. El seguimiento funciona.":"Esos clientes valían la pena. El seguimiento marcó la diferencia."});
            } else if(perdidosActuales.length>=3){
              insights.push({ic:"🔄",color:"#FEF3C7",icBg:"#92400E",titulo:perdidosActuales.length+" clientes perdidos sin recuperar",desc:"Algunos pueden volver si los contactas. Las situaciones cambian con el tiempo."});
            }
            if(promDiasCierre!==null){
              if(promDiasCierre===0) insights.push({ic:"⏱️",color:"#DCFCE7",icBg:"#166534",titulo:"Tus clientes deciden rápido",desc:"La mayoría de tus ventas se cierran el mismo día que envías el precio."});
              else if(promDiasCierre<=2) insights.push({ic:"⏱️",color:"#DCFCE7",icBg:"#166534",titulo:"Decisiones muy rápidas",desc:"Tus clientes deciden en "+promDiasCierre+" día"+(promDiasCierre>1?"s":"")+" en promedio. Tienes que estar listo desde el primer mensaje."});
              else insights.push({ic:"⏱️",color:"#DCFCE7",icBg:"#166534",titulo:"Tus clientes tardan "+promDiasCierre+" días",desc:"Haz seguimiento a los "+Math.round(promDiasCierre/2)+" días,antes de que se enfríe el interés."});
            }
            if(mejorCanalCierre&&mejorCanalCierre[1]>=2){
              var pctCanal=Math.round((mejorCanalCierre[1]/(clientes.filter(function(c){ return c.origen===mejorCanalCierre[0]; }).length||1))*100);
              insights.push({ic:"🎯",color:"#FCE7F3",icBg:"#9D174D",titulo:mejorCanalCierre[0]+" es tu mejor canal",desc:"El "+pctCanal+"% de tus clientes de ese canal terminan comprando. Es donde más cierras."});
            }
            if(motivoPrincipal){
              insights.push({ic:"⚠️",color:"#FEF3C7",icBg:"#92400E",titulo:'"'+motivoPrincipal+'" es la objeción más común',desc:"Apareció en el "+Math.round((cotsPeriodo.filter(function(c){ return c.motivoPerdida===motivoPrincipal; }).length/Math.max(cotsPeriodo.filter(function(c){ return c.estatus==="Rechazada"; }).length,1))*100)+"% de las cotizaciones que no cerraste."});
            }
            var saldosPend=aceptadas.reduce(function(s,cot){ var p=cot.pagos||[]; var pagado=p.reduce(function(x,pg){ return x+Number(pg.monto); },0); return s+(cot.monto-pagado>0?cot.monto-pagado:0); },0);
            if(saldosPend>0) insights.push({ic:"💼",color:"#DBEAFE",icBg:"#1E40AF",titulo:"Tienes $"+saldosPend.toLocaleString()+" pendientes de cobro",desc:"Son ventas ya cerradas que aún no has cobrado. Recuérdaselo a tu cliente."});
            if(prom>0) insights.push({ic:"📊",color:"#F3E8FF",icBg:"#6B21A8",titulo:"Tu ticket promedio es de $"+prom.toLocaleString(),desc:aceptadas.length>=3?"Está basado en tus últimas "+aceptadas.length+" ventas cerradas. Ese es tu punto de referencia.":"Con más ventas registradas CLEO podrá darte un análisis más preciso."});
            if(topConcepto&&topConcepto[1]>=2){
              var enCots=aceptadas.filter(function(c){ return c.concepto&&c.concepto.trim()===topConcepto[0]; }).length;
              var enVD=ventasPer.filter(function(v){ return v.concepto&&v.concepto.trim()===topConcepto[0]; }).length;
              var origen=enCots>0&&enVD>0?"cotizaciones y ventas rápidas":enCots>0?"cotizaciones":"ventas rápidas";
              var consejo=enCots>0&&enVD>0?"Funciona tanto en propuestas formales como en ventas al momento. Es tu producto estrella.":enCots>0?"Tus clientes lo aceptan bien cuando lo propones formalmente. Sigue incluyéndolo en tus cotizaciones.":"Tus clientes lo compran fácil y rápido. Tenlo siempre en mente cuando alguien pregunte.";
              insights.push({ic:"⭐",color:"#FEF9C3",icBg:"#713F12",titulo:'"'+topConcepto[0]+'" es lo que más vendes',desc:"Lo vendiste "+topConcepto[1]+" veces este periodo (vía "+origen+"). "+consejo});
            }
            var etAtas=["Cotizacion enviada","Negociacion"].map(function(et){ return {et:et,n:clientes.filter(function(c){ return c.etapa===et&&diasDesde(c.fechaEtapa||c.fecha)>=7; }).length}; }).sort(function(a,b){ return b.n-a.n; })[0];
            if(etAtas&&etAtas.n>=2) insights.push({ic:"🔍",color:"#FEE2E2",icBg:"#991B1B",titulo:etAtas.n+" clientes llevan +7 días sin avanzar",desc:"Están atascados en el proceso. Un mensaje directo puede desbloquear esas conversaciones."});
            if(insights.length===0) insights.push({ic:"🌱",color:"#DCFCE7",icBg:"#166534",titulo:"CLEO está aprendiendo tu negocio",desc:"Registra más ventas y conversaciones para ver patrones reales sobre cómo vendes."});

            // ── ACCIONES SEMANALES DINÁMICAS ──
            var acciones=[];
            var cotsPend=cotsPeriodo.filter(function(c){ return c.estatus==="Pendiente"; });
            if(cotsPend.length>0) acciones.push({n:1,ic:"💬",tipo:"cotizaciones_pendientes",titulo:"Contacta las "+cotsPend.length+" cotizacion"+(cotsPend.length>1?"es":"")+" pendiente"+(cotsPend.length>1?"s":""),desc:"Representan $"+enJuego.toLocaleString()+" posibles."});
            if(promDiasCierre!==null&&promDiasCierre<=2) acciones.push({n:acciones.length+1,ic:"📅",tipo:"seguimiento_48h",titulo:"Da seguimiento antes de 48 horas",desc:"Tus ventas más rápidas vienen de ahí."});
            else if(saldosPend>0) acciones.push({n:acciones.length+1,ic:"📅",tipo:"cobrar_saldo",titulo:"Cobra los $"+saldosPend.toLocaleString()+" pendientes",desc:"Ya cerraste la venta, ahora cierra el pago."});
            if(motivoPrincipal) acciones.push({n:acciones.length+1,ic:"🎯",tipo:"preparar_respuesta_objecion",titulo:"Prepara una respuesta para '"+motivoPrincipal+"'",desc:"Si lo tienes listo, no perderás la próxima vez."});
            else if(promDiasCierre!==null&&promDiasCierre===0) acciones.push({n:acciones.length+1,ic:"🎯",tipo:"enfocarse_cerrar_rapido",titulo:"Enfócate en cerrar rápido",desc:"Tus clientes deciden el mismo día. Mantén el ritmo."});
            else acciones.push({n:acciones.length+1,ic:"🎯",tipo:"registrar_motivo",titulo:"Registra el motivo cuando pierdas una venta",desc:"Con ese dato CLEO puede mostrarte qué mejorar."});
            acciones=acciones.slice(0,3);

            // Detectar si la acción principal lleva varios días repitiéndose sin resolverse
            var diasRepetidoAccion=1;
            (function(){
              if(!acciones[0]) return;
              try{
                var raw=localStorage.getItem("cleo_streak_accion_serv");
                var prev=raw?JSON.parse(raw):null;
                if(prev&&prev.tipo===acciones[0].tipo){
                  diasRepetidoAccion=prev.fecha===FECHA_HOY?(prev.dias||1):(prev.dias||1)+1;
                }
                localStorage.setItem("cleo_streak_accion_serv",JSON.stringify({tipo:acciones[0].tipo,dias:diasRepetidoAccion,fecha:FECHA_HOY}));
              }catch(e){}
            })();

            // ── MENSAJE DE ÁNIMO DINÁMICO ──
            var animo=cobradoMes>0&&tasa>=50?"Vas por buen camino. Sigue haciendo seguimiento rápido y este periodo puede ser tu mejor mes.":
              cobradoMes>0&&tasa>=30?"Estás generando ventas y tienes propuestas activas. Un par de cierres más y este periodo cambia por completo.":
              enJuego>0?"Tienes $"+enJuego.toLocaleString()+" esperando respuesta. Un mensaje a tiempo puede cerrar todo esto.":
              "Cada venta registrada es información valiosa. Los patrones empiezan a aparecer cuando más datos tienes.";

            return e("div",{style:{display:"flex",flexDirection:"column",gap:24}},

              // CARD OSCURA
              e("div",{style:{background:"#0F1729",borderRadius:24,padding:isMobile?"24px 20px":"28px 24px",position:"relative",overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,0.18)"}},
                e("div",{style:{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1px 1fr 1px 1fr",gap:isMobile?0:0,alignItems:"center"}},
                  stats.map(function(k,i){
                    var isLast=i===stats.length-1;
                    return [
                      e("div",{key:"s"+i,style:{padding:isMobile?"16px 8px":"0 10px",textAlign:"center",borderBottom:isMobile&&!isLast?"1px solid rgba(255,255,255,0.08)":"none"}},
                        e("div",{style:{fontSize:isMobile?11:11,color:"rgba(255,255,255,0.5)",letterSpacing:"0.2px",marginBottom:8,lineHeight:1.3}},k.label),
                        e("div",{style:{fontSize:isMobile?24:22,fontWeight:700,color:k.color,lineHeight:1,marginBottom:6,whiteSpace:"nowrap"}},k.val),
                        e("div",{style:{fontSize:isMobile?11:11,color:"rgba(255,255,255,0.35)",lineHeight:1.3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},k.sub)
                      ),
                      !isLast&&!isMobile?e("div",{key:"d"+i,style:{width:1,background:"rgba(255,255,255,0.08)",alignSelf:"stretch"}}):null
                    ];
                  }).flat().filter(Boolean)
                )
              ),


              e("div",{style:{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:20}},

              // CARD 3: LO QUE APRENDIÓ CLEO (insights + canales)
              e("div",{style:{background:C.surface,borderRadius:20,padding:"24px",border:"1px solid "+C.border,boxShadow:"0 2px 12px rgba(0,0,0,0.04)"}},
                e("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:6}},
                  e("div",{style:{width:28,height:28,borderRadius:8,background:C.purplePale,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}},"🧠"),
                  e("div",{style:{fontSize:11,fontWeight:700,color:C.purple,textTransform:"uppercase",letterSpacing:"1.5px"}},"Lo que aprendió CLEO")
                ),
                e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:20}},"Patrones de tus ventas este periodo"),
                insights.length>0&&e("div",{style:{display:"flex",flexDirection:"column",gap:10,marginBottom:20}},
                  insights.map(function(ins,i){
                    return e("div",{key:i,style:{background:C.bg,borderRadius:14,padding:"14px 16px",border:"1px solid "+C.border,display:"flex",gap:12,alignItems:"flex-start"}},
                      e("div",{style:{width:32,height:32,borderRadius:9,background:ins.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}},ins.ic),
                      e("div",null,
                        e("div",{style:{fontSize:13,fontWeight:600,color:C.text,marginBottom:3,lineHeight:1.3}},ins.titulo),
                        e("div",{style:{fontSize:12,color:C.textMuted,lineHeight:1.5}},ins.desc)
                      )
                    );
                  })
                ),
              ),

              e("div",{style:{display:"flex",flexDirection:"column",gap:20}},

              (function(){
                var totalClientes=clientes.filter(function(c){ return c.origen; }).length;
                if(totalClientes===0) return null;
                var canales=ORIGENES.map(function(o){
                  var total=clientes.filter(function(c){ return c.origen===o; }).length;
                  var convertidos=clientes.filter(function(c){ return c.origen===o&&c.etapa==="Ganado"; }).length;
                  var sinConvertir=total-convertidos;
                  return {canal:o,total:total,convertidos:convertidos,sinConvertir:sinConvertir};
                }).filter(function(c){ return c.total>0; }).sort(function(a,b){ return b.total-a.total; });
                if(canales.length===0) return null;
                return e("div",{style:{background:C.surface,borderRadius:20,padding:"24px",border:"1px solid "+C.border,boxShadow:"0 2px 12px rgba(0,0,0,0.04)"}},
                  e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px",marginBottom:12}},"De dónde vienen tus clientes"),
                  e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
                    canales.map(function(c){
                      var msg=c.convertidos===c.total&&c.total>0?"Todos cerraron — tu mejor canal":
                              c.sinConvertir>0?c.sinConvertir+" sin cerrar aún — dales seguimiento":
                              "Sin ventas registradas aún";
                      var color=c.convertidos===c.total&&c.total>0?C.green:c.sinConvertir>0?C.amber:C.textDim;
                      return e("div",{key:c.canal,style:{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:C.bg,borderRadius:10,border:"1px solid "+C.border}},
                        e("div",{style:{flex:1}},
                          e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},
                            e("span",{style:{fontSize:13,fontWeight:600,color:C.text}},c.canal),
                            e("span",{style:{fontSize:12,color:C.textMuted}},c.total+" cliente"+(c.total>1?"s":""))
                          ),
                          e("div",{style:{fontSize:11,color:color,marginTop:2}},msg)
                        )
                      );
                    })
                  )
                );
              })(),

              // CARD 4: TU PRÓXIMO PASO (una sola acción principal + secundarias discretas)
              e("div",{style:{background:C.surface,borderRadius:20,padding:"24px",border:"1px solid "+C.border,boxShadow:"0 2px 12px rgba(0,0,0,0.04)"}},
                e("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:6}},
                  e("div",{style:{width:28,height:28,borderRadius:8,background:"#DCFCE7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}},"🎯"),
                  e("div",{style:{fontSize:11,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:"1.5px"}},"Tu próximo paso")
                ),
                e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:20}},diasRepetidoAccion>=3?"Llevas "+diasRepetidoAccion+" días con esto pendiente. ¿Qué te está deteniendo?":"Esto es lo que más impacto tendría hoy."),
                acciones[0]&&e("div",{style:{background:"linear-gradient(135deg,#ECFDF5 0%,#F0FDF4 100%)",borderRadius:16,padding:"18px 20px",border:"1px solid #86EFAC",display:"flex",gap:14,alignItems:"flex-start",marginBottom:acciones.length>1?14:20}},
                  e("div",{style:{fontSize:26,flexShrink:0}},acciones[0].ic),
                  e("div",null,
                    e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:4,lineHeight:1.3}},acciones[0].titulo),
                    e("div",{style:{fontSize:13,color:C.textMuted,lineHeight:1.5}},acciones[0].desc)
                  )
                ),
                acciones.length>1&&e("div",{style:{marginBottom:20}},
                  e("div",{style:{fontSize:11,color:C.textDim,marginBottom:8}},"Si te sobra tiempo, también:"),
                  e("div",{style:{display:"flex",flexDirection:"column",gap:6}},
                    acciones.slice(1).map(function(ac){
                      return e("div",{key:ac.n,style:{display:"flex",gap:8,alignItems:"center",fontSize:12,color:C.textMuted}},
                        e("span",{style:{fontSize:13,flexShrink:0}},ac.ic),
                        e("span",null,ac.titulo)
                      );
                    })
                  )
                ),
                e("div",{style:{background:C.purplePale,borderRadius:12,padding:"14px 16px",border:"1px solid "+C.purple+"22",display:"flex",alignItems:"center",gap:12}},
                  e("div",{style:{fontSize:22,flexShrink:0}},"✨"),
                  e("div",{style:{fontSize:13,color:C.text,lineHeight:1.6}},animo)
                )
              ),

              ) // cierra columna 2 (canales + Tu próximo paso)

              ) // cierra grid Card3/Card4
              ,
              e("div",{style:{background:"#0F1729",borderRadius:14,padding:"12px 18px",display:"flex",alignItems:"center",gap:14,flexWrap:isMobile?"wrap":"nowrap"}},(function(){
                var todasFechas=[];
                ventas.forEach(function(v){ if(v.fecha) todasFechas.push(v.fecha.slice(0,10)); });
                cotizaciones.forEach(function(c){ if(c.fecha) todasFechas.push(c.fecha.slice(0,10)); });
                clientes.forEach(function(c){ if(c.fecha) todasFechas.push(c.fecha.slice(0,10)); });
                var fechasSet={}; todasFechas.forEach(function(f){ fechasSet[f]=true; });
                var hoyStr=fmtFechaLocal(HOY);
                var rachaActual=0;
                var d=new Date(HOY);
                for(var ri=0;ri<365;ri++){
                  var ds=fmtFechaLocal(d);
                  if(fechasSet[ds]) rachaActual++;
                  else if(ri>0) break;
                  d.setDate(d.getDate()-1);
                }
                var diasSinAct=0;
                var d2=new Date(HOY); d2.setDate(d2.getDate()-1);
                for(var ri2=0;ri2<365;ri2++){
                  if(fechasSet[fmtFechaLocal(d2)]) break;
                  diasSinAct++; d2.setDate(d2.getDate()-1);
                }
                var tieneHoy=!!fechasSet[hoyStr];
                var ultimos7=[];
                for(var ui=6;ui>=0;ui--){ var ud=new Date(HOY); ud.setDate(ud.getDate()-ui); ultimos7.push(fmtFechaLocal(ud)); }
                var horaActual=new Date().getHours();
                var esTarde=horaActual>=18;
                var mensajeRacha=(!tieneHoy&&esTarde&&rachaActual>=2)?"Se está acabando el día y aún no registras nada.":
                  rachaActual>=7?"¡Llevas "+rachaActual+" días seguidos activo en CLEO!":
                  rachaActual>=3?"Llevas "+rachaActual+" días registrando actividad.":
                  tieneHoy?"Hoy ya registraste actividad. Buen comienzo.":
                  diasSinAct===0?"Empieza hoy, registrar algo tarda menos de un minuto.":
                  diasSinAct===1?"Ayer no registraste nada. Hoy puedes retomar el ritmo.":
                  "Han pasado "+diasSinAct+" días desde tu última actividad.";
                var colorRacha=(!tieneHoy&&esTarde&&rachaActual>=2)?"#F87171":rachaActual>=7?"#FBBF24":rachaActual>=3?"#4ADE80":"#94A3B8";
                return [
                  e("div",{key:"e",style:{fontSize:20,flexShrink:0}},rachaActual>=7?"🔥":rachaActual>=3?"⚡":"🌱"),
                  e("div",{key:"n",style:{flexShrink:0}},
                    e("div",{style:{fontSize:16,fontWeight:800,color:colorRacha,lineHeight:1}},rachaActual+" días"),
                    e("div",{style:{fontSize:9,color:"rgba(255,255,255,0.35)",marginTop:1}},"de racha")
                  ),
                  e("div",{key:"s",style:{width:1,height:24,background:"rgba(255,255,255,0.1)",flexShrink:0}}),
                  e("div",{key:"m",style:{flex:1,fontSize:12,color:"rgba(255,255,255,0.55)",lineHeight:1.35,minWidth:150}},mensajeRacha),
                  e("div",{key:"h",style:{display:"flex",gap:4,flexShrink:0}},
                    ultimos7.map(function(f,i){
                      var activo=!!fechasSet[f];
                      var esHoy=f===hoyStr;
                      return e("div",{key:i,style:{width:14,height:14,borderRadius:4,background:activo?(esHoy?colorRacha:"rgba(75,94,252,0.6)"):"rgba(255,255,255,0.06)",border:esHoy?"1px solid "+colorRacha+"66":"none"}});
                    })
                  )
                ];
              })()),

            );
          })(),

        )
      })()
    ),// cierra padding div
    )// cierra contenido principal div
    ),// cierra body div

    // BOTTOM NAV , solo móvil
    isMobile&&e("div",{style:{position:"fixed",bottom:0,left:0,right:0,background:C.dark,borderTop:"1px solid "+C.darkBorder,display:"flex",zIndex:50,paddingBottom:"env(safe-area-inset-bottom,0px)"}},
      // 5 items según modo
      (esProductos?["inicio","hoy","prospectos","pedidos","ventas_productos"]:["inicio","hoy","trabajos","cotizaciones","pipeline"]).map(function(v){
        var activo=vista===v;
        var nBadge=0;
        if(v==="hoy") nBadge=contarPendientesHoy(clientes,cotizaciones,pedidos,esProductos);
        var labelShort={
          inicio:"Inicio",hoy:"Hoy",pipeline:"Seguim.",ventas:"Ingresos",cotizaciones:"Cotiz.",
          prospectos:"Oportun.",pedidos:"Pedidos",ventas_productos:"Ingresos"
        }[v]||NAV_LABELS_SHORT[v];
        return e("button",{key:v,style:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"10px 2px 8px",background:"none",border:"none",cursor:"pointer",position:"relative",gap:3,minHeight:56,overflow:"hidden"},onClick:function(){ setVista(v); setMostrarMas(false); }},
          v==="hoy"
            ? e("div",{style:{width:20,height:20,borderRadius:"50%",background:nBadge>0?C.red:"rgba(255,255,255,0.15)",display:"flex",alignItems:"center",justifyContent:"center"}},
                nBadge>0
                  ? e("span",{style:{fontSize:10,fontWeight:700,color:"#fff",lineHeight:1}},nBadge>9?"9+":nBadge)
                  : e("svg",{width:12,height:12,viewBox:"0 0 24 24",fill:"none",stroke:activo?"#fff":"rgba(255,255,255,0.45)",strokeWidth:2.5,strokeLinecap:"round"},e("path",{d:"M5 13l4 4L19 7"}))
              )
            : e("svg",{width:20,height:20,viewBox:"0 0 24 24",fill:"none",stroke:activo?"#fff":"rgba(255,255,255,0.45)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"},e("path",{d:NAV_SVG[v]||NAV_SVG["ventas"]||""})),
          e("span",{style:{fontSize:9,color:activo?"#fff":"rgba(255,255,255,0.45)",fontWeight:activo?600:400,lineHeight:1}},labelShort),
          activo&&e("div",{style:{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:20,height:2,background:C.purple,borderRadius:99}})
        );
      }),
      // Botón Más
      e("button",{style:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"10px 2px 8px",background:"none",border:"none",cursor:"pointer",gap:3,minHeight:56,position:"relative"},onClick:function(){ setMostrarMas(!mostrarMas); }},
        e("svg",{width:20,height:20,viewBox:"0 0 24 24",fill:"none",stroke:mostrarMas?"#fff":"rgba(255,255,255,0.45)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"},e("path",{d:"M5 12h.01M12 12h.01M19 12h.01"})),
        e("span",{style:{fontSize:9,color:mostrarMas?"#fff":"rgba(255,255,255,0.45)",fontWeight:mostrarMas?600:400,lineHeight:1}},"Más"),
        mostrarMas&&e("div",{style:{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:20,height:2,background:C.purple,borderRadius:99}})
      ),
      // Drawer "Más" — según modo
      mostrarMas&&e("div",{style:{position:"absolute",bottom:"100%",right:0,left:0,background:C.dark,border:"1px solid "+C.darkBorder,borderRadius:"14px 14px 0 0",padding:"8px"}},
        (esProductos?[
          {v:"clientes",icon:NAV_SVG["clientes"],label:"Clientes"},
          {v:"resumen",icon:NAV_SVG["resumen"],label:"Resumen"},
        ]:[
          {v:"clientes",icon:NAV_SVG["clientes"],label:NAV_LABELS["clientes"]},
          {v:"ventas",icon:NAV_SVG["ventas"],label:NAV_LABELS["ventas"]},
          {v:"resumen",icon:NAV_SVG["resumen"],label:NAV_LABELS["resumen"]},
        ]).map(function(item){
          var activo=vista===item.v;
          return e("button",{key:item.v,style:{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"12px 16px",background:activo?C.purple+"22":"none",border:"none",cursor:"pointer",borderRadius:10,marginBottom:2},onClick:function(){ setVista(item.v); setMostrarMas(false); }},
            e("svg",{width:18,height:18,viewBox:"0 0 24 24",fill:"none",stroke:activo?"#fff":"rgba(255,255,255,0.6)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"},e("path",{d:item.icon||""})),
            e("span",{style:{fontSize:13,color:activo?"#fff":"rgba(255,255,255,0.7)",fontWeight:activo?600:400}},item.label)
          );
        }),
        e("div",{style:{height:1,background:C.darkBorder,margin:"4px 0"}}),
        e("button",{style:{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"12px 16px",background:"none",border:"none",cursor:"pointer",borderRadius:10,marginBottom:2},onClick:function(){ setFormPerfil(Object.assign({},perfil)); setModalCatalogo(true); setMostrarMas(false); }},
          e("svg",{width:18,height:18,viewBox:"0 0 24 24",fill:"none",stroke:"rgba(255,255,255,0.6)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"},e("path",{d:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"})),
          e("span",{style:{fontSize:13,color:"rgba(255,255,255,0.7)"}},esProductos?"Mis productos":"Mi catálogo")
        ),
        e("button",{style:{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"12px 16px",background:"none",border:"none",cursor:"pointer",borderRadius:10},onClick:function(){ setFormPerfil(Object.assign({},perfil)); setModalPerfil(true); setMostrarMas(false); }},
          e("svg",{width:18,height:18,viewBox:"0 0 24 24",fill:"none",stroke:"rgba(255,255,255,0.6)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"},e("rect",{x:2,y:7,width:20,height:14,rx:2,ry:2}),e("path",{d:"M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"})),
          e("span",{style:{fontSize:13,color:"rgba(255,255,255,0.7)"}},"Mi negocio")
        ),
        e("button",{style:{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"12px 16px",background:"none",border:"none",cursor:"pointer",borderRadius:10},onClick:function(){ setModalCuenta(true); setMostrarMas(false); }},
          e("svg",{width:18,height:18,viewBox:"0 0 24 24",fill:"none",stroke:"rgba(255,255,255,0.6)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"},e("circle",{cx:12,cy:8,r:4}),e("path",{d:"M4 20c0-4 4-6 8-6s8 2 8 6"})),
          e("span",{style:{fontSize:13,color:"rgba(255,255,255,0.7)"}},"Mi cuenta")
        )
      )
    )
  ,

    e(ModalVenta,{modalVenta:modalVenta,setModalVenta:setModalVenta,formVenta:formVenta,setFormVenta:setFormVenta,pasoVenta:pasoVenta,setPasoVenta:setPasoVenta,clientes:clientes,setClientes:setClientes,guardarVentaDirecta:guardarVentaDirecta,avanzarVenta:avanzarVenta,st:st,productos:productos,sugerenciasConcepto:sugerenciasConcepto,setSugerenciasConcepto:setSugerenciasConcepto,esProductos:esProductos,servicios:servicios,productosCat:productosCat,cotAceptadaId:cotAceptadaId,setCotAceptadaId:setCotAceptadaId,etapaAnteriorGanado:etapaAnteriorGanado,setEtapaAnteriorGanado:setEtapaAnteriorGanado,FECHA_HOY:FECHA_HOY}),

    // PANEL MOVER , móvil pipeline
    isMobile&&moverClienteId&&(function(){
      var cMover=clientes.find(function(c){ return c.id===moverClienteId; });
      if(!cMover) return null;
      return e("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"flex-end"},onClick:function(){ setMoverClienteId(null); }},
        e("div",{style:{width:"100%",background:C.surface,borderRadius:"20px 20px 0 0",padding:"20px",paddingBottom:"env(safe-area-inset-bottom,20px)"},onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{width:36,height:4,borderRadius:2,background:C.border,margin:"0 auto 16px"}}),
          e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}},"Mover a etapa"),
          e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:20}},cMover.nombre),
          e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
            ETAPAS.filter(function(et){ return et!==cMover.etapa; }).map(function(et){
              var ec=ETAPA_COLOR[et]||C.purple;
              return e("button",{key:et,style:{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderRadius:14,border:"1px solid "+C.border,background:C.surface,cursor:"pointer",textAlign:"left"},onClick:function(){
                moverEtapa(cMover.id,et);
                setMoverClienteId(null);
              }},
                e("div",{style:{width:10,height:10,borderRadius:"50%",background:ec,flexShrink:0}}),
                e("div",{style:{fontSize:14,color:C.text,fontWeight:500}},ETAPAS_LABEL[et]||et)
              );
            })
          )
        )
      );
    })(),
    (function(){
      var nUrgF=contarPendientesHoy(clientes,cotizaciones,pedidos,esProductos);
      if(vista==="hoy"||isMobile) return null;
      return e("div",{style:{position:"fixed",bottom:24,right:24,zIndex:90}},
        e("button",{
          onClick:function(){ setVista("hoy"); },
          style:{
            width:56,height:56,borderRadius:"50%",
            background:nUrgF>0?C.purple:"rgba(83,74,183,0.3)",
            border:"none",cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:nUrgF>0?"0 4px 16px rgba(83,74,183,0.4)":"0 2px 8px rgba(0,0,0,0.1)",
            position:"relative",
            transition:"all 0.2s ease"
          }
        },
          e("span",{style:{fontSize:20,flexShrink:0}},"☀️"),
          nUrgF>0&&e("div",{style:{
            position:"absolute",top:-2,right:-2,
            width:20,height:20,borderRadius:"50%",
            background:C.red,color:"#fff",
            fontSize:11,fontWeight:700,
            display:"flex",alignItems:"center",justifyContent:"center",
            border:"2px solid "+C.dark
          }},nUrgF>9?"9+":nUrgF)
        )
      );
    })(),

    // MODAL SEGUIMIENTO POST-VENTA
    cotAceptadaId&&!String(cotAceptadaId).startsWith("pipeline_revert_")&&(function(){
      var esGanado=String(cotAceptadaId).startsWith("ganado_");
      var esDirecto=String(cotAceptadaId).startsWith("directo_");
      var clienteId=esGanado?Number(String(cotAceptadaId).replace("ganado_","")):esDirecto?Number(String(cotAceptadaId).replace("directo_","")):(cotizaciones.find(function(c){ return c.id===cotAceptadaId; })||{}).clienteId;
      var cl=clienteId?clientes.find(function(c){ return c.id===clienteId; }):null;
      var nombre=cl?cl.nombre.split(" ")[0]:"[nombre]";
      var cotCl=cl?cotizaciones.find(function(c){ return c.clienteId===cl.id&&c.estatus==="Aceptada"; }):null;
      var mensajesPorDias={
        "15":"Hola "+nombre+", espero que todo haya quedado como esperabas. Si conoces a alguien que pueda necesitar lo que hago, me ayudaria mucho que me recomendaras.",
        "30":"Hola "+nombre+", como has estado? Si en algun momento necesitas algo o surge algo nuevo, aqui estoy.",
        "60":"Hola "+nombre+", queria saludar y ver si hay algo en lo que pueda apoyarte.",
        "90":"Hola "+nombre+", por aqui si necesitas algo."
      };
      var msgReferido="Hola "+nombre+", muchas gracias por tu confianza. Si conoces a alguien que pueda necesitar lo que hago, me ayudaria mucho que me recomendaras. Gracias!";
      var urlReferido=cl&&cl.contacto?"https://wa.me/52"+cl.contacto+"?text="+encodeURIComponent(msgReferido):null;

      function cerrarModal(){
        var clienteSinOrigen=cl&&!cl.origen?cl.id:null;
        setCotAceptadaId(null); setDiasPostVenta("30"); setEtapaAnteriorGanado(null);
        setPasoGanado(1); setPagoGanado({tipo:"",monto:"",fecha:FECHA_HOY});
        if(clienteSinOrigen) setOrigenPromptId(clienteSinOrigen);
      }
      function guardarPagoYSiguiente(){
        // Guardar pago en cotizacion si existe
        if(cotCl&&pagoGanado.tipo){
          if(pagoGanado.tipo==="completo"){
            setCotizaciones(cotizaciones.map(function(c){ return c.id===cotCl.id?Object.assign({},c,{fechaCierre:FECHA_HOY,pagos:[...(cotCl.pagos||[]),{id:"p_"+Date.now(),monto:cotCl.monto,fecha:pagoGanado.fecha,concepto:"Pago completo"}]}):c; }));
          } else if(pagoGanado.tipo==="anticipo"&&pagoGanado.monto){
            setCotizaciones(cotizaciones.map(function(c){ return c.id===cotCl.id?Object.assign({},c,{fechaCierre:FECHA_HOY,pagos:[...(cotCl.pagos||[]),{id:"p_"+Date.now(),monto:Number(pagoGanado.monto),fecha:pagoGanado.fecha,concepto:"Anticipo"}]}):c; }));
          }
        }
        // Guardar razon de cierre en el cliente
        if(razonCierre.length>0&&cl){
          setClientes(clientes.map(function(c){ return c.id===cl.id?Object.assign({},c,{razonCierre:razonCierre}):c; }));
        }
        setPasoGanado(2);
      }

      // INDICADOR DE PASOS
      var headerPasos=e("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}},
        e("div",{style:{display:"flex",gap:6,alignItems:"center"}},
          [1,2,3].map(function(n){
            return e("div",{key:n,style:{
              width:n===pasoGanado?24:8,height:8,borderRadius:20,
              background:n===pasoGanado?C.purple:n<pasoGanado?C.green:C.border,
              transition:"all 0.2s"
            }});
          })
        ),
        pasoGanado===3&&e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:20,lineHeight:1,padding:"0 4px"},onClick:cancelarGanado},"×")
      );

      // PASO 1 , FELICIDADES + POR QUE COMPRO + PAGO
      if(pasoGanado===1) return e("div",{style:st.ov,onClick:cancelarGanado},
        e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",overflowY:"auto"}),onClick:function(ev){ ev.stopPropagation(); }},

          // HEADER
          e("div",{style:{position:"relative",padding:"28px 24px 24px",textAlign:"center",background:"linear-gradient(135deg,#ECFDF5 0%,#D1FAE5 100%)",borderBottom:"1px solid #6EE7B7"}},
            e("button",{style:{position:"absolute",top:14,right:14,background:"rgba(255,255,255,0.7)",border:"1px solid #6EE7B7",cursor:"pointer",color:C.textDim,fontSize:16,lineHeight:1,padding:"6px 10px",borderRadius:10},onClick:cancelarGanado},"×"),
            e("div",{style:{fontSize:40,marginBottom:8}},"🎉"),
            e("div",{style:{fontSize:11,fontWeight:700,color:"#10B981",textTransform:"uppercase",letterSpacing:"1px",marginBottom:6}},"Venta cerrada"),
            e("div",{style:{fontSize:20,fontWeight:700,color:C.text,lineHeight:1.3}},
              "¡Cerraste con "+(cl?cl.nombre:"este cliente")+"!"
            )
          ),

          // BODY
          e("div",{style:{padding:"20px 24px",display:"flex",flexDirection:"column",gap:20,overflowY:"auto",overflowX:"hidden",maxHeight:"60vh"}},

            // POR QUÉ COMPRÓ
            e("div",null,
              e("div",{style:{fontSize:14,fontWeight:600,color:C.text,marginBottom:2}},"¿Por qué crees que compró?"),
              e("div",{style:{fontSize:12,color:C.textDim,marginBottom:12}},"Opcional,en 5 ventas CLEO te dirá qué está funcionando."),
              e("div",{style:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}},
                [{k:"Confianza",e:"🤝"},{k:"Precio justo",e:"💰"},{k:"Rapidez",e:"⚡"},{k:"Recomendacion",e:"👥"},{k:"Seguimiento",e:"📩"},{k:"Calidad",e:"✨"}].map(function(r){
                  var activo=razonCierre.indexOf(r.k)>=0;
                  return e("button",{key:r.k,
                    style:{cursor:"pointer",padding:"8px 4px",minHeight:44,borderRadius:10,border:"1.5px solid "+(activo?C.purple:C.border),background:activo?C.purple:"transparent",fontSize:12,color:activo?"#fff":C.textMuted,fontWeight:activo?600:400,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1.3},
                    onClick:function(){
                      if(activo) setRazonCierre(razonCierre.filter(function(x){ return x!==r.k; }));
                      else setRazonCierre([...razonCierre,r.k]);
                    }
                  },r.e+" "+r.k);
                })
              ),
              razonCierre.length>0&&(function(){
                var feedbacks={"Recomendacion":"Las recomendaciones cierran 4x más rápido. ¿Ya le pediste un referido?","Seguimiento":"El seguimiento funcionó. Eso separa a los que cierran de los que no.","Confianza":"La confianza se construye con consistencia. Sigue así.","Precio justo":"Cerraron por precio justo, no por barato. Hay diferencia.","Rapidez":"La rapidez fue tu diferenciador. Los clientes valoran no esperar.","Calidad":"La calidad habla sola. Probablemente te va a recomendar."};
                var fb=feedbacks[razonCierre[0]];
                if(!fb) return null;
                return e("div",{style:{fontSize:12,color:C.textMuted,lineHeight:1.6,padding:"10px 12px",background:C.surfaceUp,borderRadius:8,borderLeft:"2px solid "+C.purple,marginTop:10}},fb);
              })()
            ),

            // PAGO
            e("div",null,
              e("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}},
                e("div",{style:{fontSize:14,fontWeight:600,color:C.text}},"¿Cómo quedó el pago?"),
                cotCl&&e("div",{style:{fontSize:13,color:C.textMuted}},"Cotizado: ",e("span",{style:{fontWeight:700,color:C.purple}},"$"+Number(cotCl.monto).toLocaleString()))
              ),
              e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
                [{k:"completo",l:"💵 Pagado completo",d:"Ya recibiste el 100%"},{k:"anticipo",l:"💰 Recibí un anticipo",d:"Hay un saldo pendiente"},{k:"pendiente",l:"⏳ Queda pendiente",d:"Aún no ha pagado nada"}].map(function(op){
                  var activo=pagoGanado.tipo===op.k;
                  return e("button",{key:op.k,
                    style:{cursor:"pointer",padding:"12px 14px",borderRadius:10,border:"1.5px solid "+(activo?C.purple:C.border),background:activo?C.purplePale:"transparent",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.1s"},
                    onClick:function(){ setPagoGanado(Object.assign({},pagoGanado,{tipo:op.k,monto:""})); }
                  },
                    e("div",null,
                      e("div",{style:{fontSize:13,fontWeight:600,color:activo?C.purple:C.text}},op.l),
                      e("div",{style:{fontSize:12,color:C.textDim,marginTop:1}},op.d)
                    ),
                    activo&&e("div",{style:{width:20,height:20,borderRadius:"50%",background:C.purple,display:"flex",alignItems:"center",justifyContent:"center"}},
                      e("svg",{width:11,height:11,viewBox:"0 0 12 12",fill:"none"},e("path",{d:"M2 6l3 3 5-5",stroke:"#fff",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"}))
                    )
                  );
                })
              ),
              pagoGanado.tipo==="anticipo"&&e("div",{style:{marginTop:12}},
                e("label",{style:{fontSize:12,color:C.textDim,display:"block",marginBottom:6,fontWeight:500}},"Monto del anticipo"),
                e(MontoInput,{value:pagoGanado.monto,onChange:function(ev){ setPagoGanado(Object.assign({},pagoGanado,{monto:ev.target.value})); },placeholder:"0",style:st.inp})
              ),
              (pagoGanado.tipo==="completo"||pagoGanado.tipo==="anticipo")&&e("div",{style:{marginTop:12}},
                e("label",{style:{fontSize:12,color:C.textDim,display:"block",marginBottom:6,fontWeight:500}},"Fecha de pago"),
              e("input",{type:"date",value:pagoGanado.fecha,onChange:function(ev){ setPagoGanado(Object.assign({},pagoGanado,{fecha:ev.target.value})); },style:Object.assign({},st.inp,{width:"100%",maxWidth:"100%",boxSizing:"border-box",display:"block",minWidth:0,WebkitAppearance:"none"})})
              )
            )
          ),

          // FOOTER
          e("div",{style:{padding:"16px 24px",borderTop:"1px solid "+C.border,display:"flex",justifyContent:"flex-end",background:C.surfaceUp,position:"sticky",bottom:0,zIndex:1}},
            e("button",{style:Object.assign({},st.btnP,{opacity:pagoGanado.tipo===""||( pagoGanado.tipo==="anticipo"&&!pagoGanado.monto)?0.4:1}),
              disabled:pagoGanado.tipo===""||( pagoGanado.tipo==="anticipo"&&!pagoGanado.monto),
              onClick:guardarPagoYSiguiente
            },"Continuar →")
          )
        )
      );

      // PASO 2 , REFERIDO
      if(pasoGanado===2) return e("div",{style:st.ov},
        e("div",{style:st.modal,onClick:function(ev){ ev.stopPropagation(); }},
          headerPasos,
          e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:16,lineHeight:1.6}},"Los clientes satisfechos casi siempre están dispuestos a recomendarte, pero rara vez lo hacen solos. No porque no quieran, sino porque nadie les preguntó. Tu siguiente venta puede venir de aquí."),
          e("div",{style:{marginBottom:20,padding:"14px 16px",background:C.green+"0D",borderRadius:10,border:"0.5px solid "+C.green+"33"}},
            e("div",{style:{fontSize:12,color:C.green,fontWeight:600,marginBottom:8}},"Hazlo ahora , tarda 30 segundos"),
            e("div",{style:{fontSize:12,color:C.textMuted,marginBottom:10,lineHeight:1.5}},'"'+msgReferido+'"'),
            urlReferido
              ? e("a",{href:urlReferido,target:"_blank",rel:"noreferrer",
                  style:{display:"inline-flex",alignItems:"center",gap:8,padding:"10px 16px",borderRadius:8,background:C.green,color:"#fff",fontSize:13,fontWeight:600,textDecoration:"none",cursor:"pointer",marginBottom:12}
                },e(SvgWA,{size:14}),"Pedir referido a "+nombre)
              : e("div",{style:{fontSize:12,color:C.textMuted,marginBottom:12,padding:"8px 12px",background:C.surfaceUp,borderRadius:8}},"Manda este mensaje por WhatsApp, Instagram o como prefieras a "+nombre+"."),
            e("div",{style:{padding:"10px 12px",background:C.amber+"0D",borderRadius:8,border:"0.5px solid "+C.amber+"33"}},
              e("div",{style:{fontSize:11,color:C.amber,fontWeight:600,marginBottom:3}},"💡 Tip para conseguir más referidos"),
              e("div",{style:{fontSize:11,color:C.text,lineHeight:1.6,marginBottom:4}},"Agrega un incentivo y tu cliente tendrá algo concreto que ofrecer:"),
              e("div",{style:{fontSize:11,color:C.textMuted,fontStyle:"italic",lineHeight:1.6}},'"Dile que viene de tu parte y le doy un descuento en su primer pedido."')
            )
          ),
          e("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"}},
            e("button",{style:st.btn,onClick:function(){ setPasoGanado(3); }},"Ahora no , siguiente"),
            e("button",{style:st.btnP,onClick:function(){ setPasoGanado(3); }},"Ya lo hice →")
          )
        )
      );

      // PASO 3 , SEGUIMIENTO
      return e("div",{style:st.ov},
        e("div",{style:st.modal,onClick:function(ev){ ev.stopPropagation(); }},
          headerPasos,
          !esProductos&&e("div",{style:{fontSize:12,color:C.green,fontWeight:600,marginBottom:14,padding:"9px 12px",background:C.green+"12",borderRadius:8}},"Ya quedó en tu pestaña Trabajos, para que no se te olvide entregarlo."),
          e("div",{style:{fontSize:14,fontWeight:600,color:C.text,marginBottom:4}},"¿Cuándo quieres volver a escribirle?"),
          e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:16,lineHeight:1.65}},"Un cliente que ya te compró tiene 5 veces más probabilidades de volverte a comprar que uno nuevo. No dejes que se enfríe la relación."),
          e("div",{style:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:10}},
            [{k:"15",l:"15 días",hint:"Pedir referido"},{k:"30",l:"30 días",hint:"Ver si necesita algo"},{k:"60",l:"60 días",hint:"Proyecto nuevo"},{k:"90",l:"90 días",hint:"Mantenerte presente"}].map(function(op){
              var activo=diasPostVenta===op.k;
              return e("button",{key:op.k,style:{cursor:"pointer",padding:"8px 6px",borderRadius:10,border:"0.5px solid "+(activo?C.purple:C.border),background:activo?C.purple:"transparent",textAlign:"center"},onClick:function(){ setDiasPostVenta(op.k); }},
                e("div",{style:{fontSize:12,fontWeight:600,color:activo?"#fff":C.text,lineHeight:1.2}},op.l),
                e("div",{style:{fontSize:10,color:activo?"rgba(255,255,255,0.7)":C.textDim,marginTop:2}},op.hint)
              );
            })
          ),
          e("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:12}},
            e("div",{style:{fontSize:11,color:C.textDim}},"O en"),
            e("input",{type:"number",placeholder:"45",
              value:["15","30","60","90"].indexOf(diasPostVenta)>=0?"":diasPostVenta,
              onChange:function(ev){ setDiasPostVenta(ev.target.value); },
              style:{width:60,padding:"5px 8px",borderRadius:8,border:"1px solid "+C.border,background:C.surface,color:C.text,fontSize:13,textAlign:"center"}
            }),
            e("div",{style:{fontSize:11,color:C.textDim}},"días personalizados")
          ),
          diasPostVenta&&e("div",{style:{marginBottom:16,padding:"12px 14px",background:C.surfaceUp,borderRadius:8,borderLeft:"2px solid "+C.purple}},
            e("div",{style:{fontSize:11,color:C.textMuted,marginBottom:4}},"Qué le puedes decir cuando llegue el momento"),
            e("div",{style:{fontSize:13,color:C.text,lineHeight:1.6}},mensajesPorDias[diasPostVenta]||mensajesPorDias["30"])
          ),
          e("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"}},
            e("button",{style:st.btn,onClick:function(){
              if(cl){ var f=new Date(); f.setDate(f.getDate()+30); setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{seguimientoFecha:fmtFechaLocal(f)}):x; })); }
              cerrarModal();
            }},"Ahora no , recordame en 30 dias"),
            e("button",{style:st.btnP,onClick:function(){
              if(cl){ var f=new Date(); f.setDate(f.getDate()+Number(diasPostVenta)); setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{seguimientoFecha:fmtFechaLocal(f)}):x; })); }
              cerrarModal();
            }},"Programar seguimiento")
          )
        )
      );
    })(),

        // MODAL SUGERENCIA CLEO (botón Contactar desde Inicio)
    pasoPregunto&&(function(){
      var fp=formPregunto;
      var nombreCorto=fp.nombre?fp.nombre.split(" ")[0]:"";
      var dupPaso1=pasoPregunto===1&&fp.nombre.trim().length>1&&(function(){
        var nl=fp.nombre.trim().toLowerCase();
        return clientes.find(function(c){
          var cl=c.nombre.trim().toLowerCase();
          return cl===nl||cl.indexOf(nl)===0||nl.indexOf(cl)===0;
        });
      })();
      var coincidenciasNombre1=pasoPregunto===1&&fp.nombre.trim().length>0&&!fp.clienteExistenteId
        ?clientes.filter(function(c){ return c.nombre.toLowerCase().indexOf(fp.nombre.trim().toLowerCase())===0; }).slice(0,5)
        :[];
      function elegirClienteExistente1(c){
        var servicioGuardado=c.servicioInteres||c.notas||"";
        var svCatalogo=servicios.find(function(sv){ return sv.nombre===servicioGuardado; });
        setFormPregunto(Object.assign({},fp,{
          nombre:c.nombre,negocio:c.negocio||"",
          canal:c.canalPrincipal||"",contacto:c.contacto||"",instagram:c.instagram||"",messenger:c.messenger||"",
          servicioInteres:servicioGuardado,
          monto:svCatalogo?String(svCatalogo.precio):"",
          clienteExistenteId:c.id
        }));
        setMostrarCoincidencias1(false);
      }
      var canalElegido=!!fp.canal;
      var paso2Completo=canalElegido&&(fp.canal!=="WhatsApp"||!fp.contacto||fp.contacto.length===10);
      return e("div",{style:st.ov,onClick:cerrarPregunto},
        e("div",{style:Object.assign({},st.modal,{maxWidth:460}),onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{display:"flex",justifyContent:"flex-end",marginBottom:pasoPregunto===1?8:0}},
            e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:20,lineHeight:1,padding:"0 4px"},onClick:cerrarPregunto},"×")
          ),

          // PASO 1: persona y negocio
          pasoPregunto===1&&e("div",null,
            e("div",{style:{fontSize:14,fontWeight:700,color:C.purple,marginBottom:18,lineHeight:1.4}},"¡Qué bien! No dejemos que esa conversación se enfríe."),
            e("div",{style:{marginBottom:6}},e("label",{style:st.lbl},"¿Quién mostró interés?")),
            e("div",{style:{position:"relative"}},
              e("input",{
                value:fp.nombre,
                onChange:function(ev){ setFormPregunto(Object.assign({},fp,{nombre:ev.target.value,clienteExistenteId:""})); },
                onFocus:function(){ setMostrarCoincidencias1(true); },
                onBlur:function(){ setTimeout(function(){ setMostrarCoincidencias1(false); },150); },
                placeholder:"Nombre de la persona",style:st.inp,autoFocus:true
              }),
              mostrarCoincidencias1&&coincidenciasNombre1.length>0&&e("div",{style:{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:C.surface,border:"1px solid "+C.border,borderRadius:10,marginTop:4,boxShadow:"0 4px 12px rgba(0,0,0,0.08)",overflow:"hidden"}},
                coincidenciasNombre1.map(function(c){
                  return e("button",{key:c.id,style:{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:C.text},onClick:function(){ elegirClienteExistente1(c); }},c.nombre+" · "+(ETAPAS_LABEL[c.etapa]||c.etapa));
                })
              )
            ),
            fp.clienteExistenteId&&e("div",{style:{marginTop:6,fontSize:12,color:C.purple,fontWeight:600}},"✓ Usando los datos que ya tenías de "+fp.nombre.split(" ")[0]),
            dupPaso1&&dupPaso1.etapa==="Nuevo contacto"&&e("div",{style:{marginTop:8,padding:"10px 12px",background:C.purplePale,border:"1px solid "+C.purple+"33",borderRadius:10,fontSize:12,color:C.text,lineHeight:1.5}},
              "Ya tienes a ",e("b",null,dupPaso1.nombre)," registrado, sin haberle enviado precio todavía. ¿Es la misma persona?",
              e("div",{style:{display:"flex",gap:8,marginTop:8}},
                e("button",{style:{cursor:"pointer",padding:"7px 12px",borderRadius:8,border:"none",background:C.purple,fontSize:12,color:"#fff",fontWeight:600},onClick:function(){
                  var servicioGuardado=dupPaso1.servicioInteres||dupPaso1.notas||"";
                  var svCatalogo=servicios.find(function(sv){ return sv.nombre===servicioGuardado; });
                  setFormPregunto(Object.assign({},fp,{
                    nombre:dupPaso1.nombre,negocio:dupPaso1.negocio||"",
                    canal:dupPaso1.canalPrincipal||"",contacto:dupPaso1.contacto||"",instagram:dupPaso1.instagram||"",messenger:dupPaso1.messenger||"",
                    servicioInteres:servicioGuardado,
                    monto:svCatalogo?String(svCatalogo.precio):"",
                    clienteExistenteId:dupPaso1.id
                  }));
                  setPasoPregunto(3);
                }},"Sí, continuar con sus datos"),
                e("button",{style:{cursor:"pointer",padding:"7px 12px",borderRadius:8,border:"1px solid "+C.border,background:"transparent",fontSize:12,color:C.textMuted},onClick:function(){}},"No, es alguien distinto")
              )
            ),
            dupPaso1&&dupPaso1.etapa!=="Nuevo contacto"&&e("div",{style:{marginTop:8,padding:"8px 12px",background:"#FFFBEB",border:"1px solid #FCD34D",borderRadius:10,fontSize:12,color:"#92400E",lineHeight:1.4}},
              "Ya existe un cliente parecido: ",e("b",null,dupPaso1.nombre)," (",ETAPAS_LABEL[dupPaso1.etapa]||dupPaso1.etapa,"). Si es la misma persona, mejor edítalo desde su ficha."
            ),
            e("div",{style:{marginTop:14,marginBottom:6}},e("label",{style:st.lbl},"Nombre de su negocio (si tiene)")),
            e("input",{value:fp.negocio,onChange:function(ev){ setFormPregunto(Object.assign({},fp,{negocio:ev.target.value})); },placeholder:"Opcional",style:st.inp}),
            e("div",{style:{fontSize:12,color:C.textDim,marginTop:8,marginBottom:20,lineHeight:1.5}},"Con su nombre es suficiente. El negocio puedes agregarlo después."),
            e("button",{style:Object.assign({},st.btnP,{width:"100%",opacity:fp.nombre.trim()?1:0.4}),disabled:!fp.nombre.trim(),onClick:function(){ setPasoPregunto(2); }},"Continuar")
          ),

          // PASO 2: contacto
          pasoPregunto===2&&e("div",null,
            e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:16}},"¿Por dónde hablaste con "+nombreCorto+"?"),
            e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}},
              CANALES.map(function(canal){
                var cc=canalColor(canal);
                var activo=fp.canal===canal;
                return e("button",{key:canal,style:{cursor:"pointer",padding:"10px 6px",borderRadius:10,border:"1.5px solid "+(activo?cc:C.border),background:activo?cc+"18":"transparent",fontSize:12,color:activo?cc:C.textMuted,fontWeight:activo?600:400,display:"flex",flexDirection:"column",alignItems:"center",gap:4},onClick:function(){ setFormPregunto(Object.assign({},fp,{canal:canal})); }},
                  e(SvgIcon,{canal:canal,size:16}),canal
                );
              })
            ),
            fp.canal==="WhatsApp"&&e("div",{style:{marginBottom:14}},
              e("label",{style:st.lbl},"¿Cuál es su número?"),
              e("input",{value:fp.contacto,onChange:function(ev){ var v=ev.target.value.replace(/\D/g,"").slice(0,10); setFormPregunto(Object.assign({},fp,{contacto:v})); },placeholder:"Número de WhatsApp",style:st.inp,maxLength:10,inputMode:"numeric"}),
              fp.contacto&&fp.contacto.length>0&&fp.contacto.length<10&&e("div",{style:{fontSize:11,color:"#E53E3E",marginTop:4}},"Faltan "+(10-fp.contacto.length)+" dígitos"),
              e("div",{style:{fontSize:11,color:C.textDim,marginTop:6}},"Así podrás abrir la conversación directamente desde CLEO.")
            ),
            fp.canal==="Instagram"&&e("div",{style:{marginBottom:14}},
              e("label",{style:st.lbl},"¿Cuál es su usuario de Instagram?"),
              e("input",{value:fp.instagram,onChange:function(ev){ setFormPregunto(Object.assign({},fp,{instagram:ev.target.value})); },placeholder:"@usuario",style:st.inp})
            ),
            fp.canal==="Facebook"&&e("div",{style:{marginBottom:14}},
              e("label",{style:st.lbl},"¿Cómo encuentras su perfil en Facebook?"),
              e("input",{value:fp.messenger,onChange:function(ev){ setFormPregunto(Object.assign({},fp,{messenger:ev.target.value})); },placeholder:"Nombre, usuario o enlace del perfil",style:st.inp})
            ),
            e("div",{style:{fontSize:11,color:C.textDim,marginBottom:16,lineHeight:1.5}},"Puedes guardarlo sin este dato, pero CLEO no podrá abrir la conversación directamente."),
            e("div",{style:{display:"flex",gap:8}},
              e("button",{style:Object.assign({},st.btn,{flex:1}),onClick:function(){ setFormPregunto(Object.assign({},fp,{contacto:"",instagram:"",messenger:""})); setPasoPregunto(3); }},"Agregar después"),
              e("button",{style:Object.assign({},st.btnP,{flex:1,opacity:paso2Completo?1:0.4}),disabled:!paso2Completo,onClick:function(){ setPasoPregunto(3); }},"Continuar")
            )
          ),

          // PASO 3: interes
          pasoPregunto===3&&e("div",null,
            e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:16}},"¿Qué servicio le interesó a "+nombreCorto+"?"),
            e("div",{style:{position:"relative",marginBottom:14}},
              e("input",{
                value:fp.servicioInteres,
                onChange:function(ev){ setFormPregunto(Object.assign({},fp,{servicioInteres:ev.target.value})); },
                onFocus:function(){ setMostrarCatPregunto(true); },
                onBlur:function(){ setTimeout(function(){ setMostrarCatPregunto(false); },150); },
                placeholder:servicios.length>0?"Escribe o elige del catálogo":"Ej. Diseño de logotipo, sesión fotográfica o reparación",
                style:st.inp,
                autoFocus:true
              }),
              mostrarCatPregunto&&servicios.length>0&&(function(){
                var coincidenciasSv=fp.servicioInteres.trim().length>0
                  ?servicios.filter(function(sv){ return sv.nombre.toLowerCase().indexOf(fp.servicioInteres.trim().toLowerCase())>=0; })
                  :servicios;
                if(coincidenciasSv.length===0) return null;
                return e("div",{style:{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:C.surface,border:"1px solid "+C.border,borderRadius:10,marginTop:4,boxShadow:"0 4px 12px rgba(0,0,0,0.08)",overflow:"hidden",maxHeight:200,overflowY:"auto"}},
                  coincidenciasSv.map(function(sv){
                    return e("button",{key:sv.id,style:{display:"flex",justifyContent:"space-between",width:"100%",textAlign:"left",padding:"9px 12px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:C.text},onClick:function(){ setFormPregunto(Object.assign({},fp,{servicioInteres:sv.nombre,monto:String(sv.precio)})); setMostrarCatPregunto(false); }},
                      e("span",null,sv.nombre),
                      e("span",{style:{color:C.textMuted}},"$"+Number(sv.precio).toLocaleString())
                    );
                  })
                );
              })()
            ),
            e("div",{style:{marginTop:14,marginBottom:6}},e("label",{style:st.lbl},"Guarda algo importante de la conversación (opcional)")),
            e("textarea",{value:fp.notaAdicional,onChange:function(ev){ setFormPregunto(Object.assign({},fp,{notaAdicional:ev.target.value})); },placeholder:"Ej. Necesita el logotipo antes de agosto y quiere una imagen moderna.",style:Object.assign({},st.inp,{minHeight:60,resize:"vertical"})}),
            e("div",{style:{fontSize:11,color:C.textDim,marginTop:8,marginBottom:20,lineHeight:1.5}},"Anota solamente lo que necesitarás recordar cuando vuelvas a hablarle."),
            e("button",{style:Object.assign({},st.btnP,{width:"100%",opacity:fp.servicioInteres.trim()?1:0.4}),disabled:!fp.servicioInteres.trim(),onClick:function(){ setPasoPregunto(4); }},"Continuar")
          ),

          // PASO 4: precio
          pasoPregunto===4&&e("div",null,
            e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:16}},fp.clienteExistenteId?"¿Le vas a enviar el precio ahora?":"¿Ya le enviaste un precio?"),
            fp.yaEnvio===null&&e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
              e("button",{style:Object.assign({},st.btn,{textAlign:"left"}),onClick:function(){ setFormPregunto(Object.assign({},fp,{yaEnvio:true})); }},fp.clienteExistenteId?"Sí, se lo voy a enviar ahora":"Sí, ya se lo envié"),
              e("button",{style:Object.assign({},st.btn,{textAlign:"left"}),onClick:function(){ setFormPregunto(Object.assign({},fp,{yaEnvio:false})); }},fp.clienteExistenteId?"Todavía no, más adelante":"No, todavía no")
            ),
            fp.yaEnvio===true&&e("div",null,
              e("div",{style:{fontSize:13,color:C.purple,fontWeight:600,marginBottom:16}},"Buen paso. Ahora conviene asegurarnos de que lo revise."),
              e("div",{style:{marginBottom:6}},e("label",{style:st.lbl},"¿Cuánto le cotizaste?")),
              e(MontoInput,{value:fp.monto,onChange:function(ev){ setFormPregunto(Object.assign({},fp,{monto:ev.target.value})); },placeholder:"0",style:st.inp}),
              e("div",{style:{marginTop:14,marginBottom:6}},e("label",{style:st.lbl},"¿Cuándo se lo enviaste? (opcional)")),
              e("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}},
                [{k:"hoy",l:"Hoy"},{k:"ayer",l:"Ayer"},{k:"elegir",l:"Elegir fecha"}].map(function(op){
                  var activo=fp.fechaEnvio===op.k;
                  return e("button",{key:op.k,style:{cursor:"pointer",padding:"7px 12px",borderRadius:10,border:"1.5px solid "+(activo?C.purple:C.border),background:activo?C.purple:"transparent",fontSize:12,color:activo?"#fff":C.textMuted},onClick:function(){ setFormPregunto(Object.assign({},fp,{fechaEnvio:op.k})); }},op.l);
                })
              ),
              fp.fechaEnvio==="elegir"&&e("input",{type:"date",value:fp.fechaEnvioCustom,onChange:function(ev){ setFormPregunto(Object.assign({},fp,{fechaEnvioCustom:ev.target.value})); },style:Object.assign({},st.inp,{marginBottom:10})}),
              e("div",{style:{marginTop:8,marginBottom:6}},e("label",{style:st.lbl},"¿Cuándo conviene preguntarle si lo revisó?")),
              e("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}},
                [{k:"manana",l:"Mañana"},{k:"2dias",l:"En 2 días"},{k:"3dias",l:"En 3 días"},{k:"elegir",l:"Elegir otra fecha"}].map(function(op){
                  var activo=fp.fechaSeguimiento===op.k;
                  return e("button",{key:op.k,style:{cursor:"pointer",padding:"7px 12px",borderRadius:10,border:"1.5px solid "+(activo?C.purple:C.border),background:activo?C.purple:"transparent",fontSize:12,color:activo?"#fff":C.textMuted},onClick:function(){ setFormPregunto(Object.assign({},fp,{fechaSeguimiento:op.k})); }},op.l);
                })
              ),
              fp.fechaSeguimiento==="elegir"&&e("input",{type:"date",value:fp.fechaSeguimientoCustom,onChange:function(ev){ setFormPregunto(Object.assign({},fp,{fechaSeguimientoCustom:ev.target.value})); },style:Object.assign({},st.inp,{marginBottom:16})}),
              e("button",{style:Object.assign({},st.btnP,{width:"100%",opacity:(fp.monto&&fp.fechaSeguimiento)?1:0.4}),disabled:!(fp.monto&&fp.fechaSeguimiento),onClick:guardarPregunto},"Continuar")
            ),
            fp.yaEnvio===false&&e("div",null,
              e("div",{style:{fontSize:13,color:C.purple,fontWeight:600,marginBottom:16}},"Enviar el precio puede ser el siguiente paso."),
              e("div",{style:{marginBottom:10}},e("label",{style:st.lbl},"¿Cuándo quieres enviárselo?")),
              e("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}},
                [{k:"hoy",l:"Hoy"},{k:"manana",l:"Mañana"},{k:"3dias",l:"En 3 días"},{k:"elegir",l:"Elegir otra fecha"}].map(function(op){
                  var activo=fp.fechaEnvioPlaneada===op.k;
                  return e("button",{key:op.k,style:{cursor:"pointer",padding:"7px 12px",borderRadius:10,border:"1.5px solid "+(activo?C.purple:C.border),background:activo?C.purple:"transparent",fontSize:12,color:activo?"#fff":C.textMuted},onClick:function(){ setFormPregunto(Object.assign({},fp,{fechaEnvioPlaneada:op.k})); }},op.l);
                })
              ),
              fp.fechaEnvioPlaneada==="elegir"&&e("input",{type:"date",value:fp.fechaEnvioPlaneadaCustom,onChange:function(ev){ setFormPregunto(Object.assign({},fp,{fechaEnvioPlaneadaCustom:ev.target.value})); },style:Object.assign({},st.inp,{marginBottom:16})}),
              e("button",{style:Object.assign({},st.btnP,{width:"100%",marginTop:16,opacity:fp.fechaEnvioPlaneada?1:0.4}),disabled:!fp.fechaEnvioPlaneada,onClick:guardarPregunto},"Continuar")
            )
          ),

          // PASO 5: confirmacion
          pasoPregunto===5&&(function(){
            var negocioTxt=fp.negocio?", de "+fp.negocio+",":"";
            var mensajeFinal;
            if(fp.yaEnvio){
              var fechaSeg=resolverFechaPregunto(fp.fechaSeguimiento,fp.fechaSeguimientoCustom);
              mensajeFinal="A "+nombreCorto+negocioTxt+" le interesa "+fp.servicioInteres+". Le enviaste un precio de $"+Number(fp.monto).toLocaleString()+". "+fraseDia(fechaSeg)+" aparecerá entre tus conversaciones por retomar.";
            } else {
              var fechaEnv=resolverFechaPregunto(fp.fechaEnvioPlaneada,fp.fechaEnvioPlaneadaCustom);
              mensajeFinal="A "+nombreCorto+negocioTxt+" le interesa "+fp.servicioInteres+". "+fraseDia(fechaEnv)+" te recordaremos enviarle el precio.";
            }
            var clienteSimulado={nombre:fp.nombre,contacto:fp.contacto,canalPrincipal:fp.canal,instagram:fp.instagram,messenger:fp.messenger};
            var urlFinal=fp.canal?contactUrl(clienteSimulado,"Hola "+nombreCorto+"!"):null;
            return e("div",null,
              e("div",{style:{fontSize:16,fontWeight:700,color:C.green,marginBottom:12}},"Listo, esta propuesta no se va a perder."),
              e("div",{style:{fontSize:13,color:C.text,lineHeight:1.6,marginBottom:20,background:C.bg,padding:"14px 16px",borderRadius:10,border:"1px solid "+C.border}},mensajeFinal),
              e("div",{style:{display:"flex",gap:8}},
                urlFinal&&e("a",{href:urlFinal,target:"_blank",rel:"noreferrer",style:{flex:1,textAlign:"center",textDecoration:"none",cursor:"pointer",padding:"10px 16px",borderRadius:10,border:"none",background:C.purple,fontSize:13,color:"#fff",fontWeight:600},onClick:cerrarPregunto},"Abrir "+fp.canal),
                e("button",{style:Object.assign({},st.btn,{flex:urlFinal?1:2}),onClick:cerrarPregunto},"Terminar")
              )
            );
          })()
        )
      );
    })(),
    pasoPreguntoP&&(function(){
      var fp=formPreguntoP;
      var nombreCorto=fp.nombre?fp.nombre.split(" ")[0]:"";
      var canalElegido=!!fp.canal;
      var paso2Completo=canalElegido&&(fp.canal!=="WhatsApp"||!fp.contacto||fp.contacto.length===10);
      var coincidenciasNombre1P=fp.nombre.trim().length>0&&!fp.clienteExistenteId
        ?clientes.filter(function(c){ return c.nombre.toLowerCase().indexOf(fp.nombre.trim().toLowerCase())===0; }).slice(0,5)
        :[];
      function elegirClienteExistente1P(c){
        var prodCatalogoSel=productosCat.find(function(p){ return p.nombre===c.productoInteres; });
        setFormPreguntoP(Object.assign({},fp,{
          nombre:c.nombre,negocio:c.negocio||"",
          canal:c.canalPrincipal||"",contacto:c.contacto||"",instagram:c.instagram||"",messenger:c.messenger||"",
          productoInteres:c.productoInteres||"",
          monto:prodCatalogoSel?String(prodCatalogoSel.precio):(c.precioInteres||""),
          cantidadInteres:c.cantidadInteres||"1",
          clienteExistenteId:c.id
        }));
        setMostrarCoincidencias1P(false);
      }
      // Catálogo unificado de productos, igual criterio que crearOportunidad()
      var catalogoUnificadoP=[];
      productosCat.forEach(function(sv){ catalogoUnificadoP.push({nombre:sv.nombre,precio:sv.precio}); });
      productos.forEach(function(p){
        if(!catalogoUnificadoP.find(function(x){ return x.nombre===p; })){ catalogoUnificadoP.push({nombre:p,precio:""}); }
      });
      return e("div",{style:st.ov,onClick:cerrarPreguntoP},
        e("div",{style:Object.assign({},st.modal,{maxWidth:460}),onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{display:"flex",justifyContent:"flex-end",marginBottom:pasoPreguntoP===1?8:0}},
            e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:20,lineHeight:1,padding:"0 4px"},onClick:cerrarPreguntoP},"×")
          ),

          // PASO 1: persona y negocio
          pasoPreguntoP===1&&e("div",null,
            e("div",{style:{fontSize:14,fontWeight:700,color:C.purple,marginBottom:18,lineHeight:1.4}},"¡Qué bien! No dejemos que esa oportunidad se enfríe."),
            e("div",{style:{marginBottom:6}},e("label",{style:st.lbl},"¿Quién mostró interés?")),
            e("div",{style:{position:"relative"}},
              e("input",{
                value:fp.nombre,
                onChange:function(ev){ setFormPreguntoP(Object.assign({},fp,{nombre:ev.target.value,clienteExistenteId:""})); },
                onFocus:function(){ setMostrarCoincidencias1P(true); },
                onBlur:function(){ setTimeout(function(){ setMostrarCoincidencias1P(false); },150); },
                placeholder:"Nombre de la persona",style:st.inp,autoFocus:true
              }),
              mostrarCoincidencias1P&&coincidenciasNombre1P.length>0&&e("div",{style:{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:C.surface,border:"1px solid "+C.border,borderRadius:10,marginTop:4,boxShadow:"0 4px 12px rgba(0,0,0,0.08)",overflow:"hidden"}},
                coincidenciasNombre1P.map(function(c){
                  return e("button",{key:c.id,style:{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:C.text},onClick:function(){ elegirClienteExistente1P(c); }},c.nombre+(c.estadoProspecto==="Nueva"?" (oportunidad nueva)":c.estadoProspecto==="En seguimiento"?" (en seguimiento)":c.estadoProspecto==="Convertido"?" (ya compró)":""));
                })
              )
            ),
            fp.clienteExistenteId&&e("div",{style:{marginTop:6,fontSize:12,color:C.purple,fontWeight:600}},"✓ Usando los datos que ya tenías de "+fp.nombre.split(" ")[0]),
            e("div",{style:{marginTop:14,marginBottom:6}},e("label",{style:st.lbl},"Nombre de su negocio (si tiene)")),
            e("input",{value:fp.negocio,onChange:function(ev){ setFormPreguntoP(Object.assign({},fp,{negocio:ev.target.value})); },placeholder:"Opcional",style:st.inp}),
            e("div",{style:{fontSize:12,color:C.textDim,marginTop:8,marginBottom:20,lineHeight:1.5}},"Con su nombre es suficiente. El negocio puedes agregarlo después."),
            e("button",{style:Object.assign({},st.btnP,{width:"100%",opacity:fp.nombre.trim()?1:0.4}),disabled:!fp.nombre.trim(),onClick:function(){ setPasoPreguntoP(2); }},"Continuar")
          ),

          // PASO 2: contacto
          pasoPreguntoP===2&&e("div",null,
            e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:16}},"¿Por dónde hablaste con "+nombreCorto+"?"),
            e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}},
              CANALES.map(function(canal){
                var cc=canalColor(canal);
                var activo=fp.canal===canal;
                return e("button",{key:canal,style:{cursor:"pointer",padding:"10px 6px",borderRadius:10,border:"1.5px solid "+(activo?cc:C.border),background:activo?cc+"18":"transparent",fontSize:12,color:activo?cc:C.textMuted,fontWeight:activo?600:400,display:"flex",flexDirection:"column",alignItems:"center",gap:4},onClick:function(){ setFormPreguntoP(Object.assign({},fp,{canal:canal})); }},
                  e(SvgIcon,{canal:canal,size:16}),canal
                );
              })
            ),
            fp.canal==="WhatsApp"&&e("div",{style:{marginBottom:14}},
              e("label",{style:st.lbl},"¿Cuál es su número?"),
              e("input",{value:fp.contacto,onChange:function(ev){ var v=ev.target.value.replace(/\D/g,"").slice(0,10); setFormPreguntoP(Object.assign({},fp,{contacto:v})); },placeholder:"Número de WhatsApp",style:st.inp,maxLength:10,inputMode:"numeric"}),
              fp.contacto&&fp.contacto.length>0&&fp.contacto.length<10&&e("div",{style:{fontSize:11,color:"#E53E3E",marginTop:4}},"Faltan "+(10-fp.contacto.length)+" dígitos"),
              e("div",{style:{fontSize:11,color:C.textDim,marginTop:6}},"Así podrás abrir la conversación directamente desde CLEO.")
            ),
            fp.canal==="Instagram"&&e("div",{style:{marginBottom:14}},
              e("label",{style:st.lbl},"¿Cuál es su usuario de Instagram?"),
              e("input",{value:fp.instagram,onChange:function(ev){ setFormPreguntoP(Object.assign({},fp,{instagram:ev.target.value})); },placeholder:"@usuario",style:st.inp})
            ),
            fp.canal==="Facebook"&&e("div",{style:{marginBottom:14}},
              e("label",{style:st.lbl},"¿Cómo encuentras su perfil en Facebook?"),
              e("input",{value:fp.messenger,onChange:function(ev){ setFormPreguntoP(Object.assign({},fp,{messenger:ev.target.value})); },placeholder:"Nombre, usuario o enlace del perfil",style:st.inp})
            ),
            e("div",{style:{fontSize:11,color:C.textDim,marginBottom:16,lineHeight:1.5}},"Puedes guardarlo sin este dato, pero CLEO no podrá abrir la conversación directamente."),
            e("div",{style:{display:"flex",gap:8}},
              e("button",{style:Object.assign({},st.btn,{flex:1}),onClick:function(){ setFormPreguntoP(Object.assign({},fp,{contacto:"",instagram:"",messenger:""})); setPasoPreguntoP(3); }},"Agregar después"),
              e("button",{style:Object.assign({},st.btnP,{flex:1,opacity:paso2Completo?1:0.4}),disabled:!paso2Completo,onClick:function(){ setPasoPreguntoP(3); }},"Continuar")
            )
          ),

          // PASO 3: producto de interes
          pasoPreguntoP===3&&e("div",null,
            e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:16}},"¿Qué producto le interesó a "+nombreCorto+"?"),
            e("div",{style:{position:"relative",marginBottom:14}},
              e("input",{
                value:fp.productoInteres,
                onChange:function(ev){ setFormPreguntoP(Object.assign({},fp,{productoInteres:ev.target.value})); },
                onFocus:function(){ setMostrarCatPreguntoP(true); },
                onBlur:function(){ setTimeout(function(){ setMostrarCatPreguntoP(false); },150); },
                placeholder:catalogoUnificadoP.length>0?"Escribe o elige del catálogo":"Ej. Pastel de 3 leches, playera talla M",
                style:st.inp,
                autoFocus:true
              }),
              mostrarCatPreguntoP&&catalogoUnificadoP.length>0&&(function(){
                var coincidenciasP=fp.productoInteres.trim().length>0
                  ?catalogoUnificadoP.filter(function(sv){ return sv.nombre.toLowerCase().indexOf(fp.productoInteres.trim().toLowerCase())>=0; })
                  :catalogoUnificadoP;
                if(coincidenciasP.length===0) return null;
                return e("div",{style:{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:C.surface,border:"1px solid "+C.border,borderRadius:10,marginTop:4,boxShadow:"0 4px 12px rgba(0,0,0,0.08)",overflow:"hidden",maxHeight:200,overflowY:"auto"}},
                  coincidenciasP.map(function(sv){
                    return e("button",{key:sv.nombre,style:{display:"flex",justifyContent:"space-between",width:"100%",textAlign:"left",padding:"9px 12px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:C.text},onClick:function(){ setFormPreguntoP(Object.assign({},fp,{productoInteres:sv.nombre,monto:sv.precio?String(sv.precio):fp.monto})); setMostrarCatPreguntoP(false); }},
                      e("span",null,sv.nombre),
                      sv.precio&&e("span",{style:{color:C.textMuted}},"$"+Number(sv.precio).toLocaleString())
                    );
                  })
                );
              })()
            ),
            e("div",{style:{marginTop:14,marginBottom:6}},e("label",{style:st.lbl},"Guarda algo importante de la conversación (opcional)")),
            e("textarea",{value:fp.notaAdicional,onChange:function(ev){ setFormPreguntoP(Object.assign({},fp,{notaAdicional:ev.target.value})); },placeholder:"Ej. Lo quiere en color azul, para entregar antes del viernes.",style:Object.assign({},st.inp,{minHeight:60,resize:"vertical"})}),
            e("div",{style:{fontSize:11,color:C.textDim,marginTop:8,marginBottom:20,lineHeight:1.5}},"Anota solamente lo que necesitarás recordar cuando vuelvas a hablarle."),
            e("button",{style:Object.assign({},st.btnP,{width:"100%",opacity:fp.productoInteres.trim()?1:0.4}),disabled:!fp.productoInteres.trim(),onClick:function(){ setPasoPreguntoP(4); }},"Continuar")
          ),

          // PASO 4: precio
          pasoPreguntoP===4&&e("div",null,
            e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:16}},"¿Ya le enviaste un precio?"),
            fp.yaEnvio===null&&e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
              e("button",{style:Object.assign({},st.btn,{textAlign:"left"}),onClick:function(){ setFormPreguntoP(Object.assign({},fp,{yaEnvio:true})); }},"Sí, ya se lo envié"),
              e("button",{style:Object.assign({},st.btn,{textAlign:"left"}),onClick:function(){ setFormPreguntoP(Object.assign({},fp,{yaEnvio:false})); }},"Todavía no")
            ),
            fp.yaEnvio===true&&e("div",null,
              e("label",{style:st.lbl},"¿Por cuánto?"),
              e(MontoInput,{value:fp.monto,onChange:function(ev){ setFormPreguntoP(Object.assign({},fp,{monto:ev.target.value})); },placeholder:"0",style:Object.assign({},st.inp,{marginBottom:16})}),
              e("button",{style:Object.assign({},st.btnP,{width:"100%",opacity:fp.monto?1:0.4}),disabled:!fp.monto,onClick:guardarPreguntoP},"Guardar")
            ),
            fp.yaEnvio===false&&e("div",null,
              e("div",{style:{fontSize:13,color:C.purple,fontWeight:600,marginBottom:16}},"Enviar el precio puede ser el siguiente paso."),
              e("div",{style:{marginBottom:10}},e("label",{style:st.lbl},"¿Cuándo quieres enviárselo?")),
              e("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}},
                [{k:"hoy",l:"Hoy"},{k:"manana",l:"Mañana"},{k:"3dias",l:"En 3 días"},{k:"elegir",l:"Elegir otra fecha"}].map(function(op){
                  var activo=fp.fechaEnvioPlaneada===op.k;
                  return e("button",{key:op.k,style:{cursor:"pointer",padding:"7px 12px",borderRadius:10,border:"1.5px solid "+(activo?C.purple:C.border),background:activo?C.purple:"transparent",fontSize:12,color:activo?"#fff":C.textMuted},onClick:function(){ setFormPreguntoP(Object.assign({},fp,{fechaEnvioPlaneada:op.k})); }},op.l);
                })
              ),
              fp.fechaEnvioPlaneada==="elegir"&&e("input",{type:"date",value:fp.fechaEnvioPlaneadaCustom,onChange:function(ev){ setFormPreguntoP(Object.assign({},fp,{fechaEnvioPlaneadaCustom:ev.target.value})); },style:Object.assign({},st.inp,{marginBottom:16})}),
              e("button",{style:Object.assign({},st.btnP,{width:"100%",marginTop:16,opacity:fp.fechaEnvioPlaneada?1:0.4}),disabled:!fp.fechaEnvioPlaneada,onClick:function(){ guardarPreguntoP(); }},"Continuar")
            )
          ),

          // PASO 5: confirmacion
          pasoPreguntoP===5&&(function(){
            var mensajeFinal="A "+nombreCorto+" le interesa "+fp.productoInteres+"."+(fp.yaEnvio&&fp.monto?" Le enviaste un precio de $"+Number(fp.monto).toLocaleString()+".":" Quedó registrado como oportunidad nueva.");
            var urlFinal=contactUrl({canalPrincipal:fp.canal,contacto:fp.contacto,instagram:fp.instagram,messenger:fp.messenger},"Hola "+nombreCorto+"!");
            return e("div",null,
              e("div",{style:{fontSize:16,fontWeight:700,color:C.green,marginBottom:12}},"Listo, ya quedó en tus oportunidades."),
              e("div",{style:{background:C.surfaceUp,borderRadius:10,padding:"14px 16px",marginBottom:20,fontSize:13,color:C.text,lineHeight:1.6}},mensajeFinal),
              e("div",{style:{display:"flex",gap:8}},
                urlFinal&&e("a",{href:urlFinal,target:"_blank",rel:"noreferrer",style:{flex:1,textAlign:"center",textDecoration:"none",cursor:"pointer",padding:"10px 16px",borderRadius:10,border:"none",background:C.purple,fontSize:13,color:"#fff",fontWeight:600},onClick:cerrarPreguntoP},"Abrir "+fp.canal),
                e("button",{style:Object.assign({},st.btn,{flex:urlFinal?1:2}),onClick:cerrarPreguntoP},"Terminar")
              )
            );
          })()
        )
      );
    })(),
    modalEnvie&&(function(){
      var fe=formEnvie;
      var coincidencias=fe.busqueda.trim().length>0&&!fe.clienteId
        ?clientes.filter(function(c){ return c.nombre.toLowerCase().indexOf(fe.busqueda.trim().toLowerCase())===0; }).slice(0,5)
        :[];
      var listo=fe.busqueda.trim().length>0&&fe.concepto.trim().length>0&&fe.monto;

      if(clienteCompletarId){
        var clCompletar=clientes.find(function(c){ return c.id===clienteCompletarId; });
        return e("div",{style:st.ov,onClick:cerrarEnvie},
          e("div",{style:Object.assign({},st.modal,{maxWidth:420}),onClick:function(ev){ ev.stopPropagation(); }},
            e("div",{style:{fontSize:15,fontWeight:700,color:C.green,marginBottom:6}},"✓ Precio registrado"),
            e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:18,lineHeight:1.5}},"¿Por dónde le puedes escribir a "+(clCompletar?clCompletar.nombre.split(" ")[0]:"")+"?"),
            renderCompletarContacto(),
            e("div",{style:{display:"flex",gap:8,marginTop:6}},
              e("button",{style:Object.assign({},st.btn,{flex:1}),onClick:function(){ omitirCompletarContacto(); cerrarEnvie(); }},"Omitir por ahora"),
              e("button",{style:Object.assign({},st.btnP,{flex:1,opacity:puedeGuardarCompletar()?1:0.4}),disabled:!puedeGuardarCompletar(),onClick:function(){ guardarCompletarContacto(clienteCompletarId); cerrarEnvie(); }},"Guardar")
            )
          )
        );
      }

      return e("div",{style:st.ov,onClick:cerrarEnvie},
        e("div",{style:Object.assign({},st.modal,{maxWidth:420}),onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{display:"flex",justifyContent:"flex-end",marginBottom:8}},
            e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:20,lineHeight:1,padding:"0 4px"},onClick:cerrarEnvie},"×")
          ),
          e("div",{style:{fontSize:14,fontWeight:700,color:C.purple,marginBottom:18,lineHeight:1.4}},"Buen paso. Dejemos programado el seguimiento."),

          e("div",{style:{marginBottom:14,position:"relative"}},
            e("label",{style:st.lbl},"¿A quién le enviaste un precio?"),
            fe.clienteId
              ? e("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",borderRadius:10,background:C.purplePale,border:"1px solid "+C.purple+"33"}},
                  e("span",{style:{fontSize:13,color:C.purple,fontWeight:600}},"✓ "+fe.busqueda),
                  e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textMuted,fontSize:12,fontWeight:500},onClick:function(){ setFormEnvie(Object.assign({},fe,{clienteId:null,busqueda:""})); }},"Cambiar")
                )
              : e("input",{value:fe.busqueda,onChange:function(ev){ setFormEnvie(Object.assign({},fe,{busqueda:ev.target.value})); },placeholder:"Escribe su nombre",style:st.inp,autoFocus:true}),
            coincidencias.length>0&&e("div",{style:{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:C.surface,border:"1px solid "+C.border,borderRadius:10,marginTop:4,boxShadow:"0 4px 12px rgba(0,0,0,0.08)",overflow:"hidden"}},
              coincidencias.map(function(c){
                return e("button",{key:c.id,style:{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:C.text},onClick:function(){
                  var servicioGuardado=c.servicioInteres||c.notas||"";
                  var svCatalogo=servicios.find(function(sv){ return sv.nombre===servicioGuardado; });
                  setFormEnvie(Object.assign({},fe,{clienteId:c.id,busqueda:c.nombre,concepto:servicioGuardado||fe.concepto,monto:svCatalogo?String(svCatalogo.precio):fe.monto}));
                }},c.nombre);
              })
            ),
            !fe.clienteId&&fe.busqueda.trim().length>0&&coincidencias.length===0&&e("div",{style:{fontSize:11,color:C.textDim,marginTop:4}},"Se registrará como cliente nuevo.")
          ),

          e("div",{style:{marginBottom:14,position:"relative"}},
            e("label",{style:st.lbl},"¿Qué le cotizaste?"),
            e("input",{
              value:fe.concepto,
              onChange:function(ev){ setFormEnvie(Object.assign({},fe,{concepto:ev.target.value})); },
              onFocus:function(){ setMostrarCatEnvie(true); },
              onBlur:function(){ setTimeout(function(){ setMostrarCatEnvie(false); },150); },
              placeholder:servicios.length>0?"Escribe o elige del catálogo":"Ej. Diseño de logotipo",
              style:st.inp
            }),
            mostrarCatEnvie&&servicios.length>0&&(function(){
              var coincidenciasSv=fe.concepto.trim().length>0
                ?servicios.filter(function(sv){ return sv.nombre.toLowerCase().indexOf(fe.concepto.trim().toLowerCase())>=0; })
                :servicios;
              if(coincidenciasSv.length===0) return null;
              return e("div",{style:{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:C.surface,border:"1px solid "+C.border,borderRadius:10,marginTop:4,boxShadow:"0 4px 12px rgba(0,0,0,0.08)",overflow:"hidden",maxHeight:200,overflowY:"auto"}},
                coincidenciasSv.map(function(sv){
                  return e("button",{key:sv.id,style:{display:"flex",justifyContent:"space-between",width:"100%",textAlign:"left",padding:"9px 12px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:C.text},onClick:function(){ setFormEnvie(Object.assign({},fe,{concepto:sv.nombre,monto:String(sv.precio)})); setMostrarCatEnvie(false); }},
                    e("span",null,sv.nombre),
                    e("span",{style:{color:C.textMuted}},"$"+Number(sv.precio).toLocaleString())
                  );
                })
              );
            })()
          ),

          e("div",{style:{marginBottom:20}},
            e("label",{style:st.lbl},"¿Cuánto?"),
            e(MontoInput,{value:fe.monto,onChange:function(ev){ setFormEnvie(Object.assign({},fe,{monto:ev.target.value})); },placeholder:"0",style:st.inp})
          ),

          e("div",{style:{fontSize:11,color:C.textDim,marginBottom:16,lineHeight:1.5}},"Te lo recordaremos en 2 días para preguntar si lo revisó."),

          e("button",{style:Object.assign({},st.btnP,{width:"100%",opacity:listo?1:0.4}),disabled:!listo,onClick:guardarEnvie},"Registrar")
        )
      );
    })(),
    modalEnvieP&&(function(){
      var fe=formEnvieP;
      var coincidencias=fe.busqueda.trim().length>0&&!fe.clienteId
        ?clientes.filter(function(c){ return c.nombre.toLowerCase().indexOf(fe.busqueda.trim().toLowerCase())===0; }).slice(0,5)
        :[];
      var listo=fe.busqueda.trim().length>0&&fe.concepto.trim().length>0&&fe.monto;

      if(clienteCompletarId){
        var clCompletarP=clientes.find(function(c){ return c.id===clienteCompletarId; });
        return e("div",{style:st.ov,onClick:cerrarEnvieP},
          e("div",{style:Object.assign({},st.modal,{maxWidth:420}),onClick:function(ev){ ev.stopPropagation(); }},
            e("div",{style:{fontSize:15,fontWeight:700,color:C.green,marginBottom:6}},"✓ Precio registrado"),
            e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:18,lineHeight:1.5}},"¿Por dónde le puedes escribir a "+(clCompletarP?clCompletarP.nombre.split(" ")[0]:"")+"?"),
            renderCompletarContacto(),
            e("div",{style:{display:"flex",gap:8,marginTop:6}},
              e("button",{style:Object.assign({},st.btn,{flex:1}),onClick:function(){ omitirCompletarContacto(); cerrarEnvieP(); }},"Omitir por ahora"),
              e("button",{style:Object.assign({},st.btnP,{flex:1,opacity:puedeGuardarCompletar()?1:0.4}),disabled:!puedeGuardarCompletar(),onClick:function(){ guardarCompletarContacto(clienteCompletarId); cerrarEnvieP(); }},"Guardar")
            )
          )
        );
      }

      return e("div",{style:st.ov,onClick:cerrarEnvieP},
        e("div",{style:Object.assign({},st.modal,{maxWidth:420}),onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{display:"flex",justifyContent:"flex-end",marginBottom:8}},
            e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:20,lineHeight:1,padding:"0 4px"},onClick:cerrarEnvieP},"×")
          ),
          e("div",{style:{fontSize:14,fontWeight:700,color:C.purple,marginBottom:18,lineHeight:1.4}},"Buen paso. Dejemos programado el seguimiento."),

          e("div",{style:{marginBottom:14,position:"relative"}},
            e("label",{style:st.lbl},"¿A quién le enviaste un precio?"),
            fe.clienteId
              ? e("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",borderRadius:10,background:C.purplePale,border:"1px solid "+C.purple+"33"}},
                  e("span",{style:{fontSize:13,color:C.purple,fontWeight:600}},"✓ "+fe.busqueda),
                  e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textMuted,fontSize:12,fontWeight:500},onClick:function(){ setFormEnvieP(Object.assign({},fe,{clienteId:null,busqueda:""})); }},"Cambiar")
                )
              : e("input",{value:fe.busqueda,onChange:function(ev){ setFormEnvieP(Object.assign({},fe,{busqueda:ev.target.value})); },placeholder:"Escribe su nombre",style:st.inp,autoFocus:true}),
            coincidencias.length>0&&e("div",{style:{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:C.surface,border:"1px solid "+C.border,borderRadius:10,marginTop:4,boxShadow:"0 4px 12px rgba(0,0,0,0.08)",overflow:"hidden"}},
              coincidencias.map(function(c){
                return e("button",{key:c.id,style:{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:C.text},onClick:function(){
                  var productoGuardado=c.productoInteres||"";
                  var prodCatalogo=productosCat.find(function(p){ return p.nombre===productoGuardado; });
                  setFormEnvieP(Object.assign({},fe,{clienteId:c.id,busqueda:c.nombre,concepto:productoGuardado||fe.concepto,monto:prodCatalogo?String(prodCatalogo.precio):(c.precioInteres||fe.monto)}));
                }},c.nombre+(c.estadoProspecto==="Nueva"?" (oportunidad nueva)":c.estadoProspecto==="En seguimiento"?" (en seguimiento)":""));
              })
            ),
            !fe.clienteId&&fe.busqueda.trim().length>0&&coincidencias.length===0&&e("div",{style:{fontSize:11,color:C.textDim,marginTop:4}},"Se registrará como cliente nuevo.")
          ),

          e("div",{style:{marginBottom:14,position:"relative"}},
            e("label",{style:st.lbl},"¿Qué producto le cotizaste?"),
            e("input",{
              value:fe.concepto,
              onChange:function(ev){ setFormEnvieP(Object.assign({},fe,{concepto:ev.target.value})); },
              onFocus:function(){ setMostrarCatEnvieP(true); },
              onBlur:function(){ setTimeout(function(){ setMostrarCatEnvieP(false); },150); },
              placeholder:productosCat.length>0?"Escribe o elige del catálogo":"Ej. Collar dorado",
              style:st.inp
            }),
            mostrarCatEnvieP&&productosCat.length>0&&(function(){
              var coincidenciasPv=fe.concepto.trim().length>0
                ?productosCat.filter(function(p){ return p.nombre.toLowerCase().indexOf(fe.concepto.trim().toLowerCase())>=0; })
                :productosCat;
              if(coincidenciasPv.length===0) return null;
              return e("div",{style:{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:C.surface,border:"1px solid "+C.border,borderRadius:10,marginTop:4,boxShadow:"0 4px 12px rgba(0,0,0,0.08)",overflow:"hidden",maxHeight:200,overflowY:"auto"}},
                coincidenciasPv.map(function(p){
                  return e("button",{key:p.id,style:{display:"flex",justifyContent:"space-between",width:"100%",textAlign:"left",padding:"9px 12px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:C.text},onClick:function(){ setFormEnvieP(Object.assign({},fe,{concepto:p.nombre,monto:String(p.precio)})); setMostrarCatEnvieP(false); }},
                    e("span",null,p.nombre),
                    e("span",{style:{color:C.textMuted}},"$"+Number(p.precio).toLocaleString())
                  );
                })
              );
            })()
          ),

          e("div",{style:{marginBottom:20}},
            e("label",{style:st.lbl},"¿Cuánto?"),
            e(MontoInput,{value:fe.monto,onChange:function(ev){ setFormEnvieP(Object.assign({},fe,{monto:ev.target.value})); },placeholder:"0",style:st.inp})
          ),

          e("div",{style:{fontSize:11,color:C.textDim,marginBottom:16,lineHeight:1.5}},"Quedará como oportunidad en seguimiento."),

          e("button",{style:Object.assign({},st.btnP,{width:"100%",opacity:listo?1:0.4}),disabled:!listo,onClick:guardarEnvieP},"Registrar")
        )
      );
    })(),
    clienteCompletarId&&!modalEnvie&&!modalCerre&&!modalEnvieP&&!modalCerreP&&(function(){
      var clStandalone=clientes.find(function(c){ return c.id===clienteCompletarId; });
      function cerrarStandalone(){ setClienteCompletarId(null); setFormCompletar({canal:"",contacto:"",instagram:"",messenger:""}); }
      return e("div",{style:st.ov,onClick:cerrarStandalone},
        e("div",{style:Object.assign({},st.modal,{maxWidth:420}),onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}},"Agrega su contacto"),
          e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:18,lineHeight:1.5}},"¿Por dónde le puedes escribir a "+(clStandalone?clStandalone.nombre.split(" ")[0]:"")+"?"),
          renderCompletarContacto(),
          e("div",{style:{display:"flex",gap:8,marginTop:6}},
            e("button",{style:Object.assign({},st.btn,{flex:1}),onClick:cerrarStandalone},"Omitir por ahora"),
            e("button",{style:Object.assign({},st.btnP,{flex:1,opacity:puedeGuardarCompletar()?1:0.4}),disabled:!puedeGuardarCompletar(),onClick:function(){ guardarCompletarContacto(clienteCompletarId); }},"Guardar")
          )
        )
      );
    })(),

    origenPromptId&&!modalEnvie&&!modalCerre&&!pasoPregunto&&!clienteCompletarId&&!cotAceptadaId&&!motivoPipelineId&&!modalCerreP&&!modalEnvieP&&!cancelarPedidoId&&(function(){
      var clOrigen=clientes.find(function(c){ return c.id===origenPromptId; });
      function cerrarOrigenStandalone(){ omitirOrigenPrompt(); }
      return e("div",{style:st.ov,onClick:cerrarOrigenStandalone},
        e("div",{style:Object.assign({},st.modal,{maxWidth:420}),onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}},"¿Cómo te encontró "+(clOrigen?clOrigen.nombre.split(" ")[0]:"")+"?"),
          e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:16,lineHeight:1.5}},"Saber esto te ayuda a ver qué canal te trae más clientes reales , así sabes dónde vale la pena poner más tiempo y esfuerzo."),
          e("div",{style:{display:"flex",flexDirection:"column",gap:8,marginBottom:14}},
            ORIGENES_PROMPT.map(function(org){
              return e("button",{key:org,style:{cursor:"pointer",padding:"10px 14px",borderRadius:10,border:"1px solid "+C.border,background:"transparent",fontSize:13,color:C.text,fontWeight:500,textAlign:"left"},onClick:function(){ guardarOrigenPrompt(origenPromptId,org); }},org);
            })
          ),
          e("button",{style:Object.assign({},st.btn,{width:"100%"}),onClick:cerrarOrigenStandalone},"Omitir por ahora")
        )
      );
    })(),

    modalCerre&&(function(){
      var fc=formCerre;
      var coincidencias=fc.busqueda.trim().length>0&&!fc.clienteId
        ?clientes.filter(function(c){ return c.nombre.toLowerCase().indexOf(fc.busqueda.trim().toLowerCase())===0; }).slice(0,5)
        :[];
      var cotPendienteCliente=fc.clienteId
        ?cotizaciones.filter(function(cot){ return cot.clienteId===fc.clienteId&&cot.estatus==="Pendiente"; }).sort(function(a,b){ return new Date(b.fecha)-new Date(a.fecha); })[0]
        :null;
      var mostrarConfirmarCot=cotPendienteCliente&&!fc.mostrarForm;
      var mostrarFormVenta=!mostrarConfirmarCot;
      var listoVenta=fc.concepto.trim().length>0&&fc.monto;

      if(modalCerre&&clienteCompletarId){
        var clCompletarV=clientes.find(function(c){ return c.id===clienteCompletarId; });
        return e("div",{style:st.ov,onClick:cerrarCerre},
          e("div",{style:Object.assign({},st.modal,{maxWidth:420}),onClick:function(ev){ ev.stopPropagation(); }},
            e("div",{style:{fontSize:15,fontWeight:700,color:C.green,marginBottom:6}},"✓ Venta registrada"),
            e("div",{style:{fontSize:12,color:C.green,fontWeight:600,marginBottom:12,padding:"8px 12px",background:C.green+"12",borderRadius:8}},"Ya quedó en tu pestaña Trabajos, para que no se te olvide entregarlo."),
            e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:18,lineHeight:1.5}},"¿Por dónde le puedes escribir a "+(clCompletarV?clCompletarV.nombre.split(" ")[0]:"")+"?"),
            renderCompletarContacto(),
            e("div",{style:{display:"flex",gap:8,marginTop:6}},
              e("button",{style:Object.assign({},st.btn,{flex:1}),onClick:function(){ omitirCompletarContacto(); cerrarCerre(); }},"Omitir por ahora"),
              e("button",{style:Object.assign({},st.btnP,{flex:1,opacity:puedeGuardarCompletar()?1:0.4}),disabled:!puedeGuardarCompletar(),onClick:function(){ guardarCompletarContacto(clienteCompletarId); cerrarCerre(); }},"Guardar")
            )
          )
        );
      }

      if(cerreExito){
        return e("div",{style:st.ov,onClick:cerrarCerre},
          e("div",{style:Object.assign({},st.modal,{maxWidth:420}),onClick:function(ev){ ev.stopPropagation(); }},
            e("div",{style:{fontSize:16,fontWeight:700,color:C.green,marginBottom:12}},"✓ Venta registrada"),
            e("div",{style:{fontSize:13,color:C.text,lineHeight:1.6,marginBottom:20,background:C.green+"0D",padding:"14px 16px",borderRadius:10,border:"1px solid "+C.green+"33"}},"Ya quedó en tu pestaña Trabajos, para que no se te olvide entregarlo."),
            e("button",{style:Object.assign({},st.btnP,{width:"100%"}),onClick:cerrarCerre},"Listo")
          )
        );
      }

      return e("div",{style:st.ov,onClick:cerrarCerre},
        e("div",{style:Object.assign({},st.modal,{maxWidth:420}),onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{display:"flex",justifyContent:"flex-end",marginBottom:8}},
            e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:20,lineHeight:1,padding:"0 4px"},onClick:cerrarCerre},"×")
          ),
          e("div",{style:{fontSize:14,fontWeight:700,color:C.purple,marginBottom:18,lineHeight:1.4}},"¡Felicidades, cerraste una venta! Registremos los detalles."),

          e("div",{style:{marginBottom:14,position:"relative"}},
            e("label",{style:st.lbl},"¿A quién le cerraste la venta?"),
            fc.clienteId
              ? e("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",borderRadius:10,background:C.purplePale,border:"1px solid "+C.purple+"33"}},
                  e("span",{style:{fontSize:13,color:C.purple,fontWeight:600}},"✓ "+fc.busqueda),
                  e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textMuted,fontSize:12,fontWeight:500},onClick:function(){ setFormCerre(Object.assign({},fc,{clienteId:null,busqueda:"",mostrarForm:false})); }},"Cambiar")
                )
              : e("input",{value:fc.busqueda,onChange:function(ev){ setFormCerre(Object.assign({},fc,{busqueda:ev.target.value})); },placeholder:"Escribe su nombre (opcional)",style:st.inp,autoFocus:true}),
            coincidencias.length>0&&e("div",{style:{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:C.surface,border:"1px solid "+C.border,borderRadius:10,marginTop:4,boxShadow:"0 4px 12px rgba(0,0,0,0.08)",overflow:"hidden"}},
              coincidencias.map(function(c){
                return e("button",{key:c.id,style:{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:C.text},onClick:function(){
                  var servicioGuardado=c.servicioInteres||c.notas||"";
                  var svCatalogo=servicios.find(function(sv){ return sv.nombre===servicioGuardado; });
                  setFormCerre(Object.assign({},fc,{clienteId:c.id,busqueda:c.nombre,mostrarForm:false,concepto:servicioGuardado||fc.concepto,monto:svCatalogo?String(svCatalogo.precio):fc.monto}));
                }},c.nombre);
              })
            ),
            !fc.clienteId&&fc.busqueda.trim().length===0&&e("div",{style:{fontSize:11,color:C.textDim,marginTop:4}},"Puedes dejarlo en blanco si fue una venta sin cliente específico.")
          ),

          mostrarConfirmarCot&&e("div",null,
            e("div",{style:{fontSize:13,color:C.text,marginBottom:10}},"Tiene una cotización pendiente. ¿Es esta la que se cerró?"),
            e("div",{style:{padding:"14px 16px",borderRadius:12,border:"1px solid "+C.border,background:C.bg,marginBottom:14}},
              e("div",{style:{fontSize:14,fontWeight:600,color:C.text,marginBottom:2}},cotPendienteCliente.concepto),
              e("div",{style:{fontSize:16,fontWeight:700,color:C.purple}},"$"+Number(cotPendienteCliente.monto).toLocaleString())
            ),
            e("div",{style:{display:"flex",gap:8}},
              e("button",{style:Object.assign({},st.btn,{flex:1}),onClick:function(){ setFormCerre(Object.assign({},fc,{mostrarForm:true})); }},"No, fue otra cosa"),
              e("button",{style:Object.assign({},st.btnP,{flex:1}),onClick:function(){ cerrarCerre(); cambiarEstatus(cotPendienteCliente.id,"Aceptada"); }},"Sí, es esta")
            )
          ),

          mostrarFormVenta&&e("div",null,
            e("div",{style:{marginBottom:14,position:"relative"}},
              e("label",{style:st.lbl},"¿Qué vendiste?"),
              e("input",{
                value:fc.concepto,
                onChange:function(ev){ setFormCerre(Object.assign({},fc,{concepto:ev.target.value})); },
                onFocus:function(){ setMostrarCatCerre(true); },
                onBlur:function(){ setTimeout(function(){ setMostrarCatCerre(false); },150); },
                placeholder:servicios.length>0?"Escribe o elige del catálogo":"Ej. Diseño de logotipo",
                style:st.inp
              }),
              mostrarCatCerre&&servicios.length>0&&(function(){
                var coincidenciasSv=fc.concepto.trim().length>0
                  ?servicios.filter(function(sv){ return sv.nombre.toLowerCase().indexOf(fc.concepto.trim().toLowerCase())>=0; })
                  :servicios;
                if(coincidenciasSv.length===0) return null;
                return e("div",{style:{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:C.surface,border:"1px solid "+C.border,borderRadius:10,marginTop:4,boxShadow:"0 4px 12px rgba(0,0,0,0.08)",overflow:"hidden",maxHeight:200,overflowY:"auto"}},
                  coincidenciasSv.map(function(sv){
                    return e("button",{key:sv.id,style:{display:"flex",justifyContent:"space-between",width:"100%",textAlign:"left",padding:"9px 12px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:C.text},onClick:function(){ setFormCerre(Object.assign({},fc,{concepto:sv.nombre,monto:String(sv.precio)})); setMostrarCatCerre(false); }},
                      e("span",null,sv.nombre),
                      e("span",{style:{color:C.textMuted}},"$"+Number(sv.precio).toLocaleString())
                    );
                  })
                );
              })()
            ),
            e("div",{style:{marginBottom:14}},
              e("label",{style:st.lbl},"¿Cuánto?"),
              e(MontoInput,{value:fc.monto,onChange:function(ev){ setFormCerre(Object.assign({},fc,{monto:ev.target.value})); },placeholder:"0",style:st.inp})
            ),
            e("div",{style:{marginBottom:20}},
              e("label",{style:st.lbl},"¿Cómo quedó el pago?"),
              e("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
                e("button",{style:Object.assign({},st.btn,{flex:"1 1 30%",background:fc.tipoPago==="completo"?C.purple:"transparent",color:fc.tipoPago==="completo"?"#fff":C.textMuted,borderColor:fc.tipoPago==="completo"?C.purple:C.border}),onClick:function(){ setFormCerre(Object.assign({},fc,{tipoPago:"completo",anticipo:""})); }},"Pagó completo"),
                e("button",{style:Object.assign({},st.btn,{flex:"1 1 30%",background:fc.tipoPago==="anticipo"?C.purple:"transparent",color:fc.tipoPago==="anticipo"?"#fff":C.textMuted,borderColor:fc.tipoPago==="anticipo"?C.purple:C.border}),onClick:function(){ setFormCerre(Object.assign({},fc,{tipoPago:"anticipo"})); }},"Dejó anticipo"),
                e("button",{style:Object.assign({},st.btn,{flex:"1 1 30%",background:fc.tipoPago==="nada"?C.purple:"transparent",color:fc.tipoPago==="nada"?"#fff":C.textMuted,borderColor:fc.tipoPago==="nada"?C.purple:C.border}),onClick:function(){ setFormCerre(Object.assign({},fc,{tipoPago:"nada",anticipo:""})); }},"Aún no ha pagado nada")
              ),
              fc.tipoPago==="anticipo"&&e(MontoInput,{value:fc.anticipo,onChange:function(ev){ setFormCerre(Object.assign({},fc,{anticipo:ev.target.value})); },placeholder:"¿Cuánto dejó?",style:Object.assign({},st.inp,{marginTop:8})})
            ),
            e("button",{style:Object.assign({},st.btnP,{width:"100%",opacity:listoVenta?1:0.4}),disabled:!listoVenta,onClick:guardarCerre},"Registrar venta")
          )
        )
      );
    })(),
    modalCerreP&&(function(){
      var fc=formCerreP;
      var coincidencias=fc.busqueda.trim().length>0&&!fc.clienteId
        ?clientes.filter(function(c){ return c.nombre.toLowerCase().indexOf(fc.busqueda.trim().toLowerCase())===0; }).slice(0,5)
        :[];
      var opoPendienteCliente=fc.clienteId
        ?clientes.find(function(c){ return c.id===fc.clienteId&&c.productoInteres&&c.precioInteres&&(c.estadoProspecto==="Nueva"||c.estadoProspecto==="En seguimiento"); })
        :null;
      var mostrarConfirmarOpo=opoPendienteCliente&&!fc.mostrarForm;
      var mostrarFormVenta=!mostrarConfirmarOpo;
      var listoVenta=fc.concepto.trim().length>0&&fc.monto;

      if(clienteCompletarId){
        var clCompletarVP=clientes.find(function(c){ return c.id===clienteCompletarId; });
        return e("div",{style:st.ov,onClick:cerrarCerreP},
          e("div",{style:Object.assign({},st.modal,{maxWidth:420}),onClick:function(ev){ ev.stopPropagation(); }},
            e("div",{style:{fontSize:15,fontWeight:700,color:C.green,marginBottom:6}},"✓ Venta registrada"),
            e("div",{style:{fontSize:12,color:C.green,fontWeight:600,marginBottom:12,padding:"8px 12px",background:C.green+"12",borderRadius:8}},"Ya quedó en tu pestaña Pedidos, para que no se te olvide entregarlo."),
            e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:18,lineHeight:1.5}},"¿Por dónde le puedes escribir a "+(clCompletarVP?clCompletarVP.nombre.split(" ")[0]:"")+"?"),
            renderCompletarContacto(),
            e("div",{style:{display:"flex",gap:8,marginTop:6}},
              e("button",{style:Object.assign({},st.btn,{flex:1}),onClick:function(){ omitirCompletarContacto(); cerrarCerreP(); }},"Omitir por ahora"),
              e("button",{style:Object.assign({},st.btnP,{flex:1,opacity:puedeGuardarCompletar()?1:0.4}),disabled:!puedeGuardarCompletar(),onClick:function(){ guardarCompletarContacto(clienteCompletarId); cerrarCerreP(); }},"Guardar")
            )
          )
        );
      }

      if(cerrePExito){
        return e("div",{style:st.ov,onClick:cerrarCerreP},
          e("div",{style:Object.assign({},st.modal,{maxWidth:420}),onClick:function(ev){ ev.stopPropagation(); }},
            e("div",{style:{fontSize:16,fontWeight:700,color:C.green,marginBottom:12}},"✓ Venta registrada"),
            e("div",{style:{fontSize:13,color:C.text,lineHeight:1.6,marginBottom:20,background:C.green+"0D",padding:"14px 16px",borderRadius:10,border:"1px solid "+C.green+"33"}},"Ya quedó en tu pestaña Pedidos, para que no se te olvide entregarlo."),
            e("button",{style:Object.assign({},st.btnP,{width:"100%"}),onClick:cerrarCerreP},"Listo")
          )
        );
      }

      return e("div",{style:st.ov,onClick:cerrarCerreP},
        e("div",{style:Object.assign({},st.modal,{maxWidth:420}),onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{display:"flex",justifyContent:"flex-end",marginBottom:8}},
            e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:20,lineHeight:1,padding:"0 4px"},onClick:cerrarCerreP},"×")
          ),
          e("div",{style:{fontSize:14,fontWeight:700,color:C.purple,marginBottom:18,lineHeight:1.4}},"¡Felicidades, cerraste una venta! Registremos los detalles."),

          e("div",{style:{marginBottom:14,position:"relative"}},
            e("label",{style:st.lbl},"¿A quién le cerraste la venta?"),
            fc.clienteId
              ? e("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",borderRadius:10,background:C.purplePale,border:"1px solid "+C.purple+"33"}},
                  e("span",{style:{fontSize:13,color:C.purple,fontWeight:600}},"✓ "+fc.busqueda),
                  e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textMuted,fontSize:12,fontWeight:500},onClick:function(){ setFormCerreP(Object.assign({},fc,{clienteId:null,busqueda:"",mostrarForm:false})); }},"Cambiar")
                )
              : e("input",{value:fc.busqueda,onChange:function(ev){ setFormCerreP(Object.assign({},fc,{busqueda:ev.target.value})); },placeholder:"Escribe su nombre (opcional)",style:st.inp,autoFocus:true}),
            coincidencias.length>0&&e("div",{style:{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:C.surface,border:"1px solid "+C.border,borderRadius:10,marginTop:4,boxShadow:"0 4px 12px rgba(0,0,0,0.08)",overflow:"hidden"}},
              coincidencias.map(function(c){
                return e("button",{key:c.id,style:{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:C.text},onClick:function(){
                  var productoGuardado=c.productoInteres||"";
                  var prodCatalogo=productosCat.find(function(p){ return p.nombre===productoGuardado; });
                  setFormCerreP(Object.assign({},fc,{clienteId:c.id,busqueda:c.nombre,mostrarForm:false,concepto:productoGuardado||fc.concepto,monto:prodCatalogo?String(prodCatalogo.precio):(c.precioInteres||fc.monto)}));
                }},c.nombre);
              })
            ),
            !fc.clienteId&&fc.busqueda.trim().length===0&&e("div",{style:{fontSize:11,color:C.textDim,marginTop:4}},"Puedes dejarlo en blanco si fue una venta sin cliente específico.")
          ),

          mostrarConfirmarOpo&&e("div",null,
            e("div",{style:{fontSize:13,color:C.text,marginBottom:10}},"Tiene una oportunidad pendiente. ¿Es esta la que se cerró?"),
            e("div",{style:{padding:"14px 16px",borderRadius:12,border:"1px solid "+C.border,background:C.bg,marginBottom:14}},
              e("div",{style:{fontSize:14,fontWeight:600,color:C.text,marginBottom:2}},opoPendienteCliente.productoInteres),
              e("div",{style:{fontSize:16,fontWeight:700,color:C.purple}},"$"+Number(opoPendienteCliente.precioInteres).toLocaleString())
            ),
            e("div",{style:{display:"flex",gap:8}},
              e("button",{style:Object.assign({},st.btn,{flex:1}),onClick:function(){ setFormCerreP(Object.assign({},fc,{mostrarForm:true,concepto:opoPendienteCliente.productoInteres,monto:String(opoPendienteCliente.precioInteres),cantidad:opoPendienteCliente.cantidadInteres||"1"})); }},"No, fue otra cosa"),
              e("button",{style:Object.assign({},st.btnP,{flex:1}),onClick:function(){
                var clienteFinalConf=Object.assign({},opoPendienteCliente,{etapa:"Ganado",fechaEtapa:FECHA_HOY,ultimoContacto:FECHA_HOY,estadoProspecto:"Convertido",fechaPedido:new Date().toISOString()});
                setClientes(clientes.map(function(c){ return c.id===opoPendienteCliente.id?clienteFinalConf:c; }));
                crearPedidoDesdeVenta(opoPendienteCliente.id,opoPendienteCliente.productoInteres,opoPendienteCliente.cantidadInteres||"1",opoPendienteCliente.precioInteres,"completo","");
                if(!tieneContactoCompleto(clienteFinalConf)){ setClienteCompletarId(opoPendienteCliente.id); } else { if(!clienteFinalConf.origen) setOrigenPromptId(opoPendienteCliente.id); setCerrePExito(true); }
              }},"Sí, es esta")
            )
          ),

          mostrarFormVenta&&e("div",null,
            e("div",{style:{marginBottom:14,position:"relative"}},
              e("label",{style:st.lbl},"¿Qué producto vendiste?"),
              e("input",{
                value:fc.concepto,
                onChange:function(ev){ setFormCerreP(Object.assign({},fc,{concepto:ev.target.value})); },
                onFocus:function(){ setMostrarCatCerreP(true); },
                onBlur:function(){ setTimeout(function(){ setMostrarCatCerreP(false); },150); },
                placeholder:productosCat.length>0?"Escribe o elige del catálogo":"Ej. Collar dorado",
                style:st.inp
              }),
              mostrarCatCerreP&&productosCat.length>0&&(function(){
                var coincidenciasPv=fc.concepto.trim().length>0
                  ?productosCat.filter(function(p){ return p.nombre.toLowerCase().indexOf(fc.concepto.trim().toLowerCase())>=0; })
                  :productosCat;
                if(coincidenciasPv.length===0) return null;
                return e("div",{style:{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:C.surface,border:"1px solid "+C.border,borderRadius:10,marginTop:4,boxShadow:"0 4px 12px rgba(0,0,0,0.08)",overflow:"hidden",maxHeight:200,overflowY:"auto"}},
                  coincidenciasPv.map(function(p){
                    return e("button",{key:p.id,style:{display:"flex",justifyContent:"space-between",width:"100%",textAlign:"left",padding:"9px 12px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:C.text},onClick:function(){ setFormCerreP(Object.assign({},fc,{concepto:p.nombre,monto:String(p.precio)})); setMostrarCatCerreP(false); }},
                      e("span",null,p.nombre),
                      e("span",{style:{color:C.textMuted}},"$"+Number(p.precio).toLocaleString())
                    );
                  })
                );
              })()
            ),
            e("div",{style:{marginBottom:14}},
              e("label",{style:st.lbl},"¿Cantidad?"),
              e("input",{type:"number",min:"1",value:fc.cantidad,onChange:function(ev){ setFormCerreP(Object.assign({},fc,{cantidad:ev.target.value})); },style:st.inp})
            ),
            e("div",{style:{marginBottom:14}},
              e("label",{style:st.lbl},"¿Cuánto en total?"),
              e(MontoInput,{value:fc.monto,onChange:function(ev){ setFormCerreP(Object.assign({},fc,{monto:ev.target.value})); },placeholder:"0",style:st.inp})
            ),
            e("div",{style:{marginBottom:20}},
              e("label",{style:st.lbl},"¿Cómo quedó el pago?"),
              e("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
                e("button",{style:Object.assign({},st.btn,{flex:"1 1 30%",background:fc.tipoPago==="completo"?C.purple:"transparent",color:fc.tipoPago==="completo"?"#fff":C.textMuted,borderColor:fc.tipoPago==="completo"?C.purple:C.border}),onClick:function(){ setFormCerreP(Object.assign({},fc,{tipoPago:"completo",anticipo:""})); }},"Pagó completo"),
                e("button",{style:Object.assign({},st.btn,{flex:"1 1 30%",background:fc.tipoPago==="anticipo"?C.purple:"transparent",color:fc.tipoPago==="anticipo"?"#fff":C.textMuted,borderColor:fc.tipoPago==="anticipo"?C.purple:C.border}),onClick:function(){ setFormCerreP(Object.assign({},fc,{tipoPago:"anticipo"})); }},"Dejó anticipo"),
                e("button",{style:Object.assign({},st.btn,{flex:"1 1 30%",background:fc.tipoPago==="nada"?C.purple:"transparent",color:fc.tipoPago==="nada"?"#fff":C.textMuted,borderColor:fc.tipoPago==="nada"?C.purple:C.border}),onClick:function(){ setFormCerreP(Object.assign({},fc,{tipoPago:"nada",anticipo:""})); }},"Aún no ha pagado nada")
              ),
              fc.tipoPago==="anticipo"&&e(MontoInput,{value:fc.anticipo,onChange:function(ev){ setFormCerreP(Object.assign({},fc,{anticipo:ev.target.value})); },placeholder:"¿Cuánto dejó?",style:Object.assign({},st.inp,{marginTop:8})})
            ),
            e("button",{style:Object.assign({},st.btnP,{width:"100%",opacity:listoVenta?1:0.4}),disabled:!listoVenta,onClick:guardarCerreP},"Registrar venta")
          )
        )
      );
    })(),
    modalRecibi&&(function(){
      var cobrosTodosR=obtenerCobrosPendientesHoy(cotizaciones,ventas,clientes,null,true);
      var filtrados=busquedaRecibi.trim().length>0
        ?cobrosTodosR.filter(function(x){ return x.cliente.nombre.toLowerCase().indexOf(busquedaRecibi.trim().toLowerCase())===0; })
        :cobrosTodosR;
      return e("div",{style:st.ov,onClick:cerrarRecibi},
        e("div",{style:Object.assign({},st.modal,{maxWidth:420}),onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{display:"flex",justifyContent:"flex-end",marginBottom:8}},
            e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:20,lineHeight:1,padding:"0 4px"},onClick:cerrarRecibi},"×")
          ),
          e("div",{style:{fontSize:14,fontWeight:700,color:C.purple,marginBottom:18,lineHeight:1.4}},"¡Qué bien, recibiste un pago! Actualicemos."),
          cobrosTodosR.length===0
            ? e("div",{style:{fontSize:13,color:C.textMuted,textAlign:"center",padding:"20px 0"}},"No tienes cotizaciones con saldo pendiente en este momento.")
            : e("div",null,
                e("input",{value:busquedaRecibi,onChange:function(ev){ setBusquedaRecibi(ev.target.value); },placeholder:"Buscar por nombre",style:Object.assign({},st.inp,{marginBottom:14}),autoFocus:true}),
                e("div",{style:{display:"flex",flexDirection:"column",gap:8,maxHeight:320,overflowY:"auto"}},
                  filtrados.length===0
                    ? e("div",{style:{fontSize:13,color:C.textDim,textAlign:"center",padding:"12px 0"}},"Nadie coincide con esa búsqueda.")
                    : filtrados.map(function(x){
                        var ac=avatarColor(x.cliente.id);
                        return e("div",{key:x.tipo+"_"+x.cot.id,style:{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",border:"1px solid "+C.border,borderRadius:12,cursor:"pointer"},onClick:function(){
                          cerrarRecibi();
                          setPagosModalTipo(x.tipo);
                          setPagosModalId(x.cot.id);
                          setFormPago({monto:"",fecha:FECHA_HOY,concepto:(x.cot.pagos||[]).length===0?"Anticipo":"Pago"});
                        }},
                          e("div",{style:{width:36,height:36,borderRadius:"50%",background:ac+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:ac,flexShrink:0}},iniciales(x.cliente.nombre)),
                          e("div",{style:{flex:1,minWidth:0}},
                            e("div",{style:{fontSize:14,fontWeight:700,color:C.text}},x.cliente.nombre),
                            e("div",{style:{fontSize:12,color:C.textMuted}},x.cot.concepto||"Cotización aceptada")
                          ),
                          e("div",{style:{fontSize:14,fontWeight:700,color:C.amber,flexShrink:0}},"$"+x.saldo.toLocaleString())
                        );
                      })
                )
              )
        )
      );
    })(),

    modalRecibiP&&(function(){
      var pedidosTodosR=obtenerPedidosConSaldo();
      var filtradosP=busquedaRecibiP.trim().length>0
        ?pedidosTodosR.filter(function(x){ return x.cliente.nombre.toLowerCase().indexOf(busquedaRecibiP.trim().toLowerCase())===0; })
        :pedidosTodosR;
      return e("div",{style:st.ov,onClick:cerrarRecibiP},
        e("div",{style:Object.assign({},st.modal,{maxWidth:420}),onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{display:"flex",justifyContent:"flex-end",marginBottom:8}},
            e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:20,lineHeight:1,padding:"0 4px"},onClick:cerrarRecibiP},"×")
          ),
          e("div",{style:{fontSize:14,fontWeight:700,color:C.purple,marginBottom:18,lineHeight:1.4}},"¡Qué bien, recibiste un pago! Actualicemos."),
          pedidosTodosR.length===0
            ? e("div",{style:{fontSize:13,color:C.textMuted,textAlign:"center",padding:"20px 0"}},"No tienes pedidos con saldo pendiente en este momento.")
            : e("div",null,
                e("input",{value:busquedaRecibiP,onChange:function(ev){ setBusquedaRecibiP(ev.target.value); },placeholder:"Buscar por nombre",style:Object.assign({},st.inp,{marginBottom:14}),autoFocus:true}),
                e("div",{style:{display:"flex",flexDirection:"column",gap:8,maxHeight:320,overflowY:"auto"}},
                  filtradosP.length===0
                    ? e("div",{style:{fontSize:13,color:C.textDim,textAlign:"center",padding:"12px 0"}},"Nadie coincide con esa búsqueda.")
                    : filtradosP.map(function(x){
                        var ac=avatarColor(x.cliente.id);
                        return e("div",{key:x.ped.id,style:{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",border:"1px solid "+C.border,borderRadius:12,cursor:"pointer"},onClick:function(){
                          cerrarRecibiP();
                          setPagosModalTipo("pedido");
                          setPagosModalId(x.ped.id);
                          setFormPago({monto:"",fecha:FECHA_HOY,concepto:(x.ped.pagos||[]).length===0?"Anticipo":"Pago"});
                        }},
                          e("div",{style:{width:36,height:36,borderRadius:"50%",background:ac+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:ac,flexShrink:0}},iniciales(x.cliente.nombre)),
                          e("div",{style:{flex:1,minWidth:0}},
                            e("div",{style:{fontSize:14,fontWeight:700,color:C.text}},x.cliente.nombre),
                            e("div",{style:{fontSize:12,color:C.textMuted}},x.ped.productos||"Pedido")
                          ),
                          e("div",{style:{fontSize:14,fontWeight:700,color:C.amber,flexShrink:0}},"$"+x.saldo.toLocaleString())
                        );
                      })
                )
              )
        )
      );
    })(),




    sugerenciaClienteId&&(function(){
      var cl=clientes.find(function(c){ return c.id===sugerenciaClienteId; });
      if(!cl) return null;
      var coach=coachingCliente(cl,0);
      var urlContactar=contactUrl(cl,msgEtapa(cl));
      function cerrar(){ setSugerenciaClienteId(null); setFormCompletar({canal:"",contacto:"",instagram:"",messenger:""}); }
      return e("div",{style:st.ov,onClick:cerrar},
        e("div",{style:Object.assign({},st.modal,{maxWidth:440}),onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}},
            e("div",null,
              e("div",{style:{fontSize:11,fontWeight:700,color:C.purple,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}},"Sugerencia CLEO"),
              e("div",{style:{fontSize:17,fontWeight:700,color:C.text}},cl.nombre)
            ),
            e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:20,lineHeight:1,padding:"0 4px"},onClick:cerrar},"×")
          ),
          e("div",{style:{fontSize:13,color:C.textMuted,lineHeight:1.6,marginBottom:14}},coach.consejo),
          e("div",{style:{fontSize:13,color:C.text,fontStyle:"italic",background:C.bg,padding:"12px 14px",borderRadius:10,lineHeight:1.6,marginBottom:20,border:"1px solid "+C.border}},
            "\u201c"+coach.mensaje+"\u201d"
          ),
          !urlContactar&&e("div",{style:{marginBottom:16,paddingTop:16,borderTop:"1px solid "+C.border}},
            e("div",{style:{fontSize:13,fontWeight:600,color:C.text,marginBottom:10}},"Agrega su contacto para poder escribirle"),
            renderCompletarContacto()
          ),
          e("div",{style:{display:"flex",gap:8}},
            e("button",{style:{cursor:"pointer",padding:"10px 16px",borderRadius:10,border:"1px solid "+C.border,background:"transparent",fontSize:13,color:C.textMuted,fontWeight:500},onClick:cerrar},"Cerrar"),
            urlContactar&&e("a",{href:urlContactar,target:"_blank",rel:"noreferrer",style:{flex:1,cursor:"pointer",padding:"10px 16px",borderRadius:10,border:"none",background:C.purple,fontSize:13,color:"#fff",fontWeight:600,textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:8},onClick:cerrar},
              e(SvgIcon,{canal:cl.canalPrincipal||"WhatsApp",size:14}),"Contactar"
            ),
            !urlContactar&&e("button",{style:Object.assign({},st.btnP,{flex:1,opacity:puedeGuardarCompletar()?1:0.4}),disabled:!puedeGuardarCompletar(),onClick:function(){ guardarCompletarContacto(cl.id); cerrar(); }},"Guardar y cerrar")
          )
        )
      );
    })(),

        // MODAL CONTACTADO
    contactadoClienteId&&(function(){
      var cl=clientes.find(function(c){ return c.id===contactadoClienteId; });
      if(!cl) return null;
      var nombre=cl.nombre.split(" ")[0];

      function cerrar(){ setContactadoClienteId(null); setContactadoOpcion(null); setContactadoNota(""); setContactadoDias(null); setContactadoResult(null); setMandoPrecioForm({concepto:"",monto:""}); }

      // RESULTADO — siempre primero, antes de recalcular etapa
      if(contactadoResult) return e("div",{style:st.ov,onClick:cerrar},
        e("div",{style:Object.assign({},st.modal,{textAlign:"center"}),onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{fontSize:28,marginBottom:12}},"✓"),
          e("div",{style:{fontSize:15,fontWeight:600,color:C.text,marginBottom:6}},contactadoResult.titulo),
          e("div",{style:{fontSize:13,color:C.textMuted,lineHeight:1.6,marginBottom:20}},contactadoResult.desc),
          e("button",{style:st.btnP,onClick:cerrar},"Listo")
        )
      );

      var esPerdidoC=cl.etapa==="Perdido";
      var esGanadoC=cl.etapa==="Ganado";

      // FLUJO GANADO — cliente que ya compró
      if(esGanadoC){
        var opExpandG=contactadoOpcion==="expand_ganado_nuevo"?"nuevo":contactadoOpcion==="expand_ganado_contacto"?"contacto":null;
        return e("div",{style:st.ov,onClick:cerrar},
          e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",overflowY:"auto"}),onClick:function(ev){ ev.stopPropagation(); }},
            e("div",{style:{padding:"20px 20px 12px",borderBottom:"1px solid "+C.border}},
              e("div",{style:{fontSize:16,fontWeight:600,color:C.text,marginBottom:2}},"¿Qué pasó con "+nombre+"?"),
              e("div",{style:{fontSize:13,color:C.textMuted}},"Elige lo que mejor describe la conversación.")
            ),
            e("div",{style:{padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}},

              // Le interesa algo nuevo
              e("div",{style:{borderRadius:12,border:"1px solid "+C.purple+"44",overflow:"hidden",cursor:"pointer"},
                onClick:function(){ cerrar(); setFormCot(Object.assign({},cotVacio,{clienteId:String(cl.id)})); setModalCot(true); }
              },
                e("div",{style:{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}},
                  e("div",null,
                    e("div",{style:{fontSize:14,fontWeight:500,color:C.purple}},"Le interesa algo nuevo"),
                    e("div",{style:{fontSize:12,color:C.textMuted,marginTop:1}},"Crear nueva cotización")
                  ),
                  
                )
              ),

              // Solo mantener contacto
              e("div",{style:{borderRadius:12,border:"1px solid "+(opExpandG==="contacto"?C.border:C.border),overflow:"hidden"}},
                e("div",{style:{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"},
                  onClick:function(){ setContactadoOpcion(opExpandG==="contacto"?null:"expand_ganado_contacto"); }
                },
                  e("div",null,
                    e("div",{style:{fontSize:14,fontWeight:500,color:C.text}},"Solo mantener contacto"),
                    e("div",{style:{fontSize:12,color:C.textMuted,marginTop:1}},"¿Cuándo vuelvo a escribirle?")
                  ),
                  e("span",{style:{fontSize:16,color:C.textDim}},opExpandG==="contacto"?"▲":"▼")
                ),
                opExpandG==="contacto"&&e("div",{style:{borderTop:"1px solid "+C.border}},
                  e("div",{style:{display:"flex",borderBottom:"1px solid "+C.border}},
                    [15,30,60,90].map(function(d,idx){
                      return e("div",{key:d,style:{flex:1,textAlign:"center",padding:"9px 0",fontSize:13,fontWeight:500,color:C.purple,borderRight:idx<3?"1px solid "+C.border:"none",cursor:"pointer"},
                        onClick:function(){
                          var f=new Date(HOY); f.setDate(f.getDate()+d);
                          setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{ultimoContacto:FECHA_HOY,seguimientoFecha:fmtFechaLocal(f)}):x; }));
                          cerrar();
                        }
                      },d+"d");
                    })
                  ),
                  e("div",{style:{display:"flex",alignItems:"center",gap:8,padding:"8px 12px"}},
                    e("input",{id:"dias-ganado",type:"number",min:1,placeholder:"Otro...",inputMode:"numeric",
                      style:Object.assign({},st.inp,{flex:1,marginBottom:0,padding:"6px 10px",fontSize:13})
                    }),
                    e("span",{style:{fontSize:12,color:C.textDim}},"días"),
                    e("button",{style:{cursor:"pointer",padding:"6px 14px",borderRadius:8,border:"none",background:C.purple,color:"#fff",fontSize:12,fontWeight:500},
                      onClick:function(){ var inp=document.getElementById("dias-ganado"); if(inp&&inp.value){ var f=new Date(HOY); f.setDate(f.getDate()+Number(inp.value)); setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{ultimoContacto:FECHA_HOY,seguimientoFecha:fmtFechaLocal(f)}):x; })); cerrar(); } }
                    },"OK")
                  )
                )
              ),

              // Ya no compraría
              e("div",{style:{borderRadius:12,border:"1px solid "+C.red+"44",overflow:"hidden",cursor:"pointer"},
                onClick:function(){
                  if(!window.confirm("¿Marcar a "+nombre+" como inactivo?")) return;
                  var ev={fecha:FECHA_HOY,resultado:"Marcado como inactivo tras recontacto"};
                  setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{etapa:"Perdido",ultimoContacto:FECHA_HOY,seguimientoFecha:"",archivado:true,historialContactos:[...(x.historialContactos||[]),ev]}):x; }));
                  cerrar();
                }
              },
                e("div",{style:{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}},
                  e("div",null,
                    e("div",{style:{fontSize:14,fontWeight:500,color:C.red}},"Ya no compraría"),
                    e("div",{style:{fontSize:12,color:C.textMuted,marginTop:1}},"Marcar como inactivo")
                  ),
                  
                )
              )
            ),
            e("div",{style:{padding:"4px 16px 16px"}},
              e("button",{style:Object.assign({},st.btn,{width:"100%",fontSize:13}),onClick:cerrar},"Cancelar")
            )
          )
        );
      }

      // FLUJO SIMPLE para clientes NO perdidos
      if(!esPerdidoC){
        var opExpand=contactadoOpcion==="expand_interesado"?"interesado":contactadoOpcion==="expand_noresponde"?"noresponde":null;
        return e("div",{style:st.ov,onClick:cerrar},
          e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",overflowY:"auto"}),onClick:function(ev){ ev.stopPropagation(); }},

            // Header
            e("div",{style:{padding:"20px 20px 12px",borderBottom:"1px solid "+C.border}},
              e("div",{style:{fontSize:16,fontWeight:600,color:C.text,marginBottom:2}},"¿Qué pasó con "+nombre+"?"),
              e("div",{style:{fontSize:13,color:C.textMuted}},"Elige lo que mejor describe la conversación.")
            ),

            // Opciones
            e("div",{style:{padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}},

              // Sigue interesado
              e("div",{style:{borderRadius:12,border:"1px solid "+(opExpand==="interesado"?C.purple+"44":C.border),overflow:"hidden"}},
                e("div",{style:{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"},
                  onClick:function(){ setContactadoOpcion(opExpand==="interesado"?null:"expand_interesado"); }
                },
                  e("div",null,
                    e("div",{style:{fontSize:14,fontWeight:500,color:C.purple}},"Sigue interesado"),
                    e("div",{style:{fontSize:12,color:C.textMuted,marginTop:1}},"¿En cuántos días le doy seguimiento?")
                  ),
                  e("span",{style:{fontSize:16,color:C.textDim}},opExpand==="interesado"?"▲":"▼")
                ),
                opExpand==="interesado"&&e("div",{style:{borderTop:"1px solid "+C.border}},
                  e("div",{style:{display:"flex",borderBottom:"1px solid "+C.border}},
                    [1,3,5,7].map(function(d,idx){
                      return e("div",{key:d,style:{flex:1,textAlign:"center",padding:"9px 0",fontSize:13,fontWeight:500,color:C.purple,borderRight:idx<3?"1px solid "+C.border:"none",cursor:"pointer"},
                        onClick:function(){ (function(dias){ var f=new Date(HOY); f.setDate(f.getDate()+dias); setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{ultimoContacto:FECHA_HOY,seguimientoFecha:fmtFechaLocal(f)}):x; })); cerrar(); })(d); }
                      },d+"d");
                    })
                  ),
                  e("div",{style:{display:"flex",alignItems:"center",gap:8,padding:"8px 12px"}},
                    e("input",{id:"dias-interesado",type:"number",min:1,placeholder:"Otro...",inputMode:"numeric",
                      style:Object.assign({},st.inp,{flex:1,marginBottom:0,padding:"6px 10px",fontSize:13}),
                      onKeyDown:function(ev){ if(ev.key==="Enter"&&ev.target.value){ (function(dias){ var f=new Date(HOY); f.setDate(f.getDate()+Number(dias)); setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{ultimoContacto:FECHA_HOY,seguimientoFecha:fmtFechaLocal(f)}):x; })); cerrar(); })(ev.target.value); } }
                    }),
                    e("span",{style:{fontSize:12,color:C.textDim}},"días"),
                    e("button",{style:{cursor:"pointer",padding:"6px 14px",borderRadius:8,border:"none",background:C.purple,color:"#fff",fontSize:12,fontWeight:500},
                      onClick:function(){ var inp=document.getElementById("dias-interesado"); if(inp&&inp.value){ var f=new Date(HOY); f.setDate(f.getDate()+Number(inp.value)); setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{ultimoContacto:FECHA_HOY,seguimientoFecha:fmtFechaLocal(f)}):x; })); cerrar(); } }
                    },"OK")
                  )
                )
              ),

              // Le mandé el precio , solo si está en Nuevo contacto
              cl.etapa==="Nuevo contacto"&&(function(){
                var abierto=contactadoOpcion==="expand_mandeprecio";
                var mpf=mandoPrecioForm;
                var listoMP=mpf.concepto.trim().length>0&&mpf.monto;
                function guardarMandoPrecio(){
                  var nuevaCotMP={
                    id:Date.now(),clienteId:cl.id,concepto:mpf.concepto,
                    cantidad:1,precioUnit:Number(mpf.monto),monto:Number(mpf.monto),estatus:"Pendiente",
                    fecha:FECHA_HOY,motivoPerdida:"",vigencia:"",vigenciaDias:"",
                    notas:"",anticipo:0,fechaAnticipo:"",pagos:[]
                  };
                  setCotizaciones([nuevaCotMP,...cotizaciones]);
                  setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{etapa:"Cotizacion enviada",fechaEtapa:FECHA_HOY,ultimoContacto:FECHA_HOY}):x; }));
                  cerrar();
                }
                return e("div",{style:{borderRadius:12,border:"1px solid "+(abierto?C.purple+"44":C.border),overflow:"hidden"}},
                  e("div",{style:{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"},
                    onClick:function(){ if(!abierto) setMandoPrecioForm({concepto:cl.servicioInteres||cl.notas||"",monto:""}); setContactadoOpcion(abierto?null:"expand_mandeprecio"); }
                  },
                    e("div",null,
                      e("div",{style:{fontSize:14,fontWeight:500,color:C.purple}},"Le mandé el precio"),
                      e("div",{style:{fontSize:12,color:C.textMuted,marginTop:1}},"Crear la cotización")
                    ),
                    e("span",{style:{fontSize:16,color:C.textDim}},abierto?"▲":"▼")
                  ),
                  abierto&&e("div",{style:{borderTop:"1px solid "+C.border,padding:"12px 14px"}},
                    e("div",{style:{position:"relative",marginBottom:10}},
                      e("input",{
                        value:mpf.concepto,
                        onChange:function(ev){ setMandoPrecioForm(Object.assign({},mpf,{concepto:ev.target.value})); },
                        onFocus:function(){ setMostrarCatMandoPrecio(true); },
                        onBlur:function(){ setTimeout(function(){ setMostrarCatMandoPrecio(false); },150); },
                        placeholder:servicios.length>0?"Escribe o elige del catálogo":"Ej. Diseño de logotipo",
                        style:Object.assign({},st.inp,{marginBottom:0})
                      }),
                      mostrarCatMandoPrecio&&servicios.length>0&&(function(){
                        var coincidenciasMP=mpf.concepto.trim().length>0
                          ?servicios.filter(function(sv){ return sv.nombre.toLowerCase().indexOf(mpf.concepto.trim().toLowerCase())>=0; })
                          :servicios;
                        if(coincidenciasMP.length===0) return null;
                        return e("div",{style:{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:C.surface,border:"1px solid "+C.border,borderRadius:10,marginTop:4,boxShadow:"0 4px 12px rgba(0,0,0,0.08)",overflow:"hidden",maxHeight:180,overflowY:"auto"}},
                          coincidenciasMP.map(function(sv){
                            return e("button",{key:sv.id,style:{display:"flex",justifyContent:"space-between",width:"100%",textAlign:"left",padding:"9px 12px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:C.text},onClick:function(){ setMandoPrecioForm(Object.assign({},mpf,{concepto:sv.nombre,monto:String(sv.precio)})); setMostrarCatMandoPrecio(false); }},
                              e("span",null,sv.nombre),
                              e("span",{style:{color:C.textMuted}},"$"+Number(sv.precio).toLocaleString())
                            );
                          })
                        );
                      })()
                    ),
                    e(MontoInput,{value:mpf.monto,onChange:function(ev){ setMandoPrecioForm(Object.assign({},mpf,{monto:ev.target.value})); },placeholder:"0",style:Object.assign({},st.inp,{marginBottom:10})}),
                    e("button",{style:Object.assign({},st.btnP,{width:"100%",opacity:listoMP?1:0.4}),disabled:!listoMP,onClick:guardarMandoPrecio},"Guardar y mover a Cotización enviada")
                  )
                );
              })(),

              // No respondió
              e("div",{style:{borderRadius:12,border:"1px solid "+(opExpand==="noresponde"?C.border:C.border),overflow:"hidden"}},
                e("div",{style:{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"},
                  onClick:function(){ setContactadoOpcion(opExpand==="noresponde"?null:"expand_noresponde"); }
                },
                  e("div",null,
                    e("div",{style:{fontSize:14,fontWeight:500,color:C.amber}},"No respondió"),
                    e("div",{style:{fontSize:12,color:C.textMuted,marginTop:1}},"¿Cuándo intento de nuevo?")
                  ),
                  e("span",{style:{fontSize:16,color:C.textDim}},opExpand==="noresponde"?"▲":"▼")
                ),
                opExpand==="noresponde"&&e("div",{style:{borderTop:"1px solid "+C.border}},
                  e("div",{style:{display:"flex",borderBottom:"1px solid "+C.border}},
                    [2,3,5,7].map(function(d,idx){
                      return e("div",{key:d,style:{flex:1,textAlign:"center",padding:"9px 0",fontSize:13,fontWeight:500,color:C.amber,borderRight:idx<3?"1px solid "+C.border:"none",cursor:"pointer"},
                        onClick:function(){ (function(dias){ var f=new Date(HOY); f.setDate(f.getDate()+dias); setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{ultimoContacto:FECHA_HOY,seguimientoFecha:fmtFechaLocal(f)}):x; })); cerrar(); })(d); }
                      },d+"d");
                    })
                  ),
                  e("div",{style:{display:"flex",alignItems:"center",gap:8,padding:"8px 12px"}},
                    e("input",{id:"dias-noresponde",type:"number",min:1,placeholder:"Otro...",inputMode:"numeric",
                      style:Object.assign({},st.inp,{flex:1,marginBottom:0,padding:"6px 10px",fontSize:13}),
                      onKeyDown:function(ev){ if(ev.key==="Enter"&&ev.target.value){ (function(dias){ var f=new Date(HOY); f.setDate(f.getDate()+Number(dias)); setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{ultimoContacto:FECHA_HOY,seguimientoFecha:fmtFechaLocal(f)}):x; })); cerrar(); })(ev.target.value); } }
                    }),
                    e("span",{style:{fontSize:12,color:C.textDim}},"días"),
                    e("button",{style:{cursor:"pointer",padding:"6px 14px",borderRadius:8,border:"none",background:C.amber,color:"#fff",fontSize:12,fontWeight:500},
                      onClick:function(){ var inp=document.getElementById("dias-noresponde"); if(inp&&inp.value){ var f=new Date(HOY); f.setDate(f.getDate()+Number(inp.value)); setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{ultimoContacto:FECHA_HOY,seguimientoFecha:fmtFechaLocal(f)}):x; })); cerrar(); } }
                    },"OK")
                  )
                )
              ),

              // Ya cerró — solo si tiene cotización pendiente
              (function(){
                var cotPend=cotizaciones.find(function(x){ return x.clienteId===cl.id&&x.estatus==="Pendiente"; });
                if(!cotPend) return null;
                return e("div",{style:{borderRadius:12,border:"1px solid "+C.green+"44",overflow:"hidden",cursor:"pointer"},
                  onClick:function(){
                    cerrar();
                    setCotAceptadaId(cotPend.id);
                    setEtapaAnteriorGanado(cl.etapa);
                    setPasoGanado(1); setPagoGanado({tipo:"",monto:"",fecha:FECHA_HOY}); setRazonCierre([]);
                  }
                },
                  e("div",{style:{padding:"12px 14px"}},
                    e("div",{style:{fontSize:14,fontWeight:500,color:C.green}},"Ya cerró"),
                    e("div",{style:{fontSize:12,color:C.textMuted,marginTop:1}},"Marcar como cliente ganado")
                  )
                );
              })(),

              // Ya no está interesado
              e("div",{style:{borderRadius:12,border:"1px solid "+C.red+"44",overflow:"hidden",cursor:"pointer"},
                onClick:function(){
                  cerrar();
                  setEtapaAnteriorPipeline(cl.etapa);
                  var cotPendHoy=cotizaciones.find(function(x){ return x.clienteId===cl.id&&x.estatus==="Pendiente"; });
                  if(cotPendHoy) setEstatusAnteriorCot({cotId:cotPendHoy.id,estatus:"Pendiente"});
                  setMotivoPipelineId(cl.id);
                }
              },
                e("div",{style:{padding:"12px 14px"}},
                  e("div",{style:{fontSize:14,fontWeight:500,color:C.red}},"Ya no está interesado"),
                  e("div",{style:{fontSize:12,color:C.textMuted,marginTop:1}},"Marcar como perdido")
                )
              )
            ),

            // Footer
            e("div",{style:{padding:"4px 16px 16px"}},
              e("button",{style:Object.assign({},st.btn,{width:"100%",fontSize:13}),onClick:cerrar},"Cancelar")
            )
          )
        );
      }

      // PASO 2: Confirmación restaurar cotización
      if(contactadoOpcion==="confirmar_restaurar"){
        var cot=window._cotPreviaTemp||{};
        return e("div",{style:st.ov,onClick:cerrar},
          e("div",{style:Object.assign({},st.modal,{textAlign:"center"}),onClick:function(ev){ ev.stopPropagation(); }},
            e("div",{style:{fontSize:24,marginBottom:12}},null),
            e("div",{style:{fontSize:15,fontWeight:600,color:C.text,marginBottom:8}},"Reactivamos su cotización"),
            e("div",{style:{fontSize:13,color:C.textMuted,lineHeight:1.6,marginBottom:16}},"Restauraremos:"),
            e("div",{style:{padding:"12px 16px",background:C.purplePale,borderRadius:10,border:"1px solid "+C.purple+"33",marginBottom:20}},
              e("div",{style:{fontSize:14,fontWeight:600,color:C.text,marginBottom:2}},cot.concepto||"Cotización"),
              e("div",{style:{fontSize:13,color:C.purple,fontWeight:600}},"$"+(cot.monto?Number(cot.monto).toLocaleString():"--"))
            ),
            e("div",{style:{fontSize:12,color:C.textMuted,marginBottom:20,lineHeight:1.6}},"La verás en seguimientos como Cotización enviada."),
            e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
              e("button",{style:st.btnP,onClick:function(){
                setCotizaciones(cotizaciones.map(function(c){ return c.id===cot.id?Object.assign({},c,{estatus:"Pendiente"}):c; }));
                var evRecup={fecha:FECHA_HOY,resultado:"Oportunidad recuperada — se restauró: "+(cot.concepto||"Cotización")+" $"+(cot.monto?Number(cot.monto).toLocaleString():"--")};
                setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{etapa:"Cotizacion enviada",ultimoContacto:FECHA_HOY,fechaEtapa:FECHA_HOY,seguimientoFecha:"",motivoPerdida:"",historialContactos:[...(x.historialContactos||[]),evRecup]}):x; }));
                setContactadoResult({titulo:"Oportunidad recuperada 🎉",desc:"Se restauró: "+(cot.concepto||"Cotización")+" — $"+(cot.monto?Number(cot.monto).toLocaleString():"--")+". Ya aparece en Cotización enviada."});
                window._cotPreviaTemp=null;
              }},"Confirmar"),
              e("button",{style:st.btn,onClick:cerrar},"Cancelar")
            )
          )
        );
      }

      // PASO 2: Sub-acción según opción
      if(contactadoOpcion==="recordatorio") return e("div",{style:st.ov,onClick:cerrar},
        e("div",{style:st.modal,onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{fontSize:15,fontWeight:600,color:C.text,marginBottom:4}},"¿Cuándo volver a intentarlo?"),
          e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:16}},"CLEO te lo recordará en Hoy."),
          e("div",{style:{display:"flex",flexDirection:"column",gap:8,marginBottom:16}},
            [{d:"3 días",v:3},{d:"7 días",v:7},{d:"14 días",v:14}].map(function(op){
              return e("button",{key:op.v,style:{cursor:"pointer",padding:"12px 14px",borderRadius:10,border:"1.5px solid "+(contactadoDias===op.v?C.purple:C.border),background:contactadoDias===op.v?C.purplePale:"transparent",textAlign:"left",fontSize:13,color:contactadoDias===op.v?C.purple:C.text,fontWeight:contactadoDias===op.v?600:400},
                onClick:function(){ setContactadoDias(op.v); }},op.d);
            })
          ),
          e("textarea",{value:contactadoNota,onChange:function(ev){ setContactadoNota(ev.target.value); },placeholder:"Notas adicionales (opcional)",style:Object.assign({},st.inp,{minHeight:50,resize:"vertical",marginBottom:16})}),
          e("div",{style:{display:"flex",gap:8}},
            e("button",{style:st.btn,onClick:function(){ setContactadoOpcion(null); }},"← Atrás"),
            e("button",{style:Object.assign({},st.btnP,{flex:1,opacity:contactadoDias?1:0.4}),disabled:!contactadoDias,
              onClick:function(){
                if(!contactadoDias) return;
                var fecha=new Date(HOY); fecha.setDate(fecha.getDate()+contactadoDias);
                var fechaStr=fmtFechaLocal(fecha);
                setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{seguimientoFecha:fechaStr,ultimoContacto:FECHA_HOY,notas:contactadoNota?x.notas+(x.notas?"\n":"")+contactadoNota:x.notas}):x; }));
                setContactadoResult({titulo:"Recordatorio programado",desc:"Te avisaré en "+contactadoDias+" días para retomar con "+nombre+"."});
              }
            },"Guardar")
          )
        )
      );

      if(contactadoOpcion==="quiere_cotizacion") return e("div",{style:st.ov,onClick:cerrar},
        e("div",{style:st.modal,onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{fontSize:15,fontWeight:600,color:C.text,marginBottom:16}},nombre+" quiere cotización"),
          e("button",{style:Object.assign({},st.btnP,{width:"100%"}),
            onClick:function(){
              cerrar();
              setFormCot(Object.assign({},cotVacio,{clienteId:String(cl.id)}));
              setModalCot(true);
            }
          },"+ Crear cotización"),
          e("button",{style:Object.assign({},st.btn,{width:"100%",marginTop:8}),onClick:function(){ setContactadoOpcion(null); }},"← Atrás")
        )
      );

      // PASO 1: Opciones principales (perdido)
      var opExpandP=contactadoOpcion==="expand_aun"?"aun":contactadoOpcion==="expand_despues"?"despues":null;

      function ejecutarOpcion(key){
        if(key==="quiere_cotizacion"){ setContactadoOpcion(key); return; }
        if(key==="aun"||key==="despues"){ setContactadoOpcion("expand_"+key); return; }

        if(key==="interes"){
          var cotPrevia=cotizaciones.filter(function(c){ return c.clienteId===cl.id; }).sort(function(a,b){ return new Date(b.fecha)-new Date(a.fecha); })[0];
          if(cotPrevia){
            setContactadoOpcion("confirmar_restaurar");
            setContactadoResult(null);
            window._cotPreviaTemp={id:cotPrevia.id,concepto:cotPrevia.concepto,monto:cotPrevia.monto};
          } else {
            var evReactiv={fecha:FECHA_HOY,resultado:"Cliente reactivado — regresó como nuevo contacto"};
            setContactadoResult({titulo:"Oportunidad reactivada",desc:nombre+" regresó al inicio del proceso, como nuevo contacto."});
            setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{etapa:"Nuevo contacto",ultimoContacto:FECHA_HOY,fechaEtapa:FECHA_HOY,seguimientoFecha:"",motivoPerdida:"",historialContactos:[...(x.historialContactos||[]),evReactiv]}):x; }));
          }
          return;
        }

        if(key==="perdido"){
          var contactoEvento={fecha:FECHA_HOY,resultado:"Sin interés — confirmado tras recontacto"};
          setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{etapa:"Perdido",ultimoContacto:FECHA_HOY,seguimientoFecha:"",archivado:true,historialContactos:[...(x.historialContactos||[]),contactoEvento]}):x; }));
          setCotizaciones(cotizaciones.map(function(c){ return c.clienteId===cl.id&&c.estatus==="Pendiente"?Object.assign({},c,{estatus:"Rechazada"}):c; }));
          setContactadoResult({titulo:"Marcado como perdido",desc:nombre+" fue archivada. El historial se conserva."});
        }
      }

      function diasExpandido(key,dias,color){
        return e("div",{style:{borderTop:"1px solid "+C.border}},
          e("div",{style:{display:"flex",borderBottom:"1px solid "+C.border}},
            dias.map(function(d,idx){
              return e("div",{key:d,style:{flex:1,textAlign:"center",padding:"9px 0",fontSize:13,fontWeight:500,color:color,borderRight:idx<dias.length-1?"1px solid "+C.border:"none",cursor:"pointer"},
                onClick:function(){
                  var fecha=new Date(HOY); fecha.setDate(fecha.getDate()+d);
                  setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{seguimientoFecha:fmtFechaLocal(fecha),ultimoContacto:FECHA_HOY}):x; }));
                  setContactadoResult({titulo:"Recordatorio programado",desc:"Te avisaré en "+d+" días para retomar con "+nombre+"."});
                }
              },d+"d");
            })
          ),
          e("div",{style:{display:"flex",alignItems:"center",gap:8,padding:"8px 12px"}},
            e("input",{id:"dias-perdido-"+key,type:"number",min:1,placeholder:"Otro...",inputMode:"numeric",
              style:Object.assign({},st.inp,{flex:1,marginBottom:0,padding:"6px 10px",fontSize:13}),
              onKeyDown:function(ev){
                if(ev.key==="Enter"&&ev.target.value){
                  var d=Number(ev.target.value);
                  var fecha=new Date(HOY); fecha.setDate(fecha.getDate()+d);
                  setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{seguimientoFecha:fmtFechaLocal(fecha),ultimoContacto:FECHA_HOY}):x; }));
                  setContactadoResult({titulo:"Recordatorio programado",desc:"Te avisaré en "+d+" días para retomar con "+nombre+"."});
                }
              }
            }),
            e("span",{style:{fontSize:12,color:C.textDim}},"días"),
            e("button",{style:{cursor:"pointer",padding:"6px 14px",borderRadius:8,border:"none",background:color,color:"#fff",fontSize:12,fontWeight:500},
              onClick:function(){
                var inp=document.getElementById("dias-perdido-"+key);
                if(inp&&inp.value){
                  var d=Number(inp.value);
                  var fecha=new Date(HOY); fecha.setDate(fecha.getDate()+d);
                  setClientes(clientes.map(function(x){ return x.id===cl.id?Object.assign({},x,{seguimientoFecha:fmtFechaLocal(fecha),ultimoContacto:FECHA_HOY}):x; }));
                  setContactadoResult({titulo:"Recordatorio programado",desc:"Te avisaré en "+d+" días para retomar con "+nombre+"."});
                }
              }
            },"OK")
          )
        );
      }

      return e("div",{style:st.ov,onClick:cerrar},
        e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",overflowY:"auto"}),onClick:function(ev){ ev.stopPropagation(); }},

          // Header
          e("div",{style:{padding:"20px 20px 12px",borderBottom:"1px solid "+C.border,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}},
            e("div",null,
              e("div",{style:{fontSize:16,fontWeight:600,color:C.text,marginBottom:2}},"¿Qué pasó con "+nombre+"?"),
              e("div",{style:{fontSize:13,color:C.textMuted}},"Elige lo que mejor describe la conversación.")
            )
          ),

          // Opciones
          e("div",{style:{padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}},

            // Mostró interés
            e("div",{style:{borderRadius:12,border:"1px solid "+C.green+"44",overflow:"hidden",cursor:"pointer"},onClick:function(){ ejecutarOpcion("interes"); }},
              e("div",{style:{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}},
                e("div",null,
                  e("div",{style:{fontSize:14,fontWeight:500,color:C.green}},"Mostró interés nuevamente"),
                  e("div",{style:{fontSize:12,color:C.textMuted,marginTop:1}},"Reactivar oportunidad")
                ),
                
              )
            ),

            // Quiere cotización
            e("div",{style:{borderRadius:12,border:"1px solid "+C.border,overflow:"hidden",cursor:"pointer"},onClick:function(){ ejecutarOpcion("quiere_cotizacion"); }},
              e("div",{style:{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}},
                e("div",null,
                  e("div",{style:{fontSize:14,fontWeight:500,color:C.text}},"Quiere cotización"),
                  e("div",{style:{fontSize:12,color:C.textMuted,marginTop:1}},"Crear nueva propuesta")
                ),
                
              )
            ),

            // Aún no responde
            e("div",{style:{borderRadius:12,border:"1px solid "+(opExpandP==="aun"?C.border:C.border),overflow:"hidden"}},
              e("div",{style:{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"},
                onClick:function(){ setContactadoOpcion(opExpandP==="aun"?null:"expand_aun"); }
              },
                e("div",null,
                  e("div",{style:{fontSize:14,fontWeight:500,color:C.purple}},"Aún no responde"),
                  e("div",{style:{fontSize:12,color:C.textMuted,marginTop:1}},"¿Cuándo intento de nuevo?")
                ),
                e("span",{style:{fontSize:16,color:C.textDim}},opExpandP==="aun"?"▲":"▼")
              ),
              opExpandP==="aun"&&diasExpandido("aun",[3,7,14,30],C.purple)
            ),

            // Lo pensará después
            e("div",{style:{borderRadius:12,border:"1px solid "+C.border,overflow:"hidden"}},
              e("div",{style:{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"},
                onClick:function(){ setContactadoOpcion(opExpandP==="despues"?null:"expand_despues"); }
              },
                e("div",null,
                  e("div",{style:{fontSize:14,fontWeight:500,color:C.amber}},"Lo pensará después"),
                  e("div",{style:{fontSize:12,color:C.textMuted,marginTop:1}},"¿En cuántos días lo retomo?")
                ),
                e("span",{style:{fontSize:16,color:C.textDim}},opExpandP==="despues"?"▲":"▼")
              ),
              opExpandP==="despues"&&diasExpandido("despues",[15,30,60,90],C.amber)
            ),

            // Ya no está interesada
            e("div",{style:{borderRadius:12,border:"1px solid "+C.red+"44",overflow:"hidden",cursor:"pointer"},onClick:function(){ ejecutarOpcion("perdido"); }},
              e("div",{style:{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}},
                e("div",null,
                  e("div",{style:{fontSize:14,fontWeight:500,color:C.red}},"Ya no está interesada"),
                  e("div",{style:{fontSize:12,color:C.textMuted,marginTop:1}},"Marcar como perdido")
                ),
                
              )
            )
          ),

          // Footer
          e("div",{style:{padding:"4px 16px 16px"}},
            e("button",{style:Object.assign({},st.btn,{width:"100%",fontSize:13}),onClick:cerrar},"Cancelar")
          )
        )
      );
    })(),

    // MODAL SEGUIMIENTO GANADOS
    seguimientoClienteId&&(function(){
      var cl=clientes.find(function(c){ return c.id===seguimientoClienteId; });
      var dias=Number(seguimientoDias)||0;
      var nombre=cl?(cl.nombre.split(" ")[0]):"[nombre]";
      var negocio=cl?cl.negocio:"";
      var etapa=cl?cl.etapa:"";
      var yaCompro=etapa==="Ganado";

      // Mensajes concretos para mandarle al cliente
      var mensajes=[];
      if(yaCompro){
        mensajes=[
          "Hola "+nombre+", ¿cómo te fue con todo? Aquí estoy si necesitas algo.",
          "Hola "+nombre+(negocio?", ¿cómo van las cosas en "+negocio+"?":","+" ¿cómo has estado?")+" Tengo disponibilidad si surge algo nuevo.",
          "¿Conoces a alguien que pueda necesitar lo que hago? Me ayudaríaras muchísimo si me recomiendas."
        ];
      } else if(etapa==="Negociacion"){
        mensajes=[
          "Hola "+nombre+", ¿pudiste revisar la propuesta? Aquí para resolver cualquier duda.",
          "Hola "+nombre+", solo quería preguntar si hay algo que te genere duda antes de decidir.",
          "Hola "+nombre+", sin presión , solo quiero asegurarme de que tengas todo lo que necesitas para decidir."
        ];
      } else if(etapa==="Cotizacion enviada"){
        mensajes=[
          "Hola "+nombre+", ¿tuviste oportunidad de ver lo que te mandé?",
          "Hola "+nombre+", queria preguntar si tienes alguna duda sobre la propuesta.",
          "Hola "+nombre+", ¿hay algo que pueda aclararte para que sea más fácil decidir?"
        ];
      } else {
        mensajes=[
          "Hola "+nombre+", solo quería saber cómo sigues. Aquí estoy si quieres platicar.",
          "Hola "+nombre+(negocio?", ¿cómo van las cosas en "+negocio+"?":","+" ¿cómo has estado?"),
          "Hola "+nombre+", ¿sigue en pie lo que hablamos? Sin presión, solo quiero saber si puedo ayudarte."
        ];
      }

      // Consejo educativo para el emprendedor
      var consejo="";
      if(yaCompro) consejo="Un cliente que ya te compró tiene 5 veces más probabilidades de volverte a comprar que uno nuevo. No lo descuides.";
      else if(etapa==="Negociacion") consejo="Si lleva días sin responder, casi siempre es por duda, no por desinterés. Pregunta antes de asumir que se perdió.";
      else if(etapa==="Cotizacion enviada") consejo="El 80% de las ventas requieren más de un seguimiento. No escribirle no es respetarle , es perder la venta.";
      else consejo="Mantener el contacto no es perseguir. Es recordarle que existes cuando llegue el momento de necesitarte.";

      return e("div",{style:st.ov,onClick:function(){ setSeguimientoClienteId(null); }},
        e("div",{style:st.modal,onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}},
            e("div",{style:{fontWeight:700,fontSize:18,color:C.text}},"Programar seguimiento"),
            e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:22,lineHeight:1,padding:"0 4px"},onClick:function(){ setSeguimientoClienteId(null); }},"x")
          ),
          e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:20}},cl?cl.nombre:"--"),
          e("div",{style:{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}},
            ["7","15","30","60"].map(function(d){
              var activo=seguimientoDias===d;
              return e("button",{key:d,style:{cursor:"pointer",padding:"8px 16px",borderRadius:12,border:"1px solid "+(activo?"#5B5CF6":C.border),background:activo?"#EEF2FF":"transparent",fontSize:13,color:activo?"#5B5CF6":C.textMuted,fontWeight:activo?600:400},onClick:function(){ setSeguimientoDias(d); }},d+" dias");
            })
          ),
          e("div",{style:{marginBottom:16}},
            e("label",{style:st.lbl},"O ingresa otro plazo"),
            e("div",{style:{position:"relative"}},
              e("input",{type:"number",value:["7","15","30","60"].includes(seguimientoDias)?"":seguimientoDias,onChange:function(ev){ setSeguimientoDias(ev.target.value); },placeholder:"ej. 45, 90, 120",style:Object.assign({},st.inp,{paddingRight:60})}),
              e("span",{style:{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:12,color:C.textDim,pointerEvents:"none"}},"dias")
            )
          ),
          dias>0&&e("div",{style:{marginBottom:12}},
            e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px",marginBottom:8}},"Qué puedes decirle"),
            mensajes.map(function(m,i){
              return e("div",{key:i,style:{fontSize:13,color:C.text,lineHeight:1.6,padding:"10px 12px",background:C.surfaceUp,borderRadius:10,marginBottom:6,border:"1px solid "+C.border}},'"'+m+'"');
            })
          ),
          dias>0&&e("div",{style:{marginBottom:16,padding:"12px 14px",background:"#EEF2FF",borderRadius:12,border:"1px solid #C7D2FE"}},
            e("div",{style:{fontSize:11,fontWeight:700,color:"#4338CA",textTransform:"uppercase",letterSpacing:"1px",marginBottom:6}},"Lo que CLEO recomienda"),
            e("div",{style:{fontSize:13,color:"#312E81",lineHeight:1.65}},consejo)
          ),
          e("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"}},
            e("button",{style:st.btn,onClick:function(){ setSeguimientoClienteId(null); }},"Cancelar"),
            e("button",{style:st.btnP,onClick:function(){
              var d=Number(seguimientoDias);
              if(!d||d<=0) return;
              var fecha=new Date(); fecha.setDate(fecha.getDate()+d);
              setClientes(clientes.map(function(x){ return x.id===seguimientoClienteId?Object.assign({},x,{seguimientoFecha:fmtFechaLocal(fecha)}):x; }));
              setSeguimientoClienteId(null); setSeguimientoDias("");
            }},"Guardar")
          )
        )
      );
    })(),

    // MODAL MOTIVO PERDIDA PIPELINE
    motivoPipelineId&&(function(){
      var cl=clientes.find(function(c){ return c.id===motivoPipelineId; });
      var cotCl=cotizaciones.filter(function(c){ return c.clienteId===motivoPipelineId; }).sort(function(a,b){ return new Date(b.fecha)-new Date(a.fecha); })[0];

      var MOTIVOS_V2=[
        {key:"Precio alto",   icono:"💸",label:"Le pareció caro",    msg:"Un no por precio casi siempre significa que no vio suficiente valor todavía. En unos meses su situación puede cambiar , o tú puedes tener un argumento mejor.",    seg:"60", sugerencia:"Hola [nombre], terminé un proyecto similar y quedó muy bien. Si en algún momento quieres ver cómo quedó, con gusto te lo muestro."},
        {key:"Eligio a otro", icono:"🤝",label:"Eligió a otro",       msg:"El que eligió hoy puede decepcionar mañana. Muchos clientes regresan después de probar a la competencia. Vale la pena quedarse en su radar.",                        seg:"90", sugerencia:"Hola [nombre], ¿cómo te fue con el proyecto? Solo quería saber si resultó como esperabas."},
        {key:"Sin presupuesto",icono:"📆",label:"Sin presupuesto",        msg:"Sin presupuesto hoy no significa sin presupuesto siempre. En unos meses puede tener los recursos que hoy no tiene.",                                                              seg:"90", sugerencia:"Hola [nombre], estoy abriendo agenda para el próximo trimestre. Si quieres que lo tengamos en mente, con gusto."},
        {key:"No respondio",  icono:"💬",label:"Dejó de responder",   msg:"El silencio no es un no definitivo. A veces la gente se pierde en el día a día. Un mensaje en el momento correcto puede reabrir todo.",                              seg:"30", sugerencia:"Hola [nombre], ¿todo bien por allá? , Sin mencionar la cotización. Si responde, ahí retomas la conversación."},
        {key:"Otro",          icono:"📝",label:"Otro motivo",             msg:"Un no de hoy puede ser un sí en 3 meses. Dejar la puerta abierta no cuesta nada y a veces trae la mejor venta.",                                                          seg:"30", sugerencia:"Hola [nombre], ¿cómo has estado? Por aquí si en algún momento surge algo en lo que pueda ayudarte."}
      ];

      var motivoData=consejoMotivo?MOTIVOS_V2.find(function(m){ return m.key===consejoMotivo; })||MOTIVOS_V2[4]:null;

      var esOpoProductos=cl&&cl.estadoProspecto!==undefined&&!cotCl;

      function cerrarPerdida(){
        // Revertir etapa del pipeline
        if(motivoPipelineId&&etapaAnteriorPipeline){
          setClientes(clientes.map(function(c){ return c.id===motivoPipelineId?(esOpoProductos?Object.assign({},c,{estadoProspecto:etapaAnteriorPipeline}):Object.assign({},c,{etapa:etapaAnteriorPipeline})):c; }));
        }
        // Revertir cotizacion
        if(estatusAnteriorCot){ setCotizaciones(cotizaciones.map(function(c){ return c.id===estatusAnteriorCot.cotId?Object.assign({},c,{estatus:estatusAnteriorCot.estatus}):c; })); setEstatusAnteriorCot(null); }
        setMotivoPipelineId(null); setConsejoMotivo(null);
        setMotivoLibre(""); setShowMotivoLibre(false);
        setEtapaAnteriorPipeline(null); setShowSeguimientoLost(false);
        setSeguimientoLost({dias:"",custom:""});
      }

      return e("div",{style:st.ov,onClick:consejoMotivo?null:cancelarMotivoPipeline},
        e("div",{style:Object.assign({},st.modal,{maxWidth:isMobile?"100%":420}),onClick:function(ev){ ev.stopPropagation(); }},

          e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}},
            e("div",null,
              e("div",{style:{fontWeight:700,fontSize:18,color:C.text,marginBottom:4}},"¿Qué pasó con este cliente?")
            ),
            e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:20,lineHeight:1,padding:"0 4px"},onClick:consejoMotivo?cerrarPerdida:cancelarMotivoPipeline},"×")
          ),

          e("div",{style:{marginBottom:16,padding:"10px 14px",background:C.surfaceUp,borderRadius:10,border:"1px solid "+C.border}},
            e("div",{style:{fontWeight:600,color:C.text,fontSize:13}},cl?cl.nombre:"--"),
            cotCl?e("div",{style:{fontSize:12,color:C.textMuted,marginTop:2}},cotCl.concepto+" · $"+Number(cotCl.monto).toLocaleString())
              :(cl&&cl.productoInteres)?e("div",{style:{fontSize:12,color:C.textMuted,marginTop:2}},cl.productoInteres+(cl.precioInteres?" · $"+Number(cl.precioInteres).toLocaleString():""))
              :e("div",{style:{fontSize:12,color:C.textMuted,marginTop:2}},cl?cl.negocio:"")
          ),

          e("div",{style:{marginBottom:12}},
            e("div",{style:{fontSize:12,color:C.textMuted,marginBottom:10}},"Motivo de la pérdida"),
            e("div",{style:{display:"flex",flexDirection:"column",gap:6,marginBottom:8}},
              MOTIVOS_V2.map(function(m){
                var sel=consejoMotivo===m.key;
                return e("button",{key:m.key,
                  style:{cursor:"pointer",padding:"11px 14px",borderRadius:12,textAlign:"left",
                    background:sel?"#EEF2FF":"transparent",
                    border:"1px solid "+(sel?"#5B5CF6":C.border),
                    display:"flex",alignItems:"center",gap:12},
                  onClick:function(){ setConsejoMotivo(m.key); }
                },
                  e("span",{style:{fontSize:18,flexShrink:0,width:24,textAlign:"center"}},m.icono),
                  e("span",{style:{fontSize:13,fontWeight:sel?600:400,color:sel?"#5B5CF6":C.text}},m.label)
                );
              })
            ),
            consejoMotivo==="Otro"&&e("input",{value:motivoLibre,onChange:function(ev){ setMotivoLibre(ev.target.value); },placeholder:"¿Qué pasó exactamente?",style:st.inp,autoFocus:true})
          ),

          motivoData&&e("div",{style:{marginBottom:16}},
            e("div",{style:{fontSize:13,color:"#312E81",lineHeight:1.65,marginBottom:10,padding:"12px 14px",background:"#EEF2FF",borderRadius:12,border:"1px solid #C7D2FE"}},motivoData.msg),
            e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px",marginBottom:6}},"Qué decirle cuando vuelvas a escribirle"),
            e("div",{style:{fontSize:13,color:C.text,lineHeight:1.65,padding:"10px 12px",background:C.surfaceUp,borderRadius:10,border:"1px solid "+C.border}},motivoData.sugerencia.replace("[nombre]",cl?cl.nombre.split(" ")[0]:"[nombre]"))
          ),

          consejoMotivo&&e("div",{style:{marginBottom:16,paddingTop:14,borderTop:"1px solid "+C.border}},
            e("div",{style:{fontSize:13,fontWeight:600,color:C.text,marginBottom:2}},"¿Cuándo volver a escribirle?"),
            e("div",{style:{fontSize:11,color:C.textDim,marginBottom:10}},"Dejar la puerta abierta no cuesta nada."),
            e("div",{style:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:8}},
              ["15","30","60","90"].map(function(d){
                var activo=seguimientoLost.dias===d;
                return e("button",{key:d,style:{cursor:"pointer",padding:"8px 4px",borderRadius:10,textAlign:"center",background:activo?"#EEF2FF":"transparent",border:"1px solid "+(activo?"#5B5CF6":C.border),fontSize:12,fontWeight:activo?600:400,color:activo?"#5B5CF6":C.text},onClick:function(){ setSeguimientoLost({dias:d,custom:""}); }},d+" días");
              })
            ),
            e("div",{style:{position:"relative"}},
              e("input",{type:"number",min:"1",value:["15","30","60","90"].includes(seguimientoLost.dias)?"":seguimientoLost.dias,onChange:function(ev){ setSeguimientoLost({dias:ev.target.value,custom:""}); },placeholder:"Otro plazo...",style:Object.assign({},st.inp,{paddingRight:44})}),
              e("span",{style:{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:11,color:C.textDim,pointerEvents:"none"}},"días")
            )
          ),

          consejoMotivo?e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
            e("button",{style:{cursor:"pointer",padding:"11px",borderRadius:14,border:"none",background:"#5B5CF6",fontSize:13,color:"#fff",fontWeight:600,width:"100%"},
              onClick:function(){
                var dias=Number(seguimientoLost.dias)||Number(motivoData.seg)||30;
                var fecha=new Date(); fecha.setDate(fecha.getDate()+dias);
                var targetId=motivoPipelineId;
                if(esOpoProductos){
                  setClientes(clientes.map(function(c){ return c.id===targetId?Object.assign({},c,{estadoProspecto:"Perdido",motivoPerdida:consejoMotivo==="Otro"?motivoLibre:consejoMotivo,seguimientoFecha:fmtFechaLocal(fecha)}):c; }));
                } else {
                  var cotP=cotizaciones.find(function(c){ return c.clienteId===targetId&&(c.estatus==="Pendiente"||c.estatus==="Aceptada"); });
                  if(cotP) setCotizaciones(cotizaciones.map(function(c){ return c.id===cotP.id?Object.assign({},c,{estatus:"Rechazada",motivoPerdida:consejoMotivo}):c; }));
                  setClientes(clientes.map(function(c){ return c.id===targetId?Object.assign({},c,{seguimientoFecha:fmtFechaLocal(fecha)}):c; }));
                }
                setMotivoPipelineId(null); setConsejoMotivo(null); setMotivoLibre("");
                setEtapaAnteriorPipeline(null); setSeguimientoLost({dias:"",custom:""}); setEstatusAnteriorCot(null);
                if(cl&&!cl.origen) setOrigenPromptId(targetId);
              }
            },seguimientoLost.dias?"Programar en "+seguimientoLost.dias+" días":"Recuérdamelo en "+(motivoData?motivoData.seg:"30")+" días"),
            e("button",{style:{cursor:"pointer",padding:"8px",borderRadius:14,border:"none",background:"transparent",fontSize:12,color:C.textDim,width:"100%"},
              onClick:function(){
                var diasAuto=Number(motivoData?motivoData.seg:30)||30;
                var fecha=new Date(); fecha.setDate(fecha.getDate()+diasAuto);
                var targetId=motivoPipelineId;
                if(esOpoProductos){
                  setClientes(clientes.map(function(c){ return c.id===targetId?Object.assign({},c,{estadoProspecto:"Perdido",motivoPerdida:consejoMotivo==="Otro"?motivoLibre:consejoMotivo,seguimientoFecha:fmtFechaLocal(fecha)}):c; }));
                } else {
                  var cotP2=cotizaciones.find(function(c){ return c.clienteId===targetId&&(c.estatus==="Pendiente"||c.estatus==="Aceptada"); });
                  if(cotP2) setCotizaciones(cotizaciones.map(function(c){ return c.id===cotP2.id?Object.assign({},c,{estatus:"Rechazada",motivoPerdida:consejoMotivo}):c; }));
                  setClientes(clientes.map(function(c){ return c.id===targetId?Object.assign({},c,{seguimientoFecha:fmtFechaLocal(fecha)}):c; }));
                }
                setMotivoPipelineId(null); setConsejoMotivo(null); setMotivoLibre("");
                setEtapaAnteriorPipeline(null); setSeguimientoLost({dias:"",custom:""}); setEstatusAnteriorCot(null);
                if(cl&&!cl.origen) setOrigenPromptId(targetId);
              }
            },"Por ahora no")
          ):e("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"}},
            e("button",{style:st.btn,onClick:cerrarPerdida},"Cancelar \u2014 regresar ficha")
          )
        )
      );
    })(),

    // MODAL SEGUIMIENTO PERDIDO , paso 2
    showSeguimientoLost&&(function(){
      var cl=clientes.find(function(c){ return c.id===clientePerdidoId; });
      var nombre=cl?cl.nombre.split(" ")[0]:"este cliente";

      var MSGS_MOTIVO={
        "Precio alto":"Un no por precio casi siempre significa que no vio suficiente valor todavía. En unos meses su situación puede cambiar , o tú puedes tener un argumento mejor.",
        "Eligio a otro":"El que eligió hoy puede decepcionar mañana. Muchos clientes regresan después de probar a la competencia. Vale la pena quedarse en su radar.",
        "Sin presupuesto":"Sin presupuesto hoy no significa sin presupuesto siempre. En unos meses puede tener los recursos que hoy no tiene.",
        "No respondio":"El silencio no es un no definitivo. A veces la gente se pierde en el día a día. Un mensaje en el momento correcto puede reabrir todo.",
        "Otro":"Un no de hoy puede ser un sí en 3 meses. Dejar la puerta abierta no cuesta nada y a veces trae la mejor venta."
      };
      var msgMotivo=MSGS_MOTIVO[consejoMotivo]||MSGS_MOTIVO["Otro"];

      function cerrarPaso2(){
        setShowSeguimientoLost(false); setConsejoMotivo(null);
        setSeguimientoLost({dias:"",custom:""}); setClientePerdidoId(null);
      }

      function programarRapido(){
        var fecha=new Date(); fecha.setDate(fecha.getDate()+30);
        setClientes(clientes.map(function(c){ return c.id===clientePerdidoId?Object.assign({},c,{seguimientoFecha:fmtFechaLocal(fecha)}):c; }));
        cerrarPaso2();
      }

      return e("div",{style:st.ov},
        e("div",{style:st.modal},
          e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}},
            e("div",{style:{fontWeight:700,fontSize:18,color:C.text}},"¿Cuándo volver a escribirle?"),
            e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:22,lineHeight:1,padding:"0 4px"},onClick:cerrarPaso2},"x")
          ),
          e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:16}},nombre),
          e("div",{style:{fontSize:13,color:"#312E81",lineHeight:1.65,marginBottom:20,padding:"12px 14px",background:"#EEF2FF",borderRadius:12,border:"1px solid #C7D2FE"}},msgMotivo),
          e("div",{style:{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:12}},
            [["15","15 días"],["30","30 días"],["60","60 días"],["90","90 días"]].map(function(op){
              var activo=seguimientoLost.dias===op[0];
              return e("button",{key:op[0],
                style:{cursor:"pointer",padding:"10px 14px",borderRadius:12,textAlign:"center",
                  background:activo?"#EEF2FF":"transparent",
                  border:"1px solid "+(activo?"#5B5CF6":C.border),
                  fontSize:13,fontWeight:activo?600:400,color:activo?"#5B5CF6":C.text},
                onClick:function(){ setSeguimientoLost({dias:op[0],custom:""}); }
              },op[1]);
            })
          ),
          e("div",{style:{marginBottom:20}},
            e("div",{style:{position:"relative"}},
              e("input",{type:"number",min:"1",value:["15","30","60","90"].includes(seguimientoLost.dias)?"":seguimientoLost.dias,onChange:function(ev){ setSeguimientoLost({dias:ev.target.value,custom:""}); },placeholder:"Otro plazo en días",style:Object.assign({},st.inp,{paddingRight:50})}),
              e("span",{style:{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:12,color:C.textDim,pointerEvents:"none"}},"días")
            )
          ),
          e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
            e("button",{style:{cursor:"pointer",padding:"11px",borderRadius:14,border:"none",background:"#5B5CF6",fontSize:13,color:"#fff",fontWeight:600,width:"100%"},onClick:function(){
              if(seguimientoLost.dias) guardarSeguimientoLost();
              else programarRapido();
            }},seguimientoLost.dias?"Programar seguimiento":"Recuérdamelo en 30 días"),
            !seguimientoLost.dias&&e("button",{style:{cursor:"pointer",padding:"11px",borderRadius:14,border:"1px solid "+C.border,background:"transparent",fontSize:13,color:C.textMuted,fontWeight:500,width:"100%"},onClick:programarRapido},"Recuérdamelo en 30 días"),
            e("button",{style:{cursor:"pointer",padding:"8px",borderRadius:14,border:"none",background:"transparent",fontSize:12,color:C.textDim,width:"100%"},onClick:cerrarPaso2},"Por ahora no")
          )
        )
      );
    })(),

    // MODAL ETAPA EDUCATIVO
    modalEtapa&&(function(){
      var cl=clientes.find(function(c){ return c.id===modalEtapa.clienteId; });
      var info=modalEtapa.info;
      return e("div",{style:st.ov,onClick:function(){ setModalEtapa(null); }},
        e("div",{style:Object.assign({},st.modal,{maxWidth:isMobile?"100%":400}),onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{fontSize:11,color:C.purple,fontWeight:600,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.5px"}},"💡 ¿Qué significa esta etapa?"),
          e("div",{style:{fontSize:15,fontWeight:600,color:C.text,marginBottom:6}},modalEtapa.etapa),
          e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:6,lineHeight:1.6}},info.msg),
          e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:20,lineHeight:1.6}},info.accion),
          e("div",{style:{padding:"12px 14px",background:C.amberBg,borderRadius:8,border:"0.5px solid "+C.amberBorder,marginBottom:20,fontSize:13,color:C.amber}},
            "Para mover a "+cl.nombre+" aquí necesitas registrar una cotización primero."
          ),
          e("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"}},
            e("button",{style:st.btn,onClick:function(){ setModalEtapa(null); }},"Cancelar"),
            e("button",{style:st.btnP,onClick:function(){
              setFormCot(Object.assign({},cotVacio,{clienteId:String(modalEtapa.clienteId),estatus:"Pendiente"}));
              setEtapaPendiente({clienteId:modalEtapa.clienteId,etapa:modalEtapa.etapa});
              setModalEtapa(null);
              setModalCot(true);
            }},"Registrar cotización →")
          )
        )
      );
    })(),

    // MODAL COTIZACION RAPIDA , pipeline
    cotRapidaId&&(function(){
      var c=clientes.find(function(x){ return x.id===cotRapidaId; });
      if(!c) return null;
      var cot=cotizaciones.find(function(x){ return x.clienteId===c.id&&x.estatus==="Pendiente"; })
        ||cotizaciones.find(function(x){ return x.clienteId===c.id&&x.estatus==="Aceptada"; })
        ||cotizaciones.find(function(x){ return x.clienteId===c.id; });
      var pagos=cot?(cot.pagos||[]):[];
      var totalPagado=pagos.reduce(function(s,p){ return s+Number(p.monto); },0);
      var saldoReal=cot?cot.monto-totalPagado:0;
      var dias=cot?diasDesde(cot.fecha):0;
      var urlContactar=contactUrl(c,msgEtapa(c,cot?cot.concepto:null));
      var ec=ETAPA_COLOR[c.etapa]||C.purple;
      var diasSinContacto=diasDesde(c.fechaEtapa||c.fecha);
      var esUrgente=diasSinContacto>7&&c.etapa!=="Ganado"&&c.etapa!=="Perdido";
      function irAPerfil(){ setCotRapidaId(null); setVista("clientes"); setClienteAbierto(c.id); setTabCliente("perfil"); }
      return e("div",{style:st.ov,onClick:function(){ setCotRapidaId(null); }},
        e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",maxWidth:isMobile?"100%":420,borderRadius:isMobile?"20px 20px 0 0":20,marginBottom:0,paddingBottom:isMobile?"env(safe-area-inset-bottom,0px)":0}),onClick:function(ev){ ev.stopPropagation(); }},

          // ── HEADER con gradiente sutil ──
          e("div",{style:{
            padding:"20px 20px 16px 20px",
            background:"linear-gradient(135deg,"+ec+"12 0%,transparent 60%)",
            borderBottom:"0.5px solid "+C.border,
            position:"relative"
          }},
            // Botón cerrar
            e("button",{style:{position:"absolute",top:14,right:14,background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:20,lineHeight:1,padding:"2px 6px",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center"},onClick:function(){ setCotRapidaId(null); }},"×"),

            // Avatar + nombre + negocio
            e("div",{style:{display:"flex",gap:14,alignItems:"center",paddingRight:32}},
              e("div",{style:{
                width:48,height:48,borderRadius:"50%",flexShrink:0,
                background:ec,display:"flex",alignItems:"center",
                justifyContent:"center",fontWeight:700,fontSize:15,color:"#fff",
                boxShadow:"0 2px 8px "+ec+"55"
              }},iniciales(c.nombre)),
              e("div",{style:{flex:1,minWidth:0}},
                // Nombre clickeable → va a pestaña de cliente
                e("button",{
                  style:{background:"none",border:"none",cursor:"pointer",padding:0,textAlign:"left",
                    fontWeight:700,fontSize:16,color:C.text,display:"flex",alignItems:"center",gap:6,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"
                  },
                  onClick:irAPerfil,
                  title:"Ver perfil completo"
                },
                  e("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},c.nombre),
                  e("svg",{width:13,height:13,viewBox:"0 0 24 24",fill:"none",style:{flexShrink:0,opacity:0.4}},
                    e("path",{d:"M9 18l6-6-6-6",stroke:C.text,strokeWidth:2.5,strokeLinecap:"round",strokeLinejoin:"round"})
                  )
                ),
                e("div",{style:{fontSize:12,color:C.textMuted,marginTop:1}},c.negocio||c.origen||""),
                // Etapa pill + días urgente
                e("div",{style:{display:"flex",alignItems:"center",gap:8,marginTop:6}},
                  e("span",{style:{
                    display:"inline-flex",alignItems:"center",padding:"3px 10px",borderRadius:20,
                    fontSize:11,fontWeight:600,
                    background:ec+"18",color:ec,border:"1px solid "+ec+"33"
                  }},ETAPAS_LABEL[c.etapa]||c.etapa),
                  esUrgente&&e("span",{style:{
                    display:"inline-flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:20,
                    fontSize:11,fontWeight:500,background:C.redBg,color:C.red,border:"1px solid "+C.redBorder
                  }},"⚠ "+diasSinContacto+" días sin contacto")
                )
              )
            )
          ),

          !cot&&(c.servicioInteres||c.notas)&&e("div",{style:{padding:"14px 20px",borderBottom:"0.5px solid "+C.border,background:C.purplePale}},
            e("div",{style:{fontSize:10,color:C.purple,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}},"📝 Lo que sabemos"),
            c.servicioInteres&&e("div",{style:{fontSize:13,color:C.text,fontWeight:600,lineHeight:1.5}},c.servicioInteres),
            c.notas&&e("div",{style:{fontSize:12,color:C.textMuted,lineHeight:1.5,marginTop:c.servicioInteres?2:0}},c.notas)
          ),

          // ── COTIZACIÓN ──
          e("div",{style:{padding:"16px 20px",borderBottom:"0.5px solid "+C.border}},
            cot?e("div",null,
              e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}},
                e("div",null,
                  e("div",{style:{fontSize:10,color:C.textDim,textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:3}},"Cotización activa"),
                  e("div",{style:{fontSize:14,fontWeight:600,color:C.text,lineHeight:1.3}},cot.concepto)
                ),
                e("div",{style:{textAlign:"right",flexShrink:0,marginLeft:12}},
                  e("div",{style:{fontSize:18,fontWeight:700,color:ec}},"$"+Number(cot.monto).toLocaleString()),
                  cot.vigencia&&e("div",{style:{fontSize:10,color:C.textDim,marginTop:1}},"Vence "+cot.vigencia)
                )
              ),
              // Barra de pago
              (function(){
                var pct=cot.monto>0?Math.min(100,Math.round(totalPagado/cot.monto*100)):0;
                return e("div",{style:{marginBottom:10}},
                  e("div",{style:{display:"flex",justifyContent:"space-between",fontSize:11,color:C.textDim,marginBottom:4}},
                    e("span","Pagado: "+(pct)+"%"),
                    e("span","Saldo: $"+Math.max(0,saldoReal).toLocaleString())
                  ),
                  e("div",{style:{height:5,borderRadius:99,background:C.border,overflow:"hidden"}},
                    e("div",{style:{height:"100%",width:pct+"%",borderRadius:99,background:saldoReal<=0?C.green:C.purple,transition:"width 0.4s"}})
                  )
                );
              })(),
              // Cambiar estatus
              e("div",{style:{display:"flex",gap:6,flexWrap:"wrap"}},
                ["Pendiente","Aceptada","Rechazada"].map(function(est){
                  var lm={"Aceptada":esProductos?"Compró":"Aceptada","Rechazada":esProductos?"No compró":"Rechazada","Pendiente":"Pendiente"};
                  var activo=cot.estatus===est;
                  var col=est==="Aceptada"?C.green:est==="Rechazada"?C.red:C.purple;
                  return e("button",{key:est,style:{
                    cursor:"pointer",padding:"5px 14px",borderRadius:20,
                    border:"1px solid "+(activo?col:C.border),
                    background:activo?col+"18":"transparent",
                    fontSize:11,fontWeight:activo?600:400,color:activo?col:C.textMuted,
                    transition:"all 0.15s"
                  },
                    onClick:function(){ var eraAceptada=cot.estatus==="Aceptada"; cambiarEstatus(cot.id,est); if(est==="Aceptada"&&!eraAceptada&&!esProductos) mostrarToastTrabajo(); }
                  },lm[est]||est);
                })
              )
            ):e("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",padding:"18px 0",gap:10}},
              e("div",{style:{width:40,height:40,borderRadius:"50%",background:C.purplePale,display:"flex",alignItems:"center",justifyContent:"center"}},
                e("svg",{width:18,height:18,viewBox:"0 0 24 24",fill:"none"},e("path",{d:"M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",stroke:C.purple,strokeWidth:1.5,strokeLinecap:"round",strokeLinejoin:"round"}))
              ),
              e("div",{style:{fontSize:13,color:C.textMuted,textAlign:"center"}},"Sin cotización registrada"),
              e("button",{style:Object.assign({},st.btnP,{fontSize:12,padding:"8px 20px"}),onClick:function(){ setFormCot(Object.assign({},cotVacio,{clienteId:String(c.id),concepto:c.servicioInteres||c.notas||""})); setModalCot(true); setCotRapidaId(null); }},"+ Crear cotización")
            )
          ),

          // ── ACCIONES ──
          e("div",{style:{padding:"14px 20px",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",background:C.surfaceUp}},
            urlContactar&&e("a",{
              href:urlContactar,target:"_blank",rel:"noreferrer",
              style:{
                cursor:"pointer",padding:"8px 16px",borderRadius:10,
                border:"none",fontSize:12,color:"#fff",fontWeight:600,
                textDecoration:"none",display:"inline-flex",alignItems:"center",gap:7,
                background:c.canalPrincipal==="WhatsApp"?C.green:c.canalPrincipal==="Instagram"?"#D85A30":c.canalPrincipal==="Messenger"?"#185FA5":C.purple,
                boxShadow:"0 1px 4px rgba(0,0,0,0.15)",flex:"1 1 auto"
              }
            },e(SvgIcon,{canal:c.canalPrincipal||"WhatsApp",size:13}),contactLabel(c)),
            cot&&e("button",{style:Object.assign({},st.btn,{fontSize:12,padding:"8px 14px",flex:"0 0 auto"}),onClick:function(){ editarCot(cot); setCotRapidaId(null); }},"Editar cot."),
            cot&&e("button",{
              style:Object.assign({},st.btn,{fontSize:12,padding:"8px 14px",flex:"0 0 auto",display:"inline-flex",alignItems:"center",gap:5}),
              onClick:function(){ generarPDFCot(cot,c,perfil); },
              title:"Ver cotización en PDF"
            },
              e("svg",{width:13,height:13,viewBox:"0 0 24 24",fill:"none"},
                e("path",{d:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z",stroke:"currentColor",strokeWidth:1.5,strokeLinejoin:"round"}),
                e("path",{d:"M12 3v6h6M9 13h2m-2 3h6",stroke:"currentColor",strokeWidth:1.5,strokeLinecap:"round"})
              ),
              "PDF"
            ),
            e("button",{
              style:{cursor:"pointer",padding:"8px 14px",borderRadius:10,border:"none",background:"transparent",fontSize:12,color:C.textDim,display:"inline-flex",alignItems:"center",gap:4,marginLeft:"auto"},
              onClick:function(){
                if(window.confirm("¿Eliminar a "+c.nombre+"? Se borrarán también sus cotizaciones.")){
                  var idBorrar=c.id;
                  setCotRapidaId(null);
                  setTimeout(function(){ eliminarCliente(idBorrar); },100);
                }
              }
            },
              e("svg",{width:13,height:13,viewBox:"0 0 24 24",fill:"none"},e("path",{d:"M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",stroke:C.red,strokeWidth:1.5,strokeLinecap:"round",strokeLinejoin:"round"}))
            )
          )
        )
      );
    })(),

    // MODAL GUARDAR SERVICIO
    guardarSvModal&&e("div",{style:st.ov,onClick:function(){ setGuardarSvModal(null); }},
      e("div",{style:Object.assign({},st.modal,{maxWidth:isMobile?"100%":380}),onClick:function(ev){ ev.stopPropagation(); }},
        e("div",{style:{fontSize:15,fontWeight:600,color:C.text,marginBottom:8}},"¿Guardar en Mi catálogo?"),
        e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:16,lineHeight:1.6}},
          "Agregaste \""+guardarSvModal.nombre+"\" por $"+Number(guardarSvModal.precio).toLocaleString()+". ¿Quieres guardarlo para usarlo más rápido la próxima vez?"
        ),
        e("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"}},
          e("button",{style:st.btn,onClick:function(){
            var pend=guardarSvModal.pendientes||[];
            if(pend.length>0) setGuardarSvModal({nombre:pend[0].nombre,precio:Number(pend[0].precio)||0,descripcion:"",condiciones:"",pendientes:pend.slice(1)});
            else setGuardarSvModal(null);
          }},"No, era único"),
          e("button",{style:st.btnP,onClick:function(){
            var yaExisteAhora=catActivo.some(function(s){ return s.nombre.trim().toLowerCase()===guardarSvModal.nombre.trim().toLowerCase(); });
            if(!yaExisteAhora){
              setCatActivo([...catActivo,{id:Date.now(),nombre:guardarSvModal.nombre,precio:guardarSvModal.precio,descripcion:"",condiciones:""}]);
            }
            var pend=guardarSvModal.pendientes||[];
            if(pend.length>0) setGuardarSvModal({nombre:pend[0].nombre,precio:Number(pend[0].precio)||0,descripcion:"",condiciones:"",pendientes:pend.slice(1)});
            else setGuardarSvModal(null);
          }},"Sí, guardarlo")
        )
      )
    ),

    // MODAL REGISTRAR PAGO
    pagosModalId&&(function(){
      var listaOrigenPago=pagosModalTipo==="pedido"?pedidos:pagosModalTipo==="venta"?ventas:cotizaciones;
      var cot=listaOrigenPago.find(function(c){ return c.id===pagosModalId; });
      function actualizarListaPagos(nuevaLista){ if(pagosModalTipo==="pedido") setPedidos(nuevaLista); else if(pagosModalTipo==="venta") setVentas(nuevaLista); else setCotizaciones(nuevaLista); }
      var cl=cot?clientes.find(function(c){ return c.id===cot.clienteId; }):null;
      var pagos=cot?cot.pagos||[]:[];
      var totalPagado=pagos.reduce(function(s,p){ return s+Number(p.monto); },0);
      var montoTotalCot=cot?Number(pagosModalTipo==="pedido"?cot.total:cot.monto):0;
      var conceptoCot=cot?(pagosModalTipo==="pedido"?cot.productos:cot.concepto):"";
      var cotParaComprobante=cot&&pagosModalTipo==="pedido"?Object.assign({},cot,{monto:cot.total,concepto:cot.productos}):cot;
      var saldoReal=cot?montoTotalCot-totalPagado:0;
      var pc=perfil.color||C.purple;
      return e("div",{style:st.ov,onClick:function(){ setPagosModalId(null); setPagosModalTipo("cotizacion"); }},
        e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",overflowY:"auto"}),onClick:function(ev){ ev.stopPropagation(); }},

          // HEADER
          e("div",{style:{padding:"20px 24px 16px",borderBottom:"1px solid "+C.border,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}},
            e("div",null,
              e("div",{style:{fontWeight:700,fontSize:16,color:C.text,marginBottom:3}},"Registrar pago"),
              e("div",{style:{fontSize:12,color:C.textMuted}},(cl?cl.nombre:"--")+" · "+conceptoCot+" · $"+(cot?montoTotalCot.toLocaleString():""))
            ),
            e("button",{style:{background:"transparent",border:"1px solid "+C.border,cursor:"pointer",color:C.textDim,fontSize:16,width:28,height:28,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},onClick:function(){ setPagosModalId(null); setPagosModalTipo("cotizacion"); }},"×")
          ),

          pagosModalTipo==="cotizacion"&&cot&&e("div",{style:{padding:"12px 24px",borderBottom:"1px solid "+C.border}},
            e("button",{style:{cursor:"pointer",padding:"7px 14px",borderRadius:8,border:"1px solid "+C.border,background:"transparent",fontSize:12,color:C.text,fontWeight:500,display:"flex",alignItems:"center",gap:6},onClick:function(){ generarPDFCot(cot,cl,perfil); }},"📄 Ver propuesta original (PDF)")
          ),

          // BODY
          e("div",{style:{padding:"20px 24px",overflowY:"auto",maxHeight:"65vh"}},

            // Pagos existentes
            pagos.length>0&&e("div",{style:{marginBottom:20}},
              e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px",marginBottom:10}},"Pagos registrados"),
              e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
                pagos.map(function(p){
                  return e("div",{key:p.id,style:{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:C.surfaceUp,borderRadius:10,border:"1px solid "+C.border}},
                    e("div",{style:{flex:1}},
                      e("div",{style:{fontSize:13,fontWeight:600,color:C.text}},p.concepto||"Pago"),
                      e("div",{style:{fontSize:11,color:C.textDim,marginTop:1}},p.fecha)
                    ),
                    e("div",{style:{fontSize:14,fontWeight:700,color:C.green,marginRight:6}},"$"+Number(p.monto).toLocaleString()),
                    e("button",{style:{cursor:"pointer",padding:"4px 10px",borderRadius:8,border:"1px solid "+C.amberBorder,background:"transparent",fontSize:11,color:C.amber,fontWeight:500,whiteSpace:"nowrap"},
                      onClick:function(){ generarComprobantePago(p,cotParaComprobante,cl,perfil); }
                    },"Comprobante"),
                    e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.red,fontSize:16,padding:"2px 4px",marginLeft:2},
                      onClick:(function(pid){ return function(){ var updated=listaOrigenPago.map(function(c){ return c.id===pagosModalId?Object.assign({},c,{pagos:(c.pagos||[]).filter(function(x){ return x.id!==pid; })}):c; }); actualizarListaPagos(updated); }; })(p.id)
                    },"×")
                  );
                })
              ),
              e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderRadius:10,background:saldoReal<=0?"#F0FDF4":C.amberBg,border:"1px solid "+(saldoReal<=0?"#86EFAC":C.amberBorder),marginTop:10}},
                e("span",{style:{fontSize:13,color:saldoReal<=0?"#166534":C.amber,fontWeight:500}},"Saldo pendiente"),
                e("span",{style:{fontSize:16,fontWeight:700,color:saldoReal<=0?C.green:C.amber}},"$"+Math.max(0,saldoReal).toLocaleString())
              )
            ),

            // Formulario nuevo pago
            saldoReal>0&&e("div",null,
              pagos.length>0&&e("div",{style:{height:1,background:C.border,marginBottom:20}}),
              e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px",marginBottom:12}},"Agregar pago"),
              e("div",{style:{marginBottom:14}},
                e("label",{style:st.lbl},"Tipo de pago"),
                e("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}},
                  ["Anticipo","Segundo pago","Pago final","Otro"].map(function(c){
                    var activo=formPago.concepto===c;
                    return e("button",{key:c,style:{cursor:"pointer",padding:"7px 14px",borderRadius:10,border:"1.5px solid "+(activo?pc:C.border),background:activo?pc:"transparent",fontSize:12,color:activo?"#fff":C.textMuted,fontWeight:activo?600:400,transition:"all 0.15s"},onClick:function(){
                      var nuevoMonto=formPago.monto;
                      if(c==="Pago final") nuevoMonto=String(Math.max(0,saldoReal));
                      setFormPago(Object.assign({},formPago,{concepto:c,monto:nuevoMonto}));
                    }},c);
                  })
                )
              ),
              e("div",{style:{display:"flex",gap:10,flexWrap:"wrap"}},
                e("div",{style:{flex:"1 1 120px"}},e("label",{style:st.lbl},"Monto"),e(MontoInput,{value:formPago.monto,onChange:function(ev){ setFormPago(Object.assign({},formPago,{monto:ev.target.value})); },placeholder:"0",style:st.inp})),
                e("div",{style:{flex:"1 1 140px",minWidth:0}},e("label",{style:st.lbl},"Fecha"),e("input",{type:"date",value:formPago.fecha,onChange:function(ev){ setFormPago(Object.assign({},formPago,{fecha:ev.target.value})); },style:Object.assign({},st.inp,{width:"100%",maxWidth:"100%",boxSizing:"border-box",display:"block",minWidth:0,WebkitAppearance:"none"})}))
              )
            ),

            // Pagado completo
            saldoReal<=0&&e("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"14px 16px",background:"#F0FDF4",borderRadius:12,border:"1px solid #86EFAC"}},
              e("span",{style:{fontSize:20}},"✅"),
              e("div",null,
                e("div",{style:{fontSize:13,fontWeight:700,color:"#166534"}},"Pagado completamente"),
                e("button",{style:{cursor:"pointer",marginTop:4,padding:"4px 12px",borderRadius:8,border:"1px solid "+C.amberBorder,background:"transparent",fontSize:12,color:C.amber,fontWeight:500},onClick:function(){ generarComprobanteGeneral(cotParaComprobante,cl,perfil); }},"Ver comprobante general")
              )
            )
          ),

          // FOOTER
          e("div",{style:{padding:"14px 24px",borderTop:"1px solid "+C.border,display:"flex",justifyContent:"flex-end",gap:8,background:C.surfaceUp}},
            e("button",{style:st.btn,onClick:function(){ setPagosModalId(null); setPagosModalTipo("cotizacion"); }},"Cerrar"),
            saldoReal>0&&e("button",{style:Object.assign({},st.btnP,{opacity:!formPago.monto||Number(formPago.monto)<=0?0.4:1}),
              disabled:!formPago.monto||Number(formPago.monto)<=0,
              onClick:function(){
                var nuevoPago={id:"p_"+Date.now(),monto:Number(formPago.monto),fecha:formPago.fecha,concepto:formPago.concepto};
                actualizarListaPagos(listaOrigenPago.map(function(c){ return c.id===pagosModalId?Object.assign({},c,{pagos:[...(c.pagos||[]),nuevoPago]}):c; }));
                setFormPago({monto:"",fecha:FECHA_HOY,concepto:"Pago"});
              }
            },"+ Guardar pago")
          )
        )
      );
    })(),

    // MODAL ANTICIPO (legacy , mantener por compatibilidad)
    anticCotId&&(function(){
      var cot=cotizaciones.find(function(c){ return c.id===anticCotId; });
      var cl=cot?clientes.find(function(c){ return c.id===cot.clienteId; }):null;
      var saldo=cot?cot.monto-Number(anticVal.monto||0):0;
      return e("div",{style:st.ov,onClick:function(){ setAnticCotId(null); }},
        e("div",{style:st.modal,onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{fontWeight:600,fontSize:15,marginBottom:4,color:C.text}},"Registrar anticipo"),
          e("div",{style:{fontSize:12,color:C.textMuted,marginBottom:16}},(cl?cl.nombre:"--")+" · "+(cot?cot.concepto:"")+" · $"+(cot?Number(cot.monto).toLocaleString():"")),
          e("div",{style:{marginBottom:12}},e("label",{style:st.lbl},"Monto del anticipo"),e(MontoInput,{value:anticVal.monto,onChange:function(ev){ setAnticVal(Object.assign({},anticVal,{monto:ev.target.value})); },placeholder:"0",style:st.inp})),
          e("div",{style:{marginBottom:16}},e("label",{style:st.lbl},"Fecha de pago"),e("input",{type:"date",value:anticVal.fecha,onChange:function(ev){ setAnticVal(Object.assign({},anticVal,{fecha:ev.target.value})); },style:Object.assign({},st.inp,{width:"100%",maxWidth:"100%",boxSizing:"border-box",display:"block",minWidth:0,WebkitAppearance:"none"})})),
          Number(anticVal.monto)>0&&e("div",{style:{background:C.surfaceUp,borderRadius:8,padding:"10px 12px",marginBottom:16}},
            e("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},e("span",{style:{fontSize:13,color:C.textMuted}},"Total"),e("span",{style:{fontSize:13,color:C.text}},"$"+(cot?Number(cot.monto).toLocaleString():""))),
            e("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},e("span",{style:{fontSize:13,color:C.textMuted}},"Anticipo"),e("span",{style:{fontSize:13,color:C.green}},"$"+Number(anticVal.monto).toLocaleString())),
            e("div",{style:{display:"flex",justifyContent:"space-between"}},e("span",{style:{fontSize:13,color:C.textMuted}},"Saldo pendiente"),e("span",{style:{fontSize:13,fontWeight:600,color:saldo===0?C.green:C.amber}},"$"+Number(saldo).toLocaleString()))
          ),
          e("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"}},e("button",{style:st.btn,onClick:function(){ setAnticCotId(null); }},"Cancelar"),e("button",{style:st.btnP,onClick:function(){ guardarAnticipo(anticCotId,anticVal.monto,anticVal.fecha); setAnticCotId(null); }},"Guardar"))
        )
      );
    })(),

    // MODAL GUARDAR PRODUCTO EN CATÁLOGO (oportunidad)
    guardarProdOpo&&e("div",{style:st.ov,onClick:function(){ setGuardarProdOpo(null); }},
      e("div",{style:Object.assign({},st.modal,{maxWidth:380,padding:"24px"}),onClick:function(ev){ ev.stopPropagation(); }},
        e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:8}},"¿Guardar en tu catálogo?"),
        e("div",{style:{fontSize:13,color:C.textMuted,marginBottom:20,lineHeight:1.6}},
          "\""+guardarProdOpo.nombre+"\" no está en tu catálogo."+(guardarProdOpo.precio>0?" Se guardaría con precio $"+Number(guardarProdOpo.precio).toLocaleString()+".":"")
        ),
        e("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"}},
          e("button",{style:st.btn,onClick:function(){ setGuardarProdOpo(null); }},"No, solo esta vez"),
          e("button",{style:st.btnP,onClick:function(){
            setProductosCat([{id:Date.now(),nombre:guardarProdOpo.nombre,precio:guardarProdOpo.precio,descripcion:"",condiciones:""},...productosCat]);
            setGuardarProdOpo(null);
          }},"Sí, guardar")
        )
      )
    ),

    // MODAL CONFIRMACIÓN CREAR PEDIDO (cuando está en Nueva)
    confirmPedidoData&&e("div",{style:st.ov,onClick:function(){ setConfirmPedidoData(null); }},
      e("div",{style:Object.assign({},st.modal,{maxWidth:380,padding:"24px"}),onClick:function(ev){ ev.stopPropagation(); }},
        e("div",{style:{fontSize:18,marginBottom:12}},"📦"),
        e("div",{style:{fontSize:15,fontWeight:700,color:C.text,marginBottom:8}},"¿Ya acordaron el precio?"),
        e("div",{style:{fontSize:13,color:C.textMuted,lineHeight:1.6,marginBottom:20}},"Esta oportunidad está como Nueva. Confirma solo si ya tienen un trato."),
        e("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"}},
          e("button",{style:st.btn,onClick:function(){ setConfirmPedidoData(null); }},"Cancelar"),
          e("button",{style:st.btnP,onClick:function(){
            var c=confirmPedidoData;
            var ahora=new Date().toISOString();
            setClientes(clientes.map(function(x){
              return x.id===c.id?Object.assign({},x,{estadoProspecto:"Convertido",etapa:"Ganado",fechaPedido:ahora}):x;
            }));
            var nuevoPedido={id:"ped_"+Date.now(),clienteId:c.id,productos:c.productoInteres||"",cantidad:1,total:Number(c.precioInteres)||0,pagos:[],estadoPedido:"preparando",notas:c.notasProspecto||"",fecha:FECHA_HOY,fechaCreado:ahora};
            setPedidos([nuevoPedido,...pedidos]);
            setCelebPedidoData({clienteNombre:c.nombre,producto:c.productoInteres||"",precio:c.precioInteres||0,clienteId:c.id});
            setCelebPaso(1); setCelebRazon([]);
            setConfirmPedidoData(null);
            setVista("pedidos");
          }},"Sí, crear pedido")
        )
      )
    ),

    // MODAL CELEBRACIÓN: OPORTUNIDAD → PEDIDO (productos)
    celebPedidoData&&(function(){
      var d=celebPedidoData;
      var nombre=d.clienteNombre.split(" ")[0];
      return e("div",{style:st.ov},
        e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",maxWidth:440}),onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{padding:"28px 24px 24px",textAlign:"center",background:"linear-gradient(135deg,#ECFDF5 0%,#D1FAE5 100%)",borderBottom:"1px solid #6EE7B7"}},
            e("div",{style:{fontSize:40,marginBottom:8}},"🎉"),
            e("div",{style:{fontSize:11,fontWeight:700,color:"#10B981",textTransform:"uppercase",letterSpacing:"1px",marginBottom:6}},"¡Nuevo pedido!"),
            e("div",{style:{fontSize:20,fontWeight:700,color:C.text,lineHeight:1.3}},"¡"+nombre+" confirmó su pedido!"),
            d.producto&&e("div",{style:{fontSize:14,color:C.textMuted,marginTop:4}},d.producto+(d.precio?" · $"+Number(d.precio).toLocaleString():""))
          ),
          e("div",{style:{padding:"20px 24px 24px",display:"flex",flexDirection:"column",gap:12}},
            e("div",{style:{fontSize:13,color:C.textMuted,lineHeight:1.6,textAlign:"center"}},"El pedido ya está en tu lista."),
            e("button",{
              style:{cursor:"pointer",padding:"12px",borderRadius:12,border:"none",background:C.green,fontSize:14,color:"#fff",fontWeight:700,width:"100%"},
              onClick:function(){ setCelebPedidoData(null); }
            },"Ver pedidos →")
          )
        )
      );
    })(),

    // MODAL CELEBRACIÓN: PEDIDO ENTREGADO (productos)
    celebEntregadoData&&(function(){
      var d=celebEntregadoData;
      var nombre=d.clienteNombre.split(" ")[0];
      var RAZONES=[{k:"Le gustó el producto",e:"✨"},{k:"Precio justo",e:"💰"},{k:"Confianza",e:"🤝"},{k:"Recomendación",e:"👥"},{k:"Rapidez",e:"⚡"},{k:"Calidad",e:"🌟"}];
      var feedbacks={"Le gustó el producto":"El producto habló solo. Considera mostrar más fotos del proceso o resultado.","Precio justo":"Cerraron por precio justo, no por barato. Hay diferencia.","Confianza":"La confianza se construye con consistencia. Sigue así.","Recomendación":"Las recomendaciones cierran 4x más rápido. ¿Ya le pediste un referido?","Rapidez":"La rapidez fue tu diferenciador. Los clientes valoran no esperar.","Calidad":"La calidad habla sola. Probablemente te va a recomendar."};
      var msgReferido="Hola "+nombre+", muchas gracias por tu compra 🙏 Si conoces a alguien que pueda interesarle lo que hago, me ayudaría mucho que me recomendaras.";
      var cl=clientes.find(function(c){ return c.id===d.clienteId; });
      var canal=cl?cl.canalPrincipal||"WhatsApp":"WhatsApp";
      var urlReferido=null;
      var labelCanal="WhatsApp"; var colorCanal="#25D366";
      if(cl){
        if(canal==="Instagram"&&cl.instagram){
          urlReferido="https://instagram.com/"+cl.instagram.replace("@","");
          labelCanal="Instagram"; colorCanal="#E1306C";
        } else if(canal==="Facebook"&&cl.messenger){
          urlReferido="https://m.me/"+cl.messenger;
          labelCanal="Facebook"; colorCanal="#1877F2";
        } else if(cl.contacto){
          urlReferido="https://wa.me/52"+cl.contacto.replace(/\D/g,"")+"?text="+encodeURIComponent(msgReferido);
          labelCanal="WhatsApp"; colorCanal="#25D366";
        }
      }

      function guardarYCerrar(){
        if(celebRazon.length>0&&cl){
          setClientes(clientes.map(function(c){ return c.id===cl.id?Object.assign({},c,{razonCierre:celebRazon,ultimoContacto:FECHA_HOY}):c; }));
        }
        var diasGuardar=celebRecontacto||"30";
        if(cl){
          var fechaR=new Date(HOY); fechaR.setDate(fechaR.getDate()+Number(diasGuardar));
          setClientes(clientes.map(function(c){ return c.id===cl.id?Object.assign({},c,{seguimientoFecha:fmtFechaLocal(fechaR)}):c; }));
        }
        setCelebEntregadoData(null); setCelebPaso(1); setCelebRazon([]);
      }

      if(celebPaso===1) return e("div",{style:st.ov},        e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",maxWidth:460}),onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{padding:"24px 24px 20px",background:"linear-gradient(135deg,#ECFDF5 0%,#D1FAE5 100%)",borderBottom:"1px solid #6EE7B7",textAlign:"center"}},
            e("div",{style:{fontSize:36,marginBottom:6}},"🎉"),
            e("div",{style:{fontSize:11,fontWeight:700,color:"#10B981",textTransform:"uppercase",letterSpacing:"1px",marginBottom:4}},"Pedido entregado"),
            e("div",{style:{fontSize:19,fontWeight:700,color:C.text,lineHeight:1.3}},"¡"+nombre+" recibió su pedido!"),
            d.producto&&e("div",{style:{fontSize:13,color:C.textMuted,marginTop:4}},d.producto+(d.precio?" · $"+Number(d.precio).toLocaleString():""))
          ),
          e("div",{style:{padding:"20px 24px",display:"flex",flexDirection:"column",gap:16}},
            e("div",null,
              e("div",{style:{fontSize:14,fontWeight:600,color:C.text,marginBottom:2}},"¿Por qué crees que compró?"),
              e("div",{style:{fontSize:12,color:C.textDim,marginBottom:10}},"Opcional — en 5 ventas CLEO te dirá qué está funcionando."),
              e("div",{style:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}},
                RAZONES.map(function(r){
                  var activo=celebRazon.indexOf(r.k)>=0;
                  return e("button",{key:r.k,
                    style:{cursor:"pointer",padding:"8px 4px",minHeight:44,borderRadius:10,border:"1.5px solid "+(activo?C.purple:C.border),background:activo?C.purple:"transparent",fontSize:11,color:activo?"#fff":C.textMuted,fontWeight:activo?600:400,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1.3},
                    onClick:function(){
                      if(activo) setCelebRazon(celebRazon.filter(function(x){ return x!==r.k; }));
                      else setCelebRazon([...celebRazon,r.k]);
                    }
                  },r.e+" "+r.k);
                })
              ),
              celebRazon.length>0&&feedbacks[celebRazon[0]]&&e("div",{style:{fontSize:12,color:C.textMuted,lineHeight:1.6,padding:"10px 12px",background:C.surfaceUp,borderRadius:8,borderLeft:"2px solid "+C.purple,marginTop:10}},feedbacks[celebRazon[0]])
            )
          ),
          e("div",{style:{padding:"14px 24px",borderTop:"1px solid "+C.border,display:"flex",gap:8,justifyContent:"flex-end",background:C.surfaceUp}},
            e("button",{style:st.btnP,onClick:function(){ setCelebPaso(2); }},"Siguiente →")
          )
        )
      );

      if(celebPaso===2) return e("div",{style:st.ov},
        e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",maxWidth:440})},
          e("div",{style:{padding:"20px 24px 16px",borderBottom:"1px solid "+C.border}},
            e("div",{style:{fontSize:16,fontWeight:700,color:C.text,marginBottom:4}},"¿Pedirle un referido?"),
            e("div",{style:{fontSize:13,color:C.textMuted,lineHeight:1.5}},"Un cliente satisfecho es tu mejor vendedor. Este es el mejor momento para pedirle que te recomiende.")
          ),
          e("div",{style:{padding:"20px 24px",display:"flex",flexDirection:"column",gap:10}},
            e("a",{
              href:urlReferido||("https://wa.me/?text="+encodeURIComponent(msgReferido)),
              target:"_blank",rel:"noreferrer",
              style:{cursor:"pointer",padding:"12px 16px",borderRadius:12,border:"none",background:colorCanal,fontSize:13,color:"#fff",fontWeight:600,textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:8},
              onClick:function(){ setCelebPaso(3); }
            },"💬 Pedir referido por "+labelCanal),
            e("button",{style:Object.assign({},st.btn,{padding:"12px 16px",fontSize:13}),onClick:function(){ setCelebPaso(3); }},"Ahora no → siguiente")
          )
        )
      );

      if(celebPaso===3) return e("div",{style:st.ov},
        e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",maxWidth:460})},

          // Indicador de pasos
          e("div",{style:{padding:"16px 24px 0",display:"flex",gap:6,alignItems:"center"}},
            [1,2,3].map(function(n){
              return e("div",{key:n,style:{width:n===3?24:8,height:8,borderRadius:20,background:n===3?C.purple:n<3?C.green:C.border,transition:"all 0.2s"}});
            })
          ),

          e("div",{style:{padding:"16px 24px 12px",borderBottom:"1px solid "+C.border}},
            e("div",{style:{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}},"¿Cuándo quieres volver a escribirle?"),
            e("div",{style:{fontSize:13,color:C.textMuted,lineHeight:1.6}},"Un cliente que ya te compró tiene 5 veces más probabilidades de volverte a comprar. No dejes que se enfríe la relación.")
          ),

          e("div",{style:{padding:"16px 24px",display:"flex",flexDirection:"column",gap:10}},
            // Opciones con descripción
            e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}},
              [
                {dias:"15",label:"15 días",sub:"Pedir referido"},
                {dias:"30",label:"30 días",sub:"Ver si necesita algo más"},
                {dias:"60",label:"60 días",sub:"Ofrecer algo nuevo"},
                {dias:"90",label:"90 días",sub:"Mantenerte presente"},
              ].map(function(op){
                var activo=celebRecontacto===op.dias;
                return e("button",{key:op.dias,
                  style:{cursor:"pointer",padding:"12px",borderRadius:12,border:"1.5px solid "+(activo?C.purple:C.border),background:activo?C.purple:"transparent",textAlign:"center",transition:"all 0.1s"},
                  onClick:function(){ setCelebRecontacto(op.dias); }
                },
                  e("div",{style:{fontSize:15,fontWeight:700,color:activo?"#fff":C.text}},op.label),
                  e("div",{style:{fontSize:11,color:activo?"rgba(255,255,255,0.7)":C.textDim,marginTop:2}},op.sub)
                );
              })
            ),

            // Días personalizados
            e("div",{style:{display:"flex",alignItems:"center",gap:8}},
              e("span",{style:{fontSize:12,color:C.textMuted}},"O en"),
              e("input",{
                type:"number",min:"1",max:"365",
                value:["15","30","60","90"].indexOf(celebRecontacto)>=0?"":celebRecontacto,
                onChange:function(ev){ setCelebRecontacto(ev.target.value); },
                style:Object.assign({},st.inp,{width:70,textAlign:"center",padding:"6px 10px"}),
                placeholder:"45"
              }),
              e("span",{style:{fontSize:12,color:C.textMuted}},"días personalizados")
            ),

            // Mensaje sugerido
            celebRecontacto&&e("div",{style:{padding:"12px 14px",background:C.purplePale,borderRadius:10,borderLeft:"3px solid "+C.purple}},
              e("div",{style:{fontSize:11,color:C.textDim,marginBottom:4}},"Qué le puedes decir cuando llegue el momento"),
              e("div",{style:{fontSize:13,color:C.text,lineHeight:1.6}},
                (function(){
                  var msgs={
                    "15":"Hola "+nombre+", espero que todo haya llegado perfecto. ¿Conoces a alguien que pueda interesarle lo que hago?",
                    "30":"Hola "+nombre+", ¿cómo has estado? Si en algún momento necesitas algo o surge algo nuevo, aquí estoy.",
                    "60":"Hola "+nombre+", tengo cosas nuevas que creo que te van a gustar. ¿Te cuento?",
                    "90":"Hola "+nombre+", han pasado unos meses. Solo quería saludar y saber cómo estás."
                  };
                  return msgs[celebRecontacto]||("Hola "+nombre+", ¿cómo has estado? Quería saber si necesitas algo.");
                })()
              )
            )
          ),

          e("div",{style:{padding:"14px 24px",borderTop:"1px solid "+C.border,display:"flex",gap:8,background:C.surfaceUp}},
            e("button",{style:Object.assign({},st.btn,{flex:1,padding:"11px",fontSize:13}),onClick:guardarYCerrar},"Ahora no, recordarme en 30 días"),
            e("button",{style:Object.assign({},st.btnP,{flex:1,padding:"11px",fontSize:13}),onClick:guardarYCerrar},"Programar seguimiento")
          )
        )
      );

      return null;
    })(),

    // MODAL PERFIL
    // MODAL PERFIL , solo datos del negocio
    // MODAL MI CUENTA
    modalCuenta&&e("div",{style:st.ov,onClick:function(){ setModalCuenta(false); }},
      e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",maxWidth:isMobile?"100%":460,borderRadius:isMobile?"20px 20px 0 0":24,display:"flex",flexDirection:"column"}),onClick:function(ev){ ev.stopPropagation(); }},

        // HEADER
        e("div",{style:{padding:"20px 24px 16px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"flex-start",justifyContent:"space-between"}},
          e("div",null,
            e("div",{style:{fontWeight:700,fontSize:18,color:C.text,lineHeight:1.2}},"Mi cuenta"),
            e("div",{style:{fontSize:12,color:C.textMuted,marginTop:3}},"Gestiona tu cuenta y herramientas para tu negocio en CLEO.")
          ),
          e("button",{style:{background:"transparent",border:"1px solid "+C.border,cursor:"pointer",color:C.textDim,fontSize:16,width:28,height:28,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginLeft:12,marginTop:2},onClick:function(){ setModalCuenta(false); }},"×")
        ),

        // BODY scrollable
        e("div",{style:{overflowY:"auto",maxHeight:"calc(88vh - 80px)",padding:"20px 24px 24px"}},

          // Tarjeta de usuario
          e("div",{style:{border:"1px solid "+C.border,borderRadius:16,padding:"16px",display:"flex",alignItems:"center",gap:12,marginBottom:20}},
            e("div",{style:{width:44,height:44,borderRadius:"50%",background:C.purplePale,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:15,fontWeight:700,color:C.purple}},
              (perfil.tuNombre||perfil.nombre||"?").slice(0,2).toUpperCase()
            ),
            e("div",{style:{flex:1,minWidth:0}},
              e("div",{style:{fontWeight:700,fontSize:15,color:C.text}},perfil.tuNombre||"Sin nombre"),
              e("div",{style:{fontSize:12,color:C.textMuted,marginTop:1}},props.userEmail||perfil.email||"Sin correo registrado")
            )
          ),

          // HERRAMIENTAS
          e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px",marginBottom:10}},"Herramientas"),
          e("div",{style:{border:"1px solid "+C.border,borderRadius:16,overflow:"hidden",marginBottom:20}},

            // Cargar datos de ejemplo
            e("button",{style:{cursor:"pointer",width:"100%",textAlign:"left",padding:"14px 16px",border:"none",background:hoverDemo?C.surfaceUp:"transparent",display:"flex",alignItems:"center",gap:12,transition:"background 0.12s"},onMouseEnter:function(){ setHoverDemo(true); },onMouseLeave:function(){ setHoverDemo(false); },onClick:function(){
              if(esProductos){
                if(window.confirm("¿Cargar demo de productos? Se borrarán los datos actuales y se cargará un negocio de joyería de ejemplo.")){
                  setClientes(clientesDemoProductos);
                  setCotizaciones([]);
                  setVentas(ventasDemoProductos);
                  setServicios([]);
                  setPedidos(pedidosDemoProductos);
                  setProductosCat(productosCatDemo);
                  setPerfil(Object.assign({},perfilDemoProductos));
                  setAlertasCerradas([]);
                  setVista("inicio");
                  setModalCuenta(false);
                  if(props.forzarSync) props.forzarSync();
                }
              } else {
                if(window.confirm("¿Cargar datos de ejemplo? Se reemplazarán tus datos actuales.")){
                  setClientes(clientesDemo); setCotizaciones(migrarCots(cotDemo));
                  setVentas(ventasDemo||[]); setServicios(serviciosDemo);
                  setPerfil(perfilDemoServicios);
                  setAlertasCerradas([]); setModalCuenta(false);
                  if(props.forzarSync) props.forzarSync();
                }
              }
            }},
              e("div",{style:{width:38,height:38,borderRadius:10,background:C.purplePale,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}},
                e("svg",{width:18,height:18,viewBox:"0 0 24 24",fill:"none",stroke:C.purple,strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"},
                  e("path",{d:"M9.5 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2zM19 9l.7 1.4 1.4.7-1.4.7-.7 1.4-.7-1.4-1.4-.7 1.4-.7.7-1.4zM6 14l.6 1.2 1.2.6-1.2.6-.6 1.2-.6-1.2-1.2-.6 1.2-.6.6-1.2z"})
                )
              ),
              e("div",{style:{flex:1,minWidth:0}},
                e("div",{style:{display:"flex",alignItems:"center",gap:8}},
                  e("span",{style:{fontWeight:700,fontSize:14,color:C.text}},"Cargar datos de ejemplo"),
                  e("span",{style:{fontSize:10,fontWeight:700,color:C.purple,background:C.purplePale,borderRadius:20,padding:"2px 8px"}},"Nuevo")
                ),
                e("div",{style:{fontSize:12,color:C.textMuted,marginTop:2,lineHeight:1.4}},"Llena CLEO con información ficticia para explorar todas las funciones.")
              )
            ),

            // Empezar desde cero
            e("button",{style:{cursor:"pointer",width:"100%",textAlign:"left",padding:"14px 16px",border:"none",borderTop:"1px solid "+C.border,background:hoverCero?C.redBg:"transparent",display:"flex",alignItems:"center",gap:12,transition:"background 0.12s"},onMouseEnter:function(){ setHoverCero(true); },onMouseLeave:function(){ setHoverCero(false); },onClick:function(){
              if(window.confirm("¿Borrar todos tus datos? Esta acción no se puede deshacer.")){
                setClientes([]); setCotizaciones([]);
                setVentas([]); setServicios([]);
                setPedidos([]);
                setProductosCat([]);
                setProductos([]);
                setPerfil(perfilDemo);
                setEtapasVistas([]);
                try{
                  localStorage.removeItem("cleo_alertas_cerradas");
                  localStorage.removeItem("cleo_etapas_vistas");
                  localStorage.removeItem("cleo_tipo_perfil");
                  localStorage.removeItem("cleo_demo_productos_loaded_v2");
                  localStorage.removeItem("cleo_productos");
                }catch(e){}
                setAlertasCerradas([]); setModalCuenta(false);
              }
            }},
              e("div",{style:{width:38,height:38,borderRadius:10,background:C.redBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}},
                e("svg",{width:18,height:18,viewBox:"0 0 24 24",fill:"none",stroke:C.red,strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round"},
                  e("path",{d:"M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"})
                )
              ),
              e("div",{style:{flex:1,minWidth:0}},
                e("div",{style:{fontWeight:700,fontSize:14,color:C.text}},"Empezar desde cero"),
                e("div",{style:{fontSize:12,color:C.textMuted,marginTop:2,lineHeight:1.4}},"Elimina todos tus datos (clientes, ventas, productos y más) para comenzar nuevamente.")
              )
            )

          ),

          // Cerrar sesión
          e("button",{style:{cursor:"pointer",width:"100%",padding:"13px",borderRadius:14,border:"1px solid "+C.red+(hoverSalir?"88":"44"),background:hoverSalir?C.red+"22":C.redBg,fontSize:14,fontWeight:600,color:C.red,display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:20,transition:"background 0.12s, border-color 0.12s"},onMouseEnter:function(){ setHoverSalir(true); },onMouseLeave:function(){ setHoverSalir(false); },onClick:function(){
            if(window.confirm("¿Cerrar sesión?")){ if(props.onSignOut) props.onSignOut(); }
          }},
            e("svg",{width:16,height:16,viewBox:"0 0 24 24",fill:"none",stroke:C.red,strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"},e("path",{d:"M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"})),
            "Cerrar sesión"
          ),

          // Nota de seguridad
          e("div",{style:{background:C.purplePale,borderRadius:14,padding:"14px 16px",display:"flex",gap:12,alignItems:"flex-start"}},
            e("svg",{width:18,height:18,viewBox:"0 0 24 24",fill:"none",stroke:C.purple,strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round",style:{flexShrink:0,marginTop:1}},e("path",{d:"M12 2l7 3v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V5l7-3z"})),
            e("div",null,
              e("div",{style:{fontWeight:700,fontSize:13,color:C.purple}},"Tu información está segura"),
              e("div",{style:{fontSize:12,color:C.purple,opacity:0.85,marginTop:2,lineHeight:1.4}},"En CLEO protegemos tus datos y nunca los compartimos con terceros.")
            )
          )

        )
      )
    ),

    modalPerfil&&e("div",{style:st.ov,onClick:function(){ setModalPerfil(false); }},
      e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",maxWidth:isMobile?"100%":500,borderRadius:isMobile?"20px 20px 0 0":24,display:"flex",flexDirection:"column",overflowY:"hidden"}),onClick:function(ev){ ev.stopPropagation(); }},

        // ── HEADER ──
        e("div",{style:{padding:"20px 24px 16px",borderBottom:"1px solid "+C.border,background:"linear-gradient(135deg,"+C.purplePale+" 0%,transparent 70%)"}},
          // Title row
          e("div",{style:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:4}},
            e("div",null,
              e("div",{style:{fontWeight:700,fontSize:18,color:C.text,lineHeight:1.2}},"Mi negocio"),
              e("div",{style:{fontSize:12,color:C.textMuted,marginTop:3}},"Datos de tu negocio y apariencia de documentos")
            ),
            e("button",{style:{background:"transparent",border:"1px solid "+C.border,cursor:"pointer",color:C.textDim,fontSize:16,width:28,height:28,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginLeft:12,marginTop:2},onClick:function(){ setModalPerfil(false); }},"×")
          ),
          // Progress bar (solo si < 80%)
          (function(){
            var pts=0;
            if(formPerfil.nombre&&formPerfil.nombre!=="Mi Negocio") pts+=25;
            if(formPerfil.tipoPerfil) pts+=20;
            if(formPerfil.telefono||formPerfil.redesTT) pts+=20;
            if(formPerfil.email||formPerfil.redesIG) pts+=20;
            if(formPerfil.logo) pts+=15;
            if(pts>=80) return null;
            return e("div",{style:{marginTop:14}},
              e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}},
                e("div",{style:{fontSize:12,fontWeight:600,color:C.purple}},"Tu perfil está "+pts+"% completo"),
                e("div",{style:{fontSize:11,color:C.textMuted}},pts+"/100")
              ),
              e("div",{style:{height:5,borderRadius:99,background:C.border,overflow:"hidden",marginBottom:8}},
                e("div",{style:{width:pts+"%",height:"100%",background:C.purple,borderRadius:99,transition:"width 0.4s"}})
              ),
              e("div",{style:{fontSize:12,color:C.textMuted,lineHeight:1.5}},"Completa tu perfil para que CLEO pueda ayudarte mejor a vender.")
            );
          })()
        ),

        // ── BODY (scrollable) ──
        e("div",{style:{overflowY:"auto",flex:1,minHeight:0}},

          // SECCIÓN: Información del negocio
          e("div",{style:{padding:"20px 24px",borderBottom:"1px solid "+C.border}},
            e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}},
              e("div",null,
                e("label",{style:st.lbl},"Nombre del negocio"),
                e("input",{value:formPerfil.nombre||"",onChange:function(ev){ setFormPerfil(Object.assign({},formPerfil,{nombre:ev.target.value})); },placeholder:"ej. Mi Negocio",style:st.inp})
              ),
              e("div",null,
                e("label",{style:st.lbl},"Tu nombre"),
                e("input",{value:formPerfil.tuNombre||"",onChange:function(ev){ setFormPerfil(Object.assign({},formPerfil,{tuNombre:ev.target.value})); },placeholder:"ej. Ana García",style:st.inp})
              )
            ),
            e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}},
              e("div",null,
                e("label",{style:st.lbl},"Teléfono"),
                e("input",{value:formPerfil.telefono||"",onChange:function(ev){ var v=ev.target.value.replace(/\D/g,"").slice(0,10); setFormPerfil(Object.assign({},formPerfil,{telefono:v})); },onBlur:function(ev){ if(ev.target.value&&ev.target.value.length<10) alert("El teléfono debe tener 10 dígitos."); },placeholder:"5512345678",maxLength:10,inputMode:"numeric",style:st.inp}),
                formPerfil.telefono&&formPerfil.telefono.length>0&&formPerfil.telefono.length<10&&e("div",{style:{fontSize:11,color:"#E53E3E",marginTop:4}},"Faltan "+(10-formPerfil.telefono.length)+" dígitos"),
                (!formPerfil.telefono||formPerfil.telefono.length===0)&&e("div",{style:{fontSize:11,color:C.textDim,marginTop:4}},"Solo números, sin espacios ni guiones")
              ),
              e("div",null,
                e("label",{style:st.lbl},"Email"),
                e("input",{value:formPerfil.email||"",onChange:function(ev){ setFormPerfil(Object.assign({},formPerfil,{email:ev.target.value})); },placeholder:"correo@negocio.com",style:st.inp})
              )
            ),
            e("div",null,
              e("label",{style:st.lbl},"Logo"),
              e("div",{style:{display:"flex",gap:10,alignItems:"center"}},
                e("div",{style:{width:52,height:52,borderRadius:10,border:"1px solid "+C.border,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,overflow:"hidden",background:C.surfaceUp}},
                  formPerfil.logo
                    ? e("img",{src:formPerfil.logo,style:{width:52,height:52,objectFit:"cover"},onError:function(ev){ ev.target.style.display="none"; }})
                    : e("span",{style:{fontSize:22}},"🏢")
                ),
                e("div",{style:{display:"flex",flexDirection:"column",gap:6}},
                  e("label",{style:{cursor:"pointer",padding:"8px 16px",borderRadius:10,border:"1px solid "+C.purple,background:C.purplePale,fontSize:13,color:C.purple,fontWeight:500,display:"inline-block"}},
                    "Subir logo",
                    e("input",{type:"file",accept:"image/*",style:{display:"none"},onChange:function(ev){
                      var file=ev.target.files&&ev.target.files[0];
                      if(!file) return;
                      var reader=new FileReader();
                      reader.onload=function(e){ setFormPerfil(Object.assign({},formPerfil,{logo:e.target.result})); };
                      reader.readAsDataURL(file);
                    }})
                  ),
                  formPerfil.logo&&e("button",{style:{cursor:"pointer",background:"none",border:"none",fontSize:12,color:C.red,textAlign:"left",padding:0},onClick:function(){ setFormPerfil(Object.assign({},formPerfil,{logo:""})); }},"Quitar logo")
                )
              )
            )
          ),

          // SECCIÓN: Redes sociales
          e("div",{style:{padding:"20px 24px",borderBottom:"1px solid "+C.border}},
            e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px",marginBottom:14}},"Redes sociales"),
            [{key:"redesIG",color:"#D85A30",icon:e(SvgIG,{size:15}),ph:"@Instagram",label:"Instagram"},{key:"redesTT",color:"#000",icon:e("svg",{width:15,height:15,viewBox:"0 0 24 24",fill:"currentColor",style:{color:"#000"}},e("path",{d:"M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.75a8.16 8.16 0 004.77 1.52V6.82a4.85 4.85 0 01-1-.13z"})),ph:"@TikTok",label:"TikTok"},{key:"redesFB",color:"#185FA5",icon:e(SvgFB,{size:15}),ph:"Facebook",label:"Facebook"}].map(function(r){
              return e("div",{key:r.key,style:{display:"flex",alignItems:"center",gap:10,marginBottom:10}},
                e("div",{style:{width:34,height:34,borderRadius:10,background:r.color+"15",border:"1px solid "+r.color+"30",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}},r.icon),
                e("div",{style:{flex:1}},
                  e("input",{value:formPerfil[r.key]||"",onChange:function(ev){ setFormPerfil(Object.assign({},formPerfil,{[r.key]:ev.target.value})); },placeholder:r.ph,style:Object.assign({},st.inp,{marginBottom:0})})
                )
              );
            })
          ),

          // SECCIÓN: Cotizaciones y comprobantes
          e("div",{style:{padding:"20px 24px",borderBottom:"1px solid "+C.border}},
            e("div",{style:{fontSize:12,fontWeight:700,color:C.text,marginBottom:2}},"Cotizaciones y comprobantes"),
            e("div",{style:{fontSize:12,color:C.textDim,marginBottom:16}},"Así se verán los documentos que generas para tus clientes."),

            // Paletas presets
            e("div",{style:{marginBottom:16}},
              e("div",{style:{fontSize:11,color:C.textMuted,marginBottom:8,fontWeight:500}},"Paletas rápidas"),
              e("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
                [
                  {n:"Índigo",c:"#4B5EFC",s:"#E8EBFF",t:"#0D1240"},
                  {n:"Esmeralda",c:"#059669",s:"#D1FAE5",t:"#064E3B"},
                  {n:"Ámbar",c:"#D97706",s:"#FEF3C7",t:"#78350F"},
                  {n:"Rosa",c:"#DB2777",s:"#FCE7F3",t:"#831843"},
                  {n:"Pizarra",c:"#334155",s:"#F1F5F9",t:"#0F172A"},
                  {n:"Coral",c:"#E05A3A",s:"#FEF0EC",t:"#7C2D12"},
                ].map(function(p){
                  var sel=(formPerfil.color||C.purple)===p.c;
                  return e("button",{key:p.n,
                    title:p.n,
                    style:{cursor:"pointer",padding:"6px 10px",borderRadius:10,border:"1.5px solid "+(sel?p.c:C.border),background:sel?p.c+"15":"transparent",display:"flex",alignItems:"center",gap:6,transition:"all 0.15s"},
                    onClick:function(){ setFormPerfil(Object.assign({},formPerfil,{color:p.c,colorSecundario:p.s,colorTexto:p.t})); }
                  },
                    e("div",{style:{display:"flex",gap:3,alignItems:"center"}},
                      e("div",{style:{width:14,height:14,borderRadius:"50%",background:p.c,flexShrink:0}}),
                      e("div",{style:{width:14,height:14,borderRadius:"50%",background:p.s,border:"1px solid "+C.border,flexShrink:0}}),
                      e("div",{style:{width:14,height:14,borderRadius:"50%",background:p.t,flexShrink:0}})
                    ),
                    e("span",{style:{fontSize:11,color:sel?p.c:C.textMuted,fontWeight:sel?600:400}},p.n)
                  );
                })
              )
            ),

            // Selectores manuales
            e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}},
              [
                {key:"color",label:"Principal",desc:"Encabezado y acento"},
                {key:"colorSecundario",label:"Secundario",desc:"Fondo de secciones"},
                {key:"colorTexto",label:"Texto",desc:"Texto sobre fondo oscuro"},
              ].map(function(col){
                var val=formPerfil[col.key]||"#4B5EFC";
                return e("div",{key:col.key,style:{display:"flex",flexDirection:"column",gap:6}},
                  e("label",{style:Object.assign({},st.lbl,{marginBottom:2})},col.label),
                  e("div",{style:{position:"relative",display:"flex",alignItems:"center",gap:6}},
                    e("input",{type:"color",value:val,
                      onChange:function(ev){ var up={}; up[col.key]=ev.target.value; setFormPerfil(Object.assign({},formPerfil,up)); },
                      style:{width:36,height:36,borderRadius:8,border:"1.5px solid "+C.border,cursor:"pointer",padding:2,background:"none",flexShrink:0}
                    }),
                    e("input",{type:"text",value:val,
                      onChange:function(ev){ if(/^#[0-9A-Fa-f]{0,6}$/.test(ev.target.value)){ var up={}; up[col.key]=ev.target.value; setFormPerfil(Object.assign({},formPerfil,up)); } },
                      style:Object.assign({},st.inp,{flex:1,fontFamily:"monospace",fontSize:11,padding:"6px 8px",marginBottom:0})
                    })
                  ),
                  e("div",{style:{fontSize:10,color:C.textDim}},col.desc)
                );
              })
            ),

            // Preview mini de documento
            e("div",{style:{borderRadius:12,overflow:"hidden",border:"1px solid "+C.border,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}},
              e("div",{style:{fontSize:10,color:C.textDim,padding:"6px 10px",background:C.surfaceUp,borderBottom:"1px solid "+C.border,fontWeight:600,letterSpacing:"0.5px",textTransform:"uppercase"}},"Vista previa PDF"),
              e("div",{style:{background:formPerfil.colorSecundario||"#E8EBFF",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}},
                e("div",null,
                  e("div",{style:{fontSize:13,fontWeight:700,color:formPerfil.colorTexto||"#0D1240"}},"Cotización · COT-0001"),
                  e("div",{style:{fontSize:10,color:formPerfil.colorTexto||"#0D1240",opacity:0.6,marginTop:2}},(formPerfil.nombre||"Mi Negocio")+" · "+new Date().toLocaleDateString("es-MX"))
                ),
                e("div",{style:{width:32,height:32,borderRadius:6,background:formPerfil.color||C.purple,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700}},
                  (formPerfil.nombre||"M")[0].toUpperCase()
                )
              ),
              e("div",{style:{padding:"10px 14px",background:"#fff"}},
                e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}},
                  e("div",{style:{fontSize:11,color:"#555"}},"Sesión fotográfica"),
                  e("div",{style:{fontSize:13,fontWeight:700,color:formPerfil.color||C.purple}},"$2,500")
                ),
                e("div",{style:{height:3,borderRadius:99,background:(formPerfil.color||C.purple)+"30",overflow:"hidden"}},
                  e("div",{style:{width:"60%",height:"100%",background:formPerfil.color||C.purple,borderRadius:99}})
                )
              )
            )
,

            // Datos para cobrar
            e("div",{style:{marginTop:16,padding:"16px",background:C.surfaceUp,borderRadius:12,border:"1px solid "+C.border}},
              e("div",{style:{fontSize:12,fontWeight:600,color:C.text,marginBottom:10}},"💳 Datos para cobrar"),
              e("div",{style:{fontSize:11,color:C.textDim,marginBottom:12}},"Aparecen en cotizaciones y comprobantes."),
            e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}},
              e("div",null,e("label",{style:st.lbl},"Banco"),e("input",{value:formPerfil.banco||"",onChange:function(ev){ setFormPerfil(Object.assign({},formPerfil,{banco:ev.target.value})); },placeholder:"ej. BBVA, Banamex",style:st.inp})),
              e("div",null,e("label",{style:st.lbl},"Titular"),e("input",{value:formPerfil.bancotitular||"",onChange:function(ev){ setFormPerfil(Object.assign({},formPerfil,{bancotitular:ev.target.value})); },placeholder:"Nombre completo",style:st.inp}))
            ),
            e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}},
              e("div",null,e("label",{style:st.lbl},"CLABE (18 dígitos)"),e("input",{value:formPerfil.bancoclabe||"",onChange:function(ev){ var v=ev.target.value.replace(/\D/g,"").slice(0,18); setFormPerfil(Object.assign({},formPerfil,{bancoclabe:v})); },placeholder:"000000000000000000",maxLength:18,inputMode:"numeric",style:st.inp})),
              e("div",null,e("label",{style:st.lbl},"Número de cuenta"),e("input",{value:formPerfil.bancoaccount||"",onChange:function(ev){ var v=ev.target.value.replace(/\D/g,"").slice(0,20); setFormPerfil(Object.assign({},formPerfil,{bancoaccount:v})); },placeholder:"Solo números",maxLength:20,inputMode:"numeric",style:st.inp}))
            ),
            e("div",null,e("label",{style:st.lbl},"Instrucciones adicionales"),e("textarea",{value:formPerfil.bancoinstrucciones||"",onChange:function(ev){ setFormPerfil(Object.assign({},formPerfil,{bancoinstrucciones:ev.target.value})); },placeholder:"ej. Manda captura al 932...",style:Object.assign({},st.inp,{minHeight:50,resize:"vertical"})}))

            )
          ),
        ),

        // ── FOOTER con botones ──
        e("div",{style:{padding:"14px 24px",borderTop:"1px solid "+C.border,display:"flex",gap:8,justifyContent:"flex-end",background:C.surfaceUp}},
          e("button",{style:st.btn,onClick:function(){ setModalPerfil(false); }},"Cancelar"),
          e("button",{style:st.btnP,onClick:function(){ setPerfil(formPerfil); setModalPerfil(false); }},"Guardar cambios")
        )
      )
    ),

    // MODAL CATALOGO
    modalCatalogo&&e("div",{style:st.ov,onClick:function(){ setModalCatalogo(false); }},
      e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",maxWidth:isMobile?"100%":520,borderRadius:isMobile?"20px 20px 0 0":24}),onClick:function(ev){ ev.stopPropagation(); }},

        // HEADER
        e("div",{style:{padding:"22px 24px 16px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",justifyContent:"space-between",background:"linear-gradient(135deg,"+C.purplePale+" 0%,transparent 70%)"}},
          e("div",null,
            e("div",{style:{fontWeight:700,fontSize:18,color:C.text}},esProductos?"Mis productos":"Mi catálogo"),
            e("div",{style:{fontSize:12,color:C.textMuted,marginTop:2}},esProductos?"Tus productos y precios":"Servicios, precios y condiciones de tus cotizaciones")
          ),
          e("button",{style:{background:C.surfaceUp,border:"1px solid "+C.border,cursor:"pointer",color:C.textDim,fontSize:18,padding:"6px 10px",borderRadius:10,lineHeight:1},onClick:function(){ setModalCatalogo(false); }},"×")
        ),

        // BODY scrollable
        e("div",{style:{overflowY:"auto",maxHeight:"calc(88vh - 140px)"}},

          // SECCIÓN: Lista
          e("div",{style:{padding:"20px 24px",borderBottom:"1px solid "+C.border}},
            e("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}},
              e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px"}},"Mis "+(esProductos?"productos":"servicios")),
              e("span",{style:{fontSize:11,color:C.textDim,background:C.surfaceUp,border:"1px solid "+C.border,borderRadius:20,padding:"2px 10px"}},catActivo.length+" registrados")
            ),

            // Buscador , solo si hay 4+
            catActivo.length>=4&&e("div",{style:{marginBottom:10,position:"relative"}},
              e("svg",{width:14,height:14,viewBox:"0 0 24 24",fill:"none",style:{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}},
                e("path",{d:"M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z",stroke:C.textDim,strokeWidth:2,strokeLinecap:"round"})
              ),
              e("input",{placeholder:"Buscar...",value:buscaSv,onChange:function(ev){ setBuscaSv(ev.target.value); setSvDetalleId(null); },style:Object.assign({},st.inp,{paddingLeft:32,marginBottom:0})})
            ),

            // Lista de servicios existentes
            catActivo.length===0?e("div",{style:{textAlign:"center",padding:"24px 0",color:C.textDim,fontSize:13}},"Aún no tienes "+(esProductos?"productos":"servicios")+". Agrega el primero abajo."):
            e("div",{style:{maxHeight:280,overflowY:"auto",display:"flex",flexDirection:"column",gap:6,paddingRight:2}},
              catActivo.filter(function(sv){ return !buscaSv||sv.nombre.toLowerCase().includes(buscaSv.toLowerCase()); }).length===0?
                e("div",{style:{textAlign:"center",padding:"16px 0",color:C.textDim,fontSize:13}},"Sin resultados para \""+buscaSv+"\""):
              catActivo.filter(function(sv){ return !buscaSv||sv.nombre.toLowerCase().includes(buscaSv.toLowerCase()); }).map(function(sv){
                var abierto=svDetalleId===sv.id;
                return e("div",{key:sv.id,style:{borderRadius:12,border:"1.5px solid "+(abierto?C.purple:C.border),background:abierto?C.purplePale:C.surface,overflow:"hidden",transition:"all 0.15s",flexShrink:0}},
                  // Fila principal (siempre visible)
                  e("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",cursor:"pointer"},onClick:function(){ setSvDetalleId(abierto?null:sv.id); }},
                    e("div",{style:{width:32,height:32,borderRadius:8,background:(abierto?C.purple:C.textDim)+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}},
                      e("svg",{width:14,height:14,viewBox:"0 0 24 24",fill:"none"},e("path",{d:"M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",stroke:abierto?C.purple:C.textDim,strokeWidth:1.5,strokeLinecap:"round",strokeLinejoin:"round"}))
                    ),
                    e("div",{style:{flex:1,minWidth:0}},
                      e("div",{style:{fontWeight:600,fontSize:13,color:abierto?C.purple:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},sv.nombre),
                      e("div",{style:{fontSize:11,color:abierto?C.purple:C.textMuted,marginTop:1,opacity:0.8}},"$"+Number(sv.precio).toLocaleString()+(sv.descripcion?" · desc.":"")+(sv.condiciones?" · cond.":""))
                    ),
                    e("svg",{width:13,height:13,viewBox:"0 0 24 24",fill:"none",style:{flexShrink:0,transition:"transform 0.2s",transform:abierto?"rotate(180deg)":"rotate(0deg)"}},
                      e("path",{d:"M19 9l-7 7-7-7",stroke:C.textDim,strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"})
                    )
                  ),
                  // Detalle expandido
                  abierto&&e("div",{style:{padding:"12px",borderTop:"1px solid "+C.purple+"22"}},
                    editSv&&editSv.id===sv.id
                    ? e("div",null,
                        e("div",{style:{display:"grid",gridTemplateColumns:"1fr 100px",gap:8,marginBottom:8}},
                          e("input",{value:editSv.nombre,onChange:function(ev){ setEditSv(Object.assign({},editSv,{nombre:ev.target.value})); },style:Object.assign({},st.inp,{marginBottom:0})}),
                          e(MontoInput,{value:editSv.precio,onChange:function(ev){ setEditSv(Object.assign({},editSv,{precio:ev.target.value})); },placeholder:"Precio",style:st.inp})
                        ),
                        e("div",{style:{marginBottom:8}},
                          e("label",{style:Object.assign({},st.lbl,{fontSize:11})},"Descripción"),
                          e(RichEditor,{key:"sv-desc-"+editSv.id,value:editSv.descripcion||"",onChange:function(v){ setEditSv(Object.assign({},editSv,{descripcion:v})); },placeholder:"Descripción (opcional)",minHeight:50})
                        ),
                        e("div",{style:{marginBottom:8}},
                          e("label",{style:Object.assign({},st.lbl,{fontSize:11})},"Condiciones"),
                          e(RichEditor,{key:"sv-cond-"+editSv.id,value:editSv.condiciones||"",onChange:function(v){ setEditSv(Object.assign({},editSv,{condiciones:v})); },placeholder:"Condiciones (opcional)",minHeight:50})
                        ),
                        e("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"}},
                          e("button",{style:{cursor:"pointer",padding:"5px 12px",borderRadius:8,border:"1px solid "+C.border,background:"transparent",fontSize:12,color:C.textMuted},onClick:function(){ setEditSv(null); }},"Cancelar"),
                          e("button",{style:{cursor:"pointer",padding:"5px 12px",borderRadius:8,border:"none",background:C.purple,fontSize:12,color:"#fff",fontWeight:600},onClick:function(){
                            setCatActivo(catActivo.map(function(x){ return x.id===editSv.id?Object.assign({},x,{nombre:editSv.nombre,precio:Number(editSv.precio),descripcion:editSv.descripcion,condiciones:editSv.condiciones}):x; }));
                            setEditSv(null);
                          }},"Guardar")
                        )
                      )
                    : e("div",null,
                        sv.descripcion&&e("div",{style:{fontSize:12,color:C.text,lineHeight:1.7,marginBottom:sv.condiciones?8:0,padding:"8px 10px",background:"rgba(255,255,255,0.6)",borderRadius:8,marginTop:4},dangerouslySetInnerHTML:{__html:sv.descripcion}}),
                        sv.condiciones&&e("div",null,
                          e("div",{style:{fontSize:10,fontWeight:700,color:C.purple,textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:4,marginTop:sv.descripcion?4:8}},"Condiciones"),
                          e("div",{style:{fontSize:12,color:C.textMuted,lineHeight:1.7,padding:"8px 10px",background:"rgba(255,255,255,0.6)",borderRadius:8},dangerouslySetInnerHTML:{__html:sv.condiciones}})
                        ),
                        e("div",{style:{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}},
                          e("button",{style:{cursor:"pointer",padding:"5px 12px",borderRadius:8,border:"1px solid "+C.border,background:"transparent",fontSize:12,color:C.purple,fontWeight:500},onClick:function(){ setEditSv({id:sv.id,nombre:sv.nombre,precio:sv.precio,descripcion:sv.descripcion||"",condiciones:sv.condiciones||""}); }},"Editar"),
                          e("button",{style:{cursor:"pointer",padding:"5px 12px",borderRadius:8,border:"1px solid "+C.redBorder,background:C.redBg,fontSize:12,color:C.red,fontWeight:500},onClick:function(){ if(window.confirm("¿Eliminar "+sv.nombre+"?")){ eliminarServicio(sv.id); setSvDetalleId(null); } }},"Eliminar")
                        )
                      )
                  )
                );
              })
            )
          ),

          // SECCIÓN: Agregar nuevo servicio
          e("div",{style:{padding:"20px 24px",borderBottom:"1px solid "+C.border}},
            e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px",marginBottom:14}},"Agregar "+(esProductos?"producto":"servicio")),
            e("div",{style:{display:"grid",gridTemplateColumns:"1fr 110px",gap:8,marginBottom:10}},
              e("input",{placeholder:(esProductos?"ej. Aretes plata, Pastel...":"ej. Sesión fotográfica..."),value:formSv.nombre,onChange:function(ev){ setFormSv(Object.assign({},formSv,{nombre:ev.target.value})); },style:st.inp}),
              e(MontoInput,{value:formSv.precio,onChange:function(ev){ setFormSv(Object.assign({},formSv,{precio:ev.target.value})); },placeholder:"Precio",style:st.inp})
            ),
            mostrarDesc&&e("div",{style:{marginBottom:8,background:C.purplePale,borderRadius:10,padding:"10px 12px",border:"1px solid "+C.purple+"22"}},
              e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}},
                e("label",{style:Object.assign({},st.lbl,{marginBottom:0})},"Descripción"),
                e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:16,padding:"0 2px",lineHeight:1},onClick:function(){ setMostrarDesc(false); setFormSv(Object.assign({},formSv,{descripcion:""})); setEditorKey(function(k){ return k+1; }); }},"×")
              ),
              e(RichEditor,{key:"desc-"+editorKey,placeholder:"Qué incluye este servicio...",value:formSv.descripcion,onChange:function(v){ setFormSv(Object.assign({},formSv,{descripcion:v})); },minHeight:70})
            ),
            mostrarCond&&e("div",{style:{marginBottom:8,background:"#FFFBEB",borderRadius:10,padding:"10px 12px",border:"1px solid "+C.amberBorder}},
              e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}},
                e("label",{style:Object.assign({},st.lbl,{marginBottom:0})},"Condiciones"),
                e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:16,padding:"0 2px",lineHeight:1},onClick:function(){ setMostrarCond(false); setFormSv(Object.assign({},formSv,{condiciones:""})); setEditorKey(function(k){ return k+1; }); }},"×")
              ),
              e(RichEditor,{key:"cond-"+editorKey,placeholder:"Entrega, revisiones, cancelaciones...",value:formSv.condiciones||"",onChange:function(v){ setFormSv(Object.assign({},formSv,{condiciones:v})); },minHeight:70})
            ),
            e("div",{style:{display:"flex",gap:8,alignItems:"center",marginBottom:12}},
              !mostrarDesc&&e("button",{style:{cursor:"pointer",background:"none",border:"1px dashed "+C.border,fontSize:12,color:C.purple,padding:"5px 12px",borderRadius:8,fontWeight:500,display:"inline-flex",alignItems:"center",gap:4},onClick:function(){ setMostrarDesc(true); }},
                e("svg",{width:12,height:12,viewBox:"0 0 24 24",fill:"none"},e("path",{d:"M12 5v14M5 12h14",stroke:C.purple,strokeWidth:2,strokeLinecap:"round"})),
                "Descripción"
              ),
              !mostrarCond&&e("button",{style:{cursor:"pointer",background:"none",border:"1px dashed "+C.border,fontSize:12,color:C.amber,padding:"5px 12px",borderRadius:8,fontWeight:500,display:"inline-flex",alignItems:"center",gap:4},onClick:function(){ setMostrarCond(true); }},
                e("svg",{width:12,height:12,viewBox:"0 0 24 24",fill:"none"},e("path",{d:"M12 5v14M5 12h14",stroke:C.amber,strokeWidth:2,strokeLinecap:"round"})),
                "Condiciones"
              )
            ),
            e("button",{
              onClick:function(){ agregarServicio(); setMostrarDesc(false); setMostrarCond(false); setEditorKey(function(k){ return k+1; }); },
              disabled:!formSv.nombre.trim()||!formSv.precio,
              style:{cursor:formSv.nombre.trim()&&formSv.precio?"pointer":"not-allowed",padding:"10px",borderRadius:12,border:"none",background:formSv.nombre.trim()&&formSv.precio?C.purple:"#D1D5DB",fontSize:13,color:"#fff",fontWeight:600,width:"100%",transition:"background 0.15s"}
            },"Agregar "+(esProductos?"producto":"servicio"))
          ),

          // SECCIÓN: Textos de cotización (solo servicios)
          !esProductos&&e("div",{style:{padding:"20px 24px"}},
            e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px",marginBottom:14}},"Textos de cotización"),
            e("div",{style:{marginBottom:14}},
              e("label",{style:st.lbl},"Mensaje de cierre"),
              e("div",{style:{fontSize:12,color:C.textDim,marginBottom:6}},"Aparece al final de cada cotización PDF."),
              e("textarea",{value:formPerfil.mensaje||"",onChange:function(ev){ setFormPerfil(Object.assign({},formPerfil,{mensaje:ev.target.value})); },placeholder:"ej. Gracias por tu confianza. Cualquier duda estoy a tus órdenes.",style:Object.assign({},st.inp,{minHeight:60,resize:"vertical"})})
            ),
            e("div",null,
              e("label",{style:st.lbl},"Condiciones generales de pago"),
              e("div",{style:{fontSize:12,color:C.textDim,marginBottom:6}},"Se incluyen en todas tus cotizaciones."),
              e("textarea",{value:formPerfil.condicionesPago||"",onChange:function(ev){ setFormPerfil(Object.assign({},formPerfil,{condicionesPago:ev.target.value})); },placeholder:"ej. 50% de anticipo, 50% al entregar.",style:Object.assign({},st.inp,{minHeight:60,resize:"vertical"})})
            )
          )
        ),

        // FOOTER
        e("div",{style:{padding:"14px 24px",borderTop:"1px solid "+C.border,display:"flex",gap:8,justifyContent:"flex-end",background:C.surfaceUp}},
          e("button",{style:st.btn,onClick:function(){ setModalCatalogo(false); }},"Cancelar"),
          e("button",{style:st.btnP,onClick:function(){ setPerfil(formPerfil); setModalCatalogo(false); }},"Guardar")
        )
      )
    ),

    // MODAL REGISTRAR PAGO VENTA RÁPIDA
    pagoVentaData&&(function(){
      var v=pagoVentaData;
      var cl=v.clienteId?clientes.find(function(c){ return c.id===v.clienteId; }):null;
      var pagos=v.pagos||[];
      var totalPagado=pagos.reduce(function(s,p){ return s+Number(p.monto); },0);
      var saldoReal=v.monto-totalPagado;
      var pc=perfil.color||C.purple;
      return e("div",{style:st.ov,onClick:function(){ setPagoVentaData(null); }},
        e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",overflowY:"auto"}),onClick:function(ev){ ev.stopPropagation(); }},

          // HEADER
          e("div",{style:{padding:"20px 24px 16px",borderBottom:"1px solid "+C.border,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}},
            e("div",null,
              e("div",{style:{fontWeight:700,fontSize:16,color:C.text,marginBottom:3}},"Registrar pago"),
              e("div",{style:{fontSize:12,color:C.textMuted}},(cl?cl.nombre:"--")+" · "+(v.concepto||"Venta directa")+" · $"+Number(v.monto).toLocaleString())
            ),
            e("button",{style:{background:"transparent",border:"1px solid "+C.border,cursor:"pointer",color:C.textDim,fontSize:16,width:28,height:28,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},onClick:function(){ setPagoVentaData(null); }},"×")
          ),

          // BODY
          e("div",{style:{padding:"20px 24px",overflowY:"auto",maxHeight:"65vh"}},

            // Pagos existentes
            pagos.length>0&&e("div",{style:{marginBottom:20}},
              e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px",marginBottom:10}},"Pagos registrados"),
              e("div",{style:{display:"flex",flexDirection:"column",gap:8}},
                pagos.map(function(p){
                  return e("div",{key:p.id,style:{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:C.surfaceUp,borderRadius:10,border:"1px solid "+C.border}},
                    e("div",{style:{flex:1}},
                      e("div",{style:{fontSize:13,fontWeight:600,color:C.text}},p.concepto||"Pago"),
                      e("div",{style:{fontSize:11,color:C.textDim,marginTop:1}},p.fecha)
                    ),
                    e("div",{style:{fontSize:14,fontWeight:700,color:C.green,marginRight:6}},"$"+Number(p.monto).toLocaleString()),
                    e("button",{style:{cursor:"pointer",padding:"4px 10px",borderRadius:8,border:"1px solid "+C.amberBorder,background:"transparent",fontSize:11,color:C.amber,fontWeight:500,whiteSpace:"nowrap"},
                      onClick:function(){ generarComprobantePago(p,{id:v.id,concepto:v.concepto,monto:v.monto},cl||{nombre:"Cliente"},perfil); }
                    },"Comprobante"),
                    e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.red,fontSize:16,padding:"2px 4px",marginLeft:2},
                      onClick:(function(pid){ return function(){
                        var updated=ventas.map(function(vv){ return vv.id===v.id?Object.assign({},vv,{pagos:(vv.pagos||[]).filter(function(x){ return x.id!==pid; })}):vv; });
                        setVentas(updated);
                        setPagoVentaData(Object.assign({},v,{pagos:(v.pagos||[]).filter(function(x){ return x.id!==pid; })}));
                      }; })(p.id)
                    },"×")
                  );
                })
              ),
              e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderRadius:10,background:saldoReal<=0?"#F0FDF4":C.amberBg,border:"1px solid "+(saldoReal<=0?"#86EFAC":C.amberBorder),marginTop:10}},
                e("span",{style:{fontSize:13,color:saldoReal<=0?"#166534":C.amber,fontWeight:500}},"Saldo pendiente"),
                e("span",{style:{fontSize:16,fontWeight:700,color:saldoReal<=0?C.green:C.amber}},"$"+Math.max(0,saldoReal).toLocaleString())
              )
            ),

            // Formulario nuevo pago
            saldoReal>0&&e("div",null,
              pagos.length>0&&e("div",{style:{height:1,background:C.border,marginBottom:20}}),
              e("div",{style:{fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:"1px",marginBottom:12}},"Agregar pago"),
              e("div",{style:{marginBottom:14}},
                e("label",{style:st.lbl},"Tipo de pago"),
                e("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}},
                  ["Anticipo","Segundo pago","Pago final","Otro"].map(function(c){
                    var activo=formPagoVenta.concepto===c;
                    return e("button",{key:c,style:{cursor:"pointer",padding:"7px 14px",borderRadius:10,border:"1.5px solid "+(activo?pc:C.border),background:activo?pc:"transparent",fontSize:12,color:activo?"#fff":C.textMuted,fontWeight:activo?600:400,transition:"all 0.15s"},onClick:function(){
                      var nuevoMonto=formPagoVenta.monto;
                      if(c==="Pago final") nuevoMonto=String(Math.max(0,saldoReal));
                      setFormPagoVenta(Object.assign({},formPagoVenta,{concepto:c,monto:nuevoMonto}));
                    }},c);
                  })
                )
              ),
              e("div",{style:{display:"flex",gap:10,flexWrap:"wrap"}},
                e("div",{style:{flex:"1 1 120px"}},e("label",{style:st.lbl},"Monto"),e(MontoInput,{value:formPagoVenta.monto,onChange:function(ev){ setFormPagoVenta(Object.assign({},formPagoVenta,{monto:ev.target.value})); },placeholder:"0",style:st.inp})),
                e("div",{style:{flex:"1 1 140px",minWidth:0}},e("label",{style:st.lbl},"Fecha"),e("input",{type:"date",value:formPagoVenta.fecha,onChange:function(ev){ setFormPagoVenta(Object.assign({},formPagoVenta,{fecha:ev.target.value})); },style:Object.assign({},st.inp,{width:"100%",maxWidth:"100%",boxSizing:"border-box",display:"block",minWidth:0,WebkitAppearance:"none"})}))
              )
            ),

            // Pagado completo
            saldoReal<=0&&e("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"14px 16px",background:"#F0FDF4",borderRadius:12,border:"1px solid #86EFAC"}},
              e("span",{style:{fontSize:20}},"✅"),
              e("div",null,
                e("div",{style:{fontSize:13,fontWeight:700,color:"#166534"}},"Pagado completamente"),
                e("button",{style:{cursor:"pointer",marginTop:4,padding:"4px 12px",borderRadius:8,border:"1px solid "+C.amberBorder,background:"transparent",fontSize:12,color:C.amber,fontWeight:500},onClick:function(){ generarComprobanteVenta(v,cl); }},"Ver comprobante general")
              )
            )
          ),

          // FOOTER
          e("div",{style:{padding:"14px 24px",borderTop:"1px solid "+C.border,display:"flex",justifyContent:"flex-end",gap:8,background:C.surfaceUp}},
            e("button",{style:st.btn,onClick:function(){ setPagoVentaData(null); }},"Cerrar"),
            saldoReal>0&&e("button",{style:Object.assign({},st.btnP,{opacity:!formPagoVenta.monto||Number(formPagoVenta.monto)<=0?0.4:1}),
              disabled:!formPagoVenta.monto||Number(formPagoVenta.monto)<=0,
              onClick:function(){
                var nuevoPago={id:"pv_"+Date.now(),monto:Number(formPagoVenta.monto),fecha:formPagoVenta.fecha,concepto:formPagoVenta.concepto||"Pago"};
                var nuevosPagos=[...(v.pagos||[]),nuevoPago];
                var updatedV=Object.assign({},v,{pagos:nuevosPagos});
                setVentas(ventas.map(function(vv){ return vv.id===v.id?updatedV:vv; }));
                setPagoVentaData(updatedV);
                setFormPagoVenta({monto:"",fecha:FECHA_HOY,concepto:"Pago"});
              }
            },"+ Guardar pago")
          )
        )
      );
    })(),

    // MODAL VENTA RÁPIDA DESDE PIPELINE
    modalVentaRapidaPipeline&&(function(){
      var cl=clientes.find(function(c){ return c.id===modalVentaRapidaPipeline; });
      var nombre1=cl?cl.nombre.split(" ")[0]:"este cliente";
      return e("div",{style:st.ov},
        e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",overflowY:"auto"}),onClick:function(ev){ ev.stopPropagation(); }},
          e("div",{style:{padding:"20px 24px 16px",background:"linear-gradient(135deg,"+C.purplePale+" 0%,transparent 70%)",borderBottom:"1px solid "+C.border}},
            e("div",{style:{fontWeight:700,fontSize:17,color:C.text}},"Sin cotización registrada"),
            e("div",{style:{fontSize:13,color:C.textMuted,marginTop:4,lineHeight:1.5}},(cl?cl.nombre:"Este cliente")+" no tiene cotización. Aquí haces seguimientos para ventas con propuesta.")
          ),
          e("div",{style:{padding:"20px 24px",display:"flex",flexDirection:"column",gap:12}},
            e("div",{style:{fontSize:13,color:C.text,lineHeight:1.6,padding:"12px 16px",background:C.purplePale,borderRadius:12,border:"1px solid "+C.purple+"22"}},"Si cerraste esta venta sin cotización, puedes registrarla como una venta directa."),
            e("button",{
              style:{cursor:"pointer",padding:"16px",borderRadius:14,border:"1px solid "+C.green+"44",background:C.green+"08",textAlign:"left",width:"100%"},
              onClick:function(){
                var clienteId=modalVentaRapidaPipeline;
                var etapaOriginal=clientes.find(function(c){ return c.id===clienteId; });
                setModalVentaRapidaPipeline(null);
                // Guardar etapa original para revertir si cancela
                setEtapaAnteriorGanado(etapaOriginal?etapaOriginal.etapa:"Nuevo contacto");
                setCotAceptadaId("pipeline_revert_"+clienteId);
                // Archivar temporalmente
                setClientes(clientes.map(function(c){ return c.id===clienteId?Object.assign({},c,{etapa:"Perdido",archivado:true,fechaEtapa:FECHA_HOY}):c; }));
                setFormVenta({tipo:"especifico",clienteId:clienteId,concepto:"",monto:"",fecha:FECHA_HOY,etiqueta:"",notas:"",nuevoNombre:"",nuevoContacto:"",nuevoNegocio:"",items:[]});
                setPasoVenta("form");
                setModalVenta(true);
              }
            },
              e("div",{style:{fontWeight:600,fontSize:14,color:C.green}},"⚡ Registrar venta directa")
            ),
            e("button",{
              style:{cursor:"pointer",padding:"10px",borderRadius:14,border:"none",background:"none",fontSize:13,color:C.textMuted,width:"100%"},
              onClick:function(){ setModalVentaRapidaPipeline(null); }
            },"Cancelar")
          )
        )
      );
    })(),

    // MODAL CLIENTE
    modalCliente&&e("div",{style:st.ov,onClick:function(){ setModalCliente(false); }},
      e("div",{style:Object.assign({},st.modal,{padding:0,overflow:"hidden",maxWidth:isMobile?"100%":480,borderRadius:isMobile?"20px 20px 0 0":20,display:"flex",flexDirection:"column",maxHeight:isMobile?"94vh":"88vh"}),onClick:function(ev){ ev.stopPropagation(); }},

        // HEADER
        e("div",{style:{padding:"20px 24px 16px",background:"linear-gradient(135deg,"+C.purplePale+" 0%,transparent 70%)",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}},
          e("div",null,
            e("div",{style:{fontWeight:700,fontSize:18,color:C.text}},clienteSel?"Editar cliente":"Nuevo cliente"),
            e("div",{style:{fontSize:12,color:C.textMuted,marginTop:2}},clienteSel?"Actualiza los datos del cliente":"Registra un nuevo contacto")
          ),
          e("button",{style:{background:C.surfaceUp,border:"1px solid "+C.border,cursor:"pointer",color:C.textDim,fontSize:18,padding:"6px 10px",borderRadius:10,lineHeight:1},onClick:function(){ setModalCliente(false); }},"×")
        ),

        // BODY
        e("div",{style:{padding:"20px 24px",overflowY:"auto",flex:1}},

          // Nombre y negocio
          e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}},
            e("div",null,
              e("label",{style:st.lbl},"Nombre *"),
              e("input",{value:form.nombre,onChange:function(ev){ setForm(Object.assign({},form,{nombre:ev.target.value})); },placeholder:"ej. María García",style:st.inp,autoFocus:true})
            ),
            e("div",null,
              e("label",{style:st.lbl},"Negocio / Empresa"),
              e("input",{value:form.negocio,onChange:function(ev){ setForm(Object.assign({},form,{negocio:ev.target.value})); },placeholder:"ej. Boutique Luna",style:st.inp})
            )
          ),

          !clienteSel&&(form.nombre.trim().length>1||(form.contacto&&form.contacto.length===10))&&(function(){
            var nombreLower=form.nombre.trim().toLowerCase();
            var match=clientes.find(function(c){
              var cNombreLower=c.nombre.trim().toLowerCase();
              var coincideNombre=cNombreLower===nombreLower||cNombreLower.indexOf(nombreLower)===0||nombreLower.indexOf(cNombreLower)===0;
              var coincideTelefono=form.contacto&&form.contacto.length===10&&c.contacto===form.contacto;
              return coincideNombre||coincideTelefono;
            });
            if(!match) return null;
            var porQue=match.contacto&&form.contacto&&form.contacto.length===10&&match.contacto===form.contacto?"teléfono":"nombre";
            return e("div",{style:{marginTop:-4,marginBottom:14,padding:"10px 12px",background:C.amberBg||"#FFFBEB",border:"1px solid "+(C.amberBorder||"#FCD34D"),borderRadius:10,fontSize:12,color:"#92400E",lineHeight:1.4}},
              "Ya existe un cliente con ese "+porQue+": ",e("b",null,match.nombre),". ",
              e("button",{style:{cursor:"pointer",background:"none",border:"none",padding:0,color:C.purple,fontWeight:600,fontSize:12,textDecoration:"underline"},onClick:function(){ editarCliente(match); }},"Editarlo en vez de crear uno nuevo")
            );
          })(),

          // Canal principal
          e("div",{style:{marginBottom:14}},
            e("label",{style:st.lbl},"¿Dónde lo contactas?"),
            e("div",{style:{fontSize:11,color:C.textDim,marginBottom:8}},"Canal principal que usa para comunicarse contigo"),
            e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}},
              CANALES.map(function(canal){
                var cc=canalColor(canal);
                var activo=form.canalPrincipal===canal;
                return e("button",{key:canal,style:{cursor:"pointer",padding:"7px 10px",borderRadius:8,border:"1.5px solid "+(activo?cc:C.border),background:activo?cc+"18":"transparent",fontSize:12,color:activo?cc:C.textMuted,fontWeight:activo?600:400,display:"flex",alignItems:"center",gap:6,transition:"all 0.15s"},onClick:function(){ setForm(Object.assign({},form,{canalPrincipal:canal})); }},
                  e(SvgIcon,{canal:canal,size:12}),canal
                );
              })
            )
          ),

          // Dato de contacto según canal
          e("div",{style:{marginBottom:14}},
            form.canalPrincipal==="WhatsApp"&&e("div",null,
              e("label",{style:st.lbl},"Número de WhatsApp"),
              e("input",{value:form.contacto,onChange:function(ev){ var v=ev.target.value.replace(/\D/g,"").slice(0,10); setForm(Object.assign({},form,{contacto:v})); },onBlur:function(ev){ if(ev.target.value&&ev.target.value.length<10) alert("El teléfono debe tener 10 dígitos."); },placeholder:"10 dígitos",style:st.inp,maxLength:10,inputMode:"numeric"}),
              form.contacto&&form.contacto.length>0&&form.contacto.length<10&&e("div",{style:{fontSize:11,color:"#E53E3E",marginTop:4}},"Faltan "+(10-form.contacto.length)+" dígitos"),
              (!form.contacto||form.contacto.length===0)&&e("div",{style:{fontSize:11,color:C.textDim,marginTop:4}},"Solo números, sin espacios ni guiones")
            ),
            form.canalPrincipal==="Instagram"&&e("div",null,
              e("label",{style:st.lbl},"Instagram"),
              e("input",{value:form.instagram||"",onChange:function(ev){ setForm(Object.assign({},form,{instagram:ev.target.value})); },placeholder:"@usuario",style:st.inp})
            ),
            form.canalPrincipal==="Facebook"&&e("div",null,
              e("label",{style:st.lbl},"Facebook"),
              e("input",{value:form.messenger||"",onChange:function(ev){ setForm(Object.assign({},form,{messenger:ev.target.value})); },placeholder:"Nombre en Facebook",style:st.inp})
            )
          ),

          // Origen - grid 2 columnas
          e("div",{style:{marginBottom:14}},
            e("label",{style:st.lbl},"¿Cómo llegó a ti?"),
            e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:6}},
              ORIGENES.map(function(o){
                var activo=form.origen===o;
                return e("button",{key:o,style:{cursor:"pointer",padding:"7px 10px",borderRadius:8,border:"1.5px solid "+(activo?C.purple:C.border),background:activo?C.purplePale:"transparent",fontSize:12,color:activo?C.purple:C.textMuted,fontWeight:activo?600:400,textAlign:"left",transition:"all 0.15s"},onClick:function(){ setForm(Object.assign({},form,{origen:o})); }},o);
              })
            )
          ),

          // Cotizacion previa (solo nuevo cliente)
          !clienteSel&&e("div",{style:{marginBottom:14,padding:"14px 16px",background:C.purplePale,borderRadius:12,border:"1px solid "+C.purple+"22"}},
            e("div",{style:{fontSize:13,color:C.text,fontWeight:500,marginBottom:4}},"¿Ya le enviaste una propuesta o precio?"),
            e("div",{style:{fontSize:12,color:C.textMuted,lineHeight:1.55,marginBottom:12}},"Si ya la enviaste, regístrala ahora. Las oportunidades con seguimiento tienen más probabilidades de convertirse en venta."),
            e("div",{style:{display:"flex",gap:8,marginBottom:envioCotizacion?12:0}},
              e("button",{style:{cursor:"pointer",padding:"8px 16px",borderRadius:10,border:"1.5px solid "+(envioCotizacion===true?C.purple:C.border),background:envioCotizacion===true?C.purple:"transparent",fontSize:12,color:envioCotizacion===true?"#fff":C.textMuted,fontWeight:500,transition:"all 0.15s"},onClick:function(){ setEnvioCotizacion(true); }},"Sí, ya la envié"),
              e("button",{style:{cursor:"pointer",padding:"8px 16px",borderRadius:10,border:"1.5px solid "+(envioCotizacion===false?C.purple:C.border),background:envioCotizacion===false?C.purple:"transparent",fontSize:12,color:envioCotizacion===false?"#fff":C.textMuted,fontWeight:500,transition:"all 0.15s"},onClick:function(){ setEnvioCotizacion(false); setFormEnvioCot({concepto:"",monto:""}); }},"No todavía")
            ),
            envioCotizacion&&e("div",null,
              e("div",{style:{marginBottom:8}},
                e("label",{style:st.lbl},"¿Qué le ofreciste?"),
                servicios.length>0&&e("select",{value:formEnvioCot.concepto,onChange:function(ev){ var sv=servicios.find(function(x){ return x.nombre===ev.target.value; }); if(sv) setFormEnvioCot(Object.assign({},formEnvioCot,{concepto:sv.nombre,monto:sv.precio})); else setFormEnvioCot(Object.assign({},formEnvioCot,{concepto:""})); },style:Object.assign({},st.inp,{marginBottom:6})},
                  e("option",{value:""},"-- Del catálogo --"),
                  servicios.map(function(sv){ return e("option",{key:sv.id,value:sv.nombre},sv.nombre+" , $"+Number(sv.precio).toLocaleString()); })
                ),
                e("input",{value:formEnvioCot.concepto,onChange:function(ev){ setFormEnvioCot(Object.assign({},formEnvioCot,{concepto:ev.target.value})); },placeholder:"ej. Sesión fotográfica...",style:st.inp})
              ),
              e("div",null,
                e("label",{style:st.lbl},"Monto ($)"),
                e(MontoInput,{value:formEnvioCot.monto,onChange:function(ev){ setFormEnvioCot(Object.assign({},formEnvioCot,{monto:ev.target.value})); },placeholder:"0",style:st.inp})
              )
            )
          ),

          // Notas
          e("div",{style:{marginBottom:4}},
            e("label",{style:st.lbl},"¿Qué está buscando este cliente?"),
            e("textarea",{value:form.notas,onChange:function(ev){ setForm(Object.assign({},form,{notas:ev.target.value})); },placeholder:"Ej. Más ventas, un logo nuevo, remodelar su local, mejorar sus redes sociales...",style:Object.assign({},st.inp,{minHeight:60,resize:"vertical"})})
          ),

          // Nota de recontacto (solo Perdido)
          form.etapa==="Perdido"&&e("div",{style:{marginBottom:4}},
            e("label",{style:st.lbl},"¿Por qué no cerró? / Nota para recontactar"),
            e("textarea",{value:form.notaRecontacto||"",onChange:function(ev){ setForm(Object.assign({},form,{notaRecontacto:ev.target.value})); },placeholder:"Ej. Le encantó la propuesta pero dijo que en ese momento no podía. Mencionó que en junio tendría más presupuesto.",style:Object.assign({},st.inp,{minHeight:60,resize:"vertical"})})
          )
        ),

        // FOOTER
        e("div",{style:{padding:isMobile?"12px 24px 28px":"14px 24px",borderTop:"1px solid "+C.border,display:"flex",gap:8,justifyContent:"flex-end",background:C.surfaceUp,flexShrink:0}},
          e("button",{style:st.btn,onClick:function(){ setModalCliente(false); }},"Cancelar"),
          e("button",{style:Object.assign({},st.btnP,{opacity:form.nombre.trim()?1:0.5}),onClick:guardarCliente,disabled:!form.nombre.trim()},"Guardar")
        )
      )
    ),

    // MODAL COTIZACION
    modalCot&&e("div",{style:Object.assign({},st.ov,{overflow:"hidden"}),onClick:function(){ setModalCot(false); }},
      e("div",{style:{background:C.surface,borderRadius:isMobile?"20px 20px 0 0":"20px",width:isMobile?"100%":560,maxWidth:"100%",maxHeight:isMobile?"94vh":"88vh",border:isMobile?"none":"1px solid "+C.border,boxShadow:"0 8px 32px rgba(0,0,0,0.14)",display:"flex",flexDirection:"column",overflow:"hidden",margin:isMobile?0:"auto"},onClick:function(ev){ ev.stopPropagation(); }},

        // HEADER
        e("div",{style:{padding:"20px 24px 16px",background:"linear-gradient(135deg,"+C.purplePale+" 0%,transparent 70%)",borderBottom:"1px solid "+C.border,flexShrink:0,display:"flex",alignItems:"flex-start",justifyContent:"space-between"}},
          e("div",null,
            e("div",{style:{fontWeight:700,fontSize:18,color:C.text}},editCotId?"Editar "+TXT.cotizacion:"Nueva cotización"),
            e("div",{style:{fontSize:12,color:C.textMuted,marginTop:2}},"Prepara una propuesta para tu cliente")
          ),
          e("button",{style:{background:C.surfaceUp,border:"1px solid "+C.border,borderRadius:10,cursor:"pointer",color:C.textMuted,fontSize:16,lineHeight:1,padding:"6px 10px"},onClick:function(){ setModalCot(false); setEtapaPendiente(null); }},"×")
        ),

        // BODY SCROLLABLE
        e("div",{style:{padding:isMobile?"16px 20px":"20px 24px",overflowY:"auto",overflowX:"hidden",flex:1,display:"flex",flexDirection:"column",gap:isMobile?14:18}},

          // CLIENTE
          e("div",{style:{position:"relative"}},
            e("label",{style:st.lbl},"Cliente"),
            e("div",{style:{display:"flex",gap:6}},
              e("input",{
                placeholder:formCot.clienteId?(clientes.find(function(c){ return String(c.id)===String(formCot.clienteId); })||{}).nombre||"Buscar cliente...":"Buscar cliente...",
                value:buscaCli,
                onChange:function(ev){ setBuscaCli(ev.target.value); setFormCot(Object.assign({},formCot,{clienteId:""})); },
                onFocus:function(){ setBuscaCli(""); },
                style:Object.assign({},st.inp,{flex:1})
              }),
              e("button",{
                style:{cursor:"pointer",padding:"0 14px",borderRadius:10,border:"1px solid "+C.border,background:buscaCli==="*"?C.purplePale:"transparent",fontSize:14,color:C.textMuted,flexShrink:0},
                onClick:function(){ setBuscaCli(buscaCli==="*"?"":"*"); setFormCot(Object.assign({},formCot,{clienteId:""})); },
                title:"Ver todos"
              },"☰")
            ),
            (buscaCli.length>0)&&e("div",{style:{position:"absolute",top:"100%",left:0,right:0,background:C.surface,border:"1px solid "+C.border,borderRadius:10,zIndex:50,maxHeight:220,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.1)"}},
              [...clientes]
                .filter(function(c){ return buscaCli==="*"||c.nombre.toLowerCase().includes(buscaCli.toLowerCase())||c.negocio.toLowerCase().includes(buscaCli.toLowerCase()); })
                .sort(function(a,b){ return a.nombre.localeCompare(b.nombre,"es"); })
                .map(function(c){
                  return e("div",{key:c.id,
                    style:{padding:"10px 14px",cursor:"pointer",fontSize:13,color:C.text,borderBottom:"0.5px solid "+C.border},
                    onMouseDown:function(ev){ ev.preventDefault(); setFormCot(Object.assign({},formCot,{clienteId:String(c.id),nuevoNombre:""})); setBuscaCli(""); },
                  },
                    e("div",{style:{fontWeight:500}},c.nombre),
                    c.negocio&&e("div",{style:{fontSize:12,color:C.textDim}},c.negocio)
                  );
                }),
              buscaCli!=="*"&&buscaCli.trim().length>1&&e("div",{
                style:{padding:"10px 14px",cursor:"pointer",fontSize:13,color:C.purple,fontWeight:600,borderTop:"1px solid "+C.border},
                onMouseDown:function(ev){ ev.preventDefault(); setFormCot(Object.assign({},formCot,{clienteId:"",nuevoNombre:buscaCli.trim()})); setBuscaCli(""); }
              },"＋ Agregar \""+buscaCli.trim()+"\" como nuevo cliente")
            ),
            formCot.clienteId&&!buscaCli&&(function(){
              var cl=clientes.find(function(c){ return String(c.id)===String(formCot.clienteId); });
              if(!cl) return null;
              return e("div",{style:{marginTop:6,padding:"8px 12px",background:C.purplePale,borderRadius:8,fontSize:13,color:C.purple,display:"flex",justifyContent:"space-between",alignItems:"center"}},
                e("div",null,
                  e("div",{style:{fontWeight:600}},cl.nombre),
                  cl.negocio&&e("div",{style:{fontSize:12,opacity:0.7}},cl.negocio)
                ),
                e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:16},onClick:function(){ setFormCot(Object.assign({},formCot,{clienteId:""})); setBuscaCli(""); }},"×")
              );
            })(),
            !formCot.clienteId&&formCot.nuevoNombre&&!buscaCli&&e("div",null,
              e("div",{style:{marginTop:6,padding:"8px 12px",background:"#ECFDF5",borderRadius:8,fontSize:13,color:"#10B981",display:"flex",justifyContent:"space-between",alignItems:"center"}},
                e("span",null,"＋ Nuevo: ",e("b",null,formCot.nuevoNombre)),
                e("button",{style:{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:16},onClick:function(){ setFormCot(Object.assign({},formCot,{nuevoNombre:""})); }},"×")
              ),
              e("div",{style:{marginTop:10}},
                e("label",{style:st.lbl},"¿Cómo llegó a ti?"),
                e("div",{style:{display:"flex",flexWrap:"wrap",gap:6}},
                  ["Instagram","Facebook","WhatsApp","Referido","TikTok","Otro"].map(function(org){
                    var activo=formCot.nuevoOrigen===org;
                    return e("button",{key:org,type:"button",
                      style:{cursor:"pointer",padding:"6px 12px",borderRadius:20,border:"1px solid "+(activo?C.purple:C.border),background:activo?C.purple:"transparent",fontSize:12,color:activo?"#fff":C.textMuted,fontWeight:activo?600:400},
                      onClick:function(){ setFormCot(Object.assign({},formCot,{nuevoOrigen:org})); }
                    },org);
                  })
                )
              ),
              e("div",{style:{marginTop:10}},
                e("label",{style:Object.assign({},st.lbl,{display:"flex",alignItems:"center",gap:4})},
                  "¿Dónde lo contactas?",
                  e("span",{style:{fontSize:10,color:C.amber,fontWeight:600}},"obligatorio")
                ),
                e("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:formCot.nuevoCanal?8:0}},
                  ["WhatsApp","Instagram","Facebook"].map(function(canal){
                    var activo=formCot.nuevoCanal===canal;
                    return e("button",{key:canal,type:"button",
                      style:{cursor:"pointer",padding:"7px 14px",borderRadius:20,border:"1.5px solid "+(activo?C.purple:C.border),background:activo?C.purple:"transparent",fontSize:12,color:activo?"#fff":C.textMuted,fontWeight:activo?600:400},
                      onClick:function(){ setFormCot(Object.assign({},formCot,{nuevoCanal:canal,nuevoContacto:""})); }
                    },canal);
                  })
                ),
                formCot.nuevoCanal&&e("input",{
                  placeholder:formCot.nuevoCanal==="WhatsApp"?"Número de WhatsApp (10 dígitos)":formCot.nuevoCanal==="Instagram"?"Usuario de Instagram (@...)":"Usuario de Facebook",
                  value:formCot.nuevoContacto||"",
                  onChange:function(ev){
                    var v=formCot.nuevoCanal==="WhatsApp"?ev.target.value.replace(/\D/g,"").slice(0,10):ev.target.value;
                    setFormCot(Object.assign({},formCot,{nuevoContacto:v}));
                  },
                  type:formCot.nuevoCanal==="WhatsApp"?"tel":"text",
                  maxLength:formCot.nuevoCanal==="WhatsApp"?10:undefined,
                  inputMode:formCot.nuevoCanal==="WhatsApp"?"numeric":undefined,
                  style:st.inp
                }),
                formCot.nuevoCanal==="WhatsApp"&&formCot.nuevoContacto&&formCot.nuevoContacto.length>0&&formCot.nuevoContacto.length<10&&e("div",{style:{fontSize:11,color:"#E53E3E",marginTop:4}},"Faltan "+(10-formCot.nuevoContacto.length)+" dígitos")
              )
            )
          ),

          // SERVICIO DEL CATÁLOGO
          // CONCEPTO + CATÁLOGO
          e("div",null,
            e("label",{style:st.lbl},TXT.concepto),
            servicios.length>0&&e("div",null,
              e("select",{
                value:servicios.some(function(sv){ return sv.nombre===formCot.concepto; })?formCot.concepto:"",
                onChange:function(ev){
                  var sv=servicios.find(function(x){ return x.nombre===ev.target.value; });
                  if(sv) setFormCot(Object.assign({},formCot,{concepto:sv.nombre,precioUnit:sv.precio,notas:sv.descripcion||"",svCondiciones:(sv.condiciones||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim(),svCondicionesHtml:sv.condiciones||""}));
                  else setFormCot(Object.assign({},formCot,{concepto:""}));
                },
                style:Object.assign({},st.inp,{marginBottom:8,color:servicios.some(function(sv){ return sv.nombre===formCot.concepto; })?C.text:C.textMuted})
              },
                e("option",{value:""},"-- Seleccionar del catálogo --"),
                servicios.map(function(sv){ return e("option",{key:sv.id,value:sv.nombre},sv.nombre+" · $"+Number(sv.precio).toLocaleString()); })
              ),
              e("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:8}},
                e("div",{style:{flex:1,height:1,background:C.border}}),
                e("div",{style:{fontSize:11,color:C.textDim,whiteSpace:"nowrap"}},"o escríbelo manualmente"),
                e("div",{style:{flex:1,height:1,background:C.border}})
              )
            ),
            e("input",{value:formCot.concepto,onChange:function(ev){ setFormCot(Object.assign({},formCot,{concepto:ev.target.value})); },placeholder:esProductos?"ej. Aretes plata, Pastel boda...":"ej. Sesión fotográfica, Diseño web...",style:st.inp}),
            servicios.length>0&&!servicios.some(function(sv){ return sv.nombre===formCot.concepto; })&&formCot.concepto.trim()&&e("div",{style:{fontSize:12,color:C.textDim,marginTop:5}},"¿No está en la lista? Te preguntaremos si quieres guardarlo al catálogo.")
          ),

          // PRECIO + DESCUENTO unificados
          e("div",{style:{background:C.surfaceUp,borderRadius:14,padding:"16px",border:"1px solid "+C.border}},
            e("div",{style:{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:12}},"Precio"),

            // Fila: cantidad + precio unit
            e("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}},
              e("div",null,
                e("div",{style:{fontSize:12,color:C.textMuted,marginBottom:5}},"Cantidad"),
                e("input",{type:"number",min:"1",value:formCot.cantidad,onChange:function(ev){ setFormCot(Object.assign({},formCot,{cantidad:ev.target.value})); },style:st.inp})
              ),
              e("div",null,
                e("div",{style:{fontSize:12,color:C.textMuted,marginBottom:5}},"Precio unitario"),
                e(MontoInput,{value:formCot.precioUnit,onChange:function(ev){ setFormCot(Object.assign({},formCot,{precioUnit:ev.target.value})); },style:st.inp,placeholder:"0"})
              )
            ),

            // Separador
            e("div",{style:{height:1,background:C.border,margin:"4px 0 12px"}}),

            // Descuento
            e("div",{style:{marginBottom:12}},
              e("div",{style:{fontSize:12,color:C.textMuted,marginBottom:8}},"Descuento (opcional)"),
              e("div",{style:{display:"flex",gap:8,alignItems:"center"}},
                e("div",{style:{display:"flex",borderRadius:10,border:"1px solid "+C.border,overflow:"hidden",flexShrink:0,background:C.surface}},
                  e("button",{style:{padding:"8px 12px",background:formCot.tipoDescuento==="porcentaje"?C.purple:"transparent",color:formCot.tipoDescuento==="porcentaje"?"#fff":C.textMuted,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,whiteSpace:"nowrap"},onClick:function(){ setFormCot(Object.assign({},formCot,{tipoDescuento:"porcentaje",descuento:""})); }},"%"),
                  e("button",{style:{padding:"8px 12px",background:formCot.tipoDescuento==="monto"?C.purple:"transparent",color:formCot.tipoDescuento==="monto"?"#fff":C.textMuted,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,whiteSpace:"nowrap"},onClick:function(){ setFormCot(Object.assign({},formCot,{tipoDescuento:"monto",descuento:""})); }},"$")
                ),
                e("input",{type:"number",min:"0",value:formCot.descuento||"",placeholder:formCot.tipoDescuento==="porcentaje"?"ej. 10":"ej. 200",onChange:function(ev){ setFormCot(Object.assign({},formCot,{descuento:ev.target.value})); },style:Object.assign({},st.inp,{flex:1})})
              )
            ),

            // Total final
            (function(){
              var sub=(Number(formCot.cantidad)||1)*Number(formCot.precioUnit||0);
              var desc=Number(formCot.descuento||0);
              var montoDesc=desc>0?(formCot.tipoDescuento==="porcentaje"?sub*desc/100:desc):0;
              var total=Math.max(0,sub-montoDesc);
              return e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:total>0?C.greenBg:C.bg,borderRadius:10,border:"1px solid "+(total>0?C.greenBorder:C.border)}},
                e("div",null,
                  e("div",{style:{fontSize:11,color:C.textMuted,marginBottom:2}},montoDesc>0?"Total con descuento":"Total"),
                  montoDesc>0&&e("div",{style:{fontSize:11,color:C.textDim}},"Ahorro: $"+Math.round(montoDesc).toLocaleString())
                ),
                e("div",{style:{fontSize:20,fontWeight:700,color:total>0?C.green:C.textMuted}},"$"+total.toLocaleString())
              );
            })()
          ),

          // VIGENCIA
          e("div",null,
            e("label",{style:st.lbl},"Vigencia (días)"),
            e("div",{style:{display:"flex",gap:10,alignItems:"center"}},
              e("input",{type:"number",min:"1",placeholder:"ej. 7",value:formCot.vigenciaDias||"",onChange:function(ev){
                var dias=Number(ev.target.value); var fecha="";
                if(dias>0){ var d=new Date(); d.setDate(d.getDate()+dias); fecha=fmtFechaLocal(d); }
                setFormCot(Object.assign({},formCot,{vigenciaDias:ev.target.value,vigencia:fecha}));
              },style:Object.assign({},st.inp,{flex:1})}),
              formCot.vigencia&&e("div",{style:{fontSize:12,color:C.textMuted,whiteSpace:"nowrap",flexShrink:0,paddingLeft:4}},"Vence: "+formCot.vigencia)
            )
          ),

          // DESCRIPCIÓN
          formCot.notas!==undefined&&e("div",null,
            e("label",{style:st.lbl},"Descripción del servicio"),
            e(RichEditor,{key:"cot-desc-"+(editCotId||"new")+"-"+formCot.concepto,value:formCot.notas||"",onChange:function(v){ setFormCot(Object.assign({},formCot,{notas:v})); },placeholder:"Qué incluye este servicio para este cliente...",minHeight:64})
          ),

          // CONDICIONES
          e("div",{style:{background:"#FFFBEB",borderRadius:12,padding:"14px",border:"1px solid "+C.amberBorder}},
            e("label",{style:Object.assign({},st.lbl,{color:C.amber})},"Condiciones"),
            e("div",{style:{fontSize:12,color:"#92400E",marginBottom:8}},"Solo aplican a esta cotización,no modifican tu catálogo."),
            e(RichEditor,{key:"cot-cond-"+(editCotId||"new")+"-"+formCot.concepto,value:formCot.svCondicionesHtml||formCot.svCondiciones||"",onChange:function(v){ setFormCot(Object.assign({},formCot,{svCondicionesHtml:v,svCondiciones:v.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()})); },placeholder:"Entrega, revisiones, forma de pago, excepciones...",minHeight:70})
          )
        ),

        // FOOTER FIJO
        e("div",{style:{padding:isMobile?"12px 20px 28px":"14px 24px",borderTop:"1px solid "+C.border,display:"flex",gap:8,justifyContent:"flex-end",background:C.surfaceUp,flexShrink:0,flexWrap:"wrap"}},
          e("button",{style:st.btn,onClick:function(){ setModalCot(false); setEtapaPendiente(null); }},"Cancelar"),
          e("button",{
            style:Object.assign({},st.btnP,{opacity:formCot.concepto.trim()?1:0.5,background:"transparent",border:"1.5px solid "+C.purple,color:C.purple}),
            disabled:!formCot.concepto.trim(),
            onClick:function(){
              if((!formCot.clienteId&&!(formCot.nuevoNombre&&formCot.nuevoNombre.trim()))||!formCot.concepto||!formCot.precioUnit) return;
              var clienteIdPDF=formCot.clienteId;
              if(!clienteIdPDF&&formCot.nuevoNombre&&formCot.nuevoNombre.trim()){
                if(!formCot.nuevoCanal||!formCot.nuevoContacto||!formCot.nuevoContacto.trim()){
                  alert("Selecciona por dónde contactas a este cliente antes de guardar.");
                  return;
                }
                if(formCot.nuevoCanal==="WhatsApp"&&formCot.nuevoContacto.replace(/\D/g,"").length!==10){
                  alert("El número de WhatsApp debe tener exactamente 10 dígitos.");
                  return;
                }
                var nuevoClienteIdPDF=Date.now();
                var canalPDF=formCot.nuevoCanal||"WhatsApp";
                setClientes([Object.assign({},formVacio,{
                  id:nuevoClienteIdPDF,
                  nombre:formCot.nuevoNombre.trim(),
                  fecha:FECHA_HOY,
                  fechaEtapa:FECHA_HOY,
                  etapa:"Nuevo contacto",
                  ultimoContacto:FECHA_HOY,
                  origen:formCot.nuevoOrigen||"",
                  canalPrincipal:canalPDF,
                  contacto:canalPDF==="WhatsApp"?(formCot.nuevoContacto||"").replace(/\D/g,""):"",
                  instagram:canalPDF==="Instagram"?(formCot.nuevoContacto||""):"",
                  messenger:canalPDF==="Facebook"?(formCot.nuevoContacto||""):""
                }),...clientes]);
                clienteIdPDF=String(nuevoClienteIdPDF);
                formCot=Object.assign({},formCot,{clienteId:clienteIdPDF});
              }
              // Construir cot igual que guardarCot
              var subtotal=Number(formCot.cantidad)*Number(formCot.precioUnit);
              var desc=Number(formCot.descuento||0);
              var monto=formCot.tipoDescuento==="porcentaje"?subtotal-(subtotal*desc/100):subtotal-desc;
              monto=Math.max(0,monto);
              var cotParaPDF=Object.assign({},formCot,{
                id:editCotId||Date.now(),
                clienteId:Number(clienteIdPDF),
                monto:monto,
                fecha:FECHA_HOY,
              });
              var clParaPDF={nombre:formCot.nuevoNombre?formCot.nuevoNombre.trim():(clientes.find(function(c){ return String(c.id)===String(clienteIdPDF); })||{}).nombre};
              var clExistenteParaPDF=clientes.find(function(c){ return String(c.id)===String(clienteIdPDF); });
              if(clExistenteParaPDF) clParaPDF=clExistenteParaPDF;
              // Guardar primero
              guardarCot();
              // Generar PDF con los datos ya construidos
              generarPDFCot(cotParaPDF,clParaPDF,perfil);
            }
          },"Guardar y PDF ↓"),
          e("button",{style:Object.assign({},st.btnP,{opacity:formCot.concepto.trim()?1:0.5}),onClick:guardarCot,disabled:!formCot.concepto.trim()},"Guardar")
        )
      )
    )
  );
}