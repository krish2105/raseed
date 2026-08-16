'use client'

import { format } from '@raseed/money'
import { Panel } from '@/components/ui/panel'
import { Figure } from '@/components/ui/figure'
import { CategoryBars } from '@/components/charts/category-bars'
import { AmountCard } from '@/components/ui/amount-card'
import { BarsSkeleton, FigureSkeleton, RowsSkeleton, Skeleton } from '@/components/ui/skeleton'
import { useDuck, useDuckQuery } from '@/lib/duck/provider'
import {
  anomalies,
  byCategory,
  byMerchant,
  concentration,
  currencyMix,
  headline,
  recurring,
} from '@/lib/duck/analytics'

/**
 * Every number on this page comes out of DuckDB-WASM in the browser. No analytics SQL is
 * ever run against Postgres — that is the whole architectural bet, and running one query
 * server-side would quietly collapse it.
 */
export function OverviewClient() {
  const { status, timing, error } = useDuck()

  const head = useDuckQuery(headline)
  const categories = useDuckQuery(() => byCategory(30))
  const merchants = useDuckQuery(() => byMerchant(90))
  const conc = useDuckQuery(concentration)
  const anomalyCount = useDuckQuery(() => anomalies(90))
  const mix = useDuckQuery(() => currencyMix(30))
  const subs = useDuckQuery(recurring)

  // Errors show what actually failed. An analytics failure rendered as an empty chart is
  // indistinguishable from "you have no data", which is the worse of the two.
  if (status === 'error') {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <Panel title="Analytics engine failed to start">
          <p className="text-sm text-text-lo">
            DuckDB-WASM could not be loaded, so nothing on this page can be computed.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface-0 p-3 font-mono text-xs text-warn">
            {error}
          </pre>
        </Panel>
      </div>
    )
  }

  const aedShare = mix?.AED

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Overview</h1>
        <p className="mt-1.5 text-sm text-text-lo">
          {head ? (
            <>
              {head.spendCount.toLocaleString('en-IN')} spend rows of{' '}
              {head.rowCount.toLocaleString('en-IN')}, computed in DuckDB-WASM in this tab.
            </>
          ) : (
            'Loading the analytics engine…'
          )}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {head ? (
          <>
            <AmountCard label="Spent, last 30 days" amount={head.spend30} className="sm:col-span-2" />
            <AmountCard label="Income, last 30 days" amount={head.income30} className="sm:col-span-2" />
          </>
        ) : (
          <>
            <Skeleton className="h-[122px] sm:col-span-2" />
            <Skeleton className="h-[122px] sm:col-span-2" />
          </>
        )}

        <Panel aedShare={aedShare}>
          {head ? (
            <Figure
              label="Savings rate"
              value={`${(head.savingsRate * 100).toFixed(1)}%`}
              hint="(income − spend) ÷ income"
            />
          ) : (
            <FigureSkeleton />
          )}
        </Panel>

        <Panel aedShare={aedShare}>
          {head ? (
            <Figure
              label="Spend vs prior 30d"
              value={format(head.spend30, { compactZeroFraction: true })}
              delta={head.spendDelta}
              goodDirection="down"
            />
          ) : (
            <FigureSkeleton />
          )}
        </Panel>

        <Panel>
          {conc ? (
            <Figure
              label="Merchant concentration"
              value={conc.gini.toFixed(2)}
              hint={`Gini · ${conc.vitalFew} merchants are 80% of spend`}
            />
          ) : (
            <FigureSkeleton />
          )}
        </Panel>

        <Panel>
          {anomalyCount !== null ? (
            <Figure
              label="Anomalous days"
              value={String(anomalyCount)}
              hint="robust MAD z > 3.5, trailing 90d"
            />
          ) : (
            <FigureSkeleton />
          )}
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        <Panel title="Where it went" hint="last 30 days" className="lg:col-span-3" aedShare={aedShare}>
          {categories ? (
            categories.length > 0 ? (
              <CategoryBars data={categories.slice(0, 8)} />
            ) : (
              <p className="py-8 text-center text-sm text-text-lo">
                No spend in this window. Add transactions on the phone, or drop a CSV.
              </p>
            )
          ) : (
            <BarsSkeleton />
          )}
          <p className="mt-4 text-xs text-text-lo">
            Warm bars are needs, cool are wants. Colours resolve from CSS variables, so they
            follow the theme.
          </p>
        </Panel>

        <div className="flex flex-col gap-3 lg:col-span-2">
          <Panel title="Top merchants" hint="last 90 days">
            {merchants ? (
              <ul className="flex flex-col divide-y divide-line">
                {merchants.slice(0, 6).map((m) => (
                  <li key={m.merchantId} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: m.country === 'AE' ? 'var(--aed)' : 'var(--inr)' }}
                      />
                      <span className="truncate text-sm">{m.name}</span>
                    </span>
                    <span className="tabular shrink-0 font-mono text-sm text-text-lo">
                      {format(m.total, { compactZeroFraction: true })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <RowsSkeleton />
            )}
          </Panel>

          <Panel title="Recurring candidates" hint="interval CV < 0.15">
            {subs ? (
              subs.length > 0 ? (
                <ul className="flex flex-col divide-y divide-line">
                  {subs.slice(0, 4).map((s) => (
                    <li key={s.merchantId} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{s.name}</span>
                        <span className="tabular font-mono text-xs text-text-lo">
                          every {s.meanPeriodDays.toFixed(0)}d · {s.observations} seen
                        </span>
                      </span>
                      <span className="tabular shrink-0 font-mono text-xs text-text-lo">
                        cv {s.intervalCv.toFixed(3)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-text-lo">
                  Nothing recurring yet. Three charges from one merchant at a steady interval
                  will show up here.
                </p>
              )
            ) : (
              <RowsSkeleton rows={4} />
            )}
          </Panel>
        </div>
      </div>

      {timing && (
        <Panel title="Engine" className="mt-3">
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            {[
              { label: 'Rows ingested', value: timing.rows.toLocaleString('en-IN') },
              { label: 'Arrow build', value: `${timing.buildMs}ms` },
              { label: 'Insert', value: `${timing.insertMs}ms` },
              { label: 'View rebuild', value: `${timing.viewsMs}ms` },
            ].map((s) => (
              <div key={s.label}>
                <dt className="text-xs text-text-lo">{s.label}</dt>
                <dd className="tabular mt-1 font-mono text-sm">{s.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-text-lo">
            Measured in this tab, this load. The 100k-row budget test lives in{' '}
            <a href="/lab" className="underline underline-offset-2 hover:text-text-hi">
              Lab
            </a>
            .
          </p>
        </Panel>
      )}
    </div>
  )
}
