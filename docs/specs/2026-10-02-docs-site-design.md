# thoro-ui docs site — design

- **Status:** approved by the maintainer, 2026-10-02. Not yet implemented.
- **Address:** `https://thehaff.github.io/thoro-ui/` (GitHub Pages, deployed from `main` by GitHub Actions).
- **Builds on:** the collection spec [`2026-10-01-thoro-ui-design.md`](2026-10-01-thoro-ui-design.md) and the component specs it links. The site documents what those specs define; it adds no behaviour to the package.

## Goal

A short, calm documentation site that a person with ADHD can scan and act on: what thoro-ui is, how to install it, and — per component — a live demo, a quick start and the reference, each in a few lines.

## Decisions

| decision                                                | why                                                                                                                | rejected                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Hand-made HTML pages built with Vite (`vp build`)       | Full control over a short layout; the live demo imports the real package; no new framework (Vite is already here). | VitePress (a framework and a busier look); GitHub's Jekyll (no live demo). |
| Home page + one page per component                      | Every page stays short; a new component adds a page.                                                               | One long page.                                                             |
| The logo's "T" mark as an image, "thoro-ui" set as text | The logo's white "thoro-" vanishes on light backgrounds; text reads in both themes.                                | The full logo image everywhere.                                            |
| A strict CSP `<meta>` on every built page               | The docs prove the package's strict-CSP claim on themselves.                                                       | No CSP (GitHub Pages can't send headers, so `<meta>` is the only option).  |

## 1. Look and content

**Look**

- Logo: the "T" mark cropped from `logo.png` (`site/public/mark.png`, about 256 px wide, transparent) beside the text "thoro-**ui**" ("ui" in the logo's blue). Favicon: the same mark at 64 px.
- Colours: dark by default (near-black navy), with a light variant under `prefers-color-scheme: light`. Accents use the logo's cyan → blue → violet: links, focus rings, and one thin gradient line under each page title.
- Type: the system font stack — no web fonts. 17 px body, line length about 68 characters.

**ADHD rules every page follows**

1. Each section opens with one bold sentence saying what it's for.
2. Code before prose; every code block has a **Copy** button.
3. Lists have at most 5 items; paragraphs at most 3 sentences.
4. Alternatives are tabs (`Web component | React`), not two long blocks.
5. An "On this page" list stays in view; nothing is collapsed or hidden behind "read more".

**Home** (`/thoro-ui/`): mark + wordmark; one line — _Small, dependency-free web components for compliance-minded web apps._; `npm install thoro-ui` with Copy; component cards (today: **res-canary**); three principles (zero dependencies · strict-CSP safe · any framework or none); footer (MIT · GitHub · npm).

**Component page** (`/thoro-ui/res-canary/`), in this order:

1. One-line summary.
2. Live demo: the real `<thoro-res-canary>` from the built package, with buttons to block each of two example vendors, **Reset**, and a **Banner** toggle. Blocks are simulated with `report()`; the page makes no network requests for the demo.
3. Quick start, tabs `Web component | React`.
4. How it detects (the five-row table from the package README).
5. Options and props: core options, feature fields, element, React — compact tables.
6. Theming: the `--thoro-*` variables and a CSS example.
7. Limitations (six bullets).

Examples use `*.example` / `*.invalid` hosts only. No analytics, no third-party fonts, scripts or styles.

## 2. Build, deploy and checks

```
site/                      private workspace package; depends on "thoro-ui": "workspace:*"
  package.json             scripts: dev, build, preview, test:browser
  vite.config.ts           base '/thoro-ui/'; two HTML entries; assetsInlineLimit 0; CSP <meta> added at build
  playwright.config.ts     Chromium, against `vp preview`
  index.html               home
  res-canary/index.html    component page
  src/site.css             one stylesheet for every page
  src/main.js              Copy buttons and tabs (every page)
  src/demo.js              the live demo (component page)
  public/mark.png, favicon.png
  test/site.spec.ts        Playwright checks
```

- The site imports thoro-ui by package name, so it uses the built package. The root `pnpm build` (`vp run -r build`) builds the package before the site, because the site depends on it.
- Links between pages are relative (`res-canary/`, `../`), because Vite rewrites asset URLs to the base path but not anchors.
- Strict CSP: every built page gets `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; require-trusted-types-for 'script'; trusted-types 'none'` in a `<meta>` tag, added by a small build-only Vite plugin (the dev server injects inline styles and would break under it). The pages have no inline scripts or styles, and `assetsInlineLimit: 0` keeps images out of `data:` URLs.
- Copy buttons and tabs enhance plain HTML: without JavaScript every tab panel is visible and code can be selected by hand.
- Deploy: `.github/workflows/pages.yml` runs on pushes to `main` (and on demand): install, `pnpm build`, upload `site/dist` with `actions/upload-pages-artifact@v5`, publish with `actions/deploy-pages@v5` (permissions `pages: write`, `id-token: write`).
- **Maintainer's one-time step:** repo Settings → Pages → Source: **GitHub Actions**.
- Checks: CI already runs `pnpm build` (now including the site) and `pnpm test:browser` (now including the site's checks). The site's Playwright checks, in Chromium against the built site: both pages load with zero CSP violations; blocking a vendor in the demo shows the real banner; a Copy button copies its code block.
- READMEs (root and package) link to the site; the site links to GitHub and npm.

## Out of scope

Search, versioned docs, a blog, a social preview image, a custom domain.
