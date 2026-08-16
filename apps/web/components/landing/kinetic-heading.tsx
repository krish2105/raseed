'use client'

import { useRef, type ReactNode } from 'react'
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'

/**
 * The hero headline.
 *
 * Bricolage Grotesque is a variable font with a width axis, so the type itself narrows as
 * you scroll rather than merely moving. That is the one showy moment on this page; the rest
 * stays quiet.
 *
 * Only `transform` and `opacity` animate. Reduced motion gets the finished state.
 */
export function KineticHeading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null)
  const reduceMotion = useReducedMotion()

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })

  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 })

  const y = useTransform(smooth, [0, 1], [0, -60])
  const opacity = useTransform(smooth, [0, 0.75], [1, 0])
  const width = useTransform(smooth, [0, 1], [100, 75])
  const fontVariationSettings = useTransform(width, (w) => `'wdth' ${w}`)

  if (reduceMotion) {
    return (
      <h1
        ref={ref}
        className="font-display text-[clamp(2.5rem,7.5vw,5rem)] leading-[0.92] font-semibold tracking-[-0.035em]"
      >
        {children}
      </h1>
    )
  }

  return (
    <motion.h1
      ref={ref}
      style={{ y, opacity, fontVariationSettings }}
      className="font-display text-[clamp(2.5rem,7.5vw,5rem)] leading-[0.92] font-semibold tracking-[-0.035em] will-change-transform"
    >
      {children}
    </motion.h1>
  )
}

/** Scroll-triggered reveal. Pooled IntersectionObserver via whileInView, fires once. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
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
            viewport={{ once: true }}
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
