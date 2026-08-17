# RASEED — Decisions

Append-only. One entry per session, five lines max per decision. A decision that only exists in
conversation is a decision that will be lost and silently reinvented differently.

---

## Session 0 — Monorepo scaffold (2026-08-16)

**Next.js 16.3.1, not 15.**
`MONOREPO_PLAN` and `WEB_ARCHITECTURE` both said Next 15. Verified against npm: 16.3.1 is current
stable (3 Aug 2026); the 15.x line is maintenance backports only. Greenfield App Router means the
migration cost is ~zero, so starting a major in debt bought nothing. Both docs amended to say 16.

**TypeScript 6.0.3, not 7.0.2.**
TS 7 (Go-native, ~10× faster `tsc`) is stable but has no stable programmatic API until 7.1.
`typescript-eslint@8.67` peers `typescript <6.1.0`, and `eslint-config-next@16.3.1` depends on it —
so TS 7 and a working `turbo lint` are mutually exclusive today. Independently confirmed: the Expo
SDK 57 template ships `typescript: ~6.0.3` too. Revisit when typescript-eslint supports 7.x.

**ESLint 9.39.5, not 10.8.1.**
Discovered by failure, not by planning: ESLint 10 changed the rule context API and
`eslint-plugin-react@7.37.5` (peers `eslint ... || ^9.7`) throws
`contextOrFilename.getFilename is not a function`. Both `eslint-config-next` and `eslint-config-expo`
depend on it, so ESLint 10 broke lint in *both* apps. No 7.x release supports ESLint 10 yet.

**No `metro.config.js` at all.**
The session brief said to configure `watchFolders` per expo/metro-config's monorepo setup. That
guidance is stale: since SDK 52 Expo auto-detects monorepos, and the docs explicitly say to *delete*
`watchFolders`, `resolver.nodeModulesPaths`, `extraNodeModules` and `disableHierarchicalLookup`.
The absence of the file is the correct configuration. Metro resolving `@raseed/*` proves it.

**React pinned to 19.2.3 via `pnpm.overrides`.**
Expo SDK 57 pins react exactly `19.2.3`; `create-next-app` installed `19.2.8`. Under
`node-linker=hoisted` two Reacts in one tree is a Metro failure waiting to happen. The override
forces one copy workspace-wide. Verified: exactly one `node_modules/react`, at 19.2.3.

**`nodeLinker: hoisted` written in two places.**
`CLAUDE.md` mandates `.npmrc`, and it is there. But pnpm 11+ reads only auth/registry settings from
`.npmrc`, so the same setting is also in `pnpm-workspace.yaml`, which is where pnpm 11 will look.
pnpm is pinned to 10.30.3 via `packageManager`. Keep the two in sync.

**Node 24.19.0.**
Local was 20.20.0, which reached EOL on 30 Apr 2026. Next 16 requires ≥20.9 so this was hygiene,
not a blocker. Pinned via `.nvmrc` + root `engines.node`, and CI reads `node-version-file: .nvmrc`
so local and CI cannot drift.

**Docs moved into `docs/`.**
`CLAUDE.md` referenced `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/MOBILE_ARCHITECTURE.md` and
`docs/WEB_ARCHITECTURE.md`; none of those paths existed. Renamed per `SESSION_RUNBOOK.md` §Setup.
Every path `CLAUDE.md` names now resolves.

**21st.dev card shipped in `apps/web` — scope override, with contained debt.**
Session 0 says "no UI beyond what proves the wiring works"; the 21st.dev component was requested
anyway. Adapted rather than pasted: the generated source imported `framer-motion`, which `CLAUDE.md`
forbids, so it imports `motion/react`; the count-up is gated behind `useReducedMotion()`; the accent
resolves from a CSS variable instead of a hardcoded palette. **Debt:** all hex sits in one `:root`
block in `apps/web/app/globals.css` and in `apps/mobile/src/app/index.tsx`'s StyleSheet, because
`@raseed/tokens` is a placeholder until S1. S1/S6 delete both.

**CI runs `turbo typecheck lint test --continue`.**
`--continue` is load-bearing, not cosmetic. With `dependsOn: ["^typecheck"]`, a break inside a shared
package fails that task and Turborepo *skips* the dependent apps — which reads like a pass. Without
`--continue` the CI signal would hide exactly the failure this session exists to prove.

**Deferred:** Android (no JDK on the machine; `sdkmanager` present but only cmdline-tools) and EAS
(`eas login` needs credentials). Neither is wired; both are their own step.

---

## Session 1 — @raseed/money + @raseed/tokens (2026-08-16)

**`fromMajor` takes a string, not a number.**
`fromMajor(0.1 + 0.2, 'INR')` would be a float bug at the call site. Taking a string makes
the bug unrepresentable. Parsing is integer-only: pad the fraction to the currency exponent
and concatenate, never multiply by 100.

**`allocate` distributes the remainder one minor unit at a time, from the front.**
`allocate(money(100,'INR'), 3)` is `[34, 33, 33]` — the S1 done-when criterion, asserted
literally. A property test sweeps every amount 0-200 across 1-7 parts and asserts the parts
always sum back to the original. Zero-ratio participants are skipped when handing out the
remainder, so someone who owes nothing is never handed a stray paisa.

**tokens.ts is the truth; tokens.css is a committed twin with a parity test.**
No build step is allowed, so the CSS cannot be generated at install time. Instead
`parity.test.ts` parses tokens.css and asserts every block matches the TS palette. Verified
by injecting a one-hex-digit drift and watching it fail — the S2 lesson applied early.

**Three colours were changed to pass contrast, found by test not by eye.**
The parity suite holds every accent to 4.5:1 on surface-1 in BOTH themes. Light `inr`
(4.33), light `good` (4.49) and dark `warn` (4.30) all failed. Solved numerically to
`#A36821`, `#3E8536`, `#DB5C56`. The old light brass was the open thread from S0; it is now
enforced by a test rather than a note.

**Android removed.** iOS + web only, per instruction. `android` block dropped from app.json,
adaptive-icon assets and the `android` script deleted. EAS profiles remain platform-agnostic.

---

## Session 2 — @raseed/schema + Supabase migrations + RLS (2026-08-16)

**RLS verified against real Postgres via PGlite, not Docker and not the cloud.**
Docker was ruled out and no Supabase credentials were available. PGlite is Postgres
compiled to WASM running in-process, and RLS is core Postgres rather than a Supabase
add-on — so the policies exercised in `rls.test.ts` are the ones that will run in
production. `auth.uid()` is shimmed to read `request.jwt.claim.sub`, the way PostgREST
sets it. Stated assumption, not a hidden one: this does not prove GoTrue populates that
claim identically.

**`v_spend` needed `security_invoker = true`, and the test is what found it.**
A Postgres view executes as its OWNER, so RLS on the underlying table is bypassed and the
view returned every user's rows. This is the classic Supabase view leak. Removing the
option re-breaks the test on demand, so the fix is provably load-bearing rather than
cargo-culted.

**contract.ts is the truth; everything else is generated and committed.**
`scripts/generate.mts` emits sqlite.ts, pg.ts, zod.ts and the migration. It is an authoring
tool, not a build step — the output is committed. `parity.test.ts` introspects the real
Drizzle column objects (not the source text), so a wrong column helper is caught, not just
a typo. Verified against three injected drifts: nullability desync, type desync, and a
column deleted from one dialect. All three fail the suite.

**`integer` maps to pg `bigint`, not `integer`.**
`occurred_at` holds epoch milliseconds, which overflows a 32-bit pg integer 24 days after
1970. Easy to miss because SQLite's INTEGER is already 64-bit and would never complain.

**FKs live in the migration, not in the Drizzle definitions.**
`transactions.reversal_of_id` is self-referential and Drizzle's `.references()` cannot
express that without a circular type. The database enforces them either way.

**Still outstanding:** the migration has never been applied to a real Supabase project.
`supabase link` + `db push` needs Krishna's login. Everything is authored and tested; only
the cloud apply is pending.

---

## Session 3 — @raseed/engines, domain half (2026-08-16)

**Seven pure functions, 65 tests, no Date.now() anywhere.** Time is a parameter on every
function that needs it, so a midnight recompute is a call rather than a side effect and
every edge case is reachable from a test.

**safeToSpend guards the two ways the formula goes wrong.** A negative pool yields a zero
allowance rather than a negative daily via integer division, and carryover is clamped to
[0, 3 x baseDaily]. Without the cap a frugal week hands you a number that invites a
blowout; without the floor a negative carryover would silently tax today.

**pairReversals is greedy nearest-match, oldest debit first.** Each row is used at most
once. A refund must come AFTER its debit — an inflow before it is not a reversal, which a
naive absolute-time-window check gets wrong. A missing merchant on the refund is accepted
(refunds often arrive as a bare bank descriptor); a *different* merchant is disqualifying.

**detectRecurrence is CV-based, not regex.** Interval CV < 0.15 and amount CV < 0.10 over
at least 3 observations. This survives a payment landing a day late, which a fixed-period
rule does not, and it annualises a price hike: 649 -> 799 monthly reports as +1,825/year.

**detectRemittance reports what the spread cost, not just that a transfer happened.**
efficiency = implied / mid-market, and costMinor is what you would have received at
mid-market minus what you actually got. Same-currency movement is excluded — that is an
internal transfer, not a remittance.

**rankNudges saturates impact.** score = |impact| x urgency x novelty x (1 - fatigue), with
impact normalised through a ceiling so one enormous number cannot monopolise the week's
four slots. A zero score never ships even when slots are free, and suppressed nudges expire
rather than queueing for next week.

**regretRate weights by amount, not count.** Ten regretted chais matter less than one
regretted 8,000 dinner. Unrated transactions stay out of the denominator — a skipped
rating is not evidence of satisfaction — and `coverage` is reported so a category rated
twice is visibly less trustworthy than one rated thirty times.

---

## Session 4 — engines finance/stats + @raseed/fixtures (2026-08-16)

**xirr uses bisection, not Newton-Raphson.** Slower, but it cannot diverge. It returns
`null` when there is no sign change rather than a confident wrong number — a financial
figure that silently fails to converge is worse than one that admits it.

**amortise's final payment absorbs accumulated rounding.** Found by test: the level payment
is rounded to whole minor units, so over 240 periods the schedule ended with 56 paise
outstanding. The last period now settles the balance exactly, and a test asserts total
principal repaid equals principal borrowed.

**budgetVariance keeps the interaction term separate.** rate x volume decomposition with
(p1-p0)(q1-q0) reported on its own rather than folded into one of the other two. Folding it
in is a choice, and hiding a choice inside a number is how dashboards mislead.

**MAD, not mean/sigma.** A test proves the point: with one 80,000 outlier in a week of ~200
days, the classic z-score is 2.4 — under the usual threshold, because the outlier inflates
sigma enough to hide itself. The robust score is >100.

**Block bootstrap is provably wider than IID.** A test builds an autocorrelated series and
asserts the block-resampled P10-P90 spread strictly exceeds the IID one. That is the whole
argument for the extra complexity, so it is asserted rather than assumed.

**Statistics have exactly one home.** `mean`/`median` were briefly defined in both
detectRecurrence and stats, which broke the barrel export with a name collision.
Consolidated into `stats/`; detectRecurrence imports from there.

**Fixtures are byte-identical for a seed, and the engines are asserted against them.**
Rather than trusting the generator, the suite runs pairReversals, detectRemittance and
detectRecurrence over the output and asserts they find the three planted refund pairs, both
planted remittances (at 1.5% worse than mid-market, so efficiency has something to report)
and the Netflix 649 -> 799 hike. A generator nobody validates is a generator that drifts.

**Weekend spend is heavier by construction**, so the autocorrelation block bootstrap exists
for is actually present in the demo data.

---

## Session 6 — Web P0 shell + three-state theme toggle (2026-08-16)

**`next dev` runs on webpack, not Turbopack.** Turbopack in Next 16.3.1 under pnpm's
hoisted linker cannot resolve Next's own Pages-Router internals
(`next/dist/shared/lib/utils`, `next/dist/compiled/*`), producing ~25 module-not-found
errors, a 500 and dead HMR. `next build` and `next start` are completely clean, and
`next dev --webpack` is completely clean — so this is Turbopack-specific and dev-only.
`dev` is pinned to `--webpack`; `dev:turbo` is kept to retest on the next Next release.

**The theme toggle uses `useSyncExternalStore`, not setState-in-an-effect.** The usual
next-themes mount guard trips the React Compiler lint rule about cascading renders. A
server snapshot of false and a client snapshot of true gives the same "am I hydrated"
answer without scheduling a second render pass.

**Three states, not a binary switch.** Light / System / Dark as a radiogroup. Collapsing
"system" into a toggle silently overrides the OS preference the first time someone clicks.
Verified all three: Light writes `data-theme="light"` and the light palette resolves;
System writes `dark` on this machine because the OS prefers dark; Dark forces it.

**The currency lens lives in the URL via nuqs**, so a view pasted into Slack reproduces
exactly — including which currency it was read in. It swaps which column is read; it never
recomputes history.

**The panel left edge encodes the currency mix of the data inside it**, not decoration:
warm for INR-dominant, cool for AED, a gradient in between. Category bars use the same
logic for need vs want. Every colour resolves from a CSS variable at render, so a theme
change re-resolves it — a hardcoded chart palette is the most common way theme toggles
break.

**Charts are hand-built CSS, no chart library yet.** visx and d3 arrive at S10 with the
real chart foundation. A bar whose width is a share needs no dependency, and the reveal
animates `transform` only.

**Every rail route exists**, with an honest placeholder naming the session that fills it
and what it will contain — rather than an empty chart frame that looks broken.

---

## Vercel deploy (2026-08-16)

**Live: https://raseed-eosin.vercel.app** — public, no login, as the spec requires ("a
portfolio piece behind a login is a portfolio piece nobody sees").

**The root directory has to be `apps/web`.** Three deploys failed at "Deploying outputs"
with `Cannot patch preview comments when immutable static file upload is enabled. Upgrade
to next@v16.3.0-canary.32 or newer` — while running Next 16.3.1, which is newer. The build
succeeded every time; only the upload failed. Cause: with no root directory set, Vercel
looks for `next` in the repo-root package.json, finds nothing, and its version check fails
open. Setting `rootDirectory: apps/web` lets it read the app's own manifest. This is what
MONOREPO_PLAN §7 said all along.

**Project settings own the build, not vercel.json.** With the root directory set, Vercel's
native pnpm-workspace detection installs from the repo root so `@raseed/*` resolve, and
runs `next build` in apps/web. The root `vercel.json` was removed because its overrides
fought those settings.

**`turbo-ignore` is on** (`npx turbo-ignore web --fallback=HEAD^`), so a mobile-only commit
does not burn a Hobby build.

**`.vercelignore` excludes node_modules and apps/mobile** — the first CLI deploy tried to
upload 19,221 files and was rejected at the 15,000 limit.

---

## Session 5 — Mobile P0 shell (2026-08-16)

**Three tabs, maximum: Today / Ledger / You.** Navigation is not the product; the capture
bar and the dial are. Anything that would want a fourth tab belongs inside one of these.

**One `useTheme()` hook is the only place mobile resolves a colour.** It reads
`@raseed/tokens` and follows the system scheme, so the phone and the dashboard share one
palette — and `grep` for a hex literal outside the tokens package returns nothing across
both apps.

**Fonts come from `@expo-google-fonts/*`**, registered under short names (Bricolage, Geist,
GeistMono) so the StyleSheet reads cleanly. The splash screen hides on `fontsLoaded ||
fontError` — a font that fails to load must not leave the user staring at a splash forever.

**Today's number is the real engine, not a mock.** `safeToSpend` runs with the fixture
ledger's actual spend-so-far, so the meter, the carryover and the days-to-payday are all
consistent with the same arithmetic the tests cover. The flat meter is a placeholder for
the Skia Day Dial at Session 9; the maths does not change when the visual does.

**The mobile spend predicate mirrors contract.ts**, defined once in `src/lib/demo.ts`.
Session 7 swaps the fixture source for op-sqlite + Drizzle behind the same shapes, so the
screens do not change.

**Empty states are invitations.** "Nothing logged yet. Tap the bar and type what you spent."
— not an apology, and not a shrug emoji.

**AED renders as the ISO code, not the Arabic symbol** — found on the simulator, not in a
test. `د.إ` is right-to-left, so bidi reordering turned `د.إ101.09` into `101.09 ﺩ.ﺇ`: the
symbol jumped behind the number and the glyphs re-formed. UAE bank statements print
"AED 101.09" for exactly this reason. A regression test now asserts `format()` emits no
character in the RTL ranges.

---

## Session 7 — Mobile P1: op-sqlite + Drizzle + manual entry (2026-08-16)

**The DDL is generated from the contract, not hand-written.** `src/db/migrations.ts` renders
CREATE TABLE from `@raseed/schema`'s `TABLES`, so the device schema cannot drift from the
Postgres one. CHECK constraints come across too — an invalid `txn_type` is rejected on
device, not only on the server.

**`v_spend` is rendered from `spendPredicate()`, the same string the Supabase migration
uses.** Verified on the simulator against a hand-built six-row fixture: a normal spend, a
transfer, a pending row, a soft-deleted row, and a reversal pair. The view returned exactly
one row. SQLite needs no `security_invoker` — one user per device, nothing to scope.

**Persistence proven by force-quit, not by assertion.** Killed the app, wrote rows, relaunched:
Safe-to-Spend moved 7,754.44 -> 7,014.44, exactly the 740.00 that was inserted. The engine,
the view and the database all agree on the same number.

**No query library.** op-sqlite is synchronous over JSI, so reads are cheap enough to redo
on render. A 40-line `useQuery` over `useSyncExternalStore` replaces TanStack Query entirely;
there is no async cache to invalidate. Legend-State and the Supabase plugin arrive when there
is a second device — at n=1 they are complexity paid for and unused.

**`useNow()` instead of `Date.now()` in render.** The React Compiler rejects impure calls
during render, which is the same rule `@raseed/engines` follows by taking time as a
parameter. The hook refreshes on app foreground, on tab focus, and at midnight — precisely
when Safe-to-Spend must recompute anyway.

**Writes freeze `fx_rate` and `home_amount_minor` once.** Nothing recomputes them later;
changing home currency must not rewrite history. Soft delete only.

**Known, not a bug:** the dev client shows an "Open in RASEED?" prompt on each launch. That
is `expo start` handing over a deep link, not app behaviour — it does not appear in a
release build.

---

## Landing route — motion pass (2026-08-16)

**Lenis on `/` only.** The dashboard keeps native scroll: hijacked scroll fights dense data,
and a chart you are trying to read should not glide past you. Reduced motion gets no Lenis
at all rather than a slower Lenis.

**The hero animates the variable font's width axis**, not just position — Bricolage
Grotesque narrows as it scrolls away. That is the one showy moment; everything else is a
120ms fade-and-rise.

**`viewport={{ amount: 0.05 }}`, never a negative margin.** The first attempt used
`margin: '-80px'`, which means an element that never sits 80px inside the viewport never
fires — and since the initial state is `opacity: 0`, that content is then invisible forever.
Short viewports hit this. Above-the-fold blocks now animate on mount instead of waiting for
a scroll that will not come.

**A `.no-js` fallback forces every reveal visible.** Content whose only path to visibility is
JavaScript is a portfolio page that renders as a headline over empty space if a chunk fails
to load. An inline script strips the class before paint; if it never runs, CSS wins.

**Measurement note for future sessions:** the browser pane reports
`document.visibilityState === 'hidden'` when backgrounded, which pauses `requestAnimationFrame`
and therefore all Motion animations. Evaluating JS against it will show elements frozen at
their `initial` state and look exactly like a broken animation. Screenshots foreground the
pane and are the reliable check. This cost a detour; it is not a product bug.

---

## Session 8 — Web P1: DuckDB-WASM + Arrow ingest (2026-08-16)

**The 400ms view-rebuild budget holds at 100k rows: 41ms.** Measured in the browser on the
`/lab` route rather than quoted from the doc, and the button is still there so anyone can
re-run it. Rows are the real fixture distribution cloned across years, so cardinality stays
realistic — a single repeated value would compress away and flatter the number.

**Arrow encoding must preserve NULL, and this cost a real bug.** The first pass coerced
`merchant_id`/`reversal_of_id` nulls to `''`. `reversal_of_id IS NULL` then matched nothing,
`v_spend` returned zero rows, and the dashboard rendered ₹0.00 spent with no error anywhere
— income was fine, which made it look like a data problem rather than an encoding one. Fixed
with explicitly typed `vectorFromArray`; `tableFromArrays` infers per column and does not
keep nulls. `deleted` is a real BOOL for the same reason.

**DuckDB and the old TypeScript reductions agree to the paisa.** ₹88,781.92 spend, 79.9%
savings rate, Gini 0.45, six merchants at 80% — identical across both implementations, which
is the cross-check that the spend predicate survived the port. 951 spend rows of 979: the 28
excluded are 18 salary rows, 4 remittance legs and 6 reversal-pair rows. That reconciles.

**One spend predicate, three engines.** `v_spend` in DuckDB, in the Supabase migration, and
in the mobile SQLite view are all rendered from `spendPredicate()` in
`@raseed/schema/contract`. DuckDB needs no `security_invoker` — the browser only ever holds
one user's rows.

**Every SQL string lives in `lib/duck/queries.ts`.** Verified by grep: no SQL in any
component or page.

**Arrow build is the slow part, not DuckDB.** At 100k rows: build 4,509ms, insert 271ms,
view rebuild 41ms. Building the columnar buffers in JS blocks the main thread, which is
precisely the work Session 18's Comlink workers exist to move off it. The engine itself is
not the bottleneck.

**The provider is dashboard-only.** The landing route must not pull ~3MB of WASM to render a
headline, so `DuckProvider` wraps `(dash)` and nothing else, and it loads after first paint.

**Three states everywhere:** skeletons at final dimensions, empty states with a real
instruction, and errors that print the actual failure. An analytics failure rendered as an
empty chart is indistinguishable from "you have no data", which is the worse of the two.

**Two more bugs the browser found after the first S8 commit:**

`v_daily` used `to_timestamp()`, which returns TIMESTAMP WITH TIME ZONE — and DuckDB has no
TIMESTAMPTZ -> DATE cast. The view created without complaint and threw the moment anything
selected from it, so the anomaly panel sat on a skeleton forever while the console carried
`Conversion Error: Unimplemented type for cast`. `epoch_ms()` returns a plain TIMESTAMP and
fixes it.

That bug was only *invisible* because `useDuckQuery` swallowed rejections: a failed query
left `data` null, which renders as a skeleton, which is indistinguishable from a slow load.
It now returns `{ data, error }` and every panel renders `PanelError` with the real message.
A permanently-pulsing skeleton is a worse failure than a red box, because nobody
investigates it.

---

## The currency lens actually converts, and four tabs became real (2026-08-16)

**The lens was cosmetic and is now load-bearing.** `?lens=AED` selected the chip and changed
nothing — every figure still read `home_amount_minor`, which is INR. Fixed by giving every
fixture row `fx_inr_per_aed`, frozen at its own transaction date, and expressing the lens as
a SQL fragment: INR reads the home column, AED divides by that row's frozen rate, native
reads the amount in the currency it was actually spent in. It swaps which column is read; it
never recomputes history. Verified: with `lens=AED` there is not one `₹` left on the page.

**Holt-Winters accuracy is weekly sMAPE, not daily MAPE.** Daily MAPE read 197.7% — not
because the forecast was bad, but because MAPE divides by the actual and personal spend has
near-zero days. `smape` is bounded at 200% and is the standard choice for intermittent
series; weekly buckets are also the question anyone actually asks. Added to `@raseed/engines`
with a test that shows MAPE exploding past 1900% on the same input where sMAPE stays under 2.

**Every dashboard route needed its own Suspense boundary.** `useSearchParams` (via nuqs)
forces a client bailout during static prerender, so the build failed on `/flows` and
`/categories` the moment the pages read the lens directly rather than only through the top
bar. Each page now wraps its client component with a skeleton fallback sized to the real
layout.

**The Sankey is hand-built SVG, not d3-sankey.** The layout here is a fixed three-column
flow, so a general-purpose layout solver would be more dependency than geometry. Ribbon
heights are proportional to value, so the picture cannot disagree with the totals.

**The ⌘K bar is a deterministic rules parser, not an LLM.** It cannot answer everything, but
it never invents a number and it needs no API key. The generated SQL is always shown, and the
sandbox rejects anything that is not a single SELECT.

**Web writes go to localStorage and are layered into the ingest.** A visitor's additions live
only in their own browser and never touch anyone else's data, which is what makes a public
demo with write access safe. The benchmark path deliberately skips them so the row count it
reports is exactly what was requested.

---

## The daily loop, the Lab, and the sandbox test (2026-08-16)

**The streak counts days you RECORDED, not days you underspent.** Rewarding low spend makes
skipping lunch look like virtue, and it punishes an honest expensive week. Rewarding the
logging habit rewards the thing the app actually needs from you.

**The rating queue only asks about the top 40%.** Above the 60th-percentile transaction,
unrated, most recent first, five at a time. Asking about a 20-rupee chai spends the one
interaction anyone will actually give you.

**Nudges are capped at four a week and unused slots are not banked.** Scored on
|impact| x urgency x novelty x (1 - fatigue) through the tested `rankNudges` engine.
Everything under the cut expires silently rather than queueing — notification fatigue is the
named reason these apps get uninstalled, so attention is spent as a budget.

**Benford honestly reports non-conformance on this data.** χ² 117.71 against a 15.51 critical
value. That is correct and expected: everyday spend occupies a narrow band of magnitudes, and
Benford only means something across several orders. The panel says so rather than hiding a
red number, because a forensic test that always passes is not a test.

**Dates are cast to VARCHAR in SQL, not parsed in JS.** DuckDB returns DATE through Arrow as
a Date32 number; `String(day).slice(0,10)` turned it into "1752796800 was unusual" on the
Reckoning page. Casting at the query boundary removes the guesswork entirely.

**The SQL sandbox now has the twelve adversarial strings S16 asked for** — stacked DROP and
DELETE, bare DDL, ATTACH, INSTALL, COPY, PRAGMA — plus a check that the parser itself cannot
be talked into emitting anything unsafe. 27 tests. The parser is deterministic today; the
boundary is guarded for the day a model is allowed to write the SQL.

**Only rows you added can be deleted.** The seeded demo is shared across every visitor, so it
is read-only and shows no delete control at all rather than a button that fails.

---

## S18 — the worker, and the invariant that named the wrong workload (2026-08-16)

`WEB_ARCHITECTURE.md` says: "Heavy math — Web Workers + Comlink. Monte Carlo with 10,000
paths blocks the main thread. Non-negotiable." So I moved the forecast maths into a worker
and measured it.

**It takes 7ms.** Ten thousand paths over a fourteen-day horizon is 140,000 samples, and
Holt-Winters over 180 points is nothing. The invariant is right that heavy work must not run
on the main thread; it is wrong about which work is heavy. Writing that down rather than
quietly banking a win.

**The real blocker was the Arrow encoding: 837ms at 100,000 rows.** Building the typed
vectors is pure JS on the main thread, and for a solid second nothing paints, no click lands
and the theme toggle does nothing. The Lab's own copy had been admitting this for two
sessions ("moving it to a worker is what Session 18 is for") — shipped text describing work
that had not happened.

So the worker does both. Measured after, with a probe worker pinging the main thread every
8ms — worker timers ignore page visibility, which `requestAnimationFrame` does not, and an
rAF-based measurement in a backgrounded tab reads zero and looks like a pass:

| | before | after |
|---|---|---|
| Arrow build | 837ms **on the main thread** | 986ms **in the worker** |
| Insert | 78ms | 34ms |
| Longest main-thread block | ~840ms | **16ms** (one frame, 2,500 samples, none over 200ms) |

**IPC bytes, not an `arrow.Table`.** A Table is a graph of typed-array views; structured
clone would deep-copy every one and hand back most of the time the worker just saved.
`tableToIPC` gives one ArrayBuffer per table, transferred with zero copies, and the main
thread calls `insertArrowFromIPCStream`. That is also why insert got faster.

**One worker, two methods.** Two workers would mean two module instantiations and two copies
of `apache-arrow` to separate a 10ms job from an 840ms one that never run concurrently.

**Every call falls back to running inline.** Same function, so the two paths cannot disagree
on a number. A browser that refuses workers should cost you frames, not the page. The
forecast page states which path ran rather than assuming.

**localStorage is the boundary.** It does not exist in a worker, so the main thread collects
your added rows and passes them in. That constraint is what made the split clean.

**The `add-expense` category list is now read at render** — no memo, no version counter.
`exhaustive-deps` was right that a counter it cannot reason about is a smell; re-reading a
handful of names on each keystroke costs nothing and deletes a state variable.

---

## S19 — splits, cash, and a lock-up that had been shipping for two sessions (2026-08-16)

**Your spend is your share.** Paying ₹4,000 for four is ₹1,000 of spending and ₹3,000 owed
to you. Recording the ₹4,000 says you overspent on a night you did not, and every category,
budget and forecast downstream inherits it. `splitBill` returns the shares, your share, and
what you are owed — the last by subtraction from the total, never a second allocate, so the
two numbers reconcile no matter how the remainder fell.

Tested by walking **every amount from 1 to 200 paise, split 2 through 9 ways** — 1,600 cases
checking the shares sum to the total exactly and no two differ by more than one paisa. The
remainder is where splitting goes wrong, so the test enumerates rather than samples.

**Cash reconciliation is the money every other tracker loses.** Card spend records itself;
cash does not. ₹5,000 leaves an ATM and disappears over three weeks in autos and chai. The
fix is not logging the autos — it is counting the wallet occasionally and letting the
difference become one honest row. The first count is a baseline and writes nothing; after
that expected = last count − cash spend since. A zero delta writes nothing at all, because a
₹0.00 "Uncategorised cash" row makes the honest rows harder to trust.

The adjustment row is stamped at the same instant as the count, and `cashSpentSince` filters
strictly `occurred_at > at`. With `>=` the adjustment would count itself and the wallet
would walk down by its own delta on every render.

**`cat-cash` is kind `want`, and that is a guess.** Cash that leaves a wallet unrecorded is
mostly autos, chai and tips, but nobody knows. It is named "Uncategorised cash" everywhere
it appears so the guess stays visible instead of being laundered into a confident category.
Adding an `unknown` kind would touch `contract.ts`, `v_spend`, both schemas and every
need/want/save chart — too wide for one session, and recorded here rather than forgotten.

### Three bugs the verification found

**The app locked up after adding anything.** `reload()` set `requestedRows` to `undefined`
when it was already `undefined`; React bails out on an identical value, so the effect never
re-ran and `status` stayed `'loading'` for the rest of the session. The Add button and ⌘K
went permanently disabled, and — worse and quieter — **every expense you added never reached
the figures until a manual refresh.** This had been live since the add flow shipped. The
re-ingest is now keyed on a fresh object with a nonce, so it is unconditional.

Worth naming why it survived: the earlier check confirmed the row reached localStorage and
that the panel updated. The panel updated from its own local state. Checking that the write
landed is not the same as checking the read came back.

**Every expense you added read "Unknown" in the ledger.** `raw_text` was never among the
columns encoded into Arrow, so the only name available was a join on `merchant_id`, which a
manual row does not have. `raw_text` and `note` now ride along, and the ledger shows the note
under the merchant — so a ₹333.34 row explains that it is one third of ₹1,000.

**Every unedited quick add was filed as Rent**, because the category defaulted to the first
seeded entry. It defaults to Eating out now.

### Still open

S19 is the **mobile** ship gate in the plan and only the web half is built. The maths lives
in `@raseed/engines` with its tests, so the phone inherits the logic rather than reimplements
it, but the mobile split sheet and wallet prompt are not written.

---

## End-to-end tests, and proving they fail (2026-08-16)

Twenty Playwright specs against a real `next build && next start`, not `next dev`. The worker
chunk only exists in the production bundle and prerendering is what exercises the Suspense
boundaries, so a dev-only run would have proved nothing about either.

**Every spec was checked by reintroducing the bug it covers.** A test that has never failed
is a test nobody knows works.

That exercise immediately corrected something I had written in a code comment. I claimed the
`nonce` in the provider's request object was load-bearing. It is not — I reintroduced the
bug by freezing the nonce and the suite still passed green, because `{ rows, nonce }` still
allocates a **fresh object** every call and object identity is what re-runs the effect. Only
reverting to a primitive `useState<number | undefined>` turned it red. The comment now says
what is actually true, and why the nonce stays anyway: to stop the next reader "simplifying"
it back to a number.

**The Add button is the readiness probe.** It is disabled unless `status === 'ready'`, so
waiting on it doubles as a regression check on the exact state machine that got stuck.

**Two assertions were wrong before the code was.** The split test asserted the row did not
contain "₹1,000.00" — but the note legitimately reads "Paid ₹1,000.00", which is the whole
point of having a note. And the lens test snapshotted `main` once, which passes the moment
the first panel repaints while others are still re-querying, reading as a lens leak that was
really a race. Playwright's auto-retrying `not.toContainText` asserts the stronger thing:
that *every* panel re-read.

**One worker, no parallelism.** Every spec writes to the same localStorage origin; running
them concurrently would make them fight over the ledger and produce exactly the kind of
flake that gets a suite skipped.

---

## Accessibility: what was real, and what was the measurement (2026-08-16)

Twenty more specs — axe-core over all eight routes in **both** themes, plus 360px overflow,
keyboard traversal, and the theme swap. First run: 18 failures. Most were not defects.

**The measurement was wrong three separate ways, and each one had to be ruled out before
touching a colour.** Repainting a palette to satisfy a bad reading is worse than not
checking at all.

1. **Mid-animation sampling.** axe reads computed colour at an instant, and a card a third
   through its fade-in reports the blend — `#edeff1` on `#ffffff`, a ratio of 1.15, for text
   that is perfectly legible once settled. Fixed by emulating `prefers-reduced-motion`,
   which also means these assertions now cover the static fallback `CLAUDE.md` requires.
2. **Mid-theme-transition sampling.** Flipping `data-theme` on a live page and measuring
   immediately catches every element blended between palettes. `#727579` — the background in
   a dozen "failures" — is almost exactly halfway between light `#E7EBEF` and dark
   `#212932`. next-themes ships `disableTransitionOnChange` for the toggle; setting the
   attribute directly bypasses it. The theme is now set **before load**, the way a returning
   visitor arrives.
3. **Disabled controls.** WCAG 1.4.3 explicitly exempts inactive components; axe cannot tell
   a 50%-opacity disabled button from a badly coloured one. Excluded, per the standard.

**What was genuinely broken:**

- **The category treemap faded its own labels.** `opacity: 0.14 + share * 0.5` was set on the
  tile container, so the text inherited it — a small tile rendered its label at 14% opacity,
  permanently. Now the tint is a `color-mix` background and the text stays opaque. Identical
  appearance, readable labels.
- **Five token values failed AA.** Computed, not eyeballed: light `inr` 3.84, `aed` 3.97,
  `good` 3.80; dark `warn` 3.98, `horizon` 4.49 — each against its worst surface. Corrected
  to the nearest value clearing 4.5. **Light was where four of the five lived**, exactly as
  `CLAUDE.md` warns.
- **The Add button had no accessible name below 640px.** The label is `hidden sm:inline` and
  the icon is `aria-hidden`, so a screen reader announced "button". Now always `aria-label`ed.
- **Two scroll regions were unreachable by keyboard.** `#content` carried `tabIndex={-1}`,
  which makes it a skip-link target but not something you can focus and drive with the arrow
  keys. The ledger's table container had no tabindex at all and most of its rows contain
  nothing focusable to tab to.
- **The page scrolled sideways at 360px** — 376px of header in a 360px viewport. My first
  diagnosis blamed the icon rail, because the heuristic picked the element with the largest
  bounding-box right and the rail's chips extend beyond their own correctly-clipped scroller.
  The real source was found by looking for elements whose `scrollWidth` exceeds their
  `clientWidth` while `overflow-x` is `visible`, which named the header directly.

**`contrastRatio`, `relativeLuminance`, `readableInk` and `meetsAA` now live in
`@raseed/tokens`** — the one package allowed to know what a hex literal is — with a test that
walks every ink against every surface in both themes. That test, not axe, is the thing that
will stop the next palette edit from regressing: it runs in `turbo test` in under a second.

One of my own test cases was wrong too: I used `#767676` as an example of a colour that
fails AA body text. It is 4.54:1 and passes — it is the classic AA boundary grey. `#8C8C8C`
(3.36) is the honest example.

---

## S19 on the phone, and the read that lags one write (2026-08-16)

The split control and the wallet count are live in the Expo app, calling the **same**
`splitBill` and `reconcileCash` from `@raseed/engines` that the dashboard calls. Verified on
the simulator: ₹1,000 three ways reads ₹333.34 / ₹666.66 owed / shares 33334/33333/33333 —
character-for-character what the web shows, because it is one implementation.

The wallet needed no new schema. `cash_counts`, `is_cash` and a real `Wallet (INR)` account
were already in `contract.ts`, so the device tables existed. On the phone there is also no
"paid in cash" toggle: you already pick an account, and one of them is the wallet. That is
strictly better than the web's extra switch, and the web should follow.

### A pre-existing bug this surfaced — not yet fixed

**Every read returns the state before the most recent write, until the process restarts.**
Save a transaction and the Today screen shows the previous total; save another and it shows
the one before that. Exactly one write behind, every time. A cold launch is always correct.
This predates this session — it is in the S7 data layer, and it means every number on the
phone's home screen has been one entry stale since manual entry shipped.

What was ruled out, each by measurement rather than reasoning:

- **Not the store.** A temporary counter rendered on screen showed the version incrementing
  0 → 1 on save, so `notifyChanged` fires and the component genuinely re-renders.
- **Not React Compiler memoisation.** Calling `spendBetween` *directly in the render body*,
  bypassing `useQuery` entirely, returned the same stale count. Threading the version through
  a `useMemo` changed nothing, so that change was reverted rather than kept as a talisman.
- **Not prepared-statement or parameter caching.** Inlining the bounds into the SQL instead
  of binding them changed nothing. (Reverted — parameters are the injection-safe form.)
- **Not notification timing.** Deferring the notify by a macrotask changed nothing.
- **Not two connections.** `getConnection()` memoises a single `open()`, and both the write
  and the read go through it. A connection cannot miss its own committed write, which is
  what makes this interesting.

The `sqlite3` CLI sees the row immediately after, so it does commit to the file. The
remaining suspect is inside op-sqlite's JSI layer, and chasing it is a library
investigation rather than a feature — logged here with the evidence instead of guessed at.
`useQuery` now carries a pointer to this entry so the next reader does not re-derive it.

Worth naming: the Ledger tab was showing the new row immediately while Today was not, which
is what made this look like a screen-level refresh problem for far longer than it should
have. The two tabs differ only in their WHERE clause.

---

## S15 — Trip Mode, inferred rather than declared (2026-08-16)

Nobody remembers to press "I'm travelling". But a trip leaves an unmistakable shape in the
ledger: a run of days where the money moves in dirhams **and the spending you would normally
do at home stops.**

That second clause is the whole feature. Without it, every cross-border online order becomes
a one-day "trip" and the tab is noise. `detectTrips` requires the away share of the window to
clear 60% and the run to last at least two days, tolerating a two-day gap — a quiet Tuesday
abroad is a lazy day, not a flight home. Eleven tests, including the two negative cases that
matter: a single AED purchase on an otherwise ordinary day, and a two-day run where the bulk
of the money still moved at home. Both correctly return no trip.

**Home spend is summed over the whole window, including the quiet days inside a gap.** Rent
does not stop because you are in Dubai, and excluding it would flatter the trip.

**"An ordinary day" is the median of days you were home, not the mean of everything.**
Including trip days is circular — a big trip raises the bar it is measured against — and a
mean lets one rent day set the standard for a Tuesday. That baseline is what makes
`tripExcess` meaningful: the interesting number is what travel cost you *beyond existing*,
not the gross total. Reporting the gross is how travel apps make every trip look ruinous.

**The trip query is deliberately not lens-aware.** A trip is a fact about where you were;
re-reading it through the AED lens would not change which days you were in Dubai. Dirhams
convert at the rate frozen on each row at its own date, so a trip costs what it cost then.

On the seeded ledger: 13 trips in 18 months, an ordinary day of ₹1,975.76, and ₹1,84,436 of
travel cost above staying home. Spot-checked — the 20–22 Jun trip's ₹12,350.53 all-in less
three ordinary days (₹5,927.28) is exactly the ₹6,423.25 excess shown.

---

## S13 — the merchant resolver, on device (2026-08-16)

`razorpay@hdfcbank` means nothing until someone tells you it is Big Bazaar. The point of the
alias table is that they only tell you **once**: the normalised descriptor is written back,
so the second occurrence resolves with an indexed lookup and no thought.

Two steps, cheapest first. An exact alias hit is one indexed read. Only on a miss does it
compare against normalised canonical names, and a match there is immediately recorded as an
alias — so the expensive path runs once per descriptor, ever. No model call on either path.

**Resolution happens on write, not on read**, and `raw_text` stays on the row regardless. It
is what you actually typed, and discarding it would make a wrong resolution impossible to
audit later. The ledger reads `COALESCE(m.canonical_name, s.raw_text, 'Unknown')`, so an
unresolved row still shows what you typed rather than "Unknown".

Verified on the simulator: typing `Swiggy@okhdfcbank` (iOS capitalised it) produced a row
with `merchant_id = m-swiggy` and canonical name **Swiggy**, and bumped that alias's
`hit_count` from 0 to 1. Note that `SWIGGY LIMITED` normalises to `swiggy limited`, not
`swiggy` — the bank-statement form is a separate alias pointing at the same merchant, which
is correct rather than a miss.

---

## S9 — the Skia Day Dial (2026-08-16)

The flat meter is gone. A 270° arc with a gap at the bottom reads as a gauge rather than a
pie, and as *how much day is left* rather than *what percentage of a budget is consumed* —
the same number, and only one of them is usable at a glance.

**The figure inside the ring is real React Native text, not pixels in the canvas.** Screen
readers and text selection both work; painting the number into Skia would have cost both for
nothing. The canvas draws the arc, and only the arc.

`progress` is clamped to 0–1: a 130% day should fill the ring, not wrap around it and read as
30%. A zero-length arc is skipped entirely, because a round stroke cap still paints a dot at
the start position, and a dot reads as "you spent something" on a day you have not.

The sweep gradient runs brass → verdigris → brass, so the dial carries the same currency
temperature as every figure in the app rather than inventing a third colour language.

**Two environment fixes were needed and both belong in the repo, not in someone's shell:**

- **CocoaPods 1.17.0 on Ruby 4.0.6 fails** with `Unicode Normalization not appropriate for
  ASCII-8BIT` unless the locale is UTF-8. `LANG=en_US.UTF-8` fixes it; noted in the runbook
  because the error names Unicode and not the locale, which sends you the wrong way.
- **pnpm 10 blocks lifecycle scripts by default**, so Skia's postinstall never downloaded its
  prebuilt binaries and `pod install` failed with "Skia prebuilt binaries not found".
  `@shopify/react-native-skia` is now in `onlyBuiltDependencies`, which is where the fix
  belongs — running `npx install-skia` by hand would work once and fail for the next person.

---

## The redesign: two surfaces, not one design (2026-08-16)

The reference screenshot is a twenty-panel executive control tower. `finy_v2.md` argues for
words-first, *"charts one tap below"*, *"be specific or say nothing"*, *"know when to stop
talking"*. Both are coherent theses. Neither can be the same screen, and picking one
silently would have thrown away half of what was asked for.

**They are not in conflict — they are two surfaces.** The web is a 27-inch screen you sit
down at to analyse: it gets the Control Tower. The phone is six inches in a queue: it gets
the companion. That reading also puts `finy_v2` where it belongs, on the device where a
warm sentence is the right interface and a wall of KPIs is not.

**Density survives only because of progressive disclosure.** Twenty panels of full detail is
a wall nobody parses. Twenty *headlines*, each with the working folded underneath a
`Working` toggle, is a room you scan in four seconds. The detail subtree is not rendered
until opened, so a collapsed board pays nothing for it.

**Glass is used in exactly one place: the floating dock.** A translucent surface signals
"above the content" only while it stays rare — a page where several things are glass has
nothing floating above anything. `backdrop-filter` also costs 15–30% of the frame budget on
a mid-tier phone, so it is spent once, deliberately. There is an `@supports not` fallback to
an opaque surface, because a translucent panel with no blur behind it is unreadable rather
than merely plainer.

**Actions moved out of the top bar into the dock.** Duplicating them would give two elements
the same accessible name, which makes "the Add button" ambiguous to a screen reader and to
the test suite alike. The top bar keeps identity and search; the dock keeps everything you
*do*, in thumb reach. It retreats on scroll-down and returns on scroll-up with a 24px
deadband, because a permanently pinned dock covers the last row of every table.

**Depth is three steps and each is two shadows.** A tight contact shadow anchors the element
to the surface and a wide ambient one gives it height; a single blurred shadow reads as a
smudge at every size. The values are `color-mix`ed from the ink so they warm and cool with
the theme rather than being neutral grey holes punched in a tinted surface.

### Two things the work caught

**The dock broke the production build**, and the failure named the wrong page. It hosts the
currency lens, which reads the URL through nuqs; mounting it outside a Suspense boundary
made `useSearchParams` fail the prerender for `/categories` and `/currency` — pages that had
not been touched. Wrapped, with the reason in a comment so it does not get "tidied" away.

**VaR and CVaR were rendering as the same number, and that was correct.** At 95% over
seventeen months the tail holds one month, so the conditional value at risk *is* the value at
risk by construction. Showing both implied an average over a distribution with one point in
it. `riskProfile` now reports `tailSize`, and below two the panel says "worst month on
record" and explains that a tail average needs more history. The tail deliberately includes
the VaR observation, because CVaR is E[X | X ≥ VaR] — my first test asserted otherwise.

---

## The tone engine, the narrator, and the phone as companion (2026-08-16)

`finy_v2.md` asks for a cloud model that writes sentences from computed inputs and invents
nothing. **The constraint list describes a template exactly** — narrate these, state no
number you were not given, invent nothing. A template satisfies every one of those by
construction rather than by instruction, costs nothing, needs no key, works in airplane mode,
and cannot hallucinate a figure. The model was skipped, not compromised on.

The seam is deliberate: swapping a model in later means replacing `compose` and leaving the
gate, the ranking and the frequency governor untouched. That is the whole reason the voice
layer sits *above* the generation layer rather than inside it.

**The tone engine is a safety system, not a style guide**, so it is enforced in code at
display time and it fails closed. Six rule families — shame, diagnosis, body, agency,
specificity, regulated advice — plus quiet hours and supportive mode. `gate()` returns the
message **or null**, never a flag, so a caller cannot accidentally render something blocked.
Thirty adversarial cases, including the eight that cross into licensed investment advice
under SEBI and the SCA, which is a boundary one sentence wide and therefore checked rather
than trusted.

**Two of the patterns were wrong on the first run, and both mattered.** "Your streak *is*
broken" slipped through a rule that required the words adjacent. And "Want the detail?" was
rejected for offering no agency — which would have blocked the calmest sentences the app can
write, exactly the ones most worth sending.

**Every narrator template is tested against its own gate.** A template that drifts during an
edit now fails loudly instead of quietly shipping a message the app would otherwise block.

**At most one observation, ever.** Not the top three. Three observations on a screen is none
— the reader skims all of them and acts on nothing, and the app has spent its whole welcome
in one visit. It lives in the return type: a single item or nothing.

**Verified on device, and the best evidence was the app staying silent.** At 22:29 the
companion showed no card at all, because quiet hours start at 21:00. Forcing the hour to 10
produced the card, the sentence and the three choices. The feature working correctly is
invisible to anyone testing in the evening, which is worth knowing before someone reports it
as a bug.

**Liquid Glass is guarded three ways, not one.** Apple requires full adoption by September
2026 and removes the opt-out in iOS 27, so it is the platform language now rather than
decoration. But `isLiquidGlassAvailable()` is a **runtime** check — some iOS 26 betas ship
without the API and calling into it there crashes rather than degrades — and reduced
transparency is a setting people enable precisely because translucency makes text hard for
them to read. The fallback is a solid surface with a hairline border: plainer, equally
legible, never a translucent panel with nothing behind it.

---

## 3D: CSS perspective, not WebGL (2026-08-16)

The corridor — money crossing from dirhams to rupees — is the one picture that is actually
about what this app is for, so it earned depth.

It is **not** `react-three-fiber`. That plus `three` is roughly 600KB over the wire, for two
nodes and five arcs. On a finance dashboard first paint matters more than technique, and a
globe that costs a second of load to show a number already legible in a table is a worse
product rather than a fancier one. `transform-style: preserve-3d` with a perspective ground
plane gives real depth, real parallax and real ordering in about 4KB of markup.

Pointer tilt is capped at **6°** and disabled for a coarse pointer. Enough to read as depth,
small enough that nothing becomes a moving target; and on touch there is no hover, so an
uncapped version would only fire mid-tap and make the surface feel unstable under a finger.

If the brand later wants a true globe, this is the component to replace and `CorridorFlow` is
the data shape to keep. It is the right size for the job, not a placeholder for a bigger one.

---

## The read that lagged one write: it was the compiler, and my disproof was worthless (2026-08-16)

Fixed. The React Compiler was memoising the ledger reads, and the store version was not
something it could see as an input, so every screen served the state from before the most
recent write — for ever, until the process restarted.

**I had already ruled this out, and the way I ruled it out was invalid.** The test was
"call `spendBetween(...)` directly in the render body, bypassing `useQuery`" — and it
returned the same stale count, which looked conclusive. It was not: a direct call in a
component body, keyed on a `startOfToday` that does not change within a day, is *precisely*
what the compiler caches. The test bypassed the hook and not the compiler, which was the
thing under suspicion.

Three other theories were also wrong, each disproved properly:

| Theory | How it died |
|---|---|
| Two connections | A module-level id, written into the row's own note and rendered on screen: `f7e1g3` on both sides |
| The write is not committed | A `SELECT` immediately after the `INSERT`, on the same connection: `self=1` |
| Prepared-statement cache | A unique SQL comment per call changed nothing. The earlier "inline the parameters" test was also invalid — the bounds are identical within a day, so the SQL string never varied and the cache key never changed |
| Frozen subtree under the modal | Dismissing first and committing the write afterwards, on a provably live tree, changed nothing |

The fix is `'use no memo'` on the three screens that read the ledger — the documented escape
hatch — plus threading `version` and the focus tick through `useMemo` in `useQuery` as the
belt to that pair of braces. `exhaustive-deps` objects to those dependencies because `read`
does not close over them, and the rule is right that it cannot see them being used. **That
blindness is the bug**: the store drives this query through the database, not through the
closure. The disable carries that sentence.

The lesson worth keeping: a negative result is only as good as the mechanism it actually
excluded. Two of the five experiments here excluded nothing, and both of them read as
conclusive at the time.

---

## Splits that settle, and trips planned from your own ledger (2026-08-16)

**The Splitwise feature that matters is not splitting — it is simplification.** Four people
and eleven shared expenses is a dozen transfers; restructured it is two or three, and
nobody's net position moves by a paisa. Greedy largest-debtor-to-largest-creditor, which is
what Splitwise itself uses: the true minimum is NP-hard, and greedy never exceeds n−1
payments for n people, which is the bound that actually matters.

The property test is the one worth having: forty randomly generated groups, and after
applying the settlements every single person must land on exactly zero. Preserving each net
position is far more important than the payment count — simplification reorganises who pays
whom and must never move money.

**One honest caveat their marketing does not make obvious:** greedy can produce a payment
between two people who never shared an expense. Same money, same net for everyone, but "why
do I owe Sam, I was never at that dinner" is a real reaction. So `directDebts` is offered
alongside — every debt attached to the pair that actually shared something, more payments
but each one explicable. Both are exposed rather than one being chosen on the user's behalf.

**Trips are planned from behaviour, not from a template.** Every travel budgeter starts from
a generic split that describes nobody. Here the food line is *your* average per meal times
*your* meals-a-day times the destination multiplier; the stay line is your real past nightly
rate. Activities are the one line with no history behind them, so they are derived from the
others rather than invented.

Two deliberate refusals in `planTrip`:

- **The buffer is a real line, not a rounding cushion.** Trips overrun. A plan that pretends
  otherwise sets someone up to feel they failed at arithmetic that was always optimistic.
- **When the budget is tight it trims the flexible lines only.** Flights and a booked room
  are not negotiable by an algorithm; how often you eat out is. And when the fixed costs
  alone break the budget it says exactly that rather than scaling them down to fit a number
  that cannot be met.

`savingsPlan` states arithmetic and takes no view: what per month reaches the target, whether
that is inside genuine capacity, and — when it is not — how many months it would actually
take. Naming the shortfall is more useful than insisting the deadline works.

A test caught me choosing the wrong branch rather than the wrong behaviour: at a ₹30,000
budget the fixed costs alone are ₹39,800, so the planner correctly reported the trip
impossible instead of trimming. The test wanted ₹45,000.

---

## Statement import, device deployment, and the gates Finy had that we did not (2026-08-16)

**Reading a bank CSV you have never seen before.** There is no standard. HDFC, Emirates NBD,
Wise and every card issuer emit different columns in different orders with different date
formats and different ideas about how to signal a debit. So `parseStatement` **infers** the
shape and reports what it inferred with a confidence, for the import screen to show and the
user to correct. It proposes; the sheet commits. Nothing in it writes.

Four things it gets right that a naive parser does not:

- **`03/04/2026` is often genuinely undecidable.** 3 April or 4 March depends on which side
  of the world the bank is on, and a statement where every date falls in the first twelve
  days of its month simply does not say. Guessing misfiles a third of the rows into the wrong
  month, and **nothing about the result looks wrong**. So ambiguity is detected across the
  whole file and returned as `needsDateConfirmation`. The UI must ask.
- **Separate debit/credit columns beat a single signed one.** When a bank supplies both, the
  signed column is frequently unsigned and the direction lives only in which column is filled.
- **The header is not line 1.** Banks put an account summary above it; treating line 1 as the
  header imports the letterhead.
- **Exact header match beats a contained one**, so a "Debit Card Number" column cannot win
  the debit slot.

Skipped lines are returned with a reason rather than dropped. And `findDuplicates` ships
*with* import rather than after it — the same transaction arriving as a statement line and a
manual entry must collapse, or every figure stated afterwards is wrong. It tolerates a day
either side, because statement dates and app-entry dates rarely agree exactly.

**The phone is light; the dashboard keeps both.** A deliberate split, not an oversight. The
dashboard is a screen you sit at for a long stretch, often in a dim room, and dark earns its
place there. The phone comes out in daylight, in a queue, for four seconds — and following
the system setting would give a dark app to everyone who runs their phone dark for
messaging, which is most people, in the context where dark helps least.

**Two CI gates adopted from the Finy README, which this repo did not have:** a gitleaks
secret scan over history, and a dependency audit at high severity. A leaked key is not a bug
you fix in a follow-up commit — history is public the moment the repo is, and rotation is the
only remedy. The audit deliberately fails on high and critical only: failing on every
low-severity transitive advisory trains everyone to ignore the gate, which is worse than not
having one. `.gitleaks.toml` allowlists the Supabase **anon** key, which is public by design
and appears in client bundles by necessity, and adds an explicit rule for the **service_role**
key, which must never be committed.

---

## Receipts: confidence is the product, and the purity rule is now a gate (2026-08-16)

**A receipt reader that quietly gets a total wrong is worse than one that admits it could not
read the photo.** A wrong total enters the ledger and is never questioned again. So
`parseReceipt` checks the bill against itself — does subtotal + tax + service + tip equal the
printed total? — and that single reconciliation is the most useful signal in the whole parse.
When it holds, the read is almost certainly right. When it does not, `discrepancy` says by how
much and the confidence drops below the threshold at which the app would dare propose
anything without a human looking.

Details that decide whether it works on real paper:

- **"Sub-Total" contains "Total".** Testing order is load-bearing, and getting it wrong makes
  every bill's total the subtotal — off by exactly the tax, on every receipt, forever.
- **A "Change" line is money coming back** and must never become the bill. Same for "Cash"
  and "Card".
- **CGST and SGST sum rather than overwrite.** An Indian restaurant bill has two tax lines,
  and taking the last one halves the tax on every one of them.
- **Tax-registration formats identify the country.** A **TRN** exists only in the UAE and a
  **GSTIN** only in India, so a receipt printing either has told you its currency even when
  it never prints a symbol — which UAE bills frequently do not.

Two bugs the tests caught immediately, both from the same fixture: a fifteen-digit TRN was
read as a price of 100,234,567,800,003.00 and `money()` threw, taking the whole parse down.
Now a long unbroken digit run is treated as an identifier, and there is a plausibility cap —
because a parser that crashes on a tax id crashes on most real receipts.

**`splitByItems` shares tax and service in proportion to what each person ate**, which is the
reason full itemisation was worth the trouble: three people where one had the wine should not
split it evenly, and the VAT on that wine belongs to whoever drank it. The remainder goes to
the largest share so the split still equals the bill exactly.

**The engines purity rule is now enforced by ESLint rather than promised by `CLAUDE.md`.**
No React, no I/O, no database, no `Date.now()`, no `Math.random()` — with a message on each
saying what to do instead. It is the most load-bearing invariant in the repo: both apps
import these functions, and the moment one reaches for a clock, a number on the phone and the
same number on the dashboard can legitimately differ. Verified by writing a file that breaks
all of it and watching three errors appear, then deleting it.

---

## Statement import, wired (2026-08-16)

The parser proposes; the screen commits. Nothing is written until the button is pressed, and
every row on display can be excluded — the alternative is an import that silently adds three
hundred transactions to a ledger you then cannot trust.

**The date question is the design.** When the file cannot say whether `03/04` is 3 April or
4 March, the screen asks — and shows what *each answer would mean* ("03/04 = 3 April" versus
"03/04 = 4 March") rather than asking an abstract question about date formats that nobody
should have to hold in their head. The import button stays disabled until it is answered.

**A real UX bug the tests caught.** The date control was keyed on
`parsed.needsDateConfirmation`, so it vanished the instant you chose — meaning a wrong pick
could only be undone by re-uploading the file. It now tracks whether the *file* is ambiguous,
independent of whether it has been answered, and the choice stays changeable right up until
import. The whole reason for asking is that the answer is not obvious, so the answer has to
be revisable.

**Deduplication is enforced, not advisory.** Rows already in the ledger are excluded and
cannot be re-enabled by hand. Importing the same file twice offers zero rows.

Income lines import with `direction: 'in'` so they land as income rather than spend. Filing
a salary credit as an expense would be a far worse bug than skipping it, and the `v_spend`
predicate keeps it out of every spend figure automatically.

One of my assertions was wrong again, in a way worth recording: I checked the import landed
by searching the ledger for "SWIGGY" and expecting one row. The seeded demo contains **thirty**
Swiggy rows, so that assertion proved nothing either way. Searching for a string unique to
the imported file is the check that actually tests something.

---

## The audit gate found four things on its first run (2026-08-16)

Two high and two moderate, and the tempting response was to move the threshold to `critical`
and get green. That would have been the wrong call: it hides the *next* genuine high-severity
finding, which is the one that matters. A gate you weaken to pass is not a gate.

All four are transitive **build-time** dependencies — Metro's bundler, `drizzle-kit`, Expo's
config plugins. None ships to a user. And `image-size` reports `Patched versions: <0.0.0`,
meaning **no fix exists to upgrade to**; there is no action available even in principle.

So the four are acknowledged individually by advisory id, with the reason and the removal
condition written down in `docs/AUDIT_EXCEPTIONS.md`, and the threshold stays at `high`.
Acknowledging four known advisories by id is a decision with a paper trail. Moving the bar is
a decision that hides every future one.

The rule recorded there — an exception needs the package to be build-time only, to have no
reachable patch, *and* for the attack to require access already lost by other means — is
what stops that file becoming a place where inconvenient findings go to be forgotten. The
Expo SDK upgrade is the natural point to re-check, because Metro moves with it.

---

## Splits on the phone (2026-08-17)

**A pushed screen, not a fourth tab.** `(tabs)/_layout.tsx` carries a decision that the tab
bar is capped at three — *"navigation is not the product"* — and it is right. Splits are
something you check occasionally, not glance at daily, so it lives behind an entry on **You**.
Overriding a recorded decision because a new feature wants prominence is how tab bars become
menus.

**Splitting by people, not by a number.** The old sheet split N ways; the new one splits with
*named people*, and that is the whole difference. Splitting by a count tells you what you
paid. Splitting by people tells you who owes you — and only the second can ever be settled.
You are always weight index 0, so `shares[0]` is yours and the rest line up with the people
picked, in order.

**Both settlement views are offered.** `simplifyDebts` for the fewest payments, and the direct
list for legibility, because greedy simplification can pair two people who never shared a
bill.

### Three bugs found by using it

**Liquid Glass rendered a dark slab in a light app.** An untinted `GlassView` is a *dark*
material regardless of theme, and against this app's dark ink that produced grey text on a
grey card — unreadable, and it shipped on the first screen that forgot to pass a tint. The
tint now defaults to `surface-1` inside the `Glass` component itself, so no future caller can
reproduce it by omission. Exactly the kind of contrast failure the web audit was built to
catch, on the surface that has no axe.

**A person was saved as "P".** `onSubmitEditing` closed over `name`, and typing quickly then
hitting return fires before the last `setName` lands. It now reads `e.nativeEvent.text`,
which is the value the field actually holds and is immune to the race.

**"2 payments instead of 2."** Nonsense on its face, and the reason is worth stating rather
than hiding: while you are the only person who ever pays, every debt already points at you
and there is nothing to reroute. The copy now says that, and simplification only advertises a
saving when there is one.

---

## Receipt capture, and a fixture written from imagination (2026-08-17)

Photograph a receipt, read it with **Apple's Vision framework on the device**, parse it, and
propose a transaction. No key, no cost, and the photo never leaves the phone — which matters
more here than anywhere else in the app, because a receipt carries a card's last four digits,
a location and a timestamp, and shipping that to a third party to save some typing is a trade
nobody would knowingly make.

`expo-text-extractor` over `@react-native-ml-kit/text-recognition`: it is a real **Expo
Module** (New Architecture is mandatory in SDK 57 with no opt-out, and the ML Kit package
still uses old bridge autolinking), it is the most recently maintained of the four
candidates, and on iOS it uses Vision rather than pulling in Google's ML Kit.

### Three failures, in the order they happened

**The app died instantly on opening the picker.** No JS error, no crash report — the
signature of a missing `Info.plist` usage string, which iOS treats as an immediate kill.
The keys *were* in `app.json`; they had never reached the binary, because `expo run:ios`
does not re-sync app config into an `ios/` directory that already exists. `expo prebuild`
did. Worth knowing before it costs someone else an hour.

**Then the parse was confidently wrong.** Butter chicken at AED 2.00, tax at AED 5.00, no
total. Two causes: `VAT 5%` was read as a five-dirham tax (a number before a `%` is a *rate*),
and the item amounts were the *quantities*.

**And the fix for that was also wrong, because the fixture was invented.** I assumed Vision
returns interleaved label/amount pairs, wrote a test that said so, and it passed — while the
real photograph still produced AED 2.00. The raw text panel, kept deliberately visible on the
screen, showed the truth: **Vision is column-major.** It groups by text region, so every
label arrives first and every price after:

```
2 x Butter Chicken … Sub-Total … TOTAL … Change
90.00  12.00  15.00  117.00  11.70  6.44  135.14 …
```

Adjacent pairing can never work on that. `linesFromBlocks` now handles both shapes — zipping
a column-major run onto the *last* N labels, since headers have no price — and returns the
blocks untouched when neither fits, because a wrong pairing invents prices while a missing
one only means fewer lines were read.

**The lesson is the same one as the compiler bug, and it keeps arriving:** a test written
from an assumption tests the assumption. The fixture in the suite is now the exact text the
device returned, copied off the screen.

After the fix the same photograph reads: subtotal AED 117.00, tax 6.44, service 11.70, total
135.14, butter chicken 90.00 — and the reconciliation check against the printed total passes,
which is the signal that says the whole read can be trusted.

## Mobile — trip planner and goals

**A new `goals` table rather than reusing `budgets`.** A budget caps a category per period; a
goal is a target with a date and a running balance. Conflating them makes both worse. Added to
`contract.ts`, derived into `sqlite.ts`/`pg.ts`, and — because the RLS test refuses to let a
synced table exist without it — RLS enabled with `auth.uid() = user_id` in the same migration
that creates it. The mobile DDL is generated from the contract, so the device picked the table
up on next launch with no separate migration. 412 schema tests green including the PGlite RLS
run.

**Destination price ratios are published data, not invented multipliers.** `planTrip` needs a
`DestinationIndex`, and typing plausible decimals into a table would have been fabrication
dressed as precision. `destinations.ts` carries Numbeo country indices (2026 mid-year, NYC =
100) and derives the multiplier at runtime as `destination / home`, so travelling to where you
already live returns exactly 1 — asserted, along with reciprocity and strict positivity.

Numbeo also publishes a Rent Index, and it is **deliberately unused**. It measures residential
rent, whose cross-country ratios are far wilder than hotel ratios: India 3.8 against Singapore
68.3 is an 18× multiplier that no booking has ever reflected. The Cost of Living Index gives
~5×, which is roughly what an equivalent room costs. A number being published does not make it
the right number.

**The trip screen shows the unconstrained plan.** `planTrip` trims flexible lines to fit a
budget — correct engine behaviour, wrong thing to render unexamined. Five nights in Thailand
against a budget that flights and a hotel had nearly consumed produced a food line 96% smaller
than a real one, presented in green as fitting, buying "about 0 meals". A plan crushed until
the arithmetic closes is not a plan; it is a budget with the trip removed from it. The screen
now computes both, shows the honest cost, and asks the budget question separately and out loud.

**A typical night is an input, not a result.** There is no accommodation category in the
ledger, so it cannot be derived at all. It is a field with a starting value rather than a
fabricated number hidden inside a total that looks computed.

**`solicited` added to the tone gate.** Quiet hours (21:00–08:00) blanked the only informative
line on a goal card, because the screen was opened at 01:19. Quiet hours exist to stop the app
*starting* a conversation at night; they are not a reason to withhold a number from someone who
navigated to it. The flag defaults to false, so a caller that forgets it still fails closed.
`requireAgency` is off on that one line for the same reason — a status line asks nothing, so
there is nothing to decline. Every other rule still applies.

**Contributions cap against the remaining balance, not the shortfall.** Capping both steps
against the shortfall made every button read the same figure — two controls that look different
and do the same thing. And because `perMonth` is always `remaining / months`, paying it
repeatedly is Zeno's paradox: the balance converges on the target and never arrives, making the
reached state unreachable and `reached_at` dead code. A third "the rest" step fixes it; the set
is deduped so they collapse into one button near the end.

**`Date.now()` in render is a lint error, correctly.** The clock is now read through `useQuery`
and threaded down as a value, so it is sampled at the same moments the ledger is — on focus and
on write — rather than mid-render where two renders could disagree about what "six months away"
means. Same discipline the engines have.

Verified on the simulator end to end: plan over and under budget, goal created, contributed
against, driven to reached (green, full bar, buttons gone), and removed. `turbo typecheck lint
test` 24/24, 342 engine tests.

## Audit — 17 August 2026

Surveyed all five tracks against the code; `docs/AUDIT.md` holds the evidence, file by file.
Web P0–P3 and P6–P8 are built, Mobile P0 and P2; the whole of the D, C and S tracks is
unstarted. Three findings reorder the plan:

- **There is no Supabase project**, so D0 is provisioning, not migration. Nothing already built
  breaks under it, because nothing is wired to Supabase. The real risk is inverted: the
  migration SQL has never met a real Postgres, only PGlite.
- **There is no outbound network call anywhere**, so S4 (redaction) has no surface to protect
  and its verify — "assert on the outbound payload" — cannot be written. It merges into Mobile
  P3 as a gate rather than preceding it as a phase. Same for S5 and Ledger Link.
- **There is no auth.** `user_id` is the literal `'local-user'`, so RLS protects nothing today
  and every local row would fail the `with check` on first sync. S0 is promoted from position 6
  to position 2, and a `user_id` reconciliation phase — listed in no document — added after it.

Cut S2 (passkeys), C4 (mutation testing) and D4 (k6). Kept C2 as a table of contents rather than
an ADR rewrite.

Two `CLAUDE.md` violations found and both fixed the same night. A committed root `ios/` and
`app.json` carried two bundle identifiers against the mandated one — my error, from an
`expo prebuild` run at the repo root followed by `git add -A` in `9270163`. And the spend
predicate was defined a second time in `apps/web/lib/demo.ts`, in a comment that claimed to be
the single definition; it now renders from the contract, with `spend-parity.test.ts` proving the
SQL and TypeScript renderings select identical rows.

Also fixed: Safe-to-Spend divided a real ledger into an invented ₹96,000 balance while two
screens disagreed about committed bills; and the CFO briefing claimed 2,000 bootstrap paths
where the worker runs 10,000.

`docs/WORKSPACE_ARCHITECTURE.md` did not exist despite being referenced by two docs. Written as
a **derived** spec with a provenance table and a `PROPOSED` marker on its numbering — the
recovered content is real, the phase numbers are mine. Its headline finding: `workspace_id`
exists in no table, so the W track is a breaking migration across 17 tables and 17 policies, not
a feature. It stays gated on the business path.

Renamed `PROGRESS.md` session numbers from `S0`–`S24` to `#0`–`#24`. `S4` meant both "engines
finance/stats, complete" and "redaction pipeline, unstarted priority 2" depending on which
document you were holding.

Open and needing a ruling: three documents cut the 3D globe permanently
(`RASEED_V2_MASTER_BUILD.md:18`, `:198`, `RASEED_V2_CLAUDE_CODE_PROMPT.md:89`,
`WEB_ARCHITECTURE.md:88`), and a WebGL version was later requested verbally. `CLAUDE.md` is
silent, so it does not adjudicate. Not built pending that decision.

### Overnight build following the audit — 17 August 2026

Worked the queue in `docs/AUDIT.md` while Krishna slept, committing and pushing after each item.

**Two `CLAUDE.md` violations closed.** The stray root `ios/` + `app.json` carrying two wrong
bundle identifiers (`e16ee58`), and the spend predicate defined a second time in
`apps/web/lib/demo.ts` (`a8a1542`). The predicate now renders from the contract in both SQL and
TypeScript, with `spend-parity.test.ts` proving they select identical rows — verified by
breaking the TypeScript side and watching three assertions fail with the leaked row named.

**Safe-to-Spend stopped dividing a real ledger into an invented balance** (`57ef305`). Five of
six inputs were literals; the balance is now derived. Two screens had disagreed about committed
bills — Today used ₹22,000, You showed ₹23,198 — and now read one list.

**Edit and delete a transaction** (`b26b354`), which P1's own done-when has always required and
which had never been built on either surface. FX stays frozen on edit; delete is soft.

**Recording a refund** (`a1183f5`). Entered from the row it reverses, so both halves leave
`v_spend` on the same statement. Deliberately not `pairReversals` — inference would guess where
an exact answer exists, and any inference window leaves the original counting as spend.

**Data export** (`6dfe05e`) — the last of Web P10 and a DPDP right, not a feature. Unfiltered by
`v_spend` on purpose: an export is your data, not a view.

**The phone got its first 23 automated tests** (`bf5d27a`, `a1183f5`) against `node:sqlite`
using the same contract-generated DDL. It had zero.

**The audit was wrong about one thing, and the fix found it** (`41388a9`). "No outbound network
call" came from grepping source; DuckDB was loading its worker from `cdn.jsdelivr.net` inside a
library call. Now self-hosted, with an e2e asserting zero third-party requests. The CSP that
exposed it is written but **not applied**: it silently breaks WASM instantiation in the blob
worker, and a dashboard that renders with every figure dead is worse than no CSP.

Left for Krishna, unchanged: Supabase provisioning, `eas login`, Apple enrolment, and the ruling
on whether the 3D globe returns as WebGL against three documents that cut it.

### Second wave — dark redesign, WebGL, and the rest of the queue

**Dark mode was lit wrong, not coloured wrong.** The shadows were `color-mix`ed from
`--text-hi`, which in dark mode is near-white — so every raised card wore a pale halo, and a
glow reads as fog rather than height. The three surfaces also sat within eight points of
lightness, so nothing separated from anything. Rebuilt as a real elevation system: ground
dropped to `#090C11`, black shadows that cast down, and a new `--rim` token putting a hairline
of light along the top edge. That rim is what lets a near-black ground work — cards separate by
light rather than by being paler. Every ink/surface pair measured before committing; worst is
5.54:1 against a 4.5 floor.

**WebGL, on Krishna's explicit ruling.** Three documents cut the 3D globe and were right about
a globe; this ships the version that earns it — a corridor where every particle is a transfer
that actually happened, count tracking volume and speed tracking efficiency. Raw GL, one draw
call, no three.js, because 600KB on a dashboard whose thesis is fast local work is the wrong
trade. The CSS-3D version became the fallback rather than being deleted.

**A CSP found a third party nobody knew about.** Writing one blocked `cdn.jsdelivr.net` —
DuckDB was fetching its worker and `.wasm` from a CDN via `getJsDelivrBundles()`, invisible to
the source grep the audit relied on. Now self-hosted with an e2e asserting zero third-party
requests. The CSP itself is written but **not applied**: it silently breaks WASM instantiation
inside the blob worker, and a dashboard that renders with every figure dead is worse than no
CSP. A test asserts no CSP is claimed, so enabling it without checking analytics fails the suite.

**Also shipped:** the query bar's `LIMIT 5000` and 3s deadline (P5's named done-whens, never
built); net-worth timeline and calendar heatmap, closing Tier 0; a `/numbers` screen on the
phone, which had no analysis surface at all despite owning the engines; edit on web to match
the phone.

**One bug worth remembering.** `netMovementSince` referenced a table called `transactions`; the
DuckDB raw table is `raw_transactions`. The query failed, and the tile rendered a skeleton for
ever — through a typecheck, a build and a screenshot. Both new tiles now render their error.
A panel that fails silently is indistinguishable from one that is slow.

### Third wave — mobile catches up with web

`parseStatement` and `detectRemittance` had both been tested for sessions and imported only by
the web app. The phone — the device that owns the ledger — could not load a statement into it,
and could not tell you what a transfer had cost. Both now on device.

The import screen parses **twice** on purpose: the unforced parse decides whether the *file* is
ambiguous, so the date-order control keeps rendering after you answer. Bound to the forced
parse instead, the question vanishes the moment you touch it and a wrong pick is only undoable
by re-importing. Only outflows are written — a statement contains your salary, and a credit
imported as spend inflates every figure by a month's income — but credits are still shown,
because seeing the salary land is how you check the file was read correctly.

`AED_TO_INR` moved from a literal inside `add.tsx` to `lib/fx.ts`. The write path freezes it
onto a row; the remittance detector uses it to judge what a transfer *should* have cost. Two
copies of one rate is how a corridor app calls the same transfer efficient on one screen and
expensive on another.

Native modules added (`expo-document-picker`, `expo-file-system`) with a prebuild and a full
native rebuild. The picker opens on device. Getting a fixture into the simulator's Files app
defeated me — a harness limitation, recorded rather than papered over — so the screen's own
decisions were extracted to `lib/import.ts` and tested directly instead.

**Still open, and honestly so:** voice capture and device security (native deps approved, not
started), Arabic/RTL, the CSP, Lighthouse, chart axes beyond the net-worth line, ledger
virtualisation, `splitByItems` UI, and bidirectional splits.

### Fourth wave — device security, and the CSP bisected

**App lock and privacy shield** (`a0f66a3`). Two protections that get conflated. The shield
covers the screen on `inactive` — not `background` — because iOS takes its switcher snapshot
during that transition, so waiting for background means your balance is already in the
multitasking carousel. The lock demands Face ID after five minutes, deliberately not instantly:
re-prompting on every notification glance is what makes people turn the feature off.

`setAppLock` refuses rather than storing a preference the device cannot honour — a lock behind
an unenrolled biometric has no way to open. **Stated in the file: this protects the screen, not
the file.** The security doc specifies SQLCipher and that is not done, so op-sqlite here is
unencrypted and a lock over it is exactly as strong as the phone's passcode.

**The CSP is bisected but still not shipping.** The previous note ("something blocks WASM in
the blob worker") was a theory. Four hypotheses are now eliminated by measurement — permissive
policy works, the blob worker is not the cause, `connect-src` is not, `default-src` is not,
`upgrade-insecure-requests` is not — and Chromium reports zero violations throughout. The
remaining suspects are named in `next.config.ts`, and the next attempt should also try HTTPS,
since every run was against a local HTTP server.

Kept regardless: the DuckDB worker no longer goes through a Blob. That indirection only existed
because the script used to be cross-origin.

**Not started, and honestly so:** voice capture, Arabic/RTL, Lighthouse measurement, chart axes
beyond the net-worth line, ledger virtualisation, `splitByItems` UI, bidirectional splits, and
the mobile worth-it/Reckoning loop.

## Mobile P6 — the worth-it loop, the Reckoning and the nudge budget (2026-08-17)

`regretRate` and `rankNudges` were written and tested five sessions ago and imported by
**nothing on the phone**. The device that owns the ledger could not tell you whether the money
you spent was money you wanted to spend — the one question a bank statement cannot answer and
the whole reason this is a mirror rather than a ledger. Both engines are now on device, behind
`/reckoning`, with an entry on You and a count on Today.

**The third button is "Neither", not "Skip".** The engine types a score as `-1 | 0 | 1 | null`
and counts `0` in the denominator, while a previous note claimed a skipped rating stays out of
it. Both cannot be true. Resolved in favour of the type: `0` means "I looked and had no strong
feeling", which is information and belongs in the denominator. Skipping is a *separate* gesture
— **Later** — which writes nothing at all, leaves the row unrated and brings it back next time.
Had skip written `0`, the regret rate would fall every time someone was in a hurry; had it
written nothing while still being the third button, the same card would be offered for ever.

**The batch is chosen once, on open.** P8's spec says five per session, and a queue that
recomputes after every answer does not deliver that — it refills from the backlog, so the count
sits at five however many you answer and the session never ends. Picking the set up front is
what makes "five" a real number rather than a page size, and it is what lets the empty state
say something true.

**The cap is a rolling seven days, not the calendar week.** A calendar week permits four on
Sunday and four more on Monday — eight inside forty-eight hours, while satisfying "four a week"
on both counts. That burst is exactly what the cap exists to prevent, and the rolling window
also removes every timezone question a week boundary would have introduced.

**Three independent mechanisms have to agree before a nudge appears**, and the redundancy is
deliberate: a free slot, a score above zero, and the tone gate. The test asserts slots and
fatigue reach their limits at the same point, so a later edit to one cannot quietly reopen the
tap.

**Novelty is a cooldown, not a ranking penalty.** Ranking a repeat lower does not suppress it —
with four free slots and six candidates, "lower" still ships. So novelty is *zero* for fourteen
days and ramps back to one by thirty, and `rankNudges` never ships a zero score even when slots
are free. Proved by mutation: making the cooldown return 1 fails exactly the repeat test.

**`acted` feeds fatigue, not slots.** Four nudges you opened are a lighter burden than four you
scrolled past, and an app that cannot tell the difference gets quieter at precisely the person
who is using it. But acting does not buy a fifth slot — the hard cap counts everything shown.
This is why the column is written at all; it was declared in the contract and never used.

**Opening the screen must not spend a slot.** The Reckoning renders only nudges already
recorded; a single effect, guarded by a ref, is the one thing that adds to that list.
Recomputing on render would burn the week's four in an afternoon, and recomputing on focus
would do it in a week of ordinary navigation.

**Undo is a soft delete, and the upsert says `deleted = 0`.** Without that clause a cleared
rating can never be given again: the row revives with its tombstone still set and stays
invisible for ever. There is a test for exactly this, because it is invisible until someone
changes their mind twice.

### Three things the simulator found that no test would have

**The card showed ₹1,993.25 for a charge recorded as AED 85.** The arithmetic was right — home
minor units are what make categories comparable — but a rating card asks you to *remember* a
purchase, and a Careem ride you know as AED 85 does not become more recognisable converted. The
card now shows what you paid, with the home figure appended only when the two differ.

**The runway nudge fired with negative room:** *"9 days until money comes in, with -₹1,993.25 of
room left."* That is not a nudge, it is a rub, and it arrives exactly when supportive mode says
the app should be getting quieter. A runway nudge is a statement about how much room remains;
with none remaining it has nothing to say the home screen has not already said more kindly.
Both fixes shipped with tests.

**"Where the regret is" listed a category at 0%.** Rating something positively is a good
outcome, not a line item in a list of regrets — and the panel's own empty state said as much.

### What this is not

**These are in-app nudges, not push notifications.** No notification permission is requested and
none is scheduled; `expo-notifications` is not a dependency. The cap, the ranking and the
feedback loop are the substance and they are real, but delivery is a screen you open. P6's
done-when says "≤4 notifications in a simulated week" and that is what the test simulates —
four weeks of it, asserting every rolling window, with the history fed back each day. `rankNudges`
is stateless and will ship four every time it is called; the cap is a property of the caller,
which is why the test lives here rather than in the engine.

**Nothing is animated.** The design system licenses a showy Reckoning card stack and this is not
it. The app has no Reanimated usage anywhere yet, and introducing the first of it inside a
session about the worth-it loop would be shipping a dependency for decoration.

### Verified

`turbo typecheck lint test` — 24/24, **1,007 tests**, of which 69 are the phone's (31 before).
The new pure module was mutation-checked three ways: removing the history feedback fails the
three cap tests, removing the top-regret branch fails the small-transaction test, and disabling
the cooldown fails the repeat test.

On the simulator, end to end: the batch counted 5 → 4 → empty with the right copy at each step;
a rating wrote `worth_scores` and the regret panel updated; undo soft-deleted the row and the
card came back; the nudge's **Noted** wrote `acted = 1`; and after deleting the pre-fix `runway`
row from the device database, reopening the screen with three free slots correctly created **no**
runway nudge. Device state read directly out of `raseed.db` at each step rather than inferred
from the screen.

**One environment note worth keeping.** The repo pins Node 24 (`.nvmrc`, `engines: ">=24"`).
Under Node 20 `node:sqlite` does not exist and the device schema suite fails to load — and since
turbo aborts siblings on first failure, that one failure also reported `schema` and `web` as
failed when they were fine. Use `--continue` when diagnosing.

## The CSP ships — and the reason it did not is a lesson about where you listen (2026-08-17)

Two sessions left the policy written but disabled, with the same note each time: enabling it
loads the page, serves the worker and `.wasm` (both 200), reports **zero console violations**,
and never finishes instantiating. Both halves of that had one cause.

**The blocker is `new Function`, not WebAssembly.** An add-one bisect over the thirteen
directives shows `script-src` alone reproduces it and every other directive alone is fine.
Within `script-src`, the single token that fixes it is **`'unsafe-eval'`**; `'wasm-unsafe-eval'`
makes no difference at all. `public/duckdb/duckdb-browser-*.worker.js` contains
`new Function("x", …+"\nreturn true;")` — Arrow's compiled-predicate path. The narrow directive
was chosen because compiling WebAssembly *looked* like the thing a CSP would object to, and
that guess held for two sessions because it was never tested against the alternative.

**The violation was never in the page.** It is raised inside the DuckDB worker, and worker
console output does not reach the page's console listener — which is what both earlier sessions
were reading. "Zero violations" meant "we were listening in the wrong place", not "the browser
is silent". Attaching over CDP with `Target.setAutoAttach` surfaces it immediately. Same shape
of error as the audit's own: **a grep proves what a grep can see**, and a listener proves what
that listener can hear.

**Scoping the permission to `/duckdb/:path*` does not work, and that is per spec.** A dedicated
worker loaded from a same-origin script inherits the *owner document's* policy in addition to
whatever its own response carries. Measured before being believed: serving the worker a looser
`script-src` changed nothing.

So `'unsafe-eval'` ships, and it is a real weakening, stated rather than buried. Three things
make it the right trade. `'unsafe-inline'` is already required by `next-themes` and Next's
hydration bootstrap and is the larger hole by some margin — an injected inline script runs
directly and never needs `eval`. What the policy actually buys is `connect-src 'self'`: injected
or not, the page cannot phone anywhere, and for a finance dashboard blocking exfiltration is the
protection that matters more than blocking execution. And a policy that ships beats a stricter
one that lives in a comment.

The honest upgrades, in order of payoff: a nonce-based policy, which removes `'unsafe-inline'`
and needs middleware this app does not otherwise have; and an upstream DuckDB build without the
compiled-predicate path, which is not ours to make.

`e2e/headers.spec.ts` no longer asserts the *absence* of a CSP. It asserts the header, the
directives that carry the value, and — unchanged — that `/lab` still compiles WASM, runs a
worker and computes from our own origin. **65/65 e2e green under the real header**, including
axe-core WCAG 2 AA on all eleven routes in both themes.

## Lighthouse, measured at last — and what it found that the axe suite could not (2026-08-17)

Web P9's done-when has always been "Lighthouse ≥95", and for four sessions it was the one
criterion nobody had run. The route was built; the score was assumed.

**Desktop is 100 / 100 / 100 / 100.** Performance, accessibility, best practices, SEO.

**Accessibility started at 92, and the cause is worth keeping.** `<Reveal>` renders a `div`, and
the landing page wrapped each `<li>` in one — putting a `div` between a `<ul>` and its items,
which is a content-model violation on two lists. `Reveal` now takes `as="li"` and the wrapper
*is* the list item.

The interesting part is why 65 green e2e runs never saw it. `ROUTES` drives the axe sweep and
`/` is not in it — because the landing route has no DuckDB and no Add button, so `waitForReady`
cannot gate it. **A route excluded for a mechanical reason is still an uncovered route**, and it
sat with a real violation through every green run. `/` now has its own axe check in both themes.

**Mobile performance is 94 and stays 94, stated rather than papered over.** Everything else on
mobile is 100. Its LCP is 3.1s of which 85% is *render delay* on the hero `<h1>`, with a total
blocking time of 0ms and no resource dependency in the trace. Two attributions were tested and
both measured as exact no-ops: taking the mono face out of the preload race, and removing
`will-change` from the heading. **Neither was kept.** A change justified by a hypothesis you
have just disproved is worse than no change — it looks like a fix for ever afterwards. The
honest state is: known, bounded, unexplained, and on a throttle harsher than anything this app
will meet.

`pnpm --filter web lighthouse` now runs both form factors against a production build and exits
non-zero below the floor, with that one exemption named in the file rather than hidden by a
lower threshold. The point is that "never measured" cannot recur.

## The gates that were named and never built — S7, S10, C3, C5 (2026-08-17)

Four items that had one thing in common: each was a *stated* guarantee resting on nothing
enforcing it.

**A pre-commit secret scan (D-14).** gitleaks ran only after a push, which is precisely the case
CI-only scanning cannot prevent: once a key reaches a public remote, rotation is the only
remedy, and the commit that removes it does not remove it from history. `.githooks/pre-commit`
scans what is staged, wired by `core.hooksPath` from the `prepare` script so it needs no new
dependency and installs itself with `pnpm install`. **It refuses rather than warns** — verified
by staging a synthetic `service_role`-shaped JWT and watching the commit be rejected, then
confirming `HEAD` had not moved. Where gitleaks is not installed it says so loudly and lets the
commit through: blocking every commit on every machine missing a Homebrew package is how a hook
gets deleted rather than installed, and CI still scans the full history.

**Dependabot.** gitleaks catches the key already committed; this catches the dependency that
ships the next advisory, before `pnpm audit --audit-level high` fails a build on it. Minor and
patch are grouped into one weekly PR so a solo maintainer reviews one diff rather than fifteen;
anything with a CVE arrives ungrouped and immediately. ESLint, TypeScript and every Expo/React
Native package are ignored for majors — the first two are pinned for reasons already recorded,
and Expo pins native module versions to the SDK, so a bump out of step with `expo install
--check` produces a build that fails on device rather than in CI.

**A coverage floor (C3), on `packages/*` only.** Measured before it was set: 95.35 statements,
89.47 branches, 98.42 functions, 97.13 lines across 891 tests. C3 asked for 80, which these
clear so comfortably that the gate would catch nothing — a package could lose a sixth of its
coverage and still pass. Set a point or two under the real numbers instead. The apps are
excluded deliberately rather than forgotten: their real coverage is 72 Playwright specs against
a production build and a simulator someone opens, neither of which a line counter can see, and
a number there would be measuring the wrong thing and then defending it.

One trap worth recording. The root config **cannot** be named `vitest.config.ts`. Every package
runs a bare `vitest run` with no config of its own, so a root config is auto-discovered and
inherited — and `projects: ['packages/*']` then resolves against that package's own directory,
matches nothing, and fails every package's tests with "No projects were found". It is
`vitest.coverage.config.ts`, passed explicitly.

**The performance budget, gated instead of printed (C5).** `WEB_ARCHITECTURE.md` P1 names
"<400ms at 100k rows" and the Lab has printed the number since S8 — but printing is not gating,
and the way this rots is silent: someone adds a view to `ALL_VIEWS`, the rebuild creeps past the
budget, and the only place it shows is a panel most visitors never open. `e2e/perf.spec.ts`
clicks the real 100k benchmark and asserts on **the Lab's own verdict cell**, so the test and
the UI cannot disagree about what the budget is. It also logs the measurement, so a run that is
merely near the budget is visible before it is a failure.

**Demo isolation as a test rather than as an absence (S10).** Today it holds structurally —
there is no Supabase client anywhere, so a visitor's rows have nowhere to go but their own tab.
That is a fact about code that does not exist, which is the least durable guarantee there is: it
stops being true on the first commit that adds a client, and nothing would fail. Four claims are
now pinned while they are still easy to state: two visitors never see each other's rows (driven
through the real Add dialog in two browser contexts, not by injecting a row shape the app might
never write), everything a visitor adds is namespaced under `raseed.`, the shared seed offers no
delete control that would edit it for everyone, and nothing leaves the origin.

**Verified:** 24/24 turbo tasks, 1,007 unit tests, 891 of them under the coverage gate, and
**72 e2e** — up from 65, under the CSP shipped earlier today.

## The ledger was showing a quarter of itself (2026-08-17)

`PAGE = 250`, and the search and the category filter ran over *that* — so with 951 spend rows
in the demo, **three quarters of the ledger was invisible** and searching for a merchant from
four months ago returned "Nothing matches". A correct statement about a subset, presented as a
fact about your money.

Nothing looked broken, which is the point. The table rendered, the total added up, the empty
state was well written. Only the number was wrong, and only if you already knew what it should
have been. This was on the D-12 list as "the ledger is not virtualised" — filed as a
performance note. The performance was never the problem.

Fetching everything is cheap: DuckDB is in the tab and the query scans a view over an in-memory
Arrow table. `e2e/ledger-completeness.spec.ts` now fails if the cap returns, and separately
asserts that a search finds a merchant from the tail — the two halves of the same bug.

**Virtualisation is deliberately not done, and this is a measurement rather than an omission.**
`content-visibility: auto` was the obvious answer: browser-native windowing, no library, and no
fixed-row-height requirement — which matters because a row with a note is taller than one
without, and every JS virtualiser wants that not to be true. It is **inert on a table row**.
Size containment does not apply to internal table elements, so the property computes to `auto`
while `contain` stays `none`, and every row lays out anyway.

The first probe checked the computed value, saw `auto`, and proved nothing. Counting the rows
that had actually laid out is what showed it: 951 of 951. **Same error as the CSP's, twice in
one day** — reading the thing that is easy to read instead of the thing that is true. It very
nearly shipped as a comment claiming the list was virtualised.

At 951 rows the full ledger scrolls in ~8ms a frame, well inside a 60fps budget, so nothing
needs windowing today. Making it work means leaving `<table>` for a grid of divs with ARIA table
roles — a real change to the markup and the keyboard model, worth doing when the row count
justifies it. D-12 stays open with a reason attached rather than being quietly ticked.

**74 e2e green.**

## Axes, where an axis is the thing that makes the chart readable (2026-08-17)

D-12 named "no axes anywhere" as a consequence of hand-building the charts. Three of them got
one; two deliberately did not, and the split is the decision.

**The Lorenz curve now has real axes**, and it is the plot where this mattered most. Both scales
are percentages of a whole, so the ticks are known in advance and there is no scale to derive —
the one case where an axis costs almost nothing. Before, a point on the curve meant nothing,
because you could not say *which* point.

**The calendar heatmap has month labels.** Eighteen months of squares with no scale is a
texture, not a chart: you can see that a stretch was heavy and not when it was. Labels are drawn
on the first column of each month, and the fixed 12px column pitch means they land over the week
they name without measuring anything.

**The category bars get a scale line, not an axis.** Every bar already carries its own figure,
so a value axis would repeat what each row says. What was genuinely missing is that the bars are
drawn *relative to the largest*, and without saying so a full-width bar reads as "all of it"
rather than "the biggest of these". One line at the top.

**The sparkline stays without one, on purpose.** A sparkline is a shape, not a plot; giving it
ticks would make it a small bad chart instead of a good glyph.

### Two things this shook loose

**The heatmap's scroll container became keyboard-unreachable.** Adding the labels tipped it into
actually overflowing at the test viewport — "Sept" is wider than the 9px column it sits over —
and axe immediately flagged a scrollable region with no focusable content. It now carries
`tabIndex`, a role and a label, the same as the ledger's scroller. The container was always
going to overflow on a narrow screen; the labels only made it certain, so this was a latent bug
the change exposed rather than one it created.

**Two ledger specs turned flaky, and the cause is worth knowing.** `waitForReady` waits for
*DuckDB*, and the table lands a few milliseconds after — measured at 5ms. `count()` and
`page.evaluate` do not auto-wait, so both could read zero rows or a null table. With 250 rows
the gap never opened; with 951 it did. The assertion "a table that does not exist is not inside
a scroll container" is true and meaningless, which is exactly the kind of green a suite should
not produce. Both now wait for a row first.

**74 e2e green, 24/24 tasks.**

## Splitting a receipt by who ate what (2026-08-17)

`splitByItems` shipped with the receipt parser and was imported by **no screen**. The engine that
makes "three people at dinner, one had the wine" fair existed, was tested, and could not be
reached from the app.

It is now on `/receipt`: tap **Split by item**, and each line gets a row of chips. Multi-select,
because a shared starter is the ordinary case and forcing one owner is what makes people give up
and split evenly — which is the exact outcome the engine exists to avoid.

**The whole bill splits; only your share is your spend.** The same rule `add.tsx` follows, and it
has to be, or the two screens would disagree about what a split dinner cost you. What differs is
how the shares are found: not by dividing, but by who ate what, with tax and service following
the items they were charged on.

**Unassigned lines are reported, not absorbed.** `splitByItems` ignores them, so a half-assigned
receipt produces shares that quietly do not add up to the bill. The screen names the figure.
Silently adding the remainder to you would be a guess presented as arithmetic.

**`YOU` is not a row in `people`.** You are not someone who can owe you money, and putting
yourself in that table would put you in "who owes you" the moment anyone forgot to filter.

The decisions live in `lib/receiptSplit.ts` with 8 tests — including that ₹10 three ways loses no
paisa, and that every part of a fully assigned bill adds back to the total. The screen holds none
of the arithmetic. Also removed a second copy of `AED_TO_INR` that had survived in `receipt.tsx`;
`lib/fx.ts` owns the rate, and two copies of one rate is the bug that DECISIONS already names.

77 mobile tests.

## The redesign — FinCopilot's system, RASEED's colour law (2026-08-17)

Krishna asked for the dashboard and the app to look like `fin-copilot-six.vercel.app` in both
modes. What was adopted is its *system*: a masked grid ground, pill badges, one accent for
chrome, hairline-bordered cards on soft radii, an answer card that cites its sources, a fading
marquee, numbered step cards, and outlined-secondary beside filled-primary.

**What was not adopted is one accent for everything, and that is the whole ruling.** The
reference is monochrome plus green. RASEED's thesis is that currency is a temperature — INR
warm brass, AED cool verdigris — so a figure tells you which country it came from before it
tells you anything else. Painting the product green would have made the two currencies
indistinguishable, which is the single thing this app exists to prevent.

So: **`accent` is chrome, temperature is money.** Green owns the primary button, the badge, the
focus ring, the meter fill, the icon tile, the rail's current page and every selection state.
Brass and verdigris own amounts, charts and the currency lens. The 34 focus rings that were
`ring-inr` are now `ring-accent` — a focus ring was never a currency. The currency selector in
the add sheet keeps `border-inr`/`border-aed`, because there the colour *is* the currency.

**The light accent is `#14713C`, measured rather than chosen.** It has to clear 4.5:1 against
`surface-2` (`#E7EBEF`), the hardest surface in the light theme, and every candidate between
`#15803D` and `#1A7F4B` lands at 4.19–4.49 there. `accent-ink` is the one token exempt from the
surface sweep, because it only ever appears on a filled accent — it has its own assertion
instead. 78 token tests.

### The display face changed, and it cost something

Plus Jakarta Sans replaces Bricolage Grotesque on **both** surfaces, so the two products do not
diverge on type. The trade is stated rather than buried: Bricolage had a **width axis** and
`KineticHeading` animated it on scroll — the one showy moment on the landing page. Jakarta is
variable on weight only. That component was **deleted**, not re-staged as a scale transform,
which would have been the same gesture pretending to be typographic.

### Above the fold, nothing large and textual animates in

This is the rule the redesign earned, and it came out of being wrong twice.

The `<h1>` was written to fade in. A throttled `requestAnimationFrame` in a background tab
caught it at `opacity: 0` — and that is not a test artefact, it is the whole failure: an element
that does not exist until an animation frame cannot be painted by a crawler, a slow device or a
backgrounded tab, and it is the LCP element. It was made static.

That fixed the headline and moved the problem one element down. The **lede paragraph** then
became the LCP candidate, still wrapped in a reveal, and mobile performance fell from 94 to
**88** with 3.4s of a 3.9s LCP spent in render delay. Making the lede static took it to **95**.

Which resolves this morning's open question. Mobile performance sat at 94 with 85% of its LCP
"known, bounded, unexplained", and two attributions had been tested and disproved. The cause was
the reveal wrapper all along — found by making it worse and reading the trace, not by guessing
better. **`scripts/lighthouse.mjs` no longer exempts anything.** Desktop 100/100/100/100, mobile
95/100/100/100, gate green with no carve-outs.

### Two things the axe gate caught in the new page

**`text-text-lo/70`.** An opacity modifier on a colour token silently opts out of the contrast
gate that token exists to pass — 3.04 on white, 4.23 on the dark card. Both themes, caught
immediately, and worth remembering as a category: `/70` on a token is a new colour nobody
measured.

**The marquee was a keyboard trap in reverse.** Under reduced motion it becomes a real
horizontal scroller with nothing inside it to tab to, so you could see the first few merchants
and reach none of the rest. Same finding axe raised on the calendar heatmap an hour earlier, and
the same fix. A static fallback that cannot be operated is not a fallback.

### Scope

Phase 1 is web: tokens, the landing route, and the shell primitives — which re-skins all eleven
dashboard routes at once, because the routes read the shell rather than styling themselves. The
phone has the new face and the new tokens; its screens are Phase 2, along with dark mode
following the system, which Krishna asked for and which reverses the light-only decision
recorded earlier.

**Verified:** 24/24 tasks, 1,022 unit tests, **74 e2e** including axe WCAG 2 AA on all eleven
routes plus the landing in both themes, and the Lighthouse gate with nothing exempt.

## Phase 2 — the phone gets dark mode, and a decision gets reversed (2026-08-17)

`theme.ts` hard-coded light and read `useColorScheme` only to throw the value away. It now
follows the system, with a three-way override — System / Light / Dark — on the You screen.

**This reverses a recorded decision, and the reversal is the interesting part.** The original
argument was real: the phone comes out in daylight, in a queue, for four seconds, and a light
surface is easier to read at arm's length outdoors. What it got wrong is *whose choice it is*.
Someone running their phone dark has usually decided that deliberately — glare, battery, their
eyes — and an app that overrides it is not being thoughtful, it is being certain about a
stranger's context.

**Three options, not a switch.** "Follow the system" is a real answer and a two-state toggle
cannot express it: it forces a choice the phone has usually already made.

The preference lives in the keychain and is read through `useSyncExternalStore` rather than
context — the same pattern `db/index.ts` already established here, and a third of the code of a
provider for one string. A failed keychain write is deliberately not rolled back: the UI has
already moved, and it reverts on next launch, which is visible and honest.

`useColorScheme` returns null before the first native read, and that falls back to **light**
rather than dark, so the very first frame is never a black flash on a light phone.

### The colour law crossed over

Everything that was ink-on-ink or currency-as-chrome is now the accent: the capture bar, the
Companion's affirmative choice, the wallet-count button, the receipt screen's primary and its
assignment chips, and the **tab bar's active tint**, which was `colors.inr` — a tab bar is not a
currency. Today's dial keeps the temperature and its local variable was renamed from `accent` to
`dialColour`, because the word now means the green and a variable that means the opposite of the
token it shares a name with is a trap.

`components/ui.tsx` is new: Card, Badge, PrimaryButton, SecondaryButton and the appearance
control. Thirteen screens each carried their own card, their own pill and their own idea of a
radius — survivable while each was built once, not survivable through a redesign where the same
edit has to land thirteen times and will not.

**Verified on device in both themes**, including that the override applies instantly and the
resolved theme is reported back on the About row.

## Mobile P3 — the capture router, and the eval harness that was specified on day one (2026-08-17)

The biggest unbuilt phase. Deterministic tiers only, on Krishna's ruling: rules and a local
classifier, no network, no key. The LLM tier stays a named seam, and that is not a compromise —
with no outbound call there is nothing for S4's redaction gate to protect, and "airplane mode is
a supported state" stays true rather than becoming true-except-for-the-good-parts.

**`parseCapture` is a real parser, not a regex with ambitions.** Clause splitting including the
Hinglish `aur`, amount suffixes (`2k`, `1.5 lakh`), currency words on either side of the number
(`25 dh`, `aed 25`), Indian digit grouping, a noise list so `"400 ka petrol dala"` yields
`petrol` rather than `ka petrol dala`, and — the two that separate a ledger from a list —
`paid rahul 500` as a **transfer** and `refund 200 from swiggy` as **income**. A parser that
calls either of those spend has overstated your spending in a way no total will reveal.

Confidence is computed, not felt: it starts at 1 and each thing that had to be assumed takes
something off, so the sheet can lead with the rows worth checking.

### The eval harness found two bugs in its first two runs

`MOBILE_ARCHITECTURE.md` §7 has asked for `eval/` since the first session — *"the difference
between 'I made an app' and 'I made an app and measured it'"* — and until today a find for an
eval directory returned CocoaPods headers.

Its **first** run failed on `"₹1,250 zomato"`: the comma in Indian digit grouping was being read
as a clause separator, so it produced two transactions, the first of them **₹1**. Not a rounding
error — a fabricated row, invisible to every existing test.

Its **second** run failed on `"chai 20, auto 80"`: guarding the comma on both sides fixed
grouping and broke the ordinary case, because a clause comma has a digit before it too. What
actually separates them is what *follows*: a grouping comma is followed by a digit, a clause
comma is not.

Neither bug was findable by reading the code. Both were named in one line of output by something
that scored the parser against a label.

**The gate and the report are different questions.** The gate runs the cases the deterministic
tier is responsible for — 22 cases, 30 transactions, and it clears every target the spec names.
The report runs everything, including four cases written to be beyond a regex: word amounts
("two fifty for lunch"), elided merchants ("filled the tank, 3200"), arithmetic in prose ("split
the 1800 dinner three ways"). Those stay in the set because a benchmark trimmed to what already
passes measures nothing and can only ever go down, and they stay out of the gate because a red
build should mean a regression rather than an unbuilt tier. There is a test asserting the hard
cases **still fail** — if that ever passes, either the parser got much better or somebody
softened the labels, and both are worth noticing.

### `capture_log` is written for the first time

Declared in the contract and created on every device since P1, never once written to — which
meant the one table that could say whether the parser works in real use was empty, and V1's
model page had no input. Both outcomes are recorded now, and **the rejected ones are the
valuable half**: a real sentence a real person typed that the rules tier got wrong is exactly
what belongs in the golden set. `edited_json` holds what you changed it to, so the diff is the
label.

### One bug the simulator found that the golden set could not

Every parsed row came back in **AED**. The default currency was `accounts[0]` — alphabetical,
which on this ledger is an AED account — so `"chai 20"` became AED 20: a 23× error on a cup of
tea, produced silently, from a default nobody chose. The golden set passes its own
`defaultCurrency` and so could never see it.

The account is now on screen as a row of chips, coloured by its currency, and changing it clears
the parsed rows rather than leaving drafts that depend on an assumption that just moved. The
initial guess is the home currency. It is a guess either way; the difference is whether you can
see it.

**1,029 tests**, 349 of them in engines.

## Splits run both ways (2026-08-17)

"You pay, others owe you" was the only shape, so the ordinary case of a friend covering dinner
could not be recorded at all.

**The sign on `owed_minor` carries the direction.** Positive means they owe you, negative means
you owe them. Everything downstream was already written against a signed number — the grouping,
the `HAVING SUM(...) <> 0` filter, settlement — so this direction cost a sign rather than a
schema change. Two debts with the same person in opposite directions net off, and when they
cancel exactly the row disappears, which is what "settled" means.

**Your share is confirmed spend the moment it happens**, on Krishna's ruling and for a good
reason: you consumed it. Waiting for settlement would leave a dinner you ate out of your own
ledger, and since `v_spend` excludes pending rows it would be missing from every figure that
reads it too.

**Settling writes no transaction, and that is the load-bearing half.** The spend row is already
the outflow — it reduced the balance when it was written. A settlement movement on top would
subtract the same money twice. The consequence is stated in the code rather than hidden: your
balance treats an unpaid debt as already spent. That is the conservative reading and the correct
one — money you owe is not money you have.

Five tests against `node:sqlite`, including that a debt you owe still counts as spend, that
opposite directions net, and that settlement clears both directions identically. On the split
screen the direction is a word — "you owe" — and the amount is a magnitude, because "−₹600"
beside the words "you owe" says the same thing twice and reads as a negative debt the first time
you meet it.

**1,034 tests.**

## Payday Runway and Ask-your-ledger — Mobile P9 closed (2026-08-17)

**Payday Runway** answers the question under Safe-to-Spend. An allowance divides what remains
and says nothing about what you keep doing; this asks whether, at the rate you are actually
going, you arrive at payday with anything left — and if not, which day you run out on and what
you would have to hold to.

The burn is a **median**, not a mean, and there is a test for why: one rent day in thirty pulls
a mean up by a third and produces a runway wrong in the *reassuring* direction, which is the
direction that costs you money. Quiet days stay in the sample, because the runway counts days
rather than spending days.

**One bug the simulator found and no unit test would have.** On a sparse ledger the median daily
spend is zero, zero burn divides into an infinite runway, and the screen rendered a green
**"Yes"** directly above the words "₹0.00 of room". Arithmetically true; as an answer, the most
dangerous kind of reassurance a finance app can offer. The pool is now checked first — with
nothing left you have not reached payday, you have arrived at today with nothing, which is a
different sentence and now says so. The screen also stops offering to hold you to ₹0.00 a day.

**Ask-your-ledger returns an intent, never SQL.** `parseAsk` lives in `@raseed/engines` and can
only produce one of six intents; each surface maps those onto its own tables. That is the whole
safety story — there is no string from the user anywhere near a database, so there is nothing to
escape and nothing to sanitise, and it cannot be talked into a seventh intent because a seventh
does not exist. It is also why the phone and the dashboard answer the same question the same
way: one parser, two renderings, the same pattern the spend predicate uses.

It returns `null` rather than guessing. A query tool that answers *something* for every input
teaches you to trust an answer it had no basis for, and on a finance screen that is worse than a
shrug — so an unreadable question says what it *can* answer instead.

**Known and named:** the dashboard's `lib/duck/nl.ts` still has its own richer parser with 27
tests. Unifying them behind `parseAsk` is a real follow-up; two definitions of what a question
means is the same class of problem as two definitions of spend, and it is on the list rather
than pretended away.

**1,047 tests.**

## Ledger Link — the split lives in the fragment (2026-08-17)

A URL the other person opens with no install and no account. `share_link_id` had sat on the
`splits` table since P1 with a single writer that hardcoded NULL.

**The whole split is in the URL fragment, and that is the security model.** A fragment is never
sent to a server: not in the request line, not in a proxy log, not in an access log, not in a CDN
trace. The recipient's browser renders it entirely locally. **There is no row to leak because
there is no row** — which is a stronger guarantee than any amount of RLS on a row that exists.

The costs are stated in the code rather than discovered later. It cannot be revoked: once sent,
whoever holds the link holds the data, so send it the way you would send a screenshot, because
that is what it is. It cannot be updated — correcting a split means a new link. And it is long,
though a four-person dinner still fits comfortably in a message and in a QR code.

**Redaction is structural, not a filter someone has to remember to run.** `buildLink` accepts a
description, a date, an amount, a sender and some names. There is nowhere to put an account id,
a merchant id, a category or a balance, so a link cannot carry one even if a caller passes it —
and there is a test that proves exactly that by trying.

`decodeLink` never throws. A malformed fragment is something a stranger pasted, and the only
correct response is a page that explains — not a stack trace, and certainly not a half-rendered
split with one name missing. It refuses six distinct malformed shapes with six different
sentences, and refuses a **newer version** by saying so rather than guessing at a format it does
not know. That version field is what lets the server-backed version arrive later without
breaking every link already sent.

The page shows **the arithmetic, not just the number owed**. Being told you owe money without
being shown how it was arrived at is the fastest route to a disagreement, so the shares, the
sender's own share and the sum back to the bill are all on screen.

`useSyncExternalStore` reads the fragment rather than an effect calling `setState` — idiomatic
for a browser value, and the only version that does not trip the cascading-render rule. Its
server snapshot is deliberately empty: the server has no fragment and never will.

**Added to the axe sweep on the way in.** `/split` is not in `ROUTES` for the same structural
reason `/` was not — no DuckDB, no Add button, so `waitForReady` cannot gate it. That excuse
cost the landing page a real violation for weeks; this one got its own check immediately.
**76 e2e.**

## SQLCipher, with a migration that refuses to lose a ledger (2026-08-17)

The app lock protected the screen, not the file. It now protects the file: `raseed-enc.db` opens
with a 256-bit key from the keychain, and the header on disk is random bytes rather than
`SQLite format 3` — verified by reading the file, not by trusting a flag.

**op-sqlite 18 has SQLCipher built in.** The obvious move was `@op-engineering/op-sqlcipher`,
which is at 2.0.21 against op-sqlite's 18.0.0 — a stale split. Checking the podspec instead of
installing it found `op_sqlite_config["sqlcipher"]`, an `encryptionKey` on `open()`, and an
`isSQLCipher()` that asks the compiled binary what it actually is. That last one earns its place
below.

**The key is `WHEN_UNLOCKED_THIS_DEVICE_ONLY`**, and both halves matter. `THIS_DEVICE_ONLY`
keeps it out of iCloud Keychain, so restoring a backup onto another phone restores an encrypted
file and no way to open it — without it, the encryption protects you from everyone except
whoever has your iCloud password. `WHEN_UNLOCKED` means a device seized locked cannot be made to
give up the ledger over a cable. The cost is stated in the file: **a lost phone is a lost
ledger**, and there is no recovery path because a recovery path is an alternative way in.

`SecureStore.getItem` is synchronous, which is what let the whole database layer stay
synchronous instead of threading a promise through every screen to fetch one string.

### Three bugs, each found by a different kind of checking

**The config was being read from the wrong package.json.** The podspec walks *up* from
`node_modules/@op-engineering/op-sqlite`, which under pnpm's hoisted linker is the **workspace
root** — so `"op-sqlite": { "sqlcipher": true }` in `apps/mobile/package.json` was silently
ignored and the pod compiled plain SQLite. Found by grepping the generated xcconfig for
`OP_SQLITE_USE_SQLCIPHER` rather than assuming the flag took. This is the exact failure
`isSQLCipher()` exists for: a binary that ignores `encryptionKey` writes a plaintext file while
the JavaScript believes it is encrypting, and nothing else would ever say so.

**`ATTACH DATABASE` resolves against the process working directory, `open({ name })` does not.**
The first migration ran, reported success, and produced a perfectly valid, perfectly encrypted,
perfectly **empty** database somewhere nobody would look — while the real ledger sat untouched
next door. Found by comparing file sizes: 4KB against 176KB. It now attaches an absolute path
built from `IOS_LIBRARY_PATH`.

**The migration was written, tested, and never called.** Four passing tests, wired into nothing.
The device said `file is not a database` on launch, which is what an encrypted build does when
handed a plaintext file. `initDatabase` now runs it first — and the order is load-bearing: the
copy must land **before** `migrate()` creates empty tables in the destination, or the ledger is
overwritten in the least recoverable way there is.

### The migration itself

Copy → count every table on both sides → only then remove the original. A lossy copy and a
throwing copy both leave the plaintext file exactly where it was, and there are tests for both,
because a partial copy plus a deleted original is the one outcome worse than not migrating.

`sqlcipher_export()` rather than reading rows into JS and writing them back: it runs inside
SQLite, moves schema and rows as one unit, and cannot mangle a value on the way through a
JavaScript number.

**Verified on device:** the encrypted file is 176,128 bytes matching the original, the old
plaintext file reports **zero tables**, and the app renders the identical ledger from the
encrypted database.

One honest limitation: the emptied plaintext file was not truncated, so while it has no schema
and no readable rows, its freelist pages were not overwritten. Deleting the file outright is the
better ending and is the next change to this code.

## Retention and the privacy track (S8, S9) — partial (2026-08-17)

`purgePlan` and `dataCategories` are built and tested, and the DB has `purgeExpired`,
`storedCounts` and `deleteEverything`. Retention is **per kind**, because collapsing them would
be wrong in both directions: your ledger is the product and is kept until you delete it, raw
capture text is diagnostic and expires at 90 days, nudges are a delivery record and go at 180.

The purge is a **hard** delete — the one place in this schema where `deleted = 1` would be
wrong. Soft-deleting a retention purge leaves the text you typed on disk with a flag beside it
saying we agreed not to look, which satisfies a policy document and nobody's privacy.

**Not yet built: the privacy dashboard screen itself, the consent ledger, and mobile export.**
The engine and the queries are done and tested; the surface is not.

## The privacy dashboard, consent and export (S9) — and one rule about how it is written (2026-08-17)

`/privacy` on the phone: know, take, correct, delete, in one place.

**Every claim on the screen is read from the device at render.** The row counts are counted. The
encryption badge asks the compiled binary through `isSQLCipher()`. The retention windows come
from the same policy object the purge uses. A privacy page that states its promises in prose is
a page that can be true the day it is written and wrong ever after — and nobody would notice,
because prose does not fail a test.

That rule caught its own bug immediately: "Your transactions" rendered with **no number beside
it**, because the category key was `ledger` and the count was keyed `transactions`. On a screen
whose entire claim is "these figures are counted, not written", a blank where a count belongs is
the worst possible defect. `DataCategory` now carries the table it counts, with a test.

**The consent ledger is short, and that is the honest answer.** Nothing leaves the device: no
analytics, no crash reporting, no model, no server. A consent screen listing choices that do not
exist is theatre, and theatre is how consent screens became something everyone clicks through.
There are two entries — the **lifestyle layer**, which is real, off by default, and now actually
wired into `narrate()` through `lifestyleOptIn` rather than being a parameter nobody passed; and
**sync**, listed as unavailable rather than hidden, so it can never be switched on by a
migration.

It is a ledger rather than a boolean: each entry records **when** it changed and **which version
of the wording** was agreed to. "They consented", with no date and no version, is not a record
of anything.

**Export on the phone**, which the dashboard has had since S22 and the device that actually
holds the ledger did not. A deletion right without an export right is not a right, it is a
shredder. Unfiltered by `v_spend` for the same reason the web export is: an export is your data,
not a view of it, and a transfer you are not shown is one you cannot audit. Minor units, not
formatted amounts — an export that writes "₹1,234.00" has turned an integer into a string
somebody has to parse back, badly.

**Deletion means deletion.** `DELETE`, not `deleted = 1`, on every table — a soft delete here
would be the app telling you it had forgotten while keeping the rows. Reference data is re-seeded
so the app works afterwards; nothing you entered comes back.

### And the plaintext file is now deleted rather than emptied

The earlier migration dropped every table and VACUUMed, leaving a 176KB file reporting zero
tables — no schema, nothing readable through SQL, and its freelist pages never overwritten.
*"You cannot query it"* is not the same claim as *"it is gone"*, and on the one file this whole
feature exists to protect only the second claim is worth making. The handle is closed first,
because unlinking a file SQLite still holds open leaves the pages alive until the descriptor
does — the same half-measure with extra steps. The `-wal` and `-shm` sidecars go too.

**1,083 tests.** Verified on device: the badge reads "Database encrypted on this device", and
the counts on screen are the rows in the encrypted database.

## Voice capture, and the Arabic tone gate (2026-08-17)

### Voice — P8 closed

`expo-speech-recognition` is at **56.0.1**, built for SDK 56, and this app is pinned to 57
because `CLAUDE.md` records a Hermes regression in 56. It declared `expo: "*"` so it was worth
attempting, and `ios/` is gitignored so a bad prebuild is recoverable by re-running prebuild.
**It works**: prebuild clean, pod in the lock, permission strings in `Info.plist`, native build
succeeded, and SQLCipher survived the regenerated project (checked, not assumed).

**`requiresOnDeviceRecognition: true` is the whole reason this is acceptable.** iOS will happily
send audio to Apple for a better transcript, and for a ledger that is the wrong trade at any
accuracy. If a device cannot manage on-device, the hook **refuses** rather than falling back to
the network — a silent fallback is how a privacy claim becomes a lie.

Dictation writes into the same field the keyboard does, and from there it is the identical flow:
one parser, one confirmation sheet. Two capture routes that diverge after the transcript is two
places for the ledger to be written differently.

**The permission dialog caught a real honesty problem, and only running it would.** iOS prepends
its own fixed sentence — *"Speech data from this app will be sent to Apple to process your
requests"* — and my string said *"the audio never leaves the phone"*. Two sentences contradicting
each other in one dialog, and the user will believe Apple, correctly, because Apple's text is the
one they have seen before. The string now says what **this app requests** without denying
Apple's generic notice: on-device recognition only, and the notice above applies to apps that
use its servers.

### The Arabic tone gate

`tone.ts` is a safety system that fails closed. Translating the interface into Arabic without
translating *it* would have shipped Arabic financial copy past a gate that cannot read it — the
guarantee silently switching off for one language. So `toneAr.ts` exists, with the same four
categories: shame, diagnosis, body, and regulated advice under the SCA and SEBI.

**`AR_REVIEW_STATUS` is exported as `'unreviewed-by-native-speaker'`, and there is a test
asserting it.** I can write the patterns; I cannot judge whether an Arabic sentence lands as
shaming, or whether a Gulf colloquialism carries a diagnostic connotation that MSA regexes miss
entirely. An unreviewed safety rule claiming to be reviewed is worse than no rule, because it
stops anyone looking. Where I was unsure the gate blocks — a test asserts the Arabic gate is
never *more permissive* than the English one on an equivalent sentence.

**And the first version was completely broken, in the most dangerous possible way.** JavaScript's
`\b` is defined against `[A-Za-z0-9_]`, so `/\bبذرت\b/` matches nothing in Arabic. Every pattern
failed silently and the gate reported **allowed** for every sentence it exists to block. A safety
system that fails open is worse than none, because it is believed. The tests caught it on the
first run — which is the argument for writing them before trusting the thing.

The patterns now carry **no word boundaries at all**, and that is right rather than lazy: Arabic
glues clitics straight onto the word, so بذرت, وبذرت and فبذرت are the same accusation with
different glue, and a boundary-anchored match would catch one and miss two. There is a test for
exactly that. Substring matching over-matches slightly, and over-matching is the direction this
gate is supposed to fail in.

**408 engine tests.** Still to do: the i18n string layer, RTL layout, and Arabic numerals — the
gate is the part that had to exist before any Arabic copy could be written, not after.
