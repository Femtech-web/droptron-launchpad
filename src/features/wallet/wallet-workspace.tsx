"use client";

import { useEffect, useState } from "react";

import {
  PrivateActionPanel,
  type ActionKind,
} from "@/features/privacy/private-action-panel";
import { privacySetupIssue, type PrivacySetupIssue } from "@/features/privacy/privacy-registration";
import { WalletGate } from "@/features/wallet/wallet-gate";

import { WalletBalances } from "./wallet-balances";
import { WalletIdentity } from "./wallet-identity";
import { useWallet } from "./wallet-provider";

export function WalletWorkspace() {
  const { address, chainId } = useWallet();
  const [privacySetup, setPrivacySetup] = useState<PrivacySetupIssue>("unknown");
  const [selection, setSelection] = useState<{
    token: string;
    symbol: string;
    kind: ActionKind;
    availableBalance?: bigint;
    version: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const result = await privacySetupIssue(address, chainId);
      if (active) setPrivacySetup(result);
    };
    void check();
    const handleFocus = () => void check();
    window.addEventListener("focus", handleFocus);
    window.addEventListener("droptron:private-action-submitted", handleFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("droptron:private-action-submitted", handleFocus);
    };
  }, [address, chainId]);

  if (!address) return <WalletGate />;

  return (
    <main className="wallet-workspace" id="main-content" tabIndex={-1}>
      <header className="wallet-workspace__intro">
        <div>
          <p className="app-eyebrow">Wallet</p>
          <h1>Wallet</h1>
          <p>
            Shield assets, make private transfers, or withdraw to a public
            Starknet address.
          </p>
        </div>
      </header>
      <WalletIdentity />
      {privacySetup === "unregistered" && <aside className="wallet-privacy-note" aria-label="Private token setup">
        <span aria-hidden="true">i</span>
        <div><strong>Turn on private tokens</strong><p>Use Ready (formerly Argent X), then open Settings → Private tokens to enable private balances and transfers.</p></div>
      </aside>}
      <WalletBalances
        onAction={(token, symbol, kind, availableBalance) =>
          setSelection((current) => ({
            token,
            symbol,
            kind,
            availableBalance,
            version: (current?.version ?? 0) + 1,
          }))
        }
      />
      {selection && (
        <PrivateActionPanel
          key={selection.version}
          defaultToken={selection.token}
          defaultKind={selection.kind}
          tokenLabel={selection.symbol}
          availableBalance={selection.availableBalance}
          modal
          onClose={() => setSelection(null)}
        />
      )}
    </main>
  );
}
