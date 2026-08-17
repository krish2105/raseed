import { expect, test } from '@playwright/test'
import { resetStorage, waitForReady } from './helpers'

/**
 * S10 — demo isolation, as a test rather than as a property of what has not been built yet.
 *
 * Today this holds structurally: there is no Supabase client anywhere, so a visitor's rows
 * have nowhere to go but their own tab. That is a fact about the *absence* of code, which is
 * the least durable kind of guarantee there is — it stops being true on the first commit that
 * adds a client, and nothing would fail.
 *
 * So the claims are pinned here while they are still easy to state:
 *
 *   1. Two visitors never see each other's rows.
 *   2. Everything a visitor adds lives in their own browser and is namespaced.
 *   3. The seeded demo is shared, and therefore read-only — a delete control that would
 *      remove a row from under every other visitor is not offered at all.
 *   4. Nothing leaves the origin, ever.
 *
 * `headers.spec.ts` also asserts (4) on `/lab`. Duplicated deliberately: there it is a
 * regression guard on self-hosting DuckDB, here it is the isolation claim itself, and the two
 * would be fixed by different changes.
 */
test.describe('demo isolation', () => {
  test('two visitors never see each other-s rows', async ({ browser }) => {
    const one = await browser.newContext()
    const two = await browser.newContext()

    try {
      const a = await one.newPage()
      const b = await two.newPage()

      await resetStorage(a)
      await resetStorage(b)

      // Visitor A adds a row through the same dialog anyone would use. Injecting it into
      // localStorage would prove isolation of a shape this app might not even write.
      await a.goto('/overview')
      await waitForReady(a)
      await a.getByRole('button', { name: 'Add' }).click()
      await a.getByLabel('Amount').fill('7777')
      await a.locator('#ax-merchant').fill('Isolation Probe')
      await a.getByRole('button', { name: 'Save' }).click()
      await waitForReady(a)

      await a.goto('/ledger')
      await waitForReady(a)
      await a.getByLabel('Search the ledger').fill('Isolation Probe')
      await expect(a.getByRole('row').filter({ hasText: 'Isolation Probe' })).toHaveCount(1)

      // Visitor B, in a separate context, sees nothing of it.
      await b.goto('/ledger')
      await waitForReady(b)
      await b.getByLabel('Search the ledger').fill('Isolation Probe')
      await expect(b.getByRole('row').filter({ hasText: 'Isolation Probe' })).toHaveCount(0)

      const bRows = await b.evaluate(() =>
        JSON.parse(localStorage.getItem('raseed.local-ledger.v1') ?? '[]'),
      )
      expect(bRows, "another visitor's rows reached this browser").toEqual([])
    } finally {
      await one.close()
      await two.close()
    }
  })

  test('everything a visitor adds is namespaced to this app', async ({ page }) => {
    await resetStorage(page)
    await page.goto('/reckoning')
    await waitForReady(page)

    await page.locator('#wallet-count').fill('5000')
    await page.getByRole('button', { name: 'Set baseline' }).click()
    await expect(page.getByTestId('wallet-outcome')).toBeVisible()

    // `resetStorage` clears by the `raseed.` prefix. A key written outside it would survive a
    // reset and leak between specs — and, on a shared machine, between people.
    const stray = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => !k.startsWith('raseed.') && k !== 'theme'),
    )
    expect(stray, 'a key was written outside the raseed. namespace').toEqual([])
  })

  test('the shared demo offers no control that would edit it for everyone', async ({ page }) => {
    await resetStorage(page)
    await page.goto('/ledger')
    await waitForReady(page)

    // The seeded rows are the same for every visitor, so they are read-only by construction:
    // no delete control is rendered at all, rather than one that fails when pressed.
    await expect(page.getByRole('button', { name: /^Delete/ })).toHaveCount(0)
  })

  test('no visitor data leaves the origin', async ({ page }) => {
    const external: string[] = []
    page.on('request', (r) => {
      const u = new URL(r.url())
      if (!/^https?:$/.test(u.protocol)) return
      if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') external.push(r.url())
    })

    await resetStorage(page)
    for (const route of ['/overview', '/ledger', '/reckoning', '/lab']) {
      await page.goto(route)
      await waitForReady(page)
    }

    expect(external, `contacted a third party:\n${external.join('\n')}`).toEqual([])
  })
})
