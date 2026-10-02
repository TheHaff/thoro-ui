// Writes each component's React stylesheet into dist/ after `vp pack`, which empties dist/ first.
import { mkdirSync, writeFileSync } from 'node:fs'
import { CANARY_CSS } from '../src/res-canary/ui/styles.ts'
import { reactCss } from './react-css.ts'

const out = new URL('../dist/res-canary/', import.meta.url)
mkdirSync(out, { recursive: true })
writeFileSync(new URL('react.css', out), reactCss(CANARY_CSS, 'thoro-res-canary').trimStart())
console.log('wrote dist/res-canary/react.css')
