import { expect, test } from '@playwright/test'

// Module scripts run before the load event that goto() waits for, so the fixture is ready.
// Only page.evaluate is used: it goes through the automation protocol, not the page's (blocked) eval.
test('constructed stylesheets apply under a strict style-src and Trusted Types', async ({ page }) => {
  await page.goto('/page?csp=strict&script=sheet-check')
  const result = await page.evaluate(() => ({ padding: sheetCheck.paddingLeft(), violations: sheetCheck.violations }))
  expect(result.violations).toEqual([])
  expect(result.padding).toBe('17px')
})
