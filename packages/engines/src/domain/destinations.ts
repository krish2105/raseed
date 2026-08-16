import type { DestinationIndex } from './planTrip'

/**
 * Published price levels, so a trip estimate rests on data rather than on a guess that
 * happens to have decimals in it.
 *
 * Source: Numbeo country indices, 2026 mid-year, New York City = 100.
 *   - `restaurant` is the Restaurant Price Index — a direct measure of eating out.
 *   - `overall` is the Cost of Living Index — a consumer basket excluding rent.
 *
 * Two deliberate omissions:
 *
 * **Rent is not used.** Numbeo publishes a Rent Index and it is tempting for the stay line,
 * but it measures residential rent, and residential ratios are far wilder than hotel ratios.
 * India sits at 3.8 and Singapore at 68.3 — an 18× multiplier that no hotel booking has ever
 * reflected. `overall` gives ~5×, which is roughly what an equivalent-tier room actually
 * costs. A number being published does not make it the right number.
 *
 * **These are countries, not cities.** Mumbai is not Bhopal and Dubai is not Fujairah. The
 * planner says "about", the UI must not imply otherwise, and the estimate is only ever a
 * starting point that the user's own history dominates.
 */
export interface PriceLevel {
  readonly name: string
  readonly restaurant: number
  readonly overall: number
}

export const PRICE_LEVELS: readonly PriceLevel[] = [
  { name: 'India', restaurant: 14.3, overall: 18.1 },
  { name: 'Nepal', restaurant: 16.5, overall: 21.9 },
  { name: 'Sri Lanka', restaurant: 21.4, overall: 31.3 },
  { name: 'Vietnam', restaurant: 15.7, overall: 26.9 },
  { name: 'Indonesia', restaurant: 13.3, overall: 24.7 },
  { name: 'Thailand', restaurant: 23.5, overall: 36.8 },
  { name: 'Malaysia', restaurant: 23.2, overall: 34.0 },
  { name: 'Georgia', restaurant: 37.5, overall: 34.9 },
  { name: 'Armenia', restaurant: 40.5, overall: 40.9 },
  { name: 'Turkey', restaurant: 39.2, overall: 40.2 },
  { name: 'Japan', restaurant: 30.8, overall: 47.6 },
  { name: 'UAE', restaurant: 57.9, overall: 55.6 },
  { name: 'Singapore', restaurant: 54.4, overall: 90.8 },
  { name: 'United Kingdom', restaurant: 72.4, overall: 68.2 },
  { name: 'United States', restaurant: 71.7, overall: 69.7 },
  { name: 'Switzerland', restaurant: 108.1, overall: 109.8 },
]

/**
 * Turn two published price levels into the multipliers `planTrip` wants.
 *
 * The multiplier is a **ratio against where you live**, not an absolute index, because the
 * habits it scales are your own. If your typical meal already costs what it costs in Dubai,
 * a trip to Dubai does not multiply anything — and this returns 1, which is correct.
 */
export function destinationIndex(destination: PriceLevel, home: PriceLevel): DestinationIndex {
  return {
    name: destination.name,
    mealMultiplier: destination.restaurant / home.restaurant,
    stayMultiplier: destination.overall / home.overall,
    transportMultiplier: destination.overall / home.overall,
  }
}

export function priceLevel(name: string): PriceLevel | undefined {
  return PRICE_LEVELS.find((p) => p.name === name)
}
