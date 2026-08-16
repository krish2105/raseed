# RASEED — Build audit

**Surveyed 17 August 2026**, against commit `9270163`. Read-only survey; every status below
cites a file. Items repaired since the survey are marked **[fixed]** with their commit.

Status vocabulary: **built** = exists in code *and* the spec's verify criterion is demonstrably
met. **partial** = some of it exists; what is missing is named. **not started**. **unsure** =
stated rather than guessed.

Where a doc contradicts `CLAUDE.md`, `CLAUDE.md` wins — stated explicitly wherever it applied.

---

## 0. Three findings that reorder the plan

**There is no authentication anywhere in the app.** The only `auth.` references in the repo are
the RLS SQL in `packages/schema/scripts/generate.mts` and the PGlite shim at
`packages/schema/src/rls.test.ts:46`. `@supabase/supabase-js` is a dependency of no package and
no app. There is no sign-in screen, no session handling, no middleware, no API route.

**There is no outbound network call of any kind.** — **CORRECTED 17 Aug, same night.** This
was wrong. It rested on grepping *source* for `fetch`/`axios`/LLM SDKs, which missed a CDN
fetch made *inside a library call*: `apps/web/lib/duck/client.ts:19` called
`duckdb.getJsDelivrBundles()`, so every visitor's browser fetched the DuckDB worker and .wasm
from `cdn.jsdelivr.net`. Found by writing a CSP, which blocked it. Fixed in `41388a9` — the
bundles are now self-hosted and an e2e asserts zero third-party requests. **The lesson is the
audit's own: a grep proves what a grep can see.** The original wording follows, corrected only
here. A repo-wide grep for
`fetch(|axios|XMLHttpRequest|generativelanguage|gemini|groq|openai|anthropic` across every
`.ts`/`.tsx` in `apps/` and `packages/` returns five hits, all of them URLs in comments or a
GitHub link in the landing page. No LLM, no analytics, no Sentry, no PostHog.
`packages/ai/src/index.ts` is a four-line placeholder returning the string `'@raseed/ai'`.

**Nothing is connected to Supabase.** `supabase/` holds one migration and no `config.toml` or
project ref; the CLI has never been linked; `.env.local` is untracked and contains exactly one
variable, `VERCEL_OIDC_TOKEN`.

Consequently: **D0 is provisioning, not migration** (§3 R-1). **S4 has no surface to protect**
(§3 R-2). **S0 is the real blocker** and sits at position 6 in the operating guide's order (§3
R-3).

---

## 1. Build state

### Mobile P0–P10 — `docs/MOBILE_ARCHITECTURE.md` §8

| # | Phase | Status | Evidence / what's missing |
|---|---|---|---|
| P0 | Scaffold, tokens, fonts, 3-tab shell, dev build | **built** | `src/app/(tabs)/_layout.tsx` (exactly three tabs), `src/theme.ts` (zero hex), `.expo/xcodebuild.log` ends `** BUILD SUCCEEDED **`. Qualifier: simulator only, never a physical device |
| P1 | op-sqlite + Drizzle + migrations + seed + manual entry | **[fixed] built** | Edit and delete shipped in `b26b354` (`src/app/edit.tsx`), completing the phase's own verify. | `src/db/{client,migrations,queries,seed}.ts`, `src/app/add.tsx`. Restart persistence proven by force-quit (`DECISIONS.md`). **Edit and delete are absent from the UI** — `updateTransactionNote` (`queries.ts:188`) and `softDeleteTransaction` (`:197`) exist and are called by **zero** screens; `ledger.tsx` rows have no press handler |
| P2 | Safe-to-Spend + Day Dial | **[fixed] built** | Engine `safeToSpend.test.ts` (14 cases), `components/DayDial.tsx`. Was **partial**: five of six inputs were literals and two screens disagreed about committed bills. Fixed in `57ef305` — balance derived via `liquidBalanceMinor()`, commitments unified in `src/lib/commitments.ts` |
| P3 | Capture router rules→alias→LLM, confirm sheet, `capture_log`, golden set ≥0.90 | **not started** | No router, no LLM. `capture_log` is declared (`contract.ts:271`) and created on device but **never read or written**. No eval harness or golden set exists anywhere — a find for `*/eval/*` and `*golden*` returns only CocoaPods headers |
| P4 | Merchant resolver + alias learning + reversal pairing | **[fixed] built** | Refunds recorded from the row they reverse (`a1183f5`), which is exact rather than inferred. | `resolveMerchant`/`learnAlias` (`queries.ts:314`, `:346`) are on the real write path at `insertTransaction` (`:159`). **Reversal pairing absent** — `pairReversals` never imported; `reversal_of_id` written NULL unconditionally (`:166-168`) |
| P5 | Multi-currency, FX freeze, remittance detection, Trip Mode | **partial** | FX frozen at write (`add.tsx`, `queries.ts:156`); Trip Mode `src/app/trip.tsx`. **`detectRemittance` not imported by mobile** |
| P6 | Worth-it loop + Weekly Reckoning + nudge budget | **not started** | `regretRate`/`rankNudges` not imported by mobile |
| P7 | Splits, Ledger Link, cash reconciliation | **partial** | `src/app/split.tsx` + `engines/domain/settle.ts`; `WalletCount.tsx` + `reconcileCash`. **Ledger Link does not exist** — only a nullable `share_link_id` column whose single writer hardcodes NULL (`queries.ts:411-413`) |
| P8 | Voice capture + receipt OCR | **partial** | `src/app/receipt.tsx` (Apple Vision), `engines/domain/parseReceipt.ts`. **Voice capture not built** — no microphone permission, no STT dependency |
| P9 | Recurrence radar, Payday Runway, Ask-your-ledger | **[fixed] partial** | `/numbers` (`a180593`): recurrence radar, CUSUM change points, MAD outliers, all on-device. Payday Runway and Ask-your-ledger remain |
| P10 | Supabase sync, Ledger Link web, EAS, App Store | **not started** | No Supabase client anywhere; EAS unverified |

### Web P0–P10 — `docs/WEB_ARCHITECTURE.md` §8

The doc defines **eleven** phases, P0–P10.

| # | Phase | Status | Evidence / what's missing |
|---|---|---|---|
| P0 | Next 16, Tailwind v4, tokens, `next-themes`, rail shell | **built** | `app/layout.tsx`; `e2e/a11y.spec.ts` asserts both themes |
| P1 | DuckDB-WASM, Arrow ingest, `v_spend`, seeded demo, <400ms @100k | **built** | `lib/duck/{client,ingest,queries}.ts`; `ingest.ts:53-68` instruments the rebuild; 41ms at 100k recorded |
| P2 | Chart foundation, 3 states, theme-reactive | **built** | `components/charts/*`; a11y spec re-checks after theme swap |
| P3 | Sankey hero, totals reconcile to `v_spend` | **built** | `app/(dash)/flows/`, `queries.flowEdges` |
| P4 | Tier 0 features 2–7 | **[fixed] built** | Net-worth timeline and calendar heatmap shipped in `63c6793` — the last two Tier 0 gaps |
| P5 | ⌘K + NL→SQL + sandbox + auto chart | **[fixed] built, deviates** | `LIMIT 5000` cap and 3s deadline added in `efef55c`. Still a regex rather than an AST parse, which is safe while only fixed templates are emitted. | `lib/duck/nl.ts` is a deterministic parser, **not an LLM** — deliberate, documented at `nl.ts:5-12`. 12 adversarial strings covered. But §5-P7 requires "**Parse the AST — do not regex-check**" and `isSafe()` (`nl.ts:190`) is a regex; **no `LIMIT 5000` cap, no 3s timeout**, and "timeout fires" is a named done-when |
| P6 | Workers + finance/stats engines, unit tested | **built** | Comlink worker; `finance.test.ts`, `stats.test.ts` |
| P7 | Tier 1: Monte Carlo, Holt-Winters, anomalies, FX attribution | **built** | `analytics.ts` `forecast`/`anomalies`/`fxSeries`; engines `blockBootstrap`, `holtWinters`, `madZScore`, `fxAttribution` |
| P8 | Chosen Tier 2 | **built** | `app/(dash)/lab/` — Benford, Lorenz/Gini, Pareto; plus `realValue.ts`, `amortise` |
| P9 | Landing route: Lenis, kinetic hero, **Lighthouse ≥95** | **partial** | `app/page.tsx` + `components/landing/*`, `lenis@1.3.26`. **Lighthouse never measured** |
| P10 | **Export**, nuqs share links, a11y sweep, deploy | **[fixed] built** | Export shipped in `6dfe05e`. | nuqs ✓, a11y ✓, deployed ✓. **No data export exists** — only CSV *import* |

### Deployment D0–D7 — `docs/RASEED_SPRINT_PLAN.md` §4

All **not started**. D0 has nothing to migrate from (§3 R-1). `.vercel/project.json` has one
project, so no staging (D1). The migration has no down-path — zero `drop policy`/`drop table`
(D3). No k6, no Sentry, no incident runbook, no store submission.

### CTO C1–C6 — `docs/RASEED_SPRINT_PLAN.md` §5

| # | Phase | Status | Evidence |
|---|---|---|---|
| C1 | Setup script + `ARCHITECTURE.md` | **partial** | Architecture docs and three runbooks exist; **no single `ARCHITECTURE.md`, no setup script** |
| C2 | ADRs retroactively | **partial — recommend cutting** | `DECISIONS.md` is 78KB of dated decisions carrying context *and* rejected alternatives (e.g. `:100-137` names Docker and the cloud as rejected, and states what the choice does **not** prove). Missing only ADR *format* and an index |
| C3 | Coverage floor in CI, 80% on `packages/` | **not started** | No coverage config or step |
| C4 | Mutation testing, Stryker | **not started** | No Stryker config |
| C5 | Perf regression in CI | **not started** | 400ms rebuild is instrumented, **not gated** |
| C6 | Deprecation pass | **partial** | Real precedent — Android target removed, duplicate `decompose.ts` deleted — both in `DECISIONS.md`. Not a deliberate pass |

### Security S0–S10 — `docs/RASEED_SECURITY_ARCHITECTURE.md` §5

| # | Phase | Status | Evidence |
|---|---|---|---|
| S0 | Email OTP, session policy, sign-out-everywhere | **not started** | No auth exists at all (§0) |
| S1 | MFA: TOTP + recovery codes | **not started** | Depends on S0 |
| S2 | Passkeys | **not started** | Depends on S0. **Recommend cutting** |
| S3 | SQLCipher, app-lock, `FLAG_SECURE`, switcher blur | **not started** | `expo-secure-store`, `expo-local-authentication`, SQLCipher are not dependencies |
| S4 | Redaction pipeline | **not started — no surface** | §3 R-2 |
| S5 | Ledger Link hardening | **not started — no surface** | Ledger Link is not built |
| S6 | CSP, HSTS, frame/referrer/permissions | **partial** (`41388a9`) | HSTS, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy ship. **CSP is written but not applied** — it silently breaks WebAssembly instantiation inside the blob-URL worker; bisected, no violation reported. A test asserts no CSP is claimed, so enabling it without checking analytics fails the suite rather than shipping a dead dashboard |
| S7 | Secret discipline | **partial** | gitleaks + `pnpm audit --audit-level high` both run in CI; `.gitleaks.toml` has a `service_role` JWT rule. **No Dependabot**; no path-scoped `service_role` grep; gitleaks runs only **after** a push — no pre-commit hook |
| S8 | Retention & purge | **not started** | `capture_log` never written; no purge job |
| S9 | Consent ledger, privacy dashboard, deletion, export | **not started** | None of the four |
| S10 | Demo isolation + security regression suite | **partial** | RLS suite (13 tests, real Postgres via PGlite) and the SQL sandbox suite both run in CI — but both predate the security track. **The demo-isolation test the phase names does not exist**; isolation is currently structural (no Supabase client to reach) and therefore unguarded the moment one lands |

### V1–V12 and W1–W12

All **not started**. V1 (`/lab/model`) needs `capture_log` populated; it is empty, so V1, V2 and
V6 have no input. W1–W12 had **no specification** — `docs/WORKSPACE_ARCHITECTURE.md` is now
drafted (derived, marked `PROPOSED`).

---

## 2. Drift — code vs docs

**[fixed] D-1 · Three bundle identifiers; one violated `CLAUDE.md`.** Root `app.json` held
`com.krish21052003.raseed` and a committed root `ios/` held `org.name.raseed`, against the
mandated `com.krishnamathur.raseed`. Caused by an `expo prebuild` run from the repo root, then
`git add -A`. Fixed in `e16ee58`.

**[fixed] D-1b · The spend predicate was defined twice.** `apps/web/lib/demo.ts` hand-wrote it
in TypeScript while `packages/schema/src/contract.ts:316` owned it — a direct `CLAUDE.md`
violation. Fixed in `a8a1542`: one rule, two renderings, and `spend-parity.test.ts` proves they
agree.

**[fixed] D-1d · Copy contradicted code.** `cfo-briefing.tsx` claimed 2,000 bootstrap paths;
`forecast-core.ts:26` runs 10,000. Fixed in `bf2e595`.

**D-1c · `PROGRESS.md` ticks a phase that is not built.** `[x] S13 Mobile P4 — … reversal
pairing`. Reversal pairing is absent from mobile. *The only false complete tick found.*

**D-2 · Web has eleven phases; `PROGRESS.md` maps them off by one** from P8 onward — it calls
the landing route "Web P8" and deploy "Web P9"; the doc says P9 and P10, with P8 being Tier 2.

**D-3 · The landing route is built but marked unstarted.** `app/page.tsx` is complete with
Lenis; only the Lighthouse ≥95 measurement is genuinely absent.

**D-4 · `S` means two things, and three inside one doc.** `PROGRESS.md` `S0`–`S24` are *session*
numbers; `RASEED_SECURITY_ARCHITECTURE.md` §5 `S0`–`S10` are *security phases*; that doc's §4
`S1`–`S5` are *feature names* colliding with its own §5. `PROGRESS.md` shows `[x] S4` complete
(engines finance/stats) while `OPERATING_GUIDE.md` §3 lists S4 (redaction) as unstarted priority
2. `P` collides too — pipelines vs build phases vs V2's production items.

**D-5 · `OPERATING_GUIDE.md` §1's layout does not exist.** Five referenced paths are absent,
including `docs/archive/`.

**D-6 · NL→SQL is deterministic; the doc specifies an LLM.** Code is right and safer, and is a
large part of why S4 has no surface.

**D-7 · `MOBILE_ARCHITECTURE.md` claims Legend-State and SQLCipher; neither is installed.** State
is a hand-rolled `useSyncExternalStore`; the DB is plain op-sqlite.

**[fixed] D-8 · Two "now" mechanisms on mobile.** `/numbers` uses the shared `useNow`; `goals.tsx` still has the weaker one. Original: `hooks/useNow.ts` handles foreground and midnight;
`app/goals.tsx:55` uses a weaker `useQuery(Date.now)`.

**D-9 · e2e spec count disagrees.** `PROGRESS.md` says 46; a recent run reported 56. **Unsure.**

**D-10 · `packages/ai` is a placeholder** occupying a real workspace slot.

**[fixed] D-11 · `apps/mobile` had zero automated tests.** 23 now, against `node:sqlite` (`bf5d27a`). Original text: All 874 workspace tests live in `packages/*`
(schema 412, engines 342, money 39, tokens 34, fixtures 20) plus 27 in `apps/web`. Every
mobile-specific claim rests on manual simulator runs narrated in `DECISIONS.md`.

**D-12 · The §2 web stack was substituted wholesale.** No visx, no `d3-*`, no cmdk, no TanStack,
no Zod. Charts are hand-built SVG. Two consequences: **no axes anywhere**, and the ledger is
**not virtualised** (`ledger-client.tsx:15`, `PAGE = 250`).

**D-13 · `RUNBOOK_BACKEND.md` says 16 tables; the migration creates 17.**

**D-14 · gitleaks runs only after a push.** No pre-commit hook, which is precisely the case
CI-only scanning cannot prevent.

**D-15 · `workspace_id` is a stated invariant that no table has.**
`RASEED_V2_CLAUDE_CODE_PROMPT.md:31` lists it among *inherited* invariants. Every synced table
carries `user_id`; `workspace_id` appears nowhere. The W track is a breaking migration across
all 17 tables and 17 policies, not a feature.

**[resolved] D-16 · The 3D globe.** Krishna ruled: WebGL authorised. Shipped as a data-driven corridor rather than a globe (`476b108`) — every particle is a real transfer. Original finding: `RASEED_V2_MASTER_BUILD.md:18` and `:198`,
`RASEED_V2_CLAUDE_CODE_PROMPT.md:89`, `WEB_ARCHITECTURE.md:88`.
`components/charts/corridor.tsx` is a CSS-3D corridor; a WebGL version was later requested
verbally. `CLAUDE.md` is silent, so it does not adjudicate. **Open — needs a ruling.**

### Things that are genuinely strong

- `eslint.config.mjs:22-90` turns the engines-purity invariant into *enforced* lint rules, in CI.
- The money invariant holds; the one raw operation on minor units is the FX freeze itself.
- The spend predicate holds on mobile (`migrations.ts:59-61` renders it from the shared source).
- `docs/AUDIT_EXCEPTIONS.md` documents every acknowledged GHSA with a removal condition and date.
- `CLAUDE.md`'s "do not export Expo Web to Vercel" is respected — `.vercelignore` excludes it.

---

## 3. Risks

### R-1 · D0 is provisioning, not migration

There is no project to migrate. **Nothing already built breaks under D0**, precisely because
nothing is wired to Supabase. The real risk is inverted: **the migration SQL has never met a
real Postgres.** It is verified against PGlite only, and `rls.test.ts:14` says so — "What this
does NOT prove: that Supabase's GoTrue populates `auth.uid()` the way the shim does." Seventeen
tables, 17 policies and a `security_invoker` view meet a real `auth.uid()` for the first time.
That is where surprises will be, not in row counts.

### R-2 · S4 has zero surface

Its verify is *"assert on the actual outbound payload"*. There is no outbound payload. Building
it now yields code whose only test mocks a caller that does not exist. Its natural home is a
gate inside Mobile P3.

One structural constraint worth recording: `eslint.config.mjs` forbids `fetch` inside
`@raseed/engines`, so **redaction must live outside engines** — the pure matcher could live
there, the network call cannot.

### R-3 · No auth means `user_id` is a literal

`apps/mobile/src/db/queries.ts:14` — `const USER = 'local-user'`. Every device row carries that
constant; Postgres expects a `uuid` matched against `auth.uid()`. On first sync **every local
row fails the RLS `with check`**. This appears in no phase description and is owned by neither
D0 nor P10.

### R-4 · The committed root `ios/` would have broken EAS — **[fixed]** in `e16ee58`

---

## 4. Execution plan

`OPERATING_GUIDE.md` §3 orders: D0 → S4 → S5 → ship → D1–D7 → C1–C6 → S0–S3,S6–S10 → V → W.
Per that guide's own §5 ("two docs disagree → the code wins"), **positions 2 and 3 are wrong**.

| # | Phase | Sessions | Note |
|---|---|---|---|
| 0 | Repo hygiene + invariant repair | **done** | `e16ee58`, `a8a1542`, `57ef305`, `bf2e595` |
| 1 | **D0′ — provision** Supabase in-region, apply migration, first real `auth.uid()` | 1 | Region is fixed at creation, so still first |
| 2 | **S0 — auth (email OTP)** | 2 | **Promoted from position 6.** Without it RLS protects nothing |
| 3 | **`user_id` reconciliation** | 1 | **Unlisted in every doc.** Blocks sync |
| 4 | Mobile P10 — sync | 3 | |
| 5 | D1–D7 | 4–5 | D3, D5, D6 need no app changes |
| 6 | C1, C3, C5, C6 | 2 | |
| 7 | S3, S6, S7-finish, S8, S9, S10 | 4 | S6 and S7 are ~0.5 each, any time |
| 8 | Mobile P3 **+ S4** | 3 | S4 is a gate inside P3 |
| 9 | Ledger Link **+ S5** | 2 | |
| 10 | V1–V4, then V5–V7 | 6+ | V1 needs `capture_log` populated |

**Parallelisable, no app-code dependency:** D3, D5, D6, C1, C3, C4, C5, S6, S7 — roughly five
sessions that never block the critical path.

### Cut

- **S4 and S5 as standalone phases** — merged into P3 and Ledger Link. Biggest single saving.
- **C2 (ADRs)** — add a table of contents to `DECISIONS.md` instead. ~1 session.
- **C4 (mutation testing)** — defer; engines already carry 342 tests, several property-based.
- **S2 (passkeys)** — experimental API, second login method, zero users. Cut.
- **D4 (k6 at 100 concurrent)** — analytics run in the browser; this would load-test Supabase's
  infrastructure, not ours. Defer until a server-side path exists.
- **W1–W12** — spec now exists but is derived; gated on the business path.

### Add — listed in no doc

- `user_id` reconciliation (R-3).
- **Mobile P1 completion** — edit/delete a transaction, in P1's own verify criterion.
- **Web data export** — `RASEED_SECURITY_ARCHITECTURE.md` §3 frames it as a DPDP right.
- **A mobile test harness** (D-11).

---

## 5. What this audit did not verify

- **Did not run any test suite.** The 874-test total is read from cached `.turbo/turbo-test.log`,
  not re-executed. `apps/mobile` contributes zero.
- e2e spec count **unsure** (D-9).
- Did not measure Lighthouse, and did not run the DuckDB 400ms benchmark.
- Did not open a Supabase dashboard or confirm the Vercel deployment responds.
- Did not audit `packages/fixtures` generation logic in depth.
