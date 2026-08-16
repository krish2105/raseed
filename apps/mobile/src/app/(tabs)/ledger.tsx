import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'

import { format } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { countSpend, recentSpend, useQuery, type LedgerEntry } from '@/db'

/**
 * Receipt-styled history: right-aligned tabular numerals, a hairline rule between days.
 * Search and filters arrive with the real database at Session 7.
 */
const DAY = 86_400_000

function buildSections(rows: readonly LedgerEntry[]) {
  const byDay = new Map<number, LedgerEntry[]>()
  for (const row of rows) {
    const day = Math.floor(row.occurredAt / DAY)
    const list = byDay.get(day)
    if (list) list.push(row)
    else byDay.set(day, [row])
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([day, data]) => ({
      title: new Date(day * DAY).toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
      data,
    }))
}

export default function LedgerScreen() {
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

  const entries = useQuery(() => recentSpend(200))
  const total = useQuery(countSpend)
  const sections = buildSections(entries)

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Ledger</Text>
        <Text style={s.subtitle}>{total.toLocaleString('en-IN')} confirmed spend rows</Text>
      </View>

      <SectionList
        sections={sections}
        ListEmptyComponent={
          <Text style={s.empty}>
            Nothing here yet. Add what you spent from the Today tab.
          </Text>
        }
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={s.dayHeader}>
            <Text style={s.dayTitle}>{section.title}</Text>
            <Text style={s.dayTotal}>{section.data.length} items</Text>
          </View>
        )}
        renderItem={({ item }) => (
          // The whole row opens the editor. A transaction you cannot correct is one you learn
          // to distrust, and P1's own done-when has always included edit and delete.
          <Pressable
            style={s.row}
            onPress={() => router.push({ pathname: '/edit', params: { id: item.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.merchant}, ${format(item.amount)}`}
          >
            <View style={s.rowLeft}>
              <View
                style={[s.dot, { backgroundColor: item.currency === 'AED' ? colors.aed : colors.inr }]}
              />
              <View style={s.rowText}>
                <Text style={s.rowName} numberOfLines={1}>
                  {item.merchant}
                </Text>
                <Text style={s.rowMeta}>{item.category}</Text>
              </View>
            </View>
            <Text style={s.rowAmount}>{format(item.amount)}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  )
}

const styles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c['surface-0'] },
    header: { paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: space[2] },
    title: { color: c['text-hi'], fontFamily: font.displayBold, fontSize: 28, letterSpacing: -0.5 },
    subtitle: { color: c['text-lo'], fontFamily: font.body, fontSize: 13, marginTop: 2 },

    list: { paddingHorizontal: space[5], paddingBottom: space[10] },

    dayHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginTop: space[5],
      marginBottom: space[1],
    },
    dayTitle: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 13 },
    dayTotal: { color: c['text-lo'], fontFamily: font.mono, fontSize: 11 },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomColor: c.line,
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingVertical: space[3],
      gap: space[3],
    },
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
      textAlign: 'center',
      paddingVertical: space[10],
    },
  })
