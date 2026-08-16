import { describe, expect, it } from 'vitest'
import type { FixtureTransaction } from '@raseed/fixtures'

import { csvCell, filename, toBundle, toCsv } from '@/lib/export'

const row = (over: Partial<FixtureTransaction> = {}): FixtureTransaction =>
  ({
    id: 'txn-1',
    occurred_at: 1_755_300_000_000,
    direction: 'out',
    amount_minor: 123_45,
    currency: 'INR',
    home_amount_minor: 123_45,
    fx_rate: 1,
    fx_inr_per_aed: 23.45,
    account_id: 'acct-hdfc',
    merchant_id: 'm-swiggy',
    category_id: 'cat-food',
    raw_text: 'SWIGGY',
    source: 'manual',
    txn_type: 'spend',
    transfer_group_id: null,
    reversal_of_id: null,
    trip_id: null,
    status: 'confirmed',
    note: null,
    deleted: false,
    ...over,
  }) as FixtureTransaction

describe('csvCell', () => {
  /**
   * The failure this guards is silent: a merchant with a comma shifts every later column, the
   * file still opens, and the numbers are wrong in a way nothing flags.
   */
  it('quotes a value containing a comma', () => {
    expect(csvCell('CARREFOUR, DUBAI MALL')).toBe('"CARREFOUR, DUBAI MALL"')
  })

  it('doubles an embedded quote, per RFC 4180', () => {
    expect(csvCell('the "good" cafe')).toBe('"the ""good"" cafe"')
  })

  it('quotes a value containing a newline', () => {
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"')
  })

  /** `null` must not become the four characters n-u-l-l, which would re-import as text. */
  it('writes null and undefined as empty', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('leaves an ordinary value alone', () => {
    expect(csvCell('SWIGGY')).toBe('SWIGGY')
    expect(csvCell(12345)).toBe('12345')
  })
})

describe('toCsv', () => {
  it('writes a header and one line per row', () => {
    const csv = toCsv([row(), row({ id: 'txn-2' })])
    const lines = csv.trimEnd().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('id,occurred_at,occurred_at_iso')
  })

  it('keeps amounts as integer minor units rather than dividing', () => {
    expect(toCsv([row({ amount_minor: 123_45 })])).toContain('12345')
  })

  it('renders the ISO instant alongside the epoch', () => {
    expect(toCsv([row()])).toContain(new Date(1_755_300_000_000).toISOString())
  })

  it('survives a merchant name that would otherwise break the columns', () => {
    const csv = toCsv([row({ raw_text: 'CARREFOUR, DUBAI' })])
    const dataLine = csv.trimEnd().split('\r\n')[1]!
    // One extra comma inside quotes must not add a field.
    expect(dataLine.split('","').length).toBeGreaterThan(0)
    expect(dataLine).toContain('"CARREFOUR, DUBAI"')
  })

  it('ends with a newline, so POSIX tools do not call it truncated', () => {
    expect(toCsv([row()]).endsWith('\r\n')).toBe(true)
  })

  it('writes a header even with no rows', () => {
    expect(toCsv([]).trimEnd()).toBe(
      'id,occurred_at,occurred_at_iso,direction,amount_minor,currency,home_amount_minor,fx_rate,fx_inr_per_aed,account_id,merchant_id,category_id,raw_text,source,txn_type,transfer_group_id,reversal_of_id,trip_id,status,note',
    )
  })
})

describe('toBundle', () => {
  it('carries the rows unmodified', () => {
    const rows = [row(), row({ id: 'txn-2' })]
    const b = toBundle(rows, 1_755_300_000_000)
    expect(b.transactions).toEqual(rows)
    expect(b.counts.transactions).toBe(2)
  })

  it('states the minor-unit convention, because a reader cannot infer it', () => {
    expect(toBundle([], 0).notes.join(' ')).toMatch(/minor units/i)
  })

  it('warns that the rates are frozen, not live', () => {
    expect(toBundle([], 0).notes.join(' ')).toMatch(/frozen/i)
  })

  it('is versioned, so a future importer can tell what it is holding', () => {
    expect(toBundle([], 0).format).toBe('raseed.export.v1')
  })
})

describe('filename', () => {
  it('is dated and typed', () => {
    expect(filename('csv', Date.UTC(2026, 7, 17))).toBe('raseed-export-2026-08-17.csv')
    expect(filename('json', Date.UTC(2026, 7, 17))).toBe('raseed-export-2026-08-17.json')
  })

  it('zero-pads, so files sort chronologically', () => {
    expect(filename('csv', Date.UTC(2026, 0, 5))).toBe('raseed-export-2026-01-05.csv')
  })
})
