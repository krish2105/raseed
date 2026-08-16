# RASEED — Progress

Claude reads this at the start of every session. Tick sessions as they complete. Keep "Open threads" honest — it's the handoff between sessions.

**Current session: 2**

---

## Track A — Shared core (must finish before B or C)

- [x] **S0** Monorepo scaffold — both apps import a shared package; breaking it fails both typechecks
- [x] **S1** `@raseed/money` + `@raseed/tokens` — `allocate` gives 34/33/33; tokens render in both apps
- [ ] **S2** `@raseed/schema` + Supabase migrations + RLS — parity test catches deliberate drift; cross-user read returns zero rows
- [ ] **S3** `@raseed/engines` domain half — safeToSpend, pairReversals, detectRecurrence, detectRemittance, normaliseMerchant, rankNudges, regretRate, all unit tested
- [ ] **S4** `@raseed/engines` finance/stats + `@raseed/fixtures` — known-answer tests pass; same seed twice gives identical output

## Tracks B & C — alternating

- [ ] **S5** Mobile P0 — shell, tokens, fonts, three tabs
- [ ] **S6** Web P0 — shell, three-state theme toggle, no hydration warning, no FOUC
- [ ] **S7** Mobile P1 — op-sqlite, schema, manual entry, sync wiring
- [ ] **S8** Web P1 — DuckDB-WASM, Arrow ingest, live + demo paths, view rebuild <400ms
- [ ] **S9** Mobile P2 — Safe-to-Spend engine + Day Dial
- [ ] **S10** Web P2 — chart foundation, theme-reactive colours, zero hex outside tokens
- [ ] **S11** Mobile P3 — capture router, confirmation sheet, eval harness ≥0.90
- [ ] **S12** Web P3 — Sankey hero, totals reconcile to `v_spend`
- [ ] **S13** Mobile P4 — merchant resolver, alias learning, reversal pairing
- [ ] **S14** Web P4 — Tier 0 features 2–7
- [ ] **S15** Mobile P5 — multi-currency, remittance detection, Trip Mode
- [ ] **S16** Web P5 — ⌘K query bar, SQL sandbox rejects 12 adversarial strings
- [ ] **S17** Mobile P6 — worth-it loop, Weekly Reckoning, 4-nudge cap
- [ ] **S18** Web P6 — Comlink workers, engines wired
- [ ] **S19** 🚩 **Mobile P7 — splits + cash. SHIP GATE. Decide the store question here.**
- [ ] **S20** Web P7 — Tier 1 analytics; block-bootstrap fan provably wider than IID
- [ ] **S21** Web P8 — landing route, Lenis, Lighthouse ≥95
- [ ] **S22** Web P9 — Vercel deploy, nuqs share links, a11y sweep
- [ ] **S23** Mobile P8 — voice capture, receipt OCR
- [ ] **S24** Both — buffer, eval regression, hardening

---

## Open threads

*Anything left unfinished or unresolved. Clear it or carry it forward — never let it sit for more than two sessions.*

- **EAS unverified** (Android dropped from scope entirely — iOS + web only) — no JDK on the machine (`sdkmanager` is installed but holds only
  cmdline-tools); `eas-cli` not installed and `eas login` needs Krishna's credentials. iOS Simulator
  dev build is the only proven mobile target. **Own step, before S5.**
- **ESLint pinned to 9.x** — ESLint 10 breaks `eslint-plugin-react`, which both `eslint-config-next`
  and `eslint-config-expo` depend on. Same for TypeScript, pinned to 6.0.3 until `typescript-eslint`
  supports TS 7. **Revisit when the plugin ecosystem catches up.**

## Deferred decisions

- **Store submission** — revisit at S19 after two weeks of daily use. $99/yr Apple, $25 Google.
- **Tier 2 web features** — pick 3–4 before S20. Leading candidates: Benford audit, Gini/Lorenz, EMI prepayment optimiser.
- **PowerSync** — only if last-write-wins produces real conflicts. Not before.
