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
  // lazy: these tests cover what start() does besides the eager checks, which have their own block below.
  const canary = createCanary({
    features: [chat, sign],
    lazy: true,
    ownPolicy: 'api.own.example',
    storage: null,
    ...overrides,
  })
  canary.start()
  started.push(canary)
  return canary
}

function violate(
  blockedURI: string,
  originalPolicy: string,
  disposition: 'enforce' | 'report' = 'enforce',
  effectiveDirective = 'script-src-elem',
): void {
  const event = new Event('securitypolicyviolation', { bubbles: true })
  Object.assign(event, { blockedURI, disposition, effectiveDirective, originalPolicy })
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

describe('probes', () => {
  const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

  it('marks a feature ok or load-failed from its probe', async () => {
    const canary = setup({
      features: [
        { ...chat, probe: { run: async () => true, type: 'custom' } },
        { ...sign, probe: { run: async () => false, type: 'custom' } },
      ],
    })
    await vi.waitFor(() => expect(canary.getSnapshot().statuses).toEqual({ chat: 'ok', sign: 'load-failed' }))
  })

  it('does not downgrade a failure when the probe succeeds afterwards', async () => {
    let finish: (ok: boolean) => void = () => {}
    const run = vi.fn(
      () =>
        new Promise<boolean>(resolve => {
          finish = resolve
        }),
    )
    const canary = setup({ features: [{ ...chat, probe: { run, type: 'custom' } }] })
    await vi.waitFor(() => expect(run).toHaveBeenCalled())
    failImage('https://widget.chat.example/a.png')
    finish(true)
    await tick()
    expect(canary.getSnapshot().statuses.chat).toBe('load-failed')
  })

  it('aborts the probe signal on stop() and ignores results that arrive afterwards', async () => {
    let finish: (ok: boolean) => void = () => {}
    const run = vi.fn(
      (_signal: AbortSignal) =>
        new Promise<boolean>(resolve => {
          finish = resolve
        }),
    )
    const canary = setup({ features: [{ ...chat, probe: { run, type: 'custom' } }] })
    await vi.waitFor(() => expect(run).toHaveBeenCalled())
    canary.stop()
    expect(run.mock.calls[0][0].aborted).toBe(true)
    finish(false)
    await tick()
    expect(canary.getSnapshot().statuses.chat).toBe('unknown')
  })

  it('rejects a probe URL outside the feature origins', () => {
    expect(() =>
      createCanary({
        features: [{ ...chat, probe: { type: 'script', url: 'https://other.example/a.js' } }],
        ownPolicy: 'api.own.example',
        storage: null,
      }),
    ).toThrow(/outside its origins/)
  })
})

describe('eager checks', () => {
  const CHECK = { credentials: 'omit', method: 'HEAD', mode: 'no-cors', referrerPolicy: 'no-referrer' }
  const pay: Feature = {
    id: 'pay',
    impact: "You can't pay.",
    label: 'Payments',
    origins: ['https://pay.example', 'https://cdn.pay.example'],
  }
  const refused = async (): Promise<Response> => {
    throw new TypeError('Failed to fetch')
  }

  function stubFetch(
    answer: (url: string, init: RequestInit) => Promise<Response> = async () => new Response(null),
  ): ReturnType<typeof vi.fn> {
    const fetch = vi.fn(answer)
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  // Long enough for every check here to settle, including the one-task wait after a refusal.
  const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 20))

  it('is eager by default: start() checks a feature with no probe', async () => {
    const fetch = stubFetch()
    const canary = createCanary({ features: [chat], ownPolicy: 'api.own.example', storage: null })
    canary.start()
    started.push(canary)
    await vi.waitFor(() => expect(canary.getSnapshot().statuses.chat).toBe('ok'))
    expect(fetch).toHaveBeenCalledWith('https://widget.chat.example/', { ...CHECK, signal: expect.any(AbortSignal) })
  })

  it('skips wildcard origins, which have no host to ask', async () => {
    const fetch = stubFetch()
    const canary = setup({ lazy: false })
    await vi.waitFor(() => expect(canary.getSnapshot().statuses).toEqual({ chat: 'ok', sign: 'unknown' }))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('marks a feature load-failed when its check is refused', async () => {
    stubFetch(refused)
    const canary = setup({ lazy: false })
    await vi.waitFor(() => expect(canary.getSnapshot().statuses.chat).toBe('load-failed'))
    expect(canary.getSnapshot().blocked.map(feature => feature.id)).toEqual(['chat'])
  })

  it('lets a feature override the top-level lazy either way', async () => {
    const fetch = stubFetch()
    setup({ features: [{ ...chat, lazy: false }, pay], lazy: true })
    setup({ features: [{ ...pay, lazy: true }], lazy: false })
    await settle()
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['https://widget.chat.example/'])
  })

  it('runs an explicit probe instead of the check, even on a lazy feature', async () => {
    const fetch = stubFetch()
    const canary = setup({
      features: [{ ...chat, lazy: true, probe: { run: async () => false, type: 'custom' } }],
      lazy: false,
    })
    await vi.waitFor(() => expect(canary.getSnapshot().statuses.chat).toBe('load-failed'))
    expect(fetch).not.toHaveBeenCalled()
  })

  // Review Focus 1
  it('checks an origin once, however many features list it and however it is written', async () => {
    const fetch = stubFetch()
    const twin: Feature = { ...chat, id: 'twin', origins: ['https://WIDGET.chat.example:443'] }
    const canary = setup({ features: [chat, twin], lazy: false })
    await vi.waitFor(() => expect(canary.getSnapshot().statuses).toEqual({ chat: 'ok', twin: 'ok' }))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  // Review Focus 3
  it('fails a feature when any of its origins fails, and ignores its wildcard origins', async () => {
    const fetch = stubFetch(async url => {
      if (url === 'https://cdn.pay.example/') throw new TypeError('Failed to fetch')
      return new Response(null)
    })
    const canary = setup({ features: [{ ...pay, origins: [...pay.origins, 'https://*.pay.example'] }], lazy: false })
    await vi.waitFor(() => expect(canary.getSnapshot().statuses.pay).toBe('load-failed'))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  // Review Focus 5 is the second case.
  const timings: Array<[string, (fire: () => void) => void]> = [
    ['before the refusal', fire => fire()],
    ['a few microtasks after the refusal', fire => queueMicrotask(() => queueMicrotask(() => queueMicrotask(fire)))],
  ]

  it.each(timings)(
    'treats a check your own connect-src blocks as inconclusive (violation %s)',
    async (_when, schedule) => {
      const onOwnPolicyViolation = vi.fn()
      const fetch = stubFetch(async url => {
        schedule(() => violate(url, OWN, 'enforce', 'connect-src'))
        throw new TypeError('Failed to fetch')
      })
      const canary = setup({ lazy: false, onOwnPolicyViolation })
      await settle()
      // The check really ran and was refused; only the violation made it inconclusive.
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(canary.getSnapshot().statuses.chat).toBe('unknown')
      expect(onOwnPolicyViolation).not.toHaveBeenCalled()
    },
  )

  // Review Focus 4
  it("still reports your own violations for a checked vendor that aren't the check", async () => {
    const onOwnPolicyViolation = vi.fn()
    stubFetch()
    const canary = setup({ lazy: false, onOwnPolicyViolation })
    await vi.waitFor(() => expect(canary.getSnapshot().statuses.chat).toBe('ok'))
    violate('https://widget.chat.example/api', OWN, 'enforce', 'connect-src')
    expect(canary.getSnapshot().statuses.chat).toBe('own-csp')
    expect(onOwnPolicyViolation).toHaveBeenCalledTimes(1)
  })

  it('marks load-failed as soon as one origin is refused, without waiting for a silent one', async () => {
    stubFetch(url => (url === 'https://cdn.pay.example/' ? refused() : new Promise<Response>(() => {})))
    const canary = setup({ features: [pay], lazy: false, probeTimeoutMs: 0 })
    await vi.waitFor(() => expect(canary.getSnapshot().statuses.pay).toBe('load-failed'))
  })

  it('recognises its own check when the browser reports the origin without the trailing slash', async () => {
    const onOwnPolicyViolation = vi.fn()
    const fetch = stubFetch(async () => {
      violate('https://widget.chat.example', OWN, 'enforce', 'connect-src')
      throw new TypeError('Failed to fetch')
    })
    const canary = setup({ lazy: false, onOwnPolicyViolation })
    await settle()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(canary.getSnapshot().statuses.chat).toBe('unknown')
    expect(onOwnPolicyViolation).not.toHaveBeenCalled()
  })

  // Pins that canary.ts registers the exact URL the script probe's fetch half requests (probes.ts): written
  // with an upper-case host, it only matches if both sides normalise it the same way.
  it('leaves a script probe to its preload when your own connect-src blocks its fetch', async () => {
    const onOwnPolicyViolation = vi.fn()
    stubFetch(async url => {
      violate(url, OWN, 'enforce', 'connect-src')
      throw new TypeError('Failed to fetch')
    })
    const canary = setup({
      features: [{ ...chat, probe: { type: 'script', url: 'https://WIDGET.chat.example/loader.js' } }],
      onOwnPolicyViolation,
    })
    document.head.querySelector('link[rel="preload"]')?.dispatchEvent(new Event('load'))
    await vi.waitFor(() => expect(canary.getSnapshot().statuses.chat).toBe('ok'))
    expect(onOwnPolicyViolation).not.toHaveBeenCalled()
  })

  // Review Focus 2
  it('aborts pending checks on stop() and checks again after start()', async () => {
    const signals: AbortSignal[] = []
    stubFetch((_url, init) => {
      if (init.signal) signals.push(init.signal)
      return new Promise<Response>(() => {})
    })
    const canary = setup({ lazy: false, probeTimeoutMs: 0 })
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    canary.stop()
    expect(signals[0].aborted).toBe(true)
    canary.start()
    await vi.waitFor(() => expect(signals).toHaveLength(2))
    expect(signals[1].aborted).toBe(false)
  })
})
