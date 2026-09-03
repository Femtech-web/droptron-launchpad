import { hash, num, type TypedData } from "starknet";

export type WalletSessionChallenge = {
  challengeId: string;
  chainId: "SN_MAIN" | "SN_SEPOLIA";
  expiresAt: string;
  nonce: string;
  origin: string;
  walletAddress: string;
};

export function walletSessionTypedData(challenge: WalletSessionChallenge): TypedData {
  const issuedAt = Math.floor((new Date(challenge.expiresAt).getTime() - 5 * 60_000) / 1_000);
  const expiresAt = Math.floor(new Date(challenge.expiresAt).getTime() / 1_000);

  return {
    types: {
      StarknetDomain: [
        { name: "name", type: "shortstring" },
        { name: "version", type: "shortstring" },
        { name: "chainId", type: "shortstring" },
        { name: "revision", type: "shortstring" },
      ],
      DroptronSession: [
        { name: "purpose", type: "shortstring" },
        { name: "origin_hash", type: "felt" },
        { name: "wallet", type: "ContractAddress" },
        { name: "nonce", type: "felt" },
        { name: "issued_at", type: "u128" },
        { name: "expires_at", type: "u128" },
      ],
    },
    primaryType: "DroptronSession",
    domain: {
      name: "Droptron",
      version: "1",
      chainId: challenge.chainId,
      revision: "1",
    },
    message: {
      purpose: "Sync Droptron",
      // Starknet.js returns this value as a bigint. Keep the API response JSON-safe
      // while preserving the exact felt signed and verified by the account.
      origin_hash: num.toHex(hash.starknetKeccak(challenge.origin)),
      wallet: challenge.walletAddress,
      nonce: challenge.nonce,
      issued_at: issuedAt,
      expires_at: expiresAt,
    },
  };
}
