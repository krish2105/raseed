'use client'

import { motion, useReducedMotion } from 'motion/react'
import { Plane } from 'lucide-react'
import { format } from '@raseed/money'
import { Panel } from '@/components/ui/panel'
import { Figure } from '@/components/ui/figure'
import { Skeleton } from '@/components/ui/skeleton'
import { PanelError } from '@/components/ui/panel-error'
import { useDuckQuery } from '@/lib/duck/provider'
import { trips } from '@/lib/duck/analytics'

/** `2025-07-18` → `18 Jul`. Dates arrive as strings from SQL and stay strings. */
function shortDate(iso: string): string {
  const [, month, day] = iso.split('-')
  const names = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${Number(day)} ${names[Number(month)] ?? ''}`
}

/**
 * Trips, found in the ledger rather than declared.
 *
 * Nobody remembers to press "I'm travelling". A trip leaves a shape: a run of days where the
 * money moves in dirhams and the spending you'd normally do at home stops.
 */
export function TripsClient() {
  const reduceMotion = useReducedMotion()
  const result = useDuckQuery(() => trips(), [])

  const data = result.data

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Trips</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-lo">
          Found in your ledger, not declared. A run of days where the money moved in dirhams
          and your spending at home stopped. One AED purchase on an ordinary day is a
          purchase — being there is a week where most of what you spent was abroad.
        </p>
      </header>

      {result.error ? (
        <PanelError message={result.error} />
      ) : !data ? (
        <div className="grid gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Panel>
              <Figure
                label="Trips found"
                value={String(data.trips.length)}
                hint="in the last 18 months"
              />
            </Panel>
            <Panel>
              <Figure
                label="An ordinary day"
                value={format(data.baselineDaily, { compactZeroFraction: true })}
                hint="median of days you were home"
              />
            </Panel>
            <Panel>
              <Figure
                label="Travel cost you"
                value={format(
                  {
                    minor: data.trips.reduce((a, t) => a + t.excess.minor, 0),
                    currency: 'INR',
                  },
                  { compactZeroFraction: true },
                )}
                hint="above staying home"
              />
            </Panel>
          </div>

          {data.trips.length === 0 ? (
            <Panel className="mt-3">
              <p className="py-8 text-center text-sm text-text-lo">
                No trips in this window. A run of at least two days where dirham spend is most
                of what you spent is what counts — anything less is a purchase.
              </p>
            </Panel>
          ) : (
            <div className="mt-3 grid gap-3">
              {data.trips.map((t, i) => (
                <motion.div
                  key={t.startDay}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Panel>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <Plane aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-aed" />
                        <div className="min-w-0">
                          <h2 className="font-display text-lg font-semibold tracking-tight">
                            {shortDate(t.startDay)} – {shortDate(t.endDay)}
                          </h2>
                          <p className="tabular mt-0.5 font-mono text-xs text-text-lo">
                            {t.days} days · {(t.awayShare * 100).toFixed(0)}% of spend in AED
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="tabular font-mono text-xl font-semibold text-aed">
                          {format(t.away, { compactZeroFraction: true })}
                        </p>
                        <p className="tabular font-mono text-xs text-text-lo">
                          {format(t.total, { compactZeroFraction: true })} all in
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-text-lo">Burn rate</p>
                        <p className="tabular mt-0.5 font-mono text-sm">
                          {format(t.burn, { compactZeroFraction: true })}/day
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-text-lo">Home spend that continued</p>
                        <p className="tabular mt-0.5 font-mono text-sm">
                          {format(
                            { minor: t.homeMinor, currency: 'INR' },
                            { compactZeroFraction: true },
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-text-lo">Cost above staying home</p>
                        <p className="tabular mt-0.5 font-mono text-sm text-warn">
                          {format(t.excess, { compactZeroFraction: true })}
                        </p>
                      </div>
                    </div>

                    {/* The bar is the honest version of the headline: how much of the trip was
                        the trip, and how much was life carrying on without you. */}
                    <div
                      className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-surface-2"
                      role="img"
                      aria-label={`${format(t.away)} abroad against ${format({ minor: t.homeMinor, currency: 'INR' })} at home`}
                    >
                      <span
                        className="block h-full bg-aed"
                        style={{ width: `${t.awayShare * 100}%` }}
                      />
                      <span className="block h-full flex-1 bg-inr/50" />
                    </div>
                  </Panel>
                </motion.div>
              ))}
            </div>
          )}

          <p className="mt-4 max-w-2xl text-xs leading-relaxed text-text-lo">
            &ldquo;An ordinary day&rdquo; is the <em>median</em> of the days you were home, not
            the mean of everything. Including trip days would be circular — a big trip would
            raise the bar it is measured against — and a mean lets one rent day set the
            standard for a Tuesday. Dirhams are converted at the rate frozen on each row on the
            day it happened, so a trip costs what it cost then.
          </p>
        </>
      )}
    </div>
  )
}
