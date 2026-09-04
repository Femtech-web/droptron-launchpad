# Security controls

Droptron uses independent controls across the browser, server, wallet, persistence layer, and Cairo contracts. They reduce unauthorized access, unintended approvals, duplicate submissions, and fund-accounting errors. They do not make unaudited software risk-free or guarantee that funds can never be lost.

## Control layers

| Layer | Implemented control | Security purpose |
| --- | --- | --- |
| Wallet custody | Ready retains account keys, viewing keys, private notes, proof secrets, and proof generation | Droptron cannot sign a transaction or reconstruct private wallet state on the user's behalf |
| Workspace authentication | Starknet typed-data challenge bound to purpose, origin, chain, wallet, nonce, and expiry | Prevents a browser from self-asserting ownership of a creator address |
| Session handling | Single-use five-minute challenge; random 256-bit session token; hashed database value; `HttpOnly`, `SameSite=Lax`, production `Secure` cookie; logout revocation | Limits challenge replay and keeps the reusable session credential out of client JavaScript and plaintext storage |
| Server authorization | Creator mutations load the signed wallet session and scope records by wallet identity | Stops one signed workspace from reading or updating another creator's private drafts |
| Onchain publication checks | Launch and campaign APIs verify class or factory membership, owner, token addresses, and funded state against Starknet | Prevents database metadata from presenting an unrelated or unfunded contract as a valid Droptron product |
| Recipient storage | Recipient manifests are removed from ordinary JSON and encrypted server-side with AES-256-GCM and authenticated additional data | Avoids storing creator recipient lists as readable application metadata and detects ciphertext tampering |
| Wallet preflight | Network, account, capability, live fee, token decimals, private balance, recipient registration, and note maturity checks | Reduces incorrect or predictably failing wallet requests; these checks are usability safeguards, not contract authorization |
| Approval scope | Exact token or claim-ticket amount, configured spender, tranche-scoped approvals, and zeroing of temporary launch allowance | Limits exposure compared with unlimited or lingering approvals |
| Request replay | Synchronous handler locks, in-flight action fingerprints, account-scoped one-shot keys, session storage, and persisted workflow stages | Prevents rapid clicks, remounts, and completed application stages from intentionally opening another wallet request |
| Contract authorization | Owner-only creator operations; constructor-pinned STRK20 pool callers; factory allowlist for redeemable claim series | Restricts settlement and private helper entrypoints to their intended authority |
| Contract accounting | Exact funding and payout balance deltas, sale and raise caps, buyer maximum payment, fully collateralized tickets, reserve checks, burn-before-payout, and transactional rollback | Rejects short transfers, unsupported token behavior, unbacked claims, overselling, and partial state changes |
| Contract execution | Reentrancy locks around value-bearing launch and claim paths | Prevents malicious token callbacks from entering the same operation twice |
| Arithmetic | Decimal bounds, checked `u256` operations, and 512-bit multiplication before division | Prevents silent overflow and incorrect quote truncation |

## Creator session sequence

1. The server creates and stores a random, expiring challenge for the normalized wallet, chain, and request origin.
2. Ready shows the typed-data request and the connected account signs it.
3. The server verifies the exact typed data through Starknet, then atomically marks the challenge consumed.
4. A new random session token is issued as an `HttpOnly` cookie; only its hash is stored.
5. Every creator API request resolves the active, unrevoked session and scopes access to that wallet identity.
6. Account or network changes no longer match the session and require a fresh signature. Logout revokes it.

This signature cannot approve, transfer, shield, or spend a token. Every value-moving operation remains a separate wallet transaction with its own review screen.

## Contract fund-flow invariants

### Launches

- Only the configured owner can fund, cancel, withdraw proceeds, or recover unsold inventory.
- Funding must increase the contract balance by the exact sale allocation.
- Purchases enforce the active time window, remaining allocation, raise cap, current quote, and buyer-provided maximum payment.
- Both incoming payment and outgoing sale-token deltas must match exactly.
- Cancellation is unavailable after a purchase, and settlement is unavailable before close.

### Private participation

- The helper accepts `privacy_invoke` only from the pool fixed at construction.
- Payment and sale tokens must match the selected launch.
- The helper measures the amount paid and received rather than trusting return values.
- The launch allowance is reset to zero after purchase; purchased tokens and any refund are approved back to the pool as explicit open-note outputs.

### Airdrops and vesting

- Tickets are minted only after the series receives the exact underlying allocation.
- Each ticket unit is backed one-to-one by the same unit of underlying token.
- Redemption burns tickets, reduces the reserve, and verifies the exact recipient payout.
- Only series created by the configured Droptron factory can use private redemption.
- Expiring airdrops can be recovered only after expiry. Non-expiring vesting reserves cannot be recovered by the creator.
- A failure in transfer, burn, approval, helper invocation, or pool output reverts the complete Starknet transaction.

## Review and test evidence

Seven production Cairo modules—fixed-supply token, math, launch, launch participation, claim series, distribution factory, and claim redemption—received a targeted AI-assisted security review. Identified issues were corrected, and the Starknet Foundry suite currently contains 69 passing tests.

Coverage includes owner and pool authorization, pricing and decimal boundaries, overflow rejection, caps and timing, exact token deltas, malicious return values, reentrant tokens, funding and reserve conservation, early and duplicate claims, wrong series and token attempts, allowance cleanup, and atomic rollback after downstream failure.

This was an internal, AI-assisted review rather than an independent professional audit. There is no claim of formal audit certification. Meaningful-value production use still requires an independent audit, live adversarial testing against the deployed pool path, monitoring, incident procedures, and a deliberate upgrade or migration strategy.

## Residual risks and user responsibility

- A wallet owns its confirmation window. Droptron cannot close or cancel an already displayed request through Wallet Standard.
- Browser idempotency reduces application resubmission but is not a protocol-level semantic nonce. Users must reject an identical wallet prompt after Droptron reports success.
- Public shielding and unshielding remain visible and can be correlated by timing or distinctive amounts.
- AES-256-GCM protects stored manifests only while the server encryption key and authorized server environment remain secure.
- Exact approvals limit token exposure, but users must still verify the network, contract, spender, amount, and fee in their wallet.
- The current contracts are unaudited and should be used only with deliberately limited value.

See [Wallet integration](wallet-integration.md), [Testing and safety](testing-and-safety.md), and the vulnerability reporting process in [`SECURITY.md`](../SECURITY.md).
