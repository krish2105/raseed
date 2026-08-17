# RASEED — Progress

Claude reads this at the start of every session. Tick sessions as they complete. Keep "Open threads" honest — it's the handoff between sessions.

**Current session: #30** — SQLCipher + migration, privacy dashboard, Ledger Link, capture router, Payday Runway. Previous: #29 — redesign, Phase 1 (web). Phase 2 is the phone. Previous: #28 — Mobile P6: the worth-it loop, the Weekly Reckoning and the nudge budget are on the phone. `regretRate` and `rankNudges` had zero mobile callers until now

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
- [x] **#11** Mobile P3 — capture router (`/capture`), confirmation sheet, `capture_log` written
  for the first time, and the eval harness with a 26-case golden set. **Deterministic tiers
  only** — rules and local, no network, no key. The LLM tier is a named seam, so S4 redaction
  still has no surface and airplane mode stays fully supported. Gate clears every metric the
  spec names; four cases are labelled beyond-a-regex and stay failing on purpose
- [x] **#12** Web P3 — Sankey hero (hand-built SVG); totals read through `v_spend`
- [~] **#13** Mobile P4 — merchant resolver and alias learning are live and on the write path;
  **reversal pairing is not built** — `pairReversals` is never imported by mobile and
  `reversal_of_id` is written NULL (`db/queries.ts:166`). Re-marked from [x] by the 17 Aug audit
- [x] **#14** Web P4 — Tier 0 complete: net-worth timeline and calendar heatmap shipped
- [~] **#15** Trip Mode is live on **web** (`detectTrips` + 11 tests + /trips) and **mobile** (`/trip`: `planTrip` over habits read from the ledger, Numbeo price ratios, unconstrained plan with the budget asked separately). Goals ship alongside it (`/goals`: new `goals` table, `savingsPlan` against real monthly surplus, copy through the tone gate). The Live Activity remains
- [x] **#16** Web P5 — ⌘K bar, deterministic parser, SELECT-only sandbox; 12 adversarial strings covered by 27 tests
- [x] **#17** worth-it loop, Weekly Reckoning and the 4-nudge cap — live on **both** surfaces.
  Mobile P6 landed the phone half: `/reckoning`, ratings in `worth_scores`, nudges in `nudges`,
  a rolling seven-day cap tested over four simulated weeks. In-app, not push
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

- ✅ **Redesign, both surfaces.** New `accent` tokens (chrome green, money keeps its
  temperature), Plus Jakarta Sans, the landing route and web shell rebuilt, and the phone on
  dark mode following the system with a System/Light/Dark override on You. Remaining polish:
  the phone's screens use the new colours and primitives but several still carry their own
  card and pill styles rather than `components/ui.tsx`.

- ✅ **Splits run both ways** — an expense someone else paid is recordable. The sign on
  `owed_minor` is the direction; your share is spend immediately; settling writes no
  transaction because the spend row is already the outflow.

- 🚧 **Three items remain from the 17 Aug batch, and none is started:**
  **Arabic + RTL** (with the tone gate extended to Arabic — Krishna reaffirmed full translation;
  the Arabic rule set must be reviewed by a native speaker before it can be trusted),
  **voice capture** (`expo-speech-recognition@56.0.1` targets SDK **56** and we are pinned to
  57 — untested combination, try it on a throwaway prebuild since `ios/` is gitignored and
  therefore recoverable), and the **Trip Live Activity** (Swift Widget Extension via
  `@bacons/apple-targets@5.0.0`). Also outstanding: several phone screens still carry their own
  card and pill styles instead of `components/ui.tsx`.

- ✅ **SQLCipher ships** — `raseed-enc.db`, key in the keychain at
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, with a verified copy-then-delete migration off the old
  plaintext file. A lost phone is a lost ledger, by design.

- ✅ **Privacy dashboard, consent ledger, export and deletion** on the phone (`/privacy`).

- ✅ **Lighthouse ≥95 is met and gated** — desktop 100/100/100/100, mobile 95/100/100/100,
  `pnpm --filter web lighthouse`, nothing exempt. The old unexplained 94 was a reveal wrapper
  on the LCP element.

- **Node 24 is required, not preferred** — `.nvmrc` says 24 and `package.json` says `>=24`.
  Under Node 20 `node:sqlite` does not exist and the device schema suite fails to *load*, and
  turbo aborts siblings on the first failure, so that one failure also reports `schema` and
  `web` as failed. `nvm use` first; add `--continue` when diagnosing.

- ✅ **The worth-it loop is on the phone** — `/reckoning`: five cards a session, regret by
  category, and at most four nudges in any rolling seven days. `acted` is written and feeds
  fatigue. **In-app only** — push notifications are not built and no permission is requested.

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
- ✅ **Receipt OCR is header + items**, and per-item assignment is on the screen — tap **Split by item**, chips per line, tax and service follow the items they were charged on.
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
