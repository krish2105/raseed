/**
 * DERIVED FROM contract.ts — regenerate with `pnpm --filter @raseed/schema run generate`.
 * Do not hand-edit; change the contract instead. parity.test.ts enforces this.
 */
//
// These validate at boundaries: parsed capture output, CSV import rows, anything arriving
// from Supabase. Enum columns become z.enum, so an unknown txn_type is rejected at the edge
// rather than corrupting a total three screens later.
import { z } from 'zod'

export const accountsSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['bank', 'card', 'cash', 'wallet']),
  currency: z.enum(['INR', 'AED']),
  opening_minor: z.number().int(),
  is_cash: z.boolean(),
  archived_at: z.number().int().nullable(),
  user_id: z.string().uuid(),
  updated_at: z.number().int(),
  deleted: z.boolean(),
})
export type Accounts = z.infer<typeof accountsSchema>

export const categoriesSchema = z.object({
  id: z.string(),
  name: z.string(),
  parent_id: z.string().nullable(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  kind: z.enum(['need', 'want', 'save', 'income']),
  user_id: z.string().uuid(),
  updated_at: z.number().int(),
  deleted: z.boolean(),
})
export type Categories = z.infer<typeof categoriesSchema>

export const merchantsSchema = z.object({
  id: z.string(),
  canonical_name: z.string(),
  category_id: z.string().nullable(),
  country: z.string().nullable(),
  logo_url: z.string().nullable(),
  user_id: z.string().uuid(),
  updated_at: z.number().int(),
  deleted: z.boolean(),
})
export type Merchants = z.infer<typeof merchantsSchema>

export const merchantAliasesSchema = z.object({
  id: z.string(),
  merchant_id: z.string(),
  alias_raw: z.string(),
  alias_norm: z.string(),
  source: z.enum(['seed', 'user', 'llm']),
  hit_count: z.number().int(),
  user_id: z.string().uuid(),
  updated_at: z.number().int(),
  deleted: z.boolean(),
})
export type MerchantAliases = z.infer<typeof merchantAliasesSchema>

export const transactionsSchema = z.object({
  id: z.string(),
  occurred_at: z.number().int(),
  direction: z.enum(['out', 'in']),
  amount_minor: z.number().int(),
  currency: z.enum(['INR', 'AED']),
  home_amount_minor: z.number().int(),
  fx_rate: z.number(),
  account_id: z.string(),
  merchant_id: z.string().nullable(),
  category_id: z.string().nullable(),
  raw_text: z.string().nullable(),
  source: z.enum(['manual', 'voice', 'ocr', 'import']),
  txn_type: z.enum(['spend', 'income', 'transfer', 'settlement']),
  transfer_group_id: z.string().nullable(),
  reversal_of_id: z.string().nullable(),
  trip_id: z.string().nullable(),
  status: z.enum(['pending', 'confirmed', 'voided']),
  confidence: z.number().nullable(),
  note: z.string().nullable(),
  user_id: z.string().uuid(),
  updated_at: z.number().int(),
  deleted: z.boolean(),
})
export type Transactions = z.infer<typeof transactionsSchema>

export const worthScoresSchema = z.object({
  transaction_id: z.string(),
  score: z.number().int(),
  rated_at: z.number().int(),
  user_id: z.string().uuid(),
  updated_at: z.number().int(),
  deleted: z.boolean(),
})
export type WorthScores = z.infer<typeof worthScoresSchema>

export const recurrencesSchema = z.object({
  id: z.string(),
  merchant_id: z.string().nullable(),
  amount_minor: z.number().int(),
  currency: z.enum(['INR', 'AED']),
  period_days: z.number(),
  next_due: z.number().int().nullable(),
  confidence: z.number(),
  last_amount_change: z.number().int().nullable(),
  status: z.enum(['active', 'cancelled', 'dismissed']),
  user_id: z.string().uuid(),
  updated_at: z.number().int(),
  deleted: z.boolean(),
})
export type Recurrences = z.infer<typeof recurrencesSchema>

export const tripsSchema = z.object({
  id: z.string(),
  name: z.string(),
  country: z.string(),
  currency: z.enum(['INR', 'AED']),
  started_at: z.number().int(),
  ended_at: z.number().int().nullable(),
  budget_minor: z.number().int().nullable(),
  user_id: z.string().uuid(),
  updated_at: z.number().int(),
  deleted: z.boolean(),
})
export type Trips = z.infer<typeof tripsSchema>

export const cashCountsSchema = z.object({
  id: z.string(),
  account_id: z.string(),
  counted_at: z.number().int(),
  counted_minor: z.number().int(),
  expected_minor: z.number().int(),
  adjustment_txn_id: z.string().nullable(),
  user_id: z.string().uuid(),
  updated_at: z.number().int(),
  deleted: z.boolean(),
})
export type CashCounts = z.infer<typeof cashCountsSchema>

export const peopleSchema = z.object({
  id: z.string(),
  name: z.string(),
  handle: z.string().nullable(),
  currency: z.enum(['INR', 'AED']),
  user_id: z.string().uuid(),
  updated_at: z.number().int(),
  deleted: z.boolean(),
})
export type People = z.infer<typeof peopleSchema>

export const splitsSchema = z.object({
  id: z.string(),
  transaction_id: z.string(),
  method: z.enum(['equal', 'share', 'percent', 'itemised']),
  share_link_id: z.string().nullable(),
  user_id: z.string().uuid(),
  updated_at: z.number().int(),
  deleted: z.boolean(),
})
export type Splits = z.infer<typeof splitsSchema>

export const splitParticipantsSchema = z.object({
  id: z.string(),
  split_id: z.string(),
  person_id: z.string(),
  owed_minor: z.number().int(),
  currency: z.enum(['INR', 'AED']),
  settled_txn_id: z.string().nullable(),
  user_id: z.string().uuid(),
  updated_at: z.number().int(),
  deleted: z.boolean(),
})
export type SplitParticipants = z.infer<typeof splitParticipantsSchema>

export const budgetsSchema = z.object({
  id: z.string(),
  category_id: z.string().nullable(),
  period: z.enum(['month', 'week']),
  amount_minor: z.number().int(),
  currency: z.enum(['INR', 'AED']),
  user_id: z.string().uuid(),
  updated_at: z.number().int(),
  deleted: z.boolean(),
})
export type Budgets = z.infer<typeof budgetsSchema>

export const nudgesSchema = z.object({
  id: z.string(),
  kind: z.string(),
  payload: z.unknown(),
  score: z.number(),
  created_at: z.number().int(),
  sent_at: z.number().int().nullable(),
  acted: z.boolean(),
  user_id: z.string().uuid(),
  updated_at: z.number().int(),
  deleted: z.boolean(),
})
export type Nudges = z.infer<typeof nudgesSchema>

export const fxRatesSchema = z.object({
  id: z.string(),
  as_of: z.number().int(),
  base: z.enum(['INR', 'AED']),
  quote: z.enum(['INR', 'AED']),
  rate: z.number(),
  user_id: z.string().uuid(),
  updated_at: z.number().int(),
  deleted: z.boolean(),
})
export type FxRates = z.infer<typeof fxRatesSchema>

export const captureLogSchema = z.object({
  id: z.string(),
  raw_input: z.string(),
  parsed_json: z.unknown(),
  route: z.enum(['rules', 'local', 'llm']),
  model: z.string().nullable(),
  latency_ms: z.number().int().nullable(),
  accepted: z.boolean().nullable(),
  edited_json: z.unknown().nullable(),
  created_at: z.number().int(),
  user_id: z.string().uuid(),
  updated_at: z.number().int(),
  deleted: z.boolean(),
})
export type CaptureLog = z.infer<typeof captureLogSchema>

export const schemas = {
  accounts: accountsSchema,
  categories: categoriesSchema,
  merchants: merchantsSchema,
  merchant_aliases: merchantAliasesSchema,
  transactions: transactionsSchema,
  worth_scores: worthScoresSchema,
  recurrences: recurrencesSchema,
  trips: tripsSchema,
  cash_counts: cashCountsSchema,
  people: peopleSchema,
  splits: splitsSchema,
  split_participants: splitParticipantsSchema,
  budgets: budgetsSchema,
  nudges: nudgesSchema,
  fx_rates: fxRatesSchema,
  capture_log: captureLogSchema,
} as const
