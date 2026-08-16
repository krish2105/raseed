import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { reconcileCash } from '@raseed/engines'
import { format, fromMajor, money, type Money } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import {
  cashAccount,
  cashSpentSince,
  insertCashCount,
  insertTransaction,
  lastCashCount,
  notifyChanged,
  useQuery,
} from '@/db'

/**
 * Count your wallet.
 *
 * The money every other tracker loses. Card spend records itself; cash does not — ₹5,000
 * leaves an ATM and disappears over three weeks in autos, chai and a haircut, none of it
 * logged. Counting occasionally fixes it without logging a single auto.
 *
 * The first count is a baseline and writes nothing. After that,
 * `expected = last count − cash spend since`, and the difference becomes one honest row.
 * Same `reconcileCash` the dashboard uses, so the phone and the web cannot disagree.
 */
export function WalletCount({ categoryId }: { categoryId: string }) {
  const { colors } = useTheme()
  const s = styles(colors)

  const account = useQuery(cashAccount)
  const [entry, setEntry] = useState('')
  const [outcome, setOutcome] = useState<string | null>(null)

  const last = useQuery(() => (account ? lastCashCount(account.id) : null))
  const spentSince = useQuery(() =>
    account && last ? cashSpentSince(account.id, last.countedAt) : 0,
  )

  if (!account) return null

  const expected: Money | null = last
    ? money(Math.max(0, last.countedMinor - spentSince), account.currency)
    : null

  let counted: Money | null = null
  try {
    counted = entry.trim() ? fromMajor(entry.trim(), account.currency) : null
  } catch {
    // Mid-typing garbage. The button stays disabled rather than shouting.
    counted = null
  }

  // No clock read here. `insertTransaction` and `insertCashCount` each stamp their own,
  // which keeps this function pure for the React Compiler and matches the rule
  // `@raseed/engines` lives by: a function that reads the clock depends on when it ran.
  function submit() {
    if (!counted || !account) return
    let adjustmentTxnId: string | null = null

    if (expected) {
      const result = reconcileCash({ expected, counted })

      if (result.kind === 'balanced') {
        setOutcome('Exactly right — nothing to record.')
      } else {
        const short = result.kind === 'unrecorded-spend'
        // A zero delta writes nothing at all: a ₹0.00 "Uncategorised cash" row on the
        // ledger is noise that makes the honest rows harder to trust.
        adjustmentTxnId = insertTransaction({
          amount: result.amount,
          accountId: account.id,
          categoryId,
          merchantText: 'Uncategorised cash',
          fxRate: 1,
          note: `Wallet count. Expected ${format(expected)}, counted ${format(counted)}.`,
        })
        setOutcome(
          short
            ? `${format(result.amount)} left your wallet unrecorded. Logged as one row.`
            : `${format(result.amount)} more than expected. Logged.`,
        )
      }
    } else {
      setOutcome(`Baseline set at ${format(counted)}. Count again in a week or two.`)
    }

    insertCashCount({
      accountId: account.id,
      countedMinor: counted.minor,
      expectedMinor: expected?.minor ?? counted.minor,
      adjustmentTxnId,
    })
    setEntry('')
    notifyChanged()
  }

  return (
    <View style={s.card}>
      <Text style={s.heading}>What&apos;s in your wallet?</Text>
      <Text style={s.body}>
        {expected ? (
          <>
            The ledger expects {format(expected)} — your last count of{' '}
            {format(money(last!.countedMinor, account.currency))} minus{' '}
            {format(money(spentSince, account.currency))} of cash spend since.
          </>
        ) : (
          <>
            Count the notes in your wallet. The first one is only a baseline — nothing gets
            recorded. After that, the gap between what the ledger expects and what you
            actually have becomes a single honest row instead of vanishing.
          </>
        )}
      </Text>

      <View style={s.row}>
        <TextInput
          value={entry}
          onChangeText={(t) => {
            setEntry(t)
            setOutcome(null)
          }}
          placeholder="800"
          placeholderTextColor={colors['text-lo']}
          keyboardType="decimal-pad"
          accessibilityLabel={`Cash in your ${account.name}`}
          style={s.input}
        />
        <Pressable
          onPress={submit}
          accessibilityRole="button"
          accessibilityState={{ disabled: !counted }}
          style={[s.button, !counted && s.buttonDisabled]}
        >
          <Text style={s.buttonText}>{expected ? 'Reconcile' : 'Set baseline'}</Text>
        </Pressable>
      </View>

      {outcome && (
        <Text accessibilityLiveRegion="polite" style={s.outcome}>
          {outcome}
        </Text>
      )}
    </View>
  )
}

const styles = (c: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.lg,
      padding: space[4],
    },
    heading: {
      color: c['text-hi'],
      fontFamily: font.bodyMedium,
      fontSize: 15,
    },
    body: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 13,
      lineHeight: 20,
      marginTop: space[2],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      marginTop: space[4],
    },
    input: {
      flex: 1,
      color: c['text-hi'],
      fontFamily: font.mono,
      fontSize: 16,
      backgroundColor: c['surface-0'],
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.md,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
    },
    button: {
      backgroundColor: c['text-hi'],
      borderRadius: radius.md,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
    },
    buttonDisabled: { opacity: 0.4 },
    buttonText: {
      color: c['surface-0'],
      fontFamily: font.bodyMedium,
      fontSize: 14,
    },
    outcome: {
      color: c['text-hi'],
      fontFamily: font.body,
      fontSize: 13,
      lineHeight: 20,
      marginTop: space[3],
    },
  })
