import { parseCapture, type CaptureResult } from '../domain/parseCapture'
import type { GoldenCase, GoldenTransaction } from './golden'

/**
 * The eval harness.
 *
 * `MOBILE_ARCHITECTURE.md` §7 names the metrics and their targets; this computes them. The point
 * is not the numbers looking good — it is that changing the parser changes a number you can see,
 * so a "small improvement" that quietly breaks Hinglish is caught by a diff rather than by
 * someone noticing months later.
 *
 * Pure, like everything else in this package: it takes the cases and a parse function and
 * returns a report. Nothing is printed, nothing is written, no clock is read.
 */

export interface EvalMetrics {
  /** Did we return the right *number* of transactions? The one that gates all the others. */
  readonly countExactMatch: number
  /** Of matched positions, the share whose amount is exactly right. */
  readonly amountExactMatch: number
  readonly currencyAccuracy: number
  /** Spend vs transfer vs income. Getting this wrong misstates your total. */
  readonly typeAccuracy: number
  /** Merchant text, compared after normalisation. */
  readonly merchantTop1: number
  readonly cases: number
  readonly transactions: number
}

export interface EvalFailure {
  readonly input: string
  readonly reason: string
  readonly expected: string
  readonly actual: string
}

export interface EvalReport {
  readonly metrics: EvalMetrics
  /** Every case that missed, with what it should have been. The useful half of the output. */
  readonly failures: readonly EvalFailure[]
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

function describe(t: GoldenTransaction): string {
  return `${t.currency} ${t.amountMinor} ${t.type} "${t.merchant}"`
}

function describeActual(d: CaptureResult['drafts'][number]): string {
  return `${d.currency} ${d.amountMinor} ${d.type} "${norm(d.merchantText)}"`
}

/**
 * Score a set of cases.
 *
 * Pass the whole golden set for the report and the `'rules'` subset for the gate — see the
 * `tier` field on `GoldenCase` for why those are different questions.
 */
export function evaluate(
  cases: readonly GoldenCase[],
  parse: typeof parseCapture = parseCapture,
): EvalReport {
  const failures: EvalFailure[] = []

  let countHits = 0
  let compared = 0
  let amountHits = 0
  let currencyHits = 0
  let typeHits = 0
  let merchantHits = 0
  let transactions = 0

  for (const testCase of cases) {
    const result = parse(testCase.input, { defaultCurrency: testCase.defaultCurrency })
    transactions += testCase.expect.length

    const countOk = result.drafts.length === testCase.expect.length
    if (countOk) countHits += 1
    else {
      failures.push({
        input: testCase.input,
        reason: 'transaction count',
        expected: String(testCase.expect.length),
        actual: `${result.drafts.length}${result.unparsed.length ? ` (unparsed: ${result.unparsed.join(' | ')})` : ''}`,
      })
    }

    // Compare positionally over the overlap. A count miss still contributes what it got right,
    // so a parser that drops the third clause is not scored as though it also broke the first
    // two — the count metric is where that failure is already recorded.
    const pairs = Math.min(result.drafts.length, testCase.expect.length)
    for (let i = 0; i < pairs; i += 1) {
      const want = testCase.expect[i]!
      const got = result.drafts[i]!
      compared += 1

      const amountOk = got.amountMinor === want.amountMinor
      const currencyOk = got.currency === want.currency
      const typeOk = got.type === want.type
      const merchantOk = norm(got.merchantText) === norm(want.merchant)

      if (amountOk) amountHits += 1
      if (currencyOk) currencyHits += 1
      if (typeOk) typeHits += 1
      if (merchantOk) merchantHits += 1

      if (!(amountOk && currencyOk && typeOk && merchantOk)) {
        failures.push({
          input: testCase.input,
          reason: [
            !amountOk && 'amount',
            !currencyOk && 'currency',
            !typeOk && 'type',
            !merchantOk && 'merchant',
          ]
            .filter(Boolean)
            .join(' + '),
          expected: describe(want),
          actual: describeActual(got),
        })
      }
    }
  }

  const share = (hits: number, total: number) =>
    total === 0 ? 0 : Math.round((hits / total) * 10_000) / 10_000

  return {
    metrics: {
      countExactMatch: share(countHits, cases.length),
      amountExactMatch: share(amountHits, compared),
      currencyAccuracy: share(currencyHits, compared),
      typeAccuracy: share(typeHits, compared),
      merchantTop1: share(merchantHits, compared),
      cases: cases.length,
      transactions,
    },
    failures,
  }
}

/**
 * The targets from `MOBILE_ARCHITECTURE.md` §7.
 *
 * `merchantTop1` is the spec's 0.90 *after 30 days of alias learning* — the resolver, not the
 * parser. What this measures is the raw text the parser hands the resolver, so the bar here is
 * deliberately lower and labelled as a different thing rather than quietly reusing the number.
 */
export const TARGETS = {
  countExactMatch: 0.95,
  amountExactMatch: 0.98,
  currencyAccuracy: 0.99,
  typeAccuracy: 0.97,
  merchantTextTop1: 0.85,
} as const
