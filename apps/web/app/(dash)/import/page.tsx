import { Suspense } from 'react'
import { PageLoading } from '@/components/ui/page-loading'
import { ImportClient } from './import-client'

export const metadata = { title: 'Import · RASEED' }

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ImportClient />
    </Suspense>
  )
}
