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
import { splitEvenly } from '@raseed/engines'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { commitAfterDismiss, insertTransaction, listAccounts, listCategories, useQuery } from '@/db'

/** INR per AED, frozen onto the row at write time. Session 15 replaces this with a rate cache. */
const AED_TO_INR = 23.45

/**
 * Manual entry. Never writes without an explicit confirm — the parser will propose here in
 * Session 11, and this sheet is what commits.
 */
export default function AddScreen() {
  const { colors } = useTheme()
  const s = styles(colors)

  const accounts = useQuery(listAccounts)
  const categories = useQuery(listCategories)

  const [amountText, setAmountText] = useState('')
  const [merchant, setMerchant] = useState('')
  const [currency, setCurrency] = useState<Currency>('INR')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [ways, setWays] = useState(1)
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
   * The same function the dashboard calls, from `@raseed/engines` — so a bill split on the
   * phone and the same bill split on the web cannot produce two different numbers.
   */
  const split = parsed && ways > 1 ? splitEvenly(parsed, ways) : null

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
        ? `Your share, 1 of ${ways}. Paid ${format(parsed)}, ${format(split.owedToYou)} owed to you.`
        : undefined,
    }

    // Dismiss first, commit second. See `commitAfterDismiss` — writing while this modal is
    // still up leaves the screen underneath one write behind, permanently.
    router.back()
    commitAfterDismiss(() => insertTransaction(draft))
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

          <Text style={s.label}>Split</Text>
          <View style={s.chips}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Pressable
                key={n}
                onPress={() => setWays(n)}
                accessibilityRole="radio"
                accessibilityState={{ selected: ways === n }}
                style={[s.chip, ways === n && s.chipActive]}
              >
                <Text style={[s.chipText, ways === n && s.chipTextActive]}>
                  {n === 1 ? 'Just me' : `${n} ways`}
                </Text>
              </Pressable>
            ))}
          </View>

          {split && parsed && (
            <Text style={s.splitNote}>
              Your share is {format(split.yourShare)} of {format(parsed)} — only that counts as
              your spend. {format(split.owedToYou)} is owed to you.
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
              <Pressable
                key={c.id}
                onPress={() => setCategoryId(c.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: categoryId === c.id }}
                style={[s.chip, categoryId === c.id && s.chipActive]}
              >
                <Text style={[s.chipText, categoryId === c.id && s.chipTextActive]}>{c.name}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.label}>Account</Text>
          <View style={s.chips}>
            {accounts.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => setAccountId(a.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: accountId === a.id }}
                style={[s.chip, accountId === a.id && s.chipActive]}
              >
                <Text style={[s.chipText, accountId === a.id && s.chipTextActive]}>
                  {a.name}
                </Text>
              </Pressable>
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
    chip: {
      borderColor: c.line,
      borderWidth: 1,
      borderRadius: radius.full,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      backgroundColor: c['surface-1'],
    },
    chipActive: { backgroundColor: c['surface-2'], borderColor: c.inr },
    chipText: { color: c['text-lo'], fontFamily: font.body, fontSize: 13 },
    chipTextActive: { color: c['text-hi'] },

    error: { color: c.warn, fontFamily: font.body, fontSize: 13, marginTop: space[3] },
    fxNote: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 12,
      lineHeight: 17,
      marginTop: space[4],
    },
  })
