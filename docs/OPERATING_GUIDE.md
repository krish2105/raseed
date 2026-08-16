# RASEED — Operating Guide

How to actually run this. Everything else is reference; this is the only doc you read daily.

---

## 1. Get the repo tidy first (20 minutes, once)

Thirteen documents exist. Some are spent — they described work that's now built. Sort them:

```
raseed/
├── CLAUDE.md                       ← root. Auto-loaded every session.
└── docs/
    ├── OPERATING_GUIDE.md          ← this file
    ├── PROGRESS.md                 ← Claude reads at session start
    ├── DECISIONS.md                ← Claude appends at session end
    ├── SPRINT_PLAN.md              ← the 26-week map
    │
    ├── MOBILE_ARCHITECTURE.md      ← live reference
    ├── WEB_ARCHITECTURE.md         ← live reference
    ├── WORKSPACE_ARCHITECTURE.md   ← live reference (W phases)
    ├── SECURITY_ARCHITECTURE.md    ← live reference (S phases)
    ├── V2_BUILD.md                 ← live reference (V phases)
    │
    └── archive/
        ├── MONOREPO_PLAN.md        ← spent, monorepo exists
        ├── MOBILE_PROMPT.md        ← spent
        ├── WEB_PROMPT.md           ← spent
        ├── SESSION_RUNBOOK.md      ← superseded by this file
        └── SCORE_90_ROADMAP.md     ← superseded by SPRINT_PLAN.md
```

Move the spent ones into `archive/` rather than deleting. Claude won't read them by default, and you keep the history.

---

## 2. The only three things you ever type

### Starting a session
```
Read CLAUDE.md, docs/PROGRESS.md and docs/DECISIONS.md.
We're doing [PHASE] only, per docs/[REFERENCE_DOC].md.
Plan it as numbered steps with a verify check on each, then wait for my go.
```

Three lines. That's it. The architecture is in the repo — pasting it into chat just burns context.

The one exception is a destructive phase like D0, where the fuller prompt in `SPRINT_PLAN.md` §6 is worth using because it names the rollback path explicitly.

### Mid-session
Only two interventions matter:
- **`/context`** before any big operation. If you're above 70% used, `/clear` and restart the phase rather than getting compacted mid-task.
- **"Stop. Write current state to docs/DECISIONS.md, then we'll continue."** — use this the moment Claude fumbles something it knew an hour ago. That's the context window, not the model.

### Ending a session
```
Before we stop:
1. Append to docs/DECISIONS.md — what we decided and why, 5 lines max.
2. Tick [PHASE] in docs/PROGRESS.md, note anything left open.
3. Restate: what you built, what you verified with what output, what you assumed.
```

Then commit: `session-[PHASE]: <goal>`. Then `/clear` before the next one — never `/compact`, because you're changing goals, not continuing one.

---

## 3. Phase order — corrected

My sprint plan had you recruiting users in week 1. That was wrong. Two security phases have to land first, because external users' raw transaction text would otherwise reach Gemini or Groq unredacted, and one of them will type a doctor's name into it.

| Order | Phase | Doc | Why here |
|---|---|---|---|
| **1** | **D0** region migration | SPRINT_PLAN §6 | Trivial now, miserable with paying users |
| **2** | **S4** redaction pipeline | SECURITY_ARCHITECTURE | Must precede any external user |
| **3** | **S5** Ledger Link hardening | SECURITY_ARCHITECTURE | Public URLs with financial data on them |
| — | *Ship to TestFlight. Recruit 10 users. Clocks start.* | | |
| **4** | **D1–D7** deployment | SPRINT_PLAN §4 | Runs during the observation window |
| **5** | **C1–C6** CTO | SPRINT_PLAN §5 | Same |
| **6** | **S0–S3, S6–S10** rest of security | SECURITY_ARCHITECTURE | Auth, headers, retention, purge |
| — | *Week 10 decision gate. Three scores locked.* | | |
| **7** | **V1–V4** eval, calibration, backtesting, embeddings | V2_BUILD | Portfolio depth, cheap |
| **8** | **V5–V7** on-device model | V2_BUILD | The centrepiece |
| **9** | **W1–W12** workspace/executive | WORKSPACE_ARCHITECTURE | Only if the business path is confirmed |

**Faster alternative for 1–3:** ship to external users with the LLM route behind a feature flag, off for non-owner accounts. Then S4 and S5 can run in parallel with D1–D7 instead of blocking. Rules and alias lookup still cover ~90% of captures, so the experience barely changes. If you want users this week, do this.

---

## 4. Today

Open the repo in Claude Code. Model `opusplan`. Plan mode. Type:

```
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md and
docs/SPRINT_PLAN.md.

We're doing D0 only — the Supabase region migration, per
SPRINT_PLAN section 6. It's destructive, so before any plan:

1. List every place in the repo where the Supabase URL or keys appear.
2. Recommend the region — Mumbai (ap-south-1) vs nearest Middle East —
   with reasoning.
3. Give me the plan as numbered steps, each with a verify check and an
   explicit rollback if that step fails.

Then wait for my go.
```

While it plans, fire the four things that are waiting on other people:
Apple Developer enrolment · incorporation quotes · Paddle or Lemon Squeezy application · PostHog project.

---

## 5. When it goes wrong

| Symptom | Do this |
|---|---|
| Claude forgot a decision from earlier | It's the context window. Write state to `DECISIONS.md`, `/clear`, restart the phase. |
| A phase is taking more than one session | The phase was too big. Split it, update `PROGRESS.md`, note the split in `DECISIONS.md`. |
| Claude proposes something contradicting `CLAUDE.md` | Say which invariant it breaks. If it pushes back with a good reason, that's a decision — record it. |
| You're not sure the work is right | Ask for the verify output before approving, not after. |
| Two docs disagree | The code wins. Update the doc in the same session and note it. |

---

## 6. The three rules

1. **One phase per session.** Never two, however small the second looks.
2. **`/clear` between phases.** Never `/compact` — you're switching goals.
3. **Never end a session without the closing prompt.** A decision that lives only in chat is a decision that gets lost and silently reinvented differently three sessions later.

That third one is the whole system. Skip it twice and the docs stop matching the code, and once that happens every session starts with archaeology.
