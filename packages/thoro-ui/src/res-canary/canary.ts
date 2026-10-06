import { createDismissalStore } from './dismissal.ts'
import { checkUrl, matchesOrigin, parseOriginPattern, type OriginPattern } from './origins.ts'
import { checkOrigin, runProbe, type CheckResult } from './probes.ts'
import { blockedFeatures, raiseStatus, signatureOf } from './status.ts'
import type { Canary, CanaryOptions, Feature, Snapshot, Status } from './types.ts'

type Compiled = { feature: Feature; patterns: OriginPattern[] }

export function createCanary(options: CanaryOptions): Canary {
  const compiled = compile(options.features)
  const isOwnPolicy = toPolicyMatcher(options.ownPolicy)
  const dismissal = createDismissalStore(options.storage, options.storageKey ?? 'thoro-ui:res-canary:dismissed')
  const listeners = new Set<() => void>()
  let statuses: Readonly<Record<string, Status>> = Object.fromEntries(
    compiled.map(({ feature }): [string, Status] => [feature.id, 'unknown']),
  )
  let snapshot = buildSnapshot()
  let controller: AbortController | null = null
  // URLs the canary fetches itself, and those of them the app's own connect-src blocked (eager spec §3).
  const ownChecks = new Set<string>()
  const blockedChecks = new Set<string>()

  function buildSnapshot(): Snapshot {
    const blocked = blockedFeatures(options.features, statuses)
    const dismissed = blocked.length > 0 && dismissal.read() === signatureOf(blocked)
    return { blocked, dismissed, statuses }
  }

  function publish(): void {
    snapshot = buildSnapshot()
    const callbacks = [() => options.onChange?.(snapshot), ...listeners]
    for (const callback of callbacks) {
      try {
        callback()
      } catch (error) {
        // A throwing subscriber must not starve the others. Rethrow later so it still reaches error tracking.
        queueMicrotask(() => {
          throw error
        })
      }
    }
  }

  function setStatus(id: string, next: Status): void {
    if (!Object.hasOwn(statuses, id)) return
    const current = statuses[id]
    const raised = raiseStatus(current, next)
    if (raised === current) return
    statuses = { ...statuses, [id]: raised }
    publish()
  }

  function matching(url: string): Compiled[] {
    return compiled.filter(({ patterns }) => patterns.some(pattern => matchesOrigin(url, pattern)))
  }

  function onViolation(event: SecurityPolicyViolationEvent): void {
    // Report-only policies block nothing.
    if (event.disposition === 'report') return
    const policy = event.originalPolicy ?? ''
    const own = isOwnPolicy(policy)
    // The canary's own check, blocked by your connect-src: inconclusive, and not your bug to report.
    // Normalised, in case a browser reports the root as 'https://vendor.example' without the slash.
    // (Not URL.canParse: Safari 16.4, which the README supports, lacks it.)
    let url = event.blockedURI
    try {
      url = new URL(url).href
    } catch {
      // 'inline', 'eval' and the like aren't URLs; they never match a check.
    }
    if (own && event.effectiveDirective === 'connect-src' && ownChecks.has(url)) {
      blockedChecks.add(url)
      return
    }
    for (const { feature } of matching(event.blockedURI)) {
      setStatus(feature.id, own ? 'own-csp' : 'foreign-csp')
      if (own) {
        options.onOwnPolicyViolation?.({
          blockedURI: event.blockedURI,
          effectiveDirective: event.effectiveDirective,
          featureId: feature.id,
          originalPolicy: policy,
        })
      }
    }
  }

  function onResourceError(event: Event): void {
    if (!(event.target instanceof Element)) return
    for (const { feature } of matching(resourceUrl(event.target))) setStatus(feature.id, 'load-failed')
  }

  return {
    start() {
      if (controller || typeof document === 'undefined') return
      controller = new AbortController()
      const { signal } = controller
      document.addEventListener('securitypolicyviolation', onViolation, { signal })
      // Resource errors don't bubble, but they pass through window in the capture phase.
      window.addEventListener('error', onResourceError, { capture: true, signal })
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
          // Must equal the URL the script probe's fetch half requests (probes.ts), or its block is reported as yours.
          if (probe.type === 'script') ownChecks.add(new URL(probe.url).href)
          results = [runProbe(probe, timeoutMs, signal, ownBlocked)]
        } else if (!(feature.lazy ?? options.lazy)) {
          results = patterns.flatMap(pattern => {
            const url = checkUrl(pattern)
            return url ? [check(url)] : []
          })
        }
        // A failure decides at once, without waiting for a silent origin; ok needs every answer. Statuses
        // only move up, so an ok after a failure changes nothing.
        for (const result of results) {
          void result.then(value => {
            if (!signal.aborted && value === false) setStatus(feature.id, 'load-failed')
          })
        }
        void Promise.all(results).then(values => {
          if (!signal.aborted && values.includes(true)) setStatus(feature.id, 'ok')
        })
      }
    },
    stop() {
      controller?.abort()
      controller = null
    },
    report(id) {
      if (!Object.hasOwn(statuses, id)) {
        console.warn(`res-canary: unknown id "${id}"`)
        return
      }
      setStatus(id, 'load-failed')
    },
    dismiss() {
      if (snapshot.blocked.length === 0 || snapshot.dismissed) return
      dismissal.write(signatureOf(snapshot.blocked))
      publish()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return snapshot
    },
  }
}

function compile(features: readonly Feature[]): Compiled[] {
  const ids = new Set<string>()
  return features.map(feature => {
    if (ids.has(feature.id)) throw new TypeError(`res-canary: duplicate feature id "${feature.id}"`)
    ids.add(feature.id)
    if (feature.origins.length === 0) throw new TypeError(`res-canary: feature "${feature.id}" has no origins`)
    const patterns = feature.origins.map(origin => parseOriginPattern(origin))
    const { probe } = feature
    if (probe && probe.type !== 'custom' && !patterns.some(pattern => matchesOrigin(probe.url, pattern))) {
      throw new TypeError(`res-canary: feature "${feature.id}" probes ${probe.url}, outside its origins`)
    }
    return { feature, patterns }
  })
}

function toPolicyMatcher(ownPolicy: CanaryOptions['ownPolicy']): (policy: string) => boolean {
  if (typeof ownPolicy === 'string') {
    // An empty string is contained in every policy, which would silently classify every block as ours.
    if (ownPolicy.trim() === '') throw new TypeError('res-canary: ownPolicy must not be an empty string')
    return policy => policy.includes(ownPolicy)
  }
  if (ownPolicy instanceof RegExp) {
    return policy => {
      // A global or sticky RegExp keeps state in lastIndex between test() calls.
      ownPolicy.lastIndex = 0
      return ownPolicy.test(policy)
    }
  }
  if (typeof ownPolicy === 'function') return ownPolicy
  throw new TypeError('res-canary: ownPolicy is required')
}

function resourceUrl(element: Element): string {
  if (element instanceof HTMLLinkElement) return element.href
  if (element instanceof HTMLImageElement || element instanceof HTMLMediaElement) {
    return element.currentSrc || element.src
  }
  if (element instanceof HTMLScriptElement || element instanceof HTMLSourceElement) return element.src
  return ''
}
