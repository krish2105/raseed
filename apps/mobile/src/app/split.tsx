import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'

import { simplifyDebts, type Balance } from '@raseed/engines'
import { format, money } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import { Glass } from '@/components/Glass'
import {
  addPerson,
  listPeople,
  notifyChanged,
  outstandingByPerson,
  removePerson,
  settleUp,
  useQuery,
} from '@/db'

/**
 * Who owes what, and the fewest payments that clear it.
 *
 * The interesting half is not the splitting — `allocate` already does that exactly. It is
 * **simplification**: several shared bills between four people is a dozen transfers, and
 * restructured it is two or three, with nobody's net position moved by a paisa.
 *
 * Both readings are offered rather than one being chosen on your behalf, because greedy
 * simplification can produce a payment between two people who never shared an expense. Same
 * money, same net — but "why do I owe Sam, I wasn't at that dinner" is a real reaction, and
 * for a group of friends the legible version is often worth more than the saved transfers.
 *
 * A pushed screen rather than a fourth tab. The tab bar is capped at three by a decision
 * recorded in `(tabs)/_layout.tsx`, and it is the right one: navigation is not the product,
 * and splits are something you check occasionally rather than glance at daily.
 */
export default function SplitScreen() {
  /**
   * The React Compiler memoises this component's reads, and the store version is not
   * something it can see as an input. Without this the screen shows the state before the
   * most recent write — for ever, until the process restarts. See DECISIONS.md.
   */
  'use no memo'

  const { colors } = useTheme()
  const s = styles(colors)

  const people = useQuery(listPeople)
  const outstanding = useQuery(outstandingByPerson)
  const [name, setName] = useState('')
  const [simplify, setSimplify] = useState(true)

  const currency = outstanding[0]?.currency ?? 'INR'

  // You are the counterparty to everything here: each person's outstanding amount is money
  // owed TO you, so your own net is the negative of their sum.
  const positions: Balance[] = [
    ...outstanding.map((o) => ({ personId: o.personId, net: money(-o.minor, o.currency) })),
    {
      personId: 'me',
      net: money(
        outstanding.reduce((a, o) => a + o.minor, 0),
        currency,
      ),
    },
  ]

  const settlements = simplify ? simplifyDebts(positions) : []
  const nameOf = (id: string) =>
    id === 'me' ? 'you' : (people.find((p) => p.id === id)?.name ?? 'someone')

  const totalOwed = outstanding.reduce((a, o) => a + o.minor, 0)

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Text style={s.back}>Back</Text>
          </Pressable>
          <Text style={s.title}>Split</Text>
          <View style={s.headerSpacer} />
        </View>

        <Glass style={s.hero}>
          <View style={s.heroInner}>
            <Text style={s.heroLabel}>
              {totalOwed > 0
                ? 'People owe you'
                : totalOwed < 0
                  ? 'You owe, on balance'
                  : 'Nobody owes anybody'}
            </Text>
            {totalOwed > 0 && (
              <Text style={s.heroAmount}>{format(money(totalOwed, currency))}</Text>
            )}
            <Text style={s.heroHint}>
              {totalOwed > 0
                ? `across ${outstanding.length} ${outstanding.length === 1 ? 'person' : 'people'}`
                : 'Add people, then split a bill from the add screen.'}
            </Text>
          </View>
        </Glass>

        {/* ── who owes what ─────────────────────────────────────────────── */}
        {outstanding.length > 0 && (
          <>
            <Text style={s.section}>Outstanding</Text>
            <View style={s.card}>
              {outstanding.map((o, i) => (
                <View key={o.personId} style={[s.row, i === 0 && s.rowFirst]}>
                  <View style={s.rowText}>
                    <Text style={s.rowName}>{o.name}</Text>
                    {/* The sign is the direction. Negative means you owe them — the case
                        that could not be recorded at all until splits ran both ways. */}
                    <Text style={s.rowMeta}>{o.minor >= 0 ? 'owes you' : 'you owe'}</Text>
                  </View>
                  {/* Magnitude, with the direction in the label above rather than in a minus
                      sign. "−₹600" next to the word "you owe" says the same thing twice and
                      reads as a negative debt the first time you meet it. */}
                  <Text style={[s.rowAmount, o.minor < 0 && { color: colors.warn }]}>
                    {format(money(Math.abs(o.minor), o.currency))}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${o.name} as settled`}
                    onPress={() => {
                      settleUp(o.personId)
                      notifyChanged()
                    }}
                    style={s.settle}
                  >
                    <Text style={s.settleText}>Settled</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            {/* ── the fewest payments ─────────────────────────────────── */}
            <View style={s.sectionRow}>
              <Text style={s.section}>Settling up</Text>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: simplify }}
                onPress={() => setSimplify((v) => !v)}
                style={s.toggle}
              >
                <Text style={s.toggleText}>{simplify ? 'Fewest payments' : 'As they happened'}</Text>
              </Pressable>
            </View>

            <View style={s.card}>
              {(simplify ? settlements : []).map((x, i) => (
                <View key={`${x.fromId}-${x.toId}-${i}`} style={[s.row, i === 0 && s.rowFirst]}>
                  <Text style={s.settleLine}>
                    {nameOf(x.fromId)} pays {nameOf(x.toId)}
                  </Text>
                  <Text style={s.rowAmount}>{format(x.amount)}</Text>
                </View>
              ))}

              {!simplify &&
                outstanding.map((o, i) => (
                  <View key={o.personId} style={[s.row, i === 0 && s.rowFirst]}>
                    <Text style={s.settleLine}>{o.name} pays you</Text>
                    <Text style={s.rowAmount}>{format(money(o.minor, o.currency))}</Text>
                  </View>
                ))}
            </View>

            <Text style={s.note}>
              {!simplify
                ? 'Every debt attached to the pair that actually shared something. More payments, but each one is explicable.'
                : settlements.length < outstanding.length
                  ? `${settlements.length} payment${settlements.length === 1 ? '' : 's'} instead of ${outstanding.length}. Nobody's total changes — only who hands money to whom. Simplifying can pair two people who never shared a bill, which is why the other view is here.`
                  : // Saying "2 payments instead of 2" is nonsense, and the reason it happens
                    // is worth stating: while you are the only person who ever pays, every
                    // debt already points at you and there is nothing to reroute.
                    'Nothing to simplify — every debt already points at you. Simplifying starts to help once people owe each other as well.'}
            </Text>
          </>
        )}

        {/* ── people ────────────────────────────────────────────────────── */}
        <Text style={s.section}>People</Text>
        <View style={s.card}>
          {people.map((p, i) => (
            <View key={p.id} style={[s.row, i === 0 && s.rowFirst]}>
              <Text style={s.rowName}>{p.name}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${p.name}`}
                onPress={() => {
                  removePerson(p.id)
                  notifyChanged()
                }}
                style={s.settle}
              >
                <Text style={s.removeText}>Remove</Text>
              </Pressable>
            </View>
          ))}

          <View style={[s.row, people.length === 0 && s.rowFirst]}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Add someone"
              placeholderTextColor={colors['text-lo']}
              accessibilityLabel="New person's name"
              returnKeyType="done"
              onSubmitEditing={(e) => {
                // The name comes from the EVENT, not from state. Typing quickly and hitting
                // return submits before the last `setName` has been applied, and the first
                // attempt at this saved a person called "P".
                const typed = e.nativeEvent.text.trim()
                if (!typed) return
                addPerson(typed)
                setName('')
                notifyChanged()
              }}
              style={s.input}
            />
          </View>
        </View>

        <Text style={s.note}>
          People live only on this phone. No accounts, no invites, nothing sent anywhere —
          which is also why the other person cannot see this yet.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c['surface-0'] },
    content: { padding: space[4], paddingBottom: space[8], gap: space[2] },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: space[2],
    },
    headerSpacer: { width: 40 },
    back: { color: c.inr, fontFamily: font.bodyMedium, fontSize: 15, width: 40 },
    title: { color: c['text-hi'], fontFamily: font.displayBold, fontSize: 28 },
    hero: { marginBottom: space[3] },
    heroInner: { padding: space[4], gap: space[1] },
    heroLabel: { color: c['text-lo'], fontFamily: font.body, fontSize: 13 },
    heroAmount: {
      color: c.good,
      fontFamily: font.displayBold,
      fontSize: 32,
      fontVariant: ['tabular-nums'],
    },
    heroHint: { color: c['text-lo'], fontFamily: font.body, fontSize: 13 },
    section: {
      color: c['text-lo'],
      fontFamily: font.bodyMedium,
      fontSize: 13,
      marginTop: space[4],
      marginBottom: space[2],
    },
    sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    card: {
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.lg,
      paddingHorizontal: space[4],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingVertical: space[3],
      borderTopColor: c.line,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    rowFirst: { borderTopWidth: 0 },
    rowText: { flex: 1 },
    rowName: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 15, flex: 1 },
    rowMeta: { color: c['text-lo'], fontFamily: font.body, fontSize: 12 },
    rowAmount: {
      color: c['text-hi'],
      fontFamily: font.mono,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },
    settleLine: { color: c['text-hi'], fontFamily: font.body, fontSize: 14, flex: 1 },
    settle: {
      borderRadius: radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      paddingHorizontal: space[3],
      paddingVertical: space[1],
    },
    settleText: { color: c.good, fontFamily: font.bodyMedium, fontSize: 12 },
    removeText: { color: c['text-lo'], fontFamily: font.bodyMedium, fontSize: 12 },
    toggle: {
      borderRadius: radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      paddingHorizontal: space[3],
      paddingVertical: space[1],
      marginTop: space[4],
      marginBottom: space[2],
    },
    toggleText: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 12 },
    input: {
      flex: 1,
      color: c['text-hi'],
      fontFamily: font.body,
      fontSize: 15,
      paddingVertical: space[1],
    },
    note: {
      color: c['text-lo'],
      fontFamily: font.body,
      fontSize: 12,
      lineHeight: 18,
      marginTop: space[3],
    },
  })
