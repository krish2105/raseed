'use client'

import { motion, useReducedMotion } from 'motion/react'
import { format, money } from '@raseed/money'
import { Panel } from '@/components/ui/panel'
import { Figure } from '@/components/ui/figure'
import { FigureSkeleton, Skeleton } from '@/components/ui/skeleton'
import { PanelError } from '@/components/ui/panel-error'
import { useDuckQuery } from '@/lib/duck/provider'
import { useCurrencyLens } from '@/components/shell/currency-lens'
import { forecast } from '@/lib/duck/analytics'
import { lensCurrency } from '@/lib/duck/queries'

const HORIZON = 14

/**
 * Holt-Winters point forecast with a block-bootstrap fan.
 *
 * Projected money is drawn in `--horizon`, never in the currency colours — a forecast that
 * looks like an actual is a forecast someone will act on as though it were one. Holdout
 * MAPE is on screen: a forecast without an error bar is decoration.
 */
export function ForecastClient() {
  const [lens] = useCurrencyLens()
  const reduceMotion = useReducedMotion()
  const fc = useDuckQuery(() => forecast(lens, HORIZON), [lens])
  const currency = lensCurrency(lens)

  const W = 1000
  const H = 260

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Forecast</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-lo">
          Triple exponential smoothing over your daily spend with a weekly season, and a fan
          from a moving-block bootstrap. Blocks, not IID — daily spend is autocorrelated, and
          IID sampling produces a fan that is far too narrow and quietly understates the risk.
        </p>
        {fc.data && (
          <p className="mt-2 font-mono text-xs text-text-lo" data-testid="compute-provenance">
            {fc.data.paths.toLocaleString('en-IN')} paths in{' '}
            <span className="tabular">{fc.data.computeMs}ms</span>
            {fc.data.offMainThread
              ? ' — in a worker, so the page never blocked'
              : ' — inline; this browser refused a worker'}
          </p>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fc.data ? (
          <>
            <Panel>
              <Figure
                label="P50 · next 14 days"
                value={format(fc.data.p50, { compactZeroFraction: true })}
                hint="median simulated total"
              />
            </Panel>
            <Panel>
              <Figure
                label="P90 · the bad case"
                value={format(fc.data.p90, { compactZeroFraction: true })}
                hint="9 runs in 10 come in under this"
              />
            </Panel>
            <Panel>
              <Figure
                label="Stays in budget"
                value={`${(fc.data.probabilityWithinPool * 100).toFixed(0)}%`}
                hint={`${fc.data.paths.toLocaleString('en-IN')} bootstrap paths`}
              />
            </Panel>
            <Panel>
              <Figure
                label="Holdout error"
                value={
                  Number.isFinite(fc.data.accuracy)
                    ? `${(fc.data.accuracy * 100).toFixed(1)}%`
                    : 'n/a'
                }
                hint={fc.data.fellBack ? 'fell back to trailing median' : 'sMAPE, weekly totals'}
              />
            </Panel>
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => (
            <Panel key={i}>
              <FigureSkeleton />
            </Panel>
          ))
        )}
      </div>

      <Panel title="Daily spend and the next 14 days" className="mt-3">
        {fc.error ? (
          <PanelError message={fc.error} />
        ) : !fc.data ? (
          <Skeleton className="h-[260px] w-full" />
        ) : (
          (() => {
            const hist = fc.data.history.map((h) => h.minor)
            const proj = fc.data.forecast
            const all = [...hist, ...proj]
            const peak = Math.max(...all, 1)
            const step = W / Math.max(1, all.length - 1)
            const y = (v: number) => H - (v / peak) * (H - 12) - 6

            const histPath = hist
              .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y(v).toFixed(1)}`)
              .join(' ')
            const projPath = proj
              .map(
                (v, i) =>
                  `${i === 0 ? 'M' : 'L'}${((hist.length - 1 + i) * step).toFixed(1)},${y(v).toFixed(1)}`,
              )
              .join(' ')

            // The fan: P10..P90 as a band around the projection.
            const scale = fc.data.p50.minor === 0 ? 1 : 1
            const lo = proj.map((v) => v * (fc.data!.p10.minor / Math.max(1, fc.data!.p50.minor)) * scale)
            const hi = proj.map((v) => v * (fc.data!.p90.minor / Math.max(1, fc.data!.p50.minor)) * scale)
            const band =
              hi
                .map(
                  (v, i) =>
                    `${i === 0 ? 'M' : 'L'}${((hist.length - 1 + i) * step).toFixed(1)},${y(v).toFixed(1)}`,
                )
                .join(' ') +
              ' ' +
              lo
                .map(
                  (v, i, arr) =>
                    `L${((hist.length - 1 + (arr.length - 1 - i)) * step).toFixed(1)},${y(arr[arr.length - 1 - i]!).toFixed(1)}`,
                )
                .join(' ') +
              ' Z'

            return (
              <>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[260px] w-full" role="img" aria-label="Daily spend history and 14-day forecast fan">
                  <path d={band} fill="var(--horizon)" opacity={0.18} />
                  <path
                    d={histPath}
                    fill="none"
                    stroke="var(--inr)"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                  <motion.path
                    d={projPath}
                    fill="none"
                    stroke="var(--horizon)"
                    strokeWidth="2"
                    strokeDasharray="5 4"
                    vectorEffect="non-scaling-stroke"
                    initial={reduceMotion ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <line
                    x1={(hist.length - 1) * step}
                    y1={0}
                    x2={(hist.length - 1) * step}
                    y2={H}
                    stroke="var(--line)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-text-lo">
                  <Legend colour="var(--inr)" label="Actual" />
                  <Legend colour="var(--horizon)" label="Projected" dashed />
                  <span>
                    Peak day {format(money(Math.round(peak), currency), { compactZeroFraction: true })}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-text-lo">
                  Projected money is drawn in <code className="font-mono">--horizon</code>, never
                  in the currency colours. A forecast that looks like an actual is a forecast
                  someone will spend against.
                  {fc.data.fellBack &&
                    ' There is under three seasons of history here, so this is a trailing median rather than Holt-Winters.'}
                </p>
              </>
            )
          })()
        )}
      </Panel>
    </div>
  )
}

function Legend({ colour, label, dashed }: { colour: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block h-0.5 w-6"
        style={{
          background: dashed
            ? `repeating-linear-gradient(90deg, ${colour} 0 5px, transparent 5px 9px)`
            : colour,
        }}
      />
      {label}
    </span>
  )
}
