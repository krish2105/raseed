'use client'

import { useId, useMemo } from 'react'

import { format } from '@raseed/money'
import type { NetWorthPoint } from '@/lib/duck/analytics'

/**
 * The running balance, with an axis (Tier 0 · #2).
 *
 * Every other chart in this app is deliberately axis-free at its size. This one is not: a
 * cumulative line is meaningless without knowing where zero sits, because the whole reading is
 * "am I above or below where I started". So it draws a zero rule, labels both ends, and fills
 * the area toward zero — above in the good colour, below in the warning one.
 *
 * The curve is relative to the window's start. The ledger has no opening balance for accounts
 * it never saw, and an absolute net-worth figure invented from that would be a guess wearing a
 * currency symbol. The caption states it rather than letting the axis imply otherwise.
 */
export function NetWorthLine({
  points,
  className,
  height = 180,
}: {
  points: readonly NetWorthPoint[]
  className?: string
  height?: number
}) {
  const gradientId = useId()

  const view = useMemo(() => {
    if (points.length < 2) return null
    const values = points.map((p) => p.balance.minor)
    const min = Math.min(0, ...values)
    const max = Math.max(0, ...values)
    const span = max - min || 1

    const W = 1000
    const H = height
    const pad = 8
    const x = (i: number) => (i / (points.length - 1)) * W
    const y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2)

    const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
    const area = `${line} L${W},${y(0).toFixed(1)} L0,${y(0).toFixed(1)} Z`

    return { line, area, zero: y(0), W, H, last: values[values.length - 1]!, min, max }
  }, [points, height])

  if (!view) return <p className="text-sm text-text-lo">Not enough days to draw a line yet.</p>

  const up = view.last >= 0
  const end = points[points.length - 1]!

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${view.W} ${view.H}`}
        preserveAspectRatio="none"
        className="h-[180px] w-full"
        role="img"
        aria-label={`Running balance over ${points.length} days, ending ${format(end.balance)} relative to the start`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? 'var(--good)' : 'var(--warn)'} stopOpacity="0.28" />
            <stop offset="100%" stopColor={up ? 'var(--good)' : 'var(--warn)'} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Zero is the only gridline that means anything on a relative curve. */}
        <line
          x1="0"
          x2={view.W}
          y1={view.zero}
          y2={view.zero}
          stroke="var(--line)"
          strokeWidth="1"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
        <path d={view.area} fill={`url(#${gradientId})`} />
        <path
          d={view.line}
          fill="none"
          stroke={up ? 'var(--good)' : 'var(--warn)'}
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mt-1 flex items-baseline justify-between text-xs text-text-lo">
        <span>{points[0]!.day}</span>
        <span className="font-mono tabular-nums" style={{ color: up ? 'var(--good)' : 'var(--warn)' }}>
          {up ? '+' : ''}
          {format(end.balance)}
        </span>
        <span>{end.day}</span>
      </div>

      <figcaption className="mt-2 text-xs leading-relaxed text-text-lo">
        Change since the start of the window, not an absolute net worth — the ledger has no
        opening balance for accounts it has never seen, and inventing one would be a guess with
        a currency symbol on it. Each row is converted at the rate frozen on its own date, so
        this is what your balance did rather than what today&apos;s rate would make it look like.
      </figcaption>
    </figure>
  )
}
