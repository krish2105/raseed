import { money, type Currency, type Money } from '@raseed/money'

/**
 * Turning the text off a photographed receipt into a bill you can split.
 *
 * The OCR itself lives in the apps — Apple's Vision framework on iOS, Tesseract WASM on the
 * web — because both are platform APIs and this package is pure. What arrives here is the
 * recognised text, and everything from there is deterministic and testable, which is the
 * only reason receipt parsing can be trusted at all.
 *
 * **Confidence is the product, not the parse.** A receipt reader that quietly gets a total
 * wrong is worse than one that admits it could not read the photo, because a wrong total
 * enters the ledger and is never questioned again. So every field carries a confidence, the
 * arithmetic is checked against itself, and a bill whose lines do not add up says so.
 */

export interface ReceiptLine {
  readonly description: string
  readonly quantity: number
  /** Price for the whole line, not per unit. */
  readonly amount: Money
  readonly confidence: number
}

export interface ParsedReceipt {
  readonly merchant: string | null
  /** Epoch ms at UTC midnight, or null when no date could be read. */
  readonly occurredAt: number | null
  readonly currency: Currency
  readonly lines: readonly ReceiptLine[]
  readonly subtotal: Money | null
  /** VAT in the UAE, GST in India. Whatever the receipt called it. */
  readonly tax: Money | null
  /** Service charge — distinct from a tip, and frequently mandatory. */
  readonly serviceCharge: Money | null
  readonly tip: Money | null
  readonly total: Money | null
  /**
   * Does subtotal + tax + service + tip actually equal the total?
   *
   * The single most useful signal in the whole parse. When it reconciles, the read is almost
   * certainly right; when it does not, something was misread and the user must look.
   */
  readonly reconciles: boolean
  /** How far off the arithmetic is, when it does not reconcile. */
  readonly discrepancy: Money | null
  readonly confidence: number
  readonly warnings: readonly string[]
}

/**
 * Currency, inferred from the receipt.
 *
 * The tax-registration formats are the strongest signal and cost nothing to use: a **TRN**
 * only exists in the UAE and a **GSTIN** only in India, so a receipt printing either has
 * told you its country even when it never prints a currency symbol — which UAE restaurant
 * bills frequently do not.
 */
const CURRENCY_HINTS: readonly (readonly [RegExp, Currency])[] = [
  [/\bAED\b|د\.إ|\bDHS?\b|DIRHAM|\bTRN\b/i, 'AED'],
  [/₹|\bINR\b|\bRS\.?\b|RUPEE|\bGSTIN?\b|\b[CS]GST\b/i, 'INR'],
]

const TOTAL_WORDS = /\b(?:grand\s+)?total\b|\bamount\s+due\b|\bnet\s+payable\b|\bbalance\s+due\b/i
const SUBTOTAL_WORDS = /\bsub[\s-]?total\b|\bgross\b|\bitems?\s+total\b/i
const TAX_WORDS = /\bvat\b|\bgst\b|\bsales\s+tax\b|\btax\b|\bcgst\b|\bsgst\b/i
const SERVICE_WORDS = /\bservice\s+(?:charge|fee)\b|\bsvc\b|\bgratuity\b/i
const TIP_WORDS = /\btip\b/i

/** Everything a total line is not — so a "Change" line never becomes the bill. */
const NOT_A_TOTAL = /\bchange\b|\bcash\b|\bcard\b|\btender/i

/**
 * No line item on a receipt is worth more than this. Anything larger is a tax id, a phone
 * number or an invoice reference that happened to sit where a price usually goes — and
 * `money()` throws on absurd values, so an unguarded read takes the whole parse down.
 */
const MAX_PLAUSIBLE_MINOR = 100_000_000_00 // 100 million major units

/** Pull the last money-looking number from a line. Receipts put the amount on the right. */
function trailingAmount(line: string): number | null {
  // A number followed by `%` is a RATE. "VAT 5%" is not a five-dirham tax, and reading it as
  // one produced exactly that on the first real receipt this saw.
  const withoutRates = line.replace(/(-?[\d][\d,.]*)\s*%/g, ' ')
  const matches = [...withoutRates.matchAll(/(-?[\d][\d,.\s]*\d|\d)/g)]

  const plausible = (raw: string): number | null => {
    // A long unbroken digit run is an identifier, not a price. A TRN is fifteen digits and
    // reading it as money produced 100,234,567,800,003.00 and took the parser down with it.
    if (/^\d{7,}$/.test(raw.replace(/[.,]/g, ''))  && !/[.,]/.test(raw)) return null
    const value = readNumber(raw)
    if (value === null || Math.abs(value) > MAX_PLAUSIBLE_MINOR) return null
    return value
  }

  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const raw = matches[i]![0].replace(/\s/g, '')
    // A bare integer with no separator at the end of a line is usually a quantity or an
    // item code, not a price. Require a decimal part or a thousands separator.
    if (!/[.,]/.test(raw)) continue
    const value = plausible(raw)
    if (value !== null) return value
  }

  // Fall back to a bare integer only if it is the only number on the line.
  if (matches.length === 1) return plausible(matches[0]![0])
  return null
}

/** Only a price, nothing else: the right-hand column of a receipt, on its own. */
const AMOUNT_ONLY = /^[^\d]{0,3}[\d][\d,.\s]*\d\s*$/

/**
 * Rejoin the blocks an OCR engine returns into the lines a receipt actually has.
 *
 * **Vision is column-major, and that is the whole difficulty.** It groups by text region, so
 * a receipt whose labels sit in a left column and prices in a right one comes back as *every
 * label*, then *every price* — not as rows. The first version of this paired adjacent blocks,
 * which is the obvious guess and is simply wrong; on a real photograph it read every
 * quantity as a price and produced a AED 2.00 butter chicken.
 *
 * Two shapes are handled, because engines and layouts differ:
 *
 * 1. **Column-major** — a run of labels followed by a run of bare amounts. The amounts belong
 *    to the *last* N labels, since a header block ("RAVI RESTAURANT", an address, a TRN) has
 *    no price. Zipped from the end backwards.
 * 2. **Interleaved** — label, amount, label, amount. Paired adjacently.
 *
 * When neither fits, blocks are returned untouched: a wrong pairing invents prices, and a
 * missing one only means fewer lines were read.
 */
export function linesFromBlocks(blocks: readonly string[]): string[] {
  const clean = blocks.map((b) => b.trim()).filter((b) => b !== '')
  if (clean.length === 0) return []

  const isAmount = (b: string) => AMOUNT_ONLY.test(b) && trailingAmount(b) !== null

  const firstAmount = clean.findIndex(isAmount)
  const tail = firstAmount === -1 ? [] : clean.slice(firstAmount)

  // Column-major: everything from the first bare amount onwards is a bare amount.
  if (firstAmount > 0 && tail.length > 1 && tail.every(isAmount)) {
    const labels = clean.slice(0, firstAmount)
    const amounts = tail

    // The prices attach to the LAST `amounts.length` labels. Anything before that is header.
    const offset = labels.length - amounts.length
    if (offset >= 0) {
      return [
        ...labels.slice(0, offset),
        ...amounts.map((amount, i) => `${labels[offset + i]} ${amount}`),
      ]
    }
  }

  // Interleaved, or no clean split: pair a label with a bare amount immediately after it.
  const out: string[] = []
  for (let i = 0; i < clean.length; i += 1) {
    const current = clean[i] as string
    const next = clean[i + 1]

    // Ends with a digit, so the price is already here. Asking `trailingAmount` instead was
    // wrong: "2 x Butter Chicken" contains a number — the QUANTITY.
    const hasOwnAmount = /\d\s*$/.test(current)

    if (!hasOwnAmount && next !== undefined && isAmount(next)) {
      out.push(`${current} ${next}`)
      i += 1
      continue
    }
    out.push(current)
  }
  return out
}

function readNumber(raw: string): number | null {
  const s = raw.replace(/\s/g, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')

  let normalised: string
  if (lastComma === -1 && lastDot === -1) normalised = s
  else if (lastComma > lastDot) {
    normalised = s.slice(0, lastComma).replace(/[.,]/g, '') + '.' + s.slice(lastComma + 1)
  } else {
    normalised = s.slice(0, lastDot).replace(/[.,]/g, '') + '.' + s.slice(lastDot + 1)
  }

  const [whole = '', frac = ''] = normalised.split('.')
  if (frac.length > 2) normalised = whole + frac

  const value = Number.parseFloat(normalised)
  return Number.isFinite(value) ? Math.round(value * 100) : null
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

function findDate(text: string): number | null {
  const named = /\b(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/](\d{2,4})\b/.exec(text)
  if (named) {
    const month = MONTHS[named[2]!.slice(0, 3).toLowerCase()]
    if (month) {
      let year = Number(named[3])
      if (year < 100) year += 2000
      return Date.UTC(year, month - 1, Number(named[1]))
    }
  }

  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text)
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))

  // Day-first, because both markets this app serves write it that way. A receipt is not a
  // bank statement — there is rarely enough of a sample to infer, so a stated default beats
  // a coin flip, and the confirm sheet is where a wrong date gets caught.
  const numeric = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(text)
  if (numeric) {
    let year = Number(numeric[3])
    if (year < 100) year += 2000
    const day = Number(numeric[1])
    const month = Number(numeric[2])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return Date.UTC(year, month - 1, day)
    }
  }
  return null
}

export function parseReceipt(
  text: string,
  { defaultCurrency = 'INR' }: { readonly defaultCurrency?: Currency } = {},
): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')

  const warnings: string[] = []

  const currency =
    CURRENCY_HINTS.find(([pattern]) => pattern.test(text))?.[1] ?? defaultCurrency

  // The merchant is the first substantial line that is not an address, a phone number or a
  // tax id. Receipts put the name at the top, in the biggest type OCR sees first.
  const merchant =
    lines.find(
      (l) =>
        l.length >= 3 &&
        l.length <= 40 &&
        !/\d{4,}/.test(l) &&
        !/\b(?:tel|phone|trn|gstin|vat\s*no|invoice|receipt|bill)\b/i.test(l),
    ) ?? null

  const named = new Map<'total' | 'subtotal' | 'tax' | 'service' | 'tip', number>()
  const items: ReceiptLine[] = []

  for (const line of lines) {
    const amount = trailingAmount(line)
    if (amount === null) continue

    if (NOT_A_TOTAL.test(line)) continue

    // Order matters: "sub-total" contains "total", so subtotal is tested first.
    if (SUBTOTAL_WORDS.test(line)) {
      named.set('subtotal', amount)
      continue
    }
    if (SERVICE_WORDS.test(line)) {
      named.set('service', amount)
      continue
    }
    if (TIP_WORDS.test(line)) {
      named.set('tip', amount)
      continue
    }
    if (TAX_WORDS.test(line)) {
      // Several tax lines (CGST + SGST) sum rather than overwrite.
      named.set('tax', (named.get('tax') ?? 0) + amount)
      continue
    }
    if (TOTAL_WORDS.test(line)) {
      named.set('total', amount)
      continue
    }

    // Anything else with a price is an item. `2 x Latte 90.00` or `Latte  45.00`.
    const qty = /^(\d{1,2})\s*[xX*]\s+/.exec(line)
    const description = line
      .replace(/(-?[\d][\d,.\s]*\d|\d)\s*$/, '')
      .replace(/^\d{1,2}\s*[xX*]\s+/, '')
      .trim()

    if (description.length >= 2 && amount > 0) {
      items.push({
        description,
        quantity: qty ? Number(qty[1]) : 1,
        amount: money(amount, currency),
        confidence: 0.7,
      })
    }
  }

  const asMoney = (v: number | undefined) => (v === undefined ? null : money(v, currency))

  const subtotal = asMoney(named.get('subtotal'))
  const tax = asMoney(named.get('tax'))
  const serviceCharge = asMoney(named.get('service'))
  const tip = asMoney(named.get('tip'))
  const total = asMoney(named.get('total'))

  // The check that makes the whole thing trustworthy.
  const itemsSum = items.reduce((a, l) => a + l.amount.minor, 0)
  const base = subtotal?.minor ?? itemsSum
  const built = base + (tax?.minor ?? 0) + (serviceCharge?.minor ?? 0) + (tip?.minor ?? 0)

  // One rupee or fils of slack: receipts round their own tax lines and the printed total is
  // occasionally a paisa off its own components.
  const gap = total === null ? null : total.minor - built
  const reconciles = gap !== null && Math.abs(gap) <= 1

  if (total === null) warnings.push('No total found — check the photo caught the bottom of the bill.')
  if (items.length === 0) warnings.push('No line items read.')
  if (gap !== null && !reconciles) {
    warnings.push(
      `The lines add to ${(built / 100).toFixed(2)} but the total says ${(total!.minor / 100).toFixed(2)}. Something was misread.`,
    )
  }
  if (subtotal === null && items.length > 0) {
    warnings.push('No subtotal line; the item prices were summed instead.')
  }

  // Confidence is deliberately harsh. It gates whether the app dares propose a transaction
  // without a human looking at it, and optimism there is expensive.
  let confidence = 0.25
  if (total !== null) confidence += 0.3
  if (reconciles) confidence += 0.3
  if (merchant !== null) confidence += 0.1
  if (items.length > 0) confidence += 0.05

  return {
    merchant,
    occurredAt: findDate(text),
    currency,
    lines: items,
    subtotal,
    tax,
    serviceCharge,
    tip,
    total,
    reconciles,
    discrepancy: gap === null || reconciles ? null : money(gap, currency),
    confidence: Math.min(1, confidence),
    warnings,
  }
}

/**
 * Split a receipt by who ate what, then share the tax and service proportionally.
 *
 * The reason full itemisation is worth the trouble: three people at dinner where one had
 * the wine should not split it evenly, and the tax and service charge on that wine belong
 * to whoever drank it. Splitting the extras in proportion to each person's items is the
 * only fair reading, and nobody does it by hand.
 */
export function splitByItems(
  receipt: ParsedReceipt,
  assignment: Readonly<Record<number, readonly string[]>>,
): { readonly personId: string; readonly owes: Money }[] {
  const owed = new Map<string, number>()

  receipt.lines.forEach((line, index) => {
    const people = assignment[index] ?? []
    if (people.length === 0) return
    // Integer division with the remainder handed out one unit at a time, so an item split
    // three ways never loses a paisa.
    const each = Math.floor(line.amount.minor / people.length)
    let remainder = line.amount.minor - each * people.length
    for (const person of people) {
      const extra = remainder > 0 ? 1 : 0
      remainder -= extra
      owed.set(person, (owed.get(person) ?? 0) + each + extra)
    }
  })

  const itemsTotal = [...owed.values()].reduce((a, b) => a + b, 0)
  const extras =
    (receipt.tax?.minor ?? 0) + (receipt.serviceCharge?.minor ?? 0) + (receipt.tip?.minor ?? 0)

  if (itemsTotal === 0 || extras === 0) {
    return [...owed.entries()].map(([personId, minor]) => ({
      personId,
      owes: money(minor, receipt.currency),
    }))
  }

  // Proportional share of the extras, with the rounding remainder given to the largest
  // share — so the sum still equals the bill exactly.
  const entries = [...owed.entries()].sort((a, b) => b[1] - a[1])
  let distributed = 0
  const withExtras = entries.map(([personId, minor], i) => {
    const share = i === entries.length - 1 ? extras - distributed : Math.floor((extras * minor) / itemsTotal)
    distributed += share
    return { personId, owes: money(minor + share, receipt.currency) }
  })

  return withExtras
}
