'use client'

import { format, money } from '@raseed/money'
import { Panel } from '@/components/ui/panel'
import { Figure } from '@/components/ui/figure'
import { FigureSkeleton, RowsSkeleton, Skeleton } from '@/components/ui/skeleton'
import { PanelError } from '@/components/ui/panel-error'
import { useDuckQuery } from '@/lib/duck/provider'
import { fxSeries, remittances } from '@/lib/duck/analytics'
import { cn } from '@/lib/utils'

/**
 * The India ⇄ UAE layer: what each transfer actually cost, and how much of your position
 * moved because the rupee moved rather than because you did.
 *
 * Remittance efficiency is the metric nobody else computes — implied rate over mid-market,
 * expressed as what the spread took.
 */
export function CurrencyClient() {
  const remits = useDuckQuery(remittances)
  const fx = useDuckQuery(fxSeries)

  const totalCost = remits.data?.reduce((a, r) => a + r.cost.minor, 0) ?? 0
  const avgEfficiency =
    remits.data && remits.data.length > 0
      ? remits.data.reduce((a, r) => a + r.efficiency, 0) / remits.data.length
      : 0

  const first = fx.data?.[0]
  const last = fx.data?.[fx.data.length - 1]
  const rateMove = first && last ? (last.rate - first.rate) / first.rate : 0

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Currency</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-lo">
          Every row carries the INR/AED rate frozen at its own date. Changing the lens swaps
          which column is read — it never recomputes history.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {remits.data && fx.data ? (
          <>
            <Panel aedShare={1}>
              <Figure
                label="Transfers detected"
                value={String(remits.data.length)}
                hint="AED out, INR in, within 5 days"
              />
            </Panel>
            <Panel>
              <Figure
                label="Lost to spread"
                value={format(money(totalCost, 'INR'), { compactZeroFraction: true })}
                hint="versus mid-market"
                accent="inr"
              />
            </Panel>
            <Panel>
              <Figure
                label="Average efficiency"
                value={`${(avgEfficiency * 100).toFixed(1)}%`}
                hint="implied ÷ mid-market"
              />
            </Panel>
            <Panel>
              <Figure
                label="Rate moved"
                value={`${rateMove >= 0 ? '+' : ''}${(rateMove * 100).toFixed(1)}%`}
                hint={first && last ? `${first.rate.toFixed(2)} → ${last.rate.toFixed(2)} INR/AED` : ''}
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

      <Panel title="Remittance ledger" hint="what each transfer actually cost" className="mt-3">
        {remits.error ? (
          <PanelError message={remits.error} />
        ) : !remits.data ? (
          <RowsSkeleton rows={3} />
        ) : remits.data.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-lo">
            No cross-currency transfers detected. An AED outflow and an INR inflow within five
            days, at a rate inside a 5% band, get linked here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {['Date', 'Sent', 'Received', 'Your rate', 'Mid-market', 'Cost', 'Efficiency'].map(
                    (h) => (
                      <th key={h} className="pb-2 text-xs font-medium text-text-lo">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {remits.data.map((r) => (
                  <tr key={r.outflowId} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 text-text-lo">
                      {new Date(r.occurredAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: '2-digit',
                      })}
                    </td>
                    <td className="tabular py-2.5 pr-3 font-mono text-aed">{format(r.sentAed)}</td>
                    <td className="tabular py-2.5 pr-3 font-mono text-inr">
                      {format(r.receivedInr)}
                    </td>
                    <td className="tabular py-2.5 pr-3 font-mono">{r.impliedRate.toFixed(3)}</td>
                    <td className="tabular py-2.5 pr-3 font-mono text-text-lo">
                      {r.midMarketRate.toFixed(3)}
                    </td>
                    <td className="tabular py-2.5 pr-3 font-mono text-warn">
                      {format(r.cost, { compactZeroFraction: true })}
                    </td>
                    <td
                      className={cn(
                        'tabular py-2.5 font-mono',
                        r.efficiency >= 0.99 ? 'text-good' : 'text-warn',
                      )}
                    >
                      {(r.efficiency * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-xs leading-relaxed text-text-lo">
              Efficiency is your implied rate over mid-market. 98.5% means the transfer cost you
              1.5% in spread and fees. Neither leg counts as spend or income — they are one
              movement of your own money, linked by a transfer group.
            </p>
          </div>
        )}
      </Panel>

      <Panel title="INR per AED" hint="frozen per transaction, drifting across the window" className="mt-3">
        {!fx.data ? (
          <Skeleton className="h-[160px] w-full" />
        ) : (
          (() => {
            const rates = fx.data.map((f) => f.rate)
            const min = Math.min(...rates)
            const max = Math.max(...rates)
            const span = max - min || 1
            const W = 1000
            const H = 160
            const step = W / Math.max(1, rates.length - 1)
            const d = rates
              .map(
                (r, i) =>
                  `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(H - ((r - min) / span) * (H - 20) - 10).toFixed(1)}`,
              )
              .join(' ')
            return (
              <>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[160px] w-full" role="img" aria-label="INR per AED over time">
                  <path d={d} fill="none" stroke="var(--aed)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs text-text-lo">
                  <span>low {min.toFixed(3)}</span>
                  <span>high {max.toFixed(3)}</span>
                  <span>{fx.data.length} months</span>
                </div>
              </>
            )
          })()
        )}
      </Panel>
    </div>
  )
}
