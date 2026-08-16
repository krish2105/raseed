'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { ingestDemo, type IngestTiming } from './ingest'

/**
 * Loads DuckDB-WASM after first paint and ingests the demo ledger.
 *
 * Deliberately not in a Suspense boundary during SSR: the ~3MB bundle must not block the
 * first render, so the page paints its skeletons and this fills them in.
 *
 * Session 22 adds the `live` path (a paginated Supabase read into the same tables). The
 * demo path is the one a recruiter with no login hits, so it ships first.
 */

export type DuckStatus = 'loading' | 'ready' | 'error'

interface DuckState {
  status: DuckStatus
  timing: IngestTiming | null
  error: string | null
  /** Bumped after a re-ingest so consumers re-read. */
  version: number
  reload: (rows?: number) => void
}

const DuckContext = createContext<DuckState | null>(null)

export function DuckProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DuckStatus>('loading')
  const [timing, setTiming] = useState<IngestTiming | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [requestedRows, setRequestedRows] = useState<number | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    // No setState here: the initial state is already 'loading', and `reload` resets it from
    // the event handler. Setting it synchronously inside the effect triggers a cascading
    // render, which the compiler rejects.
    ingestDemo(requestedRows)
      .then((result) => {
        if (cancelled) return
        setTiming(result)
        setStatus('ready')
        setVersion((v) => v + 1)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        // Surface the real message. An analytics failure that renders as an empty chart is
        // indistinguishable from "you have no data", which is the worse of the two.
        setError(cause instanceof Error ? cause.message : String(cause))
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [requestedRows])

  return (
    <DuckContext.Provider
      value={{
        status,
        timing,
        error,
        version,
        reload: (rows) => {
          setStatus('loading')
          setError(null)
          setRequestedRows(rows)
        },
      }}
    >
      {children}
    </DuckContext.Provider>
  )
}

export function useDuck(): DuckState {
  const context = useContext(DuckContext)
  if (!context) throw new Error('useDuck must be used inside <DuckProvider>')
  return context
}

/**
 * Runs `read` once DuckDB is ready, and again whenever the data version changes.
 * Returns `null` while loading so callers can render a skeleton at final dimensions.
 */
export function useDuckQuery<T>(read: () => Promise<T>, deps: readonly unknown[] = []): T | null {
  const { status, version } = useDuck()
  const [data, setData] = useState<T | null>(null)

  useEffect(() => {
    if (status !== 'ready') return
    let cancelled = false
    void read().then((result) => {
      if (!cancelled) setData(result)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, version, ...deps])

  return data
}
