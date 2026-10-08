# res-canary for React — design

- **Status:** approved 2026-10-02; implemented 2026-10-02.
- **Entries:** `@thoro/ui/res-canary/react` (components) and `@thoro/ui/res-canary/react.css` (styles), in the existing `@thoro/ui` package.
- **Builds on:** the canary spec [`2026-09-29-res-canary-design.md`](2026-09-29-res-canary-design.md) (detection core, strings, rendered structure) and the collection spec [`2026-10-01-thoro-ui-design.md`](2026-10-01-thoro-ui-design.md) (layout, naming, theming, tooling, and the React-variant rule this component follows).

## Goal

React users choose between the web component (`@thoro/ui/res-canary/element`) and native React components, imported separately. The React variant renders plain React DOM — no custom element and no shadow DOM — on top of the same headless core. People who don't use React never install or ship React.

## Decisions

| decision                                                                     | why                                                                                                                                                                                                                                                               | rejected                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native React components, not a wrapper around the element                    | React users get JSX, props and callbacks, server rendering and their own CSS reach, with no custom element in their tree.                                                                                                                                         | A wrapper rendering `<thoro-res-canary>` (smallest, but not native); hooks only (no drop-in banner).                                                                                                                                                |
| Share the core, the pure helpers and one CSS source                          | Behaviour and look can't drift between the element and React; every fix to detection or text lands once.                                                                                                                                                          | A separate React implementation with hand-written CSS (two looks and two behaviours to keep in step); public hooks from day one (API to freeze).                                                                                                    |
| Styles ship as an importable CSS file                                        | Works with server rendering (no unstyled flash) and with `style-src 'self'`; users who want their own look skip the import.                                                                                                                                       | Injecting a constructed stylesheet at runtime (unstyled until the client runs); unstyled only (no drop-in banner).                                                                                                                                  |
| React 19 only, as an optional peer dependency                                | One version to test; free to use React 19 APIs; React 18 apps can use the web component.                                                                                                                                                                          | React 18 and 19 (a second CI run and a narrower API).                                                                                                                                                                                               |
| No `preventDefault`; uncontrolled mode always dismisses                      | Taking over state is what controlled mode is for in React.                                                                                                                                                                                                        | A cancelable callback mirroring the element's event.                                                                                                                                                                                                |
| `classNames` adds per-part classes; `react.css` stays unlayered (2026-10-08) | QA with Tailwind: there was no way to put a utility class on an inner part. Added classes keep the default look; the README shows importing `react.css` into Tailwind's `components` layer so utilities win (checked with Tailwind 4.3.3 in Chromium and WebKit). | Replacing the built-in classes (skipping `react.css` already gives an unstyled start); shipping `react.css` inside its own layer (it would then lose to Tailwind's reset and to page-wide element rules unless every app declares the layer order). |

## 1. API

```tsx
'use client' // first statement of the entry, so React server components can render it
import { ResCanary } from '@thoro/ui/res-canary/react'
import '@thoro/ui/res-canary/react.css'

// Uncontrolled: it subscribes to the canary and dismisses itself.
<ResCanary canary={canary} variant="banner" onDismiss={ids => track(ids)} />

// Controlled: it renders only the items it is given and reports actions.
<ResCanary items={snapshot.dismissed ? [] : snapshot.blocked} onDismiss={() => canary.dismiss()} />
```

| prop         | type                                                  | meaning                                                                                                                                                                                                                                                                                  |
| ------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canary`     | `Canary`                                              | Uncontrolled source, read with `useSyncExternalStore`. The server snapshot is always empty, so hydration matches the server's markup even when a block was detected while the page was parsing; the banner appears straight after hydrating (changed 2026-10-02 after the final review). |
| `items`      | `readonly BlockedFeature[]`                           | Controlled source. When set (not `undefined`), `canary` is ignored — the element's rule.                                                                                                                                                                                                 |
| `variant`    | `'banner' \| 'inline'`                                | Default `'inline'`.                                                                                                                                                                                                                                                                      |
| `strings`    | `Partial<CanaryStrings>`                              | Text overrides; same keys, defaults and non-string handling as the element (canary spec §7.3).                                                                                                                                                                                           |
| `lang`       | `string`                                              | Locale for joining labels with `Intl.ListFormat`. Default: `document.documentElement.lang` in a browser, else `en`. An invalid value falls back to English. Pass it explicitly when rendering items on a server, so server and client markup agree.                                      |
| `onDismiss`  | `(ids: string[]) => void`                             | Called when × is pressed, with the shown feature ids. In uncontrolled mode `canary.dismiss()` follows.                                                                                                                                                                                   |
| `onCopy`     | `(detail: { text: string; copied: boolean }) => void` | Called after **Copy for IT**, with the same detail as the element's `res-canary-copy` event.                                                                                                                                                                                             |
| `className`  | `string`                                              | Added to the root element.                                                                                                                                                                                                                                                               |
| `classNames` | `Partial<Record<part, string>>`                       | Added after a part's own prefixed classes (added 2026-10-08). Keys are the element's part names (canary spec §7.6): `root`, `icon`, `summary`, `title`, `details`, `toggle`, `list`, `ask`, `origins`, `copy`, `dismiss`; `root` is the region inside the root element.                  |

**Behaviour shared with the element:**

- Renders nothing (`null`) when the list is empty or dismissed.
- The same structure as canary spec §7.5: a region labelled with the title, the warning icon, the summary with its status role and the visually hidden announcement, `details` with the list, the IT request, the origins `pre` and **Copy for IT**, and the dismiss button.
- Labels, impacts and origins are rendered as text, never as markup.
- Focus is never moved when the banner appears. Because React updates the existing DOM rather than rebuilding it, keyboard focus and the open state of `details` survive updates.
- **Copy for IT** writes the origins text with `navigator.clipboard.writeText`; on success the button reads `{copied}` and the status region announces it; if the clipboard fails it selects the `pre` contents with the Selection API and reports `copied: false`.

**Differences from the element, and why:**

- No `preventDefault` — use controlled mode to take over state.
- `lang` is a prop — React must know the locale while rendering, including on a server; the element reads the closest `lang` after it attaches.
- No `mountBanner` — place `<ResCanary variant="banner" />` at the top of the layout.

**Exports** of `@thoro/ui/res-canary/react`: `ResCanary`, `type ResCanaryProps`, `DEFAULT_STRINGS`, `type CanaryStrings`. `createCanary` stays in `@thoro/ui/res-canary`; the React entry never duplicates the core.

## 2. Styling and packaging

**One CSS source.** The element's stylesheet (canary spec §7.6) is rewritten to use class-only selectors — `p` becomes `.summary`, `ul` `.list`, `pre` `.origins`, `button` `.button`, `summary` `.toggle`, `details` `.details` — and the element's renderer adds those classes. Inside its shadow root the element looks exactly as before.

A build step derives `dist/res-canary/react.css` from that text by three rewrites:

| element CSS                 | React CSS                   |
| --------------------------- | --------------------------- |
| `:host`                     | `.thoro-res-canary`         |
| `:host([variant='banner'])` | `.thoro-res-canary--banner` |
| `.<name>`                   | `.thoro-res-canary__<name>` |

The `:host([hidden])` rule is dropped, because the React component renders nothing instead of hiding. The React root carries `thoro-res-canary` and `thoro-res-canary--banner` or `thoro-res-canary--inline`; every inner element carries the prefixed class of its element counterpart.

**Theming** is the collection's: the `--thoro-*` variables on `:root`, or on `.thoro-res-canary` for one instance. Without shadow DOM the page's own CSS can reach the markup. Prefixed class names prevent class clashes, but element-type rules on the page (`button { … }`) apply. The README says so.

**Cascade layers** (added 2026-10-08): `react.css` has no `@layer`, so it beats every layered rule, Tailwind v4's utilities included. The README tells Tailwind users to `@import` it into the `components` layer; the order is then Tailwind's reset, the canary's styles, the app's utilities.

**Package fields** (`packages/thoro-ui/package.json`), added to the existing ones:

```json
"exports": {
  "./res-canary/react": { "types": "./dist/res-canary/react.d.ts", "default": "./dist/res-canary/react.js" },
  "./res-canary/react.css": { "types": "./dist/res-canary/react.css.d.ts", "default": "./dist/res-canary/react.css" }
},
"sideEffects": ["./dist/*/element.js", "./dist/*/*.css"],
"peerDependencies": { "react": "^19.0.0" },
"peerDependenciesMeta": { "react": { "optional": true } }
```

- The CSS files are side effects, so bundlers never drop `import '@thoro/ui/res-canary/react.css'`.
- The build also writes an empty `dist/res-canary/react.css.d.ts` for the `types` condition (added 2026-10-05). Without it, TypeScript's default `noUncheckedSideEffectImports` rejects the CSS import (TS2882) in apps that don't declare `*.css` themselves; Vite apps do, through `vite/client`.
- The React entry needs `react` only — not `react-dom`; selecting the origins text uses the browser's Selection API.
- `'use client'` must be the first statement of `dist/res-canary/react.js`. If bundling drops it, the build step prepends it.

**Strict CSP:** the CSS is a file from the page's own origin, which `style-src 'self'` allows. The components use no `style` props, no `dangerouslySetInnerHTML` and no inline handlers, and nothing touches `window` or `document` while the module loads.

**Size budget:** the React entry ≤ 2 KB gzip, measured with `react` excluded. The CSS file has no separate budget; it is the element's CSS.

## 3. Testing and tooling

**Unit tests** (`test/unit/res-canary/react.test.tsx`, Vitest + happy-dom, rendered with `react-dom/client` and React's `act`; no testing-library):

- nothing rendered when empty or dismissed; uncontrolled mode follows the canary; controlled mode ignores `canary`;
- × calls `onDismiss`, and `canary.dismiss()` only in uncontrolled mode;
- `strings` overrides; `lang` joining; an invalid `lang` falls back to English;
- labels as text (a label containing markup renders as text);
- **Copy for IT**: success shows `{copied}`, announces it and calls `onCopy` with `copied: true`; failure selects the `pre` and calls `onCopy` with `copied: false`;
- the `details` open state and keyboard focus survive an update;
- **shared CSS**: `react.css` has no bare element selectors, every class is prefixed, and the set of classes the React markup uses equals the set the CSS defines.

**Server rendering** (`test/ssr.ts`, plain Node, after the build): importing `dist/res-canary/react.js` touches no DOM; `renderToString` with a fresh canary returns empty markup and with `items` returns the banner with the expected classes; `react.js` begins with the `'use client'` directive.

**Types** (`test/types/consumer.tsx`, `pnpm test:types`, after the build; added 2026-10-05): an app-style file imports every entry by package name, `react.css` included, and type-checks with `noUncheckedSideEffectImports` and `skipLibCheck: false`, so the shipped `.d.ts` files and the `exports` map are checked together.

**Browser** (one Playwright scenario, all three engines): a strict-CSP page with Trusted Types renders `<ResCanary>` styled by `react.css` with zero violations, and a computed style proves the CSS applied. Before Playwright runs, `test:browser` builds a small fixture bundle that includes React (`test/browser/fixtures/res-canary-react.js`, git-ignored).

**Tooling:**

- Package dev dependencies, pinned: `react`, `react-dom`, `@types/react`, `@types/react-dom` (19.3.0).
- Package tsconfig: `jsx: react-jsx`. The Vitest include pattern also matches `*.test.tsx`; a setup file sets React's act-environment flag.
- Lint: oxlint's React rules, including the rules of hooks, on `.tsx` files through a `lint.overrides` entry in the root config. The first implementation task checks which rule names oxlint 1.85 provides.
- Size: a third size-limit entry for `dist/res-canary/react.js` with `react` ignored.
- CI: no new steps; the existing scripts cover the new tests.

**Example:** `examples/react/app.tsx` replaces its hand-built controlled banner with `<ResCanary>`, keeps the custom-UI demo built on `useSyncExternalStore`, and stays type-checked in CI.

## Out of scope

- React 18.
- Public hooks (`useCanary`, `useCopyForIT`) — they can grow out of this design later.
- Wrappers for other frameworks (Vue, Svelte, Angular).
- A runnable React example app; the example stays type-checked only.
