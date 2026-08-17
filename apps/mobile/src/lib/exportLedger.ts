import { Directory, File, Paths } from 'expo-file-system'
import { Share } from 'react-native'

import type { LedgerEntry } from '@/db'

/**
 * Take your data with you (S9).
 *
 * The dashboard has had export since S22; the phone — which is where the ledger actually lives —
 * had none. A deletion right without an export right is not a right, it is a shredder.
 *
 * **Unfiltered by `v_spend`, deliberately.** Every other read in this app goes through the spend
 * predicate because a total must not disagree with itself. An export is not a total: it is your
 * data, and a transfer or a refunded charge you are not shown is one you cannot audit. The same
 * decision the web export made, for the same reason.
 */

function csvCell(value: string | number | null): string {
  if (value === null) return ''
  const text = String(value)
  // Quote anything that could break a row, and double any quote inside it. A merchant called
  // `Bob"s, Café` has broken more CSV imports than every other cause combined.
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export interface ExportRow {
  readonly id: string
  readonly occurredAt: number
  readonly direction: string
  readonly amountMinor: number
  readonly currency: string
  readonly homeAmountMinor: number
  readonly fxRate: number
  readonly merchant: string
  readonly category: string
  readonly txnType: string
  readonly status: string
  readonly note: string | null
}

export function toCsv(rows: readonly ExportRow[]): string {
  const header = [
    'id',
    'occurred_at_iso',
    'direction',
    'amount_minor',
    'currency',
    'home_amount_minor',
    'fx_rate',
    'merchant',
    'category',
    'txn_type',
    'status',
    'note',
  ]
  const lines = rows.map((r) =>
    [
      r.id,
      new Date(r.occurredAt).toISOString(),
      r.direction,
      // Minor units, not a formatted amount. An export that writes "₹1,234.00" has turned an
      // integer into a string somebody else has to parse back, badly.
      r.amountMinor,
      r.currency,
      r.homeAmountMinor,
      r.fxRate,
      r.merchant,
      r.category,
      r.txnType,
      r.status,
      r.note,
    ]
      .map(csvCell)
      .join(','),
  )
  return [header.join(','), ...lines].join('\n')
}

export function toJson(rows: readonly ExportRow[], now: number): string {
  return JSON.stringify(
    {
      exportedAt: new Date(now).toISOString(),
      source: 'RASEED (iOS)',
      conventions: {
        amounts: 'Integer minor units. Divide by 100 for INR and AED.',
        fxRate: 'Frozen at transaction date and never recomputed.',
        homeAmountMinor: 'amount_minor × fx_rate, computed once at write time.',
        filtering:
          'Unfiltered. Includes transfers, income and reversal pairs, which v_spend excludes — an export is your data, not a view of it.',
      },
      count: rows.length,
      transactions: rows,
    },
    null,
    2,
  )
}

/**
 * Write the file and hand it to the share sheet.
 *
 * A real file rather than a giant string in the share payload: a year of transactions is
 * megabytes, and the OS sheet is the right place to choose where it goes — Files, AirDrop, a
 * mail draft — rather than this app deciding.
 */
export async function shareExport(
  contents: string,
  filename: string,
  mimeType: string,
): Promise<void> {
  const dir = new Directory(Paths.cache, 'export')
  if (!dir.exists) dir.create()
  const file = new File(dir, filename)
  if (file.exists) file.delete()
  file.create()
  file.write(contents)

  await Share.share({ url: file.uri, title: filename, message: filename })
}

/** Map a ledger read onto the export shape. Kept here so the screen holds no formatting. */
export function fromLedger(entries: readonly LedgerEntry[]): ExportRow[] {
  return entries.map((e) => ({
    id: e.id,
    occurredAt: e.occurredAt,
    direction: 'out',
    amountMinor: e.amount.minor,
    currency: e.currency,
    homeAmountMinor: e.homeAmount.minor,
    fxRate: e.currency === 'INR' ? 1 : Math.round((e.homeAmount.minor / e.amount.minor) * 1e6) / 1e6,
    merchant: e.merchant,
    category: e.category,
    txnType: 'spend',
    status: 'confirmed',
    note: e.note,
  }))
}
