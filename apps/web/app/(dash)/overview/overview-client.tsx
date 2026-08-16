'use client'

import { format } from '@raseed/money'
import { Panel } from '@/components/ui/panel'
import { Figure } from '@/components/ui/figure'
import { CategoryBars } from '@/components/charts/category-bars'
import { Sparkline } from '@/components/charts/sparkline'
import { AmountCard } from '@/components/ui/amount-card'
import { CfoBriefing } from '@/components/insight/cfo-briefing'
import { BarsSkeleton, FigureSkeleton, RowsSkeleton, Skeleton } from '@/components/ui/skeleton'
import { PanelError } from '@/components/ui/panel-error'
import { useDuck, useDuckQuery } from '@/lib/duck/provider'
import { useCurrencyLens } from '@/components/shell/currency-lens'
import {
  anomalies,
  byCategory,
  byMerchant,
  concentration,
  currencyMix,
  dailySeries,
  headline,
  recurring,
} from '@/lib/duck/analytics'

/**
 * Every number here comes out of DuckDB-WASM in this tab, expressed through the currency
 * lens in the URL. No analytics SQL ever runs against Postgres.
 */
export function OverviewClient() {
  const { status, timing, error } = useDuck()
  const [lens] = useCurrencyLens()

  const head = useDuckQuery(() => headline(lens), [lens])
  const categories = useDuckQuery(() => byCategory(30, lens), [lens])
  const merchants = useDuckQuery(() => byMerchant(90, lens), [lens])
  const conc = useDuckQuery(() => concentration(lens), [lens])
  const outliers = useDuckQuery(() => anomalies(90, lens), [lens])
  const mix = useDuckQuery(() => currencyMix(30))
  const subs = useDuckQuery(recurring)
  const series = useDuckQuery(() => dailySeries(60, lens), [lens])

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

  const aedShare = mix.data?.AED

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Overview</h1>
        <p className="mt-1.5 text-sm text-text-lo">
          {head.data ? (
            <>
              {head.data.spendCount.toLocaleString('en-IN')} spend rows of{' '}
              {head.data.rowCount.toLocaleString('en-IN')}, computed in DuckDB-WASM in this tab
              {lens !== 'native' && <> · reading in {lens}</>}.
            </>
          ) : (
            'Loading the analytics engine…'
          )}
        </p>
      </header>

      <CfoBriefing />

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {head.data ? (
          <>
            <AmountCard label="Spent, last 30 days" amount={head.data.spend30} className="sm:col-span-2" />
            <AmountCard label="Income, last 30 days" amount={head.data.income30} className="sm:col-span-2" />
          </>
        ) : (
          <>
            <Skeleton className="h-[122px] sm:col-span-2" />
            <Skeleton className="h-[122px] sm:col-span-2" />
          </>
        )}

        <Panel aedShare={aedShare}>
          {head.error ? (
            <PanelError message={head.error} />
          ) : head.data ? (
            <Figure
              label="Savings rate"
              value={`${(head.data.savingsRate * 100).toFixed(1)}%`}
              hint="(income − spend) ÷ income"
            />
          ) : (
            <FigureSkeleton />
          )}
        </Panel>

        <Panel aedShare={aedShare}>
          {head.error ? (
            <PanelError message={head.error} />
          ) : head.data ? (
            <Figure
              label="Average day"
              value={format(head.data.dailyAverage, { compactZeroFraction: true })}
              delta={head.data.spendDelta}
              goodDirection="down"
              hint="vs prior 30 days"
            />
          ) : (
            <FigureSkeleton />
          )}
        </Panel>

        <Panel>
          {conc.error ? (
            <PanelError message={conc.error} />
          ) : conc.data ? (
            <Figure
              label="Merchant concentration"
              value={conc.data.gini.toFixed(2)}
              hint={`Gini · ${conc.data.vitalFew} of ${conc.data.total} are 80% of spend`}
            />
          ) : (
            <FigureSkeleton />
          )}
        </Panel>

        <Panel>
          {outliers.error ? (
            <PanelError message={outliers.error} />
          ) : outliers.data ? (
            <Figure
              label="Anomalous days"
              value={String(outliers.data.length)}
              hint="robust MAD z > 3.5, trailing 90d"
            />
          ) : (
            <FigureSkeleton />
          )}
        </Panel>
      </div>

      <Panel title="Daily spend" hint="last 60 days" className="mt-3" aedShare={aedShare}>
        {series.error ? (
          <PanelError message={series.error} />
        ) : series.data ? (
          <Sparkline
            points={series.data.map((p) => ({ label: p.day, value: p.total.minor }))}
            currency={series.data[0]?.total.currency ?? 'INR'}
            height={120}
          />
        ) : (
          <Skeleton className="h-[120px] w-full" />
        )}
      </Panel>

      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        <Panel title="Where it went" hint="last 30 days" className="lg:col-span-3" aedShare={aedShare}>
          {categories.error ? (
            <PanelError message={categories.error} />
          ) : categories.data ? (
            categories.data.length > 0 ? (
              <CategoryBars data={categories.data.slice(0, 8)} />
            ) : (
              <p className="py-8 text-center text-sm text-text-lo">
                No spend in this window. Add one with the button in the top bar.
              </p>
            )
          ) : (
            <BarsSkeleton />
          )}
        </Panel>

        <div className="flex flex-col gap-3 lg:col-span-2">
          <Panel title="Top merchants" hint="last 90 days">
            {merchants.error ? (
              <PanelError message={merchants.error} />
            ) : merchants.data ? (
              <ul className="flex flex-col divide-y divide-line">
                {merchants.data.slice(0, 6).map((m) => (
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

          <Panel title="Recurring" hint="interval CV < 0.15">
            {subs.error ? (
              <PanelError message={subs.error} />
            ) : subs.data ? (
              subs.data.length > 0 ? (
                <ul className="flex flex-col divide-y divide-line">
                  {subs.data.slice(0, 4).map((s) => (
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
        </Panel>
      )}
    </div>
  )
}
