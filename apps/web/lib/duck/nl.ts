import { lensAmount, type Lens } from './queries'
import { NOW } from './analytics'

/**
 * Natural language → SQL, deterministically.
 *
 * No LLM. A rules parser cannot answer everything, but it never hallucinates a number and
 * it works with no API key — and the generated SQL is always shown, because an
 * LLM-authored figure without its query visible is a figure nobody can check.
 *
 * The sandbox rules from WEB_ARCHITECTURE §P7 still apply to whatever this emits: single
 * statement, SELECT only, hard LIMIT.
 */

const DAY = 86_400_000

export interface ParsedQuery {
  sql: string
  /** What the parser believed you asked, in plain words. */
  interpretation: string
  /** Which phrases it actually understood — everything else was ignored. */
  matched: string[]
  chart: 'value' | 'bar' | 'line'
}

const PERIODS: { re: RegExp; days: number; label: string }[] = [
  { re: /\b(today)\b/i, days: 1, label: 'today' },
  { re: /\b(this week|last 7|past week|7 days)\b/i, days: 7, label: 'the last 7 days' },
  { re: /\b(this month|last 30|past month|30 days)\b/i, days: 30, label: 'the last 30 days' },
  { re: /\b(last 90|3 months|quarter|90 days)\b/i, days: 90, label: 'the last 90 days' },
  { re: /\b(6 months|180 days|half year)\b/i, days: 180, label: 'the last 6 months' },
  { re: /\b(this year|last 12|year|12 months)\b/i, days: 365, label: 'the last year' },
  { re: /\b(all time|ever|everything)\b/i, days: 100_000, label: 'all time' },
]

const CATEGORY_HINTS: Record<string, string[]> = {
  'Eating out': ['food', 'eating', 'restaurant', 'swiggy', 'zomato', 'talabat', 'delivery', 'dining'],
  Groceries: ['grocer', 'bigbasket', 'carrefour', 'supermarket'],
  Transport: ['transport', 'uber', 'careem', 'taxi', 'petrol', 'fuel', 'salik', 'toll', 'auto'],
  Rent: ['rent', 'landlord', 'housing'],
  Subscriptions: ['subscription', 'netflix', 'spotify', 'streaming'],
  Utilities: ['utility', 'utilities', 'jio', 'phone', 'internet', 'bill'],
  Shopping: ['shopping', 'clothes', 'amazon'],
  Health: ['health', 'medical', 'pharmacy', 'doctor'],
}

const SHAPE = {
  count: /\b(how many|count|number of|times)\b/i,
  average: /\b(average|avg|mean|typical)\b/i,
  biggest: /\b(biggest|largest|top|most expensive|highest)\b/i,
  byCategory: /\b(by category|per category|breakdown|split|where did)\b/i,
  byMerchant: /\b(by merchant|per merchant|which merchant|who)\b/i,
  overTime: /\b(over time|trend|per day|daily|by day|each day)\b/i,
}

const AED_ONLY = /\b(aed|dirham|dubai|uae|emirates)\b/i
const INR_ONLY = /\b(inr|rupee|india|indian)\b/i

/**
 * Parses what it can and reports what it ignored. Returns null when nothing matched, so the
 * UI can say "I did not understand that" rather than silently answering a different question.
 */
export function parseQuestion(input: string, lens: Lens): ParsedQuery | null {
  const q = input.trim()
  if (q.length < 2) return null

  const matched: string[] = []
  // Predicates are built as functions of the table alias so they can be rendered for a
  // bare `v_spend` or an aliased join without any string surgery afterwards.
  const predicates: ((a: string) => string)[] = []

  // Period
  const period = PERIODS.find((p) => p.re.test(q))
  const days = period?.days ?? 30
  if (period) matched.push(period.label)
  predicates.push((a) => `${a}occurred_at >= ${NOW - days * DAY}`)

  // Category
  let category: string | null = null
  for (const [name, hints] of Object.entries(CATEGORY_HINTS)) {
    if (hints.some((h) => new RegExp(`\\b${h}`, 'i').test(q))) {
      category = name
      break
    }
  }
  if (category) {
    matched.push(`category “${category}”`)
    predicates.push((a) => `${a}category_id IN (SELECT id FROM categories WHERE name = '${category}')`)
  }

  // Currency filter
  if (AED_ONLY.test(q) && !INR_ONLY.test(q)) {
    matched.push('AED only')
    predicates.push((a) => `${a}currency = 'AED'`)
  } else if (INR_ONLY.test(q) && !AED_ONLY.test(q)) {
    matched.push('INR only')
    predicates.push((a) => `${a}currency = 'INR'`)
  }

  if (matched.length === 0 && !Object.values(SHAPE).some((re) => re.test(q))) return null


  const amount = lensAmount(lens)
  const render = (alias = '') => predicates.map((p) => p(alias ? `${alias}.` : '')).join('\n  AND ')
  const clause = render()
  const clauseS = render('s')
  const periodLabel = period?.label ?? 'the last 30 days'

  if (SHAPE.byMerchant.test(q) || SHAPE.biggest.test(q)) {
    matched.push('grouped by merchant')
    return {
      sql: `SELECT COALESCE(m.canonical_name, 'Unknown') AS label,
       SUM(${lensAmount(lens, 's')})::BIGINT AS value
FROM v_spend s
LEFT JOIN merchants m ON m.id = s.merchant_id
WHERE ${clauseS}
GROUP BY 1 ORDER BY value DESC LIMIT 12;`,
      interpretation: `Spend by merchant over ${periodLabel}${category ? `, in ${category}` : ''}.`,
      matched,
      chart: 'bar',
    }
  }

  if (SHAPE.byCategory.test(q)) {
    matched.push('grouped by category')
    return {
      sql: `SELECT COALESCE(c.name, 'Uncategorised') AS label,
       SUM(${lensAmount(lens, 's')})::BIGINT AS value
FROM v_spend s
LEFT JOIN categories c ON c.id = s.category_id
WHERE ${clauseS}
GROUP BY 1 ORDER BY value DESC LIMIT 12;`,
      interpretation: `Spend by category over ${periodLabel}.`,
      matched,
      chart: 'bar',
    }
  }

  if (SHAPE.overTime.test(q)) {
    matched.push('over time')
    return {
      sql: `SELECT CAST(epoch_ms(occurred_at) AS DATE)::VARCHAR AS label,
       SUM(${amount})::BIGINT AS value
FROM v_spend
WHERE ${clause}
GROUP BY 1 ORDER BY 1 LIMIT 400;`,
      interpretation: `Daily spend over ${periodLabel}${category ? `, in ${category}` : ''}.`,
      matched,
      chart: 'line',
    }
  }

  if (SHAPE.count.test(q)) {
    matched.push('a count')
    return {
      sql: `SELECT 'transactions' AS label, COUNT(*)::BIGINT AS value
FROM v_spend WHERE ${clause};`,
      interpretation: `How many transactions over ${periodLabel}${category ? `, in ${category}` : ''}.`,
      matched,
      chart: 'value',
    }
  }

  if (SHAPE.average.test(q)) {
    matched.push('an average')
    return {
      sql: `SELECT 'average transaction' AS label, COALESCE(AVG(${amount}), 0)::BIGINT AS value
FROM v_spend WHERE ${clause};`,
      interpretation: `Average transaction over ${periodLabel}${category ? `, in ${category}` : ''}.`,
      matched,
      chart: 'value',
    }
  }

  return {
    sql: `SELECT 'total' AS label, COALESCE(SUM(${amount}), 0)::BIGINT AS value
FROM v_spend WHERE ${clause};`,
    interpretation: `Total spend over ${periodLabel}${category ? `, in ${category}` : ''}.`,
    matched,
    chart: 'value',
  }
}

/**
 * The sandbox. Applies to any SQL that reaches DuckDB from this path, whether a rule wrote
 * it or a model did later.
 */
const BANNED = /\b(ATTACH|INSTALL|LOAD|COPY|PRAGMA|CREATE|DROP|ALTER|UPDATE|DELETE|INSERT|EXPORT)\b/i

/**
 * The row cap the spec names (`WEB_ARCHITECTURE` §5 P7).
 *
 * DuckDB will happily return a million rows into the main thread and the tab will stop
 * responding while it builds the array. The cap is a liveness guarantee, not a security one —
 * but "the browser froze" is the failure users actually hit.
 */
export const ROW_CAP = 5000

/** Add `LIMIT` when the statement has none. An existing tighter limit is left alone. */
export function withRowCap(sql: string, cap = ROW_CAP): string {
  const trimmed = sql.trim().replace(/;\s*$/, '')
  const existing = /\bLIMIT\s+(\d+)\s*$/i.exec(trimmed)
  if (existing) {
    // Never widen a limit the query already chose — the templates use 12 and 400 on purpose.
    return Number(existing[1]) <= cap ? `${trimmed};` : `${trimmed.replace(/\bLIMIT\s+\d+\s*$/i, `LIMIT ${cap}`)};`
  }
  return `${trimmed} LIMIT ${cap};`
}

export function isSafe(sql: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = sql.trim()
  if (!/^SELECT\b/i.test(trimmed) && !/^WITH\b/i.test(trimmed)) {
    return { ok: false, reason: 'Only SELECT statements are allowed.' }
  }
  // One statement: a trailing semicolon is fine, an interior one is not.
  if (trimmed.replace(/;\s*$/, '').includes(';')) {
    return { ok: false, reason: 'Only a single statement is allowed.' }
  }
  if (BANNED.test(trimmed)) {
    return { ok: false, reason: 'That statement type is not permitted in the query bar.' }
  }
  return { ok: true }
}

export const EXAMPLES = [
  'how much on food last 90 days',
  'spend by category this month',
  'biggest merchants this year',
  'daily spend over time',
  'how many transactions this month',
  'average transaction in transport',
  'how much in AED last 30 days',
] as const
