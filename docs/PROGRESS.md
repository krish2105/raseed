# RASEED — Progress

Claude reads this at the start of every session. Tick sessions as they complete. Keep "Open threads" honest — it's the handoff between sessions.

**Current session: #27** — audit, then the queue: dark redesign, WebGL corridor, Tier 0 charts, mobile Numbers, edit on both surfaces — S10/S12/S14/S16 partially landed early (charts, Sankey, variance, query bar)

---

> **Numbering.** These are **session** numbers (`#0`–`#24`). They are not the security phases
> `S0`–`S10` in `RASEED_SECURITY_ARCHITECTURE.md` §5, and not the `P` phases in the two
> architecture docs. They used to be written `S0`–`S24`, which meant `#4` (engines finance)
> read as complete while security `S4` (redaction) was unstarted. Renamed by the 17 Aug audit.
>
> Build state for every track lives in **`docs/AUDIT.md`**, which is the reference; this file
> tracks sessions.

## Track A — Shared core (must finish before B or C)

- [x] **#0** Monorepo scaffold — both apps import a shared package; breaking it fails both typechecks
- [x] **#1** `@raseed/money` + `@raseed/tokens` — `allocate` gives 34/33/33; tokens render in both apps
- [x] **#2** `@raseed/schema` + Supabase migrations + RLS — parity test catches deliberate drift; cross-user read returns zero rows
- [x] **#3** `@raseed/engines` domain half — safeToSpend, pairReversals, detectRecurrence, detectRemittance, normaliseMerchant, rankNudges, regretRate, all unit tested
- [x] **#4** `@raseed/engines` finance/stats + `@raseed/fixtures` — known-answer tests pass; same seed twice gives identical output

## Tracks B & C — alternating

- [x] **#5** Mobile P0 — shell, tokens, fonts, three tabs
- [x] **#6** Web P0 — shell, three-state theme toggle, no hydration warning, no FOUC
- [x] **#7** Mobile P1 — op-sqlite, schema, manual entry (sync deferred to a second device)
- [x] **#8** Web P1 — DuckDB-WASM, Arrow ingest, demo path, view rebuild 41ms at 100k rows (live/Supabase path deferred until credentials exist)
- [x] **#9** Mobile P2 — Safe-to-Spend engine + Skia Day Dial
- [x] **#10** Web P2 — hand-built charts, theme-reactive colours, zero hex outside tokens
- [ ] **#11** Mobile P3 — capture router, confirmation sheet, eval harness ≥0.90
- [x] **#12** Web P3 — Sankey hero (hand-built SVG); totals read through `v_spend`
- [~] **#13** Mobile P4 — merchant resolver and alias learning are live and on the write path;
  **reversal pairing is not built** — `pairReversals` is never imported by mobile and
  `reversal_of_id` is written NULL (`db/queries.ts:166`). Re-marked from [x] by the 17 Aug audit
- [x] **#14** Web P4 — Tier 0 complete: net-worth timeline and calendar heatmap shipped
- [~] **#15** Trip Mode is live on **web** (`detectTrips` + 11 tests + /trips) and **mobile** (`/trip`: `planTrip` over habits read from the ledger, Numbeo price ratios, unconstrained plan with the budget asked separately). Goals ship alongside it (`/goals`: new `goals` table, `savingsPlan` against real monthly surplus, copy through the tone gate). The Live Activity remains
- [x] **#16** Web P5 — ⌘K bar, deterministic parser, SELECT-only sandbox; 12 adversarial strings covered by 27 tests
- [~] **#17** worth-it loop, Weekly Reckoning and the 4-nudge cap are live on WEB; the mobile surface remains
- [x] **#18** Web P6 — Comlink worker; Arrow encoding moved off the main thread (837ms → 16ms longest block, measured)
- [~] **#19** 🚩 splits + cash live on **web and phone** (one engine, 1,600-case test); blocked on the read-lags-one-write bug below, and the store question
- [~] **#20** Web P7 — Monte Carlo fan, Holt-Winters, anomalies, FX attribution and the Lab (Benford/Lorenz/Pareto) are live
- [~] **#21** Web **P9** — landing route and Lenis are live (`app/page.tsx`,
  `components/landing/`); **Lighthouse ≥95 never measured**, which is the actual done-when
- [x] **#22** Web **P10** — deploy, nuqs share links, a11y sweep and **data export** all done
- [~] **#23** Mobile P8 — receipt OCR live (`/receipt`, Apple Vision); **voice capture remains** (native deps approved, not started)
- [ ] **#24** Both — buffer, eval regression, hardening

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

- **65 Playwright specs** run against a production build in CI (`pnpm --filter web e2e`): flows, plus axe-core WCAG 2 AA on all 8 routes in **both** themes, 360px overflow and keyboard traversal.
- **Web is deployed** — https://raseed-eosin.vercel.app, public, auto-deploys from `main`.
  Vercel project root directory is `apps/web`; do not unset it or deploys fail at upload.

- **Backend is optional and not deployed** — nothing in the app needs one. Render/Supabase
  steps are in `docs/RUNBOOK_BACKEND.md`; both need Krishna's credentials.
- ✅ **Editing an expense** — built on the phone (`app/edit.tsx`, tap any ledger row): amount,
  merchant, category, account, plus soft delete and "this was refunded". Web still has delete
  only; an edit form there is the remaining half.
- **Receipt OCR is header + items**; assigning items to people for a per-item split is built in the engine (`splitByItems`) but not yet on a screen.
- **Splits are one-directional** — you pay, others owe you. An expense someone else paid is not yet recordable.
- ✅ **Refunds** — recordable from the row they reverse, so both halves leave `v_spend` at once.
- ✅ **Data export** — CSV and JSON on `/ledger`, unfiltered by `v_spend` because an export is
  your data rather than a view.
- ✅ **Mobile has tests** — 23, against `node:sqlite` using the contract-generated DDL. It had none.
- **CSP is written but not applied** (`apps/web/next.config.ts`) — it silently breaks WASM
  instantiation inside the blob worker. Everything else in S6 ships. See `docs/AUDIT.md`.
- **DuckDB is now self-hosted**, not from jsDelivr. An e2e asserts zero third-party requests.
- ✅ **Mobile stale-read fixed** — it was React Compiler memoisation, and the earlier disproof of that theory was invalid. See DECISIONS.md.

## Deferred decisions

- **Store submission** — revisit at S19 after two weeks of daily use. $99/yr Apple, $25 Google.
- **Tier 2 web features** — pick 3–4 before S20. Leading candidates: Benford audit, Gini/Lorenz, EMI prepayment optimiser.
- **PowerSync** — only if last-write-wins produces real conflicts. Not before.
