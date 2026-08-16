/**
 * The schema contract — plain TypeScript, no ORM. This file is the truth.
 *
 * `sqlite.ts` and `pg.ts` are both derived from it, and `parity.test.ts` fails the moment
 * they disagree. Two hand-maintained schemas drift silently; a test that fails on
 * divergence does not.
 */

export type ColumnType = 'text' | 'integer' | 'real' | 'boolean' | 'timestamp' | 'uuid' | 'json'

export interface ColumnSpec {
  readonly type: ColumnType
  /** Nullable unless stated. Primary keys and NOT NULL columns set this false. */
  readonly nullable?: boolean
  readonly primaryKey?: boolean
  /** `table.column` this references. */
  readonly references?: string
  /** Allowed values — enforced as a CHECK in pg and validated by zod on both sides. */
  readonly enumValues?: readonly string[]
}

export interface TableSpec {
  readonly columns: Readonly<Record<string, ColumnSpec>>
  /**
   * Synced tables get user_id / updated_at / deleted appended automatically and RLS in the
   * same migration that creates them. Local-only tables (device caches) do not.
   */
  readonly synced: boolean
}

// ── shared enumerations ─────────────────────────────────────────────────────

export const CURRENCIES = ['INR', 'AED'] as const
export const TXN_TYPES = ['spend', 'income', 'transfer', 'settlement'] as const
export const TXN_STATUS = ['pending', 'confirmed', 'voided'] as const
export const DIRECTIONS = ['out', 'in'] as const
export const ACCOUNT_KINDS = ['bank', 'card', 'cash', 'wallet'] as const
export const CATEGORY_KINDS = ['need', 'want', 'save', 'income'] as const
export const CAPTURE_SOURCES = ['manual', 'voice', 'ocr', 'import'] as const
export const CAPTURE_ROUTES = ['rules', 'local', 'llm'] as const
export const ALIAS_SOURCES = ['seed', 'user', 'llm'] as const
export const SPLIT_METHODS = ['equal', 'share', 'percent', 'itemised'] as const
export const RECURRENCE_STATUS = ['active', 'cancelled', 'dismissed'] as const

/**
 * Every synced table carries these. Legend-State's Supabase plugin requires `updated_at`
 * and soft deletes; adding them later means re-migrating live data.
 */
export const SYNC_COLUMNS: Readonly<Record<string, ColumnSpec>> = {
  user_id: { type: 'uuid', nullable: false },
  updated_at: { type: 'timestamp', nullable: false },
  deleted: { type: 'boolean', nullable: false },
}

const id: ColumnSpec = { type: 'text', nullable: false, primaryKey: true }

// ── tables ──────────────────────────────────────────────────────────────────

const base: Readonly<Record<string, TableSpec>> = {
  accounts: {
    synced: true,
    columns: {
      id,
      name: { type: 'text', nullable: false },
      kind: { type: 'text', nullable: false, enumValues: ACCOUNT_KINDS },
      currency: { type: 'text', nullable: false, enumValues: CURRENCIES },
      opening_minor: { type: 'integer', nullable: false },
      is_cash: { type: 'boolean', nullable: false },
      archived_at: { type: 'integer', nullable: true },
    },
  },

  categories: {
    synced: true,
    columns: {
      id,
      name: { type: 'text', nullable: false },
      parent_id: { type: 'text', nullable: true, references: 'categories.id' },
      icon: { type: 'text', nullable: true },
      color: { type: 'text', nullable: true },
      kind: { type: 'text', nullable: false, enumValues: CATEGORY_KINDS },
    },
  },

  merchants: {
    synced: true,
    columns: {
      id,
      canonical_name: { type: 'text', nullable: false },
      category_id: { type: 'text', nullable: true, references: 'categories.id' },
      country: { type: 'text', nullable: true },
      logo_url: { type: 'text', nullable: true },
    },
  },

  merchant_aliases: {
    synced: true,
    columns: {
      id,
      merchant_id: { type: 'text', nullable: false, references: 'merchants.id' },
      alias_raw: { type: 'text', nullable: false },
      alias_norm: { type: 'text', nullable: false },
      source: { type: 'text', nullable: false, enumValues: ALIAS_SOURCES },
      hit_count: { type: 'integer', nullable: false },
    },
  },

  transactions: {
    synced: true,
    columns: {
      id,
      occurred_at: { type: 'integer', nullable: false },
      direction: { type: 'text', nullable: false, enumValues: DIRECTIONS },
      amount_minor: { type: 'integer', nullable: false },
      currency: { type: 'text', nullable: false, enumValues: CURRENCIES },
      // Frozen at transaction date. Written once, never recomputed.
      home_amount_minor: { type: 'integer', nullable: false },
      fx_rate: { type: 'real', nullable: false },
      account_id: { type: 'text', nullable: false, references: 'accounts.id' },
      merchant_id: { type: 'text', nullable: true, references: 'merchants.id' },
      category_id: { type: 'text', nullable: true, references: 'categories.id' },
      raw_text: { type: 'text', nullable: true },
      source: { type: 'text', nullable: false, enumValues: CAPTURE_SOURCES },
      txn_type: { type: 'text', nullable: false, enumValues: TXN_TYPES },
      transfer_group_id: { type: 'text', nullable: true },
      reversal_of_id: { type: 'text', nullable: true, references: 'transactions.id' },
      trip_id: { type: 'text', nullable: true, references: 'trips.id' },
      status: { type: 'text', nullable: false, enumValues: TXN_STATUS },
      confidence: { type: 'real', nullable: true },
      note: { type: 'text', nullable: true },
    },
  },

  worth_scores: {
    synced: true,
    columns: {
      transaction_id: { type: 'text', nullable: false, primaryKey: true },
      score: { type: 'integer', nullable: false },
      rated_at: { type: 'integer', nullable: false },
    },
  },

  recurrences: {
    synced: true,
    columns: {
      id,
      merchant_id: { type: 'text', nullable: true, references: 'merchants.id' },
      amount_minor: { type: 'integer', nullable: false },
      currency: { type: 'text', nullable: false, enumValues: CURRENCIES },
      period_days: { type: 'real', nullable: false },
      next_due: { type: 'integer', nullable: true },
      confidence: { type: 'real', nullable: false },
      last_amount_change: { type: 'integer', nullable: true },
      status: { type: 'text', nullable: false, enumValues: RECURRENCE_STATUS },
    },
  },

  trips: {
    synced: true,
    columns: {
      id,
      name: { type: 'text', nullable: false },
      country: { type: 'text', nullable: false },
      currency: { type: 'text', nullable: false, enumValues: CURRENCIES },
      started_at: { type: 'integer', nullable: false },
      ended_at: { type: 'integer', nullable: true },
      budget_minor: { type: 'integer', nullable: true },
    },
  },

  cash_counts: {
    synced: true,
    columns: {
      id,
      account_id: { type: 'text', nullable: false, references: 'accounts.id' },
      counted_at: { type: 'integer', nullable: false },
      counted_minor: { type: 'integer', nullable: false },
      expected_minor: { type: 'integer', nullable: false },
      adjustment_txn_id: { type: 'text', nullable: true, references: 'transactions.id' },
    },
  },

  people: {
    synced: true,
    columns: {
      id,
      name: { type: 'text', nullable: false },
      handle: { type: 'text', nullable: true },
      currency: { type: 'text', nullable: false, enumValues: CURRENCIES },
    },
  },

  splits: {
    synced: true,
    columns: {
      id,
      transaction_id: { type: 'text', nullable: false, references: 'transactions.id' },
      method: { type: 'text', nullable: false, enumValues: SPLIT_METHODS },
      share_link_id: { type: 'text', nullable: true },
    },
  },

  split_participants: {
    synced: true,
    columns: {
      id,
      split_id: { type: 'text', nullable: false, references: 'splits.id' },
      person_id: { type: 'text', nullable: false, references: 'people.id' },
      owed_minor: { type: 'integer', nullable: false },
      currency: { type: 'text', nullable: false, enumValues: CURRENCIES },
      settled_txn_id: { type: 'text', nullable: true, references: 'transactions.id' },
    },
  },

  budgets: {
    synced: true,
    columns: {
      id,
      category_id: { type: 'text', nullable: true, references: 'categories.id' },
      period: { type: 'text', nullable: false, enumValues: ['month', 'week'] },
      amount_minor: { type: 'integer', nullable: false },
      currency: { type: 'text', nullable: false, enumValues: CURRENCIES },
    },
  },

  nudges: {
    synced: true,
    columns: {
      id,
      kind: { type: 'text', nullable: false },
      payload: { type: 'json', nullable: false },
      score: { type: 'real', nullable: false },
      created_at: { type: 'integer', nullable: false },
      sent_at: { type: 'integer', nullable: true },
      acted: { type: 'boolean', nullable: false },
    },
  },

  fx_rates: {
    synced: true,
    columns: {
      id,
      as_of: { type: 'integer', nullable: false },
      base: { type: 'text', nullable: false, enumValues: CURRENCIES },
      quote: { type: 'text', nullable: false, enumValues: CURRENCIES },
      rate: { type: 'real', nullable: false },
    },
  },

  capture_log: {
    synced: true,
    columns: {
      id,
      raw_input: { type: 'text', nullable: false },
      parsed_json: { type: 'json', nullable: false },
      route: { type: 'text', nullable: false, enumValues: CAPTURE_ROUTES },
      model: { type: 'text', nullable: true },
      latency_ms: { type: 'integer', nullable: true },
      accepted: { type: 'boolean', nullable: true },
      edited_json: { type: 'json', nullable: true },
      created_at: { type: 'integer', nullable: false },
    },
  },
}

/** Every table, with sync columns folded into the synced ones. */
export const TABLES: Readonly<Record<string, TableSpec>> = Object.fromEntries(
  Object.entries(base).map(([name, spec]) => [
    name,
    spec.synced ? { ...spec, columns: { ...spec.columns, ...SYNC_COLUMNS } } : spec,
  ]),
)

export const TABLE_NAMES = Object.keys(TABLES) as readonly string[]

export function syncedTables(): readonly string[] {
  return TABLE_NAMES.filter((t) => TABLES[t]?.synced)
}

/**
 * The spend predicate, in one place, as text.
 *
 * Both `v_spend` implementations (DuckDB on web, a Drizzle view on mobile) are generated
 * from this so the two cannot disagree about what counts as spend. Every wrong number in
 * every finance dashboard traces back to two places disagreeing about exactly this.
 */
export const SPEND_PREDICATE = [
  "txn_type = 'spend'",
  "status = 'confirmed'",
  'reversal_of_id IS NULL',
  'deleted = false',
  'id NOT IN (SELECT reversal_of_id FROM {table} WHERE reversal_of_id IS NOT NULL)',
].join('\n  AND ')

export function spendPredicate(table = 'transactions'): string {
  return SPEND_PREDICATE.replaceAll('{table}', table)
}

/**
 * `securityInvoker` is Postgres-only and load-bearing there: without it the view runs as
 * its owner and bypasses RLS on the underlying table, returning every user's rows. SQLite
 * and DuckDB have no such concept, so they pass false.
 */
export function spendViewSql(
  table = 'transactions',
  view = 'v_spend',
  securityInvoker = false,
): string {
  const options = securityInvoker ? ' WITH (security_invoker = true)' : ''
  return `CREATE VIEW ${view}${options} AS\nSELECT * FROM ${table}\nWHERE ${spendPredicate(table)};`
}
