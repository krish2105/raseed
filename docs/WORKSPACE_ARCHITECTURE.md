# RASEED — Workspace layer (W phases)

> **PROPOSED — derived, not original intent.**
>
> `OPERATING_GUIDE.md` §1 and §3 reference this document and `RASEED_SECURITY_ARCHITECTURE.md`
> line 3 says to read it first, but it had never been written. This draft was reconstructed on
> 17 Aug 2026 from sentences that already existed in the other docs — every element traces to a
> source in §1. **The phase numbering below is my proposal, not a plan you wrote.** Only W11 is
> fixed by an existing document. Treat the content as recovered and the numbering as a
> suggestion.

---

## 1. Provenance — where each element came from

| Element | Source |
|---|---|
| `personal` \| `business` workspace kinds | `RASEED_V2_MASTER_BUILD.md:17` |
| RBAC | `RASEED_V2_MASTER_BUILD.md:17` |
| Hash-chained append-only audit log | `RASEED_SECURITY_ARCHITECTURE.md:15` |
| Approvals | `RASEED_V2_MASTER_BUILD.md:17` |
| Segregation of duties **enforced in SQL, not UI** | `RASEED_SECURITY_ARCHITECTURE.md:16` |
| Membership-based RLS replacing `auth.uid() = user_id` | `RASEED_SECURITY_ARCHITECTURE.md:11` |
| Every domain query filters `workspace_id` | `RASEED_V2_CLAUDE_CODE_PROMPT.md:31` |
| Personal workspace stays local-first and offline | `RASEED_V2_CLAUDE_CODE_PROMPT.md:32`, `:95` |
| TOTP MFA is phase **W11** | `RASEED_SECURITY_ARCHITECTURE.md:15` |
| App-lock immediately on switch for business workspaces | `RASEED_SECURITY_ARCHITECTURE.md:56` |
| Cross-workspace isolation test suite | `RASEED_SPRINT_PLAN.md:124` |
| Gated on the business path being confirmed | `OPERATING_GUIDE.md:84` |
| Cut: Gantt, resource capacity, changelog feeds, SSO/Okta | `RASEED_V2_CLAUDE_CODE_PROMPT.md:89` |

Nothing below is invented beyond arranging these into dependency order and supplying verify
criteria in the style the other phase tables use.

---

## 2. Read this before scheduling any of it

**`workspace_id` does not exist.** Every synced table in `packages/schema/src/contract.ts`
carries `user_id`, and `workspace_id` appears in no table, no query and neither app.
`RASEED_V2_CLAUDE_CODE_PROMPT.md:31` lists "every domain query filters by `workspace_id`" among
**inherited** invariants — i.e. as though it were already true. It is not, and that gap is the
whole cost of this track.

Adding it is a **breaking migration across all 17 synced tables and all 17 RLS policies**, plus
every query in both apps. It is not a feature that bolts on; it is a change to the identity
column the entire security model rests on.

**Therefore:** do not start this before there is a paying business user asking for it.
`OPERATING_GUIDE.md:84` already gates it — "only if the business path is confirmed" — and this
document does not argue with that. It exists so the track can be *evaluated*, not so it can be
started.

**Sequencing constraint.** W1 must land before S0's auth work hardens, or the membership model
gets built twice. If auth (S0) ships first with `auth.uid() = user_id`, W2 rewrites every policy.
That is acceptable and probably correct — shipping single-user auth first is cheaper than
speculatively building for a business tier that may never arrive — but it should be a decision,
not a surprise.

---

## 3. Model

**A workspace is the unit of ownership.** Every domain row belongs to exactly one. A user
belongs to one or more via a membership row carrying a role.

```
workspaces        id, kind ('personal' | 'business'), name, created_at
memberships       workspace_id, user_id, role, invited_by, accepted_at
<every domain>    workspace_id  ← replaces user_id as the ownership column
```

**Every user gets a personal workspace on sign-up.** It is not a special case in the schema —
it is an ordinary workspace with `kind = 'personal'` and exactly one member. This keeps one code
path rather than two, and it is what lets the local-first guarantee survive: the phone syncs the
personal workspace and never needs to know a business one exists.

**Roles** — the smallest set that expresses segregation of duties:

| Role | Can |
|---|---|
| `owner` | everything, including billing and deleting the workspace |
| `admin` | manage members, approve |
| `member` | create and edit their own entries, submit for approval |
| `viewer` | read only |

**Segregation of duties is enforced in SQL, not UI** (`RASEED_SECURITY_ARCHITECTURE.md:16`).
The rule that matters: **the person who submits an expense cannot be the person who approves
it.** That is a policy predicate comparing `submitted_by` to `auth.uid()`, not a disabled
button. A disabled button is a suggestion; a policy is a guarantee.

**The audit log is hash-chained and append-only.** Each row stores the hash of the previous row,
so a deletion or edit breaks the chain and is detectable. It retains only entity ids and
tombstones after a purge (`RASEED_SECURITY_ARCHITECTURE.md:87`), which is what lets the DPDP
erasure right coexist with an immutable log.

---

## 4. Phases — PROPOSED numbering

| # | Phase | Verify |
|---|---|---|
| W1 | `workspaces` + `memberships` tables; `workspace_id` added to all 17 synced tables; backfill every existing row into the owner's personal workspace | Parity test passes; every pre-existing row has a non-null `workspace_id`; no row is orphaned |
| W2 | RLS rewritten from `auth.uid() = user_id` to membership-based, on every table in the same migration | Cross-workspace read returns zero rows; the existing RLS suite passes unchanged in spirit; a member of workspace A cannot update a row in workspace B |
| W3 | Workspace switcher on web; personal workspace remains the default | Switching re-scopes every figure on screen; the URL carries the workspace so a pasted link reproduces it |
| W4 | Roles + role checks as policy predicates | A `viewer` cannot insert; a `member` cannot change another member's row — both proven by SQL, with the UI check absent to show the policy is what stops it |
| W5 | Invitations: invite by email, accept, revoke | A revoked invite cannot be accepted; an accepted invite grants exactly the named role |
| W6 | Approvals: submit → pending → approved/rejected, with the submitter barred from approving | The submitter's own approval is **rejected by the database**, not hidden by the UI |
| W7 | Hash-chained audit log, append-only | Tampering with any historical row breaks chain verification, demonstrated by a test that edits one and shows detection |
| W8 | Business-workspace expense fields — cost centre, project, billable | Personal workspace UI is unchanged; the fields do not appear there |
| W9 | Executive rollup — per-workspace analytics over the same DuckDB path | Figures reconcile to `v_spend` scoped by workspace, to the minor unit |
| W10 | Business app-lock: biometric immediately on app switch (`RASEED_SECURITY_ARCHITECTURE.md:56`) | Switching apps and returning re-prompts; the personal workspace keeps its longer timeout |
| **W11** | **TOTP MFA** — fixed by `RASEED_SECURITY_ARCHITECTURE.md:15` | Enrol, lose the authenticator, recover with a single-use code |
| W12 | Cross-workspace isolation suite (`RASEED_SPRINT_PLAN.md:124`) | A full adversarial suite: every table, every role, every operation, asserting zero leakage |

**W1 and W2 are one session or none.** Splitting them ships a state where `workspace_id` exists
but RLS still keys on `user_id` — every row readable by its original owner regardless of
workspace. That is strictly worse than not starting.

---

## 5. Explicitly not in this track

Restated from `RASEED_V2_CLAUDE_CODE_PROMPT.md:89` so they do not creep back in under the
"business tier" banner: Gantt charts with dependencies · resource capacity planning ·
engineering changelog feeds · SSO with Azure AD or Okta · antigravity or sensor telemetry ·
always-stable health pills.

SSO deserves its specific reason: it is weeks of work, offers no differentiation, and no
enterprise buys without SOC 2 — which is a company-level commitment, not an engineering task.

---

## 6. Honest limitations

- **This document is reconstructed.** If you had a real `WORKSPACE_ARCHITECTURE.md`, it is not
  in this repo and not in git history. Where this contradicts your memory of the original, your
  memory wins — and please overwrite this file.
- **The cost is front-loaded.** W1 and W2 are the entire risk of the track; W3–W12 are ordinary
  feature work on top. If the migration is not worth doing, nothing after it matters.
- **It has no confirmed demand.** No user has asked for a business workspace. The track is
  gated on that changing, per `OPERATING_GUIDE.md:84`, and this document does not lift the gate.
