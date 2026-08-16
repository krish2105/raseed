import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Turbopack transpiles workspace packages automatically, but the shared packages ship
  // TypeScript source with no build step, so the list is stated explicitly per CLAUDE.md.
  // Keep in sync with packages/*.
  transpilePackages: [
    '@raseed/ai',
    '@raseed/engines',
    '@raseed/fixtures',
    '@raseed/money',
    '@raseed/schema',
    '@raseed/tokens',
  ],
}

export default nextConfig
