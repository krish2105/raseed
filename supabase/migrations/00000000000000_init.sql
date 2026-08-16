-- RASEED — initial schema.
--
-- RLS is enabled on every table in the SAME migration that creates it. RLS added later is
-- RLS you get wrong, and the anon key is public by design: RLS is the only thing protecting
-- this data.
--
-- Generated from packages/schema/src/contract.ts. Do not hand-edit; change the contract.

create table if not exists public.accounts (
  id text not null primary key,
  name text not null,
  kind text not null check (kind in ('bank', 'card', 'cash', 'wallet')),
  currency text not null check (currency in ('INR', 'AED')),
  opening_minor bigint not null,
  is_cash boolean not null,
  archived_at bigint,
  user_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.categories (
  id text not null primary key,
  name text not null,
  parent_id text,
  icon text,
  color text,
  kind text not null check (kind in ('need', 'want', 'save', 'income')),
  user_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.merchants (
  id text not null primary key,
  canonical_name text not null,
  category_id text,
  country text,
  logo_url text,
  user_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.merchant_aliases (
  id text not null primary key,
  merchant_id text not null,
  alias_raw text not null,
  alias_norm text not null,
  source text not null check (source in ('seed', 'user', 'llm')),
  hit_count bigint not null,
  user_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.transactions (
  id text not null primary key,
  occurred_at bigint not null,
  direction text not null check (direction in ('out', 'in')),
  amount_minor bigint not null,
  currency text not null check (currency in ('INR', 'AED')),
  home_amount_minor bigint not null,
  fx_rate double precision not null,
  account_id text not null,
  merchant_id text,
  category_id text,
  raw_text text,
  source text not null check (source in ('manual', 'voice', 'ocr', 'import')),
  txn_type text not null check (txn_type in ('spend', 'income', 'transfer', 'settlement')),
  transfer_group_id text,
  reversal_of_id text,
  trip_id text,
  status text not null check (status in ('pending', 'confirmed', 'voided')),
  confidence double precision,
  note text,
  user_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.worth_scores (
  transaction_id text not null primary key,
  score bigint not null,
  rated_at bigint not null,
  user_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.recurrences (
  id text not null primary key,
  merchant_id text,
  amount_minor bigint not null,
  currency text not null check (currency in ('INR', 'AED')),
  period_days double precision not null,
  next_due bigint,
  confidence double precision not null,
  last_amount_change bigint,
  status text not null check (status in ('active', 'cancelled', 'dismissed')),
  user_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.trips (
  id text not null primary key,
  name text not null,
  country text not null,
  currency text not null check (currency in ('INR', 'AED')),
  started_at bigint not null,
  ended_at bigint,
  budget_minor bigint,
  user_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.cash_counts (
  id text not null primary key,
  account_id text not null,
  counted_at bigint not null,
  counted_minor bigint not null,
  expected_minor bigint not null,
  adjustment_txn_id text,
  user_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.people (
  id text not null primary key,
  name text not null,
  handle text,
  currency text not null check (currency in ('INR', 'AED')),
  user_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.splits (
  id text not null primary key,
  transaction_id text not null,
  method text not null check (method in ('equal', 'share', 'percent', 'itemised')),
  share_link_id text,
  user_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.split_participants (
  id text not null primary key,
  split_id text not null,
  person_id text not null,
  owed_minor bigint not null,
  currency text not null check (currency in ('INR', 'AED')),
  settled_txn_id text,
  user_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.budgets (
  id text not null primary key,
  category_id text,
  period text not null check (period in ('month', 'week')),
  amount_minor bigint not null,
  currency text not null check (currency in ('INR', 'AED')),
  user_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.nudges (
  id text not null primary key,
  kind text not null,
  payload jsonb not null,
  score double precision not null,
  created_at bigint not null,
  sent_at bigint,
  acted boolean not null,
  user_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.fx_rates (
  id text not null primary key,
  as_of bigint not null,
  base text not null check (base in ('INR', 'AED')),
  quote text not null check (quote in ('INR', 'AED')),
  rate double precision not null,
  user_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.capture_log (
  id text not null primary key,
  raw_input text not null,
  parsed_json jsonb not null,
  route text not null check (route in ('rules', 'local', 'llm')),
  model text,
  latency_ms bigint,
  accepted boolean,
  edited_json jsonb,
  created_at bigint not null,
  user_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Foreign keys, added after all tables exist so ordering and self-references work.
alter table public.categories add constraint categories_parent_id_fkey foreign key (parent_id) references public.categories(id);
alter table public.merchants add constraint merchants_category_id_fkey foreign key (category_id) references public.categories(id);
alter table public.merchant_aliases add constraint merchant_aliases_merchant_id_fkey foreign key (merchant_id) references public.merchants(id);
alter table public.transactions add constraint transactions_account_id_fkey foreign key (account_id) references public.accounts(id);
alter table public.transactions add constraint transactions_merchant_id_fkey foreign key (merchant_id) references public.merchants(id);
alter table public.transactions add constraint transactions_category_id_fkey foreign key (category_id) references public.categories(id);
alter table public.transactions add constraint transactions_reversal_of_id_fkey foreign key (reversal_of_id) references public.transactions(id);
alter table public.transactions add constraint transactions_trip_id_fkey foreign key (trip_id) references public.trips(id);
alter table public.recurrences add constraint recurrences_merchant_id_fkey foreign key (merchant_id) references public.merchants(id);
alter table public.cash_counts add constraint cash_counts_account_id_fkey foreign key (account_id) references public.accounts(id);
alter table public.cash_counts add constraint cash_counts_adjustment_txn_id_fkey foreign key (adjustment_txn_id) references public.transactions(id);
alter table public.splits add constraint splits_transaction_id_fkey foreign key (transaction_id) references public.transactions(id);
alter table public.split_participants add constraint split_participants_split_id_fkey foreign key (split_id) references public.splits(id);
alter table public.split_participants add constraint split_participants_person_id_fkey foreign key (person_id) references public.people(id);
alter table public.split_participants add constraint split_participants_settled_txn_id_fkey foreign key (settled_txn_id) references public.transactions(id);
alter table public.budgets add constraint budgets_category_id_fkey foreign key (category_id) references public.categories(id);
alter table public.accounts add constraint accounts_user_fkey foreign key (user_id) references auth.users(id) on delete cascade;

-- Indexes that every screen depends on.
create index if not exists idx_txn_time on public.transactions(occurred_at desc);
create index if not exists idx_txn_type on public.transactions(txn_type, status);
create index if not exists idx_txn_merch on public.transactions(merchant_id, occurred_at);
create unique index if not exists idx_alias_norm on public.merchant_aliases(alias_norm, user_id);
create index if not exists idx_fx_lookup on public.fx_rates(base, quote, as_of desc);

-- Row Level Security. Every table, every operation, same predicate.

alter table public.accounts enable row level security;
create policy "own rows" on public.accounts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.categories enable row level security;
create policy "own rows" on public.categories
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.merchants enable row level security;
create policy "own rows" on public.merchants
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.merchant_aliases enable row level security;
create policy "own rows" on public.merchant_aliases
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.transactions enable row level security;
create policy "own rows" on public.transactions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.worth_scores enable row level security;
create policy "own rows" on public.worth_scores
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.recurrences enable row level security;
create policy "own rows" on public.recurrences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.trips enable row level security;
create policy "own rows" on public.trips
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.cash_counts enable row level security;
create policy "own rows" on public.cash_counts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.people enable row level security;
create policy "own rows" on public.people
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.splits enable row level security;
create policy "own rows" on public.splits
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.split_participants enable row level security;
create policy "own rows" on public.split_participants
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.budgets enable row level security;
create policy "own rows" on public.budgets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.nudges enable row level security;
create policy "own rows" on public.nudges
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.fx_rates enable row level security;
create policy "own rows" on public.fx_rates
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.capture_log enable row level security;
create policy "own rows" on public.capture_log
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The spend predicate, defined exactly once (packages/schema/src/contract.ts).
-- Never inline this filter in a component, a query or a screen.
--
-- security_invoker is load-bearing: without it the view executes as its OWNER and silently
-- bypasses RLS on public.transactions, returning every user's rows. Verified by
-- packages/schema/src/rls.test.ts, which caught exactly this.
create or replace view public.v_spend with (security_invoker = true) as
select * from public.transactions
where txn_type = 'spend'
  AND status = 'confirmed'
  AND reversal_of_id IS NULL
  AND deleted = false
  AND id NOT IN (SELECT reversal_of_id FROM public.transactions WHERE reversal_of_id IS NOT NULL);
