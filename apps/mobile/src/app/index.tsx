import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { aiPlaceholder } from '@raseed/ai'
import { enginesPlaceholder } from '@raseed/engines'
import { fixturesPlaceholder } from '@raseed/fixtures'
import { formatMinor } from '@raseed/money'
import { schemaPlaceholder } from '@raseed/schema'
import { tokensPlaceholder } from '@raseed/tokens'

// Same six imports as apps/web, same formatMinor call. If Metro could not resolve a
// workspace package, this screen would not bundle.
const packages = [
  { name: '@raseed/money', value: formatMinor(74000, 'INR') },
  { name: '@raseed/tokens', value: tokensPlaceholder() },
  { name: '@raseed/schema', value: schemaPlaceholder() },
  { name: '@raseed/engines', value: enginesPlaceholder() },
  { name: '@raseed/ai', value: aiPlaceholder() },
  { name: '@raseed/fixtures', value: fixturesPlaceholder() },
]

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>RASEED</Text>
        <Text style={styles.subtitle}>Session 0 — monorepo scaffold</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Safe to spend today</Text>
          <Text style={[styles.amount, styles.inr]}>{formatMinor(74000, 'INR')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Safe to spend today</Text>
          <Text style={[styles.amount, styles.aed]}>{formatMinor(9250, 'AED')}</Text>
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

// Hex lives here only because @raseed/tokens is a placeholder until Session 1.
// Values copied from MOBILE_ARCHITECTURE.md §6 so the swap is a substitution.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F1419' },
  content: { padding: 20, gap: 12 },
  title: { color: '#E8EDF2', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#8B98A5', fontSize: 14, marginBottom: 12 },
  card: {
    backgroundColor: '#171D24',
    borderColor: '#2C353F',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  label: { color: '#8B98A5', fontSize: 13 },
  amount: { fontSize: 30, fontWeight: '600', fontVariant: ['tabular-nums'] },
  inr: { color: '#E0A458' },
  aed: { color: '#4FB0A5' },
  section: { color: '#8B98A5', fontSize: 13, marginTop: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomColor: '#2C353F',
    borderBottomWidth: 1,
    paddingVertical: 10,
    gap: 12,
  },
  rowName: { color: '#E8EDF2', fontSize: 13 },
  rowValue: { color: '#8B98A5', fontSize: 13, fontVariant: ['tabular-nums'] },
})
