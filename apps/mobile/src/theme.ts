import { useColorScheme } from 'react-native'
import { palette, type Palette, type ThemeName } from '@raseed/tokens'

/**
 * The single place the mobile app resolves colours.
 *
 * Everything comes from @raseed/tokens, so a hex literal never appears in a screen. Session
 * 6's web toggle and this hook read the same palette — change brass once and both products
 * change.
 */
/**
 * The phone is light. The dashboard keeps both.
 *
 * Not an oversight and not a limitation — a deliberate split. The dashboard is a screen you
 * sit at for a long stretch, often in a dim room, and dark earns its place there. The phone
 * comes out in daylight, in a queue, for four seconds, and a light surface is simply easier
 * to read at arm's length outdoors. Following the system setting on the phone would give a
 * dark app to everyone who runs their phone dark for messaging, which is most people, in
 * the one context where dark helps least.
 *
 * `useColorScheme` is deliberately still imported and read, so switching this back to
 * system-following is a one-line change rather than an archaeology exercise.
 */
export function useTheme(): { colors: Palette; scheme: ThemeName } {
  void useColorScheme()
  const scheme: ThemeName = 'light'
  return { colors: palette[scheme], scheme }
}

/** Font families, matching the names registered in _layout.tsx. */
export const font = {
  display: 'Jakarta',
  displayBold: 'JakartaBold',
  body: 'Geist',
  bodyMedium: 'GeistMedium',
  mono: 'GeistMono',
  monoMedium: 'GeistMonoMedium',
} as const
