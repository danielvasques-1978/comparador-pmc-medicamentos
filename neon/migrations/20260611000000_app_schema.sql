create extension if not exists pg_trgm;

create table if not exists price_imports (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_file text,
  table_date text not null,
  row_count integer not null default 0,
  imported_at timestamptz not null default now()
);

create table if not exists medicines (
  id text primary key,
  import_id uuid references price_imports(id) on delete set null,
  name text not null,
  active_ingredient text not null,
  laboratory text not null,
  kind text not null check (kind in ('Genérico', 'Similar', 'Referência')),
  presentation text not null,
  pmc jsonb not null,
  source_page integer not null,
  source text not null,
  table_date text not null,
  search_text text generated always as (
    lower(
      coalesce(name, '') || ' ' ||
      coalesce(active_ingredient, '') || ' ' ||
      coalesce(laboratory, '') || ' ' ||
      coalesce(presentation, '')
    )
  ) stored
);

create index if not exists medicines_search_text_trgm_idx
  on medicines using gin (search_text gin_trgm_ops);

create index if not exists medicines_laboratory_idx on medicines (laboratory);
create index if not exists medicines_kind_idx on medicines (kind);
create index if not exists medicines_table_date_idx on medicines (table_date);

create table if not exists app_profiles (
  id uuid primary key default gen_random_uuid(),
  client_key text not null unique,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_favorites (
  profile_id uuid not null references app_profiles(id) on delete cascade,
  medicine_id text not null references medicines(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, medicine_id)
);

create table if not exists search_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references app_profiles(id) on delete cascade,
  query text not null,
  uf text not null,
  icms_rate text not null,
  result_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists search_history_profile_created_idx
  on search_history (profile_id, created_at desc);

create table if not exists user_settings (
  profile_id uuid primary key references app_profiles(id) on delete cascade,
  uf_icms_map jsonb not null,
  updated_at timestamptz not null default now()
);
