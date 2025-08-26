-- 2025 setup: storage policies, boards RLS, user_organizations RLS, onboarding trigger

-- ---------- Extensions ----------
create extension if not exists pgcrypto;

-- ---------- STORAGE BUCKET ----------
-- Create the private bucket if it doesn't exist
do $$
begin
  if not exists (
    select 1 from storage.buckets where id = 'board-photos'
  ) then
    perform storage.create_bucket('board-photos', public := false);
  end if;
end$$;

-- Enable RLS on storage.objects
alter table storage.objects enable row level security;

-- Storage policies (idempotent re-creation)
drop policy if exists "board-photos insert" on storage.objects;
create policy "board-photos insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'board-photos');

drop policy if exists "board-photos select" on storage.objects;
create policy "board-photos select"
on storage.objects
for select
to authenticated
using (bucket_id = 'board-photos');

drop policy if exists "board-photos update own" on storage.objects;
create policy "board-photos update own"
on storage.objects
for update
to authenticated
using (bucket_id = 'board-photos' and owner = auth.uid())
with check (bucket_id = 'board-photos' and owner = auth.uid());

drop policy if exists "board-photos delete own" on storage.objects;
create policy "board-photos delete own"
on storage.objects
for delete
to authenticated
using (bucket_id = 'board-photos' and owner = auth.uid());

-- ---------- BOARDS RLS ----------
alter table public.boards enable row level security;

-- SELECT: same org
drop policy if exists boards_select_same_org on public.boards;
create policy boards_select_same_org
on public.boards
for select
using (
  exists (
    select 1 from public.user_organizations m
    where m.user_id = auth.uid()
      and m.organization_id = boards.organization_id
  )
);

-- UPDATE: same org (needed to save hero_image_path)
drop policy if exists boards_update_same_org on public.boards;
create policy boards_update_same_org
on public.boards
for update
using (
  exists (
    select 1 from public.user_organizations m
    where m.user_id = auth.uid()
      and m.organization_id = boards.organization_id
  )
)
with check (
  exists (
    select 1 from public.user_organizations m
    where m.user_id = auth.uid()
      and m.organization_id = boards.organization_id
  )
);

-- (Optional) INSERT: allow org members to insert boards
drop policy if exists boards_insert_same_org on public.boards;
create policy boards_insert_same_org
on public.boards
for insert
with check (
  exists (
    select 1 from public.user_organizations m
    where m.user_id = auth.uid()
      and m.organization_id = boards.organization_id
  )
);

-- ---------- USER_ORGANIZATIONS RLS ----------
alter table public.user_organizations enable row level security;

-- Users can see their own memberships (needed by APIs)
drop policy if exists uo_select_self on public.user_organizations;
create policy uo_select_self
on public.user_organizations
for select
using (user_id = auth.uid());

-- (Optional) allow inserting a self-membership when appropriate
-- (we keep this OFF by default to avoid escalation; invites will insert via trigger)
-- drop policy if exists uo_insert_self on public.user_organizations;
-- create policy uo_insert_self
-- on public.user_organizations
-- for insert
-- with check (user_id = auth.uid());

-- ---------- ONBOARDING SUPPORT ----------
-- Map email -> target org & role until the user accepts the invite
create table if not exists public.pending_org_invites (
  email text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null default 'admin'
);

-- Trigger: when a user is created, attach them to their pending org and seed profile/users rows
create or replace function public.handle_new_user_from_pending_invites()
returns trigger
language plpgsql
security definer
as $$
declare
  v_org uuid;
  v_role text;
begin
  select organization_id, role
    into v_org, v_role
  from public.pending_org_invites
  where lower(email) = lower(new.email);

  if v_org is not null then
    -- Users table (your app-level table)
    insert into public.users (id, full_name, role, organization_id)
    values (new.id, new.raw_user_meta_data->>'full_name', coalesce(v_role, 'client'), v_org)
    on conflict (id) do update
      set role = excluded.role,
          organization_id = excluded.organization_id;

    -- Profiles table (if you use it in the UI)
    insert into public.profiles (id, email, organization_id, role)
    values (new.id, new.email, v_org, coalesce(v_role, 'user'))
    on conflict (id) do update
      set email = excluded.email,
          organization_id = excluded.organization_id,
          role = excluded.role;

    -- Membership
    insert into public.user_organizations (user_id, organization_id)
    values (new.id, v_org)
    on conflict (user_id, organization_id) do nothing;

    -- Clear the pending invite
    delete from public.pending_org_invites where lower(email) = lower(new.email);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_handle_new_user_from_pending_invites on auth.users;
create trigger trg_handle_new_user_from_pending_invites
after insert on auth.users
for each row
execute function public.handle_new_user_from_pending_invites();
