import { useEffect, useRef, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import './App.css'

type HomeProps = {
  count: number
  setCount: React.Dispatch<React.SetStateAction<number>>
}

function Home({ count, setCount }: HomeProps) {
  const countRef = useRef(count)

  useEffect(() => {
    countRef.current = count
  }, [count])

  const increment = () => {
    countRef.current += 1
    setCount(countRef.current)
  }

  return (
    <section id="home-page" className="home-hero">
      <div className="hero-card">
        <h1>Learn AMC, AIME, NSML, ICTM, and ARML Tryouts.</h1>
        <p className="hero-copy">
          Browse contest content by difficulty, explore event-based practice, and jump into the
          competition pages below.
        </p>
        <div className="hero-actions">
          <button
            type="button"
            className="counter"
            onClick={increment}
            onMouseDown={(event) => event.preventDefault()}
            onContextMenu={(event) => event.preventDefault()}
          >
            Count: {count}
          </button>
          <Link to="/comp-amc10" className="nav-button primary">
            Start with AMC 10
          </Link>
        </div>
      </div>
    </section>
  )
}

type CompProps = {
  title: string
  description: string
  endpoint: string
}

const topicOptions = ['All topics', 'Algebra', 'Geometry', 'Number Theory', 'Combinatorics', 'Precalculus', 'Advanced Math']
const gradeOptions = ['9', '10', '11', '12']

const nsmlTopicsByGrade: Record<string, string[]> = {
  '9': [
    'Number Bases',
    'Counting Basics & Simple Probability',
    'Basic Statistics',
    'Systems of Equations & Quadratics',
  ],
  '10': [
    'Logic, Sets & Venn Diagrams',
    'Geometric Probability',
    'Circles',
    'Surface Area & Volume (3D)',
  ],
  '11': [
    'Modular Arithmetic',
    'Probability',
    'Geometric Transformations (Matrices)',
    'Theory of Polynomials',
  ],
  '12': [
    'Diophantine Equations',
    'Probability',
    'Vectors',
    'Parametric Equations',
  ],
}

const ictmTopicsByEvent: Record<string, string[]> = {
  'Algebra I': ['All topics', 'Algebra Basics', 'Linear Equations'],
  'Geometry': ['All topics', 'Geometry Basics', 'Triangles'],
  'Algebra II': ['All topics', 'Algebra II', 'Quadratics'],
  'Pre-Calculus': ['All topics', 'Pre-Calculus Review', 'Trigonometry'],
  'Freshman-Sophomore 8 Person Team': ['All topics', 'Team Strategy', 'Relay Practice'],
  'Junior-Senior 8 Person Team': ['All topics', 'Advanced Team Strategy', 'Team Logic'],
  'Calculator Team': ['All topics', 'Calculator Techniques', 'Scientific Notation'],
  'Freshman-Sophomore 2 Person Team': ['All topics', 'Fast Thinking', 'Short Answer Strategy'],
  'Junior-Senior 2 Person Team': ['All topics', 'Advanced Fast Thinking', 'Tie-Breaker Strategy'],
}

/* Event lists removed — NSML no longer exposes per-event selection; ICTM uses default events */

type QuestionDisplayProps = {
  title: string
  subtitle?: string
  content: string
  status: 'idle' | 'loading' | 'error'
  error: string | null
  emptyMessage?: string
}

const difficulties = ['easy', 'medium', 'hard'] as const

type Difficulty = (typeof difficulties)[number]

function QuestionDisplay({
  title,
  subtitle,
  content,
  status,
  error,
  emptyMessage,
}: QuestionDisplayProps) {
  return (
    <div className="question-card">
      <div className="question-card-header">
        <div>
          <p className="question-eyebrow">Question area</p>
          <h2>{title}</h2>
        </div>
        {subtitle ? <span className="question-meta">{subtitle}</span> : null}
      </div>

      <div className="question-card-body">
        {status === 'loading' && <p className="question-placeholder">Loading question...</p>}
        {status === 'error' && <p className="error">Failed to load: {error}</p>}
        {status === 'idle' && !content && (
          <p className="question-placeholder">{emptyMessage ?? 'Choose a difficulty or event to view the question.'}</p>
        )}
        {status === 'idle' && content && <div dangerouslySetInnerHTML={{ __html: content }} />}
      </div>
    </div>
  )
}

function CompPage({ title, description, endpoint }: CompProps) {
  const [diff, setDiff] = useState<Difficulty>('easy')
  const [selectedTopic, setSelectedTopic] = useState('All topics')
  const [content, setContent] = useState<string>('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setContent('')
    setError(null)
    setStatus('loading')

    const fetchData = async () => {
      try {
        const topicQuery = selectedTopic === 'All topics' ? '' : `?topic=${encodeURIComponent(selectedTopic)}`
        const response = await fetch(`/${endpoint}/${diff}${topicQuery}`)
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }
        const text = await response.text()
        setContent(text)
        setStatus('idle')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setStatus('error')
      }
    }

    fetchData()
  }, [endpoint, diff, selectedTopic])

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
        <label className="control-group">
          <span>Topic</span>
          <select value={selectedTopic} onChange={(event) => setSelectedTopic(event.target.value)}>
            {topicOptions.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </label>
      </div>

      <QuestionDisplay
        title={`${title} question`}
        subtitle={`${diff} difficulty • ${selectedTopic}`}
        content={content}
        status={status}
        error={error}
        emptyMessage={`Choose a difficulty to view the ${title.toLowerCase()} question.`}
      />

      <div className="button-row">
        <Link to="/" className="nav-button">
          Back to home
        </Link>
      </div>
    </section>
  )
}

function NsmlPage({ title, description }: { title: string; description: string }) {
  const difficulties = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5']
  const [selectedDiff, setSelectedDiff] = useState<string | null>(null)
  const [selectedTopic, setSelectedTopic] = useState('All topics')
  const [selectedGrade, setSelectedGrade] = useState('10')
  const nsmlTopicOptions = nsmlTopicsByGrade[selectedGrade] ?? topicOptions
  const [content, setContent] = useState<string>('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Fetch when difficulty is selected (NSML has no per-event selection)
    if (!selectedDiff) {
      setContent('')
      setStatus('idle')
      setError(null)
      return
    }

    setContent('')
    setStatus('loading')
    setError(null)

    const fetchData = async () => {
      try {
        const topicQuery = selectedTopic === 'All topics' ? '' : `&topic=${encodeURIComponent(selectedTopic)}`
        const url = `/get_nsml/${encodeURIComponent('all')}/${encodeURIComponent(selectedDiff)}?grade=${encodeURIComponent(selectedGrade)}${topicQuery}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        const text = await res.text()
        setContent(text)
        setStatus('idle')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error')
        setStatus('error')
      }
    }

    fetchData()
  }, [selectedDiff, selectedTopic, selectedGrade])

  /* NSML no longer exposes per-grade events in the UI */

  return (
    <section id="comp-page">
      <h1>{title}</h1>
      <p>{description}</p>

      <div className="diff-buttons">
        {difficulties.map((d) => (
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
          <select value={selectedGrade} onChange={(event) => { setSelectedGrade(event.target.value); setSelectedTopic(nsmlTopicsByGrade[event.target.value]?.[0] ?? 'All topics') }}>
            {gradeOptions.map((grade) => (
              <option key={grade} value={grade}>
                Grade {grade}
              </option>
            ))}
          </select>
        </label>
        <label className="control-group">
          <span>Topic</span>
          <select value={selectedTopic} onChange={(event) => setSelectedTopic(event.target.value)}>
            {nsmlTopicOptions.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </label>
      </div>

      <QuestionDisplay
        title={`${title} question`}
        subtitle={`${selectedDiff ?? 'Select a Question'} • ${selectedTopic} • Grade ${selectedGrade}`}
        content={content}
        status={status}
        error={error}
        emptyMessage="Choose a difficulty to view a question."
      />

      <div className="button-row">
        <Link to="/" className="nav-button">
          Back to home
        </Link>
      </div>
    </section>
  )
}

function IctmPage({ title, description }: { title: string; description: string }) {
  const events = [
    'Algebra I',
    'Geometry',
    'Algebra II',
    'Pre-Calculus',
    'Freshman-Sophomore 8 Person Team',
    'Junior-Senior 8 Person Team',
    'Calculator Team',
    'Freshman-Sophomore 2 Person Team',
    'Junior-Senior 2 Person Team',
  ]
  const [selected, setSelected] = useState<string | null>(null)
  const difficulties = ['Easy', 'Medium', 'Hard']
  const [selectedDiff, setSelectedDiff] = useState<string | null>(null)
  const [selectedTopic, setSelectedTopic] = useState('All topics')
  const ictmEventOptions = events
  const ictmTopicOptions = (selected && ictmTopicsByEvent[selected]) ? ictmTopicsByEvent[selected] : topicOptions
  const [content, setContent] = useState<string>('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selected || !selectedDiff) {
      setContent('')
      setStatus('idle')
      setError(null)
      return
    }

    setContent('')
    setStatus('loading')
    setError(null)

    const fetchData = async () => {
      try {
        const topicQuery = selectedTopic === 'All topics' ? '' : `?topic=${encodeURIComponent(selectedTopic)}`
        const url = `/get_ictm/${encodeURIComponent(selected)}/${encodeURIComponent(selectedDiff)}${topicQuery}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        const text = await res.text()
        setContent(text)
        setStatus('idle')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error')
        setStatus('error')
      }
    }

    fetchData()
  }, [selected, selectedDiff, selectedTopic])

  return (
    <section id="comp-page">
      <h1>{title}</h1>
      <p>{description}</p>

      <div className="diff-buttons">
        {difficulties.map((d) => (
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
          <span>Event</span>
          <select value={selected ?? ''} onChange={(event) => { const val = event.target.value || null; setSelected(val); setSelectedTopic(val ? (ictmTopicsByEvent[val]?.[0] ?? 'All topics') : 'All topics') }}>
            <option value="">Select an event</option>
            {ictmEventOptions.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>

        <label className="control-group">
          <span>Topic</span>
          <select value={selectedTopic} onChange={(event) => setSelectedTopic(event.target.value)}>
            {ictmTopicOptions.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </label>
      </div>

      <QuestionDisplay
        title={`${title} question`}
        subtitle={`${selected ?? 'Select an event'} • ${selectedDiff ?? 'Select a difficulty'} • ${selectedTopic}`}
        content={content}
        status={status}
        error={error}
        emptyMessage="Choose an event and difficulty to view a question."
      />

      <div className="button-row">
        <Link to="/" className="nav-button">
          Back to home
        </Link>
      </div>
    </section>
  )
}

// SearchBar removed — header no longer shows a search input

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand">ICTM Trainer</div>
          <div className="brand-subtitle">Math competition practice hub</div>
        </div>
        
      </header>
      <nav className="comps-nav">
        <Link to="/comp-amc10" className="nav-button">
          AMC 10
        </Link>
        <Link to="/comp-amc12" className="nav-button">
          AMC 12
        </Link>
        <Link to="/comp-aime" className="nav-button">
          AIME
        </Link>
        <Link to="/comp-nsml" className="nav-button">
          NSML
        </Link>
        <Link to="/comp-ictm" className="nav-button">
          ICTM
        </Link>
        <Link to="/comp-arml" className="nav-button">
          ARML Tryouts
        </Link>
      </nav>

      <Routes>
        <Route path="/" element={<Home count={count} setCount={setCount} />} />
        <Route
          path="/comp-amc10"
          element={
            <CompPage
              title="AMC 10"
              description="The AMC 10 is a 25‑question, 75‑minute multiple‑choice national exam for 9th and 10th graders covering algebra, geometry, number theory, and combinatorics, with top performers qualifying for the AIME."
              endpoint="get_amc10"
            />
          }
        />
        <Route
          path="/comp-amc12"
          element={
            <CompPage
              title="AMC 12"
              description="The AMC 12 follows the same format as the AMC 10 but includes pre‑calculus topics such as trigonometry and logarithms, making it the primary qualifying route for upperclassmen to reach the AIME."
              endpoint="get_amc12"
            />
          }
        />
        <Route
          path="/comp-aime"
          element={
            <CompPage
              title="AIME"
              description="The AIME is an invitation‑only, 15‑problem, 3‑hour exam that requires integer answers from 0 to 999 and serves as the crucial bridge from the AMC to the USAJMO and USAMO."
              endpoint="get_aime"
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
        <Route
          path="/comp-arml"
          element={
            <CompPage
              title="ARML Tryouts"
              description="The ARML tryouts are a rigorous qualifying exam that selects top students for the national ARML team, testing advanced problem‑solving through a mix of individual and team‑based rounds across algebra, geometry, number theory, and combinatorics."
              endpoint="get_arml"
            />
          }
        />
      </Routes>
    </div>
  )
}

export default App