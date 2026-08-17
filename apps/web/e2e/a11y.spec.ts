import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ROUTES, waitForReady } from './helpers'

/**
 * Accessibility, in both themes, on every route.
 *
 * Light is checked separately and deliberately. Dark themes are forgiving — bright text on a
 * near-black ground clears 4.5:1 almost by accident — and a palette that passes in dark and
 * is never checked in light is the single most common way this fails. `CLAUDE.md` says as
 * much; this is the test that holds it to it.
 *
 * axe only reports what it can prove from computed styles, so it will miss a contrast
 * failure over an image or a gradient. It catches the ones this app can actually have.
 */

const THEMES = ['light', 'dark'] as const

/**
 * Motion is disabled for every check in this file, and that is not a shortcut.
 *
 * axe samples computed colour at one instant. A card a third of the way through its fade-in
 * reports its blended value — the first run of this suite claimed `#edeff1` on `#ffffff`, a
 * ratio of 1.15, for text that is perfectly legible once settled. Repainting a palette from
 * an animation frame would be fixing a measurement, not a defect.
 *
 * Emulating reduced motion also means these assertions cover a real audience: `CLAUDE.md`
 * requires a complete static fallback, and this is where that fallback gets read.
 */

/**
 * Set the theme BEFORE the page loads, the way a returning visitor arrives.
 *
 * Flipping `data-theme` on a live page and measuring immediately samples every element
 * mid-`transition-colors`, blended between the two palettes. That produced backgrounds like
 * `#727579` — almost exactly halfway between light `#E7EBEF` and dark `#212932` — and a
 * page full of contrast "failures" that exist for 200ms and belong to no palette at all.
 * next-themes ships `disableTransitionOnChange` for the toggle; setting the attribute
 * directly bypasses it, so the honest fix is to never transition in the first place.
 */
async function loadWithTheme(page: Page, theme: (typeof THEMES)[number], route: string) {
  await page.addInitScript((t) => {
    localStorage.setItem('theme', t)
    document.documentElement.setAttribute('data-theme', t)
  }, theme)
  await page.goto(route)
}

/** Live flip, for the toggle test — which is about the swap actually happening. */
async function setTheme(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
  await page.waitForTimeout(400) // let transition-colors land
}

/**
 * The landing route, which this suite did not cover until Lighthouse found what it was
 * missing.
 *
 * `/` is not in `ROUTES` because it has no DuckDB and no Add button, so `waitForReady` cannot
 * gate it — and that structural difference is exactly why it fell out of the sweep. It sat
 * with a content-model violation (`<div>` between `<ul>` and its `<li>`s, from the reveal
 * wrapper) through every green run of this file. A route excluded for a mechanical reason is
 * still an uncovered route.
 */
for (const theme of THEMES) {
  test(`the landing route has no WCAG 2 AA violations in ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme })
    await loadWithTheme(page, theme, '/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('button:disabled')
      .exclude('[aria-disabled="true"]')
      .analyze()

    const detail = violations.flatMap((v) =>
      v.nodes.map(
        (n) => `[${v.id}] ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1] ?? v.help}`,
      ),
    )
    expect(detail, `landing in ${theme}`).toEqual([])
  })
}

/**
 * A shared split, which is the one page a stranger sees.
 *
 * Not in `ROUTES` for the same structural reason the landing page was not: it has no DuckDB and
 * no Add button, so `waitForReady` cannot gate it. That excuse cost the landing route a real
 * violation for weeks, so this one gets its own check on the way in rather than later.
 */
const SPLIT_FRAGMENT = Buffer.from(
  JSON.stringify({
    v: 1,
    what: 'Toit, Saturday',
    at: 1_755_216_000_000,
    currency: 'INR',
    totalMinor: 220_000,
    from: 'Krishna',
    people: [
      { name: 'Rahul', owedMinor: 60_000 },
      { name: 'Asha', owedMinor: 55_000 },
    ],
    payTo: 'krishna@upi',
  }),
  'utf8',
)
  .toString('base64')
  .replaceAll('+', '-')
  .replaceAll('/', '_')
  .replace(/=+$/, '')

for (const theme of THEMES) {
  test(`a shared split has no WCAG 2 AA violations in ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme })
    await loadWithTheme(page, theme, `/split#${SPLIT_FRAGMENT}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Toit')

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('button:disabled')
      .exclude('[aria-disabled="true"]')
      .analyze()

    const detail = violations.flatMap((v) =>
      v.nodes.map(
        (n) => `[${v.id}] ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1] ?? v.help}`,
      ),
    )
    expect(detail, `shared split in ${theme}`).toEqual([])
  })
}

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    for (const route of ROUTES) {
      test(`${route} has no WCAG 2 AA violations`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme })
        await loadWithTheme(page, theme, route)
        await waitForReady(page)
        // Panels resolve after readiness; measuring over a skeleton measures a placeholder.
        await expect(page.locator('.animate-pulse')).toHaveCount(0, { timeout: 30_000 })

        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          // WCAG 1.4.3 explicitly exempts inactive components, and axe cannot tell that a
          // 50%-opacity control is disabled rather than badly coloured. Excluding them is
          // the standard's position, not a convenience.
          .exclude('button:disabled')
          .exclude('[aria-disabled="true"]')
          .analyze()

        // Name the actual elements. "3 violations" sends you hunting; a selector and the
        // measured ratio is something you can fix.
        const detail = violations.flatMap((v) =>
          v.nodes.map((n) => `[${v.id}] ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1] ?? v.help}`),
        )
        expect(detail, `${route} in ${theme}`).toEqual([])
      })
    }
  })
}

test('the theme toggle actually swaps the palette', async ({ page }) => {
  await page.goto('/overview')
  await waitForReady(page)

  const ground = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  await setTheme(page, 'light')
  const light = await ground()
  await setTheme(page, 'dark')
  const dark = await ground()

  expect(light, 'body has no explicit background, so it borrows the host page').not.toBe(
    'rgba(0, 0, 0, 0)',
  )
  expect(dark, 'the theme attribute changed but the palette did not').not.toBe(light)
})

test('nothing overflows horizontally at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })

  for (const route of ROUTES) {
    await page.goto(route)
    await waitForReady(page)

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement
      if (doc.scrollWidth <= doc.clientWidth) return null
      // Name the widest offender rather than just failing.
      const worst = [...document.querySelectorAll('body *')]
        .map((el) => ({ el, right: el.getBoundingClientRect().right }))
        .sort((a, b) => b.right - a.right)[0]
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        culprit: worst ? `${worst.el.tagName.toLowerCase()}.${(worst.el.className || '').toString().slice(0, 60)}` : '?',
      }
    })

    expect(overflow, `${route} scrolls sideways at 360px`).toBeNull()
  }
})

test('the ledger scrolls its own table instead of the page', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/ledger')
  await waitForReady(page)
  // Readiness is DuckDB's, not React's — the table lands a few milliseconds later, and
  // `evaluate` does not wait for anything. Without this the query below can return null and
  // the assertion becomes "a table that does not exist is not in a scroll container", which
  // is true and meaningless.
  await page.locator('table tbody tr').first().waitFor()

  // The table has a 560px minimum, so it must live in its own overflow container.
  const scrollsInside = await page.evaluate(() => {
    const table = document.querySelector('table')
    if (!table) return false
    let node = table.parentElement
    while (node && node !== document.body) {
      if (getComputedStyle(node).overflowX === 'auto') return true
      node = node.parentElement
    }
    return false
  })
  expect(scrollsInside, 'the wide table is not in an overflow-x container').toBe(true)
})

test('keyboard alone reaches the primary actions', async ({ page }) => {
  await page.goto('/overview')
  await waitForReady(page)
  await page.evaluate(() => document.body.focus())

  const reached: string[] = []
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab')
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const style = getComputedStyle(el)
      return {
        name: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 24) ?? el.tagName,
        // A focused control with no visible ring is unusable for a keyboard user.
        ring: style.outlineStyle !== 'none' || style.boxShadow !== 'none',
        tag: el.tagName,
        tabbable: el.getAttribute('tabindex') === '0',
      }
    })
    if (!label) continue
    // A scrollable region carrying an explicit tabindex is a legitimate stop — that is how
    // a keyboard user reaches the ledger table to scroll it. Anything else must be a real
    // control, not a div someone made clickable.
    expect(
      ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(label.tag) || label.tabbable,
      `Tab landed on a <${label.tag}> that is neither a control nor a scroll region`,
    ).toBe(true)
    reached.push(label.name)
  }

  expect(reached.join(' | ')).toContain('Add')
})
