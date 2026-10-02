import { useSyncExternalStore, type JSX } from 'react'
import { createCanary, type Canary } from 'thoro-ui/res-canary'
import { ResCanary } from 'thoro-ui/res-canary/react'
import 'thoro-ui/res-canary/react.css'

// Create and start once, on the client, before any third-party script loads.
const canary: Canary = createCanary({
  features: [
    {
      id: 'chat',
      impact: "The support chat bubble won't appear.",
      label: 'Support chat',
      origins: ['https://widget.chat.example'],
      probe: { type: 'script', url: 'https://widget.chat.example/loader.js' },
    },
  ],
  ownPolicy: 'api.example.com',
})
canary.start()

/** The drop-in banner: native React, styled by react.css. Put it at the top of your layout. */
export function Banner(): JSX.Element {
  return <ResCanary canary={canary} variant="banner" />
}

/** Custom UI: the core alone, no component. */
export function CanaryNotice(): JSX.Element | null {
  const { blocked, dismissed } = useSyncExternalStore(canary.subscribe, canary.getSnapshot)
  if (dismissed || blocked.length === 0) return null
  return (
    <aside role="status">
      <p>These features couldn't load: {blocked.map(feature => feature.label).join(', ')}.</p>
      <button type="button" onClick={() => canary.dismiss()}>
        Dismiss
      </button>
    </aside>
  )
}
