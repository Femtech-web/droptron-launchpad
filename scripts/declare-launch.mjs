import { readFile } from "node:fs/promises";
import { Account, RpcProvider, constants, hash } from "starknet";

const mode = process.argv[2] ?? "estimate";
if (!new Set(["estimate", "declare"]).has(mode)) throw new Error("Usage: declare-launch.mjs <estimate|declare>");

const rpcUrl = process.env.NEXT_PUBLIC_STARKNET_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_STARKNET_RPC_URL;
const address = process.env.STARKNET_SEPOLIA_DEPLOYER_ADDRESS;
const privateKey = process.env.STARKNET_SEPOLIA_DEPLOYER_PRIVATE_KEY;
if (!rpcUrl) throw new Error("Missing NEXT_PUBLIC_STARKNET_SEPOLIA_RPC_URL (or its legacy fallback).");
if (!address || !privateKey) throw new Error("Missing STARKNET_SEPOLIA_DEPLOYER_ADDRESS or STARKNET_SEPOLIA_DEPLOYER_PRIVATE_KEY.");

const artifacts = new URL("../contracts/target/dev/", import.meta.url);
const contract = JSON.parse(await readFile(new URL("droptron_contracts_DroptronLaunch.contract_class.json", artifacts), "utf8"));
const casm = JSON.parse(await readFile(new URL("droptron_contracts_DroptronLaunch.compiled_contract_class.json", artifacts), "utf8"));
const classHash = hash.computeContractClassHash(contract);
const compiledClassHash = hash.computeCompiledClassHash(casm);
const configuredClassHash = process.env.NEXT_PUBLIC_SEPOLIA_LAUNCH_CLASS_HASH;
if (configuredClassHash && BigInt(configuredClassHash) !== BigInt(classHash)) throw new Error(`Configured launch class hash does not match the current artifact. Expected ${classHash}.`);

const provider = new RpcProvider({ nodeUrl: rpcUrl });
const chainId = await provider.getChainId();
if (chainId !== constants.StarknetChainId.SN_SEPOLIA) throw new Error(`Refusing to declare the launch class outside Sepolia. Connected chain: ${chainId}`);

try {
  await provider.getClass(classHash);
  console.log(`Launch class is already declared: ${classHash}`);
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (!message.includes("class hash not found") && !message.includes("class_hash_not_found")) throw error;
}

const account = new Account({ provider, address, signer: privateKey });
const payload = { contract, casm };
const fee = await account.estimateDeclareFee(payload);
const overallFee = BigInt(fee.overall_fee);
const whole = overallFee / 10n ** 18n;
const fraction = (overallFee % 10n ** 18n).toString().padStart(18, "0").slice(0, 6);
console.log(`Launch class hash: ${classHash}`);
console.log(`Compiled class hash: ${compiledClassHash}`);
console.log(`Estimated declaration fee: ${whole}.${fraction} STRK`);
if (mode === "estimate") {
  console.log("Estimate only. No transaction was submitted.");
  process.exit(0);
}

const declaration = await account.declare(payload);
console.log(`Declaration submitted: ${declaration.transaction_hash}`);
await provider.waitForTransaction(declaration.transaction_hash);
console.log(`Launch class declared: ${declaration.class_hash}`);
