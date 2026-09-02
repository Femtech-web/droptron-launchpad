# Droptron contracts

This package contains Droptron's team-owned Starknet contracts.

Current milestone: fixed-price and checked linear-curve public launch pricing plus a fixed-supply Sepolia integration token, covered by 29 math, token, boundary, integration, and malicious-token tests. Quotes use 512-bit multiplication before division and reject results that cannot fit into `u256`. Incoming payment and outgoing sale-token balance deltas must match the quote exactly, so fee-on-transfer and rebasing behavior is rejected.

`MockToken` and `ReentrantToken` exist only for Starknet Foundry tests and must never be deployed as product contracts.

`DroptronDemoToken` is the fixed-supply ERC-20-shaped asset used only for Sepolia launch integration. Its constructor creates the complete supply once for the selected recipient; it exposes no public mint function. It is not a production asset. A Mainnet token requires a separate supply decision, a standard audited implementation, and independent review.

```bash
scarb build
snforge test
```

Pinned toolchain:

- Scarb 2.20.1
- Starknet Foundry 0.63.0
- Cairo/Starknet dependency 2.20.0

No deployment profile or account secret is stored in this repository. Sepolia deployment starts only after independent contract review.

Pricing kinds:

- `0`: fixed price; `slope_wad` must be zero.
- `1`: linear curve; `slope_wad` must be greater than zero.

Launch status values returned by `get_state()`:

- `0`: awaiting funding
- `1`: funded and scheduled
- `2`: active
- `3`: closed, sold out, or at the raise limit
- `4`: cancelled
