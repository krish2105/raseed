import { useCallback, useSyncExternalStore } from 'react'
import { I18nManager } from 'react-native'
import * as SecureStore from 'expo-secure-store'

import { isRTL, t as translate, type Locale, type StringKey } from '@raseed/i18n'

/**
 * The app's language, and the one genuinely awkward thing about RTL on React Native.
 *
 * **`I18nManager.forceRTL` does not take effect until the app restarts.** Layout direction is
 * read once when the native view hierarchy is created; flipping it at runtime leaves you with a
 * half-mirrored interface, which is worse than either direction. Every RTL app on this platform
 * has this constraint and every one of them handles it by asking for a restart — so this stores
 * the preference, applies the direction on the *next* launch, and the settings row says so
 * rather than appearing to do nothing.
 *
 * The alternative — mirroring every layout by hand with `flexDirection` conditionals — is how
 * you end up with an app that is 90% mirrored and wrong in the 10% nobody tested.
 */

const KEY = 'raseed.locale'

let locale: Locale = 'en'
let hydrated = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!hydrated) {
    hydrated = true
    try {
      const stored = SecureStore.getItem(KEY)
      if (stored === 'en' || stored === 'ar') {
        locale = stored
        emit()
      }
    } catch {
      // Unreadable preference resolves to English, which is the safe direction: the tone gate
      // has English rules and English copy, so a failure lands on the reviewed pairing.
    }
  }
  return () => listeners.delete(listener)
}

const snapshot = () => locale

/** Call once, before the first render, so the native side is configured for this launch. */
export function applyDirectionAtStartup(): void {
  let stored: Locale = 'en'
  try {
    const value = SecureStore.getItem(KEY)
    if (value === 'en' || value === 'ar') stored = value
  } catch {
    // Same reasoning as above.
  }
  locale = stored
  hydrated = true

  const wantRTL = isRTL(stored)
  // `allowRTL` must be on for `forceRTL` to mean anything, and both are no-ops if the value is
  // already correct — so this is safe to call on every launch.
  I18nManager.allowRTL(wantRTL)
  I18nManager.forceRTL(wantRTL)
}

export function useLocale(): {
  locale: Locale
  /** True when the stored choice needs a restart to take effect on layout. */
  restartNeeded: boolean
  setLocale: (next: Locale) => void
  t: (key: StringKey, vars?: Record<string, string | number>) => string
} {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot)

  const setLocale = useCallback((next: Locale) => {
    locale = next
    emit()
    try {
      SecureStore.setItem(KEY, next)
    } catch {
      // The UI has moved; a failed write reverts on next launch, which is visible.
    }
  }, [])

  const t = useCallback(
    (key: StringKey, vars?: Record<string, string | number>) => translate(current, key, vars),
    [current],
  )

  return {
    locale: current,
    // The strings swap immediately; the *direction* does not. Comparing what the native side
    // is doing against what the preference says is the only honest way to know.
    restartNeeded: I18nManager.isRTL !== isRTL(current),
    setLocale,
    t,
  }
}
