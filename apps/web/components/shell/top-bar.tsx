'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'
import { CurrencyLens } from './currency-lens'

/**
 * Top bar: wordmark, the currency lens, the (not yet wired) command bar, theme toggle.
 * The command bar is a real button rather than a div so it is reachable by keyboard now,
 * before S16 gives it behaviour.
 */
export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface-1 px-4">
      <Link
        href="/"
        className="font-display text-[15px] font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
      >
        RASEED
      </Link>

      <span aria-hidden className="hidden h-4 w-px bg-line sm:block" />

      <button
        type="button"
        disabled
        title="Coming in session 16"
        className="hidden min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface-0 px-3 py-1.5 text-left text-sm text-text-lo sm:flex disabled:cursor-not-allowed"
      >
        <Search aria-hidden className="h-4 w-4 shrink-0" />
        <span className="truncate">Ask your ledger…</span>
        <kbd className="ml-auto shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[11px]">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2 sm:ml-0">
        <CurrencyLens />
        <ThemeToggle />
      </div>
    </header>
  )
}
