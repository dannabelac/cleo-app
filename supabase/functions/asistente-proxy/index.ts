import { instrucciones, instruccionesServicios, formato } from './contrato.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('CLEO_ASISTENTE_OPENAI_API_KEY') ?? '';

const MAX_MENSAJE_CHARS = Number(Deno.env.get('CLEO_ASISTENTE_MAX_MENSAJE_CHARS') ?? '4000');
const MAX_HISTORIAL_ENTRADAS = Number(Deno.env.get('CLEO_ASISTENTE_MAX_HISTORIAL_ENTRADAS') ?? '60');
const MAX_HISTORIAL_CHARS = Number(Deno.env.get('CLEO_ASISTENTE_MAX_HISTORIAL_CHARS') ?? '60000');
const RATE_LIMIT_POR_MINUTO = Number(Deno.env.get('CLEO_ASISTENTE_RATE_LIMIT_POR_MINUTO') ?? '20');
const OPENAI_TIMEOUT_MS = Number(Deno.env.get('CLEO_ASISTENTE_OPENAI_TIMEOUT_MS') ?? '20000');

// CORS: la llama el navegador (origen distinto al de la función), así que
// el navegador manda un preflight OPTIONS antes del POST real -- sin
// manejarlo, el navegador bloquea la solicitud real ANTES de que llegue
// aquí, sin importar que la autenticación/validación de abajo esté bien.
// La protección real sigue siendo la sesión (capa de abajo) de la usuaria, no el origen -- por eso se permite cualquier origen, como en
// el patrón oficial de Supabase para Edge Functions llamadas desde un
// navegador.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function rechazo(codigo, status) {
  return new Response(JSON.stringify({ estado: 'rechazado', codigo }), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

// Límite de tasa por usuaria -- ventana fija de 60s, en memoria (ver nota
// arriba sobre su alcance real una vez desplegada en varias instancias).
const conteosPorUsuaria = new Map();
function excedeLimiteDeTasa(usuariaId) {
  const ventanaActual = Math.floor(Date.now() / 60000);
  const entrada = conteosPorUsuaria.get(usuariaId);
  if (!entrada || entrada.ventana !== ventanaActual) {
    conteosPorUsuaria.set(usuariaId, { ventana: ventanaActual, conteo: 1 });
    return false;
  }
  entrada.conteo += 1;
  return entrada.conteo > RATE_LIMIT_POR_MINUTO;
}

async function manejarSolicitud(req) {
  const inicio = Date.now();
  // Preflight del navegador -- se responde ANTES de cualquier otra cosa,
  // sin tocar autenticación ni nada más.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return rechazo('metodo_no_permitido', 405);
  }

  // ── Capa 2 de autenticación: sesión real, verificada aquí mismo ──────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return rechazo('sin_sesion', 401);
  }
  const supabaseUsuaria = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  let usuaria;
  try {
    const { data, error } = await supabaseUsuaria.auth.getUser();
    if (error || !data || !data.user) {
      return rechazo('sesion_invalida', 401);
    }
    usuaria = data.user;
  } catch {
    return rechazo('sesion_invalida', 401);
  }

  if (excedeLimiteDeTasa(usuaria.id)) {
    return rechazo('limite_excedido', 429);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return rechazo('body_invalido', 400);
  }

  const mensaje = typeof body?.mensaje === 'string' ? body.mensaje : '';
  const historial = Array.isArray(body?.historial) ? body.historial : [];
  const tipoPerfil = typeof body?.tipoPerfil === 'string' ? body.tipoPerfil : '';
  if (!mensaje.trim()) {
    return rechazo('mensaje_vacio', 400);
  }
  if (mensaje.length > MAX_MENSAJE_CHARS) {
    return rechazo('mensaje_muy_largo', 400);
  }
  if (historial.length > MAX_HISTORIAL_ENTRADAS) {
    return rechazo('historial_muy_largo', 400);
  }
  let historialChars = 0;
  try {
    historialChars = JSON.stringify(historial).length;
  } catch {
    return rechazo('historial_invalido', 400);
  }
  if (historialChars > MAX_HISTORIAL_CHARS) {
    return rechazo('historial_muy_largo', 400);
  }

  if (!OPENAI_API_KEY) return rechazo('no_configurado', 500);

  const zona = 'America/Merida';
  const partes = new Intl.DateTimeFormat('en', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const parte = (tipo) => partes.find(p => p.type === tipo).value;
  const fecha = [parte('year'), parte('month'), parte('day')].join('-');

  try {
    const respuesta = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + OPENAI_API_KEY },
      body: JSON.stringify({
        model: 'gpt-4.1',
        instructions: tipoPerfil === 'servicios' ? instruccionesServicios : instrucciones,
        input: JSON.stringify({ fecha_referencia: fecha, zona_horaria: zona, historial, mensaje }),
        text: { format: formato },
        store: false,
        max_output_tokens: 2500,
      }),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });
    if (!respuesta.ok) {
      console.warn('[asistente-proxy] error del modelo', { status: respuesta.status });
      return rechazo('modelo_no_disponible', 502);
    }
    const datos = await respuesta.json();
    const contenido = (datos.output ?? [])
      .filter(item => item.type === 'message' && item.role === 'assistant')
      .flatMap(item => item.content ?? []);
    if (datos.status !== 'completed' || contenido.some(c => c.type === 'refusal')) {
      return rechazo('respuesta_modelo_incompleta', 502);
    }
    const textos = contenido.filter(c => c.type === 'output_text');
    if (textos.length !== 1 || typeof textos[0].text !== 'string') {
      return rechazo('respuesta_modelo_invalida', 502);
    }
    let resultado;
    try {
      resultado = JSON.parse(textos[0].text);
    } catch {
      return rechazo('respuesta_modelo_invalida', 502);
    }
    if (!resultado || !['pregunta', 'completo'].includes(resultado.estado)
        || !Array.isArray(resultado.acciones)
        || resultado.acciones.some(a => !formato.schema.properties.acciones.items.enum.includes(a))) {
      return rechazo('respuesta_modelo_invalida', 502);
    }
    return new Response(JSON.stringify(resultado), {
      status: 200,
      headers: { 'content-type': 'application/json', ...CORS_HEADERS },
    });
  } catch (err) {
    const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    console.warn('[asistente-proxy] fallo de conexión al modelo', { timeout, duracionMs: Date.now() - inicio });
    return rechazo(timeout ? 'tiempo_agotado' : 'modelo_no_disponible', timeout ? 504 : 502);
  }
}

export default { fetch: manejarSolicitud };
