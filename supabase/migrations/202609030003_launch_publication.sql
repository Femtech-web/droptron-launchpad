-- Public launch metadata mirrors reviewed on-chain contracts so Explore works
-- across wallets and devices. Contract state remains authoritative.

alter table public.launches
  add column if not exists sale_token_decimals smallint
    check (sale_token_decimals between 0 and 18),
  add column if not exists payment_token_decimals smallint
    check (payment_token_decimals between 0 and 18);

create index if not exists launches_public_chain_status_starts_idx
  on public.launches (chain_id, status, starts_at desc, id desc)
  where status in ('live', 'ended');
