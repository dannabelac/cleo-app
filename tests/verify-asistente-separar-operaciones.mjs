// Verificación local desechable (NO toca CLEO Pruebas): pedido guardado →
// pedir un recordatorio en el MISMO chat. n8n puede volver a incluir la
// venta ya cerrada (trae todo el historial como contexto) -- CLEO debe
// detectarla como ya guardada y mostrar SOLO el recordatorio, en una
// tarjeta compacta, sin volver a pedir elegir cliente (ya se confirmó en
// este mismo chat), y sin duplicar pedido ni pago.
//
// Esta prueba siembra su PROPIA clienta existente (ver clienteSeed) con un
// nombre único por corrida, en vez de depender de que "María López" ya
// exista en el backend compartido -- así nunca hereda pedidos ni clientes
// de ninguna otra prueba ni de una corrida anterior de esta misma.
import { lanzarNavegador, paginaLimpia, abrirChat, clienteSeed, sufijoUnico, N8N_URL_PATTERN, fail, ok } from './asistente-test-helpers.mjs';

(async () => {
  const browser = await lanzarNavegador();
  const nombre = 'María López ' + sufijoUnico();
  const page = await paginaLimpia(browser, { clientesSeed: [clienteSeed(5001, nombre)] });
  await abrirChat(page);

  // Turno 1: vende y paga -- se guarda normal.
  await page.route(N8N_URL_PATTERN, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      estado: 'completo', cliente: nombre, acciones: ['registrar_venta'],
      venta: { producto: 'termos', cantidad: 20, precio_unitario: 150, moneda: 'MXN', total: 3000, estado_pago: 'pagado', metodo_pago: 'efectivo' },
    }),
  }));
  await page.locator('textarea').first().fill('Vendí 20 termos a ' + nombre + ' a $150 cada uno, ya pagó todo.');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.waitForTimeout(1200);

  const candidato = page.getByText('¿Es ' + nombre + '?', { exact: false });
  if (await candidato.count() === 0) { fail('no se sugirió a ' + nombre + ' en el primer turno (la clienta sembrada no se encontró como candidata)'); await browser.close(); process.exit(1); }
  await candidato.click();
  await page.getByText('Guardar pedido', { exact: true }).click();
  await page.waitForTimeout(1000);

  const pedidosTrasTurno1 = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_pedidos') || '[]'));
  if (pedidosTrasTurno1.length !== 1) fail('después del turno 1 debería haber exactamente 1 pedido, hay ' + pedidosTrasTurno1.length);
  else ok('turno 1: pedido de termos guardado correctamente (1 pedido)');

  // Turno 2: pide un recordatorio. El mock simula el bug real -- n8n vuelve
  // a incluir la MISMA venta ya guardada, junto con el recordatorio nuevo.
  await page.route(N8N_URL_PATTERN, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      estado: 'completo', cliente: nombre, acciones: ['registrar_venta', 'crear_recordatorio'],
      venta: { producto: 'termos', cantidad: 20, precio_unitario: 150, moneda: 'MXN', total: 3000, estado_pago: 'pagado', metodo_pago: 'efectivo' },
      recordatorio: { texto: 'Confirmar la dirección con ' + nombre + '.', fecha: '2026-11-03' },
    }),
  }));
  await page.locator('textarea').first().fill('También recuérdame confirmar su dirección mañana.');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.waitForTimeout(1200);

  // 1) La venta repetida NO debe mostrarse. La revisión arranca en modo
  // resumen (no hay inputs), así que se busca la línea de ítem exacta
  // ("20 termos · $...") que solo aparece en el resumen del Pedido -- el
  // mensaje de confirmación del turno 1 en el chat usa otra redacción
  // ("Pedido guardado para ... · $..."), así que no genera un falso positivo.
  // exact:true , en el resumen el renglón del ítem es un <span> con el
  // texto exacto "20 termos" (precio en un <span> aparte); exact:false
  // haría falso positivo contra el mensaje original del usuario, que
  // también contiene esa frase dentro de una oración más larga.
  const pedidoSeccionVisible = await page.getByText('20 termos', { exact: true }).count();
  if (pedidoSeccionVisible > 0) fail('la línea de "20 termos" reapareció en la revisión aunque esa venta ya estaba guardada');
  else ok('la venta ya guardada NO se volvió a mostrar en la revisión');

  // 2) No debe pedir elegir cliente otra vez -- ya se confirmó en este chat.
  const pickerClienteVisible = await page.getByText('¿Es ' + nombre + '?', { exact: false }).count();
  const nuevoOpcionVisible = await page.getByText('Es un cliente nuevo', { exact: false }).count();
  if (pickerClienteVisible > 0 || nuevoOpcionVisible > 0) fail('volvió a pedir elegir cliente, aunque ya estaba confirmado en este chat');
  else ok('no volvió a pedir elegir cliente (identidad ya resuelta en este chat)');

  // 3) Tarjeta compacta: nombre del cliente + botón "Guardar recordatorio".
  const paraTexto = await page.getByText(nombre, { exact: false }).count();
  const botonCompacto = page.getByText('Guardar recordatorio', { exact: true });
  if (paraTexto === 0) fail('no apareció la tarjeta compacta ("' + nombre + '")');
  else ok('apareció la tarjeta compacta de solo recordatorio');
  if (await botonCompacto.count() === 0) fail('el botón no dice "Guardar recordatorio"');
  else ok('el botón de guardado dice "Guardar recordatorio" (no "Guardar pedido")');

  await botonCompacto.click();
  await page.waitForTimeout(1000);

  // 4) Verificación final: sigue habiendo exactamente 1 pedido, 1 pago, y
  // ahora el recordatorio nuevo -- nada duplicado.
  const clientesFinal = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
  const pedidosFinal = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_pedidos') || '[]'));
  const maria = clientesFinal.find(c => c.nombre === nombre);
  const mariasDuplicadas = clientesFinal.filter(c => c.nombre === nombre).length;
  if (mariasDuplicadas !== 1) fail(nombre + ' quedó duplicada: ' + mariasDuplicadas + ' coincidencias');
  else ok(nombre + ' no se duplicó');
  if (pedidosFinal.length !== 1) fail('el pedido se duplicó: ahora hay ' + pedidosFinal.length);
  else ok('sigue habiendo exactamente 1 pedido (no se duplicó)');
  const pagosDelPedido = pedidosFinal[0]?.pagos || [];
  if (pagosDelPedido.length !== 1) fail('el pago se duplicó: ' + pagosDelPedido.length + ' pagos en el pedido');
  else ok('sigue habiendo exactamente 1 pago (no se duplicó)');
  if (!maria || !maria.recordatorios || !maria.recordatorios.some(r => r.nota === 'Confirmar la dirección con ' + nombre + '.')) {
    fail('el recordatorio nuevo no quedó guardado');
  } else ok('el recordatorio nuevo se guardó correctamente, sin tocar el pedido');

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== HUBO FALLOS ===' : '\n=== TODOS LOS CHEQUEOS PASARON ===');
})();
