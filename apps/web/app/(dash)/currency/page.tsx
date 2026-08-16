import { Suspense } from 'react'
import { PageLoading } from '@/components/ui/page-loading'
import { CurrencyClient } from './currency-client'

export const metadata = { title: 'Currency · RASEED' }

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <CurrencyClient />
    </Suspense>
  )
}
