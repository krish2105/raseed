import { cn } from '@/lib/utils'

/**
 * A loading placeholder at the final dimensions of the thing it replaces.
 *
 * Reserving the real height is the point: a skeleton that is the wrong size just moves the
 * layout shift to the moment the data lands.
 *
 * The pulse is a CSS animation, so `prefers-reduced-motion` handling lives in globals.css
 * rather than in a hook — a skeleton must render even before the React tree hydrates.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-2', className)} />
}

export function FigureSkeleton() {
  return (
    <div>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2.5 h-[26px] w-32" />
      <Skeleton className="mt-3 h-3 w-40" />
    </div>
  )
}

export function BarsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-1.5 w-full" />
        </div>
      ))}
    </div>
  )
}

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-2.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  )
}
