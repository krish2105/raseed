import { describe, expect, it } from 'vitest'
import { checkTone, gate, lifestyleMaySpeak, type ToneContext } from './tone'

/** Mid-afternoon, not in supportive mode. The ordinary case. */
const DAY: ToneContext = { hour: 15 }

/** A message that passes every rule, used as the base for single-rule violations. */
const GOOD =
  'Food and drink came to ₹2,900 last month, your largest category. If you’d like, I can show a version that costs less — or we can leave it, your call.'

describe('checkTone — the message that should pass', () => {
  it('allows a specific, non-judgemental observation that offers a way out', () => {
    const v = checkTone(GOOD, DAY)
    expect(v.reasons).toEqual([])
    expect(v.allowed).toBe(true)
  })
})

describe('checkTone — never shame', () => {
  for (const text of [
    'You overspent on ₹2,900 of food this month. Want me to help?',
    'That was a bad month — ₹2,900 on food. Shall I help?',
    'You should have kept ₹2,900 aside. Your call.',
    'Your streak is broken. ₹2,900 spent. Up to you.',
    'A bit more discipline and ₹2,900 becomes ₹2,000. Your call.',
  ]) {
    it(`blocks: ${text.slice(0, 42)}…`, () => {
      expect(checkTone(text, DAY).broke).toContain('shame')
    })
  }
})

describe('checkTone — never diagnose', () => {
  for (const text of [
    'This looks like a shopping addiction. ₹2,900 spent. Your call.',
    'Spending like this often goes with depression. ₹2,900. Want me to help?',
    'Your self-control around ₹2,900 of food could improve. Your call.',
  ]) {
    it(`blocks: ${text.slice(0, 42)}…`, () => {
      expect(checkTone(text, DAY).broke).toContain('diagnosis')
    })
  }
})

describe('checkTone — never the body', () => {
  for (const text of [
    'Cutting ₹2,900 of food would help your weight. Your call.',
    'That is a lot of calories as well as ₹2,900. Would you like help?',
    'A healthier diet would cost less than ₹2,900. Your call.',
  ]) {
    it(`blocks: ${text.slice(0, 42)}…`, () => {
      expect(checkTone(text, DAY).broke).toContain('body')
    })
  }
})

/**
 * The boundary that is one sentence wide, and the reason the guardrail exists at all.
 * Capacity is arithmetic. A named instrument is a licensed activity.
 */
describe('checkTone — the compliance guardrail', () => {
  it('allows stating capacity, which is only arithmetic', () => {
    const v = checkTone(
      'Based on what you actually spend, you have about ₹2,400 a month of room. Want me to show the arithmetic?',
      DAY,
    )
    expect(v.allowed).toBe(true)
  })

  for (const text of [
    'You have ₹2,400 spare — you should invest it. Your call.',
    'Put that ₹2,400 into a mutual fund. Your call.',
    'A ₹2,400 SIP would suit you. Your call.',
    'That ₹2,400 will return 12% p.a. Your call.',
    'Move ₹2,400 into stocks. Want me to help?',
    'A guaranteed return on your ₹2,400. Your call.',
    'The market will recover — hold your ₹2,400. Your call.',
    'This ₹2,400 is a risk-free way to grow. Your call.',
  ]) {
    it(`blocks: ${text.slice(0, 42)}…`, () => {
      expect(checkTone(text, DAY).broke).toContain('advice')
    })
  }
})

describe('checkTone — always leave agency', () => {
  it('blocks an instruction with no way to decline', () => {
    const v = checkTone('Food and drink came to ₹2,900 last month. Cut it to ₹2,000.', DAY)
    expect(v.broke).toContain('agency')
  })

  it('does not demand agency of a plain panel label', () => {
    const v = checkTone('Spent ₹2,900, last 30 days', DAY, { requireAgency: false })
    expect(v.allowed).toBe(true)
  })
})

describe('checkTone — specific or silent', () => {
  it('blocks generic encouragement with nothing in it', () => {
    const v = checkTone('You are doing great this month! Keep it up — your call.', DAY)
    expect(v.broke).toContain('specificity')
  })

  it('accepts a date as specificity when there is no amount', () => {
    const v = checkTone('Two charges from the same gym on 3 Aug. Want me to look?', DAY)
    expect(v.allowed).toBe(true)
  })
})

describe('checkTone — quiet hours', () => {
  it.each([21, 23, 0, 3, 7])('blocks a nudge at %i:00', (hour) => {
    expect(checkTone(GOOD, { hour }).broke).toContain('quiet-hours')
  })

  it.each([8, 12, 20])('allows a nudge at %i:00', (hour) => {
    expect(checkTone(GOOD, { hour }).allowed).toBe(true)
  })
})

describe('checkTone — supportive mode', () => {
  it('suspends instructive language when things are hard', () => {
    const v = checkTone(
      'You could save more than ₹2,400 this month. Would you like help?',
      { hour: 15, supportiveMode: true },
    )
    expect(v.broke).toContain('supportive-mode')
  })

  it('still allows a steadying observation', () => {
    const v = checkTone(
      'Rent of ₹22,000 clears on the 3rd and you have that set aside. Want the detail?',
      { hour: 15, supportiveMode: true },
    )
    expect(v.allowed).toBe(true)
  })
})

describe('gate', () => {
  it('hands back the message when it passes', () => {
    expect(gate({ text: GOOD }, DAY).shown).not.toBeNull()
  })

  /** A blocked message must not be a value the caller can accidentally render. */
  it('hands back null, not a flag, when it fails', () => {
    const { shown, verdict } = gate({ text: 'You overspent.' }, DAY)
    expect(shown).toBeNull()
    expect(verdict.allowed).toBe(false)
  })

  it('reports every rule broken, so one rewrite can fix them all', () => {
    const { verdict } = gate(
      { text: 'You overspent — your weight shows it. Buy an index fund.' },
      { hour: 23 },
    )
    expect(new Set(verdict.broke)).toEqual(
      new Set(['shame', 'body', 'advice', 'agency', 'specificity', 'quiet-hours']),
    )
  })

  it('logs a reason for every block', () => {
    const { verdict } = gate({ text: 'You overspent.' }, DAY)
    expect(verdict.reasons.length).toBe(verdict.broke.length)
    expect(verdict.reasons.every((r) => r.length > 0)).toBe(true)
  })
})

describe('lifestyleMaySpeak', () => {
  it('is silent by default — opt-in is not the absence of opt-out', () => {
    expect(lifestyleMaySpeak({ hour: 15 })).toBe(false)
    expect(lifestyleMaySpeak({ hour: 15, lifestyleOptIn: false })).toBe(false)
  })

  it('speaks only once explicitly opted into', () => {
    expect(lifestyleMaySpeak({ hour: 15, lifestyleOptIn: true })).toBe(true)
  })

  /** Someone having a hard month does not need a wellbeing observation on top of it. */
  it('falls silent in supportive mode even when opted in', () => {
    expect(lifestyleMaySpeak({ hour: 15, lifestyleOptIn: true, supportiveMode: true })).toBe(
      false,
    )
  })
})
