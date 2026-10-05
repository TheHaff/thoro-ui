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

const POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types 'none'"

const violations = (page: import('@playwright/test').Page): Promise<string[]> =>
  page.evaluate(() => (globalThis as { cspViolations?: string[] }).cspViolations ?? [])

test('the home page loads under its strict CSP with no violations', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('thoro-ui')
  // complete is also true after a 404; a decoded image has its real width.
  await expect(page.locator('.brand img')).toHaveJSProperty('naturalWidth', 256)
  expect(await violations(page)).toEqual([])
})

test('the policy is exact, comes before every script and stylesheet, and is enforced', async ({ page }) => {
  for (const path of ['/', '/res-canary/']) {
    await page.goto(path)
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', POLICY)
    const order = await page.evaluate(() =>
      [...document.head.querySelectorAll('meta[http-equiv], script, link[rel="stylesheet"]')].map(el => el.tagName),
    )
    expect(order[0], path).toBe('META')
    expect(order.length, path).toBeGreaterThan(2)
  }
  // Proves the policy is live, so the "no violations" checks mean something.
  await page.evaluate(() => {
    const image = document.createElement('img')
    image.src = 'https://elsewhere.invalid/probe.png'
    document.body.append(image)
  })
  await expect.poll(() => violations(page)).toEqual(['img-src https://elsewhere.invalid/probe.png'])
})

// base-uri doesn't fall back to default-src: without it, an injected <base> would point every relative
// link at another site.
test('an injected <base> is ignored, so links keep pointing at this site', async ({ page }) => {
  await page.goto('/')
  const before = await page.evaluate(() => document.baseURI)
  await page.evaluate(() => {
    const base = document.createElement('base')
    base.href = 'https://elsewhere.invalid/'
    document.head.append(base)
  })
  expect(await page.evaluate(() => document.baseURI)).toBe(before)
  const nav = page.getByRole('link', { exact: true, name: 'res-canary' })
  expect(await nav.evaluate(link => (link as HTMLAnchorElement).href)).toBe(`${before}res-canary/`)
  await expect.poll(() => violations(page)).toEqual(['base-uri https://elsewhere.invalid/'])
})

test('a Copy button copies its code block', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  const button = page.getByRole('button', { name: 'Copy' }).first()
  // A polite live region, so screen readers hear "Copied" or "Select and copy".
  await expect(button).toHaveAttribute('aria-live', 'polite')
  await button.click()
  await expect(page.getByRole('button', { name: 'Copied' }).first()).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npm install thoro-ui')
})

test('selecting a whole code block by hand leaves out the Copy button', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('pre.code .copy').first()).toBeVisible()
  const selected = await page.evaluate(() => {
    const pre = document.querySelector('pre.code') as HTMLElement
    getSelection()?.selectAllChildren(pre)
    return getSelection()?.toString()
  })
  expect(selected).toBe('npm install thoro-ui')
})

// Review Focus 5
test('a refused copy says so', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('NotAllowedError')) },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Copy' }).first().click()
  await expect(page.getByRole('button', { name: 'Select and copy' }).first()).toBeVisible()
})

test('the res-canary page loads under its strict CSP with no violations', async ({ page }) => {
  await page.goto('/res-canary/')
  // Without the policy, "no violations" would prove nothing — and this page runs the real element.
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('res-canary')
  expect(await violations(page)).toEqual([])
})

test('blocking a vendor in the demo shows the real banner', async ({ page }) => {
  await page.goto('/res-canary/')
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
  await page.goto('/res-canary/')
  const element = page.getByRole('tab', { name: 'Web component' })
  const react = page.getByRole('tab', { name: 'React' })
  await expect(page.locator('#panel-element')).toBeVisible()
  await expect(page.locator('#panel-element .panel-label')).toBeHidden()
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
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    for (const path of ['/', '/res-canary/']) {
      await page.goto(path)
      // A missing page is narrow too: prove this one rendered before measuring it.
      await expect(page.locator('.brand img')).toHaveJSProperty('naturalWidth', 256)
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path} at ${width}px`).toBe(width)
    }
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
    for (const path of ['/', '/res-canary/']) {
      await page.goto(path)
      // With no Copy buttons there would be nothing to cover.
      await expect(page.locator('pre.code .copy').first()).toBeVisible()
      expect(await coveredBlocks(page), `${path} at ${width}px`).toBe(0)
    }
  }
})

test('reference tables name each row, so screen readers read the option with its meaning', async ({ page }) => {
  await page.goto('/res-canary/')
  for (const name of ['ownPolicy', 'probeTimeoutMs', 'onDismiss, onCopy']) {
    await expect(page.getByRole('rowheader', { exact: true, name })).toBeVisible()
  }
})

// Review Focus 1
test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false })

  test('both quick starts show, each labelled, and no Copy buttons appear', async ({ page }) => {
    await page.goto('/res-canary/')
    await expect(page.getByRole('tablist')).toBeHidden()
    for (const [panel, label] of [
      ['#panel-element', 'Web component'],
      ['#panel-react', 'React'],
    ]) {
      await expect(page.locator(panel)).toBeVisible()
      await expect(page.locator(panel).getByRole('heading', { name: label })).toBeVisible()
    }
    await expect(page.locator('pre.code')).not.toHaveCount(0)
    await expect(page.locator('.copy')).toHaveCount(0)
  })
})

// Review Focus 3
test.describe('in light mode', () => {
  test.use({ colorScheme: 'light' })

  test('the page, wordmark and links switch to dark-on-light colours', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(251, 251, 254)')
    await expect(page.locator('.brand b')).toHaveCSS('color', 'rgb(48, 71, 224)')
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link').first()).toHaveCSS(
      'color',
      'rgb(48, 71, 224)',
    )
  })
})

test('on a wide screen, every name in a table stays on one line', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/res-canary/')
  // A name broken over two lines has client rects on two different lines (<wbr> alone also splits rects).
  const broken = await page.evaluate(() =>
    [...document.querySelectorAll('table code')]
      .filter(code => new Set([...code.getClientRects()].map(rect => Math.round(rect.top))).size > 1)
      .map(code => code.textContent),
  )
  expect(broken).toEqual([])
})
