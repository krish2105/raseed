import type { Currency } from '@raseed/money'

/**
 * Ledger Link — a split someone can open without installing anything.
 *
 * The whole payload lives in the URL **fragment**, and that choice is the security model. A
 * fragment is never sent to a server: not in the request line, not in a proxy log, not in an
 * access log, not in a CDN trace. The person you send it to renders it entirely in their own
 * browser. There is no row to leak because there is no row.
 *
 * The costs are real and stated rather than discovered later:
 *
 *   - **It cannot be revoked.** Once sent, whoever holds the link holds the data. Send it the
 *     way you would send a screenshot, because that is what it is.
 *   - **It cannot be updated.** Correcting a split means sending a new link.
 *   - **It is long.** A four-person dinner is a few hundred characters. Messaging apps handle
 *     it; a QR code at this size is still scannable.
 *
 * `share_link_id` stays on the `splits` table, unused, for the server-backed version. When
 * Supabase exists a link becomes a short id resolving to an RLS-protected row, revocable and
 * updatable — and `decodeLink` keeps working for everything already sent, which is why the
 * format carries a version.
 *
 * Pure: no `btoa`, no `Buffer`, no platform. The caller passes the base64url codec, because
 * the browser and React Native disagree about which one exists.
 */

/** Bumped when the shape changes. A reader that meets a newer version says so rather than guessing. */
export const LINK_VERSION = 1

export interface LinkParticipant {
  readonly name: string
  /** Minor units. Positive means they owe the sender. */
  readonly owedMinor: number
}

export interface LedgerLink {
  readonly v: number
  /** What it was for. */
  readonly what: string
  /** Epoch ms. */
  readonly at: number
  readonly currency: Currency
  /** The whole bill, for context. */
  readonly totalMinor: number
  /** Who the sender is, as they typed it. No account, no id, no contact detail. */
  readonly from: string
  readonly people: readonly LinkParticipant[]
  /** Optional settle-up hint. A UPI id or an IBAN — whatever they told you to use. */
  readonly payTo?: string
}

export interface LinkCodec {
  readonly encode: (utf8: string) => string
  readonly decode: (base64url: string) => string
}

/**
 * What may be put in a link.
 *
 * Deliberately not "the transaction". A split link needs a description, a date, an amount and
 * some names; it does not need your account id, your merchant id, your category, your balance
 * or your other rows, and anything not on this list cannot be encoded because there is nowhere
 * to put it. The redaction is structural rather than a filter someone has to remember to run.
 */
export function buildLink(input: {
  what: string
  at: number
  currency: Currency
  totalMinor: number
  from: string
  people: readonly LinkParticipant[]
  payTo?: string
}): LedgerLink {
  return {
    v: LINK_VERSION,
    what: input.what.slice(0, 80),
    at: input.at,
    currency: input.currency,
    totalMinor: Math.round(input.totalMinor),
    from: input.from.slice(0, 40),
    people: input.people.map((p) => ({
      name: p.name.slice(0, 40),
      owedMinor: Math.round(p.owedMinor),
    })),
    ...(input.payTo ? { payTo: input.payTo.slice(0, 60) } : {}),
  }
}

export function encodeLink(link: LedgerLink, codec: LinkCodec): string {
  return codec.encode(JSON.stringify(link))
}

/**
 * Read a link, or say why not.
 *
 * Never throws. A malformed fragment is something a stranger pasted, and the only correct
 * response is a page that explains rather than a stack trace or, worse, a half-rendered split
 * with one name missing.
 */
export function decodeLink(
  fragment: string,
  codec: LinkCodec,
): { readonly ok: true; readonly link: LedgerLink } | { readonly ok: false; readonly reason: string } {
  const trimmed = fragment.replace(/^#/, '').trim()
  if (trimmed.length === 0) return { ok: false, reason: 'The link has nothing in it.' }

  let parsed: unknown
  try {
    parsed = JSON.parse(codec.decode(trimmed))
  } catch {
    return { ok: false, reason: 'This link is damaged — it may have been cut short in a message.' }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'This link is not a split.' }
  }

  const link = parsed as Partial<LedgerLink>
  if (typeof link.v !== 'number') return { ok: false, reason: 'This link is not a split.' }
  if (link.v > LINK_VERSION) {
    return {
      ok: false,
      reason: 'This link was made by a newer version of RASEED than this page knows about.',
    }
  }
  if (
    typeof link.what !== 'string' ||
    typeof link.at !== 'number' ||
    typeof link.totalMinor !== 'number' ||
    typeof link.from !== 'string' ||
    !Array.isArray(link.people) ||
    (link.currency !== 'INR' && link.currency !== 'AED')
  ) {
    return { ok: false, reason: 'This link is missing something it needs.' }
  }

  const people = link.people.filter(
    (p): p is LinkParticipant =>
      typeof p === 'object' &&
      p !== null &&
      typeof (p as LinkParticipant).name === 'string' &&
      typeof (p as LinkParticipant).owedMinor === 'number',
  )
  if (people.length !== link.people.length) {
    return { ok: false, reason: 'This link is missing something it needs.' }
  }

  return { ok: true, link: { ...(link as LedgerLink), people } }
}

/** What the link sums to, so a reader can check it against the bill rather than trusting it. */
export function linkTotals(link: LedgerLink): {
  readonly owedToSender: number
  readonly senderShare: number
} {
  const owedToSender = link.people.reduce((a, p) => a + p.owedMinor, 0)
  return { owedToSender, senderShare: link.totalMinor - owedToSender }
}
