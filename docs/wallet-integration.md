# Wallet and STRK20 integration

## Capability detection

A connected Starknet wallet is not necessarily a privacy wallet. Droptron checks the Wallet API capability advertised by the wallet before enabling shielded balance reads or private actions. Ready is the supported privacy wallet used for the Mainnet product flow.

## Registration

Private-token registration is once per account, chain, and STRK20 pool. Ready owns this setup. The user enables private tokens inside Ready; Droptron does not derive or submit a viewing key.

## Preflight

Before a private action, Droptron reads the live pool fee and asks the wallet for the relevant private balances. It can then:

- explain the next wallet action;
- open a prefilled STRK Shield modal for a fee shortfall;
- open an asset Shield modal for a token shortfall;
- reserve multiple pool fees when shielding is followed by delivery;
- wait for new notes to mature before continuing.

All token calculations use onchain ERC-20 decimals and integer base units. Conventional 0–18 decimal Starknet ERC-20s are supported. Fee-on-transfer, rebasing, and non-standard balance behavior are rejected rather than estimated.

## Confirmations

A normal shield may request an exact ERC-20 approval and then the pool deposit. Claim-ticket approval is a separate campaign stage, so ticket shielding expects only its one private Shield confirmation.

Ready may display a generic high-risk warning for any spending limit. Droptron uses the configured pool as spender and exact amounts rather than unlimited allowances. Users should still inspect the wallet review.

## Wallet-owned replays

Ready has sometimes redisplayed an already successful private request after its success view closes. Droptron prevents another application submission with locks, fingerprints, stage guards, and one-shot idempotency keys. Wallet Standard does not expose a cancellation method for a request already owned by the wallet UI. If Droptron already shows success and Ready presents an identical request, reject it.
