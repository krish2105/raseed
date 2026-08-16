import { expect, test } from '@playwright/test'
import { resetStorage, waitForReady } from './helpers'

test.describe('cash reconciliation', () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page)
    await page.goto('/reckoning')
    await waitForReady(page)
  })

  test('the first count is a baseline and records nothing', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Set baseline' })).toBeVisible()

    await page.locator('#wallet-count').fill('5000')
    await page.getByRole('button', { name: 'Set baseline' }).click()

    await expect(page.getByTestId('wallet-outcome')).toContainText('Baseline set at ₹5,000.00')

    // A baseline must not invent a transaction out of nothing.
    const rows = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('raseed.local-ledger.v1') ?? '[]'),
    )
    expect(rows, 'the baseline wrote a phantom transaction').toHaveLength(0)

    await expect(page.getByRole('button', { name: 'Reconcile' })).toBeVisible()
  })

  test('a short wallet becomes one honest row', async ({ page }) => {
    await page.locator('#wallet-count').fill('5000')
    await page.getByRole('button', { name: 'Set baseline' }).click()
    await expect(page.getByTestId('wallet-outcome')).toBeVisible()
    await waitForReady(page)

    await page.locator('#wallet-count').fill('800')
    await page.getByRole('button', { name: 'Reconcile' }).click()
    await expect(page.getByTestId('wallet-outcome')).toContainText('₹4,200.00')

    const rows = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('raseed.local-ledger.v1') ?? '[]'),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].amount_minor).toBe(420_000)
    expect(rows[0].direction).toBe('out')
    expect(rows[0].account_id).toBe('acct-cash')
    expect(rows[0].note, 'the row does not say where its number came from').toContain(
      'Expected ₹5,000.00',
    )
  })

  /**
   * The adjustment row is stamped at the same instant as the count, so `cashSpentSince`
   * filters strictly `occurred_at > at`. With `>=` the adjustment would count itself and the
   * expectation would walk down by its own delta forever.
   */
  test('the adjustment does not count itself in the next expectation', async ({ page }) => {
    await page.locator('#wallet-count').fill('5000')
    await page.getByRole('button', { name: 'Set baseline' }).click()
    await expect(page.getByTestId('wallet-outcome')).toBeVisible()
    await waitForReady(page)

    await page.locator('#wallet-count').fill('800')
    await page.getByRole('button', { name: 'Reconcile' }).click()
    await expect(page.getByTestId('wallet-outcome')).toBeVisible()
    await waitForReady(page)

    await expect(page.locator('main')).toContainText('The ledger expects ₹800.00')
    await expect(page.locator('main')).toContainText('minus ₹0.00 of cash spend since')
  })

  test('cash spent after a count is subtracted from the next expectation', async ({ page }) => {
    await page.locator('#wallet-count').fill('5000')
    await page.getByRole('button', { name: 'Set baseline' }).click()
    await expect(page.getByTestId('wallet-outcome')).toBeVisible()
    await waitForReady(page)

    await page.getByRole('button', { name: 'Add' }).click()
    await page.getByLabel('Amount').fill('450')
    await page.locator('#ax-merchant').fill('Auto')
    await page.getByRole('switch', { name: 'Paid in cash' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await waitForReady(page)

    await expect(page.locator('main')).toContainText('minus ₹450.00 of cash spend since')
    await expect(page.locator('main')).toContainText('The ledger expects ₹4,550.00')
  })

  test('an exact count writes nothing at all', async ({ page }) => {
    await page.locator('#wallet-count').fill('5000')
    await page.getByRole('button', { name: 'Set baseline' }).click()
    await expect(page.getByTestId('wallet-outcome')).toBeVisible()
    await waitForReady(page)

    await page.locator('#wallet-count').fill('5000')
    await page.getByRole('button', { name: 'Reconcile' }).click()
    await expect(page.getByTestId('wallet-outcome')).toContainText('Exactly right')

    const rows = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('raseed.local-ledger.v1') ?? '[]'),
    )
    expect(rows, 'a ₹0.00 row was written for a balanced wallet').toHaveLength(0)
  })
})
