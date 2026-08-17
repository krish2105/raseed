import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useColorScheme } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { palette, type Palette, type ThemeName } from '@raseed/tokens'

/**
 * The single place the mobile app resolves colours.
 *
 * Everything comes from `@raseed/tokens`, so a hex literal never appears in a screen. The web
 * toggle and this hook read the same palette — change brass once and both products change.
 *
 * **The phone follows the system now, and that reverses an earlier decision.** It used to be
 * light-only, with a real argument behind it: the phone comes out in daylight, in a queue, for
 * four seconds, and a light surface is easier to read at arm's length outdoors. What that
 * argument got wrong is whose choice it is. Someone who runs their phone dark has usually
 * decided that deliberately — for glare, for battery, for their eyes — and an app that
 * overrides it is not being thoughtful, it is being certain about a stranger's context. The
 * override below exists for anyone the default is wrong for, in either direction.
 */

const KEY = 'raseed.theme'
type Preference = ThemeName | 'system'

/**
 * A tiny store, not React state.
 *
 * The preference is read from the keychain asynchronously and can change from a settings row on
 * a screen that is not the one rendering. Threading that through context would mean a provider
 * for a single string; `useSyncExternalStore` is the same guarantee in a third of the code, and
 * it is the pattern `db/index.ts` already established here.
 */
let preference: Preference = 'system'
let hydrated = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // First subscriber pulls the stored choice. A failed read is a real state — the keychain can
  // be unavailable — and it resolves to 'system', which is the default anyway.
  if (!hydrated) {
    hydrated = true
    SecureStore.getItemAsync(KEY)
      .then((value) => {
        if (value === 'light' || value === 'dark' || value === 'system') {
          preference = value
          emit()
        }
      })
      .catch(() => {})
  }
  return () => listeners.delete(listener)
}

const snapshot = () => preference

export function useThemePreference(): {
  preference: Preference
  setPreference: (next: Preference) => void
} {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot)
  const setPreference = useCallback((next: Preference) => {
    preference = next
    emit()
    // Fire and forget: the UI has already moved, and a keychain write that fails should not
    // undo a change the user can see. It reverts on next launch, which is visible and honest.
    void SecureStore.setItemAsync(KEY, next).catch(() => {})
  }, [])
  return { preference: current, setPreference }
}

export function useTheme(): { colors: Palette; scheme: ThemeName } {
  const system = useColorScheme()
  const { preference: choice } = useThemePreference()

  // `useColorScheme` returns null before the first native read. Falling back to light rather
  // than to dark means the very first frame is never a black flash on a light phone.
  const scheme: ThemeName = choice === 'system' ? (system === 'dark' ? 'dark' : 'light') : choice

  useEffect(() => {
    // Nothing to do — the hook re-renders on both inputs. Kept as the seam for the day the
    // status bar needs telling, which is the one thing outside React's tree.
  }, [scheme])

  return { colors: palette[scheme], scheme }
}

/** Font families, matching the names registered in _layout.tsx. */
export const font = {
  display: 'Jakarta',
  displayBold: 'JakartaBold',
  body: 'Geist',
  bodyMedium: 'GeistMedium',
  mono: 'GeistMono',
  monoMedium: 'GeistMonoMedium',
} as const
