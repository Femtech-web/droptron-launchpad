"use client";

import { useState } from "react";

import { networkLabel } from "./wallet-identity";
import { useWallet } from "./wallet-provider";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletButton() {
  const { address, chainId, connect, disconnect, error, isConnecting, walletName, wallets } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (address) {
    return <div className="wallet-control">
      <button className="wallet-button wallet-button--connected" type="button" onClick={() => setIsOpen((value) => !value)} aria-expanded={isOpen}><span />{shortenAddress(address)}</button>
      {isOpen && <div className="wallet-menu wallet-menu--account" role="dialog" aria-label="Connected Starknet account">
        <div><strong>{walletName ?? "Connected wallet"}</strong><small>{networkLabel(chainId)}</small></div>
        <code title={address}>{address}</code>
        <button type="button" onClick={() => void copyAddress()}>{copied ? "Address copied" : "Copy address"}<span>↗</span></button>
        <button type="button" onClick={() => { disconnect(); setIsOpen(false); }}>Disconnect<span>→</span></button>
      </div>}
    </div>;
  }

  return <div className="wallet-control">
    <button className="wallet-button" type="button" onClick={() => setIsOpen((value) => !value)} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Connect wallet"}</button>
    {isOpen && <div className="wallet-menu" role="dialog" aria-label="Choose a Starknet wallet">
      {wallets.length > 0 ? wallets.map((wallet) => <button key={wallet.name} type="button" onClick={() => { void connect(wallet); setIsOpen(false); }}>{wallet.name}<span>Connect →</span></button>) : <p>No Starknet wallet found. Install <a href="https://www.ready.co/" target="_blank" rel="noreferrer">Ready</a> to use private actions.</p>}
      {error && <small>{error}</small>}
      {walletName && <small>Last wallet: {walletName}</small>}
    </div>}
  </div>;
}
