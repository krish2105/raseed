import { cn } from '@/lib/utils'

export interface FigureProps {
  label: string
  value: string
  /** Signed change vs the previous period, as a fraction. */
  delta?: number
  /** Lower is better for spend, higher is better for savings rate. */
  goodDirection?: 'up' | 'down'
  accent?: 'inr' | 'aed' | 'none'
  hint?: string
}

/**
 * A single figure. Tabular numerals, always. Colour is used for the currency temperature,
 * not for good/bad — the arrow carries the direction so it survives a colour-blind reader
 * and a greyscale print.
 */
export function Figure({ label, value, delta, goodDirection = 'down', accent = 'none', hint }: FigureProps) {
  const good = delta === undefined ? null : goodDirection === 'down' ? delta <= 0 : delta >= 0

  return (
    <div>
      <p className="text-xs text-text-lo">{label}</p>
      <p
        className={cn(
          'tabular mt-1.5 font-mono text-[26px] leading-none font-semibold tracking-tight',
          accent === 'inr' && 'text-inr',
          accent === 'aed' && 'text-aed',
        )}
      >
        {value}
      </p>
      {delta !== undefined && (
        <p
          className={cn(
            'tabular mt-2 font-mono text-xs',
            good === null ? 'text-text-lo' : good ? 'text-good' : 'text-warn',
          )}
        >
          <span aria-hidden>{delta >= 0 ? '▲' : '▼'}</span>{' '}
          {Math.abs(delta * 100).toFixed(1)}%
          <span className="text-text-lo"> {hint ?? 'vs prior period'}</span>
        </p>
      )}
      {delta === undefined && hint && <p className="mt-2 text-xs text-text-lo">{hint}</p>}
    </div>
  )
}
