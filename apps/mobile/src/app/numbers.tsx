import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'

import { useState } from 'react'

import {
  ASK_EXAMPLES,
  changePoints,
  detectRecurrence,
  detectRemittance,
  flagAnomalies,
  median,
  parseAsk,
  paydayRunway,
} from '@raseed/engines'
import { format, money } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { useNow } from '@/hooks/useNow'
import { Glass } from '@/components/Glass'
import { Sparkline } from '@/components/Sparkline'
import {
  answerAsk,
  dailySpend,
  liquidBalanceMinor,
  recurrenceCandidates,
  remittanceLegs,
  useQuery,
} from '@/db'
import { DAYS_TO_PAYDAY, SAFETY_BUFFER, committedBills } from '@/lib/commitments'
import { midMarket, remittanceCaveat } from '@/lib/fx'

/** Below this many days of history, the statistics say more about the sample than about you. */
const MIN_DAYS = 21

/**
 * The analysis the phone never had.
 *
 * Every engine on this screen was written, tested and then imported by the web app only —
 * `detectRecurrence`, `flagAnomalies` and `changePoints` had **zero** mobile callers. So the
 * device that captures every transaction was the one surface that could not tell you anything
 * about them, and the analysis lived on a dashboard you open occasionally.
 *
 * Three questions, in the order they are worth asking:
 *
 * 1. **What repeats?** Subscriptions are the spending you forget you agreed to.
 * 2. **What changed?** A CUSUM change point is a shift in your baseline, not a big day —
 *    those are different things and only one of them means anything.
 * 3. **What was unusual?** MAD z-scores, because one ₹80,000 flight makes mean-and-σ call
 *    every other day normal.
 *
 * Each panel refuses to speak below its own evidence threshold rather than rendering a
 * confident-looking figure computed from four data points. That is the same rule the trip
 * planner follows, and it is the whole difference between analysis and decoration.
 */
export default function NumbersScreen() {
  /** Reads the ledger; the compiler would otherwise serve the pre-write state for ever. */
  'use no memo'

  const { colors } = useTheme()
  const s = styles(colors)

  // The clock as a value, from the shared hook that already handles foreground and
  // midnight. Sampling it mid-render would let two renders disagree about today.
  const now = useNow()
  const days = useQuery(() => dailySpend(90))
  const candidates = useQuery(() => recurrenceCandidates(400))
  const legs = useQuery(() => remittanceLegs(400))

  const series = days.map((d) => d.minor)
  const enough = days.length >= MIN_DAYS && series.some((v) => v > 0)

  const recurring = detectRecurrence(
    candidates.map((c) => ({
      merchantId: c.merchantId,
      amountMinor: c.amountMinor,
      currency: c.currency,
      occurredAt: c.occurredAt,
    })),
  )
  const nameOf = (id: string) =>
    candidates.find((c) => c.merchantId === id)?.merchantName ?? id

  // Change points and anomalies both need the zero-filled series; a gap is information.
  const shifts = enough ? changePoints(series) : []
  const outlierIdx = enough ? flagAnomalies(series) : []
  const typical = enough ? median(series.filter((v) => v > 0)) : 0

  // The corridor: an outflow in one currency paired with an inflow in the other. The engine
  // refuses anything it cannot match confidently, so an empty list means "no clear pair",
  // not "no transfers".
  const remittances = detectRemittance(legs, midMarket)
  const corridorCost = remittances.reduce((a, r) => a + r.costMinor, 0)

  // ── payday runway ──────────────────────────────────────────────────────
  const balanceMinor = useQuery(liquidBalanceMinor)
  const runway = paydayRunway({
    liquidBalance: money(balanceMinor, 'INR'),
    committedBills: committedBills(),
    safetyBuffer: SAFETY_BUFFER,
    dailySpend: series,
    today: now,
    nextIncomeAt: now + DAYS_TO_PAYDAY * 86_400_000,
  })

  // ── ask your ledger ────────────────────────────────────────────────────
  const [question, setQuestion] = useState('')
  const ask = parseAsk(question)
  const answer = useQuery(() => (ask ? answerAsk(ask.intent) : null))

  const monthlyRecurring = recurring.reduce(
    (a, r) => a + Math.round((r.amountMinor * 30) / Math.max(1, r.periodDays)),
    0,
  )

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={s.back}>Back</Text>
        </Pressable>
        <Text style={s.title}>Numbers</Text>
        <View style={s.spacer} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.lede}>
          {enough
            ? `${days.length} days of history. Everything below is computed on this device from your own rows.`
            : `Only ${days.filter((d) => d.minor > 0).length} days with spend so far. These need about three weeks before they say anything about you rather than about the sample.`}
        </Text>

        {/* ── the shape of the last 90 days ─────────────────────────────── */}
        <Glass style={s.card}>
          <View style={s.cardInner}>
            <Text style={s.cardLabel}>Last 90 days</Text>
            <Sparkline
              values={series}
              highlight={outlierIdx}
              color={colors.inr}
              accent={colors.warn}
            />
            {enough && (
              <Text style={s.note}>
                A typical spending day is {format(money(Math.round(typical), 'INR'))}. The
                marked days are more than 3.5 robust deviations from that — measured with
                median and MAD, so one very large day cannot make every other day look normal.
              </Text>
            )}
          </View>
        </Glass>

        {/* ── payday runway ─────────────────────────────────────────────── */}
        <Text style={s.section}>Does it reach payday?</Text>
        <Glass style={s.card}>
          <View style={s.cardInner}>
            {!enough ? (
              <Text style={s.empty}>Needs about three weeks of history before a rate means anything.</Text>
            ) : (
              <>
                <Text style={[s.big, { color: runway.reachesPayday ? colors.good : colors.warn }]}>
                  {runway.reachesPayday
                    ? 'Yes'
                    : runway.pool.minor === 0
                      ? 'Already there'
                      : `Runs out ${new Date(runway.runsOutAt ?? now).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                </Text>
                <Text style={s.note}>
                  {runway.pool.minor === 0
                    ? `No room left after commitments and the buffer, with ${runway.daysUntilIncome} days to go.`
                    : `${format(runway.pool)} of room, ${format(runway.burnPerDay)} on an ordinary day, ${runway.daysUntilIncome} days to go.`}
                  {/* Only when there is something to hold to. "Hold to ₹0.00 a day" is not
                      advice, it is arithmetic with nothing left to divide. */}
                  {!runway.reachesPayday &&
                    runway.requiredPerDay.minor > 0 &&
                    ` Holding to ${format(runway.requiredPerDay)} a day would get you there.`}
                </Text>
                <Text style={s.note}>
                  The rate is a median rather than an average: one rent day in thirty pulls a mean up
                  by a third and produces a runway that is wrong in the reassuring direction.
                  Quiet days stay in the sample, because this counts days rather than spending
                  days.
                </Text>
              </>
            )}
          </View>
        </Glass>

        {/* ── ask your ledger ───────────────────────────────────────────── */}
        <Text style={s.section}>Ask your ledger</Text>
        <Glass style={s.card}>
          <View style={s.cardInner}>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder={ASK_EXAMPLES[0]}
              placeholderTextColor={colors['text-lo']}
              accessibilityLabel="Ask a question about your ledger"
              style={s.askInput}
            />

            {question.trim().length > 0 && !ask && (
              <Text style={s.note}>
                Not a question this understands. It answers totals, counts, averages, the largest
                spends, and breakdowns by merchant or category — and it says so rather than
                answering something adjacent, because a query tool that always replies teaches
                you to trust an answer it had no basis for.
              </Text>
            )}

            {ask && answer && (
              <>
                <Text style={s.cardLabel}>{ask.restated}</Text>
                {answer.total && (
                  <Text style={s.big}>{format(answer.total)}</Text>
                )}
                {answer.count !== undefined && !answer.total && (
                  <Text style={s.big}>{answer.count.toLocaleString('en-IN')}</Text>
                )}
                {answer.rows && (
                  <View style={s.rows}>
                    {answer.rows.map((r) => (
                      <View key={r.label} style={s.row}>
                        <Text style={s.rowName} numberOfLines={1}>
                          {r.label}
                        </Text>
                        <Text style={s.rowAmount}>{format(r.amount)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {question.trim().length === 0 && (
              <View style={s.examples}>
                {ASK_EXAMPLES.slice(0, 3).map((e) => (
                  <Pressable
                    key={e}
                    accessibilityRole="button"
                    onPress={() => setQuestion(e)}
                    style={s.example}
                  >
                    <Text style={s.exampleText}>{e}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={s.note}>
              The question is read into one of six intents, never into SQL — so there is no string
              from you anywhere near the database. The dashboard runs the same intents against
              DuckDB, which is why both surfaces answer the same question the same way.
            </Text>
          </View>
        </Glass>

        {/* ── what repeats ──────────────────────────────────────────────── */}
        <Text style={s.section}>What repeats</Text>
        <Glass style={s.card}>
          <View style={s.cardInner}>
            {recurring.length === 0 ? (
              <Text style={s.empty}>
                Nothing yet. A subscription needs three charges at a steady interval before it
                is a pattern rather than a coincidence.
              </Text>
            ) : (
              <>
                <Text style={s.big}>
                  {format(money(monthlyRecurring, 'INR'))}
                  <Text style={s.bigUnit}> a month</Text>
                </Text>
                <Text style={s.note}>
                  across {recurring.length}{' '}
                  {recurring.length === 1 ? 'commitment' : 'commitments'}, normalised to 30 days
                </Text>
                <View style={s.rows}>
                  {recurring.slice(0, 8).map((r) => (
                    <View key={r.merchantId} style={s.row}>
                      <View style={s.rowText}>
                        <Text style={s.rowName}>{nameOf(r.merchantId)}</Text>
                        <Text style={s.rowMeta}>
                          every {Math.round(r.periodDays)}d
                          {r.priceChange
                            ? ` · ${format(money(Math.abs(r.priceChange.annualDeltaMinor), r.currency))}/yr ${r.priceChange.annualDeltaMinor > 0 ? 'more' : 'less'}`
                            : ''}
                        </Text>
                      </View>
                      <Text
                        style={[s.rowAmount, r.priceChange ? { color: colors.warn } : null]}
                      >
                        {format(money(r.amountMinor, r.currency))}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        </Glass>

        {/* ── what changed ──────────────────────────────────────────────── */}
        <Text style={s.section}>What changed</Text>
        <Glass style={s.card}>
          <View style={s.cardInner}>
            {!enough ? (
              <Text style={s.empty}>Needs about three weeks of history.</Text>
            ) : shifts.length === 0 ? (
              <Text style={s.empty}>
                No shift in your baseline. Individual days move around; the level you spend at
                has held.
              </Text>
            ) : (
              <View style={s.rows}>
                {shifts.slice(0, 4).map((c) => {
                  const when = new Date(days[c.index]?.day ?? now)
                  const up = c.delta > 0
                  return (
                    <View key={c.index} style={s.row}>
                      <View style={s.rowText}>
                        <Text style={s.rowName}>
                          {when.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </Text>
                        <Text style={s.rowMeta}>
                          {format(money(Math.round(c.before), 'INR'))} →{' '}
                          {format(money(Math.round(c.after), 'INR'))} a day
                        </Text>
                      </View>
                      <Text
                        style={[s.rowAmount, { color: up ? colors.warn : colors.good }]}
                      >
                        {up ? '+' : '−'}
                        {format(money(Math.abs(Math.round(c.delta)), 'INR'))}
                      </Text>
                    </View>
                  )
                })}
              </View>
            )}
            <Text style={s.note}>
              CUSUM, with the textbook k=0.5σ and h=5σ. Loosening h finds a change every few
              weeks in ordinary noise, which is indistinguishable from finding none.
            </Text>
          </View>
        </Glass>

        {/* ── the corridor ─────────────────────────────────────────────── */}
        <Text style={s.section}>The corridor</Text>
        <Glass style={s.card}>
          <View style={s.cardInner}>
            {remittances.length === 0 ? (
              <Text style={s.empty}>
                No transfer pairs found. A remittance is an outflow in one currency and an
                inflow in the other within a few days — nothing here matched that closely
                enough to claim.
              </Text>
            ) : (
              <>
                <Text style={s.big}>
                  {format(money(Math.round(corridorCost), 'INR'))}
                  <Text style={s.bigUnit}> lost to spread</Text>
                </Text>
                <Text style={s.note}>
                  across {remittances.length}{' '}
                  {remittances.length === 1 ? 'transfer' : 'transfers'}
                </Text>
                <View style={s.rows}>
                  {remittances.slice(0, 6).map((r) => (
                    <View key={r.outflowId} style={s.row}>
                      <View style={s.rowText}>
                        <Text style={s.rowName}>
                          {r.impliedRate.toFixed(2)} vs {r.midMarketRate.toFixed(2)} mid
                        </Text>
                        <Text style={s.rowMeta}>
                          {(r.efficiency * 100).toFixed(1)}% of mid-market
                        </Text>
                      </View>
                      <Text
                        style={[
                          s.rowAmount,
                          { color: r.efficiency < 0.97 ? colors.warn : colors.good },
                        ]}
                      >
                        {format(money(Math.round(r.costMinor), 'INR'))}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
            <Text style={s.note}>{remittanceCaveat}</Text>
          </View>
        </Glass>

        <Text style={s.footnote}>
          None of this leaves the phone. There is no server involved and no request made — the
          same rows, the same engines the dashboard uses, run here.
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
    cardLabel: { color: c['text-lo'], fontFamily: font.bodyMedium, fontSize: 12 },

    askInput: {
      color: c['text-hi'],
      backgroundColor: c['surface-0'],
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.md,
      paddingHorizontal: space[3],
      paddingVertical: space[3],
      fontFamily: font.body,
      fontSize: 15,
    },
    examples: { gap: space[2], marginTop: space[3] },
    example: {
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.full,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      alignSelf: 'flex-start',
    },
    exampleText: { color: c['text-lo'], fontFamily: font.body, fontSize: 12 },

    big: {
      color: c['text-hi'],
      fontFamily: font.displayBold,
      fontSize: 30,
      fontVariant: ['tabular-nums'],
      marginTop: space[1],
    },
    bigUnit: { color: c['text-lo'], fontFamily: font.body, fontSize: 14 },

    empty: { color: c['text-lo'], fontFamily: font.body, fontSize: 13, lineHeight: 19 },
    note: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 11,
      lineHeight: 17,
      marginTop: space[3],
    },

    rows: { marginTop: space[3], gap: space[2] },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3] },
    rowText: { flexShrink: 1 },
    rowName: { color: c['text-hi'], fontFamily: font.body, fontSize: 14 },
    rowMeta: { color: c['text-lo'], fontFamily: font.body, fontSize: 11, marginTop: 1 },
    rowAmount: {
      color: c['text-hi'],
      fontFamily: font.mono,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },

    footnote: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 11,
      lineHeight: 17,
      marginTop: space[6],
    },
  })
