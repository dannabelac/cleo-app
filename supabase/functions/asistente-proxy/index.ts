// Edge Function: intermediario entre el chat del Asistente (navegador) y el
// webhook de n8n. NO DESPLEGADA todavía. Para desplegar en cleo-pruebas
// (nunca en producción sin aprobación explícita):
//   supabase secrets set \
//     CLEO_ASISTENTE_N8N_URL=<URL de producción del webhook de n8n> \
//     CLEO_ASISTENTE_N8N_SECRET=<secreto compartido, elegido por Danna> \
//     --project-ref <ref de cleo-pruebas>
//   supabase functions deploy asistente-proxy --project-ref <ref de cleo-pruebas>
// (SUPABASE_URL / SUPABASE_ANON_KEY ya los inyecta Supabase en el entorno
// de la función al desplegar.)
//
// Por qué existe esta función -- la URL y el secreto de n8n NUNCA deben
// estar en el navegador. El navegador le habla a ESTA función (con su
// propia sesión de Supabase ya iniciada), y es la función quien agrega el
// secreto y llama a n8n del lado del servidor.
//
// Autenticación en dos capas (nunca asumir que la plataforma ya la
// resuelve sola):
//   1. `supabase/config.toml` pide verify_jwt=true para esta función --
//      eso protege la llamada a nivel de plataforma UNA VEZ DESPLEGADA,
//      pero no existe ningún gateway cuando se corre localmente con
//      dev-local-serve.ts, así que NO basta por sí sola.
//   2. Por eso el código de abajo TAMBIÉN valida la sesión explícitamente
//      con supabase.auth.getUser() contra el propio Authorization del
//      que llama -- rechaza sesión ausente, inválida o vencida ANTES de
//      tocar nada más. Esta es la capa que de verdad corre siempre, tanto
//      en local como desplegada.
//
// La URL de destino en n8n SIEMPRE sale de una variable de entorno del
// servidor (CLEO_ASISTENTE_N8N_URL) -- el cuerpo de la solicitud del
// navegador nunca puede elegir a dónde se reenvía, aunque lo intente.
//
// Límites (evitar consumo ilimitado de IA): tamaño máximo de mensaje y de
// historial, y un límite de solicitudes por minuto por usuaria (ver
// limitarTasa). El límite de tasa es EN MEMORIA del proceso -- válido
// mientras la función corre en una sola instancia (como aquí, en local);
// una vez desplegada en varias instancias/regiones el límite ya no es
// exacto entre ellas (limitación conocida, documentada aquí a propósito
// en vez de prometer algo que esta implementación mínima no garantiza).
//
// Nunca se registran el secreto, el mensaje ni el historial completos en
// los logs -- solo metadatos (duración, longitud, código de resultado).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const N8N_URL = Deno.env.get('CLEO_ASISTENTE_N8N_URL') ?? '';
const N8N_SECRET = Deno.env.get('CLEO_ASISTENTE_N8N_SECRET') ?? '';

const MAX_MENSAJE_CHARS = Number(Deno.env.get('CLEO_ASISTENTE_MAX_MENSAJE_CHARS') ?? '4000');
const MAX_HISTORIAL_ENTRADAS = Number(Deno.env.get('CLEO_ASISTENTE_MAX_HISTORIAL_ENTRADAS') ?? '60');
const MAX_HISTORIAL_CHARS = Number(Deno.env.get('CLEO_ASISTENTE_MAX_HISTORIAL_CHARS') ?? '60000');
const RATE_LIMIT_POR_MINUTO = Number(Deno.env.get('CLEO_ASISTENTE_RATE_LIMIT_POR_MINUTO') ?? '20');
const N8N_TIMEOUT_MS = Number(Deno.env.get('CLEO_ASISTENTE_N8N_TIMEOUT_MS') ?? '20000');

// CORS: la llama el navegador (origen distinto al de la función), así que
// el navegador manda un preflight OPTIONS antes del POST real -- sin
// manejarlo, el navegador bloquea la solicitud real ANTES de que llegue
// aquí, sin importar que la autenticación/validación de abajo esté bien.
// La protección real sigue siendo la sesión (capa de abajo) y el secreto
// hacia n8n, no el origen -- por eso se permite cualquier origen, como en
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

  if (!N8N_URL || !N8N_SECRET) {
    // Falta configurar el servidor -- nunca un problema de quien llama.
    console.error('[asistente-proxy] faltan CLEO_ASISTENTE_N8N_URL/CLEO_ASISTENTE_N8N_SECRET');
    return rechazo('no_configurado', 500);
  }

  // ── Reenvío a n8n: SOLO estos 2 campos, la URL SIEMPRE es la fija del
  // servidor (el cuerpo del navegador nunca puede elegir destino) ──────
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), N8N_TIMEOUT_MS);
  let respuestaN8n;
  try {
    respuestaN8n = await fetch(N8N_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cleo-asistente-secret': N8N_SECRET,
      },
      body: JSON.stringify({ mensaje, historial }),
      signal: controlador.signal,
    });
  } catch (err) {
    const duracionMs = Date.now() - inicio;
    if (err && err.name === 'AbortError') {
      console.log('[asistente-proxy] tiempo agotado', { duracionMs, usuariaId: usuaria.id, mensajeChars: mensaje.length });
      return rechazo('tiempo_agotado', 504);
    }
    console.log('[asistente-proxy] n8n no disponible', { duracionMs, usuariaId: usuaria.id });
    return rechazo('n8n_no_disponible', 502);
  } finally {
    clearTimeout(temporizador);
  }

  if (!respuestaN8n.ok) {
    console.log('[asistente-proxy] n8n respondió con error', { status: respuestaN8n.status, usuariaId: usuaria.id });
    return rechazo('n8n_error', 502);
  }

  let datosN8n;
  try {
    datosN8n = await respuestaN8n.json();
  } catch {
    console.log('[asistente-proxy] respuesta de n8n no es JSON válido', { usuariaId: usuaria.id });
    return rechazo('n8n_error', 502);
  }

  console.log('[asistente-proxy] ok', {
    duracionMs: Date.now() - inicio,
    usuariaId: usuaria.id,
    mensajeChars: mensaje.length,
    historialEntradas: historial.length,
    estado: datosN8n && datosN8n.estado,
  });

  // Se devuelve la respuesta de n8n tal cual -- CLEO ya sabe interpretar
  // ese contrato (estado/pregunta/cliente/acciones/venta/oportunidad/
  // recordatorio), ningún cambio de lógica de este lado.
  return new Response(JSON.stringify(datosN8n), {
    status: 200,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

export default { fetch: manejarSolicitud };
