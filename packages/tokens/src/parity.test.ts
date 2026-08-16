import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { colorTokens, palette, type ColorToken, type Palette } from './index'

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')

/** Pull the declarations out of the block whose selector line contains `selector`. */
function block(selector: string): Record<string, string> {
  const index = css.indexOf(selector)
  if (index === -1) throw new Error(`tokens.css has no block for ${selector}`)
  const open = css.indexOf('{', index)
  const close = css.indexOf('}', open)
  const body = css.slice(open + 1, close)

  // Split on `;` rather than on newlines: a shadow is legitimately a multi-line value, and
  // a line-based parser silently skips it — which reads as "the token is missing" and sends
  // you looking in the wrong file.
  const declarations: Record<string, string> = {}
  for (const chunk of body.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const match = /^\s*--([a-z0-9-]+)\s*:\s*([\s\S]+)$/i.exec(chunk)
    if (match?.[1] && match[2]) declarations[match[1]] = match[2].replace(/\s+/g, ' ').trim()
  }
  return declarations
}

/**
 * Design tokens that are CSS-only by nature — shadows and glass are compositions of
 * `color-mix()` over the palette, not palette entries. They have no place in `Palette`,
 * but they still must exist in every theme block, which the next test enforces.
 */
const CSS_ONLY = [
  'shadow-1',
  'shadow-2',
  'shadow-3',
  'glass-bg',
  'glass-line',
  'glass-blur',
  'glass-sheen',
] as const

function expectMatchesPalette(declarations: Record<string, string>, expected: Palette) {
  // Same colour key set — catches a colour added to one file and not the other. CSS-only
  // design tokens are excluded here and checked separately rather than being waved through.
  const colours = Object.keys(declarations).filter(
    (k) => !(CSS_ONLY as readonly string[]).includes(k),
  )
  expect(colours.sort()).toEqual([...colorTokens].sort())

  for (const token of colorTokens) {
    expect(
      declarations[token]?.toUpperCase(),
      `--${token} disagrees between tokens.css and tokens.ts`,
    ).toBe(expected[token].toUpperCase())
  }
}

describe('tokens.css / tokens.ts parity', () => {
  it(':root carries the complete light palette', () => {
    expectMatchesPalette(block(':root {'), palette.light)
  })

  it('the explicit dark block carries the complete dark palette', () => {
    expectMatchesPalette(block(":root[data-theme='dark']"), palette.dark)
  })

  it('the explicit light block carries the complete light palette', () => {
    expectMatchesPalette(block(":root[data-theme='light']"), palette.light)
  })

  it('the system-preference block carries the complete dark palette', () => {
    expectMatchesPalette(block(":root:not([data-theme='light'])"), palette.dark)
  })

  /**
   * The same rule the palette lives by, applied to depth and glass: a token defined only
   * in the dark block leaves the light theme with no shadow at all, and the failure is
   * invisible to anyone developing in dark mode.
   */
  it('every CSS-only design token is defined in all four theme blocks', () => {
    const blocks = {
      ':root': block(':root {'),
      'data-theme=dark': block(":root[data-theme='dark']"),
      'data-theme=light': block(":root[data-theme='light']"),
      'prefers dark': block(":root:not([data-theme='light'])"),
    }
    for (const [name, declarations] of Object.entries(blocks)) {
      for (const token of CSS_ONLY) {
        expect(declarations[token], `--${token} is missing from ${name}`).toBeDefined()
      }
    }
  })

  it('every token is defined outside a media query', () => {
    // A token defined only inside @media would vanish for a viewer who forces light
    // on a dark OS. :root must be complete on its own.
    const root = block(':root {')
    for (const token of colorTokens) {
      expect(root[token], `--${token} has no unconditional definition`).toBeDefined()
    }
  })
})

describe('contrast', () => {
  // WCAG relative luminance.
  function luminance(hex: string): number {
    const channels = (hex.replace('#', '').match(/../g) ?? []).map((pair) => {
      const value = parseInt(pair, 16) / 255
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0)
  }

  function ratio(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
  }

  const themes: ThemeCase[] = [
    { name: 'light', p: palette.light },
    { name: 'dark', p: palette.dark },
  ]
  interface ThemeCase {
    name: string
    p: Palette
  }

  // Body text must clear 4.5:1 in BOTH themes. Light is where it fails, so it is
  // checked identically rather than assumed to follow from dark.
  const bodyPairs: ColorToken[][] = [
    ['text-hi', 'surface-0'],
    ['text-hi', 'surface-1'],
    ['text-hi', 'surface-2'],
    ['text-lo', 'surface-0'],
    ['text-lo', 'surface-1'],
    ['text-lo', 'surface-2'],
  ]

  for (const { name, p } of themes) {
    for (const pair of bodyPairs) {
      const [fg, bg] = pair as [ColorToken, ColorToken]
      it(`${name}: ${fg} on ${bg} clears 4.5:1`, () => {
        expect(ratio(p[fg], p[bg])).toBeGreaterThanOrEqual(4.5)
      })
    }

    // Accents carry amounts, which are large text — but they also label rows at body
    // size, so hold them to the body bar too. This is what caught light-mode brass.
    for (const accent of ['inr', 'aed', 'good', 'warn', 'horizon'] as ColorToken[]) {
      it(`${name}: ${accent} on surface-1 clears 4.5:1`, () => {
        expect(ratio(p[accent], p['surface-1'])).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})
