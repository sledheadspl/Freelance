-- FlipScanner initial schema
-- Users handled by Supabase Auth (auth.users)

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  ebay_connected boolean not null default false,
  ebay_refresh_token text,          -- encrypted at rest by app layer
  subscription_tier text not null default 'free',  -- free | pro
  scans_this_month int not null default 0,
  created_at timestamptz not null default now()
);

create table scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  image_url text,                   -- Supabase Storage
  identified_name text,
  identified_category text,
  identified_attributes jsonb,      -- brand, model, part number, condition cues
  est_sale_price numeric,
  est_sale_low numeric,
  est_sale_high numeric,
  comps_count int,
  sell_through_days numeric,        -- median days to sell from comps
  confidence_grade text,            -- A/B/C/D
  recommendation text,              -- buy | skip | maybe
  max_buy_price numeric,            -- highest price that still hits target ROI
  created_at timestamptz not null default now()
);

create table inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  scan_id uuid references scans(id) on delete set null,
  purchase_price numeric not null,
  status text not null default 'unlisted',   -- unlisted | listed | sold | shipped
  ebay_listing_id text,
  ebay_offer_id text,
  listed_price numeric,
  sold_price numeric,
  sold_at timestamptz,
  shipped_at timestamptz,
  created_at timestamptz not null default now()
);

create table comps_cache (
  id uuid primary key default gen_random_uuid(),
  query_key text unique not null,   -- normalized search string
  comps jsonb,                      -- array of {title, sold_price, sold_date, condition}
  fetched_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  inventory_id uuid references inventory(id) on delete set null,
  ebay_order_id text,
  buyer_username text,
  ship_by date,
  tracking_number text,
  status text not null default 'awaiting_shipment',
  created_at timestamptz not null default now()
);

-- Indexes for common lookups
create index scans_user_id_idx on scans(user_id);
create index inventory_user_id_idx on inventory(user_id);
create index inventory_scan_id_idx on inventory(scan_id);
create index orders_user_id_idx on orders(user_id);
create index orders_inventory_id_idx on orders(inventory_id);

-- Row Level Security: every table scoped to user_id (or profile id)
alter table profiles enable row level security;
alter table scans enable row level security;
alter table inventory enable row level security;
alter table comps_cache enable row level security;
alter table orders enable row level security;

-- profiles: a user can only see/update their own profile
create policy "Profiles are viewable by owner"
  on profiles for select
  using (auth.uid() = id);

create policy "Profiles are insertable by owner"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Profiles are updatable by owner"
  on profiles for update
  using (auth.uid() = id);

-- scans: owner-only CRUD
create policy "Scans are viewable by owner"
  on scans for select
  using (auth.uid() = user_id);

create policy "Scans are insertable by owner"
  on scans for insert
  with check (auth.uid() = user_id);

create policy "Scans are updatable by owner"
  on scans for update
  using (auth.uid() = user_id);

create policy "Scans are deletable by owner"
  on scans for delete
  using (auth.uid() = user_id);

-- inventory: owner-only CRUD
create policy "Inventory is viewable by owner"
  on inventory for select
  using (auth.uid() = user_id);

create policy "Inventory is insertable by owner"
  on inventory for insert
  with check (auth.uid() = user_id);

create policy "Inventory is updatable by owner"
  on inventory for update
  using (auth.uid() = user_id);

create policy "Inventory is deletable by owner"
  on inventory for delete
  using (auth.uid() = user_id);

-- orders: owner-only CRUD
create policy "Orders are viewable by owner"
  on orders for select
  using (auth.uid() = user_id);

create policy "Orders are insertable by owner"
  on orders for insert
  with check (auth.uid() = user_id);

create policy "Orders are updatable by owner"
  on orders for update
  using (auth.uid() = user_id);

create policy "Orders are deletable by owner"
  on orders for delete
  using (auth.uid() = user_id);

-- comps_cache: shared read-only cache, no user_id column.
-- Readable by any authenticated user; writes restricted to the service role
-- (edge functions), which bypasses RLS.
create policy "Comps cache is viewable by authenticated users"
  on comps_cache for select
  using (auth.role() = 'authenticated');

-- Auto-create a profile row whenever a new auth user signs up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
