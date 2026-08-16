import { rankNudges, regretRate, type NudgeCandidate } from '@raseed/engines'
import { money, type Money } from '@raseed/money'
import { NOW, anomalies, byCategory, dailySeries, headline, recurring } from './analytics'
import { query } from './ingest'
import { Q, lensCurrency, type Lens } from './queries'
import { ratings } from '@/lib/store/preferences'

/**
 * The daily loop: the streak, the rating queue, the Reckoning, and the nudge budget.
 *
 * This is the retention layer — the thing that makes it a habit rather than a dashboard you
 * open twice. Everything here is derived from tested engines; nothing is invented to fill a
 * card.
 */

const DAY = 86_400_000

// ── streak ──────────────────────────────────────────────────────────────────

export interface Streak {
  /** Consecutive days, ending today, with at least one logged transaction. */
  current: number
  longest: number
  /** True when today has nothing logged yet — the streak is alive but unconfirmed. */
  pendingToday: boolean
  daysLogged: number
}

/**
 * A logging streak, not a spending streak.
 *
 * Rewarding low spend would make skipping lunch look like virtue. Rewarding *recording*
 * rewards the habit the app actually needs, and it is the honest thing to celebrate.
 */
export async function streak(lens: Lens): Promise<Streak> {
  const series = await dailySeries(120, lens)
  const logged = new Set(series.filter((p) => p.count > 0).map((p) => p.day))

  const today = new Date(NOW)
  const key = (d: Date) => d.toISOString().slice(0, 10)

  const pendingToday = !logged.has(key(today))

  let current = 0
  const cursor = new Date(NOW)
  if (pendingToday) cursor.setUTCDate(cursor.getUTCDate() - 1)
  while (logged.has(key(cursor))) {
    current += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  // Longest run anywhere in the window.
  let longest = 0
  let run = 0
  const sorted = [...series].sort((a, b) => a.day.localeCompare(b.day))
  for (const point of sorted) {
    if (point.count > 0) {
      run += 1
      longest = Math.max(longest, run)
    } else {
      run = 0
    }
  }

  return { current, longest, pendingToday, daysLogged: logged.size }
}

// ── worth-it rating queue ───────────────────────────────────────────────────

export interface RatingCandidate {
  id: string
  merchant: string
  category: string
  amount: Money
  occurredAt: number
}

/**
 * What to ask about.
 *
 * Only transactions above the 60th percentile of the window, unrated, and recent. Asking
 * about a ₹20 chai wastes the one interaction people will actually give you.
 */
export async function ratingQueue(lens: Lens, limit = 5): Promise<RatingCandidate[]> {
  const rated = ratings()
  const rows = await query<{
    id: string
    occurred_at: number
    lens_minor: number
    merchant: string
    category: string
  }>(Q.ledgerPage(400, 0, lens))

  const amounts = rows.map((r) => r.lens_minor).sort((a, b) => a - b)
  const p60 = amounts[Math.floor(amounts.length * 0.6)] ?? 0

  return rows
    .filter((r) => !(r.id in rated))
    .filter((r) => r.lens_minor >= p60)
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      merchant: r.merchant,
      category: r.category,
      amount: money(Math.round(r.lens_minor), lensCurrency(lens)),
      occurredAt: r.occurred_at,
    }))
}

export interface RegretByCategory {
  categoryId: string
  name: string
  regretRate: number
  regretted: Money
  coverage: number
}

/** Regret rate per category, from your own ratings. Empty until you rate something. */
export async function regret(lens: Lens): Promise<RegretByCategory[]> {
  const rated = ratings()
  if (Object.keys(rated).length === 0) return []

  const rows = await query<{
    id: string
    lens_minor: number
    category: string
  }>(Q.ledgerPage(400, 0, lens))

  const scored = rows.map((r) => ({
    id: r.id,
    categoryId: r.category,
    homeAmountMinor: r.lens_minor,
    score: (rated[r.id] ?? null) as -1 | 0 | 1 | null,
  }))

  return regretRate(scored).map((c) => ({
    categoryId: c.categoryId,
    name: c.categoryId,
    regretRate: c.regretRate,
    regretted: money(c.regrettedMinor, lensCurrency(lens)),
    coverage: c.coverage,
  }))
}

// ── nudges ──────────────────────────────────────────────────────────────────

export interface Nudge {
  id: string
  kind: string
  title: string
  body: string
  score: number
}

/**
 * Candidate nudges, scored and capped at four a week.
 *
 * Notification fatigue is the named reason these apps get uninstalled, so attention is
 * treated as a budget: everything over the cap expires silently rather than queueing.
 */
export async function nudges(lens: Lens, sentThisWeek: number): Promise<Nudge[]> {
  const [head, subs, outliers, cats] = await Promise.all([
    headline(lens),
    recurring(),
    anomalies(90, lens),
    byCategory(30, lens),
  ])

  const currency = lensCurrency(lens)
  const candidates: (NudgeCandidate & { title: string; body: string })[] = []

  if (head.spendDelta > 0.1) {
    candidates.push({
      id: 'spend-up',
      kind: 'budget',
      impactHomeMinor: head.spend30.minor - head.spendPrior30.minor,
      urgency: 0.7,
      novelty: 0.8,
      createdAt: NOW,
      title: `Spending is up ${(head.spendDelta * 100).toFixed(0)}%`,
      body: `You are ${(head.spendDelta * 100).toFixed(0)}% above the prior 30 days. The Categories tab splits that into price versus volume.`,
    })
  }

  for (const outlier of outliers.slice(0, 1)) {
    candidates.push({
      id: `anomaly-${outlier.day}`,
      kind: 'anomaly',
      impactHomeMinor: outlier.total.minor,
      urgency: 0.5,
      novelty: 0.9,
      createdAt: NOW,
      title: `${outlier.day} was unusual`,
      body: `A robust z-score of ${outlier.z.toFixed(1)}. Worth a look if you do not remember what it was.`,
    })
  }

  for (const sub of subs.slice(0, 2)) {
    candidates.push({
      id: `sub-${sub.merchantId}`,
      kind: 'recurring',
      impactHomeMinor: 0,
      urgency: 0.3,
      novelty: 0.6,
      createdAt: NOW,
      title: `${sub.name} looks recurring`,
      body: `Seen ${sub.observations} times, every ${sub.meanPeriodDays.toFixed(0)} days. Annualised, that is worth checking you still use it.`,
    })
  }

  const biggest = cats[0]
  if (biggest && biggest.share > 0.35) {
    candidates.push({
      id: `concentration-${biggest.categoryId}`,
      kind: 'concentration',
      impactHomeMinor: biggest.total.minor,
      urgency: 0.4,
      novelty: 0.5,
      createdAt: NOW,
      title: `${biggest.name} is ${(biggest.share * 100).toFixed(0)}% of the month`,
      body: `${biggest.total.currency} — one category carrying a third of your spend is worth a deliberate decision rather than a default.`,
    })
  }

  const { ship } = rankNudges(candidates, { sentThisWeek, weeklyCap: 4 })

  return ship.map((n) => {
    const source = candidates.find((c) => c.id === n.id)!
    return {
      id: n.id,
      kind: n.kind,
      title: source.title,
      body: source.body,
      score: n.score,
    }
  })
}

export { money as _money, type Money }
export const nudgeCurrency = lensCurrency
export const DAY_MS = DAY
