# RASEED WEB — Claude Code Master Build Prompt

Put `RASEED_WEB_ARCHITECTURE.md` in an empty directory, run the setup below, then paste everything under the line into Claude Code.

```bash
# 21st.dev — fresh key required, all legacy Magic keys were reset.
# Get one at https://21st.dev/mcp
npx skills add 21st-dev/skill

npx create-next-app@latest raseed-web --typescript --tailwind --app --eslint
```

---

## ROLE

You are the sole engineer building **RASEED WEB**, a dual-currency financial analytics dashboard in Next.js 16 + React 19. `RASEED_WEB_ARCHITECTURE.md` in this directory is the specification — read it completely before writing anything, and treat it as the source of truth for the feature tiers, pipelines, formulas, tokens and phase gates.

There are two skills you must use, in this order, before writing any component:
1. **`frontend-design`** — run its planning pass. The direction is already locked in §6 of the spec (currency-as-temperature, Sankey-as-hero, the panel edge device). Follow it exactly rather than re-deriving it.
2. **`premium-frontend`** — read `references/setup.md` and `references/motion.md`. Pull animation patterns from there instead of improvising.

## ENGINEERING RULES — non-negotiable

1. **Think before coding.** State assumptions. If the spec is ambiguous, name the ambiguity and ask — never pick silently.
2. **Simplicity first.** Minimum code that solves the problem. No speculative abstractions, no config nobody asked for, no error handling for impossible states. If it could be half the length, rewrite it.
3. **Surgical edits.** Touch only what the task needs. Don't reformat adjacent code, match existing style, remove only the orphans your change created.
4. **Goal-driven.** Every phase has verify criteria. Write the test first for pure functions. Loop until they pass. Never declare a phase done without demonstrating the verification.
5. **One phase per session.** Do not run ahead. End each phase with: what was built, what was verified, what you assumed.

## LIBRARY FACTS — get these right or the build is wrong

- **Motion, not Framer Motion.** Install `motion`. Import `from "motion/react"`. Never `framer-motion` — it's legacy. RSC imports use `motion/react-client`. Any file using Motion hooks needs `"use client"`.
- **Animate `transform` and `opacity` only.** Animating width/height/top/left or `filter` drops frames. Use the `layout` prop for layout changes.
- **`useReducedMotion()` gates all motion**, with a complete static fallback.
- **Lenis on the landing route only.** Do not wrap the dashboard shell in it. Smooth scroll on dense data views is wrong, and reduced-motion users always get native scroll.
- **`backdrop-filter` is surgical** — command palette overlay only. It costs 15–30% FPS on mid-tier Android.
- **Tailwind v4** uses `@import "tailwindcss"` and CSS-first config. Do not write a `tailwind.config.js` colour palette; tokens live in `theme/tokens.css`.
- **next-themes**: `attribute="data-theme"`, `defaultTheme="system"`, `disableTransitionOnChange`, and `suppressHydrationWarning` on `<html>`.

Verify every package version resolves before importing it. If a name or API has changed since this prompt was written, search and tell me what you found — do not guess.

## ARCHITECTURE INVARIANTS — violating these is a bug

- **Money is integer minor units.** Never a float. A `Money` type and its arithmetic live in `lib/money.ts`; nothing outside that file does raw arithmetic on amounts.
- **`v_spend` is defined once**, as a DuckDB view, per §5 P2. Never inline that filter in a component or a query. Every wrong number in every finance dashboard comes from two places disagreeing about what counts as spend.
- **FX rates are frozen at transaction date and immutable.** The currency lens swaps which column charts read. It never recomputes history.
- **Every SQL string lives in `lib/duck/queries.ts`.** No SQL in components.
- **Chart colours resolve from CSS variables at render time** and re-resolve on theme change. A hardcoded hex in a chart is the single most common way a theme toggle breaks — there must be zero hex literals outside `theme/tokens.css`.
- **Heavy maths runs in workers.** Monte Carlo, Holt-Winters and bootstrap never touch the main thread.
- **Every view is a URL.** All filters, ranges and the currency lens go through `nuqs`. Pasting the URL must reproduce the exact view.
- **Every chart has three states**: loading skeleton at final dimensions (no layout shift), empty with a real instruction, error showing the failing query.

## SCOPE

Build **Tier 0 and Tier 1** from §3 of the spec — 16 features. Stop there and ask before touching Tier 2. Do not build Tier 3.

## PHASES

Execute one at a time. Do not begin the next until I confirm.

**Phase 0 — Shell.** Next 16, Tailwind v4, `theme/tokens.css`, Bricolage Grotesque + Geist Sans + Geist Mono via `next/font`, next-themes with a three-state Light/System/Dark control, icon rail and command bar generated via 21st.dev MCP.
→ *Verify:* all three theme states switch cleanly, no hydration warning in console, no flash of wrong theme on hard reload, tabular numerals visibly active on a sample figure.

**Phase 1 — Data engine.** DuckDB-WASM lazy-loaded post-paint, Arrow ingest, the view stack from §4, seeded synthetic generator producing 18 months of realistic India+UAE transactions.
→ *Verify:* 100k rows ingest; log and report the view rebuild time (target <400ms); the same seed produces byte-identical data twice.

**Phase 2 — Chart foundation.** Shared scales, axes, tooltip, legend, the three states, theme-reactive colour resolution.
→ *Verify:* toggle theme with charts on screen — every one recolours. Grep the codebase for `#` hex literals outside `theme/tokens.css`; result must be empty.

**Phase 3 — Sankey hero.** `d3-sankey` over `v_flows`, one orchestrated 900ms draw on load, panel edge device.
→ *Verify:* Sankey node totals reconcile to `v_spend` aggregates to the minor unit. Reduced-motion shows the completed diagram with no animation.

**Phase 4 — Tier 0 features 2–7.** Net worth timeline, treemap, calendar heatmap, burn/runway, savings rate, budget variance with the rate×volume decomposition.
→ *Verify:* each figure matches a hand-computed fixture. Variance components must sum exactly to total variance.

**Phase 5 — Query bar.** ⌘K via cmdk, NL→SQL, the §5 P7 sandbox, automatic chart selection from result shape.
→ *Verify:* sandbox rejects 12 adversarial strings you write yourself (multi-statement, `PRAGMA`, `ATTACH`, comment-smuggled DDL, unicode tricks). Timeout fires. Generated SQL is always visible above the result.

**Phase 6 — Maths engines.** `lib/finance/` and `lib/stats/` as pure functions, wired through Comlink workers.
→ *Verify:* unit tests against known-answer fixtures for XIRR, PMT, amortisation, Gini, Benford χ², MAD z-score, Holt-Winters. Report the numbers.

**Phase 7 — Tier 1.** Monte Carlo fan with block bootstrap, Holt-Winters forecast, anomaly detection, FX attribution, remittance ledger, subscription waterfall, goal solver, what-if simulator.
→ *Verify:* holdout MAPE displayed on the forecast. Prove the block-bootstrap fan is strictly wider than an IID fan on the same series — if it isn't, the block logic is broken. Forecast bands render in `--horizon`, never in an actuals colour.

**Phase 8 — Landing route.** Lenis, kinetic display type, scroll-linked case-study section explaining the architecture.
→ *Verify:* Lighthouse ≥95 across all four categories. Reduced motion gives native scroll and full content.

**Phase 9 — Ship.** nuqs share links, PDF/CSV export, accessibility sweep, deploy.
→ *Verify:* pasted URL reproduces the exact view including currency lens. Keyboard-only traversal of every route with visible focus. 360px with no horizontal scroll.

## QUALITY GATE — every phase

- Responsive to 360px, nothing clips
- Keyboard accessible: real `<button>`/`<a>`, visible focus rings, logical tab order, no traps
- `prefers-reduced-motion` respected with a complete static fallback
- Body text contrast ≥ 4.5:1 **in both themes** — check light mode separately, it's where contrast fails
- 60fps on scroll and animation; only `transform`/`opacity` animate
- No layout shift from loading states
- Semantic HTML: real heading hierarchy, landmarks, alt text
- `npx tsc --noEmit` clean; no `any` on money, currency or transaction types
- Zero hex literals outside `theme/tokens.css`

## START

Read `RASEED_WEB_ARCHITECTURE.md`, then the `frontend-design` and `premium-frontend` skills. Then tell me:
1. Anything in the spec you think is wrong, over-engineered, or under-specified.
2. Any package whose current version or API you could not verify.
3. Your Phase 0 plan as numbered steps, each with its verify check.

Then wait for my go.
