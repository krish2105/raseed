'use client'

import { useState } from 'react'
import { format } from '@raseed/money'
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { PanelError } from '@/components/ui/panel-error'
import { BenfordChart, LorenzCurve } from '@/components/charts/lorenz'
import { useDuck, useDuckQuery } from '@/lib/duck/provider'
import { useCurrencyLens } from '@/components/shell/currency-lens'
import { audit } from '@/lib/duck/analytics'
import { ingestDemo, rebuildViews, type IngestTiming } from '@/lib/duck/ingest'
import { cn } from '@/lib/utils'

const BUDGET_MS = 400
const SIZES = [1_000, 10_000, 100_000] as const

interface Result extends IngestTiming {
  rebuildMs: number
}

/**
 * The forensic tab: concentration, first-digit audit, and the performance budget — each
 * measured rather than asserted.
 */
export function LabClient() {
  const { status } = useDuck()
  const [lens] = useCurrencyLens()
  const report = useDuckQuery(() => audit(lens), [lens])

  const [results, setResults] = useState<Result[]>([])
  const [running, setRunning] = useState<number | null>(null)
  const [benchError, setBenchError] = useState<string | null>(null)

  async function run(rows: number) {
    setRunning(rows)
    setBenchError(null)
    try {
      const timing = await ingestDemo(rows)
      const rebuildMs = await rebuildViews()
      setResults((prev) => [...prev.filter((r) => r.rows !== timing.rows), { ...timing, rebuildMs }])
    } catch (cause) {
      setBenchError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRunning(null)
    }
  }

  const vitalFew = report.data
    ? report.data.pareto.findIndex((p) => p.cumulativeShare >= 0.8) + 1
    : 0

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Lab</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-lo">
          The statistical checks that do not belong on a daily dashboard, and the performance
          budget run in your own browser.
        </p>
      </header>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Spending concentration" hint="Lorenz curve · last 12 months">
          {report.error ? (
            <PanelError message={report.error} />
          ) : report.data ? (
            <LorenzCurve points={report.data.lorenz} gini={report.data.gini} />
          ) : (
            <Skeleton className="h-[300px] w-full" />
          )}
        </Panel>

        <Panel title="Pareto" hint="which merchants are 80% of spend">
          {report.data ? (
            <>
              <p className="text-sm">
                <span className="tabular font-mono text-2xl font-semibold text-inr">
                  {vitalFew}
                </span>{' '}
                <span className="text-text-lo">
                  of {report.data.pareto.length} merchants make up 80% of your spend.
                </span>
              </p>
              <ul className="mt-4 flex flex-col gap-2">
                {report.data.pareto.slice(0, 8).map((p, i) => (
                  <li key={p.item} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                    <span className="truncate text-sm">
                      <span className="tabular mr-2 font-mono text-xs text-text-lo">{i + 1}</span>
                      {p.item}
                    </span>
                    <span className="tabular font-mono text-sm text-text-lo">
                      {(p.cumulativeShare * 100).toFixed(0)}%
                    </span>
                    <span className="col-span-2 h-1 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className={cn(
                          'block h-full rounded-full',
                          i < vitalFew ? 'bg-inr' : 'bg-text-lo/40',
                        )}
                        style={{ width: `${p.cumulativeShare * 100}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-text-lo">
                Bars are cumulative share. The highlighted ones are the vital few —{' '}
                {format(report.data.pareto[0]!.value, { compactZeroFraction: true })} at the top
                alone.
              </p>
            </>
          ) : (
            <Skeleton className="h-[300px] w-full" />
          )}
        </Panel>
      </div>

      <Panel title="Benford's law" hint="first-digit audit for entry errors and duplicates" className="mt-3">
        {report.data ? (
          <BenfordChart
            observed={report.data.benford.observed}
            expected={report.data.benford.expected}
            chiSquare={report.data.benford.chiSquare}
            n={report.data.benford.n}
          />
        ) : (
          <Skeleton className="h-[200px] w-full" />
        )}
      </Panel>

      <Panel title="DuckDB-WASM benchmark" hint="runs locally, nothing leaves the tab" className="mt-3">
        <div className="flex flex-wrap gap-2">
          {SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => void run(size)}
              disabled={status !== 'ready' || running !== null}
              className={cn(
                'rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm transition-colors',
                'hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {running === size ? 'Running…' : `Ingest ${size.toLocaleString('en-IN')} rows`}
            </button>
          ))}
        </div>

        {benchError && (
          <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface-0 p-3 font-mono text-xs text-warn">
            {benchError}
          </pre>
        )}

        {results.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {['Rows', 'Arrow build', 'Insert', 'View rebuild', 'Verdict'].map((h) => (
                    <th key={h} className="pb-2 text-xs font-medium text-text-lo">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...results]
                  .sort((a, b) => a.rows - b.rows)
                  .map((r) => (
                    <tr key={r.rows} className="border-b border-line last:border-0">
                      <td className="tabular py-2.5 font-mono">{r.rows.toLocaleString('en-IN')}</td>
                      <td className="tabular py-2.5 font-mono text-text-lo">{r.buildMs}ms</td>
                      <td className="tabular py-2.5 font-mono text-text-lo">{r.insertMs}ms</td>
                      <td className="tabular py-2.5 font-mono">{r.rebuildMs}ms</td>
                      <td
                        className={cn(
                          'py-2.5 font-mono text-xs',
                          r.rebuildMs < BUDGET_MS ? 'text-good' : 'text-warn',
                        )}
                      >
                        {r.rebuildMs < BUDGET_MS ? `under ${BUDGET_MS}ms` : `over ${BUDGET_MS}ms`}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs leading-relaxed text-text-lo">
          Arrow build is JS work on the main thread and is the slow part — moving it to a
          worker is what Session 18 is for. Running a benchmark replaces the loaded ledger;
          reload to return to the 18-month demo.
        </p>
      </Panel>
    </div>
  )
}
