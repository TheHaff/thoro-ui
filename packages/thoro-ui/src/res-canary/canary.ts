import { createDismissalStore } from './dismissal.ts'
import { matchesOrigin, parseOriginPattern, type OriginPattern } from './origins.ts'
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
    },
    stop() {
      controller?.abort()
      controller = null
    },
    report(id) {
      if (!Object.hasOwn(statuses, id)) {
        console.warn(`res-canary: report() was called with unknown feature id "${id}"`)
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
    return { feature, patterns: feature.origins.map(origin => parseOriginPattern(origin)) }
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
  throw new TypeError('res-canary: ownPolicy is required (a string, RegExp or function that recognises your own CSP)')
}

function resourceUrl(element: Element): string {
  if (element instanceof HTMLLinkElement) return element.href
  if (element instanceof HTMLImageElement || element instanceof HTMLMediaElement) {
    return element.currentSrc || element.src
  }
  if (element instanceof HTMLScriptElement || element instanceof HTMLSourceElement) return element.src
  return ''
}
