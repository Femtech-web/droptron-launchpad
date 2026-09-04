# Product experience

Droptron's interface should make the public market legible, keep private ownership wallet-scoped, and state the next action before a wallet request opens. This document is the product contract for contributors changing launches, distributions, claims, or wallet flows.

## Role boundaries

| Surface | Show | Do not show |
| --- | --- | --- |
| Public launch | Terms, public status, participation controls, and this wallet's device-local purchase references | Creator setup checklist, creator settlement, recipient manifests, or another wallet's activity |
| Creator launch | Deployment, funding, publication, public metrics, and settlement controls | Private participant activity or claims inferred from public transactions |
| Distribution | Public campaign summary, creator execution state, unlock schedule, and creator-only recipient manifest | Recipient private ticket ownership or redemption history |
| Claims | Tickets discovered by the connected privacy wallet, grouped vesting schedules, unlock state, and claim actions | Other recipients, creator controls, or a public address-to-allocation map |
| Wallet | The connected account's public and shielded balances and explicit asset actions | Seed phrases, viewing keys, decrypted note registries, or prover configuration |

A wallet that is both creator and participant may access both roles through their separate surfaces. The views should not be merged merely because the address is the same.

## One clear next action

- A page should present one primary state-changing action for its current stage.
- Button copy names what happens next: `Shield STRK`, `Check balance & continue`, `Deliver privately`, or `Claim privately` is clearer than a generic `Continue`.
- Preflight checks run before the wallet opens. If a required private balance is short, open the shield modal with the asset, live fee requirement, existing private balance, and suggested shortfall.
- Shield success closes the modal, shows a success toast, refreshes wallet state, and waits for note maturity. It must not automatically submit the following spend.
- A completed stage is terminal. It shows evidence or status, not a button retaining the previous transaction handler.

## Wallet and state changes

- Account, network, connector, or chain changes invalidate the signed product session and any account-scoped preflight result.
- Disable repeated clicks synchronously, fingerprint the in-flight request, and recheck persisted state inside every one-shot handler.
- A successful wallet response advances state once. If a wallet redisplays an identical completed request, the interface tells the user to reject it rather than treating it as the next stage.
- Newly shielded notes may require confirmation depth before they are spendable. Display a waiting state and offer an explicit balance refresh instead of reopening the wallet.
- Claims are discovered automatically on page load and after account or network changes. A manual refresh remains available for note maturity and transient wallet failures.

See [Wallet and STRK20 integration](wallet-integration.md) for the protocol-facing behavior and [Testing and safety](testing-and-safety.md) for replay boundaries.

## Privacy language

Always distinguish between:

- **public market state:** token and contract addresses, terms, timing, aggregate activity, and transaction inclusion;
- **private ownership state:** shielded balances, note ownership, private transfer parties and amounts, and ticket ownership;
- **local convenience history:** transaction references saved for one wallet on one device, which are not an authoritative onchain identity record.

Do not imply that shielding itself is invisible or that Droptron can determine which public wallet owns a private note. Supabase may index public product metadata and encrypted creator workspace data, but it does not receive wallet privacy keys or authorize value movement.

## Presentation rules

- Participant launch terms use the full content width when creator controls are absent.
- Recipient tables remain visible and paginate after ten rows; pagination changes presentation only, never validation, totals, or execution scope.
- Vesting claims appear as one campaign row with expandable tranches rather than unrelated claim rows.
- Dialogs support close controls, outside-click dismissal when safe, keyboard navigation, visible focus, and status cues that do not rely on color alone.
- Toasts use the bottom-right area so they are less likely to sit behind a wallet window.

## Review checklist

When a user-facing transaction flow changes, verify the disconnected, wrong-network, wrong-account, insufficient-public-balance, insufficient-private-balance, note-maturing, rejected, timed-out, successful, refreshed, and already-completed states. Test creator and participant routes independently even when one wallet holds both roles.
