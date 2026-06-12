-- "Discover" mode: general-purpose "identify anything" with GPS-tagged
-- timeline, building toward a future shared-dataset/marketplace feature.

create table discoveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  image_url text,                   -- Supabase Storage path (scan-images bucket)
  latitude double precision,
  longitude double precision,
  captured_at timestamptz not null default now(),
  identified_name text,
  identified_category text,
  description text,                 -- educational/historical context from Claude
  confidence_grade text,            -- A/B/C/D
  identified_attributes jsonb,      -- notable_features, next_steps, etc.
  est_sale_price numeric,           -- eBay sold-comps median for similar items, if any
  est_sale_low numeric,
  est_sale_high numeric,
  comps_count int,
  shared boolean not null default false, -- opt-in to future shared dataset
  created_at timestamptz not null default now()
);

alter table discoveries enable row level security;

create policy "Discoveries are viewable by owner"
  on discoveries for select
  using (auth.uid() = user_id);

create policy "Discoveries are insertable by owner"
  on discoveries for insert
  with check (auth.uid() = user_id);

create policy "Discoveries are updatable by owner"
  on discoveries for update
  using (auth.uid() = user_id);

create policy "Discoveries are deletable by owner"
  on discoveries for delete
  using (auth.uid() = user_id);
