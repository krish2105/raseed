import type { Metadata } from 'next'
import { Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { ThemeProvider } from '@/components/shell/theme-provider'
import '@raseed/tokens/tokens.css'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })
const bricolage = Bricolage_Grotesque({ variable: '--font-bricolage', subsets: ['latin'] })

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
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <ThemeProvider>
          <NuqsAdapter>{children}</NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  )
}
