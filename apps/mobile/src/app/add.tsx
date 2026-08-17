import { useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { format, fromMajor, type Currency, type Money } from '@raseed/money'
import { splitBill } from '@raseed/engines'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { AED_TO_INR } from '@/lib/fx'
import { Chip } from '@/components/ui'
import {
  commitAfterDismiss,
  insertTransaction,
  listAccounts,
  listCategories,
  listPeople,
  recordSplit,
  useQuery,
} from '@/db'


/**
 * Manual entry. Never writes without an explicit confirm — the parser will propose here in
 * Session 11, and this sheet is what commits.
 */
export default function AddScreen() {
  const { colors } = useTheme()
  const s = styles(colors)

  const accounts = useQuery(listAccounts)
  const categories = useQuery(listCategories)
  const people = useQuery(listPeople)

  const [amountText, setAmountText] = useState('')
  const [merchant, setMerchant] = useState('')
  const [currency, setCurrency] = useState<Currency>('INR')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [withPeople, setWithPeople] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // Parse on every keystroke so the button state is honest, but surface the error only
  // when they try to save — validating as you type is hostile.
  const parsed = useMemo((): Money | null => {
    try {
      const m = fromMajor(amountText.trim(), currency)
      return m.minor > 0 ? m : null
    } catch {
      return null
    }
  }, [amountText, currency])

  const canSave = parsed !== null && merchant.trim().length > 0 && accountId && categoryId

  /**
   * The whole bill splits; only your share is your spend.
   *
   * You are always the first weight, so `shares[0]` is yours and the rest map to the people
   * you picked — which is what lets the split be *recorded against names* rather than just
   * divided by a number. Splitting by a count tells you what you paid; splitting by people
   * tells you who owes you, and only the second one can ever be settled.
   */
  const split =
    parsed && withPeople.length > 0
      ? splitBill({ total: parsed, weights: [1, ...withPeople.map(() => 1)] })
      : null

  function save() {
    if (!parsed) {
      setError(`Enter an amount, like 240 or 240.50`)
      return
    }
    if (!merchant.trim()) {
      setError('Who did you pay?')
      return
    }
    const draft = {
      amount: split ? split.yourShare : parsed,
      accountId,
      categoryId,
      merchantText: merchant.trim(),
      fxRate: currency === 'AED' ? AED_TO_INR : 1,
      note: split
        ? `Your share, 1 of ${withPeople.length + 1}. Paid ${format(parsed)}, ${format(split.owedToYou)} owed to you.`
        : undefined,
    }

    const owed = split
      ? withPeople.map((personId, i) => ({
          personId,
          // shares[0] is yours; the rest line up with `withPeople` in order.
          owedMinor: split.shares[i + 1]?.minor ?? 0,
          currency,
        }))
      : []

    // Dismiss first, commit second. See `commitAfterDismiss` — writing while this modal is
    // still up leaves the screen underneath one write behind, permanently.
    router.back()
    commitAfterDismiss(() => {
      const id = insertTransaction(draft)
      if (owed.length > 0) recordSplit({ transactionId: id, method: 'equal', owed })
    })
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Text style={s.cancel}>Cancel</Text>
          </Pressable>
          <Text style={s.title}>New transaction</Text>
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
          <View style={s.amountRow}>
            <View style={s.currencyToggle}>
              {(['INR', 'AED'] as const).map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCurrency(c)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: currency === c }}
                  style={[
                    s.currencyChip,
                    currency === c && {
                      backgroundColor: colors['surface-2'],
                      borderColor: c === 'INR' ? colors.inr : colors.aed,
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.currencyText,
                      currency === c && { color: c === 'INR' ? colors.inr : colors.aed },
                    ]}
                  >
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={amountText}
              onChangeText={(t) => {
                setAmountText(t)
                setError(null)
              }}
              placeholder="0.00"
              placeholderTextColor={colors['text-lo']}
              keyboardType="decimal-pad"
              autoFocus
              accessibilityLabel="Amount"
              style={[s.amountInput, { color: currency === 'INR' ? colors.inr : colors.aed }]}
            />
          </View>

          <Text style={s.label}>Split with</Text>
          {people.length === 0 ? (
            <Text style={s.splitNote}>
              Nobody added yet. You → Split &amp; settle up to add people, then they show up
              here.
            </Text>
          ) : (
            <View style={s.chips}>
              {people.map((p) => (
                <Chip
                  key={p.id}
                  label={p.name}
                  role="checkbox"
                  selected={withPeople.includes(p.id)}
                  onPress={() =>
                    setWithPeople((prev) =>
                      prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                    )
                  }
                />
              ))}
            </View>
          )}

          {split && parsed && (
            <Text style={s.splitNote}>
              Your share is {format(split.yourShare)} of {format(parsed)} — only that counts as
              your spend. {format(split.owedToYou)} is owed to you, and it will show up under
              Split until it is settled.
              {split.shares.some((sh) => sh.minor !== split.shares[0]!.minor) &&
                ` It does not divide evenly, so the shares are ${split.shares
                  .map((sh) => sh.minor)
                  .join('/')} — they add up exactly.`}
            </Text>
          )}

          <Text style={s.label}>Paid to</Text>
          <TextInput
            value={merchant}
            onChangeText={(t) => {
              setMerchant(t)
              setError(null)
            }}
            placeholder="BigBasket, Careem, the chai guy…"
            placeholderTextColor={colors['text-lo']}
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
                selected={categoryId === c.id}
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
                selected={accountId === a.id}
                onPress={() => setAccountId(a.id)}
              />
            ))}
          </View>

          {error && <Text style={s.error}>{error}</Text>}

          {currency === 'AED' && parsed && (
            <Text style={s.fxNote}>
              Stored at {AED_TO_INR} INR/AED, frozen to this transaction. Changing your home
              currency later will not rewrite it.
            </Text>
          )}
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

    content: { padding: space[5], gap: space[2], paddingBottom: space[12] },

    amountRow: { gap: space[3], marginBottom: space[3] },
    currencyToggle: { flexDirection: 'row', gap: space[2] },
    currencyChip: {
      borderColor: c.line,
      borderWidth: 1,
      borderRadius: radius.sm,
      paddingHorizontal: space[3],
      paddingVertical: space[1],
    },
    currencyText: { color: c['text-lo'], fontFamily: font.monoMedium, fontSize: 12 },

    amountInput: {
      fontFamily: font.displayBold,
      fontSize: 48,
      letterSpacing: -1,
      fontVariant: ['tabular-nums'],
      writingDirection: 'ltr',
      paddingVertical: space[1],
    },

    label: {
      color: c['text-lo'],
      fontFamily: font.bodyMedium,
      fontSize: 12,
      marginTop: space[4],
      marginBottom: space[1],
    },
    splitNote: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 12,
      lineHeight: 18,
      marginTop: space[2],
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
    fxNote: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 12,
      lineHeight: 17,
      marginTop: space[4],
    },
  })
