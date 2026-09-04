import { NextRequest, NextResponse } from "next/server";
import {
  Account,
  RpcProvider,
  constants,
  defaultDeployer,
  hash,
  type CompiledContract,
  type CompiledSierraCasm,
} from "starknet";

import claimRedemptionCasm from "../../../../../contracts/target/dev/droptron_contracts_DroptronClaimRedemption.compiled_contract_class.json";
import claimRedemptionContract from "../../../../../contracts/target/dev/droptron_contracts_DroptronClaimRedemption.contract_class.json";
import claimSeriesCasm from "../../../../../contracts/target/dev/droptron_contracts_DroptronClaimSeries.compiled_contract_class.json";
import claimSeriesContract from "../../../../../contracts/target/dev/droptron_contracts_DroptronClaimSeries.contract_class.json";
import distributionFactoryCasm from "../../../../../contracts/target/dev/droptron_contracts_DroptronDistributionFactory.compiled_contract_class.json";
import distributionFactoryContract from "../../../../../contracts/target/dev/droptron_contracts_DroptronDistributionFactory.contract_class.json";
import fixedTokenCasm from "../../../../../contracts/target/dev/droptron_contracts_DroptronFixedSupplyToken.compiled_contract_class.json";
import fixedTokenContract from "../../../../../contracts/target/dev/droptron_contracts_DroptronFixedSupplyToken.contract_class.json";
import launchCasm from "../../../../../contracts/target/dev/droptron_contracts_DroptronLaunch.compiled_contract_class.json";
import launchContract from "../../../../../contracts/target/dev/droptron_contracts_DroptronLaunch.contract_class.json";
import participationCasm from "../../../../../contracts/target/dev/droptron_contracts_DroptronLaunchParticipation.compiled_contract_class.json";
import participationContract from "../../../../../contracts/target/dev/droptron_contracts_DroptronLaunchParticipation.contract_class.json";
import { currentWalletSession } from "@/lib/wallet-session";

export const dynamic = "force-dynamic";

const STRK_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const POOL_ADDRESS = "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";

type ArtifactSource = typeof fixedTokenContract;
type Definition = { id: string; label: string; purpose: string; contract: ArtifactSource; casm: CompiledSierraCasm };

const definitions: Definition[] = [
  { id: "fixed-token", label: "Fixed-supply token", purpose: "Reusable creator token template", contract: fixedTokenContract as ArtifactSource, casm: fixedTokenCasm as CompiledSierraCasm },
  { id: "launch", label: "Launch", purpose: "Public sale terms and settlement", contract: launchContract as ArtifactSource, casm: launchCasm as CompiledSierraCasm },
  { id: "participation", label: "Private participation", purpose: "STRK20 launch purchase helper", contract: participationContract as ArtifactSource, casm: participationCasm as CompiledSierraCasm },
  { id: "claim-series", label: "Claim series", purpose: "Airdrop and vesting claim receipts", contract: claimSeriesContract as ArtifactSource, casm: claimSeriesCasm as CompiledSierraCasm },
  { id: "distribution-factory", label: "Distribution factory", purpose: "Creates verified claim series", contract: distributionFactoryContract as ArtifactSource, casm: distributionFactoryCasm as CompiledSierraCasm },
  { id: "claim-redemption", label: "Private claim redemption", purpose: "Moves claimed assets back into STRK20", contract: claimRedemptionContract as ArtifactSource, casm: claimRedemptionCasm as CompiledSierraCasm },
];

function sameAddress(left: string, right: string) {
  try { return BigInt(left) === BigInt(right); } catch { return false; }
}

function walletContract(source: ArtifactSource): CompiledContract {
  return {
    contract_class_version: source.contract_class_version,
    sierra_program: source.sierra_program,
    entry_points_by_type: source.entry_points_by_type,
    abi: source.abi,
  } as unknown as CompiledContract;
}

function artifact(definition: Definition) {
  const contract = walletContract(definition.contract);
  return {
    contract,
    casm: definition.casm,
    classHash: hash.computeContractClassHash(contract),
    compiledClassHash: hash.computeCompiledClassHash(definition.casm),
  };
}

function deploymentId(value: string) {
  return value === "deploy-participation" || value === "deploy-distribution-factory" || value === "deploy-claim-redemption";
}

function saltFor(id: string) {
  return `0x${hash.starknetKeccak(`droptron:mainnet:${id}:v1`).toString(16)}`;
}

function deploymentPayload(id: string, admin: string) {
  const byId = Object.fromEntries(definitions.map((definition) => [definition.id, artifact(definition)]));
  const factoryPayload = {
    classHash: byId["distribution-factory"].classHash,
    constructorCalldata: [byId["claim-series"].classHash],
    salt: saltFor("distribution-factory"),
    unique: true,
  };
  const factoryAddress = defaultDeployer.buildDeployerCall(factoryPayload, admin).addresses[0];
  if (id === "deploy-participation") return {
    label: "Private participation instance",
    purpose: "Connects launches to the Mainnet STRK20 pool",
    dependsOn: ["participation"],
    payload: { classHash: byId.participation.classHash, constructorCalldata: [POOL_ADDRESS], salt: saltFor("participation"), unique: true },
  };
  if (id === "deploy-distribution-factory") return {
    label: "Distribution factory instance",
    purpose: "Creates airdrop and vesting claim series",
    dependsOn: ["claim-series", "distribution-factory"],
    payload: factoryPayload,
  };
  return {
    label: "Private claim instance",
    purpose: "Redeems claim receipts through the Mainnet STRK20 pool",
    dependsOn: ["claim-redemption", "deploy-distribution-factory"],
    payload: { classHash: byId["claim-redemption"].classHash, constructorCalldata: [POOL_ADDRESS, factoryAddress], salt: saltFor("claim-redemption"), unique: true },
  };
}

async function authorizedContext() {
  const session = await currentWalletSession();
  const admin = process.env.NEXT_PUBLIC_MAINNET_ADMIN_ADDRESS?.trim();
  const rpcUrl = process.env.NEXT_PUBLIC_STARKNET_MAINNET_RPC_URL?.trim();
  if (!session || session.chainId !== "SN_MAIN" || !admin || !sameAddress(session.walletAddress, admin)) return null;
  if (!rpcUrl) throw new Error("The Mainnet RPC is not configured.");
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  if (await provider.getChainId() !== constants.StarknetChainId.SN_MAIN) throw new Error("The configured RPC is not Starknet Mainnet.");
  return { session, admin, provider };
}

async function isDeclared(provider: RpcProvider, classHash: string) {
  try { await provider.getClass(classHash); return true; } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes("class hash not found") || message.includes("class_hash_not_found")) return false;
    throw error;
  }
}

async function isDeployed(provider: RpcProvider, address: string) {
  try { return Boolean(await provider.getClassHashAt(address)); } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes("contract not found") || message.includes("contract_not_found") || message.includes("uninitialized")) return false;
    throw error;
  }
}

async function publicStrkBalance(provider: RpcProvider, address: string) {
  const result = await provider.callContract({ contractAddress: STRK_ADDRESS, entrypoint: "balance_of", calldata: [address] });
  return BigInt(result[0] ?? 0) + (BigInt(result[1] ?? 0) << BigInt(128));
}

export async function GET(request: NextRequest) {
  try {
    const context = await authorizedContext();
    if (!context) return NextResponse.json({ error: "This deployment workspace is restricted." }, { status: 403 });
    const artifactId = request.nextUrl.searchParams.get("artifact");
    if (artifactId) {
      const definition = definitions.find((item) => item.id === artifactId);
      if (!definition) return NextResponse.json({ error: "Unknown contract template." }, { status: 404 });
      return NextResponse.json(artifact(definition), { headers: { "Cache-Control": "no-store" } });
    }
    const declaredPairs = await Promise.all(definitions.map(async (definition) => {
      const details = artifact(definition);
      return [definition.id, await isDeclared(context.provider, details.classHash)] as const;
    }));
    const declared = Object.fromEntries(declaredPairs) as Record<string, boolean>;
    const declarationSteps = definitions.map((definition) => {
      const details = artifact(definition);
      return { id: definition.id, kind: "declare", label: definition.label, purpose: definition.purpose, complete: declared[definition.id], available: true, classHash: details.classHash, compiledClassHash: details.compiledClassHash };
    });
    const deploymentSteps = await Promise.all(["deploy-participation", "deploy-distribution-factory", "deploy-claim-redemption"].map(async (id) => {
      const deployment = deploymentPayload(id, context.admin);
      const address = defaultDeployer.buildDeployerCall(deployment.payload, context.admin).addresses[0];
      const available = deployment.dependsOn.every((dependency) => dependency.startsWith("deploy-") ? false : declared[dependency]);
      return { id, kind: "deploy", label: deployment.label, purpose: deployment.purpose, complete: await isDeployed(context.provider, address), available, address, classHash: deployment.payload.classHash, dependsOn: deployment.dependsOn };
    }));
    const factoryComplete = deploymentSteps.find((step) => step.id === "deploy-distribution-factory")?.complete ?? false;
    const claimStep = deploymentSteps.find((step) => step.id === "deploy-claim-redemption");
    if (claimStep) claimStep.available = declared["claim-redemption"] && factoryComplete;
    return NextResponse.json({ admin: context.admin, poolAddress: POOL_ADDRESS, steps: [...declarationSteps, ...deploymentSteps] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[Droptron Mainnet deployment] status failed", error);
    return NextResponse.json({ error: "The Mainnet deployment status could not be loaded." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authorizedContext();
    if (!context) return NextResponse.json({ error: "This deployment workspace is restricted." }, { status: 403 });
    const body = await request.json().catch(() => null) as { id?: unknown } | null;
    const id = typeof body?.id === "string" ? body.id : "";
    const definition = definitions.find((item) => item.id === id);
    const estimator = new Account({ provider: context.provider, address: context.admin, signer: "0x1" });
    const publicBalance = await publicStrkBalance(context.provider, context.admin);
    if (definition) {
      const details = artifact(definition);
      if (await isDeclared(context.provider, details.classHash)) return NextResponse.json({ error: "This contract class is already registered." }, { status: 409 });
      // The server does not hold the Ready signer. Skip account validation for
      // the preview; Ready performs the real validation before submission.
      const fee = await estimator.estimateDeclareFee(
        { contract: details.contract, casm: details.casm },
        { skipValidate: true },
      );
      return NextResponse.json({ id, kind: "declare", label: definition.label, classHash: details.classHash, compiledClassHash: details.compiledClassHash, estimatedFee: BigInt(fee.overall_fee).toString(), publicBalance: publicBalance.toString() });
    }
    if (!deploymentId(id)) return NextResponse.json({ error: "Unknown deployment step." }, { status: 404 });
    const deployment = deploymentPayload(id, context.admin);
    for (const dependency of deployment.dependsOn) {
      if (dependency.startsWith("deploy-")) {
        const dependencyDeployment = deploymentPayload(dependency, context.admin);
        const dependencyAddress = defaultDeployer.buildDeployerCall(dependencyDeployment.payload, context.admin).addresses[0];
        if (!await isDeployed(context.provider, dependencyAddress)) return NextResponse.json({ error: "Complete the preceding infrastructure step first." }, { status: 409 });
      } else {
        const dependencyDefinition = definitions.find((item) => item.id === dependency);
        if (!dependencyDefinition || !await isDeclared(context.provider, artifact(dependencyDefinition).classHash)) return NextResponse.json({ error: "Register the required contract template first." }, { status: 409 });
      }
    }
    const predictedAddress = defaultDeployer.buildDeployerCall(deployment.payload, context.admin).addresses[0];
    if (await isDeployed(context.provider, predictedAddress)) return NextResponse.json({ error: "This infrastructure contract is already deployed." }, { status: 409 });
    const fee = await estimator.estimateDeployFee(deployment.payload, { skipValidate: true });
    return NextResponse.json({ id, kind: "deploy", label: deployment.label, estimatedFee: BigInt(fee.overall_fee).toString(), publicBalance: publicBalance.toString(), predictedAddress, payload: deployment.payload });
  } catch (error) {
    console.error("[Droptron Mainnet deployment] estimate failed", error);
    const message = error instanceof Error && !error.message.toLowerCase().includes("rpc") ? error.message : "The Mainnet estimate could not be completed. No transaction was submitted.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
