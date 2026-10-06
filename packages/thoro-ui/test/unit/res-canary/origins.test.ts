import { checkUrl, matchesOrigin, parseOriginPattern } from '../../../src/res-canary/origins.ts'

const matches = (url: string, origin: string): boolean => matchesOrigin(url, parseOriginPattern(origin))

describe('parseOriginPattern', () => {
  it('parses scheme, host, wildcard and port, lower-casing the host', () => {
    expect(parseOriginPattern('https://*.Vendor.example')).toEqual({
      host: 'vendor.example',
      port: '443',
      scheme: 'https',
      wildcard: true,
    })
    expect(parseOriginPattern('wss://rtc.vendor.example:8443')).toEqual({
      host: 'rtc.vendor.example',
      port: '8443',
      scheme: 'wss',
      wildcard: false,
    })
  })

  it.each([
    'vendor.example',
    'https://vendor.example/',
    'https://vendor.example/path',
    'ftp://vendor.example',
    'https://*vendor.example',
    'https://',
    '',
  ])('rejects %j', origin => {
    expect(() => parseOriginPattern(origin)).toThrow(/invalid origin/)
  })
})

describe('matchesOrigin', () => {
  it('matches the exact host, ignoring path and query', () => {
    expect(matches('https://widget.vendor.example/loader.js?v=2', 'https://widget.vendor.example')).toBe(true)
  })

  it('requires the same scheme', () => {
    expect(matches('http://widget.vendor.example/a.js', 'https://widget.vendor.example')).toBe(false)
    expect(matches('wss://rtc.vendor.example/socket', 'https://rtc.vendor.example')).toBe(false)
  })

  it('matches any subdomain for a wildcard, but not the bare domain or a look-alike', () => {
    expect(matches('https://a.b.vendor.example/x', 'https://*.vendor.example')).toBe(true)
    expect(matches('https://vendor.example/x', 'https://*.vendor.example')).toBe(false)
    expect(matches('https://evilvendor.example/x', 'https://*.vendor.example')).toBe(false)
  })

  it('implies default ports and requires listed non-default ones', () => {
    expect(matches('https://vendor.example:443/x', 'https://vendor.example')).toBe(true)
    expect(matches('https://vendor.example:8443/x', 'https://vendor.example')).toBe(false)
    expect(matches('http://127.0.0.1:4174/x', 'http://127.0.0.1:4174')).toBe(true)
  })

  it('ignores host case', () => {
    expect(matches('https://Widget.VENDOR.example/x', 'https://widget.vendor.example')).toBe(true)
  })

  it.each(['inline', 'eval', 'wasm-eval', '', 'data:text/plain,hi'])('never matches the non-URL value %j', value => {
    expect(matches(value, 'https://vendor.example')).toBe(false)
  })
})

describe('checkUrl', () => {
  it.each([
    ['https://widget.chat.example', 'https://widget.chat.example/'],
    ['https://WIDGET.chat.example:443', 'https://widget.chat.example/'],
    ['https://api.vendor.example:8443', 'https://api.vendor.example:8443/'],
    ['http://127.0.0.1:4174', 'http://127.0.0.1:4174/'],
  ])('checks %s at %s', (origin, url) => {
    expect(checkUrl(parseOriginPattern(origin))).toBe(url)
  })

  it.each(['https://*.vendor.example', 'wss://rtc.vendor.example', 'ws://rtc.vendor.example:8080'])(
    'has nothing to check for %s',
    origin => {
      expect(checkUrl(parseOriginPattern(origin))).toBeNull()
    },
  )
})
