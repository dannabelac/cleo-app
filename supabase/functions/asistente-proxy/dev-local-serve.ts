// SOLO PRUEBA LOCAL -- este archivo NUNCA se despliega. Supabase toma
// únicamente index.ts como punto de entrada de la función `asistente-proxy`.
//
// Importa el mismo handler que exporta index.ts (sin duplicar su lógica) y
// lo sirve con Deno directo, restringido a 127.0.0.1 -- así la prueba local
// corre exactamente el mismo código que se desplegaría.
import mod from './index.ts';

Deno.serve({ hostname: '127.0.0.1', port: Number(Deno.env.get('PORT') ?? '8787') }, mod.fetch);
