import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'

import { radius, type Palette } from '@raseed/tokens'
import { useTheme } from '@/theme'

/**
 * Liquid Glass, with a fallback that is not an afterthought.
 *
 * Apple requires full Liquid Glass adoption by September 2026 and removes the opt-out in
 * iOS 27, so this is not decoration — it is the platform's design language, and an app that
 * ignores it will look like it stopped being maintained.
 *
 * Three reasons the guard exists rather than rendering `GlassView` directly:
 *
 * 1. The API is iOS 26+, and this app supports earlier.
 * 2. `isLiquidGlassAvailable()` is a **runtime** check, not a version check. Some iOS 26
 *    betas ship without the API, and calling into it there crashes rather than degrades.
 * 3. Reduced transparency is an accessibility setting people turn on because translucency
 *    makes text hard to read for them. Honouring the platform look at the cost of that is
 *    the wrong trade every time.
 *
 * The fallback is a solid surface with a hairline border — plainer, equally legible, and
 * never a translucent panel with nothing behind it.
 *
 * **The radius is `xl` because `ui.Card`'s is, and the two render side by side.** They
 * disagreed until now — glass at 14, `Card` at 20 — and six screens draw both, so the seam
 * was visible on every one of them without ever being wrong enough to look like a bug. Every
 * `<Glass>` in the app is a card or a hero; none is a pill or a chip, so there is nothing that
 * wanted the tighter corner. A caller who needs a different one still passes `style`.
 */
export function Glass({
  style,
  tint,
  children,
}: {
  style?: StyleProp<ViewStyle>
  /** Optional wash. Use the currency accent so glass carries the same temperature language. */
  tint?: string
  children?: React.ReactNode
}) {
  const { colors } = useTheme()
  const s = styles(colors)

  if (!isLiquidGlassAvailable()) {
    return <View style={[s.fallback, style]}>{children}</View>
  }

  return (
    <GlassView
      style={[s.glass, style]}
      glassEffectStyle="regular"
      // The tint defaults to the app's own surface, and that default is load-bearing.
      //
      // An untinted `GlassView` renders as a DARK material even in a light app. Combined
      // with the dark ink this app uses on light surfaces, that put grey text on a grey
      // slab — unreadable, and shipped on the first screen that forgot to pass a tint.
      // Defaulting here means no future caller can reproduce it by omission.
      tintColor={tint ?? colors['surface-1']}
    >
      {children}
    </GlassView>
  )
}

const styles = (c: Palette) =>
  StyleSheet.create({
    glass: {
      borderRadius: radius.xl,
      overflow: 'hidden',
    },
    fallback: {
      borderRadius: radius.xl,
      overflow: 'hidden',
      backgroundColor: c['surface-1'],
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
    },
  })
