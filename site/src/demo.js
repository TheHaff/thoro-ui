import { createCanary } from '@thoro/ui/res-canary'
import '@thoro/ui/res-canary/element'

// Blocks are simulated with report(): nothing on this page is really blocked, and the demo makes no
// network requests. Storage is off, so a dismissal lasts until Reset.
const features = [
  {
    id: 'chat',
    impact: "The support chat bubble won't appear.",
    label: 'Support chat',
    origins: ['https://widget.chat.example'],
  },
  {
    id: 'sign',
    impact: "You can't sign agreements.",
    label: 'E-signature',
    origins: ['https://*.sign.example'],
  },
]

const banner = document.querySelector('#demo-banner')
const style = document.querySelector('#demo-variant')
let canary

function reset() {
  canary = createCanary({ features, ownPolicy: 'docs.invalid', storage: null })
  banner.canary = canary
}

reset()
for (const button of document.querySelectorAll('[data-block]')) {
  button.addEventListener('click', () => canary.report(button.dataset.block))
}
document.querySelector('#demo-reset').addEventListener('click', reset)
style.addEventListener('click', () => {
  const on = style.getAttribute('aria-pressed') !== 'true'
  style.setAttribute('aria-pressed', String(on))
  banner.variant = on ? 'banner' : 'inline'
})
