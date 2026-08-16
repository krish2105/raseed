import * as Comlink from 'comlink'
import { computeForecast } from './forecast-core'
import { buildIngest, type IngestRequest } from './ingest-core'

/**
 * One worker for both jobs.
 *
 * Two workers would mean two module instantiations and two copies of `apache-arrow`, to
 * separate a ~10ms job from an ~840ms one that never run at the same time. One worker with
 * two methods is the smaller thing that solves it.
 *
 * Comlink turns `postMessage` into an awaited method call, which is what keeps the analytics
 * layer reading as ordinary async code rather than an id-keyed message table.
 */
const api = {
  computeForecast,

  /**
   * Arrow IPC bytes are transferred, not cloned.
   *
   * Three `ArrayBuffer`s move to the main thread with zero copies. Returning
   * `arrow.Table`s instead would structured-clone every typed array inside them and hand
   * back most of the time the worker just saved.
   */
  buildIngest(request: IngestRequest) {
    const payload = buildIngest(request)
    return Comlink.transfer(payload, [
      payload.transactions.buffer,
      payload.categories.buffer,
      payload.merchants.buffer,
    ])
  },
}

export type ComputeApi = typeof api

Comlink.expose(api)
