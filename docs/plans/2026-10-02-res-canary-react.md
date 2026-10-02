# res-canary React variant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native React 19 components for res-canary — `thoro-ui/res-canary/react` plus `thoro-ui/res-canary/react.css` — so React users can choose them instead of the web component, without anyone else installing or shipping React.

**Architecture:** The React entry renders plain React DOM on top of the existing headless core and the existing pure helpers (`summaryText`, `originsText`, `resolveStrings`). Its stylesheet is generated from the element's stylesheet after `vp pack`, which first requires the element CSS to use class-only selectors. React is an optional peer dependency; size-limit and `vp pack` already leave peers out.

**Tech Stack:** React 19.3.0 and react-dom 19.3.0 (dev + optional peer), Vite+ 1.0.0 (`vp pack`, `vp test`, `vp build` for one browser fixture), Vitest + happy-dom, Playwright, TypeScript 7.0.2.

**Specs:** `docs/specs/2026-10-02-res-canary-react-design.md` (this feature), `docs/specs/2026-10-01-thoro-ui-design.md` (collection rules, incl. the React-variant rule in §2), `docs/specs/2026-09-29-res-canary-design.md` (the canary). Read all three alongside this plan.

**Verified before writing (2026-10-02, throwaway worktree):** `vp pack` keeps `'use client'` as the first statement of `dist/res-canary/react.js` and leaves `react` / `react/jsx-runtime` external; the only noise is a `MODULE_LEVEL_DIRECTIVE` warning, silenced by `suppressWarnings` and harmless in CI. Vitest + happy-dom renders React 19 with `react-dom/client` and `act`. size-limit leaves peer dependencies out of its measurement without any `ignore` option. oxlint 1.85's React rules are configured as `react/rules-of-hooks` and `react/exhaustive-deps` under the `react` plugin (reported as `react-hooks(…)`). A `vp build --config …` library build bundles React for a browser fixture with no `eval`, `new Function` or `process.env`, and that fixture renders under the strict CSP + Trusted Types page with zero violations in Chromium and WebKit.

## Global Constraints

- React is an optional peer: `"peerDependencies": { "react": "^19.0.0" }`, `"peerDependenciesMeta": { "react": { "optional": true } }`. Only `/react` entries import it. No `react-dom` import in `src/`.
- `'use client'` is the first statement of `src/res-canary/react.ts` and of `dist/res-canary/react.js`.
- New exports: `"./res-canary/react"` → `./dist/res-canary/react.js` (+ `.d.ts`), `"./res-canary/react.css"` → `./dist/res-canary/react.css`. `"sideEffects": ["./dist/*/element.js", "./dist/*/*.css"]`.
- Classes: React root `thoro-res-canary` plus `thoro-res-canary--banner` or `thoro-res-canary--inline`; every inner element `thoro-res-canary__<class>`, one for each class in the element's CSS.
- Element CSS uses class-only selectors plus `:host` rules; `react.css` is derived from it, never written by hand.
- Strict CSP in `src/` (canary spec §8), React code included: no `style` props, no `dangerouslySetInnerHTML`, no inline handlers in markup strings, nothing touches `window`/`document` while a module loads.
- Size budgets: core ≤ 2 KB, element ≤ 4 KB (unchanged); React entry ≤ 2 KB gzip, React not counted.
- Exports of `thoro-ui/res-canary/react`: `ResCanary`, `type ResCanaryProps`, `DEFAULT_STRINGS`, `type CanaryStrings`.
- Default strings and their keys are the element's (`DEFAULT_STRINGS`).
- Public repo: tests and fixtures use `*.example`, `*.invalid` and `127.0.0.1` hosts only.
- Formatting: oxfmt (`semi: false`, `singleQuote: true`, `printWidth: 120`, `trailingComma: 'all'`, `arrowParens: 'avoid'`).
- Tooling: Vite+ only; pin dev dependencies exactly; `pnpm typecheck` (`tsc`) is the type check.
- Node 24 (`.node-version`). Inside an agent sandbox Firefox cannot launch — run Chromium and WebKit, and ask the maintainer to run Firefox from a normal terminal (AGENTS.md).
- **Git: the maintainer makes every commit.** Each task ends with a hand-off step: list the changed files and propose a commit message. Never run `git add` or `git commit` unless the maintainer asks.

## Review Focus

1. **Server-rendered markup hydrates cleanly** — `renderToString(<ResCanary items lang="en" />)` then `hydrateRoot` with the same props → no recoverable error, no console error. Test: Task 3.
2. **The `canary` prop changes between renders** (a new canary instance) → the component unsubscribes from the old one and shows the new one's items. Test: Task 3.
3. **The list changes after a successful copy** → the button reads "Copy for IT" again, because the copied text no longer matches the list. Test: Task 3.
4. **The component unmounts while a copy is pending** → no console error when the clipboard answers afterwards. Test: Task 3.
5. **A non-string value in `strings`** (an untyped caller) → ignored, the default shows. Test: Task 3.

## File Structure

```
packages/thoro-ui/
  package.json                     exports, sideEffects, peer deps, scripts (build, build:fixtures, test:browser, prepack)
  vite.config.ts                   pack entry + suppressWarnings; test include *.tsx + setup file
  vite.fixtures.config.ts          NEW  library build of the React browser fixture (React bundled in)
  tsconfig.json                    jsx: react-jsx; include scripts
  .size-limit.json                 + React entry
  scripts/react-css.ts             NEW  reactCss(css, block): derives the React stylesheet from the element's
  scripts/build-react-css.ts       NEW  writes dist/res-canary/react.css after vp pack
  src/res-canary/
    react.ts                       NEW  React entry ('use client'; re-exports)
    react/res-canary.tsx           NEW  the ResCanary component
    ui/styles.ts                   class-only selectors; exports CANARY_CSS
    ui/render.ts                   adds the classes the CSS now uses
    ui/select.ts                   NEW  selectContents, moved out of ui/element.ts (shared with React)
    ui/element.ts                  imports selectContents
  test/
    unit/setup-react.ts            NEW  sets React's act-environment flag
    unit/res-canary/styles.test.ts NEW  class-only selectors; CSS classes = renderer classes
    unit/res-canary/react-css.test.ts NEW
    unit/res-canary/react.test.tsx NEW
    ssr.ts                         + React entry checks
    browser/globals.d.ts           + reactHarness
    browser/fixtures-src/res-canary-react.tsx  NEW (bundled to fixtures/res-canary-react.js, git-ignored)
    browser/res-canary/react.spec.ts           NEW
  README.md                        React section
vite.config.ts (root)              lint override for *.tsx
.gitignore                         + the bundled fixture
examples/react/                    app.tsx uses <ResCanary>; tsconfig paths; css.d.ts
AGENTS.md, docs/specs/*            rules and status lines
```

---

### Task 1: Element CSS with class-only selectors

The React stylesheet will be generated from the element's by prefixing classes, which only works if the element CSS has no bare element selectors. The element must look exactly as before; the existing browser scenarios (banner padding, strict CSP) guard that.

**Files:**

- Modify: `packages/thoro-ui/src/res-canary/ui/styles.ts` (selectors; export `CANARY_CSS`), `packages/thoro-ui/src/res-canary/ui/render.ts` (classes)
- Test: `packages/thoro-ui/test/unit/res-canary/styles.test.ts`

**Interfaces:**

- Consumes: `renderCanary` (render.ts), `DEFAULT_STRINGS` (strings.ts).
- Produces: `export const CANARY_CSS: string` in `ui/styles.ts` — Tasks 2 and 3 read it. The renderer and the CSS use exactly these classes: `ask`, `body`, `button`, `copy`, `details`, `dismiss`, `icon`, `list`, `origins`, `root`, `summary`, `title`, `toggle`, `visually-hidden`.

- [ ] **Step 1: Write the failing test**

`packages/thoro-ui/test/unit/res-canary/styles.test.ts`:

```ts
import type { BlockedFeature } from '../../../src/res-canary/types.ts'
import { renderCanary } from '../../../src/res-canary/ui/render.ts'
import { DEFAULT_STRINGS } from '../../../src/res-canary/ui/strings.ts'
import { CANARY_CSS } from '../../../src/res-canary/ui/styles.ts'

const chat: BlockedFeature = {
  id: 'chat',
  impact: "The chat bubble won't appear.",
  label: 'Support chat',
  origins: ['https://widget.chat.example'],
  reason: 'foreign-csp',
}

/** Every selector in a stylesheet, one per comma-separated part, with @media wrappers skipped. */
function selectors(css: string): string[] {
  return [...css.matchAll(/([^{}]+)\{/g)]
    .map(match => match[1].trim())
    .filter(selector => !selector.startsWith('@'))
    .flatMap(selector => selector.split(',').map(part => part.trim()))
}

function classesIn(css: string): string[] {
  const names = selectors(css).flatMap(selector => [...selector.matchAll(/\.([a-z][a-z-]*)/g)].map(match => match[1]))
  return [...new Set(names)].sort()
}

describe('the element stylesheet', () => {
  it('uses only :host and class selectors, so the React stylesheet can be derived by prefixing classes', () => {
    const bare = selectors(CANARY_CSS).filter(selector =>
      /(^|[\s>+~])[a-z]/.test(selector.replace(/:host(\([^)]*\))?/g, '')),
    )
    expect(bare).toEqual([])
  })

  it('defines exactly the classes the renderer uses', () => {
    const { root } = renderCanary([chat], DEFAULT_STRINGS, 'en')
    const used = new Set([root, ...root.querySelectorAll('*')].flatMap(element => [...element.classList]))
    expect([...used].sort()).toEqual(classesIn(CANARY_CSS))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -C packages/thoro-ui test test/unit/res-canary/styles.test.ts`
Expected: FAIL — `CANARY_CSS` is not exported (`undefined`), so both tests fail (no selectors / `matchAll` on undefined throws).

- [ ] **Step 3: Rewrite the selectors in `packages/thoro-ui/src/res-canary/ui/styles.ts`**

Change `const CSS = \`` to:

```ts
/** The element's stylesheet. Class-only selectors (plus :host), so scripts/react-css.ts can derive react.css. */
export const CANARY_CSS: string = `
```

and `sheet.replaceSync(CSS)` to `sheet.replaceSync(CANARY_CSS)`. Then replace the bare element selectors, keeping every declaration as it is:

| old selector                                        | new selector                                         |
| --------------------------------------------------- | ---------------------------------------------------- |
| `p {`                                               | `.summary,` + newline + `.ask {`                     |
| `details {`                                         | `.details {`                                         |
| `summary {`                                         | `.toggle {`                                          |
| `ul {`                                              | `.list {`                                            |
| `pre {`                                             | `.origins {`                                         |
| `button {`                                          | `.button {`                                          |
| `button:focus-visible,` / `summary:focus-visible {` | `.button:focus-visible,` / `.toggle:focus-visible {` |

- [ ] **Step 4: Add the classes in `packages/thoro-ui/src/res-canary/ui/render.ts`**

In `renderCanary`, change these attribute objects (everything else stays):

```ts
const origins = h('pre', { class: 'origins', part: 'origins' }, originsText(items))
const copy = h('button', { class: 'button copy', part: 'copy', type: 'button' }, strings.copy)
const details = h(
  'details',
  { class: 'details', part: 'details' },
  h('summary', { class: 'toggle' }, strings.details),
  h('ul', { class: 'list', part: 'list' }, ...items.map(item => h('li', {}, `${item.label} — ${item.impact}`))),
  h('p', { class: 'ask' }, strings.itAsk),
  origins,
  copy,
)
const dismiss = h(
  'button',
  { 'aria-label': strings.dismiss, class: 'button dismiss', part: 'dismiss', type: 'button' },
  '×',
)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — all files, including the two new tests (93 tests).

- [ ] **Step 6: Prove the element still looks the same in real browsers**

Run: `pnpm -C packages/thoro-ui test:browser --project=chromium --project=webkit`
Expected: `30 passed` — including the strict-CSP scenario that checks the banner's `16px` padding.

Run: `pnpm build && pnpm size`
Expected: exit 0; core 1.98 kB unchanged; element ≤ 4 KB (about 2.8 kB).

- [ ] **Step 7: Lint, format, type-check**

Run: `pnpm format && pnpm format:check && pnpm lint && pnpm typecheck`
Expected: all exit 0.

- [ ] **Step 8: Hand off for commit**

Propose: `refactor: use class-only selectors in the res-canary element stylesheet`. Do not run git.

---

### Task 2: Generate `react.css` from the element stylesheet

**Files:**

- Create: `packages/thoro-ui/scripts/react-css.ts`, `packages/thoro-ui/scripts/build-react-css.ts`
- Modify: `packages/thoro-ui/package.json` (scripts, `exports`, `sideEffects`), `packages/thoro-ui/tsconfig.json` (`include`)
- Test: `packages/thoro-ui/test/unit/res-canary/react-css.test.ts`

**Interfaces:**

- Consumes: `CANARY_CSS` (Task 1).
- Produces: `export function reactCss(css: string, block: string): string` in `scripts/react-css.ts` (Task 3's tests use it); `dist/res-canary/react.css` written by `pnpm build`; the `./res-canary/react.css` export.

- [ ] **Step 1: Write the failing test**

`packages/thoro-ui/test/unit/res-canary/react-css.test.ts`:

```ts
import { reactCss } from '../../../scripts/react-css.ts'
import { CANARY_CSS } from '../../../src/res-canary/ui/styles.ts'

const css = reactCss(CANARY_CSS, 'thoro-res-canary')

describe('reactCss', () => {
  it('turns :host into the React root class and the banner host selector into a modifier', () => {
    expect(css).toContain('.thoro-res-canary {')
    expect(css).toContain('.thoro-res-canary--banner .thoro-res-canary__root {')
    expect(css).not.toContain(':host')
  })

  it('drops the hidden rule, because the React component renders nothing instead of hiding', () => {
    expect(css).not.toContain('[hidden]')
  })

  it('prefixes every class with the block name', () => {
    const classes = [...css.matchAll(/\.([a-z][a-z_-]*)/g)].map(match => match[1])
    expect(classes.length).toBeGreaterThan(10)
    expect(classes.filter(name => name !== 'thoro-res-canary' && !/^thoro-res-canary(__|--)/.test(name))).toEqual([])
  })

  it('keeps the theme variables and the dark-mode block', () => {
    expect(css).toContain('--_bg: var(--thoro-bg, #fffbeb);')
    expect(css).toContain('@media (prefers-color-scheme: dark) {\n  .thoro-res-canary {')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -C packages/thoro-ui test test/unit/res-canary/react-css.test.ts`
Expected: FAIL — cannot resolve `../../../scripts/react-css.ts`.

- [ ] **Step 3: Implement `packages/thoro-ui/scripts/react-css.ts`**

```ts
/**
 * Derives a component's React stylesheet from its element stylesheet (collection spec §2). Element CSS
 * uses class-only selectors plus :host rules, which is what makes these plain rewrites safe; the order
 * matters, because the classes are prefixed before :host turns into a class of its own.
 */
export function reactCss(css: string, block: string): string {
  return css
    .replace(/:host\(\[hidden\]\) \{[^}]*\}\n/, '')
    .replace(/\.([a-z][a-z-]*)/g, `.${block}__$1`)
    .replace(/:host\(\[variant='banner'\]\)/g, `.${block}--banner`)
    .replace(/:host/g, `.${block}`)
}
```

`packages/thoro-ui/scripts/build-react-css.ts`:

```ts
// Writes each component's React stylesheet into dist/ after `vp pack`, which empties dist/ first.
import { mkdirSync, writeFileSync } from 'node:fs'
import { CANARY_CSS } from '../src/res-canary/ui/styles.ts'
import { reactCss } from './react-css.ts'

const out = new URL('../dist/res-canary/', import.meta.url)
mkdirSync(out, { recursive: true })
writeFileSync(new URL('react.css', out), reactCss(CANARY_CSS, 'thoro-res-canary').trimStart())
console.log('wrote dist/res-canary/react.css')
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -C packages/thoro-ui test test/unit/res-canary/react-css.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire it into the build and the package**

In `packages/thoro-ui/tsconfig.json`, change `"include": ["src", "test"]` to `"include": ["src", "test", "scripts"]`.

In `packages/thoro-ui/package.json` `scripts`, change:

```json
    "build": "vp pack && node scripts/build-react-css.ts",
    "prepack": "pnpm run build",
    "test:browser": "pnpm run build && playwright test",
```

Add the export and widen `sideEffects` (oxfmt sorts the keys):

```json
    "./res-canary/react.css": "./dist/res-canary/react.css",
```

```json
  "sideEffects": ["./dist/*/element.js", "./dist/*/*.css"],
```

- [ ] **Step 6: Build and check what ships**

Run: `pnpm build && head -12 packages/thoro-ui/dist/res-canary/react.css`
Expected: `wrote dist/res-canary/react.css`; the file starts with `.thoro-res-canary {` and the `--_bg` variables.

Run: `cd packages/thoro-ui && pnpm pack && tar -tzf thoro-ui-0.0.0.tgz | grep -c react.css && rm thoro-ui-0.0.0.tgz && cd ../..`
Expected: `1`.

- [ ] **Step 7: Lint, format, type-check, tests**

Run: `pnpm format && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`
Expected: all exit 0.

- [ ] **Step 8: Hand off for commit**

Propose: `build: generate react.css from the res-canary element stylesheet`. Do not run git.

---

### Task 3: The `<ResCanary>` React component

**Files:**

- Create: `packages/thoro-ui/src/res-canary/react.ts`, `packages/thoro-ui/src/res-canary/react/res-canary.tsx`, `packages/thoro-ui/src/res-canary/ui/select.ts`, `packages/thoro-ui/test/unit/setup-react.ts`
- Modify: `packages/thoro-ui/src/res-canary/ui/element.ts` (import `selectContents`), `packages/thoro-ui/package.json` (dev deps, peer deps, export), `packages/thoro-ui/vite.config.ts` (test include + setup, pack entry, `suppressWarnings`), `packages/thoro-ui/tsconfig.json` (`jsx`), `packages/thoro-ui/.size-limit.json`, root `vite.config.ts` (lint override)
- Test: `packages/thoro-ui/test/unit/res-canary/react.test.tsx`

**Interfaces:**

- Consumes: `Canary`, `Snapshot`, `BlockedFeature` (types.ts); `summaryText`, `originsText` (ui/render.ts); `resolveStrings`, `DEFAULT_STRINGS`, `CanaryStrings` (ui/strings.ts); type-only `CanaryCopyDetail`, `CanaryVariant` (ui/element.ts); `reactCss` (Task 2) and `CANARY_CSS` (Task 1) in tests.
- Produces: `ResCanary(props: ResCanaryProps): ReactElement | null`, `type ResCanaryProps = { canary?: Canary; className?: string; items?: readonly BlockedFeature[]; lang?: string; onCopy?: (detail: CanaryCopyDetail) => void; onDismiss?: (ids: string[]) => void; strings?: Partial<CanaryStrings>; variant?: CanaryVariant }`; `selectContents(node: Node): void` in `ui/select.ts`; `dist/res-canary/react.js` (Task 4's SSR check and browser fixture use the entry).

- [ ] **Step 1: Install React and set up the tooling**

Run: `pnpm -C packages/thoro-ui add -D -E react@19.3.0 react-dom@19.3.0 @types/react@19.3.0 @types/react-dom@19.3.0`

In `packages/thoro-ui/package.json`, add (oxfmt sorts the keys):

```json
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "peerDependenciesMeta": {
    "react": {
      "optional": true
    }
  },
```

and the export:

```json
    "./res-canary/react": {
      "types": "./dist/res-canary/react.d.ts",
      "default": "./dist/res-canary/react.js"
    },
```

In `packages/thoro-ui/tsconfig.json` `compilerOptions`, add `"jsx": "react-jsx",`.

In `packages/thoro-ui/vite.config.ts`:

- in `test`, change `include: ['test/unit/**/*.test.ts']` to `include: ['test/unit/**/*.test.{ts,tsx}']` and add `setupFiles: ['test/unit/setup-react.ts'],`;
- in `pack.entry`, add `'res-canary/react': 'src/res-canary/react.ts',`;
- in `pack`, add:

```ts
    // The bundler warns that a module directive may not survive bundling; 'use client' does (test/ssr.ts
    // checks the first line of dist/res-canary/react.js), so the warning is noise.
    suppressWarnings: ['module level directive "use client"'],
```

`packages/thoro-ui/test/unit/setup-react.ts`:

```ts
// The React tests wrap updates in act(); this flag tells React so, and keeps it from warning.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
```

In the root `vite.config.ts` `lint` block, add before `options`:

```ts
    overrides: [
      {
        // React variants (collection spec §2): the rules of hooks.
        files: ['**/*.tsx'],
        plugins: ['react'],
        rules: {
          'react/exhaustive-deps': 'error',
          'react/rules-of-hooks': 'error',
        },
      },
    ],
```

Add to `packages/thoro-ui/.size-limit.json`:

```json
{
  "name": "res-canary react (React itself is a peer and is not counted)",
  "path": "dist/res-canary/react.js",
  "limit": "2 KB",
  "gzip": true
}
```

- [ ] **Step 2: Move `selectContents` into `packages/thoro-ui/src/res-canary/ui/select.ts`**

Create the file with the function cut from the bottom of `ui/element.ts`, now exported:

```ts
/** Selects a node's text so the user can copy it by hand when the clipboard is unavailable. */
export function selectContents(node: Node): void {
  try {
    const range = document.createRange()
    range.selectNodeContents(node)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  } catch {
    // Best-effort: some engines refuse to select inside a shadow root.
  }
}
```

In `ui/element.ts`, delete the local `selectContents` function and add `import { selectContents } from './select.ts'` with the other imports.

Run: `pnpm test`
Expected: PASS (all existing tests; the element still selects through the moved function).

- [ ] **Step 3: Write the failing tests**

`packages/thoro-ui/test/unit/res-canary/react.test.tsx`:

```tsx
import { act } from 'react'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { reactCss } from '../../../scripts/react-css.ts'
import { createCanary } from '../../../src/res-canary/canary.ts'
import { ResCanary, type ResCanaryProps } from '../../../src/res-canary/react.ts'
import type { Canary, Feature } from '../../../src/res-canary/types.ts'
import { CANARY_CSS } from '../../../src/res-canary/ui/styles.ts'

const chat: Feature = {
  id: 'chat',
  impact: "The chat bubble won't appear.",
  label: 'Support chat',
  origins: ['https://widget.chat.example'],
}
const sign: Feature = {
  id: 'sign',
  impact: "You can't sign agreements.",
  label: 'E-signature',
  origins: ['https://*.sign.example'],
}

function canaryWith(...blocked: string[]): Canary {
  const canary = createCanary({ features: [chat, sign], ownPolicy: 'own.example', storage: null })
  for (const id of blocked) canary.report(id)
  return canary
}

let host: HTMLDivElement
let root: Root | undefined

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  document.documentElement.removeAttribute('lang')
})

function render(props: ResCanaryProps): void {
  act(() => {
    root ??= createRoot(host)
    root.render(<ResCanary {...props} />)
  })
}

const part = (name: string): HTMLElement | null => host.querySelector(`.thoro-res-canary__${name}`)

describe('<ResCanary>', () => {
  it('renders nothing until the canary has something blocked, then follows it', () => {
    const canary = canaryWith()
    render({ canary })
    expect(host.innerHTML).toBe('')
    act(() => canary.report('chat'))
    expect(part('title')?.textContent).toBe("Some features couldn't load: Support chat.")
  })

  it('renders nothing once the canary is dismissed', () => {
    const canary = canaryWith('chat')
    render({ canary })
    act(() => canary.dismiss())
    expect(host.innerHTML).toBe('')
  })

  it("renders the element's structure with prefixed classes", () => {
    render({ canary: canaryWith('chat'), className: 'mine', variant: 'banner' })
    const outer = host.firstElementChild as HTMLElement
    expect([...outer.classList]).toEqual(['thoro-res-canary', 'thoro-res-canary--banner', 'mine'])
    expect(part('root')?.getAttribute('role')).toBe('region')
    expect(part('root')?.getAttribute('aria-label')).toBe("Some features couldn't load")
    expect(part('summary')?.getAttribute('role')).toBe('status')
    expect(part('summary')?.textContent).toBe(
      "Some features couldn't load: Support chat. This is usually caused by a browser extension or your network settings.",
    )
    expect(part('toggle')?.textContent).toBe('Details')
    expect(part('list')?.textContent).toBe("Support chat — The chat bubble won't appear.")
    expect(part('ask')?.textContent).toBe('Ask your IT team to allow these addresses:')
    expect(part('origins')?.textContent).toBe('https://widget.chat.example')
    expect(part('copy')?.textContent).toBe('Copy for IT')
    expect(part('dismiss')?.getAttribute('aria-label')).toBe('Dismiss')
    expect(part('icon')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('uses exactly the classes react.css defines', () => {
    render({ canary: canaryWith('chat') })
    const used = new Set(
      [...host.querySelectorAll('*')].flatMap(element => [...element.classList]).filter(name => name.includes('__')),
    )
    const defined = new Set(
      [...reactCss(CANARY_CSS, 'thoro-res-canary').matchAll(/\.(thoro-res-canary__[a-z-]+)/g)].map(match => match[1]),
    )
    expect([...used].sort()).toEqual([...defined].sort())
  })

  it('in controlled mode renders only its items and ignores the canary', () => {
    const canary = canaryWith('chat')
    render({ canary, items: [] })
    expect(host.innerHTML).toBe('')
    render({ canary, items: canaryWith('sign').getSnapshot().blocked })
    expect(part('title')?.textContent).toBe("Some features couldn't load: E-signature.")
    act(() => canary.report('sign'))
    expect(part('list')?.children).toHaveLength(1)
  })

  it('dismisses an uncontrolled canary after calling onDismiss', () => {
    const canary = canaryWith('chat')
    const onDismiss = vi.fn()
    render({ canary, onDismiss })
    act(() => part('dismiss')?.click())
    expect(onDismiss).toHaveBeenCalledWith(['chat'])
    expect(canary.getSnapshot().dismissed).toBe(true)
    expect(host.innerHTML).toBe('')
  })

  it('in controlled mode only reports the dismissal', () => {
    const canary = canaryWith('chat')
    const onDismiss = vi.fn()
    render({ canary, items: canary.getSnapshot().blocked, onDismiss })
    act(() => part('dismiss')?.click())
    expect(onDismiss).toHaveBeenCalledWith(['chat'])
    expect(canary.getSnapshot().dismissed).toBe(false)
    expect(part('root')).not.toBeNull()
  })

  it('applies string overrides and ignores non-string values', () => {
    render({ canary: canaryWith('chat'), strings: { copy: 42 as unknown as string, title: 'Heads up' } })
    expect(part('title')?.textContent).toBe('Heads up: Support chat.')
    expect(part('copy')?.textContent).toBe('Copy for IT')
  })

  it('joins labels for lang, falls back to English when it is invalid, and defaults to <html lang>', () => {
    render({ canary: canaryWith('chat', 'sign'), lang: 'de' })
    expect(part('title')?.textContent).toBe("Some features couldn't load: Support chat und E-signature.")
    render({ canary: canaryWith('chat', 'sign'), lang: 'en_US' })
    expect(part('title')?.textContent).toBe("Some features couldn't load: Support chat and E-signature.")
    document.documentElement.lang = 'de'
    render({ canary: canaryWith('chat', 'sign') })
    expect(part('title')?.textContent).toBe("Some features couldn't load: Support chat und E-signature.")
  })

  it('treats labels as text, never markup', () => {
    const canary = createCanary({
      features: [{ ...chat, label: '<img src=x onerror=alert(1)>' }],
      ownPolicy: 'own.example',
      storage: null,
    })
    canary.report('chat')
    render({ canary })
    expect(host.querySelector('img')).toBeNull()
    expect(part('title')?.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('copies the origins for IT and announces it', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const onCopy = vi.fn()
    render({ canary: canaryWith('chat'), onCopy })
    await act(async () => part('copy')?.click())
    expect(writeText).toHaveBeenCalledWith('https://widget.chat.example')
    expect(onCopy).toHaveBeenCalledWith({ copied: true, text: 'https://widget.chat.example' })
    expect(part('copy')?.textContent).toBe('Copied')
    expect(part('visually-hidden')?.textContent).toBe('Copied')
  })

  it('reports a refused copy and keeps the button text', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('NotAllowedError'))
    const onCopy = vi.fn()
    render({ canary: canaryWith('chat'), onCopy })
    await act(async () => part('copy')?.click())
    expect(onCopy).toHaveBeenCalledWith({ copied: false, text: 'https://widget.chat.example' })
    expect(part('copy')?.textContent).toBe('Copy for IT')
  })

  it('keeps the details open and keyboard focus when the list changes', () => {
    const canary = canaryWith('chat')
    render({ canary })
    ;(part('details') as HTMLDetailsElement).open = true
    part('copy')?.focus()
    act(() => canary.report('sign'))
    expect((part('details') as HTMLDetailsElement).open).toBe(true)
    expect(document.activeElement).toBe(part('copy'))
    expect(part('list')?.children).toHaveLength(2)
  })

  // Review Focus 3
  it('shows Copy for IT again when the list changes after a copy', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const canary = canaryWith('chat')
    render({ canary })
    await act(async () => part('copy')?.click())
    expect(part('copy')?.textContent).toBe('Copied')
    act(() => canary.report('sign'))
    expect(part('copy')?.textContent).toBe('Copy for IT')
  })

  // Review Focus 2
  it('follows a different canary when the prop changes', () => {
    render({ canary: canaryWith('chat') })
    render({ canary: canaryWith('sign') })
    expect(part('title')?.textContent).toBe("Some features couldn't load: E-signature.")
  })

  // Review Focus 4
  it('ignores a copy that finishes after the component unmounted', async () => {
    let finish: () => void = () => {}
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve
        }),
    )
    const errors = vi.spyOn(console, 'error')
    render({ canary: canaryWith('chat') })
    act(() => part('copy')?.click())
    act(() => root?.unmount())
    root = undefined
    await act(async () => finish())
    expect(errors).not.toHaveBeenCalled()
  })

  // Review Focus 1
  it('hydrates server-rendered markup without a mismatch', () => {
    const items = canaryWith('chat').getSnapshot().blocked
    // Test-only: put the server's HTML where React will hydrate it.
    host.innerHTML = renderToString(<ResCanary items={items} lang="en" />)
    const errors = vi.spyOn(console, 'error')
    const onRecoverableError = vi.fn()
    act(() => {
      root = hydrateRoot(host, <ResCanary items={items} lang="en" />, { onRecoverableError })
    })
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
    expect(part('title')?.textContent).toBe("Some features couldn't load: Support chat.")
  })
})
```

- [ ] **Step 4: Run them to verify they fail**

Run: `pnpm -C packages/thoro-ui test test/unit/res-canary/react.test.tsx`
Expected: FAIL — cannot resolve `../../../src/res-canary/react.ts`.

- [ ] **Step 5: Implement `packages/thoro-ui/src/res-canary/react/res-canary.tsx`**

```tsx
import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { BlockedFeature, Canary, Snapshot } from '../types.ts'
import type { CanaryCopyDetail, CanaryVariant } from '../ui/element.ts'
import { originsText, summaryText } from '../ui/render.ts'
import { selectContents } from '../ui/select.ts'
import { resolveStrings, type CanaryStrings } from '../ui/strings.ts'

export type ResCanaryProps = {
  canary?: Canary
  className?: string
  items?: readonly BlockedFeature[]
  lang?: string
  onCopy?: (detail: CanaryCopyDetail) => void
  onDismiss?: (ids: string[]) => void
  strings?: Partial<CanaryStrings>
  variant?: CanaryVariant
}

const BLOCK = 'thoro-res-canary'
const NOTHING: readonly BlockedFeature[] = []
const noSubscription = (): (() => void) => () => {}
const noSnapshot = (): undefined => undefined

/** `thoro-res-canary__<name>` for each name: the classes react.css derives from the element's CSS. */
const cls = (...names: string[]): string => names.map(name => `${BLOCK}__${name}`).join(' ')

/** Native React rendering of the canary: the element's structure and text, without a custom element. */
export function ResCanary(props: ResCanaryProps): ReactElement | null {
  const { canary, className, items, lang, onCopy, onDismiss, strings: overrides, variant = 'inline' } = props
  // Controlled mode ignores the canary entirely, so it doesn't even subscribe.
  const source = items === undefined ? canary : undefined
  const snapshot = useSyncExternalStore<Snapshot | undefined>(
    source?.subscribe ?? noSubscription,
    source?.getSnapshot ?? noSnapshot,
    source?.getSnapshot ?? noSnapshot,
  )
  const origins = useRef<HTMLPreElement>(null)
  // The text that was last copied: "Copied" shows only while the list still produces that text.
  const [copiedText, setCopiedText] = useState<string | null>(null)

  const shown = items ?? (snapshot && !snapshot.dismissed ? snapshot.blocked : NOTHING)
  if (shown.length === 0) return null

  const strings = resolveStrings(overrides)
  const locale = lang ?? ((typeof document === 'undefined' ? '' : document.documentElement.lang) || 'en')
  const text = originsText(shown)
  const copied = copiedText === text

  const copy = async (): Promise<void> => {
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      // No clipboard (insecure context, denied permission): select the list so it can be copied by hand.
    }
    if (ok) setCopiedText(text)
    else if (origins.current) selectContents(origins.current)
    onCopy?.({ copied: ok, text })
  }

  const dismiss = (): void => {
    onDismiss?.(shown.map(item => item.id))
    if (items === undefined) canary?.dismiss()
  }

  return (
    <div className={[BLOCK, `${BLOCK}--${variant}`, className].filter(Boolean).join(' ')}>
      <div aria-label={strings.title} className={cls('root')} role="region">
        <svg aria-hidden="true" className={cls('icon')} viewBox="0 0 24 24">
          <path
            d="M12 3 2 21h20L12 3Zm0 6v5m0 3v.01"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
        <div className={cls('body')}>
          <p className={cls('summary')} role="status">
            <span className={cls('title')}>{summaryText(shown, strings, locale)}</span> {strings.cause}
            <span className={cls('visually-hidden')}>{copied ? strings.copied : ''}</span>
          </p>
          <details className={cls('details')}>
            <summary className={cls('toggle')}>{strings.details}</summary>
            <ul className={cls('list')}>
              {shown.map(item => (
                <li key={item.id}>{`${item.label} — ${item.impact}`}</li>
              ))}
            </ul>
            <p className={cls('ask')}>{strings.itAsk}</p>
            <pre className={cls('origins')} ref={origins}>
              {text}
            </pre>
            <button className={cls('button', 'copy')} onClick={() => void copy()} type="button">
              {copied ? strings.copied : strings.copy}
            </button>
          </details>
        </div>
        <button aria-label={strings.dismiss} className={cls('button', 'dismiss')} onClick={dismiss} type="button">
          ×
        </button>
      </div>
    </div>
  )
}
```

If oxfmt moves `</span> {strings.cause}` onto separate lines, it keeps the space as `{' '}`; the summary text must stay "…Support chat. This is usually…".

- [ ] **Step 6: Create the entry `packages/thoro-ui/src/res-canary/react.ts`**

```ts
'use client'

export { ResCanary } from './react/res-canary.tsx'
export type { ResCanaryProps } from './react/res-canary.tsx'
export { DEFAULT_STRINGS } from './ui/strings.ts'
export type { CanaryStrings } from './ui/strings.ts'
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — all files, including 17 React tests.

- [ ] **Step 8: Build and check the entry**

Run: `pnpm build && head -3 packages/thoro-ui/dist/res-canary/react.js && pnpm size`
Expected: the build lists `dist/res-canary/react.js` and `react.d.ts` with no `MODULE_LEVEL_DIRECTIVE` warning; the file starts with `"use client";` followed by imports from `"react"` and `"react/jsx-runtime"`; `pnpm size` passes with the React entry well under 2 KB (about 1 kB), core and element unchanged.

- [ ] **Step 9: Lint, format, type-check**

Run: `pnpm format && pnpm format:check && pnpm lint && pnpm typecheck`
Expected: all exit 0 (the React lint rules now run on the `.tsx` files).

- [ ] **Step 10: Hand off for commit**

Propose: `feat: add native React components for res-canary`. Do not run git.

---

### Task 4: Server rendering and the strict-CSP browser scenario

**Files:**

- Create: `packages/thoro-ui/vite.fixtures.config.ts`, `packages/thoro-ui/test/browser/fixtures-src/res-canary-react.tsx`, `packages/thoro-ui/test/browser/res-canary/react.spec.ts`
- Modify: `packages/thoro-ui/test/ssr.ts`, `packages/thoro-ui/test/browser/globals.d.ts`, `packages/thoro-ui/package.json` (scripts), root `.gitignore`

**Interfaces:**

- Consumes: `dist/res-canary/react.js` and `react.css` (Tasks 2–3); `createCanary` and `ResCanary` from source for the fixture; the fixture server and its `strict` policy (`/page?csp=strict&script=<name>` loads `/fixtures/<name>.js`).
- Produces: nothing for later tasks.

- [ ] **Step 1: Extend the server-import check**

In `packages/thoro-ui/test/ssr.ts`, add next to the existing imports:

```ts
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
```

and before `console.log('ssr: ok')`:

```ts
const reactEntry = new URL('../dist/res-canary/react.js', import.meta.url)
const react = await import(reactEntry.href)
assert.match(readFileSync(reactEntry, 'utf8'), /^"use client";/)

const fresh = core.createCanary({
  features: [{ id: 'a', impact: 'A is unavailable.', label: 'A', origins: ['https://a.example'] }],
  ownPolicy: 'own.example',
  storage: null,
})
assert.equal(renderToString(createElement(react.ResCanary, { canary: fresh })), '')
const html = renderToString(createElement(react.ResCanary, { items: canary.getSnapshot().blocked, lang: 'en' }))
assert.match(html, /class="thoro-res-canary thoro-res-canary--inline"/)
assert.match(html, /Some features couldn&#x27;t load: A\./)
```

- [ ] **Step 2: Run it to verify the new checks pass against the build**

Run: `pnpm build && pnpm test:ssr`
Expected: prints `ssr: ok` (the React entry imports in plain Node, starts with `"use client";`, renders nothing for a fresh canary and the banner for items).

Run: `sed -i '' '1d' packages/thoro-ui/dist/res-canary/react.js && pnpm test:ssr; pnpm build > /dev/null`
Expected: the first command FAILS on the `"use client"` assertion (proving the check bites), then the rebuild restores the file.

- [ ] **Step 3: Create the fixture build config**

`packages/thoro-ui/vite.fixtures.config.ts` (left out of the tsconfig like every config file):

```ts
import { defineConfig } from 'vite-plus'

// Bundles the React browser fixture with React included — the package itself leaves React to the
// consumer. Production mode, so React's own build has no development-only code paths.
export default defineConfig({
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    emptyOutDir: false,
    outDir: 'test/browser/fixtures',
    lib: {
      entry: 'test/browser/fixtures-src/res-canary-react.tsx',
      fileName: () => 'res-canary-react.js',
      formats: ['es'],
    },
  },
})
```

Append to the root `.gitignore`:

```
packages/thoro-ui/test/browser/fixtures/res-canary-react.js
```

In `packages/thoro-ui/package.json` `scripts`, add `"build:fixtures": "vp build --config vite.fixtures.config.ts",` and change `test:browser` to:

```json
    "test:browser": "pnpm run build && pnpm run build:fixtures && playwright test",
```

- [ ] **Step 4: Write the fixture and type its global**

`packages/thoro-ui/test/browser/fixtures-src/res-canary-react.tsx`:

```tsx
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
```

In `packages/thoro-ui/test/browser/globals.d.ts`, add inside `declare global`:

```ts
var reactHarness: { bannerText(): string | null; rootPadding(): string | null; violations: string[] }
```

- [ ] **Step 5: Write the scenario**

`packages/thoro-ui/test/browser/res-canary/react.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

// The fixture is a module script, which runs before the load event goto() waits for; React renders
// and the stylesheet loads after that, so both are polled. Only page.evaluate is used (no page eval).
test('the React variant renders and styles itself under a strict CSP with Trusted Types', async ({ page }) => {
  await page.goto('/page?csp=strict&script=res-canary-react')
  await expect
    .poll(() => page.evaluate(() => reactHarness.bannerText()))
    .toContain("Some features couldn't load: Widget.")
  await expect.poll(() => page.evaluate(() => reactHarness.rootPadding())).toBe('16px')
  expect(await page.evaluate(() => reactHarness.violations)).toEqual([])
})
```

- [ ] **Step 6: Run it to verify it fails, then passes**

Run: `rm -f packages/thoro-ui/test/browser/fixtures/res-canary-react.js && pnpm -C packages/thoro-ui exec playwright test test/browser/res-canary/react.spec.ts --project=chromium`
Expected: FAIL — `reactHarness is not defined` (the fixture isn't built yet).

Run: `pnpm -C packages/thoro-ui test:browser --project=chromium --project=webkit`
Expected: the fixture build prints `test/browser/fixtures/res-canary-react.js` (a `MODULE_LEVEL_DIRECTIVE` warning for `'use client'` in this build is expected and harmless); `32 passed` (16 per engine). Ask the maintainer to run `pnpm -C packages/thoro-ui test:browser --project=firefox` from a normal terminal (expected `16 passed`).

- [ ] **Step 7: Lint, format, type-check, tests**

Run: `pnpm format && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`
Expected: all exit 0; the bundled fixture is git-ignored, so format and lint skip it.

- [ ] **Step 8: Hand off for commit**

Propose: `test: check the React entry in Node and under a strict CSP in real browsers`. Do not run git.

---

### Task 5: Docs, example and rules

**Files:**

- Modify: `packages/thoro-ui/README.md` (React section), `examples/react/app.tsx`, `examples/react/tsconfig.json`, `AGENTS.md`, `README.md` (root), the status lines of `docs/specs/2026-10-02-res-canary-react-design.md`, `docs/specs/2026-10-01-thoro-ui-design.md` and `docs/specs/2026-09-29-res-canary-design.md`
- Create: `examples/react/css.d.ts`

**Interfaces:**

- Consumes: the public React entry and CSS (Tasks 2–3).
- Produces: nothing.

- [ ] **Step 1: Switch the React example to `<ResCanary>`**

Replace `examples/react/app.tsx` with:

```tsx
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
```

`examples/react/css.d.ts` (the type check runs before any build, so the CSS file doesn't exist yet):

```ts
// CSS imports are handled by the app's bundler; for the type check they are side-effect modules.
declare module '*.css'
```

In `examples/react/tsconfig.json`, add the React entry to `paths` and the declaration to `include`:

```json
      "thoro-ui/res-canary/react": ["../../packages/thoro-ui/src/res-canary/react.ts"]
```

```json
  "include": ["app.tsx", "css.d.ts"]
```

Run: `pnpm typecheck`
Expected: exit 0 in `packages/thoro-ui` and `examples/react`.

- [ ] **Step 2: Rewrite the README's React section**

In `packages/thoro-ui/README.md`, replace the `#### React 19` subsection with:

````markdown
#### React

`thoro-ui/res-canary/react` has native React 19 components: plain React DOM, no custom element. React is an optional peer dependency — install it in your app; nothing else in thoro-ui needs it.

```tsx
import { createCanary } from 'thoro-ui/res-canary'
import { ResCanary } from 'thoro-ui/res-canary/react'
import 'thoro-ui/res-canary/react.css'

const canary = createCanary({ ownPolicy: 'api.example.com', features: [/* … */] })
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
````

In the root `README.md`, change the `res-canary` row's text to end with `… and gives their IT team the addresses to allow. Web component or native React.`

- [ ] **Step 3: Update AGENTS.md**

In `AGENTS.md`:

- under **Status**, add after the canary spec line: `- **React variant spec:** [\`docs/specs/2026-10-02-res-canary-react-design.md\`](docs/specs/2026-10-02-res-canary-react-design.md)`and change the plan line to list both plans:`docs/plans/2026-10-01-res-canary.md`(done) and`docs/plans/2026-10-02-res-canary-react.md`;
- in **Layout**, after the `src/<name>/` line, add: `  src/<name>/react.ts, react/      optional native React variant (collection spec §2); react.css is generated by scripts/`;
- in **Rules**, change the zero-runtime-dependencies bullet's first sentence to: `**Zero runtime dependencies.** React is an optional peer dependency, imported only by \`/react\` entries.`;
- in **Rules**, extend the strict-CSP bullet with: `React code included: no \`style\` props, no \`dangerouslySetInnerHTML\`.`;
- in **Code style**, add: `- \`.tsx\` only for React components; element CSS uses class-only selectors (plus \`:host\`), because \`react.css\` is generated from it.`

- [ ] **Step 4: Mark the specs implemented**

- `docs/specs/2026-10-02-res-canary-react-design.md` line 3: `- **Status:** approved 2026-10-02; implemented YYYY-MM-DD.`, with today's date written in (the day this step runs).
- `docs/specs/2026-10-01-thoro-ui-design.md` status line: replace `The React-variant rules (decision row, §1, §2 and §3, amended 2026-10-02) await the maintainer's review of the written text.` with `The React-variant rules (amended 2026-10-02) are implemented for the canary.`
- `docs/specs/2026-09-29-res-canary-design.md` status line: replace `(awaiting review)` with `(implemented)`.

- [ ] **Step 5: Run the full check**

Run: `pnpm format && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build && pnpm size && pnpm test:ssr && pnpm -C packages/thoro-ui test:browser --project=chromium --project=webkit`
Expected: every command exits 0; `32 passed` in the browsers. Ask the maintainer to run the Firefox project from a normal terminal (`16 passed`).

- [ ] **Step 6: Hand off for commit**

Propose: `docs: document the React variant and update the rules`. Do not run git.
