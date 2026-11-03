// Simulación LOCAL de un webhook de n8n, SOLO para probar asistente-proxy
// de punta a punta (no mockeado desde el navegador) -- NO es n8n real.
//
// Verifica la cabecera secreta (x-cleo-asistente-secret) contra
// EXPECTED_SECRET (env var) y responde distinto según el texto del mensaje,
// para poder disparar cada escenario desde la prueba sin reiniciar nada:
//   mensaje incluye "DISPARAR_LENTO"       -> tarda DELAY_MS antes de responder (prueba de timeout)
//   mensaje incluye "DISPARAR_ERROR_N8N"   -> responde 500
//   mensaje incluye "DISPARAR_JSON_INVALIDO" -> responde 200 con un cuerpo que no es JSON
//   cualquier otro mensaje                 -> respuesta normal de éxito
import http from 'node:http';

const PORT = Number(process.env.PORT || 8789);
const EXPECTED_SECRET = process.env.EXPECTED_SECRET || 'secreto-prueba-local';
const DELAY_MS = Number(process.env.DELAY_MS || 3000);

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    const secretoRecibido = req.headers['x-cleo-asistente-secret'] || '';
    if (secretoRecibido !== EXPECTED_SECRET) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'secreto_invalido' }));
      return;
    }
    let data;
    try { data = JSON.parse(body); } catch { data = {}; }
    const mensaje = data.mensaje || '';

    if (mensaje.includes('DISPARAR_LENTO')) {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ estado: 'completo', cliente: 'Prueba Proxy', acciones: ['crear_recordatorio'], recordatorio: { texto: 'tarde', fecha: '2026-11-10' } }));
      }, DELAY_MS);
      return;
    }
    if (mensaje.includes('DISPARAR_ERROR_N8N')) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'workflow_error' }));
      return;
    }
    if (mensaje.includes('DISPARAR_JSON_INVALIDO')) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('esto no es JSON');
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      estado: 'completo', cliente: 'Prueba Proxy', acciones: ['crear_recordatorio'],
      recordatorio: { texto: 'Recordatorio de prueba vía proxy real', fecha: '2026-11-10' },
    }));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('fake-n8n-asistente escuchando en http://127.0.0.1:' + PORT);
});
