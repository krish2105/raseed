import { Suspense } from 'react'
import { PageLoading } from '@/components/ui/page-loading'
import { TripsClient } from './trips-client'

export const metadata = { title: 'Trips · RASEED' }

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <TripsClient />
    </Suspense>
  )
}
