/**
 * Ask-your-ledger — the question half, with no SQL in it.
 *
 * A natural-language query has two parts: working out what was asked, and rendering that as a
 * query for whichever database you are holding. Only the second half differs between the
 * dashboard's DuckDB and the phone's SQLite, so only the second half should be written twice.
 *
 * This is the first half. It returns an **intent**, never a string of SQL, which is what makes
 * it safe to share: there is no dialect to get wrong and nothing here can emit a statement at
 * all. Each surface maps an intent onto its own tables, and both are answering the same question
 * because both parsed it with this.
 *
 * Deterministic on purpose, not as a placeholder for a model. A parser that can only produce
 * one of a fixed set of intents cannot be talked into producing a seventh, which is a stronger
 * guarantee than any amount of validating a model's output — and it works offline, costs
 * nothing, and never sees your ledger.
 */

export type AskIntent =
  | { readonly kind: 'total'; readonly days: number; readonly category?: string }
  | { readonly kind: 'byCategory'; readonly days: number; readonly limit: number }
  | { readonly kind: 'byMerchant'; readonly days: number; readonly limit: number }
  | { readonly kind: 'largest'; readonly days: number; readonly limit: number }
  | { readonly kind: 'count'; readonly days: number }
  | { readonly kind: 'average'; readonly days: number }

export interface Ask {
  readonly intent: AskIntent
  /** Echoed back so the answer can state what it understood rather than only what it found. */
  readonly restated: string
}

/** Windows people actually say, longest phrase first so "last 3 months" beats "month". */
const WINDOWS: readonly (readonly [RegExp, number, string])[] = [
  [/\blast (\d+)\s*days?\b/i, 0, ''], // captured below
  [/\b(?:this|last|past)\s*week\b/i, 7, 'the last week'],
  [/\b(?:this|last|past)\s*(?:month|30 days)\b/i, 30, 'the last 30 days'],
  [/\b(?:last|past)\s*3\s*months\b|\bquarter\b/i, 90, 'the last 3 months'],
  [/\b(?:this|last|past)\s*year\b|\b12 months\b/i, 365, 'the last year'],
  [/\byesterday\b/i, 1, 'yesterday'],
  [/\btoday\b/i, 0.5, 'today'],
]

const DEFAULT_DAYS = 30
const DEFAULT_LIMIT = 5

function windowOf(input: string): { days: number; label: string } {
  const explicit = /\blast (\d+)\s*days?\b/i.exec(input)
  if (explicit?.[1]) {
    const n = Number(explicit[1])
    if (Number.isFinite(n) && n > 0) return { days: n, label: `the last ${n} days` }
  }
  for (const [pattern, days, label] of WINDOWS) {
    if (days > 0 && pattern.test(input)) return { days, label }
  }
  return { days: DEFAULT_DAYS, label: 'the last 30 days' }
}

function limitOf(input: string): number {
  const match = /\btop\s*(\d+)\b/i.exec(input)
  if (match?.[1]) {
    const n = Number(match[1])
    if (Number.isFinite(n) && n > 0) return Math.min(20, n)
  }
  return DEFAULT_LIMIT
}

/**
 * Read a question.
 *
 * Returns `null` rather than guessing. A query tool that answers *something* for every input
 * teaches you to trust an answer it had no basis for, and on a finance screen that is worse
 * than a shrug.
 */
export function parseAsk(input: string): Ask | null {
  const q = input.trim().toLowerCase()
  if (q.length === 0) return null

  const { days, label } = windowOf(q)
  const limit = limitOf(q)

  // Order matters: "how many" is a count even though it contains "how", and "how much on
  // average" is an average even though it starts like a total.
  if (/\baverage|\bmean\b|\btypical\b/.test(q)) {
    return { intent: { kind: 'average', days }, restated: `A typical day over ${label}` }
  }
  if (/\bhow many\b|\bcount\b|\bnumber of\b/.test(q)) {
    return { intent: { kind: 'count', days }, restated: `Transactions in ${label}` }
  }
  if (/\bbiggest\b|\blargest\b|\bmost expensive\b|\btop spends?\b/.test(q)) {
    return {
      intent: { kind: 'largest', days, limit },
      restated: `The ${limit} largest in ${label}`,
    }
  }
  if (/\bmerchants?\b|\bwhere\b|\bwho\b|\bshops?\b/.test(q)) {
    return {
      intent: { kind: 'byMerchant', days, limit },
      restated: `Top ${limit} merchants in ${label}`,
    }
  }
  if (/\bcategor(?:y|ies)\b|\bwhat on\b|\bbreakdown\b|\bsplit by\b/.test(q)) {
    return {
      intent: { kind: 'byCategory', days, limit },
      restated: `Top ${limit} categories in ${label}`,
    }
  }
  if (/\bhow much\b|\btotal\b|\bspent\b|\bspend\b/.test(q)) {
    return { intent: { kind: 'total', days }, restated: `Total spend in ${label}` }
  }

  return null
}

/** Shown when the box is empty. Real questions, so the first attempt is not a guess. */
export const ASK_EXAMPLES = [
  'How much did I spend last month?',
  'Top 5 merchants this month',
  'What were my biggest 3 spends last 90 days?',
  'How many transactions this week?',
  'A typical day over the last year',
] as const
