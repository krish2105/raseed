import Link from 'next/link'
import { ArrowRight, Ban, Building2, Calculator, ScanLine, Scale, Wallet } from 'lucide-react'

import { format } from '@raseed/money'

import { ThemeToggle } from '@/components/shell/theme-toggle'
import { SmoothScroll } from '@/components/landing/smooth-scroll'
import { Reveal, SplitLine } from '@/components/landing/kinetic-heading'
import { Hero } from '@/components/landing/hero'
import { MerchantMarquee } from '@/components/landing/marquee'
import { ledger, spend30, subscriptions, concentration, vSpend } from '@/lib/demo'

/**
 * The landing route.
 *
 * Rebuilt in the FinCopilot direction: a masked grid ground, pill badges, one accent for chrome
 * and hairline-bordered cards on a bento grid. What is *not* borrowed is the colour law — money
 * keeps its temperature, because a dual-currency product whose figures are all one colour has
 * thrown away the only thing that makes it different.
 *
 * Every figure on this page is computed from the seeded ledger at build time by `lib/demo`, not
 * typed in. A landing page that quotes numbers its own product did not produce is the first
 * thing an engineer checks and the fastest way to lose them.
 */

const STEPS = [
  {
    icon: ScanLine,
    title: 'Capture',
    body: 'Type a line, photograph a receipt, or import a bank CSV. Apple Vision reads the receipt on the phone; the parser proposes and the sheet commits. Nothing is written without you seeing it.',
  },
  {
    icon: Scale,
    title: 'Reconcile',
    body: 'Merchants resolve through a learned alias table. Transfers, refunds and remittances are typed, not guessed, so the same rupee is never counted twice.',
  },
  {
    icon: Calculator,
    title: 'Understand',
    body: 'DuckDB-WASM runs the analysis in your tab and SQLite runs it on your phone. Same engines, same predicate, no request leaves the device.',
  },
]

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
  const merchants = ledger.merchants.map((m) => m.canonical_name)

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <SmoothScroll />

      {/* ── nav ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-surface-0/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5 focus-visible:outline-none">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-lg bg-accent text-accent-ink"
            >
              <Wallet size={15} />
            </span>
            <span className="font-display text-[15px] font-semibold tracking-tight">RASEED</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-text-lo sm:flex">
            <a href="#how" className="transition-colors hover:text-text-hi">
              How it works
            </a>
            <a href="#what" className="transition-colors hover:text-text-hi">
              What it does
            </a>
            <a href="#limits" className="transition-colors hover:text-text-hi">
              Limitations
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <Link
              href="/overview"
              className="group inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-ink transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0 focus-visible:outline-none"
            >
              Open workspace
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <Hero />

        <MerchantMarquee items={merchants} />

        {/* ── how it works ──────────────────────────────────────────────── */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
          <Reveal>
            <h2 className="text-center font-display text-[clamp(1.6rem,3.2vw,2.25rem)] font-semibold tracking-tight">
              <SplitLine text="Capture, reconcile, understand" />
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-text-lo">
              Three steps, and the third one never leaves the device. The engines that compute
              your figures are the same package on both surfaces, so the phone and the dashboard
              cannot disagree about a number.
            </p>
          </Reveal>

          <ul className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <Reveal
                key={step.title}
                as="li"
                delay={i * 0.08}
                className="relative rounded-2xl border border-line bg-surface-1 p-6"
              >
                {/*
                  Full-strength `--text-lo`, not `/70`.
                  The token clears 4.5:1 by design; the opacity modifier dragged it to 3.04 on
                  white and 4.23 on the dark card, and axe caught both. An opacity modifier on
                  a colour token silently opts out of the contrast gate that token exists to
                  pass — which is the whole reason the sweep runs on every route in both themes.
                */}
                <span className="absolute top-5 right-5 font-mono text-xs text-text-lo">
                  0{i + 1}
                </span>
                <span
                  aria-hidden
                  className="grid size-10 place-items-center rounded-xl bg-accent/12 text-accent"
                >
                  <step.icon size={19} />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-lo">{step.body}</p>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ── the numbers, from the ledger itself ───────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 pb-20">
          <Reveal>
            <dl className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Demo ledger', value: `${vSpend.length.toLocaleString('en-IN')} rows` },
                { label: 'Spanning', value: `${ledger.meta.months} months` },
                { label: 'Last 30 days', value: format(spend30, { compactZeroFraction: true }) },
                { label: 'Merchant Gini', value: concentration.toFixed(2) },
              ].map((stat) => (
                <div key={stat.label} className="bg-surface-1 p-5">
                  <dt className="text-xs text-text-lo">{stat.label}</dt>
                  <dd className="tabular mt-1.5 font-mono text-xl font-medium">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </section>

        {/* ── what it does · bento ──────────────────────────────────────── */}
        <section id="what" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
          <Reveal>
            <h2 className="font-display text-[clamp(1.6rem,3.2vw,2.25rem)] font-semibold tracking-tight">
              <SplitLine text="Four documented ways trackers fail here" />
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-lo">
              Every one of these produces a plausible number, which is why they survive. Each is
              answered in the schema rather than in a heuristic.
            </p>
          </Reveal>

          <ul className="mt-10 grid gap-4 lg:grid-cols-2">
            {PROBLEMS.map((p, i) => (
              <Reveal
                key={p.failure}
                as="li"
                delay={i * 0.06}
                className="rounded-2xl border border-line bg-surface-1 p-6"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/10 px-2.5 py-1 text-[11px] font-medium text-warn">
                  <Ban size={11} aria-hidden />
                  {p.failure}
                </span>
                <p className="mt-4 font-mono text-xs break-words text-text-lo">{p.reality}</p>
                <p className="mt-3.5 text-sm leading-relaxed">{p.answer}</p>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ── it already finds things ───────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 pb-20">
          <Reveal className="rounded-2xl border border-line bg-surface-1 p-6 md:p-8">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-2.5 py-1 text-[11px] font-medium text-accent">
              <Building2 size={11} aria-hidden />
              Detected, not configured
            </span>
            <h2 className="mt-4 font-display text-xl font-semibold tracking-tight">
              Recurring charges the ledger found on its own
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-lo">
              Interval coefficient of variation under 0.15, amounts within 10%, at least three
              observations — no merchant list, no rules file.
            </p>

            <ul className="mt-6 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
              {subscriptions.slice(0, 3).map((s) => {
                const merchant = ledger.merchants.find((m) => m.id === s.merchantId)
                return (
                  <li key={s.merchantId} className="bg-surface-1 p-4">
                    <p className="text-sm font-medium">{merchant?.canonical_name ?? s.merchantId}</p>
                    <p className="tabular mt-1 font-mono text-xs text-text-lo">
                      every {Math.round(s.periodDays)} days · {s.occurrences} seen
                    </p>
                  </li>
                )
              })}
            </ul>
          </Reveal>
        </section>

        {/* ── honest limitations ────────────────────────────────────────── */}
        <section id="limits" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
          <Reveal>
            <h2 className="font-display text-[clamp(1.6rem,3.2vw,2.25rem)] font-semibold tracking-tight">
              <SplitLine text="Honest limitations" />
            </h2>
          </Reveal>
          <ul className="mt-7 flex max-w-3xl flex-col gap-3">
            {LIMITS.map((l, i) => (
              <Reveal key={l} as="li" delay={i * 0.05} className="flex gap-3 text-sm text-text-lo">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-text-lo" />
                {l}
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ── close ─────────────────────────────────────────────────────── */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <h2 className="font-display text-[clamp(1.8rem,4vw,3rem)] font-semibold tracking-tight text-balance">
                It runs on the seeded ledger right now.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-text-lo">
                No sign-up, no account, no request to a server. Open it and every figure computes
                in your browser from {vSpend.length.toLocaleString('en-IN')} rows.
              </p>
              <Link
                href="/overview"
                className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0 focus-visible:outline-none"
              >
                Open the dashboard
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Reveal>
          </div>
        </section>

        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-text-lo">
            <span>RASEED — a dual-currency ledger for money between India and the UAE.</span>
            <a
              href="https://github.com/krish2105"
              className="transition-colors hover:text-text-hi focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              Source
            </a>
          </div>
        </footer>
      </main>
    </div>
  )
}
