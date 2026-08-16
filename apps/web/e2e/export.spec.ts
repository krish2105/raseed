import { expect, test } from '@playwright/test'
import { resetStorage, waitForReady } from './helpers'

/**
 * Export, verified by reading the bytes that actually reach disk.
 *
 * Asserting the button exists proves nothing — the failure modes here are all in the file:
 * a CSV whose quoting shifts columns, an export that silently drops income, or amounts
 * helpfully divided by 100 on the way out.
 */
test.describe('data export', () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page)
    await page.goto('/ledger')
    await waitForReady(page)
  })

  test('downloads a CSV whose header and row count are real', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'CSV' }).click(),
    ])

    expect(download.suggestedFilename()).toMatch(/^raseed-export-\d{4}-\d{2}-\d{2}\.csv$/)

    const stream = await download.createReadStream()
    const body = (await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      stream.on('data', (c) => chunks.push(Buffer.from(c)))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })).toString('utf8')

    const lines = body.trimEnd().split('\r\n')
    expect(lines[0]).toContain('id,occurred_at,occurred_at_iso')
    // The seeded ledger is ~951 rows; anything in the hundreds means real data, not a stub.
    expect(lines.length).toBeGreaterThan(100)
  })

  /**
   * The point of an export being an export rather than a view: the ledger table reads through
   * v_spend and hides income, but your data includes it.
   */
  test('includes income rows the ledger table deliberately hides', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'CSV' }).click(),
    ])
    const stream = await download.createReadStream()
    const body = (await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      stream.on('data', (c) => chunks.push(Buffer.from(c)))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })).toString('utf8')

    expect(body).toContain(',income,')
  })

  test('the JSON bundle is versioned and states its conventions', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'JSON' }).click(),
    ])

    expect(download.suggestedFilename()).toMatch(/\.json$/)

    const stream = await download.createReadStream()
    const body = (await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      stream.on('data', (c) => chunks.push(Buffer.from(c)))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })).toString('utf8')

    const parsed = JSON.parse(body)
    expect(parsed.format).toBe('raseed.export.v1')
    expect(parsed.counts.transactions).toBe(parsed.transactions.length)
    expect(parsed.notes.join(' ')).toMatch(/minor units/i)

    // Amounts must survive the round trip as integers, not become floats.
    for (const t of parsed.transactions.slice(0, 50)) {
      expect(Number.isInteger(t.amount_minor)).toBe(true)
    }
  })
})
