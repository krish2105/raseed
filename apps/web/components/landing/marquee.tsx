'use client'

import { useReducedMotion } from 'motion/react'

/**
 * The merchant strip.
 *
 * The reference runs a ticker of stock symbols, which is decoration standing in for data. This
 * runs the merchants actually resolved in the seeded ledger — the same alias table the app uses,
 * so the strip is a claim the product can back rather than a texture.
 *
 * CSS animation on `transform` only, duplicated once so the loop is seamless. Reduced motion
 * gets the same strip, stationary and scrollable: the names are the content, the movement is not.
 */
export function MerchantMarquee({ items }: { items: readonly string[] }) {
  const reduceMotion = useReducedMotion()
  if (items.length === 0) return null

  const run = [...items, ...items]

  return (
    <div
      className="relative border-y border-line py-4"
      style={{
        maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
      }}
    >
      {/*
        Keyboard-reachable, because under reduced motion this becomes a real horizontal
        scroller with nothing inside it to tab to — the same finding axe raised on the calendar
        heatmap. A strip you can see the start of and reach none of the rest of is not an
        acceptable static fallback.
      */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Merchants resolved in the seeded ledger"
        className={
          reduceMotion
            ? 'flex gap-10 overflow-x-auto focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none'
            : 'flex w-max gap-10 overflow-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none'
        }
        style={
          reduceMotion ? undefined : { animation: 'raseed-marquee 42s linear infinite' }
        }
      >
        {run.map((name, i) => (
          <span
            key={`${name}-${i}`}
            aria-hidden={i >= items.length}
            className="shrink-0 font-mono text-[13px] tracking-wide whitespace-nowrap text-text-lo"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}
