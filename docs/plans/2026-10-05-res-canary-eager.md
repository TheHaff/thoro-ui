# res-canary eager checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `start()` checks every vendor origin it can (eager by default, `lazy` opts out), and script and style probes catch blocks in Firefox.

**Architecture:** `probes.ts` gains a tri-state result (`true` reachable, `false` blocked, `null` inconclusive), a `checkOrigin()` for the automatic check, a stylesheet-based `style` probe and a preload-plus-fetch `script` probe. `origins.ts` gains `checkUrl()`. `canary.ts` runs one check per origin at `start()`, combines each feature's results, and treats the canary's own request blocked by the app's own `connect-src` as inconclusive.

**Tech Stack:** TypeScript 7.0.2, Vite+ 1.0.0 (Vitest 5.0.1 on happy-dom 20.14.5, oxlint, oxfmt, tsdown), Playwright 1.63.0, size-limit.

**Spec:** `docs/specs/2026-10-05-res-canary-eager-design.md`, which amends `docs/specs/2026-09-29-res-canary-design.md`.

## Global Constraints

- Everything in `packages/thoro-ui/src/` runs under the strictest CSP: no `innerHTML`, no `eval`, no string timers; DOM through `createElement`. Zero runtime dependencies.
- Nothing touches `window`, `document` or `fetch` at import time.
- Every exported function and constant has an explicit type (`isolatedDeclarations`).
- The automatic check is exactly `fetch(<origin>/, { credentials: 'omit', method: 'HEAD', mode: 'no-cors', referrerPolicy: 'no-referrer', signal })`.
- An explicit `fetch` probe keeps today's behaviour: `fetch(url, { mode: 'no-cors', signal })`, and a block by the app's own CSP is `own-csp` plus `onOwnPolicyViolation`.
- Budgets (gzip): core ≤ 2.5 KB (raised from 2 KB with the maintainer's agreement), element ≤ 4 KB, React ≤ 2 KB.
- Examples and tests use `*.example`, `*.invalid` and `127.0.0.1` hosts only — except the two Firefox tracker test hosts (`trackertest.org`, `itisatracker.org`), which Firefox's own test tables name and which the tracking-protection test never contacts.
- Unit tests must not touch the network: stub `fetch`, and keep happy-dom's CSS file loading off.
- Node 24 (`.node-version`); pnpm. The maintainer makes every commit: each task ends with a hand-off, not `git commit`.
- Firefox can't launch inside the agent sandbox; Firefox results come from CI (or the maintainer's terminal).

## Review Focus

1. **The same origin written two ways** (`https://widget.chat.example` and `https://WIDGET.chat.example:443`) → one request, both features updated. Test: Task 2.
2. **`stop()` then `start()` again** → pending checks aborted, a fresh round of checks runs. Test: Task 2.
3. **A feature with a wildcard and a concrete origin** → only the concrete one is checked, and its result decides the feature. Test: Task 2.
4. **An own `connect-src` violation for a checked vendor that isn't the canary's check** (the app's own API call) → still `own-csp` and `onOwnPolicyViolation`. Test: Task 2.
5. **The violation arriving a few microtasks after the check's rejection** → still inconclusive. Test: Task 2.

## File Structure

```
packages/thoro-ui/
  src/res-canary/types.ts          + lazy on Feature and CanaryOptions                (Task 2)
  src/res-canary/origins.ts        + checkUrl()                                        (Task 1)
  src/res-canary/probes.ts         tri-state results, checkOrigin(), new script/style  (Task 1)
  src/res-canary/canary.ts         eager checks, sharing, inconclusive rule            (Task 2)
  vite.config.ts                   happy-dom CSS file loading off                      (Task 1)
  test/unit/res-canary/origins.test.ts, probes.test.ts                                 (Task 1)
  test/unit/res-canary/canary.test.ts                                                  (Task 2)
  test/browser/server.ts           policies no-connect and trackers                    (Task 3)
  test/browser/fixtures/res-canary-harness.js, globals.d.ts   lazy + origins options   (Task 3)
  test/browser/fixtures-src/res-canary-react.tsx              lazy: true               (Task 3)
  test/browser/res-canary/scenarios.spec.ts                   eager + 403 scenarios    (Task 3)
  test/browser/res-canary/tracking-protection.spec.ts         Firefox-only             (Task 3)
  playwright.config.ts             the firefox-tracking-protection project             (Task 3)
  .size-limit.json, package.json, README.md                                            (Task 4)
site/res-canary/index.html                                                             (Task 4)
docs/specs/*, AGENTS.md                                                                (Task 4)
```

---

### Task 1: Tri-state checks, the origin check, and Firefox-safe script and style probes

**Files:**

- Modify: `packages/thoro-ui/src/res-canary/origins.ts`, `packages/thoro-ui/src/res-canary/probes.ts`, `packages/thoro-ui/vite.config.ts`
- Test: `packages/thoro-ui/test/unit/res-canary/origins.test.ts`, `packages/thoro-ui/test/unit/res-canary/probes.test.ts`

**Interfaces:**

- Consumes: `OriginPattern` (`{ host, port, scheme, wildcard }`) from `origins.ts`; `Probe` from `types.ts`.
- Produces (Task 2 relies on these exact names):
  - `export function checkUrl(pattern: OriginPattern): string | null` — `'https://widget.chat.example/'`; `null` for wildcard and `ws(s)` origins.
  - `export type CheckResult = boolean | null`
  - `export type OwnBlocked = (url: string) => boolean`
  - `export function runProbe(probe: Probe, timeoutMs: number, signal: AbortSignal, ownBlocked: OwnBlocked): Promise<CheckResult>`
  - `export function checkOrigin(url: string, timeoutMs: number, signal: AbortSignal, ownBlocked: OwnBlocked): Promise<CheckResult>`
  - A script probe fetches `new URL(probe.url).href`, so Task 2 registers that same string as one of the canary's own checks.

- [ ] **Step 1: Turn off happy-dom's stylesheet loading**

happy-dom fetches `<link rel="stylesheet">` over the real network (verified 2026-10-05: `getaddrinfo ENOTFOUND cdn.example`). With `disableCSSFileLoading` it fires `error` on the link a moment later instead, without the network; tests dispatch their own event synchronously first, so theirs always wins.

In `packages/thoro-ui/vite.config.ts`, inside `test: { … }`, add after `environment: 'happy-dom',`:

```ts
    // happy-dom would fetch stylesheets over the network; style-probe tests dispatch load/error themselves.
    environmentOptions: { happyDOM: { settings: { disableCSSFileLoading: true } } },
```

- [ ] **Step 2: Write the failing origin tests**

Append to `packages/thoro-ui/test/unit/res-canary/origins.test.ts` (and add `checkUrl` to its import from `origins.ts`):

```ts
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
```

- [ ] **Step 3: Rewrite the probe tests**

Replace the whole of `packages/thoro-ui/test/unit/res-canary/probes.test.ts` with:

```ts
import { checkOrigin, runProbe, type OwnBlocked } from '../../../src/res-canary/probes.ts'

const signal = new AbortController().signal
const notBlocked: OwnBlocked = () => false
const CHECK = { credentials: 'omit', method: 'HEAD', mode: 'no-cors', referrerPolicy: 'no-referrer', signal }

const reachable = async (): Promise<Response> => new Response(null)
const refused = async (): Promise<Response> => {
  throw new TypeError('Failed to fetch')
}

function stubFetch(answer: () => Promise<Response>): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(answer)
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function link(rel: string): HTMLLinkElement {
  const found = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!found) throw new Error(`no ${rel} link in <head>`)
  return found
}

afterEach(() => {
  vi.useRealTimers()
  document.head.replaceChildren()
})

describe('runProbe', () => {
  it('preloads a script without running it and fetches it too, then removes the link', async () => {
    const fetch = stubFetch(reachable)
    const result = runProbe({ type: 'script', url: 'https://cdn.example/a.js' }, 0, signal, notBlocked)
    expect(link('preload').as).toBe('script')
    expect(link('preload').href).toBe('https://cdn.example/a.js')
    link('preload').dispatchEvent(new Event('load'))
    await expect(result).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledWith('https://cdn.example/a.js', CHECK)
    expect(document.head.querySelector('link')).toBeNull()
  })

  it.each([
    ['its preload fails', 'error', reachable],
    ['its fetch is refused, as in Firefox, whose preload fires load anyway', 'load', refused],
  ] as const)('fails a script probe when %s', async (_name, event, answer) => {
    stubFetch(answer)
    const result = runProbe({ type: 'script', url: 'https://cdn.example/a.js' }, 0, signal, notBlocked)
    link('preload').dispatchEvent(new Event(event))
    await expect(result).resolves.toBe(false)
  })

  it('leaves a script probe to its preload when your own CSP blocked the fetch', async () => {
    stubFetch(refused)
    const result = runProbe({ type: 'script', url: 'https://cdn.example/a.js' }, 0, signal, () => true)
    link('preload').dispatchEvent(new Event('load'))
    await expect(result).resolves.toBe(true)
  })

  it('loads a style probe as a stylesheet that never applies, then removes it', async () => {
    const ok = runProbe({ type: 'style', url: 'https://cdn.example/s.css' }, 0, signal, notBlocked)
    expect(link('stylesheet').media).toBe('not all')
    expect(link('stylesheet').href).toBe('https://cdn.example/s.css')
    link('stylesheet').dispatchEvent(new Event('load'))
    await expect(ok).resolves.toBe(true)
    expect(document.head.querySelector('link')).toBeNull()

    const failed = runProbe({ type: 'style', url: 'https://cdn.example/s.css' }, 0, signal, notBlocked)
    link('stylesheet').dispatchEvent(new Event('error'))
    await expect(failed).resolves.toBe(false)
  })

  it('loads a detached image', async () => {
    const images: HTMLImageElement[] = []
    vi.stubGlobal('Image', function FakeImage() {
      const image = document.createElement('img')
      images.push(image)
      return image
    })
    const ok = runProbe({ type: 'image', url: 'https://cdn.example/p.png' }, 0, signal, notBlocked)
    images[0].dispatchEvent(new Event('load'))
    await expect(ok).resolves.toBe(true)
    expect(images[0].src).toBe('https://cdn.example/p.png')
    expect(images[0].isConnected).toBe(false)

    const failed = runProbe({ type: 'image', url: 'https://cdn.example/p.png' }, 0, signal, notBlocked)
    images[1].dispatchEvent(new Event('error'))
    await expect(failed).resolves.toBe(false)
  })

  it('keeps a fetch probe as you configured it: no-cors GET, own-CSP blocks count as blocked', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetch)
    await expect(runProbe({ type: 'fetch', url: 'https://api.example/ping' }, 0, signal, () => true)).resolves.toBe(
      true,
    )
    await expect(runProbe({ type: 'fetch', url: 'https://api.example/ping' }, 0, signal, () => true)).resolves.toBe(
      false,
    )
    expect(fetch).toHaveBeenCalledWith('https://api.example/ping', { mode: 'no-cors', signal })
  })

  const customs: Array<[string, (signal: AbortSignal) => Promise<boolean>, boolean]> = [
    ['true', async () => true, true],
    ['false', async () => false, false],
    ['a non-boolean', async () => 'yes' as unknown as boolean, false],
    [
      'a rejection',
      async () => {
        throw new Error('nope')
      },
      false,
    ],
    [
      'a synchronous throw',
      () => {
        throw new Error('sync')
      },
      false,
    ],
  ]

  it.each(customs)('maps a custom probe returning %s', async (_name, run, expected) => {
    await expect(runProbe({ run, type: 'custom' }, 0, signal, notBlocked)).resolves.toBe(expected)
  })

  it('fails a probe that does not settle within the timeout, and ignores a late answer', async () => {
    vi.useFakeTimers()
    stubFetch(() => new Promise<Response>(() => {}))
    const settled = vi.fn()
    void runProbe({ type: 'script', url: 'https://cdn.example/hang.js' }, 500, signal, notBlocked).then(settled)
    await vi.advanceTimersByTimeAsync(499)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toHaveBeenCalledWith(false)
    link('preload').dispatchEvent(new Event('load'))
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toHaveBeenCalledTimes(1)
  })
})

describe('checkOrigin', () => {
  it('sends HEAD, no cookies and no referrer, and counts any answer as reachable', async () => {
    const fetch = stubFetch(async () => new Response(null, { status: 404 }))
    await expect(checkOrigin('https://widget.chat.example/', 0, signal, notBlocked)).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledWith('https://widget.chat.example/', CHECK)
  })

  it('counts a refused check as blocked, unless your own CSP blocked it', async () => {
    stubFetch(refused)
    await expect(checkOrigin('https://widget.chat.example/', 0, signal, notBlocked)).resolves.toBe(false)
    await expect(checkOrigin('https://widget.chat.example/', 0, signal, () => true)).resolves.toBeNull()
  })

  it('waits one task after a refusal, so a violation that arrives just after it still counts', async () => {
    stubFetch(refused)
    let blocked = false
    const result = checkOrigin('https://widget.chat.example/', 0, signal, () => blocked)
    queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => (blocked = true))))
    await expect(result).resolves.toBeNull()
  })

  it('fails a check that does not answer within the timeout', async () => {
    vi.useFakeTimers()
    stubFetch(() => new Promise<Response>(() => {}))
    const settled = vi.fn()
    void checkOrigin('https://widget.chat.example/', 500, signal, notBlocked).then(settled)
    await vi.advanceTimersByTimeAsync(500)
    expect(settled).toHaveBeenCalledWith(false)
  })
})
```

- [ ] **Step 4: Run them to verify they fail**

Run: `pnpm -C packages/thoro-ui test test/unit/res-canary/origins.test.ts test/unit/res-canary/probes.test.ts`
Expected: FAIL — `checkUrl` and `checkOrigin` are not exported; the script test finds no `fetch` call; the style test finds no `link[rel="stylesheet"]`.

- [ ] **Step 5: Add `checkUrl`**

Append to `packages/thoro-ui/src/res-canary/origins.ts`:

```ts
/**
 * The URL the automatic start-up check fetches for an origin, or null when there is no single host to ask:
 * a wildcard, or a ws(s) origin, which fetch can't reach and whose connect-src entry wouldn't cover https.
 */
export function checkUrl(pattern: OriginPattern): string | null {
  if (pattern.wildcard || !pattern.scheme.startsWith('http')) return null
  return new URL(`${pattern.scheme}://${pattern.host}:${pattern.port}/`).href
}
```

- [ ] **Step 6: Rewrite `probes.ts`**

Replace the whole of `packages/thoro-ui/src/res-canary/probes.ts` with:

```ts
import type { Probe } from './types.ts'

/** true = reachable, false = blocked, null = inconclusive: the app's own CSP blocked the canary's own check. */
export type CheckResult = boolean | null

/** Whether the app's own CSP blocked the canary's own request to this URL. */
export type OwnBlocked = (url: string) => boolean

/** Resolves with the probe's result. Never rejects. */
export function runProbe(
  probe: Probe,
  timeoutMs: number,
  signal: AbortSignal,
  ownBlocked: OwnBlocked,
): Promise<CheckResult> {
  return withTimeout(attemptProbe(probe, signal, ownBlocked), timeoutMs)
}

/** The automatic start-up check of one origin, given as its root URL ('https://widget.chat.example/'). */
export function checkOrigin(
  url: string,
  timeoutMs: number,
  signal: AbortSignal,
  ownBlocked: OwnBlocked,
): Promise<CheckResult> {
  return withTimeout(check(url, signal, ownBlocked), timeoutMs)
}

function withTimeout(attempt: Promise<CheckResult>, timeoutMs: number): Promise<CheckResult> {
  if (timeoutMs <= 0) return attempt
  return new Promise(resolve => {
    // A firewall that drops packets never answers; treat silence as blocked.
    const timer = setTimeout(() => resolve(false), timeoutMs)
    void attempt.then(result => {
      clearTimeout(timer)
      resolve(result)
    })
  })
}

// The canary's own request: any HTTP answer, even a 404 or 405, means the host is reachable, and no cookies
// or referrer go to the vendor. A refusal is a block unless the app's own CSP caused it; that violation
// event can arrive just after the refusal, so the decision waits one task.
function check(url: string, signal: AbortSignal, ownBlocked: OwnBlocked): Promise<CheckResult> {
  return fetch(url, {
    credentials: 'omit',
    method: 'HEAD',
    mode: 'no-cors',
    referrerPolicy: 'no-referrer',
    signal,
  }).then(
    () => true,
    () => new Promise<CheckResult>(resolve => setTimeout(() => resolve(ownBlocked(url) ? null : false), 0)),
  )
}

function attemptProbe(probe: Probe, signal: AbortSignal, ownBlocked: OwnBlocked): Promise<CheckResult> {
  switch (probe.type) {
    case 'script': {
      // A preload makes the script-type request ad blockers filter on without running the script. Firefox fires
      // load on it whatever happens to the request, so a fetch runs alongside: either failing fails the probe,
      // and a fetch your own CSP blocked leaves it to the preload.
      const url = new URL(probe.url).href
      return Promise.all([
        loadLink(link => {
          link.rel = 'preload'
          link.as = 'script'
          link.href = url
        }),
        check(url, signal, ownBlocked),
      ]).then(([loaded, fetched]) => loaded && fetched !== false)
    }
    case 'style':
      // Never applies (no medium matches "not all"), and fires error on a failed load in every engine.
      return loadLink(link => {
        link.rel = 'stylesheet'
        link.media = 'not all'
        link.href = probe.url
      })
    case 'image':
      return loadImage(probe.url)
    case 'fetch':
      return fetch(probe.url, { mode: 'no-cors', signal }).then(
        () => true,
        () => false,
      )
    case 'custom': {
      const { run } = probe
      return Promise.resolve()
        .then(() => run(signal))
        .then(
          ok => ok === true,
          () => false,
        )
    }
  }
}

function loadLink(configure: (link: HTMLLinkElement) => void): Promise<boolean> {
  return new Promise(resolve => {
    const link = document.createElement('link')
    const settle = (ok: boolean): void => {
      link.remove()
      resolve(ok)
    }
    configure(link)
    link.addEventListener('load', () => settle(true), { once: true })
    link.addEventListener('error', () => settle(false), { once: true })
    document.head.append(link)
  })
}

function loadImage(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const image = new Image()
    image.addEventListener('load', () => resolve(true), { once: true })
    image.addEventListener('error', () => resolve(false), { once: true })
    image.src = url
  })
}
```

- [ ] **Step 7: Run them to verify they pass**

Run: `pnpm -C packages/thoro-ui test test/unit/res-canary/origins.test.ts test/unit/res-canary/probes.test.ts && pnpm format && pnpm lint`
Expected: PASS, and format and lint exit 0. (`canary.ts` still calls `runProbe` with three arguments; Task 2 updates it. `pnpm typecheck` reports that until then — expected.)

- [ ] **Step 8: Hand off for commit**

Propose: `feat: add the origin check and make script and style probes catch blocks in Firefox`. Do not run git.

---

### Task 2: Eager checks in the canary

**Files:**

- Modify: `packages/thoro-ui/src/res-canary/types.ts`, `packages/thoro-ui/src/res-canary/canary.ts`
- Test: `packages/thoro-ui/test/unit/res-canary/canary.test.ts`

**Interfaces:**

- Consumes (Task 1): `checkUrl(pattern): string | null`; `runProbe(probe, timeoutMs, signal, ownBlocked): Promise<CheckResult>`; `checkOrigin(url, timeoutMs, signal, ownBlocked): Promise<CheckResult>`; `CheckResult`; script probes fetch `new URL(probe.url).href`.
- Produces: `Feature.lazy?: boolean`, `CanaryOptions.lazy?: boolean` (Tasks 3 and 4 use them).

- [ ] **Step 1: Keep the existing tests on 0.1 behaviour, and let violations name a directive**

In `packages/thoro-ui/test/unit/res-canary/canary.test.ts`, replace `setup` and `violate` with:

```ts
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
```

- [ ] **Step 2: Write the failing eager tests**

Append to `packages/thoro-ui/test/unit/res-canary/canary.test.ts`:

```ts
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
      stubFetch(async url => {
        schedule(() => violate(url, OWN, 'enforce', 'connect-src'))
        throw new TypeError('Failed to fetch')
      })
      const canary = setup({ lazy: false, onOwnPolicyViolation })
      await settle()
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
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm -C packages/thoro-ui test test/unit/res-canary/canary.test.ts`
Expected: FAIL — the `eager checks` tests (no fetch is made; `lazy` is not a known option to the type checker but Vitest runs anyway). Every pre-existing test still passes.

- [ ] **Step 4: Add `lazy` to the types**

In `packages/thoro-ui/src/res-canary/types.ts`, in `Feature`, after `probe?: Probe`:

```ts
  /** Skip the automatic start-up check of this feature's origins. Overrides CanaryOptions.lazy. */
  lazy?: boolean
```

In `CanaryOptions`, after `probeTimeoutMs?: number`:

```ts
  /** Default false: start() checks every vendor origin it can. true = only the probes you configure. */
  lazy?: boolean
```

- [ ] **Step 5: Wire the checks into the canary**

In `packages/thoro-ui/src/res-canary/canary.ts`:

Replace the two imports from `./origins.ts` and `./probes.ts` with:

```ts
import { checkUrl, matchesOrigin, parseOriginPattern, type OriginPattern } from './origins.ts'
import { checkOrigin, runProbe, type CheckResult } from './probes.ts'
```

After `let controller: AbortController | null = null`, add:

```ts
// URLs the canary fetches itself, and those of them the app's own connect-src blocked (eager spec §3).
const ownChecks = new Set<string>()
const blockedChecks = new Set<string>()
```

In `onViolation`, replace the line `const own = isOwnPolicy(policy)` with:

```ts
const own = isOwnPolicy(policy)
// The canary's own check, blocked by your connect-src: inconclusive, and not your bug to report.
if (own && event.effectiveDirective === 'connect-src' && ownChecks.has(event.blockedURI)) {
  blockedChecks.add(event.blockedURI)
  return
}
```

In `start()`, replace everything from `const timeoutMs = options.probeTimeoutMs ?? 15_000` to the end of the `for` loop with:

```ts
const timeoutMs = options.probeTimeoutMs ?? 15_000
const ownBlocked = (url: string): boolean => blockedChecks.has(url)
// One request per origin, however many features list it.
const shared = new Map<string, Promise<CheckResult>>()
const check = (url: string): Promise<CheckResult> => {
  ownChecks.add(url)
  let result = shared.get(url)
  if (!result) {
    result = checkOrigin(url, timeoutMs, signal, ownBlocked)
    shared.set(url, result)
  }
  return result
}
for (const { feature, patterns } of compiled) {
  const { probe } = feature
  let results: Array<Promise<CheckResult>> = []
  if (probe) {
    if (probe.type === 'script') ownChecks.add(new URL(probe.url).href)
    results = [runProbe(probe, timeoutMs, signal, ownBlocked)]
  } else if (!(feature.lazy ?? options.lazy)) {
    results = patterns.flatMap(pattern => {
      const url = checkUrl(pattern)
      return url ? [check(url)] : []
    })
  }
  void Promise.all(results).then(values => {
    if (signal.aborted) return
    if (values.includes(false)) setStatus(feature.id, 'load-failed')
    else if (values.includes(true)) setStatus(feature.id, 'ok')
  })
}
```

- [ ] **Step 6: Run the tests and the type check**

Run: `pnpm -C packages/thoro-ui test && pnpm typecheck && pnpm format && pnpm lint`
Expected: PASS — every unit test, `tsc` with no errors, and format and lint exit 0.

- [ ] **Step 7: Check the size**

Run: `pnpm build && pnpm -C packages/thoro-ui exec size-limit --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const r of JSON.parse(s))console.log(r.name, r.size)})'`
Expected: core under 2560 bytes (2.5 KB). `pnpm size` itself still fails on the old 2 KB limit until Task 4 raises it. If core is over 2.5 KB, trim before going on (shorter comments don't count; code does), and do not raise the budget further.

- [ ] **Step 8: Hand off for commit**

Propose: `feat: check every vendor origin at start, with lazy to opt out`. Do not run git.

---

### Task 3: Browser scenarios in all three engines

**Files:**

- Modify: `packages/thoro-ui/test/browser/server.ts`, `packages/thoro-ui/test/browser/fixtures/res-canary-harness.js`, `packages/thoro-ui/test/browser/globals.d.ts`, `packages/thoro-ui/test/browser/fixtures-src/res-canary-react.tsx`, `packages/thoro-ui/test/browser/res-canary/scenarios.spec.ts`, `packages/thoro-ui/playwright.config.ts`
- Create: `packages/thoro-ui/test/browser/res-canary/tracking-protection.spec.ts`

**Interfaces:**

- Consumes: `lazy` (Task 2); the built `dist/` (the `test:browser` script builds first).
- Produces: `harness.start({ lazy?, origins? })` for the fixtures; fixture policies `no-connect` and `trackers`.

- [ ] **Step 1: Add the fixture policies**

In `packages/thoro-ui/test/browser/server.ts`, after the `OWN_WITHOUT_VENDOR` block, add:

```ts
// Our own policy, allowing the vendor everywhere except connect-src, as many apps do.
const OWN_WITHOUT_CONNECT = [
  "default-src 'self'",
  "script-src 'self'",
  `script-src-elem 'self' ${VENDOR} ${CLOSED}`,
  `style-src 'self' ${VENDOR} ${CLOSED}`,
  `img-src 'self' ${VENDOR} ${CLOSED}`,
  `connect-src 'self' ${OWN_MARKER}`,
].join('; ')

// Firefox's tracker test hosts, so the tracking-protection test reaches the check.
const TRACKERS = `${OWN} http://trackertest.org`
```

Note `TRACKERS` appends to the last directive of `OWN`, which is `connect-src`. Add both to `POLICIES`:

```ts
  'no-connect': [OWN_WITHOUT_CONNECT],
  trackers: [TRACKERS],
```

- [ ] **Step 2: Give the harness `lazy` and `origins`**

In `packages/thoro-ui/test/browser/fixtures/res-canary-harness.js`, replace the `start` method's first two lines with:

```js
  // lazy by default: the other scenarios cover what start() does besides the eager checks.
  start({ banner = false, lazy = true, origins = [VENDOR, CLOSED], probe, probeTimeoutMs = 2000 } = {}) {
    canary = createCanary({
      features: [{ id: 'widget', impact: "The widget won't load.", label: 'Widget', origins, probe }],
      lazy,
```

(the rest of the `createCanary` call — `onOwnPolicyViolation`, `ownPolicy`, `probeTimeoutMs`, `storage` — stays). In `packages/thoro-ui/test/browser/globals.d.ts`, change the `start` signature to:

```ts
    start(options?: {
      banner?: boolean
      lazy?: boolean
      origins?: string[]
      probe?: HarnessProbe
      probeTimeoutMs?: number
    }): void
```

In `packages/thoro-ui/test/browser/fixtures-src/res-canary-react.tsx`, add `lazy: true,` to its `createCanary({ … })` options (after `features: […],`): that fixture tests rendering and reports the block itself.

- [ ] **Step 3: Write the failing scenarios**

In `packages/thoro-ui/test/browser/res-canary/scenarios.spec.ts`:

Change `open`'s `csp` parameter type to `'allowed' | 'foreign' | 'own-blocks' | 'strict' | 'no-connect'`.

In the `probes` describe, in the `refused → load-failed` test, delete the `test.fail(…)` line and the two comment lines above it, and change `async ({ browserName, page })` back to `async ({ page })` (script and style probes now catch a refused connection in Firefox, through the fetch half and the stylesheet).

Append after the `probes` describe:

```ts
test.describe('403 block pages', () => {
  for (const { path, type } of [
    { path: '/blocked.js', type: 'script' },
    { path: '/blocked.css', type: 'style' },
  ] as const) {
    test(`${type} probe: a proxy's 403 page → load-failed`, async ({ browserName, page }) => {
      // Known gap, listed in the README: a fetch counts any HTTP answer as reachable, and Firefox's preload
      // fires load anyway, so Firefox's script probe misses an error page.
      test.fail(browserName === 'firefox' && type === 'script')
      await page.route(`${VENDOR}/blocked.*`, route =>
        route.fulfill({ body: '<h1>Blocked by policy</h1>', contentType: 'text/html', status: 403 }),
      )
      await open(page, 'allowed')
      await page.evaluate(probe => harness.start({ probe }), { type, url: VENDOR + path })
      await expect.poll(() => status(page)).toBe('load-failed')
    })
  }
})

test.describe('eager checks', () => {
  test('a reachable vendor origin → ok', async ({ page }) => {
    await open(page, 'allowed')
    await page.evaluate(origins => harness.start({ lazy: false, origins }), [VENDOR])
    await expect.poll(() => status(page)).toBe('ok')
  })

  test('a refused vendor origin → load-failed, in every engine', async ({ page }) => {
    await open(page, 'allowed')
    await page.evaluate(origins => harness.start({ banner: true, lazy: false, origins }), [CLOSED])
    await expect.poll(() => status(page)).toBe('load-failed')
    await expect.poll(() => bannerText(page)).toContain('Widget')
  })

  test('your CSP without connect-src for the vendor → inconclusive, not reported as yours', async ({ page }) => {
    await open(page, 'no-connect')
    await page.evaluate(origins => harness.start({ lazy: false, origins }), [VENDOR])
    // The check really was blocked by our own connect-src…
    await expect
      .poll(() => page.evaluate(() => harness.violations))
      .toContainEqual({ blockedURI: `${VENDOR}/`, directive: 'connect-src' })
    // …and once it has had time to settle, it changed nothing.
    await page.waitForTimeout(300)
    expect(await status(page)).toBe('unknown')
    expect(await page.evaluate(() => harness.own)).toEqual([])
  })
})
```

Create `packages/thoro-ui/test/browser/res-canary/tracking-protection.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

// Runs only in the firefox-tracking-protection project (playwright.config.ts), which turns on Firefox's
// tracking protection with the test table Firefox ships for its own tests.
const TRACKER = 'http://trackertest.org'

test('an eager check of a host tracking protection blocks → load-failed', async ({ page }) => {
  // If tracking protection did not block the check, this route would answer it and the check would pass.
  let reached = false
  await page.route(`${TRACKER}/**`, route => {
    reached = true
    return route.fulfill({ body: '', status: 200 })
  })
  await page.goto('/page?csp=trackers&script=res-canary-harness')
  await page.evaluate(origins => harness.start({ lazy: false, origins }), [TRACKER])
  await expect.poll(() => page.evaluate(() => harness.status())).toBe('load-failed')
  expect(reached).toBe(false)
})
```

In `packages/thoro-ui/playwright.config.ts`, replace `projects` with:

```ts
  projects: [
    { name: 'chromium', testIgnore: /tracking-protection/, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testIgnore: /tracking-protection/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testIgnore: /tracking-protection/, use: { ...devices['Desktop Safari'] } },
    {
      name: 'firefox-tracking-protection',
      testMatch: /tracking-protection\.spec\.ts/,
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: {
            'privacy.trackingprotection.enabled': true,
            'urlclassifier.trackingTable': 'moztest-track-simple',
          },
        },
      },
    },
  ],
```

- [ ] **Step 4: Run Chromium and WebKit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm -C packages/thoro-ui test:browser --project=chromium --project=webkit`
Expected: format, lint and typecheck exit 0, and PASS — every scenario, including the three eager checks and the two 403 pages, in both engines. This is the event-order verification of spec §3 for Chromium and WebKit: if `your CSP without connect-src` fails with status `own-csp`, the violation arrived after the one-task wait, or its `blockedURI` differs from `${VENDOR}/`. Read the recorded `harness.violations` and rule: a later event → raise the wait in `check()` (`probes.ts`) to the smallest delay that passes; a different `blockedURI` form → normalise it in `onViolation` with `new URL(event.blockedURI).href` inside a `try`. Record either as a ruling.

- [ ] **Step 5: Run Firefox (CI or a normal terminal)**

The agent sandbox can't launch Firefox. Hand-off note for the maintainer: run `pnpm -C packages/thoro-ui test:browser --project=firefox --project=firefox-tracking-protection` from a normal terminal, or rely on CI after the push.
Expected: PASS — including `refused → load-failed` for script and style (no longer expected failures), the eager checks, the inconclusive scenario (§3's Firefox event-order check), the style 403, the script 403 as an expected failure, and the tracking-protection test.

- [ ] **Step 6: Hand off for commit**

Propose: `test: cover eager checks, 403 pages and Firefox tracking protection in real browsers`. Do not run git.

---

### Task 4: Budget, docs and 0.2.0-beta.0

**Files:**

- Modify: `packages/thoro-ui/.size-limit.json`, `packages/thoro-ui/package.json`, `packages/thoro-ui/README.md`, `site/res-canary/index.html`, `docs/specs/2026-09-29-res-canary-design.md`, `docs/specs/2026-10-01-thoro-ui-design.md`, `docs/specs/2026-10-05-res-canary-eager-design.md`, `AGENTS.md`

**Interfaces:**

- Consumes: the finished API from Tasks 1–2 and the browser results from Task 3.
- Produces: nothing for later tasks.

- [ ] **Step 1: Raise the core budget**

In `packages/thoro-ui/.size-limit.json`, change the `res-canary core` entry's `"limit": "2 KB"` to `"limit": "2.5 KB"`.

Run: `pnpm build && pnpm size`
Expected: PASS — core ≤ 2.5 KB, element ≤ 4 KB, React ≤ 2 KB.

- [ ] **Step 2: Update the package README**

In `packages/thoro-ui/README.md`:

1. Replace `Core ≤ 2 KB, element ≤ 4 KB (gzip).` with `Core ≤ 2.5 KB, element ≤ 4 KB (gzip).`
2. Replace `Call \`start()\` as early as possible — before you load any third-party script.` with:

   ```markdown
   Call `start()` as early as possible — before you load any third-party script. It checks every vendor origin straight away, so a block shows before your users run into it.
   ```

3. In the Quick start code, delete the `probe: { type: 'script', url: 'https://widget.chat.example/loader.js' },` line (the eager check covers it).
4. In "How it detects a block", add this row first:

   ```markdown
   | At `start()`, a check of each vendor origin is refused or doesn't answer within `probeTimeoutMs` | `load-failed` | yes |
   ```

5. After the `#### Choosing \`ownPolicy\`` paragraph, add:

   ```markdown
   #### Eager checks and `connect-src`

   `start()` sends one `HEAD` request (`no-cors`, no cookies, no referrer) to the root of each vendor origin, unless the feature has its own `probe` or is `lazy`. Any answer means the vendor is reachable. Wildcard (`https://*.vendor.example`) and `ws(s)` origins can't be checked this way, so they're lazy.

   These checks need the origins in your `connect-src`. If your policy doesn't allow them, the check is inconclusive — nothing is shown and `onOwnPolicyViolation` isn't called — but the browser still sends your CSP reporting endpoint one violation report per origin per page load. Add the origins to `connect-src`, or set `lazy: true` on those features (or on `createCanary` for all of them).
   ```

6. In the Features table, change the `probe` row's text to: `Optional startup check that replaces the automatic one: \`script\` (preload plus a \`fetch\`; never runs it), \`style\` (a stylesheet that never applies), \`image\`, \`fetch\` (\`no-cors\`; needs the origin in your \`connect-src\`), or \`custom\` (\`run(signal) => Promise<boolean>\`).`and add a row after it:`| \`lazy\` | Skip the automatic start-up check for this feature. Overrides the \`lazy\` option. |`(run`pnpm format` afterwards; oxfmt re-pads the table).
7. In the Options line under `### API`, add `` `lazy` (default `false`: check every origin at `start()`) `` after `probeTimeoutMs (…)`.
8. In Limitations, replace the line that starts `- **In Firefox, \`script\` and \`style\` probes don't detect a block.**` with:

   ```markdown
   - **A proxy's error page counts as reachable** for the eager checks, `fetch` probes and the `fetch` half of `script` probes: a `no-cors` request can't see the status. In Firefox a `script` probe relies on that half, so it misses an error page there; `style` and `image` probes catch it in every browser.
   ```

9. In Limitations, replace the Chrome line with: `- **Chrome logs an "unused preload" warning** for \`script\` probes. Use a \`fetch\` probe to avoid it.`

- [ ] **Step 3: Update the docs site**

In `site/res-canary/index.html`:

1. Before the `<tr>` whose first cell is `A startup probe fails or goes silent`, add:

   ```html
   <tr>
     <td>At <code>start()</code>, a check of a vendor origin is refused or goes silent</td>
     <td><code>load-failed</code></td>
     <td>yes</td>
   </tr>
   ```

2. In the createCanary options table, after the `probeTimeoutMs` row, add:

   ```html
   <tr>
     <th scope="row"><code>lazy</code></th>
     <td>Default <code>false</code>: check every vendor origin at <code>start()</code>.</td>
   </tr>
   ```

3. In the Each feature table, change the `probe` row's cell to `Optional startup check that replaces the automatic one: <code>script</code>, <code>style</code>, <code>image</code>, <code>fetch</code> or <code>custom</code>.` and add after it:

   ```html
   <tr>
     <th scope="row"><code>lazy</code></th>
     <td>Skip the automatic start-up check for this feature.</td>
   </tr>
   ```

4. In Quick start, delete the `probe: { type: 'script', url: 'https://widget.chat.example/loader.js' },` line.
5. In Limits → Good to know, replace the Chrome "unused preload" item's text with `Chrome logs an "unused preload" warning for <code>script</code> probes; a <code>fetch</code> probe avoids it.` and add `<li>Eager checks need your vendors in <code>connect-src</code>; without it they stay silent, but your CSP reports get one entry per origin.</li>` (Good to know then has four items).

Run: `pnpm build && pnpm -C site test:browser`
Expected: PASS (15 checks).

- [ ] **Step 4: Update the specs and AGENTS.md**

1. `docs/specs/2026-10-05-res-canary-eager-design.md`, Status: `approved by the maintainer, 2026-10-05; implemented <today>.`
2. `docs/specs/2026-09-29-res-canary-design.md`, end of the Status line: ` Eager checks, \`lazy\` and the Firefox-safe script and style probes are specified in [\`2026-10-05-res-canary-eager-design.md\`](2026-10-05-res-canary-eager-design.md) (implemented).`In the acceptance list, change`core ≤ 2 KB`to`core ≤ 2.5 KB`.
3. `docs/specs/2026-10-01-thoro-ui-design.md`: `canary core ≤ 2 KB` → `canary core ≤ 2.5 KB`.
4. `AGENTS.md`: in Status, add `- **Eager checks spec:** [\`docs/specs/2026-10-05-res-canary-eager-design.md\`](docs/specs/2026-10-05-res-canary-eager-design.md)`after the docs-site spec line, and add`[\`docs/plans/2026-10-05-res-canary-eager.md\`](docs/plans/2026-10-05-res-canary-eager.md)`to the plans list; in Rules,`Canary: core ≤ 2 KB`→`Canary: core ≤ 2.5 KB`.

- [ ] **Step 5: Set the version**

In `packages/thoro-ui/package.json`, change `"version": "0.1.0-beta.0"` to `"version": "0.2.0-beta.0"`.

- [ ] **Step 6: Run the full check**

Run: `pnpm format && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm size && pnpm test:ssr && pnpm test:types && pnpm -C site test:browser && pnpm -C packages/thoro-ui test:browser --project=chromium --project=webkit`
Expected: every command exits 0.

- [ ] **Step 7: Hand off for commit**

Propose: `build: prepare 0.2.0-beta.0 with eager checks`. Tell the maintainer: after CI is green on GitHub (Firefox included), publish with `pnpm -C packages/thoro-ui publish --tag beta`. Do not run git or publish.
