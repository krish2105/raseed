import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Link } from 'expo-router'
import { Camera, Plus } from 'lucide-react-native'

import { safeToSpend, type Fact } from '@raseed/engines'
import { format, money } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { liquidBalanceMinor, ratableSpend, spendBetween, spendTotal, useQuery, worthScores } from '@/db'
import { DAYS_TO_PAYDAY, SAFETY_BUFFER, committedBills } from '@/lib/commitments'
import { ratingQueue } from '@/lib/reckoning'
import { useNow } from '@/hooks/useNow'
import { DayDial } from '@/components/DayDial'
import { Companion } from '@/components/Companion'

const DAY = 86_400_000

/**
 * Today. One number, the day's ledger beneath it, capture pinned to the thumb zone.
 *
 * The Skia Day Dial replaces the flat meter at Session 9; the arithmetic is already the
 * real `safeToSpend` engine reading real rows out of SQLite.
 */
export default function TodayScreen() {
  /**
   * The React Compiler memoises this component's reads, and the store version is not
   * something it can see as an input. Without this the screen shows the state before the
   * most recent write — for ever, until the process restarts.
   *
   * Confirmed by measurement, after four wrong theories: one connection, one module
   * instance, an INSERT visible to a SELECT on the very next statement, and a screen that
   * genuinely re-rendered. The read was cached, not stale.
   */
  'use no memo'

  const { colors } = useTheme()
  const s = styles(colors)

  const now = useNow()
  const startOfToday = Math.floor(now / DAY) * DAY
  const entries = useQuery(() => spendBetween(startOfToday, startOfToday + DAY))
  const spentToday = useQuery(() => spendTotal(startOfToday, startOfToday + DAY))

  // The balance is real: opening balances plus every confirmed movement. It used to be the
  // literal 96000.00, which made the dial arithmetic over a number that never moved no matter
  // what you spent. Commitments, buffer and payday are still placeholders, but they live in
  // one file now rather than disagreeing across two screens — see lib/commitments.ts.
  const balanceMinor = useQuery(liquidBalanceMinor)
  const sts = safeToSpend({
    liquidBalance: money(balanceMinor, 'INR'),
    committedBills: committedBills(),
    pendingSweeps: [],
    safetyBuffer: SAFETY_BUFFER,
    rawCarryover: money(0, 'INR'),
    spentToday,
    today: now,
    nextIncomeAt: now + DAYS_TO_PAYDAY * DAY,
  })

  const allowance = Math.max(1, sts.baseDaily.minor + sts.carryover.minor)
  const usedPct = Math.min(100, Math.max(0, (spentToday.minor / allowance) * 100))
  // Money, not chrome — deliberately not called `accent` any more, now that the word means
  // the green. The dial takes the temperature of what it is showing.
  const dialColour = sts.overspent ? colors.warn : colors.inr
  const [showNumbers, setShowNumbers] = useState(false)

  const hour = new Date(now).getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  // The same 90-day window the Reckoning reads, on purpose: a count here that disagrees with
  // what you find when you tap it is worse than no count.
  const ratable = useQuery(() => ratableSpend(90))
  const scores = useQuery(worthScores)
  const toRate = ratingQueue(ratable, scores, now).length

  /**
   * Facts are computed here and formatted here; the narrator receives strings only, so it
   * cannot round, restate or invent a figure. Weight is how much each deserves the single
   * slot the companion allows.
   */
  const facts: Fact[] = []
  if (entries.length >= 2) {
    // Two charges from the same merchant on the same day is the most actionable thing a
    // ledger can surface, so it outranks everything else when it happens.
    const byMerchant = new Map<string, typeof entries>()
    for (const e of entries) {
      byMerchant.set(e.merchant, [...(byMerchant.get(e.merchant) ?? []), e])
    }
    for (const [merchant, group] of byMerchant) {
      const pair = group.find((a, i) => group.some((b, j) => j > i && b.amount.minor === a.amount.minor))
      if (pair) {
        facts.push({
          theme: 'duplicate',
          weight: 0.95,
          values: {
            merchant,
            first: 'today',
            second: 'today',
            amount: format(pair.amount),
          },
        })
        break
      }
    }
  }
  facts.push({
    theme: 'steady',
    weight: 0.3,
    values: {
      days: String(sts.daysUntilIncome),
      room: format(sts.amount, { compactZeroFraction: true }),
    },
  })

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        {/* Words first. The figures are one tap below, never removed — a sentence answers
            "should I care", which is the question being asked in a queue. */}
        <Companion
          greeting={greeting}
          amount={sts.amount}
          daysToIncome={sts.daysUntilIncome}
          spentToday={spentToday}
          facts={facts}
          hour={new Date(now).getHours()}
          signals={{
            roomMinor: sts.amount.minor,
            spendMinor: spentToday.minor,
            incomeMinor: 0,
            consecutiveNegativeDays: 0,
          }}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showNumbers }}
          onPress={() => setShowNumbers((v) => !v)}
          style={s.disclosure}
        >
          <Text style={s.disclosureText}>
            {showNumbers ? 'Hide the numbers' : 'Show me the numbers'}
          </Text>
        </Pressable>

        {showNumbers && (
          <View style={s.hero}>
            <View style={s.dialWrap}>
              <DayDial progress={usedPct / 100} overspent={sts.overspent}>
                <Text style={s.heroLabel}>You&apos;ve got</Text>
                <Text
                  style={[s.heroAmount, { color: dialColour }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  accessibilityLabel={`${format(sts.amount)} left for today`}
                >
                  {format(sts.amount, { compactZeroFraction: true })}
                </Text>
                <Text style={s.heroHint}>{sts.daysUntilIncome} days to payday</Text>
              </DayDial>
            </View>

            <View style={s.meterRow}>
              <Text style={s.meterText}>{format(spentToday)} spent</Text>
              <Text style={s.meterText}>
                {format(sts.baseDaily, { compactZeroFraction: true })}/day
              </Text>
            </View>
          </View>
        )}

        {/* Navigation, not an observation — the Companion above still owns the one thing the
            screen is allowed to say. This appears only when there is something to answer, so
            it is a count rather than a permanent entry that teaches you to skip it. */}
        {toRate > 0 && (
          <Link href="/reckoning" asChild>
            <Pressable accessibilityRole="button" style={s.disclosure}>
              <Text style={s.disclosureText}>
                {toRate} to look back on — was it worth it?
              </Text>
            </Pressable>
          </Link>
        )}

        <Text style={s.section}>Today&apos;s ledger</Text>
        <View style={s.card}>
          {entries.length > 0 ? (
            entries.map((t, i) => (
              <View key={t.id} style={[s.row, i === 0 && s.rowFirst]}>
                <View style={s.rowLeft}>
                  <View
                    style={[s.dot, { backgroundColor: t.currency === 'AED' ? colors.aed : colors.inr }]}
                  />
                  <View style={s.rowText}>
                    <Text style={s.rowName} numberOfLines={1}>
                      {t.merchant}
                    </Text>
                    <Text style={s.rowMeta}>{t.category}</Text>
                  </View>
                </View>
                <Text style={s.rowAmount}>{format(t.amount)}</Text>
              </View>
            ))
          ) : (
            // Empty states are invitations, not apologies.
            <Text style={s.empty}>Nothing logged yet. Tap the bar and type what you spent.</Text>
          )}
        </View>
      </ScrollView>

      {/* Thumb zone. Capture is the product; it does not live behind a menu.
          Typing stays the primary action and the camera sits beside it — a receipt photo
          still needs confirming, so it is a shortcut into the same flow rather than a
          different one. */}
      <View style={s.captureRow}>
        <Link href="/add" asChild>
          <Pressable style={s.capture} accessibilityRole="button" accessibilityLabel="Add a transaction">
            <Plus color={colors['surface-0']} size={18} />
            <Text style={s.captureText}>Add what you spent</Text>
          </Pressable>
        </Link>
        <Link href="/receipt" asChild>
          <Pressable
            style={s.captureCamera}
            accessibilityRole="button"
            accessibilityLabel="Photograph a receipt"
          >
            <Camera color={colors['text-hi']} size={20} />
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  )
}

const styles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c['surface-0'] },
    content: { padding: space[5], paddingBottom: space[16], gap: space[3] },

    eyebrow: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },

    dialWrap: { alignItems: 'center', paddingVertical: space[2] },
    disclosure: { alignSelf: 'flex-start', paddingVertical: space[2] },
    disclosureText: {
      color: c['text-lo'],
      fontFamily: font.bodyMedium,
      fontSize: 13,
      textDecorationLine: 'underline',
    },
    hero: {
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: 1,
      borderRadius: radius.xl,
      padding: space[5],
      gap: space[2],
    },
    heroLabel: { color: c['text-lo'], fontFamily: font.body, fontSize: 14 },
    heroAmount: {
      fontFamily: font.displayBold,
      fontSize: 52,
      letterSpacing: -1.5,
      fontVariant: ['tabular-nums'],
    },
    heroHint: { color: c['text-lo'], fontFamily: font.body, fontSize: 13 },

    meterTrack: {
      height: 6,
      borderRadius: radius.full,
      backgroundColor: c['surface-2'],
      overflow: 'hidden',
      marginTop: space[2],
    },
    meterFill: { height: '100%', borderRadius: radius.full },
    meterRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
    meterText: {
      color: c['text-lo'],
      fontFamily: font.mono,
      fontSize: 11,
      fontVariant: ['tabular-nums'],
    },

    section: {
      color: c['text-lo'],
      fontFamily: font.bodyMedium,
      fontSize: 13,
      marginTop: space[3],
    },

    card: {
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: space[4],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopColor: c.line,
      borderTopWidth: 1,
      paddingVertical: space[3],
      gap: space[3],
    },
    rowFirst: { borderTopWidth: 0 },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: space[3], flexShrink: 1 },
    dot: { width: 6, height: 6, borderRadius: radius.full },
    rowText: { flexShrink: 1 },
    rowName: { color: c['text-hi'], fontFamily: font.body, fontSize: 15 },
    rowMeta: { color: c['text-lo'], fontFamily: font.body, fontSize: 12, marginTop: 1 },
    rowAmount: {
      color: c['text-hi'],
      fontFamily: font.monoMedium,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },

    empty: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 14,
      paddingVertical: space[6],
      textAlign: 'center',
    },

    // The ROW is what floats now. Leaving `capture` absolute and wrapping it in a flex row
    // would have laid the camera out underneath it, invisible.
    captureRow: {
      position: 'absolute',
      left: space[5],
      right: space[5],
      bottom: space[5],
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    captureCamera: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 52,
      height: 52,
      borderRadius: radius.full,
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
    },
    capture: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[2],
      backgroundColor: c.accent,
      borderRadius: radius.full,
      paddingVertical: space[4],
    },
    captureText: { color: c['accent-ink'], fontFamily: font.bodyMedium, fontSize: 15 },
  })
