"use client";

import { createStore, type Store } from "@starknet-io/get-starknet-discovery";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import { WalletAccountV6, walletV6 } from "starknet";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type PrivacyStatus = "idle" | "checking" | "supported" | "unsupported";

type WalletContextValue = {
  address: string | null;
  error: string | null;
  isConnecting: boolean;
  privacyStatus: PrivacyStatus;
  walletAccount: WalletAccountV6 | null;
  walletName: string | null;
  wallets: readonly WalletWithStarknetFeatures[];
  connect: (wallet: WalletWithStarknetFeatures) => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);
const REQUIRED_WALLET_API = [0, 10, 3] as const;
type WalletV6 = Parameters<typeof walletV6.standardConnect>[0];

function supportsPrivacyWallet(versions: readonly string[]) {
  return versions.some((version) => {
    const parts = version.split(".").map(Number);
    for (let index = 0; index < REQUIRED_WALLET_API.length; index += 1) {
      if ((parts[index] ?? 0) > REQUIRED_WALLET_API[index]) return true;
      if ((parts[index] ?? 0) < REQUIRED_WALLET_API[index]) return false;
    }
    return true;
  });
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<Store | null>(null);
  const [wallets, setWallets] = useState<readonly WalletWithStarknetFeatures[]>([]);
  const [address, setAddress] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [privacyStatus, setPrivacyStatus] = useState<PrivacyStatus>("idle");
  const [walletAccount, setWalletAccount] = useState<WalletAccountV6 | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const store = createStore();
    storeRef.current = store;
    setWallets(store.getWallets());
    return store.subscribe(setWallets);
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setWalletName(null);
    setPrivacyStatus("idle");
    setWalletAccount(null);
    setError(null);
  }, []);

  const connect = useCallback(async (wallet: WalletWithStarknetFeatures) => {
    setIsConnecting(true);
    setError(null);
    setPrivacyStatus("checking");

    try {
      // Discovery v6.0.3 currently carries a nested types-js prerelease. The
      // wallet-standard object is runtime-compatible with starknet.js v10.4.0;
      // keep that package seam confined to this adapter.
      const v6Wallet = wallet as unknown as WalletV6;
      const [connection, versions] = await Promise.all([
        walletV6.standardConnect(v6Wallet),
        walletV6.supportedWalletApi(v6Wallet),
      ]);
      const nextAddress = connection.accounts[0]?.address;

      if (!nextAddress) throw new Error("No account was shared by the wallet.");

      setAddress(nextAddress);
      setWalletName(wallet.name);

      if (!supportsPrivacyWallet(versions)) {
        setPrivacyStatus("unsupported");
        setWalletAccount(null);
        return;
      }

      setPrivacyStatus("supported");

      const configuredRpcUrl = process.env.NEXT_PUBLIC_STARKNET_RPC_URL?.trim();
      const rpcUrl = configuredRpcUrl && configuredRpcUrl !== "your_testnet_rpc_url" ? configuredRpcUrl : undefined;
      if (!rpcUrl) {
        setWalletAccount(null);
        return;
      }

      setWalletAccount(await WalletAccountV6.connect({ nodeUrl: rpcUrl }, v6Wallet, undefined, undefined, true));
    } catch (caught) {
      disconnect();
      setError(caught instanceof Error ? caught.message : "Wallet connection was not completed.");
    } finally {
      setIsConnecting(false);
    }
  }, [disconnect]);

  const value = useMemo<WalletContextValue>(() => ({
    address,
    error,
    isConnecting,
    privacyStatus,
    walletAccount,
    walletName,
    wallets,
    connect,
    disconnect,
  }), [address, connect, disconnect, error, isConnecting, privacyStatus, walletAccount, walletName, wallets]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider.");
  return value;
}
