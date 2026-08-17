import { describe, expect, it } from 'vitest'

import { AR_REVIEW_STATUS } from '@raseed/engines'

import { AR_STRINGS_REVIEW } from './ar'
import { bcp47, coverage, direction, gateFor, isRTL, missingKeys, numberLocale, t } from './index'

describe('locale mechanics', () => {
  it('resolves a string and interpolates', () => {
    expect(t('en', 'today.daysToPayday', { days: 9 })).toBe('9 days to payday')
    expect(t('ar', 'today.daysToPayday', { days: 9 })).toBe('9 يوم حتى الراتب')
  })

  /**
   * A missing Arabic string showing English is a gap somebody can read. Showing the key is a
   * bug that reached a user.
   */
  it('falls back to English, never to the key', () => {
    const untranslated = t('ar', 'reckoning.worthIt')
    expect(untranslated).toBe('Worth it?')
    expect(untranslated).not.toContain('reckoning.')
  })

  it('leaves an unknown placeholder alone rather than printing undefined', () => {
    expect(t('en', 'today.daysToPayday', { wrong: 1 })).toContain('{days}')
  })

  it('knows which way the page runs', () => {
    expect(isRTL('ar')).toBe(true)
    expect(direction('ar')).toBe('rtl')
    expect(direction('en')).toBe('ltr')
  })

  /** ar-AE, not plain ar: Intl picks Gulf conventions from the region. */
  it('formats for the region, not just the language', () => {
    expect(bcp47('ar')).toBe('ar-AE')
    expect(bcp47('en')).toBe('en-IN')
  })

  it('offers Arabic-Indic digits without imposing them', () => {
    expect(numberLocale('ar')).toBe('ar-AE')
    expect(numberLocale('ar', true)).toBe('ar-AE-u-nu-arab')
    expect(new Intl.NumberFormat(numberLocale('ar', true)).format(1234)).toMatch(/[٠-٩]/)
    expect(new Intl.NumberFormat(numberLocale('ar')).format(1234)).toMatch(/[0-9]/)
  })
})

/**
 * The reason this package depends on the engines at all.
 *
 * Arabic copy checked by English regexes is a safety system that reports "allowed" for
 * everything it exists to block. Selecting the gate by locale, in one place, is what stops a
 * screen getting it wrong by forgetting.
 */
describe('the gate follows the language', () => {
  const daytime = { hour: 10 }

  it('blocks an Arabic verdict that the English rules would wave through', () => {
    const shaming = 'بذرت 5000 درهم هذا الشهر. هل تريد التفاصيل؟'
    expect(gateFor('en')(shaming, daytime).broke).not.toContain('shame')
    expect(gateFor('ar')(shaming, daytime).broke).toContain('shame')
  })

  it('still blocks English shame in English', () => {
    expect(gateFor('en')('You overspent, ₹500. Want the detail?', daytime).broke).toContain('shame')
  })
})

describe('how complete the translation actually is', () => {
  it('is honest that nobody has reviewed it', () => {
    expect(AR_STRINGS_REVIEW).toBe('unreviewed-by-native-speaker')
    expect(AR_REVIEW_STATUS).toBe('unreviewed-by-native-speaker')
  })

  /**
   * Not a target — a measurement. This test exists so the gap is a number in the output rather
   * than a claim in a README, and it fails if coverage silently *drops*.
   */
  it('reports its coverage rather than claiming completeness', () => {
    const done = coverage('ar')
    console.log(`\n  Arabic coverage: ${(done * 100).toFixed(0)}% — ${missingKeys('ar').length} keys still English\n`)
    expect(done).toBeGreaterThan(0.5)
    expect(done, 'if this is 1, check the untranslated-on-purpose keys were not filled in blind')
      .toBeLessThan(1)
  })

  it('has no Arabic key that English does not define', () => {
    expect(missingKeys('en')).toEqual([])
  })
})
