# Roadmap

Droptron already provides one working Mainnet path from token creation and public sale through private participation, direct distribution, airdrop claims, and vesting. This roadmap records the next product investments rather than promising dates or unfinished features.

## What already works

Launch contracts accept a configurable Starknet ERC-20 payment token and normalize prices using that token's decimals. STRK is the payment asset proven in the current Mainnet launch; it is not a protocol-level restriction. Distribution and shielding flows likewise operate on supported Starknet ERC-20 assets, while STRK remains the live STRK20 pool-fee asset.

Non-standard assets with fee-on-transfer, rebasing, or inconsistent balance behavior are intentionally rejected by exact-balance checks.

## Production readiness

- Commission an independent Cairo and application security audit before supporting meaningful value.
- Add deployment monitoring, contract-event alerts, incident procedures, and a documented migration policy.
- Move creator administration behind multisig or role-based treasury controls rather than relying on one operator wallet.
- Add end-to-end tests against a controlled Mainnet staging campaign and retain reproducible release evidence.

## Asset support

- Prove a stablecoin-denominated launch on Mainnet, beginning with USDC when its STRK20 path and token address are verified.
- Add a reviewed token registry with symbol, decimals, logo, pool compatibility, and clear custom-token warnings.
- Preflight public balance, private balance, allowance, pool support, and fee requirements before every wallet request.
- Show the sale asset, payment asset, and STRK privacy fee separately so a non-STRK sale never implies that fees are paid in the sale token.

## Wallet and privacy experience

- Support additional wallets only when they advertise the required STRK20 Wallet API capabilities; keep Ready as the tested baseline until then.
- Add user-controlled encrypted export and restore for wallet-scoped purchase references without sending viewing keys or decrypted note data to Droptron.
- Explore sponsored fees and relayer improvements so recipients can claim without first managing a private STRK fee balance.
- Evaluate shadow accounts after the API, wallet rollout, deployments, and security posture are stable enough for production use.

## Creator operations

- Add privacy-preserving aggregate analytics for sale progress, distribution completion, outstanding claims, and vesting liability without constructing a recipient ownership graph.
- Add resumable, chunked delivery for large recipient manifests with deterministic reconciliation and no double delivery.
- Provide signed CSV/API exports for finance teams and an SDK for projects that want to embed Droptron's launch and distribution workflows.
- Add configurable claim reminders and expiry notices that do not reveal recipient allocations publicly.

## Longer-term reach

- Connect cross-chain stablecoin funding through reviewed privacy-bridge infrastructure when its production assumptions are acceptable.
- Support reusable launch templates and treasury policies for communities, grants, contributor allocations, and ecosystem campaigns.
- Publish versioned contract interfaces and integration examples so other Starknet products can build on Droptron's pool-pinned helpers and claim-ticket model.

Roadmap work must preserve the boundaries in the [privacy model](privacy-model.md) and satisfy the release checks in [testing and safety](testing-and-safety.md). Features that weaken custody, introduce public recipient mappings, or overstate what STRK20 hides are out of scope.
