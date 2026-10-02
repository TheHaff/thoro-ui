# res-canary — design

- **Status:** approved 2026-09-29; updated 2026-10-01 to become a thoro-ui component. Not yet implemented.
- **Package:** `thoro-ui`, entries `thoro-ui/res-canary` and `thoro-ui/res-canary/element`
- **Element:** `<thoro-res-canary>`
- **License:** MIT
- **Collection rules:** [`2026-10-01-thoro-ui-design.md`](2026-10-01-thoro-ui-design.md). Layout, naming, theming and tooling come from there; this document covers what is specific to the canary.
- **Implementation plan:** `docs/plans/2026-10-01-res-canary.md` (being rewritten for the new layout).
- **Working rules for this repo:** [`AGENTS.md`](../../AGENTS.md)

> **Changed 2026-10-01.** This spec was `web-res-canary`, a package of its own. It is now the first component of thoro-ui. Renamed: package `web-res-canary` → entries `thoro-ui/res-canary` and `thoro-ui/res-canary/element`; tag `<web-res-canary>` → `<thoro-res-canary>`; `defineCanaryElement` → `defineResCanaryElement`; events `canary-dismiss` / `canary-copy` → `res-canary-dismiss` / `res-canary-copy`; CSS variables `--wrc-*` → the collection's shared `--thoro-*`; storage key `web-res-canary:dismissed` → `thoro-ui:res-canary:dismissed`. §9 now defers to the collection spec, and §12's name decision is superseded. Detection, the core API, statuses, probes and the size budget are unchanged.

## 1. Problem

A web app's own Content Security Policy (CSP) allows the third-party services it depends on — a support chat widget, an e-signature SDK, a CDN, a WebRTC voice service. Some users still cannot load them:

- a browser extension adds its own, stricter CSP to the page;
- a corporate proxy or security product injects a CSP header;
- an ad blocker, DNS filter or firewall drops the request.

The app is not told. The user sees a missing chat bubble or a signing step that never renders, and assumes the app is broken. Monitoring tools report the failures as noise, because the app's own policy allows those origins.

This hits hardest in locked-down environments — regulated industries, large enterprises — where the user cannot change the network and needs to hand their IT team something concrete.

## 2. Goals

1. Detect when a configured third-party dependency fails to load in the user's browser.
2. Tell apart "someone else's CSP blocked it", "it failed to load", and "our own CSP blocked it" (our bug, never shown to the user).
3. Tell the user, in plain language, which features won't work — and give their IT team the exact list of addresses to allow.
4. Work as a drop-in top banner **or** a component rendered anywhere, controlled or uncontrolled, in any framework or none.
5. Work under the strictest CSP itself, including Trusted Types.

## 3. Non-goals (v1)

- Detecting iframe load failures (browsers do not report them reliably).
- Automatic detection of `fetch` / `XMLHttpRequest` / WebSocket / WebRTC failures. Hosts call `report()` instead.
- A server-side reporting endpoint or dashboard. Hosts forward `onChange` to their own telemetry.
- Framework wrappers (React 19, Vue, Svelte and plain HTML consume custom elements natively).
- General CSP violation monitoring. Only violations that match a configured feature are handled.

## 4. Glossary

| term           | meaning                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| feature        | Something the user would notice missing ("Support chat"), with the origins it loads from.                 |
| origin         | A CSP host-source: `scheme://host[:port]`, optionally `*.` for subdomains. The list IT is asked to allow. |
| probe          | An optional startup check that loads one URL of a feature to see whether it is reachable.                 |
| own policy     | The host app's CSP, recognised by `ownPolicy`.                                                            |
| foreign policy | Any other CSP on the page — added by an extension, proxy or security product.                             |
| snapshot       | The immutable state the UI renders: blocked features, dismissal, every status.                            |

## 5. Architecture

Two entry points in the `thoro-ui` package, zero runtime dependencies.

```
thoro-ui/res-canary            core — headless detection + store. No DOM rendering.
thoro-ui/res-canary/element    <thoro-res-canary> custom element. Renders a core snapshot.
```

The core is usable on its own (custom UI via `subscribe`/`getSnapshot`). The element renders what the core produces; the core never depends on the element.

Neither entry point touches `window`, `document` or `customElements` at import time, so both are safe to import during server-side rendering.

## 6. Core

### 6.1 Types

```ts
type Status = 'unknown' | 'ok' | 'load-failed' | 'foreign-csp' | 'own-csp'

type BlockedReason = 'load-failed' | 'foreign-csp'

type Probe =
  | { type: 'script' | 'style' | 'image' | 'fetch'; url: string }
  | { type: 'custom'; run: (signal: AbortSignal) => Promise<boolean> }

type Feature = {
  id: string
  label: string // "Support chat"
  impact: string // "The support chat bubble won't appear."
  origins: readonly string[] // 'https://widget.vendor.example', 'https://*.vendor.example', 'wss://rtc.vendor.example'
  probe?: Probe
}

type BlockedFeature = Feature & { reason: BlockedReason }

type OwnPolicyViolation = {
  featureId: string
  blockedURI: string
  effectiveDirective: string
  originalPolicy: string
}

type Snapshot = {
  blocked: readonly BlockedFeature[] // in `features` order
  dismissed: boolean
  statuses: Readonly<Record<string, Status>>
}

type CanaryStorage = Pick<Storage, 'getItem' | 'setItem'>

type CanaryOptions = {
  features: readonly Feature[]
  ownPolicy: string | RegExp | ((policy: string) => boolean)
  onChange?: (snapshot: Snapshot) => void
  onOwnPolicyViolation?: (violation: OwnPolicyViolation) => void
  storage?: CanaryStorage | null // default: localStorage; null keeps dismissal in memory for this page
  storageKey?: string // default: 'thoro-ui:res-canary:dismissed'
  probeTimeoutMs?: number // default: 15000; 0 disables the timeout
}

type Canary = {
  start: () => void
  stop: () => void
  report: (id: string) => void
  dismiss: () => void
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => Snapshot
}
```

### 6.2 API

```ts
const canary = createCanary(options)

canary.start() // attach listeners, run probes. Idempotent.
canary.stop() // detach listeners, ignore pending probe results. Idempotent.
canary.report(id) // mark a feature 'load-failed' (WebRTC, fetch, anything not element-based)
canary.dismiss() // hide the current list until it changes
canary.subscribe(listener) // returns unsubscribe; compatible with useSyncExternalStore
canary.getSnapshot() // stable reference until something changes
```

`createCanary` validates options and throws a `TypeError` on:

- duplicate feature ids;
- an empty `origins` array, or a malformed origin;
- a missing or empty `ownPolicy` (an empty string would match every policy);
- a probe URL outside its feature's `origins` (the IT list would then be missing the probed host).

The returned methods do not use `this`, so `canary.subscribe` and `canary.getSnapshot` can be passed around unbound (as `useSyncExternalStore` does). The `Canary` type declares them as function-typed properties rather than methods so that type-aware linters (such as the `unbound-method` rule) agree.

`report()` with an unknown id (including inherited names such as `toString`) logs one `console.warn` and does nothing else.

### 6.3 `ownPolicy` is required

Browsers give a page no API to read its own CSP headers. The only way to tell "our policy" from "someone else's" is to recognise ours in the violation's `originalPolicy`. `ownPolicy` is that recogniser:

- **string** — matches when `originalPolicy` contains it. Pick something unique to your policy, such as your API host.
- **RegExp** — tested against `originalPolicy`. `lastIndex` is reset before each test, so a global or sticky RegExp behaves the same every time.
- **function** — full control.

### 6.4 Detection

`start()` attaches two listeners and runs the probes.

**CSP violations** — `document.addEventListener('securitypolicyviolation', …)`:

1. Ignore `disposition === 'report'` (report-only policies block nothing).
2. Match `blockedURI` against every feature's `origins`. No match → ignore. Non-URL values (`inline`, `eval`, `wasm-eval`) never match. If several features share an origin, every matching feature is updated.
3. `ownPolicy` matches `originalPolicy` → status `own-csp`, call `onOwnPolicyViolation`.
4. Otherwise → status `foreign-csp`.

**Element load failures** — `window.addEventListener('error', …, { capture: true })`. Resource errors do not bubble, but they pass through `window` in the capture phase. For `script`, `img`, `link`, `video`, `audio` and `source` targets, take the absolute URL (`href` for links; `currentSrc || src` for images and media; `src` otherwise), match it against `origins`, and mark the feature `load-failed`. Iframes are skipped (see Non-goals).

**Probes** — for each feature with a `probe`:

| type     | mechanism                                                 | notes                                                                                                                       |
| -------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `script` | `<link rel="preload" as="script">` appended to `<head>`   | Does not run the script; same request type ad blockers filter on; warms the cache. Chrome logs an "unused preload" warning. |
| `style`  | `<link rel="preload" as="style">`                         | Same as above.                                                                                                              |
| `image`  | detached `new Image()`                                    | Subject to `img-src`.                                                                                                       |
| `fetch`  | `fetch(url, { mode: 'no-cors', signal })`                 | Needs the origin in the host's `connect-src`; avoids the preload warning.                                                   |
| `custom` | `run(signal)` → `true` ok / anything else or throw failed | For anything else. `signal` aborts on `stop()`.                                                                             |

A probe that succeeds sets `ok` (unless the feature already failed). A probe that errors, or does not settle within `probeTimeoutMs`, sets `load-failed`; a late answer after the timeout is ignored. Preload links are removed once they settle.

Violations fired before `start()` are lost. The README tells hosts to call `start()` before loading any third-party script.

### 6.5 Origin matching

Follows CSP host-source rules, so the lists a host already maintains for its CSP can be reused:

- scheme must match (`https:` matches `https:` only; `wss:` matches `wss:` only). Accepted schemes: `http`, `https`, `ws`, `wss`;
- `*.` matches any subdomain, not the bare domain;
- default ports are implied; a non-default port must be listed;
- host matching ignores case;
- paths (including a trailing `/`) are not supported (validation error).

### 6.6 Status precedence

A feature's status only moves up this list, never down, for the life of the page:

```
unknown → ok → load-failed → foreign-csp → own-csp
```

The error event and the violation event for the same request arrive in either order, so the more specific reason must win regardless of order. `own-csp` wins over everything because a block by our own policy is our bug, whatever else happened.

`blocked` contains features whose status is `load-failed` or `foreign-csp`. `own-csp` features are never shown to the user.

### 6.7 Dismissal

- `dismiss()` stores a signature: the sorted ids in `blocked`, joined with `,`.
- `dismissed` is `true` while the stored signature equals the current one. A new blocked feature changes the signature, so the banner comes back. When `blocked` is empty, `dismissed` is `false`.
- Every storage read and write is wrapped in `try/catch`. A read that throws means "not dismissed"; a write that throws still hides the banner for the current page. `storage: null` keeps dismissal in memory only.
- The default `localStorage` is resolved on first use, not when the canary is created.

### 6.8 Change notification

`onChange` and `subscribe` listeners fire once per snapshot change (status change or dismissal), after the new snapshot is in place. The snapshot object is replaced, never mutated, so `useSyncExternalStore` works without extra memoisation.

A listener that throws does not stop the others; its error is rethrown in a microtask so it still reaches error tracking.

## 7. Element `<thoro-res-canary>`

### 7.1 Registration

```ts
import 'thoro-ui/res-canary/element' // defines <thoro-res-canary>
import { defineResCanaryElement } from 'thoro-ui/res-canary/element'
defineResCanaryElement('my-canary') // additionally registers a custom tag name
```

Definition is skipped when `customElements` is undefined (server) or the tag is already defined. The class is created inside `defineResCanaryElement`, so importing the module where `HTMLElement` does not exist is safe.

Properties set on an element before its class is defined (markup-first pages, or a framework that renders before the import runs) are picked up when it upgrades.

### 7.2 Modes

**Uncontrolled** — give it a canary; it subscribes and dismisses itself:

```ts
el.canary = canary
```

**Controlled** — give it the items; it renders only those and reports user actions as events:

```ts
el.items = snapshot.blocked // BlockedFeature[]
el.addEventListener('res-canary-dismiss', …)
```

When `items` is set (not `undefined`), the element is controlled and ignores `canary`.

The element unsubscribes when removed from the page and catches up with the current snapshot when re-attached.

**Banner helper:**

```ts
import { mountBanner } from 'thoro-ui/res-canary/element'
const el = mountBanner(canary) // variant="banner", prepended to <body>; waits for DOMContentLoaded if needed
el.remove() // unmount
```

### 7.3 Properties and attributes

| name      | kind                 | default  | purpose                                                                     |
| --------- | -------------------- | -------- | --------------------------------------------------------------------------- |
| `canary`  | property             | —        | Uncontrolled source.                                                        |
| `items`   | property             | —        | Controlled source.                                                          |
| `strings` | property             | English  | Partial override of all text (translations). Non-string values are ignored. |
| `variant` | attribute + property | `inline` | `banner` (full-width strip) or `inline` (card).                             |

Default strings:

| key       | default                                                                 |
| --------- | ----------------------------------------------------------------------- |
| `title`   | Some features couldn't load                                             |
| `cause`   | This is usually caused by a browser extension or your network settings. |
| `details` | Details                                                                 |
| `itAsk`   | Ask your IT team to allow these addresses:                              |
| `copy`    | Copy for IT                                                             |
| `copied`  | Copied                                                                  |
| `dismiss` | Dismiss                                                                 |

Feature labels in the summary line are joined with `Intl.ListFormat` using the element's closest `lang` (falls back to `document.documentElement.lang`, then `en`). An invalid `lang` (such as `en_US`) falls back to English instead of throwing.

### 7.4 Events

Both are `bubbles: true, composed: true, cancelable: true`.

| event                | detail                              | uncontrolled default action (skipped if `preventDefault()`) |
| -------------------- | ----------------------------------- | ----------------------------------------------------------- |
| `res-canary-dismiss` | `{ ids: string[] }`                 | `canary.dismiss()`                                          |
| `res-canary-copy`    | `{ text: string, copied: boolean }` | none                                                        |

### 7.5 Rendering

Sets the `hidden` attribute on the host (and renders no children) when the list is empty or dismissed. Otherwise:

```
:host
└ div  part="root"  role="region"  aria-label={title}
  ├ svg  (warning icon, aria-hidden)
  ├ div  (body)
  │  ├ p  part="summary"  role="status"
  │  │  ├ span  part="title"   "{title}: {labels}."
  │  │  ├ " {cause}"
  │  │  └ span  (visually hidden; receives {copied} after a successful copy)
  │  └ details  part="details"
  │     ├ summary  {details}
  │     ├ ul  part="list"      li: "{label} — {impact}"
  │     ├ p   {itAsk}
  │     ├ pre part="origins"   one origin per line, deduplicated, sorted
  │     └ button part="copy"   {copy}
  └ button  part="dismiss"  aria-label={dismiss}   ×
```

- **Copy for IT** writes the `origins` text with `navigator.clipboard.writeText`. On success the button text changes to `{copied}` and the status region announces it. If the clipboard is unavailable or refuses, it selects the `<pre>` contents (best effort) so the user can copy manually, and fires `res-canary-copy` with `copied: false`.
- The open/closed state of `details` survives re-renders.
- Labels and impacts are rendered as text, never as markup.
- Focus is never moved when the element appears. All controls are native elements, so keyboard support comes for free.

### 7.6 Theming

Shadow DOM keeps host CSS out, so theming goes through CSS custom properties and `::part()`. The properties are the collection's shared set ([collection spec §2](2026-10-01-thoro-ui-design.md)): set them on `:root` to theme every thoro-ui component, or on `thoro-res-canary` to theme only this one. The canary's own defaults are the `var()` fallbacks.

| property         | purpose                     |
| ---------------- | --------------------------- |
| `--thoro-bg`     | background                  |
| `--thoro-fg`     | text                        |
| `--thoro-border` | border                      |
| `--thoro-accent` | icon and focus ring         |
| `--thoro-radius` | corner radius (inline only) |
| `--thoro-font`   | font family                 |

Parts: `root`, `summary`, `title`, `details`, `list`, `origins`, `copy`, `dismiss`.

Defaults are a neutral amber warning palette with a `prefers-color-scheme: dark` variant. `banner` is full width with a bottom border and no radius; `inline` is a bordered card. The element has no transitions; any added later must respect `prefers-reduced-motion`.

## 8. Strict-CSP and Trusted Types safety

The package must run on a page with `default-src 'self'`, no `'unsafe-inline'`, no `'unsafe-eval'`, and `require-trusted-types-for 'script'`.

- Styles use a constructed `CSSStyleSheet` in `shadowRoot.adoptedStyleSheets`, never a `<style>` element or `style` attribute. One sheet is shared by every instance and created on first use.
- The DOM is built with `createElement`, `createElementNS` and `textContent` only. No `innerHTML`, `insertAdjacentHTML` or `outerHTML`.
- No `eval`, `new Function`, or string timers. No inline event handlers.
- No network requests other than the configured probes. No fonts, icons or scripts from a CDN.

**To verify in the first implementation task:** that constructed stylesheets are not blocked by a strict `style-src` in Chromium, Firefox and WebKit. If any engine blocks them, stop: the fallback is a `nonce` property that the element applies to a `<style>` element instead, which changes the element's design and needs the maintainer's approval. Verified 2026-09-30 in Chromium and WebKit (no violations, sheet applied); Firefox still to run, from a normal terminal because the agent sandbox stops Firefox launching.

## 9. Packaging

Packaging, tooling and CI follow the [collection spec](2026-10-01-thoro-ui-design.md) (§1 and §3). Specific to the canary:

- `exports`: `"./res-canary"` → core (`dist/res-canary/index.js`), `"./res-canary/element"` → element (`dist/res-canary/element.js`). Only the element entry has side effects.
- The published types include the global `HTMLElementTagNameMap['thoro-res-canary']` and `HTMLElementEventMap` entries for `res-canary-dismiss` and `res-canary-copy`, so `document.createElement('thoro-res-canary')` and `addEventListener('res-canary-dismiss', …)` are typed.
- Size budget enforced in CI: core ≤ 2 KB gzip, element (including core) ≤ 4 KB gzip.
- Browser support: current evergreen browsers; Safari 16.4+ (first version with `adoptedStyleSheets`).
- Publishing to npm (with provenance) is a manual, maintainer-approved step.

## 10. Testing

**Unit (Vitest, happy-dom):**

- Origin matching: scheme, subdomain wildcard, bare domain, look-alike domains, ports, host case, invalid input.
- Classification: foreign vs own policy for all three `ownPolicy` forms, including a global RegExp; report-only ignored; unmatched URLs ignored.
- Precedence: every event order for the same feature ends at the most specific status.
- Dismissal: signature stored; banner returns when the list changes; storage that throws on read or write; `storage: null`.
- Snapshot identity only changes on real changes; `onChange` fires once per change; a throwing listener does not starve the others; unbound `subscribe`/`getSnapshot` work.
- Probes: each type's success and failure; timeout; late answers ignored; `stop()` aborts.
- Element: renders nothing when empty; uncontrolled dismiss; controlled mode ignores `canary`; `preventDefault()` skips the default action; copy success and fallback; `strings` override; `Intl.ListFormat` joining and invalid `lang`; properties set before definition; unsubscribe on removal; `details` state kept.

**Server import (plain Node):** both built entry points import without a DOM, and `createCanary` works there.

**Browser (Playwright, Chromium + Firefox + WebKit):** fixture pages served by a small local HTTP server started through Playwright's `webServer`, on two ports so "third party" is a real second origin.

1. Page with only its own policy, vendor allowed → nothing shown.
2. Same page plus a second, stricter CSP header (simulating an extension or proxy) → `foreign-csp`, banner lists the feature.
3. Vendor request aborted with `page.route` → `load-failed`.
4. Own policy that does not allow the vendor → `own-csp`, `onOwnPolicyViolation` called, nothing shown.
5. Strict CSP + Trusted Types page → element renders and styles apply with zero violations (the check in section 8).
6. Each probe type: success → `ok`; blocked → `load-failed`; hung request → `load-failed` after the timeout.

## 11. Documentation and examples

- README (the res-canary section of the package README, which is the npm page): what it does, quick start (banner in a few lines), choosing `ownPolicy`, the feature config, controlled vs uncontrolled, theming, API, and **Limitations**: iframes, `fetch`/WebSocket/WebRTC need `report()`, violations before `start()` are missed, `load-failed` also covers vendor outages, the Chrome unused-preload warning, extensions that hide elements without blocking them.
- `examples/vanilla/` — a small Vite app (one HTML page and one module), run with `vp -C examples/vanilla dev`.
- `examples/react/` — React 19: the element in controlled mode, and a custom UI via `useSyncExternalStore`. Type-checked in CI.
- Examples are not published to npm. They use `*.example` / `*.invalid` hosts only.

## 12. Decisions

Settled during design. Revisit only with a new reason.

| decision                                                           | why                                                                                                                                                          | rejected                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headless core + a custom element                                   | Detection is useful without any UI; the element gives a drop-in banner for any framework.                                                                    | A React-only component (locks out other stacks); UI-only (no custom rendering).                                                                       |
| Plain custom element, no Lit                                       | One small leaf component doesn't need a framework; zero dependencies and the size budget are selling points. React 19 passes properties and events natively. | Lit (~5 KB); per-framework wrappers (maintenance for no gain in v1).                                                                                  |
| Automatic detection by capture-phase `error` + violation listeners | No per-feature wiring for element-based resources.                                                                                                           | Wrapping each loader by hand (easy to forget).                                                                                                        |
| `report()` for everything else                                     | WebRTC, `fetch` and WebSocket failures are not element events; monkey-patching `fetch` is intrusive.                                                         | Patching globals.                                                                                                                                     |
| `ownPolicy` required                                               | Without it, "our bug" and "their environment" are indistinguishable.                                                                                         | Optional with a guess; reading the page's own headers (no browser API; a same-origin re-fetch can be proxied too).                                    |
| Statuses only move up, and stay for the page's life                | Events for one request arrive in either order; the most specific reason must win.                                                                            | Last event wins (order-dependent results).                                                                                                            |
| Dismissal keyed to the set of blocked features, persisted          | A network that always blocks a vendor would otherwise show the banner every visit; a newly blocked feature is new information and brings it back.            | Per-page only (nagging); dismiss forever (hides new problems).                                                                                        |
| `script`/`style` probes use `preload`                              | Checks reachability without running third-party code; ad blockers filter on the same request type as a real script load.                                     | Injecting the real script (runs vendor code everywhere); `fetch` (different request type; needs `connect-src`) — still offered as its own probe type. |
| Probe silence counts as blocked after 15 s                         | Firewalls often drop packets rather than refuse them.                                                                                                        | No timeout (a silent block is never reported).                                                                                                        |
| Default text says "usually"                                        | The browser cannot tell a blocked request from a vendor outage.                                                                                              | "Your network is blocking…" (wrong during outages).                                                                                                   |
| Shadow DOM + constructed stylesheet                                | Host CSS can't break the banner; works under strict CSP without `'unsafe-inline'`.                                                                           | Light DOM with classes (host CSS collisions); `<style>` in shadow root (needs `'unsafe-inline'` or a nonce).                                          |
| ~~Name `web-res-canary`~~ — superseded 2026-10-01                  | Covers scripts, images, media, probes and WebRTC; free on npm; doubles as the element tag.                                                                   | `canary` (taken), `csp-canary` (most blocks aren't CSP), `cdn-canary` (not only CDNs), `resource-canary` (maintainer's choice was the `web-` prefix). |
| Name `res-canary` inside thoro-ui (2026-10-01)                     | New reason: the canary is now the first component of a collection, so it takes the collection's `thoro-` tag prefix and `thoro-ui/<name>` entry points.      | Keeping `<web-res-canary>` as a standalone name.                                                                                                      |

## 13. Definition of done (v1)

- [ ] Every unit test, the server-import check and all browser scenarios pass in Chromium, Firefox and WebKit.
- [ ] `pnpm size` passes: core ≤ 2 KB, element ≤ 4 KB (gzip).
- [ ] `pnpm pack` in `packages/thoro-ui` contains only `dist/`, `package.json`, `README.md` and `LICENSE`.
- [ ] README covers everything in section 11; examples run (vanilla) and type-check (React).
- [ ] CI is green on GitHub.
- [ ] No private company, customer or vendor names anywhere in the repo.
- [ ] Publishing is left to the maintainer.

## 14. Risks

| risk                                                                                 | mitigation                                                                                                                         |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Constructed stylesheets blocked by `style-src` in some engine                        | Verified first (plan Task 1); `nonce` fallback needs approval (section 8).                                                         |
| `load-failed` shown during a vendor outage, blaming the user's network               | Default copy says "usually", not "always"; hosts can override `strings`.                                                           |
| Slow networks hit `probeTimeoutMs` and show a false positive                         | 15 s default; configurable; `0` disables.                                                                                          |
| An extension blocks a vendor without CSP or a network error (e.g. hides the element) | Not detectable; documented as a limitation.                                                                                        |
| Host calls `start()` after third-party scripts already failed                        | README quick start calls `start()` before anything else; `start()` also runs the probes, which catch a block the listeners missed. |
| Core grows past the 2 KB budget                                                      | CI fails; trim error-message text before raising the limit, and only raise it with the maintainer's agreement.                     |
