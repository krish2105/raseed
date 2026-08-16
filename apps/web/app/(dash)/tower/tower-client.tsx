'use client'

import { format } from '@raseed/money'
import { Stat, Tile } from '@/components/ui/tile'
import { Skeleton } from '@/components/ui/skeleton'
import { PanelError } from '@/components/ui/panel-error'
import { useDuckQuery } from '@/lib/duck/provider'
import { useCurrencyLens } from '@/components/shell/currency-lens'
import {
  anomalies,
  byCategory,
  concentration,
  currencyMix,
  forecast,
  headline,
  recurring,
  regime,
  remittances,
  trips,
} from '@/lib/duck/analytics'
import { Corridor } from '@/components/charts/corridor'
import { cn } from '@/lib/utils'

const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const compact = { compactZeroFraction: true } as const

/**
 * The Control Tower — everything, on one screen.
 *
 * The other pages each answer one question well. This answers "how am I doing" without
 * making you visit seven of them, which is what a dense executive board is actually for.
 *
 * It survives being this dense only because every tile is a headline with the working
 * folded underneath. Twenty panels of full detail is a wall; twenty headlines with a
 * "Working" toggle is a room you can scan in four seconds and drill into in one click.
 */
export function TowerClient() {
  const [lens] = useCurrencyLens()

  const head = useDuckQuery(() => headline(lens), [lens])
  const reg = useDuckQuery(() => regime(lens), [lens])
  const fc = useDuckQuery(() => forecast(lens, 14), [lens])
  const cats = useDuckQuery(() => byCategory(30, lens), [lens])
  const conc = useDuckQuery(() => concentration(lens), [lens])
  const mix = useDuckQuery(() => currencyMix(90), [])
  const anom = useDuckQuery(() => anomalies(90, lens), [lens])
  const subs = useDuckQuery(() => recurring(), [])
  const trip = useDuckQuery(() => trips(), [])
  const remit = useDuckQuery(() => remittances(), [])

  const h = head.data
  const r = reg.data

  return (
    <div className="mx-auto w-full max-w-[110rem] px-3 pt-4 pb-28 md:px-5">
      <header className="mb-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
          Control Tower
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-text-lo">
          Every figure the other tabs compute, on one board. Each tile is the headline; the
          working folds out underneath it. Nothing here is a different number from the page
          it came from — they all read the same <code className="font-mono">v_spend</code>.
        </p>
      </header>

      <div className="bento">
        {/* ── row 1 · the four numbers you check first ─────────────────────── */}
        <Tile span={3} index={0}>
          {h ? (
            <Stat
              label="Spent · last 30 days"
              value={format(h.spend30, compact)}
              tone="inr"
              delta={{
                value: pct(Math.abs(h.spendDelta)),
                direction: h.spendDelta > 0.005 ? 'up' : h.spendDelta < -0.005 ? 'down' : 'flat',
              }}
              hint="vs prior 30"
            />
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </Tile>

        <Tile span={3} index={1}>
          {h ? (
            <Stat
              label="Net · last 30 days"
              value={format(h.net30, compact)}
              tone={h.net30.minor >= 0 ? 'good' : 'warn'}
              hint={`${h.spendCount.toLocaleString('en-IN')} spends`}
            />
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </Tile>

        <Tile span={3} index={2}>
          {h ? (
            <Stat
              label="Savings rate"
              value={pct(h.savingsRate)}
              tone={h.savingsRate >= 0.2 ? 'good' : 'warn'}
              hint="of income kept"
            />
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </Tile>

        <Tile span={3} index={3}>
          {h ? (
            <Stat
              label="A typical day"
              value={format(h.dailyAverage, compact)}
              hint="30-day mean"
            />
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </Tile>

        {/* ── row 2 · the forward look ─────────────────────────────────────── */}
        <Tile
          span={6}
          rows={2}
          index={4}
          title="Next 14 days"
          hint={fc.data ? `${fc.data.paths.toLocaleString('en-IN')} paths` : 'simulating'}
          detail={
            fc.data && (
              <p className="leading-relaxed">
                Holt-Winters over daily spend with a weekly season, and a fan from a
                moving-block bootstrap — blocks rather than IID, because a heavy Saturday
                follows a heavy Friday and IID sampling draws a fan far too narrow. Holdout
                error is symmetric MAPE on weekly totals:{' '}
                {Number.isFinite(fc.data.accuracy) ? pct(fc.data.accuracy) : 'not enough history'}.
              </p>
            )
          }
        >
          {fc.error ? (
            <PanelError message={fc.error} />
          ) : fc.data ? (
            <div className="flex h-full flex-col justify-between gap-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { k: 'Median', v: fc.data.p50, tone: 'text-text-hi' },
                  { k: 'Good run', v: fc.data.p10, tone: 'text-good' },
                  { k: 'Bad run', v: fc.data.p90, tone: 'text-warn' },
                ].map((x) => (
                  <div key={x.k}>
                    <p className="text-[11px] text-text-lo">{x.k}</p>
                    <p className={cn('tabular font-mono text-lg font-semibold', x.tone)}>
                      {format(x.v, compact)}
                    </p>
                  </div>
                ))}
              </div>

              {/* The fan as one bar: where the median sits between the good and bad runs. */}
              <div>
                <div className="relative h-2 overflow-hidden rounded-full bg-surface-2">
                  <span className="absolute inset-y-0 left-0 w-full bg-horizon/25" />
                  <span
                    className="absolute inset-y-0 w-0.5 bg-text-hi"
                    style={{
                      left: `${
                        ((fc.data.p50.minor - fc.data.p10.minor) /
                          Math.max(1, fc.data.p90.minor - fc.data.p10.minor)) *
                        100
                      }%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-text-lo">
                  {pct(fc.data.probabilityWithinPool)} of simulated runs finish inside the
                  pool. Projected money is drawn on{' '}
                  <span className="text-horizon">the horizon colour</span> everywhere, so it
                  never reads as money you have.
                </p>
              </div>
            </div>
          ) : (
            <Skeleton className="h-full min-h-[9rem] w-full" />
          )}
        </Tile>

        {/* ── downside ─────────────────────────────────────────────────────── */}
        <Tile
          span={3}
          rows={2}
          index={5}
          title="A bad month"
          hint={r ? `${r.risk.months} months` : ''}
          detail={
            r && (
              <p className="leading-relaxed">
                Historical value at risk, not a fitted normal — spending is right-skewed and
                a normal fit understates exactly this tail. VaR is where the worst 5% of
                months begin; CVaR is their average, which is the number that tells you how
                far the drop goes rather than only where the edge is.
              </p>
            )
          }
        >
          {reg.error ? (
            <PanelError message={reg.error} />
          ) : r ? (
            <div className="flex h-full flex-col justify-between">
              <div>
                <p className="text-[11px] text-text-lo">
                  {r.risk.tailSize <= 1 ? 'Worst month on record' : '1 month in 20 costs over'}
                </p>
                <p className="tabular font-mono text-xl font-semibold text-warn">
                  {format(r.risk.valueAtRisk, compact)}
                </p>
              </div>

              {/* With a one-month tail, CVaR IS VaR — printing both would imply an average
                  over a distribution with one point in it. */}
              {r.risk.tailSize > 1 ? (
                <div>
                  <p className="text-[11px] text-text-lo">
                    and those {r.risk.tailSize} months average
                  </p>
                  <p className="tabular font-mono text-lg font-semibold">
                    {format(r.risk.conditional, compact)}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-text-lo">
                  Only {r.risk.months} months of history, so the worst 5% is a single month.
                  A tail average needs more.
                </p>
              )}

              <p className="text-[11px] leading-relaxed text-text-lo">
                That is{' '}
                <span className="tabular font-mono text-text-hi">
                  {format(r.risk.shortfall, compact)}
                </span>{' '}
                over an ordinary month.
              </p>
            </div>
          ) : (
            <Skeleton className="h-full min-h-[9rem] w-full" />
          )}
        </Tile>

        {/* ── concentration ────────────────────────────────────────────────── */}
        <Tile
          span={3}
          index={6}
          title="Spread"
          detail={
            r && (
              <p className="leading-relaxed">
                The exponential of Shannon entropy — the effective number of destinations.
                Spending split evenly across four categories gives exactly 4; heavily skewed
                across twenty can give under 3. The category count on a pie chart cannot tell
                those apart.
              </p>
            )
          }
        >
          {r ? (
            <Stat
              label="Money effectively goes to"
              value={`${r.spread.effective.toFixed(1)} places`}
              hint={`of ${r.spread.nominal} categories`}
              tone={r.spread.evenness < 0.35 ? 'warn' : 'neutral'}
            />
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </Tile>

        <Tile span={3} index={7} title="Merchants">
          {conc.data ? (
            <Stat
              label="Are 80% of your spend"
              value={`${conc.data.vitalFew} of ${conc.data.total}`}
              hint={`Gini ${conc.data.gini.toFixed(2)}`}
            />
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </Tile>

        {/* ── regime change: the tile no other budgeting app has ───────────── */}
        <Tile
          span={6}
          index={8}
          title="Regime changes"
          hint="CUSUM · last 12 months"
          detail={
            r && (
              <p className="leading-relaxed">
                Not an outlier — an outlier is one strange Tuesday. This is the day after
                which every Tuesday is different: a new flat, a new job, a subscription you
                forgot. Detected with a cumulative sum at the textbook slack of 0.5σ and a
                decision interval of 5σ, against a MAD-based scale so the very step being
                hunted does not inflate the yardstick. Explained variance across the last
                year: {pct(r.explained)}.
              </p>
            )
          }
        >
          {r ? (
            r.shifts.length === 0 ? (
              <p className="py-4 text-sm text-text-lo">
                No regime change in the last year — your spending level has been stable.
                That is a real answer, not a missing one.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {r.shifts.slice(0, 4).map((s) => (
                  <li key={s.day} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="tabular font-mono text-xs text-text-lo">{s.day}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-text-lo">
                      {format(s.before, compact)} → {format(s.after, compact)} / day
                    </span>
                    <span
                      className={cn(
                        'tabular font-mono text-sm font-semibold',
                        s.delta.minor > 0 ? 'text-warn' : 'text-good',
                      )}
                    >
                      {s.delta.minor > 0 ? '+' : ''}
                      {format(s.delta, compact)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <Skeleton className="h-20 w-full" />
          )}
        </Tile>

        {/* ── currency ─────────────────────────────────────────────────────── */}
        <Tile span={3} index={9} title="Currency mix" hint="90 days">
          {mix.data ? (
            <div className="flex h-full flex-col justify-between">
              <div className="flex h-2 overflow-hidden rounded-full">
                <span className="block bg-inr" style={{ width: `${mix.data.INR * 100}%` }} />
                <span className="block flex-1 bg-aed" />
              </div>
              <div className="mt-3 flex justify-between text-xs">
                <span className="tabular font-mono text-inr">INR {pct(mix.data.INR)}</span>
                <span className="tabular font-mono text-aed">AED {pct(mix.data.AED)}</span>
              </div>
            </div>
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </Tile>

        {/* ── categories ───────────────────────────────────────────────────── */}
        <Tile span={4} rows={2} index={10} title="Where it went" hint="30 days">
          {cats.data ? (
            <ul className="flex flex-col gap-2">
              {cats.data.slice(0, 7).map((c) => (
                <li key={c.categoryId}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate">{c.name}</span>
                    <span className="tabular shrink-0 font-mono text-text-lo">
                      {format(c.total, compact)}
                    </span>
                  </div>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className={cn('block h-full rounded-full', c.kind === 'need' ? 'bg-inr' : 'bg-aed')}
                      style={{ width: `${c.share * 100}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Skeleton className="h-full min-h-[9rem] w-full" />
          )}
        </Tile>

        {/* ── subscriptions ────────────────────────────────────────────────── */}
        <Tile
          span={4}
          index={11}
          title="Recurring"
          hint="found in the data, no permissions"
          detail={
            <p className="leading-relaxed">
              Detected from transaction intervals alone — same merchant, regular gap, low
              variation in the gap. No SMS, no notification access, no reading another app.
              That path does not exist on iOS at any price, and this finds them anyway.
            </p>
          }
        >
          {subs.data ? (
            subs.data.length === 0 ? (
              <p className="py-2 text-sm text-text-lo">Nothing recurring yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {subs.data.slice(0, 5).map((s) => (
                  <li key={s.merchantId} className="flex justify-between gap-2 text-xs">
                    <span className="truncate">{s.name}</span>
                    <span className="tabular shrink-0 font-mono text-text-lo">
                      every {s.meanPeriodDays.toFixed(0)}d
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <Skeleton className="h-20 w-full" />
          )}
        </Tile>

        {/* ── anomalies ────────────────────────────────────────────────────── */}
        <Tile span={4} index={12} title="Unusual days" hint="MAD z > 3.5">
          {anom.data ? (
            anom.data.length === 0 ? (
              <p className="py-2 text-sm text-text-lo">Nothing unusual in 90 days.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {anom.data.slice(0, 5).map((a) => (
                  <li key={a.day} className="flex justify-between gap-2 text-xs">
                    <span className="tabular font-mono text-text-lo">{a.day}</span>
                    <span className="tabular font-mono">{format(a.total, compact)}</span>
                    <span className="tabular shrink-0 font-mono text-warn">
                      {a.z.toFixed(1)}σ
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <Skeleton className="h-20 w-full" />
          )}
        </Tile>

        {/* ── the corridor · the thing this app is actually about ──────────── */}
        <Tile
          span={8}
          rows={2}
          index={13}
          title="The corridor"
          hint="AED → INR, at the rate each transfer actually got"
          detail={
            <p className="leading-relaxed">
              Drawn with CSS 3D rather than WebGL. `three` plus `react-three-fiber` is around
              600KB over the wire for two nodes and some arcs, and on a finance dashboard the
              first paint matters more than the technique. Real perspective, real parallax,
              4KB of markup. Move the pointer over it — the tilt is capped at 6°, enough to
              read as depth and small enough that nothing becomes a moving target.
            </p>
          }
        >
          {remit.data ? (
            <Corridor
              className="h-full"
              flows={remit.data.slice(0, 5).map((x) => ({
                label: new Date(x.occurredAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                }),
                outbound: x.sentAed,
                inbound: x.receivedInr,
                efficiency: x.efficiency,
              }))}
            />
          ) : (
            <Skeleton className="h-full min-h-[11rem] w-full" />
          )}
        </Tile>

        {/* ── trips ────────────────────────────────────────────────────────── */}
        <Tile span={4} index={14} title="Travel" hint="inferred, not declared">
          {trip.data ? (
            <Stat
              label={`${trip.data.trips.length} trips found`}
              value={format(
                {
                  minor: trip.data.trips.reduce((a, t) => a + t.excess.minor, 0),
                  currency: 'INR',
                },
                compact,
              )}
              hint="above staying home"
              tone="aed"
            />
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </Tile>
      </div>
    </div>
  )
}
