"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { num, RpcProvider, type STRK20_ACTION } from "starknet";

import { useToast } from "@/features/feedback/toast-provider";
import { submitPrivateActions } from "@/features/privacy/strk20-actions";
import {
  formatTokenAmount,
  knownTokenDetails,
  parseTokenAmount,
} from "@/features/wallet/wallet-assets";
import { networkFromChainId, rpcUrlForChain } from "@/features/wallet/wallet-networks";
import { productErrorMessage } from "@/features/wallet/product-error";
import { useWallet } from "@/features/wallet/wallet-provider";
import type { WorkspaceDraft } from "@/features/workspace/draft-store";

const MAX_U128 = (BigInt(1) << BigInt(128)) - BigInt(1);

function uint256(value: bigint) {
  const mask = (BigInt(1) << BigInt(128)) - BigInt(1);
  return [num.toHex(value & mask), num.toHex(value >> BigInt(128))];
}

function readUint256(values: string[]) {
  return BigInt(values[0] ?? 0) + (BigInt(values[1] ?? 0) << BigInt(128));
}

function helperAddress(chainId: string | null) {
  return networkFromChainId(chainId) === "sepolia"
    ? process.env.NEXT_PUBLIC_SEPOLIA_LAUNCH_PARTICIPATION_ADDRESS?.trim() || null
    : process.env.NEXT_PUBLIC_MAINNET_LAUNCH_PARTICIPATION_ADDRESS?.trim() || null;
}

function explorerTransaction(chainId: string | null, hash: string) {
  const origin = networkFromChainId(chainId) === "sepolia"
    ? "https://sepolia.voyager.online"
    : "https://voyager.online";
  return `${origin}/tx/${hash}`;
}

export function LaunchParticipationPanel({ draft }: { draft: WorkspaceDraft }) {
  const { address, chainId, privacyStatus, walletAccount } = useWallet();
  const showToast = useToast();
  const values = draft.values ?? {};
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<bigint | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const saleDecimals = Number(values.saleDecimals || 18);
  const paymentDecimals = Number(values.paymentDecimals || 18);
  const saleDetails = knownTokenDetails(values.saleToken);
  const paymentDetails = knownTokenDetails(values.paymentToken);
  const saleSymbol = saleDetails?.symbol ?? "tokens";
  const paymentSymbol = paymentDetails?.symbol ?? "payment tokens";
  const amountRaw = useMemo(
    () => parseTokenAmount(amount, saleDecimals),
    [amount, saleDecimals],
  );
  const helper = helperAddress(chainId);
  const now = Date.now();
  const startsAt = new Date(values.startsAt).getTime();
  const endsAt = new Date(values.endsAt).getTime();
  const active = Number.isFinite(startsAt) && Number.isFinite(endsAt) && now >= startsAt && now < endsAt;
  const matchesNetwork = !values.chainId || values.chainId === chainId;

  useEffect(() => {
    if (!values.contractAddress || !amountRaw || amountRaw <= BigInt(0)) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const rpcUrl = rpcUrlForChain(chainId);
    if (!rpcUrl) {
      setQuote(null);
      setQuoteError("This network is not configured.");
      return;
    }

    let cancelled = false;
    setIsQuoting(true);
    setQuoteError(null);
    const timer = window.setTimeout(() => {
      const provider = new RpcProvider({ nodeUrl: rpcUrl });
      void provider.callContract({
        contractAddress: values.contractAddress,
        entrypoint: "quote_exact_sale",
        calldata: uint256(amountRaw),
      }).then((result) => {
        if (cancelled) return;
        const nextQuote = readUint256(result);
        if (amountRaw > MAX_U128 || nextQuote > MAX_U128) {
          setQuote(null);
          setQuoteError("Choose a smaller participation amount.");
          return;
        }
        setQuote(nextQuote);
      }).catch((error) => {
        console.error("[Droptron launch] quote failed", error);
        if (!cancelled) {
          setQuote(null);
          setQuoteError("A live quote is unavailable for this amount.");
        }
      }).finally(() => {
        if (!cancelled) setIsQuoting(false);
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [amountRaw, chainId, values.contractAddress]);

  const blocker = !values.contractAddress || values.funded !== "true"
    ? "This launch is not funded yet."
    : !active
      ? now < startsAt ? "Participation has not opened yet." : "This launch has closed."
      : !address
        ? "Connect Ready to participate privately."
        : !matchesNetwork
          ? "Switch Ready to this launch’s network."
          : privacyStatus !== "supported" || !walletAccount
            ? "Use a privacy-enabled Ready wallet."
            : !helper
              ? "Private participation is awaiting its reviewed helper deployment."
              : null;
  const canSubmit = !blocker && Boolean(amountRaw && amountRaw > BigInt(0) && quote && quote > BigInt(0));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      submissionLock.current
      || !canSubmit
      || !walletAccount
      || !address
      || !helper
      || !values.contractAddress
      || !amountRaw
      || !quote
    ) return;

    submissionLock.current = true;
    setIsSubmitting(true);
    setQuoteError(null);
    try {
      const paymentToken = num.toHex(BigInt(values.paymentToken));
      const saleToken = num.toHex(BigInt(values.saleToken));
      const launch = num.toHex(BigInt(values.contractAddress));
      const helperContract = num.toHex(BigInt(helper));
      const paymentAmount = num.toHex(quote);
      const saleAmount = num.toHex(amountRaw);
      const actions: STRK20_ACTION[] = [
        { type: "withdraw", token: paymentToken, amount: paymentAmount, recipient: helperContract },
        { type: "transfer", token: saleToken, amount: "OPEN", recipient: num.toHex(BigInt(address)) },
        {
          type: "invoke",
          contract: helperContract,
          calldata: [
            paymentToken,
            saleToken,
            paymentAmount,
            saleAmount,
            launch,
            "${openNoteIds[0]}",
            "0x0",
          ],
        },
      ];

      // Catch invalid calldata or a stale quote without submitting anything.
      await walletAccount.strk20PrepareInvoke(actions, true);
      const result = await submitPrivateActions(walletAccount, actions);
      window.dispatchEvent(new CustomEvent("droptron:private-action-submitted", {
        detail: { kind: "launch", transactionHash: result.transaction_hash },
      }));
      setAmount("");
      setQuote(null);
      showToast({
        message: "Private participation submitted. Your allocation will appear after the new note matures.",
        tone: "success",
        href: explorerTransaction(chainId, result.transaction_hash),
        linkLabel: "View transaction",
      });
    } catch (error) {
      console.error("[Droptron launch] private participation failed", error);
      const message = productErrorMessage(
        error,
        "Ready could not complete private participation. No purchase was submitted.",
      );
      setQuoteError(message);
      showToast({
        message,
        tone: message.startsWith("Request cancelled") ? "info" : "error",
      });
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  }

  return <div className="launch-participation">
    <p>Choose how many {saleSymbol} you want. Droptron checks the live price before Ready prepares the private purchase.</p>
    <form onSubmit={submit}>
      <label>
        <span>Amount to receive</span>
        <input
          value={amount}
          onChange={(event) => {
            if (/^\d*(?:\.\d*)?$/.test(event.target.value)) setAmount(event.target.value);
          }}
          placeholder="0.0"
          inputMode="decimal"
          disabled={Boolean(blocker) || isSubmitting}
        />
      </label>
      <div className="launch-participation__quote">
        <span>You pay</span>
        <strong>{isQuoting ? "Checking…" : quote === null ? "—" : `${formatTokenAmount(quote, paymentDecimals)} ${paymentSymbol}`}</strong>
      </div>
      {blocker && <small>{blocker}</small>}
      {!blocker && quoteError && <small className="launch-participation__error" role="alert">{quoteError}</small>}
      <button type="submit" disabled={!canSubmit || isSubmitting || isQuoting}>
        {isSubmitting ? "Complete in Ready…" : "Participate privately"}<span>→</span>
      </button>
    </form>
  </div>;
}
