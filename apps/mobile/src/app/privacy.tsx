import { useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'

import { DEFAULT_RETENTION, dataCategories, purgePlan } from '@raseed/engines'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { useNow } from '@/hooks/useNow'
import { Badge, PrimaryButton, SecondaryButton } from '@/components/ui'
import {
  deleteEverything,
  encryptionMigration,
  encryptionState,
  notifyChanged,
  purgeExpired,
  recentSpend,
  seed,
  storedCounts,
  useQuery,
} from '@/db'
import { useConsent, withdrawAllConsent } from '@/lib/consent'
import { fromLedger, shareExport, toCsv, toJson } from '@/lib/exportLedger'

/**
 * The privacy dashboard (S9).
 *
 * Four rights in one place — **know, take, correct, delete** — and one rule about how they are
 * presented: every claim on this screen is read from the device at render, not written into the
 * copy. The row counts are counted. The encryption state asks the compiled binary. The retention
 * windows come from the policy the purge actually uses. A privacy page that states its promises
 * in prose is a page that can be true on the day it was written and wrong ever after.
 */
export default function PrivacyScreen() {
  /** Reads the ledger; the compiler would otherwise serve the pre-write state for ever. */
  'use no memo'

  const { colors } = useTheme()
  const s = styles(colors)
  const now = useNow()

  const counts = useQuery(storedCounts)
  const entries = useQuery(() => recentSpend(100_000))
  const { consent, setConsent } = useConsent()
  const [busy, setBusy] = useState(false)

  const encryption = encryptionState()
  const migration = encryptionMigration()
  const categories = dataCategories(DEFAULT_RETENTION)

  async function exportAs(kind: 'csv' | 'json') {
    setBusy(true)
    try {
      const rows = fromLedger(entries)
      const stamp = new Date(now).toISOString().slice(0, 10)
      await (kind === 'csv'
        ? shareExport(toCsv(rows), `raseed-${stamp}.csv`, 'text/csv')
        : shareExport(toJson(rows, now), `raseed-${stamp}.json`, 'application/json'))
    } finally {
      setBusy(false)
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Delete everything?',
      'Every transaction, person, split, rating and capture on this device is removed. This cannot be undone, and there is no copy anywhere else — export first if you want one.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => {
            deleteEverything()
            withdrawAllConsent(Date.now())
            // Reference data comes back so the app is usable rather than broken. What does not
            // come back is anything you entered, which is the whole point.
            seed()
            notifyChanged()
          },
        },
      ],
    )
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={s.back}>Back</Text>
        </Pressable>
        <Text style={s.title}>Privacy</Text>
        <View style={s.spacer} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* ── what is true about the file on disk ────────────────────────── */}
        {encryption === 'encrypted' ? (
          <Badge>Database encrypted on this device</Badge>
        ) : (
          <Badge tone="warn">
            {encryption === 'unavailable'
              ? 'This build does not encrypt the database'
              : 'Encryption is available but the keychain gave no key'}
          </Badge>
        )}

        <Text style={s.lede}>
          Everything below is read from this device as the screen renders — the counts are
          counted, and the encryption state is what the compiled database says it is rather than
          what a setting claims. Nothing here is a promise typed into the copy.
        </Text>

        {migration.status === 'migrated' && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Your ledger was moved into the encrypted database</Text>
            <Text style={s.note}>
              Every table was counted on both sides before the old file was deleted. The old
              unencrypted file is gone, not emptied.
            </Text>
          </View>
        )}

        {/* ── what is stored ────────────────────────────────────────────── */}
        <Text style={s.section}>What is stored</Text>
        {categories.map((c) => (
          <View key={c.key} style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>{c.label}</Text>
              {c.table !== null && counts[c.table] !== undefined && (
                <Text style={s.count}>{counts[c.table]!.toLocaleString('en-IN')}</Text>
              )}
            </View>
            <Text style={s.note}>{c.what}</Text>
            <Text style={s.retention}>{c.retention}</Text>
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const removed = purgeExpired(purgePlan(now))
            notifyChanged()
            Alert.alert(
              'Purged',
              `${removed.captureLog} capture rows and ${removed.nudges} nudge rows were past their retention window and have been deleted.`,
            )
          }}
          style={s.inline}
        >
          <Text style={s.inlineText}>Purge anything past its window now</Text>
        </Pressable>

        {/* ── consent ───────────────────────────────────────────────────── */}
        <Text style={s.section}>What you have agreed to</Text>
        <View style={s.card}>
          <View style={s.consentRow}>
            <View style={s.consentText}>
              <Text style={s.cardTitle}>Lifestyle observations</Text>
              <Text style={s.note}>
                Lets the app comment on patterns beyond the arithmetic. Off unless you turn it
                on, and suspended entirely while the app is in supportive mode — inferring
                something health-adjacent from spending creates sensitive data whether or not
                you ever mentioned it.
              </Text>
            </View>
            <Switch
              value={consent.lifestyle.granted}
              onValueChange={(v) => setConsent('lifestyle', v, Date.now())}
              trackColor={{ true: colors.accent, false: colors['surface-2'] }}
              accessibilityLabel="Lifestyle observations"
            />
          </View>
          {consent.lifestyle.at !== null && (
            <Text style={s.stamp}>
              {consent.lifestyle.granted ? 'Granted' : 'Withdrawn'}{' '}
              {new Date(consent.lifestyle.at).toLocaleString('en-IN')} · wording v
              {consent.lifestyle.version}
            </Text>
          )}
        </View>

        <View style={s.card}>
          <View style={s.consentRow}>
            <View style={s.consentText}>
              <Text style={s.cardTitle}>Sync to a server</Text>
              <Text style={s.note}>
                Not available — there is no server, and no code in this app that could reach
                one. Listed rather than hidden so it can never be switched on by a migration.
              </Text>
            </View>
            <Switch value={false} disabled accessibilityLabel="Sync to a server, unavailable" />
          </View>
        </View>

        {/* ── take it with you ──────────────────────────────────────────── */}
        <Text style={s.section}>Take it with you</Text>
        <Text style={s.note}>
          {entries.length.toLocaleString('en-IN')} rows. Unfiltered on purpose: an export is your
          data rather than a view of it, so it includes rows the ledger screen hides.
        </Text>
        <View style={s.actions}>
          <View style={s.grow}>
            <PrimaryButton label="Export CSV" onPress={() => void exportAs('csv')} disabled={busy} />
          </View>
          <View style={s.grow}>
            <SecondaryButton
              label="Export JSON"
              onPress={() => void exportAs('json')}
              disabled={busy}
            />
          </View>
        </View>

        {/* ── delete ────────────────────────────────────────────────────── */}
        <Text style={s.section}>Delete</Text>
        <View style={s.card}>
          <Text style={s.note}>
            Removes every transaction, person, split, rating and capture from this device. There
            is no copy on a server to fall back on, because there is no server — so this is
            final, and the export above is the only backup there is.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={confirmDelete}
            style={[s.destructive, { borderColor: colors.warn }]}
          >
            <Text style={[s.destructiveText, { color: colors.warn }]}>Delete everything</Text>
          </Pressable>
        </View>

        <Text style={s.footnote}>
          No analytics, no crash reporting, no model, no server. The consent list above is short
          because there is genuinely little to consent to — and a list padded out with choices
          that do not exist is how consent screens became something nobody reads.
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
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    back: { color: c['text-lo'], fontFamily: font.body, fontSize: 15 },
    title: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 15 },
    spacer: { width: 40 },

    content: { padding: space[5], paddingBottom: space[12], gap: space[3] },
    lede: { color: c['text-lo'], fontFamily: font.body, fontSize: 13, lineHeight: 19 },
    section: {
      color: c['text-lo'],
      fontFamily: font.bodyMedium,
      fontSize: 12,
      marginTop: space[4],
    },

    card: {
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.lg,
      padding: space[4],
      gap: space[2],
    },
    cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    cardTitle: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 15 },
    count: {
      color: c['text-hi'],
      fontFamily: font.monoMedium,
      fontSize: 14,
      fontVariant: ['tabular-nums'],
    },
    note: { color: c['text-lo'], fontFamily: font.body, fontSize: 12, lineHeight: 18 },
    retention: { color: c['text-lo'], fontFamily: font.body, fontSize: 11, lineHeight: 17 },
    stamp: { color: c['text-lo'], fontFamily: font.mono, fontSize: 11 },

    consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
    consentText: { flex: 1, gap: space[1] },

    inline: { alignSelf: 'flex-start', paddingVertical: space[2] },
    inlineText: {
      color: c.accent,
      fontFamily: font.bodyMedium,
      fontSize: 13,
      textDecorationLine: 'underline',
    },

    actions: { flexDirection: 'row', gap: space[2] },
    grow: { flex: 1 },

    destructive: {
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.lg,
      paddingVertical: space[3],
      marginTop: space[2],
    },
    destructiveText: { fontFamily: font.bodyMedium, fontSize: 15 },

    footnote: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 11,
      lineHeight: 17,
      marginTop: space[5],
    },
  })
