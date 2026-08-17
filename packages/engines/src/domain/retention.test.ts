import { describe, expect, it } from 'vitest'
import { DEFAULT_RETENTION, dataCategories, purgePlan } from './retention'

const NOW = 1_755_300_000_000
const DAY = 86_400_000

describe('retention', () => {
  it('plans a cutoff per kind rather than one number for everything', () => {
    const plan = purgePlan(NOW)
    expect(plan.captureLogBefore).toBe(NOW - 90 * DAY)
    expect(plan.nudgesBefore).toBe(NOW - 180 * DAY)
  })

  /**
   * The nudge cap counts a rolling seven days. A retention window shorter than that would make
   * the cap forget what it had already sent and quietly allow more than four.
   */
  it('keeps nudges far longer than the fatigue window that reads them', () => {
    expect(DEFAULT_RETENTION.nudgeDays).toBeGreaterThan(7)
  })

  /** Raw text you typed is the most sensitive thing here, so it has the shortest life. */
  it('throws raw capture text away sooner than anything else', () => {
    expect(DEFAULT_RETENTION.captureLogDays).toBeLessThan(DEFAULT_RETENTION.nudgeDays)
  })

  it('accepts a policy rather than hard-coding the defaults', () => {
    const plan = purgePlan(NOW, { captureLogDays: 7, nudgeDays: 14 })
    expect(plan.captureLogBefore).toBe(NOW - 7 * DAY)
  })

  describe('the categories a person actually asks about', () => {
    const categories = dataCategories()

    it('covers every kind of data the app stores', () => {
      expect(categories.map((c) => c.key).sort()).toEqual(
        ['capture_log', 'ledger', 'nudges', 'people', 'preferences', 'worth_scores'].sort(),
      )
    })

    /** The claim the whole product rests on, asserted rather than written in a paragraph. */
    it('says nothing leaves the device, for every single category', () => {
      expect(categories.every((c) => c.leavesDevice === false)).toBe(true)
    })

    it('states a retention for each, in words rather than a number', () => {
      for (const c of categories) {
        expect(c.retention.length, c.key).toBeGreaterThan(20)
      }
    })

    it('reflects the policy it was given', () => {
      const short = dataCategories({ captureLogDays: 7, nudgeDays: 14 })
      expect(short.find((c) => c.key === 'capture_log')!.retention).toContain('7 days')
    })
  })
})
