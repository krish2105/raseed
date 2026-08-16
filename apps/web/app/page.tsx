import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { format } from '@raseed/money'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { ledger, spend30, vSpend } from '@/lib/demo'

const PROBLEMS = [
  {
    failure: 'Opaque merchants',
    reality: 'razorpay@hdfcbank · CARREF MALL EMIRT AE',
    answer: 'A resolver with a learned alias table. Learned once, then free forever.',
  },
  {
    failure: 'P2P treated as spend',
    reality: 'Sending ₹5,000 to a friend counts as an expense',
    answer: 'Explicit transfer and settlement types, excluded from the spend predicate.',
  },
  {
    failure: 'Refund double-count',
    reality: 'A failed debit and its refund become two transactions',
    answer: 'Reversal pairing collapses them into one net event.',
  },
  {
    failure: 'Cross-border double-count',
    reality: 'AED→INR shows as spend in AED and income in INR',
    answer: 'Remittance objects link both legs. Neither counts as spend.',
  },
]

export default function Landing() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-5">
        <span className="font-display text-[15px] font-semibold tracking-tight">RASEED</span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/overview"
            className="inline-flex items-center gap-1.5 rounded-lg bg-text-hi px-3 py-1.5 text-sm font-medium text-surface-0 transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
          >
            <span className="hidden sm:inline">Open the dashboard</span>
            <span className="sm:hidden">Dashboard</span>
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="border-b border-line py-16 md:py-24">
          <p className="font-mono text-xs tracking-[0.18em] text-text-lo uppercase">
            रसीद · رسيد · receipt
          </p>
          <h1 className="font-display mt-5 text-[clamp(2.5rem,7vw,4.5rem)] leading-[0.95] font-semibold tracking-[-0.03em]">
            Money that lives
            <br />
            between <span className="text-inr">India</span> and{' '}
            <span className="text-aed">the UAE</span>.
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-text-lo">
            A dual-currency expense tracker and analytical dashboard. Every amount is stored in
            integer minor units with its FX rate frozen at transaction date, so changing your home
            currency never rewrites history.
          </p>

          <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-5">
            {[
              { label: 'Demo ledger', value: `${vSpend.length.toLocaleString('en-IN')} rows` },
              { label: 'Spanning', value: `${ledger.meta.months} months` },
              { label: 'Last 30 days', value: format(spend30, { compactZeroFraction: true }) },
            ].map((s) => (
              <div key={s.label}>
                <dt className="text-xs text-text-lo">{s.label}</dt>
                <dd className="tabular mt-1 font-mono text-lg">{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="py-16">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Four documented ways trackers fail here
          </h2>
          <ul className="mt-8 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
            {PROBLEMS.map((p) => (
              <li key={p.failure} className="bg-surface-1 p-5">
                <h3 className="text-sm font-medium">{p.failure}</h3>
                <p className="mt-2 font-mono text-xs break-words text-text-lo">{p.reality}</p>
                <p className="mt-3 text-sm text-text-lo">{p.answer}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-line py-16">
          <h2 className="font-display text-xl font-semibold tracking-tight">Honest limitations</h2>
          <ul className="mt-5 flex max-w-2xl list-disc flex-col gap-2.5 pl-5 text-sm text-text-lo">
            <li>
              No Account Aggregator. RBI&apos;s AA framework needs a licensed Financial Information
              User; a solo developer cannot legally integrate it.
            </li>
            <li>
              iOS cannot read SMS, and Android SMS parsing is a Play policy review nobody wants.
            </li>
            <li>
              FX is mid-market, so remittance efficiency is an estimate unless you enter the real
              rate.
            </li>
            <li>
              The in-browser analytics ceiling is a few million rows. Fine for a personal ledger,
              wrong for enterprise.
            </li>
            <li>
              Not investment advice, and no trading features — that is regulated activity under
              SEBI and the SCA.
            </li>
          </ul>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-text-lo">
          <span>Built by Krishna Mathur</span>
          <a
            href="https://github.com/krish2105/raseed"
            className="underline underline-offset-4 hover:text-text-hi focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
          >
            github.com/krish2105/raseed
          </a>
        </div>
      </footer>
    </div>
  )
}
