'use client'

import Link from 'next/link'
import { ThemeToggle } from './theme-toggle'
import { CurrencyLens } from './currency-lens'
import { QueryBar } from './query-bar'
import { AddExpense } from './add-expense'

export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface-1 px-3 sm:gap-3 sm:px-4">
      <Link
        href="/"
        className="font-display shrink-0 text-[15px] font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
      >
        RASEED
      </Link>

      <span aria-hidden className="hidden h-4 w-px shrink-0 bg-line sm:block" />

      <QueryBar />

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <AddExpense />
        <CurrencyLens />
        <ThemeToggle />
      </div>
    </header>
  )
}
