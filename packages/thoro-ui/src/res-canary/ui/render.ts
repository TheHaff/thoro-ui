import type { BlockedFeature } from '../types.ts'
import type { CanaryStrings } from './strings.ts'

export type RenderedCanary = {
  announce: HTMLElement
  copy: HTMLButtonElement
  details: HTMLDetailsElement
  dismiss: HTMLButtonElement
  origins: HTMLPreElement
  root: HTMLElement
}

const SVG_NS = 'http://www.w3.org/2000/svg'

export function originsText(items: readonly BlockedFeature[]): string {
  return [...new Set(items.flatMap(item => item.origins))].sort().join('\n')
}

export function summaryText(
  items: readonly BlockedFeature[],
  strings: Readonly<CanaryStrings>,
  locale: string,
): string {
  return `${strings.title}: ${listFormat(locale).format(items.map(item => item.label))}.`
}

/**
 * Builds the shadow DOM with createElement and text nodes only, so it works on pages that
 * enforce Trusted Types. Event handlers are attached by the element, not here.
 */
export function renderCanary(
  items: readonly BlockedFeature[],
  strings: Readonly<CanaryStrings>,
  locale: string,
): RenderedCanary {
  const announce = h('span', { class: 'visually-hidden' })
  const summary = h(
    'p',
    { class: 'summary', part: 'summary', role: 'status' },
    h('span', { class: 'title', part: 'title' }, summaryText(items, strings, locale)),
    ' ',
    strings.cause,
    announce,
  )
  const origins = h('pre', { part: 'origins' }, originsText(items))
  const copy = h('button', { class: 'copy', part: 'copy', type: 'button' }, strings.copy)
  const details = h(
    'details',
    { part: 'details' },
    h('summary', {}, strings.details),
    h('ul', { part: 'list' }, ...items.map(item => h('li', {}, `${item.label} — ${item.impact}`))),
    h('p', {}, strings.itAsk),
    origins,
    copy,
  )
  const dismiss = h('button', { 'aria-label': strings.dismiss, class: 'dismiss', part: 'dismiss', type: 'button' }, '×')
  const root = h(
    'div',
    { 'aria-label': strings.title, class: 'root', part: 'root', role: 'region' },
    warningIcon(),
    h('div', { class: 'body' }, summary, details),
    dismiss,
  )
  return { announce, copy, details, dismiss, origins, root }
}

function listFormat(locale: string): Intl.ListFormat {
  try {
    return new Intl.ListFormat(locale, { type: 'conjunction' })
  } catch {
    // An invalid lang attribute (e.g. "en_US") must not break the banner.
    return new Intl.ListFormat('en', { type: 'conjunction' })
  }
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string>,
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  element.append(...children)
  return element
}

function warningIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', 'icon')
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', 'M12 3 2 21h20L12 3Zm0 6v5m0 3v.01')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '2')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  svg.append(path)
  return svg
}
