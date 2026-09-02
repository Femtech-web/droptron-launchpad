import type { STRK20_ACTION } from "@starknet-io/types-js";
import type { WalletAccountV6 } from "starknet";

/**
 * The single app boundary for STRK20 requests. It accepts wallet-mediated
 * actions only; Droptron never accesses a viewing key, proof, or note state.
 */
export async function submitPrivateActions(account: WalletAccountV6, actions: STRK20_ACTION[]) {
  if (actions.length === 0) throw new Error("At least one private action is required.");
  return account.strk20InvokeTransaction(actions);
}
