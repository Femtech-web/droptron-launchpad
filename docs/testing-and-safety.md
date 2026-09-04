# Testing and safety

## Local verification

```bash
npm ci
npm run verify
```

`npm run verify` type-checks and builds the Next.js application, builds the Cairo package, and runs the complete Starknet Foundry suite. The Cairo tests cover fixed and linear pricing, decimal normalization, overflow rejection, funding and settlement, allocation and raise caps, cancellation, exact token deltas, malicious token behavior, reentrancy, claim funding, early and duplicate claims, wrong ticket/token attempts, atomic rollback, and collateral conservation.

## Change expectations

| Change | Minimum verification |
| --- | --- |
| Copy, docs, or styling | Typecheck or build as applicable, responsive review, and link check |
| Wallet or private action | Rejection, timeout, success, account/network change, maturity, and duplicate-attempt states |
| API, session, or persistence | Authorization boundary, invalid input, missing configuration, and retry behavior |
| Cairo value path | Focused positive, failure, boundary, and rollback tests plus the full suite |
| Deployment or environment | Guarded script dry run where available and updated operational documentation |

## Automated quality gates

- Husky runs TypeScript validation before a commit. Before a push it runs the full verification command when Scarb and Starknet Foundry are available; otherwise it runs the web gate and explains that CI still owns the mandatory contract gate.
- GitHub Actions independently runs the quality gate for every pull request and every push to `main`.
- Repository maintainers should require the **Quality gate** status check through branch protection; a workflow file alone does not prevent a failing merge.
- Vercel uses `npm ci` and `npm run build`; it does not install Git hooks or require the Cairo toolchain during a web deployment.

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

The seven production Cairo modules received targeted AI-assisted review across authorization, reentrancy, arithmetic, exact token accounting, claim collateral, allowance lifetime, lifecycle transitions, and rollback behavior. Identified issues were fixed and the complete 69-test suite passes.

This is an internal review record, not an independent audit or certification. An external audit and live adversarial review are required before meaningful Mainnet value. See [Security controls](security-controls.md) for the implemented controls, evidence, and remaining trust assumptions.
