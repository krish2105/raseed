'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeftRight,
  BarChart3,
  FlaskConical,
  LayoutGrid,
  Radar,
  Flame,
  Plane,
  Receipt,
  FileUp,
  TrendingUp,
  Waves,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export const ROUTES = [
  { href: '/tower', label: 'Tower', Icon: Radar },
  { href: '/overview', label: 'Overview', Icon: LayoutGrid },
  { href: '/flows', label: 'Flows', Icon: Waves },
  { href: '/categories', label: 'Categories', Icon: BarChart3 },
  { href: '/forecast', label: 'Forecast', Icon: TrendingUp },
  { href: '/currency', label: 'Currency', Icon: ArrowLeftRight },
  { href: '/trips', label: 'Trips', Icon: Plane },
  { href: '/reckoning', label: 'Reckoning', Icon: Flame },
  { href: '/ledger', label: 'Ledger', Icon: Receipt },
  { href: '/import', label: 'Import', Icon: FileUp },
  { href: '/lab', label: 'Lab', Icon: FlaskConical },
] as const

/**
 * Icon rail. Vertical on desktop, a horizontal scroller under the top bar on narrow
 * viewports — a 56px rail eating a 360px screen is a quarter of the width for navigation
 * nobody is using while reading a chart.
 */
export function IconRail() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Sections"
      className={cn(
        'flex shrink-0 gap-1 border-line bg-surface-1',
        'overflow-x-auto border-b p-2',
        'md:w-14 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:py-3',
      )}
    >
      {ROUTES.map(({ href, label, Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            title={label}
            className={cn(
              'group relative inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition-colors',
              'focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
              'md:w-10 md:justify-center md:px-0',
              active
                ? 'bg-accent/12 text-accent'
                : 'text-text-lo hover:bg-surface-2 hover:text-text-hi',
            )}
          >
            <Icon aria-hidden className="h-[18px] w-[18px]" />
            <span className="md:sr-only">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
