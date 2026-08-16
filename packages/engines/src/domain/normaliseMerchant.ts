/**
 * Raw payment descriptor → a comparable key.
 *
 * `razorpay@hdfcbank`, `UPI/razorpay@hdfcbank/1234` and `RAZORPAY@HDFCBANK` must all reduce
 * to the same string, or the alias table learns the same merchant three times.
 */

/** UPI handles and card-network noise that carry no merchant information. */
const BANK_HANDLES = [
  'ybl', 'okaxis', 'okhdfcbank', 'okicici', 'oksbi', 'hdfcbank', 'icici', 'axisbank',
  'paytm', 'ibl', 'axl', 'upi', 'sbi', 'kotak', 'yesbank', 'apl', 'airtel', 'freecharge',
]

/** Acquirer and channel prefixes that appear before the actual merchant name. */
const NOISE_TOKENS = [
  'upi', 'pos', 'ach', 'neft', 'imps', 'rtgs', 'atm', 'ecom', 'nfc', 'vps', 'mps',
  'purchase', 'payment', 'paytm', 'razorpay', 'billdesk', 'ccavenue', 'pine', 'pg',
  'ae', 'are', 'uae', 'dubai', 'auh', 'dxb', 'in', 'ind',
]

export interface NormaliseOptions {
  /** Strip trailing country/city tokens common in UAE card descriptors. Default true. */
  readonly stripGeography?: boolean
}

/**
 * Lowercase, drop the bank handle, strip digits and separators, remove acquirer noise,
 * collapse whitespace.
 *
 * Returns '' when nothing survives — callers treat that as "unresolvable", not as a key.
 */
export function normaliseMerchant(raw: string, options: NormaliseOptions = {}): string {
  const { stripGeography = true } = options

  let s = raw.toLowerCase().trim()

  // `merchant@ybl` → `merchant`. Only the handle after the LAST @ is a bank.
  const at = s.lastIndexOf('@')
  if (at > 0) {
    const handle = s.slice(at + 1).replace(/[^a-z]/g, '')
    if (BANK_HANDLES.includes(handle)) s = s.slice(0, at)
  }

  // Separators to spaces, then drop anything that is not a letter or space.
  s = s.replace(/[/_\-.*#|]+/g, ' ').replace(/[^a-z\s]/g, ' ')

  const geography = stripGeography ? NOISE_TOKENS : NOISE_TOKENS.filter((t) => !isGeography(t))

  const kept = s
    .split(/\s+/)
    .filter(Boolean)
    // A single letter is never a merchant name; it is a leftover from stripped digits.
    .filter((token) => token.length > 1)
    .filter((token) => !geography.includes(token))

  return kept.join(' ').trim()
}

function isGeography(token: string): boolean {
  return ['ae', 'are', 'uae', 'dubai', 'auh', 'dxb', 'in', 'ind'].includes(token)
}

/**
 * Trigram (3-gram) similarity, 0–1. Used as the fallback when an exact alias misses, before
 * paying for an LLM lookup.
 */
export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return a.length === 0 ? 0 : 1
  const ga = trigrams(a)
  const gb = trigrams(b)
  if (ga.size === 0 || gb.size === 0) return 0

  let shared = 0
  for (const g of ga) if (gb.has(g)) shared += 1

  // Jaccard: shared over union.
  return shared / (ga.size + gb.size - shared)
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `
  const out = new Set<string>()
  for (let i = 0; i < padded.length - 2; i += 1) out.add(padded.slice(i, i + 3))
  return out
}
