alter table auth_users
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists subscription_current_period_end timestamptz;

create index if not exists auth_users_stripe_customer_idx on auth_users (stripe_customer_id);
create index if not exists auth_users_stripe_subscription_idx on auth_users (stripe_subscription_id);
