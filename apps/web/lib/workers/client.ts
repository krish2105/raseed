import * as Comlink from 'comlink'
import type { ComputeApi } from './compute.worker'
import { computeForecast, type ForecastInput, type ForecastOutput } from './forecast-core'
import { buildIngest, type IngestPayload, type IngestRequest } from './ingest-core'

/**
 * The main thread's handle on the compute worker.
 *
 * One worker for the tab's lifetime. Spawning per call would pay module instantiation —
 * `apache-arrow` is not small — on every lens change. It is idle between calls and costs
 * nothing to keep.
 *
 * Every call falls back to running inline if the worker cannot be created. A browser that
 * refuses workers should cost you some dropped frames, not the page. The fallback calls the
 * identical function, so the two paths cannot produce different numbers.
 */
let remote: Comlink.Remote<ComputeApi> | null = null

/** Set once a spawn has failed, so we do not retry the failure on every call. */
let unavailable = false

function spawn(): Comlink.Remote<ComputeApi> | null {
  if (unavailable) return null
  if (remote) return remote
  try {
    // `new URL(..., import.meta.url)` is the form both Turbopack and webpack detect
    // statically to emit the worker chunk. A variable path silently produces no chunk.
    const worker = new Worker(new URL('./compute.worker.ts', import.meta.url), {
      type: 'module',
      name: 'raseed-compute',
    })
    remote = Comlink.wrap<ComputeApi>(worker)
    return remote
  } catch {
    unavailable = true
    return null
  }
}

function fellBack(): null {
  unavailable = true
  remote = null
  return null
}

/** True when the last call actually ran off the main thread. */
export interface OffThread {
  offMainThread: boolean
}

export async function runForecast(input: ForecastInput): Promise<ForecastOutput & OffThread> {
  const api = spawn()
  if (api) {
    try {
      return { ...(await api.computeForecast(input)), offMainThread: true }
    } catch {
      fellBack()
    }
  }
  return { ...computeForecast(input), offMainThread: false }
}

export async function runIngest(request: IngestRequest): Promise<IngestPayload & OffThread> {
  const api = spawn()
  if (api) {
    try {
      return { ...(await api.buildIngest(request)), offMainThread: true }
    } catch {
      fellBack()
    }
  }
  return { ...buildIngest(request), offMainThread: false }
}
