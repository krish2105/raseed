import { Suspense } from 'react'
import { PageLoading } from '@/components/ui/page-loading'
import { ForecastClient } from './forecast-client'

export const metadata = { title: 'Forecast · RASEED' }

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ForecastClient />
    </Suspense>
  )
}
