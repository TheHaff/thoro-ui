import { act } from 'react'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { reactCss } from '../../../scripts/react-css.ts'
import { createCanary } from '../../../src/res-canary/canary.ts'
import { ResCanary, type ResCanaryProps } from '../../../src/res-canary/react.ts'
import type { Canary, Feature } from '../../../src/res-canary/types.ts'
import { CANARY_CSS } from '../../../src/res-canary/ui/styles.ts'

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
  origins: ['https://*.sign.example'],
}

function canaryWith(...blocked: string[]): Canary {
  const canary = createCanary({ features: [chat, sign], ownPolicy: 'own.example', storage: null })
  for (const id of blocked) canary.report(id)
  return canary
}

let host: HTMLDivElement
let root: Root | undefined

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  document.documentElement.removeAttribute('lang')
})

function render(props: ResCanaryProps): void {
  act(() => {
    root ??= createRoot(host)
    root.render(<ResCanary {...props} />)
  })
}

const part = (name: string): HTMLElement | null => host.querySelector(`.thoro-res-canary__${name}`)

describe('<ResCanary>', () => {
  it('renders nothing until the canary has something blocked, then follows it', () => {
    const canary = canaryWith()
    render({ canary })
    expect(host.innerHTML).toBe('')
    act(() => canary.report('chat'))
    expect(part('title')?.textContent).toBe("Some features couldn't load: Support chat.")
  })

  it('renders nothing once the canary is dismissed', () => {
    const canary = canaryWith('chat')
    render({ canary })
    act(() => canary.dismiss())
    expect(host.innerHTML).toBe('')
  })

  it("renders the element's structure with prefixed classes", () => {
    render({ canary: canaryWith('chat'), className: 'mine', variant: 'banner' })
    const outer = host.firstElementChild as HTMLElement
    expect([...outer.classList]).toEqual(['thoro-res-canary', 'thoro-res-canary--banner', 'mine'])
    expect(part('root')?.getAttribute('role')).toBe('region')
    expect(part('root')?.getAttribute('aria-label')).toBe("Some features couldn't load")
    expect(part('summary')?.getAttribute('role')).toBe('status')
    expect(part('summary')?.textContent).toBe(
      "Some features couldn't load: Support chat. This is usually caused by a browser extension or your network settings.",
    )
    expect(part('toggle')?.textContent).toBe('Details')
    expect(part('list')?.textContent).toBe("Support chat — The chat bubble won't appear.")
    expect(part('ask')?.textContent).toBe('Ask your IT team to allow these addresses:')
    expect(part('origins')?.textContent).toBe('https://widget.chat.example')
    expect(part('copy')?.textContent).toBe('Copy for IT')
    expect(part('dismiss')?.getAttribute('aria-label')).toBe('Dismiss')
    expect(part('icon')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('uses exactly the classes react.css defines', () => {
    render({ canary: canaryWith('chat') })
    const used = new Set(
      [...host.querySelectorAll('*')].flatMap(element => [...element.classList]).filter(name => name.includes('__')),
    )
    const defined = new Set(
      [...reactCss(CANARY_CSS, 'thoro-res-canary').matchAll(/\.(thoro-res-canary__[a-z-]+)/g)].map(match => match[1]),
    )
    expect([...used].sort()).toEqual([...defined].sort())
  })

  it('in controlled mode renders only its items and ignores the canary', () => {
    const canary = canaryWith('chat')
    render({ canary, items: [] })
    expect(host.innerHTML).toBe('')
    render({ canary, items: canaryWith('sign').getSnapshot().blocked })
    expect(part('title')?.textContent).toBe("Some features couldn't load: E-signature.")
    act(() => canary.report('sign'))
    expect(part('list')?.children).toHaveLength(1)
  })

  it('dismisses an uncontrolled canary after calling onDismiss', () => {
    const canary = canaryWith('chat')
    const onDismiss = vi.fn()
    render({ canary, onDismiss })
    act(() => part('dismiss')?.click())
    expect(onDismiss).toHaveBeenCalledWith(['chat'])
    expect(canary.getSnapshot().dismissed).toBe(true)
    expect(host.innerHTML).toBe('')
  })

  it('in controlled mode only reports the dismissal', () => {
    const canary = canaryWith('chat')
    const onDismiss = vi.fn()
    render({ canary, items: canary.getSnapshot().blocked, onDismiss })
    act(() => part('dismiss')?.click())
    expect(onDismiss).toHaveBeenCalledWith(['chat'])
    expect(canary.getSnapshot().dismissed).toBe(false)
    expect(part('root')).not.toBeNull()
  })

  it('applies string overrides and ignores non-string values', () => {
    render({ canary: canaryWith('chat'), strings: { copy: 42 as unknown as string, title: 'Heads up' } })
    expect(part('title')?.textContent).toBe('Heads up: Support chat.')
    expect(part('copy')?.textContent).toBe('Copy for IT')
  })

  it('joins labels for lang, falls back to English when it is invalid, and defaults to <html lang>', () => {
    render({ canary: canaryWith('chat', 'sign'), lang: 'de' })
    expect(part('title')?.textContent).toBe("Some features couldn't load: Support chat und E-signature.")
    render({ canary: canaryWith('chat', 'sign'), lang: 'en_US' })
    expect(part('title')?.textContent).toBe("Some features couldn't load: Support chat and E-signature.")
    document.documentElement.lang = 'de'
    render({ canary: canaryWith('chat', 'sign') })
    expect(part('title')?.textContent).toBe("Some features couldn't load: Support chat und E-signature.")
  })

  it('treats labels as text, never markup', () => {
    const canary = createCanary({
      features: [{ ...chat, label: '<img src=x onerror=alert(1)>' }],
      ownPolicy: 'own.example',
      storage: null,
    })
    canary.report('chat')
    render({ canary })
    expect(host.querySelector('img')).toBeNull()
    expect(part('title')?.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('copies the origins for IT and announces it', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const onCopy = vi.fn()
    render({ canary: canaryWith('chat'), onCopy })
    await act(async () => part('copy')?.click())
    expect(writeText).toHaveBeenCalledWith('https://widget.chat.example')
    expect(onCopy).toHaveBeenCalledWith({ copied: true, text: 'https://widget.chat.example' })
    expect(part('copy')?.textContent).toBe('Copied')
    expect(part('visually-hidden')?.textContent).toBe('Copied')
  })

  it('reports a refused copy and keeps the button text', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('NotAllowedError'))
    const onCopy = vi.fn()
    render({ canary: canaryWith('chat'), onCopy })
    await act(async () => part('copy')?.click())
    expect(onCopy).toHaveBeenCalledWith({ copied: false, text: 'https://widget.chat.example' })
    expect(part('copy')?.textContent).toBe('Copy for IT')
  })

  it('keeps the details open and keyboard focus when the list changes', () => {
    const canary = canaryWith('chat')
    render({ canary })
    ;(part('details') as HTMLDetailsElement).open = true
    part('copy')?.focus()
    act(() => canary.report('sign'))
    expect((part('details') as HTMLDetailsElement).open).toBe(true)
    expect(document.activeElement).toBe(part('copy'))
    expect(part('list')?.children).toHaveLength(2)
  })

  // Review Focus 3
  it('shows Copy for IT again when the list changes after a copy', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const canary = canaryWith('chat')
    render({ canary })
    await act(async () => part('copy')?.click())
    expect(part('copy')?.textContent).toBe('Copied')
    act(() => canary.report('sign'))
    expect(part('copy')?.textContent).toBe('Copy for IT')
  })

  // Review Focus 2
  it('follows a different canary when the prop changes', () => {
    render({ canary: canaryWith('chat') })
    render({ canary: canaryWith('sign') })
    expect(part('title')?.textContent).toBe("Some features couldn't load: E-signature.")
  })

  // Review Focus 4
  it('ignores a copy that finishes after the component unmounted', async () => {
    let finish: () => void = () => {}
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve
        }),
    )
    const errors = vi.spyOn(console, 'error')
    render({ canary: canaryWith('chat') })
    act(() => part('copy')?.click())
    act(() => root?.unmount())
    root = undefined
    await act(async () => finish())
    expect(errors).not.toHaveBeenCalled()
  })

  // Final review: a foreign-CSP violation during HTML parsing reaches the canary before React hydrates.
  it('hydrates over empty server markup when the canary detected a block before hydration', () => {
    host.innerHTML = renderToString(<ResCanary canary={canaryWith()} />)
    const canary = canaryWith('chat')
    const onRecoverableError = vi.fn()
    act(() => {
      root = hydrateRoot(host, <ResCanary canary={canary} />, { onRecoverableError })
    })
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(part('title')?.textContent).toBe("Some features couldn't load: Support chat.")
  })

  // Review Focus 1
  it('hydrates server-rendered markup without a mismatch', () => {
    const items = canaryWith('chat').getSnapshot().blocked
    // Test-only: put the server's HTML where React will hydrate it.
    host.innerHTML = renderToString(<ResCanary items={items} lang="en" />)
    const errors = vi.spyOn(console, 'error')
    const onRecoverableError = vi.fn()
    act(() => {
      root = hydrateRoot(host, <ResCanary items={items} lang="en" />, { onRecoverableError })
    })
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
    expect(part('title')?.textContent).toBe("Some features couldn't load: Support chat.")
  })
})
