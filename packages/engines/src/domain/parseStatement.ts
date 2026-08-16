import type { Currency } from '@raseed/money'

/**
 * Reading a bank statement CSV that you have never seen before.
 *
 * There is no standard. HDFC, ICICI, Emirates NBD, Wise and every card issuer emit different
 * columns in different orders with different date formats and different ideas about how to
 * signal a debit. A parser that assumes one shape works for one bank.
 *
 * So this **infers** the shape and reports what it inferred, with a confidence, so the
 * import screen can show its working and let you correct it. It proposes; the sheet commits.
 * Nothing here writes anything.
 *
 * The genuinely hard problem is `03/04/2026`. That is 3 April or 4 March depending on which
 * side of the world the bank is on, and **it is frequently not decidable from the file**.
 * Guessing silently would put a third of a statement in the wrong month, which is invisible
 * and permanent. So ambiguity is detected and *returned* — the UI must ask.
 */

export type DateOrder = 'dmy' | 'mdy' | 'ymd' | 'ambiguous'

export interface ColumnGuess {
  readonly index: number
  readonly header: string
  /** 0–1. Below ~0.5 the import screen should present it as a question. */
  readonly confidence: number
}

export interface StatementRow {
  /** Epoch ms at local midnight of the transaction date. */
  readonly occurredAt: number
  /** Minor units. Negative is money out, matching how a ledger reads. */
  readonly amountMinor: number
  readonly description: string
  readonly currency: Currency
  /** The original line, kept so a bad import can always be audited back to its source. */
  readonly raw: string
}

export interface ParsedStatement {
  readonly rows: readonly StatementRow[]
  readonly dateOrder: DateOrder
  readonly columns: {
    readonly date: ColumnGuess | null
    readonly amount: ColumnGuess | null
    readonly debit: ColumnGuess | null
    readonly credit: ColumnGuess | null
    readonly description: ColumnGuess | null
  }
  readonly currency: Currency
  readonly delimiter: string
  /** Lines that could not be read, with the reason. Never silently dropped. */
  readonly skipped: readonly { readonly line: number; readonly reason: string }[]
  /**
   * True when the file cannot tell 03/04 from 04/03. The import screen **must** ask rather
   * than pick — a silent wrong guess misfiles a third of the rows into the wrong month and
   * nothing about the result looks wrong.
   */
  readonly needsDateConfirmation: boolean
}

const DATE_WORDS = ['date', 'txn date', 'transaction date', 'value date', 'posted', 'tarikh']
const DESC_WORDS = ['description', 'narration', 'particulars', 'details', 'merchant', 'remarks', 'reference']
const DEBIT_WORDS = ['debit', 'withdrawal', 'paid out', 'dr', 'spent', 'outflow']
const CREDIT_WORDS = ['credit', 'deposit', 'paid in', 'cr', 'received', 'inflow']
const AMOUNT_WORDS = ['amount', 'value', 'transaction amount', 'amt']

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** Split a CSV line, honouring double-quoted fields that contain the delimiter. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!
    if (ch === '"') {
      // A doubled quote inside a quoted field is a literal quote.
      if (quoted && line[i + 1] === '"') {
        field += '"'
        i += 1
      } else quoted = !quoted
    } else if (ch === delimiter && !quoted) {
      out.push(field.trim())
      field = ''
    } else field += ch
  }
  out.push(field.trim())
  return out
}

/** The delimiter is whichever candidate gives the most consistent column count. */
function detectDelimiter(lines: readonly string[]): string {
  let best = ','
  let bestScore = -1

  for (const candidate of [',', ';', '\t', '|']) {
    const counts = lines.slice(0, 20).map((l) => splitLine(l, candidate).length)
    const common = counts.filter((c) => c === counts[0]).length
    // Consistency matters more than raw count: a description full of semicolons produces a
    // high but wildly varying count, which is exactly the wrong answer.
    const score = counts[0]! > 1 ? common * counts[0]! : 0
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best
}

/**
 * Parse a number from any of the formats a bank might emit.
 *
 * Handles Indian grouping (`1,23,456.78`), Western (`123,456.78`), European
 * (`1.234,56`), parenthesised negatives, and a trailing `Dr`/`Cr`.
 */
export function parseAmount(text: string): number | null {
  let s = text.trim()
  if (s === '') return null

  let sign = 1
  if (/^\(.*\)$/.test(s)) {
    sign = -1
    s = s.slice(1, -1)
  }
  if (/\bdr\b/i.test(s)) sign = -1
  if (/\bcr\b/i.test(s)) sign = 1

  s = s.replace(/[^\d.,-]/g, '')
  if (s.startsWith('-')) {
    sign = -1
    s = s.slice(1)
  }
  if (s === '') return null

  // Whichever separator appears last is the decimal point. `1.234,56` and `1,234.56` are
  // both unambiguous under that rule; `1,234` has no decimal at all.
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')

  let normalised: string
  if (lastComma === -1 && lastDot === -1) normalised = s
  else if (lastComma > lastDot) {
    normalised = s.slice(0, lastComma).replace(/[.,]/g, '') + '.' + s.slice(lastComma + 1)
  } else {
    normalised = s.slice(0, lastDot).replace(/[.,]/g, '') + '.' + s.slice(lastDot + 1)
  }

  // A "decimal" part longer than two digits is a thousands group, not paise: `1,234` read
  // as 1.234 would divide every rupee figure by a thousand.
  const [whole = '', frac = ''] = normalised.split('.')
  if (frac.length > 2) normalised = whole + frac

  const value = Number.parseFloat(normalised)
  if (!Number.isFinite(value)) return null

  return Math.round(value * 100) * sign
}

/** Pull the three date parts out, without yet deciding which is the day. */
function dateParts(text: string): { a: number; b: number; c: number; monthName: number | null } | null {
  const t = text.trim()

  const named = /^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{2,4})$/.exec(t)
  if (named) {
    const month = MONTHS[named[2]!.slice(0, 3).toLowerCase()]
    if (month) return { a: Number(named[1]), b: month, c: Number(named[3]), monthName: month }
  }

  const numeric = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/.exec(t)
  if (!numeric) return null
  return { a: Number(numeric[1]), b: Number(numeric[2]), c: Number(numeric[3]), monthName: null }
}

/**
 * Decide the date order across the whole file, not row by row.
 *
 * One row cannot tell you; a hundred usually can. If any first field exceeds 12 it must be
 * a day, and the whole file is day-first. If any *second* field exceeds 12 it is month-last.
 * If neither ever happens — a statement where every date falls in the first twelve days of
 * its month — the file genuinely does not say, and this returns `ambiguous`.
 */
export function detectDateOrder(samples: readonly string[]): DateOrder {
  let sawDayFirst = false
  let sawMonthFirst = false
  let sawIso = false

  for (const sample of samples) {
    const parts = dateParts(sample)
    if (!parts) continue
    if (parts.monthName !== null) return 'dmy' // `12-Mar-2026` is never ambiguous
    if (parts.a > 31) {
      sawIso = true
      continue
    }
    if (parts.a > 12) sawDayFirst = true
    if (parts.b > 12) sawMonthFirst = true
  }

  if (sawIso && !sawDayFirst && !sawMonthFirst) return 'ymd'
  if (sawDayFirst && !sawMonthFirst) return 'dmy'
  if (sawMonthFirst && !sawDayFirst) return 'mdy'
  return 'ambiguous'
}

function toEpoch(text: string, order: DateOrder): number | null {
  const parts = dateParts(text)
  if (!parts) return null

  let day: number
  let month: number
  let year: number

  if (parts.monthName !== null) {
    day = parts.a
    month = parts.b
    year = parts.c
  } else if (order === 'ymd' || parts.a > 31) {
    year = parts.a
    month = parts.b
    day = parts.c
  } else if (order === 'mdy') {
    month = parts.a
    day = parts.b
    year = parts.c
  } else {
    day = parts.a
    month = parts.b
    year = parts.c
  }

  if (year < 100) year += year < 70 ? 2000 : 1900
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  // UTC deliberately: a statement date is a calendar date, not an instant. Constructing it
  // in local time shifts every row by the offset and can move dates across a month boundary.
  return Date.UTC(year, month - 1, day)
}

function guessColumn(headers: readonly string[], words: readonly string[]): ColumnGuess | null {
  let best: ColumnGuess | null = null

  headers.forEach((header, index) => {
    const h = header.toLowerCase().trim()
    if (h === '') return
    for (const word of words) {
      // Exact beats contained: a "Debit Card Number" column must not win the debit slot.
      const confidence = h === word ? 1 : h.includes(word) ? 0.6 : 0
      if (confidence > (best?.confidence ?? 0)) best = { index, header, confidence }
    }
  })

  return best
}

export function parseStatement(
  text: string,
  {
    defaultCurrency = 'INR',
    dateOrder,
  }: { readonly defaultCurrency?: Currency; readonly dateOrder?: DateOrder } = {},
): ParsedStatement {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')

  const skipped: { line: number; reason: string }[] = []

  if (lines.length < 2) {
    return {
      rows: [],
      dateOrder: 'ambiguous',
      columns: { date: null, amount: null, debit: null, credit: null, description: null },
      currency: defaultCurrency,
      delimiter: ',',
      skipped: [{ line: 0, reason: 'file has no data rows' }],
      needsDateConfirmation: false,
    }
  }

  const delimiter = detectDelimiter(lines)

  // The header is the first line that names at least one column we recognise. Banks put
  // account summaries above it, and treating line 1 as the header imports the letterhead.
  let headerIndex = 0
  for (let i = 0; i < Math.min(lines.length, 25); i += 1) {
    const cells = splitLine(lines[i]!, delimiter).map((c) => c.toLowerCase())
    const named = [...DATE_WORDS, ...DESC_WORDS, ...DEBIT_WORDS, ...CREDIT_WORDS, ...AMOUNT_WORDS]
    if (cells.some((c) => named.some((w) => c.includes(w)))) {
      headerIndex = i
      break
    }
  }

  const headers = splitLine(lines[headerIndex]!, delimiter)
  const body = lines.slice(headerIndex + 1)

  const columns = {
    date: guessColumn(headers, DATE_WORDS),
    amount: guessColumn(headers, AMOUNT_WORDS),
    debit: guessColumn(headers, DEBIT_WORDS),
    credit: guessColumn(headers, CREDIT_WORDS),
    description: guessColumn(headers, DESC_WORDS),
  }

  const currency: Currency = /\bAED\b|د\.إ/.test(text) && !/₹|\bINR\b/.test(text)
    ? 'AED'
    : defaultCurrency

  const dateIndex = columns.date?.index ?? 0
  const samples = body.slice(0, 200).map((l) => splitLine(l, delimiter)[dateIndex] ?? '')
  const detected = dateOrder ?? detectDateOrder(samples)

  const rows: StatementRow[] = []

  body.forEach((line, i) => {
    const cells = splitLine(line, delimiter)
    const lineNo = headerIndex + 2 + i

    const occurredAt = toEpoch(cells[dateIndex] ?? '', detected === 'ambiguous' ? 'dmy' : detected)
    if (occurredAt === null) {
      skipped.push({ line: lineNo, reason: `could not read a date from "${cells[dateIndex] ?? ''}"` })
      return
    }

    // Separate debit/credit columns win over a single signed column: when a bank provides
    // both, the signed column is often unsigned and the direction lives only in which
    // column is filled.
    let amountMinor: number | null = null
    if (columns.debit || columns.credit) {
      const debit = parseAmount(cells[columns.debit?.index ?? -1] ?? '')
      const credit = parseAmount(cells[columns.credit?.index ?? -1] ?? '')
      if (debit) amountMinor = -Math.abs(debit)
      else if (credit) amountMinor = Math.abs(credit)
    }
    if (amountMinor === null && columns.amount) {
      amountMinor = parseAmount(cells[columns.amount.index] ?? '')
    }

    if (amountMinor === null || amountMinor === 0) {
      skipped.push({ line: lineNo, reason: 'no amount found' })
      return
    }

    rows.push({
      occurredAt,
      amountMinor,
      description: (cells[columns.description?.index ?? -1] ?? '').trim(),
      currency,
      raw: line,
    })
  })

  return {
    rows,
    dateOrder: detected,
    columns,
    currency,
    delimiter,
    skipped,
    needsDateConfirmation: detected === 'ambiguous' && rows.length > 0,
  }
}

/**
 * Which parsed rows are already in the ledger.
 *
 * Same date, same amount, similar description. Deduplication has to ship *with* import, not
 * after it: the same transaction arriving as a statement line and a manual entry must
 * collapse to one row, or every figure the app states afterwards is wrong.
 */
export function findDuplicates(
  incoming: readonly StatementRow[],
  existing: readonly { readonly occurredAt: number; readonly amountMinor: number; readonly description: string }[],
): Set<number> {
  const DAY = 86_400_000
  const duplicates = new Set<number>()

  incoming.forEach((row, i) => {
    const match = existing.some(
      (e) =>
        Math.abs(e.amountMinor) === Math.abs(row.amountMinor) &&
        // A day either side: statement dates and app-entry dates rarely agree exactly.
        Math.abs(e.occurredAt - row.occurredAt) <= DAY &&
        sharesAWord(e.description, row.description),
    )
    if (match) duplicates.add(i)
  })

  return duplicates
}

/** Cheap similarity: one meaningful word in common. Merchant strings vary wildly in form. */
function sharesAWord(a: string, b: string): boolean {
  if (a === '' || b === '') return true // amount and date alone are a strong enough signal
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3),
    )
  const wa = words(a)
  return [...words(b)].some((w) => wa.has(w))
}
