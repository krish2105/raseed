import { Suspense } from 'react'
import { PageLoading } from '@/components/ui/page-loading'
import { LedgerClient } from './ledger-client'

export const metadata = { title: 'Ledger · RASEED' }

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <LedgerClient />
    </Suspense>
  )
}
