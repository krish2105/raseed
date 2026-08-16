import { Skeleton } from '@/components/ui/skeleton'

/**
 * Suspense fallback for a dashboard route.
 *
 * Every page reads the currency lens from the URL, and `useSearchParams` forces a
 * client-side bailout during static prerender — so each route needs its own boundary.
 * Sized to the real header + panel so the swap does not shift the layout.
 */
export function PageLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      <Skeleton className="mt-6 h-[420px] w-full" />
    </div>
  )
}
