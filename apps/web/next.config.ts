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

  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
}

/**
 * Security headers (S6).
 *
 * The whole app is static and client-side — no API routes, no server actions, no outbound
 * calls — so most of this is about what a compromised dependency could do, not about
 * protecting a backend there isn't one of.
 *
 * **The CSP below is NOT applied, and the constant is kept deliberately.** Enabling it loads
 * the page, serves the DuckDB worker and .wasm (both 200), reports **zero** console
 * violations — and never finishes instantiating, so the dashboard sits on its loading state
 * for ever.
 *
 * A second session bisected it properly. Recorded so the next attempt starts from data rather
 * than from theory:
 *
 *   - maximally permissive CSP (`default-src *` etc.)  → READY. So it IS the policy.
 *   - blob-URL worker replaced with a direct same-origin Worker → still blocked.
 *     (Kept anyway: the blob wrapper only existed because the script used to be cross-origin,
 *     and removing it is simpler regardless.)
 *   - `connect-src` removed                            → still blocked.
 *   - `default-src` AND `connect-src` removed          → still blocked.
 *   - `upgrade-insecure-requests` removed              → still blocked.
 *
 * So the blocker is among script-src / worker-src / child-src / style-src / img-src /
 * font-src / object-src / base-uri / form-action / frame-ancestors, and Chromium reports
 * nothing for it. Next step is to bisect that remaining set one directive at a time, and to
 * check whether the failure reproduces over HTTPS — every run above was against a local HTTP
 * server, which is not how it will ship.
 *
 * A CSP that silently empties every figure on a finance dashboard is worse than no CSP.
 *
 * What ships is the rest, which is verified and carries no such risk. Notes on the CSP for
 * whoever picks it up:
 *
 * **`wasm-unsafe-eval`.** DuckDB-WASM compiles WebAssembly, which a default CSP blocks
 * outright. The narrow directive permits exactly that and nothing else — a blanket
 * `unsafe-eval`, which would also re-enable `eval()` and `new Function()`, is deliberately
 * absent. This is the tension `RASEED_SECURITY_ARCHITECTURE.md` G11 names.
 *
 * **`blob:` in script-src and worker-src.** Both DuckDB and the Comlink analytics worker are
 * instantiated from blob URLs (`lib/duck/client.ts` builds one). Without this the dashboard
 * loads and then computes nothing, which is a worse failure than an obvious one.
 *
 * **`'unsafe-inline'` in script-src, and it is a real weakening.** `next-themes` injects an
 * inline script to set the theme before first paint, and Next's hydration bootstrap is inline
 * too. Removing it means nonces, which means middleware on every request — currently there is
 * no middleware at all. Recorded as a known gap rather than quietly accepted: the honest
 * upgrade is a nonce-based policy, and it is worth doing when middleware exists for another
 * reason. Note `style-src` needs it regardless for the theme's inline custom properties.
 */
/** Not yet applied — see above. Kept so the work is not lost. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: data:",
  // A blob-URL worker inherits this document's policy, and DuckDB's worker calls
  // importScripts() and then compiles WASM from inside it. child-src is the legacy fallback
  // some engines still consult for workers; declaring both costs nothing and removes a
  // whole class of "works here, blank there".
  "worker-src 'self' blob: data:",
  "child-src 'self' blob: data:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // No third party is contacted by design; blob: and data: cover the local worker bootstrap.
  "connect-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Belt and braces with X-Frame-Options — frame-ancestors is the one modern browsers honour.
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  // The web surface asks for none of these. The phone is where the camera lives.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
]

export default nextConfig
