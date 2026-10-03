-- Institute Manager — Supabase schema (fresh install)
--
-- Every account is its own institute. Each data row carries `owner` (the account's user id)
-- and Row Level Security lets an account see and change only its own rows — and only while
-- an administrator has approved that account.
-- Run this whole file once in a new project's SQL editor.

-- ─── Accounts ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text,
  institute_name    text,
  full_name         text,
  status            text not null default 'pending',
  status_note       text,
  status_changed_at timestamptz,
  created_at        timestamptz not null default now()
);
do $$
begin
  alter table public.profiles
    add constraint profiles_status_check check (status in ('pending', 'approved', 'paused', 'rejected'));
exception when duplicate_object then null;
end;
$$;

alter table public.profiles enable row level security;
drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke all on public.profiles from anon;

-- Administrators who can open /admin. Add one by email:
--   insert into public.app_superadmins (user_id, email)
--   select id, email from auth.users where lower(email) = lower('you@example.com');
create table if not exists public.app_superadmins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);
alter table public.app_superadmins enable row level security; -- no policies: functions only

-- Live updates on profiles: pausing or approving reaches an open app within a second
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.app_superadmins where user_id = auth.uid()); $$;

create or replace function public.account_active()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and status = 'approved'); $$;

-- ─── Institute data ──────────────────────────────────────────────────────────
do $$
declare t text;
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
         using (owner = (select auth.uid()) and (select public.account_active()))
         with check (owner = (select auth.uid()) and (select public.account_active()))', t);
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

-- ─── Sign-up ─────────────────────────────────────────────────────────────────
-- Saves the profile and seeds the institute name. New accounts start as 'pending'.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
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

-- ─── Administrator console (/admin) ──────────────────────────────────────────
create or replace function public.admin_institutes()
returns table (
  id uuid, email text, institute_name text, status text, status_note text,
  created_at timestamptz, status_changed_at timestamptz,
  students int, payments int, collected numeric, last_activity timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.email, p.institute_name, p.status, p.status_note, p.created_at, p.status_changed_at,
         (select count(*)::int from public.students s where s.owner = p.id),
         (select count(*)::int from public.payments pay where pay.owner = p.id),
         coalesce((select sum(coalesce(nullif(pay.data ->> 'total', ''), '0')::numeric) from public.payments pay where pay.owner = p.id), 0),
         greatest(
           (select max(s.updated_at) from public.students s where s.owner = p.id),
           (select max(pay.updated_at) from public.payments pay where pay.owner = p.id),
           (select max(st.updated_at) from public.settings st where st.owner = p.id)
         )
  from public.profiles p
  where (select public.is_superadmin())
  order by p.created_at desc;
$$;

create or replace function public.admin_set_status(target uuid, new_status text, note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not (select public.is_superadmin()) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if new_status not in ('pending', 'approved', 'paused', 'rejected') then
    raise exception 'Unknown status: %', new_status;
  end if;
  update public.profiles
     set status = new_status, status_note = note, status_changed_at = now()
   where id = target;
end;
$$;

revoke all on function public.is_superadmin()                       from public, anon;
revoke all on function public.account_active()                      from public, anon;
revoke all on function public.admin_institutes()                    from public, anon;
revoke all on function public.admin_set_status(uuid, text, text)    from public, anon;
grant execute on function public.is_superadmin()                    to authenticated;
grant execute on function public.account_active()                   to authenticated;
grant execute on function public.admin_institutes()                 to authenticated;
grant execute on function public.admin_set_status(uuid, text, text) to authenticated;
