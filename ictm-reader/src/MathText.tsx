import type { ReactNode } from 'react'
import katex from 'katex'

const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$]+?)\$|\\\(([\s\S]+?)\\\)/g
const LOOKS_MATHY = /[\\^_{}√]/

// ---- Clean up common OCR/ingestion errors ----
function cleanLatex(s: string): string {
  // Replace \text{frac} (or \text {frac}) with \frac
  s = s.replace(/\\text\s*\{\s*frac\s*\}/g, '\\frac')

  // Remove stray \text{right}, \text{left} that break delimiters
  s = s.replace(/\\text\s*\{\s*right\s*\}/g, '')
  s = s.replace(/\\text\s*\{\s*left\s*\}/g, '')

  // Sometimes \times \text{right} should be \right) – uncomment if needed:
  // s = s.replace(/\\times\s*\\text\{\s*right\s*\}/g, '\\right)')

  // Remove extra spaces inside \left( and \right)
  s = s.replace(/\\left\s*\(/g, '\\left(')
  s = s.replace(/\\right\s*\)/g, '\\right)')

  return s
}

function renderTeX(tex: string, displayMode: boolean): string {
  // Clean before rendering
  const cleaned = cleanLatex(tex)
  return katex.renderToString(cleaned, {
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
    const cleaned = cleanLatex(stripDelimiters(text))
    return (
      <span
        className={className}
        dangerouslySetInnerHTML={{ __html: renderTeX(cleaned, false) }}
      />
    )
  }

  // For mixed text, the cleaning happens inside parseMixed via renderTeX
  return <span className={`mathtext ${className ?? ''}`}>{parseMixed(text)}</span>
}