import { useCallback, useSyncExternalStore } from 'react'
import * as SecureStore from 'expo-secure-store'

/**
 * The consent ledger (S9).
 *
 * **This app has very little to ask consent for, and saying so is more honest than inventing
 * things to tick.** Nothing leaves the device: no analytics, no crash reporting, no model, no
 * server. A consent screen listing choices that do not exist is theatre, and theatre is how
 * consent screens became something everyone clicks through without reading.
 *
 * So there are two entries, and one of them is not yet available:
 *
 *   - **The lifestyle layer**, which is real and off by default. `lifestyleMaySpeak()` in the
 *     tone engine already refuses to speak without it. Under the UAE PDPL and comparable
 *     regimes, inferring something health-adjacent from spending creates sensitive personal
 *     data whether or not the user ever mentioned it — so this is opt-in, and supportive mode
 *     suspends it entirely regardless.
 *   - **Sync**, which does not exist yet. It is listed as unavailable rather than hidden,
 *     because the moment it does exist it must not be switched on by a migration.
 *
 * A ledger, not a boolean: each entry records **when** it changed and **which version** of the
 * wording was agreed to. "They consented" without a date and a version is not a record of
 * anything, and the version is what makes a later re-ask honest rather than sneaky.
 */

export const CONSENT_VERSION = 1

export type ConsentKey = 'lifestyle' | 'sync'

export interface ConsentEntry {
  readonly granted: boolean
  /** Epoch ms of the last change. Null when never touched. */
  readonly at: number | null
  /** The wording version agreed to. A newer version means asking again. */
  readonly version: number
}

export interface ConsentRecord {
  readonly lifestyle: ConsentEntry
  readonly sync: ConsentEntry
}

const KEY = 'raseed.consent.v1'

const NEVER: ConsentEntry = { granted: false, at: null, version: CONSENT_VERSION }
const DEFAULTS: ConsentRecord = { lifestyle: NEVER, sync: NEVER }

let record: ConsentRecord = DEFAULTS
let hydrated = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function read(): ConsentRecord {
  try {
    const raw = SecureStore.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>
    return {
      lifestyle: parsed.lifestyle ?? NEVER,
      sync: parsed.sync ?? NEVER,
    }
  } catch {
    // An unreadable consent record resolves to "not granted", which is the only safe direction
    // for this particular failure to fall.
    return DEFAULTS
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!hydrated) {
    hydrated = true
    record = read()
    emit()
  }
  return () => listeners.delete(listener)
}

const snapshot = () => record

export function useConsent(): {
  consent: ConsentRecord
  setConsent: (key: ConsentKey, granted: boolean, now: number) => void
} {
  const consent = useSyncExternalStore(subscribe, snapshot, snapshot)

  const setConsent = useCallback((key: ConsentKey, granted: boolean, now: number) => {
    record = { ...record, [key]: { granted, at: now, version: CONSENT_VERSION } }
    emit()
    try {
      SecureStore.setItem(KEY, JSON.stringify(record))
    } catch {
      // The UI has already moved; a keychain failure reverts on next launch, which is visible.
    }
  }, [])

  return { consent, setConsent }
}

/** Read outside React — the tone gate needs this and is not a component. */
export function lifestyleGranted(): boolean {
  return read().lifestyle.granted
}

/** Withdrawing everything is part of the right, not a separate feature. */
export function withdrawAllConsent(now: number): void {
  record = {
    lifestyle: { granted: false, at: now, version: CONSENT_VERSION },
    sync: { granted: false, at: now, version: CONSENT_VERSION },
  }
  emit()
  try {
    SecureStore.setItem(KEY, JSON.stringify(record))
  } catch {
    // Same reasoning as above.
  }
}
