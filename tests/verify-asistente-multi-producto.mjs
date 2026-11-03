// Verificación local desechable (NO toca CLEO Pruebas): pedido con varios
// productos de precios distintos (caso real: Lizzie, playera de Arjona $100
// + playera de Caifanes $200), pago parcial ("abonó 100"), resumen/Editar,
// enlace "Ver pedido", y persistencia tras recargar.
//
// Arranca con un negocio vacío propio (ver paginaLimpia) y un nombre único
// por corrida -- nunca depende de que "Lizzie" exista o no exista ya en el
// backend compartido por otra prueba o una corrida anterior de esta misma.
import { lanzarNavegador, paginaLimpia, abrirChat, sufijoUnico, N8N_URL_PATTERN, fail, ok } from './asistente-test-helpers.mjs';

(async () => {
  const browser = await lanzarNavegador();
  const lizzie = 'Lizzie ' + sufijoUnico();
  const page = await paginaLimpia(browser);
  await abrirChat(page);

  // Turno 1: el pedido, SIN mencionar el pago todavía (como el caso real).
  await page.route(N8N_URL_PATTERN, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      estado: 'completo', cliente: lizzie, acciones: ['registrar_venta'],
      venta: {
        items: [
          { producto: 'Playera personalizada de Arjona', cantidad: 1, precio_unitario: 100 },
          { producto: 'Playera personalizada de Caifanes', cantidad: 1, precio_unitario: 200 },
        ],
        total: 300,
      },
    }),
  }));
  await page.locator('textarea').first().fill('Cerré la venta de 2 playeras personalizadas a ' + lizzie + ', la de Arjona por 100 y la de Caifanes por 200.');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.waitForTimeout(1200);

  // 1) Resumen por defecto: líneas de producto + total, SIN campos de
  // formulario. Ronda 15: producto y precio son 2 <span> separados en la
  // misma fila (flex justify-between, sin "·" entre ellos), así que se
  // comprueban por separado.
  const lineaArjonaProducto = await page.getByText('1 Playera personalizada de Arjona', { exact: false }).count();
  const lineaArjonaPrecio = await page.getByText('$100.00', { exact: false }).count();
  const lineaCaifanesProducto = await page.getByText('1 Playera personalizada de Caifanes', { exact: false }).count();
  const lineaCaifanesPrecio = await page.getByText('$200.00', { exact: false }).count();
  const totalResumen = await page.getByText('$300.00 MXN', { exact: false }).count();
  const campoEdicionVisible = await page.locator('input[placeholder="¿Qué vendiste?"]').count();
  if (lineaArjonaProducto === 0 || lineaArjonaPrecio === 0) fail('no apareció la línea de "1 Playera personalizada de Arjona" / "$100.00" en el resumen');
  else ok('resumen muestra "1 Playera personalizada de Arjona" y "$100.00"');
  if (lineaCaifanesProducto === 0 || lineaCaifanesPrecio === 0) fail('no apareció la línea de "1 Playera personalizada de Caifanes" / "$200.00" en el resumen');
  else ok('resumen muestra "1 Playera personalizada de Caifanes" y "$200.00"');
  if (totalResumen === 0) fail('no apareció "$300.00 MXN" como total en el resumen');
  else ok('resumen muestra el total "$300.00 MXN"');
  if (campoEdicionVisible > 0) fail('el resumen muestra campos de edición (debería estar colapsado hasta pulsar "Editar")');
  else ok('el resumen no muestra campos de formulario por defecto (solo con "Editar")');

  // 2) Sin ninguna coincidencia -- se prepara "cliente nuevo" por defecto,
  // sin pedir un clic, y se indica claramente en el resumen. Ronda 15: el
  // nombre y la pastilla "Nuevo" son 2 elementos separados (nombre 15px/800
  // + pastilla), no un solo texto "Cliente: X · Nuevo".
  const nombreEnFicha = await page.getByText(lizzie, { exact: false }).count();
  const pastillaNuevo = await page.getByText('Nuevo', { exact: true }).count();
  const seCreara = await page.getByText('Se creará al guardar el pedido.', { exact: false }).count();
  if (nombreEnFicha === 0 || pastillaNuevo === 0) fail('no se preparó "cliente nuevo" por defecto (sin coincidencias)');
  else ok('sin coincidencias, se preparó "cliente nuevo" por defecto, sin pedir clic');
  if (seCreara === 0) fail('no se indicó "Se creará al guardar el pedido."');
  else ok('se indica claramente "Se creará al guardar el pedido."');

  // 3) Segundo turno: "abonó 100" -- debe registrarse como pago PARCIAL, no "sin pago".
  await page.route(N8N_URL_PATTERN, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      estado: 'completo', cliente: lizzie, acciones: ['registrar_venta'],
      venta: {
        items: [
          { producto: 'Playera personalizada de Arjona', cantidad: 1, precio_unitario: 100 },
          { producto: 'Playera personalizada de Caifanes', cantidad: 1, precio_unitario: 200 },
        ],
        total: 300, estado_pago: 'parcial', monto_pagado: 100,
      },
    }),
  }));
  await page.locator('textarea').first().fill('abonó 100');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.waitForTimeout(1200);

  // Ronda 15: "Abonó" y "Pendiente" son 2 filas separadas (cada una con su
  // propio importe en su propio <span>), no una sola línea con "·".
  const abonoTexto = await page.getByText('Abonó', { exact: true }).count();
  const abonoMonto = await page.getByText('$100.00', { exact: false }).count();
  const pendienteTexto = await page.getByText('Pendiente', { exact: true }).count();
  const pendienteMonto = await page.getByText('$200.00', { exact: false }).count();
  if (abonoTexto === 0 || abonoMonto === 0 || pendienteTexto === 0 || pendienteMonto === 0) fail('el resumen NO muestra "Abonó $100.00" / "Pendiente $200.00" (el pago parcial no se conservó)');
  else ok('el pago parcial se conservó: "Abonó $100.00" / "Pendiente $200.00"');

  // 4) Como no se dio método de pago, debe pedirse antes de guardar (no inventarlo).
  const guardarBloqueado = await page.getByText('Guardar pedido', { exact: true }).isDisabled();
  if (!guardarBloqueado) fail('"Guardar pedido" no debería estar habilitado sin método de pago (no debe inventarse)');
  else ok('"Guardar pedido" está bloqueado hasta elegir el método de pago (no se inventó)');

  // 5) Editar -> elegir método -> volver al resumen (debe conservar los datos).
  await page.getByText('Editar', { exact: true }).click();
  const radioParcial = await page.locator('label', { hasText: 'Pago parcial' }).locator('input[type="radio"]').isChecked();
  if (!radioParcial) fail('en el detalle, el radio "Pago parcial" no quedó marcado'); else ok('en el detalle, "Pago parcial" está correctamente marcado');
  await page.getByText('Efectivo', { exact: true }).click();
  await page.getByText('Volver al resumen', { exact: true }).click();
  const abonoTrasEditar = await page.getByText('Abonó', { exact: true }).count();
  const montoTrasEditar = await page.getByText('$100.00', { exact: false }).count();
  if (abonoTrasEditar === 0 || montoTrasEditar === 0) fail('al volver al resumen se perdió el abono');
  else ok('al volver al resumen, los datos se conservan');

  // 6) Ahora sí debe poder guardar.
  const guardarHabilitado = !(await page.getByText('Guardar pedido', { exact: true }).isDisabled());
  if (!guardarHabilitado) fail('"Guardar pedido" sigue bloqueado después de elegir el método de pago'); else ok('"Guardar pedido" se habilita tras elegir el método');
  await page.getByText('Guardar pedido', { exact: true }).click();
  await page.waitForTimeout(1200);

  // 7) Enlace "Ver pedido" en el chat -- simplificado: solo cierra el panel
  // del Asistente y navega a Pedidos, sin abrir el modal de edición.
  // "Pedidos" también aparece como item de navegación aunque no se haya
  // navegado ahí, así que se compara el conteo ANTES/DESPUÉS del clic (debe
  // subir: aparece además el encabezado "Pedidos" de la propia sección).
  const conteoPedidosAntes = await page.getByText('Pedidos', { exact: true }).count();
  const verPedidoBtn = page.getByText('Ver pedido', { exact: true });
  if (await verPedidoBtn.count() === 0) fail('no apareció el enlace "Ver pedido" tras guardar');
  else {
    await verPedidoBtn.click();
    await page.waitForTimeout(500);
    const panelAsistenteCerrado = await page.getByRole('button', { name: 'Hablar con CLEO' }).count();
    const modalEdicionAbierto = await page.locator('input[value*="Playera personalizada de Arjona"]').count();
    const conteoPedidosDespues = await page.getByText('Pedidos', { exact: true }).count();
    if (panelAsistenteCerrado === 0) fail('"Ver pedido" no cerró el panel del Asistente');
    else ok('"Ver pedido" cierra el panel del Asistente');
    if (modalEdicionAbierto > 0) fail('"Ver pedido" abrió el modal de edición del pedido (ya no debería)');
    else ok('"Ver pedido" ya no abre el modal de edición');
    if (conteoPedidosDespues <= conteoPedidosAntes) fail('"Ver pedido" no navegó a la sección Pedidos (no apareció el encabezado de la sección)');
    else ok('"Ver pedido" navega a la sección Pedidos (aparece su encabezado)');

    // Reabrir el chat debe conservar la conversación completa.
    await page.getByRole('button', { name: 'Hablar con CLEO' }).click();
    await page.waitForTimeout(300);
    const conversacionSigueAhi = await page.getByText('Pedido guardado para ' + lizzie, { exact: false }).count();
    if (conversacionSigueAhi === 0) fail('al reabrir el chat, se perdió la conversación anterior');
    else ok('al reabrir el chat, la conversación se conserva completa');
  }

  // 8) Esperar el ciclo de sync (5s) y recargar -- persistencia real.
  await page.waitForTimeout(6000);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const clientes = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
  const pedidos = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_pedidos') || '[]'));
  const lizzieCliente = clientes.find(c => c.nombre === lizzie);
  const pedido = pedidos.find(p => p.clienteId === lizzieCliente?.id);
  if (!lizzieCliente) fail(lizzie + ' no persistió tras recargar');
  else if (!pedido) fail('el pedido no persistió tras recargar');
  else if (!pedido.items || pedido.items.length !== 2) fail('tras recargar, el pedido no tiene los 2 productos');
  else if (pedido.total !== 300) fail('tras recargar, total incorrecto: ' + pedido.total);
  else {
    const totalPagado = (pedido.pagos || []).reduce((s, p) => s + Number(p.monto || 0), 0);
    if (totalPagado !== 100) fail('tras recargar, el pago no es $100: ' + totalPagado);
    else ok('tras recargar: pedido con 2 productos, total $300, pagado $100, saldo $200 -- todo persiste correctamente');
  }

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== HUBO FALLOS ===' : '\n=== TODOS LOS CHEQUEOS PASARON ===');
})();
