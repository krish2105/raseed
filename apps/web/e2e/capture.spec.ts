import { expect, test } from '@playwright/test'
import { expectNoFailedPanels, resetStorage, waitForReady } from './helpers'

test.describe('adding money', () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page)
  })

  /**
   * The regression this suite exists for.
   *
   * `reload()` used to set `requestedRows` to `undefined` when it already was `undefined`.
   * React bails out on an identical value, so the effect never re-ran and `status` stayed
   * `'loading'` for the rest of the session: the Add button went permanently disabled and
   * every added expense stayed out of the figures until a manual refresh. Checking the row
   * reached localStorage is not the same as checking the read came back.
   */
  test('the app stays interactive after adding, and the row reaches the ledger', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Add' }).click()
    await page.getByLabel('Amount').fill('1234')
    await page.locator('#ax-merchant').fill('Playwright Cafe')
    await page.getByRole('button', { name: 'Save' }).click()

    // The whole point: ready again, not stuck loading.
    await waitForReady(page)

    await page.goto('/ledger')
    await waitForReady(page)
    await page.getByLabel('Search the ledger').fill('Playwright Cafe')

    const row = page.getByRole('row').filter({ hasText: 'Playwright Cafe' })
    await expect(row, 'the added row never reached DuckDB').toHaveCount(1)
    // raw_text has to be encoded into Arrow or this reads "Unknown".
    await expect(row).toContainText('Playwright Cafe')
    await expect(row).toContainText('₹1,234.00')
  })

  test('a split records your share, not the whole bill', async ({ page }) => {
    await page.getByRole('button', { name: 'Add' }).click()
    await page.getByLabel('Amount').fill('1000')
    await page.locator('#ax-merchant').fill('Split Dinner')
    await page.getByRole('dialog').getByRole('radio', { name: '3', exact: true }).click()

    // ₹1,000 three ways does not divide evenly. The remainder must not vanish.
    const note = page.getByTestId('split-note')
    await expect(note).toContainText('₹333.34')
    await expect(note).toContainText('₹666.66')
    await expect(note).toContainText('33334/33333/33333')

    await page.getByRole('button', { name: 'Save' }).click()
    await waitForReady(page)

    await page.goto('/ledger')
    await waitForReady(page)
    await page.getByLabel('Search the ledger').fill('Split Dinner')

    const row = page.getByRole('row').filter({ hasText: 'Split Dinner' })
    // Assert on the amount cells, not the row: the note legitimately says "Paid ₹1,000.00",
    // and that sentence is the point — it is the record of where ₹333.34 came from.
    await expect(row.locator('td').nth(4), 'the whole bill was recorded instead of your share')
      .toHaveText('₹333.34')
    await expect(row.locator('td').nth(3)).toHaveText('₹333.34')
    // The note explains where the number came from, right where you read it.
    await expect(row).toContainText('owed to you')
  })

  test('an AED expense keeps its native amount and converts under the lens', async ({ page }) => {
    await page.getByRole('button', { name: 'Add' }).click()
    await page.getByLabel('Amount').fill('100')
    await page.getByRole('dialog').getByRole('radio', { name: 'AED', exact: true }).click()
    await page.locator('#ax-merchant').fill('Dubai Mall')
    await page.getByRole('button', { name: 'Save' }).click()
    await waitForReady(page)

    await page.goto('/ledger')
    await waitForReady(page)
    await page.getByLabel('Search the ledger').fill('Dubai Mall')

    const row = page.getByRole('row').filter({ hasText: 'Dubai Mall' })
    // Native stays AED; the lens column shows it in rupees at the rate frozen on the row.
    await expect(row).toContainText('AED 100.00')
    await expect(row).toContainText('₹2,486.00')
  })

  test('only rows you added can be deleted', async ({ page }) => {
    await page.getByRole('button', { name: 'Add' }).click()
    await page.getByLabel('Amount').fill('99')
    await page.locator('#ax-merchant').fill('Deletable')
    await page.getByRole('button', { name: 'Save' }).click()
    await waitForReady(page)

    await page.goto('/ledger')
    await waitForReady(page)
    await page.getByLabel('Search the ledger').fill('Deletable')
    await expect(page.getByRole('row').filter({ hasText: 'Deletable' })).toHaveCount(1)

    await page.getByRole('button', { name: 'Delete Deletable' }).click()
    await expect(
      page.getByRole('row').filter({ hasText: 'Deletable' }),
      'the row survived a delete',
    ).toHaveCount(0)

    // The seeded demo is shared across every visitor, so it offers no delete control at all
    // rather than a button that fails.
    await page.getByLabel('Search the ledger').fill('Carrefour')
    await expect(page.getByRole('button', { name: /^Delete Carrefour/ })).toHaveCount(0)
  })

  test('a custom category can be created and used', async ({ page }) => {
    await page.getByRole('button', { name: 'Add' }).click()
    await page.getByLabel('New category name').fill('Scuba')
    await page.getByLabel('New category name').press('Enter')

    const chip = page.getByRole('radio', { name: 'Scuba' })
    await expect(chip).toBeVisible()
    await expect(chip, 'the new category was not selected after creating it').toHaveAttribute(
      'aria-checked',
      'true',
    )

    await page.getByLabel('Amount').fill('500')
    await page.locator('#ax-merchant').fill('Dive Shop')
    await page.getByRole('button', { name: 'Save' }).click()
    await waitForReady(page)
    await expectNoFailedPanels(page)
  })
})

/**
 * Editing a row you added.
 *
 * The phone got edit and delete first; the web had delete only, so a mistyped amount was
 * permanent unless you deleted and re-entered it. This asserts the value actually changes in
 * storage rather than just in the input.
 */
test.describe('editing a local row', () => {
  test('changes the amount and the ledger re-derives', async ({ page }) => {
    await resetStorage(page)
    await page.goto('/ledger')
    await waitForReady(page)

    // Add a row to edit — the seeded demo is read-only by design.
    await page.evaluate(() => {
      const key = 'raseed.local-ledger.v1'
      const row = {
        id: 'local-edit-target',
        occurred_at: Date.now(),
        direction: 'out',
        amount_minor: 50_000,
        currency: 'INR',
        home_amount_minor: 50_000,
        fx_rate: 1,
        fx_inr_per_aed: 23.45,
        account_id: 'acct-hdfc',
        merchant_id: null,
        category_id: 'cat-food',
        raw_text: 'TYPO MERCHANT',
        source: 'manual',
        txn_type: 'spend',
        transfer_group_id: null,
        reversal_of_id: null,
        trip_id: null,
        status: 'confirmed',
        confidence: 1,
        note: null,
        user_id: 'local-user',
        updated_at: Date.now(),
        deleted: false,
      }
      localStorage.setItem(key, JSON.stringify([row]))
    })
    await page.reload()
    await waitForReady(page)

    const row = page.getByRole('row').filter({ hasText: 'TYPO MERCHANT' })
    await expect(row).toHaveCount(1)

    await row.getByRole('button', { name: /^Edit / }).click()

    // Query at page level from here: once the merchant becomes an <input>, its value is no
    // longer text content, so the row filter above stops matching it. Only one row is ever in
    // edit mode, so this is unambiguous.
    await page.getByRole('textbox', { name: /^Merchant for / }).fill('FIXED MERCHANT')
    await page.getByRole('textbox', { name: /^Amount for / }).fill('750.00')
    await page.getByRole('button', { name: /^Save / }).click()

    // Storage is the source of truth; the table reads from it.
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('raseed.local-ledger.v1') ?? '[]'),
    )
    expect(stored[0].raw_text).toBe('FIXED MERCHANT')
    expect(stored[0].amount_minor).toBe(75_000)
    // FX must be carried, not recomputed — an edit is not a currency event.
    expect(stored[0].fx_rate).toBe(1)
    expect(stored[0].home_amount_minor).toBe(75_000)

    await expect(page.getByRole('row').filter({ hasText: 'FIXED MERCHANT' })).toHaveCount(1)
  })

  test('leaves seeded demo rows uneditable', async ({ page }) => {
    await resetStorage(page)
    await page.goto('/ledger')
    await waitForReady(page)
    // Seeded rows expose no edit control at all.
    await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0)
  })
})
