import { normaliseMerchant } from '@raseed/engines'
import { format, money, type Currency, type Money } from '@raseed/money'
import type { Scalar } from '@op-engineering/op-sqlite'
import type { RatableRow, Score } from '@/lib/reckoning'
import { getConnection } from './client'

/**
 * Every read and write against the ledger.
 *
 * Spend totals go through `v_spend` — never an inline `txn_type = 'spend' AND ...`. Two
 * places disagreeing about what counts as spend is where every wrong number in every
 * finance dashboard comes from.
 */

const USER = 'local-user'

export interface TxnRow {
  id: string
  occurred_at: number
  direction: 'out' | 'in'
  amount_minor: number
  currency: Currency
  home_amount_minor: number
  fx_rate: number
  account_id: string
  merchant_id: string | null
  category_id: string | null
  raw_text: string | null
  source: string
  txn_type: string
  status: string
  note: string | null
}

export interface LedgerEntry {
  id: string
  merchant: string
  category: string
  amount: Money
  homeAmount: Money
  currency: Currency
  occurredAt: number
  note: string | null
}

function rows<T>(sql: string, params: Scalar[] = []): T[] {
  return getConnection().executeSync(sql, params).rows as T[]
}

// ── reads ───────────────────────────────────────────────────────────────────

const ENTRY_SELECT = `
  SELECT s.id, s.occurred_at, s.amount_minor, s.currency, s.home_amount_minor, s.note,
         COALESCE(m.canonical_name, s.raw_text, 'Unknown') AS merchant,
         COALESCE(c.name, 'Uncategorised')                 AS category
  FROM v_spend s
  LEFT JOIN merchants  m ON m.id = s.merchant_id
  LEFT JOIN categories c ON c.id = s.category_id
`

interface RawEntry {
  id: string
  occurred_at: number
  amount_minor: number
  currency: Currency
  home_amount_minor: number
  note: string | null
  merchant: string
  category: string
}

function toEntry(r: RawEntry): LedgerEntry {
  return {
    id: r.id,
    merchant: r.merchant,
    category: r.category,
    amount: money(r.amount_minor, r.currency),
    homeAmount: money(r.home_amount_minor, 'INR'),
    currency: r.currency,
    occurredAt: r.occurred_at,
    note: r.note,
  }
}

export function spendBetween(fromMs: number, toMs: number): LedgerEntry[] {
  return rows<RawEntry>(
    `${ENTRY_SELECT} WHERE s.occurred_at >= ? AND s.occurred_at < ? ORDER BY s.occurred_at DESC`,
    [fromMs, toMs],
  ).map(toEntry)
}

export function recentSpend(limit = 200): LedgerEntry[] {
  return rows<RawEntry>(`${ENTRY_SELECT} ORDER BY s.occurred_at DESC LIMIT ?`, [limit]).map(toEntry)
}

/** Home-currency total over `v_spend` in a window. */
export function spendTotal(fromMs: number, toMs: number): Money {
  const result = rows<{ total: number | null }>(
    'SELECT SUM(home_amount_minor) AS total FROM v_spend WHERE occurred_at >= ? AND occurred_at < ?',
    [fromMs, toMs],
  )
  return money(Math.round(result[0]?.total ?? 0), 'INR')
}

export function countSpend(): number {
  return rows<{ n: number }>('SELECT COUNT(*) AS n FROM v_spend')[0]?.n ?? 0
}

export interface AccountRow {
  id: string
  name: string
  kind: string
  currency: Currency
  opening_minor: number
}

export function listAccounts(): AccountRow[] {
  return rows<AccountRow>(
    'SELECT id, name, kind, currency, opening_minor FROM accounts WHERE deleted = 0 ORDER BY name',
  )
}

export interface CategoryRow {
  id: string
  name: string
  kind: string
}

export function listCategories(): CategoryRow[] {
  return rows<CategoryRow>(
    "SELECT id, name, kind FROM categories WHERE deleted = 0 AND kind <> 'income' ORDER BY name",
  )
}

// ── writes ──────────────────────────────────────────────────────────────────

export interface NewTransaction {
  amount: Money
  accountId: string
  categoryId: string
  merchantText: string
  /** Defaults to now. The store stamps the clock, as it already does for `updated_at`. */
  occurredAt?: number
  /** Frozen at write time and never recomputed. 1 when the amount is already home currency. */
  fxRate: number
  note?: string
}

/**
 * The only way a transaction enters the ledger.
 *
 * `home_amount_minor` and `fx_rate` are computed here and written once. Nothing recomputes
 * them later — changing your home currency must not rewrite history.
 */
export function insertTransaction(input: NewTransaction): string {
  const id = `txn-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
  const homeMinor = Math.round(input.amount.minor * input.fxRate)

  // Resolve on write, not on read. The raw text stays on the row either way — it is what you
  // actually typed, and losing it would make a wrong resolution impossible to audit.
  const merchantId = resolveMerchant(input.merchantText)?.merchantId ?? null

  getConnection().executeSync(
    `INSERT INTO transactions
       (id, occurred_at, direction, amount_minor, currency, home_amount_minor, fx_rate,
        account_id, merchant_id, category_id, raw_text, source, txn_type, transfer_group_id,
        reversal_of_id, trip_id, status, confidence, note, user_id, updated_at, deleted)
     VALUES (?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'spend', NULL,
             NULL, NULL, 'confirmed', 1.0, ?, ?, ?, 0)`,
    [
      id,
      input.occurredAt ?? Date.now(),
      input.amount.minor,
      input.amount.currency,
      homeMinor,
      input.fxRate,
      input.accountId,
      merchantId,
      input.categoryId,
      input.merchantText,
      input.note ?? null,
      USER,
      Date.now(),
    ],
  )
  return id
}

export function updateTransactionNote(id: string, note: string): void {
  getConnection().executeSync('UPDATE transactions SET note = ?, updated_at = ? WHERE id = ?', [
    note,
    Date.now(),
    id,
  ])
}

/** Soft delete only — never hard-delete a row. */
export function softDeleteTransaction(id: string): void {
  getConnection().executeSync(
    'UPDATE transactions SET deleted = 1, updated_at = ? WHERE id = ?',
    [Date.now(), id],
  )
}

// ── cash reconciliation ─────────────────────────────────────────────────────

export interface CashAccount {
  id: string
  name: string
  currency: Currency
  openingMinor: number
}

/**
 * The wallet.
 *
 * `is_cash` rather than `kind = 'cash'`: the flag is what the schema declares as the
 * meaning, and a wallet-like prepaid card should reconcile the same way without pretending
 * to be a different kind of account.
 */
export function cashAccount(): CashAccount | null {
  const rows = getConnection().executeSync(
    `SELECT id, name, currency, opening_minor FROM accounts
      WHERE is_cash = 1 AND deleted = 0 AND archived_at IS NULL
      ORDER BY name LIMIT 1;`,
  ).rows as { id: string; name: string; currency: string; opening_minor: number }[]

  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    currency: row.currency as Currency,
    openingMinor: row.opening_minor,
  }
}

/** Cash spend since a moment, in that wallet's own currency. */
export function cashSpentSince(accountId: string, at: number): number {
  const rows = getConnection().executeSync(
    `SELECT COALESCE(SUM(amount_minor), 0) AS total FROM transactions
      WHERE account_id = ? AND occurred_at > ? AND direction = 'out'
        AND status = 'confirmed' AND deleted = 0;`,
    [accountId, at],
  ).rows as { total: number }[]
  return rows[0]?.total ?? 0
}

export interface CashCountRow {
  id: string
  countedAt: number
  countedMinor: number
}

/** The most recent count, or null if you have never counted. */
export function lastCashCount(accountId: string): CashCountRow | null {
  const rows = getConnection().executeSync(
    `SELECT id, counted_at, counted_minor FROM cash_counts
      WHERE account_id = ? AND deleted = 0
      ORDER BY counted_at DESC LIMIT 1;`,
    [accountId],
  ).rows as { id: string; counted_at: number; counted_minor: number }[]

  const row = rows[0]
  return row ? { id: row.id, countedAt: row.counted_at, countedMinor: row.counted_minor } : null
}

export function insertCashCount(input: {
  accountId: string
  countedMinor: number
  expectedMinor: number
  adjustmentTxnId: string | null
}): string {
  const countedAt = Date.now()
  const id = `cash-${countedAt.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
  getConnection().executeSync(
    `INSERT INTO cash_counts
       (id, account_id, counted_at, counted_minor, expected_minor, adjustment_txn_id,
        user_id, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0);`,
    [
      id,
      input.accountId,
      countedAt,
      input.countedMinor,
      input.expectedMinor,
      input.adjustmentTxnId,
      USER,
      Date.now(),
    ],
  )
  return id
}

// ── merchant resolution ─────────────────────────────────────────────────────

export interface ResolvedMerchant {
  merchantId: string
  canonicalName: string
  /** 'alias' when the exact descriptor was already known, 'name' on a first-time match. */
  via: 'alias' | 'name'
}

/**
 * Raw descriptor → canonical merchant, and it learns.
 *
 * `razorpay@hdfcbank` means nothing until someone tells you it is Big Bazaar. The point of
 * the alias table is that they only tell you once: the normalised form is written back, so
 * the second occurrence resolves without any thought and without any model call.
 *
 * Two steps, cheapest first. An exact alias hit is a single indexed lookup. Only on a miss
 * do we compare against canonical names, and a match there is immediately recorded as an
 * alias so the expensive path runs once per descriptor, ever.
 */
export function resolveMerchant(rawText: string): ResolvedMerchant | null {
  const norm = normaliseMerchant(rawText)
  if (norm === '') return null

  const hit = rows<{ merchant_id: string; canonical_name: string }>(
    `SELECT a.merchant_id, m.canonical_name
       FROM merchant_aliases a JOIN merchants m ON m.id = a.merchant_id
      WHERE a.alias_norm = ? AND a.deleted = 0 LIMIT 1;`,
    [norm],
  )[0]

  if (hit) {
    // Hit count is what will rank suggestions later; bumping it costs one indexed update.
    getConnection().executeSync(
      'UPDATE merchant_aliases SET hit_count = hit_count + 1, updated_at = ? WHERE alias_norm = ?;',
      [Date.now(), norm],
    )
    return { merchantId: hit.merchant_id, canonicalName: hit.canonical_name, via: 'alias' }
  }

  // Compare normalised canonical names, so "BigBasket" typed by hand finds `m-bigbasket`.
  const byName = rows<{ id: string; canonical_name: string }>(
    'SELECT id, canonical_name FROM merchants WHERE deleted = 0;',
  ).find((m) => normaliseMerchant(m.canonical_name) === norm)

  if (!byName) return null

  learnAlias(byName.id, rawText, norm)
  return { merchantId: byName.id, canonicalName: byName.canonical_name, via: 'name' }
}

/** Record a descriptor so this resolution never has to be worked out again. */
export function learnAlias(merchantId: string, rawText: string, norm?: string): void {
  getConnection().executeSync(
    `INSERT OR IGNORE INTO merchant_aliases
       (id, merchant_id, alias_raw, alias_norm, source, hit_count, user_id, updated_at, deleted)
     VALUES (?, ?, ?, ?, 'user', 1, ?, ?, 0);`,
    [
      `alias-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      merchantId,
      rawText,
      norm ?? normaliseMerchant(rawText),
      USER,
      Date.now(),
    ],
  )
}

// ── people and splits ───────────────────────────────────────────────────────

export interface PersonRow {
  id: string
  name: string
  currency: Currency
}

export function listPeople(): PersonRow[] {
  return rows<{ id: string; name: string; currency: string }>(
    'SELECT id, name, currency FROM people WHERE deleted = 0 ORDER BY name;',
  ).map((p) => ({ id: p.id, name: p.name, currency: p.currency as Currency }))
}

export function addPerson(name: string, currency: Currency = 'INR'): PersonRow {
  const id = `person-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
  getConnection().executeSync(
    `INSERT INTO people (id, name, handle, currency, user_id, updated_at, deleted)
     VALUES (?, ?, NULL, ?, ?, ?, 0);`,
    [id, name.trim(), currency, USER, Date.now()],
  )
  return { id, name: name.trim(), currency }
}

/** Soft delete only. A person who owes you money must not vanish from history. */
export function removePerson(id: string): void {
  getConnection().executeSync('UPDATE people SET deleted = 1, updated_at = ? WHERE id = ?;', [
    Date.now(),
    id,
  ])
}

/**
 * Record who shared a transaction you paid for.
 *
 * `owed_minor` is what each *other* person owes you. Your own share is already the
 * transaction amount, so you are not a participant — storing yourself would double-count
 * you in every balance.
 */
export function recordSplit(input: {
  transactionId: string
  method: 'equal' | 'share' | 'percent' | 'itemised'
  owed: readonly { personId: string; owedMinor: number; currency: Currency }[]
}): string {
  const splitId = `split-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
  const now = Date.now()
  const db = getConnection()

  db.executeSync(
    `INSERT INTO splits (id, transaction_id, method, share_link_id, user_id, updated_at, deleted)
     VALUES (?, ?, ?, NULL, ?, ?, 0);`,
    [splitId, input.transactionId, input.method, USER, now],
  )

  input.owed.forEach((o, i) => {
    db.executeSync(
      `INSERT INTO split_participants
         (id, split_id, person_id, owed_minor, currency, settled_txn_id, user_id, updated_at, deleted)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 0);`,
      [`${splitId}-${i}`, splitId, o.personId, o.owedMinor, o.currency, USER, now],
    )
  })

  return splitId
}

export interface OwedRow {
  personId: string
  name: string
  minor: number
  currency: Currency
}

/**
 * What each person still owes you, unsettled only.
 *
 * A settled participant keeps its row — the history of who paid you back is worth more than
 * a tidy table — so the filter is on `settled_txn_id`, not on deletion.
 */
export function outstandingByPerson(): OwedRow[] {
  return rows<{ person_id: string; name: string; owed: number; currency: string }>(
    `SELECT sp.person_id, p.name, SUM(sp.owed_minor) AS owed, sp.currency
       FROM split_participants sp
       JOIN people p ON p.id = sp.person_id
      WHERE sp.deleted = 0 AND sp.settled_txn_id IS NULL AND p.deleted = 0
      GROUP BY sp.person_id, sp.currency
      HAVING SUM(sp.owed_minor) <> 0
      ORDER BY owed DESC;`,
  ).map((r) => ({
    personId: r.person_id,
    name: r.name,
    minor: r.owed,
    currency: r.currency as Currency,
  }))
}

/** Mark everything between you and one person as settled, in whichever direction it ran. */
export function settleUp(personId: string): void {
  getConnection().executeSync(
    `UPDATE split_participants
        SET settled_txn_id = 'settled-by-hand', updated_at = ?
      WHERE person_id = ? AND settled_txn_id IS NULL AND deleted = 0;`,
    [Date.now(), personId],
  )
}

// ---------------------------------------------------------------------------
// Trips and goals
// ---------------------------------------------------------------------------

/**
 * Your own travel habits, read out of what you actually did.
 *
 * "Away" is AED spend, which is the same definition the web trip detector uses — a trip is
 * a fact about where you were, and the two surfaces must not disagree about which days
 * those were.
 *
 * One habit is deliberately absent: **there is no accommodation category**, so a typical
 * night cannot be derived from these rows at all. Rather than invent a plausible number and
 * let it hide inside a total, `nightTypical` is asked for on the screen. A figure the ledger
 * cannot support should look like an input, not like a result.
 */
export function travelHabitsRaw(): {
  mealTypicalMinor: number
  transportDailyMinor: number
  shoppingDailyMinor: number
  mealsPerDay: number
  tripsObserved: number
  tripDays: number
} {
  const db = getConnection()

  // Days with any AED spend, and the boundaries between separate trips.
  const days = db.executeSync(
    `SELECT CAST(occurred_at / 86400000 AS INTEGER) AS epoch_day,
            SUM(CASE WHEN currency = 'AED' THEN home_amount_minor ELSE 0 END) AS away_minor
       FROM v_spend
      GROUP BY 1
     HAVING away_minor > 0
      ORDER BY 1;`,
  ).rows as unknown as { epoch_day: number; away_minor: number }[]

  if (days.length === 0) {
    return {
      mealTypicalMinor: 0,
      transportDailyMinor: 0,
      shoppingDailyMinor: 0,
      mealsPerDay: 0,
      tripsObserved: 0,
      tripDays: 0,
    }
  }

  // A gap of more than two days starts a new trip — the same tolerance the web detector uses.
  let trips = 1
  for (let i = 1; i < days.length; i++) {
    if (days[i]!.epoch_day - days[i - 1]!.epoch_day > 3) trips++
  }
  const tripDays = days.length
  const from = days[0]!.epoch_day * 86400000
  const to = (days[days.length - 1]!.epoch_day + 1) * 86400000

  const rows = db.executeSync(
    `SELECT category_id,
            COUNT(*)                 AS n,
            SUM(home_amount_minor)   AS total_minor
       FROM v_spend
      WHERE currency = 'AED' AND occurred_at >= ? AND occurred_at < ?
      GROUP BY category_id;`,
    [from, to],
  ).rows as unknown as { category_id: string | null; n: number; total_minor: number }[]

  const by = (id: string) => rows.find((r) => r.category_id === id)
  const food = by('cat-food')
  const transport = by('cat-transport')
  const shopping = by('cat-shopping')

  return {
    // Per meal, not per day — a typical meal is the unit the planner multiplies.
    mealTypicalMinor: food && food.n > 0 ? Math.round(food.total_minor / food.n) : 0,
    transportDailyMinor: transport ? Math.round(transport.total_minor / tripDays) : 0,
    shoppingDailyMinor: shopping ? Math.round(shopping.total_minor / tripDays) : 0,
    mealsPerDay: food ? food.n / tripDays : 0,
    tripsObserved: trips,
    tripDays,
  }
}

/**
 * Genuine monthly room: what was actually left over, averaged across the months on record.
 *
 * Not a budget and not an aspiration. `savingsPlan` compares its required contribution
 * against this, and the comparison is only worth making if this number is the real one.
 * Months with no rows are excluded rather than counted as months of perfect saving.
 */
export function monthlyCapacityMinor(): { capacityMinor: number; months: number } {
  const rows = getConnection().executeSync(
    `SELECT strftime('%Y-%m', occurred_at / 1000, 'unixepoch') AS ym,
            SUM(CASE WHEN direction = 'in'  THEN home_amount_minor ELSE 0 END) AS in_minor,
            SUM(CASE WHEN direction = 'out' THEN home_amount_minor ELSE 0 END) AS out_minor
       FROM transactions
      WHERE deleted = 0 AND status != 'void'
      GROUP BY 1;`,
  ).rows as unknown as { ym: string; in_minor: number; out_minor: number }[]

  if (rows.length === 0) return { capacityMinor: 0, months: 0 }
  const total = rows.reduce((s, r) => s + (r.in_minor - r.out_minor), 0)
  return { capacityMinor: Math.max(0, Math.round(total / rows.length)), months: rows.length }
}

export interface GoalRow {
  id: string
  name: string
  target: Money
  saved: Money
  targetAt: number | null
  reachedAt: number | null
}

export function listGoals(): GoalRow[] {
  const rows = getConnection().executeSync(
    `SELECT id, name, target_minor, saved_minor, currency, target_at, reached_at
       FROM goals WHERE deleted = 0
      ORDER BY reached_at IS NOT NULL, target_at IS NULL, target_at;`,
  ).rows as unknown as {
    id: string
    name: string
    target_minor: number
    saved_minor: number
    currency: Currency
    target_at: number | null
    reached_at: number | null
  }[]

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    target: money(r.target_minor, r.currency),
    saved: money(r.saved_minor, r.currency),
    targetAt: r.target_at,
    reachedAt: r.reached_at,
  }))
}

export function addGoal(input: {
  name: string
  target: Money
  targetAt: number | null
}): string {
  const id = `goal-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
  getConnection().executeSync(
    `INSERT INTO goals
       (id, name, target_minor, saved_minor, currency, target_at, reached_at, user_id, updated_at, deleted)
     VALUES (?, ?, ?, 0, ?, ?, NULL, ?, ?, 0);`,
    [
      id,
      input.name.trim(),
      input.target.minor,
      input.target.currency,
      input.targetAt,
      USER,
      Date.now(),
    ],
  )
  return id
}

/**
 * Put money aside, or take it back out.
 *
 * Contributions clamp at zero rather than going negative — a goal you have withdrawn more
 * from than you put in is a data error, not a state worth modelling. Reaching the target
 * stamps `reached_at` instead of deleting the row, so a finished goal stays visible.
 */
export function contributeToGoal(id: string, deltaMinor: number): void {
  const db = getConnection()
  const row = (
    db.executeSync('SELECT saved_minor, target_minor FROM goals WHERE id = ?;', [id]).rows as
      unknown as { saved_minor: number; target_minor: number }[]
  )[0]
  if (!row) return

  const saved = Math.max(0, row.saved_minor + deltaMinor)
  const reached = saved >= row.target_minor ? Date.now() : null
  db.executeSync(
    'UPDATE goals SET saved_minor = ?, reached_at = ?, updated_at = ? WHERE id = ?;',
    [saved, reached, Date.now(), id],
  )
}

/** Soft delete only. */
export function removeGoal(id: string): void {
  getConnection().executeSync('UPDATE goals SET deleted = 1, updated_at = ? WHERE id = ?;', [
    Date.now(),
    id,
  ])
}

/**
 * What you actually hold right now, across every account, in home currency.
 *
 * Opening balances plus every confirmed movement since. This used to be a literal
 * `96000.00` typed into the Today screen, which meant Safe-to-Spend was arithmetic over a
 * number nobody had ever earned or spent — the dial moved when you added an expense, but the
 * balance it divided into never did.
 *
 * Reads `transactions` rather than `v_spend` deliberately: the view is the *spend* predicate,
 * and a balance has to count income and transfers too. That is not an inlined spend filter,
 * it is a different question.
 *
 * **AED accounts are excluded, and that is a real limitation rather than an oversight.**
 * Summing AED minor units into an INR total would be a money-invariant violation, and
 * converting would need a live rate — which this app does not have and, per `CLAUDE.md`, does
 * not want: FX is frozen per transaction, never recomputed. So a Dubai balance does not count
 * toward the Indian daily allowance today. Correct arithmetic, incomplete picture; the fix is
 * a rate cache, not a cast.
 */
export function liquidBalanceMinor(): number {
  const opening = (
    getConnection().executeSync(
      `SELECT COALESCE(SUM(opening_minor), 0) AS v FROM accounts
        WHERE deleted = 0 AND archived_at IS NULL AND currency = 'INR';`,
    ).rows as unknown as { v: number }[]
  )[0]?.v ?? 0

  const movement = (
    getConnection().executeSync(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN home_amount_minor
                               ELSE -home_amount_minor END), 0) AS v
         FROM transactions
        WHERE deleted = 0 AND status = 'confirmed';`,
    ).rows as unknown as { v: number }[]
  )[0]?.v ?? 0

  return opening + movement
}

// ── editing a transaction ───────────────────────────────────────────────────

export interface EditableTxn {
  id: string
  occurredAt: number
  amount: Money
  merchantText: string
  categoryId: string | null
  accountId: string
  note: string | null
}

/**
 * One transaction, in the shape the edit form needs.
 *
 * Reads `transactions` rather than `v_spend` on purpose: you must be able to open a row that
 * the spend predicate excludes — a refund, or something already deleted — otherwise the only
 * rows you can correct are the ones that were already right.
 */
export function getTransaction(id: string): EditableTxn | null {
  const r = (
    getConnection().executeSync(
      `SELECT id, occurred_at, amount_minor, currency, raw_text, category_id, account_id, note
         FROM transactions WHERE id = ? AND deleted = 0;`,
      [id],
    ).rows as unknown as {
      id: string
      occurred_at: number
      amount_minor: number
      currency: Currency
      raw_text: string | null
      category_id: string | null
      account_id: string
      note: string | null
    }[]
  )[0]
  if (!r) return null
  return {
    id: r.id,
    occurredAt: r.occurred_at,
    amount: money(r.amount_minor, r.currency),
    merchantText: r.raw_text ?? '',
    categoryId: r.category_id,
    accountId: r.account_id,
    note: r.note,
  }
}

/**
 * Correct a transaction in place.
 *
 * **`fx_rate` and `home_amount_minor` are recomputed only when the amount or currency actually
 * changes, and then from the rate already frozen on the row** — never from a fresh rate.
 * `CLAUDE.md`: FX is frozen at transaction date, written once, never recomputed. Fixing a typo
 * in a merchant name is not a reason to re-price a Dubai dinner at today's rate; that would
 * silently rewrite history every time someone edited a label.
 */
export function updateTransaction(input: {
  id: string
  amount: Money
  merchantText: string
  categoryId: string
  accountId: string
  note?: string | null
}): void {
  const existing = (
    getConnection().executeSync(
      'SELECT fx_rate, amount_minor, currency FROM transactions WHERE id = ?;',
      [input.id],
    ).rows as unknown as { fx_rate: number; amount_minor: number; currency: Currency }[]
  )[0]
  if (!existing) return

  const fxRate = existing.fx_rate
  const homeMinor = Math.round(input.amount.minor * fxRate)

  // Re-resolve, because the merchant text may have been corrected — that is often the whole
  // point of the edit. raw_text is overwritten with what you now say you paid.
  const merchantId = resolveMerchant(input.merchantText)?.merchantId ?? null

  getConnection().executeSync(
    `UPDATE transactions
        SET amount_minor = ?, currency = ?, home_amount_minor = ?, raw_text = ?,
            merchant_id = ?, category_id = ?, account_id = ?, note = ?, updated_at = ?
      WHERE id = ?;`,
    [
      input.amount.minor,
      input.amount.currency,
      homeMinor,
      input.merchantText,
      merchantId,
      input.categoryId,
      input.accountId,
      input.note ?? null,
      Date.now(),
      input.id,
    ],
  )
}

// ── refunds ────────────────────────────────────────────────────────────────

/**
 * Record that a transaction was refunded.
 *
 * A failed UPI debit and its refund are ONE event that nets to zero. Left unrecorded, the
 * original keeps counting and every total is inflated by money you got back.
 *
 * The refund is entered **from the row it reverses**, so `reversal_of_id` is known at write
 * time and both halves leave `v_spend` on the same statement — the predicate excludes the
 * reversal leg (it has a `reversal_of_id`) and the original (it appears in the reversed set).
 *
 * This deliberately does not use `pairReversals`. That engine infers pairs by amount and time
 * and reports a confidence, which is the right tool for an imported bank statement where
 * nobody can be asked. Here the user is pointing at the row, so inference would be guessing
 * where an exact answer was available — and any inference window leaves a period where an
 * unpaired inbound row still counts as spend, which is the bug this exists to prevent.
 *
 * The refund copies the original's currency and frozen `fx_rate`. A refund is the same money
 * coming back; re-pricing it at a new rate would invent a gain or loss that never happened.
 */
export function recordRefund(originalId: string, amount?: Money): string | null {
  const db = getConnection()
  const o = (
    db.executeSync(
      `SELECT amount_minor, currency, fx_rate, account_id, merchant_id, category_id, raw_text
         FROM transactions WHERE id = ? AND deleted = 0;`,
      [originalId],
    ).rows as unknown as {
      amount_minor: number
      currency: Currency
      fx_rate: number
      account_id: string
      merchant_id: string | null
      category_id: string | null
      raw_text: string | null
    }[]
  )[0]
  if (!o) return null

  const minor = amount?.minor ?? o.amount_minor
  const id = `txn-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`

  db.executeSync(
    `INSERT INTO transactions
       (id, occurred_at, direction, amount_minor, currency, home_amount_minor, fx_rate,
        account_id, merchant_id, category_id, raw_text, source, txn_type, transfer_group_id,
        reversal_of_id, trip_id, status, confidence, note, user_id, updated_at, deleted)
     VALUES (?, ?, 'in', ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'spend', NULL,
             ?, NULL, 'confirmed', 1.0, 'refund', ?, ?, 0);`,
    [
      id,
      Date.now(),
      minor,
      o.currency,
      Math.round(minor * o.fx_rate),
      o.fx_rate,
      o.account_id,
      o.merchant_id,
      o.category_id,
      o.raw_text ? `REFUND ${o.raw_text}` : 'REFUND',
      originalId,
      USER,
      Date.now(),
    ],
  )
  return id
}

// ── analysis inputs ─────────────────────────────────────────────────────────

export interface DaySpend {
  /** Epoch ms at local midnight. */
  day: number
  minor: number
}

/**
 * Home-currency spend per day, oldest first, with **empty days included as zero**.
 *
 * The zero-filling is the whole point. Change-point detection and MAD z-scores both read the
 * series as evenly spaced; hand them only the days you happened to spend on and a fortnight
 * away reads as a continuous run, so a real shift in behaviour disappears into the gap.
 */
export function dailySpend(days = 90): DaySpend[] {
  const DAY = 86_400_000
  const to = Math.floor(Date.now() / DAY) * DAY + DAY
  const from = to - days * DAY

  const rows = getConnection().executeSync(
    `SELECT CAST(occurred_at / 86400000 AS INTEGER) AS epoch_day,
            COALESCE(SUM(home_amount_minor), 0)     AS minor
       FROM v_spend
      WHERE occurred_at >= ? AND occurred_at < ?
      GROUP BY 1 ORDER BY 1;`,
    [from, to],
  ).rows as unknown as { epoch_day: number; minor: number }[]

  const byDay = new Map(rows.map((r) => [r.epoch_day, r.minor]))
  const out: DaySpend[] = []
  for (let d = Math.floor(from / DAY); d < Math.floor(to / DAY); d++) {
    out.push({ day: d * DAY, minor: byDay.get(d) ?? 0 })
  }
  return out
}

export interface RecurrenceRow {
  merchantId: string
  merchantName: string
  amountMinor: number
  currency: Currency
  occurredAt: number
}

/**
 * Everything with a resolved merchant, for `detectRecurrence`.
 *
 * Rows whose merchant never resolved are excluded rather than grouped under their raw text:
 * two spellings of the same shop would otherwise look like two subscriptions that each fire
 * half as often, which is exactly the pattern the detector is built to reject.
 */
export function recurrenceCandidates(days = 400): RecurrenceRow[] {
  const since = Date.now() - days * 86_400_000
  return getConnection().executeSync(
    `SELECT s.merchant_id, m.canonical_name, s.amount_minor, s.currency, s.occurred_at
       FROM v_spend s
       JOIN merchants m ON m.id = s.merchant_id
      WHERE s.occurred_at >= ?
      ORDER BY s.occurred_at;`,
    [since],
  ).rows.map((r) => {
    const row = r as unknown as {
      merchant_id: string
      canonical_name: string
      amount_minor: number
      currency: Currency
      occurred_at: number
    }
    return {
      merchantId: row.merchant_id,
      merchantName: row.canonical_name,
      amountMinor: row.amount_minor,
      currency: row.currency,
      occurredAt: row.occurred_at,
    }
  })
}

export interface RemittanceLegRow {
  id: string
  direction: 'out' | 'in'
  amountMinor: number
  currency: Currency
  occurredAt: number
}

/**
 * Both legs of anything that might be a cross-border transfer.
 *
 * Deliberately reads `transactions` rather than `v_spend`: a remittance is an outflow in one
 * currency paired with an inflow in another, and the inflow is not spend by any definition.
 * Filtering through the spend view would hide exactly the half that makes the pair detectable.
 *
 * The engine does the pairing and refuses anything it cannot match confidently, so this is
 * deliberately generous — every confirmed movement in the window, both directions.
 */
export function remittanceLegs(days = 400): RemittanceLegRow[] {
  const since = Date.now() - days * 86_400_000
  return getConnection().executeSync(
    `SELECT id, direction, amount_minor, currency, occurred_at
       FROM transactions
      WHERE deleted = 0 AND status = 'confirmed' AND occurred_at >= ?
      ORDER BY occurred_at;`,
    [since],
  ).rows.map((r) => {
    const row = r as unknown as {
      id: string
      direction: 'out' | 'in'
      amount_minor: number
      currency: Currency
      occurred_at: number
    }
    return {
      id: row.id,
      direction: row.direction,
      amountMinor: row.amount_minor,
      currency: row.currency,
      occurredAt: row.occurred_at,
    }
  })
}

// ── the worth-it loop ───────────────────────────────────────────────────────

/**
 * Every confirmed spend recent enough to be worth a question, carrying the names a card shows.
 *
 * Ninety days rather than the seven the queue asks about: the same rows feed the Reckoning's
 * regret panel, and a rating you gave six weeks ago is still a rating. `ratingQueue` narrows
 * to its own windows — the last thirty days for the percentile, the last seven for the ask.
 */
export function ratableSpend(days = 90): RatableRow[] {
  const since = Date.now() - days * 86_400_000
  return rows<{
    id: string
    occurred_at: number
    amount_minor: number
    currency: Currency
    home_amount_minor: number
    merchant: string
    category_id: string
    category_name: string
  }>(
    `SELECT s.id, s.occurred_at, s.amount_minor, s.currency, s.home_amount_minor,
            COALESCE(m.canonical_name, s.raw_text, 'Unknown') AS merchant,
            COALESCE(s.category_id, 'uncategorised')          AS category_id,
            COALESCE(c.name, 'Uncategorised')                 AS category_name
       FROM v_spend s
       LEFT JOIN merchants  m ON m.id = s.merchant_id
       LEFT JOIN categories c ON c.id = s.category_id
      WHERE s.occurred_at >= ?
      ORDER BY s.occurred_at DESC`,
    [since],
  ).map((r) => ({
    id: r.id,
    merchant: r.merchant,
    categoryId: r.category_id,
    categoryName: r.category_name,
    amountMinor: r.amount_minor,
    currency: r.currency,
    homeAmountMinor: r.home_amount_minor,
    occurredAt: r.occurred_at,
  }))
}

/** Every answer you have given. Soft-deleted rows are cleared ratings, not answers. */
export function worthScores(): Map<string, Score> {
  return new Map(
    rows<{ transaction_id: string; score: number }>(
      'SELECT transaction_id, score FROM worth_scores WHERE deleted = 0',
    ).map((r) => [r.transaction_id, r.score as Score]),
  )
}

/**
 * Record an answer. Upsert, because changing your mind is allowed and is not a new row.
 *
 * `deleted = 0` in the update clause is what makes re-rating a cleared row work: the clear
 * is a soft delete, so without this the row would come back still flagged as gone.
 */
export function rateTransaction(transactionId: string, score: Score): void {
  const at = Date.now()
  getConnection().executeSync(
    `INSERT INTO worth_scores (transaction_id, score, rated_at, user_id, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, 0)
     ON CONFLICT(transaction_id) DO UPDATE SET
       score = excluded.score, rated_at = excluded.rated_at,
       updated_at = excluded.updated_at, deleted = 0`,
    [transactionId, score, at, USER, at],
  )
}

/** Undo a rating. Soft delete — the row stays, so the correction syncs like any other edit. */
export function clearRating(transactionId: string): void {
  getConnection().executeSync(
    'UPDATE worth_scores SET deleted = 1, updated_at = ? WHERE transaction_id = ?',
    [Date.now(), transactionId],
  )
}

// ── the nudge budget ────────────────────────────────────────────────────────

export interface StoredNudge {
  kind: string
  title: string
  body: string
  score: number
  sentAt: number
  acted: boolean
}

/**
 * What has already been shown, newest first.
 *
 * The Reckoning renders **these**, plus whatever new ones the week can still afford. Showing
 * the screen must not itself spend a slot: reopening it half an hour later would otherwise
 * burn the week's four in an afternoon of ordinary use.
 */
export function recentNudges(days = 7): StoredNudge[] {
  const since = Date.now() - days * 86_400_000
  return rows<{
    kind: string
    payload: string
    score: number
    sent_at: number
    acted: number
  }>(
    `SELECT kind, payload, score, sent_at, acted
       FROM nudges
      WHERE deleted = 0 AND sent_at IS NOT NULL AND sent_at >= ?
      ORDER BY sent_at DESC`,
    [since],
  ).map((r) => {
    const payload = JSON.parse(r.payload) as { title: string; body: string }
    return {
      kind: r.kind,
      title: payload.title,
      body: payload.body,
      score: r.score,
      sentAt: r.sent_at,
      acted: r.acted === 1,
    }
  })
}

/** When each kind last appeared, over a window long enough to cover the novelty ramp. */
export function lastNudgeByKind(days = 30): Map<string, number> {
  const since = Date.now() - days * 86_400_000
  return new Map(
    rows<{ kind: string; last: number }>(
      `SELECT kind, MAX(sent_at) AS last
         FROM nudges
        WHERE deleted = 0 AND sent_at IS NOT NULL AND sent_at >= ?
        GROUP BY kind`,
      [since],
    ).map((r) => [r.kind, r.last]),
  )
}

/** Spend a slot. Called once, at the moment a nudge first reaches the screen. */
export function recordNudgeShown(n: {
  kind: string
  title: string
  body: string
  score: number
  createdAt: number
}): void {
  const at = Date.now()
  const id = `nudge-${at.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
  getConnection().executeSync(
    `INSERT INTO nudges
       (id, kind, payload, score, created_at, sent_at, acted, user_id, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 0)`,
    [id, n.kind, JSON.stringify({ title: n.title, body: n.body }), n.score, n.createdAt, at, USER, at],
  )
}

/**
 * You did something about it.
 *
 * Feeds the fatigue term on the next cycle: four nudges you opened are a lighter load than
 * four you scrolled past, and an app that cannot tell the difference gets quieter at exactly
 * the person who is using it.
 */
export function markNudgeActed(kind: string): void {
  getConnection().executeSync(
    `UPDATE nudges SET acted = 1, updated_at = ?
      WHERE kind = ? AND deleted = 0 AND sent_at IS NOT NULL
      AND sent_at = (SELECT MAX(sent_at) FROM nudges WHERE kind = ? AND deleted = 0)`,
    [Date.now(), kind, kind],
  )
}

// ── capture ─────────────────────────────────────────────────────────────────

/**
 * Log a capture, accepted or not.
 *
 * `capture_log` has been declared in the contract and created on every device since P1, and had
 * **never been written to** — which meant the one table that could tell you whether the parser
 * is any good in real use was empty, and V1's model page had no input.
 *
 * Both outcomes are recorded. A rejected parse is the more useful row of the two: it is a real
 * sentence a real person typed that the rules tier got wrong, and it is exactly what belongs in
 * the golden set. `edited_json` holds what you changed it to, so the diff is the label.
 */
export function logCapture(input: {
  rawInput: string
  parsedJson: string
  route: 'rules' | 'local' | 'llm'
  latencyMs: number
  accepted: boolean
  editedJson?: string
}): void {
  const at = Date.now()
  const id = `cap-${at.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
  getConnection().executeSync(
    `INSERT INTO capture_log
       (id, raw_input, parsed_json, route, model, latency_ms, accepted, edited_json,
        created_at, user_id, updated_at, deleted)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      input.rawInput,
      input.parsedJson,
      input.route,
      input.latencyMs,
      input.accepted ? 1 : 0,
      input.editedJson ?? null,
      at,
      USER,
      at,
    ],
  )
}

/** How the parser is doing in real use, as opposed to on the golden set. */
export function captureStats(): { total: number; accepted: number } {
  const row = rows<{ total: number; accepted: number }>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(accepted), 0) AS accepted
       FROM capture_log WHERE deleted = 0`,
  )[0]
  return { total: row?.total ?? 0, accepted: row?.accepted ?? 0 }
}

/**
 * An expense someone else paid, where you owe them your share.
 *
 * Splits were one-directional until now — you pay, others owe you — which meant the ordinary
 * case of a friend covering dinner could not be recorded at all.
 *
 * **Your share is a confirmed spend the moment it happens.** You consumed it; waiting for
 * settlement would leave a dinner you ate missing from your own ledger, and `v_spend` excludes
 * pending rows so it would be missing from every figure too.
 *
 * The liability is a `split_participants` row with a **negative** `owed_minor`. The sign is the
 * direction: positive means they owe you, negative means you owe them. `outstandingByPerson`
 * already sums and filters on `<> 0`, so both directions fall out of the query that existed.
 *
 * **Settling writes no transaction, and that is the important part.** The spend row above is
 * already the outflow — it reduced your balance when it was written. Writing another movement
 * at settlement would subtract the same money twice. The consequence, stated rather than
 * hidden: your balance treats an unpaid debt as already spent. That is the conservative reading
 * and the correct one — money you owe is not money you have.
 */
export function recordOwedExpense(input: {
  yourShare: Money
  paidByPersonId: string
  accountId: string
  categoryId: string
  merchantText: string
  fxRate: number
  /** The whole bill, for the note. Not written as a transaction — it was not your outflow. */
  billTotal: Money
}): string {
  const transactionId = insertTransaction({
    amount: input.yourShare,
    accountId: input.accountId,
    categoryId: input.categoryId,
    merchantText: input.merchantText,
    fxRate: input.fxRate,
    note: `Your share of ${format(input.billTotal)}, paid by someone else.`,
  })

  recordSplit({
    transactionId,
    method: 'share',
    owed: [
      {
        personId: input.paidByPersonId,
        // Negative: you owe them. The sign carries the direction.
        owedMinor: -input.yourShare.minor,
        currency: input.yourShare.currency,
      },
    ],
  })

  return transactionId
}
