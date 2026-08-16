'use client'

import { useState } from 'react'
import { Panel } from '@/components/ui/panel'
import { cn } from '@/lib/utils'
import { ingestDemo, rebuildViews, type IngestTiming } from '@/lib/duck/ingest'
import { useDuck } from '@/lib/duck/provider'

const BUDGET_MS = 400
const SIZES = [1_000, 10_000, 100_000] as const

interface Result extends IngestTiming {
  /** A second CREATE OR REPLACE pass on the loaded data — what the budget actually covers. */
  rebuildMs: number
}

/**
 * The 400ms view-rebuild budget from WEB_ARCHITECTURE §7, measured rather than claimed.
 *
 * Runs in the browser because that is where the claim applies. Rows are the real fixture
 * distribution cloned across years, so cardinality stays realistic — a single repeated
 * value would compress away and flatter the numbers.
 */
export function LabClient() {
  const { status } = useDuck()
  const [results, setResults] = useState<Result[]>([])
  const [running, setRunning] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(rows: number) {
    setRunning(rows)
    setError(null)
    try {
      const timing = await ingestDemo(rows)
      const rebuildMs = await rebuildViews()
      setResults((prev) => [...prev.filter((r) => r.rows !== timing.rows), { ...timing, rebuildMs }])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Lab</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-lo">
          The performance budget, run in your browser rather than quoted from a doc. Target:
          a full view rebuild under {BUDGET_MS}ms at 100,000 rows.
        </p>
      </header>

      <Panel title="DuckDB-WASM benchmark" hint="runs locally, nothing leaves the tab">
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

        {status !== 'ready' && (
          <p className="mt-3 text-xs text-text-lo">Waiting for the engine to finish loading…</p>
        )}

        {error && (
          <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface-0 p-3 font-mono text-xs text-warn">
            {error}
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
                  .map((r) => {
                    const pass = r.rebuildMs < BUDGET_MS
                    return (
                      <tr key={r.rows} className="border-b border-line last:border-0">
                        <td className="tabular py-2.5 font-mono">
                          {r.rows.toLocaleString('en-IN')}
                        </td>
                        <td className="tabular py-2.5 font-mono text-text-lo">{r.buildMs}ms</td>
                        <td className="tabular py-2.5 font-mono text-text-lo">{r.insertMs}ms</td>
                        <td className="tabular py-2.5 font-mono">{r.rebuildMs}ms</td>
                        <td
                          className={cn('py-2.5 font-mono text-xs', pass ? 'text-good' : 'text-warn')}
                        >
                          {pass ? `under ${BUDGET_MS}ms` : `over ${BUDGET_MS}ms`}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-5 text-xs leading-relaxed text-text-lo">
          Running a benchmark replaces the loaded ledger, so the Overview figures will reflect
          whatever size you ingested last. Reload the page to return to the 18-month demo.
        </p>
      </Panel>

      <Panel title="Still to come" className="mt-3">
        <p className="text-sm text-text-lo">
          Benford first-digit audit, the Lorenz curve and Gini, Pareto by merchant, and
          day-of-week ridgelines land in session 21. The engines behind all four are already
          written and unit-tested in <code className="font-mono">@raseed/engines</code>.
        </p>
      </Panel>
    </div>
  )
}
