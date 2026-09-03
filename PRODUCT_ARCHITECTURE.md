# Droptron product architecture

## Product surfaces

- **Launches** — participant `Explore` and creator `Manage` views. A launch sells one ERC-20 for another.
- **Distributions** — one creator workspace for Disperse, Airdrop, and Vesting.
- **Claims** — recipient-only surface for airdrops and unlocked vesting tranches. Disperse has no claim.
- **Wallet** — public and private asset preparation and movement.

## Launch visibility

- **Explore is public.** Anyone can browse, search, and filter live Droptron launches without connecting a wallet. A compatible wallet is required only when they participate.
- **Manage is creator-scoped.** After connecting, creators see only launches and tokens created by that wallet on the active network.
- **On-chain data is public.** Creator-scoped means the product UI is filtered; it does not make deployed contracts or token addresses private.

The browser-only MVP can show drafts created on the same device. Cross-user Explore requires a public metadata index (for example Supabase fed by confirmed deployment transactions, or a Starknet indexer). The contracts and verified on-chain events remain authoritative; the index exists for discovery, search, and presentation.

## Sources of truth

Contract-critical state belongs on Starknet. A database may improve discovery and drafts, but it must never decide whether funds can move or whether a claim is valid.

| Data | Canonical location | Optional product index |
| --- | --- | --- |
| Launch terms, balances, sold/raised totals, owner controls | Launch contract | Public metadata mirror |
| Disperse token movement | STRK20 pool transaction and events | Name, status, transaction hash |
| Airdrop eligibility and claimed state | Entitlement/claim contracts and spent private notes | Public campaign metadata |
| Vesting schedule, tranche unlocks and redemption state | Vesting-ticket and redemption contracts | Public schedule metadata |
| Draft forms and CSV parsing | Browser during MVP | Authenticated database later |

## Database decision

Supabase/Postgres is the product-data layer for shared discovery, creator dashboards, branded claim URLs, and resumable cross-device drafts. It stores public metadata, contract addresses, transaction hashes, status projections, and optional branding. It never stores wallet private keys, viewing keys, decrypted private balances, notes, proofs, or plaintext private recipient allocations as the production source of truth.

The schema and RLS boundary live in `supabase/migrations`. Browser storage remains a temporary fallback until the Starknet wallet-signature session is connected; remote creator writes must never trust an unverified address supplied by the browser.

## Distribution execution

- **Disperse:** no Droptron distribution contract is required for the first MVP. Droptron passes the recipient transfers together in one `wallet_strk20InvokeTransaction` action array, producing one atomic wallet confirmation for an accepted batch. It must run the read-only simulated preparation first. If Starknet or wallet limits reject the batch size, Droptron calculates the smallest required chunks and shows the exact confirmation count before submission; it never prompts once per recipient.
- **Airdrop:** requires a team-owned entitlement/claim contract plus the STRK20 private-action route. The contract enforces campaign timing, funding, replay protection, pause, and recovery.
- **Vesting:** requires team-owned tranche/ticket and redemption contracts. The contract enforces the schedule and prevents early or duplicate redemption.

Airdrop and vesting recipient allocations are committed and funded as sets rather than through one wallet request per recipient. Large-list simulation, fee estimates, calldata limits, duplicate-address checks, token-balance checks, and a final recipient/total review are required before the wallet opens.

Any production anonymizer or claim contract is owned by the Droptron team and needs independent review and audit before meaningful Mainnet value.

## Privacy boundary

The wallet owns viewing keys, private notes, discovery, and proof generation. Droptron asks the wallet to perform supported actions and never receives those secrets. Public deposit/withdrawal legs and public application configuration remain visible; private note transfers hide their parties, token, amount, and spent notes.
