import type { FixtureTransaction } from '@raseed/fixtures'

/**
 * Taking your data out.
 *
 * `RASEED_SECURITY_ARCHITECTURE.md` §3 is blunt about why this is not a feature: under the
 * DPDP Act, data portability is a right, and "email us and we'll see" is not a compliance
 * position. It was also the last unbuilt item in Web P10.
 *
 * The serialisation is pure and lives apart from the download so it can be tested. A CSV
 * writer that quotes wrongly corrupts data silently — the file opens, the columns look right,
 * and one merchant with a comma in its name has shifted every field after it.
 */

/** Exactly the columns stored, renamed to nothing. An export that reshapes is not an export. */
const COLUMNS = [
  'id',
  'occurred_at',
  'occurred_at_iso',
  'direction',
  'amount_minor',
  'currency',
  'home_amount_minor',
  'fx_rate',
  'fx_inr_per_aed',
  'account_id',
  'merchant_id',
  'category_id',
  'raw_text',
  'source',
  'txn_type',
  'transfer_group_id',
  'reversal_of_id',
  'trip_id',
  'status',
  'note',
] as const

/**
 * RFC 4180 quoting: wrap in quotes when the value contains a comma, a quote or a newline, and
 * double any embedded quote. `null` becomes empty rather than the string "null", which would
 * otherwise re-import as four characters of text.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

export function toCsv(rows: readonly FixtureTransaction[]): string {
  const lines = [COLUMNS.join(',')]
  for (const r of rows) {
    lines.push(
      COLUMNS.map((c) =>
        csvCell(
          c === 'occurred_at_iso'
            ? new Date(r.occurred_at).toISOString()
            : (r as unknown as Record<string, unknown>)[c],
        ),
      ).join(','),
    )
  }
  // Trailing newline: POSIX tools treat a file without one as truncated.
  return lines.join('\r\n') + '\r\n'
}

export interface ExportBundle {
  readonly format: 'raseed.export.v1'
  readonly exportedAt: string
  readonly counts: { readonly transactions: number }
  readonly notes: readonly string[]
  readonly transactions: readonly FixtureTransaction[]
}

/**
 * The JSON export carries the rows unmodified plus the caveats a reader needs to interpret
 * them. Amounts are integer minor units — an export that silently divided by 100 would be the
 * same float bug this whole codebase avoids, exported.
 */
export function toBundle(
  rows: readonly FixtureTransaction[],
  exportedAt: number,
): ExportBundle {
  return {
    format: 'raseed.export.v1',
    exportedAt: new Date(exportedAt).toISOString(),
    counts: { transactions: rows.length },
    notes: [
      'Amounts are integer minor units: 12345 means 123.45, never a float.',
      'fx_rate and fx_inr_per_aed are frozen at each transaction date and are not live rates.',
      'home_amount_minor was computed at write time using that frozen rate.',
      'occurred_at is epoch milliseconds; occurred_at_iso in the CSV is the same instant in UTC.',
      'Rows include the seeded demo ledger as well as anything you added in this browser.',
    ],
    transactions: rows,
  }
}

export function filename(kind: 'csv' | 'json', exportedAt: number): string {
  const d = new Date(exportedAt)
  const stamp = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  return `raseed-export-${stamp}.${kind}`
}
