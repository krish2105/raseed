'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { AddExpense } from './add-expense'
import { CurrencyLens } from './currency-lens'
import { ThemeToggle } from './theme-toggle'
import { cn } from '@/lib/utils'

/**
 * The floating command dock.
 *
 * Everything you *do* — add, switch currency, change theme — lives in one place within
 * thumb reach at the bottom of the screen, instead of scattered along a top bar you have to
 * travel to. The top bar keeps identity and search; the dock keeps actions.
 *
 * Glass is used here and in almost nowhere else, which is the point: a translucent surface
 * signals "floating above the content" only while it stays rare. A page where several
 * things are glass has nothing floating above anything.
 */
export function CommandDock() {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const [hidden, setHidden] = useState(false)

  /**
   * Get out of the way while scrolling down, come back on the way up.
   *
   * A permanently pinned dock covers the last row of every table on a short screen. Tying
   * it to direction rather than position means it is present exactly when you have stopped
   * to read something.
   */
  useEffect(() => {
    let last = window.scrollY
    let frame = 0

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        const y = window.scrollY
        // The 24px deadband stops a trackpad's jitter from flickering it on and off.
        if (Math.abs(y - last) > 24) {
          setHidden(y > last && y > 160)
          last = y
        }
        frame = 0
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <motion.div
      ref={ref}
      // `animate` on transform only. The dock sits above a scrolling page, so anything
      // that triggers layout here janks the whole scroll.
      animate={reduceMotion ? undefined : { y: hidden ? 96 : 0, opacity: hidden ? 0 : 1 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center',
        'px-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
      )}
    >
      <div
        className={cn(
          'glass elev-3 pointer-events-auto flex items-center gap-2 rounded-2xl px-2 py-2',
          // Never wider than the viewport on a small screen; the lens is the part that
          // would otherwise push it out.
          'max-w-[calc(100vw-2rem)] overflow-x-auto',
        )}
      >
        <AddExpense />
        <span aria-hidden className="h-6 w-px shrink-0 bg-line" />
        <CurrencyLens />
        <span aria-hidden className="h-6 w-px shrink-0 bg-line" />
        <ThemeToggle />
      </div>
    </motion.div>
  )
}
