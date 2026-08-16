'use client'

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, Flame, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { format } from '@raseed/money'
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useDuck, useDuckQuery } from '@/lib/duck/provider'
import { useCurrencyLens } from '@/components/shell/currency-lens'
import { nudges, ratingQueue, streak } from '@/lib/duck/loop'
import { markNudgeSent, nudgesSentThisWeek, rate } from '@/lib/store/preferences'
import { NOW } from '@/lib/duck/analytics'
import { cn } from '@/lib/utils'

/**
 * The Weekly Reckoning.
 *
 * Sixty seconds, a card at a time: rate the week's big-ticket items, see the nudges that
 * survived the budget, keep the streak. This is the retention loop — the thing that makes
 * it daily rather than a January resolution.
 */
export function Reckoning() {
  const [lens] = useCurrencyLens()
  const { reload } = useDuck()
  const reduceMotion = useReducedMotion()

  const queue = useDuckQuery(() => ratingQueue(lens, 5), [lens])
  const run = useDuckQuery(() => streak(lens), [lens])
  const sent = typeof window === 'undefined' ? [] : nudgesSentThisWeek(NOW)
  const alerts = useDuckQuery(() => nudges(lens, sent.length), [lens])

  const [index, setIndex] = useState(0)
  const [done, setDone] = useState(0)

  const cards = queue.data ?? []
  const card = cards[index]

  function score(value: -1 | 0 | 1) {
    if (!card) return
    rate(card.id, value)
    setDone((d) => d + 1)
    if (index + 1 >= cards.length) {
      // Re-ingest so regret rates and the queue reflect what was just rated.
      reload()
      setIndex(0)
    } else {
      setIndex((i) => i + 1)
    }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Panel title="Streak" hint="days logged in a row" className="lg:col-span-1">
        {run.data ? (
          <div>
            <div className="flex items-baseline gap-2">
              <Flame
                aria-hidden
                className={cn('h-6 w-6', run.data.current > 0 ? 'text-inr' : 'text-text-lo')}
              />
              <span className="tabular font-mono text-4xl font-semibold">{run.data.current}</span>
              <span className="text-sm text-text-lo">
                day{run.data.current === 1 ? '' : 's'}
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-text-lo">
              Longest run {run.data.longest} days · {run.data.daysLogged} days logged in the last
              120.
              {run.data.pendingToday && ' Nothing logged today yet.'}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-text-lo">
              This counts days you <em>recorded</em>, not days you underspent. Rewarding low
              spend would make skipping lunch look like virtue.
            </p>
          </div>
        ) : (
          <Skeleton className="h-28 w-full" />
        )}
      </Panel>

      <Panel
        title="Worth it?"
        hint={cards.length > 0 ? `${done} rated · ${cards.length - index} left` : 'nothing to rate'}
        className="lg:col-span-2"
      >
        {!queue.data ? (
          <Skeleton className="h-32 w-full" />
        ) : cards.length === 0 ? (
          <div className="flex items-center gap-3 py-6">
            <Check aria-hidden className="h-5 w-5 text-good" />
            <p className="text-sm text-text-lo">
              Everything above your typical spend is rated. New big-ticket items appear here as
              you log them.
            </p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={card?.id ?? 'empty'}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              {card && (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="text-base font-medium">{card.merchant}</p>
                      <p className="text-xs text-text-lo">
                        {card.category} ·{' '}
                        {new Date(card.occurredAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                    </div>
                    <p className="tabular font-mono text-2xl font-semibold text-inr">
                      {format(card.amount)}
                    </p>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <RateButton onClick={() => score(1)} tone="good" icon={<ThumbsUp className="h-4 w-4" />}>
                      Worth it
                    </RateButton>
                    <RateButton onClick={() => score(-1)} tone="warn" icon={<ThumbsDown className="h-4 w-4" />}>
                      Not worth it
                    </RateButton>
                    <RateButton onClick={() => score(0)} tone="muted" icon={<X className="h-4 w-4" />}>
                      Skip
                    </RateButton>
                  </div>

                  <p className="mt-4 text-xs leading-relaxed text-text-lo">
                    Only things above your 60th-percentile transaction get asked about — asking
                    about a ₹20 chai wastes the one interaction you will actually give.
                  </p>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </Panel>

      <Panel
        title="This week's nudges"
        hint={`${alerts.data?.length ?? 0} of 4 slots`}
        className="lg:col-span-3"
      >
        {!alerts.data ? (
          <Skeleton className="h-24 w-full" />
        ) : alerts.data.length === 0 ? (
          <p className="py-4 text-sm text-text-lo">
            Nothing worth interrupting you for. That is a feature — the cap is four a week and
            unused slots are not spent.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {alerts.data.map((n, i) => (
              <motion.li
                key={n.id}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="rounded-lg border border-line bg-surface-0 p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{n.title}</p>
                  <button
                    type="button"
                    onClick={() => markNudgeSent(n.id, NOW)}
                    aria-label={`Dismiss: ${n.title}`}
                    className="shrink-0 rounded p-0.5 text-text-lo hover:text-text-hi focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-text-lo">{n.body}</p>
                <p className="tabular mt-2 font-mono text-[11px] text-text-lo">
                  score {n.score.toFixed(3)}
                </p>
              </motion.li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs leading-relaxed text-text-lo">
          Scored on |impact| × urgency × novelty × (1 − fatigue), capped at four a week.
          Everything below the cut expires rather than queueing for next week — notification
          fatigue is the named reason these apps get uninstalled.
        </p>
      </Panel>
    </div>
  )
}

function RateButton({
  onClick,
  tone,
  icon,
  children,
}: {
  onClick: () => void
  tone: 'good' | 'warn' | 'muted'
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
        'focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none',
        tone === 'good' && 'border-good/40 text-good hover:bg-good/10',
        tone === 'warn' && 'border-warn/40 text-warn hover:bg-warn/10',
        tone === 'muted' && 'border-line text-text-lo hover:text-text-hi',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
