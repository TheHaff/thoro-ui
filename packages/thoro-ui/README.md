# thoro-ui

Small, dependency-free web components for compliance-minded web apps. Every component has its own entry point, so your bundle only carries what you import.

**Docs and live demo:** <https://thoro.dev/>

| component    | import                                                                            | what it does                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `res-canary` | `thoro-ui/res-canary`, `thoro-ui/res-canary/element`, `thoro-ui/res-canary/react` | Tells users when their browser or network blocks the third-party resources your app depends on, and gives their IT team the addresses to allow. |

- **Zero dependencies.** Each component has its own size budget, enforced in CI.
- **Works under the strictest CSP**, including Trusted Types.
- **Any framework or none:** plain custom elements, plus a headless core where a component has one.

## Install

```sh
npm install thoro-ui
```

## Theming

Every component reads the same custom properties: `--thoro-bg`, `--thoro-fg`, `--thoro-border`, `--thoro-accent`, `--thoro-radius`, `--thoro-font`. Set them on `:root` to theme the whole collection, or on one tag to theme one component:

```css
:root {
  --thoro-accent: #c2410c;
  --thoro-font: inherit;
}
thoro-res-canary {
  --thoro-bg: #fff7ed;
  --thoro-border: #fb923c;
}
```

Shadow DOM keeps your page's CSS out; each component also exposes `::part()` names, listed in its section below.

## res-canary

Your own Content Security Policy (CSP) allows your support chat, your e-signature SDK, your CDN. Some users still can't load them: a browser extension adds a stricter CSP, a corporate proxy injects one, or an ad blocker or firewall drops the request. Your app isn't told; the user just sees something missing. The canary notices, explains what won't work, and hands them the allowlist.

Core ≤ 2 KB, element ≤ 4 KB (gzip).

### Quick start

Call `start()` as early as possible — before you load any third-party script.

```js
import { createCanary } from 'thoro-ui/res-canary'
import { mountBanner } from 'thoro-ui/res-canary/element'

const canary = createCanary({
  ownPolicy: 'api.app.example', // any string unique to your own CSP
  features: [
    {
      id: 'chat',
      label: 'Support chat',
      impact: "The support chat bubble won't appear.",
      origins: ['https://widget.chat.example'],
      probe: { type: 'script', url: 'https://widget.chat.example/loader.js' },
    },
  ],
})

canary.start()
mountBanner(canary)
```

### How it detects a block

| Signal                                                                                          | Status        | Shown to the user?                                   |
| ----------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------- |
| A CSP violation from a policy that is **not** yours (extension, proxy)                          | `foreign-csp` | yes                                                  |
| A `<script>`, `<img>`, `<link>`, `<video>`, `<audio>` or `<source>` from a feature origin fails | `load-failed` | yes                                                  |
| A startup probe fails or doesn't answer within `probeTimeoutMs`                                 | `load-failed` | yes                                                  |
| `canary.report(id)` — for WebRTC, `fetch`, anything else                                        | `load-failed` | yes                                                  |
| A CSP violation from **your own** policy                                                        | `own-csp`     | no — `onOwnPolicyViolation` is called: it's your bug |

A status only moves up (`unknown → ok → load-failed → foreign-csp → own-csp`), so the most specific reason wins whatever order events arrive in.

#### Choosing `ownPolicy`

Browsers give a page no way to read its own CSP headers, so the canary recognises yours inside each violation's `originalPolicy`. Pass a string that only your policy contains (your API host works well), a `RegExp`, or a function `(policy) => boolean`. It is required: without it, every CSP block would be ambiguous.

#### Features

| field     | meaning                                                                                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | Stable id, used by `report()` and to remember dismissal.                                                                                                                                      |
| `label`   | Short name shown to the user.                                                                                                                                                                 |
| `impact`  | One sentence on what won't work.                                                                                                                                                              |
| `origins` | CSP host-source syntax: `https://host`, `https://*.host`, `wss://host:8443`. No paths. Also the list IT is asked to allow.                                                                    |
| `probe`   | Optional startup check: `script` or `style` (preloads, never runs it), `image`, `fetch` (`no-cors`; needs the origin in your `connect-src`), or `custom` (`run(signal) => Promise<boolean>`). |

### The element

```js
import 'thoro-ui/res-canary/element' // defines <thoro-res-canary>
```

- **Uncontrolled:** `element.canary = canary`. It subscribes and dismisses itself.
- **Controlled:** `element.items = snapshot.blocked`. It renders only what you give it and fires `res-canary-dismiss` (`detail.ids`) and `res-canary-copy` (`detail.text`, `detail.copied`); your code owns the state.
- `variant="banner"` is a full-width strip; `variant="inline"` (default) is a card.
- `element.strings = { title: '…' }` overrides any text: `title`, `cause`, `details`, `itAsk`, `copy`, `copied`, `dismiss`.
- `defineResCanaryElement('my-tag')` registers it under another name.

Both events bubble, cross shadow boundaries and are cancelable; `preventDefault()` on `res-canary-dismiss` skips the uncontrolled dismiss.

Parts: `root`, `summary`, `title`, `details`, `list`, `origins`, `copy`, `dismiss`. `--thoro-radius` applies to the inline card only.

#### React

`thoro-ui/res-canary/react` has native React 19 components: plain React DOM, no custom element. React is an optional peer dependency — install it in your app; nothing else in thoro-ui needs it.

```tsx
import { createCanary } from 'thoro-ui/res-canary'
import { ResCanary } from 'thoro-ui/res-canary/react'
import 'thoro-ui/res-canary/react.css'

const canary = createCanary({ ownPolicy: 'api.app.example', features: [/* … */] })
canary.start() // as early as possible, on the client

export function Layout({ children }) {
  return (
    <>
      <ResCanary canary={canary} variant="banner" />
      {children}
    </>
  )
}
```

| prop        | meaning                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `canary`    | Uncontrolled: subscribes and dismisses itself.                                                     |
| `items`     | Controlled: renders only these (`snapshot.blocked`); `canary` is ignored.                          |
| `variant`   | `'banner'` or `'inline'` (default).                                                                |
| `strings`   | Text overrides, same keys as the element.                                                          |
| `lang`      | Locale for joining labels; defaults to `<html lang>`. Pass it when you render items on the server. |
| `onDismiss` | `(ids) => void`, called when × is pressed; uncontrolled mode then dismisses the canary.            |
| `onCopy`    | `({ text, copied }) => void`, called after **Copy for IT**.                                        |
| `className` | Added to the root (`.thoro-res-canary`).                                                           |

How it differs from the element:

- **Take over state with controlled mode**, not `preventDefault()`.
- **It renders into your page, not a shadow root.** Classes are prefixed (`.thoro-res-canary__*`), but element rules on your page such as `button { … }` apply. Skip `react.css` to style it entirely yourself; the `--thoro-*` variables work either way.
- **The entry starts with `'use client'`**, so frameworks with React Server Components treat it as a client component.

The web component works in React 19 too — see [`examples/react/app.tsx`](https://github.com/TheHaff/thoro-ui/blob/main/examples/react/app.tsx) for both the component and a fully custom UI with `useSyncExternalStore(canary.subscribe, canary.getSnapshot)`.

### API

```ts
createCanary(options): Canary

canary.start()        // listeners + probes; idempotent
canary.stop()         // detach; ignore pending probe results
canary.report(id)     // mark a feature load-failed
canary.dismiss()      // hide until the list of blocked features changes
canary.subscribe(fn)  // returns unsubscribe
canary.getSnapshot()  // { blocked, dismissed, statuses }
```

Options: `features`, `ownPolicy` (required), `onChange`, `onOwnPolicyViolation`, `storage` (default `localStorage`; `null` = this page only), `storageKey` (default `thoro-ui:res-canary:dismissed`), `probeTimeoutMs` (default `15000`; `0` disables).

### Limitations

- **Iframes:** browsers don't report iframe load failures reliably, so they aren't detected.
- **Resources loaded inside a shadow root** (a vendor widget or an app built from web components): their load `error` events never reach the page, so a dropped request there isn't seen. Give the feature a probe or call `canary.report(id)`. CSP blocks inside a shadow root are still detected.
- **`fetch`, XHR, WebSocket, WebRTC:** not detected automatically — call `canary.report(id)` from your error handling.
- **Before `start()`:** violations that happened earlier are missed. Probes still catch a blocked host.
- **`load-failed` includes vendor outages.** The default text says "usually" for that reason.
- **Chrome logs an "unused preload" warning** for `script` and `style` probes. Use a `fetch` probe to avoid it.
- **An extension that hides an element** without blocking its request can't be detected.

## Browser support

Current Chrome, Edge, Firefox and Safari 16.4+.

## License

MIT
