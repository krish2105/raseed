/**
 * What a panel shows when its query failed.
 *
 * The failing message is visible, not swallowed. An analytics error rendered as an empty
 * chart is indistinguishable from "you have no data" — and a skeleton that never resolves
 * is indistinguishable from a slow network.
 */
export function PanelError({ message }: { message: string }) {
  return (
    <div>
      <p className="text-sm text-warn">This panel could not be computed.</p>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-surface-0 p-2.5 font-mono text-[11px] leading-relaxed text-text-lo">
        {message}
      </pre>
    </div>
  )
}
