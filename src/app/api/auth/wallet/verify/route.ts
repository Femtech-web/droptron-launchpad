import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { RpcProvider, type Signature } from "starknet";

import { walletSessionTypedData, type WalletSessionChallenge } from "@/features/wallet/wallet-session-message";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import {
  normalizeWalletAddress,
  sessionTokenHash,
  WALLET_SESSION_COOKIE,
  WALLET_SESSION_SECONDS,
} from "@/lib/wallet-session";

function rpcForChain(chainId: string) {
  if (chainId === "SN_MAIN") return process.env.NEXT_PUBLIC_STARKNET_MAINNET_RPC_URL?.trim();
  if (chainId === "SN_SEPOLIA") {
    return process.env.NEXT_PUBLIC_STARKNET_SEPOLIA_RPC_URL?.trim()
      || process.env.NEXT_PUBLIC_STARKNET_RPC_URL?.trim();
  }
  return null;
}

function validSignature(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((part) => typeof part === "string" && /^(0x[0-9a-fA-F]+|[0-9]+)$/.test(part));
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Workspace sync is not configured." }, { status: 503 });

  const body = await request.json().catch(() => null) as { challengeId?: unknown; signature?: unknown } | null;
  if (typeof body?.challengeId !== "string" || !validSignature(body.signature)) {
    return NextResponse.json({ error: "The wallet signature was incomplete." }, { status: 400 });
  }

  const { data: row, error: challengeError } = await supabase
    .from("wallet_auth_challenges")
    .select("id, chain_id, wallet_address, nonce, origin, expires_at, consumed_at")
    .eq("id", body.challengeId)
    .maybeSingle();

  const requestOrigin = request.headers.get("origin") ?? new URL(request.url).origin;
  if (challengeError || !row || row.consumed_at || row.origin !== requestOrigin || new Date(row.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This sign-in request expired. Try again." }, { status: 401 });
  }

  const rpcUrl = rpcForChain(row.chain_id);
  if (!rpcUrl) return NextResponse.json({ error: "This Starknet network is not configured." }, { status: 503 });

  const challenge: WalletSessionChallenge = {
    challengeId: row.id,
    chainId: row.chain_id,
    expiresAt: row.expires_at,
    nonce: row.nonce,
    origin: row.origin,
    walletAddress: row.wallet_address,
  };

  try {
    const provider = new RpcProvider({ nodeUrl: rpcUrl });
    const verified = await provider.verifyMessageInStarknet(
      walletSessionTypedData(challenge),
      body.signature as Signature,
      row.wallet_address,
    );
    if (!verified) return NextResponse.json({ error: "Ready could not verify this signature." }, { status: 401 });
  } catch (error) {
    console.error("[Droptron session] signature verification failed", error);
    return NextResponse.json({ error: "Ready could not verify this signature." }, { status: 401 });
  }

  const consumedAt = new Date().toISOString();
  const { data: consumed } = await supabase
    .from("wallet_auth_challenges")
    .update({ consumed_at: consumedAt })
    .eq("id", row.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (!consumed) return NextResponse.json({ error: "This sign-in request was already used." }, { status: 409 });

  const walletAddress = normalizeWalletAddress(row.wallet_address)!;
  const { data: identity, error: identityError } = await supabase
    .from("wallet_identities")
    .upsert(
      { chain_id: row.chain_id, wallet_address: walletAddress, verified_at: consumedAt, last_seen_at: consumedAt },
      { onConflict: "chain_id,wallet_address" },
    )
    .select("id")
    .single();
  if (identityError) {
    console.error("[Droptron session] identity upsert failed", identityError);
    return NextResponse.json({ error: "Workspace sync could not be completed." }, { status: 500 });
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + WALLET_SESSION_SECONDS * 1_000).toISOString();
  const { error: sessionError } = await supabase.from("wallet_sessions").insert({
    wallet_identity_id: identity.id,
    token_hash: sessionTokenHash(token),
    expires_at: expiresAt,
  });
  if (sessionError) {
    console.error("[Droptron session] session creation failed", sessionError);
    return NextResponse.json({ error: "Workspace sync could not be completed." }, { status: 500 });
  }

  const response = NextResponse.json({ chainId: row.chain_id, walletAddress });
  response.cookies.set(WALLET_SESSION_COOKIE, token, {
    httpOnly: true,
    maxAge: WALLET_SESSION_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
