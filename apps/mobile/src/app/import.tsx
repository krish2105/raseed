import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'

import {
  findDuplicates,
  parseStatement,
  type DateOrder,
  type ParsedStatement,
} from '@raseed/engines'
import { format, money } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { Glass } from '@/components/Glass'
import {
  commitAfterDismiss,
  insertTransaction,
  listAccounts,
  listCategories,
  recentSpend,
  useQuery,
} from '@/db'
import { AED_TO_INR } from '@/lib/fx'
import { importBlockedReason, importableRows, spendRows } from '@/lib/import'

/**
 * Importing a bank statement on the phone.
 *
 * `parseStatement` has been tested since Session 22 and was reachable only from the web app —
 * so the device that owns the ledger was the one that could not load a statement into it, and
 * the workaround was to open a laptop.
 *
 * Everything hard here lives in the engine and is already covered by tests: delimiter
 * detection by consistency, finding the header below a bank's preamble, Indian digit grouping,
 * parenthesised negatives, Dr/Cr suffixes, and separate debit/credit columns beating a single
 * signed one. This screen's only jobs are to show what was understood **before** anything is
 * written, and to refuse to guess when the file is genuinely ambiguous.
 *
 * The date-order question is the one that matters. `03/04/2026` is two different days
 * depending on the bank, and a silent wrong guess misfiles a third of the rows into the wrong
 * month with nothing about the result looking wrong. So the engine returns `'ambiguous'`
 * rather than picking, and the import button stays disabled until it is answered.
 */
export default function ImportScreen() {
  /** Reads the ledger to dedupe; the compiler would otherwise serve a pre-write state. */
  'use no memo'

  const { colors } = useTheme()
  const s = styles(colors)

  const accounts = useQuery(listAccounts)
  const categories = useQuery(listCategories)
  const existing = useQuery(() => recentSpend(500))

  const [text, setText] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [order, setOrder] = useState<DateOrder | null>(null)
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [done, setDone] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Parsed twice, on purpose. The unforced parse is what decides whether the FILE is
  // ambiguous, so the date control keeps rendering after you answer — otherwise the question
  // disappears the moment you touch it and a wrong pick is only undoable by re-importing.
  const unforced: ParsedStatement | null = text ? parseStatement(text) : null
  const parsed: ParsedStatement | null = text
    ? parseStatement(text, order ? { dateOrder: order } : undefined)
    : null
  const fileIsAmbiguous = unforced?.dateOrder === 'ambiguous'

  const dupes = parsed
    ? findDuplicates(
        parsed.rows,
        existing.map((e) => ({
          occurredAt: e.occurredAt,
          amountMinor: -Math.abs(e.amount.minor),
          description: e.merchant,
        })),
      )
    : new Set<number>()

  const importable = parsed ? importableRows(parsed.rows, dupes, excluded) : []
  const willWrite = spendRows(importable)
  const blocked = importBlockedReason(fileIsAmbiguous, order !== null, willWrite.length)

  async function pick() {
    setError(null)
    setDone(null)
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'public.comma-separated-values-text'],
        copyToCacheDirectory: true,
      })
      if (res.canceled || !res.assets?.[0]) return
      const asset = res.assets[0]
      const body = await FileSystem.readAsStringAsync(asset.uri)
      setText(body)
      setName(asset.name ?? 'statement.csv')
      setOrder(null)
      setExcluded(new Set())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  function commit() {
    if (!parsed || willWrite.length === 0) return
    const accountId = accounts[0]?.id ?? ''
    const categoryId = categories[0]?.id ?? ''
    // Only outflows are written. Credits are shown so the file can be checked, but a salary
    // imported as an expense would inflate every figure on the phone.
    const rows = willWrite
    const n = rows.length

    setDone(n)
    setText(null)
    commitAfterDismiss(() => {
      for (const r of rows) {
        insertTransaction({
          amount: money(Math.abs(r.amountMinor), r.currency),
          accountId,
          categoryId,
          merchantText: r.description,
          occurredAt: r.occurredAt,
          fxRate: r.currency === 'AED' ? AED_TO_INR : 1,
        })
      }
    })
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={s.back}>Back</Text>
        </Pressable>
        <Text style={s.title}>Import</Text>
        <View style={s.spacer} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.lede}>
          A CSV from HDFC, ICICI, Emirates NBD, Wise — or anything else that exports one.
          Nothing is written until you have seen what was understood.
        </Text>

        <Pressable onPress={pick} accessibilityRole="button" style={s.primary}>
          <Text style={s.primaryText}>{text ? 'Choose a different file' : 'Choose a file'}</Text>
        </Pressable>

        {error && <Text style={s.error}>{error}</Text>}
        {done !== null && (
          <Text style={s.good}>
            {done} {done === 1 ? 'row' : 'rows'} imported. They are in your ledger now.
          </Text>
        )}

        {parsed && (
          <>
            <Glass style={s.card}>
              <View style={s.cardInner}>
                <Text style={s.cardLabel}>{name}</Text>
                <View style={s.statRow}>
                  <Stat label="Rows found" value={String(parsed.rows.length)} c={colors} />
                  <Stat label="Already yours" value={String(dupes.size)} c={colors} />
                  {/* The same count the button uses. Showing "will import 4" above a button
                      that writes 3 is the two-numbers-for-one-thing problem in miniature. */}
                  <Stat label="Will import" value={String(willWrite.length)} c={colors} />
                </View>
                {parsed.skipped.length > 0 && (
                  <Text style={s.note}>
                    {parsed.skipped.length}{' '}
                    {parsed.skipped.length === 1 ? 'line' : 'lines'} could not be read and were
                    left out rather than guessed at.
                  </Text>
                )}
              </View>
            </Glass>

            {fileIsAmbiguous && (
              <Glass style={s.card}>
                <View style={s.cardInner}>
                  <Text style={s.cardLabel}>Which way round are the dates?</Text>
                  <Text style={s.note}>
                    Every date in this file lands in the first twelve days, so the file itself
                    cannot say. Guessing would misfile a third of these into the wrong month
                    and nothing about the result would look wrong.
                  </Text>
                  <View style={s.chips}>
                    {(
                      [
                        ['dmy', 'Day first · 03/04 is 3 April'],
                        ['mdy', 'Month first · 03/04 is 4 March'],
                      ] as const
                    ).map(([value, label]) => (
                      <Pressable
                        key={value}
                        onPress={() => setOrder(value)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: order === value }}
                        style={[s.chip, order === value && s.chipActive]}
                      >
                        <Text style={[s.chipText, order === value && s.chipTextActive]}>
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </Glass>
            )}

            <Text style={s.section}>What it read</Text>
            <Glass style={s.card}>
              <View style={s.cardInner}>
                {parsed.rows.slice(0, 12).map((r, i) => {
                  const dupe = dupes.has(i)
                  const off = excluded.has(i)
                  return (
                    <Pressable
                      key={`${r.raw}-${i}`}
                      onPress={() =>
                        setExcluded((prev) => {
                          const next = new Set(prev)
                          if (next.has(i)) next.delete(i)
                          else next.add(i)
                          return next
                        })
                      }
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: !dupe && !off }}
                      style={s.row}
                    >
                      <View style={s.rowText}>
                        <Text style={[s.rowName, (dupe || off) && s.struck]} numberOfLines={1}>
                          {r.description}
                        </Text>
                        <Text style={s.rowMeta}>
                          {new Date(r.occurredAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                          {dupe ? ' · already in your ledger' : off ? ' · excluded' : ''}
                        </Text>
                      </View>
                      <Text
                        style={[
                          s.rowAmount,
                          { color: r.amountMinor >= 0 ? colors.good : colors['text-hi'] },
                          (dupe || off) && s.struck,
                        ]}
                      >
                        {r.amountMinor >= 0 ? '+' : ''}
                        {format(money(Math.abs(r.amountMinor), r.currency))}
                      </Text>
                    </Pressable>
                  )
                })}
                {parsed.rows.length > 12 && (
                  <Text style={s.note}>…and {parsed.rows.length - 12} more.</Text>
                )}
              </View>
            </Glass>

            <Pressable
              onPress={commit}
              accessibilityRole="button"
              accessibilityState={{ disabled: blocked !== null }}
              style={[s.primary, blocked !== null && s.primaryDisabled]}
              disabled={blocked !== null}
            >
              <Text style={s.primaryText}>
                {blocked ?? `Import ${willWrite.length} ${willWrite.length === 1 ? 'row' : 'rows'}`}
              </Text>
            </Pressable>

            <Text style={s.footnote}>
              Credits are shown so you can check the file was read correctly, but only
              outflows become spend rows — importing a salary as an expense would inflate
              every figure on the phone. The file is read on device; nothing is uploaded.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function Stat({ label, value, c }: { label: string; value: string; c: Palette }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: c['text-lo'], fontFamily: font.body, fontSize: 11 }}>{label}</Text>
      <Text
        style={{
          color: c['text-hi'],
          fontFamily: font.displayBold,
          fontSize: 20,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
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
      borderBottomWidth: 1,
    },
    back: { color: c['text-lo'], fontFamily: font.body, fontSize: 15 },
    title: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 15 },
    spacer: { width: 40 },

    content: { padding: space[5], paddingBottom: space[12] },
    lede: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: space[4],
    },
    section: {
      color: c['text-lo'],
      fontFamily: font.bodyMedium,
      fontSize: 12,
      marginTop: space[4],
      marginBottom: space[2],
    },

    card: { marginTop: space[3] },
    cardInner: { padding: space[4] },
    cardLabel: { color: c['text-lo'], fontFamily: font.bodyMedium, fontSize: 12 },
    statRow: { flexDirection: 'row', gap: space[3], marginTop: space[3] },

    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: space[3],
      paddingVertical: space[2],
      borderTopColor: c.line,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    rowText: { flexShrink: 1 },
    rowName: { color: c['text-hi'], fontFamily: font.body, fontSize: 14 },
    rowMeta: { color: c['text-lo'], fontFamily: font.body, fontSize: 11, marginTop: 1 },
    rowAmount: { fontFamily: font.mono, fontSize: 13, fontVariant: ['tabular-nums'] },
    struck: { opacity: 0.45, textDecorationLine: 'line-through' },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[3] },
    chip: {
      borderColor: c.line,
      borderWidth: 1,
      borderRadius: radius.full,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      backgroundColor: c['surface-1'],
    },
    chipActive: { backgroundColor: c['surface-2'], borderColor: c.inr },
    chipText: { color: c['text-lo'], fontFamily: font.body, fontSize: 12 },
    chipTextActive: { color: c['text-hi'] },

    note: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 11,
      lineHeight: 17,
      marginTop: space[3],
    },
    error: { color: c.warn, fontFamily: font.body, fontSize: 13, marginTop: space[3] },
    good: { color: c.good, fontFamily: font.bodyMedium, fontSize: 13, marginTop: space[3] },

    primary: {
      marginTop: space[4],
      borderRadius: radius.md,
      backgroundColor: c.inr,
      paddingVertical: space[3],
      alignItems: 'center',
    },
    primaryDisabled: { opacity: 0.45 },
    primaryText: { color: c['surface-0'], fontFamily: font.bodyMedium, fontSize: 15 },

    footnote: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 11,
      lineHeight: 17,
      marginTop: space[5],
    },
  })
