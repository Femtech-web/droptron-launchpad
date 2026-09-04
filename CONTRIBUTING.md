# Contributing to Droptron

Thank you for helping improve Droptron. Contributions should keep the product understandable to teams, safe to test, and precise about what STRK20 does and does not make private.

## Before you begin

- Read the [project overview](README.md), [architecture](docs/architecture.md), and [privacy model](docs/privacy-model.md).
- For a substantial contract, persistence, or privacy-boundary change, open an issue first so the design can be discussed before implementation.
- Small fixes, tests, documentation improvements, and accessibility corrections can go directly to a focused pull request.
- Use local development or deliberately small Mainnet values. Never use funds you cannot afford to lose.

## Local setup

You need Node.js 20+, npm, Scarb 2.20.1, and Starknet Foundry 0.63.0.

```bash
git clone https://github.com/Femtech-web/droptron-launchpad.git
cd droptron-launchpad
npm ci
cp .env.example .env.local
npm run dev
```

The application can render without shared persistence, but creator sessions, cross-device drafts, encrypted recipient manifests, and public discovery require Supabase. Follow [supabase/README.md](supabase/README.md) when working on those paths.

## Where to work

| Area | Location | Read first |
| --- | --- | --- |
| Product pages and APIs | `src/app/` | [Product experience](docs/product-experience.md) |
| Wallet and private flows | `src/features/privacy/`, `src/features/wallet/` | [Wallet integration](docs/wallet-integration.md) |
| Launches, distributions, and claims | `src/features/` | [Architecture](docs/architecture.md) |
| Cairo contracts | `contracts/src/` | [Contract reference](contracts/README.md) |
| Persistence and migrations | `src/lib/`, `supabase/` | [Supabase setup](supabase/README.md) |

## Development principles

- **Keep the privacy boundary exact.** Do not describe public deposits, contract configuration, aggregate activity, or transaction inclusion as private.
- **Treat onchain state as authoritative for value.** Supabase is for discovery and resumability; it must not authorize funds or claims.
- **Use exact amounts.** Preserve token decimals and integer base-unit arithmetic. Do not approximate financial values with floating-point math.
- **Keep creator and participant surfaces separate.** Creator controls must not leak into participant views, and private participant activity must not appear in creator views.
- **Name the next action.** Buttons and preflight messages should tell users whether they will shield, wait, approve, deliver, claim, or complete an action in their wallet.
- **Make completed actions terminal.** State-changing handlers need persisted-stage checks, an in-flight guard, and the relevant replay or idempotency control.
- **Update the explanation with the implementation.** A change to a contract, privacy claim, wallet flow, deployment, or operational assumption should update the corresponding document.

## Validate your change

Run the same full quality gate used by CI:

```bash
npm run verify
```

This type-checks and builds the Next.js application, builds the Cairo package, and runs the Starknet Foundry suite. During development you can run narrower checks:

```bash
npm run typecheck
npm run build
npm run contracts:build
npm run contracts:test
```

Add focused coverage in proportion to the change. Contract value paths, authorization, pricing, note flows, claim redemption, and persisted workflow transitions require tests; visual changes should include before-and-after screenshots at relevant viewport sizes.

## Pull requests

Keep each pull request focused and explain:

- the user or protocol problem;
- the chosen behavior and its privacy implications;
- how it was verified;
- any migration, deployment, configuration, or documentation change.

The repository's pull-request template contains the final checklist. The pre-push hook uses the full gate when the Cairo toolchain is installed and otherwise runs the web checks locally. GitHub Actions always runs the complete web and Cairo quality gate for every pull request and push to `main`; maintainers should require that check through branch protection.

## Secrets and recipient data

Never commit `.env.local`, account keys, seed phrases, viewing keys, decrypted notes, prover secrets, service-role credentials, or plaintext production recipient manifests. Use `.env.example` for variable names and non-secret placeholders only.

## Security reports

Do not disclose a suspected vulnerability in a public issue. Follow the private reporting process in [SECURITY.md](SECURITY.md).
