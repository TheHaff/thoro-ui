import { defineConfig, devices } from '@playwright/test'

// Checks the built site as GitHub Pages will serve it (base /thoro-ui/). Chromium only: these guard
// the docs, not the package, which has its own three-engine tests.
export default defineConfig({
  testDir: 'test',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4180' },
  webServer: {
    command: 'vp preview --port 4180 --strictPort',
    url: 'http://localhost:4180/thoro-ui/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
