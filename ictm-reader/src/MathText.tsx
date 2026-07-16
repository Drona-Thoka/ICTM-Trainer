import type { ReactNode } from 'react'
import katex from 'katex'

/*
 * MathText — render strings that mix prose and LaTeX, as served raw by the
 * backend (problem_text, solution_text, answers, choices).
 *
 *   <MathText>{problem.problem_text}</MathText>   // mixed text + $…$ / \(…\) math
 *   <MathText math>{correctAnswer}</MathText>     // a bare expression like \frac{15}{2}
 *
 * KaTeX renders with throwOnError:false, so malformed input degrades to red
 * inline text instead of crashing. KaTeX HTML output is trusted.
 */

// $$…$$ (display) | \[…\] (display) | $…$ (inline) | \(…\) (inline)
const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$]+?)\$|\\\(([\s\S]+?)\\\)/g

// Heuristic: does a bare string contain anything worth rendering as math?
const LOOKS_MATHY = /[\\^_{}√]/

function renderTeX(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    strict: false,
  })
}

function parseMixed(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let key = 0
  MATH_RE.lastIndex = 0
  for (let m = MATH_RE.exec(text); m !== null; m = MATH_RE.exec(text)) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const display = m[1] !== undefined || m[2] !== undefined
    const tex = m[1] ?? m[2] ?? m[3] ?? m[4] ?? ''
    nodes.push(
      <span
        key={key++}
        dangerouslySetInnerHTML={{ __html: renderTeX(tex, display) }}
      />,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function stripDelimiters(s: string): string {
  const t = s.trim()
  if (t.startsWith('$$') && t.endsWith('$$')) return t.slice(2, -2)
  if (t.startsWith('$') && t.endsWith('$')) return t.slice(1, -1)
  if (t.startsWith('\\(') && t.endsWith('\\)')) return t.slice(2, -2)
  if (t.startsWith('\\[') && t.endsWith('\\]')) return t.slice(2, -2)
  return t
}

type Props = {
  children: string | null | undefined
  math?: boolean
  className?: string
}

export default function MathText({ children, math, className }: Props) {
  const text = children ?? ''

  if (math) {
    if (!LOOKS_MATHY.test(text)) {
      return <span className={className}>{text}</span>
    }
    return (
      <span
        className={className}
        dangerouslySetInnerHTML={{ __html: renderTeX(stripDelimiters(text), false) }}
      />
    )
  }

  return <span className={`mathtext ${className ?? ''}`}>{parseMixed(text)}</span>
}
