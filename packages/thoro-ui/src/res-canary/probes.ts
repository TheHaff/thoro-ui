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
    document.head.append(link)
    // Browsers fire load and error as later tasks, never inside append(), so listening now misses nothing.
    link.addEventListener('load', () => settle(true), { once: true })
    link.addEventListener('error', () => settle(false), { once: true })
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
