// Fail closed if a Vercel deployment points to the wrong Supabase project.
function validateDeployment(env) {
  if (env.VERCEL !== '1' && !env.VERCEL_ENV) return;
  const preview = env.VERCEL_ENV === 'preview';
  const production = env.VERCEL_ENV === 'production';
  if (!preview && !production) throw new Error('Entorno Vercel no permitido');
  const ref = preview ? 'pconfadsbtwjbjeblxgl' : 'gpvpvkeqfcgypuoxvjne';
  if (env.VITE_SUPABASE_URL !== `https://${ref}.supabase.co`) {
    throw new Error('La URL de Supabase no corresponde al entorno de despliegue');
  }
  const key = env.VITE_SUPABASE_ANON_KEY || '';
  if (preview) {
    if (key !== 'sb_publishable_DbLeSS6Nu7cNe4WPiSmL8g_kZ-YPOas') {
      throw new Error('Preview requiere la clave publica de CLEO Pruebas');
    }
  } else if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    let payload;
    try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); }
    catch { throw new Error('Production requiere una clave publica de Supabase'); }
    if (payload.role !== 'anon' || payload.ref !== ref) {
      throw new Error('La clave de Production no es anon del proyecto correcto');
    }
  }
}
module.exports = { validateDeployment };
if (require.main === module) {
  try { validateDeployment(process.env); }
  catch (error) { console.error('Despliegue bloqueado: ' + error.message); process.exit(1); }
}
