import { expect, test } from '@playwright/test'

// Runs only in the firefox-tracking-protection project (playwright.config.ts), which turns on Firefox's
// tracking protection with the test table Firefox ships for its own tests.
const TRACKER = 'http://trackertest.org'

test('an eager check of a host tracking protection blocks → load-failed', async ({ page }) => {
  // If tracking protection did not block the check, this route would answer it and the check would pass.
  let reached = false
  await page.route(`${TRACKER}/**`, route => {
    reached = true
    return route.fulfill({ body: '', status: 200 })
  })
  await page.goto('/page?csp=trackers&script=res-canary-harness')
  await page.evaluate(origins => harness.start({ lazy: false, origins }), [TRACKER])
  await expect.poll(() => page.evaluate(() => harness.status())).toBe('load-failed')
  expect(reached).toBe(false)
})
