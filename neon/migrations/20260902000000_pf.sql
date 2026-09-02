alter table medicines
  add column if not exists pf jsonb;

create index if not exists medicines_pf_idx on medicines ((pf is not null));
