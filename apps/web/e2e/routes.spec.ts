import { expect, test } from '@playwright/test'
import { ROUTES, expectNoEpochLeak, expectNoFailedPanels, lens, waitForReady } from './helpers'

test.describe('every route renders real numbers', () => {
  for (const route of ROUTES) {
    test(`${route} loads, computes, and shows no zeroed figures`, async ({ page }) => {
      await page.goto(route)
      await waitForReady(page)

      await expectNoFailedPanels(page)
      await expectNoEpochLeak(page)

      // ₹0.00 everywhere is what the Arrow null-coercion bug looked like: the spend
      // predicate matched nothing, v_spend returned no rows, and the page rendered a
      // confident zero with no error anywhere. One or two zeroes are legitimate; a page
      // made of them is the bug.
      const zeroes = await page.getByText(/^(₹|AED )0\.00$/).count()
      expect(zeroes, 'the page is showing zeroes where it should show money').toBeLessThan(3)
    })
  }
})

test('the currency lens converts rather than relabels', async ({ page }) => {
  await page.goto('/overview')
  await waitForReady(page)
  await expect(page.locator('main')).toContainText('₹')

  await lens(page).getByRole('radio', { name: 'AED', exact: true }).click()

  // Auto-retrying, deliberately. A one-shot snapshot passes the moment the FIRST panel
  // repaints while the others are still re-querying — which reads as a lens leak that is
  // really just a race. Polling until no rupee remains asserts what actually matters:
  // every panel re-read, not merely the fastest one.
  await expect(
    page.locator('main'),
    'a panel kept rendering rupees under the AED lens',
  ).not.toContainText('₹')
  await expect(page.locator('main')).toContainText('AED')
})

test('the lens survives a reload, because every view is a URL', async ({ page }) => {
  await page.goto('/overview')
  await waitForReady(page)
  await lens(page).getByRole('radio', { name: 'AED', exact: true }).click()
  await expect(page.locator('main')).toContainText('AED', { timeout: 30_000 })

  const url = page.url()
  expect(url, 'the lens is not in the URL, so this view cannot be shared').toContain('AED')

  await page.goto(url)
  await waitForReady(page)
  await expect(page.locator('main')).toContainText('AED')
})
