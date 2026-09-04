"use client";

import { WalletButton } from "./wallet-button";

export function WalletGate({ secondaryLabel, onSecondary }: { secondaryLabel?: string; onSecondary?: () => void }) {
  return <main className="wallet-gate-screen" id="main-content" tabIndex={-1}>
    <section className="wallet-gate-card" aria-labelledby="wallet-gate-title">
      <img className="wallet-gate-mark" src="/brand/droptron-mark.svg" alt="" />
      <h1 id="wallet-gate-title">Enter the launch desk.</h1>
      <p>Connect your wallet to open Droptron.</p>
      <WalletButton />
      {secondaryLabel && onSecondary && <button className="wallet-gate-secondary" type="button" onClick={onSecondary}>{secondaryLabel} <span>→</span></button>}
    </section>
  </main>;
}
