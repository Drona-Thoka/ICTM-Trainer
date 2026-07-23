import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import MathText from './MathText'
import './App.css'
import Auth from './Auth'
import StatsPage from './StatsPage'
import ResetPassword from './ResetPassword'
import { ALL_EVENTS, ALL_LEVELS, ALL_TOPICS, useIctmEvents, useTopics } from './useFilterOptions'
import { supabase } from './supabaseClient'
import { ThemeProvider, useTheme } from './ThemeContext'

// ---- API types (see ICTM-Trainer/app.py) ---------------------------------

type Problem = {
  problem_id: number
  competition: string
  competition_name: string
  answer_format: 'numeric' | 'multiple_choice'
  problem_text: string
  choices: Record<string, string> | null
  image_url: string | null
  event: string | null
  year: number | null
  problem_number: number | null
  difficulty: 'easy' | 'medium' | 'hard'
  topics: string[]
}

type CheckResult = {
  correct: boolean
  correct_answer: string | null
  solution_text: string | null
}

// Filter options are fetched from the bank (see useFilterOptions.ts). The
// curated topic/event lists that used to live here had drifted out of sync with
// the data and silently filtered nothing; git history has them if the curated
// taxonomy is ever revived.
const gradeOptions = ['9', '10', '11', '12']

// ICTM team events are graded as a whole round, so per-topic filtering is
// meaningless there — the topic control is hidden for them.
function isTeamEvent(event: string | null): boolean {
  return !!event && /team|person/i.test(event)
}

/** Topic <select> driven by whatever the bank actually has tagged. */
function TopicSelect({
  competition,
  events,
  value,
  onChange,
}: {
  competition: string
  events?: string[] | null
  value: string
  onChange: (v: string) => void
}) {
  const topics = useTopics(competition, events)

  return (
    <label className="control-group">
      <span>Topic</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={ALL_TOPICS}>{ALL_TOPICS}</option>
        {topics.map((t) => (
          <option key={t.name} value={t.name}>
            {t.name} ({t.count})
          </option>
        ))}
      </select>
    </label>
  )
}

// Map each competition's native difficulty label onto the backend's tier param.
// Anything unrecognized (including "All") means "no difficulty filter".
function toTier(label: string | null): 'easy' | 'medium' | 'hard' | null {
  if (!label) return null
  const l = label.toLowerCase()
  if (l === 'easy' || l === 'medium' || l === 'hard') return l
  // NSML Q1..Q5
  if (l === 'q1' || l === 'q2') return 'easy'
  if (l === 'q3' || l === 'q4') return 'medium'
  if (l === 'q5') return 'hard'
  return null
}

// Helper: get initials from email
function getInitials(email: string): string {
  return email
    .split('@')[0]
    .split('.')
    .map((p) => p[0]?.toUpperCase())
    .join('')
    .slice(0, 2)
}

// ---- Practice widget (real problems, answer checking, LaTeX) --------------

type PracticeProps = {
  competition: string
  difficulty: string | null // native label; mapped to a tier here
  topic: string | null
  events: string[] | null // stored comp_event values, or null for no event filter
}

function Practice({ competition, difficulty, topic, events }: PracticeProps) {

  // Year range: bounds come from the data, so the slider widens as more
  // contests are ingested. null bounds = this competition has no year data.
  const [bounds, setBounds] = useState<{ min: number; max: number } | null>(null)
  const [years, setYears] = useState<[number, number] | null>(null)

  const [problem, setProblem] = useState<Problem | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle')
  const [error, setError] = useState<string | null>(null)

  const [answer, setAnswer] = useState<string>('')
  const [result, setResult] = useState<CheckResult | null>(null)
  const [overridden, setOverridden] = useState(false)
  const [checking, setChecking] = useState(false)
  // The in-flight "record this attempt" request. Held as a promise rather than
  // state because getSession() can stall for seconds refreshing the token, and
  // the override button is clickable the moment the result renders — a click in
  // that window would otherwise find no row id and silently do nothing.
  const recordRef = useRef<Promise<string | number | null> | null>(null)

  const [score, setScore] = useState({ correct: 0, total: 0 })

  useEffect(() => {
    let cancelled = false
    setBounds(null)
    setYears(null)
    fetch(`/api/years?competition=${encodeURIComponent(competition)}`)
      .then((r) => r.json())
      .then((b: { min: number | null; max: number | null }) => {
        if (cancelled || b.min == null || b.max == null) return
        setBounds({ min: b.min, max: b.max })
        setYears([b.min, b.max])
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [competition])

  async function fetchProblem() {
    setStatus('loading')
    setError(null)
    setProblem(null)
    setAnswer('')
    setResult(null)
    setOverridden(false)
    recordRef.current = null

    const params = new URLSearchParams({ competition })
    const tier = toTier(difficulty)
    if (tier) params.set('difficulty', tier)
    // Options come from the bank, so any selection here is a real tag.
    if (topic && topic !== ALL_TOPICS) params.set('topic', topic)
    for (const e of events ?? []) params.append('event', e)
    // Only send the range when it's narrower than everything available.
    if (years && bounds && (years[0] > bounds.min || years[1] < bounds.max)) {
      params.set('year_min', String(years[0]))
      params.set('year_max', String(years[1]))
    }

    try {
      const res = await fetch(`/api/problems/random?${params.toString()}`)
      if (res.status === 404) {
        setStatus('empty')
        return
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      setProblem(await res.json())
      setStatus('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setStatus('error')
    }
  }

  // Saves the attempt for signed-in users and resolves to its row id (null when
  // signed out or the save failed). Never throws — stats must not break practice.
  async function recordAttempt(p: Problem, correct: boolean): Promise<string | number | null> {
    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) return null
      const rec = await fetch('/api/stats/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          problem_id: p.problem_id,
          competition: p.competition,
          topic: p.topics[0] || 'Unknown',
          difficulty: p.difficulty,
          correct,
        }),
      })
      if (!rec.ok) return null
      const saved = await rec.json()
      return saved?.id ?? null
    } catch (e) {
      console.warn('Failed to record stats:', e)
      return null
    }
  }

  async function submitAnswer() {
    if (!problem || !answer.trim() || result) return
    setChecking(true)
    try {
      const res = await fetch(`/api/problems/${problem.problem_id}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const data: CheckResult = await res.json()
      setResult(data)
      setScore((s) => ({ correct: s.correct + (data.correct ? 1 : 0), total: s.total + 1 }))

      // Record the attempt. Kicked off without awaiting so a slow token
      // refresh never delays the UI; markCorrect() awaits this same promise.
      recordRef.current = recordAttempt(problem, data.correct)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setChecking(false)
    }
  }

  // Quizlet-style self-grade override: count a wrong-marked answer as correct.
  // The attempt was already recorded with the checker's verdict, so amend that
  // row too — otherwise the saved accuracy disagrees with the score on screen.
  async function markCorrect() {
    if (!result || result.correct || overridden) return
    setOverridden(true)
    setScore((s) => ({ ...s, correct: s.correct + 1 }))

    try {
      // The attempt may still be saving; wait for its id rather than giving up.
      const attemptId = await recordRef.current
      if (attemptId == null) return
      const session = (await supabase.auth.getSession()).data.session
      if (!session) return
      await fetch(`/api/stats/attempts/${encodeURIComponent(String(attemptId))}/override`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
    } catch (e) {
      // Never block the UI on stats bookkeeping.
      console.warn('Failed to persist override:', e)
    }
  }

  const graded = result !== null
  const isCorrect = graded && (result!.correct || overridden)
  const accuracy = score.total ? Math.round((score.correct / score.total) * 100) : 0
  const choiceEntries = useMemo(
    () => (problem?.choices ? Object.entries(problem.choices) : []),
    [problem],
  )

  return (
    <>
      {bounds && years && bounds.min < bounds.max && (
        <div className="year-range">
          <span className="year-range-label">
            Years <strong>{years[0]}</strong>–<strong>{years[1]}</strong>
          </span>
          <div className="year-range-sliders">
            <input
              type="range"
              aria-label="Earliest year"
              min={bounds.min}
              max={bounds.max}
              value={years[0]}
              onChange={(e) => {
                const v = Number(e.target.value)
                setYears((prev) => (prev ? [Math.min(v, prev[1]), prev[1]] : prev))
              }}
            />
            <input
              type="range"
              aria-label="Latest year"
              min={bounds.min}
              max={bounds.max}
              value={years[1]}
              onChange={(e) => {
                const v = Number(e.target.value)
                setYears((prev) => (prev ? [prev[0], Math.max(v, prev[0])] : prev))
              }}
            />
          </div>
        </div>
      )}

      <div className="practice-bar">
        <button type="button" className="nav-button primary" onClick={fetchProblem}>
          {problem ? 'New problem' : 'Get problem'}
        </button>
        <span className="score-badge" aria-live="polite">
          <strong>{score.correct}</strong> / {score.total} &middot; {accuracy}%
        </span>
      </div>

      <div className="question-card">
        <div className="question-card-header">
          <div>
            <p className="question-eyebrow">Question area</p>
            <h2>Practice question</h2>
          </div>
          {problem && (
            <span className="question-meta">
              {[problem.event, problem.year, problem.difficulty].filter(Boolean).join(' • ')}
            </span>
          )}
        </div>

        <div className="question-card-body">
          {status === 'loading' && <p className="question-placeholder">Loading question…</p>}
          {status === 'error' && <p className="error">Failed to load: {error}</p>}
          {status === 'empty' && (
            <p className="question-placeholder">No problems available yet for these filters.</p>
          )}
          {status === 'idle' && !problem && (
            <p className="question-placeholder">Hit “Get problem” to begin.</p>
          )}

          {status === 'idle' && problem && (
            <>
              <div className="problem-text">
                <MathText>{problem.problem_text}</MathText>
              </div>

              {problem.image_url && (
                <img className="problem-image" src={problem.image_url} alt="problem diagram" />
              )}

              {problem.topics.length > 0 && (
                <div className="topic-chips">
                  {problem.topics.map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {problem.answer_format === 'multiple_choice' && choiceEntries.length > 0 ? (
                <div className="choices">
                  {choiceEntries.map(([letter, value]) => (
                    <button
                      key={letter}
                      type="button"
                      disabled={graded}
                      className={`choice ${answer === letter ? 'selected' : ''} ${
                        graded && result!.correct_answer?.toUpperCase() === letter ? 'is-answer' : ''
                      }`}
                      onClick={() => setAnswer(letter)}
                    >
                      <span className="choice-letter">{letter}</span>
                      <MathText math className="choice-value">
                        {value}
                      </MathText>
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  className="answer-input"
                  type="text"
                  placeholder="Your answer"
                  value={answer}
                  disabled={graded}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
                />
              )}

              {!graded && (
                <button
                  type="button"
                  className="nav-button primary"
                  disabled={!answer.trim() || checking}
                  onClick={submitAnswer}
                >
                  {checking ? 'Checking…' : 'Check answer'}
                </button>
              )}

              {graded && (
                <div className={`result ${isCorrect ? 'result-correct' : 'result-wrong'}`}>
                  <p className="result-headline">
                    {isCorrect
                      ? overridden
                        ? 'Counted as correct (you overrode)'
                        : 'Correct!'
                      : 'Incorrect'}
                  </p>
                  <p className="result-answer">
                    Answer: <MathText math>{result!.correct_answer}</MathText>
                  </p>

                  {!result!.correct && !overridden && (
                    <button type="button" className="override-button" onClick={markCorrect}>
                      I was correct — count it
                    </button>
                  )}

                  {result!.solution_text && (
                    <details className="solution">
                      <summary>Show solution</summary>
                      <div className="solution-text">
                        <MathText>{result!.solution_text}</MathText>
                      </div>
                    </details>
                  )}

                  <button type="button" className="nav-button primary" onClick={fetchProblem}>
                    Next problem
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ---- Profile Avatar (top-left header with mini welcome card) -------------

function ProfileAvatar({ user }: { user: any }) {
  const initials = user?.email ? getInitials(user.email) : 'U'

  if (!user) {
    return (
      <Link to="/auth" className="profile-avatar" title="Sign in">
        <span className="avatar-inner">{initials}</span>
      </Link>
    )
  }

  return (
    <Link to="/auth" className="profile-avatar-card" title={user.email}>
      <span className="avatar-inner">{initials}</span>
      <div className="user-info">
        <span className="welcome-label">Welcome,</span>
        <span className="user-name">{user.email.split('@')[0]}</span>
      </div>
    </Link>
  )
}

// ---- Theme Toggle (moved before App) --------------------------------------

type Theme = 'light' | 'dark' | 'system'

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)

  const options: Theme[] = ['light', 'dark', 'system']
  const labels: Record<Theme, string> = { light: 'Light', dark: 'Dark', system: 'System' }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: '999px',
          padding: '6px 12px',
          cursor: 'pointer',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: 'var(--text-h)',
        }}
      >
        <span style={{ fontSize: '0.75rem', fontWeight: '600' }}>
          {labels[theme]}
        </span>
      </button>
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: 'var(--shadow)',
            padding: '6px 0',
            minWidth: '140px',
            zIndex: 100,
          }}
        >
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                setTheme(opt)
                setIsOpen(false)
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 16px',
                background: 'transparent',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '0.9rem',
                color: theme === opt ? 'var(--accent)' : 'var(--text-h)',
                fontWeight: theme === opt ? '700' : '400',
              }}
            >
              {labels[opt]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Home ----------------------------------------------------------------

function Home({ user }: { user: any }) {
  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <section id="home-page" className="home-hero">
      <div className="hero-card" style={{ textAlign: 'left' }}>
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
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Link to="/comp-amc10" className="nav-button primary">
                Start with AMC 10
              </Link>
              <button className="nav-button" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 style={{ marginTop: 0 }}>Learn AMC, AIME, NSML, and ICTM.</h1>
            <p className="hero-copy">
              Practice real past-contest problems by competition, topic, and difficulty. Answer, check
              your work, and reveal full solutions. Pick a competition below to begin.
            </p>
            <div className="hero-actions" style={{ justifyContent: 'center' }}>
              <Link to="/comp-amc10" className="nav-button primary">
                Start with AMC 10
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

// ---- AMC 10 / AMC 12 / AIME (difficulty + topic) -------------------

const difficulties = ['all', 'easy', 'medium', 'hard'] as const
type Difficulty = (typeof difficulties)[number]

function CompPage({ title, description, competition }: { title: string; description: string; competition: string }) {
  const [diff, setDiff] = useState<Difficulty>('all')
  const [selectedTopic, setSelectedTopic] = useState(ALL_TOPICS)

  return (
    <section id="comp-page">
      <h1>{title}</h1>
      <p>{description}</p>

      <div className="diff-buttons">
        {difficulties.map((value) => (
          <button
            key={value}
            type="button"
            className={`diff-button ${diff === value ? 'active' : ''}`}
            onClick={() => setDiff(value)}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="control-row">
        <TopicSelect competition={competition} value={selectedTopic} onChange={setSelectedTopic} />
      </div>

      <Practice competition={competition} difficulty={diff} topic={selectedTopic} events={null} />

      <div className="button-row">
        <Link to="/" className="nav-button">
          Back to home
        </Link>
      </div>
    </section>
  )
}

// ---- NSML (grade + Q1–Q5 + topics) ----------------------------------------

function NsmlPage({ title, description }: { title: string; description: string }) {
  const nsmlDiffs = ['All', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5']
  const [selectedDiff, setSelectedDiff] = useState<string>('All')
  // The schema has no grade dimension, so this selects nothing today; kept
  // because NSML data isn't ingested yet and grade is how the meets are run.
  const [selectedGrade, setSelectedGrade] = useState('10')
  const [selectedTopic, setSelectedTopic] = useState(ALL_TOPICS)

  return (
    <section id="comp-page">
      <h1>{title}</h1>
      <p>{description}</p>

      <div className="diff-buttons">
        {nsmlDiffs.map((d) => (
          <button
            key={d}
            type="button"
            className={`diff-button ${selectedDiff === d ? 'active' : ''}`}
            onClick={() => setSelectedDiff(d)}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="control-row">
        <label className="control-group">
          <span>Grade</span>
          <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)}>
            {gradeOptions.map((grade) => (
              <option key={grade} value={grade}>
                Grade {grade}
              </option>
            ))}
          </select>
        </label>
        <TopicSelect competition="NSML" value={selectedTopic} onChange={setSelectedTopic} />
      </div>

      <Practice competition="NSML" difficulty={selectedDiff} topic={selectedTopic} events={null} />

      <div className="button-row">
        <Link to="/" className="nav-button">
          Back to home
        </Link>
      </div>
    </section>
  )
}

// ---- ICTM (event + difficulty + per-event topics) -------------------------

function IctmPage({ title, description }: { title: string; description: string }) {
  // The bank stores level and event fused into one string ("Regional Algebra I");
  // useIctmEvents splits them so they can be chosen separately.
  const { levels, eventNames, resolve } = useIctmEvents()
  const [level, setLevel] = useState(ALL_LEVELS)
  const [eventName, setEventName] = useState(ALL_EVENTS)
  const ictmDiffs = ['All', 'Easy', 'Medium', 'Hard']
  const [selectedDiff, setSelectedDiff] = useState<string>('All')
  const [selectedTopic, setSelectedTopic] = useState(ALL_TOPICS)

  // Null when nothing is narrowed, so no event filter is sent at all.
  const selectedEvents =
    level === ALL_LEVELS && eventName === ALL_EVENTS ? null : resolve(level, eventName)
  const teamRound = isTeamEvent(eventName)

  return (
    <section id="comp-page">
      <h1>{title}</h1>
      <p>{description}</p>

      <div className="diff-buttons">
        {ictmDiffs.map((d) => (
          <button
            key={d}
            type="button"
            className={`diff-button ${selectedDiff === d ? 'active' : ''}`}
            onClick={() => setSelectedDiff(d)}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="control-row">
        <label className="control-group">
          <span>Level</span>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value={ALL_LEVELS}>{ALL_LEVELS}</option>
            {levels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <label className="control-group">
          <span>Event</span>
          <select
            value={eventName}
            onChange={(e) => {
              setEventName(e.target.value)
              setSelectedTopic(ALL_TOPICS)
            }}
          >
            <option value={ALL_EVENTS}>{ALL_EVENTS}</option>
            {eventNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        {/* Team rounds are scored as a whole round, so they have no topic split. */}
        {!teamRound && (
          <TopicSelect
            competition="ICTM"
            events={selectedEvents}
            value={selectedTopic}
            onChange={setSelectedTopic}
          />
        )}
      </div>

      <Practice
        competition="ICTM"
        difficulty={selectedDiff}
        topic={teamRound ? null : selectedTopic}
        events={selectedEvents}
      />

      <div className="button-row">
        <Link to="/" className="nav-button">
          Back to home
        </Link>
      </div>
    </section>
  )
}

// ---- App shell -----------------------------------------------------------

function App() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setUser(data.user ?? null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null)
    })
    return () => {
      mounted = false
      try {
        const s = (sub as any)?.subscription ?? sub
        if (s && typeof s.unsubscribe === 'function') s.unsubscribe()
      } catch (e) {
        // ignore
      }
    }
  }, [])

  return (
    <ThemeProvider>
      <div className="app-shell">
        <header className="app-header" style={{ justifyContent: 'center', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)' }}>
            <ProfileAvatar user={user} />
          </div>
          <div className="brand-block">
            <div className="brand">ICTM Trainer</div>
            <div className="brand-subtitle">Math competition practice hub</div>
          </div>
          <div style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Only meaningful once signed in — stats are per-account. */}
            {user && (
              <Link to="/stats" className="nav-button" style={{ minWidth: 'auto', padding: '8px 14px' }}>
                My progress
              </Link>
            )}
            <ThemeToggle />
          </div>
        </header>

        <nav className="comps-nav">
          <Link to="/comp-amc10" className="nav-button">AMC 10</Link>
          <Link to="/comp-amc12" className="nav-button">AMC 12</Link>
          <Link to="/comp-aime" className="nav-button">AIME</Link>
          <Link to="/comp-nsml" className="nav-button">NSML</Link>
          <Link to="/comp-ictm" className="nav-button">ICTM</Link>
        </nav>

        <Routes>
          <Route path="/" element={<Home user={user} />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/stats" element={<StatsPage />} />
          {/* Reached by a hard page load from the reset email, so production
              hosting needs an SPA catch-all rewrite or this 404s. */}
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/comp-amc10"
            element={
              <CompPage
                title="AMC 10"
                competition="AMC10"
                description="The AMC 10 is a 25‑question, 75‑minute multiple‑choice national exam for 9th and 10th graders covering algebra, geometry, number theory, and combinatorics, with top performers qualifying for the AIME."
              />
            }
          />
          <Route
            path="/comp-amc12"
            element={
              <CompPage
                title="AMC 12"
                competition="AMC12"
                description="The AMC 12 follows the same format as the AMC 10 but includes pre‑calculus topics such as trigonometry and logarithms, making it the primary qualifying route for upperclassmen to reach the AIME."
              />
            }
          />
          <Route
            path="/comp-aime"
            element={
              <CompPage
                title="AIME"
                competition="AIME"
                description="The AIME is an invitation‑only, 15‑problem, 3‑hour exam that requires integer answers from 0 to 999 and serves as the crucial bridge from the AMC to the USAJMO and USAMO."
              />
            }
          />
          <Route
            path="/comp-nsml"
            element={
              <NsmlPage
                title="NSML"
                description="The North Suburban Math League is an Illinois‑based series of team and individual meets held throughout the school year that fosters collaborative problem‑solving across a wide range of mathematical topics."
              />
            }
          />
          <Route
            path="/comp-ictm"
            element={
              <IctmPage
                title="ICTM"
                description="The Illinois Council of Teachers of Mathematics runs a large state‑wide competition with separate Frosh/Soph and Junior/Senior brackets, featuring both individual tests and team challenges to recognize excellence at every high‑school level."
              />
            }
          />
        </Routes>
      </div>
    </ThemeProvider>
  )
}

export default App