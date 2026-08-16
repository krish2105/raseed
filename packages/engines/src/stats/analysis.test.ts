import { describe, expect, it } from 'vitest'
import { changePoints } from './changePoints'
import { riskProfile } from './risk'
import { concentrationOf } from './entropy'
import { mulberry32, seasonalDecompose, varianceExplained } from './index'

/** Seeded, so a failure is always the code and never the draw. */
function noisy(n: number, level: (i: number) => number, spread: number): number[] {
  const rng = mulberry32(20_260_816)
  return Array.from({ length: n }, (_, i) => level(i) + (rng() - 0.5) * spread)
}

describe('changePoints', () => {
  it('finds nothing in a stationary series', () => {
    expect(changePoints(noisy(120, () => 1000, 80))).toEqual([])
  })

  it('finds nothing in a series too short to judge', () => {
    expect(changePoints([1, 2, 3, 4, 5])).toEqual([])
  })

  it('finds a step up, and puts it near the truth', () => {
    // 45 days around 1,000, then 45 days around 2,000.
    const points = changePoints(noisy(90, (i) => (i < 45 ? 1000 : 2000), 120))

    expect(points.length).toBeGreaterThanOrEqual(1)
    const first = points[0]!
    // CUSUM signals after the shift has accumulated, so it lags. Demanding the exact index
    // would be testing the lag, not the detection.
    expect(first.index).toBeGreaterThan(40)
    expect(first.index).toBeLessThan(65)
    expect(first.delta).toBeGreaterThan(0)
  })

  it('finds a step down and signs it correctly', () => {
    const first = changePoints(noisy(90, (i) => (i < 45 ? 3000 : 1000), 120))[0]
    expect(first).toBeDefined()
    expect(first!.delta).toBeLessThan(0)
  })

  it('survives a run of identical values without dividing by zero', () => {
    const series = [...new Array<number>(40).fill(500), ...new Array<number>(40).fill(900)]
    expect(() => changePoints(series)).not.toThrow()
    expect(changePoints(series).every((p) => Number.isFinite(p.magnitude))).toBe(true)
  })
})

describe('riskProfile', () => {
  it('is empty-safe', () => {
    expect(riskProfile([]).observations).toBe(0)
  })

  it('puts VaR at the stated tail and CVaR beyond it', () => {
    const months = [10, 12, 11, 13, 12, 11, 14, 12, 13, 11, 12, 13, 12, 11, 12, 13, 12, 11, 12, 40]
    const r = riskProfile(months, 0.95)

    // Exactly one of twenty months must exceed the threshold — that is what 95% means.
    expect(months.filter((m) => m > r.valueAtRisk)).toHaveLength(1)
    expect(r.conditionalValueAtRisk).toBeGreaterThanOrEqual(r.valueAtRisk)
    expect(r.typical).toBe(12)
    expect(r.shortfall).toBeGreaterThan(0)
    expect(r.observations).toBe(20)
    // The tail INCLUDES the VaR observation — CVaR is E[X | X ≥ VaR], not E[X | X > VaR].
    expect(r.tailSize).toBe(2)
  })

  /**
   * The presentation trap. At 95% over a short history the tail is a single month, so CVaR
   * is that month and equals VaR exactly. Reporting both as separate figures would imply an
   * average over a distribution that has one point in it.
   */
  it('reports a single-observation tail so the UI can stop pretending', () => {
    const short = Array.from({ length: 17 }, (_, i) => 100 + i)
    const r = riskProfile(short, 0.95)
    expect(r.tailSize).toBe(1)
    expect(r.conditionalValueAtRisk).toBe(r.valueAtRisk)
  })

  it('reports a real tail once there is enough history to have one', () => {
    const long = Array.from({ length: 120 }, (_, i) => 100 + i)
    const r = riskProfile(long, 0.95)
    expect(r.tailSize).toBeGreaterThan(1)
    expect(r.conditionalValueAtRisk).toBeGreaterThan(r.valueAtRisk)
  })

  /**
   * The whole reason this is historical and not a fitted normal. Spending is right-skewed;
   * a normal fit puts VaR near mean + 1.64σ and misses a tail this fat every time.
   */
  it('does not flatten a fat tail the way a normal fit would', () => {
    const skewed = [...new Array<number>(19).fill(100), 1000]
    const r = riskProfile(skewed, 0.95)

    // VaR alone says 100 and looks harmless — that is the famous flaw, and exactly why
    // CVaR is reported beside it. CVaR averages the tail and sees the 1,000.
    expect(r.valueAtRisk).toBe(100)
    expect(r.conditionalValueAtRisk).toBeGreaterThan(500)
    expect(r.shortfall).toBeGreaterThan(400)
  })

  it('never reports a negative shortfall', () => {
    expect(riskProfile([5, 5, 5, 5]).shortfall).toBe(0)
  })
})

describe('varianceExplained', () => {
  it('is near 1 for a series that is purely a weekly shape', () => {
    const weekly = [100, 100, 100, 100, 300, 500, 400] // quiet weekdays, heavy weekend
    const series = Array.from({ length: 70 }, (_, i) => weekly[i % 7] as number)
    expect(varianceExplained(series, seasonalDecompose(series, 7))).toBeGreaterThan(0.9)
  })

  /** The honest half: on noise it must report low, not invent a story about a bump. */
  it('reports low explanatory power on noise rather than pretending', () => {
    const noise = noisy(70, () => 500, 1800)
    expect(varianceExplained(noise, seasonalDecompose(noise, 7))).toBeLessThan(0.75)
  })

  it('is 0 on a flat series, where there is no movement to explain', () => {
    const flat = new Array<number>(30).fill(400)
    expect(varianceExplained(flat, seasonalDecompose(flat, 7))).toBe(0)
  })
})

describe('concentrationOf', () => {
  it('is empty-safe', () => {
    expect(concentrationOf([]).effectiveCount).toBe(0)
    expect(concentrationOf([0, 0]).effectiveCount).toBe(0)
  })

  it('counts four even destinations as exactly four', () => {
    const c = concentrationOf([250, 250, 250, 250])
    expect(c.effectiveCount).toBeCloseTo(4, 6)
    expect(c.entropy).toBeCloseTo(2, 6)
    expect(c.evenness).toBeCloseTo(1, 6)
  })

  it('counts one destination as one, with zero entropy', () => {
    const c = concentrationOf([1000])
    expect(c.entropy).toBe(0)
    expect(c.effectiveCount).toBe(1)
  })

  /** The point of the measure: twenty categories can still be effectively two. */
  it('sees through a long tail that the category count cannot', () => {
    const skewed = [9000, 900, ...new Array<number>(18).fill(5)]
    const c = concentrationOf(skewed)
    expect(c.nominalCount).toBe(20)
    expect(c.effectiveCount).toBeLessThan(3)
    expect(c.evenness).toBeLessThan(0.2)
  })

  it('ignores refunds rather than treating them as destinations', () => {
    expect(concentrationOf([500, 500, -200]).nominalCount).toBe(2)
  })
})
