import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia'

/**
 * Ninety days at a glance, with the outliers marked.
 *
 * Deliberately no axes, no grid and no numbers: at this size they would be unreadable, and the
 * figures that matter are spelled out in the sentence beneath. The line answers "what shape
 * has this been", and the dots answer "which days were strange" — anything more precise
 * belongs on the dashboard.
 *
 * Zero days are real data points, not gaps. A fortnight of no spending should read as a flat
 * run along the floor, because that is what happened.
 */
export function Sparkline({
  values,
  highlight = [],
  color,
  accent,
  height = 56,
}: {
  values: readonly number[]
  /** Indices to mark — outliers from the MAD z-score. */
  highlight?: readonly number[]
  color: string
  accent: string
  height?: number
}) {
  const [w, setW] = useState(0)

  const { line, dots } = useMemo(() => {
    if (w === 0 || values.length < 2) return { line: null, dots: [] as { x: number; y: number }[] }

    const max = Math.max(...values, 1)
    const pad = 4
    const usableH = height - pad * 2
    const x = (i: number) => (i / (values.length - 1)) * w
    const y = (v: number) => pad + usableH - (v / max) * usableH

    const p = Skia.Path.Make()
    p.moveTo(x(0), y(values[0]!))
    for (let i = 1; i < values.length; i++) p.lineTo(x(i), y(values[i]!))

    return {
      line: p,
      dots: highlight
        .filter((i) => i >= 0 && i < values.length)
        .map((i) => ({ x: x(i), y: y(values[i]!) })),
    }
  }, [values, highlight, w, height])

  return (
    <View
      style={[styles.wrap, { height }]}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Daily spending over ${values.length} days, with ${highlight.length} unusual ${highlight.length === 1 ? 'day' : 'days'} marked`}
    >
      {w > 0 && line && (
        <Canvas style={StyleSheet.absoluteFill}>
          <Path path={line} style="stroke" strokeWidth={1.5} color={color} strokeJoin="round" />
          {dots.map((d, i) => (
            <Circle key={i} cx={d.x} cy={d.y} r={2.5} color={accent} />
          ))}
        </Canvas>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { width: '100%', marginTop: 8 },
})
