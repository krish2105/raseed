import { describe, expect, it } from 'vitest'
import { parseAsk } from './askLedger'

describe('reading a question about the ledger', () => {
  it('refuses rather than guessing', () => {
    expect(parseAsk('')).toBeNull()
    expect(parseAsk('hello')).toBeNull()
    expect(parseAsk('what is the meaning of life')).toBeNull()
  })

  it.each([
    ['How much did I spend last month?', 'total', 30],
    ['total this week', 'total', 7],
    ['How many transactions this week?', 'count', 7],
    ['Top 5 merchants this month', 'byMerchant', 30],
    ['breakdown by category last 90 days', 'byCategory', 90],
    ['my biggest spends last year', 'largest', 365],
    ['a typical day over the last year', 'average', 365],
  ] as const)('reads "%s" as %s over %i days', (input, kind, days) => {
    const ask = parseAsk(input)!
    expect(ask.intent.kind).toBe(kind)
    expect(ask.intent.days).toBe(days)
  })

  /** "How many" is a count even though it starts like a total, and order in the parser is why. */
  it('does not mistake a count for a total', () => {
    expect(parseAsk('how many did I spend on')!.intent.kind).toBe('count')
  })

  it('takes an explicit day count over a phrase', () => {
    expect(parseAsk('spend last 45 days')!.intent).toMatchObject({ days: 45 })
  })

  it('caps the top-N so a question cannot ask for a thousand rows', () => {
    const ask = parseAsk('top 500 merchants')!
    expect(ask.intent).toMatchObject({ kind: 'byMerchant', limit: 20 })
  })

  it('restates what it understood, so the answer is checkable', () => {
    expect(parseAsk('top 3 merchants this week')!.restated).toBe('Top 3 merchants in the last week')
  })

  /** It returns an intent, never SQL — which is what makes it safe to share between dialects. */
  it('cannot emit a statement at all', () => {
    const ask = parseAsk("total; drop table transactions--")
    expect(JSON.stringify(ask)).not.toMatch(/drop|table|;/i)
  })
})
