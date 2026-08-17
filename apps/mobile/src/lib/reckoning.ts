import {
  gate,
  rankNudges,
  regretRate,
  topRegretCategories,
  type NudgeCandidate,
  type ToneVerdict,
} from '@raseed/engines'
import { format, money, type Currency } from '@raseed/money'

/**
 * The worth-it loop, the Reckoning and the nudge budget — every decision, none of the I/O.
 *
 * `regretRate` and `rankNudges` were written, tested and then imported by **nothing on the
 * phone**. The device that owns the ledger could not tell you whether the money you spent was
 * money you wanted to spend, which is the one question a spend tracker exists to answer and
 * the only one a bank statement cannot.
 *
 * What is here is the wiring the engines deliberately do not contain: which transactions are
 * worth asking about, what a rating means, and — the part that actually carries P6's
 * done-when — how many nudges may be shown. `rankNudges` is stateless; hand it four slots
 * every call and it will ship four every call. The cap is a property of the caller.
 */

export const DAY = 86_400_000

/** Hard ceiling on nudges shown in any rolling seven days. */
export const WEEKLY_CAP = 4

/** How recent a spend must be to be worth asking about. Older than this and you won't recall. */
const ASK_WINDOW = 7 * DAY

/** The window the p60 threshold is computed over. */
const DISTRIBUTION_WINDOW = 30 * DAY

/** Below this many days since a nudge last appeared, repeating it carries no information. */
const NUDGE_COOLDOWN_DAYS = 14

/** By this many days it is news again. */
const NUDGE_FRESH_DAYS = 30

/**
 * −1 not worth it · 0 neither · 1 worth it.
 *
 * **There is no stored "skipped".** The third button on a card is *Neither*, and it writes 0 —
 * a real answer that counts in the denominator, because "I looked and had no strong feeling"
 * is information. Deferring is a separate gesture that writes nothing at all and leaves the
 * row unrated, so it comes back. The distinction matters: if a skip wrote 0 the regret rate
 * would fall every time someone was in a hurry, and if it wrote nothing the same card would be
 * offered for ever.
 */
export type Score = -1 | 0 | 1

export interface RatableRow {
  readonly id: string
  readonly merchant: string
  readonly categoryId: string
  readonly categoryName: string
  /**
   * What you actually paid, in the currency you paid it in. **This is what a card shows.**
   * A rating card asks you to remember a purchase, and a Careem ride you know as AED 85 does
   * not become more recognisable rendered as ₹1,993.25.
   */
  readonly amountMinor: number
  readonly currency: Currency
  /** Home-currency minor units. The arithmetic reads this, so categories compare across both. */
  readonly homeAmountMinor: number
  readonly occurredAt: number
}

/** The p-th value of a sample. Empty gives 0, so an empty ledger filters nothing out. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!
}

/**
 * What to ask about.
 *
 * Above the 60th percentile of the last 30 days, **or** in a category you have already told us
 * you regret. Both halves matter. The first alone reduces to "ask about the big ones", which
 * misses the ₹150 order that is the fourth one this week; the second alone cannot start,
 * because there is no regret history until something has been rated.
 *
 * Five at a time, most recent first. The single interaction anyone will actually give you is
 * worth spending on something they can still remember.
 */
export function ratingQueue(
  rows: readonly RatableRow[],
  scores: ReadonlyMap<string, Score>,
  now: number,
  limit = 5,
): RatableRow[] {
  const recent = rows.filter((r) => now - r.occurredAt <= DISTRIBUTION_WINDOW)
  const threshold = percentile(recent.map((r) => r.homeAmountMinor), 0.6)

  const hot = new Set(
    topRegretCategories(rows.map((r) => toRated(r, scores)), 3).map((c) => c.categoryId),
  )

  return rows
    .filter((r) => !scores.has(r.id))
    .filter((r) => now - r.occurredAt <= ASK_WINDOW)
    .filter((r) => r.homeAmountMinor >= threshold || hot.has(r.categoryId))
    .sort((a, b) => b.occurredAt - a.occurredAt)
    .slice(0, limit)
}

function toRated(row: RatableRow, scores: ReadonlyMap<string, Score>) {
  return {
    id: row.id,
    categoryId: row.categoryId,
    homeAmountMinor: row.homeAmountMinor,
    score: scores.get(row.id) ?? null,
  }
}

export interface RegretLine {
  readonly categoryId: string
  readonly name: string
  readonly regretRate: number
  readonly regrettedMinor: number
  readonly ratedMinor: number
  /** Share of the category's spend that has been rated. Low coverage means low trust. */
  readonly coverage: number
}

/**
 * Regret per category, from your own answers and nothing else.
 *
 * Categories you have never rated are dropped rather than shown at 0% — a 0 you never earned
 * reads as "no regret here", which is a claim this has no evidence for.
 */
export function regretByCategory(
  rows: readonly RatableRow[],
  scores: ReadonlyMap<string, Score>,
): RegretLine[] {
  const names = new Map(rows.map((r) => [r.categoryId, r.categoryName]))

  return regretRate(rows.map((r) => toRated(r, scores)))
    .filter((c) => c.ratedCount > 0)
    .map((c) => ({
      categoryId: c.categoryId,
      name: names.get(c.categoryId) ?? c.categoryId,
      regretRate: c.regretRate,
      regrettedMinor: c.regrettedMinor,
      ratedMinor: c.ratedMinor,
      coverage: c.coverage,
    }))
}

// ── the nudge budget ────────────────────────────────────────────────────────

export interface Subscription {
  readonly key: string
  readonly name: string
  readonly amountMinor: number
  readonly currency: Currency
  readonly periodDays: number
}

export interface NudgeInput {
  /** Already ordered — most regretted money first. */
  readonly regret: readonly RegretLine[]
  readonly subscriptions: readonly Subscription[]
  readonly corridor: { readonly costMinor: number; readonly transfers: number }
  readonly runway: { readonly roomMinor: number; readonly daysToIncome: number } | null
}

export interface NudgeHistory {
  /** Shown in the last seven days. This is the hard slot count — every one of them counts. */
  readonly sentLast7: number
  /**
   * Of those, the ones you did not act on. This is the fatigue term, and it is why `acted` is
   * written at all: four nudges you opened are not the same burden as four you scrolled past,
   * and treating them identically is how an app that is being *used* gets quieter.
   */
  readonly ignoredLast7: number
  /** kind → when it last appeared. Drives novelty. */
  readonly lastSentByKind: ReadonlyMap<string, number>
}

export interface MobileNudge extends NudgeCandidate {
  /** A short factual label. Not gated: it states a name and a figure and offers nothing. */
  readonly title: string
  /** The sentence. Gated before it can be returned. */
  readonly body: string
  readonly score: number
}

/**
 * How new this is.
 *
 * Zero inside the cooldown, which is what actually stops a repeat: `rankNudges` never ships a
 * zero score even when slots are free. Ranking a repeat *lower* would not be enough — with
 * four slots and five candidates, "lower" still ships.
 */
export function novelty(kind: string, history: NudgeHistory, now: number): number {
  const last = history.lastSentByKind.get(kind)
  if (last === undefined) return 1
  const days = (now - last) / DAY
  if (days < NUDGE_COOLDOWN_DAYS) return 0
  if (days >= NUDGE_FRESH_DAYS) return 1
  return (days - NUDGE_COOLDOWN_DAYS) / (NUDGE_FRESH_DAYS - NUDGE_COOLDOWN_DAYS)
}

type Draft = Omit<MobileNudge, 'score' | 'novelty'> & { readonly urgency: number }

/**
 * Every sentence the phone can say, built from figures it already computed.
 *
 * `kind` is the identity, not a family: `regret:cat-food` and `regret:cat-transport` are two
 * different things to be told, and collapsing them to `regret` would make one silence the
 * other for a fortnight.
 */
function drafts(input: NudgeInput, now: number): Draft[] {
  const out: Draft[] = []
  const inr = (minor: number) => format(money(Math.round(minor), 'INR'))

  // Regret — the loop's own output, and the only nudge here that is about a judgement you
  // made rather than a pattern we found.
  for (const line of input.regret.slice(0, 2)) {
    out.push({
      id: `regret:${line.categoryId}`,
      kind: `regret:${line.categoryId}`,
      title: line.name,
      body: `You marked ${inr(line.regrettedMinor)} of the ${inr(line.ratedMinor)} you've rated in ${line.name} as not worth it. Want to see which ones?`,
      impactHomeMinor: line.regrettedMinor,
      urgency: 0.4,
      createdAt: now,
    })
  }

  // Subscriptions — annualised, because ₹649 a month is a number nobody reacts to and
  // ₹7,788 a year is the same fact.
  for (const sub of input.subscriptions.slice(0, 2)) {
    const annualMinor = Math.round((sub.amountMinor * 365) / Math.max(1, sub.periodDays))
    out.push({
      id: `subscription:${sub.key}`,
      kind: `subscription:${sub.key}`,
      title: `${sub.name} looks recurring`,
      body: `${sub.name} bills you ${format(money(sub.amountMinor, sub.currency))} every ${Math.round(sub.periodDays)} days — about ${format(money(annualMinor, sub.currency))} a year. Want the detail?`,
      impactHomeMinor: annualMinor,
      urgency: 0.3,
      createdAt: now,
    })
  }

  // The corridor. The differentiator, and the one figure a bank will never show you.
  if (input.corridor.transfers > 0 && input.corridor.costMinor > 0) {
    out.push({
      id: 'corridor',
      kind: 'corridor',
      title: `The corridor cost ${inr(input.corridor.costMinor)}`,
      body: `Your ${input.corridor.transfers} transfers cost ${inr(input.corridor.costMinor)} more than the mid-market rate would have. Want to see the rates?`,
      impactHomeMinor: input.corridor.costMinor,
      urgency: 0.5,
      createdAt: now,
    })
  }

  // Runway. Urgency rises as payday approaches, which is the one thing here that is genuinely
  // time-sensitive rather than merely true.
  //
  // Only when there *is* room. "9 days until money comes in, with -₹1,993.25 of room left" is
  // not a nudge, it is a rub, and it lands precisely when supportive mode says the app should
  // be getting quieter rather than more talkative.
  if (input.runway && input.runway.roomMinor > 0) {
    const { roomMinor, daysToIncome } = input.runway
    out.push({
      id: 'runway',
      kind: 'runway',
      title: `${daysToIncome} days to payday`,
      body: `${daysToIncome} days until money comes in, with ${inr(roomMinor)} of room left. Want the working?`,
      impactHomeMinor: roomMinor,
      urgency: clamp01(1 - daysToIncome / 14),
      createdAt: now,
    })
  }

  return out
}

/**
 * Score, gate, and spend the week's attention.
 *
 * Three independent things must all be true for a nudge to appear, and that redundancy is
 * deliberate — a later edit to any one of them cannot quietly reopen the tap:
 *
 *   1. a slot is free (`WEEKLY_CAP − sentLast7`),
 *   2. the score is above zero, which fatigue drives to zero once a capful has been ignored
 *      and the cooldown drives to zero for a repeat,
 *   3. the sentence passes the tone gate.
 *
 * The window is **rolling seven days, not the calendar week**. A calendar week permits four on
 * Sunday and four more on Monday — eight inside forty-eight hours, while satisfying "four a
 * week" on both counts. That is exactly the burst the cap exists to prevent.
 */
export function buildNudges(
  input: NudgeInput,
  history: NudgeHistory,
  context: { readonly now: number; readonly hour: number; readonly supportiveMode?: boolean },
): {
  readonly ship: MobileNudge[]
  readonly suppressed: MobileNudge[]
  readonly blocked: readonly ToneVerdict[]
} {
  const blocked: ToneVerdict[] = []
  const allowed: Draft[] = []

  for (const draft of drafts(input, context.now)) {
    // `solicited` because these only render on a screen you navigated to. Quiet hours stop
    // the app starting a conversation at 2am; they are not a reason to blank a page someone
    // deliberately opened at 2am.
    const { shown, verdict } = gate({ text: draft.body }, context, { solicited: true })
    if (shown) allowed.push(draft)
    else blocked.push(verdict)
  }

  const candidates: NudgeCandidate[] = allowed.map((d) => ({
    id: d.id,
    kind: d.kind,
    impactHomeMinor: d.impactHomeMinor,
    urgency: d.urgency,
    novelty: novelty(d.kind, history, context.now),
    createdAt: d.createdAt,
  }))

  const { ship, suppressed } = rankNudges(candidates, {
    weeklyCap: WEEKLY_CAP,
    sentThisWeek: history.sentLast7,
    fatigue7d: history.ignoredLast7 / WEEKLY_CAP,
  })

  const dress = (n: { id: string; score: number }): MobileNudge => {
    const draft = allowed.find((d) => d.id === n.id)!
    return { ...draft, novelty: novelty(draft.kind, history, context.now), score: n.score }
  }

  return { ship: ship.map(dress), suppressed: suppressed.map(dress), blocked }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}
