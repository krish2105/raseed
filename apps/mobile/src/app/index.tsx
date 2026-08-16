import { ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { aiPlaceholder } from '@raseed/ai'
import { safeToSpend } from '@raseed/engines'
import { fixturesPlaceholder } from '@raseed/fixtures'
import { allocate, format, formatMinor, fromMajor } from '@raseed/money'
import { schemaPlaceholder } from '@raseed/schema'
import { fontFamily, palette, radius, space, type Palette } from '@raseed/tokens'

const sts = safeToSpend({
  liquidBalance: fromMajor('30000.00', 'INR'),
  committedBills: [fromMajor('12000.00', 'INR')],
  pendingSweeps: [fromMajor('2000.00', 'INR')],
  safetyBuffer: fromMajor('3000.00', 'INR'),
  rawCarryover: fromMajor('400.00', 'INR'),
  spentToday: fromMajor('260.00', 'INR'),
  today: 1_755_300_000_000,
  nextIncomeAt: 1_755_300_000_000 + 10 * 86_400_000,
})

const inr = sts.amount
const aed = fromMajor('92.50', 'AED')
const split = allocate(fromMajor('1.00', 'INR'), 3)

const packages = [
  { name: '@raseed/money', value: formatMinor(inr) },
  { name: '@raseed/tokens', value: fontFamily.display },
  { name: '@raseed/schema', value: schemaPlaceholder() },
  { name: '@raseed/engines', value: `STS ${formatMinor(sts.amount)}` },
  { name: '@raseed/ai', value: aiPlaceholder() },
  { name: '@raseed/fixtures', value: fixturesPlaceholder() },
]

export default function HomeScreen() {
  // Colours come from @raseed/tokens, resolved per theme. No hex literal in this file.
  const scheme = useColorScheme()
  const t = palette[scheme === 'light' ? 'light' : 'dark']
  const styles = makeStyles(t)

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>RASEED</Text>
        <Text style={styles.subtitle}>Session 1 — money and tokens</Text>

        <View style={styles.card}>
          <View style={[styles.edge, { backgroundColor: t.inr }]} />
          <Text style={styles.label}>Safe to spend today</Text>
          <Text style={[styles.amount, { color: t.inr }]}>{format(inr)}</Text>
        </View>

        <View style={styles.card}>
          <View style={[styles.edge, { backgroundColor: t.aed }]} />
          <Text style={styles.label}>Safe to spend today</Text>
          <Text style={[styles.amount, { color: t.aed }]}>{format(aed)}</Text>
        </View>

        <Text style={styles.section}>Splitting ₹1.00 three ways</Text>
        <View style={styles.chips}>
          {split.map((part, i) => (
            <View key={i} style={styles.chip}>
              <Text style={styles.chipText}>{format(part)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.section}>Shared packages resolved</Text>
        {packages.map((pkg) => (
          <View key={pkg.name} style={styles.row}>
            <Text style={styles.rowName}>{pkg.name}</Text>
            <Text style={styles.rowValue}>{pkg.value}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

function makeStyles(t: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: t['surface-0'] },
    content: { padding: space[5], gap: space[3] },
    title: { color: t['text-hi'], fontSize: 28, fontWeight: '700' },
    subtitle: { color: t['text-lo'], fontSize: 14, marginBottom: space[3] },
    card: {
      backgroundColor: t['surface-1'],
      borderColor: t.line,
      borderWidth: 1,
      borderRadius: radius.lg,
      padding: space[4],
      gap: space[1],
      overflow: 'hidden',
    },
    edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2 },
    label: { color: t['text-lo'], fontSize: 13 },
    amount: { fontSize: 30, fontWeight: '600', fontVariant: ['tabular-nums'] },
    section: { color: t['text-lo'], fontSize: 13, marginTop: space[4] },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    chip: {
      backgroundColor: t['surface-2'],
      borderColor: t.line,
      borderWidth: 1,
      borderRadius: radius.sm,
      paddingHorizontal: space[2],
      paddingVertical: space[1],
    },
    chipText: { color: t['text-hi'], fontSize: 13, fontVariant: ['tabular-nums'] },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottomColor: t.line,
      borderBottomWidth: 1,
      paddingVertical: space[3],
      gap: space[3],
    },
    rowName: { color: t['text-hi'], fontSize: 13 },
    rowValue: { color: t['text-lo'], fontSize: 13, fontVariant: ['tabular-nums'] },
  })
}
