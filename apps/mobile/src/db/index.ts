import { useSyncExternalStore } from 'react'
import { migrate } from './migrations'
import { isSeeded, seed } from './seed'

export * from './client'
export * from './queries'
export { migrate, dropAll } from './migrations'
export { seed, isSeeded } from './seed'

/**
 * A deliberately tiny reactive layer.
 *
 * op-sqlite is synchronous over JSI, so reads are cheap enough to redo on every render
 * pass — there is no async cache to invalidate and no query library needed. Writes bump a
 * version and every subscribed screen re-reads.
 *
 * Legend-State and the Supabase sync plugin arrive when there is a second device. At n=1
 * they would be complexity paid for and not used.
 */
let version = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = () => version

/** Call after any write so subscribed screens re-read. */
export function notifyChanged(): void {
  version += 1
  for (const listener of listeners) listener()
}

/**
 * Re-runs `read` whenever the database changes.
 *
 * The server snapshot is the same read: this app has no SSR, and returning a different
 * value there would be a lie rather than a safety net.
 *
 * KNOWN BUG — see DECISIONS.md, "the read that lags one write". After a write, every read
 * on this connection returns the pre-write state until the process restarts. It is not this
 * hook: the version does increment and the component does re-render.
 */
export function useQuery<T>(read: () => T): T {
  useSyncExternalStore(subscribe, snapshot, snapshot)
  return read()
}

let ready = false

/** Idempotent. Runs migrations, seeds reference data on first launch only. */
export function initDatabase(): void {
  if (ready) return
  migrate()
  if (!isSeeded()) seed()
  ready = true
}
