'use client'

import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { format, type Money } from '@raseed/money'
import { cn } from '@/lib/utils'

/**
 * The corridor — money moving between two countries, in depth.
 *
 * **Why this is CSS 3D and not WebGL.** `react-three-fiber` plus `three` is roughly 600KB
 * over the wire for what is, honestly, two nodes and some arcs. On a finance dashboard the
 * first paint matters more than the technique, and a globe that costs a second of load to
 * show a number the user could read in a table is a worse product, not a fancier one. Real
 * perspective, real parallax, real depth sorting — done with `transform-style: preserve-3d`
 * and 4KB of markup.
 *
 * If the brand later wants a true globe, this is the component to replace and the arcs are
 * the data shape to keep. It is not a placeholder for one; it is the right size for the job.
 */

export interface CorridorFlow {
  readonly label: string
  readonly outbound: Money
  readonly inbound: Money
  /** Effective rate achieved, against mid-market. 1 is perfect, 0.97 is a 3% haircut. */
  readonly efficiency: number
}

export function Corridor({
  flows,
  className,
}: {
  flows: readonly CorridorFlow[]
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  const total = flows.reduce((a, f) => a + f.outbound.minor, 0)
  const worst = flows.reduce(
    (a, f) => (f.efficiency < a.efficiency ? f : a),
    flows[0] ?? { efficiency: 1, label: '', outbound: { minor: 0, currency: 'AED' as const }, inbound: { minor: 0, currency: 'INR' as const } },
  )

  /**
   * Pointer parallax, capped at 6°.
   *
   * Enough to read as depth, small enough that nobody has to chase a moving target to click
   * it. Disabled outright for a coarse pointer: on touch there is no hover, so this would
   * only fire mid-tap and make the surface feel unstable under the finger.
   */
  function onMove(e: React.PointerEvent) {
    if (reduceMotion || e.pointerType !== 'mouse') return
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setTilt({
      x: ((e.clientY - box.top) / box.height - 0.5) * -6,
      y: ((e.clientX - box.left) / box.width - 0.5) * 6,
    })
  }

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      className={cn('relative', className)}
      style={{ perspective: '900px' }}
    >
      <motion.div
        animate={{ rotateX: tilt.x, rotateY: tilt.y }}
        transition={{ type: 'spring', stiffness: 140, damping: 18 }}
        style={{ transformStyle: 'preserve-3d' }}
        className="relative h-full w-full"
      >
        <svg viewBox="0 0 400 190" className="h-auto w-full" role="img" aria-label={corridorLabel(flows)}>
          <defs>
            {/* Currency is a temperature: the arc runs from the dirham's verdigris into the
                rupee's brass, so direction is legible without an arrowhead. */}
            <linearGradient id="corridor-flow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--aed)" />
              <stop offset="100%" stopColor="var(--inr)" />
            </linearGradient>
          </defs>

          {/* Ground plane, drawn in perspective so the arcs have something to sit above. */}
          {[0, 1, 2, 3].map((i) => (
            <ellipse
              key={i}
              cx="200"
              cy={150 + i * 9}
              rx={150 - i * 26}
              ry={10 - i * 2}
              fill="none"
              stroke="var(--line)"
              strokeWidth="0.5"
              opacity={0.5 - i * 0.1}
            />
          ))}

          {flows.slice(0, 5).map((f, i) => {
            const share = total === 0 ? 0 : f.outbound.minor / total
            // Bigger flows arc higher. Depth ordering is by index, so later (smaller) arcs
            // sit behind — which is what makes it read as a stack rather than a tangle.
            const lift = 40 + share * 70
            const d = `M 70 145 Q 200 ${145 - lift} 330 145`

            return (
              <motion.path
                key={f.label}
                d={d}
                fill="none"
                stroke="url(#corridor-flow)"
                strokeWidth={1.5 + share * 4}
                strokeLinecap="round"
                opacity={0.9 - i * 0.15}
                initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.9 - i * 0.15 }}
                transition={{ duration: 1.1, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
              />
            )
          })}

          {/* The two ends. Labelled, because an unlabelled node is decoration. */}
          {[
            { x: 70, label: 'AED', fill: 'var(--aed)' },
            { x: 330, label: 'INR', fill: 'var(--inr)' },
          ].map((node) => (
            <g key={node.label}>
              <circle cx={node.x} cy="145" r="7" fill={node.fill} />
              <circle cx={node.x} cy="145" r="13" fill="none" stroke={node.fill} strokeWidth="1" opacity="0.35" />
              <text
                x={node.x}
                y="175"
                textAnchor="middle"
                className="tabular font-mono"
                fontSize="11"
                fill="var(--text-lo)"
              >
                {node.label}
              </text>
            </g>
          ))}
        </svg>
      </motion.div>

      {flows.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-text-lo">
          {flows.length} transfers, {format({ minor: total, currency: flows[0]!.outbound.currency }, { compactZeroFraction: true })} sent.
          Thickest arc is the largest.{' '}
          {worst.efficiency < 0.985 && (
            <>
              The {worst.label} transfer landed at{' '}
              <span className="tabular font-mono text-warn">
                {(worst.efficiency * 100).toFixed(1)}%
              </span>{' '}
              of mid-market.
            </>
          )}
        </p>
      )}
    </div>
  )
}

/** One sentence a screen reader can use instead of the picture. */
function corridorLabel(flows: readonly CorridorFlow[]): string {
  if (flows.length === 0) return 'No transfers between AED and INR yet'
  const total = flows.reduce((a, f) => a + f.outbound.minor, 0)
  return `${flows.length} transfers from AED to INR totalling ${format({
    minor: total,
    currency: flows[0]!.outbound.currency,
  })}`
}
