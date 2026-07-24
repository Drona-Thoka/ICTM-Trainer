import { createClient } from '@supabase/supabase-js'

/** Tolerate the usual dashboard paste mistakes: surrounding whitespace/quotes,
 *  and a leading "=" from copying `KEY=value` starting at the equals sign. */
function cleanEnv(raw: string | undefined): string {
  return (raw ?? '')
    .trim()
    .replace(/^=+/, '')
    .replace(/^["']|["']$/g, '')
    .trim()
}

const supabaseUrl = cleanEnv(import.meta.env.VITE_SUPABASE_URL)
const supabaseAnonKey = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY)

function isValidUrl(u: string): boolean {
  try {
    return Boolean(new URL(u).protocol.startsWith('http'))
  } catch {
    return false
  }
}

/** False when the VITE_SUPABASE_* build vars are missing or malformed. */
export const isSupabaseConfigured = Boolean(supabaseAnonKey) && isValidUrl(supabaseUrl)

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase is not configured, so sign-in and stats are disabled; practice ' +
      'still works. VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are read at ' +
      'BUILD time, so a deployment must be rebuilt after changing them. ' +
      `Received URL: ${JSON.stringify(import.meta.env.VITE_SUPABASE_URL ?? null)}`,
  )
}

// createClient throws on a missing OR malformed URL, and this module is imported
// by App.tsx — so one bad character in a dashboard env var took the whole page
// down with a blank screen before React could render. Fall back to a valid
// placeholder: auth calls then fail on their own (already handled everywhere
// they are made) instead of killing the problem trainer, which needs no
// credentials at all.
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder-anon-key',
)

export default supabase
