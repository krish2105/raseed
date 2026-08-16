/**
 * DERIVED FROM contract.ts — regenerate with `pnpm --filter @raseed/schema run generate`.
 * Do not hand-edit; change the contract instead. parity.test.ts enforces this.
 */
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const accounts = sqliteTable('accounts', {
  id: text('id').notNull().primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  currency: text('currency').notNull(),
  openingMinor: integer('opening_minor').notNull(),
  isCash: integer('is_cash', { mode: 'boolean' }).notNull(),
  archivedAt: integer('archived_at'),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

export const categories = sqliteTable('categories', {
  id: text('id').notNull().primaryKey(),
  name: text('name').notNull(),
  parentId: text('parent_id'),
  icon: text('icon'),
  color: text('color'),
  kind: text('kind').notNull(),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

export const merchants = sqliteTable('merchants', {
  id: text('id').notNull().primaryKey(),
  canonicalName: text('canonical_name').notNull(),
  categoryId: text('category_id'),
  country: text('country'),
  logoUrl: text('logo_url'),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

export const merchantAliases = sqliteTable('merchant_aliases', {
  id: text('id').notNull().primaryKey(),
  merchantId: text('merchant_id').notNull(),
  aliasRaw: text('alias_raw').notNull(),
  aliasNorm: text('alias_norm').notNull(),
  source: text('source').notNull(),
  hitCount: integer('hit_count').notNull(),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

export const transactions = sqliteTable('transactions', {
  id: text('id').notNull().primaryKey(),
  occurredAt: integer('occurred_at').notNull(),
  direction: text('direction').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull(),
  homeAmountMinor: integer('home_amount_minor').notNull(),
  fxRate: real('fx_rate').notNull(),
  accountId: text('account_id').notNull(),
  merchantId: text('merchant_id'),
  categoryId: text('category_id'),
  rawText: text('raw_text'),
  source: text('source').notNull(),
  txnType: text('txn_type').notNull(),
  transferGroupId: text('transfer_group_id'),
  reversalOfId: text('reversal_of_id'),
  tripId: text('trip_id'),
  status: text('status').notNull(),
  confidence: real('confidence'),
  note: text('note'),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

export const worthScores = sqliteTable('worth_scores', {
  transactionId: text('transaction_id').notNull().primaryKey(),
  score: integer('score').notNull(),
  ratedAt: integer('rated_at').notNull(),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

export const recurrences = sqliteTable('recurrences', {
  id: text('id').notNull().primaryKey(),
  merchantId: text('merchant_id'),
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull(),
  periodDays: real('period_days').notNull(),
  nextDue: integer('next_due'),
  confidence: real('confidence').notNull(),
  lastAmountChange: integer('last_amount_change'),
  status: text('status').notNull(),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

export const trips = sqliteTable('trips', {
  id: text('id').notNull().primaryKey(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  currency: text('currency').notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  budgetMinor: integer('budget_minor'),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

export const cashCounts = sqliteTable('cash_counts', {
  id: text('id').notNull().primaryKey(),
  accountId: text('account_id').notNull(),
  countedAt: integer('counted_at').notNull(),
  countedMinor: integer('counted_minor').notNull(),
  expectedMinor: integer('expected_minor').notNull(),
  adjustmentTxnId: text('adjustment_txn_id'),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

export const people = sqliteTable('people', {
  id: text('id').notNull().primaryKey(),
  name: text('name').notNull(),
  handle: text('handle'),
  currency: text('currency').notNull(),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

export const splits = sqliteTable('splits', {
  id: text('id').notNull().primaryKey(),
  transactionId: text('transaction_id').notNull(),
  method: text('method').notNull(),
  shareLinkId: text('share_link_id'),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

export const splitParticipants = sqliteTable('split_participants', {
  id: text('id').notNull().primaryKey(),
  splitId: text('split_id').notNull(),
  personId: text('person_id').notNull(),
  owedMinor: integer('owed_minor').notNull(),
  currency: text('currency').notNull(),
  settledTxnId: text('settled_txn_id'),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

export const goals = sqliteTable('goals', {
  id: text('id').notNull().primaryKey(),
  name: text('name').notNull(),
  targetMinor: integer('target_minor').notNull(),
  savedMinor: integer('saved_minor').notNull(),
  currency: text('currency').notNull(),
  targetAt: integer('target_at'),
  reachedAt: integer('reached_at'),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

export const budgets = sqliteTable('budgets', {
  id: text('id').notNull().primaryKey(),
  categoryId: text('category_id'),
  period: text('period').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull(),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

export const nudges = sqliteTable('nudges', {
  id: text('id').notNull().primaryKey(),
  kind: text('kind').notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  score: real('score').notNull(),
  createdAt: integer('created_at').notNull(),
  sentAt: integer('sent_at'),
  acted: integer('acted', { mode: 'boolean' }).notNull(),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

export const fxRates = sqliteTable('fx_rates', {
  id: text('id').notNull().primaryKey(),
  asOf: integer('as_of').notNull(),
  base: text('base').notNull(),
  quote: text('quote').notNull(),
  rate: real('rate').notNull(),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

export const captureLog = sqliteTable('capture_log', {
  id: text('id').notNull().primaryKey(),
  rawInput: text('raw_input').notNull(),
  parsedJson: text('parsed_json', { mode: 'json' }).notNull(),
  route: text('route').notNull(),
  model: text('model'),
  latencyMs: integer('latency_ms'),
  accepted: integer('accepted', { mode: 'boolean' }),
  editedJson: text('edited_json', { mode: 'json' }),
  createdAt: integer('created_at').notNull(),
  userId: text('user_id').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
})

