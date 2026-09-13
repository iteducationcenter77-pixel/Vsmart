-- Institute Manager — Supabase schema (fresh install)
-- Every account is its own institute. Each data row carries `owner` (the account's user id)
-- and Row Level Security lets an account see and change only its own rows.
-- Run this whole file once in a new project's SQL editor.

-- Profiles: one row per account, filled automatically at sign-up
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text,
  institute_name text,
  full_name      text,
  created_at     timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke all on public.profiles from anon;

-- Data tables: id + JSON document per row, scoped to the owner
do $$
declare
  t text;
begin
  foreach t in array array['students', 'courses', 'batches', 'payments', 'attendance', 'expenses', 'settings'] loop
    execute format(
      'create table if not exists public.%I (
         owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
         id         text not null,
         data       jsonb not null,
         updated_at timestamptz not null default now(),
         primary key (owner, id)
       )', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Owner full access" on public.%I', t);
    execute format(
      'create policy "Owner full access" on public.%I for all to authenticated
         using (owner = (select auth.uid())) with check (owner = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- On sign-up: save the profile and seed the institute name from the sign-up form
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  inst text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'institute_name', '')), '');
begin
  insert into public.profiles (id, email, institute_name, full_name)
  values (new.id, new.email, inst, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;
  if inst is not null then
    insert into public.settings (owner, id, data)
    values (new.id, 'settings', jsonb_build_object('name', inst))
    on conflict (owner, id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
