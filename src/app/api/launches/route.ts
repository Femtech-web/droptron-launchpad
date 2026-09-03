import { NextResponse } from "next/server";
import { num, RpcProvider } from "starknet";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { currentWalletSession } from "@/lib/wallet-session";

type PublishInput = {
  id?: unknown;
  title?: unknown;
  detail?: unknown;
  values?: unknown;
};

function rpcUrl(chainId: string) {
  if (chainId === "SN_MAIN") return process.env.NEXT_PUBLIC_STARKNET_MAINNET_RPC_URL?.trim();
  return process.env.NEXT_PUBLIC_STARKNET_SEPOLIA_RPC_URL?.trim()
    || process.env.NEXT_PUBLIC_STARKNET_RPC_URL?.trim();
}

function expectedClassHash(chainId: string) {
  return chainId === "SN_MAIN"
    ? process.env.NEXT_PUBLIC_MAINNET_LAUNCH_CLASS_HASH?.trim()
    : process.env.NEXT_PUBLIC_SEPOLIA_LAUNCH_CLASS_HASH?.trim();
}

function canonicalAddress(value: unknown) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) return null;
  try { return num.toHex(BigInt(value)); } catch { return null; }
}

function sameFelt(left: string, right: string) {
  try { return BigInt(left) === BigInt(right); } catch { return false; }
}

function slugFor(title: string, contractAddress: string) {
  const prefix = title.toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "launch";
  return `${prefix}-${contractAddress.slice(-10).replace(/^0+/, "") || "0"}`;
}

function publicLaunch(row: Record<string, unknown>) {
  const pricing = String(row.pricing_model);
  const startsAt = String(row.starts_at);
  const endsAt = String(row.ends_at);
  return {
    id: String(row.slug),
    title: String(row.name),
    detail: `${pricing} · ${new Date(startsAt).toLocaleDateString("en")} · ${new Date(endsAt).toLocaleDateString("en")}`,
    createdAt: String(row.created_at),
    values: {
      owner: String(row.owner_wallet_address),
      chainId: String(row.chain_id),
      saleToken: String(row.sale_token_address),
      paymentToken: String(row.payment_token_address),
      saleDecimals: String(row.sale_token_decimals ?? 18),
      paymentDecimals: String(row.payment_token_decimals ?? 18),
      pricing,
      initialPrice: String(row.initial_price),
      curveSlope: row.curve_slope === null ? "" : String(row.curve_slope),
      saleAllocation: String(row.sale_allocation),
      raiseLimit: String(row.raise_limit),
      startsAt,
      endsAt,
      contractAddress: String(row.contract_address),
      deploymentTx: String(row.deployment_tx_hash ?? ""),
      fundingTx: String(row.funding_tx_hash ?? ""),
      funded: "true",
      published: "true",
      publicSlug: String(row.slug),
    },
  };
}

const PUBLIC_COLUMNS = "slug, name, owner_wallet_address, chain_id, sale_token_address, payment_token_address, sale_token_decimals, payment_token_decimals, pricing_model, initial_price, curve_slope, sale_allocation, raise_limit, starts_at, ends_at, contract_address, deployment_tx_hash, funding_tx_hash, created_at";

export async function GET(request: Request) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Launch discovery is unavailable." }, { status: 503 });
  const id = new URL(request.url).searchParams.get("id");
  let query = supabase.from("launches").select(PUBLIC_COLUMNS).in("status", ["live", "ended"]);
  if (id) query = query.eq("slug", id).limit(1);
  else query = query.order("starts_at", { ascending: false }).limit(100);
  const { data, error } = await query;
  if (error) {
    console.error("[Droptron launches] public read failed", error);
    return NextResponse.json({ error: "Could not load public launches." }, { status: 500 });
  }
  if (id) return NextResponse.json({ launch: data[0] ? publicLaunch(data[0]) : null });
  return NextResponse.json({ launches: data.map(publicLaunch) });
}

export async function POST(request: Request) {
  const [session, supabase] = await Promise.all([
    currentWalletSession(),
    Promise.resolve(getSupabaseAdminClient()),
  ]);
  if (!session) return NextResponse.json({ error: "Reconnect your wallet before publishing." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Launch publishing is unavailable." }, { status: 503 });
  const body = await request.json().catch(() => null) as PublishInput | null;
  const values = body?.values && typeof body.values === "object" && !Array.isArray(body.values)
    ? body.values as Record<string, unknown>
    : null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const contractAddress = canonicalAddress(values?.contractAddress);
  const saleToken = canonicalAddress(values?.saleToken);
  const paymentToken = canonicalAddress(values?.paymentToken);
  const deploymentTx = canonicalAddress(values?.deploymentTx);
  const fundingTx = canonicalAddress(values?.fundingTx);
  const pricing = values?.pricing;
  const saleDecimals = Number(values?.saleDecimals);
  const paymentDecimals = Number(values?.paymentDecimals);
  const startsAt = new Date(String(values?.startsAt ?? ""));
  const endsAt = new Date(String(values?.endsAt ?? ""));
  if (
    !title || title.length > 120 || !contractAddress || !saleToken || !paymentToken
    || !deploymentTx || !fundingTx || (pricing !== "fixed" && pricing !== "linear")
    || !Number.isInteger(saleDecimals) || saleDecimals < 0 || saleDecimals > 18
    || !Number.isInteger(paymentDecimals) || paymentDecimals < 0 || paymentDecimals > 18
    || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt
  ) return NextResponse.json({ error: "This launch is not ready to publish." }, { status: 400 });

  const nodeUrl = rpcUrl(session.chainId);
  const classHash = expectedClassHash(session.chainId);
  if (!nodeUrl || !classHash) return NextResponse.json({ error: "This launch network is not configured." }, { status: 503 });
  try {
    const provider = new RpcProvider({ nodeUrl });
    const [actualClassHash, owner, actualSale, actualPayment, funded] = await Promise.all([
      provider.getClassHashAt(contractAddress),
      provider.callContract({ contractAddress, entrypoint: "owner" }),
      provider.callContract({ contractAddress, entrypoint: "sale_token" }),
      provider.callContract({ contractAddress, entrypoint: "payment_token" }),
      provider.callContract({ contractAddress, entrypoint: "is_funded" }),
    ]);
    if (
      !sameFelt(actualClassHash, classHash)
      || !sameFelt(owner[0] ?? "", session.walletAddress)
      || !sameFelt(actualSale[0] ?? "", saleToken)
      || !sameFelt(actualPayment[0] ?? "", paymentToken)
      || BigInt(funded[0] ?? 0) !== BigInt(1)
    ) return NextResponse.json({ error: "The funded contract does not match this launch." }, { status: 409 });
  } catch (error) {
    console.error("[Droptron launches] on-chain publication check failed", error);
    return NextResponse.json({ error: "The funded launch could not be verified on Starknet." }, { status: 502 });
  }

  const initialPrice = String(values?.initialPrice ?? "");
  const curveSlope = pricing === "linear" ? String(values?.curveSlope ?? "") : null;
  const saleAllocation = String(values?.saleAllocation ?? "");
  const raiseLimit = String(values?.raiseLimit ?? "");
  if (![initialPrice, saleAllocation, raiseLimit].every((value) => /^\d+(?:\.\d+)?$/.test(value))) {
    return NextResponse.json({ error: "The launch amounts are invalid." }, { status: 400 });
  }
  if (pricing === "linear" && (!curveSlope || !/^\d+(?:\.\d+)?$/.test(curveSlope))) {
    return NextResponse.json({ error: "The launch slope is invalid." }, { status: 400 });
  }

  const slug = slugFor(title, contractAddress);
  const { data, error } = await supabase.from("launches").upsert({
    wallet_identity_id: session.walletIdentityId,
    chain_id: session.chainId,
    owner_wallet_address: session.walletAddress,
    slug,
    name: title,
    description: typeof body?.detail === "string" ? body.detail.slice(0, 1_000) : "",
    contract_address: contractAddress,
    sale_token_address: saleToken,
    payment_token_address: paymentToken,
    sale_token_decimals: saleDecimals,
    payment_token_decimals: paymentDecimals,
    pricing_model: pricing,
    initial_price: initialPrice,
    curve_slope: curveSlope,
    sale_allocation: saleAllocation,
    raise_limit: raiseLimit,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: "live",
    deployment_tx_hash: deploymentTx,
    funding_tx_hash: fundingTx,
  }, { onConflict: "chain_id,contract_address" }).select(PUBLIC_COLUMNS).single();
  if (error) {
    console.error("[Droptron launches] publication failed", error);
    return NextResponse.json({ error: "The launch was funded but could not be published." }, { status: 500 });
  }
  return NextResponse.json({ launch: publicLaunch(data) });
}
