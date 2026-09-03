import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { walletSessionTypedData } from "@/features/wallet/wallet-session-message";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { normalizeAuthChain, normalizeWalletAddress } from "@/lib/wallet-session";

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Workspace sync is not configured." }, { status: 503 });

  const body = await request.json().catch(() => null) as { address?: unknown; chainId?: unknown } | null;
  const walletAddress = normalizeWalletAddress(body?.address);
  const chainId = normalizeAuthChain(body?.chainId);
  if (!walletAddress || !chainId) {
    return NextResponse.json({ error: "Connect a supported Starknet account first." }, { status: 400 });
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const nonce = `0x${randomBytes(31).toString("hex")}`;
  const { data, error } = await supabase
    .from("wallet_auth_challenges")
    .insert({ chain_id: chainId, wallet_address: walletAddress, nonce, origin, expires_at: expiresAt })
    .select("id")
    .single();

  if (error) {
    console.error("[Droptron session] challenge creation failed", error);
    return NextResponse.json({ error: "Could not start workspace sync. Try again." }, { status: 500 });
  }

  const challenge = {
    challengeId: data.id as string,
    chainId,
    expiresAt,
    nonce,
    origin,
    walletAddress,
  };
  return NextResponse.json({ challenge, typedData: walletSessionTypedData(challenge) });
}
