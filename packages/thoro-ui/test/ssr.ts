// Imports the built package in plain Node (no DOM) to prove neither entry point touches
// window, document or customElements at import time. Run after `pnpm build`.
import assert from 'node:assert/strict'

assert.equal(typeof globalThis.document, 'undefined')

const core = await import(new URL('../dist/res-canary/index.js', import.meta.url).href)
const element = await import(new URL('../dist/res-canary/element.js', import.meta.url).href)

const canary = core.createCanary({
  features: [{ id: 'a', impact: 'A is unavailable.', label: 'A', origins: ['https://a.example'] }],
  ownPolicy: 'own.example',
  storage: null,
})
canary.start()
canary.report('a')
assert.deepEqual(
  canary.getSnapshot().blocked.map((feature: { id: string }) => feature.id),
  ['a'],
)
assert.equal(typeof element.mountBanner, 'function')
element.defineResCanaryElement()

console.log('ssr: ok')
