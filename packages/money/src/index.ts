export type Currency = 'INR' | 'AED'

/**
 * Placeholder. Session 1 replaces this with the real Money type, `allocate()` and the
 * rest of the arithmetic.
 *
 * It exists now for two reasons: to give both apps one genuine cross-package signature
 * to import, and to give the Session 0 break test a shape worth mutating.
 *
 * Integer minor units only — `(abs - (abs % 100)) / 100` is exact integer division. No
 * float ever touches an amount, even in a placeholder.
 */
export function formatMinor(minor: number, currency: Currency): string {
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  const major = (abs - (abs % 100)) / 100
  const frac = abs % 100
  return `${currency} ${sign}${major}.${String(frac).padStart(2, '0')}`
}
