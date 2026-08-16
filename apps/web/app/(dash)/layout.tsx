import { Suspense } from 'react'
import { IconRail } from '@/components/shell/icon-rail'
import { TopBar } from '@/components/shell/top-bar'
import { DuckProvider } from '@/lib/duck/provider'

/**
 * Dashboard shell. Native scroll, not Lenis — hijacked scroll fights dense data, and Lenis
 * belongs on the landing route where the scroll is the narrative.
 */
export default function DashLayout({ children }: LayoutProps<'/'>) {
  return (
    <DuckProvider>
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
      {/* min-w-0 is load-bearing. A flex item's min-width defaults to `auto`, which
          resolves to its min-content width — here the icon rail's 376px of chips — so this
          row refused to shrink below that and the whole page scrolled sideways at 360px.
          The rail's own overflow-x-auto cannot help while its parent will not narrow. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        <IconRail />
        {/* tabIndex 0, not -1: this scrolls, and a region you can scroll must be one a
            keyboard user can reach and drive with the arrow keys. -1 made it a skip-link
            target only, which is not the same thing. */}
        <main
          id="content"
          tabIndex={0}
          aria-label="Main content"
          className="min-w-0 flex-1 overflow-y-auto"
        >
          {children}
        </main>
      </div>
      </div>
    </DuckProvider>
  )
}
