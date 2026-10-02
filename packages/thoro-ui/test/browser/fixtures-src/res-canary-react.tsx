import { createRoot } from 'react-dom/client'
import { createCanary } from '../../../src/res-canary/index.ts'
import { ResCanary } from '../../../src/res-canary/react.ts'

// The React variant on a strict-CSP page: its stylesheet is a file from this origin, and React itself
// must need neither eval nor a Trusted Types sink.
const violations: string[] = []
document.addEventListener('securitypolicyviolation', event => {
  violations.push(`${event.effectiveDirective} ${event.blockedURI}`)
})

const link = document.createElement('link')
link.rel = 'stylesheet'
link.href = '/dist/res-canary/react.css'
document.head.append(link)

const canary = createCanary({
  features: [{ id: 'widget', impact: "The widget won't load.", label: 'Widget', origins: ['http://127.0.0.1:4174'] }],
  ownPolicy: 'own-marker.invalid',
  storage: null,
})
canary.start()
canary.report('widget')

const host = document.createElement('div')
document.body.append(host)
createRoot(host).render(<ResCanary canary={canary} variant="banner" />)

globalThis.reactHarness = {
  bannerText: () => document.querySelector('.thoro-res-canary')?.textContent ?? null,
  rootPadding: () => {
    const root = document.querySelector('.thoro-res-canary__root')
    return root ? getComputedStyle(root).paddingLeft : null
  },
  violations,
}
