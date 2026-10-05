import { createCanary } from '/dist/res-canary/index.js'
import { mountBanner } from '/dist/res-canary/element.js'

const VENDOR = 'http://127.0.0.1:4174'
// Nothing listens here (see server.ts); the probe tests point at it for a real refused connection.
const CLOSED = 'http://127.0.0.1:4175'
const violations = []
const own = []
let canary

document.addEventListener('securitypolicyviolation', event => {
  violations.push({ blockedURI: event.blockedURI, directive: event.effectiveDirective })
})

globalThis.harness = {
  own,
  violations,
  start({ banner = false, probe, probeTimeoutMs = 2000 } = {}) {
    canary = createCanary({
      features: [{ id: 'widget', impact: "The widget won't load.", label: 'Widget', origins: [VENDOR, CLOSED], probe }],
      onOwnPolicyViolation: violation => own.push(violation),
      ownPolicy: 'own-marker.invalid',
      probeTimeoutMs,
      storage: null,
    })
    canary.start()
    if (banner) mountBanner(canary)
  },
  loadScript(path) {
    const script = document.createElement('script')
    script.src = VENDOR + path
    document.head.append(script)
  },
  loadImage(path) {
    const image = document.createElement('img')
    image.src = VENDOR + path
    document.body.append(image)
  },
  status() {
    return canary.getSnapshot().statuses.widget
  },
  blockedIds() {
    return canary.getSnapshot().blocked.map(feature => feature.id)
  },
  bannerText() {
    const element = document.querySelector('thoro-res-canary')
    return element && !element.hidden ? element.shadowRoot.textContent : null
  },
  bannerPadding() {
    const root = document.querySelector('thoro-res-canary')?.shadowRoot?.querySelector('[part="root"]')
    return root ? getComputedStyle(root).paddingLeft : null
  },
}
