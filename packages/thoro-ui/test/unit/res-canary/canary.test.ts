import { createCanary } from '../../../src/res-canary/canary.ts'
import type { Canary, CanaryOptions, CanaryStorage, Feature } from '../../../src/res-canary/types.ts'

const OWN = "default-src 'self'; connect-src https://api.own.example"
const FOREIGN = "script-src-elem 'self'"

const chat: Feature = {
  id: 'chat',
  impact: "The chat bubble won't appear.",
  label: 'Support chat',
  origins: ['https://widget.chat.example'],
}
const sign: Feature = {
  id: 'sign',
  impact: "You can't sign agreements.",
  label: 'E-signature',
  origins: ['https://*.sign.example'],
}

const started: Canary[] = []

function setup(overrides: Partial<CanaryOptions> = {}): Canary {
  const canary = createCanary({ features: [chat, sign], ownPolicy: 'api.own.example', storage: null, ...overrides })
  canary.start()
  started.push(canary)
  return canary
}

function violate(blockedURI: string, originalPolicy: string, disposition: 'enforce' | 'report' = 'enforce'): void {
  const event = new Event('securitypolicyviolation', { bubbles: true })
  Object.assign(event, { blockedURI, disposition, effectiveDirective: 'script-src-elem', originalPolicy })
  document.dispatchEvent(event)
}

function failImage(url: string): void {
  const image = document.createElement('img')
  image.src = url
  document.body.append(image)
  image.dispatchEvent(new Event('error'))
}

afterEach(() => {
  for (const canary of started.splice(0)) canary.stop()
  document.body.replaceChildren()
})

describe('createCanary', () => {
  it('starts with every feature unknown and nothing blocked', () => {
    expect(setup().getSnapshot()).toEqual({
      blocked: [],
      dismissed: false,
      statuses: { chat: 'unknown', sign: 'unknown' },
    })
  })

  it('marks a feature foreign-csp when another policy blocks it', () => {
    const canary = setup()
    violate('https://widget.chat.example/loader.js', FOREIGN)
    expect(canary.getSnapshot().statuses.chat).toBe('foreign-csp')
    expect(canary.getSnapshot().blocked).toEqual([{ ...chat, reason: 'foreign-csp' }])
  })

  it('marks own-csp, reports it, and keeps it out of the list', () => {
    const onOwnPolicyViolation = vi.fn()
    const canary = setup({ onOwnPolicyViolation })
    violate('https://eu.sign.example/sdk.js', OWN)
    expect(canary.getSnapshot().statuses.sign).toBe('own-csp')
    expect(canary.getSnapshot().blocked).toEqual([])
    expect(onOwnPolicyViolation).toHaveBeenCalledWith({
      blockedURI: 'https://eu.sign.example/sdk.js',
      effectiveDirective: 'script-src-elem',
      featureId: 'sign',
      originalPolicy: OWN,
    })
  })

  it('ignores report-only violations, unmatched URLs and non-URL values', () => {
    const canary = setup()
    violate('https://widget.chat.example/loader.js', FOREIGN, 'report')
    violate('https://unrelated.example/x.js', FOREIGN)
    violate('eval', FOREIGN)
    expect(canary.getSnapshot().statuses).toEqual({ chat: 'unknown', sign: 'unknown' })
  })

  it('marks load-failed when a matching element fails to load', () => {
    const canary = setup()
    failImage('https://eu.sign.example/logo.png')
    failImage('https://unrelated.example/logo.png')
    expect(canary.getSnapshot().statuses).toEqual({ chat: 'unknown', sign: 'load-failed' })
  })

  it('lets the more specific reason win whichever event arrives first', () => {
    const errorFirst = setup()
    failImage('https://widget.chat.example/a.png')
    violate('https://widget.chat.example/a.png', FOREIGN)
    expect(errorFirst.getSnapshot().statuses.chat).toBe('foreign-csp')
    errorFirst.stop()

    const violationFirst = setup()
    violate('https://widget.chat.example/b.png', FOREIGN)
    failImage('https://widget.chat.example/b.png')
    expect(violationFirst.getSnapshot().statuses.chat).toBe('foreign-csp')
  })

  it('updates every feature that shares an origin', () => {
    const shared: Feature = { ...sign, origins: ['https://widget.chat.example'] }
    const canary = setup({ features: [chat, shared] })
    failImage('https://widget.chat.example/a.png')
    expect(canary.getSnapshot().blocked.map(item => item.id)).toEqual(['chat', 'sign'])
  })

  it.each<[string, CanaryOptions['ownPolicy']]>([
    ['string', 'api.own.example'],
    ['RegExp', /api\.own\.example/],
    ['global RegExp', /api\.own\.example/g],
    ['function', policy => policy.startsWith("default-src 'self'")],
  ])('recognises its own policy given as a %s, every time', (_kind, ownPolicy) => {
    const onOwnPolicyViolation = vi.fn()
    const canary = setup({ onOwnPolicyViolation, ownPolicy })
    violate('https://widget.chat.example/a.js', OWN)
    violate('https://eu.sign.example/b.js', OWN)
    expect(canary.getSnapshot().statuses).toEqual({ chat: 'own-csp', sign: 'own-csp' })
    expect(onOwnPolicyViolation).toHaveBeenCalledTimes(2)
  })

  it('report() marks a feature load-failed and warns about unknown ids', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const canary = setup()
    canary.report('sign')
    canary.report('nope')
    canary.report('toString')
    expect(canary.getSnapshot().statuses).toEqual({ chat: 'unknown', sign: 'load-failed' })
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('dismiss() hides the list until another feature is blocked', () => {
    const canary = setup()
    canary.dismiss()
    expect(canary.getSnapshot().dismissed).toBe(false)
    failImage('https://widget.chat.example/a.png')
    canary.dismiss()
    expect(canary.getSnapshot().dismissed).toBe(true)
    failImage('https://eu.sign.example/b.png')
    expect(canary.getSnapshot().dismissed).toBe(false)
    expect(canary.getSnapshot().blocked.map(item => item.id)).toEqual(['chat', 'sign'])
  })

  it('remembers a dismissal on the next page load through storage', () => {
    const data = new Map<string, string>()
    const storage: CanaryStorage = {
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value)
      },
    }
    const first = setup({ storage })
    failImage('https://widget.chat.example/a.png')
    first.dismiss()
    first.stop()
    expect(data.get('thoro-ui:res-canary:dismissed')).toBe('chat')

    const second = setup({ storage })
    failImage('https://widget.chat.example/a.png')
    expect(second.getSnapshot().dismissed).toBe(true)
  })

  it('stops listening after stop()', () => {
    const canary = setup()
    canary.stop()
    failImage('https://widget.chat.example/a.png')
    violate('https://widget.chat.example/a.js', FOREIGN)
    expect(canary.getSnapshot().statuses.chat).toBe('unknown')
  })

  it('notifies once per change and keeps the snapshot reference otherwise', () => {
    const onChange = vi.fn()
    const canary = setup({ onChange })
    const listener = vi.fn()
    canary.subscribe(listener)
    const before = canary.getSnapshot()
    failImage('https://widget.chat.example/a.png')
    failImage('https://widget.chat.example/b.png')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(canary.getSnapshot())
    expect(canary.getSnapshot()).not.toBe(before)
    const after = canary.getSnapshot()
    expect(canary.getSnapshot()).toBe(after)
  })

  it('stops notifying a listener after it unsubscribes', () => {
    const canary = setup()
    const listener = vi.fn()
    const unsubscribe = canary.subscribe(listener)
    unsubscribe()
    canary.report('chat')
    expect(listener).not.toHaveBeenCalled()
  })

  it('works with destructured subscribe and getSnapshot, as useSyncExternalStore passes them', () => {
    const { getSnapshot, subscribe } = setup()
    const listener = vi.fn()
    subscribe(listener)
    failImage('https://widget.chat.example/a.png')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getSnapshot().blocked.map(item => item.id)).toEqual(['chat'])
  })

  it('keeps notifying other subscribers when one throws, and still surfaces the error', () => {
    const deferred: Array<() => void> = []
    vi.stubGlobal('queueMicrotask', (callback: () => void) => {
      deferred.push(callback)
    })
    const canary = setup({
      onChange: () => {
        throw new Error('telemetry down')
      },
    })
    const listener = vi.fn()
    canary.subscribe(listener)
    failImage('https://widget.chat.example/a.png')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(deferred).toHaveLength(1)
    expect(deferred[0]).toThrow('telemetry down')
  })

  const invalid: Array<[string, Partial<CanaryOptions>, RegExp]> = [
    ['duplicate ids', { features: [chat, chat] }, /duplicate feature id "chat"/],
    ['no origins', { features: [{ ...chat, origins: [] }] }, /has no origins/],
    ['a malformed origin', { features: [{ ...chat, origins: ['widget.chat.example'] }] }, /invalid origin/],
    ['an empty ownPolicy', { ownPolicy: ' ' }, /must not be an empty string/],
    ['a missing ownPolicy', { ownPolicy: undefined as unknown as string }, /ownPolicy is required/],
  ]

  it.each(invalid)('throws on %s', (_name, overrides, message) => {
    expect(() => createCanary({ features: [chat], ownPolicy: 'api.own.example', ...overrides })).toThrow(message)
  })
})
