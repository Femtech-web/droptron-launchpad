# STRK20 Privacy Integration Plan — Droptron

Generated September 1, 2026; updated September 2, 2026 after the product flow was approved. Droptron now has a Next.js app, Wallet API integration, a tested Cairo launch contract, and browser-local product drafts. Re-verify package versions and wallet capability before each privacy phase.

## 1. Project snapshot

- Stack: Next.js 16 / React 19 / TypeScript frontend; starknet.js 10.4.0 and get-starknet 6.0.3; Cairo/Scarb contracts with Starknet Foundry tests.
- Relevant code: wallet connection in `src/features/wallet/wallet-provider.tsx`, Wallet API actions in `src/features/privacy`, launch surfaces in `src/features/launches`, unified distribution creation in `src/features/distributions`, and Cairo launch logic in `contracts/src/launch.cairo`.
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

### Mainnet readiness checkpoint — September 2, 2026

- Ready Mainnet account: `0x006995eb3a05b16cf42a070792e7b4ead3cda7f5137498d9bbde3fea0a4a0cf9`.
- Droptron uses the documented Mainnet pool and the verified Lava RPC through `NEXT_PUBLIC_STARKNET_MAINNET_RPC_URL`.
- Funding and viewing-key registration have succeeded on Mainnet and are recorded in the local transaction ledger.
- Mainnet shield, private transfer, and unshield flows have succeeded and their receipts are recorded in the private transaction ledger. Phase 1 is complete for the wallet surface.
- No hash moves into `strk20.json` until it is classified against the sprint rules and selected as final evidence.
- The wallet UI reads the live pool fee before STRK shields, explains wallet confirmation when required, and reports wallet cancellation or failure through product toasts.
- Droptron now prevents rapid duplicate form submission, assigns a request ID to each Wallet API call, hides stale private values after an action, and refreshes public balances automatically.
- A withdrawal-specific balance watcher handles Ready responses that remain pending after a successful unshield, then closes the modal, reports success, and refreshes balances.

## 6. Phase 2 — launch MVP

Product IA approved September 2, 2026: navigation is Launches, Distributions, Claims, Wallet. Launches separates participant `Explore` from creator `Manage`; Distributions contains Disperse, Airdrop, and Vesting; Claims is recipient-only.

1. Implement public launch configuration and bonding-curve rules in Cairo. **Done:** the existing contract and test suite cover fixed and checked linear pricing, funding, purchase, cancellation, proceeds, recovery, token deltas, and reentrancy.
2. Design pool withdraw → launch action → shielded allocation. **Done locally.**
3. Implement and test the anonymizer, token validation, and atomic rollback. **Done locally:** the helper is pinned to one pool, verifies the launch token pair, measures payment/output deltas, approves pool collection, and can return unused maximum payment to a separate private note. It remains review-required and undeployed.
4. Clearly separate public launch data from private participation in the UI. **Done for the launch-detail surface:** participants enter sale-token amount, receive a live quote, run wallet simulation, and then submit one atomic Wallet API action group once a reviewed helper address is configured.

App progress: creator and participant views are separated; the launch detail can deploy the configured class and atomically approve/fund the allocation. Private participation is wired but remains safely blocked until the team-owned helper and launch class are reviewed, deployed, and configured. Public Explore now reads a canonical Supabase launch registry; publication is accepted only after the server verifies the class, creator, token pair, and funded state against Starknet. Migration `202609030003_launch_publication.sql` must be applied before this registry can be tested.

### Mainnet DROP pre-deployment checkpoint — September 3, 2026

- The reusable fixed-supply template lets a creator choose token name, symbol, decimals, supply, and treasury. DROP will be the team's first product-test instance through the same creator flow.
- Only `NEXT_PUBLIC_MAINNET_ADMIN_ADDRESS` can register the shared template. After registration, launch creators can deploy their own instances through the New Launch flow.
- Read-only estimation must succeed before declaration or deployment is offered. The UI shows the exact next step, estimated fee, public STRK balance, hashes, and deterministic deployment address when available.
- `NEXT_PUBLIC_MAINNET_TOKEN_CREATION_STAGE=locked` is the final safety lock. It unlocks only the separately approved `declare` or `deploy` stage, so template-registration approval cannot authorize a later token deployment.
- Each created token is recorded locally and selected in the launch form. After the first DROP instance is reviewed, `NEXT_PUBLIC_MAINNET_DROP_TOKEN_ADDRESS` becomes its durable cross-device wallet configuration.
- Latest read-only template estimate: class `0x512a4edf0df6d870636958f51fa296e9b71b69852c97ed28730380a304e93a9`, approximately 25.971 STRK to register at the time checked. No transaction was submitted.

## 7. Phase 3 — private distribution, airdrop claim, and multi-tranche vesting

Storage decision: Starknet contracts remain canonical for funding, schedules, and claim validity. Browser local storage is sufficient for current drafts; Supabase/Postgres may later index public metadata, contract addresses, branding, and transaction status, but never viewing keys, notes, proofs, or authoritative private allocations. See `PRODUCT_ARCHITECTURE.md`.

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
