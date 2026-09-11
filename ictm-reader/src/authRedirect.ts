/** Use a canonical site when configured, otherwise keep the current origin. */
export function getAuthRedirectUrl(siteUrl: string | undefined, origin: string, path = '/'): string {
  let base = new URL(origin)
  const configured = siteUrl?.trim().replace(/^["']|["']$/g, '').trim()
  if (configured) {
    try {
      const candidate = new URL(configured)
      const isLocal = (url: URL) =>
        /^(localhost|.*\.localhost|127(?:\.\d+){3}|\[::1\]|0\.0\.0\.0)$/.test(url.hostname)
      if (
        ['http:', 'https:'].includes(candidate.protocol) &&
        !candidate.username && !candidate.password &&
        (isLocal(base) || !isLocal(candidate)) &&
        (base.protocol !== 'https:' || candidate.protocol === 'https:')
      ) {
        base = candidate
      }
    } catch {
      // A malformed build variable must not prevent requesting an email.
    }
  }
  return new URL(path, base.origin).href
}
