import type { BlockedFeature, Feature, Status } from './types.ts'

const RANK: Record<Status, number> = { unknown: 0, ok: 1, 'load-failed': 2, 'foreign-csp': 3, 'own-csp': 4 }

/**
 * Statuses only move up. The error event and the CSP violation for the same request arrive in
 * either order, and the more specific reason has to win regardless.
 */
export function raiseStatus(current: Status, next: Status): Status {
  return RANK[next] > RANK[current] ? next : current
}

export function blockedFeatures(
  features: readonly Feature[],
  statuses: Readonly<Record<string, Status>>,
): BlockedFeature[] {
  const blocked: BlockedFeature[] = []
  for (const feature of features) {
    const status = statuses[feature.id]
    if (status === 'load-failed' || status === 'foreign-csp') blocked.push({ ...feature, reason: status })
  }
  return blocked
}

export function signatureOf(blocked: readonly BlockedFeature[]): string {
  return blocked
    .map(feature => feature.id)
    .sort()
    .join(',')
}
