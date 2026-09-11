import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/authRedirect.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
})
const { getAuthRedirectUrl } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const site = 'https://ictm-trainer.vercel.app'

test('canonical emails return to production even when requested locally or from a preview', () => {
  for (const origin of ['http://localhost:5173', 'https://preview.vercel.app']) {
    assert.equal(getAuthRedirectUrl(site, origin), `${site}/`)
    assert.equal(getAuthRedirectUrl(site, origin, '/reset-password'), `${site}/reset-password`)
  }
})

test('invalid and local configuration cannot redirect a public site to localhost', () => {
  for (const config of [undefined, '', 'invalid', 'javascript:alert(1)', 'http://localhost:3000',
    'https://127.0.0.1', 'https://[::1]', 'https://test.localhost', 'https://user:pass@example.com',
    'http://example.com']) {
    assert.equal(getAuthRedirectUrl(config, site, '/reset-password'), `${site}/reset-password`)
  }
})

test('canonical URLs discard incidental paths, query strings and fragments', () => {
  assert.equal(getAuthRedirectUrl(` "${site}/old?x=1#fragment" `, site), `${site}/`)
})

test('local email testing remains available with an explicit local override', () => {
  assert.equal(getAuthRedirectUrl('http://localhost:5173', 'http://localhost:5173', '/reset-password'),
    'http://localhost:5173/reset-password')
})
