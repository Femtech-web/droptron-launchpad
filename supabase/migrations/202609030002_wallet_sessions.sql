-- Droptron uses a Starknet wallet signature as its product session.
-- Supabase remains the data store; no email/password account is required.

alter table public.workspace_drafts drop constraint if exists workspace_drafts_owner_id_fkey;
alter table public.workspace_drafts drop constraint if exists workspace_drafts_owner_id_chain_id_owner_wallet_address_fkey;
alter table public.created_tokens drop constraint if exists created_tokens_owner_id_fkey;
alter table public.created_tokens drop constraint if exists created_tokens_owner_id_chain_id_owner_wallet_address_fkey;
alter table public.launches drop constraint if exists launches_owner_id_fkey;
alter table public.launches drop constraint if exists launches_owner_id_chain_id_owner_wallet_address_fkey;
alter table public.distributions drop constraint if exists distributions_owner_id_fkey;
alter table public.distributions drop constraint if exists distributions_owner_id_chain_id_owner_wallet_address_fkey;

drop policy if exists wallet_identity_owner_select on public.wallet_identities;
drop policy if exists workspace_draft_owner_all on public.workspace_drafts;
drop policy if exists created_token_owner_all on public.created_tokens;
drop policy if exists launch_owner_read on public.launches;
drop policy if exists launch_owner_insert on public.launches;
drop policy if exists launch_owner_update on public.launches;
drop policy if exists distribution_owner_read on public.distributions;
drop policy if exists distribution_owner_insert on public.distributions;
drop policy if exists distribution_owner_update on public.distributions;

revoke all on public.wallet_identities, public.workspace_drafts, public.created_tokens,
  public.launches, public.distributions from authenticated;
grant select on public.launches, public.distributions to authenticated;

alter table public.wallet_identities drop column user_id;
alter table public.wallet_identities add column last_seen_at timestamptz not null default now();

alter table public.workspace_drafts drop column owner_id;
alter table public.created_tokens drop column owner_id;
alter table public.launches drop column owner_id;
alter table public.distributions drop column owner_id;

alter table public.workspace_drafts add column wallet_identity_id bigint;
alter table public.created_tokens add column wallet_identity_id bigint;
alter table public.launches add column wallet_identity_id bigint;
alter table public.distributions add column wallet_identity_id bigint;

alter table public.workspace_drafts
  add constraint workspace_drafts_wallet_identity_fkey foreign key (wallet_identity_id)
  references public.wallet_identities(id) on delete cascade;
alter table public.created_tokens
  add constraint created_tokens_wallet_identity_fkey foreign key (wallet_identity_id)
  references public.wallet_identities(id) on delete restrict;
alter table public.launches
  add constraint launches_wallet_identity_fkey foreign key (wallet_identity_id)
  references public.wallet_identities(id) on delete restrict;
alter table public.distributions
  add constraint distributions_wallet_identity_fkey foreign key (wallet_identity_id)
  references public.wallet_identities(id) on delete restrict;

alter table public.workspace_drafts alter column wallet_identity_id set not null;
alter table public.created_tokens alter column wallet_identity_id set not null;
alter table public.launches alter column wallet_identity_id set not null;
alter table public.distributions alter column wallet_identity_id set not null;

alter table public.workspace_drafts drop constraint if exists workspace_drafts_client_id_key;
alter table public.workspace_drafts
  add constraint workspace_drafts_wallet_client_key unique (wallet_identity_id, client_id);

drop index if exists wallet_identities_user_created_idx;
drop index if exists workspace_drafts_owner_wallet_type_updated_idx;
drop index if exists created_tokens_owner_chain_created_idx;
drop index if exists launches_owner_chain_updated_idx;
drop index if exists distributions_owner_chain_updated_idx;

create index workspace_drafts_wallet_type_updated_idx
  on public.workspace_drafts (wallet_identity_id, resource_type, updated_at desc, id desc);
create index created_tokens_wallet_created_idx
  on public.created_tokens (wallet_identity_id, created_at desc, id desc);
create index launches_wallet_updated_idx
  on public.launches (wallet_identity_id, updated_at desc, id desc);
create index distributions_wallet_updated_idx
  on public.distributions (wallet_identity_id, updated_at desc, id desc);

create table public.wallet_auth_challenges (
  id uuid primary key default gen_random_uuid(),
  chain_id text not null check (chain_id in ('SN_MAIN', 'SN_SEPOLIA')),
  wallet_address text not null check (
    wallet_address = lower(wallet_address)
    and wallet_address ~ '^0x[0-9a-f]{1,64}$'
  ),
  nonce text not null unique check (nonce ~ '^0x[0-9a-f]{62}$'),
  origin text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.wallet_sessions (
  id bigint generated always as identity primary key,
  wallet_identity_id bigint not null references public.wallet_identities(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index wallet_auth_challenges_lookup_idx
  on public.wallet_auth_challenges (id, expires_at)
  where consumed_at is null;
create index wallet_sessions_identity_active_idx
  on public.wallet_sessions (wallet_identity_id, expires_at desc)
  where revoked_at is null;

alter table public.wallet_auth_challenges enable row level security;
alter table public.wallet_sessions enable row level security;
revoke all on public.wallet_auth_challenges, public.wallet_sessions from anon, authenticated;

-- Creator data and wallet-session tables are accessed only through authenticated
-- Next.js route handlers using the server-only Supabase secret key. Public launch
-- and distribution reads retain the narrow anon SELECT policies from migration 001.
