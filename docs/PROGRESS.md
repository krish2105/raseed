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
- [x] **#13** Mobile P4 — merchant resolver and alias learning live and on the write path.
  The 17 Aug audit re-marked this because `reversal_of_id` was written NULL; refunds have since
  shipped and it is written from the row being reversed (`db/queries.ts:810`). `pairReversals`
  is still deliberately unused on mobile — it infers pairs from amount and time, which is right
  for an imported statement and wrong when the user is pointing at the row
- [x] **#14** Web P4 — Tier 0 complete: net-worth timeline and calendar heatmap shipped
- [~] **#15** Trip Mode is live on **web** (`detectTrips` + 11 tests + /trips) and **mobile** (`/trip`: `planTrip` over habits read from the ledger, Numbeo price ratios, unconstrained plan with the budget asked separately). Goals ship alongside it (`/goals`: new `goals` table, `savingsPlan` against real monthly surplus, copy through the tone gate). **Trip Mode itself now ships** — the F15 toggle: start a trip, spend tags to it by date, end it, with `tripProgress` (18 tests) as the only place the burn rate and pace are computed. **The Live Activity ships too** and is verified on the Lock Screen, not asserted
- [x] **#16** Web P5 — ⌘K bar, deterministic parser, SELECT-only sandbox; 12 adversarial strings covered by 27 tests
- [x] **#17** worth-it loop, Weekly Reckoning and the 4-nudge cap — live on **both** surfaces.
  Mobile P6 landed the phone half: `/reckoning`, ratings in `worth_scores`, nudges in `nudges`,
  a rolling seven-day cap tested over four simulated weeks. In-app, not push
- [x] **#18** Web P6 — Comlink worker; Arrow encoding moved off the main thread (837ms → 16ms longest block, measured)
- [~] **#19** splits + cash live on **web and phone** (one engine, 1,600-case test). The
  read-lags-one-write bug is fixed (React Compiler memoisation — see DECISIONS). What remains is
  **sync**: neither app has a Supabase or Legend-State client, so `user_id`/`updated_at`/`deleted`
  and every RLS policy are currently written for a reconciler that does not exist
- [~] **#20** Web P7 — Monte Carlo fan, Holt-Winters, anomalies, FX attribution and the Lab (Benford/Lorenz/Pareto) are live
- [x] **#21** Web **P9** — landing route and Lenis live; Lighthouse measured and gated (desktop
  100/100/100/100, mobile 95/100/100/100). The **mobile restyle onto shared primitives** is also
  finished: `Chip`, `RowList`/`Row`, `NavRow`, `LedgerRow`, `TextLink`, `Field` and a `danger`
  tone now exist in `components/ui.tsx`, and every duplication the inventory measured is at zero
- [x] **#22** Web **P10** — deploy, nuqs share links, a11y sweep and **data export** all done
- [x] **#23** Mobile P8 — receipt OCR live (`/receipt`, Apple Vision) and **voice capture ships**: `expo-speech-recognition` with `requiresOnDeviceRecognition: true`, which refuses rather than falling back to the network, so the "nothing leaves the phone" claim stays true
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
  **voice capture** (shipped — `expo-speech-recognition`, on-device only, refuses rather than
  falling back to the network) and the **Trip Live Activity** (shipped — see below).

  The Live Activity did **not** use `@bacons/apple-targets`, and that plan should not be
  revived: it ships no ActivityKit surface at all, so it meant hand-writing both the
  `ActivityAttributes` and a native Swift module. `expo-widgets@57.0.10` is first-party, carries
  the whole stack, and the layout is TypeScript under a `'widget'` directive. Verified on the
  simulator — Apple's docs say Live Activities run there, and `com.apple.liveactivitiesd` is
  registered on the booted device.

  Still outstanding on the restyle: `Chip`, `RowList`/`Row`, `TextLink` and a `danger` tone now
  exist in `components/ui.tsx` and four screens are converted, but `NavRow` (7 repeats in `you`),
  `LedgerRow` (3 independent copies) and a shared `Field` are specified in DECISIONS.md and not
  built.

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

## Session of 17 Aug — what shipped

Grouped by what it was, not by commit order.

**Arabic and RTL, on both surfaces.** New `packages/i18n` — one dictionary, and `gateFor(locale)`
as the only way to reach a tone gate, so Arabic copy cannot flow past English rules. `toneAr.ts`
carries the Arabic rule set; its first version was broken because JS `\b` is ASCII-only, so every
pattern matched nothing and the gate reported *allowed* for everything it exists to block. Tests
caught it on the first run. On the phone, direction applies at startup and the settings row asks for
a restart, because `I18nManager.forceRTL` is read when the native views are built. On the web it
applies before paint, and `Noto_Sans_Arabic` is loaded — Geist and Plus Jakarta Sans are latin-only
and have no Arabic glyphs at all.

**A bug that would have printed a wrong number.** `format()` builds an amount by concatenation, and
ASCII hyphen-minus is Bidi_Class ES: in an RTL paragraph `-₹1,993.25` renders as `₹1,993.25-`, so a
debt reads as a positive figure with a stray dash. Fixed with `unicode-bidi: isolate` on the web and
`writingDirection: 'ltr'` across all 26 figure styles on the phone — verified complete by script,
not by sampling. The app already shipped Arabic RTL, so this was live.

**Trip Mode — F15, as a toggle.** I proposed detect-then-propose and was refuted: F15 already
settled it as a toggle, and detection could not have worked anyway, since `detectTrips` needs
`days >= 2` and a lock-screen activity appearing on day three of a five-day trip is worse than none.
Shipped: `@raseed/money` gains `divide` (it had none), `tripProgress` computes burn and pace in one
place with 18 tests, `trips` gains its first reader and writer, and `trip_id` is written by
`insertTransaction` itself — by the transaction's **date**, not by whether a trip happens to be
running when you type it.

**The Trip Live Activity, on `expo-widgets`.** `PROGRESS` named `@bacons/apple-targets`; that plan is
dead and should not be revived — it ships no ActivityKit surface at all. Layout is TypeScript under
a `'widget'` directive, money arrives pre-formatted and colours arrive as props, so the Lock Screen
cannot disagree with the app and the zero-hex-literals rule holds across a process boundary.
**Verified on the Lock Screen**, with iOS's own consent prompt as proof it really registered.

**Two production incidents, both mine, both fixed with a guard.** `pnpm install` exited 128 on
Vercel because `prepare` ran `git config` and Vercel builds from a tarball — CI stayed green because
`actions/checkout` gives it a `.git`. And every open PR was red on the **secret scan**, not on its
contents, because gitleaks needs the merge-base and checkout clones one commit. Both now have CI
steps that would have caught them.

**Three dependency decisions, all measured rather than argued.** Arrow 17→21 **works** (76/76 e2e,
including the spec asserting no zeroed figures) and was still declined, because DuckDB pins Arrow 17
directly so the bump ships two majors for eight symbols that did not change. Skia 2.11.0 refused:
out of step with the SDK pin, and carrying an **open upstream regression** naming the two symbols
this app imports. `gitleaks-action` v2→v3 merged. Six packages brought back in step with
`expo install --fix`.

**Also:** the last hex literal outside `@raseed/tokens` is gone (`app.config.ts` sources the splash
colour from a token — static JSON could not); `metro.config.js` now exists at all, which
`CLAUDE.md` had specified from the start; and the `dependabot.yml` ignore list had a hole that let
a native bump through, now closed with the measurement beside it.

---

## Deferred decisions

- **Store submission** — revisit at S19 after two weeks of daily use. $99/yr Apple, $25 Google.
- **Tier 2 web features** — pick 3–4 before S20. Leading candidates: Benford audit, Gini/Lorenz, EMI prepayment optimiser.
- **PowerSync** — only if last-write-wins produces real conflicts. Not before.
