import type { Metadata } from 'next'
import { Geist, Geist_Mono, Noto_Sans_Arabic, Plus_Jakarta_Sans } from 'next/font/google'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { ThemeProvider } from '@/components/shell/theme-provider'
import { LOCALE_SCRIPT } from '@/components/shell/locale-store'
import '@raseed/tokens/tokens.css'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })
const jakarta = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'] })

/**
 * The Arabic face, and it is not optional.
 *
 * Geist and Plus Jakarta Sans are Latin-only — `subsets: ['latin']`, and neither has Arabic
 * glyphs at all. Setting `dir="rtl"` without loading this would have mirrored the layout
 * correctly and then rendered every Arabic string in whatever fallback the OS happens to have,
 * which on a stock Windows machine is a different face at a different weight and size from
 * everything around it. Loading the font is the half of RTL support that is easy to forget
 * because it looks fine on the Mac you built it on.
 */
const notoArabic = Noto_Sans_Arabic({ variable: '--font-arabic', subsets: ['arabic'] })

export const metadata: Metadata = {
  title: 'RASEED',
  description:
    'A dual-currency financial command centre for money that lives between India and the UAE.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // suppressHydrationWarning is required: next-themes writes data-theme on the client
    // before React hydrates, so the server and client markup legitimately differ here.
    <html
      lang="en"
      suppressHydrationWarning
      className={`no-js ${geistSans.variable} ${geistMono.variable} ${jakarta.variable} ${notoArabic.variable} h-full antialiased`}
    >
      <head>
        {/* Removed synchronously before paint, so there is no flash. If this never runs,
            .no-js stays and the reveal wrappers are forced visible by CSS. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.remove('no-js')`,
          }}
        />
        {/* Direction, before paint. Same slot and same reasoning as the line above: hydrating
            first would mean rendering the whole dashboard left-to-right and flipping it while
            the reader watches. `lang` is set here too — the server cannot know it. */}
        <script dangerouslySetInnerHTML={{ __html: LOCALE_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans">
        <ThemeProvider>
          <NuqsAdapter>{children}</NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  )
}
