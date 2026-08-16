import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'

/**
 * "Now", as a value rather than a call.
 *
 * `Date.now()` during render is impure — the React Compiler rejects it, and it is the same
 * rule `@raseed/engines` follows by taking time as a parameter. Safe-to-Spend has to
 * recompute on app foreground and at midnight anyway, which is exactly when this updates.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(() => setNow(Date.now()), [])

  // Foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => sub.remove()
  }, [refresh])

  // Midnight — one timer, re-armed each day rather than an interval that ticks all night.
  useEffect(() => {
    const DAY = 86_400_000
    const msUntilMidnight = DAY - (Date.now() % DAY)
    const timer = setTimeout(refresh, msUntilMidnight + 1000)
    return () => clearTimeout(timer)
  }, [now, refresh])

  // Returning to the tab.
  useFocusEffect(refresh)

  return now
}
