import { gate, type ToneContext, type ToneVerdict } from './tone'

/**
 * The narrator.
 *
 * `finy_v2` calls for a cloud model that writes sentences from computed inputs and invents
 * nothing. This is that, with the model removed: the constraint list — *narrate these, state
 * no number you were not given, invent nothing* — describes a template exactly. A template
 * satisfies every one of those constraints by construction rather than by instruction, costs
 * nothing, needs no key, works offline, and cannot hallucinate a figure.
 *
 * The seam is deliberate. Swapping a model in later means replacing `compose` and leaving
 * the gate, the ranking and the frequency governor exactly as they are — which is the whole
 * point of putting the voice layer *above* the generation layer.
 */

export type Theme =
  | 'ahead'
  | 'behind'
  | 'steady'
  | 'duplicate'
  | 'runway'
  | 'category-top'
  | 'regime-shift'
  | 'subscription'

export interface Fact {
  readonly theme: Theme
  /**
   * Pre-formatted strings only. The narrator never sees a number it could round, restate or
   * get wrong — every figure arrives already rendered by `@raseed/money`.
   */
  readonly values: Readonly<Record<string, string>>
  /** 0–1. How much this deserves the one slot available. */
  readonly weight: number
}

export interface Narrated {
  readonly theme: Theme
  readonly text: string
  /** What a reader may do about it. Always includes a way to decline. */
  readonly choices: readonly string[]
}

/**
 * One template per theme. Each already satisfies the tone rules — specific, non-judgemental,
 * and ending in an offer — but each is still gated before display, because a template that
 * drifts during an edit must fail loudly rather than quietly ship.
 */
const TEMPLATES: Record<Theme, (v: Readonly<Record<string, string>>) => string> = {
  ahead: (v) =>
    `You're ${v.delta} ahead of where you were at this point last month, mostly because ${v.reason} settled down. Want the detail?`,
  behind: (v) =>
    `You're ${v.delta} further along than this point last month, mostly ${v.reason}. Want to see where?`,
  steady: (v) =>
    `${v.days} days left and about ${v.room} of comfortable room. That's steady — want the working?`,
  duplicate: (v) =>
    `${v.merchant} charged you twice, on ${v.first} and ${v.second}, both ${v.amount}. That might be a duplicate — shall I show you?`,
  runway: (v) =>
    `At your current pace this month lands near ${v.projected}, against ${v.pool} set aside. Want to see the range?`,
  'category-top': (v) =>
    `${v.category} has been your largest category ${v.months} months running, around ${v.amount} a month. No judgement — it's a normal number. If it's something you'd like to shift I can help, or we can leave it. Your call.`,
  'regime-shift': (v) =>
    `Something changed around ${v.date}: your daily spending moved from about ${v.before} to ${v.after}. Want me to show what shifted?`,
  subscription: (v) =>
    `${v.merchant} bills you ${v.amount} every ${v.period} days. That's ${v.annual} a year — want the detail?`,
}

/**
 * Pick the one thing worth saying, write it, and check it before it leaves.
 *
 * **At most one.** Not the top three. A screen with three observations has none — the reader
 * skims all of them and acts on nothing, and the app has spent its whole welcome in one
 * visit. `finy_v2` is explicit about this and it is the rule most likely to be quietly
 * relaxed later, so it lives in the signature: this returns a single item or nothing.
 */
export function narrate(
  facts: readonly Fact[],
  context: ToneContext,
): { readonly message: Narrated | null; readonly blocked: readonly ToneVerdict[] } {
  const blocked: ToneVerdict[] = []

  for (const fact of [...facts].sort((a, b) => b.weight - a.weight)) {
    const text = TEMPLATES[fact.theme](fact.values)
    const { shown, verdict } = gate({ text }, context)

    if (shown) {
      return {
        message: {
          theme: fact.theme,
          text,
          // "Not now" is always present and always real. A dismissal that does not persist
          // is worse than no dismissal, because it teaches the reader the control is fake.
          choices: ['Show me', 'Not now', "Don't show me this kind"],
        },
        blocked,
      }
    }

    // Every block is recorded rather than swallowed, so a template that starts failing is
    // visible instead of merely absent.
    blocked.push(verdict)
  }

  return { message: null, blocked }
}

/**
 * Is the app in supportive mode?
 *
 * Sustained negative room, or spending that has climbed far past income. In that state the
 * app gets quieter and steadier, not more instructive — and this is deliberately a coarse,
 * conservative test, because the cost of entering supportive mode unnecessarily is a slightly
 * quieter app, and the cost of missing it is a lecture delivered to someone struggling.
 */
export function supportiveMode(signals: {
  readonly roomMinor: number
  readonly spendMinor: number
  readonly incomeMinor: number
  readonly consecutiveNegativeDays: number
}): boolean {
  if (signals.consecutiveNegativeDays >= 3) return true
  if (signals.roomMinor < 0) return true
  if (signals.incomeMinor > 0 && signals.spendMinor > signals.incomeMinor * 1.15) return true
  return false
}
