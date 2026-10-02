import { useCallback, useSyncExternalStore, type DetailedHTMLProps, type HTMLAttributes, type JSX } from 'react'
import { createCanary, type BlockedFeature, type Canary } from 'thoro-ui/res-canary'
import 'thoro-ui/res-canary/element'
import type { ResCanaryElement } from 'thoro-ui/res-canary/element'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'thoro-res-canary': DetailedHTMLProps<HTMLAttributes<ResCanaryElement>, ResCanaryElement> & {
        variant?: 'banner' | 'inline'
      }
    }
  }
}

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

const NOTHING: readonly BlockedFeature[] = []

/** Controlled mode: React owns the state; the element only renders it. */
export function CanaryBanner(): JSX.Element {
  const snapshot = useSyncExternalStore(canary.subscribe, canary.getSnapshot)
  const items = snapshot.dismissed ? NOTHING : snapshot.blocked
  const ref = useCallback(
    (element: ResCanaryElement | null) => {
      if (!element) return
      element.items = items
      const onDismiss = (): void => canary.dismiss()
      element.addEventListener('res-canary-dismiss', onDismiss)
      return () => element.removeEventListener('res-canary-dismiss', onDismiss)
    },
    [items],
  )
  return <thoro-res-canary ref={ref} variant="banner" />
}

/** Custom UI: the core alone, no element. */
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
