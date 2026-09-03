create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.wallet_identities (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  chain_id text not null check (chain_id in ('SN_MAIN', 'SN_SEPOLIA')),
  wallet_address text not null check (
    wallet_address = lower(wallet_address)
    and wallet_address ~ '^0x[0-9a-f]{1,64}$'
  ),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (chain_id, wallet_address),
  unique (user_id, chain_id, wallet_address)
);

create table public.workspace_drafts (
  id bigint generated always as identity primary key,
  client_id uuid not null default gen_random_uuid() unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  chain_id text not null check (chain_id in ('SN_MAIN', 'SN_SEPOLIA')),
  owner_wallet_address text not null,
  resource_type text not null check (resource_type in ('launch', 'distribution')),
  title text not null check (char_length(title) between 1 and 120),
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb check (
    jsonb_typeof(payload) = 'object'
    and not (payload ?| array['recipients', 'recipientInput', 'recipient_list'])
  ),
  recipient_manifest_ciphertext text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_id, chain_id, owner_wallet_address)
    references public.wallet_identities(user_id, chain_id, wallet_address) on delete restrict
);

create table public.created_tokens (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  chain_id text not null check (chain_id in ('SN_MAIN', 'SN_SEPOLIA')),
  owner_wallet_address text not null,
  contract_address text not null check (
    contract_address = lower(contract_address)
    and contract_address ~ '^0x[0-9a-f]{1,64}$'
  ),
  name text not null check (char_length(name) between 1 and 31),
  symbol text not null check (char_length(symbol) between 1 and 10),
  decimals smallint not null check (decimals between 0 and 18),
  total_supply numeric(78, 0) not null check (total_supply > 0),
  logo_url text,
  deployment_tx_hash text not null check (deployment_tx_hash ~ '^0x[0-9a-f]{1,64}$'),
  created_at timestamptz not null default now(),
  unique (chain_id, contract_address),
  foreign key (owner_id, chain_id, owner_wallet_address)
    references public.wallet_identities(user_id, chain_id, wallet_address) on delete restrict
);

create table public.launches (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete restrict,
  chain_id text not null check (chain_id in ('SN_MAIN', 'SN_SEPOLIA')),
  owner_wallet_address text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  contract_address text check (contract_address is null or contract_address ~ '^0x[0-9a-f]{1,64}$'),
  sale_token_address text not null check (sale_token_address ~ '^0x[0-9a-f]{1,64}$'),
  payment_token_address text not null check (payment_token_address ~ '^0x[0-9a-f]{1,64}$'),
  pricing_model text not null check (pricing_model in ('fixed', 'linear')),
  initial_price numeric(78, 18) not null check (initial_price > 0),
  curve_slope numeric(78, 18) check (curve_slope is null or curve_slope > 0),
  sale_allocation numeric(78, 18) not null check (sale_allocation > 0),
  raise_limit numeric(78, 18) not null check (raise_limit > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'deploying', 'funding', 'live', 'ended', 'cancelled')),
  deployment_tx_hash text,
  funding_tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (sale_token_address <> payment_token_address),
  unique (chain_id, contract_address),
  foreign key (owner_id, chain_id, owner_wallet_address)
    references public.wallet_identities(user_id, chain_id, wallet_address) on delete restrict
);

create table public.distributions (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete restrict,
  source_launch_id bigint references public.launches(id) on delete set null,
  chain_id text not null check (chain_id in ('SN_MAIN', 'SN_SEPOLIA')),
  owner_wallet_address text not null,
  kind text not null check (kind in ('disperse', 'airdrop', 'vesting')),
  name text not null check (char_length(name) between 1 and 120),
  token_address text not null check (token_address ~ '^0x[0-9a-f]{1,64}$'),
  recipient_count integer not null check (recipient_count > 0),
  total_amount numeric(78, 18) not null check (total_amount > 0),
  commitment text,
  claim_starts_at timestamptz,
  claim_ends_at timestamptz,
  first_unlock_at timestamptz,
  cadence text check (cadence is null or cadence in ('weekly', 'monthly')),
  tranche_count smallint check (tranche_count is null or tranche_count between 1 and 120),
  initial_unlock_percent numeric(5, 2) check (initial_unlock_percent is null or initial_unlock_percent between 0 and 100),
  contract_address text,
  status text not null default 'draft' check (status in ('draft', 'deploying', 'funding', 'live', 'complete', 'cancelled')),
  deployment_tx_hash text,
  funding_tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (claim_ends_at is null or claim_starts_at is not null),
  check (claim_ends_at is null or claim_ends_at > claim_starts_at),
  foreign key (owner_id, chain_id, owner_wallet_address)
    references public.wallet_identities(user_id, chain_id, wallet_address) on delete restrict
);

create index wallet_identities_user_created_idx
  on public.wallet_identities (user_id, created_at desc, id desc);
create index workspace_drafts_owner_wallet_type_updated_idx
  on public.workspace_drafts (owner_id, chain_id, owner_wallet_address, resource_type, updated_at desc, id desc);
create index created_tokens_owner_chain_created_idx
  on public.created_tokens (owner_id, chain_id, owner_wallet_address, created_at desc, id desc);
create index launches_owner_chain_updated_idx
  on public.launches (owner_id, chain_id, owner_wallet_address, updated_at desc, id desc);
create index launches_live_starts_idx
  on public.launches (starts_at desc, id desc)
  where status = 'live';
create index distributions_owner_chain_updated_idx
  on public.distributions (owner_id, chain_id, owner_wallet_address, updated_at desc, id desc);
create index distributions_live_kind_created_idx
  on public.distributions (kind, created_at desc, id desc)
  where status = 'live';
create index distributions_source_launch_idx
  on public.distributions (source_launch_id)
  where source_launch_id is not null;

create trigger workspace_drafts_set_updated_at before update on public.workspace_drafts
for each row execute function public.set_updated_at();
create trigger launches_set_updated_at before update on public.launches
for each row execute function public.set_updated_at();
create trigger distributions_set_updated_at before update on public.distributions
for each row execute function public.set_updated_at();

alter table public.wallet_identities enable row level security;
alter table public.workspace_drafts enable row level security;
alter table public.created_tokens enable row level security;
alter table public.launches enable row level security;
alter table public.distributions enable row level security;

create policy wallet_identity_owner_select on public.wallet_identities
for select to authenticated using ((select auth.uid()) = user_id);

-- Wallet links are written only by the server after verifying a short-lived,
-- domain-bound Starknet signature. A browser client must never self-attest an address.

create policy workspace_draft_owner_all on public.workspace_drafts
for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy created_token_owner_all on public.created_tokens
for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy launch_public_read on public.launches
for select to anon, authenticated using (status in ('live', 'ended'));
create policy launch_owner_read on public.launches
for select to authenticated using ((select auth.uid()) = owner_id);
create policy launch_owner_insert on public.launches
for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy launch_owner_update on public.launches
for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy distribution_public_read on public.distributions
for select to anon, authenticated using (status in ('live', 'complete'));
create policy distribution_owner_read on public.distributions
for select to authenticated using ((select auth.uid()) = owner_id);
create policy distribution_owner_insert on public.distributions
for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy distribution_owner_update on public.distributions
for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

revoke all on public.wallet_identities, public.workspace_drafts, public.created_tokens, public.launches, public.distributions from anon, authenticated;
grant select on public.launches, public.distributions to anon;
grant select on public.wallet_identities to authenticated;
grant select, insert, update, delete on public.workspace_drafts to authenticated;
grant select, insert, update on public.created_tokens, public.launches, public.distributions to authenticated;
grant usage, select on sequence public.wallet_identities_id_seq, public.workspace_drafts_id_seq,
  public.created_tokens_id_seq, public.launches_id_seq, public.distributions_id_seq to authenticated;
