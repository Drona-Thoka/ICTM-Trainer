import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import PasswordFields, { passwordProblem } from './PasswordFields'

// Captured at module load, before supabase-js parses and strips the URL. The
// client processes the hash asynchronously during init, so reading it inside a
// useEffect can find it already gone — taking the error details with it.
const INITIAL_HASH = typeof window !== 'undefined' ? window.location.hash : ''

/** Pull the error out of a recovery redirect, if it failed. */
function hashError(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  if (!params.get('error') && !params.get('error_code')) return null
  const code = params.get('error_code')
  if (code === 'otp_expired') {
    return 'This reset link has expired. Reset links are single-use and time-limited.'
  }
  return params.get('error_description')?.replace(/\+/g, ' ') ?? 'This reset link is not valid.'
}

type Status = 'checking' | 'ready' | 'invalid' | 'saving' | 'done'

export default function ResetPassword() {
  const [status, setStatus] = useState<Status>('checking')
  const [message, setMessage] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  useEffect(() => {
    const linkError = hashError(INITIAL_HASH)
    if (linkError) {
      setMessage(linkError)
      setStatus('invalid')
      return
    }

    let settled = false

    // The session is the source of truth, not the PASSWORD_RECOVERY event:
    // that event can fire before this component mounts, and waiting for it
    // alone would intermittently reject a perfectly good link.
    supabase.auth.getSession().then(({ data }) => {
      if (settled) return
      if (data.session) {
        settled = true
        setStatus('ready')
      }
    })

    // ...but it can also arrive after mount, so listen as well.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (settled || !session) return
      settled = true
      setStatus('ready')
    })

    // Neither arrived: the page was opened directly, not from a reset link.
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      setMessage('Open this page from the reset link in your email.')
      setStatus('invalid')
    }, 3000)

    return () => {
      clearTimeout(timer)
      sub?.subscription?.unsubscribe()
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(password, confirm)
    if (problem) {
      setMessage(problem)
      return
    }
    setStatus('saving')
    setMessage(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setMessage(error.message)
      setStatus('ready')
      return
    }
    setStatus('done')
  }

  const card = (children: React.ReactNode) => (
    <section style={{ display: 'flex', justifyContent: 'center', padding: '40px 20px' }}>
      <div className="hero-card" style={{ maxWidth: 480, width: '100%' }}>
        <h1 style={{ marginTop: 0 }}>Reset password</h1>
        {children}
      </div>
    </section>
  )

  if (status === 'checking') return card(<p>Checking your reset link…</p>)

  if (status === 'invalid') {
    return card(
      <>
        <p className="error">{message}</p>
        <Link to="/auth" className="nav-button primary">
          Request a new link
        </Link>
      </>,
    )
  }

  if (status === 'done') {
    return card(
      <>
        <p>Your password has been updated, and you are signed in.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to="/" className="nav-button primary">
            Back to home
          </Link>
          <Link to="/stats" className="nav-button">
            My progress
          </Link>
        </div>
      </>,
    )
  }

  return card(
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
      <p style={{ margin: 0 }}>Choose a new password for your account.</p>
      <PasswordFields
        password={password}
        confirm={confirm}
        onPasswordChange={setPassword}
        onConfirmChange={setConfirm}
        disabled={status === 'saving'}
      />
      <button
        type="submit"
        className="nav-button primary"
        disabled={status === 'saving' || !!passwordProblem(password, confirm)}
      >
        {status === 'saving' ? 'Saving…' : 'Set new password'}
      </button>
      {message && <p className="error" style={{ margin: 0 }}>{message}</p>}
    </form>,
  )
}
