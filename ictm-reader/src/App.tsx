import { useEffect, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import './App.css'

type HomeProps = {
  count: number
  setCount: React.Dispatch<React.SetStateAction<number>>
}

function Home({ count, setCount }: HomeProps) {
  return (
    <section id="home-page">
      <h1>Home</h1>
      <p>Choose one of the competition pages below.</p>
      <button
        type="button"
        className="counter"
        onClick={() => setCount((count) => count + 1)}
      >
        Count is {count}
      </button>
    </section>
  )
}

type CompProps = {
  title: string
  description: string
  endpoint: string
}

const difficulties = ['easy', 'medium', 'hard'] as const

type Difficulty = (typeof difficulties)[number]

function CompPage({ title, description, endpoint }: CompProps) {
  const [diff, setDiff] = useState<Difficulty>('easy')
  const [content, setContent] = useState<string>('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setContent('')
    setError(null)
    setStatus('loading')

    const fetchData = async () => {
      try {
        const response = await fetch(`/${endpoint}/${diff}`)
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
  }, [endpoint, diff])

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

      <div className="result-box">
        {status === 'loading' && <p>Loading {title} ({diff})...</p>}
        {status === 'error' && <p className="error">Failed to load: {error}</p>}
        {status === 'idle' && !error && (
          <div dangerouslySetInnerHTML={{ __html: content || '<p>No response yet.</p>' }} />
        )}
      </div>

      <div className="button-row">
        <Link to="/" className="nav-button">
          Back to home
        </Link>
      </div>
    </section>
  )
}

function NsmlPage({ title, description }: { title: string; description: string }) {
  const events = ['Event A', 'Event B', 'Event C', 'Event D']
  const [selected, setSelected] = useState<string | null>(null)
  const difficulties = ['Beginner', 'Easy', 'Medium', 'Hard', 'Expert']
  const [selectedDiff, setSelectedDiff] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // only fetch when both an event and difficulty are selected
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
        const url = `/get_nsml/${encodeURIComponent(selected)}/${encodeURIComponent(selectedDiff)}`
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
  }, [selected, selectedDiff])

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

      <div className="event-grid">
        {events.map((e) => (
          <button
            key={e}
            type="button"
            className={`event-button ${selected === e ? 'selected' : ''}`}
            onClick={() => setSelected(e)}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="result-box">
        {status === 'loading' && <p>Loading {selected} — {selectedDiff}...</p>}
        {status === 'error' && <p className="error">Failed to load: {error}</p>}
        {status === 'idle' && content && (
          <div dangerouslySetInnerHTML={{ __html: content }} />
        )}
        {status === 'idle' && !content && <p>No event selected.</p>}
      </div>

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
        const url = `/get_ictm/${encodeURIComponent(selected)}/${encodeURIComponent(selectedDiff)}`
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
  }, [selected, selectedDiff])

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

      <div className="event-grid">
        {events.map((e) => (
          <button
            key={e}
            type="button"
            className={`event-button ${selected === e ? 'selected' : ''}`}
            onClick={() => setSelected(e)}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="result-box">
        {status === 'loading' && <p>Loading {selected} — {selectedDiff}...</p>}
        {status === 'error' && <p className="error">Failed to load: {error}</p>}
        {status === 'idle' && content && (
          <div dangerouslySetInnerHTML={{ __html: content }} />
        )}
        {status === 'idle' && !content && <p>No event selected.</p>}
      </div>

      <div className="button-row">
        <Link to="/" className="nav-button">
          Back to home
        </Link>
      </div>
    </section>
  )
}

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="app-shell">
      <nav className="comps-nav">
        <Link to="/comp-1" className="nav-button">
          AMC
        </Link>
        <Link to="/comp-2" className="nav-button">
          AIME
        </Link>
        <Link to="/comp-3" className="nav-button">
          NSML
        </Link>
        <Link to="/comp-4" className="nav-button">
          ICTM
        </Link>
        <Link to="/comp-5" className="nav-button">
          ARML
        </Link>
      </nav>

      <Routes>
        <Route path="/" element={<Home count={count} setCount={setCount} />} />
        <Route
          path="/comp-1"
          element={
            <CompPage
              title="AMC"
              description="A nationwide exam series that challenges students with proof-free problems in algebra, geometry, number theory, and combinatorics"
              endpoint="get_amc"
            />
          }
        />
        <Route
          path="/comp-2"
          element={
            <CompPage
              title="AIME"
              description="An invitation-only contest for top AMC scorers featuring challenging integer-answer problems requiring deeper mathematical insight"
              endpoint="get_aime"
            />
          }
        />
        <Route
          path="/comp-3"
          element={
            <NsmlPage
              title="NSML"
              description="A nationwide league that combines monthly individual contests with cumulative scoring and team participation"
            />
          }
        />
        <Route
          path="/comp-4"
          element={
            <IctmPage
              title="ICTM"
              description="A state-level competition where Illinois students compete individually and as teams across multiple mathematics topics"
            />
          }
        />
        <Route
          path="/comp-5"
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