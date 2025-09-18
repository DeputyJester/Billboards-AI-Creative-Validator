-- Enums
do $$ begin
  create type contract_status as enum ('draft','sent','viewed','signed','countersigned','cancelled','expired');
exception when duplicate_object then null; end $$;

-- Core tables
create table if not exists public.contracts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  customer_id      uuid references public.customers(id) on delete set null,
  created_by       uuid references auth.users(id) on delete set null,
  name             text,
  description      text,
  -- header fields aligned with DoMedia parity
  contract_number  text,
  proposal_ref     text,
  start_date       date,
  end_date         date,
  campaign_id      uuid references public.campaigns(id) on delete set null,
  client_label     text,
  creative_category text,
  revision_number  int not null default 0,
  -- totals
  subtotal         numeric(12,2) default 0,
  tax              numeric(12,2) default 0,
  total            numeric(12,2) generated always as (coalesce(subtotal,0) + coalesce(tax,0)) stored,
  status           contract_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists contracts_org_contract_number_uidx
  on public.contracts (organization_id, contract_number);

create table if not exists public.contract_items (
  id               uuid primary key default gen_random_uuid(),
  contract_id      uuid not null references public.contracts(id) on delete cascade,
  board_id         uuid references public.boards(id) on delete set null,
  description      text not null,
  qty              numeric(12,2) not null default 1,
  unit_price       numeric(12,2) not null default 0,
  -- DoMedia-style snapshots
  inventory_number text,
  geopath_id       text,
  units            numeric(12,2),
  format           text,
  market           text,
  width_ft         numeric,
  height_ft        numeric,
  width_display    text,
  height_display   text,
  face_direction   text,
  cycle_start      date,
  cycle_end        date,
  copy_changes     int,
  cycles           numeric(12,2),
  start_date       date,   -- optional per-line override
  end_date         date,   -- optional per-line override
  created_at       timestamptz not null default now()
);

create table if not exists public.contract_signers (
  id               uuid primary key default gen_random_uuid(),
  contract_id      uuid not null references public.contracts(id) on delete cascade,
  role             text not null check (role in ('client','staff')),
  name             text,
  email            text,
  token            uuid not null default gen_random_uuid(),
  signed_at        timestamptz,
  signed_ip        inet,
  signed_user_agent text,
  created_at       timestamptz not null default now()
);
create unique index if not exists contract_signers_token_uidx on public.contract_signers(token);

create table if not exists public.contract_documents (
  id               uuid primary key default gen_random_uuid(),
  contract_id      uuid not null references public.contracts(id) on delete cascade,
  version          int not null default 1,
  storage_path     text,
  sha256           text,
  created_at       timestamptz not null default now()
);

-- Party snapshots (buyer/seller/billing blocks)
create table if not exists public.contract_party_snapshot (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references public.contracts(id) on delete cascade,
  role          text not null check (role in ('buyer','seller','billing')),
  company       text,
  contact_name  text,
  email         text,
  phone         text,
  address1      text,
  address2      text,
  city          text,
  state         text,
  postal        text,
  country       text,
  created_at    timestamptz not null default now()
);

-- Optional attachments (beyond canonical snapshots)
create table if not exists public.contract_attachments (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references public.contracts(id) on delete cascade,
  file_name     text not null,
  storage_path  text not null,
  created_at    timestamptz not null default now()
);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists contracts_set_updated_at on public.contracts;
create trigger contracts_set_updated_at before update on public.contracts
for each row execute function public.set_updated_at();

-- RLS
alter table public.contracts              enable row level security;
alter table public.contract_items         enable row level security;
alter table public.contract_signers       enable row level security;
alter table public.contract_documents     enable row level security;
alter table public.contract_party_snapshot enable row level security;
alter table public.contract_attachments    enable row level security;

-- Policies: org members can read/write (you can tighten later)
drop policy if exists contracts_select on public.contracts;
create policy contracts_select on public.contracts
for select using (
  exists (select 1 from public.user_organizations uo
          where uo.user_id = auth.uid() and uo.organization_id = contracts.organization_id)
);
drop policy if exists contracts_write on public.contracts;
create policy contracts_write on public.contracts
for all using (
  exists (select 1 from public.user_organizations uo
          where uo.user_id = auth.uid() and uo.organization_id = contracts.organization_id)
) with check (true);

drop policy if exists contract_items_select on public.contract_items;
create policy contract_items_select on public.contract_items
for select using (
  exists (select 1 from public.contracts c
          join public.user_organizations uo on uo.organization_id=c.organization_id and uo.user_id=auth.uid()
          where c.id = contract_items.contract_id)
);
drop policy if exists contract_items_write on public.contract_items;
create policy contract_items_write on public.contract_items
for all using (
  exists (select 1 from public.contracts c
          join public.user_organizations uo on uo.organization_id=c.organization_id and uo.user_id=auth.uid()
          where c.id = contract_items.contract_id)
) with check (true);

drop policy if exists contract_signers_select on public.contract_signers;
create policy contract_signers_select on public.contract_signers
for select using (
  exists (select 1 from public.contracts c
          join public.user_organizations uo on uo.organization_id=c.organization_id and uo.user_id=auth.uid()
          where c.id = contract_signers.contract_id)
);
drop policy if exists contract_signers_write on public.contract_signers;
create policy contract_signers_write on public.contract_signers
for all using (
  exists (select 1 from public.contracts c
          join public.user_organizations uo on uo.organization_id=c.organization_id and uo.user_id=auth.uid()
          where c.id = contract_signers.contract_id)
) with check (true);

drop policy if exists contract_documents_select on public.contract_documents;
create policy contract_documents_select on public.contract_documents
for select using (
  exists (select 1 from public.contracts c
          join public.user_organizations uo on uo.organization_id=c.organization_id and uo.user_id=auth.uid()
          where c.id = contract_documents.contract_id)
);
drop policy if exists contract_documents_write on public.contract_documents;
create policy contract_documents_write on public.contract_documents
for all using (
  exists (select 1 from public.contracts c
          join public.user_organizations uo on uo.organization_id=c.organization_id and uo.user_id=auth.uid()
          where c.id = contract_documents.contract_id)
) with check (true);

drop policy if exists cps_select on public.contract_party_snapshot;
create policy cps_select on public.contract_party_snapshot
for select using (
  exists (select 1 from public.contracts c
          join public.user_organizations uo on uo.organization_id=c.organization_id and uo.user_id=auth.uid()
          where c.id = contract_party_snapshot.contract_id)
);
drop policy if exists cps_write on public.contract_party_snapshot;
create policy cps_write on public.contract_party_snapshot
for all using (
  exists (select 1 from public.contracts c
          join public.user_organizations uo on uo.organization_id=c.organization_id and uo.user_id=auth.uid()
          where c.id = contract_party_snapshot.contract_id)
) with check (true);
