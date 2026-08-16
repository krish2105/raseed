import { describe, expect, it } from 'vitest'
import { detectTrips, tripExcess, type TripDay } from './detectTrips'

/** `d(1)` is 2026-03-01. Keeps the fixtures readable. */
const d = (n: number) => `2026-03-${String(n).padStart(2, '0')}`

const home = (day: number, minor: number): TripDay => ({
  day: d(day),
  awayMinor: 0,
  homeMinor: minor,
  awayInHomeMinor: 0,
})

const away = (day: number, awayMinor: number, rate = 24.86, homeMinor = 0): TripDay => ({
  day: d(day),
  awayMinor,
  homeMinor,
  awayInHomeMinor: Math.round(awayMinor * rate),
})

describe('detectTrips', () => {
  it('finds nothing in a ledger with no foreign spend', () => {
    expect(detectTrips([home(1, 50_000), home(2, 30_000)])).toEqual([])
  })

  it('groups a run of foreign days into one trip', () => {
    const trip = detectTrips([
      home(1, 50_000),
      away(4, 20_000),
      away(5, 35_000),
      away(6, 15_000),
      home(9, 40_000),
    ])[0]

    expect(trip).toBeDefined()
    expect(trip!.startDay).toBe(d(4))
    expect(trip!.endDay).toBe(d(6))
    expect(trip!.days).toBe(3)
    expect(trip!.awayMinor).toBe(70_000)
  })

  /**
   * The discriminator. One AED purchase on an ordinary day is a purchase, and without this
   * every cross-border online order becomes a one-day "trip".
   */
  it('does not call a single foreign purchase a trip', () => {
    expect(
      detectTrips([home(1, 50_000), away(2, 12_000, 24.86, 60_000), home(3, 45_000)]),
    ).toEqual([])
  })

  it('does not call a run a trip when home spending never stopped', () => {
    // Two days of AED spend, but the bulk of the money still moved at home.
    const days = [away(2, 4_000, 24.86, 200_000), away(3, 4_000, 24.86, 200_000)]
    expect(detectTrips(days)).toEqual([])
  })

  it('tolerates a quiet day inside a trip without splitting it', () => {
    // Nothing swiped on the 5th — that is a lazy day, not a flight home.
    const trips = detectTrips([away(4, 20_000), away(6, 20_000), away(7, 20_000)])
    expect(trips).toHaveLength(1)
    expect(trips[0]!.days).toBe(4)
  })

  it('splits two trips separated by a real gap', () => {
    const trips = detectTrips([
      away(2, 20_000),
      away(3, 20_000),
      away(20, 30_000),
      away(21, 30_000),
    ])
    expect(trips).toHaveLength(2)
    expect(trips[0]!.startDay).toBe(d(2))
    expect(trips[1]!.startDay).toBe(d(20))
  })

  /** Rent does not stop because you are away, and pretending it did would flatter the trip. */
  it('counts home spend that continued during the window', () => {
    const trip = detectTrips([
      away(4, 40_000),
      { day: d(5), awayMinor: 0, homeMinor: 22_000, awayInHomeMinor: 0 },
      away(6, 40_000),
    ])[0]

    expect(trip!.homeMinor).toBe(22_000)
    expect(trip!.totalInHomeMinor).toBe(trip!.awayInHomeMinor + 22_000)
  })

  it('converts at the rate frozen on the rows, never a live one', () => {
    // Two days at deliberately different rates — the trip total must honour both.
    const trip = detectTrips([away(4, 10_000, 24.0), away(5, 10_000, 26.0)])[0]
    expect(trip!.awayInHomeMinor).toBe(240_000 + 260_000)
  })

  it('reports the away share of the window', () => {
    const trip = detectTrips([away(4, 10_000, 10, 20_000), away(5, 10_000, 10, 20_000)])[0]
    // 200,000 away-in-home against 40,000 home = 5/6.
    expect(trip!.awayShare).toBeCloseTo(200_000 / 240_000, 6)
  })
})

describe('tripExcess', () => {
  it('charges the trip only for what it cost above an ordinary day', () => {
    const trip = detectTrips([away(4, 40_000), away(5, 40_000), away(6, 40_000)])[0]!
    // ~₹29,832 over 3 days against a ₹2,000/day baseline.
    expect(tripExcess(trip, 200_000)).toBe(trip.totalInHomeMinor - 600_000)
  })

  it('never reports a negative excess for a trip cheaper than staying home', () => {
    const trip = detectTrips([away(4, 1_000), away(5, 1_000)])[0]!
    expect(tripExcess(trip, 10_000_000)).toBe(0)
  })
})
