import type { ReactNode } from 'react'
import {
  I18nManager,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native'

import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme, useThemePreference } from '@/theme'
import { useLocale } from '@/lib/locale'

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

/**
 * The one action a screen is for. There is at most one of these visible at a time.
 *
 * `style` exists because its absence is what kept screens off these primitives. A button that
 * cannot be given a width, a flex or a margin is unusable in a row of two, so every screen
 * that needed one hand-rolled the whole thing — and then owned its colours, its radius and its
 * pressed state for ever. The escape hatch is cheaper than the duplication it prevents.
 *
 * `children` is for a leading glyph. The label stays a `string` rather than becoming a node,
 * because `accessibilityLabel` has to default to something readable and a node has no text.
 */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  accessibilityLabel,
  style,
  children,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  accessibilityLabel?: string
  style?: ViewStyle | ViewStyle[]
  children?: ReactNode
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
      style={({ pressed }) => [s.primary, style, pressed && s.pressed, disabled && s.disabled]}
    >
      {children}
      <Text style={s.primaryText}>{label}</Text>
    </Pressable>
  )
}

/** A quiet control that sits beside the primary one. */
export function SecondaryButton({
  label,
  onPress,
  disabled = false,
  tone = 'neutral',
  style,
  children,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  /** `danger` outlines and inks in `warn` — for delete, purge, and "erase everything". */
  tone?: 'neutral' | 'danger'
  style?: ViewStyle | ViewStyle[]
  children?: ReactNode
}) {
  const { colors } = useTheme()
  const s = styles(colors)
  const danger = tone === 'danger'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.secondary,
        danger && { borderColor: colors.warn },
        style,
        pressed && s.pressed,
        disabled && s.disabled,
      ]}
    >
      {children}
      <Text style={[s.secondaryText, danger && { color: colors.warn }]}>{label}</Text>
    </Pressable>
  )
}

/**
 * A selectable chip. **The single most duplicated control in the app.**
 *
 * The identical `chip` / `chipActive` / `chipText` / `chipTextActive` block was written out
 * verbatim in `add`, `edit`, `trip` and `import`, with near-variants in eight more screens —
 * twelve files, one control. `Badge` never covered it: a badge is static and carries a dot,
 * a chip is pressed and carries a selected state.
 *
 * `selected` drives `accessibilityState`, not just the fill. A chip whose only cue is colour
 * tells VoiceOver nothing, and this is a control people use to pick a category for money.
 *
 * **`role` is a prop because the screens were already right and a primitive must not flatten
 * them.** `add` marks its people chips `checkbox`/`checked` because you pick several, and its
 * category chips `radio`/`selected` because you pick one. Those are different promises to a
 * screen reader, and a shared component that collapsed both into `button` would have made the
 * app less accessible while looking like a cleanup. Note the state key changes with the role —
 * `checked` for a checkbox, `selected` for a radio — which is the part that is easy to get
 * wrong by hand and is now impossible to get wrong at the call site.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  role = 'button',
  tone = 'accent',
}: {
  label: string
  selected?: boolean
  onPress: () => void
  role?: 'button' | 'radio' | 'checkbox'
  tone?: 'accent' | 'warn'
}) {
  const { colors } = useTheme()
  const s = styles(colors)
  const colour = tone === 'warn' ? colors.warn : colors.accent
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'checkbox' ? { checked: selected } : { selected }}
      onPress={onPress}
      style={({ pressed }) => [
        s.chip,
        selected && { borderColor: `${colour}55`, backgroundColor: `${colour}1F` },
        pressed && s.pressed,
      ]}
    >
      <Text style={[s.chipText, selected && { color: colour }]}>{label}</Text>
    </Pressable>
  )
}

/**
 * A card that holds hairline-separated rows.
 *
 * This is the structural reason task #21 stalled. Five screens needed a card whose padding is
 * horizontal-only, so a row separator can span the full width instead of floating inside a
 * uniform inset — and `Card`'s `padding: space[4]` cannot express that. So five screens kept
 * their own container rather than adopt the primitive, and the duplication looked like
 * laziness when it was actually a missing variant.
 *
 * `Row` owns the separator, and suppresses it on the first child. Putting that rule in the row
 * rather than the list is what lets a caller map over data without tracking an index.
 */
export function RowList({ children, style }: { children: ReactNode; style?: ViewStyle | ViewStyle[] }) {
  const { colors } = useTheme()
  const s = styles(colors)
  return <View style={[s.rowList, style]}>{children}</View>
}

export function Row({ children, first = false }: { children: ReactNode; first?: boolean }) {
  const { colors } = useTheme()
  const s = styles(colors)
  return <View style={[s.row, first && s.rowFirst]}>{children}</View>
}

/**
 * A low-emphasis text action.
 *
 * Underlined and inline rather than a button, for the "show me the numbers" class of link that
 * should not compete with the one action a screen is for. Written three separate times as
 * `disclosure`, `inline` and `tertiary` before it was one thing.
 */
export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme()
  const s = styles(colors)
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && s.pressed}>
      <Text style={s.link}>{label}</Text>
    </Pressable>
  )
}

/**
 * A navigation row: title, hint, chevron.
 *
 * Written out seven times verbatim in the You screen and nowhere else — the highest line-count
 * duplication in the app. Not a `Card`, despite looking like one: a card is a container you put
 * things in, and this is a control you press.
 *
 * The chevron is `‹` under RTL. It points the way the stack pushes, and the stack pushes the
 * other way in Arabic — a `›` in a mirrored layout points back at the screen you came from,
 * which is the one thing a chevron must never do. `I18nManager.isRTL` rather than the locale,
 * because the native layout direction is what actually got applied at launch.
 */
export function NavRow({
  title,
  hint,
  onPress,
  style,
}: {
  title: string
  hint?: string
  onPress?: () => void
  style?: ViewStyle | ViewStyle[]
}) {
  const { colors } = useTheme()
  const s = styles(colors)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ? `${title}. ${hint}` : title}
      onPress={onPress}
      style={({ pressed }) => [s.navRow, style, pressed && s.pressed]}
    >
      <View style={s.navText}>
        <Text style={s.navTitle}>{title}</Text>
        {hint ? <Text style={s.navHint}>{hint}</Text> : null}
      </View>
      <Text style={s.navChevron}>{I18nManager.isRTL ? '‹' : '›'}</Text>
    </Pressable>
  )
}

/**
 * One line of the ledger: a category dot, the merchant, and the amount.
 *
 * Written three separate times — in `ledger`, on the home screen and in `you` — with the same
 * six style keys and three different sets of typos waiting to happen. The amount is `monoMedium`
 * and tabular and pinned LTR, which is the combination every figure in this app needs and the
 * one most likely to be forgotten when the row is copied a fourth time.
 */
export function LedgerRow({
  name,
  meta,
  amount,
  dotColor,
  onPress,
}: {
  name: string
  meta?: string
  /** Pre-formatted by `@raseed/money`. This component never does arithmetic. */
  amount: string
  dotColor: string
  onPress?: () => void
}) {
  const { colors } = useTheme()
  const s = styles(colors)
  const body = (
    <>
      <View style={s.ledgerLeft}>
        <View style={[s.ledgerDot, { backgroundColor: dotColor }]} />
        <View style={s.ledgerText}>
          <Text style={s.ledgerName}>{name}</Text>
          {meta ? <Text style={s.ledgerMeta}>{meta}</Text> : null}
        </View>
      </View>
      <Text style={s.ledgerAmount}>{amount}</Text>
    </>
  )
  if (!onPress) return <View style={s.ledgerRow}>{body}</View>
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${amount}`}
      onPress={onPress}
      style={({ pressed }) => [s.ledgerRow, pressed && s.pressed]}
    >
      {body}
    </Pressable>
  )
}

/**
 * A labelled text input.
 *
 * The same four declarations — surface, hairline, `radius.md`, `space[3]` — appeared in `add`,
 * `edit`, `goals` and `trip`, with near-variants in three more. The label is part of the
 * component rather than a sibling `<Text>` because that is what made them drift: a screen that
 * has to place its own label is a screen that can forget `accessibilityLabel`, and four of them
 * had.
 */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  accessibilityLabel,
  style,
}: {
  label: string
  value: string
  onChangeText: (next: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad'
  /**
   * Overrides the visible label for screen readers, and several screens need it: the label
   * reads "Amount (₹)" because the column is narrow, while the spoken one is "Target amount in
   * rupees". Defaulting to `label` and offering no override would have quietly replaced the
   * better string with the shorter one on every field that had bothered.
   */
  accessibilityLabel?: string
  style?: TextStyle | TextStyle[]
}) {
  const { colors } = useTheme()
  const s = styles(colors)
  return (
    <View>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.field, style]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors['text-lo']}
        keyboardType={keyboardType}
        accessibilityLabel={accessibilityLabel ?? label}
      />
    </View>
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
  const { t } = useLocale()

  const options = [
    { value: 'system', label: t('you.system') },
    { value: 'light', label: t('you.light') },
    { value: 'dark', label: t('you.dark') },
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

/**
 * Language.
 *
 * The strings swap at once; the *layout direction* does not, because React Native reads it when
 * the native views are created. Rather than pretend otherwise, the row says a restart is needed
 * — a control that appears to do nothing is worse than one that explains itself.
 */
export function LanguageChoice() {
  const { colors } = useTheme()
  const s = styles(colors)
  const { locale, setLocale, restartNeeded } = useLocale()

  const options = [
    { value: 'en', label: 'English' },
    { value: 'ar', label: 'العربية' },
  ] as const

  return (
    <View>
      <View style={s.segmented} accessibilityRole="radiogroup" accessibilityLabel="Language">
        {options.map((option) => {
          const active = locale === option.value
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => setLocale(option.value)}
              style={[s.segment, active && { backgroundColor: `${colors.accent}1F` }]}
            >
              <Text style={[s.segmentText, active && { color: colors.accent }]}>
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {restartNeeded && (
        <Text style={s.restart}>
          Reopen the app to mirror the layout. The words have changed already; the direction is
          set when the app starts.
        </Text>
      )}
      {locale === 'ar' && (
        <Text style={s.restart}>
          Arabic is machine-translated and has not been reviewed by a native speaker. Two thirds
          of the interface is translated; the rest stays in English rather than guessing.
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[2],
      backgroundColor: c.accent,
      borderRadius: radius.lg,
      paddingVertical: space[4],
      paddingHorizontal: space[5],
    },
    primaryText: { color: c['accent-ink'], fontFamily: font.bodyMedium, fontSize: 15 },

    secondary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[2],
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
    chip: {
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.full,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
    },
    chipText: { color: c['text-lo'], fontFamily: font.bodyMedium, fontSize: 13 },

    // Horizontal padding only — the separator on `row` has to reach both edges.
    rowList: {
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.xl,
      paddingHorizontal: space[4],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopColor: c.line,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingVertical: space[3],
    },
    rowFirst: { borderTopWidth: 0 },

    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.xl,
      padding: space[4],
    },
    navText: { flex: 1 },
    navTitle: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 15 },
    navHint: { color: c['text-lo'], fontFamily: font.body, fontSize: 12, marginTop: 2 },
    navChevron: { color: c['text-lo'], fontFamily: font.body, fontSize: 22 },

    ledgerRow: {
      // `flex: 1` because this is usually the only child of a `Row`, which is itself
      // `space-between`. Without it the row sizes to its content and sits at the start, and the
      // amount floats in the middle of the card instead of reaching the far edge. Caught on the
      // device — every unit in the app was green.
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space[3],
      paddingVertical: space[3],
    },
    ledgerLeft: { flexDirection: 'row', alignItems: 'center', gap: space[3], flexShrink: 1 },
    ledgerDot: { width: 6, height: 6, borderRadius: radius.full },
    ledgerText: { flexShrink: 1 },
    ledgerName: { color: c['text-hi'], fontFamily: font.body, fontSize: 15 },
    ledgerMeta: { color: c['text-lo'], fontFamily: font.body, fontSize: 12, marginTop: 1 },
    ledgerAmount: {
      color: c['text-hi'],
      fontFamily: font.monoMedium,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
      writingDirection: 'ltr',
    },

    fieldLabel: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 12,
      marginBottom: space[2],
    },
    field: {
      color: c['text-hi'],
      fontFamily: font.body,
      fontSize: 16,
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.md,
      paddingHorizontal: space[3],
      paddingVertical: space[3],
    },

    link: {
      color: c['text-hi'],
      fontFamily: font.body,
      fontSize: 13,
      textDecorationLine: 'underline',
    },

    segmentText: { color: c['text-lo'], fontFamily: font.bodyMedium, fontSize: 13 },
    restart: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 11,
      lineHeight: 17,
      marginTop: space[2],
    },
  })
