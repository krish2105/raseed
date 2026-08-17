import type { ConfigContext, ExpoConfig } from 'expo/config'

import { palette } from '@raseed/tokens'

/**
 * The last hex literal in the mobile app, removed.
 *
 * `CLAUDE.md`: *"Zero hex literals outside `@raseed/tokens`. Grep for `#` before declaring any UI
 * session done."* Every screen had honoured that for months while `app.json` sat on
 * `"backgroundColor": "#0F1419"` — the splash screen, which is the very first surface anyone sees.
 * It survived because static JSON cannot import anything, so the rule was unenforceable there
 * rather than ignored.
 *
 * `app.config.ts` receives the parsed `app.json` as `config` and returns it modified, so this is
 * an override rather than a rewrite: everything else still lives in the JSON, where it is easy to
 * read, and only the value that needed a token comes from here.
 *
 * The dark ground is deliberate and stays dark in both themes. A splash is a held frame before
 * React has mounted and before any theme preference has been read from the keychain — flashing
 * white and then resolving to dark is worse than opening dark either way.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const plugins = (config.plugins ?? []).map((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
      ? ['expo-splash-screen', { ...plugin[1], backgroundColor: palette.dark['surface-0'] }]
      : plugin,
  )

  return { ...config, plugins } as ExpoConfig
}
