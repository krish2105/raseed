import { useMemo } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { Canvas, Path, Skia, SweepGradient, vec } from '@shopify/react-native-skia'

import { useTheme } from '@/theme'

/**
 * The Day Dial.
 *
 * One arc, drawn once per render, replacing the flat progress bar. The arc reads as an
 * amount of day remaining rather than a percentage of a budget consumed, which is the
 * difference between "you have spent 62%" and "you have this much left" — the same number,
 * and only one of them is usable at a glance.
 *
 * Skia rather than SVG because the gradient sweeps along the arc, and because this redraws
 * on every keystroke of a new expense. It draws no text: the figure is real, selectable,
 * accessible React Native text sitting inside the ring, not pixels in a canvas.
 */

/** Leaves a gap at the bottom so the ring reads as a gauge, not a pie. */
const SWEEP = 270
const START = 135

export function DayDial({
  progress,
  overspent,
  size,
  children,
}: {
  /** 0–1. Clamped, because a 130% day should fill the ring, not wrap around it. */
  progress: number
  overspent: boolean
  size?: number
  children?: React.ReactNode
}) {
  const { colors } = useTheme()
  const { width } = useWindowDimensions()

  // The dial is the hero, so it scales with the screen instead of being pinned to one size.
  const dim = size ?? Math.min(260, Math.max(180, width - 96))
  const stroke = Math.round(dim * 0.075)
  const radius = (dim - stroke) / 2
  const clamped = Math.min(1, Math.max(0, progress))

  const { track, filled } = useMemo(() => {
    const box = Skia.XYWHRect(stroke / 2, stroke / 2, dim - stroke, dim - stroke)

    const t = Skia.Path.Make()
    t.addArc(box, START, SWEEP)

    const f = Skia.Path.Make()
    // A zero-length arc still paints a round cap — a dot at the start reads as "something
    // was spent" when nothing was.
    if (clamped > 0.001) f.addArc(box, START, SWEEP * clamped)

    return { track: t, filled: f }
  }, [dim, stroke, clamped])

  const accent = overspent ? colors.warn : colors.inr

  return (
    <View style={{ width: dim, height: dim }}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Path
          path={track}
          style="stroke"
          strokeWidth={stroke}
          strokeCap="round"
          color={colors['surface-2']}
        />
        {clamped > 0.001 && (
          <Path path={filled} style="stroke" strokeWidth={stroke} strokeCap="round">
            {/* Currency is a temperature: the sweep runs from the away currency into the
                home one, so the ring carries the same colour language as every figure. */}
            <SweepGradient
              origin={vec(dim / 2, dim / 2)}
              c={vec(dim / 2, dim / 2)}
              colors={[accent, overspent ? colors.warn : colors.aed, accent]}
            />
          </Path>
        )}
      </Canvas>

      {/* Real text, inside the ring. Screen readers and text selection both work, which they
          would not if the number were painted into the canvas. */}
      <View style={[StyleSheet.absoluteFill, styles.centre]} pointerEvents="box-none">
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
})
