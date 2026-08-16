'use client'

import * as React from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { format, money, type Money } from '@raseed/money'
import { cn } from '@/lib/utils'

interface AmountCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  amount: Money
}

/**
 * Adapted from the 21st.dev "Stat Card" (@ravikatiyar162/card-10).
 *
 * Changed from the generated source:
 *  - imports from `motion/react`, not `framer-motion` (CLAUDE.md library facts)
 *  - the count-up is gated behind `useReducedMotion()` with a complete static fallback
 *  - the accent resolves from a CSS variable, so it re-resolves on theme change
 *  - all formatting goes through @raseed/money; this component does no arithmetic
 */
export function AmountCard({ label, amount, className, ...props }: AmountCardProps) {
  const reduceMotion = useReducedMotion()
  const count = useMotionValue(reduceMotion ? amount.minor : 0)
  const text = useTransform(count, (latest) =>
    format(money(Math.round(latest), amount.currency)),
  )

  React.useEffect(() => {
    if (reduceMotion) {
      count.set(amount.minor)
      return
    }
    const controls = animate(count, amount.minor, { duration: 0.9, ease: [0.16, 1, 0.3, 1] })
    return () => controls.stop()
  }, [amount.minor, count, reduceMotion])

  // Currency is a temperature: INR reads warm brass, AED cool verdigris.
  const accent = amount.currency === 'INR' ? 'var(--inr)' : 'var(--aed)'

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-line bg-surface-1 p-6',
        className,
      )}
      {...props}
    >
      {/* Structural device: a 2px left edge carrying the currency's temperature. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-0.5" style={{ background: accent }} />
      <p className="text-sm text-text-lo">{label}</p>
      <motion.p
        className="tabular mt-2 font-mono text-4xl font-semibold tracking-tight"
        style={{ color: accent }}
      >
        {text}
      </motion.p>
    </div>
  )
}
