# Droptron contracts

This package contains Droptron's team-owned Starknet contracts.

Current milestone: fixed-price and checked linear-curve public launch pricing, a configurable fixed-supply token, and a draft STRK20 launch-participation helper, covered by math, token, boundary, integration, and malicious-token tests. Quotes use 512-bit multiplication before division and reject results that cannot fit into `u256`. Incoming payment and outgoing sale-token balance deltas must match the quote exactly, so fee-on-transfer and rebasing behavior is rejected.

`MockToken` and `ReentrantToken` exist only for Starknet Foundry tests and must never be deployed as product contracts.

`DroptronFixedSupplyToken` is Droptron's reusable fixed-supply ERC-20-shaped template. Creators choose a name, symbol, decimals (up to 18), total supply, and receiving treasury. DROP will use this same creator flow for the team's first product test. The template still requires independent review before Mainnet deployment.

`DroptronLaunchParticipation` is the wallet-mediated private purchase helper. It accepts calls only from its constructor-pinned STRK20 pool, verifies that supplied token addresses match the selected launch, executes `buy_exact_sale`, measures actual balance deltas, and approves the pool to collect the purchased allocation into an open note. An optional second open note can receive unused maximum payment. This contract is a review-required draft and must not be declared on Mainnet until the launch/helper pair receives independent security review.

```bash
scarb build
snforge test
```

Pinned toolchain:

- Scarb 2.20.1
- Starknet Foundry 0.63.0
- Cairo/Starknet dependency 2.20.0

No deployment profile or account secret is stored in this repository. Mainnet submission remains feature-flagged off until the reviewed estimate is explicitly approved.

Pricing kinds:

- `0`: fixed price; `slope_wad` must be zero.
- `1`: linear curve; `slope_wad` must be greater than zero.

Launch status values returned by `get_state()`:

- `0`: awaiting funding
- `1`: funded and scheduled
- `2`: active
- `3`: closed, sold out, or at the raise limit
- `4`: cancelled
