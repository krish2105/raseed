# Backend — the parts that need your hands

**Nothing in the app currently needs a backend.** The web dashboard runs DuckDB-WASM in the
browser and persists your additions to localStorage; the phone runs SQLite on-device. Both
work with the network unreachable. A server only buys you *sync between two devices*.

So treat this as optional, and read the last section before deciding.

---

## Why I could not run it for you

You chose Render Postgres. A Render connection string is of the form

```
postgresql://USER:PASSWORD@HOST/DB
```

It contains a password, and I do not handle credentials. Everything below is a command for
you to run. The migration itself is already written and already tested — see the last
section.

---

## Option A — Render Postgres (what you picked)

1. **Create the database.** render.com → New → Postgres. The free instance is enough; note
   that Render expires free databases after 30 days, which is the main reason Supabase is
   the better fit for something you want to leave running.

2. **Copy the External Connection String** from the dashboard.

3. **Apply the schema.** From the repo root:

```bash
psql "PASTE_YOUR_CONNECTION_STRING" -f supabase/migrations/00000000000000_init.sql
```

That file creates all 17 tables, the indexes, `v_spend`, and enables RLS with an owner
policy on every table.

4. **One thing will fail, and it should.** The migration references `auth.users` and
`auth.uid()`, which are Supabase primitives. On plain Postgres you need a stand-in first:

```bash
psql "PASTE_YOUR_CONNECTION_STRING" -c "
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as \$\$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
create role if not exists authenticated;"
```

Run that, then re-run step 3.

5. **Verify RLS actually works** — do not skip this:

```bash
psql "PASTE_YOUR_CONNECTION_STRING" -c "\
set role authenticated; \
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false); \
select count(*) from public.transactions;"
```

It should return 0 rows, not an error and not every row.

---

## Option B — Supabase (what the architecture actually assumes)

Cheaper in effort, and the migration runs unmodified because `auth.uid()` and `auth.users`
already exist:

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Then paste the **Project URL** and **anon key** (both public values, safe to share) into
`apps/web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

The anon key is public by design — RLS is what protects the data, which is why step 5 above
matters more than key secrecy.

---

## What is already proven, and what is not

**Proven:** the schema, the migration, and the RLS policies are verified against real
Postgres by `packages/schema/src/rls.test.ts`, which runs the actual migration file through
PGlite (Postgres compiled to WASM) and asserts a cross-user read returns zero rows, and that
cross-user update, delete and insert are all refused. That test caught a real bug — `v_spend`
returned every user's rows until `security_invoker = true` was added, because a Postgres view
executes as its owner.

**Not proven:** that a real GoTrue populates `request.jwt.claim.sub` the way the test's shim
does. That is a one-line assumption, and step 5 above is how you close it.

---

## Do you actually want this?

Honest answer: **not yet.** Sync earns its complexity when you own a second device. Until
then a server adds a failure mode, a monthly expiry to remember, and nothing the user can
see. The architecture docs say "Supabase from day one" so that the sync *columns* exist
before real data does — and they do: every table already has `user_id`, `updated_at` and
`deleted`, so turning sync on later is not a migration of live data.

The one thing worth doing soon is **Option B step 1–4**, just so the project exists and the
schema is applied. Wiring the app to read from it is Session 22.
