// Verificación local desechable (NO toca CLEO Pruebas): nueva acción
// "crear_oportunidad" (Productos, "alguien preguntó") -- caso real: "Ana me
// preguntó hoy por un pastel de fresa. Recuérdame mañana preguntarle si lo
// quiere o no." Oportunidad sola (cliente nuevo) y oportunidad +
// recordatorio (cliente existente), visibilidad en Hoy/Seguimiento, y
// persistencia sin duplicados tras recargar.
//
// Cada caso siembra su propio negocio desde cero (ver paginaLimpia) y usa
// nombres únicos por corrida -- ninguno depende de que exista (o no exista)
// un cliente dejado por otra prueba o por una corrida anterior.
import { lanzarNavegador, paginaLimpia, abrirChat, clienteSeed, sufijoUnico, N8N_URL_PATTERN, fail, ok } from './asistente-test-helpers.mjs';

function hoyISO() { return new Date().toISOString().slice(0, 10); }

(async () => {
  const browser = await lanzarNavegador();

  console.log('\n--- CASO A: solo oportunidad, cliente NUEVO (sin candidatos), sin cantidad ni precio ---');
  {
    const ana = 'Ana ' + sufijoUnico();
    const page = await paginaLimpia(browser);
    await abrirChat(page);

    await page.route(N8N_URL_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        estado: 'completo', cliente: ana, acciones: ['crear_oportunidad'],
        oportunidad: { producto: 'pastel de fresa' },
      }),
    }));
    await page.locator('textarea').first().fill(ana + ' me preguntó hoy por un pastel de fresa.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForTimeout(1200);

    const clienteNuevoTxt = (await page.getByText(ana, { exact: false }).count()) && (await page.getByText('Nuevo', { exact: true }).count());
    const seCrearaTxt = await page.getByText('Se creará al guardar la oportunidad.', { exact: false }).count();
    const interesTxt = await page.getByText('pastel de fresa', { exact: false }).count();
    const botonTxt = await page.getByText('Guardar oportunidad', { exact: true }).count();
    if (clienteNuevoTxt === 0) fail('no se preparó "cliente nuevo" por defecto para ' + ana);
    else ok('sin coincidencias, se preparó "cliente nuevo" por defecto');
    if (seCrearaTxt === 0) fail('no dice "Se creará al guardar la oportunidad." (dijo otra cosa, ej. "el recordatorio")');
    else ok('dice correctamente "Se creará al guardar la oportunidad."');
    if (interesTxt === 0) fail('no se muestra "pastel de fresa" como producto de interés');
    else ok('se muestra "pastel de fresa" como producto de interés, sin pedir cantidad ni precio');
    if (botonTxt === 0) fail('el botón no dice "Guardar oportunidad"');
    else ok('el botón dice "Guardar oportunidad"');

    const bloqueado = await page.getByText('Guardar oportunidad', { exact: true }).isDisabled();
    if (bloqueado) fail('"Guardar oportunidad" está bloqueado aunque no se exigía cantidad ni precio');
    else ok('"Guardar oportunidad" está habilitado sin cantidad ni precio (no son obligatorios)');

    await page.getByText('Guardar oportunidad', { exact: true }).click();
    await page.waitForTimeout(1000);

    const clientes = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
    const pedidos = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_pedidos') || '[]'));
    const anaCliente = clientes.find(c => c.nombre === ana);
    if (!anaCliente) fail(ana + ' no se creó');
    else if (anaCliente.estadoProspecto === 'Convertido' || anaCliente.etapa === 'Ganado') fail(ana + ' quedó marcada como Convertido/Ganado (no debería, solo fue una consulta)');
    else if (anaCliente.estadoProspecto !== 'Nueva') fail('estadoProspecto incorrecto: ' + anaCliente.estadoProspecto);
    else if (anaCliente.productoInteres !== 'pastel de fresa') fail('productoInteres incorrecto: ' + anaCliente.productoInteres);
    else ok(ana + ' se creó con estadoProspecto="Nueva" y productoInteres="pastel de fresa", sin convertir');
    if (pedidos.some(p => p.clienteId === anaCliente?.id)) fail('se creó un pedido (no debería -- solo fue una consulta)');
    else ok('no se creó ningún pedido ni pago');

    const verOpoBtn = page.getByText('Ver oportunidad', { exact: true });
    if (await verOpoBtn.count() === 0) fail('no apareció el enlace "Ver oportunidad"');
    else ok('apareció el enlace "Ver oportunidad" tras guardar');

    await page.close();
  }

  console.log('\n--- CASO B: oportunidad + recordatorio, cliente EXISTENTE (sembrado por esta prueba) ---');
  {
    const maria = 'María López ' + sufijoUnico();
    const page = await paginaLimpia(browser, { clientesSeed: [clienteSeed(6001, maria)] });
    await abrirChat(page);

    const hoy = hoyISO();
    await page.route(N8N_URL_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        estado: 'completo', cliente: maria, acciones: ['crear_oportunidad', 'crear_recordatorio'],
        oportunidad: { producto: 'pastel de chocolate', cantidad: 1 },
        recordatorio: { texto: 'Preguntarle a ' + maria + ' si quiere el pastel de chocolate', fecha: hoy },
      }),
    }));
    await page.locator('textarea').first().fill(maria + ' me preguntó por un pastel de chocolate. Recuérdame hoy preguntarle si lo quiere.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForTimeout(1200);

    const candidato = page.getByText('¿Es ' + maria + '?', { exact: false });
    if (await candidato.count() === 0) fail('no se sugirió a ' + maria + ' como coincidencia (la clienta sembrada no se encontró)');
    else {
      await candidato.click();
      ok('se exige elegir entre las coincidencias (la clienta sembrada existe)');
    }

    await page.getByText('Guardar oportunidad', { exact: true }).click();
    await page.waitForTimeout(1000);

    const clientes2 = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
    const mariaCliente = clientes2.find(c => c.nombre === maria);
    const mariasCount = clientes2.filter(c => c.nombre === maria).length;
    if (mariasCount !== 1) fail(maria + ' quedó duplicada: ' + mariasCount);
    else ok('no se duplicó (cliente existente reutilizado)');
    if (!mariaCliente) fail(maria + ' desapareció');
    else if (mariaCliente.estadoProspecto !== 'Nueva') fail('estadoProspecto no es "Nueva": ' + mariaCliente.estadoProspecto);
    else if (mariaCliente.productoInteres !== 'pastel de chocolate') fail('productoInteres incorrecto: ' + mariaCliente.productoInteres);
    else ok('quedó con estadoProspecto="Nueva" y productoInteres="pastel de chocolate" (oportunidad nueva reemplaza el interés anterior, igual que el flujo manual)');
    const recordatorioGuardado = (mariaCliente?.recordatorios || []).find(r => r.nota === 'Preguntarle a ' + maria + ' si quiere el pastel de chocolate');
    if (!recordatorioGuardado) fail('el recordatorio no quedó guardado');
    else if (recordatorioGuardado.categoria !== 'manual') fail('el recordatorio no quedó como categoria="manual"');
    else ok('recordatorio manual guardado correctamente, vinculado a la clienta');

    // ── Visibilidad en Hoy (recordatorio con fecha de HOY) ──
    await page.getByRole('button', { name: 'Cerrar' }).click();
    await page.waitForTimeout(300);
    const verEnHoy = page.getByText('Ver Hoy', { exact: false });
    if (await verEnHoy.count() > 0) {
      await verEnHoy.click();
      await page.waitForTimeout(500);
    }
    const apareceEnHoy = await page.getByText('Preguntarle a ' + maria + ' si quiere el pastel de chocolate', { exact: false }).count();
    if (apareceEnHoy === 0) fail('el recordatorio de hoy NO aparece en la vista de Hoy');
    else ok('el recordatorio (fecha de hoy) aparece en la vista de Hoy');

    await page.close();
  }

  console.log('\n--- Persistencia tras recargar, sin duplicados ---');
  {
    const olga = 'Olga ' + sufijoUnico();
    const page = await paginaLimpia(browser);
    await abrirChat(page);
    await page.route(N8N_URL_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        estado: 'completo', cliente: olga, acciones: ['crear_oportunidad', 'crear_recordatorio'],
        oportunidad: { producto: 'pastel de limón' },
        recordatorio: { texto: 'Preguntarle a ' + olga + ' si quiere el pastel de limón', fecha: hoyISO() },
      }),
    }));
    await page.locator('textarea').first().fill(olga + ' preguntó por un pastel de limón. Recuérdame hoy preguntarle.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForTimeout(1200);
    await page.getByText('Guardar oportunidad', { exact: true }).click();
    await page.waitForTimeout(6000); // ciclo de cloudSync (5s)

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const clientesFinal = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
    const olgaCount = clientesFinal.filter(c => c.nombre === olga).length;
    const olgaCliente = clientesFinal.find(c => c.nombre === olga);
    if (olgaCount !== 1) fail(olga + ' quedó duplicada tras recargar: ' + olgaCount);
    else ok('no se duplicó tras recargar');
    if (!olgaCliente) fail(olga + ' no persistió tras recargar');
    else if (olgaCliente.productoInteres !== 'pastel de limón') fail('productoInteres no persistió correctamente: ' + olgaCliente.productoInteres);
    else if (!(olgaCliente.recordatorios || []).some(r => r.nota === 'Preguntarle a ' + olga + ' si quiere el pastel de limón')) fail('el recordatorio no persistió');
    else ok('oportunidad + recordatorio persisten correctamente tras recargar, sin duplicados');

    await page.close();
  }

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== HUBO FALLOS ===' : '\n=== TODOS LOS CHEQUEOS PASARON ===');
})();
