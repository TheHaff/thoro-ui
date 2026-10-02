import { expect, test } from '@playwright/test'

// The fixture is a module script, which runs before the load event goto() waits for; React renders
// and the stylesheet loads after that, so both are polled. Only page.evaluate is used (no page eval).
test('the React variant renders and styles itself under a strict CSP with Trusted Types', async ({ page }) => {
  await page.goto('/page?csp=strict&script=res-canary-react')
  await expect
    .poll(() => page.evaluate(() => reactHarness.bannerText()))
    .toContain("Some features couldn't load: Widget.")
  await expect.poll(() => page.evaluate(() => reactHarness.rootPadding())).toBe('16px')
  expect(await page.evaluate(() => reactHarness.violations)).toEqual([])
})
