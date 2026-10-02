import type { BlockedFeature, Canary } from '../types.ts'
import { originsText, renderCanary, type RenderedCanary } from './render.ts'
import { resolveStrings, type CanaryStrings } from './strings.ts'
import { canarySheet } from './styles.ts'

export type CanaryVariant = 'banner' | 'inline'

export type CanaryDismissDetail = { ids: string[] }

export type CanaryCopyDetail = { copied: boolean; text: string }

export interface ResCanaryElement extends HTMLElement {
  /** Uncontrolled source: the element subscribes to it and dismisses through it. */
  canary: Canary | undefined
  /** Controlled source: when set, the element renders exactly these and ignores `canary`. */
  items: readonly BlockedFeature[] | undefined
  strings: Partial<CanaryStrings>
  variant: CanaryVariant
}

declare global {
  interface HTMLElementTagNameMap {
    'thoro-res-canary': ResCanaryElement
  }
  interface HTMLElementEventMap {
    'res-canary-copy': CustomEvent<CanaryCopyDetail>
    'res-canary-dismiss': CustomEvent<CanaryDismissDetail>
  }
}

const DEFAULT_TAG = 'thoro-res-canary'
const PROPERTIES = ['canary', 'items', 'strings', 'variant'] as const
const NOTHING: readonly BlockedFeature[] = []

export function defineResCanaryElement(tagName: string = DEFAULT_TAG): void {
  if (typeof customElements === 'undefined' || customElements.get(tagName)) return
  customElements.define(tagName, createElementClass())
}

/** Inserts an uncontrolled banner as the first element of <body> (after DOMContentLoaded if needed). */
export function mountBanner(canary: Canary): ResCanaryElement {
  defineResCanaryElement()
  const element = document.createElement(DEFAULT_TAG)
  element.variant = 'banner'
  element.canary = canary
  if (document.body) document.body.prepend(element)
  else document.addEventListener('DOMContentLoaded', () => document.body.prepend(element), { once: true })
  return element
}

// Built on demand so importing this module where HTMLElement doesn't exist (a server) is safe.
function createElementClass(): CustomElementConstructor {
  return class ResCanary extends HTMLElement implements ResCanaryElement {
    readonly #root: ShadowRoot
    #canary: Canary | undefined
    #items: readonly BlockedFeature[] | undefined
    #strings: Partial<CanaryStrings> = {}
    #unsubscribe: (() => void) | undefined

    constructor() {
      super()
      this.#root = this.attachShadow({ mode: 'open' })
      this.#root.adoptedStyleSheets = [canarySheet()]
    }

    get canary(): Canary | undefined {
      return this.#canary
    }

    set canary(value: Canary | undefined) {
      this.#canary = value
      this.#connect()
    }

    get items(): readonly BlockedFeature[] | undefined {
      return this.#items
    }

    set items(value: readonly BlockedFeature[] | undefined) {
      this.#items = value
      this.#connect()
    }

    get strings(): Partial<CanaryStrings> {
      return this.#strings
    }

    set strings(value: Partial<CanaryStrings>) {
      this.#strings = value ?? {}
      this.#render()
    }

    get variant(): CanaryVariant {
      return this.getAttribute('variant') === 'banner' ? 'banner' : 'inline'
    }

    set variant(value: CanaryVariant) {
      this.setAttribute('variant', value)
    }

    connectedCallback(): void {
      // Properties set before this class was defined sit on the instance and hide the accessors.
      // Re-run them through the setters.
      const self = this as unknown as Record<string, unknown>
      for (const name of PROPERTIES) {
        if (!Object.hasOwn(this, name)) continue
        const value = self[name]
        delete self[name]
        self[name] = value
      }
      this.#connect()
    }

    disconnectedCallback(): void {
      this.#unsubscribe?.()
      this.#unsubscribe = undefined
    }

    #connect(): void {
      this.#unsubscribe?.()
      this.#unsubscribe = undefined
      if (!this.isConnected) return
      if (this.#items === undefined && this.#canary) {
        this.#unsubscribe = this.#canary.subscribe(() => this.#render())
      }
      this.#render()
    }

    #visibleItems(): readonly BlockedFeature[] {
      if (this.#items !== undefined) return this.#items
      const snapshot = this.#canary?.getSnapshot()
      return snapshot && !snapshot.dismissed ? snapshot.blocked : NOTHING
    }

    #render(): void {
      if (!this.isConnected) return
      const items = this.#visibleItems()
      this.hidden = items.length === 0
      if (items.length === 0) {
        this.#root.replaceChildren()
        return
      }
      const strings = resolveStrings(this.#strings)
      const wasOpen = this.#root.querySelector('details')?.open ?? false
      const parts = renderCanary(items, strings, localeOf(this))
      parts.details.open = wasOpen
      parts.copy.addEventListener('click', () => void this.#copy(items, strings, parts))
      parts.dismiss.addEventListener('click', () => this.#dismiss(items))
      this.#root.replaceChildren(parts.root)
    }

    async #copy(items: readonly BlockedFeature[], strings: CanaryStrings, parts: RenderedCanary): Promise<void> {
      const text = originsText(items)
      let copied = false
      try {
        await navigator.clipboard.writeText(text)
        copied = true
      } catch {
        // No clipboard (insecure context, denied permission): select the list so it can be copied by hand.
      }
      if (copied) {
        parts.copy.textContent = strings.copied
        parts.announce.textContent = strings.copied
      } else {
        selectContents(parts.origins)
      }
      this.dispatchEvent(
        new CustomEvent<CanaryCopyDetail>('res-canary-copy', {
          bubbles: true,
          cancelable: true,
          composed: true,
          detail: { copied, text },
        }),
      )
    }

    #dismiss(items: readonly BlockedFeature[]): void {
      const event = new CustomEvent<CanaryDismissDetail>('res-canary-dismiss', {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail: { ids: items.map(item => item.id) },
      })
      const proceed = this.dispatchEvent(event)
      if (proceed && this.#items === undefined) this.#canary?.dismiss()
    }
  }
}

function localeOf(element: Element): string {
  return element.closest('[lang]')?.getAttribute('lang') || document.documentElement.lang || 'en'
}

function selectContents(node: Node): void {
  try {
    const range = document.createRange()
    range.selectNodeContents(node)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  } catch {
    // Selecting inside a shadow root is best-effort; some engines refuse.
  }
}
