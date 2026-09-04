# Wallet and STRK20 integration

## Signed creator sessions

Connecting a wallet does not silently grant creator access. When workspace sync is needed, Droptron asks the connected Starknet account to sign typed data containing:

- the `Droptron` domain and session purpose;
- the Starknet chain;
- the wallet contract address;
- a hash of the requesting origin;
- a cryptographically random nonce;
- explicit issue and five-minute expiry times.

The server reloads the stored challenge, rejects an expired, consumed, or wrong-origin request, and verifies the signature through the Starknet account contract before creating a session. Each challenge is consumed atomically, so it cannot be used twice. The browser receives a random session token in an `HttpOnly`, `SameSite=Lax` cookie with `Secure` enabled in production; Supabase stores only its SHA-256 hash. Logout revokes the server record and clears the cookie.

Sessions are wallet- and chain-scoped. Changing the connected account or network makes the existing session mismatch, returning the workspace to an unsigned state and requiring the new account to sign. The signature authenticates product workspace access only; it is not a token approval and cannot move funds.

## Capability detection

A connected Starknet wallet is not necessarily a privacy wallet. Droptron checks the Wallet API capability advertised by the wallet before enabling shielded balance reads or private actions. Ready is the supported privacy wallet used for the Mainnet product flow.

Droptron discovers injected wallets through Wallet Standard and displays every wallet announced to the current browser origin. It does not maintain an allowlist that could hide Ready X. If Ready X appears on localhost but not on the deployed site, enable the extension for the deployed domain, unlock it, and refresh; the application cannot connect an extension the browser has not exposed to that origin.

Droptron uses the private-dapp Wallet API route. Ready owns the viewing and spending keys, discovers the user's notes, reaches the proving service, builds the proof, and submits the private transaction. The Droptron deployment therefore needs its Starknet RPC configuration but does not need its own proving-service URL, hosted discovery indexer, private key, viewing key, or prover secret.

The Droptron anonymizer/helper contracts do not replace proof generation. They are pool-pinned targets reached with `privacy_invoke` from within an already proved private transaction.

## Registration

Private-token registration is once per account, chain, and STRK20 pool. Ready owns this setup. The user enables private tokens inside Ready from **Settings → Private tokens** while using a standard account; Droptron does not derive or submit a viewing key.

Registration and shielding are ordinary public Starknet transactions and require no private spend proof. Spending a shielded note—for participation, private delivery, or a claim—does require a proof, which Ready obtains through its own service path.

## Preflight

Before a private action, Droptron reads the live pool fee and asks the wallet for the relevant private balances. It can then:

- explain the next wallet action;
- open a prefilled STRK Shield modal for a fee shortfall;
- open an asset Shield modal for a token shortfall;
- reserve multiple pool fees when shielding is followed by delivery;
- wait for new notes to mature before continuing.

All token calculations use onchain ERC-20 decimals and integer base units. Conventional 0–18 decimal Starknet ERC-20s are supported. Fee-on-transfer, rebasing, and non-standard balance behavior are rejected rather than estimated.

## Confirmations

A normal shield may request an exact ERC-20 approval and then the pool deposit. Claim-ticket approval is a separate campaign stage, so ticket shielding expects only its one private Shield confirmation.

Ready may display a generic high-risk warning for any spending limit. Droptron uses the configured pool as spender and exact amounts rather than unlimited allowances. Users should still inspect the wallet review.

## Reported Ready X replay risk

Ready has sometimes redisplayed an already successful private request after its success view closes. Droptron prevents another application submission with locks, fingerprints, stage guards, and one-shot idempotency keys. Wallet Standard does not expose a cancellation method for a request already owned by the wallet UI. If Droptron already shows success and Ready presents an identical request, reject it.

Droptron submitted a normal-speed reproduction recording and [the successful Mainnet transaction](https://voyager.online/tx/0x05f5c437010fcd05eb37ddafb19593ed3a6c08d1bbadc4b5613a48cb59888e74f) to Ready Support on September 4, 2026 as ticket **181367**. The observed request used `WalletAccountV6.strk20InvokeTransaction(actions)`, Wallet API `0.10.3`, Ready X `5.33.9`, and `starknet.js` `10.4.0`. The second prompt was rejected, so the report does not claim a confirmed duplicate spend. Ready has acknowledged receipt of the support request but has not yet provided a technical conclusion or public tracking URL.

The application records a privacy-safe request identifier, SHA-256 action fingerprint, action types, wallet name, resolution hash, and elapsed time. It deliberately excludes addresses, values, calldata, private balances, notes, viewing keys, and proof material. This makes it possible to distinguish a second dapp submission from a wallet-owned redisplay without weakening user privacy.

For the complete control inventory and its limitations, see [Security controls](security-controls.md).
