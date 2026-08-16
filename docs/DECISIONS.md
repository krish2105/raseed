# RASEED — Decisions

Append-only. One entry per session, five lines max per decision. A decision that only exists in
conversation is a decision that will be lost and silently reinvented differently.

---

## Session 0 — Monorepo scaffold (2026-08-16)

**Next.js 16.3.1, not 15.**
`MONOREPO_PLAN` and `WEB_ARCHITECTURE` both said Next 15. Verified against npm: 16.3.1 is current
stable (3 Aug 2026); the 15.x line is maintenance backports only. Greenfield App Router means the
migration cost is ~zero, so starting a major in debt bought nothing. Both docs amended to say 16.

**TypeScript 6.0.3, not 7.0.2.**
TS 7 (Go-native, ~10× faster `tsc`) is stable but has no stable programmatic API until 7.1.
`typescript-eslint@8.67` peers `typescript <6.1.0`, and `eslint-config-next@16.3.1` depends on it —
so TS 7 and a working `turbo lint` are mutually exclusive today. Independently confirmed: the Expo
SDK 57 template ships `typescript: ~6.0.3` too. Revisit when typescript-eslint supports 7.x.

**ESLint 9.39.5, not 10.8.1.**
Discovered by failure, not by planning: ESLint 10 changed the rule context API and
`eslint-plugin-react@7.37.5` (peers `eslint ... || ^9.7`) throws
`contextOrFilename.getFilename is not a function`. Both `eslint-config-next` and `eslint-config-expo`
depend on it, so ESLint 10 broke lint in *both* apps. No 7.x release supports ESLint 10 yet.

**No `metro.config.js` at all.**
The session brief said to configure `watchFolders` per expo/metro-config's monorepo setup. That
guidance is stale: since SDK 52 Expo auto-detects monorepos, and the docs explicitly say to *delete*
`watchFolders`, `resolver.nodeModulesPaths`, `extraNodeModules` and `disableHierarchicalLookup`.
The absence of the file is the correct configuration. Metro resolving `@raseed/*` proves it.

**React pinned to 19.2.3 via `pnpm.overrides`.**
Expo SDK 57 pins react exactly `19.2.3`; `create-next-app` installed `19.2.8`. Under
`node-linker=hoisted` two Reacts in one tree is a Metro failure waiting to happen. The override
forces one copy workspace-wide. Verified: exactly one `node_modules/react`, at 19.2.3.

**`nodeLinker: hoisted` written in two places.**
`CLAUDE.md` mandates `.npmrc`, and it is there. But pnpm 11+ reads only auth/registry settings from
`.npmrc`, so the same setting is also in `pnpm-workspace.yaml`, which is where pnpm 11 will look.
pnpm is pinned to 10.30.3 via `packageManager`. Keep the two in sync.

**Node 24.19.0.**
Local was 20.20.0, which reached EOL on 30 Apr 2026. Next 16 requires ≥20.9 so this was hygiene,
not a blocker. Pinned via `.nvmrc` + root `engines.node`, and CI reads `node-version-file: .nvmrc`
so local and CI cannot drift.

**Docs moved into `docs/`.**
`CLAUDE.md` referenced `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/MOBILE_ARCHITECTURE.md` and
`docs/WEB_ARCHITECTURE.md`; none of those paths existed. Renamed per `SESSION_RUNBOOK.md` §Setup.
Every path `CLAUDE.md` names now resolves.

**21st.dev card shipped in `apps/web` — scope override, with contained debt.**
Session 0 says "no UI beyond what proves the wiring works"; the 21st.dev component was requested
anyway. Adapted rather than pasted: the generated source imported `framer-motion`, which `CLAUDE.md`
forbids, so it imports `motion/react`; the count-up is gated behind `useReducedMotion()`; the accent
resolves from a CSS variable instead of a hardcoded palette. **Debt:** all hex sits in one `:root`
block in `apps/web/app/globals.css` and in `apps/mobile/src/app/index.tsx`'s StyleSheet, because
`@raseed/tokens` is a placeholder until S1. S1/S6 delete both.

**CI runs `turbo typecheck lint test --continue`.**
`--continue` is load-bearing, not cosmetic. With `dependsOn: ["^typecheck"]`, a break inside a shared
package fails that task and Turborepo *skips* the dependent apps — which reads like a pass. Without
`--continue` the CI signal would hide exactly the failure this session exists to prove.

**Deferred:** Android (no JDK on the machine; `sdkmanager` present but only cmdline-tools) and EAS
(`eas login` needs credentials). Neither is wired; both are their own step.
