import { readFile } from "node:fs/promises";
import { Account, RpcProvider, constants, hash } from "starknet";
import { checkedSubmissionDetails } from "./deployment-safety.mjs";

const mode = process.argv[2] ?? "estimate";
const selectedTarget = process.argv[3] ?? "all";
const allowedModes = new Set([
  "estimate",
  "declare",
  "estimate-helper",
  "deploy-helper",
  "estimate-deploy",
  "deploy",
]);
const allowedTargets = new Set([
  "all",
  "token",
  "launch",
  "participation",
  "claim-series",
  "distribution-factory",
  "claim-redemption",
]);

if (!allowedModes.has(mode) || !allowedTargets.has(selectedTarget)) {
  throw new Error(
    "Usage: mainnet-contracts.mjs <estimate|declare|estimate-helper|deploy-helper|estimate-deploy|deploy> [target]",
  );
}
if (mode === "declare" && selectedTarget === "all") {
  throw new Error("Select one reviewed class for declaration; bulk Mainnet spending is disabled.");
}

function submissionDetails(expectedApproval, fee, nonce) {
  return checkedSubmissionDetails({
    expectedApproval,
    approval: process.env.MAINNET_DEPLOYMENT_APPROVAL,
    maxFeeStrk: process.env.MAINNET_MAX_FEE_STRK,
    fee,
    nonce,
  });
}

const rpcUrl = process.env.NEXT_PUBLIC_STARKNET_MAINNET_RPC_URL;
const address =
  process.env.STARKNET_MAINNET_DEPLOYER_ADDRESS ||
  process.env.NEXT_PUBLIC_MAINNET_ADMIN_ADDRESS;
const privateKey =
  process.env.STARKNET_MAINNET_DEPLOYER_PRIVATE_KEY ||
  process.env.STARKNET_MAINET_DEPLOYER_PRIVATE_KEY;
const poolAddress = process.env.NEXT_PUBLIC_STRK20_MAINNET_POOL_ADDRESS;

if (!rpcUrl) throw new Error("Missing NEXT_PUBLIC_STARKNET_MAINNET_RPC_URL.");
if (!address || !privateKey) {
  throw new Error(
    "Missing STARKNET_MAINNET_DEPLOYER_ADDRESS/NEXT_PUBLIC_MAINNET_ADMIN_ADDRESS or STARKNET_MAINNET_DEPLOYER_PRIVATE_KEY.",
  );
}
if (!poolAddress) throw new Error("Missing NEXT_PUBLIC_STRK20_MAINNET_POOL_ADDRESS.");

const artifactsDirectory = new URL("../contracts/target/dev/", import.meta.url);
const definitions = [
  { id: "token", label: "Fixed-supply token", artifact: "DroptronFixedSupplyToken" },
  { id: "launch", label: "Launch", artifact: "DroptronLaunch" },
  {
    id: "participation",
    label: "Private participation helper",
    artifact: "DroptronLaunchParticipation",
  },
  { id: "claim-series", label: "Funded claim series", artifact: "DroptronClaimSeries" },
  {
    id: "distribution-factory",
    label: "Distribution factory",
    artifact: "DroptronDistributionFactory",
  },
  {
    id: "claim-redemption",
    label: "Private claim helper",
    artifact: "DroptronClaimRedemption",
  },
];

async function loadDefinition(definition) {
  const prefix = `droptron_contracts_${definition.artifact}`;
  const contract = JSON.parse(
    await readFile(new URL(`${prefix}.contract_class.json`, artifactsDirectory), "utf8"),
  );
  const casm = JSON.parse(
    await readFile(
      new URL(`${prefix}.compiled_contract_class.json`, artifactsDirectory),
      "utf8",
    ),
  );
  return {
    ...definition,
    contract,
    casm,
    classHash: hash.computeContractClassHash(contract),
    compiledClassHash: hash.computeCompiledClassHash(casm),
  };
}

function formatStrk(value) {
  const amount = BigInt(value);
  const whole = amount / 10n ** 18n;
  const fraction = (amount % 10n ** 18n).toString().padStart(18, "0").slice(0, 6);
  return `${whole}.${fraction}`;
}

async function classExists(provider, classHash) {
  try {
    await provider.getClass(classHash);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes("class hash not found") || message.includes("class_hash_not_found")) {
      return false;
    }
    throw error;
  }
}

const provider = new RpcProvider({ nodeUrl: rpcUrl });
const chainId = await provider.getChainId();
if (chainId !== constants.StarknetChainId.SN_MAIN) {
  throw new Error(`Refusing to use the Mainnet deployment script on ${chainId}.`);
}

const account = new Account({ provider, address, signer: privateKey });
const definitionsToLoad = definitions.filter(
  ({ id }) => selectedTarget === "all" || id === selectedTarget,
);
const contracts = await Promise.all(definitionsToLoad.map(loadDefinition));

console.log(`Mainnet account: ${address}`);
console.log(`STRK20 pool: ${poolAddress}`);

if (["estimate-helper", "deploy-helper", "estimate-deploy", "deploy"].includes(mode)) {
  const deploymentTarget = selectedTarget === "all" ? "participation" : selectedTarget;
  if (!["participation", "distribution-factory", "claim-redemption"].includes(deploymentTarget)) {
    throw new Error("Deployable infrastructure targets: participation, distribution-factory, claim-redemption.");
  }
  const helper =
    contracts.find(({ id }) => id === deploymentTarget) ??
    (await loadDefinition(definitions.find(({ id }) => id === deploymentTarget)));
  if (!(await classExists(provider, helper.classHash))) {
    throw new Error(`Declare the reviewed ${helper.label} class before estimating deployment.`);
  }
  let constructorCalldata;
  if (deploymentTarget === "participation") {
    constructorCalldata = [poolAddress];
  } else if (deploymentTarget === "distribution-factory") {
    const series = await loadDefinition(definitions.find(({ id }) => id === "claim-series"));
    if (!(await classExists(provider, series.classHash))) {
      throw new Error("Declare the reviewed claim-series class before deploying its factory.");
    }
    constructorCalldata = [series.classHash];
  } else {
    const factoryAddress = process.env.NEXT_PUBLIC_MAINNET_DISTRIBUTION_FACTORY_ADDRESS;
    if (!factoryAddress) throw new Error("Missing NEXT_PUBLIC_MAINNET_DISTRIBUTION_FACTORY_ADDRESS.");
    const factory = await loadDefinition(definitions.find(({ id }) => id === "distribution-factory"));
    const deployedClass = await provider.getClassHashAt(factoryAddress);
    if (BigInt(deployedClass) !== BigInt(factory.classHash)) {
      throw new Error("Configured distribution factory is not the reviewed factory class.");
    }
    constructorCalldata = [poolAddress, factoryAddress];
  }
  const constructorBinding = constructorCalldata.join(":");
  const payload = {
    classHash: helper.classHash,
    constructorCalldata,
    unique: true,
    salt: hash.starknetKeccak(
      `droptron:${deploymentTarget}:${address}:${constructorBinding}:${helper.classHash}`,
    ),
  };
  const nonce = await account.getNonce();
  const fee = await account.estimateDeployFee(payload, { skipValidate: false, nonce, tip: 0n });
  console.log(`${helper.label} class: ${helper.classHash}`);
  console.log(`Estimated deployment fee: ${formatStrk(fee.overall_fee)} STRK`);
  console.log(`Constructor binding: ${constructorBinding}`);
  if (mode === "estimate-helper" || mode === "estimate-deploy") {
    console.log("Estimate only. No transaction was submitted.");
    process.exit(0);
  }
  const deployment = await account.deployContract(
    payload,
    submissionDetails(`deploy:${helper.classHash}:${constructorBinding}`, fee, nonce),
  );
  console.log(`Helper deployment submitted: ${deployment.transaction_hash}`);
  await provider.waitForTransaction(deployment.transaction_hash);
  console.log(`${helper.label} deployed: ${deployment.address}`);
  process.exit(0);
}

let totalEstimatedFee = 0n;
for (const contract of contracts) {
  const declared = await classExists(provider, contract.classHash);
  console.log(`\n${contract.label}`);
  console.log(`Class hash: ${contract.classHash}`);
  console.log(`Compiled class hash: ${contract.compiledClassHash}`);
  if (declared) {
    console.log("Status: already declared");
    continue;
  }
  const payload = { contract: contract.contract, casm: contract.casm };
  // The SDK defaults to skipping account validation for estimates. Mainnet
  // preflight must prove this signer is accepted by the actual account.
  const nonce = await account.getNonce();
  const fee = await account.estimateDeclareFee(payload, { skipValidate: false, nonce, tip: 0n });
  totalEstimatedFee += BigInt(fee.overall_fee);
  console.log(`Estimated declaration fee: ${formatStrk(fee.overall_fee)} STRK`);
  if (mode === "declare") {
    const declaration = await account.declare(
      payload,
      submissionDetails(`declare:${contract.classHash}`, fee, nonce),
    );
    console.log(`Declaration submitted: ${declaration.transaction_hash}`);
    await provider.waitForTransaction(declaration.transaction_hash);
    console.log(`Declared class: ${declaration.class_hash}`);
  }
}

if (mode === "estimate") {
  console.log(`\nTotal estimated declaration fee: ${formatStrk(totalEstimatedFee)} STRK`);
  console.log("Estimate only. No transaction was submitted.");
}
