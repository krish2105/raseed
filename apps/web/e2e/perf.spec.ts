import { expect, test } from '@playwright/test'
import { waitForReady } from './helpers'

/**
 * C5 — the 400ms view-rebuild budget, gated rather than merely instrumented.
 *
 * `WEB_ARCHITECTURE.md` P1 names "<400ms at 100k rows" as a done-when, and the Lab has printed
 * the number since S8 — but printing is not gating. A budget nobody fails is a budget nobody
 * keeps, and the specific way this would rot is silent: someone adds a view to `ALL_VIEWS`,
 * the rebuild creeps to 500ms, and the only place it shows is a panel on a route most visitors
 * never open.
 *
 * This drives the real benchmark in a real browser — DuckDB-WASM compiling, a worker
 * generating 100k rows, Arrow IPC across the boundary, then every view rebuilt. The Lab's own
 * verdict column is the assertion target, so the test and the UI cannot disagree about what
 * the budget is.
 *
 * CI runners are slower and noisier than a laptop, which is the point: a budget that only
 * holds on the developer's machine is not a budget.
 */
test.describe('performance budget', () => {
  test('rebuilds every view under 400ms at 100k rows', async ({ page }) => {
    test.setTimeout(180_000)

    await page.goto('/lab')
    await waitForReady(page)

    await page.getByRole('button', { name: /Ingest 1,00,000 rows/ }).click()

    // The row appears only when the run finishes; the verdict cell is what the panel shows a
    // human, so asserting on it means a passing test and a green panel are the same claim.
    const row = page.locator('tr', { hasText: '1,00,000' })
    await expect(row).toBeVisible({ timeout: 150_000 })

    const verdict = row.locator('td').last()
    await expect(verdict).toHaveText(/under 400ms/, { timeout: 10_000 })

    // Name the measurement in the report, so a run that is merely *near* the budget is
    // visible before it is a failure.
    const rebuild = await row.locator('td').nth(4).innerText()
    console.log(`view rebuild at 100k rows: ${rebuild}`)
  })
})
