'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { ArrowRight, ShieldCheck, Wallet } from 'lucide-react'

import { decodeLink, linkTotals, type LedgerLink } from '@raseed/engines'
import { format, money } from '@raseed/money'

/**
 * The other side of a Ledger Link.
 *
 * The person opening this has not installed anything and has no account. Everything they see is
 * decoded from the URL fragment in their own browser — the fragment is never sent to a server,
 * so this page renders data the server has never seen and could not log if it wanted to.
 *
 * It therefore has to work as a *stranger's* page: it explains what it is, states plainly that
 * nothing was uploaded, and shows the arithmetic rather than only the number owed, because the
 * one thing someone wants when told they owe money is to check it.
 */
/**
 * The fragment, read as what it is: a value that lives outside React.
 *
 * `useSyncExternalStore` rather than an effect that calls `setState`, which is both the
 * idiomatic way to read a browser value and the only one that does not trip the cascading-render
 * rule. It also gives a server snapshot for free, so prerendering has a defined answer instead
 * of touching `window` and hoping.
 */
function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

const CODEC = {
  encode: (s: string) => s,
  decode: (s: string) =>
    decodeURIComponent(
      atob(s.replaceAll('-', '+').replaceAll('_', '/'))
        .split('')
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(''),
    ),
}

export function SplitClient() {
  const hash = useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash,
    // The server has no fragment and never will — that is the whole point of the feature, so
    // the server snapshot is empty rather than pretending.
    () => '',
  )

  const state: { status: 'reading' } | { status: 'ok'; link: LedgerLink } | { status: 'bad'; reason: string } =
    hash === ''
      ? { status: 'reading' }
      : (() => {
          const result = decodeLink(hash, CODEC)
          return result.ok
            ? ({ status: 'ok', link: result.link } as const)
            : ({ status: 'bad', reason: result.reason } as const)
        })()

  if (state.status === 'reading') {
    return (
      <div className="rounded-2xl border border-line bg-surface-1 p-6">
        <h1 className="font-display text-xl font-semibold tracking-tight">Nothing to open</h1>
        <p className="mt-2 text-sm leading-relaxed text-text-lo">
          A split link carries the whole split after the <code className="font-mono">#</code>.
          This address has no fragment, so there is nothing here to show — which also means
          nothing was sent to a server to find that out.
        </p>
      </div>
    )
  }

  if (state.status === 'bad') {
    return (
      <div className="rounded-2xl border border-line bg-surface-1 p-6">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          This link did not open
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-text-lo">{state.reason}</p>
        <p className="mt-4 text-sm leading-relaxed text-text-lo">
          Ask whoever sent it to send it again — the whole split travels inside the link, so a
          link that arrives cut short cannot be recovered from this end.
        </p>
      </div>
    )
  }

  const { link } = state
  const totals = linkTotals(link)
  const amount = (minor: number) => format(money(minor, link.currency))

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface-1 p-6">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-2.5 py-1 text-[11px] font-medium text-accent">
          <ShieldCheck size={11} aria-hidden />
          Nothing was uploaded to open this
        </span>

        <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">{link.what}</h1>
        <p className="mt-1.5 text-sm text-text-lo">
          {link.from} paid{' '}
          <span className="tabular font-mono">{amount(link.totalMinor)}</span> on{' '}
          {new Date(link.at).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          .
        </p>

        <ul className="mt-6 divide-y divide-line border-y border-line">
          {link.people.map((p) => (
            <li key={p.name} className="flex items-baseline justify-between gap-3 py-3">
              <span className="text-sm">{p.name}</span>
              <span className="tabular font-mono text-sm font-medium">{amount(p.owedMinor)}</span>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-3 py-3 text-text-lo">
            <span className="text-sm">{link.from}&rsquo;s own share</span>
            <span className="tabular font-mono text-sm">{amount(totals.senderShare)}</span>
          </li>
        </ul>

        {/* The arithmetic, not just the answer. Being told you owe money without being shown
            how it was arrived at is the fastest way to a disagreement. */}
        <p className="mt-4 text-xs leading-relaxed text-text-lo">
          {amount(totals.owedToSender)} owed across {link.people.length}{' '}
          {link.people.length === 1 ? 'person' : 'people'}, plus {link.from}&rsquo;s{' '}
          {amount(totals.senderShare)}, adds up to the {amount(link.totalMinor)} bill.
        </p>

        {link.payTo && (
          <p className="mt-4 flex items-center gap-2 text-sm">
            <Wallet size={15} className="text-accent" aria-hidden />
            Settle to <span className="font-mono">{link.payTo}</span>
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-surface-1 p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">
          How this reached you
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-lo">
          The whole split is encoded in the part of the link after the <code className="font-mono">#</code>.
          Browsers never send that to a server, so this page was rendered from data that never
          touched one — there is no row here to leak, because there is no row.
        </p>
        <Link
          href="/"
          className="group mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1 focus-visible:outline-none"
        >
          What is RASEED?
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  )
}
