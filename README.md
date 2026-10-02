# thoro-ui

Small, dependency-free web components for compliance-minded web apps, published as one tree-shakeable npm package. The user guide is the package README: [`packages/thoro-ui`](packages/thoro-ui/README.md).

**Docs and live demo:** <https://thehaff.github.io/thoro-ui/>

## Components

| component    | what it does                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `res-canary` | Tells users when their browser or network blocks the third-party resources your app depends on, and gives their IT team the addresses to allow. Web component or native React. |

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
