// Verificación local desechable (NO toca CLEO Pruebas): un mensaje vago
// ("Registra una venta de termos a María") se completa CONVERSANDO con
// CLEO -- cada pregunta sucesiva (vía estado:"pregunta") se contesta sin
// repetir el mensaje original, hasta que n8n devuelve estado:"completo" y
// aparece la tarjeta de revisión ya con todo. También verifica que un error
// de conexión conserva el texto escrito.
import { lanzarNavegador, paginaLimpia, clienteSeed, sufijoUnico, FAKE_SESSION, URL, N8N_URL_PATTERN, fail, ok } from './asistente-test-helpers.mjs';

async function enviar(page, texto) {
  await page.locator('textarea').first().fill(texto);
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await lanzarNavegador();

  console.log('\n--- Completar un mensaje vago conversando (varios turnos) ---');
  {
    // La clienta existente la crea esta MISMA prueba (contexto de preparación
    // con sembrado local + espera de un ciclo real de cloudSync para que
    // quede escrita en el backend), con un nombre único por corrida. El
    // contexto de la prueba en sí abre DESPUÉS, sin ningún sembrado local,
    // para seguir ejercitando la carga real desde el backend (pullUserData)
    // -- pero ahora sin depender de que alguien la haya sembrado a mano.
    const nombreCompleto = 'María López ' + sufijoUnico();
    {
      const setupPage = await paginaLimpia(browser, { clientesSeed: [clienteSeed(8001, nombreCompleto)] });
      await setupPage.waitForTimeout(6000); // ciclo de cloudSync (5s) -- empuja el sembrado al backend real
      await setupPage.close();
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript((session) => { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session)); }, FAKE_SESSION);
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Hablar con CLEO' }).click();

    var historiales = [];
    await page.route(N8N_URL_PATTERN, async route => {
      var body = route.request().postDataJSON();
      historiales.push(body);
      var turno = historiales.length;
      if (turno === 1) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ estado: 'pregunta', pregunta: '¿Cuántos termos vendiste?' }) });
      } else if (turno === 2) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ estado: 'pregunta', pregunta: '¿A qué precio cada uno?' }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          estado: 'completo', cliente: 'María', acciones: ['registrar_venta'],
          venta: { producto: 'termos', cantidad: 20, precio_unitario: 150, moneda: 'MXN', total: 3000, estado_pago: 'pagado', metodo_pago: 'efectivo' },
        }) });
      }
    });

    // Turno 1: mensaje vago.
    await enviar(page, 'Registra una venta de termos a María.');
    const pregunta1 = await page.locator('text=¿Cuántos termos vendiste?').count();
    if (pregunta1 === 0) fail('CLEO no preguntó la cantidad en el chat'); else ok('CLEO preguntó "¿Cuántos termos vendiste?" en el chat (turno 1)');
    const revisionVisibleAun = await page.getByText('Guardar pedido', { exact: true }).count();
    if (revisionVisibleAun > 0) fail('apareció la tarjeta de revisión antes de tener todos los datos');
    else ok('no aparece la revisión todavía, sigue en modo conversación');

    // Turno 2: responde la cantidad, SIN repetir el mensaje original.
    await enviar(page, '20');
    const pregunta2 = await page.locator('text=¿A qué precio cada uno?').count();
    if (pregunta2 === 0) fail('CLEO no preguntó el precio en el chat'); else ok('CLEO preguntó "¿A qué precio cada uno?" en el chat (turno 2)');
    // El 2º turno debe haber mandado el historial con el turno 1 incluido.
    if (!historiales[1] || !historiales[1].historial || !historiales[1].historial.some(m => m.texto.includes('termos a María'))) {
      fail('el turno 2 no mandó el historial previo (el mensaje original se habría perdido)');
    } else ok('el turno 2 incluyó el mensaje original en el historial enviado a n8n');

    // Turno 3: responde el precio -- ya debe completarse.
    await enviar(page, '150');
    const tarjeta = await page.getByText('Guardar pedido', { exact: true }).count();
    if (tarjeta === 0) fail('no apareció la tarjeta de revisión tras completar los datos conversando');
    else ok('tras completar los 3 turnos, aparece la tarjeta de revisión');
    if (!historiales[2] || !historiales[2].historial.some(m => m.texto === '20')) fail('el turno 3 no conservó la respuesta del turno 2 en el historial');
    else ok('el historial se acumuló correctamente en los 3 turnos');

    const totalOk = await page.getByText(/\$3,000|\$3000/).count();
    if (totalOk === 0) fail('el total no llegó correcto desde la conversación ($3,000)');
    else ok('los datos completados por chat llegaron correctos a la revisión (20 x $150 = $3,000)');

    const candidato = page.getByText('¿Es ' + nombreCompleto + '?', { exact: false });
    if (await candidato.count() === 0) fail('no se sugirió a ' + nombreCompleto + ' como coincidencia de "María" (pullUserData no trajo la clienta sembrada por esta misma prueba)');
    else {
      const clientesAntes = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
      await candidato.click();
      await page.getByText('Guardar pedido', { exact: true }).click();
      await page.waitForTimeout(1000);
      const clientesDespues = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
      const pedidos = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_pedidos') || '[]'));
      if (clientesDespues.length !== clientesAntes.length) fail('se duplicó a la clienta en vez de usar la existente');
      else ok('no se duplicó a la clienta');
      const pedido = pedidos.find(p => p.productos === 'termos');
      if (!pedido || pedido.total !== 3000) fail('el pedido de termos no quedó guardado correctamente');
      else ok('pedido guardado correctamente con total $3,000, conversación completa de punta a punta');
    }
    await page.close();
  }

  console.log('\n--- Error de conexión conserva el texto escrito ---');
  {
    const page = await paginaLimpia(browser);
    await page.getByRole('button', { name: 'Hablar con CLEO' }).click();
    await page.route(N8N_URL_PATTERN, route => route.abort('failed'));
    await enviar(page, 'Vendí termos a Laura.');
    const errorMsg = await page.locator('text=No se pudo conectar').count();
    if (errorMsg === 0) fail('no se mostró el aviso de error de conexión en el chat');
    else ok('se mostró el aviso de error de conexión en el chat');
    const textoRestaurado = await page.locator('textarea').first().inputValue();
    if (textoRestaurado !== 'Vendí termos a Laura.') fail('el texto NO se restauró en el campo tras el error: "' + textoRestaurado + '"');
    else ok('el texto se conservó en el campo, listo para reintentar sin volver a escribirlo');
    await page.close();
  }

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== HUBO FALLOS ===' : '\n=== TODOS LOS CHEQUEOS PASARON ===');
})();
