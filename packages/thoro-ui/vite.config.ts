import { defineConfig } from 'vite-plus'

// The package's Vite+ config: `test` and `pack`. fmt and lint live in the root config.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    // Vitest's default pattern would also pick up the Playwright specs in test/browser.
    include: ['test/unit/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    setupFiles: ['test/unit/setup-react.ts'],
    unstubGlobals: true,
  },
  pack: {
    dts: true,
    // The keys set the output paths. A plain list would name files after their path below the common
    // folder (src/res-canary/), giving dist/index.js instead of dist/res-canary/index.js.
    entry: {
      'res-canary/index': 'src/res-canary/index.ts',
      'res-canary/element': 'src/res-canary/element.ts',
      'res-canary/react': 'src/res-canary/react.ts',
    },
    format: 'esm',
    platform: 'browser',
    sourcemap: true,
    // The bundler warns that a module directive may not survive bundling; 'use client' does (test/ssr.ts
    // checks the first line of dist/res-canary/react.js), so the warning is noise.
    suppressWarnings: ['module level directive "use client"'],
  },
})
