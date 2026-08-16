# RASEED — Security, Auth & Privacy Architecture

Gap audit of everything specified so far, the fixes, and the build prompt. Read after `docs/WORKSPACE_ARCHITECTURE.md`.

---

## 1. What was already specified

Scattered across the earlier docs, never assembled:

- Supabase Auth, email magic link · RLS on every table, membership-based after the workspace migration
- Anon key public by design; RLS is the protection
- `expo-secure-store` for API keys · `expo-local-authentication` for biometric unlock
- SQLCipher-encrypted local database
- Supabase TOTP MFA (phase W11) · hash-chained append-only audit log
- Segregation of duties enforced in SQL, not UI
- NL→SQL sandbox: single statement, SELECT only, AST-parsed, timeout, row cap
- Hard monthly LLM cost cap · `.gitleaks.toml` already in the repo

That's a decent foundation. It is not a security architecture.

---

## 2. The gaps

### 🔴 Serious — fix before anything else

**G1 · Raw transaction text is sent to a third-party LLM with no redaction.**
`"chai 20"` is harmless. `"paid Dr Sharma 4500"` is health-adjacent. `"rent to Rahul 22000"` names a third party who never consented. Nothing in the design stops any of it reaching Gemini or Groq.

Fix, in order of strength:
1. Redaction pass before send — strip names matched against the local people table, mask anything matching a phone/account/ID pattern
2. First-run **redaction preview**: show the user the exact string that will leave the device
3. Explicit opt-in for the LLM route, not opt-out
4. **The real fix is V5** — the on-device classifier removes the network hop entirely

**G2 · `service_role` key handling is unstated.**
It bypasses RLS completely. It must never appear in client code, never in a `NEXT_PUBLIC_` variable, never in the mobile bundle. Server-side Vercel env only, and a CI grep that fails the build if the string appears outside `app/api/`.

**G3 · Ledger Link is a public URL containing financial data.**
I specced "share a link with someone who doesn't have the app" and never secured it. It needs: signed token, short TTL (7 days default), revocable from the app, single-purpose scope (one split, never a whole ledger), no PII beyond a display name and an amount, rate-limited, and `noindex`.

**G4 · No MFA recovery path.**
Lose your phone with TOTP as the only second factor and you're locked out permanently. Recovery codes generated at enrolment, shown once, hashed at rest.

### 🟠 Real gaps

**G5 · Magic link is the wrong choice for a mobile-first app.** It forces deep-link handling, breaks when opened in a different browser, and is fiddly on iOS. Use **email OTP** instead — <cite index="141-1">email OTPs share an implementation with magic links; to send a six-digit code you alter the magic link template to include `{{ .Token }}` instead of `{{ .ConfirmationURL }}`</cite>, and <cite index="135-1">you must not pass `emailRedirectTo` when you want numeric delivery</cite>. <cite index="141-1">Default rate limiting is one OTP per 60 seconds with a one-hour expiry, both configurable</cite> — shorten the expiry to 10 minutes.

**G6 · No passkeys.** <cite index="136-1">Supabase exposes `registerPasskey()` and `signInWithPasskey()`, handling the full WebAuthn ceremony, requiring an active session to register and `auth.experimental.passkey: true`.</cite> It's experimental, so: web only, opt-in, OTP always retained as fallback. Don't make an experimental API the sole path to an account.

**G7 · No session policy.** Define: access token lifetime, refresh rotation, idle timeout, and a "sign out everywhere" control that revokes all refresh tokens.

**G8 · Local encryption key lifecycle unstated.** The SQLCipher key is generated on-device, stored in Keychain/Keystore via `expo-secure-store`, never synced, never backed up. Device loss means local data is unrecoverable — which is correct, because Supabase holds the server copy.

**G9 · No app-lock timeout.** Biometric re-prompt after 5 minutes backgrounded, configurable, plus immediately on app switch for business workspaces.

**G10 · No screen capture protection.** `FLAG_SECURE` on Android, blur the iOS app-switcher snapshot. Standard for finance apps and cheap.

**G11 · No CSP, and there's a real tension.** DuckDB-WASM needs WebAssembly compilation, so the policy must grant `wasm-unsafe-eval` — scoped narrowly, never blanket `unsafe-eval`. Plus HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a `Permissions-Policy` denying camera, mic and geolocation on the web surface.

**G12 · `capture_log` stores raw user input indefinitely.** It's your eval harness input and also your biggest PII store. Needs a redaction pass and a retention window (90 days raw, then keep only the parsed structure).

**G13 · Demo mode isolation is unproven.** Synthetic data must never reach Supabase. Enforce with a runtime guard and a test.

**G14 · No dependency scanning.** Dependabot, `pnpm audit` in CI, lockfile integrity check. Gitleaks is already there.

---

## 3. The compliance thing you can't skip

You have Indian users (you) and a UAE target market. <cite index="147-1">If your app has any Indian users you are a data fiduciary under the DPDP Act.</cite> <cite index="152-1">The rules were notified on 13 November 2025 and the first Data Protection Board enforcement actions were initiated in Q1 2026 against app developers processing data without valid consent or with inadequate retention policies.</cite>

Two details that matter specifically to you:

<cite index="152-1">There is no "legitimate interests" basis in the DPDP Act. If you process personal data of Indian users you need consent, full stop — and consent must not be conditioned on accessing the service, so "accept analytics or don't use the app" is explicitly risky.</cite>

<cite index="152-1">Penalties are fixed maximum amounts that apply equally to a one-person indie studio and a Fortune 500 company.</cite> There is no small-developer exemption. <cite index="146-1">Full compliance is expected by 13 May 2027.</cite>

**What that means in engineering terms:**
- Privacy notice stating purpose, data categories, and retention period
- Consent withdrawal as easy as giving it
- Data principal rights: access, correction, erasure
- Breach notification workflow
- Automated deletion after retention expiry

**And a conflict you have to resolve:** `CLAUDE.md` mandates soft delete for sync correctness. Erasure rights require actual deletion. Fix with a **purge job** — soft delete first for sync convergence, hard delete after a 30-day grace window, audit log retaining only the entity ID and a tombstone.

---

## 4. Should you add more features?

**Mostly no.** You have roughly forty items across the W and V phases. Adding more before hardening is how projects die at 80%.

Five exceptions, all trust features rather than chrome:

| # | Feature | Why it earns its place |
|---|---|---|
| S1 | **Consent ledger** | A table of what the user consented to, when, and under which policy version. It's the DPDP requirement expressed as a schema — and it demonstrates regulatory literacy that almost no portfolio project shows. |
| S2 | **Privacy dashboard** | One screen: what leaves your device, when, to whom, and a kill switch per destination. Honest, rare, and it makes the on-device model story legible. |
| S3 | **Redaction preview** | Show the exact string before it goes to the LLM, first time and on demand. Turns an invisible risk into a visible choice. |
| S4 | **Account deletion with real purge** | Not a support email. A button, a confirmation, a purge job, and a receipt. |
| S5 | **Full data export** | Already on the list as P5. It's now a legal right, not a nice-to-have. Promote it. |

Everything else: stop and harden.

---

## 5. Build phases

| # | Phase | Verify |
|---|---|---|
| S0 | Auth rework: email OTP, session policy, sign-out-everywhere, auth rate limits | OTP arrives as six digits, not a link; expiry is 10 min; revoke-all invalidates a second device mid-session |
| S1 | MFA: TOTP + recovery codes | Enrol, lose the authenticator, recover with a code, and confirm the code is single-use |
| S2 | Passkeys, web only, opt-in, OTP retained | Register and sign in with a passkey; deleting all passkeys still leaves a working account |
| S3 | Device security: SQLCipher key lifecycle, app-lock timeout, `FLAG_SECURE`, iOS switcher blur, clipboard hygiene | Screenshot on Android is blocked; app switcher shows no figures; lock re-prompts after timeout |
| S4 | **G1 redaction pipeline + S3 preview + opt-in** | A capture containing a known person's name and a phone number leaves the device with both masked — assert on the actual outbound payload |
| S5 | Ledger Link hardening: signed, TTL, revocable, scoped, rate-limited, noindex | An expired link returns 410; a revoked link dies immediately; the page carries no data beyond the split |
| S6 | Web headers: CSP with scoped `wasm-unsafe-eval`, HSTS, frame/referrer/permissions policies | CSP passes with DuckDB working; blanket `unsafe-eval` is absent |
| S7 | Secret discipline: `service_role` CI grep, env scoping, Dependabot, `pnpm audit` | Plant the service key in a client file and show CI failing |
| S8 | Retention & purge: `capture_log` redaction + 90-day window, soft→hard delete after 30 days | Deleted account leaves no personal rows; audit retains tombstones only |
| S9 | S1 consent ledger, S2 privacy dashboard, S4 deletion, S5 export | Withdraw consent and confirm the LLM route disables immediately |
| S10 | Demo isolation test + full security regression suite | Demo mode writes zero rows to Supabase, proven by test |

---

## 6. Paste into Claude Code

Fresh session, Plan mode, model `opusplan`.

```
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md and
docs/SECURITY_ARCHITECTURE.md in full. Then survey the actual repo —
the docs state intent, the code is the truth. Where they disagree,
tell me before writing anything.

We are building the security layer, phases S0–S10. This session:
S0 only.

THE PREMISE: security was specified in fragments across five documents
and never assembled. Section 2 of the security doc lists the gaps.
G1 through G4 are serious. Do not start feature work until they close.

NON-NEGOTIABLE INVARIANTS FOR THIS TRACK:
- No raw user text reaches a third-party LLM without passing the
  redaction pipeline. Assert on the outbound payload, not the input.
- service_role key never appears in client code, a NEXT_PUBLIC_ var,
  or the mobile bundle. CI must fail if it does.
- Every auth change keeps a working recovery path. Never ship a state
  where losing one device means losing the account.
- Passkeys are experimental — opt-in, web only, OTP always retained.
- Local-first still holds: the personal workspace works offline, and
  security additions must not break that.

S0 SCOPE — auth rework:
1. Switch magic link to email OTP. Alter the Supabase magic link
   template to emit {{ .Token }} rather than {{ .ConfirmationURL }},
   and do NOT pass emailRedirectTo. Set expiry to 10 minutes.
2. Session policy: access token lifetime, refresh rotation, idle
   timeout, and a "sign out everywhere" control revoking all refresh
   tokens.
3. Auth rate limiting beyond the 60-second default.
4. Mobile and web both use the new flow; remove deep-link handling
   that OTP makes unnecessary.

VERIFY — show me output for each:
- The email delivers a six-digit code, not a link
- An OTP older than 10 minutes is rejected
- Sign-out-everywhere invalidates a session on a second device
  mid-request
- Existing signed-in users are not logged out by the migration
- npx tsc --noEmit clean; existing test suite green

Before you start, tell me:
1. What auth code already exists and what S0 will touch.
2. Anything in the security doc you think is wrong, over-engineered,
   or dangerous given what's built.
3. Your S0 plan as numbered steps with a verify check on each.

Then wait for my go.
```
