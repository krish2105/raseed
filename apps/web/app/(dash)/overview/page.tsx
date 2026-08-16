import { format } from '@raseed/money'
import { Panel } from '@/components/ui/panel'
import { Figure } from '@/components/ui/figure'
import { CategoryBars } from '@/components/charts/category-bars'
import { AmountCard } from '@/components/ui/amount-card'
import {
  anomalyCount,
  byCategory,
  byMerchant,
  concentration,
  currencyMix,
  income30,
  ledger,
  paretoMerchants,
  remittanceCount,
  savingsRate,
  spend30,
  spend60to30,
  subscriptions,
  vSpend,
} from '@/lib/demo'

export const metadata = { title: 'Overview · RASEED' }

const spendDelta =
  spend60to30.minor === 0 ? 0 : (spend30.minor - spend60to30.minor) / spend60to30.minor

const vitalFew = paretoMerchants.findIndex((p) => p.cumulativeShare >= 0.8) + 1

export default function OverviewPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Overview</h1>
        <p className="mt-1.5 text-sm text-text-lo">
          {vSpend.length.toLocaleString('en-IN')} spend rows across {ledger.meta.months} months.
          Demo ledger, seed {ledger.meta.seed} — identical for every visitor.
        </p>
      </header>

      {/* Bento: the two headline amounts, then the supporting figures. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AmountCard label="Spent, last 30 days" amount={spend30} className="sm:col-span-2" />
        <AmountCard label="Income, last 30 days" amount={income30} className="sm:col-span-2" />

        <Panel aedShare={currencyMix.AED}>
          <Figure
            label="Savings rate"
            value={`${(savingsRate * 100).toFixed(1)}%`}
            hint="(income − spend) ÷ income"
          />
        </Panel>

        <Panel aedShare={currencyMix.AED}>
          <Figure
            label="Spend vs prior 30d"
            value={format(spend30, { compactZeroFraction: true })}
            delta={spendDelta}
            goodDirection="down"
          />
        </Panel>

        <Panel>
          <Figure
            label="Merchant concentration"
            value={concentration.toFixed(2)}
            hint={`Gini · ${vitalFew} merchants are 80% of spend`}
          />
        </Panel>

        <Panel>
          <Figure
            label="Anomalous days"
            value={String(anomalyCount)}
            hint="robust MAD z > 3.5, trailing 90d"
          />
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        <Panel
          title="Where it went"
          hint="last 30 days"
          className="lg:col-span-3"
          aedShare={currencyMix.AED}
        >
          <CategoryBars data={byCategory.slice(0, 8)} />
          <p className="mt-4 text-xs text-text-lo">
            Warm bars are needs, cool are wants. Colours resolve from CSS variables, so they
            follow the theme.
          </p>
        </Panel>

        <div className="flex flex-col gap-3 lg:col-span-2">
          <Panel title="Top merchants" hint="last 90 days">
            <ul className="flex flex-col divide-y divide-line">
              {byMerchant.slice(0, 6).map((m) => (
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
          </Panel>

          <Panel title="Detected subscriptions" hint="interval CV < 0.15">
            {subscriptions.length === 0 ? (
              <p className="text-sm text-text-lo">
                Nothing recurring yet. Three charges from one merchant at a steady interval
                will show up here.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {subscriptions.slice(0, 4).map((s) => {
                  const merchant = ledger.merchants.find((m) => m.id === s.merchantId)
                  return (
                    <li key={s.merchantId} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm">
                          {merchant?.canonical_name ?? s.merchantId}
                        </span>
                        <span className="tabular font-mono text-xs text-text-lo">
                          every {s.periodDays.toFixed(0)}d
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="tabular block font-mono text-sm">
                          {format({ minor: s.amountMinor, currency: s.currency })}
                        </span>
                        {s.priceChange && (
                          <span className="tabular font-mono text-xs text-warn">
                            +{format({
                              minor: s.priceChange.annualDeltaMinor,
                              currency: s.currency,
                            })}
                            /yr
                          </span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Still to come" className="mt-3">
        <p className="text-sm text-text-lo">
          The Sankey hero (S12), DuckDB-WASM analytics (S8), the ⌘K query bar (S16) and the
          Monte&nbsp;Carlo runway fan (S20) all land in later sessions. {remittanceCount} remittances
          are already in the ledger and excluded from both spend and income.
        </p>
      </Panel>
    </div>
  )
}
