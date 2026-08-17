import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { format } from '@raseed/money'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { SmoothScroll } from '@/components/landing/smooth-scroll'
import { KineticHeading, Reveal, SplitLine } from '@/components/landing/kinetic-heading'
import { ledger, spend30, subscriptions, concentration, vSpend } from '@/lib/demo'

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

const LIMITS = [
  'No Account Aggregator. RBI’s framework needs a licensed Financial Information User; a solo developer cannot legally integrate it.',
  'iOS cannot read SMS, and Android SMS parsing is a Play policy review nobody wants.',
  'FX is mid-market, so remittance efficiency is an estimate unless you enter the real rate.',
  'In-browser analytics tops out around a few million rows. Fine for a personal ledger, wrong for enterprise.',
  'Not investment advice, and no trading features — that is regulated by SEBI and the SCA.',
]

export default function Landing() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <SmoothScroll />

      {/* A single wash of currency temperature behind the fold. transform/opacity only, and
          it is decorative, so it is hidden from assistive tech. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] opacity-[0.10]"
        style={{
          background:
            'radial-gradient(60% 50% at 20% 0%, var(--inr) 0%, transparent 70%), radial-gradient(50% 45% at 85% 10%, var(--aed) 0%, transparent 70%)',
        }}
      />

      <header className="relative mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-5">
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

      <main className="relative mx-auto max-w-5xl px-6">
        <section className="flex min-h-[78vh] flex-col justify-center border-b border-line py-16">
          <p className="font-mono text-xs tracking-[0.2em] text-text-lo uppercase">
            रसीद · رسيد · receipt
          </p>

          <KineticHeading>
            Money that lives
            <br />
            between <span className="text-inr">India</span> and{' '}
            <span className="text-aed">the UAE</span>.
          </KineticHeading>

          <Reveal delay={0.15} onMount>
            <p className="mt-7 max-w-xl text-[15px] leading-relaxed text-text-lo">
              A dual-currency expense tracker and analytical dashboard. Every amount is stored
              in integer minor units with its FX rate frozen at transaction date, so changing
              your home currency never rewrites history.
            </p>
          </Reveal>

          <Reveal delay={0.25} onMount>
            <dl className="mt-12 flex flex-wrap gap-x-12 gap-y-6">
              {[
                { label: 'Demo ledger', value: `${vSpend.length.toLocaleString('en-IN')} rows` },
                { label: 'Spanning', value: `${ledger.meta.months} months` },
                { label: 'Last 30 days', value: format(spend30, { compactZeroFraction: true }) },
                { label: 'Merchant Gini', value: concentration.toFixed(2) },
              ].map((s) => (
                <div key={s.label}>
                  <dt className="text-xs text-text-lo">{s.label}</dt>
                  <dd className="tabular mt-1.5 font-mono text-lg">{s.value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </section>

        <section className="py-20">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            <SplitLine text="Four documented ways trackers fail here" />
          </h2>
          <ul className="mt-9 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
            {PROBLEMS.map((p, i) => (
              <Reveal key={p.failure} as="li" delay={i * 0.06} className="h-full bg-surface-1 p-6">
                <h3 className="text-sm font-medium">{p.failure}</h3>
                <p className="mt-2.5 font-mono text-xs break-words text-text-lo">{p.reality}</p>
                <p className="mt-3.5 text-sm text-text-lo">{p.answer}</p>
              </Reveal>
            ))}
          </ul>
        </section>

        <section className="border-t border-line py-20">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            <SplitLine text="It already finds things" />
          </h2>
          <Reveal delay={0.1}>
            <p className="mt-3 max-w-xl text-sm text-text-lo">
              Detected from the seeded ledger by{' '}
              <code className="font-mono">@raseed/engines</code> — interval coefficient of
              variation under 0.15, amounts within 10%.
            </p>
          </Reveal>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {subscriptions.slice(0, 3).map((s, i) => {
              const merchant = ledger.merchants.find((m) => m.id === s.merchantId)
              return (
                <Reveal key={s.merchantId} delay={i * 0.08}>
                  <div className="relative overflow-hidden rounded-xl border border-line bg-surface-1 p-5">
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-0.5"
                      style={{ background: s.currency === 'AED' ? 'var(--aed)' : 'var(--inr)' }}
                    />
                    <p className="text-sm font-medium">
                      {merchant?.canonical_name ?? s.merchantId}
                    </p>
                    <p className="tabular mt-2 font-mono text-xl">
                      {format({ minor: s.amountMinor, currency: s.currency })}
                    </p>
                    <p className="tabular mt-1 font-mono text-xs text-text-lo">
                      every {s.periodDays.toFixed(0)} days
                    </p>
                    {s.priceChange && (
                      <p className="tabular mt-3 font-mono text-xs text-warn">
                        went up{' '}
                        {format({
                          minor: s.priceChange.annualDeltaMinor,
                          currency: s.currency,
                        })}
                        /year
                      </p>
                    )}
                  </div>
                </Reveal>
              )
            })}
          </div>
        </section>

        <section className="border-t border-line py-20">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            <SplitLine text="Honest limitations" />
          </h2>
          <ul className="mt-7 flex max-w-2xl flex-col gap-3">
            {LIMITS.map((l, i) => (
              <Reveal key={l} as="li" delay={i * 0.05} className="flex gap-3 text-sm text-text-lo">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-text-lo" />
                {l}
              </Reveal>
            ))}
          </ul>
        </section>

        <section className="border-t border-line py-20">
          <Reveal>
            <Link
              href="/overview"
              className="group inline-flex items-center gap-3 focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none"
            >
              <span className="font-display text-2xl font-semibold tracking-tight">
                Open the dashboard
              </span>
              <ArrowRight
                aria-hidden
                className="h-6 w-6 transition-transform group-hover:translate-x-1"
              />
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className="relative border-t border-line">
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
