const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const Module = require('node:module')
const { test } = require('node:test')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

// Exercise the actual TSX component using the project's existing compiler.
const filename = resolve(__dirname, '../src/MathText.tsx')
const component = new Module(filename, module)
component.filename = filename
component.paths = Module._nodeModulePaths(resolve(__dirname, '../src'))
component._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, filename)
function render(text, math = false) {
  return renderToStaticMarkup(React.createElement(component.exports.default, { math }, text))
}
function annotations(html) {
  return [...html.matchAll(/<annotation[^>]*>(.*?)<\/annotation>/gs)].map(m => m[1])
}
function valid(html) {
  assert.doesNotMatch(html, /katex-error|katex-fallback|color:#cc0000/)
}

test('numeric display equations are not currency', () => {
  for (const text of ['$$20$$', '$$123_7 + 214_7 \\times 6_7$$']) {
    const html = render(text)
    valid(html)
    assert.match(html, /katex-display/)
    assert.equal(annotations(html).length, 1)
  }
})

test('currency remains literal alongside inline math', () => {
  const html = render('Pay $4 per pair and $6 per box; $x+1$ items cost \\$8.35.')
  assert.match(html, /Pay \$4 per pair and \$6 per box/)
  assert.match(html, /\$8\.35/)
  assert.deepEqual(annotations(html), ['x+1'])
  assert.match(render('$\\$12.48$'), /\$12\.48/)
})

test('undelimited NSML expressions render while prose keeps its spaces', () => {
  const html = render('Simplify the following in base 7.\n46_{7} + 315_{7} \\times 47')
  valid(html)
  assert.match(html, /Simplify the following in base 7/)
  assert.deepEqual(annotations(html), ['46_{7} + 315_{7} \\times 47'])
  const vector = render('Let \\mathbf{a}_k be a sequence of vectors.')
  valid(vector)
  assert.deepEqual(annotations(vector), ['\\mathbf{a}_k'])
  assert.match(vector, / be a sequence of vectors\./)
  assert.deepEqual(annotations(render('Use the 2^{\\text{nd}} power.')), ['2^{\\text{nd}}'])
})

test('nested fractions, roots, text formatting and lists', () => {
  const html = render('Convert \\frac{13}{\\sqrt{16}} to a \\textit{radix fraction}.')
  valid(html)
  assert.match(html, /<em>radix fraction<\/em>/)
  assert.deepEqual(annotations(html), ['\\frac{13}{\\sqrt{16}}'])
  const list = render('\\begin{itemize}\\item First $x$.\\item Second $y$.\\end{itemize}')
  valid(list)
  assert.doesNotMatch(list, /\\(?:begin|end|item)/)
  assert.match(list, /•\s+First/)
})

test('infix binomial notation and answer control characters', () => {
  const html = render('\\(52 \\binom{4}\\)')
  valid(html)
  assert.deepEqual(annotations(html), ['\\binom{52}{4}'])
  valid(render('\\frac{10\x7f}{3} - 4\\sqrt{3}', true))
  assert.deepEqual(annotations(render('\\binom{52}{4}', true)), ['\\binom{52}{4}'])
})

test('matrices, answer blanks and unknown markup stay safe', () => {
  valid(render('A = \\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}'))
  assert.match(render('1. {_____________}'), /\{_____________\}/)
  assert.doesNotMatch(render('<img src=x onerror=alert(1)>'), /<img/)
  assert.doesNotMatch(render('\\unknown{<img src=x>}', true), /<img/)
})

// Set NSML_ROWS_JSON to a read-only export of the bank for a corpus audit.
test('all NSML snapshot fields render without KaTeX errors', { skip: !process.env.NSML_ROWS_JSON }, () => {
  const rows = JSON.parse(readFileSync(process.env.NSML_ROWS_JSON, 'utf8'))
  assert.ok(rows.length > 0)
  for (const row of rows) {
    for (const field of ['problem_text', 'solution_text', 'answer']) {
      if (row[field]) {
        try { valid(render(row[field], field === 'answer')) }
        catch (error) { throw new Error(`NSML ${row.problem_id} ${field}: ${error.message}`) }
      }
    }
  }
})
