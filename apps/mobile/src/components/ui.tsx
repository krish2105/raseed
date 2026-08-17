import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'

import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme, useThemePreference } from '@/theme'

/**
 * The shared surface vocabulary, in the redesigned idiom.
 *
 * Thirteen screens each carried their own `styles(c)` block with its own card, its own pill and
 * its own idea of a radius. That was survivable while every screen was built once; it is not
 * survivable through a redesign, where the same edit has to land thirteen times and will not.
 *
 * The colour law is the web's: **accent is chrome, temperature is money.** Nothing in this file
 * ever paints an amount — a `Badge` is green because it is a control, and a figure is brass or
 * verdigris because it is a figure.
 */

export function Card({
  children,
  style,
}: {
  children: ReactNode
  style?: ViewStyle | ViewStyle[]
}) {
  const { colors } = useTheme()
  const s = styles(colors)
  return <View style={[s.card, style]}>{children}</View>
}

export function Badge({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'warn' }) {
  const { colors } = useTheme()
  const s = styles(colors)
  const colour = tone === 'warn' ? colors.warn : colors.accent
  return (
    <View style={[s.badge, { borderColor: `${colour}55`, backgroundColor: `${colour}1F` }]}>
      <View style={[s.badgeDot, { backgroundColor: colour }]} />
      <Text style={[s.badgeText, { color: colour }]}>{children}</Text>
    </View>
  )
}

/** The one action a screen is for. There is at most one of these visible at a time. */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  accessibilityLabel,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  accessibilityLabel?: string
}) {
  const { colors } = useTheme()
  const s = styles(colors)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.primary, pressed && s.pressed, disabled && s.disabled]}
    >
      <Text style={s.primaryText}>{label}</Text>
    </Pressable>
  )
}

/** A quiet control that sits beside the primary one. */
export function SecondaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  const { colors } = useTheme()
  const s = styles(colors)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.secondary, pressed && s.pressed, disabled && s.disabled]}
    >
      <Text style={s.secondaryText}>{label}</Text>
    </Pressable>
  )
}

/**
 * Appearance: system, light, dark.
 *
 * Three options rather than a switch, because "follow the system" is a real answer and a
 * two-state toggle cannot express it — it forces a choice the phone has usually already made.
 */
export function ThemeChoice() {
  const { colors } = useTheme()
  const s = styles(colors)
  const { preference, setPreference } = useThemePreference()

  const options = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ] as const

  return (
    <View style={s.segmented} accessibilityRole="radiogroup" accessibilityLabel="Appearance">
      {options.map((option) => {
        const active = preference === option.value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => setPreference(option.value)}
            style={[s.segment, active && { backgroundColor: `${colors.accent}1F` }]}
          >
            <Text style={[s.segmentText, active && { color: colors.accent }]}>{option.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = (c: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.xl,
      padding: space[4],
    },

    badge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.full,
      paddingHorizontal: space[3],
      paddingVertical: space[1] + 2,
    },
    badgeDot: { width: 5, height: 5, borderRadius: radius.full },
    badgeText: { fontFamily: font.bodyMedium, fontSize: 12 },

    primary: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
      borderRadius: radius.lg,
      paddingVertical: space[4],
      paddingHorizontal: space[5],
    },
    primaryText: { color: c['accent-ink'], fontFamily: font.bodyMedium, fontSize: 15 },

    secondary: {
      alignItems: 'center',
      justifyContent: 'center',
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.lg,
      paddingVertical: space[4],
      paddingHorizontal: space[5],
    },
    secondaryText: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 15 },

    // Opacity only — `transform` and `opacity` are the two properties the design rules allow,
    // and a scale on a full-width button reads as a wobble rather than as feedback.
    pressed: { opacity: 0.85 },
    disabled: { opacity: 0.45 },

    segmented: {
      flexDirection: 'row',
      gap: space[1],
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.lg,
      padding: space[1],
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      borderRadius: radius.md,
      paddingVertical: space[2],
    },
    segmentText: { color: c['text-lo'], fontFamily: font.bodyMedium, fontSize: 13 },
  })
