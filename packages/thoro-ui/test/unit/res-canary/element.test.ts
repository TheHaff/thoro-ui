import { createCanary } from '../../../src/res-canary/canary.ts'
import type { BlockedFeature, Canary, Feature } from '../../../src/res-canary/types.ts'
import { defineResCanaryElement, mountBanner, type ResCanaryElement } from '../../../src/res-canary/ui/element.ts'

defineResCanaryElement()

const chat: Feature = {
  id: 'chat',
  impact: "The chat bubble won't appear.",
  label: 'Support chat',
  origins: ['https://widget.chat.example'],
}
const sign: Feature = {
  id: 'sign',
  impact: "You can't sign agreements.",
  label: 'E-signature',
  origins: ['https://*.sign.example', 'https://widget.chat.example'],
}

function canaryWith(...blocked: string[]): Canary {
  const canary = createCanary({ features: [chat, sign], ownPolicy: 'own.example', storage: null })
  for (const id of blocked) canary.report(id)
  return canary
}

function mount(setup: (element: ResCanaryElement) => void, parent: HTMLElement = document.body): ResCanaryElement {
  const element = document.createElement('thoro-res-canary')
  setup(element)
  parent.append(element)
  return element
}

function part<T extends Element = HTMLElement>(element: HTMLElement, name: string): T {
  return element.shadowRoot?.querySelector(`[part="${name}"]`) as T
}

afterEach(() => document.body.replaceChildren())

describe('<thoro-res-canary>', () => {
  it.each([
    ['Copy for IT', '[part="copy"]'],
    ['the Details toggle', 'summary'],
  ])('keeps keyboard focus on %s when the list changes', (_name, selector) => {
    const canary = canaryWith('chat')
    const element = mount(el => {
      el.canary = canary
    })
    element.shadowRoot?.querySelector<HTMLElement>(selector)?.focus()
    canary.report('sign')
    const focused = element.shadowRoot?.activeElement
    expect(focused).toBe(element.shadowRoot?.querySelector(selector))
    expect(focused).not.toBeNull()
  })

  it('stays hidden and empty until the canary has something blocked', () => {
    const canary = canaryWith()
    const element = mount(el => {
      el.canary = canary
    })
    expect(element.hidden).toBe(true)
    expect(element.shadowRoot?.childNodes).toHaveLength(0)
    canary.report('chat')
    expect(element.hidden).toBe(false)
    expect(part(element, 'title').textContent).toBe("Some features couldn't load: Support chat.")
  })

  it('uncontrolled: the dismiss button dismisses through the canary', () => {
    const canary = canaryWith('chat')
    const element = mount(el => {
      el.canary = canary
    })
    const onDismiss = vi.fn()
    element.addEventListener('res-canary-dismiss', event => onDismiss(event.detail))
    part<HTMLButtonElement>(element, 'dismiss').click()
    expect(onDismiss).toHaveBeenCalledWith({ ids: ['chat'] })
    expect(canary.getSnapshot().dismissed).toBe(true)
    expect(element.hidden).toBe(true)
  })

  it('skips the default dismiss when the event is cancelled', () => {
    const canary = canaryWith('chat')
    const element = mount(el => {
      el.canary = canary
    })
    element.addEventListener('res-canary-dismiss', event => event.preventDefault())
    part<HTMLButtonElement>(element, 'dismiss').click()
    expect(canary.getSnapshot().dismissed).toBe(false)
    expect(element.hidden).toBe(false)
  })

  it('controlled: renders only the given items and leaves state to the parent', () => {
    const canary = canaryWith('chat', 'sign')
    const element = mount(el => {
      el.canary = canary
      el.items = []
    })
    expect(element.hidden).toBe(true)
    const items: BlockedFeature[] = [{ ...sign, reason: 'load-failed' }]
    element.items = items
    expect(part(element, 'title').textContent).toBe("Some features couldn't load: E-signature.")
    part<HTMLButtonElement>(element, 'dismiss').click()
    expect(canary.getSnapshot().dismissed).toBe(false)
    expect(element.hidden).toBe(false)
  })

  it('copies the deduplicated origins for IT and announces it', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const element = mount(el => {
      el.canary = canaryWith('chat', 'sign')
    })
    const onCopy = vi.fn()
    element.addEventListener('res-canary-copy', event => onCopy(event.detail))
    part<HTMLButtonElement>(element, 'copy').click()
    const text = 'https://*.sign.example\nhttps://widget.chat.example'
    await vi.waitFor(() => expect(onCopy).toHaveBeenCalledWith({ copied: true, text }))
    expect(writeText).toHaveBeenCalledWith(text)
    expect(part(element, 'copy').textContent).toBe('Copied')
    expect(part(element, 'summary').textContent).toContain('Copied')
  })

  it('falls back to selecting the list when the clipboard refuses', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('NotAllowedError'))
    const element = mount(el => {
      el.canary = canaryWith('chat')
    })
    const onCopy = vi.fn()
    element.addEventListener('res-canary-copy', event => onCopy(event.detail))
    part<HTMLButtonElement>(element, 'copy').click()
    await vi.waitFor(() => expect(onCopy).toHaveBeenCalledWith({ copied: false, text: 'https://widget.chat.example' }))
    expect(part(element, 'copy').textContent).toBe('Copy for IT')
  })

  it('applies string overrides and ignores non-string values', () => {
    const element = mount(el => {
      el.canary = canaryWith('chat')
      el.strings = { copy: 'Kopieren', title: undefined as unknown as string }
    })
    expect(part(element, 'copy').textContent).toBe('Kopieren')
    expect(part(element, 'title').textContent).toBe("Some features couldn't load: Support chat.")
  })

  it('joins labels in the closest lang and survives an invalid one', () => {
    const wrapper = document.createElement('div')
    wrapper.lang = 'de'
    document.body.append(wrapper)
    const element = mount(el => {
      el.canary = canaryWith('chat', 'sign')
    }, wrapper)
    expect(part(element, 'title').textContent).toBe("Some features couldn't load: Support chat und E-signature.")
    wrapper.lang = 'en_US'
    element.strings = {}
    expect(part(element, 'title').textContent).toBe("Some features couldn't load: Support chat and E-signature.")
  })

  it('keeps the details panel open when the list changes', () => {
    const canary = canaryWith('chat')
    const element = mount(el => {
      el.canary = canary
    })
    part<HTMLDetailsElement>(element, 'details').open = true
    canary.report('sign')
    expect(part<HTMLDetailsElement>(element, 'details').open).toBe(true)
    expect(part(element, 'list').children).toHaveLength(2)
  })

  it('picks up properties that were set before the element was defined', () => {
    const early = document.createElement('late-canary') as ResCanaryElement
    early.canary = canaryWith('chat')
    early.variant = 'banner'
    document.body.append(early)
    defineResCanaryElement('late-canary')
    expect(early.getAttribute('variant')).toBe('banner')
    expect(part(early, 'title').textContent).toBe("Some features couldn't load: Support chat.")
  })

  it('unsubscribes when removed and catches up when re-attached', () => {
    const canary = canaryWith()
    const unsubscribed = vi.fn()
    const tracked: Canary = {
      ...canary,
      subscribe: listener => {
        const off = canary.subscribe(listener)
        return () => {
          unsubscribed()
          off()
        }
      },
    }
    const element = mount(el => {
      el.canary = tracked
    })
    element.remove()
    expect(unsubscribed).toHaveBeenCalledTimes(1)
    canary.report('chat')
    document.body.append(element)
    expect(element.hidden).toBe(false)
    expect(part(element, 'title').textContent).toBe("Some features couldn't load: Support chat.")
  })

  it('reflects variant to the attribute, defaulting to inline', () => {
    const element = mount(() => {})
    expect(element.variant).toBe('inline')
    element.variant = 'banner'
    expect(element.getAttribute('variant')).toBe('banner')
  })

  it('mountBanner prepends a visible banner to <body>', () => {
    document.body.append(document.createElement('main'))
    const element = mountBanner(canaryWith('chat'))
    expect(document.body.firstElementChild).toBe(element)
    expect(element.getAttribute('variant')).toBe('banner')
    expect(element.hidden).toBe(false)
  })

  it('defineResCanaryElement ignores a tag that is already defined', () => {
    expect(() => defineResCanaryElement()).not.toThrow()
  })
})
