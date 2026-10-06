export type Status = 'unknown' | 'ok' | 'load-failed' | 'foreign-csp' | 'own-csp'

export type BlockedReason = 'load-failed' | 'foreign-csp'

export type Probe =
  | { type: 'script' | 'style' | 'image' | 'fetch'; url: string }
  | { type: 'custom'; run: (signal: AbortSignal) => Promise<boolean> }

export type Feature = {
  /** Stable id, used by report() and the dismissal signature. */
  id: string
  /** Short name shown to the user, e.g. "Support chat". */
  label: string
  /** What won't work, e.g. "The support chat bubble won't appear." */
  impact: string
  /** CSP host-source syntax: 'https://widget.vendor.example', 'https://*.vendor.example', 'wss://rtc.vendor.example'. */
  origins: readonly string[]
  probe?: Probe
  /** Skip the automatic start-up check of this feature's origins. Overrides CanaryOptions.lazy. */
  lazy?: boolean
}

export type BlockedFeature = Feature & { reason: BlockedReason }

export type OwnPolicyViolation = {
  blockedURI: string
  effectiveDirective: string
  featureId: string
  originalPolicy: string
}

export type Snapshot = {
  /** Features whose status is load-failed or foreign-csp, in `features` order. */
  blocked: readonly BlockedFeature[]
  dismissed: boolean
  statuses: Readonly<Record<string, Status>>
}

export type CanaryStorage = Pick<Storage, 'getItem' | 'setItem'>

export type CanaryOptions = {
  features: readonly Feature[]
  /** Recognises your own CSP in a violation's originalPolicy. Required. */
  ownPolicy: string | RegExp | ((policy: string) => boolean)
  onChange?: (snapshot: Snapshot) => void
  onOwnPolicyViolation?: (violation: OwnPolicyViolation) => void
  /** Default: localStorage. null keeps dismissal in memory for this page only. */
  storage?: CanaryStorage | null
  /** Default: 'thoro-ui:res-canary:dismissed'. */
  storageKey?: string
  /** Default: 15000. 0 disables the timeout. */
  probeTimeoutMs?: number
  /** Default false: start() checks every vendor origin it can. true = only the probes you configure. */
  lazy?: boolean
}

// Function-typed properties, not methods: none of them uses `this`, so they can be passed around
// unbound (useSyncExternalStore does), and type-aware linters such as unbound-method agree.
export type Canary = {
  dismiss: () => void
  getSnapshot: () => Snapshot
  report: (id: string) => void
  start: () => void
  stop: () => void
  subscribe: (listener: () => void) => () => void
}
