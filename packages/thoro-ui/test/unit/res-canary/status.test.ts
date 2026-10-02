import { blockedFeatures, raiseStatus, signatureOf } from '../../../src/res-canary/status.ts'
import type { BlockedFeature, Feature, Status } from '../../../src/res-canary/types.ts'

const feature = (id: string): Feature => ({
  id,
  impact: `${id} won't work.`,
  label: id.toUpperCase(),
  origins: [`https://${id}.example`],
})

describe('raiseStatus', () => {
  const order: Status[] = ['unknown', 'ok', 'load-failed', 'foreign-csp', 'own-csp']

  it('ends at the most specific status whatever order two statuses arrive in', () => {
    for (const a of order) {
      for (const b of order) {
        const expected = order[Math.max(order.indexOf(a), order.indexOf(b))]
        expect(raiseStatus(raiseStatus('unknown', a), b)).toBe(expected)
        expect(raiseStatus(raiseStatus('unknown', b), a)).toBe(expected)
      }
    }
  })
})

describe('blockedFeatures', () => {
  it('lists load-failed and foreign-csp features in config order and never own-csp', () => {
    const features = [feature('a'), feature('b'), feature('c'), feature('d')]
    const blocked = blockedFeatures(features, { a: 'foreign-csp', b: 'own-csp', c: 'ok', d: 'load-failed' })
    expect(blocked.map(item => [item.id, item.reason])).toEqual([
      ['a', 'foreign-csp'],
      ['d', 'load-failed'],
    ])
  })
})

describe('signatureOf', () => {
  it('is the sorted ids, independent of order', () => {
    const a: BlockedFeature = { ...feature('a'), reason: 'load-failed' }
    const b: BlockedFeature = { ...feature('b'), reason: 'foreign-csp' }
    expect(signatureOf([b, a])).toBe('a,b')
    expect(signatureOf([])).toBe('')
  })
})
