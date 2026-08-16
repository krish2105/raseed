import { describe, expect, it } from 'vitest'
import { narrate, supportiveMode, type Fact } from './narrate'
import { checkTone, type ToneContext } from './tone'

const DAY: ToneContext = { hour: 10 }

const ahead: Fact = {
  theme: 'ahead',
  values: { delta: '₹640', reason: 'dining' },
  weight: 0.4,
}
const duplicate: Fact = {
  theme: 'duplicate',
  values: { merchant: 'Cult Fit', first: '3 Aug', second: '17 Aug', amount: '₹1,499' },
  weight: 0.9,
}

describe('narrate', () => {
  /**
   * The rule most likely to be quietly relaxed later, so it is asserted first. Three
   * observations on a screen is none — the reader skims them all and acts on nothing.
   */
  it('says at most one thing, however many facts it is handed', () => {
    const { message } = narrate([ahead, duplicate], DAY)
    expect(message).not.toBeNull()
    expect(message!.theme).toBe('duplicate') // the heavier one
  })

  it('says nothing at all when it has nothing', () => {
    expect(narrate([], DAY).message).toBeNull()
  })

  it('always offers a way to decline', () => {
    const { message } = narrate([ahead], DAY)
    expect(message!.choices).toContain('Not now')
    expect(message!.choices).toContain("Don't show me this kind")
  })

  /** Every template must survive its own gate — otherwise the app ships a message it blocks. */
  it('every template passes the tone engine', () => {
    const all: Fact[] = [
      ahead,
      duplicate,
      { theme: 'behind', values: { delta: '₹300', reason: 'travel' }, weight: 1 },
      { theme: 'steady', values: { days: '19', room: '₹2,180' }, weight: 1 },
      { theme: 'runway', values: { projected: '₹41,000', pool: '₹45,000' }, weight: 1 },
      {
        theme: 'category-top',
        values: { category: 'Eating out', months: 'three', amount: '₹2,900' },
        weight: 1,
      },
      {
        theme: 'regime-shift',
        values: { date: '3 Mar', before: '₹1,100', after: '₹1,800' },
        weight: 1,
      },
      {
        theme: 'subscription',
        values: { merchant: 'Netflix', amount: '₹799', period: '30', annual: '₹9,588' },
        weight: 1,
      },
    ]

    for (const fact of all) {
      const { message, blocked } = narrate([fact], DAY)
      expect(message, `${fact.theme} was blocked: ${blocked[0]?.reasons.join('; ')}`).not.toBeNull()
      expect(checkTone(message!.text, DAY).allowed).toBe(true)
    }
  })

  /** Quiet hours are enforced at the gate, so the narrator inherits them for free. */
  it('says nothing at night, whatever it was going to say', () => {
    const { message, blocked } = narrate([duplicate], { hour: 23 })
    expect(message).toBeNull()
    expect(blocked[0]!.broke).toContain('quiet-hours')
  })

  it('records why each candidate was blocked rather than swallowing it', () => {
    const { blocked } = narrate([ahead, duplicate], { hour: 2 })
    expect(blocked).toHaveLength(2)
    expect(blocked.every((v) => v.reasons.length > 0)).toBe(true)
  })
})

describe('supportiveMode', () => {
  const base = { roomMinor: 100_000, spendMinor: 300_000, incomeMinor: 500_000, consecutiveNegativeDays: 0 }

  it('is off in an ordinary month', () => {
    expect(supportiveMode(base)).toBe(false)
  })

  it('turns on when there is no room left', () => {
    expect(supportiveMode({ ...base, roomMinor: -1 })).toBe(true)
  })

  it('turns on after three consecutive negative days', () => {
    expect(supportiveMode({ ...base, consecutiveNegativeDays: 3 })).toBe(true)
  })

  it('turns on when spending has run well past income', () => {
    expect(supportiveMode({ ...base, spendMinor: 600_000 })).toBe(true)
  })

  /** Zero income is a new user, not a crisis. Guessing wrong here means lecturing someone. */
  it('does not trip on a user with no income recorded yet', () => {
    expect(supportiveMode({ ...base, incomeMinor: 0, spendMinor: 1 })).toBe(false)
  })
})
