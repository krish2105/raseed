/**
 * @raseed/tokens — the only place in the repo where a hex literal is allowed.
 *
 * `tokens.ts` is the truth. `tokens.css` is the same values as CSS custom properties for
 * the web, and `parity.test.ts` fails the moment the two disagree. Change brass here and
 * both products change.
 *
 * Thesis: currency is a temperature. INR is warm brass, AED is cool verdigris, and every
 * number, arc and chart segment carries its currency's temperature so you never have to
 * check which country's money you are reading.
 */

export type ThemeName = 'light' | 'dark'

export type ColorToken =
  | 'surface-0'
  | 'surface-1'
  | 'surface-2'
  | 'line'
  | 'text-hi'
  | 'text-lo'
  | 'inr'
  | 'aed'
  | 'good'
  | 'warn'
  | 'horizon'

export type Palette = Readonly<Record<ColorToken, string>>

/**
 * Light is a designed cool-paper theme, not an inversion. Deliberately not cream — a warm
 * cream with a serif display is one of the looks AI-generated design clusters around, and
 * on a finance dashboard it reads as a tell.
 */
const light: Palette = {
  'surface-0': '#F2F4F6',
  'surface-1': '#FFFFFF',
  'surface-2': '#E7EBEF',
  line: '#D3DAE1',
  'text-hi': '#12181F',
  'text-lo': '#5A6773',
  inr: '#A36821',
  aed: '#2E7F76',
  good: '#3E8536',
  warn: '#B23A34',
  horizon: '#5566A8',
}

const dark: Palette = {
  'surface-0': '#0F1419',
  'surface-1': '#171D24',
  'surface-2': '#212932',
  line: '#2C353F',
  'text-hi': '#E8EDF2',
  'text-lo': '#8B98A5',
  inr: '#E0A458',
  aed: '#4FB0A5',
  good: '#7BC96F',
  warn: '#DB5C56',
  horizon: '#7C8CC4',
}

export const palette: Readonly<Record<ThemeName, Palette>> = { light, dark }

export const colorTokens: readonly ColorToken[] = Object.keys(light) as ColorToken[]

/** The currency accent, by the thesis. Used by both apps and every chart. */
export function currencyColor(currency: 'INR' | 'AED', theme: ThemeName): string {
  return palette[theme][currency === 'INR' ? 'inr' : 'aed']
}

// ── type ────────────────────────────────────────────────────────────────────

export const fontFamily = {
  /** Bricolage Grotesque — variable, width axis animates on the dial and the hero. */
  display: 'Bricolage Grotesque',
  /** Geist Sans — everything else. */
  body: 'Geist',
  /** Geist Mono — every numeral, everywhere, tabular. */
  mono: 'Geist Mono',
} as const

/** Tabular numerals are load-bearing: a ledger whose decimals do not line up reads as amateur. */
export const numericFeatures = 'tabular-nums' as const

export const fontSize = {
  xs: 12,
  sm: 13,
  base: 15,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 34,
  '4xl': 44,
  '5xl': 56,
} as const

// ── space, shape, motion ────────────────────────────────────────────────────

export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const

export const duration = {
  /** Micro-feedback. Anything longer feels laggy on a tap. */
  fast: 120,
  base: 240,
  /** The one orchestrated moment: the dial fill, the Sankey draw. */
  slow: 600,
  hero: 900,
} as const

/** Easing.out(cubic) — the dial fill curve, expressed as a cubic-bezier. */
export const easing = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const

export function cubicBezier(curve: readonly [number, number, number, number]): string {
  return `cubic-bezier(${curve.join(', ')})`
}
