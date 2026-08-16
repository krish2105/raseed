# Dependency audit exceptions

Every entry here is a specific advisory that the CI audit is told to ignore, with the reason
and the condition under which it should be removed.

**The threshold stays at `high`.** Lowering it to `critical` to get green would hide the next
genuine high-severity finding, which is the one that matters. Acknowledging four known
advisories by id is a decision with a paper trail; moving the bar is a decision that hides
every future one.

Reviewed: 2026-08-16.

| GHSA | Package | Severity | Reached via | Why it is accepted |
|---|---|---|---|---|
| `GHSA-w3rx-r6r6-pgpr` | image-size | high | `expo → @expo/metro → metro` | Denial of service in an ICNS parser. Metro is the **bundler** — it runs on a developer's machine over the project's own images and is not shipped in the app. **No patched version exists** (`Patched versions: <0.0.0`); there is nothing to upgrade to. |
| `GHSA-5p2g-fcmc-qvqq` | image-size | high | `expo → @expo/metro → metro` | Same package, same parser family (JXL/HEIF), same reasoning. |
| `GHSA-67mh-4wv8-2f99` | esbuild | moderate | `drizzle-kit → @esbuild-kit/esm-loader` | Dev server can be made to return arbitrary responses. `drizzle-kit` is a migration CLI run by hand; no esbuild dev server is ever started here. |
| `GHSA-w5hq-g745-h8pq` | uuid | moderate | `expo → @expo/config-plugins → xcode` | Only reachable through `uuid`'s CLI, which nothing in this repo invokes. Build-time only. |

## The rule

An exception is acceptable only when **all** of these hold:

1. The package is **build-time or dev-time**, never shipped to a user.
2. There is **no patched version** reachable, or the fix requires a major upgrade of a
   framework we do not control (Expo, Metro).
3. The attack requires access we have already lost by other means — a developer's own
   machine, our own source files.

If any of those stops being true, the entry comes out and the dependency gets fixed.

## When to revisit

- Every Expo SDK upgrade: Metro moves with it, and `image-size` may finally be patched.
- Any time an entry here appears in a **runtime** path rather than a build path.
- If an advisory is upgraded to critical.

Re-check with:

```bash
pnpm audit --audit-level moderate
```
