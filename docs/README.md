# Droptron documentation

These references explain the product boundary, the contracts behind it, and the operating assumptions contributors need before changing a value or privacy-sensitive path. The shorter product-facing guide is available at `/docs` in the Next.js application.

## Choose a path

| If you want to… | Start here |
| --- | --- |
| Change a creator or participant workflow | [Product experience](product-experience.md) |
| Understand the system and source of truth | [Architecture](architecture.md) |
| Integrate or debug a privacy wallet action | [Wallet and STRK20 integration](wallet-integration.md) |
| Review exactly what is private | [Privacy model](privacy-model.md) |
| Review signing and fund-protection controls | [Security controls](security-controls.md) |
| Reproduce or extend the project | [Contributing](../CONTRIBUTING.md) and the root [README](../README.md) |
| Validate a change safely | [Testing and safety](testing-and-safety.md) |
| Verify the deployed product | [Mainnet evidence](mainnet-evidence.md) |
| See what comes after the hackathon | [Roadmap](roadmap.md) |

## Reference

- [Architecture](architecture.md) — system boundaries, contracts, execution paths, persistence, and replay controls.
- [Product experience](product-experience.md) — creator and participant surfaces, next-action behavior, and privacy-aware UX rules.
- [Privacy model](privacy-model.md) — what Droptron protects, what remains public, and who holds privacy keys.
- [Security controls](security-controls.md) — signed sessions, approval scope, contract invariants, review evidence, and residual risks.
- [Mainnet evidence](mainnet-evidence.md) — deployed contracts, product transactions, and remaining demonstrations.
- [Wallet and STRK20 integration](wallet-integration.md) — capability checks, registration, preflight, fees, and confirmations.
- [Testing and safety](testing-and-safety.md) — local verification, Mainnet policy, completion guards, and review status.
- [Roadmap](roadmap.md) — focused post-hackathon priorities for production readiness, assets, wallets, and creator operations.
- [Contract reference](../contracts/README.md) — Cairo packages, entrypoints, invariants, and test coverage.
- [Persistence setup](../supabase/README.md) — migrations, environment configuration, sessions, and encrypted manifests.

Security reports follow [SECURITY.md](../SECURITY.md), not public issues.
