"use client";

import { useState } from "react";

import { DROPTON_NETWORKS, networkFromChainId, type DroptronNetwork } from "./wallet-networks";
import { useWallet } from "./wallet-provider";

export function NetworkSwitcher() {
  const { address, chainId, isSwitchingNetwork, networkError, switchNetwork } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const current = networkFromChainId(chainId);
  if (!address) return null;

  async function select(network: DroptronNetwork) {
    setIsOpen(false);
    if (network === current) return;
    await switchNetwork(network);
  }

  return <div className="network-switcher">
    <button className="network-switcher__trigger" type="button" onClick={() => setIsOpen((value) => !value)} disabled={isSwitchingNetwork} aria-haspopup="menu" aria-expanded={isOpen}><i />{isSwitchingNetwork ? "Switching…" : current ? DROPTON_NETWORKS[current].label : "Network"}<span>⌄</span></button>
    {isOpen && <div className="network-switcher__menu" role="menu" aria-label="Switch Starknet network">
      {(Object.keys(DROPTON_NETWORKS) as DroptronNetwork[]).map((network) => <button key={network} type="button" role="menuitem" aria-current={network === current ? "true" : undefined} onClick={() => void select(network)}><span><i />{DROPTON_NETWORKS[network].fullLabel}</span>{network === current && <small>Current</small>}</button>)}
      <p>The wallet will ask you to confirm.</p>
    </div>}
    {networkError && <div className="network-switcher__error" role="status">{networkError}</div>}
  </div>;
}
