import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'

import { detectRecurrence, detectRemittance, safeToSpend, supportiveMode } from '@raseed/engines'
import { format, money } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { useNow } from '@/hooks/useNow'
import { Glass } from '@/components/Glass'
import {
  clearRating,
  lastNudgeByKind,
  liquidBalanceMinor,
  markNudgeActed,
  notifyChanged,
  ratableSpend,
  rateTransaction,
  recentNudges,
  recordNudgeShown,
  recurrenceCandidates,
  remittanceLegs,
  spendTotal,
  useQuery,
  worthScores,
} from '@/db'
import { DAYS_TO_PAYDAY, SAFETY_BUFFER, committedBills } from '@/lib/commitments'
import { midMarket } from '@/lib/fx'
import {
  WEEKLY_CAP,
  buildNudges,
  ratingQueue,
  regretByCategory,
  type NudgeInput,
  type Score,
} from '@/lib/reckoning'

const DAY = 86_400_000

/**
 * The Reckoning — the loop that makes this a mirror rather than a ledger.
 *
 * A bank statement can tell you what you spent. Only you can tell you whether you wanted to,
 * and this is the one screen that asks. `regretRate` and `rankNudges` were written and tested
 * five sessions ago and imported by **nothing on the phone**; the analysis lived on a dashboard
 * while the device holding the ledger stayed silent about it.
 *
 * Three parts, in the order they earn each other:
 *
 * 1. **The cards.** Five at a time, above the 60th percentile or in a category you have
 *    already regretted. Ask about a ₹20 chai and you have spent the single interaction anyone
 *    will actually give you.
 * 2. **What you regret.** Weighted by amount — ten regretted chais matter less than one
 *    regretted ₹8,000 dinner — with coverage shown, because a category rated twice deserves
 *    less confidence than one rated thirty times.
 * 3. **This week.** At most four, ever, across any rolling seven days.
 *
 * Nothing here is animated. The design doc licenses a showy card stack and this is not it: the
 * app has no Reanimated usage anywhere yet, and introducing the first of it inside a session
 * about the worth-it loop would be shipping a dependency for decoration.
 */
export default function ReckoningScreen() {
  /** Reads the ledger; the compiler would otherwise serve the pre-write state for ever. */
  'use no memo'

  const { colors } = useTheme()
  const s = styles(colors)
  const now = useNow()

  const rows = useQuery(() => ratableSpend(90))
  const scores = useQuery(worthScores)
  const shown = useQuery(() => recentNudges(7))

  /**
   * Deferred cards. Session-scoped and deliberately not persisted: "later" means later, not
   * "never" — the row stays unrated and comes back next time. Only an answer writes.
   */
  const [deferred, setDeferred] = useState<readonly string[]>([])
  const [lastAnswered, setLastAnswered] = useState<string | null>(null)
  const [dismissedNudges, setDismissedNudges] = useState<readonly string[]>([])

  /**
   * The batch is chosen **once**, on open, and then counts down.
   *
   * P8's spec says five per session, and a queue that recomputes after every answer does not
   * deliver that — it refills from the backlog, so the count sits at five however many you
   * answer and the session has no end. Picking the set up front is what makes "five" a real
   * number rather than a page size, and it is what lets the empty state say something true.
   */
  const [batch] = useState(() => ratingQueue(rows, scores, now).map((r) => r.id))

  const queue = batch
    .filter((id) => !scores.has(id) && !deferred.includes(id))
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
  const card = queue[0]

  /**
   * Only categories that actually cost you something you did not want.
   *
   * `regretByCategory` returns every category you have rated, which is the honest general
   * answer; this panel is titled "Where the regret is" and a row reading "₹0 of ₹2,888.50
   * rated · 0%" is not where the regret is. Rating something positively is a good outcome, not
   * a line item in a list of regrets.
   */
  const regret = [...regretByCategory(rows, scores)]
    .filter((line) => line.regrettedMinor > 0)
    .sort((a, b) => b.regrettedMinor - a.regrettedMinor)

  useNudgeBudget()

  function answer(id: string, score: Score) {
    rateTransaction(id, score)
    setLastAnswered(id)
    notifyChanged()
  }

  function undo() {
    if (!lastAnswered) return
    clearRating(lastAnswered)
    setLastAnswered(null)
    notifyChanged()
  }

  const ratedCount = scores.size

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={s.back}>Back</Text>
        </Pressable>
        <Text style={s.title}>The Reckoning</Text>
        <View style={s.spacer} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.lede}>
          {ratedCount === 0
            ? 'Your statement knows what you spent. It cannot know whether you wanted to. That part only works if you answer.'
            : `${ratedCount} answered so far. Everything below is built from those answers and nothing else.`}
        </Text>

        {/* ── the cards ─────────────────────────────────────────────────── */}
        <Text style={s.section}>Worth it?</Text>
        {card ? (
          <Glass style={s.card}>
            <View style={s.cardInner}>
              <Text style={s.cardCount}>
                {queue.length} of {batch.length} to look back on
              </Text>
              <Text style={s.merchant} numberOfLines={2}>
                {card.merchant}
              </Text>
              {/* As you paid it. A Careem ride you know as AED 85 is not more recognisable
                  rendered as ₹1,993.25, and recall is the entire point of the question. The
                  home figure follows only when the two differ, because that is the number the
                  regret arithmetic below actually uses. */}
              <Text style={s.amount}>
                {format(money(card.amountMinor, card.currency), { compactZeroFraction: true })}
              </Text>
              <Text style={s.cardMeta}>
                {card.categoryName} ·{' '}
                {new Date(card.occurredAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
                {card.currency !== 'INR' &&
                  ` · ${format(money(card.homeAmountMinor, 'INR'), { compactZeroFraction: true })}`}
              </Text>

              <View style={s.choices}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Not worth it: ${card.merchant}`}
                  onPress={() => answer(card.id, -1)}
                  style={[s.choice, { borderColor: colors.warn }]}
                >
                  <Text style={[s.choiceText, { color: colors.warn }]}>Not worth it</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Neither: ${card.merchant}`}
                  onPress={() => answer(card.id, 0)}
                  style={s.choice}
                >
                  <Text style={s.choiceText}>Neither</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Worth it: ${card.merchant}`}
                  onPress={() => answer(card.id, 1)}
                  style={[s.choice, { borderColor: colors.good }]}
                >
                  <Text style={[s.choiceText, { color: colors.good }]}>Worth it</Text>
                </Pressable>
              </View>

              <View style={s.tertiary}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDeferred((d) => [...d, card.id])}
                  hitSlop={8}
                >
                  <Text style={s.tertiaryText}>Later</Text>
                </Pressable>
                {lastAnswered && (
                  <Pressable accessibilityRole="button" onPress={undo} hitSlop={8}>
                    <Text style={s.tertiaryText}>Undo last</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </Glass>
        ) : (
          <Glass style={s.card}>
            <View style={s.cardInner}>
              <Text style={s.empty}>
                {rows.length === 0
                  ? 'Nothing recorded yet. Log a few days and this fills itself.'
                  : batch.length === 0
                    ? 'Nothing to ask about. This only surfaces the larger spends of the last week, and the categories you have already told us you regret.'
                    : deferred.length > 0
                      ? "That's the batch. The ones you put off will be here next time."
                      : "That's the batch — five is deliberately all it asks for in one sitting. More next time."}
              </Text>
              {lastAnswered && (
                <Pressable accessibilityRole="button" onPress={undo} hitSlop={8} style={s.tertiary}>
                  <Text style={s.tertiaryText}>Undo last</Text>
                </Pressable>
              )}
            </View>
          </Glass>
        )}

        {/* ── what you regret ───────────────────────────────────────────── */}
        <Text style={s.section}>Where the regret is</Text>
        <Glass style={s.card}>
          <View style={s.cardInner}>
            {regret.length === 0 ? (
              <Text style={s.empty}>
                {ratedCount === 0
                  ? 'Empty until you answer a card. A category shown at 0% would be a claim with no evidence behind it, so it is left out rather than filled in.'
                  : "Nothing marked “not worth it” yet. This fills in only when something did not earn its place — which is a good state to be in, not a missing one."}
              </Text>
            ) : (
              <View style={s.rows}>
                {regret.slice(0, 5).map((line) => (
                  <View key={line.categoryId} style={s.row}>
                    <View style={s.rowText}>
                      <Text style={s.rowName}>{line.name}</Text>
                      <Text style={s.rowMeta}>
                        {format(money(line.regrettedMinor, 'INR'), { compactZeroFraction: true })}{' '}
                        of{' '}
                        {format(money(line.ratedMinor, 'INR'), { compactZeroFraction: true })} rated
                        {line.coverage < 0.5 ? ` · ${Math.round(line.coverage * 100)}% covered` : ''}
                      </Text>
                    </View>
                    <Text
                      style={[
                        s.rowAmount,
                        { color: line.regretRate >= 0.5 ? colors.warn : colors['text-hi'] },
                      ]}
                    >
                      {Math.round(line.regretRate * 100)}%
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={s.note}>
              Weighted by amount, not by count — ten regretted chais matter less than one
              regretted dinner. Coverage is shown below half, because a category rated twice
              deserves less confidence than one rated thirty times.
            </Text>
          </View>
        </Glass>

        {/* ── this week ─────────────────────────────────────────────────── */}
        <Text style={s.section}>This week</Text>
        <Glass style={s.card}>
          <View style={s.cardInner}>
            {shown.length === 0 ? (
              <Text style={s.empty}>
                Nothing worth interrupting you about. Silence is the default here, not a gap.
              </Text>
            ) : (
              <View style={s.nudges}>
                {shown
                  .filter((n) => !dismissedNudges.includes(n.kind))
                  .map((n) => (
                    <View key={n.kind} style={[s.nudge, n.acted && s.nudgeActed]}>
                      <Text style={s.nudgeTitle}>{n.title}</Text>
                      <Text style={s.nudgeBody}>{n.body}</Text>
                      {!n.acted && (
                        <View style={s.choices}>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              markNudgeActed(n.kind)
                              notifyChanged()
                              const to = destination(n.kind)
                              if (to) router.push(to)
                            }}
                            style={s.choice}
                          >
                            <Text style={s.choiceText}>
                              {destination(n.kind) ? 'Show me' : 'Noted'}
                            </Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setDismissedNudges((d) => [...d, n.kind])}
                            style={s.choice}
                          >
                            <Text style={s.choiceText}>Not now</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  ))}
              </View>
            )}
            <Text style={s.note}>
              {shown.length} of {WEEKLY_CAP} used in the last seven days. Unused slots are not
              banked and anything under the cut expires rather than queueing — a rolling window,
              so four on Sunday and four on Monday cannot both count as &ldquo;four a week&rdquo;.
            </Text>
          </View>
        </Glass>

        <Text style={s.footnote}>
          Your answers stay on this device. They are not a budget and not a score — the model is
          n=1 and it reflects your mood on the day you rated. Read the trend, not the number.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

/** Where a nudge leads, when it leads anywhere. The rest are already on this screen. */
function destination(kind: string): '/numbers' | null {
  const family = kind.split(':')[0]
  return family === 'corridor' || family === 'subscription' ? '/numbers' : null
}

/**
 * Spend the week's attention, once, on open.
 *
 * The screen renders only what has already been recorded; this is the sole thing that adds to
 * that list. Recomputing on every render would burn all four slots in an afternoon of ordinary
 * use, and recomputing on focus would do it in a week of ordinary navigation — so the ref
 * guard is doing real work, not defending against a hypothetical.
 *
 * Every read here is a synchronous JSI call, so the effect can gather its own inputs rather
 * than closing over render values that may have moved on.
 */
function useNudgeBudget(): void {
  const spent = useRef(false)

  useEffect(() => {
    if (spent.current) return
    spent.current = true

    const at = Date.now()
    const stored = recentNudges(7)

    const { ship } = buildNudges(
      collectNudgeInput(at),
      {
        sentLast7: stored.length,
        // Acting on one relieves fatigue; it does not hand back a slot.
        ignoredLast7: stored.filter((n) => !n.acted).length,
        lastSentByKind: lastNudgeByKind(30),
      },
      { now: at, hour: new Date(at).getHours(), supportiveMode: inSupportiveMode(at) },
    )

    if (ship.length === 0) return
    for (const n of ship) recordNudgeShown(n)
    notifyChanged()
  }, [])
}

/** Everything the phone already knows, in the shape the nudge budget reads. */
function collectNudgeInput(at: number): NudgeInput {
  const rows = ratableSpend(90)
  const scores = worthScores()

  const candidates = recurrenceCandidates(400)
  const nameOf = (id: string) => candidates.find((c) => c.merchantId === id)?.merchantName ?? id
  const subscriptions = detectRecurrence(
    candidates.map((c) => ({
      merchantId: c.merchantId,
      amountMinor: c.amountMinor,
      currency: c.currency,
      occurredAt: c.occurredAt,
    })),
  ).map((r) => ({
    key: r.merchantId,
    name: nameOf(r.merchantId),
    amountMinor: r.amountMinor,
    currency: r.currency,
    periodDays: r.periodDays,
  }))

  const remittances = detectRemittance(remittanceLegs(400), midMarket)

  const sts = safeToSpendNow(at)

  return {
    regret: [...regretByCategory(rows, scores)].sort(
      (a, b) => b.regrettedMinor - a.regrettedMinor,
    ),
    subscriptions,
    corridor: {
      costMinor: Math.round(remittances.reduce((a, r) => a + r.costMinor, 0)),
      transfers: remittances.length,
    },
    runway: { roomMinor: sts.amount.minor, daysToIncome: sts.daysUntilIncome },
  }
}

/**
 * The same Safe-to-Spend the home screen shows, from the same inputs.
 *
 * Recomputed here rather than passed in because this runs inside an effect that deliberately
 * gathers its own state — but it must be the *same* arithmetic, or the runway nudge would
 * quote a number the dial disagrees with.
 */
function safeToSpendNow(at: number) {
  const startOfToday = Math.floor(at / DAY) * DAY
  return safeToSpend({
    liquidBalance: money(liquidBalanceMinor(), 'INR'),
    committedBills: committedBills(),
    pendingSweeps: [],
    safetyBuffer: SAFETY_BUFFER,
    rawCarryover: money(0, 'INR'),
    spentToday: spendTotal(startOfToday, startOfToday + DAY),
    today: at,
    nextIncomeAt: at + DAYS_TO_PAYDAY * DAY,
  })
}

function inSupportiveMode(at: number): boolean {
  const startOfToday = Math.floor(at / DAY) * DAY
  return supportiveMode({
    roomMinor: safeToSpendNow(at).amount.minor,
    spendMinor: spendTotal(startOfToday, startOfToday + DAY).minor,
    incomeMinor: 0,
    consecutiveNegativeDays: 0,
  })
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
    section: {
      color: c['text-lo'],
      fontFamily: font.bodyMedium,
      fontSize: 12,
      marginTop: space[5],
      marginBottom: space[2],
    },

    card: { marginBottom: space[2] },
    cardInner: { padding: space[4] },
    cardCount: { color: c['text-lo'], fontFamily: font.bodyMedium, fontSize: 12 },

    merchant: {
      color: c['text-hi'],
      fontFamily: font.body,
      fontSize: 17,
      marginTop: space[3],
    },
    amount: {
      color: c['text-hi'],
      fontFamily: font.displayBold,
      fontSize: 34,
      fontVariant: ['tabular-nums'],
      marginTop: space[1],
    },
    cardMeta: { color: c['text-lo'], fontFamily: font.body, fontSize: 12, marginTop: space[1] },

    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[4] },
    choice: {
      borderRadius: radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
    },
    choiceText: { color: c['text-lo'], fontFamily: font.bodyMedium, fontSize: 13 },

    tertiary: { flexDirection: 'row', gap: space[4], marginTop: space[4] },
    tertiaryText: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 12,
      textDecorationLine: 'underline',
    },

    empty: { color: c['text-lo'], fontFamily: font.body, fontSize: 13, lineHeight: 19 },
    note: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 11,
      lineHeight: 17,
      marginTop: space[3],
    },

    rows: { gap: space[2] },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: space[3],
    },
    rowText: { flexShrink: 1 },
    rowName: { color: c['text-hi'], fontFamily: font.body, fontSize: 14 },
    rowMeta: { color: c['text-lo'], fontFamily: font.body, fontSize: 11, marginTop: 1 },
    rowAmount: {
      color: c['text-hi'],
      fontFamily: font.mono,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },

    nudges: { gap: space[4] },
    nudge: { gap: space[1] },
    nudgeActed: { opacity: 0.5 },
    nudgeTitle: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 14 },
    nudgeBody: { color: c['text-lo'], fontFamily: font.body, fontSize: 13, lineHeight: 20 },

    footnote: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 11,
      lineHeight: 17,
      marginTop: space[6],
    },
  })
