import { describe, expect, it } from 'vitest'
import {
  benford,
  blockBootstrap,
  ewma,
  flagAnomalies,
  gini,
  holtWinters,
  iidBootstrap,
  lorenzCurve,
  madZScore,
  mape,
  mean,
  median,
  mulberry32,
  pareto,
  quantile,
  runwayFan,
  seasonalDecompose,
} from './index'

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = Array.from({ length: 10 }, mulberry32(42))
    const b = Array.from({ length: 10 }, mulberry32(42))
    expect(a).toEqual(b)
  })

  it('differs across seeds', () => {
    expect(Array.from({ length: 5 }, mulberry32(1))).not.toEqual(
      Array.from({ length: 5 }, mulberry32(2)),
    )
  })

  it('stays in [0, 1)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 1000; i += 1) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('descriptives', () => {
  it('median handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  it('quantile interpolates and clamps', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([1, 2, 3, 4], 0)).toBe(1)
    expect(quantile([1, 2, 3, 4], 1)).toBe(4)
    expect(quantile([1, 2, 3, 4], 2)).toBe(4)
  })

  it('returns NaN for an empty series rather than 0', () => {
    expect(mean([])).toBeNaN()
    expect(median([])).toBeNaN()
  })
})

describe('madZScore', () => {
  // The reason MAD is used instead of mean/sigma.
  it('flags the outlier that mean/sigma would hide', () => {
    const daily = [200, 210, 195, 205, 190, 215, 80_000]
    const flagged = flagAnomalies(daily)
    expect(flagged).toEqual([6])
  })

  // MAD is robust, not immune — the point is that it still FLAGS what mean/sigma hides.
  it('flags an outlier that a mean/sigma z-score misses entirely', () => {
    const daily = [200, 210, 195, 205, 190, 215, 80_000]

    const m = mean(daily)
    const sd = Math.sqrt(mean(daily.map((v) => (v - m) ** 2)))
    const classicZ = Math.abs((80_000 - m) / sd)

    const robustZ = Math.abs(madZScore(daily).at(-1)!)

    // The outlier inflates sigma so much it hides itself: classic z sits around 2.4,
    // under the usual 3 threshold. The robust score is orders of magnitude past it.
    expect(classicZ).toBeLessThan(3)
    expect(robustZ).toBeGreaterThan(100)
  })

  it('returns all zeros for a constant series instead of Infinity', () => {
    expect(madZScore([5, 5, 5, 5])).toEqual([0, 0, 0, 0])
    expect(flagAnomalies([5, 5, 5, 5])).toEqual([])
  })
})

describe('ewma', () => {
  it('tracks a constant series exactly', () => {
    expect(ewma([10, 10, 10], 0.5)).toEqual([10, 10, 10])
  })

  it('lags a step change rather than jumping', () => {
    const s = ewma([0, 0, 10, 10], 0.5)
    expect(s[2]!).toBeLessThan(10)
    expect(s[3]!).toBeGreaterThan(s[2]!)
  })

  it('rejects an alpha outside (0, 1]', () => {
    expect(() => ewma([1], 0)).toThrow(/alpha/)
    expect(() => ewma([1], 1.5)).toThrow(/alpha/)
  })
})

describe('holtWinters', () => {
  // Weekly seasonality: weekends heavier, mild upward trend.
  const weekly = [
    100, 110, 105, 115, 130, 200, 210, 105, 115, 110, 120, 135, 205, 215, 110, 120, 115, 125, 140,
    210, 220, 115, 125, 120, 130, 145, 215, 225,
  ]

  it('forecasts the requested horizon', () => {
    const r = holtWinters(weekly, 7, 7)
    expect(r.forecast).toHaveLength(7)
    expect(r.fitted).toHaveLength(weekly.length)
  })

  it('keeps the weekend peak in the forecast', () => {
    const r = holtWinters(weekly, 7, 7)
    const weekdayMean = mean(r.forecast.slice(0, 5))
    const weekendMean = mean(r.forecast.slice(5))
    expect(weekendMean).toBeGreaterThan(weekdayMean)
  })

  it('detects the upward trend', () => {
    expect(holtWinters(weekly, 7, 7).trend).toBeGreaterThan(0)
  })

  // Rather than silently producing a confident wrong line.
  it('refuses fewer than two seasons', () => {
    expect(() => holtWinters([1, 2, 3, 4, 5, 6, 7], 7, 3)).toThrow(/two seasons/)
  })

  it('holdout MAPE on a well-behaved series is reasonable', () => {
    const train = weekly.slice(0, 21)
    const holdout = weekly.slice(21)
    const r = holtWinters(train, 7, holdout.length)
    expect(mape(holdout, r.forecast)).toBeLessThan(0.15)
  })
})

describe('bootstrap', () => {
  const rng = () => 0.5
  const series = [100, 120, 90, 110, 300, 280, 95]

  it('produces the requested shape', () => {
    const paths = blockBootstrap(series, 14, 50, mulberry32(1))
    expect(paths).toHaveLength(50)
    expect(paths[0]).toHaveLength(14)
  })

  it('is deterministic for a given seed', () => {
    expect(blockBootstrap(series, 10, 5, mulberry32(9))).toEqual(
      blockBootstrap(series, 10, 5, mulberry32(9)),
    )
  })

  it('only ever emits values from the source series', () => {
    const allowed = new Set(series)
    for (const path of blockBootstrap(series, 20, 20, mulberry32(3))) {
      for (const v of path) expect(allowed.has(v)).toBe(true)
    }
  })

  // The whole reason block bootstrap exists: IID destroys autocorrelation and
  // produces a fan that is too narrow, which quietly understates the risk.
  it('produces a strictly wider fan than IID on autocorrelated data', () => {
    const autocorrelated = Array.from({ length: 70 }, (_, i) => (Math.floor(i / 7) % 2 === 0 ? 100 : 400))

    const spread = (paths: number[][]) => {
      const totals = paths.map((p) => p.reduce((a, b) => a + b, 0))
      return quantile(totals, 0.9) - quantile(totals, 0.1)
    }

    const block = spread(blockBootstrap(autocorrelated, 28, 2000, mulberry32(11), 7))
    const iid = spread(iidBootstrap(autocorrelated, 28, 2000, mulberry32(11)))
    expect(block).toBeGreaterThan(iid)
  })

  it('rejects an empty series', () => {
    expect(() => blockBootstrap([], 5, 5, rng)).toThrow(/empty/)
  })
})

describe('runwayFan', () => {
  it('orders the percentiles and reports P(within pool)', () => {
    const paths = blockBootstrap([100, 200, 300], 10, 500, mulberry32(5))
    const fan = runwayFan(paths, 2000)
    expect(fan.p10).toBeLessThanOrEqual(fan.p50)
    expect(fan.p50).toBeLessThanOrEqual(fan.p90)
    expect(fan.probabilityWithinPool).toBeGreaterThanOrEqual(0)
    expect(fan.probabilityWithinPool).toBeLessThanOrEqual(1)
  })

  it('is certain when the pool dwarfs the spend', () => {
    const paths = blockBootstrap([1, 1, 1], 5, 100, mulberry32(2))
    expect(runwayFan(paths, 1_000_000).probabilityWithinPool).toBe(1)
  })
})

describe('benford', () => {
  it('fits a Benford-distributed sample', () => {
    // 10^U for U uniform on [0,6) is Benford by construction: the mantissa is
    // log-uniform, which is exactly what Benford's law describes. Seeded, so this
    // is a fixed sample rather than a flaky one.
    const rng = mulberry32(20_260_816)
    const values = Array.from({ length: 3000 }, () => 10 ** (rng() * 6))
    const r = benford(values)
    expect(r.n).toBe(3000)
    expect(r.chiSquare).toBeLessThan(15.51) // χ² critical, 8 df, p=0.05
  })

  it('flags a uniform-first-digit sample as non-conforming', () => {
    const values: number[] = []
    for (let d = 1; d <= 9; d += 1) for (let i = 0; i < 50; i += 1) values.push(d * 1000 + i)
    expect(benford(values).chiSquare).toBeGreaterThan(15.51)
  })

  it('ignores zeros, which have no first digit', () => {
    expect(benford([0, 0, 0]).n).toBe(0)
  })
})

describe('gini and lorenz', () => {
  it('is 0 for perfectly even spending', () => {
    expect(gini([100, 100, 100, 100])).toBeCloseTo(0, 6)
  })

  it('approaches 1 when one merchant takes everything', () => {
    expect(gini([0.0001, 0.0001, 0.0001, 1_000_000])).toBeGreaterThan(0.7)
  })

  it('is 0 for a single value or an empty set', () => {
    expect(gini([500])).toBe(0)
    expect(gini([])).toBe(0)
  })

  it('the Lorenz curve starts at the origin and ends at (1,1)', () => {
    const curve = lorenzCurve([10, 20, 30, 40])
    expect(curve[0]).toEqual({ populationShare: 0, valueShare: 0 })
    expect(curve.at(-1)!.populationShare).toBeCloseTo(1, 6)
    expect(curve.at(-1)!.valueShare).toBeCloseTo(1, 6)
  })

  it('the Lorenz curve is monotonic and convex-from-below', () => {
    const curve = lorenzCurve([10, 20, 30, 40])
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i]!.valueShare).toBeGreaterThanOrEqual(curve[i - 1]!.valueShare)
      // Sorted ascending, so each point sits on or below the equality line.
      expect(curve[i]!.valueShare).toBeLessThanOrEqual(curve[i]!.populationShare + 1e-9)
    }
  })
})

describe('pareto', () => {
  it('ranks descending and reaches a cumulative share of 1', () => {
    const p = pareto([
      { item: 'swiggy', value: 5000 },
      { item: 'chai', value: 200 },
      { item: 'rent', value: 30_000 },
    ])
    expect(p[0]?.item).toBe('rent')
    expect(p.at(-1)!.cumulativeShare).toBeCloseTo(1, 6)
  })

  it('identifies the 20% that make up 80%', () => {
    const items = [
      { item: 'a', value: 800 },
      { item: 'b', value: 100 },
      { item: 'c', value: 50 },
      { item: 'd', value: 30 },
      { item: 'e', value: 20 },
    ]
    const p = pareto(items)
    const vital = p.findIndex((e) => e.cumulativeShare >= 0.8)
    expect(vital).toBe(0)
  })

  it('is empty when everything is zero', () => {
    expect(pareto([{ item: 'a', value: 0 }])).toEqual([])
  })
})

describe('seasonalDecompose', () => {
  const weekly = Array.from({ length: 28 }, (_, i) => (i % 7 >= 5 ? 300 : 100) + i)

  it('recovers a weekend seasonal bump', () => {
    const d = seasonalDecompose(weekly, 7)
    expect(d.seasonal[5]!).toBeGreaterThan(d.seasonal[0]!)
    expect(d.seasonal[6]!).toBeGreaterThan(d.seasonal[0]!)
  })

  it('seasonal indices sum to approximately zero', () => {
    const d = seasonalDecompose(weekly, 7)
    expect(mean(d.seasonal.slice(0, 7))).toBeCloseTo(0, 6)
  })

  it('leaves small residuals on a clean series', () => {
    const d = seasonalDecompose(weekly, 7)
    const finite = d.residual.filter((r) => !Number.isNaN(r))
    expect(Math.max(...finite.map(Math.abs))).toBeLessThan(30)
  })

  it('refuses fewer than two seasons', () => {
    expect(() => seasonalDecompose([1, 2, 3], 7)).toThrow(/two seasons/)
  })
})
