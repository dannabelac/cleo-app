// Verificación local desechable (NO toca CLEO Pruebas, NO despliega nada):
// prueba la función asistente-proxy REAL (el código de
// supabase/functions/asistente-proxy/index.ts, corriendo con Deno vía
// dev-local-serve.ts) contra 2 simuladores propios (fake-auth-asistente,
// fake-n8n-asistente) -- esto es distinto de las pruebas de interfaz, que
// interceptan la llamada ANTES de que salga del navegador y por lo tanto
// nunca ejercitan el código real de la función.
//
// Levanta instancias nuevas en puertos propios (no toca nada que ya esté
// corriendo) y las apaga al terminar.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, '..');
const DENO_BIN = process.env.DENO_BIN || '/Users/danna/Documents/cleo-whatsapp-pruebas/.deno-local/bin/deno';

const PUERTO_FUNCION = 8818;
const PUERTO_N8N = 8819;
const PUERTO_AUTH = 8820;
const SECRETO = 'secreto-prueba-automatizada';

function fail(msg) { console.log('❌ FALLÓ:', msg); process.exitCode = 1; }
function ok(msg) { console.log('✅', msg); }

function esperarPuerto(url, intentosMax) {
  return new Promise((resolve, reject) => {
    let intentos = 0;
    const intentar = () => {
      intentos++;
      fetch(url).then(() => resolve()).catch(() => {
        if (intentos >= intentosMax) reject(new Error('no respondió ' + url));
        else setTimeout(intentar, 200);
      });
    };
    intentar();
  });
}

async function main() {
  const procesos = [];
  function lanzar(cmd, args, env, nombre) {
    const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', () => {});
    p.stderr.on('data', (d) => { if (process.env.DEBUG_PROXY_TEST) console.error('[' + nombre + ']', d.toString()); });
    procesos.push(p);
    return p;
  }

  lanzar('node', [path.join(RAIZ, 'tests/sim/fake-auth-asistente.mjs')], { PORT: String(PUERTO_AUTH) }, 'fake-auth');
  lanzar('node', [path.join(RAIZ, 'tests/sim/fake-n8n-asistente.mjs')], { PORT: String(PUERTO_N8N), EXPECTED_SECRET: SECRETO, DELAY_MS: '2000' }, 'fake-n8n');

  await esperarPuerto('http://127.0.0.1:' + PUERTO_AUTH + '/auth/v1/user', 25);
  await esperarPuerto('http://127.0.0.1:' + PUERTO_N8N, 25).catch(() => {}); // responde 405 a GET, pero ya cuenta como "arriba"

  const envFuncion = {
    SUPABASE_URL: 'http://127.0.0.1:' + PUERTO_AUTH,
    SUPABASE_ANON_KEY: 'anon-key-de-prueba',
    CLEO_ASISTENTE_N8N_URL: 'http://127.0.0.1:' + PUERTO_N8N,
    CLEO_ASISTENTE_N8N_SECRET: SECRETO,
    CLEO_ASISTENTE_MAX_MENSAJE_CHARS: '4000',
    CLEO_ASISTENTE_MAX_HISTORIAL_ENTRADAS: '60',
    CLEO_ASISTENTE_MAX_HISTORIAL_CHARS: '60000',
    CLEO_ASISTENTE_RATE_LIMIT_POR_MINUTO: '30', // alto a propósito -- el límite BAJO se prueba por separado, en su propia instancia con su propio contador
    CLEO_ASISTENTE_N8N_TIMEOUT_MS: '700', // corto a propósito -- fake-n8n tarda 2000ms con DISPARAR_LENTO
    PORT: String(PUERTO_FUNCION),
  };
  lanzar(DENO_BIN, [
    'run',
    '--allow-net',
    '--allow-env',
    path.join(__dirname, '..', 'supabase/functions/asistente-proxy/dev-local-serve.ts'),
  ], envFuncion, 'asistente-proxy');

  const URL_FUNCION = 'http://127.0.0.1:' + PUERTO_FUNCION;
  await esperarPuerto(URL_FUNCION, 40).catch(() => {}); // responde 405 a GET, cuenta como "arriba"

  async function llamar(body, headers) {
    const res = await fetch(URL_FUNCION, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(headers || {}) },
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data };
  }

  console.log('\n--- Autenticación: sesión ausente, inválida, vencida y válida ---');
  {
    const r1 = await llamar({ mensaje: 'hola', historial: [] }, {});
    if (r1.status !== 401 || r1.data?.codigo !== 'sin_sesion') fail('sin Authorization debería dar 401 sin_sesion, dio ' + r1.status + ' ' + JSON.stringify(r1.data));
    else ok('sin sesión -> 401 sin_sesion');

    const r2 = await llamar({ mensaje: 'hola', historial: [] }, { Authorization: 'Bearer esto-no-es-un-token-real' });
    if (r2.status !== 401 || r2.data?.codigo !== 'sesion_invalida') fail('token inválido debería dar 401 sesion_invalida, dio ' + r2.status + ' ' + JSON.stringify(r2.data));
    else ok('token inválido -> 401 sesion_invalida');

    const r3 = await llamar({ mensaje: 'hola', historial: [] }, { Authorization: 'Bearer TOKEN_EXPIRADO' });
    if (r3.status !== 401 || r3.data?.codigo !== 'sesion_invalida') fail('token vencido debería dar 401 sesion_invalida, dio ' + r3.status + ' ' + JSON.stringify(r3.data));
    else ok('token vencido -> 401 sesion_invalida (el auth real de Supabase distingue el motivo, aquí basta con que se rechace)');

    const r4 = await llamar({ mensaje: 'hola', historial: [] }, { Authorization: 'Bearer TOKEN_VALIDO' });
    if (r4.status !== 200 || r4.data?.estado !== 'completo') fail('sesión válida debería pasar y recibir la respuesta de n8n, dio ' + r4.status + ' ' + JSON.stringify(r4.data));
    else ok('sesión válida -> pasa la autenticación y recibe la respuesta de n8n tal cual');
  }

  console.log('\n--- CORS: el navegador manda un preflight OPTIONS antes del POST real ---');
  {
    // Esto reproduce exactamente lo que hace un navegador real ANTES de la
    // solicitud real -- si esto falla, el navegador bloquea todo sin que
    // el código de autenticación/n8n de abajo llegue siquiera a correr
    // (así se manifestó el bug real: error genérico en el chat, sin nunca
    // tocar n8n).
    const res = await fetch(URL_FUNCION, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5199',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,apikey,content-type,x-client-info',
      },
    });
    const permiteOrigen = res.headers.get('access-control-allow-origin');
    if (res.status >= 400 || !permiteOrigen) fail('el preflight OPTIONS debería responder 2xx con Access-Control-Allow-Origin, dio status ' + res.status + ' allow-origin=' + permiteOrigen);
    else ok('el preflight OPTIONS responde correctamente con las cabeceras CORS necesarias');
  }

  console.log('\n--- Límites de tamaño (mensaje y historial) ---');
  {
    const r1 = await llamar({ mensaje: '', historial: [] }, { Authorization: 'Bearer TOKEN_VALIDO' });
    if (r1.status !== 400 || r1.data?.codigo !== 'mensaje_vacio') fail('mensaje vacío debería rechazarse, dio ' + r1.status + ' ' + JSON.stringify(r1.data));
    else ok('mensaje vacío -> 400 mensaje_vacio');

    const r2 = await llamar({ mensaje: 'a'.repeat(5000), historial: [] }, { Authorization: 'Bearer TOKEN_VALIDO' });
    if (r2.status !== 400 || r2.data?.codigo !== 'mensaje_muy_largo') fail('mensaje de 5000 chars debería rechazarse (límite 4000), dio ' + r2.status + ' ' + JSON.stringify(r2.data));
    else ok('mensaje que excede el límite -> 400 mensaje_muy_largo (nunca llega a n8n)');

    const historialLargo = Array.from({ length: 61 }, () => ({ rol: 'usuario', texto: 'x' }));
    const r3 = await llamar({ mensaje: 'hola', historial: historialLargo }, { Authorization: 'Bearer TOKEN_VALIDO' });
    if (r3.status !== 400 || r3.data?.codigo !== 'historial_muy_largo') fail('historial de 61 entradas debería rechazarse (límite 60), dio ' + r3.status + ' ' + JSON.stringify(r3.data));
    else ok('historial con más entradas que el límite -> 400 historial_muy_largo (nunca llega a n8n)');
  }

  console.log('\n--- La URL de destino SIEMPRE es la fija del servidor ---');
  {
    const r = await llamar({ mensaje: 'hola', historial: [], url: 'http://evil.example/robar' }, { Authorization: 'Bearer TOKEN_VALIDO' });
    if (r.status !== 200 || r.data?.cliente !== 'Prueba Proxy') fail('un campo "url" en el cuerpo debería ignorarse por completo, dio ' + r.status + ' ' + JSON.stringify(r.data));
    else ok('un intento de mandar "url" en el cuerpo se ignora -- la función solo usa la URL fija de su propia variable de entorno');
  }

  console.log('\n--- Cabecera secreta hacia n8n ---');
  {
    // fake-n8n-asistente ya rechaza cualquier secreto que no coincida (ver
    // su propio código) -- el caso de éxito de arriba ya prueba que la
    // función SÍ manda el secreto correcto (si no, fake-n8n habría
    // respondido 401 y la prueba de "sesión válida" habría fallado). Aquí
    // se confirma explícitamente que, si n8n rechaza el secreto, la
    // persona que usa el chat nunca ve el motivo real (nunca se filtra
    // que existe un secreto) -- solo un error genérico.
    const envMal = { ...envFuncion, CLEO_ASISTENTE_N8N_SECRET: 'secreto-incorrecto', PORT: '8821' };
    const pMal = spawn(DENO_BIN, ['run', '--allow-net', '--allow-env', path.join(__dirname, '..', 'supabase/functions/asistente-proxy/dev-local-serve.ts')], { env: { ...process.env, ...envMal }, stdio: ['ignore', 'pipe', 'pipe'] });
    procesos.push(pMal);
    await esperarPuerto('http://127.0.0.1:8821', 40).catch(() => {});
    const res = await fetch('http://127.0.0.1:8821', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer TOKEN_VALIDO' }, body: JSON.stringify({ mensaje: 'hola', historial: [] }) });
    const data = await res.json().catch(() => null);
    if (res.status !== 502 || data?.codigo !== 'n8n_error') fail('un secreto incorrecto hacia n8n debería traducirse en un error genérico 502 n8n_error, dio ' + res.status + ' ' + JSON.stringify(data));
    else ok('cuando el secreto hacia n8n es incorrecto (n8n lo rechaza), la función responde un error genérico sin filtrar el motivo real');
  }

  console.log('\n--- Errores de n8n (passthrough seguro) ---');
  {
    const r1 = await llamar({ mensaje: 'DISPARAR_ERROR_N8N', historial: [] }, { Authorization: 'Bearer TOKEN_VALIDO' });
    if (r1.status !== 502 || r1.data?.codigo !== 'n8n_error') fail('n8n respondiendo 500 debería dar 502 n8n_error, dio ' + r1.status + ' ' + JSON.stringify(r1.data));
    else ok('n8n respondiendo con error -> 502 n8n_error (no se reenvía el cuerpo crudo de n8n)');

    const r2 = await llamar({ mensaje: 'DISPARAR_JSON_INVALIDO', historial: [] }, { Authorization: 'Bearer TOKEN_VALIDO' });
    if (r2.status !== 502 || r2.data?.codigo !== 'n8n_error') fail('n8n respondiendo texto no-JSON debería dar 502 n8n_error, dio ' + r2.status + ' ' + JSON.stringify(r2.data));
    else ok('n8n respondiendo algo que no es JSON válido -> 502 n8n_error, sin tronar');
  }

  console.log('\n--- Tiempo máximo de espera ---');
  {
    const inicio = Date.now();
    const r = await llamar({ mensaje: 'DISPARAR_LENTO', historial: [] }, { Authorization: 'Bearer TOKEN_VALIDO' });
    const duracion = Date.now() - inicio;
    if (r.status !== 504 || r.data?.codigo !== 'tiempo_agotado') fail('n8n tardando más del límite (2000ms vs límite 700ms) debería dar 504 tiempo_agotado, dio ' + r.status + ' ' + JSON.stringify(r.data));
    else ok('n8n tardando más del límite configurado -> 504 tiempo_agotado');
    if (duracion > 1800) fail('el timeout tardó ' + duracion + 'ms en resolverse -- debería cortar cerca del límite configurado (700ms), no esperar a que n8n responda (2000ms)');
    else ok('el timeout corta cerca del límite configurado (' + duracion + 'ms), no espera a que n8n responda');
  }

  console.log('\n--- Límite de solicitudes por usuaria ---');
  {
    // Instancia propia con un límite bajo y su propio contador en memoria
    // (nunca comparte estado con la instancia principal de arriba) --
    // así se prueba el límite sin que las llamadas de las secciones
    // anteriores lo disparen antes de tiempo.
    const envLimite = { ...envFuncion, CLEO_ASISTENTE_RATE_LIMIT_POR_MINUTO: '3', PORT: '8822' };
    const pLimite = spawn(DENO_BIN, ['run', '--allow-net', '--allow-env', path.join(__dirname, '..', 'supabase/functions/asistente-proxy/dev-local-serve.ts')], { env: { ...process.env, ...envLimite }, stdio: ['ignore', 'pipe', 'pipe'] });
    procesos.push(pLimite);
    await esperarPuerto('http://127.0.0.1:8822', 40).catch(() => {});
    let vioLimite = false;
    for (let i = 0; i < 6; i++) {
      const res = await fetch('http://127.0.0.1:8822', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer TOKEN_VALIDO' }, body: JSON.stringify({ mensaje: 'hola otra vez', historial: [] }) });
      const data = await res.json().catch(() => null);
      if (res.status === 429 && data?.codigo === 'limite_excedido') { vioLimite = true; break; }
    }
    if (!vioLimite) fail('no se alcanzó el límite de solicitudes por minuto tras varios intentos (límite configurado: 3/min)');
    else ok('al exceder el límite de solicitudes por minuto de una misma usuaria, la función responde 429 limite_excedido');
  }

  for (const p of procesos) { try { p.kill(); } catch {} }
  console.log(process.exitCode === 1 ? '\n=== HUBO FALLOS ===' : '\n=== TODOS LOS CHEQUEOS PASARON (función real, sin mocks de interfaz) ===');
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
