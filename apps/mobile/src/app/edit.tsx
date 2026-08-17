import { useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { format, fromMajor, type Money } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { Chip } from '@/components/ui'
import { font, useTheme } from '@/theme'
import {
  commitAfterDismiss,
  getTransaction,
  listAccounts,
  listCategories,
  recordRefund,
  softDeleteTransaction,
  updateTransaction,
  useQuery,
} from '@/db'

/**
 * Correcting a transaction you already recorded.
 *
 * This was the oldest gap in the app: `P1`'s own done-when is "add/**edit/delete** a txn", and
 * only add was ever built. The workarounds were delete-and-re-add on web and nothing at all on
 * the phone — so a mistyped amount was permanent, and the ledger slowly filled with figures
 * nobody could correct.
 *
 * Two things it deliberately does not do:
 *
 * 1. **It does not re-price the row.** `fx_rate` stays exactly as written; `home_amount_minor`
 *    is recomputed from that frozen rate only if the amount changed. `CLAUDE.md` is explicit
 *    that FX is frozen at transaction date, and fixing a merchant's spelling is not a reason to
 *    revalue a Dubai dinner at today's rate.
 * 2. **It does not hard-delete.** Soft delete only, which is both the sync invariant and the
 *    reason the row can still be reasoned about later.
 */
export default function EditScreen() {
  /** Reads the ledger; the compiler would otherwise serve the pre-write state for ever. */
  'use no memo'

  const { colors } = useTheme()
  const s = styles(colors)

  const { id } = useLocalSearchParams<{ id: string }>()
  const txn = useQuery(() => (id ? getTransaction(id) : null))
  const accounts = useQuery(listAccounts)
  const categories = useQuery(listCategories)

  const [amountText, setAmountText] = useState<string | null>(null)
  const [merchant, setMerchant] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!txn) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Text style={s.cancel}>Back</Text>
          </Pressable>
          <Text style={s.title}>Edit</Text>
          <View style={s.spacer} />
        </View>
        <Text style={s.gone}>That transaction is no longer in the ledger.</Text>
      </SafeAreaView>
    )
  }

  // Uncommitted edits win; otherwise show what is stored. Keeping the stored value as the
  // fallback rather than seeding state on mount means the form cannot show a stale figure
  // after the row changes underneath it.
  const amountValue = amountText ?? (txn.amount.minor / 100).toFixed(2)
  const merchantValue = merchant ?? txn.merchantText
  const categoryValue = categoryId ?? txn.categoryId ?? categories[0]?.id ?? ''
  const accountValue = accountId ?? txn.accountId

  let parsed: Money | null = null
  try {
    const m = fromMajor(amountValue.trim(), txn.amount.currency)
    parsed = m.minor > 0 ? m : null
  } catch {
    parsed = null
  }

  const canSave = parsed !== null && merchantValue.trim().length > 0

  function save() {
    if (!txn) return
    if (!parsed) {
      setError('Enter an amount, like 240 or 240.50')
      return
    }
    if (!merchantValue.trim()) {
      setError('Who did you pay?')
      return
    }
    const next = {
      id: txn.id,
      amount: parsed,
      merchantText: merchantValue.trim(),
      categoryId: categoryValue,
      accountId: accountValue,
      note: txn.note,
    }
    router.back()
    commitAfterDismiss(() => updateTransaction(next))
  }

  function confirmRefund() {
    if (!txn) return
    Alert.alert(
      'Was this refunded?',
      `Records ${format(txn.amount)} coming back. Both this charge and the refund stop counting as spend — they net to zero.`,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Refunded',
          onPress: () => {
            const original = txn.id
            router.back()
            commitAfterDismiss(() => recordRefund(original))
          },
        },
      ],
    )
  }

  function confirmDelete() {
    if (!txn) return
    Alert.alert('Delete this transaction?', `${format(txn.amount)} — ${txn.merchantText}`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const gone = txn.id
          router.back()
          commitAfterDismiss(() => softDeleteTransaction(gone))
        },
      },
    ])
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Text style={s.cancel}>Cancel</Text>
          </Pressable>
          <Text style={s.title}>Edit</Text>
          <Pressable
            onPress={save}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
          >
            <Text style={[s.save, !canSave && s.saveDisabled]}>Save</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.label}>Amount ({txn.amount.currency})</Text>
          <TextInput
            value={amountValue}
            onChangeText={(t) => {
              setAmountText(t)
              setError(null)
            }}
            keyboardType="decimal-pad"
            accessibilityLabel="Amount"
            style={[
              s.amountInput,
              { color: txn.amount.currency === 'INR' ? colors.inr : colors.aed },
            ]}
          />

          <Text style={s.label}>Paid to</Text>
          <TextInput
            value={merchantValue}
            onChangeText={(t) => {
              setMerchant(t)
              setError(null)
            }}
            accessibilityLabel="Merchant"
            style={s.input}
          />

          <Text style={s.label}>Category</Text>
          <View style={s.chips}>
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                role="radio"
                selected={categoryValue === c.id}
                onPress={() => setCategoryId(c.id)}
              />
            ))}
          </View>

          <Text style={s.label}>Account</Text>
          <View style={s.chips}>
            {accounts.map((a) => (
              <Chip
                key={a.id}
                label={a.name}
                role="radio"
                selected={accountValue === a.id}
                onPress={() => setAccountId(a.id)}
              />
            ))}
          </View>

          {error && <Text style={s.error}>{error}</Text>}

          <Pressable onPress={confirmRefund} accessibilityRole="button" style={s.secondary}>
            <Text style={s.secondaryText}>This was refunded</Text>
          </Pressable>

          <Pressable onPress={confirmDelete} accessibilityRole="button" style={s.delete}>
            <Text style={s.deleteText}>Delete this transaction</Text>
          </Pressable>

          <Text style={s.fxNote}>
            The exchange rate stays as it was on the day — {txn.amount.currency === 'INR'
              ? 'this one is already in rupees'
              : 'editing the label will not re-price it at today’s rate'}. Deleting hides
            the row from every figure but keeps it on the device, so a sync can tell the
            difference between deleted and never recorded.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c['surface-0'] },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space[5],
      paddingVertical: space[3],
      borderBottomColor: c.line,
      borderBottomWidth: 1,
    },
    title: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 15 },
    cancel: { color: c['text-lo'], fontFamily: font.body, fontSize: 15 },
    save: { color: c.inr, fontFamily: font.bodyMedium, fontSize: 15 },
    saveDisabled: { opacity: 0.4 },
    spacer: { width: 44 },
    gone: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 14,
      padding: space[5],
    },

    content: { padding: space[5], paddingBottom: space[12] },
    label: {
      color: c['text-lo'],
      fontFamily: font.bodyMedium,
      fontSize: 12,
      marginTop: space[4],
      marginBottom: space[1],
    },
    amountInput: {
      fontFamily: font.displayBold,
      fontSize: 40,
      letterSpacing: -1,
      fontVariant: ['tabular-nums'],
      writingDirection: 'ltr',
      paddingVertical: space[1],
    },
    input: {
      color: c['text-hi'],
      fontFamily: font.body,
      fontSize: 16,
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: space[3],
      paddingVertical: space[3],
    },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },

    error: { color: c.warn, fontFamily: font.body, fontSize: 13, marginTop: space[3] },

    secondary: {
      marginTop: space[6],
      borderColor: c.line,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingVertical: space[3],
      alignItems: 'center',
    },
    secondaryText: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 15 },

    delete: {
      marginTop: space[3],
      borderColor: c.line,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingVertical: space[3],
      alignItems: 'center',
    },
    deleteText: { color: c.warn, fontFamily: font.bodyMedium, fontSize: 15 },

    fxNote: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 12,
      lineHeight: 17,
      marginTop: space[5],
    },
  })
