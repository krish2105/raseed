'use client'

import { useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { format, money } from '@raseed/money'
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { PanelError } from '@/components/ui/panel-error'
import { useDuckQuery } from '@/lib/duck/provider'
import { useCurrencyLens } from '@/components/shell/currency-lens'
import { flows, headline } from '@/lib/duck/analytics'

const KIND_LABEL: Record<string, string> = {
  need: 'Needs',
  want: 'Wants',
  save: 'Savings',
  income: 'Income',
}

/**
 * The Sankey hero: income enters on the left, splits through need/want/save, and lands in
 * individual categories on the right.
 *
 * Hand-built with SVG cubic curves rather than d3-sankey — the layout here is a fixed
 * three-column flow, so a general-purpose layout solver would be more dependency than
 * geometry. Ribbon heights are proportional to value, so the picture cannot disagree with
 * the numbers.
 */
export function FlowsClient() {
  const [lens] = useCurrencyLens()
  const reduceMotion = useReducedMotion()
  const edges = useDuckQuery(() => flows(30, lens), [lens])
  const head = useDuckQuery(() => headline(lens), [lens])

  const model = useMemo(() => {
    if (!edges.data || edges.data.length === 0) return null

    const total = edges.data.reduce((a, e) => a + e.value.minor, 0)
    const byKind = new Map<string, number>()
    for (const e of edges.data) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + e.value.minor)

    const kinds = [...byKind.entries()].sort((a, b) => b[1] - a[1])
    const categories = [...edges.data].sort((a, b) => b.value.minor - a.value.minor).slice(0, 12)

    return { total, kinds, categories }
  }, [edges.data])

  const H = 460
  const W = 1000
  const GAP = 6

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Flows</h1>
        <p className="mt-1.5 text-sm text-text-lo">
          Where the last 30 days actually went. Ribbon height is proportional to value, so the
          picture cannot disagree with the totals.
        </p>
      </header>

      <Panel>
        {edges.error ? (
          <PanelError message={edges.error} />
        ) : !model ? (
          <Skeleton className="h-[460px] w-full" />
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-auto w-full"
              role="img"
              aria-label={`Cash flow: ${format(money(model.total, edges.data![0]!.value.currency))} across ${model.categories.length} categories`}
            >
              {(() => {
                const nodes: React.ReactNode[] = []
                const ribbons: React.ReactNode[] = []

                // Column 1 — the single source.
                const srcX = 20
                const srcW = 14
                nodes.push(
                  <rect key="src" x={srcX} y={0} width={srcW} height={H} rx={3} fill="var(--text-lo)" opacity={0.35} />,
                )

                // Column 2 — kinds.
                const kindX = 340
                let kindY = 0
                const kindPos = new Map<string, { y: number; h: number }>()
                for (const [kind, value] of model.kinds) {
                  const h = (value / model.total) * (H - GAP * (model.kinds.length - 1))
                  kindPos.set(kind, { y: kindY, h })
                  const colour = kind === 'need' ? 'var(--inr)' : kind === 'save' ? 'var(--good)' : 'var(--aed)'
                  nodes.push(
                    <g key={`k-${kind}`}>
                      <rect x={kindX} y={kindY} width={srcW} height={h} rx={3} fill={colour} />
                      <text
                        x={kindX + srcW + 8}
                        y={kindY + h / 2}
                        dominantBaseline="middle"
                        className="fill-[var(--text-hi)] text-[13px]"
                      >
                        {KIND_LABEL[kind] ?? kind}
                      </text>
                    </g>,
                  )
                  ribbons.push(
                    <motion.path
                      key={`r1-${kind}`}
                      d={ribbon(srcX + srcW, kindY, kindX, kindY, h, h)}
                      fill={colour}
                      opacity={0.16}
                      initial={reduceMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 0.16 }}
                      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                    />,
                  )
                  kindY += h + GAP
                }

                // Column 3 — categories, grouped under their kind.
                const catX = 760
                const perKindCursor = new Map<string, number>()
                let catY = 0
                for (const edge of model.categories) {
                  const h = Math.max(2, (edge.value.minor / model.total) * (H - GAP * (model.categories.length - 1)))
                  const kind = kindPos.get(edge.kind)
                  const colour = edge.kind === 'need' ? 'var(--inr)' : edge.kind === 'save' ? 'var(--good)' : 'var(--aed)'
                  const cursor = perKindCursor.get(edge.kind) ?? 0
                  const fromY = (kind?.y ?? 0) + cursor
                  perKindCursor.set(edge.kind, cursor + h)

                  ribbons.push(
                    <motion.path
                      key={`r2-${edge.category}`}
                      d={ribbon(kindX + srcW, fromY, catX, catY, h, h)}
                      fill={colour}
                      opacity={0.22}
                      initial={reduceMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 0.22 }}
                      transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    />,
                  )
                  nodes.push(
                    <g key={`c-${edge.category}`}>
                      <rect x={catX} y={catY} width={srcW} height={h} rx={3} fill={colour} />
                      <text
                        x={catX + srcW + 8}
                        y={catY + h / 2}
                        dominantBaseline="middle"
                        className="fill-[var(--text-lo)] text-[12px]"
                      >
                        {edge.category}
                      </text>
                    </g>,
                  )
                  catY += h + GAP
                }

                return [...ribbons, ...nodes]
              })()}
            </svg>

            <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-4">
              <Stat label="Total outflow" value={format(money(model.total, edges.data![0]!.value.currency), { compactZeroFraction: true })} />
              {model.kinds.map(([kind, value]) => (
                <Stat
                  key={kind}
                  label={KIND_LABEL[kind] ?? kind}
                  value={`${((value / model.total) * 100).toFixed(0)}%`}
                />
              ))}
              {head.data && (
                <Stat
                  label="Reconciles to v_spend"
                  value={model.total === head.data.spend30.minor ? 'exact' : 'top 12 shown'}
                />
              )}
            </div>
          </>
        )}
      </Panel>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-text-lo">{label}</p>
      <p className="tabular mt-1 font-mono text-sm">{value}</p>
    </div>
  )
}

/** A Sankey ribbon: two cubic curves joined into a closed band. */
function ribbon(x0: number, y0: number, x1: number, y1: number, h0: number, h1: number): string {
  const mid = (x0 + x1) / 2
  return [
    `M${x0},${y0}`,
    `C${mid},${y0} ${mid},${y1} ${x1},${y1}`,
    `L${x1},${y1 + h1}`,
    `C${mid},${y1 + h1} ${mid},${y0 + h0} ${x0},${y0 + h0}`,
    'Z',
  ].join(' ')
}
