import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Falla rápido y claro si el .env no está configurado, en vez de un error
  // críptico de supabase-js más adelante.
  throw new Error(
    'Faltan variables de entorno de Supabase. Revisa que tu .env tenga ' +
    'VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY, y reinicia el servidor de Vite.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
