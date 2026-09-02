"use client";

import { useState, type FormEvent } from "react";
import type { STRK20_ACTION } from "@starknet-io/types-js";

import { useWallet } from "@/features/wallet/wallet-provider";

import { submitPrivateActions } from "./strk20-actions";

type ActionKind = "deposit" | "transfer" | "withdraw";

const actionCopy: Record<ActionKind, { title: string; description: string; button: string }> = {
  deposit: { title: "Shield funds", description: "Move ERC-20 funds into STRK20. Your wallet will request approval, then deposit.", button: "Shield funds" },
  transfer: { title: "Private transfer", description: "Send shielded funds to a registered STRK20 recipient.", button: "Send privately" },
  withdraw: { title: "Unshield funds", description: "Withdraw shielded funds to a public Starknet address.", button: "Unshield funds" },
};

export function PrivateActionPanel({ defaultToken = "" }: { defaultToken?: string }) {
  const { privacyStatus, walletAccount } = useWallet();
  const [kind, setKind] = useState<ActionKind>("deposit");
  const [token, setToken] = useState(defaultToken);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const needsRecipient = kind !== "deposit";
  const canSubmit = privacyStatus === "supported" && Boolean(walletAccount) && Boolean(token) && Boolean(amount) && (!needsRecipient || Boolean(recipient));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!walletAccount || !canSubmit) return;
    setIsSubmitting(true);
    setMessage(null);

    try {
      const action: STRK20_ACTION = kind === "deposit" ? { type: "deposit", token, amount } : kind === "transfer" ? { type: "transfer", token, amount, recipient } : { type: "withdraw", token, amount, recipient };
      const result = await submitPrivateActions(walletAccount, [action]);
      setMessage(`Submitted: ${result.transaction_hash.slice(0, 10)}…${result.transaction_hash.slice(-6)}`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The wallet did not complete this private action.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return <section className="private-actions" aria-labelledby="private-actions-heading">
    <header><div><p className="app-eyebrow">STRK20</p><h2 id="private-actions-heading">Choose an action</h2></div></header>
    <div className="private-actions__body">
      <div className="action-tabs" role="tablist" aria-label="Private action"><button type="button" role="tab" aria-selected={kind === "deposit"} onClick={() => setKind("deposit")}>Shield</button><button type="button" role="tab" aria-selected={kind === "transfer"} onClick={() => setKind("transfer")}>Transfer</button><button type="button" role="tab" aria-selected={kind === "withdraw"} onClick={() => setKind("withdraw")}>Unshield</button></div>
      <form onSubmit={submit}><p className="action-description">{actionCopy[kind].description}</p><label><span>Token address</span><input value={token} onChange={(event) => setToken(event.target.value.trim())} placeholder="0x…" inputMode="text" required /></label><label><span>Amount · smallest units</span><input value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} placeholder="0" inputMode="numeric" required /></label>{needsRecipient && <label><span>Recipient address</span><input value={recipient} onChange={(event) => setRecipient(event.target.value.trim())} placeholder="0x…" inputMode="text" required /></label>}<button className="private-submit" type="submit" disabled={!canSubmit || isSubmitting}>{isSubmitting ? "Confirm in wallet…" : actionCopy[kind].button} <span>→</span></button>{privacyStatus === "unsupported" && <small className="action-hint">This wallet cannot sign STRK20 actions.</small>}{privacyStatus === "supported" && !walletAccount && <small className="action-hint">The RPC connection is unavailable.</small>}{message && <p className="action-message" aria-live="polite">{message}</p>}</form>
    </div>
  </section>;
}
