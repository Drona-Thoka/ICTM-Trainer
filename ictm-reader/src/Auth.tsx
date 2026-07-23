import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabaseClient'

type Summary = {
  overall: { attempts: number; correct: number; accuracy: number }
  by_competition: Array<{ competition: string; attempts: number; correct: number; accuracy: number }>
  by_topic: Array<{ topic: string; attempts: number; correct: number; accuracy: number }>
  by_difficulty: Array<{ difficulty: string; attempts: number; correct: number; accuracy: number }>
}

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Stats state
  const [stats, setStats] = useState<Summary | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setUser(data.user ?? null)
      if (data.user) {
        fetchStats(data.user)
      }
    })()
    const resp = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null)
        if (session?.user) {
          fetchStats(session.user)
        } else {
          setStats(null)
        }
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

  async function fetchStats(user: any) {
    setStatsLoading(true)
    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) return
      const token = session.access_token
      const res = await fetch('/api/stats/summary', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (e) {
      console.warn('Failed to fetch stats:', e)
    } finally {
      setStatsLoading(false)
    }
  }

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
    setStats(null)
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

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
              <button className="nav-button" onClick={handleSignOut}>
                Sign out
              </button>
            </div>

            {/* ---- Stats card ---- */}
            <div className="hero-card" style={{ maxWidth: '100%', padding: '20px' }}>
              <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>Your Progress</h2>
              {statsLoading ? (
                <p>Loading stats…</p>
              ) : stats && stats.overall.attempts > 0 ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 16 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.7 }}>Attempts</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>{stats.overall.attempts}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.7 }}>Correct</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>{stats.overall.correct}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.7 }}>Accuracy</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>{stats.overall.accuracy}%</div>
                    </div>
                  </div>

                  {/* Competition breakdown */}
                  {stats.by_competition.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>By Competition</div>
                      {stats.by_competition.map((c) => (
                        <div key={c.competition} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ minWidth: 80, fontSize: '0.85rem' }}>{c.competition}</span>
                          <span style={{ flex: 1, background: 'var(--border)', height: 6, borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${c.accuracy}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                          </span>
                          <span style={{ minWidth: 50, textAlign: 'right', fontSize: '0.85rem', fontWeight: 600 }}>{c.accuracy}%</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Topic breakdown */}
                  {stats.by_topic.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>By Topic</div>
                      {stats.by_topic.slice(0, 5).map((t) => (
                        <div key={t.topic} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ minWidth: 100, fontSize: '0.85rem' }}>{t.topic}</span>
                          <span style={{ flex: 1, background: 'var(--border)', height: 6, borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${t.accuracy}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                          </span>
                          <span style={{ minWidth: 50, textAlign: 'right', fontSize: '0.85rem', fontWeight: 600 }}>{t.accuracy}%</span>
                        </div>
                      ))}
                      {stats.by_topic.length > 5 && (
                        <div style={{ fontSize: '0.75rem', opacity: 0.6, textAlign: 'center', marginTop: 4 }}>
                          + {stats.by_topic.length - 5} more topics
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p style={{ color: 'var(--text-h)', opacity: 0.7, fontStyle: 'italic' }}>
                  No data available – start practicing to see your stats.
                </p>
              )}
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