'use client'

import { useEffect } from 'react'
import { useReducedMotion } from 'motion/react'
import Lenis from 'lenis'

/**
 * Lenis, on the landing route only.
 *
 * The dashboard keeps native scroll: hijacked scroll fights dense data, and a chart you are
 * trying to read should not glide past you. Here the scroll *is* the narrative, so the
 * easing earns its place.
 *
 * Reduced motion gets the native experience — not a slower Lenis, no Lenis at all.
 */
export function SmoothScroll() {
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) return

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)),
    })

    let frame = 0
    const raf = (time: number) => {
      lenis.raf(time)
      frame = requestAnimationFrame(raf)
    }
    frame = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(frame)
      lenis.destroy()
    }
  }, [reduceMotion])

  return null
}
