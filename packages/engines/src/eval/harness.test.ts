import { describe, expect, it } from 'vitest'

import { GOLDEN } from './golden'
import { TARGETS, evaluate } from './harness'

/**
 * The golden set, run against the rules tier.
 *
 * This is what makes P3 a measurement rather than a claim. It fails with the exact strings that
 * missed, so a regression names the sentence that broke rather than moving a number.
 *
 * **The gate and the report are different questions.** The gate runs the cases the deterministic
 * tier is responsible for. The report runs everything, including the ones written to be beyond a
 * regex — word amounts, elided merchants, arithmetic in prose. Those stay in the set because a
 * benchmark trimmed to what already passes measures nothing, and they stay out of the gate
 * because a red build should mean a regression, not an unbuilt tier.
 */
describe('capture eval', () => {
  const rules = GOLDEN.filter((c) => c.tier === 'rules')
  const gate = evaluate(rules)
  const full = evaluate(GOLDEN)

  it('reports every metric the spec names, over the whole set', () => {
    const g = gate.metrics
    const f = full.metrics
    const row = (label: string, a: number, b: number) =>
      `${label.padEnd(10)} ${a.toFixed(4)}   ${b.toFixed(4)}`
    console.log(
      [
        '',
        `  gate: ${g.cases} cases / ${g.transactions} txns   full: ${f.cases} cases / ${f.transactions} txns`,
        '             rules    all',
        `  ${row('count', g.countExactMatch, f.countExactMatch)}`,
        `  ${row('amount', g.amountExactMatch, f.amountExactMatch)}`,
        `  ${row('currency', g.currencyAccuracy, f.currencyAccuracy)}`,
        `  ${row('type', g.typeAccuracy, f.typeAccuracy)}`,
        `  ${row('merchant', g.merchantTop1, f.merchantTop1)}`,
        '',
      ].join('\n'),
    )
    expect(g.cases).toBeGreaterThan(0)
    expect(f.cases).toBeGreaterThan(g.cases)
  })

  it.each([
    ['transaction count', 'countExactMatch', TARGETS.countExactMatch],
    ['amount', 'amountExactMatch', TARGETS.amountExactMatch],
    ['currency', 'currencyAccuracy', TARGETS.currencyAccuracy],
    ['type', 'typeAccuracy', TARGETS.typeAccuracy],
  ] as const)('clears the %s target on the rules tier', (_label, key, target) => {
    const actual = gate.metrics[key]
    const detail = gate.failures
      .map((f) => `  "${f.input}" — ${f.reason}\n    want ${f.expected}\n    got  ${f.actual}`)
      .join('\n')
    expect(actual, `${actual} < ${target}\n${detail}`).toBeGreaterThanOrEqual(target)
  })

  it('gets the merchant text right often enough for the resolver to work with', () => {
    expect(gate.metrics.merchantTop1).toBeGreaterThanOrEqual(TARGETS.merchantTextTop1)
  })

  /**
   * The honest half. If this ever passes, the hard cases have stopped being hard — which means
   * either the parser got much better or somebody softened the labels, and both are worth
   * noticing.
   */
  it('still fails the cases that need more than a regex', () => {
    expect(full.metrics.countExactMatch).toBeLessThan(1)
  })
})
