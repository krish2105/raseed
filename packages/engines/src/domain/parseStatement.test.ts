import { describe, expect, it } from 'vitest'
import {
  detectDateOrder,
  findDuplicates,
  parseAmount,
  parseStatement,
} from './parseStatement'

const HDFC = `Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance
03/04/2026,UPI-SWIGGY-swiggy@okhdfc,"1,234.50",,"45,678.90"
15/04/2026,SALARY CREDIT,,"1,50,000.00","1,95,678.90"
22/04/2026,BIGBASKET RETAIL,"2,340.00",,"1,93,338.90"`

const ENBD = `Value Date;Description;Amount;Currency
2026-04-03;CARREFOUR DUBAI MALL;-101.09;AED
2026-04-15;SALARY;12000.00;AED`

describe('parseAmount', () => {
  it.each([
    ['1,234.50', 123_450],
    ['1,23,456.78', 12_345_678], // Indian grouping
    ['1.234,56', 123_456], // European
    ['(500.00)', -50_000], // parenthesised negative
    ['-99.99', -9_999],
    ['500 Dr', -50_000],
    ['500 Cr', 50_000],
    ['₹1,200', 120_000],
    ['1,234', 123_400], // no decimal part at all
  ])('reads %s', (input, expected) => {
    expect(parseAmount(input)).toBe(expected)
  })

  it('returns null on anything it cannot read, rather than 0', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('  ')).toBeNull()
    expect(parseAmount('N/A')).toBeNull()
  })
})

describe('detectDateOrder', () => {
  it('is day-first when any day exceeds 12', () => {
    expect(detectDateOrder(['03/04/2026', '22/04/2026'])).toBe('dmy')
  })

  it('is month-first when any month position exceeds 12', () => {
    expect(detectDateOrder(['04/22/2026', '03/04/2026'])).toBe('mdy')
  })

  it('recognises ISO', () => {
    expect(detectDateOrder(['2026-04-03', '2026-04-15'])).toBe('ymd')
  })

  it('is never ambiguous when the month is named', () => {
    expect(detectDateOrder(['03-Apr-2026'])).toBe('dmy')
  })

  /**
   * The case that matters. A statement where every date falls in the first twelve days of
   * its month genuinely does not say which order it is in. Guessing misfiles a third of the
   * rows into the wrong month, and nothing about the result looks wrong.
   */
  it('admits ambiguity rather than guessing', () => {
    expect(detectDateOrder(['03/04/2026', '05/06/2026', '01/02/2026'])).toBe('ambiguous')
  })
})

describe('parseStatement', () => {
  it('reads an HDFC-shaped file with separate debit and credit columns', () => {
    const p = parseStatement(HDFC)

    expect(p.delimiter).toBe(',')
    expect(p.dateOrder).toBe('dmy')
    expect(p.rows).toHaveLength(3)
    expect(p.skipped).toEqual([])

    // Withdrawals are negative, deposits positive — direction from which column is filled.
    expect(p.rows[0]!.amountMinor).toBe(-123_450)
    expect(p.rows[1]!.amountMinor).toBe(15_000_000)
    expect(p.rows[0]!.description).toContain('SWIGGY')
  })

  it('reads a semicolon file with a single signed amount column', () => {
    const p = parseStatement(ENBD)

    expect(p.delimiter).toBe(';')
    expect(p.dateOrder).toBe('ymd')
    expect(p.currency).toBe('AED')
    expect(p.rows[0]!.amountMinor).toBe(-10_109)
    expect(p.rows[1]!.amountMinor).toBe(1_200_000)
  })

  /** Banks put an account summary above the real header. Line 1 is the letterhead. */
  it('finds the header below a preamble instead of importing the letterhead', () => {
    const p = parseStatement(
      `Statement of Account
Account Number,50100123456789
Period,01-Apr-2026 to 30-Apr-2026

Date,Narration,Withdrawal Amt.,Deposit Amt.
03/04/2026,SWIGGY,"1,234.50",`,
    )
    expect(p.rows).toHaveLength(1)
    expect(p.columns.date?.header).toBe('Date')
  })

  it('keeps a quoted delimiter inside a description', () => {
    const p = parseStatement(
      `Date,Description,Amount
03/04/2026,"SWIGGY, BENGALURU",-500.00`,
    )
    expect(p.rows[0]!.description).toBe('SWIGGY, BENGALURU')
  })

  it('reports what it could not read rather than dropping it silently', () => {
    const p = parseStatement(
      `Date,Description,Amount
03/04/2026,GOOD,-500.00
not-a-date,BAD,-100.00
05/04/2026,NO AMOUNT,`,
    )
    expect(p.rows).toHaveLength(1)
    expect(p.skipped).toHaveLength(2)
    expect(p.skipped[0]!.reason).toMatch(/date/i)
    expect(p.skipped[1]!.reason).toMatch(/amount/i)
  })

  it('flags an ambiguous file for confirmation instead of picking', () => {
    const p = parseStatement(
      `Date,Description,Amount
03/04/2026,A,-100.00
05/06/2026,B,-200.00`,
    )
    expect(p.dateOrder).toBe('ambiguous')
    expect(p.needsDateConfirmation).toBe(true)
  })

  it('honours a date order the user confirmed', () => {
    const p = parseStatement(
      `Date,Description,Amount
03/04/2026,A,-100.00`,
      { dateOrder: 'mdy' },
    )
    // March 4th, not April 3rd.
    expect(new Date(p.rows[0]!.occurredAt).getUTCMonth()).toBe(2)
    expect(p.needsDateConfirmation).toBe(false)
  })

  it('keeps the original line so a bad import can be audited', () => {
    const p = parseStatement(HDFC)
    expect(p.rows[0]!.raw).toContain('UPI-SWIGGY')
  })

  it('is safe on an empty or headers-only file', () => {
    expect(parseStatement('').rows).toEqual([])
    expect(parseStatement('Date,Amount').rows).toEqual([])
  })

  /** A "Debit Card Number" column must not win the debit slot. */
  it('prefers an exact header match over a contained one', () => {
    const p = parseStatement(
      `Date,Debit Card Number,Debit,Credit
03/04/2026,4111111111111111,500.00,`,
    )
    expect(p.columns.debit?.header).toBe('Debit')
    expect(p.rows[0]!.amountMinor).toBe(-50_000)
  })
})

describe('findDuplicates', () => {
  const existing = [
    { occurredAt: Date.UTC(2026, 3, 3), amountMinor: -123_450, description: 'Swiggy order' },
  ]

  it('catches the same transaction arriving twice', () => {
    const dup = findDuplicates(
      [
        {
          occurredAt: Date.UTC(2026, 3, 3),
          amountMinor: -123_450,
          description: 'UPI-SWIGGY-swiggy@okhdfc',
          currency: 'INR',
          raw: '',
        },
      ],
      existing,
    )
    expect(dup.has(0)).toBe(true)
  })

  /** Statement dates and app-entry dates rarely agree exactly. */
  it('tolerates a day either side', () => {
    const dup = findDuplicates(
      [
        {
          occurredAt: Date.UTC(2026, 3, 4),
          amountMinor: -123_450,
          description: 'Swiggy',
          currency: 'INR',
          raw: '',
        },
      ],
      existing,
    )
    expect(dup.has(0)).toBe(true)
  })

  it('does not collapse two genuinely different transactions', () => {
    const dup = findDuplicates(
      [
        {
          occurredAt: Date.UTC(2026, 3, 3),
          amountMinor: -123_450,
          description: 'BigBasket groceries',
          currency: 'INR',
          raw: '',
        },
      ],
      existing,
    )
    expect(dup.size).toBe(0)
  })

  it('does not treat a different amount on the same day as a duplicate', () => {
    const dup = findDuplicates(
      [
        {
          occurredAt: Date.UTC(2026, 3, 3),
          amountMinor: -99_900,
          description: 'Swiggy order',
          currency: 'INR',
          raw: '',
        },
      ],
      existing,
    )
    expect(dup.size).toBe(0)
  })
})
