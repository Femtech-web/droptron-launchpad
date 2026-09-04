import {
  hash,
  walletV6,
  type CompiledContract,
  type CompiledSierraCasm,
  type WalletAccountV6,
} from "starknet";

type ReviewedDeclaration = {
  contract: CompiledContract;
  casm: CompiledSierraCasm;
  classHash: string;
  compiledClassHash: string;
};

type LegacyDeclareResult = {
  transaction_hash: string;
  class_hash: string;
};

type ReadyLegacyProvider = {
  selectedAddress?: string;
  enable?: (options?: { starknetVersion?: "v5" }) => Promise<string[]>;
  account?: {
    declare: (payload: {
      contract: CompiledContract;
      casm: CompiledSierraCasm;
      classHash: string;
      compiledClassHash: string;
    }) => Promise<LegacyDeclareResult>;
  };
};

function sameAddress(left?: string, right?: string) {
  if (!left || !right) return false;
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
}

async function readyLegacyProvider(address: string) {
  if (typeof window === "undefined") return null;
  const provider = (window as Window & {
    starknet_argentX?: ReadyLegacyProvider;
  }).starknet_argentX;

  if (!provider) return null;

  if (!provider.account && provider.enable) {
    const accounts = await provider.enable({ starknetVersion: "v5" });
    if (!accounts.some((account) => sameAddress(account, address))) {
      throw new Error("Ready connected a different account. Select the reviewed Mainnet admin account and try again.");
    }
  }

  if (!provider.account) {
    return null;
  }
  if (!sameAddress(provider.selectedAddress, address)) {
    throw new Error("Ready connected a different account. Select the reviewed Mainnet admin account and try again.");
  }
  return provider;
}

async function readyAccountHasGuardian(walletAccount: WalletAccountV6) {
  try {
    const result = await walletAccount.provider.callContract({
      contractAddress: walletAccount.address,
      entrypoint: "get_guardian",
      calldata: [],
    });
    return BigInt(result[0] ?? 0) !== BigInt(0);
  } catch {
    // Older/non-Ready accounts may not expose this view. Let the wallet decide
    // support instead of treating a missing optional view as a hard failure.
    return false;
  }
}

/**
 * Ready's Wallet API declaration adapter currently serializes the Sierra class
 * and omits its CASM before fee simulation. That path can render a correct
 * class review while leaving Confirm disabled because no wallet-side fee was
 * produced. Ready's backwards-compatible account path sends the complete
 * starknet.js declaration payload and is therefore preferred for Ready only.
 * Other wallets continue through the standard Wallet API.
 */
export async function declareReviewedContract(
  walletAccount: WalletAccountV6,
  declaration: ReviewedDeclaration,
) {
  const computedClassHash = hash.computeContractClassHash(declaration.contract);
  if (BigInt(computedClassHash) !== BigInt(declaration.classHash)) {
    throw new Error("The contract artifact does not match its reviewed class hash.");
  }

  const isReady = /ready|argent/i.test(walletAccount.walletProvider.name);
  if (isReady && await readyAccountHasGuardian(walletAccount)) {
    throw new Error(
      "READY_GUARDED_DECLARE_UNSUPPORTED: Ready cannot currently register Sierra contracts from this guardian-protected account."
    );
  }

  const ready = await readyLegacyProvider(walletAccount.address);
  if (ready?.account) {
    console.info("[Droptron declaration] requesting Ready compatibility path", {
      classHash: declaration.classHash,
      compiledClassHash: declaration.compiledClassHash,
    });
    return ready.account.declare({
      contract: declaration.contract,
      casm: declaration.casm,
      classHash: declaration.classHash,
      compiledClassHash: declaration.compiledClassHash,
    });
  }

  if (isReady) {
    throw new Error(
      "Ready's declaration account is not connected. Reconnect Ready, then review the fee again."
    );
  }

  type DeclareParameters = Parameters<typeof walletV6.addDeclareTransaction>[1];
  const params = {
    class_hash: declaration.classHash,
    compiled_class_hash: declaration.compiledClassHash,
    contract_class: declaration.contract,
  } as unknown as DeclareParameters;

  console.info("[Droptron declaration] requesting Ready", {
    classHash: declaration.classHash,
    compiledClassHash: declaration.compiledClassHash,
  });
  type V6Wallet = Parameters<typeof walletV6.addDeclareTransaction>[0];
  const result = await walletV6.addDeclareTransaction(
    walletAccount.walletProvider as unknown as V6Wallet,
    params,
  );
  console.info("[Droptron declaration] Ready accepted request", result);
  return result;
}
