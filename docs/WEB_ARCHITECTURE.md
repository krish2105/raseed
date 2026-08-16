# RASEED WEB — Architecture & Feature Menu

The analytical half of RASEED. The Expo app is for **capture**; this is for **interrogation**.

A dual-currency financial command centre. React 19 / Next.js 16. Everything computes in the browser.

---

## 1. The thesis

A phone app answers *"can I buy this coffee."* A dashboard answers *"why did October cost me ₹18,000 more than September, and was it the rent or the rupee."*

Those need different machines. This one runs **OLAP in the browser** — DuckDB-WASM over Apache Arrow — so a 100,000-row ledger pivots in under 150ms with no server round-trip and no data leaving the tab. That single architectural choice is what makes the feature list below affordable.

**Non-negotiable constraint:** the dashboard must be fully usable by someone who has never signed up. A recruiter opening your link gets 18 months of seeded synthetic India+UAE data instantly. A portfolio piece behind a login is a portfolio piece nobody sees.

---

## 2. Stack

| Layer | Choice | Why this and not the obvious one |
|---|---|---|
| Framework | **Next.js 16** App Router, React 19, TS strict | |
| Styling | **Tailwind v4** + shadcn/ui | Components generated via 21st.dev MCP |
| Theme | **next-themes** — dark / light / system | Light mode is designed, not inverted. See §6. |
| Motion | **Motion v13** — `import { motion } from "motion/react"` | The package is `motion`, **not** `framer-motion`. The old name is legacy. |
| Smooth scroll | **Lenis on the landing route only** | Lenis on an app shell is wrong — dashboards are app-like, not scroll-narrative. Hijacked scroll fights dense data. Use it on `/`, native scroll in `/app`. |
| Analytics engine | **DuckDB-WASM + Apache Arrow** | The whole feature list depends on this. Postgres round-trips would make half of §3 unaffordable. |
| Charts | **visx + d3 modules** (`d3-sankey`, `d3-hierarchy`, `d3-scale`, `d3-shape`) | One mental model, full control, composes with Motion. Recharts can't draw a Sankey, a ridgeline, or a Lorenz curve — and shipping two chart libraries to cover the gap is 180KB you don't need. |
| Heavy math | **Web Workers + Comlink** | Monte Carlo with 10,000 paths blocks the main thread. Non-negotiable. |
| Data/tables | TanStack Query + Table v8 + Virtual | 100k rows, virtualized |
| URL state | **nuqs** | Every filter, date range and currency lens lives in the URL. A dashboard view you can't paste into Slack is half a dashboard. |
| Command palette | **cmdk** | ⌘K is the primary navigation, not a nicety |
| Validation | Zod | |
| Data source | Supabase (shared with Expo app) **or** CSV drop **or** demo seed | All three paths, day one |

### Where 21st.dev MCP goes
Setup first — <cite index="3-1">the legacy Magic backend was superseded by the unified 21st MCP and all old keys were reset, so get a fresh one at 21st.dev/mcp; the `/ui` trigger was a convention of the old tool descriptions, not the protocol, so you now just ask in natural language.</cite> <cite index="5-1">On Claude Code, install the plugin that bundles the CLI skill and the remote MCP server, or add the agent skill with `npx skills add 21st-dev/skill`.</cite>

**Use it for:** icon rail, command palette shell, drawer, data table, tabs, toggles, toasts, form controls, date-range picker, empty states.
**Hand-build:** every chart, the Sankey hero, the currency lens, the query bar rendering. Generated components are your chassis, not your signature.

---

## 3. Feature menu — choose from these

Tier 0 ships regardless. Tiers 1–3 are yours to cut. Tell me which and I'll strip the master prompt accordingly.

### Tier 0 — Core (8) · build always
| # | Feature | The maths behind it |
|---|---|---|
| 1 | **Cash Flow Sankey** — income → categories → leftover, the hero visual | `d3-sankey` layout over a DuckDB flow aggregation |
| 2 | **Net worth timeline**, dual-currency | Running balance with FX frozen at transaction date |
| 3 | **Category treemap + drilldown** | `d3-hierarchy` treemap, area ∝ spend |
| 4 | **Calendar heatmap** — daily spend, 18 months | Quantile-binned colour scale |
| 5 | **Burn rate & runway** | `runway_months = liquid / trailing_3mo_median_burn` |
| 6 | **Savings rate**, rolling 3/6/12 month | `(income − spend) / income`, EWMA-smoothed |
| 7 | **Budget variance** — planned vs actual | Variance decomposed into **rate × volume**: `Δ = (p₁−p₀)·q₀ + (q₁−q₀)·p₀ + (p₁−p₀)(q₁−q₀)`. Tells you whether you bought more coffee or coffee got dearer. |
| 8 | **⌘K Query Bar** — natural language → SQL → chart | NL→SQL against a read-only DuckDB view, sandboxed |

### Tier 1 — Recommended (8) · this is where it stops looking like a template
| # | Feature | The maths behind it |
|---|---|---|
| 9 | **Monte Carlo runway fan** — P10/P50/P90 to next payday | **Block bootstrap**, not IID. Daily spend is autocorrelated; IID sampling produces a fan that's far too narrow and quietly lies to you. |
| 10 | **Holt-Winters forecast** — next 3 months by category | Triple exponential smoothing (level/trend/seasonal), additive |
| 11 | **Anomaly detection** | Median + **MAD** z-score on seasonally-adjusted residuals. Mean/σ breaks the moment one ₹80,000 flight lands in the window. |
| 12 | **FX attribution** — how much of your net worth change was the rupee, not you | Brinson-style decomposition: `Δ = flow_effect + fx_effect + interaction` |
| 13 | **Remittance efficiency ledger** | Implied rate vs mid-market, cumulative cost in home currency |
| 14 | **Subscription waterfall** — annualised cost, price hikes | Recurrence detection (interval CV < 0.15), waterfall of MoM deltas |
| 15 | **Goal solver** — "what monthly amount hits ₹X by date Y" | `PMT` given `FV`, `n`, `r`; solved for contribution |
| 16 | **What-if simulator** — sliders for income, rent, savings rate | Recomputes the whole model reactively; debounced worker calls |

### Tier 2 — Optional (10) · pick 3–4
| # | Feature | The maths behind it |
|---|---|---|
| 17 | **Benford's Law audit** — data-entry error and duplicate detection | First-digit χ² against `log₁₀(1 + 1/d)` |
| 18 | **Spending concentration** — Lorenz curve + **Gini** | `G = 1 − Σ(Xᵢ₊₁−Xᵢ)(Yᵢ₊₁+Yᵢ)` |
| 19 | **Pareto chart** — which 20% of merchants are 80% of spend | Cumulative % on a dual axis |
| 20 | **Merchant cohort retention** | First-purchase cohorts × repeat months, heatmap |
| 21 | **Day-of-week × hour ridgeline** | Kernel density per weekday |
| 22 | **Real vs nominal spend** — inflation-adjusted | CPI-deflated series, India and UAE indices |
| 23 | **EMI amortisation + prepayment optimiser** | Standard schedule; prepayment → interest-saved and tenure-cut curves |
| 24 | **Regret analysis** — from the app's worth-it scores | `regret_rate = Σ(amount \| score=−1) / Σ(amount rated)` per category |
| 25 | **Tax-year switcher** — India FY (Apr–Mar) vs UAE calendar year | Two fiscal calendars over one ledger |
| 26 | **Report export** — PDF / PNG / CSV | Server-side render of the current URL state |

### Tier 3 — Cut unless you're ahead of schedule (4)
Bump chart of category ranks over time · chord diagram of transfers between accounts · 3D globe of spend by geography · peer benchmark against synthetic cohorts.

> The globe is the one to be honest about. It will look impressive in a screenshot and tell you nothing. <cite index="30-1">3D drains the performance budget everywhere the brand doesn't justify it</cite> — and a spend dashboard doesn't.

---

## 4. Architecture

```
┌─ INGEST ──────────────────────────────────────────────────┐
│  Supabase (Expo app sync)  ·  CSV drop  ·  Demo seed      │
│                        ↓                                   │
│              Zod validate → Arrow IPC                      │
└────────────────────────────────────────────────────────────┘
                         ↓
┌─ ANALYTICS (browser, DuckDB-WASM) ────────────────────────┐
│  raw_transactions                                          │
│    ↓  v_spend        ← the ONE spend predicate (§5.2)     │
│    ↓  v_daily        ← date × currency × category rollup   │
│    ↓  v_monthly      ← + FX-frozen home amounts            │
│    ↓  v_flows        ← Sankey edge list                    │
│    ↓  v_recurring    ← interval-CV detection               │
│  All materialised once on load, refreshed on mutation.     │
└────────────────────────────────────────────────────────────┘
         ↓                                    ↓
┌─ WORKERS (Comlink) ──────────┐   ┌─ RENDER (main thread) ─┐
│  montecarlo.worker.ts        │   │  visx + d3 scales      │
│  forecast.worker.ts          │   │  Motion orchestration  │
│  anomaly.worker.ts           │   │  TanStack Virtual      │
│  finance.worker.ts           │   │  nuqs URL state        │
│  (XIRR, PMT, amortisation)   │   └────────────────────────┘
└──────────────────────────────┘
```

### Routes
```
app/
  page.tsx                 landing — Lenis, kinetic hero, case study
  (dash)/
    layout.tsx             icon rail + command bar + theme toggle
    overview/page.tsx      Sankey hero + bento
    flows/page.tsx         cash flow deep dive
    categories/page.tsx    treemap + drilldown + variance
    forecast/page.tsx      Monte Carlo fan + Holt-Winters
    currency/page.tsx      FX attribution + remittance ledger
    ledger/page.tsx        virtualized table, 100k rows
    lab/page.tsx           Benford, Gini, Pareto, cohorts
  api/report/route.ts      PDF export
```

### Directory law
```
lib/
  duck/       client.ts · views.sql · queries.ts   ← every SQL string lives here
  finance/    xirr.ts pmt.ts amortise.ts variance.ts attribution.ts
  stats/      bootstrap.ts holtwinters.ts mad.ts benford.ts gini.ts
  workers/    *.worker.ts + comlink wrappers
  money.ts    THE Money type. No float arithmetic anywhere else.
theme/tokens.css     the only file containing hex values
components/
  charts/     hand-built, every one
  shell/      21st.dev-generated chassis
```

---

## 5. Pipelines

**P1 · Ingest.** Source → Zod → Arrow IPC → `duckdb.insertArrowTable`. CSV parsed in a worker (PapaParse). Demo seed is a **seeded** PRNG so every visitor sees identical data — screenshots stay reproducible.

**P2 · The spend predicate.** Defined exactly once, as a DuckDB view:
```sql
CREATE VIEW v_spend AS
SELECT * FROM raw_transactions
WHERE txn_type = 'spend'
  AND status   = 'confirmed'
  AND reversal_of_id IS NULL
  AND id NOT IN (SELECT reversal_of_id FROM raw_transactions
                 WHERE reversal_of_id IS NOT NULL);
```
Never inline this filter in a component. Every wrong number in every finance dashboard traces back to two places disagreeing about what counts.

**P3 · Currency lens.** A global toggle: `INR home · AED home · native`. It swaps which column the charts read (`home_amount_minor` vs `amount_minor`) — it does **not** recompute history. FX rates are frozen at transaction date and are immutable.

**P4 · Aggregation.** All views materialised on load. Target: full rebuild under 400ms on 100k rows. Charts read Arrow columns directly — no `toArray()`, no JS object churn.

**P5 · Forecast.**
```
series → seasonal decompose → Holt-Winters(α,β,γ grid-searched on holdout)
       → point forecast
       → block bootstrap residuals (block = 7d, preserves weekly autocorrelation)
       → 10,000 paths → P10/P50/P90 fan
```
Report holdout MAPE on screen. A forecast without an error bar is decoration.

**P6 · Anomaly.**
```
daily series → subtract seasonal index → residual
            → MAD = median(|r − median(r)|)
            → robust z = 0.6745·(r − median) / MAD
            → flag |z| > 3.5
```

**P7 · Query bar.** NL → SQL via LLM with the schema in the prompt. **Sandbox is mandatory:** single statement, `SELECT` only, reject `ATTACH INSTALL COPY PRAGMA CREATE DROP UPDATE DELETE`, enforce `LIMIT 5000`, 3s timeout. Parse the AST — do not regex-check. Result shape picks the chart automatically: 1 dim + 1 measure → bar; time + measure → line; 2 dims + 1 measure → heatmap.

**P8 · Render.** Arrow → visx. Charts animate `transform`/`opacity` only. Every chart has three states — loading skeleton at final dimensions, empty with a real instruction, error with the failing query visible.

---

## 6. Design

### Direction
Carry RASEED's thesis: **currency is a temperature.** INR is warm brass, AED cool verdigris. Continuity across the two products is itself the argument — they're one system, not two projects.

**The hero is the Sankey, not a KPI row.** Every finance dashboard on earth opens with four cards containing a big number, a small label and a green arrow. That's the template answer. Here the first thing you see is your money physically moving — income entering from the left, splitting through categories, whatever survives arriving at savings on the right — drawn on load in one 900ms orchestrated stroke. The numbers live inside the flow.

**Structural device:** each panel carries a 2px left edge whose colour is the currency mix of the data inside it. Warm edge = INR-dominant. Cool = AED. Gradient = a month you travelled. It encodes something true rather than decorating.

**Signature interaction:** the ⌘K query bar. Type a question, get a chart. It's what turns this from a report into an instrument.

### Tokens
```css
/* theme/tokens.css — the only file with hex values */
:root[data-theme="dark"] {
  --surface-0:#0F1419; --surface-1:#171D24; --surface-2:#212932;
  --line:#2C353F; --text-hi:#E8EDF2; --text-lo:#8B98A5;
  --inr:#E0A458;  --aed:#4FB0A5;  --good:#7BC96F;
  --warn:#D9544D; --horizon:#7C8CC4;
}
:root[data-theme="light"] {          /* designed, not inverted */
  --surface-0:#F2F4F6; --surface-1:#FFFFFF; --surface-2:#E7EBEF;
  --line:#D3DAE1; --text-hi:#12181F; --text-lo:#5A6773;
  --inr:#B87A2E;  --aed:#2E7F76;  --good:#4E9A44;
  --warn:#B23A34; --horizon:#5566A8;
}
```
Light is a cool paper base (`#F2F4F6`), deliberately not cream — <cite index="72-1">a warm cream near #F4F1EA with a serif display and a terracotta accent is one of the three looks AI-generated design clusters around</cite>, and on a finance dashboard it reads as a tell.

`--horizon` exists so forecast bands are never the same colour as actuals. Projected money must never look like real money.

### Type
| Role | Face | Rule |
|---|---|---|
| Display | **Bricolage Grotesque** (variable) | Width axis animates on the hero. Restraint elsewhere. |
| Numerals | **Geist Mono**, `font-variant-numeric: tabular-nums` | Every figure, every table, no exceptions |
| Body/UI | **Geist Sans** | |

Tabular numerals are load-bearing. Misaligned decimals in a financial table destroy credibility faster than a wrong number.

### Theme toggle — get these right
- `next-themes` with `attribute="data-theme"`, `defaultTheme="system"`, `disableTransitionOnChange`
- `suppressHydrationWarning` on `<html>` — without it React screams on every load
- Chart colours read from CSS variables at render, resolved through `getComputedStyle`, and re-read on theme change. Hardcoded chart palettes are the #1 way theme toggles break.
- Three-state control: Light / System / Dark. Not a binary switch.

### Motion
- Landing route: Lenis + kinetic display type + scroll-linked reveals.
- Dashboard: native scroll, one orchestrated moment (the Sankey draw), everything else is 120ms micro-feedback.
- `transform` and `opacity` only. <cite index="30-1">`backdrop-filter: blur()` costs 15–30% FPS on mid-tier Android</cite> — use it on the command palette overlay and nowhere else.
- `useReducedMotion()` gates everything, with a complete static fallback.

### Copy
Plain, active, second person. Buttons say what happens: "Run forecast," not "Submit." Empty states instruct: "Drop a CSV or load the demo ledger." Errors show the failing query.

---

## 7. Performance budget

| Metric | Target |
|---|---|
| LCP | < 1.8s |
| INP | < 200ms |
| Initial JS (gzip) | < 250KB — DuckDB-WASM lazy-loads after first paint |
| DuckDB view rebuild, 100k rows | < 400ms |
| Query p95 | < 150ms |
| Monte Carlo, 10k paths | < 1.2s in worker, UI never blocks |
| Scroll/animation | 60fps on mid-range Android |
| Responsive floor | 360px, no clipping, no horizontal scroll |

---

## 8. Phases

| # | Phase | Verify |
|---|---|---|
| 0 | Next 16 + Tailwind v4 + tokens + fonts + `next-themes` + rail shell | Toggle switches all three states, no hydration warning, no FOUC |
| 1 | DuckDB-WASM, Arrow ingest, `v_spend` + rollup views, seeded demo generator | 100k rows load; view rebuild timed and logged under 400ms |
| 2 | Chart foundation: scales, axes, tooltips, legend, 3 states, theme-reactive colours | Toggle theme mid-render — every chart recolours, none hardcoded |
| 3 | **Sankey hero** + orchestrated draw | Flow totals reconcile to `v_spend` to the minor unit |
| 4 | Tier 0 features 2–7 | Each number matches a hand-computed fixture |
| 5 | ⌘K query bar + NL→SQL + sandbox + auto chart selection | Sandbox rejects 12 adversarial injection strings; timeout fires |
| 6 | Workers + finance/stats engines, unit tested | XIRR, PMT, Gini, Benford, MAD verified against known-answer fixtures |
| 7 | Tier 1: Monte Carlo fan, Holt-Winters, anomalies, FX attribution | Holdout MAPE displayed; block bootstrap fan strictly wider than IID |
| 8 | Chosen Tier 2 features | |
| 9 | Landing route: Lenis, kinetic hero, case-study scrollytell | Lighthouse ≥ 95 all four categories |
| 10 | Export, share links via nuqs, a11y sweep, deploy | Pasted URL reproduces the exact view; keyboard-only pass on every route |

---

## 9. Honest limitations

- **DuckDB-WASM costs ~3MB.** Lazy-load it after first paint. The trade is worth it — this feature list is impossible without it — but don't pretend the download is free.
- **In-browser analytics has a ceiling** around a few million rows on mid-range hardware. Fine for a personal ledger, wrong for enterprise. Say so when asked; knowing the ceiling is the senior answer.
- **NL→SQL will produce wrong-but-valid queries.** Always show the generated SQL. Never present an LLM-authored number as authoritative without the query visible beneath it.
- **Holt-Winters needs ~2 full seasonal cycles.** Under 24 months of data, fall back to a trailing median and say why on screen.
- **Forecasts are not advice.** No investment or trading features. That's regulated activity under SEBI in India and the SCA in the UAE, and a portfolio project is not where you find out.
