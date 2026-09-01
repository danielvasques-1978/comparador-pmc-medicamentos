alter table medicines
  add column if not exists ean1 text,
  add column if not exists ean2 text,
  add column if not exists ean3 text,
  add column if not exists therapeutic_class text,
  add column if not exists tarja text,
  add column if not exists hospital_restricted boolean,
  add column if not exists delisted_at date,
  add column if not exists last_seen_table_date text;

create index if not exists medicines_ean1_idx on medicines (ean1);
create index if not exists medicines_delisted_at_idx on medicines (delisted_at);

alter table price_imports
  add column if not exists status text not null default 'applied',
  add column if not exists report jsonb,
  add column if not exists source_url text;
