import { checkTone, checkToneAr, type ToneContext, type ToneVerdict } from '@raseed/engines'

import { ar } from './ar'
import { en } from './en'

/**
 * @raseed/i18n — one dictionary, two languages, and the gate that follows the language.
 *
 * The point of this package is not the strings. It is that **the tone gate is selected by
 * locale in exactly one place.** `tone.ts` is a safety system that checks every sentence about
 * someone's money for shame, diagnosis, body references and regulated advice, and its rules are
 * English regexes. Adding Arabic copy without switching the gate would have left that guarantee
 * running against text it cannot read — silently allowing everything it exists to block.
 *
 * So `gateFor(locale)` exists and is the only supported way to reach either rule set. A screen
 * cannot pick the wrong one by forgetting, because a screen never picks at all.
 */

export type Locale = 'en' | 'ar'

export const LOCALES: readonly Locale[] = ['en', 'ar']

/** Right-to-left is a property of the locale, not a setting someone toggles. */
export function isRTL(locale: Locale): boolean {
  return locale === 'ar'
}

export function direction(locale: Locale): 'ltr' | 'rtl' {
  return isRTL(locale) ? 'rtl' : 'ltr'
}

/**
 * The BCP-47 tag for formatting.
 *
 * `ar-AE` rather than plain `ar`: this app's Arabic users are in the UAE, and the difference is
 * not cosmetic — `Intl` picks Gulf month names and the correct grouping from the region, and
 * plain `ar` can land on conventions nobody there uses.
 */
export function bcp47(locale: Locale): string {
  return locale === 'ar' ? 'ar-AE' : 'en-IN'
}

/**
 * The key set comes from `en`; the value type is widened to `string`.
 *
 * `en` is `as const` so that `StringKey` is the exact union of keys — which is what makes a typo
 * in `t('today.greting')` a compile error. But that also makes every *value* a literal type, and
 * a literal type of `'Today'` is not something Arabic can satisfy. Widening the values keeps the
 * key safety and drops the accidental constraint.
 */
export type StringKey = keyof typeof en
export type Dictionary = Record<StringKey, string>

const DICTIONARIES: Record<Locale, Partial<Dictionary>> = { en, ar }

/**
 * Look up a string.
 *
 * **Falls back to English rather than to the key**, and that is a deliberate trade. A missing
 * Arabic string showing English is a translation gap somebody can read; a missing string showing
 * `privacy.deleteEverything` is a bug that reached a user. The `missingKeys` helper below is how
 * the gap gets measured instead of being discovered.
 */
export function t(locale: Locale, key: StringKey, vars?: Record<string, string | number>): string {
  const template = DICTIONARIES[locale][key] ?? en[key]
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  )
}

/**
 * Which keys a locale has not translated yet.
 *
 * Exported so a test can assert coverage rather than a README claiming it. A translation that is
 * 60% done is fine; a translation that *claims* to be done and is 60% is how a user meets an
 * English sentence in the middle of an Arabic screen.
 */
export function missingKeys(locale: Locale): StringKey[] {
  const dictionary = DICTIONARIES[locale]
  return (Object.keys(en) as StringKey[]).filter((key) => dictionary[key] === undefined)
}

export function coverage(locale: Locale): number {
  const total = Object.keys(en).length
  return Math.round(((total - missingKeys(locale).length) / total) * 10_000) / 10_000
}

/**
 * The tone gate for a locale.
 *
 * The single reason this package depends on `@raseed/engines`. Every caller that displays a
 * generated sentence goes through here, so the language of the copy and the language of the
 * rules checking it cannot drift apart.
 */
export function gateFor(
  locale: Locale,
): (text: string, context: ToneContext, options?: Parameters<typeof checkTone>[2]) => ToneVerdict {
  if (locale === 'ar') {
    return (text, context, options) =>
      checkToneAr(text, context, options) as ToneVerdict
  }
  return checkTone
}

/**
 * Arabic-Indic numerals, when the locale wants them.
 *
 * `Intl` handles this through the `-u-nu-arab` extension rather than a hand-rolled digit map —
 * which also gets the decimal separator, the grouping separator and the minus sign right, none
 * of which a digit substitution would.
 *
 * Off by default even in Arabic: UAE banking and receipts overwhelmingly print Western digits,
 * so a ledger in Arabic-Indic numerals is harder to reconcile against the statement it came
 * from. It is offered, not imposed.
 */
export function numberLocale(locale: Locale, arabicIndicDigits = false): string {
  const base = bcp47(locale)
  return locale === 'ar' && arabicIndicDigits ? `${base}-u-nu-arab` : base
}

export { ar, en }
