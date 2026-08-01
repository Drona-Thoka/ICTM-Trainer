import type { ReactNode } from 'react'
import katex from 'katex'

const LOOKS_MATHY = /[\\^_{}√]/

// Private-use sentinel that stands in for a *literal* dollar sign while we scan,
// so currency dollars can never be mistaken for math delimiters.
const SENT = String.fromCharCode(0xe000)

// Control characters left by bad OCR (e.g. a backspace from a mangled \bar),
// excluding tab/newline/carriage-return which are legitimate whitespace.
// eslint-disable-next-line no-control-regex -- control chars are exactly what this strips
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]', 'g')

/**
 * Replace currency dollar signs with a sentinel so they are not parsed as
 * `$...$` math delimiters. The bank contains no legitimate `$...$` display math;
 * every stray dollar that hugs a number or is escaped is money, not math.
 */
function protectMoney(s: string): string {
  // $\$12.48$, $$20$, $\$$5$  ->  sentinel + number
  s = s.replace(/\$[\\$]{1,3}\s*(\d[\d.,]*)\s*\$/g, (_m, n) => SENT + n)
  // \$8.35  ->  sentinel + number
  s = s.replace(/\\\$\s*(\d[\d.,]*)/g, (_m, n) => SENT + n)
  // any leftover escaped dollar -> literal
  s = s.replace(/\\\$/g, SENT)
  return s
}

// Strip LaTeX command tokens (and the sentinel) so their letters are not counted
// as English prose words.
function stripLatex(seg: string): string {
  return seg.replace(/\\[A-Za-z]+/g, ' ').split(SENT).join(' ')
}

/**
 * Decide whether the text between two `$` is genuine math or the interior of a
 * currency phrase (e.g. "$4 per pair and $6 ..."). It is prose (=> currency) only
 * if, after removing LaTeX commands, two English words appear with a space
 * between them — a word being >=2 letters that contains a lowercase letter, so
 * all-caps geometry variables like `AB \cdot CD` or `GF \perp AF` stay math.
 */
function isMathSegment(inner: string): boolean {
  if (inner.trim() === '') return true
  if (inner.includes('\\text') || inner.includes('\\mbox') || inner.includes('\\begin')) return true
  const core = stripLatex(inner)
  if (/(?=[A-Za-z]{2})[A-Za-z]*[a-z][A-Za-z]*\s+(?=[A-Za-z]{2})[A-Za-z]*[a-z][A-Za-z]*/.test(core)) {
    return false
  }
  return true
}

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

  // ---- 9. tabular -> array ----
  // KaTeX has no tabular environment; array is its substitute.
  s = s.replace(/\\begin\{tabular\}(\s*\[[bt]\])?/g, '\\begin{array}')
  s = s.replace(/\\end\{tabular\}/g, '\\end{array}')
  // strip the [t]/[b] placement argument from any array
  s = s.replace(/(\\begin\{array\})\s*\[[bt]\]/g, '$1')
  // strip @{...} column specifiers, which KaTeX does not understand
  s = s.replace(/@\{((?:[^{}]|\{[^{}]*\})*)\}/g, '')

  // ---- 10. Recover commands mangled by OCR control characters ----
  // e.g. "<FF>rac{" (from \frac) or "=egin{bmatrix}" (from \begin)
  s = s.replace(/([^\\A-Za-z])rac\{/g, '$1\\frac{')
  s = s.replace(/([^\\A-Za-z])egin\{/g, '$1\\begin{')
  s = s.replace(/([^\\A-Za-z])end\{/g, '$1\\end{')
  s = s.replace(/(\s)extstyle\{/g, '$1\\textstyle{')
  s = s.replace(/(\s)ext\{/g, '$1\\text{')
  // double superscript like ^3^2 (OCR of ^\frac{3}{2}) -> ^{3^{2}}
  s = s.replace(/\^(\d+)\^(\d+)/g, '^{$1^{$2}}')
  // \^\\circ -> ^\circ (stray row-break backslash before a command)
  s = s.replace(/\^\\\\/g, '^\\')
  // \\end{bmatrix} -> \end{bmatrix} (duplicated row-break backslash)
  s = s.replace(/\\\\end\{/g, '\\end{')

  // ---- 11. Tabs/newlines inside math are whitespace ----
  s = s.replace(/[\t\n\r]+/g, ' ')

  // ---- 12. Misc junk that KaTeX rejects ----
  // stray double-quote characters leaked in from JSON-ish data
  s = s.replace(/"/g, '')
  // drop a stray dollar used as a subscript/superscript argument
  // (e.g. \theta_$_{PT} from bad OCR) so \theta_$_{PT} -> \theta_{PT}
  s = s.replace(/[_^]\$/g, '')
  // nested \(...\) inside an already-math segment
  s = s.replace(/\\\(/g, '')
  s = s.replace(/\\\)/g, '')
  // row gap must hug the line break: \\ [0.5ex] -> \\[0.5ex]
  s = s.replace(/\\\\\s*\[/g, '\\\\[')
  // merge double superscripts: ^{A}^{B} -> ^{A^{B}}, repeatedly for nesting
  for (let r = 0; r < 3; r++) {
    s = s.replace(
      /\^\{((?:[^{}]|\^\{[^{}]*\})*)\}\^(\d+|\{((?:[^{}]|\^\{[^{}]*\})*)\})/g,
      (_m, a, b, c) => '^{' + a + '^{' + (c || b) + '}}'
    )
  }
  // escape stray literal dollar signs in math
  s = s.replace(/(^|[^\\])\$/g, '$1\\$')
  // underscore/caret inside text-mode font commands are literal
  for (const cmd of ['text', 'textbf', 'textit', 'textrm', 'textsf', 'texttt', 'mbox', 'mathrm', 'mathbf', 'mathit', 'mathtt', 'mathsf', 'operatorname']) {
    const re = new RegExp('\\\\' + cmd + '\\{((?:[^{}]|\\{[^{}]*\\})*)\\}', 'g')
    s = s.replace(re, (m) => m.replace(/_/g, '\\_').replace(/\^/g, '\\textasciicircum'))
  }
  // unbalanced \left...\right -> strip the sizing entirely
  const lc = (s.match(/\\left(?![A-Za-z])/g) || []).length
  const rc = (s.match(/\\right(?![A-Za-z])/g) || []).length
  if (lc !== rc) {
    s = s.replace(/\\left(?![A-Za-z])/g, '').replace(/\\right(?![A-Za-z])/g, '')
  }

  // ---- 13. Auto-close unclosed environments (truncated segments) ----
  const envStack: string[] = []
  const envRe = /\\begin\{([^{}]+)\}|\\end\{([^{}]+)\}/g
  let em: RegExpExecArray | null
  while ((em = envRe.exec(s))) {
    if (em[1]) envStack.push(em[1])
    else {
      const idx = envStack.lastIndexOf(em[2])
      if (idx !== -1) envStack.splice(idx, 1)
    }
  }
  if (envStack.length) s += envStack.reverse().map((e) => '\\end{' + e + '}').join('')

  // ---- 14. Escape & and # that sit outside an environment ----
  // (inside array/cases/etc they are structure; outside they are literal)
  {
    let out = ''
    let depth = 0
    for (let k = 0; k < s.length; k++) {
      if (s.startsWith('\\begin{', k)) {
        const close = s.indexOf('}', k + 7)
        depth += 1
        out += s.slice(k, close + 1)
        k = close
        continue
      }
      if (s.startsWith('\\end{', k)) {
        const close = s.indexOf('}', k + 5)
        depth = Math.max(0, depth - 1)
        out += s.slice(k, close + 1)
        k = close
        continue
      }
      const ch = s[k]
      if (depth === 0 && (ch === '&' || ch === '#') && s[k - 1] !== '\\') out += '\\' + ch
      else out += ch
    }
    s = out
  }

  // ---- 15. Repair single-argument \frac{X = Y} -> \frac{X}{Y} ----
  // OCR sometimes drops the second argument and leaves an "=" inside the
  // braces; splitting at the first top-level "=" at least renders.
  {
    let out = ''
    for (let i = 0; i < s.length; i++) {
      if (s.startsWith('\\frac{', i)) {
        let depth = 0
        let eq = -1
        let j = i + 6
        for (; j < s.length; j++) {
          const ch = s[j]
          if (ch === '\\') {
            j += 1
            continue
          }
          if (ch === '{') depth += 1
          else if (ch === '}') {
            if (depth === 0) break
            depth -= 1
          } else if (ch === '=' && depth === 0 && eq === -1) eq = j
        }
        const next = s.slice(j + 1).search(/\S/)
        const hasSecond = next !== -1 && s[j + 1 + next] === '{'
        if (eq !== -1 && !hasSecond) {
          out += s.slice(i, eq) + '}{' + s.slice(eq + 1, j + 1)
          i = j
          continue
        }
      }
      out += s[i]
    }
    s = out
  }

  // ---- 16. Close unbalanced braces (truncated segments) ----
  let open = 0
  for (let k = 0; k < s.length; k++) {
    const ch = s[k]
    if (ch === '\\') {
      k += 1
      continue
    }
    if (ch === '{') open += 1
    else if (ch === '}') open -= 1
  }
  if (open > 0) s += '}'.repeat(open)

  // ---- 17. Remove trailing spaces ----
  s = s.trim()

  return s
}

function renderTeX(tex: string, displayMode: boolean): string {
  try {
    const cleaned = cleanLatex(tex)
    const html = katex.renderToString(cleaned, {
      displayMode,
      throwOnError: false,
      strict: false,
      // Optionally add macros if needed
    })
    // If KaTeX could not parse the segment at all, show its (cleaned) source
    // as plain text instead of a red error span.
    if (html.includes('katex-error')) {
      return '<span class="katex-fallback">' + cleaned.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>'
    }
    return html
  } catch {
    // Fallback: show the original text (safe)
    return tex
  }
}

// Turn a math segment's inner TeX into a rendered span. Any sentinel inside math
// is a literal dollar, so emit it as `\$` for KaTeX.
function mathSpan(inner: string, display: boolean, key: number): ReactNode {
  const tex = inner.split(SENT).join('\\$')
  return <span key={key} dangerouslySetInnerHTML={{ __html: renderTeX(tex, display) }} />
}

// Restore sentinels to plain dollar signs in a run of literal text.
function restoreText(s: string): string {
  return s.split(SENT).join('$')
}

/**
 * Split mixed prose + LaTeX into React nodes. A hand-written scanner (rather than
 * one big regex) so currency dollars — protected up front as sentinels — never
 * open a spurious math span, which was rendering prose in spaceless math mode.
 */
function parseMixed(rawInput: string): ReactNode[] {
  const raw = rawInput.replace(CONTROL_CHARS, '')
  const text = protectMoney(raw)
  const nodes: ReactNode[] = []
  let key = 0
  let buf = ''
  const flush = () => {
    if (buf) {
      nodes.push(restoreText(buf))
      buf = ''
    }
  }
  const n = text.length
  let i = 0
  while (i < n) {
    const c = text[i]
    if (c === '\\' && text[i + 1] === '[') {
      const j = text.indexOf('\\]', i + 2)
      if (j !== -1) {
        flush()
        nodes.push(mathSpan(text.slice(i + 2, j), true, key++))
        i = j + 2
        continue
      }
    }
    if (c === '\\' && text[i + 1] === '(') {
      const j = text.indexOf('\\)', i + 2)
      if (j !== -1) {
        flush()
        nodes.push(mathSpan(text.slice(i + 2, j), false, key++))
        i = j + 2
        continue
      }
    }
    if (c === '$') {
      if (text[i + 1] === '$') {
        const j = text.indexOf('$$', i + 2)
        if (j !== -1) {
          flush()
          nodes.push(mathSpan(text.slice(i + 2, j), true, key++))
          i = j + 2
          continue
        }
        buf += '$'
        i += 1
        continue
      }
      // find the next UNESCAPED closing dollar. A dollar sign used as a
      // subscript/superscript argument (e.g. the OCR-mangled \theta_$_{PT})
      // is not a closer — keep scanning past it.
      let j = i + 1
      while (j < n) {
        const prev = text[j - 1]
        if (text[j] === '$' && prev !== '\\' && prev !== '_' && prev !== '^') break
        j += 1
      }
      if (j < n) {
        const inner = text.slice(i + 1, j)
        if (isMathSegment(inner)) {
          flush()
          nodes.push(mathSpan(inner, false, key++))
          i = j + 1
          continue
        }
        // opener is a currency dollar — keep it literal and move on
        buf += '$'
        i += 1
        continue
      }
      // no closing dollar at all — literal
      buf += '$'
      i += 1
      continue
    }
    buf += c
    i += 1
  }
  flush()
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
