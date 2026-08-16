# RASEED — Architecture & Product Spec

**रसीद / رسيد** — "receipt" in Hindi, Urdu and Arabic. One word that works in both your countries.

A local-first, dual-currency daily expense tracker for people whose money lives between India and the UAE.

---

## 1. Problem statement

Existing trackers fail in four specific, documented ways for Indian and Gulf users:

| Failure | What happens | RASEED's answer |
|---|---|---|
| **Opaque merchants** | UPI logs show `razorpay@hdfcbank`, UAE card logs show `CARREF MALL EMIRT AE` | Merchant Resolver with a learned alias table |
| **P2P treated as spend** | Sending ₹5,000 to a friend counts as an "expense" | Explicit transfer/settlement types, excluded from spend |
| **Refund double-count** | Failed UPI debit + refund 30 min later = two transactions | Reversal pairing collapses them to one net event |
| **Cross-border double-count** | AED→INR remittance shows as spend in AED *and* income in INR | Remittance objects link both legs; neither is spend |

Plus the universal one: **friction kills the habit.** If logging a chai takes more than 5 seconds, you stop after week three.

**The single job of the home screen:** tell you what you can spend today, in the currency you're standing in.

---

## 2. Feature set

### 2.1 Core daily loop (your four picks)

**F1 — One-line / voice multi-capture**
Type or speak a run-on line; get structured transactions back.
```
"chai 20, auto 80, bigbasket 640"      → 3 INR transactions
"careem 24 aed, lunch 45, salik 4"     → 3 AED transactions
"400 ka petrol dala aur 120 parking"   → 2 INR transactions (Hinglish)
```
Rules → local classifier → LLM router. On-device speech recognition, so voice costs nothing and works on flight mode for the STT step.

**F2 — Safe-to-Spend Today**
One number, home screen, recalculated continuously.
```
pool        = liquid_balance
            − Σ(committed bills due before next income)
            − Σ(pending goal sweeps)
            − safety_buffer
days        = days_until_next_income (today inclusive)
base_daily  = pool / days
STS_today   = base_daily + carryover − spent_today
carryover   = Σ(unspent daily allowance), capped at 3 × base_daily
```
The cap matters. Without it a frugal week hands you a number that invites a blowout.

**F3 — "Worth it?" value loop**
End of day, ambiguous transactions surface as a 3-tap review: 👍 / 👎 / skip. Builds a personal value model, not a generic budget.
```
regret_rate(category) = Σ(amount where score = −1) / Σ(amount rated)
```
Output: *"₹4,200 of your ₹6,800 food delivery last month, you marked not worth it."*
No competitor has this. It's the difference between a ledger and a mirror.

**F4 — Splitting + cash reconciliation**
- Split by amount, share, percentage, or scanned line item.
- **Ledger Link**: the other person gets a web URL, no install. India → UPI deep link to settle. UAE → IBAN/bank card.
- **Cash reconciliation**: weekly "what's actually in your wallet?" prompt. The delta becomes a single `Uncategorised cash` transaction. This is the ₹2,000/month that every other app loses.

### 2.2 Intelligence layer (my additions)

**F5 — Merchant Resolver.** Normalise raw descriptor → canonical merchant. Alias table grows with every confirmation, so `razorpay@hdfcbank` learns to mean *Big Bazaar Aundh* once and stays learned. Zero LLM cost on repeat.

**F6 — Reversal & duplicate reconciliation.** Same account, opposite direction, amount within 1%, ≤14 days, matching merchant → paired and netted out.

**F7 — Recurrence radar.** Statistical, not regex. Group by merchant; if n≥3 and `stdev(intervals) < 0.15 × mean(intervals)` and amounts within ±10%, flag as recurring. Surfaces annualised cost and price hikes: *"Netflix went ₹649 → ₹799. That's ₹1,800/year more."*

**F8 — Ghost Spend.** Recurring charges you never rate as "worth it" and never manually reference. Prime cancel candidates.

**F9 — Payday Runway.** Bootstrap-sample your own last 90 days of daily spend, simulate to next income date, report `P(reach payday without dipping into buffer)`. Not a forecast graph — a probability with a number attached.

**F10 — Ask your ledger.** Natural language → read-only SQL over local SQLite, sandboxed (`SELECT` only, single statement, no PRAGMA, row limit). *"how much on food in Dubai last trip"*. Results render as a table plus one chart.

**F11 — Nudge budget.** Hard cap: 4 notifications per week. Every candidate nudge is scored and only the top ones ship.
```
score = |impact_home_currency| × urgency × novelty × (1 − fatigue_7d)
```
Notification fatigue is *the* named reason these apps get uninstalled. Treating attention as a budget is the fix.

**F12 — The Weekly Reckoning.** Sunday, 60 seconds, a swipeable card stack: confirm ambiguous merchants, rate the week's big-ticket items, see one insight, set next week's buffer. This is the retention loop — the thing that makes it daily rather than a January resolution.

### 2.3 India ⇄ UAE layer (the actual differentiator)

**F13 — Dual ledger.** Every transaction stores `amount_minor` + `currency` **and** `home_amount_minor` + `fx_rate_used` frozen at transaction date. Change your home currency later, historical numbers don't lie.

**F14 — Remittance objects.** An AED outflow and an INR inflow within 5 days, related by an FX rate within a 5% band, get linked into one `transfer_group`. Neither leg counts as spend or income. Bonus metric nobody else computes: **remittance efficiency** — what your effective rate was versus mid-market, i.e. what the transfer actually cost you.

**F15 — Trip Mode.** Toggle (or auto-detect via timezone/locale change). All spend within the window groups into a trip envelope with its own budget, per-day burn rate, and an iOS Live Activity showing remaining budget on the lock screen.

**F16 — Bilingual capture.** Hinglish and Arabic-transliterated merchant strings are first-class in the parser prompt and in the eval set. `"शाम को 200 ka khana"` parses.

### 2.4 Supporting

- Receipt scan → on-device OCR (ML Kit / Vision) → LLM structures line items → split by item
- Envelope goals with surplus auto-sweep
- CSV / PDF statement import; Splitwise import
- Home-screen widget + Siri Shortcut / Android quick tile for capture
- Biometric lock; SQLCipher-encrypted DB; BYO API key option so raw data never leaves the device unless you say so

---

## 3. Stack

Versions verified August 2026.

### Client
| Layer | Choice | Why |
|---|---|---|
| Framework | **Expo SDK 57** (React Native 0.86) | SDK 57 shipped 30 June 2026. SDK 56 has a Hermes V1 memory regression affecting Reanimated — start on 57. |
| Routing | expo-router (typed routes) | |
| Styling | NativeWind v4 + a hard token file | Tailwind semantics, tokens stay single-source |
| Animation | Reanimated 4 + Gesture Handler 2 | UI-thread, no bridge |
| Graphics | @shopify/react-native-skia | The Day Dial, the arcs, the card stack |
| Charts | **Victory Native (XL)** | Skia + Reanimated + D3; 100fps on low-end Android. Needs a dev build — not Expo Go. |
| Database | **op-sqlite** (JSI, SQLCipher) | Synchronous JSI queries; orders of magnitude faster than bridge SQLite, which matters because every screen runs analytics SQL |
| ORM | Drizzle | Type-safe, works with op-sqlite, migrations |
| State | Legend-State v3 | Fine-grained reactivity + a Supabase sync plugin when you want Phase 10 |
| Secrets | expo-secure-store + expo-local-authentication | |
| Voice | expo-speech-recognition (native SFSpeechRecognizer / Android SpeechRecognizer) | On-device, free, no audio leaves the phone |
| Native UI | Expo UI (SwiftUI / Jetpack Compose primitives) | Stable since SDK 56; use for widgets and pickers |

### Backend — deliberately absent until Phase 10
Phase 1–9 has **no server**. The SQLite file is the source of truth. This is a real architectural decision, not laziness: for single-user finance data, a sync engine is complexity you pay for and don't need. Ship the whole app offline-first, add sync when you own a second device.

When you do:
- **Supabase** — Postgres, Auth, Storage, Edge Functions
- **Legend-State Supabase plugin** for sync. Only reach for **PowerSync** if you hit genuine multi-device write conflicts — it's the only one of PowerSync / Zero / ElectricSQL with first-class offline support, but it's heavier than you need at n=1.
- **Cloudflare Workers** — public Ledger Link pages + a daily FX rate cache (one cron, one KV write)

### AI layer — routed, not always-on
```
input → [1] deterministic rules   ~70% of captures, 0 tokens, <10ms
      → [2] local alias/classifier ~20%, 0 tokens, <30ms
      → [3] LLM structured output  ~10%, ~400 tokens
```
Primary model: **Gemini 2.x Flash** or **Groq Llama** (free tiers, low latency). Fallback: Claude Haiku. All calls use strict JSON schema output. Target cost: **under ₹5/month** at 20 captures/day.

### Where 21st.dev MCP actually fits — read this carefully
**21st.dev generates React / shadcn web components. It does not generate React Native.** It cannot build your Expo screens.

Use it for the **companion web surface**, where it's genuinely excellent:
- Ledger Link settlement pages (the thing you send to a friend)
- Landing page
- Optional web dashboard reading the synced Supabase DB

Setup has changed — <cite index="3-1">the old Magic backend was superseded by the unified 21st MCP and all legacy API keys were reset, so you need a fresh key from 21st.dev/mcp. The `/ui` and `/21` triggers were a convention of the old tool descriptions, not the protocol — you now just ask in natural language.</cite> On Claude Code, install <cite index="5-1">the 21st.dev Claude Code plugin, which bundles the CLI skill and the remote MCP server in one install, or add the agent skill with `npx skills add 21st-dev/skill`.</cite>

For the Expo app itself, your "component library" is the token file plus hand-built Skia/Reanimated primitives in section 6.

---

## 4. Data model

```sql
-- ── Money containers ────────────────────────────────────────────────
CREATE TABLE accounts (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL,          -- bank | card | cash | wallet
  currency      TEXT NOT NULL,          -- INR | AED
  opening_minor INTEGER NOT NULL DEFAULT 0,
  is_cash       INTEGER NOT NULL DEFAULT 0,
  archived_at   INTEGER
);

-- ── Merchant resolution ─────────────────────────────────────────────
CREATE TABLE merchants (
  id             TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  category_id    TEXT REFERENCES categories(id),
  country        TEXT,                  -- IN | AE | NULL
  logo_url       TEXT
);

CREATE TABLE merchant_aliases (
  id          TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  alias_raw   TEXT NOT NULL,            -- 'razorpay@hdfcbank'
  alias_norm  TEXT NOT NULL,            -- normalised, indexed
  source      TEXT NOT NULL,            -- seed | user | llm
  hit_count   INTEGER NOT NULL DEFAULT 0,
  UNIQUE(alias_norm)
);
CREATE INDEX idx_alias_norm ON merchant_aliases(alias_norm);

CREATE TABLE categories (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  parent_id TEXT REFERENCES categories(id),
  icon      TEXT,
  color     TEXT,
  kind      TEXT NOT NULL               -- need | want | save | income
);

-- ── The ledger ──────────────────────────────────────────────────────
CREATE TABLE transactions (
  id                TEXT PRIMARY KEY,
  occurred_at       INTEGER NOT NULL,   -- epoch ms
  direction         TEXT NOT NULL,      -- out | in
  amount_minor      INTEGER NOT NULL,   -- native currency, minor units
  currency          TEXT NOT NULL,
  home_amount_minor INTEGER NOT NULL,   -- frozen at txn date
  fx_rate           REAL NOT NULL,
  account_id        TEXT NOT NULL REFERENCES accounts(id),
  merchant_id       TEXT REFERENCES merchants(id),
  category_id       TEXT REFERENCES categories(id),
  raw_text          TEXT,               -- what the user typed/said
  source            TEXT NOT NULL,      -- manual | voice | ocr | import
  txn_type          TEXT NOT NULL,      -- spend | income | transfer | settlement
  transfer_group_id TEXT,               -- links remittance legs
  reversal_of_id    TEXT REFERENCES transactions(id),
  trip_id           TEXT REFERENCES trips(id),
  status            TEXT NOT NULL,      -- pending | confirmed | voided
  confidence        REAL,               -- parser confidence 0–1
  note              TEXT
);
CREATE INDEX idx_txn_time    ON transactions(occurred_at DESC);
CREATE INDEX idx_txn_type    ON transactions(txn_type, status);
CREATE INDEX idx_txn_merch   ON transactions(merchant_id, occurred_at);

-- ── The differentiators ─────────────────────────────────────────────
CREATE TABLE worth_scores (
  transaction_id TEXT PRIMARY KEY REFERENCES transactions(id),
  score          INTEGER NOT NULL,      -- -1 | 0 | 1
  rated_at       INTEGER NOT NULL
);

CREATE TABLE recurrences (
  id             TEXT PRIMARY KEY,
  merchant_id    TEXT REFERENCES merchants(id),
  amount_minor   INTEGER NOT NULL,
  currency       TEXT NOT NULL,
  period_days    REAL NOT NULL,
  next_due       INTEGER,
  confidence     REAL NOT NULL,
  last_amount_change INTEGER,           -- price-hike detection
  status         TEXT NOT NULL          -- active | cancelled | dismissed
);

CREATE TABLE trips (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  country      TEXT NOT NULL,
  currency     TEXT NOT NULL,
  started_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  budget_minor INTEGER
);

CREATE TABLE cash_counts (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL REFERENCES accounts(id),
  counted_at         INTEGER NOT NULL,
  counted_minor      INTEGER NOT NULL,
  expected_minor     INTEGER NOT NULL,
  adjustment_txn_id  TEXT REFERENCES transactions(id)
);

-- ── Social ──────────────────────────────────────────────────────────
CREATE TABLE people (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  handle   TEXT,                        -- UPI VPA / phone / IBAN
  currency TEXT NOT NULL
);

CREATE TABLE splits (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  method         TEXT NOT NULL,         -- equal | share | percent | itemised
  share_link_id  TEXT
);

CREATE TABLE split_participants (
  id        TEXT PRIMARY KEY,
  split_id  TEXT NOT NULL REFERENCES splits(id),
  person_id TEXT NOT NULL REFERENCES people(id),
  owed_minor INTEGER NOT NULL,
  currency  TEXT NOT NULL,
  settled_txn_id TEXT REFERENCES transactions(id)
);

-- ── Infrastructure ──────────────────────────────────────────────────
CREATE TABLE fx_rates (
  as_of INTEGER NOT NULL,
  base  TEXT NOT NULL,
  quote TEXT NOT NULL,
  rate  REAL NOT NULL,
  PRIMARY KEY (as_of, base, quote)
);

CREATE TABLE budgets (
  id           TEXT PRIMARY KEY,
  category_id  TEXT REFERENCES categories(id),
  period       TEXT NOT NULL,           -- month | week
  amount_minor INTEGER NOT NULL,
  currency     TEXT NOT NULL
);

CREATE TABLE nudges (
  id       TEXT PRIMARY KEY,
  kind     TEXT NOT NULL,
  payload  TEXT NOT NULL,               -- JSON
  score    REAL NOT NULL,
  created_at INTEGER NOT NULL,
  sent_at  INTEGER,
  acted    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE capture_log (              -- powers the eval harness
  id          TEXT PRIMARY KEY,
  raw_input   TEXT NOT NULL,
  parsed_json TEXT NOT NULL,
  route       TEXT NOT NULL,            -- rules | local | llm
  model       TEXT,
  latency_ms  INTEGER,
  accepted    INTEGER,                  -- did user confirm unedited?
  edited_json TEXT,
  created_at  INTEGER NOT NULL
);
```

**Invariant to enforce in code:** spend totals must only ever sum rows where
`txn_type = 'spend' AND status = 'confirmed' AND reversal_of_id IS NULL AND id NOT IN (SELECT reversal_of_id FROM transactions WHERE reversal_of_id IS NOT NULL)`.
Write this once as a Drizzle view. Never inline it.

---

## 5. Pipelines

### P1 — Capture
```
raw string
  │
  ├─ segment on [, / then / aur / और] → clauses
  │
  └─ per clause:
       ├─ regex amount + currency token (₹, rs, aed, dh, dirham, बजट)
       ├─ alias lookup (merchant_aliases.alias_norm) ────► HIT: done, 0 tokens
       ├─ local keyword classifier (category only) ─────► MEDIUM confidence
       └─ LLM structured call (batch all unresolved clauses in ONE request)
              schema: {amount, currency, merchant_raw, category, direction, date_hint}
  │
  └─ Confirmation sheet — always. Never silently write.
       Confirmations with confidence < 0.85 pre-focus the edit field.
       On confirm: write txn, upsert merchant_alias, log to capture_log.
```
Batching all clauses into one LLM call is the whole cost story — `"chai 20, auto 80, groceries 640"` is one request, not three.

### P2 — Merchant resolution
```
normalise(raw):  lowercase → strip [0-9*#] → strip bank suffixes
                 (@ybl @okaxis @hdfcbank @paytm) → collapse whitespace
  ↓
exact alias hit          → merchant, confidence 1.0
  ↓ miss
trigram similarity ≥0.8  → merchant, confidence 0.8, propose alias
  ↓ miss
LLM: "what business is this?" (batched, cached by norm) → create merchant + alias
  ↓
on user confirm: hit_count++, source='user' (user aliases outrank llm ones)
```

### P3 — Reversal pairing
Nightly + on-insert:
```sql
-- candidate pairs
SELECT a.id, b.id FROM transactions a JOIN transactions b
  ON a.account_id = b.account_id
 AND a.direction <> b.direction
 AND ABS(a.amount_minor - b.amount_minor) <= a.amount_minor / 100
 AND ABS(a.occurred_at - b.occurred_at) <= 14*86400000
 AND (a.merchant_id = b.merchant_id OR b.merchant_id IS NULL)
 AND a.reversal_of_id IS NULL AND b.reversal_of_id IS NULL;
```
Confidence ≥0.9 auto-pairs, below that goes into the Weekly Reckoning stack.

### P4 — FX & dual ledger
- Daily cron (Cloudflare Worker → KV, or client fetch on first launch of the day) caches INR/AED mid-market.
- Every insert freezes `fx_rate` at `occurred_at` date. Never recompute historical rows.
- Missing rate → nearest earlier rate, flag `confidence`.

### P5 — Remittance detection
```
for each outflow O (account.currency = X, amount > threshold):
    find inflow I where
       I.account.currency = Y ≠ X
       |I.occurred_at − O.occurred_at| ≤ 5 days
       implied = I.amount / O.amount
       |implied − mid_market(X→Y)| / mid_market ≤ 0.05
    → transfer_group_id = uuid on both; txn_type = 'transfer'
    → remittance_efficiency = implied / mid_market   (report as % cost)
```

### P6 — Safe-to-Spend
Recomputed on: app foreground, any transaction write, midnight, income date change. Pure function, fully unit-testable, no I/O. See §2.1 F2 for the formula.

### P7 — Recurrence detection
Weekly job. Per merchant with n≥3 transactions:
```
intervals = diff(sorted occurred_at)
if stdev(intervals)/mean(intervals) < 0.15
   and stdev(amounts)/mean(amounts) < 0.10:
       upsert recurrence(period_days = mean(intervals),
                         next_due = last + mean,
                         confidence = 1 − cv_interval)
if latest amount deviates >5% from prior median → price-hike nudge
```

### P8 — Worth-it scoring
Queue for rating = confirmed spends where `amount > p60(last 30d spends)` OR category in top-3 regret categories, unrated, ≤7 days old. Max 5 per session. Aggregate into `regret_rate` per category, surfaced in the Reckoning.

### P9 — Nudge ranking
Generate candidates from P3/P5/P7/P8 + budget breaches + runway drops. Score, sort, ship top-k where `k = 4 − sent_this_week`. Everything else expires silently. Log `acted` to feed `novelty` and `fatigue` next cycle.

### P10 — Cash reconciliation
Weekly prompt → user enters wallet total → `delta = counted − expected` → write one `Uncategorised cash` transaction with the delta → optionally ask "roughly what was this?" and let the LLM split it across likely categories with low confidence flags.

---

## 6. Design system

Run the design pass before writing screens. Here is the locked direction.

### Thesis
**Currency is a temperature.** Your money lives in two countries; the interface never makes you check which one you're looking at. INR is warm brass, AED is cool verdigris. Every number, arc, and chart segment carries its currency's temperature. That single idea — not a logo, not a gradient — is the identity.

### Tokens
```
--ink-900   #0F1419   base (cool near-black, OLED-friendly)
--ink-800   #171D24   surface
--ink-700   #222A33   raised / borders
--paper-50  #F2F4F6   light-mode base (cool paper, deliberately not cream)
--brass     #E0A458   INR
--verdigris #4FB0A5   AED
--sage      #7BC96F   under budget / positive
--clay      #D9544D   over budget / alert
--text-hi   #E8EDF2
--text-lo   #8B98A5
```
Light mode is designed, not inverted: paper base, ink text, both accents darkened 12% for contrast.

### Type
| Role | Face | Use |
|---|---|---|
| Display | **Bricolage Grotesque** (variable) | The Safe-to-Spend number, section heads. Width axis animates on the dial. |
| Numerals | **Geist Mono** (tabular) | Every amount, everywhere. Ledgers must align. |
| Body | **Geist Sans** | Everything else |

Tabular numerals are not a detail. A transaction list where the decimal points don't line up reads as amateur instantly.

### Signature: The Day Dial
Home screen is one Skia-rendered arc. It fills clockwise with today's spend against Safe-to-Spend. Colour interpolates by the currency mix of today's spending — a day in Dubai reads cool, a day in Jaipur reads warm, a travel day reads as a gradient between them. Overspend pushes past 360° into a second, thinner clay ring.

Tap the dial → it collapses upward and the capture bar expands. One gesture, one screen, no navigation.

### Layout law
Thumb zone first. Capture bar pinned to the bottom. Dial above it. Today's ledger below, receipt-styled, right-aligned tabular numerals with a hairline rule between days. Navigation is three tabs maximum: **Today / Ledger / You**.

### Motion rules
- `transform` and `opacity` only. Reanimated worklets, never `setState` in a gesture.
- One orchestrated moment: the dial fill on app open (600ms, `Easing.out(Easing.cubic)`).
- The Reckoning card stack is the only other place that gets showy.
- `useReducedMotion()` gates everything; static fallback must still be complete.

### Copy voice
Plain, second person, no cheerleading. *"You've got ₹740 for today."* not *"Great job staying on track! 🎉"* Errors say what happened and what to do. Empty states are invitations: *"Nothing logged yet. Tap the bar and type what you spent."*

---

## 7. Evaluation harness (this is what makes it a portfolio artifact)

Build `eval/` from day one. It's the difference between "I made an app" and "I made an app and measured it."

**Golden set — 250 labelled capture strings**, hand-written, covering:
- English, Hinglish, Devanagari-mixed, Arabic-transliterated merchants
- Multi-clause (2–5 transactions per string)
- Ambiguous amounts (`"2k"`, `"1.5 lakh"`, `"25 dh"`, `"aed 25"`)
- Currency-implicit strings that require account context
- Adversarial: `"paid rahul 500"` (transfer, not spend), `"refund 200 from swiggy"` (income)

**Metrics**
| Metric | Target |
|---|---|
| Transaction count exact-match | ≥ 0.95 |
| Amount exact-match | ≥ 0.98 |
| Currency accuracy | ≥ 0.99 |
| Category macro-F1 | ≥ 0.85 |
| Merchant resolution top-1 | ≥ 0.90 after 30 days of alias learning |
| `txn_type` accuracy (spend vs transfer) | ≥ 0.97 |
| Median capture latency | ≤ 400ms |
| LLM route rate | ≤ 15% of captures |
| Cost / 1000 captures | ≤ ₹40 |

**Unit tests that must exist** (pure functions, no mocking needed):
`safeToSpend()`, `pairReversals()`, `detectRecurrence()`, `detectRemittance()`, `normaliseMerchant()`, `rankNudges()`, `regretRate()`.

Run the golden set on every prompt change. Prompt regressions are invisible without this.

---

## 8. Build phases

Each phase ships something you can open. Nothing is scaffolded and left half-built.

| # | Phase | Verify |
|---|---|---|
| 0 | Expo 57 scaffold, tokens, fonts, 3-tab shell, dev build | App opens on device, tabs navigate, fonts render |
| 1 | op-sqlite + Drizzle schema + migrations + seed categories/merchants; **manual** transaction entry | Add/edit/delete a txn, survives app restart |
| 2 | Safe-to-Spend engine + Day Dial | Unit tests pass; dial matches hand-computed number |
| 3 | Text capture: rules → alias → LLM router; confirmation sheet; capture_log | Golden set v1 (50 strings) ≥0.90 amount accuracy |
| 4 | Merchant resolver + alias learning + reversal pairing | Alias hit rate climbs across a 100-txn replay |
| 5 | Multi-currency, FX freeze, remittance detection, Trip Mode | Remittance pair excluded from both spend and income |
| 6 | Worth-it loop + Weekly Reckoning + nudge budget | Regret rate computes; ≤4 notifications in a simulated week |
| 7 | Splits, Ledger Link, cash reconciliation | Link opens on another phone; cash delta writes one txn |
| 8 | Voice capture + receipt OCR | Voice→txn on-device, airplane mode works to the LLM boundary |
| 9 | Recurrence radar, Payday Runway, Ask-your-ledger | Recurrence detects seeded subscriptions; SQL sandbox rejects writes |
| 10 | Supabase sync, Ledger Link web (21st MCP), EAS build, App Store polish | Two devices converge; TestFlight build installs |

**Ship at Phase 7.** Phases 8–10 are for a version you're already using daily. An app you use is worth more than an app you finish.

---

## 9. Limitations — state these honestly

- **No Account Aggregator.** The RBI's AA framework requires registration as a Financial Information User, which is a licensed-entity thing. As a solo developer you cannot legally integrate it. Capture is manual, voice, OCR, and statement import. This is a constraint, not a flaw — the local-first apps handle refunds and P2P better than the SMS-scraping ones anyway.
- **iOS cannot read SMS.** Android SMS parsing is possible but Google Play restricts the permission and it's fragile across bank format changes and dual-SIM. Not worth the review risk in v1.
- **FX is mid-market, not your actual rate.** Remittance efficiency is an estimate unless you enter the real rate.
- **The worth-it model is n=1.** It reflects your mood on the day you rated. Treat trend, not absolutes.
- **No investment or trading features.** This is a spend tracker. Do not add recommendation features — that's regulated activity in both India (SEBI) and the UAE (SCA).

## 10. Future

Household mode (two people, one ledger, separate Safe-to-Spend). Merchant alias set published as an open dataset — the UPI-handle→merchant map genuinely doesn't exist publicly and would be a real contribution. On-device categorisation model distilled from your own confirmed labels, killing the LLM route entirely.
