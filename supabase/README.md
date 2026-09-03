# Droptron persistence

Supabase stores product metadata and cross-device drafts. Starknet contracts and verified events remain authoritative for token ownership, launch balances, participation, distributions, and claims.

## Setup

1. Create or select a Supabase project.
2. Copy its project URL, publishable key, server secret key, and a random 32-byte manifest-encryption key into `.env.local`.
3. Run the migrations in filename order through the Supabase SQL editor or CLI:
   - `migrations/202609030001_product_persistence.sql`
   - `migrations/202609030002_wallet_sessions.sql`

The secret key is server-only. Never prefix it with `NEXT_PUBLIC_`.

## Identity boundary

Supabase does not currently provide native Starknet sign-in. Droptron therefore uses a small wallet-signature session: no email, password, profile, or private key is requested.

The server creates a five-minute, one-use challenge bound to the site, wallet, and network. Ready signs it, Starknet verifies it against the account contract, and Droptron returns a seven-day HTTP-only session. A user signs again on another device to open the same wallet workspace.

Creator writes go through Droptron's server routes. The Supabase secret key remains server-only, and browser code gets only the narrow public read access permitted by the database policies.

Recipient lists for private distributions are not stored as plaintext. Only recipient counts, totals, public commitments, and encrypted draft manifests belong in Supabase.

## Draft behavior

- Before signing, drafts can fall back to this browser so a rejected signature never loses work.
- After the user connects and approves Droptron's automatic sign-in message, Supabase becomes the wallet workspace source of truth. Reconnecting is the retry path if signing is cancelled or fails.
- Run migration `202609030003_launch_publication.sql` before publishing launches. Funding remains on-chain; publication mirrors the verified contract into the public Explore index so other wallets can discover it.
- Existing browser drafts are imported once, and their local copy is removed only after every upload succeeds.
- Distribution recipients are removed from the normal JSON payload and encrypted with AES-256-GCM before they reach Supabase.
- `DROPTON_DATA_ENCRYPTION_KEY` must be a server-only 64-character hex value and must be backed up securely. Rotating or losing it requires an explicit manifest migration.
