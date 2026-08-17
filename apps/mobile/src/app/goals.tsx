import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'

import { gate, savingsPlan } from '@raseed/engines'
import { format, fromMajor, money } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { PrimaryButton, Field } from '@/components/ui'
import { Glass } from '@/components/Glass'
import {
  addGoal,
  contributeToGoal,
  listGoals,
  monthlyCapacityMinor,
  notifyChanged,
  removeGoal,
  useQuery,
  type GoalRow,
} from '@/db'

const MONTH_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Targets, without the scolding.
 *
 * Goals are the feature most likely to turn an expense tracker into something that makes
 * people feel worse. The usual shape — a streak, a red bar, "you're behind" — treats a
 * shortfall as a personal failing, and the app has no idea whether this month was a wedding
 * or a hospital bill.
 *
 * So every sentence on this screen goes through `gate()`, the same safety layer the
 * companion uses, and it fails closed: if a line cannot be phrased as a fact about the
 * arithmetic, it does not appear at all. What is left is deliberately flat — "at your
 * current rate this lands in March" rather than "you're behind schedule".
 *
 * The month figure it compares against is real monthly surplus from the ledger, not a budget
 * you set in an optimistic mood. A plan that fits an imaginary capacity is not a plan.
 */
export default function GoalsScreen() {
  /** Reads the ledger; the compiler would otherwise serve the pre-write state for ever. */
  'use no memo'

  const { colors } = useTheme()
  const s = styles(colors)

  const goals = useQuery(listGoals)
  const capacity = useQuery(monthlyCapacityMinor)

  // The clock is read at the same moments the ledger is — on focus, and on any write — and
  // then threaded down as a value. Same rule the engines follow: nothing samples a clock
  // mid-render, because a component that re-renders twice would otherwise disagree with
  // itself about what "six months away" means.
  const now = useQuery(Date.now)

  const [name, setName] = useState('')
  const [amountText, setAmountText] = useState('')
  const [monthsText, setMonthsText] = useState('6')
  const [error, setError] = useState<string | null>(null)

  const capacityMoney = money(capacity.capacityMinor, 'INR')

  function create() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give it a name — "Japan", "new laptop".')
      return
    }
    let target
    try {
      target = fromMajor(amountText.trim(), 'INR')
    } catch {
      target = null
    }
    if (!target || target.minor <= 0) {
      setError('How much does it need to be?')
      return
    }
    const months = Math.max(1, Math.min(120, Number(monthsText) || 6))
    addGoal({ name: trimmed, target, targetAt: Date.now() + months * MONTH_MS })
    setName('')
    setAmountText('')
    setError(null)
    notifyChanged()
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={s.back}>Back</Text>
        </Pressable>
        <Text style={s.title}>Goals</Text>
        <View style={s.spacer} />
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.lede}>
          {capacity.months === 0
            ? 'Once there are a few months of history, these get measured against what is actually left over each month.'
            : capacity.capacityMinor === 0
              ? `Across ${capacity.months} ${capacity.months === 1 ? 'month' : 'months'} on record, nothing has been left over at the end of the month. Goals still work; there is just no monthly rate to measure them against yet.`
              : `Measured against ${format(capacityMoney)} a month — what was actually left over across ${capacity.months} ${capacity.months === 1 ? 'month' : 'months'} on record, not a budget.`}
        </Text>

        {goals.length === 0 && (
          <Text style={s.empty}>Nothing set aside for yet.</Text>
        )}

        {goals.map((g) => (
          <GoalCard key={g.id} goal={g} capacityMinor={capacity.capacityMinor} now={now} />
        ))}

        <Text style={s.label}>New goal</Text>
        <TextInput
          value={name}
          onChangeText={(t) => {
            setName(t)
            setError(null)
          }}
          placeholder="Japan, a new laptop, the deposit…"
          placeholderTextColor={colors['text-lo']}
          accessibilityLabel="Goal name"
          style={s.input}
        />

        <View style={s.row}>
          <View style={s.half}>
            <Field
              label="Amount (₹)"
              accessibilityLabel="Target amount in rupees"
              value={amountText}
              onChangeText={(t) => {
                setAmountText(t)
                setError(null)
              }}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={s.half}>
            <Field
              label="Months"
              accessibilityLabel="Months from now"
              value={monthsText}
              onChangeText={setMonthsText}
              keyboardType="number-pad"
            />
          </View>
        </View>

        {error && <Text style={s.error}>{error}</Text>}

        <PrimaryButton label="Add goal" onPress={create} style={s.primarySpacing} />
      </ScrollView>
    </SafeAreaView>
  )
}

function GoalCard({
  goal,
  capacityMinor,
  now,
}: {
  goal: GoalRow
  capacityMinor: number
  now: number
}) {
  'use no memo'

  const { colors } = useTheme()
  const s = styles(colors)

  const monthsAway = goal.targetAt
    ? Math.max(1, Math.round((goal.targetAt - now) / MONTH_MS))
    : 12

  const plan = useMemo(
    () =>
      savingsPlan({
        target: goal.target,
        monthsAway,
        alreadySaved: goal.saved,
        monthlyCapacity: money(capacityMinor, 'INR'),
      }),
    [goal.target, goal.saved, monthsAway, capacityMinor],
  )

  const done = goal.reachedAt !== null
  const progress = goal.target.minor > 0 ? Math.min(1, goal.saved.minor / goal.target.minor) : 0

  /**
   * The line that says how it is going, phrased as arithmetic and then checked.
   *
   * `gate` fails closed, so if a phrasing ever drifts into a verdict about the person the
   * sentence disappears rather than shipping. `requireSpecific` keeps it from degrading into
   * a vague encouragement, which is its own kind of useless.
   */
  const line = useMemo(() => {
    if (done) return `Reached. ${format(goal.target)} put aside.`

    const each = `${format(plan.perMonth)} a month`
    const months = `${monthsAway} ${monthsAway === 1 ? 'month' : 'months'}`

    // `monthsNeeded` is `Infinity` when there is no surplus to divide by — a real state in a
    // month that spent more than it earned, and one that must not reach the screen as
    // "it takes Infinity months". Say what is actually known instead, which is nothing yet.
    const text = plan.withinCapacity
      ? `${each} gets there in ${months}.`
      : Number.isFinite(plan.monthsNeeded)
        ? `${each} gets there in ${months}, which is more than the ${format(money(capacityMinor, 'INR'))} usually left over. At that rate it takes ${plan.monthsNeeded} months.`
        : `${each} gets there in ${months}. Nothing has been left over across the months on record, so there is no rate to compare that against yet.`
    // No clock in an engine, so the hour is passed in from here.
    // `solicited`: this line only exists because the user opened this screen. Quiet hours
    // exist to stop the app speaking first, not to blank a page someone navigated to.
    const { shown } = gate(
      { text },
      { hour: new Date(now).getHours() },
      // `requireAgency` is off, and only here. It exists so a nudge cannot corner someone
      // without offering them a way out — but this is a status line on a screen they opened,
      // and there is nothing to decline. Leaving it on (the default) silently blanked the
      // one informative sentence on the card, which is a worse outcome than the rule
      // protects against. Every other rule still applies.
      { requireSpecific: true, requireAgency: false, solicited: true },
    )
    return shown?.text ?? null
  }, [done, plan, monthsAway, capacityMinor, goal.target, now])

  /**
   * One month, two months, and the rest — each capped at what is actually left to put aside.
   *
   * The cap is against the **remaining balance**, not the shortfall against capacity. Capping
   * both against the shortfall made every button show the same figure, which is the kind of
   * detail that reads as broken because it is: two controls that look different and do the
   * same thing.
   *
   * "The rest" is not a convenience. `perMonth` is always `remaining / months`, so paying it
   * repeatedly is Zeno's paradox — the balance halves and thirds toward the target and never
   * arrives, which makes the reached state literally unreachable and `reached_at` dead code.
   * Deduped, so near the end these collapse into a single honest button rather than three
   * that do the same thing.
   */
  const remaining = Math.max(0, goal.target.minor - goal.saved.minor)
  const steps = [
    ...new Set([
      Math.min(plan.perMonth.minor, remaining),
      Math.min(plan.perMonth.minor * 2, remaining),
      remaining,
    ]),
  ].sort((a, b) => a - b)

  function contribute(minor: number) {
    contributeToGoal(goal.id, minor)
    notifyChanged()
  }

  return (
    <Glass style={s.card}>
      <View style={s.cardInner}>
        <View style={s.cardTop}>
          <Text style={s.goalName}>{goal.name}</Text>
          <Pressable
            onPress={() => {
              removeGoal(goal.id)
              notifyChanged()
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${goal.name}`}
          >
            <Text style={s.remove}>Remove</Text>
          </Pressable>
        </View>

        <Text style={s.amounts}>
          <Text style={done ? s.savedDone : s.saved}>{format(goal.saved)}</Text>
          <Text style={s.of}> of {format(goal.target)}</Text>
        </Text>

        {/* Width, not transform — this bar is laid out once and never animated. */}
        <View
          style={s.track}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
        >
          <View
            style={[
              s.fill,
              { width: `${Math.max(2, progress * 100)}%` },
              done && { backgroundColor: colors.good },
            ]}
          />
        </View>

        {line && <Text style={s.line}>{line}</Text>}

        {!done && remaining > 0 && (
          <View style={s.actions}>
            {steps.map((minor) => (
              <Pressable
                key={minor}
                onPress={() => contribute(minor)}
                accessibilityRole="button"
                style={s.action}
              >
                <Text style={s.actionText}>+ {format(money(minor, 'INR'))}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Glass>
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
      marginBottom: space[4],
    },
    empty: { color: c['text-lo'], fontFamily: font.body, fontSize: 13, marginBottom: space[2] },

    card: { marginBottom: space[3] },
    cardInner: { padding: space[4] },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    goalName: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 15 },
    remove: { color: c['text-lo'], fontFamily: font.body, fontSize: 12 },

    amounts: { marginTop: space[2] },
    saved: {
      color: c['text-hi'],
      fontFamily: font.displayBold,
      fontSize: 24,
      fontVariant: ['tabular-nums'],
      writingDirection: 'ltr',
    },
    savedDone: {
      color: c.good,
      fontFamily: font.displayBold,
      fontSize: 24,
      fontVariant: ['tabular-nums'],
      writingDirection: 'ltr',
    },
    of: { color: c['text-lo'], fontFamily: font.body, fontSize: 13 },

    track: {
      height: 6,
      borderRadius: radius.full,
      backgroundColor: c['surface-2'],
      overflow: 'hidden',
      marginTop: space[3],
    },
    fill: { height: '100%', borderRadius: radius.full, backgroundColor: c.inr },

    line: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 12,
      lineHeight: 18,
      marginTop: space[3],
    },

    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[3] },
    action: {
      borderColor: c.line,
      borderWidth: 1,
      borderRadius: radius.full,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      backgroundColor: c['surface-1'],
    },
    actionText: {
      color: c['text-hi'],
      fontFamily: font.mono,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
      writingDirection: 'ltr',
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
      fontFamily: font.body,
      fontSize: 16,
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: space[3],
      paddingVertical: space[3],
    },
    error: { color: c.warn, fontFamily: font.body, fontSize: 13, marginTop: space[3] },

    primarySpacing: { marginTop: space[5] },
  })
