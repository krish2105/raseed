import { expect, test } from '@playwright/test'
import { waitForReady } from './helpers'

/**
 * Security headers, and — more importantly — that the app still works under them.
 *
 * A CSP is trivial to ship and trivial to get wrong in a way nobody notices for a week: the
 * page renders, the shell looks fine, and only the analytics are dead because WebAssembly was
 * blocked. So this asserts the header values *and* drives a route that cannot render without
 * DuckDB compiling and a worker running.
 */
test.describe('security headers', () => {
  test('every header is present on a page response', async ({ page }) => {
    const res = await page.goto('/overview')
    const h = res!.headers()

    expect(h['x-frame-options']).toBe('DENY')
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['referrer-policy']).toBe('no-referrer')
    expect(h['strict-transport-security']).toContain('max-age=')
    expect(h['permissions-policy']).toContain('camera=()')
  })

  /**
   * The CSP ships. What it is *for* is `connect-src 'self'`: injected script or not, this page
   * cannot phone anywhere, and for a finance dashboard blocking exfiltration is the protection
   * that matters more than blocking execution.
   *
   * `'unsafe-eval'` is asserted deliberately rather than tolerated. DuckDB's worker calls
   * `new Function` (Arrow's compiled predicates) and a worker inherits the document's policy,
   * so the permission cannot be scoped away — see `next.config.ts`. If someone removes it, the
   * analytics test below fails; this one records that its presence is a known, argued position
   * rather than an oversight.
   */
  test('ships a CSP that blocks exfiltration', async ({ page }) => {
    const res = await page.goto('/overview')
    const csp = res!.headers()['content-security-policy']

    expect(csp, 'no CSP header').toBeTruthy()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("'unsafe-eval'")
  })

  /**
   * The regression that matters, and the reason the CSP is still off. If a policy blocks WASM
   * or blob workers, this route shows a loading state for ever rather than an error, and a
   * header-only test would still pass while every figure on the site was dead.
   */
  test('DuckDB compiles and computes from our own origin, not a CDN', async ({ page }) => {
    const violations: string[] = []
    page.on('console', (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text())
    })

    // Only http(s) to another host counts. blob: and data: parse with an empty hostname and
    // are same-origin by construction — the DuckDB worker is instantiated from one.
    const external: string[] = []
    page.on('request', (r) => {
      const u = new URL(r.url())
      if (!/^https?:$/.test(u.protocol)) return
      if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') external.push(r.url())
    })

    await page.goto('/lab')
    await waitForReady(page)

    // The whole point of self-hosting: no third party sees a visitor of a finance dashboard.
    expect(external, `contacted a third party:\n${external.join('\n')}`).toEqual([])

    // /lab is pure computed output — Benford, Gini, Pareto. It cannot render without the
    // WASM engine and the worker both running.
    await expect(page.getByText(/Benford/i).first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText('NaN')

    expect(violations, `CSP blocked something:\n${violations.join('\n')}`).toEqual([])
  })

  test('the theme is set before first paint, so there is no flash of the wrong one', async ({
    page,
  }) => {
    const violations: string[] = []
    page.on('console', (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text())
    })

    await page.goto('/overview')
    await waitForReady(page)

    // next-themes writes this before first paint via an inline script.
    await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/)
    expect(violations).toEqual([])
  })
})
