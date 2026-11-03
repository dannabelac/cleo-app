// Simulación LOCAL de Supabase Auth, SOLO para probar asistente-proxy
// contra algo real (no mockeado desde el navegador) -- NO es Supabase real,
// solo implementa lo mínimo que supabase.auth.getUser() necesita
// (GET /auth/v1/user leyendo el header Authorization).
//
// Tokens de prueba reconocidos (ver asistente-proxy):
//   Bearer TOKEN_VALIDO    -> 200, usuaria de prueba
//   Bearer TOKEN_EXPIRADO  -> 401, token_expired
//   cualquier otro valor   -> 401, invalid_token
//   sin header             -> 401, no autorizado
import http from 'node:http';

const PORT = Number(process.env.PORT || 8788);

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/auth/v1/user')) {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token === 'TOKEN_VALIDO') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'usuaria-prueba-1', aud: 'authenticated', role: 'authenticated', email: 'prueba@cleo.local' }));
      return;
    }
    if (token === 'TOKEN_EXPIRADO') {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'token_expired', error_description: 'JWT expired' }));
      return;
    }
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid_token', error_description: 'invalid JWT' }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('fake-auth-asistente escuchando en http://127.0.0.1:' + PORT);
});
