import { describe, expect, it } from 'vitest'
import { palette as PALETTES, contrastRatio, meetsAA, readableInk, relativeLuminance } from './index'

describe('contrast', () => {
  it('anchors on the known extremes', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5)
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5)
  })

  it('is symmetric — order of the pair cannot change the answer', () => {
    expect(contrastRatio('#A36821', '#FFFFFF')).toBeCloseTo(
      contrastRatio('#FFFFFF', '#A36821'),
      10,
    )
  })

  /**
   * The regression that matters.
   *
   * Every accent must clear AA against every surface **in both themes**. Light is the half
   * that fails: a bright token on near-black clears 4.5 almost by accident, so a palette
   * checked only in dark ships a light theme nobody can read. This caught `inr`, `aed` and
   * `good` at 3.8–4.0 in light, and `warn` and `horizon` at 3.98 and 4.49 in dark.
   */
  it('every accent clears AA on every surface, in both themes', () => {
    const failures: string[] = []
    for (const [themeName, palette] of Object.entries(PALETTES)) {
      const surfaces = ['surface-0', 'surface-1', 'surface-2'] as const
      const inks = ['text-hi', 'text-lo', 'inr', 'aed', 'good', 'warn', 'horizon'] as const
      for (const ink of inks) {
        for (const surface of surfaces) {
          const r = contrastRatio(palette[ink], palette[surface])
          if (r < 4.5) failures.push(`${themeName}: ${ink} on ${surface} is ${r.toFixed(2)}`)
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('picks ink by luminance, not by theme', () => {
    // Read from the palette rather than pasted literals: this assertion broke on the dark
    // redesign purely because it had #E8EDF2 typed into it, which tested the old hex rather
    // than the behaviour. The behaviour is "bright fill gets dark ink, whichever theme".
    const DARK_INK = PALETTES.light['text-hi']
    const LIGHT_INK = PALETTES.dark['text-hi']

    expect(readableInk(PALETTES.dark.inr, 'dark')).toBe(DARK_INK)
    expect(readableInk(PALETTES.dark.good, 'dark')).toBe(DARK_INK)
    // A deep fill needs light ink.
    expect(readableInk(PALETTES.light.aed, 'light')).toBe(LIGHT_INK)
  })

  it('always returns the better of the two inks', () => {
    const DARK_INK = PALETTES.light['text-hi']
    const LIGHT_INK = PALETTES.dark['text-hi']
    for (const fill of ['#000000', '#FFFFFF', PALETTES.dark.inr, PALETTES.light.aed, '#808080']) {
      const ink = readableInk(fill)
      const other = ink === DARK_INK ? LIGHT_INK : DARK_INK
      expect(contrastRatio(fill, ink)).toBeGreaterThanOrEqual(contrastRatio(fill, other))
    }
  })

  it('holds large text to 3:1 and body text to 4.5:1', () => {
    // 3.36:1 on white — clears the 3:1 large-text bar, fails the 4.5:1 body bar.
    // (#767676 is 4.54 and passes both; it is the classic AA boundary grey.)
    const fg = '#8C8C8C'
    expect(meetsAA(fg, '#FFFFFF', true)).toBe(true)
    expect(meetsAA(fg, '#FFFFFF', false)).toBe(false)
  })
})
