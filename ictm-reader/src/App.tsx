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
        <h1>Learn AMC, AIME, NSML, ICTM, and ARML.</h1>
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
  const difficulties = ['Beginner', 'Easy', 'Medium', 'Hard', 'Expert']
  const [selectedDiff, setSelectedDiff] = useState<string | null>(null)
  const [selectedTopic, setSelectedTopic] = useState('All topics')
  const [selectedGrade, setSelectedGrade] = useState('10')
  const [content, setContent] = useState<string>('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // NSML uses a single combined 'all' event; fetch when difficulty changes
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
          <span>Topic</span>
          <select value={selectedTopic} onChange={(event) => setSelectedTopic(event.target.value)}>
            {topicOptions.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </label>
        <label className="control-group">
          <span>Grade</span>
          <select value={selectedGrade} onChange={(event) => setSelectedGrade(event.target.value)}>
            {gradeOptions.map((grade) => (
              <option key={grade} value={grade}>
                Grade {grade}
              </option>
            ))}
          </select>
        </label>
      </div>

      <QuestionDisplay
        title={`${title} question`}
        subtitle={`${selectedDiff ?? 'Select a difficulty'} • ${selectedTopic} • Grade ${selectedGrade}`}
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
  const events = Array.from({ length: 9 }, (_, i) => `Event ${i + 1}`)
  const [selected, setSelected] = useState<string | null>(null)
  const difficulties = ['Easy', 'Medium', 'Hard']
  const [selectedDiff, setSelectedDiff] = useState<string | null>(null)
  const [selectedTopic, setSelectedTopic] = useState('All topics')
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
          <select
            value={selected ?? ''}
            onChange={(event) => setSelected(event.target.value || null)}
          >
            <option value="">Select an event</option>
            {events.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
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

function SearchBar() {
  return (
    <div className="search-bar">
      <div className="search-bar-inner">
        <input
          type="search"
          placeholder="Search competitions..."
          aria-label="Search competitions"
          className="search-input"
        />
        <button type="button" className="search-button">
          Search
        </button>
      </div>
    </div>
  )
}

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand">ICTM Trainer</div>
          <div className="brand-subtitle">Math competition practice hub</div>
        </div>
        <SearchBar />
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
          ARML
        </Link>
      </nav>

      <Routes>
        <Route path="/" element={<Home count={count} setCount={setCount} />} />
        <Route
          path="/comp-amc10"
          element={
            <CompPage
              title="AMC 10"
              description="A nationwide exam series for students in grades 10 and below, focusing on proof-free problems in algebra, geometry, number theory, and combinatorics."
              endpoint="get_amc10"
            />
          }
        />
        <Route
          path="/comp-amc12"
          element={
            <CompPage
              title="AMC 12"
              description="A nationwide exam series for students in grades 12 and below, featuring proof-free problems in algebra, geometry, number theory, and combinatorics."
              endpoint="get_amc12"
            />
          }
        />
        <Route
          path="/comp-aime"
          element={
            <CompPage
              title="AIME"
              description="An invitation-only contest for top AMC scorers featuring challenging integer-answer problems requiring deeper mathematical insight"
              endpoint="get_aime"
            />
          }
        />
        <Route
          path="/comp-nsml"
          element={
            <NsmlPage
              title="NSML"
              description="A Regional math competition for Illinois students, featuring a mix of individual and team-based problem solving across multiple topics"
            />
          }
        /> 
        <Route
          path="/comp-ictm"
          element={
            <IctmPage
              title="ICTM"
              description="A state-level competition where Illinois students compete individually and as teams across multiple mathematics topics"
            />
          }
        />
        <Route
          path="/comp-arml"
          element={
            <CompPage
              title="ARML"
              description="A prestigious national team-based competition where top students collaborate on challenging individual and relay-style mathematics problems"
              endpoint="get_arml"
            />
          }
        />
      </Routes>
    </div>
  )
}

export default App