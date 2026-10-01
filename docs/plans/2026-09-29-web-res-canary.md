# web-res-canary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `web-res-canary`: a zero-dependency browser package that detects when a user's browser or network blocks the third-party resources a web app depends on, and a `<web-res-canary>` custom element that tells the user what won't work and gives their IT team the addresses to allow.

**Architecture:** A headless core (`web-res-canary`) listens for `securitypolicyviolation` events and capture-phase resource `error` events, runs optional startup probes, and keeps a per-feature status that only moves up in specificity. A separate entry (`web-res-canary/element`) defines a plain custom element with a shadow root styled by a constructed stylesheet; it renders a core snapshot in uncontrolled mode or caller-supplied items in controlled mode.

**Tech Stack:** TypeScript 7 (strict, `isolatedDeclarations`), tsdown, Vitest 5 + happy-dom, Playwright (Chromium, Firefox, WebKit), oxlint, oxfmt, size-limit, pnpm 11, Node 24+ for tooling.

**Spec:** `docs/specs/2026-09-29-web-res-canary-design.md` — read it alongside this plan.

**Tooling amendment (2026-09-30, maintainer's choice):** Vite+ (`vite-plus@1.0.0`) replaces the standalone oxlint, oxfmt, Vitest and tsdown packages. It bundles tsdown 0.23.0, Vitest 5.0.1, oxlint 1.85.0 and oxfmt 0.70.0, and reads all four configs from one `vite.config.ts`. pnpm is 12.8.1; Node is 24 locally too (Vite+ supports `^24.11 || >=26`). Where a task below disagrees, this wins:

- **Task 1:** no `oxlint.config.ts` / `oxfmt.config.ts` — their settings are the `lint` and `fmt` blocks of `vite.config.ts` (lint also sets `options.typeAware: true`). Install `vite-plus` instead of `oxlint` / `oxfmt`. Scripts: `vp lint`, `vp fmt`, `vp fmt --check`. The fixture server sends the CSP with `res.setHeader`, because `@types/node` types that header as a single string in `writeHead`.
- **Task 2:** no `vitest.config.ts` and no `vitest` install — the same options go in the `test` block of `vite.config.ts`; install only `happy-dom@20.14.5`. tsconfig `types` gets `vite-plus/test/globals`. Script: `"test": "vp test"`.
- **Task 8:** no `tsdown.config.ts` and no `tsdown` install — the same options go in the `pack` block. Script: `"build": "vp pack"`.
- **Unchanged:** `pnpm typecheck` stays `tsc -p .` (typescript@7.0.2), because `vp check` does not report `isolatedDeclarations` errors. Playwright, size-limit and the CI steps (which call `pnpm <script>`) are unchanged.

## Global Constraints

- Zero runtime dependencies.
- Neither entry point touches `window`, `document` or `customElements` at import time.
- Styles use a constructed `CSSStyleSheet` in `shadowRoot.adoptedStyleSheets`, never a `<style>` element or `style` attribute.
- The DOM is built with `createElement`, `createElementNS` and `textContent` only. No `innerHTML`, `insertAdjacentHTML` or `outerHTML`.
- No `eval`, `new Function`, or string timers. No inline event handlers.
- No network requests other than the configured probes. No fonts, icons or scripts from a CDN.
- ESM only, with `.d.ts`. `"type": "module"`. `exports`: `"."` → core, `"./element"` → element. `"sideEffects": ["./dist/element.js"]`.
- Size budget: core ≤ 2 KB gzip, element (including core) ≤ 4 KB gzip.
- Browser support: current evergreen browsers; Safari 16.4+.
- Defaults: `storageKey` `'web-res-canary:dismissed'`; `probeTimeoutMs` `15000` (`0` disables).
- Default strings, verbatim: `title` "Some features couldn't load"; `cause` "This is usually caused by a browser extension or your network settings."; `details` "Details"; `itAsk` "Ask your IT team to allow these addresses:"; `copy` "Copy for IT"; `copied` "Copied"; `dismiss` "Dismiss".
- This is a public repo: examples and tests use `*.example`, `*.invalid` and `127.0.0.1` hosts only — no company, customer or vendor names.
- Formatting: oxfmt with `semi: false`, `singleQuote: true`, `printWidth: 120`, `trailingComma: 'all'`, `arrowParens: 'avoid'`.
- **Git: the maintainer makes every commit.** Each task ends with a hand-off step: list the changed files and propose a commit message. Never run `git add` or `git commit`.

## Review Focus

1. **Properties set before the element is defined** (markup-first pages, or a framework rendering before `import 'web-res-canary/element'` runs) → the element still picks them up on upgrade. Test: Task 7.
2. **Unbound methods** — `useSyncExternalStore(canary.subscribe, canary.getSnapshot)` passes them without `this` → both still work. Test: Task 4.
3. **An invalid page `lang`** such as `lang="en_US"` (`Intl.ListFormat` throws `RangeError`) → the banner still renders, joining labels in English. Tests: Tasks 6 and 7.
4. **A global RegExp for `ownPolicy`** (`/marker/g`) → every violation is classified the same way; `lastIndex` must not make results alternate. Test: Task 4.
5. **A throwing subscriber or `onChange`** (a broken telemetry call) → the other subscribers are still notified and the error still surfaces. Test: Task 4.

## File Structure

```
AGENTS.md, CLAUDE.md, LICENSE      already present — working rules; don't recreate
package.json, pnpm-lock.yaml, tsconfig.json, .gitignore, .node-version
oxlint.config.ts, oxfmt.config.ts, vitest.config.ts, playwright.config.ts, tsdown.config.ts, .size-limit.json
.github/workflows/ci.yml
README.md
src/
  index.ts            core entry: createCanary + public types
  element.ts          element entry: defines <web-res-canary>; exports defineCanaryElement, mountBanner, strings
  types.ts            every public type
  origins.ts          CSP host-source parsing and matching
  status.ts           status precedence, blocked list, dismissal signature (pure)
  dismissal.ts        safe storage for the dismissal signature
  probes.ts           startup probes (preload, image, fetch, custom) with timeout
  canary.ts           createCanary: validation, listeners, store, API
  ui/strings.ts       default strings + resolveStrings
  ui/styles.ts        CSS text + lazily constructed shared sheet
  ui/render.ts        builds the element's shadow DOM from items (no state)
  ui/element.ts       the custom element class, defineCanaryElement, mountBanner
test/
  unit/*.test.ts      Vitest (happy-dom)
  ssr.ts              imports the built package in plain Node
  browser/server.ts   fixture server: app origin :4173, "vendor" origin :4174
  browser/globals.d.ts
  browser/fixtures/sheet-check.js, harness.js
  browser/*.spec.ts   Playwright
examples/vanilla/index.html, main.js
examples/react/app.tsx
```

---

### Task 1: Tooling scaffold and the strict-CSP stylesheet check

The spec's only unverified assumption (§7) is that constructed stylesheets are not blocked by a strict `style-src` in all three engines. This task sets up the tooling and proves it before any package code depends on it.

**Files:**

- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.node-version`, `oxlint.config.ts`, `oxfmt.config.ts`, `playwright.config.ts`
- Create: `test/browser/server.ts`, `test/browser/globals.d.ts`, `test/browser/fixtures/sheet-check.js`
- Test: `test/browser/stylesheet.spec.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: the fixture server used by Task 9 — `GET /page?csp=<allowed|foreign|own-blocks|strict>&script=<name>` returns an HTML page with that CSP that loads `/fixtures/<name>.js` (default `harness`); `/dist/*`, `/fixtures/*`, `/examples/*` are static; the vendor origin `http://127.0.0.1:4174` serves `/widget.js`, `/widget.css`, `/pixel.svg` and never answers `/hang`. The own-policy marker is `https://own-marker.invalid`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "web-res-canary",
  "version": "0.0.0",
  "description": "Tell users when their browser or network blocks the third-party resources your web app depends on.",
  "keywords": ["csp", "content-security-policy", "custom-element", "web-component", "ad-blocker", "firewall"],
  "license": "MIT",
  "author": "Haff",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/TheHaff/web-res-canary.git"
  },
  "type": "module",
  "scripts": {
    "format": "oxfmt --write .",
    "format:check": "oxfmt --check .",
    "lint": "oxlint .",
    "test:browser": "playwright test",
    "typecheck": "tsc -p ."
  },
  "packageManager": "pnpm@11.27.0"
}
```

- [ ] **Step 2: Install the tooling**

Run: `pnpm add -D -E typescript@7.0.2 @types/node@26.6.3 oxlint@1.86.0 oxfmt@0.71.0 @playwright/test@1.63.0`
Expected: `pnpm-lock.yaml` created; five entries under `devDependencies`. If pnpm reports ignored build scripts, ignore it — none of these packages need one.

Run: `pnpm exec playwright install chromium firefox webkit`
Expected: three browsers downloaded (a few minutes, ~500 MB the first time).

- [ ] **Step 3: Create the config files**

`tsconfig.json` (test files are type-checked too; config files are left to their own tools because `isolatedDeclarations` rejects `export default defineConfig(...)`):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "declaration": true,
    "isolatedDeclarations": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```

`.gitignore`:

```
node_modules/
dist/
coverage/
playwright-report/
test-results/
*.tgz
```

`.node-version`:

```
24
```

`oxlint.config.ts`:

```ts
import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: ['typescript', 'unicorn', 'oxc', 'import'],
  categories: {
    correctness: 'error',
  },
  ignorePatterns: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'],
})
```

`oxfmt.config.ts`:

```ts
import { defineConfig } from 'oxfmt'

export default defineConfig({
  arrowParens: 'avoid',
  bracketSpacing: true,
  endOfLine: 'lf',
  printWidth: 120,
  proseWrap: 'preserve',
  semi: false,
  singleQuote: true,
  sortPackageJson: true,
  tabWidth: 2,
  trailingComma: 'all',
  useTabs: false,
})
```

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'test/browser',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'node test/browser/server.ts',
    url: 'http://127.0.0.1:4173/health',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
```

- [ ] **Step 4: Create the fixture server**

`test/browser/server.ts` runs on Node's built-in TypeScript support, so it uses only erasable syntax and explicit file extensions.

```ts
import { readFile } from 'node:fs/promises'
import { createServer, type ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'

const ROOT = normalize(join(import.meta.dirname, '..', '..'))
const APP_PORT = 4173
const VENDOR_PORT = 4174
const VENDOR = `http://127.0.0.1:${VENDOR_PORT}`
// Stands in for "something unique to your own policy". The harness passes it as ownPolicy.
const OWN_MARKER = 'https://own-marker.invalid'

// Our own policy: allows the vendor everywhere it is used.
const OWN = [
  "default-src 'self'",
  "script-src 'self'",
  `script-src-elem 'self' ${VENDOR}`,
  `style-src 'self' ${VENDOR}`,
  `img-src 'self' ${VENDOR}`,
  `connect-src 'self' ${VENDOR} ${OWN_MARKER}`,
].join('; ')

// A second policy, as a browser extension or corporate proxy would add. Blocks the vendor.
const FOREIGN = ["script-src-elem 'self'", "style-src 'self'", "img-src 'self'", "connect-src 'self'"].join('; ')

// Our own policy, but it forgot the vendor.
const OWN_WITHOUT_VENDOR = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  `connect-src 'self' ${OWN_MARKER}`,
].join('; ')

const STRICT = `${OWN}; require-trusted-types-for 'script'; trusted-types 'none'`

const POLICIES: Record<string, string[]> = {
  allowed: [OWN],
  foreign: [OWN, FOREIGN],
  'own-blocks': [OWN_WITHOUT_VENDOR],
  strict: [STRICT],
}

const TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

const VENDOR_ASSETS: Record<string, { body: string; type: string }> = {
  '/pixel.svg': { body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>', type: TYPES['.svg'] },
  '/widget.css': { body: 'html {}\n', type: TYPES['.css'] },
  '/widget.js': { body: 'globalThis.vendorWidgetLoaded = true\n', type: TYPES['.js'] },
}

function pageHtml(script: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>web-res-canary test page</title>',
    `<script type="module" src="/fixtures/${script}.js"></script>`,
    '</head>',
    '<body></body>',
    '</html>',
    '',
  ].join('\n')
}

async function sendFile(res: ServerResponse, relativePath: string): Promise<void> {
  const path = normalize(join(ROOT, relativePath))
  if (!path.startsWith(ROOT + sep)) {
    res.writeHead(403).end()
    return
  }
  try {
    const body = await readFile(path)
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
}

createServer((req, res) => {
  const { pathname, searchParams } = new URL(req.url ?? '/', `http://127.0.0.1:${APP_PORT}`)
  if (pathname === '/health') {
    res.end('ok')
    return
  }
  if (pathname === '/page') {
    const policy = POLICIES[searchParams.get('csp') ?? 'allowed']
    const script = searchParams.get('script') ?? 'harness'
    if (!policy || !/^[a-z-]+$/.test(script)) {
      res.writeHead(400).end('bad csp or script')
      return
    }
    // An array value sends one header line per policy; the browser enforces every one.
    res.writeHead(200, { 'content-security-policy': policy, 'content-type': TYPES['.html'] })
    res.end(pageHtml(script))
    return
  }
  if (pathname.startsWith('/fixtures/')) {
    void sendFile(res, `test/browser${pathname}`)
    return
  }
  if (pathname.startsWith('/dist/') || pathname.startsWith('/examples/')) {
    void sendFile(res, pathname.slice(1))
    return
  }
  res.writeHead(404).end()
}).listen(APP_PORT, '127.0.0.1')

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', VENDOR)
  // Never answers: stands in for a firewall that silently drops the request.
  if (pathname === '/hang') return
  const asset = VENDOR_ASSETS[pathname]
  if (!asset) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': asset.type })
  res.end(asset.body)
}).listen(VENDOR_PORT, '127.0.0.1')
```

- [ ] **Step 5: Create the stylesheet fixture and its global type**

`test/browser/fixtures/sheet-check.js` — no package code involved; it isolates the browser behaviour the element relies on:

```js
// Does a constructed stylesheet adopted by a shadow root apply under style-src 'self'
// (no 'unsafe-inline') and Trusted Types? The element depends on the answer being yes.
const violations = []
document.addEventListener('securitypolicyviolation', event => {
  violations.push(`${event.effectiveDirective} ${event.blockedURI}`)
})

class SheetCheck extends HTMLElement {
  constructor() {
    super()
    const sheet = new CSSStyleSheet()
    sheet.replaceSync('.box { padding-left: 17px; }')
    const root = this.attachShadow({ mode: 'open' })
    root.adoptedStyleSheets = [sheet]
    const box = document.createElement('div')
    box.className = 'box'
    box.textContent = 'box'
    root.append(box)
  }
}

customElements.define('sheet-check', SheetCheck)
document.body.append(document.createElement('sheet-check'))

globalThis.sheetCheck = {
  paddingLeft: () =>
    getComputedStyle(document.querySelector('sheet-check').shadowRoot.querySelector('.box')).paddingLeft,
  violations,
}
```

`test/browser/globals.d.ts`:

```ts
declare global {
  var sheetCheck: { paddingLeft(): string; violations: string[] }
}

export {}
```

- [ ] **Step 6: Write the browser test**

`test/browser/stylesheet.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

// Module scripts run before the load event that goto() waits for, so the fixture is ready.
// Only page.evaluate is used: it goes through the automation protocol, not the page's (blocked) eval.
test('constructed stylesheets apply under a strict style-src and Trusted Types', async ({ page }) => {
  await page.goto('/page?csp=strict&script=sheet-check')
  const result = await page.evaluate(() => ({ padding: sheetCheck.paddingLeft(), violations: sheetCheck.violations }))
  expect(result.violations).toEqual([])
  expect(result.padding).toBe('17px')
})
```

- [ ] **Step 7: Run it in all three engines**

Run: `pnpm test:browser`
Expected: `3 passed` (chromium, firefox, webkit).

If `violations` is non-empty, read each entry before concluding anything: a `style-src` entry means the constructed sheet was blocked; a `script-src`/`trusted-types` entry with `blockedURI` `eval` would come from the test tooling, not the stylesheet — report that separately.

**If any engine fails because of the stylesheet, stop here and report the failing engine and its output to the maintainer.** The fallback (a `nonce` property applied to a `<style>` element, spec §7) changes the element's design and needs their approval before Task 6.

- [ ] **Step 8: Lint, format, type-check**

Run: `pnpm format && pnpm format:check && pnpm lint && pnpm typecheck`
Expected: all exit 0. `pnpm format` may reformat the Markdown docs; that is expected.

- [ ] **Step 9: Hand off for commit**

Tell the maintainer the changed files and propose: `chore: scaffold tooling and verify constructed stylesheets under strict CSP`. Do not run git.

---

### Task 2: Origin matching

**Files:**

- Create: `vitest.config.ts`, `src/origins.ts`
- Modify: `package.json` (add `test` script), `tsconfig.json` (`types`)
- Test: `test/unit/origins.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `type OriginPattern = { host: string; port: string; scheme: string; wildcard: boolean }`, `parseOriginPattern(origin: string): OriginPattern` (throws `TypeError` whose message contains `invalid origin`), `matchesOrigin(url: string, pattern: OriginPattern): boolean` (never throws).

- [ ] **Step 1: Install Vitest and configure it**

Run: `pnpm add -D -E vitest@5.0.2 happy-dom@20.14.5`

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['test/unit/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
})
```

In `tsconfig.json`, change `"types": ["node"]` to `"types": ["node", "vitest/globals"]`.

In `package.json` `scripts`, add `"test": "vitest run"`.

- [ ] **Step 2: Write the failing test**

`test/unit/origins.test.ts`:

```ts
import { matchesOrigin, parseOriginPattern } from '../../src/origins.ts'

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

Run: `pnpm test test/unit/origins.test.ts`
Expected: FAIL — cannot resolve `../../src/origins.ts`.

- [ ] **Step 4: Implement `src/origins.ts`**

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
      `web-res-canary: invalid origin "${origin}". Use scheme://host[:port] with no path, e.g. "https://*.vendor.example".`,
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

Run: `pnpm test test/unit/origins.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Lint, format, type-check**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all exit 0.

- [ ] **Step 7: Hand off for commit**

Propose: `feat: parse and match CSP host-source origins`. Do not run git.

---

### Task 3: Public types, status precedence and dismissal storage

**Files:**

- Create: `src/types.ts`, `src/status.ts`, `src/dismissal.ts`
- Test: `test/unit/status.test.ts`, `test/unit/dismissal.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `src/types.ts`: `Status`, `BlockedReason`, `Probe`, `Feature`, `BlockedFeature`, `OwnPolicyViolation`, `Snapshot`, `CanaryStorage`, `CanaryOptions`, `Canary` (exact shapes below).
  - `raiseStatus(current: Status, next: Status): Status`
  - `blockedFeatures(features: readonly Feature[], statuses: Readonly<Record<string, Status>>): BlockedFeature[]`
  - `signatureOf(blocked: readonly BlockedFeature[]): string`
  - `type DismissalStore = { read(): string | null; write(signature: string): void }`
  - `createDismissalStore(option: CanaryStorage | null | undefined, key: string): DismissalStore`

- [ ] **Step 1: Create `src/types.ts`**

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
  /** Default: 'web-res-canary:dismissed'. */
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

`test/unit/status.test.ts`:

```ts
import { blockedFeatures, raiseStatus, signatureOf } from '../../src/status.ts'
import type { BlockedFeature, Feature, Status } from '../../src/types.ts'

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

`test/unit/dismissal.test.ts`:

```ts
import { createDismissalStore } from '../../src/dismissal.ts'
import type { CanaryStorage } from '../../src/types.ts'

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

Run: `pnpm test test/unit/status.test.ts test/unit/dismissal.test.ts`
Expected: FAIL — cannot resolve `../../src/status.ts` / `../../src/dismissal.ts`.

- [ ] **Step 4: Implement `src/status.ts`**

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

- [ ] **Step 5: Implement `src/dismissal.ts`**

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

- Create: `src/canary.ts`, `src/index.ts`
- Test: `test/unit/canary.test.ts`

**Interfaces:**

- Consumes: `parseOriginPattern`, `matchesOrigin`, `OriginPattern` (Task 2); `raiseStatus`, `blockedFeatures`, `signatureOf`, `createDismissalStore`, all types (Task 3).
- Produces: `createCanary(options: CanaryOptions): Canary`. Internal helpers Task 5 edits: `function compile(features: readonly Feature[]): Compiled[]` and the `start()` method.

- [ ] **Step 1: Write the failing test**

`test/unit/canary.test.ts`:

```ts
import { createCanary } from '../../src/canary.ts'
import type { Canary, CanaryOptions, CanaryStorage, Feature } from '../../src/types.ts'

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
    expect(data.get('web-res-canary:dismissed')).toBe('chat')

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

Run: `pnpm test test/unit/canary.test.ts`
Expected: FAIL — cannot resolve `../../src/canary.ts`.

- [ ] **Step 3: Implement `src/canary.ts`**

```ts
import { createDismissalStore } from './dismissal.ts'
import { matchesOrigin, parseOriginPattern, type OriginPattern } from './origins.ts'
import { blockedFeatures, raiseStatus, signatureOf } from './status.ts'
import type { Canary, CanaryOptions, Feature, Snapshot, Status } from './types.ts'

type Compiled = { feature: Feature; patterns: OriginPattern[] }

export function createCanary(options: CanaryOptions): Canary {
  const compiled = compile(options.features)
  const isOwnPolicy = toPolicyMatcher(options.ownPolicy)
  const dismissal = createDismissalStore(options.storage, options.storageKey ?? 'web-res-canary:dismissed')
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
        console.warn(`web-res-canary: report() was called with unknown feature id "${id}"`)
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
    if (ids.has(feature.id)) throw new TypeError(`web-res-canary: duplicate feature id "${feature.id}"`)
    ids.add(feature.id)
    if (feature.origins.length === 0) throw new TypeError(`web-res-canary: feature "${feature.id}" has no origins`)
    return { feature, patterns: feature.origins.map(origin => parseOriginPattern(origin)) }
  })
}

function toPolicyMatcher(ownPolicy: CanaryOptions['ownPolicy']): (policy: string) => boolean {
  if (typeof ownPolicy === 'string') {
    // An empty string is contained in every policy, which would silently classify every block as ours.
    if (ownPolicy.trim() === '') throw new TypeError('web-res-canary: ownPolicy must not be an empty string')
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
  throw new TypeError(
    'web-res-canary: ownPolicy is required (a string, RegExp or function that recognises your own CSP)',
  )
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

- [ ] **Step 4: Create `src/index.ts`**

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

- Create: `src/probes.ts`
- Modify: `src/canary.ts` (the `compile` function and the `start()` method)
- Test: `test/unit/probes.test.ts`; add a `describe('probes')` block to `test/unit/canary.test.ts`

**Interfaces:**

- Consumes: `Probe` (Task 3); `matchesOrigin` (Task 2); `compile`, `start()`, `setStatus` (Task 4).
- Produces: `runProbe(probe: Probe, timeoutMs: number, signal: AbortSignal): Promise<boolean>` — resolves `true` when reachable, `false` otherwise; never rejects.

- [ ] **Step 1: Write the failing probe tests**

`test/unit/probes.test.ts`:

```ts
import { runProbe } from '../../src/probes.ts'

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

- [ ] **Step 2: Add the integration tests to `test/unit/canary.test.ts`**

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

Run: `pnpm test test/unit/probes.test.ts test/unit/canary.test.ts`
Expected: FAIL — `probes.test.ts` cannot resolve `../../src/probes.ts`; in `canary.test.ts` the `probes` block fails (statuses stay `unknown`; no validation error thrown).

- [ ] **Step 4: Implement `src/probes.ts`**

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

- [ ] **Step 5: Wire probes into `src/canary.ts`**

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
    if (ids.has(feature.id)) throw new TypeError(`web-res-canary: duplicate feature id "${feature.id}"`)
    ids.add(feature.id)
    if (feature.origins.length === 0) throw new TypeError(`web-res-canary: feature "${feature.id}" has no origins`)
    const patterns = feature.origins.map(origin => parseOriginPattern(origin))
    const { probe } = feature
    if (probe && probe.type !== 'custom' && !patterns.some(pattern => matchesOrigin(probe.url, pattern))) {
      throw new TypeError(
        `web-res-canary: feature "${feature.id}" probes ${probe.url}, which is outside its origins, so the IT list would miss it`,
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

- Create: `src/ui/strings.ts`, `src/ui/styles.ts`, `src/ui/render.ts`
- Test: `test/unit/render.test.ts`, `test/unit/strings.test.ts`

**Interfaces:**

- Consumes: `BlockedFeature` (Task 3).
- Produces:
  - `type CanaryStrings = { cause; copied; copy; details; dismiss; itAsk; title }` (all `string`), `DEFAULT_STRINGS: Readonly<CanaryStrings>`, `resolveStrings(overrides: Partial<CanaryStrings> | null | undefined): CanaryStrings`
  - `canarySheet(): CSSStyleSheet` — one shared sheet, created on first call
  - `type RenderedCanary = { announce: HTMLElement; copy: HTMLButtonElement; details: HTMLDetailsElement; dismiss: HTMLButtonElement; origins: HTMLPreElement; root: HTMLElement }`
  - `renderCanary(items: readonly BlockedFeature[], strings: Readonly<CanaryStrings>, locale: string): RenderedCanary`
  - `originsText(items: readonly BlockedFeature[]): string`, `summaryText(items, strings, locale): string`

- [ ] **Step 1: Write the failing tests**

`test/unit/strings.test.ts`:

```ts
import { DEFAULT_STRINGS, resolveStrings } from '../../src/ui/strings.ts'

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

`test/unit/render.test.ts`:

```ts
import type { BlockedFeature } from '../../src/types.ts'
import { originsText, renderCanary, summaryText } from '../../src/ui/render.ts'
import { DEFAULT_STRINGS } from '../../src/ui/strings.ts'

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

Run: `pnpm test test/unit/strings.test.ts test/unit/render.test.ts`
Expected: FAIL — cannot resolve `../../src/ui/strings.ts` / `../../src/ui/render.ts`.

- [ ] **Step 3: Implement `src/ui/strings.ts`**

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

- [ ] **Step 4: Implement `src/ui/styles.ts`**

```ts
const CSS = `
:host {
  --_bg: var(--wrc-bg, #fffbeb);
  --_fg: var(--wrc-fg, #422006);
  --_border: var(--wrc-border, #f59e0b);
  --_accent: var(--wrc-accent, #b45309);
  display: block;
  font-family: var(--wrc-font, system-ui, sans-serif);
  font-size: 14px;
  line-height: 1.45;
}
:host([hidden]) {
  display: none;
}
@media (prefers-color-scheme: dark) {
  :host {
    --_bg: var(--wrc-bg, #2b1d0e);
    --_fg: var(--wrc-fg, #fdecc8);
    --_border: var(--wrc-border, #b45309);
    --_accent: var(--wrc-accent, #f59e0b);
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
  border-radius: var(--wrc-radius, 8px);
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

- [ ] **Step 5: Implement `src/ui/render.ts`**

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

### Task 7: The `<web-res-canary>` custom element

**Files:**

- Create: `src/ui/element.ts`, `src/element.ts`
- Test: `test/unit/element.test.ts`

**Interfaces:**

- Consumes: `Canary`, `BlockedFeature` (Task 3); `createCanary` (Task 4, tests only); `renderCanary`, `originsText`, `RenderedCanary`, `resolveStrings`, `CanaryStrings`, `canarySheet` (Task 6).
- Produces: `interface WebResCanaryElement extends HTMLElement { canary: Canary | undefined; items: readonly BlockedFeature[] | undefined; strings: Partial<CanaryStrings>; variant: CanaryVariant }`, `type CanaryVariant = 'banner' | 'inline'`, `type CanaryDismissDetail = { ids: string[] }`, `type CanaryCopyDetail = { copied: boolean; text: string }`, `defineCanaryElement(tagName?: string): void`, `mountBanner(canary: Canary): WebResCanaryElement`; global `HTMLElementTagNameMap['web-res-canary']` and `HTMLElementEventMap` entries for `canary-dismiss` / `canary-copy`.

- [ ] **Step 1: Write the failing test**

`test/unit/element.test.ts`:

```ts
import { createCanary } from '../../src/canary.ts'
import type { BlockedFeature, Canary, Feature } from '../../src/types.ts'
import { defineCanaryElement, mountBanner, type WebResCanaryElement } from '../../src/ui/element.ts'

defineCanaryElement()

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

function mount(
  setup: (element: WebResCanaryElement) => void,
  parent: HTMLElement = document.body,
): WebResCanaryElement {
  const element = document.createElement('web-res-canary')
  setup(element)
  parent.append(element)
  return element
}

function part<T extends Element = HTMLElement>(element: HTMLElement, name: string): T {
  return element.shadowRoot?.querySelector(`[part="${name}"]`) as T
}

afterEach(() => document.body.replaceChildren())

describe('<web-res-canary>', () => {
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
    element.addEventListener('canary-dismiss', event => onDismiss(event.detail))
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
    element.addEventListener('canary-dismiss', event => event.preventDefault())
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
    element.addEventListener('canary-copy', event => onCopy(event.detail))
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
    element.addEventListener('canary-copy', event => onCopy(event.detail))
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
    const early = document.createElement('late-canary') as WebResCanaryElement
    early.canary = canaryWith('chat')
    early.variant = 'banner'
    document.body.append(early)
    defineCanaryElement('late-canary')
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

  it('defineCanaryElement ignores a tag that is already defined', () => {
    expect(() => defineCanaryElement()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test test/unit/element.test.ts`
Expected: FAIL — cannot resolve `../../src/ui/element.ts`.

- [ ] **Step 3: Implement `src/ui/element.ts`**

```ts
import type { BlockedFeature, Canary } from '../types.ts'
import { originsText, renderCanary, type RenderedCanary } from './render.ts'
import { resolveStrings, type CanaryStrings } from './strings.ts'
import { canarySheet } from './styles.ts'

export type CanaryVariant = 'banner' | 'inline'

export type CanaryDismissDetail = { ids: string[] }

export type CanaryCopyDetail = { copied: boolean; text: string }

export interface WebResCanaryElement extends HTMLElement {
  /** Uncontrolled source: the element subscribes to it and dismisses through it. */
  canary: Canary | undefined
  /** Controlled source: when set, the element renders exactly these and ignores `canary`. */
  items: readonly BlockedFeature[] | undefined
  strings: Partial<CanaryStrings>
  variant: CanaryVariant
}

declare global {
  interface HTMLElementTagNameMap {
    'web-res-canary': WebResCanaryElement
  }
  interface HTMLElementEventMap {
    'canary-copy': CustomEvent<CanaryCopyDetail>
    'canary-dismiss': CustomEvent<CanaryDismissDetail>
  }
}

const DEFAULT_TAG = 'web-res-canary'
const PROPERTIES = ['canary', 'items', 'strings', 'variant'] as const
const NOTHING: readonly BlockedFeature[] = []

export function defineCanaryElement(tagName: string = DEFAULT_TAG): void {
  if (typeof customElements === 'undefined' || customElements.get(tagName)) return
  customElements.define(tagName, createElementClass())
}

/** Inserts an uncontrolled banner as the first element of <body> (after DOMContentLoaded if needed). */
export function mountBanner(canary: Canary): WebResCanaryElement {
  defineCanaryElement()
  const element = document.createElement(DEFAULT_TAG)
  element.variant = 'banner'
  element.canary = canary
  if (document.body) document.body.prepend(element)
  else document.addEventListener('DOMContentLoaded', () => document.body.prepend(element), { once: true })
  return element
}

// Built on demand so importing this module where HTMLElement doesn't exist (a server) is safe.
function createElementClass(): CustomElementConstructor {
  return class WebResCanary extends HTMLElement implements WebResCanaryElement {
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
        new CustomEvent<CanaryCopyDetail>('canary-copy', {
          bubbles: true,
          cancelable: true,
          composed: true,
          detail: { copied, text },
        }),
      )
    }

    #dismiss(items: readonly BlockedFeature[]): void {
      const event = new CustomEvent<CanaryDismissDetail>('canary-dismiss', {
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

- [ ] **Step 4: Create the element entry `src/element.ts`**

```ts
import { defineCanaryElement } from './ui/element.ts'

defineCanaryElement()

export { defineCanaryElement, mountBanner } from './ui/element.ts'
export type { CanaryCopyDetail, CanaryDismissDetail, CanaryVariant, WebResCanaryElement } from './ui/element.ts'
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

Propose: `feat: add the <web-res-canary> custom element`. Do not run git.

---

### Task 8: Build, package entry points, size budget and the server-import check

**Files:**

- Create: `tsdown.config.ts`, `.size-limit.json`, `test/ssr.ts`
- Modify: `package.json` (fields and scripts)

**Interfaces:**

- Consumes: `src/index.ts`, `src/element.ts` (Tasks 4 and 7).
- Produces: `dist/index.js`, `dist/index.d.ts`, `dist/element.js`, `dist/element.d.ts` (+ source maps) — Task 9's harness imports `/dist/index.js` and `/dist/element.js`.

- [ ] **Step 1: Install the build tools**

Run: `pnpm add -D -E tsdown@0.23.0 size-limit@14.1.0 @size-limit/preset-small-lib@14.1.0`

- [ ] **Step 2: Create `tsdown.config.ts`**

```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: true,
  entry: ['src/index.ts', 'src/element.ts'],
  format: 'esm',
  platform: 'browser',
  sourcemap: true,
})
```

(`.d.ts` files are generated through `isolatedDeclarations`, so TypeScript 7's missing JS API is not a problem.)

- [ ] **Step 3: Add the package fields and scripts to `package.json`**

Add these top-level fields (oxfmt's `sortPackageJson` orders them):

```json
  "sideEffects": ["./dist/element.js"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./element": {
      "types": "./dist/element.d.ts",
      "default": "./dist/element.js"
    },
    "./package.json": "./package.json"
  },
  "types": "./dist/index.d.ts",
  "files": ["dist"],
```

Add these scripts:

```json
    "build": "tsdown",
    "prepack": "pnpm build",
    "size": "size-limit",
    "test:ssr": "node test/ssr.ts",
```

- [ ] **Step 4: Create `.size-limit.json`**

```json
[
  { "name": "core", "path": "dist/index.js", "limit": "2 KB", "gzip": true },
  { "name": "element (with everything it imports)", "path": "dist/element.js", "limit": "4 KB", "gzip": true }
]
```

- [ ] **Step 5: Write the server-import check**

`test/ssr.ts`:

```ts
// Imports the built package in plain Node (no DOM) to prove neither entry point touches
// window, document or customElements at import time. Run after `pnpm build`.
import assert from 'node:assert/strict'

assert.equal(typeof globalThis.document, 'undefined')

const core = await import(new URL('../dist/index.js', import.meta.url).href)
const element = await import(new URL('../dist/element.js', import.meta.url).href)

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
element.defineCanaryElement()

console.log('ssr: ok')
```

- [ ] **Step 6: Run the check before building to verify it fails**

Run: `rm -rf dist && pnpm test:ssr`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `dist/index.js`.

- [ ] **Step 7: Build and run the checks**

Run: `pnpm build`
Expected: `dist/index.js`, `dist/index.d.ts`, `dist/element.js`, `dist/element.d.ts` (and `.map` files) listed; `Build complete`.

Run: `pnpm test:ssr`
Expected: prints `ssr: ok`, exit 0.

Run: `pnpm size`
Expected: both entries under their limits (core ≤ 2 KB, element ≤ 4 KB), exit 0. If either is over, stop and report the numbers to the maintainer rather than raising the limit.

Run: `grep -c "HTMLElementTagNameMap" dist/element.d.ts`
Expected: `1` or more — the global JSX-free typing for `document.createElement('web-res-canary')` ships with the types.

- [ ] **Step 8: Check what npm would publish**

Run: `pnpm pack && tar -tzf web-res-canary-0.0.0.tgz && rm web-res-canary-0.0.0.tgz`
Expected: `package/package.json`, `package/README.md`, `package/LICENSE`, and `package/dist/` with `index.js`, `index.d.ts`, `element.js`, `element.d.ts` and their maps. Nothing from `src/`, `test/`, `docs/` or `examples/`.

- [ ] **Step 9: Lint, format, type-check, unit tests**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all exit 0.

- [ ] **Step 10: Hand off for commit**

Propose: `build: package entry points, size budget and server-import check`. Do not run git.

---

### Task 9: Real-browser scenarios in three engines

**Files:**

- Create: `test/browser/fixtures/harness.js`, `test/browser/scenarios.spec.ts`
- Modify: `test/browser/globals.d.ts`, `package.json` (`test:browser` script)

**Interfaces:**

- Consumes: the fixture server and policies (Task 1); `dist/index.js` → `createCanary`, `dist/element.js` → `mountBanner` (Task 8).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Make the browser tests build first**

In `package.json`, change `"test:browser": "playwright test"` to `"test:browser": "pnpm build && playwright test"`.

- [ ] **Step 2: Create the harness**

`test/browser/fixtures/harness.js`:

```js
import { createCanary } from '/dist/index.js'
import { mountBanner } from '/dist/element.js'

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
    const element = document.querySelector('web-res-canary')
    return element && !element.hidden ? element.shadowRoot.textContent : null
  },
  bannerPadding() {
    const root = document.querySelector('web-res-canary')?.shadowRoot?.querySelector('[part="root"]')
    return root ? getComputedStyle(root).paddingLeft : null
  },
}
```

- [ ] **Step 3: Type the harness global**

Replace `test/browser/globals.d.ts` with:

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

`test/browser/scenarios.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

const VENDOR = 'http://127.0.0.1:4174'

// The harness is a module script, which runs before the load event goto() waits for.
// Only page.evaluate is used: it goes through the automation protocol, not the page's (blocked) eval.
async function open(page: Page, csp: 'allowed' | 'foreign' | 'own-blocks' | 'strict'): Promise<void> {
  await page.goto(`/page?csp=${csp}`)
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

If one engine fails a scenario, read its failure before changing code. The two known ways a real engine can differ from the others here: it may report `blockedURI` as an origin rather than a full URL (still matches, since matching ignores the path), or it may not fire `error` on a preload link blocked by CSP (the violation event still classifies it). Fix the package only if its behaviour contradicts the spec; otherwise report the engine difference to the maintainer.

- [ ] **Step 6: Lint, format, type-check**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all exit 0.

- [ ] **Step 7: Hand off for commit**

Propose: `test: cover real-browser scenarios in Chromium, Firefox and WebKit`. Do not run git.

---

### Task 10: README, examples and CI

**Files:**

- Create: `examples/vanilla/index.html`, `examples/vanilla/main.js`, `examples/react/app.tsx`, `.github/workflows/ci.yml`
- Modify: `README.md` (replace), `tsconfig.json` (`jsx`, `paths`, `include`), `package.json` (dev deps)

**Interfaces:**

- Consumes: the public API from `web-res-canary` and `web-res-canary/element` (Tasks 4–8).
- Produces: nothing for later tasks.

- [ ] **Step 1: Type-check the React example against the source**

Run: `pnpm add -D -E react@19.3.0 @types/react@19.3.0`

In `tsconfig.json` `compilerOptions`, add:

```json
    "jsx": "react-jsx",
    "paths": {
      "web-res-canary": ["./src/index.ts"],
      "web-res-canary/element": ["./src/element.ts"]
    },
```

and change `"include": ["src", "test"]` to `"include": ["src", "test", "examples"]`.

- [ ] **Step 2: Create `examples/react/app.tsx`**

```tsx
import { useCallback, useSyncExternalStore, type DetailedHTMLProps, type HTMLAttributes, type JSX } from 'react'
import { createCanary, type BlockedFeature, type Canary } from 'web-res-canary'
import 'web-res-canary/element'
import type { WebResCanaryElement } from 'web-res-canary/element'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'web-res-canary': DetailedHTMLProps<HTMLAttributes<WebResCanaryElement>, WebResCanaryElement> & {
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
    (element: WebResCanaryElement | null) => {
      if (!element) return
      element.items = items
      const onDismiss = (): void => canary.dismiss()
      element.addEventListener('canary-dismiss', onDismiss)
      return () => element.removeEventListener('canary-dismiss', onDismiss)
    },
    [items],
  )
  return <web-res-canary ref={ref} variant="banner" />
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

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 3: Create the vanilla example**

`examples/vanilla/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>web-res-canary — vanilla example</title>
    <script type="module" src="./main.js"></script>
  </head>
  <body>
    <h1>web-res-canary</h1>
    <p>This page probes a host that never resolves, so the banner appears above this heading.</p>
  </body>
</html>
```

`examples/vanilla/main.js`:

```js
// Served by the test server after `pnpm build`. In your app, import from 'web-res-canary'
// and 'web-res-canary/element' instead of /dist.
import { createCanary } from '/dist/index.js'
import { mountBanner } from '/dist/element.js'

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

Run: `pnpm build && node test/browser/server.ts`, then open `http://127.0.0.1:4173/examples/vanilla/index.html`.
Expected: within a few seconds a banner reading "Some features couldn't load: Support chat." appears at the top; **Details** lists "Support chat — The support chat bubble won't appear." and `https://widget.chat.invalid`; **Copy for IT** changes to "Copied"; **×** hides it. Stop the server with Ctrl+C.

- [ ] **Step 4: Replace `README.md`**

````markdown
# web-res-canary

Tell users when their browser or network blocks the third-party resources your web app depends on — and give their IT team the exact addresses to allow.

Your own Content Security Policy (CSP) allows your support chat, your e-signature SDK, your CDN. Some users still can't load them: a browser extension adds a stricter CSP, a corporate proxy injects one, or an ad blocker or firewall drops the request. Your app isn't told; the user just sees something missing. `web-res-canary` notices, explains what won't work, and hands them the allowlist.

- **Zero dependencies.** Core ≤ 2 KB, element ≤ 4 KB (gzip).
- **Works under the strictest CSP**, including Trusted Types.
- **Any framework or none:** a headless core plus a `<web-res-canary>` custom element.

## Install

```sh
npm install web-res-canary
```

## Quick start

Call `start()` as early as possible — before you load any third-party script.

```js
import { createCanary } from 'web-res-canary'
import { mountBanner } from 'web-res-canary/element'

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

## How it detects a block

| Signal                                                                                          | Status        | Shown to the user?                                   |
| ----------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------- |
| A CSP violation from a policy that is **not** yours (extension, proxy)                          | `foreign-csp` | yes                                                  |
| A `<script>`, `<img>`, `<link>`, `<video>`, `<audio>` or `<source>` from a feature origin fails | `load-failed` | yes                                                  |
| A startup probe fails or doesn't answer within `probeTimeoutMs`                                 | `load-failed` | yes                                                  |
| `canary.report(id)` — for WebRTC, `fetch`, anything else                                        | `load-failed` | yes                                                  |
| A CSP violation from **your own** policy                                                        | `own-csp`     | no — `onOwnPolicyViolation` is called: it's your bug |

A status only moves up (`unknown → ok → load-failed → foreign-csp → own-csp`), so the most specific reason wins whatever order events arrive in.

### Choosing `ownPolicy`

Browsers give a page no way to read its own CSP headers, so the canary recognises yours inside each violation's `originalPolicy`. Pass a string that only your policy contains (your API host works well), a `RegExp`, or a function `(policy) => boolean`. It is required: without it, every CSP block would be ambiguous.

### Features

| field     | meaning                                                                                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | Stable id, used by `report()` and to remember dismissal.                                                                                                                                      |
| `label`   | Short name shown to the user.                                                                                                                                                                 |
| `impact`  | One sentence on what won't work.                                                                                                                                                              |
| `origins` | CSP host-source syntax: `https://host`, `https://*.host`, `wss://host:8443`. No paths. Also the list IT is asked to allow.                                                                    |
| `probe`   | Optional startup check: `script` or `style` (preloads, never runs it), `image`, `fetch` (`no-cors`; needs the origin in your `connect-src`), or `custom` (`run(signal) => Promise<boolean>`). |

## The element

```js
import 'web-res-canary/element' // defines <web-res-canary>
```

- **Uncontrolled:** `element.canary = canary`. It subscribes and dismisses itself.
- **Controlled:** `element.items = snapshot.blocked`. It renders only what you give it and fires `canary-dismiss` (`detail.ids`) and `canary-copy` (`detail.text`, `detail.copied`); your code owns the state.
- `variant="banner"` is a full-width strip; `variant="inline"` (default) is a card.
- `element.strings = { title: '…' }` overrides any text: `title`, `cause`, `details`, `itAsk`, `copy`, `copied`, `dismiss`.
- `defineCanaryElement('my-tag')` registers it under another name.

Both events bubble, cross shadow boundaries and are cancelable; `preventDefault()` on `canary-dismiss` skips the uncontrolled dismiss.

### React 19

React 19 supports custom elements natively. See [`examples/react/app.tsx`](examples/react/app.tsx) for controlled mode and for a fully custom UI with `useSyncExternalStore(canary.subscribe, canary.getSnapshot)`.

### Theming

Shadow DOM keeps your page's CSS out, so style it through custom properties and parts:

```css
web-res-canary {
  --wrc-bg: #fff7ed;
  --wrc-fg: #1f2937;
  --wrc-border: #fb923c;
  --wrc-accent: #c2410c;
  --wrc-radius: 12px;
  --wrc-font: inherit;
}
web-res-canary::part(copy) {
  font-weight: 600;
}
```

Parts: `root`, `summary`, `title`, `details`, `list`, `origins`, `copy`, `dismiss`.

## API

```ts
createCanary(options): Canary

canary.start()        // listeners + probes; idempotent
canary.stop()         // detach; ignore pending probe results
canary.report(id)     // mark a feature load-failed
canary.dismiss()      // hide until the list of blocked features changes
canary.subscribe(fn)  // returns unsubscribe
canary.getSnapshot()  // { blocked, dismissed, statuses }
```

Options: `features`, `ownPolicy` (required), `onChange`, `onOwnPolicyViolation`, `storage` (default `localStorage`; `null` = this page only), `storageKey` (default `web-res-canary:dismissed`), `probeTimeoutMs` (default `15000`; `0` disables).

## Limitations

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

- [ ] **Step 5: Create `.github/workflows/ci.yml`**

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
      - run: pnpm exec playwright install --with-deps chromium firefox webkit
      - run: pnpm test:browser
```

Publishing to npm stays manual and maintainer-approved (spec §8); this workflow never publishes.

- [ ] **Step 6: Run the full check locally**

Run: `pnpm format && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build && pnpm size && pnpm test:ssr && pnpm test:browser`
Expected: every command exits 0.

Ask the maintainer for their list of private company, customer and vendor names (never write that list into this repo), then run `grep -rniE "<name1>|<name2>|…" --exclude-dir=node_modules --exclude-dir=.git . || echo clean`.
Expected: `clean`.

- [ ] **Step 7: Hand off for commit**

Propose: `docs: add README, examples and CI`. Do not run git.
