import { describe, expect, it } from 'vitest'

import { checkTone } from '@raseed/engines'

import {
  DAY,
  WEEKLY_CAP,
  buildNudges,
  percentile,
  ratingQueue,
  regretByCategory,
  type NudgeInput,
  type RatableRow,
  type Score,
} from '@/lib/reckoning'

/**
 * The worth-it loop, the Reckoning and the nudge budget — the decisions, without a simulator.
 *
 * P6's done-when is two claims: "regret rate computes" and "≤4 notifications in a simulated
 * week". The first is arithmetic and the engines already own it. The second is not a property
 * of `rankNudges` alone — it only holds if the *caller* feeds last week's history back in, and
 * that wiring is what lives in `lib/reckoning.ts` and is what this file exercises.
 */

const NOW = 1_755_300_000_000

function row(over: Partial<RatableRow> & { id: string }): RatableRow {
  return {
    merchant: 'Swiggy',
    categoryId: 'cat-food',
    categoryName: 'Food & drink',
    amountMinor: 50_000,
    currency: 'INR',
    homeAmountMinor: 50_000,
    occurredAt: NOW - DAY,
    ...over,
  }
}

/** Ten rows, ₹100 to ₹1,000, all inside the window and none rated. */
function ladder(): RatableRow[] {
  return Array.from({ length: 10 }, (_, i) =>
    row({
      id: `t${i}`,
      homeAmountMinor: (i + 1) * 10_000,
      occurredAt: NOW - (i + 1) * 3_600_000,
    }),
  )
}

describe('percentile', () => {
  it('is the value below which that share of the sample sits', () => {
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1)
    expect(percentile([1, 2, 3, 4, 5], 0.6)).toBe(4)
    expect(percentile([1, 2, 3, 4, 5], 1)).toBe(5)
  })

  it('is zero for an empty sample, so nothing is filtered out by a phantom threshold', () => {
    expect(percentile([], 0.6)).toBe(0)
  })

  it('does not mutate the caller-s array', () => {
    const values = [5, 1, 3]
    percentile(values, 0.6)
    expect(values).toEqual([5, 1, 3])
  })
})

describe('the rating queue', () => {
  const none = new Map<string, Score>()

  it('only asks about the top of the distribution', () => {
    const queue = ratingQueue(ladder(), none, NOW)
    // p60 of ₹100…₹1,000 is ₹700. Everything asked about is at or above it.
    expect(queue.every((r) => r.homeAmountMinor >= 70_000)).toBe(true)
    expect(queue.map((r) => r.id)).not.toContain('t0')
  })

  it('asks about at most five at a time', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      row({ id: `t${i}`, homeAmountMinor: 100_000, occurredAt: NOW - i * 60_000 }),
    )
    expect(ratingQueue(many, none, NOW)).toHaveLength(5)
  })

  it('asks about the most recent first', () => {
    const queue = ratingQueue(ladder(), none, NOW)
    const times = queue.map((r) => r.occurredAt)
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })

  it('never asks twice about the same transaction', () => {
    const rows = ladder()
    const rated = new Map<string, Score>(rows.slice(5).map((r) => [r.id, 1 as Score]))
    const queue = ratingQueue(rows, rated, NOW)
    expect(queue.map((r) => r.id)).not.toEqual(expect.arrayContaining([...rated.keys()]))
  })

  /**
   * A "neither" is a rating. It is what stops the queue re-asking, and it is why the third
   * button writes 0 rather than nothing — see the note in `reckoning.ts`.
   */
  it('treats a neutral rating as answered', () => {
    const rows = ladder()
    const rated = new Map<string, Score>([['t9', 0]])
    expect(ratingQueue(rows, rated, NOW).map((r) => r.id)).not.toContain('t9')
  })

  it('stops asking after seven days', () => {
    const rows = [
      row({ id: 'fresh', homeAmountMinor: 500_000, occurredAt: NOW - 6 * DAY }),
      row({ id: 'stale', homeAmountMinor: 500_000, occurredAt: NOW - 8 * DAY }),
    ]
    const ids = ratingQueue(rows, none, NOW).map((r) => r.id)
    expect(ids).toContain('fresh')
    expect(ids).not.toContain('stale')
  })

  /**
   * The OR branch, and the reason the queue is not just "the big ones". Once a category has
   * cost you money you said you did not want, a ₹150 order in it is worth a question that the
   * same ₹150 in groceries is not.
   */
  it('asks about a small transaction in a category you have already regretted', () => {
    const rows = [
      // The regret history: two rated rows in cat-food, one of them not worth it.
      row({ id: 'r1', categoryId: 'cat-food', homeAmountMinor: 400_000 }),
      row({ id: 'r2', categoryId: 'cat-food', homeAmountMinor: 100_000 }),
      // Bulk, so p60 sits well above the small order below.
      ...Array.from({ length: 8 }, (_, i) =>
        row({ id: `b${i}`, categoryId: 'cat-transport', homeAmountMinor: 300_000 }),
      ),
      row({ id: 'small', categoryId: 'cat-food', homeAmountMinor: 15_000 }),
      row({ id: 'small-elsewhere', categoryId: 'cat-transport', homeAmountMinor: 15_000 }),
    ]
    const rated = new Map<string, Score>([
      ['r1', -1],
      ['r2', 1],
    ])

    const ids = ratingQueue(rows, rated, NOW, 20).map((r) => r.id)
    expect(ids).toContain('small')
    // The same amount in a category with no regret history is left alone. That contrast is
    // the whole point — otherwise this is just "ask about everything".
    expect(ids).not.toContain('small-elsewhere')
  })

  it('says nothing when there is nothing to ask about', () => {
    expect(ratingQueue([], none, NOW)).toEqual([])
  })
})

describe('regret by category', () => {
  it('weights by amount, not by count', () => {
    const rows = [
      // Ten regretted ₹40 chais.
      ...Array.from({ length: 10 }, (_, i) =>
        row({ id: `chai${i}`, categoryId: 'cat-chai', homeAmountMinor: 4_000 }),
      ),
      // One regretted ₹8,000 dinner.
      row({ id: 'dinner', categoryId: 'cat-dining', homeAmountMinor: 800_000 }),
      row({ id: 'dinner-ok', categoryId: 'cat-dining', homeAmountMinor: 200_000 }),
    ]
    const scores = new Map<string, Score>([
      ...rows.slice(0, 10).map((r) => [r.id, -1 as Score] as const),
      ['dinner', -1 as Score],
      ['dinner-ok', 1 as Score],
    ])

    const lines = regretByCategory(rows, scores)
    const dining = lines.find((l) => l.categoryId === 'cat-dining')!
    const chai = lines.find((l) => l.categoryId === 'cat-chai')!

    expect(dining.regrettedMinor).toBe(800_000)
    expect(chai.regrettedMinor).toBe(40_000)
    expect(dining.regretRate).toBe(0.8)
    expect(chai.regretRate).toBe(1)
  })

  it('reports coverage, so a thinly rated category is visibly less certain', () => {
    const rows = [
      row({ id: 'a', categoryId: 'cat-food', homeAmountMinor: 100_000 }),
      row({ id: 'b', categoryId: 'cat-food', homeAmountMinor: 100_000 }),
      row({ id: 'c', categoryId: 'cat-food', homeAmountMinor: 200_000 }),
    ]
    const line = regretByCategory(rows, new Map<string, Score>([['a', -1]]))[0]!
    expect(line.coverage).toBe(0.25)
  })

  it('is empty until you have rated something', () => {
    expect(regretByCategory(ladder(), new Map())).toEqual([])
  })

  it('carries the category name through, so the screen never renders an id', () => {
    const rows = [row({ id: 'a', categoryId: 'cat-food', categoryName: 'Food & drink' })]
    const line = regretByCategory(rows, new Map<string, Score>([['a', -1]]))[0]!
    expect(line.name).toBe('Food & drink')
  })
})

// ── the nudge budget ────────────────────────────────────────────────────────

const RICH: NudgeInput = {
  regret: [
    {
      categoryId: 'cat-food',
      name: 'Food & drink',
      regretRate: 0.62,
      regrettedMinor: 420_000,
      ratedMinor: 680_000,
      coverage: 0.7,
    },
    {
      categoryId: 'cat-transport',
      name: 'Transport',
      regretRate: 0.4,
      regrettedMinor: 180_000,
      ratedMinor: 450_000,
      coverage: 0.5,
    },
  ],
  subscriptions: [
    { key: 'm-netflix', name: 'Netflix', amountMinor: 64_900, currency: 'INR', periodDays: 30 },
    { key: 'm-spotify', name: 'Spotify', amountMinor: 11_900, currency: 'INR', periodDays: 30 },
    { key: 'm-icloud', name: 'iCloud', amountMinor: 7_500, currency: 'INR', periodDays: 30 },
  ],
  corridor: { costMinor: 240_000, transfers: 3 },
  runway: { roomMinor: 62_000, daysToIncome: 9 },
}

const EMPTY: NudgeInput = {
  regret: [],
  subscriptions: [],
  corridor: { costMinor: 0, transfers: 0 },
  runway: null,
}

const noHistory = { sentLast7: 0, ignoredLast7: 0, lastSentByKind: new Map<string, number>() }
const daytime = { now: NOW, hour: 10 }

describe('the nudge budget', () => {
  it('says nothing when there is nothing to say', () => {
    expect(buildNudges(EMPTY, noHistory, daytime).ship).toEqual([])
  })

  it('never ships more than the cap in one go', () => {
    expect(buildNudges(RICH, noHistory, daytime).ship.length).toBeLessThanOrEqual(WEEKLY_CAP)
  })

  it('ranks by score, highest first', () => {
    const { ship } = buildNudges(RICH, noHistory, daytime)
    const scores = ship.map((n) => n.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })

  it('shows nothing once the week is spent', () => {
    const spent = {
      sentLast7: WEEKLY_CAP,
      ignoredLast7: WEEKLY_CAP,
      lastSentByKind: new Map<string, number>(),
    }
    expect(buildNudges(RICH, spent, daytime).ship).toEqual([])
  })

  /**
   * The cap is enforced twice, by two independent mechanisms: `rankNudges` has no slots left,
   * *and* fatigue has reached 1 so every score is zero. Either alone would do it. Both means a
   * later change to one of them cannot quietly reopen the tap.
   */
  it('reaches zero slots and full fatigue at the same point', () => {
    const spent = {
      sentLast7: WEEKLY_CAP,
      ignoredLast7: WEEKLY_CAP,
      lastSentByKind: new Map<string, number>(),
    }
    const { suppressed } = buildNudges(RICH, spent, daytime)
    expect(suppressed.length).toBeGreaterThan(0)
    expect(suppressed.every((n) => n.score === 0)).toBe(true)
  })

  /**
   * The slot count is the hard cap and it counts everything. Acting on a nudge relieves
   * *fatigue*, so the app does not get quieter at someone who is engaging with it — but it
   * does not buy a fifth slot. Those are separate mechanisms on purpose.
   */
  it('does not hand back a slot for a nudge you acted on', () => {
    const allActedOn = {
      sentLast7: WEEKLY_CAP,
      ignoredLast7: 0,
      lastSentByKind: new Map<string, number>(),
    }
    expect(buildNudges(RICH, allActedOn, daytime).ship).toEqual([])
  })

  /**
   * `sentLast7: 0` on purpose — this isolates the cooldown. With slots free and fatigue at
   * zero, the *only* thing that can hold a repeat back is its novelty reaching zero. Ranking
   * it lower would not be enough: four free slots and six candidates still ships it.
   */
  it('does not repeat itself the next day, even with the whole week free', () => {
    const first = buildNudges(RICH, noHistory, daytime)
    const seen = new Map(first.ship.map((n) => [n.kind, NOW]))

    const second = buildNudges(
      RICH,
      { sentLast7: 0, ignoredLast7: 0, lastSentByKind: seen },
      { now: NOW + DAY, hour: 10 },
    )

    expect(second.ship.filter((n) => seen.has(n.kind))).toEqual([])
    // It did not go silent either — the ones never shown are now free to take those slots.
    expect(second.ship.length).toBeGreaterThan(0)
  })

  it('lets a nudge become new again after a month of silence', () => {
    const history = {
      sentLast7: 0,
      ignoredLast7: 0,
      lastSentByKind: new Map([['corridor', NOW - 40 * DAY]]),
    }
    const { ship } = buildNudges(
      { ...EMPTY, corridor: RICH.corridor },
      history,
      { now: NOW, hour: 10 },
    )
    expect(ship.map((n) => n.kind)).toContain('corridor')
  })

  /**
   * **P6's done-when.** Not a property of `rankNudges` — that function is stateless and will
   * happily ship four every time it is called. The cap only holds because the caller counts
   * what already went out and hands it back, and this simulates exactly that for four weeks.
   */
  it('shows at most four in any seven-day window, over four simulated weeks', () => {
    const sent: { kind: string; at: number }[] = []

    for (let day = 0; day < 28; day += 1) {
      const now = NOW + day * DAY
      const recent = sent.filter((s) => s.at > now - 7 * DAY)
      const { ship } = buildNudges(
        RICH,
        {
          sentLast7: recent.length,
          // Nothing is acted on in this simulation — the worst case for fatigue, and the
          // one the cap has to hold under.
          ignoredLast7: recent.length,
          lastSentByKind: new Map(sent.map((s) => [s.kind, s.at])),
        },
        { now, hour: 10 },
      )
      for (const n of ship) sent.push({ kind: n.kind, at: now })
    }

    // Every window, not just the aligned ones — a calendar week would let four land on Sunday
    // and four more on Monday, which is eight in two days and satisfies "four a week".
    for (let day = 0; day < 28; day += 1) {
      const end = NOW + day * DAY
      const window = sent.filter((s) => s.at > end - 7 * DAY && s.at <= end)
      expect(window.length, `window ending on day ${day}`).toBeLessThanOrEqual(WEEKLY_CAP)
    }

    // And it did not simply go silent — the test would pass trivially if nothing ever shipped.
    expect(sent.length).toBeGreaterThan(0)
  })

  it('suppresses rather than queues — nothing is banked for next week', () => {
    const { ship, suppressed } = buildNudges(RICH, noHistory, daytime)
    const overlap = ship.filter((s) => suppressed.some((x) => x.kind === s.kind))
    expect(overlap).toEqual([])
  })
})

describe('the words the nudges use', () => {
  /**
   * Every sentence this module can emit, checked against the tone engine directly. The gate
   * already runs inside `buildNudges` and drops what it blocks — which means a template that
   * breaks a rule would show up here as *silence*, not as a failure. So this asserts on the
   * candidates rather than on the survivors.
   */
  it('passes the tone gate for every candidate it can produce', () => {
    const { ship, suppressed, blocked } = buildNudges(RICH, noHistory, daytime)
    expect(blocked).toEqual([])

    for (const n of [...ship, ...suppressed]) {
      const verdict = checkTone(n.body, { hour: 10 }, { solicited: true })
      expect(verdict.broke, `${n.kind}: ${n.body}`).toEqual([])
    }
  })

  it('names a real figure in every nudge', () => {
    const { ship, suppressed } = buildNudges(RICH, noHistory, daytime)
    for (const n of [...ship, ...suppressed]) {
      expect(n.body, n.kind).toMatch(/[₹$]|AED\s/)
    }
  })

  /**
   * The Reckoning is a screen you navigated to, so quiet hours must not blank it. Someone
   * opening this at 1am asked for it; withholding the answer is a bug that looks like
   * restraint.
   */
  it('still speaks at 1am, because you opened the screen', () => {
    const { ship } = buildNudges(RICH, noHistory, { now: NOW, hour: 1 })
    expect(ship.length).toBeGreaterThan(0)
  })

  /**
   * Found on the simulator, not in a test. With Safe-to-Spend negative the runway nudge read
   * "9 days until money comes in, with -₹1,993.25 of room left" — which is not a nudge, it is
   * a rub, and it arrives exactly when supportive mode says the app should be getting quieter.
   * A runway nudge is a statement about how much room remains; with none remaining there is
   * nothing for it to say that the home screen has not already said more kindly.
   */
  it('says nothing about runway when there is no room left', () => {
    const overdrawn: NudgeInput = {
      ...EMPTY,
      runway: { roomMinor: -199_325, daysToIncome: 9 },
    }
    const { ship, suppressed } = buildNudges(overdrawn, noHistory, daytime)
    expect([...ship, ...suppressed].map((n) => n.kind)).not.toContain('runway')
  })

  it('still speaks about runway when there is room', () => {
    const fine: NudgeInput = { ...EMPTY, runway: { roomMinor: 62_000, daysToIncome: 9 } }
    expect(buildNudges(fine, noHistory, daytime).ship.map((n) => n.kind)).toContain('runway')
  })

  it('goes quiet about optimising while the user is in supportive mode', () => {
    const { ship } = buildNudges(RICH, noHistory, {
      now: NOW,
      hour: 10,
      supportiveMode: true,
    })
    expect(ship.every((n) => !/\b(?:save more|cut|reduce|optimi[sz]e|target)\b/i.test(n.body))).toBe(
      true,
    )
  })
})
