import { ComingSoon } from '@/components/ui/coming-soon'

export const metadata = { title: 'Flows · RASEED' }

export default function Page() {
  return (
    <ComingSoon title="Flows" session="session 12">
      The Cash Flow Sankey — income entering from the left, splitting through categories, whatever survives arriving at savings on the right. Flow totals must reconcile to <code className="font-mono">v_spend</code> to the minor unit.
    </ComingSoon>
  )
}
