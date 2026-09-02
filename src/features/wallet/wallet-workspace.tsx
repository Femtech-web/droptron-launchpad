"use client";

import { PrivateActionPanel } from "@/features/privacy/private-action-panel";
import { WalletGate } from "@/features/wallet/wallet-gate";

import { WalletBalances } from "./wallet-balances";
import { WalletIdentity } from "./wallet-identity";
import { STRK_TOKEN_ADDRESS } from "./wallet-assets";
import { useWallet } from "./wallet-provider";

export function WalletWorkspace() {
  const { address } = useWallet();

  if (!address) return <WalletGate />;

  return <main className="wallet-workspace" id="main-content" tabIndex={-1}>
    <header className="wallet-workspace__intro">
      <div><p className="app-eyebrow">Wallet</p><h1>Wallet</h1><p>Shield assets, make private transfers, or withdraw to a public Starknet address.</p></div>
    </header>
    <WalletIdentity />
    <div className="wallet-workspace__surface">
      <WalletBalances />
      <PrivateActionPanel defaultToken={STRK_TOKEN_ADDRESS} />
    </div>
  </main>;
}
