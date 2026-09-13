-- Institute Manager — Supabase schema
-- One JSONB table per collection. Only the institute admin can read or write.
-- The first account that signs in claims the admin role; nobody can claim it after that.

create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- No policies on app_admins: it is only reachable through the functions below.

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

-- Lets the login screen know whether first-time setup is still needed.
create or replace function public.admin_exists()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins);
$$;

-- Called after every sign-in. Makes the caller admin only if no admin exists yet.
create or replace function public.claim_admin()
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  lock table public.app_admins in exclusive mode;
  if not exists (select 1 from public.app_admins) then
    insert into public.app_admins (user_id, email) values (auth.uid(), auth.jwt() ->> 'email');
  end if;
  return exists (select 1 from public.app_admins where user_id = auth.uid());
end;
$$;

revoke all on function public.is_admin()     from public, anon;
revoke all on function public.claim_admin()  from public, anon;
revoke all on function public.admin_exists() from public;
grant execute on function public.is_admin()     to authenticated;
grant execute on function public.claim_admin()  to authenticated;
grant execute on function public.admin_exists() to anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['students', 'courses', 'batches', 'payments', 'attendance', 'expenses', 'settings'] loop
    execute format(
      'create table if not exists public.%I (
         id         text primary key,
         data       jsonb not null,
         updated_at timestamptz not null default now()
       )', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Admin full access" on public.%I', t);
    execute format(
      'create policy "Admin full access" on public.%I for all to authenticated
         using ((select public.is_admin())) with check ((select public.is_admin()))', t);
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
