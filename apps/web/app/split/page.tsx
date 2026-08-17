import type { Metadata } from 'next'
import { SplitClient } from './split-client'

/**
 * A shared split, opened by someone who has never used this app.
 *
 * `noindex` because the page is meaningless without a fragment and there is nothing here for a
 * crawler to keep. The content itself is client-only by necessity: the fragment never reaches
 * the server, which is the property the whole feature rests on.
 */
export const metadata: Metadata = {
  title: 'A split · RASEED',
  description: 'A shared expense, decoded in your browser. Nothing was uploaded to open it.',
  robots: { index: false, follow: false },
}

export default function SharedSplitPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-6 py-12 md:py-20">
      <SplitClient />
    </main>
  )
}
