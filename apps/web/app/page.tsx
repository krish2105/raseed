import { aiPlaceholder } from '@raseed/ai'
import { safeToSpend } from '@raseed/engines'
import { generateLedger } from '@raseed/fixtures'
import { allocate, format, fromMajor, formatMinor } from '@raseed/money'
import { schemaPlaceholder } from '@raseed/schema'
import { fontFamily } from '@raseed/tokens'
import { AmountCard } from '@/components/ui/amount-card'

const sts = safeToSpend({
  liquidBalance: fromMajor('30000.00', 'INR'),
  committedBills: [fromMajor('12000.00', 'INR')],
  pendingSweeps: [fromMajor('2000.00', 'INR')],
  safetyBuffer: fromMajor('3000.00', 'INR'),
  rawCarryover: fromMajor('400.00', 'INR'),
  spentToday: fromMajor('260.00', 'INR'),
  today: 1_755_300_000_000,
  nextIncomeAt: 1_755_300_000_000 + 10 * 86_400_000,
})

const inr = sts.amount
const demo = generateLedger({ endAt: 1_755_300_000_000 })
const aed = fromMajor('92.50', 'AED')

// The S1 criterion, rendered rather than asserted: 100 minor units, three ways.
const split = allocate(fromMajor('1.00', 'INR'), 3)

const packages = [
  { name: '@raseed/money', value: formatMinor(inr) },
  { name: '@raseed/tokens', value: fontFamily.display },
  { name: '@raseed/schema', value: schemaPlaceholder() },
  { name: '@raseed/engines', value: `safe to spend ${formatMinor(sts.amount)}` },
  { name: '@raseed/ai', value: aiPlaceholder() },
  { name: '@raseed/fixtures', value: `${demo.transactions.length} txns seeded` },
]

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">RASEED</h1>
        <p className="mt-2 text-sm text-text-lo">
          Session 1 — <code className="font-mono">@raseed/money</code> and{' '}
          <code className="font-mono">@raseed/tokens</code>. Every colour below resolves from a CSS
          variable; every figure is formatted from integer minor units.
        </p>
      </header>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <AmountCard label="Safe to spend today" amount={inr} />
        <AmountCard label="Safe to spend today" amount={aed} />
      </section>

      <section className="mt-10 rounded-xl border border-line bg-surface-1 p-5">
        <h2 className="text-sm font-medium">Splitting ₹1.00 three ways</h2>
        <p className="mt-1 text-sm text-text-lo">
          <code className="font-mono">allocate()</code> distributes the remainder a paisa at a time,
          so the parts always sum back to the whole.
        </p>
        <div className="tabular mt-3 flex flex-wrap items-center gap-2 font-mono text-sm">
          {split.map((part, i) => (
            <span key={i} className="rounded-md border border-line bg-surface-2 px-2 py-1">
              {format(part)}
            </span>
          ))}
          <span className="text-text-lo">= {format(fromMajor('1.00', 'INR'))}</span>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium text-text-lo">Shared packages resolved</h2>
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface-1">
          {packages.map((pkg) => (
            <li key={pkg.name} className="flex items-center justify-between gap-4 px-4 py-3">
              <code className="font-mono text-sm">{pkg.name}</code>
              <span className="tabular font-mono text-sm text-text-lo">{pkg.value}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
