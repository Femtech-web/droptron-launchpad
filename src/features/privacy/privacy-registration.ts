import { RpcProvider } from "starknet";

import { privacyPoolAddress } from "@/features/privacy/privacy-pool";
import { networkFromChainId, rpcUrlForChain } from "@/features/wallet/wallet-networks";

export type PrivacySetupIssue = "unregistered" | "registered" | "unknown";

export async function privacySetupIssue(
  address: string | null,
  chainId: string | null,
): Promise<PrivacySetupIssue> {
  const network = networkFromChainId(chainId);
  const rpcUrl = rpcUrlForChain(chainId);
  const poolAddress = privacyPoolAddress(chainId);
  if (!address || !network || !rpcUrl || !poolAddress || rpcUrl === "your_testnet_rpc_url") return "unknown";

  try {
    const provider = new RpcProvider({ nodeUrl: rpcUrl });
    const result = await provider.callContract({
      contractAddress: poolAddress,
      entrypoint: "get_public_key",
      calldata: [address],
    });
    return BigInt(result[0] ?? 0) === BigInt(0) ? "unregistered" : "registered";
  } catch (error) {
    console.error("[Droptron STRK20] pool registration check failed", error);
    return "unknown";
  }
}
