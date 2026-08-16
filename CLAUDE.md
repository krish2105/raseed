# RASEED — Project Rules

Monorepo. Two apps, one shared domain layer. Read `docs/PROGRESS.md` before doing anything.

## Session protocol

1. Read `docs/PROGRESS.md` — find the current session and its goal.
2. Read `docs/DECISIONS.md` — do not re-litigate anything already decided there.
3. Read the architecture doc for the track you're on (`docs/MOBILE_ARCHITECTURE.md` or `docs/WEB_ARCHITECTURE.md`).
4. Do **one session's** work. Do not run ahead into the next.
5. Before finishing: append to `docs/DECISIONS.md`, tick `docs/PROGRESS.md`, and state what you verified.

If context is compacting mid-session, stop and write state to `docs/DECISIONS.md` first. A decision that only exists in conversation is a decision that will be lost and silently reinvented differently.

## Engineering rules

- **Think before coding.** State assumptions. If the spec is ambiguous, name it and ask — never pick silently.
- **Simplicity first.** Minimum code that solves the problem. No speculative abstractions, no config nobody asked for, no handling for impossible states. If it could be half the length, rewrite it.
- **Surgical edits.** Touch only what the task needs. Don't reformat adjacent code. Match existing style. Remove only the orphans your own change created.
- **Verify, don't assert.** Every session has done-when criteria. Write the test first for pure functions. Loop until green. Never claim done without showing the verification output.
- **Don't guess at APIs.** If you can't verify a package's current version or API, search — then tell me what you found. A confident wrong import costs an hour.

## Invariants — violating any of these is a bug, not a style choice

**Money**
- Integer minor units. Never a float. Never a `number` that could be rupees-with-decimals.
- All arithmetic lives in `@raseed/money`. Nothing outside that package does math on an amount.
- Splitting uses `allocate()`. ₹100 three ways is 34/33/33, never 33.33 × 3.

**The spend predicate**
- Defined exactly once: `v_spend` (DuckDB on web, a Drizzle view on mobile).
- Never inline `txn_type = 'spend' AND ...` in a component, a query, or a screen.
- Every wrong number in every finance dashboard traces to two places disagreeing about what counts as spend.

**FX**
- `fx_rate` and `home_amount_minor` are frozen at transaction date. Written once, never recomputed.
- The currency lens swaps which column is read. It does not touch history.

**Schema**
- `packages/schema/src/contract.ts` is the truth. `sqlite.ts` and `pg.ts` derive from it.
- The parity test must pass before any schema change is complete.
- Every synced table has `user_id`, `updated_at`, `deleted`. Soft delete only — never hard-delete a row.

**Supabase**
- RLS enabled on every table with `auth.uid() = user_id`, in the same migration that creates the table.
- The anon key is public by design. RLS is the protection. Never rely on the key being secret.

**Mobile**
- SQLite is the source of truth. Sync is a background reconciler.
- The app is fully functional with Supabase unreachable. Airplane mode is a supported state, not a degraded one.
- Never write a transaction without user confirmation. The parser proposes; the sheet commits.

**Web**
- Analytics run in DuckDB-WASM in the browser. Never run analytics SQL against Postgres.
- All SQL strings live in `lib/duck/queries.ts`. No SQL in components.
- Heavy maths (Monte Carlo, Holt-Winters, bootstrap) runs in a worker. Never on the main thread.
- Every view is a URL via `nuqs`. Pasting the URL reproduces the exact view including currency lens.

**Design**
- Zero hex literals outside `@raseed/tokens`. Grep for `#` before declaring any UI session done.
- Chart colours resolve from CSS variables at render and re-resolve on theme change. A hardcoded chart palette is the #1 way theme toggles break.
- Tabular numerals on every figure, everywhere.
- Forecast bands use `--horizon`. Projected money must never look like real money.
- `useReducedMotion()` gates all motion, with a complete static fallback.
- Animate `transform` and `opacity` only.

**Engines**
- `@raseed/engines` is pure. No I/O, no React, no DB, no platform APIs, no `Date.now()` — pass time in.
- New engine function ships with its unit test in the same commit.

## Library facts — get these right

- **Motion, not Framer Motion.** Package is `motion`, import from `motion/react`. RSC uses `motion/react-client`.
- **Expo SDK 57.** SDK 56 has a Hermes V1 memory regression affecting Reanimated.
- **Tailwind v4** is CSS-first: `@import "tailwindcss"`. No colour palette in a JS config.
- **next-themes**: `attribute="data-theme"`, `suppressHydrationWarning` on `<html>`, `disableTransitionOnChange`.
- **Shared packages are TS source**, no build step. Next needs `transpilePackages`; Metro needs `watchFolders`.
- **pnpm needs `node-linker=hoisted`** or Metro fails to resolve workspace packages.

## Quality gate — every session

- `npx tsc --noEmit` clean across the workspace
- No `any` on money, currency, or transaction types
- New pure functions have tests
- Responsive to 360px, no clipping
- Keyboard accessible: real `<button>`/`<a>`, visible focus, logical tab order
- Contrast ≥ 4.5:1 in **both** themes — check light separately, that's where it fails

## Do not

- Do not add investment, trading, or financial recommendation features. That is regulated activity under SEBI in India and the SCA in the UAE.
- Do not request SMS or call-log permissions.
- Do not export Expo Web to Vercel.
- Do not change the bundle identifier `com.krishnamathur.raseed`.
- Do not hard-delete rows.
