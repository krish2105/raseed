import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Link } from 'expo-router'
import { Plus } from 'lucide-react-native'

import { safeToSpend } from '@raseed/engines'
import { format, fromMajor } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { spendBetween, spendTotal, useQuery } from '@/db'
import { useNow } from '@/hooks/useNow'
import { DayDial } from '@/components/DayDial'

const DAY = 86_400_000

/**
 * Today. One number, the day's ledger beneath it, capture pinned to the thumb zone.
 *
 * The Skia Day Dial replaces the flat meter at Session 9; the arithmetic is already the
 * real `safeToSpend` engine reading real rows out of SQLite.
 */
export default function TodayScreen() {
  const { colors } = useTheme()
  const s = styles(colors)

  const now = useNow()
  const startOfToday = Math.floor(now / DAY) * DAY
  const entries = useQuery(() => spendBetween(startOfToday, startOfToday + DAY))
  const spentToday = useQuery(() => spendTotal(startOfToday, startOfToday + DAY))

  // Balances and bills become editable rows in `You` at a later session; the figures below
  // are the only remaining hardcoded inputs on this screen.
  const sts = safeToSpend({
    liquidBalance: fromMajor('96000.00', 'INR'),
    committedBills: [fromMajor('22000.00', 'INR')],
    pendingSweeps: [fromMajor('4000.00', 'INR')],
    safetyBuffer: fromMajor('3000.00', 'INR'),
    rawCarryover: fromMajor('310.00', 'INR'),
    spentToday,
    today: now,
    nextIncomeAt: now + 9 * DAY,
  })

  const allowance = Math.max(1, sts.baseDaily.minor + sts.carryover.minor)
  const usedPct = Math.min(100, Math.max(0, (spentToday.minor / allowance) * 100))
  const accent = sts.overspent ? colors.warn : colors.inr

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.eyebrow}>Today</Text>

        <View style={s.hero}>
          <View style={s.dialWrap}>
            <DayDial progress={usedPct / 100} overspent={sts.overspent}>
              <Text style={s.heroLabel}>You&apos;ve got</Text>
              <Text
                style={[s.heroAmount, { color: accent }]}
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

      {/* Thumb zone. Capture is the product; it does not live behind a menu. */}
      <Link href="/add" asChild>
        <Pressable style={s.capture} accessibilityRole="button" accessibilityLabel="Add a transaction">
          <Plus color={colors['surface-0']} size={18} />
          <Text style={s.captureText}>Add what you spent</Text>
        </Pressable>
      </Link>
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

    capture: {
      position: 'absolute',
      left: space[5],
      right: space[5],
      bottom: space[5],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[2],
      backgroundColor: c['text-hi'],
      borderRadius: radius.full,
      paddingVertical: space[4],
    },
    captureText: { color: c['surface-0'], fontFamily: font.bodyMedium, fontSize: 15 },
  })
