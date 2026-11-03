// NO es una prueba de comportamiento del Asistente -- es un diagnóstico que
// corre 2 archivos de la suite AL MISMO TIEMPO (mismo backend compartido,
// misma cuenta de prueba) para comprobar si pueden ejecutarse en paralelo
// sin interferirse entre sí. No toca CLEO Pruebas ni modifica la lógica del
// asistente; solo lanza procesos hijos y reporta sus resultados.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function correr(archivo) {
  return new Promise((resolve) => {
    const proc = spawn('node', [path.join(__dirname, archivo)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { out += d.toString(); });
    proc.on('close', (code) => resolve({ archivo, code, out }));
  });
}

(async () => {
  const archivos = [
    'verify-asistente-separar-operaciones.mjs',
    'verify-asistente-oportunidad.mjs',
    'verify-asistente-conflicto-oportunidad.mjs',
  ];
  console.log('Lanzando en paralelo: ' + archivos.join(', '));
  const inicio = Date.now();
  const resultados = await Promise.all(archivos.map(correr));
  const duracionS = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log('\nTerminaron todos en ' + duracionS + 's (en paralelo real, no uno tras otro).\n');

  let hayFallos = false;
  for (const r of resultados) {
    const oks = (r.out.match(/✅/g) || []).length;
    const fallos = (r.out.match(/❌/g) || []).length;
    const terminoBien = r.code === 0 && fallos === 0;
    console.log('--- ' + r.archivo + ' --- código de salida: ' + r.code + ' | ✅ ' + oks + ' | ❌ ' + fallos + (terminoBien ? ' -> OK' : ' -> CON PROBLEMAS'));
    if (!terminoBien) {
      hayFallos = true;
      console.log(r.out.split('\n').filter(l => l.includes('❌') || l.includes('Error') || l.includes('FALLÓ')).join('\n'));
    }
  }

  console.log(hayFallos
    ? '\n=== AL CORRER EN PARALELO, SÍ HUBO INTERFERENCIA (alguno falló que en solitario no falla) ==='
    : '\n=== CORRIENDO EN PARALELO, LOS 3 ARCHIVOS PASARON SIN INTERFERENCIA ===');
  process.exitCode = hayFallos ? 1 : 0;
})();
