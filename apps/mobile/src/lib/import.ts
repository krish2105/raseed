import type { StatementRow } from '@raseed/engines'

/**
 * The decisions the import screen makes about a parsed statement.
 *
 * `parseStatement` is thoroughly tested and owns everything hard — delimiters, headers below a
 * bank's preamble, Indian grouping, Dr/Cr, separate debit and credit columns. What is NOT in
 * the engine, and what actually writes to the ledger, is the handful of rules below. They live
 * here rather than inline in the screen so they can be tested without a simulator.
 */

/**
 * Rows that will actually be written.
 *
 * Duplicates and hand-excluded rows drop out. **Credits drop out too**, and that is the one
 * with teeth: a statement contains your salary, and importing a credit as a spend row would
 * inflate every figure on the phone by a month's income. They are still *shown* — seeing the
 * salary land proves the file was read correctly — but showing and writing are different acts.
 */
export function importableRows(
  rows: readonly StatementRow[],
  duplicates: ReadonlySet<number>,
  excluded: ReadonlySet<number>,
): StatementRow[] {
  return rows.filter((_, i) => !duplicates.has(i) && !excluded.has(i))
}

/** Of the importable rows, the outflows — the only ones that become transactions. */
export function spendRows(rows: readonly StatementRow[]): StatementRow[] {
  return rows.filter((r) => r.amountMinor < 0)
}

/**
 * Whether the import button should be disabled, and why.
 *
 * The date-order question is the reason this exists. `03/04/2026` is two different days
 * depending on the bank, and a silent wrong guess misfiles a third of the rows into the wrong
 * month with nothing about the result looking wrong — so an ambiguous file blocks the import
 * until it is answered rather than defaulting.
 */
export function importBlockedReason(
  fileIsAmbiguous: boolean,
  answered: boolean,
  importableCount: number,
): string | null {
  if (fileIsAmbiguous && !answered) return 'Answer the date question first'
  if (importableCount === 0) return 'Nothing new to import'
  return null
}
