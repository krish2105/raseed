import { describe, expect, it } from 'vitest'
import {
  abs,
  add,
  allocate,
  compare,
  convert,
  equals,
  format,
  formatMinor,
  fromMajor,
  isCurrency,
  isNegative,
  isZero,
  money,
  mul,
  negate,
  sub,
  sum,
  zero,
} from './index'

describe('construction', () => {
  it('rejects a non-integer minor amount', () => {
    expect(() => money(33.33, 'INR')).toThrow(/integer/)
  })

  it('rejects an unsafe integer', () => {
    expect(() => money(Number.MAX_SAFE_INTEGER + 2, 'INR')).toThrow(/safe integer/)
  })

  it('narrows currency strings', () => {
    expect(isCurrency('INR')).toBe(true)
    expect(isCurrency('USD')).toBe(false)
  })
})

describe('fromMajor', () => {
  it('parses whole and fractional major units', () => {
    expect(fromMajor('1234.56', 'INR').minor).toBe(123456)
    expect(fromMajor('20', 'AED').minor).toBe(2000)
    expect(fromMajor('0.05', 'INR').minor).toBe(5)
  })

  it('pads a short fraction rather than misreading it', () => {
    expect(fromMajor('1.5', 'INR').minor).toBe(150)
  })

  it('strips grouping separators', () => {
    expect(fromMajor('1,23,456.78', 'INR').minor).toBe(12345678)
  })

  it('handles negatives and bare decimals', () => {
    expect(fromMajor('-20', 'AED').minor).toBe(-2000)
    expect(fromMajor('.5', 'INR').minor).toBe(50)
  })

  it('refuses more precision than the currency has', () => {
    expect(() => fromMajor('1.234', 'INR')).toThrow(/decimal places/)
  })

  it('refuses junk', () => {
    expect(() => fromMajor('abc', 'INR')).toThrow(/cannot parse/)
    expect(() => fromMajor('', 'INR')).toThrow(/cannot parse/)
  })

  // The reason this function takes a string at all.
  it('is immune to the float bug that motivates the package', () => {
    expect(fromMajor('0.30', 'INR').minor).toBe(30)
    expect(add(fromMajor('0.10', 'INR'), fromMajor('0.20', 'INR')).minor).toBe(30)
  })
})

describe('arithmetic', () => {
  it('adds and subtracts', () => {
    expect(add(money(100, 'INR'), money(250, 'INR')).minor).toBe(350)
    expect(sub(money(100, 'INR'), money(250, 'INR')).minor).toBe(-150)
  })

  it('refuses to mix currencies', () => {
    expect(() => add(money(100, 'INR'), money(100, 'AED'))).toThrow(/cannot combine/)
    expect(() => sub(money(100, 'AED'), money(100, 'INR'))).toThrow(/cannot combine/)
  })

  it('sums an empty list to zero', () => {
    expect(sum([], 'AED')).toEqual(zero('AED'))
  })

  it('sums a list', () => {
    expect(sum([money(100, 'INR'), money(33, 'INR'), money(1, 'INR')], 'INR').minor).toBe(134)
  })

  it('multiplies, rounding half away from zero symmetrically', () => {
    expect(mul(money(100, 'INR'), 0.5).minor).toBe(50)
    expect(mul(money(101, 'INR'), 0.5).minor).toBe(51)
    expect(mul(money(-101, 'INR'), 0.5).minor).toBe(-51)
  })

  it('rejects a non-finite factor', () => {
    expect(() => mul(money(100, 'INR'), Number.NaN)).toThrow(/finite/)
  })

  it('negates and absolutes', () => {
    expect(negate(money(100, 'INR')).minor).toBe(-100)
    expect(abs(money(-100, 'INR')).minor).toBe(100)
  })
})

describe('comparison', () => {
  it('orders amounts', () => {
    expect(compare(money(1, 'INR'), money(2, 'INR'))).toBe(-1)
    expect(compare(money(2, 'INR'), money(1, 'INR'))).toBe(1)
    expect(compare(money(2, 'INR'), money(2, 'INR'))).toBe(0)
  })

  it('will not compare across currencies', () => {
    expect(() => compare(money(1, 'INR'), money(1, 'AED'))).toThrow(/cannot combine/)
  })

  it('equality is currency-aware', () => {
    expect(equals(money(1, 'INR'), money(1, 'INR'))).toBe(true)
    expect(equals(money(1, 'INR'), money(1, 'AED'))).toBe(false)
  })

  it('reports zero and negative', () => {
    expect(isZero(zero('INR'))).toBe(true)
    expect(isNegative(money(-1, 'INR'))).toBe(true)
    expect(isNegative(zero('INR'))).toBe(false)
  })
})

describe('allocate', () => {
  // The done-when criterion from docs/PROGRESS.md, stated literally.
  it('splits 100 three ways as 34/33/33', () => {
    expect(allocate(money(100, 'INR'), 3).map((m) => m.minor)).toEqual([34, 33, 33])
  })

  it('splits a real rupee amount without losing a paisa', () => {
    const parts = allocate(fromMajor('100.00', 'INR'), 3)
    expect(parts.map((m) => m.minor)).toEqual([3334, 3333, 3333])
    expect(sum(parts, 'INR').minor).toBe(10000)
  })

  it('never loses a minor unit, for any amount or part count', () => {
    for (let amount = 0; amount <= 200; amount += 1) {
      for (let parts = 1; parts <= 7; parts += 1) {
        const split = allocate(money(amount, 'INR'), parts)
        expect(split).toHaveLength(parts)
        expect(sum(split, 'INR').minor).toBe(amount)
      }
    }
  })

  it('allocates by ratio', () => {
    expect(allocate(money(100, 'AED'), [2, 1]).map((m) => m.minor)).toEqual([67, 33])
    expect(allocate(money(500, 'AED'), [1, 1, 1, 1]).map((m) => m.minor)).toEqual([
      125, 125, 125, 125,
    ])
  })

  it('mirrors the split for negative amounts', () => {
    expect(allocate(money(-100, 'INR'), 3).map((m) => m.minor)).toEqual([-34, -33, -33])
    expect(sum(allocate(money(-100, 'INR'), 3), 'INR').minor).toBe(-100)
  })

  it('gives a zero-ratio participant nothing', () => {
    expect(allocate(money(100, 'INR'), [1, 0, 1]).map((m) => m.minor)).toEqual([50, 0, 50])
  })

  // 101 across [0,1,1] leaves a remainder of 1, and the first slot is the zero-ratio
  // one — so this fails if the distribution loop does not skip it.
  it('skips a zero-ratio participant when handing out the remainder', () => {
    const split = allocate(money(101, 'INR'), [0, 1, 1])
    expect(split.map((m) => m.minor)).toEqual([0, 51, 50])
    expect(sum(split, 'INR').minor).toBe(101)
  })

  it('rejects degenerate splits', () => {
    expect(() => allocate(money(100, 'INR'), 0)).toThrow(/zero parts/)
    expect(() => allocate(money(100, 'INR'), [])).toThrow(/zero parts/)
    expect(() => allocate(money(100, 'INR'), [0, 0])).toThrow(/more than zero/)
    expect(() => allocate(money(100, 'INR'), [-1, 2])).toThrow(/non-negative/)
  })
})

describe('convert', () => {
  it('applies the supplied rate', () => {
    // 100.00 AED at 23.45 INR/AED
    expect(convert(fromMajor('100.00', 'AED'), 23.45, 'INR').minor).toBe(234500)
  })

  it('is a no-op when the currency already matches', () => {
    const m = money(123, 'INR')
    expect(convert(m, 99, 'INR')).toBe(m)
  })

  it('rejects a non-positive or non-finite rate', () => {
    expect(() => convert(money(1, 'AED'), 0, 'INR')).toThrow(/positive/)
    expect(() => convert(money(1, 'AED'), -1, 'INR')).toThrow(/positive/)
    expect(() => convert(money(1, 'AED'), Number.POSITIVE_INFINITY, 'INR')).toThrow(/finite/)
  })
})

describe('format', () => {
  it('groups INR in the Indian system', () => {
    expect(format(fromMajor('1234567.89', 'INR'))).toBe('₹12,34,567.89')
  })

  it('groups AED in the western system', () => {
    expect(format(fromMajor('1234567.89', 'AED'))).toBe('AED 1,234,567.89')
  })

  // The Arabic dirham sign is right-to-left: bidi reordering renders it after the
  // number and re-forms the glyphs, which is what it did on the iOS simulator.
  it('emits no right-to-left characters, so bidi cannot reorder an amount', () => {
    const rtl = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/
    expect(rtl.test(format(fromMajor('101.09', 'AED')))).toBe(false)
    expect(rtl.test(formatMinor(fromMajor('101.09', 'AED')))).toBe(false)
  })

  it('places the sign outside the symbol', () => {
    expect(format(fromMajor('-740.00', 'INR'))).toBe('-₹740.00')
  })

  it('can drop the symbol', () => {
    expect(format(money(74000, 'INR'), { symbol: false })).toBe('740.00')
  })

  it('can compact a zero fraction for headline figures', () => {
    expect(format(money(74000, 'INR'), { compactZeroFraction: true })).toBe('₹740')
    expect(format(money(74050, 'INR'), { compactZeroFraction: true })).toBe('₹740.50')
  })

  it('formatMinor is code-prefixed and symbol-free', () => {
    expect(formatMinor(money(74000, 'INR'))).toBe('INR 740.00')
    expect(formatMinor(money(9250, 'AED'))).toBe('AED 92.50')
  })
})
