import type { STRK20_ACTION } from "@starknet-io/types-js";
import type { WalletAccountV6 } from "starknet";

const FELT = /^0x(?:0|[1-9a-f][0-9a-f]{0,62})$/i;
const pendingRequests = new WeakMap<WalletAccountV6, Map<string, Promise<{ transaction_hash: string }>>>();
const completedOneTimeRequests = new Map<string, { transaction_hash: string }>();
const IDEMPOTENCY_STORAGE_PREFIX = "droptron.private-request.v1:";
let requestSequence = 0;

type PrivateRequestOptions = {
  /** Stable only for workflow stages that must never intentionally repeat. */
  idempotencyKey?: string;
};

function accountScopedKey(account: WalletAccountV6, idempotencyKey: string) {
  let address = account.address.toLowerCase();
  try { address = `0x${BigInt(account.address).toString(16)}`; } catch { /* Keep the wallet value. */ }
  return `${address}:${idempotencyKey}`;
}

function readCompletedOneTimeRequest(key: string) {
  const inMemory = completedOneTimeRequests.get(key);
  if (inMemory) return inMemory;
  if (typeof window === "undefined") return null;
  try {
    const transactionHash = window.sessionStorage.getItem(`${IDEMPOTENCY_STORAGE_PREFIX}${key}`);
    if (!transactionHash) return null;
    const result = { transaction_hash: transactionHash };
    completedOneTimeRequests.set(key, result);
    return result;
  } catch {
    return null;
  }
}

function rememberCompletedOneTimeRequest(key: string, result: { transaction_hash: string }) {
  completedOneTimeRequests.set(key, result);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${IDEMPOTENCY_STORAGE_PREFIX}${key}`, result.transaction_hash);
  } catch {
    // The in-memory guard still protects the current application lifetime.
  }
}

function assertFelt(value: string, field: string) {
  if (!FELT.test(value)) throw new Error(`INVALID_REQUEST_PAYLOAD: ${field} must be a canonical felt.`);
}

function validateActions(actions: STRK20_ACTION[]) {
  for (const action of actions) {
    if (action.type === "invoke") {
      assertFelt(action.contract, "contract");
      continue;
    }
    assertFelt(action.token, "token");
    if (action.amount !== "OPEN") assertFelt(action.amount, "amount");
    if (action.type !== "deposit") assertFelt(action.recipient, "recipient");
  }
}

async function diagnosticFingerprint(value: string) {
  try {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    );
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    return "unavailable";
  }
}

/**
 * The single app boundary for STRK20 requests. It accepts wallet-mediated
 * actions only; Droptron never accesses a viewing key, proof, or note state.
 */
export async function submitPrivateActions(
  account: WalletAccountV6,
  actions: STRK20_ACTION[],
  options: PrivateRequestOptions = {},
) {
  if (actions.length === 0) throw new Error("At least one private action is required.");
  validateActions(actions);
  const oneTimeKey = options.idempotencyKey
    ? accountScopedKey(account, options.idempotencyKey)
    : null;
  const completed = oneTimeKey ? readCompletedOneTimeRequest(oneTimeKey) : null;
  if (completed) {
    console.warn("[Droptron STRK20] blocked repeated one-time private request", {
      transactionHash: completed.transaction_hash,
    });
    throw new Error(`PRIVATE_REQUEST_ALREADY_SUBMITTED: This one-time action already returned transaction ${completed.transaction_hash}. No new wallet request was opened.`);
  }
  const fingerprint = JSON.stringify(actions);
  let accountRequests = pendingRequests.get(account);
  if (!accountRequests) {
    accountRequests = new Map();
    pendingRequests.set(account, accountRequests);
  }
  const pending = accountRequests.get(fingerprint);
  if (pending) {
    console.info("[Droptron STRK20] reused in-flight private request");
    return pending;
  }

  const requestId = `private-${Date.now()}-${++requestSequence}`;
  const startedAt = Date.now();
  const request = (async () => {
    console.info("[Droptron STRK20] private request started", {
      requestId,
      actionCount: actions.length,
      actionTypes: actions.map((action) => action.type),
      fingerprint: await diagnosticFingerprint(fingerprint),
      wallet: account.walletProvider.name,
    });
    return account.strk20InvokeTransaction(actions);
  })();
  accountRequests.set(fingerprint, request);
  try {
    const result = await request;
    console.info("[Droptron STRK20] private request resolved", {
      requestId,
      transactionHash: result.transaction_hash,
      elapsedMs: Date.now() - startedAt,
    });
    if (oneTimeKey) rememberCompletedOneTimeRequest(oneTimeKey, result);
    return result;
  } catch (error) {
    console.error("[Droptron STRK20] private request failed", {
      requestId,
      error,
    });
    throw error;
  } finally {
    accountRequests.delete(fingerprint);
  }
}
