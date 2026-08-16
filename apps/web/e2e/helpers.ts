import { expect, type Page } from '@playwright/test'

export const ROUTES = [
  '/tower',
  '/overview',
  '/flows',
  '/categories',
  '/forecast',
  '/currency',
  '/trips',
  '/reckoning',
  '/ledger',
  '/lab',
] as const

/**
 * Wait until DuckDB has loaded and ingested.
 *
 * The Add button is the honest signal: it is disabled unless `status === 'ready'`, so it
 * doubles as the readiness probe and as a regression check on the status machine itself.
 * That is exactly the state that got stuck in `'loading'` forever when `reload()` set an
 * unchanged value and React bailed out of the re-render.
 */
export async function waitForReady(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Add' })).toBeEnabled({ timeout: 60_000 })
}

/** Start from a clean browser so one spec's rows never leak into another's assertions. */
export async function resetStorage(page: Page): Promise<void> {
  await page.goto('/overview')
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('raseed.')) localStorage.removeItem(key)
    }
  })
  await page.reload()
  await waitForReady(page)
}

/**
 * A panel that failed renders a skeleton forever, which is indistinguishable from a slow
 * load. `useDuckQuery` surfaces the message instead; this asserts none appeared.
 */
export async function expectNoFailedPanels(page: Page): Promise<void> {
  await expect(page.getByText(/could not be computed/i)).toHaveCount(0)
}

/**
 * DuckDB returns DATE through Arrow as a Date32 number. Formatting one in JS without the
 * `::VARCHAR` cast produced "1752796800 was unusual" on the Reckoning page — a raw epoch
 * presented to a human as a date. Ten consecutive digits is that bug's fingerprint.
 */
export async function expectNoEpochLeak(page: Page): Promise<void> {
  const text = (await page.locator('main').innerText()) ?? ''
  expect(text, 'a raw epoch timestamp leaked into the UI').not.toMatch(/\b1[6-8]\d{8,}\b/)
}

/** Fill a controlled React input so the change actually reaches state. */
export async function fill(page: Page, selector: string, value: string): Promise<void> {
  await page.locator(selector).fill(value)
}

/**
 * The currency lens, scoped.
 *
 * It is a radiogroup in the top bar, and the add dialog has its own INR/AED radios — an
 * unscoped `getByRole('radio', { name: 'AED' })` matches whichever happens to be mounted.
 */
export function lens(page: Page) {
  return page.getByRole('radiogroup', { name: 'Currency lens' })
}
