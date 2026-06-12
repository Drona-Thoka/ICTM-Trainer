import { useState } from 'react'
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
          Comp 1
        </Link>
        <Link to="/comp-2" className="nav-button">
          Comp 2
        </Link>
        <Link to="/comp-3" className="nav-button">
          Comp 3
        </Link>
        <Link to="/comp-4" className="nav-button">
          Comp 4
        </Link>
        <Link to="/comp-5" className="nav-button">
          Comp 5
        </Link>
      </nav>

      <Routes>
        <Route path="/" element={<Home count={count} setCount={setCount} />} />
        <Route
          path="/comp-1"
          element={<CompPage title="Component 1" description="This is the page for Component 1." />}
        />
        <Route
          path="/comp-2"
          element={<CompPage title="Component 2" description="This is the page for Component 2." />}
        />
        <Route
          path="/comp-3"
          element={<CompPage title="Component 3" description="This is the page for Component 3." />}
        />
        <Route
          path="/comp-4"
          element={<CompPage title="Component 4" description="This is the page for Component 4." />}
        />
        <Route
          path="/comp-5"
          element={<CompPage title="Component 5" description="This is the page for Component 5." />}
        />
      </Routes>
    </div>
  )
}

export default App
