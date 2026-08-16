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

  /**
   * The nonce is load-bearing, not decoration.
   *
   * `reload()` is almost always called with no argument, so keying the effect on the row
   * count alone meant setting `undefined` over `undefined`: React bails out on the
   * identical value, the effect never re-runs, and `status` stays `'loading'` for the rest
   * of the session. Adding an expense left every figure stale and disabled the Add button
   * behind it. A fresh object each time makes the re-ingest unconditional.
   */
  const [request, setRequest] = useState<{ rows?: number; nonce: number }>({ nonce: 0 })

  useEffect(() => {
    let cancelled = false

    // No setState here: the initial state is already 'loading', and `reload` resets it from
    // the event handler. Setting it synchronously inside the effect triggers a cascading
    // render, which the compiler rejects.
    ingestDemo(request.rows)
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
  }, [request])

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
          setRequest((r) => ({ rows, nonce: r.nonce + 1 }))
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

export interface DuckQueryResult<T> {
  data: T | null
  /** Non-null when this specific query failed. */
  error: string | null
}

/**
 * Runs `read` once DuckDB is ready, and again whenever the data version changes.
 *
 * `data` is null while loading so callers can render a skeleton at final dimensions — but
 * a rejected query MUST set `error`, otherwise a failing panel renders a skeleton forever
 * and looks like a slow load rather than a broken one. That is exactly how the
 * TIMESTAMPTZ→DATE cast bug hid: the console had the error, the UI just kept pulsing.
 */
export function useDuckQuery<T>(
  read: () => Promise<T>,
  deps: readonly unknown[] = [],
): DuckQueryResult<T> {
  const { status, version } = useDuck()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'ready') return
    let cancelled = false

    read()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : String(cause))
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, version, ...deps])

  return { data, error }
}
