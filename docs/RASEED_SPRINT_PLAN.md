# RASEED — Full-Time Sprint Plan

**Chosen:** paying customers eventually · full time · Deployment + CTO first.

**Revised timeline: 26 weeks to all five above 90.** Half the part-time estimate — and the reason it's not a quarter is in section 1.

---

## 1. The thing full-time changes

Going full time does **not** halve everything. Work here splits into two kinds:

**Effort-bound** — more hours genuinely means faster:
Deployment hardening · CTO hardening · billing build · docs site · onboarding funnel

**Calendar-bound** — hours are irrelevant:
Retention data (6 weeks is 6 weeks) · company licensing · App Store review · Apple Developer verification · merchant-of-record approval · word of mouth

**So the full-time strategy is: start every calendar clock on day one, and fill the waiting with effort-bound work.** That's the whole plan. Sequencing calendar-bound items one after another is what turns 26 weeks into 52.

---

## 2. Day one — start these clocks before writing any code

| # | Action | Why it can't wait |
|---|---|---|
| 1 | **Supabase region migration** | Region is fixed at project creation. Moving means a new project plus migrating database, auth users, storage and functions, then updating every URL and key. Trivial now, painful with 40 customers. |
| 2 | **Ship Phase 7 to TestFlight** | Starts your own usage clock. Nothing raises the MVP score until this exists. |
| 3 | **Recruit first 10 users** | Starts the D30 clock. This is the longest pole in the whole plan. |
| 4 | **Apple Developer enrolment** ($99) | Verification takes days, sometimes longer for individuals |
| 5 | **Begin incorporation** | Licensing runs weeks. Get quotes for a UAE free zone and an Indian LLP, pick one, file. |
| 6 | **Apply to Paddle or Lemon Squeezy** | Merchant-of-record approval takes days and can be declined; find out now |
| 7 | **Instrument analytics** | Retention you didn't measure from day one is retention you don't have |

Items 1, 4, 5 and 6 are all waiting-on-someone-else. Fire them the same morning.

---

## 3. The 26 weeks

| Weeks | Track | Locks |
|---|---|---|
| 1–2 | Sprint 0 — all seven clocks started | |
| 2–5 | **Deployment hardening (D0–D7)** | |
| 5–7 | **CTO hardening (C1–C6)** + bus-factor test | |
| 2–8 | *Observation window running in background* | |
| 6–9 | Pricing, billing, docs site, support inbox | |
| 9–10 | Subtraction pass + retention analysis | **MVP 92, Deploy 93, CTO 93** |
| 10–12 | Paid launch, first customers | |
| 12–26 | Distribution to 40–60 customers | |
| 20–26 | Unit economics, books, runway model | **SaaS 90, CFO 90** |

**Week 10 is your real decision point.** Three scores locked above 90, the product proven or disproven by actual usage, and the entity formed. That's where you decide whether weeks 12–26 are worth it — with data instead of a guess.

---

## 4. Deployment track — D0 to D7

| # | Phase | Done when |
|---|---|---|
| D0 | **Region migration** to Mumbai or Middle East | New project live, auth users intact, old project archived, every env var updated |
| D1 | Staging environment — separate Supabase project + Vercel project | Migrations rehearsed on staging before prod, always |
| D2 | **Backup and restore drill** | You have restored into a scratch project and timed it. RPO and RTO written down. |
| D3 | Migration rollback | Every migration has a tested down-path |
| D4 | Load test — k6 at 100 concurrent | p95 recorded, bottleneck named |
| D5 | Monitoring and alerting | Sentry live, uptime alerts reach your phone, error budget defined |
| D6 | Status page + incident runbook | "Supabase is down at 2am" has a written answer |
| D7 | App Store + Play submission | **Submitted**, not planned. Budget two rejection cycles. |

D2 is the one that actually moves the score. "We have backups" and "we have restored from backup" are different claims and only one counts.

## 5. CTO track — C1 to C6

| # | Phase | Done when |
|---|---|---|
| C1 | Onboarding: setup script + `ARCHITECTURE.md` | A stranger is productive in under an hour |
| C2 | ADRs, written retroactively | Local-first, DuckDB-WASM, monorepo, workspace layer, on-device model — context and rejected alternatives, not just outcomes |
| C3 | Coverage floor in CI | 80% on `packages/`, build fails below it |
| C4 | **Mutation testing on `@raseed/engines`** | Stryker score reported. Proves the tests would catch a real bug rather than just executing the code. |
| C5 | Perf regression in CI | Not a one-time budget |
| C6 | Deprecation pass | Something removed cleanly, and documented |

**The bus-factor test is not a Claude Code task.** Get one other person to clone the repo, follow C1's doc, and open a PR. Fix everything that breaks for them. That exercise is worth more points than C2 through C6 combined, and you can't automate it.

---

## 6. Paste into Claude Code

Fresh session, Plan mode, model `opusplan`. D0 is destructive — read its plan carefully before approving.

```
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md and
docs/SPRINT_PLAN.md. Then survey the repo — docs state intent,
code is the truth. Where they disagree, tell me first.

We are running the Deployment track, D0–D7, then the CTO track,
C1–C6. This session: D0 only.

CONTEXT: the product works and is deployed. This track is not about
features. It is about being able to survive a bad day — a failed
migration, a lost database, a 2am outage, an App Store rejection.
Every phase produces evidence, not code that "should" work.

D0 SCOPE — Supabase region migration.

A Supabase project's region is fixed at creation. Moving requires a
new project and a full migration. Do this now, before there are real
users, because it changes the project URL and all API keys.

1. Create a new Supabase project in the region closest to the users
   — evaluate Mumbai (ap-south-1) vs the nearest Middle East region
   and recommend one, with reasoning, before creating anything.
2. Migrate: schema, data, auth users (separate auth schema — do not
   forget these), storage buckets, edge functions, and every RLS
   policy.
3. Update env vars: local, Vercel (all environments), EAS, and any
   CI secret.
4. Verify parity, then archive the old project. Do not delete it
   until I confirm.

VERIFY — show output for each:
- Row counts match exactly, table by table, old vs new
- Auth users can sign in against the new project
- All RLS policies present; re-run the cross-workspace isolation
  test suite against the new project and show it passing
- Storage objects accessible
- Deployed web app and mobile dev build both work against the new
  project
- Latency measured from the new region vs the old, reported as a
  number

Before you start, tell me:
1. Every place in the repo where the Supabase URL or keys appear.
2. Anything about this migration you think is risky or that I have
   underestimated.
3. Your D0 plan as numbered steps, each with its verify check, and
   an explicit rollback path if step N fails.

Then wait for my go.
```

---

## 7. Running in parallel — the non-code track

These are yours, not Claude's. Weeks 1–10, alongside everything above:

- **Incorporation** — quotes for a UAE free zone and an Indian LLP, choose, file. Do not onboard an external user before this closes.
- **Insurance** — get professional indemnity and cyber quotes once the entity exists.
- **Recruit to 25 users** — the India↔UAE corridor is the channel. Expat groups, alumni networks, personal-finance threads. Hand-recruited, not launched.
- **Pricing** — write the page in week 6 even though you launch paid in week 10. Writing it forces the decision about who this is for.
- **Weekly retention read** — one number, every Monday, written down. D1, D7, D30 as they mature.

---

## 8. What would make me revise this

- **D30 below 15% at week 10.** Then the MVP score is honest at 82 and no amount of billing work fixes it. Rebuild the loop or stop.
- **Merchant-of-record rejection.** Changes the billing plan materially; find out in week 1, not week 10.
- **Employment terms.** If you land a Dubai role, running a revenue-generating business on a UAE employment visa has real constraints — freelance permits, employer NOC, free-zone rules. Check before week 10, because it may make weeks 12–26 unavailable regardless of how well the product does.

None of those are reasons not to start. They're the three things that would tell you to change course, listed now so you notice them when they happen rather than after.
