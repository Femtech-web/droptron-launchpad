# STRK20 Privacy Integration Plan — Droptron

Generated September 1, 2026. Droptron is greenfield: no application code, wallet module, Cairo project, or backend exists yet. Re-verify package versions and wallet capability before coding.

## 1. Project snapshot

- Stack: proposed Next.js/TypeScript frontend; Cairo/Scarb contracts with Starknet Foundry tests.
- Relevant code: none yet; wallet connection, transaction, UI, and contract modules are to be created.
- Privacy goal: hide the user identity behind launch participation and private entitlement-note redemption for airdrops and multi-tranche vesting; protect private allocations/distributions and shielded balances; never claim a confidential bonding curve.
- Environment: local tests for logic; Starknet mainnet for final integration and scoring; Ready extension first.

## 2. Chosen route: Wallet API plus app-specific anonymizer

Droptron is a Starknet dapp with its own launch and vesting contracts. Users act through a privacy-enabled wallet using `starknet.js`; Droptron-specific launch, disperse, and vesting actions need a team-owned Cairo anonymizer called with `privacy_invoke`.

**Rule:** Droptron never touches a user's viewing key. The wallet handles keys, notes, proof generation, and pool interaction.

## 3. What this delivers

| Private | Public |
| --- | --- |
| Private-note transfer parties, amount, and token | Shield/unshield address, token, amount, and timing |
| User address behind an anonymized launch action | Launch activity, bonding-curve price/action, and possibly action amount |
| Shielded allocation/distribution balances and entitlement-note ownership | Public launch/vesting configuration, tranche unlock timing, and redemption activity/amount where exposed |

This delivers participant/address privacy, shielded balances, and private airdrop/multi-tranche-vesting redemption through privately delivered entitlement notes. It does not hide curve pricing or public contract activity, and it does not claim an FHE-style confidential computation model.

## 4. Prerequisites

- Pin an STRK20-compatible `starknet` release (at least v10.4.0 after re-checking).
- Pin `@starknet-io/get-starknet-discovery@6.0.3`, `@starknet-io/get-starknet-wallet-standard@6.0.3`, and `@starknet-io/types-js@0.10.3`.
- Select and pin Scarb and Starknet Foundry versions when initializing Cairo.
- Use Ready for initial privacy-wallet tests; store a mainnet RPC URL only in an environment variable.

## 5. Phase 1 — first shielded flow

1. Create the Next.js app and wallet-connection module.
2. Connect using get-starknet v6 and `WalletAccountV6` according to the current guide.
3. Add no-data capability detection and an unsupported-wallet fallback.
4. Add honestly-labelled shield, private transfer, and unshield interfaces.
5. Verify with Ready and the wallet test dapp.

## 6. Phase 2 — launch MVP

1. Implement public launch configuration and bonding-curve rules in Cairo.
2. Design pool withdraw → launch action → shielded allocation.
3. Implement and test the anonymizer, token validation, and atomic rollback.
4. Clearly separate public launch data from private participation in the UI.

## 7. Phase 3 — private distribution, airdrop claim, and multi-tranche vesting

1. Add private disperse for team or treasury distributions.
2. Add entitlement-token issuance: eligibility is verified offchain, then the recipient receives a private STRK20 entitlement note.
3. Add private airdrop redemption: the user spends the entitlement through the anonymizer, which burns it and re-shields launch-token output.
4. Add a vesting-ticket factory: one ERC-20 entitlement series per scheduled unlock tranche, each bound to an unlock time and launch-token conversion rate.
5. Privately distribute each beneficiary's tranche tickets and enforce each tranche's unlock time before the same private redemption path.
6. Test duplicate claims, early claims, wrong ticket/token, cross-tranche redemption, authorization, and full rollback; review and audit before meaningful mainnet value.

## 8. Linear-like vesting cadence

The MVP supports a discrete multi-tranche schedule. Product configuration selects the cadence (for example monthly or weekly); it must be described as scheduled tranches, not continuous linear vesting. Continuous per-second vesting remains out of scope until a separate residual-entitlement architecture is specified and audited.

## 9. Testing and security

- Local tests cover frontend and Cairo logic; they are insufficient for the complete wallet/proving/pool path.
- Test wallet operations with Ready, then execute small-value mainnet flows early.
- Test atomicity: success re-shields output; every failure fully rolls back.
- STRK20 screening is enforced onchain. Droptron owns contract review, audit, deployment, maintenance, and product compliance decisions.
- Never commit keys, viewing keys, or RPC credentials.

## 10. Re-check at build time

- Wallet support, package versions, pool fee/maturity behavior, and first-party integrations.
- Audit ownership, budget, and timing.
- Exact ticket-factory interface, selected vesting cadence, and whether all MVP contract paths fit the audit timeline.

## 11. Links

- https://strk20-by-example.org/what-is-strk20
- https://strk20-by-example.org/starknet-wallet-api/overview
- https://strk20-by-example.org/starknet-wallet-api/starknet-js
- https://strk20-by-example.org/helpers/privacy-invoke
- https://strk20.starknet.io/hackathon
