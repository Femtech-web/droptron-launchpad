import { RpcProvider } from "starknet";

import { networkFromChainId, rpcUrlForChain } from "@/features/wallet/wallet-networks";

const PRIVACY_POOLS = {
  mainnet: process.env.NEXT_PUBLIC_STRK20_MAINNET_POOL_ADDRESS?.trim()
    || "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a",
  sepolia: process.env.NEXT_PUBLIC_STRK20_SEPOLIA_POOL_ADDRESS?.trim()
    || "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91",
} as const;

export function privacyPoolAddress(chainId: string | null) {
  const network = networkFromChainId(chainId);
  return network ? PRIVACY_POOLS[network] : null;
}

export async function readPrivacyPoolFee(chainId: string | null) {
  const rpcUrl = rpcUrlForChain(chainId);
  const poolAddress = privacyPoolAddress(chainId);
  if (!rpcUrl || !poolAddress) return null;
  const result = await new RpcProvider({ nodeUrl: rpcUrl }).callContract({
    contractAddress: poolAddress,
    entrypoint: "get_fee_amount",
  });
  return BigInt(result[0] ?? 0) + (BigInt(result[1] ?? 0) << BigInt(128));
}
