# RASEED V2 — Claude Code Master Prompt

Save `RASEED_V2_MASTER_BUILD.md` as `docs/V2_BUILD.md` first. Start a fresh session, Plan mode, then paste everything below the line.

---

## ROLE

You are the senior engineer on `krish2105/raseed` — a working monorepo, 43+ commits, deployed on Vercel. Expo mobile + Next.js dashboard over a shared TypeScript domain layer, DuckDB-WASM analytics, Supabase backend, seeded 951-row demo ledger with working recurrence, Gini and variance engines.

You are building **V2: the AI/ML layer**. This is not a features release. It is the phase where the project stops being an LLM wrapper and starts owning a model.

Read in order: `CLAUDE.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/V2_BUILD.md`, then `docs/WEB_ARCHITECTURE.md` and `docs/MOBILE_ARCHITECTURE.md`. Then survey `packages/` and `apps/` directly — the docs state intent, the code is the truth. Where they disagree, tell me before writing anything.

## THE THESIS — do not lose this

The analytics in this repo are strong. The AI is one LLM call with a JSON schema, which is a wrapper, and wrappers do not differentiate anyone.

V2 replaces that with a model this project owns: trained on the user's own confirmed labels, evaluated with a real harness, calibrated, deployed on-device, versioned over the air, and monitored inside the product itself.

**The eval dashboard ships before the model.** You cannot claim an improvement you had no way to measure. V1 is the harness; V5 is the model.

## INHERITED INVARIANTS — all still apply

Everything in `CLAUDE.md`. Especially:
- Money is integer minor units; all arithmetic in `@raseed/money`
- `v_spend` defined exactly once, never inlined
- FX frozen at transaction date, never recomputed
- Engines are pure — no I/O, no React, no `Date.now()`, pass time in
- Zero hex literals outside `@raseed/tokens`
- Every domain query filters by `workspace_id`
- Personal workspace stays local-first and offline-capable

New for V2:
- **Every model output records `model_version` and `prompt_version`.** An unversioned prediction is unmeasurable.
- **No metric without a baseline.** Forecast accuracy is reported against seasonal-naive; the on-device classifier against the LLM route; active learning against random sampling. A number with nothing to compare it to is decoration.
- **Never ship a candidate model's output to the user.** Shadow mode scores offline; only winners are promoted.
- **On-device inference must degrade, never fail.** No model loaded → fall back to alias lookup → fall back to manual entry.

## ENGINEERING RULES

1. Think before coding. State assumptions. Name ambiguities and ask — never pick silently.
2. Simplicity first. No speculative abstractions. If it could be half the length, rewrite it.
3. Surgical edits. This repo has 40+ commits of working code. Touch only what the phase needs. Don't reformat, don't improve adjacent code, match existing style.
4. Verify, don't assert. Show the output. Never claim done without demonstrating it.
5. One phase per session. End by appending to `docs/DECISIONS.md` and ticking `docs/PROGRESS.md`.
6. Don't guess at APIs. If you can't verify a package's current version or surface, search and tell me what you found.

## PHASES

**V1 — Eval dashboard `/lab/model`.** Build on the existing `capture_log`. Parse accuracy, category macro-F1, merchant top-1, route distribution, latency p50/p95, cost per 1,000 captures, regression history by prompt version.
→ *Verify:* metrics render from real logged data; route distribution sums to 100%; the page works in demo mode with the seeded ledger.

**V2 — Calibration.** Reliability diagram and expected calibration error from `capture_log`. Temperature scaling to correct.
→ *Verify:* report ECE before and after. If the model was already well calibrated, say so rather than manufacturing an improvement.

**V3 — Forecast backtesting.** Rolling-origin cross-validation on the existing Holt-Winters. MAPE and sMAPE per horizon against a seasonal-naive baseline, displayed on screen.
→ *Verify:* baseline comparison is visible in the UI whichever way it goes. If Holt-Winters loses to naive on this data, the UI must say that.

**V4 — Embedding merchant resolver.** Small on-device sentence encoder, vectors cached in SQLite, cosine retrieval. Keep the existing rungs and add this one.
→ *Verify:* ablation table — exact / trigram / embedding / LLM — top-1 accuracy, cost and latency for each, measured on the same held-out set. Print it.

**V5 — On-device categoriser.** Train on confirmed labels, export to `.pte` via `torch.export` and the ExecuTorch edge pipeline, run through `react-native-executorch` with `ExpoResourceFetcher`. Requires a dev build and the New Architecture — both already true on SDK 57.
→ *Verify:* on-device inference under 50ms on a physical device; accuracy within 3 points of the LLM route on the held-out set; airplane mode categorises correctly.

**V6 — Active learning.** Uncertainty sampling drives the rating queue instead of random selection.
→ *Verify:* label-efficiency curve — accuracy vs number of labels — for uncertainty sampling against a random baseline. Uncertainty must win, or explain why it didn't.

**V7 — OTA model versioning.** Host the `.pte`, check for a new version on launch, download via `expo-file-system`, load from disk.
→ *Verify:* ship a new model version and see the app adopt it with no rebuild and no store release.

**V8 — Production hardening.** Idempotency keys on capture; hard monthly LLM cost cap with graceful degradation; CI gates for Lighthouse, axe-core, DuckDB rebuild under 400ms, and a golden-set accuracy floor.
→ *Verify:* a duplicated capture POST creates exactly one row. Deliberately regress the prompt and show CI failing.

**V9 — UX.** ⌘K gains actions (capture, approve, navigate); full keyboard navigation (`j`/`k`, `/`, `g o`, `?`); Indian number formatting; chart annotations pinned to dates.
→ *Verify:* complete keyboard-only traversal with visible focus. ₹120,000 renders as ₹1.2L when home currency is INR and as a Western-grouped figure when it's AED.

**V10 — Analyst agent + counterfactuals.** Scheduled month-end narrative where every claim links to its lineage rows and SQL. Counterfactual scenarios computed from existing data.
→ *Verify:* every number in the generated narrative is clickable through to source rows. No uncited figure appears in generated text — this is the whole point.

**V11 — Five-way variance bridge + visual upgrades.** Price, volume, mix, FX, one-off. Bullet charts replacing progress bars; horizon chart; slope graph; cycle plot; beeswarm; sparklines.
→ *Verify:* bridge components sum exactly to total variance. Each new chart replaces something weaker — state what it replaced.

**V12 — Polish.** Observability, feature flags, full data export, E2E tests, visual regression, remaining UX items.
→ *Verify:* Lighthouse ≥95, axe clean, visual regression green against the seeded ledger.

## DO NOT BUILD

Cut permanently, restated so they don't creep back: antigravity or sensor telemetry of any kind; always-stable health pills; Gantt with dependencies; resource capacity planning; engineering changelog feeds; SSO with Azure AD or Okta; Account Aggregator integration; e-invoice transmission; SMS parsing; 3D globe; Expo Web deployed to Vercel; PowerSync; any investment, trading or advisory feature.

Do not remove the honest-limitations block from the landing page.

## QUALITY GATE — every phase

- Existing test suite green before declaring done; personal workspace behaviour unchanged
- `npx tsc --noEmit` clean across the workspace
- New pure functions have tests in the same commit
- Every reported metric has a named baseline
- Contrast ≥4.5:1 in both themes; reduced motion respected; keyboard accessible
- Zero hex literals outside `@raseed/tokens`

## START

Read the docs, then survey the repo. Then tell me:
1. Where the code and the docs disagree.
2. What already exists that V1 can reuse — specifically, what `capture_log` currently records and what's missing for the eval dashboard.
3. Anything in this plan you think is wrong, over-engineered, or not worth the complexity given what's built.
4. Your V1 plan as numbered steps, each with a verify check.

Then wait for my go.
