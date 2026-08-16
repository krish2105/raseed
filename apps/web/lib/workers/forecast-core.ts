import { blockBootstrap, holtWinters, mulberry32, runwayFan, smape } from '@raseed/engines'

/**
 * The forecast computation, in plain numbers.
 *
 * Lives apart from both the worker and the analytics layer because it has to run in two
 * places — inside the worker normally, and on the main thread on the one browser that
 * cannot spawn a module worker. Two copies of this maths would eventually disagree, and a
 * forecast that differs by environment is worse than no forecast.
 *
 * Nothing here touches the DOM, the DuckDB connection, or `Money`. It takes minor units in
 * and gives minor units back, so it is structured-cloneable in both directions.
 */

/** Weekly seasonality. Daily spend rhymes with the day of the week, not the month. */
const SEASON = 7

/**
 * 10,000 paths, as `WEB_ARCHITECTURE.md` specifies.
 *
 * Honestly: this is not why the worker exists. 10,000 paths over a 14-day horizon is 140k
 * samples and measures ~7ms — it would not have blocked anything. The architecture doc
 * names Monte Carlo as the heavy work, and on this data it simply is not; the Arrow
 * encoding next door is two orders of magnitude worse. The forecast rides along because
 * it is already in the worker, not because it needed rescuing.
 */
const PATHS = 10_000

/** Fixed so the fan is identical across reloads. A forecast that jitters looks broken. */
const SEED = 20_260_816

export interface ForecastInput {
  values: number[]
  horizon: number
  poolMinor?: number
}

export interface ForecastOutput {
  fitted: number[]
  forecast: number[]
  accuracy: number
  p10: number
  p50: number
  p90: number
  probabilityWithinPool: number
  fellBack: boolean
  paths: number
  computeMs: number
}

/** Sum a daily series into consecutive 7-day buckets. */
function weekly(xs: readonly number[]): number[] {
  const out: number[] = []
  for (let i = 0; i + SEASON <= xs.length; i += SEASON) {
    out.push(xs.slice(i, i + SEASON).reduce((a, b) => a + b, 0))
  }
  return out
}

/**
 * Holt-Winters over daily spend with a weekly season, plus a block-bootstrap fan.
 *
 * Block bootstrap, not IID: daily spend is autocorrelated — a heavy Saturday follows a
 * heavy Friday — and IID sampling produces a fan that is far too narrow and quietly
 * understates the risk.
 */
export function computeForecast({ values, horizon, poolMinor }: ForecastInput): ForecastOutput {
  const started = performance.now()
  const enough = values.length >= SEASON * 3
  const rng = mulberry32(SEED)

  let fitted: number[] = []
  let points: number[] = []
  let error = Number.NaN
  let fellBack = false

  if (enough) {
    const holdout = Math.min(14, Math.floor(values.length / 5))
    const train = values.slice(0, values.length - holdout)
    const actual = values.slice(values.length - holdout)

    const check = holtWinters(train, SEASON, holdout)
    error = smape(weekly(actual), weekly(check.forecast))

    const full = holtWinters(values, SEASON, horizon)
    fitted = full.fitted
    points = full.forecast
  } else {
    // Under three seasons Holt-Winters is not trustworthy. Say so rather than draw a
    // confident wrong line.
    fellBack = true
    const sorted = [...values].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0
    points = Array.from({ length: horizon }, () => median)
    fitted = values
  }

  const paths = blockBootstrap(values.length > 0 ? values : [0], horizon, PATHS, rng, SEASON)
  const pool = poolMinor ?? points.reduce((a, b) => a + b, 0) * 1.2
  const fan = runwayFan(paths, pool)

  return {
    fitted,
    forecast: points,
    accuracy: error,
    p10: fan.p10,
    p50: fan.p50,
    p90: fan.p90,
    probabilityWithinPool: fan.probabilityWithinPool,
    fellBack,
    paths: PATHS,
    computeMs: Math.round(performance.now() - started),
  }
}
