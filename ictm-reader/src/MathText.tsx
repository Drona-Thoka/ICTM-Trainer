import { memo, type ReactNode } from 'react'
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
 * math delimiters. Preserve double-dollar display equations, including numbers.
 */
function protectMoney(s: string): string {
  // Only explicitly escaped currency can be unwrapped unambiguously.
  s = s.replace(/(?<!\$)\$\\\$\s*(\d[\d.,]*)\s*\$(?!\$)/g, (_m, n) => SENT + n)
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
  let s = input.replace(CONTROL_CHARS, '')

  // Older NSML imports use infix n \binom{k}; standard TeX needs two arguments.
  s = s.replace(/(\d+)\s*\\binom\{([^{}]+)\}(?!\s*\{)/g, '\\binom{$1}{$2}')

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

  // ---- 9b. eqnarray/eqnarray* -> align/align* ----
  // KaTeX has no eqnarray environment. align* is its closest equivalent;
  // eqnarray's "=&=" double alignment point becomes "&=" in align.
  s = s.replace(/\\begin\{eqnarray\*\}/g, '\\begin{align*}')
  s = s.replace(/\\end\{eqnarray\*\}/g, '\\end{align*}')
  s = s.replace(/\\begin\{eqnarray\}/g, '\\begin{align}')
  s = s.replace(/\\end\{eqnarray\}/g, '\\end{align}')
  s = s.replace(/=&=/g, '&=')

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
  // "\\[ABCD]" is a row break followed by an area label, not a spacing arg —
  // KaTeX would try to parse "[ABCD]" as a vertical size and fail. \cr takes
  // no optional argument, so the label renders literally after the break.
  s = s.replace(/\\\\(\[[^0-9+\-.\]][^\]]*\])/g, '\\cr$1')
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
    return escapeHtml(tex)
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

// Imported NSML text sometimes omits math delimiters altogether. Read balanced
// TeX atoms, stopping at prose words, rather than putting an entire sentence in
// math mode (which loses spaces and italicizes the explanation).
function texAtomEnd(s: string, start: number): number {
  let i = start
  if (s[i] === '{') {
    let depth = 1
    for (i++; i < s.length; i++) {
      if (s[i] === '\\') { i++; continue }
      if (s[i] === '{') depth++
      if (s[i] === '}' && --depth === 0) return i + 1
    }
    return start
  }
  const command = /^\\([A-Za-z]+|[{},;! ])/.exec(s.slice(i))
  if (command) {
    if (/^(begin|end|item|n)$/.test(command[1])) return start
    i += command[0].length
    // Include optional arguments (e.g. the index of a cube root).
    if (command[1] === 'sqrt' && s[i] === '[') {
      const end = s.indexOf(']', i + 1)
      if (end !== -1) i = end + 1
    }
    const arity = /^(frac|dfrac|tfrac|binom)$/.test(command[1]) ? 2
      : /^(sqrt|text|textbf|textit|textrm|emph|mathrm|mathbf|mathit|operatorname|overline|underline|vec|boxed|pmod|hspace)$/.test(command[1]) ? 1 : 0
    for (let a = 0; a < arity; a++) {
      const arg = i + (s.slice(i).match(/^\s*/)?.[0].length ?? 0)
      const end = texAtomEnd(s, arg)
      if (end === arg) return start
      i = end
    }
  } else {
    const token = /^(?:\d+(?:\.\d+)?|[A-Za-z]+|[+−\-*/=<>()[\]|,:])/.exec(s.slice(i))
    if (!token || (/^[A-Za-z]{2,}$/.test(token[0]) && !/^[A-Z]+$/.test(token[0]))) return start
    i += token[0].length
  }
  while (s[i] === '^' || s[i] === '_') {
    const end = texAtomEnd(s, i + 1)
    if (end === i + 1) break
    i = end
  }
  return i
}

function parseLoose(s: string, nextKey: () => number): ReactNode[] {
  const nodes: ReactNode[] = []
  // Outside math, TeX spacing and line breaks are text whitespace.
  s = s.replace(/\\newline\b|\\n\b|\\\\/g, '\n').replace(/\\ /g, ' ')
    .replace(/\\(?:begin|end)\{itemize\}/g, '\n')
    .replace(/\\item\b/g, '\n• ')
    .replace(/\\([%&#])/g, '$1')
  let literal = ''
  for (let i = 0; i < s.length;) {
    // Do not begin a math run in the middle of an English word.
    if (i > 0 && /[A-Za-z]/.test(s[i - 1])) { literal += s[i++]; continue }
    let end = texAtomEnd(s, i)
    if (end === i) { literal += s[i++]; continue }
    while (end < s.length) {
      const start = end + (s.slice(end).match(/^\s*/)?.[0].length ?? 0)
      const next = texAtomEnd(s, start)
      if (next === start) break
      end = next
    }
    const run = s.slice(i, end)
    let validMath = /\\[A-Za-z]+|[_^](?:\{|[A-Za-z0-9\\])/.test(run)
    if (validMath) {
      try {
        katex.renderToString(cleanLatex(run), { throwOnError: true, strict: false })
      } catch {
        validMath = false
      }
    }
    if (validMath) {
      if (literal) { nodes.push(literal); literal = '' }
      nodes.push(mathSpan(run, false, nextKey()))
    } else literal += run
    i = end
  }
  if (literal) nodes.push(literal)
  return nodes
}

function hasOpenGroup(s: string): boolean {
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue }
    if (s[i] === '{') depth++
    if (s[i] === '}') depth = Math.max(0, depth - 1)
  }
  return depth > 0
}

// KaTeX can typeset these environments, so a \begin{...} with no $...$ / \[...\]
// wrapper can still be rendered as display math. Anything not in this list
// (itemize, enumerate, ...) stays literal prose.
const MATH_ENVS = new Set([
  'align', 'align*', 'aligned', 'alignat', 'alignat*', 'alignedat',
  'array', 'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix',
  'smallmatrix', 'cases', 'dcases', 'rcases',
  'equation', 'equation*', 'eqnarray', 'eqnarray*',
  'gather', 'gather*', 'gathered', 'multline', 'multline*', 'split',
  'tabular',
])

/**
 * Index just past the matching \end{<env>} for a \begin{<env>} at `from`,
 * tracking same-name nesting, or -1 when it never closes.
 */
function findEnvEnd(s: string, from: number, env: string): number {
  let depth = 0
  let i = from
  const n = s.length
  while (i < n) {
    if (s.startsWith('\\begin{', i)) {
      const close = s.indexOf('}', i + 7)
      if (close !== -1) {
        if (s.slice(i + 7, close) === env) depth += 1
        i = close + 1
        continue
      }
    }
    if (s.startsWith('\\end{', i)) {
      const close = s.indexOf('}', i + 5)
      if (close !== -1) {
        if (s.slice(i + 5, close) === env) {
          depth -= 1
          if (depth === 0) return close + 1
        }
        i = close + 1
        continue
      }
    }
    i += 1
  }
  return -1
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
      nodes.push(...parseLoose(restoreText(buf), () => key++))
      buf = ''
    }
  }
  const n = text.length
  let i = 0
  while (i < n) {
    const c = text[i]
    // Text commands outside math are prose, including nested inline formulas.
    const formatting = c === '\\' ? /^\\(text|textbf|textit|emph)\s*\{/.exec(text.slice(i)) : null
    if (formatting && !hasOpenGroup(buf)) {
      const start = i + formatting[0].length - 1
      const end = texAtomEnd(text, start)
      flush()
      const Tag = formatting[1] === 'textbf' ? 'strong'
        : /^(textit|emph)$/.test(formatting[1]) ? 'em' : 'span'
      nodes.push(<Tag key={key++}>{parseMixed(text.slice(start + 1, end === start ? n : end - 1))}</Tag>)
      i = end === start ? n : end
      continue
    }
    // A `[` or `(` after `\\` is a line-break spacing arg (\\[5pt]), not a
    // display-math delimiter — only scan as math when the backslash is not
    // itself preceded by one.
    if (c === '\\' && text[i + 1] === '[' && text[i - 1] !== '\\') {
      const j = text.indexOf('\\]', i + 2)
      if (j !== -1) {
        flush()
        nodes.push(mathSpan(text.slice(i + 2, j), true, key++))
        i = j + 2
        continue
      }
    }
    if (c === '\\' && text[i + 1] === '(' && text[i - 1] !== '\\') {
      const j = text.indexOf('\\)', i + 2)
      if (j !== -1) {
        flush()
        nodes.push(mathSpan(text.slice(i + 2, j), false, key++))
        i = j + 2
        continue
      }
    }
    if (c === '\\' && text.startsWith('\\begin{', i)) {
      // Naked environment — "\begin{align*} ... \end{align*}" with no $...$ or
      // \[...\] wrapper. ~400 solutions in the bank are written this way;
      // without this branch the whole block renders as raw LaTeX prose.
      const close = text.indexOf('}', i + 7)
      const env = close === -1 ? '' : text.slice(i + 7, close)
      const end = MATH_ENVS.has(env) ? findEnvEnd(text, i, env) : -1
      if (end !== -1) {
        flush()
        nodes.push(mathSpan(text.slice(i, end), true, key++))
        i = end
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

function MathText({ children, math, className }: Props) {
  const text = children ?? ''

  if (math) {
    if (!LOOKS_MATHY.test(text)) {
      return <span className={className}>{text}</span>
    }
    const cleaned = stripDelimiters(text)
    return (
      <span
        className={className}
        dangerouslySetInnerHTML={{ __html: renderTeX(cleaned, false) }}
      />
    )
  }

  return <span className={`mathtext ${className ?? ''}`}>{parseMixed(text)}</span>
}

// Memoize: the LaTeX cleanup + KaTeX render is the most expensive work on the
// page, and all props are primitives, so an unchanged string must not be
// re-rendered (e.g. on every practice-page timer tick).
export default memo(MathText)
