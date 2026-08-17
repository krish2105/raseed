const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

/**
 * Metro, taught about the monorepo.
 *
 * There was no config here at all, and the shared packages resolved anyway — `pnpm` with
 * `node-linker=hoisted` leaves symlinks in `apps/mobile/node_modules/@raseed/*` that Metro
 * happens to follow. That worked for six packages and then did not for the seventh: adding
 * `@raseed/i18n` produced "could not be found within the project", and a cache clear did not
 * help, because the problem was never the cache.
 *
 * `CLAUDE.md` has said this the whole time — *"Next needs `transpilePackages`; Metro needs
 * `watchFolders`"*. The web side had its half. This is the half the phone was missing, and it
 * was invisible for as long as nobody added a package.
 *
 * Two settings, and both are needed:
 *
 *   - **`watchFolders`** puts the workspace root inside Metro's world, so files under
 *     `packages/*` are watched and served rather than treated as outside the project.
 *   - **`nodeModulesPaths`** tells the resolver where to look, in order — the app first, then
 *     the root. Without it a package that exists only at the root resolves in `tsc` and not in
 *     the bundler, which is the most confusing possible split.
 */
const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
// The shared packages ship TypeScript source with no build step, so the bundler is what
// compiles them — it must not prefer a stale `main` field over the real files.
config.resolver.disableHierarchicalLookup = false

module.exports = config
