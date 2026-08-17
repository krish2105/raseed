/**
 * Retention — what gets thrown away, and when.
 *
 * S8. The principle is the one the DPDP Act and the UAE PDPL both start from: personal data is
 * kept for as long as the purpose needs it and **not one day longer**. "Forever, in case it is
 * useful" is not a purpose.
 *
 * The interesting part is that different data here has genuinely different lifetimes, and
 * collapsing them into one number would be wrong in both directions:
 *
 *   - **Your ledger is yours indefinitely.** It is the product. Deleting last year's spending
 *     to satisfy a policy would be destroying the thing you came for.
 *   - **`capture_log` is diagnostic.** It holds raw text you typed, kept so the parser can be
 *     measured and improved. That purpose expires: a capture from eight months ago improves
 *     nothing and is simply a sentence you once wrote, sitting on disk.
 *   - **Nudges are a delivery record.** Once outside the fatigue window they influence nothing.
 *
 * Pure: takes a clock, returns a plan. Nothing here deletes anything — a policy that both
 * decides and executes is a policy nobody can test.
 */

export interface RetentionPolicy {
  /** Days of raw capture text to keep. The default is deliberately short. */
  readonly captureLogDays: number
  /** Days of nudge delivery history. Must exceed the fatigue window or the cap forgets itself. */
  readonly nudgeDays: number
}

/**
 * The defaults, and why these numbers.
 *
 * 90 days of capture log is two things at once: long enough that a quarter's worth of parse
 * failures can be reviewed and folded into the golden set, and short enough that it is not a
 * diary. 180 days of nudges is well past the seven-day fatigue window with room for a seasonal
 * pattern, and nothing reads it after that.
 */
export const DEFAULT_RETENTION: RetentionPolicy = {
  captureLogDays: 90,
  nudgeDays: 180,
}

export interface PurgePlan {
  /** Epoch ms. Rows created before this are past their purpose. */
  readonly captureLogBefore: number
  readonly nudgesBefore: number
}

export function purgePlan(now: number, policy: RetentionPolicy = DEFAULT_RETENTION): PurgePlan {
  const DAY = 86_400_000
  return {
    captureLogBefore: now - policy.captureLogDays * DAY,
    nudgesBefore: now - policy.nudgeDays * DAY,
  }
}

/**
 * What the app is holding, in the terms a person actually asks about.
 *
 * A privacy dashboard that lists table names has answered a question nobody asked. These are
 * the categories someone means when they say "what do you have on me", each with the retention
 * that applies and whether it ever leaves the device — and the last column is the same value for
 * every row, which is the point worth making.
 */
export interface DataCategory {
  readonly key: string
  readonly label: string
  readonly what: string
  readonly retention: string
  readonly leavesDevice: false
}

export function dataCategories(policy: RetentionPolicy = DEFAULT_RETENTION): DataCategory[] {
  return [
    {
      key: 'ledger',
      label: 'Your transactions',
      what: 'Amounts, merchants, categories, dates and the FX rate frozen on each row.',
      retention: 'Kept until you delete them. This is the product; it is not diagnostic data.',
      leavesDevice: false,
    },
    {
      key: 'people',
      label: 'People you split with',
      what: 'Names you typed, and what each person owes or is owed.',
      retention: 'Kept until you remove the person.',
      leavesDevice: false,
    },
    {
      key: 'worth_scores',
      label: 'Your worth-it answers',
      what: 'Whether you marked a purchase worth it, not worth it, or neither.',
      retention: 'Kept until you delete the transaction they belong to.',
      leavesDevice: false,
    },
    {
      key: 'capture_log',
      label: 'Raw capture text',
      what: 'The exact lines you typed, kept so the parser can be measured and corrected.',
      retention: `Deleted automatically after ${policy.captureLogDays} days. It is diagnostic, and that purpose expires.`,
      leavesDevice: false,
    },
    {
      key: 'nudges',
      label: 'Which nudges you were shown',
      what: 'What was surfaced, when, and whether you acted on it.',
      retention: `Deleted automatically after ${policy.nudgeDays} days.`,
      leavesDevice: false,
    },
    {
      key: 'preferences',
      label: 'Settings',
      what: 'Theme, app lock, and the database key — the key in the keychain, the rest on disk.',
      retention: 'Kept until you delete the app.',
      leavesDevice: false,
    },
  ]
}
