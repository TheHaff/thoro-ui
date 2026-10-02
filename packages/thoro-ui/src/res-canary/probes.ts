import type { Probe } from './types.ts'

/** Resolves true when the probe's resource is reachable, false otherwise. Never rejects. */
export function runProbe(probe: Probe, timeoutMs: number, signal: AbortSignal): Promise<boolean> {
  const attempt = attemptProbe(probe, signal)
  if (timeoutMs <= 0) return attempt
  return new Promise(resolve => {
    // A firewall that drops packets never answers; treat silence as blocked.
    const timer = setTimeout(() => resolve(false), timeoutMs)
    void attempt.then(ok => {
      clearTimeout(timer)
      resolve(ok)
    })
  })
}

function attemptProbe(probe: Probe, signal: AbortSignal): Promise<boolean> {
  switch (probe.type) {
    case 'script':
      return preload(probe.url, 'script')
    case 'style':
      return preload(probe.url, 'style')
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

// A preload fetches with the same request type ad blockers filter on, but never runs the script.
function preload(url: string, as: 'script' | 'style'): Promise<boolean> {
  return new Promise(resolve => {
    const link = document.createElement('link')
    const settle = (ok: boolean): void => {
      link.remove()
      resolve(ok)
    }
    link.rel = 'preload'
    link.as = as
    link.href = url
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
