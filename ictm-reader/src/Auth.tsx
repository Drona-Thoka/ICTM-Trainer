import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    // load current user on mount
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setUser(data.user ?? null)
    })()
    const resp = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    // resp may have shape { data: { subscription } } or { data: subscription }
    return () => {
      mounted = false
      try {
        // safe unsubscribe handling
        const sub = (resp as any).data?.subscription ?? (resp as any).data ?? resp
        if (sub && typeof sub.unsubscribe === 'function') sub.unsubscribe()
        else if (sub && typeof sub.subscription?.unsubscribe === 'function') sub.subscription.unsubscribe()
      } catch (e) {
        // ignore unsubscribe errors
      }
    }
  }, [])

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const { data, error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) setMessage(error.message)
    else setMessage('Check your email for confirmation (if enabled).')
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setMessage(error.message)
    else setMessage('Signed in')
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setMessage('Signed out')
    setUser(null)
  }

  return (
    <section style={{ padding: 16 }}>
      <h1>Account</h1>

      {user ? (
        <div>
          <p>Signed in as <strong>{user.email}</strong></p>
          <button className="nav-button" onClick={handleSignOut}>Sign out</button>
        </div>
      ) : (
        <div style={{ maxWidth: 420 }}>
          <form onSubmit={handleSignIn} style={{ display: 'grid', gap: 8 }}>
            <label>
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="nav-button primary" onClick={handleSignIn} disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
              <button className="nav-button" onClick={handleSignUp} disabled={loading}>
                {loading ? 'Signing up…' : 'Sign up'}
              </button>
            </div>
          </form>
        </div>
      )}

      {message && <p style={{ marginTop: 12 }}>{message}</p>}
    </section>
  )
}
