import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'

import {
  PRICE_LEVELS,
  destinationIndex,
  planTrip,
  priceLevel,
  type Intent,
  type TravelHabits,
} from '@raseed/engines'
import { format, fromMajor, money } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { Chip } from '@/components/ui'
import { font, useTheme } from '@/theme'
import { Glass } from '@/components/Glass'
import { travelHabitsRaw, useQuery } from '@/db'

const INTENTS: readonly { key: Intent; label: string }[] = [
  { key: 'food', label: 'Eating' },
  { key: 'culture', label: 'Culture' },
  { key: 'beach', label: 'Beach' },
  { key: 'adventure', label: 'Adventure' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'family', label: 'Family' },
]

/** Where you live. Every multiplier is a ratio against here, so it has to be stated. */
const HOME = priceLevel('India')!

/**
 * What a trip would actually cost **you**.
 *
 * The premise is that a generic travel budget is worthless. "Budget ₹4,000 a day in Bangkok"
 * is written for an average traveller who does not exist; you eat out more or less than they
 * do, you take taxis or you don't. So every line here starts from a habit read out of your
 * own ledger and is scaled by a published price ratio between here and there — not from a
 * table of what trips cost.
 *
 * Two things are deliberately not hidden:
 *
 * 1. **A typical night is an input, not a result.** There is no accommodation category in
 *    the ledger, so the honest move is a field with a starting value you can change, rather
 *    than a fabricated number buried inside a total that looks derived.
 * 2. **Thin history says so.** Under two observed trips the estimate carries a warning
 *    instead of a confident total, because the alternative is precision nobody earned.
 */
export default function TripScreen() {
  /** Reads the ledger; the compiler would otherwise serve the pre-write state for ever. */
  'use no memo'

  const { colors } = useTheme()
  const s = styles(colors)

  const raw = useQuery(travelHabitsRaw)

  const [destName, setDestName] = useState('Thailand')
  const [nightsText, setNightsText] = useState('5')
  const [budgetText, setBudgetText] = useState('60000')
  const [flightsText, setFlightsText] = useState('22000')
  const [nightText, setNightText] = useState('')
  const [intents, setIntents] = useState<Intent[]>(['food'])

  const nights = Math.max(1, Math.min(60, Number(nightsText) || 1))

  // A starting value for the one habit the ledger cannot supply: a mid-range room in your
  // own country, which the destination multiplier then scales. Overwritable, and clearly
  // labelled as a number you provided.
  const nightDefaultMinor = 350000
  const nightTypicalMinor = useMemo(() => {
    const t = nightText.trim()
    if (!t) return nightDefaultMinor
    try {
      return fromMajor(t, 'INR').minor
    } catch {
      return nightDefaultMinor
    }
  }, [nightText])

  const habits: TravelHabits = {
    mealTypical: money(raw.mealTypicalMinor || 45000, 'INR'),
    nightTypical: money(nightTypicalMinor, 'INR'),
    transportDaily: money(raw.transportDailyMinor || 30000, 'INR'),
    shoppingDaily: money(raw.shoppingDailyMinor || 0, 'INR'),
    mealsPerDay: raw.mealsPerDay > 0 ? Math.min(4, raw.mealsPerDay) : 2,
    tripsObserved: raw.tripsObserved,
  }

  // Not memoised: `habits` is rebuilt every render from the query, so any dependency list
  // containing it would miss every time. `planTrip` is a few dozen multiplications on
  // integers — cheaper than the bookkeeping that would pretend to avoid it.
  const rupees = (text: string) => {
    try {
      return fromMajor(text.trim() || '0', 'INR')
    } catch {
      return money(0, 'INR')
    }
  }

  const budget = rupees(budgetText)
  const shared = {
    nights,
    intents: (intents.length > 0 ? intents : ['culture']) as readonly Intent[],
    habits,
    destination: destinationIndex(priceLevel(destName) ?? HOME, HOME),
    flights: rupees(flightsText),
  } as const

  /**
   * The plan is computed twice, and the **unconstrained** one is what gets shown.
   *
   * `planTrip` trims flexible lines to fit a budget, which is the right engine behaviour and
   * the wrong thing to put on screen unexamined. Five nights in Thailand against a budget
   * that flights and a hotel had already nearly consumed produced a food line 96% smaller
   * than any real one — rendered, in green, as "fits your budget", buying "about 0 meals".
   * A plan that has been crushed until the arithmetic closes is not a plan; it is a budget
   * with the trip removed from it.
   *
   * So: `plan` answers "what would this cost me", and the budget is a separate question
   * asked afterwards, out loud. The trimmed version is still computed, but only to report
   * what would have to give.
   */
  const plan = planTrip({ ...shared, budget: money(Number.MAX_SAFE_INTEGER, 'INR') })
  const trimmed = planTrip({ ...shared, budget })

  const gap = budget.minor - plan.total.minor
  const overBudget = gap < 0

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={s.back}>Back</Text>
        </Pressable>
        <Text style={s.title}>Plan a trip</Text>
        <View style={s.spacer} />
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.lede}>
          Built from what you actually spend, not from what a travel guide says a trip costs.
        </Text>

        <Text style={s.label}>Where</Text>
        <View style={s.chips}>
          {PRICE_LEVELS.filter((p) => p.name !== 'India').map((p) => (
            <Chip
              key={p.name}
              label={p.name}
              role="radio"
              selected={destName === p.name}
              onPress={() => setDestName(p.name)}
            />
          ))}
        </View>

        <View style={s.row}>
          <View style={s.half}>
            <Text style={s.label}>Nights</Text>
            <TextInput
              value={nightsText}
              onChangeText={setNightsText}
              keyboardType="number-pad"
              accessibilityLabel="Nights"
              style={s.input}
            />
          </View>
          <View style={s.half}>
            <Text style={s.label}>Budget (₹)</Text>
            <TextInput
              value={budgetText}
              onChangeText={setBudgetText}
              keyboardType="decimal-pad"
              accessibilityLabel="Budget in rupees"
              style={s.input}
            />
          </View>
        </View>

        <View style={s.row}>
          <View style={s.half}>
            <Text style={s.label}>Flights (₹)</Text>
            <TextInput
              value={flightsText}
              onChangeText={setFlightsText}
              keyboardType="decimal-pad"
              accessibilityLabel="Flights in rupees"
              style={s.input}
            />
          </View>
          <View style={s.half}>
            <Text style={s.label}>A night here (₹)</Text>
            <TextInput
              value={nightText}
              onChangeText={setNightText}
              placeholder="3,500"
              placeholderTextColor={colors['text-lo']}
              keyboardType="decimal-pad"
              accessibilityLabel="What a typical night costs at home, in rupees"
              style={s.input}
            />
          </View>
        </View>

        <Text style={s.label}>What kind of trip</Text>
        <View style={s.chips}>
          {INTENTS.map((i) => (
            <Chip
              key={i.key}
              label={i.label}
              role="checkbox"
              selected={intents.includes(i.key)}
              onPress={() =>
                setIntents((prev) =>
                  prev.includes(i.key) ? prev.filter((x) => x !== i.key) : [...prev, i.key],
                )
              }
            />
          ))}
        </View>

        <Glass style={s.card}>
          <View style={s.cardInner}>
            <Text style={s.cardLabel}>{destName} · {nights} nights</Text>
            <Text style={[s.total, overBudget && { color: colors.warn }]}>
              {format(plan.total)}
            </Text>
            <Text style={[s.headroom, overBudget && { color: colors.warn }]}>
              {overBudget
                ? `${format(money(-gap, 'INR'))} more than your budget`
                : `${format(money(gap, 'INR'))} under your budget`}
            </Text>

            <View style={s.lines}>
              {plan.lines.map((l) => (
                <View key={l.label} style={s.line}>
                  <Text style={s.lineLabel}>{l.label}</Text>
                  <Text style={s.lineAmount}>{format(l.amount)}</Text>
                </View>
              ))}
            </View>

            <Text style={s.meals}>
              That food line buys about {Math.round(plan.mealsAfforded)} meals out at what you
              usually pay, scaled to {destName} prices.
            </Text>
          </View>
        </Glass>

        {!plan.confident && (
          <Text style={s.warn}>
            {raw.tripsObserved === 0
              ? 'No past trips in your ledger yet, so this rests on your everyday spending rather than on how you travel. Treat it as a starting point.'
              : `Only ${raw.tripsObserved} trip on record, so these habits are thin. The shape is right; the precision is not earned yet.`}
          </Text>
        )}

        {overBudget && (
          <Text style={s.note}>
            {trimmed.mealsAfforded < nights
              ? `Fitting ${format(budget)} would leave about ${Math.round(trimmed.mealsAfforded)} meals out across ${nights} nights, which is not really this trip. Flights and stay are the fixed part — moving one of those is what actually closes the gap.`
              : `Fitting ${format(budget)} means trimming the flexible lines: eating out, activities, shopping. Flights and stay stay as they are.`}
          </Text>
        )}

        {plan.notes.map((n) => (
          <Text key={n} style={s.note}>
            {n}
          </Text>
        ))}

        <Text style={s.source}>
          Price ratios are Numbeo country indices, 2026 mid-year, against India. Countries, not
          cities — Mumbai is not Bhopal, and Dubai is not Fujairah.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c['surface-0'] },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space[5],
      paddingVertical: space[3],
      borderBottomColor: c.line,
      borderBottomWidth: 1,
    },
    back: { color: c['text-lo'], fontFamily: font.body, fontSize: 15 },
    title: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 15 },
    spacer: { width: 40 },

    content: { padding: space[5], paddingBottom: space[12] },
    lede: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: space[2],
    },

    label: {
      color: c['text-lo'],
      fontFamily: font.bodyMedium,
      fontSize: 12,
      marginTop: space[4],
      marginBottom: space[2],
    },
    row: { flexDirection: 'row', gap: space[3] },
    half: { flex: 1 },
    input: {
      color: c['text-hi'],
      fontFamily: font.mono,
      fontSize: 16,
      fontVariant: ['tabular-nums'],
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: space[3],
      paddingVertical: space[3],
    },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },

    card: { marginTop: space[5] },
    cardInner: { padding: space[5] },
    cardLabel: { color: c['text-lo'], fontFamily: font.bodyMedium, fontSize: 12 },
    total: {
      color: c['text-hi'],
      fontFamily: font.displayBold,
      fontSize: 40,
      letterSpacing: -1,
      fontVariant: ['tabular-nums'],
      marginTop: space[1],
    },
    headroom: {
      color: c.good,
      fontFamily: font.bodyMedium,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      marginTop: space[1],
    },

    lines: { marginTop: space[4], gap: space[2] },
    line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    lineLabel: { color: c['text-lo'], fontFamily: font.body, fontSize: 13 },
    lineAmount: {
      color: c['text-hi'],
      fontFamily: font.mono,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },

    meals: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 12,
      lineHeight: 18,
      marginTop: space[4],
    },
    warn: {
      color: c['text-hi'],
      fontFamily: font.body,
      fontSize: 12,
      lineHeight: 18,
      marginTop: space[4],
    },
    note: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 12,
      lineHeight: 18,
      marginTop: space[2],
    },
    source: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 11,
      lineHeight: 16,
      marginTop: space[6],
    },
  })
