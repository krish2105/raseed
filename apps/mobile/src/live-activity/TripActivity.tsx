import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui'
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers'
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets'

/**
 * The trip on the Lock Screen. `MOBILE_ARCHITECTURE.md` F15's last clause.
 *
 * **This component runs in an isolated runtime, and that constraint shapes everything here.**
 * Code under the `'widget'` directive is compiled into a separate bundle inside the widget
 * extension. It gets no React hooks, no app state, no async work, and only `@expo/ui/swift-ui`
 * components. Every value it renders arrives through `props`.
 *
 * Two consequences worth stating, because both look like sloppiness otherwise:
 *
 * 1. **The money arrives pre-formatted.** `format()` from `@raseed/money` cannot be called here,
 *    so the app formats and passes strings. That is the right direction anyway — it means the
 *    Lock Screen renders the exact characters the app renders, rather than a second formatter
 *    that could round differently and put two different numbers on one phone.
 * 2. **The colours arrive as props.** The widget runtime cannot read a theme, and a hex literal
 *    here would be the one place in the app outside `@raseed/tokens` that owns a colour. So the
 *    app reads the palette and passes it in, and the design rule holds across the process
 *    boundary too.
 *
 * `isLuminanceReduced` is the always-on display. The screen is dimmed and the refresh rate is
 * cut, so the tinted accent loses contrast; the near-white ink from the DARK palette is the
 * legible choice, whatever theme the app itself is in when open.
 */

export type TripActivityProps = {
  /** The trip's name, as you typed it. */
  name: string
  /** Pre-formatted by `@raseed/money` in the app — never assembled here. */
  spent: string
  /** Pre-formatted. Empty string when there is no budget, which is a real state. */
  remaining: string
  /** Pre-formatted per-day rate. */
  burn: string
  dayLabel: string
  /** True once projected spend passes the envelope — the only thing that changes the colour. */
  over: boolean
  /** From `@raseed/tokens`, passed in because the widget runtime cannot read the theme. */
  accent: string
  warn: string
  /** Ink for the dimmed always-on display, which is always a dark surface. */
  dimInk: string
}

const TripActivity = (props: TripActivityProps, environment: LiveActivityEnvironment) => {
  'widget'

  // Dimmed always-on display: the tint loses contrast against the dimmed screen, so the near-
  // white ink wins. Still a token — the always-on display is a dark surface, and `text-hi` from
  // the dark palette is exactly the ink for one. Writing `#FFFFFF` here would have made this the
  // only hex literal in the mobile app outside `@raseed/tokens`.
  const tint = environment.isLuminanceReduced
    ? props.dimInk
    : props.over
      ? props.warn
      : props.accent

  return {
    banner: (
      <VStack modifiers={[padding({ all: 14 })]}>
        <HStack>
          <Text modifiers={[font({ size: 13 }), foregroundStyle(tint)]}>{props.name}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 13 }), foregroundStyle(tint)]}>{props.dayLabel}</Text>
        </HStack>
        <HStack>
          <Text modifiers={[font({ weight: 'bold', size: 28 })]}>{props.spent}</Text>
          <Spacer />
        </HStack>
        <HStack>
          {/* Empty string when there is no budget — the row simply carries the burn rate alone
              rather than printing a placeholder for a number that does not exist. */}
          <Text modifiers={[font({ size: 12 })]}>{props.remaining}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 12 })]}>{props.burn}</Text>
        </HStack>
      </VStack>
    ),

    // The compact island is roughly two words wide. The trip's name loses to the figure —
    // you know where you are; what you do not know is what it has cost.
    compactLeading: <Image systemName="airplane" color={tint} />,
    compactTrailing: <Text modifiers={[foregroundStyle(tint)]}>{props.spent}</Text>,
    minimal: <Image systemName="airplane" color={tint} />,

    expandedLeading: (
      <VStack modifiers={[padding({ all: 10 })]}>
        <Image systemName="airplane" color={tint} />
        <Text modifiers={[font({ size: 12 })]}>{props.name}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack modifiers={[padding({ all: 10 })]}>
        <Text modifiers={[font({ weight: 'bold', size: 20 })]}>{props.spent}</Text>
        <Text modifiers={[font({ size: 12 })]}>{props.dayLabel}</Text>
      </VStack>
    ),
    expandedBottom: (
      <VStack modifiers={[padding({ all: 10 })]}>
        <Text modifiers={[font({ size: 13 })]}>{props.remaining}</Text>
        <Text modifiers={[font({ size: 12 })]}>{props.burn}</Text>
      </VStack>
    ),
  }
}

export default createLiveActivity('TripActivity', TripActivity)
