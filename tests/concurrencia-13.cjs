/**
 * Test 13-CONCURRENTE — verifica que FOR UPDATE en cleo_reabrir_cotizacion
 * bloquea la segunda sesión y produce exactamente 1 entrada en
 * versiones_aceptacion, no 2.
 *
 * REQUISITO PREVIO (una sola vez):
 *   npm install --save-dev pg
 *
 * CÓMO EJECUTAR (recomendado — contraseña no queda en historial):
 *   node tests/concurrencia-13.cjs
 *
 * La contraseña se solicita de forma interactiva con el eco desactivado.
 * Evitar "PGPASSWORD=secreto node ..." en la línea de comandos: esa forma
 * queda en el historial del shell aunque se agregue un espacio inicial.
 * Para automatización sin historial:
 *   read -rs PGPASSWORD && PGPASSWORD="$PGPASSWORD" node tests/concurrencia-13.cjs
 *
 * CONEXIÓN — Session Pooler de CLEO Pruebas:
 *   host:     aws-0-us-east-2.pooler.supabase.com
 *   port:     5432
 *   user:     postgres.pconfadsbtwjbjeblxgl
 *   database: postgres
 *
 * Requiere Session Pooler (modo sesión), no Transaction Pooler. En modo sesión
 * cada conexión mantiene su propio backend de PostgreSQL durante toda la sesión,
 * lo que permite transacciones abiertas y FOR UPDATE concurrente.
 *
 * La protección de entorno valida host + puerto + usuario completo. El host del
 * pooler (aws-0-us-east-2.pooler.supabase.com) es compartido por todos los
 * proyectos de la región; el usuario postgres.pconfadsbtwjbjeblxgl incorpora el
 * ref del proyecto y es lo que identifica CLEO Pruebas de forma unívoca.
 *
 * CERTIFICADO TLS:
 *   El Session Pooler usa una CA que no está en el bundle de Node.js.
 *   1. Abrir Supabase Dashboard → Project Settings → Database
 *      → sección "SSL" → botón "Download certificate".
 *      URL: https://supabase.com/dashboard/project/pconfadsbtwjbjeblxgl/settings/database
 *   2. Guardar el archivo descargado como:
 *        supabase/certs/supabase-ca.crt
 *   El certificado CA es público (no es una clave privada) — puede incluirse
 *   en el repositorio.  rejectUnauthorized permanece en true; el hostname se
 *   sigue verificando contra el CN/SANs del certificado del servidor.
 *
 * VERIFICAR EL FLUJO SIN CONECTARSE A SUPABASE:
 *   node tests/concurrencia-13.cjs --simular
 *   node tests/concurrencia-13.cjs --simular --sim-falla-a   (A.connect() falla)
 *   node tests/concurrencia-13.cjs --simular --sim-falla-b   (B.connect() falla)
 *
 * Este archivo NO es recogido por "npm run test:sync" (no termina en .test.cjs).
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('node:assert/strict');

let Client;
try {
  ({ Client } = require('pg'));
} catch {
  console.error(
    'ERROR: módulo "pg" no encontrado.\n' +
    'Instalar con:  npm install --save-dev pg'
  );
  process.exit(1);
}

const SIMULAR      = process.argv.includes('--simular');
const SIM_FALLA_A  = process.argv.includes('--sim-falla-a');
const SIM_FALLA_B  = process.argv.includes('--sim-falla-b');

// ── Configuración ─────────────────────────────────────────────────────────────
// El host del pooler es compartido; el ref del proyecto está en USUARIO_ESPERADO.
// La validación de entorno exige los tres para identificar CLEO Pruebas de forma
// unívoca y evitar ejecuciones accidentales contra otro proyecto de la región.
const HOST_ESPERADO        = 'aws-0-us-east-2.pooler.supabase.com';
const PORT_ESPERADO        = 5432;
const USUARIO_ESPERADO     = 'postgres.pconfadsbtwjbjeblxgl';
const EMAIL_TEST           = '_t13c@cleo-test.invalid';
const CLEO_ID_COT          = '_t13c_cot';
const TIMEOUT_CONEXION_MS  = 10_000;
const TIMEOUT_STATEMENT_MS = 30_000;
const TIMEOUT_BLOQUEO_MS   = 8_000;
const TIMEOUT_LIMPIEZA_MS  = 5_000;
const LOCK_TIMEOUT_B       = '15s';

// ── Estado compartido para la simulación ─────────────────────────────────────
const sim = {
  bEsperando:        false,
  resolverCommitDeA: null,
  promesaCommitDeA:  null,
};

// ── Solicitar contraseña con eco desactivado ──────────────────────────────────
// unref() en lugar de pause(): no elimina el handle de stdin antes de que
// A.connect() registre el socket TCP como handle activo. pause() vaciaba el
// event loop y terminaba el proceso silenciosamente con código 0.
async function pedirPassword() {
  if (!process.stdin.isTTY) {
    throw new Error(
      'Stdin no es un terminal interactivo. ' +
      'Pasar la contraseña con PGPASSWORD o ejecutar desde un terminal interactivo.'
    );
  }
  process.stderr.write('Contraseña de postgres (CLEO Pruebas): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  return new Promise(resolve => {
    let pwd = '';
    const onData = ch => {
      if (ch === '' || ch === '') {
        // Ctrl+C / Ctrl+D: restaurar terminal y salir sin enviar la contraseña.
        process.stdin.removeListener('data', onData);
        process.stdin.setRawMode(false);
        process.stdin.unref();
        process.stderr.write('\nCancelado.\n');
        process.exit(130);
      } else if (ch === '\r' || ch === '\n') {
        // Quitar el listener primero para evitar que un carácter buffereado
        // dispare onData de nuevo después de que se resuelva la promesa.
        process.stdin.removeListener('data', onData);
        process.stdin.setRawMode(false);
        process.stdin.unref();
        process.stderr.write('\n');
        resolve(pwd);
      } else if (ch === '' || ch === '\b') {
        // macOS envía 0x7F (DEL); algunos terminales envían 0x08.
        pwd = pwd.slice(0, -1);
      } else {
        pwd += ch;
      }
    };
    process.stdin.on('data', onData);
  });
}

// ── Ruta al certificado CA del Session Pooler ─────────────────────────────────
// El host aws-0-us-east-2.pooler.supabase.com usa una CA no incluida en el
// bundle de Node.js.  Descargar desde Dashboard → Project Settings → Database
// → "Download certificate" y guardar en supabase/certs/supabase-ca.crt.
const CA_PATH = path.join(__dirname, '..', 'supabase', 'certs', 'supabase-ca.crt');

// ── Crear cliente ─────────────────────────────────────────────────────────────
function crearCliente(id, password) {
  if (SIMULAR) return new ClienteSimulado(id);

  let caCert;
  try {
    caCert = fs.readFileSync(CA_PATH);
  } catch {
    throw new Error(
      `Certificado CA no encontrado: ${CA_PATH}\n` +
      'Descargarlo desde:\n' +
      '  Supabase Dashboard → Project Settings → Database → "Download certificate"\n' +
      '  URL: https://supabase.com/dashboard/project/pconfadsbtwjbjeblxgl/settings/database\n' +
      'Guardarlo como: supabase/certs/supabase-ca.crt'
    );
  }

  return new Client({
    host:                    HOST_ESPERADO,
    port:                    PORT_ESPERADO,
    user:                    USUARIO_ESPERADO,
    database:                'postgres',
    password,
    ssl: {
      rejectUnauthorized: true,
      ca:                 caCert.toString(),
    },
    connectionTimeoutMillis: TIMEOUT_CONEXION_MS,
  });
}

// ── Cliente simulado ──────────────────────────────────────────────────────────
const SIM_USER_ID    = '00000000-0000-0000-0001-s13c00000000';
const SIM_NEGOCIO_ID = '00000000-0000-0000-0002-s13c00000000';

class ClienteSimulado {
  constructor(id) {
    this._id  = id;
    this.host = HOST_ESPERADO;
    this.port = PORT_ESPERADO;
    this.user = USUARIO_ESPERADO;
    this._fallaConnect =
      (id === 'A' && SIM_FALLA_A) || (id === 'B' && SIM_FALLA_B);
  }

  async connect() {
    if (this._fallaConnect) {
      throw new Error(`[SIM] Fallo de conexión simulado (cliente ${this._id})`);
    }
    await _ms(30);
  }

  async query(sql, _params = []) {
    await _ms(10);
    return this._despachar(sql.trim());
  }

  async _despachar(s) {
    if (/^BEGIN$/i.test(s)) return _ok();

    if (/^ROLLBACK$/i.test(s)) {
      if (this._id === 'A' && sim.resolverCommitDeA) {
        sim.resolverCommitDeA();
        sim.resolverCommitDeA = null;
      }
      return _ok();
    }

    if (/^COMMIT$/i.test(s)) {
      if (this._id === 'A' && sim.resolverCommitDeA) {
        sim.resolverCommitDeA();
        sim.resolverCommitDeA = null;
      }
      return _ok();
    }

    if (/SET statement_timeout/i.test(s)) return _ok();
    if (/SET lock_timeout/i.test(s))       return _ok();
    if (/SET LOCAL ROLE/i.test(s))          return _ok();
    if (/set_config/i.test(s))              return _ok();

    if (/pg_backend_pid/i.test(s))
      return { rows: [{ pid: this._id === 'A' ? 2001 : 2002 }] };

    if (/pg_blocking_pids/i.test(s))
      return { rows: [{ bloqueado: sim.bEsperando }] };

    if (/INSERT INTO auth\.users/i.test(s))
      return { rows: [{ id: SIM_USER_ID }] };
    if (/INSERT INTO public\.negocios/i.test(s))
      return { rows: [{ id: SIM_NEGOCIO_ID }] };
    if (/INSERT INTO public\.cotizaciones/i.test(s)) return _ok();

    if (/SELECT estatus FROM/i.test(s))
      return { rows: [{ estatus: 'Aceptada' }] };

    if (/cleo_reabrir_cotizacion/i.test(s)) {
      if (this._id === 'A') return _ok();
      if (this._id === 'B') {
        sim.bEsperando = true;
        await sim.promesaCommitDeA;
        sim.bEsperando = false;
        const err = new Error(
          'cleo_reabrir_cotizacion: no encontrada, no pertenece a este negocio, ' +
          'o no está en estado Aceptada. (cleo_id: _t13c_cot)'
        );
        err.code = 'P0001';
        throw err;
      }
    }

    if (/versiones_aceptacion/i.test(s))
      return { rows: [{ estatus: 'Enviada', entradas: '1' }] };

    if (/DELETE FROM auth\.users/i.test(s))
      return { rows: [{ id: SIM_USER_ID }], rowCount: 1 };

    if (/SELECT count\(\*\)/i.test(s))
      return { rows: [{ restantes: '0' }] };

    return _ok();
  }

  async end() {}
}

function _ok()  { return { rows: [{}], rowCount: 1 }; }
function _ms(n) { return new Promise(r => setTimeout(r, n)); }

// ── Helpers ───────────────────────────────────────────────────────────────────
async function setJwt(client, userId) {
  await client.query(
    `SELECT set_config('request.jwt.claims',
       json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
    [userId]
  );
  await client.query('SET LOCAL ROLE authenticated');
}

async function esperarBloqueo(clienteA, pidA, pidB) {
  const limite = Date.now() + TIMEOUT_BLOQUEO_MS;
  while (Date.now() < limite) {
    const { rows } = await clienteA.query(
      'SELECT $1::int = ANY(pg_blocking_pids($2::int)) AS bloqueado',
      [pidA, pidB]
    );
    if (rows[0].bloqueado) return;
    await _ms(200);
  }
  throw new Error(
    `B (pid ${pidB}) no fue bloqueado por A (pid ${pidA}) ` +
    `en ${TIMEOUT_BLOQUEO_MS / 1000} s. Verificar que FOR UPDATE está activo.`
  );
}

// ── Test principal ────────────────────────────────────────────────────────────
async function main() {
  sim.bEsperando       = false;
  sim.promesaCommitDeA = new Promise(r => { sim.resolverCommitDeA = r; });

  const password = process.env.PGPASSWORD || await pedirPassword();

  console.log(
    SIMULAR
      ? '[SIMULACIÓN] Contraseña recibida. Iniciando conexión simulada…'
      : 'Contraseña recibida. Iniciando conexión…'
  );

  const A = crearCliente('A', password);
  const B = crearCliente('B', password);

  // ── Banderas de ciclo de vida ─────────────────────────────────────────────
  // Controlan qué operaciones de limpieza son válidas en finally.
  // query() y end() sobre un cliente nunca conectado quedan pendientes
  // indefinidamente en pg 8.x, tapando el error original.
  let aConectada     = false;
  let bConectada     = false;
  let aEnTransaccion = false;
  let bEnTransaccion = false;  // se activa dentro de la IIFE, tras BEGIN exitoso

  let userId    = null;
  let negocioId = null;
  let testPaso  = false;
  let cleanupOk = false;
  let errorB    = null;
  let promesaB  = Promise.resolve();

  try {
    await A.connect();
    aConectada = true;

    await B.connect();
    bConectada = true;

    await A.query(`SET statement_timeout = ${TIMEOUT_STATEMENT_MS}`);
    await B.query(`SET statement_timeout = ${TIMEOUT_STATEMENT_MS}`);

    // Validar host, puerto y usuario completo antes de tocar datos.
    // El host del pooler es compartido entre proyectos de la región; sin el
    // usuario (que incluye el ref del proyecto) no se puede distinguir el destino.
    if (
      A.host !== HOST_ESPERADO ||
      A.port !== PORT_ESPERADO ||
      A.user !== USUARIO_ESPERADO
    ) {
      throw new Error(
        'ABORTADO: la conexión no apunta a CLEO Pruebas.\n' +
        `  host    esperado: ${HOST_ESPERADO}  (actual: ${A.host})\n` +
        `  puerto  esperado: ${PORT_ESPERADO}  (actual: ${A.port})\n` +
        `  usuario esperado: ${USUARIO_ESPERADO}  (actual: ${A.user})\n` +
        'El ref del proyecto está en el usuario; el host del pooler es compartido.'
      );
    }
    console.log(`Conectado a ${A.host}  usuario: ${A.user}`);

    const pidA = (await A.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const pidB = (await B.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    console.log(`  PID A: ${pidA}  PID B: ${pidB}`);

    // El Session Pooler asigna un backend independiente por conexión.
    // PIDs iguales indicarían que el pooler reutilizó el mismo backend, lo que
    // haría inválida la prueba de concurrencia.
    if (pidA === pidB) {
      throw new Error(
        `ABORTADO: A y B tienen el mismo PID de backend (${pidA}). ` +
        'El pooler no está asignando sesiones independientes; ' +
        'la prueba de concurrencia no es válida en este estado.'
      );
    }

    // ── PASO 0: crear datos de prueba ────────────────────────────────────────
    console.log('\nPASO 0 — creando datos de prueba…');

    const r0 = await A.query(
      `INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
         VALUES (gen_random_uuid(), 'authenticated', 'authenticated',
                 $1, now(), now())
         RETURNING id`,
      [EMAIL_TEST]
    );
    userId = r0.rows[0].id;
    console.log('  auth.users    id:', userId);

    const r1 = await A.query(
      `INSERT INTO public.negocios (user_id, nombre)
         VALUES ($1, '_test13c_neg') RETURNING id`,
      [userId]
    );
    negocioId = r1.rows[0].id;
    console.log('  negocios      id:', negocioId);

    await A.query(
      `INSERT INTO public.cotizaciones
         (negocio_id, cleo_id, estatus, items_aceptacion, monto_aceptacion)
         VALUES ($1, $2, 'Aceptada',
                 '[{"nombre":"Servicio test","total":99}]'::jsonb, 99)`,
      [negocioId, CLEO_ID_COT]
    );
    const rv0 = await A.query(
      `SELECT estatus FROM public.cotizaciones
        WHERE negocio_id = $1 AND cleo_id = $2`,
      [negocioId, CLEO_ID_COT]
    );
    console.log('  cotizacion    estatus:', rv0.rows[0].estatus);
    assert.equal(rv0.rows[0].estatus, 'Aceptada',
      'Precondición fallida: estatus inicial no es Aceptada');

    // ── PASO 1: A — BEGIN + bloquear fila ────────────────────────────────────
    console.log('\nPASO 1 — A: BEGIN + cleo_reabrir (sin commit)…');
    await A.query('BEGIN');
    aEnTransaccion = true;
    await setJwt(A, userId);
    await A.query('SELECT public.cleo_reabrir_cotizacion($1)', [CLEO_ID_COT]);
    console.log('  A: función ejecutada, fila bloqueada con FOR UPDATE');

    // ── PASO 2: B — captura rechazo inmediatamente ───────────────────────────
    console.log('\nPASO 2 — B: BEGIN + cleo_reabrir (debe bloquearse)…');
    promesaB = (async () => {
      await B.query('BEGIN');
      bEnTransaccion = true;          // activo solo si BEGIN tuvo éxito
      await B.query(`SET lock_timeout = '${LOCK_TIMEOUT_B}'`);
      await setJwt(B, userId);
      return B.query('SELECT public.cleo_reabrir_cotizacion($1)', [CLEO_ID_COT]);
    })().catch(err => { errorB = err; });

    await esperarBloqueo(A, pidA, pidB);
    console.log(`  B (pid ${pidB}): bloqueada por A (pid ${pidA}) — confirmado`);

    // ── PASO 3: A — COMMIT ───────────────────────────────────────────────────
    console.log('\nPASO 3 — A: COMMIT…');
    await A.query('COMMIT');
    aEnTransaccion = false;
    console.log('  A: commit enviado — B se desbloquea');

    await promesaB;

    // ── Verificación ─────────────────────────────────────────────────────────
    console.log('\nVERIFICACIÓN…');
    const rv = await A.query(
      `SELECT estatus, jsonb_array_length(versiones_aceptacion) AS entradas
         FROM public.cotizaciones
        WHERE negocio_id = $1 AND cleo_id = $2`,
      [negocioId, CLEO_ID_COT]
    );
    const fila = rv.rows[0];
    console.log('  estatus  :', fila.estatus);
    console.log('  entradas :', fila.entradas);
    if (errorB) console.log('  error B  :', errorB.message.trim());

    assert.ok(errorB !== null,
      'FALLO: B debió recibir un error pero ejecutó sin problema ' +
      '(FOR UPDATE no bloqueó, o B llegó al SELECT después del COMMIT de A)');
    assert.match(errorB.message, /no encontrada|no pertenece|no está en estado/,
      `FALLO: error de B inesperado: "${errorB.message}"`);
    assert.equal(fila.estatus, 'Enviada',
      `FALLO: estatus esperado 'Enviada', obtenido '${fila.estatus}'`);
    assert.equal(String(fila.entradas), '1',
      `FALLO: versiones_aceptacion debe tener 1 entrada, tiene ${fila.entradas}`);

    testPaso = true;

  } finally {
    // ── Liberar transacciones ────────────────────────────────────────────────
    // Solo donde el cliente está conectado Y la transacción fue iniciada.
    // query()/end() sobre un cliente nunca conectado queda pendiente
    // indefinidamente en pg 8.x, impidiendo que el error original llegue al catch.

    if (aConectada && aEnTransaccion) {
      await A.query('ROLLBACK').catch(() => {});
      aEnTransaccion = false;
    }

    // Esperar que B termine tras el ROLLBACK/COMMIT de A (libera el lock).
    // promesaB siempre resuelve: el .catch inicial capturó cualquier rechazo.
    await promesaB;

    // bEnTransaccion se activa dentro de la IIFE; su valor es definitivo
    // solo después del await promesaB anterior.
    if (bConectada && bEnTransaccion) {
      await B.query('ROLLBACK').catch(() => {});
    }

    // ── PASO 4: limpieza ─────────────────────────────────────────────────────
    // Solo si A está conectada (necesaria para el DELETE) y hay datos que limpiar.
    // Tiempo máximo TIMEOUT_LIMPIEZA_MS: si el DELETE se bloquea, algo quedó mal.
    if (aConectada && userId) {
      console.log('\nPASO 4 — limpieza…');
      const limpiar = async () => {
        const rd = await A.query(
          `DELETE FROM auth.users WHERE id = $1 AND email = $2 RETURNING id`,
          [userId, EMAIL_TEST]
        );
        console.log('  eliminados:', rd.rowCount,
          'usuario(s) — cascada: negocios → cotizaciones');

        const rc = await A.query(
          `SELECT count(*) AS restantes FROM public.cotizaciones
            WHERE negocio_id = $1 AND cleo_id = $2`,
          [negocioId, CLEO_ID_COT]
        );
        const restantes = String(rc.rows[0].restantes);
        console.log('  cotizaciones restantes:', restantes);
        cleanupOk = restantes === '0';
        if (!cleanupOk) {
          throw new Error('Cascada incompleta: quedan cotizaciones después del DELETE.');
        }
      };

      const timeout = _ms(TIMEOUT_LIMPIEZA_MS).then(() => {
        throw new Error(
          `Timeout de limpieza (${TIMEOUT_LIMPIEZA_MS / 1000} s). ` +
          'Posible lock activo no liberado.'
        );
      });

      await Promise.race([limpiar(), timeout]).catch(cleanErr => {
        console.error('  error durante la limpieza:', cleanErr.message);
        console.error('  limpiar manualmente en SQL Editor de CLEO Pruebas:');
        console.error(`    DELETE FROM auth.users`);
        console.error(`      WHERE id = '${userId}'`);
        console.error(`        AND email = '${EMAIL_TEST}';`);
      });
    }

    // Cerrar solo los clientes que se conectaron efectivamente.
    if (aConectada) await A.end().catch(() => {});
    if (bConectada) await B.end().catch(() => {});
    console.log('Conexiones cerradas.');
  }

  if (!cleanupOk) {
    console.error('\nEl test pasó pero la limpieza falló. Ver instrucciones arriba.');
    process.exit(1);
  }
  console.log('\n✓ TEST 13-CONCURRENTE PASÓ — datos de prueba eliminados correctamente.');
}

main().catch(err => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});
