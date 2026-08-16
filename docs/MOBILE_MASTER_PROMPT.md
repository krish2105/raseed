# RASEED — Claude Code Master Build Prompt

Paste everything below the line into Claude Code, in a fresh empty directory, with `RASEED_ARCHITECTURE.md` also present in that directory.

**Before you start, run these in the project directory:**
```bash
# 21st.dev — for the web companion only (Phase 10). Fresh key required;
# all legacy Magic keys were reset. Get one at https://21st.dev/mcp
npx skills add 21st-dev/skill

# Expo SDK 57 requires a development build, not Expo Go —
# Skia, Reanimated, op-sqlite and Victory Native all need native code.
npm install -g eas-cli && eas login
```

---

## ROLE

You are the sole engineer on RASEED, a local-first dual-currency expense tracker for Expo (iOS + Android). You are building it in phases. `RASEED_ARCHITECTURE.md` in this directory is the specification — read it fully before writing any code, and treat it as the source of truth for the data model, pipelines, formulas, and design tokens.

## ENGINEERING RULES — non-negotiable

1. **Think before coding.** State assumptions explicitly. If the spec is ambiguous, say what's ambiguous and ask — do not pick silently. If a simpler approach exists than what the spec describes, say so before implementing.
2. **Simplicity first.** Minimum code that solves the problem. No speculative abstractions, no configurability nobody asked for, no error handling for impossible states. If you write 200 lines and it could be 50, rewrite it.
3. **Surgical changes.** When editing existing files, touch only what the current task requires. Don't reformat, don't "improve" adjacent code, match the existing style. Remove only the orphans your own change created.
4. **Goal-driven.** Every phase below has verify criteria. Write the test first where it's a pure function. Loop until the criteria pass. Never declare a phase done without demonstrating the verification.
5. **One phase per session.** Do not run ahead. End each phase with a summary of what was built, what was verified, and what you had to assume.

## STACK — pin these exactly

```
Expo SDK 57 (React Native 0.86)   # SDK 56 has a Hermes V1 memory
                                  # regression affecting Reanimated
expo-router                       # typed routes
nativewind@^4                     # + a hard token file, tokens are single-source
react-native-reanimated@^4
react-native-gesture-handler@^2
@shopify/react-native-skia
victory-native                    # (XL) — Skia charts
@op-engineering/op-sqlite         # JSI + SQLCipher
drizzle-orm + drizzle-kit
@legendapp/state@^3
expo-secure-store
expo-local-authentication
expo-speech-recognition           # on-device STT, no audio leaves device
expo-notifications
expo-camera
```
Always install with `npx expo install`, never bare `npm install`, so peer versions match the SDK. Verify each package resolves before writing code that imports it; if a package name has changed since this prompt was written, search and tell me what you found instead of guessing.

## ARCHITECTURE INVARIANTS — violating these is a bug

- **SQLite is the source of truth.** No server, no network dependency, through Phase 9. Every screen must render correctly in airplane mode.
- **Money is integer minor units.** Never a float. `amount_minor: number`, currency as a separate `'INR' | 'AED'` field. A `Money` type and its arithmetic helpers live in `lib/money.ts` and nothing does raw arithmetic on amounts outside that file.
- **FX rates freeze at transaction date.** `home_amount_minor` and `fx_rate` are written once and never recomputed.
- **Spend is a view, not a filter.** Define the "what counts as spend" predicate once as a Drizzle view (`v_spend`) per the invariant in §4 of the spec. Never inline that filter in a screen.
- **Never write a transaction without user confirmation.** The parser proposes; the confirmation sheet commits.
- **Pure engines are pure.** `safeToSpend`, `pairReversals`, `detectRecurrence`, `detectRemittance`, `normaliseMerchant`, `rankNudges`, `regretRate` take data in and return data out. No DB access, no React, no side effects. They live in `lib/engines/` and are unit tested.

## PROJECT STRUCTURE

```
app/                      # expo-router
  (tabs)/
    index.tsx             # Today — dial + capture + today's ledger
    ledger.tsx            # full history, search, filters
    you.tsx               # accounts, budgets, goals, settings
  reckoning.tsx           # weekly card stack (modal)
  txn/[id].tsx
components/
  dial/                   # Skia Day Dial
  capture/                # capture bar + confirmation sheet
  ledger/                 # receipt-styled rows
  primitives/             # Button, Sheet, Field — built on tokens
lib/
  money.ts                # THE money type + arithmetic
  db/
    schema.ts             # Drizzle
    migrations/
    views.ts              # v_spend and friends
    seed.ts
  engines/                # pure functions, unit tested
  ai/
    router.ts             # rules → alias → llm
    prompts/
    schemas.ts            # zod schemas for structured output
  fx.ts
theme/
  tokens.ts               # the ONLY place hex values exist
eval/
  golden.jsonl            # labelled capture strings
  run.ts                  # scores the golden set
__tests__/
```

## DESIGN — follow §6 of the spec exactly

The thesis is **currency as temperature**: INR is warm brass `#E0A458`, AED is cool verdigris `#4FB0A5`, and every number, arc and chart segment carries its currency's colour so you never have to check which country's money you're reading.

- Tokens in `theme/tokens.ts`. No hex literal appears anywhere else in the codebase. If you need a colour that isn't a token, stop and ask.
- Type: Bricolage Grotesque (display), Geist Mono (all numerals, **tabular figures on**), Geist Sans (body). Load via `@expo-google-fonts/*`; if a package doesn't exist, tell me and propose the closest available alternative rather than substituting silently.
- Dark base by default. Light mode is a designed cool-paper theme (`#F2F4F6`), not an inversion.
- Signature element is the Day Dial. Spend your effort there; keep everything around it quiet.
- Animate `transform` and `opacity` only, on Reanimated worklets. Gate all motion behind `useReducedMotion()` with a complete static fallback.
- Copy voice: plain, second person, no cheerleading. "You've got ₹740 for today." Errors state what happened and what to do.

## AI ROUTER — cost discipline is a requirement, not a nice-to-have

```
[1] deterministic rules    target ~70% of captures, 0 tokens, <10ms
[2] alias table + local classifier   ~20%, 0 tokens, <30ms
[3] LLM structured output  ≤15%, ~400 tokens, batched
```
- Multi-clause input is **one** LLM call, never one per clause.
- Strict JSON schema output, validated with zod. Reject and retry once on schema failure, then fall back to a low-confidence manual entry — never crash, never silently drop a clause.
- Every capture writes to `capture_log` with route, latency, model, and whether the user edited the result. This table is the eval harness's input.
- Model: Gemini Flash or Groq by default, API key from `expo-secure-store`, user-supplied. No key configured → app works fully, LLM route degrades to manual entry.

## PHASES

Execute one at a time. Do not begin the next until I confirm.

**Phase 0 — Scaffold**
Expo 57 project, expo-router 3-tab shell, NativeWind, `theme/tokens.ts`, fonts loaded, dev build configured for iOS + Android.
→ *Verify:* app opens on a physical device, all three tabs navigate, display and mono fonts visibly render, tokens drive at least one surface colour.

**Phase 1 — Ledger foundation**
op-sqlite + Drizzle schema from §4, migrations, seed categories and ~60 common India/UAE merchants with aliases. Manual transaction entry form. Ledger tab lists transactions.
→ *Verify:* create, edit, delete a transaction; force-quit and reopen, data persists; `v_spend` view returns correct totals for a hand-built fixture.

**Phase 2 — Safe-to-Spend + Day Dial**
`lib/engines/safeToSpend.ts` per the §2.1 formula including the 3× carryover cap. Skia Day Dial on the Today tab. Tap-to-capture collapse gesture.
→ *Verify:* unit tests cover zero-days, negative pool, carryover cap, mid-month income change. Dial number equals hand-computed value for three fixtures.

**Phase 3 — Text capture**
Segmentation, rules layer, alias lookup, LLM fallback with zod schemas, confirmation sheet, `capture_log`. `eval/golden.jsonl` with the first 50 labelled strings and `eval/run.ts`.
→ *Verify:* `npm run eval` reports ≥0.90 amount exact-match and ≥0.95 transaction-count match on the golden set. Print the route distribution.

**Phase 4 — Merchant resolver + reversals**
Normalisation, trigram fallback, LLM merchant lookup with caching, alias learning on confirm. Reversal pairing per P3, auto at ≥0.9 confidence.
→ *Verify:* replay a 100-transaction fixture; alias hit rate rises across the replay and is reported. Seeded refund pair nets to zero in `v_spend`.

**Phase 5 — Dual currency**
FX cache and freeze-on-write, home-currency conversion, remittance detection per P5, Trip Mode with per-day burn.
→ *Verify:* a seeded AED→INR remittance appears in neither spend nor income totals, and `remittance_efficiency` computes. Changing home currency leaves historical `home_amount_minor` untouched.

**Phase 6 — Worth-it + Reckoning + nudges**
Rating queue per P8, Reckoning card stack, `regretRate`, nudge scoring and the 4-per-week cap.
→ *Verify:* regret rate matches a hand-computed fixture. Simulated week generating 20 candidate nudges ships exactly 4, highest-scored.

**Phase 7 — Splits + cash**
Split by amount/share/percent, Ledger Link generation, UPI deep link for INR settlement, weekly cash count writing a single adjustment transaction.
→ *Verify:* split totals reconcile to the parent transaction to the minor unit. Cash delta writes one transaction and the next expected balance matches.

**SHIP HERE.** Use it daily for two weeks before Phase 8. Report back what actually broke.

**Phase 8** voice + receipt OCR · **Phase 9** recurrence radar, Payday Runway, sandboxed NL→SQL · **Phase 10** Supabase sync, Ledger Link web pages via the 21st MCP, EAS production build.

## QUALITY GATE — every phase

- Runs on a physical Android device, not just the simulator
- Airplane mode: everything works except the LLM route, which degrades gracefully
- No hex literal outside `theme/tokens.ts`
- No float arithmetic on money anywhere
- New pure functions have unit tests in the same commit
- `npx tsc --noEmit` clean, no `any` on money, currency, or transaction types
- 360px width renders without clipping; visible focus states; reduced motion respected

## START

Read `RASEED_ARCHITECTURE.md`. Then tell me:
1. Anything in the spec you think is wrong, over-engineered, or under-specified.
2. Any package above whose current version or name you couldn't verify.
3. Your Phase 0 plan as numbered steps with a verify check on each.

Then wait for my go.
