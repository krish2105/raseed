import { Suspense } from 'react'
import { PageLoading } from '@/components/ui/page-loading'
import { CategoriesClient } from './categories-client'

export const metadata = { title: 'Categories · RASEED' }

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <CategoriesClient />
    </Suspense>
  )
}
