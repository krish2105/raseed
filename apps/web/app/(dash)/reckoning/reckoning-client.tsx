'use client'

import { Reckoning } from '@/components/insight/reckoning'
import { WalletCount } from '@/components/insight/wallet'

export function ReckoningClient() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
          The Reckoning
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-lo">
          Sixty seconds, once a week. Rate the big-ticket items, keep the streak, and see the
          few nudges that survived the budget.
        </p>
      </header>
      <div className="mb-3">
        <WalletCount />
      </div>

      <Reckoning />
    </div>
  )
}
