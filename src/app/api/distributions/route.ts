import { NextResponse } from "next/server";
import { RpcProvider } from "starknet";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { currentWalletSession } from "@/lib/wallet-session";

type DraftInput = { id?: unknown; title?: unknown; values?: Record<string, unknown> };

function rpcUrl(chainId: string) {
  return chainId === "SN_MAIN" ? process.env.NEXT_PUBLIC_STARKNET_MAINNET_RPC_URL?.trim() : process.env.NEXT_PUBLIC_STARKNET_SEPOLIA_RPC_URL?.trim();
}

function factoryAddress(chainId: string) {
  return chainId === "SN_MAIN" ? process.env.NEXT_PUBLIC_MAINNET_DISTRIBUTION_FACTORY_ADDRESS?.trim() : null;
}

function sameFelt(left: unknown, right: unknown) {
  try { return BigInt(String(left)) === BigInt(String(right)); } catch { return false; }
}

function validAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{1,64}$/.test(value);
}

function publicDistribution(row: Record<string, unknown>) {
  return {
    id: String(row.client_id),
    title: String(row.name),
    createdAt: String(row.created_at),
    values: {
      kind: String(row.kind),
      chainId: String(row.chain_id),
      token: String(row.token_address),
      tokenDecimals: String(row.token_decimals ?? 18),
      total: String(row.total_amount),
      startsAt: row.claim_starts_at ? String(row.claim_starts_at) : "",
      endsAt: row.claim_ends_at ? String(row.claim_ends_at) : "",
      firstUnlock: row.first_unlock_at ? String(row.first_unlock_at) : "",
      cadence: row.cadence ? String(row.cadence) : "",
      tranches: row.tranche_count ? String(row.tranche_count) : "",
      seriesAddresses: JSON.stringify(row.series_addresses ?? []),
      deliveryTx: String(row.delivery_tx_hash ?? ""),
      status: String(row.status),
    },
  };
}

const PUBLIC_COLUMNS = "client_id,name,kind,chain_id,token_address,token_decimals,total_amount,claim_starts_at,claim_ends_at,first_unlock_at,cadence,tranche_count,series_addresses,delivery_tx_hash,status,created_at";

export async function GET() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Claim discovery is unavailable." }, { status: 503 });
  const { data, error } = await supabase.from("distributions").select(PUBLIC_COLUMNS).in("status", ["live", "complete"]).in("kind", ["airdrop", "vesting"]).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Claims could not be loaded." }, { status: 500 });
  return NextResponse.json({ distributions: data.map(publicDistribution) });
}

export async function POST(request: Request) {
  const [session, supabase] = await Promise.all([currentWalletSession(), Promise.resolve(getSupabaseAdminClient())]);
  if (!session) return NextResponse.json({ error: "Reconnect the creator wallet before publishing claims." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Claim publishing is unavailable." }, { status: 503 });
  const body = await request.json().catch(() => null) as DraftInput | null;
  const values = body?.values;
  const kind = values?.kind;
  if (!body || typeof body.id !== "string" || typeof body.title !== "string" || (kind !== "airdrop" && kind !== "vesting") || !validAddress(values?.token)) {
    return NextResponse.json({ error: "This claim campaign is invalid." }, { status: 400 });
  }
  let plan: Array<{ series?: unknown; allocation?: unknown }>;
  try { plan = JSON.parse(String(values?.ticketPlan ?? "[]")); } catch { plan = []; }
  if (!Array.isArray(plan) || plan.length < 1 || plan.length > 24 || plan.some((item) => !validAddress(item.series))) {
    return NextResponse.json({ error: "The claim series are invalid." }, { status: 400 });
  }
  const nodeUrl = rpcUrl(session.chainId);
  const factory = factoryAddress(session.chainId);
  if (!nodeUrl || !factory) return NextResponse.json({ error: "Claim infrastructure is unavailable on this network." }, { status: 503 });
  try {
    const provider = new RpcProvider({ nodeUrl });
    for (const item of plan) {
      const series = String(item.series);
      const [known, funded, terms] = await Promise.all([
        provider.callContract({ contractAddress: factory, entrypoint: "is_series", calldata: [series] }),
        provider.callContract({ contractAddress: series, entrypoint: "is_funded" }),
        provider.callContract({ contractAddress: series, entrypoint: "terms" }),
      ]);
      if (BigInt(known[0] ?? 0) !== BigInt(1) || BigInt(funded[0] ?? 0) !== BigInt(1) || !sameFelt(terms[0], session.walletAddress) || !sameFelt(terms[1], values.token)) {
        return NextResponse.json({ error: "A claim series does not match this funded campaign." }, { status: 409 });
      }
    }
  } catch (error) {
    console.error("[Droptron distributions] publication verification failed", error);
    return NextResponse.json({ error: "The funded claim series could not be verified on Starknet." }, { status: 502 });
  }
  const recipientCount = Number(values?.recipientCount ?? 0) || (() => { try { return JSON.parse(String(values?.recipients ?? "[]")).length; } catch { return 0; } })();
  const total = String(values?.total ?? "");
  const decimals = Number(values?.tokenDecimals ?? 18);
  if (!recipientCount || !/^\d+(?:\.\d+)?$/.test(total) || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) return NextResponse.json({ error: "Campaign totals are invalid." }, { status: 400 });
  const row = {
    wallet_identity_id: session.walletIdentityId,
    client_id: body.id,
    chain_id: session.chainId,
    owner_wallet_address: session.walletAddress,
    kind,
    name: body.title.slice(0, 120),
    token_address: String(values.token).toLowerCase(),
    token_decimals: decimals,
    recipient_count: recipientCount,
    total_amount: total,
    claim_starts_at: kind === "airdrop" ? String(values.startsAt) : null,
    claim_ends_at: kind === "airdrop" ? String(values.endsAt) : null,
    first_unlock_at: kind === "vesting" ? String(values.firstUnlock) : null,
    cadence: kind === "vesting" ? String(values.cadence) : null,
    tranche_count: kind === "vesting" ? Number(values.tranches) : null,
    initial_unlock_percent: kind === "vesting" ? Number(values.initialUnlock ?? 0) : null,
    contract_address: String(plan[0].series).toLowerCase(),
    series_addresses: plan.map((item) => String(item.series).toLowerCase()),
    status: "live",
    deployment_tx_hash: String(values.deploymentTx ?? ""),
    funding_tx_hash: String(values.fundingTx ?? ""),
    delivery_tx_hash: String(values.deliveryTx ?? ""),
  };
  const { data, error } = await supabase.from("distributions").upsert(row, { onConflict: "wallet_identity_id,client_id" }).select(PUBLIC_COLUMNS).single();
  if (error) {
    console.error("[Droptron distributions] publication failed", error);
    return NextResponse.json({ error: "The claims were delivered but could not be published." }, { status: 500 });
  }
  return NextResponse.json({ distribution: publicDistribution(data) });
}
