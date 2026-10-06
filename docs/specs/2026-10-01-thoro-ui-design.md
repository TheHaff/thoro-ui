# thoro-ui — collection design

- **Status:** sections 1–4 approved 2026-10-01 and implemented 2026-10-02 with the canary. The React-variant rules (amended 2026-10-02) are implemented for the canary.
- **Package:** `@thoro/ui` on npm (renamed from `thoro-ui` on 2026-10-05, before the first publish; the maintainer owns the `@thoro` org). The project, the repo, the `packages/thoro-ui/` folder and the `thoro-ui:` storage keys keep the name thoro-ui, a play on "thorough".
- **What it is:** a collection of compliance-focused web components. The first is the resource canary, specified in [`2026-09-29-res-canary-design.md`](2026-09-29-res-canary-design.md).
- **License:** MIT

## Decisions so far

| decision                                                        | why                                                                                                                                                                                                                                        | rejected                                                                                                                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm workspace that publishes **one** package, `@thoro/ui`      | One version and one release for consumers; examples and a later docs site get their own dependencies inside the workspace.                                                                                                                 | A single package at the repo root (examples' React deps would sit in the library); a package per component (release overhead, a shared base becomes a runtime dependency or is duplicated).                               |
| Scoped npm name `@thoro/ui` (2026-10-05)                        | Only members of the `@thoro` org can publish under it, so every official package reads as `@thoro/…`; a later package that isn't browser UI becomes `@thoro/<name>`. Settled before the first publish, because npm can't rename a package. | Unscoped `thoro-ui` (anyone can publish look-alike `thoro-ui-*` names); plain `thoro` (spends the brand name on the UI package); a scoped package per component, such as `@thoro/res-canary` (rejected in the row above). |
| `thoro-` prefix for tags, CSS variables and storage keys        | Components in one collection read as one family and never collide with other libraries' tags.                                                                                                                                              | Keeping `<web-res-canary>` with per-component prefixes.                                                                                                                                                                   |
| This round covers collection conventions + the canary only      | Shared code is extracted when a second component needs it, not guessed in advance.                                                                                                                                                         | Sketching the next components now.                                                                                                                                                                                        |
| Optional native React variants as separate entries (2026-10-02) | React users get a native choice; everyone else never installs or ships React. Details in [`2026-10-02-res-canary-react-design.md`](2026-10-02-res-canary-react-design.md).                                                                 | Wrappers around the element; hooks only; runtime-injected CSS; supporting React 18.                                                                                                                                       |

## 1. Repo layout and packaging (approved)

```
thoro-ui/
├─ package.json            private root: workspace scripts, shared dev tooling
├─ pnpm-workspace.yaml     packages/*, examples/*
├─ vite.config.ts          fmt + lint for the whole repo
├─ AGENTS.md  CLAUDE.md  LICENSE  README.md
├─ docs/
│  ├─ specs/2026-10-01-thoro-ui-design.md     this document
│  ├─ specs/2026-09-29-res-canary-design.md   the canary spec, renamed and updated
│  └─ plans/…                                 plan rewritten for the new paths
├─ packages/thoro-ui/      the only published package
│  ├─ package.json         name "@thoro/ui", one export per component
│  ├─ vite.config.ts       test + pack blocks
│  ├─ tsconfig.json  playwright.config.ts  .size-limit.json
│  ├─ src/res-canary/      index.ts (core), element.ts, origins.ts, ui/…
│  └─ test/
│     ├─ unit/res-canary/
│     └─ browser/          server.ts (shared by all components), fixtures/, res-canary/*.spec.ts
└─ examples/vanilla, examples/react   private; depend on "@thoro/ui": "workspace:*"
```

Exports — one entry per component, no root entry:

```json
"exports": {
  "./res-canary":         { "types": "./dist/res-canary/index.d.ts",   "default": "./dist/res-canary/index.js" },
  "./res-canary/element": { "types": "./dist/res-canary/element.d.ts", "default": "./dist/res-canary/element.js" },
  "./res-canary/react":   { "types": "./dist/res-canary/react.d.ts",   "default": "./dist/res-canary/react.js" },
  "./res-canary/react.css": { "types": "./dist/res-canary/react.css.d.ts", "default": "./dist/res-canary/react.css" },
  "./package.json": "./package.json"
},
"sideEffects": ["./dist/*/element.js", "./dist/*/*.css"],
"peerDependencies": { "react": "^19.0.0" },
"peerDependenciesMeta": { "react": { "optional": true } }
```

- No barrel: importing `@thoro/ui` alone gives nothing, so the whole collection is never pulled in by accident.
- Every entry has a `types` condition, CSS included: an empty `react.css.d.ts` lets `import '@thoro/ui/<name>/react.css'` type-check under TypeScript's default `noUncheckedSideEffectImports` in apps that don't declare `*.css` themselves (added 2026-10-05).
- `"publishConfig": { "access": "public" }`: npm publishes scoped packages as private by default, so the first publish would fail without it.
- Only `*/element.js` files (they register the tag) and the CSS files have side effects; every core entry and every React entry is pure.
- React is an optional peer: only the `/react` entries import it (added 2026-10-02, §2).
- Shared internals (`src/shared/`, created when a second component needs one) become shared chunks that load only if an imported entry uses them.
- Size budgets stay per entry: canary core ≤ 2.5 KB, element ≤ 4 KB gzip.
- **To verify in the first implementation task:** `vp pack` writes nested entries as `dist/res-canary/index.js`, not as a flattened name.

## 2. Rules every component follows (approved)

**Names**

| what                 | rule                                                                                                         | canary                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| tag                  | `thoro-<name>`                                                                                               | `<thoro-res-canary>`                                                           |
| entry points         | `@thoro/ui/<name>/element` always; `@thoro/ui/<name>` only if the component has a part that works without UI | `@thoro/ui/res-canary` (`createCanary`), `@thoro/ui/res-canary/element`        |
| register another tag | `define<Name>Element(tag?)`; importing the element entry registers the default tag                           | `defineResCanaryElement('my-canary')` (was `defineCanaryElement`)              |
| events               | `<name>-<action>`, bubbling, composed, cancelable                                                            | `res-canary-dismiss`, `res-canary-copy` (were `canary-dismiss`, `canary-copy`) |
| saved state          | key `thoro-ui:<name>:<what>`; storage injectable; every read and write in `try/catch`                        | `thoro-ui:res-canary:dismissed`                                                |

Events use the component name rather than a shared `thoro-<action>`, because TypeScript's global `HTMLElementEventMap` allows one detail type per event name.

**Theming**

- Shared variables: `--thoro-bg`, `--thoro-fg`, `--thoro-border`, `--thoro-accent`, `--thoro-radius`, `--thoro-font`. Each component sets its own defaults as `var()` fallbacks (the canary keeps its amber palette and dark-mode variant).
- `:root { --thoro-accent: … }` themes the whole collection, because custom properties pass into shadow DOM; `thoro-res-canary { --thoro-bg: … }` themes one component. No per-component variable names.
- Each component lists its `::part()` names in its own spec.

**Text:** every component takes a `strings` property, a partial override of its English defaults. It formats lists for the nearest `lang` attribute and falls back to English when the `lang` value is invalid.

**React variants (optional per component, added 2026-10-02).** A component may also ship native React components:

- entries `@thoro/ui/<name>/react` and `@thoro/ui/<name>/react.css`; the React entry starts with `'use client'`;
- native React DOM, no custom element; classes `thoro-<name>` on the root, `thoro-<name>--<variant>` for variants, `thoro-<name>__<class>` inside, one for each class in the element's CSS;
- React `^19` as an optional peer dependency, imported by `/react` entries only;
- `react.css` is generated from the element's CSS, so element CSS uses class-only selectors (plus `:host` rules); a unit test pins that the React markup and the CSS use the same classes;
- the same core, strings and structure as the element; differences forced by React (no `preventDefault`, `lang` as a prop) are listed in the component's React spec;
- its own size budget, measured without React.

**Carried over from the canary spec, for every component:** zero runtime dependencies (React is an optional peer, only for `/react` entries); strict CSP and Trusted Types safe (canary spec §8); nothing touches `window`, `document` or `customElements` at import time; native controls, never steals focus, respects `prefers-reduced-motion`; a size budget set in the component's own spec and enforced in CI.

**Shared code** goes into `src/shared/` only when a second component needs it.

## 3. Tooling across the workspace (approved)

```
thoro-ui/
├─ package.json          private. devDeps: vite-plus, typescript, @types/node
├─ pnpm-workspace.yaml   packages/*, examples/*
├─ vite.config.ts        fmt + lint
├─ tsconfig.base.json    shared compiler options (strict, isolatedDeclarations, …)
├─ .node-version (24)  .gitignore
├─ packages/thoro-ui/
│  ├─ package.json       devDeps: @playwright/test, happy-dom, size-limit (+ preset), react, react-dom (+ types)
│  ├─ vite.config.ts     test + pack
│  ├─ tsconfig.json      extends ../../tsconfig.base.json
│  ├─ playwright.config.ts  .size-limit.json
│  └─ README.md  LICENSE    copies, because pnpm pack only ships this folder
└─ examples/
   ├─ vanilla/           a tiny Vite app: vp -C examples/vanilla dev
   └─ react/             devDeps: react, @types/react. Type-checked in CI
```

- **Dependencies:** shared tooling (Vite+, TypeScript, Node types) at the root, so the repo has one version of each; test-only tools in the package that uses them. React never appears in the library's dependencies.
- **Pack entries are an explicit map** — `{ 'res-canary/index': 'src/res-canary/index.ts', 'res-canary/element': 'src/res-canary/element.ts' }` — so the keys fix the output paths (`dist/res-canary/index.js`). Each new component adds its two lines.
- **Root scripts keep the AGENTS.md names.** `lint`, `format` and `format:check` run once at the root. `typecheck`, `test`, `build`, `size`, `test:ssr`, `test:types` and `test:browser` run as `vp run -r <name>` in every package that defines them. Vite+ does not cache `package.json` scripts by default, so results are never replayed.
- **Playwright, size-limit, the server-import check and the consumer type check live in `packages/thoro-ui`**, because they test the built package. The consumer type check (`test/types/`, added 2026-10-05) imports every entry by package name, so TypeScript resolves it through `exports` the way an app does; it sits outside the package tsconfig because it needs `dist/`. the fixture server serves that package's `dist/`.
- **The package keeps its own README (the npm page) and a copy of LICENSE**; the root README is a short repo overview.
- **React variants** (added 2026-10-02): the package tsconfig sets `jsx: react-jsx`; Vitest also runs `*.test.tsx`; the root lint config turns on oxlint's React rules for `.tsx` files through `lint.overrides`; the build writes each `react.css` from the element's CSS after `vp pack`; `test:browser` first bundles a small React fixture (git-ignored) for the strict-CSP scenario. React itself is a dev dependency of the package and a peer for consumers — never a dependency.
- **CI:** one job from the root — install, format check, lint, typecheck, test, build, size, server-import check, consumer type check, browsers.
- **To verify in the first implementation task:** `packages/thoro-ui/vite.config.ts` can import `vite-plus` from the root install, and `vp` resolves inside package scripts.

## 4. Migration from web-res-canary (approved)

The repo was copied from a standalone `web-res-canary` project whose plan had finished Task 1 (tooling scaffold and the strict-CSP stylesheet check), except for the Firefox run.

**Order**

1. The maintainer commits the copied files as they are, so history starts from the original spec, plan and Task 1 work, and the renames below show up as diffs.
2. This spec and the updated canary spec are written; the maintainer reviews both.
3. The plan is rewritten for the new layout; the maintainer reviews it and picks how it is executed.
4. The new plan's Task 1 restructures the repo (table below) and re-runs every check.
5. The maintainer deletes the old `web-res-canary` folder once satisfied.

**Canary spec:** renamed to [`2026-09-29-res-canary-design.md`](2026-09-29-res-canary-design.md), with a dated "Changed 2026-10-01" note listing every rename. Detection, the core API, statuses, probes and the size budget are unchanged.

**Plan:** `docs/plans/2026-09-29-web-res-canary.md` is replaced by `docs/plans/2026-10-01-res-canary.md`; the old one stays in git history. Its "Tooling amendment" and the Task 1 decisions (Vite+, `tsc` kept as the type check, pnpm 12, Node 24, sending the CSP header with `res.setHeader`) become normal plan text. Paths move to `packages/thoro-ui/…`, and code and tests use the new names.

**Where the existing Task 1 files go**

| now (repo root)                          | after the new Task 1                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `vite.config.ts`                         | stays at the root with `fmt` + `lint` only; `test` + `pack` go in `packages/thoro-ui/vite.config.ts`           |
| `tsconfig.json`                          | becomes root `tsconfig.base.json` plus `packages/thoro-ui/tsconfig.json`                                       |
| `package.json`                           | split into the private root (workspace scripts) and `packages/thoro-ui/package.json`                           |
| `playwright.config.ts`, `test/browser/*` | `packages/thoro-ui/`                                                                                           |
| `test/browser/stylesheet.spec.ts`        | stays directly in `test/browser/`, not under `res-canary/`: it proves the styling approach for every component |
| the fixture server's `/examples/` route  | removed; the vanilla example runs with `vp dev`                                                                |

**Also**

- AGENTS.md is rewritten for thoro-ui: per-component size budgets, the new layout and commands. The environment notes stay, including the Firefox sandbox note.
- The old plan's progress ledger is deleted; the new plan starts its own.
- The Firefox stylesheet check stays open. It runs from a normal terminal after the new Task 1.
