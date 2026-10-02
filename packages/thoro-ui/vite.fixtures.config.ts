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
