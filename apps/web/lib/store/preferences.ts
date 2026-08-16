/**
 * Everything the daily loop needs to remember between visits: worth-it ratings, custom
 * categories, and which nudges have already been shown this week.
 *
 * Same storage story as the ledger — localStorage, this browser only, never a server.
 */

const RATINGS_KEY = 'raseed.ratings.v1'
const CATEGORIES_KEY = 'raseed.categories.v1'
const NUDGES_KEY = 'raseed.nudges.v1'

export type WorthScore = -1 | 0 | 1

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota or private mode. Losing a rating is not worth throwing mid-interaction.
  }
}

// ── worth-it ratings ────────────────────────────────────────────────────────

export type Ratings = Record<string, WorthScore>

export function ratings(): Ratings {
  return read<Ratings>(RATINGS_KEY, {})
}

export function rate(transactionId: string, score: WorthScore): void {
  write(RATINGS_KEY, { ...ratings(), [transactionId]: score })
}

export function unrate(transactionId: string): void {
  const all = ratings()
  delete all[transactionId]
  write(RATINGS_KEY, all)
}

// ── custom categories ───────────────────────────────────────────────────────

export interface CustomCategory {
  id: string
  name: string
  kind: 'need' | 'want' | 'save'
}

export function customCategories(): CustomCategory[] {
  return read<CustomCategory[]>(CATEGORIES_KEY, [])
}

export function addCategory(name: string, kind: CustomCategory['kind']): CustomCategory {
  const trimmed = name.trim()
  const existing = customCategories()
  // Slug from the name so re-adding the same category does not create a duplicate id.
  const id = `cat-custom-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  if (existing.some((c) => c.id === id)) return existing.find((c) => c.id === id)!

  const created: CustomCategory = { id, name: trimmed, kind }
  write(CATEGORIES_KEY, [...existing, created])
  return created
}

export function removeCategory(id: string): void {
  write(
    CATEGORIES_KEY,
    customCategories().filter((c) => c.id !== id),
  )
}

// ── nudge budget ────────────────────────────────────────────────────────────

interface NudgeLog {
  /** ISO week key, e.g. 2026-W33. Resets the count when the week rolls over. */
  week: string
  sent: string[]
}

/** ISO week key for a timestamp. Weeks start Monday, which is when a budget resets. */
export function isoWeek(at: number): string {
  const d = new Date(at)
  const day = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3) // nearest Thursday defines the ISO year
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const week =
    1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function nudgesSentThisWeek(at: number): string[] {
  const log = read<NudgeLog>(NUDGES_KEY, { week: '', sent: [] })
  return log.week === isoWeek(at) ? log.sent : []
}

export function markNudgeSent(id: string, at: number): void {
  const week = isoWeek(at)
  const log = read<NudgeLog>(NUDGES_KEY, { week, sent: [] })
  const sent = log.week === week ? log.sent : []
  if (!sent.includes(id)) write(NUDGES_KEY, { week, sent: [...sent, id] })
}

// ── wallet counts ──────────────────────────────────────────────────────────

const CASH_KEY = 'raseed.cash-counts.v1'

export interface CashCount {
  /** When you counted. */
  at: number
  /** What was in the wallet, in INR minor units. */
  countedMinor: number
}

/** Newest last. */
export function cashCounts(): CashCount[] {
  return read<CashCount[]>(CASH_KEY, [])
}

export function lastCashCount(): CashCount | null {
  const all = cashCounts()
  return all[all.length - 1] ?? null
}

/** Stamps its own clock and returns the record, so the caller does not have to read one. */
export function addCashCount(countedMinor: number): CashCount {
  const count: CashCount = { at: Date.now(), countedMinor }
  write(CASH_KEY, [...cashCounts(), count])
  return count
}
