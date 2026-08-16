# RASEED — Progress

Claude reads this at the start of every session. Tick sessions as they complete. Keep "Open threads" honest — it's the handoff between sessions.

**Current session: 9** — S10/S12/S14/S16 partially landed early (charts, Sankey, variance, query bar)

---

## Track A — Shared core (must finish before B or C)

- [x] **S0** Monorepo scaffold — both apps import a shared package; breaking it fails both typechecks
- [x] **S1** `@raseed/money` + `@raseed/tokens` — `allocate` gives 34/33/33; tokens render in both apps
- [x] **S2** `@raseed/schema` + Supabase migrations + RLS — parity test catches deliberate drift; cross-user read returns zero rows
- [x] **S3** `@raseed/engines` domain half — safeToSpend, pairReversals, detectRecurrence, detectRemittance, normaliseMerchant, rankNudges, regretRate, all unit tested
- [x] **S4** `@raseed/engines` finance/stats + `@raseed/fixtures` — known-answer tests pass; same seed twice gives identical output

## Tracks B & C — alternating

- [x] **S5** Mobile P0 — shell, tokens, fonts, three tabs
- [x] **S6** Web P0 — shell, three-state theme toggle, no hydration warning, no FOUC
- [x] **S7** Mobile P1 — op-sqlite, schema, manual entry (sync deferred to a second device)
- [x] **S8** Web P1 — DuckDB-WASM, Arrow ingest, demo path, view rebuild 41ms at 100k rows (live/Supabase path deferred until credentials exist)
- [x] **S9** Mobile P2 — Safe-to-Spend engine + Skia Day Dial
- [x] **S10** Web P2 — hand-built charts, theme-reactive colours, zero hex outside tokens
- [ ] **S11** Mobile P3 — capture router, confirmation sheet, eval harness ≥0.90
- [x] **S12** Web P3 — Sankey hero (hand-built SVG); totals read through `v_spend`
- [x] **S13** Mobile P4 — merchant resolver, alias learning, reversal pairing
- [~] **S14** Web P4 — treemap, variance, ledger, currency done; net-worth timeline + calendar heatmap remain
- [~] **S15** Trip Mode is live on **web** (`detectTrips` + 11 tests + /trips); the mobile envelope and Live Activity remain
- [x] **S16** Web P5 — ⌘K bar, deterministic parser, SELECT-only sandbox; 12 adversarial strings covered by 27 tests
- [~] **S17** worth-it loop, Weekly Reckoning and the 4-nudge cap are live on WEB; the mobile surface remains
- [x] **S18** Web P6 — Comlink worker; Arrow encoding moved off the main thread (837ms → 16ms longest block, measured)
- [~] **S19** 🚩 splits + cash live on **web and phone** (one engine, 1,600-case test); blocked on the read-lags-one-write bug below, and the store question
- [~] **S20** Web P7 — Monte Carlo fan, Holt-Winters, anomalies, FX attribution and the Lab (Benford/Lorenz/Pareto) are live
- [ ] **S21** Web P8 — landing route, Lenis, Lighthouse ≥95
- [ ] **S22** Web P9 — Vercel deploy, nuqs share links, a11y sweep
- [ ] **S23** Mobile P8 — voice capture, receipt OCR
- [ ] **S24** Both — buffer, eval regression, hardening

---

## Open threads

*Anything left unfinished or unresolved. Clear it or carry it forward — never let it sit for more than two sessions.*

- **EAS unverified** — steps written up in `docs/RUNBOOK_EAS.md`; needs Krishna's Expo
  credentials so it is his to run. iOS Simulator is the only proven mobile target.
- **ESLint pinned to 9.x** — ESLint 10 breaks `eslint-plugin-react`, which both `eslint-config-next`
  and `eslint-config-expo` depend on. Same for TypeScript, pinned to 6.0.3 until `typescript-eslint`
  supports TS 7. **Revisit when the plugin ecosystem catches up.**

- **Supabase cloud not linked** — schema, migration and RLS are authored and verified
  against PGlite. Applying to a real project needs `supabase login` + `link` + `db push`,
  which needs Krishna's credentials. **One command when he's back.**

- **Turbopack dev is broken under pnpm hoisted** — `next dev` pinned to `--webpack`.
  Production build/start and webpack dev are all clean; only Turbopack dev fails.
  Retest with `pnpm --filter web run dev:turbo` on the next Next release.

- **46 Playwright specs** run against a production build in CI (`pnpm --filter web e2e`): flows, plus axe-core WCAG 2 AA on all 8 routes in **both** themes, 360px overflow and keyboard traversal.
- **Web is deployed** — https://raseed-eosin.vercel.app, public, auto-deploys from `main`.
  Vercel project root directory is `apps/web`; do not unset it or deploys fail at upload.

- **Backend is optional and not deployed** — nothing in the app needs one. Render/Supabase
  steps are in `docs/RUNBOOK_BACKEND.md`; both need Krishna's credentials.
- **Editing an added expense** is still delete-and-re-add on web; the phone has the same gap.
- 🐞 **Mobile reads lag exactly one write** until the app restarts — see DECISIONS.md, "the read that lags one write". Predates this session; blocks the S19 ship gate.

## Deferred decisions

- **Store submission** — revisit at S19 after two weeks of daily use. $99/yr Apple, $25 Google.
- **Tier 2 web features** — pick 3–4 before S20. Leading candidates: Benford audit, Gini/Lorenz, EMI prepayment optimiser.
- **PowerSync** — only if last-write-wins produces real conflicts. Not before.
