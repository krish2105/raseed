/**
 * The tone engine.
 *
 * Not a style guide — a safety system, enforced in code, sitting between generation and
 * display, failing closed.
 *
 * An app that discusses money in a warm voice is touching one of the most shame-loaded
 * subjects a person has, on their phone, unprompted. Done well that is genuinely useful.
 * Done badly it tells someone having a hard month that they failed at it. The difference
 * cannot live in a prompt or a wiki page, because both are advisory and neither runs at
 * display time. This runs at display time, and anything it cannot verify does not ship.
 *
 * **Fails closed.** An unrecognised message is blocked, not passed. Silence is a feature —
 * the worst outcome here is not a missed nudge, it is a message that should never have been
 * written reaching someone at the wrong moment.
 */

export type ToneRule =
  | 'shame'
  | 'diagnosis'
  | 'body'
  | 'agency'
  | 'specificity'
  | 'advice'
  | 'quiet-hours'
  | 'supportive-mode'

export interface ToneVerdict {
  readonly allowed: boolean
  /** Every rule the text broke, not just the first — a rewrite should fix all of them. */
  readonly broke: ToneRule[]
  /** Human-readable, for the audit log. Every block is logged with its reason. */
  readonly reasons: string[]
}

export interface ToneContext {
  /** Local hour, 0–23. Passed in; no engine reads a clock. */
  readonly hour: number
  /**
   * Sustained negative balance, borrowing, sharp income loss. In supportive mode the app
   * gets quieter and more stabilising, not more instructive.
   */
  readonly supportiveMode?: boolean
  /** Whether the user opted into the lifestyle layer at all. Default: they did not. */
  readonly lifestyleOptIn?: boolean
}

/**
 * Verdicts, not observations. "You overspent" is a judgement about a person; "food and
 * drink was your largest category" is a fact about a ledger. Only one of those is ours to
 * say.
 */
const SHAME = [
  /\boverspent\b/i,
  /\bover-?spending\b/i,
  /\byou (?:failed|blew|wasted|squandered)\b/i,
  /\byou should have\b/i,
  /\b(?:bad|terrible|awful|poor) (?:month|week|habit|choice)\b/i,
  /\bguilt(?:y|ing)?\b/i,
  /\bsplurged?\b/i,
  /\byou'?re? (?:bad|terrible|hopeless) (?:at|with)\b/i,
  // Words may sit between: "your streak is broken" is the same verdict as "streak broken".
  /\bstreak\b[^.!?]{0,16}\b(?:broken|lost|ended|gone)\b/i,
  /\bdiscipline\b/i,
]

/** The app never names or implies a condition. It is not qualified to, and it is not asked to. */
const DIAGNOSIS = [
  /\baddict(?:ion|ed|ive)\b/i,
  /\bdepress(?:ed|ion|ive)\b/i,
  /\banxi(?:ety|ous)\b/i,
  /\bdisorder(?:ed)?\b/i,
  /\bcompulsi(?:ve|on)\b/i,
  /\balcoholi(?:c|sm)\b/i,
  /\bmental health\b/i,
  /\bself-?control\b/i,
]

/** Never weight, body, appearance or calories. Not once, not gently, not as a compliment. */
const BODY = [
  /\bweight\b/i,
  /\bcalor(?:ie|ies)\b/i,
  /\bobes(?:e|ity)\b/i,
  /\boverweight\b/i,
  /\bdiet(?:ing)?\b/i,
  /\bunhealthy\b/i,
  /\bbody\b/i,
  /\bfit(?:ter|ness) goal\b/i,
]

/**
 * The compliance guardrail. This boundary is one sentence wide.
 *
 * "You have about ₹2,400 a month of genuine room" is capacity — a fact about arithmetic.
 * "...so put it in X" is investment advice, which is a licensed activity under SEBI in
 * India and the SCA in the UAE. A sentence generator will cross that line eventually, so
 * the crossing is checked rather than trusted.
 */
const ADVICE = [
  /\b(?:you should|i'?d|we) (?:invest|buy|sell|trade|put (?:it|this|that) in)\b/i,
  /\bmutual fund\b/i,
  /\b(?:index|hedge) fund\b/i,
  /\bstocks?\b/i,
  /\bequit(?:y|ies)\b/i,
  /\bcrypto(?:currency)?\b/i,
  /\bbitcoin\b/i,
  /\bportfolio\b/i,
  /\bSIP\b/,
  /\bfixed deposit\b/i,
  /\bguaranteed?\s+(?:return|profit|growth)\b/i,
  /\bwill (?:return|yield|grow|double)\b/i,
  /\bmarket (?:will|is about to|timing)\b/i,
  /\b\d+(?:\.\d+)?%\s*(?:returns?|p\.?a\.?|per annum|yield)\b/i,
  /\brisk-?free\b/i,
]

/** Every message ends with a way out, including "this isn't relevant to me". */
const AGENCY = [
  /\byour call\b/i,
  /\bif you'?d like\b/i,
  /\bwant me to\b/i,
  /\bshall i\b/i,
  /\bor (?:we can |just )?leave it\b/i,
  /\bnot now\b/i,
  /\bup to you\b/i,
  /\bno pressure\b/i,
  /\bwould you like\b/i,
  // Offer forms. "Want the detail?" leaves exactly as much room as "your call" does, and
  // the first draft of this list rejected it — which would have blocked the calmest
  // messages the app can write.
  /\bwant (?:the|to|a)\b/i,
  /\bshall we\b/i,
  /\b(?:can|should) i show\b/i,
  /\blet me know\b/i,
  /\bhave a look\b/i,
  /\bignore this\b/i,
]

/**
 * Specific or silent. Generic encouragement is noise, and noise is what teaches someone to
 * stop reading. A real amount, merchant or date has to appear.
 */
const SPECIFIC = [
  /[₹$]|AED\s|\bINR\b/,
  /\b\d{1,2}\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,
  /\b\d{4}-\d{2}-\d{2}\b/,
]

/** Late-night is when this kind of message lands worst. */
const QUIET_START = 21
const QUIET_END = 8

function matched(patterns: readonly RegExp[], text: string): boolean {
  return patterns.some((p) => p.test(text))
}

/**
 * Check a message before it is shown. The only way anything reaches a user.
 *
 * `requireAgency` exists because a purely factual panel label — "Spent, last 30 days" —
 * is not a nudge and has nothing to offer a choice about. Interruptions always require it.
 */
export function checkTone(
  text: string,
  context: ToneContext,
  { requireAgency = true, requireSpecific = true } = {},
): ToneVerdict {
  const broke: ToneRule[] = []
  const reasons: string[] = []

  const fail = (rule: ToneRule, reason: string) => {
    broke.push(rule)
    reasons.push(reason)
  }

  if (matched(SHAME, text)) fail('shame', 'reads as a verdict on the person, not the ledger')
  if (matched(DIAGNOSIS, text)) fail('diagnosis', 'names or implies a condition')
  if (matched(BODY, text)) fail('body', 'refers to body, weight, diet or calories')
  if (matched(ADVICE, text)) {
    fail('advice', 'crosses into regulated investment advice (SEBI / SCA)')
  }
  if (requireAgency && !matched(AGENCY, text)) {
    fail('agency', 'offers the reader no way to decline')
  }
  if (requireSpecific && !matched(SPECIFIC, text)) {
    fail('specificity', 'contains no amount, merchant or date — generic encouragement')
  }

  if (context.hour >= QUIET_START || context.hour < QUIET_END) {
    fail('quiet-hours', `${context.hour}:00 is inside quiet hours`)
  }

  // In supportive mode the language shifts from optimisation to stabilisation. Anything
  // that reads as "here is how to do better" is held back until things are steadier.
  if (context.supportiveMode && /\b(?:save more|cut|reduce|optimi[sz]e|target)\b/i.test(text)) {
    fail('supportive-mode', 'instructive while the user is in supportive mode')
  }

  return { allowed: broke.length === 0, broke, reasons }
}

/**
 * The gate itself. Returns the message, or null.
 *
 * A caller cannot accidentally render a blocked message, because a blocked message is not
 * a value it ever receives — which is the difference between a guardrail and a warning.
 */
export function gate<T extends { readonly text: string }>(
  message: T,
  context: ToneContext,
  options?: { requireAgency?: boolean; requireSpecific?: boolean },
): { readonly shown: T | null; readonly verdict: ToneVerdict } {
  const verdict = checkTone(message.text, context, options)
  return { shown: verdict.allowed ? message : null, verdict }
}

/**
 * Whether the lifestyle layer may speak at all.
 *
 * Opt-in is necessary and not sufficient: under UAE PDPL and comparable regimes, inferring
 * something health-adjacent from spending creates sensitive personal data whether or not
 * the user ever mentioned it. Supportive mode suspends the layer entirely — someone having
 * a hard month does not need a wellbeing observation on top of it.
 */
export function lifestyleMaySpeak(context: ToneContext): boolean {
  return context.lifestyleOptIn === true && context.supportiveMode !== true
}
