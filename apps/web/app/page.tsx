import { aiPlaceholder } from '@raseed/ai'
import { enginesPlaceholder } from '@raseed/engines'
import { fixturesPlaceholder } from '@raseed/fixtures'
import { formatMinor } from '@raseed/money'
import { schemaPlaceholder } from '@raseed/schema'
import { tokensPlaceholder } from '@raseed/tokens'
import { AmountCard } from '@/components/ui/amount-card'

// Every shared package is imported and called here. This page exists to prove the
// workspace wiring is real — if any @raseed/* import were fake, this would not build.
const packages = [
  { name: '@raseed/money', value: formatMinor(74000, 'INR') },
  { name: '@raseed/tokens', value: tokensPlaceholder() },
  { name: '@raseed/schema', value: schemaPlaceholder() },
  { name: '@raseed/engines', value: enginesPlaceholder() },
  { name: '@raseed/ai', value: aiPlaceholder() },
  { name: '@raseed/fixtures', value: fixturesPlaceholder() },
]

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">RASEED</h1>
        <p className="mt-2 text-sm text-text-lo">
          Session 0 — monorepo scaffold. Both amounts below are formatted by{' '}
          <code className="font-mono">@raseed/money</code>.
        </p>
      </header>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <AmountCard label="Safe to spend today" minor={74000} currency="INR" />
        <AmountCard label="Safe to spend today" minor={9250} currency="AED" />
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
