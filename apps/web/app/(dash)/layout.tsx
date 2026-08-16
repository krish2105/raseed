import { Suspense } from 'react'
import { IconRail } from '@/components/shell/icon-rail'
import { TopBar } from '@/components/shell/top-bar'

/**
 * Dashboard shell. Native scroll, not Lenis — hijacked scroll fights dense data, and Lenis
 * belongs on the landing route where the scroll is the narrative.
 */
export default function DashLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex h-dvh flex-col">
      {/* Without this, a keyboard user tabs through all seven rail items on every page
          before reaching the content. Visible only when focused. */}
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-text-hi focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-surface-0"
      >
        Skip to content
      </a>
      <Suspense fallback={<div className="h-14 shrink-0 border-b border-line bg-surface-1" />}>
        <TopBar />
      </Suspense>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <IconRail />
        <main id="content" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
