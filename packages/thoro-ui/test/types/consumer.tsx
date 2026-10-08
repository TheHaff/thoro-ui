// Type-checks the built package the way an app sees it: every entry imported by name, so TypeScript
// resolves it through package.json `exports` to the shipped .d.ts files. Run after `pnpm build`.
import { createCanary } from '@thoro/ui/res-canary'
import { defineResCanaryElement, mountBanner } from '@thoro/ui/res-canary/element'
import { ResCanary } from '@thoro/ui/res-canary/react'
import '@thoro/ui/res-canary/react.css'

const canary = createCanary({
  features: [{ id: 'a', impact: 'A is unavailable.', label: 'A', origins: ['https://a.example'] }],
  ownPolicy: 'own.example',
})

defineResCanaryElement('my-canary')
void mountBanner
void (<ResCanary canary={canary} classNames={{ copy: 'rounded-full', toggle: 'underline' }} />)
// @ts-expect-error: classNames takes the documented part names only
void (<ResCanary canary={canary} classNames={{ button: 'rounded-full' }} />)
