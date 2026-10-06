import { expect, test, type Page } from '@playwright/test'

const VENDOR = 'http://127.0.0.1:4174'
// Nothing listens here (see server.ts), so the OS refuses the connection.
const CLOSED = 'http://127.0.0.1:4175'

// The harness is a module script, which runs before the load event goto() waits for.
// Only page.evaluate is used: it goes through the automation protocol, not the page's (blocked) eval.
async function open(page: Page, csp: 'allowed' | 'foreign' | 'own-blocks' | 'strict' | 'no-connect'): Promise<void> {
  await page.goto(`/page?csp=${csp}&script=res-canary-harness`)
}

const status = (page: Page): Promise<string> => page.evaluate(() => harness.status())
const bannerText = (page: Page): Promise<string | null> => page.evaluate(() => harness.bannerText())

test('an allowed vendor shows nothing', async ({ page }) => {
  await open(page, 'allowed')
  await page.evaluate(() => harness.start({ banner: true }))
  await page.evaluate(() => harness.loadScript('/widget.js'))
  await expect.poll(() => page.evaluate(() => 'vendorWidgetLoaded' in globalThis)).toBe(true)
  expect(await status(page)).toBe('unknown')
  expect(await bannerText(page)).toBeNull()
})

test('a second, stricter CSP (extension or proxy) is reported as foreign-csp', async ({ page }) => {
  await open(page, 'foreign')
  await page.evaluate(() => harness.start({ banner: true }))
  await page.evaluate(() => harness.loadScript('/widget.js'))
  await expect.poll(() => status(page)).toBe('foreign-csp')
  await expect.poll(() => bannerText(page)).toContain("Some features couldn't load: Widget.")
})

test('a dropped request is reported as load-failed', async ({ page }) => {
  await page.route(`${VENDOR}/**`, route => route.abort())
  await open(page, 'allowed')
  await page.evaluate(() => harness.start({ banner: true }))
  await page.evaluate(() => harness.loadScript('/widget.js'))
  await expect.poll(() => status(page)).toBe('load-failed')
  await expect.poll(() => bannerText(page)).toContain('Widget')
})

test('our own policy blocking the vendor is reported to us and kept out of the banner', async ({ page }) => {
  await open(page, 'own-blocks')
  await page.evaluate(() => harness.start({ banner: true }))
  await page.evaluate(() => harness.loadScript('/widget.js'))
  await expect.poll(() => status(page)).toBe('own-csp')
  expect(await page.evaluate(() => harness.own.length)).toBeGreaterThan(0)
  expect(await page.evaluate(() => harness.blockedIds())).toEqual([])
  expect(await bannerText(page)).toBeNull()
})

test('the element renders and styles itself under a strict CSP with Trusted Types', async ({ page }) => {
  await page.route(`${VENDOR}/**`, route => route.abort())
  await open(page, 'strict')
  await page.evaluate(() => harness.start({ banner: true }))
  await page.evaluate(() => harness.loadImage('/pixel.svg'))
  await expect.poll(() => bannerText(page)).toContain('Widget')
  expect(await page.evaluate(() => harness.bannerPadding())).toBe('16px')
  expect(await page.evaluate(() => harness.violations)).toEqual([])
})

test.describe('probes', () => {
  const probes = [
    { path: '/widget.js', type: 'script' },
    { path: '/widget.css', type: 'style' },
    { path: '/pixel.svg', type: 'image' },
    { path: '/widget.js', type: 'fetch' },
  ] as const

  for (const { path, type } of probes) {
    test(`${type} probe: reachable → ok`, async ({ page }) => {
      await open(page, 'allowed')
      await page.evaluate(probe => harness.start({ probe }), { type, url: VENDOR + path })
      await expect.poll(() => status(page)).toBe('ok')
    })

    test(`${type} probe: refused → load-failed`, async ({ page }) => {
      await open(page, 'allowed')
      await page.evaluate(probe => harness.start({ probe }), { type, url: CLOSED + path })
      await expect.poll(() => status(page)).toBe('load-failed')
    })
  }

  test('a probe that never answers fails after the timeout', async ({ page }) => {
    await open(page, 'allowed')
    await page.evaluate(probe => harness.start({ probe, probeTimeoutMs: 1000 }), {
      type: 'script' as const,
      url: `${VENDOR}/hang`,
    })
    expect(await status(page)).toBe('unknown')
    await expect.poll(() => status(page), { timeout: 5000 }).toBe('load-failed')
  })
})

test.describe('403 block pages', () => {
  for (const { path, type } of [
    { path: '/blocked.js', type: 'script' },
    { path: '/blocked.css', type: 'style' },
  ] as const) {
    test(`${type} probe: a proxy's 403 page → load-failed`, async ({ browserName, page }) => {
      // Known gap, listed in the README: a fetch counts any HTTP answer as reachable, and Firefox's preload
      // fires load anyway, so Firefox's script probe misses an error page.
      test.fail(browserName === 'firefox' && type === 'script')
      await page.route(`${VENDOR}/blocked.*`, route =>
        route.fulfill({ body: '<h1>Blocked by policy</h1>', contentType: 'text/html', status: 403 }),
      )
      await open(page, 'allowed')
      await page.evaluate(probe => harness.start({ probe }), { type, url: VENDOR + path })
      await expect.poll(() => status(page)).toBe('load-failed')
    })
  }
})

test.describe('eager checks', () => {
  test('a reachable vendor origin → ok', async ({ page }) => {
    await open(page, 'allowed')
    await page.evaluate(origins => harness.start({ lazy: false, origins }), [VENDOR])
    await expect.poll(() => status(page)).toBe('ok')
  })

  test('a refused vendor origin → load-failed, in every engine', async ({ page }) => {
    await open(page, 'allowed')
    await page.evaluate(origins => harness.start({ banner: true, lazy: false, origins }), [CLOSED])
    await expect.poll(() => status(page)).toBe('load-failed')
    await expect.poll(() => bannerText(page)).toContain('Widget')
  })

  test('your CSP without connect-src for the vendor → inconclusive, not reported as yours', async ({ page }) => {
    await open(page, 'no-connect')
    await page.evaluate(origins => harness.start({ lazy: false, origins }), [VENDOR])
    // The check really was blocked by our own connect-src…
    await expect
      .poll(() => page.evaluate(() => harness.violations))
      .toContainEqual({ blockedURI: `${VENDOR}/`, directive: 'connect-src' })
    // …and once it has had time to settle, it changed nothing.
    await page.waitForTimeout(300)
    expect(await status(page)).toBe('unknown')
    expect(await page.evaluate(() => harness.own)).toEqual([])
  })
})
