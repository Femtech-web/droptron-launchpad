# Droptron contracts

This package contains Droptron's team-owned Starknet contracts.

Current milestone: fixed-price and checked linear-curve launches, a configurable fixed-supply token, private STRK20 participation, funded claim tickets, scheduled vesting tranches, and private claim redemption. Math, boundary, integration, rollback, and malicious-token tests cover these contracts. Quotes use 512-bit multiplication before division and reject results that cannot fit into `u256`. Every value-bearing token movement verifies exact balance deltas, so fee-on-transfer, lying-return-value, and rebasing behavior is rejected.

`MockToken`, `ReentrantToken`, `MockClaimAsset`, and `MockClaimPool` live under `src/mocks/`. They exist only for Starknet Foundry tests and are excluded from the product deployment runway.

`DroptronFixedSupplyToken` is Droptron's reusable fixed-supply ERC-20-shaped template. Creators choose a name, symbol, decimals (up to 18), total supply, and receiving treasury. DROP uses this same creator flow for the team's first product test.

`DroptronLaunchParticipation` is the wallet-mediated private purchase helper. It accepts calls only from its constructor-pinned STRK20 pool, verifies that supplied token addresses match the selected launch, executes `buy_exact_sale`, measures actual balance deltas, and approves the pool to collect the purchased allocation into an open note. An optional second open note can receive unused maximum payment.

The seven production files completed a targeted AI-assisted review and its identified issues were fixed. This is not an independent audit. The owner accepted only limited-value hackathon Mainnet usage; broader or meaningful-value use still requires an independent audit and live pool-path validation.

```bash
scarb build
snforge test
```

Pinned toolchain:

- Scarb 2.20.1
- Starknet Foundry 0.63.0
- Cairo/Starknet dependency 2.20.0

No deployment account secret is stored in this repository. The private `/app/admin/deployment` runway uses the connected Ready account, requires the signed Mainnet admin session, and exposes each estimate and transaction as a separate approval.

Pricing kinds:

- `0`: fixed price; `slope_wad` must be zero.
- `1`: linear curve; `slope_wad` must be greater than zero.

Launch status values returned by `get_state()`:

- `0`: awaiting funding
- `1`: funded and scheduled
- `2`: active
- `3`: closed, sold out, or at the raise limit
- `4`: cancelled
# Distribution contracts

- `DroptronClaimSeries` is a fixed, fully funded one-to-one claim-ticket series. Its creator cannot add supply or recover a non-expiring vesting reserve.
- `DroptronDistributionFactory` deploys the immutable Airdrop or Vesting tranche series and records them for the redemption allowlist.
- `DroptronClaimRedemption` is the STRK20 pool-only helper that burns factory-issued tickets and returns underlying tokens to an open note.
- Disperse is an atomic STRK20 transfer batch and needs no Droptron contract.

All contracts under `src/mocks/` are local test fixtures and are never included in the Mainnet deployment plan.
