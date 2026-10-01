# web-res-canary — agent guide

A zero-dependency browser package that detects when a user's browser or network blocks the third-party resources a web app depends on, plus a `<web-res-canary>` custom element that tells the user what won't work and gives their IT team the addresses to allow.

## Status

> **Renaming in progress (2026-10-01).** This repo is becoming **thoro-ui**: a collection of compliance-focused web components, published as one tree-shakeable package, with the canary as its first component (`<thoro-res-canary>`). The collection design is in [`docs/specs/2026-10-01-thoro-ui-design.md`](docs/specs/2026-10-01-thoro-ui-design.md) and the updated canary spec in [`docs/specs/2026-09-29-res-canary-design.md`](docs/specs/2026-09-29-res-canary-design.md); both await the maintainer's review of the written text. Until they are approved and the plan is rewritten, don't start the plan's Task 2, and don't rename files or code by hand. The rest of this guide still describes the single-package `web-res-canary` layout.

Design approved 2026-09-29. **Nothing is implemented yet** — the repo holds only `LICENSE`, `README.md` and the docs below.

- **Spec (source of truth):** [`docs/specs/2026-09-29-web-res-canary-design.md`](docs/specs/2026-09-29-web-res-canary-design.md)
- **Implementation plan:** [`docs/plans/2026-09-29-web-res-canary.md`](docs/plans/2026-09-29-web-res-canary.md) — 10 tasks, each with files, code, tests and commands. Do them in order, starting at Task 1. Task 1 checks the one risky assumption (constructed stylesheets under a strict CSP in all three engines) and stops if it fails.

If the plan and the spec disagree, the spec wins — flag the conflict to the maintainer instead of silently picking one. Don't reopen the decisions in spec §12 without a new reason.

## Rules

- **The maintainer makes every commit.** Never run `git add`, `git commit` or `git push`. End each task by listing the changed files and proposing a conventional commit message (`feat|fix|test|build|docs|chore: …`).
- **This repo is public.** Never write the names of companies, customers or vendors from the maintainer's other work into it — not in code, tests, docs or commit messages. Examples and tests use `*.example`, `*.invalid` and `127.0.0.1` hosts only.
- **Zero runtime dependencies.** Dev dependencies are pinned to exact versions (`pnpm add -D -E`). Use pnpm, never npm or yarn.
- **Everything in `src/` must run under the strictest CSP** (spec §8): constructed stylesheets only, DOM built with `createElement`/`createElementNS`/`textContent`, no `innerHTML`, no `eval`/`new Function`/string timers, no network requests other than configured probes.
- **Nothing touches `window`, `document` or `customElements` at import time.**
- **Don't raise the size budget** (core ≤ 2 KB, element ≤ 4 KB gzip) without the maintainer's agreement; trim first.
- **Publishing to npm is the maintainer's step.** Never run `npm publish` / `pnpm publish`.

## Commands

Available once the plan's Tasks 1, 2 and 8 have added them:

| command             | does                                                    |
| ------------------- | ------------------------------------------------------- |
| `pnpm lint`         | `vp lint` — oxlint, with type-aware rules               |
| `pnpm format`       | `vp fmt` — oxfmt, writes                                |
| `pnpm format:check` | `vp fmt --check` — oxfmt, check only                    |
| `pnpm typecheck`    | `tsc -p .` (TypeScript 7)                               |
| `pnpm test`         | `vp test` — Vitest unit tests (happy-dom)               |
| `pnpm build`        | `vp pack` — tsdown → `dist/`                            |
| `pnpm size`         | size-limit against the budget (run after `build`)       |
| `pnpm test:ssr`     | imports `dist/` in plain Node (run after `build`)       |
| `pnpm test:browser` | builds, then Playwright in Chromium, Firefox and WebKit |

First-time browser setup: `pnpm exec playwright install chromium firefox webkit`.

Tooling is Vite+ (`vite-plus`): the lint, format, test and pack configs are blocks in one `vite.config.ts`. Don't add `oxlint`, `oxfmt`, `vitest` or `tsdown` as dependencies or give them their own config files. Import test helpers from `vite-plus/test`, not `vitest`. `vp check` runs format and lint in one pass, but it is not the type check: it misses `isolatedDeclarations` errors that `pnpm typecheck` reports.

## Environment notes

Verified on 2026-09-29 in a throwaway check before the plan was written; the Vite+ switch was re-verified on 2026-09-30.

- **Node:** 24 locally and in CI (`.node-version`). Vite+ supports `^24.11 || >=26`, so Node 25 is out of range. Node runs `.ts` scripts natively (the Playwright fixture server, the server-import check): value imports need explicit extensions, and only erasable TypeScript syntax works (no `enum`, `namespace` or parameter properties).
- **TypeScript 7.0.2** is the native compiler and has no JS API. `.d.ts` files come from tsdown 0.23.0 through `isolatedDeclarations` — verified to emit both entry points' types. Consequences: every exported function and constant needs an explicit type, and `export default defineConfig(…)` fails under that flag, which is why config files are left out of `tsconfig.json`.
- **happy-dom 20.14.5:**
  - refuses to load `<script src>` ("JavaScript file loading is disabled") — unit tests use `<img>` for element failures; real script loading is covered by Playwright;
  - never fires `load`/`error` for preload links or images by itself — tests dispatch those events by hand, which keeps them deterministic;
  - supports constructed stylesheets and `adoptedStyleSheets`, upgrading an element whose properties were set before definition, `addEventListener`'s `signal` option, `Intl.ListFormat`, and `navigator.clipboard` (spy on `writeText`);
  - a synthetic `securitypolicyviolation` works as `new Event(…)` plus `Object.assign` for `blockedURI`, `originalPolicy`, `disposition` and `effectiveDirective`.
- **Playwright on strict-CSP pages:** the plan uses only `page.goto`, `page.evaluate` and `expect.poll`, and avoids `page.waitForFunction` as a precaution. If a strict-page test reports a `script-src`/`trusted-types` violation with `blockedURI` `eval`, suspect the test tooling before the package.
- **Playwright Firefox inside an agent sandbox (macOS):** Firefox exits at launch with "Could not find profile folder". It reads `~/Library/Application Support/Firefox` at startup even when given its own profile, and the Claude Code sandbox blocks that folder along with other browser profile folders. Chromium and WebKit are unaffected. Run `pnpm test:browser --project=firefox` from a normal terminal, or rely on CI. Don't widen the sandbox to that folder: it holds the user's real browser profile.
- **GitHub Actions** current majors at planning time: `actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`.

## Code style

- oxfmt: no semicolons, single quotes, 120 columns, trailing commas, `arrowParens: 'avoid'`.
- kebab-case file names; relative imports with explicit `.ts` extensions.
- Comments explain why, not what.
- Tests pin behaviour (state changes, derived text, events, error paths), not the mere presence of an element. Vitest globals are on — don't import `describe`, `it`, `expect` or `vi`.
