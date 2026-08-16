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
      <Suspense fallback={<div className="h-14 shrink-0 border-b border-line bg-surface-1" />}>
        <TopBar />
      </Suspense>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <IconRail />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
