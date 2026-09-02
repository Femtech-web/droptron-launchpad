"use client";

import { RpcProvider } from "starknet";
import { useCallback, useEffect, useState } from "react";

import { useWallet } from "./wallet-provider";
import { formatTokenAmount, STRK_TOKEN_ADDRESS } from "./wallet-assets";
import { networkLabel, rpcUrlForChain } from "./wallet-networks";

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

function walletErrorMessage(error: unknown) {
  const explain = (message: string) => message.includes("UNKNOWN_ERROR")
    ? "Ready could not read private state for this account yet. Fund it on Sepolia, complete its first shield, then retry."
    : message;
  if (error instanceof Error && error.message.trim()) return explain(error.message.trim());
  if (typeof error === "string" && error.trim()) return explain(error.trim());
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; error?: { message?: unknown } };
    if (typeof candidate.message === "string" && candidate.message.trim()) return explain(candidate.message.trim());
    if (typeof candidate.error?.message === "string" && candidate.error.message.trim()) return explain(candidate.error.message.trim());
  }
  return "Ready did not return a private balance. Open the wallet and approve the balance request, then try again.";
}

export function WalletBalances() {
  const { address, chainId, privacyStatus, walletAccount } = useWallet();
  const [publicBalance, setPublicBalance] = useState<bigint | null>(null);
  const [privateBalance, setPrivateBalance] = useState<bigint | null>(null);
  const [isPublicLoading, setIsPublicLoading] = useState(false);
  const [isPrivateLoading, setIsPrivateLoading] = useState(false);
  const [isPrivateVisible, setIsPrivateVisible] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [privateError, setPrivateError] = useState<string | null>(null);

  const loadPublicBalance = useCallback(async () => {
    const rpcUrl = rpcUrlForChain(chainId);
    if (!address) return;
    if (!rpcUrl || rpcUrl === "your_testnet_rpc_url") {
      setPublicBalance(null);
      setPublicError(`No RPC is configured for ${networkLabel(chainId)}.`);
      return;
    }
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
  }, [address, chainId]);

  useEffect(() => { void loadPublicBalance(); }, [loadPublicBalance]);

  useEffect(() => {
    setPrivateBalance(null);
    setIsPrivateVisible(false);
    setPrivateError(null);
  }, [address, chainId, walletAccount]);

  async function togglePrivateBalance() {
    if (isPrivateVisible) {
      setIsPrivateVisible(false);
      return;
    }
    if (privateBalance !== null) {
      setIsPrivateVisible(true);
      return;
    }
    if (privacyStatus === "checking") {
      setPrivateError("Wallet privacy support is still being checked.");
      return;
    }
    if (privacyStatus !== "supported") {
      setPrivateError("This wallet can connect to Starknet, but it does not support STRK20 private balance access. Connect Ready or another STRK20-enabled wallet.");
      return;
    }
    if (!walletAccount) {
      setPrivateError("Private balance access is not initialized. If the RPC URL was just added, restart the app and reconnect your wallet.");
      return;
    }
    setIsPrivateLoading(true);
    setPrivateError(null);
    try {
      // The tested STRK20 starter requests every shielded balance and filters
      // locally. Ready X currently follows that request shape; an empty list
      // means "all tokens", not "no tokens".
      const result = await walletAccount.strk20Balances([]);
      setPrivateBalance(privateAmount(result));
      setIsPrivateVisible(true);
    } catch (error) {
      setPrivateError(walletErrorMessage(error));
    } finally {
      setIsPrivateLoading(false);
    }
  }

  return <section className="wallet-balances" aria-labelledby="wallet-balances-heading">
    <header><div><p className="app-eyebrow">Balances</p><h2 id="wallet-balances-heading">STRK</h2></div><button type="button" onClick={() => void loadPublicBalance()} disabled={isPublicLoading}>{isPublicLoading ? "Refreshing…" : "Refresh public"}</button></header>
    <div className="wallet-balances__rows">
      <div><span>Public balance</span><strong>{isPublicLoading && publicBalance === null ? "Loading…" : publicBalance === null ? "—" : formatTokenAmount(publicBalance)} <small>STRK</small></strong><p>Visible on Starknet.</p></div>
      <div><span>Private balance</span><div className="private-balance-value"><strong>{isPrivateLoading ? "Requesting…" : isPrivateVisible && privateBalance !== null ? formatTokenAmount(privateBalance) : "••••••"} {isPrivateVisible && privateBalance !== null && <small>STRK</small>}</strong><button type="button" aria-label={isPrivateVisible ? "Hide private balance" : "Reveal private balance"} title={isPrivateVisible ? "Hide private balance" : "Reveal private balance"} disabled={isPrivateLoading} onClick={() => void togglePrivateBalance()}><Eye hidden={isPrivateVisible} /></button></div><p>Revealed only after wallet approval.</p></div>
    </div>
    {(publicError || privateError) && <p className="wallet-balances__error" role="status">{privateError ?? publicError}</p>}
  </section>;
}
