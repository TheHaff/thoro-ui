import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite-plus'

// The docs follow the package's own rule: they must work under the strictest CSP. GitHub Pages can't
// send headers, so the policy goes in a <meta> tag — at build time only, because the dev server
// injects inline styles that this policy blocks.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; require-trusted-types-for 'script'; trusted-types 'none'"

function strictCsp(): Plugin {
  return {
    name: 'strict-csp',
    apply: 'build',
    transformIndexHtml: html =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  }
}

export default defineConfig({
  base: '/thoro-ui/',
  plugins: [strictCsp()],
  build: {
    // data: URLs would need img-src data:, which the policy doesn't allow.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        'res-canary': resolve(import.meta.dirname, 'res-canary/index.html'),
      },
    },
  },
})
