import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import PasswordFields, { inputStyle, passwordProblem } from './PasswordFields'

// Progress lives on /stats (StatsPage), which shows the full breakdown
// including difficulty and every topic. This page handles the account only.

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [mode, setMode] = useState<'signin' | 'forgot'>('signin')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setUser(data.user ?? null)
    })()
    const resp = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null)
      }
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

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    // Origin-derived so this works in dev and production without a build-time
    // constant. The URL must also be allowlisted in Supabase's Redirect URLs,
    // or Supabase ignores it and sends the user to the Site URL instead.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    // Deliberately the same response whether or not the account exists —
    // Supabase does not distinguish, and neither should our UI, or it becomes
    // an account-enumeration oracle.
    setMessage('If an account exists for that email, a reset link is on its way.')
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(newPassword, confirmPassword)
    if (problem) {
      setMessage(problem)
      return
    }
    setLoading(true)
    setMessage(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setNewPassword('')
    setConfirmPassword('')
    setMessage('Password updated.')
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setMessage('Signed out')
    setUser(null)
  }

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
      <div className="hero-card" style={{ maxWidth: '600px', width: '100%' }}>
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

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '24px' }}>
              <Link to="/stats" className="nav-button primary">
                View your progress
              </Link>
              <button className="nav-button" onClick={handleSignOut}>
                Sign out
              </button>
            </div>

            <form
              onSubmit={handleChangePassword}
              style={{ display: 'grid', gap: 16, textAlign: 'left', marginTop: 8 }}
            >
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Change password</h2>
              <PasswordFields
                password={newPassword}
                confirm={confirmPassword}
                onPasswordChange={setNewPassword}
                onConfirmChange={setConfirmPassword}
                disabled={loading}
              />
              <button
                type="submit"
                className="nav-button primary"
                disabled={loading || !!passwordProblem(newPassword, confirmPassword)}
              >
                {loading ? 'Saving…' : 'Update password'}
              </button>
            </form>
          </>
        ) : mode === 'forgot' ? (
          <form onSubmit={handleForgotPassword} style={{ display: 'grid', gap: '16px' }}>
            <p style={{ margin: 0, textAlign: 'left' }}>
              Enter your email and we’ll send you a link to set a new password.
            </p>
            <label style={{ textAlign: 'left', fontWeight: '600' }}>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
            </label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="submit" className="nav-button primary" disabled={loading || !email}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <button
                type="button"
                className="nav-button"
                onClick={() => {
                  setMode('signin')
                  setMessage(null)
                }}
              >
                Back to sign in
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignIn} style={{ display: 'grid', gap: '16px' }}>
            <label style={{ textAlign: 'left', fontWeight: '600' }}>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ textAlign: 'left', fontWeight: '600' }}>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
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

            <button
              type="button"
              onClick={() => {
                setMode('forgot')
                setMessage(null)
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--accent)',
                cursor: 'pointer',
                textDecoration: 'underline',
                font: 'inherit',
                fontSize: '0.9rem',
              }}
            >
              Forgot password?
            </button>
          </form>
        )}

        {message && (
          <p style={{ marginTop: '16px', color: 'var(--accent)' }}>{message}</p>
        )}
      </div>
    </section>
  )
}
