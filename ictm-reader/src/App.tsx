import { useEffect, useMemo, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import MathText from './MathText'
import './App.css'

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

// ---- Competition config (route -> backend short_name) --------------------

type Comp = {
  path: string
  nav: string
  short: string
  title: string
  description: string
  hasEvents: boolean
}

const COMPS: Comp[] = [
  {
    path: '/comp-amc10', nav: 'AMC 10', short: 'AMC10', title: 'AMC 10', hasEvents: false,
    description:
      'The AMC 10 is a 25‑question, 75‑minute multiple‑choice national exam for 9th and 10th graders covering algebra, geometry, number theory, and combinatorics, with top performers qualifying for the AIME.',
  },
  {
    path: '/comp-amc12', nav: 'AMC 12', short: 'AMC12', title: 'AMC 12', hasEvents: false,
    description:
      'The AMC 12 follows the same format as the AMC 10 but includes pre‑calculus topics such as trigonometry and logarithms, making it the primary qualifying route for upperclassmen to reach the AIME.',
  },
  {
    path: '/comp-aime', nav: 'AIME', short: 'AIME', title: 'AIME', hasEvents: false,
    description:
      'The AIME is an invitation‑only, 15‑problem, 3‑hour exam that requires integer answers from 0 to 999 and serves as the crucial bridge from the AMC to the USAJMO and USAMO.',
  },
  {
    path: '/comp-nsml', nav: 'NSML', short: 'NSML', title: 'NSML', hasEvents: false,
    description:
      'The North Suburban Math League is an Illinois‑based series of team and individual meets held throughout the school year that fosters collaborative problem‑solving across a wide range of mathematical topics.',
  },
  {
    path: '/comp-ictm', nav: 'ICTM', short: 'ICTM', title: 'ICTM', hasEvents: true,
    description:
      'The Illinois Council of Teachers of Mathematics runs a large state‑wide competition with separate Frosh/Soph and Junior/Senior brackets, featuring both individual tests and team challenges to recognize excellence at every high‑school level.',
  },
  {
    path: '/comp-arml', nav: 'ARML Tryouts', short: 'ARML', title: 'ARML Tryouts', hasEvents: false,
    description:
      'The ARML tryouts are a rigorous qualifying exam that selects top students for the national ARML team, testing advanced problem‑solving through a mix of individual and team‑based rounds across algebra, geometry, number theory, and combinatorics.',
  },
]

const DIFFICULTIES = ['any', 'easy', 'medium', 'hard'] as const
type Difficulty = (typeof DIFFICULTIES)[number]

// ---- Home ----------------------------------------------------------------

function Home() {
  return (
    <section id="home-page" className="home-hero">
      <div className="hero-card">
        <h1>Learn AMC, AIME, NSML, ICTM, and ARML Tryouts.</h1>
        <p className="hero-copy">
          Practice real past-contest problems by competition, topic, and difficulty. Answer, check
          your work, and reveal full solutions. Pick a competition below to begin.
        </p>
        <div className="hero-actions">
          <Link to="/comp-amc10" className="nav-button primary">
            Start with AMC 10
          </Link>
        </div>
      </div>
    </section>
  )
}

// ---- Practice page (one component for every competition) -----------------

function PracticePage({ comp }: { comp: Comp }) {
  const [topics, setTopics] = useState<string[]>([])
  const [events, setEvents] = useState<string[]>([])

  const [difficulty, setDifficulty] = useState<Difficulty>('any')
  const [topic, setTopic] = useState<string>('All topics')
  const [event, setEvent] = useState<string>('')

  const [problem, setProblem] = useState<Problem | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle')
  const [error, setError] = useState<string | null>(null)

  const [answer, setAnswer] = useState<string>('')
  const [result, setResult] = useState<CheckResult | null>(null)
  const [overridden, setOverridden] = useState(false)
  const [checking, setChecking] = useState(false)

  const [score, setScore] = useState({ correct: 0, total: 0 })

  // Reset all per-competition state when navigating between competition pages.
  useEffect(() => {
    setDifficulty('any')
    setTopic('All topics')
    setEvent('')
    setProblem(null)
    setStatus('idle')
    setError(null)
    setAnswer('')
    setResult(null)
    setOverridden(false)
    setScore({ correct: 0, total: 0 })

    fetch('/api/topics')
      .then((r) => r.json())
      .then(setTopics)
      .catch(() => setTopics([]))

    if (comp.hasEvents) {
      fetch(`/api/events?competition=${encodeURIComponent(comp.short)}`)
        .then((r) => r.json())
        .then(setEvents)
        .catch(() => setEvents([]))
    } else {
      setEvents([])
    }
  }, [comp.short, comp.hasEvents])

  async function fetchProblem() {
    setStatus('loading')
    setError(null)
    setProblem(null)
    setAnswer('')
    setResult(null)
    setOverridden(false)

    const params = new URLSearchParams({ competition: comp.short })
    if (difficulty !== 'any') params.set('difficulty', difficulty)
    if (topic && topic !== 'All topics') params.set('topic', topic)
    if (comp.hasEvents && event) params.set('event', event)

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
      setScore((s) => ({
        correct: s.correct + (data.correct ? 1 : 0),
        total: s.total + 1,
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setChecking(false)
    }
  }

  // Quizlet-style self-grade override: count a wrong-marked answer as correct.
  function markCorrect() {
    if (!result || result.correct || overridden) return
    setOverridden(true)
    setScore((s) => ({ ...s, correct: s.correct + 1 }))
  }

  const graded = result !== null
  const isCorrect = graded && (result!.correct || overridden)
  const accuracy = score.total ? Math.round((score.correct / score.total) * 100) : 0
  const choiceEntries = useMemo(
    () => (problem?.choices ? Object.entries(problem.choices) : []),
    [problem],
  )

  return (
    <section id="comp-page">
      <h1>{comp.title}</h1>
      <p>{comp.description}</p>

      <div className="diff-buttons">
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            type="button"
            className={`diff-button ${difficulty === d ? 'active' : ''}`}
            onClick={() => setDifficulty(d)}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="control-row">
        {comp.hasEvents && (
          <label className="control-group">
            <span>Event</span>
            <select value={event} onChange={(e) => setEvent(e.target.value)}>
              <option value="">Any event</option>
              {events.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="control-group">
          <span>Topic</span>
          <select value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="All topics">All topics</option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="nav-button primary get-button" onClick={fetchProblem}>
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
            <h2>{comp.title} question</h2>
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
            <p className="question-placeholder">
              No problems available yet for {comp.title} with those filters.
            </p>
          )}
          {status === 'idle' && !problem && (
            <p className="question-placeholder">
              Choose your filters and hit “Get problem” to begin.
            </p>
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
                        ? 'Counted as correct ✓ (you overrode)'
                        : 'Correct! ✓'
                      : 'Incorrect ✗'}
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
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand">ICTM Trainer</div>
          <div className="brand-subtitle">Math competition practice hub</div>
        </div>
      </header>
      <nav className="comps-nav">
        {COMPS.map((c) => (
          <Link key={c.path} to={c.path} className="nav-button">
            {c.nav}
          </Link>
        ))}
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        {COMPS.map((c) => (
          <Route key={c.path} path={c.path} element={<PracticePage comp={c} />} />
        ))}
      </Routes>
    </div>
  )
}

export default App
