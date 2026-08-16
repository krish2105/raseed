import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Root config, used by packages/*. Each app owns its own config:
//   apps/web    -> eslint-config-next
//   apps/mobile -> eslint-config-expo
export default defineConfig([
  globalIgnores(['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.expo/**', 'apps/**']),
  js.configs.recommended,
  ...tseslint.configs.recommended,
])
