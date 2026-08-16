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
