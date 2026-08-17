import type { ToneRule } from './tone'

/**
 * The Arabic rule set for the tone gate.
 *
 * **Read this before trusting it.**
 *
 * `tone.ts` is a safety system, not a style guide: it sits between generation and display and
 * fails closed, so that nothing reaches someone about their money that shames them, diagnoses
 * them, comments on their body, or crosses into regulated investment advice. Translating the
 * interface into Arabic without translating *this* would have shipped Arabic financial copy past
 * a gate that cannot read it — the guarantee silently switching off for one language.
 *
 * So the rules exist. What they are **not** is verified. I can write the patterns; I cannot
 * judge whether an Arabic sentence lands as shaming, whether a dialect word carries a diagnostic
 * connotation, or whether a phrase reads as advice in the SCA's sense. That is a native
 * speaker's judgement and specifically a *Gulf Arabic* speaker's, since this app's users are in
 * the UAE and MSA regexes will miss colloquial phrasing entirely.
 *
 * Two consequences, both deliberate:
 *
 *   1. `AR_REVIEW_STATUS` is exported and the app **shows** it. An unreviewed safety rule that
 *      claims to be reviewed is worse than no rule, because it stops anyone looking.
 *   2. The agency and specificity rules are **stricter** in Arabic than in English, not looser.
 *      Where I am unsure, the gate blocks. Silence is the failure mode this system was designed
 *      to prefer, and it is the right one to prefer in a language I cannot check.
 *
 * **`\b` does not work here, and the first version of this file was broken because of it.**
 * JavaScript's word boundary is defined against `[A-Za-z0-9_]`, so `/\bبذرت\b/` matched nothing
 * in Arabic — every pattern silently failed and the gate reported *allowed* for every sentence
 * it exists to block. A safety system that fails open is worse than none, because it is
 * believed. The tests are what caught it, which is the argument for writing them first.
 *
 * The patterns below therefore carry **no word boundaries at all**, and that is the right answer
 * here rather than a shortcut. Arabic attaches clitics directly to the word — the conjunction
 * و‑, the preposition بـ, the article الـ, possessive and object suffixes — so بذرت, وبذرت and
 * فبذرت are the same accusation with different glue. A boundary-anchored match would catch the
 * first and miss the other two. Substring matching over-matches slightly, and over-matching is
 * the direction this gate is supposed to fail in.
 */

/** Flipped to `'reviewed'` by whoever reviews it, in the same commit as their corrections. */
export const AR_REVIEW_STATUS: 'unreviewed-by-native-speaker' | 'reviewed' =
  'unreviewed-by-native-speaker'

/**
 * Verdicts about a person rather than observations about a ledger.
 *
 * The English list bans "overspent" because it is a judgement dressed as a measurement. The
 * Arabic equivalents carry the same weight: بذّر / مبذّر (squandering, with a strong moral and
 * religious charge — the Qur'an names المبذرين), أسرفت (excess, same register), فشلت (you
 * failed), ضيّعت (you wasted).
 */
const SHAME_AR: readonly RegExp[] = [
  /بذّ?رت?|مبذّ?ر/,
  /أسرفت?|إسراف/,
  /فشلت|فاشل/,
  /ضيّ?عت/,
  /سيّ?ئ\s*(?:الشهر|الأسبوع|العادة)/,
  /ذنب|تشعر بالذنب/,
  /انضباط/,
  /كان يجب عليك/,
]

/** The app never names or implies a condition. */
const DIAGNOSIS_AR: readonly RegExp[] = [
  /إدمان|مدمن/,
  /اكتئاب|مكتئب/,
  /قلق\s*(?:نفسي|مرضي)/,
  /اضطراب/,
  /الصحة النفسية/,
  /ضبط النفس/,
]

/** Never weight, body, appearance or calories. */
const BODY_AR: readonly RegExp[] = [
  /وزن(?:ك)?/,
  /سعرات/,
  /سمنة|بدانة/,
  /رجيم|حمية/,
  /جسم(?:ك)?/,
  /غير صحي/,
]

/**
 * The compliance guardrail — regulated under the SCA in the UAE and SEBI in India.
 *
 * This list is deliberately the widest of the four. "Capacity" and "advice" are one sentence
 * apart in any language, and in a language I cannot read back I would rather block a safe
 * sentence than pass an unsafe one.
 */
const ADVICE_AR: readonly RegExp[] = [
  /استثمر|استثمار|استثماري?/,
  /صندوق\s*(?:استثمار|مؤشر|تحوط)/,
  /أسهم|سهم/,
  /عملة رقمية|كريبتو|بيتكوين/,
  /محفظة استثمارية/,
  /وديعة ثابتة/,
  /عائد مضمون|أرباح مضمونة/,
  /السوق سوف|سيرتفع|سينخفض/,
  /بدون مخاطر|خالي من المخاطر/,
  /\d+(?:[.,]\d+)?\s*%\s*(?:عائد|سنويا|سنوياً)/,
]

/** Every message ends with a way out, including "this isn't relevant to me". */
const AGENCY_AR: readonly RegExp[] = [
  /القرار لك|الخيار لك/,
  /إذا أردت|إن أردت/,
  /هل تريد|تحب.*؟/,
  /هل أعرض|أعرض لك/,
  /ليس الآن/,
  /أو نتركها|أو اتركها/,
  /لا ضغط/,
  /أخبرني/,
]

/** Specific or silent. A real amount, merchant or date has to appear. */
const SPECIFIC_AR: readonly RegExp[] = [
  /[₹$]|درهم|روبية|AED|INR/,
  /\d{1,2}\s*(?:يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)/,
  /\d{4}-\d{2}-\d{2}/,
]

/** Instructive language, held back while the user is in supportive mode. */
const INSTRUCTIVE_AR = /(?:وفّ?ر أكثر|قلّ?ل|خفّ?ض|هدف شهري|حسّ?ن)/

function matched(patterns: readonly RegExp[], text: string): boolean {
  return patterns.some((p) => p.test(text))
}

/**
 * Check an Arabic sentence against the same rules the English gate applies.
 *
 * Mirrors `checkTone`'s shape exactly so the caller cannot accidentally use one language's
 * rules on the other's copy — the two are selected by locale in one place, not by whoever is
 * writing the screen remembering which to call.
 */
export function checkToneAr(
  text: string,
  context: { readonly hour: number; readonly supportiveMode?: boolean },
  { requireAgency = true, requireSpecific = true, solicited = false } = {},
): { readonly allowed: boolean; readonly broke: ToneRule[]; readonly reasons: string[] } {
  const broke: ToneRule[] = []
  const reasons: string[] = []
  const fail = (rule: ToneRule, reason: string) => {
    broke.push(rule)
    reasons.push(reason)
  }

  if (matched(SHAME_AR, text)) fail('shame', 'يقرأ كحكم على الشخص لا كملاحظة على الحساب')
  if (matched(DIAGNOSIS_AR, text)) fail('diagnosis', 'يسمّي أو يلمّح إلى حالة صحية')
  if (matched(BODY_AR, text)) fail('body', 'يشير إلى الجسم أو الوزن أو الطعام الصحي')
  if (matched(ADVICE_AR, text)) fail('advice', 'يتجاوز إلى نصيحة استثمارية منظّمة')
  if (requireAgency && !matched(AGENCY_AR, text)) fail('agency', 'لا يترك للقارئ مخرجًا')
  if (requireSpecific && !matched(SPECIFIC_AR, text)) {
    fail('specificity', 'لا يحتوي على مبلغ أو تاجر أو تاريخ')
  }
  if (!solicited && (context.hour >= 21 || context.hour < 8)) {
    fail('quiet-hours', `${context.hour}:00 ضمن ساعات الهدوء`)
  }
  if (context.supportiveMode && INSTRUCTIVE_AR.test(text)) {
    fail('supportive-mode', 'إرشادي بينما المستخدم في الوضع الداعم')
  }

  return { allowed: broke.length === 0, broke, reasons }
}
