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

test('the res-canary page loads under its strict CSP with no violations', async ({ page }) => {
  await page.goto('/thoro-ui/res-canary/')
  // Without the policy, "no violations" would prove nothing — and this page runs the real element.
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('res-canary')
  expect(await violations(page)).toEqual([])
})

test('blocking a vendor in the demo shows the real banner', async ({ page }) => {
  await page.goto('/thoro-ui/res-canary/')
  await page.getByRole('button', { name: 'Block support chat' }).click()
  await expect(page.getByText("Some features couldn't load: Support chat.")).toBeVisible()
  await page.getByRole('button', { name: 'Block e-signature' }).click()
  await expect(page.getByText("Some features couldn't load: Support chat and E-signature.")).toBeVisible()
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.locator('#demo-banner')).toBeHidden()
  expect(await violations(page)).toEqual([])
})

// Review Focus 4
test('quick-start tabs switch with the mouse and the arrow keys', async ({ page }) => {
  await page.goto('/thoro-ui/res-canary/')
  const element = page.getByRole('tab', { name: 'Web component' })
  const react = page.getByRole('tab', { name: 'React' })
  await expect(page.locator('#panel-element')).toBeVisible()
  await expect(page.locator('#panel-react')).toBeHidden()
  await react.click()
  await expect(page.locator('#panel-react')).toBeVisible()
  await expect(page.locator('#panel-element')).toBeHidden()
  await react.press('ArrowLeft')
  await expect(element).toBeFocused()
  await expect(page.locator('#panel-element')).toBeVisible()
})

// Review Focus 2
test('on a phone, neither page scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/thoro-ui/', '/thoro-ui/res-canary/']) {
    await page.goto(path)
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBe(390)
  }
})

// Counts the visible code blocks whose first line runs under their Copy button.
const coveredBlocks = (page: import('@playwright/test').Page): Promise<number> =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('pre.code')].filter(pre => {
        const text = pre.querySelector('code')?.firstChild
        const button = pre.querySelector('.copy')
        if (!text || !button || pre.getClientRects().length === 0) return false
        const content = text.textContent ?? ''
        const range = document.createRange()
        range.setStart(text, 0)
        range.setEnd(text, content.includes('\n') ? content.indexOf('\n') : content.length)
        const line = range.getBoundingClientRect()
        const box = button.getBoundingClientRect()
        return line.right > box.left && line.left < box.right && line.bottom > box.top && line.top < box.bottom
      }).length,
  )

test('on a narrow screen, no Copy button covers code', async ({ page }) => {
  for (const width of [360, 390, 601, 700, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    for (const path of ['/thoro-ui/', '/thoro-ui/res-canary/']) {
      await page.goto(path)
      expect(await coveredBlocks(page), `${path} at ${width}px`).toBe(0)
    }
  }
})
