// Temporary safety gate for this review branch. Production release requires review.
if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) {
  const valid = process.env.VERCEL_ENV === 'preview'
    && process.env.VITE_SUPABASE_URL === 'https://pconfadsbtwjbjeblxgl.supabase.co'
    && process.env.VITE_SUPABASE_ANON_KEY === 'sb_publishable_DbLeSS6Nu7cNe4WPiSmL8g_kZ-YPOas';
  if (!valid) {
    console.error('Vista previa bloqueada: esta rama solo permite Preview con la URL y clave publica de CLEO Pruebas. No modificar Production.');
    process.exit(1);
  }
}
