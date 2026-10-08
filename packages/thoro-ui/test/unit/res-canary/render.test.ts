import type { BlockedFeature } from '../../../src/res-canary/types.ts'
import { originsText, renderCanary, summaryText } from '../../../src/res-canary/ui/render.ts'
import { DEFAULT_STRINGS } from '../../../src/res-canary/ui/strings.ts'

const chat: BlockedFeature = {
  id: 'chat',
  impact: "The chat bubble won't appear.",
  label: 'Support chat',
  origins: ['https://widget.chat.example', 'https://api.chat.example'],
  reason: 'foreign-csp',
}
const sign: BlockedFeature = {
  id: 'sign',
  impact: "You can't sign agreements.",
  label: 'E-signature',
  origins: ['https://*.sign.example', 'https://api.chat.example'],
  reason: 'load-failed',
}

describe('summaryText', () => {
  it('joins labels for the locale', () => {
    expect(summaryText([chat], DEFAULT_STRINGS, 'en')).toBe("Some features couldn't load: Support chat.")
    expect(summaryText([chat, sign], DEFAULT_STRINGS, 'en')).toBe(
      "Some features couldn't load: Support chat and E-signature.",
    )
    expect(summaryText([chat, sign], { ...DEFAULT_STRINGS, title: 'Nicht geladen' }, 'de')).toBe(
      'Nicht geladen: Support chat und E-signature.',
    )
  })

  it('falls back to English for an invalid locale', () => {
    expect(summaryText([chat, sign], DEFAULT_STRINGS, 'en_US')).toBe(
      "Some features couldn't load: Support chat and E-signature.",
    )
  })
})

describe('originsText', () => {
  it('lists each origin once, sorted, one per line', () => {
    expect(originsText([chat, sign])).toBe(
      'https://*.sign.example\nhttps://api.chat.example\nhttps://widget.chat.example',
    )
  })
})

describe('renderCanary', () => {
  it('labels the region and exposes the summary as a status', () => {
    const { root } = renderCanary([chat, sign], DEFAULT_STRINGS, 'en')
    expect(root.getAttribute('role')).toBe('region')
    expect(root.getAttribute('aria-label')).toBe(DEFAULT_STRINGS.title)
    expect(root.querySelector('[role="status"]')?.textContent).toBe(
      "Some features couldn't load: Support chat and E-signature. This is usually caused by a browser extension or your network settings.",
    )
  })

  it('puts each feature and its impact, and the origin list, inside a closed details element', () => {
    const { details, origins } = renderCanary([chat, sign], DEFAULT_STRINGS, 'en')
    expect(details.open).toBe(false)
    expect([...details.querySelectorAll('li')].map(item => item.textContent)).toEqual([
      "Support chat — The chat bubble won't appear.",
      "E-signature — You can't sign agreements.",
    ])
    expect(origins.textContent).toBe(originsText([chat, sign]))
  })

  it('renders plain buttons with the configured text and accessible name', () => {
    const { copy, dismiss } = renderCanary([chat], { ...DEFAULT_STRINGS, copy: 'Kopieren', dismiss: 'Schließen' }, 'de')
    expect(copy.type).toBe('button')
    expect(copy.textContent).toBe('Kopieren')
    expect(dismiss.type).toBe('button')
    expect(dismiss.getAttribute('aria-label')).toBe('Schließen')
  })

  it('exposes the documented parts in document order', () => {
    const { root } = renderCanary([chat], DEFAULT_STRINGS, 'en')
    const parts = [...root.querySelectorAll('[part]')].map(node => node.getAttribute('part'))
    expect([root.getAttribute('part'), ...parts]).toEqual([
      'root',
      'icon',
      'summary',
      'title',
      'details',
      'toggle',
      'list',
      'ask',
      'origins',
      'copy',
      'dismiss',
    ])
  })

  it('treats labels as text, never markup', () => {
    const { root } = renderCanary([{ ...chat, label: '<img src=x onerror=alert(1)>' }], DEFAULT_STRINGS, 'en')
    expect(root.querySelector('img')).toBeNull()
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})
