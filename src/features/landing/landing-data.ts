export const lifecycle = [
  { number: "I", title: "Private participation", copy: "Join a public launch without publishing the wallet link to your allocation.", state: "Shielded allocation" },
  { number: "II", title: "Confidential distribution", copy: "Deliver team allocations and airdrop entitlements as private STRK20 notes.", state: "Private delivery" },
  { number: "III", title: "Private vesting claims", copy: "Redeem unlocked tranches into a shielded balance, on your own schedule.", state: "Tranche by tranche" },
] as const;

export const proofPoints = [
  ["A public launch does not require a public allocation.", "Market price and launch activity remain visible. The participant’s path into their allocation does not."],
  ["Claims can be private by design.", "Eligibility arrives as a private entitlement note—never as a public wallet-address claim."],
  ["Privacy should be inspectable.", "Every action explains its public and private surface before a wallet approval."],
] as const;
