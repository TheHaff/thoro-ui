// Imports the built package in plain Node (no DOM) to prove neither entry point touches
// window, document or customElements at import time. Run after `pnpm build`.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

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

const reactEntry = new URL('../dist/res-canary/react.js', import.meta.url)
const react = await import(reactEntry.href)
assert.match(readFileSync(reactEntry, 'utf8'), /^"use client";/)

const fresh = core.createCanary({
  features: [{ id: 'a', impact: 'A is unavailable.', label: 'A', origins: ['https://a.example'] }],
  ownPolicy: 'own.example',
  storage: null,
})
assert.equal(renderToString(createElement(react.ResCanary, { canary: fresh })), '')
const html = renderToString(createElement(react.ResCanary, { items: canary.getSnapshot().blocked, lang: 'en' }))
assert.match(html, /class="thoro-res-canary thoro-res-canary--inline"/)
assert.match(html, /Some features couldn&#x27;t load: A\./)

console.log('ssr: ok')
