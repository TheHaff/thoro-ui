import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'test/browser',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'node test/browser/server.ts',
    url: 'http://127.0.0.1:4173/health',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', testIgnore: /tracking-protection/, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testIgnore: /tracking-protection/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testIgnore: /tracking-protection/, use: { ...devices['Desktop Safari'] } },
    {
      name: 'firefox-tracking-protection',
      testMatch: /tracking-protection\.spec\.ts/,
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: {
            'privacy.trackingprotection.enabled': true,
            'urlclassifier.trackingTable': 'moztest-track-simple',
          },
        },
      },
    },
  ],
})
