import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View, type AppStateStatus } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'

import { radius, space, type Palette } from '@raseed/tokens'
import { font, useTheme } from '@/theme'

/**
 * Two different protections that are easy to confuse, both handled here.
 *
 * **The shield** covers the screen the instant the app stops being active — before iOS takes
 * its app-switcher snapshot. Without it, your balance sits in the multitasking carousel for
 * anyone who picks up the phone, and it is in that screenshot whether or not the app is
 * locked. This is not a security boundary; it is a curtain, and it has to be instant, which is
 * why it is plain state and not an animation.
 *
 * **The lock** demands Face ID after the app has been away longer than the timeout. That is a
 * boundary, and it is deliberately *not* instant — re-authenticating every time you glance at
 * a notification trains people to disable it, which protects nothing.
 *
 * `RASEED_SECURITY_ARCHITECTURE.md` G9 and G10. The doc also specifies SQLCipher for the local
 * database, which is **not** done: op-sqlite is unencrypted here, so this protects the screen
 * rather than the file. Said plainly rather than implied by the presence of a lock screen.
 */

const KEY = 'raseed.applock.enabled'
/** Long enough that checking a message does not re-prompt; short enough to matter. */
const TIMEOUT_MS = 5 * 60_000

export function AppLock({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme()
  const s = styles(colors)

  const [enabled, setEnabled] = useState(false)
  const [locked, setLocked] = useState(false)
  const [shielded, setShielded] = useState(false)
  const [failed, setFailed] = useState(false)
  const leftAt = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [stored, hardware] = await Promise.all([
        SecureStore.getItemAsync(KEY).catch(() => null),
        LocalAuthentication.hasHardwareAsync().catch(() => false),
      ])
      const enrolled = hardware ? await LocalAuthentication.isEnrolledAsync().catch(() => false) : false
      if (!alive) return
      // Only honour the preference if the device can actually satisfy it. Locking behind a
      // biometric that does not exist would brick the app with no way back in.
      setEnabled(stored === '1' && hardware && enrolled)
    })()
    return () => {
      alive = false
    }
  }, [])

  const authenticate = useCallback(async () => {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock RASEED',
      // No passcode fallback for now: the device passcode is a weaker gate than Face ID and
      // this data is already only as safe as the unencrypted SQLite file underneath it.
      disableDeviceFallback: false,
    })
    setFailed(!res.success)
    if (res.success) setLocked(false)
  }, [])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      // The shield goes up on *inactive*, not background. iOS takes the switcher snapshot
      // during the inactive transition, so waiting for background is already too late.
      setShielded(state !== 'active')

      if (state === 'active') {
        const away = leftAt.current === null ? 0 : Date.now() - leftAt.current
        leftAt.current = null
        if (enabled && away > TIMEOUT_MS) {
          setLocked(true)
          // Prompt from here rather than from an effect watching `locked`. An effect that
          // sets state is a cascading render, and this is the moment the decision is made
          // anyway — the button below is the retry path, not the only path.
          void authenticate()
        }
      } else if (leftAt.current === null) {
        leftAt.current = Date.now()
      }
    })
    return () => sub.remove()
  }, [enabled, authenticate])

  return (
    <View style={s.root}>
      {children}

      {/* Order matters: the lock sits above the shield, so an unlock prompt is never hidden
          behind the curtain that went up when the system dialog stole focus. */}
      {shielded && !locked && (
        <View style={s.shield} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={s.shieldMark}>RASEED</Text>
        </View>
      )}

      {locked && (
        <View style={s.lock}>
          <Text style={s.lockTitle}>Locked</Text>
          <Text style={s.lockBody}>
            {failed
              ? 'That did not unlock it. Try again — your data is still on the device.'
              : 'Unlock to see your ledger.'}
          </Text>
          <Pressable onPress={authenticate} accessibilityRole="button" style={s.lockButton}>
            <Text style={s.lockButtonText}>Unlock</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

/** Turn the lock on or off. Returns what it ended up as, which is not always what was asked. */
export async function setAppLock(on: boolean): Promise<boolean> {
  if (on) {
    const hardware = await LocalAuthentication.hasHardwareAsync().catch(() => false)
    const enrolled = hardware ? await LocalAuthentication.isEnrolledAsync().catch(() => false) : false
    // Refuse rather than store a preference the device cannot honour.
    if (!hardware || !enrolled) return false
  }
  await SecureStore.setItemAsync(KEY, on ? '1' : '0')
  return on
}

export async function appLockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY).catch(() => null)) === '1'
}

const styles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1 },
    shield: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c['surface-0'],
      alignItems: 'center',
      justifyContent: 'center',
    },
    shieldMark: {
      color: c['text-lo'],
      fontFamily: font.displayBold,
      fontSize: 20,
      letterSpacing: 2,
    },
    lock: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c['surface-0'],
      alignItems: 'center',
      justifyContent: 'center',
      padding: space[6],
      gap: space[3],
    },
    lockTitle: { color: c['text-hi'], fontFamily: font.displayBold, fontSize: 26 },
    lockBody: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    lockButton: {
      marginTop: space[3],
      backgroundColor: c.inr,
      borderRadius: radius.md,
      paddingHorizontal: space[6],
      paddingVertical: space[3],
    },
    lockButtonText: { color: c['surface-0'], fontFamily: font.bodyMedium, fontSize: 15 },
  })
