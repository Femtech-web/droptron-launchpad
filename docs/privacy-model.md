# Privacy model

Droptron protects the relationship between a wallet and its allocation. It does not claim to hide the entire market.

## Private

- Parties, token, and amount inside STRK20 private transfers.
- Shielded token balances and private note ownership.
- Airdrop and vesting ticket ownership.
- The link between a public launch participant and the allocation they receive.
- Recipient delivery inside an atomic private distribution batch.

## Public

- Launch contract, sale token, payment token, price model, schedule, and caps.
- Aggregate sold and raised values exposed by the launch.
- Vesting unlock schedule and claim-series terms.
- Shield and unshield wallet address, token, amount, and timing.
- Deployed contracts and transaction inclusion.

## Key custody

Ready owns the user's viewing key, notes, private-balance discovery, and proof generation. Droptron uses the STRK20 Wallet API and never asks for or stores a viewing key, recovery phrase, private key, note registry, or prover configuration.

## Claims

An airdrop or vesting entitlement is represented by a private bearer ticket. The creator privately delivers it; the holder later spends it through the pool-pinned redemption helper. The ticket burn and STRK20 nullifier prevent the same note from being claimed twice. The helper returns the underlying token as a new shielded note.

## Product language

Use “private participation,” “shielded allocation,” “private distribution,” and “private claim.” Do not describe Droptron as a private exchange, a hidden bonding curve, or a fully confidential launch.
