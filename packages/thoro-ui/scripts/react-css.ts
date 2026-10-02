/**
 * Derives a component's React stylesheet from its element stylesheet (collection spec §2). Element CSS
 * uses class-only selectors plus :host rules, which is what makes these plain rewrites safe; the order
 * matters, because the classes are prefixed before :host turns into a class of its own.
 */
export function reactCss(css: string, block: string): string {
  return (
    css
      .replace(/:host\(\[hidden\]\)\s*\{[^}]*\}\s*/, '')
      // Only selector text (whatever precedes a `{`), so dots inside values such as url(…) stay as they are.
      .replace(/([^{}]+)\{/g, (_, selector: string) => `${selector.replace(/\.([a-z][a-z-]*)/g, `.${block}__$1`)}{`)
      .replace(/:host\(\[variant='banner'\]\)/g, `.${block}--banner`)
      .replace(/:host/g, `.${block}`)
  )
}
