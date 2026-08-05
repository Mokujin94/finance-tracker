-- ============================================================================
--  Финансовый трекер — схема БД для Supabase (PostgreSQL)
--  Выполнить один раз в Supabase → SQL Editor → New query → Run.
--  Все таблицы закрыты Row Level Security: пользователь видит только свои строки.
-- ============================================================================

-- ---------------------------------------------------------------- профиль ---
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  advance_amount     numeric(14, 2) not null default 0,
  salary_amount      numeric(14, 2) not null default 0,
  advance_day        smallint       not null default 25 check (advance_day between 1 and 31),
  salary_day         smallint       not null default 10 check (salary_day between 1 and 31),
  -- выплата в последний день месяца: число из *_day тогда не используется
  advance_is_last_day   boolean not null default false,
  salary_is_last_day    boolean not null default false,
  -- выплата попала на выходной → платят накануне (ТК РФ)
  shift_weekend_payouts boolean not null default true,
  employment_date    date,
  vacation_used_days numeric(6, 2)  not null default 0,
  balance_start      numeric(14, 2) not null default 0,
  -- момент, на который назван остаток: баланс меняют только операции после него
  balance_as_of      timestamptz    not null default now(),
  onboarded          boolean        not null default false,
  created_at         timestamptz    not null default now()
);

-- ----------------------------------------------------------------- счета ---
-- По счёту на каждый банк: у каждого свой остаток и свой момент, на который он назван,
-- потому что выписки из разных банков приходят вразнобой.
create table if not exists public.accounts (
  id            uuid primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  bank          text not null default 'other',
  kind          text not null default 'card'
                check (kind in ('card', 'savings', 'deposit', 'cash', 'credit')),
  balance_start numeric(14, 2) not null default 0,
  balance_as_of timestamptz not null default now(),
  is_primary    boolean not null default false,
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists accounts_user_idx on public.accounts (user_id);

-- -------------------------------------------------------------- категории ---
create table if not exists public.categories (
  id        uuid primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  name      text not null,
  kind      text not null check (kind in ('income', 'expense')),
  color     text not null default '#94a3b8',
  keywords  text[] not null default '{}',
  is_system boolean not null default false
);
create index if not exists categories_user_idx on public.categories (user_id);

-- ---------------------------------------------------------------- импорты ---
create table if not exists public.imports (
  id             uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  account_id     uuid references public.accounts (id) on delete set null,
  filename       text not null,
  imported_at    timestamptz not null default now(),
  rows_total     integer not null default 0,
  rows_new       integer not null default 0,
  rows_duplicate integer not null default 0
);
create index if not exists imports_user_idx on public.imports (user_id, imported_at desc);

-- -------------------------------------------------------------- транзакции ---
create table if not exists public.transactions (
  id               uuid primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  account_id       uuid references public.accounts (id) on delete set null,
  occurred_at      timestamptz not null,
  amount           numeric(14, 2) not null check (amount >= 0),
  type             text not null check (type in ('income', 'expense')),
  description      text not null default '',
  counterparty     text,
  mcc              text,
  raw_category     text,
  category_id      uuid references public.categories (id) on delete set null,
  category_manual  boolean not null default false,
  -- перевод между своими счетами: вне баланса, статистики и рейтинга
  is_transfer      boolean not null default false,
  import_id        uuid references public.imports (id) on delete set null,
  dedup_hash       text not null,
  created_at       timestamptz not null default now()
);
-- Дедупликация повторных загрузок одной выписки — в пределах счёта:
-- одинаковая покупка могла пройти и по карте Т-Банка, и по карте Сбера.
create unique index if not exists transactions_dedup_idx
  on public.transactions (user_id, account_id, dedup_hash);
create index if not exists transactions_user_date_idx on public.transactions (user_id, occurred_at desc);

-- ------------------------------------------------------------------- цели ---
create table if not exists public.goals (
  id            uuid primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  title         text not null,
  target_amount numeric(14, 2) not null check (target_amount > 0),
  saved_amount  numeric(14, 2) not null default 0,
  deadline      date not null,
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists goals_user_idx on public.goals (user_id);

create table if not exists public.goal_contributions (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  goal_id     uuid not null references public.goals (id) on delete cascade,
  amount      numeric(14, 2) not null,
  occurred_on date not null default current_date,
  note        text
);
create index if not exists goal_contributions_goal_idx on public.goal_contributions (goal_id);

-- ------------------------------------------------------------------ долги ---
create table if not exists public.debts (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  direction    text not null check (direction in ('i_owe', 'owed_to_me')),
  counterparty text not null,
  amount       numeric(14, 2) not null check (amount > 0),
  started_on   date not null default current_date,
  due_on       date,
  -- долг можно привязать к цели: видно, какая часть цели закрыта заёмными деньгами
  goal_id      uuid references public.goals (id) on delete set null,
  comment      text,
  created_at   timestamptz not null default now()
);
create index if not exists debts_user_idx on public.debts (user_id);

create table if not exists public.debt_payments (
  id      uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  debt_id uuid not null references public.debts (id) on delete cascade,
  amount  numeric(14, 2) not null check (amount > 0),
  paid_on date not null default current_date,
  note    text
);
create index if not exists debt_payments_debt_idx on public.debt_payments (debt_id);

-- ----------------------------------------------------------------- отпуск ---
create table if not exists public.vacation_plans (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  start_date date not null,
  end_date   date not null,
  note       text,
  check (end_date >= start_date)
);
create index if not exists vacation_plans_user_idx on public.vacation_plans (user_id);

-- ============================================================================
--  Row Level Security
-- ============================================================================
alter table public.accounts           enable row level security;
alter table public.profiles           enable row level security;
alter table public.categories         enable row level security;
alter table public.imports            enable row level security;
alter table public.transactions       enable row level security;
alter table public.goals              enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.debts              enable row level security;
alter table public.debt_payments      enable row level security;
alter table public.vacation_plans     enable row level security;

-- Профиль: строка пользователя — это строка с его id
drop policy if exists "profiles are private" on public.profiles;
create policy "profiles are private" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Остальные таблицы: доступ по user_id
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'imports', 'transactions', 'goals',
    'goal_contributions', 'debts', 'debt_payments', 'vacation_plans'
  ]
  loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end $$;

-- ============================================================================
--  Автосоздание профиля при регистрации нового пользователя
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Функция нужна только триггеру. Без этого она торчит наружу как RPC-эндпоинт
-- /rest/v1/rpc/handle_new_user, доступный анониму (ловится линтером Supabase).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
