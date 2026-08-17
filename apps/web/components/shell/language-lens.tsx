'use client'

import { useLocale } from '@/components/shell/locale-store'

/**
 * The language control, beside the currency lens it deliberately is not.
 *
 * The currency lens is in the URL because it changes what the numbers mean. This is not, because
 * it changes what the labels say — and a shared link should not impose the sharer's language on
 * whoever opens it. See `locale-store.ts`.
 *
 * Real `<button>`s in a `radiogroup`, not a select: two options, both worth showing, and the
 * active one has to be visible at a glance rather than behind a click.
 */
export function LanguageLens() {
  const { locale, setLocale } = useLocale()

  return (
    <div
      role="radiogroup"
      aria-label="Language"
      className="flex items-center gap-0.5 rounded-md border border-line p-0.5"
    >
      {(
        [
          { value: 'en', label: 'EN', full: 'English' },
          { value: 'ar', label: 'ع', full: 'العربية' },
        ] as const
      ).map((option) => {
        const active = locale === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.full}
            onClick={() => setLocale(option.value)}
            className={`rounded px-2 py-0.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              active ? 'bg-accent text-accent-ink' : 'text-text-lo hover:text-text-hi'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
