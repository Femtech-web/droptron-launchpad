"use client";

import { RpcProvider } from "starknet";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/features/feedback/toast-provider";
import type { ActionKind } from "@/features/privacy/private-action-panel";
import { privateBalanceErrorMessage, walletErrorName } from "@/features/privacy/private-action-errors";
import { privacySetupIssue } from "@/features/privacy/privacy-registration";

import {
  DROP_DECIMALS, formatTokenAmount, MAINNET_DROP_ADDRESS_KEY, SEPOLIA_DROP_ADDRESS_KEY, SEPOLIA_USDC_TOKEN_ADDRESS,
  STRK_DECIMALS, STRK_TOKEN_ADDRESS, USDC_DECIMALS,
} from "./wallet-assets";
import { networkFromChainId, networkLabel, rpcUrlForChain } from "./wallet-networks";
import { useWallet } from "./wallet-provider";

type Asset = { symbol: string; name: string; address: string; decimals: number };
type BalanceMap = Record<string, bigint | null>;

function tokenKey(address: string) {
  try { return BigInt(address).toString(); } catch { return address.toLowerCase(); }
}

function Eye({ hidden }: { hidden: boolean }) {
  return hidden
    ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m3 3 14 14M8.6 5.2A7.5 7.5 0 0 1 10 5c4.2 0 7 5 7 5a13.7 13.7 0 0 1-2.2 2.8M11.8 14.8A7 7 0 0 1 10 15c-4.2 0-7-5-7-5a13.2 13.2 0 0 1 2.3-2.9" /></svg>
    : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10s2.8-5 7-5 7 5 7 5-2.8 5-7 5-7-5-7-5Z" /><circle cx="10" cy="10" r="2.2" /></svg>;
}

function privateBalances(raw: unknown) {
  const response = (raw as { value?: unknown })?.value ?? raw;
  const balances: Record<string, bigint> = {};
  if (!Array.isArray(response)) return balances;
  for (const item of response) {
    const token = (item as { token?: unknown; token_address?: unknown })?.token
      ?? (item as { token_address?: unknown })?.token_address
      ?? (Array.isArray(item) ? item[0] : undefined);
    const amount = (item as { amount?: unknown; balance?: unknown })?.amount
      ?? (item as { balance?: unknown })?.balance
      ?? (Array.isArray(item) ? item[1] : 0);
    try { balances[tokenKey(String(token))] = BigInt(String(amount ?? 0)); } catch { /* Ignore malformed wallet entries. */ }
  }
  return balances;
}

export function WalletBalances({ onAction }: { onAction: (token: string, symbol: string, kind: ActionKind, availableBalance?: bigint) => void }) {
  const { address, chainId, privacyStatus, walletAccount } = useWallet();
  const showToast = useToast();
  const [dropAddress, setDropAddress] = useState<string | null>(null);
  const [publicBalances, setPublicBalances] = useState<BalanceMap>({});
  const [privateValues, setPrivateValues] = useState<Record<string, bigint>>({});
  const [privateLoaded, setPrivateLoaded] = useState(false);
  const [visiblePrivateKeys, setVisiblePrivateKeys] = useState<Set<string>>(() => new Set());
  const [isPublicLoading, setIsPublicLoading] = useState(false);
  const [isPrivateLoading, setIsPrivateLoading] = useState(false);
  const [isPrivateVisible, setIsPrivateVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const network = networkFromChainId(chainId);
  const isSepolia = network === "sepolia";

  useEffect(() => {
    const update = (event?: Event) => setDropAddress(
      event instanceof CustomEvent && typeof event.detail === "string"
        ? event.detail
        : network === "mainnet"
          ? process.env.NEXT_PUBLIC_MAINNET_DROP_TOKEN_ADDRESS?.trim() || window.localStorage.getItem(MAINNET_DROP_ADDRESS_KEY)
          : process.env.NEXT_PUBLIC_SEPOLIA_DROP_TOKEN_ADDRESS?.trim() || window.localStorage.getItem(SEPOLIA_DROP_ADDRESS_KEY),
    );
    update();
    window.addEventListener("droptron:drop-token-deployed", update);
    return () => window.removeEventListener("droptron:drop-token-deployed", update);
  }, [network]);

  const assets = useMemo<Asset[]>(() => {
    const next: Asset[] = [{ symbol: "STRK", name: "Starknet Token", address: STRK_TOKEN_ADDRESS, decimals: STRK_DECIMALS }];
    if (isSepolia) next.push({ symbol: "USDC", name: "USD Coin", address: SEPOLIA_USDC_TOKEN_ADDRESS, decimals: USDC_DECIMALS });
    if (dropAddress) next.push({ symbol: "DROP", name: "Droptron Token", address: dropAddress, decimals: DROP_DECIMALS });
    return next;
  }, [dropAddress, isSepolia]);

  const loadPublicBalances = useCallback(async (preserveMessage = false) => {
    const rpcUrl = rpcUrlForChain(chainId);
    if (!address) return;
    if (!rpcUrl || rpcUrl === "your_testnet_rpc_url") {
      setMessage(`No RPC is configured for ${networkLabel(chainId)}.`);
      return;
    }
    setIsPublicLoading(true);
    if (!preserveMessage) setMessage(null);
    const provider = new RpcProvider({ nodeUrl: rpcUrl });
    const entries = await Promise.all(assets.map(async (asset) => {
      try {
        const result = await provider.callContract({ contractAddress: asset.address, entrypoint: "balance_of", calldata: [address] });
        return [tokenKey(asset.address), BigInt(result[0] ?? 0) + (BigInt(result[1] ?? 0) << BigInt(128))] as const;
      } catch { return [tokenKey(asset.address), null] as const; }
    }));
    setPublicBalances(Object.fromEntries(entries));
    setIsPublicLoading(false);
  }, [address, assets, chainId]);

  useEffect(() => { void loadPublicBalances(); }, [loadPublicBalances]);
  useEffect(() => {
    const refreshAfterPrivateAction = () => {
      // A successful STRK20 action makes the displayed private snapshot stale.
      // Hide it immediately so a later reveal always asks Ready for fresh notes.
      setPrivateValues({});
      setPrivateLoaded(false);
      setVisiblePrivateKeys(new Set());
      setIsPrivateVisible(false);
      setMessage("Balances are updating. Reveal private again after the note has matured.");
      void loadPublicBalances(true);

      // Relayed transactions and RPC indexes can settle shortly after the wallet
      // returns. Refresh the public side once more without exposing private state.
      const delayedRefresh = window.setTimeout(() => void loadPublicBalances(true), 12_000);
      return () => window.clearTimeout(delayedRefresh);
    };

    let cancelDelayedRefresh: (() => void) | undefined;
    const handleAction = () => {
      cancelDelayedRefresh?.();
      cancelDelayedRefresh = refreshAfterPrivateAction();
    };
    window.addEventListener("droptron:private-action-submitted", handleAction);
    return () => {
      cancelDelayedRefresh?.();
      window.removeEventListener("droptron:private-action-submitted", handleAction);
    };
  }, [loadPublicBalances]);
  useEffect(() => {
    setPrivateValues({});
    setPrivateLoaded(false);
    setVisiblePrivateKeys(new Set());
    setIsPrivateVisible(false);
    setMessage(null);
  }, [address, chainId, walletAccount]);

  async function loadPrivateBalances() {
    if (privacyStatus !== "supported" || !walletAccount) {
      setMessage(privacyStatus === "checking" ? "Wallet privacy support is still being checked." : "Connect a STRK20-enabled Ready wallet to read private balances.");
      return false;
    }
    setIsPrivateLoading(true);
    setMessage(null);
    try {
      setPrivateValues(privateBalances(await walletAccount.strk20Balances([])));
      setPrivateLoaded(true);
      return true;
    } catch (error) {
      console.error("[Droptron STRK20] private balance request failed", error);
      const setupIssue = await privacySetupIssue(address, chainId);
      if (walletErrorName(error) === "NOT_REGISTERED" || setupIssue !== "unknown") {
        setPrivateValues({});
        setPrivateLoaded(false);
        const nextMessage = privateBalanceErrorMessage(error, setupIssue);
        setMessage(nextMessage);
        showToast({ message: nextMessage, tone: walletErrorName(error) === "USER_REFUSED_OP" ? "info" : "error" });
        return false;
      } else {
        const nextMessage = privateBalanceErrorMessage(error);
        setMessage(nextMessage);
        showToast({ message: nextMessage, tone: walletErrorName(error) === "USER_REFUSED_OP" ? "info" : "error" });
      }
      return false;
    } finally { setIsPrivateLoading(false); }
  }

  async function togglePrivateBalances() {
    if (isPrivateVisible) {
      setIsPrivateVisible(false);
      return;
    }
    if (!privateLoaded && !await loadPrivateBalances()) return;
    setVisiblePrivateKeys(new Set());
    setIsPrivateVisible(true);
  }

  async function togglePrivateAsset(key: string) {
    if (isPrivateVisible) {
      setIsPrivateVisible(false);
      setVisiblePrivateKeys(new Set(assets.map((asset) => tokenKey(asset.address)).filter((assetKey) => assetKey !== key)));
      return;
    }
    if (visiblePrivateKeys.has(key)) {
      setVisiblePrivateKeys((current) => { const next = new Set(current); next.delete(key); return next; });
      return;
    }
    if (!privateLoaded && !await loadPrivateBalances()) return;
    setVisiblePrivateKeys((current) => new Set(current).add(key));
  }

  return <section className="asset-portfolio" aria-labelledby="asset-portfolio-heading">
    <header>
      <div><p className="app-eyebrow">Balances</p><h2 id="asset-portfolio-heading">Assets</h2></div>
      <div className="asset-portfolio__controls"><button type="button" onClick={() => void loadPublicBalances()} disabled={isPublicLoading}>{isPublicLoading ? "Refreshing…" : "Refresh"}</button><button className="private-visibility" type="button" onClick={() => void togglePrivateBalances()} disabled={isPrivateLoading}><Eye hidden={isPrivateVisible} />{isPrivateLoading ? "Requesting…" : isPrivateVisible ? "Hide private" : "Reveal private"}</button></div>
    </header>
    <div className="asset-table" role="table" aria-label="Wallet assets">
      <div className="asset-table__head" role="row"><span>Asset</span><span>Public</span><span>Private</span><span>Actions</span></div>
      {assets.map((asset) => {
        const key = tokenKey(asset.address);
        const publicValue = publicBalances[key];
        const privateValue = privateValues[key] ?? BigInt(0);
        const privateVisible = isPrivateVisible || visiblePrivateKeys.has(key);
        return <div className="asset-row" role="row" key={key}>
          <div className="asset-name"><i>{asset.symbol.slice(0, 1)}</i><span><strong>{asset.symbol}</strong><small>{asset.name}</small></span></div>
          <div className="asset-amount"><strong>{isPublicLoading && publicValue === undefined ? "—" : publicValue === null || publicValue === undefined ? "—" : formatTokenAmount(publicValue, asset.decimals)}</strong><small>{asset.symbol}</small></div>
          <div className="asset-private-cell"><div className="asset-amount asset-amount--private"><strong>{privateVisible ? formatTokenAmount(privateValue, asset.decimals) : "••••••"}</strong>{privateVisible && <small>{asset.symbol}</small>}</div><button type="button" aria-label={`${privateVisible ? "Hide" : "Reveal"} ${asset.symbol} private balance`} title={`${privateVisible ? "Hide" : "Reveal"} ${asset.symbol} private balance`} disabled={isPrivateLoading} onClick={() => void togglePrivateAsset(key)}><Eye hidden={privateVisible} /></button></div>
          <div className="asset-actions"><button type="button" onClick={() => onAction(asset.address, asset.symbol, "deposit", publicValue ?? undefined)}>Shield</button><button type="button" onClick={() => onAction(asset.address, asset.symbol, "transfer", privateLoaded ? privateValue : undefined)}>Send</button><button type="button" onClick={() => onAction(asset.address, asset.symbol, "withdraw", privateLoaded ? privateValue : undefined)}>Unshield</button></div>
        </div>;
      })}
    </div>
    {message && <div className="asset-portfolio__message" role="status"><span>{message}</span></div>}
  </section>;
}
