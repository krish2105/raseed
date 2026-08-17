import type { Currency } from '@raseed/money'

/**
 * The capture parser — the rules tier of P3's router.
 *
 * You type a run-on line and get structured transactions back: `"chai 20, auto 80, bigbasket
 * 640"` is three rows, not one note. This is the tier that runs first, costs nothing, needs no
 * key and works in airplane mode, which is why it is worth making good rather than treating as a
 * fallback on the way to a model.
 *
 * **It reports what it could not do.** Every draft carries a confidence and every input carries
 * a route, so the confirmation sheet can lead with the ones worth checking and the eval harness
 * can measure the thing honestly. A parser that silently guesses is worse than one that says it
 * is unsure, because only one of them can be improved.
 *
 * Pure by construction — no clock, no I/O, no storage. The caller passes the context.
 */

export type CaptureRoute = 'rules' | 'local' | 'llm'
export type CaptureType = 'spend' | 'income' | 'transfer'

export interface CaptureDraft {
  readonly amountMinor: number
  readonly currency: Currency
  /** What you typed for the merchant, before any alias resolution. */
  readonly merchantText: string
  readonly type: CaptureType
  /** 0–1. Below `CONFIDENT` the sheet should lead with this row. */
  readonly confidence: number
  /** The slice of the input this came from, so a wrong row can be pointed at. */
  readonly source: string
}

export interface CaptureResult {
  readonly drafts: readonly CaptureDraft[]
  readonly route: CaptureRoute
  /** Clauses that had no readable amount. Reported, never dropped silently. */
  readonly unparsed: readonly string[]
}

export interface CaptureContext {
  /** The currency to assume when the text does not say. Usually the selected account's. */
  readonly defaultCurrency: Currency
}

/** Above this, the sheet can present a row as settled rather than as a question. */
export const CONFIDENT = 0.8

// ── lexicon ─────────────────────────────────────────────────────────────────

/**
 * Clause separators, including the Hinglish `aur`.
 *
 * `"400 ka petrol dala aur 120 parking"` is two transactions to anyone who speaks the sentence
 * and one to a comma-only splitter. Supporting it costs one alternation.
 *
 * The comma is guarded on the **following** side only, and the golden set taught that twice.
 * Indian grouping writes ₹1,250 and ₹2,18,530, so an unguarded comma split `"₹1,250 zomato"`
 * into `"₹1"` and `"250 zomato"` — two transactions, the first of them ₹1. Not a rounding
 * error: a fabricated row. Guarding *both* sides then broke the ordinary case, because
 * `"chai 20, auto 80"` has a digit before its separator too. What actually distinguishes them
 * is what follows: a grouping comma is followed by a digit, a clause comma is not.
 */
const CLAUSE = /\s*(?:,(?!\d)|;|\band\b|\baur\b|\+)\s*/i

const AED_WORDS = /\b(?:aed|dh|dhs|dirhams?)\b/i
const INR_WORDS = /\b(?:inr|rs|rupees?|₹)\b|₹/i

/** `paid rahul 500` is a transfer to a person, not a purchase. */
const TRANSFER = /\b(?:paid|sent|transferred|gave)\b/i
/** `refund 200 from swiggy` is money coming back. */
const INCOME = /\b(?:refund(?:ed)?|returned|cashback|received|credited|reimbursed)\b/i

/**
 * Words that are never a merchant.
 *
 * Without this, `"400 ka petrol dala"` resolves its merchant to "ka petrol dala" and the alias
 * table learns a phrase instead of a shop.
 */
const NOISE =
  /\b(?:ka|ki|ke|mein|me|par|pe|se|ko|diya|dala|liya|kiya|hua|for|on|at|from|to|of|the|a|an|spent|paid|bought|got|paisa|rupaye)\b/gi

// ── amounts ─────────────────────────────────────────────────────────────────

/**
 * One amount token, with its multiplier suffix.
 *
 * `2k` is 2,000 and `1.5 lakh` is 150,000 — both are how people actually write money here, and
 * both are silently wrong if you parse the digits and drop the suffix. `1.5 lakh` parsed as 1.5
 * is not a small error, it is five orders of magnitude.
 */
const AMOUNT = /(?:^|[\s₹])(\d[\d,]*(?:\.\d{1,2})?)\s*(k|lakh|lac|lakhs|cr|crore)?\b/i

const MULTIPLIER: Record<string, number> = {
  k: 1_000,
  lakh: 100_000,
  lac: 100_000,
  lakhs: 100_000,
  cr: 10_000_000,
  crore: 10_000_000,
}

interface FoundAmount {
  readonly minor: number
  /** Where in the clause it was, so the merchant is whatever is left. */
  readonly matched: string
}

function findAmount(clause: string): FoundAmount | null {
  const match = AMOUNT.exec(clause)
  if (!match?.[1]) return null

  const digits = Number(match[1].replaceAll(',', ''))
  if (!Number.isFinite(digits) || digits <= 0) return null

  const suffix = match[2]?.toLowerCase()
  const major = suffix ? digits * (MULTIPLIER[suffix] ?? 1) : digits

  // Minor units, rounded once at the boundary. Everything downstream is an integer.
  return { minor: Math.round(major * 100), matched: match[0] }
}

function currencyOf(clause: string, fallback: Currency): { currency: Currency; explicit: boolean } {
  if (AED_WORDS.test(clause)) return { currency: 'AED', explicit: true }
  if (INR_WORDS.test(clause)) return { currency: 'INR', explicit: true }
  return { currency: fallback, explicit: false }
}

function merchantOf(clause: string, amountMatch: string): string {
  const withoutAmount = clause.replace(amountMatch, ' ')
  const cleaned = withoutAmount
    .replace(AED_WORDS, ' ')
    .replace(INR_WORDS, ' ')
    .replace(TRANSFER, ' ')
    .replace(INCOME, ' ')
    .replace(NOISE, ' ')
    .replace(/[^\p{L}\p{N}\s&'.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned
}

function typeOf(clause: string): CaptureType {
  // Income wins over transfer: "refund from X" and "paid back" both contain a payment verb,
  // and only one of them is money arriving.
  if (INCOME.test(clause)) return 'income'
  if (TRANSFER.test(clause)) return 'transfer'
  return 'spend'
}

/**
 * Score a draft on what the text actually told us.
 *
 * Confidence is not a feeling: it starts at 1 and each thing that had to be assumed takes
 * something off. A named merchant with an explicit currency is certain; a bare number in a
 * clause with no merchant is a row worth looking at before it is written.
 */
function confidenceOf(merchant: string, explicitCurrency: boolean, type: CaptureType): number {
  let score = 1
  if (merchant.length === 0) score -= 0.45
  else if (merchant.length < 3) score -= 0.2
  if (!explicitCurrency) score -= 0.1
  // A transfer inferred from a verb is the guess most likely to be wrong, and it is the one
  // that misfiles money as spend if it is.
  if (type === 'transfer') score -= 0.15
  return Math.max(0, Math.round(score * 100) / 100)
}

/**
 * Parse a capture line into drafts.
 *
 * Never throws and never returns a partial row: a clause either produces a draft with an amount
 * or lands in `unparsed`, where the sheet can show it as text you still have to deal with.
 */
export function parseCapture(input: string, context: CaptureContext): CaptureResult {
  const drafts: CaptureDraft[] = []
  const unparsed: string[] = []

  for (const raw of input.split(CLAUSE)) {
    const clause = raw.trim()
    if (clause.length === 0) continue

    const amount = findAmount(clause)
    if (!amount) {
      unparsed.push(clause)
      continue
    }

    const { currency, explicit } = currencyOf(clause, context.defaultCurrency)
    const merchant = merchantOf(clause, amount.matched)
    const type = typeOf(clause)

    drafts.push({
      amountMinor: amount.minor,
      currency,
      merchantText: merchant,
      type,
      confidence: confidenceOf(merchant, explicit, type),
      source: clause,
    })
  }

  return { drafts, route: 'rules', unparsed }
}
