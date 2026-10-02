import type { BlockedFeature } from '../../../src/res-canary/types.ts'
import { renderCanary } from '../../../src/res-canary/ui/render.ts'
import { DEFAULT_STRINGS } from '../../../src/res-canary/ui/strings.ts'
import { CANARY_CSS } from '../../../src/res-canary/ui/styles.ts'

const chat: BlockedFeature = {
  id: 'chat',
  impact: "The chat bubble won't appear.",
  label: 'Support chat',
  origins: ['https://widget.chat.example'],
  reason: 'foreign-csp',
}

/** Every selector in a stylesheet, one per comma-separated part, with @media wrappers skipped. */
function selectors(css: string): string[] {
  return [...css.matchAll(/([^{}]+)\{/g)]
    .map(match => match[1].trim())
    .filter(selector => !selector.startsWith('@'))
    .flatMap(selector => selector.split(',').map(part => part.trim()))
}

function classesIn(css: string): string[] {
  const names = selectors(css).flatMap(selector => [...selector.matchAll(/\.([a-z][a-z-]*)/g)].map(match => match[1]))
  return [...new Set(names)].sort()
}

describe('the element stylesheet', () => {
  it('uses only :host and class selectors, so the React stylesheet can be derived by prefixing classes', () => {
    const bare = selectors(CANARY_CSS).filter(selector =>
      /(^|[\s>+~])[a-z]/.test(selector.replace(/:host(\([^)]*\))?/g, '')),
    )
    expect(bare).toEqual([])
  })

  it('defines exactly the classes the renderer uses', () => {
    const { root } = renderCanary([chat], DEFAULT_STRINGS, 'en')
    const used = new Set([root, ...root.querySelectorAll('*')].flatMap(element => [...element.classList]))
    expect([...used].sort()).toEqual(classesIn(CANARY_CSS))
  })
})
