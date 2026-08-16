import { useColorScheme } from 'react-native'
import { palette, type Palette, type ThemeName } from '@raseed/tokens'

/**
 * The single place the mobile app resolves colours.
 *
 * Everything comes from @raseed/tokens, so a hex literal never appears in a screen. Session
 * 6's web toggle and this hook read the same palette — change brass once and both products
 * change.
 */
export function useTheme(): { colors: Palette; scheme: ThemeName } {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark'
  return { colors: palette[scheme], scheme }
}

/** Font families, matching the names registered in _layout.tsx. */
export const font = {
  display: 'Bricolage',
  displayBold: 'BricolageBold',
  body: 'Geist',
  bodyMedium: 'GeistMedium',
  mono: 'GeistMono',
  monoMedium: 'GeistMonoMedium',
} as const
