import type { ReactNode } from 'react'
import katex from 'katex'

const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$]+?)\$|\\\(([\s\S]+?)\\\)/g
const LOOKS_MATHY = /[\\^_{}√]/

/**
 * Clean up common OCR mistakes and unsupported LaTeX commands.
 * Extend this function as new issues appear.
 */
function cleanLatex(input: string): string {
  let s = input

  // ---- 1. Fix OCR errors ----
  // \text{frac} -> \frac
  s = s.replace(/\\text\s*\{\s*frac\s*\}/g, '\\frac')
  // \text{frac}{...}{...} (sometimes without braces) – keep it safe
  s = s.replace(/\\text\{\s*frac\s*\}/g, '\\frac')

  // Remove stray \text{right} and \text{left} that break delimiters
  s = s.replace(/\\text\s*\{\s*right\s*\}/g, '')
  s = s.replace(/\\text\s*\{\s*left\s*\}/g, '')

  // \text{displaystyle} etc. – remove
  s = s.replace(/\\text\s*\{\s*displaystyle\s*\}/g, '')
  s = s.replace(/\\text\s*\{\s*textstyle\s*\}/g, '')

  // ---- 2. Convert text-formatting commands ----
  // \emph{...} -> \textit{...} (KaTeX supports \textit)
  s = s.replace(/\\emph\s*\{([^{}]*)\}/g, '\\textit{$1}')

  // \textbf{...} -> \textbf{...} (KaTeX supports \textbf)
  // No change needed, but keep it consistent.

  // \text{...} in math mode -> \text{...} is supported, but if it's used for
  // plain text that should be italic, we could convert to \textit.
  // We'll leave it as \text, but we can also strip extra spaces.
  s = s.replace(/\\text\s*\{/g, '\\text{')

  // ---- 3. Fix spacing around delimiters ----
  s = s.replace(/\\left\s*\(/g, '\\left(')
  s = s.replace(/\\right\s*\)/g, '\\right)')
  s = s.replace(/\\left\s*\[/g, '\\left[')
  s = s.replace(/\\right\s*\]/g, '\\right]')
  s = s.replace(/\\left\s*\{/g, '\\left\\{')
  s = s.replace(/\\right\s*\}/g, '\\right\\}')

  // ---- 4. Handle malformed \frac (missing braces) ----
  // Sometimes OCR produces \frac12 instead of \frac{1}{2}
  // This is a simplified fix: \frac(\d+)(\d+) -> \frac{\1}{\2}
  // Use a more robust regex: capture two groups of digits after \frac
  s = s.replace(/\\frac(\d+)(\d+)/g, '\\frac{$1}{$2}')

  // ---- 5. Handle \sqrt without braces ----
  // e.g., \sqrt2 -> \sqrt{2}
  s = s.replace(/\\sqrt(\d+)/g, '\\sqrt{$1}')

  // ---- 6. Remove extra spaces inside math commands ----
  s = s.replace(/\s*\\times\s*/g, ' \\times ')
  s = s.replace(/\s*\\cdot\s*/g, ' \\cdot ')
  s = s.replace(/\s*\\div\s*/g, ' \\div ')

  // ---- 7. Fix common LaTeX command spelling ----
  // \tan -> \tan, but \text{tan} -> \tan? Actually KaTeX supports \tan.
  // If there's \text{tan} we could convert, but it's rare.
  s = s.replace(/\\text\{\s*tan\s*\}/g, '\\tan')
  s = s.replace(/\\text\{\s*sin\s*\}/g, '\\sin')
  s = s.replace(/\\text\{\s*cos\s*\}/g, '\\cos')
  s = s.replace(/\\text\{\s*log\s*\}/g, '\\log')
  s = s.replace(/\\text\{\s*ln\s*\}/g, '\\ln')

  // ---- 8. Convert \mathbb{R} etc. (already supported) ----
  // But KaTeX supports \mathbb, so no change.

  // ---- 9. Remove trailing spaces ----
  s = s.trim()

  return s
}

function renderTeX(tex: string, displayMode: boolean): string {
  try {
    const cleaned = cleanLatex(tex)
    return katex.renderToString(cleaned, {
      displayMode,
      throwOnError: false,
      strict: false,
      // Optionally add macros if needed
    })
  } catch (e) {
    // Fallback: show the original text (safe)
    return tex
  }
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
  math?: boolean       // true: treat the whole string as a math expression
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

  return <span className={`mathtext ${className ?? ''}`}>{parseMixed(text)}</span>
}