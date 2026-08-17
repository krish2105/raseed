'use client'

import { ArrowRight, CircleCheck, Clock, Layers, Quote, ShieldCheck } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

/**
 * The hero, in the new idiom.
 *
 * The reference's vocabulary, RASEED's content and RASEED's colour law. Everything that is
 * *chrome* — badge, primary button, meter, icon tiles, the answer chips — is `--accent`.
 * Everything that is *money* stays brass or verdigris, because a figure has to tell you which
 * country it came from before it tells you anything else.
 *
 * The right-hand card is not a decorative mock. It states the one thing this product knows that
 * a bank does not: what a transfer between two countries actually cost, measured against
 * mid-market, with its sources named the way a citation names them.
 */
export function Hero() {
  const reduceMotion = useReducedMotion()

  /**
   * Supporting content rises in. `data-reveal` so the no-JS rule in `globals.css` forces it
   * visible if the bundle never arrives — the copy matters more than the entrance.
   */
  const rise = (delay: number) =>
    reduceMotion
      ? { 'data-reveal': true }
      : {
          'data-reveal': true,
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
        }

  return (
    <section className="relative overflow-hidden">
      {/*
        The grid. Two repeating-linear-gradients over the ground, in `--line` so it re-resolves
        with the theme, and masked to fade out before the section ends — a grid that runs to a
        hard edge reads as a table, not as depth.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--line) 1px, transparent 1px), linear-gradient(to bottom, var(--line) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(120% 90% at 50% 0%, black 35%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(120% 90% at 50% 0%, black 35%, transparent 75%)',
        }}
      />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
        <div>
          <motion.span
            {...rise(0)}
            className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent"
          >
            <span className="size-1.5 rounded-full bg-accent" />
            Local-first · dual-currency · no server
          </motion.span>

          {/*
            The headline does not fade in, and that is deliberate twice over.

            It is the LCP element: an `<h1>` that starts at `opacity: 0` is not painted until
            its animation runs, which is precisely the render-delay problem this project already
            measured on the mobile Lighthouse run. And a hero whose text only exists after a
            requestAnimationFrame is invisible anywhere rAF is throttled — a backgrounded tab,
            a slow device, a crawler. It renders, then the supporting content arrives around it.
          */}
          <h1
            className="mt-7 font-display text-[clamp(2.5rem,6.5vw,4.5rem)] leading-[0.95] font-semibold tracking-[-0.035em] text-balance"
          >
            Money that lives between{' '}
            <span className="text-inr">India</span> and <span className="text-aed">the UAE</span>.
          </h1>

          {/*
            The lede does not fade in either, for the same reason the headline does not — and
            this one was found the hard way. With the `<h1>` painting immediately, *this*
            paragraph became the LCP element, and because it started at `opacity: 0` its render
            delay was 3.4s of a 3.9s LCP. Mobile performance fell from 94 to 88 on that alone.
            The rule that came out of it: above the fold, nothing large and textual animates in.
            Chrome may arrive; the words are already there.
          */}
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-text-lo">
            Every amount is an integer in minor units with its FX rate{' '}
            <span className="font-medium text-inr">frozen at transaction date</span>, so changing
            your home currency never rewrites history. The analysis runs in your browser and on
            your phone — there is no server to send it to.
          </p>

          <motion.div {...rise(0.18)} className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="/overview"
              className="group inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0 focus-visible:outline-none"
            >
              Open the dashboard
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#how"
              className="inline-flex items-center rounded-xl border border-line bg-surface-1 px-5 py-3 text-sm font-medium transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              How it works
            </a>
          </motion.div>

          <motion.ul {...rise(0.24)} className="mt-7 flex flex-wrap gap-x-6 gap-y-2">
            {['Nothing leaves the device', 'One definition of what counts as spend'].map((line) => (
              <li key={line} className="flex items-center gap-2 text-[13px] text-text-lo">
                <CircleCheck size={15} className="text-accent" aria-hidden />
                {line}
              </li>
            ))}
          </motion.ul>
        </div>

        {/* ── the answer card ───────────────────────────────────────────── */}
        <motion.div
          {...rise(0.16)}
          className="rounded-2xl border border-line bg-surface-1 p-5 shadow-[var(--shadow-2)]"
        >
          <div className="flex justify-end">
            <span className="rounded-xl bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-ink">
              What did my transfers actually cost?
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Chip icon={<Layers size={13} />}>On device</Chip>
            <Chip icon={<ShieldCheck size={13} />} accent>
              v_spend
            </Chip>
            <span className="ml-auto flex items-center gap-3 font-mono text-[11px] text-text-lo">
              <span className="flex items-center gap-1">
                <Clock size={12} /> 41ms
              </span>
              <span className="flex items-center gap-1">
                <Quote size={12} /> 3 transfers
              </span>
            </span>
          </div>

          <p className="mt-4 text-[15px] leading-relaxed">
            Three transfers moved{' '}
            <span className="tabular font-mono font-medium text-aed">AED 9,400</span> to{' '}
            <span className="tabular font-mono font-medium text-inr">₹2,18,530</span>. Mid-market
            would have been <span className="tabular font-mono font-medium">₹2,20,930</span>, so
            the spread cost you{' '}
            <span className="tabular font-mono font-semibold text-warn">₹2,400</span>
            <Cite n={1} />.
          </p>

          <div className="mt-5">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="flex items-center gap-1.5 text-text-lo">
                <CircleCheck size={13} className="text-accent" aria-hidden />
                Corridor efficiency
              </span>
              <span className="tabular font-mono font-medium">98.9%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                className="h-full origin-left rounded-full bg-accent"
                style={{ width: '98.9%' }}
                initial={reduceMotion ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.9, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {['[1] ADCB · 12 Aug · 22.98', '[2] HDFC in · 13 Aug'].map((source) => (
              <span
                key={source}
                className="tabular rounded-lg border border-line px-2.5 py-1 font-mono text-[11px] text-text-lo"
              >
                {source}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function Chip({
  children,
  icon,
  accent = false,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  accent?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium',
        accent ? 'bg-accent/12 text-accent' : 'bg-surface-2 text-text-lo',
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/** A citation marker, the reference's one genuinely borrowed idea — a figure that names its row. */
function Cite({ n }: { n: number }) {
  return (
    <span className="ml-1 inline-flex size-[18px] translate-y-px items-center justify-center rounded-full bg-accent/15 align-middle font-mono text-[10px] font-semibold text-accent">
      {n}
    </span>
  )
}
