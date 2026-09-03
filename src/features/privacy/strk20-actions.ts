import type { STRK20_ACTION } from "@starknet-io/types-js";
import type { WalletAccountV6 } from "starknet";

const FELT = /^0x(?:0|[1-9a-f][0-9a-f]{0,62})$/i;

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

/**
 * The single app boundary for STRK20 requests. It accepts wallet-mediated
 * actions only; Droptron never accesses a viewing key, proof, or note state.
 */
export async function submitPrivateActions(account: WalletAccountV6, actions: STRK20_ACTION[]) {
  if (actions.length === 0) throw new Error("At least one private action is required.");
  validateActions(actions);
  return account.strk20InvokeTransaction(actions);
}
