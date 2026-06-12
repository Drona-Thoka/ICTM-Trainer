import { useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import './App.css'
let id = 0;
type HomeProps = {
  count: number
  setCount: React.Dispatch<React.SetStateAction<number>>
}

function Home({ count, setCount }: HomeProps) {
  return (
    <section id="home-page">
      <h1>Home</h1>
      <p>Choose one of the two component pages below.</p>
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
}

function CompPage({ title, description }: CompProps) {
  return (
    <section id="comp-page">
      <h1>{title}</h1>
      <p>{description}</p>
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
          element={<CompPage title="AMC" description="A nationwide exam series that challenges students with proof-free problems in algebra, geometry, number theory, and combinatorics" />}
        />
        <Route
          path="/comp-2"
          element={<CompPage title="AIME" description="An invitation-only contest for top AMC scorers featuring challenging integer-answer problems requiring deeper mathematical insight" />}
        />
        <Route
          path="/comp-3"
          element={<CompPage title="NSML" description="A nationwide league that combines monthly individual contests with cumulative scoring and team participation" />}
        />
        <Route
          path="/comp-4"
          element={<CompPage title="ICTM" description="A state-level competition where Illinois students compete individually and as teams across multiple mathematics topics" />}
        />
        <Route
          path="/comp-5"
          element={<CompPage title="ARML" description="A prestigious national team-based competition where top students collaborate on challenging individual and relay-style mathematics problems" />}
        />
      </Routes>
    </div>
  )
}

export default App
