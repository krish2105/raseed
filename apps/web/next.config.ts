import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Turbopack transpiles workspace packages automatically, but the shared packages ship
  // TypeScript source with no build step, so the list is stated explicitly per CLAUDE.md.
  // Keep in sync with packages/*.
  transpilePackages: [
    '@raseed/ai',
    '@raseed/engines',
    '@raseed/fixtures',
    '@raseed/i18n',
    '@raseed/money',
    '@raseed/schema',
    '@raseed/tokens',
  ],

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [...SECURITY_HEADERS, { key: 'Content-Security-Policy', value: CSP }],
      },
    ]
  },
}

/**
 * Security headers (S6).
 *
 * The whole app is static and client-side — no API routes, no server actions, no outbound
 * calls — so most of this is about what a compromised dependency could do, not about
 * protecting a backend there isn't one of.
 *
 * **The CSP now ships.** It was off for two sessions because enabling it left the dashboard on
 * its loading state for ever while reporting *zero* console violations — the worst possible
 * failure signature, because there was nothing to search for.
 *
 * Both halves of that mystery turned out to be the same mistake.
 *
 * **The blocker is `new Function`, not WebAssembly.** `script-src` alone reproduces it, and
 * within `script-src` the single token that fixes it is `'unsafe-eval'` — `'wasm-unsafe-eval'`
 * makes no difference. `public/duckdb/duckdb-browser-*.worker.js` contains
 * `new Function("x", …+"\nreturn true;")`, Arrow's compiled-predicate path. WASM was never the
 * problem; the narrow directive was chosen because compiling WebAssembly *looked* like the
 * thing a CSP would object to.
 *
 * **The violation was never in the page.** It is raised inside the DuckDB worker, and worker
 * console output does not surface through the page's console listener — which is what both
 * earlier sessions were reading. "Zero violations" meant "we were listening in the wrong
 * place", not "the browser is being silent". Attaching over CDP with
 * `Target.setAutoAttach` shows it immediately.
 *
 * **Scoping the permission to the worker does not work, and that is per spec.** A dedicated
 * worker loaded from a same-origin script inherits the *owner document's* policy in addition
 * to whatever its own response carries, so serving `/duckdb/:path*` a looser `script-src`
 * changes nothing. Measured, not assumed.
 *
 * So `'unsafe-eval'` is required, and it is a real weakening — stated plainly rather than
 * buried. Three things make it the right trade here:
 *
 *   1. `'unsafe-inline'` is *already* required for `next-themes` and Next's hydration
 *      bootstrap, and it is the larger hole by some margin: an injected inline script runs
 *      directly and never needs `eval` at all. Adding `'unsafe-eval'` on top of it is
 *      marginal.
 *   2. What this policy actually buys is `connect-src 'self'`. Injected script or not, the
 *      page cannot phone anywhere — and for a finance dashboard, blocking exfiltration is the
 *      protection that matters. With it come `object-src 'none'`, `base-uri 'self'`,
 *      `form-action 'self'` and `frame-ancestors 'none'`.
 *   3. A policy that ships and blocks exfiltration beats a stricter one that lives in a
 *      comment.
 *
 * The honest upgrades, in order of payoff: a nonce-based policy, which removes
 * `'unsafe-inline'` and needs middleware this app does not otherwise have; and an upstream
 * DuckDB build without the compiled-predicate path, which is not ours to make. Until then this
 * is where the line sits, and `e2e/headers.spec.ts` drives `/lab` under the real header so a
 * dashboard whose every figure is dead cannot ship quietly.
 */
const CSP = [
  "default-src 'self'",
  // 'unsafe-eval' is what DuckDB's worker needs and 'wasm-unsafe-eval' is not — see above.
  // Both are listed: the WASM token is the narrower permission and stays declared so that
  // removing the eval dependency later is a one-token change rather than a re-investigation.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data:",
  // A worker inherits the document's policy. child-src is the legacy fallback some engines
  // still consult for workers; declaring both costs nothing and removes a whole class of
  // "works here, blank there".
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
