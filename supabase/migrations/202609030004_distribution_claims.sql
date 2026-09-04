-- Public campaign metadata lets wallets discover claim-ticket series without
-- publishing recipient addresses or allocation ownership.

alter table public.distributions
  add column if not exists client_id uuid,
  add column if not exists token_decimals smallint check (token_decimals between 0 and 18),
  add column if not exists series_addresses jsonb not null default '[]'::jsonb
    check (jsonb_typeof(series_addresses) = 'array'),
  add column if not exists delivery_tx_hash text;

update public.distributions set client_id = gen_random_uuid() where client_id is null;
alter table public.distributions alter column client_id set not null;
create unique index if not exists distributions_wallet_client_key
  on public.distributions (wallet_identity_id, client_id);

create index if not exists distributions_claim_discovery_idx
  on public.distributions (chain_id, status, kind, created_at desc)
  where status in ('live', 'complete') and kind in ('airdrop', 'vesting');

