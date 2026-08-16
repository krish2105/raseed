'use client'

import { useMemo } from 'react'

import { format, money } from '@raseed/money'
import type { DailyPoint } from '@/lib/duck/analytics'

/**
 * Daily spend as a calendar, eighteen months of it (Tier 0 · #4).
 *
 * The scale is **quantile-binned, not linear**. Personal spending is heavily right-skewed —
 * one rent day is twenty ordinary days — so a linear ramp paints the whole year the palest
 * shade and rent alone the darkest, which tells you only that rent exists. Quantiles spend
 * the colour where the data actually is, and the legend says so rather than implying a
 * proportional reading.
 *
 * Days with no spend are drawn, not skipped. A blank Sunday is information; a calendar that
 * silently closed its gaps would misrepresent every streak on it.
 */

const BINS = 5

export interface CalendarHeatmapProps {
  points: readonly DailyPoint[]
  className?: string
}

function quantileThresholds(values: readonly number[]): number[] {
  const spent = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (spent.length === 0) return []
  // BINS - 1 cut points, so a value falls into one of BINS buckets.
  return Array.from({ length: BINS - 1 }, (_, i) => {
    const q = (i + 1) / BINS
    const idx = Math.min(spent.length - 1, Math.floor(q * spent.length))
    return spent[idx]!
  })
}

export function CalendarHeatmap({ points, className }: CalendarHeatmapProps) {
  const { weeks, thresholds, total, busiest } = useMemo(() => {
    const byDay = new Map(points.map((p) => [p.day, p]))
    const th = quantileThresholds(points.map((p) => p.total.minor))

    // Anchor to the Sunday on or before the first day, so every column is a real week.
    const first = points[0] ? new Date(`${points[0].day}T00:00:00Z`) : new Date()
    const start = new Date(first)
    start.setUTCDate(start.getUTCDate() - start.getUTCDay())
    const last = points[points.length - 1]
      ? new Date(`${points[points.length - 1]!.day}T00:00:00Z`)
      : new Date()

    const cols: { day: string; minor: number; bin: number }[][] = []
    const cursor = new Date(start)
    while (cursor <= last) {
      const col: { day: string; minor: number; bin: number }[] = []
      for (let d = 0; d < 7; d++) {
        const iso = cursor.toISOString().slice(0, 10)
        const minor = byDay.get(iso)?.total.minor ?? 0
        const bin = minor === 0 ? 0 : th.findIndex((t) => minor <= t) + 1 || BINS
        col.push({ day: iso, minor, bin })
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
      cols.push(col)
    }

    const sum = points.reduce((a, p) => a + p.total.minor, 0)
    const max = points.reduce<DailyPoint | null>(
      (a, p) => (a === null || p.total.minor > a.total.minor ? p : a),
      null,
    )
    return { weeks: cols, thresholds: th, total: sum, busiest: max }
  }, [points])

  if (points.length === 0) {
    return <p className="text-sm text-text-lo">No days to draw yet.</p>
  }

  return (
    <figure className={className}>
      <div className="overflow-x-auto">
        <div className="flex gap-[3px]" role="img" aria-label={`Daily spending calendar over ${points.length} days`}>
          {weeks.map((col, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {col.map((cell) => (
                <span
                  key={cell.day}
                  title={`${cell.day} · ${format(money(cell.minor, 'INR'))}`}
                  className="size-[9px] rounded-[2px] transition-colors"
                  style={{
                    // Bin 0 is a real state (no spend), drawn as the empty surface rather
                    // than omitted, so streaks read correctly.
                    background:
                      cell.bin === 0
                        ? 'var(--surface-2)'
                        : `color-mix(in oklab, var(--inr) ${cell.bin * 20}%, var(--surface-2))`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-lo">
        <span className="flex items-center gap-1.5">
          quieter
          {Array.from({ length: BINS + 1 }, (_, b) => (
            <span
              key={b}
              className="size-[9px] rounded-[2px]"
              style={{
                background:
                  b === 0
                    ? 'var(--surface-2)'
                    : `color-mix(in oklab, var(--inr) ${b * 20}%, var(--surface-2))`,
              }}
            />
          ))}
          busier
        </span>
        <span>
          {format(money(total, 'INR'))} across {points.length} days
        </span>
      </div>

      <figcaption className="mt-2 text-xs leading-relaxed text-text-lo">
        Shaded by <strong className="font-medium text-text-hi">quantile</strong>, not by
        proportion — personal spending is skewed enough that a linear ramp would paint the
        whole year pale and rent alone dark.{' '}
        {thresholds.length > 0 && (
          <>The middle band starts around {format(money(thresholds[2] ?? 0, 'INR'))}. </>
        )}
        {busiest && (
          <>
            The heaviest day was {busiest.day} at {format(busiest.total)}.
          </>
        )}
      </figcaption>
    </figure>
  )
}
