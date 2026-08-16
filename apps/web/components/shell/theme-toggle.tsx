'use client'

import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const

/**
 * Three states, not a binary switch — "system" is a real choice, and collapsing it into a
 * toggle silently overrides the OS preference the first time someone clicks.
 *
 * Renders a placeholder of identical dimensions until mounted: `theme` is unknowable on the
 * server, so reading it during render is a hydration mismatch waiting to happen.
 */
const subscribe = () => () => {}

/**
 * True only after hydration. useSyncExternalStore rather than setState-in-an-effect: the
 * server snapshot is false and the client snapshot is true, so React resolves it during
 * hydration instead of scheduling a second render pass.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useHydrated()

  if (!mounted) {
    return <div aria-hidden className="h-8 w-[102px] rounded-lg border border-line bg-surface-1" />
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-1 p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex h-7 w-8 items-center justify-center rounded-md transition-colors',
              'focus-visible:ring-2 focus-visible:ring-inr focus-visible:outline-none',
              active
                ? 'bg-surface-2 text-text-hi'
                : 'text-text-lo hover:bg-surface-2 hover:text-text-hi',
            )}
          >
            <Icon aria-hidden className="h-4 w-4" />
          </button>
        )
      })}
    </div>
  )
}
