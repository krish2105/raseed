import { useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'

import { tripProgress, type TripPace } from '@raseed/engines'
import { format, fromMajor, money, type Currency } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { useNow } from '@/hooks/useNow'
import { activeTripWithSpend, endActiveTrip, notifyChanged, startTrip, useQuery } from '@/db'
import { endTripActivity, startTripActivity, updateTripActivity } from '@/lib/tripActivity'
import { Badge, Card, PrimaryButton, SecondaryButton } from '@/components/ui'

/**
 * Trip Mode — the toggle from `MOBILE_ARCHITECTURE.md` F15.
 *
 * **You start it; nothing detects it.** That is the settled design and it is also the only one
 * that works: `detectTrips` needs two days before a run counts, and a lock-screen activity that
 * appears on day three of a five-day trip is worse than none. Starting it yourself also supplies
 * the `name` and `country` the table requires and the ledger has no way to invent.
 *
 * Every figure here comes from `tripProgress`, which is pure and takes the clock as a parameter.
 * When the Live Activity lands it renders the same object, so the lock screen cannot disagree
 * with the app that put it there.
 */

const MS_PER_DAY = 86_400_000
const epochDay = (ms: number) => Math.floor(ms / MS_PER_DAY)

export function TripMode() {
  /** Reads the ledger; the compiler would otherwise serve the pre-write state for ever. */
  'use no memo'

  const { colors } = useTheme()
  const s = styles(colors)
  const now = useNow()

  // A module-level function, never an inline arrow — see `activeTripWithSpend`. An inline
  // closure re-runs this query on every keystroke and empties the fields under you.
  const current = useQuery(activeTripWithSpend)

  const [name, setName] = useState('')
  const [country, setCountry] = useState('')
  const [budgetText, setBudgetText] = useState('')

  if (!current) {
    const ready = name.trim().length > 0 && country.trim().length > 0
    return (
      <Card style={s.card}>
        <Text style={s.title}>On a trip?</Text>
        <Text style={s.lede}>
          Turn this on when you land. Everything you record until you turn it off is tagged to the
          trip, so it can be totalled separately without being taken out of your month.
        </Text>

        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder="Dubai, June"
          placeholderTextColor={colors['text-lo']}
          accessibilityLabel="Trip name"
        />
        <TextInput
          style={s.input}
          value={country}
          onChangeText={setCountry}
          placeholder="UAE"
          placeholderTextColor={colors['text-lo']}
          accessibilityLabel="Country"
        />
        <TextInput
          style={s.input}
          value={budgetText}
          onChangeText={setBudgetText}
          placeholder="Budget, if you have one"
          placeholderTextColor={colors['text-lo']}
          keyboardType="decimal-pad"
          accessibilityLabel="Budget, optional"
        />

        <PrimaryButton
          label="Start the trip"
          disabled={!ready}
          onPress={() => {
            const budgetMinor = parseBudget(budgetText)
            startTrip({
              name: name.trim(),
              country: country.trim(),
              // AED because a trip's own currency is what you spend there. The ledger still
              // freezes fx_rate per row, so the home total is unaffected by this choice.
              currency: 'AED' as Currency,
              budgetMinor,
            })
            // Day one, nothing spent yet — the numbers the activity opens on.
            startTripActivity(
              { name: name.trim() },
              tripProgress({
                startedDay: epochDay(now),
                endsDay: null,
                today: epochDay(now),
                spent: money(0, 'INR'),
                budget: budgetMinor === null ? null : money(budgetMinor, 'INR'),
                currency: 'INR',
              }),
              colors,
            )
            setName('')
            setCountry('')
            setBudgetText('')
            // Every write in this app notifies the store; `useQuery` re-reads on the bump and
            // on focus, and neither fires by itself for a write made on the screen you are
            // already looking at. Without this the card sits on the pre-write state.
            notifyChanged()
          }}
        />
      </Card>
    )
  }

  const { trip, spent } = current
  const p = tripProgress({
    startedDay: epochDay(trip.started_at),
    endsDay: null,
    today: epochDay(now),
    spent,
    budget: trip.budget_minor === null ? null : money(trip.budget_minor, 'INR'),
    currency: 'INR',
  })

  return (
    <Card style={s.card}>
      <TripActivitySync trip={trip} progress={p} />
      <View style={s.head}>
        <Text style={s.title}>{trip.name}</Text>
        <Badge tone={p.pace === 'over' ? 'warn' : 'accent'}>{paceLabel(p.pace, p.dayNumber)}</Badge>
      </View>

      <Text style={s.figure}>{format(p.spent)}</Text>
      <Text style={s.lede}>
        spent in {trip.country} so far, across {p.dayNumber} {p.dayNumber === 1 ? 'day' : 'days'}
        {p.dayNumber > 1 ? ` — ${format(p.burnPerDay)} a day` : ''}.
        {p.remaining
          ? ` ${
              p.remaining.minor >= 0
                ? `${format(p.remaining)} of the budget left.`
                : `${format(p.remaining)} past the budget.`
            }`
          : ' No budget set, so this is a record rather than a limit.'}
      </Text>

      <SecondaryButton
        label="End the trip"
        onPress={() => {
          // The activity ends first, with the final numbers. Ending the row first would leave a
          // frame where the trip is over and the Lock Screen is still counting it.
          endTripActivity(trip, p, colors)
          endActiveTrip()
          notifyChanged()
        }}
      />
    </Card>
  )
}

/**
 * Keeps the Lock Screen in step with the app.
 *
 * A child component rather than an effect in `TripMode`, because `TripMode` returns early when
 * there is no trip — and a hook after a conditional return is a hook order violation. Pushing
 * the sync down a level is the fix that does not involve restructuring the screen around a
 * side effect.
 *
 * Keyed on the formatted figures, not the objects: `tripProgress` returns a fresh object every
 * render, so depending on it would push an update to the system on every keystroke and burn
 * through the update budget iOS gives a Live Activity.
 */
function TripActivitySync({
  trip,
  progress,
}: {
  trip: { name: string }
  progress: ReturnType<typeof tripProgress>
}) {
  const { colors } = useTheme()
  const key = `${progress.spent.minor}|${progress.dayNumber}|${progress.pace}`
  useEffect(() => {
    updateTripActivity(trip, progress, colors)
    // `key` collapses the parts that can actually change what is displayed. The objects are
    // new on every render and would otherwise fire this constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

/**
 * A budget, or none.
 *
 * `fromMajor` takes a string and throws on anything it cannot parse — which is the right
 * behaviour for money and the wrong behaviour for an optional field someone left half-typed. A
 * blank or unparseable budget means "no budget", which the rest of the feature already handles
 * as a first-class state, so there is nothing to report and nothing to block on.
 */
function parseBudget(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    const m = fromMajor(trimmed, 'AED')
    return m.minor > 0 ? m.minor : null
  } catch {
    return null
  }
}

/**
 * The verdict in words.
 *
 * `too-early` says so rather than showing nothing — a blank where a status belongs reads as a
 * bug, and "too early to say" is a real and honest answer on day one.
 */
function paceLabel(pace: TripPace, dayNumber: number): string {
  switch (pace) {
    case 'over':
      return 'Over the budget'
    case 'under':
      return 'Under the budget'
    case 'on-track':
      return 'About on budget'
    case 'too-early':
      return dayNumber === 1 ? 'Day one' : 'Too early to say'
    case 'no-projection':
      // A budget, but no end date to project onto. Saying "No budget" here contradicted the
      // remaining figure printed two lines below it.
      return 'No end date'
    case 'no-budget':
      return 'No budget'
  }
}

const styles = (c: Palette) =>
  StyleSheet.create({
    card: { gap: space[3] },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: c['text-hi'], fontFamily: font.display, fontSize: 18 },
    // Tabular, like every figure in the app — a total that shifts width as it grows reads as
    // unstable, and this one updates every time you record something.
    figure: {
      color: c['text-hi'],
      fontFamily: font.display,
      fontSize: 32,
      fontVariant: ['tabular-nums'],
      writingDirection: 'ltr',
    },
    lede: { color: c['text-lo'], fontFamily: font.body, fontSize: 13, lineHeight: 19 },
    input: {
      color: c['text-hi'],
      fontFamily: font.body,
      fontSize: 15,
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.md,
      paddingHorizontal: space[3],
      paddingVertical: space[3],
    },
  })
