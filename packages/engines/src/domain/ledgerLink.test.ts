import { describe, expect, it } from 'vitest'
import { LINK_VERSION, buildLink, decodeLink, encodeLink, linkTotals } from './ledgerLink'

/**
 * Node's codec, standing in for the browser's `btoa` and React Native's `Buffer`.
 *
 * Declared rather than imported: `@raseed/engines` has no platform types by design, and adding
 * `@types/node` to a package whose whole contract is "no I/O, no platform" to satisfy one test
 * would be the tail wagging the dog.
 */
declare const Buffer: {
  from(input: string, encoding: string): { toString(encoding: string): string }
}

const codec = {
  encode: (s: string) =>
    Buffer.from(s, 'utf8').toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''),
  decode: (s: string) => Buffer.from(s.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8'),
}

const dinner = buildLink({
  what: 'Toit, Saturday',
  at: 1_755_300_000_000,
  currency: 'INR',
  totalMinor: 220_000,
  from: 'Krishna',
  people: [
    { name: 'Rahul', owedMinor: 60_000 },
    { name: 'Asha', owedMinor: 55_000 },
  ],
  payTo: 'krishna@upi',
})

describe('a ledger link', () => {
  it('survives a round trip', () => {
    const result = decodeLink(encodeLink(dinner, codec), codec)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.link).toEqual(dinner)
  })

  it('is url-safe, so a messaging app cannot mangle it', () => {
    const encoded = encodeLink(dinner, codec)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('reads a fragment with or without its hash', () => {
    const encoded = encodeLink(dinner, codec)
    expect(decodeLink(`#${encoded}`, codec).ok).toBe(true)
    expect(decodeLink(encoded, codec).ok).toBe(true)
  })

  /**
   * Structural redaction. Anything not on the shape has nowhere to go, so a split link cannot
   * carry an account id or a balance even if a caller passes one.
   */
  it('cannot carry anything the shape does not name', () => {
    const sneaky = buildLink({
      what: 'x',
      at: 0,
      currency: 'INR',
      totalMinor: 1,
      from: 'me',
      people: [{ name: 'a', owedMinor: 1 }],
      // @ts-expect-error — the point of the test: this is not part of the shape.
      accountId: 'acct-hdfc',
    })
    expect(JSON.stringify(sneaky)).not.toContain('acct-hdfc')
  })

  it('truncates rather than letting a link carry an essay', () => {
    const long = buildLink({
      what: 'x'.repeat(500),
      at: 0,
      currency: 'INR',
      totalMinor: 1,
      from: 'y'.repeat(500),
      people: [{ name: 'z'.repeat(500), owedMinor: 1 }],
    })
    expect(long.what.length).toBe(80)
    expect(long.from.length).toBe(40)
    expect(long.people[0]!.name.length).toBe(40)
  })

  it.each([
    ['', 'nothing in it'],
    ['not-base64-at-all!!', 'damaged'],
    [codec.encode('[]'), 'not a split'],
    [codec.encode('{"v":1}'), 'missing something'],
    [codec.encode(JSON.stringify({ ...dinner, currency: 'USD' })), 'missing something'],
    [codec.encode(JSON.stringify({ ...dinner, people: [{ name: 'a' }] })), 'missing something'],
  ])('refuses %# with an explanation rather than throwing', (fragment, fragmentOfReason) => {
    const result = decodeLink(fragment, codec)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason.toLowerCase()).toContain(fragmentOfReason)
  })

  /** A link from a future version says so instead of rendering a partial split. */
  it('refuses a newer version rather than guessing at it', () => {
    const future = codec.encode(JSON.stringify({ ...dinner, v: LINK_VERSION + 1 }))
    const result = decodeLink(future, codec)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('newer version')
  })

  it('states what it sums to, so a reader can check it against the bill', () => {
    expect(linkTotals(dinner)).toEqual({ owedToSender: 115_000, senderShare: 105_000 })
  })

  it('stays short enough to send in a message', () => {
    expect(encodeLink(dinner, codec).length).toBeLessThan(400)
  })
})
