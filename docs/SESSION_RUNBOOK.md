# RASEED — Session Runbook

How to actually run 24 Claude Code sessions without the project drifting.

---

## Setup, once

```bash
mkdir raseed && cd raseed
git init

mkdir -p docs
# Drop these in:
#   CLAUDE.md                     → repo root
#   RASEED_ARCHITECTURE.md        → docs/MOBILE_ARCHITECTURE.md
#   RASEED_WEB_ARCHITECTURE.md    → docs/WEB_ARCHITECTURE.md
#   RASEED_MONOREPO_PLAN.md       → docs/MONOREPO_PLAN.md
#   PROGRESS.md                   → docs/PROGRESS.md

echo "node-linker=hoisted" > .npmrc

npx skills add 21st-dev/skill        # fresh key from 21st.dev/mcp
npm install -g eas-cli && eas login
npx supabase login
```

---

## The per-session loop

**Start**
```
/clear
```
Always `/clear` between sessions, never `/compact`. You're changing goals, not continuing one. `/compact` carries forward noise you no longer need and costs you window on every subsequent message.

Then paste:
```
Read CLAUDE.md, docs/PROGRESS.md and docs/DECISIONS.md.
We're doing Session N only. Plan it as numbered steps with a verify
check on each, then wait for my go.
```

**During**
- Run `/context` before any large operation — a broad search, a big file read, a long build. Seeing 75% used before a 30k-token operation tells you to clear first instead of being surprised by an automatic compaction mid-task.
- Push research to subagents. Each gets its own context window, so a 40-file exploration never lands in your main session.
- If Claude starts fumbling something it knew an hour ago, that's the window, not the model. Stop, write state to `docs/DECISIONS.md`, `/clear`, resume.

**End** — this is the part that actually prevents drift:
```
Before we stop:
1. Append to docs/DECISIONS.md: what we decided and why, in 5 lines max.
2. Tick Session N in docs/PROGRESS.md and note anything left open.
3. Restate: what you built, what you verified with what output,
   and what you assumed.
```

Then commit. One commit per session, message `session-N: <goal>`.

---

## Why `/clear` and files instead of one long session

Compaction is compression, and compression loses detail. The specific failure mode here isn't Claude running out of room — it's that after the fourth compaction it no longer holds the `v_spend` predicate, reimplements it plausibly but slightly differently inside the treemap query, and your Sankey and treemap now disagree by ₹4,000 with no error anywhere.

`CLAUDE.md` at the repo root reloads every session, which is exactly why the invariants live there and not in conversation. Anything you cannot afford to have summarised away belongs in a file before it gets summarised away.

---

## Session 0 — paste this

```
Read CLAUDE.md, docs/MONOREPO_PLAN.md, docs/MOBILE_ARCHITECTURE.md and
docs/WEB_ARCHITECTURE.md in full before doing anything.

SESSION 0 — Monorepo scaffold. This session only.

Goal: both apps boot empty and successfully import a shared package.
No features. No UI beyond what proves the wiring works.

Scope:
1. pnpm workspaces + Turborepo. .npmrc already has node-linker=hoisted —
   do not change it; pnpm's default symlinks break Metro resolution.
2. packages/: money, tokens, schema, engines, ai, fixtures.
   Each is TypeScript source only — "main": "./src/index.ts",
   no build step, no dist/. Each exports one placeholder function
   so the import path is provably real.
3. apps/mobile: Expo SDK 57, expo-router, dev build config,
   bundle ID com.krishnamathur.raseed. Metro configured with
   watchFolders per expo/metro-config's monorepo setup.
4. apps/web: Next.js 16, App Router, TypeScript strict,
   transpilePackages for every @raseed/* package.
5. turbo.json with typecheck, lint, test pipelines.
6. GitHub Actions running turbo typecheck on push.
7. docs/DECISIONS.md created and seeded with this session's decisions.

Verify — show me the output for each:
- pnpm install completes clean
- npx turbo typecheck passes across the whole workspace
- apps/web dev server renders a page that imports and calls
  a function from @raseed/money
- apps/mobile boots on a device and renders a screen that imports
  and calls the same function from @raseed/money
- deliberately break a type in packages/money and show turbo typecheck
  failing in BOTH apps, then fix it

That last check is the real one. If breaking a shared package doesn't
fail both apps, the wiring is wrong and everything after this
session is built on sand.

Before you start, tell me:
1. Anything in the plan you think is wrong or over-engineered.
2. Any package whose current version or API you couldn't verify.
3. Your numbered plan with a verify check on each step.

Then wait for my go.
```

---

## Watch items by session

| Session | The thing that usually goes wrong |
|---|---|
| 0 | Metro can't resolve workspace packages. If `node-linker=hoisted` doesn't fix it, switch to npm workspaces and move on — don't burn a session on it. |
| 2 | The sqlite/pg parity test is written to pass rather than to catch drift. Verify it fails when you deliberately desync one column. |
| 2 | RLS written but never tested. Insert a row as user A, query as user B, assert zero rows. |
| 8 | Web starts querying Postgres directly for analytics. The DuckDB argument collapses the moment it does. |
| 11 | Capture prompt changes without rerunning the golden set. Prompt regressions are invisible without it. |
| 12 | Sankey totals don't reconcile to `v_spend`. Almost always a transfer counted as spend. |
| 19 | Scope creep at the ship gate. Ship it, use it two weeks, then decide the store question. |

---

## Where money enters

| | Now | If you say yes at Session 19 |
|---|---|---|
| Vercel | Free (Hobby) | Free |
| Supabase | Free | Free |
| EAS Build | Free — 15 iOS + 15 Android/mo | Free |
| Apple | — | $99/yr, needed for TestFlight or the App Store |
| Google Play | — | $25 once |

Until Session 19 the whole thing costs ₹0.
