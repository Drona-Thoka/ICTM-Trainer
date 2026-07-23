import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

if (!supabaseUrl || !supabaseAnonKey) {
  // In dev this helps surface a missing env config quickly.
  console.warn('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default supabase
