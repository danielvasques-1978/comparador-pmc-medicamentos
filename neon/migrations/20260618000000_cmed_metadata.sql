alter table medicines drop constraint if exists medicines_kind_check;

alter table medicines
  add column if not exists product_type text,
  add column if not exists ggrem_code text,
  add column if not exists registration text,
  add column if not exists commercialized boolean;

create unique index if not exists medicines_ggrem_code_idx on medicines (ggrem_code) where ggrem_code is not null;
create index if not exists medicines_commercialized_idx on medicines (commercialized);
