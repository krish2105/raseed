'use client'

import { ThemeProvider as NextThemes } from 'next-themes'
import type { ReactNode } from 'react'

/**
 * attribute="data-theme" matches packages/tokens/src/tokens.css, which defines
 * :root, :root[data-theme='dark'] and :root[data-theme='light'] plus a
 * prefers-color-scheme block for the "system" setting.
 *
 * disableTransitionOnChange stops every transition on the page from firing at once when
 * the palette swaps, which otherwise reads as a flash rather than a toggle.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  )
}
