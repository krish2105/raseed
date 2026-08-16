import { mulberry32, type Rng } from '@raseed/engines'

/**
 * @raseed/fixtures — 18 months of plausible India + UAE transactions from a seeded PRNG.
 *
 * Same seed, byte-identical output, always. The web demo mode and the mobile test suite
 * consume the same generator, so a screenshot taken today reproduces next year and a
 * failing test is never "the random data was unlucky".
 *
 * Pure: no Date.now(). The end date is a parameter.
 */

export interface FixtureTransaction {
  id: string
  occurred_at: number
  direction: 'out' | 'in'
  amount_minor: number
  currency: 'INR' | 'AED'
  home_amount_minor: number
  fx_rate: number
  /**
   * INR per AED, frozen at this transaction's date — present on EVERY row, not just AED
   * ones. The currency lens needs it to express an INR-native amount in AED without
   * recomputing anything: the rate travels with the row.
   */
  fx_inr_per_aed: number
  account_id: string
  merchant_id: string | null
  category_id: string
  raw_text: string | null
  source: 'manual' | 'voice' | 'ocr' | 'import'
  txn_type: 'spend' | 'income' | 'transfer' | 'settlement'
  transfer_group_id: string | null
  reversal_of_id: string | null
  trip_id: string | null
  status: 'pending' | 'confirmed' | 'voided'
  confidence: number | null
  note: string | null
  user_id: string
  updated_at: number
  deleted: boolean
}

export interface FixtureLedger {
  readonly transactions: FixtureTransaction[]
  readonly accounts: FixtureAccount[]
  readonly categories: FixtureCategory[]
  readonly merchants: FixtureMerchant[]
  readonly meta: FixtureMeta
}

export interface FixtureAccount {
  id: string
  name: string
  kind: 'bank' | 'card' | 'cash' | 'wallet'
  currency: 'INR' | 'AED'
  opening_minor: number
  is_cash: boolean
}

export interface FixtureCategory {
  id: string
  name: string
  kind: 'need' | 'want' | 'save' | 'income'
}

export interface FixtureMerchant {
  id: string
  canonical_name: string
  category_id: string
  country: 'IN' | 'AE'
  /** Raw descriptor as it appears on a statement — the thing the resolver has to decode. */
  descriptors: string[]
}

export interface FixtureMeta {
  readonly seed: number
  readonly months: number
  readonly endAt: number
  readonly homeCurrency: 'INR'
  /** Deliberately planted so tests can assert the engines find them. */
  readonly planted: {
    readonly remittances: number
    readonly reversalPairs: number
    readonly subscriptionPriceHike: string
    readonly tripId: string
  }
}

const DAY = 86_400_000
const USER = '11111111-1111-1111-1111-111111111111'

/** INR per AED. Frozen per transaction; drifts slowly across the window. */
const FX_BASE = 23.45

export const CATEGORIES: FixtureCategory[] = [
  { id: 'cat-rent', name: 'Rent', kind: 'need' },
  { id: 'cat-groceries', name: 'Groceries', kind: 'need' },
  { id: 'cat-transport', name: 'Transport', kind: 'need' },
  { id: 'cat-utilities', name: 'Utilities', kind: 'need' },
  { id: 'cat-food', name: 'Eating out', kind: 'want' },
  { id: 'cat-subs', name: 'Subscriptions', kind: 'want' },
  { id: 'cat-shopping', name: 'Shopping', kind: 'want' },
  { id: 'cat-health', name: 'Health', kind: 'need' },
  { id: 'cat-savings', name: 'Savings', kind: 'save' },
  { id: 'cat-salary', name: 'Salary', kind: 'income' },
]

export const ACCOUNTS: FixtureAccount[] = [
  { id: 'acct-hdfc', name: 'HDFC Savings', kind: 'bank', currency: 'INR', opening_minor: 18_00_000, is_cash: false },
  { id: 'acct-enbd', name: 'Emirates NBD', kind: 'bank', currency: 'AED', opening_minor: 1_200_000, is_cash: false },
  { id: 'acct-cash-inr', name: 'Wallet (INR)', kind: 'cash', currency: 'INR', opening_minor: 300_000, is_cash: true },
]

export const MERCHANTS: FixtureMerchant[] = [
  { id: 'm-bigbasket', canonical_name: 'BigBasket', category_id: 'cat-groceries', country: 'IN', descriptors: ['bigbasket@ybl', 'UPI/BIGBASKET@YBL/4429'] },
  { id: 'm-swiggy', canonical_name: 'Swiggy', category_id: 'cat-food', country: 'IN', descriptors: ['swiggy@okhdfcbank', 'SWIGGY LIMITED'] },
  { id: 'm-zomato', canonical_name: 'Zomato', category_id: 'cat-food', country: 'IN', descriptors: ['zomato@paytm'] },
  { id: 'm-uber', canonical_name: 'Uber', category_id: 'cat-transport', country: 'IN', descriptors: ['uberindia@icici', 'UBER INDIA SYSTEMS'] },
  { id: 'm-auto', canonical_name: 'Auto rickshaw', category_id: 'cat-transport', country: 'IN', descriptors: ['cash auto'] },
  { id: 'm-netflix', canonical_name: 'Netflix', category_id: 'cat-subs', country: 'IN', descriptors: ['NETFLIX.COM'] },
  { id: 'm-jio', canonical_name: 'Jio', category_id: 'cat-utilities', country: 'IN', descriptors: ['jio@hdfcbank'] },
  { id: 'm-landlord', canonical_name: 'Landlord', category_id: 'cat-rent', country: 'IN', descriptors: ['rent transfer'] },
  { id: 'm-carrefour', canonical_name: 'Carrefour', category_id: 'cat-groceries', country: 'AE', descriptors: ['CARREF MALL EMIRT AE', 'CARREFOUR DXB'] },
  { id: 'm-talabat', canonical_name: 'Talabat', category_id: 'cat-food', country: 'AE', descriptors: ['POS 4412*** TALABAT DXB'] },
  { id: 'm-careem', canonical_name: 'Careem', category_id: 'cat-transport', country: 'AE', descriptors: ['CAREEM NETWORKS AE'] },
  { id: 'm-salik', canonical_name: 'Salik', category_id: 'cat-transport', country: 'AE', descriptors: ['SALIK TOLL DXB'] },
  { id: 'm-adnoc', canonical_name: 'ADNOC', category_id: 'cat-transport', country: 'AE', descriptors: ['ADNOC DISTRIBUTION'] },
]

export interface GenerateOptions {
  /** Same seed → identical ledger. Default 20260816. */
  readonly seed?: number
  /** How many months of history. Default 18. */
  readonly months?: number
  /** Epoch ms of the last day generated. Passed in — this package is pure. */
  readonly endAt: number
}

/**
 * The generator. Everything random flows from one seeded PRNG consumed in a fixed order,
 * which is what makes the output reproducible.
 */
export function generateLedger(options: GenerateOptions): FixtureLedger {
  const { seed = 20_260_816, months = 18, endAt } = options
  const rng = mulberry32(seed)

  const transactions: FixtureTransaction[] = []
  const startAt = endAt - months * 30 * DAY
  let counter = 0

  const id = (prefix: string) => `${prefix}-${(counter += 1).toString().padStart(5, '0')}`

  const fxAt = (at: number): number => {
    // Slow drift plus a small deterministic wobble, so FX attribution has something to see.
    const progress = (at - startAt) / (endAt - startAt || 1)
    return round4(FX_BASE * (1 + 0.06 * progress + 0.01 * Math.sin(progress * 12)))
  }

  const push = (
    t: Omit<FixtureTransaction, 'user_id' | 'updated_at' | 'deleted' | 'fx_inr_per_aed'>,
  ) => {
    transactions.push({
      ...t,
      fx_inr_per_aed: fxAt(t.occurred_at),
      user_id: USER,
      updated_at: t.occurred_at,
      deleted: false,
    })
  }

  const spend = (
    at: number,
    merchant: FixtureMerchant,
    amountMinor: number,
    currency: 'INR' | 'AED',
    extra: Partial<FixtureTransaction> = {},
  ) => {
    const rate = currency === 'AED' ? fxAt(at) : 1
    push({
      id: id('txn'),
      occurred_at: at,
      direction: 'out',
      amount_minor: amountMinor,
      currency,
      home_amount_minor: Math.round(amountMinor * rate),
      fx_rate: rate,
      account_id: currency === 'AED' ? 'acct-enbd' : 'acct-hdfc',
      merchant_id: merchant.id,
      category_id: merchant.category_id,
      raw_text: pick(rng, merchant.descriptors),
      source: 'import',
      txn_type: 'spend',
      transfer_group_id: null,
      reversal_of_id: null,
      trip_id: null,
      status: 'confirmed',
      confidence: 1,
      note: null,
      ...extra,
    })
  }

  // ── salary, rent and subscriptions: the monthly spine ──────────────────────
  const monthStarts: number[] = []
  for (let m = 0; m < months; m += 1) monthStarts.push(startAt + m * 30 * DAY)

  for (const [index, monthStart] of monthStarts.entries()) {
    const rate = fxAt(monthStart)

    // Salary on the 1st, in AED — the user earns in the Gulf.
    push({
      id: id('txn'),
      occurred_at: monthStart,
      direction: 'in',
      amount_minor: 1_800_000,
      currency: 'AED',
      home_amount_minor: Math.round(1_800_000 * rate),
      fx_rate: rate,
      account_id: 'acct-enbd',
      merchant_id: null,
      category_id: 'cat-salary',
      raw_text: 'SALARY CREDIT',
      source: 'import',
      txn_type: 'income',
      transfer_group_id: null,
      reversal_of_id: null,
      trip_id: null,
      status: 'confirmed',
      confidence: 1,
      note: null,
    })

    // Rent on the 3rd, in INR.
    spend(monthStart + 2 * DAY, byId('m-landlord'), 2_200_000, 'INR')

    // Netflix on the 12th — price hike planted at month 12.
    const netflixMinor = index >= 12 ? 79_900 : 64_900
    spend(monthStart + 11 * DAY, byId('m-netflix'), netflixMinor, 'INR')

    // Jio on the 15th.
    spend(monthStart + 14 * DAY, byId('m-jio'), 39_900, 'INR')
  }

  // ── daily discretionary spend ─────────────────────────────────────────────
  const inrMerchants = MERCHANTS.filter((m) => m.country === 'IN' && m.category_id !== 'cat-rent' && m.category_id !== 'cat-subs' && m.category_id !== 'cat-utilities')
  const aeMerchants = MERCHANTS.filter((m) => m.country === 'AE')

  for (let day = 0; day < months * 30; day += 1) {
    const at = startAt + day * DAY
    const weekday = new Date(at).getUTCDay()
    // Weekends are heavier — this is the autocorrelation block bootstrap exists for.
    const busy = weekday === 5 || weekday === 6
    const count = busy ? 2 + Math.floor(rng() * 3) : Math.floor(rng() * 3)

    for (let i = 0; i < count; i += 1) {
      const inUae = rng() < 0.45
      const merchant = inUae ? pick(rng, aeMerchants) : pick(rng, inrMerchants)
      const currency = inUae ? 'AED' : 'INR'
      const base = currency === 'AED' ? 2_000 + rng() * 12_000 : 15_000 + rng() * 90_000
      spend(at + Math.floor(rng() * 12) * 3_600_000, merchant, Math.round(base), currency)
    }
  }

  // ── planted: three refund pairs ───────────────────────────────────────────
  let reversalPairs = 0
  for (const monthIndex of [2, 7, 13]) {
    const at = monthStarts[monthIndex]! + 18 * DAY
    const merchant = byId('m-swiggy')
    const amount = 48_000
    const failedId = id('txn')

    push({
      id: failedId,
      occurred_at: at,
      direction: 'out',
      amount_minor: amount,
      currency: 'INR',
      home_amount_minor: amount,
      fx_rate: 1,
      account_id: 'acct-hdfc',
      merchant_id: merchant.id,
      category_id: merchant.category_id,
      raw_text: 'swiggy@okhdfcbank',
      source: 'import',
      txn_type: 'spend',
      transfer_group_id: null,
      reversal_of_id: null,
      trip_id: null,
      status: 'confirmed',
      confidence: 1,
      note: 'failed payment',
    })
    push({
      id: id('txn'),
      occurred_at: at + 1_800_000,
      direction: 'in',
      amount_minor: amount,
      currency: 'INR',
      home_amount_minor: amount,
      fx_rate: 1,
      account_id: 'acct-hdfc',
      merchant_id: merchant.id,
      category_id: merchant.category_id,
      raw_text: 'REFUND swiggy',
      source: 'import',
      txn_type: 'spend',
      transfer_group_id: null,
      reversal_of_id: failedId,
      trip_id: null,
      status: 'confirmed',
      confidence: 1,
      note: 'refund',
    })
    reversalPairs += 1
  }

  // ── planted: two remittances, AED out and INR in ──────────────────────────
  let remittances = 0
  for (const monthIndex of [4, 10]) {
    const at = monthStarts[monthIndex]! + 5 * DAY
    const rate = fxAt(at)
    const aedMinor = 500_000
    // 1.5% worse than mid-market, so remittance efficiency has something to report.
    const inrMinor = Math.round(aedMinor * rate * 0.985)
    const group = `grp-${monthIndex}`

    push({
      id: id('txn'), occurred_at: at, direction: 'out', amount_minor: aedMinor, currency: 'AED',
      home_amount_minor: Math.round(aedMinor * rate), fx_rate: rate, account_id: 'acct-enbd',
      merchant_id: null, category_id: 'cat-savings', raw_text: 'REMIT TO INDIA', source: 'import',
      txn_type: 'transfer', transfer_group_id: group, reversal_of_id: null, trip_id: null,
      status: 'confirmed', confidence: 1, note: null,
    })
    push({
      id: id('txn'), occurred_at: at + 2 * DAY, direction: 'in', amount_minor: inrMinor, currency: 'INR',
      home_amount_minor: inrMinor, fx_rate: 1, account_id: 'acct-hdfc',
      merchant_id: null, category_id: 'cat-savings', raw_text: 'INWARD REMITTANCE', source: 'import',
      txn_type: 'transfer', transfer_group_id: group, reversal_of_id: null, trip_id: null,
      status: 'confirmed', confidence: 1, note: null,
    })
    remittances += 1
  }

  // ── planted: a Dubai trip ─────────────────────────────────────────────────
  const tripId = 'trip-dubai'
  const tripStart = monthStarts[Math.min(15, months - 1)]! + 6 * DAY
  for (let day = 0; day < 6; day += 1) {
    const at = tripStart + day * DAY
    for (let i = 0; i < 3; i += 1) {
      spend(at + i * 4 * 3_600_000, pick(rng, aeMerchants), Math.round(4_000 + rng() * 20_000), 'AED', {
        trip_id: tripId,
      })
    }
  }

  transactions.sort((a, b) => a.occurred_at - b.occurred_at || a.id.localeCompare(b.id))

  return {
    transactions,
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    merchants: MERCHANTS,
    meta: {
      seed,
      months,
      endAt,
      homeCurrency: 'INR',
      planted: {
        remittances,
        reversalPairs,
        subscriptionPriceHike: 'm-netflix',
        tripId,
      },
    },
  }
}

function byId(id: string): FixtureMerchant {
  const found = MERCHANTS.find((m) => m.id === id)
  if (!found) throw new Error(`unknown fixture merchant ${id}`)
  return found
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
