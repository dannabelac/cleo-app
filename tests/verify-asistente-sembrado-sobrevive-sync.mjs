// Verificación local desechable (NO toca CLEO Pruebas): el cliente
// SEMBRADO por una prueba (vía paginaLimpia) debe seguir existiendo tal
// cual después de que termine la carga inicial Y el primer ciclo de
// sincronización (push real al backend) -- no solo en el snapshot
// inmediato tras cargar la página. Se comprueba de 2 formas: (a) leyendo
// localStorage después de esperar varios ciclos de sync sin tocar nada, y
// (b) recargando la página para forzar una carga real desde el backend.
import { lanzarNavegador, paginaLimpia, clienteSeed, sufijoUnico, fail, ok } from './asistente-test-helpers.mjs';

(async () => {
  const browser = await lanzarNavegador();
  const nombre = 'Semilla Persistente ' + sufijoUnico();
  const page = await paginaLimpia(browser, { clientesSeed: [clienteSeed(9001, nombre, { notas: 'dato de prueba que no debe perderse' })] });

  // No se hace NADA más -- solo se espera a que termine la carga inicial y
  // pasen varios ciclos de sync (5s cada uno) sin ninguna interacción.
  await page.waitForTimeout(16000);

  const clientesTrasEspera = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
  const sembradoTrasEspera = clientesTrasEspera.find(c => c.nombre === nombre);
  if (!sembradoTrasEspera) fail('el cliente sembrado desapareció después de esperar varios ciclos de sync (sin tocar nada)');
  else if (sembradoTrasEspera.notas !== 'dato de prueba que no debe perderse') fail('el cliente sembrado perdió/cambió sus datos tras los ciclos de sync: notas="' + sembradoTrasEspera.notas + '"');
  else ok('el cliente sembrado sigue intacto después de varios ciclos de sync sin ninguna interacción');
  const duplicados = clientesTrasEspera.filter(c => c.nombre === nombre).length;
  if (duplicados !== 1) fail('el cliente sembrado se duplicó tras los ciclos de sync: ' + duplicados + ' copias');
  else ok('no se duplicó tras los ciclos de sync (exactamente 1 copia)');

  // Recargar fuerza una carga REAL desde el backend (no el snapshot que
  // addInitScript puso antes de la primera carga) -- si el sembrado
  // realmente se sincronizó, debe seguir ahí.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const clientesTrasRecargar = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
  const sembradoTrasRecargar = clientesTrasRecargar.find(c => c.nombre === nombre);
  if (!sembradoTrasRecargar) fail('el cliente sembrado NO persistió en el backend real (desapareció tras recargar)');
  else if (sembradoTrasRecargar.notas !== 'dato de prueba que no debe perderse') fail('tras recargar, los datos del sembrado cambiaron: notas="' + sembradoTrasRecargar.notas + '"');
  else ok('el cliente sembrado persistió correctamente en el backend real (sigue ahí tras recargar)');
  const duplicadosTrasRecargar = clientesTrasRecargar.filter(c => c.nombre === nombre).length;
  if (duplicadosTrasRecargar !== 1) fail('el cliente sembrado se duplicó tras recargar: ' + duplicadosTrasRecargar + ' copias');
  else ok('no se duplicó tras recargar (exactamente 1 copia)');

  await page.close();
  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== HUBO FALLOS ===' : '\n=== TODOS LOS CHEQUEOS PASARON ===');
})();
