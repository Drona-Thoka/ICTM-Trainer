import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/** False when the VITE_SUPABASE_* build vars were missing: auth/stats are off. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  console.warn(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. Sign-in and stats ' +
      'are disabled; practice still works. These are read at BUILD time, so a ' +
      'deployment must be rebuilt after adding them.',
  )
}

// createClient throws on an empty URL, and this module is imported by App.tsx —
// so an unset variable used to take the whole page down with a blank screen
// before React could render. Fall back to a syntactically valid placeholder:
// auth calls then fail on their own (already handled everywhere they are made)
// instead of killing the problem trainer, which needs no credentials at all.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
)

export default supabase
