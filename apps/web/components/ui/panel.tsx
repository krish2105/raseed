import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface PanelProps {
  title?: string
  hint?: string
  children: ReactNode
  className?: string
  /**
   * Share of the panel's data denominated in AED, 0–1. Drives the left edge: warm for
   * INR-dominant, cool for AED, a gradient for a month you travelled. It encodes something
   * true rather than decorating.
   */
  aedShare?: number
}

export function Panel({ title, hint, children, className, aedShare }: PanelProps) {
  const edge =
    aedShare === undefined
      ? undefined
      : aedShare <= 0.02
        ? 'var(--inr)'
        : aedShare >= 0.98
          ? 'var(--aed)'
          : `linear-gradient(to bottom, var(--inr) ${Math.round((1 - aedShare) * 100)}%, var(--aed) 100%)`

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-xl border border-line bg-surface-1',
        className,
      )}
    >
      {edge && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5" style={{ background: edge }} />}
      {(title || hint) && (
        <header className="flex items-baseline justify-between gap-3 px-5 pt-4">
          {title && <h2 className="text-sm font-medium text-text-hi">{title}</h2>}
          {hint && <p className="text-xs text-text-lo">{hint}</p>}
        </header>
      )}
      <div className="px-5 pt-3 pb-5">{children}</div>
    </section>
  )
}
