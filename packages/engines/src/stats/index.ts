/**
 * Statistics. Robust by default — personal spend data is small, skewed, autocorrelated and
 * full of one-off outliers, which is exactly where the textbook estimators mislead.
 */

export type Rng = () => number

/**
 * Mulberry32 — a small, fast, seeded PRNG. Same seed always yields the same sequence, so
 * the demo ledger and the test fixtures are byte-identical every run.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!
}

/** Population standard deviation. */
export function stdev(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const m = mean(values)
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length)
}

/** Relative dispersion. Infinite when the mean is zero, which callers treat as "no pattern". */
export function coefficientOfVariation(values: readonly number[]): number {
  const m = mean(values)
  if (m === 0) return Number.POSITIVE_INFINITY
  return stdev(values) / Math.abs(m)
}

/** Linear-interpolation quantile, q in [0,1]. */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN
  const s = [...values].sort((a, b) => a - b)
  const pos = (s.length - 1) * Math.min(1, Math.max(0, q))
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return s[lo]!
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo)
}

// ── robust outlier detection ────────────────────────────────────────────────

/**
 * Median absolute deviation z-score.
 *
 * Mean/σ breaks the moment one ₹80,000 flight lands in the window — the outlier inflates σ
 * and hides itself. MAD does not move.
 */
export function madZScore(values: readonly number[]): number[] {
  const med = median(values)
  const mad = median(values.map((v) => Math.abs(v - med)))
  // All-identical input has MAD 0; every point is exactly typical, so z is 0, not Infinity.
  if (mad === 0) return values.map(() => 0)
  return values.map((v) => (0.6745 * (v - med)) / mad)
}

export function flagAnomalies(values: readonly number[], threshold = 3.5): number[] {
  const z = madZScore(values)
  return z.map((v, i) => (Math.abs(v) > threshold ? i : -1)).filter((i) => i >= 0)
}

// ── smoothing and forecasting ───────────────────────────────────────────────

/** Exponentially weighted moving average. */
export function ewma(values: readonly number[], alpha: number): number[] {
  if (alpha <= 0 || alpha > 1) throw new Error('alpha must be in (0, 1]')
  const out: number[] = []
  let prev = values[0] ?? 0
  for (const v of values) {
    prev = alpha * v + (1 - alpha) * prev
    out.push(prev)
  }
  return out
}

export interface HoltWintersResult {
  readonly fitted: number[]
  readonly forecast: number[]
  readonly level: number
  readonly trend: number
  readonly seasonal: number[]
}

/**
 * Additive Holt-Winters (level / trend / seasonal).
 *
 * Needs about two full seasonal cycles; with less, the caller should fall back to a
 * trailing median and say so on screen rather than showing a confident wrong line.
 */
export function holtWinters(
  values: readonly number[],
  seasonLength: number,
  horizon: number,
  params: { alpha?: number; beta?: number; gamma?: number } = {},
): HoltWintersResult {
  const { alpha = 0.3, beta = 0.1, gamma = 0.2 } = params

  if (seasonLength < 1) throw new Error('seasonLength must be at least 1')
  if (values.length < seasonLength * 2) {
    throw new Error(`holtWinters needs at least two seasons (${seasonLength * 2} points)`)
  }

  const seasons = Math.floor(values.length / seasonLength)
  const seasonAverages: number[] = []
  for (let s = 0; s < seasons; s += 1) {
    seasonAverages.push(mean(values.slice(s * seasonLength, (s + 1) * seasonLength)))
  }

  // Initial seasonal indices: average deviation of each slot from its season's mean.
  const seasonal: number[] = []
  for (let i = 0; i < seasonLength; i += 1) {
    let acc = 0
    for (let s = 0; s < seasons; s += 1) acc += values[s * seasonLength + i]! - seasonAverages[s]!
    seasonal.push(acc / seasons)
  }

  let level = seasonAverages[0]!
  let trend = (seasonAverages[Math.min(1, seasons - 1)]! - seasonAverages[0]!) / seasonLength
  const fitted: number[] = []

  for (let t = 0; t < values.length; t += 1) {
    const slot = t % seasonLength
    const prediction = level + trend + seasonal[slot]!
    fitted.push(prediction)

    const observed = values[t]!
    const previousLevel = level
    level = alpha * (observed - seasonal[slot]!) + (1 - alpha) * (level + trend)
    trend = beta * (level - previousLevel) + (1 - beta) * trend
    seasonal[slot] = gamma * (observed - level) + (1 - gamma) * seasonal[slot]!
  }

  const forecast: number[] = []
  for (let h = 1; h <= horizon; h += 1) {
    forecast.push(level + h * trend + seasonal[(values.length + h - 1) % seasonLength]!)
  }

  return { fitted, forecast, level, trend, seasonal: [...seasonal] }
}

/** Mean absolute percentage error, ignoring zero actuals. */
export function mape(actual: readonly number[], predicted: readonly number[]): number {
  const pairs = actual
    .map((a, i) => [a, predicted[i]] as const)
    .filter((p): p is readonly [number, number] => p[1] !== undefined && p[0] !== 0)
  if (pairs.length === 0) return Number.NaN
  return mean(pairs.map(([a, p]) => Math.abs((a - p) / a)))
}

// ── bootstrap ───────────────────────────────────────────────────────────────

/**
 * Moving-block bootstrap.
 *
 * Daily spend is autocorrelated — a heavy Saturday follows a heavy Friday. IID resampling
 * destroys that structure and produces a fan far too narrow, which quietly lies to you.
 * Sampling contiguous blocks preserves it.
 */
export function blockBootstrap(
  series: readonly number[],
  horizon: number,
  paths: number,
  rng: Rng,
  blockLength = 7,
): number[][] {
  if (series.length === 0) throw new Error('series must not be empty')
  if (blockLength < 1) throw new Error('blockLength must be at least 1')

  const usableBlock = Math.min(blockLength, series.length)
  const out: number[][] = []

  for (let p = 0; p < paths; p += 1) {
    const path: number[] = []
    while (path.length < horizon) {
      const start = Math.floor(rng() * series.length)
      for (let i = 0; i < usableBlock && path.length < horizon; i += 1) {
        path.push(series[(start + i) % series.length]!)
      }
    }
    out.push(path)
  }
  return out
}

/** IID resampling — kept only so the fan widths can be compared and the difference shown. */
export function iidBootstrap(
  series: readonly number[],
  horizon: number,
  paths: number,
  rng: Rng,
): number[][] {
  return blockBootstrap(series, horizon, paths, rng, 1)
}

export interface RunwayFan {
  readonly p10: number
  readonly p50: number
  readonly p90: number
  /** Share of simulated paths whose cumulative spend stayed within the pool. */
  readonly probabilityWithinPool: number
}

/** Cumulative-spend fan to the next payday, plus P(you make it). */
export function runwayFan(paths: readonly number[][], poolMinor: number): RunwayFan {
  const totals = paths.map((p) => p.reduce((a, b) => a + b, 0))
  return {
    p10: quantile(totals, 0.1),
    p50: quantile(totals, 0.5),
    p90: quantile(totals, 0.9),
    probabilityWithinPool: totals.filter((t) => t <= poolMinor).length / (totals.length || 1),
  }
}

// ── concentration and audit ─────────────────────────────────────────────────

/**
 * Benford's Law first-digit χ². Flags data-entry errors and duplicated rows.
 *
 * Only meaningful over a wide magnitude range — a column of ₹200 chai purchases will fail
 * Benford for entirely innocent reasons, so callers should gate on sample size and spread.
 */
export function benford(values: readonly number[]): {
  observed: number[]
  expected: number[]
  chiSquare: number
  n: number
} {
  const counts = new Array<number>(9).fill(0)
  let n = 0
  for (const v of values) {
    const digits = Math.abs(Math.trunc(v)).toString()
    const first = Number(digits[0])
    if (!first || first < 1) continue
    counts[first - 1] = (counts[first - 1] ?? 0) + 1
    n += 1
  }

  const expected = Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1)) * n)
  const chiSquare = counts.reduce((acc, observed, i) => {
    const e = expected[i]!
    return e === 0 ? acc : acc + (observed - e) ** 2 / e
  }, 0)

  return { observed: counts, expected, chiSquare, n }
}

/**
 * Gini coefficient of spending concentration, 0 (even) to 1 (all in one place).
 * Uses the trapezoidal Lorenz-curve form.
 */
export function gini(values: readonly number[]): number {
  const positive = values.filter((v) => v > 0).sort((a, b) => a - b)
  const n = positive.length
  if (n === 0) return 0
  if (n === 1) return 0

  const total = positive.reduce((a, b) => a + b, 0)
  if (total === 0) return 0

  // G = (2·Σ i·xᵢ) / (n·Σxᵢ) − (n+1)/n
  let weighted = 0
  for (let i = 0; i < n; i += 1) weighted += (i + 1) * positive[i]!
  return (2 * weighted) / (n * total) - (n + 1) / n
}

export interface LorenzPoint {
  readonly populationShare: number
  readonly valueShare: number
}

export function lorenzCurve(values: readonly number[]): LorenzPoint[] {
  const positive = values.filter((v) => v > 0).sort((a, b) => a - b)
  const total = positive.reduce((a, b) => a + b, 0)
  const points: LorenzPoint[] = [{ populationShare: 0, valueShare: 0 }]
  if (total === 0) return points

  let cumulative = 0
  positive.forEach((v, i) => {
    cumulative += v
    points.push({ populationShare: (i + 1) / positive.length, valueShare: cumulative / total })
  })
  return points
}

export interface ParetoEntry<T> {
  readonly item: T
  readonly value: number
  readonly cumulativeShare: number
}

/** Which 20% of merchants are 80% of spend. */
export function pareto<T>(items: readonly { item: T; value: number }[]): ParetoEntry<T>[] {
  const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value)
  const total = sorted.reduce((a, b) => a + b.value, 0)
  if (total === 0) return []

  let cumulative = 0
  return sorted.map(({ item, value }) => {
    cumulative += value
    return { item, value, cumulativeShare: cumulative / total }
  })
}

// ── seasonal decomposition ──────────────────────────────────────────────────

export interface Decomposition {
  readonly trend: number[]
  readonly seasonal: number[]
  readonly residual: number[]
}

/** Additive decomposition via a centred moving average. */
export function seasonalDecompose(values: readonly number[], seasonLength: number): Decomposition {
  if (seasonLength < 1) throw new Error('seasonLength must be at least 1')
  if (values.length < seasonLength * 2) {
    throw new Error(`seasonalDecompose needs at least two seasons (${seasonLength * 2} points)`)
  }

  const half = Math.floor(seasonLength / 2)
  const trend = values.map((_, i) => {
    const lo = i - half
    const hi = i + half
    if (lo < 0 || hi >= values.length) return Number.NaN
    return mean(values.slice(lo, hi + 1))
  })

  const detrended = values.map((v, i) => (Number.isNaN(trend[i]!) ? Number.NaN : v - trend[i]!))

  // Average each slot's detrended value, then centre so the indices sum to zero.
  const slotMeans: number[] = []
  for (let slot = 0; slot < seasonLength; slot += 1) {
    const slotValues: number[] = []
    for (let i = slot; i < detrended.length; i += seasonLength) {
      if (!Number.isNaN(detrended[i]!)) slotValues.push(detrended[i]!)
    }
    slotMeans.push(slotValues.length ? mean(slotValues) : 0)
  }
  const centre = mean(slotMeans)
  const centred = slotMeans.map((m) => m - centre)

  const seasonal = values.map((_, i) => centred[i % seasonLength]!)
  const residual = values.map((v, i) =>
    Number.isNaN(trend[i]!) ? Number.NaN : v - trend[i]! - seasonal[i]!,
  )

  return { trend, seasonal, residual }
}
