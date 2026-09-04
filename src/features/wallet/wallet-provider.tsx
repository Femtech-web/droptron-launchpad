"use client";

import { createStore, type Store } from "@starknet-io/get-starknet-discovery";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import { WalletAccountV6, walletV6 } from "starknet";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useToast } from "@/features/feedback/toast-provider";
import {
  DROPTON_NETWORKS,
  networkFromChainId,
  rpcUrlForChain,
  type DroptronNetwork,
} from "./wallet-networks";
import { productErrorMessage } from "./product-error";

type PrivacyStatus = "idle" | "checking" | "supported" | "unsupported";

type WalletContextValue = {
  address: string | null;
  chainId: string | null;
  error: string | null;
  isConnecting: boolean;
  isSwitchingNetwork: boolean;
  networkError: string | null;
  privacyStatus: PrivacyStatus;
  walletAccount: WalletAccountV6 | null;
  walletName: string | null;
  connectionRequestId: number;
  wallets: readonly WalletWithStarknetFeatures[];
  connect: (wallet: WalletWithStarknetFeatures) => Promise<void>;
  disconnect: () => void;
  switchNetwork: (network: DroptronNetwork) => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);
const REQUIRED_WALLET_API = [0, 10, 3] as const;
const LAST_WALLET_KEY = "droptron.wallet.v1";
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

function walletIdentity(address: string, chainId: string | null) {
  let canonicalAddress = address.toLowerCase();
  try { canonicalAddress = `0x${BigInt(address).toString(16)}`; } catch { /* Keep the wallet value. */ }
  const canonicalChain = networkFromChainId(chainId) ?? chainId?.replace(/^starknet:/, "") ?? "";
  return `${canonicalAddress}:${canonicalChain}`;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const showToast = useToast();
  const storeRef = useRef<Store | null>(null);
  const hasAttemptedRestoreRef = useRef(false);
  const walletIdentityRef = useRef<string | null>(null);
  const [wallets, setWallets] = useState<readonly WalletWithStarknetFeatures[]>(
    []
  );
  const [activeWallet, setActiveWallet] =
    useState<WalletWithStarknetFeatures | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [privacyStatus, setPrivacyStatus] = useState<PrivacyStatus>("idle");
  const [walletAccount, setWalletAccount] = useState<WalletAccountV6 | null>(
    null
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [connectionRequestId, setConnectionRequestId] = useState(0);

  useEffect(() => {
    const store = createStore();
    storeRef.current = store;
    setWallets(store.getWallets());
    return store.subscribe(setWallets);
  }, []);

  const disconnect = useCallback(() => {
    window.localStorage.removeItem(LAST_WALLET_KEY);
    walletIdentityRef.current = null;
    setAddress(null);
    setChainId(null);
    setWalletName(null);
    setActiveWallet(null);
    setPrivacyStatus("idle");
    setWalletAccount(null);
    setError(null);
    setNetworkError(null);
  }, []);

  const connectPrivacyAccount = useCallback(
    async (v6Wallet: WalletV6, nextChain: string, supported: boolean) => {
      if (!supported) {
        setWalletAccount(null);
        return;
      }
      const rpcUrl = rpcUrlForChain(nextChain);
      if (!rpcUrl || rpcUrl === "your_testnet_rpc_url") {
        setWalletAccount(null);
        return;
      }
      setWalletAccount(
        await WalletAccountV6.connect(
          { nodeUrl: rpcUrl },
          v6Wallet,
          undefined,
          undefined,
          true
        )
      );
    },
    []
  );

  const connectWallet = useCallback(
    async (wallet: WalletWithStarknetFeatures, silentMode = false) => {
      setIsConnecting(true);
      setError(null);
      setPrivacyStatus("checking");

      try {
        // Discovery v6.0.3 currently carries a nested types-js prerelease. The
        // wallet-standard object is runtime-compatible with starknet.js v10.4.0;
        // keep that package seam confined to this adapter.
        const v6Wallet = wallet as unknown as WalletV6;
        const [connection, versions] = await Promise.all([
          walletV6.standardConnect(v6Wallet, silentMode),
          walletV6.supportedWalletApi(v6Wallet),
        ]);
        const nextAddress = connection.accounts[0]?.address;
        const nextChain = connection.accounts[0]?.chains[0];

        if (!nextAddress)
          throw new Error("No account was shared by the wallet.");

        setAddress(nextAddress);
        const normalizedChain = nextChain ? String(nextChain).replace(/^starknet:/, "") : null;
        setChainId(normalizedChain);
        walletIdentityRef.current = walletIdentity(nextAddress, normalizedChain);
        setWalletName(wallet.name);
        setActiveWallet(wallet);
        window.localStorage.setItem(LAST_WALLET_KEY, wallet.name);

        if (!supportsPrivacyWallet(versions)) {
          setPrivacyStatus("unsupported");
          setWalletAccount(null);
          return true;
        }

        setPrivacyStatus("supported");
        await connectPrivacyAccount(v6Wallet, String(nextChain ?? ""), true);
        return true;
      } catch (caught) {
        console.error("[Droptron wallet] connection failed", caught);
        disconnect();
        const nextMessage = productErrorMessage(
          caught,
          "Wallet connection was not completed. Open Ready and try again."
        );
        setError(nextMessage);
        if (!silentMode) showToast({ message: nextMessage, tone: nextMessage.startsWith("Request cancelled") ? "info" : "error" });
        return false;
      } finally {
        setIsConnecting(false);
      }
    },
    [connectPrivacyAccount, disconnect, showToast]
  );

  const connect = useCallback(
    async (wallet: WalletWithStarknetFeatures) => {
      const connected = await connectWallet(wallet, false);
      if (connected) setConnectionRequestId((value) => value + 1);
    },
    [connectWallet]
  );

  useEffect(() => {
    if (hasAttemptedRestoreRef.current || wallets.length === 0) return;
    hasAttemptedRestoreRef.current = true;
    const savedWalletName = window.localStorage.getItem(LAST_WALLET_KEY);
    if (!savedWalletName) return;
    const savedWallet = wallets.find(
      (wallet) => wallet.name === savedWalletName
    );
    if (!savedWallet) {
      window.localStorage.removeItem(LAST_WALLET_KEY);
      return;
    }
    void connectWallet(savedWallet, true);
  }, [connectWallet, wallets]);

  useEffect(() => {
    if (!activeWallet) return;
    const v6Wallet = activeWallet as unknown as WalletV6;
    return walletV6.subscribeWalletEvent(v6Wallet, (change) => {
      const account = change.accounts?.[0];
      if (!account) {
        disconnect();
        return;
      }
      const nextChain = String(account.chains[0] ?? "").replace(
        /^starknet:/,
        ""
      );
      const nextIdentity = walletIdentity(account.address, nextChain);
      const identityChanged = walletIdentityRef.current !== null
        && walletIdentityRef.current !== nextIdentity;
      walletIdentityRef.current = nextIdentity;
      setAddress(account.address);
      setChainId(nextChain || null);
      setNetworkError(null);
      if (identityChanged) setConnectionRequestId((value) => value + 1);
      void connectPrivacyAccount(
        v6Wallet,
        nextChain,
        privacyStatus === "supported"
      ).catch(() => {
        setWalletAccount(null);
        setNetworkError(
          "The wallet changed network, but its RPC connection could not be initialized."
        );
      });
    });
  }, [activeWallet, connectPrivacyAccount, disconnect, privacyStatus]);

  const switchNetwork = useCallback(
    async (network: DroptronNetwork) => {
      if (!activeWallet) return;
      setIsSwitchingNetwork(true);
      setNetworkError(null);
      try {
        const v6Wallet = activeWallet as unknown as WalletV6;
        const changed = await walletV6.switchStarknetChain(
          v6Wallet,
          DROPTON_NETWORKS[network].chainId
        );
        if (!changed) throw new Error("The wallet did not switch networks.");
        const nextChain = String(await walletV6.requestChainId(v6Wallet));
        setChainId(nextChain);
        if (address) {
          const nextIdentity = walletIdentity(address, nextChain);
          if (walletIdentityRef.current !== nextIdentity) {
            walletIdentityRef.current = nextIdentity;
            setConnectionRequestId((value) => value + 1);
          }
        }
        await connectPrivacyAccount(
          v6Wallet,
          nextChain,
          privacyStatus === "supported"
        );
      } catch (caught) {
        console.error("[Droptron wallet] network switch failed", caught);
        const nextMessage = productErrorMessage(
          caught,
          "The network switch was not completed. Open Ready and try again."
        );
        setNetworkError(nextMessage);
        showToast({ message: nextMessage, tone: nextMessage.startsWith("Request cancelled") ? "info" : "error" });
      } finally {
        setIsSwitchingNetwork(false);
      }
    },
    [activeWallet, address, connectPrivacyAccount, privacyStatus, showToast]
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      chainId,
      connectionRequestId,
      error,
      isConnecting,
      isSwitchingNetwork,
      networkError,
      privacyStatus,
      walletAccount,
      walletName,
      wallets,
      connect,
      disconnect,
      switchNetwork,
    }),
    [
      address,
      chainId,
      connectionRequestId,
      connect,
      disconnect,
      error,
      isConnecting,
      isSwitchingNetwork,
      networkError,
      privacyStatus,
      switchNetwork,
      walletAccount,
      walletName,
      wallets,
    ]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider.");
  return value;
}
