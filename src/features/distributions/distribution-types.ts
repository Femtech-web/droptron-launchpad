export type DistributionKind = "disperse" | "airdrop" | "vesting";

export const DISTRIBUTION_TYPES: Array<{
  kind: DistributionKind;
  label: string;
  eyebrow: string;
  description: string;
  outcome: string;
}> = [
  {
    kind: "disperse",
    label: "Disperse",
    eyebrow: "Direct delivery",
    description: "Send private balances to many registered recipients in one guided flow.",
    outcome: "No claim required",
  },
  {
    kind: "airdrop",
    label: "Airdrop",
    eyebrow: "Claim window",
    description: "Give eligible recipients an allocation they can claim during a fixed window.",
    outcome: "Claim when available",
  },
  {
    kind: "vesting",
    label: "Vesting",
    eyebrow: "Scheduled tranches",
    description: "Release allocations through clear weekly or monthly unlocks.",
    outcome: "Claim as tranches unlock",
  },
];
