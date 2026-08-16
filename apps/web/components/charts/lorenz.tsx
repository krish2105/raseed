'use client'

import { motion, useReducedMotion } from 'motion/react'
import type { LorenzPoint } from '@raseed/engines'

/**
 * The Lorenz curve, with the equality diagonal for reference.
 *
 * Gini is the area between the two, doubled. Drawing the diagonal is what makes the number
 * legible — without it, 0.45 is a statistic; with it, the gap is the point.
 */
export function LorenzCurve({ points, gini }: { points: readonly LorenzPoint[]; gini: number }) {
  const reduceMotion = useReducedMotion()
  const S = 300

  if (points.length < 2) {
    return <p className="py-8 text-center text-sm text-text-lo">Not enough merchants yet.</p>
  }

  const d = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${(p.populationShare * S).toFixed(1)},${(S - p.valueShare * S).toFixed(1)}`,
    )
    .join(' ')

  return (
    <div>
      <svg
        viewBox={`0 0 ${S} ${S}`}
        className="h-auto w-full max-w-[320px]"
        role="img"
        aria-label={`Lorenz curve of merchant spend, Gini ${gini.toFixed(2)}`}
      >
        <path d={`M0,${S} L${S},0`} stroke="var(--line)" strokeWidth="1" strokeDasharray="4 4" fill="none" />
        <motion.path
          d={`${d} L${S},${S} Z`}
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
