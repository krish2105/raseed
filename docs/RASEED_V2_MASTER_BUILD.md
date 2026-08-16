# RASEED V2 — CTO Review & Build Plan

Consolidates every decision from design through the executive layer, then adds what's actually missing.

---

## 1. Where the project stands

Real, shipped, working. 43 commits, live on Vercel. The seeded 951-row ledger drives real output: recurrence detection found the landlord at ₹22,000/30d, caught the Netflix hike at ₹1,825/year, merchant Gini computes at 0.45. Monorepo with a shared domain layer. Honest limitations published on the landing page.

**Locked decisions carried forward:**
- Monorepo, pnpm + Turborepo, shared `@raseed/*` packages, TS source not build artifacts
- Local-first mobile (op-sqlite source of truth), DuckDB-WASM analytics in the browser
- Integer minor units, `v_spend` defined once, FX frozen at transaction date
- Supabase from day one, RLS on every table
- Design thesis: currency as temperature — brass INR, verdigris AED
- Workspace layer bolted on: `personal` | `business`, RBAC, hash-chained audit, approvals
- Cut permanently: antigravity telemetry, SSO/Okta, Gantt, resource capacity, 3D globe, AA integration, SMS parsing, anything investment-advisory

---

## 2. The uncomfortable read

**RASEED is an outstanding data-engineering and design project with a thin AI layer.**

The analytics are genuinely strong — DuckDB-WASM, Holt-Winters, block bootstrap, MAD anomalies, Benford, Gini, rate×volume variance. That's real quantitative work.

But the "AI" is currently one LLM call with a JSON schema. That's a wrapper. Every candidate applying for the same Dubai AI/ML roles has an LLM wrapper. Nobody is differentiated by calling an API.

**You are applying for AI/ML Analyst roles. The single highest-leverage thing you can add is owning a model end to end** — train it, evaluate it, calibrate it, deploy it on-device, measure it in production, and show all of that inside the product.

That is Section 3, and I'd rank it above every remaining feature in the backlog.

---

## 3. The AI/ML layer — highest priority

### A1 · Distilled on-device categoriser
Train a small classifier on your own confirmed transaction labels. Export to `.pte`, run locally.

<cite index="128-1">react-native-executorch runs models on-device via ExecuTorch, Meta's inference engine, with CoreML on iOS for Neural Engine acceleration.</cite> <cite index="131-1">It requires the New Architecture, which Expo SDK 55+ always enables</cite> — you're on 57, so you're already there. <cite index="132-1">It needs a dev build, not Expo Go</cite> — also already true for you.

The deployment detail that makes this properly engineered: <cite index="132-1">export your PyTorch model to `.pte` using `torch.export` and the ExecuTorch edge pipeline, host the file, and download it on launch via expo-file-system — the model loads from disk, so you can version and update it OTA with no app store release.</cite>

**Result:** LLM route drops from ~15% to near zero. Cost to ₹0. Latency under 30ms. Works in airplane mode. And you have a train → export → deploy → monitor story that is exactly what the job description asks for.

### A2 · Active learning loop
Your "worth it?" queue is already a labelling queue. Use **uncertainty sampling** — surface the transactions the model is least confident about, not random ones.

Deliverable: a label-efficiency curve showing accuracy vs number of labels, uncertainty sampling against random baseline. That's a chart with a real result in it.

### A3 · Embedding-based merchant resolution
Replace trigram matching with a small on-device sentence encoder. Cache vectors in SQLite, cosine similarity for retrieval.

Publish the ablation:

| Rung | Top-1 accuracy | Cost | Latency |
|---|---|---|---|
| Exact alias | — | 0 | <5ms |
| + trigram | — | 0 | <20ms |
| + embeddings | — | 0 | <40ms |
| + LLM | — | ~400 tok | ~800ms |

Filling that table with your own measured numbers is worth more than any feature you could add instead.

### A4 · Confidence calibration
When the parser reports 0.9 confidence, is it correct 90% of the time? Compute a reliability diagram and expected calibration error from `capture_log`. Fix with temperature scaling.

Almost nobody does this in a portfolio project. It is unmistakably senior work and it costs you an afternoon.

### A5 · The eval dashboard as a product surface — `/lab/model`
Put your eval harness *in the product*. Live, on real data:
- Parse accuracy, category macro-F1, merchant top-1
- Route distribution (rules / local / embedding / LLM)
- Latency p50 / p95, cost per 1,000 captures
- Calibration curve and ECE
- Regression history across prompt and model versions

This is the most differentiating screen you could build. It's the one an interviewer will open first and ask about for twenty minutes.

### A6 · Shadow mode + versioning
Every capture records `prompt_version` and `model_version`. New prompts run in the background on real traffic, are scored offline, and ship only if they win. The user never sees a candidate output.

### A7 · Forecast backtesting
Rolling-origin cross-validation. MAPE and sMAPE per horizon against a **seasonal-naive baseline**. Display the baseline comparison on screen — if Holt-Winters doesn't beat naive on your data, say so. Most forecast demos fail this test silently; passing it visibly is the credibility move.

### A8 · Month-end analyst agent
Not a chatbot. A scheduled agent that runs the analysis suite and writes a cited narrative:

> October cost ₹18,240 more than September. ₹12,000 was rent timing (two payments landed in one month), ₹4,200 the Dubai trip, ₹1,830 rupee weakness on AED spend, ₹210 everything else.

Every number links to its lineage rows and the SQL that produced it. Grounded generation with citations — the same discipline as RAG, applied to your own ledger.

### A9 · Counterfactuals
"Without the Dubai trip, your savings rate would have been 34% instead of 19%." Cheap to compute from data you already have, and it's the kind of sentence people screenshot.

### A10 · Five-way variance bridge
Extend rate×volume to decompose month-over-month change into **price · volume · mix · FX · one-off**. Components must sum exactly to total variance — that's the test.

---

## 4. Production engineering — what makes it look professional

| # | Item | Why |
|---|---|---|
| P1 | **Idempotency keys on capture** | A retried request must not double-write a transaction. Real correctness, cheap to add. |
| P2 | **LLM cost guard** | Hard monthly cap; on breach, degrade to on-device and tell the user. Ship no product with an uncapped spend path. |
| P3 | **Observability** | Sentry, structured logs, a `/health` route |
| P4 | **Feature flags + kill switch** | Per-feature, so a broken forecast doesn't take the dashboard down |
| P5 | **Full data export** | One click, JSON + raw SQLite. Portability is a user right, not a feature. |
| P6 | **E2E tests** | Playwright for web, Maestro for mobile |
| P7 | **Visual regression** | Playwright screenshots against the seeded ledger — the only thing that reliably catches broken charts |
| P8 | **CI gates that fail the build** | Lighthouse CI, axe-core, DuckDB rebuild <400ms on the seeded ledger, and a golden-set accuracy floor |

P8 is the one worth emphasising. A CI job that fails when parse accuracy drops below 0.90 means your prompt changes can't silently regress. That's the difference between an experiment and a system.

---

## 5. UX upgrades

| # | Upgrade | Note |
|---|---|---|
| U1 | **⌘K becomes universal** | Navigate, query, capture, *and act* — "approve INV-204", "add ₹200 chai" |
| U2 | **Keyboard-first dashboard** | `j`/`k` rows, `/` search, `g o` overview, `?` shortcut sheet. Data apps live or die on this. |
| U3 | **Indian number formatting** | ₹1.2L and ₹1.2Cr when home currency is INR; Western grouping for AED. Nobody in this category does it and every Indian user notices immediately. |
| U4 | **Chart annotations** | Pin a note to a date — "moved to Dubai", "started new job" — and it renders on every time series. Rare, and transforms how the charts read. |
| U5 | **Comparison mode** | Overlay any two periods on any chart |
| U6 | **Saved views** | Name a URL state, pin it to the rail |
| U7 | **Focus mode** | Hide chrome, one chart full-bleed, for presenting |
| U8 | **Print stylesheet** | Board packs get printed. Pending state must be hatched, not just coloured, so it survives greyscale. |
| U9 | **Density toggle** | Comfortable / compact |
| U10 | **Teaching empty states** | Every chart's empty state offers "load demo" or "import CSV" |
| U11 | **60-second guided tour** | Driven by the real demo ledger, not tooltip bubbles |

---

## 6. Visual upgrades

Each of these replaces something weaker, rather than adding decoration:

- **Bullet charts** instead of progress bars for budget vs actual. Same space, encodes actual + target + qualitative bands. Strictly more informative.
- **Horizon chart** for twenty categories over time in the height of three normal charts.
- **Slope graph** for two-period category rank changes. Clearer than a bump chart when there are only two periods.
- **Cycle plot** for day-of-week seasonality — shows both the weekday effect and its trend over time. Badly underused.
- **Small multiples** grid for per-category trends, shared y-axis.
- **Beeswarm** for transaction size distribution — outliers become obvious.
- **Sparklines** inline in the KPI bar and in table rows.
- **Fan chart** with genuine P10/P50/P90 bands in `--horizon`, never in an actuals colour.

---

## 7. Priority order

Everything below assumes the workspace layer (W1–W12) is either done or explicitly deferred.

| Rank | Block | Why here |
|---|---|---|
| 1 | **A5 eval dashboard** | Fastest path to differentiation; needs no new modelling |
| 2 | **A4 calibration + A7 backtesting** | Both compute from existing logs. High signal, low effort. |
| 3 | **A3 embedding resolver + ablation** | Produces the table that proves you can measure |
| 4 | **A1 on-device model + A2 active learning** | The centrepiece. Do it once the eval harness exists to prove it worked. |
| 5 | **P1, P2, P8** | Correctness and cost safety before more features |
| 6 | **U1–U4** | Biggest daily-use UX wins |
| 7 | **A8 analyst agent + A9 counterfactuals** | Demo gold, but only credible once lineage exists |
| 8 | **A10 five-way bridge + visual upgrades** | Depth |
| 9 | **P3–P7, U5–U11** | Polish |

---

## 8. Phases

| # | Phase | Verify |
|---|---|---|
| V1 | `/lab/model` eval dashboard on existing `capture_log` | Live metrics render; route distribution sums to 100% |
| V2 | Calibration (reliability diagram, ECE, temperature scaling) | ECE reported before and after scaling |
| V3 | Forecast backtesting, rolling-origin CV vs seasonal-naive | Baseline comparison visible on screen, whichever way it goes |
| V4 | Embedding merchant resolver + ablation table | All four rungs measured on the same held-out set |
| V5 | Train + export categoriser to `.pte`; ExecuTorch runtime in mobile | On-device inference <50ms; accuracy within 3pts of the LLM route |
| V6 | Active learning: uncertainty sampling in the rating queue | Label-efficiency curve beats random sampling |
| V7 | OTA model versioning via expo-file-system | Ship a new `.pte` without an app store release |
| V8 | P1 idempotency, P2 cost guard, P8 CI gates | Duplicate POST creates one row; CI fails on a deliberately regressed prompt |
| V9 | U1–U4 (⌘K actions, keyboard nav, lakh/crore, annotations) | Full keyboard traversal; ₹1,20,000 renders as ₹1.2L |
| V10 | A8 analyst agent + A9 counterfactuals | Every claim in the narrative links to lineage rows |
| V11 | A10 five-way bridge + visual upgrades | Bridge components sum exactly to total variance |
| V12 | P3–P7, U5–U11, polish | Lighthouse ≥95, axe clean, visual regression green |

---

## 9. Still not built, and why

Unchanged from the earlier triage, restated so nothing creeps back:

- **Antigravity telemetry, field-stability gauges, always-stable health pills** — fiction from mockup renders
- **Gantt with dependencies, resource capacity planning, changelog feeds** — project management, not finance
- **SSO with Azure AD / Okta** — weeks of work, no differentiation, and no enterprise buys without SOC 2
- **Account Aggregator, e-invoice transmission** — both require licensed-entity registration
- **SMS parsing** — impossible on iOS, Play policy risk on Android
- **3D globe, Expo Web on Vercel, PowerSync** — impressive-looking, actively worse
- **Any investment or trading feature** — SEBI and SCA

And keep the honest-limitations block on the landing page. It's currently one of the strongest things there.
