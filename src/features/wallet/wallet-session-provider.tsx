"use client";

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
import { num, type Signature, type TypedData } from "starknet";

import { useToast } from "@/features/feedback/toast-provider";
import { productErrorMessage } from "./product-error";
import { useWallet } from "./wallet-provider";

type SessionStatus = "idle" | "checking" | "unsigned" | "signing" | "synced" | "unavailable";
type WalletSessionContextValue = {
  status: SessionStatus;
  syncWorkspace: () => Promise<boolean>;
};

const WalletSessionContext = createContext<WalletSessionContextValue | null>(null);

function sameAddress(left: string, right: string) {
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
}

function signatureParts(signature: Signature) {
  if (Array.isArray(signature)) return signature.map((part) => num.toHex(BigInt(part)));
  if ("r" in signature && "s" in signature) {
    return [num.toHex(BigInt(signature.r)), num.toHex(BigInt(signature.s))];
  }
  throw new Error("Ready returned an unsupported signature format.");
}

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const body = await response.text();
  if (!body) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error("Workspace sync returned an invalid server response.");
  }
}

export function WalletSessionProvider({ children }: { children: ReactNode }) {
  const { address, chainId, connectionRequestId, walletAccount } = useWallet();
  const showToast = useToast();
  const [status, setStatus] = useState<SessionStatus>("idle");
  const handledConnectionRef = useRef(0);

  const checkSession = useCallback(async () => {
    if (!address || !chainId) {
      setStatus("idle");
      return;
    }
    setStatus("checking");
    try {
      const response = await fetch("/api/auth/wallet/session", { cache: "no-store" });
      if (!response.ok) throw new Error("Workspace sync is unavailable.");
      const { session } = await response.json() as {
        session: { chainId: string; walletAddress: string } | null;
      };
      const normalizedChain = chainId.replace(/^starknet:/i, "").toUpperCase();
      setStatus(
        session && session.chainId === normalizedChain && sameAddress(session.walletAddress, address)
          ? "synced"
          : "unsigned",
      );
    } catch {
      setStatus("unavailable");
    }
  }, [address, chainId]);

  useEffect(() => { void checkSession(); }, [checkSession]);

  const syncWorkspace = useCallback(async () => {
    if (!address || !chainId || !walletAccount || status === "signing") return false;
    setStatus("signing");
    try {
      const challengeResponse = await fetch("/api/auth/wallet/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, chainId }),
      });
      const challengeBody = await readJsonResponse<{
        challenge?: { challengeId: string };
        error?: string;
        typedData?: TypedData;
      }>(challengeResponse);
      if (!challengeResponse.ok || !challengeBody?.challenge || !challengeBody.typedData) {
        throw new Error(challengeBody?.error ?? "Could not start workspace sync.");
      }

      const signature = await walletAccount.signMessage(challengeBody.typedData);
      const verifyResponse = await fetch("/api/auth/wallet/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: challengeBody.challenge.challengeId,
          signature: signatureParts(signature),
        }),
      });
      const verified = await readJsonResponse<{ error?: string }>(verifyResponse);
      if (!verifyResponse.ok) throw new Error(verified?.error ?? "Workspace sync could not be completed.");

      setStatus("synced");
      showToast({ message: "Workspace sync enabled.", tone: "success" });
      return true;
    } catch (error) {
      console.error("[Droptron session] workspace sign-in failed", error);
      const message = productErrorMessage(error, "Workspace sync was not completed.");
      setStatus("unsigned");
      showToast({ message, tone: message.startsWith("Request cancelled") ? "info" : "error" });
      return false;
    }
  }, [address, chainId, showToast, status, walletAccount]);

  useEffect(() => {
    if (
      connectionRequestId === 0
      || connectionRequestId === handledConnectionRef.current
      || status !== "unsigned"
      || !walletAccount
    ) return;
    handledConnectionRef.current = connectionRequestId;
    void syncWorkspace();
  }, [connectionRequestId, status, syncWorkspace, walletAccount]);

  const value = useMemo(() => ({ status, syncWorkspace }), [status, syncWorkspace]);
  return <WalletSessionContext.Provider value={value}>{children}</WalletSessionContext.Provider>;
}

export function useWalletSession() {
  const value = useContext(WalletSessionContext);
  if (!value) throw new Error("useWalletSession must be used inside WalletSessionProvider.");
  return value;
}
