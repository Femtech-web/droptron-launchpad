import { NextRequest, NextResponse } from "next/server";
import { Account, RpcProvider, cairo, constants, defaultDeployer, hash, shortString } from "starknet";

import casm from "../../../../../contracts/target/dev/droptron_contracts_DroptronFixedSupplyToken.compiled_contract_class.json";
import contract from "../../../../../contracts/target/dev/droptron_contracts_DroptronFixedSupplyToken.contract_class.json";

export const dynamic = "force-dynamic";

const STRK_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{1,64}$/;
const AMOUNT_PATTERN = /^\d+(?:\.\d+)?$/;

type TokenInput = { name?: unknown; symbol?: unknown; totalSupply?: unknown; decimals?: unknown };

function walletContract() {
  return {
    contract_class_version: contract.contract_class_version,
    sierra_program: contract.sierra_program,
    entry_points_by_type: contract.entry_points_by_type,
    abi: contract.abi,
  };
}

function artifacts() {
  const walletReadyContract = walletContract();
  return {
    contract: walletReadyContract,
    casm,
    classHash: hash.computeContractClassHash(walletReadyContract),
    compiledClassHash: hash.computeCompiledClassHash(casm),
  };
}

function sameAddress(left: string, right: string) {
  try { return BigInt(left) === BigInt(right); } catch { return false; }
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function parseTokenInput(input: TokenInput | null | undefined) {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const symbol = typeof input?.symbol === "string" ? input.symbol.trim().toUpperCase() : "";
  const totalSupply = typeof input?.totalSupply === "string" ? input.totalSupply.trim() : "";
  const decimals = typeof input?.decimals === "number" ? input.decimals : Number(input?.decimals);
  if (!name || byteLength(name) > 31 || !shortString.isShortString(name)) throw new Error("Token name must be 1–31 standard characters.");
  if (!symbol || byteLength(symbol) > 10 || !shortString.isShortString(symbol)) throw new Error("Token symbol must be 1–10 standard characters.");
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error("Token decimals must be between 0 and 18.");
  if (!AMOUNT_PATTERN.test(totalSupply)) throw new Error("Enter a valid total supply.");
  const [whole, fraction = ""] = totalSupply.split(".");
  if (fraction.length > decimals) throw new Error(`Total supply supports up to ${decimals} decimal places.`);
  const scale = BigInt(10) ** BigInt(decimals);
  const baseUnits = BigInt(whole) * scale + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (baseUnits <= BigInt(0)) throw new Error("Total supply must be greater than zero.");
  return { name, symbol, totalSupply, decimals, baseUnits };
}

async function isDeclared(provider: RpcProvider, classHash: string) {
  try {
    await provider.getClass(classHash);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes("class hash not found") || message.includes("class_hash_not_found")) return false;
    throw error;
  }
}

async function publicStrkBalance(provider: RpcProvider, address: string) {
  const result = await provider.callContract({ contractAddress: STRK_ADDRESS, entrypoint: "balance_of", calldata: [address] });
  return BigInt(result[0] ?? 0) + (BigInt(result[1] ?? 0) << BigInt(128));
}

export function GET() {
  return NextResponse.json(artifacts(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const adminAddress = process.env.NEXT_PUBLIC_MAINNET_ADMIN_ADDRESS?.trim();
  const rpcUrl = process.env.NEXT_PUBLIC_STARKNET_MAINNET_RPC_URL?.trim();
  const body = await request.json().catch(() => null) as { address?: unknown; token?: TokenInput } | null;
  const address = typeof body?.address === "string" ? body.address.trim() : "";

  if (!ADDRESS_PATTERN.test(address)) return NextResponse.json({ error: "Connect a valid Starknet wallet." }, { status: 400 });
  if (!rpcUrl) return NextResponse.json({ error: "The Mainnet RPC is not configured." }, { status: 503 });

  try {
    const provider = new RpcProvider({ nodeUrl: rpcUrl });
    if (await provider.getChainId() !== constants.StarknetChainId.SN_MAIN) {
      return NextResponse.json({ error: "The configured RPC is not Starknet Mainnet." }, { status: 503 });
    }

    const deploymentArtifacts = artifacts();
    const classDeclared = await isDeclared(provider, deploymentArtifacts.classHash);
    const balance = await publicStrkBalance(provider, address);
    const estimator = new Account({ provider, address, signer: "0x1" });

    if (!classDeclared) {
      if (!adminAddress || !sameAddress(address, adminAddress)) {
        return NextResponse.json({ error: "Token creation will open after the template is registered." }, { status: 409 });
      }
      const fee = await estimator.estimateDeclareFee({ contract: deploymentArtifacts.contract, casm: deploymentArtifacts.casm });
      return NextResponse.json({
        stage: "declare",
        classDeclared,
        classHash: deploymentArtifacts.classHash,
        compiledClassHash: deploymentArtifacts.compiledClassHash,
        estimatedFee: BigInt(fee.overall_fee).toString(),
        publicBalance: balance.toString(),
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const token = parseTokenInput(body?.token);
    const total = cairo.uint256(token.baseUnits);
    const constructorCalldata = [
      address,
      total.low,
      total.high,
      shortString.encodeShortString(token.name),
      byteLength(token.name),
      shortString.encodeShortString(token.symbol),
      byteLength(token.symbol),
      token.decimals,
    ];
    const saltSeed = `droptron:fixed-token:v1:${address}:${token.name}:${token.symbol}:${token.baseUnits}:${token.decimals}`;
    const deploymentSalt = `0x${hash.starknetKeccak(saltSeed).toString(16)}`;
    const payload = { classHash: deploymentArtifacts.classHash, constructorCalldata, salt: deploymentSalt, unique: true };
    const fee = await estimator.estimateDeployFee(payload);
    const predictedAddress = defaultDeployer.buildDeployerCall(payload, address).addresses[0];

    return NextResponse.json({
      stage: "deploy",
      classDeclared,
      classHash: deploymentArtifacts.classHash,
      compiledClassHash: deploymentArtifacts.compiledClassHash,
      estimatedFee: BigInt(fee.overall_fee).toString(),
      publicBalance: balance.toString(),
      predictedAddress,
      deploymentSalt,
      token: { ...token, baseUnits: token.baseUnits.toString() },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[Droptron token estimate] failed", error);
    const message = error instanceof Error && !error.message.toLowerCase().includes("rpc")
      ? error.message
      : "The Mainnet estimate could not be completed. No transaction was submitted.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
