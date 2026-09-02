"use client";

import { useState } from "react";

import { useWallet } from "./wallet-provider";
import { networkLabel } from "./wallet-networks";

export { networkLabel } from "./wallet-networks";

function CopyIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6.5" y="6.5" width="9" height="9" rx="1.5" /><path d="M4 13.5H3.5A1.5 1.5 0 0 1 2 12V3.5A1.5 1.5 0 0 1 3.5 2H12a1.5 1.5 0 0 1 1.5 1.5V4" /></svg>;
}

export function WalletIdentity() {
  const { address, chainId, walletName } = useWallet();
  const [copied, setCopied] = useState(false);
  if (!address) return null;

  async function copyAddress() {
    await navigator.clipboard.writeText(address!);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return <section className="wallet-identity" aria-label="Connected Starknet account">
    <div className="wallet-identity__account"><span>Connected address</span><div><code>{address}</code><button type="button" onClick={() => void copyAddress()} aria-label="Copy Starknet address"><CopyIcon />{copied ? "Copied" : "Copy"}</button></div></div>
    <dl><div><dt>Network</dt><dd><i />{networkLabel(chainId)}</dd></div><div><dt>Wallet</dt><dd>{walletName ?? "Connected wallet"}</dd></div></dl>
  </section>;
}
