# RASEED — Monorepo Plan

One repo. Two surfaces. Shared domain layer. Supabase from day one.

---

## 1. Decisions locked

| Question | Answer | Consequence |
|---|---|---|
| Build order | Shared core first, then alternate | 5 foundation sessions before either app starts |
| Mobile ship target | Decide after Phase 7 | Nothing may foreclose the App Store option — see §6 |
| Backend | Supabase from day one | RLS + sync columns exist before the first row is written |

**One thing "Supabase from day one" does not mean:** dropping demo mode. A recruiter cannot log into your account. The web dashboard needs two data paths — `live` for you, `demo` for everyone else — and the demo seed is also your mobile test fixture source. Build both in the same session or you'll bolt one on badly later.

---

## 2. Layout

```
raseed/
├── CLAUDE.md                    ← invariants, loaded every session
├── pnpm-workspace.yaml
├── turbo.json
├── .npmrc                       ← node-linker=hoisted (see §3 warning)
├── docs/
│   ├── PROGRESS.md              ← Claude reads this at session start
│   ├── DECISIONS.md             ← Claude appends at session end
│   ├── MOBILE_ARCHITECTURE.md   ← RASEED_ARCHITECTURE.md, renamed
│   └── WEB_ARCHITECTURE.md      ← RASEED_WEB_ARCHITECTURE.md, renamed
├── packages/
│   ├── money/                   Money type + arithmetic
│   ├── tokens/                  design tokens → NativeWind + Tailwind v4
│   ├── schema/                  Drizzle (sqlite + pg) + Zod + parity test
│   ├── engines/                 pure domain + finance + stats
│   ├── ai/                      capture prompts + output schemas
│   └── fixtures/                seeded generator + golden set
├── apps/
│   ├── mobile/                  Expo SDK 57
│   └── web/                     Next.js 16
└── supabase/
    ├── migrations/
    └── policies.sql
```

**Every shared package ships TypeScript source, not a build artifact.** `"main": "./src/index.ts"`, no `tsup`, no `dist/`. Metro and Next both transpile it. This removes an entire class of stale-build bugs and a watch-mode dance you don't want.
- Next: `transpilePackages: ['@raseed/money', '@raseed/tokens', ...]` in `next.config.ts`
- Metro: `watchFolders` pointing at the workspace root, per `expo/metro-config`'s monorepo setup

---

## 3. Package manager — read this before scaffolding

**pnpm + Turborepo, with `node-linker=hoisted` in `.npmrc`.**

pnpm's default symlinked `node_modules` breaks Metro. React Native's bundler doesn't resolve symlinked transitive dependencies reliably, and the failure is a cryptic "unable to resolve module" three hours into a session. Hoisted mode gives you pnpm's workspace ergonomics with an npm-shaped tree.

```
# .npmrc
node-linker=hoisted
```

If Metro still misbehaves, fall back to npm workspaces. Do not spend a session fighting this — it is not the interesting problem.

---

## 4. Shared packages — contracts

### `@raseed/money`
The `Money` type, integer minor units, currency-tagged. `add`, `sub`, `mul`, `allocate` (the remainder-safe splitter), `convert`, `format`. **Nothing anywhere else in the repo does arithmetic on an amount.** `allocate` matters more than it looks: splitting ₹100 three ways must produce 34/33/33, never 33.33 × 3.

### `@raseed/tokens`
One source of colour, type scale, spacing, easing. Exports:
- `tokens.css` — CSS custom properties for both themes → web
- `tokens.ts` — the same values as a typed object → NativeWind preset + Skia/visx chart colours

Both apps read the same file. When you change brass, both products change.

### `@raseed/schema`
Drizzle has separate `sqlite-core` and `pg-core`; one definition cannot target both. So:

```
schema/
  src/
    contract.ts     column names, types, nullability — plain TS, the truth
    sqlite.ts       Drizzle sqlite tables, derived from contract
    pg.ts           Drizzle pg tables, derived from contract
    zod.ts          validation schemas, derived from contract
  __tests__/
    parity.test.ts  asserts sqlite.ts and pg.ts expose identical
                    column names, types and nullability
```

The parity test is the whole point. Two hand-maintained schemas drift silently; a test that fails the moment they diverge does not.

**Sync columns on every synced table, from the first migration:**
```
updated_at  timestamptz not null default now()
deleted     boolean not null default false      -- soft delete, never hard
user_id     uuid not null references auth.users(id)
```
Legend-State's Supabase plugin requires `updated_at` and soft deletes. Adding them at Phase 10 means re-migrating live data.

### `@raseed/engines`
Pure functions. No I/O, no React, no DB, no platform APIs. Both apps import the same code.

```
domain/    safeToSpend · pairReversals · detectRecurrence
           detectRemittance · normaliseMerchant · rankNudges · regretRate
finance/   xirr · npv · pmt · fv · amortise · prepaymentSavings
           budgetVariance (rate×volume) · fxAttribution
stats/     blockBootstrap · holtWinters · seasonalDecompose
           madZScore · benford · gini · pareto · ewma
```

Every one has a unit test against a known-answer fixture. This package is your portfolio's technical spine — it's what someone reads in the interview.

### `@raseed/fixtures`
Seeded PRNG generating 18 months of realistic India + UAE transactions: UPI handles, UAE card descriptors, rent cycles, a Dubai trip, two remittances, three refund pairs, a subscription price hike. Plus the 250-string golden set for capture eval.

Same seed → identical output, always. The web demo mode and the mobile test suite both consume it.

### `@raseed/ai`
Capture prompts, Zod output schemas, the router's rule layer, merchant-resolution prompt. Mobile uses it for capture; web uses the schemas for NL→SQL validation.

---

## 5. Supabase design

### Auth
Email magic link. One user (you) for now. Anonymous sign-in **off** — demo mode is client-side synthetic data, never a real anonymous account.

### RLS — day one, every table, no exceptions
```sql
alter table transactions enable row level security;

create policy "own rows" on transactions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```
Write this for every table in the first migration. RLS added later is RLS you get wrong.

### Sync topology
```
MOBILE                          SUPABASE                    WEB
op-sqlite (source of truth)                          Next.js
   ↕ Legend-State sync plugin                          ↓
   └──────────────────────► Postgres ──────────────────┤
                            + RLS                       ↓
                                              Arrow → DuckDB-WASM
                                                        ↓
                                                 visx charts
```

- **Mobile stays local-first.** SQLite is the source of truth; sync is a background reconciler. The app must remain fully functional with Supabase unreachable. This is unchanged by "backend from day one."
- **Web pulls, it does not query live.** One paginated read of the user's rows → Arrow → DuckDB-WASM → all analytics local. Do not run analytics SQL against Postgres; the whole DuckDB argument collapses if you do.
- **Conflict policy: last-write-wins on `updated_at`.** At n=1 user this is correct and anything fancier is wasted work. If you later hit real multi-device conflicts, that's when PowerSync earns its weight — not before.

---

## 6. Keeping the ship decision open

You deferred the store question to after Phase 7. These choices would quietly foreclose it, so make them right now:

- **Bundle ID set from Session 5**: `com.krishnamathur.raseed`. Changing it later means a new app record.
- **No SMS or call-log permissions.** Google Play restricts them and it triggers a policy review you don't want.
- **Track data collection as you go** — a running list of what you collect and why. Apple's privacy manifest and Play's Data Safety form both need it, and reconstructing it from memory at the end is miserable.
- **No library requiring an entitlement you can't get** on a free account.
- **`expo-dev-client` stays out of the production EAS profile.**

None of this costs you time now. All of it costs a week later.

---

## 7. Deployment

### Web → Vercel
- Root directory: `apps/web`
- Install command must run at repo root so workspace packages resolve
- `transpilePackages` for every `@raseed/*` import
- **Ignored build step: `npx turbo-ignore`** — stops Vercel rebuilding the dashboard when you only touched mobile. Free Hobby builds are finite; don't burn them.
- Turborepo remote caching on
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The anon key is public by design — RLS is what protects the data, which is why §5 is non-negotiable.

### Mobile → EAS
Dev build now (free tier: 15 iOS + 15 Android builds/month). Production profile configured but unused until you decide.

**Do not export Expo Web to Vercel.** A thumb-zone mobile UI on a desktop viewport looks broken, and it's the first thing a recruiter would click. Put a device-framed screen recording on the landing page instead — better demo, zero build spend.

### Cost as configured
₹0 until you choose TestFlight ($99/yr) or Play ($25 once). Vercel Hobby, Supabase free, EAS free.

---

## 8. Session map — 24 sessions

At ~2 sessions/week that's roughly 12 weeks. Track A must complete before B or C begins.

**Track A — Shared core**
| # | Session | Done when |
|---|---|---|
| 0 | Monorepo scaffold, pnpm+turbo, Metro/Next wiring, CI typecheck | Both apps boot empty and import a shared package |
| 1 | `@raseed/money` + `@raseed/tokens` | `allocate` splits ₹100 three ways as 34/33/33; tokens render in both apps |
| 2 | `@raseed/schema` + Supabase migrations + RLS | Parity test passes; RLS blocks a cross-user read in a real test |
| 3 | `@raseed/engines` — domain half | 7 pure functions, all unit tested |
| 4 | `@raseed/engines` — finance/stats half + `@raseed/fixtures` | Known-answer tests pass; same seed → byte-identical output twice |

**Tracks B & C — alternating**
| # | Track | Phase |
|---|---|---|
| 5 | Mobile | P0 shell |
| 6 | Web | P0 shell + theme toggle |
| 7 | Mobile | P1 DB + manual entry + sync wiring |
| 8 | Web | P1 DuckDB ingest, live + demo paths |
| 9 | Mobile | P2 Safe-to-Spend + Day Dial |
| 10 | Web | P2 chart foundation |
| 11 | Mobile | P3 capture + AI router + eval harness |
| 12 | Web | P3 Sankey hero |
| 13 | Mobile | P4 merchant resolver + reversals |
| 14 | Web | P4 Tier 0 features |
| 15 | Mobile | P5 multi-currency + remittance + Trip Mode |
| 16 | Web | P5 query bar + SQL sandbox |
| 17 | Mobile | P6 worth-it + Reckoning + nudge budget |
| 18 | Web | P6 workers + engine wiring |
| 19 | **Mobile** | **P7 splits + cash → SHIP GATE, decide store question** |
| 20 | Web | P7 Tier 1 analytics |
| 21 | Web | P8 landing route + Lenis |
| 22 | Web | P9 Vercel deploy, share links, a11y sweep |
| 23 | Mobile | P8 voice + receipt OCR |
| 24 | Both | Buffer: eval regression, hardening, whatever broke |

Session 19 is the real milestone. You'll have used the app daily for the sessions either side of it, and that's what tells you whether the store question is worth $99.
