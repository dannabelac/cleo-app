// Verificación local desechable (NO toca CLEO Pruebas): caso real encontrado
// con n8n -- Ana ya tiene una oportunidad activa (pastel de fresa) y llega
// una segunda "crear_oportunidad" con un producto DISTINTO (pastel de
// chocolate). Antes del fix, el interés de fresa se sustituía en silencio.
// Ahora CLEO debe detectar el conflicto ANTES de guardar nada (ni la
// oportunidad ni el recordatorio del mismo turno), mostrar ambos intereses,
// y exigir elegir explícitamente Agregar / Reemplazar / Cancelar.
//
// Cada escenario arranca con un negocio vacío propio (ver paginaLimpia) y un
// nombre único POR INVOCACIÓN (sufijoUnico, no un sufijo fijo) -- así
// reejecutar este mismo archivo varias veces seguidas nunca choca con la
// clienta que una corrida anterior haya dejado en el backend compartido.
import { lanzarNavegador, paginaLimpia, sufijoUnico, N8N_URL_PATTERN, fail, ok } from './asistente-test-helpers.mjs';

async function abrirYSembrarPrimeraOportunidad(browser, nombre) {
  const page = await paginaLimpia(browser);
  await page.getByRole('button', { name: 'Hablar con CLEO' }).click();

  // Turno 1: oportunidad de fresa + recordatorio A, cliente nuevo.
  await page.route(N8N_URL_PATTERN, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      estado: 'completo', cliente: nombre, acciones: ['crear_oportunidad', 'crear_recordatorio'],
      oportunidad: { producto: 'pastel de fresa' },
      recordatorio: { texto: 'Preguntarle a ' + nombre + ' si quiere el pastel de fresa', fecha: '2026-11-03' },
    }),
  }));
  await page.locator('textarea').first().fill(nombre + ' me preguntó hoy por un pastel de fresa. Recuérdame mañana preguntarle si lo quiere o no.');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.waitForTimeout(1200);
  await page.getByText('Guardar oportunidad', { exact: true }).click();
  await page.waitForTimeout(1000);

  const clientes = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
  const cliente = clientes.find(c => c.nombre === nombre);
  if (!cliente || cliente.productoInteres !== 'pastel de fresa') { fail('no se preparó correctamente el escenario base (' + nombre + ' + pastel de fresa)'); return null; }
  return { page, clienteId: cliente.id };
}

async function segundoTurnoChocolate(page, nombre) {
  await page.route(N8N_URL_PATTERN, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      estado: 'completo', cliente: nombre, acciones: ['crear_oportunidad', 'crear_recordatorio'],
      oportunidad: { producto: 'pastel de chocolate' },
      recordatorio: { texto: 'Enviarle las opciones de chocolate a ' + nombre, fecha: '2026-11-03' },
    }),
  }));
  await page.locator('textarea').first().fill(nombre + ' también me preguntó por un pastel de chocolate. Recuérdame mañana enviarle las opciones.');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.waitForTimeout(1200);
  await page.getByText('Guardar oportunidad', { exact: true }).click();
  await page.waitForTimeout(1000);
}

(async () => {
  const browser = await lanzarNavegador();

  console.log('\n--- CASO 1: el conflicto se detecta, nada se guarda hasta decidir ---');
  {
    const nombre = 'Ana ' + sufijoUnico();
    const seed = await abrirYSembrarPrimeraOportunidad(browser, nombre);
    if (seed) {
      const { page } = seed;
      await segundoTurnoChocolate(page, nombre);

      const tituloConflicto = await page.getByText('ya tiene un interés distinto', { exact: false }).count();
      const muestraActual = await page.getByText('pastel de fresa', { exact: false }).count();
      const muestraNuevo = await page.getByText('pastel de chocolate', { exact: false }).count();
      const botonAgregar = await page.getByText('Agregar a la oportunidad', { exact: true }).count();
      const botonReemplazar = await page.getByText('Reemplazar interés', { exact: true }).count();
      if (tituloConflicto === 0) fail('no apareció el aviso de conflicto de interés distinto');
      else ok('se detectó el conflicto (Ana ya tenía un interés distinto)');
      if (muestraActual === 0) fail('no se muestra el interés ACTUAL (pastel de fresa)');
      else ok('se muestra el interés actual (pastel de fresa)');
      if (muestraNuevo === 0) fail('no se muestra el interés NUEVO propuesto (pastel de chocolate)');
      else ok('se muestra el interés nuevo propuesto (pastel de chocolate)');
      if (botonAgregar === 0) fail('no apareció el botón "Agregar a la oportunidad"');
      else ok('apareció el botón "Agregar a la oportunidad"');
      if (botonReemplazar === 0) fail('no apareció el botón "Reemplazar interés"');
      else ok('apareció el botón "Reemplazar interés"');

      const clientesTrasConflicto = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
      const anaTrasConflicto = clientesTrasConflicto.find(c => c.nombre === nombre);
      if (anaTrasConflicto.productoInteres !== 'pastel de fresa') fail('el interés de Ana cambió ANTES de resolver el conflicto (no debería)');
      else ok('mientras el conflicto está abierto, el interés anterior sigue intacto (fresa)');
      if ((anaTrasConflicto.recordatorios || []).some(r => r.nota.indexOf('opciones de chocolate') !== -1)) {
        fail('el recordatorio del turno de chocolate se guardó ANTES de resolver el conflicto (no debería)');
      } else ok('el recordatorio del turno de chocolate no se guardó mientras el conflicto está abierto');

      await page.close();
    }
  }

  console.log('\n--- CASO 2: Cancelar -- cero cambios, la oportunidad anterior queda intacta ---');
  {
    const nombre = 'Ana ' + sufijoUnico();
    const seed = await abrirYSembrarPrimeraOportunidad(browser, nombre);
    if (seed) {
      const { page } = seed;
      await segundoTurnoChocolate(page, nombre);
      await page.getByText('Cancelar', { exact: true }).click();
      await page.waitForTimeout(800);

      const clientes = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
      const ana = clientes.find(c => c.nombre === nombre);
      if (!ana) fail('Ana desapareció tras cancelar');
      else if (ana.productoInteres !== 'pastel de fresa') fail('tras Cancelar, el interés de Ana cambió: ' + ana.productoInteres);
      else ok('tras Cancelar, el interés de Ana sigue siendo "pastel de fresa" (sin cambios)');
      const recordatorios = ana ? (ana.recordatorios || []) : [];
      if (recordatorios.length !== 1) fail('tras Cancelar, el número de recordatorios cambió: ' + recordatorios.length + ' (debía seguir siendo 1)');
      else ok('tras Cancelar, sigue habiendo exactamente 1 recordatorio (no se agregó el de chocolate)');
      const conflictoSigueAbierto = await page.getByText('ya tiene un interés distinto', { exact: false }).count();
      if (conflictoSigueAbierto > 0) fail('el aviso de conflicto sigue visible después de Cancelar');
      else ok('el panel de conflicto se cerró correctamente tras Cancelar');

      await page.close();
    }
  }

  console.log('\n--- CASO 3: Agregar a la oportunidad -- combina ambos productos, conserva los 2 recordatorios ---');
  {
    const nombre = 'Ana ' + sufijoUnico();
    const seed = await abrirYSembrarPrimeraOportunidad(browser, nombre);
    if (seed) {
      const { page } = seed;
      await segundoTurnoChocolate(page, nombre);
      await page.getByText('Agregar a la oportunidad', { exact: true }).click();
      await page.waitForTimeout(1000);

      const clientes = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
      const ana = clientes.find(c => c.nombre === nombre);
      if (!ana) fail('Ana desapareció tras Agregar');
      else {
        const items = ana.items || [];
        const tieneFresa = items.some(i => (i.nombre || '').toLowerCase().indexOf('fresa') !== -1);
        const tieneChocolate = items.some(i => (i.nombre || '').toLowerCase().indexOf('chocolate') !== -1);
        if (!tieneFresa || !tieneChocolate) fail('tras Agregar, los items de Ana no incluyen ambos productos: ' + JSON.stringify(items.map(i => i.nombre)));
        else ok('tras Agregar, Ana tiene ambos productos combinados en su oportunidad (fresa y chocolate)');
        if (items.length !== 2) fail('tras Agregar, se duplicó algún renglón: ' + items.length + ' items (debían ser 2)');
        else ok('no se duplicó ningún renglón al combinar (2 items exactos)');
      }
      const recordatorios = ana ? (ana.recordatorios || []) : [];
      if (recordatorios.length !== 2) fail('tras Agregar, el número de recordatorios es ' + recordatorios.length + ' (debían ser 2: fresa y chocolate)');
      else ok('tras Agregar, se conservan AMBOS recordatorios (el de fresa y el nuevo de chocolate)');

      await page.close();
    }
  }

  console.log('\n--- CASO 4: Reemplazar interés -- sustituye el interés, conserva los 2 recordatorios ---');
  {
    const nombre = 'Ana ' + sufijoUnico();
    const seed = await abrirYSembrarPrimeraOportunidad(browser, nombre);
    if (seed) {
      const { page } = seed;
      await segundoTurnoChocolate(page, nombre);
      await page.getByText('Reemplazar interés', { exact: true }).click();
      await page.waitForTimeout(1000);

      const clientes = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
      const ana = clientes.find(c => c.nombre === nombre);
      if (!ana) fail('Ana desapareció tras Reemplazar');
      else if (ana.productoInteres !== 'pastel de chocolate') fail('tras Reemplazar, productoInteres no es "pastel de chocolate": ' + ana.productoInteres);
      else ok('tras Reemplazar, el interés de Ana es ahora "pastel de chocolate" (confirmado explícitamente)');
      const recordatorios = ana ? (ana.recordatorios || []) : [];
      if (recordatorios.length !== 2) fail('tras Reemplazar, el número de recordatorios es ' + recordatorios.length + ' (debían seguir siendo 2 -- un reemplazo de interés nunca debe borrar recordatorios)');
      else ok('tras Reemplazar, se conservan AMBOS recordatorios (reemplazar el interés no afecta los recordatorios)');

      await page.close();
    }
  }

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== HUBO FALLOS ===' : '\n=== TODOS LOS CHEQUEOS PASARON ===');
})();
