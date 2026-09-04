# Security policy

## Supported version

Droptron is currently hackathon-stage and unaudited. Security fixes are applied to the latest commit on `main`; older commits and independent deployments are not maintained as supported releases.

## Report a vulnerability

Please use GitHub's **Report a vulnerability** option in the repository Security tab so the report starts as a private security advisory. Do not open a public issue with exploit details. If private reporting is unavailable, open a minimal issue asking the maintainers for a secure contact channel without including technical details.

Include, where possible:

- the affected commit, network, and contract address;
- a minimal reproduction or transaction sequence;
- the expected and observed behavior;
- the impact on funds, authorization, privacy, or availability;
- transaction hashes or logs that contain no wallet secrets or private recipient data;
- a suggested remediation, if known.

Useful report areas include Cairo contracts, pool-pinned helpers, exact approvals, claim collateral, creator authorization, encrypted persistence, wallet request replay, and inaccurate privacy claims.

## Testing safely

- Do not test against accounts or contracts you do not own or have permission to assess.
- Never send private keys, seed phrases, viewing keys, decrypted notes, or prover material.
- Verify the network, contract, spender, amount, and live fee before signing.
- Use local tests or deliberately small Mainnet values until the contracts receive an independent audit.

The current security assumptions and known wallet boundaries are documented in [Testing and safety](docs/testing-and-safety.md) and [Wallet integration](docs/wallet-integration.md).
