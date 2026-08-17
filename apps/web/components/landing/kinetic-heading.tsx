'use client'

import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

/**
 * Reveal and SplitLine.
 *
 * `KineticHeading` used to live here and animated Bricolage Grotesque's **width axis** as you
 * scrolled — the one showy moment on the page. Plus Jakarta Sans is variable on weight only, so
 * when the display face changed that effect had no axis to animate. It was deleted rather than
 * re-staged as a scale transform, which would have been the same gesture pretending to be
 * typographic. The new hero earns its first impression from the layout instead.
 */

/**
 * Reveal-on-enter.
 *
 * `amount: 0.05` and no negative margin, deliberately: a viewport margin of -80px means an
 * element that never sits 80px inside the viewport never fires at all, and since the
 * initial state is `opacity: 0` that content is then invisible forever. Short pages and
 * short viewports hit this. Anything even slightly on screen must resolve.
 *
 * Above-the-fold content should pass `onMount` rather than wait for a scroll it will never
 * receive.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  onMount = false,
  as = 'div',
}: {
  children: ReactNode
  delay?: number
  className?: string
  onMount?: boolean
  /**
   * The element to render. `div` unless the wrapper sits somewhere a `div` is invalid.
   *
   * This exists because it broke something real. Wrapping each `<li>` in a `Reveal` put a
   * `div` between the `<ul>` and its items — a content-model violation that cost eight points
   * of Lighthouse accessibility and had survived every green run of the axe suite, because
   * the landing route was not in it. The animation wrapper has to *be* the list item.
   */
  as?: 'div' | 'li'
}) {
  const reduceMotion = useReducedMotion()
  const transition = { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const }

  const Static = as
  const Motion = as === 'li' ? motion.li : motion.div

  if (reduceMotion) return <Static className={className}>{children}</Static>

  if (onMount) {
    return (
      <Motion
        data-reveal
        className={className}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
      >
        {children}
      </Motion>
    )
  }

  return (
    <Motion
      data-reveal
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.05 }}
      transition={transition}
    >
      {children}
    </Motion>
  )
}

/** A word-by-word reveal for a single line. Splits on spaces, so it keeps real text nodes. */
export function SplitLine({ text, className }: { text: string; className?: string }) {
  const reduceMotion = useReducedMotion()
  const words = text.split(' ')

  if (reduceMotion) return <span className={className}>{text}</span>

  return (
    <span className={className}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="inline-block overflow-hidden align-bottom">
          <motion.span
            className="inline-block"
            initial={{ y: '110%' }}
            whileInView={{ y: 0 }}
            viewport={{ once: true, amount: 0.05 }}
            transition={{ duration: 0.6, delay: i * 0.035, ease: [0.16, 1, 0.3, 1] }}
          >
            {word}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  )
}
