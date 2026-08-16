import { expect, test } from '@playwright/test'
import { resetStorage, waitForReady } from './helpers'

/** An HDFC-shaped export: separate withdrawal/deposit columns, Indian digit grouping. */
const HDFC = `Date,Narration,Withdrawal Amt.,Deposit Amt.
03/04/2026,UPI-SWIGGY-swiggy@okhdfc,"1,234.50",
15/04/2026,SALARY CREDIT,,"1,50,000.00"
22/04/2026,BIGBASKET RETAIL,"2,340.00",`

/** Every date lands in the first twelve days, so the file cannot say which order it is in. */
const AMBIGUOUS = `Date,Description,Amount
03/04/2026,COFFEE,-100.00
05/06/2026,LUNCH,-200.00`

async function upload(page: import('@playwright/test').Page, name: string, body: string) {
  await page.setInputFiles('input[type="file"]', {
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(body, 'utf8'),
  })
}

test.describe('statement import', () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page)
    await page.goto('/import')
    await waitForReady(page)
  })

  test('reads a bank CSV and shows what it worked out before writing anything', async ({
    page,
  }) => {
    await upload(page, 'hdfc.csv', HDFC)

    await expect(page.getByText('Rows found')).toBeVisible()
    await expect(page.locator('dd').filter({ hasText: '3' }).first()).toBeVisible()

    // Direction comes from which column is filled, not from a sign.
    const salary = page.getByRole('row').filter({ hasText: 'SALARY' })
    await expect(salary).toContainText('+')
    await expect(page.getByRole('row').filter({ hasText: 'SWIGGY' })).toContainText('₹1,234.50')

    // Nothing is written until the button is pressed.
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('raseed.local-ledger.v1') ?? '[]'),
    )
    expect(stored, 'the parser wrote to the ledger before being told to').toHaveLength(0)
  })

  test('imports the rows and every figure re-derives', async ({ page }) => {
    await upload(page, 'hdfc.csv', HDFC)
    await page.getByRole('button', { name: /Import 3 rows/ }).click()

    await expect(page.getByText(/3 rows imported/)).toBeVisible()

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('raseed.local-ledger.v1') ?? '[]'),
    )
    expect(stored).toHaveLength(3)

    await page.goto('/ledger')
    await waitForReady(page)

    // Search on the amount, not the merchant: the seeded demo already contains 30 Swiggy
    // rows, so a merchant match proves nothing about whether the import landed.
    await page.getByLabel('Search the ledger').fill('BIGBASKET RETAIL')
    const row = page.getByRole('row').filter({ hasText: 'BIGBASKET RETAIL' })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('₹2,340.00')
  })

  /**
   * The behaviour this screen exists for. A silent wrong guess misfiles a third of the rows
   * into the wrong month and nothing about the result looks wrong.
   */
  test('refuses to import until an ambiguous date order is answered', async ({ page }) => {
    await upload(page, 'ambiguous.csv', AMBIGUOUS)

    await expect(page.getByText('Which way round are the dates?')).toBeVisible()
    await expect(page.getByRole('button', { name: /Import 2 rows/ })).toBeDisabled()

    await page.getByRole('button', { name: /Month first/ }).click()
    await expect(page.getByRole('button', { name: /Import 2 rows/ })).toBeEnabled()
  })

  test('the answer actually changes the dates', async ({ page }) => {
    await upload(page, 'ambiguous.csv', AMBIGUOUS)
    await page.getByRole('button', { name: /Month first/ }).click()
    // 03/04 read month-first is 4 March.
    await expect(page.getByRole('row').filter({ hasText: 'COFFEE' })).toContainText('04 Mar')

    await page.getByRole('button', { name: /Day first/ }).click()
    await expect(page.getByRole('row').filter({ hasText: 'COFFEE' })).toContainText('03 Apr')
  })

  /** Dedupe ships with import, not after it. */
  test('excludes a row already in the ledger', async ({ page }) => {
    await upload(page, 'hdfc.csv', HDFC)
    await page.getByRole('button', { name: /Import 3 rows/ }).click()
    await expect(page.getByText(/3 rows imported/)).toBeVisible()

    // Same file again: every row is now a duplicate.
    await upload(page, 'hdfc.csv', HDFC)
    await expect(page.getByText('already in your ledger').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Import 0 rows/ })).toBeDisabled()
  })

  test('a row can be excluded by hand', async ({ page }) => {
    await upload(page, 'hdfc.csv', HDFC)
    await page
      .getByRole('row')
      .filter({ hasText: 'BIGBASKET' })
      .getByRole('checkbox')
      .uncheck()
    await expect(page.getByRole('button', { name: /Import 2 rows/ })).toBeEnabled()
  })

  test('reports lines it could not read rather than dropping them', async ({ page }) => {
    await upload(page, 'messy.csv', `Date,Description,Amount
03/04/2026,GOOD,-500.00
not-a-date,BAD,-100.00`)
    await expect(page.getByText(/1 line could not be read/)).toBeVisible()
  })
})
