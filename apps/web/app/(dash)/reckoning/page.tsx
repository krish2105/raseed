import { Suspense } from 'react'
import { PageLoading } from '@/components/ui/page-loading'
import { ReckoningClient } from './reckoning-client'

export const metadata = { title: 'Reckoning · RASEED' }

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ReckoningClient />
    </Suspense>
  )
}
