# res-canary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the repo into the thoro-ui workspace and ship its first component, `res-canary`: a zero-dependency headless core (`thoro-ui/res-canary`) that detects when a user's browser or network blocks the third-party resources a web app depends on, and a `<thoro-res-canary>` custom element (`thoro-ui/res-canary/element`) that tells the user what won't work and gives their IT team the addresses to allow.

**Architecture:** A pnpm workspace whose only published package is `packages/thoro-ui`, with one entry point per component and no root entry. The canary's core listens for `securitypolicyviolation` events and capture-phase resource `error` events, runs optional startup probes, and keeps a per-feature status that only moves up in specificity. Its element entry defines a plain custom element with a shadow root styled by a constructed stylesheet; it renders a core snapshot in uncontrolled mode or caller-supplied items in controlled mode.

**Tech Stack:** Vite+ 1.0.0 (bundles Vitest 5.0.1, tsdown 0.23.0, oxlint 1.85.0, oxfmt 0.70.0), TypeScript 7.0.2 (strict, `isolatedDeclarations`), happy-dom 20.14.5, Playwright 1.63.0 (Chromium, Firefox, WebKit), size-limit 14.1.0, pnpm 12.8.1 workspace, Node 24.

**Specs:** `docs/specs/2026-10-01-thoro-ui-design.md` (collection rules: layout, naming, theming, tooling) and `docs/specs/2026-09-29-res-canary-design.md` (the canary). Read both alongside this plan.

**Where this starts:** this plan replaces `docs/plans/2026-09-29-web-res-canary.md`, written when the canary was a standalone package. That plan's Task 1 is already done and committed at the repo root: Vite+ tooling (`package.json`, `vite.config.ts`, `tsconfig.json`, `.gitignore`, `.node-version`, `pnpm-lock.yaml`), the Playwright config, and `test/browser/` (fixture server, stylesheet check). It passed in Chromium and WebKit; the Firefox run is still open. Task 1 below moves that work into the workspace layout.

## Global Constraints

- Zero runtime dependencies.
- Neither entry point touches `window`, `document` or `customElements` at import time.
- Styles use a constructed `CSSStyleSheet` in `shadowRoot.adoptedStyleSheets`, never a `<style>` element or `style` attribute.
- The DOM is built with `createElement`, `createElementNS` and `textContent` only. No `innerHTML`, `insertAdjacentHTML` or `outerHTML`.
- No `eval`, `new Function`, or string timers. No inline event handlers.
- No network requests other than the configured probes. No fonts, icons or scripts from a CDN.
- ESM only, with `.d.ts`. `"type": "module"`. `exports`: `"./res-canary"` → `./dist/res-canary/index.js`, `"./res-canary/element"` → `./dist/res-canary/element.js`, plus `"./package.json"`; no `"."` entry. `"sideEffects": ["./dist/*/element.js"]`.
- Names (collection spec §2): tag `thoro-res-canary`; `defineResCanaryElement(tag?)`; events `res-canary-dismiss` and `res-canary-copy`; theme variables `--thoro-bg`, `--thoro-fg`, `--thoro-border`, `--thoro-accent`, `--thoro-radius`, `--thoro-font`.
- Size budget: core ≤ 2 KB gzip, element (including core) ≤ 4 KB gzip.
- Browser support: current evergreen browsers; Safari 16.4+.
- Defaults: `storageKey` `'thoro-ui:res-canary:dismissed'`; `probeTimeoutMs` `15000` (`0` disables).
- Default strings, verbatim: `title` "Some features couldn't load"; `cause` "This is usually caused by a browser extension or your network settings."; `details` "Details"; `itAsk` "Ask your IT team to allow these addresses:"; `copy` "Copy for IT"; `copied` "Copied"; `dismiss` "Dismiss".
- This is a public repo: examples and tests use `*.example`, `*.invalid` and `127.0.0.1` hosts only — no company, customer or vendor names.
- Formatting: oxfmt with `semi: false`, `singleQuote: true`, `printWidth: 120`, `trailingComma: 'all'`, `arrowParens: 'avoid'`.
- Tooling: Vite+ only — don't add `oxlint`, `oxfmt`, `vitest` or `tsdown` as dependencies or give them their own config files. `pnpm typecheck` (`tsc`) is the type check, because `vp check` does not report `isolatedDeclarations` errors.
- Commands: run root scripts from the repo root (`pnpm test`). To pass arguments — one test file, one browser — run the package script: `pnpm -C packages/thoro-ui test test/unit/res-canary/origins.test.ts`.
- Node 24 (`.node-version`); Vite+ supports `^24.11 || >=26`. pnpm 12.8.1 (`packageManager`).
- **Git: the maintainer makes every commit.** Each task ends with a hand-off step: list the changed files and propose a commit message. Never run `git add` or `git commit`.

## Review Focus

1. **Properties set before the element is defined** (markup-first pages, or a framework rendering before `import 'thoro-ui/res-canary/element'` runs) → the element still picks them up on upgrade. Test: Task 7.
2. **Unbound methods** — `useSyncExternalStore(canary.subscribe, canary.getSnapshot)` passes them without `this` → both still work. Test: Task 4.
3. **An invalid page `lang`** such as `lang="en_US"` (`Intl.ListFormat` throws `RangeError`) → the banner still renders, joining labels in English. Tests: Tasks 6 and 7.
4. **A global RegExp for `ownPolicy`** (`/marker/g`) → every violation is classified the same way; `lastIndex` must not make results alternate. Test: Task 4.
5. **A throwing subscriber or `onChange`** (a broken telemetry call) → the other subscribers are still notified and the error still surfaces. Test: Task 4.

## File Structure

```
AGENTS.md, CLAUDE.md, LICENSE, README.md     repo root; AGENTS.md is rewritten in Task 1
package.json                                 private workspace root: scripts + shared dev tooling
pnpm-workspace.yaml                          packages/*, examples/*
vite.config.ts                               fmt + lint for the whole repo
tsconfig.base.json                           shared compiler options
.gitignore, .node-version, pnpm-lock.yaml
.github/workflows/ci.yml
packages/thoro-ui/                           the only published package
  package.json, vite.config.ts (test + pack), tsconfig.json, playwright.config.ts, .size-limit.json
  README.md, LICENSE                         what npm shows and ships
  src/res-canary/
    index.ts            core entry: createCanary + public types
    element.ts          element entry: defines <thoro-res-canary>; exports defineResCanaryElement, mountBanner, strings
    types.ts            every public type
    origins.ts          CSP host-source parsing and matching
    status.ts           status precedence, blocked list, dismissal signature (pure)
    dismissal.ts        safe storage for the dismissal signature
    probes.ts           startup probes (preload, image, fetch, custom) with timeout
    canary.ts           createCanary: validation, listeners, store, API
    ui/strings.ts       default strings + resolveStrings
    ui/styles.ts        CSS text + lazily constructed shared sheet
    ui/render.ts        builds the element's shadow DOM from items (no state)
    ui/element.ts       the custom element class, defineResCanaryElement, mountBanner
  test/
    unit/res-canary/*.test.ts      Vitest (happy-dom)
    ssr.ts                         imports the built package in plain Node
    browser/server.ts              fixture server shared by all components: app :4173, "vendor" :4174
    browser/globals.d.ts
    browser/stylesheet.spec.ts     the strict-CSP styling check every component relies on
    browser/fixtures/sheet-check.js, res-canary-harness.js
    browser/res-canary/*.spec.ts   Playwright
examples/
  vanilla/    private Vite app: package.json, index.html, main.js
  react/      private, type-checked: package.json, tsconfig.json, app.tsx
```

---

### Task 1: Workspace layout

Moves the finished tooling and the stylesheet check from the repo root into `packages/thoro-ui`, adds the workspace root, rewrites AGENTS.md, and re-runs every check. No component code yet.

**Files:**

- Create: `pnpm-workspace.yaml`, `tsconfig.base.json`, `packages/thoro-ui/package.json`, `packages/thoro-ui/vite.config.ts`, `packages/thoro-ui/tsconfig.json`
- Move: `playwright.config.ts` → `packages/thoro-ui/playwright.config.ts`; `test/` → `packages/thoro-ui/test/`
- Modify: `package.json` (becomes the private root), `vite.config.ts` (comment, ignore globs), `packages/thoro-ui/test/browser/server.ts` (page title, required `script`, drop `/examples/`), `AGENTS.md` (rewrite), `pnpm-lock.yaml` (by `pnpm install`)
- Delete: `tsconfig.json` (replaced by `tsconfig.base.json` + the package's own)
- Test: `packages/thoro-ui/test/browser/stylesheet.spec.ts` (existing, unchanged)

**Interfaces:**

- Consumes: the existing root files listed above.
- Produces: the workspace every later task works in. Package scripts `typecheck` (`tsc -p .`) and `test:browser` (`playwright test`); root scripts `format`, `format:check`, `lint`, `typecheck` (`vp run -r typecheck`), `test:browser` (`vp run -r test:browser`). The fixture server (used by Task 9): `GET /page?csp=<allowed|foreign|own-blocks|strict>&script=<name>` returns an HTML page with that CSP that loads `/fixtures/<name>.js`; `script` is required. `/dist/*` and `/fixtures/*` are static, served from `packages/thoro-ui/`. The vendor origin `http://127.0.0.1:4174` serves `/widget.js`, `/widget.css`, `/pixel.svg` and never answers `/hang`. The own-policy marker is `https://own-marker.invalid`.

- [ ] **Step 1: Move the package's files into place**

Run: `mkdir -p packages/thoro-ui && mv playwright.config.ts test packages/thoro-ui/ && rm tsconfig.json`
Expected: `packages/thoro-ui/playwright.config.ts` and `packages/thoro-ui/test/browser/{server.ts,globals.d.ts,stylesheet.spec.ts,fixtures/sheet-check.js}` exist; no `tsconfig.json`, `playwright.config.ts` or `test/` at the root.

The fixture server finds its files relative to itself (`join(import.meta.dirname, '..', '..')`), so after the move it serves `packages/thoro-ui/dist/` and `packages/thoro-ui/test/browser/fixtures/` without further changes.

- [ ] **Step 2: Create the workspace files**

`pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
  - examples/*
```

`tsconfig.base.json` (the old `tsconfig.json` options, minus `types` and `include`, which each package sets):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "declaration": true,
    "isolatedDeclarations": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true
  }
}
```

Replace the root `package.json` with the private workspace root. Shared tooling stays here; `@playwright/test` moves to the package:

```json
{
  "name": "thoro-ui-workspace",
  "private": true,
  "description": "Workspace for thoro-ui, a collection of compliance-focused web components.",
  "license": "MIT",
  "author": "Haff",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/TheHaff/thoro-ui.git"
  },
  "type": "module",
  "scripts": {
    "format": "vp fmt",
    "format:check": "vp fmt --check",
    "lint": "vp lint",
    "test:browser": "vp run -r test:browser",
    "typecheck": "vp run -r typecheck"
  },
  "devDependencies": {
    "@types/node": "26.6.3",
    "typescript": "7.0.2",
    "vite-plus": "1.0.0"
  },
  "packageManager": "pnpm@12.8.1"
}
```

- [ ] **Step 3: Create the package files**

`packages/thoro-ui/package.json`:

```json
{
  "name": "thoro-ui",
  "version": "0.0.0",
  "description": "Small, dependency-free web components for compliance-minded web apps. First up: tell users when their browser or network blocks the third-party resources your app depends on.",
  "keywords": [
    "ad-blocker",
    "compliance",
    "content-security-policy",
    "csp",
    "custom-element",
    "firewall",
    "web-component",
    "web-components"
  ],
  "license": "MIT",
  "author": "Haff",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/TheHaff/thoro-ui.git",
    "directory": "packages/thoro-ui"
  },
  "type": "module",
  "scripts": {
    "test:browser": "playwright test",
    "typecheck": "tsc -p ."
  },
  "devDependencies": {
    "@playwright/test": "1.63.0"
  }
}
```

`packages/thoro-ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

`packages/thoro-ui/vite.config.ts` — only the unit-test file pattern for now; Task 2 completes the `test` block and Task 8 adds `pack`. Creating it here proves the package can load `vite-plus` from the root install:

```ts
import { defineConfig } from 'vite-plus'

// The package's Vite+ config: `test` and (from Task 8) `pack`. fmt and lint live in the root config.
export default defineConfig({
  test: {
    // Vitest's default pattern would also pick up the Playwright specs in test/browser.
    include: ['test/unit/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Point the root config at the whole workspace**

In the root `vite.config.ts`, replace the comment above `export default` with:

```ts
// Repo-wide fmt (oxfmt) and lint (oxlint). Each package's own vite.config.ts holds its test and pack blocks.
```

and make the lint ignore patterns match at any depth:

```ts
    ignorePatterns: ['**/dist/**', 'node_modules/**', '**/playwright-report/**', '**/test-results/**'],
```

Keep the existing comment above `ignorePatterns` and everything else unchanged.

- [ ] **Step 5: Update the fixture server**

In `packages/thoro-ui/test/browser/server.ts`:

The page title no longer names a component:

```ts
    '<title>thoro-ui test page</title>',
```

`script` becomes required — the server is shared by every component, so it must not default to one component's harness. Replace the `/page` handler's two lookups and the check with:

```ts
const policy = POLICIES[searchParams.get('csp') ?? 'allowed']
const script = searchParams.get('script')
if (!policy || !script || !/^[a-z-]+$/.test(script)) {
  res.writeHead(400).end('bad csp or script')
  return
}
```

The examples now run on the Vite dev server (Task 10), so drop the `/examples/` route:

```ts
if (pathname.startsWith('/dist/')) {
  void sendFile(res, pathname.slice(1))
  return
}
```

- [ ] **Step 6: Rewrite `AGENTS.md`**

Replace the whole file with:

````markdown
# thoro-ui — agent guide

thoro-ui is a collection of small, dependency-free web components for compliance-minded web apps, published as one tree-shakeable npm package with an entry point per component (`thoro-ui/<name>`, `thoro-ui/<name>/element`). The first component is the resource canary, `<thoro-res-canary>`: it detects when a user's browser or network blocks the third-party resources a web app depends on, tells the user what won't work, and gives their IT team the addresses to allow.

## Status

- **Collection spec:** [`docs/specs/2026-10-01-thoro-ui-design.md`](docs/specs/2026-10-01-thoro-ui-design.md) — layout, naming, theming and tooling rules every component follows.
- **Canary spec:** [`docs/specs/2026-09-29-res-canary-design.md`](docs/specs/2026-09-29-res-canary-design.md)
- **Implementation plan:** [`docs/plans/2026-10-01-res-canary.md`](docs/plans/2026-10-01-res-canary.md) — 10 tasks, each with files, code, tests and commands. Do them in order.

If a plan and a spec disagree, the spec wins — flag the conflict to the maintainer instead of silently picking one. Don't reopen the decisions recorded in the specs' decision tables without a new reason.

## Layout

```
package.json, pnpm-workspace.yaml   private workspace root
vite.config.ts                      fmt + lint for the whole repo
tsconfig.base.json                  shared compiler options
packages/thoro-ui/                  the only published package
  vite.config.ts                    test + pack
  src/<name>/                       one folder per component; src/shared/ only once two components need it
  test/unit/<name>/                 Vitest (happy-dom)
  test/browser/                     Playwright: shared fixture server, fixtures/, <name>/*.spec.ts
examples/                           private workspace packages that use thoro-ui
docs/specs, docs/plans
```

## Rules

- **The maintainer makes every commit.** Never run `git add`, `git commit` or `git push`. End each task by listing the changed files and proposing a conventional commit message (`feat|fix|test|build|docs|chore: …`).
- **This repo is public.** Never write the names of companies, customers or vendors from the maintainer's other work into it — not in code, tests, docs or commit messages. Examples and tests use `*.example`, `*.invalid` and `127.0.0.1` hosts only.
- **Zero runtime dependencies.** Dev dependencies are pinned to exact versions. Shared tooling goes in the root (`pnpm add -D -E -w …`); tools only one package uses go in that package (`pnpm -C packages/thoro-ui add -D -E …`). Use pnpm, never npm or yarn.
- **Everything in `packages/thoro-ui/src/` must run under the strictest CSP** (canary spec §8): constructed stylesheets only, DOM built with `createElement`/`createElementNS`/`textContent`, no `innerHTML`, no `eval`/`new Function`/string timers, no network requests other than configured probes.
- **Nothing touches `window`, `document` or `customElements` at import time.**
- **Collection names** (collection spec §2): tags `thoro-<name>`, events `<name>-<action>`, storage keys `thoro-ui:<name>:<what>`, theme variables `--thoro-*`.
- **Each component has its own size budget**, set in its spec and enforced by `pnpm size`. Don't raise one without the maintainer's agreement; trim first. Canary: core ≤ 2 KB, element ≤ 4 KB gzip.
- **Publishing to npm is the maintainer's step.** Never run `npm publish` / `pnpm publish`.

## Commands

Run from the repo root. Available once the plan's Tasks 1, 2 and 8 have added them:

| command             | does                                                    |
| ------------------- | ------------------------------------------------------- |
| `pnpm lint`         | `vp lint` — oxlint, with type-aware rules               |
| `pnpm format`       | `vp fmt` — oxfmt, writes                                |
| `pnpm format:check` | `vp fmt --check` — oxfmt, check only                    |
| `pnpm typecheck`    | `tsc -p .` in every package (`vp run -r typecheck`)     |
| `pnpm test`         | `vp test` — Vitest unit tests (happy-dom)               |
| `pnpm build`        | `vp pack` — tsdown → `packages/thoro-ui/dist/`          |
| `pnpm size`         | size-limit against the budgets (run after `build`)      |
| `pnpm test:ssr`     | imports `dist/` in plain Node (run after `build`)       |
| `pnpm test:browser` | builds, then Playwright in Chromium, Firefox and WebKit |

To pass arguments — one test file, one browser — run the package script directly: `pnpm -C packages/thoro-ui test test/unit/res-canary/origins.test.ts`, `pnpm -C packages/thoro-ui test:browser --project=webkit`.

First-time browser setup: `pnpm -C packages/thoro-ui exec playwright install chromium firefox webkit`.

Tooling is Vite+ (`vite-plus`): the root `vite.config.ts` holds the `fmt` and `lint` blocks, and `packages/thoro-ui/vite.config.ts` holds `test` and `pack`. Don't add `oxlint`, `oxfmt`, `vitest` or `tsdown` as dependencies or give them their own config files. Import test helpers from `vite-plus/test`, not `vitest`. `vp check` runs format and lint in one pass, but it is not the type check: it misses `isolatedDeclarations` errors that `pnpm typecheck` reports.

## Environment notes

Verified on 2026-09-29 in a throwaway check before the first plan was written; the Vite+ switch on 2026-09-30; the workspace layout on 2026-10-01.

- **Node:** 24 locally and in CI (`.node-version`). Vite+ supports `^24.11 || >=26`, so Node 25 is out of range. Node runs `.ts` scripts natively (the Playwright fixture server, the server-import check): value imports need explicit extensions, and only erasable TypeScript syntax works (no `enum`, `namespace` or parameter properties).
- **Workspace:** package scripts find `vp` and `tsc` from the root install, and a package's `vite.config.ts` can import `vite-plus` from it. Vite+ does not cache `package.json` scripts run through `vp run`, so results are never replayed.
- **TypeScript 7.0.2** is the native compiler and has no JS API. `.d.ts` files come from tsdown 0.23.0 through `isolatedDeclarations`. Consequences: every exported function and constant needs an explicit type, and `export default defineConfig(…)` fails under that flag, which is why config files are left out of the tsconfigs.
- **happy-dom 20.14.5:**
  - refuses to load `<script src>` ("JavaScript file loading is disabled") — unit tests use `<img>` for element failures; real script loading is covered by Playwright;
  - never fires `load`/`error` for preload links or images by itself — tests dispatch those events by hand, which keeps them deterministic;
  - supports constructed stylesheets and `adoptedStyleSheets`, upgrading an element whose properties were set before definition, `addEventListener`'s `signal` option, `Intl.ListFormat`, and `navigator.clipboard` (spy on `writeText`);
  - a synthetic `securitypolicyviolation` works as `new Event(…)` plus `Object.assign` for `blockedURI`, `originalPolicy`, `disposition` and `effectiveDirective`.
- **Playwright on strict-CSP pages:** the plan uses only `page.goto`, `page.evaluate` and `expect.poll`, and avoids `page.waitForFunction` as a precaution. If a strict-page test reports a `script-src`/`trusted-types` violation with `blockedURI` `eval`, suspect the test tooling before the package.
- **Playwright Firefox inside an agent sandbox (macOS):** Firefox exits at launch with "Could not find profile folder". It reads `~/Library/Application Support/Firefox` at startup even when given its own profile, and the Claude Code sandbox blocks that folder along with other browser profile folders. Chromium and WebKit are unaffected. Run `pnpm -C packages/thoro-ui test:browser --project=firefox` from a normal terminal, or rely on CI. Don't widen the sandbox to that folder: it holds the user's real browser profile.
- **GitHub Actions** current majors at planning time: `actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`.

## Code style

- oxfmt: no semicolons, single quotes, 120 columns, trailing commas, `arrowParens: 'avoid'`.
- kebab-case file names; relative imports with explicit `.ts` extensions.
- Comments explain why, not what.
- Tests pin behaviour (state changes, derived text, events, error paths), not the mere presence of an element. Vitest globals are on — don't import `describe`, `it`, `expect` or `vi`.
````

- [ ] **Step 7: Install**

Run: `pnpm install`
Expected: exit 0; `pnpm-lock.yaml` now has two importers, `.` (`@types/node`, `typescript`, `vite-plus`) and `packages/thoro-ui` (`@playwright/test`). The one peer warning (Vitest wants `vite ^8`; Vite+ supplies its core package, which bundles vite 8.3.1) is expected.

- [ ] **Step 8: Prove the package resolves the root tooling**

Run: `pnpm -C packages/thoro-ui exec vp test --passWithNoTests`
Expected: exit 0 with "No test files found" — the package's `vite.config.ts` loaded `vite-plus` from the root install, and `vp` resolved from the package.

Run: `pnpm typecheck`
Expected: exit 0; the output shows `tsc -p .` running in `packages/thoro-ui`.

- [ ] **Step 9: Re-run the stylesheet check**

Run: `pnpm -C packages/thoro-ui test:browser --project=chromium --project=webkit`
Expected: `2 passed`.

Firefox can't launch inside an agent sandbox (see AGENTS.md). Ask the maintainer to run this from a normal terminal and report the result:

Run: `pnpm -C packages/thoro-ui test:browser --project=firefox`
Expected: `1 passed`.

**If any engine fails because of the stylesheet** (a `style-src` entry in `violations`, or padding other than `17px`), stop and report the engine and its output to the maintainer. The fallback (a `nonce` property applied to a `<style>` element, canary spec §8) changes the element's design and needs their approval before Task 6.

- [ ] **Step 10: Format, lint, type-check**

Run: `pnpm format && pnpm format:check && pnpm lint && pnpm typecheck`
Expected: all exit 0.

- [ ] **Step 11: Hand off for commit**

Tell the maintainer the changed files and propose: `build: restructure into a pnpm workspace with the thoro-ui package`. Do not run git.

---

### Task 2: Origin matching

**Files:**

- Create: `packages/thoro-ui/src/res-canary/origins.ts`
- Modify: `packages/thoro-ui/vite.config.ts` (`test` block), `packages/thoro-ui/tsconfig.json` (`types`), `packages/thoro-ui/package.json` and root `package.json` (`test` script)
- Test: `packages/thoro-ui/test/unit/res-canary/origins.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `type OriginPattern = { host: string; port: string; scheme: string; wildcard: boolean }`, `parseOriginPattern(origin: string): OriginPattern` (throws `TypeError` whose message contains `invalid origin`), `matchesOrigin(url: string, pattern: OriginPattern): boolean` (never throws).

- [ ] **Step 1: Install happy-dom and finish the test config**

Vitest comes with Vite+; only the DOM environment is installed. It goes in the package, because only the package's tests use it.

Run: `pnpm -C packages/thoro-ui add -D -E happy-dom@20.14.5`

Replace the `test` block in `packages/thoro-ui/vite.config.ts` with:

```ts
  test: {
    environment: 'happy-dom',
    globals: true,
    // Vitest's default pattern would also pick up the Playwright specs in test/browser.
    include: ['test/unit/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
```

In `packages/thoro-ui/tsconfig.json`, change `"types": ["node"]` to `"types": ["node", "vite-plus/test/globals"]`.

Add the scripts: `"test": "vp test"` in `packages/thoro-ui/package.json`, and `"test": "vp run -r test"` in the root `package.json`. (`vp test` runs once and exits; `vp test watch` is the watch mode.)

- [ ] **Step 2: Write the failing test**

`packages/thoro-ui/test/unit/res-canary/origins.test.ts`:

```ts
import { matchesOrigin, parseOriginPattern } from '../../../src/res-canary/origins.ts'

const matches = (url: string, origin: string): boolean => matchesOrigin(url, parseOriginPattern(origin))

describe('parseOriginPattern', () => {
  it('parses scheme, host, wildcard and port, lower-casing the host', () => {
    expect(parseOriginPattern('https://*.Vendor.example')).toEqual({
      host: 'vendor.example',
      port: '443',
      scheme: 'https',
      wildcard: true,
    })
    expect(parseOriginPattern('wss://rtc.vendor.example:8443')).toEqual({
      host: 'rtc.vendor.example',
      port: '8443',
      scheme: 'wss',
      wildcard: false,
    })
  })

  it.each([
    'vendor.example',
    'https://vendor.example/',
    'https://vendor.example/path',
    'ftp://vendor.example',
    'https://*vendor.example',
    'https://',
    '',
  ])('rejects %j', origin => {
    expect(() => parseOriginPattern(origin)).toThrow(/invalid origin/)
  })
})

describe('matchesOrigin', () => {
  it('matches the exact host, ignoring path and query', () => {
    expect(matches('https://widget.vendor.example/loader.js?v=2', 'https://widget.vendor.example')).toBe(true)
  })

  it('requires the same scheme', () => {
    expect(matches('http://widget.vendor.example/a.js', 'https://widget.vendor.example')).toBe(false)
    expect(matches('wss://rtc.vendor.example/socket', 'https://rtc.vendor.example')).toBe(false)
  })

  it('matches any subdomain for a wildcard, but not the bare domain or a look-alike', () => {
    expect(matches('https://a.b.vendor.example/x', 'https://*.vendor.example')).toBe(true)
    expect(matches('https://vendor.example/x', 'https://*.vendor.example')).toBe(false)
    expect(matches('https://evilvendor.example/x', 'https://*.vendor.example')).toBe(false)
  })

  it('implies default ports and requires listed non-default ones', () => {
    expect(matches('https://vendor.example:443/x', 'https://vendor.example')).toBe(true)
    expect(matches('https://vendor.example:8443/x', 'https://vendor.example')).toBe(false)
    expect(matches('http://127.0.0.1:4174/x', 'http://127.0.0.1:4174')).toBe(true)
  })

  it('ignores host case', () => {
    expect(matches('https://Widget.VENDOR.example/x', 'https://widget.vendor.example')).toBe(true)
  })

  it.each(['inline', 'eval', 'wasm-eval', '', 'data:text/plain,hi'])('never matches the non-URL value %j', value => {
    expect(matches(value, 'https://vendor.example')).toBe(false)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm -C packages/thoro-ui test test/unit/res-canary/origins.test.ts`
Expected: FAIL — cannot resolve `../../../src/res-canary/origins.ts`.

- [ ] **Step 4: Implement `packages/thoro-ui/src/res-canary/origins.ts`**

```ts
export type OriginPattern = {
  host: string
  port: string
  scheme: string
  wildcard: boolean
}

const DEFAULT_PORTS: Record<string, string> = { http: '80', https: '443', ws: '80', wss: '443' }
const ORIGIN = /^(https?|wss?):\/\/(\*\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::(\d{1,5}))?$/i

/** Parses CSP host-source syntax: scheme://host[:port], with an optional leading `*.`. No paths. */
export function parseOriginPattern(origin: string): OriginPattern {
  const match = ORIGIN.exec(origin)
  if (!match) {
    throw new TypeError(
      `res-canary: invalid origin "${origin}". Use scheme://host[:port] with no path, e.g. "https://*.vendor.example".`,
    )
  }
  const scheme = match[1].toLowerCase()
  return {
    host: match[3].toLowerCase(),
    port: match[4] ?? DEFAULT_PORTS[scheme],
    scheme,
    wildcard: match[2] !== undefined,
  }
}

/** CSP host-source matching: same scheme, same effective port, exact host or any subdomain for `*.`. */
export function matchesOrigin(url: string, pattern: OriginPattern): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const scheme = parsed.protocol.slice(0, -1)
  if (scheme !== pattern.scheme) return false
  if ((parsed.port || DEFAULT_PORTS[scheme]) !== pattern.port) return false
  const host = parsed.hostname.toLowerCase()
  return pattern.wildcard ? host.endsWith(`.${pattern.host}`) : host === pattern.host
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm -C packages/thoro-ui test test/unit/res-canary/origins.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Lint, format, type-check**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all exit 0.

- [ ] **Step 7: Hand off for commit**

Propose: `feat: parse and match CSP host-source origins`. Do not run git.

---

### Task 3: Public types, status precedence and dismissal storage

**Files:**

- Create: `packages/thoro-ui/src/res-canary/types.ts`, `packages/thoro-ui/src/res-canary/status.ts`, `packages/thoro-ui/src/res-canary/dismissal.ts`
- Test: `packages/thoro-ui/test/unit/res-canary/status.test.ts`, `packages/thoro-ui/test/unit/res-canary/dismissal.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `packages/thoro-ui/src/res-canary/types.ts`: `Status`, `BlockedReason`, `Probe`, `Feature`, `BlockedFeature`, `OwnPolicyViolation`, `Snapshot`, `CanaryStorage`, `CanaryOptions`, `Canary` (exact shapes below).
  - `raiseStatus(current: Status, next: Status): Status`
  - `blockedFeatures(features: readonly Feature[], statuses: Readonly<Record<string, Status>>): BlockedFeature[]`
  - `signatureOf(blocked: readonly BlockedFeature[]): string`
  - `type DismissalStore = { read(): string | null; write(signature: string): void }`
  - `createDismissalStore(option: CanaryStorage | null | undefined, key: string): DismissalStore`

- [ ] **Step 1: Create `packages/thoro-ui/src/res-canary/types.ts`**

```ts
export type Status = 'unknown' | 'ok' | 'load-failed' | 'foreign-csp' | 'own-csp'

export type BlockedReason = 'load-failed' | 'foreign-csp'

export type Probe =
  | { type: 'script' | 'style' | 'image' | 'fetch'; url: string }
  | { type: 'custom'; run: (signal: AbortSignal) => Promise<boolean> }

export type Feature = {
  /** Stable id, used by report() and the dismissal signature. */
  id: string
  /** Short name shown to the user, e.g. "Support chat". */
  label: string
  /** What won't work, e.g. "The support chat bubble won't appear." */
  impact: string
  /** CSP host-source syntax: 'https://widget.vendor.example', 'https://*.vendor.example', 'wss://rtc.vendor.example'. */
  origins: readonly string[]
  probe?: Probe
}

export type BlockedFeature = Feature & { reason: BlockedReason }

export type OwnPolicyViolation = {
  blockedURI: string
  effectiveDirective: string
  featureId: string
  originalPolicy: string
}

export type Snapshot = {
  /** Features whose status is load-failed or foreign-csp, in `features` order. */
  blocked: readonly BlockedFeature[]
  dismissed: boolean
  statuses: Readonly<Record<string, Status>>
}

export type CanaryStorage = Pick<Storage, 'getItem' | 'setItem'>

export type CanaryOptions = {
  features: readonly Feature[]
  /** Recognises your own CSP in a violation's originalPolicy. Required. */
  ownPolicy: string | RegExp | ((policy: string) => boolean)
  onChange?: (snapshot: Snapshot) => void
  onOwnPolicyViolation?: (violation: OwnPolicyViolation) => void
  /** Default: localStorage. null keeps dismissal in memory for this page only. */
  storage?: CanaryStorage | null
  /** Default: 'thoro-ui:res-canary:dismissed'. */
  storageKey?: string
  /** Default: 15000. 0 disables the timeout. */
  probeTimeoutMs?: number
}

export type Canary = {
  dismiss(): void
  getSnapshot(): Snapshot
  report(id: string): void
  start(): void
  stop(): void
  subscribe(listener: () => void): () => void
}
```

- [ ] **Step 2: Write the failing tests**

`packages/thoro-ui/test/unit/res-canary/status.test.ts`:

```ts
import { blockedFeatures, raiseStatus, signatureOf } from '../../../src/res-canary/status.ts'
import type { BlockedFeature, Feature, Status } from '../../../src/res-canary/types.ts'

const feature = (id: string): Feature => ({
  id,
  impact: `${id} won't work.`,
  label: id.toUpperCase(),
  origins: [`https://${id}.example`],
})

describe('raiseStatus', () => {
  const order: Status[] = ['unknown', 'ok', 'load-failed', 'foreign-csp', 'own-csp']

  it('ends at the most specific status whatever order two statuses arrive in', () => {
    for (const a of order) {
      for (const b of order) {
        const expected = order[Math.max(order.indexOf(a), order.indexOf(b))]
        expect(raiseStatus(raiseStatus('unknown', a), b)).toBe(expected)
        expect(raiseStatus(raiseStatus('unknown', b), a)).toBe(expected)
      }
    }
  })
})

describe('blockedFeatures', () => {
  it('lists load-failed and foreign-csp features in config order and never own-csp', () => {
    const features = [feature('a'), feature('b'), feature('c'), feature('d')]
    const blocked = blockedFeatures(features, { a: 'foreign-csp', b: 'own-csp', c: 'ok', d: 'load-failed' })
    expect(blocked.map(item => [item.id, item.reason])).toEqual([
      ['a', 'foreign-csp'],
      ['d', 'load-failed'],
    ])
  })
})

describe('signatureOf', () => {
  it('is the sorted ids, independent of order', () => {
    const a: BlockedFeature = { ...feature('a'), reason: 'load-failed' }
    const b: BlockedFeature = { ...feature('b'), reason: 'foreign-csp' }
    expect(signatureOf([b, a])).toBe('a,b')
    expect(signatureOf([])).toBe('')
  })
})
```

`packages/thoro-ui/test/unit/res-canary/dismissal.test.ts`:

```ts
import { createDismissalStore } from '../../../src/res-canary/dismissal.ts'
import type { CanaryStorage } from '../../../src/res-canary/types.ts'

function mapStorage(): CanaryStorage {
  const data = new Map<string, string>()
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

describe('createDismissalStore', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to localStorage', () => {
    createDismissalStore(undefined, 'k').write('a,b')
    expect(localStorage.getItem('k')).toBe('a,b')
    expect(createDismissalStore(undefined, 'k').read()).toBe('a,b')
  })

  it('persists through a custom storage', () => {
    const storage = mapStorage()
    createDismissalStore(storage, 'k').write('a')
    expect(createDismissalStore(storage, 'k').read()).toBe('a')
  })

  it('keeps the dismissal in memory only when storage is null', () => {
    const store = createDismissalStore(null, 'k')
    expect(store.read()).toBeNull()
    store.write('a')
    expect(store.read()).toBe('a')
    expect(localStorage.getItem('k')).toBeNull()
  })

  it('treats a storage that throws on read as not dismissed', () => {
    const storage: CanaryStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {},
    }
    expect(createDismissalStore(storage, 'k').read()).toBeNull()
  })

  it('still dismisses for this page when storage throws on write', () => {
    const storage: CanaryStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    }
    const store = createDismissalStore(storage, 'k')
    store.write('a')
    expect(store.read()).toBe('a')
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm -C packages/thoro-ui test test/unit/res-canary/status.test.ts test/unit/res-canary/dismissal.test.ts`
Expected: FAIL — cannot resolve `../../../src/res-canary/status.ts` / `../../../src/res-canary/dismissal.ts`.

- [ ] **Step 4: Implement `packages/thoro-ui/src/res-canary/status.ts`**

```ts
import type { BlockedFeature, Feature, Status } from './types.ts'

const RANK: Record<Status, number> = { unknown: 0, ok: 1, 'load-failed': 2, 'foreign-csp': 3, 'own-csp': 4 }

/**
 * Statuses only move up. The error event and the CSP violation for the same request arrive in
 * either order, and the more specific reason has to win regardless.
 */
export function raiseStatus(current: Status, next: Status): Status {
  return RANK[next] > RANK[current] ? next : current
}

export function blockedFeatures(
  features: readonly Feature[],
  statuses: Readonly<Record<string, Status>>,
): BlockedFeature[] {
  const blocked: BlockedFeature[] = []
  for (const feature of features) {
    const status = statuses[feature.id]
    if (status === 'load-failed' || status === 'foreign-csp') blocked.push({ ...feature, reason: status })
  }
  return blocked
}

export function signatureOf(blocked: readonly BlockedFeature[]): string {
  return blocked
    .map(feature => feature.id)
    .sort()
    .join(',')
}
```

- [ ] **Step 5: Implement `packages/thoro-ui/src/res-canary/dismissal.ts`**

```ts
import type { CanaryStorage } from './types.ts'

export type DismissalStore = {
  read(): string | null
  write(signature: string): void
}

function defaultStorage(): CanaryStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    // Sandboxed iframes and some privacy modes throw on access.
    return null
  }
}

/**
 * `option` undefined → localStorage, resolved on first use so creating a canary on a server is safe.
 * `null` → memory only. A dismissal made on this page wins over whatever storage says.
 */
export function createDismissalStore(option: CanaryStorage | null | undefined, key: string): DismissalStore {
  let memory: string | null = null
  const storage = (): CanaryStorage | null => (option === undefined ? defaultStorage() : option)
  return {
    read() {
      if (memory !== null) return memory
      try {
        return storage()?.getItem(key) ?? null
      } catch {
        return null
      }
    },
    write(signature) {
      memory = signature
      try {
        storage()?.setItem(key, signature)
      } catch {
        // Quota or privacy mode: the in-memory copy still hides it for this page.
      }
    },
  }
}
```

- [ ] **Step 6: Run them to verify they pass**

Run: `pnpm test`
Expected: PASS (origins, status, dismissal).

- [ ] **Step 7: Lint, format, type-check**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all exit 0.

- [ ] **Step 8: Hand off for commit**

Propose: `feat: add public types, status precedence and dismissal storage`. Do not run git.

---

### Task 4: `createCanary` — validation, detection and the store

**Files:**

- Create: `packages/thoro-ui/src/res-canary/canary.ts`, `packages/thoro-ui/src/res-canary/index.ts`
- Test: `packages/thoro-ui/test/unit/res-canary/canary.test.ts`

**Interfaces:**

- Consumes: `parseOriginPattern`, `matchesOrigin`, `OriginPattern` (Task 2); `raiseStatus`, `blockedFeatures`, `signatureOf`, `createDismissalStore`, all types (Task 3).
- Produces: `createCanary(options: CanaryOptions): Canary`. Internal helpers Task 5 edits: `function compile(features: readonly Feature[]): Compiled[]` and the `start()` method.

- [ ] **Step 1: Write the failing test**

`packages/thoro-ui/test/unit/res-canary/canary.test.ts`:

```ts
import { createCanary } from '../../../src/res-canary/canary.ts'
import type { Canary, CanaryOptions, CanaryStorage, Feature } from '../../../src/res-canary/types.ts'

const OWN = "default-src 'self'; connect-src https://api.own.example"
const FOREIGN = "script-src-elem 'self'"

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

const started: Canary[] = []

function setup(overrides: Partial<CanaryOptions> = {}): Canary {
  const canary = createCanary({ features: [chat, sign], ownPolicy: 'api.own.example', storage: null, ...overrides })
  canary.start()
  started.push(canary)
  return canary
}

function violate(blockedURI: string, originalPolicy: string, disposition: 'enforce' | 'report' = 'enforce'): void {
  const event = new Event('securitypolicyviolation', { bubbles: true })
  Object.assign(event, { blockedURI, disposition, effectiveDirective: 'script-src-elem', originalPolicy })
  document.dispatchEvent(event)
}

function failImage(url: string): void {
  const image = document.createElement('img')
  image.src = url
  document.body.append(image)
  image.dispatchEvent(new Event('error'))
}

afterEach(() => {
  for (const canary of started.splice(0)) canary.stop()
  document.body.replaceChildren()
})

describe('createCanary', () => {
  it('starts with every feature unknown and nothing blocked', () => {
    expect(setup().getSnapshot()).toEqual({
      blocked: [],
      dismissed: false,
      statuses: { chat: 'unknown', sign: 'unknown' },
    })
  })

  it('marks a feature foreign-csp when another policy blocks it', () => {
    const canary = setup()
    violate('https://widget.chat.example/loader.js', FOREIGN)
    expect(canary.getSnapshot().statuses.chat).toBe('foreign-csp')
    expect(canary.getSnapshot().blocked).toEqual([{ ...chat, reason: 'foreign-csp' }])
  })

  it('marks own-csp, reports it, and keeps it out of the list', () => {
    const onOwnPolicyViolation = vi.fn()
    const canary = setup({ onOwnPolicyViolation })
    violate('https://eu.sign.example/sdk.js', OWN)
    expect(canary.getSnapshot().statuses.sign).toBe('own-csp')
    expect(canary.getSnapshot().blocked).toEqual([])
    expect(onOwnPolicyViolation).toHaveBeenCalledWith({
      blockedURI: 'https://eu.sign.example/sdk.js',
      effectiveDirective: 'script-src-elem',
      featureId: 'sign',
      originalPolicy: OWN,
    })
  })

  it('ignores report-only violations, unmatched URLs and non-URL values', () => {
    const canary = setup()
    violate('https://widget.chat.example/loader.js', FOREIGN, 'report')
    violate('https://unrelated.example/x.js', FOREIGN)
    violate('eval', FOREIGN)
    expect(canary.getSnapshot().statuses).toEqual({ chat: 'unknown', sign: 'unknown' })
  })

  it('marks load-failed when a matching element fails to load', () => {
    const canary = setup()
    failImage('https://eu.sign.example/logo.png')
    failImage('https://unrelated.example/logo.png')
    expect(canary.getSnapshot().statuses).toEqual({ chat: 'unknown', sign: 'load-failed' })
  })

  it('lets the more specific reason win whichever event arrives first', () => {
    const errorFirst = setup()
    failImage('https://widget.chat.example/a.png')
    violate('https://widget.chat.example/a.png', FOREIGN)
    expect(errorFirst.getSnapshot().statuses.chat).toBe('foreign-csp')
    errorFirst.stop()

    const violationFirst = setup()
    violate('https://widget.chat.example/b.png', FOREIGN)
    failImage('https://widget.chat.example/b.png')
    expect(violationFirst.getSnapshot().statuses.chat).toBe('foreign-csp')
  })

  it('updates every feature that shares an origin', () => {
    const shared: Feature = { ...sign, origins: ['https://widget.chat.example'] }
    const canary = setup({ features: [chat, shared] })
    failImage('https://widget.chat.example/a.png')
    expect(canary.getSnapshot().blocked.map(item => item.id)).toEqual(['chat', 'sign'])
  })

  it.each<[string, CanaryOptions['ownPolicy']]>([
    ['string', 'api.own.example'],
    ['RegExp', /api\.own\.example/],
    ['global RegExp', /api\.own\.example/g],
    ['function', policy => policy.startsWith("default-src 'self'")],
  ])('recognises its own policy given as a %s, every time', (_kind, ownPolicy) => {
    const onOwnPolicyViolation = vi.fn()
    const canary = setup({ onOwnPolicyViolation, ownPolicy })
    violate('https://widget.chat.example/a.js', OWN)
    violate('https://eu.sign.example/b.js', OWN)
    expect(canary.getSnapshot().statuses).toEqual({ chat: 'own-csp', sign: 'own-csp' })
    expect(onOwnPolicyViolation).toHaveBeenCalledTimes(2)
  })

  it('report() marks a feature load-failed and warns about unknown ids', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const canary = setup()
    canary.report('sign')
    canary.report('nope')
    canary.report('toString')
    expect(canary.getSnapshot().statuses).toEqual({ chat: 'unknown', sign: 'load-failed' })
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('dismiss() hides the list until another feature is blocked', () => {
    const canary = setup()
    canary.dismiss()
    expect(canary.getSnapshot().dismissed).toBe(false)
    failImage('https://widget.chat.example/a.png')
    canary.dismiss()
    expect(canary.getSnapshot().dismissed).toBe(true)
    failImage('https://eu.sign.example/b.png')
    expect(canary.getSnapshot().dismissed).toBe(false)
    expect(canary.getSnapshot().blocked.map(item => item.id)).toEqual(['chat', 'sign'])
  })

  it('remembers a dismissal on the next page load through storage', () => {
    const data = new Map<string, string>()
    const storage: CanaryStorage = {
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value)
      },
    }
    const first = setup({ storage })
    failImage('https://widget.chat.example/a.png')
    first.dismiss()
    first.stop()
    expect(data.get('thoro-ui:res-canary:dismissed')).toBe('chat')

    const second = setup({ storage })
    failImage('https://widget.chat.example/a.png')
    expect(second.getSnapshot().dismissed).toBe(true)
  })

  it('stops listening after stop()', () => {
    const canary = setup()
    canary.stop()
    failImage('https://widget.chat.example/a.png')
    violate('https://widget.chat.example/a.js', FOREIGN)
    expect(canary.getSnapshot().statuses.chat).toBe('unknown')
  })

  it('notifies once per change and keeps the snapshot reference otherwise', () => {
    const onChange = vi.fn()
    const canary = setup({ onChange })
    const listener = vi.fn()
    canary.subscribe(listener)
    const before = canary.getSnapshot()
    failImage('https://widget.chat.example/a.png')
    failImage('https://widget.chat.example/b.png')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(canary.getSnapshot())
    expect(canary.getSnapshot()).not.toBe(before)
    const after = canary.getSnapshot()
    expect(canary.getSnapshot()).toBe(after)
  })

  it('stops notifying a listener after it unsubscribes', () => {
    const canary = setup()
    const listener = vi.fn()
    const unsubscribe = canary.subscribe(listener)
    unsubscribe()
    canary.report('chat')
    expect(listener).not.toHaveBeenCalled()
  })

  it('works with destructured subscribe and getSnapshot, as useSyncExternalStore passes them', () => {
    const { getSnapshot, subscribe } = setup()
    const listener = vi.fn()
    subscribe(listener)
    failImage('https://widget.chat.example/a.png')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getSnapshot().blocked.map(item => item.id)).toEqual(['chat'])
  })

  it('keeps notifying other subscribers when one throws, and still surfaces the error', () => {
    const deferred: Array<() => void> = []
    vi.stubGlobal('queueMicrotask', (callback: () => void) => {
      deferred.push(callback)
    })
    const canary = setup({
      onChange: () => {
        throw new Error('telemetry down')
      },
    })
    const listener = vi.fn()
    canary.subscribe(listener)
    failImage('https://widget.chat.example/a.png')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(deferred).toHaveLength(1)
    expect(deferred[0]).toThrow('telemetry down')
  })

  const invalid: Array<[string, Partial<CanaryOptions>, RegExp]> = [
    ['duplicate ids', { features: [chat, chat] }, /duplicate feature id "chat"/],
    ['no origins', { features: [{ ...chat, origins: [] }] }, /has no origins/],
    ['a malformed origin', { features: [{ ...chat, origins: ['widget.chat.example'] }] }, /invalid origin/],
    ['an empty ownPolicy', { ownPolicy: ' ' }, /must not be an empty string/],
    ['a missing ownPolicy', { ownPolicy: undefined as unknown as string }, /ownPolicy is required/],
  ]

  it.each(invalid)('throws on %s', (_name, overrides, message) => {
    expect(() => createCanary({ features: [chat], ownPolicy: 'api.own.example', ...overrides })).toThrow(message)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -C packages/thoro-ui test test/unit/res-canary/canary.test.ts`
Expected: FAIL — cannot resolve `../../../src/res-canary/canary.ts`.

- [ ] **Step 3: Implement `packages/thoro-ui/src/res-canary/canary.ts`**

```ts
import { createDismissalStore } from './dismissal.ts'
import { matchesOrigin, parseOriginPattern, type OriginPattern } from './origins.ts'
import { blockedFeatures, raiseStatus, signatureOf } from './status.ts'
import type { Canary, CanaryOptions, Feature, Snapshot, Status } from './types.ts'

type Compiled = { feature: Feature; patterns: OriginPattern[] }

export function createCanary(options: CanaryOptions): Canary {
  const compiled = compile(options.features)
  const isOwnPolicy = toPolicyMatcher(options.ownPolicy)
  const dismissal = createDismissalStore(options.storage, options.storageKey ?? 'thoro-ui:res-canary:dismissed')
  const listeners = new Set<() => void>()
  let statuses: Readonly<Record<string, Status>> = Object.fromEntries(
    compiled.map(({ feature }): [string, Status] => [feature.id, 'unknown']),
  )
  let snapshot = buildSnapshot()
  let controller: AbortController | null = null

  function buildSnapshot(): Snapshot {
    const blocked = blockedFeatures(options.features, statuses)
    const dismissed = blocked.length > 0 && dismissal.read() === signatureOf(blocked)
    return { blocked, dismissed, statuses }
  }

  function publish(): void {
    snapshot = buildSnapshot()
    const callbacks = [() => options.onChange?.(snapshot), ...listeners]
    for (const callback of callbacks) {
      try {
        callback()
      } catch (error) {
        // A throwing subscriber must not starve the others. Rethrow later so it still reaches error tracking.
        queueMicrotask(() => {
          throw error
        })
      }
    }
  }

  function setStatus(id: string, next: Status): void {
    if (!Object.hasOwn(statuses, id)) return
    const current = statuses[id]
    const raised = raiseStatus(current, next)
    if (raised === current) return
    statuses = { ...statuses, [id]: raised }
    publish()
  }

  function matching(url: string): Compiled[] {
    return compiled.filter(({ patterns }) => patterns.some(pattern => matchesOrigin(url, pattern)))
  }

  function onViolation(event: SecurityPolicyViolationEvent): void {
    // Report-only policies block nothing.
    if (event.disposition === 'report') return
    const policy = event.originalPolicy ?? ''
    const own = isOwnPolicy(policy)
    for (const { feature } of matching(event.blockedURI)) {
      setStatus(feature.id, own ? 'own-csp' : 'foreign-csp')
      if (own) {
        options.onOwnPolicyViolation?.({
          blockedURI: event.blockedURI,
          effectiveDirective: event.effectiveDirective,
          featureId: feature.id,
          originalPolicy: policy,
        })
      }
    }
  }

  function onResourceError(event: Event): void {
    if (!(event.target instanceof Element)) return
    for (const { feature } of matching(resourceUrl(event.target))) setStatus(feature.id, 'load-failed')
  }

  return {
    start() {
      if (controller || typeof document === 'undefined') return
      controller = new AbortController()
      const { signal } = controller
      document.addEventListener('securitypolicyviolation', onViolation, { signal })
      // Resource errors don't bubble, but they pass through window in the capture phase.
      window.addEventListener('error', onResourceError, { capture: true, signal })
    },
    stop() {
      controller?.abort()
      controller = null
    },
    report(id) {
      if (!Object.hasOwn(statuses, id)) {
        console.warn(`res-canary: report() was called with unknown feature id "${id}"`)
        return
      }
      setStatus(id, 'load-failed')
    },
    dismiss() {
      if (snapshot.blocked.length === 0 || snapshot.dismissed) return
      dismissal.write(signatureOf(snapshot.blocked))
      publish()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return snapshot
    },
  }
}

function compile(features: readonly Feature[]): Compiled[] {
  const ids = new Set<string>()
  return features.map(feature => {
    if (ids.has(feature.id)) throw new TypeError(`res-canary: duplicate feature id "${feature.id}"`)
    ids.add(feature.id)
    if (feature.origins.length === 0) throw new TypeError(`res-canary: feature "${feature.id}" has no origins`)
    return { feature, patterns: feature.origins.map(origin => parseOriginPattern(origin)) }
  })
}

function toPolicyMatcher(ownPolicy: CanaryOptions['ownPolicy']): (policy: string) => boolean {
  if (typeof ownPolicy === 'string') {
    // An empty string is contained in every policy, which would silently classify every block as ours.
    if (ownPolicy.trim() === '') throw new TypeError('res-canary: ownPolicy must not be an empty string')
    return policy => policy.includes(ownPolicy)
  }
  if (ownPolicy instanceof RegExp) {
    return policy => {
      // A global or sticky RegExp keeps state in lastIndex between test() calls.
      ownPolicy.lastIndex = 0
      return ownPolicy.test(policy)
    }
  }
  if (typeof ownPolicy === 'function') return ownPolicy
  throw new TypeError('res-canary: ownPolicy is required (a string, RegExp or function that recognises your own CSP)')
}

function resourceUrl(element: Element): string {
  if (element instanceof HTMLLinkElement) return element.href
  if (element instanceof HTMLImageElement || element instanceof HTMLMediaElement) {
    return element.currentSrc || element.src
  }
  if (element instanceof HTMLScriptElement || element instanceof HTMLSourceElement) return element.src
  return ''
}
```

- [ ] **Step 4: Create `packages/thoro-ui/src/res-canary/index.ts`**

```ts
export { createCanary } from './canary.ts'
export type {
  BlockedFeature,
  BlockedReason,
  Canary,
  CanaryOptions,
  CanaryStorage,
  Feature,
  OwnPolicyViolation,
  Probe,
  Snapshot,
  Status,
} from './types.ts'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS (all files).

- [ ] **Step 6: Lint, format, type-check**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all exit 0.

- [ ] **Step 7: Hand off for commit**

Propose: `feat: detect CSP violations and failed resource loads`. Do not run git.

---

### Task 5: Startup probes

**Files:**

- Create: `packages/thoro-ui/src/res-canary/probes.ts`
- Modify: `packages/thoro-ui/src/res-canary/canary.ts` (the `compile` function and the `start()` method)
- Test: `packages/thoro-ui/test/unit/res-canary/probes.test.ts`; add a `describe('probes')` block to `packages/thoro-ui/test/unit/res-canary/canary.test.ts`

**Interfaces:**

- Consumes: `Probe` (Task 3); `matchesOrigin` (Task 2); `compile`, `start()`, `setStatus` (Task 4).
- Produces: `runProbe(probe: Probe, timeoutMs: number, signal: AbortSignal): Promise<boolean>` — resolves `true` when reachable, `false` otherwise; never rejects.

- [ ] **Step 1: Write the failing probe tests**

`packages/thoro-ui/test/unit/res-canary/probes.test.ts`:

```ts
import { runProbe } from '../../../src/res-canary/probes.ts'

const signal = new AbortController().signal

function preloadLink(): HTMLLinkElement {
  const link = document.head.querySelector<HTMLLinkElement>('link[rel="preload"]')
  if (!link) throw new Error('no preload link in <head>')
  return link
}

afterEach(() => {
  vi.useRealTimers()
  document.head.replaceChildren()
})

describe('runProbe', () => {
  it.each(['script', 'style'] as const)('preloads a %s without running it, then removes the link', async type => {
    const result = runProbe({ type, url: 'https://cdn.example/asset' }, 0, signal)
    const link = preloadLink()
    expect(link.as).toBe(type)
    expect(link.href).toBe('https://cdn.example/asset')
    link.dispatchEvent(new Event('load'))
    await expect(result).resolves.toBe(true)
    expect(document.head.querySelector('link')).toBeNull()
  })

  it('reports a failed preload', async () => {
    const result = runProbe({ type: 'script', url: 'https://cdn.example/a.js' }, 0, signal)
    preloadLink().dispatchEvent(new Event('error'))
    await expect(result).resolves.toBe(false)
  })

  it('loads a detached image', async () => {
    const images: HTMLImageElement[] = []
    vi.stubGlobal('Image', function FakeImage() {
      const image = document.createElement('img')
      images.push(image)
      return image
    })
    const ok = runProbe({ type: 'image', url: 'https://cdn.example/p.png' }, 0, signal)
    images[0].dispatchEvent(new Event('load'))
    await expect(ok).resolves.toBe(true)
    expect(images[0].src).toBe('https://cdn.example/p.png')
    expect(images[0].isConnected).toBe(false)

    const failed = runProbe({ type: 'image', url: 'https://cdn.example/p.png' }, 0, signal)
    images[1].dispatchEvent(new Event('error'))
    await expect(failed).resolves.toBe(false)
  })

  it('treats a resolved no-cors fetch as reachable and a rejected one as blocked', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetch)
    await expect(runProbe({ type: 'fetch', url: 'https://api.example/ping' }, 0, signal)).resolves.toBe(true)
    await expect(runProbe({ type: 'fetch', url: 'https://api.example/ping' }, 0, signal)).resolves.toBe(false)
    expect(fetch).toHaveBeenCalledWith('https://api.example/ping', { mode: 'no-cors', signal })
  })

  const customs: Array<[string, (signal: AbortSignal) => Promise<boolean>, boolean]> = [
    ['true', async () => true, true],
    ['false', async () => false, false],
    ['a non-boolean', async () => 'yes' as unknown as boolean, false],
    [
      'a rejection',
      async () => {
        throw new Error('nope')
      },
      false,
    ],
    [
      'a synchronous throw',
      () => {
        throw new Error('sync')
      },
      false,
    ],
  ]

  it.each(customs)('maps a custom probe returning %s', async (_name, run, expected) => {
    await expect(runProbe({ run, type: 'custom' }, 0, signal)).resolves.toBe(expected)
  })

  it('fails a probe that does not settle within the timeout, and ignores a late answer', async () => {
    vi.useFakeTimers()
    const settled = vi.fn()
    void runProbe({ type: 'script', url: 'https://cdn.example/hang.js' }, 500, signal).then(settled)
    await vi.advanceTimersByTimeAsync(499)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toHaveBeenCalledWith(false)
    preloadLink().dispatchEvent(new Event('load'))
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Add the integration tests to `packages/thoro-ui/test/unit/res-canary/canary.test.ts`**

Append at the end of the file:

```ts
describe('probes', () => {
  const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

  it('marks a feature ok or load-failed from its probe', async () => {
    const canary = setup({
      features: [
        { ...chat, probe: { run: async () => true, type: 'custom' } },
        { ...sign, probe: { run: async () => false, type: 'custom' } },
      ],
    })
    await vi.waitFor(() => expect(canary.getSnapshot().statuses).toEqual({ chat: 'ok', sign: 'load-failed' }))
  })

  it('does not downgrade a failure when the probe succeeds afterwards', async () => {
    let finish: (ok: boolean) => void = () => {}
    const run = vi.fn(
      () =>
        new Promise<boolean>(resolve => {
          finish = resolve
        }),
    )
    const canary = setup({ features: [{ ...chat, probe: { run, type: 'custom' } }] })
    await vi.waitFor(() => expect(run).toHaveBeenCalled())
    failImage('https://widget.chat.example/a.png')
    finish(true)
    await tick()
    expect(canary.getSnapshot().statuses.chat).toBe('load-failed')
  })

  it('aborts the probe signal on stop() and ignores results that arrive afterwards', async () => {
    let finish: (ok: boolean) => void = () => {}
    const run = vi.fn(
      (_signal: AbortSignal) =>
        new Promise<boolean>(resolve => {
          finish = resolve
        }),
    )
    const canary = setup({ features: [{ ...chat, probe: { run, type: 'custom' } }] })
    await vi.waitFor(() => expect(run).toHaveBeenCalled())
    canary.stop()
    expect(run.mock.calls[0][0].aborted).toBe(true)
    finish(false)
    await tick()
    expect(canary.getSnapshot().statuses.chat).toBe('unknown')
  })

  it('rejects a probe URL outside the feature origins', () => {
    expect(() =>
      createCanary({
        features: [{ ...chat, probe: { type: 'script', url: 'https://other.example/a.js' } }],
        ownPolicy: 'api.own.example',
        storage: null,
      }),
    ).toThrow(/outside its origins/)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm -C packages/thoro-ui test test/unit/res-canary/probes.test.ts test/unit/res-canary/canary.test.ts`
Expected: FAIL — `probes.test.ts` cannot resolve `../../../src/res-canary/probes.ts`; in `canary.test.ts` the `probes` block fails (statuses stay `unknown`; no validation error thrown).

- [ ] **Step 4: Implement `packages/thoro-ui/src/res-canary/probes.ts`**

```ts
import type { Probe } from './types.ts'

/** Resolves true when the probe's resource is reachable, false otherwise. Never rejects. */
export function runProbe(probe: Probe, timeoutMs: number, signal: AbortSignal): Promise<boolean> {
  const attempt = attemptProbe(probe, signal)
  if (timeoutMs <= 0) return attempt
  return new Promise(resolve => {
    // A firewall that drops packets never answers; treat silence as blocked.
    const timer = setTimeout(() => resolve(false), timeoutMs)
    void attempt.then(ok => {
      clearTimeout(timer)
      resolve(ok)
    })
  })
}

function attemptProbe(probe: Probe, signal: AbortSignal): Promise<boolean> {
  switch (probe.type) {
    case 'script':
      return preload(probe.url, 'script')
    case 'style':
      return preload(probe.url, 'style')
    case 'image':
      return loadImage(probe.url)
    case 'fetch':
      return fetch(probe.url, { mode: 'no-cors', signal }).then(
        () => true,
        () => false,
      )
    case 'custom': {
      const { run } = probe
      return Promise.resolve()
        .then(() => run(signal))
        .then(
          ok => ok === true,
          () => false,
        )
    }
  }
}

// A preload fetches with the same request type ad blockers filter on, but never runs the script.
function preload(url: string, as: 'script' | 'style'): Promise<boolean> {
  return new Promise(resolve => {
    const link = document.createElement('link')
    const settle = (ok: boolean): void => {
      link.remove()
      resolve(ok)
    }
    link.rel = 'preload'
    link.as = as
    link.href = url
    link.addEventListener('load', () => settle(true), { once: true })
    link.addEventListener('error', () => settle(false), { once: true })
    document.head.append(link)
  })
}

function loadImage(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const image = new Image()
    image.addEventListener('load', () => resolve(true), { once: true })
    image.addEventListener('error', () => resolve(false), { once: true })
    image.src = url
  })
}
```

- [ ] **Step 5: Wire probes into `packages/thoro-ui/src/res-canary/canary.ts`**

Add the import next to the others:

```ts
import { runProbe } from './probes.ts'
```

Replace the whole `start()` method with:

```ts
    start() {
      if (controller || typeof document === 'undefined') return
      controller = new AbortController()
      const { signal } = controller
      document.addEventListener('securitypolicyviolation', onViolation, { signal })
      // Resource errors don't bubble, but they pass through window in the capture phase.
      window.addEventListener('error', onResourceError, { capture: true, signal })
      const timeoutMs = options.probeTimeoutMs ?? 15_000
      for (const { feature } of compiled) {
        if (!feature.probe) continue
        void runProbe(feature.probe, timeoutMs, signal).then(ok => {
          if (!signal.aborted) setStatus(feature.id, ok ? 'ok' : 'load-failed')
        })
      }
    },
```

Replace the whole `compile` function with:

```ts
function compile(features: readonly Feature[]): Compiled[] {
  const ids = new Set<string>()
  return features.map(feature => {
    if (ids.has(feature.id)) throw new TypeError(`res-canary: duplicate feature id "${feature.id}"`)
    ids.add(feature.id)
    if (feature.origins.length === 0) throw new TypeError(`res-canary: feature "${feature.id}" has no origins`)
    const patterns = feature.origins.map(origin => parseOriginPattern(origin))
    const { probe } = feature
    if (probe && probe.type !== 'custom' && !patterns.some(pattern => matchesOrigin(probe.url, pattern))) {
      throw new TypeError(
        `res-canary: feature "${feature.id}" probes ${probe.url}, which is outside its origins, so the IT list would miss it`,
      )
    }
    return { feature, patterns }
  })
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS (all files).

- [ ] **Step 7: Lint, format, type-check**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all exit 0.

- [ ] **Step 8: Hand off for commit**

Propose: `feat: run startup probes with a timeout`. Do not run git.

---

### Task 6: Element strings, styles and rendering

**Files:**

- Create: `packages/thoro-ui/src/res-canary/ui/strings.ts`, `packages/thoro-ui/src/res-canary/ui/styles.ts`, `packages/thoro-ui/src/res-canary/ui/render.ts`
- Test: `packages/thoro-ui/test/unit/res-canary/render.test.ts`, `packages/thoro-ui/test/unit/res-canary/strings.test.ts`

**Interfaces:**

- Consumes: `BlockedFeature` (Task 3).
- Produces:
  - `type CanaryStrings = { cause; copied; copy; details; dismiss; itAsk; title }` (all `string`), `DEFAULT_STRINGS: Readonly<CanaryStrings>`, `resolveStrings(overrides: Partial<CanaryStrings> | null | undefined): CanaryStrings`
  - `canarySheet(): CSSStyleSheet` — one shared sheet, created on first call
  - `type RenderedCanary = { announce: HTMLElement; copy: HTMLButtonElement; details: HTMLDetailsElement; dismiss: HTMLButtonElement; origins: HTMLPreElement; root: HTMLElement }`
  - `renderCanary(items: readonly BlockedFeature[], strings: Readonly<CanaryStrings>, locale: string): RenderedCanary`
  - `originsText(items: readonly BlockedFeature[]): string`, `summaryText(items, strings, locale): string`

- [ ] **Step 1: Write the failing tests**

`packages/thoro-ui/test/unit/res-canary/strings.test.ts`:

```ts
import { DEFAULT_STRINGS, resolveStrings } from '../../../src/res-canary/ui/strings.ts'

describe('resolveStrings', () => {
  it('overlays the given strings on the defaults', () => {
    expect(resolveStrings({ copy: 'Kopieren' })).toEqual({ ...DEFAULT_STRINGS, copy: 'Kopieren' })
  })

  it('ignores non-string values and unknown keys', () => {
    const overrides = { extra: 'x', title: undefined, dismiss: 42 } as unknown as Record<string, string>
    expect(resolveStrings(overrides)).toEqual(DEFAULT_STRINGS)
    expect(resolveStrings(null)).toEqual(DEFAULT_STRINGS)
  })
})
```

`packages/thoro-ui/test/unit/res-canary/render.test.ts`:

```ts
import type { BlockedFeature } from '../../../src/res-canary/types.ts'
import { originsText, renderCanary, summaryText } from '../../../src/res-canary/ui/render.ts'
import { DEFAULT_STRINGS } from '../../../src/res-canary/ui/strings.ts'

const chat: BlockedFeature = {
  id: 'chat',
  impact: "The chat bubble won't appear.",
  label: 'Support chat',
  origins: ['https://widget.chat.example', 'https://api.chat.example'],
  reason: 'foreign-csp',
}
const sign: BlockedFeature = {
  id: 'sign',
  impact: "You can't sign agreements.",
  label: 'E-signature',
  origins: ['https://*.sign.example', 'https://api.chat.example'],
  reason: 'load-failed',
}

describe('summaryText', () => {
  it('joins labels for the locale', () => {
    expect(summaryText([chat], DEFAULT_STRINGS, 'en')).toBe("Some features couldn't load: Support chat.")
    expect(summaryText([chat, sign], DEFAULT_STRINGS, 'en')).toBe(
      "Some features couldn't load: Support chat and E-signature.",
    )
    expect(summaryText([chat, sign], { ...DEFAULT_STRINGS, title: 'Nicht geladen' }, 'de')).toBe(
      'Nicht geladen: Support chat und E-signature.',
    )
  })

  it('falls back to English for an invalid locale', () => {
    expect(summaryText([chat, sign], DEFAULT_STRINGS, 'en_US')).toBe(
      "Some features couldn't load: Support chat and E-signature.",
    )
  })
})

describe('originsText', () => {
  it('lists each origin once, sorted, one per line', () => {
    expect(originsText([chat, sign])).toBe(
      'https://*.sign.example\nhttps://api.chat.example\nhttps://widget.chat.example',
    )
  })
})

describe('renderCanary', () => {
  it('labels the region and exposes the summary as a status', () => {
    const { root } = renderCanary([chat, sign], DEFAULT_STRINGS, 'en')
    expect(root.getAttribute('role')).toBe('region')
    expect(root.getAttribute('aria-label')).toBe(DEFAULT_STRINGS.title)
    expect(root.querySelector('[role="status"]')?.textContent).toBe(
      "Some features couldn't load: Support chat and E-signature. This is usually caused by a browser extension or your network settings.",
    )
  })

  it('puts each feature and its impact, and the origin list, inside a closed details element', () => {
    const { details, origins } = renderCanary([chat, sign], DEFAULT_STRINGS, 'en')
    expect(details.open).toBe(false)
    expect([...details.querySelectorAll('li')].map(item => item.textContent)).toEqual([
      "Support chat — The chat bubble won't appear.",
      "E-signature — You can't sign agreements.",
    ])
    expect(origins.textContent).toBe(originsText([chat, sign]))
  })

  it('renders plain buttons with the configured text and accessible name', () => {
    const { copy, dismiss } = renderCanary([chat], { ...DEFAULT_STRINGS, copy: 'Kopieren', dismiss: 'Schließen' }, 'de')
    expect(copy.type).toBe('button')
    expect(copy.textContent).toBe('Kopieren')
    expect(dismiss.type).toBe('button')
    expect(dismiss.getAttribute('aria-label')).toBe('Schließen')
  })

  it('exposes the documented parts in document order', () => {
    const { root } = renderCanary([chat], DEFAULT_STRINGS, 'en')
    const parts = [...root.querySelectorAll('[part]')].map(node => node.getAttribute('part'))
    expect([root.getAttribute('part'), ...parts]).toEqual([
      'root',
      'summary',
      'title',
      'details',
      'list',
      'origins',
      'copy',
      'dismiss',
    ])
  })

  it('treats labels as text, never markup', () => {
    const { root } = renderCanary([{ ...chat, label: '<img src=x onerror=alert(1)>' }], DEFAULT_STRINGS, 'en')
    expect(root.querySelector('img')).toBeNull()
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm -C packages/thoro-ui test test/unit/res-canary/strings.test.ts test/unit/res-canary/render.test.ts`
Expected: FAIL — cannot resolve `../../../src/res-canary/ui/strings.ts` / `../../../src/res-canary/ui/render.ts`.

- [ ] **Step 3: Implement `packages/thoro-ui/src/res-canary/ui/strings.ts`**

```ts
export type CanaryStrings = {
  cause: string
  copied: string
  copy: string
  details: string
  dismiss: string
  itAsk: string
  title: string
}

export const DEFAULT_STRINGS: Readonly<CanaryStrings> = {
  title: "Some features couldn't load",
  cause: 'This is usually caused by a browser extension or your network settings.',
  details: 'Details',
  itAsk: 'Ask your IT team to allow these addresses:',
  copy: 'Copy for IT',
  copied: 'Copied',
  dismiss: 'Dismiss',
}

/** The defaults overlaid with the caller's strings. Anything that is not a string is ignored. */
export function resolveStrings(overrides: Partial<CanaryStrings> | null | undefined): CanaryStrings {
  const strings: CanaryStrings = { ...DEFAULT_STRINGS }
  for (const key of Object.keys(strings) as Array<keyof CanaryStrings>) {
    const value = overrides?.[key]
    if (typeof value === 'string') strings[key] = value
  }
  return strings
}
```

- [ ] **Step 4: Implement `packages/thoro-ui/src/res-canary/ui/styles.ts`**

```ts
const CSS = `
:host {
  --_bg: var(--thoro-bg, #fffbeb);
  --_fg: var(--thoro-fg, #422006);
  --_border: var(--thoro-border, #f59e0b);
  --_accent: var(--thoro-accent, #b45309);
  display: block;
  font-family: var(--thoro-font, system-ui, sans-serif);
  font-size: 14px;
  line-height: 1.45;
}
:host([hidden]) {
  display: none;
}
@media (prefers-color-scheme: dark) {
  :host {
    --_bg: var(--thoro-bg, #2b1d0e);
    --_fg: var(--thoro-fg, #fdecc8);
    --_border: var(--thoro-border, #b45309);
    --_accent: var(--thoro-accent, #f59e0b);
  }
}
.root {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 12px 16px;
  color: var(--_fg);
  background: var(--_bg);
  border: 1px solid var(--_border);
  border-radius: var(--thoro-radius, 8px);
}
:host([variant='banner']) .root {
  border-width: 0 0 1px;
  border-radius: 0;
}
.icon {
  width: 20px;
  height: 20px;
  color: var(--_accent);
}
.body {
  min-width: 0;
}
p {
  margin: 0;
}
.title {
  font-weight: 600;
}
details {
  margin-top: 6px;
}
summary {
  width: fit-content;
  cursor: pointer;
}
ul {
  margin: 8px 0;
  padding-left: 20px;
}
pre {
  margin: 6px 0 8px;
  padding: 8px;
  overflow-x: auto;
  font-size: 13px;
  background: color-mix(in srgb, var(--_fg) 6%, transparent);
  border-radius: 4px;
}
button {
  font: inherit;
  color: inherit;
  cursor: pointer;
  background: transparent;
}
.copy {
  padding: 4px 10px;
  border: 1px solid var(--_border);
  border-radius: 6px;
}
.dismiss {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 18px;
  line-height: 1;
  border: 0;
  border-radius: 6px;
}
button:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--_accent);
  outline-offset: 2px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
`

let sheet: CSSStyleSheet | undefined

/** One constructed sheet shared by every instance; created on first use, never at import. */
export function canarySheet(): CSSStyleSheet {
  if (!sheet) {
    sheet = new CSSStyleSheet()
    sheet.replaceSync(CSS)
  }
  return sheet
}
```

- [ ] **Step 5: Implement `packages/thoro-ui/src/res-canary/ui/render.ts`**

```ts
import type { BlockedFeature } from '../types.ts'
import type { CanaryStrings } from './strings.ts'

export type RenderedCanary = {
  announce: HTMLElement
  copy: HTMLButtonElement
  details: HTMLDetailsElement
  dismiss: HTMLButtonElement
  origins: HTMLPreElement
  root: HTMLElement
}

const SVG_NS = 'http://www.w3.org/2000/svg'

export function originsText(items: readonly BlockedFeature[]): string {
  return [...new Set(items.flatMap(item => item.origins))].sort().join('\n')
}

export function summaryText(
  items: readonly BlockedFeature[],
  strings: Readonly<CanaryStrings>,
  locale: string,
): string {
  return `${strings.title}: ${listFormat(locale).format(items.map(item => item.label))}.`
}

/**
 * Builds the shadow DOM with createElement and text nodes only, so it works on pages that
 * enforce Trusted Types. Event handlers are attached by the element, not here.
 */
export function renderCanary(
  items: readonly BlockedFeature[],
  strings: Readonly<CanaryStrings>,
  locale: string,
): RenderedCanary {
  const announce = h('span', { class: 'visually-hidden' })
  const summary = h(
    'p',
    { class: 'summary', part: 'summary', role: 'status' },
    h('span', { class: 'title', part: 'title' }, summaryText(items, strings, locale)),
    ' ',
    strings.cause,
    announce,
  )
  const origins = h('pre', { part: 'origins' }, originsText(items))
  const copy = h('button', { class: 'copy', part: 'copy', type: 'button' }, strings.copy)
  const details = h(
    'details',
    { part: 'details' },
    h('summary', {}, strings.details),
    h('ul', { part: 'list' }, ...items.map(item => h('li', {}, `${item.label} — ${item.impact}`))),
    h('p', {}, strings.itAsk),
    origins,
    copy,
  )
  const dismiss = h('button', { 'aria-label': strings.dismiss, class: 'dismiss', part: 'dismiss', type: 'button' }, '×')
  const root = h(
    'div',
    { 'aria-label': strings.title, class: 'root', part: 'root', role: 'region' },
    warningIcon(),
    h('div', { class: 'body' }, summary, details),
    dismiss,
  )
  return { announce, copy, details, dismiss, origins, root }
}

function listFormat(locale: string): Intl.ListFormat {
  try {
    return new Intl.ListFormat(locale, { type: 'conjunction' })
  } catch {
    // An invalid lang attribute (e.g. "en_US") must not break the banner.
    return new Intl.ListFormat('en', { type: 'conjunction' })
  }
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string>,
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  element.append(...children)
  return element
}

function warningIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', 'icon')
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', 'M12 3 2 21h20L12 3Zm0 6v5m0 3v.01')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '2')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  svg.append(path)
  return svg
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS (all files).

- [ ] **Step 7: Lint, format, type-check**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all exit 0.

- [ ] **Step 8: Hand off for commit**

Propose: `feat: render the canary banner DOM`. Do not run git.

---

### Task 7: The `<thoro-res-canary>` custom element

**Files:**

- Create: `packages/thoro-ui/src/res-canary/ui/element.ts`, `packages/thoro-ui/src/res-canary/element.ts`
- Test: `packages/thoro-ui/test/unit/res-canary/element.test.ts`

**Interfaces:**

- Consumes: `Canary`, `BlockedFeature` (Task 3); `createCanary` (Task 4, tests only); `renderCanary`, `originsText`, `RenderedCanary`, `resolveStrings`, `CanaryStrings`, `canarySheet` (Task 6).
- Produces: `interface ResCanaryElement extends HTMLElement { canary: Canary | undefined; items: readonly BlockedFeature[] | undefined; strings: Partial<CanaryStrings>; variant: CanaryVariant }`, `type CanaryVariant = 'banner' | 'inline'`, `type CanaryDismissDetail = { ids: string[] }`, `type CanaryCopyDetail = { copied: boolean; text: string }`, `defineResCanaryElement(tagName?: string): void`, `mountBanner(canary: Canary): ResCanaryElement`; global `HTMLElementTagNameMap['thoro-res-canary']` and `HTMLElementEventMap` entries for `res-canary-dismiss` / `res-canary-copy`.

- [ ] **Step 1: Write the failing test**

`packages/thoro-ui/test/unit/res-canary/element.test.ts`:

```ts
import { createCanary } from '../../../src/res-canary/canary.ts'
import type { BlockedFeature, Canary, Feature } from '../../../src/res-canary/types.ts'
import { defineResCanaryElement, mountBanner, type ResCanaryElement } from '../../../src/res-canary/ui/element.ts'

defineResCanaryElement()

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
  origins: ['https://*.sign.example', 'https://widget.chat.example'],
}

function canaryWith(...blocked: string[]): Canary {
  const canary = createCanary({ features: [chat, sign], ownPolicy: 'own.example', storage: null })
  for (const id of blocked) canary.report(id)
  return canary
}

function mount(setup: (element: ResCanaryElement) => void, parent: HTMLElement = document.body): ResCanaryElement {
  const element = document.createElement('thoro-res-canary')
  setup(element)
  parent.append(element)
  return element
}

function part<T extends Element = HTMLElement>(element: HTMLElement, name: string): T {
  return element.shadowRoot?.querySelector(`[part="${name}"]`) as T
}

afterEach(() => document.body.replaceChildren())

describe('<thoro-res-canary>', () => {
  it('stays hidden and empty until the canary has something blocked', () => {
    const canary = canaryWith()
    const element = mount(el => {
      el.canary = canary
    })
    expect(element.hidden).toBe(true)
    expect(element.shadowRoot?.childNodes).toHaveLength(0)
    canary.report('chat')
    expect(element.hidden).toBe(false)
    expect(part(element, 'title').textContent).toBe("Some features couldn't load: Support chat.")
  })

  it('uncontrolled: the dismiss button dismisses through the canary', () => {
    const canary = canaryWith('chat')
    const element = mount(el => {
      el.canary = canary
    })
    const onDismiss = vi.fn()
    element.addEventListener('res-canary-dismiss', event => onDismiss(event.detail))
    part<HTMLButtonElement>(element, 'dismiss').click()
    expect(onDismiss).toHaveBeenCalledWith({ ids: ['chat'] })
    expect(canary.getSnapshot().dismissed).toBe(true)
    expect(element.hidden).toBe(true)
  })

  it('skips the default dismiss when the event is cancelled', () => {
    const canary = canaryWith('chat')
    const element = mount(el => {
      el.canary = canary
    })
    element.addEventListener('res-canary-dismiss', event => event.preventDefault())
    part<HTMLButtonElement>(element, 'dismiss').click()
    expect(canary.getSnapshot().dismissed).toBe(false)
    expect(element.hidden).toBe(false)
  })

  it('controlled: renders only the given items and leaves state to the parent', () => {
    const canary = canaryWith('chat', 'sign')
    const element = mount(el => {
      el.canary = canary
      el.items = []
    })
    expect(element.hidden).toBe(true)
    const items: BlockedFeature[] = [{ ...sign, reason: 'load-failed' }]
    element.items = items
    expect(part(element, 'title').textContent).toBe("Some features couldn't load: E-signature.")
    part<HTMLButtonElement>(element, 'dismiss').click()
    expect(canary.getSnapshot().dismissed).toBe(false)
    expect(element.hidden).toBe(false)
  })

  it('copies the deduplicated origins for IT and announces it', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const element = mount(el => {
      el.canary = canaryWith('chat', 'sign')
    })
    const onCopy = vi.fn()
    element.addEventListener('res-canary-copy', event => onCopy(event.detail))
    part<HTMLButtonElement>(element, 'copy').click()
    const text = 'https://*.sign.example\nhttps://widget.chat.example'
    await vi.waitFor(() => expect(onCopy).toHaveBeenCalledWith({ copied: true, text }))
    expect(writeText).toHaveBeenCalledWith(text)
    expect(part(element, 'copy').textContent).toBe('Copied')
    expect(part(element, 'summary').textContent).toContain('Copied')
  })

  it('falls back to selecting the list when the clipboard refuses', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('NotAllowedError'))
    const element = mount(el => {
      el.canary = canaryWith('chat')
    })
    const onCopy = vi.fn()
    element.addEventListener('res-canary-copy', event => onCopy(event.detail))
    part<HTMLButtonElement>(element, 'copy').click()
    await vi.waitFor(() => expect(onCopy).toHaveBeenCalledWith({ copied: false, text: 'https://widget.chat.example' }))
    expect(part(element, 'copy').textContent).toBe('Copy for IT')
  })

  it('applies string overrides and ignores non-string values', () => {
    const element = mount(el => {
      el.canary = canaryWith('chat')
      el.strings = { copy: 'Kopieren', title: undefined as unknown as string }
    })
    expect(part(element, 'copy').textContent).toBe('Kopieren')
    expect(part(element, 'title').textContent).toBe("Some features couldn't load: Support chat.")
  })

  it('joins labels in the closest lang and survives an invalid one', () => {
    const wrapper = document.createElement('div')
    wrapper.lang = 'de'
    document.body.append(wrapper)
    const element = mount(el => {
      el.canary = canaryWith('chat', 'sign')
    }, wrapper)
    expect(part(element, 'title').textContent).toBe("Some features couldn't load: Support chat und E-signature.")
    wrapper.lang = 'en_US'
    element.strings = {}
    expect(part(element, 'title').textContent).toBe("Some features couldn't load: Support chat and E-signature.")
  })

  it('keeps the details panel open when the list changes', () => {
    const canary = canaryWith('chat')
    const element = mount(el => {
      el.canary = canary
    })
    part<HTMLDetailsElement>(element, 'details').open = true
    canary.report('sign')
    expect(part<HTMLDetailsElement>(element, 'details').open).toBe(true)
    expect(part(element, 'list').children).toHaveLength(2)
  })

  it('picks up properties that were set before the element was defined', () => {
    const early = document.createElement('late-canary') as ResCanaryElement
    early.canary = canaryWith('chat')
    early.variant = 'banner'
    document.body.append(early)
    defineResCanaryElement('late-canary')
    expect(early.getAttribute('variant')).toBe('banner')
    expect(part(early, 'title').textContent).toBe("Some features couldn't load: Support chat.")
  })

  it('unsubscribes when removed and catches up when re-attached', () => {
    const canary = canaryWith()
    const unsubscribed = vi.fn()
    const tracked: Canary = {
      ...canary,
      subscribe: listener => {
        const off = canary.subscribe(listener)
        return () => {
          unsubscribed()
          off()
        }
      },
    }
    const element = mount(el => {
      el.canary = tracked
    })
    element.remove()
    expect(unsubscribed).toHaveBeenCalledTimes(1)
    canary.report('chat')
    document.body.append(element)
    expect(element.hidden).toBe(false)
    expect(part(element, 'title').textContent).toBe("Some features couldn't load: Support chat.")
  })

  it('reflects variant to the attribute, defaulting to inline', () => {
    const element = mount(() => {})
    expect(element.variant).toBe('inline')
    element.variant = 'banner'
    expect(element.getAttribute('variant')).toBe('banner')
  })

  it('mountBanner prepends a visible banner to <body>', () => {
    document.body.append(document.createElement('main'))
    const element = mountBanner(canaryWith('chat'))
    expect(document.body.firstElementChild).toBe(element)
    expect(element.getAttribute('variant')).toBe('banner')
    expect(element.hidden).toBe(false)
  })

  it('defineResCanaryElement ignores a tag that is already defined', () => {
    expect(() => defineResCanaryElement()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -C packages/thoro-ui test test/unit/res-canary/element.test.ts`
Expected: FAIL — cannot resolve `../../../src/res-canary/ui/element.ts`.

- [ ] **Step 3: Implement `packages/thoro-ui/src/res-canary/ui/element.ts`**

```ts
import type { BlockedFeature, Canary } from '../types.ts'
import { originsText, renderCanary, type RenderedCanary } from './render.ts'
import { resolveStrings, type CanaryStrings } from './strings.ts'
import { canarySheet } from './styles.ts'

export type CanaryVariant = 'banner' | 'inline'

export type CanaryDismissDetail = { ids: string[] }

export type CanaryCopyDetail = { copied: boolean; text: string }

export interface ResCanaryElement extends HTMLElement {
  /** Uncontrolled source: the element subscribes to it and dismisses through it. */
  canary: Canary | undefined
  /** Controlled source: when set, the element renders exactly these and ignores `canary`. */
  items: readonly BlockedFeature[] | undefined
  strings: Partial<CanaryStrings>
  variant: CanaryVariant
}

declare global {
  interface HTMLElementTagNameMap {
    'thoro-res-canary': ResCanaryElement
  }
  interface HTMLElementEventMap {
    'res-canary-copy': CustomEvent<CanaryCopyDetail>
    'res-canary-dismiss': CustomEvent<CanaryDismissDetail>
  }
}

const DEFAULT_TAG = 'thoro-res-canary'
const PROPERTIES = ['canary', 'items', 'strings', 'variant'] as const
const NOTHING: readonly BlockedFeature[] = []

export function defineResCanaryElement(tagName: string = DEFAULT_TAG): void {
  if (typeof customElements === 'undefined' || customElements.get(tagName)) return
  customElements.define(tagName, createElementClass())
}

/** Inserts an uncontrolled banner as the first element of <body> (after DOMContentLoaded if needed). */
export function mountBanner(canary: Canary): ResCanaryElement {
  defineResCanaryElement()
  const element = document.createElement(DEFAULT_TAG)
  element.variant = 'banner'
  element.canary = canary
  if (document.body) document.body.prepend(element)
  else document.addEventListener('DOMContentLoaded', () => document.body.prepend(element), { once: true })
  return element
}

// Built on demand so importing this module where HTMLElement doesn't exist (a server) is safe.
function createElementClass(): CustomElementConstructor {
  return class ResCanary extends HTMLElement implements ResCanaryElement {
    readonly #root: ShadowRoot
    #canary: Canary | undefined
    #items: readonly BlockedFeature[] | undefined
    #strings: Partial<CanaryStrings> = {}
    #unsubscribe: (() => void) | undefined

    constructor() {
      super()
      this.#root = this.attachShadow({ mode: 'open' })
      this.#root.adoptedStyleSheets = [canarySheet()]
    }

    get canary(): Canary | undefined {
      return this.#canary
    }

    set canary(value: Canary | undefined) {
      this.#canary = value
      this.#connect()
    }

    get items(): readonly BlockedFeature[] | undefined {
      return this.#items
    }

    set items(value: readonly BlockedFeature[] | undefined) {
      this.#items = value
      this.#connect()
    }

    get strings(): Partial<CanaryStrings> {
      return this.#strings
    }

    set strings(value: Partial<CanaryStrings>) {
      this.#strings = value ?? {}
      this.#render()
    }

    get variant(): CanaryVariant {
      return this.getAttribute('variant') === 'banner' ? 'banner' : 'inline'
    }

    set variant(value: CanaryVariant) {
      this.setAttribute('variant', value)
    }

    connectedCallback(): void {
      // Properties set before this class was defined sit on the instance and hide the accessors.
      // Re-run them through the setters.
      const self = this as unknown as Record<string, unknown>
      for (const name of PROPERTIES) {
        if (!Object.hasOwn(this, name)) continue
        const value = self[name]
        delete self[name]
        self[name] = value
      }
      this.#connect()
    }

    disconnectedCallback(): void {
      this.#unsubscribe?.()
      this.#unsubscribe = undefined
    }

    #connect(): void {
      this.#unsubscribe?.()
      this.#unsubscribe = undefined
      if (!this.isConnected) return
      if (this.#items === undefined && this.#canary) {
        this.#unsubscribe = this.#canary.subscribe(() => this.#render())
      }
      this.#render()
    }

    #visibleItems(): readonly BlockedFeature[] {
      if (this.#items !== undefined) return this.#items
      const snapshot = this.#canary?.getSnapshot()
      return snapshot && !snapshot.dismissed ? snapshot.blocked : NOTHING
    }

    #render(): void {
      if (!this.isConnected) return
      const items = this.#visibleItems()
      this.hidden = items.length === 0
      if (items.length === 0) {
        this.#root.replaceChildren()
        return
      }
      const strings = resolveStrings(this.#strings)
      const wasOpen = this.#root.querySelector('details')?.open ?? false
      const parts = renderCanary(items, strings, localeOf(this))
      parts.details.open = wasOpen
      parts.copy.addEventListener('click', () => void this.#copy(items, strings, parts))
      parts.dismiss.addEventListener('click', () => this.#dismiss(items))
      this.#root.replaceChildren(parts.root)
    }

    async #copy(items: readonly BlockedFeature[], strings: CanaryStrings, parts: RenderedCanary): Promise<void> {
      const text = originsText(items)
      let copied = false
      try {
        await navigator.clipboard.writeText(text)
        copied = true
      } catch {
        // No clipboard (insecure context, denied permission): select the list so it can be copied by hand.
      }
      if (copied) {
        parts.copy.textContent = strings.copied
        parts.announce.textContent = strings.copied
      } else {
        selectContents(parts.origins)
      }
      this.dispatchEvent(
        new CustomEvent<CanaryCopyDetail>('res-canary-copy', {
          bubbles: true,
          cancelable: true,
          composed: true,
          detail: { copied, text },
        }),
      )
    }

    #dismiss(items: readonly BlockedFeature[]): void {
      const event = new CustomEvent<CanaryDismissDetail>('res-canary-dismiss', {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail: { ids: items.map(item => item.id) },
      })
      const proceed = this.dispatchEvent(event)
      if (proceed && this.#items === undefined) this.#canary?.dismiss()
    }
  }
}

function localeOf(element: Element): string {
  return element.closest('[lang]')?.getAttribute('lang') || document.documentElement.lang || 'en'
}

function selectContents(node: Node): void {
  try {
    const range = document.createRange()
    range.selectNodeContents(node)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  } catch {
    // Selecting inside a shadow root is best-effort; some engines refuse.
  }
}
```

- [ ] **Step 4: Create the element entry `packages/thoro-ui/src/res-canary/element.ts`**

```ts
import { defineResCanaryElement } from './ui/element.ts'

defineResCanaryElement()

export { defineResCanaryElement, mountBanner } from './ui/element.ts'
export type { CanaryCopyDetail, CanaryDismissDetail, CanaryVariant, ResCanaryElement } from './ui/element.ts'
export { DEFAULT_STRINGS } from './ui/strings.ts'
export type { CanaryStrings } from './ui/strings.ts'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS (all files).

- [ ] **Step 6: Lint, format, type-check**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all exit 0.

- [ ] **Step 7: Hand off for commit**

Propose: `feat: add the <thoro-res-canary> custom element`. Do not run git.

---

### Task 8: Build, package entry points, size budget and the server-import check

**Files:**

- Create: `packages/thoro-ui/.size-limit.json`, `packages/thoro-ui/test/ssr.ts`, `packages/thoro-ui/LICENSE` (copy of the root one), `packages/thoro-ui/README.md` (stub; Task 10 writes it)
- Modify: `packages/thoro-ui/vite.config.ts` (`pack` block), `packages/thoro-ui/package.json` (fields and scripts), root `package.json` (scripts)

**Interfaces:**

- Consumes: `packages/thoro-ui/src/res-canary/index.ts`, `packages/thoro-ui/src/res-canary/element.ts` (Tasks 4 and 7).
- Produces: `packages/thoro-ui/dist/res-canary/index.js`, `index.d.ts`, `element.js`, `element.d.ts` (+ source maps) — Task 9's harness imports `/dist/res-canary/index.js` and `/dist/res-canary/element.js`. Package scripts `build`, `prepack`, `size`, `test:ssr`; root scripts `build`, `size`, `test:ssr`.

- [ ] **Step 1: Install the size checker**

tsdown comes with Vite+ (`vp pack`); only size-limit is installed, in the package that it measures.

Run: `pnpm -C packages/thoro-ui add -D -E size-limit@14.1.0 @size-limit/preset-small-lib@14.1.0`

- [ ] **Step 2: Add the `pack` block**

In `packages/thoro-ui/vite.config.ts`, add next to the `test` block:

```ts
  pack: {
    dts: true,
    // The keys set the output paths. A plain list would name files after their path below the common
    // folder (src/res-canary/), giving dist/index.js instead of dist/res-canary/index.js.
    entry: {
      'res-canary/index': 'src/res-canary/index.ts',
      'res-canary/element': 'src/res-canary/element.ts',
    },
    format: 'esm',
    platform: 'browser',
    sourcemap: true,
  },
```

(`.d.ts` files are generated through `isolatedDeclarations`, so TypeScript 7's missing JS API is not a problem.)

- [ ] **Step 3: Add the package fields and scripts**

Add these top-level fields to `packages/thoro-ui/package.json` (oxfmt's `sortPackageJson` orders them). There is no `"."` entry and no top-level `types`: every import names a component (collection spec §1).

```json
  "sideEffects": ["./dist/*/element.js"],
  "exports": {
    "./res-canary": {
      "types": "./dist/res-canary/index.d.ts",
      "default": "./dist/res-canary/index.js"
    },
    "./res-canary/element": {
      "types": "./dist/res-canary/element.d.ts",
      "default": "./dist/res-canary/element.js"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist"],
```

Add these scripts to `packages/thoro-ui/package.json`:

```json
    "build": "vp pack",
    "prepack": "vp pack",
    "size": "size-limit",
    "test:ssr": "node test/ssr.ts",
```

Add these scripts to the root `package.json`:

```json
    "build": "vp run -r build",
    "size": "vp run -r size",
    "test:ssr": "vp run -r test:ssr",
```

`pnpm pack` only ships the package folder, so the package needs its own LICENSE and README:

Run: `cp LICENSE packages/thoro-ui/LICENSE && printf '# thoro-ui\n' > packages/thoro-ui/README.md`

- [ ] **Step 4: Create `packages/thoro-ui/.size-limit.json`**

```json
[
  { "name": "res-canary core", "path": "dist/res-canary/index.js", "limit": "2 KB", "gzip": true },
  {
    "name": "res-canary element (with everything it imports)",
    "path": "dist/res-canary/element.js",
    "limit": "4 KB",
    "gzip": true
  }
]
```

- [ ] **Step 5: Write the server-import check**

`packages/thoro-ui/test/ssr.ts`:

```ts
// Imports the built package in plain Node (no DOM) to prove neither entry point touches
// window, document or customElements at import time. Run after `pnpm build`.
import assert from 'node:assert/strict'

assert.equal(typeof globalThis.document, 'undefined')

const core = await import(new URL('../dist/res-canary/index.js', import.meta.url).href)
const element = await import(new URL('../dist/res-canary/element.js', import.meta.url).href)

const canary = core.createCanary({
  features: [{ id: 'a', impact: 'A is unavailable.', label: 'A', origins: ['https://a.example'] }],
  ownPolicy: 'own.example',
  storage: null,
})
canary.start()
canary.report('a')
assert.deepEqual(
  canary.getSnapshot().blocked.map((feature: { id: string }) => feature.id),
  ['a'],
)
assert.equal(typeof element.mountBanner, 'function')
element.defineResCanaryElement()

console.log('ssr: ok')
```

- [ ] **Step 6: Run the check before building to verify it fails**

Run: `rm -rf packages/thoro-ui/dist && pnpm test:ssr`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `dist/res-canary/index.js`.

- [ ] **Step 7: Build and run the checks**

Run: `pnpm build`
Expected: `dist/res-canary/index.js`, `dist/res-canary/index.d.ts`, `dist/res-canary/element.js`, `dist/res-canary/element.d.ts` (and `.map` files) listed; `Build complete`. A shared chunk may also appear if both entries use the same module; that is expected.

Run: `ls packages/thoro-ui/dist packages/thoro-ui/dist/res-canary`
Expected: `dist/` holds `res-canary/` (and any shared chunk) but no `index.js` or `element.js` of its own — the nested output paths the exports point at (collection spec §1, the check it asks for).

Run: `pnpm test:ssr`
Expected: prints `ssr: ok`, exit 0.

Run: `pnpm size`
Expected: both entries under their limits (core ≤ 2 KB, element ≤ 4 KB), exit 0. If either is over, stop and report the numbers to the maintainer rather than raising the limit.

Run: `grep -c "HTMLElementTagNameMap" packages/thoro-ui/dist/res-canary/element.d.ts`
Expected: `1` or more — the global typing for `document.createElement('thoro-res-canary')` ships with the types.

- [ ] **Step 8: Check what npm would publish**

Run: `cd packages/thoro-ui && pnpm pack && tar -tzf thoro-ui-0.0.0.tgz && rm thoro-ui-0.0.0.tgz && cd ../..`
Expected: `package/package.json`, `package/README.md`, `package/LICENSE`, and `package/dist/res-canary/` with `index.js`, `index.d.ts`, `element.js`, `element.d.ts` and their maps (plus any shared chunk in `package/dist/`). Nothing from `src/` or `test/`.

- [ ] **Step 9: Lint, format, type-check, unit tests**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all exit 0.

- [ ] **Step 10: Hand off for commit**

Propose: `build: package entry points, size budget and server-import check`. Do not run git.

---

### Task 9: Real-browser scenarios in three engines

**Files:**

- Create: `packages/thoro-ui/test/browser/fixtures/res-canary-harness.js`, `packages/thoro-ui/test/browser/res-canary/scenarios.spec.ts`
- Modify: `packages/thoro-ui/test/browser/globals.d.ts`, `packages/thoro-ui/package.json` (`test:browser` script)

**Interfaces:**

- Consumes: the fixture server and policies (Task 1; `script` is required in `/page` URLs); `dist/res-canary/index.js` → `createCanary`, `dist/res-canary/element.js` → `mountBanner` (Task 8).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Make the browser tests build first**

In `packages/thoro-ui/package.json`, change `"test:browser": "playwright test"` to `"test:browser": "vp pack && playwright test"`. The root `test:browser` (`vp run -r test:browser`) stays as it is.

- [ ] **Step 2: Create the harness**

Fixtures are named after their component, because the fixture server is shared by every component. `packages/thoro-ui/test/browser/fixtures/res-canary-harness.js`:

```js
import { createCanary } from '/dist/res-canary/index.js'
import { mountBanner } from '/dist/res-canary/element.js'

const VENDOR = 'http://127.0.0.1:4174'
const violations = []
const own = []
let canary

document.addEventListener('securitypolicyviolation', event => {
  violations.push({ blockedURI: event.blockedURI, directive: event.effectiveDirective })
})

globalThis.harness = {
  own,
  violations,
  start({ banner = false, probe, probeTimeoutMs = 2000 } = {}) {
    canary = createCanary({
      features: [{ id: 'widget', impact: "The widget won't load.", label: 'Widget', origins: [VENDOR], probe }],
      onOwnPolicyViolation: violation => own.push(violation),
      ownPolicy: 'own-marker.invalid',
      probeTimeoutMs,
      storage: null,
    })
    canary.start()
    if (banner) mountBanner(canary)
  },
  loadScript(path) {
    const script = document.createElement('script')
    script.src = VENDOR + path
    document.head.append(script)
  },
  loadImage(path) {
    const image = document.createElement('img')
    image.src = VENDOR + path
    document.body.append(image)
  },
  status() {
    return canary.getSnapshot().statuses.widget
  },
  blockedIds() {
    return canary.getSnapshot().blocked.map(feature => feature.id)
  },
  bannerText() {
    const element = document.querySelector('thoro-res-canary')
    return element && !element.hidden ? element.shadowRoot.textContent : null
  },
  bannerPadding() {
    const root = document.querySelector('thoro-res-canary')?.shadowRoot?.querySelector('[part="root"]')
    return root ? getComputedStyle(root).paddingLeft : null
  },
}
```

- [ ] **Step 3: Type the harness global**

Replace `packages/thoro-ui/test/browser/globals.d.ts` with:

```ts
type HarnessProbe = { type: 'fetch' | 'image' | 'script' | 'style'; url: string }

declare global {
  var harness: {
    own: unknown[]
    violations: Array<{ blockedURI: string; directive: string }>
    start(options?: { banner?: boolean; probe?: HarnessProbe; probeTimeoutMs?: number }): void
    loadScript(path: string): void
    loadImage(path: string): void
    status(): string
    blockedIds(): string[]
    bannerText(): string | null
    bannerPadding(): string | null
  }
  var sheetCheck: { paddingLeft(): string; violations: string[] }
}

export {}
```

- [ ] **Step 4: Write the scenarios**

`packages/thoro-ui/test/browser/res-canary/scenarios.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

const VENDOR = 'http://127.0.0.1:4174'

// The harness is a module script, which runs before the load event goto() waits for.
// Only page.evaluate is used: it goes through the automation protocol, not the page's (blocked) eval.
async function open(page: Page, csp: 'allowed' | 'foreign' | 'own-blocks' | 'strict'): Promise<void> {
  await page.goto(`/page?csp=${csp}&script=res-canary-harness`)
}

const status = (page: Page): Promise<string> => page.evaluate(() => harness.status())
const bannerText = (page: Page): Promise<string | null> => page.evaluate(() => harness.bannerText())

test('an allowed vendor shows nothing', async ({ page }) => {
  await open(page, 'allowed')
  await page.evaluate(() => harness.start({ banner: true }))
  await page.evaluate(() => harness.loadScript('/widget.js'))
  await expect.poll(() => page.evaluate(() => 'vendorWidgetLoaded' in globalThis)).toBe(true)
  expect(await status(page)).toBe('unknown')
  expect(await bannerText(page)).toBeNull()
})

test('a second, stricter CSP (extension or proxy) is reported as foreign-csp', async ({ page }) => {
  await open(page, 'foreign')
  await page.evaluate(() => harness.start({ banner: true }))
  await page.evaluate(() => harness.loadScript('/widget.js'))
  await expect.poll(() => status(page)).toBe('foreign-csp')
  await expect.poll(() => bannerText(page)).toContain("Some features couldn't load: Widget.")
})

test('a dropped request is reported as load-failed', async ({ page }) => {
  await page.route(`${VENDOR}/**`, route => route.abort())
  await open(page, 'allowed')
  await page.evaluate(() => harness.start({ banner: true }))
  await page.evaluate(() => harness.loadScript('/widget.js'))
  await expect.poll(() => status(page)).toBe('load-failed')
  await expect.poll(() => bannerText(page)).toContain('Widget')
})

test('our own policy blocking the vendor is reported to us and kept out of the banner', async ({ page }) => {
  await open(page, 'own-blocks')
  await page.evaluate(() => harness.start({ banner: true }))
  await page.evaluate(() => harness.loadScript('/widget.js'))
  await expect.poll(() => status(page)).toBe('own-csp')
  expect(await page.evaluate(() => harness.own.length)).toBeGreaterThan(0)
  expect(await page.evaluate(() => harness.blockedIds())).toEqual([])
  expect(await bannerText(page)).toBeNull()
})

test('the element renders and styles itself under a strict CSP with Trusted Types', async ({ page }) => {
  await page.route(`${VENDOR}/**`, route => route.abort())
  await open(page, 'strict')
  await page.evaluate(() => harness.start({ banner: true }))
  await page.evaluate(() => harness.loadImage('/pixel.svg'))
  await expect.poll(() => bannerText(page)).toContain('Widget')
  expect(await page.evaluate(() => harness.bannerPadding())).toBe('16px')
  expect(await page.evaluate(() => harness.violations)).toEqual([])
})

test.describe('probes', () => {
  const probes = [
    { path: '/widget.js', type: 'script' },
    { path: '/widget.css', type: 'style' },
    { path: '/pixel.svg', type: 'image' },
    { path: '/widget.js', type: 'fetch' },
  ] as const

  for (const { path, type } of probes) {
    test(`${type} probe: reachable → ok`, async ({ page }) => {
      await open(page, 'allowed')
      await page.evaluate(probe => harness.start({ probe }), { type, url: VENDOR + path })
      await expect.poll(() => status(page)).toBe('ok')
    })

    test(`${type} probe: dropped → load-failed`, async ({ page }) => {
      await page.route(`${VENDOR}/**`, route => route.abort())
      await open(page, 'allowed')
      await page.evaluate(probe => harness.start({ probe }), { type, url: VENDOR + path })
      await expect.poll(() => status(page)).toBe('load-failed')
    })
  }

  test('a probe that never answers fails after the timeout', async ({ page }) => {
    await open(page, 'allowed')
    await page.evaluate(probe => harness.start({ probe, probeTimeoutMs: 1000 }), {
      type: 'script' as const,
      url: `${VENDOR}/hang`,
    })
    expect(await status(page)).toBe('unknown')
    await expect.poll(() => status(page), { timeout: 5000 }).toBe('load-failed')
  })
})
```

- [ ] **Step 5: Run the browser tests**

Run: `pnpm test:browser`
Expected: every test passes in chromium, firefox and webkit — `45 passed` (Task 1's stylesheet check plus 14 scenarios, × 3 engines).

Inside an agent sandbox, Firefox can't launch (AGENTS.md). Run `pnpm -C packages/thoro-ui test:browser --project=chromium --project=webkit` (expected `30 passed`), and ask the maintainer to run `pnpm -C packages/thoro-ui test:browser --project=firefox` from a normal terminal (expected `15 passed`).

If one engine fails a scenario, read its failure before changing code. The two known ways a real engine can differ from the others here: it may report `blockedURI` as an origin rather than a full URL (still matches, since matching ignores the path), or it may not fire `error` on a preload link blocked by CSP (the violation event still classifies it). Fix the package only if its behaviour contradicts the spec; otherwise report the engine difference to the maintainer.

- [ ] **Step 6: Lint, format, type-check**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all exit 0.

- [ ] **Step 7: Hand off for commit**

Propose: `test: cover real-browser scenarios in Chromium, Firefox and WebKit`. Do not run git.

---

### Task 10: READMEs, examples and CI

**Files:**

- Create: `examples/react/package.json`, `examples/react/tsconfig.json`, `examples/react/app.tsx`, `examples/vanilla/package.json`, `examples/vanilla/index.html`, `examples/vanilla/main.js`, `.github/workflows/ci.yml`
- Modify: `packages/thoro-ui/README.md` (replace the stub — this is the npm page), `README.md` (replace — the repo overview), `pnpm-lock.yaml` (by `pnpm install`)

**Interfaces:**

- Consumes: the public API from `thoro-ui/res-canary` and `thoro-ui/res-canary/element` (Tasks 4–8); the workspace (Task 1), whose `examples/*` glob picks up both examples.
- Produces: nothing for later tasks.

- [ ] **Step 1: Create the React example package**

The React example is type-checked, not run. Its tsconfig maps the package's entry points to their source, so the type check needs no build first.

`examples/react/package.json`:

```json
{
  "name": "example-react",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc -p ."
  },
  "dependencies": {
    "react": "19.3.0",
    "thoro-ui": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "19.3.0"
  }
}
```

`examples/react/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "paths": {
      "thoro-ui/res-canary": ["../../packages/thoro-ui/src/res-canary/index.ts"],
      "thoro-ui/res-canary/element": ["../../packages/thoro-ui/src/res-canary/element.ts"]
    },
    "types": []
  },
  "include": ["app.tsx"]
}
```

- [ ] **Step 2: Create `examples/react/app.tsx`**

```tsx
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
```

Run: `pnpm install && pnpm typecheck`
Expected: exit 0; the output shows `tsc -p .` running in both `packages/thoro-ui` and `examples/react`.

- [ ] **Step 3: Create the vanilla example**

A plain HTML page and one module, served by the Vite dev server that comes with Vite+. It imports the package by name, like an app would; the workspace links it to `packages/thoro-ui`, whose exports point at `dist/` — so build first.

`examples/vanilla/package.json`:

```json
{
  "name": "example-vanilla",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vp dev"
  },
  "dependencies": {
    "thoro-ui": "workspace:*"
  }
}
```

`examples/vanilla/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>thoro-ui — res-canary example</title>
    <script type="module" src="./main.js"></script>
  </head>
  <body>
    <h1>res-canary</h1>
    <p>This page probes a host that never resolves, so the banner appears above this heading.</p>
  </body>
</html>
```

`examples/vanilla/main.js`:

```js
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
  ownPolicy: 'api.example.com',
  storage: null,
})

canary.start()
mountBanner(canary)
```

Run: `pnpm install && pnpm build && pnpm -C examples/vanilla dev`, then open the local URL it prints (`http://localhost:5173/`).
Expected: within a few seconds a banner reading "Some features couldn't load: Support chat." appears at the top; **Details** lists "Support chat — The support chat bubble won't appear." and `https://widget.chat.invalid`; **Copy for IT** changes to "Copied"; **×** hides it. Stop the server with Ctrl+C.

- [ ] **Step 4: Replace `packages/thoro-ui/README.md`**

This is what npm shows. Links into the repo are absolute, because relative links break on npmjs.com.

````markdown
# thoro-ui

Small, dependency-free web components for compliance-minded web apps. Every component has its own entry point, so your bundle only carries what you import.

| component    | import                                               | what it does                                                                                                                                    |
| ------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `res-canary` | `thoro-ui/res-canary`, `thoro-ui/res-canary/element` | Tells users when their browser or network blocks the third-party resources your app depends on, and gives their IT team the addresses to allow. |

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
  ownPolicy: 'api.example.com', // any string unique to your own CSP
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

#### React 19

React 19 supports custom elements natively. See [`examples/react/app.tsx`](https://github.com/TheHaff/thoro-ui/blob/main/examples/react/app.tsx) for controlled mode and for a fully custom UI with `useSyncExternalStore(canary.subscribe, canary.getSnapshot)`.

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
- **`fetch`, XHR, WebSocket, WebRTC:** not detected automatically — call `canary.report(id)` from your error handling.
- **Before `start()`:** violations that happened earlier are missed. Probes still catch a blocked host.
- **`load-failed` includes vendor outages.** The default text says "usually" for that reason.
- **Chrome logs an "unused preload" warning** for `script` and `style` probes. Use a `fetch` probe to avoid it.
- **An extension that hides an element** without blocking its request can't be detected.

## Browser support

Current Chrome, Edge, Firefox and Safari 16.4+.

## License

MIT
````

- [ ] **Step 5: Replace the root `README.md`**

````markdown
# thoro-ui

Small, dependency-free web components for compliance-minded web apps, published as one tree-shakeable npm package. The user guide is the package README: [`packages/thoro-ui`](packages/thoro-ui/README.md).

## Components

| component    | what it does                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `res-canary` | Tells users when their browser or network blocks the third-party resources your app depends on, and gives their IT team the addresses to allow. |

## Repo layout

```
packages/thoro-ui/   the published package: src/<component>/, tests, build config
examples/vanilla/    a plain page on the Vite dev server
examples/react/      React 19, type-checked in CI
docs/specs/          designs: the collection rules and one spec per component
docs/plans/          implementation plans
```

## Development

Needs Node 24 and pnpm (the version in `package.json` is picked up automatically).

```sh
pnpm install
pnpm test           # unit tests
pnpm build          # packages/thoro-ui/dist
pnpm test:browser   # Playwright in Chromium, Firefox and WebKit
```

[`AGENTS.md`](AGENTS.md) lists every command and the rules for contributing.

## License

MIT
````

- [ ] **Step 6: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version-file: .node-version
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - run: pnpm size
      - run: pnpm test:ssr
      - run: pnpm -C packages/thoro-ui exec playwright install --with-deps chromium firefox webkit
      - run: pnpm test:browser
```

Publishing to npm stays manual and maintainer-approved (canary spec §9); this workflow never publishes.

- [ ] **Step 7: Run the full check locally**

Run: `pnpm format && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build && pnpm size && pnpm test:ssr && pnpm test:browser`
Expected: every command exits 0. Inside an agent sandbox, replace the last command with `pnpm -C packages/thoro-ui test:browser --project=chromium --project=webkit` and ask the maintainer to run the Firefox project from a normal terminal (AGENTS.md).

Ask the maintainer for their list of private company, customer and vendor names (never write that list into this repo), then run `grep -rniE "<name1>|<name2>|…" --exclude-dir=node_modules --exclude-dir=.git . || echo clean`.
Expected: `clean`.

- [ ] **Step 8: Hand off for commit**

Propose: `docs: add READMEs, examples and CI`. Do not run git.
