export type OriginPattern = {
  host: string
  port: string
  scheme: string
  wildcard: boolean
}

const DEFAULT_PORTS: Record<string, string> = { http: '80', https: '443', ws: '80', wss: '443' }
const ORIGIN = /^(https?|wss?):\/\/(\*\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::(\d{1,5}))?$/i

/** Parses CSP host-source syntax: scheme://host[:port], with an optional leading `*.`. No paths. */
export function parseOriginPattern(origin: string): OriginPattern {
  const match = ORIGIN.exec(origin)
  if (!match) {
    throw new TypeError(
      `res-canary: invalid origin "${origin}". Use scheme://host[:port] with no path, e.g. "https://*.vendor.example".`,
    )
  }
  const scheme = match[1].toLowerCase()
  return {
    host: match[3].toLowerCase(),
    port: match[4] ?? DEFAULT_PORTS[scheme],
    scheme,
    wildcard: match[2] !== undefined,
  }
}

/** CSP host-source matching: same scheme, same effective port, exact host or any subdomain for `*.`. */
export function matchesOrigin(url: string, pattern: OriginPattern): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const scheme = parsed.protocol.slice(0, -1)
  if (scheme !== pattern.scheme) return false
  if ((parsed.port || DEFAULT_PORTS[scheme]) !== pattern.port) return false
  const host = parsed.hostname.toLowerCase()
  return pattern.wildcard ? host.endsWith(`.${pattern.host}`) : host === pattern.host
}
