import { Suspense } from 'react'
import { PageLoading } from '@/components/ui/page-loading'
import { OverviewClient } from './overview-client'

export const metadata = { title: 'Overview · RASEED' }

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <OverviewClient />
    </Suspense>
  )
}
