// Verificación local desechable (NO toca CLEO Pruebas) del fix: la
// conversión a Ganado/Convertido solo debe ocurrir cuando se registra un
// pedido real, nunca por un recordatorio solo. Adaptado al chat con CLEO
// (botón flotante + panel, contrato n8n con historial/estado).
//
// Cada escenario siembra su propio negocio desde cero (ver paginaLimpia),
// con ids y nombres únicos por corrida -- nunca depende de lo que haya
// quedado en el backend compartido.
import { lanzarNavegador, paginaLimpia, abrirChat, clienteSeed, sufijoUnico, N8N_URL_PATTERN, fail, ok } from './asistente-test-helpers.mjs';

async function enviarYRevisar(page, mensaje, respuestaMock) {
  await page.route(N8N_URL_PATTERN, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respuestaMock) }));
  await page.locator('textarea').first().fill(mensaje);
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.waitForTimeout(1500);
}

async function leerClientes(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
}

// El botón de guardado dice "Guardar pedido" si hay venta, o "Guardar
// recordatorio" si es solo recordatorio.
async function clickGuardar(page) {
  const btn = page.getByText(/^(Guardar pedido|Guardar recordatorio)$/, { exact: true });
  await btn.click();
}

(async () => {
  const browser = await lanzarNavegador();

  console.log('\n--- CASO 1: recordatorio solo, clienta NO convertida ---');
  {
    const carla = 'Carla Test ' + sufijoUnico();
    const carlaId = 2001;
    const page = await paginaLimpia(browser, { clientesSeed: [clienteSeed(carlaId, carla, { estadoProspecto: 'Sin respuesta', fechaEtapa: '2026-10-20' })] });
    await abrirChat(page);
    await enviarYRevisar(page, 'Recuérdame mañana escribirle a ' + carla + ' para confirmar su dirección.', {
      estado: 'completo', cliente: carla, acciones: ['crear_recordatorio'],
      recordatorio: { texto: 'Confirmar dirección con ' + carla + '.', fecha: '2026-11-03' },
    });
    const candidato = page.getByText('¿Es ' + carla + '?', { exact: false });
    if (await candidato.count() === 0) { fail('no se sugirió a ' + carla + ' como coincidencia'); }
    else {
      await candidato.click();
      await clickGuardar(page);
      await page.waitForTimeout(1000);
      const clientes = await leerClientes(page);
      const clienta = clientes.find(c => c.id === carlaId);
      if (!clienta) fail('la clienta desapareció');
      else if (clienta.estadoProspecto !== 'Sin respuesta') fail('estadoProspecto cambió: ' + clienta.estadoProspecto);
      else if (!clienta.recordatorios || clienta.recordatorios.length === 0) fail('no se agregó el recordatorio');
      else ok('conserva estadoProspecto="Sin respuesta" y tiene el recordatorio nuevo');
      const pedidos = await page.evaluate(() => localStorage.getItem('cleo_pedidos'));
      if (pedidos && JSON.parse(pedidos).length > 0) fail('se creó un pedido sin que debiera (caso 1)');
      else ok('no se creó ningún pedido (correcto)');
    }
    await page.close();
  }

  console.log('\n--- CASO 2: recordatorio solo, clienta YA convertida ---');
  {
    const maria = 'María López ' + sufijoUnico();
    const mariaId = 2002;
    const page = await paginaLimpia(browser, { clientesSeed: [clienteSeed(mariaId, maria, { estadoProspecto: 'Convertido', etapa: 'Ganado', fechaEtapa: '2026-10-15' })] });
    await abrirChat(page);
    await enviarYRevisar(page, 'Recuérdame hoy pedirle a ' + maria + ' que me envíe su logotipo.', {
      estado: 'completo', cliente: maria, acciones: ['crear_recordatorio'],
      recordatorio: { texto: 'Pedirle a ' + maria + ' su logotipo.', fecha: '2026-11-02' },
    });
    const candidato = page.getByText('¿Es ' + maria + '?', { exact: false });
    if (await candidato.count() === 0) { fail('no se sugirió a ' + maria + ' como coincidencia'); }
    else {
      await candidato.click();
      await clickGuardar(page);
      await page.waitForTimeout(1000);
      const clientes = await leerClientes(page);
      const clienta = clientes.find(c => c.id === mariaId);
      if (!clienta) fail('la clienta desapareció');
      else if (clienta.estadoProspecto !== 'Convertido' || clienta.etapa !== 'Ganado') fail('estado cambió');
      else if (!clienta.recordatorios || clienta.recordatorios.length === 0) fail('no se agregó el recordatorio');
      else ok('conserva Convertido/Ganado y tiene el recordatorio nuevo');
    }
    await page.close();
  }

  console.log('\n--- CASO 3: recordatorio solo, cliente nuevo (sin candidatos) ---');
  {
    const jorge = 'Jorge Nuevo ' + sufijoUnico();
    const page = await paginaLimpia(browser);
    await abrirChat(page);
    await enviarYRevisar(page, 'Recuérdame el viernes enviarle la lista de precios a ' + jorge + '.', {
      estado: 'completo', cliente: jorge, acciones: ['crear_recordatorio'],
      recordatorio: { texto: 'Enviar lista de precios a ' + jorge + '.', fecha: '2026-11-06' },
    });
    // Sin ninguna coincidencia sembrada -- ya no debe pedir clic: se prepara
    // "cliente nuevo" por defecto y se indica en el resumen.
    const avisoNuevo = (await page.getByText(jorge, { exact: false }).count()) && (await page.getByText('Nuevo', { exact: true }).count());
    if (!avisoNuevo) { fail('no se preparó "cliente nuevo" por defecto (sin coincidencias)'); }
    else {
      ok('sin coincidencias, se preparó "cliente nuevo" por defecto, sin pedir clic');
      await clickGuardar(page);
      await page.waitForTimeout(1000);
      const clientes = await leerClientes(page);
      const jorgeCliente = clientes.find(c => c.nombre === jorge);
      if (!jorgeCliente) fail('no se creó');
      else if (jorgeCliente.estadoProspecto === 'Convertido' || jorgeCliente.etapa === 'Ganado') fail('nació convertido');
      else if (!jorgeCliente.recordatorios || jorgeCliente.recordatorios.length === 0) fail('no tiene el recordatorio');
      else ok('se creó SIN convertir y con su recordatorio');
    }
    await page.close();
  }

  console.log('\n--- CASO 4: pedido pagado + recordatorio, cliente nuevo (sin candidatos) ---');
  {
    const patricia = 'Patricia Pedido ' + sufijoUnico();
    const page = await paginaLimpia(browser);
    await abrirChat(page);
    await enviarYRevisar(page, 'Registra una venta a ' + patricia + ' de 5 tazas a $100 cada una, ya pagó el total. Recuérdame mañana confirmar el color.', {
      estado: 'completo', cliente: patricia, acciones: ['registrar_venta', 'crear_recordatorio'],
      venta: { producto: 'tazas', cantidad: 5, precio_unitario: 100, moneda: 'MXN', total: 500, estado_pago: 'pagado', metodo_pago: 'efectivo' },
      recordatorio: { texto: 'Confirmar el color con ' + patricia + '.', fecha: '2026-11-03' },
    });
    const avisoNuevo4 = (await page.getByText(patricia, { exact: false }).count()) && (await page.getByText('Nuevo', { exact: true }).count());
    if (!avisoNuevo4) { fail('no se preparó "cliente nuevo" por defecto (caso 4)'); }
    else {
      ok('sin coincidencias, se preparó "cliente nuevo" por defecto, sin pedir clic');
      await clickGuardar(page);
      await page.waitForTimeout(1000);
      const clientes = await leerClientes(page);
      const patriciaCliente = clientes.find(c => c.nombre === patricia);
      const pedidos = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_pedidos') || '[]'));
      if (!patriciaCliente) fail('no se creó');
      else if (patriciaCliente.estadoProspecto !== 'Convertido' || patriciaCliente.etapa !== 'Ganado') fail('NO quedó convertida');
      else ok('quedó Convertido/Ganado (correcto, hubo pedido real)');
      const pedidoPatricia = pedidos.find(p => p.clienteId === patriciaCliente?.id);
      if (!pedidoPatricia) fail('no se encontró el pedido');
      else if (pedidoPatricia.estadoPedido !== 'preparando') fail('estadoPedido incorrecto: ' + pedidoPatricia.estadoPedido);
      else if (!pedidoPatricia.pagos || pedidoPatricia.pagos.length === 0 || pedidoPatricia.pagos[0].concepto !== 'Pago completo') fail('pago completo no se registró');
      else ok('pedido en "preparando" con pago completo registrado');
      if (!patriciaCliente?.recordatorios || patriciaCliente.recordatorios.length === 0) fail('falta el recordatorio');
      else ok('recordatorio presente');
    }
    await page.close();
  }

  console.log('\n--- CASO 5: cerrar y reabrir el chat conserva la conversación ---');
  {
    const page = await paginaLimpia(browser);
    await abrirChat(page);
    await enviarYRevisar(page, 'Hola, solo probando.', {
      estado: 'pregunta', pregunta: '¿Qué te gustaría registrar?',
    });
    const antesDeCerrar = await page.locator('text=¿Qué te gustaría registrar?').count();
    if (antesDeCerrar === 0) fail('no apareció la pregunta de CLEO en el chat');
    else ok('CLEO hizo la pregunta de seguimiento en el chat');
    // Cerrar (×) y reabrir con el botón flotante.
    await page.getByRole('button', { name: 'Cerrar' }).click();
    await page.waitForTimeout(300);
    await abrirChat(page);
    const despuesDeReabrir = await page.locator('text=¿Qué te gustaría registrar?').count();
    const mensajeOriginal = await page.locator('text=Hola, solo probando.').count();
    if (despuesDeReabrir === 0 || mensajeOriginal === 0) fail('se perdió la conversación al cerrar y reabrir');
    else ok('la conversación se conserva al cerrar y reabrir el panel');
    await page.close();
  }

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== HUBO FALLOS ===' : '\n=== TODOS LOS CASOS PASARON ===');
})();
