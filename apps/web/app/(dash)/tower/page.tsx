import { Suspense } from 'react'
import { PageLoading } from '@/components/ui/page-loading'
import { TowerClient } from './tower-client'

export const metadata = { title: 'Control Tower · RASEED' }

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <TowerClient />
    </Suspense>
  )
}
