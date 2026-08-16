import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { syncedTables } from './contract'

/**
 * RLS, verified against real Postgres.
 *
 * PGlite is Postgres compiled to WASM running in-process — no Docker, no daemon, no cloud
 * credentials. Row Level Security is core Postgres, not a Supabase add-on, so the policies
 * exercised here are the same ones that will run in production.
 *
 * What this does NOT prove: that Supabase's GoTrue populates auth.uid() the way the shim
 * below does. That is a one-line assumption, stated rather than hidden.
 */

const MIGRATION = fileURLToPath(new URL('../../../supabase/migrations/00000000000000_init.sql', import.meta.url))

const USER_A = '11111111-1111-1111-1111-111111111111'
const USER_B = '22222222-2222-2222-2222-222222222222'

let db: PGlite

/** Become a given user for subsequent statements, the way PostgREST does per request. */
async function actAs(userId: string) {
  await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${userId}', true);`)
}

async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec('begin')
  await actAs(userId)
  try {
    return await fn()
  } finally {
    await db.exec('commit')
  }
}

beforeAll(async () => {
  db = new PGlite()

  // Minimal stand-ins for the Supabase primitives the migration references.
  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    do $$ begin
      if not exists (select from pg_roles where rolname = 'authenticated') then
        create role authenticated;
      end if;
    end $$;
    insert into auth.users (id) values ('${USER_A}'), ('${USER_B}') on conflict do nothing;
  `)

  await db.exec(readFileSync(MIGRATION, 'utf8'))

  // The migration owner bypasses RLS, so the app role must be granted explicitly —
  // exactly as Supabase grants the authenticated role.
  await db.exec(`
    grant usage on schema public to authenticated;
    grant all on all tables in schema public to authenticated;
  `)

  // Seed one account + one transaction for each user, as that user.
  for (const [user, tag] of [
    [USER_A, 'a'],
    [USER_B, 'b'],
  ] as const) {
    await asUser(user, async () => {
      await db.exec(`
        insert into public.accounts
          (id, name, kind, currency, opening_minor, is_cash, user_id, deleted)
        values ('acct-${tag}', 'HDFC ${tag}', 'bank', 'INR', 0, false, '${user}', false);
        insert into public.transactions
          (id, occurred_at, direction, amount_minor, currency, home_amount_minor, fx_rate,
           account_id, source, txn_type, status, user_id, deleted)
        values ('txn-${tag}', 1755300000000, 'out', 74000, 'INR', 74000, 1.0,
           'acct-${tag}', 'manual', 'spend', 'confirmed', '${user}', false);
      `)
    })
  }
  // Booting WASM Postgres and running the entire migration takes well over vitest's
  // 10s default hook timeout on a shared CI runner. Generous on purpose: a flaky test
  // trains you to ignore red.
}, 120_000)

describe('RLS isolates users', () => {
  it('user A sees only their own transaction', async () => {
    const rows = await asUser(USER_A, async () =>
      (await db.query<{ id: string }>('select id from public.transactions')).rows,
    )
    expect(rows.map((r) => r.id)).toEqual(['txn-a'])
  })

  // The check the runbook says everyone writes and nobody runs.
  it("user B's read of user A's row returns zero rows", async () => {
    const rows = await asUser(USER_B, async () =>
      (await db.query("select id from public.transactions where id = 'txn-a'")).rows,
    )
    expect(rows).toHaveLength(0)
  })

  it('user B cannot update user A\'s row', async () => {
    const result = await asUser(USER_B, async () =>
      db.query("update public.transactions set amount_minor = 1 where id = 'txn-a'"),
    )
    expect(result.affectedRows ?? 0).toBe(0)

    const still = await asUser(USER_A, async () =>
      (
        await db.query<{ amount_minor: number }>(
          "select amount_minor from public.transactions where id = 'txn-a'",
        )
      ).rows,
    )
    expect(Number(still[0]?.amount_minor)).toBe(74000)
  })

  it('user B cannot soft-delete user A\'s row', async () => {
    const result = await asUser(USER_B, async () =>
      db.query("update public.transactions set deleted = true where id = 'txn-a'"),
    )
    expect(result.affectedRows ?? 0).toBe(0)
  })

  it('user B cannot insert a row owned by user A', async () => {
    await expect(
      asUser(USER_B, async () =>
        db.exec(`
          insert into public.transactions
            (id, occurred_at, direction, amount_minor, currency, home_amount_minor, fx_rate,
             account_id, source, txn_type, status, user_id, deleted)
          values ('txn-forged', 1755300000000, 'out', 1, 'INR', 1, 1.0,
             'acct-b', 'manual', 'spend', 'confirmed', '${USER_A}', false);
        `),
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('an unauthenticated session sees nothing', async () => {
    const rows = await asUser('00000000-0000-0000-0000-000000000000', async () =>
      (await db.query('select id from public.transactions')).rows,
    )
    expect(rows).toHaveLength(0)
  })
})

describe('RLS coverage', () => {
  it('every synced table has RLS enabled', async () => {
    const { rows } = await db.query<{ tablename: string; rowsecurity: boolean }>(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public'",
    )
    const enabled = new Map(rows.map((r) => [r.tablename, r.rowsecurity]))
    for (const table of syncedTables()) {
      expect(enabled.get(table), `${table} does not exist in the migration`).toBeDefined()
      expect(enabled.get(table), `${table} has RLS disabled`).toBe(true)
    }
  })

  it('every synced table has an owner policy', async () => {
    const { rows } = await db.query<{ tablename: string }>(
      "select tablename from pg_policies where schemaname = 'public'",
    )
    const withPolicy = new Set(rows.map((r) => r.tablename))
    for (const table of syncedTables()) {
      expect(withPolicy.has(table), `${table} has no RLS policy`).toBe(true)
    }
  })
})

describe('v_spend', () => {
  beforeAll(async () => {
    // A reversed pair and a transfer, both of which must be excluded from spend.
    await asUser(USER_A, async () => {
      await db.exec(`
        insert into public.transactions
          (id, occurred_at, direction, amount_minor, currency, home_amount_minor, fx_rate,
           account_id, source, txn_type, status, user_id, deleted, reversal_of_id)
        values
          ('txn-failed', 1755300000000, 'out', 50000, 'INR', 50000, 1.0, 'acct-a', 'manual', 'spend', 'confirmed', '${USER_A}', false, null),
          ('txn-refund', 1755400000000, 'in',  50000, 'INR', 50000, 1.0, 'acct-a', 'manual', 'spend', 'confirmed', '${USER_A}', false, 'txn-failed'),
          ('txn-remit',  1755400000000, 'out', 90000, 'INR', 90000, 1.0, 'acct-a', 'manual', 'transfer', 'confirmed', '${USER_A}', false, null),
          ('txn-pending',1755400000000, 'out', 10000, 'INR', 10000, 1.0, 'acct-a', 'manual', 'spend', 'pending',   '${USER_A}', false, null),
          ('txn-gone',   1755400000000, 'out', 20000, 'INR', 20000, 1.0, 'acct-a', 'manual', 'spend', 'confirmed', '${USER_A}', true,  null);
      `)
    })
  })

  it('counts only real, confirmed, un-reversed spend', async () => {
    const rows = await asUser(USER_A, async () =>
      (await db.query<{ id: string }>('select id from public.v_spend order by id')).rows,
    )
    // txn-a survives. The reversal pair, the transfer, the pending and the soft-deleted
    // rows are all excluded.
    expect(rows.map((r) => r.id)).toEqual(['txn-a'])
  })

  // Without `security_invoker = true` the view runs as its owner and returns BOTH users'
  // rows. This assertion is the reason that option is on the view.
  it('the view is RLS-scoped, not just the table', async () => {
    const rows = await asUser(USER_B, async () =>
      (await db.query<{ id: string }>('select id from public.v_spend')).rows,
    )
    expect(rows.map((r) => r.id)).toEqual(['txn-b'])
    expect(rows.map((r) => r.id)).not.toContain('txn-a')
  })
}, 60_000)
