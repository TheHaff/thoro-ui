import { defineConfig } from 'vite-plus'

// The package's Vite+ config: `test` and `pack`. fmt and lint live in the root config.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    // Vitest's default pattern would also pick up the Playwright specs in test/browser.
    include: ['test/unit/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
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
})
