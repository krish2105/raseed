import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { InteractionManager } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { migratePlaintextIfPresent } from './client'
import type { MigrationResult } from './migrateToEncrypted'
import { migrate } from './migrations'
import { isSeeded, seed } from './seed'

export * from './client'
export * from './encryption'
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
 * Commit a write from a screen that is about to be dismissed.
 *
 * The fix for the bug that took a whole session to corner. Writing *before* `router.back()`
 * puts the notification on a tree that `react-native-screens` has frozen underneath the
 * modal, where the update is dropped rather than queued — and the screen never loses focus
 * either, so no focus effect rescues it. The home screen was left permanently one write
 * behind, and the next write painted the previous one.
 *
 * Running the write after the dismissal animation is the guarantee: by then the destination
 * screen is live, focused and thawed, so both the write and the notification land on a tree
 * that can actually re-render. Everything measured pointed away from the database — one
 * connection, and an INSERT visible to a SELECT on the very next statement — and this is
 * where it pointed instead.
 */
export function commitAfterDismiss(write: () => void): void {
  InteractionManager.runAfterInteractions(() => {
    write()
    notifyChanged()
  })
}

/**
 * Re-runs `read` whenever the database changes, and again whenever the screen is focused.
 *
 * The focus half is the important half, and it took a long time to earn.
 *
 * The reads were never stale. One module instance, one connection, and an INSERT is visible
 * to a `SELECT` on the very next statement — all three measured. What was stale was the
 * *render*: `react-native-screens` freezes a screen while another is presented over it, and
 * an update delivered to a frozen subtree can be dropped rather than queued. So the store
 * notified, nothing re-rendered, and the next notification painted the previous state —
 * which is exactly the off-by-one-write signature.
 *
 * Subscribing to the store alone cannot fix that, because the store is not the thing that
 * failed. Re-reading on focus is, because focus is the moment the screen thaws.
 */
export function useQuery<T>(read: () => T): T {
  const version = useSyncExternalStore(subscribe, snapshot, snapshot)

  // A counter rather than a boolean: focusing twice must re-read twice, and a boolean that
  // is already `true` changes nothing on the second focus.
  const [focusTick, setFocusTick] = useState(0)
  useFocusEffect(
    useCallback(() => {
      setFocusTick((t) => t + 1)
    }, []),
  )

  // The version and the focus tick are threaded through as real dependencies. Discarding
  // them — which the first version of this hook did — leaves nothing in the code connecting
  // the store to the query, and a memoising compiler is then entirely within its rights to
  // serve the previous rows forever. Screens that read the ledger also carry `use no memo`;
  // this is the belt to that pair of braces.
  // `version` and `focusTick` are deliberately dependencies that `read` does not close
  // over. The rule is correct that it cannot see them used — and that blindness is exactly
  // the bug: the store drives this query through the database, not through the closure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => read(), [version, focusTick, read])
}

let ready = false

/** What the last plaintext-to-encrypted migration did. Read by the privacy screen. */
let lastMigration: MigrationResult = { status: 'nothing-to-do', verified: {} }

export function encryptionMigration(): MigrationResult {
  return lastMigration
}

/**
 * Idempotent. Moves a plaintext ledger across if one exists, then migrates and seeds.
 *
 * The order is load-bearing: the encrypted file must receive the old rows **before** `migrate()`
 * creates empty tables in it, or the copy lands on top of a schema that already exists and the
 * ledger is gone in the least recoverable way there is.
 */
export function initDatabase(): void {
  if (ready) return
  lastMigration = migratePlaintextIfPresent()
  migrate()
  if (!isSeeded()) seed()
  ready = true
}
