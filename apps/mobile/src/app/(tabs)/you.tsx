import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Link } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { format, money } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { countSpend, listAccounts, listCategories, useQuery } from '@/db'
import { WalletCount } from '@/components/WalletCount'
import { COMMITMENTS } from '@/lib/commitments'
import { AppLockToggle } from '@/components/AppLockToggle'
import { LanguageChoice, LedgerRow, NavRow, Row, ThemeChoice } from '@/components/ui'
import { useLocale } from '@/lib/locale'


export default function YouScreen() {
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
  const { colors, scheme } = useTheme()
  const s = styles(colors)
  // The one screen that owns the language control is the one screen that must prove it works.
  const { t } = useLocale()

  const accounts = useQuery(listAccounts)
  const rowCount = useQuery(countSpend)
  const categories = useQuery(listCategories)
  // Where a wallet count's difference lands. 'Uncategorised' if the seed has one, else the
  // first category — the row is named "Uncategorised cash" either way, so the guess stays
  // visible rather than being laundered into a confident category.
  const cashCategoryId =
    categories.find((c) => /misc|other|uncategor/i.test(c.name))?.id ?? categories[0]?.id ?? ''

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>You</Text>

        {cashCategoryId !== '' && <WalletCount categoryId={cashCategoryId} />}

        <Link href="/reckoning" asChild>
          <NavRow title="The Reckoning" hint="Was it worth it? The one question a statement cannot answer" style={s.navSpacing} />
        </Link>

        <Link href="/split" asChild>
          <NavRow title="Split &amp; settle up" hint="Who owes you, and the fewest payments that clear it" style={s.navSpacing} />
        </Link>

        <Link href="/import" asChild>
          <NavRow title="Import a statement" hint="A bank CSV, read on device and shown before it lands" style={s.navSpacing} />
        </Link>

        <Link href="/numbers" asChild>
          <NavRow title="Numbers" hint="What repeats, what changed, and which days were unusual" style={s.navSpacing} />
        </Link>

        <Link href="/trip" asChild>
          <NavRow title="Plan a trip" hint="What it would cost you, built from your own habits" style={s.navSpacing} />
        </Link>

        <Link href="/goals" asChild>
          <NavRow title="Goals" hint="Targets measured against what is actually left over" style={s.navSpacing} />
        </Link>

        <Text style={s.section}>{t('you.accounts')}</Text>
        <View style={s.card}>
          {accounts.map((a, i) => (
            <Row key={a.id} first={i === 0}>
              <LedgerRow
                name={a.name}
                meta={a.kind}
                amount={format(money(a.opening_minor, a.currency))}
                dotColor={a.currency === 'AED' ? colors.aed : colors.inr}
              />
            </Row>
          ))}
        </View>

        <Text style={s.section}>{t('you.committed')}</Text>
        <View style={s.card}>
          {COMMITMENTS.map((u, i) => (
            <View key={u.label} style={[s.row, i === 0 && s.rowFirst]}>
              <View style={s.rowText}>
                <Text style={s.rowName}>{u.label}</Text>
                <Text style={s.rowMeta}>{u.when}</Text>
              </View>
              <Text style={s.rowAmount}>{format(money(u.minor, u.currency))}</Text>
            </View>
          ))}
        </View>

        <Text style={s.section}>{t('you.appearance')}</Text>
        <ThemeChoice />

        <Text style={s.section}>{t('you.language')}</Text>
        <LanguageChoice />

        <Text style={s.section}>{t('privacy.title')}</Text>
        <AppLockToggle />

        <Link href="/privacy" asChild>
          <NavRow title="What this app knows" hint="Every row it holds, how long it keeps it, and how to take it or delete it" style={s.navSpacing} />
        </Link>

        <Text style={s.section}>{t('you.about')}</Text>
        <View style={s.card}>
          <View style={[s.row, s.rowFirst]}>
            <Text style={s.rowName}>Transactions on device</Text>
            <Text style={s.rowAmount}>{rowCount.toLocaleString('en-IN')}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowName}>Theme</Text>
            <Text style={s.rowAmount}>{scheme}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowName}>{t('you.homeCurrency')}</Text>
            <Text style={s.rowAmount}>INR</Text>
          </View>
        </View>

        <Text style={s.footnote}>
          These rows come from SQLite on this device, not from a server. The app is fully
          functional with the network unreachable — airplane mode is a supported state, not a
          degraded one. Editing accounts and budgets arrives with the settings work.
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

    navSpacing: { marginTop: space[2] },
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
      writingDirection: 'ltr',
    },

    footnote: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 12,
      lineHeight: 18,
      marginTop: space[5],
    },
  })
