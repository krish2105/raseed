import { describe, expect, it } from 'vitest'
import { formatMinor } from './index'

describe('formatMinor', () => {
  it('formats INR minor units', () => {
    expect(formatMinor(74000, 'INR')).toBe('INR 740.00')
  })

  it('pads the fractional part', () => {
    expect(formatMinor(2005, 'AED')).toBe('AED 20.05')
  })

  it('handles negatives', () => {
    expect(formatMinor(-150, 'INR')).toBe('INR -1.50')
  })

  it('handles zero', () => {
    expect(formatMinor(0, 'AED')).toBe('AED 0.00')
  })
})
