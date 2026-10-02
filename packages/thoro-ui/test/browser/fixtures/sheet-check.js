// Does a constructed stylesheet adopted by a shadow root apply under style-src 'self'
// (no 'unsafe-inline') and Trusted Types? The element depends on the answer being yes.
const violations = []
document.addEventListener('securitypolicyviolation', event => {
  violations.push(`${event.effectiveDirective} ${event.blockedURI}`)
})

class SheetCheck extends HTMLElement {
  constructor() {
    super()
    const sheet = new CSSStyleSheet()
    sheet.replaceSync('.box { padding-left: 17px; }')
    const root = this.attachShadow({ mode: 'open' })
    root.adoptedStyleSheets = [sheet]
    const box = document.createElement('div')
    box.className = 'box'
    box.textContent = 'box'
    root.append(box)
  }
}

customElements.define('sheet-check', SheetCheck)
document.body.append(document.createElement('sheet-check'))

globalThis.sheetCheck = {
  paddingLeft: () =>
    getComputedStyle(document.querySelector('sheet-check').shadowRoot.querySelector('.box')).paddingLeft,
  violations,
}
