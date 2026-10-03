import { createCanary } from 'thoro-ui/res-canary'
import { mountBanner } from 'thoro-ui/res-canary/element'

const canary = createCanary({
  features: [
    {
      id: 'chat',
      impact: "The support chat bubble won't appear.",
      label: 'Support chat',
      origins: ['https://widget.chat.invalid'],
      probe: { type: 'script', url: 'https://widget.chat.invalid/loader.js' },
    },
  ],
  ownPolicy: 'api.app.example',
  storage: null,
})

canary.start()
mountBanner(canary)
