import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { format, money } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { months, totalRows } from '@/lib/demo'

const ACCOUNTS = [
  { name: 'HDFC Savings', kind: 'bank', currency: 'INR' as const, balanceMinor: 4_200_000 },
  { name: 'Emirates NBD', kind: 'bank', currency: 'AED' as const, balanceMinor: 1_240_000 },
  { name: 'Wallet', kind: 'cash', currency: 'INR' as const, balanceMinor: 265_000 },
]

const UPCOMING = [
  { label: 'Rent', when: 'in 3 days', currency: 'INR' as const, minor: 2_200_000 },
  { label: 'Netflix', when: 'in 11 days', currency: 'INR' as const, minor: 79_900 },
  { label: 'Jio', when: 'in 14 days', currency: 'INR' as const, minor: 39_900 },
]

export default function YouScreen() {
  const { colors, scheme } = useTheme()
  const s = styles(colors)

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>You</Text>

        <Text style={s.section}>Accounts</Text>
        <View style={s.card}>
          {ACCOUNTS.map((a, i) => (
            <View key={a.name} style={[s.row, i === 0 && s.rowFirst]}>
              <View style={s.rowLeft}>
                <View
                  style={[s.dot, { backgroundColor: a.currency === 'AED' ? colors.aed : colors.inr }]}
                />
                <View style={s.rowText}>
                  <Text style={s.rowName}>{a.name}</Text>
                  <Text style={s.rowMeta}>{a.kind}</Text>
                </View>
              </View>
              <Text style={s.rowAmount}>{format(money(a.balanceMinor, a.currency))}</Text>
            </View>
          ))}
        </View>

        <Text style={s.section}>Committed, before payday</Text>
        <View style={s.card}>
          {UPCOMING.map((u, i) => (
            <View key={u.label} style={[s.row, i === 0 && s.rowFirst]}>
              <View style={s.rowText}>
                <Text style={s.rowName}>{u.label}</Text>
                <Text style={s.rowMeta}>{u.when}</Text>
              </View>
              <Text style={s.rowAmount}>{format(money(u.minor, u.currency))}</Text>
            </View>
          ))}
        </View>

        <Text style={s.section}>About</Text>
        <View style={s.card}>
          <View style={[s.row, s.rowFirst]}>
            <Text style={s.rowName}>Demo ledger</Text>
            <Text style={s.rowAmount}>
              {totalRows.toLocaleString('en-IN')} rows · {months}mo
            </Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowName}>Theme</Text>
            <Text style={s.rowAmount}>{scheme} (follows system)</Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowName}>Home currency</Text>
            <Text style={s.rowAmount}>INR</Text>
          </View>
        </View>

        <Text style={s.footnote}>
          Accounts, budgets and goals become editable when the database lands in session 7.
          Everything above already reads through @raseed/money — no float touches an amount.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c['surface-0'] },
    content: { padding: space[5], paddingBottom: space[10], gap: space[2] },
    title: { color: c['text-hi'], fontFamily: font.displayBold, fontSize: 28, letterSpacing: -0.5 },

    section: {
      color: c['text-lo'],
      fontFamily: font.bodyMedium,
      fontSize: 13,
      marginTop: space[4],
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
      fontSize: 14,
      fontVariant: ['tabular-nums'],
    },

    footnote: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 12,
      lineHeight: 18,
      marginTop: space[5],
    },
  })
