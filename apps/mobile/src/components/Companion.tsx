import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { narrate, supportiveMode, type Fact } from '@raseed/engines'
import { format, type Money } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { lifestyleGranted } from '@/lib/consent'
import { Glass } from './Glass'

/**
 * The companion — the words-first half of the home screen.
 *
 * The home screen leads with a sentence about where you stand, and the numbers sit one tap
 * below rather than being removed. A glanceable figure answers "how much"; a sentence
 * answers "should I care", and on a phone in a queue the second question is the one being
 * asked.
 *
 * **At most one observation.** Not the top three. Three observations on a screen is none —
 * the reader skims all of them and acts on none, and the app has spent its entire welcome
 * in a single visit.
 *
 * Every sentence here is produced by a template from computed figures and then passed
 * through the tone engine, which fails closed. Nothing reaches this component that has not
 * been checked for shame, diagnosis, body references, regulated advice, missing agency,
 * missing specificity and the hour of the day.
 */
export function Companion({
  greeting,
  amount,
  daysToIncome,
  spentToday,
  facts,
  hour,
  signals,
}: {
  greeting: string
  amount: Money
  daysToIncome: number
  spentToday: Money
  facts: readonly Fact[]
  /** Passed in. No component reads a clock during render. */
  hour: number
  signals: {
    roomMinor: number
    spendMinor: number
    incomeMinor: number
    consecutiveNegativeDays: number
  }
}) {
  const { colors } = useTheme()
  const s = styles(colors)
  const [dismissed, setDismissed] = useState<string | null>(null)

  const supportive = supportiveMode(signals)
  // The recorded consent, not a literal. `lifestyleMaySpeak()` in the tone engine refuses
  // without it, and supportive mode suspends the layer regardless of what was granted.
  const { message } = narrate(facts, {
    hour,
    supportiveMode: supportive,
    lifestyleOptIn: lifestyleGranted(),
  })

  const shown = message && message.theme !== dismissed ? message : null

  return (
    <View style={s.wrap}>
      <Text style={s.greeting}>{greeting}</Text>

      {/* The lead sentence. Deliberately a sentence and not a figure: this is the line that
          decides whether the rest of the screen gets read. */}
      <Text style={s.lead}>
        You&apos;ve got{' '}
        <Text style={[s.leadAmount, supportive && { color: colors.warn }]}>
          {format(amount, { compactZeroFraction: true })}
        </Text>{' '}
        for today, and {daysToIncome} days until money comes in.
        {spentToday.minor > 0 && ` So far today: ${format(spentToday)}.`}
      </Text>

      {supportive && (
        // Stabilising, not instructive. No targets, no "save more", no comparison.
        <Text style={s.steady}>
          It&apos;s a tight stretch. Let&apos;s just get through the month — the numbers are
          below whenever you want them.
        </Text>
      )}

      {shown && (
        <Glass style={s.card} tint={colors['surface-2']}>
          <View style={s.cardInner}>
            <Text style={s.cardText}>{shown.text}</Text>

            <View style={s.choices}>
              {shown.choices.map((choice) => (
                <Pressable
                  key={choice}
                  accessibilityRole="button"
                  onPress={() => {
                    // "Not now" and "Don't show me this kind" both actually work. A
                    // dismissal that does nothing is worse than none, because it teaches
                    // the reader the control is decorative.
                    if (choice !== 'Show me') setDismissed(shown.theme)
                  }}
                  style={[s.choice, choice === 'Show me' && s.choicePrimary]}
                >
                  <Text style={[s.choiceText, choice === 'Show me' && s.choiceTextPrimary]}>
                    {choice}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Glass>
      )}
    </View>
  )
}

const styles = (c: Palette) =>
  StyleSheet.create({
    wrap: { gap: space[3] },
    greeting: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 13,
      letterSpacing: 0.14 * 13,
      textTransform: 'uppercase',
    },
    lead: {
      color: c['text-hi'],
      fontFamily: font.body,
      fontSize: 20,
      lineHeight: 30,
    },
    leadAmount: {
      color: c.inr,
      fontFamily: font.displayBold,
    },
    steady: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 14,
      lineHeight: 22,
    },
    card: { marginTop: space[1] },
    cardInner: { padding: space[4], gap: space[3] },
    cardText: {
      color: c['text-hi'],
      fontFamily: font.body,
      fontSize: 15,
      lineHeight: 24,
    },
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    choice: {
      borderRadius: radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
    },
    choicePrimary: { backgroundColor: c.accent, borderColor: c.accent },
    choiceText: { color: c['text-lo'], fontFamily: font.bodyMedium, fontSize: 13 },
    choiceTextPrimary: { color: c['accent-ink'] },
  })
