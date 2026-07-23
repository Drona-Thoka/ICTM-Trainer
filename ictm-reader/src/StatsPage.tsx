import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import './App.css'

type Summary = {
  overall: { attempts: number; correct: number; accuracy: number }
  by_competition: Array<{ competition: string; attempts: number; correct: number; accuracy: number }>
  by_topic: Array<{ topic: string; attempts: number; correct: number; accuracy: number }>
  by_difficulty: Array<{ difficulty: string; attempts: number; correct: number; accuracy: number }>
}

export default function StatsPage() {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  // Distinguish "signed out" from "the request failed" â€” both used to render
  // the same misleading "sign in" message.
  const [signedIn, setSignedIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchStats() {
      const session = (await supabase.auth.getSession()).data.session
      if (cancelled) return
      setSignedIn(!!session)
      if (!session) {
        setData(null)
        setLoading(false)
        return
      }
      try {
        const res = await fetch('/api/stats/summary', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (cancelled) return
        if (res.ok) {
          setData(await res.json())
          setError(null)
        } else {
          setError(`Could not load your stats (${res.status}).`)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load your stats.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchStats()
    // Re-fetch when the user signs in or out while this page is open.
    const { data: sub } = supabase.auth.onAuthStateChange(() => fetchStats())
    return () => {
      cancelled = true
      sub?.subscription?.unsubscribe()
    }
  }, [])

  if (loading) return <div style={{ padding: 40 }}>Loading statsâ€¦</div>

  if (!signedIn) {
    return (
      <section style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div className="hero-card" style={{ maxWidth: 520, margin: '0 auto' }}>
          <h1 style={{ marginTop: 0 }}>Your Progress</h1>
          <p>Sign in to track your accuracy across competitions, topics, and difficulty.</p>
          <Link to="/auth" className="nav-button primary">Sign in</Link>
        </div>
      </section>
    )
  }

  if (error || !data) {
    return (
      <section style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div className="hero-card" style={{ maxWidth: 520, margin: '0 auto' }}>
          <h1 style={{ marginTop: 0 }}>Your Progress</h1>
          <p className="error">{error ?? 'Could not load your stats.'}</p>
          <Link to="/" className="nav-button">Back to Home</Link>
        </div>
      </section>
    )
  }

  const { overall, by_competition, by_topic, by_difficulty } = data

  if (overall.attempts === 0) {
    return (
      <section style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div className="hero-card" style={{ maxWidth: 520, margin: '0 auto' }}>
          <h1 style={{ marginTop: 0 }}>Your Progress</h1>
          <p>No data yet â€” answer a few problems and your stats will appear here.</p>
          <Link to="/comp-amc10" className="nav-button primary">Start practicing</Link>
        </div>
      </section>
    )
  }

  return (
    <section style={{ padding: '40px 20px', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center' }}>Your Progress</h1>

      {/* Summary Cards */}
      {/* Fixed 3 columns, not auto-fit: the headline numbers should always read
          as one horizontal row rather than reflowing onto separate lines. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 40 }}>
        <div className="hero-card" style={{ textAlign: 'center', padding: '20px 12px' }}>
          <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-h)', opacity: 0.7 }}>Attempts</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent)' }}>{overall.attempts}</div>
        </div>
        <div className="hero-card" style={{ textAlign: 'center', padding: '20px 12px' }}>
          <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-h)', opacity: 0.7 }}>Correct</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent)' }}>{overall.correct}</div>
        </div>
        <div className="hero-card" style={{ textAlign: 'center', padding: '20px 12px' }}>
          <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-h)', opacity: 0.7 }}>Accuracy</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent)' }}>{overall.accuracy}%</div>
        </div>
      </div>

      {/* By Competition */}
      {by_competition.length > 0 && (
        <div className="hero-card" style={{ marginBottom: 32 }}>
          <h2 style={{ marginTop: 0 }}>By Competition</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {by_competition.map((c) => (
              <div key={c.competition} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ minWidth: 100, fontWeight: 600 }}>{c.competition}</span>
                <span style={{ flex: 1, background: 'var(--border)', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${c.accuracy}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                </span>
                <span style={{ minWidth: 70, textAlign: 'right', fontWeight: 600 }}>{c.accuracy}%</span>
                <span style={{ minWidth: 80, textAlign: 'right', opacity: 0.6, fontSize: '0.9rem' }}>
                  {c.correct}/{c.attempts}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By Topic */}
      {by_topic.length > 0 && (
        <div className="hero-card" style={{ marginBottom: 32 }}>
          <h2 style={{ marginTop: 0 }}>By Topic</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {by_topic.map((t) => (
              <div key={t.topic} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ minWidth: 140, fontWeight: 600 }}>{t.topic}</span>
                <span style={{ flex: 1, background: 'var(--border)', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${t.accuracy}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                </span>
                <span style={{ minWidth: 70, textAlign: 'right', fontWeight: 600 }}>{t.accuracy}%</span>
                <span style={{ minWidth: 80, textAlign: 'right', opacity: 0.6, fontSize: '0.9rem' }}>
                  {t.correct}/{t.attempts}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By Difficulty */}
      {by_difficulty.length > 0 && (
        <div className="hero-card">
          <h2 style={{ marginTop: 0 }}>By Difficulty</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {by_difficulty.map((d) => (
              <div key={d.difficulty} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ minWidth: 100, fontWeight: 600, textTransform: 'capitalize' }}>{d.difficulty}</span>
                <span style={{ flex: 1, background: 'var(--border)', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${d.accuracy}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                </span>
                <span style={{ minWidth: 70, textAlign: 'right', fontWeight: 600 }}>{d.accuracy}%</span>
                <span style={{ minWidth: 80, textAlign: 'right', opacity: 0.6, fontSize: '0.9rem' }}>
                  {d.correct}/{d.attempts}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Link, not <a href>: a plain anchor forces a full page reload. */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <Link to="/" className="nav-button">Back to Home</Link>
      </div>
    </section>
  )
}