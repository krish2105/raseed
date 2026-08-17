'use client'

import { motion, useReducedMotion } from 'motion/react'
import type { LorenzPoint } from '@raseed/engines'

/** Room for the tick labels. `PAD_T` exists because the topmost label is centred on y = 0. */
const PAD_L = 30
const PAD_B = 20
const PAD_T = 7
const TICKS = [0, 0.25, 0.5, 0.75, 1] as const

/**
 * The Lorenz curve, with the equality diagonal for reference.
 *
 * Gini is the area between the two, doubled. Drawing the diagonal is what makes the number
 * legible — without it, 0.45 is a statistic; with it, the gap is the point.
 *
 * **Now with axes**, which D-12 named as missing everywhere and which mattered most here: both
 * scales are percentages of a whole, so the ticks are known in advance and there is no scale to
 * derive — the one case where an axis costs almost nothing and a plot without one is simply
 * unreadable. A point on a curve means nothing until you can say *which* point.
 */
export function LorenzCurve({ points, gini }: { points: readonly LorenzPoint[]; gini: number }) {
  const reduceMotion = useReducedMotion()
  const S = 300

  if (points.length < 2) {
    return <p className="py-8 text-center text-sm text-text-lo">Not enough merchants yet.</p>
  }

  const x = (share: number) => PAD_L + share * S
  const y = (share: number) => PAD_T + S - share * S

  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.populationShare).toFixed(1)},${y(p.valueShare).toFixed(1)}`)
    .join(' ')

  return (
    <div>
      <svg
        viewBox={`0 0 ${S + PAD_L} ${S + PAD_T + PAD_B}`}
        className="h-auto w-full max-w-[340px]"
        role="img"
        aria-label={`Lorenz curve of merchant spend, Gini ${gini.toFixed(2)}`}
      >
        {/* Axes. Gridlines first so the curve draws over them. */}
        <g aria-hidden className="font-mono">
          {TICKS.map((t) => (
            <g key={t}>
              <line
                x1={PAD_L}
                x2={S + PAD_L}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--line)"
                strokeWidth="1"
                opacity={t === 0 ? 1 : 0.45}
              />
              <text
                x={PAD_L - 6}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--text-lo)"
                fontSize="9"
              >
                {t * 100}
              </text>
              <text
                x={x(t)}
                y={PAD_T + S + 13}
                textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}
                fill="var(--text-lo)"
                fontSize="9"
              >
                {t * 100}
              </text>
            </g>
          ))}
          <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={PAD_T + S} stroke="var(--line)" strokeWidth="1" />
        </g>

        <path
          d={`M${PAD_L},${PAD_T + S} L${S + PAD_L},${PAD_T}`}
          stroke="var(--line)"
          strokeWidth="1"
          strokeDasharray="4 4"
          fill="none"
        />
        <motion.path
          d={`${d} L${S + PAD_L},${PAD_T + S} Z`}
          fill="var(--inr)"
          opacity={0.14}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 0.14 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        />
        <motion.path
          d={d}
          fill="none"
          stroke="var(--inr)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <p className="mt-1 text-[11px] text-text-lo">
        % of merchants (horizontal) against % of spend (vertical)
      </p>
      <p className="mt-3 text-xs leading-relaxed text-text-lo">
        The dashed line is perfect equality — every merchant taking the same share. The gap
        between it and the curve is inequality; Gini <span className="tabular font-mono">{gini.toFixed(3)}</span>{' '}
        is twice that area.
      </p>
    </div>
  )
}

/** First-digit distribution against Benford's expectation. */
export function BenfordChart({
  observed,
  expected,
  chiSquare,
  n,
}: {
  observed: readonly number[]
  expected: readonly number[]
  chiSquare: number
  n: number
}) {
  const reduceMotion = useReducedMotion()
  const max = Math.max(...observed, ...expected, 1)
  const CRITICAL = 15.51 // χ², 8 df, p = 0.05
  const conforms = chiSquare < CRITICAL

  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: 160 }}>
        {observed.map((count, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="relative flex w-full flex-1 items-end justify-center">
              <motion.div
                className="w-full rounded-t bg-inr"
                initial={reduceMotion ? false : { height: 0 }}
                animate={{ height: `${(count / max) * 100}%` }}
                transition={{ duration: 0.6, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              />
              {/* Expected value as a rule across the bar — the comparison is the whole point. */}
              <span
                aria-hidden
                className="absolute left-0 w-full border-t border-dashed border-text-lo"
                style={{ bottom: `${((expected[i] ?? 0) / max) * 100}%` }}
              />
            </div>
            <span className="tabular font-mono text-[11px] text-text-lo">{i + 1}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-text-lo">
        Bars are your leading digits; the dashed rules are Benford&apos;s expectation,
        log₁₀(1 + 1/d). χ² is <span className="tabular font-mono">{chiSquare.toFixed(2)}</span> over{' '}
        {n.toLocaleString('en-IN')} amounts —{' '}
        <span className={conforms ? 'text-good' : 'text-warn'}>
          {conforms ? `under the ${CRITICAL} critical value, so it conforms` : `above ${CRITICAL}, which is worth a look`}
        </span>
        . Only meaningful across a wide range of magnitudes; a column of similar amounts fails
        Benford for entirely innocent reasons.
      </p>
    </div>
  )
}
