"use client";

import { RpcProvider } from "starknet";
import { useCallback, useEffect, useState } from "react";

import { useWallet } from "./wallet-provider";
import { formatTokenAmount, STRK_TOKEN_ADDRESS } from "./wallet-assets";

function Eye({ hidden }: { hidden: boolean }) {
  return hidden
    ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m3 3 14 14M8.6 5.2A7.5 7.5 0 0 1 10 5c4.2 0 7 5 7 5a13.7 13.7 0 0 1-2.2 2.8M11.8 14.8A7 7 0 0 1 10 15c-4.2 0-7-5-7-5a13.2 13.2 0 0 1 2.3-2.9" /></svg>
    : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10s2.8-5 7-5 7 5 7 5-2.8 5-7 5-7-5-7-5Z" /><circle cx="10" cy="10" r="2.2" /></svg>;
}

function privateAmount(raw: unknown) {
  const response = (raw as { value?: unknown })?.value ?? raw;
  if (!Array.isArray(response)) return BigInt(0);
  const target = BigInt(STRK_TOKEN_ADDRESS);
  const entry = response.find((item) => {
    const token = (item as { token?: unknown; token_address?: unknown })?.token
      ?? (item as { token_address?: unknown })?.token_address
      ?? (Array.isArray(item) ? item[0] : undefined);
    try { return BigInt(String(token)) === target; } catch { return false; }
  });
  if (!entry) return BigInt(0);
  const amount = (entry as { amount?: unknown; balance?: unknown })?.amount
    ?? (entry as { balance?: unknown })?.balance
    ?? (Array.isArray(entry) ? entry[1] : 0);
  return BigInt(String(amount ?? 0));
}

export function WalletBalances() {
  const { address, privacyStatus, walletAccount } = useWallet();
  const [publicBalance, setPublicBalance] = useState<bigint | null>(null);
  const [privateBalance, setPrivateBalance] = useState<bigint | null>(null);
  const [isPublicLoading, setIsPublicLoading] = useState(false);
  const [isPrivateLoading, setIsPrivateLoading] = useState(false);
  const [isPrivateVisible, setIsPrivateVisible] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [privateError, setPrivateError] = useState<string | null>(null);

  const loadPublicBalance = useCallback(async () => {
    const rpcUrl = process.env.NEXT_PUBLIC_STARKNET_RPC_URL?.trim();
    if (!address || !rpcUrl || rpcUrl === "your_testnet_rpc_url") return;
    setIsPublicLoading(true);
    setPublicError(null);
    try {
      const provider = new RpcProvider({ nodeUrl: rpcUrl });
      const result = await provider.callContract({ contractAddress: STRK_TOKEN_ADDRESS, entrypoint: "balance_of", calldata: [address] });
      const low = BigInt(result[0] ?? 0);
      const high = BigInt(result[1] ?? 0);
      setPublicBalance(low + (high << BigInt(128)));
    } catch {
      setPublicBalance(null);
      setPublicError("Public balance could not be loaded.");
    } finally {
      setIsPublicLoading(false);
    }
  }, [address]);

  useEffect(() => { void loadPublicBalance(); }, [loadPublicBalance]);

  async function togglePrivateBalance() {
    if (isPrivateVisible) {
      setIsPrivateVisible(false);
      return;
    }
    if (privateBalance !== null) {
      setIsPrivateVisible(true);
      return;
    }
    if (!walletAccount) return;
    setIsPrivateLoading(true);
    setPrivateError(null);
    try {
      const result = await walletAccount.strk20Balances([STRK_TOKEN_ADDRESS]);
      setPrivateBalance(privateAmount(result));
      setIsPrivateVisible(true);
    } catch {
      setPrivateError("The wallet did not share the private balance.");
    } finally {
      setIsPrivateLoading(false);
    }
  }

  return <section className="wallet-balances" aria-labelledby="wallet-balances-heading">
    <header><div><p className="app-eyebrow">Balances</p><h2 id="wallet-balances-heading">STRK</h2></div><button type="button" onClick={() => void loadPublicBalance()} disabled={isPublicLoading}>{isPublicLoading ? "Refreshing…" : "Refresh public"}</button></header>
    <div className="wallet-balances__rows">
      <div><span>Public balance</span><strong>{isPublicLoading && publicBalance === null ? "Loading…" : publicBalance === null ? "—" : formatTokenAmount(publicBalance)} <small>STRK</small></strong><p>Visible on Starknet.</p></div>
      <div><span>Private balance</span><div className="private-balance-value"><strong>{isPrivateLoading ? "Requesting…" : isPrivateVisible && privateBalance !== null ? formatTokenAmount(privateBalance) : "••••••"} {isPrivateVisible && privateBalance !== null && <small>STRK</small>}</strong><button type="button" aria-label={isPrivateVisible ? "Hide private balance" : "Reveal private balance"} title={privacyStatus !== "supported" ? "A STRK20-enabled wallet is required" : undefined} disabled={!walletAccount || isPrivateLoading} onClick={() => void togglePrivateBalance()}><Eye hidden={isPrivateVisible} /></button></div><p>Revealed only after wallet approval.</p></div>
    </div>
    {(publicError || privateError) && <p className="wallet-balances__error" role="status">{privateError ?? publicError}</p>}
  </section>;
}
