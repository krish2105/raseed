import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { safeToSpend } from '@raseed/engines'
import { format, fromMajor } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { DEMO_NOW, todaySpend, todaysLedger } from '@/lib/demo'

/**
 * Today. One number, the day's ledger beneath it.
 *
 * The Skia Day Dial replaces the flat meter at Session 9. The arithmetic behind the number
 * is already the real `safeToSpend` engine, not a mock.
 */
const sts = safeToSpend({
  liquidBalance: fromMajor('42000.00', 'INR'),
  committedBills: [fromMajor('22000.00', 'INR')],
  pendingSweeps: [fromMajor('4000.00', 'INR')],
  safetyBuffer: fromMajor('3000.00', 'INR'),
  rawCarryover: fromMajor('310.00', 'INR'),
  spentToday: todaySpend,
  today: DEMO_NOW,
  nextIncomeAt: DEMO_NOW + 9 * 86_400_000,
})

const allowance = Math.max(1, sts.baseDaily.minor + sts.carryover.minor)
const usedPct = Math.min(100, Math.max(0, (todaySpend.minor / allowance) * 100))

export default function TodayScreen() {
  const { colors } = useTheme()
  const s = styles(colors)
  const accent = sts.overspent ? colors.warn : colors.inr

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.eyebrow}>Today</Text>

        {/* The single job of this screen: what you can spend, in the currency you are in. */}
        <View style={s.hero}>
          <Text style={s.heroLabel}>You&apos;ve got</Text>
          <Text style={[s.heroAmount, { color: accent }]}>
            {format(sts.amount, { compactZeroFraction: true })}
          </Text>
          <Text style={s.heroHint}>for today · {sts.daysUntilIncome} days to payday</Text>

          <View style={s.meterTrack}>
            <View style={[s.meterFill, { backgroundColor: accent, width: `${usedPct}%` }]} />
          </View>
          <View style={s.meterRow}>
            <Text style={s.meterText}>{format(todaySpend)} spent</Text>
            <Text style={s.meterText}>
              {format(sts.baseDaily, { compactZeroFraction: true })}/day
            </Text>
          </View>
        </View>

        <Text style={s.section}>Today&apos;s ledger</Text>
        <View style={s.card}>
          {todaysLedger.length > 0 ? (
            todaysLedger.map((t, i) => (
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

        <View style={s.captureStub}>
          <Text style={s.captureText}>chai 20, auto 80, bigbasket 640</Text>
          <Text style={s.captureHint}>Capture arrives in session 11</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c['surface-0'] },
    content: { padding: space[5], paddingBottom: space[10], gap: space[3] },

    eyebrow: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
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

    captureStub: {
      marginTop: space[4],
      borderColor: c.line,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderRadius: radius.lg,
      padding: space[4],
      gap: space[1],
    },
    captureText: { color: c['text-lo'], fontFamily: font.mono, fontSize: 13 },
    captureHint: { color: c['text-lo'], fontFamily: font.body, fontSize: 11, opacity: 0.7 },
  })
