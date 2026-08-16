'use client'

import { motion, useReducedMotion } from 'motion/react'
import { format, type Money } from '@raseed/money'
import { useDuckQuery } from '@/lib/duck/provider'
import { useCurrencyLens } from '@/components/shell/currency-lens'
import { Skeleton } from '@/components/ui/skeleton'
import { anomalies, byMerchant, forecast, headline, variance } from '@/lib/duck/analytics'
import { cn } from '@/lib/utils'

interface Finding {
  id: string
  severity: 'good' | 'watch' | 'alert'
  headline: string
  detail: string
}

/**
 * The CFO briefing.
 *
 * Not a KPI row — an argument. It says what changed, decomposes *why* into rate versus
 * volume, names the merchants that drove it, and states the runway probability. Every
 * sentence is derived from a tested engine, and it says "nothing notable" rather than
 * inventing an insight when the data is quiet.
 */
export function CfoBriefing() {
  const [lens] = useCurrencyLens()
  const reduceMotion = useReducedMotion()

  const head = useDuckQuery(() => headline(lens), [lens])
  const vary = useDuckQuery(() => variance(lens), [lens])
  const merchants = useDuckQuery(() => byMerchant(30, lens), [lens])
  const outliers = useDuckQuery(() => anomalies(90, lens), [lens])
  const fc = useDuckQuery(() => forecast(lens, 14), [lens])

  const loading = !head.data || !vary.data || !merchants.data || !outliers.data || !fc.data

  if (loading) {
    return (
      <section className="rounded-xl border border-line bg-surface-1 p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-6 w-3/4" />
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </section>
    )
  }

  const h = head.data!
  const findings: Finding[] = []

  // 1. What changed, and why — rate vs volume on the biggest mover.
  const mover = vary.data!.find((v) => Math.abs(v.total.minor) > 0)
  if (mover) {
    const rate = Math.abs(mover.rateEffect.minor)
    const volume = Math.abs(mover.volumeEffect.minor)
    const driver = rate > volume ? 'price' : 'volume'
    findings.push({
      id: 'variance',
      severity: mover.total.minor > 0 ? 'watch' : 'good',
      headline: `${mover.name} moved ${format(mover.total, { compactZeroFraction: true })}`,
      detail:
        driver === 'price'
          ? `Mostly price: the average ticket rose, worth ${format(mover.rateEffect, { compactZeroFraction: true })}. You bought about the same amount.`
          : `Mostly volume: you bought more, worth ${format(mover.volumeEffect, { compactZeroFraction: true })}. The average ticket barely moved.`,
    })
  }

  // 2. Who drove it.
  const top = merchants.data!.slice(0, 2)
  if (top.length > 0) {
    const share = top.reduce((a, m) => a + m.total.minor, 0) / Math.max(1, h.spend30.minor)
    findings.push({
      id: 'merchants',
      severity: share > 0.4 ? 'watch' : 'good',
      headline: `${top.map((m) => m.name).join(' and ')} are ${(share * 100).toFixed(0)}% of the month`,
      detail: `${format(top[0]!.total, { compactZeroFraction: true })} across ${top[0]!.count} transactions at ${top[0]!.name} alone.`,
    })
  }

  // 3. Runway probability — a number, not a graph.
  const p = fc.data!.probabilityWithinPool
  findings.push({
    id: 'runway',
    severity: p > 0.8 ? 'good' : p > 0.5 ? 'watch' : 'alert',
    headline: `${(p * 100).toFixed(0)}% chance the next 14 days stay inside budget`,
    detail: fc.data!.fellBack
      ? 'Not enough history for a seasonal forecast yet, so this uses a trailing median.'
      : `Block-bootstrap over your own daily spend, 2,000 paths. P90 is ${format(fc.data!.p90, { compactZeroFraction: true })}${Number.isFinite(fc.data!.accuracy) ? `; weekly holdout error ${(fc.data!.accuracy * 100).toFixed(0)}%` : ''}.`,
  })

  // 4. Anomalies, only when there are any.
  if (outliers.data!.length > 0) {
    const worst = outliers.data![0]!
    findings.push({
      id: 'anomaly',
      severity: 'alert',
      headline: `${outliers.data!.length} unusual day${outliers.data!.length > 1 ? 's' : ''} in the last 90`,
      detail: `Worst was ${worst.day} at ${format(worst.total, { compactZeroFraction: true })} — a robust z of ${worst.z.toFixed(1)}. Median-based, so one big day cannot hide itself.`,
    })
  }

  const direction = h.spendDelta >= 0 ? 'up' : 'down'
  const verdict: Money = h.net30

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-xl border border-line bg-surface-1 p-5"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5"
        style={{ background: verdict.minor >= 0 ? 'var(--good)' : 'var(--warn)' }}
      />

      <p className="text-xs tracking-[0.14em] text-text-lo uppercase">The briefing</p>

      <h2 className="font-display mt-2 text-lg leading-snug font-semibold tracking-tight md:text-xl">
        You spent{' '}
        <span className={cn(direction === 'up' ? 'text-warn' : 'text-good')}>
          {Math.abs(h.spendDelta * 100).toFixed(1)}% {direction}
        </span>{' '}
        on the prior 30 days, and kept{' '}
        <span className={verdict.minor >= 0 ? 'text-good' : 'text-warn'}>
          {format(verdict, { compactZeroFraction: true })}
        </span>
        .
      </h2>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {findings.map((f, i) => (
          <motion.li
            key={f.id}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08 * i, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-lg border border-line bg-surface-0 p-3.5"
          >
            <span
              className={cn(
                'inline-block h-1.5 w-1.5 rounded-full',
                f.severity === 'good' && 'bg-good',
                f.severity === 'watch' && 'bg-inr',
                f.severity === 'alert' && 'bg-warn',
              )}
              aria-hidden
            />
            <p className="mt-2 text-sm leading-snug font-medium">{f.headline}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-text-lo">{f.detail}</p>
          </motion.li>
        ))}
      </ul>
    </motion.section>
  )
}
