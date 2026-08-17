import { useState } from 'react'
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
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'

import { CONFIDENT, parseCapture, type CaptureDraft } from '@raseed/engines'
import { format, money } from '@raseed/money'
import { radius, space, type Palette } from '@raseed/tokens'

import { font, useTheme } from '@/theme'
import {
  commitAfterDismiss,
  insertTransaction,
  listAccounts,
  listCategories,
  logCapture,
  useQuery,
} from '@/db'
import { AED_TO_INR } from '@/lib/fx'
import { Badge, PrimaryButton, SecondaryButton } from '@/components/ui'
import { useDictation } from '@/hooks/useDictation'

/**
 * Capture — one line in, structured rows out. Typed or spoken.
 *
 * P3's shape, with the deterministic tiers only. `parseCapture` is the rules tier: no key, no
 * request, works in airplane mode, and measured against a golden set that ships in
 * `@raseed/engines/eval`. The LLM tier is a named seam and deliberately unbuilt — with no
 * outbound call there is nothing for S4's redaction gate to protect, and the honest version of
 * this feature is the one that cannot leak your ledger because it never sends it anywhere.
 *
 * **The parser proposes; the sheet commits.** `CLAUDE.md` says a transaction is never written
 * without confirmation and this is the screen that has to mean it: every row is shown with what
 * it was read from, low-confidence rows say so, and nothing reaches SQLite until you press Save.
 *
 * Both outcomes go to `capture_log`. A rejected parse is the more valuable row — a real sentence
 * a real person typed that the rules tier got wrong is exactly what belongs in the golden set.
 */
export default function CaptureScreen() {
  /** Reads the ledger; the compiler would otherwise serve the pre-write state for ever. */
  'use no memo'

  const { colors } = useTheme()
  const s = styles(colors)

  const accounts = useQuery(listAccounts)
  const categories = useQuery(listCategories)

  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<{ drafts: CaptureDraft[]; unparsed: string[] } | null>(null)
  const [latencyMs, setLatencyMs] = useState(0)
  const [dropped, setDropped] = useState<readonly number[]>([])

  /**
   * Which account this line is against — and therefore what currency a bare number means.
   *
   * This started as `accounts[0]`, which is alphabetical, which on this ledger is an AED
   * account. `"chai 20"` came back as **AED 20**: a 23× error on a ₹20 cup of tea, produced
   * silently, from a default nobody chose. The assumption is load-bearing, so it is on screen
   * and changeable rather than implied.
   *
   * The initial guess is the home currency, because that is where most lines are typed. It is a
   * guess either way; the difference is whether you can see it.
   */
  const [accountId, setAccountId] = useState<string | null>(null)
  const account = accounts.find((a) => a.id === accountId) ?? accounts.find((a) => a.currency === 'INR') ?? accounts[0]
  const defaultCurrency = account?.currency ?? 'INR'

  /**
   * Dictation writes into the same field the keyboard does.
   *
   * Voice does not get its own parser or its own confirmation path — it produces a string, and
   * from there it is the identical flow. Two capture routes that diverge after the transcript
   * is two things to keep correct and two places for the ledger to be written differently.
   */
  const dictation = useDictation((said) => setText((current) => (current ? `${current}, ${said}` : said)))

  function read() {
    const started = Date.now()
    const result = parseCapture(text, { defaultCurrency })
    setLatencyMs(Date.now() - started)
    setParsed({ drafts: [...result.drafts], unparsed: [...result.unparsed] })
    setDropped([])
  }

  const kept = parsed?.drafts.filter((_, i) => !dropped.includes(i)) ?? []
  // Only spends are written. A transfer and an income row need an account on the other side and
  // a type this screen cannot choose for you, so they are shown, counted, and left alone rather
  // than written as spend — which is the exact double-count the ledger exists to avoid.
  const writable = kept.filter((d) => d.type === 'spend')

  function save() {
    if (!parsed || !account) return
    const categoryId = categories[0]?.id ?? ''

    const payload = JSON.stringify(parsed.drafts)
    const edited = JSON.stringify(kept)

    router.back()
    commitAfterDismiss(() => {
      for (const draft of writable) {
        insertTransaction({
          amount: money(draft.amountMinor, draft.currency),
          accountId: account.id,
          categoryId,
          merchantText: draft.merchantText || draft.source,
          fxRate: draft.currency === 'AED' ? AED_TO_INR : 1,
          note: `Captured from "${draft.source}"`,
        })
      }
      logCapture({
        rawInput: text,
        parsedJson: payload,
        route: 'rules',
        latencyMs,
        accepted: true,
        // The diff between what was parsed and what was kept IS the label. Only recorded when
        // they differ, so the log stays a record of corrections rather than of every save.
        editedJson: edited === payload ? undefined : edited,
      })
    })
  }

  function discard() {
    if (parsed) {
      logCapture({
        rawInput: text,
        parsedJson: JSON.stringify(parsed.drafts),
        route: 'rules',
        latencyMs,
        accepted: false,
      })
    }
    router.back()
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.header}>
          <Pressable onPress={discard} hitSlop={12} accessibilityRole="button">
            <Text style={s.cancel}>Cancel</Text>
          </Pressable>
          <Text style={s.title}>Capture</Text>
          <View style={s.spacer} />
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={read}
            placeholder="chai 20, auto 80, bigbasket 640"
            placeholderTextColor={colors['text-lo']}
            accessibilityLabel="What did you spend?"
            multiline
            autoFocus
            style={s.input}
          />

          <View style={s.micRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={dictation.state === 'listening' ? 'Stop listening' : 'Say it instead'}
              accessibilityState={{ busy: dictation.state === 'listening' }}
              onPress={() => (dictation.state === 'listening' ? dictation.stop() : void dictation.start())}
              style={[
                s.mic,
                dictation.state === 'listening' && {
                  backgroundColor: colors.accent,
                  borderColor: colors.accent,
                },
              ]}
            >
              <Text
                style={[
                  s.micText,
                  dictation.state === 'listening' && { color: colors['accent-ink'] },
                ]}
              >
                {dictation.state === 'listening' ? 'Listening — tap to stop' : 'Say it instead'}
              </Text>
            </Pressable>
          </View>

          {dictation.state === 'listening' && dictation.transcript.length > 0 && (
            <Text style={s.heard}>“{dictation.transcript}”</Text>
          )}

          {dictation.state === 'denied' && (
            <Text style={s.warn}>
              Microphone or speech access is off. Settings → RASEED to turn it on — or just type
              it, which works identically.
            </Text>
          )}

          {dictation.state === 'unsupported' && (
            <Text style={s.warn}>
              This device cannot recognise speech without sending audio away, so it was not
              started. Type it instead.
            </Text>
          )}

          {dictation.error && <Text style={s.warn}>{dictation.error}</Text>}

          <View
            style={s.accounts}
            accessibilityRole="radiogroup"
            accessibilityLabel="Account, which decides what a bare number means"
          >
            {accounts.map((a) => {
              const on = a.id === account?.id
              return (
                <Pressable
                  key={a.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setAccountId(a.id)
                    // Re-read against the new currency: leaving stale drafts on screen after
                    // changing the thing they depend on is how a wrong number gets saved.
                    if (parsed) setParsed(null)
                  }}
                  style={[
                    s.accountChip,
                    on && { borderColor: a.currency === 'AED' ? colors.aed : colors.inr },
                  ]}
                >
                  <Text
                    style={[
                      s.accountText,
                      on && { color: a.currency === 'AED' ? colors.aed : colors.inr },
                    ]}
                  >
                    {a.name} · {a.currency}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <View style={s.actions}>
            <View style={s.grow}>
              <PrimaryButton label="Read it" onPress={read} disabled={text.trim().length === 0} />
            </View>
          </View>

          <Text style={s.privacy}>
            Read on this phone by a parser with no network access. Nothing is sent anywhere, and
            nothing is written until you save.
          </Text>

          {parsed && (
            <>
              <View style={s.summaryRow}>
                <Text style={s.section}>
                  {writable.length} {writable.length === 1 ? 'transaction' : 'transactions'}
                </Text>
                <Text style={s.latency}>{latencyMs}ms</Text>
              </View>

              {parsed.drafts.map((draft, i) => {
                const isDropped = dropped.includes(i)
                const unsure = draft.confidence < CONFIDENT
                return (
                  <Pressable
                    key={`${draft.source}-${i}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: !isDropped }}
                    accessibilityLabel={`${draft.merchantText || 'unnamed'}, ${format(money(draft.amountMinor, draft.currency))}`}
                    onPress={() =>
                      setDropped((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]))
                    }
                    style={[s.draft, isDropped && s.draftOff]}
                  >
                    <View style={s.draftTop}>
                      <Text style={s.merchant} numberOfLines={1}>
                        {draft.merchantText || 'Not named'}
                      </Text>
                      <Text
                        style={[
                          s.amount,
                          { color: draft.currency === 'AED' ? colors.aed : colors.inr },
                        ]}
                      >
                        {format(money(draft.amountMinor, draft.currency))}
                      </Text>
                    </View>

                    <Text style={s.source}>from “{draft.source}”</Text>

                    <View style={s.tags}>
                      {draft.type !== 'spend' && (
                        <Badge tone="warn">{draft.type} — not written</Badge>
                      )}
                      {unsure && draft.type === 'spend' && <Badge tone="warn">worth checking</Badge>}
                      {isDropped && <Badge>skipped</Badge>}
                    </View>
                  </Pressable>
                )
              })}

              {parsed.unparsed.length > 0 && (
                <View style={s.unparsed}>
                  <Text style={s.unparsedTitle}>Could not read an amount in:</Text>
                  {parsed.unparsed.map((u) => (
                    <Text key={u} style={s.unparsedLine}>
                      · {u}
                    </Text>
                  ))}
                  <Text style={s.note}>
                    Shown rather than dropped. A clause that vanishes silently is how a capture
                    tool teaches you not to trust it.
                  </Text>
                </View>
              )}

              <View style={s.actions}>
                <View style={s.grow}>
                  <PrimaryButton
                    label={`Save ${writable.length}`}
                    onPress={save}
                    disabled={writable.length === 0}
                  />
                </View>
                <View style={s.grow}>
                  <SecondaryButton label="Discard" onPress={discard} />
                </View>
              </View>
            </>
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
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    cancel: { color: c['text-lo'], fontFamily: font.body, fontSize: 15 },
    title: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 15 },
    spacer: { width: 50 },

    content: { padding: space[5], paddingBottom: space[12], gap: space[3] },
    input: {
      minHeight: 96,
      color: c['text-hi'],
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.lg,
      padding: space[4],
      fontFamily: font.body,
      fontSize: 17,
      lineHeight: 24,
      textAlignVertical: 'top',
    },

    micRow: { flexDirection: 'row' },
    mic: {
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.full,
      paddingHorizontal: space[4],
      paddingVertical: space[2],
    },
    micText: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 13 },
    heard: { color: c['text-lo'], fontFamily: font.body, fontSize: 14, fontStyle: 'italic' },
    warn: { color: c.warn, fontFamily: font.body, fontSize: 12, lineHeight: 18 },

    accounts: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    accountChip: {
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.full,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
    },
    accountText: { color: c['text-lo'], fontFamily: font.bodyMedium, fontSize: 12 },

    actions: { flexDirection: 'row', gap: space[2] },
    grow: { flex: 1 },

    privacy: { color: c['text-lo'], fontFamily: font.body, fontSize: 11, lineHeight: 17 },

    summaryRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: space[3],
    },
    section: { color: c['text-lo'], fontFamily: font.bodyMedium, fontSize: 12 },
    latency: {
      color: c['text-lo'],
      fontFamily: font.mono,
      fontSize: 11,
      fontVariant: ['tabular-nums'],
      writingDirection: 'ltr',
    },

    draft: {
      backgroundColor: c['surface-1'],
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.lg,
      padding: space[4],
      gap: space[1],
    },
    draftOff: { opacity: 0.45 },
    draftTop: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: space[3],
    },
    merchant: { color: c['text-hi'], fontFamily: font.body, fontSize: 16, flexShrink: 1 },
    amount: {
      fontFamily: font.monoMedium,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
      writingDirection: 'ltr',
    },
    source: { color: c['text-lo'], fontFamily: font.body, fontSize: 12 },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[2] },

    unparsed: {
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.lg,
      padding: space[4],
      gap: space[1],
    },
    unparsedTitle: { color: c['text-hi'], fontFamily: font.bodyMedium, fontSize: 13 },
    unparsedLine: { color: c['text-lo'], fontFamily: font.mono, fontSize: 12 },
    note: { color: c['text-lo'], fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: space[2] },
  })
