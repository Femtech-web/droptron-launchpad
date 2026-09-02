import { constants } from "starknet";

export type DroptronNetwork = "mainnet" | "sepolia";

export const DROPTON_NETWORKS = {
  mainnet: { chainId: constants.StarknetChainId.SN_MAIN, label: "Mainnet", fullLabel: "Starknet Mainnet" },
  sepolia: { chainId: constants.StarknetChainId.SN_SEPOLIA, label: "Sepolia", fullLabel: "Starknet Sepolia" },
} as const;

export function networkFromChainId(chainId: string | null): DroptronNetwork | null {
  if (!chainId) return null;
  const normalized = chainId.replace(/^starknet:/i, "").toUpperCase();
  if (normalized === "SN_MAIN" || normalized === constants.StarknetChainId.SN_MAIN.toUpperCase()) return "mainnet";
  if (normalized === "SN_SEPOLIA" || normalized === constants.StarknetChainId.SN_SEPOLIA.toUpperCase()) return "sepolia";
  return null;
}

export function networkLabel(chainId: string | null) {
  const network = networkFromChainId(chainId);
  return network ? DROPTON_NETWORKS[network].fullLabel : chainId ?? "Network unavailable";
}

export function rpcUrlForChain(chainId: string | null) {
  const network = networkFromChainId(chainId);
  if (network === "mainnet") return process.env.NEXT_PUBLIC_STARKNET_MAINNET_RPC_URL?.trim() || null;
  if (network === "sepolia") {
    return process.env.NEXT_PUBLIC_STARKNET_SEPOLIA_RPC_URL?.trim()
      || process.env.NEXT_PUBLIC_STARKNET_RPC_URL?.trim()
      || null;
  }
  return null;
}
