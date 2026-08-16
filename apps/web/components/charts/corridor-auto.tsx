'use client'

import { useCallback, useState } from 'react'

import { Corridor, type CorridorFlow } from './corridor'
import { CorridorGL } from './corridor-gl'

/**
 * WebGL when the machine can, CSS 3D when it cannot.
 *
 * The fallback is not a courtesy. WebGL is unavailable on locked-down enterprise browsers, in
 * some VMs, behind certain privacy extensions, and whenever a driver is blocklisted — and it
 * can also be lost mid-session on GPU reset. A corridor that silently disappears in those
 * cases is worse than one that quietly downgrades, because the tile is the thing the whole
 * app is about.
 *
 * `CorridorGL` reports failure rather than rendering an empty canvas, and this swaps to the
 * CSS version on the same frame. Both read the identical `CorridorFlow[]`, so the numbers in
 * the caption never depend on which renderer drew the picture.
 */
export function CorridorAuto({
  flows,
  className,
}: {
  flows: readonly CorridorFlow[]
  className?: string
}) {
  const [webglOut, setWebglOut] = useState(false)
  const fallback = useCallback(() => setWebglOut(true), [])

  if (webglOut) return <Corridor flows={flows} className={className} />
  return <CorridorGL flows={flows} className={className} onUnsupported={fallback} />
}
