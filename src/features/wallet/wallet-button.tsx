"use client";

import { useState } from "react";

import { useWallet } from "./wallet-provider";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletButton() {
  const { address, connect, disconnect, error, isConnecting, walletName, wallets } = useWallet();
  const [isOpen, setIsOpen] = useState(false);

  if (address) {
    return <button className="wallet-button wallet-button--connected" type="button" onClick={disconnect} title="Disconnect wallet"><span />{shortenAddress(address)}</button>;
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
