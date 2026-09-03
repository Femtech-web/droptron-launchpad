import { readFile } from "node:fs/promises";
import { Account, RpcProvider, constants, shortString } from "starknet";

const mode = process.argv[2] ?? "estimate";

if (!new Set(["estimate", "deploy"]).has(mode)) {
  throw new Error("Usage: deploy-drop.mjs <estimate|deploy>");
}

const rpcUrl =
  process.env.NEXT_PUBLIC_STARKNET_SEPOLIA_RPC_URL ||
  process.env.NEXT_PUBLIC_STARKNET_RPC_URL;
const address = process.env.STARKNET_SEPOLIA_DEPLOYER_ADDRESS;
const privateKey = process.env.STARKNET_SEPOLIA_DEPLOYER_PRIVATE_KEY;

if (!rpcUrl) {
  throw new Error("Missing NEXT_PUBLIC_STARKNET_SEPOLIA_RPC_URL (or its legacy fallback).");
}

if (!address || !privateKey) {
  throw new Error(
    "Missing STARKNET_SEPOLIA_DEPLOYER_ADDRESS or STARKNET_SEPOLIA_DEPLOYER_PRIVATE_KEY.",
  );
}

const artifactsDirectory = new URL("../contracts/target/dev/", import.meta.url);
const sierra = JSON.parse(
  await readFile(
    new URL("droptron_contracts_DroptronFixedSupplyToken.contract_class.json", artifactsDirectory),
    "utf8",
  ),
);
const casm = JSON.parse(
  await readFile(
    new URL(
      "droptron_contracts_DroptronFixedSupplyToken.compiled_contract_class.json",
      artifactsDirectory,
    ),
    "utf8",
  ),
);

const provider = new RpcProvider({ nodeUrl: rpcUrl });
const chainId = await provider.getChainId();

if (chainId !== constants.StarknetChainId.SN_SEPOLIA) {
  throw new Error(`Refusing to deploy DROP outside Sepolia. Connected chain: ${chainId}`);
}

const account = new Account({
  provider,
  address,
  signer: privateKey,
});

const declarePayload = { contract: sierra, casm };
const fee = await account.estimateDeclareFee(declarePayload);
const overallFee = BigInt(fee.overall_fee);
const whole = overallFee / 10n ** 18n;
const fraction = (overallFee % 10n ** 18n).toString().padStart(18, "0").slice(0, 6);

console.log(`Ready account validated on Sepolia: ${address}`);
console.log(`Estimated DROP declaration fee: ${whole}.${fraction} STRK`);

if (mode === "estimate") {
  console.log("Estimate only. No transaction was submitted.");
  process.exit(0);
}

const declaration = await account.declareIfNot(declarePayload);

if (declaration.transaction_hash) {
  console.log(`Declaration submitted: ${declaration.transaction_hash}`);
  await provider.waitForTransaction(declaration.transaction_hash);
} else {
  console.log(`DROP class was already declared: ${declaration.class_hash}`);
}

const initialSupply = 1_000_000n * 10n ** 18n;
const deployment = await account.deployContract({
  classHash: declaration.class_hash,
  constructorCalldata: [
    address,
    initialSupply.toString(),
    "0",
    shortString.encodeShortString("Droptron Token"),
    "19",
    shortString.encodeShortString("DROP"),
    "4",
    "18",
  ],
  unique: true,
});

console.log(`Deployment submitted: ${deployment.transaction_hash}`);
await provider.waitForTransaction(deployment.transaction_hash);
console.log(`DROP deployed: ${deployment.address}`);
console.log(`NEXT_PUBLIC_SEPOLIA_DROP_TOKEN_ADDRESS=${deployment.address}`);
