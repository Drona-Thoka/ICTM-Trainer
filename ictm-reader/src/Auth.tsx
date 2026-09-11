import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import PasswordFields, { inputStyle, passwordProblem } from './PasswordFields'
import { getAuthRedirectUrl } from './authRedirect'

// Progress lives on /stats (StatsPage), which shows the full breakdown
// including difficulty and every topic. This page handles the account only.

export default function Auth() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [mode, setMode] = useState<'signin' | 'forgot'>('signin')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const redirectUrl = (path = '/') =>
    getAuthRedirectUrl(
      import.meta.env.VITE_SITE_URL || 'https://ictm-trainer.vercel.app',
      window.location.origin,
      path,
    )

  async function runAuth(action: () => Promise<void>) {
    if (loading) return
    setLoading(true)
    setMessage(null)
    try {
      await action()
    } catch {
      setMessage('Unable to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

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
        resp.data?.subscription?.unsubscribe()
      } catch {
        // ignore
      }
    }
  }, [])

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    const form = (e.currentTarget as HTMLElement).closest('form')
    if (form && !form.reportValidity()) return
    const problem = passwordProblem(password, password)
    if (problem) {
      setMessage(problem)
      return
    }
    await runAuth(async () => {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectUrl(),
        },
      })
      if (error) setMessage(error.message)
      else setMessage('Check your email for confirmation (if enabled).')
    })
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    await runAuth(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        setMessage(error.message)
      } else {
        setMessage('Signed in')
        navigate('/')
      }
    })
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    await runAuth(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl('/reset-password'),
      })
      if (error) {
        setMessage('Unable to send a reset email. Please try again in a few minutes.')
        return
      }
      // Keep the success response identical whether or not the account exists.
      setMessage('If an account exists for that email, a reset link is on its way.')
    })
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(newPassword, confirmPassword)
    if (problem) {
      setMessage(problem)
      return
    }
    await runAuth(async () => {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        setMessage(error.message)
        return
      }
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Password updated.')
    })
  }

  async function handleSignOut() {
    await runAuth(async () => {
      const { error } = await supabase.auth.signOut()
      if (error) {
        setMessage('Unable to sign out. Please try again.')
        return
      }
      setMessage('Signed out')
      setUser(null)
    })
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
                {getInitials(user.email ?? '')}
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
              <button className="nav-button" onClick={handleSignOut} disabled={loading}>
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
                required
                autoComplete="email"
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
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ textAlign: 'left', fontWeight: '600' }}>
              Password
              <input
                type="password"
                required
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
          <p role="status" style={{ marginTop: '16px', color: 'var(--accent)' }}>{message}</p>
        )}
      </div>
    </section>
  )
}
