import { expect, test } from '@playwright/test'
import { resetStorage, waitForReady } from './helpers'

/**
 * The ledger shows the ledger.
 *
 * It used to fetch `LIMIT 250` and then run the search and the category filter over *that* —
 * so with 951 spend rows in the demo, three quarters of them were invisible and a search for a
 * merchant from four months ago returned "Nothing matches". A correct statement about a
 * subset, presented as a fact about your money.
 *
 * The failure mode is why this test exists rather than a comment: nothing looked broken. The
 * table rendered, the total added up, the empty state was well written. Only the number was
 * wrong, and only if you knew what it should have been.
 */
test.describe('the ledger is not truncated', () => {
  test('renders every spend row, not a page of them', async ({ page }) => {
    await resetStorage(page)
    await page.goto('/ledger')
    await waitForReady(page)
    // `waitForReady` is DuckDB's readiness, not the table's — the rows land a few
    // milliseconds later and `count()` does not auto-wait, so it can read zero.
    await page.locator('table tbody tr').first().waitFor()

    const count = await page.locator('table tbody tr').count()

    // The old cap. Anything at or below it means the page is paginating again.
    expect(count, 'the ledger is capped again').toBeGreaterThan(250)

    // And the panel's own count agrees with what is on screen — the header and the table
    // reading from different numbers is the next version of this bug.
    const label = await page.locator('p.tabular').first().innerText()
    const claimed = Number(label.split('rows')[0]!.replace(/[^\d]/g, ''))
    expect(claimed).toBe(count)
  })

  test('the search reaches the oldest rows, not just the newest page', async ({ page }) => {
    await resetStorage(page)
    await page.goto('/ledger')
    await waitForReady(page)
    await page.locator('table tbody tr').first().waitFor()

    // The last row on screen is the oldest one loaded. Searching for its merchant has to find
    // it — under the cap, a merchant that appears only in the tail was unreachable.
    const oldest = page.locator('table tbody tr').last()
    const merchant = (await oldest.locator('td').nth(1).innerText()).split('\n')[0]!.trim()

    await page.getByLabel('Search the ledger').fill(merchant)
    await expect(
      page.getByRole('row').filter({ hasText: merchant }).first(),
      `searching for "${merchant}" from the tail of the ledger found nothing`,
    ).toBeVisible()
  })
})
