import { useEffect, useState } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'

import { radius, space, type Palette } from '@raseed/tokens'
import { font, useTheme } from '@/theme'
import { appLockEnabled, setAppLock } from './AppLock'

/**
 * The one setting that exists so far.
 *
 * `setAppLock` returns what the preference ended up as, not what was asked for: a device with
 * no enrolled biometric refuses rather than storing a preference it cannot honour, which would
 * otherwise leave the app locked behind a prompt that never appears.
 */
export function AppLockToggle() {
  const { colors } = useTheme()
  const s = styles(colors)
  const [on, setOn] = useState(false)
  const [refused, setRefused] = useState(false)

  useEffect(() => {
    let alive = true
    void appLockEnabled().then((v) => alive && setOn(v))
    return () => {
      alive = false
    }
  }, [])

  return (
    <View style={s.card}>
      <View style={s.row}>
        <View style={s.text}>
          <Text style={s.name}>Lock with Face ID</Text>
          <Text style={s.meta}>
            After five minutes away. The app switcher is covered either way.
          </Text>
        </View>
        <Switch
          value={on}
          onValueChange={async (next) => {
            const actual = await setAppLock(next)
            setOn(actual)
            setRefused(next && !actual)
          }}
          accessibilityLabel="Lock with Face ID"
        />
      </View>
      {refused && (
        <Text style={s.warn}>
          No biometric is enrolled on this device, so the lock would have no way to open. Set up
          Face ID first.
        </Text>
      )}
    </View>
  )
}

const styles = (c: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      marginTop: space[4],
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    text: { flex: 1 },
    name: { color: c['text-hi'], fontFamily: font.body, fontSize: 15 },
    meta: { color: c['text-lo'], fontFamily: font.body, fontSize: 12, marginTop: 2 },
    warn: { color: c.warn, fontFamily: font.body, fontSize: 12, marginTop: space[2] },
  })
