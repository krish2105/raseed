import { describe, expect, it } from 'vitest'
import { findDuplicates, parseStatement, type StatementRow } from '@raseed/engines'

import { importBlockedReason, importableRows, spendRows } from '../import'

/** An HDFC-shaped export: separate withdrawal/deposit columns, Indian digit grouping. */
const HDFC = `Date,Narration,Withdrawal Amt.,Deposit Amt.
03/04/2026,UPI-SWIGGY-swiggy@okhdfc,"1,234.50",
15/04/2026,SALARY CREDIT,,"1,50,000.00"
22/04/2026,BIGBASKET RETAIL,"2,340.00",
28/04/2026,UBER INDIA,"456.00",`

/** Every date lands in the first twelve days, so the file cannot say which order it is in. */
const AMBIGUOUS = `Date,Description,Amount
03/04/2026,COFFEE,-100.00
05/06/2026,LUNCH,-200.00`

const row = (amountMinor: number, description = 'X'): StatementRow => ({
  occurredAt: 1_755_300_000_000,
  amountMinor,
  description,
  currency: 'INR',
  raw: description,
})

describe('what actually gets written', () => {
  /**
   * The one with teeth. A statement contains your salary; importing it as spend would inflate
   * every figure on the phone by a month's income.
   */
  it('never writes a credit as a spend row', () => {
    const parsed = parseStatement(HDFC, { dateOrder: 'dmy' })
    const importable = importableRows(parsed.rows, new Set(), new Set())
    const willWrite = spendRows(importable)

    expect(parsed.rows.some((r) => r.amountMinor > 0)).toBe(true) // the salary is parsed
    expect(willWrite.every((r) => r.amountMinor < 0)).toBe(true) // and is not written
    expect(willWrite.map((r) => r.description)).not.toContain('SALARY CREDIT')
    expect(willWrite).toHaveLength(3)
  })

  it('keeps the credit visible so the file can be checked', () => {
    const parsed = parseStatement(HDFC, { dateOrder: 'dmy' })
    // Shown is not written: importableRows still contains it for the preview.
    expect(importableRows(parsed.rows, new Set(), new Set())).toHaveLength(4)
  })

  it('drops duplicates and hand-excluded rows', () => {
    const rows = [row(-100, 'a'), row(-200, 'b'), row(-300, 'c')]
    expect(importableRows(rows, new Set([0]), new Set([2])).map((r) => r.description)).toEqual([
      'b',
    ])
  })

  /** Re-importing the same file must add nothing. */
  it('finds every row again on a second import of the same file', () => {
    const parsed = parseStatement(HDFC, { dateOrder: 'dmy' })
    const existing = parsed.rows.map((r) => ({
      occurredAt: r.occurredAt,
      amountMinor: r.amountMinor,
      description: r.description,
    }))
    const dupes = findDuplicates(parsed.rows, existing)
    expect(importableRows(parsed.rows, dupes, new Set())).toHaveLength(0)
  })
})

describe('when the import is blocked', () => {
  it('blocks an ambiguous file until the date order is answered', () => {
    const parsed = parseStatement(AMBIGUOUS)
    expect(parsed.dateOrder).toBe('ambiguous')
    expect(importBlockedReason(true, false, 2)).toBe('Answer the date question first')
    expect(importBlockedReason(true, true, 2)).toBeNull()
  })

  it('does not block a file whose dates are unambiguous', () => {
    expect(parseStatement(HDFC).dateOrder).not.toBe('ambiguous')
    expect(importBlockedReason(false, false, 3)).toBeNull()
  })

  it('blocks when everything is a duplicate', () => {
    expect(importBlockedReason(false, false, 0)).toBe('Nothing new to import')
  })
})

describe('the answer changes the dates', () => {
  it('reads 03/04 as 3 April day-first and 4 March month-first', () => {
    const dmy = parseStatement(AMBIGUOUS, { dateOrder: 'dmy' })
    const mdy = parseStatement(AMBIGUOUS, { dateOrder: 'mdy' })
    const month = (r: StatementRow) => new Date(r.occurredAt).getMonth()
    expect(month(dmy.rows[0]!)).toBe(3) // April
    expect(month(mdy.rows[0]!)).toBe(2) // March
  })
})
