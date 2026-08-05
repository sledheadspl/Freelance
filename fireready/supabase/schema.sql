-- ============================================================
-- FireReady — Phase 1 schema
-- Run this whole file in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run: it drops and recreates FireReady objects (wipes FireReady data).
-- ============================================================

-- ---------- Reset (drop in dependency order) ----------
drop table if exists public.checkin_history cascade;
drop table if exists public.checkin_status cascade;
drop table if exists public.checklist_items cascade;
drop table if exists public.family_members cascade;
drop table if exists public.families cascade;
drop table if exists public.profiles cascade;
drop function if exists public.is_family_member(uuid);
drop function if exists public.create_family(text);
drop function if exists public.join_family_with_code(text);
drop function if exists public.handle_new_user() cascade;
drop function if exists public.record_checkin_history() cascade;
drop type if exists public.checkin_status_value;
drop type if exists public.family_role;

create type public.checkin_status_value as enum ('safe', 'evacuating', 'needs_help');
create type public.family_role as enum ('owner', 'member');

-- ---------- Tables ----------

-- Profiles: one row per auth user. Supabase manages auth.users itself;
-- app-visible user data lives here (this is the "users" table of the app).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  home_address text,
  home_lat double precision,
  home_lng double precision,
  expo_push_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Membership join table. The unique constraint on user_id enforces the
-- Phase 1 rule of one family per user; drop it if you later support several.
create table public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.family_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id),
  unique (user_id)
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  notes text,
  assigned_to uuid references public.profiles (id) on delete set null, -- null = whole family
  is_done boolean not null default false,
  completed_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Current status: exactly one row per user, upserted on every check-in.
create table public.checkin_status (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  status public.checkin_status_value not null,
  lat double precision,
  lng double precision,
  accuracy double precision,
  message text,
  updated_at timestamptz not null default now()
);

-- Append-only log of every check-in, filled automatically by trigger below.
create table public.checkin_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  status public.checkin_status_value not null,
  lat double precision,
  lng double precision,
  message text,
  created_at timestamptz not null default now()
);

create index checkin_history_family_idx on public.checkin_history (family_id, created_at desc);
create index checklist_items_family_idx on public.checklist_items (family_id, created_at desc);

-- ---------- Helper functions ----------

-- True if the calling user belongs to the given family.
-- SECURITY DEFINER so RLS policies can use it without recursing into
-- family_members' own policies.
create function public.is_family_member(fam uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.family_members
    where family_id = fam and user_id = auth.uid()
  );
$$;

-- Creates a family with a fresh invite code and makes the caller its owner.
-- An RPC (not plain inserts) so the family + membership happen atomically.
create function public.create_family(family_name text)
returns public.families
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
  fam public.families;
begin
  if exists (select 1 from public.family_members where user_id = auth.uid()) then
    raise exception 'You already belong to a family. Leave it before creating a new one.';
  end if;

  -- 6 chars from an alphabet without look-alikes (no 0/O, 1/I/L); retry on the
  -- unlikely collision.
  loop
    code := (
      select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', (random() * 30)::int + 1, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from public.families where invite_code = code);
  end loop;

  insert into public.families (name, invite_code, created_by)
  values (family_name, code, auth.uid())
  returning * into fam;

  insert into public.family_members (family_id, user_id, role)
  values (fam.id, auth.uid(), 'owner');

  return fam;
end;
$$;

-- Joins the caller to the family matching the invite code.
-- SECURITY DEFINER because a non-member can't see the family row under RLS.
create function public.join_family_with_code(code text)
returns public.families
language plpgsql
security definer
set search_path = public
as $$
declare
  fam public.families;
begin
  if exists (select 1 from public.family_members where user_id = auth.uid()) then
    raise exception 'You already belong to a family. Leave it before joining another.';
  end if;

  select * into fam from public.families where invite_code = upper(trim(code));
  if fam.id is null then
    raise exception 'No family found for that invite code.';
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (fam.id, auth.uid(), 'member');

  return fam;
end;
$$;

-- ---------- Triggers ----------

-- Auto-create a profile row when someone signs up.
-- display_name comes from the metadata the app passes to supabase.auth.signUp.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Every check-in (insert or update) also lands in the history log.
create function public.record_checkin_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.checkin_history (user_id, family_id, status, lat, lng, message)
  values (new.user_id, new.family_id, new.status, new.lat, new.lng, new.message);
  return new;
end;
$$;

create trigger on_checkin_recorded
  after insert or update on public.checkin_status
  for each row execute function public.record_checkin_history();

-- ---------- Row Level Security ----------
-- Every table denies everything by default once RLS is enabled; the policies
-- below open up exactly what the app needs. Rule of thumb: you can see data
-- for your own family, and you can only write rows that belong to you.

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.checklist_items enable row level security;
alter table public.checkin_status enable row level security;
alter table public.checkin_history enable row level security;

-- profiles: read yourself + anyone who shares a family with you; write only yourself.
create policy "profiles: read own or family" on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from public.family_members fm
      where fm.user_id = profiles.id and public.is_family_member(fm.family_id)
    )
  );
create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- families: members can read; the owner can rename; creation goes through create_family().
create policy "families: members read" on public.families
  for select using (public.is_family_member(id));
create policy "families: owner update" on public.families
  for update using (
    exists (
      select 1 from public.family_members
      where family_id = families.id and user_id = auth.uid() and role = 'owner'
    )
  );

-- family_members: members see the roster; you may remove yourself (leave).
-- Joining goes through the RPCs, which run as SECURITY DEFINER.
create policy "family_members: members read" on public.family_members
  for select using (public.is_family_member(family_id));
create policy "family_members: leave own" on public.family_members
  for delete using (user_id = auth.uid());

-- checklist_items: any family member can create, edit, complete, or delete items.
create policy "checklist: members read" on public.checklist_items
  for select using (public.is_family_member(family_id));
create policy "checklist: members insert" on public.checklist_items
  for insert with check (public.is_family_member(family_id) and created_by = auth.uid());
create policy "checklist: members update" on public.checklist_items
  for update using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));
create policy "checklist: members delete" on public.checklist_items
  for delete using (public.is_family_member(family_id));

-- checkin_status: family reads everyone's status; you write only your own.
create policy "checkin_status: members read" on public.checkin_status
  for select using (public.is_family_member(family_id));
create policy "checkin_status: insert own" on public.checkin_status
  for insert with check (user_id = auth.uid() and public.is_family_member(family_id));
create policy "checkin_status: update own" on public.checkin_status
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_family_member(family_id));

-- checkin_history: read-only for the family; rows are inserted by the trigger.
create policy "checkin_history: members read" on public.checkin_history
  for select using (public.is_family_member(family_id));

-- ---------- Realtime ----------
-- Lets the map screen receive live check-in changes over websockets.
alter publication supabase_realtime add table public.checkin_status;
