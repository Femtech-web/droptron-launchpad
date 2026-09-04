# Testing and safety

## Local verification

```bash
npm run build

cd contracts
scarb build
snforge test
```

The Cairo suite covers fixed and linear pricing, decimal normalization, overflow rejection, funding and settlement, allocation and raise caps, cancellation, exact token deltas, malicious token behavior, reentrancy, claim funding, early and duplicate claims, wrong ticket/token attempts, atomic rollback, and collateral conservation.

## Mainnet policy

- Use deliberately small values.
- Verify network, contract address, spender, amount, and fee before approval.
- Do not retry a wallet action merely because the browser request times out; verify state first.
- Wait for note maturity before spending newly shielded funds.
- Keep deployment keys and server secrets out of client variables and source control.
- Treat the current code as unaudited hackathon software.

## Completion guards

Transactional controls are removed or disabled when their persisted stage completes. Their handlers independently recheck stage and an in-flight lock. One-shot private creator stages also use a session idempotency key. These defenses prevent stale renders, rapid clicks, and remounts from intentionally opening a second application request.

They cannot dismiss a wallet-owned popup or prevent a wallet from constructing a fresh semantic replay. Starknet nonces and STRK20 note nullifiers protect exact transaction and note reuse. A future protocol revision can add a salted, one-time intent commitment for stronger contract-level semantic replay protection.

## Review status

The production Cairo files received targeted AI-assisted review and the identified issues were fixed. This is not an independent audit. An external audit and live adversarial review are required before meaningful Mainnet value.
