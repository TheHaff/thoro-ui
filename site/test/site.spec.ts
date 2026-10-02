import { expect, test } from '@playwright/test'

// Records CSP violations from the first script on, before any page script runs.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(globalThis as { cspViolations?: string[] }).cspViolations = seen
    document.addEventListener('securitypolicyviolation', event => {
      seen.push(`${event.effectiveDirective} ${event.blockedURI}`)
    })
  })
})

const violations = (page: import('@playwright/test').Page): Promise<string[]> =>
  page.evaluate(() => (globalThis as { cspViolations?: string[] }).cspViolations ?? [])

test('the home page loads under its strict CSP with no violations', async ({ page }) => {
  await page.goto('/thoro-ui/')
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('thoro-ui')
  await expect(page.locator('.brand img')).toHaveJSProperty('complete', true)
  expect(await violations(page)).toEqual([])
})

test('a Copy button copies its code block', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/thoro-ui/')
  await page.getByRole('button', { name: 'Copy' }).first().click()
  await expect(page.getByRole('button', { name: 'Copied' }).first()).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npm install thoro-ui')
})

// Review Focus 5
test('a refused copy says so', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('NotAllowedError')) },
    })
  })
  await page.goto('/thoro-ui/')
  await page.getByRole('button', { name: 'Copy' }).first().click()
  await expect(page.getByRole('button', { name: 'Select and copy' }).first()).toBeVisible()
})
