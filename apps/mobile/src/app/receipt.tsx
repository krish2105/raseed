import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { extractTextFromImage, isSupported } from 'expo-text-extractor'

import { linesFromBlocks, parseReceipt, type ParsedReceipt } from '@raseed/engines'
import { format } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { commitAfterDismiss, insertTransaction, listAccounts, listCategories, useQuery } from '@/db'

const AED_TO_INR = 23.45

/**
 * Photograph a receipt.
 *
 * The text recognition is **Apple's Vision framework, on the device**. No key, no cost, and
 * the photograph never leaves the phone — which matters more here than anywhere else in the
 * app, because a receipt carries your card's last four digits, a location and a timestamp,
 * and sending that to a third party to save a few seconds of typing is a bad trade nobody
 * would knowingly make.
 *
 * **The parse proposes; you commit.** Every field is editable-by-rejection: if the
 * arithmetic on the bill does not reconcile, the screen says so and asks you to check rather
 * than quietly entering a number that is never questioned again.
 */
export default function ReceiptScreen() {
  /** See DECISIONS.md — the compiler memoises these reads and the store cannot be seen. */
  'use no memo'

  const { colors } = useTheme()
  const s = styles(colors)

  const accounts = useQuery(listAccounts)
  const categories = useQuery(listCategories)

  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null)
  const [rawLines, setRawLines] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  async function capture(from: 'camera' | 'library') {
    setError(null)

    // Permission is requested at the moment of use, not at launch. A permission sheet on
    // first open, before anyone knows what the app does, is how you get a "no" you can
    // never ask about again.
    const permission =
      from === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (!permission.granted) {
      setError(
        from === 'camera'
          ? 'Camera access is off. Settings → RASEED → Camera to turn it on.'
          : 'Photo access is off. Settings → RASEED → Photos to turn it on.',
      )
      return
    }

    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 1 })

    if (result.canceled || !result.assets[0]) return

    setBusy(true)
    try {
      const blocks = await extractTextFromImage(result.assets[0].uri)
      setRawLines(blocks)
      // Vision returns text BLOCKS, not rows: `2 x Butter Chicken` and `90.00` arrive
      // separately. `linesFromBlocks` puts each label back with its own price — without it
      // the parser reads the quantity as the amount, which is what the first real photo did.
      setReceipt(parseReceipt(linesFromBlocks(blocks).join('\n')))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read that image.')
    } finally {
      setBusy(false)
    }
  }

  function commit() {
    if (!receipt?.total) return
    const category =
      categories.find((c) => /eating|food/i.test(c.name))?.id ?? categories[0]?.id ?? ''
    const account =
      accounts.find((a) => a.currency === receipt.currency)?.id ?? accounts[0]?.id ?? ''

    const draft = {
      amount: receipt.total,
      accountId: account,
      categoryId: category,
      merchantText: receipt.merchant ?? 'Receipt',
      occurredAt: receipt.occurredAt ?? undefined,
      fxRate: receipt.currency === 'AED' ? AED_TO_INR : 1,
      note: receipt.reconciles
        ? `From a photo. ${receipt.lines.length} items, checked against the printed total.`
        : 'From a photo — the lines did not add up to the total, so check this one.',
    }

    router.back()
    commitAfterDismiss(() => insertTransaction(draft))
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={s.cancel}>Cancel</Text>
        </Pressable>
        <Text style={s.title}>Receipt</Text>
        <Pressable
          onPress={commit}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityState={{ disabled: !receipt?.total }}
        >
          <Text style={[s.save, !receipt?.total && s.saveDisabled]}>Save</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {!isSupported && (
          <Text style={s.warn}>
            This device cannot do on-device text recognition, so receipts have to be entered
            by hand here.
          </Text>
        )}

        <View style={s.actions}>
          <Pressable
            onPress={() => void capture('camera')}
            accessibilityRole="button"
            disabled={busy || !isSupported}
            style={[s.action, s.actionPrimary, (busy || !isSupported) && s.actionOff]}
          >
            <Text style={s.actionPrimaryText}>Take a photo</Text>
          </Pressable>
          <Pressable
            onPress={() => void capture('library')}
            accessibilityRole="button"
            disabled={busy || !isSupported}
            style={[s.action, (busy || !isSupported) && s.actionOff]}
          >
            <Text style={s.actionText}>Choose one</Text>
          </Pressable>
        </View>

        <Text style={s.privacy}>
          Read on this phone with Apple&apos;s own text recognition. The photo is never
          uploaded anywhere.
        </Text>

        {busy && (
          <View style={s.busy}>
            <ActivityIndicator color={colors.inr} />
            <Text style={s.busyText}>Reading…</Text>
          </View>
        )}

        {error && (
          <Text role="alert" style={s.warn}>
            {error}
          </Text>
        )}

        {receipt && (
          <>
            {/* The reconciliation is the headline, because it is the one signal that says
                whether any of the rest can be trusted. */}
            <View
              style={[
                s.verdict,
                { borderColor: receipt.reconciles ? colors.good : colors.warn },
              ]}
            >
              <Text
                style={[
                  s.verdictTitle,
                  { color: receipt.reconciles ? colors.good : colors.warn },
                ]}
              >
                {receipt.reconciles ? 'The bill adds up' : 'The bill does not add up'}
              </Text>
              <Text style={s.verdictBody}>
                {receipt.reconciles
                  ? 'Subtotal, tax, service and tip come to exactly the printed total, so this read is almost certainly right.'
                  : receipt.discrepancy
                    ? `Off by ${format(receipt.discrepancy)}. Something was misread — worth checking before saving.`
                    : 'Not enough was read to check it.'}
              </Text>
            </View>

            <View style={s.card}>
              {[
                { k: 'Merchant', v: receipt.merchant ?? 'not found' },
                {
                  k: 'Date',
                  v: receipt.occurredAt
                    ? new Date(receipt.occurredAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'not found',
                },
                { k: 'Subtotal', v: receipt.subtotal ? format(receipt.subtotal) : '—' },
                { k: 'Tax', v: receipt.tax ? format(receipt.tax) : '—' },
                { k: 'Service', v: receipt.serviceCharge ? format(receipt.serviceCharge) : '—' },
                { k: 'Tip', v: receipt.tip ? format(receipt.tip) : '—' },
                { k: 'Total', v: receipt.total ? format(receipt.total) : 'not found' },
              ].map((row, i) => (
                <View key={row.k} style={[s.row, i === 0 && s.rowFirst]}>
                  <Text style={s.rowKey}>{row.k}</Text>
                  <Text style={[s.rowValue, row.k === 'Total' && s.rowTotal]}>{row.v}</Text>
                </View>
              ))}
            </View>

            {receipt.lines.length > 0 && (
              <>
                <Text style={s.section}>{receipt.lines.length} items</Text>
                <View style={s.card}>
                  {receipt.lines.map((line, i) => (
                    <View key={`${line.description}-${i}`} style={[s.row, i === 0 && s.rowFirst]}>
                      <Text style={s.rowKey} numberOfLines={1}>
                        {line.quantity > 1 ? `${line.quantity} × ` : ''}
                        {line.description}
                      </Text>
                      <Text style={s.rowValue}>{format(line.amount)}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {receipt.warnings.length > 0 && (
              <View style={s.warnings}>
                {receipt.warnings.map((w) => (
                  <Text key={w} style={s.warnLine}>
                    · {w}
                  </Text>
                ))}
              </View>
            )}

            {/* Kept visible, not hidden behind a debug flag: when a parse is wrong the only
                way to see WHY is the text it was given. */}
            {rawLines.length > 0 && (
              <>
                <Text style={s.section}>What the camera read</Text>
                <View style={s.card}>
                  <Text style={s.raw}>{rawLines.join('\n')}</Text>
                </View>
              </>
            )}
          </>
        )}
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
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      borderBottomColor: c.line,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    cancel: { color: c['text-lo'], fontFamily: font.body, fontSize: 15 },
    title: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 16 },
    save: { color: c.inr, fontFamily: font.bodyMedium, fontSize: 15 },
    saveDisabled: { color: c['text-lo'], opacity: 0.5 },
    content: { padding: space[4], paddingBottom: space[8], gap: space[2] },
    actions: { flexDirection: 'row', gap: space[2] },
    action: {
      flex: 1,
      alignItems: 'center',
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      paddingVertical: space[4],
    },
    actionPrimary: { backgroundColor: c['text-hi'], borderColor: c['text-hi'] },
    actionOff: { opacity: 0.4 },
    actionText: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 15 },
    actionPrimaryText: { color: c['surface-0'], fontFamily: font.bodyMedium, fontSize: 15 },
    privacy: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 12,
      lineHeight: 18,
      marginTop: space[2],
    },
    busy: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[4] },
    busyText: { color: c['text-lo'], fontFamily: font.body, fontSize: 14 },
    warn: {
      color: c.warn,
      fontFamily: font.body,
      fontSize: 13,
      lineHeight: 20,
      marginTop: space[3],
    },
    verdict: {
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: space[4],
      marginTop: space[4],
      gap: space[1],
    },
    verdictTitle: { fontFamily: font.bodyMedium, fontSize: 15 },
    verdictBody: { color: c['text-lo'], fontFamily: font.body, fontSize: 13, lineHeight: 20 },
    section: {
      color: c['text-lo'],
      fontFamily: font.bodyMedium,
      fontSize: 13,
      marginTop: space[4],
      marginBottom: space[2],
    },
    card: {
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.lg,
      paddingHorizontal: space[4],
      marginTop: space[2],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space[3],
      paddingVertical: space[3],
      borderTopColor: c.line,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    rowFirst: { borderTopWidth: 0 },
    rowKey: { color: c['text-lo'], fontFamily: font.body, fontSize: 14, flex: 1 },
    rowValue: {
      color: c['text-hi'],
      fontFamily: font.mono,
      fontSize: 14,
      fontVariant: ['tabular-nums'],
    },
    rowTotal: { fontFamily: font.monoMedium, fontSize: 16 },
    warnings: { marginTop: space[3], gap: space[1] },
    warnLine: { color: c.warn, fontFamily: font.body, fontSize: 12, lineHeight: 18 },
    raw: {
      color: c['text-lo'],
      fontFamily: font.mono,
      fontSize: 11,
      lineHeight: 16,
      paddingVertical: space[3],
    },
  })
