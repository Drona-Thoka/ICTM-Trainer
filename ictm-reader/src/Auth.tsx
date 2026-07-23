import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setUser(data.user ?? null)
    })()
    const resp = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => {
      mounted = false
      try {
        const sub = (resp as any).data?.subscription ?? (resp as any).data ?? resp
        if (sub && typeof sub.unsubscribe === 'function') sub.unsubscribe()
        else if (sub && typeof sub.subscription?.unsubscribe === 'function') sub.subscription.unsubscribe()
      } catch (e) {
        // ignore
      }
    }
  }, [])

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const { error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) setMessage(error.message)
    else setMessage('Check your email for confirmation (if enabled).')
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setMessage(error.message)
    else setMessage('Signed in')
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setMessage('Signed out')
    setUser(null)
  }

  // Get initials for avatar
  const getInitials = (email: string) => {
    return email
      .split('@')[0]
      .split('.')
      .map((p) => p[0]?.toUpperCase())
      .join('')
      .slice(0, 2)
  }

  return (
    <section style={{ display: 'flex', justifyContent: 'center', padding: '40px 20px' }}>
      <div className="hero-card" style={{ maxWidth: '480px', width: '100%' }}>
        <h1 style={{ marginTop: 0 }}>Account</h1>

        {user ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '24px' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #153E21 0%, #065f46 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: '700',
                  fontSize: '24px',
                  flexShrink: 0,
                  border: '2px solid #16a34a',
                }}
              >
                {getInitials(user.email)}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--text-h)' }}>
                  Welcome,
                </div>
                <div style={{ fontSize: '1.1rem', color: 'var(--text-h)', wordBreak: 'break-word' }}>
                  {user.email}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="nav-button" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSignIn} style={{ display: 'grid', gap: '16px' }}>
            <label style={{ textAlign: 'left', fontWeight: '600' }}>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: '#ffffff',
                  color: '#000000',
                  boxSizing: 'border-box',
                  marginTop: '4px',
                }}
              />
            </label>
            <label style={{ textAlign: 'left', fontWeight: '600' }}>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: '#ffffff',
                  color: '#000000',
                  boxSizing: 'border-box',
                  marginTop: '4px',
                }}
              />
            </label>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="submit"
                className="nav-button primary"
                disabled={loading}
                onClick={handleSignIn}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
              <button
                type="button"
                className="nav-button"
                disabled={loading}
                onClick={handleSignUp}
              >
                {loading ? 'Signing up…' : 'Sign up'}
              </button>
            </div>
          </form>
        )}

        {message && (
          <p style={{ marginTop: '16px', color: 'var(--accent)' }}>{message}</p>
        )}
      </div>
    </section>
  )
}