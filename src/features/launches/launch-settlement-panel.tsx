"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RpcProvider } from "starknet";

import { useToast } from "@/features/feedback/toast-provider";
import { formatTokenAmount, parseTokenAmount } from "@/features/wallet/wallet-assets";
import { networkFromChainId, rpcUrlForChain } from "@/features/wallet/wallet-networks";
import { productErrorMessage } from "@/features/wallet/product-error";
import { useWallet } from "@/features/wallet/wallet-provider";
import type { WorkspaceDraft } from "@/features/workspace/draft-store";

type SettlementState = {
  sold: bigint;
  raised: bigint;
  saleBalance: bigint;
  paymentBalance: bigint;
  closed: boolean;
};

function readUint256(values: readonly string[], offset = 0) {
  return BigInt(values[offset] ?? 0) + (BigInt(values[offset + 1] ?? 0) << BigInt(128));
}

async function tokenBalance(provider: RpcProvider, token: string, account: string) {
  const result = await provider.callContract({ contractAddress: token, entrypoint: "balance_of", calldata: [account] });
  return readUint256(result);
}

function explorerTransaction(chainId: string | null, transactionHash: string) {
  const origin = networkFromChainId(chainId) === "sepolia" ? "https://sepolia.voyager.online" : "https://voyager.online";
  return `${origin}/tx/${transactionHash}`;
}

export function LaunchSettlementPanel({ draft }: { draft: WorkspaceDraft }) {
  const { chainId, walletAccount } = useWallet();
  const showToast = useToast();
  const [state, setState] = useState<SettlementState | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"proceeds" | "unsold" | null>(null);
  const actionLock = useRef(false);
  const values = draft.values ?? {};
  const contractAddress = values.contractAddress;
  const saleDecimals = Number(values.saleDecimals ?? 18);
  const paymentDecimals = Number(values.paymentDecimals ?? 18);

  const refresh = useCallback(async () => {
    const nodeUrl = rpcUrlForChain(chainId);
    if (!nodeUrl || !contractAddress || !values.saleToken || !values.paymentToken) return;
    setLoading(true);
    try {
      const provider = new RpcProvider({ nodeUrl });
      const [sold, raised, saleBalance, paymentBalance, cancelled] = await Promise.all([
        provider.callContract({ contractAddress, entrypoint: "sold" }),
        provider.callContract({ contractAddress, entrypoint: "raised" }),
        tokenBalance(provider, values.saleToken, contractAddress),
        tokenBalance(provider, values.paymentToken, contractAddress),
        provider.callContract({ contractAddress, entrypoint: "is_cancelled" }),
      ]);
      const soldValue = readUint256(sold);
      const raisedValue = readUint256(raised);
      const allocation = parseTokenAmount(values.saleAllocation, saleDecimals) ?? BigInt(0);
      const limit = parseTokenAmount(values.raiseLimit, paymentDecimals) ?? BigInt(0);
      setState({
        sold: soldValue,
        raised: raisedValue,
        saleBalance,
        paymentBalance,
        closed: BigInt(cancelled[0] ?? 0) !== BigInt(0)
          || Date.now() >= new Date(values.endsAt).getTime()
          || soldValue >= allocation
          || raisedValue >= limit,
      });
    } catch (error) {
      console.error("[Droptron launch] settlement read failed", error);
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [chainId, contractAddress, paymentDecimals, saleDecimals, values.endsAt, values.paymentToken, values.raiseLimit, values.saleAllocation, values.saleToken]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function settle(kind: "proceeds" | "unsold") {
    const available = kind === "proceeds" ? state?.paymentBalance : state?.saleBalance;
    if (!walletAccount || !contractAddress || !state?.closed || !available || available <= BigInt(0) || actionLock.current) return;
    const nodeUrl = rpcUrlForChain(chainId);
    if (!nodeUrl) return;
    actionLock.current = true;
    setWorking(kind);
    try {
      const result = await walletAccount.execute({
        contractAddress,
        entrypoint: kind === "proceeds" ? "withdraw_proceeds" : "recover_unsold",
        calldata: [],
      });
      const provider = new RpcProvider({ nodeUrl });
      await provider.waitForTransaction(result.transaction_hash, { retryInterval: 3_000 });
      await refresh();
      showToast({
        tone: "success",
        message: kind === "proceeds" ? "Launch proceeds returned to your wallet." : "Unsold tokens returned to your wallet.",
        href: explorerTransaction(chainId, result.transaction_hash),
        linkLabel: "View transaction",
      });
    } catch (error) {
      const message = productErrorMessage(error, "The launch settlement action was not completed.");
      showToast({ tone: message.startsWith("Request cancelled") ? "info" : "error", message });
    } finally {
      actionLock.current = false;
      setWorking(null);
    }
  }

  return <section className="launch-settlement" aria-labelledby="launch-settlement-title">
    <header><div><p className="app-eyebrow">Creator settlement</p><h2 id="launch-settlement-title">Close the launch cleanly</h2></div><span>{loading ? "Checking…" : state?.closed ? "Ready" : "After sale"}</span></header>
    <div className="launch-settlement__body">
      <dl>
        <div><dt>Sold</dt><dd>{state ? formatTokenAmount(state.sold, saleDecimals) : "—"}</dd></div>
        <div><dt>Raised</dt><dd>{state ? formatTokenAmount(state.raised, paymentDecimals) : "—"}</dd></div>
        <div><dt>Proceeds available</dt><dd>{state ? formatTokenAmount(state.paymentBalance, paymentDecimals) : "—"}</dd></div>
        <div><dt>Unsold available</dt><dd>{state ? formatTokenAmount(state.saleBalance, saleDecimals) : "—"}</dd></div>
      </dl>
      <div className="launch-settlement__actions">
        <p>{state?.closed ? "Each action uses one wallet confirmation." : `These actions unlock when the sale closes on ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(values.endsAt))}.`}</p>
        <button type="button" disabled={!state?.closed || state.paymentBalance === BigInt(0) || working !== null} onClick={() => void settle("proceeds")}>{working === "proceeds" ? "Withdrawing…" : "Withdraw proceeds"}</button>
        <button type="button" disabled={!state?.closed || state.saleBalance === BigInt(0) || working !== null} onClick={() => void settle("unsold")}>{working === "unsold" ? "Recovering…" : "Recover unsold tokens"}</button>
      </div>
    </div>
  </section>;
}
