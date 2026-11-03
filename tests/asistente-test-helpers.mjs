// Helpers compartidos por las pruebas del Asistente (NO toca CLEO Pruebas,
// solo el entorno local desechable). Cada prueba debe preparar sus propios
// datos sin depender de lo que haya quedado en el backend compartido de
// corridas anteriores (propias o de otro archivo) -- por eso `paginaLimpia`
// siempre arranca con un estado local EXPLÍCITO (clientes/pedidos/etc. en
// "[]", o los clientes que la propia prueba pida sembrar) marcado como
// propietario de esta cuenta de prueba, en vez de dejar que la página
// jale lo que sea que haya en la nube compartida.
//
// Por qué esto aísla de verdad: cloudSync.pullUserData() nunca sobreescribe
// el local con lo remoto cuando el local ya tiene datos Y no hay un hash
// confirmado todavía (ver "LOCAL ADELANTADO" en cloudSync.js) -- como
// addInitScript siembra el local ANTES de que la página cargue, y nunca se
// guarda un hash confirmado para esta sesión nueva, el local sembrado
// siempre gana sobre cualquier basura que haya en la nube. Sin este sembrado
// explícito, una página que arranca sin nada local hereda TODO lo que haya
// en la nube compartida -- eso fue la causa real de las fallas intermitentes.
import { chromium } from 'playwright';

export const URL = 'http://localhost:5193/';
export const N8N_URL_PATTERN = '**/webhook-test/cleo-assistant';

export const FAKE_SESSION = {
  access_token: 'simulado-no-es-un-jwt-real', token_type: 'bearer',
  expires_in: 60 * 60 * 24 * 365, expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  refresh_token: 'simulado-no-es-un-jwt-real',
  user: { id: '11111111-1111-1111-1111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'simulacion@cleo.local' },
};

export function fail(msg) { console.log('❌ FALLÓ:', msg); process.exitCode = 1; }
export function ok(msg) { console.log('✅', msg); }

// Sufijo único por invocación -- nunca por archivo ni por corrida completa,
// así dos páginas abiertas en el mismo milisegundo (CASO 1, CASO 2...) de
// una misma ejecución tampoco chocan entre sí.
let _contador = 0;
export function sufijoUnico() {
  _contador += 1;
  return Date.now().toString(36) + '_' + (_contador);
}

export async function lanzarNavegador() {
  return chromium.launch();
}

// clientesSeed: array de clientes YA EXISTENTES que esta prueba necesita
// (ej. para probar "coincidencia encontrada"). Si no se pasa nada, el
// negocio arranca genuinamente vacío -- ninguna prueba hereda clientes,
// pedidos ni cotizaciones de otra.
//
// El sembrado solo se aplica en la carga INICIAL, nunca en un page.reload()
// posterior (ver el guard de abajo): addInitScript se re-ejecuta en cada
// navegación de la misma página, y si volviera a pisar localStorage con la
// semilla original en cada reload, una prueba de persistencia-tras-recargar
// jamás podría ver lo que el propio flujo de guardado + sync ya escribió.
export async function paginaLimpia(browser, { viewport, clientesSeed } = {}) {
  const context = await browser.newContext(viewport ? { viewport } : undefined);
  const page = await context.newPage();
  await page.addInitScript(([session, clientes, userId]) => {
    if (localStorage.getItem('__cleo_test_seeded__')) return;
    localStorage.setItem('__cleo_test_seeded__', '1');
    localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session));
    localStorage.setItem('cleo_cache_owner_user_id', userId);
    localStorage.setItem('cleo_tipo_perfil', JSON.stringify('productos'));
    localStorage.setItem('cleo_perfil', JSON.stringify({ tipoPerfil: 'productos' }));
    localStorage.setItem('cleo_clientes', JSON.stringify(clientes));
    localStorage.setItem('cleo_pedidos', JSON.stringify([]));
    localStorage.setItem('cleo_cots', JSON.stringify([]));
    localStorage.setItem('cleo_oportunidades', JSON.stringify([]));
    localStorage.setItem('cleo_tombstones', JSON.stringify([]));
  }, [FAKE_SESSION, clientesSeed || [], FAKE_SESSION.user.id]);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  return page;
}

export async function abrirChat(page) {
  await page.getByRole('button', { name: 'Hablar con CLEO' }).click();
}

// Forma mínima de un cliente YA EXISTENTE para sembrar como candidato de
// coincidencia (mismos campos que usa guardarCliente/formVacio).
export function clienteSeed(id, nombre, overrides) {
  return Object.assign({
    id, nombre, negocio: '', contacto: '', origen: 'Instagram', etapa: 'Nuevo contacto',
    notas: '', instagram: '', canalPrincipal: 'WhatsApp', messenger: '', email: '',
    fecha: '2026-10-01', ultimoContacto: '2026-10-01', notaRecontacto: '', recordatorios: [],
  }, overrides || {});
}
