import type { CaptureType } from '../domain/parseCapture'

/**
 * The golden set.
 *
 * `MOBILE_ARCHITECTURE.md` §7 has asked for this since the first session — "build `eval/` from
 * day one, it's the difference between 'I made an app' and 'I made an app and measured it'" —
 * and until now a find for an `eval` directory returned CocoaPods headers. It is hand-labelled, and the
 * label is what the parser is scored against, not what it happens to produce.
 *
 * Coverage follows the spec's own list: English, Hinglish, multi-clause, ambiguous amounts
 * (`2k`, `1.5 lakh`, `25 dh`, `aed 25`), currency-implicit strings that need account context,
 * and the adversarial pair that separates a ledger from a list — `paid rahul 500` is a transfer
 * and `refund 200 from swiggy` is income, and a parser that calls either of them spend has
 * overstated your spending in a way no total will reveal.
 *
 * **Cases the rules tier is expected to fail are included on purpose**, labelled with what is
 * true rather than with what is achievable. An eval set trimmed to what already passes measures
 * nothing and can only ever go down.
 */

export interface GoldenTransaction {
  readonly amountMinor: number
  readonly currency: 'INR' | 'AED'
  /** Normalised for comparison: lowercase, single-spaced. Empty means none was stated. */
  readonly merchant: string
  readonly type: CaptureType
}

export interface GoldenCase {
  readonly input: string
  /** The account context the line was typed under. */
  readonly defaultCurrency: 'INR' | 'AED'
  readonly expect: readonly GoldenTransaction[]
  readonly tags: readonly string[]
  /**
   * What it would take to get this right.
   *
   * `'rules'` is inside the deterministic tier's remit and gates the build. `'model'` is a case
   * a regex tier is not expected to solve — free-form word amounts, elided merchants, sentences
   * that need actual understanding. They stay in the set and stay in the report, because a
   * benchmark trimmed to what already passes measures nothing and can only ever go down. They
   * are excluded from the *gate* so a green build means "the promised tier works", not "we
   * stopped asking hard questions".
   */
  readonly tier: 'rules' | 'model'
}

const inr = (major: number) => Math.round(major * 100)

export const GOLDEN: readonly GoldenCase[] = [
  // ── single, plain ─────────────────────────────────────────────────────────
  {
    input: 'chai 20',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(20), currency: 'INR', merchant: 'chai', type: 'spend' }],
    tier: 'rules',
    tags: ['single', 'english'],
  },
  {
    input: 'swiggy 640',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(640), currency: 'INR', merchant: 'swiggy', type: 'spend' }],
    tier: 'rules',
    tags: ['single', 'merchant'],
  },
  {
    input: 'uber 245.50',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(245.5), currency: 'INR', merchant: 'uber', type: 'spend' }],
    tier: 'rules',
    tags: ['single', 'decimal'],
  },

  // ── multi-clause ──────────────────────────────────────────────────────────
  {
    input: 'chai 20, auto 80, bigbasket 640',
    defaultCurrency: 'INR',
    expect: [
      { amountMinor: inr(20), currency: 'INR', merchant: 'chai', type: 'spend' },
      { amountMinor: inr(80), currency: 'INR', merchant: 'auto', type: 'spend' },
      { amountMinor: inr(640), currency: 'INR', merchant: 'bigbasket', type: 'spend' },
    ],
    tier: 'rules',
    tags: ['multi', 'english'],
  },
  {
    input: 'careem 24 aed, lunch 45, salik 4',
    defaultCurrency: 'AED',
    expect: [
      { amountMinor: inr(24), currency: 'AED', merchant: 'careem', type: 'spend' },
      { amountMinor: inr(45), currency: 'AED', merchant: 'lunch', type: 'spend' },
      { amountMinor: inr(4), currency: 'AED', merchant: 'salik', type: 'spend' },
    ],
    tier: 'rules',
    tags: ['multi', 'aed', 'currency-implicit'],
  },
  {
    input: 'groceries 1200 and petrol 3000',
    defaultCurrency: 'INR',
    expect: [
      { amountMinor: inr(1200), currency: 'INR', merchant: 'groceries', type: 'spend' },
      { amountMinor: inr(3000), currency: 'INR', merchant: 'petrol', type: 'spend' },
    ],
    tier: 'rules',
    tags: ['multi', 'and'],
  },

  // ── Hinglish ──────────────────────────────────────────────────────────────
  {
    input: '400 ka petrol dala aur 120 parking',
    defaultCurrency: 'INR',
    expect: [
      { amountMinor: inr(400), currency: 'INR', merchant: 'petrol', type: 'spend' },
      { amountMinor: inr(120), currency: 'INR', merchant: 'parking', type: 'spend' },
    ],
    tier: 'rules',
    tags: ['multi', 'hinglish'],
  },
  {
    input: 'auto ko 60 diya',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(60), currency: 'INR', merchant: 'auto', type: 'spend' }],
    tier: 'rules',
    tags: ['single', 'hinglish'],
  },

  // ── ambiguous amounts ─────────────────────────────────────────────────────
  {
    input: 'rent 2k',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(2000), currency: 'INR', merchant: 'rent', type: 'spend' }],
    tier: 'rules',
    tags: ['single', 'suffix'],
  },
  {
    input: 'laptop 1.5 lakh',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(150_000), currency: 'INR', merchant: 'laptop', type: 'spend' }],
    tier: 'rules',
    tags: ['single', 'suffix'],
  },
  {
    input: 'carrefour 25 dh',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(25), currency: 'AED', merchant: 'carrefour', type: 'spend' }],
    tier: 'rules',
    tags: ['single', 'aed', 'suffix'],
  },
  {
    input: 'aed 25 talabat',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(25), currency: 'AED', merchant: 'talabat', type: 'spend' }],
    tier: 'rules',
    tags: ['single', 'aed', 'prefix'],
  },
  {
    input: '₹1,250 zomato',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(1250), currency: 'INR', merchant: 'zomato', type: 'spend' }],
    tier: 'rules',
    tags: ['single', 'grouping', 'symbol'],
  },

  // ── currency implicit, needs account context ──────────────────────────────
  {
    input: 'coffee 18',
    defaultCurrency: 'AED',
    expect: [{ amountMinor: inr(18), currency: 'AED', merchant: 'coffee', type: 'spend' }],
    tier: 'rules',
    tags: ['single', 'currency-implicit'],
  },
  {
    input: 'metro 5',
    defaultCurrency: 'AED',
    expect: [{ amountMinor: inr(5), currency: 'AED', merchant: 'metro', type: 'spend' }],
    tier: 'rules',
    tags: ['single', 'currency-implicit'],
  },

  // ── adversarial: the two that separate a ledger from a list ───────────────
  {
    input: 'paid rahul 500',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(500), currency: 'INR', merchant: 'rahul', type: 'transfer' }],
    tier: 'rules',
    tags: ['adversarial', 'transfer'],
  },
  {
    input: 'sent 2000 to amma',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(2000), currency: 'INR', merchant: 'amma', type: 'transfer' }],
    tier: 'rules',
    tags: ['adversarial', 'transfer'],
  },
  {
    input: 'refund 200 from swiggy',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(200), currency: 'INR', merchant: 'swiggy', type: 'income' }],
    tier: 'rules',
    tags: ['adversarial', 'income'],
  },
  {
    input: 'cashback 45 from amazon',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(45), currency: 'INR', merchant: 'amazon', type: 'income' }],
    tier: 'rules',
    tags: ['adversarial', 'income'],
  },
  {
    input: 'reimbursed 1500 for the flight',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(1500), currency: 'INR', merchant: 'flight', type: 'income' }],
    tier: 'rules',
    tags: ['adversarial', 'income'],
  },

  // ── mixed currency in one line ────────────────────────────────────────────
  // ── beyond the rules tier, and kept in the set for exactly that reason ────
  {
    input: 'two fifty for lunch',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(250), currency: 'INR', merchant: 'lunch', type: 'spend' }],
    tier: 'model',
    tags: ['hard', 'word-amount'],
  },
  {
    input: 'filled the tank, 3200',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(3200), currency: 'INR', merchant: 'petrol', type: 'spend' }],
    tier: 'model',
    tags: ['hard', 'implied-merchant'],
  },
  {
    input: 'split the 1800 dinner three ways',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(600), currency: 'INR', merchant: 'dinner', type: 'spend' }],
    tier: 'model',
    tags: ['hard', 'arithmetic'],
  },
  {
    input: 'the usual from bigbasket, 1450, and rahul owes me half',
    defaultCurrency: 'INR',
    expect: [{ amountMinor: inr(1450), currency: 'INR', merchant: 'bigbasket', type: 'spend' }],
    tier: 'model',
    tags: ['hard', 'clause-that-is-not-a-transaction'],
  },
  {
    input: 'topped up salik 100 and metro 50',
    defaultCurrency: 'AED',
    expect: [
      { amountMinor: inr(100), currency: 'AED', merchant: 'salik', type: 'spend' },
      { amountMinor: inr(50), currency: 'AED', merchant: 'metro', type: 'spend' },
    ],
    tier: 'rules',
    tags: ['multi', 'aed'],
  },
  {
    input: 'talabat 60 aed, jio 399',
    defaultCurrency: 'AED',
    expect: [
      { amountMinor: inr(60), currency: 'AED', merchant: 'talabat', type: 'spend' },
      { amountMinor: inr(399), currency: 'AED', merchant: 'jio', type: 'spend' },
    ],
    tier: 'rules',
    tags: ['multi', 'mixed'],
  },
]
