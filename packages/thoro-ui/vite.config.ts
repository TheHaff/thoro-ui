import { defineConfig } from 'vite-plus'

// The package's Vite+ config: `test` and (from Task 8) `pack`. fmt and lint live in the root config.
export default defineConfig({
  test: {
    // Vitest's default pattern would also pick up the Playwright specs in test/browser.
    include: ['test/unit/**/*.test.ts'],
  },
})
