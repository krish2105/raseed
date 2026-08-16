'use client'

import { useId, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { format, money, type Currency } from '@raseed/money'

export interface SparkPoint {
  label: string
  value: number
}

/**
 * Hand-built area + line chart. No chart library.
 *
 * Colours come from CSS variables at render, so a theme change re-resolves them — a
 * hardcoded chart palette is the single most common way theme toggles break. The reveal
 * animates `pathLength` and `opacity` only.
 */
export function Sparkline({
  points,
  currency,
  height = 120,
  accent = 'var(--inr)',
}: {
  points: readonly SparkPoint[]
  currency: Currency
  height?: number
  accent?: string
}) {
  const gradientId = useId()
  const reduceMotion = useReducedMotion()
  const [hover, setHover] = useState<number | null>(null)

  const W = 1000
  const H = height

  const { line, area, max, coords } = useMemo(() => {
    if (points.length === 0) return { line: '', area: '', max: 0, coords: [] as [number, number][] }
    const peak = Math.max(...points.map((p) => p.value), 1)
    const step = points.length > 1 ? W / (points.length - 1) : W
    const pts: [number, number][] = points.map((p, i) => [
      i * step,
      H - (p.value / peak) * (H - 8) - 4,
    ])
    const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    return {
      line: d,
      area: `${d} L${W},${H} L0,${H} Z`,
      max: peak,
      coords: pts,
    }
  }, [points, H])

  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-lo">
        No spend in this window yet.
      </p>
    )
  }

  const active = hover === null ? null : points[hover]

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[var(--h)] w-full"
        style={{ ['--h' as string]: `${H}px` }}
        role="img"
        aria-label={`Daily spend, ${points.length} days, peak ${format(money(max, currency))}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const ratio = (e.clientX - rect.left) / rect.width
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))))
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        <motion.path
          d={area}
          fill={`url(#${gradientId})`}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        />
        <motion.path
          d={line}
          fill="none"
          stroke={accent}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />

        {hover !== null && coords[hover] && (
          <g>
            <line
              x1={coords[hover]![0]}
              y1={0}
              x2={coords[hover]![0]}
              y2={H}
              stroke="var(--line)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={coords[hover]![0]} cy={coords[hover]![1]} r="4" fill={accent} />
          </g>
        )}
      </svg>

      {/* Reserved height, so the tooltip appearing never shifts the layout. */}
      <div className="mt-2 h-5">
        {active && (
          <p className="tabular font-mono text-xs text-text-lo">
            {active.label} · <span className="text-text-hi">{format(money(active.value, currency))}</span>
          </p>
        )}
      </div>
    </div>
  )
}
