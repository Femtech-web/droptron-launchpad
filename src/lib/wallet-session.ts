import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { num } from "starknet";

import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const WALLET_SESSION_COOKIE = "droptron_session";
export const WALLET_SESSION_SECONDS = 7 * 24 * 60 * 60;

export function normalizeWalletAddress(value: unknown) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) return null;
  try {
    return num.toHex(BigInt(value)).toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeAuthChain(value: unknown): "SN_MAIN" | "SN_SEPOLIA" | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/^starknet:/i, "").toUpperCase();
  if (normalized === "SN_MAIN" || normalized === "0X534E5F4D41494E") return "SN_MAIN";
  if (normalized === "SN_SEPOLIA" || normalized === "0X534E5F5345504F4C4941") return "SN_SEPOLIA";
  return null;
}

export function sessionTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function currentWalletSession() {
  const token = (await cookies()).get(WALLET_SESSION_COOKIE)?.value;
  const supabase = getSupabaseAdminClient();
  if (!token || !supabase) return null;

  const { data, error } = await supabase
    .from("wallet_sessions")
    .select("id, expires_at, wallet_identities!inner(id, chain_id, wallet_address)")
    .eq("token_hash", sessionTokenHash(token))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;
  const identity = Array.isArray(data.wallet_identities)
    ? data.wallet_identities[0]
    : data.wallet_identities;
  if (!identity) return null;

  return {
    sessionId: data.id as number,
    walletIdentityId: identity.id as number,
    chainId: identity.chain_id as "SN_MAIN" | "SN_SEPOLIA",
    walletAddress: identity.wallet_address as string,
  };
}
