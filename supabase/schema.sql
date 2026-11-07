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
-- An institute may rename itself, but never change its own status: only admin_set_status() can.
revoke insert, update, delete on public.profiles from authenticated;
grant update (institute_name, full_name) on public.profiles to authenticated;

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

-- Read-only view of one institute's records, for the institute dashboard in /admin
create or replace function public.admin_institute_data(target uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when (select public.is_superadmin()) then jsonb_build_object(
    'settings',   coalesce((select data from public.settings  where owner = target and id = 'settings'), '{}'::jsonb),
    'students',   coalesce((select jsonb_agg(data) from public.students   where owner = target), '[]'::jsonb),
    'courses',    coalesce((select jsonb_agg(data) from public.courses    where owner = target), '[]'::jsonb),
    'batches',    coalesce((select jsonb_agg(data) from public.batches    where owner = target), '[]'::jsonb),
    'payments',   coalesce((select jsonb_agg(data) from public.payments   where owner = target), '[]'::jsonb),
    'expenses',   coalesce((select jsonb_agg(data) from public.expenses   where owner = target), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(data) from public.attendance where owner = target), '[]'::jsonb)
  ) else null end;
$$;

revoke all on function public.is_superadmin()                       from public, anon;
revoke all on function public.account_active()                      from public, anon;
revoke all on function public.admin_institutes()                    from public, anon;
revoke all on function public.admin_set_status(uuid, text, text)    from public, anon;
revoke all on function public.admin_institute_data(uuid)            from public, anon;
grant execute on function public.is_superadmin()                    to authenticated;
grant execute on function public.admin_institute_data(uuid)         to authenticated;
grant execute on function public.account_active()                   to authenticated;
grant execute on function public.admin_institutes()                 to authenticated;
grant execute on function public.admin_set_status(uuid, text, text) to authenticated;

-- ─── Student ID card QR code (/verify) ────────────────────────────────────────
-- Public student profile for the QR code on ID cards (read-only, limited fields).
-- Returns null unless the institute is approved and the student exists.
create or replace function public.card_profile(p_owner uuid, p_student text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'student', jsonb_build_object(
      'name',           s.data ->> 'name',
      'code',           s.data ->> 'code',
      'photo',          s.data ->> 'photo',
      'status',         coalesce(s.data ->> 'status', 'active'),
      'admissionDate',  s.data ->> 'admissionDate',
      'durationMonths', s.data ->> 'durationMonths',
      'leftDate',       s.data ->> 'leftDate',
      'course', (select c.data ->> 'name' from public.courses c where c.owner = p_owner and c.id = s.data ->> 'courseId'),
      'batch',  (select concat_ws(' · ', b.data ->> 'name', nullif(b.data ->> 'time', ''))
                   from public.batches b where b.owner = p_owner and b.id = s.data ->> 'batchId')
    ),
    'institute', jsonb_build_object(
      'name',    coalesce(nullif(st.data ->> 'name', ''), p.institute_name),
      'tagline', st.data ->> 'tagline',
      'logo',    st.data ->> 'logo',
      'address', st.data ->> 'address',
      'phone',   st.data ->> 'phone',
      'email',   st.data ->> 'email',
      'color',   st.data ->> 'idColor'
    )
  )
  from public.profiles p
  join public.students s on s.owner = p.id and s.id = p_student
  left join public.settings st on st.owner = p.id and st.id = 'settings'
  where p.id = p_owner and p.status = 'approved';
$$;
revoke all on function public.card_profile(uuid, text) from public;
grant execute on function public.card_profile(uuid, text) to anon, authenticated;
