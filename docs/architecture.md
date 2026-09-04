# Architecture

Droptron separates public launch execution from private ownership delivery.

## Product surfaces

- **Launches** separates public `Explore` from wallet-scoped creator `Manage` views. Participant routes contain terms, private participation, and device-local activity; creator routes contain deployment and settlement controls.
- **Distributions** is the creator workspace for Disperse, Airdrop, and Vesting.
- **Claims** automatically discovers airdrop tickets and vesting tranches held by the connected privacy wallet. Manual refresh exists for note maturity and transient wallet failures.
- **Wallet** prepares public and shielded assets and exposes the underlying STRK20 operations.

Creator-scoped UI is an authorization and presentation boundary, not an onchain privacy claim. Deployed contracts and their public state remain inspectable.

The role and interaction rules behind these surfaces are defined in [Product experience](product-experience.md).

## System boundary

1. **Next.js application** presents terms, performs read-only preflights, creates Wallet API requests, and indexes public product metadata.
2. **Ready wallet** owns keys, private notes, note discovery, proof generation, and STRK20 authorization.
3. **STRK20 pool** verifies private actions and invokes only the helper selected by the wallet request.
4. **Droptron contracts** enforce public sale terms, funded claim collateral, immutable unlocks, and pool-only private routes.
5. **Supabase** stores public discovery records and signed creator workspace data. It never decides whether funds can move.

## Contract composition

- `DroptronFixedSupplyToken`: conventional fixed-supply ERC-20-shaped token.
- `DroptronLaunch`: fixed-price or checked linear-curve public sale with exact funding and settlement.
- `DroptronLaunchParticipation`: pool-pinned `privacy_invoke` helper that buys from a launch and returns the allocation as an open-note deposit.
- `DroptronClaimSeries`: fully collateralized, one-to-one bearer claim ticket with immutable timing.
- `DroptronDistributionFactory`: creates ordered claim series and records the allowlist used by redemption.
- `DroptronClaimRedemption`: pool-pinned helper that burns an allowed ticket and returns underlying tokens as an open-note deposit.

Disperse uses the STRK20 pool directly and does not need a custom distribution contract.

## Launch path

The creator deploys a launch, funds the complete sale allocation, and publishes verified public metadata. A participant chooses an exact sale-token amount. Droptron checks the current quote and fee balance before asking Ready for one private action. The pool routes payment through `DroptronLaunchParticipation`; the launch executes the purchase and the helper returns the sale token to the pool as an open note.

## Airdrop and vesting path

The creator deploys and funds one claim series for an airdrop or one series per vesting tranche. Claim tickets are approved exactly, shielded, and privately delivered in an atomic batch. Public metadata publishes only the campaign and series addresses. A recipient's wallet privately discovers tickets and redeems each available one through `DroptronClaimRedemption`.

## Persistence

Starknet and STRK20 remain authoritative for value. Supabase provides:

- public launch and campaign discovery;
- cross-device creator drafts;
- transaction and deployment references;
- HTTP-only wallet sessions;
- AES-256-GCM encrypted recipient manifests.

Public campaign reads never include the plaintext recipient manifest. Creator mutations require a domain-, wallet-, network-, and expiry-bound Starknet message signature.

## Sources of truth

| State | Authority | Product index |
| --- | --- | --- |
| Launch terms, balances, totals, and settlement | Starknet launch contract | Public metadata and status projection |
| Private transfers and shielded balances | STRK20 pool and wallet state | Transaction reference only |
| Airdrop eligibility and redemption | Funded claim series and private bearer tickets | Public campaign metadata |
| Vesting unlocks and redemption | One funded claim series per tranche | Grouped schedule presentation |
| Drafts and recipient CSV parsing | Signed creator workspace | Encrypted Supabase record |

Supabase improves discovery and resumability. It never authorizes a transfer, validates a claim, or calculates a spendable private balance.

## Distribution execution invariants

- **Disperse** submits the validated recipient set as one atomic STRK20 action batch. It does not deploy a distribution contract.
- **Airdrop** uses one exactly funded claim-ticket series with an explicit unlock and optional expiry.
- **Vesting** creates one immutable claim-ticket series per tranche and presents those series as one recipient schedule.
- Recipient tables paginate in groups of ten for review only. Registration checks, totals, and execution always use the complete validated manifest.
- Funding, publication, shielding, and delivery are separate resumable stages. Retrying metadata publication cannot resend private allocations.
- Claim-ticket approvals are exact and tranche-scoped; Droptron never requests an unlimited allowance.

## Replay boundaries

One-shot private stages use a synchronous lock, an in-flight action fingerprint, persisted stage checks, and a tab-session idempotency key. These stop duplicate application submissions. Wallet Standard does not let a dapp cancel a request already displayed by a wallet, so a wallet-owned replay must still be rejected by the user. Starknet account nonces and STRK20 nullifiers constrain exact transaction or note replay onchain.
