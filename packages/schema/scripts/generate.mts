/**
 * Regenerate everything derived from contract.ts:
 *   src/sqlite.ts · src/pg.ts · src/zod.ts · supabase/migrations/00000000000000_init.sql
 *
 *   pnpm --filter @raseed/schema run generate
 *
 * This is an authoring tool, not a build step: its output is committed TypeScript and SQL.
 * After running it, `pnpm --filter @raseed/schema test` must still pass — parity.test.ts
 * checks the emitted Drizzle objects against the contract, and rls.test.ts runs the
 * emitted migration against real Postgres.
 */
import { writeFileSync } from 'node:fs'
import { TABLES, spendPredicate, type ColumnSpec } from '../src/contract.ts'

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
const pascal = (s: string) => {
  const c = camel(s)
  return c[0]!.toUpperCase() + c.slice(1)
}

// ── Drizzle ─────────────────────────────────────────────────────────────────

const SQLITE: Record<string, (c: string) => string> = {
  text: (c) => `text('${c}')`,
  integer: (c) => `integer('${c}')`,
  real: (c) => `real('${c}')`,
  boolean: (c) => `integer('${c}', { mode: 'boolean' })`,
  timestamp: (c) => `integer('${c}', { mode: 'timestamp_ms' })`,
  uuid: (c) => `text('${c}')`,
  json: (c) => `text('${c}', { mode: 'json' })`,
}

const PG: Record<string, (c: string) => string> = {
  text: (c) => `text('${c}')`,
  integer: (c) => `bigint('${c}', { mode: 'number' })`,
  real: (c) => `doublePrecision('${c}')`,
  boolean: (c) => `boolean('${c}')`,
  timestamp: (c) => `timestamp('${c}', { withTimezone: true })`,
  uuid: (c) => `uuid('${c}')`,
  json: (c) => `jsonb('${c}')`,
}

function emitDrizzle(
  map: Record<string, (c: string) => string>,
  tableFn: string,
  module: string,
  banner: string,
): string {
  // Collect the helpers actually used, so the import list can never contain an unused
  // name (which lint rejects) or miss one (which typecheck rejects).
  const used = new Set<string>([tableFn])
  let body = ''

  for (const [table, spec] of Object.entries(TABLES)) {
    body += `export const ${camel(table)} = ${tableFn}('${table}', {\n`
    for (const [col, c] of Object.entries(spec.columns)) {
      const expr = map[c.type]!(col)
      used.add(expr.slice(0, expr.indexOf('(')))
      let line = `  ${camel(col)}: ${expr}`
      if (c.nullable === false) line += '.notNull()'
      if (c.primaryKey) line += '.primaryKey()'
      body += `${line},\n`
    }
    body += '})\n\n'
  }

  const imports = [...used].sort().join(', ')
  return `${banner}import { ${imports} } from '${module}'\n\n${body}`
}

const DERIVED = `/**
 * DERIVED FROM contract.ts — regenerate with \`pnpm --filter @raseed/schema run generate\`.
 * Do not hand-edit; change the contract instead. parity.test.ts enforces this.
 */`

writeFileSync(
  new URL('../src/sqlite.ts', import.meta.url),
  emitDrizzle(SQLITE, 'sqliteTable', 'drizzle-orm/sqlite-core', `${DERIVED}
`),
)

writeFileSync(
  new URL('../src/pg.ts', import.meta.url),
  emitDrizzle(
    PG,
    'pgTable',
    'drizzle-orm/pg-core',
    `${DERIVED}
//
// 'integer' maps to bigint: occurred_at holds epoch milliseconds, which overflows a
// 32-bit pg integer 24 days after 1970.
`,
  ),
)

// ── zod ─────────────────────────────────────────────────────────────────────

const ZOD_BASE: Record<string, string> = {
  text: 'z.string()',
  integer: 'z.number().int()',
  real: 'z.number()',
  boolean: 'z.boolean()',
  timestamp: 'z.number().int()',
  uuid: 'z.string().uuid()',
  json: 'z.unknown()',
}

let zod = `${DERIVED}
//
// These validate at boundaries: parsed capture output, CSV import rows, anything arriving
// from Supabase. Enum columns become z.enum, so an unknown txn_type is rejected at the edge
// rather than corrupting a total three screens later.
import { z } from 'zod'

`
for (const [table, spec] of Object.entries(TABLES)) {
  zod += `export const ${camel(table)}Schema = z.object({\n`
  for (const [col, c] of Object.entries(spec.columns as Record<string, ColumnSpec>)) {
    let expr = c.enumValues
      ? `z.enum([${c.enumValues.map((v) => `'${v}'`).join(', ')}])`
      : ZOD_BASE[c.type]!
    if (c.nullable !== false) expr += '.nullable()'
    zod += `  ${col}: ${expr},\n`
  }
  zod += `})\nexport type ${pascal(table)} = z.infer<typeof ${camel(table)}Schema>\n\n`
}
zod += 'export const schemas = {\n'
for (const table of Object.keys(TABLES)) zod += `  ${table}: ${camel(table)}Schema,\n`
zod += '} as const\n'
writeFileSync(new URL('../src/zod.ts', import.meta.url), zod)

// ── Supabase migration ──────────────────────────────────────────────────────

const SQL_TYPE: Record<string, string> = {
  text: 'text',
  integer: 'bigint',
  real: 'double precision',
  boolean: 'boolean',
  timestamp: 'timestamptz',
  uuid: 'uuid',
  json: 'jsonb',
}
const SQL_DEFAULT: Record<string, string> = {
  updated_at: ' default now()',
  deleted: ' default false',
}

let sql = `-- RASEED — initial schema.
--
-- RLS is enabled on every table in the SAME migration that creates it. RLS added later is
-- RLS you get wrong, and the anon key is public by design: RLS is the only thing protecting
-- this data.
--
-- Generated from packages/schema/src/contract.ts. Do not hand-edit; change the contract.

`

const order = Object.keys(TABLES)
for (const table of order) {
  sql += `create table if not exists public.${table} (\n`
  const lines: string[] = []
  for (const [col, c] of Object.entries(TABLES[table]!.columns)) {
    let line = `  ${col} ${SQL_TYPE[c.type]}`
    if (c.nullable === false) line += ' not null'
    if (SQL_DEFAULT[col]) line += SQL_DEFAULT[col]
    if (c.primaryKey) line += ' primary key'
    if (c.enumValues) line += ` check (${col} in (${c.enumValues.map((v) => `'${v}'`).join(', ')}))`
    lines.push(line)
  }
  sql += `${lines.join(',\n')}\n);\n\n`
}

sql += '-- Foreign keys, added after all tables exist so ordering and self-references work.\n'
for (const table of order) {
  for (const [col, c] of Object.entries(TABLES[table]!.columns)) {
    if (!c.references) continue
    const [refTable, refCol] = c.references.split('.')
    sql += `alter table public.${table} add constraint ${table}_${col}_fkey foreign key (${col}) references public.${refTable}(${refCol});\n`
  }
}
sql += `alter table public.accounts add constraint accounts_user_fkey foreign key (user_id) references auth.users(id) on delete cascade;\n`

sql += `
-- Indexes that every screen depends on.
create index if not exists idx_txn_time on public.transactions(occurred_at desc);
create index if not exists idx_txn_type on public.transactions(txn_type, status);
create index if not exists idx_txn_merch on public.transactions(merchant_id, occurred_at);
create unique index if not exists idx_alias_norm on public.merchant_aliases(alias_norm, user_id);
create index if not exists idx_fx_lookup on public.fx_rates(base, quote, as_of desc);

-- Row Level Security. Every table, every operation, same predicate.
`
for (const table of order) {
  sql += `
alter table public.${table} enable row level security;
create policy "own rows" on public.${table}
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
`
}

sql += `
-- The spend predicate, defined exactly once (packages/schema/src/contract.ts).
-- Never inline this filter in a component, a query or a screen.
--
-- security_invoker is load-bearing: without it the view executes as its OWNER and silently
-- bypasses RLS on public.transactions, returning every user's rows. Verified by
-- packages/schema/src/rls.test.ts, which caught exactly this.
create or replace view public.v_spend with (security_invoker = true) as
select * from public.transactions
where ${spendPredicate('public.transactions')};
`

writeFileSync(new URL('../../../supabase/migrations/00000000000000_init.sql', import.meta.url), sql)

console.log('regenerated sqlite.ts, pg.ts, zod.ts and the Supabase migration')
