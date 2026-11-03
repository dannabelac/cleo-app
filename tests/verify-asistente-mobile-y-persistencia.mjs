// Verificación local desechable (NO toca CLEO Pruebas): botón flotante /
// panel del Asistente en móvil y escritorio, y persistencia real tras
// recargar. Cada escenario que necesita un cliente existente siembra el
// suyo con un nombre único (ver paginaLimpia) -- nunca depende de que
// "María López" ya exista en el backend compartido.
import { lanzarNavegador, paginaLimpia, clienteSeed, sufijoUnico, N8N_URL_PATTERN, fail, ok } from './asistente-test-helpers.mjs';

(async () => {
  const browser = await lanzarNavegador();

  console.log('\n--- Móvil (390x844): botón flotante no tapa la barra de navegación ---');
  {
    const page = await paginaLimpia(browser, { viewport: { width: 390, height: 844 } });

    const boton = page.getByRole('button', { name: 'Hablar con CLEO' });
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    const bBoton = await boton.boundingBox();
    const bNav = await nav.boundingBox();
    if (!bBoton) fail('el botón flotante no es visible en móvil');
    else if (!bNav) fail('no se encontró la barra de navegación inferior para comparar');
    else if (bBoton.y + bBoton.height > bNav.y) fail('el botón flotante se encima con la barra de navegación inferior (botón termina en ' + (bBoton.y + bBoton.height) + ', nav empieza en ' + bNav.y + ')');
    else ok('el botón flotante queda arriba de la barra de navegación, sin tapar nada (botón termina en ' + Math.round(bBoton.y + bBoton.height) + ', nav empieza en ' + Math.round(bNav.y) + ')');

    // Abrir el panel: debe ocupar toda la pantalla en móvil. Se busca algo
    // exclusivo del panel (el botón "Cerrar"), no "CLEO" -- ese texto
    // también aparece en el encabezado de la app detrás del panel.
    await boton.click();
    await page.waitForTimeout(300);
    const cerrar = page.getByRole('button', { name: 'Cerrar' });
    const visible = await cerrar.isVisible();
    if (!visible) fail('el panel no se abrió en móvil (no se encontró el botón Cerrar)');
    else ok('el panel de chat se abre correctamente en móvil (pantalla completa)');
    await page.close();
  }

  console.log('\n--- Escritorio (1280x800): panel lateral, no pantalla completa ---');
  {
    const page = await paginaLimpia(browser, { viewport: { width: 1280, height: 800 } });
    await page.getByRole('button', { name: 'Hablar con CLEO' }).click();
    await page.waitForTimeout(300);
    // El panel lateral debe dejar visible el resto de la app a la izquierda
    // (medido geométricamente: el panel arranca bien adentro del viewport,
    // no ocupa toda la pantalla desde x=0) -- "+ Nuevo" no es un chequeo
    // confiable aquí porque un negocio genuinamente vacío (sin ningún
    // cliente) muestra la pantalla de bienvenida en vez de la barra
    // superior normal, y esta prueba no debe depender de eso.
    const saludo = page.getByText('Cuéntame qué pasó con tu negocio', { exact: false });
    const bSaludo = await saludo.boundingBox();
    if (!bSaludo) fail('no se encontró el panel del chat para medir su posición');
    else if (bSaludo.x < 1280 / 2) fail('en escritorio el panel parece ocupar toda la pantalla (no debería ser modal completo) -- x=' + Math.round(bSaludo.x));
    else ok('en escritorio el panel es lateral, pegado a la derecha (x=' + Math.round(bSaludo.x) + '), el resto de la app queda visible detrás');
    await page.close();
  }

  console.log('\n--- Persistencia real tras recargar (chat + backend corregido) ---');
  {
    const maria = 'María López ' + sufijoUnico();
    const page = await paginaLimpia(browser, { clientesSeed: [clienteSeed(7001, maria)] });
    await page.getByRole('button', { name: 'Hablar con CLEO' }).click();
    await page.route(N8N_URL_PATTERN, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ estado: 'completo', cliente: maria, acciones: ['crear_recordatorio'], recordatorio: { texto: 'Prueba de persistencia real tras recargar.', fecha: '2026-11-03' } }),
    }));
    await page.locator('textarea').first().fill('Recuérdame el 3 confirmar algo con ' + maria + '.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.waitForTimeout(1200);
    await page.getByText('¿Es ' + maria + '?', { exact: false }).click();
    await page.getByText(/^(Confirmar y guardar|Guardar recordatorio)$/, { exact: true }).click();
    await page.waitForTimeout(1200);
    // Esperar un ciclo de cloudSync (5s) para que el PATCH real llegue al
    // backend antes de recargar.
    await page.waitForTimeout(6000);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const clientes = await page.evaluate(() => JSON.parse(localStorage.getItem('cleo_clientes') || '[]'));
    const mariaCliente = clientes.find(c => c.nombre === maria);
    if (!mariaCliente) fail(maria + ' desapareció tras recargar');
    else if (!mariaCliente.recordatorios || !mariaCliente.recordatorios.some(r => r.nota === 'Prueba de persistencia real tras recargar.')) {
      fail('el recordatorio NO persistió tras recargar (se perdió igual que antes del fix de PATCH)');
    } else ok('el recordatorio persiste correctamente después de recargar la página');
    await page.close();
  }

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== HUBO FALLOS ===' : '\n=== TODOS LOS CHEQUEOS PASARON ===');
})();
