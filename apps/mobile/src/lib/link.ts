import { Share } from 'react-native'

import { buildLink, encodeLink, type LinkCodec, type LinkParticipant } from '@raseed/engines'
import type { Currency } from '@raseed/money'

/**
 * Ledger Link, from the phone.
 *
 * `@raseed/engines` owns the format and refuses to know what a `Buffer` is, so the codec is
 * passed in from here. React Native has `Buffer` via its Node shims; the browser has `btoa`.
 * One format, two platforms, and the pure package stays pure.
 */

const BASE = 'https://raseed-eosin.vercel.app/split'

export const codec: LinkCodec = {
  encode: (utf8) =>
    Buffer.from(utf8, 'utf8')
      .toString('base64')
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, ''),
  decode: (b64) =>
    Buffer.from(b64.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8'),
}

export function splitUrl(input: {
  what: string
  at: number
  currency: Currency
  totalMinor: number
  from: string
  people: readonly LinkParticipant[]
  payTo?: string
}): string {
  // The fragment, not the path. A browser never sends what follows the `#` to a server, so the
  // split is readable by the recipient and by nobody in between.
  return `${BASE}#${encodeLink(buildLink(input), codec)}`
}

/**
 * Hand it to the system share sheet.
 *
 * Deliberately the OS sheet rather than a copy-to-clipboard: the person choosing where this
 * goes should be choosing in their own UI, with their own apps, and RASEED should not be
 * holding a URL containing names and amounts on the clipboard afterwards.
 */
export async function shareSplit(url: string, what: string): Promise<void> {
  await Share.share({ message: `${what} — here is the split: ${url}`, url })
}
