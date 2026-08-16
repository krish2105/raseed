/**
 * DERIVED FROM contract.ts — regenerate with `pnpm --filter @raseed/schema run generate`.
 * Do not hand-edit; change the contract instead. parity.test.ts enforces this.
 */
//
// 'integer' maps to bigint: occurred_at holds epoch milliseconds, which overflows a
// 32-bit pg integer 24 days after 1970.
import { bigint, boolean, doublePrecision, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const accounts = pgTable('accounts', {
  id: text('id').notNull().primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  currency: text('currency').notNull(),
  openingMinor: bigint('opening_minor', { mode: 'number' }).notNull(),
  isCash: boolean('is_cash').notNull(),
  archivedAt: bigint('archived_at', { mode: 'number' }),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deleted: boolean('deleted').notNull(),
})

export const categories = pgTable('categories', {
  id: text('id').notNull().primaryKey(),
  name: text('name').notNull(),
  parentId: text('parent_id'),
  icon: text('icon'),
  color: text('color'),
  kind: text('kind').notNull(),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deleted: boolean('deleted').notNull(),
})

export const merchants = pgTable('merchants', {
  id: text('id').notNull().primaryKey(),
  canonicalName: text('canonical_name').notNull(),
  categoryId: text('category_id'),
  country: text('country'),
  logoUrl: text('logo_url'),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deleted: boolean('deleted').notNull(),
})

export const merchantAliases = pgTable('merchant_aliases', {
  id: text('id').notNull().primaryKey(),
  merchantId: text('merchant_id').notNull(),
  aliasRaw: text('alias_raw').notNull(),
  aliasNorm: text('alias_norm').notNull(),
  source: text('source').notNull(),
  hitCount: bigint('hit_count', { mode: 'number' }).notNull(),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deleted: boolean('deleted').notNull(),
})

export const transactions = pgTable('transactions', {
  id: text('id').notNull().primaryKey(),
  occurredAt: bigint('occurred_at', { mode: 'number' }).notNull(),
  direction: text('direction').notNull(),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  currency: text('currency').notNull(),
  homeAmountMinor: bigint('home_amount_minor', { mode: 'number' }).notNull(),
  fxRate: doublePrecision('fx_rate').notNull(),
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
  confidence: doublePrecision('confidence'),
  note: text('note'),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deleted: boolean('deleted').notNull(),
})

export const worthScores = pgTable('worth_scores', {
  transactionId: text('transaction_id').notNull().primaryKey(),
  score: bigint('score', { mode: 'number' }).notNull(),
  ratedAt: bigint('rated_at', { mode: 'number' }).notNull(),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deleted: boolean('deleted').notNull(),
})

export const recurrences = pgTable('recurrences', {
  id: text('id').notNull().primaryKey(),
  merchantId: text('merchant_id'),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  currency: text('currency').notNull(),
  periodDays: doublePrecision('period_days').notNull(),
  nextDue: bigint('next_due', { mode: 'number' }),
  confidence: doublePrecision('confidence').notNull(),
  lastAmountChange: bigint('last_amount_change', { mode: 'number' }),
  status: text('status').notNull(),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deleted: boolean('deleted').notNull(),
})

export const trips = pgTable('trips', {
  id: text('id').notNull().primaryKey(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  currency: text('currency').notNull(),
  startedAt: bigint('started_at', { mode: 'number' }).notNull(),
  endedAt: bigint('ended_at', { mode: 'number' }),
  budgetMinor: bigint('budget_minor', { mode: 'number' }),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deleted: boolean('deleted').notNull(),
})

export const cashCounts = pgTable('cash_counts', {
  id: text('id').notNull().primaryKey(),
  accountId: text('account_id').notNull(),
  countedAt: bigint('counted_at', { mode: 'number' }).notNull(),
  countedMinor: bigint('counted_minor', { mode: 'number' }).notNull(),
  expectedMinor: bigint('expected_minor', { mode: 'number' }).notNull(),
  adjustmentTxnId: text('adjustment_txn_id'),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deleted: boolean('deleted').notNull(),
})

export const people = pgTable('people', {
  id: text('id').notNull().primaryKey(),
  name: text('name').notNull(),
  handle: text('handle'),
  currency: text('currency').notNull(),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deleted: boolean('deleted').notNull(),
})

export const splits = pgTable('splits', {
  id: text('id').notNull().primaryKey(),
  transactionId: text('transaction_id').notNull(),
  method: text('method').notNull(),
  shareLinkId: text('share_link_id'),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deleted: boolean('deleted').notNull(),
})

export const splitParticipants = pgTable('split_participants', {
  id: text('id').notNull().primaryKey(),
  splitId: text('split_id').notNull(),
  personId: text('person_id').notNull(),
  owedMinor: bigint('owed_minor', { mode: 'number' }).notNull(),
  currency: text('currency').notNull(),
  settledTxnId: text('settled_txn_id'),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deleted: boolean('deleted').notNull(),
})

export const budgets = pgTable('budgets', {
  id: text('id').notNull().primaryKey(),
  categoryId: text('category_id'),
  period: text('period').notNull(),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  currency: text('currency').notNull(),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deleted: boolean('deleted').notNull(),
})

export const nudges = pgTable('nudges', {
  id: text('id').notNull().primaryKey(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull(),
  score: doublePrecision('score').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  sentAt: bigint('sent_at', { mode: 'number' }),
  acted: boolean('acted').notNull(),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deleted: boolean('deleted').notNull(),
})

export const fxRates = pgTable('fx_rates', {
  id: text('id').notNull().primaryKey(),
  asOf: bigint('as_of', { mode: 'number' }).notNull(),
  base: text('base').notNull(),
  quote: text('quote').notNull(),
  rate: doublePrecision('rate').notNull(),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deleted: boolean('deleted').notNull(),
})

export const captureLog = pgTable('capture_log', {
  id: text('id').notNull().primaryKey(),
  rawInput: text('raw_input').notNull(),
  parsedJson: jsonb('parsed_json').notNull(),
  route: text('route').notNull(),
  model: text('model'),
  latencyMs: bigint('latency_ms', { mode: 'number' }),
  accepted: boolean('accepted'),
  editedJson: jsonb('edited_json'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  userId: uuid('user_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deleted: boolean('deleted').notNull(),
})

