import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

export default function CompetitionGate({ competition, children }: {
  competition: 'ICTM' | 'NSML'
  children: ReactNode
}) {
  const [state, setState] = useState<'loading' | 'locked' | 'unlocked'>('loading')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endpoint = `/api/access/${competition}`

  useEffect(() => {
    let active = true
    const check = async () => {
      try {
        const response = await fetch(endpoint, { cache: 'no-store' })
        const body = await response.json()
        if (active) setState(response.ok && body.unlocked ? 'unlocked' : 'locked')
      } catch {
        if (active) setState('locked')
      }
    }
    void check()
    window.addEventListener('focus', check)
    const timer = window.setInterval(check, 60_000)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', check) }
  }, [endpoint])

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Unable to unlock.')
      setPassword('')
      setState('unlocked')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to unlock. Try again.')
    } finally { setBusy(false) }
  }

  async function lock() {
    setBusy(true)
    try {
      const response = await fetch(endpoint, { method: 'DELETE' })
      if (!response.ok) throw new Error('Unable to lock. Try again.')
      setState('locked')
      setError('')
    } catch {
      setError('Unable to lock. Try again.')
    } finally { setBusy(false) }
  }

  if (state === 'loading') return <p role="status">Loading…</p>
  if (state === 'unlocked') return <>
    <button className="nav-button" onClick={lock} disabled={busy}>Lock {competition}</button>
    {error && <p role="alert">{error}</p>}
    {children}
  </>
  return <section>
    <h1>{competition}</h1>
    <form onSubmit={unlock} style={{ maxWidth: '24rem', margin: '2rem auto', display: 'grid', gap: '1rem' }}>
      <label htmlFor={`password-${competition}`}>Enter the password to continue.</label>
      <input id={`password-${competition}`} type="password" autoComplete="current-password"
        required maxLength={1024} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
      <button className="nav-button primary" type="submit" disabled={busy}>{busy ? 'Unlocking…' : 'Unlock'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  </section>
}
