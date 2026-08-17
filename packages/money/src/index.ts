/**
 * @raseed/money — the only place in the repo that does arithmetic on an amount.
 *
 * Amounts are integer minor units (paise, fils). Never a float, never a number that
 * could be rupees-with-decimals. Every function here is pure and total: it either
 * returns a Money or throws, and it never silently loses a minor unit.
 */

export type Currency = 'INR' | 'AED'

export interface Money {
  readonly minor: number
  readonly currency: Currency
}

interface CurrencyMeta {
  readonly exponent: number
  readonly symbol: string
  readonly locale: string
}

/**
 * AED displays as the ISO code, not the Arabic symbol. `د.إ` is right-to-left, so bidi
 * reordering renders `د.إ101.09` as `101.09 ﺩ.ﺇ` — the symbol jumps behind the number and
 * the glyphs re-form. UAE bank statements print "AED 101.09" for the same reason.
 * The trailing space keeps it readable; ₹ needs none.
 */
const CURRENCIES: Record<Currency, CurrencyMeta> = {
  INR: { exponent: 2, symbol: '₹', locale: 'en-IN' },
  AED: { exponent: 2, symbol: 'AED ', locale: 'en-AE' },
}

export function isCurrency(value: string): value is Currency {
  return value === 'INR' || value === 'AED'
}

export function currencyMeta(currency: Currency): CurrencyMeta {
  return CURRENCIES[currency]
}

class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}

function assertInteger(minor: number, label = 'amount'): void {
  if (!Number.isInteger(minor)) {
    throw new MoneyError(`${label} must be an integer number of minor units, got ${minor}`)
  }
  if (!Number.isSafeInteger(minor)) {
    throw new MoneyError(`${label} exceeds the safe integer range: ${minor}`)
  }
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`cannot combine ${a.currency} with ${b.currency}`)
  }
}

// ── construction ────────────────────────────────────────────────────────────

export function money(minor: number, currency: Currency): Money {
  assertInteger(minor)
  return { minor, currency }
}

export function zero(currency: Currency): Money {
  return { minor: 0, currency }
}

/**
 * Parse a human-entered major-unit string ("1234.56", "1,234.5", "-20") into minor units.
 *
 * Deliberately takes a string, not a number: `fromMajor(0.1 + 0.2, 'INR')` would be a
 * float bug at the call site, and this package exists to make that impossible.
 */
export function fromMajor(major: string, currency: Currency): Money {
  const cleaned = major.trim().replace(/,/g, '')
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(cleaned)
  if (!match || (match[2] === '' && match[3] === undefined)) {
    throw new MoneyError(`cannot parse "${major}" as a ${currency} amount`)
  }
  const exponent = CURRENCIES[currency].exponent
  const negative = match[1] === '-'
  const whole = match[2] === '' ? '0' : (match[2] ?? '0')
  const rawFraction = match[3] ?? ''
  if (rawFraction.length > exponent) {
    throw new MoneyError(
      `${currency} has ${exponent} decimal places, "${major}" has ${rawFraction.length}`,
    )
  }
  const fraction = rawFraction.padEnd(exponent, '0')
  const minor = Number(whole) * 10 ** exponent + Number(fraction === '' ? '0' : fraction)
  assertInteger(minor)
  return { minor: negative ? -minor : minor, currency }
}

// ── arithmetic ──────────────────────────────────────────────────────────────

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return money(a.minor + b.minor, a.currency)
}

export function sub(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return money(a.minor - b.minor, a.currency)
}

export function sum(amounts: readonly Money[], currency: Currency): Money {
  return amounts.reduce<Money>((acc, next) => add(acc, next), zero(currency))
}

/** Multiply by a scalar. Rounds half away from zero, so ±x behave symmetrically. */
export function mul(a: Money, factor: number): Money {
  if (!Number.isFinite(factor)) {
    throw new MoneyError(`factor must be finite, got ${factor}`)
  }
  return money(roundHalfAwayFromZero(a.minor * factor), a.currency)
}

/**
 * Divide by a scalar — a per-day rate, a per-head average.
 *
 * **This is not how you split a bill.** `allocate()` is, and the difference is the whole reason
 * this function is documented rather than obvious: dividing ₹100 by 3 gives 33.33 three times,
 * which sums to ₹99.99 and loses a paisa. `allocate` gives 34/33/33, which sums to exactly ₹100
 * because it hands the remainder out rather than rounding it away.
 *
 * So `divide` is for a *rate you display*, never for money you hand to someone. A burn rate of
 * ₹2,480 a day is a description of a trip; it is not four people's shares, and if you find
 * yourself summing the results of `divide` back up and expecting the original, you wanted
 * `allocate`.
 *
 * Division by zero throws rather than returning zero or Infinity. Zero days elapsed is a real
 * state on the morning a trip starts, and a silent 0 would render "₹0 a day" on a trip that has
 * already cost something — a wrong number that looks like a fine one. The caller has to decide
 * what to show before there is anything to average.
 */
export function divide(a: Money, divisor: number): Money {
  if (!Number.isFinite(divisor)) {
    throw new MoneyError(`divisor must be finite, got ${divisor}`)
  }
  if (divisor === 0) {
    throw new MoneyError('cannot divide money by zero')
  }
  return money(roundHalfAwayFromZero(a.minor / divisor), a.currency)
}

export function negate(a: Money): Money {
  return money(-a.minor, a.currency)
}

export function abs(a: Money): Money {
  return money(Math.abs(a.minor), a.currency)
}

function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

// ── comparison ──────────────────────────────────────────────────────────────

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b)
  if (a.minor < b.minor) return -1
  if (a.minor > b.minor) return 1
  return 0
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.minor === b.minor
}

export function isZero(a: Money): boolean {
  return a.minor === 0
}

export function isNegative(a: Money): boolean {
  return a.minor < 0
}

// ── the one that matters ────────────────────────────────────────────────────

/**
 * Split an amount without losing a minor unit.
 *
 * `allocate(money(100, 'INR'), 3)` is `[34, 33, 33]` — never `33.33 × 3`, which both
 * loses a paisa and produces a float. The remainder is distributed one minor unit at
 * a time from the front, so the sum of the parts always equals the original exactly.
 *
 * Accepts a part count or a ratio array: `allocate(bill, [2, 1])` splits two-thirds
 * to the first participant.
 */
export function allocate(amount: Money, parts: number | readonly number[]): Money[] {
  const ratios = typeof parts === 'number' ? Array.from({ length: parts }, () => 1) : [...parts]

  if (ratios.length === 0) {
    throw new MoneyError('cannot allocate across zero parts')
  }
  if (ratios.some((r) => !Number.isFinite(r) || r < 0)) {
    throw new MoneyError('allocation ratios must be finite and non-negative')
  }

  const total = ratios.reduce((acc, r) => acc + r, 0)
  if (total <= 0) {
    throw new MoneyError('allocation ratios must sum to more than zero')
  }

  // Work on the magnitude so negative amounts split as the mirror of positive ones.
  const sign = amount.minor < 0 ? -1 : 1
  const magnitude = Math.abs(amount.minor)

  const shares = ratios.map((ratio) => Math.floor((magnitude * ratio) / total))
  let remainder = magnitude - shares.reduce((acc, s) => acc + s, 0)

  // Hand the remainder out one minor unit at a time, skipping zero-ratio parts so a
  // participant who owes nothing is never handed a stray paisa.
  for (let i = 0; i < shares.length && remainder > 0; i += 1) {
    if (ratios[i] === 0) continue
    shares[i] = (shares[i] ?? 0) + 1
    remainder -= 1
  }

  return shares.map((s) => money(sign * s, amount.currency))
}

// ── fx ──────────────────────────────────────────────────────────────────────

/**
 * Convert at an explicit rate. The rate is always supplied by the caller and frozen at
 * transaction date upstream — this function never looks a rate up, so history cannot be
 * silently recomputed.
 */
export function convert(amount: Money, rate: number, to: Currency): Money {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new MoneyError(`fx rate must be a positive finite number, got ${rate}`)
  }
  if (amount.currency === to) return amount
  return money(roundHalfAwayFromZero(amount.minor * rate), to)
}

// ── formatting ──────────────────────────────────────────────────────────────

export interface FormatOptions {
  /** Include the currency symbol. Default true. */
  readonly symbol?: boolean
  /** Drop the fractional part when it is zero — for headline figures. Default false. */
  readonly compactZeroFraction?: boolean
}

/**
 * Render for display. Uses Intl for grouping (India groups 12,34,567 not 1,234,567),
 * driven off the integer minor units rather than a float.
 */
export function format(amount: Money, options: FormatOptions = {}): string {
  const { symbol = true, compactZeroFraction = false } = options
  const meta = CURRENCIES[amount.currency]
  const negative = amount.minor < 0
  const magnitude = Math.abs(amount.minor)
  const divisor = 10 ** meta.exponent
  const whole = (magnitude - (magnitude % divisor)) / divisor
  const fraction = magnitude % divisor

  const showFraction = !(compactZeroFraction && fraction === 0)
  const wholeText = new Intl.NumberFormat(meta.locale).format(whole)
  const fractionText = showFraction ? `.${String(fraction).padStart(meta.exponent, '0')}` : ''
  const prefix = symbol ? meta.symbol : ''

  return `${negative ? '-' : ''}${prefix}${wholeText}${fractionText}`
}

/** Bare digits with no symbol or grouping — for CSV, URLs and test fixtures. */
export function formatMinor(amount: Money): string {
  return `${amount.currency} ${format(amount, { symbol: false })}`
}
