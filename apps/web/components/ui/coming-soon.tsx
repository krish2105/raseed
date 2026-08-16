import { Panel } from '@/components/ui/panel'

/**
 * An honest placeholder. Names the session that fills it in and what it will contain,
 * rather than showing an empty chart frame that looks broken.
 */
export function ComingSoon({
  title,
  session,
  children,
}: {
  title: string
  session: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        <p className="mt-1.5 text-sm text-text-lo">Lands in {session}.</p>
      </header>
      <Panel>
        <div className="text-sm text-text-lo">{children}</div>
      </Panel>
    </div>
  )
}
