-- Org-level numbering prefs (no yearly reset by default)
alter table public.organizations
  add column if not exists contract_number_prefix text not null default 'CTR',
  add column if not exists contract_number_padding int not null default 4,
  add column if not exists contract_number_reset text not null default 'never'
    check (contract_number_reset in ('never','yearly'));

-- Sequence table: (organization_id, seq_key) — seq_key = 0 when reset='never', else YYYY
create table if not exists public.contract_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  seq_key int not null,
  last_number int not null default 0,
  primary key (organization_id, seq_key)
);

-- Generator: defaults to “never” reset (PREFIX-SEQ)
create or replace function public.next_contract_number(p_org uuid)
returns text language plpgsql as $$
declare
  v_prefix text;
  v_pad int;
  v_reset text;
  v_key int;
  v_seq int;
  v_out text;
begin
  select contract_number_prefix, contract_number_padding, contract_number_reset
    into v_prefix, v_pad, v_reset
  from public.organizations where id = p_org;

  v_key := case when v_reset = 'yearly' then extract(year from now())::int else 0 end;

  insert into public.contract_sequences (organization_id, seq_key, last_number)
  values (p_org, v_key, 0)
  on conflict (organization_id, seq_key) do nothing;

  update public.contract_sequences
     set last_number = last_number + 1
   where organization_id = p_org and seq_key = v_key
  returning last_number into v_seq;

  if v_reset = 'yearly' then
    v_out := format('%s-%s-%s', v_prefix, to_char(now(),'YYYY'), lpad(v_seq::text, v_pad, '0'));
  else
    v_out := format('%s-%s', v_prefix, lpad(v_seq::text, v_pad, '0'));
  end if;

  return v_out;
end $$;

-- Set OOHLoop defaults
update public.organizations
set contract_number_prefix = 'OOH', contract_number_reset = 'never'
where name = 'OOHLoop';

-- Ensure uniqueness (already added in core, but safe)
create unique index if not exists contracts_org_contract_number_uidx
  on public.contracts (organization_id, contract_number);
