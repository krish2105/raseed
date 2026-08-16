import { ComingSoon } from '@/components/ui/coming-soon'

export const metadata = { title: 'Ledger · RASEED' }

export default function Page() {
  return (
    <ComingSoon title="Ledger" session="session 8">
      The full transaction table, virtualised for 100k rows, reading Arrow columns straight out of DuckDB-WASM.
    </ComingSoon>
  )
}
