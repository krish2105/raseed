import { Suspense } from 'react'
import { PageLoading } from '@/components/ui/page-loading'
import { FlowsClient } from './flows-client'

export const metadata = { title: 'Flows · RASEED' }

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <FlowsClient />
    </Suspense>
  )
}
