// Verificación local desechable (NO toca CLEO Pruebas): tras guardar, la
// operación se cierra SOLA (sin botón "Registrar algo más") y el chat sigue
// de forma natural. Mientras haya un borrador SIN guardar: una corrección
// del MISMO cliente completa esa misma operación (nunca se pierde lo ya
// escrito); un mensaje de un cliente DISTINTO no se asume -- se pregunta
// antes de tocar el borrador abierto.
// Cada escenario arranca con un negocio vacío propio (ver paginaLimpia) y
// nombres únicos POR INVOCACIÓN (sufijoUnico) -- nunca dependen de lo que
// haya quedado en el backend compartido de otra prueba o de una corrida
// anterior de esta misma.
import { lanzarNavegador, paginaLimpia, sufijoUnico, N8N_URL_PATTERN, fail, ok } from './asistente-test-helpers.mjs';

async function nuevaPagina(browser, viewport) {
  const page = await paginaLimpia(browser, { viewport });
  await page.getByRole('button', { name: 'Hablar con CLEO' }).click();
  return page;
}

(async () => {
  const browser = await lanzarNavegador();

  console.log('\n--- CASO 1: guardar pedido de Lucía -> escribir directo un recordatorio para Pedro, sin botones ---');
  {
    const lucia = 'Lucía ' + sufijoUnico();
    const pedro = 'Pedro ' + sufijoUnico();
    const page = await nuevaPagina(browser);

    await page.route(N8N_URL_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        estado: 'completo', cliente: lucia, acciones: ['registrar_venta'],
        venta: { items: [{ producto: 'termos', cantidad: 5, precio_unitario: 100 }], total: 500, estado_pago: 'pagado', metodo_pago: 'efectivo' },
      }),
    }));
    await page.locator('textarea').first().fill('Vendí 5 termos a ' + lucia + ', ya pagó todo.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForTimeout(1200);
    await page.getByText('Guardar pedido', { exact: true }).click();
    await page.waitForTimeout(1000);

    // 1) Sin ningún botón de "registrar algo más" en ningún lado.
    const botonViejoExiste = await page.getByText('Registrar algo más', { exact: false }).count();
    if (botonViejoExiste > 0) fail('todavía existe el botón "Registrar algo más" (debía quitarse)');
    else ok('no existe ningún botón "Registrar algo más"');

    // 2) La confirmación cierra sola e invita a seguir.
    const confirmacion = await page.getByText('Pedido guardado para ' + lucia, { exact: false }).count();
    const invitacion = await page.getByText('¿Qué más pasó en tu negocio?', { exact: false }).count();
    const formularioAbierto = await page.locator('input[placeholder="¿Qué vendiste?"]').count();
    if (confirmacion === 0) fail('no apareció la confirmación del pedido de Lucía');
    else ok('apareció la confirmación del pedido de Lucía');
    if (invitacion === 0) fail('no apareció "¿Qué más pasó en tu negocio?"');
    else ok('apareció la invitación "¿Qué más pasó en tu negocio?"');
    if (formularioAbierto > 0) fail('la tarjeta editable sigue abierta (debería haberse cerrado sola)');
    else ok('la tarjeta editable se cerró sola, sin necesidad de ningún botón');

    // 3) Mensaje DIRECTO (sin clic en nada) sobre un cliente distinto.
    await page.route(N8N_URL_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        estado: 'completo', cliente: pedro, acciones: ['crear_recordatorio'],
        recordatorio: { texto: 'Llamar a ' + pedro + ' para seguimiento', fecha: '2026-11-10' },
      }),
    }));
    await page.locator('textarea').first().fill('Recuérdame llamar a ' + pedro + ' el 10 para dar seguimiento.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForTimeout(1200);

    const nombrePedroVisible = await page.getByText(pedro, { exact: false }).count();
    const pastillaNuevoPedro = await page.getByText('Nuevo', { exact: true }).count();
    const campoVentaVisible = await page.locator('input[placeholder="¿Qué vendiste?"]').count();
    if (nombrePedroVisible === 0 || pastillaNuevoPedro === 0) fail('no se preparó el recordatorio de Pedro como cliente nuevo e independiente');
    else ok('se preparó solo el recordatorio de Pedro, cliente nuevo e independiente de Lucía');
    if (campoVentaVisible > 0) fail('se arrastraron campos de venta de la operación anterior (Lucía) a la de Pedro');
    else ok('no se arrastró ningún campo de venta de Lucía a la operación de Pedro');

    const botonGuardarPedro = page.getByText('Guardar recordatorio', { exact: true });
    if (await botonGuardarPedro.count() === 0) fail('el botón no dice "Guardar recordatorio" para la operación de Pedro');
    else ok('el botón de guardado corresponde a la operación de Pedro ("Guardar recordatorio")');

    // 4) La confirmación anterior de Lucía sigue visible (no se perdió nada).
    const confirmacionLuciaSigueAhi = await page.getByText('Pedido guardado para ' + lucia, { exact: false }).count();
    if (confirmacionLuciaSigueAhi === 0) fail('la confirmación anterior de Lucía desapareció');
    else ok('la confirmación anterior de Lucía se conserva en la conversación');

    await botonGuardarPedro.click();
    await page.waitForTimeout(1000);
    const clientes = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
    const pedidos = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_pedidos') || '[]'));
    const luciaCliente = clientes.find(c => c.nombre === lucia);
    const pedroCliente = clientes.find(c => c.nombre === pedro);
    if (!pedroCliente) fail('Pedro no se creó');
    else if ((pedroCliente.items || []).length > 0) fail('Pedro terminó con productos arrastrados de Lucía');
    else ok('Pedro se creó limpio, sin productos arrastrados de Lucía');
    const pedidosDePedro = pedidos.filter(p => p.clienteId === pedroCliente?.id);
    if (pedidosDePedro.length > 0) fail('se creó un pedido para Pedro (no debería -- solo fue un recordatorio)');
    else ok('no se creó ningún pedido para Pedro');
    const pedidosDeLucia = pedidos.filter(p => p.clienteId === luciaCliente?.id);
    if (pedidosDeLucia.length !== 1) fail('el pedido de Lucía se vio afectado: ahora hay ' + pedidosDeLucia.length);
    else ok('el pedido de Lucía sigue intacto (1 pedido), sin duplicados');

    await page.close();
  }

  console.log('\n--- CASO 2: corrección del MISMO cliente mientras el borrador está abierto -- completa la misma operación ---');
  {
    const gabriela = 'Gabriela ' + sufijoUnico();
    const page = await nuevaPagina(browser);

    await page.route(N8N_URL_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        estado: 'completo', cliente: gabriela, acciones: ['registrar_venta'],
        venta: { items: [{ producto: 'termos', cantidad: 20, precio_unitario: 150 }], total: 3000 },
      }),
    }));
    await page.locator('textarea').first().fill('Vendí 20 termos a ' + gabriela + ' a $150 cada uno.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForTimeout(1200);

    // Corrección: mismo cliente, agrega el pago -- NO debe preguntar nada,
    // debe completar la MISMA operación (seguir mostrando el mismo pedido).
    await page.route(N8N_URL_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        estado: 'completo', cliente: gabriela, acciones: ['registrar_venta'],
        venta: { items: [{ producto: 'termos', cantidad: 20, precio_unitario: 150 }], total: 3000, estado_pago: 'pagado', metodo_pago: 'transferencia' },
      }),
    }));
    await page.locator('textarea').first().fill('Ya pagó todo, por transferencia.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForTimeout(1200);

    const preguntaAmbigua = await page.getByText('¿Quieres cambiar lo que estamos revisando', { exact: false }).count();
    if (preguntaAmbigua > 0) fail('se preguntó "cambiar o empezar otra" para una corrección CLARA del mismo cliente (no debería)');
    else ok('una corrección del mismo cliente se aplicó directo, sin preguntar nada');

    const totalSigue = await page.getByText(/\$3,000|\$3000/).count();
    if (totalSigue === 0) fail('se perdió el total del pedido al aplicar la corrección');
    else ok('el total del pedido se conserva tras la corrección');

    await page.getByText('Editar', { exact: true }).click();
    const radioCompleto = await page.locator('label', { hasText: 'Pago completo' }).locator('input[type="radio"]').isChecked();
    if (!radioCompleto) fail('el pago completo de la corrección no quedó marcado');
    else ok('el pago completo de la corrección se aplicó correctamente al mismo borrador');

    await page.close();
  }

  console.log('\n--- CASO 3a: mensaje de OTRO cliente con borrador abierto -- pregunta, y "Empezar otra operación" activa la nueva ---');
  {
    const diana = 'Diana ' + sufijoUnico();
    const elena = 'Elena ' + sufijoUnico();
    const page = await nuevaPagina(browser);

    await page.route(N8N_URL_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        estado: 'completo', cliente: diana, acciones: ['crear_recordatorio'],
        recordatorio: { texto: 'Llamar a ' + diana, fecha: '2026-11-11' },
      }),
    }));
    await page.locator('textarea').first().fill(diana + ' preguntó algo, recuérdame llamarla.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForTimeout(1200);

    await page.route(N8N_URL_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        estado: 'completo', cliente: elena, acciones: ['registrar_venta'],
        venta: { items: [{ producto: 'playeras', cantidad: 2, precio_unitario: 100 }], total: 200 },
      }),
    }));
    await page.locator('textarea').first().fill('Vendí 2 playeras a ' + elena + ' a $100 cada una.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForTimeout(1200);

    const pregunta = await page.getByText('¿Quieres cambiar lo que estamos revisando o empezar otra operación?', { exact: false });
    if (await pregunta.count() === 0) fail('no apareció la pregunta de ambigüedad para un cliente distinto con un borrador abierto');
    else ok('apareció la pregunta de ambigüedad ("cambiar" o "empezar otra")');

    const draftOriginalIntacto = await page.getByText('Guardar recordatorio', { exact: true }).count();
    if (draftOriginalIntacto === 0) fail('el borrador original (recordatorio de Diana) desapareció antes de resolver la ambigüedad');
    else ok('el borrador original de Diana sigue intacto mientras la ambigüedad no se resuelve');

    await page.getByText('Empezar otra operación', { exact: true }).click();
    await page.waitForTimeout(500);

    const nombreElenaVisible = await page.getByText(elena, { exact: false }).count();
    const pastillaNuevoElena = await page.getByText('Nuevo', { exact: true }).count();
    const botonVenta = await page.getByText('Guardar pedido', { exact: true }).count();
    if (nombreElenaVisible === 0 || pastillaNuevoElena === 0) fail('"Empezar otra operación" no activó la operación de Elena como cliente nuevo e independiente');
    else ok('"Empezar otra operación" activó la venta de Elena, resuelta como cliente nuevo e independiente');
    if (botonVenta === 0) fail('el botón no cambió a "Guardar pedido" tras "Empezar otra operación"');
    else ok('el botón de guardado corresponde ahora a la venta de Elena');

    const preguntaSigueAhi = await page.getByText('¿Quieres cambiar lo que estamos revisando o empezar otra operación?', { exact: false }).count();
    if (preguntaSigueAhi === 0) fail('el texto de la pregunta desapareció del historial (debería quedar como mensaje de la conversación)');
    else ok('el texto de la pregunta queda en el historial (ya sin botones activos)');

    await page.close();
  }

  console.log('\n--- CASO 3b: "Cambiar lo que estamos revisando" fusiona -- conserva lo que la respuesta nueva no repite ---');
  {
    const francisco = 'Francisco ' + sufijoUnico();
    const georgina = 'Georgina ' + sufijoUnico();
    const page = await nuevaPagina(browser);

    await page.route(N8N_URL_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        estado: 'completo', cliente: francisco, acciones: ['crear_recordatorio'],
        recordatorio: { texto: 'Llamar a ' + francisco + ' para confirmar', fecha: '2026-11-12' },
      }),
    }));
    await page.locator('textarea').first().fill(francisco + ' preguntó algo, recuérdame llamarlo.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForTimeout(1200);

    // Llega una venta para OTRO nombre (sin recordatorio) -- ambiguo.
    await page.route(N8N_URL_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        estado: 'completo', cliente: georgina, acciones: ['registrar_venta'],
        venta: { items: [{ producto: 'tazas', cantidad: 3, precio_unitario: 50 }], total: 150 },
      }),
    }));
    await page.locator('textarea').first().fill('Era para ' + georgina + ', vendí 3 tazas a $50 cada una.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForTimeout(1200);

    await page.getByText('Cambiar lo que estamos revisando', { exact: true }).click();
    await page.waitForTimeout(500);

    // El nombre y la venta son los NUEVOS, pero el recordatorio (que la
    // respuesta nueva no volvió a mencionar) debe conservarse -- visible en
    // el propio resumen, sin necesidad de entrar a "Editar".
    const nombreActualizado = await page.getByText(georgina, { exact: false }).count();
    const ventaPresente = await page.getByText('3 tazas', { exact: false }).count();
    const recordatorioConservado = await page.getByText('Llamar a ' + francisco + ' para confirmar', { exact: false }).count();
    if (nombreActualizado === 0) fail('"Cambiar" no actualizó el nombre del cliente a Georgina');
    else ok('"Cambiar" actualizó correctamente el cliente a Georgina');
    if (ventaPresente === 0) fail('"Cambiar" no incorporó la venta nueva (3 tazas)');
    else ok('"Cambiar" incorporó la venta nueva correctamente');
    if (recordatorioConservado === 0) fail('"Cambiar" perdió el recordatorio que ya existía (debería conservarse, no se mencionó en la corrección)');
    else ok('"Cambiar" conserva el recordatorio original, que la corrección no volvió a mencionar');

    await page.close();
  }

  console.log('\n--- CASO 4: guardado bloqueado (venta incompleta tras resolver ambigüedad) nunca se cierra como exitoso ---');
  {
    const hector = 'Hector ' + sufijoUnico();
    const irene = 'Irene ' + sufijoUnico();
    const page = await nuevaPagina(browser);

    await page.route(N8N_URL_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        estado: 'completo', cliente: hector, acciones: ['crear_recordatorio'],
        recordatorio: { texto: 'Llamar a ' + hector, fecha: '2026-11-13' },
      }),
    }));
    await page.locator('textarea').first().fill(hector + ' preguntó algo, recuérdame llamarlo.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForTimeout(1200);

    await page.route(N8N_URL_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        estado: 'completo', cliente: irene, acciones: ['registrar_venta'],
        venta: { items: [{ producto: 'playeras', cantidad: 1, precio_unitario: 100 }], total: 100, estado_pago: 'pagado' },
      }),
    }));
    await page.locator('textarea').first().fill('Le vendí una playera a ' + irene + ' por 100, ya pagó.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForTimeout(1200);
    await page.getByText('Empezar otra operación', { exact: true }).click();
    await page.waitForTimeout(500);

    // No se dio método de pago -- el guardado debe seguir bloqueado, nunca
    // debe poder cerrarse como si ya se hubiera pagado de verdad.
    const guardarBloqueado = await page.getByText('Guardar pedido', { exact: true }).isDisabled();
    if (!guardarBloqueado) fail('"Guardar pedido" no debería estar habilitado sin método de pago (no se inventó)');
    else ok('el guardado sigue bloqueado por falta de método de pago (nunca se cierra como exitoso sin estar completo)');

    await page.getByText('Editar', { exact: true }).click();
    await page.getByText('Efectivo', { exact: true }).click();
    await page.getByText('Volver al resumen', { exact: true }).click();
    const guardarHabilitado = !(await page.getByText('Guardar pedido', { exact: true }).isDisabled());
    if (!guardarHabilitado) fail('"Guardar pedido" sigue bloqueado tras completar el método de pago');
    else ok('tras completar el método, el guardado se habilita (se recupera sin perder nada)');
    await page.getByText('Guardar pedido', { exact: true }).click();
    await page.waitForTimeout(1000);

    const pedidos = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_pedidos') || '[]'));
    const clientes = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
    const ireneCliente = clientes.find(c => c.nombre === irene);
    const ireneDuplicada = clientes.filter(c => c.nombre === irene).length;
    const pedidosDeIrene = pedidos.filter(p => p.clienteId === ireneCliente?.id);
    if (ireneDuplicada !== 1) fail('Irene quedó duplicada: ' + ireneDuplicada);
    else ok('Irene no se duplicó');
    if (pedidosDeIrene.length !== 1) fail('el pedido de Irene se duplicó: ' + pedidosDeIrene.length);
    else ok('el pedido de Irene se guardó una sola vez, sin duplicados, tras recuperarse del bloqueo');

    await page.close();
  }

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== HUBO FALLOS ===' : '\n=== TODOS LOS CHEQUEOS PASARON ===');
})();
