import { Suspense } from 'react'
import { PageLoading } from '@/components/ui/page-loading'
import { LabClient } from './lab-client'

export const metadata = { title: 'Lab · RASEED' }

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <LabClient />
    </Suspense>
  )
}
