-- Stripe customer/subscription linkage for the Pro paywall (Build Order step 12)
alter table profiles
  add column stripe_customer_id text,
  add column stripe_subscription_id text;
