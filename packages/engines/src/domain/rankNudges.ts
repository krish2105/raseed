/**
 * Nudge budget — attention is a budget, and notification fatigue is *the* named reason
 * these apps get uninstalled.
 *
 * Hard cap of 4 per week. Every candidate is scored and only the top `4 − sent_this_week`
 * ship; everything else expires silently rather than queueing up for next week.
 */

export interface NudgeCandidate {
  readonly id: string
  readonly kind: string
  /** Signed impact in home-currency minor units. Magnitude is what matters. */
  readonly impactHomeMinor: number
  /** 0–1. How time-sensitive this is: a bill due tomorrow is 1, a trend is 0.2. */
  readonly urgency: number
  /** 0–1. How new the information is; a repeat of last week's nudge is near 0. */
  readonly novelty: number
  readonly createdAt: number
}

export interface ScoredNudge extends NudgeCandidate {
  readonly score: number
}

export interface RankOptions {
  /** Hard weekly cap. Default 4. */
  readonly weeklyCap?: number
  /** How many have already gone out this week. */
  readonly sentThisWeek?: number
  /** 0–1 fatigue from the last 7 days of notifications. */
  readonly fatigue7d?: number
  /** Impact at which the impact term saturates, in minor units. Default ₹5,000. */
  readonly impactSaturationMinor?: number
}

export interface RankResult {
  readonly ship: ScoredNudge[]
  /** Scored but over the cap. These expire; they are not carried forward. */
  readonly suppressed: ScoredNudge[]
  readonly slots: number
}

/**
 * score = |impact| × urgency × novelty × (1 − fatigue)
 *
 * Impact is normalised through a saturating curve so one enormous number cannot
 * monopolise the week's slots.
 */
export function scoreNudge(candidate: NudgeCandidate, options: RankOptions = {}): number {
  const { fatigue7d = 0, impactSaturationMinor = 500_000 } = options
  const impact = Math.min(1, Math.abs(candidate.impactHomeMinor) / impactSaturationMinor)
  const urgency = clamp01(candidate.urgency)
  const novelty = clamp01(candidate.novelty)
  const fatigue = clamp01(fatigue7d)
  return round4(impact * urgency * novelty * (1 - fatigue))
}

export function rankNudges(
  candidates: readonly NudgeCandidate[],
  options: RankOptions = {},
): RankResult {
  const { weeklyCap = 4, sentThisWeek = 0 } = options
  const slots = Math.max(0, weeklyCap - sentThisWeek)

  const scored: ScoredNudge[] = candidates
    .map((c) => ({ ...c, score: scoreNudge(c, options) }))
    // Ties break on the newer candidate, so a stale nudge never outranks a fresh one.
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)

  // A zero score means at least one factor was zero — it carries no information, so it
  // never ships even when slots are free.
  const shippable = scored.filter((n) => n.score > 0)

  return {
    ship: shippable.slice(0, slots),
    suppressed: [...shippable.slice(slots), ...scored.filter((n) => n.score <= 0)],
    slots,
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
