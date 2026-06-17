create table if not exists auth_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  marketing_opt_in boolean not null default false,
  plan_status text not null default 'free',
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists auth_sessions (
  token_hash text primary key,
  user_id uuid not null references auth_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_sessions_user_idx on auth_sessions (user_id);
create index if not exists auth_sessions_expires_idx on auth_sessions (expires_at);

alter table app_profiles
  add column if not exists user_id uuid references auth_users(id) on delete cascade;

create index if not exists app_profiles_user_idx on app_profiles (user_id);
