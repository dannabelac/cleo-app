// Corre toda la suite de pruebas del Asistente (tests/verify-asistente-*.mjs)
// -- NO toca CLEO Pruebas ni producción, solo el entorno local desechable
// (ver tests/sim/README.md para levantar el backend simulado y Vite antes
// de correr esto).
//
// POR QUÉ SECUENCIAL, SIEMPRE (nunca Promise.all ni `&` en paralelo):
// todas las pruebas de esta carpeta inician sesión con la MISMA cuenta de
// prueba falsa (mismo user_id fijo, ver FAKE_SESSION en
// asistente-test-helpers.mjs) contra el mismo backend simulado compartido.
// Se comprobó (ver tests/verify-paralelo-no-interfiere.mjs) que correr dos
// de estas pruebas al mismo tiempo puede hacer que sus sincronizaciones
// choquen y disparen el modal REAL de CLEO "Encontramos dos versiones de
// tus datos" -- el mecanismo de conflicto multi-dispositivo, pensado para
// uso real, no para 2 procesos de prueba usando la misma cuenta a la vez.
// No es corrupción de datos ni un bug de la app -- es CLEO funcionando
// como se diseñó, pero las pruebas no están preparadas para manejar ese
// modal, así que el clic que sigue se bloquea y la prueba falla.
// Aislar esto de raíz exigiría una cuenta de prueba (user_id) distinta por
// archivo -- fuera de alcance aquí; mientras tanto, la única forma segura
// de correr la suite completa es una prueba a la vez.
//
// Este runner existe para que "correr la suite" sea siempre este único
// comando (`node tests/run-asistente-suite.mjs`, o `npm run test:asistente`)
// y nadie lo reemplace sin querer por un `for ... & wait` o un
// `Promise.all` que sí paralelice.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const archivos = readdirSync(__dirname)
  .filter((f) => /^verify-asistente-.*\.mjs$/.test(f))
  .sort();

function correrUno(archivo) {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const proc = spawn('node', [path.join(__dirname, archivo)], { stdio: 'inherit' });
    proc.on('close', (code) => resolve({ archivo, code, segundos: ((Date.now() - inicio) / 1000).toFixed(1) }));
  });
}

(async () => {
  console.log('Suite del Asistente -- ' + archivos.length + ' archivo(s), EN SECUENCIA (nunca en paralelo, ver comentario arriba):\n  ' + archivos.join('\n  ') + '\n');

  const resultados = [];
  for (const archivo of archivos) {
    console.log('\n################ ' + archivo + ' ################');
    // await DENTRO del for -- cada archivo termina por completo (incluye su
    // propio push/sync final) antes de que arranque el siguiente.
    const r = await correrUno(archivo);
    resultados.push(r);
  }

  console.log('\n\n========== RESUMEN ==========');
  let huboFallos = false;
  for (const r of resultados) {
    const estado = r.code === 0 ? 'OK' : 'FALLÓ';
    if (r.code !== 0) huboFallos = true;
    console.log('  [' + estado + ']  ' + r.archivo + '  (' + r.segundos + 's)');
  }
  console.log(huboFallos ? '\n=== HUBO FALLOS EN LA SUITE ===' : '\n=== TODA LA SUITE PASÓ ===');
  process.exitCode = huboFallos ? 1 : 0;
})();
