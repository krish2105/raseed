'use client'

import { useCallback, useSyncExternalStore } from 'react'

import { direction, isRTL, t as translate, type Locale, type StringKey } from '@raseed/i18n'

/**
 * The locale, on the web.
 *
 * **Not a URL param, and that is a considered exception to the nuqs rule.** `CLAUDE.md` says every
 * view is a URL and pasting it reproduces the exact view including the currency lens. The currency
 * lens belongs there because it changes *what the numbers mean* — the same page in INR and in AED
 * shows different figures, so a link without it is a link to a different answer. Language changes
 * what the labels say, not what anything is worth. Theme is already handled this way for the same
 * reason and nobody has wanted it in the URL. Putting locale in the query string would also mean
 * every shared link carries the sharer's language and imposes it on the reader.
 *
 * **Direction changes at runtime here, unlike on the phone.** React Native reads layout direction
 * once when the native views are created, so mobile has to ask for a restart. The DOM re-lays-out
 * on a `dir` attribute change, so the web has no such excuse and does it immediately.
 */

const KEY = 'raseed.locale'

const listeners = new Set<() => void>()

function read(): Locale {
  if (typeof window === 'undefined') return 'en'
  const stored = window.localStorage.getItem(KEY)
  return stored === 'ar' ? 'ar' : 'en'
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // Another tab switching language should not leave this one half-translated.
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

/**
 * The server snapshot is always English, and it must be a stable reference.
 *
 * `localStorage` does not exist during SSR, so the server cannot know the locale — the pre-paint
 * script below is what corrects the document before anything is painted. Returning a fresh value
 * here would make `useSyncExternalStore` loop.
 */
const SERVER_SNAPSHOT: Locale = 'en'
const serverSnapshot = () => SERVER_SNAPSHOT

export function useLocale(): {
  locale: Locale
  setLocale: (next: Locale) => void
  isRTL: boolean
  t: (key: StringKey, vars?: Record<string, string | number>) => string
} {
  const locale = useSyncExternalStore(subscribe, read, serverSnapshot)

  const setLocale = useCallback((next: Locale) => {
    window.localStorage.setItem(KEY, next)
    applyToDocument(next)
    for (const listener of listeners) listener()
  }, [])

  const t = useCallback(
    (key: StringKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  )

  return { locale, setLocale, isRTL: isRTL(locale), t }
}

/** `dir` and `lang` live on `<html>`, which no React tree inside `<body>` can reach. */
export function applyToDocument(locale: Locale): void {
  document.documentElement.setAttribute('dir', direction(locale))
  document.documentElement.setAttribute('lang', locale)
}

/**
 * Runs in `<head>` before paint, inlined as a string.
 *
 * The same slot and the same reasoning as the `.no-js` script already there: the alternative is
 * rendering the whole dashboard left-to-right and then flipping it once React hydrates, which is
 * a full-page reflow the user watches happen.
 *
 * Deliberately tiny and defensive — it runs before anything else and a throw here would take the
 * page with it. `localStorage` throws outright in Safari's private mode.
 */
export const LOCALE_SCRIPT = `try{var l=localStorage.getItem('${KEY}')==='ar'?'ar':'en';var d=document.documentElement;d.setAttribute('dir',l==='ar'?'rtl':'ltr');d.setAttribute('lang',l)}catch(e){}`
