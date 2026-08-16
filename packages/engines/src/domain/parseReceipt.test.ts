import { describe, expect, it } from 'vitest'
import { linesFromBlocks, parseReceipt, splitByItems } from './parseReceipt'

/** A UAE restaurant bill: VAT plus a mandatory service charge. */
const DUBAI = `RAVI RESTAURANT
Al Satwa, Dubai
TRN: 100234567800003
Date: 03/04/2026

2 x Butter Chicken      90.00
1 x Garlic Naan          12.00
3 x Karak Chai           15.00
Sub-Total               117.00
Service Charge           11.70
VAT 5%                    6.44
TOTAL                   135.14
Cash                    150.00
Change                   14.86`

/** An Indian bill: CGST and SGST as separate lines that must sum. */
const BENGALURU = `Truffles
Date: 15-Apr-2026
1 x Ole Burger          395.00
2 x Cold Coffee         340.00
Sub Total               735.00
CGST 2.5%                18.38
SGST 2.5%                18.38
Grand Total             771.76`

describe('parseReceipt', () => {
  it('reads a UAE bill with VAT and a service charge', () => {
    const r = parseReceipt(DUBAI)

    expect(r.currency).toBe('AED')
    expect(r.merchant).toBe('RAVI RESTAURANT')
    expect(r.subtotal!.minor).toBe(11_700)
    expect(r.serviceCharge!.minor).toBe(1_170)
    expect(r.tax!.minor).toBe(644)
    expect(r.total!.minor).toBe(13_514)
  })

  /** The single most useful signal: does the bill add up to itself? */
  it('reconciles a bill whose arithmetic is sound', () => {
    const r = parseReceipt(DUBAI)
    expect(r.reconciles).toBe(true)
    expect(r.discrepancy).toBeNull()
    expect(r.confidence).toBeGreaterThan(0.9)
  })

  it('sums several tax lines rather than letting the last one win', () => {
    const r = parseReceipt(BENGALURU)
    expect(r.currency).toBe('INR')
    expect(r.tax!.minor).toBe(1_838 + 1_838)
    expect(r.reconciles).toBe(true)
  })

  /** "Sub-Total" contains "Total". Order of testing is load-bearing. */
  it('does not mistake the subtotal for the total', () => {
    const r = parseReceipt(DUBAI)
    expect(r.total!.minor).not.toBe(r.subtotal!.minor)
  })

  /** A "Change" line is money coming back, and must never become the bill. */
  it('ignores cash tendered and change', () => {
    expect(parseReceipt(DUBAI).total!.minor).toBe(13_514)
  })

  it('reads quantities and line descriptions', () => {
    const r = parseReceipt(DUBAI)
    const chicken = r.lines.find((l) => /Butter Chicken/i.test(l.description))
    expect(chicken).toBeDefined()
    expect(chicken!.quantity).toBe(2)
    expect(chicken!.amount.minor).toBe(9_000)
  })

  it('reads the date', () => {
    expect(new Date(parseReceipt(DUBAI).occurredAt!).getUTCDate()).toBe(3)
    expect(new Date(parseReceipt(BENGALURU).occurredAt!).getUTCMonth()).toBe(3)
  })

  /**
   * The case that matters most: a misread digit. The parser must say so rather than quietly
   * enter a wrong total that is never questioned again.
   */
  it('refuses to reconcile when a figure was misread, and says by how much', () => {
    const r = parseReceipt(DUBAI.replace('TOTAL                   135.14', 'TOTAL                   185.14'))
    expect(r.reconciles).toBe(false)
    expect(r.discrepancy!.minor).toBe(5_000)
    expect(r.warnings.join(' ')).toMatch(/misread/i)
    expect(r.confidence).toBeLessThan(0.8)
  })

  it('warns rather than throws when the photo missed the total', () => {
    const r = parseReceipt('SOME CAFE\n1 x Coffee   45.00')
    expect(r.total).toBeNull()
    expect(r.warnings.join(' ')).toMatch(/no total/i)
    expect(r.confidence).toBeLessThan(0.6)
  })

  it('falls back to summing the items when there is no subtotal line', () => {
    const r = parseReceipt('CAFE\n1 x Coffee  45.00\n1 x Cake  55.00\nTotal  100.00')
    expect(r.reconciles).toBe(true)
    expect(r.warnings.join(' ')).toMatch(/summed/i)
  })

  it('skips a tax id when picking the merchant', () => {
    expect(parseReceipt(DUBAI).merchant).not.toMatch(/TRN/)
  })

  it('is safe on empty input', () => {
    const r = parseReceipt('')
    expect(r.total).toBeNull()
    expect(r.lines).toEqual([])
    expect(r.confidence).toBeLessThan(0.5)
  })
})

describe('splitByItems', () => {
  const receipt = parseReceipt(DUBAI)

  it('charges each person only for what they had', () => {
    const chicken = receipt.lines.findIndex((l) => /Butter Chicken/i.test(l.description))
    const naan = receipt.lines.findIndex((l) => /Naan/i.test(l.description))
    const chai = receipt.lines.findIndex((l) => /Chai/i.test(l.description))

    const split = splitByItems(receipt, {
      [chicken]: ['a', 'b'],
      [naan]: ['a'],
      [chai]: ['a', 'b', 'c'],
    })

    const owes = (id: string) => split.find((s) => s.personId === id)!.owes.minor
    expect(owes('a')).toBeGreaterThan(owes('c'))
  })

  /** The whole bill must still be accounted for, extras included. */
  it('distributes tax and service so the split equals the total', () => {
    const all = Object.fromEntries(receipt.lines.map((_, i) => [i, ['a', 'b']]))
    const split = splitByItems(receipt, all)
    const summed = split.reduce((acc, s) => acc + s.owes.minor, 0)
    expect(summed).toBe(receipt.total!.minor)
  })

  it('never loses a paisa on an item that does not divide evenly', () => {
    const chai = receipt.lines.findIndex((l) => /Chai/i.test(l.description))
    const split = splitByItems(
      { ...receipt, tax: null, serviceCharge: null, tip: null },
      { [chai]: ['a', 'b', 'c'] },
    )
    expect(split.reduce((a, s) => a + s.owes.minor, 0)).toBe(1_500)
  })

  it('returns nothing when nobody has been assigned anything', () => {
    expect(splitByItems(receipt, {})).toEqual([])
  })
})

/**
 * What Apple Vision ACTUALLY returned for the Dubai fixture, copied off the device.
 *
 * Column-major: every label, then every amount. The first version of this test was written
 * from imagination — interleaved label/amount pairs — and passed, while the real photograph
 * produced a AED 2.00 butter chicken. An invented fixture tests the imagination.
 */
const VISION_BLOCKS = [
  'RAVI RESTAURANT',
  'Al Satwa, Dubai',
  'TRN: 100234567800003',
  'Date: 03/04/2026',
  '2 x Butter Chicken',
  '1 x Garlic Naan',
  '3 x Karak Chai',
  'Sub-Total',
  'Service Charge',
  'VAT 5%',
  'TOTAL',
  'Cash',
  'Change',
  '90.00',
  '12.00',
  '15.00',
  '117.00',
  '11.70',
  '6.44',
  '135.14',
  '150.00',
  '14.86',
]

describe('linesFromBlocks', () => {
  it('rejoins an interleaved label and amount', () => {
    expect(linesFromBlocks(['Sub-Total', '117.00'])).toEqual(['Sub-Total 117.00'])
  })

  /** The shape Vision actually produces. */
  it('zips a column-major layout back into rows', () => {
    const lines = linesFromBlocks(VISION_BLOCKS)
    expect(lines).toContain('2 x Butter Chicken 90.00')
    expect(lines).toContain('TOTAL 135.14')
    expect(lines).toContain('VAT 5% 6.44')
    // Header blocks have no price and must not be given one.
    expect(lines).toContain('RAVI RESTAURANT')
  })

  it('leaves blocks alone when neither shape fits, rather than inventing prices', () => {
    const odd = ['A', 'B', 'C']
    expect(linesFromBlocks(odd)).toEqual(odd)
  })

  it('leaves a block that already carries its own amount alone', () => {
    expect(linesFromBlocks(['Coffee 45.00', 'Tea 20.00'])).toEqual(['Coffee 45.00', 'Tea 20.00'])
  })

  it('does not swallow a following label as if it were an amount', () => {
    expect(linesFromBlocks(['RAVI RESTAURANT', 'Al Satwa, Dubai'])).toEqual([
      'RAVI RESTAURANT',
      'Al Satwa, Dubai',
    ])
  })

  it('drops empty blocks rather than emitting blank lines', () => {
    expect(linesFromBlocks(['A 1.00', '', '  ', 'B 2.00'])).toEqual(['A 1.00', 'B 2.00'])
  })

  /** The whole point: the real Vision output must parse to the real bill. */
  it('turns real Vision output into a bill that reconciles', () => {
    const r = parseReceipt(linesFromBlocks(VISION_BLOCKS).join('\n'))

    expect(r.merchant).toBe('RAVI RESTAURANT')
    expect(r.currency).toBe('AED')
    expect(r.subtotal!.minor).toBe(11_700)
    expect(r.serviceCharge!.minor).toBe(1_170)
    expect(r.total!.minor).toBe(13_514)
    expect(r.reconciles).toBe(true)

    const chicken = r.lines.find((l) => /Butter Chicken/i.test(l.description))!
    expect(chicken.amount.minor).toBe(9_000) // not 200, which is the quantity
    expect(chicken.quantity).toBe(2)
  })
})

describe('percentages are rates, not amounts', () => {
  /** "VAT 5%" is not a five-dirham tax, and the first real receipt read it as one. */
  it('reads the tax from the amount beside the rate, not from the rate', () => {
    const r = parseReceipt(linesFromBlocks(VISION_BLOCKS).join('\n'))
    expect(r.tax!.minor).toBe(644)
  })

  it('ignores a bare rate with no amount at all', () => {
    const r = parseReceipt('CAFE\nService 10%\nTotal 100.00')
    expect(r.serviceCharge).toBeNull()
  })
})
